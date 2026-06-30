// Research console (admin panel).
//
// Authenticated researcher view. Reads the read-only research_* views and lets a
// researcher UPLOAD manual measurements (ECG / physical) per candidate. Access to
// any study data requires a row in researcher_profiles (RLS) - signing up alone
// grants nothing, so an admin must approve new accounts.
//
// The console is organised as a sidebar of sections (hash-routed). Each section
// loads its own data on demand so we never pull every dataset into one page.
import { createClient } from "@supabase/supabase-js";
import { buildMeasurementPayload } from "./measurement.js";
import { buildSlotCodes } from "./slots.js";
import { qualityFlag } from "./quality.js";
import { toCsv } from "./csv.js";

const EXPORTS = [
    ["research_session_summary", "sessions"],
    ["research_session_protocol_export", "session_protocol"],
    ["research_metric_versions_export", "metric_versions"],
    ["research_session_quality", "session_quality"],
    ["research_fitts_export", "fitts_trials"],
    ["research_typing_export", "typing_trials"],
    ["research_nasa_tlx_export", "nasa_tlx"],
    ["research_fatigue_ratings_export", "fatigue_ratings"],
    ["research_cognitive_export", "cognitive_trials"],
    ["research_physical_export", "physical_fatigue"],
    ["research_engagement_export", "engagement"],
    ["research_manual_measurements_export", "manual_measurements"],
    ["research_scroll_sessions_export", "scroll_sessions"],
    ["research_scroll_intervals_export", "scroll_intervals"],
    ["research_event_export", "session_events"]
];

// Per-test data browsers. Each is a generic, filterable table over a research view.
const TEST_VIEWS = {
    fitts: { label: "Fitts' Law", view: "research_fitts_export", file: "fitts_trials", desc: "Pointing trials — target width/distance, movement time, error rate, throughput." },
    typing: { label: "Typing", view: "research_typing_export", file: "typing_trials", desc: "Transcription trials — speed (WPM/CPM), accuracy, inter-key intervals." },
    cognitive: { label: "Cognitive (Stroop / AX-CPT)", view: "research_cognitive_export", file: "cognitive_trials", desc: "Reaction-time and accuracy on congruent/incongruent and cue/probe trials." },
    nasa: { label: "NASA-TLX", view: "research_nasa_tlx_export", file: "nasa_tlx", desc: "Subjective workload — mental, physical, temporal, performance, effort, frustration." },
    fatigue: { label: "Fatigue (KSS)", view: "research_fatigue_ratings_export", file: "fatigue_ratings", desc: "Karolinska Sleepiness Scale ratings captured pre/post each block." },
    engagement: { label: "Attention / Engagement", view: "research_engagement_export", file: "engagement", desc: "Per-test camera attention (exploratory), look-aways, app-switches, time away." },
    scroll_sessions: { label: "Scroll sessions", view: "research_scroll_sessions_export", file: "scroll_sessions", desc: "Instagram-style scroll-fatigue sessions — duration, self-ratings start/end." },
    scroll_intervals: { label: "Scroll intervals", view: "research_scroll_intervals_export", file: "scroll_intervals", desc: "Per-interval scroll metrics — velocity, pauses, idle, self-rating." }
};

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey =
    import.meta.env.VITE_SUPABASE_ANON_KEY ||
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

const isConfigured = Boolean(
    supabaseUrl && supabaseKey &&
    !supabaseUrl.includes("your-project-ref") && !String(supabaseKey).startsWith("your-")
);

const supabase = isConfigured
    ? createClient(supabaseUrl, supabaseKey, { auth: { persistSession: true, autoRefreshToken: true } })
    : null;

const root = document.getElementById("admin-root");
const actions = document.getElementById("admin-actions");
const userLabel = document.getElementById("admin-user");
document.getElementById("logout-btn").addEventListener("click", signOut);
document.getElementById("refresh-btn").addEventListener("click", () => {
    if (document.getElementById("view")) navigate(); else route();
});

let measurementSessions = [];

// --- helpers ------------------------------------------------------------------
const esc = (v) => String(v == null ? "" : v).replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
));
const fmtDate = (s) => (s ? new Date(s).toLocaleString() : "—");
const fmtMs = (ms) => (ms == null ? "—" : (ms >= 1000 ? (ms / 1000).toFixed(1) + "s" : ms + "ms"));
const pct = (n) => (n == null ? "—" : n + "%");
const stepName = (s) => ({ fitts: "Fitts", typing: "Typing", nasatlx: "NASA-TLX", cognitive: "Cognitive", physical: "Physical" }[s] || s || "—");
const countBy = (arr, k) => (arr || []).reduce((a, x) => { a[x[k]] = (a[x[k]] || 0) + 1; return a; }, {});
const errorCard = (title, msg) => `<div class="card"><h1>${esc(title)}</h1><p class="error">${esc(msg)}</p></div>`;
const view = () => document.getElementById("view");

const prefersReducedMotion = Boolean(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
const spinner = (text = "Loading…") => `<div class="card"><div class="loading"><span class="spinner"></span>${esc(text)}</div></div>`;
// Count-up tween for KPI numbers (eased, ~0.65s); no-op under reduced motion.
function animateCount(el) {
    const target = parseInt(String(el.textContent).replace(/[^\d-]/g, ""), 10);
    if (!isFinite(target) || target === 0 || prefersReducedMotion) return;
    const start = performance.now(), dur = 650;
    const tick = (t) => {
        const p = Math.min(1, (t - start) / dur);
        el.textContent = Math.round(target * (1 - Math.pow(1 - p, 3)));
        if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
}

function setLoggedInUI(email) {
    actions.hidden = !email;
    userLabel.textContent = email || "";
}

// Generic, schema-agnostic table: renders whatever columns a view returns.
function formatCell(key, val) {
    if (val == null) return "—";
    if (typeof val === "object") return esc(JSON.stringify(val));
    const k = key.toLowerCase();
    if ((k.endsWith("_at") || k.includes("time")) && /^\d{4}-\d\d-\d\dT/.test(String(val))) return esc(fmtDate(val));
    return esc(String(val));
}
function genericTable(rows) {
    if (!rows || !rows.length) return `<p class="muted">No rows yet.</p>`;
    const cols = Object.keys(rows[0]);
    const head = cols.map((c) => `<th>${esc(c)}</th>`).join("");
    const body = rows.map((r) => `<tr>${cols.map((c) => `<td>${formatCell(c, r[c])}</td>`).join("")}</tr>`).join("");
    return `<div class="scroll-x"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
}
// Wire a search box to hide non-matching rows in the nearest table.
function wireFilter(filterId, countId, total) {
    const filter = document.getElementById(filterId);
    if (!filter) return;
    filter.addEventListener("input", () => {
        const q = filter.value.toLowerCase();
        let shown = 0;
        view().querySelectorAll("tbody tr").forEach((tr) => {
            const match = tr.textContent.toLowerCase().includes(q);
            tr.style.display = match ? "" : "none";
            if (match) shown += 1;
        });
        const c = document.getElementById(countId);
        if (c) c.textContent = `${shown} of ${total} row(s)`;
    });
}

// --- routing / auth -----------------------------------------------------------
const ALLOWED_ROLES = ["admin", "researcher", "viewer"];

// Fire-and-forget append to the audit trail (who exported / approved / denied).
function logAction(action, target, detail) {
    try { supabase.rpc("log_audit", { p_action: action, p_target: target || null, p_detail: detail || {} }); } catch { /* best-effort */ }
}

async function route() {
    if (!isConfigured) {
        setLoggedInUI(null);
        root.innerHTML = `<div class="card"><h1>Supabase not configured</h1>
            <p class="muted">Set <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> in <code>.env</code> and rebuild.</p></div>`;
        return;
    }
    const { data } = await supabase.auth.getSession();
    if (!data.session) { renderAuth("login"); return; }

    const email = data.session.user.email;
    setLoggedInUI(email);
    let role = await getRole();
    if (!role) {
        // First sign-in with no profile: record a pending access request.
        try { const { data: r } = await supabase.rpc("request_researcher_access"); role = r || "pending"; }
        catch { role = "pending"; }
    }
    if (!ALLOWED_ROLES.includes(role)) { renderPending(email, role); return; }
    renderShell(role);
}

async function getRole() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    const { data } = await supabase
        .from("researcher_profiles").select("role").eq("user_id", user.id).maybeSingle();
    return data ? data.role : null;
}

function renderAuth(mode, message) {
    setLoggedInUI(null);
    const isSignup = mode === "signup";
    root.innerHTML = `
        <div class="login-wrap card">
            <div class="kicker">Research Console</div>
            <h1>${isSignup ? "Create account" : "Sign in"}</h1>
            <p class="muted">${isSignup
                ? "New accounts need an administrator to grant access before any data is visible."
                : "For authorised researchers only."}</p>
            <form id="auth-form">
                <label for="email">Email</label>
                <input id="email" type="email" autocomplete="username" required>
                <label for="password">Password</label>
                <input id="password" type="password" autocomplete="${isSignup ? "new-password" : "current-password"}" required>
                <div style="margin-top:18px; display:flex; gap:10px; align-items:center;">
                    <button id="auth-btn" type="submit">${isSignup ? "Sign up" : "Sign in"}</button>
                    <button id="toggle-btn" type="button" class="ghost">${isSignup ? "I have an account" : "Create account"}</button>
                </div>
                ${message ? `<div class="${message.type}">${esc(message.text)}</div>` : ""}
            </form>
        </div>`;

    document.getElementById("toggle-btn").addEventListener("click", () => renderAuth(isSignup ? "login" : "signup"));
    document.getElementById("auth-form").addEventListener("submit", async (e) => {
        e.preventDefault();
        const btn = document.getElementById("auth-btn");
        btn.disabled = true; btn.textContent = isSignup ? "Creating…" : "Signing in…";
        const email = document.getElementById("email").value.trim();
        const password = document.getElementById("password").value;

        if (isSignup) {
            const { error } = await supabase.auth.signUp({ email, password });
            if (error) { renderAuth("signup", { type: "error", text: error.message }); return; }
            renderAuth("login", { type: "notice", text: "Account created. If email confirmation is enabled, confirm via email, then sign in. Your access then needs an administrator to approve it before any data is visible." });
            return;
        }
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) { renderAuth("login", { type: "error", text: error.message }); return; }
        route();
    });
}

function renderPending(email, status) {
    setLoggedInUI(email);
    const denied = status === "denied";
    root.innerHTML = `
        <div class="login-wrap card">
            <div class="kicker">${denied ? "Access denied" : "Account pending"}</div>
            <h1>${denied ? "Access not granted" : "Awaiting approval"}</h1>
            <p class="muted">You are signed in as <strong>${esc(email)}</strong>. ${denied
                ? "An administrator has not granted this account access to study data. If you think this is a mistake, contact the study admin."
                : "Your request has been recorded and is waiting for an administrator to approve it. Once approved, click <strong>Refresh</strong>."}</p>
            <div style="margin-top:16px;"><button class="ghost" id="pending-signout" type="button">Sign out</button></div>
        </div>`;
    document.getElementById("pending-signout").addEventListener("click", signOut);
}

async function signOut() {
    await supabase.auth.signOut();
    renderAuth("login");
}

// --- shell + router -----------------------------------------------------------
const NAV = [
    { group: null, items: [
        { route: "overview", label: "Overview" },
        { route: "sessions", label: "Sessions", count: "sessions" },
        { route: "quality", label: "Data quality" }
    ] },
    { group: "Test data", items: Object.entries(TEST_VIEWS).map(([k, v]) => ({ route: `test/${k}`, label: v.label })) },
    { group: "Operations", items: [
        { route: "measurements", label: "Measurements" },
        { route: "slots", label: "Participant IDs", count: "slots" },
        { route: "export", label: "Export" }
    ] },
    { group: "Administration", admin: true, items: [
        { route: "registrations", label: "Registrations" },
        { route: "access", label: "Access requests" },
        { route: "audit", label: "Audit log" }
    ] }
];

function renderShell(role) {
    const isAdmin = role === "admin";
    const navHtml = NAV.filter((g) => !g.admin || isAdmin).map((g) => {
        const label = g.group ? `<div class="nav-label">${esc(g.group)}</div>` : "";
        const links = g.items.map((it) =>
            `<a href="#${it.route}" data-route="${it.route}">${esc(it.label)}${it.count ? `<span class="count" data-count="${it.count}"></span>` : ""}</a>`
        ).join("");
        return label + links;
    }).join("");

    root.innerHTML = `
        <div class="shell">
            <aside class="sidebar"><nav>${navHtml}</nav></aside>
            <section id="view"></section>
        </div>`;

    if (!location.hash) location.hash = "#overview";
    navigate();
    refreshNavCounts();
}

async function refreshNavCounts() {
    try {
        const [{ data: s }, { data: sl }] = await Promise.all([
            supabase.from("research_session_summary").select("session_id"),
            supabase.from("participant_slots").select("status")
        ]);
        const set = (key, n) => { const el = root.querySelector(`[data-count="${key}"]`); if (el) el.textContent = n; };
        set("sessions", (s || []).length);
        const avail = (sl || []).filter((x) => x.status === "available").length;
        set("slots", `${avail}/${(sl || []).length}`);
    } catch { /* counts are best-effort */ }
}

function navigate() {
    const hash = (location.hash || "#overview").slice(1);
    root.querySelectorAll(".sidebar a").forEach((a) => a.classList.toggle("active", a.dataset.route === hash));
    if (hash.startsWith("test/")) return loadTestView(hash.slice(5));
    switch (hash) {
        case "sessions": return loadSessions();
        case "quality": return loadQuality();
        case "measurements": return loadMeasurements();
        case "slots": return loadSlots();
        case "export": return loadExport();
        case "registrations": return loadRegistrations();
        case "access": return loadAccessRequests();
        case "audit": return loadAuditLog();
        case "overview":
        default: return loadOverview();
    }
}

// --- overview -----------------------------------------------------------------
async function loadOverview() {
    view().innerHTML = spinner("Loading overview…");
    const [s, sl, m] = await Promise.all([
        supabase.from("research_session_summary").select("status,participant_code,final_base_task,final_fatigue_track,started_at").order("started_at", { ascending: false }),
        supabase.from("participant_slots").select("status"),
        supabase.from("research_manual_measurements_export").select("measurement_type")
    ]);
    if (s.error) { view().innerHTML = errorCard("Could not load overview", s.error.message); return; }
    const sessions = s.data || [];
    const sc = countBy(sessions, "status");
    const slc = countBy(sl.data, "status");
    const measCount = (m.data || []).length;

    const recent = sessions.slice(0, 6).map((r) => `
        <tr><td><strong>${esc(r.participant_code)}</strong></td>
        <td><span class="pill">${esc(r.status)}</span></td>
        <td>${esc(r.final_base_task)} + ${esc(r.final_fatigue_track)}</td>
        <td>${fmtDate(r.started_at)}</td></tr>`).join("");

    view().innerHTML = `
        <div class="card">
            <div class="kicker">Overview</div>
            <h1>Study at a glance</h1>
            <div class="kpi-grid">
                <div class="kpi"><div class="n">${sessions.length}</div><div class="l">Total sessions</div></div>
                <div class="kpi"><div class="n good">${sc.completed || 0}</div><div class="l">Completed</div></div>
                <div class="kpi"><div class="n">${sc.in_progress || 0}</div><div class="l">In progress</div></div>
                <div class="kpi"><div class="n">${(slc.available || 0)}</div><div class="l">IDs available</div></div>
                <div class="kpi"><div class="n">${(slc.assigned || 0)}</div><div class="l">IDs assigned</div></div>
                <div class="kpi"><div class="n">${measCount}</div><div class="l">Measurements</div></div>
            </div>
            <div class="quick-links">
                <a class="ql" href="#sessions">Browse sessions →</a>
                <a class="ql" href="#quality">Data quality →</a>
                <a class="ql" href="#slots">Manage IDs →</a>
                <a class="ql" href="#export">Export CSV →</a>
            </div>
        </div>
        <div class="card">
            <div class="kicker">Recent</div>
            <h1>Latest sessions</h1>
            <div class="scroll-x"><table>
                <thead><tr><th>Participant</th><th>Status</th><th>Protocol</th><th>Started</th></tr></thead>
                <tbody>${recent || `<tr><td colspan="4" class="muted">No sessions yet.</td></tr>`}</tbody>
            </table></div>
        </div>`;

    view().querySelectorAll(".kpi .n").forEach(animateCount);
}

// --- sessions (+ per-session detail) ------------------------------------------
async function loadSessions() {
    view().innerHTML = spinner("Loading sessions…");
    const { data: sessions, error } = await supabase
        .from("research_session_summary").select("*").order("started_at", { ascending: false });
    if (error) { view().innerHTML = errorCard("Could not load sessions", error.message); return; }

    measurementSessions = sessions || [];
    const rows = (sessions || []).map((s) => `
        <tr data-session="${esc(s.session_id)}">
            <td><strong>${esc(s.participant_code)}</strong></td>
            <td><span class="pill">${esc(s.status)}</span></td>
            <td>${esc(s.final_base_task)} + ${esc(s.final_fatigue_track)}</td>
            <td>${esc(s.block_count)}/3</td>
            <td>${s.avg_nasa_tlx_score == null ? "—" : esc(s.avg_nasa_tlx_score)}</td>
            <td>${fmtDate(s.started_at)}</td>
        </tr>`).join("");

    view().innerHTML = `
        <div class="card">
            <div class="kicker">Sessions</div>
            <h1>${(sessions || []).length} session(s)</h1>
            <p class="muted">Select a session to see its per-test engagement, attention, and uploaded measurements.</p>
            <div class="toolbar"><input type="search" id="s-filter" placeholder="Filter by participant, status, protocol…">
                <span class="muted" id="s-count">${(sessions || []).length} row(s)</span></div>
            <div class="scroll-x"><table>
                <thead><tr><th>Participant</th><th>Status</th><th>Protocol</th><th>Blocks</th><th>NASA avg</th><th>Started</th></tr></thead>
                <tbody>${rows || `<tr><td colspan="6" class="muted">No sessions yet.</td></tr>`}</tbody>
            </table></div>
        </div>
        <div id="detail"></div>`;

    wireFilter("s-filter", "s-count", (sessions || []).length);
    view().querySelectorAll("tbody tr[data-session]").forEach((tr) => {
        tr.addEventListener("click", () => {
            view().querySelectorAll("tbody tr").forEach((r) => r.classList.remove("selected"));
            tr.classList.add("selected");
            const s = (sessions || []).find((x) => String(x.session_id) === tr.dataset.session);
            loadDetail(s);
        });
    });
}

async function loadDetail(session) {
    const detail = document.getElementById("detail");
    detail.innerHTML = spinner("Loading session detail…");

    const [{ data: eng, error: engErr }, { data: meas }, { data: frames }] = await Promise.all([
        supabase.from("research_engagement_export").select("*").eq("session_id", session.session_id).order("block_number", { ascending: true }),
        supabase.from("research_manual_measurements_export").select("*").eq("participant_code", session.participant_code).order("recorded_at", { ascending: false }),
        supabase.from("session_frames").select("*").eq("session_id", session.session_id).order("captured_at", { ascending: true })
    ]);

    if (engErr) { detail.innerHTML = errorCard("Could not load detail", engErr.message); return; }

    // Camera snapshots: resolve private storage paths to short-lived signed URLs.
    let frameGallery = "";
    const frameRows = frames || [];
    if (frameRows.length) {
        const paths = frameRows.map((f) => f.storage_path);
        const { data: signed } = await supabase.storage.from("session-frames").createSignedUrls(paths, 3600);
        const urlByPath = {};
        (signed || []).forEach((s) => { if (s && s.signedUrl && !s.error) urlByPath[s.path] = s.signedUrl; });
        const thumbs = frameRows.slice(0, 150).map((f) => {
            const u = urlByPath[f.storage_path];
            return u
                ? `<a href="${u}" target="_blank" rel="noopener" title="Block ${esc(f.block_number)} · ${fmtDate(f.captured_at)}"><img src="${u}" loading="lazy" alt="snapshot" style="width:88px; height:auto; border-radius:8px; border:1px solid var(--border); display:block;"></a>`
                : "";
        }).join("");
        frameGallery = `
            <h2>Camera snapshots (${frameRows.length})</h2>
            <p class="muted" style="margin-top:0;">Low-resolution attention-verification photos. Private; signed links expire in 1 hour.</p>
            <div style="display:flex; flex-wrap:wrap; gap:8px;">${thumbs || `<span class="muted">Could not load images.</span>`}</div>`;
    }

    const engRows = (eng || []).map((e) => {
        const att = e.attentive_percent;
        const attClass = att == null ? "muted" : (att >= 75 ? "good" : "warn");
        return `<tr>
            <td>${esc(e.block_number)}</td><td>${esc(stepName(e.step))}</td><td>${fmtMs(e.duration_ms)}</td>
            <td>${e.camera_used ? "Yes" : "No"}</td><td class="${attClass}">${pct(att)}</td>
            <td>${e.look_away_count == null ? "—" : esc(e.look_away_count)}</td>
            <td>${esc(e.app_switch_count)}</td><td>${fmtMs(e.longest_away_ms)}</td>
        </tr>`;
    }).join("");

    const measRows = (meas || []).map((m) => `<tr>
        <td>${esc(m.measurement_type)}</td>
        <td>${esc(m.source)}</td>
        <td>${m.heart_rate_bpm == null ? "—" : esc(m.heart_rate_bpm)}</td>
        <td>${m.hrv_ms == null ? "—" : esc(m.hrv_ms)}</td>
        <td>${m.value == null ? "—" : esc(m.value) + (m.unit ? " " + esc(m.unit) : "")}</td>
        <td>${esc(m.notes || "—")}</td>
        <td>${fmtDate(m.recorded_at)}</td>
    </tr>`).join("");

    const camRows = (eng || []).filter((e) => e.attentive_percent != null);
    const avgAtt = camRows.length ? Math.round(camRows.reduce((a, e) => a + Number(e.attentive_percent), 0) / camRows.length) : null;
    const totalAway = (eng || []).reduce((a, e) => a + (e.total_away_ms || 0), 0);
    const totalSwitches = (eng || []).reduce((a, e) => a + (e.app_switch_count || 0), 0);

    detail.innerHTML = `
        <div class="card">
            <div class="kicker">Session</div>
            <h1>${esc(session.participant_code)} <span class="muted" style="font-size:0.7em;">${esc(session.session_code)}</span></h1>
            <div class="stat-row">
                <div class="stat"><div class="n">${esc(session.status)}</div><div class="l">Status</div></div>
                <div class="stat"><div class="n">${esc(session.final_base_task)} + ${esc(session.final_fatigue_track)}</div><div class="l">Protocol</div></div>
                <div class="stat"><div class="n">${session.avg_nasa_tlx_score == null ? "—" : esc(session.avg_nasa_tlx_score)}</div><div class="l">Avg NASA-TLX</div></div>
                <div class="stat"><div class="n">${avgAtt == null ? "—" : avgAtt + "%"}</div><div class="l">Avg attentive (camera)</div></div>
                <div class="stat"><div class="n">${totalSwitches}</div><div class="l">App-switches</div></div>
                <div class="stat"><div class="n">${fmtMs(totalAway)}</div><div class="l">Total time away</div></div>
            </div>

            <h2>Per-test engagement &amp; attention validation</h2>
            <div class="scroll-x"><table>
                <thead><tr><th>Block</th><th>Test</th><th>Duration</th><th>Camera</th><th>Attentive %</th><th>Look-aways</th><th>App-switches</th><th>Longest away</th></tr></thead>
                <tbody>${engRows || `<tr><td colspan="8" class="muted">No engagement rows.</td></tr>`}</tbody>
            </table></div>

            <h2>Measurements (ECG / physical / device)</h2>
            <div class="scroll-x"><table>
                <thead><tr><th>Type</th><th>Source</th><th>HR (bpm)</th><th>HRV (ms)</th><th>Value</th><th>Notes</th><th>Recorded</th></tr></thead>
                <tbody>${measRows || `<tr><td colspan="7" class="muted">No measurements uploaded for this candidate.</td></tr>`}</tbody>
            </table></div>
            ${frameGallery}
        </div>`;
    detail.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

// --- per-test data browser ----------------------------------------------------
async function loadTestView(key) {
    const cfg = TEST_VIEWS[key];
    if (!cfg) { view().innerHTML = `<div class="card"><p class="muted">Unknown test.</p></div>`; return; }
    view().innerHTML = spinner(`Loading ${cfg.label}…`);

    const LIMIT = 2000;
    const { data, error } = await supabase.from(cfg.view).select("*").limit(LIMIT);
    if (error) {
        view().innerHTML = `<div class="card"><div class="kicker">Test data</div><h1>${esc(cfg.label)}</h1>
            <p class="error">${esc(error.message)}</p></div>`;
        return;
    }
    const rows = data || [];
    const capped = rows.length >= LIMIT ? ` (showing first ${LIMIT} — use Download for the full set)` : "";

    view().innerHTML = `
        <div class="card">
            <div class="view-head">
                <div>
                    <div class="kicker">Test data</div>
                    <h1>${esc(cfg.label)}</h1>
                    <p class="muted" style="margin:0;">${esc(cfg.desc)}</p>
                </div>
                <button class="ghost" id="tv-export" type="button">Download CSV</button>
            </div>
            <div class="toolbar">
                <input type="search" id="tv-filter" placeholder="Filter rows…">
                <span class="muted" id="tv-count">${rows.length} row(s)${capped}</span>
            </div>
            ${genericTable(rows)}
        </div>`;

    wireFilter("tv-filter", "tv-count", rows.length);
    document.getElementById("tv-export").addEventListener("click", () => {
        if (rows.length) { downloadCsv(`${cfg.file}.csv`, toCsv(rows)); logAction("export_csv", cfg.file, { rows: rows.length }); }
    });
}

// --- measurements (manual ECG / physical upload + list) -----------------------
async function loadMeasurements() {
    view().innerHTML = spinner("Loading measurements…");
    const [{ data: sessions }, { data: meas, error }] = await Promise.all([
        supabase.from("research_session_summary").select("*").order("started_at", { ascending: false }),
        supabase.from("research_manual_measurements_export").select("*").order("recorded_at", { ascending: false })
    ]);
    measurementSessions = sessions || [];
    const opts = measurementSessions.map((session) => `
        <option value="${esc(session.session_id)}" data-code="${esc(session.participant_code)}">
            ${esc(session.participant_code)} · ${esc(session.session_code)} · ${fmtDate(session.started_at)}
        </option>`).join("");

    const measRows = (meas || []).map((m) => `<tr>
        <td><strong>${esc(m.participant_code)}</strong></td>
        <td>${esc(m.measurement_type)}</td>
        <td>${esc(m.source)}</td>
        <td>${m.heart_rate_bpm == null ? "—" : esc(m.heart_rate_bpm)}</td>
        <td>${m.hrv_ms == null ? "—" : esc(m.hrv_ms)}</td>
        <td>${m.value == null ? "—" : esc(m.value) + (m.unit ? " " + esc(m.unit) : "")}</td>
        <td>${esc(m.notes || "—")}</td>
        <td>${fmtDate(m.recorded_at)}</td>
    </tr>`).join("");

    view().innerHTML = `
        <div class="card">
            <div class="kicker">Manual upload</div>
            <h1>Add a measurement</h1>
            <p class="muted">Upload an ECG or a manual physical-test result for a candidate.</p>
            <form id="upload-form">
                <div style="display:flex; flex-wrap:wrap; gap:16px;">
                    <div style="flex:1; min-width:200px;">
                        <label for="m-session">Participant session</label>
                        <select id="m-session" required>
                            <option value="">Select a session…</option>
                            ${opts}
                        </select>
                    </div>
                    <div style="flex:1; min-width:160px;">
                        <label for="m-type">Type</label>
                        <select id="m-type">
                            <option value="ecg">ECG</option>
                            <option value="physical">Physical (manual)</option>
                        </select>
                    </div>
                </div>
                <div id="ecg-fields" style="display:flex; flex-wrap:wrap; gap:16px;">
                    <div style="flex:1; min-width:160px;"><label for="m-hr">Heart rate (bpm)</label><input id="m-hr" type="number" step="0.1" inputmode="decimal"></div>
                    <div style="flex:1; min-width:160px;"><label for="m-hrv">HRV (ms)</label><input id="m-hrv" type="number" step="0.1" inputmode="decimal"></div>
                </div>
                <div id="physical-fields" style="display:none; flex-wrap:wrap; gap:16px;">
                    <div style="flex:1; min-width:160px;"><label for="m-value">Value</label><input id="m-value" type="number" step="any" inputmode="decimal"></div>
                    <div style="flex:1; min-width:160px;"><label for="m-unit">Unit</label><input id="m-unit" type="text" placeholder="e.g. reps, RPE"></div>
                </div>
                <label for="m-notes">Notes</label>
                <input id="m-notes" type="text" placeholder="Optional notes">
                <div style="margin-top:16px;"><button id="upload-btn" type="submit">Upload measurement</button>
                    <span id="upload-msg" style="margin-left:12px;"></span></div>
            </form>
        </div>
        <div class="card">
            <div class="view-head">
                <div><div class="kicker">Uploaded</div><h1>${(meas || []).length} measurement(s)</h1></div>
                ${error ? "" : `<button class="ghost" id="meas-export" type="button">Download CSV</button>`}
            </div>
            ${error ? `<p class="error">${esc(error.message)}</p>` : `
            <div class="toolbar"><input type="search" id="meas-filter" placeholder="Filter…">
                <span class="muted" id="meas-count">${(meas || []).length} row(s)</span></div>
            <div class="scroll-x"><table>
                <thead><tr><th>Participant</th><th>Type</th><th>Source</th><th>HR</th><th>HRV</th><th>Value</th><th>Notes</th><th>Recorded</th></tr></thead>
                <tbody>${measRows || `<tr><td colspan="8" class="muted">No measurements uploaded yet.</td></tr>`}</tbody>
            </table></div>`}
        </div>`;

    wireUploadForm();
    if (!error) {
        wireFilter("meas-filter", "meas-count", (meas || []).length);
        const ex = document.getElementById("meas-export");
        if (ex) ex.addEventListener("click", () => { if ((meas || []).length) { downloadCsv("manual_measurements.csv", toCsv(meas)); logAction("export_csv", "manual_measurements", { rows: meas.length }); } });
    }
}

function wireUploadForm() {
    const typeSel = document.getElementById("m-type");
    const ecg = document.getElementById("ecg-fields");
    const phys = document.getElementById("physical-fields");
    const toggleFields = () => {
        const isEcg = typeSel.value === "ecg";
        ecg.style.display = isEcg ? "flex" : "none";
        phys.style.display = isEcg ? "none" : "flex";
    };
    typeSel.addEventListener("change", toggleFields);
    toggleFields();

    document.getElementById("upload-form").addEventListener("submit", async (e) => {
        e.preventDefault();
        const msg = document.getElementById("upload-msg");
        const sessionSelect = document.getElementById("m-session");
        const selectedSession = measurementSessions.find((session) => String(session.session_id) === sessionSelect.value);
        const built = buildMeasurementPayload({
            participantCode: selectedSession && selectedSession.participant_code,
            sessionId: selectedSession && selectedSession.session_id,
            type: typeSel.value,
            heartRate: document.getElementById("m-hr").value,
            hrv: document.getElementById("m-hrv").value,
            value: document.getElementById("m-value").value,
            unit: document.getElementById("m-unit").value,
            notes: document.getElementById("m-notes").value
        });
        if (built.error) { msg.innerHTML = `<span class="warn">${esc(built.error)}</span>`; return; }

        const btn = document.getElementById("upload-btn");
        btn.disabled = true;
        const { data: { user } } = await supabase.auth.getUser();
        const { error } = await supabase.from("manual_measurements").insert({ ...built.row, recorded_by: user ? user.id : null });
        btn.disabled = false;
        if (error) { msg.innerHTML = `<span class="warn">${esc(error.message)}</span>`; return; }
        msg.innerHTML = `<span class="good">Saved.</span>`;
        loadMeasurements();
    });
}

// --- CSV export ---------------------------------------------------------------
function loadExport() {
    const btns = EXPORTS.map(([viewName, name]) =>
        `<button class="ghost" data-export="${viewName}" data-name="${name}" type="button">${name}.csv</button>`).join(" ");
    view().innerHTML = `
        <div class="card">
            <div class="kicker">Export data</div>
            <h1>Download as CSV</h1>
            <p class="muted">One file per dataset (opens in Excel / pandas / R). Researcher-only data.</p>
            <div style="display:flex; flex-wrap:wrap; gap:8px; margin-top:6px;">
                <button class="primary" id="export-all" type="button" style="width:auto;">Export all</button>
                ${btns}
            </div>
            <span id="export-msg" style="display:block; margin-top:10px;"></span>
        </div>`;
    wireExportCard();
}

function downloadCsv(filename, text) {
    const blob = new Blob([text], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
}

async function exportOne(viewName, name) {
    const { data, error } = await supabase.from(viewName).select("*");
    if (error) return { name, ok: false, error: error.message };
    const rows = data || [];
    if (rows.length) downloadCsv(`${name}.csv`, toCsv(rows));
    logAction("export_csv", name, { rows: rows.length });
    return { name, ok: true, count: rows.length };
}

function wireExportCard() {
    const msg = () => document.getElementById("export-msg");
    document.querySelectorAll("[data-export]").forEach((b) => b.addEventListener("click", async () => {
        msg().textContent = `Exporting ${b.dataset.name}…`;
        const r = await exportOne(b.dataset.export, b.dataset.name);
        msg().innerHTML = r.ok
            ? `<span class="good">${esc(r.name)}: ${r.count} row(s)${r.count ? " downloaded" : " (empty)"}.</span>`
            : `<span class="warn">${esc(r.name)}: ${esc(r.error)}</span>`;
    }));
    const all = document.getElementById("export-all");
    if (all) all.addEventListener("click", async () => {
        all.disabled = true;
        let total = 0;
        for (const [viewName, name] of EXPORTS) {
            msg().textContent = `Exporting ${name}…`;
            const r = await exportOne(viewName, name);
            if (r.ok) total += r.count;
            await new Promise((res) => setTimeout(res, 400)); // let each download start
        }
        msg().innerHTML = `<span class="good">Exported all datasets (${total} rows total).</span>`;
        all.disabled = false;
    });
}

// --- data quality (go / no-go per session) ------------------------------------
async function loadQuality() {
    view().innerHTML = spinner("Loading data quality…");
    const { data: rows, error } = await supabase
        .from("research_session_quality").select("*").order("started_at", { ascending: false });
    if (error) { view().innerHTML = errorCard("Could not load quality view", error.message); return; }

    const flagged = (rows || []).map((r) => ({ r, f: qualityFlag(r) }));
    const counts = flagged.reduce((a, x) => { a[x.f.level] = (a[x.f.level] || 0) + 1; return a; }, {});
    const dot = (lvl) => `<span style="display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:7px;background:${lvl === "good" ? "#16a34a" : lvl === "warn" ? "#d97706" : "#dc2626"};"></span>`;

    const body = flagged.map(({ r, f }) => `
        <tr>
            <td><strong>${esc(r.participant_code)}</strong></td>
            <td>${dot(f.level)}${esc(f.label)}</td>
            <td>${esc(r.blocks_started)}/3</td>
            <td>${r.avg_attentive_pct == null ? "—" : esc(r.avg_attentive_pct) + "%"}</td>
            <td>${esc(r.total_app_switches)}</td>
            <td>${fmtMs(r.total_away_ms)}</td>
        </tr>`).join("");

    view().innerHTML = `
        <div class="card">
            <div class="kicker">Data quality</div>
            <h1>Session review</h1>
            <div class="stat-row">
                <div class="stat"><div class="n good">${counts.good || 0}</div><div class="l">Good</div></div>
                <div class="stat"><div class="n warn">${counts.warn || 0}</div><div class="l">Review</div></div>
                <div class="stat"><div class="n warn">${counts.bad || 0}</div><div class="l">Incomplete</div></div>
            </div>
            <div class="toolbar"><input type="search" id="q-filter" placeholder="Filter…">
                <span class="muted" id="q-count">${flagged.length} row(s)</span></div>
            <div class="scroll-x"><table>
                <thead><tr><th>Participant</th><th>Status</th><th>Blocks</th><th>Exploratory attention</th><th>App-switches</th><th>Time away</th></tr></thead>
                <tbody>${body || `<tr><td colspan="6" class="muted">No sessions yet.</td></tr>`}</tbody>
            </table></div>
            <p class="notice">Completion and app visibility drive review status. Camera-derived attention is exploratory and must not be used as an automatic exclusion criterion.</p>
        </div>`;
    wireFilter("q-filter", "q-count", flagged.length);
}

// --- participant ID pool ------------------------------------------------------
async function loadSlots() {
    view().innerHTML = spinner("Loading ID pool…");
    const { data: slots, error } = await supabase
        .from("participant_slots").select("*").order("code", { ascending: true });
    if (error) { view().innerHTML = errorCard("Could not load the ID pool", error.message); return; }

    const counts = countBy(slots, "status");
    const rows = (slots || []).map((s) => `
        <tr>
            <td><strong>${esc(s.code)}</strong></td>
            <td><span class="pill">${esc(s.status)}</span></td>
            <td>${esc(s.batch || "—")}</td>
            <td>${s.assigned_at ? fmtDate(s.assigned_at) : "—"}</td>
            <td>
                ${s.status !== "revoked" ? `<button class="ghost" data-slot-revoke="${esc(s.id)}">Revoke</button>` : ""}
                <button class="ghost" data-slot-release="${esc(s.id)}">Release</button>
            </td>
        </tr>`).join("");

    view().innerHTML = `
        <div class="card">
            <div class="kicker">Participant IDs</div>
            <h1>${(slots || []).length} code(s)</h1>
            <div class="stat-row">
                <div class="stat"><div class="n">${counts.available || 0}</div><div class="l">Available</div></div>
                <div class="stat"><div class="n">${counts.assigned || 0}</div><div class="l">Assigned</div></div>
                <div class="stat"><div class="n">${counts.completed || 0}</div><div class="l">Completed</div></div>
                <div class="stat"><div class="n">${counts.revoked || 0}</div><div class="l">Revoked</div></div>
            </div>
            <form id="gen-form" style="display:flex; flex-wrap:wrap; gap:12px; align-items:flex-end; margin-bottom:14px;">
                <div><label for="g-prefix">Prefix</label><input id="g-prefix" type="text" value="P" style="width:90px;"></div>
                <div><label for="g-start">Start</label><input id="g-start" type="number" value="1" style="width:90px;"></div>
                <div><label for="g-count">Count</label><input id="g-count" type="number" value="20" style="width:90px;"></div>
                <div><label for="g-pad">Pad</label><input id="g-pad" type="number" value="3" style="width:70px;"></div>
                <button id="gen-btn" type="submit">Generate</button>
                <span id="gen-msg"></span>
            </form>
            <p class="muted" style="margin-top:0;">Generate a pool of IDs to hand out. Revoke a withdrawn candidate; Release frees a code for reuse.</p>
            <div class="toolbar"><input type="search" id="slot-filter" placeholder="Filter codes…">
                <span class="muted" id="slot-count">${(slots || []).length} row(s)</span></div>
            <div class="scroll-x"><table>
                <thead><tr><th>Code</th><th>Status</th><th>Batch</th><th>Assigned</th><th>Actions</th></tr></thead>
                <tbody>${rows || `<tr><td colspan="5" class="muted">No codes yet. Generate a batch above.</td></tr>`}</tbody>
            </table></div>
        </div>`;

    document.getElementById("gen-form").addEventListener("submit", onGenerate);
    view().querySelectorAll("[data-slot-revoke]").forEach((b) =>
        b.addEventListener("click", () => updateSlot(b.dataset.slotRevoke, { status: "revoked", revoked_at: new Date().toISOString() })));
    view().querySelectorAll("[data-slot-release]").forEach((b) =>
        b.addEventListener("click", () => updateSlot(b.dataset.slotRelease, { status: "available", session_id: null, assigned_at: null })));
    wireFilter("slot-filter", "slot-count", (slots || []).length);
}

async function onGenerate(e) {
    e.preventDefault();
    const msg = document.getElementById("gen-msg");
    const built = buildSlotCodes({
        prefix: document.getElementById("g-prefix").value,
        start: document.getElementById("g-start").value,
        count: document.getElementById("g-count").value,
        pad: document.getElementById("g-pad").value
    });
    if (built.error) { msg.innerHTML = `<span class="warn">${esc(built.error)}</span>`; return; }
    const batch = new Date().toISOString().slice(0, 10);
    const rows = built.codes.map((code) => ({ code, batch, status: "available" }));
    const { error } = await supabase.from("participant_slots").upsert(rows, { onConflict: "code", ignoreDuplicates: true });
    if (error) { msg.innerHTML = `<span class="warn">${esc(error.message)}</span>`; return; }
    msg.innerHTML = `<span class="good">Added ${built.codes.length}.</span>`;
    loadSlots();
    refreshNavCounts();
}

async function updateSlot(id, patch) {
    const { error } = await supabase.from("participant_slots").update(patch).eq("id", id);
    if (!error) { loadSlots(); refreshNavCounts(); }
}

// --- registrations (admin): self-registered participants + contact details ----
async function loadRegistrations() {
    view().innerHTML = spinner("Loading registrations…");
    const { data, error } = await supabase
        .from("participant_contacts").select("*").order("created_at", { ascending: false });
    if (error) { view().innerHTML = errorCard("Could not load registrations", error.message); return; }
    const rows = data || [];
    view().innerHTML = `
        <div class="card">
            <div class="view-head"><div>
                <div class="kicker">Administration</div>
                <h1>Registrations</h1>
                <p class="muted" style="margin:0;">Self-registered participants and contact details — admin-only, stored separately from research data.</p>
            </div>${rows.length ? `<button class="ghost" id="reg-export" type="button">Download CSV</button>` : ""}</div>
            <div class="toolbar"><input type="search" id="reg-filter" placeholder="Filter by code, email, name…">
                <span class="muted" id="reg-count">${rows.length} participant(s)</span></div>
            ${genericTable(rows)}
        </div>`;
    wireFilter("reg-filter", "reg-count", rows.length);
    const ex = document.getElementById("reg-export");
    if (ex) ex.addEventListener("click", () => {
        downloadCsv("participant_contacts.csv", toCsv(rows));
        logAction("export_csv", "participant_contacts", { rows: rows.length });
    });
}

// --- access requests (admin) --------------------------------------------------
async function loadAccessRequests() {
    view().innerHTML = spinner("Loading access requests…");
    const { data, error } = await supabase.rpc("admin_list_researchers");
    if (error) { view().innerHTML = errorCard("Could not load access requests", error.message); return; }
    const rows = data || [];
    const roleOptions = (cur) => ["viewer", "researcher", "admin"]
        .map((r) => `<option value="${r}"${r === cur ? " selected" : ""}>${r}</option>`).join("");
    const badge = (r) => r.role === "pending"
        ? `<span class="pill" style="background:rgba(180,83,9,0.12);color:#b45309;">pending</span>`
        : r.role === "denied"
            ? `<span class="pill" style="background:rgba(220,38,38,0.12);color:#dc2626;">denied</span>`
            : `<span class="pill">${esc(r.role)}</span>`;
    const body = rows.map((r) => {
        const defaultRole = ["viewer", "researcher", "admin"].includes(r.role) ? r.role : "viewer";
        return `<tr>
            <td><strong>${esc(r.email)}</strong>${r.full_name ? `<br><span class="muted" style="font-size:0.85em;">${esc(r.full_name)}</span>` : ""}</td>
            <td>${badge(r)}</td>
            <td>${fmtDate(r.requested_at)}</td>
            <td>${r.approved_at ? fmtDate(r.approved_at) : "—"}${r.approved_by_email ? `<br><span class="muted" style="font-size:0.8em;">by ${esc(r.approved_by_email)}</span>` : ""}</td>
            <td style="white-space:nowrap;">
                <select data-role-for="${esc(r.user_id)}" style="width:auto; display:inline-block; padding:6px 8px;">${roleOptions(defaultRole)}</select>
                <button class="ghost" data-approve="${esc(r.user_id)}" type="button">Approve</button>
                <button class="ghost" data-deny="${esc(r.user_id)}" type="button">Deny</button>
            </td>
        </tr>`;
    }).join("");
    const pendingCount = rows.filter((r) => r.role === "pending").length;

    view().innerHTML = `
        <div class="card">
            <div class="kicker">Administration</div>
            <h1>Access requests</h1>
            <p class="muted">Approve a sign-up by granting a role, or deny it. Every decision is recorded in the audit log.
                <strong>${pendingCount}</strong> pending.</p>
            <div class="toolbar"><input type="search" id="acc-filter" placeholder="Filter by email…">
                <span class="muted" id="acc-count">${rows.length} account(s)</span></div>
            <div class="scroll-x"><table>
                <thead><tr><th>Account</th><th>Role</th><th>Requested</th><th>Decided</th><th>Action</th></tr></thead>
                <tbody>${body || `<tr><td colspan="5" class="muted">No accounts yet.</td></tr>`}</tbody>
            </table></div>
        </div>`;

    wireFilter("acc-filter", "acc-count", rows.length);
    view().querySelectorAll("[data-approve]").forEach((b) => b.addEventListener("click", async () => {
        const uid = b.dataset.approve;
        const sel = view().querySelector(`[data-role-for="${uid}"]`);
        b.disabled = true;
        const { error: e } = await supabase.rpc("approve_researcher", { p_user_id: uid, p_role: sel.value });
        if (e) { b.disabled = false; alert(e.message); return; }
        loadAccessRequests();
    }));
    view().querySelectorAll("[data-deny]").forEach((b) => b.addEventListener("click", async () => {
        const uid = b.dataset.deny;
        if (!window.confirm("Deny this account access to study data?")) return;
        b.disabled = true;
        const { error: e } = await supabase.rpc("set_researcher_denied", { p_user_id: uid });
        if (e) { b.disabled = false; alert(e.message); return; }
        loadAccessRequests();
    }));
}

// --- audit log (admin) --------------------------------------------------------
async function loadAuditLog() {
    view().innerHTML = spinner("Loading audit log…");
    const { data, error } = await supabase
        .from("audit_log").select("*").order("created_at", { ascending: false }).limit(2000);
    if (error) { view().innerHTML = errorCard("Could not load audit log", error.message); return; }
    const rows = data || [];
    const body = rows.map((r) => `<tr>
        <td>${fmtDate(r.created_at)}</td>
        <td><strong>${esc(r.actor_email || "—")}</strong></td>
        <td><span class="pill">${esc(r.action)}</span></td>
        <td>${esc(r.target || "—")}</td>
        <td>${r.detail && Object.keys(r.detail).length ? esc(JSON.stringify(r.detail)) : "—"}</td>
    </tr>`).join("");

    view().innerHTML = `
        <div class="card">
            <div class="view-head"><div>
                <div class="kicker">Administration</div>
                <h1>Audit log</h1>
                <p class="muted" style="margin:0;">Append-only record of approvals, denials, and data exports.</p>
            </div></div>
            <div class="toolbar"><input type="search" id="audit-filter" placeholder="Filter…">
                <span class="muted" id="audit-count">${rows.length} entr${rows.length === 1 ? "y" : "ies"}</span></div>
            <div class="scroll-x"><table>
                <thead><tr><th>When</th><th>Who</th><th>Action</th><th>Target</th><th>Detail</th></tr></thead>
                <tbody>${body || `<tr><td colspan="5" class="muted">No audit entries yet.</td></tr>`}</tbody>
            </table></div>
        </div>`;
    wireFilter("audit-filter", "audit-count", rows.length);
}

// hash-driven navigation; only fires once the shell (#view) is mounted.
window.addEventListener("hashchange", () => { if (document.getElementById("view")) navigate(); });
route();
