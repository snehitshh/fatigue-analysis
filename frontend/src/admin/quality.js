// Pure go/no-go flag for a session-quality row (from research_session_quality).
// Tunable thresholds in one place. Unit-tested.
const MIN_ATTENTIVE = 70;   // avg attentive % below this -> review
const MAX_SWITCHES = 3;     // app-switches above this -> review

export function qualityFlag(row) {
    if (!row || !row.completed) return { level: "bad", label: "Incomplete" };
    const switches = Number(row.total_app_switches) || 0;
    const att = row.avg_attentive_pct;
    if (switches > MAX_SWITCHES) return { level: "warn", label: `Review — left app ${switches}×` };
    if (att != null && Number(att) < MIN_ATTENTIVE) return { level: "warn", label: `Review — attention ${att}%` };
    return { level: "good", label: "Good" };
}
