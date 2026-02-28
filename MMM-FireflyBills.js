/* global Module */
/* global moment */
/* global fastSort */

const FF_DATETIME_FMT = "YYYY-MM-DDTHH:mm:ssZZ";
const OUTPUT_FMT = "MMM DD";

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

  compareDate(a, b, direction) {
    return direction === "asc" ? a.diff(b, "days") : b.diff(a, "days");
  },

  comparePaid(a, b) {
    return a.paid ? (b.paid ? 0 : 1) : -1;
  },

  compareFields(a, b, f) {
    switch (f) {
      case "paid":
        return this.comparePaid(a, b);
      case "last_payment":
      case "expected_date":
        return this.compareDate(a[f], b[f], "asc");
      case "name":
        return a.name.localeCompare(b.name);
      default:
        return 0;
    }
  },

  sortResults(a, b) {
    // eslint-disable-next-line no-restricted-syntax
    return ["expected_date", "last_payment", "name", "paid"].reduce(
      (acc, f) => acc || this.compareFields(a, b, f),
      0
    );
  },

  notify(notification, payload) {
    this.sendSocketNotification(`${this.name}_${notification}`, payload);
  },

  parseBill(bill, now) {
    const { name, date, paid_dates } = bill;
    const paidDates = [...paid_dates]
      .map((pd) => moment(pd.date, FF_DATETIME_FMT))
      .sort((a, b) => this.compareDate(a, b, "desc"));

    const expectedDate = moment(date, FF_DATETIME_FMT);
    const isBillStarting = expectedDate.isAfter(now) || paidDates.length === 0;
    const lastPayment = paidDates.length > 0 ? paidDates[0] : null;

    if (!isBillStarting) {
      const dayOfMonth = expectedDate.date();
      const lastDayOfMonth =
        moment(expectedDate).endOf("month").startOf("day").date() ===
          dayOfMonth || dayOfMonth >= 30;
      expectedDate.set("year", now.year()).set("month", 0);
      if (lastDayOfMonth) expectedDate.endOf("month").startOf("day");
      while (true) {
        if (!lastPayment || expectedDate.isAfter(lastPayment)) break;
        expectedDate.add(1, "months").set("date", dayOfMonth);
        if (lastDayOfMonth) expectedDate.endOf("month").startOf("day");
      }
    }

    const paidPeriodStart = Object.entries(
      this.config.paid || this.defaults.paid
    ).reduce((acc, [unit, value]) => {
      return acc.add(value, unit);
    }, moment(expectedDate));

    let paid = isBillStarting
      ? true
      : expectedDate.isAfter(now) || lastPayment.isSameOrAfter(paidPeriodStart);

    if (paid) {
      let dueStart = Object.entries(
        this.config.almost || this.defaults.almost
      ).reduce((acc, [unit, value]) => {
        return acc.add(value, unit);
      }, moment(expectedDate));

      if (!isBillStarting && now.isSameOrAfter(dueStart)) {
        expectedDate.add(1, "months");
        dueStart = moment(expectedDate).subtract(1, "weeks");
      }
      if (now.isSameOrAfter(dueStart)) {
        paid = false;
      }
    }

    const due = !paid && now.isSameOrAfter(expectedDate);

    return {
      name,
      last_payment: lastPayment,
      paid,
      expected_date: expectedDate,
      due
    };
  },

  parseBills(data, now) {
    const output = fastSort
      .sort(data.map((b) => this.parseBill(b, now)))
      .by([
        { desc: (b) => b.due },
        { asc: (b) => b.expected_date?.format("X") },
        { asc: (b) => (b.last_payment ? b.last_payment?.format("X") : 0) },
        { asc: (b) => b.paid },
        { asc: (b) => b.name }
      ])
      .map((b) =>
        Object.entries(b).reduce(
          (acc, [k, v]) => ({
            ...acc,
            [k]: moment.isMoment(v)
              ? v.format(OUTPUT_FMT).replaceAll(".", "")
              : v
          }),
          {}
        )
      );
    return output;
  },

  socketNotificationReceived(notification, payload) {
    switch (notification) {
      case `${this.name}_VERSION`:
        console.log(`${this.name} :: Version: ${payload}`);
        this.getBills();
        break;
      case `${this.name}_BILLS`:
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
  },

  getScripts() {
    return ["moment.js", this.file("node_modules/fast-sort/dist/sort.js")];
  }
});
