import { describe, it, expect, afterEach } from 'vitest';
import { openDatabase, type Store } from '../packages/database/src';
import { activitySessions, memories, notifications } from '../packages/database/src/schema';
import {
  settingsSchema,
  type ActivityInput,
  type ContextSnapshot,
} from '../packages/shared/src/schema';
import { classifyMessage, MemoryExtractor, type LLMProvider } from '../packages/core/src/ai';
import { ActivityService } from '../packages/core/src/activity';
import {
  budgetReasons,
  generateCandidates,
  quietHours,
  scoreCandidate,
} from '../packages/core/src/decision';
import { createApp } from '../apps/api/src/app';

const now = new Date('2026-09-27T12:00:00.000Z');
const context: ContextSnapshot = {
  timestamp: now.toISOString(),
  activeApplication: 'Blender',
  activeWindowTitle: 'character.blend - Blender',
  idle: false,
  currentSessionDurationSeconds: 15,
  recentApplications: ['Blender'],
  rapidSwitching: false,
  recentlyResumed: false,
  fullscreen: false,
  stale: false,
};
const goal: typeof memories.$inferSelect = {
  id: crypto.randomUUID(),
  type: 'GOAL',
  title: 'I want to finish my Blender character.',
  status: 'active',
  confidence: 0.85,
  deadline: null,
  epistemicType: 'USER_STATEMENT',
  sourceType: 'conversation',
  sourceId: null,
  createdAt: now.toISOString(),
  updatedAt: now.toISOString(),
};
const settings = settingsSchema.parse({ timeZone: 'UTC' });
const event = (offset = 0, overrides: Partial<ActivityInput> = {}): ActivityInput => ({
  id: crypto.randomUUID(),
  timestamp: new Date(+now + offset).toISOString(),
  durationMs: 15000,
  source: 'simulation',
  type: 'foreground_window',
  application: 'Blender',
  title: 'character.blend - Blender',
  idle: false,
  metadata: { fullscreen: false, idleSeconds: 0 },
  ...overrides,
});
let stores: Store[] = [];
function db() {
  const s = openDatabase(':memory:');
  stores.push(s);
  return s;
}
afterEach(() => {
  stores.forEach((s) => s.close());
  stores = [];
});
describe('structured memory', () => {
  it.each([
    ['Maybe someday I should make a game.', 'IDEA'],
    ['I want to finish my portfolio.', 'GOAL'],
    ['I need to submit this project by Sunday.', 'COMMITMENT'],
    ['Fix the inventory bug.', 'TASK'],
    ['I prefer quiet mornings.', 'PREFERENCE'],
    ['I am interested in space.', 'INTEREST'],
    ['Remind me to walk.', 'REMINDER'],
    ['Remember my workspace is upstairs.', 'CONTEXT'],
  ])('classifies %s', async (text, type) => {
    expect(classifyMessage(text).memories[0].type).toBe(type);
  });
  it('does not turn a question into a goal', () =>
    expect(classifyMessage('What did I want to do last week?').memories).toEqual([]));
  it('falls back on malformed model output', async () => {
    const provider = {
      generate: async () => '',
      generateStructured: async () => {
        throw new Error('malformed JSON');
      },
    } as LLMProvider;
    const result = await new MemoryExtractor(provider).extract(goal.title, '', true);
    expect(result.memories[0].type).toBe('GOAL');
    expect(result.mode).toContain('fallback');
  });
});
describe('activity sessionization', () => {
  it('merges consecutive observations, deduplicates, splits title/idle/app boundaries', () => {
    const s = db(),
      service = new ActivityService(s, () => new Date(+now + 90000)),
      first = event();
    service.ingest(
      [
        first,
        first,
        event(15000),
        event(30000),
        event(45000, { title: 'addon.py' }),
        event(60000, { idle: true }),
        event(75000, { application: 'Chrome' }),
      ],
      true,
    );
    const rows = s.db.select().from(activitySessions).all();
    expect(rows).toHaveLength(4);
    expect(rows[0].durationMs).toBe(30000);
  });
  it('splits gaps and prevents stale current context', () => {
    const s = db(),
      service = new ActivityService(s, () => new Date(+now + 120000));
    service.ingest([event(), event(60000)], true);
    expect(s.db.select().from(activitySessions).all()).toHaveLength(2);
    expect(new ActivityService(s, () => new Date(+now + 130000)).context().stale).toBe(true);
  });
  it('respects disabled tracking and title privacy', () => {
    const s = db(),
      service = new ActivityService(s);
    expect(service.ingest([event()]).accepted).toBe(0);
    s.setSettings({ trackingEnabled: true, storeWindowTitles: false });
    service.ingest([event()]);
    expect(s.db.select().from(activitySessions).get()?.title).toBe('');
  });
});
describe('candidate decisions', () => {
  it('matches active goals, never ideas or completed goals', () => {
    const candidates = generateCandidates(
      [
        goal,
        { ...goal, id: crypto.randomUUID(), type: 'IDEA' },
        { ...goal, id: crypto.randomUUID(), status: 'completed' },
      ],
      [],
      context,
      now,
    );
    expect(candidates).toHaveLength(1);
    expect(candidates[0].reason).toBe('related_project_opened');
    expect(scoreCandidate(candidates[0], context, settings).score).toBeGreaterThanOrEqual(0.8);
  });
  it('reduces scores after repeated ignored notifications', () => {
    const c = generateCandidates([goal], [], context, now)[0];
    expect(scoreCandidate(c, context, settings, 0.1, 1).decision).toBe('SUPPRESS');
  });
  it('blocks bad contexts independently of high scores', () => {
    const c = generateCandidates([goal], [], context, now)[0];
    const score = scoreCandidate(
      c,
      { ...context, fullscreen: true, recentlyResumed: true, rapidSwitching: true },
      settings,
    );
    expect(score.blocked).toHaveLength(3);
  });
  it('does not falsely match unrelated application', () =>
    expect(
      generateCandidates(
        [goal],
        [],
        { ...context, activeApplication: 'Notepad', activeWindowTitle: 'notes.txt' },
        now,
      ),
    ).toEqual([]));
});
describe('budgets and quiet hours', () => {
  it('handles midnight-crossing, daytime and disabled quiet windows', () => {
    expect(quietHours(new Date('2026-09-27T23:00:00Z'), settings)).toBe(true);
    expect(quietHours(new Date('2026-09-27T07:59:00Z'), settings)).toBe(true);
    expect(quietHours(new Date('2026-09-27T08:00:00Z'), settings)).toBe(false);
    expect(quietHours(now, { ...settings, quietStart: 10, quietEnd: 14 })).toBe(true);
    expect(quietHours(now, { ...settings, quietStart: 0, quietEnd: 0 })).toBe(false);
  });
  it('uses configured time zone', () =>
    expect(
      quietHours(new Date('2026-09-27T16:00:00Z'), { ...settings, timeZone: 'Asia/Bangkok' }),
    ).toBe(true));
  it('enforces all budget and snooze guardrails', () => {
    const history = [
      {
        memoryId: goal.id,
        createdAt: now.toISOString(),
        sentAt: now.toISOString(),
        status: 'snoozed',
        snoozedUntil: new Date(+now + 3600000).toISOString(),
      },
    ];
    const reasons = budgetReasons(
      { ...settings, maxNotificationsPerDay: 1, notificationsEnabled: false },
      history,
      goal.id,
      now,
      now.toISOString(),
    );
    expect(reasons).toEqual(
      expect.arrayContaining([
        'Notifications disabled',
        'Daily notification budget reached',
        'Minimum notification interval',
        'Per-goal cooldown',
        'Goal snoozed',
        'Dismissal cooldown',
      ]),
    );
  });
});
describe('API and full vertical slice', () => {
  it('rechecks changed context and budgets before desktop delivery', async () => {
    const store = db();
    store.setSettings({ trackingEnabled: true, timeZone: 'UTC' });
    const { app, conversation, activity, reminders } = createApp({
      store,
      now: () => now,
      collector: false,
    });
    try {
      await conversation.send(goal.title);
      activity.ingest([event()], true);
      reminders.evaluate(activity.context());
      expect(reminders.pending(activity.context())).toHaveLength(1);
      expect(
        reminders.pending({
          ...activity.context(),
          activeApplication: 'Chrome',
          activeWindowTitle: 'Meeting',
        }),
      ).toHaveLength(0);
      store.setSettings({ maxNotificationsPerDay: 0 });
      expect(reminders.pending(activity.context())).toHaveLength(0);
      store.setSettings({ maxNotificationsPerDay: 3, quietStart: 10, quietEnd: 14 });
      expect(reminders.pending(activity.context())).toHaveLength(0);
      store.setSettings({ trackingEnabled: false });
      expect(activity.context().activeApplication).toBe(null);
    } finally {
      await app.close();
    }
  });
  it('persists goal → context → candidate → notification → explanation → feedback', async () => {
    const store = db();
    store.setSettings({ timeZone: 'UTC', trackingEnabled: true });
    const { app, activity, reminders } = createApp({
      store,
      now: () => now,
      collector: false,
      token: 'test',
      desktopToken: 'desktop',
    });
    const headers = { 'x-local-token': 'test' };
    try {
      const chat = await app.inject({
        method: 'POST',
        url: '/api/v1/chat',
        headers,
        payload: { content: goal.title },
      });
      expect(chat.statusCode).toBe(200);
      expect(chat.json().memories[0].epistemicType).toBe('USER_STATEMENT');
      activity.ingest([event()], true);
      expect(activity.context().activeApplication).toBe('Blender');
      const decisions = reminders.evaluate(activity.context());
      expect(decisions[0].allowed).toBe(true);
      const history = (await app.inject('/api/v1/notifications')).json();
      expect(history).toHaveLength(1);
      expect(history[0].content).toContain('may relate');
      expect(history[0].explanation.epistemicType).toBe('INFERENCE');
      expect(history[0].explanation.reason.join(' ')).toContain('budget');
      expect(history[0].explanation.factors.contextMatch).toBe(1);
      expect((await app.inject('/api/v1/activity')).json()[0].application).toBe('Blender');
      await app.inject({
        method: 'POST',
        url: `/api/v1/notifications/${history[0].id}/action`,
        headers: { 'x-desktop-token': 'desktop' },
        payload: { action: 'sent' },
      });
      const action = await app.inject({
        method: 'POST',
        url: `/api/v1/notifications/${history[0].id}/action`,
        headers,
        payload: { action: 'snoozed', snoozeMinutes: 60 },
      });
      expect(action.statusCode).toBe(200);
      expect(action.json().status).toBe('snoozed');
      expect(reminders.list()[0].feedback.map((e) => e.type)).toContain('notification_snoozed');
      expect(reminders.evaluate(activity.context())).toEqual([]);
      const answer = await app.inject({
        method: 'POST',
        url: '/api/v1/chat',
        headers,
        payload: { content: 'What am I currently working on?' },
      });
      expect(answer.json().response).toContain('Observed now: Blender');
    } finally {
      await app.close();
    }
  });
  it('validates input, host, origin, token and adapter authority', async () => {
    const { app } = createApp({ store: db(), collector: false, token: 'test' });
    try {
      expect(
        (await app.inject({ method: 'POST', url: '/api/v1/chat', payload: { content: 'hi' } }))
          .statusCode,
      ).toBe(403);
      expect(
        (
          await app.inject({
            method: 'POST',
            url: '/api/v1/chat',
            headers: { 'x-local-token': 'test' },
            payload: { content: '' },
          })
        ).statusCode,
      ).toBe(400);
      expect(
        (
          await app.inject({
            url: '/api/v1/bootstrap',
            headers: { origin: 'https://evil.example' },
          })
        ).statusCode,
      ).toBe(403);
      expect(
        (await app.inject({ url: '/api/v1/bootstrap', headers: { host: 'evil.example' } }))
          .statusCode,
      ).toBe(403);
      expect((await app.inject('/api/v1/desktop/pending')).statusCode).toBe(403);
      expect(
        (
          await app.inject({
            method: 'PATCH',
            url: '/api/v1/settings',
            headers: { 'x-local-token': 'test' },
            payload: { maxNotificationsPerDay: -1 },
          })
        ).statusCode,
      ).toBe(400);
      expect(
        (
          await app.inject({
            method: 'PATCH',
            url: '/api/v1/settings',
            headers: { 'x-local-token': 'test' },
            payload: { weakThreshold: 0.9, strongThreshold: 0.8 },
          })
        ).statusCode,
      ).toBe(400);
    } finally {
      await app.close();
    }
  });
  it('suppresses delivery on stop and deletes activity plus derived evidence', async () => {
    const store = db();
    store.setSettings({ trackingEnabled: true, timeZone: 'UTC' });
    const { app, conversation, activity, reminders } = createApp({
      store,
      now: () => now,
      collector: false,
      token: 'test',
    });
    try {
      await conversation.send(goal.title);
      activity.ingest([event()], true);
      reminders.evaluate(activity.context());
      await conversation.send("Don't remind me about this anymore.");
      expect(store.settings().notificationsEnabled).toBe(false);
      expect(store.db.select().from(notifications).get()?.status).toBe('expired');
      const result = await app.inject({
        method: 'DELETE',
        url: '/api/v1/data/activity',
        headers: { 'x-local-token': 'test' },
      });
      expect(result.statusCode).toBe(200);
      expect(activity.context().activeApplication).toBe(null);
      expect(reminders.list()).toHaveLength(0);
      expect(store.settings().trackingEnabled).toBe(false);
    } finally {
      await app.close();
    }
  });
});
