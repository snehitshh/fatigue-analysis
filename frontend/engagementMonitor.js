// Engagement / validation monitor.
//
// Per-test validation signals (only derived numbers are produced - never any media):
//   1. Page Visibility -> app-switches: count, total + longest time away
//   2. Camera attention (optional, Stage 2) -> attentive %, look-away count
//
// Data is aggregated PER TEST (one summary, tagged with block + step) and persisted
// through the existing backend bridge (window.fatigueBackend), so it is a no-op when
// Supabase is not configured. The camera tracker (attentionTracker.js) pushes samples
// here via recordAttentionSample(); if the participant declines the camera, the
// app-switch signal still works on its own.
(function () {
    const state = {
        inited: false,
        active: false,
        context: { blockNumber: null, step: null },
        startTime: 0,
        // visibility
        hiddenAt: 0,
        appSwitchCount: 0,
        totalAwayMs: 0,
        longestAwayMs: 0,
        // camera attention
        attentionSamples: 0,
        attentiveSamples: 0,
        lookAwayCount: 0,
        lastAttentive: null,
        cameraUsed: false
    };

    function now() {
        return (window.performance && window.performance.now) ? window.performance.now() : Date.now();
    }

    function onVisibility() {
        if (document.hidden) {
            state.hiddenAt = Date.now();
        } else if (state.hiddenAt) {
            const awayMs = Date.now() - state.hiddenAt;
            state.hiddenAt = 0;

            if (state.active) {
                state.appSwitchCount++;
                state.totalAwayMs += awayMs;
                if (awayMs > state.longestAwayMs) state.longestAwayMs = awayMs;
            }

            const backend = window.fatigueBackend;
            if (backend && typeof backend.recordEngagementEvent === 'function') {
                backend.recordEngagementEvent('app_switch', {
                    step: state.context.step,
                    blockNumber: state.context.blockNumber,
                    awayMs
                });
            }
        }
    }

    function init() {
        if (state.inited) return;
        state.inited = true;
        document.addEventListener('visibilitychange', onVisibility);
    }

    function startTest(context) {
        init();
        state.active = true;
        state.context = {
            blockNumber: (context && context.blockNumber) || null,
            step: (context && context.step) || null
        };
        state.startTime = now();
        state.hiddenAt = document.hidden ? Date.now() : 0;
        state.appSwitchCount = 0;
        state.totalAwayMs = 0;
        state.longestAwayMs = 0;
        state.attentionSamples = 0;
        state.attentiveSamples = 0;
        state.lookAwayCount = 0;
        state.lastAttentive = null;
        state.cameraUsed = false;
    }

    // Called by attentionTracker.js, a few times per second, with a boolean:
    // true  = participant appears to be looking at the screen
    // false = no face / looking away
    function recordAttentionSample(attentive) {
        if (!state.active) return;
        state.cameraUsed = true;
        state.attentionSamples++;
        if (attentive) state.attentiveSamples++;
        // A look-away = a transition from attentive to not-attentive.
        if (state.lastAttentive === true && attentive === false) state.lookAwayCount++;
        state.lastAttentive = attentive;
    }

    function endTest() {
        if (!state.active) return null;
        state.active = false;

        if (state.hiddenAt) {
            const awayMs = Date.now() - state.hiddenAt;
            state.hiddenAt = 0;
            state.appSwitchCount++;
            state.totalAwayMs += awayMs;
            if (awayMs > state.longestAwayMs) state.longestAwayMs = awayMs;
        }

        const durationMs = Math.round(now() - state.startTime);
        const attentivePercent = state.attentionSamples > 0
            ? Number(((state.attentiveSamples / state.attentionSamples) * 100).toFixed(2))
            : null;

        const summary = {
            blockNumber: state.context.blockNumber,
            step: state.context.step,
            durationMs,
            appSwitchCount: state.appSwitchCount,
            totalAwayMs: state.totalAwayMs,
            longestAwayMs: state.longestAwayMs,
            attentivePercent,
            lookAwayCount: state.cameraUsed ? state.lookAwayCount : null,
            cameraUsed: state.cameraUsed
        };

        const backend = window.fatigueBackend;
        if (backend && typeof backend.saveEngagementSummary === 'function') {
            backend.saveEngagementSummary(summary);
        }
        return summary;
    }

    function setContext(context) {
        if (!context) return;
        state.context = {
            blockNumber: context.blockNumber != null ? context.blockNumber : state.context.blockNumber,
            step: context.step != null ? context.step : state.context.step
        };
    }

    window.fatigueEngagement = { init, startTest, endTest, recordAttentionSample, setContext };
    init();
})();
