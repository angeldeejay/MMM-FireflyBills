/**
 * @fileoverview Shared test helpers for billParser tests.
 */

const moment = require("moment");

/** Firefly III datetime format used in API responses. */
const FF = "YYYY-MM-DDTHH:mm:ssZZ";

/** Display format for parsed bill dates. */
const OUTPUT_FMT = "MMM DD";

/** Default payment/almost window config matching billParser defaults. */
const cfg = { paid: { weeks: -3 }, almost: { weeks: -1 } };

/**
 * Build a BillInput fixture.
 * @param {string}   dateStr   - Bill start date "YYYY-MM-DD".
 * @param {string[]} paidDates - Optional payment dates "YYYY-MM-DD".
 * @param {string}   name      - Bill name (default "Electric").
 */
function mkBill(dateStr, paidDates = [], name = "Electric") {
  return {
    name,
    date: moment(dateStr, "YYYY-MM-DD").format(FF),
    paid_dates: paidDates.map((d) => ({
      date: moment(d, "YYYY-MM-DD").format(FF)
    }))
  };
}

/**
 * Build a moment representing the start of the given day.
 * @param {string} dateStr - Date "YYYY-MM-DD".
 */
function mkNow(dateStr) {
  return moment(dateStr, "YYYY-MM-DD").startOf("day");
}

module.exports = { FF, OUTPUT_FMT, cfg, mkBill, mkNow };
