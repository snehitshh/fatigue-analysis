// Durable write-queue (offline / flaky-network protection).
//
// When a Supabase insert fails because of the network, the row is parked here in
// localStorage and retried later (on reconnect / next load). The trial tables have
// unique constraints, so a retry of a row that actually did land just conflicts and
// is treated as already-saved - delivery is effectively exactly-once.
//
// This module is pure storage logic (no network), unit-tested separately.
const KEY = "fatigueWriteQueue";
const DEAD_KEY = "fatigueWriteFailures";
const MAX = 1000;

export function readQueue(storage) {
    try {
        const raw = storage.getItem(KEY);
        const q = raw ? JSON.parse(raw) : [];
        return Array.isArray(q) ? q : [];
    } catch (e) {
        return [];
    }
}

export function writeQueue(storage, items) {
    try {
        storage.setItem(KEY, JSON.stringify(items.slice(-MAX)));
    } catch (e) {
        // storage full / unavailable - best effort
    }
}

export function enqueue(storage, table, row) {
    const q = readQueue(storage);
    q.push({ table, row, ts: Date.now() });
    writeQueue(storage, q);
}

export function readDeadLetters(storage) {
    try {
        const raw = storage.getItem(DEAD_KEY);
        const rows = raw ? JSON.parse(raw) : [];
        return Array.isArray(rows) ? rows : [];
    } catch (e) {
        return [];
    }
}

export function enqueueDeadLetter(storage, item, error) {
    const rows = readDeadLetters(storage);
    rows.push({
        ...item,
        error: { code: error?.code || null, message: error?.message || String(error || "Unknown error") },
        failedAt: Date.now()
    });
    try { storage.setItem(DEAD_KEY, JSON.stringify(rows.slice(-MAX))); } catch (e) { /* best effort */ }
}

export function queueSummary(storage) {
    return { pending: readQueue(storage).length, failed: readDeadLetters(storage).length };
}

// Decide what to do with an attempted (re)insert result.
//   "done"  -> succeeded, or a duplicate (already saved) -> drop from queue
//   "keep"  -> looks like a transient/network error -> retry later
//   "drop"  -> a permanent data error -> give up (and the caller should log it)
export function classifyResult(error) {
    if (!error) return "done";
    if (error.code === "23505") return "done";       // unique_violation = already saved
    if (!error.code) return "keep";                  // no PG code -> transport/network
    return "drop";                                   // a real data error won't fix itself
}
