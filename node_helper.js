const NodeHelper = require("node_helper");
const Log = require("logger");
const axios = require("axios");
const moment = require("moment");
const fs = require("fs");
const path = require("path");

const FF_DATETIME_FMT = "YYYY-MM-DDTHH:mm:ssZZ";
const MM_CONFIG = path.join(
  path.dirname(path.dirname(__dirname)),
  "config",
  "config.js"
);

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
    Log.log(`${this.logPrefix}Helper started`);
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

  parseDate(date) {
    return moment(date, FF_DATETIME_FMT);
  },

  compareFields(a, b, f) {
    switch (f) {
      case "paid":
        return this.comparePaid(a, b);
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
    for (const f of ["paid", "expected_date", "name"]) {
      const ret = this.compareFields(a, b, f);
      if (ret !== 0) {
        return ret;
      }
    }
    return 0;
  },

  getBills() {
    Log.info(`${this.logPrefix}Requesting bills`);
    const now = moment().startOf("day");
    const startDate = now.clone().subtract(1, "year").startOf("month");
    const endDate = now.clone().add(45, "days").endOf("month");
    this.client
      .get("/bills", {
        params: {
          start: startDate.format("YYYY-MM-DD"),
          end: endDate.format("YYYY-MM-DD")
        }
      })
      .then((response) => {
        if (
          typeof response === "undefined" ||
          response === null ||
          typeof response.data === "undefined" ||
          response.data === null ||
          typeof response.data.data === "undefined" ||
          !["array", "object"].includes(typeof response.data.data)
        ) {
          Log.warn(`${this.logPrefix}Can't get bills data`);
          this.busy = false;
          return;
        }

        Log.info(
          `${this.logPrefix}Bills data received. ${response.data.data.length} bills found`
        );
        const parsedBills = response.data.data
          .map((b) => {
            const bill = { id: b.id, ...b.attributes };
            const paidDates = [...bill.paid_dates]
              .map((pd) => this.parseDate(pd.date))
              .sort((a, b) => this.compareDate(a, b, "desc"));

            const ref1 = this.parseDate(bill.date);
            const ref2 =
              paidDates.length > 0
                ? paidDates[0]
                : now.subtract(1, "month").startOf("month");

            let offset = 0;
            while (ref1.clone().add(offset, "month") < ref2) {
              offset++;
            }
            const expectedDate = ref1.clone().add(offset, "months");
            const lastExpectedDate = ref1.clone().add(offset - 1, "months");
            const paidThisPeriod = paidDates.filter((d) =>
              d.isSameOrAfter(lastExpectedDate)
            ).length;
            const lastPayment = paidThisPeriod > 0 ? paidDates[0] : null;
            if (lastPayment) expectedDate.add(1, "months");
            const remaining = now.diff(
              expectedDate.clone().subtract(1, "week"),
              "days"
            );
            const paid = remaining < 0;

            return {
              name: bill.name,
              last_payment: lastPayment,
              paid,
              expected_date: expectedDate
            };
          })
          .sort((a, b) => this.sortResults(a, b))
          .map((b) =>
            Object.entries(b).reduce(
              (acc, [k, v]) => ({
                ...acc,
                [k]: moment.isMoment(v) ? v.format("MMM Do") : v
              }),
              {}
            )
          );
        Log.info(
          `${this.logPrefix}Data processed for ${parsedBills.length} bills`
        );
        this.notify("BILLS", parsedBills);
      })
      .catch((..._) => {
        Log.warn(`${this.logPrefix}Can't get bills data`);
        Log.error(_);
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
