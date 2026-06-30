// 4-dot camera/screen calibration helpers (pure - unit-testable).
//
// Four dots are shown one at a time in clockwise order (top-left, top-right,
// bottom-right, bottom-left). The participant taps each. The taps give screen
// geometry + tap precision; if the camera is on, the head pose captured at each
// corner captures exploratory device/head-pose context. The current attention
// classifier does not treat this as validated eye-gaze calibration.

// Clockwise targets inset from the edges by `margin` (fraction of the viewport).
export function calibrationTargets(w, h, margin = 0.12) {
    const mx = Math.round(w * margin);
    const my = Math.round(h * margin);
    return [
        { id: "tl", x: mx, y: my },
        { id: "tr", x: w - mx, y: my },
        { id: "br", x: w - mx, y: h - my },
        { id: "bl", x: mx, y: h - my }
    ];
}

// Mean distance (px) between each target and the participant's tap - lower is more
// precise. Returns null if the counts don't line up.
export function tapAccuracyPx(targets, taps) {
    if (!targets || !taps || taps.length !== targets.length || targets.length === 0) return null;
    let sum = 0;
    for (let i = 0; i < targets.length; i++) {
        const dx = (taps[i].x - targets[i].x);
        const dy = (taps[i].y - targets[i].y);
        sum += Math.sqrt(dx * dx + dy * dy);
    }
    return Math.round((sum / targets.length) * 100) / 100;
}

// Derive an ADAPTIVE attention tolerance from the head poses recorded while the
// participant looked at the four screen corners. The largest yaw/pitch they
// rotated to reach a corner is, by definition, still "looking at the screen", so
// the tolerance is that maximum plus a margin. This adapts to the person's
// distance and screen size instead of using one fixed threshold. Clamped to sane
// bounds; falls back to `fallback` when there aren't enough poses.
export function limitsFromCornerPoses(cornerPoses, fallback = { yaw: 26, pitch: 22 }) {
    if (!cornerPoses) return { ...fallback };
    const vals = Object.values(cornerPoses).filter(Boolean);
    if (vals.length < 2) return { ...fallback };
    let maxYaw = 0, maxPitch = 0;
    for (const p of vals) {
        if (typeof p.yaw === "number") maxYaw = Math.max(maxYaw, Math.abs(p.yaw));
        if (typeof p.pitch === "number") maxPitch = Math.max(maxPitch, Math.abs(p.pitch));
    }
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
    return {
        yaw: clamp(Math.round(maxYaw + 8), 16, 45),
        pitch: clamp(Math.round(maxPitch + 7), 12, 36)
    };
}

// Also exposed on window so the classic-script app (main.js) can use it.
function _attach() {
    if (typeof window !== "undefined") {
        window.fatigueCalibration = { calibrationTargets, tapAccuracyPx, buildCalibrationProfile, limitsFromCornerPoses };
    }
}

export function buildCalibrationProfile({ viewport, targets, taps, poses }) {
    const cornerPoses = {};
    if (poses && targets) {
        for (let i = 0; i < targets.length; i++) {
            if (poses[i]) cornerPoses[targets[i].id] = poses[i];
        }
    }
    return {
        viewport: viewport || null,
        devicePixelRatio: (typeof window !== "undefined" && window.devicePixelRatio) || 1,
        tapAccuracyPx: tapAccuracyPx(targets, taps),
        cornerCount: targets ? targets.length : 0,
        cornerPoses: Object.keys(cornerPoses).length ? cornerPoses : null,
        cameraCalibrated: Boolean(poses && Object.keys(cornerPoses).length === (targets ? targets.length : 0)),
        capturedAt: new Date().toISOString()
    };
}

_attach();
