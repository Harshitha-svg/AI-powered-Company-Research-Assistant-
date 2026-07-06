// Vercel serverless entry point.
// Vercel auto-detects any file under /api as a serverless function.
// Node's built-in `require` handler for Express apps: since `app` is just a
// function of (req, res), Vercel's Node runtime can invoke it directly.
const app = require("../server/server.js");

module.exports = app;
