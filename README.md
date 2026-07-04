# Company Research Assistant

An AI-powered company research assistant. Give it a company name or a website
URL and it will:

1. Find the official website (via **Serper.dev**, if you gave a name).
2. Crawl the site (home, about, products, services, solutions, pricing, contact).
3. Pull extra public context via **Serper.dev**.
4. Send everything to **OpenRouter** (any model you choose) to generate a
   summary, products/services, pain points, and industry.
5. Identify competitors using search + AI.
6. Render a professional, downloadable **PDF report**.
7. (Bonus) Auto-post the report + PDF to a **Discord** channel.

All of this happens behind a ChatGPT-style chat interface with live progress
updates ("scanning" log), built with a plain Node/Express backend and a
dependency-free HTML/CSS/JS frontend (no build step required).

---

## 1. Project structure

```
company-research-assistant/
├── server/                     # Backend (Node.js + Express)
│   ├── server.js                # Express app + API routes + SSE research pipeline
│   ├── services/
│   │   ├── serper.js             # Serper.dev search integration
│   │   ├── crawler.js            # Website crawler (axios + cheerio)
│   │   ├── openrouter.js         # OpenRouter AI integration
│   │   ├── pdfGenerator.js       # PDF report generation (pdfkit)
│   │   └── discord.js            # Discord bot API integration (bonus)
│   ├── data/
│   │   └── reports/              # Generated PDFs are saved here (temp storage)
│   ├── package.json
│   └── .env.example              # Copy to .env and fill in your keys
└── public/                     # Frontend (static, no build step)
    ├── index.html
    ├── styles.css
    └── app.js
```

There is **no database** — everything is generated on the fly and cached only
in memory / on disk as temporary files, per the assignment spec.

---

## 2. Prerequisites

- [Node.js 18+](https://nodejs.org/) (18 or later, for native `fetch`/modern APIs)
- A free **Serper.dev** API key: https://serper.dev (sign up → dashboard → API key)
- An **OpenRouter** API key: https://openrouter.ai/keys
- (Optional, bonus) A **Discord bot token** + the ID of a channel it can post in

---

## 3. Run it in VS Code

### Step 1 — Open the project
Unzip the project, then in VS Code: `File → Open Folder…` → select the
`company-research-assistant` folder.

### Step 2 — Install dependencies
Open a terminal in VS Code (`` Ctrl+` `` / `` Cmd+` ``) and run:

```bash
cd server
npm install
```

### Step 3 — Configure environment variables
Still inside `server/`:

```bash
cp .env.example .env      # on Windows: copy .env.example .env
```

Open the new `server/.env` file and fill in:

```
SERPER_API_KEY=your_real_serper_key
OPENROUTER_API_KEY=your_real_openrouter_key
DEFAULT_AI_MODEL=openai/gpt-4o-mini
PORT=5000
```

> Never commit `.env` — it already contains secrets. Only `.env.example` should be committed.

### Step 4 — Start the server

```bash
npm start
```

You should see:

```
🚀 Company Research Assistant running at http://localhost:5000
```

The Express server also serves the frontend, so there's nothing else to
start — open **http://localhost:5000** in your browser and you're in the chat
interface.

For auto-restart on file changes while developing, use `npm run dev`
(uses `nodemon`, already listed as a dev dependency).

### Step 5 — Try it
Type a company name (e.g. `Stripe`) or a URL (e.g. `https://linear.app`) into
the composer and hit **Research**. You'll see a live "scanning" progress log
followed by a dossier card with a **Download PDF report** button.

---

## 4. Configuring the bonus Discord integration

1. Click **⚙ Discord integration** in the sidebar.
2. Fill in your applicant name/email plus the bot token and channel ID
   provided by the evaluator.
3. Click **Save configuration**.
4. From then on, every generated report is automatically posted (with the
   PDF attached) to that Discord channel — no extra action needed.

This uses the plain Discord HTTP Bot API (`POST /channels/{id}/messages`
with a multipart file upload), so no extra Discord library/gateway
connection is required. Make sure the bot has been invited to the server
that owns the channel and has "Send Messages" + "Attach Files" permissions.

---

## 5. Choosing an AI model

The **Model** field in the sidebar accepts *any* OpenRouter model ID
(e.g. `openai/gpt-4o`, `anthropic/claude-3.5-sonnet`,
`google/gemini-flash-1.5`, `meta-llama/llama-3.1-70b-instruct`, ...) — a
dropdown of common ones is pre-populated, but you can type any valid
OpenRouter model slug. See the full list at https://openrouter.ai/models.

---

## 6. API overview (for reference / testing with curl or Postman)

| Method | Endpoint                          | Description                                   |
|--------|-----------------------------------|------------------------------------------------|
| GET    | `/api/research/stream?query=&model=` | SSE stream: live progress + final JSON result |
| POST   | `/api/research`                   | Same pipeline, single JSON response (no SSE)  |
| GET    | `/api/models`                     | Curated list of OpenRouter model IDs          |
| GET    | `/api/settings/discord`           | Current Discord config (token hidden)         |
| POST   | `/api/settings/discord`           | Save Discord bot token / channel / applicant  |
| DELETE | `/api/settings/discord`           | Remove Discord config                         |
| GET    | `/api/report/:id/download`        | Download a previously generated PDF           |
| GET    | `/reports/:file.pdf`              | Static PDF file access                        |

---

## 7. Deployment

This is a single Node.js app (Express serving both the API and the static
frontend), so it deploys anywhere that runs Node:

### Render / Railway / Fly.io (recommended — simplest for a stateful Node server)
1. Push this project to a GitHub repo.
2. Create a new **Web Service**, root directory `server/`.
3. Build command: `npm install`. Start command: `npm start`.
4. Add the environment variables from `.env` in the platform's dashboard.

### Vercel
1. Import the repo, set the **root directory** to `server/`.
2. Vercel auto-detects Node — set the start command to `node server.js`, or
   add a `vercel.json` that routes all requests to `server.js` as a
   serverless function.
3. Add the environment variables in Project Settings → Environment Variables.
4. Note: Vercel's serverless functions are stateless/ephemeral, so generated
   PDFs won't persist between requests as static files for long — that's
   fine for this assignment (no report history required), but for a
   long-lived deployment consider Render/Railway instead, or stream the PDF
   directly in the download response rather than writing to disk.

### Netlify
Netlify is primarily for static sites + serverless functions. You'd wrap
`server.js`'s Express routes as a Netlify Function (e.g. via
`serverless-http`) and keep `public/` as the published directory. Render/
Railway/Fly.io are more straightforward for this project's always-on Express
server + SSE streaming.

Whichever platform you pick, remember to set `SERPER_API_KEY` and
`OPENROUTER_API_KEY` as environment variables there too.

---

## 8. Notes on requirements coverage

- **Dual input** (name or URL): handled in `runResearchPipeline` — a simple
  URL heuristic decides whether to search-for or directly crawl.
- **Crawling**: `services/crawler.js` discovers same-domain links, classifies
  them (home/about/products/services/solutions/pricing/contact), skips
  login/asset/duplicate pages, and caps total pages fetched.
- **Serper.dev**: used to find the official site, gather public info, and
  find competitor candidates.
- **OpenRouter**: used twice — once for the company analysis (summary,
  products, pain points, industry) and once for competitor shortlisting —
  with a user-selectable model.
- **PDF report**: `services/pdfGenerator.js` (pdfkit), single-click download
  from the dossier card.
- **Chat interface**: `public/` — ChatGPT-style layout, live SSE progress
  indicators, mobile-responsive (sidebar collapses, grid reflows).
- **Discord bonus**: `services/discord.js` + settings modal — posts
  applicant + company info and uploads the PDF automatically after each
  report.
- **No auth, no DB**: confirmed — only ephemeral in-memory state and
  temp PDF files on disk.
