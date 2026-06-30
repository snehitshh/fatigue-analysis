// Camera attention tracker (Stage 2) - OPT-IN.
//
// Estimates whether the participant is looking at the screen, using MediaPipe
// FaceLandmarker entirely on-device. It produces ONLY a boolean per sample
// (looking / not looking) which it pushes to window.fatigueEngagement; it never
// stores, uploads, or exposes any image or video frame.
//
// IMPORTANT: the live camera + ML path below cannot be unit-tested headlessly - it
// must be verified on a real device/phone, and the head-pose thresholds will likely
// need tuning there. The pure helpers (headPoseFromMatrix, isLookingAtScreen) are
// exported and unit-tested separately.

// Tolerances (degrees) for "facing the screen". Tune on-device.
const DEFAULT_LIMITS = { yaw: 22, pitch: 20 };
const SAMPLE_INTERVAL_MS = 350; // ~3 fps - low enough to spare battery / main thread

// MediaPipe assets. The wasm version MUST match the installed @mediapipe/tasks-vision.
const MP_VERSION = '0.10.20';
const WASM_URL = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}/wasm`;
const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

let landmarker = null;
let stream = null;
let video = null;
let rafId = null;
let running = false;
let lastSampleTs = 0;
let lastPose = null; // most recent exploratory {yaw, pitch, roll} sample

// Returns the latest head pose (or null). Used by the 4-dot calibration to record
// where the participant is looking when they tap each corner.
export function getLastPose() {
    return lastPose;
}

// --- Pure helpers (unit-tested) -------------------------------------------------

// Extract head yaw/pitch/roll (degrees) from a column-major 4x4 facial
// transformation matrix (16 floats) as returned by FaceLandmarker.
export function headPoseFromMatrix(d) {
    if (!d || d.length < 11) return { yaw: 0, pitch: 0, roll: 0 };
    const rad = 180 / Math.PI;
    // Column-major: element(row r, col c) = d[c*4 + r]. Rotation submatrix indices:
    // r20=d[2], r21=d[6], r22=d[10], r10=d[1], r00=d[0]
    const pitch = Math.atan2(d[6], d[10]) * rad;
    const yaw = Math.atan2(-d[2], Math.sqrt(d[6] * d[6] + d[10] * d[10])) * rad;
    const roll = Math.atan2(d[1], d[0]) * rad;
    return { yaw, pitch, roll };
}

export function isLookingAtScreen(pose, limits) {
    const lim = limits || DEFAULT_LIMITS;
    if (!pose) return false;
    return Math.abs(pose.yaw) <= lim.yaw && Math.abs(pose.pitch) <= lim.pitch;
}

// --- Live camera + ML (device-tested) ------------------------------------------

export function isAttentionActive() {
    return running;
}

// Must be called from a user gesture (a button click) so getUserMedia is allowed.
export async function enableAttention() {
    if (running) return true;

    stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 320 }, height: { ideal: 240 } },
        audio: false
    });

    video = document.createElement('video');
    video.setAttribute('playsinline', '');
    video.muted = true;
    video.srcObject = stream;
    await video.play();

    // Loaded only when the participant opts in (code-split chunk).
    const vision = await import('@mediapipe/tasks-vision');
    const fileset = await vision.FilesetResolver.forVisionTasks(WASM_URL);
    landmarker = await vision.FaceLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODEL_URL, delegate: 'GPU' },
        runningMode: 'VIDEO',
        numFaces: 1,
        outputFacialTransformationMatrixes: true
    });

    running = true;
    lastSampleTs = 0;
    loop();
    return true;
}

export function disableAttention() {
    running = false;
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
    if (stream) { stream.getTracks().forEach((t) => t.stop()); stream = null; }
    if (landmarker) { try { landmarker.close(); } catch (e) { /* ignore */ } landmarker = null; }
    video = null;
}

function loop() {
    if (!running) return;
    rafId = requestAnimationFrame(loop);

    const ts = performance.now();
    if (ts - lastSampleTs < SAMPLE_INTERVAL_MS) return;
    lastSampleTs = ts;

    let attentive = false;
    try {
        const res = landmarker.detectForVideo(video, ts);
        const faceDetected = res && res.faceLandmarks && res.faceLandmarks.length > 0;
        if (faceDetected) {
            const mtx = res.facialTransformationMatrixes && res.facialTransformationMatrixes[0];
            if (mtx && mtx.data) {
                lastPose = headPoseFromMatrix(mtx.data);
                attentive = isLookingAtScreen(lastPose);
            } else {
                attentive = true; // face present but no pose -> assume looking
            }
        }
    } catch (e) {
        return; // skip this frame on inference error
    }

    if (window.fatigueEngagement && typeof window.fatigueEngagement.recordAttentionSample === 'function') {
        window.fatigueEngagement.recordAttentionSample(attentive);
    }
}

if (typeof window !== 'undefined') {
    window.fatigueAttention = { enableAttention, disableAttention, isAttentionActive, getLastPose };
}
