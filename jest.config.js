module.exports = {
  testEnvironment: "node",
  testMatch: ["**/tests/**/*.test.js"],
  moduleNameMapper: {
    "^node_helper$": "<rootDir>/tests/__mocks__/node_helper.js",
    "^logger$": "<rootDir>/tests/__mocks__/logger.js"
  },
  collectCoverageFrom: ["lib/**/*.js", "node_helper.js"],
  coverageReporters: ["text", "lcov"]
};
