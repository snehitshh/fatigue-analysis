import test from "node:test";
import assert from "node:assert/strict";
import {
    assignCondition,
    deriveSeed,
    kssLabel,
    seededRandom,
    shuffleWithSeed,
    validateKss
} from "../frontend/src/lib/researchProtocol.js";

test("seeded protocol assignment is reproducible", () => {
    assert.deepEqual(assignCondition("session-17"), assignCondition("session-17"));
    assert.equal(deriveSeed("session-17", "typing"), deriveSeed("session-17", "typing"));
    assert.deepEqual(shuffleWithSeed([1, 2, 3, 4], "session-17"), shuffleWithSeed([1, 2, 3, 4], "session-17"));
});

test("seeded random streams are stable and bounded", () => {
    const a = seededRandom("stable");
    const b = seededRandom("stable");
    const values = [a(), a(), a()];
    assert.deepEqual(values, [b(), b(), b()]);
    assert.ok(values.every((value) => value >= 0 && value < 1));
});

test("KSS accepts only whole scores from one to nine", () => {
    assert.equal(validateKss("7"), 7);
    assert.equal(validateKss(0), null);
    assert.equal(validateKss(9.5), null);
    assert.equal(kssLabel(1), "Extremely alert");
    assert.equal(kssLabel(9), "Extremely sleepy, fighting sleep");
});
