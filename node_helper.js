const NodeHelper = require("node_helper");
const Log = require("logger");
const axios = require("axios");
const moment = require("moment");
require("moment/locale/es");

module.exports = NodeHelper.create({
  busy: false,

  start() {
    Log.log("MMM-FireflyBills helper started...");
  },

  compareDate(a, b) {
    // eslint-disable-next-line no-nested-ternary
    return a.date.isAfter(b.date) ? 1 : a.date.isBefore(b.date) ? -1 : 0;
  },

  compareBillingDate(a, b) {
    // eslint-disable-next-line no-nested-ternary
    return a.billing_date.isAfter(b.billing_date)
      ? 1
      : a.billing_date.isBefore(b.billing_date)
      ? -1
      : 0;
  },

  comparePaid(a, b) {
    return a.paid - b.paid;
  },

  compareFields(a, b, field) {
    switch (field) {
      case "paid":
        return this.comparePaid(a, b);
      case "date":
        return this.compareDate(a, b);
      case "billing_date":
        return this.compareBillingDate(a, b);
      case "name":
        return a.name.localeCompare(b.name);
      default:
        return 0;
    }
  },

  sortResults(a, b) {
    // eslint-disable-next-line no-restricted-syntax
    for (const f of ["paid", "billing_date", "date", "name"]) {
      const ret = this.compareFields(a, b, f);
      if (ret !== 0) {
        return ret;
      }
    }
    return 0;
  },

  getBills(url, token) {
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
      .then((response) =>
        response.data.data.map((b) => {
          return { id: b.id, ...b.attributes };
        })
      )
      .then((bs) => {
        const promises = bs.map((b) => {
          const endDay = moment(b.end_date, "YYYY-MM-DD").startOf("day").date();
          const nextBillingDate = moment(
            b.next_expected_match,
            "YYYY-MM-DD"
          ).startOf("day");
          let nextEndDate = moment(nextBillingDate).date(endDay);
          while (nextEndDate.isBefore(nextBillingDate)) {
            nextEndDate = nextEndDate.add(1, "month");
          }
          const rangeStart = moment(nextBillingDate).subtract(1, "month");
          const rangeEnd = moment(nextBillingDate).subtract(1, "day");
          const diff = moment
            .duration(nextEndDate.diff(nextBillingDate))
            .as("days");
          const nextThresholdPayDate = moment(nextBillingDate)
            .add(diff, "days")
            .startOf("day");
          return axios({
            url: `${url}/api/v1/bills/${b.id}`,
            method: "GET",
            headers: {
              Authorization: `Bearer ${token}`
            },
            params: {
              start: rangeStart.format("YYYY-MM-DD"),
              end: rangeEnd.format("YYYY-MM-DD")
            }
          }).then((response) => {
            const { data } = response.data;
            const { attributes } = data;
            return {
              name: attributes.name,
              paid: attributes.paid_dates.length > 0,
              billing_date: nextBillingDate,
              date: nextThresholdPayDate
            };
          });
        });

        Promise.all(promises).then((results) => {
          const bills = results.sort((a, b) => this.sortResults(a, b));
          Log.info(`Bills data received. ${bills.length} bills found`);
          this.sendSocketNotification("MMM-FireflyBills_JSON_RESULT", bills);
          this.busy = false;
        });
      });
  },

  // Subclass socketNotificationReceived received.
  socketNotificationReceived(notification, payload) {
    if (notification === "MMM-FireflyBills_GET_JSON" && this.busy === false) {
      this.busy = true;
      this.getBills(payload.url, payload.token);
    }
  }
});
