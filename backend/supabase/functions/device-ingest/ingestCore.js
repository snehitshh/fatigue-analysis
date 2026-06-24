// Pure validation + row shaping for the device-ingest edge function.
// No Deno/network here so it is unit-testable in Node and reused by index.ts.
// Returns { row } on success, or { status, error } on a bad request.
export function buildIngestRow(body) {
    if (!body || typeof body !== "object") return { status: 400, error: "Invalid JSON body." };

    const code = String(body.participant_code || "").trim();
    if (!code) return { status: 400, error: "participant_code is required." };

    const type = body.measurement_type ? String(body.measurement_type) : "ecg";
    const num = (v) => {
        if (v == null || v === "") return null;
        const n = Number(v);
        return Number.isFinite(n) ? n : null;
    };

    const data = (body.data && typeof body.data === "object") ? body.data : {};
    const row = {
        participant_code: code,
        measurement_type: type,
        source: "raspberry_pi",
        heart_rate_bpm: num(body.heart_rate_bpm),
        hrv_ms: num(body.hrv_ms),
        value: num(body.value),
        unit: body.unit ? String(body.unit) : null,
        notes: body.notes ? String(body.notes) : null,
        data
    };

    const hasAny = row.heart_rate_bpm != null || row.hrv_ms != null ||
        row.value != null || Object.keys(data).length > 0;
    if (!hasAny) return { status: 400, error: "No measurement values provided." };

    return { row };
}
