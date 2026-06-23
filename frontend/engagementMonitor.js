// Engagement / validation monitor (Stage 1: no camera, no permissions).
//
// Rides along with the existing tests and answers "was the participant actually
// engaged with this test?" using two zero-permission signals:
//   1. Page Visibility  -> did they switch away to another app/tab, and for how long
//   2. Scroll behaviour  -> distance, depth, reversals, speed
//
// Data is aggregated PER TEST (one summary, tagged with block + step) and only
// derived numbers are produced - never any media. A future Stage 2 can fill the
// camera-attention fields (attentivePercent, lookAwayCount) without changing this
// shape. Persistence goes through the existing backend bridge (window.fatigueBackend),
// so it is a no-op when Supabase is not configured.
(function () {
    const state = {
        inited: false,
        active: false,
        context: { blockNumber: null, step: null },
        startTime: 0,
        // scroll
        lastScrollY: 0,
        scrollDistance: 0,
        scrollMaxDepth: 0,
        scrollEvents: 0,
        scrollReversals: 0,
        lastScrollDir: 0,
        // visibility
        hiddenAt: 0,
        appSwitchCount: 0,
        totalAwayMs: 0,
        longestAwayMs: 0
    };

    function now() {
        return (window.performance && window.performance.now) ? window.performance.now() : Date.now();
    }

    function scrollY() {
        if (typeof window.scrollY === 'number') return window.scrollY;
        return document.scrollingElement ? document.scrollingElement.scrollTop : 0;
    }

    function onScroll() {
        if (!state.active) return;
        const y = scrollY();
        const dy = y - state.lastScrollY;
        if (dy !== 0) {
            state.scrollDistance += Math.abs(dy);
            const dir = dy > 0 ? 1 : -1;
            if (state.lastScrollDir !== 0 && dir !== state.lastScrollDir) state.scrollReversals++;
            state.lastScrollDir = dir;
        }
        if (y > state.scrollMaxDepth) state.scrollMaxDepth = y;
        state.scrollEvents++;
        state.lastScrollY = y;
    }

    function onVisibility() {
        if (document.hidden) {
            // They just left (switched app / locked screen / changed tab).
            state.hiddenAt = Date.now();
        } else if (state.hiddenAt) {
            const awayMs = Date.now() - state.hiddenAt;
            state.hiddenAt = 0;

            if (state.active) {
                state.appSwitchCount++;
                state.totalAwayMs += awayMs;
                if (awayMs > state.longestAwayMs) state.longestAwayMs = awayMs;
            }

            // Always log the granular event (also useful outside an active test).
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
        window.addEventListener('scroll', onScroll, { passive: true });
        document.addEventListener('visibilitychange', onVisibility);
    }

    // Begin monitoring a test. context = { blockNumber, step }.
    function startTest(context) {
        init();
        state.active = true;
        state.context = {
            blockNumber: (context && context.blockNumber) || null,
            step: (context && context.step) || null
        };
        state.startTime = now();
        state.lastScrollY = scrollY();
        state.scrollDistance = 0;
        state.scrollMaxDepth = state.lastScrollY;
        state.scrollEvents = 0;
        state.scrollReversals = 0;
        state.lastScrollDir = 0;
        state.appSwitchCount = 0;
        state.totalAwayMs = 0;
        state.longestAwayMs = 0;
        state.hiddenAt = document.hidden ? Date.now() : 0;
    }

    // Finish the current test, build a summary, and persist it. Returns the summary.
    function endTest() {
        if (!state.active) return null;
        state.active = false;

        // Account for time spent away if the test ended while still hidden.
        if (state.hiddenAt) {
            const awayMs = Date.now() - state.hiddenAt;
            state.hiddenAt = 0;
            state.appSwitchCount++;
            state.totalAwayMs += awayMs;
            if (awayMs > state.longestAwayMs) state.longestAwayMs = awayMs;
        }

        const durationMs = Math.round(now() - state.startTime);
        const meanSpeed = durationMs > 0 ? (state.scrollDistance / (durationMs / 1000)) : 0;

        const summary = {
            blockNumber: state.context.blockNumber,
            step: state.context.step,
            durationMs,
            scrollDistancePx: Math.round(state.scrollDistance),
            scrollMaxDepthPx: Math.round(state.scrollMaxDepth),
            scrollEvents: state.scrollEvents,
            scrollReversals: state.scrollReversals,
            scrollMeanSpeedPxS: Number(meanSpeed.toFixed(2)),
            appSwitchCount: state.appSwitchCount,
            totalAwayMs: state.totalAwayMs,
            longestAwayMs: state.longestAwayMs,
            // Stage 2 (camera attention) placeholders - filled in later.
            attentivePercent: null,
            lookAwayCount: null,
            cameraUsed: false
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

    window.fatigueEngagement = { init, startTest, endTest, setContext };
    init();
})();
