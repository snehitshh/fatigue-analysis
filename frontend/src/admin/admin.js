// Research console (admin panel).
//
// Authenticated researcher view over the read-only export views. The participant
// app stays anonymous/write-only; this page signs in a Supabase Auth user and reads
// research_session_summary + research_engagement_export (RLS requires a matching
// row in researcher_profiles). Nothing here can write or delete study data.
import { createClient } from "@supabase/supabase-js";

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
document.getElementById("refresh-btn").addEventListener("click", loadDashboard);

// --- helpers ------------------------------------------------------------------
const esc = (v) => String(v == null ? "" : v).replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
));
const fmtDate = (s) => (s ? new Date(s).toLocaleString() : "—");
const fmtMs = (ms) => (ms == null ? "—" : (ms >= 1000 ? (ms / 1000).toFixed(1) + "s" : ms + "ms"));
const pct = (n) => (n == null ? "—" : n + "%");
const stepName = (s) => ({ fitts: "Fitts", typing: "Typing", nasatlx: "NASA-TLX", cognitive: "Cognitive", physical: "Physical" }[s] || s || "—");

function setLoggedInUI(email) {
    actions.hidden = !email;
    userLabel.textContent = email || "";
}

// --- auth ---------------------------------------------------------------------
async function init() {
    if (!isConfigured) {
        root.innerHTML = `<div class="card"><h1>Supabase not configured</h1>
            <p class="muted">Set <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> in <code>.env</code> and rebuild.</p></div>`;
        return;
    }
    const { data } = await supabase.auth.getSession();
    if (data.session) {
        setLoggedInUI(data.session.user.email);
        loadDashboard();
    } else {
        renderLogin();
    }
}

function renderLogin(message) {
    setLoggedInUI(null);
    root.innerHTML = `
        <div class="login-wrap card">
            <div class="kicker">Research Console</div>
            <h1>Sign in</h1>
            <p class="muted">For authorised researchers only.</p>
            <form id="login-form">
                <label for="email">Email</label>
                <input id="email" type="email" autocomplete="username" required>
                <label for="password">Password</label>
                <input id="password" type="password" autocomplete="current-password" required>
                <div style="margin-top:18px;"><button id="login-btn" type="submit">Sign in</button></div>
                ${message ? `<div class="error">${esc(message)}</div>` : ""}
            </form>
        </div>`;
    document.getElementById("login-form").addEventListener("submit", async (e) => {
        e.preventDefault();
        const btn = document.getElementById("login-btn");
        btn.disabled = true; btn.textContent = "Signing in…";
        const email = document.getElementById("email").value.trim();
        const password = document.getElementById("password").value;
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) { renderLogin(error.message); return; }
        const { data } = await supabase.auth.getSession();
        setLoggedInUI(data.session?.user?.email);
        loadDashboard();
    });
}

async function signOut() {
    await supabase.auth.signOut();
    renderLogin();
}

// --- dashboard ----------------------------------------------------------------
async function loadDashboard() {
    root.innerHTML = `<div class="card"><p class="muted">Loading sessions…</p></div>`;
    const { data: sessions, error } = await supabase
        .from("research_session_summary")
        .select("*")
        .order("started_at", { ascending: false });

    if (error) {
        root.innerHTML = `<div class="card"><h1>Could not load data</h1>
            <p class="error">${esc(error.message)}</p>
            <p class="notice">If this says permission denied, your account needs a row in
            <code>researcher_profiles</code>. See <code>backend/supabase/seed.sql</code>.</p></div>`;
        return;
    }

    const rows = (sessions || []).map((s) => `
        <tr data-session="${esc(s.session_id)}">
            <td><strong>${esc(s.participant_code)}</strong></td>
            <td><span class="pill">${esc(s.status)}</span></td>
            <td>${esc(s.final_base_task)} + ${esc(s.final_fatigue_track)}</td>
            <td>${esc(s.block_count)}/3</td>
            <td>${s.avg_nasa_tlx_score == null ? "—" : esc(s.avg_nasa_tlx_score)}</td>
            <td>${fmtDate(s.started_at)}</td>
        </tr>`).join("");

    root.innerHTML = `
        <div class="card">
            <div class="kicker">Sessions</div>
            <h1>${(sessions || []).length} session(s)</h1>
            <p class="muted">Select a session to see its per-test engagement and attention validation.</p>
            <div class="scroll-x">
                <table>
                    <thead><tr><th>Participant</th><th>Status</th><th>Protocol</th><th>Blocks</th><th>NASA avg</th><th>Started</th></tr></thead>
                    <tbody>${rows || `<tr><td colspan="6" class="muted">No sessions yet.</td></tr>`}</tbody>
                </table>
            </div>
        </div>
        <div id="detail"></div>`;

    root.querySelectorAll("tbody tr[data-session]").forEach((tr) => {
        tr.addEventListener("click", () => {
            root.querySelectorAll("tbody tr").forEach((r) => r.classList.remove("selected"));
            tr.classList.add("selected");
            const s = (sessions || []).find((x) => String(x.session_id) === tr.dataset.session);
            loadDetail(s);
        });
    });
}

async function loadDetail(session) {
    const detail = document.getElementById("detail");
    detail.innerHTML = `<div class="card" style="margin-top:18px;"><p class="muted">Loading session detail…</p></div>`;

    const { data: eng, error } = await supabase
        .from("research_engagement_export")
        .select("*")
        .eq("session_id", session.session_id)
        .order("block_number", { ascending: true });

    if (error) {
        detail.innerHTML = `<div class="card" style="margin-top:18px;"><p class="error">${esc(error.message)}</p></div>`;
        return;
    }

    const engRows = (eng || []).map((e) => {
        const att = e.attentive_percent;
        const attClass = att == null ? "muted" : (att >= 75 ? "good" : "warn");
        return `<tr>
            <td>${esc(e.block_number)}</td>
            <td>${esc(stepName(e.step))}</td>
            <td>${fmtMs(e.duration_ms)}</td>
            <td>${e.camera_used ? "Yes" : "No"}</td>
            <td class="${attClass}">${pct(att)}</td>
            <td>${e.look_away_count == null ? "—" : esc(e.look_away_count)}</td>
            <td>${esc(e.app_switch_count)}</td>
            <td>${fmtMs(e.longest_away_ms)}</td>
        </tr>`;
    }).join("");

    const totalAway = (eng || []).reduce((a, e) => a + (e.total_away_ms || 0), 0);
    const totalSwitches = (eng || []).reduce((a, e) => a + (e.app_switch_count || 0), 0);
    const camRows = (eng || []).filter((e) => e.attentive_percent != null);
    const avgAtt = camRows.length ? Math.round(camRows.reduce((a, e) => a + Number(e.attentive_percent), 0) / camRows.length) : null;

    detail.innerHTML = `
        <div class="card" style="margin-top:18px;">
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

            <h2>Per-test engagement & attention validation</h2>
            <div class="scroll-x">
                <table>
                    <thead><tr><th>Block</th><th>Test</th><th>Duration</th><th>Camera</th><th>Attentive %</th><th>Look-aways</th><th>App-switches</th><th>Longest away</th></tr></thead>
                    <tbody>${engRows || `<tr><td colspan="8" class="muted">No engagement rows for this session.</td></tr>`}</tbody>
                </table>
            </div>
            <p class="notice">Attentive % is from the opt-in camera (looking at screen vs away). Low values, many look-aways, or large time-away suggest a session to review.</p>
        </div>`;
}

init();
