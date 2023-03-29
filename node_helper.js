const NodeHelper = require("node_helper");
const Log = require("logger");
const axios = require("axios");
const moment = require("moment");
require("moment/locale/es");
moment.updateLocale("es");

const token =
  "eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9.eyJhdWQiOiIxIiwianRpIjoiYmIzNDQyZDQ0ZTBjYmQ2ZTY0N2ZmM2RjZGQ0ODU1YWRhYzdiODNmODgyMWI5MzBhYWEzNGIxOTZlZTVjYTllOTFmOTBkYWQ1YWEwYWIxM2UiLCJpYXQiOjE2ODAwNDEyNjMuOTk1MzU0LCJuYmYiOjE2ODAwNDEyNjMuOTk1MzY1LCJleHAiOjE3MTE2NjM2NjMuODQyMDU4LCJzdWIiOiIxIiwic2NvcGVzIjpbXX0.zehTxB18UuGzpvZ2k6zRwhldEUY8P179yfweErOowVZyy8BQ4RbQnRtfChxrGZwolcIyVxGkWLqPfoKlQ4PI8eVv1l59YYcCcc7A0Q8rAsXLBj5xPPxPhYANZA_XlzEwbPixDzgf7XMpGldqT3_-nCU3jDKSgYPJ80KRczsHLbyV_s5SoqnQ0_wuVXoXQpyoZutvF1Wh_1MvqrbwGn6z3uLoxCJajHd36PMDgWcQ1Znf2Jm0DxcwhhkuCcqXoDFugDXpf0tuYI3Oj_lIH0qRmazRefAlDnT8Wm0ip3CdPQhRkJ5dNTmMXoJV81OgGm-P2NHe7P5SGqR5TklySy16BX_YObX7lVmReLyyTlMouPNK_xxmAHis6sVl0VNtalKamR_VEgUKFc9LGb9H4iqVmbLOqjfj-63Qtw7a3vxvlB3dIIPz_OvUS5wFOSDqUDJy0yrDb9qYTMvZbzgSuvUmVpGY7SeFQUthZIlte6Ukld7hyxR4bYlVEC_jzYYcIja88lTBch8I8SE8cf0Q82ECZGgtFZnlwL54v_HbTXF8gFGh6Gcy7RHaIhoN_kjkUVpw7jnPjE70uAuRzX3UW8pU1kOt2n-MRr-_fuygXuYuvkNWJdeFc__YDO6dufm5JC2YEA1ykbklrm3mcmw7mcuJVxTEFYBtkn7l68GaBbwCp_8";

module.exports = NodeHelper.create({
  start() {
    Log.log("MMM-FireflyBills helper started...");
  },

  getBills(url) {
    const self = this;
    const now = moment().startOf("day");

    axios({
      url: url + "/api/v1/bills",
      method: "GET",
      headers: {
        Authorization: "Bearer " + token
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

          let result = {
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
            url: url + "/api/v1/bills/" + item.id + "/transactions",
            method: "GET",
            headers: {
              Authorization: "Bearer " + token
            },
            params: {
              start: startDate,
              end: endDate
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
          self.sendSocketNotification("MMM-FireflyBills_JSON_RESULT", results);
        });
      });
  },

  capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
  },
  // Subclass socketNotificationReceived received.
  socketNotificationReceived(notification, url) {
    if (notification === "MMM-FireflyBills_GET_JSON") {
      this.getBills(url);
    }
  }
});
