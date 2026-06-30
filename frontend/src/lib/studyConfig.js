const clean = (value) => String(value || "").trim();

export function buildStudyConfig(env = {}) {
    return Object.freeze({
        institution: clean(env.VITE_STUDY_INSTITUTION),
        contact: clean(env.VITE_STUDY_CONTACT),
        retention: clean(env.VITE_STUDY_RETENTION),
        protocolId: clean(env.VITE_STUDY_PROTOCOL_ID),
        physicalProtocolName: clean(env.VITE_PHYSICAL_PROTOCOL_NAME),
        physicalProtocolInstructions: clean(env.VITE_PHYSICAL_PROTOCOL_INSTRUCTIONS),
        dataUse: clean(env.VITE_STUDY_DATA_USE) || "Research analysis and development of fatigue measurement methods"
    });
}

export function studyConfigIssues(config) {
    const issues = [];
    if (!config.institution) issues.push("institution");
    if (!config.contact) issues.push("study contact");
    if (!config.retention) issues.push("retention period");
    if (!config.protocolId) issues.push("protocol ID");
    if (!config.physicalProtocolName) issues.push("physical protocol name");
    if (!config.physicalProtocolInstructions) issues.push("physical protocol instructions");
    return issues;
}

export const studyConfig = buildStudyConfig(import.meta.env || {});

if (typeof window !== "undefined") {
    window.fatigueStudyConfig = studyConfig;
    window.fatigueStudyConfigIssues = studyConfigIssues(studyConfig);
}
