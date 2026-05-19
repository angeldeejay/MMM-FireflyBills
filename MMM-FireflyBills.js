/**
 * @fileoverview MagicMirror front-end module for MMM-FireflyBills.
 *
 * Displays upcoming and recently-paid bills fetched from a Firefly III instance.
 * Runs in the browser; communicates with node_helper.js via socket notifications.
 *
 * Notification protocol:
 *   Module → Helper : MMM-FireflyBills_GET_VERSION  { url, token }
 *   Helper → Module : MMM-FireflyBills_VERSION      <semver string>
 *   Module → Helper : MMM-FireflyBills_GET_BILLS
 *   Helper → Module : MMM-FireflyBills_BILLS        BillInput[]
 */

/* global Module */
/* global BillParser */

Module.register("MMM-FireflyBills", {
  name: "MMM-FireflyBills",

  /** @type {import("../lib/billParser").ParsedBill[]|null} Last parsed bill list, or null before first load. */
  jsonData: null,

  /** @type {string|null} Current locale language code. */
  lang: null,

  /**
   * Default module configuration.
   *
   * @type {Object}
   * @property {string}  url              - Firefly III base URL (e.g. "http://192.168.0.2:9696").
   * @property {string|null} token        - Firefly III personal access token.
   * @property {string}  noDataText       - Text shown when the API returns no data.
   * @property {number}  updateInterval   - Milliseconds between bill refreshes (default 30 s).
   * @property {number}  animationSpeed   - DOM update animation duration in ms.
   * @property {string|null} descriptiveRow - Optional HTML string for the table header row.
   * @property {{weeks: number}} almost   - Window before nextDue that triggers the "almost due" state.
   * @property {{weeks: number}} paid     - Pre-payment window before lastDue that counts as paid.
   */
  defaults: {
    url: "",
    token: null,
    noDataText: "NO DATA",
    updateInterval: 30000,
    animationSpeed: 500,
    descriptiveRow: null,
    almost: {
      weeks: -1
    },
    paid: {
      weeks: -3
    }
  },

  /** @type {Worker|null} Bill-parsing worker (offloads parseBills + diff from main thread). */
  worker: null,

  /** Merges user config with defaults, spawns the parsing worker, and triggers the initial version handshake. */
  start() {
    this.config = { ...this.defaults, ...this.config };
    this.lang = (typeof config !== "undefined" && config.language) || null;
    this.spawnWorker();
    this.getVersion();
  },

  /** Creates the bill-parsing Web Worker and wires its onmessage handler. */
  spawnWorker() {
    try {
      this.worker = new Worker(this.file("lib/billWorker.js"));
    } catch (err) {
      console.error(`${this.name} :: Worker spawn failed: ${err}`);
      this.worker = null;
      return;
    }
    this.worker.onmessage = (event) => {
      const data = event.data || {};
      if (data.error) {
        console.error(`${this.name} :: worker error: ${data.error}`);
      } else if (!data.unchanged && Array.isArray(data.parsed)) {
        this.jsonData = data.parsed;
        this.updateDom(this.config.animationSpeed);
      }
      setTimeout(() => this.getBills(), this.config.updateInterval);
    };
    this.worker.onerror = (e) => {
      console.error(`${this.name} :: worker fatal: ${e.message}`);
    };
  },

  /** Sends GET_VERSION to the helper to initialize the Firefly III HTTP client. */
  getVersion() {
    const { url, token } = this.config;
    this.notify("GET_VERSION", { url, token });
  },

  /** Requests a fresh bill list from the helper. */
  getBills() {
    this.notify("GET_BILLS");
  },

  /**
   * Sends a socket notification to the node_helper, prefixing the module name.
   *
   * @param {string} notification - Short notification name.
   * @param {*}      [payload]    - Arbitrary payload.
   */
  notify(notification, payload) {
    this.sendSocketNotification(`${this.name}_${notification}`, payload);
  },

  /**
   * Parses a single bill using the shared BillParser library.
   *
   * @param {import("../lib/billParser").BillInput} bill - Raw bill from Firefly III.
   * @param {moment.Moment} now - Current date.
   * @returns {import("../lib/billParser").ParsedBill}
   */
  parseBill(bill, now) {
    return BillParser.parseBill(bill, now, this.config);
  },

  /**
   * Parses and sorts an array of bills using the shared BillParser library.
   *
   * @param {import("../lib/billParser").BillInput[]} data - Raw bills from Firefly III.
   * @param {moment.Moment} now - Current date.
   * @returns {import("../lib/billParser").ParsedBill[]}
   */
  parseBills(data, now) {
    return BillParser.parseBills(data, now, this.config);
  },

  /**
   * Handles socket notifications from the node_helper.
   *
   * VERSION : Logs the module version and immediately requests the bill list.
   * BILLS   : Parses the payload, updates the DOM if data changed, then
   *           schedules the next refresh after updateInterval ms.
   *
   * @param {string} notification - Full notification name including module prefix.
   * @param {*}      payload      - Notification payload.
   */
  socketNotificationReceived(notification, payload) {
    switch (notification) {
      case `${this.name}_VERSION`:
        console.log(`${this.name} :: Version: ${payload}`);
        this.getBills();
        break;
      case `${this.name}_BILLS`: {
        if (this.worker) {
          this.worker.postMessage({
            raw: payload,
            config: this.config,
            lang: this.lang,
            ts: Date.now()
          });
        } else {
          // Fallback: worker unavailable, parse on main thread (legacy path).
          const jsonData = this.parseBills(payload, moment());
          if (
            !this.jsonData ||
            JSON.stringify(this.jsonData) !== JSON.stringify(jsonData)
          ) {
            this.jsonData = jsonData;
            this.updateDom(this.config.animationSpeed);
          }
          setTimeout(() => this.getBills(), this.config.updateInterval);
        }
        break;
      }
      default:
        break;
    }
  },

  /**
   * Builds the module DOM. Returns a table of bills or a placeholder text.
   *
   * @returns {HTMLElement} The wrapper div to render.
   */
  getDom() {
    const wrapper = document.createElement("div");
    wrapper.className = "small";

    if (!this.jsonData) {
      wrapper.innerHTML = "Awaiting bills dates...";
      return wrapper;
    }

    const table = document.createElement("table");
    const tbody = document.createElement("tbody");

    if (!(this.jsonData instanceof Array)) {
      wrapper.innerHTML = this.config.noDataText;
      return wrapper;
    }

    this.jsonData.forEach((element) => {
      tbody.appendChild(this.getTableRow(element));
    });

    if (this.config.descriptiveRow) {
      const header = table.createTHead();
      header.innerHTML = this.config.descriptiveRow;
    }

    table.appendChild(tbody);
    wrapper.appendChild(table);
    return wrapper;
  },

  /**
   * Builds a table row element for a single parsed bill.
   *
   * @param {import("../lib/billParser").ParsedBill} bill - Parsed bill data.
   * @returns {HTMLTableRowElement}
   */
  getTableRow(bill) {
    const row = document.createElement("tr");
    Object.entries(bill).forEach(([k, v]) => {
      if (k === "due") {
        const value = !!v;
        row.classList[value ? "add" : "remove"]("due");
      } else {
        const column = document.createElement("td");
        column.classList.add(...this.getColumnClasses(bill, k));
        const value = v;
        const valueToDisplay = this.formatValue(k, value);
        const cellText = document.createTextNode(valueToDisplay);
        column.appendChild(cellText);
        column.classList[valueToDisplay === "-" ? "add" : "remove"]("center");
        row.appendChild(column);
      }
    });

    row.classList.add(`${bill.paid ? "" : "un"}paid-bill`);
    return row;
  },

  /**
   * Returns CSS class names for a table cell based on the bill key.
   *
   * @param {import("../lib/billParser").ParsedBill} bill - Parsed bill data.
   * @param {string} key - Property name of the cell.
   * @returns {string[]} Array of CSS class names.
   */
  getColumnClasses(bill, key) {
    const classes = ["cell", `${key.replace("_", "-")}-cell`];
    switch (key) {
      case "paid":
        classes.push(bill.paid ? "paid" : "unpaid");
        break;
      default:
    }
    return classes;
  },

  /**
   * Formats a bill property value for display in the table cell.
   *
   * @param {string} key   - Property name (e.g. "last_payment", "paid").
   * @param {*}      value - Raw property value.
   * @returns {string} Display string; "-" for null date fields, "" for the paid icon cell.
   */
  formatValue(key, value) {
    switch (key) {
      case "last_payment":
      case "expected_date":
        return value ? this.capitalize(value) : "-";
      case "paid":
        return "";
      default:
        return `${value}`;
    }
  },

  /**
   * Uppercases the first character of a string.
   *
   * @param {string} str - Input string.
   * @returns {string} String with first character uppercased.
   */
  capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
  },

  /**
   * Returns the stylesheets required by this module.
   *
   * @returns {string[]} Array of stylesheet paths/URLs.
   */
  getStyles() {
    return [
      this.file("node_modules/@fortawesome/fontawesome-free/css/all.min.css"),
      `${this.name}.css`
    ];
  },

  /**
   * Returns the client-side scripts required by this module.
   * Loaded in order: moment.js, fast-sort, then billParser.
   *
   * @returns {string[]} Array of script paths.
   */
  getScripts() {
    return [
      "moment.js",
      this.file("node_modules/fast-sort/dist/sort.js"),
      this.file("lib/billParser.js")
    ];
  }
});
