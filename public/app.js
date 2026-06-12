// ─── DOM refs ─────────────────────────────────────────────────────────────────
const metricGrid    = document.getElementById("metric-grid");
const featureGrid   = document.getElementById("feature-grid");
const moduleGrid    = document.getElementById("module-grid");
const sessionsBody  = document.getElementById("sessions-body");
const documentsBody = document.getElementById("documents-body");
const flowNodes     = document.getElementById("flow-nodes");
const backendState  = document.getElementById("backend-state");
const sseState      = document.getElementById("sse-state");
const testOutput    = document.getElementById("test-output");
const testForm      = document.getElementById("test-form");
const sendBtn       = document.getElementById("send-btn");
const sendLabel     = document.getElementById("send-label");
const sendSpinner   = document.getElementById("send-spinner");
const docDownload   = document.getElementById("doc-download");
const activityFeed  = document.getElementById("activity-feed");
const activityEmpty = document.getElementById("activity-empty");
const activityCount = document.getElementById("activity-count");
const livePill      = document.getElementById("live-pill");

// ─── Helpers ──────────────────────────────────────────────────────────────────
function escapeHtml(v) {
  return String(v)
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function fmtTime(v) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" })
    .format(new Date(v));
}

function timeAgo(v) {
  const diff = Math.floor((Date.now() - new Date(v).getTime()) / 1000);
  if (diff < 5)   return "just now";
  if (diff < 60)  return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return fmtTime(v);
}

// ─── Snapshot rendering ───────────────────────────────────────────────────────
function renderMetrics(metrics) {
  metricGrid.innerHTML = [
    ["Sessions",     metrics.sessions],
    ["Documents",    metrics.documents],
    ["Modules",      metrics.activeModules],
    ["Recent Items", metrics.recentMessages],
  ].map(([label, value]) => `
    <div class="metric">
      <div class="tag">${label}</div>
      <div class="num">${value}</div>
    </div>
  `).join("");
}

function renderFeatures(features) {
  featureGrid.innerHTML = features.map((f) => `
    <article class="feature">
      <h4>${escapeHtml(f.title)}</h4>
      <p>${escapeHtml(f.description)}</p>
      <div class="meta">${escapeHtml(f.meta)}</div>
    </article>
  `).join("");
}

function renderModules(modules) {
  moduleGrid.innerHTML = modules.map((m) => `
    <article class="module">
      <h4>${escapeHtml(m.name)}</h4>
      <p>Matched conversations: <strong>${m.count}</strong></p>
    </article>
  `).join("");
}

function renderSessions(sessions) {
  sessionsBody.innerHTML = sessions.map((r) => `
    <tr>
      <td>${escapeHtml(r.phone)}</td>
      <td><span class="intent-badge">${escapeHtml(r.intent || "UNKNOWN")}</span></td>
      <td>${escapeHtml(r.language)}</td>
      <td>${escapeHtml(fmtTime(r.updated_at))}</td>
    </tr>
  `).join("");
}

function renderDocuments(docs) {
  documentsBody.innerHTML = docs.map((r) => `
    <tr>
      <td>${escapeHtml(r.doc_name)}</td>
      <td>${escapeHtml(r.doc_type)}</td>
      <td>${escapeHtml(r.phone)}</td>
      <td>${escapeHtml(fmtTime(r.created_at))}</td>
    </tr>
  `).join("");
}

function renderFlow(nodes) {
  flowNodes.innerHTML = nodes.map((node, i) => `
    <div class="flow-node">
      <div class="index">${i + 1}</div>
      <strong>${escapeHtml(node)}</strong>
    </div>
  `).join("");
}

// ─── Test console ─────────────────────────────────────────────────────────────
function setLoading(on) {
  sendBtn.disabled = on;
  sendLabel.textContent = on ? "Running…" : "Send Test";
  sendSpinner.classList.toggle("hidden", !on);
}

function formatTestResult(data) {
  if (!data.ok) return `Error:\n${data.error}`;

  const { classification, result } = data;
  const lines = [];

  if (classification) {
    lines.push(`── Classification ──────────────────────────`);
    lines.push(`Intent:   ${classification.intent}`);
    lines.push(`Language: ${classification.language}`);
    if (classification.summary_en) lines.push(`Summary:  ${classification.summary_en}`);
    lines.push("");
  }

  if (result) {
    lines.push(`── Legal Module Response ────────────────────`);
    if (result.summary) {
      lines.push("Summary:");
      lines.push(result.summary);
      lines.push("");
    }

    if (result.nextSteps?.length) {
      lines.push("Next Steps:");
      result.nextSteps.forEach((s, i) => lines.push(`  ${i + 1}. ${s}`));
      lines.push("");
    }

    if (result.officeAddress) {
      lines.push(`Nearest Office: ${result.officeAddress}`);
      if (result.officeDistance) lines.push(`Distance: ${result.officeDistance}`);
      lines.push("");
    }

    if (result.escalationNotice) {
      lines.push(`Escalation: ${result.escalationNotice}`);
      lines.push("");
    }

    if (result.hasDocument) {
      lines.push(`Document: ${result.documentName} ← use the download button above`);
    }
  }

  if (data.mode === "static") {
    lines.push("");
    lines.push("⚠ Running in static mode — add ANTHROPIC_API_KEY to use real Claude.");
  }

  return lines.join("\n");
}

testForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  setLoading(true);
  docDownload.classList.add("hidden");
  testOutput.textContent = "Calling Claude… (may take 5–10 seconds)";

  const payload = Object.fromEntries(new FormData(testForm).entries());

  try {
    const res = await fetch("/webhook-test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();

    testOutput.textContent = formatTestResult(data);

    // Show download button if a document was generated
    if (data.result?.documentId) {
      docDownload.href = `/api/document/${data.result.documentId}`;
      docDownload.download = data.result.documentName || "document.pdf";
      docDownload.classList.remove("hidden");
    }
  } catch (err) {
    testOutput.textContent = `Network error: ${err}`;
  } finally {
    setLoading(false);
  }
});

// ─── Activity feed ────────────────────────────────────────────────────────────
const TYPE_COLORS = {
  received:       "activity-received",
  transcription:  "activity-transcription",
  classification: "activity-classification",
  document:       "activity-document",
  sent:           "activity-sent",
  error:          "activity-error",
};

const TYPE_ICONS = {
  received:       "📨",
  transcription:  "🎤",
  classification: "🧠",
  document:       "📄",
  sent:           "✅",
  error:          "❌",
};

let activityEventCount = 0;

function prependActivityEvent(ev) {
  activityEmpty.style.display = "none";
  activityEventCount++;
  activityCount.textContent = `${activityEventCount} event${activityEventCount !== 1 ? "s" : ""}`;

  const item = document.createElement("div");
  item.className = `activity-item ${TYPE_COLORS[ev.type] || ""}`;
  item.setAttribute("data-id", ev.id);

  const phone = ev.phone.replace("whatsapp:", "").replace("+91", "+91 ");

  item.innerHTML = `
    <span class="activity-icon">${TYPE_ICONS[ev.type] || "•"}</span>
    <span class="activity-type">${escapeHtml(ev.type)}</span>
    <span class="activity-phone">${escapeHtml(phone)}</span>
    <span class="activity-detail">${escapeHtml(ev.detail)}</span>
    <span class="activity-time" title="${escapeHtml(ev.ts)}">${timeAgo(ev.ts)}</span>
  `;

  // Insert at top, limit to 60 items
  activityFeed.insertBefore(item, activityFeed.firstChild);
  const items = activityFeed.querySelectorAll(".activity-item");
  if (items.length > 60) items[items.length - 1].remove();

  // Flash animation
  requestAnimationFrame(() => item.classList.add("activity-new"));
  setTimeout(() => item.classList.remove("activity-new"), 1200);
}

// ─── SSE connection ───────────────────────────────────────────────────────────
let sseReconnectDelay = 2000;

function connectSSE() {
  sseState.textContent = "Connecting…";

  const es = new EventSource("/api/dashboard/activity");

  es.onopen = () => {
    sseState.textContent = "Connected";
    livePill.textContent = "LIVE";
    livePill.className = "pill success";
    sseReconnectDelay = 2000;
  };

  es.onmessage = (e) => {
    try {
      const ev = JSON.parse(e.data);
      prependActivityEvent(ev);
    } catch {}
  };

  es.onerror = () => {
    sseState.textContent = "Reconnecting…";
    livePill.textContent = "OFFLINE";
    livePill.className = "pill danger";
    es.close();
    setTimeout(connectSSE, sseReconnectDelay);
    sseReconnectDelay = Math.min(sseReconnectDelay * 2, 30000);
  };
}

// ─── Boot ─────────────────────────────────────────────────────────────────────
async function loadSnapshot() {
  const res = await fetch("/api/dashboard/snapshot");
  if (!res.ok) throw new Error(`Snapshot ${res.status}`);
  return res.json();
}

async function boot() {
  // Connect SSE first (non-blocking)
  connectSSE();

  // Load snapshot
  try {
    const snap = await loadSnapshot();
    backendState.textContent = "Connected";
    renderMetrics(snap.metrics);
    renderFeatures(snap.features);
    renderModules(snap.modules);
    renderSessions(snap.sessions);
    renderDocuments(snap.documents);
    renderFlow(snap.architecture);
  } catch (err) {
    backendState.textContent = "Offline";
    livePill.textContent = "OFFLINE";
    livePill.className = "pill danger";
    testOutput.textContent = `Backend offline: ${err}\nStart the server with: npm run dev`;
  }
}

// Refresh snapshot every 30 s to keep metrics and tables current
setInterval(async () => {
  try {
    const snap = await loadSnapshot();
    renderMetrics(snap.metrics);
    renderSessions(snap.sessions);
    renderDocuments(snap.documents);
  } catch {}
}, 30000);

boot();
