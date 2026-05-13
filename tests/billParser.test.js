/**
 * @fileoverview Tests for lib/billParser.js — covers both parseBill() and parseBills().
 *
 * parseBill()  — single-bill classification (Groups A–G)
 * parseBills() — array parsing, sort order, and output serialization (Group P)
 */

const moment = require("moment");
const { parseBill, parseBills } = require("../lib/billParser");
const { FF, cfg, mkBill, mkNow } = require("./helpers/billParser");

// ─── parseBill ────────────────────────────────────────────────────────────────

describe("parseBill — future bill (Case 1)", () => {
  test("A1: bill tomorrow → paid:true, due:false, last_payment:null", () => {
    const r = parseBill(mkBill("2024-03-15"), mkNow("2024-03-14"), cfg);
    expect(r.paid).toBe(true);
    expect(r.due).toBe(false);
    expect(r.last_payment).toBeNull();
    expect(r.expected_date.format("YYYY-MM-DD")).toBe("2024-03-15");
  });

  test("A2: bill today → falls into normal logic (not short-circuited by future guard)", () => {
    const r = parseBill(mkBill("2024-03-14"), mkNow("2024-03-14"), cfg);
    expect(r.paid).toBe(true);
    expect(r.due).toBe(false);
  });

  test("A3: bill far future (2030) → paid:true", () => {
    const r = parseBill(mkBill("2030-01-01"), mkNow("2024-03-14"), cfg);
    expect(r.paid).toBe(true);
    expect(r.due).toBe(false);
    expect(r.last_payment).toBeNull();
  });
});

describe("parseBill — no payments recorded (Case 5 overdue)", () => {
  test("B1: due 15th, now=Mar10 → overdue (lastDue=Feb15)", () => {
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

describe("parseBill — with payments (Cases 3 & 4)", () => {
  test("C1: payment within 1w of nextDue → advance (Case 3) → nextNextDue", () => {
    // lastDue=Feb15, nextDue=Mar15, advanceWindowStart=Mar8
    // payment=Mar10 >= Mar8 → advance → nextNextDue=Apr15
    const r = parseBill(
      mkBill("2023-01-15", ["2024-03-10"]),
      mkNow("2024-03-10"),
      cfg
    );
    expect(r.paid).toBe(true);
    expect(r.due).toBe(false);
    expect(r.expected_date.format("YYYY-MM-DD")).toBe("2024-04-15");
  });

  test("C2: payment >1w before nextDue → lastDuePaid (Case 4), NOT advance → nextDue", () => {
    // lastDue=Feb15, nextDue=Mar15, advanceWindowStart=Mar8
    // payment=Mar05 < Mar8 → NOT advance; paymentWindowStart=Jan25, Mar05>=Jan25 → lastDuePaid
    const r = parseBill(
      mkBill("2023-01-15", ["2024-03-05"]),
      mkNow("2024-02-20"),
      cfg
    );
    expect(r.paid).toBe(true);
    expect(r.due).toBe(false);
    expect(r.expected_date.format("YYYY-MM-DD")).toBe("2024-03-15");
  });

  test("C3: payment on exact paymentWindowStart boundary → covers current cycle", () => {
    // lastDue=Feb15, paymentWindowStart=Jan25; payment exactly Jan25
    const r = parseBill(
      mkBill("2023-01-15", ["2024-01-25"]),
      mkNow("2024-02-01"),
      cfg
    );
    expect(r.paid).toBe(true);
  });

  test("C4: payment one day before paymentWindowStart → overdue", () => {
    // lastDue=Jan15, paymentWindowStart=Dec25; payment=Dec24 < Dec25 → overdue
    const r = parseBill(
      mkBill("2023-01-15", ["2023-12-24"]),
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

describe("parseBill — end-of-month clamping (Bug 5 regression)", () => {
  test("D1: bill 31st, now=Feb20 (leap) → lastDue=Jan31", () => {
    const r = parseBill(mkBill("2023-01-31"), mkNow("2024-02-20"), cfg);
    expect(r.expected_date.format("YYYY-MM-DD")).toBe("2024-01-31");
    expect(r.due).toBe(true);
  });

  test("D2: bill 31st, now=Feb29 (leap boundary) → lastDue=Feb29", () => {
    const r = parseBill(mkBill("2023-01-31"), mkNow("2024-02-29"), cfg);
    expect(r.expected_date.format("YYYY-MM-DD")).toBe("2024-02-29");
    expect(r.due).toBe(true);
  });

  test("D3: bill 31st, non-leap Feb → lastDue=Feb28", () => {
    const r = parseBill(mkBill("2022-01-31"), mkNow("2023-02-28"), cfg);
    expect(r.expected_date.format("YYYY-MM-DD")).toBe("2023-02-28");
    expect(r.due).toBe(true);
  });

  test("D4: bill day=30 in 31-day month → min(30,31)=30, NOT endOfMonth", () => {
    const r = parseBill(mkBill("2023-01-30"), mkNow("2024-02-15"), cfg);
    expect(r.expected_date.format("YYYY-MM-DD")).toBe("2024-01-30");
    expect(r.due).toBe(true);
  });

  test("D5: bill day=29, non-leap Feb → clamps to 28", () => {
    const r = parseBill(mkBill("2023-01-29"), mkNow("2023-02-28"), cfg);
    expect(r.expected_date.format("YYYY-MM-DD")).toBe("2023-02-28");
  });

  test("D6: bill day=29, leap Feb → min(29,29)=29", () => {
    const r = parseBill(mkBill("2023-01-29"), mkNow("2024-02-29"), cfg);
    expect(r.expected_date.format("YYYY-MM-DD")).toBe("2024-02-29");
  });
});

describe("parseBill — new bill started on/after lastDue (Case 2)", () => {
  test("E1: bill.date after lastDue → paid:true, last_payment:null", () => {
    const r = parseBill(mkBill("2024-03-06"), mkNow("2024-03-10"), cfg);
    expect(r.paid).toBe(true);
    expect(r.due).toBe(false);
    expect(r.last_payment).toBeNull();
  });

  test("E2: bill.date same day as lastDue → isSameOrAfter → paid:true", () => {
    const r = parseBill(mkBill("2024-03-05"), mkNow("2024-03-10"), cfg);
    expect(r.paid).toBe(true);
    expect(r.due).toBe(false);
  });
});

describe("parseBill — custom paid/almost window config", () => {
  test("F1: paid.weeks=-1 → payment outside shorter window → overdue", () => {
    const shortCfg = { paid: { weeks: -1 }, almost: { weeks: -1 } };
    // lastDue=Feb15, paymentWindowStart=Feb8; payment=Feb05 < Feb8 → NOT in window
    const r = parseBill(
      mkBill("2023-01-15", ["2024-02-05"]),
      mkNow("2024-03-10"),
      shortCfg
    );
    expect(r.paid).toBe(false);
  });

  test("F0: partial config (no almost key) → DEFAULT_CONFIG.almost used, no crash", () => {
    // cfg.almost is undefined → DEFAULT_CONFIG.almost={weeks:-1} → advanceStart=Mar08
    // now=Mar10 > Mar08 → past almost window → paid=false (but not due)
    const r = parseBill(
      mkBill("2023-01-15", ["2024-03-05"]),
      mkNow("2024-03-10"),
      { paid: { weeks: -3 } }
    );
    expect(r.due).toBe(false);
    expect(r.last_payment).not.toBeNull();
  });

  test("F0b: partial config (no paid key) → defaults used, no crash", () => {
    // cfg.paid is undefined → DEFAULT_CONFIG.paid used (covers L180 default branch)
    const r = parseBill(
      mkBill("2023-01-15", []),
      mkNow("2024-03-10"),
      { almost: { weeks: -1 } }
    );
    expect(r.paid).toBe(false);
    expect(r.due).toBe(true);
  });

  test("F2: almost.weeks=-2 → wider advance window → paid:true", () => {
    const wideCfg = { paid: { weeks: -3 }, almost: { weeks: -2 } };
    const r = parseBill(
      mkBill("2023-01-15", ["2024-03-05"]),
      mkNow("2024-03-10"),
      wideCfg
    );
    expect(r.paid).toBe(true);
    expect(r.due).toBe(false);
  });
});

describe("parseBill — null / missing field guards", () => {
  test("G1: paid_dates empty → last_payment:null", () => {
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

  test("G3: paid_dates with null entries → skipped, valid entry used", () => {
    const bill = {
      name: "X",
      date: moment("2023-01-15").format(FF),
      paid_dates: [null, { date: null }, { date: moment("2024-03-05").format(FF) }]
    };
    expect(() => parseBill(bill, mkNow("2024-03-10"), cfg)).not.toThrow();
    const r = parseBill(bill, mkNow("2024-03-10"), cfg);
    expect(r.last_payment.format("YYYY-MM-DD")).toBe("2024-03-05");
  });

  test("G4: config null → uses defaults, no crash", () => {
    expect(() =>
      parseBill(mkBill("2023-01-15"), mkNow("2024-03-10"), null)
    ).not.toThrow();
  });
});

// ─── parseBills ───────────────────────────────────────────────────────────────

describe("parseBills — sort order", () => {
  test("P1: due bills sort before paid", () => {
    const now = mkNow("2024-03-20");
    const result = parseBills(
      [
        mkBill("2023-01-15", ["2024-03-05"], "Gas"),
        mkBill("2023-01-10", [], "Water")
      ],
      now,
      cfg
    );
    expect(result[0].name).toBe("Water"); // due
    expect(result[1].name).toBe("Gas"); // paid
  });

  test("P2: sort order = due → unpaid → paid", () => {
    const now = mkNow("2024-03-10");
    const data = [
      mkBill("2023-01-01", ["2024-03-01"], "Electric"),
      mkBill("2023-01-12", ["2024-02-12"], "Gas"),
      mkBill("2023-01-05", [], "Water")
    ];
    const result = parseBills(data, now, cfg);
    expect(result[0].name).toBe("Water"); // due
    expect(result[1].name).toBe("Gas"); // unpaid
    expect(result[2].name).toBe("Electric"); // paid
  });

  test("P3: same group → sort by expected_date ascending", () => {
    const now = mkNow("2024-03-20");
    const result = parseBills(
      [
        mkBill("2023-01-15", [], "Internet"),
        mkBill("2023-01-10", [], "Water")
      ],
      now,
      cfg
    );
    expect(result[0].name).toBe("Water"); // earlier due date (Mar10)
    expect(result[1].name).toBe("Internet");
  });

  test("P4: same group+date → sort by last_payment ascending (oldest first)", () => {
    const now = mkNow("2024-03-01");
    const result = parseBills(
      [
        mkBill("2023-01-01", ["2024-02-20"], "Electric"),
        mkBill("2023-01-01", ["2024-02-10"], "Gas")
      ],
      now,
      cfg
    );
    expect(result[0].name).toBe("Gas"); // older payment first
    expect(result[1].name).toBe("Electric");
  });

  test("P5: null last_payment sorts before any real payment", () => {
    const now = mkNow("2024-03-01");
    const result = parseBills(
      [
        mkBill("2023-01-01", ["2024-02-10"], "Electric"),
        mkBill("2024-03-01", [], "Phone")
      ],
      now,
      cfg
    );
    expect(result[0].name).toBe("Phone"); // null last_payment → 0 → first
  });

  test("P6: same group+date+payment → sort by name ascending", () => {
    const now = mkNow("2024-03-01");
    const result = parseBills(
      [
        mkBill("2023-01-01", ["2024-02-01"], "Zeta"),
        mkBill("2023-01-01", ["2024-02-01"], "Alpha")
      ],
      now,
      cfg
    );
    expect(result[0].name).toBe("Alpha");
    expect(result[1].name).toBe("Zeta");
  });
});

describe("parseBills — output format", () => {
  test("P7: empty array → returns []", () => {
    expect(parseBills([], mkNow("2024-03-10"), cfg)).toEqual([]);
  });

  test("P8: single bill → array length 1", () => {
    const r = parseBills([mkBill("2023-01-15")], mkNow("2024-03-10"), cfg);
    expect(r).toHaveLength(1);
  });

  test("P9: moment objects serialized to strings in output", () => {
    const r = parseBills(
      [mkBill("2023-01-15", ["2024-03-05"])],
      mkNow("2024-03-10"),
      cfg
    );
    const bill = r[0];
    expect(typeof bill.expected_date).toBe("string");
    expect(typeof bill.last_payment).toBe("string");
    expect(moment.isMoment(bill.expected_date)).toBe(false);
    expect(moment.isMoment(bill.last_payment)).toBe(false);
  });

  test("P10: null last_payment stays null (not stringified)", () => {
    const r = parseBills([mkBill("2024-03-10")], mkNow("2024-03-10"), cfg);
    expect(r[0].last_payment).toBeNull();
  });
});

// ─── UMD browser branch ───────────────────────────────────────────────────────

describe("billParser — UMD browser branch (Line 64)", () => {
  test("L1: browser path sets root.BillParser when module is undefined", () => {
    const vm = require("vm");
    const fs = require("fs");
    const path = require("path");

    const src = fs.readFileSync(
      path.resolve(__dirname, "../lib/billParser.js"),
      "utf8"
    );
    const fakeRoot = {
      moment: require("moment"),
      fastSort: require("fast-sort")
    };

    // No `module` in sandbox → else branch executes → root.BillParser set
    vm.runInNewContext(src, { globalThis: fakeRoot });

    expect(fakeRoot.BillParser).toBeDefined();
    expect(typeof fakeRoot.BillParser.parseBill).toBe("function");
    expect(typeof fakeRoot.BillParser.parseBills).toBe("function");
  });
});
