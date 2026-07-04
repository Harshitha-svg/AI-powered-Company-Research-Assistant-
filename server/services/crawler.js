const axios = require("axios");
const cheerio = require("cheerio");
const { URL } = require("url");

const PRIORITY_KEYWORDS = [
  { key: "home", patterns: [""] },
  { key: "about", patterns: ["about", "about-us", "who-we-are", "company"] },
  { key: "products", patterns: ["product", "products"] },
  { key: "services", patterns: ["service", "services"] },
  { key: "solutions", patterns: ["solution", "solutions"] },
  { key: "pricing", patterns: ["pricing", "plans", "price"] },
  { key: "contact", patterns: ["contact", "contact-us", "support", "get-in-touch"] },
];

const IGNORE_PATTERNS = [
  "login",
  "signin",
  "sign-in",
  "signup",
  "sign-up",
  "register",
  "cart",
  "checkout",
  "account",
  "logout",
  "privacy",
  "terms",
  "cookie",
  "wp-admin",
  "wp-content",
  ".pdf",
  ".jpg",
  ".png",
  ".zip",
  ".svg",
  "mailto:",
  "tel:",
  "javascript:",
];

const MAX_PAGES = 8;
const FETCH_TIMEOUT = 12000;

function normalizeUrl(link) {
  try {
    const u = new URL(link);
    u.hash = "";
    // strip trailing slash for dedupe purposes
    let s = u.toString();
    if (s.endsWith("/")) s = s.slice(0, -1);
    return s;
  } catch {
    return null;
  }
}

function isIgnored(link) {
  const lower = link.toLowerCase();
  return IGNORE_PATTERNS.some((p) => lower.includes(p));
}

function classifyPage(pathname) {
  const lower = pathname.toLowerCase();
  for (const group of PRIORITY_KEYWORDS) {
    if (group.patterns.some((p) => p !== "" && lower.includes(p))) return group.key;
  }
  return null;
}

async function fetchHtml(url) {
  const { data } = await axios.get(url, {
    timeout: FETCH_TIMEOUT,
    maxRedirects: 5,
    headers: {
      "User-Agent":
        "Mozilla/5.0 (compatible; CompanyResearchBot/1.0; +https://example.com/bot)",
      Accept: "text/html,application/xhtml+xml",
    },
    validateStatus: (s) => s >= 200 && s < 400,
  });
  return data;
}

function extractTextAndLinks(html, baseUrl) {
  const $ = cheerio.load(html);
  $("script, style, noscript, svg, iframe").remove();

  const title = $("title").first().text().trim();
  const metaDesc = $('meta[name="description"]').attr("content") || "";

  const text = $("body")
    .text()
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 6000);

  const links = new Set();
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href");
    if (!href || isIgnored(href)) return;
    try {
      const abs = new URL(href, baseUrl);
      const base = new URL(baseUrl);
      if (abs.hostname.replace(/^www\./, "") !== base.hostname.replace(/^www\./, "")) return;
      const norm = normalizeUrl(abs.toString());
      if (norm) links.add(norm);
    } catch {
      /* ignore malformed URLs */
    }
  });

  // try to find phone / address hints in raw text
  const phoneMatch = text.match(/(\+?\d[\d\s().-]{7,}\d)/);
  const addressMatch = html.match(
    /(\d{1,5}\s+[A-Za-z0-9.,'\s]{5,80}(?:Street|St\.|Avenue|Ave\.|Road|Rd\.|Suite|Blvd|Boulevard|Drive|Dr\.|Lane|Ln\.)[A-Za-z0-9.,'\s]{0,60})/i
  );

  return {
    title,
    metaDesc,
    text,
    links: Array.from(links),
    phoneGuess: phoneMatch ? phoneMatch[1].trim() : null,
    addressGuess: addressMatch ? addressMatch[1].trim() : null,
  };
}

/**
 * Crawl a website starting at rootUrl, discovering and prioritizing
 * important pages (about, products, services, solutions, pricing, contact),
 * skipping duplicates, login pages, and irrelevant assets.
 */
async function crawlWebsite(rootUrl, onProgress = () => {}) {
  const visited = new Set();
  const pages = [];
  let phone = null;
  let address = null;

  const normalizedRoot = normalizeUrl(rootUrl);
  if (!normalizedRoot) throw new Error(`Invalid URL: ${rootUrl}`);

  onProgress(`Fetching homepage: ${normalizedRoot}`);
  let homeHtml;
  try {
    homeHtml = await fetchHtml(normalizedRoot);
  } catch (err) {
    throw new Error(`Could not reach website ${normalizedRoot}: ${err.message}`);
  }

  visited.add(normalizedRoot);
  const home = extractTextAndLinks(homeHtml, normalizedRoot);
  pages.push({ url: normalizedRoot, section: "home", ...home });
  if (home.phoneGuess) phone = home.phoneGuess;
  if (home.addressGuess) address = home.addressGuess;

  // Rank discovered links by how closely they match priority sections
  const scored = home.links
    .filter((l) => !visited.has(l))
    .map((link) => {
      let path;
      try {
        path = new URL(link).pathname;
      } catch {
        path = "";
      }
      const section = classifyPage(path);
      return { link, section, score: section ? 1 : 0 };
    })
    .filter((x) => x.section) // only crawl pages that look relevant
    .sort((a, b) => b.score - a.score);

  const toVisit = [];
  const seenSections = new Set(["home"]);
  for (const item of scored) {
    if (toVisit.length >= MAX_PAGES - 1) break;
    if (seenSections.has(item.section)) continue; // avoid duplicate-purpose pages
    seenSections.add(item.section);
    toVisit.push(item);
  }

  for (const item of toVisit) {
    if (visited.has(item.link)) continue;
    visited.add(item.link);
    onProgress(`Crawling ${item.section} page: ${item.link}`);
    try {
      const html = await fetchHtml(item.link);
      const extracted = extractTextAndLinks(html, item.link);
      pages.push({ url: item.link, section: item.section, ...extracted });
      if (!phone && extracted.phoneGuess) phone = extracted.phoneGuess;
      if (!address && extracted.addressGuess) address = extracted.addressGuess;
    } catch (err) {
      onProgress(`Skipped ${item.link} (${err.message})`);
    }
  }

  return { rootUrl: normalizedRoot, pages, phoneGuess: phone, addressGuess: address };
}

module.exports = { crawlWebsite };
