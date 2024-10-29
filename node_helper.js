const NodeHelper = require("node_helper");
const Log = require("logger");
const axios = require("axios");
const moment = require("moment");
const fs = require("fs");
const path = require("path");
const FastSort = require("fast-sort");

const FF_DATETIME_FMT = "YYYY-MM-DDTHH:mm:ssZZ";

const MM_CONFIG = [
  path.dirname(path.dirname(__dirname)),
  path.join(path.dirname(__dirname), "MagicMirror")
]
  .map((p) => path.join(p, "config", "config.js"))
  .reduce((acc, p) => (acc ? acc : fs.existsSync(p) ? p : acc), undefined);

Object.defineProperty(Array.prototype, "resolveAll", {
  value: function () {
    return Promise.all(this);
  }
});

module.exports = NodeHelper.create({
  name: __dirname.replace("\\", "/").split("/").pop(),
  client: null,
  logPrefix: null,
  lang: null,

  start() {
    this.logPrefix = `${this.name} :: `;
    this.lang = this.getMmConfig().language || "en";
    moment.updateLocale(this.lang);
    moment.locale(this.lang);
    this.log("Helper started");
  },

  log(...args) {
    Log.log(this.logPrefix + args[0], ...args.slice(1));
  },

  info(...args) {
    Log.info(this.logPrefix + args[0], ...args.slice(1));
  },

  warn(...args) {
    Log.warn(this.logPrefix + args[0], ...args.slice(1));
  },

  error(...args) {
    Log.error(...args);
  },

  getMmConfig() {
    return eval(
      `function __getConfig(){\n${fs.readFileSync(MM_CONFIG, {
        encoding: "utf8"
      })};\nreturn config;\n}\n__getConfig();`
    );
  },

  notify(notification, payload) {
    this.sendSocketNotification(`${this.name}_${notification}`, payload);
  },

  compareDate(a, b, direction) {
    return direction === "asc" ? a.diff(b, "days") : b.diff(a, "days");
  },

  comparePaid(a, b) {
    return a.paid ? (b.paid ? 0 : 1) : -1;
  },

  compareFields(a, b, f) {
    switch (f) {
      case "paid":
        return this.comparePaid(a, b);
      case "last_payment":
      case "expected_date":
        return this.compareDate(a[f], b[f], "asc");
      case "name":
        return a.name.localeCompare(b.name);
      default:
        return 0;
    }
  },

  sortResults(a, b) {
    // eslint-disable-next-line no-restricted-syntax
    return ["expected_date", "last_payment", "name", "paid"].reduce(
      (acc, f) => acc || this.compareFields(a, b, f),
      0
    );
  },

  parseBill(b, now) {
    const parseDate = (date) => {
      return moment(date, FF_DATETIME_FMT);
    };

    const bill = { id: b.id, ...b.attributes };
    const { name, date, paid_dates } = bill;
    const paidDates = [...paid_dates]
      .map((pd) => parseDate(pd.date))
      .sort((a, b) => this.compareDate(a, b, "desc"));

    const expected_date = parseDate(date);
    const is_first_payment = expected_date.isAfter(now);

    if (!is_first_payment) {
      expected_date.set("year", now.year());
      expected_date.set("month", now.month());
    }

    const last_payment = is_first_payment ? null : paidDates[0];

    let due = false;
    let paid = (is_first_payment ? expected_date : last_payment).isBetween(
      expected_date.clone().subtract(1.1, "weeks"),
      undefined,
      undefined,
      "[]"
    );

    if (paid) {
      expected_date.add(1, "months");
      due = false;
    }

    if (!paid && now.isSameOrAfter(expected_date)) {
      due = true;
    } else if (
      paid &&
      expected_date.isSameOrBefore(now.clone().add(4, "days"))
    ) {
      paid = false;
    }

    return { name, last_payment, paid, expected_date, due };
  },

  parseBills(data, now) {
    const output = FastSort.sort(data.map((b) => this.parseBill(b, now)))
      .by([
        { desc: (b) => b.due },
        { asc: (b) => b.expected_date.format("X") },
        { asc: (b) => (b.last_payment ? b.last_payment.format("X") : 0) },
        { asc: (b) => b.paid },
        { asc: (b) => b.name }
      ])
      .map((b) =>
        Object.entries(b).reduce(
          (acc, [k, v]) => ({
            ...acc,
            [k]: moment.isMoment(v) ? v.format("MMM DD").replaceAll(".", "") : v
          }),
          {}
        )
      );
    for (const bill of output) {
      this.log(JSON.stringify(bill));
    }
    return output;
  },

  checkBillsResponse(response) {
    if (
      typeof response === "undefined" ||
      response === null ||
      typeof response.data === "undefined" ||
      response.data === null ||
      typeof response.data.data === "undefined" ||
      !["array", "object"].includes(typeof response.data.data)
    )
      throw new Error("Invalid bills response from Firefly III server");
  },

  getBills() {
    this.info("Requesting bills");
    const now = moment().startOf("day");
    const startDate = now.clone().subtract(1, "year").startOf("month");
    const endDate = now.clone().add(90, "days").endOf("month");
    this.client
      .get("/bills", {
        params: {
          start: startDate.format("YYYY-MM-DD"),
          end: endDate.format("YYYY-MM-DD")
        }
      })
      .then((response) => {
        this.checkBillsResponse(response);
        const rawBills = response.data.data.filter(
          (b) => b.attributes.active === true
        );
        const found = rawBills.length;
        this.info(`Bills data received. ${found} bills found`);
        const parsedBills = this.parseBills(rawBills, now);
        this.info(`Data processed for ${parsedBills.length} bills`);
        this.notify("BILLS", parsedBills);
      })
      .catch((..._) => {
        this.warn("Can't get bills data");
        this.error(_);
      })
      .finally(() => (this.busy = false));
  },

  notificationReceived(notification, payload) {
    switch (notification) {
      case "GET_BILLS":
        if (!this.busy) {
          this.busy = true;
          this.client = axios.create({
            baseURL: `${payload.url}/api/v1/`,
            headers: {
              Authorization: `Bearer ${payload.token}`
            }
          });
          this.getBills();
        }
        break;
      default:
    }
  },

  // Subclass socketNotificationReceived received.
  socketNotificationReceived(notification, payload) {
    this.notificationReceived(
      notification.replace(`${this.name}_`, ""),
      payload
    );
  }
});
