// Global Configuration
const TOTAL_BLOCKS = 3;
const BREAK_DURATION = 120; // 2 minutes
const PHYSICAL_FATIGUE_DURATION = 720; // 12 minutes (synced with cognitive)

let currentStep = 'demographics'; 
let currentBlock = 1;

// Stores the user's choices for the entire session
let sessionBaseTask = null; // 'fitts' or 'typing'
let sessionFatigueTrack = null; // 'cognitive' or 'physical'
let originalSessionBaseTask = null;
let originalSessionFatigueTrack = null;

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
            app_version: 'v2',
            device_info: getDeviceInfo()
        });

        if (result.error) {
            logBackendError('createSession', result.error);
            return null;
        }

        backendState.sessionId = sessionId;
        persistSession();

        // Now that a session exists, surface the consent + device context as
        // queryable events (they are also stored in participant.metadata).
        if (consentData) {
            recordBackendEvent('consent_given', consentData);
        }
        recordBackendEvent('device_context', getDeviceInfo());

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

window.fatigueBackend = {
    isDatabaseMode,
    shouldDownloadCsvBackup,
    getRecordIdentity,
    saveFittsTrial: saveBackendFittsTrial,
    saveTypingTrial: saveBackendTypingTrial,
    saveCognitiveTrial: saveBackendCognitiveTrial
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
        'demographics': 'Participant Info',
        'experiment-setup': 'Experiment Setup',
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
        case 'demographics': showDemographics(); break;
        case 'experiment-setup': showExperimentSetup(); break;
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
});

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
            recordBackendEvent('participant_withdrew', { atStep: currentStep, block: currentBlock });
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
    if (currentStep === 'complete') return; 

    // Modern browsers require preventDefault() to trigger the generic warning prompt
    e.preventDefault(); 
    
    // Returning a value satisfies older browsers without triggering the deprecation warning
    return ''; 
});
// Four high-level phases shown as a numbered stepper (matches the console design).
function currentPhaseIndex() {
    if (currentStep === 'consent') return 0;
    if (currentStep === 'demographics' || currentStep === 'experiment-setup') return 1;
    if (currentStep === 'complete') return 3;
    return 2; // every in-block step is "Data Collection"
}

function updateProgress() {
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
            <span class="phase-current">${stepDisplayName(currentStep)}</span>
        </div>`;

    // Save the resume point whenever we enter a new step.
    persistSession();
}


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
        // Safety fallback if the consent module failed to load.
        consentData = { consentGiven: true, consentVersion: 'fallback', agreedAt: new Date().toISOString() };
        showDemographics();
        return;
    }

    mountConsentScreen(mainContent, (record) => {
        consentData = record;
        setWithdrawVisible(true); // participant can now leave at any time
        showDemographics();
    }, () => {
        showConsentDeclined();
    });
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

// 1. Demographics
function showDemographics() {
    currentStep = 'demographics';
    updateProgress();
    
    if (typeof mountDemographicsForm === "function") {
        mountDemographicsForm(mainContent, (data) => {
            sessionData.demographics = data;
            downloadDemographicsCSV(data); 
            ensureBackendParticipant(data);
            showExperimentSetup(); 
        });
    } else {
        sessionData.demographics = { participantId: "TEST_" + Math.floor(Math.random() * 1000) };
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
        // Define the 4 exact combinations (25% probability each)
        const conditions = [
            { primary: 'fitts', fatigue: 'cognitive' },
            { primary: 'typing', fatigue: 'cognitive' },
            { primary: 'fitts', fatigue: 'physical' },
            { primary: 'typing', fatigue: 'physical' }
        ];

        // Pick one randomly
        const assignedCondition = conditions[Math.floor(Math.random() * conditions.length)];

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
            <div class="mission-kicker">Protocol Mission</div>
            <h2 class="mission-title">Assigned Challenge Path</h2>
            <p class="mission-copy">
                This path is randomized to prevent selection bias. Your task order stays locked for this session.
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
                <span class="mission-note">Three blocks. Same tests. Cleaner flow.</span>
                <button class="button primary mission-action" id="start-exp-btn" onclick="startBlock(1)">
                    Start Block 1
                </button>
            </div>
        </div>
    `;
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
    const pid = sessionData.demographics.participantId || "UNKNOWN";
    const block = sessionData.blocks[currentBlock - 1] || {};
    const startMinute = (block.primaryProgress && block.primaryProgress.completedMinutes) || 0;
    mountFittsTest(mainContent, (data) => {
        sessionData.blocks[currentBlock - 1].primaryData = data;
        showNASATLX();
    }, pid, currentBlock, {
        startMinute,
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
    const pid = sessionData.demographics.participantId || "UNKNOWN";
    const block = sessionData.blocks[currentBlock - 1] || {};
    const startMinute = (block.primaryProgress && block.primaryProgress.completedMinutes) || 0;
    mountTypingTest(mainContent, (data) => {
        sessionData.blocks[currentBlock - 1].primaryData = data;
        showNASATLX();
    }, pid, currentBlock, {
        startMinute,
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
    
    // Pass currentBlock and pid as the 3rd and 4th arguments
    mountNASATLX(mainContent, (data) => {
        sessionData.blocks[currentBlock - 1].nasatlxData = data;
        saveBackendNasaTlxResponse(data, currentBlock);
        showBreak();
    }, currentBlock, pid);
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
    
    // Pass currentBlock and pid as the 3rd and 4th arguments
    mountCognitiveTest(mainContent, (data) => {
        sessionData.blocks[currentBlock - 1].fatigueData = data;
        finishBlock();
    }, currentBlock, pid);
}

// 8B. Physical Test
function showPhysicalFatigueTest() {
    currentStep = 'physical';
    updateProgress();
    
    let timeRemaining = PHYSICAL_FATIGUE_DURATION;
    let timerInterval = null;
    let timerRunning = false;
    let physicalStartedAt = null;
    let activeStartedAt = null;
    let pauseStartedAt = null;
    let pausedDurationSeconds = 0;
    let pauseCount = 0;
    let physicalFinished = false;
    
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
                <div class="block-title">Physical Fatigue Exercise</div>
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
        finishBlock();
    };
    
    updateDisplay();
}

// 9. Finish Block
function finishBlock() {
    if (currentBlock < TOTAL_BLOCKS) {
        mainContent.innerHTML = `
            <div class="checkpoint-screen checkpoint-complete card-screen screen-enter">
                <div class="checkpoint-kicker">Checkpoint Clear</div>
                <div class="completion-badge">OK</div>
                <h3>Block ${currentBlock} Complete</h3>
                <p class="checkpoint-copy">${currentBlock} of ${TOTAL_BLOCKS} blocks recorded. Take a moment, then continue when ready.</p>
                <button class="button primary" onclick="startBlock(${currentBlock + 1})">Continue to Block ${currentBlock + 1}</button>
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
    recordBackendEvent('session_completed', { totalBlocks: TOTAL_BLOCKS });

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

