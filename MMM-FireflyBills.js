/* global Module moment */

Module.register("MMM-FireflyBills", {
  jsonData: null,
  lastReceived: 0,
  updatingInterval: null,
  lang: null,

  // Default module config.
  defaults: {
    url: "",
    token: null,
    noDataText: "NO DATA",
    updateInterval: 30000,
    animationSpeed: 500,
    descriptiveRow: null
  },

  start() {
    this.lang = this.config.lang || this.language || "en";
    moment.updateLocale(this.lang);
    moment.locale(this.lang);
    this.scheduleUpdate();
  },

  scheduleUpdate() {
    setTimeout(() => this.getJson(), 1000);
    this.updatingInterval = setInterval(() => {
      const ts = parseInt(moment().format("X"), 10);
      if (ts - this.lastReceived > this.updateInterval) {
        this.lastReceived = ts;
        this.getJson();
      }
    }, 1000);
  },

  // Request node_helper to get json from url
  getJson() {
    this.sendSocketNotification("MMM-FireflyBills_GET_JSON", {
      url: this.config.url,
      token: this.config.token
    });
  },

  socketNotificationReceived(notification, payload) {
    if (notification === "MMM-FireflyBills_JSON_RESULT") {
      this.lastReceived = parseInt(moment().format("X"), 10);
      this.jsonData = payload;
      this.updateDom(this.config.animationSpeed);
      setTimeout(() => this.getJson(), 5000);
    }
  },

  // Override dom generator.
  getDom() {
    const wrapper = document.createElement("div");
    wrapper.className = "small";

    if (!this.jsonData) {
      wrapper.innerHTML = "Awaiting bills dates...";
      return wrapper;
    }

    const table = document.createElement("table");
    const tbody = document.createElement("tbody");

    // Check if items is of type array
    if (!(this.jsonData instanceof Array)) {
      wrapper.innerHTML = this.config.noDataText;
      return wrapper;
    }

    this.jsonData.forEach((element) => {
      const row = this.getTableRow(element);
      tbody.appendChild(row);
    });

    // Add in Descriptive Row Header
    if (this.config.descriptiveRow) {
      const header = table.createTHead();
      header.innerHTML = this.config.descriptiveRow;
    }

    table.appendChild(tbody);
    wrapper.appendChild(table);
    return wrapper;
  },

  getTableRow(bill) {
    const row = document.createElement("tr");
    Object.entries(bill).forEach(([k, v]) => {
      const column = document.createElement("td");
      column.classList.add(...this.getColumnClasses(bill, k));
      const value = this.parseValue(k, v);
      const valueToDisplay = this.formatValue(k, value);
      const cellText = document.createTextNode(valueToDisplay);
      column.appendChild(cellText);
      row.appendChild(column);
    });

    row.classList.add(`${bill.paid ? "" : "un"}paid-bill`);
    return row;
  },

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

  parseValue(key, value) {
    moment.updateLocale(this.lang);
    switch (key) {
      case "start_date":
      case "end_date":
        return moment.unix(value).utc();
      default:
        return value;
    }
  },

  formatValue(key, value) {
    moment.locale(this.lang);
    switch (key) {
      case "start_date":
      case "end_date":
        return this.capitalize(value.format("MMM Do"));
      case "paid":
        return "";
      default:
        return `${value}`;
    }
  },

  capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
  },

  getScripts() {
    return [this.file("node_modules/moment/dist/moment.js")];
  },

  // Load stylesheets
  getStyles() {
    return [
      "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css",
      this.file(`./${this.name}.css`)
    ];
  }
});
