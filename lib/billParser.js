/**
 * @fileoverview Bill parsing logic for MMM-FireflyBills.
 *
 * ─── ALGORITHM ───────────────────────────────────────────────────────────────
 *
 * Given a Firefly III bill (date, paid_dates) and the current date (now),
 * determines the next expected payment date and the paid/due status.
 *
 * STEP 1 — dueInMonth(ref)
 *   Calculates the due date within any target month:
 *     due_day = min(bill.dayOfMonth, ref.daysInMonth())
 *   This replicates Firefly's addMonth() clamping: a day-30 bill is due on
 *   the 30th in 31-day months, on the last day of shorter months, and recovers
 *   back to the 30th when the month allows it.
 *   isEndOfMonth is intentionally NOT used — Firefly always uses the literal
 *   day number and clamps, never "end of month."
 *
 * STEP 2 — Locate the current billing window
 *   thisMonthDue = dueInMonth(now)
 *   lastDue = thisMonthDue        if thisMonthDue <= now
 *             dueInMonth(now−1m)  otherwise
 *   nextDue = dueInMonth(lastDue + 1 month)
 *
 * STEP 3 — Payment windows (configurable via paid.weeks / almost.weeks)
 *   paymentWindowStart = lastDue + paid.weeks   (default: lastDue − 3 weeks)
 *     Payments on or after this date cover the lastDue cycle,
 *     including legitimate pre-payments made before lastDue.
 *   advanceWindowStart = nextDue + almost.weeks (default: nextDue − 1 week)
 *     Payments on or after this date are pre-payments for the NEXT cycle.
 *
 *   WHY almost.weeks (−1w) and NOT paid.weeks (−3w) for advance detection:
 *     3 weeks was too wide — it mis-classified payments made right after
 *     lastDue (covering the past cycle) as advance payments for the next one.
 *     1 week correctly captures only payments made just before nextDue:
 *       e.g. paying May 12 for a bill due May 15 → advance → shows Jun 15 ✓
 *       e.g. paying May 12 for a bill due May 30 → covers Apr 30 → shows May 30 ✓
 *
 * STEP 4 — Classification (evaluated in order, first match wins)
 *   PAYMENT CASES FIRST: a real payment beats the bill-status guards.
 *   Before v5.2 the future/new-bill guards (now 3 & 4) ran first and returned
 *   last_payment:null unconditionally — a brand-new bill whose FIRST payment
 *   arrived before its very first due date displayed "-" (no payment) until
 *   that due date passed, even though the payment was recorded in Firefly.
 *   GUARD: payments preempt only when billDate <= nextDue (the bill started,
 *   or starts within the incoming cycle). A bill anchored beyond nextDue has
 *   no obligation yet — its synthetic month-projected due dates would raise
 *   false alarms — so it stays in the quiet future-bill case (3) until real.
 *   1. lastPayment >= advanceWindowStart
 *        Advance payment covering nextDue cycle. expected=nextNextDue.
 *   2. lastPayment >= paymentWindowStart
 *        Covers lastDue cycle. expected=nextDue.
 *   3. billDate > now
 *        Future bill, no qualifying payment. paid=true, expected=billDate.
 *   4. billDate >= lastDue
 *        New bill (started this cycle), no qualifying payment.
 *        paid=true, expected=nextDue. last_payment passes through (an old
 *        payment outside both windows is still shown, never hidden).
 *   5. (none of the above)
 *        Overdue. paid=false, due=true, expected=lastDue.
 *
 * paid flag (cases 1, 2 & 4) = now < (expected_date + almost.weeks)
 *   true  → more than 1 week until expected_date (comfortably paid)
 *   false → within 1 week of expected_date (almost/warning state)
 *
 * ─────────────────────────────────────────────────────────────────────────────
 */

/* global moment */
/* global fastSort */

(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory(require("moment"), require("fast-sort"));
  /* c8 ignore start */
  } else {
    root.BillParser = factory(root.moment, root.fastSort);
  }
  /* c8 ignore stop */
})(typeof globalThis !== "undefined" ? globalThis : /* c8 ignore next */ this,
  function (moment, fastSort) {
    /** @type {string} Firefly III datetime format */
    var FF_DATETIME_FMT = "YYYY-MM-DDTHH:mm:ssZZ";

    /** @type {string} Display format for dates */
    var OUTPUT_FMT = "MMM DD";

    /**
     * Default configuration for payment and almost-due windows.
     * @type {BillConfig}
     */
    var DEFAULT_CONFIG = {
      paid: { weeks: -3 },
      almost: { weeks: -1 }
    };

    /**
     * @typedef {Object} PaidDate
     * @property {string} date - ISO-8601 date string from Firefly III.
     */

    /**
     * @typedef {Object} BillInput
     * @property {string}     name       - Bill display name.
     * @property {string}     date       - Bill creation/start date (Firefly III format).
     * @property {PaidDate[]} paid_dates - Recorded payment dates from Firefly III.
     */

    /**
     * @typedef {Object} WeekOffset
     * @property {number} weeks - Negative week offset (e.g. -3 = three weeks before).
     */

    /**
     * @typedef {Object} BillConfig
     * @property {WeekOffset} paid   - Window before lastDue that counts as covering that cycle.
     * @property {WeekOffset} almost - Window before nextDue that marks advance payment / almost-due warning.
     */

    /**
     * @typedef {Object} ParsedBill
     * @property {string}           name          - Bill display name.
     * @property {string|null}      last_payment  - Most recent payment date (OUTPUT_FMT), or null.
     * @property {boolean}          paid          - True when more than almost.weeks away from expected_date.
     * @property {string}           expected_date - Next expected payment date (OUTPUT_FMT).
     * @property {boolean}          due           - True when the bill is overdue.
     */

    /**
     * Parses a single Firefly III bill and returns display-ready status.
     *
     * See the algorithm overview at the top of this file for full classification logic.
     *
     * @param {BillInput}  bill   - Raw bill object from Firefly III API.
     * @param {moment.Moment} now - Current date (start of day).
     * @param {BillConfig} [config] - Window configuration; defaults to DEFAULT_CONFIG.
     * @returns {ParsedBill} Parsed bill with payment status and next expected date.
     */
    function parseBill(bill, now, config) {
      var cfg = config || DEFAULT_CONFIG;
      var name = bill.name;
      var date = bill.date;
      var paid_dates = bill.paid_dates;

      var payments = (paid_dates || [])
        .filter(function (pd) {
          return pd && pd.date;
        })
        .map(function (pd) {
          return moment(pd.date, FF_DATETIME_FMT);
        })
        .sort(function (a, b) {
          return b.diff(a, "days");
        });

      var lastPayment = payments.length > 0 ? payments[0] : null;
      var billDate = moment(date, FF_DATETIME_FMT);

      var dayOfMonth = billDate.date();

      /**
       * Returns the due date for the billing day within the given month.
       * Clamps to the last day of the month when dayOfMonth exceeds daysInMonth,
       * recovering back to dayOfMonth in longer months (mirrors Firefly addMonth()).
       *
       * @param {moment.Moment} ref - Any date within the target month.
       * @returns {moment.Moment} Start of the due day in ref's month.
       */
      var dueInMonth = function (ref) {
        var day = Math.min(dayOfMonth, ref.clone().daysInMonth());
        return ref.clone().startOf("month").date(day).startOf("day");
      };

      var thisMonthDue = dueInMonth(now);
      var lastDue = thisMonthDue.isSameOrBefore(now)
        ? thisMonthDue
        : dueInMonth(now.clone().subtract(1, "month"));

      var nextDue = dueInMonth(lastDue.clone().add(1, "month"));

      var paidCfg = cfg.paid || DEFAULT_CONFIG.paid;
      var almostCfg = cfg.almost || DEFAULT_CONFIG.almost;
      var paidWeeks = paidCfg.weeks;
      var almostWeeks = almostCfg.weeks;

      var billStartedAfterLastDue = billDate.isSameOrAfter(lastDue);
      var paymentWindowStart = lastDue.clone().add(paidWeeks, "weeks");
      var advanceWindowStart = nextDue.clone().add(almostWeeks, "weeks");

      // Payments may preempt the future/new-bill guards ONLY when the bill has
      // started or starts within the incoming cycle (billDate <= nextDue). A
      // bill anchored beyond nextDue has no real obligation yet — synthesizing
      // monthly expectations from its day-of-month would raise false alarms.
      var paymentMayPreempt = !billDate.isAfter(nextDue);

      // Case 1: advance payment — paid within almost.weeks of nextDue → covers
      // nextDue cycle. Evaluated FIRST: a real payment beats the future/new-bill
      // guards, so a brand-new bill's first payment is never hidden.
      var advancePaid =
        paymentMayPreempt &&
        lastPayment !== null && lastPayment.isSameOrAfter(advanceWindowStart);

      if (advancePaid) {
        var nextNextDue = dueInMonth(nextDue.clone().add(1, "month"));
        var almostStart2 = nextNextDue.clone().add(almostWeeks, "weeks");
        return {
          name: name,
          last_payment: lastPayment,
          paid: now.isBefore(almostStart2),
          expected_date: nextNextDue,
          due: false
        };
      }

      // Case 2: payment covers lastDue cycle
      var lastDuePaid =
        paymentMayPreempt &&
        lastPayment !== null && lastPayment.isSameOrAfter(paymentWindowStart);

      if (lastDuePaid) {
        var almostStart3 = nextDue.clone().add(almostWeeks, "weeks");
        return {
          name: name,
          last_payment: lastPayment,
          paid: now.isBefore(almostStart3),
          expected_date: nextDue,
          due: false
        };
      }

      // Case 3: future bill (no qualifying payment)
      if (billDate.isAfter(now)) {
        return {
          name: name,
          last_payment: lastPayment,
          paid: true,
          expected_date: billDate,
          due: false
        };
      }

      // Case 4: new bill started this cycle (no qualifying payment). An old
      // payment outside both windows still passes through — shown, not hidden.
      if (billStartedAfterLastDue) {
        var almostStart = nextDue.clone().add(almostWeeks, "weeks");
        return {
          name: name,
          last_payment: lastPayment,
          paid: now.isBefore(almostStart),
          expected_date: nextDue,
          due: false
        };
      }

      // Case 5: overdue
      return {
        name: name,
        last_payment: lastPayment,
        paid: false,
        expected_date: lastDue,
        due: now.isSameOrAfter(lastDue)
      };
    }

    /**
     * Parses and sorts an array of Firefly III bills.
     *
     * Sort order:
     *   1. due bills first (overdue)
     *   2. unpaid bills
     *   3. paid bills
     * Within each group: sort by expected_date ASC, then last_payment ASC, then name ASC.
     *
     * Moment objects in the output are serialized to OUTPUT_FMT strings ("MMM DD").
     * Null last_payment remains null.
     *
     * @param {BillInput[]}    data   - Array of raw bills from Firefly III API.
     * @param {moment.Moment}  now    - Current date (start of day).
     * @param {BillConfig}     [config] - Window configuration; defaults to DEFAULT_CONFIG.
     * @returns {ParsedBill[]} Sorted array of parsed bills ready for display.
     */
    function parseBills(data, now, config) {
      return fastSort
        .sort(
          data.map(function (b) {
            return parseBill(b, now, config);
          })
        )
        .by([
          {
            asc: function (b) {
              return b.due ? 0 : b.paid ? 2 : 1;
            }
          },
          {
            asc: function (b) {
              return b.expected_date ? b.expected_date.valueOf() : 0;
            }
          },
          {
            asc: function (b) {
              return b.last_payment ? b.last_payment.valueOf() : 0;
            }
          },
          { asc: "name" }
        ])
        .map(function (b) {
          return {
            name: b.name,
            last_payment: b.last_payment
              ? b.last_payment.format(OUTPUT_FMT)
              : null,
            paid: b.paid,
            /* c8 ignore next 3 */
            expected_date: b.expected_date
              ? b.expected_date.format(OUTPUT_FMT)
              : null,
            due: b.due
          };
        });
    }

    return { parseBill: parseBill, parseBills: parseBills };
  }
);
