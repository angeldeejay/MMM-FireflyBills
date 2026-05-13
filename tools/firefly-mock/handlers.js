"use strict";

/**
 * MSW v2 handlers for the Firefly III mock server.
 *
 * Each bill is generated dynamically from Date.now() so all classification
 * scenarios remain valid regardless of when the server runs.
 *
 * Algorithm recap (mirrors billParser.js):
 *   dueInMonth(ref, day) = min(day, ref.daysInMonth)  (first of month + day)
 *   thisMonthDue  = dueInMonth(now, day)
 *   lastDue       = thisMonthDue  if thisMonthDue <= now
 *                   dueInMonth(prevMonth, day)  otherwise
 *   nextDue       = dueInMonth(lastDue + 1 month, day)
 *   paymentWindowStart  = lastDue  - 3 weeks
 *   advanceWindowStart  = nextDue  - 1 week
 *
 * Cases:
 *   1 future      bill.date > now
 *   2 new bill    bill.date >= lastDue  (no payment needed)
 *   3 advance     lastPayment >= advanceWindowStart
 *   4 lastDuePaid lastPayment >= paymentWindowStart
 *   5 overdue     none of the above
 */

const { http, HttpResponse } = require("msw");

// ── Date helpers (no external libs) ──────────────────────────────────────────

/** Format a Date as Firefly III datetime string: "YYYY-MM-DDTHH:mm:ss+0000" */
function ffDate(d) {
  const pad = (n, w = 2) => String(n).padStart(w, "0");
  return (
    d.getUTCFullYear() +
    "-" +
    pad(d.getUTCMonth() + 1) +
    "-" +
    pad(d.getUTCDate()) +
    "T" +
    pad(d.getUTCHours()) +
    ":" +
    pad(d.getUTCMinutes()) +
    ":" +
    pad(d.getUTCSeconds()) +
    "+0000"
  );
}

/** Return a new Date set to UTC midnight of the given date. */
function startOfDay(d) {
  const c = new Date(d);
  c.setUTCHours(0, 0, 0, 0);
  return c;
}

/** Return the number of days in the UTC month of d. */
function daysInMonth(d) {
  // Day 0 of next month = last day of current month
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
}

/**
 * Return the due date for billing day `day` within the UTC month of `ref`.
 * Mirrors billParser dueInMonth(): clamps to last day of month.
 */
function dueInMonth(ref, day) {
  const clamped = Math.min(day, daysInMonth(ref));
  return new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth(), clamped));
}

/** Add `months` calendar months to `d` (UTC). */
function addMonths(d, months) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, d.getUTCDate()));
}

/** Add `days` calendar days to `d` (UTC). */
function addDays(d, days) {
  return new Date(d.getTime() + days * 86400000);
}

/**
 * Compute lastDue and nextDue for a bill with the given billing day,
 * relative to `now` (UTC midnight).
 */
function computeDates(now, day) {
  const thisMonthDue = dueInMonth(now, day);
  const lastDue =
    thisMonthDue <= now
      ? thisMonthDue
      : dueInMonth(addMonths(now, -1), day);
  const nextDue = dueInMonth(addMonths(lastDue, 1), day);
  return { lastDue, nextDue };
}

// ── Bill builders ─────────────────────────────────────────────────────────────

/**
 * Build a raw Firefly III bill attributes object.
 * @param {object} opts
 * @param {string}   opts.id
 * @param {string}   opts.name
 * @param {boolean}  opts.active
 * @param {Date}     opts.billDate      - value for attributes.date
 * @param {Date[]}   opts.paidDates     - values for attributes.paid_dates
 */
function makeBill({ id, name, active, billDate, paidDates }) {
  return {
    id,
    attributes: {
      active,
      name,
      date: ffDate(billDate),
      paid_dates: paidDates.map((d) => ({ date: ffDate(d) }))
    }
  };
}

// ── Scenario factory ──────────────────────────────────────────────────────────

/**
 * Build all eight bill stubs relative to the current moment.
 * Called fresh on every HTTP request so the stubs never go stale.
 *
 * Stubs:
 *   A Electricity  day=15  Case 3: advance payment (3d before nextDue)
 *   B Water        day=20  Case 4: lastDuePaid (10d before lastDue, within 3w)
 *   C Internet     day=10  Case 5: overdue, no payment history
 *   D Gas          day=28  Case 2: new bill (billDate >= lastDue)
 *   E Rent         day=5   Case 1: future (billDate = now+10d)
 *   F Streaming    day=30  Case 5 + Feb clamping (min(30, daysInMonth))
 *   H Gym          day=8   Case 5: overdue WITH payment history (paid 2 cycles ago)
 *   G Inactive Bill        active=false → filtered by node_helper
 */
function buildBills() {
  const now = startOfDay(new Date());

  // ── Bill A — day=15 — Case 3: advance payment (paid 3 days before nextDue)
  //   advanceWindowStart = nextDue - 7 days
  //   payment = nextDue - 3 days  >= advanceWindowStart  ✓
  {
    const { lastDue: _ld, nextDue } = computeDates(now, 15);
    var billA = makeBill({
      id: "A",
      name: "Electricity",
      active: true,
      billDate: new Date(Date.UTC(2023, 0, 15)), // well in the past
      paidDates: [addDays(nextDue, -3)]
    });
  }

  // ── Bill B — day=20 — Case 4: lastDuePaid (paid 10 days before lastDue, within 3w window)
  //   paymentWindowStart = lastDue - 21 days
  //   payment = lastDue - 10 days  >= paymentWindowStart  ✓
  //   advanceWindowStart = nextDue - 7 days
  //   payment = lastDue - 10 days  < nextDue - 7 days  ✓  (lastDue < nextDue − 3d minimum)
  {
    const { lastDue } = computeDates(now, 20);
    var billB = makeBill({
      id: "B",
      name: "Water",
      active: true,
      billDate: new Date(Date.UTC(2023, 0, 20)),
      paidDates: [addDays(lastDue, -10)]
    });
  }

  // ── Bill C — day=10 — Case 5: overdue (no payments)
  //   No paid_dates. bill.date is well in the past and before lastDue.
  {
    var billC = makeBill({
      id: "C",
      name: "Internet",
      active: true,
      billDate: new Date(Date.UTC(2023, 0, 10)),
      paidDates: []
    });
  }

  // ── Bill D — day=28 — Case 2: new bill (bill.date >= lastDue)
  //   Use bill.date = 5 days ago. For this to satisfy billDate >= lastDue we
  //   choose a billDate that is definitely >= lastDue. We place it at
  //   addDays(now, -5) which is always >= lastDue as long as lastDue is more
  //   than 5 days before now. To guarantee this we use day=1 so lastDue is
  //   always the 1st of the current or previous month, which is always well
  //   before now-5d except at the very start of month. For day=28 the
  //   lastDue could be the 28th of the current month (if now >= 28th) or the
  //   previous month. To be safe we set billDate to addDays(lastDue, 1) which
  //   is always >= lastDue by exactly 1 day.
  {
    const { lastDue } = computeDates(now, 28);
    // Place billDate one day after lastDue — unambiguously a new bill this cycle
    const billDDateD = addDays(lastDue, 1);
    // If billDDateD is in the future, fall back to lastDue itself (same-day = new bill)
    const effectiveBillDateD = billDDateD > now ? lastDue : billDDateD;
    var billD = makeBill({
      id: "D",
      name: "Gas",
      active: true,
      billDate: effectiveBillDateD,
      paidDates: []
    });
  }

  // ── Bill E — day=5 — Case 1: future (bill.date > now)
  {
    var billE = makeBill({
      id: "E",
      name: "Rent",
      active: true,
      billDate: addDays(now, 10), // 10 days in the future — always > now
      paidDates: []
    });
  }

  // ── Bill F — day=30 — Case 5 overdue + February clamping
  //   dueInMonth(Feb, 30) = min(30, 28|29) = 28 or 29
  //   No payments → overdue. Expected date will be clamped correctly.
  {
    var billF = makeBill({
      id: "F",
      name: "Streaming",
      active: true,
      billDate: new Date(Date.UTC(2023, 0, 30)),
      paidDates: []
    });
  }

  // ── Bill H — day=8 — Case 5: overdue WITH payment history (paid 2 cycles ago)
  //   paymentWindowStart = lastDue - 21 days
  //   payment = lastDue - 60 days  < paymentWindowStart  → NOT in window → overdue
  //   last_payment is non-null, showing the module renders historical payments correctly
  {
    const { lastDue: lastDueH } = computeDates(now, 8);
    var billH = makeBill({
      id: "H",
      name: "Gym",
      active: true,
      billDate: new Date(Date.UTC(2023, 0, 8)),
      paidDates: [addDays(lastDueH, -60)] // paid two months ago, missed last cycle
    });
  }

  // ── Bill G — active=false — must be excluded by the node_helper
  {
    var billG = makeBill({
      id: "G",
      name: "Inactive Bill",
      active: false,
      billDate: new Date(Date.UTC(2023, 0, 15)),
      paidDates: []
    });
  }

  return [billA, billB, billC, billD, billE, billF, billH, billG];
}

// ── MSW handler ───────────────────────────────────────────────────────────────

const MOCK_TOKEN = "mock-token";

const handlers = [
  http.get("*/api/v1/bills", ({ request }) => {
    const auth = request.headers.get("authorization") || "";
    if (auth !== `Bearer ${MOCK_TOKEN}`) {
      return HttpResponse.json({ message: "Unauthenticated." }, { status: 401 });
    }
    const bills = buildBills();
    return HttpResponse.json({ data: bills });
  })
];

module.exports = { handlers };
