const NodeHelper = require("node_helper");
const Log = require("logger");
const axios = require("axios");
const moment = require("moment");
const fs = require("fs");
const path = require("path");

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
  bills: [],

  start() {
    this.bills = [];
    this.logPrefix = `${this.name} :: `;
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
    Log.error(this.logPrefix + args[0], ...args.slice(1));
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

  getVersion() {
    const p = JSON.parse(fs.readFileSync(__dirname + "/package.json"));
    return p.version;
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
        const bills = response.data.data.filter(
          (b) => b.attributes.active === true
        );
        const found = bills.length;
        this.info(`Bills data received. ${found} bills found`);
        this.bills = bills;
      })
      .catch((..._) => {
        this.warn("Can't get bills data");
        this.bills = [];
        this.error(_);
      })
      .finally(() => {
        this.notify(
          "BILLS",
          this.bills.map((b) => ({ id: b.id, ...b.attributes }))
        );

        this.busy = false;
      });
  },

  notificationReceived(notification, payload) {
    switch (notification) {
      case "GET_VERSION":
        this.notify("VERSION", this.getVersion());
        this.client = axios.create({
          baseURL: `${payload.url}/api/v1/`,
          headers: {
            Authorization: `Bearer ${payload.token}`
          }
        });
        this.getBills();
        break;
      case "GET_BILLS":
        if (this.busy) {
          this.busy = true;
          this.getBills();
        }
        break;
      default:
        break;
    }
  },

  // Subclass socketNotificationReceived received.
  socketNotificationReceived(notification, payload) {
    this.notificationReceived(
      notification.replace(`${this.name}_`, ""),
      payload || null
    );
  }
});
