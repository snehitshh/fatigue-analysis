import test from "node:test";
import assert from "node:assert/strict";
import { buildMeasurementPayload } from "../frontend/src/admin/measurement.js";

test("manual measurements retain immutable session linkage", () => {
    const result = buildMeasurementPayload({
        participantCode: "P001",
        sessionId: "11111111-1111-4111-8111-111111111111",
        type: "ecg",
        heartRate: "72"
    });
    assert.equal(result.row.session_id, "11111111-1111-4111-8111-111111111111");
});

test("block number tags a reading to the exact task block (for comparing against an external device)", () => {
    const tagged = buildMeasurementPayload({ participantCode: "P001", type: "ecg", heartRate: "72", blockNumber: "2" });
    assert.equal(tagged.row.block_number, 2);

    const wholeSession = buildMeasurementPayload({ participantCode: "P001", type: "ecg", heartRate: "72", blockNumber: "" });
    assert.equal(wholeSession.row.block_number, null);

    const invalid = buildMeasurementPayload({ participantCode: "P001", type: "ecg", heartRate: "72", blockNumber: "5" });
    assert.ok(invalid.error);
});
