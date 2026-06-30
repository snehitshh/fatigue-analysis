function mountCognitiveTest(container, onComplete, blockIdx, participantId, options) {
    const research = window.fatigueResearch || {};
    const random = research.seededRandom && options && options.protocolSeed
        ? research.seededRandom(research.deriveSeed(options.protocolSeed, `cognitive-block-${blockIdx || 1}`))
        : Math.random;
    window.toggleCognitivePause = () => {
        if (isPaused) {
            // --- RESUME LOGIC ---
            isPaused = false;
            if (pauseOverlay) pauseOverlay.remove();
            
            const timeSpentPaused = performance.now() - pauseTimestamp;
            
            // 1. Shift the global phase timer forward so the 2.5 min block doesn't end early
            if (phaseStartTime > 0) phaseStartTime += timeSpentPaused;
            
            // 2. Restart the main progress bar interval
            startPhaseTimer(PHASES[currentPhaseIdx].duration);

            // 3. Handle the exact state the user paused in
            if (resumePendingTrial) {
                // If they paused during the tiny 150ms gap between words
                resumePendingTrial = false;
                nextTrial();
            } else if (awaitingResponse) {
                // If they paused while a word was actively on screen
                trialStartTime += timeSpentPaused; // Protects the Reaction Time math!
                // Recreate the timeout with ONLY the time they had left
                trialTimeout = setTimeout(() => handleResponse(null, true), trialRemainingTime);
            }

        } else {
            // --- PAUSE LOGIC ---
            isPaused = true;
            pauseTimestamp = performance.now();
            
            // 1. Stop the main progress bar
            if (phaseTimer) clearInterval(phaseTimer);
            
            // 2. Stop the 3000ms timeout if waiting for a click
            if (awaitingResponse) {
                if (trialTimeout) clearTimeout(trialTimeout);
                // Calculate exactly how much time they had left to answer
                trialRemainingTime = Math.max(0, STIMULUS_TIMEOUT - (pauseTimestamp - trialStartTime));
            }

            // 3. Create a fullscreen overlay to hide the test (prevents cheating while paused)
            pauseOverlay = document.createElement('div');
            Object.assign(pauseOverlay.style, { 
                position: 'fixed', top: '0', left: '0', width: '100vw', height: '100vh', 
                background: 'rgba(255,255,255,0.98)', zIndex: '9999', 
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' 
            });
            pauseOverlay.innerHTML = `
                <h2 style="color: #374151; font-family: 'Inter', sans-serif; margin-bottom: 20px;">Test Paused</h2>
                <button class="button primary" onclick="toggleCognitivePause()" style="font-size: 1.2em; padding: 12px 30px;">Resume</button>
            `;
            document.body.appendChild(pauseOverlay);
        }
    };

    // --- NEW: SKIP LOGIC ---
    window.skipCognitivePhase = () => {
        // 1. Destroy all running timers immediately
        if (phaseTimer) clearInterval(phaseTimer);
        if (trialTimeout) clearTimeout(trialTimeout);
        
        // 2. Clear the pause state (in case they click skip while paused)
        if (isPaused) {
            isPaused = false;
            if (pauseOverlay) pauseOverlay.remove();
        }

        // 3. Advance the index
        currentPhaseIdx++;

        // 4. Route them to the next phase or end the test
        if (currentPhaseIdx >= PHASES.length) {
            endTest();
        } else {
            startPhase(currentPhaseIdx); 
        }
    };

    // --- Configuration ---
    const PHASE_TIME = 150 * 1000;       // Real test duration (2.5 mins)
    const BREAK_TIME = 30 * 1000;        // Real break duration (30 secs)
    
    // NEW: Practice Phase Durations
    const PRACTICE_STROOP_TIME = 15 * 1000; 
    const PRACTICE_AXCPT_TIME = 20 * 1000;  
    const GET_READY_TIME = 5 * 1000;     // Short pause before the real test starts
    
    const STIMULUS_TIMEOUT = 3000; 

    const COLORS = [
        { name: 'red', label: 'Red', key: 'R', bg: 'linear-gradient(90deg,#fd5042 60%,#c3241d 100%)', color: '#fff', css: '#d62e14' },
        { name: 'blue', label: 'Blue', key: 'B', bg: 'linear-gradient(90deg,#227af3 50%,#223994 100%)', color: '#fff', css: '#2264d9' },
        { name: 'green', label: 'Green', key: 'G', bg: 'linear-gradient(90deg,#23cb75 40%,#188652 120%)', color: '#fff', css: '#169f4f' },
        { name: 'yellow', label: 'Yellow', key: 'Y', bg: 'linear-gradient(90deg,#ffd945 40%,#ffb420 120%)', color: '#333', css: '#ebbb18', textShadow: '0 1px 6px #fff4a399' },
    ];

    const AXCPT_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'X', 'Y', 'Z'];

    // --- Modern Centered UI with Feedback Pop-ups ---
    if (!window.__cognitiveStyles) {
        const style = document.createElement('style');
        style.textContent = `
            .cognitive-test-container { display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 60vh; text-align: center; font-family: 'Inter', sans-serif; }
            /* No transition on the stimulus: it must appear instantly so reaction
               time is measured from true stimulus availability, not from the end
               of a fade-in. Feedback (the popFade tick/cross below) animates only
               after the response is captured. */
            .cognitive-stimulus { font-size: 6em; font-weight: 800; margin: 20px 0; min-height: 150px; display: flex; align-items: center; justify-content: center; position: relative; }
            .feedback-overlay { position: absolute; font-size: 0.7em; top: -40px; pointer-events: none; animation: popFade 0.5s ease-out forwards; }
            @keyframes popFade { 0% { transform: scale(0.5); opacity: 0; } 50% { transform: scale(1.2); opacity: 1; } 100% { transform: scale(1); opacity: 0; transform: translateY(-30px); } }
            .axcpt-box { border: 5px solid #374151; padding: 20px; border-radius: 15px; background: #f9fafb; width: 120px; height: 120px; display: flex; align-items: center; justify-content: center; }
            .cog-btn-row { display: flex; gap: 20px; margin-top: 30px; }
            .cognitive-progbar-outer { width: 100%; max-width: 500px; height: 12px; background: #e5e7eb; border-radius: 6px; margin: 20px 0; overflow: hidden; }
            #cognitive-prog-bar { height: 100%; background: #3b82f6; width: 0%; transition: width 0.1s linear; }
            .practice-badge { background: #f59e0b; color: white; padding: 4px 12px; border-radius: 12px; font-weight: bold; font-size: 0.9em; margin-bottom: 10px; letter-spacing: 1px; }
        `;
        document.head.appendChild(style);
        window.__cognitiveStyles = true;
    }

    // NEW: Added Practice phases at the beginning
    const PHASES = [
        { type: 'stroop', label: 'Practice: Stroop Test', isPractice: true, duration: PRACTICE_STROOP_TIME },
        { type: 'axcpt',  label: 'Practice: AX-CPT', isPractice: true, duration: PRACTICE_AXCPT_TIME },
        { type: 'break',  label: 'Practice Complete - Get Ready!', isPractice: true, duration: GET_READY_TIME },
        
        { type: 'stroop', label: 'Stroop Test (Part 1)', isPractice: false, duration: PHASE_TIME },
        { type: 'break',  label: 'Rest Period', isPractice: false, duration: BREAK_TIME },
        { type: 'axcpt',  label: 'AX-CPT (Part 1)', isPractice: false, duration: PHASE_TIME },
        { type: 'break',  label: 'Rest Period', isPractice: false, duration: BREAK_TIME },
        { type: 'stroop', label: 'Stroop Test (Part 2)', isPractice: false, duration: PHASE_TIME },
        { type: 'break',  label: 'Rest Period', isPractice: false, duration: BREAK_TIME },
        { type: 'axcpt',  label: 'AX-CPT (Part 2)', isPractice: false, duration: PHASE_TIME },
        { type: 'break',  label: 'Rest Period', isPractice: false, duration: BREAK_TIME }
    ];

    let currentPhaseIdx = 0, phaseStartTime = 0, batteryStartTime = 0, trialStartTime = 0, trialResults = [];
    let awaitingResponse = false, trialTimeout = null, phaseTimer = null, lastAxcptCue = null;

    let isPaused = false, pauseTimestamp = 0, pauseOverlay = null;
    let trialRemainingTime = 0, resumePendingTrial = false;

    function showInstructions() {
        container.innerHTML = `
            <div class="cognitive-test-container">
                <h2 class="block-title">Cognitive Battery</h2>
                <p>You will complete two tasks: a Color-Word test and a Letter Memory test.</p>
                <p><strong>Don't worry, you will have a short practice round first to learn the controls!</strong></p>
                <button class="button primary" onclick="startBattery()">Start Practice</button>
            </div>`;
        window.startBattery = () => {
            batteryStartTime = performance.now();
            startPhase(0);
        };
    }

    function startPhase(idx) {
        if (idx >= PHASES.length) { endTest(); return; }
        if (trialTimeout) { clearTimeout(trialTimeout); trialTimeout = null; }
        awaitingResponse = false;
        currentPhaseIdx = idx;
        const phase = PHASES[idx];
        phaseStartTime = performance.now();
        if (phase.type === 'axcpt') lastAxcptCue = null;
        
        if (phase.type === 'break') {
            renderBreakUI(phase);
        } else {
            renderTestUI(phase);
            nextTrial();
        }
        startPhaseTimer(phase.duration);
    }

    function renderTestUI(phase) {
        const badgeHTML = phase.isPractice ? `<div class="practice-badge">PRACTICE MODE (NOT SCORED)</div>` : '';
        const pauseBtn = `<button onclick="toggleCognitivePause()" style="position: absolute; top: 15px; right: 20px; background: #f3f4f6; border: 1px solid #d1d5db; padding: 6px 12px; border-radius: 6px; cursor: pointer; font-weight: 600; color: #374151; z-index: 10;">⏸ Pause</button>`;
        const skipBtn = `<button onclick="skipCognitivePhase()" style="position: absolute; top: 15px; right: 105px; background: #fee2e2; border: 1px solid #fca5a5; padding: 6px 12px; border-radius: 6px; cursor: pointer; font-weight: 600; color: #991b1b; z-index: 10;">⏭ Skip</button>`;

        container.innerHTML = `
            <div class="cognitive-test-container" style="position: relative; width: 100%;">
                ${skipBtn}
                ${pauseBtn}
                ${badgeHTML}
                <h3>${phase.label}</h3>
                <div class="cognitive-progbar-outer"><div id="cognitive-prog-bar"></div></div>
                
                <div id="phase-timer-text" style="font-weight:700; color:#1e40af; font-size:1.4em; margin-bottom:15px;">
                    Time Remaining: ${phase.duration / 1000}s
                </div>

                <div id="cognitive-feedback" style="font-weight:600; color:#6b7280; margin-bottom:10px;">
                    ${phase.type === 'stroop' ? 'Click the font color, NOT the word!' : 'Target is X ONLY after A. Everything else is Non-Target.'}
                </div>
                <div class="cognitive-stimulus" id="cog-stimulus"></div>
                <div class="cog-btn-row" id="cog-btns"></div>
            </div>`;
    }

    function renderBreakUI(phase) {
        const pauseBtn = `<button onclick="toggleCognitivePause()" style="position: absolute; top: 15px; right: 20px; background: #f3f4f6; border: 1px solid #d1d5db; padding: 6px 12px; border-radius: 6px; cursor: pointer; font-weight: 600; color: #374151; z-index: 10;">⏸ Pause</button>`;
        const skipBtn = `<button onclick="skipCognitivePhase()" style="position: absolute; top: 15px; right: 105px; background: #fee2e2; border: 1px solid #fca5a5; padding: 6px 12px; border-radius: 6px; cursor: pointer; font-weight: 600; color: #991b1b; z-index: 10;">⏭ Skip</button>`;
        
        container.innerHTML = `
            <div class="cognitive-test-container" style="position: relative; width: 100%;">
                ${skipBtn}
                ${pauseBtn}
                <h3>${phase.label}</h3>
                <div id="break-timer" style="font-size: 5em; font-weight: 800;">${phase.duration / 1000}</div>
                <p>${phase.isPractice ? 'The real test is about to begin. Your data will now be recorded.' : 'Relax your eyes before the next part begins.'}</p>
            </div>`;
    }

    function startPhaseTimer(duration) {
        if (phaseTimer) clearInterval(phaseTimer);
        phaseTimer = setInterval(() => {
            const elapsed = performance.now() - phaseStartTime;
            const remaining = Math.max(0, Math.ceil((duration - elapsed) / 1000));
            
            const pb = document.getElementById('cognitive-prog-bar');
            if (pb) pb.style.width = `${(elapsed / duration) * 100}%`;
            
            const timerText = document.getElementById('phase-timer-text');
            if (timerText) timerText.textContent = `Time Remaining: ${remaining}s`;
            
            const bt = document.getElementById('break-timer');
            if (bt) bt.textContent = remaining;

            if (elapsed >= duration) {
                clearInterval(phaseTimer);
                startPhase(currentPhaseIdx + 1);
            }
        }, 100);
    }

    function nextTrial() {
        if (isPaused) {
            resumePendingTrial = true;
            return;
        }
        const phase = PHASES[currentPhaseIdx];
        const stimDiv = document.getElementById('cog-stimulus');
        const btnArea = document.getElementById('cog-btns');
        if (!stimDiv || !btnArea) return;

        stimDiv.style.opacity = "1";
        awaitingResponse = true;
        trialStartTime = performance.now();

        if (phase.type === 'stroop') {
            const generated = research.createStroopTrial
                ? research.createStroopTrial(random)
                : { condition: 'incongruent', word: 'red', color: 'blue', correctResponse: 'B' };
            const word = COLORS.find((item) => item.name === generated.word) || COLORS[0];
            const color = COLORS.find((item) => item.name === generated.color) || COLORS[1];
            stimDiv.textContent = word.label.toUpperCase();
            stimDiv.style.color = color.css;
            stimDiv.dataset.correct = generated.correctResponse;
            stimDiv.dataset.condition = generated.condition;
            stimDiv.dataset.stimulusRecord = `${word.name}|ink=${color.name}|condition=${generated.condition}`;
            btnArea.innerHTML = COLORS.map(c => `<button class="cog-btn" style="background:${c.bg}; color:white" onclick="handleResponse('${c.key}')">${c.label}</button>`).join('');
        } else {
            const generated = research.createAxcptTrial
                ? research.createAxcptTrial(lastAxcptCue, random)
                : { stimulus: 'B', correctResponse: 'N' };
            const char = generated.stimulus;
            
            stimDiv.innerHTML = `<div class="axcpt-box">${char}</div>`;
            stimDiv.style.color = "#1f2937";
            stimDiv.dataset.correct = generated.correctResponse;
            stimDiv.dataset.condition = generated.correctResponse === 'M' ? 'target' : 'non_target';
            stimDiv.dataset.stimulusRecord = `${char}|previous=${lastAxcptCue || 'none'}|condition=${stimDiv.dataset.condition}`;
            btnArea.innerHTML = `<button class="cog-btn" style="background:#10b981; color:white;" onclick="handleResponse('M')">Target (M)</button>
                                 <button class="cog-btn" style="background:#ef4444; color:white;" onclick="handleResponse('N')">Non-Target (N)</button>`;
            lastAxcptCue = char;
        }
        trialTimeout = setTimeout(() => handleResponse(null, true), STIMULUS_TIMEOUT);
    }

    window.handleResponse = (response, isTimeout = false) => {
        if (!awaitingResponse) return;
        awaitingResponse = false;
        if (trialTimeout) clearTimeout(trialTimeout);

        const phase = PHASES[currentPhaseIdx];
        const stimDiv = document.getElementById('cog-stimulus');
        const correctResponse = stimDiv.dataset.correct;
        const stimulusText = stimDiv.dataset.stimulusRecord || stimDiv.textContent.trim();
        const isCorrect = !isTimeout && (response === correctResponse);
        
        // --- REAL-TIME FEEDBACK POP-UP ---
        const feedback = document.createElement('div');
        feedback.className = 'feedback-overlay';
        feedback.innerHTML = isCorrect ? '<span style="color:#10b981">✓</span>' : '<span style="color:#ef4444">✗</span>';
        stimDiv.appendChild(feedback);

        // NEW: Record standardized metrics for non-practice rounds
        if (!phase.isPractice) {
            // Safely grab participantId (falls back to global session data if needed)
            const pid = typeof participantId !== 'undefined' ? participantId : (window.participantId || "UNKNOWN");
            const reactionTimeMs = isTimeout ? STIMULUS_TIMEOUT : (performance.now() - trialStartTime);
            const elapsedTimeInPhaseMs = Math.round(performance.now() - phaseStartTime);
            const elapsedTimeInBatteryMs = Math.round(performance.now() - batteryStartTime);
            const trialRecord = {
                participantId: pid,
                block: blockIdx || 1,
                testType: phase.type,   // e.g., 'stroop' or 'axcpt'
                phase: phase.label,     // e.g., 'Stroop Test (Part 1)'
                trialNumber: trialResults.length + 1,
                stimulus: stimulusText,
                correctResponse,
                participantResponse: isTimeout ? null : response,
                correct: isCorrect,
                timeout: Boolean(isTimeout),
                rt: reactionTimeMs,
                elapsedTimeInPhase_ms: elapsedTimeInPhaseMs,
                elapsedTimeInBlock_ms: elapsedTimeInBatteryMs,
                timestampReadable: new Date().toISOString() // READABLE TIME
            };

            trialResults.push(trialRecord);
            window.fatigueBackend?.saveCognitiveTrial?.({
                blockNumber: blockIdx || 1,
                testType: phase.type,
                phaseLabel: phase.label,
                trialNumber: trialRecord.trialNumber,
                stimulus: stimulusText,
                correctResponse,
                participantResponse: trialRecord.participantResponse,
                correct: isCorrect,
                isTimeout: Boolean(isTimeout),
                reactionTimeMs,
                elapsedTimeInPhaseMs,
                elapsedTimeInBlockMs: elapsedTimeInBatteryMs
            });
        }
        
        stimDiv.style.opacity = "0.2";
        setTimeout(() => { if (PHASES[currentPhaseIdx].type !== 'break') nextTrial(); }, 150);
    };

    function endTest() {
        if (phaseTimer) clearInterval(phaseTimer);
        downloadCSV();
        onComplete({ results: trialResults });
    }

    function downloadCSV() {
        if (window.fatigueBackend?.isDatabaseMode?.()) return;
        if (trialResults.length === 0) return;
        
        // 1. Standardized Research Headers
        const headers = "participantId,block,testType,phase,stimulus,correctResponse,participantResponse,correct,timeout,reactionTime_ms,elapsed_time_in_phase_ms,elapsed_time_in_battery_ms,timestamp_readable";
        
        // 2. Map data exactly to the headers
        const rows = trialResults.map(r => 
            `${r.participantId},${r.block},${r.testType},"${r.phase}","${String(r.stimulus).replace(/"/g, '""')}",${r.correctResponse},${r.participantResponse || ''},${r.correct},${r.timeout},${r.rt.toFixed(2)},${r.elapsedTimeInPhase_ms},${r.elapsedTimeInBlock_ms},"${r.timestampReadable}"`
        ).join("\n");
        
        const blob = new Blob([headers + "\n" + rows], { type: 'text/csv' });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);

        // 3. Precise Academic Naming Format
        const pid = trialResults[0].participantId || "UNKNOWN";
        const blockNum = trialResults[0].block || 1;
        a.download = `${pid}_cognitive_battery_block_${blockNum}.csv`;
        
        // 4. Safe trigger and memory cleanup
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(a.href);
    }

    showInstructions();
}
