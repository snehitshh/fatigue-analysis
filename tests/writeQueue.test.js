import test from "node:test";
import assert from "node:assert/strict";
import { enqueueDeadLetter, queueSummary, readDeadLetters } from "../frontend/src/lib/writeQueue.js";

function memoryStorage() {
    const values = new Map();
    return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
}

test("permanent write failures remain visible as dead letters", () => {
    const storage = memoryStorage();
    enqueueDeadLetter(storage, { table: "typing_trials", row: { id: "1" } }, { code: "23514", message: "bad row" });
    assert.equal(readDeadLetters(storage).length, 1);
    assert.deepEqual(queueSummary(storage), { pending: 0, failed: 1 });
});
