const axios = require("axios");
const FormData = require("form-data");
const fs = require("fs");
const path = require("path");

// Vercel's filesystem is read-only except /tmp — use it there. Note that
// /tmp is ephemeral per-invocation on Vercel, so this config won't persist
// across requests there; for a durable deployment, store this in an env
// var or a small external store instead.
const CONFIG_PATH = process.env.VERCEL
  ? path.join("/tmp", "discord-config.json")
  : path.join(__dirname, "..", "data", "discord-config.json");

function loadConfig() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"));
  } catch {
    return null;
  }
}

function saveConfig(config) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), "utf-8");
  return config;
}

function clearConfig() {
  if (fs.existsSync(CONFIG_PATH)) fs.unlinkSync(CONFIG_PATH);
}

/**
 * Sends a message + PDF attachment to the configured Discord channel using
 * the Discord Bot HTTP API (no discord.js gateway connection needed).
 */
async function sendReportToDiscord({ pdfFilePath, applicantName, applicantEmail, companyName, companyWebsite }) {
  const config = loadConfig();
  if (!config?.botToken || !config?.channelId) {
    throw new Error("Discord is not configured yet. Save the bot token and channel ID first.");
  }

  const content = [
    "**📊 New Company Research Report Generated**",
    `**Applicant:** ${applicantName || "N/A"} (${applicantEmail || "N/A"})`,
    `**Company:** ${companyName || "N/A"}`,
    `**Website:** ${companyWebsite || "N/A"}`,
  ].join("\n");

  const form = new FormData();
  form.append(
    "payload_json",
    JSON.stringify({ content })
  );
  form.append("files[0]", fs.createReadStream(pdfFilePath), {
    filename: path.basename(pdfFilePath),
    contentType: "application/pdf",
  });

  const url = `https://discord.com/api/v10/channels/${config.channelId}/messages`;
  const { data } = await axios.post(url, form, {
    headers: {
      Authorization: `Bot ${config.botToken}`,
      ...form.getHeaders(),
    },
    maxBodyLength: Infinity,
    timeout: 20000,
  });
  return data;
}

module.exports = { loadConfig, saveConfig, clearConfig, sendReportToDiscord };
