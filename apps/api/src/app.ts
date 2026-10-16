import Fastify from 'fastify';
import staticPlugin from '@fastify/static';
import { z, ZodError } from 'zod';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { and, desc, eq, inArray, lt, sql } from 'drizzle-orm';
import { openDatabase, type Store } from '../../../packages/database/src';
import * as tables from '../../../packages/database/src/schema';
import {
  activityInput,
  feedbackSchema,
  memoryPatch,
  settingsSchema,
} from '../../../packages/shared/src/schema';
import { ActivityService } from '../../../packages/core/src/activity';
import { ReminderEngine } from '../../../packages/core/src/reminders';
import { ConversationService } from '../../../packages/core/src/conversation';
import {
  OpenAICompatibleProvider,
  testProvider,
  type LLMProvider,
} from '../../../packages/core/src/ai';
import { localAIProblem } from '../../../packages/core/src/ai-status';
import { WindowsActivityCollector } from '../../../packages/core/src/windows-collector';

export function createApp(
  options: {
    store?: Store;
    now?: () => Date;
    provider?: LLMProvider;
    collector?: boolean;
    token?: string;
    desktopToken?: string;
  } = {},
) {
  const store = options.store ?? openDatabase(process.env.DATABASE_PATH),
    now = options.now ?? (() => new Date());
  const app = Fastify({ logger: false, bodyLimit: 128 * 1024 });
  const token = options.token ?? crypto.randomUUID(),
    desktopToken = options.desktopToken ?? process.env.DESKTOP_TOKEN ?? crypto.randomUUID();
  const activity = new ActivityService(store, now),
    reminders = new ReminderEngine(store, now);
  const provider =
    options.provider ??
    (process.env.LLM_MODEL
      ? new OpenAICompatibleProvider({
          baseUrl: process.env.LLM_BASE_URL ?? 'http://127.0.0.1:11434/v1',
          apiKey: process.env.LLM_API_KEY ?? '',
          model: process.env.LLM_MODEL,
        })
      : undefined);
  const conversation = new ConversationService(store, activity, provider, now);
  const collector = new WindowsActivityCollector((event) => {
    activity.ingest([event]);
    reminders.evaluate(activity.context());
  });
  let maintenance: ReturnType<typeof setInterval> | undefined;
  const isDesktop = (header: unknown) => header === desktopToken;
  app.addHook('onRequest', async (req, reply) => {
    const host = req.headers.host ?? '';
    if (!/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host))
      return reply.code(403).send({ error: 'Local host required' });
    const origin = req.headers.origin;
    if (origin && !/^http:\/\/(127\.0\.0\.1|localhost):(4318|5190)$/.test(origin))
      return reply.code(403).send({ error: 'Origin not allowed' });
    reply.header('Cache-Control', 'no-store');
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self' ws://127.0.0.1:5190 ws://localhost:5190; img-src 'self' data:; frame-ancestors 'none'",
    );
    if (
      req.url.startsWith('/api/') &&
      !['GET', 'HEAD'].includes(req.method) &&
      req.headers['x-local-token'] !== token &&
      !isDesktop(req.headers['x-desktop-token'])
    )
      return reply.code(403).send({ error: 'Missing local capability token' });
  });
  app.setErrorHandler((error, req, reply) => {
    if (error instanceof ZodError)
      return reply.code(400).send({
        error: 'Invalid input',
        details: error.issues.map((i) => ({ path: i.path, message: i.message })),
      });
    const status = (error as { statusCode?: number }).statusCode;
    reply.code(status && status >= 400 && status < 500 ? status : 500).send({
      error:
        status && status < 500 && error instanceof Error
          ? error.message
          : 'Request could not be completed',
    });
  });
  app.get('/api/v1/health', () => ({ ok: true, version: '0.1.0' }));
  app.get('/api/v1/bootstrap', () => ({
    token,
    settings: store.settings(),
    provider: {
      configured: !!provider,
      model: process.env.LLM_MODEL ?? null,
      baseUrl: process.env.LLM_BASE_URL ?? null,
    },
    collector: collector.status(),
  }));
  app.get('/api/v1/settings', () => store.settings());
  app.get('/api/v1/ai/status', () => ({
    configured: !!provider,
    enabled: store.settings().llmEnabled,
    model: process.env.LLM_MODEL ?? null,
    baseUrl: (() => {
      try {
        const url = new URL(process.env.LLM_BASE_URL ?? 'http://127.0.0.1:11434/v1');
        return url.origin + url.pathname;
      } catch {
        return null;
      }
    })(),
    problem: localAIProblem(store.settings().llmEnabled, !!provider),
  }));
  let providerTestBusy = false;
  app.post('/api/v1/ai/test', async (_req, reply) => {
    if (providerTestBusy)
      return reply.code(429).send({ error: 'An AI connection test is already running' });
    providerTestBusy = true;
    try {
      return await testProvider(provider);
    } finally {
      providerTestBusy = false;
    }
  });
  app.patch('/api/v1/settings', async (req) => {
    const patch = settingsSchema.partial().parse(req.body);
    const combined = { ...store.settings(), ...patch };
    if (combined.weakThreshold > combined.strongThreshold)
      throw new ZodError([
        { code: 'custom', path: ['weakThreshold'], message: 'Must not exceed strong threshold' },
      ]);
    const settings = store.setSettings(patch);
    if (options.collector !== false) {
      if (settings.trackingEnabled) collector.start();
      else collector.stop();
    }
    if (!settings.notificationsEnabled || !settings.trackingEnabled)
      store.db
        .update(tables.notifications)
        .set({ status: 'expired' })
        .where(eq(tables.notifications.status, 'pending'))
        .run();
    return settings;
  });
  app.post('/api/v1/activity/events', (req) => {
    const events = z
      .object({ events: z.array(activityInput).min(1).max(100) })
      .strict()
      .parse(req.body).events;
    if (
      events.some(
        (e) =>
          e.source !== 'windows-desktop' || Math.abs(Date.parse(e.timestamp) - +now()) > 120000,
      )
    )
      throw new ZodError([
        { code: 'custom', path: ['events'], message: 'Only recent Windows activity is accepted' },
      ]);
    const result = activity.ingest(events);
    reminders.evaluate(activity.context());
    return result;
  });
  const timelineQuery = z.object({
    application: z.string().max(200).optional(),
    from: z.iso.datetime().optional(),
    to: z.iso.datetime().optional(),
    kind: z.enum(['events', 'sessions']).optional(),
  });
  app.get('/api/v1/activity', (req) => activity.timeline(timelineQuery.parse(req.query)));
  app.get('/api/v1/activity/timeline', (req) => activity.timeline(timelineQuery.parse(req.query)));
  app.get('/api/v1/activity/current', () => activity.context());
  app.get('/api/v1/context/current', () => activity.context());
  app.get('/api/v1/dashboard', () => {
    const start = new Date(now());
    start.setHours(0, 0, 0, 0);
    const timeline = activity.timeline({ from: start.toISOString() });
    const sessions = store.db
      .select()
      .from(tables.activitySessions)
      .where(sql`${tables.activitySessions.end} >= ${start.toISOString()}`)
      .all();
    const usage: Record<string, number> = {};
    for (const s of sessions)
      if (!s.idle) {
        const span = Math.max(1, Date.parse(s.end) - Date.parse(s.start));
        const overlap = Math.max(0, Date.parse(s.end) - Math.max(+start, Date.parse(s.start)));
        usage[s.application] =
          (usage[s.application] ?? 0) + Math.min(s.durationMs, (s.durationMs * overlap) / span);
      }
    return {
      context: activity.context(),
      timeline,
      usage,
      memories: store.db
        .select()
        .from(tables.memories)
        .where(
          inArray(tables.memories.status, ['active', 'stale', 'inactive', 'possibly_abandoned']),
        )
        .all(),
      notifications: reminders.list(),
      collector: collector.status(),
      settings: store.settings(),
    };
  });
  let chatBusy = false;
  app.post('/api/v1/chat', async (req, reply) => {
    const body = z
      .object({ content: z.string().trim().min(1).max(8000), conversationId: z.uuid().optional() })
      .strict()
      .parse(req.body);
    if (chatBusy) return reply.code(429).send({ error: 'A chat response is already in progress' });
    if (
      body.conversationId &&
      !store.db
        .select()
        .from(tables.conversations)
        .where(eq(tables.conversations.id, body.conversationId))
        .get()
    )
      return reply.code(404).send({ error: 'Conversation not found' });
    chatBusy = true;
    try {
      return await conversation.send(body.content, body.conversationId);
    } finally {
      chatBusy = false;
    }
  });
  app.get('/api/v1/messages', () =>
    store.db
      .select()
      .from(tables.messages)
      .orderBy(desc(tables.messages.createdAt))
      .limit(200)
      .all()
      .reverse(),
  );
  for (const [path, types] of [
    ['memories', null],
    ['goals', ['GOAL', 'COMMITMENT']],
    ['tasks', ['TASK']],
  ] as const) {
    app.get(`/api/v1/${path}`, () =>
      store.db
        .select()
        .from(tables.memories)
        .where(types ? inArray(tables.memories.type, [...types]) : undefined)
        .orderBy(desc(tables.memories.createdAt))
        .all(),
    );
    app.patch(`/api/v1/${path}/:id`, (req, reply) => {
      const { id } = z.object({ id: z.uuid() }).parse(req.params),
        patch = memoryPatch.parse(req.body);
      const memory = store.db
        .select()
        .from(tables.memories)
        .where(eq(tables.memories.id, id))
        .get();
      if (!memory) return reply.code(404).send({ error: 'Memory not found' });
      store.db
        .update(tables.memories)
        .set({ ...patch, updatedAt: now().toISOString() })
        .where(eq(tables.memories.id, id))
        .run();
      if (patch.status && ['archived', 'completed'].includes(patch.status))
        store.db
          .update(tables.notifications)
          .set({ status: 'expired' })
          .where(
            and(eq(tables.notifications.memoryId, id), eq(tables.notifications.status, 'pending')),
          )
          .run();
      return store.db.select().from(tables.memories).where(eq(tables.memories.id, id)).get();
    });
  }
  app.delete('/api/v1/memories/:id', (req, reply) => {
    const { id } = z.object({ id: z.uuid() }).parse(req.params);
    const result = store.db.delete(tables.memories).where(eq(tables.memories.id, id)).run();
    return result.changes ? { deleted: true } : reply.code(404).send({ error: 'Memory not found' });
  });
  app.get('/api/v1/notifications', () => reminders.list());
  app.get('/api/v1/notification-candidates', () =>
    store.db
      .select()
      .from(tables.candidates)
      .orderBy(desc(tables.candidates.createdAt))
      .limit(100)
      .all()
      .map((c) => ({ ...c, explanation: JSON.parse(c.explanation) })),
  );
  app.post('/api/v1/notifications/:id/action', (req, reply) => {
    const { id } = z.object({ id: z.uuid() }).parse(req.params),
      input = feedbackSchema.parse(req.body);
    if (
      ['sent', 'delivery_failed'].includes(input.action) &&
      !isDesktop(req.headers['x-desktop-token'])
    )
      return reply.code(403).send({ error: 'Desktop adapter required' });
    return reminders.action(id, input) ?? reply.code(404).send({ error: 'Notification not found' });
  });
  app.get('/api/v1/desktop/pending', (req, reply) => {
    if (!isDesktop(req.headers['x-desktop-token']))
      return reply.code(403).send({ error: 'Desktop adapter required' });
    return reminders.pending(activity.context());
  });
  app.post('/api/v1/reminders/evaluate', () => ({
    decisions: reminders.evaluate(activity.context()),
  }));
  app.get('/api/v1/insights', () =>
    store.db
      .select()
      .from(tables.insights)
      .orderBy(desc(tables.insights.createdAt))
      .limit(200)
      .all(),
  );
  app.delete('/api/v1/insights/:id', (req) => {
    const { id } = z.object({ id: z.uuid() }).parse(req.params);
    store.db.delete(tables.insights).where(eq(tables.insights.id, id)).run();
    return { deleted: true };
  });
  app.delete('/api/v1/data/:scope', (req, reply) => {
    if (chatBusy)
      return reply
        .code(409)
        .send({ error: 'Wait for the current chat response before deleting data' });
    const { scope } = z
      .object({ scope: z.enum(['activity', 'interpretations', 'conversations', 'all']) })
      .parse(req.params);
    if (scope === 'activity' || scope === 'all') {
      store.setSettings({ trackingEnabled: false });
      collector.stop();
    }
    store.db.transaction((tx) => {
      if (scope === 'activity' || scope === 'all') {
        tx.delete(tables.activityEvents).run();
        tx.delete(tables.activitySessions).run();
      }
      if (scope === 'interpretations' || scope === 'activity' || scope === 'all') {
        tx.delete(tables.insights).run();
        tx.delete(tables.candidates).run();
      }
      if (scope === 'conversations' || scope === 'all') tx.delete(tables.conversations).run();
      if (scope === 'all') {
        tx.delete(tables.memories).run();
        tx.delete(tables.projects).run();
        tx.delete(tables.notificationEvents).run();
        tx.delete(tables.preferences).run();
      }
    });
    store.sqlite.pragma('wal_checkpoint(TRUNCATE)');
    store.sqlite.exec('VACUUM');
    return { deleted: scope };
  });
  if (existsSync(resolve('dist/web')))
    app.register(staticPlugin, { root: resolve('dist/web'), prefix: '/' });
  app.addHook('onReady', async () => {
    if (options.collector !== false) {
      if (store.settings().trackingEnabled) collector.start();
      maintenance = setInterval(() => {
        reminders.evaluate(activity.context());
        const cutoff = new Date(+now() - store.settings().retentionDays * 86400000).toISOString();
        store.db
          .delete(tables.activityEvents)
          .where(lt(tables.activityEvents.timestamp, cutoff))
          .run();
        store.db
          .delete(tables.activitySessions)
          .where(lt(tables.activitySessions.end, cutoff))
          .run();
        store.db.delete(tables.insights).where(lt(tables.insights.createdAt, cutoff)).run();
        store.db.delete(tables.candidates).where(lt(tables.candidates.createdAt, cutoff)).run();
      }, 60000);
      maintenance.unref();
    }
  });
  app.addHook('onClose', async () => {
    collector.stop();
    if (maintenance) clearInterval(maintenance);
    if (!options.store) store.close();
  });
  return { app, store, activity, reminders, conversation, token, desktopToken };
}
