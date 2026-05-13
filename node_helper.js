/**
 * @fileoverview MagicMirror node_helper for MMM-FireflyBills.
 *
 * Runs in Node.js (server side). Fetches bill data from the Firefly III REST API
 * and forwards it to the front-end module via socket notifications.
 *
 * Notification protocol:
 *   Front-end → Helper : MMM-FireflyBills_GET_VERSION  { url, token }
 *   Helper → Front-end : MMM-FireflyBills_VERSION      <semver string>
 *   Front-end → Helper : MMM-FireflyBills_GET_BILLS
 *   Helper → Front-end : MMM-FireflyBills_BILLS        BillInput[]
 */

const NodeHelper = require("node_helper");
const Log = require("logger");
const moment = require("moment");
const fs = require("fs");

module.exports = NodeHelper.create({
  name: __dirname.replace("\\", "/").split("/").pop(),

  /** @type {string|null} Base URL for Firefly III API (e.g. http://host/api/v1). */
  baseURL: null,

  /** @type {string|null} Bearer token for Firefly III API. */
  token: null,

  /** @type {string} Log line prefix. */
  logPrefix: null,

  /** @type {Object[]} Cached raw bill objects from the last successful API response. */
  bills: [],

  /** @type {boolean} True after the first successful API response. */
  ready: false,

  /** @type {boolean} True while a getBills() request is in flight. */
  busy: false,

  /** Initializes state on MagicMirror startup or module reload. */
  start() {
    this.baseURL = null;
    this.token = null;
    this.ready = false;
    this.busy = false;
    this.bills = [];
    this.logPrefix = `${this.name} :: `;
    this.log("Helper started");
  },

  /**
   * @param {...*} args - Message parts forwarded to Log.log.
   */
  log(...args) {
    Log.log(this.logPrefix + args[0], ...args.slice(1));
  },

  /**
   * @param {...*} args - Message parts forwarded to Log.info.
   */
  info(...args) {
    Log.info(this.logPrefix + args[0], ...args.slice(1));
  },

  /**
   * @param {...*} args - Message parts forwarded to Log.warn.
   */
  warn(...args) {
    Log.warn(this.logPrefix + args[0], ...args.slice(1));
  },

  /**
   * @param {...*} args - Message parts forwarded to Log.error.
   */
  error(...args) {
    Log.error(this.logPrefix + args[0], ...args.slice(1));
  },

  /**
   * Sends a socket notification to the front-end, prefixing the module name.
   *
   * @param {string} notification - Short notification name (without module prefix).
   * @param {*}      [payload]    - Arbitrary payload.
   */
  notify(notification, payload) {
    this.sendSocketNotification(`${this.name}_${notification}`, payload);
  },

  /**
   * Validates the shape of a parsed Firefly III /bills API response body.
   * Throws if the body is missing or malformed.
   *
   * @param {*} body - Parsed JSON response body from the Firefly III API.
   * @throws {Error} When body.data is absent or not an array/object.
   */
  checkBillsResponse(body) {
    if (
      !body ||
      typeof body !== "object" ||
      !("data" in body) ||
      typeof body.data !== "object"
    )
      throw new Error("Invalid bills response from Firefly III server");
  },

  /**
   * Reads the module version from package.json.
   *
   * @returns {string} Semver version string (e.g. "5.0.0").
   */
  getVersion() {
    const p = JSON.parse(fs.readFileSync(__dirname + "/package.json"));
    return p.version;
  },

  /**
   * Fetches bills from the Firefly III API and updates the internal cache.
   * Uses a 3-year lookback window to capture all historical paid_dates.
   * On error, keeps the existing cache (last known state).
   *
   * @returns {Promise<void>}
   */
  async getBills() {
    try {
      const now = moment().startOf("day");
      const startDate = now.clone().subtract(3, "years").startOf("month");
      const endDate = now.clone().add(90, "days").endOf("month");
      const params = new URLSearchParams({
        start: startDate.format("YYYY-MM-DD"),
        end: endDate.format("YYYY-MM-DD")
      });

      const response = await fetch(`${this.baseURL}/bills?${params}`, {
        headers: { Authorization: `Bearer ${this.token}` }
      });

      if (!response.ok)
        throw new Error(`Firefly III API error: HTTP ${response.status}`);

      const body = await response.json();
      this.checkBillsResponse(body);

      const bills = body.data.filter((b) => b.attributes.active === true);
      if (!this.ready || JSON.stringify(this.bills) !== JSON.stringify(bills)) {
        this.bills = bills;
        const found = this.bills.length;
        this.info(`Bills updates received. ${found} bills found`);
      }
      this.ready = true;
    } catch (err) {
      this.warn("Can't get bills data — keeping last known state");
      this.error(err);
    } finally {
      this.busy = false;
    }
  },

  /**
   * Sends the cached bills to the front-end, flattening Firefly III attributes.
   */
  sendBills() {
    this.notify(
      "BILLS",
      this.bills.map((b) => ({ id: b.id, ...b.attributes }))
    );
  },

  /**
   * Handles incoming notifications from the front-end module.
   *
   * GET_VERSION : Stores the API base URL and token, then replies with the module version.
   * GET_BILLS   : If busy, sends cached bills. Otherwise triggers a fresh
   *               API fetch and sends results when complete.
   *
   * @param {string} notification - Notification name (module prefix already stripped).
   * @param {*}      [payload]    - Notification payload.
   */
  notificationReceived(notification, payload) {
    switch (notification) {
      case "GET_VERSION":
        this.baseURL = `${payload.url}/api/v1`;
        this.token = payload.token;
        this.notify("VERSION", this.getVersion());
        break;
      case "GET_BILLS":
        if (!this.baseURL) {
          return;
        }
        if (this.busy) {
          this.sendBills();
          return;
        }

        this.busy = true;
        this.getBills()
          .then(() => void 0)
          .catch(() => void 0)
          .finally(() => {
            this.busy = false;
            this.sendBills();
          });
        break;
      default:
        break;
    }
  },

  /**
   * MagicMirror socket notification entry point.
   * Strips the module-name prefix before delegating to notificationReceived.
   *
   * @param {string} notification - Full notification name including module prefix.
   * @param {*}      [payload]    - Notification payload.
   */
  socketNotificationReceived(notification, payload) {
    this.notificationReceived(
      notification.replace(`${this.name}_`, ""),
      payload || null
    );
  }
});
