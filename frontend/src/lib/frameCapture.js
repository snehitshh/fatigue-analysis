// Optional camera snapshot capture (Phase 3) - OPT-IN, budget-conscious.
//
// When the participant has enabled the camera AND consented to photo capture,
// this grabs a low-resolution JPEG from the existing attention-tracker video
// stream every few seconds and uploads it to a PRIVATE Supabase Storage bucket
// ('session-frames'), indexing each path in public.session_frames. Frames are
// readable only by an admin. It never opens a second camera handle, and any
// failure is swallowed so it can never disrupt the test.
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
        const video = getVideoElement();
        if (!video || !video.videoWidth) return; // camera not ready / stopped
        if (!canvas) canvas = document.createElement("canvas");
        const scale = FRAME_WIDTH / video.videoWidth;
        canvas.width = FRAME_WIDTH;
        canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
        const ctx = canvas.getContext("2d");
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        const blob = await new Promise((res) => canvas.toBlob(res, "image/jpeg", QUALITY));
        if (!blob) return;

        const block = (cfg.getBlock && cfg.getBlock()) || 0;
        const path = `${cfg.sessionId}/${block}/${Date.now()}.jpg`;
        const up = await supabase.storage.from("session-frames")
            .upload(path, blob, { contentType: "image/jpeg", upsert: false });
        if (up.error) return;

        await supabase.from("session_frames").insert({
            session_id: cfg.sessionId,
            participant_code: cfg.participantCode || null,
            block_number: block || null,
            storage_path: path
        });
    } catch (e) {
        /* best-effort: never interrupt the experiment */
    }
}

if (typeof window !== "undefined") {
    window.fatigueFrameCapture = { startFrameCapture, stopFrameCapture, isCapturing };
}
