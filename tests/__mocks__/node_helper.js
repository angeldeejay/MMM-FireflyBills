/**
 * @fileoverview Vitest mock for MagicMirror's `node_helper` module.
 * Provides a minimal `create` shim so node_helper.js can be required
 * in a plain Node.js test environment.
 */
module.exports = {
  /**
   * Returns the helper object as-is, mimicking NodeHelper.create().
   *
   * @param {Object} obj - The helper definition object.
   * @returns {Object} The same object, unmodified.
   */
  create: function (obj) {
    return obj;
  }
};
