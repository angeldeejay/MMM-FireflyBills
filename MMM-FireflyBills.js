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
      setTimeout(() => this.getJson(), 1000);
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

  getTableRow(jsonObject) {
    moment.updateLocale(this.lang);
    moment.locale(this.lang);

    const row = document.createElement("tr");
    let paid = false;
    Object.entries(jsonObject).forEach(([key, value]) => {
      const cell = document.createElement("td");
      cell.classList.add("cell", `${key}-cell`);
      let valueToDisplay = "";
      if (key === "paid") {
        paid = value;
        cell.classList.add(`${value === true ? "" : "un"}paid`);
      } else if (["date", "billing_date"].includes(key)) {
        valueToDisplay = this.capitalize(moment(value).format("MMM Do"));
      } else {
        valueToDisplay = value;
      }

      const cellText = document.createTextNode(valueToDisplay);

      if (this.config.size > 0 && this.config.size < 9) {
        const h = document.createElement(`H${this.config.size}`);
        h.appendChild(cellText);
        cell.appendChild(h);
      } else {
        cell.appendChild(cellText);
      }

      row.appendChild(cell);
    });

    row.classList.add(paid ? "paid-bill" : "unpaid-bill");
    return row;
  },

  capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
  },

  // Load stylesheets
  getStyles() {
    return [
      "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css",
      `${this.name}.css`
    ];
  }
});
