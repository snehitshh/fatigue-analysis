import "./recordIdentity.js";
import { isSupabaseConfigured, supabase } from "./supabaseClient.js";

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

async function insertRow(tableName, payload) {
    if (!isSupabaseConfigured) return disabledResult();

    const row = {
        id: payload.id || createClientId(),
        ...payload
    };

    const { error } = await supabase
        .from(tableName)
        .insert(row);

    return { data: error ? null : row, error, disabled: false };
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
    createParticipant: (payload) => insertRow("participants", payload),
    createSession: (payload) => insertRow("sessions", payload),
    createExperimentBlock: (payload) => insertRow("experiment_blocks", payload),
    recordSessionEvent: (payload) => insertRow("session_events", payload),
    saveFittsTrial: (payload) => insertRow("fitts_trials", payload),
    saveTypingTrial: (payload) => insertRow("typing_trials", payload),
    saveNasaTlxResponse: (payload) => insertRow("nasa_tlx_responses", payload),
    saveCognitiveTrial: (payload) => insertRow("cognitive_trials", payload),
    savePhysicalFatigueLog: (payload) => insertRow("physical_fatigue_logs", payload)
};

window.fatigueExperimentApi = experimentApi;


