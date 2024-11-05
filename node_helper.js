const NodeHelper = require("node_helper");
const Log = require("logger");
const axios = require("axios");
const moment = require("moment");
const fs = require("fs");
const path = require("path");
const FastSort = require("fast-sort");

const FF_DATETIME_FMT = "YYYY-MM-DDTHH:mm:ssZZ";
const OUTPUT_FMT = "MMM DD";

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
    const bill = { id: b.id, ...b.attributes };
    const { name, date, paid_dates } = bill;
    const paidDates = [...paid_dates]
      .map((pd) => moment(pd.date, FF_DATETIME_FMT))
      .sort((a, b) => this.compareDate(a, b, "desc"));

    const expectedDate = moment(date, FF_DATETIME_FMT);
    const isBillStarting = expectedDate.isAfter(now) || paidDates.length === 0;
    const lastPayment = paidDates.length > 0 ? paidDates[0] : null;

    if (!isBillStarting) {
      const dayOfMonth = expectedDate.date();
      expectedDate.set("year", now.year()).set("month", 0);
      while (true) {
        if (!lastPayment || expectedDate.isAfter(lastPayment)) break;
        expectedDate.add(1, "months").set("date", dayOfMonth);
      }
    }

    const paidPeriodStart = moment(expectedDate)
      .subtract(1, "months")
      .subtract(1, "weeks");

    let paid = isBillStarting
      ? true
      : lastPayment.isSameOrAfter(paidPeriodStart);

    if (paid) {
      let dueStart = moment(expectedDate).subtract(1, "weeks");
      if (!isBillStarting && now.isSameOrAfter(dueStart)) {
        expectedDate.add(1, "months");
        dueStart = moment(expectedDate).subtract(1, "weeks");
      }
      if (now.isSameOrAfter(dueStart)) {
        paid = false;
      }
    }

    const due = !paid && now.isSameOrAfter(expectedDate);

    return {
      name,
      last_payment: lastPayment,
      paid,
      expected_date: expectedDate,
      due
    };
  },

  parseBills(data, now) {
    const output = FastSort.sort(data.map((b) => this.parseBill(b, now)))
      .by([
        { desc: (b) => b.due },
        { asc: (b) => b.expected_date?.format("X") },
        { asc: (b) => (b.last_payment ? b.last_payment?.format("X") : 0) },
        { asc: (b) => b.paid },
        { asc: (b) => b.name }
      ])
      .map((b) =>
        Object.entries(b).reduce(
          (acc, [k, v]) => ({
            ...acc,
            [k]: moment.isMoment(v)
              ? v.format(OUTPUT_FMT).replaceAll(".", "")
              : v
          }),
          {}
        )
      );
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
