require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");

const serper = require("./services/serper");
const { crawlWebsite } = require("./services/crawler");
const { analyzeCompany, identifyCompetitors } = require("./services/openrouter");
const { generateReportPdf, REPORTS_DIR } = require("./services/pdfGenerator");
const discordService = require("./services/discord");

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json({ limit: "2mb" }));
app.use(express.static(path.join(__dirname, "..", "public")));
app.use("/reports", express.static(REPORTS_DIR));

// In-memory cache of last few generated reports, keyed by id (no DB needed)
const reportCache = new Map();

function looksLikeUrl(input) {
  const s = input.trim();
  return /^https?:\/\//i.test(s) || /^[a-z0-9-]+\.[a-z]{2,}(\/.*)?$/i.test(s);
}

function normalizeToUrl(input) {
  let s = input.trim();
  if (!/^https?:\/\//i.test(s)) s = `https://${s}`;
  return s;
}

function flattenSearchSnippets(searchData) {
  if (!searchData) return "";
  const lines = [];
  if (searchData.knowledgeGraph) {
    const kg = searchData.knowledgeGraph;
    lines.push(`Knowledge Graph: ${kg.title || ""} - ${kg.description || ""}`);
    if (kg.attributes) {
      Object.entries(kg.attributes).forEach(([k, v]) => lines.push(`${k}: ${v}`));
    }
  }
  (searchData.organic || []).slice(0, 8).forEach((r) => {
    lines.push(`- ${r.title}: ${r.snippet || ""} (${r.link})`);
  });
  return lines.join("\n");
}

/**
 * Core research pipeline. Emits progress via `emit(message)`.
 */
async function runResearchPipeline({ query, model }, emit) {
  let companyName = query.trim();
  let website = null;

  if (looksLikeUrl(query)) {
    website = normalizeToUrl(query);
    emit(`Treating input as a website URL: ${website}`);
  } else {
    emit(`Searching Serper.dev for "${companyName}"'s official website...`);
    const found = await serper.findOfficialWebsite(companyName);
    if (found) {
      website = found.url;
      emit(`Found official website: ${website}`);
    } else {
      emit("Could not confidently determine an official website from search results.");
    }
  }

  // Crawl the website
  let crawlResult = null;
  if (website) {
    try {
      crawlResult = await crawlWebsite(website, emit);
    } catch (err) {
      emit(`Crawling failed: ${err.message}`);
    }
  }

  // Derive a working company name if we started from a URL
  if (!companyName || looksLikeUrl(query)) {
    const homeTitle = crawlResult?.pages?.[0]?.title;
    companyName = homeTitle ? homeTitle.split(/[-|·]/)[0].trim() : new URL(website).hostname.replace(/^www\./, "");
    emit(`Using company name: ${companyName}`);
  }

  // Gather public search info (about, contact, etc.)
  emit(`Gathering public information about "${companyName}" via Serper.dev...`);
  let publicInfo = null;
  try {
    publicInfo = await serper.gatherCompanyInfo(companyName);
  } catch (err) {
    emit(`Public search failed: ${err.message}`);
  }

  const crawledText = (crawlResult?.pages || [])
    .map((p) => `### ${p.section.toUpperCase()} (${p.url})\n${p.title}\n${p.metaDesc}\n${p.text}`)
    .join("\n\n");

  const searchSnippets = [
    flattenSearchSnippets(publicInfo?.general),
    flattenSearchSnippets(publicInfo?.contact),
  ].join("\n");

  // AI analysis
  emit(`Sending collected data to OpenRouter (model: ${model || process.env.DEFAULT_AI_MODEL || "default"})...`);
  const analysis = await analyzeCompany({
    companyName,
    website,
    crawledText,
    searchSnippets,
    model,
  });

  // Prefer crawler-detected phone/address if AI didn't find them
  const phone = analysis.phone || crawlResult?.phoneGuess || null;
  const address = analysis.address || crawlResult?.addressGuess || null;

  // Competitor research
  emit(`Searching for competitors of "${companyName}"...`);
  let competitorSearch = null;
  try {
    competitorSearch = await serper.findCompetitors(companyName, analysis.industry);
  } catch (err) {
    emit(`Competitor search failed: ${err.message}`);
  }

  emit("Asking AI to identify and shortlist competitors...");
  const competitorAnalysis = await identifyCompetitors({
    companyName,
    industry: analysis.industry,
    searchSnippets: flattenSearchSnippets(competitorSearch),
    model,
  });

  const result = {
    companyName: analysis.companyName || companyName,
    website: analysis.website || website || "N/A",
    phone,
    address,
    summary: analysis.summary,
    products: analysis.products || [],
    painPoints: analysis.painPoints || [],
    industry: analysis.industry || null,
    competitors: competitorAnalysis.competitors || [],
  };

  emit("Generating PDF report...");
  const { filePath, fileName } = await generateReportPdf(result);
  result.pdfUrl = `/reports/${fileName}`;
  result.pdfFilePath = filePath;

  const id = fileName.replace(/\.pdf$/, "");
  reportCache.set(id, result);

  emit("Done!");
  return { ...result, id };
}

// --- SSE research endpoint (real-time progress) ---
app.get("/api/research/stream", async (req, res) => {
  const { query, model } = req.query;
  if (!query || !query.trim()) {
    res.status(400).json({ error: "Missing query" });
    return;
  }

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  const emit = (message) => {
    res.write(`event: progress\ndata: ${JSON.stringify({ message })}\n\n`);
  };

  try {
    const result = await runResearchPipeline({ query, model }, emit);

    // Auto-send to Discord if configured
    const discordConfig = discordService.loadConfig();
    if (discordConfig?.botToken && discordConfig?.channelId) {
      try {
        emit("Sending report to Discord...");
        await discordService.sendReportToDiscord({
          pdfFilePath: result.pdfFilePath,
          applicantName: discordConfig.applicantName,
          applicantEmail: discordConfig.applicantEmail,
          companyName: result.companyName,
          companyWebsite: result.website,
        });
        emit("Report sent to Discord successfully.");
      } catch (err) {
        emit(`Discord send failed: ${err.message}`);
      }
    }

    delete result.pdfFilePath;
    res.write(`event: result\ndata: ${JSON.stringify(result)}\n\n`);
  } catch (err) {
    res.write(`event: error\ndata: ${JSON.stringify({ message: err.message })}\n\n`);
  } finally {
    res.end();
  }
});

// --- Non-streaming fallback endpoint ---
app.post("/api/research", async (req, res) => {
  const { query, model } = req.body;
  if (!query || !query.trim()) return res.status(400).json({ error: "Missing query" });
  try {
    const result = await runResearchPipeline({ query, model }, () => {});
    delete result.pdfFilePath;
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Discord settings ---
app.get("/api/settings/discord", (req, res) => {
  const config = discordService.loadConfig();
  if (!config) return res.json({ configured: false });
  res.json({
    configured: true,
    channelId: config.channelId,
    applicantName: config.applicantName,
    applicantEmail: config.applicantEmail,
    // never echo back the bot token
  });
});

app.post("/api/settings/discord", (req, res) => {
  const { botToken, channelId, applicantName, applicantEmail } = req.body;
  if (!botToken || !channelId) {
    return res.status(400).json({ error: "botToken and channelId are required" });
  }
  discordService.saveConfig({ botToken, channelId, applicantName, applicantEmail });
  res.json({ ok: true });
});

app.delete("/api/settings/discord", (req, res) => {
  discordService.clearConfig();
  res.json({ ok: true });
});

// --- Available AI models (curated list; user can also type a custom model id) ---
app.get("/api/models", (req, res) => {
  res.json({
    models: [
      "openai/gpt-4o-mini",
      "openai/gpt-4o",
      "anthropic/claude-3.5-sonnet",
      "anthropic/claude-3-haiku",
      "google/gemini-flash-1.5",
      "meta-llama/llama-3.1-70b-instruct",
      "mistralai/mixtral-8x7b-instruct",
    ],
  });
});

// --- Download a previously generated PDF by id ---
app.get("/api/report/:id/download", (req, res) => {
  const filePath = path.join(REPORTS_DIR, `${req.params.id}.pdf`);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: "Report not found" });
  res.download(filePath);
});

app.get("/api/health", (req, res) => res.json({ ok: true }));

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`🚀 Company Research Assistant running at http://localhost:${PORT}`);
  });
}

module.exports = app;
