// Pure helper: build a batch of participant codes (e.g. P001..P050). No DOM/network.
export function buildSlotCodes({ prefix = "", start = 1, count = 0, pad = 3 }) {
    const s = Number(start);
    const c = Number(count);
    const p = Number(pad);
    if (!Number.isFinite(c) || c < 1 || c > 1000) return { error: "Count must be between 1 and 1000." };
    if (!Number.isFinite(s) || s < 0) return { error: "Start must be 0 or more." };
    const width = Number.isFinite(p) ? Math.max(0, Math.min(10, p)) : 0;
    const codes = [];
    for (let i = 0; i < c; i++) {
        codes.push(`${prefix}${String(s + i).padStart(width, "0")}`);
    }
    return { codes };
}
