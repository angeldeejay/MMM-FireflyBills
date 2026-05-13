const fs = require("fs");
const moment = require("moment");
const helper = require("../node_helper");

const VALID_BILLS_RESPONSE = {
  data: [
    {
      id: "1",
      attributes: {
        active: true,
        name: "Electric",
        date: "2023-01-15T00:00:00+0000",
        paid_dates: []
      }
    },
    {
      id: "2",
      attributes: {
        active: false,
        name: "Inactive Bill",
        date: "2023-01-20T00:00:00+0000",
        paid_dates: []
      }
    }
  ]
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  helper.sendSocketNotification = vi.fn();
  helper.start();
  vi.spyOn(fs, "readFileSync").mockReturnValue(
    JSON.stringify({ version: "5.0.0" })
  );
  vi.stubGlobal("fetch", vi.fn());
});

// ─── checkBillsResponse ───────────────────────────────────────────────────────

describe("checkBillsResponse", () => {
  test("NC1: valid response with data array → does not throw", () => {
    expect(() => helper.checkBillsResponse(VALID_BILLS_RESPONSE)).not.toThrow();
  });

  test("NC2: empty data array → does not throw", () => {
    expect(() =>
      helper.checkBillsResponse({ data: [] })
    ).not.toThrow();
  });

  test("NC3: missing data key → throws", () => {
    expect(() => helper.checkBillsResponse({})).toThrow();
  });

  test("NC4: data is string → throws", () => {
    expect(() =>
      helper.checkBillsResponse({ data: "invalid" })
    ).toThrow();
  });

  test("NC5: null body → throws without crashing process", () => {
    expect(() => helper.checkBillsResponse(null)).toThrow();
  });
});

// ─── getBills ─────────────────────────────────────────────────────────────────

describe("getBills", () => {
  test("NB1: successful API call caches active bills", async () => {
    fetch.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue(VALID_BILLS_RESPONSE)
    });
    helper.baseURL = "http://localhost:9696/api/v1";
    helper.token = "mock-token";

    await helper.getBills();

    expect(helper.bills).toHaveLength(1);
    expect(helper.bills[0].attributes.name).toBe("Electric");
    expect(helper.ready).toBe(true);
  });

  test("NB2 (Bug 2 regression): API error preserves existing cache", async () => {
    const existing = [
      { id: "cached", attributes: { active: true, name: "Cached" } }
    ];
    helper.bills = existing;
    fetch.mockRejectedValue(new Error("Network error"));
    helper.baseURL = "http://localhost:9696/api/v1";
    helper.token = "mock-token";

    await helper.getBills();

    expect(helper.bills).toHaveLength(1);
    expect(helper.bills[0].id).toBe("cached");
  });

  test("NB3: filters out inactive bills", async () => {
    fetch.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue(VALID_BILLS_RESPONSE)
    });
    helper.baseURL = "http://localhost:9696/api/v1";
    helper.token = "mock-token";

    await helper.getBills();

    const names = helper.bills.map((b) => b.attributes.name);
    expect(names).not.toContain("Inactive Bill");
  });

  test("NB4 (Bug 4 regression): start param uses 3-year lookback", async () => {
    fetch.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ data: [] })
    });
    helper.baseURL = "http://localhost:9696/api/v1";
    helper.token = "mock-token";

    await helper.getBills();

    const callArgs = fetch.mock.calls[0];
    const url = new URL(callArgs[0]);
    const startDate = moment(url.searchParams.get("start"), "YYYY-MM-DD");
    const endDate = moment(url.searchParams.get("end"), "YYYY-MM-DD");

    const spanYears = endDate.diff(startDate, "years", true);
    expect(spanYears).toBeGreaterThanOrEqual(3);
    expect(startDate.isBefore(moment().subtract(2, "years"))).toBe(true);
  });

  test("NB6: HTTP error response (ok=false) → throws, preserves cache", async () => {
    const existing = [{ id: "cached", attributes: { active: true, name: "Cached" } }];
    helper.bills = existing;
    fetch.mockResolvedValue({ ok: false, status: 401, json: vi.fn() });
    helper.baseURL = "http://localhost:9696/api/v1";
    helper.token = "bad-token";

    await helper.getBills();

    expect(helper.bills).toBe(existing);
  });

  test("NB7: bills unchanged (ready=true + same cache) → no reassignment", async () => {
    const existing = [VALID_BILLS_RESPONSE.data[0]];
    fetch.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue(VALID_BILLS_RESPONSE)
    });
    helper.baseURL = "http://localhost:9696/api/v1";
    helper.token = "mock-token";
    helper.bills = existing;
    helper.ready = true;

    await helper.getBills();

    expect(helper.bills).toBe(existing);
    expect(helper.ready).toBe(true);
  });

  test("NB5: busy flag reset to false after getBills completes", async () => {
    fetch.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ data: [] })
    });
    helper.baseURL = "http://localhost:9696/api/v1";
    helper.token = "mock-token";
    helper.busy = true;

    await helper.getBills();

    expect(helper.busy).toBe(false);
  });
});

// ─── notificationReceived ─────────────────────────────────────────────────────

describe("notificationReceived — GET_VERSION", () => {
  test("NN1: GET_VERSION stores baseURL/token and sends version", () => {
    helper.notificationReceived("GET_VERSION", {
      url: "http://localhost:9696",
      token: "test-token"
    });

    expect(helper.baseURL).toContain("localhost:9696");
    expect(helper.token).toBe("test-token");
    expect(helper.sendSocketNotification).toHaveBeenCalledWith(
      expect.stringContaining("VERSION"),
      expect.any(String)
    );
  });

  test("NN6: GET_VERSION called twice overwrites baseURL and token", () => {
    helper.notificationReceived("GET_VERSION", {
      url: "http://host1",
      token: "t1"
    });
    helper.notificationReceived("GET_VERSION", {
      url: "http://host2",
      token: "t2"
    });

    expect(helper.baseURL).toContain("host2");
    expect(helper.token).toBe("t2");
  });
});

describe("notificationReceived — GET_BILLS", () => {
  test("NN2 (Bug 1 regression): busy=true → sends cached bills, does not fetch", () => {
    helper.baseURL = "http://localhost:9696/api/v1";
    helper.token = "mock-token";
    helper.busy = true;
    helper.bills = [
      { id: "1", attributes: { active: true, name: "X", paid_dates: [] } }
    ];

    helper.notificationReceived("GET_BILLS");

    expect(helper.sendSocketNotification).toHaveBeenCalledWith(
      expect.stringContaining("BILLS"),
      expect.any(Array)
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  test("NN3 (Bug 3 regression): baseURL=null → no crash, no fetch, no notification", () => {
    helper.baseURL = null;

    expect(() => helper.notificationReceived("GET_BILLS")).not.toThrow();
    expect(fetch).not.toHaveBeenCalled();
    expect(helper.sendSocketNotification).not.toHaveBeenCalled();
  });

  test("NN4: not busy + baseURL set → triggers API fetch", () => {
    helper.baseURL = "http://localhost:9696/api/v1";
    helper.token = "mock-token";
    helper.busy = false;
    fetch.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ data: [] })
    });

    helper.notificationReceived("GET_BILLS");

    expect(helper.busy).toBe(true);
  });

  test("NN4b: getBills rejection in notificationReceived is swallowed by .catch", async () => {
    helper.baseURL = "http://localhost:9696/api/v1";
    helper.token = "mock-token";
    vi.spyOn(helper, "getBills").mockRejectedValue(new Error("boom"));

    helper.notificationReceived("GET_BILLS");

    await new Promise((r) => setTimeout(r, 20));
    // no unhandled rejection, no crash
  });

  test("NN5: unknown notification → no crash, no sendSocketNotification", () => {
    expect(() =>
      helper.notificationReceived("UNKNOWN_EVENT", {})
    ).not.toThrow();
    expect(helper.sendSocketNotification).not.toHaveBeenCalled();
  });
});

// ─── socketNotificationReceived ──────────────────────────────────────────────

describe("socketNotificationReceived", () => {
  test("NS1: strips module prefix and delegates to notificationReceived", () => {
    helper.baseURL = null;

    expect(() =>
      helper.socketNotificationReceived(`${helper.name}_GET_BILLS`)
    ).not.toThrow();
    expect(helper.sendSocketNotification).not.toHaveBeenCalled();
  });

  test("NS2: payload null fallback — no crash when payload omitted", () => {
    expect(() =>
      helper.socketNotificationReceived(`${helper.name}_UNKNOWN_EVENT`)
    ).not.toThrow();
  });
});
