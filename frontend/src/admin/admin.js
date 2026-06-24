// Research console (admin panel).
//
// Authenticated researcher view. Reads the read-only research_* views and lets a
// researcher UPLOAD manual measurements (ECG / physical) per candidate. Access to
// any study data requires a row in researcher_profiles (RLS) - signing up alone
// grants nothing, so an admin must approve new accounts.
import { createClient } from "@supabase/supabase-js";
import { buildMeasurementPayload } from "./measurement.js";
import { buildSlotCodes } from "./slots.js";
import { qualityFlag } from "./quality.js";
import { toCsv } from "./csv.js";

const EXPORTS = [
    ["research_session_summary", "sessions"],
    ["research_session_quality", "session_quality"],
    ["research_fitts_export", "fitts_trials"],
    ["research_typing_export", "typing_trials"],
    ["research_nasa_tlx_export", "nasa_tlx"],
    ["research_cognitive_export", "cognitive_trials"],
    ["research_physical_export", "physical_fatigue"],
    ["research_engagement_export", "engagement"],
    ["research_manual_measurements_export", "manual_measurements"],
    ["research_scroll_sessions_export", "scroll_sessions"],
    ["research_scroll_intervals_export", "scroll_intervals"],
    ["research_event_export", "session_events"]
];

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
document.getElementById("refresh-btn").addEventListener("click", route);

let candidateCodes = []; // populated from sessions, used for the upload datalist

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

// --- routing / auth -----------------------------------------------------------
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
    const role = await getRole();
    if (!role) { renderPending(email); return; }
    loadDashboard();
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
            renderAuth("login", { type: "notice", text: "Account created. If email confirmation is enabled, confirm via email, then sign in. An admin must grant access." });
            return;
        }
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) { renderAuth("login", { type: "error", text: error.message }); return; }
        route();
    });
}

function renderPending(email) {
    setLoggedInUI(email);
    root.innerHTML = `
        <div class="card">
            <div class="kicker">Account pending</div>
            <h1>Awaiting approval</h1>
            <p class="muted">You are signed in as <strong>${esc(email)}</strong>, but your account has not been
            granted researcher access yet. An administrator must add a row for you in
            <code>researcher_profiles</code> (see <code>SETUP.md</code> §9). Once added, click <strong>Refresh</strong>.</p>
        </div>`;
}

async function signOut() {
    await supabase.auth.signOut();
    renderAuth("login");
}

// --- dashboard ----------------------------------------------------------------
async function loadDashboard() {
    root.innerHTML = `<div class="card"><p class="muted">Loading sessions…</p></div>`;
    const { data: sessions, error } = await supabase
        .from("research_session_summary").select("*").order("started_at", { ascending: false });

    if (error) {
        root.innerHTML = `<div class="card"><h1>Could not load data</h1>
            <p class="error">${esc(error.message)}</p></div>`;
        return;
    }

    candidateCodes = [...new Set((sessions || []).map((s) => s.participant_code).filter(Boolean))];

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
        <div id="quality-card"></div>
        ${renderExportCard()}
        <div id="slots-card"></div>
        ${renderUploadCard()}
        <div class="card" style="margin-top:18px;">
            <div class="kicker">Sessions</div>
            <h1>${(sessions || []).length} session(s)</h1>
            <p class="muted">Select a session to see its per-test engagement, attention, and uploaded measurements.</p>
            <div class="scroll-x">
                <table>
                    <thead><tr><th>Participant</th><th>Status</th><th>Protocol</th><th>Blocks</th><th>NASA avg</th><th>Started</th></tr></thead>
                    <tbody>${rows || `<tr><td colspan="6" class="muted">No sessions yet.</td></tr>`}</tbody>
                </table>
            </div>
        </div>
        <div id="detail"></div>`;

    wireUploadCard();
    wireExportCard();
    loadSlots();
    loadQuality();
    root.querySelectorAll("tbody tr[data-session]").forEach((tr) => {
        tr.addEventListener("click", () => {
            root.querySelectorAll("tbody tr").forEach((r) => r.classList.remove("selected"));
            tr.classList.add("selected");
            const s = (sessions || []).find((x) => String(x.session_id) === tr.dataset.session);
            loadDetail(s);
        });
    });
}

function renderUploadCard() {
    const opts = candidateCodes.map((c) => `<option value="${esc(c)}"></option>`).join("");
    return `
        <div class="card">
            <div class="kicker">Manual upload</div>
            <h1>Add a measurement</h1>
            <p class="muted">Upload an ECG or a manual physical-test result for a candidate.</p>
            <form id="upload-form">
                <div style="display:flex; flex-wrap:wrap; gap:16px;">
                    <div style="flex:1; min-width:200px;">
                        <label for="m-candidate">Candidate (participant code)</label>
                        <input id="m-candidate" list="candidate-list" autocomplete="off" required>
                        <datalist id="candidate-list">${opts}</datalist>
                    </div>
                    <div style="flex:1; min-width:160px;">
                        <label for="m-type">Type</label>
                        <select id="m-type" style="width:100%; padding:11px 13px; border-radius:9px; background:rgba(255,255,255,0.07); color:#e6eefc; border:1px solid rgba(120,170,235,0.24);">
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
        </div>`;
}

function wireUploadCard() {
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
        const built = buildMeasurementPayload({
            participantCode: document.getElementById("m-candidate").value,
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
        document.getElementById("upload-form").reset();
        wireUploadCard(); // restore default field visibility
    });
}

// --- CSV export ---------------------------------------------------------------
function renderExportCard() {
    const btns = EXPORTS.map(([view, name]) =>
        `<button class="ghost" data-export="${view}" data-name="${name}" type="button">${name}.csv</button>`).join(" ");
    return `
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

async function exportOne(view, name) {
    const { data, error } = await supabase.from(view).select("*");
    if (error) return { name, ok: false, error: error.message };
    const rows = data || [];
    if (rows.length) downloadCsv(`${name}.csv`, toCsv(rows));
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
        for (const [view, name] of EXPORTS) {
            msg().textContent = `Exporting ${name}…`;
            const r = await exportOne(view, name);
            if (r.ok) total += r.count;
            await new Promise((res) => setTimeout(res, 400)); // let each download start
        }
        msg().innerHTML = `<span class="good">Exported all datasets (${total} rows total).</span>`;
        all.disabled = false;
    });
}

// --- data quality (go / no-go per session) ------------------------------------
async function loadQuality() {
    const card = document.getElementById("quality-card");
    if (!card) return;
    const { data: rows, error } = await supabase
        .from("research_session_quality").select("*").order("started_at", { ascending: false });
    if (error) {
        card.innerHTML = `<div class="card"><div class="kicker">Data quality</div>
            <p class="muted">Could not load quality view. ${esc(error.message)}</p></div>`;
        return;
    }
    const flagged = (rows || []).map((r) => ({ r, f: qualityFlag(r) }));
    const counts = flagged.reduce((a, x) => { a[x.f.level] = (a[x.f.level] || 0) + 1; return a; }, {});
    const dot = (lvl) => `<span style="display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:7px;background:${lvl === "good" ? "#86efac" : lvl === "warn" ? "#fbbf24" : "#fca5a5"};"></span>`;

    const body = flagged.map(({ r, f }) => `
        <tr>
            <td><strong>${esc(r.participant_code)}</strong></td>
            <td>${dot(f.level)}${esc(f.label)}</td>
            <td>${esc(r.blocks_started)}/3</td>
            <td>${r.avg_attentive_pct == null ? "—" : esc(r.avg_attentive_pct) + "%"}</td>
            <td>${esc(r.total_app_switches)}</td>
            <td>${fmtMs(r.total_away_ms)}</td>
        </tr>`).join("");

    card.innerHTML = `
        <div class="card">
            <div class="kicker">Data quality</div>
            <h1>Go / no-go per candidate</h1>
            <div class="stat-row">
                <div class="stat"><div class="n good">${counts.good || 0}</div><div class="l">Good</div></div>
                <div class="stat"><div class="n warn">${counts.warn || 0}</div><div class="l">Review</div></div>
                <div class="stat"><div class="n warn">${counts.bad || 0}</div><div class="l">Incomplete</div></div>
            </div>
            <div class="scroll-x"><table>
                <thead><tr><th>Participant</th><th>Quality</th><th>Blocks</th><th>Attentive</th><th>App-switches</th><th>Time away</th></tr></thead>
                <tbody>${body || `<tr><td colspan="6" class="muted">No sessions yet.</td></tr>`}</tbody>
            </table></div>
            <p class="notice">Good = finished, attentive, few app-switches. Review = low attention or left the app often. Incomplete = not finished.</p>
        </div>`;
}

// --- participant ID pool ------------------------------------------------------
async function loadSlots() {
    const card = document.getElementById("slots-card");
    if (!card) return;
    const { data: slots, error } = await supabase
        .from("participant_slots").select("*").order("code", { ascending: true });
    if (error) {
        card.innerHTML = `<div class="card"><div class="kicker">Participant IDs</div>
            <p class="muted">Could not load the ID pool. ${esc(error.message)}</p></div>`;
        return;
    }
    const counts = (slots || []).reduce((a, s) => { a[s.status] = (a[s.status] || 0) + 1; return a; }, {});
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

    card.innerHTML = `
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
            <div class="scroll-x"><table>
                <thead><tr><th>Code</th><th>Status</th><th>Batch</th><th>Assigned</th><th>Actions</th></tr></thead>
                <tbody>${rows || `<tr><td colspan="5" class="muted">No codes yet. Generate a batch above.</td></tr>`}</tbody>
            </table></div>
        </div>`;

    document.getElementById("gen-form").addEventListener("submit", onGenerate);
    card.querySelectorAll("[data-slot-revoke]").forEach((b) =>
        b.addEventListener("click", () => updateSlot(b.dataset.slotRevoke, { status: "revoked", revoked_at: new Date().toISOString() })));
    card.querySelectorAll("[data-slot-release]").forEach((b) =>
        b.addEventListener("click", () => updateSlot(b.dataset.slotRelease, { status: "available", session_id: null, assigned_at: null })));
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
}

async function updateSlot(id, patch) {
    const { error } = await supabase.from("participant_slots").update(patch).eq("id", id);
    if (!error) loadSlots();
}

async function loadDetail(session) {
    const detail = document.getElementById("detail");
    detail.innerHTML = `<div class="card" style="margin-top:18px;"><p class="muted">Loading session detail…</p></div>`;

    const [{ data: eng, error: engErr }, { data: meas }] = await Promise.all([
        supabase.from("research_engagement_export").select("*").eq("session_id", session.session_id).order("block_number", { ascending: true }),
        supabase.from("research_manual_measurements_export").select("*").eq("participant_code", session.participant_code).order("recorded_at", { ascending: false })
    ]);

    if (engErr) {
        detail.innerHTML = `<div class="card" style="margin-top:18px;"><p class="error">${esc(engErr.message)}</p></div>`;
        return;
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
        </div>`;
}

route();
