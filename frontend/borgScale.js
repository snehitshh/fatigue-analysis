// Borg CR10 perceived-exertion scale. Mirrors the KSS component (fatigueScale.js)
// and reuses its .kss-* styles. 0 = nothing at all, 10 = maximal.
function mountBorgScale(container, context, onComplete) {
    const blockNumber = Number(context && context.blockNumber) || 1;
    const stage = (context && context.stage) || 'post_block';
    const LABELS = ['Nothing at all', 'Very light', 'Light', 'Moderate', 'Somewhat hard',
        'Hard', 'Hard+', 'Very hard', 'Very hard+', 'Near maximal', 'Maximal'];

    container.innerHTML = `
        <section class="fatigue-rating card-screen screen-enter" aria-labelledby="borg-title">
            <div class="rating-context">Block ${blockNumber} · Perceived exertion</div>
            <h2 id="borg-title">How hard did that feel?</h2>
            <p class="rating-instruction">Borg CR10: rate the effort/exertion you just felt. 0 = nothing at all, 10 = maximal.</p>
            <div class="kss-scale" role="radiogroup" aria-label="Borg CR10 from 0 to 10">
                ${LABELS.map((label, score) => `
                    <label class="kss-option">
                        <input type="radio" name="borg-score" value="${score}">
                        <span class="kss-number">${score}</span>
                        <span class="kss-label">${label}</span>
                    </label>`).join('')}
            </div>
            <div id="borg-error" class="form-error" role="alert" hidden>Please choose one response.</div>
            <button class="button primary rating-submit" id="borg-submit" type="button">Record and continue</button>
        </section>`;

    document.getElementById('borg-submit').addEventListener('click', () => {
        const selected = container.querySelector('input[name="borg-score"]:checked');
        if (!selected) { document.getElementById('borg-error').hidden = false; return; }
        const score = Number(selected.value);
        onComplete({ blockNumber, stage, score, label: LABELS[score], recordedAt: new Date().toISOString() });
    });
}
