const axios = require("axios");

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

function client() {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error(
      "OPENROUTER_API_KEY is missing. Add it to server/.env (get one at https://openrouter.ai/keys)."
    );
  }
  return axios.create({
    baseURL: "https://openrouter.ai/api/v1",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": process.env.OPENROUTER_SITE_URL || "http://localhost:5000",
      "X-Title": process.env.OPENROUTER_APP_NAME || "Company Research Assistant",
    },
    timeout: 60000,
  });
}

function extractJson(raw) {
  if (!raw) return null;
  let text = raw.trim();
  // strip markdown code fences if present
  text = text.replace(/^```json\s*/i, "").replace(/^```\s*/, "").replace(/```\s*$/, "");
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

/**
 * Ask the chosen OpenRouter model to analyze crawled + searched context
 * and return structured research JSON.
 */
async function analyzeCompany({ companyName, website, crawledText, searchSnippets, model }) {
  const http = client();
  const chosenModel = model || process.env.DEFAULT_AI_MODEL || "openai/gpt-4o-mini";

  const systemPrompt = `You are a meticulous B2B company research analyst. You are given raw text
scraped from a company's website plus public search snippets. Using ONLY this
information (do not invent facts), produce a concise, accurate research
briefing. If a fact (like phone or address) truly cannot be found, use null.
Respond with STRICT JSON ONLY, no markdown, no commentary, matching exactly this schema:

{
  "companyName": string,
  "website": string,
  "phone": string | null,
  "address": string | null,
  "summary": string,               // 3-5 sentence company overview
  "products": [{ "name": string, "description": string }], // 3-8 key products or services; name is a short label (2-5 words), description is a concise 1-2 sentence explanation of what it does and who it's for, based only on the given content
  "painPoints": string[],          // 3-6 plausible customer/business pain points this company's offering addresses, or challenges the company itself likely faces
  "industry": string               // short industry label, used later for competitor search
}`;

  const userPrompt = `Company name (as given by user): ${companyName}
Website: ${website || "unknown"}

--- WEBSITE CONTENT (crawled) ---
${crawledText?.slice(0, 12000) || "(none available)"}

--- PUBLIC SEARCH SNIPPETS ---
${searchSnippets?.slice(0, 6000) || "(none available)"}

Return the JSON object now.`;

  const { data } = await http.post("/chat/completions", {
    model: chosenModel,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    temperature: 0.3,
  });

  const raw = data?.choices?.[0]?.message?.content || "";
  const parsed = extractJson(raw);
  if (!parsed) {
    throw new Error("AI response could not be parsed as JSON. Try a different model.");
  }
  return parsed;
}

/**
 * Ask the model to shortlist competitors from search results + company profile.
 */
async function identifyCompetitors({ companyName, industry, searchSnippets, model }) {
  const http = client();
  const chosenModel = model || process.env.DEFAULT_AI_MODEL || "openai/gpt-4o-mini";

  const systemPrompt = `You are a market research analyst. Given a company profile and public
search snippets about competitors, identify 3-6 real, named competitor
companies operating in the same country/industry with similar products or
services. Respond with STRICT JSON ONLY matching exactly this schema:

{
  "competitors": [
    { "name": string, "website": string | null }
  ]
}

Only include real, plausible companies mentioned or strongly implied by the
search snippets. Do not invent company names.`;

  const userPrompt = `Company: ${companyName}
Industry: ${industry || "unknown"}

--- SEARCH SNIPPETS ABOUT COMPETITORS ---
${searchSnippets?.slice(0, 6000) || "(none available)"}

Return the JSON object now.`;

  const { data } = await http.post("/chat/completions", {
    model: chosenModel,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    temperature: 0.3,
  });

  const raw = data?.choices?.[0]?.message?.content || "";
  const parsed = extractJson(raw);
  if (!parsed || !Array.isArray(parsed.competitors)) {
    return { competitors: [] };
  }
  return parsed;
}

module.exports = { analyzeCompany, identifyCompetitors };
