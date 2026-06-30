import test from "node:test";
import assert from "node:assert/strict";
import { buildStudyConfig, studyConfigIssues } from "../frontend/src/lib/studyConfig.js";

test("study configuration reports every missing participant-facing field", () => {
    const config = buildStudyConfig({});
    assert.deepEqual(studyConfigIssues(config), ["institution", "study contact", "retention period", "protocol ID", "physical protocol name", "physical protocol instructions"]);
});

test("study configuration accepts complete non-secret metadata", () => {
    const config = buildStudyConfig({
        VITE_STUDY_INSTITUTION: "Example University",
        VITE_STUDY_CONTACT: "research@example.org",
        VITE_STUDY_RETENTION: "Five years",
        VITE_STUDY_PROTOCOL_ID: "FATIGUE-V3",
        VITE_PHYSICAL_PROTOCOL_NAME: "Approved seated movement",
        VITE_PHYSICAL_PROTOCOL_INSTRUCTIONS: "Follow the researcher-approved cadence."
    });
    assert.deepEqual(studyConfigIssues(config), []);
    assert.equal(config.contact, "research@example.org");
});
