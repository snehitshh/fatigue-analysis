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

// 1. Demographics
function showDemographics() {
    currentStep = 'demographics';
    updateProgress();
    
    if (typeof mountDemographicsForm === "function") {
        mountDemographicsForm(mainContent, (data) => {
            sessionData.demographics = data;
            showExperimentSetup(); 
        });
    } else {
        sessionData.demographics = { participantId: "TEST_" + Math.floor(Math.random() * 1000) };
        showExperimentSetup();
    }
}

// 2. NEW: Experiment Setup Screen (Only shown once!)
// 2. Experiment Setup (Choose Primary Task ONLY)
// 2. Experiment Setup (Display Random Fatigue + Choose Primary Task)
function showExperimentSetup() {
    currentStep = 'experiment-setup';
    updateProgress();
    
    // --- RANDOM ASSIGNMENT LOGIC ---
    // 50% chance for cognitive, 50% chance for physical
    sessionFatigueTrack = Math.random() < 0.5 ? 'cognitive' : 'physical';
    
    // Prepare the text based on what the randomizer chose
    const fatigueTitle = sessionFatigueTrack === 'cognitive' ? 'Cognitive Battery' : 'Physical Exercise';
    const fatigueDesc = sessionFatigueTrack === 'cognitive' 
        ? 'You will complete Stroop & AX-CPT tests.' 
        : 'You will complete physical fatigue induction.';

    mainContent.innerHTML = `
        <div class="test-selection-container" style="max-width: 800px; margin: 0 auto; padding-top: 20px;">
            <div class="block-title" style="text-align: center;">Experiment Setup</div>
            
            <div style="background: #f8fafc; border: 2px dashed #94a3b8; padding: 25px; border-radius: 8px; margin-bottom: 30px; text-align: center;">
                <h3 style="margin-top: 0; color: #4b5563; font-size: 1.1em; text-transform: uppercase; letter-spacing: 1px;">Assigned Fatigue Track</h3>
                <h2 style="color: #2563eb; margin: 10px 0; font-size: 1.8em;">${fatigueTitle}</h2>
                <p style="color: #6b7280; margin: 0; font-size: 1.1em;">${fatigueDesc}</p>
            </div>

            <div style="margin-bottom: 40px;">
                <h3 style="margin-bottom: 15px;">Now, Select Your Primary Task:</h3>
                <div style="display: flex; gap: 20px;">
                    <div class="test-card" id="card-fitts" onclick="selectBase('fitts')" style="flex: 1; cursor: pointer; border: 2px solid #e5e7eb; padding: 20px; border-radius: 8px;">
                        <h4 style="margin:0 0 10px 0; color: #1f2937;">Fitts' Tapping Task</h4>
                        <p style="font-size: 0.9em; margin:0; color: #6b7280;">Click moving targets on the screen.</p>
                    </div>
                    <div class="test-card" id="card-typing" onclick="selectBase('typing')" style="flex: 1; cursor: pointer; border: 2px solid #e5e7eb; padding: 20px; border-radius: 8px;">
                        <h4 style="margin:0 0 10px 0; color: #1f2937;">Typing Task</h4>
                        <p style="font-size: 0.9em; margin:0; color: #6b7280;">Transcribe text quickly and accurately.</p>
                    </div>
                </div>
            </div>

            <div style="text-align: center;">
                <button class="button primary" id="start-exp-btn" disabled onclick="startBlock(1)" style="padding: 12px 30px; font-size: 1.1em; opacity: 0.5;">
                    Begin Experiment
                </button>
            </div>
        </div>
    `;

    // Handle the Fitts vs Typing selection
    window.selectBase = function(type) {
        sessionBaseTask = type;
        
        // Update UI visuals
        document.getElementById('card-fitts').style.borderColor = type === 'fitts' ? '#2563eb' : '#e5e7eb';
        document.getElementById('card-fitts').style.backgroundColor = type === 'fitts' ? '#eff6ff' : 'white';
        document.getElementById('card-typing').style.borderColor = type === 'typing' ? '#2563eb' : '#e5e7eb';
        document.getElementById('card-typing').style.backgroundColor = type === 'typing' ? '#eff6ff' : 'white';
        
        // Enable the Begin button
        const btn = document.getElementById('start-exp-btn');
        btn.disabled = false;
        btn.style.opacity = '1';
    };
}

// 3. Block Initialization
function startBlock(blockNum) {
    if (blockNum > TOTAL_BLOCKS) {
        showCompletion();
        return;
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
function showNASATLX() {
    currentStep = 'nasatlx';
    updateProgress();
    mountNASATLX(mainContent, (data) => {
        sessionData.blocks[currentBlock - 1].nasatlxData = data;
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
function showCognitiveTest() {
    currentStep = 'cognitive';
    updateProgress();
    mountCognitiveTest(mainContent, (data) => {
        sessionData.blocks[currentBlock - 1].fatigueData = data;
        finishBlock();
    }, currentBlock);
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
    const blob = new Blob([rows.join('\\n')], { type: 'text/csv' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `master_data_${sessionData.demographics.participantId}.csv`;
    link.click();
}