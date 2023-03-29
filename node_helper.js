const NodeHelper = require("node_helper");
const Log = require("logger");
const axios = require("axios");
const moment = require("moment");
require("moment/locale/es");

moment.updateLocale("es");

module.exports = NodeHelper.create({
  start() {
    Log.log("MMM-FireflyBills helper started...");
  },

  compareDate(a, b) {
    // eslint-disable-next-line no-nested-ternary
    return a.date.isAfter(b.date) ? 1 : a.date.isBefore(b.date) ? -1 : 0;
  },

  comparePending(a, b) {
    return b.pending - a.pending;
  },

  comparePaid(a, b) {
    return a.pending - b.pending;
  },

  compareFields(a, b, field) {
    switch (field) {
      case "paid":
        return this.comparePaid(a, b);
      case "pending":
        return this.comparePending(a, b);
      case "date":
        return this.compareDate(a, b);
      default:
        return 0;
    }
  },

  sortResults(a, b) {
    // eslint-disable-next-line no-restricted-syntax
    for (const f of ["paid", "pending", "date"]) {
      const ret = this.compareFields(a, b, f);
      if (ret !== 0) {
        return ret;
      }
    }
    return 0;
  },

  getBills(url, token) {
    const self = this;
    const now = moment().startOf("day");
    const startDate = moment(now).startOf("month");
    const endDate = moment(now).endOf("month");

    axios({
      url: `${url}/api/v1/bills`,
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`
      },
      params: {
        start: startDate.format("YYYY-MM-DD"),
        end: endDate.format("YYYY-MM-DD")
      }
    })
      .then((response) => {
        return response.data.data;
      })
      .then((items) => {
        const results = items
          .map((item) => {
            const nextPayDate = moment(
              item.attributes.next_expected_match,
              "YYYY-MM-DD"
            );
            let paid = false;
            let pending = false;
            if (item.attributes.pay_dates.length > 0) {
              paid = item.attributes.paid_dates.length > 0;
            } else {
              pending = !nextPayDate.isBetween(startDate, endDate);
              paid = !pending;
            }
            return {
              paid,
              pending,
              name: item.attributes.name,
              date: nextPayDate
            };
          })
          .sort((a, b) => {
            // eslint-disable-next-line no-nested-ternary
            return a.date.isAfter(b.date)
              ? 1
              : a.date.isBefore(b.date)
              ? -1
              : 0;
          })
          .map((item) => {
            return {
              ...item,
              date: self.capitalize(item.date.format("MMM Do"))
            };
          });
        Log.log(`Bills data received. ${results.length} bills found`);
        // Log.log(JSON.stringify(results, null, 2));
        self.sendSocketNotification("MMM-FireflyBills_JSON_RESULT", results);
      });
  },

  capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
  },
  // Subclass socketNotificationReceived received.
  socketNotificationReceived(notification, payload) {
    if (notification === "MMM-FireflyBills_GET_JSON") {
      this.getBills(payload.url, payload.token);
    }
  }
});
