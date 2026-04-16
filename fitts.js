function mountFittsTest(container, onComplete, participantId) {
    // --- Test Parameters ---
    let completedMinutes = 0;
    const TOTAL_MINUTES_NEEDED = 10; 
    let animationActive = false;
    let trialActive = false; 
    
    // Timer set back to 60 seconds (1 minute)
    const TEST_DURATION = 60 * 1000; 
    let testStartTime = 0;
    
    const ARENA_W = 700, ARENA_H = 500;
    const MAX_MISCLICKS = 3;
    const COLOR_TARGET = "#107046", COLOR_TARGET_BORDER = "#03422c";
    const DIALOG_TIMEOUT = 1000;

    let paused = false, pauseOverlay = null;
    let pauseTimestamp = 0;
    let trialIdx = 0, trialData = [];
    let currentTrial = null;
    let animationFrame = null;
    let globalTimer = null;

    const LEVELS = {
        1: { size: 55, distance: 320 },
        2: { size: 45, distance: 280 },
        3: { size: 35, distance: 240 },
        4: { size: 28, distance: 200 },
        5: { size: 22, distance: 160 }
    };

    let greenTargetsClicked = 0;
    let misclickCount = 0;
    let trialStartTime = 0;

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

function startTest() {
        testStartTime = 0; // Wait for first click
        trialIdx = 0;
        trialData = [];
        misclickCount = 0;
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
                <div id="fitts-arena" style="position:relative; width:${ARENA_W}px; height:${ARENA_H}px; border:1px solid #ccc; margin:auto; background: #fff; cursor: crosshair;"></div>
                <div class="test-controls">
                    <button id="pause-btn" class="button secondary" onclick="togglePause()">Pause</button>
                    <div class="trial-info"><span id="misclick-counter">Misclicks: 0/${MAX_MISCLICKS}</span></div>
                </div>
            </div>`;
        window.togglePause = togglePause;
        document.getElementById('fitts-arena').addEventListener('click', handleArenaClick);
    }

    function handleArenaClick(event) {
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
            }
            currentTrial.lastTarget = target;

            target.clicked = true;
            target.isHighlighted = false;
            greenTargetsClicked++;
            currentTrial.currentIndexInSequence++;

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
                if (misclickCount > MAX_MISCLICKS) {
                    handleHardStop("Limit Exceeded!");
                }
            }
        }
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
        
        if (!animationActive && testStartTime > 0) {
            animationActive = true;
            animateTargets();
        }
    }

    function initializeTrial() {
        greenTargetsClicked = 0;
        misclickCount = 0;
        
        const randomLevel = Math.floor(Math.random() * 5) + 1;
        const config = LEVELS[randomLevel];
        const numTargets = 11;
        const centerX = ARENA_W / 2, centerY = ARENA_H / 2;
        const circleRadius = config.distance / 2;
        const targets = [];

        for (let i = 0; i < numTargets; i++) {
            const angle = (i * (360 / numTargets) - 90) * (Math.PI / 180);
            targets.push({ id: i, x: centerX + Math.cos(angle) * circleRadius, y: centerY + Math.sin(angle) * circleRadius, radius: config.size / 2, isHighlighted: false });
        }

        // --- Smart random jumps with short-term memory (Crash-Proof) ---
        let sequence = [];
        let currentIdx = Math.floor(Math.random() * numTargets); 
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
                currentIdx = validNextTargets[Math.floor(Math.random() * validNextTargets.length)];
            }
            
            sequence.push(currentIdx);
        }

        targets[sequence[0]].isHighlighted = true;
        
        currentTrial = { 
            targets, 
            sequence, 
            currentIndexInSequence: 0, 
            level: randomLevel, 
            targetSize: config.size, 
            targetDistance: config.distance,
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
        if (counterElement) counterElement.textContent = `Misclicks: ${misclickCount}/${MAX_MISCLICKS}`;
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
        const totalTime = performance.now() - trialStartTime;
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

        const totalID = currentTrial.sumOfID;
        const moves = clickedCount - 1; 
        const avgID = (totalID / moves).toFixed(4);
        const throughput = (totalID / (time / 1000)).toFixed(4);

        // --- NEW: Fatigue Metrics ---
        // 1. Average Movement Time (Gets slower with physical fatigue)
        const avgMovementTime = (time / clickedCount).toFixed(2);
        
        // 2. Error Rate Percentage (Increases with cognitive/attention fatigue)
        const totalAttempts = clickedCount + misclickCount;
        const errorRate = totalAttempts > 0 ? ((misclickCount / totalAttempts) * 100).toFixed(2) : 0;
        
        // 3. Exact Elapsed Time in Block (Tracks micro-fatigue within the 60s)
        const elapsedTimeInBlock = Math.round(performance.now() - testStartTime);

        trialData.push({ 
            participantId, 
            block: completedMinutes + 1, // Dynamically tags which minute they are in
            trialInBlock: trialIdx + 1, 
            difficultyLevel: currentTrial.level, 
            indexOfDifficulty: avgID, 
            targetsClicked: clickedCount,
            misclicks: misclickCount, 
            totalTime_ms: time.toFixed(2), 
            throughput_bps: throughput, 
            avgMovementTime_ms: avgMovementTime,       // NEW
            errorRate_percent: errorRate,              // NEW
            elapsedTimeInBlock_ms: elapsedTimeInBlock, // NEW
            success, 
            timestampReadable: new Date().toISOString() // NEW: Clean, readable timestamp
        });
    }

    function endTest() {
        animationActive = false;
        trialActive = false;
        if (globalTimer) { clearInterval(globalTimer); globalTimer = null; }
        if (animationFrame) { cancelAnimationFrame(animationFrame); animationFrame = null; }
        
        const arena = document.getElementById('fitts-arena');
        if (arena) arena.innerHTML = "";

        // Save whatever progress they made if the timer ran out mid-set
        if (greenTargetsClicked > 1 && currentTrial) {
            const timeSpent = performance.now() - trialStartTime;
            recordTrial(false, timeSpent, greenTargetsClicked);
        }

        completedMinutes++;
        downloadCSV(trialData, `block_1_minute_${completedMinutes}`);
        trialData = []; 

        if (completedMinutes < TOTAL_MINUTES_NEEDED) {
            showNextSetScreen();
        } else {
            showResults();
        }
    }

    function showNextSetScreen() {
        container.innerHTML = `
            <div class="fitts-results">
                <div class="block-title">Minute ${completedMinutes}/${TOTAL_MINUTES_NEEDED} Complete</div>
                <p>Data downloaded. Take a breath.</p>
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
        if (!data.length) return;
        
        // --- NEW: Refined Research Headers ---
        const headers = "participantId,block,trialInSet,difficultyLevel,avgIndexOfDifficulty,targetsClicked,misclicks,totalTime_ms,throughput_bps,avg_MT_ms,error_rate_%,elapsed_time_in_block_ms,success,timestamp_readable";
        
        const rows = data.map(r => 
            `${r.participantId},${r.block},${r.trialInBlock},${r.difficultyLevel},${r.indexOfDifficulty},${r.targetsClicked},${r.misclicks},${r.totalTime_ms},${r.throughput_bps},${r.avgMovementTime_ms},${r.errorRate_percent},${r.elapsedTimeInBlock_ms},${r.success},${r.timestampReadable}`
        ).join("\n");
        
        const blob = new Blob([headers + "\n" + rows], { type: "text/csv" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        
        // --- NEW: Precise Academic File Naming ---
        // Example output: "102206023_fitts_minute_1.csv"
        const pid = data[0].participantId || participantId || "UNKNOWN";
        a.download = `${pid}_fitts_minute_${completedMinutes}.csv`;
        
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
            }

            if (currentTrial) animateTargets();
        } else {
            // -- PAUSE LOGIC --
            paused = true;
            pauseTimestamp = performance.now(); // NEW: Record exact moment of pause

            if (animationFrame) cancelAnimationFrame(animationFrame);
            const arena = document.getElementById('fitts-arena');
            pauseOverlay = document.createElement('div');
            Object.assign(pauseOverlay.style, { position: 'absolute', top: '0', left: '0', width: '100%', height: '100%', background: 'rgba(255,255,255,0.9)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' });
            pauseOverlay.innerHTML = `<button class="button primary" onclick="togglePause()">Resume</button>`;
            arena.appendChild(pauseOverlay);
        }
    }
}