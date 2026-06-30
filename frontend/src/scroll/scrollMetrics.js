// Pure scroll-fatigue metrics. No DOM/network - unit-testable.
//
// intervalStats: aggregate one interval's raw scroll samples into behaviour metrics.
// fatigueTrend: read fatigue as the drift across intervals (scrolling slows and
// pauses lengthen as a person tires).

const round2 = (n) => Math.round(n * 100) / 100;

// samples: [{ y, t }] scroll position (px) + timestamp (ms), in order.
export function intervalStats(samples, pauseThresholdMs = 1500, bounds = {}) {
    const n = samples ? samples.length : 0;
    const startMs = Number.isFinite(bounds.startMs) ? bounds.startMs : (n ? samples[0].t : 0);
    const endMs = Number.isFinite(bounds.endMs) ? bounds.endMs : (n ? samples[n - 1].t : startMs);
    if (n < 2) {
        const idle = endMs - startMs;
        return { distancePx: 0, scrollEvents: Math.max(0, n), reversals: 0, meanSpeedPxS: 0, maxSpeedPxS: 0, pauseCount: idle > pauseThresholdMs ? 1 : 0 };
    }
    let distance = 0, reversals = 0, maxSpeed = 0, pauseCount = 0, lastDir = 0;
    for (let i = 1; i < n; i++) {
        const dy = samples[i].y - samples[i - 1].y;
        const dt = samples[i].t - samples[i - 1].t;
        if (dy !== 0) {
            distance += Math.abs(dy);
            const dir = dy > 0 ? 1 : -1;
            if (lastDir !== 0 && dir !== lastDir) reversals++;
            lastDir = dir;
            if (dt > 0) {
                const sp = Math.abs(dy) / (dt / 1000);
                if (sp > maxSpeed) maxSpeed = sp;
            }
        }
        if (dt > pauseThresholdMs) pauseCount++;
    }
    if (samples[0].t - startMs > pauseThresholdMs) pauseCount++;
    if (endMs - samples[n - 1].t > pauseThresholdMs) pauseCount++;
    const spanMs = Math.max(0, endMs - startMs);
    const meanSpeed = spanMs > 0 ? distance / (spanMs / 1000) : 0;
    return {
        distancePx: round2(distance),
        scrollEvents: n - 1,
        reversals,
        meanSpeedPxS: round2(meanSpeed),
        maxSpeedPxS: round2(maxSpeed),
        pauseCount
    };
}

// intervals: [{ meanSpeedPxS, pauseCount }]. Compares the first third vs the last
// third of the session. speedDropPct > 0 => scrolling slowed (fatigue);
// pauseRisePct > 0 => more/longer pauses (fatigue).
export function fatigueTrend(intervals) {
    const n = intervals ? intervals.length : 0;
    if (n < 2) return { speedDropPct: null, pauseRisePct: null, firstSpeed: null, lastSpeed: null };
    const k = Math.max(1, Math.floor(n / 3));
    const avg = (arr, key) => arr.reduce((a, x) => a + (Number(x[key]) || 0), 0) / arr.length;
    const first = intervals.slice(0, k);
    const last = intervals.slice(n - k);
    const fSpeed = avg(first, "meanSpeedPxS");
    const lSpeed = avg(last, "meanSpeedPxS");
    const fPause = avg(first, "pauseCount");
    const lPause = avg(last, "pauseCount");
    return {
        firstSpeed: round2(fSpeed),
        lastSpeed: round2(lSpeed),
        speedDropPct: fSpeed > 0 ? round2(((fSpeed - lSpeed) / fSpeed) * 100) : null,
        pauseRisePct: fPause > 0 ? round2(((lPause - fPause) / fPause) * 100) : null
    };
}
