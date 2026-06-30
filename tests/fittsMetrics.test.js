import test from "node:test";
import assert from "node:assert/strict";
import { calculateFittsMetrics } from "../frontend/src/lib/fittsMetrics.js";

test("Fitts metrics use movement time after first-target acquisition", () => {
    const result = calculateFittsMetrics({ sumOfId: 30, movementTimeMs: 5000, clicks: 11, misclicks: 2 });
    assert.equal(result.movementCount, 10);
    assert.equal(result.avgIndexOfDifficulty, 3);
    assert.equal(result.throughputBps, 6);
    assert.equal(result.avgMovementTimeMs, 500);
    assert.equal(result.errorRatePercent, 15.38);
});

test("Fitts metrics reject a set without a measured movement", () => {
    assert.equal(calculateFittsMetrics({ sumOfId: 0, movementTimeMs: 0, clicks: 1, misclicks: 0 }), null);
});
