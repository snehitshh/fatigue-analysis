// Scroll-fatigue study app (web + Capacitor APK).
//
// The participant scrolls an in-app feed for a chosen duration (30/60/120 min).
// We sample scroll position, aggregate per minute (scrollMetrics.intervalStats),
// and read fatigue as the drift across the session (fatigueTrend). Only derived
// numbers are stored - no content of what they "read". Uploads to the same
// Supabase as the main study; reuses the participant ID pool.
import { experimentApi } from "../lib/experimentApi.js";
import { intervalStats, fatigueTrend } from "./scrollMetrics.js";
import { createSeed, deriveSeed, seededRandom, METRIC_VERSIONS } from "../lib/researchProtocol.js";
import { studyConfig, studyConfigIssues } from "../lib/studyConfig.js";

const app = document.getElementById("app");
const feed = document.getElementById("feed");
const timerBar = document.getElementById("timer-bar");
const timerText = document.getElementById("timer-text");
const finishBtn = document.getElementById("finish-btn");

const DURATIONS = [
    { label: "30 min", min: 30 },
    { label: "1 hour", min: 60 },
    { label: "2 hours", min: 120 },
    { label: "Test (2 min)", min: 2 }
];

const state = {
    participantCode: "",
    durationMin: 30,
    contentMode: "feed",
    samples: [],
    intervals: [],
    intervalIndex: 0,
    sessionStart: 0,
    intervalStart: 0,
    startedAtISO: null,
    ratingStart: null,
    ratingEnd: null,
    lastSampleT: 0,
    finished: false,
    intervalTimer: null,
    countdownTimer: null,
    cardSeed: 0,
    scrollSessionId: null,
    protocolSeed: createSeed(),
    contentRandom: null
};

const now = () => (window.performance && performance.now ? performance.now() : Date.now());
const esc = (v) => String(v == null ? "" : v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function deviceInfo() {
    return {
        userAgent: navigator.userAgent,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        devicePixelRatio: window.devicePixelRatio || 1,
        platform: navigator.platform || null
    };
}

// --- screens ------------------------------------------------------------------
function showStart() {
    feed.style.display = "none";
    timerBar.style.display = "none";
    const configIssues = studyConfigIssues(studyConfig);
    if (configIssues.length) {
        app.innerHTML = `<div class="center"><div class="card"><h1>Study setup is incomplete</h1>
            <p class="err">Missing: ${esc(configIssues.join(", "))}</p>
            <p class="muted">Configure the public study details in .env and rebuild before participant collection.</p></div></div>`;
        return;
    }
    app.innerHTML = `
        <div class="center"><div class="card">
            <div class="kicker">Scroll Study</div>
            <h1>Scrolling &amp; fatigue</h1>
            <p class="muted">You'll scroll a feed for the time you choose. We measure how your
            scrolling changes over the session - not what you look at. You can stop any time.</p>
            <p class="muted"><strong>${esc(studyConfig.institution)}</strong> · Protocol ${esc(studyConfig.protocolId)}<br>
            Data retention: ${esc(studyConfig.retention)} · Contact: ${esc(studyConfig.contact)}</p>
            <label for="pid">Participant ID</label>
            <input id="pid" type="text" inputmode="text" autocomplete="off" placeholder="ID given by the researcher">
            <label>How long can you take part?</label>
            <div class="opts" id="dur-opts">
                ${DURATIONS.map((d, i) => `<div class="opt ${i === 0 ? "sel" : ""}" data-min="${d.min}">${d.label}</div>`).join("")}
            </div>
            <label class="check"><input type="checkbox" id="consent-box">
                <span>I am at least 16, understand the information above, and agree to my pseudonymous scrolling measurements being stored for research.</span></label>
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
        const code = document.getElementById("pid").value.trim();
        if (!code) { err.textContent = "Please enter your participant ID."; err.hidden = false; return; }
        btn.disabled = true; btn.textContent = "Checking…";
        const claim = await claimOrAllow(code);
        if (!claim.ok) {
            err.textContent = claim.reason === "taken" ? "This ID has already been used."
                : claim.reason === "unknown" ? "This ID is not recognised."
                : "Could not verify your ID. Check your connection.";
            err.hidden = false; btn.disabled = false; btn.textContent = "Start"; return;
        }
        state.participantCode = code;
        showRating("start");
    });
}

async function claimOrAllow(code) {
    if (!experimentApi || !experimentApi.isSupabaseConfigured) return { ok: true };
    const res = await experimentApi.claimParticipantCode(code);
    if (res.error) return { ok: false, reason: "network" };
    const d = res.data || {};
    if (d.disabled || d.ok) return { ok: true };
    // The scroll study only needs the ID to be a real, provisioned code - it does not
    // need an exclusive claim, so an ID already used in the main study is still fine.
    if (d.reason === "taken") return { ok: true };
    return { ok: false, reason: d.reason || "unknown" };
}

function showRating(which) {
    feed.style.display = "none";
    timerBar.style.display = "none";
    app.innerHTML = `
        <div class="center"><div class="card">
            <div class="kicker">${which === "start" ? "Before you begin" : "One last thing"}</div>
            <h1>How tired do you feel right now?</h1>
            <p class="muted">KSS: 1 = extremely alert, 9 = extremely sleepy and fighting sleep.</p>
            <div class="scale" id="scale">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `<div class="n" data-n="${n}">${n}</div>`).join("")}</div>
            <button class="primary" id="rate-btn" disabled>${which === "start" ? "Begin scrolling" : "Finish"}</button>
        </div></div>`;
    let picked = null;
    app.querySelectorAll("#scale .n").forEach((el) => el.addEventListener("click", () => {
        app.querySelectorAll("#scale .n").forEach((x) => x.classList.remove("sel"));
        el.classList.add("sel"); picked = Number(el.dataset.n);
        document.getElementById("rate-btn").disabled = false;
    }));
    document.getElementById("rate-btn").addEventListener("click", () => {
        if (which === "start") { state.ratingStart = picked; startFeed(); }
        else { state.ratingEnd = picked; upload(); }
    });
}

// --- the scrolling session ----------------------------------------------------
async function startFeed() {
    app.innerHTML = `<div class="center"><div class="card"><h1>Starting…</h1></div></div>`;
    state.sessionStart = now();
    state.intervalStart = state.sessionStart;
    state.startedAtISO = new Date().toISOString();
    state.contentRandom = seededRandom(deriveSeed(state.protocolSeed, "scroll-content"));

    // Insert the session up front so per-minute intervals can stream in live - a
    // long session that drops part-way keeps everything uploaded so far.
    if (experimentApi && experimentApi.isSupabaseConfigured) {
        try {
            const res = await experimentApi.saveScrollSession({
                participant_code: state.participantCode,
                content_mode: state.contentMode,
                chosen_duration_min: state.durationMin,
                self_rating_start: state.ratingStart,
                device_info: { ...deviceInfo(), protocolSeed: state.protocolSeed, metricVersion: METRIC_VERSIONS.scroll },
                started_at: state.startedAtISO
            });
            state.scrollSessionId = res && res.data && res.data.id;
        } catch (e) { console.warn("scroll session start failed", e); }
    }

    app.innerHTML = "";
    feed.style.display = "block";
    timerBar.style.display = "flex";
    state.cardSeed = 0;
    appendCards(20);

    window.addEventListener("scroll", onScroll, { passive: true });
    state.intervalTimer = setInterval(finalizeInterval, 60 * 1000);

    let remaining = state.durationMin * 60;
    renderTimer(remaining);
    state.countdownTimer = setInterval(() => {
        remaining -= 1;
        renderTimer(remaining);
        if (remaining <= 0) finishFeed();
    }, 1000);

    finishBtn.onclick = finishFeed;
}

function renderTimer(secs) {
    const s = Math.max(0, secs);
    timerText.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function onScroll() {
    const t = now();
    if (t - state.lastSampleT < 30) return; // throttle ~33/s max
    state.lastSampleT = t;
    const y = window.scrollY || document.documentElement.scrollTop || 0;
    state.samples.push({ y, t });
    // keep an "infinite" feed so a long session never runs out of content
    if (y + window.innerHeight > feed.scrollHeight - 1200) appendCards(10);
}

function finalizeInterval() {
    const intervalEnd = now();
    const stats = intervalStats(state.samples, 1500, { startMs: state.intervalStart, endMs: intervalEnd });
    const iv = { interval_index: state.intervalIndex, self_rating: null, ...stats };
    state.intervals.push(iv);
    state.samples = [];
    state.intervalStart = intervalEnd;
    state.intervalIndex += 1;
    // Live upload (resilient: goes through the durable write-queue on failure).
    if (experimentApi && experimentApi.isSupabaseConfigured && state.scrollSessionId) {
        experimentApi.saveScrollInterval({
            scroll_session_id: state.scrollSessionId,
            participant_code: state.participantCode,
            interval_index: iv.interval_index,
            distance_px: iv.distancePx,
            scroll_events: iv.scrollEvents,
            reversals: iv.reversals,
            mean_speed_px_s: iv.meanSpeedPxS,
            max_speed_px_s: iv.maxSpeedPxS,
            pause_count: iv.pauseCount,
            self_rating: iv.self_rating
        });
    }
}

function finishFeed() {
    if (state.finished) return;
    state.finished = true;
    clearInterval(state.intervalTimer);
    clearInterval(state.countdownTimer);
    window.removeEventListener("scroll", onScroll);
    if (state.samples.length) finalizeInterval();
    showRating("end");
}

// --- upload + done ------------------------------------------------------------
async function upload() {
    feed.style.display = "none";
    timerBar.style.display = "none";
    app.innerHTML = `<div class="center"><div class="card"><h1>Saving…</h1><p class="muted">One moment.</p></div></div>`;

    const totalDistance = state.intervals.reduce((a, i) => a + (i.distancePx || 0), 0);
    const totalEvents = state.intervals.reduce((a, i) => a + (i.scrollEvents || 0), 0);
    const totalPauses = state.intervals.reduce((a, i) => a + (i.pauseCount || 0), 0);
    const actualMs = Math.round(now() - state.sessionStart);
    const meanSpeed = actualMs > 0 ? Math.round((totalDistance / (actualMs / 1000)) * 100) / 100 : 0;
    const trend = fatigueTrend(state.intervals);

    const summary = {
        distanceKpx: Math.round(totalDistance / 100) / 10,
        speedDropPct: trend.speedDropPct,
        pauseRisePct: trend.pauseRisePct,
        ratingStart: state.ratingStart,
        ratingEnd: state.ratingEnd
    };

    // The session row + per-minute intervals were uploaded live; here we just set
    // the totals + end rating + completed_at on the session.
    if (experimentApi && experimentApi.isSupabaseConfigured && state.scrollSessionId) {
        try {
            await experimentApi.finalizeScrollSession(state.scrollSessionId, {
                actual_duration_ms: actualMs,
                total_distance_px: Math.round(totalDistance * 100) / 100,
                total_scroll_events: totalEvents,
                total_pauses: totalPauses,
                mean_speed_px_s: meanSpeed,
                speed_drop_pct: trend.speedDropPct,
                pause_rise_pct: trend.pauseRisePct,
                self_rating_end: state.ratingEnd
            });
        } catch (e) {
            console.warn("scroll finalize failed", e);
        }
    }
    showDone(summary);
}

function showDone(s) {
    app.innerHTML = `
        <div class="center"><div class="card" style="text-align:center;">
            <div class="kicker">Complete</div>
            <h1>Thank you</h1>
            <p class="muted">Your scrolling session was recorded.</p>
            <div style="text-align:left; margin-top:14px;">
                <h2>Your session</h2>
                <p class="muted">Distance scrolled: <strong>${esc(s.distanceKpx)}k px</strong><br>
                Tiredness: <strong>${s.ratingStart == null ? "—" : esc(s.ratingStart)} → ${s.ratingEnd == null ? "—" : esc(s.ratingEnd)}</strong><br>
                Scroll slowdown: <strong>${s.speedDropPct == null ? "—" : esc(s.speedDropPct) + "%"}</strong><br>
                Pause increase: <strong>${s.pauseRisePct == null ? "—" : esc(s.pauseRisePct) + "%"}</strong></p>
            </div>
            <button class="primary" onclick="location.reload()">Done</button>
        </div></div>`;
}

// --- synthetic feed content ---------------------------------------------------
const WORDS = ("fatigue attention scrolling research interaction pattern signal rhythm session " +
    "behaviour cognitive sample reading focus break rest motion gesture velocity dwell").split(" ");
function lorem(n) {
    let out = [];
    const random = state.contentRandom || Math.random;
    for (let i = 0; i < n; i++) out.push(WORDS[Math.floor(random() * WORDS.length)]);
    const s = out.join(" ");
    return s.charAt(0).toUpperCase() + s.slice(1) + ".";
}
function appendCards(n) {
    let html = "";
    for (let i = 0; i < n; i++) {
        state.cardSeed += 1;
        html += `<div class="post">
            <div class="head"><div class="avatar"></div>
                <div><div class="who">researcher_${state.cardSeed}</div><div class="sub">post #${state.cardSeed}</div></div></div>
            <div class="media"></div>
            <div class="body">${esc(lorem(18 + (state.cardSeed % 30)))}</div>
        </div>`;
    }
    feed.insertAdjacentHTML("beforeend", html);
}

showStart();
