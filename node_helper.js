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

    axios({
      url: `${url}/api/v1/bills`,
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`
      }
    })
      .then((response) => {
        return response.data.data;
      })
      .then((items) => {
        const promises = items.map(async (item) => {
          let expDate = moment(item.attributes.date, "YYYY-MM-DD").startOf(
            "day"
          );

          const result = {
            paid: null,
            name: item.attributes.name,
            date: null
          };

          let startDate = moment(expDate, "YYYY-MM-DD").month(now.month());
          while (startDate > now) {
            startDate = startDate.subtract(1, "month");
          }
          const endDate = moment(startDate).add(1, "month");

          while (expDate <= startDate) {
            expDate = expDate.add(1, "month");
          }
          result.date = self.capitalize(expDate.format("MMM DD"));
          await axios({
            url: `${url}/api/v1/bills/${item.id}/transactions`,
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
            .then((transactions) => {
              result.paid = transactions.length > 0;
            });

          return result;
        });

        Promise.all(promises).then((results) => {
          Log.log(`Bills data received. ${results.length} bills found`);
          self.sendSocketNotification("MMM-FireflyBills_JSON_RESULT", results);
        });
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
