import test from "node:test";
import assert from "node:assert/strict";
import { createAxcptTrial, createStroopTrial } from "../frontend/src/lib/cognitiveProtocol.js";

test("Stroop generator includes reproducible congruent and incongruent conditions", () => {
    const congruent = createStroopTrial(() => 0);
    const incongruent = createStroopTrial((() => { const values = [0.9, 0, 0.6]; return () => values.shift() ?? 0; })());
    assert.equal(congruent.condition, "congruent");
    assert.equal(congruent.word, congruent.color);
    assert.equal(incongruent.condition, "incongruent");
    assert.notEqual(incongruent.word, incongruent.color);
});

test("AX-CPT marks only X immediately following A as a target", () => {
    assert.equal(createAxcptTrial("A", () => 0).correctResponse, "M");
    assert.equal(createAxcptTrial(null, () => 0.5).correctResponse, "N");
});
