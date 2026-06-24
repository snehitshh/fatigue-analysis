// Pure validator (no DOM). Returns null if valid, else a human-readable error.
function validateDemographics(data) {
    const id = String(data.participantId || '').trim();
    if (!id) return 'Please enter your participant ID.';
    if (!/^[A-Za-z0-9_-]{2,40}$/.test(id)) {
        return 'Participant ID must be 2-40 characters: letters, numbers, hyphen or underscore.';
    }
    const age = Number.parseInt(data.age, 10);
    if (!Number.isFinite(age) || age < 16 || age > 100) {
        return 'Please enter an age between 16 and 100.';
    }
    for (const [field, label] of [['gender', 'gender'], ['inputDevice', 'input device'], ['dominantHand', 'dominant hand'], ['eyeCorrection', 'eye correction']]) {
        if (!data[field]) return `Please select your ${label}.`;
    }
    return null;
}

function mountDemographicsForm(container, onComplete) {
    container.innerHTML = `
        <div class="demographics-container screen-enter">
            <div class="block-title">Participant Demographics</div>
            <p class="form-intro">Please fill in your details. This information is stored under a participant code only.</p>
            <form id="demographics-form" novalidate>
                <div class="form-group">
                    <label for="participant-id">Participant ID:</label>
                    <input type="text" id="participant-id" name="participantId"
                           inputmode="text" autocomplete="off" autocapitalize="characters"
                           maxlength="40" placeholder="e.g. P017 or your assigned code" required>
                    <small class="field-hint">2&ndash;40 characters: letters, numbers, hyphen or underscore.</small>
                </div>

                <div class="form-group">
                    <label for="age">Age:</label>
                    <input type="number" id="age" name="age" min="16" max="100" inputmode="numeric" required>
                </div>

                <div class="form-group">
                    <label for="gender">Gender:</label>
                    <select id="gender" name="gender" required>
                        <option value="">Select...</option>
                        <option value="male">Male</option>
                        <option value="female">Female</option>
                        <option value="non-binary">Non-binary</option>
                        <option value="prefer-not-to-say">Prefer not to say</option>
                    </select>
                </div>

                <div class="form-group">
                    <label for="input-device">Primary Input Device:</label>
                    <select id="input-device" name="inputDevice" required>
                        <option value="">Select...</option>
                        <option value="mouse">Mouse</option>
                        <option value="trackpad">Trackpad</option>
                        <option value="touchscreen">Touchscreen</option>
                        <option value="other">Other</option>
                    </select>
                </div>

                <div class="form-group">
                    <label for="dominant-hand">Dominant Hand:</label>
                    <select id="dominant-hand" name="dominantHand" required>
                        <option value="">Select...</option>
                        <option value="right">Right</option>
                        <option value="left">Left</option>
                        <option value="ambidextrous">Ambidextrous</option>
                    </select>
                </div>

                <div class="form-group">
                    <label for="eye-correction">Eye Correction:</label>
                    <select id="eye-correction" name="eyeCorrection" required>
                        <option value="">Select...</option>
                        <option value="normal">Normal vision</option>
                        <option value="corrected-glasses">Corrected (Glasses)</option>
                        <option value="corrected-contacts">Corrected (Contact lenses)</option>
                        <option value="uncorrected">Uncorrected vision problems</option>
                    </select>
                </div>

                <div id="demographics-error" class="form-error" role="alert" hidden></div>

                <button type="submit" class="button primary">Begin Test Session</button>
            </form>
        </div>
    `;

    const form = document.getElementById('demographics-form');
    const errorBox = document.getElementById('demographics-error');

    function showError(message) {
        errorBox.textContent = message;
        errorBox.hidden = false;
    }

    function clearError() {
        errorBox.textContent = '';
        errorBox.hidden = true;
    }

    form.addEventListener('submit', function (e) {
        e.preventDefault();
        clearError();

        const formData = new FormData(form);
        const demographics = {};
        for (let [key, value] of formData.entries()) {
            demographics[key] = typeof value === 'string' ? value.trim() : value;
        }

        const error = validateDemographics(demographics);
        if (error) {
            showError(error);
            return;
        }

        onComplete(demographics);
    });
}
