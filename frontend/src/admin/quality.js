// Pure go/no-go flag for a session-quality row (from research_session_quality).
// Tunable thresholds in one place. Unit-tested.
const MAX_SWITCHES = 3;     // app-switches above this -> review

export function qualityFlag(row) {
    if (!row || !row.completed) return { level: "bad", label: "Incomplete" };
    const switches = Number(row.total_app_switches) || 0;
    if (switches > MAX_SWITCHES) return { level: "warn", label: `Review — left app ${switches}×` };
    return { level: "good", label: "Complete" };
}
