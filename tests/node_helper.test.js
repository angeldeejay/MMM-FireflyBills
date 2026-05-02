jest.mock("axios");
jest.mock("fs");

const axios = require("axios");
const fs = require("fs");
const moment = require("moment");
const helper = require("../node_helper");

const VALID_BILLS_RESPONSE = {
  data: {
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
  }
};

let mockClient;

beforeEach(() => {
  jest.clearAllMocks();
  // Reset helper state
  helper.sendSocketNotification = jest.fn();
  helper.start();
  // Mock package.json read for getVersion()
  fs.readFileSync.mockReturnValue(JSON.stringify({ version: "4.4.0" }));
  // Mock axios instance
  mockClient = { get: jest.fn() };
  axios.create.mockReturnValue(mockClient);
});

// ─── checkBillsResponse ───────────────────────────────────────────────────────

describe("checkBillsResponse", () => {
  test("NC1: valid response with data array → does not throw", () => {
    expect(() => helper.checkBillsResponse(VALID_BILLS_RESPONSE)).not.toThrow();
  });

  test("NC2: empty data array → does not throw", () => {
    expect(() =>
      helper.checkBillsResponse({ data: { data: [] } })
    ).not.toThrow();
  });

  test("NC3: missing response.data → throws", () => {
    expect(() => helper.checkBillsResponse({})).toThrow();
  });

  test("NC4: data.data is string → throws", () => {
    expect(() =>
      helper.checkBillsResponse({ data: { data: "invalid" } })
    ).toThrow();
  });

  test("NC5: null response → throws without crashing process", () => {
    expect(() => helper.checkBillsResponse(null)).toThrow();
  });
});

// ─── getBills ─────────────────────────────────────────────────────────────────

describe("getBills", () => {
  test("NB1: successful API call caches active bills", async () => {
    mockClient.get.mockResolvedValue(VALID_BILLS_RESPONSE);
    helper.client = mockClient;

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
    mockClient.get.mockRejectedValue(new Error("Network error"));
    helper.client = mockClient;

    await helper.getBills();

    expect(helper.bills).toHaveLength(1);
    expect(helper.bills[0].id).toBe("cached");
  });

  test("NB3: filters out inactive bills", async () => {
    mockClient.get.mockResolvedValue(VALID_BILLS_RESPONSE);
    helper.client = mockClient;

    await helper.getBills();

    const names = helper.bills.map((b) => b.attributes.name);
    expect(names).not.toContain("Inactive Bill");
  });

  test("NB4 (Bug 4 regression): start param uses 3-year lookback", async () => {
    mockClient.get.mockResolvedValue({ data: { data: [] } });
    helper.client = mockClient;

    await helper.getBills();

    const callArgs = mockClient.get.mock.calls[0];
    const params = callArgs[1].params;
    const startDate = moment(params.start, "YYYY-MM-DD");
    const endDate = moment(params.end, "YYYY-MM-DD");

    // Date window must span at least 3 years
    const spanYears = endDate.diff(startDate, "years", true);
    expect(spanYears).toBeGreaterThanOrEqual(3);

    // start must be at least 2 years in the past (not just 1 year)
    expect(startDate.isBefore(moment().subtract(2, "years"))).toBe(true);
  });

  test("NB5: busy flag reset to false after getBills completes", async () => {
    mockClient.get.mockResolvedValue({ data: { data: [] } });
    helper.client = mockClient;
    helper.busy = true;

    await helper.getBills();

    expect(helper.busy).toBe(false);
  });
});

// ─── notificationReceived ─────────────────────────────────────────────────────

describe("notificationReceived — GET_VERSION", () => {
  test("NN1: GET_VERSION initializes axios client and sends version", () => {
    helper.notificationReceived("GET_VERSION", {
      url: "http://localhost:9696",
      token: "test-token"
    });

    expect(axios.create).toHaveBeenCalledWith(
      expect.objectContaining({
        baseURL: expect.stringContaining("localhost:9696")
      })
    );
    expect(helper.sendSocketNotification).toHaveBeenCalledWith(
      expect.stringContaining("VERSION"),
      expect.any(String)
    );
  });

  test("NN6: GET_VERSION called twice overwrites client cleanly", () => {
    helper.notificationReceived("GET_VERSION", {
      url: "http://host1",
      token: "t1"
    });
    helper.notificationReceived("GET_VERSION", {
      url: "http://host2",
      token: "t2"
    });

    expect(axios.create).toHaveBeenCalledTimes(2);
    expect(helper.client).toBe(mockClient); // last call's return value
  });
});

describe("notificationReceived — GET_BILLS", () => {
  test("NN2 (Bug 1 regression): busy=true → sends cached bills, does not fetch", () => {
    helper.client = mockClient;
    helper.busy = true;
    helper.bills = [
      { id: "1", attributes: { active: true, name: "X", paid_dates: [] } }
    ];

    helper.notificationReceived("GET_BILLS");

    expect(helper.sendSocketNotification).toHaveBeenCalledWith(
      expect.stringContaining("BILLS"),
      expect.any(Array)
    );
    expect(mockClient.get).not.toHaveBeenCalled();
  });

  test("NN3 (Bug 3 regression): client=null → no crash, no fetch, no notification", () => {
    helper.client = null;

    expect(() => helper.notificationReceived("GET_BILLS")).not.toThrow();
    expect(mockClient.get).not.toHaveBeenCalled();
    expect(helper.sendSocketNotification).not.toHaveBeenCalled();
  });

  test("NN4: not busy + client set → triggers API fetch", () => {
    helper.client = mockClient;
    helper.busy = false;
    mockClient.get.mockResolvedValue({ data: { data: [] } });

    helper.notificationReceived("GET_BILLS");

    // busy flag set synchronously before async fetch
    expect(helper.busy).toBe(true);
  });

  test("NN5: unknown notification → no crash, no sendSocketNotification", () => {
    expect(() =>
      helper.notificationReceived("UNKNOWN_EVENT", {})
    ).not.toThrow();
    expect(helper.sendSocketNotification).not.toHaveBeenCalled();
  });
});
