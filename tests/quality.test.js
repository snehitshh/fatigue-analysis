import test from "node:test";
import assert from "node:assert/strict";
import { qualityFlag } from "../frontend/src/admin/quality.js";

test("camera attention is exploratory and does not automatically reject a session", () => {
    const flag = qualityFlag({ completed: true, total_app_switches: 0, avg_attentive_pct: 20 });
    assert.equal(flag.level, "good");
});
