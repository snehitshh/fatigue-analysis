const round = (value, digits = 2) => Number(Number(value).toFixed(digits));

export function levenshteinDistance(left, right) {
    const a = String(left || "");
    const b = String(right || "");
    const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
    for (let i = 1; i <= a.length; i++) {
        let diagonal = previous[0];
        previous[0] = i;
        for (let j = 1; j <= b.length; j++) {
            const above = previous[j];
            previous[j] = a[i - 1] === b[j - 1]
                ? diagonal
                : Math.min(diagonal, previous[j - 1], above) + 1;
            diagonal = above;
        }
    }
    return previous[b.length];
}

export function calculateTypingMetrics({ original, typed, keyTimestamps = [], backspaces = 0, durationMs = 0 }) {
    const source = String(original || "");
    const output = String(typed || "");
    const durationMinutes = Number(durationMs) / 60000;
    const errorDistance = levenshteinDistance(source, output);
    let iki = 0;
    if (keyTimestamps.length > 1) {
        const span = Number(keyTimestamps[keyTimestamps.length - 1]) - Number(keyTimestamps[0]);
        iki = span > 0 ? round(span / (keyTimestamps.length - 1), 2) : 0;
    }
    return {
        wpm: durationMinutes > 0 ? round((output.length / 5) / durationMinutes, 2) : 0,
        errorDistance,
        errorPercentage: source.length > 0 ? round((errorDistance / source.length) * 100, 2) : (output.length ? 100 : 0),
        iki,
        kspc: output.length > 0 ? round(keyTimestamps.length / output.length, 2) : 0,
        backspaceCount: Math.max(0, Number(backspaces) || 0)
    };
}

if (typeof window !== "undefined") {
    window.fatigueResearch = { ...(window.fatigueResearch || {}), levenshteinDistance, calculateTypingMetrics };
}
