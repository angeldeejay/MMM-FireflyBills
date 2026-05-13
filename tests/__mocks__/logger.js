/**
 * @fileoverview Vitest mock for MagicMirror's `logger` global.
 * Replaces all log methods with no-op vi.fn() spies.
 */
module.exports = {
  log: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn()
};
