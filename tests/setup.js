/**
 * @fileoverview Vitest global setup — patches Node.js module resolver so that
 * bare specifiers `node_helper` and `logger` (MagicMirror runtime globals)
 * resolve to the local mock files during tests.
 *
 * This runs before any test file is loaded and affects all subsequent
 * require() calls in the process, including those made from source files
 * (e.g. node_helper.js requiring "node_helper").
 */

const Module = require("module");
const path = require("path");

const MOCKS_DIR = path.resolve(__dirname, "__mocks__");

const ALIAS_MAP = {
  node_helper: path.join(MOCKS_DIR, "node_helper.js"),
  logger: path.join(MOCKS_DIR, "logger.js")
};

const originalResolveFilename = Module._resolveFilename.bind(Module);

Module._resolveFilename = function (request, parent, isMain, options) {
  if (Object.prototype.hasOwnProperty.call(ALIAS_MAP, request)) {
    return ALIAS_MAP[request];
  }
  return originalResolveFilename(request, parent, isMain, options);
};
