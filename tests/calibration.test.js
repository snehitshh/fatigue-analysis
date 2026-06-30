import test from "node:test";
import assert from "node:assert/strict";
import { limitsFromCornerPoses } from "../frontend/src/lib/calibration.js";

test("adaptive limits fall back when there are too few poses", () => {
    assert.deepEqual(limitsFromCornerPoses(null), { yaw: 26, pitch: 22 });
    assert.deepEqual(limitsFromCornerPoses({ tl: { yaw: 5, pitch: 5 } }), { yaw: 26, pitch: 22 });
});

test("adaptive limits track the widest corner rotation plus a margin", () => {
    const limits = limitsFromCornerPoses({
        tl: { yaw: -18, pitch: -10 }, tr: { yaw: 20, pitch: -9 },
        br: { yaw: 19, pitch: 14 }, bl: { yaw: -17, pitch: 13 }
    });
    assert.equal(limits.yaw, 28);   // max|yaw| 20 + 8
    assert.equal(limits.pitch, 21); // max|pitch| 14 + 7
});

test("adaptive limits are clamped to sane bounds", () => {
    const wide = limitsFromCornerPoses({ a: { yaw: 80, pitch: 80 }, b: { yaw: -80, pitch: -80 } });
    assert.deepEqual(wide, { yaw: 45, pitch: 36 });
    const narrow = limitsFromCornerPoses({ a: { yaw: 1, pitch: 1 }, b: { yaw: -1, pitch: -1 } });
    assert.deepEqual(narrow, { yaw: 16, pitch: 12 });
});
