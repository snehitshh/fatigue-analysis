// Global Configuration
const TOTAL_BLOCKS = 3;
const BREAK_DURATION = 120; // 2 minutes
const PHYSICAL_FATIGUE_DURATION = 720; // 12 minutes (synced with cognitive)

// Steps that are part of the actual test — these get a plain white background;
// every other (setup/landing/complete) screen shows the light-blue wave theme.
const TEST_STEPS = new Set(['kss-pre', 'fitts', 'typing', 'nasatlx', 'borg', 'cognitive', 'physical', 'safety', 'kss-post', 'break']);

let currentStep = 'demographics'; 
let currentBlock = 1;

// Stores the user's choices for the entire session
let sessionBaseTask = null; // 'fitts' or 'typing'
let sessionFatigueTrack = null; // 'cognitive' or 'physical'
let originalSessionBaseTask = null;
let originalSessionFatigueTrack = null;
let protocolSeed = null;
let kssRatings = [];

let sessionData = {
    demographics: {},
    blocks: [],
    startTime: null,
    endTime: null
};

// Captured before a participant row exists; merged into participant metadata at
// creation time and surfaced as session events once a session is available.
let consentData = null;
let safetyScreeningData = null;
let withdrawn = false;
let claimedSlotId = null;

const mainContent = document.getElementById('main-content');
const progressBar = document.getElementById('progress-bar');

const backendState = {
    studyId: null,
    participantId: null,
    sessionId: null,
    sessionCode: null,
    blockIds: {},
    participantPromise: null,
    sessionPromise: null,
    blockPromises: {}
};

function getBackendApi() {
    return window.fatigueExperimentApi || null;
}

function getResearchApi() {
    return window.fatigueResearch || {};
}

function isBackendEnabled() {
    const api = getBackendApi();
    return Boolean(api && api.isSupabaseConfigured);
}

function createBackendId() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
        return window.crypto.randomUUID();
    }

    return '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, (char) => {
        const random = window.crypto.getRandomValues(new Uint8Array(1))[0];
        return (Number(char) ^ (random & (15 >> (Number(char) / 4)))).toString(16);
    });
}

function toNullableInt(value) {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : null;
}

function toNullableNumber(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}

function getParticipantCode() {
    return String(sessionData.demographics.participantId || 'UNKNOWN').trim() || 'UNKNOWN';
}

function getSessionCode() {
    if (!backendState.sessionCode) {
        const safeParticipant = getParticipantCode().replace(/[^a-zA-Z0-9_-]/g, '_');
        backendState.sessionCode = `${safeParticipant}-${Date.now()}`;
    }

    return backendState.sessionCode;
}

function fallbackSanitizeIdentifier(value) {
    const sanitized = String(value || '')
        .trim()
        .replace(/[^a-zA-Z0-9_-]+/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_+|_+$/g, '');

    return sanitized || 'unknown';
}

function fallbackBuildRecordLabel({ participantCode, sessionCode, blockNumber = null, dataset, sequenceNumber = null }) {
    const parts = [
        fallbackSanitizeIdentifier(participantCode),
        fallbackSanitizeIdentifier(sessionCode)
    ];

    if (blockNumber !== null && blockNumber !== undefined) {
        parts.push(`block_${String(blockNumber).padStart(2, '0')}`);
    }

    parts.push(fallbackSanitizeIdentifier(dataset).toLowerCase());

    if (sequenceNumber !== null && sequenceNumber !== undefined) {
        parts.push(String(sequenceNumber).padStart(3, '0'));
    }

    return parts.join('_');
}

function getRecordIdentity(dataset, blockNumber = null, sequenceNumber = null) {
    const participantCode = getParticipantCode();
    const sessionCode = getSessionCode();
    const labelBuilder = window.fatigueRecordIdentity?.buildRecordLabel || fallbackBuildRecordLabel;

    return {
        participant_code: participantCode,
        session_code: sessionCode,
        record_label: labelBuilder({
            participantCode,
            sessionCode,
            blockNumber,
            dataset,
            sequenceNumber
        })
    };
}

function isDatabaseMode() {
    return isBackendEnabled();
}

function shouldDownloadCsvBackup() {
    return !isDatabaseMode();
}

function getOrientation() {
    const type = window.screen?.orientation?.type;
    if (type) return type.startsWith('portrait') ? 'portrait' : 'landscape';
    return window.innerHeight >= window.innerWidth ? 'portrait' : 'landscape';
}

function getDeviceType() {
    const coarse = window.matchMedia?.('(pointer: coarse)').matches;
    const minSide = Math.min(window.innerWidth, window.innerHeight);
    if (coarse && minSide < 600) return 'mobile';
    if (coarse) return 'tablet';
    return 'desktop';
}

function getInputMethod() {
    if (navigator.maxTouchPoints > 0 && window.matchMedia?.('(pointer: coarse)').matches) return 'touch';
    if (window.matchMedia?.('(pointer: fine)').matches) return 'mouse_or_trackpad';
    return 'unknown';
}

function getDeviceInfo() {
    return {
        userAgent: navigator.userAgent,
        language: navigator.language,
        platform: navigator.platform,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        screenWidth: window.screen?.width || null,
        screenHeight: window.screen?.height || null,
        devicePixelRatio: window.devicePixelRatio || 1,
        pointer: window.matchMedia?.('(pointer: coarse)').matches ? 'coarse' : 'fine',
        orientation: getOrientation(),
        deviceType: getDeviceType(),
        inputMethod: getInputMethod(),
        maxTouchPoints: navigator.maxTouchPoints || 0
    };
}

function logBackendError(context, error) {
    if (!error) return;
    console.warn(`[Supabase] ${context} failed:`, error.message || error);
}

async function ensureBackendStudy() {
    const api = getBackendApi();
    if (!api || !api.isSupabaseConfigured) return null;
    if (backendState.studyId) return backendState.studyId;

    const result = await api.getActiveStudy();
    if (result.error || !result.data) {
        logBackendError('getActiveStudy', result.error || new Error('No active study found'));
        return null;
    }

    backendState.studyId = result.data.id;
    return backendState.studyId;
}

async function ensureBackendParticipant(data = sessionData.demographics) {
    const api = getBackendApi();
    if (!api || !api.isSupabaseConfigured) return null;
    if (backendState.participantId) return backendState.participantId;
    if (backendState.participantPromise) return backendState.participantPromise;

    backendState.participantPromise = (async () => {
        const participantId = createBackendId();
        const result = await api.createParticipant({
            id: participantId,
            participant_code: String(data.participantId || getParticipantCode()).trim(),
            age: toNullableInt(data.age),
            gender: data.gender || null,
            input_device: data.inputDevice || null,
            dominant_hand: data.dominantHand || null,
            eye_correction: data.eyeCorrection || null,
            metadata: {
                source: 'browser',
                rawDemographics: data,
                consent: consentData,
                safetyScreening: safetyScreeningData,
                device: getDeviceInfo()
            }
        });

        if (result.error) {
            logBackendError('createParticipant', result.error);
            return null;
        }

        backendState.participantId = participantId;
        persistSession();
        return backendState.participantId;
    })().finally(() => {
        backendState.participantPromise = null;
    });

    return backendState.participantPromise;
}

async function ensureBackendSession() {
    const api = getBackendApi();
    if (!api || !api.isSupabaseConfigured) return null;
    if (backendState.sessionId) return backendState.sessionId;
    if (backendState.sessionPromise) return backendState.sessionPromise;

    backendState.sessionPromise = (async () => {
        const studyId = await ensureBackendStudy();
        const participantId = await ensureBackendParticipant();
        if (!studyId || !participantId || !sessionBaseTask || !sessionFatigueTrack) return null;

        const sessionId = createBackendId();
        const result = await api.createSession({
            id: sessionId,
            study_id: studyId,
            participant_id: participantId,
            session_code: getSessionCode(),
            status: 'in_progress',
            original_base_task: originalSessionBaseTask || sessionBaseTask,
            original_fatigue_track: originalSessionFatigueTrack || sessionFatigueTrack,
            final_base_task: sessionBaseTask,
            final_fatigue_track: sessionFatigueTrack,
            app_version: getResearchApi().PROTOCOL_VERSION || 'v3',
            device_info: getDeviceInfo(),
            randomization_seed: protocolSeed,
            protocol_config: {
                protocolVersion: getResearchApi().PROTOCOL_VERSION || '3.0.0',
                metricVersions: getResearchApi().METRIC_VERSIONS || {},
                kssStages: ['pre_block', 'post_block']
            },
            client_build: 'fatigue-id-pro-v3',
            participant_slot_id: claimedSlotId
        });

        if (result.error) {
            logBackendError('createSession', result.error);
            return null;
        }

        backendState.sessionId = sessionId;
        persistSession();

        // Optional camera snapshots: only when the participant enabled the camera
        // AND explicitly agreed to photo capture on the camera-consent screen.
        if (consentData?.camera?.enabled && consentData.camera.saveFrames
            && window.fatigueAttention?.isAttentionActive?.()) {
            window.fatigueFrameCapture?.startFrameCapture?.({
                sessionId,
                participantCode: getParticipantCode(),
                getBlock: () => (typeof activeBlock !== 'undefined' ? activeBlock : 0),
                intervalMs: 15000
            });
        }
        // Upload the 4 buffered calibration ground-truth photos, labelled by corner.
        if (calibrationFrames.length && consentData?.camera?.saveFrames && window.fatigueFrameCapture?.uploadFrameBlob) {
            const pc = getParticipantCode();
            calibrationFrames.splice(0).forEach((f) => {
                window.fatigueFrameCapture.uploadFrameBlob(sessionId, f.blob, { label: `calibration-${f.corner}`, block: 0, participantCode: pc });
            });
        }

        // Now that a session exists, surface the consent + device context as
        // queryable events (they are also stored in participant.metadata).
        if (consentData) {
            recordBackendEvent('consent_given', consentData);
        }
        recordBackendEvent('device_context', getDeviceInfo());
        recordBackendEvent('protocol_assignment', {
            protocolVersion: getResearchApi().PROTOCOL_VERSION || '3.0.0',
            seed: protocolSeed,
            originalBaseTask: originalSessionBaseTask || sessionBaseTask,
            originalFatigueTrack: originalSessionFatigueTrack || sessionFatigueTrack,
            metricVersions: getResearchApi().METRIC_VERSIONS || {}
        });

        return backendState.sessionId;
    })().finally(() => {
        backendState.sessionPromise = null;
    });

    return backendState.sessionPromise;
}

async function ensureBackendBlock(blockNumber) {
    const api = getBackendApi();
    if (!api || !api.isSupabaseConfigured) return null;
    if (backendState.blockIds[blockNumber]) return backendState.blockIds[blockNumber];
    if (backendState.blockPromises[blockNumber]) return backendState.blockPromises[blockNumber];

    backendState.blockPromises[blockNumber] = (async () => {
        const sessionId = await ensureBackendSession();
        if (!sessionId) return null;

        const blockId = createBackendId();
        const result = await api.createExperimentBlock({
            id: blockId,
            session_id: sessionId,
            block_number: blockNumber,
            base_task: sessionBaseTask,
            fatigue_track: sessionFatigueTrack,
            ...getRecordIdentity('experiment_block', blockNumber)
        });

        if (result.error) {
            logBackendError('createExperimentBlock', result.error);
            return null;
        }

        backendState.blockIds[blockNumber] = blockId;
        persistSession();
        return backendState.blockIds[blockNumber];
    })().finally(() => {
        delete backendState.blockPromises[blockNumber];
    });

    return backendState.blockPromises[blockNumber];
}

async function recordBackendEvent(eventType, payload = {}, elapsedMs = null) {
    const api = getBackendApi();
    if (!api || !api.isSupabaseConfigured) return;

    const sessionId = await ensureBackendSession();
    if (!sessionId) return;

    const result = await api.recordSessionEvent({
        session_id: sessionId,
        block_id: backendState.blockIds[currentBlock] || null,
        event_type: eventType,
        event_payload: payload,
        elapsed_ms: elapsedMs,
        ...getRecordIdentity(`event_${eventType}`, currentBlock)
    });

    if (result.error) {
        logBackendError(`recordSessionEvent:${eventType}`, result.error);
    }
}

async function saveBackendFatigueRating(rating) {
    const api = getBackendApi();
    if (!api || !api.isSupabaseConfigured) return;
    const sessionId = await ensureBackendSession();
    if (!sessionId) return;

    if (typeof api.saveFatigueRating === 'function') {
        const result = await api.saveFatigueRating({
            session_id: sessionId,
            block_id: backendState.blockIds[rating.blockNumber] || null,
            block_number: rating.blockNumber,
            stage: rating.stage,
            kss_score: rating.score,
            kss_label: rating.label,
            protocol_version: getResearchApi().PROTOCOL_VERSION || '3.0.0',
            recorded_at: rating.recordedAt,
            ...getRecordIdentity(`kss_${rating.stage}`, rating.blockNumber)
        });
        if (!result.error) return;
        const missingTable = ['42P01', 'PGRST204', 'PGRST205'].includes(result.error.code);
        if (!missingTable) logBackendError('saveFatigueRating', result.error);
    }

    await recordBackendEvent('kss_rating', rating);
}

async function saveBackendBorgRating(rating) {
    const api = getBackendApi();
    if (!api || !api.isSupabaseConfigured) return;
    const sessionId = await ensureBackendSession();
    if (!sessionId) return;
    if (typeof api.saveBorgRating === 'function') {
        const result = await api.saveBorgRating({
            session_id: sessionId,
            block_id: backendState.blockIds[rating.blockNumber] || null,
            block_number: rating.blockNumber,
            stage: rating.stage,
            borg_score: rating.score,
            borg_label: rating.label,
            protocol_version: getResearchApi().PROTOCOL_VERSION || '3.0.0',
            recorded_at: rating.recordedAt,
            ...getRecordIdentity(`borg_${rating.stage}`, rating.blockNumber)
        });
        if (!result.error) return;
        const missingTable = ['42P01', 'PGRST204', 'PGRST205'].includes(result.error.code);
        if (!missingTable) logBackendError('saveBorgRating', result.error);
    }
    await recordBackendEvent('borg_rating', rating);
}

async function saveBackendNasaTlxResponse(data, blockNumber) {
    const api = getBackendApi();
    if (!api || !api.isSupabaseConfigured) return;

    const sessionId = await ensureBackendSession();
    const blockId = await ensureBackendBlock(blockNumber);
    if (!sessionId || !blockId) return;

    const result = await api.saveNasaTlxResponse({
        session_id: sessionId,
        block_id: blockId,
        block_number: blockNumber,
        mental_demand: Number(data.mentalDemand),
        physical_demand: Number(data.physicalDemand),
        temporal_demand: Number(data.temporalDemand),
        performance: Number(data.performance),
        effort: Number(data.effort),
        frustration: Number(data.frustration),
        ...getRecordIdentity('nasa_tlx', blockNumber, blockNumber)
    });

    if (result.error) {
        logBackendError('saveNasaTlxResponse', result.error);
    }
}

async function saveBackendPhysicalFatigueLog(data) {
    const api = getBackendApi();
    if (!api || !api.isSupabaseConfigured) return;

    const sessionId = await ensureBackendSession();
    const blockId = await ensureBackendBlock(data.blockNumber);
    if (!sessionId || !blockId) return;

    const result = await api.savePhysicalFatigueLog({
        session_id: sessionId,
        block_id: blockId,
        block_number: data.blockNumber,
        target_duration_seconds: data.targetDurationSeconds,
        active_duration_seconds: data.activeDurationSeconds,
        paused_duration_seconds: data.pausedDurationSeconds,
        pause_count: data.pauseCount,
        completed: data.completed,
        finish_reason: data.finishReason,
        ended_at: new Date().toISOString(),
        ...getRecordIdentity('physical_fatigue', data.blockNumber)
    });

    if (result.error) {
        logBackendError('savePhysicalFatigueLog', result.error);
    }
}

async function saveBackendFittsTrial(data) {
    const api = getBackendApi();
    if (!api || !api.isSupabaseConfigured) return;

    const blockNumber = data.blockNumber || currentBlock;
    const sessionId = await ensureBackendSession();
    const blockId = await ensureBackendBlock(blockNumber);
    if (!sessionId || !blockId) return;

    const minuteNumber = toNullableInt(data.minuteNumber) || 1;
    const trialInMinute = toNullableInt(data.trialInMinute) || 1;
    const sequenceNumber = ((minuteNumber - 1) * 100) + trialInMinute;

    const result = await api.saveFittsTrial({
        session_id: sessionId,
        block_id: blockId,
        block_number: blockNumber,
        minute_number: minuteNumber,
        trial_in_minute: trialInMinute,
        difficulty_level: toNullableInt(data.difficultyLevel),
        target_size_px: toNullableNumber(data.targetSizePx),
        target_distance_px: toNullableNumber(data.targetDistancePx),
        rendered_arena_width_px: toNullableNumber(data.renderedArenaWidthPx),
        rendered_arena_height_px: toNullableNumber(data.renderedArenaHeightPx),
        avg_index_of_difficulty: toNullableNumber(data.avgIndexOfDifficulty),
        targets_clicked: toNullableInt(data.targetsClicked) || 0,
        misclicks: toNullableInt(data.misclicks) || 0,
        total_time_ms: toNullableNumber(data.totalTimeMs),
        throughput_bps: toNullableNumber(data.throughputBps),
        avg_movement_time_ms: toNullableNumber(data.avgMovementTimeMs),
        error_rate_percent: toNullableNumber(data.errorRatePercent),
        elapsed_time_in_block_ms: toNullableInt(data.elapsedTimeInBlockMs),
        success: Boolean(data.success),
        input_method: data.inputMethod || sessionData.demographics.inputDevice || null,
        ...getRecordIdentity('fitts', blockNumber, sequenceNumber)
    });

    if (result.error) {
        logBackendError('saveFittsTrial', result.error);
    }
}

async function saveBackendTypingTrial(data) {
    const api = getBackendApi();
    if (!api || !api.isSupabaseConfigured) return;

    const blockNumber = data.blockNumber || currentBlock;
    const sessionId = await ensureBackendSession();
    const blockId = await ensureBackendBlock(blockNumber);
    if (!sessionId || !blockId) return;

    const minuteNumber = toNullableInt(data.minuteNumber) || 1;
    const sentenceNumber = toNullableInt(data.sentenceNumber) || 1;
    const sequenceNumber = ((minuteNumber - 1) * 100) + sentenceNumber;

    const result = await api.saveTypingTrial({
        session_id: sessionId,
        block_id: blockId,
        block_number: blockNumber,
        minute_number: minuteNumber,
        sentence_number: sentenceNumber,
        original_sentence: data.originalSentence || '',
        typed_text: data.typedText || '',
        wpm: toNullableNumber(data.wpm),
        error_distance: toNullableNumber(data.errorDistance),
        error_percentage: toNullableNumber(data.errorPercentage),
        iki_ms: toNullableNumber(data.iki),
        kspc: toNullableNumber(data.kspc),
        backspace_count: toNullableInt(data.backspaceCount) || 0,
        duration_ms: toNullableInt(data.durationMs),
        elapsed_time_in_block_ms: toNullableInt(data.elapsedTimeInBlockMs),
        input_method: data.inputMethod || data.keyboardType || sessionData.demographics.inputDevice || null,
        ...getRecordIdentity('typing', blockNumber, sequenceNumber)
    });

    if (result.error) {
        logBackendError('saveTypingTrial', result.error);
    }
}

async function saveBackendCognitiveTrial(data) {
    const api = getBackendApi();
    if (!api || !api.isSupabaseConfigured) return;

    const blockNumber = data.blockNumber || currentBlock;
    const sessionId = await ensureBackendSession();
    const blockId = await ensureBackendBlock(blockNumber);
    if (!sessionId || !blockId) return;

    const trialNumber = toNullableInt(data.trialNumber) || 1;
    const result = await api.saveCognitiveTrial({
        session_id: sessionId,
        block_id: blockId,
        block_number: blockNumber,
        test_type: data.testType,
        phase_label: data.phaseLabel,
        trial_number: trialNumber,
        stimulus: data.stimulus || null,
        correct_response: data.correctResponse || null,
        participant_response: data.participantResponse || null,
        correct: Boolean(data.correct),
        reaction_time_ms: toNullableNumber(data.reactionTimeMs),
        elapsed_time_in_phase_ms: toNullableInt(data.elapsedTimeInPhaseMs),
        elapsed_time_in_block_ms: toNullableInt(data.elapsedTimeInBlockMs),
        is_timeout: Boolean(data.isTimeout),
        input_method: sessionData.demographics.inputDevice || null,
        ...getRecordIdentity('cognitive', blockNumber, trialNumber)
    });

    if (result.error) {
        logBackendError('saveCognitiveTrial', result.error);
    }
}

async function saveBackendEngagementSummary(data) {
    const api = getBackendApi();
    if (!api || !api.isSupabaseConfigured) return;

    const blockNumber = data.blockNumber || currentBlock;
    const sessionId = await ensureBackendSession();
    const blockId = await ensureBackendBlock(blockNumber);
    if (!sessionId || !blockId) return;

    const result = await api.saveEngagementSummary({
        session_id: sessionId,
        block_id: blockId,
        block_number: blockNumber,
        step: data.step || null,
        duration_ms: toNullableInt(data.durationMs),
        app_switch_count: toNullableInt(data.appSwitchCount) || 0,
        total_away_ms: toNullableInt(data.totalAwayMs) || 0,
        longest_away_ms: toNullableInt(data.longestAwayMs) || 0,
        attentive_percent: toNullableNumber(data.attentivePercent),
        look_away_count: toNullableInt(data.lookAwayCount),
        camera_used: Boolean(data.cameraUsed),
        input_method: sessionData.demographics.inputDevice || null,
        ...getRecordIdentity('engagement', blockNumber)
    });

    if (result.error) {
        logBackendError('saveEngagementSummary', result.error);
    }
}

window.fatigueBackend = {
    isDatabaseMode,
    shouldDownloadCsvBackup,
    getRecordIdentity,
    saveFittsTrial: saveBackendFittsTrial,
    saveTypingTrial: saveBackendTypingTrial,
    saveCognitiveTrial: saveBackendCognitiveTrial,
    saveEngagementSummary: saveBackendEngagementSummary,
    recordEngagementEvent: (eventType, payload) => recordBackendEvent(eventType, payload)
};

// ============================================================
// Session resume (data-loss prevention)
// A snapshot of high-level progress is written to localStorage at every step
// boundary. If the page is refreshed or closed and reopened, we restore the
// navigation position AND the backend identity (study/participant/session/block
// ids) so already-saved trials keep linking to the same rows and no duplicate
// participant/session is created. The two long tests resume from the completed
// minute count; shorter steps restart from their beginning.
// ============================================================
const SESSION_STORE_KEY = 'fatigueSessionV2';
const SESSION_RESUME_MAX_AGE_MS = 12 * 60 * 60 * 1000; // 12 hours

function persistSession() {
    if (withdrawn || currentStep === 'complete') return;
    try {
        const snapshot = {
            v: 2,
            savedAt: Date.now(),
            startTime: sessionData.startTime,
            currentStep,
            currentBlock,
            consentData,
            safetyScreeningData,
            demographics: sessionData.demographics,
            blocks: sessionData.blocks,
            sessionBaseTask,
            sessionFatigueTrack,
            originalSessionBaseTask,
            originalSessionFatigueTrack,
            protocolSeed,
            kssRatings,
            claimedSlotId,
            backend: {
                studyId: backendState.studyId,
                participantId: backendState.participantId,
                sessionId: backendState.sessionId,
                sessionCode: backendState.sessionCode,
                blockIds: backendState.blockIds
            }
        };
        localStorage.setItem(SESSION_STORE_KEY, JSON.stringify(snapshot));
    } catch (e) {
        // Storage may be unavailable (private mode / quota); resume is best-effort.
    }
}

function loadSession() {
    try {
        const raw = localStorage.getItem(SESSION_STORE_KEY);
        if (!raw) return null;
        const snap = JSON.parse(raw);
        if (!snap || snap.v !== 2) return null;
        if (Date.now() - (snap.savedAt || 0) > SESSION_RESUME_MAX_AGE_MS) return null;
        return snap;
    } catch (e) {
        return null;
    }
}

function clearSession() {
    try { localStorage.removeItem(SESSION_STORE_KEY); } catch (e) {}
}

function hydrateFromSnapshot(snap) {
    sessionData.startTime = snap.startTime || new Date().toISOString();
    sessionData.demographics = snap.demographics || {};
    sessionData.blocks = Array.isArray(snap.blocks) ? snap.blocks : [];
    consentData = snap.consentData || null;
    safetyScreeningData = snap.safetyScreeningData || null;
    sessionBaseTask = snap.sessionBaseTask || null;
    sessionFatigueTrack = snap.sessionFatigueTrack || null;
    originalSessionBaseTask = snap.originalSessionBaseTask || null;
    originalSessionFatigueTrack = snap.originalSessionFatigueTrack || null;
    protocolSeed = snap.protocolSeed || null;
    kssRatings = Array.isArray(snap.kssRatings) ? snap.kssRatings : [];
    claimedSlotId = snap.claimedSlotId || null;
    currentBlock = snap.currentBlock || 1;
    if (snap.backend) {
        backendState.studyId = snap.backend.studyId || null;
        backendState.participantId = snap.backend.participantId || null;
        backendState.sessionId = snap.backend.sessionId || null;
        backendState.sessionCode = snap.backend.sessionCode || null;
        backendState.blockIds = snap.backend.blockIds || {};
    }
}

function stepDisplayName(step) {
    return {
        'consent': 'Informed Consent',
        'camera-consent': 'Camera Check',
        'calibration': 'Camera Calibration',
        'demographics': 'Participant Info',
        'experiment-setup': 'Experiment Setup',
        'kss-pre': 'Pre-block Alertness',
        'kss-post': 'Post-block Alertness',
        'fitts': 'Fitts Tapping Test',
        'typing': 'Typing Test',
        'nasatlx': 'NASA-TLX Assessment',
        'break': 'Rest Period',
        'safety': 'Safety Check',
        'cognitive': 'Cognitive Battery',
        'physical': 'Physical Fatigue',
        'complete': 'Finished'
    }[step] || step;
}

function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, (c) => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
}

function routeToStep(step) {
    switch (step) {
        case 'camera-consent': showCameraConsent(); break;
        case 'calibration': showDemographics(); break;
        case 'demographics': showDemographics(); break;
        case 'experiment-setup': showExperimentSetup(); break;
        case 'kss-pre': showPreBlockRating(snapBlockOrCurrent()); break;
        case 'kss-post': showPostBlockRating(); break;
        case 'fitts': showFittsTest(); break;
        case 'typing': showTypingTest(); break;
        case 'nasatlx': showNASATLX(); break;
        case 'break': showBreak(); break;
        case 'safety': showSafetyScreening(); break;
        case 'cognitive': showCognitiveTest(); break;
        case 'physical': showPhysicalFatigueTest(); break;
        case 'complete': showCompletion(); break;
        default: showConsent();
    }
}

function snapBlockOrCurrent() {
    return Math.min(Math.max(currentBlock || 1, 1), TOTAL_BLOCKS);
}

function showResumePrompt(snap) {
    setWithdrawVisible(false);
    const who = snap.demographics && snap.demographics.participantId
        ? `participant <strong>${escapeHtml(snap.demographics.participantId)}</strong>`
        : 'your device';
    mainContent.innerHTML = `
        <div class="card-screen screen-enter" style="text-align:center;">
            <div class="block-title">Resume Your Session?</div>
            <p>We found an in-progress session for ${who}, last active at
            <strong>Block ${snap.currentBlock} &ndash; ${escapeHtml(stepDisplayName(snap.currentStep))}</strong>.</p>
            <p>You can continue where you left off, or start a brand-new session.</p>
            <div class="consent-actions" style="justify-content:center;">
                <button class="button secondary" id="resume-startover-btn" type="button">Start New Session</button>
                <button class="button primary" id="resume-continue-btn" type="button">Resume Session</button>
            </div>
        </div>`;

    document.getElementById('resume-continue-btn').onclick = () => resumeSession(snap);
    document.getElementById('resume-startover-btn').onclick = () => {
        clearSession();
        sessionData.startTime = new Date().toISOString();
        showConsent();
    };
}

function resumeSession(snap) {
    hydrateFromSnapshot(snap);
    if (consentData) setWithdrawVisible(true);
    recordBackendEvent('session_resumed', { atStep: snap.currentStep, block: snap.currentBlock });
    routeToStep(snap.currentStep);
}

document.addEventListener('DOMContentLoaded', function() {
    const withdrawBtn = document.getElementById('withdraw-btn');
    if (withdrawBtn) withdrawBtn.addEventListener('click', withdrawStudy);
    showLanding();
});

// One shared entry: ask whether this is a participant or a researcher, so there's
// a single URL to hand out. Researchers go to the console; participants start the
// study (resuming an in-progress session if there is one).
function showLanding() {
    setWithdrawVisible(false);
    mainContent.innerHTML = `
        <div class="card-screen screen-enter" style="max-width:560px; margin:0 auto; text-align:center;">
            <div class="kicker" style="color:var(--accent-cyan, #45c8e6); font-weight:800; letter-spacing:0.16em; text-transform:uppercase; font-size:0.72rem;">Welcome</div>
            <div class="block-title" style="text-align:center;">How are you using this?</div>
            <p style="color: var(--color-text-muted, #6b7280);">Choose to begin.</p>
            <div style="display:flex; gap:16px; flex-wrap:wrap; margin-top:18px;">
                <button class="button primary" id="role-participant" type="button" style="flex:1; min-width:200px;">I'm a Participant</button>
                <button class="button secondary" id="role-admin" type="button" style="flex:1; min-width:200px;">Researcher / Admin</button>
            </div>
            <p style="margin-top:18px;"><a href="scroll.html" style="color:var(--accent-cyan, #45c8e6); font-size:0.9em; text-decoration:none;">Scroll study &rarr;</a></p>
        </div>`;
    document.getElementById('role-participant').onclick = startParticipant;
    document.getElementById('role-admin').onclick = () => { window.location.href = 'admin.html'; };
}

function startParticipant() {
    const configIssues = window.fatigueStudyConfigIssues || [];
    if (configIssues.length) {
        setWithdrawVisible(false);
        mainContent.innerHTML = `
            <div class="card-screen screen-enter configuration-required">
                <div class="block-title">Study setup is incomplete</div>
                <p>Participant collection is disabled until the public consent details are configured.</p>
                <p class="form-error">Missing: ${escapeHtml(configIssues.join(', '))}</p>
                <p>Add the corresponding <code>VITE_STUDY_*</code> values to <code>.env</code>, restart the app, and try again.</p>
                <button class="button secondary" id="config-back" type="button">Back</button>
            </div>`;
        document.getElementById('config-back').onclick = showLanding;
        return;
    }
    const saved = loadSession();
    const resumable = saved && saved.consentData
        && saved.currentStep && saved.currentStep !== 'consent' && saved.currentStep !== 'complete';

    if (resumable) {
        showResumePrompt(saved);
    } else {
        if (saved) clearSession();
        sessionData.startTime = new Date().toISOString();
        showConsent();
    }
}

function setWithdrawVisible(visible) {
    const btn = document.getElementById('withdraw-btn');
    if (btn) btn.hidden = !visible;
}

// Reusable styled confirmation dialog (replaces window.confirm for a consistent
// look). Calls onConfirm only if the participant confirms; otherwise dismisses.
function showConfirmModal({ title, message, confirmLabel = 'Confirm', cancelLabel = 'Cancel', danger = false, onConfirm }) {
    const prior = document.getElementById('app-modal-overlay');
    if (prior) prior.remove();

    const overlay = document.createElement('div');
    overlay.id = 'app-modal-overlay';
    overlay.className = 'app-modal-overlay';
    overlay.innerHTML = `
        <div class="app-modal" role="dialog" aria-modal="true" aria-label="${escapeHtml(title)}">
            <div class="app-modal-title">${escapeHtml(title)}</div>
            <div class="app-modal-message">${escapeHtml(message)}</div>
            <div class="app-modal-actions">
                <button class="button secondary" id="app-modal-cancel" type="button">${escapeHtml(cancelLabel)}</button>
                <button class="button ${danger ? 'danger' : 'primary'}" id="app-modal-confirm" type="button">${escapeHtml(confirmLabel)}</button>
            </div>
        </div>`;
    document.body.appendChild(overlay);

    const close = () => overlay.remove();
    document.getElementById('app-modal-cancel').onclick = close;
    document.getElementById('app-modal-confirm').onclick = () => {
        close();
        if (typeof onConfirm === 'function') onConfirm();
    };
    // Click on the dimmed backdrop dismisses (treated as cancel).
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
}

// Participant-initiated exit. Records the withdrawal (anon role cannot UPDATE the
// session row, so we log it as a session event), then ends safely.
function withdrawStudy() {
    if (withdrawn || currentStep === 'complete') return;
    showConfirmModal({
        title: 'Withdraw from the study?',
        message: 'Your session will end and no further data will be collected. This cannot be undone.',
        confirmLabel: 'Withdraw',
        cancelLabel: 'Stay in Study',
        danger: true,
        onConfirm: () => {
            withdrawn = true;
            stopKiosk();
            window.fatigueFrameCapture?.stopFrameCapture?.();
            window.fatigueAttention?.disableAttention?.(); // release the camera
            recordBackendEvent('participant_withdrew', { atStep: currentStep, block: currentBlock });
            if (backendState.sessionId) getBackendApi()?.finalizeSession?.(backendState.sessionId, 'abandoned');
            clearSession();

            currentStep = 'complete'; // releases the refresh/close guard
            setWithdrawVisible(false);
            mainContent.innerHTML = `
                <div class="completion-container card-screen screen-enter" style="text-align:center;">
                    <h3>You Have Withdrawn</h3>
                    <p>Your participation has ended. You can safely close this tab. Thank you for your time.</p>
                </div>`;
        }
    });
}

// --- NEW: Accidental Refresh Blocker (Modern Standard) ---
window.addEventListener('beforeunload', function (e) {
    // If the experiment is officially 'complete', let them leave without a warning
    if (currentStep === 'complete' || !consentData) return;

    // Modern browsers require preventDefault() to trigger the generic warning prompt
    e.preventDefault(); 
    
    // Returning a value satisfies older browsers without triggering the deprecation warning
    return '';
});

// --- Fullscreen kiosk lock ----------------------------------------------------
// During the test the study runs full screen; if the participant leaves full
// screen (e.g. presses Escape) a blocking overlay makes them resume before they
// can continue. Re-entering full screen needs a user gesture, hence the button.
let kioskActive = false;
let calibrationFrames = []; // buffered 4-dot ground-truth photos, uploaded once the session exists
function isFullscreen() { return Boolean(document.fullscreenElement || document.webkitFullscreenElement); }
function requestKioskFullscreen() {
    const el = document.documentElement;
    const fn = el.requestFullscreen || el.webkitRequestFullscreen;
    try { const r = fn && fn.call(el); return (r && r.catch) ? r.catch(() => {}) : Promise.resolve(); }
    catch (e) { return Promise.resolve(); }
}
function startKiosk() { kioskActive = true; requestKioskFullscreen(); }
function stopKiosk() {
    kioskActive = false;
    hideKioskOverlay();
    const calib = document.getElementById('calib-surface');
    if (calib) calib.remove();
    if (isFullscreen() && document.exitFullscreen) { try { document.exitFullscreen(); } catch (e) { /* ignore */ } }
}
function hideKioskOverlay() { const o = document.getElementById('kiosk-overlay'); if (o) o.remove(); }
function showKioskOverlay() {
    if (document.getElementById('kiosk-overlay')) return;
    const o = document.createElement('div');
    o.id = 'kiosk-overlay';
    o.style.cssText = 'position:fixed; inset:0; z-index:2147483647; background:rgba(7,18,32,0.97); color:#e6eefc; display:flex; align-items:center; justify-content:center; text-align:center; padding:24px; font-family:inherit;';
    o.innerHTML = `<div>
        <div style="font-size:1.3rem; font-weight:800; margin-bottom:10px;">Please stay in full screen</div>
        <p style="color:#9fb4d6; max-width:440px; margin:0 auto 18px; line-height:1.5;">The study runs in full screen so nothing distracts you during the tasks. Your progress is saved &mdash; return to full screen to continue.</p>
        <button id="kiosk-resume" type="button" style="font:inherit; font-weight:700; cursor:pointer; border:none; border-radius:10px; padding:12px 24px; background:linear-gradient(135deg,#3a8cff,#45c8e6); color:#04121f;">Resume in full screen</button>
    </div>`;
    document.body.appendChild(o);
    document.getElementById('kiosk-resume').onclick = () => { requestKioskFullscreen().finally(hideKioskOverlay); };
}
document.addEventListener('fullscreenchange', () => {
    if (!kioskActive || currentStep === 'complete') { hideKioskOverlay(); return; }
    if (!isFullscreen()) showKioskOverlay(); else hideKioskOverlay();
});
// Four high-level phases shown as a numbered stepper (matches the console design).
function currentPhaseIndex() {
    if (currentStep === 'consent' || currentStep === 'camera-consent' || currentStep === 'calibration') return 0;
    if (currentStep === 'demographics' || currentStep === 'experiment-setup') return 1;
    if (currentStep === 'complete') return 3;
    return 2; // every in-block step is "Data Collection"
}

// Overall test completion (0-100%). The test is 3 blocks x 5 steps
// (KSS-pre -> task -> NASA-TLX -> cognitive/physical -> KSS-post). Setup screens
// before the blocks read 0%; the finished screen reads 100%.
function completionPercent() {
    if (currentStep === 'complete') return 100;
    const STEPS_PER_BLOCK = 5;
    const stepInBlock = { 'kss-pre': 0, fitts: 1, typing: 1, nasatlx: 2, borg: 2, cognitive: 3, physical: 3, safety: 3, 'kss-post': 4 };
    const block = Math.min(Math.max(currentBlock || 1, 1), TOTAL_BLOCKS);
    if (currentStep === 'break') {
        return Math.round((Math.min(block, TOTAL_BLOCKS) / TOTAL_BLOCKS) * 100);
    }
    const idx = stepInBlock[currentStep];
    if (idx === undefined) return 0; // pre-test setup
    return Math.round((((block - 1) + idx / STEPS_PER_BLOCK) / TOTAL_BLOCKS) * 100);
}

function updateProgress() {
    // Plain white during the test itself; light-blue wave theme everywhere else.
    document.body.classList.toggle('test-mode', TEST_STEPS.has(currentStep));
    const phases = ['Consent', 'Setup', 'Data Collection', 'Results'];
    const activePhase = currentPhaseIndex();
    const activeBlock = Math.min(Math.max(currentBlock || 1, 1), TOTAL_BLOCKS);

    const steps = phases.map((label, i) => {
        const state = i < activePhase ? 'complete' : (i === activePhase ? 'active' : 'pending');
        const mark = state === 'complete' ? '&#10003;' : (i + 1);
        const connector = i < phases.length - 1 ? `<span class="phase-connector ${i < activePhase ? 'complete' : ''}"></span>` : '';
        return `
            <span class="phase-step ${state}">
                <span class="phase-dot">${mark}</span>
                <span class="phase-label">${label}</span>
            </span>${connector}`;
    }).join('');

    progressBar.innerHTML = `
        <div class="phase-stepper" aria-label="Protocol progress">
            <div class="phase-meta">
                <span class="phase-kicker">Protocol Mission</span>
                <strong>Block ${activeBlock}/${TOTAL_BLOCKS}</strong>
            </div>
            <div class="phase-track" aria-hidden="false">${steps}</div>
            ${(() => {
                const pct = completionPercent();
                return `<div class="completion" style="margin:10px 0 2px;">
                    <div style="display:flex; justify-content:space-between; font-size:0.78rem; color:#9fb4d6; margin-bottom:5px;">
                        <span>Test completion</span><span><strong style="color:#cfe0fb;">${pct}%</strong></span>
                    </div>
                    <div role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"
                         style="height:8px; border-radius:999px; background:rgba(255,255,255,0.12); overflow:hidden;">
                        <div style="height:100%; width:${pct}%; border-radius:999px; background:linear-gradient(90deg,#3a8cff,#45c8e6); transition:width 0.45s ease;"></div>
                    </div>
                </div>`;
            })()}
            <span class="phase-current">${stepDisplayName(currentStep)}</span>
            <span class="protocol-context">${sessionData.demographics.participantId ? `Participant ${escapeHtml(sessionData.demographics.participantId)} · ` : ''}Block ${activeBlock}/${TOTAL_BLOCKS}</span>
            <span class="write-status" id="write-status" aria-live="polite">${navigator.onLine ? 'Save status ready' : 'Offline · records will queue'}</span>
        </div>`;

    // Save the resume point whenever we enter a new step.
    persistSession();
}

window.addEventListener('fatigue:write-status', (event) => {
    const el = document.getElementById('write-status');
    if (!el) return;
    const pending = Number(event.detail && event.detail.pending) || 0;
    const failed = Number(event.detail && event.detail.failed) || 0;
    el.className = `write-status ${failed ? 'error' : pending ? 'pending' : 'saved'}`;
    el.textContent = failed
        ? `${failed} write${failed === 1 ? '' : 's'} need researcher review`
        : pending
            ? `${pending} record${pending === 1 ? '' : 's'} queued`
            : 'All submitted records saved';
});

window.addEventListener('offline', () => {
    const el = document.getElementById('write-status');
    if (el) { el.className = 'write-status pending'; el.textContent = 'Offline · records will queue'; }
});


// --- NEW: Demographics Downloader ---
function downloadDemographicsCSV(data) {
    if (!shouldDownloadCsvBackup()) return;

    const pid = data.participantId || "UNKNOWN";
    const headers = Object.keys(data).join(",");
    const values = Object.values(data).join(",");
    const csvContent = headers + "\n" + values;
    
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    
    // Precise naming format for the master profile
    link.download = `${pid}_demographics_profile.csv`;
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
}

// 0. Informed Consent (gate before anything else)
function showConsent() {
    currentStep = 'consent';
    updateProgress();

    if (typeof mountConsentScreen !== 'function') {
        setWithdrawVisible(false);
        mainContent.innerHTML = `
            <div class="card-screen screen-enter">
                <div class="block-title">Consent form unavailable</div>
                <p>The study cannot begin because the informed-consent module did not load. No data has been collected.</p>
                <button class="button secondary" type="button" onclick="location.reload()">Reload</button>
            </div>`;
        return;
    }

    mountConsentScreen(mainContent, (record) => {
        consentData = record;
        setWithdrawVisible(true); // participant can now leave at any time
        startKiosk();             // OA-style: full screen for the whole session
        showCameraConsent();
    }, () => {
        showConsentDeclined();
    });
}

// 0b. Optional camera attention opt-in (after consent, before demographics).
function showCameraConsent() {
    currentStep = 'camera-consent';
    updateProgress();

    if (typeof mountCameraConsent !== 'function') {
        showDemographics();
        return;
    }

    mountCameraConsent(mainContent, (result) => {
        const record = { ...result, decidedAt: new Date().toISOString() };
        if (consentData) consentData.camera = record; // captured in participant metadata
        recordBackendEvent('camera_consent', record);
        // If the camera is on, run the 4-dot calibration first; otherwise skip it.
        if (result.enabled && typeof window.fatigueCalibration !== 'undefined') {
            showCameraCalibration();
        } else {
            showDemographics();
        }
    });
}

// 0c. Four-dot camera/screen calibration (only when the camera is enabled).
// Four dots appear one at a time clockwise; the participant taps each. Taps give
// screen geometry + precision; the head pose at each corner gives a gaze reference.
function showCameraCalibration() {
    currentStep = 'calibration';
    updateProgress();

    // Assert full screen for the check (we are already full screen from consent).
    requestKioskFullscreen();

    // Dots sit close to the true corners (7% inset) to capture the widest
    // comfortable viewing angle. Recomputed each dot in case of resize/rotate.
    const MARGIN = 0.07;
    const compute = () => window.fatigueCalibration.calibrationTargets(window.innerWidth, window.innerHeight, MARGIN);
    let targets = compute();
    const taps = [];
    const poses = [];
    let idx = 0;

    // IMPORTANT: attach to <body>, NOT mainContent. The app container has a
    // backdrop-filter/transform, which would make position:fixed relative to that
    // box (clipping the dots to the centre card). On <body> it maps to the viewport.
    const surface = document.createElement('div');
    surface.id = 'calib-surface';
    surface.style.cssText = 'position:fixed; inset:0; z-index:100000; background:#06101f; cursor:crosshair; touch-action:none; user-select:none;';
    document.body.appendChild(surface);
    const cleanup = () => surface.remove();

    const renderDot = () => {
        if (idx >= targets.length) { cleanup(); finishCalibration(); return; }
        targets = compute();
        const t = targets[idx];
        const cornerName = ['top-left', 'top-right', 'bottom-right', 'bottom-left'][idx] || '';
        surface.innerHTML = `
            <div style="position:absolute; top:42%; left:0; right:0; text-align:center; color:#cfe0fb; font-family:inherit; padding:0 20px;">
                <div style="font-weight:800; font-size:1.25rem;">Quick camera check</div>
                <div style="opacity:0.85; margin-top:8px;">Look at the glowing dot (${cornerName}) and tap it. &nbsp;<strong>${idx + 1} of 4</strong></div>
                <div style="opacity:0.6; margin-top:4px; font-size:0.9rem;">This maps your comfortable viewing area so we can tell when your focus drifts off-screen.</div>
            </div>`;
        const dot = document.createElement('div');
        dot.style.cssText = `position:absolute; left:${t.x}px; top:${t.y}px; width:40px; height:40px; margin:-20px 0 0 -20px; border-radius:50%; background:radial-gradient(circle at 50% 42%, #eaf7ff, #45c8e6 60%, #2f7fd6); box-shadow:0 0 0 6px rgba(69,200,230,0.22), 0 0 28px 8px rgba(69,200,230,0.55); cursor:pointer;`;
        surface.appendChild(dot);
        try { dot.animate([{ transform: 'scale(0.82)' }, { transform: 'scale(1.14)' }, { transform: 'scale(0.82)' }], { duration: 1200, iterations: Infinity }); } catch (e) { /* WAAPI optional */ }

        const corner = ['tl', 'tr', 'br', 'bl'][idx] || ('c' + idx);
        surface.addEventListener('pointerdown', (e) => {
            e.preventDefault();
            taps.push({ x: e.clientX, y: e.clientY });
            poses.push(window.fatigueAttention?.getLastPose?.() || null);
            // Ground-truth photo of the participant looking at this known corner.
            if (consentData?.camera?.saveFrames && window.fatigueFrameCapture?.grabFrameBlob) {
                window.fatigueFrameCapture.grabFrameBlob().then((b) => { if (b) calibrationFrames.push({ corner, blob: b }); });
            }
            idx++;
            renderDot();
        }, { once: true });
    };

    const finishCalibration = () => {
        const anyPose = poses.some((p) => p);
        const profile = window.fatigueCalibration.buildCalibrationProfile({
            viewport: { w: window.innerWidth, h: window.innerHeight },
            targets,
            taps,
            poses: anyPose ? poses : null
        });
        // Adapt the attention classifier to this person/device using the corner poses.
        const limits = window.fatigueCalibration.limitsFromCornerPoses?.(profile.cornerPoses);
        if (limits) {
            profile.attentionLimits = limits;
            window.fatigueAttention?.setLimits?.(limits);
        }
        if (consentData && consentData.camera) consentData.camera.calibration = profile;
        recordBackendEvent('camera_calibration', profile);
        showDemographics();
    };

    renderDot();
}

function showConsentDeclined() {
    currentStep = 'complete'; // allow the page to be closed without a warning
    clearSession();
    updateProgress();
    mainContent.innerHTML = `
        <div class="completion-container card-screen screen-enter" style="text-align:center;">
            <h3>No Problem</h3>
            <p>You chose not to take part. You can safely close this tab. Thank you for your time.</p>
        </div>`;
}

// Validate a researcher-provided participant code against the ID pool. In database
// mode an unknown or already-used code is rejected; in CSV/dev mode (no Supabase)
// it allows free-text entry. Returns { ok } or { ok:false, reason }.
async function claimParticipantCodeOrAllow(code) {
    const api = getBackendApi();
    if (!api || !api.isSupabaseConfigured || typeof api.claimParticipantCode !== 'function') {
        return { ok: true };
    }
    const res = await api.claimParticipantCode(code);
    if (res.error) {
        logBackendError('claimParticipantCode', res.error);
        return { ok: false, reason: 'network' };
    }
    const d = res.data || {};
    if (d.disabled || d.ok) return { ok: true, slotId: d.slot_id || null };
    return { ok: false, reason: d.reason || 'unknown' };
}

// Self-registration: auto-issue a participant code, de-duplicated by email.
// Returns { ok, code, alreadyRegistered } or { ok:false, reason }. In dev/no-
// backend mode a local code is generated so the flow still works.
async function registerParticipantOrAllow(data) {
    const api = getBackendApi();
    const email = String(data.email || '').trim();
    if (!api || !api.isSupabaseConfigured || typeof api.registerParticipant !== 'function') {
        return { ok: true, code: 'FP-' + Math.random().toString(36).slice(2, 8).toUpperCase(), alreadyRegistered: false };
    }
    const res = await api.registerParticipant(email, data.fullName, data.phone);
    if (res.error) {
        logBackendError('registerParticipant', res.error);
        if (/invalid email/i.test(res.error.message || '')) return { ok: false, reason: 'invalid' };
        return { ok: false, reason: 'network' };
    }
    const d = res.data || {};
    if (!d.code) return { ok: false, reason: 'unknown' };
    return { ok: true, code: d.code, alreadyRegistered: !!d.already_registered };
}

// Confirm the auto-assigned ID so the participant can save it before continuing.
function showParticipantIdConfirmation(code, alreadyRegistered) {
    setWithdrawVisible(false);
    mainContent.innerHTML = `
        <div class="card-screen screen-enter">
            <div class="kicker" style="color:var(--accent-cyan,#45c8e6); font-weight:800; letter-spacing:0.16em; text-transform:uppercase; font-size:0.72rem;">Registered</div>
            <div class="block-title">Your participant ID</div>
            <p style="color:var(--color-text-muted,#6b7280);">${alreadyRegistered
                ? 'This email is already registered, so we are reusing your existing ID.'
                : 'Please save this ID. You may need it to ask questions about, or to withdraw, your data later.'}</p>
            <div style="font-size:2rem; font-weight:800; letter-spacing:0.08em; text-align:center; margin:18px 0; color:var(--accent-cyan,#45c8e6);">${escapeHtml(code)}</div>
            <button class="button primary" id="reg-continue" type="button" style="width:100%;">Continue</button>
        </div>`;
    document.getElementById('reg-continue').onclick = () => { startKiosk(); showExperimentSetup(); };
}

// 1. Demographics
function showDemographics() {
    currentStep = 'demographics';
    updateProgress();

    if (typeof mountDemographicsForm === "function") {
        mountDemographicsForm(mainContent, async (data) => {
            sessionData.demographics = data;
            const reg = await registerParticipantOrAllow(data);
            if (!reg.ok) {
                const errBox = document.getElementById('demographics-error');
                const msg = reg.reason === 'invalid'
                    ? 'Please enter a valid email address.'
                    : 'Could not register right now. Please check your connection and try again.';
                if (errBox) { errBox.textContent = msg; errBox.hidden = false; }
                return; // stay on the form
            }
            data.participantId = reg.code;       // server-issued ID becomes the code
            claimedSlotId = null;                // self-registration: no researcher slot
            downloadDemographicsCSV(data);
            ensureBackendParticipant(data);
            showParticipantIdConfirmation(reg.code, reg.alreadyRegistered);
        });
    } else {
        const code = 'FP-' + Math.random().toString(36).slice(2, 8).toUpperCase();
        sessionData.demographics = { participantId: code, email: 'dev@example.com' };
        downloadDemographicsCSV(sessionData.demographics);
        ensureBackendParticipant(sessionData.demographics);
        showExperimentSetup();
    }
}

// 2. Experiment Setup (Display Random Fatigue + Choose Primary Task)
// 2. Experiment Setup (Fully Randomized Assignment)
// 2. Experiment Setup (Fully Randomized Assignment with Remote Override)
function showExperimentSetup() {
    currentStep = 'experiment-setup';
    updateProgress();
    
    // --- MODIFIED: Only randomize if they haven't been assigned yet ---
    if (!sessionBaseTask || !sessionFatigueTrack) {
        const research = getResearchApi();
        protocolSeed = protocolSeed || (research.createSeed ? research.createSeed() : `${Date.now()}-${Math.random()}`);
        const assignedCondition = research.assignCondition
            ? research.assignCondition(protocolSeed)
            : { primary: Math.random() < 0.5 ? 'fitts' : 'typing', fatigue: Math.random() < 0.5 ? 'cognitive' : 'physical' };

        // Assign to your global session variables
        sessionBaseTask = assignedCondition.primary;
        sessionFatigueTrack = assignedCondition.fatigue;
        originalSessionBaseTask = assignedCondition.primary;
        originalSessionFatigueTrack = assignedCondition.fatigue;
    }
    
    // Prepare the text based on the current track
    const primaryTitle = sessionBaseTask === 'fitts' ? "Fitts' Tapping Task" : "Typing Task";
    const primaryDesc = sessionBaseTask === 'fitts' 
        ? 'You will click moving targets to measure spatial motor skills.' 
        : 'You will transcribe text to measure keyboard motor skills.';

    const fatigueTitle = sessionFatigueTrack === 'cognitive' ? "Cognitive Battery" : "Physical Exercise";
    const fatigueDesc = sessionFatigueTrack === 'cognitive' 
        ? 'You will complete Stroop & AX-CPT tests.' 
        : 'You will complete physical fatigue induction.';

    // --- NEW: Add override button ONLY if physical track is active ---
    let switchOverrideHTML = '';
    if (sessionFatigueTrack === 'physical') {
        switchOverrideHTML = `
            <div class="mission-override">
                <p>Unable to do physical exercise remotely?</p>
                <button class="button secondary compact" onclick="switchToCognitiveOverride()">
                    Switch to Cognitive Test
                </button>
            </div>
        `;
    }

    // Attach the override function to the global window object so the inline button can trigger it
    window.switchToCognitiveOverride = function() {
        showConfirmModal({
            title: 'Switch to the cognitive task?',
            message: 'You will do a seated cognitive battery instead of physical exercise for the rest of the study. This change is recorded.',
            confirmLabel: 'Switch to Cognitive',
            cancelLabel: 'Keep Physical',
            onConfirm: () => {
                const previousFatigueTrack = sessionFatigueTrack;
                sessionFatigueTrack = 'cognitive';
                recordBackendEvent('fatigue_track_override', {
                    from: previousFatigueTrack,
                    to: 'cognitive',
                    reason: 'remote_physical_unavailable'
                });
                showExperimentSetup(); // Re-render the UI immediately with the new cognitive track
            }
        });
    };

    // Persist the finalized assignment so a refresh on this screen resumes with
    // the same protocol instead of re-randomizing.
    persistSession();

    // Render the UI
    mainContent.innerHTML = `
        <div class="mission-screen screen-enter">
            <div class="mission-kicker">Study protocol</div>
            <h2 class="mission-title">Your assigned task sequence</h2>
            <p class="mission-copy">
                The assignment is reproducible and remains fixed throughout this session.
            </p>

            <div class="mission-card-grid">
                <section class="mission-card primary">
                    <div class="mission-card-topline">Stage 01</div>
                    <div class="mission-card-label">Primary challenge</div>
                    <h3 class="mission-card-title">${primaryTitle}</h3>
                    <p class="mission-card-copy">${primaryDesc}</p>
                    <div class="mission-stat">
                        <span>Measured signal</span>
                        <strong>${sessionBaseTask === 'fitts' ? 'Pointing precision' : 'Typing rhythm'}</strong>
                    </div>
                </section>

                <section class="mission-card fatigue">
                    <div class="mission-card-topline">Stage 02</div>
                    <div class="mission-card-label">Fatigue track</div>
                    <h3 class="mission-card-title">${fatigueTitle}</h3>
                    <p class="mission-card-copy">${fatigueDesc}</p>
                    <div class="mission-stat">
                        <span>Protocol role</span>
                        <strong>${sessionFatigueTrack === 'cognitive' ? 'Mental load' : 'Physical load'}</strong>
                    </div>
                    ${switchOverrideHTML}
                </section>
            </div>

            <div class="mission-footer">
                <span class="mission-note">Three blocks with alertness ratings before and after each block.</span>
                <button class="button primary mission-action" id="start-exp-btn" onclick="showPreBlockRating(1)">
                    Record baseline alertness
                </button>
            </div>
        </div>
    `;
}

function storeKssRating(rating) {
    kssRatings = kssRatings.filter((item) => !(item.blockNumber === rating.blockNumber && item.stage === rating.stage));
    kssRatings.push(rating);
    persistSession();
}

function showPreBlockRating(blockNum) {
    currentBlock = Math.min(Math.max(Number(blockNum) || 1, 1), TOTAL_BLOCKS);
    if (kssRatings.some((item) => item.blockNumber === currentBlock && item.stage === 'pre_block')) {
        startBlock(currentBlock);
        return;
    }
    currentStep = 'kss-pre';
    updateProgress();
    if (typeof mountFatigueScale !== 'function') {
        mainContent.innerHTML = '<div class="card-screen"><div class="block-title">Alertness scale unavailable</div><p>The block cannot start because a required research measure did not load.</p></div>';
        return;
    }
    mountFatigueScale(mainContent, { stage: 'pre_block', blockNumber: currentBlock }, async (rating) => {
        storeKssRating(rating);
        await saveBackendFatigueRating(rating);
        startBlock(currentBlock);
    });
}

function showPostBlockRating() {
    if (kssRatings.some((item) => item.blockNumber === currentBlock && item.stage === 'post_block')) {
        finishBlock();
        return;
    }
    currentStep = 'kss-post';
    updateProgress();
    if (typeof mountFatigueScale !== 'function') {
        mainContent.innerHTML = '<div class="card-screen"><div class="block-title">Alertness scale unavailable</div><p>The block cannot be finalized because a required research measure did not load.</p></div>';
        return;
    }
    mountFatigueScale(mainContent, { stage: 'post_block', blockNumber: currentBlock }, async (rating) => {
        storeKssRating(rating);
        await saveBackendFatigueRating(rating);
        finishBlock();
    });
}

// 3. Block Initialization
function startBlock(blockNum) {
    if (blockNum > TOTAL_BLOCKS) {
        showCompletion();
        return;
    }

    // Note: the experiment intentionally does NOT force fullscreen. Browsers exit
    // fullscreen on Escape and that cannot be blocked, which made pressing Escape
    // look like the study had ended. Running in-tab keeps the flow consistent, and
    // the explicit Withdraw button remains the only way to leave the study early.

    currentBlock = blockNum;
    
    sessionData.blocks[currentBlock - 1] = {
        ...(sessionData.blocks[currentBlock - 1] || {}),
        blockNumber: currentBlock,
        startTime: new Date().toISOString(),
        fatigueType: sessionFatigueTrack,
        baseTaskType: sessionBaseTask
    };
    ensureBackendBlock(currentBlock);
    
    // Route to the chosen primary task
    if (sessionBaseTask === 'fitts') {
        showFittsTest();
    } else {
        showTypingTest();
    }
}

// 4A. Fitts Route
function showFittsTest() {
    currentStep = 'fitts';
    updateProgress();
    window.fatigueEngagement?.startTest({ blockNumber: currentBlock, step: 'fitts' });
    const pid = sessionData.demographics.participantId || "UNKNOWN";
    const block = sessionData.blocks[currentBlock - 1] || {};
    const startMinute = (block.primaryProgress && block.primaryProgress.completedMinutes) || 0;
    mountFittsTest(mainContent, (data) => {
        window.fatigueEngagement?.endTest();
        sessionData.blocks[currentBlock - 1].primaryData = data;
        showNASATLX();
    }, pid, currentBlock, {
        startMinute,
        protocolSeed,
        onMinuteComplete: (completed) => {
            // Persist progress after each completed minute so a refresh resumes
            // mid-test instead of restarting the full 10 minutes.
            sessionData.blocks[currentBlock - 1].primaryProgress = { completedMinutes: completed };
            persistSession();
        }
    });
}

// 4B. Typing Route
function showTypingTest() {
    currentStep = 'typing';
    updateProgress();
    window.fatigueEngagement?.startTest({ blockNumber: currentBlock, step: 'typing' });
    const pid = sessionData.demographics.participantId || "UNKNOWN";
    const block = sessionData.blocks[currentBlock - 1] || {};
    const startMinute = (block.primaryProgress && block.primaryProgress.completedMinutes) || 0;
    mountTypingTest(mainContent, (data) => {
        window.fatigueEngagement?.endTest();
        sessionData.blocks[currentBlock - 1].primaryData = data;
        showNASATLX();
    }, pid, currentBlock, {
        startMinute,
        protocolSeed,
        onMinuteComplete: (completed) => {
            sessionData.blocks[currentBlock - 1].primaryProgress = { completedMinutes: completed };
            persistSession();
        }
    });
}

// 5. NASA-TLX
// 5. NASA-TLX
function showNASATLX() {
    currentStep = 'nasatlx';
    updateProgress();
    
    // Grab the ID before passing it to the test
    const pid = sessionData.demographics.participantId || "UNKNOWN";
    
    window.fatigueEngagement?.startTest({ blockNumber: currentBlock, step: 'nasatlx' });

    // Pass currentBlock and pid as the 3rd and 4th arguments
    mountNASATLX(mainContent, (data) => {
        window.fatigueEngagement?.endTest();
        sessionData.blocks[currentBlock - 1].nasatlxData = data;
        saveBackendNasaTlxResponse(data, currentBlock);
        showBorg();
    }, currentBlock, pid);
}

// 5b. Borg CR10 (compulsory alongside NASA-TLX)
function showBorg() {
    currentStep = 'borg';
    updateProgress();
    if (typeof mountBorgScale !== 'function') { showBreak(); return; }
    window.fatigueEngagement?.startTest({ blockNumber: currentBlock, step: 'borg' });
    mountBorgScale(mainContent, { stage: 'post_block', blockNumber: currentBlock }, async (rating) => {
        window.fatigueEngagement?.endTest();
        (sessionData.blocks[currentBlock - 1] ||= {}).borgData = rating;
        await saveBackendBorgRating(rating);
        showBreak();
    });
}

// 6. Break Period
function showBreak() {
    currentStep = 'break';
    updateProgress();
    let timeRemaining = BREAK_DURATION;
    
    const renderBreak = () => {
        const mins = Math.floor(timeRemaining / 60);
        const secs = timeRemaining % 60;
        const nextTask = sessionFatigueTrack === 'cognitive' ? 'Cognitive Battery' : 'Physical Exercise';
        mainContent.innerHTML = `
            <div class="checkpoint-screen screen-enter">
                <div class="checkpoint-kicker">Checkpoint Hold</div>
                <div class="checkpoint-timer">${mins}:${secs.toString().padStart(2, '0')}</div>
                <h3>Rest window active</h3>
                <p class="checkpoint-copy">Next up: ${nextTask}. This timed pause keeps the protocol consistent between stages.</p>
                <div class="checkpoint-actions">
                    <button class="button secondary" onclick="skipBreak()">Skip Rest Window</button>
                </div>
            </div>`;
    };

    let advanced = false;
    const advance = () => {
        if (advanced) return;
        advanced = true;
        clearInterval(interval);
        proceedToFatigueTest();
    };

    const interval = setInterval(() => {
        timeRemaining--;
        if (timeRemaining <= 0) {
            advance();
        } else renderBreak();
    }, 1000);

    // Confirm before skipping (the rest period standardizes fatigue between tasks).
    window.skipBreak = () => {
        showConfirmModal({
            title: 'Skip the rest break?',
            message: 'The rest period helps standardize fatigue between tasks. Your choice to skip is recorded.',
            confirmLabel: 'Skip Break',
            cancelLabel: 'Keep Resting',
            onConfirm: () => {
                if (advanced) return;
                recordBackendEvent('break_skipped', {
                    blockNumber: currentBlock,
                    remainingSeconds: timeRemaining
                });
                advance();
            }
        });
    };
    renderBreak();
}

// 7. Automatic Fatigue Routing
function proceedToFatigueTest() {
    if (sessionFatigueTrack === 'cognitive') {
        showCognitiveTest();
        return;
    }

    // Physical track: run a safety check before the first physical exercise.
    // If already cleared earlier this session, go straight to the exercise.
    if (safetyScreeningData && safetyScreeningData.cleared) {
        showPhysicalFatigueTest();
    } else {
        showSafetyScreening();
    }
}

// 7b. Physical Activity Safety Screening (PAR-Q style)
function showSafetyScreening() {
    currentStep = 'safety';
    updateProgress();

    if (typeof mountSafetyScreening !== 'function') {
        showPhysicalFatigueTest();
        return;
    }

    mountSafetyScreening(mainContent, (record) => {
        // Cleared and willing -> proceed with the physical exercise.
        safetyScreeningData = record;
        recordBackendEvent('safety_screening_passed', record);
        showPhysicalFatigueTest();
    }, (record) => {
        // Not safe / opted out -> permanently switch this session to the
        // cognitive track and record why, mirroring the remote override.
        safetyScreeningData = record;
        const previousFatigueTrack = sessionFatigueTrack;
        sessionFatigueTrack = 'cognitive';
        sessionData.blocks[currentBlock - 1].fatigueType = 'cognitive';
        recordBackendEvent('safety_screening_declined', record);
        recordBackendEvent('fatigue_track_override', {
            from: previousFatigueTrack,
            to: 'cognitive',
            reason: 'safety_screening',
            outcome: record.outcome
        });
        showCognitiveTest();
    });
}

// 8A. Cognitive Test
// 8A. Cognitive Test
function showCognitiveTest() {
    currentStep = 'cognitive';
    updateProgress();
    
    // Grab the ID before passing it to the test
    const pid = sessionData.demographics.participantId || "UNKNOWN";
    
    window.fatigueEngagement?.startTest({ blockNumber: currentBlock, step: 'cognitive' });

    // Pass currentBlock and pid as the 3rd and 4th arguments
    mountCognitiveTest(mainContent, (data) => {
        window.fatigueEngagement?.endTest();
        sessionData.blocks[currentBlock - 1].fatigueData = data;
        showPostBlockRating();
    }, currentBlock, pid, { protocolSeed });
}

// 8B. Physical Test
function showPhysicalFatigueTest() {
    currentStep = 'physical';
    updateProgress();
    window.fatigueEngagement?.startTest({ blockNumber: currentBlock, step: 'physical' });

    let timeRemaining = PHYSICAL_FATIGUE_DURATION;
    let timerInterval = null;
    let timerRunning = false;
    let physicalStartedAt = null;
    let activeStartedAt = null;
    let pauseStartedAt = null;
    let pausedDurationSeconds = 0;
    let pauseCount = 0;
    let physicalFinished = false;
    const studyConfig = window.fatigueStudyConfig || {};
    const physicalName = studyConfig.physicalProtocolName || 'Configured physical protocol';
    const physicalInstructions = studyConfig.physicalProtocolInstructions || 'Follow the researcher-approved movement instructions.';
    
    const fmtClock = (totalSeconds) => {
        const m = Math.floor(totalSeconds / 60);
        const s = totalSeconds % 60;
        return `${m}:${s.toString().padStart(2, '0')}`;
    };

    function updateDisplay() {
        const activeSeconds = Math.max(0, PHYSICAL_FATIGUE_DURATION - timeRemaining);
        const liveExtraPause = pauseStartedAt ? Math.round((performance.now() - pauseStartedAt) / 1000) : 0;
        const pausedSeconds = pausedDurationSeconds + liveExtraPause;
        mainContent.innerHTML = `
            <div class="physical-test-container" style="text-align:center;">
                <div class="block-title">${escapeHtml(physicalName)}</div>
                <p class="physical-protocol-instructions">${escapeHtml(physicalInstructions)}</p>
                <div class="physical-safety-note">
                    Exercise at a comfortable pace. <strong>Stop immediately and use &ldquo;Finish Early&rdquo;
                    if you feel chest pain, dizziness, or unwell.</strong>
                </div>
                <div style="font-size: 4em; font-weight: bold; margin: 20px 0; color: #eaf2ff; text-shadow: 0 2px 18px rgba(69,200,230,0.35);">${fmtClock(timeRemaining)}</div>
                <div class="timer-controls">
                    ${!timerRunning
                        ? '<button class="button primary" onclick="startTimer()">Start Exercise</button>'
                        : '<button class="button secondary" onclick="stopTimer()">Pause</button>'
                    }
                    <button class="button danger" onclick="confirmFinishPhysical()" style="margin-left:10px;">Finish Early</button>
                </div>
                <div class="physical-time-breakdown">
                    Active: ${fmtClock(activeSeconds)} &nbsp;&middot;&nbsp; Paused: ${fmtClock(pausedSeconds)} (${pauseCount}&times;)
                </div>
            </div>`;
    }
    
    window.startTimer = function() {
        if (!timerRunning) {
            timerRunning = true;
            if (!physicalStartedAt) physicalStartedAt = performance.now();
            if (pauseStartedAt) {
                pausedDurationSeconds += Math.round((performance.now() - pauseStartedAt) / 1000);
                pauseStartedAt = null;
            }
            activeStartedAt = performance.now();
            recordBackendEvent('physical_timer_started', { blockNumber: currentBlock, remainingSeconds: timeRemaining });
            timerInterval = setInterval(() => {
                timeRemaining = Math.max(0, timeRemaining - 1);
                updateDisplay();
                if (timeRemaining <= 0) finishPhysicalTest();
            }, 1000);
            updateDisplay();
        }
    };
    
    window.stopTimer = function() {
        if (timerRunning) {
            clearInterval(timerInterval);
            timerRunning = false;
            activeStartedAt = null;
            pauseStartedAt = performance.now();
            pauseCount++;
            recordBackendEvent('physical_timer_paused', { blockNumber: currentBlock, remainingSeconds: timeRemaining });
            updateDisplay();
        }
    };
    
    // Confirm only on the manual "Finish Early" button; the automatic finish at
    // 0:00 calls finishPhysicalTest() directly without a prompt.
    window.confirmFinishPhysical = function() {
        if (physicalFinished) return;
        showConfirmModal({
            title: 'Finish the exercise early?',
            message: 'You have not completed the full duration. Finishing early is recorded with your session.',
            confirmLabel: 'Finish Early',
            cancelLabel: 'Keep Going',
            danger: true,
            onConfirm: () => window.finishPhysicalTest()
        });
    };

    window.finishPhysicalTest = function() {
        if (physicalFinished) return;
        physicalFinished = true;
        window.fatigueEngagement?.endTest();
        if (timerInterval) clearInterval(timerInterval);

        const now = performance.now();
        if (pauseStartedAt) {
            pausedDurationSeconds += Math.round((now - pauseStartedAt) / 1000);
            pauseStartedAt = null;
        }
        timerRunning = false;

        const completedFullDuration = timeRemaining <= 0;
        const fatigueLog = {
            blockNumber: currentBlock,
            targetDurationSeconds: PHYSICAL_FATIGUE_DURATION,
            activeDurationSeconds: Math.max(0, PHYSICAL_FATIGUE_DURATION - timeRemaining),
            pausedDurationSeconds,
            pauseCount,
            completed: completedFullDuration,
            finishReason: completedFullDuration ? 'completed_duration' : 'finished_early'
        };

        sessionData.blocks[currentBlock - 1].fatigueData = fatigueLog;
        recordBackendEvent('physical_fatigue_finished', {
            blockNumber: currentBlock,
            remainingSeconds: timeRemaining,
            completedFullDuration
        });
        saveBackendPhysicalFatigueLog(fatigueLog);
        showPostBlockRating();
    };
    
    updateDisplay();
}

// 9. Finish Block
function finishBlock() {
    if (currentBlock < TOTAL_BLOCKS) {
        mainContent.innerHTML = `
        <div class="checkpoint-screen checkpoint-complete card-screen screen-enter">
                <div class="checkpoint-kicker">Block recorded</div>
                <div class="completion-badge">OK</div>
                <h3>Block ${currentBlock} Complete</h3>
                <p class="checkpoint-copy">${currentBlock} of ${TOTAL_BLOCKS} blocks recorded. Take a moment, then continue when ready.</p>
                <button class="button primary" onclick="showPreBlockRating(${currentBlock + 1})">Continue to Block ${currentBlock + 1}</button>
            </div>`;
    } else {
        showCompletion();
    }
}

// Builds the per-block results table shown on the completion screen.
function buildCompletionSummary() {
    const rows = [];
    for (let i = 0; i < TOTAL_BLOCKS; i++) {
        const b = sessionData.blocks[i];
        if (!b) continue;
        const task = b.baseTaskType || sessionBaseTask || '-';
        const fatigue = b.fatigueType || sessionFatigueTrack || '-';
        const nasa = (b.nasatlxData && b.nasatlxData.overallScore != null) ? b.nasatlxData.overallScore : '-';
        rows.push(`
            <tr>
                <td class="summary-metric">Block ${b.blockNumber}</td>
                <td>${escapeHtml(task)}</td>
                <td>${escapeHtml(fatigue)}</td>
                <td>${escapeHtml(String(nasa))}</td>
            </tr>`);
    }
    if (!rows.length) return '';
    return `
        <table class="summary-table">
            <thead>
                <tr><th>Block</th><th>Primary Task</th><th>Fatigue Track</th><th>NASA-TLX</th></tr>
            </thead>
            <tbody>${rows.join('')}</tbody>
        </table>`;
}

// 10. Completion summary + master download
function showCompletion() {
    currentStep = 'complete';
    clearSession(); // study finished - nothing left to resume
    updateProgress();
    setWithdrawVisible(false);
    stopKiosk();
    window.fatigueFrameCapture?.stopFrameCapture?.();
    window.fatigueAttention?.disableAttention?.(); // release the camera
    recordBackendEvent('session_completed', { totalBlocks: TOTAL_BLOCKS });
    // Mark the session genuinely completed (status + completed_at) so analysts can
    // filter finished sessions, not just rely on the event log.
    ensureBackendSession().then((sid) => {
        if (sid) getBackendApi()?.finalizeSession?.(sid, 'completed');
    });

    const databaseMode = isDatabaseMode();
    if (!databaseMode) {
        setTimeout(() => downloadResults(), 500);
    }

    const completionMessage = databaseMode
        ? 'Your results were saved securely to the study database.'
        : 'Your results have been downloaded to this device.';
    const downloadButton = databaseMode
        ? ''
        : '<button class="button primary" onclick="downloadResults()">Download Master CSV Again</button>';

    mainContent.innerHTML = `
        <div class="completion-container completion-summary card-screen screen-enter">
            <div class="completion-badge">OK</div>
            <h3 class="completion-title">Experiment Complete</h3>
            <p class="completion-copy">Thank you for participating. ${completionMessage}</p>
            ${buildCompletionSummary()}
            ${downloadButton}
        </div>`;
}

function downloadResults() {
    if (!shouldDownloadCsvBackup()) return;
    const rows = ["participant_id,primary_task,fatigue_track,block_number,nasa_score"];
    for (let i = 0; i < TOTAL_BLOCKS; i++) {
        const b = sessionData.blocks[i];
        if (b) rows.push(`${sessionData.demographics.participantId},${sessionBaseTask},${sessionFatigueTrack},${b.blockNumber},${b.nasatlxData?.overallScore || ''}`);
    }
    // Fixed the newline character here so it formats properly in Excel
    const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${sessionData.demographics.participantId}_master_results.csv`;
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(link.href);
}
