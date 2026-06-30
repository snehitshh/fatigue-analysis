// Consent and safety screening screens.
//
// These are plain global-function modules (same pattern as demographics.js /
// fitts.js) loaded as classic scripts from index.html. They never touch the
// network themselves; main.js decides how to persist the returned data
// (participant metadata + session events), so this file has no backend coupling.

// --- Camera attention opt-in --------------------------------------------------
// Optional. onDone(result) is always called so the study proceeds either way:
//   result = { enabled: true }            camera granted and tracking started
//   result = { enabled: false, reason }   declined or unavailable (denied/error)
// Processing is on-device; only a looking/not-looking signal is derived, never media.
function mountCameraConsent(container, onDone) {
    container.innerHTML = `
        <div class="consent-container card-screen screen-enter">
            <div class="block-title">Attention Check (Optional)</div>
            <div class="consent-body">
                <p>To help us confirm the quality of your data, you can optionally let us use your
                <strong>front camera</strong> during the tasks to estimate whether your head is oriented toward the screen.</p>
                <h3>What this does</h3>
                <ul>
                    <li>Runs entirely <strong>on your device</strong>. No photo or video is recorded, stored, or uploaded.</li>
                    <li>We keep only an exploratory <strong>screen-oriented / away</strong> estimate, summarised per task.</li>
                    <li>It is <strong>optional</strong> - you can take part fully without it.</li>
                    <li>You can revoke camera access at any time in your browser.</li>
                </ul>
                <p class="field-hint" id="camera-consent-status"></p>
            </div>
            <div class="consent-actions">
                <button class="button secondary" id="camera-skip-btn" type="button">Continue Without Camera</button>
                <button class="button primary" id="camera-enable-btn" type="button">Enable Camera</button>
            </div>
        </div>
    `;

    const enableBtn = document.getElementById('camera-enable-btn');
    const skipBtn = document.getElementById('camera-skip-btn');
    const status = document.getElementById('camera-consent-status');

    skipBtn.addEventListener('click', () => onDone({ enabled: false, reason: 'declined' }));

    enableBtn.addEventListener('click', async () => {
        const api = (typeof window !== 'undefined') ? window.fatigueAttention : null;
        if (!api || typeof api.enableAttention !== 'function') {
            onDone({ enabled: false, reason: 'unavailable' });
            return;
        }
        enableBtn.disabled = true;
        status.textContent = 'Requesting camera...';
        try {
            await api.enableAttention(); // getUserMedia runs from this click gesture
            onDone({ enabled: true });
        } catch (err) {
            status.textContent = 'Camera unavailable or blocked. You can continue without it.';
            enableBtn.disabled = false;
            // Let them retry or skip; surface the failure but don't block the study.
        }
    });
}

// --- Informed consent ---------------------------------------------------------
// onComplete(consentRecord) is called only when the participant explicitly agrees.
// onDecline() is called when they choose not to take part.
function mountConsentScreen(container, onComplete, onDecline) {
    const config = (typeof window !== 'undefined' && window.fatigueStudyConfig) || {};
    container.innerHTML = `
        <div class="consent-container card-screen screen-enter">
            <div class="block-title">Informed Consent</div>
            <div class="consent-body">
                <p>You are invited to take part in a research study on <strong>fatigue and how it
                affects human&ndash;computer interaction</strong>, conducted by
                <strong>${config.institution || 'the configured research institution'}</strong>.
                Protocol: <strong>${config.protocolId || 'To be confirmed'}</strong>.</p>

                <h3>What you will do</h3>
                <ul>
                    <li>Complete a short demographics form.</li>
                    <li>Complete tapping or typing measurements across three blocks.</li>
                    <li>Rate current sleepiness and workload, then complete a cognitive or light physical task.</li>
                    <li>The full session may take about 45&ndash;75 minutes depending on your assigned tasks and pauses.</li>
                </ul>

                <h3>Your data</h3>
                <ul>
                    <li>Responses are stored under a participant code for ${config.dataUse || 'research analysis'}.</li>
                    <li>We record task performance, timing, and basic device information (screen size, input method).</li>
                    <li>The dataset is <strong>pseudonymous</strong>, not guaranteed anonymous. Keep your participant code private.</li>
                    <li>Data retention: ${config.retention || 'To be confirmed'}.</li>
                    <li>The optional camera check runs on-device; no image or video is uploaded.</li>
                </ul>

                <h3>Possible discomfort</h3>
                <ul>
                    <li>You may experience temporary tiredness, frustration, eye strain, or mild physical exertion.</li>
                    <li>Pause or stop immediately if you feel pain, dizziness, or unwell.</li>
                </ul>

                <h3>Your rights</h3>
                <ul>
                    <li>Participation is <strong>completely voluntary</strong>.</li>
                    <li>You may <strong>withdraw at any time</strong> with no penalty. This stops new collection.</li>
                    <li>Data already submitted is handled under the approved retention policy. Contact ${config.contact || 'the study team'} about removal requests.</li>
                    <li>If you have a health concern about the physical task, a safety check and an alternative are provided.</li>
                    <li>Study contact: <strong>${config.contact || 'To be confirmed'}</strong>.</li>
                </ul>

                <label class="consent-check">
                    <input type="checkbox" id="consent-agree-box">
                    <span>I have read and understood the above, I am at least 16 years old, and I agree to take part.</span>
                </label>
            </div>

            <div class="consent-actions">
                <button class="button secondary" id="consent-decline-btn" type="button">Do Not Participate</button>
                <button class="button primary" id="consent-agree-btn" type="button" disabled>I Agree, Continue</button>
            </div>
        </div>
    `;

    const box = document.getElementById('consent-agree-box');
    const agreeBtn = document.getElementById('consent-agree-btn');
    const declineBtn = document.getElementById('consent-decline-btn');

    box.addEventListener('change', () => {
        agreeBtn.disabled = !box.checked;
    });

    agreeBtn.addEventListener('click', () => {
        if (!box.checked) return;
        onComplete({
            consentGiven: true,
            consentVersion: 'v2',
            agreedAt: new Date().toISOString()
        });
    });

    declineBtn.addEventListener('click', () => {
        if (typeof onDecline === 'function') onDecline();
    });
}

// --- Physical-exercise safety screening (PAR-Q style) -------------------------
// Shown immediately before the physical fatigue task. onProceed(record) runs only
// when the participant clears the screen and confirms they are willing/able.
// onDecline(record) runs when any flag is present or they opt out, so the caller
// can route them to the cognitive alternative instead.
function mountSafetyScreening(container, onProceed, onDecline) {
    const QUESTIONS = [
        { id: 'heart', text: 'Has a doctor ever said you have a heart condition or that you should only do physical activity recommended by a doctor?' },
        { id: 'chestPain', text: 'Do you feel pain in your chest when you do physical activity?' },
        { id: 'dizziness', text: 'Do you ever feel faint, dizzy, or lose your balance?' },
        { id: 'injury', text: 'Do you have a bone, joint, or muscle problem that could be made worse by exercise?' },
        { id: 'otherReason', text: 'Is there any other reason you should not do light physical exercise right now?' }
    ];

    container.innerHTML = `
        <div class="safety-container card-screen screen-enter">
            <div class="block-title">Physical Activity Safety Check</div>
            <div class="safety-body">
                <p>The next task involves <strong>light physical exercise</strong>. Please answer honestly.
                If any answer is &ldquo;Yes&rdquo;, we will give you a seated cognitive task instead.</p>
                <form id="safety-form">
                    ${QUESTIONS.map((q) => `
                        <div class="safety-question">
                            <p class="safety-q-text">${q.text}</p>
                            <div class="safety-options">
                                <label><input type="radio" name="${q.id}" value="no" required> No</label>
                                <label><input type="radio" name="${q.id}" value="yes"> Yes</label>
                            </div>
                        </div>
                    `).join('')}
                    <label class="consent-check">
                        <input type="checkbox" id="safety-willing-box">
                        <span>I feel physically able and willing to do light exercise now.</span>
                    </label>
                </form>
            </div>
            <div class="consent-actions">
                <button class="button secondary" id="safety-optout-btn" type="button">Use Cognitive Task Instead</button>
                <button class="button primary" id="safety-proceed-btn" type="button">Continue to Exercise</button>
            </div>
        </div>
    `;

    const form = document.getElementById('safety-form');
    const willingBox = document.getElementById('safety-willing-box');
    const proceedBtn = document.getElementById('safety-proceed-btn');
    const optOutBtn = document.getElementById('safety-optout-btn');

    function collectAnswers() {
        const answers = {};
        let anyYes = false;
        let answeredAll = true;
        QUESTIONS.forEach((q) => {
            const checked = form.querySelector(`input[name="${q.id}"]:checked`);
            if (!checked) {
                answeredAll = false;
                answers[q.id] = null;
            } else {
                answers[q.id] = checked.value;
                if (checked.value === 'yes') anyYes = true;
            }
        });
        return { answers, anyYes, answeredAll };
    }

    proceedBtn.addEventListener('click', () => {
        const { answers, anyYes, answeredAll } = collectAnswers();
        if (!answeredAll) {
            alert('Please answer every question.');
            return;
        }
        const record = { answers, cleared: !anyYes, willing: willingBox.checked, screenedAt: new Date().toISOString() };

        if (anyYes || !willingBox.checked) {
            // Not safe / not willing -> route to the cognitive alternative.
            record.outcome = 'declined_to_cognitive';
            onDecline(record);
            return;
        }
        record.outcome = 'cleared';
        onProceed(record);
    });

    optOutBtn.addEventListener('click', () => {
        const { answers, anyYes } = collectAnswers();
        onDecline({ answers, cleared: !anyYes, willing: false, outcome: 'opted_out', screenedAt: new Date().toISOString() });
    });
}
