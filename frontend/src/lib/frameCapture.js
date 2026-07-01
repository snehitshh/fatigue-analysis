// Optional camera snapshot capture (Phase 3) - OPT-IN, budget-conscious.
//
// When the participant has enabled the camera AND consented to photo capture,
// this saves low-resolution JPEGs to a PRIVATE Supabase Storage bucket
// ('session-frames') and indexes each path in public.session_frames. Two kinds:
//   - 4-dot calibration ground-truth (one photo per corner, labelled), and
//   - periodic photos during the test (~one every 15s).
// Frames are readable only by an admin. It reuses the attention-tracker video
// stream (no second camera handle), and every failure is swallowed so it can
// never disrupt the test.
import { isSupabaseConfigured, supabase } from "./supabaseClient.js";
import { getVideoElement } from "./attentionTracker.js";

const FRAME_WIDTH = 240;       // downscaled width in px (~15-25 KB per JPEG)
const QUALITY = 0.5;           // JPEG quality
const DEFAULT_INTERVAL_MS = 15000;

let timer = null;
let canvas = null;
let cfg = null;

export function isCapturing() {
    return Boolean(timer);
}

// Grab one downscaled JPEG from the live camera; null if the camera isn't ready.
export async function grabFrameBlob() {
    const video = getVideoElement();
    if (!video || !video.videoWidth) return null;
    if (!canvas) canvas = document.createElement("canvas");
    const scale = FRAME_WIDTH / video.videoWidth;
    canvas.width = FRAME_WIDTH;
    canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
    canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);
    return await new Promise((res) => canvas.toBlob(res, "image/jpeg", QUALITY));
}

// Upload a blob to the private bucket and index it.
// opts: { label, block, participantCode } - label becomes the path segment.
export async function uploadFrameBlob(sessionId, blob, opts = {}) {
    if (!isSupabaseConfigured || !sessionId || !blob) return { error: "skipped" };
    try {
        const seg = opts.label || (opts.block != null ? `block${opts.block}` : "misc");
        const path = `${sessionId}/${seg}/${Date.now()}.jpg`;
        const up = await supabase.storage.from("session-frames")
            .upload(path, blob, { contentType: "image/jpeg", upsert: false });
        if (up.error) return { error: up.error };
        await supabase.from("session_frames").insert({
            session_id: sessionId,
            participant_code: opts.participantCode || null,
            block_number: (opts.block != null ? opts.block : null),
            storage_path: path
        });
        return { error: null, path };
    } catch (e) {
        return { error: e };
    }
}

export function startFrameCapture(options = {}) {
    if (!isSupabaseConfigured || timer || !options.sessionId) return;
    cfg = options;
    const interval = options.intervalMs || DEFAULT_INTERVAL_MS;
    timer = setInterval(captureOnce, interval);
}

export function stopFrameCapture() {
    if (timer) { clearInterval(timer); timer = null; }
    cfg = null;
}

async function captureOnce() {
    try {
        const blob = await grabFrameBlob();
        if (!blob) return;
        const block = (cfg.getBlock && cfg.getBlock()) || 0;
        await uploadFrameBlob(cfg.sessionId, blob, { label: `block${block}`, block, participantCode: cfg.participantCode });
    } catch (e) {
        /* best-effort: never interrupt the experiment */
    }
}

if (typeof window !== "undefined") {
    window.fatigueFrameCapture = { startFrameCapture, stopFrameCapture, isCapturing, grabFrameBlob, uploadFrameBlob };
}
