// Convert an array of row objects to a CSV string (pure - unit-tested).
// Union of all keys becomes the header; values are escaped per RFC 4180; objects
// (jsonb columns) are serialized to JSON; null/undefined become empty cells.
export function toCsv(rows) {
    if (!rows || !rows.length) return "";
    const cols = [];
    const seen = new Set();
    for (const r of rows) {
        for (const k of Object.keys(r)) {
            if (!seen.has(k)) { seen.add(k); cols.push(k); }
        }
    }
    const cell = (v) => {
        if (v == null) return "";
        let s = (typeof v === "object") ? JSON.stringify(v) : String(v);
        if (/[",\n\r]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
        return s;
    };
    const lines = [cols.join(",")];
    for (const r of rows) lines.push(cols.map((c) => cell(r[c])).join(","));
    return lines.join("\r\n");
}
