// Pure validator (no DOM). Returns null if valid, else a human-readable error.
function validateDemographics(data) {
    const email = String(data.email || '').trim();
    if (!email) return 'Please enter your email address.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'Please enter a valid email address.';
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
            <div class="block-title">Register to take part</div>
            <p class="form-intro">We'll issue you a participant ID automatically. Your email is used only to
                issue that ID and prevent duplicate participation &mdash; it is stored separately from your
                research responses.</p>
            <form id="demographics-form" novalidate>
                <div class="form-group">
                    <label for="email">Email:</label>
                    <input type="email" id="email" name="email"
                           inputmode="email" autocomplete="email" autocapitalize="off"
                           maxlength="120" placeholder="you@example.com" required>
                    <small class="field-hint">Used to issue your participant ID and avoid duplicate sign-ups.</small>
                </div>

                <div class="form-group">
                    <label for="full-name">Full name <span class="field-hint">(optional)</span>:</label>
                    <input type="text" id="full-name" name="fullName"
                           inputmode="text" autocomplete="name" maxlength="120" placeholder="Optional">
                </div>

                <div class="form-group">
                    <label for="phone">Phone <span class="field-hint">(optional)</span>:</label>
                    <input type="tel" id="phone" name="phone"
                           inputmode="tel" autocomplete="tel" maxlength="40" placeholder="Optional">
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
