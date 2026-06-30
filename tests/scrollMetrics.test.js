import test from "node:test";
import assert from "node:assert/strict";
import { intervalStats } from "../frontend/src/scroll/scrollMetrics.js";

test("scroll speed uses the complete interval and counts boundary inactivity", () => {
    const stats = intervalStats(
        [{ y: 0, t: 2000 }, { y: 600, t: 3000 }],
        1500,
        { startMs: 0, endMs: 6000 }
    );
    assert.equal(stats.distancePx, 600);
    assert.equal(stats.meanSpeedPxS, 100);
    assert.equal(stats.pauseCount, 2);
});
