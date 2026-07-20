// Pure helper for the admin console: shape + validate a manual-measurement insert
// row. No DOM, no network, no Vite env - so it is unit-testable on its own.
export function buildMeasurementPayload(form) {
    const code = String(form.participantCode || "").trim();
    if (!code) return { error: "Candidate (participant code) is required." };
    const type = form.type === "ecg" ? "ecg" : (form.type === "physical" ? "physical" : null);
    if (!type) return { error: "Choose a measurement type." };

    const num = (v) => {
        if (v === "" || v == null) return null;
        const n = Number(v);
        return Number.isFinite(n) ? n : null;
    };
    const notes = form.notes ? String(form.notes).trim() : null;
    const sessionId = form.sessionId ? String(form.sessionId).trim() : null;
    // Which task block this reading corresponds to (1-3), or null for a whole-session
    // reading. Needed to compare an external device's reading (e.g. a lab ECG
    // machine) against that same block's task performance and KSS/Borg/NASA-TLX.
    let blockNumber = null;
    if (form.blockNumber !== undefined && form.blockNumber !== null && form.blockNumber !== "") {
        const n = Number(form.blockNumber);
        if (!Number.isInteger(n) || n < 1 || n > 3) return { error: "Block must be 1, 2, or 3." };
        blockNumber = n;
    }
    const row = { participant_code: code, session_id: sessionId, block_number: blockNumber, measurement_type: type, source: "manual", notes, data: {} };

    if (type === "ecg") {
        row.heart_rate_bpm = num(form.heartRate);
        row.hrv_ms = num(form.hrv);
        if (row.heart_rate_bpm == null && row.hrv_ms == null && !notes) {
            return { error: "Enter at least a heart rate, HRV, or a note." };
        }
    } else {
        row.value = num(form.value);
        row.unit = form.unit ? String(form.unit).trim() : null;
        if (row.value == null && !notes) {
            return { error: "Enter a value or a note." };
        }
    }
    return { row };
}
