import test from "node:test";
import assert from "node:assert/strict";
import { calculateTypingMetrics, levenshteinDistance } from "../frontend/src/lib/typingMetrics.js";

test("typing uses Levenshtein distance and standard five-character WPM", () => {
    assert.equal(levenshteinDistance("kitten", "sitting"), 3);
    const metrics = calculateTypingMetrics({
        original: "hello world",
        typed: "hello worlx",
        keyTimestamps: [0, 100, 300],
        backspaces: 1,
        durationMs: 60000
    });
    assert.equal(metrics.wpm, 2.2);
    assert.equal(metrics.errorDistance, 1);
    assert.equal(metrics.errorPercentage, 9.09);
    assert.equal(metrics.iki, 150);
    assert.equal(metrics.kspc, 0.27);
});
