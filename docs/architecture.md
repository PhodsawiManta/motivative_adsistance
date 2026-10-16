# Architecture

Motivative is a local single-user monorepo. React calls a versioned Fastify API; domain services in packages/core own the activity → context → memory → candidate → decision → notification → feedback loop. Drizzle maps normalized SQLite tables; ordered SQL migrations run transactionally at startup. Electron displays the dashboard and adapts pending notifications to native Windows notifications. The API owns the Windows collector, so it also works while using the browser dashboard.

Tracking and sending evidence to an LLM require explicit opt-in. No screenshots, document contents, clipboard, keystrokes, microphone or camera are captured. A persistent hidden PowerShell helper uses Win32 APIs at 15-second intervals. No model calls happen on activity events. Deterministic extraction and evidence summaries keep the loop usable without a provider.

Node 24, Fastify, React/Vite, Electron and Drizzle/better-sqlite3 keep one-machine development straightforward. Electron does not load native database modules: the API runs in Node, avoiding Electron native ABI rebuilds. Dependencies are locked by package-lock.json. Run commands from the repository root.

The local API binds to 127.0.0.1. Browser origins and Host headers are checked. State changes require a per-process capability token, bootstrapped only through the same-origin API; desktop notification delivery uses a separate token inherited from the launcher. No remote multi-user authentication is implied. Provider secrets remain in the server environment. Future platforms implement the collector and notification interfaces, without changing business logic.

No microservices, vector database, cloud sync or placeholder platform packages. The normalized memories table stores shared fields; goals/tasks/ideas are subtype tables. Commitments and preferences remain typed memory rows. Project rows can support later explicit project linking; current matching is deliberately tentative lexical matching.
