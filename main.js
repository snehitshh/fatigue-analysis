// Global Configuration
const TOTAL_BLOCKS = 3;
const BREAK_DURATION = 120; // 2 minutes
const PHYSICAL_FATIGUE_DURATION = 720; // 12 minutes (synced with cognitive)

let currentStep = 'demographics'; 
let currentBlock = 1;

// Stores the user's choices for the entire session
let sessionBaseTask = null; // 'fitts' or 'typing'
let sessionFatigueTrack = null; // 'cognitive' or 'physical'

let sessionData = {
    demographics: {},
    blocks: [],
    startTime: null,
    endTime: null
};

const mainContent = document.getElementById('main-content');
const progressBar = document.getElementById('progress-bar');

document.addEventListener('DOMContentLoaded', function() {
    sessionData.startTime = new Date().toISOString();
    showDemographics();
});

// --- NEW: Accidental Refresh Blocker (Modern Standard) ---
window.addEventListener('beforeunload', function (e) {
    // If the experiment is officially 'complete', let them leave without a warning
    if (currentStep === 'complete') return; 

    // Modern browsers require preventDefault() to trigger the generic warning prompt
    e.preventDefault(); 
    
    // Returning a value satisfies older browsers without triggering the deprecation warning
    return ''; 
});
function updateProgress() {
    const stepName = {
        'demographics': 'Participant Info',
        'experiment-setup': 'Experiment Setup',
        'fitts': 'Fitts Tapping Test',
        'typing': 'Typing Test',
        'nasatlx': 'NASA-TLX Assessment',
        'break': 'Rest Period',
        'cognitive': 'Cognitive Battery',
        'physical': 'Physical Fatigue',
        'complete': 'Finished'
    }[currentStep] || currentStep;
    
    progressBar.textContent = `Block ${currentBlock}/${TOTAL_BLOCKS} - ${stepName}`;
}


// --- NEW: Demographics Downloader ---
function downloadDemographicsCSV(data) {
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

// 1. Demographics
function showDemographics() {
    currentStep = 'demographics';
    updateProgress();
    
    if (typeof mountDemographicsForm === "function") {
        mountDemographicsForm(mainContent, (data) => {
            sessionData.demographics = data;
            downloadDemographicsCSV(data); 
            showExperimentSetup(); 
        });
    } else {
        sessionData.demographics = { participantId: "TEST_" + Math.floor(Math.random() * 1000) };
        downloadDemographicsCSV(sessionData.demographics);
        showExperimentSetup();
    }
}

// 2. Experiment Setup (Display Random Fatigue + Choose Primary Task)
// 2. Experiment Setup (Fully Randomized Assignment)
function showExperimentSetup() {
    currentStep = 'experiment-setup';
    updateProgress();
    
    // --- NEW: FULLY RANDOM ASSIGNMENT LOGIC ---
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
    
    // Prepare the text based on what the randomizer chose
    const primaryTitle = sessionBaseTask === 'fitts' ? "Fitts' Tapping Task" : "Typing Task";
    const primaryDesc = sessionBaseTask === 'fitts' 
        ? 'You will click moving targets to measure spatial motor skills.' 
        : 'You will transcribe text to measure keyboard motor skills.';

    const fatigueTitle = sessionFatigueTrack === 'cognitive' ? "Cognitive Battery" : "Physical Exercise";
    const fatigueDesc = sessionFatigueTrack === 'cognitive' 
        ? 'You will complete Stroop & AX-CPT tests.' 
        : 'You will complete physical fatigue induction.';

    // Render the read-only UI (No clicking required, just review and continue)
    mainContent.innerHTML = `
        <div class="test-selection-container" style="max-width: 800px; margin: 0 auto; padding-top: 20px;">
            <div class="block-title" style="text-align: center;">Experiment Setup</div>
            <p style="text-align: center; color: #6b7280; margin-bottom: 30px;">
                You have been randomly assigned to the following testing protocol to prevent selection bias.
            </p>
            
            <div style="display: flex; gap: 20px; margin-bottom: 40px;">
                <div style="flex: 1; background: #eff6ff; border: 2px solid #2563eb; padding: 25px; border-radius: 8px; text-align: center;">
                    <h3 style="margin-top: 0; color: #4b5563; font-size: 1em; text-transform: uppercase; letter-spacing: 1px;">Primary Task</h3>
                    <h2 style="color: #1e3a8a; margin: 10px 0; font-size: 1.5em;">${primaryTitle}</h2>
                    <p style="color: #6b7280; margin: 0; font-size: 1em;">${primaryDesc}</p>
                </div>

                <div style="flex: 1; background: #f0fdf4; border: 2px solid #16a34a; padding: 25px; border-radius: 8px; text-align: center;">
                    <h3 style="margin-top: 0; color: #4b5563; font-size: 1em; text-transform: uppercase; letter-spacing: 1px;">Fatigue Track</h3>
                    <h2 style="color: #14532d; margin: 10px 0; font-size: 1.5em;">${fatigueTitle}</h2>
                    <p style="color: #6b7280; margin: 0; font-size: 1em;">${fatigueDesc}</p>
                </div>
            </div>

            <div style="text-align: center;">
                <button class="button primary" id="start-exp-btn" onclick="startBlock(1)" style="padding: 12px 30px; font-size: 1.1em;">
                    Begin Experiment
                </button>
            </div>
        </div>
    `;
}

// 3. Block Initialization
// 3. Block Initialization
function startBlock(blockNum) {
    if (blockNum > TOTAL_BLOCKS) {
        showCompletion();
        return;
    }

    // --- NEW: Lock Fullscreen on the very first block ---
    if (blockNum === 1) {
        const docEl = document.documentElement;
        if (docEl.requestFullscreen) {
            docEl.requestFullscreen().catch(err => console.log("Fullscreen denied:", err));
        }
    }

    currentBlock = blockNum; 
    
    sessionData.blocks[currentBlock - 1] = {
        blockNumber: currentBlock,
        startTime: new Date().toISOString(),
        fatigueType: sessionFatigueTrack,
        baseTaskType: sessionBaseTask
    };
    
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
    mountFittsTest(mainContent, (data) => {
        sessionData.blocks[currentBlock - 1].primaryData = data;
        showNASATLX();
    }, pid);
}

// 4B. Typing Route
function showTypingTest() {
    currentStep = 'typing';
    updateProgress();
    const pid = sessionData.demographics.participantId || "UNKNOWN";
    mountTypingTest(mainContent, (data) => {
        sessionData.blocks[currentBlock - 1].primaryData = data;
        showNASATLX();
    }, pid, currentBlock);
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
        mainContent.innerHTML = `
            <div class="break-container" style="text-align: center; margin-top: 50px;">
                <div class="block-title">Rest Period (${mins}:${secs.toString().padStart(2, '0')})</div>
                <p>Take a break before your ${sessionFatigueTrack === 'cognitive' ? 'Cognitive Battery' : 'Physical Exercise'}.</p>
                <button class="button primary" onclick="skipBreak()" style="margin-top: 20px;">Skip Break</button>
            </div>`;
    };

    const interval = setInterval(() => {
        timeRemaining--;
        if (timeRemaining <= 0) { 
            clearInterval(interval); 
            proceedToFatigueTest(); 
        } else renderBreak();
    }, 1000);

    window.skipBreak = () => { 
        clearInterval(interval); 
        proceedToFatigueTest(); 
    };
    renderBreak();
}

// 7. Automatic Fatigue Routing
function proceedToFatigueTest() {
    if (sessionFatigueTrack === 'cognitive') {
        showCognitiveTest();
    } else {
        showPhysicalFatigueTest();
    }
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
    
    function updateDisplay() {
        const mins = Math.floor(timeRemaining / 60);
        const secs = timeRemaining % 60;
        mainContent.innerHTML = `
            <div class="physical-test-container" style="text-align:center;">
                <div class="block-title">Physical Fatigue Exercise</div>
                <div style="font-size: 4em; font-weight: bold; margin: 20px 0;">${mins}:${secs.toString().padStart(2, '0')}</div>
                <div class="timer-controls">
                    ${!timerRunning ? 
                        '<button class="button primary" onclick="startTimer()">Start Exercise</button>' :
                        '<button class="button secondary" onclick="stopTimer()">Pause</button>'
                    }
                    <button class="button" onclick="finishPhysicalTest()" style="background:#dc2626; color:white; border:none; margin-left:10px;">Finish Early</button>
                </div>
            </div>`;
    }
    
    window.startTimer = function() {
        if (!timerRunning) {
            timerRunning = true;
            timerInterval = setInterval(() => {
                timeRemaining = Math.max(0, timeRemaining - 1);
                updateDisplay();
                if (timeRemaining <= 0) finishPhysicalTest();
            }, 1000);
            updateDisplay();
        }
    };
    
    window.stopTimer = function() {
        if (timerRunning) { clearInterval(timerInterval); timerRunning = false; updateDisplay(); }
    };
    
    window.finishPhysicalTest = function() {
        if (timerInterval) clearInterval(timerInterval);
        sessionData.blocks[currentBlock - 1].fatigueData = { completed: true };
        finishBlock();
    };
    
    updateDisplay();
}

// 9. Finish Block
function finishBlock() {
    if (currentBlock < TOTAL_BLOCKS) {
        mainContent.innerHTML = `
            <div class="completion-container" style="text-align:center;">
                <h3>Block ${currentBlock} Complete</h3>
                <button class="button primary" onclick="startBlock(${currentBlock + 1})">Begin Next Block</button>
            </div>`;
    } else {
        showCompletion();
    }
}

// 10. Master Download
function showCompletion() {
    currentStep = 'complete';
    updateProgress();
    setTimeout(() => downloadResults(), 500); // Auto download!
    mainContent.innerHTML = `
        <div class="completion-container" style="text-align:center;">
            <h3>Experiment Complete</h3>
            <p>Thank you for participating!</p>
            <button class="button primary" onclick="downloadResults()">Download Master CSV Again</button>
        </div>`;
}

function downloadResults() {
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