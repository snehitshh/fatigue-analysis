const clean = (value) => String(value || "").trim();

// "To be confirmed" stands in for consent details that are not finalised yet
// (e.g. an IRB protocol number still being assigned). Only the institution and
// the study contact are required before collection; the rest fall back to a
// clear placeholder so the consent screen still reads professionally.
const TBC = "To be confirmed";

export function buildStudyConfig(env = {}) {
    return Object.freeze({
        institution: clean(env.VITE_STUDY_INSTITUTION),
        contact: clean(env.VITE_STUDY_CONTACT),
        retention: clean(env.VITE_STUDY_RETENTION) || `${TBC} (per the approved protocol)`,
        protocolId: clean(env.VITE_STUDY_PROTOCOL_ID) || TBC,
        physicalProtocolName: clean(env.VITE_PHYSICAL_PROTOCOL_NAME) || "Researcher-administered movement protocol",
        physicalProtocolInstructions: clean(env.VITE_PHYSICAL_PROTOCOL_INSTRUCTIONS) || "Follow the researcher-approved movement instructions; stop if you feel pain, dizziness, or are unwell.",
        dataUse: clean(env.VITE_STUDY_DATA_USE) || "Research analysis and development of fatigue measurement methods"
    });
}

// Only the institution and a contact are mandatory before any data is collected.
// The remaining fields have safe placeholders and can be filled once the IRB /
// protocol details are finalised.
export function studyConfigIssues(config) {
    const issues = [];
    if (!config.institution) issues.push("institution");
    if (!config.contact) issues.push("study contact");
    return issues;
}

export const studyConfig = buildStudyConfig(import.meta.env || {});

if (typeof window !== "undefined") {
    window.fatigueStudyConfig = studyConfig;
    window.fatigueStudyConfigIssues = studyConfigIssues(studyConfig);
}
