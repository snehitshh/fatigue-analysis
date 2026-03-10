function mountTypingTest(container, onComplete, participantId, blockIdx) {
    let completedMinutes = 0;
    const TOTAL_MINUTES_NEEDED = 10; 
    const TEST_DURATION = 60 * 1000; // 60 seconds
    
    let testStartTime = 0;
    let globalTimer = null;
    let logs = [];

    // Typing specific state
    let currentKeyTimestamps = [];
    let backspaceCounter = 0;
    let sentenceStartTime = 0;
    let currentSentenceIndex = 0;
    let currentTestSentences = [];
    let testIsActive = false;

    // Fallback corpus just in case
    let allCorpusSentences = [
        "The quick brown fox jumps over the lazy dog.",
        "Technology has revolutionized the way we communicate and work."
    ];

    // Load your custom corpus.txt
    fetch('corpus.txt')
        .then(res => res.ok ? res.text() : Promise.reject('Failed to load corpus'))
        .then(text => {
            const lines = text.split('\n').map(s => s.trim()).filter(s => s.length > 0);
            if (lines.length > 0) allCorpusSentences = lines;
        })
        .catch(err => console.warn("Using fallback corpus."));

    function showInstructions() {
        container.innerHTML = `
            <div class="fitts-instructions">
                <div class="block-title">Typing Test (Minute ${completedMinutes + 1}/${TOTAL_MINUTES_NEEDED})</div>
                <div class="instruction-content">
                    <p>Type the provided text exactly as it appears.</p>
                    <p>Press the <strong>ENTER</strong> key to submit the sentence and move to the next one.</p>
                    <p>The 1-minute timer will start as soon as you type the first letter.</p>
                    <button class="button primary" onclick="startTypingTest()">Start Minute</button>
                </div>
            </div>`;
        window.startTypingTest = startTest;
    }

    function startTest() {
        testStartTime = 0; 
        currentTestSentences = [...allCorpusSentences].sort(() => 0.5 - Math.random());
        currentSentenceIndex = 0;
        logs = [];
        showTestInterface();
    }

    function showTestInterface() {
        container.innerHTML = `
            <div class="typing-test-container" style="max-width: 700px; margin: 0 auto; text-align: left;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                    <div id="typing-feedback" style="font-weight: bold; font-size: 1.2em; color: #1e40af;">Time left: 60s</div>
                    <div id="typing-block-counter" style="font-weight: bold; font-size: 1.1em; color: #374151;">Minute: ${completedMinutes + 1}/${TOTAL_MINUTES_NEEDED}</div>
                </div>
                
                <div id="typing-progbar" style="width: 100%; height: 10px; background: #e5e7eb; border-radius: 5px; margin-bottom: 20px;">
                    <div id="typing-prog" style="height: 100%; width: 0%; background: #2563eb; border-radius: 5px;"></div>
                </div>

                <div id="typing-text-display" style="background: #f3f4f6; padding: 20px; border-radius: 8px; font-size: 1.3em; color: #374151; margin-bottom: 10px; line-height: 1.5; user-select: none;">
                    Loading...
                </div>

                <div id="typing-status" style="height: 20px; margin-bottom: 10px; font-weight: 500; font-size: 0.9em;"></div>

                <textarea id="typing-input" placeholder="Type here and press ENTER..." style="width: 100%; height: 120px; padding: 15px; font-size: 1.2em; border: 2px solid #d1d5db; border-radius: 8px; resize: none;"></textarea>
            </div>`;

        const inputField = document.getElementById('typing-input');
        testIsActive = true;
        displayNextSentence();
        inputField.focus();

        // Handle ENTER key to move to the next sentence
        inputField.addEventListener('keydown', (e) => {
            if (!testIsActive) return;

            if (e.key === 'Enter') {
                e.preventDefault(); // Stop it from making a new line
                submitSentence();
                return;
            }

            // Anti-cheat (prevent arrows/jumping around)
            const navKeys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'];
            if (navKeys.includes(e.key)) e.preventDefault();
            
            // Track metrics
            if (currentKeyTimestamps.length === 0 && inputField.value.length === 0) {
                sentenceStartTime = performance.now();
            }
            currentKeyTimestamps.push(performance.now());
            if (e.key === 'Backspace') backspaceCounter++;
        });

        // Handle the 60-second Timer
        inputField.addEventListener('input', (e) => {
            if (testStartTime === 0) {
                testStartTime = performance.now();
                globalTimer = setInterval(() => {
                    const elapsed = performance.now() - testStartTime;
                    updateProgress(elapsed);
                    if (elapsed >= TEST_DURATION) {
                        clearInterval(globalTimer);
                        endTest();
                    }
                }, 100);
            }
        });
        
        // Lock cursor to the end
        const forceCursorToEnd = () => {
            setTimeout(() => { inputField.selectionStart = inputField.selectionEnd = inputField.value.length; }, 0);
        };
        inputField.addEventListener('click', forceCursorToEnd);
    }

    function displayNextSentence() {
        if (currentSentenceIndex >= currentTestSentences.length) {
            currentTestSentences = [...allCorpusSentences].sort(() => 0.5 - Math.random());
            currentSentenceIndex = 0;
        }
        document.getElementById('typing-text-display').innerText = currentTestSentences[currentSentenceIndex];
        document.getElementById('typing-input').value = '';
        
        currentKeyTimestamps = [];
        backspaceCounter = 0;
        sentenceStartTime = performance.now();
    }

function submitSentence() {
        const inputField = document.getElementById('typing-input');
        const typedText = inputField.value.trim();
        const originalSentence = currentTestSentences[currentSentenceIndex].trim();

        if (typedText === "") {
            const status = document.getElementById('typing-status');
            status.innerText = "Please type something before pressing Enter!";
            status.style.color = "#dc2626";
            setTimeout(() => { status.innerText = ""; }, 2000);
            return;
        }

        const metrics = calculateMetrics(originalSentence, typedText, currentKeyTimestamps, backspaceCounter, sentenceStartTime);
        
        // --- NEW: Calculate exact elapsed time within the 1-minute block ---
        const elapsedTimeInBlock = Math.round(performance.now() - testStartTime);

        logs.push({
            participantId: participantId,
            block: blockIdx || 1,
            minuteSet: completedMinutes + 1,
            sentenceNumber: currentSentenceIndex + 1,
            originalSentence: originalSentence,
            typedText: typedText,
            wpm: metrics.wpm,
            errorDistance: metrics.errorDistance,
            errorPercentage: metrics.errorPercentage,
            iki: metrics.iki,
            kspc: metrics.kspc,
            backspaceCount: metrics.backspaceCount,
            durationMs: Math.round(performance.now() - sentenceStartTime),
            elapsedTimeInBlock_ms: elapsedTimeInBlock, // FATIGUE METRIC
            timestampReadable: new Date().toISOString()
        });

        currentSentenceIndex++;
        
        const status = document.getElementById('typing-status');
        status.innerText = "✓ Sentence Saved!";
        status.style.color = "#16a34a";
        setTimeout(() => { if(status.innerText.includes("Saved")) status.innerText = ""; }, 1000);
        
        displayNextSentence();
    }

    function updateProgress(elapsed) {
        const prog = document.getElementById('typing-prog');
        if (prog) prog.style.width = `${Math.min(100, (elapsed / TEST_DURATION) * 100)}%`;
        
        const remaining = Math.max(0, Math.ceil((TEST_DURATION - elapsed) / 1000));
        const fb = document.getElementById('typing-feedback');
        if (fb) fb.textContent = `Time left: ${remaining}s`;
    }

    function endTest() {
        testIsActive = false;
        document.getElementById('typing-input').disabled = true;

        // If they were halfway through typing a sentence when the timer rang, save it!
        const typedText = document.getElementById('typing-input').value.trim();
        if (typedText.length > 0) {
            submitSentence(); 
        }

        completedMinutes++;
        downloadCSV(logs, `typing_block_${blockIdx || 1}_minute_${completedMinutes}`);
        logs = []; 

        if (completedMinutes < TOTAL_MINUTES_NEEDED) {
            showNextSetScreen();
        } else {
            showResults();
        }
    }

    function showNextSetScreen() {
        container.innerHTML = `
            <div class="fitts-results" style="text-align: center;">
                <div class="block-title">Minute ${completedMinutes}/${TOTAL_MINUTES_NEEDED} Complete</div>
                <p>Data downloaded. Take a breath and shake out your hands.</p>
                <button class="button primary" onclick="startNextMinute()">Start Next Minute</button>
            </div>`;
        window.startNextMinute = startTest;
    }

    function showResults() {
        container.innerHTML = `
            <div class="fitts-results" style="text-align: center;">
                <div class="block-title">Typing Test Complete</div>
                <button class="button primary" id="typing-finish-link">Continue to Assessment</button>
            </div>`;
        document.getElementById('typing-finish-link').onclick = () => {
            onComplete({ status: "success", type: "typing" });
        };
    }

function downloadCSV(data, fileName) {
        if (!data.length) return;
        
        // --- NEW: Refined Research Headers ---
        const headers = "participantId,block,minuteSet,sentenceNumber,originalSentence,typedText,wpm,errorDistance,errorPercentage,iki,kspc,backspaceCount,durationMs,elapsed_time_in_block_ms,timestamp_readable";
        
        const rows = data.map(r => 
            // Note: Strings are wrapped in quotes to prevent commas in sentences from breaking the columns
            `"${r.participantId}",${r.block},${r.minuteSet},${r.sentenceNumber},"${r.originalSentence.replace(/"/g, '""')}","${r.typedText.replace(/"/g, '""')}",${r.wpm},${r.errorDistance},${r.errorPercentage},${r.iki},${r.kspc},${r.backspaceCount},${r.durationMs},${r.elapsedTimeInBlock_ms},"${r.timestampReadable}"`
        ).join("\n");
        
        const blob = new Blob([headers + "\n" + rows], { type: "text/csv" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);

        // --- NEW: Precise Academic File Naming ---
        // Example output: "102206023_typing_minute_1.csv"
        const pid = data[0].participantId || participantId || "UNKNOWN";
        const minSet = data[0].minuteSet || 1;
        a.download = `${pid}_typing_minute_${minSet}.csv`;
        
        // Safe trigger and memory cleanup
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(a.href);
    }
    
    // --- Core Metrics Engine ---
    function calculateMetrics(original, typed, keyTimestamps, backspaces, startMs) {
        let wpm = 0, errorDistance = 0, errorPercentage = 0, iki = 0, kspc = 0;
        const currentTime = performance.now();
        const durationInSeconds = (startMs > 0 && currentTime > startMs) ? (currentTime - startMs) / 1000 : 0;

        const keyboardLayout = {
           '!': [0, 0], 1: [0, 0],2: [1, 0], 3: [2, 0], 4: [3, 0], 5: [4, 0], 6: [5, 0], 7: [6, 0], 8: [7, 0], '(': [8, 0], ')': [9, 0],'-': [10, 0],
            q: [1, 1], w: [2, 1], e: [3, 1], r: [4, 1], t: [5, 1], y: [6, 1], u: [7, 1], i: [8, 1], o: [9, 1], p: [10, 1],
            a: [1, 2], s: [2, 2], d: [3, 2], f: [4, 2], g: [5, 2], h: [6, 2], j: [7, 2], k: [8, 2], l: [9, 2],':': [10, 2],';': [10, 2],"'": [11, 2],
            z: [2, 3], x: [3, 3], c: [4, 3], v: [5, 3], b: [6, 3], n: [7, 3], m: [8, 3],",": [9, 3], '.': [10, 3],'/': [11, 3],'?': [11, 3],
            ' ': [4,4]
        };

        const THEORETICAL_MAX_KEY_DISTANCE = Math.sqrt((9 - 0) ** 2 + (3 - 0) ** 2);

        function getKeyDistance(c1, c2) {
            const p1 = keyboardLayout[c1.toLowerCase()];
            const p2 = keyboardLayout[c2.toLowerCase()];
            if (!p1 || !p2) return THEORETICAL_MAX_KEY_DISTANCE;
            return Math.sqrt((p2[0] - p1[0]) ** 2 + (p2[1] - p1[1]) ** 2);
        }

        const minLength = Math.min(original.length, typed.length);
        for (let i = 0; i < minLength; i++) {
            if (original[i] !== typed[i]) { 
                errorDistance += getKeyDistance(original[i], typed[i]);
            }
        }

        const charLengthDifference = Math.abs(original.length - typed.length);
        if (original.length > 0) {
            errorDistance += charLengthDifference * THEORETICAL_MAX_KEY_DISTANCE;
        } else if (typed.length > 0) {
            errorDistance += typed.length * THEORETICAL_MAX_KEY_DISTANCE;
        }

        const MAX_PENALTY_PER_CHAR = THEORETICAL_MAX_KEY_DISTANCE;
        const totalPossiblePenalty = original.length * MAX_PENALTY_PER_CHAR;

        if (totalPossiblePenalty > 0) {
            errorPercentage = Math.min((errorDistance / totalPossiblePenalty) * 100, 100);
        } else {
            errorPercentage = typed.length > 0 ? 100 : 0;
        }

        const typedWords = typed.split(/\s+/).filter(word => word.length > 0);
        const durationInMinutes = durationInSeconds / 60;
        wpm = durationInMinutes > (1 / 60) ? Math.round(typedWords.length / durationInMinutes) : 0;

        if (keyTimestamps.length > 1) {
            let totalIki = 0;
            for (let i = 1; i < keyTimestamps.length; i++) {
                totalIki += (keyTimestamps[i] - keyTimestamps[i - 1]);
            }
            iki = Math.round(totalIki / (keyTimestamps.length - 1));
        } else {
            iki = 0;
        }

        let correctCharsTyped = 0;
        for (let i = 0; i < Math.min(original.length, typed.length); i++) {
            if (original[i] === typed[i]) correctCharsTyped++;
        }
        const totalKeystrokes = keyTimestamps.length;

        if (correctCharsTyped > 0) {
            kspc = totalKeystrokes / correctCharsTyped;
        } else if (totalKeystrokes > 0) {
            kspc = totalKeystrokes;
        } else {
            kspc = 0;
        }

        return {
            wpm: wpm,
            errorDistance: errorDistance.toFixed(2),
            errorPercentage: errorPercentage.toFixed(2),
            iki: iki,
            kspc: kspc.toFixed(2),
            backspaceCount: backspaces
        };
    }

    showInstructions();
}