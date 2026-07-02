// Phone-usage fatigue study (runs inside the FatigueIDPro Android app).
//
// GOAL: measure REAL phone use. The participant uses their own phone normally
// (Instagram, Facebook, YouTube, ...) for a chosen window while a native background
// service records, per app: foreground time (Android UsageStats), opens, and
// scroll-event counts (AccessibilityService). Fatigue is read from how usage/scroll
// activity drifts across the window. No content is captured.
//
// This web layer handles registration, the KSS ratings, and session start/finalize.
// The native layer must expose window.FatiguePhoneUsage:
//   isAvailable(): boolean
//   start({ sessionId, participantCode, durationMin, supabaseUrl, supabaseKey }): Promise
//       -> begins background recording; uploads per-interval rows to app_usage_intervals
//   stop(): Promise<{ totalForegroundMs, totalScrollEvents, totalOpens,
//                     appBreakdown: [{app_label, app_package, foreground_ms, scroll_events}],
//                     scrollDropPct, engagementDropPct }>
//   appVersion?: string
// In a plain browser (no native bridge) the study explains it needs the app.
import { experimentApi } from "../lib/experimentApi.js";
import { studyConfig, studyConfigIssues } from "../lib/studyConfig.js";

const app = document.getElementById("app");
const feed = document.getElementById("feed");
const timerBar = document.getElementById("timer-bar");
const timerText = document.getElementById("timer-text");
const finishBtn = document.getElementById("finish-btn");

const DURATIONS = [
    { label: "30 min", min: 30 },
    { label: "1 hour", min: 60 },
    { label: "2 hours", min: 120 }
];

const state = {
    participantCode: "",
    durationMin: 30,
    sessionId: null,
    startMs: 0,
    ratingStart: null,
    ratingEnd: null,
    totals: {},
    countdownTimer: null
};

const esc = (v) => String(v == null ? "" : v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const bridge = () => (typeof window !== "undefined" ? window.FatiguePhoneUsage : null);

function deviceInfo() {
    return {
        userAgent: navigator.userAgent,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        devicePixelRatio: window.devicePixelRatio || 1,
        platform: navigator.platform || null
    };
}

// --- start / registration -----------------------------------------------------
function showStart() {
    feed.style.display = "none";
    timerBar.style.display = "none";
    const configIssues = studyConfigIssues(studyConfig);
    if (configIssues.length) {
        app.innerHTML = `<div class="center"><div class="card"><h1>Study setup is incomplete</h1>
            <p class="err">Missing: ${esc(configIssues.join(", "))}</p>
            <p class="muted">Configure the public study details and rebuild before collection.</p></div></div>`;
        return;
    }
    app.innerHTML = `
        <div class="center"><div class="card">
            <div class="kicker">Phone-Use Study</div>
            <h1>Phone use &amp; fatigue</h1>
            <p class="muted">Use your phone <strong>as you normally would</strong> &mdash; Instagram, Facebook,
            YouTube, whatever you use &mdash; for the time you choose. In the background we record only
            <strong>which apps you use, how long, how often you open them, and how much you scroll</strong>.
            We never see what you look at or type.</p>
            <p class="muted"><strong>${esc(studyConfig.institution)}</strong> · Protocol ${esc(studyConfig.protocolId)}<br>
            Data retention: ${esc(studyConfig.retention)} · Contact: ${esc(studyConfig.contact)}</p>
            <p class="muted">We issue your participant ID automatically from your email (used only to avoid
            duplicate sign-ups, stored separately from your usage data).</p>
            <label for="email">Email <span class="hint">(for your participant ID)</span></label>
            <input id="email" type="email" inputmode="email" autocomplete="email" placeholder="you@example.com">
            <label for="pname">Full name <span class="hint">(optional)</span></label>
            <input id="pname" type="text" autocomplete="name" placeholder="Optional">
            <label for="pphone">Phone <span class="hint">(optional)</span></label>
            <input id="pphone" type="tel" inputmode="tel" autocomplete="tel" placeholder="Optional">
            <label>How long can you take part?</label>
            <div class="opts" id="dur-opts">
                ${DURATIONS.map((d, i) => `<div class="opt ${i === 0 ? "sel" : ""}" data-min="${d.min}">${d.label}</div>`).join("")}
            </div>
            <label class="check"><input type="checkbox" id="consent-box">
                <span>I am at least 16, understand the above, and agree to my pseudonymous app-usage measurements
                (which apps, time, opens, scroll counts &mdash; not content) being recorded for research.</span></label>
            <div id="start-err" class="err" hidden></div>
            <button class="primary" id="start-btn" disabled>Start</button>
        </div></div>`;

    app.querySelectorAll("#dur-opts .opt").forEach((o) => o.addEventListener("click", () => {
        app.querySelectorAll("#dur-opts .opt").forEach((x) => x.classList.remove("sel"));
        o.classList.add("sel");
        state.durationMin = Number(o.dataset.min);
    }));
    const box = document.getElementById("consent-box");
    const btn = document.getElementById("start-btn");
    box.addEventListener("change", () => { btn.disabled = !box.checked; });

    btn.addEventListener("click", async () => {
        const err = document.getElementById("start-err");
        const email = document.getElementById("email").value.trim();
        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            err.textContent = "Please enter a valid email address."; err.hidden = false; return;
        }
        btn.disabled = true; btn.textContent = "Registering…";
        const reg = await registerOrAllow(email, document.getElementById("pname").value.trim(), document.getElementById("pphone").value.trim());
        if (!reg.ok) {
            err.textContent = reg.reason === "invalid" ? "Please enter a valid email address."
                : "Could not register right now. Check your connection.";
            err.hidden = false; btn.disabled = false; btn.textContent = "Start"; return;
        }
        state.participantCode = reg.code;
        showRating("start");
    });
}

// Self-registration: auto-issue a unique participant code, de-duplicated by email.
async function registerOrAllow(email, name, phone) {
    if (!experimentApi || !experimentApi.isSupabaseConfigured || typeof experimentApi.registerParticipant !== "function") {
        return { ok: true, code: "FP-" + Math.random().toString(36).slice(2, 8).toUpperCase() };
    }
    const res = await experimentApi.registerParticipant(email, name, phone);
    if (res.error) {
        if (/invalid email/i.test(res.error.message || "")) return { ok: false, reason: "invalid" };
        return { ok: false, reason: "network" };
    }
    const d = res.data || {};
    if (!d.code) return { ok: false, reason: "unknown" };
    return { ok: true, code: d.code };
}

// --- KSS rating ---------------------------------------------------------------
function showRating(which) {
    feed.style.display = "none";
    timerBar.style.display = "none";
    app.innerHTML = `
        <div class="center"><div class="card">
            <div class="kicker">${which === "start" ? "Before you begin" : "One last thing"}</div>
            <h1>How tired do you feel right now?</h1>
            ${which === "start" ? `<p class="muted">Your participant ID: <span class="pill-id">${esc(state.participantCode)}</span> &mdash; please save it.</p>` : ""}
            <p class="muted">KSS: 1 = extremely alert, 9 = extremely sleepy and fighting sleep.</p>
            <div class="scale" id="scale">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `<div class="n" data-n="${n}">${n}</div>`).join("")}</div>
            <button class="primary" id="rate-btn" disabled>${which === "start" ? "Begin" : "Finish"}</button>
        </div></div>`;
    let picked = null;
    app.querySelectorAll("#scale .n").forEach((el) => el.addEventListener("click", () => {
        app.querySelectorAll("#scale .n").forEach((x) => x.classList.remove("sel"));
        el.classList.add("sel"); picked = Number(el.dataset.n);
        document.getElementById("rate-btn").disabled = false;
    }));
    document.getElementById("rate-btn").addEventListener("click", () => {
        if (which === "start") { state.ratingStart = picked; startTracking(); }
        else { state.ratingEnd = picked; upload(); }
    });
}

// --- tracking -----------------------------------------------------------------
async function startTracking() {
    app.innerHTML = `<div class="center"><div class="card"><h1>Starting…</h1></div></div>`;
    state.startMs = Date.now();

    if (experimentApi && experimentApi.isSupabaseConfigured) {
        try {
            const res = await experimentApi.savePhoneUsageSession({
                participant_code: state.participantCode,
                platform: bridge() ? "android" : "web",
                app_version: (bridge() && bridge().appVersion) || null,
                device_info: deviceInfo(),
                chosen_duration_min: state.durationMin,
                self_rating_start: state.ratingStart,
                started_at: new Date(state.startMs).toISOString()
            });
            state.sessionId = res && res.data && res.data.id;
        } catch (e) { console.warn("phone-usage session start failed", e); }
    }

    const b = bridge();
    if (b && typeof b.start === "function") {
        try {
            await b.start({
                sessionId: state.sessionId,
                participantCode: state.participantCode,
                durationMin: state.durationMin
            });
        } catch (e) { console.warn("native start failed", e); }
        showTracking();
    } else {
        showNeedsApp();
    }
}

function showTracking() {
    app.innerHTML = `
        <div class="center"><div class="card">
            <div class="kicker">Recording</div>
            <h1>You're all set</h1>
            <p class="muted">Now just <strong>use your phone normally</strong> for about
            <strong>${state.durationMin} minutes</strong> &mdash; open Instagram, Facebook, YouTube, whatever
            you'd usually use. You can leave this app; recording continues in the background.</p>
            <p class="muted">When your time is up, come back here and tap <strong>Finish</strong>.</p>
        </div></div>`;
    timerBar.style.display = "flex";
    let remaining = state.durationMin * 60;
    renderTimer(remaining);
    state.countdownTimer = setInterval(() => {
        remaining -= 1;
        renderTimer(remaining);
        if (remaining <= 0) { clearInterval(state.countdownTimer); }
    }, 1000);
    finishBtn.onclick = finishTracking;
}

function renderTimer(secs) {
    const s = Math.max(0, secs);
    timerText.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

async function finishTracking() {
    if (state.countdownTimer) clearInterval(state.countdownTimer);
    timerBar.style.display = "none";
    const b = bridge();
    if (b && typeof b.stop === "function") {
        try { state.totals = (await b.stop()) || {}; } catch (e) { console.warn("native stop failed", e); }
    }
    showRating("end");
}

// --- upload + done ------------------------------------------------------------
async function upload() {
    app.innerHTML = `<div class="center"><div class="card"><h1>Saving…</h1><p class="muted">One moment.</p></div></div>`;
    const t = state.totals || {};
    if (experimentApi && experimentApi.isSupabaseConfigured && state.sessionId) {
        try {
            await experimentApi.finalizePhoneUsageSession(state.sessionId, {
                actual_duration_ms: Date.now() - state.startMs,
                total_foreground_ms: t.totalForegroundMs,
                total_scroll_events: t.totalScrollEvents,
                total_opens: t.totalOpens,
                app_breakdown: t.appBreakdown || null,
                scroll_drop_pct: t.scrollDropPct,
                engagement_drop_pct: t.engagementDropPct,
                self_rating_end: state.ratingEnd
            });
        } catch (e) { console.warn("phone-usage finalize failed", e); }
    }
    showDone(t);
}

function showDone(t) {
    const mins = t.totalForegroundMs != null ? Math.round(t.totalForegroundMs / 60000) : null;
    app.innerHTML = `
        <div class="center"><div class="card" style="text-align:center;">
            <div class="kicker">Complete</div>
            <h1>Thank you</h1>
            <p class="muted">Your phone-usage session was recorded.</p>
            <div style="text-align:left; margin-top:14px;">
                <h2>Your session</h2>
                <p class="muted">
                Time on apps: <strong>${mins == null ? "—" : mins + " min"}</strong><br>
                Scrolls counted: <strong>${t.totalScrollEvents == null ? "—" : esc(t.totalScrollEvents)}</strong><br>
                App opens: <strong>${t.totalOpens == null ? "—" : esc(t.totalOpens)}</strong><br>
                Tiredness: <strong>${state.ratingStart == null ? "—" : esc(state.ratingStart)} → ${state.ratingEnd == null ? "—" : esc(state.ratingEnd)}</strong></p>
            </div>
            <button class="primary" onclick="location.reload()">Done</button>
        </div></div>`;
}

// --- browser fallback ---------------------------------------------------------
function showNeedsApp() {
    app.innerHTML = `
        <div class="center"><div class="card">
            <div class="kicker">Almost there</div>
            <h1>Open this in the FatigueIDPro app</h1>
            <p class="muted">This study measures real phone use, which needs the <strong>FatigueIDPro Android
            app</strong> (a web browser can't see other apps). You're registered as
            <span class="pill-id">${esc(state.participantCode)}</span> &mdash; install the app, sign in with the
            same email, and this study will run there.</p>
            <p class="muted">What the app records: which apps you use, for how long, how often you open them, and
            how much you scroll. Never any content.</p>
            <button class="primary" onclick="location.reload()">Back</button>
        </div></div>`;
}

showStart();
