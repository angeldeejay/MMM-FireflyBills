/* global Module */

Module.register("MMM-FireflyBills", {
  name: "MMM-FireflyBills",
  jsonData: null,
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
    setInterval(() => this.getBills(), 5000);
    this.getBills();
  },

  getBills() {
    this.notify("GET_BILLS", {
      url: this.config.url,
      token: this.config.token
    });
  },

  notify(notification, payload) {
    this.sendSocketNotification(`${this.name}_${notification}`, payload);
  },

  socketNotificationReceived(notification, payload) {
    switch (notification) {
      case `${this.name}_BILLS`:
        this.jsonData = payload;
        this.updateDom(this.config.animationSpeed);
        break;
      default:
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
      if (k === "due") {
        value = !!v;
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
