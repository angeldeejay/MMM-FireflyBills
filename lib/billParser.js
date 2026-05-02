/* global moment */
/* global fastSort */

(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory(require("moment"), require("fast-sort"));
  } else {
    root.BillParser = factory(root.moment, root.fastSort);
  }
})(
  typeof globalThis !== "undefined" ? globalThis : this,
  function (moment, fastSort) {
    var FF_DATETIME_FMT = "YYYY-MM-DDTHH:mm:ssZZ";
    var OUTPUT_FMT = "MMM DD";
    var DEFAULT_CONFIG = {
      paid: { weeks: -3 },
      almost: { weeks: -1 }
    };

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

      if (billDate.isAfter(now)) {
        return {
          name: name,
          last_payment: null,
          paid: true,
          expected_date: billDate,
          due: false
        };
      }

      var dayOfMonth = billDate.date();
      var isEndOfMonth =
        billDate.isSame(
          moment(billDate).endOf("month").startOf("day"),
          "day"
        ) || dayOfMonth >= 30;

      var dueInMonth = function (ref) {
        if (isEndOfMonth) return ref.clone().endOf("month").startOf("day");
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
      var paidThisPeriod =
        billStartedAfterLastDue ||
        (lastPayment !== null && lastPayment.isSameOrAfter(paymentWindowStart));

      if (paidThisPeriod) {
        var almostStart = nextDue.clone().add(almostWeeks, "weeks");
        return {
          name: name,
          last_payment: lastPayment,
          paid: now.isBefore(almostStart),
          expected_date: nextDue,
          due: false
        };
      }

      return {
        name: name,
        last_payment: lastPayment,
        paid: false,
        expected_date: lastDue,
        due: now.isSameOrAfter(lastDue)
      };
    }

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
              return b.expected_date ? b.expected_date.format("X") : null;
            }
          },
          {
            asc: function (b) {
              return b.last_payment ? b.last_payment.format("X") : "0";
            }
          },
          {
            asc: function (b) {
              return b.name;
            }
          }
        ])
        .map(function (b) {
          return Object.entries(b).reduce(function (acc, entry) {
            var k = entry[0];
            var v = entry[1];
            acc[k] = moment.isMoment(v)
              ? v.format(OUTPUT_FMT).replaceAll(".", "")
              : v;
            return acc;
          }, {});
        });
    }

    return { parseBill: parseBill, parseBills: parseBills };
  }
);
