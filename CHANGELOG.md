# Changelog

All notable changes to MMM-FireflyBills are documented here.
Format based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [5.0.0] — 2026-05-12

### Added
- Mock HTTP server (`tools/firefly-mock/`) using MSW v2 + `@mswjs/http-middleware`.
  Generates dynamic stubs covering all 5 bill classification cases plus the
  inactive-bill exclusion and day-30 month-clamping edge case.
- Bearer token validation in the mock server (returns 401 on mismatch).
- `sandbox` section in `package.json`: `startup: ["mock-api:start"]` launches
  the mock automatically when the MagicMirror sandbox starts.
- `sandbox:start` and `sandbox:watch` scripts (mirrors MMM-SoccerStandings pattern).
- `config.sandbox.json` configured to point at `http://localhost:9696` with a
  dummy `mock-token` (no real credentials in the repository).
- Comprehensive JSDoc on every JavaScript file (`MMM-FireflyBills.js`,
  `node_helper.js`, `lib/billParser.js`, `vitest.config.js`, test mocks).
- Algorithm banner comment in `lib/billParser.js` explaining all 5 classification
  cases, the `dueInMonth` clamping step, and the payment-window rationale.

### Fixed
- **Day-30/31 date bug**: removed the `isEndOfMonth` concept entirely.
  Firefly III always uses `Math.min(dayOfMonth, daysInMonth)` — never
  "end of month". Bills with `dayOfMonth=30` now show May 30 (not May 31)
  in 31-day months, and recover correctly in shorter months.
- **Advance-payment window**: changed `advanceWindowStart` from
  `nextDue − 3 weeks` to `nextDue − 1 week`. The 3-week window was
  mis-classifying payments made right after `lastDue` as advance payments
  for the next cycle.

### Changed
- Bumped major version to 5.0.0 (breaking algorithm correction).
- Added `msw` and `@mswjs/http-middleware` as devDependencies.

---

## [4.1.0] — 2024 (7c75926)

### Changed
- Enhanced bill date handling logic; 3-year lookback window for `paid_dates`.
- Updated `.gitignore` to exclude `package-lock.json` and `config.sandbox.json`.

---

## [4.0.5] — 2024 (7e28424)

### Fixed
- Refactored `notificationReceived` to improve bill-fetching flow.

---

## [4.0.4] — 2024 (2b94c38)

### Fixed
- `getBills()` now wraps the API call in try-catch; keeps last known state on error.

---

## [4.0.3] — 2024 (a819155)

### Fixed
- Version notification sent only after the axios client is initialized.

---

## [4.0.0] — 2024 (4e70ba0)

### Changed
- Major rewrite: replaced `node-fetch` with `axios`; introduced `moment` for
  date arithmetic; extracted bill-parsing logic into `lib/billParser.js`.
- Added `fast-sort` for deterministic bill ordering.
- Jest test suite introduced.
- `setTimeout`-based refresh loop replacing `setInterval`.

---

## [3.3.7] — 2023 (27cb207)

### Fixed
- Ongoing corrections to due/paid/unpaid state determination.

---

## [3.2.0] — 2023 (88c0af5)

### Fixed
- Payment warning logic corrected.

---

## [3.1.0] — 2023 (b0815a5)

### Added
- Configurable `almost` and `paid` week-offset windows.

---

## [3.0.0] — 2023 (cd27db0)

### Changed
- Full module rewrite; adopted MagicMirror socket-notification protocol.
- Added `descriptiveRow`, `noDataText`, `animationSpeed` configuration options.
- Font Awesome icon support for paid/unpaid indicator.

---

## [1.1.0] — 2022 (a5544bc)

### Changed
- Replaced deprecated `request` module with `node-fetch 3.x`.
- Added ESLint + Prettier.

---

## [1.0.0] — Initial release

- Display bills from a Firefly III instance on MagicMirror.
- Configurable URL, token, and update interval.
