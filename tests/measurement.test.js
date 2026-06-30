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
