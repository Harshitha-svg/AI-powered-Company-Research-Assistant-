const chatEl = document.getElementById("chat");
const welcomeEl = document.getElementById("welcome");
const composer = document.getElementById("composer");
const queryInput = document.getElementById("queryInput");
const sendBtn = document.getElementById("sendBtn");
const modelInput = document.getElementById("modelInput");
const modelList = document.getElementById("modelList");
const historyList = document.getElementById("historyList");
const newChatBtn = document.getElementById("newChatBtn");

const settingsBtn = document.getElementById("settingsBtn");
const settingsModal = document.getElementById("settingsModal");
const closeSettings = document.getElementById("closeSettings");
const saveSettings = document.getElementById("saveSettings");
const clearSettingsBtn = document.getElementById("clearSettings");
const settingsStatus = document.getElementById("settingsStatus");

let history = [];

// ---------- Helpers ----------
function scrollToBottom() {
  chatEl.scrollTop = chatEl.scrollHeight;
}

function hideWelcome() {
  if (welcomeEl) welcomeEl.style.display = "none";
}

function addUserMessage(text) {
  hideWelcome();
  const div = document.createElement("div");
  div.className = "msg user";
  div.innerHTML = `
    <div class="msg-avatar">🧑</div>
    <div class="msg-bubble"></div>`;
  div.querySelector(".msg-bubble").textContent = text;
  chatEl.appendChild(div);
  scrollToBottom();
}

function addAssistantWrapper() {
  const div = document.createElement("div");
  div.className = "msg assistant";
  div.innerHTML = `<div class="msg-avatar">◎</div><div class="msg-bubble assistant-content"></div>`;
  chatEl.appendChild(div);
  scrollToBottom();
  return div.querySelector(".assistant-content");
}

function createProgressPanel(container) {
  const panel = document.createElement("div");
  panel.className = "progress-panel";
  panel.innerHTML = `<span class="spinner"></span><span class="status-text">Starting research…</span>`;
  container.appendChild(panel);
  scrollToBottom();
  return panel;
}

function addProgressLine(panel, text) {
  const statusText = panel.querySelector(".status-text");
  if (statusText) statusText.textContent = text;
  scrollToBottom();
}

function finishProgressPanel(panel) {
  // Research finished — the panel's job is done, remove it so only the
  // final report (or error) is left in the conversation.
  panel.remove();
}

function escapeHtml(str) {
  return (str || "").replace(/[&<>"']/g, (m) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[m]));
}

function getFaviconUrl(website) {
  try {
    const host = new URL(website).hostname;
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64`;
  } catch {
    return null;
  }
}

function renderReportCard(container, result) {
  const card = document.createElement("div");
  card.className = "report-card";
  const cardId = `c${Date.now()}${Math.floor(Math.random() * 10000)}`;

  const productsHtml = result.products?.length
    ? `<div class="product-list">${result.products
        .map((p, i) => {
          const name = typeof p === "string" ? p : p.name || "Unnamed";
          const description =
            typeof p === "string"
              ? null
              : p.description || null;
          return `<div class="product-item">
            <button type="button" class="product-btn" data-product="${cardId}-${i}">
              <span>${escapeHtml(name)}</span>
              <span class="product-chevron">›</span>
            </button>
            <div class="product-detail" data-detail="${cardId}-${i}">
              <p>${escapeHtml(description || "No additional detail was found for this product or service.")}</p>
            </div>
          </div>`;
        })
        .join("")}</div>`
    : `<p>No product/service information available.</p>`;

  const painHtml = result.painPoints?.length
    ? `<ul>${result.painPoints.map((p) => `<li>${escapeHtml(p)}</li>`).join("")}</ul>`
    : `<p>No pain points identified.</p>`;

  const competitorsHtml = result.competitors?.length
    ? `<div class="competitor-list">${result.competitors
        .map(
          (c) => `<div class="competitor-row">
            <span>${escapeHtml(c.name)}</span>
            ${c.website ? `<a href="${escapeHtml(c.website)}" target="_blank" rel="noopener">${escapeHtml(c.website)}</a>` : `<span style="color:var(--text-dim)">N/A</span>`}
          </div>`
        )
        .join("")}</div>`
    : `<p>No competitors identified.</p>`;

  // Each tab: id, label, content. Overview is shown by default.
  const tabs = [
    {
      id: "overview",
      label: "Overview",
      content: `
        <div class="report-grid">
          <div><div class="g-label">Phone</div>${escapeHtml(result.phone || "Not publicly available")}</div>
          <div><div class="g-label">Address</div>${escapeHtml(result.address || "Not publicly available")}</div>
        </div>`,
    },
    {
      id: "summary",
      label: "Summary",
      content: `<div class="report-section"><h4>Company Summary</h4><p>${escapeHtml(result.summary || "No summary available.")}</p></div>`,
    },
    {
      id: "products",
      label: "Products / Services",
      content: `<div class="report-section"><h4>Products / Services</h4>${productsHtml}</div>`,
    },
    {
      id: "pain",
      label: "Pain Points",
      content: `<div class="report-section"><h4>AI-Generated Pain Points</h4>${painHtml}</div>`,
    },
    {
      id: "competitors",
      label: "Competitors",
      content: `<div class="report-section"><h4>Competitors</h4>${competitorsHtml}</div>`,
    },
  ];

  const tabButtonsHtml = tabs
    .map((t, i) => `<button type="button" class="tab-btn${i === 0 ? " active" : ""}" data-tab="${t.id}">${escapeHtml(t.label)}</button>`)
    .join("");

  const tabPanelsHtml = tabs
    .map((t, i) => `<div class="tab-panel${i === 0 ? " active" : ""}" data-panel="${t.id}">${t.content}</div>`)
    .join("");

  const faviconUrl = result.website ? getFaviconUrl(result.website) : null;

  card.innerHTML = `
    <div class="report-head">
      <div class="report-head-main">
        ${faviconUrl ? `<img class="report-favicon" src="${escapeHtml(faviconUrl)}" alt="" loading="lazy" onerror="this.remove()" />` : ""}
        <div>
          <h3>${escapeHtml(result.companyName)}</h3>
          ${result.website ? `<a href="${escapeHtml(result.website)}" target="_blank" rel="noopener">${escapeHtml(result.website)}</a>` : ""}
        </div>
      </div>
    </div>
    <div class="report-tabs">${tabButtonsHtml}</div>
    <div class="report-body">${tabPanelsHtml}</div>
    <div class="report-actions">
      <a class="download-btn" href="${result.pdfUrl}" download>⬇ Download PDF report</a>
    </div>
  `;

  // Wire up tab switching, scoped to this card only
  card.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const targetId = btn.dataset.tab;
      card.querySelectorAll(".tab-btn").forEach((b) => b.classList.toggle("active", b === btn));
      card.querySelectorAll(".tab-panel").forEach((p) => p.classList.toggle("active", p.dataset.panel === targetId));
    });
  });

  // Wire up product/service buttons: click to reveal that item's info
  card.querySelectorAll(".product-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const key = btn.dataset.product;
      const detail = card.querySelector(`.product-detail[data-detail="${key}"]`);
      const isOpen = btn.classList.contains("open");
      btn.classList.toggle("open", !isOpen);
      if (detail) detail.classList.toggle("open", !isOpen);
    });
  });

  container.appendChild(card);
  scrollToBottom();
}

function addErrorBubble(container, message) {
  const div = document.createElement("div");
  div.className = "error-bubble";
  div.textContent = `⚠ ${message}`;
  container.appendChild(div);
  scrollToBottom();
}

function addToHistory(result) {
  history.unshift(result);
  history = history.slice(0, 12);
  historyList.innerHTML = "";
  history.forEach((r) => {
    const item = document.createElement("div");
    item.className = "history-item";
    item.innerHTML = `<span class="h-name">${escapeHtml(r.companyName)}</span><span class="h-site">${escapeHtml(r.website || "")}</span>`;
    item.addEventListener("click", () => {
      hideWelcome();
      const wrap = addAssistantWrapper();
      renderReportCard(wrap, r);
    });
    historyList.appendChild(item);
  });
}

// ---------- Research flow (SSE) ----------
function runResearch(query) {
  addUserMessage(query);
  const container = addAssistantWrapper();
  const panel = createProgressPanel(container);

  sendBtn.disabled = true;
  const model = modelInput.value.trim();
  const url = `/api/research/stream?query=${encodeURIComponent(query)}&model=${encodeURIComponent(model)}`;
  const es = new EventSource(url);

  es.addEventListener("progress", (e) => {
    const data = JSON.parse(e.data);
    addProgressLine(panel, data.message);
  });

  es.addEventListener("result", (e) => {
    const result = JSON.parse(e.data);
    finishProgressPanel(panel);
    renderReportCard(container, result);
    addToHistory(result);
    es.close();
    sendBtn.disabled = false;
  });

  es.addEventListener("error", (e) => {
    let message = "Something went wrong while researching this company.";
    try {
      if (e.data) message = JSON.parse(e.data).message || message;
    } catch { /* ignore */ }
    finishProgressPanel(panel);
    addErrorBubble(container, message);
    es.close();
    sendBtn.disabled = false;
  });
}

composer.addEventListener("submit", (e) => {
  e.preventDefault();
  const query = queryInput.value.trim();
  if (!query) return;
  queryInput.value = "";
  runResearch(query);
});

document.querySelectorAll(".chip").forEach((chip) => {
  chip.addEventListener("click", () => {
    queryInput.value = chip.dataset.fill;
    queryInput.focus();
  });
});

newChatBtn.addEventListener("click", () => {
  chatEl.innerHTML = "";
  chatEl.appendChild(welcomeEl);
  welcomeEl.style.display = "block";
});

// ---------- Model list ----------
fetch("/api/models")
  .then((r) => r.json())
  .then((data) => {
    (data.models || []).forEach((m) => {
      const opt = document.createElement("option");
      opt.value = m;
      modelList.appendChild(opt);
    });
  })
  .catch(() => {});

// ---------- Discord settings modal ----------
function openModal() {
  settingsModal.classList.remove("hidden");
  settingsStatus.textContent = "";
  fetch("/api/settings/discord")
    .then((r) => r.json())
    .then((data) => {
      if (data.configured) {
        document.getElementById("channelId").value = data.channelId || "";
        document.getElementById("applicantName").value = data.applicantName || "";
        document.getElementById("applicantEmail").value = data.applicantEmail || "";
        settingsStatus.textContent = "Discord is currently configured (bot token hidden).";
        settingsStatus.className = "modal-status ok";
      }
    })
    .catch(() => {});
}

settingsBtn.addEventListener("click", openModal);
closeSettings.addEventListener("click", () => settingsModal.classList.add("hidden"));
settingsModal.addEventListener("click", (e) => {
  if (e.target === settingsModal) settingsModal.classList.add("hidden");
});

saveSettings.addEventListener("click", () => {
  const botToken = document.getElementById("botToken").value.trim();
  const channelId = document.getElementById("channelId").value.trim();
  const applicantName = document.getElementById("applicantName").value.trim();
  const applicantEmail = document.getElementById("applicantEmail").value.trim();

  if (!botToken || !channelId) {
    settingsStatus.textContent = "Bot token and channel ID are required.";
    settingsStatus.className = "modal-status err";
    return;
  }

  fetch("/api/settings/discord", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ botToken, channelId, applicantName, applicantEmail }),
  })
    .then((r) => r.json())
    .then((data) => {
      if (data.ok) {
        settingsStatus.textContent = "Saved! Reports will now be sent to Discord automatically.";
        settingsStatus.className = "modal-status ok";
        document.getElementById("botToken").value = "";
      } else {
        settingsStatus.textContent = data.error || "Failed to save.";
        settingsStatus.className = "modal-status err";
      }
    })
    .catch((err) => {
      settingsStatus.textContent = err.message;
      settingsStatus.className = "modal-status err";
    });
});

clearSettingsBtn.addEventListener("click", () => {
  fetch("/api/settings/discord", { method: "DELETE" })
    .then(() => {
      settingsStatus.textContent = "Discord configuration removed.";
      settingsStatus.className = "modal-status ok";
      document.getElementById("botToken").value = "";
      document.getElementById("channelId").value = "";
    })
    .catch(() => {});
});
