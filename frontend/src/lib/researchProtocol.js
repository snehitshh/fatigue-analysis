export const PROTOCOL_VERSION = "3.0.0";

export const METRIC_VERSIONS = Object.freeze({
    fitts: "fitts-v3",
    typing: "typing-v3",
    cognitive: "cognitive-v3",
    scroll: "scroll-v3",
    attention: "attention-exploratory-v1"
});

const CONDITIONS = Object.freeze([
    { primary: "fitts", fatigue: "cognitive" },
    { primary: "typing", fatigue: "cognitive" },
    { primary: "fitts", fatigue: "physical" },
    { primary: "typing", fatigue: "physical" }
]);

function hashSeed(value) {
    const text = String(value ?? "");
    let hash = 2166136261;
    for (let i = 0; i < text.length; i++) {
        hash ^= text.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
}

export function createSeed() {
    if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
        const values = new Uint32Array(2);
        crypto.getRandomValues(values);
        return `${values[0].toString(16)}${values[1].toString(16)}`;
    }
    return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;
}

export function deriveSeed(seed, label) {
    return hashSeed(`${String(seed)}::${String(label)}`).toString(16).padStart(8, "0");
}

export function seededRandom(seed) {
    let state = hashSeed(seed) || 0x6d2b79f5;
    return function random() {
        state += 0x6d2b79f5;
        let value = state;
        value = Math.imul(value ^ (value >>> 15), value | 1);
        value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
        return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
}

export function assignCondition(seed) {
    const random = seededRandom(deriveSeed(seed, "condition"));
    return { ...CONDITIONS[Math.floor(random() * CONDITIONS.length)] };
}

export function shuffleWithSeed(items, seed) {
    const result = [...items];
    const random = seededRandom(seed);
    for (let i = result.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
}

export function validateKss(value) {
    const score = Number(value);
    return Number.isInteger(score) && score >= 1 && score <= 9 ? score : null;
}

const KSS_LABELS = Object.freeze({
    1: "Extremely alert",
    2: "Very alert",
    3: "Alert",
    4: "Rather alert",
    5: "Neither alert nor sleepy",
    6: "Some signs of sleepiness",
    7: "Sleepy, no effort to stay awake",
    8: "Sleepy, some effort to stay awake",
    9: "Extremely sleepy, fighting sleep"
});

export function kssLabel(value) {
    const score = validateKss(value);
    return score === null ? null : KSS_LABELS[score];
}

if (typeof window !== "undefined") {
    window.fatigueResearch = {
        ...(window.fatigueResearch || {}),
        PROTOCOL_VERSION,
        METRIC_VERSIONS,
        createSeed,
        deriveSeed,
        seededRandom,
        assignCondition,
        shuffleWithSeed,
        validateKss,
        kssLabel
    };
}
