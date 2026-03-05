function mountDemographicsForm(container, onComplete) {
    container.innerHTML = `
        <div class="demographics-container">
            <div class="block-title">Participant Demographics</div>
            <form id="demographics-form">
                <div class="form-group">
                    <label for="participant-id">Participant ID:</label>
                    <input type="text" id="participant-id" name="participantId" required>
                </div>
                
                <div class="form-group">
                    <label for="age">Age:</label>
                    <input type="number" id="age" name="age" min="16" max="100" required>
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
                
                <button type="submit" class="button primary">Begin Test Session</button>
            </form>
        </div>
    `;
    
    const form = document.getElementById('demographics-form');
    form.addEventListener('submit', function(e) {
        e.preventDefault();
        
        const formData = new FormData(form);
        const demographics = {};
        for (let [key, value] of formData.entries()) {
            demographics[key] = value;
        }
        
        onComplete(demographics);
    });
}
