# FatigueIDPro Data Dictionary

## Provenance

| Field | Meaning |
|---|---|
| `protocol_version` | Behavioral protocol version; v3 uses KSS before/after blocks. |
| `randomization_seed` | Reproducible session seed. Treat as research metadata, not a secret. |
| `protocol_config` | Snapshot of metric versions and enabled stages. |
| `client_build` | Deployed frontend build identifier. |
| `record_label` | Human-readable participant/session/block/dataset label. |

## Fatigue ratings

`fatigue_ratings` contains one record per session, block, and stage.

| Field | Meaning |
|---|---|
| `stage` | `pre_block` immediately before the primary task, or `post_block` immediately after the fatigue task. |
| `kss_score` | Karolinska Sleepiness Scale value from 1 (extremely alert) to 9 (extremely sleepy/fighting sleep). |
| `kss_label` | Participant-facing descriptor saved with the score. |
| `recorded_at` | Client timestamp in UTC. |

Before the v3 migration is applied, the frontend records the same payload as a `session_events.event_type = 'kss_rating'` fallback.

## Metric versions

| Dataset | Version | Definition |
|---|---|---|
| Fitts | `fitts-v3` | Initial target acquisition excluded; throughput is total ID divided by measured movement time; mean movement time uses successful movements (`clicks - 1`). |
| Typing | `typing-v3` | WPM = final characters / 5 / minutes; error distance is Levenshtein distance; error percentage uses target length. |
| Cognitive | `cognitive-v3` | Mixed congruent/incongruent Stroop; AX context resets for each AX phase; phase and battery elapsed times are distinct. |
| Scroll | `scroll-v3` | Mean speed uses the complete interval; boundary inactivity contributes to pauses. |
| Attention | `attention-exploratory-v1` | On-device head-pose threshold summary; not validated eye gaze. |

## Missingness

Do not replace missing values with zero. Keep incomplete/withdrawn sessions and their reason codes available for attrition reporting.

## Linkage

Use `session_id` as the immutable join key. Participant codes may be reused after administrative release and must not be the only key for ECG or manual measurements.
