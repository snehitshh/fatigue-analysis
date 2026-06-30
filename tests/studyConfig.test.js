import test from "node:test";
import assert from "node:assert/strict";
import { buildStudyConfig, studyConfigIssues } from "../frontend/src/lib/studyConfig.js";

test("only institution and contact are required to start collection", () => {
    const config = buildStudyConfig({});
    assert.deepEqual(studyConfigIssues(config), ["institution", "study contact"]);
});

test("optional consent fields fall back to a clear placeholder, not blank", () => {
    const config = buildStudyConfig({});
    assert.equal(config.protocolId, "To be confirmed");
    assert.equal(config.retention, "To be confirmed (per the approved protocol)");
    assert.ok(config.physicalProtocolName.length > 0);
    assert.ok(config.physicalProtocolInstructions.length > 0);
});

test("providing institution and contact clears all issues", () => {
    const config = buildStudyConfig({
        VITE_STUDY_INSTITUTION: "Example University",
        VITE_STUDY_CONTACT: "research@example.org"
    });
    assert.deepEqual(studyConfigIssues(config), []);
    assert.equal(config.contact, "research@example.org");
});
