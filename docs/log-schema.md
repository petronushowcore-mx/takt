# takt.. journal and progress report

The desktop app appends each saved session as one UTF-8 JSON line in `logs/sessions-YYYY-MM-DD.jsonl`. The date in the file name comes from `endedAt`. All timestamps are ISO 8601 UTC.

```json
{
  "schema": "klavish.event.v1",
  "type": "session_completed",
  "recordedAt": "2026-11-26T12:00:00.000Z",
  "appVersion": "0.1.0",
  "data": {
    "schemaVersion": 1,
    "id": "uuid",
    "startedAt": "2026-11-26T11:58:00.000Z",
    "endedAt": "2026-11-26T12:00:00.000Z",
    "mode": "lesson",
    "layout": "en",
    "lessonId": "en-01",
    "lessonTitle": "Home row",
    "completedText": true,
    "targetWpm": 18,
    "level": 1,
    "lessonScored": { "correctChars": 126, "activeMs": 54000, "totalKeys": 132, "errors": 6 },
    "activeMs": 90000,
    "wallMs": 120000,
    "totalKeys": 220,
    "correctChars": 210,
    "errors": 10,
    "backspaces": 3,
    "bestStreak": 80,
    "cpm": 140,
    "wpm": 28,
    "accuracy": 95.5,
    "meanLatencyMs": 400,
    "p95LatencyMs": 720,
    "score": 1950,
    "keyStats": {
      "f": { "attempts": 30, "errors": 2, "latencyMs": 11000, "latencySamples": 27 },
      "space": { "attempts": 35, "errors": 1, "latencyMs": 13000, "latencySamples": 33 }
    },
    "symbolStats": {
      "f": { "attempts": 30, "errors": 2, "misses": { "a": 2 } },
      "space": { "attempts": 35, "errors": 1, "misses": { "j": 1 } }
    },
    "confusions": { "f->a": 2, "space->j": 1 },
    "samples": [
      { "atMs": 5000, "correctChars": 12, "errors": 1, "activeMs": 4800 }
    ]
  }
}
```

## Modes and optional fields

Optional fields depend on the record version and mode. The `layout` field identifies the typing layout (`ru` or `en`). The interface language is a separate profile setting.

| Mode | Additional data |
| --- | --- |
| `lesson` | Lesson ID, title and level, assigned `targetWpm`, and `completedText`. `lessonScored` holds `{ correctChars, activeMs, totalKeys, errors }` for the word and connected-text stages. |
| `adaptive`, `precision` | Adaptive and untimed accuracy practice. `completedText` identifies a fully typed exercise. |
| `review` | Targeted error review. `reviewPairs` holds pairs of `{ expected, actual }`. |
| `transition` | Letter transitions. `transitionPairs` holds the selected `{ from, to }` pairs. |
| `diagnostic`, `benchmark` | `assessmentId` identifies the test form. For weekly benchmarks, `weekKey` is the ISO week in UTC. |
| `transfer-practice`, `transfer-control` | The first attempt and repeat on a supplied passage are two consecutive `transfer-practice` records. A distinct passage produces `transfer-control`. Records in the same comparison share `transferRunId`. Older data can have one practice record before the control. `firstPassAccuracy` and `firstPassErrors` measure the first keystroke at each attempted position. |
| `layout-switch` | After the initial confirmation, `layoutSwitches` stores 12 samples. Each sample identifies the required `layout`, the time in `latencyMs` from cue to correct input, and whether the first key was wrong (`wrongFirst`). |
| `hardcore` | Focused practice on frequently missed symbols. These `symbolStats` contribute to the separate Hardcore comparison. |
| `orbit`, `sprint` | Game result with `score`. In newer records, `correctChars` counts characters in accepted words, including the confirming space in Sprint. |

When present, `transitions` maps correctly typed adjacent letter pairs of the form `from->to` to arrays of millisecond intervals. The v3 weekly benchmark rotates through four starting forms. Comparisons use matching forms in the same layout. Valid v1 and v2 results remain in the history.

## Typing metrics

- `activeMs` sums intervals of up to 3,000 ms between printable keystrokes. `wallMs` is the attempt duration including pauses.
- `totalKeys` includes incorrect printable keystrokes. `backspaces` is counted separately. In text exercises, `correctChars` counts correct characters remaining after edits.
- `cpm` and `wpm` normally use active typing time. When `lessonScored` is present, lesson pace and `accuracy` use the scored stages. Overall keystroke totals and per-symbol results include warm-up. Diagnostics and weekly benchmarks measure pace over 45 seconds. Layout-switching records use zero as the pace sentinel and store latency in `layoutSwitches`.
- `accuracy` is the percentage of scored printable keystrokes without an error. `bestStreak` counts the longest run of correct keystrokes. `samples` stores cumulative measurements, typically every five seconds and at the end of the attempt.
- `keyStats` folds letters to lowercase. `latencyMs` is the sum of intervals up to 3,000 ms and `latencySamples` is their count. Their quotient is the mean latency. `confusions` counts expected-to-actual key pairs. Spaces are recorded as `space`.
- `symbolStats` is optional and case-sensitive. Each expected symbol has `attempts`, `errors` and `misses`. The `misses` map counts the actual characters typed when the expected symbol was missed. A space on either side is represented as `space`.

The keyboard progress screen presents exact per-symbol totals and lists legacy case-folded data separately. Changes in error rates require at least 10 attempts at the same symbol in each 30-day window.

## Summary report for AI

The local `takt.progress.v1` JSON report includes a pseudonymous `profileId` and the `previousFrom`, `currentFrom` and `generatedAt` time bounds. Each comparison window includes its end instant and excludes its start instant.

`layouts.ru` and `layouts.en` each contain `modes` with 30-day exercise summaries and `keyboard` with per-symbol rows. Rows include `all` for exact totals, `legacy` for old case-folded results, `current` and `previous` for ordinary practice, and `hardcore` and `hardcorePrevious` for targeted practice. `changePoints` and `hardcoreChangePoints` are differences in percentage points, or null for insufficient evidence. `ordinaryModes` identifies `lesson`, `adaptive` and `precision`. The threshold is stored in `minimumPerPeriodForChange`. `layoutSwitch` summarizes outcomes and latency by destination layout.

Reports contain aggregated measurements. Session records for supplied text also store aggregate results. The app appends journal events until progress is reset. The analyzer can read the journal while the app runs and counts malformed records in `ignoredLines`.
