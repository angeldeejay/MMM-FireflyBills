const NodeHelper = require("node_helper");
const Log = require("logger");
const axios = require("axios");

module.exports = NodeHelper.create({
  start() {
    Log.log("MMM-FireflyBills helper started...");
  },

  getJson(url) {
    const self = this;

    axios
      .get({
        url,
        method: "GET",
        headers: {
          Authorization:
            "Bearer eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9.eyJhdWQiOiIxIiwianRpIjoiYmIzNDQyZDQ0ZTBjYmQ2ZTY0N2ZmM2RjZGQ0ODU1YWRhYzdiODNmODgyMWI5MzBhYWEzNGIxOTZlZTVjYTllOTFmOTBkYWQ1YWEwYWIxM2UiLCJpYXQiOjE2ODAwNDEyNjMuOTk1MzU0LCJuYmYiOjE2ODAwNDEyNjMuOTk1MzY1LCJleHAiOjE3MTE2NjM2NjMuODQyMDU4LCJzdWIiOiIxIiwic2NvcGVzIjpbXX0.zehTxB18UuGzpvZ2k6zRwhldEUY8P179yfweErOowVZyy8BQ4RbQnRtfChxrGZwolcIyVxGkWLqPfoKlQ4PI8eVv1l59YYcCcc7A0Q8rAsXLBj5xPPxPhYANZA_XlzEwbPixDzgf7XMpGldqT3_-nCU3jDKSgYPJ80KRczsHLbyV_s5SoqnQ0_wuVXoXQpyoZutvF1Wh_1MvqrbwGn6z3uLoxCJajHd36PMDgWcQ1Znf2Jm0DxcwhhkuCcqXoDFugDXpf0tuYI3Oj_lIH0qRmazRefAlDnT8Wm0ip3CdPQhRkJ5dNTmMXoJV81OgGm-P2NHe7P5SGqR5TklySy16BX_YObX7lVmReLyyTlMouPNK_xxmAHis6sVl0VNtalKamR_VEgUKFc9LGb9H4iqVmbLOqjfj-63Qtw7a3vxvlB3dIIPz_OvUS5wFOSDqUDJy0yrDb9qYTMvZbzgSuvUmVpGY7SeFQUthZIlte6Ukld7hyxR4bYlVEC_jzYYcIja88lTBch8I8SE8cf0Q82ECZGgtFZnlwL54v_HbTXF8gFGh6Gcy7RHaIhoN_kjkUVpw7jnPjE70uAuRzX3UW8pU1kOt2n-MRr-_fuygXuYuvkNWJdeFc__YDO6dufm5JC2YEA1ykbklrm3mcmw7mcuJVxTEFYBtkn7l68GaBbwCp_8"
        }
      })
      .then((response) => console.log(typeof response, response));
    // .then((json) => {
    //   // Send the json data back with the url to distinguish it on the receiving part
    //   self.sendSocketNotification("MMM-FireflyBills_JSON_RESULT", {
    //     url,
    //     data: json
    //   });
    // });
  },

  // Subclass socketNotificationReceived received.
  socketNotificationReceived(notification, url) {
    if (notification === "MMM-FireflyBills_GET_JSON") {
      this.getJson(url);
    }
  }
});
