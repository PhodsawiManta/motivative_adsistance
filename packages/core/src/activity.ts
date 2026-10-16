import { desc, eq, gte, and, lte } from 'drizzle-orm';
import type { Store } from '../../database/src';
import { activityEvents, activitySessions } from '../../database/src/schema';
import type { ActivityInput, ContextSnapshot } from '../../shared/src/schema';

export function canMerge(previous: typeof activitySessions.$inferSelect, event: ActivityInput) {
  const gap = Date.parse(event.timestamp) - Date.parse(previous.end);
  return (
    previous.application === event.application &&
    previous.title === event.title &&
    previous.idle === event.idle &&
    previous.source === event.source &&
    gap >= 0 &&
    gap <= 45000
  );
}
export class ActivityService {
  constructor(
    private store: Store,
    private now: () => Date = () => new Date(),
  ) {}
  ingest(events: ActivityInput[], simulation = false) {
    const settings = this.store.settings();
    if (!simulation && !settings.trackingEnabled) return { accepted: 0 };
    let accepted = 0;
    this.store.db.transaction((tx) => {
      for (const raw of [...events].sort((a, b) => a.timestamp.localeCompare(b.timestamp))) {
        if (
          settings.excludedApplications.some(
            (app) => app.toLowerCase() === raw.application.toLowerCase(),
          )
        )
          continue;
        const event = { ...raw, title: settings.storeWindowTitles ? raw.title : '' };
        if (tx.select().from(activityEvents).where(eq(activityEvents.id, event.id)).get()) continue;
        const last = tx.select().from(activityEvents).orderBy(desc(activityEvents.timestamp)).get();
        // Late events are retained as observations but never rewind the live session/context.
        tx.insert(activityEvents)
          .values({ ...event, metadata: JSON.stringify(event.metadata) })
          .run();
        accepted++;
        if (last && last.timestamp >= event.timestamp) continue;
        const previous = tx
          .select()
          .from(activitySessions)
          .orderBy(desc(activitySessions.end))
          .get();
        const elapsed = last
          ? Math.max(0, Date.parse(event.timestamp) - Date.parse(last.timestamp))
          : 0;
        const credited = Math.min(event.durationMs, elapsed, 30000);
        if (previous && canMerge(previous, event)) {
          tx.update(activitySessions)
            .set({ end: event.timestamp, durationMs: previous.durationMs + credited })
            .where(eq(activitySessions.id, previous.id))
            .run();
        } else {
          tx.insert(activitySessions)
            .values({
              id: crypto.randomUUID(),
              application: event.application,
              title: event.title,
              start: event.timestamp,
              end: event.timestamp,
              durationMs: 0,
              idle: event.idle,
              source: event.source,
            })
            .run();
        }
      }
    });
    return { accepted };
  }
  context(): ContextSnapshot {
    const now = this.now();
    const last = this.store.db
      .select()
      .from(activityEvents)
      .orderBy(desc(activityEvents.timestamp))
      .get();
    const sessions = this.store.db
      .select()
      .from(activitySessions)
      .where(gte(activitySessions.end, new Date(+now - 300000).toISOString()))
      .orderBy(desc(activitySessions.end))
      .limit(30)
      .all();
    const session = sessions[0];
    const stale =
      !this.store.settings().trackingEnabled || !last || +now - Date.parse(last.timestamp) > 60000;
    const metadata = last ? (JSON.parse(last.metadata) as ActivityInput['metadata']) : null;
    return {
      timestamp: now.toISOString(),
      activeApplication: stale ? null : last.application,
      activeWindowTitle: stale ? null : last.title,
      idle: stale || !!last?.idle,
      currentSessionDurationSeconds: stale ? 0 : (session?.durationMs ?? 0) / 1000,
      recentApplications: [...new Set(sessions.map((s) => s.application))],
      rapidSwitching: sessions.filter((s) => +now - Date.parse(s.start) < 120000).length >= 6,
      recentlyResumed: !!sessions.find((s) => s.idle && +now - Date.parse(s.end) < 120000),
      fullscreen: metadata?.fullscreen ?? false,
      stale,
    };
  }
  timeline(filter: { application?: string; from?: string; to?: string; kind?: string } = {}) {
    const table = filter.kind === 'events' ? activityEvents : activitySessions;
    const timestamp = filter.kind === 'events' ? activityEvents.timestamp : activitySessions.end;
    const conditions = [
      filter.application ? eq(table.application, filter.application) : undefined,
      filter.from ? gte(timestamp, filter.from) : undefined,
      filter.to ? lte(timestamp, filter.to) : undefined,
    ];
    return this.store.db
      .select()
      .from(table)
      .where(and(...conditions))
      .orderBy(desc(timestamp))
      .limit(500)
      .all();
  }
}
