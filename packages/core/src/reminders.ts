import { and, desc, eq, gte, lt, inArray } from 'drizzle-orm';
import type { Store } from '../../database/src';
import {
  memories,
  activitySessions,
  candidates,
  notifications,
  notificationEvents,
  insights,
} from '../../database/src/schema';
import type { ContextSnapshot, feedbackSchema } from '../../shared/src/schema';
import type { z } from 'zod';
import {
  budgetReasons,
  generateCandidates,
  scoreCandidate,
  contextMatch,
  ContextualNotificationContent,
} from './decision';

export class ReminderEngine {
  constructor(
    private store: Store,
    private now: () => Date = () => new Date(),
  ) {}
  evaluate(context: ContextSnapshot) {
    const now = this.now(),
      timestamp = now.toISOString(),
      db = this.store.db,
      settings = this.store.settings();
    this.expire();
    const active = db
      .select()
      .from(memories)
      .where(inArray(memories.status, ['active', 'inactive', 'stale', 'possibly_abandoned']))
      .all();
    const sessions = db
      .select()
      .from(activitySessions)
      .orderBy(desc(activitySessions.end))
      .limit(1000)
      .all();
    const generated = generateCandidates(active, sessions, context, now);
    const results = [];
    for (const candidate of generated) {
      const recent = db
        .select()
        .from(candidates)
        .where(
          and(
            eq(candidates.memoryId, candidate.memory.id),
            gte(candidates.createdAt, new Date(+now - 900000).toISOString()),
          ),
        )
        .get();
      if (recent) continue;
      const history = db
        .select()
        .from(notifications)
        .where(gte(notifications.createdAt, new Date(+now - 31 * 86400000).toISOString()))
        .orderBy(desc(notifications.createdAt))
        .all();
      const categoryIds = new Set(
        active.filter((m) => m.type === candidate.memory.type).map((m) => m.id),
      );
      const categoryHistory = history.filter(
        (n) =>
          categoryIds.has(n.memoryId) &&
          ['opened', 'dismissed', 'ignored', 'snoozed'].includes(n.status),
      );
      const negative = categoryHistory.filter((n) =>
        ['dismissed', 'ignored'].includes(n.status),
      ).length;
      const progress = db
        .select()
        .from(notificationEvents)
        .where(
          and(
            eq(notificationEvents.type, 'related_activity_detected_after_notification'),
            gte(notificationEvents.createdAt, new Date(+now - 31 * 86400000).toISOString()),
          ),
        )
        .all();
      const categoryNotificationIds = new Set(
        history.filter((n) => categoryIds.has(n.memoryId)).map((n) => n.id),
      );
      const successCount = new Set(
        progress
          .filter((e) => e.notificationId && categoryNotificationIds.has(e.notificationId))
          .map((e) => e.notificationId),
      ).size;
      const success = (1 + successCount) / (2 + categoryHistory.length + successCount);
      const scored = scoreCandidate(
        candidate,
        context,
        settings,
        success,
        Math.min(1, negative / 5),
      );
      const dismissal = db
        .select()
        .from(notificationEvents)
        .where(eq(notificationEvents.type, 'notification_dismissed'))
        .orderBy(desc(notificationEvents.createdAt))
        .get();
      const blocked = [
        ...scored.blocked,
        ...budgetReasons(settings, history, candidate.memory.id, now, dismissal?.createdAt),
      ];
      const allowed = scored.decision === 'STRONG_CANDIDATE' && blocked.length === 0;
      const id = crypto.randomUUID();
      const explanation = {
        score: scored.score,
        factors: scored.factors,
        epistemicType: 'INFERENCE',
        context,
        reason: [
          `User statement: ${candidate.memory.title}`,
          candidate.match
            ? `Observed foreground application: ${context.activeApplication}; lexical match is tentative`
            : 'No current project match',
          candidate.historySessionId
            ? 'Previous matching activity exists'
            : 'No older matching session found',
          `Timing: ${context.idle ? 'idle' : 'active'}`,
          blocked.length ? blocked.join('; ') : 'Notification budget allows an interruption',
        ],
        blocked,
      };
      db.transaction((tx) => {
        tx.insert(candidates)
          .values({
            id,
            memoryId: candidate.memory.id,
            reason: candidate.reason,
            confidence: candidate.confidence,
            suggestedAction: candidate.suggestedAction,
            estimatedEffortMinutes: 10,
            score: scored.score,
            decision: allowed ? 'STRONG_CANDIDATE' : blocked.length ? 'SUPPRESS' : scored.decision,
            explanation: JSON.stringify(explanation),
            createdAt: timestamp,
          })
          .run();
        tx.insert(insights)
          .values({
            id: crypto.randomUUID(),
            memoryId: candidate.memory.id,
            epistemicType: 'INFERENCE',
            content: candidate.match
              ? 'Current activity may relate to this unfinished goal.'
              : 'There may be unfinished work; absence of matching activity does not establish abandonment.',
            confidence: candidate.confidence,
            evidence: JSON.stringify({
              candidateId: id,
              sessionId: candidate.historySessionId,
              context,
            }),
            createdAt: timestamp,
          })
          .run();
        if (allowed) {
          const notificationId = crypto.randomUUID();
          tx.insert(notifications)
            .values({
              id: notificationId,
              candidateId: id,
              memoryId: candidate.memory.id,
              content: new ContextualNotificationContent().generate(candidate, context),
              status: 'pending',
              createdAt: timestamp,
            })
            .run();
          tx.insert(notificationEvents)
            .values({
              id: crypto.randomUUID(),
              notificationId,
              candidateId: id,
              type: 'notification_generated',
              createdAt: timestamp,
            })
            .run();
        } else
          tx.insert(notificationEvents)
            .values({
              id: crypto.randomUUID(),
              candidateId: id,
              type: 'notification_suppressed',
              createdAt: timestamp,
            })
            .run();
      });
      results.push({ id, allowed, ...scored, blocked });
    }
    this.detectProgress(context);
    return results;
  }
  private detectProgress(context: ContextSnapshot) {
    if (context.idle || context.stale || context.currentSessionDurationSeconds < 300) return;
    const db = this.store.db,
      now = this.now();
    for (const n of db
      .select()
      .from(notifications)
      .where(
        and(
          gte(notifications.sentAt, new Date(+now - 3600000).toISOString()),
          inArray(notifications.status, ['sent', 'opened', 'ignored']),
        ),
      )
      .all()) {
      if (!n.sentAt || +now - Date.parse(n.sentAt) < 300000) continue;
      const m = db.select().from(memories).where(eq(memories.id, n.memoryId)).get();
      if (
        !m ||
        contextMatch(m.title, context.activeApplication ?? '', context.activeWindowTitle ?? '') <
          0.7
      )
        continue;
      if (
        db
          .select()
          .from(notificationEvents)
          .where(
            and(
              eq(notificationEvents.notificationId, n.id),
              eq(notificationEvents.type, 'related_activity_detected_after_notification'),
            ),
          )
          .get()
      )
        continue;
      db.insert(notificationEvents)
        .values({
          id: crypto.randomUUID(),
          notificationId: n.id,
          candidateId: n.candidateId,
          type: 'related_activity_detected_after_notification',
          createdAt: now.toISOString(),
        })
        .run();
    }
  }
  expire() {
    const db = this.store.db,
      now = this.now();
    db.update(notifications)
      .set({ status: 'expired' })
      .where(
        and(
          eq(notifications.status, 'pending'),
          lt(notifications.createdAt, new Date(+now - 120000).toISOString()),
        ),
      )
      .run();
    for (const n of db
      .select()
      .from(notifications)
      .where(
        and(
          eq(notifications.status, 'sent'),
          lt(notifications.sentAt, new Date(+now - 3600000).toISOString()),
        ),
      )
      .all())
      this.action(n.id, { action: 'ignored', snoozeMinutes: 60 });
  }
  action(id: string, input: z.infer<typeof feedbackSchema>) {
    const db = this.store.db,
      n = db.select().from(notifications).where(eq(notifications.id, id)).get();
    if (!n) return null;
    const status = input.action === 'sent' ? 'sent' : input.action;
    if (n.status === status) return n;
    if (['sent', 'delivery_failed'].includes(status) && n.status !== 'pending') return n;
    if (['expired', 'delivery_failed'].includes(n.status)) return n;
    const timestamp = this.now().toISOString();
    db.transaction((tx) => {
      tx.update(notifications)
        .set({
          status,
          ...(status === 'sent' ? { sentAt: timestamp } : {}),
          ...(status === 'snoozed'
            ? { snoozedUntil: new Date(+this.now() + input.snoozeMinutes * 60000).toISOString() }
            : {}),
        })
        .where(eq(notifications.id, id))
        .run();
      tx.insert(notificationEvents)
        .values({
          id: crypto.randomUUID(),
          notificationId: id,
          candidateId: n.candidateId,
          type: `notification_${status}`,
          createdAt: timestamp,
        })
        .run();
    });
    return db.select().from(notifications).where(eq(notifications.id, id)).get();
  }
  pending(context: ContextSnapshot) {
    this.expire();
    const settings = this.store.settings(),
      now = this.now(),
      db = this.store.db;
    const history = db
      .select()
      .from(notifications)
      .where(gte(notifications.createdAt, new Date(+now - 31 * 86400000).toISOString()))
      .all();
    const dismissal = db
      .select()
      .from(notificationEvents)
      .where(eq(notificationEvents.type, 'notification_dismissed'))
      .orderBy(desc(notificationEvents.createdAt))
      .get();
    return this.list().filter((n) => {
      if (n.status !== 'pending' || n.score < settings.strongThreshold) return false;
      const memory = db.select().from(memories).where(eq(memories.id, n.memoryId)).get();
      if (!memory) return false;
      const candidate = generateCandidates([memory], [], context, now)[0];
      if (!candidate) return false;
      // Recheck current context and changed settings immediately before delivery.
      if (n.explanation.factors.contextMatch > 0 && !candidate.match) return false;
      if (scoreCandidate(candidate, context, settings).blocked.length) return false;
      return (
        budgetReasons(
          settings,
          history.filter((other) => other.id !== n.id),
          n.memoryId,
          now,
          dismissal?.createdAt,
        ).length === 0
      );
    });
  }
  list() {
    return this.store.db
      .select({ notification: notifications, candidate: candidates })
      .from(notifications)
      .innerJoin(candidates, eq(notifications.candidateId, candidates.id))
      .orderBy(desc(notifications.createdAt))
      .limit(100)
      .all()
      .map(({ notification, candidate }) => ({
        ...notification,
        score: candidate.score,
        explanation: JSON.parse(candidate.explanation),
        feedback: this.store.db
          .select()
          .from(notificationEvents)
          .where(eq(notificationEvents.notificationId, notification.id))
          .all(),
      }));
  }
}
