# Pilot Collection Checklist

## Before deployment

- [ ] Institutional review and participant materials are approved for the intended population.
- [ ] All required `VITE_STUDY_*` values are configured.
- [ ] The v3 migration was reviewed, backed up, and applied in a non-production environment first.
- [ ] The deployed Git commit and protocol version are recorded.
- [ ] Researcher export access was tested with a non-admin researcher account.

## Device validation

- [ ] Desktop mouse, laptop trackpad, phone touch, and tablet touch were tested separately.
- [ ] Fitts arena remains at least 300 px and does not resize during a measured minute.
- [ ] Physical and virtual keyboard records are distinguishable.
- [ ] Refresh/resume works at consent, KSS, each task minute, NASA-TLX, break, and fatigue task.
- [ ] Offline records visibly queue and upload after reconnection.
- [ ] Camera denial, model failure, glasses, poor lighting, and no-face cases do not block participation.

## Test-session review

- [ ] Six KSS rows exist per complete three-block session.
- [ ] Three NASA-TLX rows exist per complete session.
- [ ] Expected blocks and task records exist without duplicates.
- [ ] Session seed, protocol configuration, metric versions, and build ID are present.
- [ ] App-switch totals match raw engagement rows and are not multiplied by block joins.
- [ ] Manual/ECG measurements reference the intended `session_id`.
- [ ] Withdrawal and early-finish events are visible in exports.

## Before confirmatory collection

- [ ] Pilot data is separated from the confirmatory dataset.
- [ ] Primary outcome, sample size, stopping rule, exclusions, and analysis plan are preregistered.
- [ ] Task durations, stimuli, breaks, physical instructions, and supported devices are frozen.
- [ ] A restore test confirms backups are usable.
