const COLORS = ["red", "blue", "green", "yellow"];
const DISTRACTORS = ["B", "D", "E", "F", "G", "H", "K", "M", "P", "R", "Y", "Z"];

const pick = (items, random) => items[Math.min(items.length - 1, Math.floor(random() * items.length))];

export function createStroopTrial(random = Math.random) {
    const condition = random() < 0.5 ? "congruent" : "incongruent";
    const word = pick(COLORS, random);
    let color = word;
    if (condition === "incongruent") color = pick(COLORS.filter((value) => value !== word), random);
    return { condition, word, color, correctResponse: color.charAt(0).toUpperCase() };
}

export function createAxcptTrial(previousCue, random = Math.random) {
    let stimulus;
    if (previousCue === "A") stimulus = random() < 0.7 ? "X" : pick(DISTRACTORS, random);
    else {
        const value = random();
        if (value < 0.3) stimulus = "A";
        else if (value < 0.5) stimulus = "X";
        else stimulus = pick(DISTRACTORS, random);
    }
    return { stimulus, correctResponse: previousCue === "A" && stimulus === "X" ? "M" : "N" };
}

if (typeof window !== "undefined") {
    window.fatigueResearch = { ...(window.fatigueResearch || {}), createStroopTrial, createAxcptTrial };
}
