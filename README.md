# Motivative

A local-first Windows activity and memory assistant. It remembers intentions, connects them tentatively to foreground activity, and decides whether a small contextual nudge would be useful. Silence is a valid result.

## Run

Requires Windows 10/11, an interactive desktop session, Node.js 24+, npm, and Windows PowerShell 5.1. No database server, Docker, API key, or paid service is required for the local loop.

```powershell
cd C:\Project\motivative_adsistance
npm.cmd install
npm.cmd run dev
```

`npm` works in other shells; `.cmd` avoids PowerShell execution-policy restrictions. The launcher starts the API on **127.0.0.1:4318**, Vite on **127.0.0.1:5190**, and Electron. Closing Electron stops the launcher services. The dashboard is also available at http://127.0.0.1:5190. Keep the desktop open for native notifications.

If your npm installation requires approving dependency scripts, approve `better-sqlite3`, `electron`, and `esbuild` before rebuilding them. In restricted environments, use a workspace cache:

```powershell
$env:electron_config_cache = "$PWD\.cache\electron"
npm.cmd install --cache .cache/npm
```

No packaging/installer is included yet. `npm run dev:api` and `npm run dev:web` run the browser-only workflow. Use the combined `dev` launcher for the desktop delivery token; `dev:desktop` alone does not receive that token.

## Try the loop

1. Open **Settings**, enable **Observe computer activity**, and save. Collection is off by default and visibly indicated in the header.
2. In **Chat**, say **“I want to finish my Blender character.”** This creates an editable goal with its source message.
3. Open Blender with `character.blend`. Sampling happens every 15 seconds. Check **Activity** and **Today** for observed metadata.
4. Open **Notifications** for candidates, scores, suppression reasons and delivered suggestions. A strong match may trigger a native toast if context and budget allow it. Initial score for the isolated example is **0.822**.
5. Open, dismiss or snooze in the dashboard. Clicking a native toast opens its history and records feedback. Windows notification settings/Do Not Disturb may affect presentation.
6. Ask **“What was I working on yesterday?”** or **“What am I currently working on?”** for evidence-based retrieval.

Matching is tentative, not a claim of progress. Weak and suppressed candidates remain visible. Candidates are deduplicated for 15 minutes; disabling quiet hours does not force an immediate retry of a recently suppressed candidate.

## LLM configuration

Copy `.env.example` to `.env`, set the following, restart, and enable **Send chat evidence to the configured model** in Settings:

| Variable        | Default / purpose                                                            |
| --------------- | ---------------------------------------------------------------------------- |
| `HOST`          | `127.0.0.1`; public binding is intentionally rejected                        |
| `PORT`          | `4318`; desktop/dev proxy currently expect this port                         |
| `DATABASE_PATH` | `./data/motivative.sqlite`                                                   |
| `LLM_BASE_URL`  | OpenAI-compatible base URL ending in `/v1`, e.g. `http://127.0.0.1:11434/v1` |
| `LLM_API_KEY`   | Server-only secret; optional for local servers                               |
| `LLM_MODEL`     | Model name from your configured provider                                     |

Only the dedicated provider makes model HTTP calls, using `/chat/completions`. JSON output is schema-validated; failures fall back to local rules and summaries. Without a provider this is a deterministic memory assistant, not a generative chatbot. No external provider was configured during verification. Enable remote evidence sharing only if you want retrieved window titles, messages and memories sent to that endpoint. Raw polling never invokes a model.

An API key alone does not activate AI. Check the endpoint belongs to the provider that issued your key, use a model available on that endpoint, and enable the AI option in Settings. `http://127.0.0.1:11434/v1` requires a local model server running on your computer; it does not route a remote API key automatically. After editing `.env`, restart `npm run dev`.

Use **Settings → Test AI connection** to send a short synthetic greeting without sending your activity or conversation history. The test works even while AI sharing is disabled and does not turn it on. Chat shows whether AI is disabled, enabled but not yet tested, actually returned a reply, or failed with a safe error explanation. Chat response status and memory-extraction status are independent: a model can converse even if structured extraction falls back to local rules. Normal conversation does not retrieve your activity timeline; personal recall questions retrieve evidence and keep uncertainty explicit.

## Database and privacy

SQLite is created automatically; ordered SQL migrations run transactionally at startup. `data/` and `.env` are ignored by version control. Run from the repository root so migrations and the collector script can be found. The database is local and **not encrypted**.

Tracking can be paused, window titles hidden, and apps excluded by exact process name. Exclusions apply to future samples. Retention defaults to 90 days for activity and derived interpretations; conversations persist until deleted. Settings provides deletion by scope; removing raw activity also removes derived connections/suggestions that may contain its titles. Deletion checkpoints SQLite and vacuums live database pages; external backups are outside the app’s control.

## Verify

```powershell
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
npm.cmd run simulate
npm.cmd run verify:collector
npm.cmd audit
```

`simulate` is isolated in memory, prints the required Blender vertical slice, and sends no toast. `verify:collector` samples the real foreground twice, sessionizes in memory, prints no window titles, and stops. Run it from an interactive Windows session.

With `npm run dev` running, the desktop smoke test renders all six pages, saves `artifacts/dashboard.png`, and sends one real test notification through the desktop adapter:

```powershell
Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
Start-Process -FilePath "$PWD\node_modules\electron\dist\electron.exe" -ArgumentList "scripts/desktop-smoke.cjs" -WorkingDirectory $PWD -WindowStyle Hidden -Wait
```

For the built browser application, run `npm run build`, then `npm start`, and open http://127.0.0.1:4318. This mode still collects on Windows when enabled, but requires the Electron development launcher for native toasts.

## Repository guide

| Path                                     | Responsibility                                                   |
| ---------------------------------------- | ---------------------------------------------------------------- |
| `apps/api/src/app.ts`                    | Versioned APIs, local security, service lifecycle                |
| `apps/desktop/`                          | Sandboxed Electron shell and native notification adapter         |
| `apps/web/src/pages/`                    | Today, Chat, Memory, Activity, Notifications, Settings           |
| `packages/shared/src/schema.ts`          | Zod contracts and defaults                                       |
| `packages/database/`                     | Drizzle entities, SQLite connection, SQL migrations              |
| `packages/core/src/activity.ts`          | Event ingestion, sessions and current context                    |
| `packages/core/src/windows-collector.ts` | Collector interface and PowerShell lifecycle                     |
| `packages/core/src/ai.ts`                | Provider interface, validated extraction, evidence summarization |
| `packages/core/src/conversation.ts`      | Conversations, memory persistence and retrieval                  |
| `packages/core/src/decision.ts`          | Candidate generation, scoring and guardrails                     |
| `packages/core/src/reminders.ts`         | Decisions, explanations, notification lifecycle and feedback     |
| `scripts/windows-activity.ps1`           | Foreground/idle/fullscreen Win32 metadata                        |
| `tests/core.test.ts`                     | Domain and API integration tests                                 |

See [architecture](docs/architecture.md), [activity](docs/activity-system.md), [memory](docs/memory-system.md), [notification engine](docs/notification-engine.md), and the [engineering report](docs/engineering-report.md).
