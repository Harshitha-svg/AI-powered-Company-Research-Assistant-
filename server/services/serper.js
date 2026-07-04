const axios = require("axios");

const SERPER_URL = "https://google.serper.dev/search";

function client() {
  const apiKey = process.env.SERPER_API_KEY;
  if (!apiKey) {
    throw new Error(
      "SERPER_API_KEY is missing. Add it to server/.env (get one free at https://serper.dev)."
    );
  }
  return axios.create({
    baseURL: "https://google.serper.dev",
    headers: {
      "X-API-KEY": apiKey,
      "Content-Type": "application/json",
    },
    timeout: 15000,
  });
}

/**
 * Generic Serper search wrapper.
 */
async function search(query, { num = 10 } = {}) {
  const http = client();
  const { data } = await http.post("/search", { q: query, num });
  return data;
}

/**
 * Try to find the official website for a company name using Serper.
 */
async function findOfficialWebsite(companyName) {
  const data = await search(`${companyName} official website`, { num: 8 });

  const candidates = [
    ...(data.knowledgeGraph?.website ? [{ link: data.knowledgeGraph.website, title: data.knowledgeGraph.title }] : []),
    ...(data.organic || []),
  ];

  const blockedDomains = [
    "wikipedia.org",
    "linkedin.com",
    "facebook.com",
    "twitter.com",
    "x.com",
    "instagram.com",
    "youtube.com",
    "crunchbase.com",
    "glassdoor.com",
    "indeed.com",
    "bloomberg.com",
    "g2.com",
  ];

  for (const c of candidates) {
    if (!c?.link) continue;
    try {
      const host = new URL(c.link).hostname.replace(/^www\./, "");
      if (blockedDomains.some((b) => host.includes(b))) continue;
      return { url: c.link, hostname: host, title: c.title || companyName };
    } catch {
      continue;
    }
  }
  return null;
}

/**
 * Gather general public information / snippets about a company (for context).
 */
async function gatherCompanyInfo(companyName) {
  const [general, contact] = await Promise.all([
    search(`${companyName} company overview products services`, { num: 8 }),
    search(`${companyName} contact phone number address headquarters`, { num: 6 }),
  ]);
  return { general, contact };
}

/**
 * Search for competitors of a company.
 */
async function findCompetitors(companyName, industryHint = "") {
  const query = industryHint
    ? `top competitors and alternatives to ${companyName} in ${industryHint}`
    : `top competitors and alternatives to ${companyName}`;
  const data = await search(query, { num: 10 });
  return data;
}

module.exports = {
  search,
  findOfficialWebsite,
  gatherCompanyInfo,
  findCompetitors,
};
