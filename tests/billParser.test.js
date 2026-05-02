const moment = require("moment");
const { parseBill } = require("../lib/billParser");

const FF = "YYYY-MM-DDTHH:mm:ssZZ";
const cfg = { paid: { weeks: -3 }, almost: { weeks: -1 } };

function mkBill(dateStr, paidDates = []) {
  return {
    name: "Electric",
    date: moment(dateStr, "YYYY-MM-DD").format(FF),
    paid_dates: paidDates.map((d) => ({
      date: moment(d, "YYYY-MM-DD").format(FF)
    }))
  };
}

function mkNow(dateStr) {
  return moment(dateStr, "YYYY-MM-DD").startOf("day");
}

// ─── Group A: Future bills (not yet active) ───────────────────────────────────

describe("parseBill — future bill", () => {
  test("A1: bill tomorrow → paid:true, due:false, last_payment:null", () => {
    const r = parseBill(mkBill("2024-03-15"), mkNow("2024-03-14"), cfg);
    expect(r.paid).toBe(true);
    expect(r.due).toBe(false);
    expect(r.last_payment).toBeNull();
    expect(r.expected_date.format("YYYY-MM-DD")).toBe("2024-03-15");
  });

  test("A2: bill today → falls into normal logic (not short-circuited by future guard)", () => {
    // billDate == now → isAfter(now) = false, isSameOrAfter(lastDue) = true → new bill
    const r = parseBill(mkBill("2024-03-14"), mkNow("2024-03-14"), cfg);
    expect(r.paid).toBe(true); // new bill → paidThisPeriod
    expect(r.due).toBe(false);
  });

  test("A3: bill far future (2030) → paid:true", () => {
    const r = parseBill(mkBill("2030-01-01"), mkNow("2024-03-14"), cfg);
    expect(r.paid).toBe(true);
    expect(r.due).toBe(false);
    expect(r.last_payment).toBeNull();
  });
});

// ─── Group B: No payments ─────────────────────────────────────────────────────

describe("parseBill — no payments recorded", () => {
  test("B1: due 15th, now=Mar10 → unpaid, overdue (lastDue=Feb15)", () => {
    // Mar 15 > Mar 10 → lastDue = Feb 15; now=Mar10 is after Feb15 → due:true
    const r = parseBill(mkBill("2023-01-15"), mkNow("2024-03-10"), cfg);
    expect(r.paid).toBe(false);
    expect(r.due).toBe(true);
    expect(r.expected_date.format("YYYY-MM-DD")).toBe("2024-02-15");
    expect(r.last_payment).toBeNull();
  });

  test("B2: due 15th, now=Mar15 exactly → due:true on the day", () => {
    const r = parseBill(mkBill("2023-01-15"), mkNow("2024-03-15"), cfg);
    expect(r.paid).toBe(false);
    expect(r.due).toBe(true);
    expect(r.expected_date.format("YYYY-MM-DD")).toBe("2024-03-15");
  });

  test("B3: due 15th, now=Mar20 (5 days past) → still due:true", () => {
    const r = parseBill(mkBill("2023-01-15"), mkNow("2024-03-20"), cfg);
    expect(r.paid).toBe(false);
    expect(r.due).toBe(true);
    expect(r.expected_date.format("YYYY-MM-DD")).toBe("2024-03-15");
  });
});

// ─── Group C: With payments ───────────────────────────────────────────────────

describe("parseBill — with payments", () => {
  test("C1: paid this period, inside almost window → paid:false (almost due)", () => {
    // lastDue=Feb15, nextDue=Mar15, almostStart=Mar8, now=Mar10 → almost
    const r = parseBill(
      mkBill("2023-01-15", ["2024-03-05"]),
      mkNow("2024-03-10"),
      cfg
    );
    expect(r.paid).toBe(false);
    expect(r.due).toBe(false);
    expect(r.expected_date.format("YYYY-MM-DD")).toBe("2024-03-15");
  });

  test("C2: paid this period, before almost window → paid:true", () => {
    // same as C1 but now=Mar01 (before almostStart Mar8)
    const r = parseBill(
      mkBill("2023-01-15", ["2024-03-05"]),
      mkNow("2024-03-01"),
      cfg
    );
    expect(r.paid).toBe(true);
    expect(r.due).toBe(false);
    expect(r.expected_date.format("YYYY-MM-DD")).toBe("2024-03-15");
  });

  test("C3: payment on exact window boundary (paymentWindowStart) → paidThisPeriod:true", () => {
    // lastDue=Feb15, paymentWindowStart = Feb15 - 3w = Jan25
    // payment exactly Jan 25
    const r = parseBill(
      mkBill("2023-01-15", ["2024-01-25"]),
      mkNow("2024-02-01"),
      cfg
    );
    expect(r.paid).toBe(true); // inside almost? nextDue=Feb15, almostStart=Feb8, now=Feb01 → paid:true
  });

  test("C4: payment one day before window → paidThisPeriod:false", () => {
    // paymentWindowStart = Jan 25; payment = Jan 24
    const r = parseBill(
      mkBill("2023-01-15", ["2024-01-24"]),
      mkNow("2024-02-10"),
      cfg
    );
    expect(r.paid).toBe(false);
  });

  test("C5: multiple paid_dates → uses the most recent", () => {
    const r = parseBill(
      mkBill("2023-01-15", ["2024-01-10", "2024-02-12", "2024-03-08"]),
      mkNow("2024-03-10"),
      cfg
    );
    expect(r.last_payment.format("YYYY-MM-DD")).toBe("2024-03-08");
  });
});

// ─── Group D: End-of-month bills (regression for Bug 5) ──────────────────────

describe("parseBill — end-of-month bills (Bug 5 regression)", () => {
  test("D1: bill 31st, now=Feb20 (leap) → lastDue=Jan31, nextDue=Feb29", () => {
    const r = parseBill(mkBill("2023-01-31"), mkNow("2024-02-20"), cfg);
    expect(r.expected_date.format("YYYY-MM-DD")).toBe("2024-01-31");
    expect(r.due).toBe(true); // Jan31 < Feb20
  });

  test("D2: bill 31st, now=Feb29 (leap boundary) → lastDue=Feb29, due:true", () => {
    const r = parseBill(mkBill("2023-01-31"), mkNow("2024-02-29"), cfg);
    expect(r.expected_date.format("YYYY-MM-DD")).toBe("2024-02-29");
    expect(r.due).toBe(true);
  });

  test("D3: bill 31st, non-leap Feb → lastDue=Feb28", () => {
    const r = parseBill(mkBill("2022-01-31"), mkNow("2023-02-28"), cfg);
    expect(r.expected_date.format("YYYY-MM-DD")).toBe("2023-02-28");
    expect(r.due).toBe(true);
  });

  test("D4: bill day=30 (>= 30) → isEndOfMonth behavior", () => {
    // day 30 triggers isEndOfMonth=true in feb → due = endOf Feb
    const r = parseBill(mkBill("2023-01-30"), mkNow("2024-02-15"), cfg);
    // thisMonthDue = endOf Feb = Feb29; Feb29 > Feb15 → lastDue = Jan31
    expect(r.expected_date.format("YYYY-MM-DD")).toBe("2024-01-31");
    expect(r.due).toBe(true);
  });

  test("D5: bill day=29 (not isEndOfMonth) → caps at daysInMonth", () => {
    // non-leap Feb: min(29, 28) = 28
    const r = parseBill(mkBill("2023-01-29"), mkNow("2023-02-28"), cfg);
    expect(r.expected_date.format("YYYY-MM-DD")).toBe("2023-02-28");
  });

  test("D6: bill day=29, leap Feb → min(29, 29) = 29", () => {
    const r = parseBill(mkBill("2023-01-29"), mkNow("2024-02-29"), cfg);
    expect(r.expected_date.format("YYYY-MM-DD")).toBe("2024-02-29");
  });
});

// ─── Group E: Bill started recently ──────────────────────────────────────────

describe("parseBill — new bill (started on or after lastDue)", () => {
  test("E1: bill starts after lastDue → paidThisPeriod:true regardless of paid_dates", () => {
    // bill.date = Mar 6, lastDue = Mar 5 → isSameOrAfter → true
    const r = parseBill(mkBill("2024-03-06"), mkNow("2024-03-10"), cfg);
    expect(r.paid).toBe(true);
    expect(r.due).toBe(false);
    expect(r.last_payment).toBeNull();
  });

  test("E2: bill starts same day as lastDue → isSameOrAfter → paidThisPeriod:true", () => {
    // bill.date = Mar 5, lastDue = Mar 5 → same day counts as new
    const r = parseBill(mkBill("2024-03-05"), mkNow("2024-03-10"), cfg);
    expect(r.paid).toBe(true); // or false depending on almostStart
    expect(r.due).toBe(false);
  });
});

// ─── Group F: Custom config ───────────────────────────────────────────────────

describe("parseBill — custom paidWeeks / almostWeeks", () => {
  test("F1: paidWeeks=-1 (shorter window) → recent-enough payment outside window", () => {
    const shortCfg = { paid: { weeks: -1 }, almost: { weeks: -1 } };
    // lastDue = Feb 15, paymentWindowStart = Feb 8 (-1 week)
    // payment = Feb 5 (before Feb 8) → NOT in window
    const r = parseBill(
      mkBill("2023-01-15", ["2024-02-05"]),
      mkNow("2024-03-10"),
      shortCfg
    );
    expect(r.paid).toBe(false);
  });

  test("F2: almostWeeks=-2 (longer almost window) → shows almost 12 days before due", () => {
    const wideCfg = { paid: { weeks: -3 }, almost: { weeks: -2 } };
    // nextDue = Mar 15, almostStart = Mar 1, now = Mar 10 → inside almost
    const r = parseBill(
      mkBill("2023-01-15", ["2024-03-05"]),
      mkNow("2024-03-10"),
      wideCfg
    );
    expect(r.paid).toBe(false);
    expect(r.due).toBe(false);
  });
});

// ─── Group G: Edge / null guards ─────────────────────────────────────────────

describe("parseBill — null and missing field guards", () => {
  test("G1: paid_dates empty array → last_payment:null", () => {
    const r = parseBill(mkBill("2023-01-15", []), mkNow("2024-03-10"), cfg);
    expect(r.last_payment).toBeNull();
  });

  test("G2: paid_dates null → no crash", () => {
    const bill = {
      name: "X",
      date: moment("2023-01-15").format(FF),
      paid_dates: null
    };
    expect(() => parseBill(bill, mkNow("2024-03-10"), cfg)).not.toThrow();
  });

  test("G3: paid_dates with null entry → skipped, no crash", () => {
    const bill = {
      name: "X",
      date: moment("2023-01-15").format(FF),
      paid_dates: [
        null,
        { date: null },
        { date: moment("2024-03-05").format(FF) }
      ]
    };
    expect(() => parseBill(bill, mkNow("2024-03-10"), cfg)).not.toThrow();
    const r = parseBill(bill, mkNow("2024-03-10"), cfg);
    expect(r.last_payment.format("YYYY-MM-DD")).toBe("2024-03-05");
  });

  test("G4: config null → uses defaults without crash", () => {
    expect(() =>
      parseBill(mkBill("2023-01-15"), mkNow("2024-03-10"), null)
    ).not.toThrow();
  });
});
