/* global Module */
/* global BillParser */

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
    descriptiveRow: null,
    almost: {
      weeks: -1
    },
    paid: {
      weeks: -3
    }
  },

  start() {
    this.config = { ...this.defaults, ...this.config };
    this.getVersion();
  },

  getVersion() {
    const { url, token } = this.config;
    this.notify("GET_VERSION", { url, token });
  },

  getBills() {
    this.notify("GET_BILLS");
  },

  notify(notification, payload) {
    this.sendSocketNotification(`${this.name}_${notification}`, payload);
  },

  parseBill(bill, now) {
    return BillParser.parseBill(bill, now, this.config);
  },

  parseBills(data, now) {
    return BillParser.parseBills(data, now, this.config);
  },

  socketNotificationReceived(notification, payload) {
    switch (notification) {
      case `${this.name}_VERSION`:
        console.log(`${this.name} :: Version: ${payload}`);
        this.getBills();
        break;
      case `${this.name}_BILLS`: {
        const jsonData = this.parseBills(payload, moment());
        if (
          !this.jsonData ||
          JSON.stringify(this.jsonData) !== JSON.stringify(jsonData)
        ) {
          this.jsonData = jsonData;
          this.updateDom(this.config.animationSpeed);
        }
        setTimeout(() => this.getBills(), this.config.updateInterval);
        break;
      }
      default:
        break;
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
      tbody.appendChild(this.getTableRow(element));
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
      this.file("node_modules/@fortawesome/fontawesome-free/css/all.min.css"),
      `${this.name}.css`
    ];
  },

  getScripts() {
    return [
      "moment.js",
      this.file("node_modules/fast-sort/dist/sort.js"),
      this.file("lib/billParser.js")
    ];
  }
});
