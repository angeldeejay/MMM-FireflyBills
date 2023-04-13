const NodeHelper = require("node_helper");
const Log = require("logger");
const axios = require("axios");
const axiosRetry = require("axios-retry");
const moment = require("moment");

module.exports = NodeHelper.create({
  name: __dirname.replace("\\", "/").split("/").pop(),
  busy: false,
  client: null,

  start() {
    Log.log("MMM-FireflyBills helper started...");
  },

  compareDate(a, b, direction) {
    return direction === "asc" ? a - b : b - a;
  },

  comparePaid(a, b) {
    return a.paid - b.paid;
  },

  compareFields(a, b, f) {
    switch (f) {
      case "paid":
        return this.comparePaid(a, b);
      case "start_date":
        return this.compareDate(a[f], b[f], "asc");
      case "end_date":
        return this.compareDate(a[f], b[f], "desc");
      case "name":
        return a.name.localeCompare(b.name);
      default:
        return 0;
    }
  },

  sortResults(a, b) {
    // eslint-disable-next-line no-restricted-syntax
    for (const f of ["paid", "start_date", "end_date", "name"]) {
      const ret = this.compareFields(a, b, f);
      if (ret !== 0) {
        return ret;
      }
    }
    return 0;
  },

  getBillPayments(b) {
    const sDay = moment.utc(b.date, "YYYY-MM-DD").date();
    const eDay = moment.utc(b.end_date, "YYYY-MM-DD").date();
    const nextRangeStart = moment.utc(b.next_expected_match, "YYYY-MM-DD");
    const nextRangeEnd = nextRangeStart
      .clone()
      .date(eDay)
      .add(sDay > eDay ? 1 : 0, "month");
    const lastRangeStart = nextRangeStart.clone().subtract(1, "month");
    const lastRangeEnd = nextRangeStart.clone().subtract(1, "second");
    return this.client
      .get(`/bills/${b.id}`, {
        params: {
          start: lastRangeStart.format("YYYY-MM-DD"),
          end: lastRangeEnd.format("YYYY-MM-DD")
        }
      })
      .then((response) => {
        const { data } = response.data;
        const { attributes } = data;
        return {
          name: attributes.name,
          paid: attributes.paid_dates.length > 0,
          start_date: parseInt(nextRangeStart.format("X"), 10),
          end_date: parseInt(nextRangeEnd.format("X"), 10)
        };
      })
      .catch((..._) => {
        return {
          name: b.name,
          paid: false,
          start_date: parseInt(nextRangeStart.format("X"), 10),
          end_date: parseInt(nextRangeEnd.format("X"), 10)
        };
      });
  },

  getBills() {
    const now = moment.utc().startOf("day");
    const startDate = now.clone().startOf("month");
    const endDate = now.clone().endOf("month");
    this.client
      .get("/bills", {
        params: {
          start: startDate.format("YYYY-MM-DD"),
          end: endDate.format("YYYY-MM-DD")
        }
      })
      .catch((..._) => setTimeout(() => this.getBills(), 1000))
      .then((response) => {
        Log.info(
          `Bills data received. ${response.data.data.length} bills found`
        );
        Promise.all(
          response.data.data
            .map((b) => {
              return { id: b.id, ...b.attributes };
            })
            .map((b) => this.getBillPayments(b))
        ).then((results) => {
          const bills = results.sort((a, b) => this.sortResults(a, b));
          Log.info(`Data processed for ${bills.length} bills`);
          this.sendSocketNotification("MMM-FireflyBills_JSON_RESULT", bills);
          this.busy = false;
        });
      });
  },

  // Subclass socketNotificationReceived received.
  socketNotificationReceived(notification, payload) {
    if (notification === "MMM-FireflyBills_GET_JSON" && this.busy === false) {
      this.busy = true;
      this.client = axios.create({
        baseURL: `${payload.url}/api/v1/`,
        headers: {
          Authorization: `Bearer ${payload.token}`
        }
      });
      Log.info("Requesting bills");
      axiosRetry(this.client, { retries: 10 });
      this.getBills();
    }
  }
});
