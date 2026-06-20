import test from "node:test";
import assert from "node:assert/strict";
import { buildRecordLabel, sanitizeIdentifier } from "../frontend/src/lib/recordIdentity.js";

test("sanitizeIdentifier keeps labels filesystem and database friendly", () => {
    assert.equal(sanitizeIdentifier(" Candidate 001 / Block A "), "Candidate_001_Block_A");
    assert.equal(sanitizeIdentifier("***"), "unknown");
});

test("buildRecordLabel includes candidate, session, block, dataset, and sequence", () => {
    assert.equal(
        buildRecordLabel({
            participantCode: "Candidate 001",
            sessionCode: "Candidate 001-171234",
            blockNumber: 2,
            dataset: "nasa tlx",
            sequenceNumber: 5
        }),
        "Candidate_001_Candidate_001-171234_block_02_nasa_tlx_005"
    );
});

test("buildRecordLabel omits block and sequence when not provided", () => {
    assert.equal(
        buildRecordLabel({
            participantCode: "C001",
            sessionCode: "C001-171234",
            dataset: "demographics"
        }),
        "C001_C001-171234_demographics"
    );
});
