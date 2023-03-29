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
        const results = items.map((item) => {
          let nextPayDate;
          if (item.attributes.pay_dates.length > 0) {
            nextPayDate = moment(
              item.attributes.pay_dates[0],
              "YYYY-MM-DD"
            ).format("MMM DD");
          } else {
            nextPayDate = moment().add(1, "month").format("MMM");
          }
          return {
            paid: item.attributes.paid_dates.length > 0,
            name: item.attributes.name,
            date: nextPayDate.format("MMM DD")
          };
        });
        Log.log(`Bills data received. ${results.length} bills found`);
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
