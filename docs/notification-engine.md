# Candidates, decisions and delivery

Candidates are generated from active goals/tasks/commitments/reminders, current lexical matches, approaching explicit deadlines, or more than three days without a historical match. Ideas never generate nudges. A bounded history of 1,000 sessions provides tentative historical evidence. No semantic claim is presented as an observed fact.

The deterministic score is clamped to [0,1]:

```
0.22 * relevance
+ 0.30 * contextMatch
+ 0.16 * timing
+ 0.07 * urgency
+ 0.08 * historicalSuccess
+ 0.05 * inactivitySinceProgress
+ 0.12 * confidence
- 0.25 * interruptionCost
- 0.25 * notificationFatigue
```

Default thresholds: below .65 SUPPRESS; .65–.80 WEAK_CANDIDATE; .80+ STRONG_CANDIDATE. Only strong candidates can become pending notifications. Confidence is capped; context matching is lexical, not proof. Long uninterrupted sessions add interruption cost. Ignored/dismissed reminders lower category priority. Sustained matching foreground activity after delivery adds a historical success signal, but does not prove causal benefit or task completion. Opens alone are not counted as success.

Independent hard guardrails: notifications enabled; max 3/day; 180-minute global gap; 1,440-minute goal cooldown; 360-minute dismissal cooldown; per-goal snooze; quiet hours 23:00–08:00 in a configurable IANA zone; fresh context; active computer; no fullscreen app; no rapid switching; no recent return from idle; no obvious meeting/presentation/video context. All budgets reserve pending suggestions so delivery latency cannot overspend them.

Candidate explanations store score factors, observed context, user statement, tentative matching reason, timing and budget decisions. Both suppressed and allowed decisions are inspectable. Identical goal candidates are throttled for 15 minutes. Pending notifications expire after two minutes to avoid old interruptions after restarting the desktop.

Electron polls pending delivery every 10 seconds using a separate desktop capability. Its Windows adapter records sent only after the native show callback. A toast click records opened. Explicit dismissal and 1-hour snooze are available in the dashboard. Native Windows close can also mean expiration, so it is not mislabeled as user dismissal. Unanswered sent notifications become ignored after an hour. Related activity requires at least five minutes after delivery and a sustained matching session. No reinforcement learning, engagement objective or model-based interruption permission is used.

Native toast presentation remains subject to Windows notification permissions and Do Not Disturb. Packaging with an application identity/Start Menu shortcut is the recommended next step; development uses Electron's executable identity as described in the [Electron notification documentation](https://www.electronjs.org/docs/latest/tutorial/notifications).
