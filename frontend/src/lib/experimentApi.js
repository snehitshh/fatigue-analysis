import "./recordIdentity.js";
import { isSupabaseConfigured, supabase } from "./supabaseClient.js";
import { enqueue, enqueueDeadLetter, queueSummary, readQueue, writeQueue, classifyResult } from "./writeQueue.js";

const hasLocalStorage = typeof window !== "undefined" && window.localStorage;

// Retry any rows parked by a failed insert. Safe to call often; idempotent because
// the trial tables have unique constraints (a duplicate retry is treated as done).
let flushing = false;
function publishWriteStatus() {
    if (!hasLocalStorage || typeof window === "undefined") return;
    window.dispatchEvent(new CustomEvent("fatigue:write-status", { detail: queueSummary(window.localStorage) }));
}

async function flushWriteQueue() {
    if (!isSupabaseConfigured || flushing || !hasLocalStorage) return;
    flushing = true;
    try {
        const queue = readQueue(window.localStorage);
        if (!queue.length) return;
        const remaining = [];
        for (const item of queue) {
            let error = null;
            try {
                const res = await supabase.from(item.table).insert(item.row);
                error = res.error;
            } catch (e) {
                error = { message: String(e && e.message || e) }; // no code -> transient
            }
            const verdict = classifyResult(error);
            if (verdict === "keep") remaining.push(item);
            else if (verdict === "drop") {
                enqueueDeadLetter(window.localStorage, item, error);
                console.warn(`[queue] retained failed ${item.table} write for review:`, error && error.message);
            }
        }
        writeQueue(window.localStorage, remaining);
    } finally {
        flushing = false;
        publishWriteStatus();
    }
}

if (typeof window !== "undefined") {
    window.addEventListener("online", flushWriteQueue);
    flushWriteQueue(); // drain anything left from a previous (interrupted) session
}

function disabledResult() {
    return {
        data: null,
        error: null,
        disabled: true,
        message: "Supabase is not configured."
    };
}

function createClientId() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
        return window.crypto.randomUUID();
    }

    return "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (char) => {
        const random = window.crypto.getRandomValues(new Uint8Array(1))[0];
        return (Number(char) ^ (random & (15 >> (Number(char) / 4)))).toString(16);
    });
}

async function insertRow(tableName, payload, options = {}) {
    if (!isSupabaseConfigured) return disabledResult();

    const row = {
        id: payload.id || createClientId(),
        ...payload
    };

    let error = null;
    try {
        const res = await supabase.from(tableName).insert(row);
        error = res.error;
    } catch (e) {
        error = { message: String(e && e.message || e) }; // transport failure -> no code
    }

    const verdict = classifyResult(error);
    if (verdict === "keep" && hasLocalStorage) {
        // Network failure: park the row and report success so the study keeps going;
        // it will be retried on reconnect / next load.
        enqueue(window.localStorage, tableName, row);
        publishWriteStatus();
        return { data: row, error: null, queued: true, disabled: false };
    }
    if (verdict === "done") {
        flushWriteQueue(); // opportunistically drain the backlog on a good connection
        return { data: row, error: null, disabled: false };
    }
    if (hasLocalStorage && options.retainPermanent !== false) {
        enqueueDeadLetter(window.localStorage, { table: tableName, row }, error);
        publishWriteStatus();
    }
    return { data: null, error, disabled: false };
}

async function insertRowWithColumnFallback(tableName, payload, optionalColumns) {
    const first = await insertRow(tableName, payload, { retainPermanent: false });
    if (!first.error || !['42703', 'PGRST204'].includes(first.error.code)) return first;
    const fallback = { ...payload };
    optionalColumns.forEach((column) => delete fallback[column]);
    return insertRow(tableName, fallback);
}

// Atomically claim a researcher-provisioned participant code. Returns the RPC's
// JSON result: { ok:true, slot_id } or { ok:false, reason:'taken'|'unknown' }.
// When Supabase is not configured, signals disabled so the app keeps free-text entry.
async function claimParticipantCode(code) {
    if (!isSupabaseConfigured) return { data: { ok: true, disabled: true }, error: null };
    const { data, error } = await supabase.rpc("claim_participant_code", { p_code: code });
    return { data, error };
}

// Self-registration: auto-issue a unique participant code, de-duplicated by
// email. Returns { code, already_registered }. Contact details are stored in a
// separate, admin-only table; the research tables only ever see the code.
async function registerParticipant(email, fullName, phone) {
    if (!isSupabaseConfigured) return { data: { code: null, disabled: true }, error: null };
    const { data, error } = await supabase.rpc("register_participant", {
        p_email: email, p_full_name: fullName || null, p_phone: phone || null
    });
    return { data, error };
}

// Mark a session completed/abandoned (anon-callable RPC) so status/completed_at
// reflect reality - lets analysts filter for genuinely finished sessions.
async function finalizeSession(sessionId, status = "completed") {
    if (!isSupabaseConfigured || !sessionId) return { disabled: true };
    const { error } = await supabase.rpc("finalize_session", { p_session_id: sessionId, p_status: status });
    if (error) console.warn("[finalizeSession]", error.message);
    return { error };
}

async function finalizeScrollSession(id, totals) {
    if (!isSupabaseConfigured || !id) return { disabled: true };
    const { error } = await supabase.rpc("finalize_scroll_session", { p_id: id, p: totals });
    if (error) console.warn("[finalizeScrollSession]", error.message);
    return { error };
}

// Phone-usage study: finalize totals + end rating on the session (anon-callable RPC).
async function finalizePhoneUsageSession(id, totals) {
    if (!isSupabaseConfigured || !id) return { disabled: true };
    const { error } = await supabase.rpc("finalize_phone_usage_session", { p_id: id, p: totals });
    if (error) console.warn("[finalizePhoneUsageSession]", error.message);
    return { error };
}

async function getActiveStudy(slug = "fatigue-analysis") {
    if (!isSupabaseConfigured) return disabledResult();

    const { data, error } = await supabase
        .from("studies")
        .select("id,slug,name,protocol_version,is_active")
        .eq("slug", slug)
        .eq("is_active", true)
        .single();

    return { data, error, disabled: false };
}

export const experimentApi = {
    isSupabaseConfigured,
    getActiveStudy,
    claimParticipantCode,
    registerParticipant,
    finalizeSession,
    finalizeScrollSession,
    createParticipant: (payload) => insertRow("participants", payload),
    createSession: (payload) => insertRowWithColumnFallback("sessions", payload, ["randomization_seed", "protocol_config", "client_build", "participant_slot_id"]),
    createExperimentBlock: (payload) => insertRow("experiment_blocks", payload),
    recordSessionEvent: (payload) => insertRow("session_events", payload),
    saveFittsTrial: (payload) => insertRow("fitts_trials", payload),
    saveTypingTrial: (payload) => insertRow("typing_trials", payload),
    saveNasaTlxResponse: (payload) => insertRow("nasa_tlx_responses", payload),
    saveCognitiveTrial: (payload) => insertRow("cognitive_trials", payload),
    savePhysicalFatigueLog: (payload) => insertRow("physical_fatigue_logs", payload),
    saveEngagementSummary: (payload) => insertRow("engagement_summary", payload),
    saveFatigueRating: (payload) => insertRow("fatigue_ratings", payload, { retainPermanent: false }),
    saveBorgRating: (payload) => insertRow("borg_ratings", payload, { retainPermanent: false }),
    saveScrollSession: (payload) => insertRow("scroll_sessions", payload),
    saveScrollInterval: (payload) => insertRow("scroll_intervals", payload),
    savePhoneUsageSession: (payload) => insertRow("phone_usage_sessions", payload),
    saveAppUsageInterval: (payload) => insertRow("app_usage_intervals", payload),
    finalizePhoneUsageSession
};

window.fatigueExperimentApi = experimentApi;
publishWriteStatus();
