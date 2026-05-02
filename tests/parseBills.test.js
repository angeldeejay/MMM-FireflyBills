const moment = require("moment");
const { parseBills } = require("../lib/billParser");

const FF = "YYYY-MM-DDTHH:mm:ssZZ";
const cfg = { paid: { weeks: -3 }, almost: { weeks: -1 } };
const OUTPUT_FMT = "MMM DD";

function mkBill(name, dateStr, paidDates = []) {
  return {
    name: name,
    date: moment(dateStr, "YYYY-MM-DD").format(FF),
    paid_dates: paidDates.map((d) => ({
      date: moment(d, "YYYY-MM-DD").format(FF)
    }))
  };
}

function mkNow(dateStr) {
  return moment(dateStr, "YYYY-MM-DD").startOf("day");
}

describe("parseBills — sort order", () => {
  test("P1: due bills sort before unpaid and paid", () => {
    // now = Mar 20: "Water" due Mar 10 (no payment) → due; "Gas" paid Mar 5 → paid
    const now = mkNow("2024-03-20");
    const result = parseBills(
      [
        mkBill("Gas", "2023-01-15", ["2024-03-05"]),
        mkBill("Water", "2023-01-10")
      ],
      now,
      cfg
    );
    expect(result[0].name).toBe("Water"); // due
    expect(result[1].name).toBe("Gas"); // paid
  });

  test("P2: sort order = due → unpaid → paid", () => {
    const now = mkNow("2024-03-20");
    // Due: Internet, due Mar 5, no payment
    // Unpaid (not due): Phone, due Mar 25, no payment → lastDue=Feb25, but nextDue=Mar25 > now... wait
    // Actually: Phone due 25th, now=Mar20: thisMonthDue=Mar25>now → lastDue=Feb25
    //   lastPayment=null, paymentWindowStart=Feb25-3w=Feb4, paidThisPeriod=false
    //   due = now(Mar20).isSameOrAfter(Feb25) = true → also due
    // Let me use different dates to get all 3 groups
    // Paid: Electric due 1st, paid Mar 1
    // Unpaid-not-due: Phone due 28th (nextDue=Mar28, now=Mar20, before almostStart=Mar21)
    //   Actually almostStart = Mar28-1w = Mar21, now=Mar20 < Mar21 → paid:true... hmm
    // Let me use: now=Mar10
    //   Due: Internet due 5th, no payment → lastDue=Mar5, due:true
    //   Unpaid: Phone due 15th, no payment → lastDue=Feb15, now=Mar10>Feb15 → due:true also
    // Getting 3 groups is tricky. Use:
    //   now = Mar 10
    //   Paid: Electric due Mar 1, paid Mar 1 → paidThisPeriod, nextDue=Apr1, almostStart=Mar25 → now<almostStart → paid:true
    //   Unpaid (almost): Gas due Mar 12, paid Feb 12 → paidThisPeriod (paymentWindow=Mar12-3w=Feb20, Feb12<Feb20 → NOT in window) → unpaid
    //   Due: Water due Mar 5, no payment → overdue
    const now2 = mkNow("2024-03-10");
    const data = [
      mkBill("Electric", "2023-01-01", ["2024-03-01"]),
      mkBill("Gas", "2023-01-12", ["2024-02-12"]),
      mkBill("Water", "2023-01-05")
    ];
    const result = parseBills(data, now2, cfg);
    expect(result[0].name).toBe("Water"); // due
    expect(result[1].name).toBe("Gas"); // unpaid
    expect(result[2].name).toBe("Electric"); // paid
  });

  test("P3: within same group, sort by expected_date ascending", () => {
    const now = mkNow("2024-03-20");
    // Both due (no payments). Water due Mar 10, Internet due Mar 15
    const result = parseBills(
      [mkBill("Internet", "2023-01-15"), mkBill("Water", "2023-01-10")],
      now,
      cfg
    );
    expect(result[0].name).toBe("Water"); // earlier due date
    expect(result[1].name).toBe("Internet");
  });

  test("P4: within same group+date, sort by last_payment ascending (oldest first)", () => {
    const now = mkNow("2024-03-01");
    // Both paid, both due Apr 1 (day=1)
    // Gas last paid Feb 10, Electric last paid Feb 20 → Gas first (older payment)
    const result = parseBills(
      [
        mkBill("Electric", "2023-01-01", ["2024-02-20"]),
        mkBill("Gas", "2023-01-01", ["2024-02-10"])
      ],
      now,
      cfg
    );
    expect(result[0].name).toBe("Gas"); // older last_payment
    expect(result[1].name).toBe("Electric");
  });

  test("P5: null last_payment sorts before any real payment (treated as '0')", () => {
    const now = mkNow("2024-03-01");
    // Both paid, same expected_date (Apr 1).
    // Electric: day=1, lastDue=Mar1, paymentWindowStart=Feb9, paid Feb10 → in window → paid:true
    // Phone: started Mar1 (= lastDue) → isSameOrAfter → paidThisPeriod, last_payment=null
    const result = parseBills(
      [
        mkBill("Electric", "2023-01-01", ["2024-02-10"]),
        mkBill("Phone", "2024-03-01")
      ],
      now,
      cfg
    );
    expect(result[0].name).toBe("Phone"); // null last_payment = "0" → first
  });

  test("P6: same group+date+payment → sort by name ascending", () => {
    const now = mkNow("2024-03-01");
    const result = parseBills(
      [
        mkBill("Zeta", "2023-01-01", ["2024-02-01"]),
        mkBill("Alpha", "2023-01-01", ["2024-02-01"])
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
    const r = parseBills([mkBill("X", "2023-01-15")], mkNow("2024-03-10"), cfg);
    expect(r).toHaveLength(1);
  });

  test("P9: moment objects serialized to strings in output", () => {
    const r = parseBills(
      [mkBill("X", "2023-01-15", ["2024-03-05"])],
      mkNow("2024-03-10"),
      cfg
    );
    const bill = r[0];
    expect(typeof bill.expected_date).toBe("string");
    expect(typeof bill.last_payment).toBe("string");
    expect(moment.isMoment(bill.expected_date)).toBe(false);
    expect(moment.isMoment(bill.last_payment)).toBe(false);
  });

  test("P10: null last_payment serialized as null (not string)", () => {
    // new bill started today → last_payment = null
    const r = parseBills([mkBill("X", "2024-03-10")], mkNow("2024-03-10"), cfg);
    expect(r[0].last_payment).toBeNull();
  });
});
