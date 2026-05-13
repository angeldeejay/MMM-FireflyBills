"use strict";

const { createMiddleware } = require("@mswjs/http-middleware");
const express = require("express");
const { handlers } = require("./handlers");

const app = express();
app.use(createMiddleware(...handlers));

const server = app.listen(9696, () =>
  console.log("Firefly mock running on http://localhost:9696")
);

function shutdown(signal) {
  console.log(`\nReceived ${signal} — shutting down mock server`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5000).unref();
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGHUP", () => shutdown("SIGHUP"));
