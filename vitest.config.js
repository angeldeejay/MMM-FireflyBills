const path = require("path");

/** @type {import("vitest/config").UserConfig} */
module.exports = {
  test: {
    globals: true,
    environment: "node",
    include: ["tests/**/*.test.js"],
    setupFiles: ["./tests/setup.js"],
    coverage: {
      provider: "v8",
      include: ["lib/**/*.js", "node_helper.js"],
      reporter: ["text", "lcov", "html"]
    }
  }
};
