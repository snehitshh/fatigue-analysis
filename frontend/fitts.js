function mountFittsTest(container, onComplete, participantId, blockIdx, options) {
    // --- Test Parameters ---
    // options.startMinute lets a resumed session continue from the minute it
    // reached; options.onMinuteComplete(completedMinutes) reports progress so the
    // orchestrator can persist it for refresh recovery.
    const resumeOptions = options || {};
    const research = window.fatigueResearch || {};
    let random = Math.random;
    let completedMinutes = Number(resumeOptions.startMinute) || 0;
    const TOTAL_MINUTES_NEEDED = 10;
    let animationActive = false;
    let trialActive = false; 
    
    // Timer set back to 60 seconds (1 minute)
    const TEST_DURATION = 60 * 1000; 
    let testStartTime = 0;
    
    // --- Responsive arena (measurement-safe) ---
    // The arena is a square sized from the real rendered space available on the
    // device. Target sizes and distances below are defined against BASE_ARENA and
    // scaled by (arenaSize / BASE_ARENA). Because the Fitts index of difficulty
    // (log2(distance / size + 1)) is scale-invariant, the task difficulty stays
    // identical across devices while the rendered pixels (which we record) differ.
    const BASE_ARENA = 500;   // reference square the LEVELS were authored against
    const MAX_ARENA = 600;    // never grow larger than this on big screens
    const MIN_ARENA = 300;    // below this the test is not scientifically valid
    let arenaSize = BASE_ARENA;
    let arenaScale = 1;
    let lastInputMethod = null; // 'mouse' | 'pen' | 'touch', captured per pointer

    const COLOR_TARGET = "#107046", COLOR_TARGET_BORDER = "#03422c";
    const DIALOG_TIMEOUT = 1000;

    let paused = false, pauseOverlay = null;
    let pauseTimestamp = 0;
    let trialIdx = 0, trialData = [];
    let currentTrial = null;
    let animationFrame = null;
    let globalTimer = null;

    // Base geometry (authored against BASE_ARENA); scaled to the real arena at runtime.
    const LEVELS = {
        1: { size: 55, distance: 320 },
        2: { size: 45, distance: 280 },
        3: { size: 35, distance: 240 },
        4: { size: 28, distance: 200 },
        5: { size: 22, distance: 160 }
    };

    // Measure the real space available and pick a square arena that fits the device.
    function computeArenaSize() {
        const availWidth = (container && container.clientWidth) || window.innerWidth || BASE_ARENA;
        const availHeight = window.innerHeight || BASE_ARENA;
        // Reserve vertical room for the feedback line, progress bar, and controls.
        const usableHeight = availHeight - 210;
        const raw = Math.min(availWidth - 24, usableHeight, MAX_ARENA);
        return Math.floor(raw);
    }

    function deviceIsBigEnough() {
        return computeArenaSize() >= MIN_ARENA;
    }

    let greenTargetsClicked = 0;
    let misclickCount = 0;
    let trialStartTime = 0;
    let movementStartTime = 0;

    function showPopupNotification(msg, anchorIdOrElem) {
        let arena = typeof anchorIdOrElem === "string" ? document.getElementById(anchorIdOrElem) : anchorIdOrElem;
        if (!arena || !msg) return;
        let note = document.createElement("div");
        note.className = "fitts-popup-notification";
        note.innerHTML = msg;
        Object.assign(note.style, {
            position: "absolute", left: "50%", top: "18px", transform: "translateX(-50%)",
            zIndex: 1010, background: "#f4f6fb", color: "#14314a", border: "2.1px solid #b4d9f4",
            borderRadius: "1em", padding: "9px 23px", pointerEvents: "none"
        });
        arena.appendChild(note);
        setTimeout(() => { note.style.opacity = "0"; setTimeout(() => note.remove(), 350); }, DIALOG_TIMEOUT);
    }

    showInstructions();

    function showInstructions() {
        // Guard: the arena must render large enough for valid measurement.
        if (!deviceIsBigEnough()) {
            showTooSmallWarning();
            return;
        }

        container.innerHTML = `
            <div class="fitts-instructions">
                <div class="block-title">Fatigue Induction Test (Minute ${completedMinutes + 1})</div>
                <div class="instruction-content">
                    <p>Click the <strong>highlighted green target</strong>. The targets will jump across the circle unpredictably.</p>
                    <p>Complete as many sets as possible in <strong>1 minute</strong>.</p>
                    <button class="button primary" onclick="startFittsTest()">Start Minute</button>
                </div>
            </div>`;
        window.startFittsTest = startTest;
    }

    // Shown when the device/viewport is too small for a valid Fitts measurement.
    function showTooSmallWarning() {
        const portrait = window.innerHeight > window.innerWidth;
        container.innerHTML = `
            <div class="fitts-instructions device-warning">
                <div class="block-title">Screen Too Small for This Test</div>
                <div class="instruction-content">
                    <p>The tapping test needs a larger area to measure your movements accurately.</p>
                    <p>${portrait
                        ? 'Please <strong>rotate your device to landscape</strong> or use a larger screen, then tap retry.'
                        : 'Please use a device with a larger screen (tablet, laptop, or desktop), then tap retry.'}</p>
                    <button class="button primary" onclick="retryFittsSize()">Retry</button>
                </div>
            </div>`;
        window.retryFittsSize = showInstructions;
    }

function startTest() {
        random = research.seededRandom && resumeOptions.protocolSeed
            ? research.seededRandom(research.deriveSeed(resumeOptions.protocolSeed, `fitts-block-${blockIdx || 1}-minute-${completedMinutes + 1}`))
            : Math.random;
        testStartTime = 0; // Wait for first click
        trialIdx = 0;
        trialData = [];
        misclickCount = 0;

        // Lock the arena size for the whole minute so a mid-test resize/rotate
        // can never shift target coordinates and corrupt the measurement.
        arenaSize = Math.max(MIN_ARENA, computeArenaSize());
        arenaScale = arenaSize / BASE_ARENA;
        // Block page scrolling/zooming while a measurement is active.
        document.body.classList.add('fitts-active');

        showTestInterface();

        globalTimer = setInterval(() => {
            // NEW: Only run the timer math if NOT paused
            if (testStartTime > 0 && !paused) { 
                const elapsed = performance.now() - testStartTime;
                updateProgress(elapsed);
                if (elapsed >= TEST_DURATION) {
                    clearInterval(globalTimer);
                    globalTimer = null;
                    endTest();
                }
            }
        }, 100);

        nextTrial();
    }

    function showTestInterface() {
        container.innerHTML = `
            <div class="fitts-test-container">
                <div id="fitts-feedback">Time left: 60s</div>
                <div id="fitts-progbar"><div id="fitts-prog" style="width: 0%"></div></div>
                <div id="fitts-arena" style="position:relative; width:${arenaSize}px; height:${arenaSize}px; max-width:100%; border:1px solid #ccc; margin:auto; background: #fff; cursor: crosshair; touch-action:none; user-select:none;"></div>
                <div class="test-controls">
                    <button id="pause-btn" class="button secondary" onclick="togglePause()">Pause</button>
                    <div class="trial-info"><span id="misclick-counter">Misclicks: 0</span></div>
                </div>
            </div>`;
        window.togglePause = togglePause;
        // pointerdown (not click) so touch input is captured immediately, with no
        // 300ms delay, and so we can record the input method (mouse/pen/touch).
        document.getElementById('fitts-arena').addEventListener('pointerdown', handleArenaClick);
    }

    function handleArenaClick(event) {
        if (event.pointerType) lastInputMethod = event.pointerType;
        // Ignore non-primary mouse buttons (right/middle click).
        if (event.button && event.button !== 0) return;
        if (paused || !currentTrial || !trialActive) return;

        const rect = event.currentTarget.getBoundingClientRect();
        const clickX = event.clientX - rect.left;
        const clickY = event.clientY - rect.top;

        const targetIndex = currentTrial.sequence[currentTrial.currentIndexInSequence];
        const target = currentTrial.targets[targetIndex];

        const dist = Math.sqrt(Math.pow(clickX - target.x, 2) + Math.pow(clickY - target.y, 2));

        if (dist <= target.radius) {
            // Start the 60-second timer on the very first click
            if (testStartTime === 0) {
                testStartTime = performance.now();
                animationActive = true;
                animateTargets();
            }

            // Calculate exact Euclidean distance for Fitts' ID
            if (currentTrial.lastTarget) {
                const dx = target.x - currentTrial.lastTarget.x;
                const dy = target.y - currentTrial.lastTarget.y;
                const exactDistance = Math.sqrt(dx * dx + dy * dy);
                const moveID = Math.log2((exactDistance / currentTrial.targetSize) + 1);
                currentTrial.sumOfID += moveID;
            } else {
                // The first target is an acquisition step. Fitts movement timing
                // begins only after it has been acquired.
                movementStartTime = performance.now();
            }
            currentTrial.lastTarget = target;

            target.clicked = true;
            target.isHighlighted = false;
            greenTargetsClicked++;
            currentTrial.currentIndexInSequence++;

            // Decorative feedback only — fired AFTER the hit is fully recorded and
            // drawn on a separate fixed layer, so it never affects target size,
            // position, or timing.
            spawnFittsRipple(event.clientX, event.clientY, 'hit');

            if (currentTrial.currentIndexInSequence < currentTrial.sequence.length) {
                const nextIdx = currentTrial.sequence[currentTrial.currentIndexInSequence];
                currentTrial.targets[nextIdx].isHighlighted = true;
            } else {
                completeTrialSuccess();
                return;
            }
            renderCircularArena();
        } else {
            if (testStartTime > 0) {
                misclickCount++;
                updateMisclickCounter();
                spawnFittsRipple(event.clientX, event.clientY, 'miss'); // after the misclick is counted
            }
        }
    }

    // Brief expanding ring at the pointer location. Appended to document.body with
    // fixed positioning and pointer-events:none, so it is independent of arena
    // re-renders and can never intercept a click or change the measured geometry.
    function spawnFittsRipple(clientX, clientY, kind) {
        const ripple = document.createElement('div');
        ripple.className = `fitts-ripple ${kind}`;
        ripple.style.left = `${clientX}px`;
        ripple.style.top = `${clientY}px`;
        document.body.appendChild(ripple);
        setTimeout(() => ripple.remove(), 550);
    }

    function renderCircularArena() {
        const arena = document.getElementById('fitts-arena');
        if (!arena || !currentTrial) return;
        arena.innerHTML = ""; 
        currentTrial.targets.forEach(target => {
            const el = document.createElement('div');
            Object.assign(el.style, {
                position: 'absolute', width: `${target.radius * 2}px`, height: `${target.radius * 2}px`,
                left: `${target.x - target.radius}px`, top: `${target.y - target.radius}px`,
                borderRadius: '50%', background: target.isHighlighted ? COLOR_TARGET : "#d1d5db",
                opacity: target.isHighlighted ? "1.0" : "0.15", pointerEvents: 'none',
                border: target.isHighlighted ? `2px solid ${COLOR_TARGET_BORDER}` : 'none'
            });
            arena.appendChild(el);
        });
    }

    function nextTrial() {
        initializeTrial();
        trialActive = true; 
        trialStartTime = performance.now();
        movementStartTime = 0;
        
        if (!animationActive && testStartTime > 0) {
            animationActive = true;
            animateTargets();
        }
    }

    function initializeTrial() {
        greenTargetsClicked = 0;
        misclickCount = 0;
        
        const randomLevel = Math.floor(random() * 5) + 1;
        const config = LEVELS[randomLevel];
        // Scale the authored geometry to the real rendered arena. Ratio (and thus
        // the Fitts index of difficulty) is preserved; only absolute pixels change.
        const renderedSize = config.size * arenaScale;
        const renderedDistance = config.distance * arenaScale;
        const numTargets = 11;
        const centerX = arenaSize / 2, centerY = arenaSize / 2;
        const circleRadius = renderedDistance / 2;
        const targets = [];

        for (let i = 0; i < numTargets; i++) {
            const angle = (i * (360 / numTargets) - 90) * (Math.PI / 180);
            targets.push({ id: i, x: centerX + Math.cos(angle) * circleRadius, y: centerY + Math.sin(angle) * circleRadius, radius: renderedSize / 2, isHighlighted: false });
        }

        // --- Smart random jumps with short-term memory (Crash-Proof) ---
        let sequence = [];
        let currentIdx = Math.floor(random() * numTargets);
        sequence.push(currentIdx);

        for (let i = 1; i < numTargets; i++) {
            const possibleJumps = [4, 5, 6, 7]; // Large sweeping jumps
            let validNextTargets = [];

            // Test each possible jump
            for (let jump of possibleJumps) {
                let candidateIdx = (currentIdx + jump) % numTargets;
                let recentlyVisited = sequence.slice(-3); // Get up to the last 3 targets visited
                
                if (!recentlyVisited.includes(candidateIdx)) {
                    validNextTargets.push(candidateIdx);
                }
            }

            // Failsafe to guarantee it never freezes
            if (validNextTargets.length === 0) {
                currentIdx = (currentIdx + 5) % numTargets; 
            } else {
                currentIdx = validNextTargets[Math.floor(random() * validNextTargets.length)];
            }
            
            sequence.push(currentIdx);
        }

        targets[sequence[0]].isHighlighted = true;
        
        currentTrial = {
            targets,
            sequence,
            currentIndexInSequence: 0,
            level: randomLevel,
            // Rendered (actual) pixel geometry — keeps the Fitts ID math consistent
            // with the coordinates the participant actually saw and clicked.
            targetSize: renderedSize,
            targetDistance: renderedDistance,
            sumOfID: 0,
            lastTarget: null
        };
        
        renderCircularArena();
    }

    function animateTargets() {
        if (!animationActive || paused || !currentTrial) return;
        const elapsed = testStartTime > 0 ? performance.now() - testStartTime : 0;
        const remaining = Math.max(0, Math.ceil((TEST_DURATION - elapsed) / 1000));
        const fb = document.getElementById('fitts-feedback');
        if (fb) fb.textContent = `Time left: ${remaining}s - Target ${currentTrial.currentIndexInSequence + 1}/11`;
        
        if (elapsed < TEST_DURATION) {
            animationFrame = requestAnimationFrame(animateTargets);
        }
    }

    function updateProgress(elapsed) {
        const prog = document.getElementById('fitts-prog');
        if (prog) prog.style.width = `${Math.min(100, (elapsed / TEST_DURATION) * 100)}%`;
    }

    function updateMisclickCounter() {
        const counterElement = document.getElementById('misclick-counter');
        if (counterElement) counterElement.textContent = `Misclicks: ${misclickCount}`;
    }

    function handleHardStop(reason) {
        animationActive = false;
        trialActive = false;
        currentTrial = null;
        if (animationFrame) cancelAnimationFrame(animationFrame);
        showPopupNotification(reason, document.getElementById('fitts-arena'));
        setTimeout(() => { endTest(); }, 1200);
    }

    function completeTrialSuccess() {
        trialActive = false; 
        const totalTime = movementStartTime ? performance.now() - movementStartTime : 0;
        recordTrial(true, totalTime, 11);
        showPopupNotification("Set Complete!", document.getElementById('fitts-arena'));
        trialIdx++;
        
        setTimeout(() => { 
            if (testStartTime > 0 && (performance.now() - testStartTime) < TEST_DURATION) {
                nextTrial(); 
            }
        }, 150);
    }

  function recordTrial(success, time, clickedCount) {
        if (clickedCount <= 1) return; 
        const metrics = research.calculateFittsMetrics
            ? research.calculateFittsMetrics({ sumOfId: currentTrial.sumOfID, movementTimeMs: time, clicks: clickedCount, misclicks: misclickCount })
            : null;
        if (!metrics) return;
        
        // 3. Exact Elapsed Time in Block (Tracks micro-fatigue within the 60s)
        const elapsedTimeInBlock = Math.round(performance.now() - testStartTime);

        const minuteNumber = completedMinutes + 1;
        const trialInMinute = trialIdx + 1;
        const trialRecord = {
            participantId,
            block: blockIdx || 1,
            minuteSet: minuteNumber,
            trialInBlock: trialInMinute,
            difficultyLevel: currentTrial.level,
            indexOfDifficulty: metrics.avgIndexOfDifficulty,
            targetsClicked: clickedCount,
            misclicks: misclickCount,
            totalTime_ms: time.toFixed(2),
            throughput_bps: metrics.throughputBps,
            avgMovementTime_ms: metrics.avgMovementTimeMs,
            errorRate_percent: metrics.errorRatePercent,
            elapsedTimeInBlock_ms: elapsedTimeInBlock, // NEW
            success,
            timestampReadable: new Date().toISOString() // NEW: Clean, readable timestamp
        };

        trialData.push(trialRecord);
        window.fatigueBackend?.saveFittsTrial?.({
            blockNumber: blockIdx || 1,
            minuteNumber,
            trialInMinute,
            difficultyLevel: currentTrial.level,
            targetSizePx: Number(currentTrial.targetSize.toFixed(2)),
            targetDistancePx: Number(currentTrial.targetDistance.toFixed(2)),
            renderedArenaWidthPx: arenaSize,
            renderedArenaHeightPx: arenaSize,
            inputMethod: lastInputMethod,
            avgIndexOfDifficulty: metrics.avgIndexOfDifficulty,
            targetsClicked: clickedCount,
            misclicks: misclickCount,
            totalTimeMs: Number(time.toFixed(2)),
            throughputBps: metrics.throughputBps,
            avgMovementTimeMs: metrics.avgMovementTimeMs,
            errorRatePercent: metrics.errorRatePercent,
            elapsedTimeInBlockMs: elapsedTimeInBlock,
            success
        });
    }

    function endTest() {
        animationActive = false;
        trialActive = false;
        document.body.classList.remove('fitts-active');
        if (globalTimer) { clearInterval(globalTimer); globalTimer = null; }
        if (animationFrame) { cancelAnimationFrame(animationFrame); animationFrame = null; }
        
        const arena = document.getElementById('fitts-arena');
        if (arena) arena.innerHTML = "";

        // Save whatever progress they made if the timer ran out mid-set
        if (greenTargetsClicked > 1 && currentTrial) {
            const timeSpent = movementStartTime ? performance.now() - movementStartTime : 0;
            recordTrial(false, timeSpent, greenTargetsClicked);
        }

        completedMinutes++;
        if (typeof resumeOptions.onMinuteComplete === 'function') {
            resumeOptions.onMinuteComplete(completedMinutes);
        }
        downloadCSV(trialData, `block_1_minute_${completedMinutes}`);
        trialData = [];

        if (completedMinutes < TOTAL_MINUTES_NEEDED) {
            showNextSetScreen();
        } else {
            showResults();
        }
    }

    function showNextSetScreen() {
        const saveMessage = window.fatigueBackend?.isDatabaseMode?.()
            ? 'Data saved to Supabase. Take a breath.'
            : 'Data downloaded. Take a breath.';
        container.innerHTML = `
            <div class="fitts-results">
                <div class="block-title">Minute ${completedMinutes}/${TOTAL_MINUTES_NEEDED} Complete</div>
                <p>${saveMessage}</p>
                <button class="button primary" onclick="startNextMinute()">Start Next Minute</button>
            </div>`;
        window.startNextMinute = () => {
            animationActive = false; trialActive = false; testStartTime = 0; trialIdx = 0; misclickCount = 0;
            startTest();
        };
    }

    function showResults() {
        container.innerHTML = `
            <div class="fitts-results">
                <div class="block-title">Tapping Test Complete</div>
                <button class="button primary" id="fitts-finish-link">Continue to Assessment</button>
            </div>`;
        document.getElementById('fitts-finish-link').onclick = () => {
            onComplete({ status: "success", sets: completedMinutes });
        };
    }

function downloadCSV(data, fileName) {
        if (window.fatigueBackend?.isDatabaseMode?.()) return;
        if (!data.length) return;
        
        // --- NEW: Refined Research Headers ---
        const headers = "participantId,block,minuteSet,trialInSet,difficultyLevel,avgIndexOfDifficulty,targetsClicked,misclicks,totalTime_ms,throughput_bps,avg_MT_ms,error_rate_%,elapsed_time_in_block_ms,success,timestamp_readable";
        
        const rows = data.map(r => 
            `${r.participantId},${r.block},${r.minuteSet},${r.trialInBlock},${r.difficultyLevel},${r.indexOfDifficulty},${r.targetsClicked},${r.misclicks},${r.totalTime_ms},${r.throughput_bps},${r.avgMovementTime_ms},${r.errorRate_percent},${r.elapsedTimeInBlock_ms},${r.success},${r.timestampReadable}`
        ).join("\n");
        
        const blob = new Blob([headers + "\n" + rows], { type: "text/csv" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        
        // --- NEW: Precise Academic File Naming ---
        // Example output: "102206023_fitts_minute_1.csv"
        const pid = data[0].participantId || participantId || "UNKNOWN";
        a.download = `${pid}_fitts_block_${blockIdx || 1}_minute_${completedMinutes}.csv`;
        
        // Safe trigger and memory cleanup
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(a.href);
    }

 function togglePause() {
        if (paused) {
            // -- RESUME LOGIC --
            paused = false;
            if (pauseOverlay) pauseOverlay.remove();
            
            // NEW: Time Shift Logic
            // Shift the start times forward by however long they were paused
            if (testStartTime > 0) {
                const timeSpentPaused = performance.now() - pauseTimestamp;
                testStartTime += timeSpentPaused;  // Fixes the 60s progress bar
                trialStartTime += timeSpentPaused; // Protects the Fitts' throughput math
                if (movementStartTime) movementStartTime += timeSpentPaused;
            }

            if (currentTrial) animateTargets();
        } else {
            // -- PAUSE LOGIC --
            paused = true;
            pauseTimestamp = performance.now(); // NEW: Record exact moment of pause

            if (animationFrame) cancelAnimationFrame(animationFrame);
            const arena = document.getElementById('fitts-arena');
            pauseOverlay = document.createElement('div');
            pauseOverlay.className = 'fitts-pause-overlay';
            Object.assign(pauseOverlay.style, { position: 'absolute', top: '0', left: '0', width: '100%', height: '100%', background: 'rgba(255,255,255,0.94)', zIndex: 1000, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' });
            pauseOverlay.innerHTML = `
                <div style="font-weight:700; color:#294c90; font-size:1.15em; margin-bottom:14px;">Test Paused</div>
                <button class="button primary" onclick="togglePause()">Resume</button>`;
            arena.appendChild(pauseOverlay);
        }
    }
}
