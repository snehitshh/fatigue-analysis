function mountFatigueScale(container, context, onComplete) {
    const research = window.fatigueResearch || {};
    const stage = context && context.stage === 'post_block' ? 'post_block' : 'pre_block';
    const blockNumber = context && context.blockNumber != null ? Number(context.blockNumber) : 1;
    const heading = stage === 'pre_block' ? 'Current alertness before the block' : 'Current alertness after the block';
    const labels = Array.from({ length: 9 }, (_, index) => {
        const score = index + 1;
        return { score, label: research.kssLabel ? research.kssLabel(score) : String(score) };
    });

    container.innerHTML = `
        <section class="fatigue-rating card-screen screen-enter" aria-labelledby="kss-title">
            <div class="rating-context">Block ${blockNumber} · ${stage === 'pre_block' ? 'Before tasks' : 'After tasks'}</div>
            <h2 id="kss-title">${heading}</h2>
            <p class="rating-instruction">Choose the statement that best describes how alert or sleepy you feel right now.</p>
            <div class="kss-scale" role="radiogroup" aria-label="Current sleepiness from 1 to 9">
                ${labels.map(({ score, label }) => `
                    <label class="kss-option">
                        <input type="radio" name="kss-score" value="${score}">
                        <span class="kss-number">${score}</span>
                        <span class="kss-label">${label}</span>
                    </label>`).join('')}
            </div>
            <div id="kss-error" class="form-error" role="alert" hidden>Please choose one response.</div>
            <button class="button primary rating-submit" id="kss-submit" type="button">Record and continue</button>
        </section>`;

    document.getElementById('kss-submit').addEventListener('click', () => {
        const selected = container.querySelector('input[name="kss-score"]:checked');
        const score = research.validateKss ? research.validateKss(selected && selected.value) : Number(selected && selected.value);
        if (!score) {
            document.getElementById('kss-error').hidden = false;
            return;
        }
        onComplete({
            blockNumber,
            stage,
            score,
            label: research.kssLabel ? research.kssLabel(score) : String(score),
            recordedAt: new Date().toISOString()
        });
    });
}
