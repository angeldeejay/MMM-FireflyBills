/* global Module */

Module.register("MMM-FireflyBills", {
  jsonData: null,

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
    this.getJson();
    this.scheduleUpdate();
  },

  scheduleUpdate() {
    const self = this;
    setInterval(() => {
      self.getJson();
    }, this.config.updateInterval);
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
      this.jsonData = payload;
      this.updateDom(this.config.animationSpeed);
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
    const row = document.createElement("tr");
    Object.entries(jsonObject).forEach(([key, value]) => {
      if (key === "pending") return;

      const cell = document.createElement("td");
      let valueToDisplay = "";
      if (key === "paid") {
        cell.classList.add(
          "fa",
          "fa-fw",
          value === true ? "fa-circle-check" : "fa-times-circle"
        );
        cell.style.color = value === true ? "green" : "red";
      } else {
        cell.style.textAlign = key === "name" ? "left" : "right";
        if (key === "name") {
          cell.style.width = "18vw";
        } else {
          cell.classList.add("light");
        }
        cell.style.paddingLeft = "0.5rem";
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
    return row;
  }
});
