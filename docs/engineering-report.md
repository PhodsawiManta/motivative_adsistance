# MVP engineering report

Implemented a working local vertical slice: foreground observations → session/context → user goal → candidate → deterministic decision → persisted contextual notification → native Electron delivery and feedback. Six dashboard views expose the loop, including uncertainty and suppression reasons. No demo records are seeded into the user's database.

Architecture is a TypeScript monorepo with React/Vite UI, Fastify service API, domain services, Drizzle ORM and SQLite migrations, plus an Electron shell. This keeps native collection, scoring, memory and persistence outside React. SQLite and a single backend avoid extra infrastructure. Drizzle's supported SQLite driver is documented in its [official guide](https://orm.drizzle.team/docs/sqlite/get-started-sqlite).

Database entities: users, activity_events, activity_sessions, conversations, messages, memories, ideas, goals, tasks, projects, ai_insights, notification_candidates, notifications, notification_events and user_preferences. Foreign-key cascades support deletion; indexed time/app queries and bounded history limit work. Shared memory fields are normalized, not an application-state JSON blob. Metadata and explanation payloads use JSON where appropriate.

Windows collection uses a persistent hidden PowerShell/Win32 helper at 15-second intervals. Structured extraction uses an optional OpenAI-compatible provider with validated JSON and deterministic fallback. Context is built from recent observations. Candidates use tentative lexical matching, history, deadlines and inactivity. The scoring formula and all budgets are in [notification-engine.md](notification-engine.md). Native feedback is stored separately, and inferred interpretations remain separate from observations/user statements.

Privacy: tracking off by default, LLM evidence sharing off by default, local-only binding, per-process write capability, origin/Host validation, bounded validated requests, excluded apps, optional titles, retention and deletion. No keylogging, screenshots of user activity, document reads, clipboard monitoring, microphone, camera or cloud sync. The test screenshot captures only this application's own renderer. Secrets stay in `.env` on the backend.

Verification executed on Windows: TypeScript checking; production UI/API build; **24 passing unit/integration tests**; isolated Blender simulation (score .822); real foreground samples through sessions/current context in the interactive session; all six Electron renderer views; Windows native notification show acknowledgement through the shared adapter; visual inspection of the dashboard artifact. Dependency audit reached **zero findings** after updates. Remote/local model generation was not exercised because no model endpoint was configured.

Known limits:

- Development desktop launcher, no installer, auto-start, tray or packaged application identity yet.
- Rule extraction and lexical matching are conservative baselines; ambiguous relative dates need editing. LLM-generated evidence summaries still require user judgment.
- Native close cannot reliably distinguish dismiss from timeout on Windows; explicit feedback is in the dashboard. OS Do Not Disturb may suppress visibility even when delivery is acknowledged.
- Bounded historical retrieval (latest 1,000 sessions for matching, 150 retrieval sessions, 300 memories) is not exhaustive lifetime search. Timeline is capped at 500 rows per filter.
- Meeting/video detection is heuristic. No browser URL, actual media state or calendar integration.
- Polling approximates durations and may miss short switches. Database contents are not encrypted. External backups are not erased.
- Daily dashboard/retrieval boundaries use the server's local day; quiet-hour and notification budgets use the chosen IANA zone.

Main modules and exact launch/test commands are listed in [README.md](../README.md). Recommended next implementation: package/sign the Windows app with its own notification identity and installer, then add an explicit project-to-application mapping UI to improve matching without pretending semantic guesses are facts.
