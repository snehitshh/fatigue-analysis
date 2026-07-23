// Scrolling Attention Test (SART) - Sustained Attention to Response Task,
// presented as a continuous scrolling stream of digits. Universal step: runs
// once per block, after that block's questionnaire, regardless of which
// fatigue track (cognitive/physical) the session is on.
//
// Classic SART timing: digit visible ~250ms, fixed ~1150ms cycle per trial.
// Respond (tap/space) to every digit except the no-go digit (3); withhold on 3.
function mountScrollTest(container, onComplete, blockIdx, participantId, options) {
    const research = window.fatigueResearch || {};
    const random = research.seededRandom && options && options.protocolSeed
        ? research.seededRandom(research.deriveSeed(options.protocolSeed, `scroll-block-${blockIdx || 1}`))
        : Math.random;

    const DIGITS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
    const NO_GO_DIGIT = 3;
    const CYCLE_MS = 1150; // fixed pace per trial (classic SART); the CSS animation fades the digit out over this same window, so it doesn't linger
    const PRACTICE_TRIALS = 10;
    // ponytail: 90s of real trials per block (~78 trials); change here if a
    // longer/shorter SART is wanted, nothing else depends on this number.
    const REAL_DURATION_MS = 90 * 1000;

    if (!window.__scrollTestStyles) {
        const style = document.createElement('style');
        style.textContent = `
            .scroll-test-container { display:flex; flex-direction:column; align-items:center; justify-content:center; min-height:60vh; text-align:center; font-family:'Inter',sans-serif; }
            .scroll-stream { position:relative; width:100%; max-width:420px; height:180px; overflow:hidden; border-radius:16px; background:#f9fafb; border:2px solid #e5e7eb; }
            .scroll-digit { position:absolute; left:0; right:0; top:50%; transform:translateY(-50%); font-size:5em; font-weight:800; color:#1f2937; animation:scrollUp ${CYCLE_MS}ms linear forwards; }
            @keyframes scrollUp { 0% { transform:translateY(60px); opacity:0; } 15% { opacity:1; } 70% { opacity:1; } 100% { transform:translateY(-90px); opacity:0; } }
            .scroll-tap-btn { margin-top:24px; width:100%; max-width:420px; padding:22px; font-size:1.3em; font-weight:700; border-radius:14px; border:none; background:linear-gradient(90deg,#3a8cff,#45c8e6); color:#fff; cursor:pointer; }
            .scroll-tap-btn:active { filter:brightness(0.92); }
            .scroll-progbar-outer { width:100%; max-width:420px; height:10px; background:#e5e7eb; border-radius:6px; margin:16px 0; overflow:hidden; }
            #scroll-prog-bar { height:100%; background:#3b82f6; width:0%; transition:width 0.1s linear; }
        `;
        document.head.appendChild(style);
        window.__scrollTestStyles = true;
    }

    let phase = 'instructions'; // 'instructions' | 'practice' | 'real'
    let trialResults = [];
    let trialCount = 0;
    let responded = false;
    let responseTime = 0;
    let trialStartTime = 0;
    let phaseStartTime = 0;
    let cycleTimeout = null;
    let realTimer = null;

    showInstructions();

    function showInstructions() {
        container.innerHTML = `
            <div class="scroll-test-container">
                <h2 class="block-title">Scrolling Attention Test</h2>
                <p>Numbers will scroll past continuously. Tap the button below for every number -
                   <strong>except when you see "${NO_GO_DIGIT}"</strong>. Skip the tap only for "${NO_GO_DIGIT}".</p>
                <p><strong>A short practice round comes first.</strong></p>
                <button class="button primary" onclick="startScrollPractice()">Start Practice</button>
            </div>`;
        window.startScrollPractice = () => {
            phase = 'practice';
            trialCount = 0;
            renderTestUI();
            nextTrial();
        };
    }

    function renderTestUI() {
        const badge = phase === 'practice' ? '<div class="practice-badge">PRACTICE MODE (NOT SCORED)</div>' : '';
        container.innerHTML = `
            <div class="scroll-test-container">
                ${badge}
                <div class="scroll-progbar-outer"><div id="scroll-prog-bar"></div></div>
                <div class="scroll-stream" id="scroll-stream"></div>
                <button class="scroll-tap-btn" id="scroll-tap-btn">TAP</button>
            </div>`;
        const btn = document.getElementById('scroll-tap-btn');
        btn.addEventListener('mousedown', handleResponse);
        btn.addEventListener('touchstart', (e) => { e.preventDefault(); handleResponse(); }, { passive: false });
        window.onkeydown = (e) => { if (e.code === 'Space') { e.preventDefault(); handleResponse(); } };
        if (phase === 'real') phaseStartTime = performance.now();
    }

    function handleResponse() {
        if (responded) return;
        responded = true;
        responseTime = performance.now();
    }

    function nextTrial() {
        trialCount++;
        responded = false;
        const digit = DIGITS[Math.floor(random() * DIGITS.length)];
        trialStartTime = performance.now();

        const stream = document.getElementById('scroll-stream');
        if (stream) {
            stream.innerHTML = `<div class="scroll-digit">${digit}</div>`;
        }

        if (phase === 'real') {
            const bar = document.getElementById('scroll-prog-bar');
            if (bar) bar.style.width = `${Math.min(100, Math.round(((performance.now() - phaseStartTime) / REAL_DURATION_MS) * 100))}%`;
        }

        cycleTimeout = setTimeout(() => {
            recordTrial(digit);
            if (phase === 'practice') {
                if (trialCount >= PRACTICE_TRIALS) startReal(); else nextTrial();
            } else if (performance.now() - phaseStartTime >= REAL_DURATION_MS) {
                endTest();
            } else {
                nextTrial();
            }
        }, CYCLE_MS);
    }

    function recordTrial(digit) {
        if (phase !== 'real') return;
        const isTarget = digit === NO_GO_DIGIT;
        const correct = isTarget ? !responded : responded;
        const record = {
            blockNumber: blockIdx || 1,
            trialNumber: trialResults.length + 1,
            digit,
            isTarget,
            responded,
            correct,
            reactionTimeMs: responded ? Math.round(responseTime - trialStartTime) : null,
            elapsedTimeInBlockMs: Math.round(performance.now() - phaseStartTime)
        };
        trialResults.push(record);
        window.fatigueBackend?.saveSartTrial?.(record);
    }

    function startReal() {
        phase = 'real';
        trialCount = 0;
        trialResults = [];
        renderTestUI();
        nextTrial();
    }

    function endTest() {
        if (cycleTimeout) clearTimeout(cycleTimeout);
        window.onkeydown = null;
        const total = trialResults.length;
        const targets = trialResults.filter((t) => t.isTarget);
        const nonTargets = trialResults.filter((t) => !t.isTarget);
        const commissionErrors = targets.filter((t) => t.responded).length; // tapped on "3"
        const omissionErrors = nonTargets.filter((t) => !t.responded).length; // missed a non-3
        const reactionTimes = nonTargets.filter((t) => t.responded).map((t) => t.reactionTimeMs);
        const meanRt = reactionTimes.length ? Math.round(reactionTimes.reduce((a, b) => a + b, 0) / reactionTimes.length) : null;

        const summary = {
            blockNumber: blockIdx || 1,
            totalTrials: total,
            targetTrials: targets.length,
            commissionErrors,
            omissionErrors,
            meanReactionTimeMs: meanRt,
            accuracyPercent: total ? Math.round(((total - commissionErrors - omissionErrors) / total) * 100) : null
        };

        container.innerHTML = `
            <div class="scroll-test-container">
                <h3>Scrolling Test Complete</h3>
                <p>Accuracy: ${summary.accuracyPercent != null ? summary.accuracyPercent + '%' : '-'}</p>
                <button class="button primary" onclick="finishScrollTest()">Continue</button>
            </div>`;
        window.finishScrollTest = () => onComplete(summary);
    }
}

// ponytail: minimal self-check, no framework - run with `node scrollTest.js` if
// this module is ever extracted to a testable environment. Kept as a comment
// since this file runs as a classic browser script (no module exports) like
// its siblings (cognitive.js, fitts.js), so there is no bare Node entry point.
