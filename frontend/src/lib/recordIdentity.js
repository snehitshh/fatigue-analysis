export function sanitizeIdentifier(value) {
    const sanitized = String(value || "")
        .trim()
        .replace(/[^a-zA-Z0-9_-]+/g, "_")
        .replace(/_+/g, "_")
        .replace(/^_+|_+$/g, "");

    return sanitized || "unknown";
}

export function buildRecordLabel({
    participantCode,
    sessionCode,
    blockNumber = null,
    dataset,
    sequenceNumber = null
}) {
    const parts = [
        sanitizeIdentifier(participantCode),
        sanitizeIdentifier(sessionCode)
    ];

    if (blockNumber !== null && blockNumber !== undefined) {
        parts.push(`block_${String(blockNumber).padStart(2, "0")}`);
    }

    parts.push(sanitizeIdentifier(dataset).toLowerCase());

    if (sequenceNumber !== null && sequenceNumber !== undefined) {
        parts.push(String(sequenceNumber).padStart(3, "0"));
    }

    return parts.join("_");
}

if (typeof window !== "undefined") {
    window.fatigueRecordIdentity = {
        sanitizeIdentifier,
        buildRecordLabel
    };
}
