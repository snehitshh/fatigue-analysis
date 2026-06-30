const round = (value, digits = 2) => Number(Number(value).toFixed(digits));

export function calculateFittsMetrics({ sumOfId, movementTimeMs, clicks, misclicks = 0 }) {
    const movementCount = Number(clicks) - 1;
    const duration = Number(movementTimeMs);
    if (movementCount < 1 || !Number.isFinite(duration) || duration <= 0) return null;

    const totalId = Number(sumOfId) || 0;
    const misses = Math.max(0, Number(misclicks) || 0);
    const attempts = Number(clicks) + misses;
    return {
        movementCount,
        avgIndexOfDifficulty: round(totalId / movementCount, 4),
        throughputBps: round(totalId / (duration / 1000), 4),
        avgMovementTimeMs: round(duration / movementCount, 2),
        errorRatePercent: attempts > 0 ? round((misses / attempts) * 100, 2) : 0
    };
}

if (typeof window !== "undefined") {
    window.fatigueResearch = { ...(window.fatigueResearch || {}), calculateFittsMetrics };
}
