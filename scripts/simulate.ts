import { openDatabase } from '../packages/database/src';
import { createApp } from '../apps/api/src/app';
const store = openDatabase(':memory:');
const now = new Date('2026-09-27T12:00:00.000Z');
store.setSettings({ timeZone: 'UTC', trackingEnabled: true });
const { app, conversation, activity, reminders } = createApp({
  store,
  now: () => now,
  collector: false,
});
try {
  const chat = await conversation.send('I want to finish my Blender character.');
  activity.ingest(
    [
      {
        id: crypto.randomUUID(),
        timestamp: now.toISOString(),
        durationMs: 15000,
        source: 'simulation',
        type: 'foreground_window',
        application: 'Blender',
        title: 'character.blend - Blender',
        idle: false,
        metadata: { fullscreen: false, idleSeconds: 0 },
      },
    ],
    true,
  );
  const decisions = reminders.evaluate(activity.context());
  const notices = reminders.list();
  if (!chat.memories.length || !decisions[0]?.allowed || !notices.length)
    throw new Error('Vertical slice did not generate a notification');
  console.log(
    JSON.stringify(
      {
        goal: chat.memories[0],
        context: activity.context(),
        decision: decisions[0],
        notification: notices[0],
      },
      null,
      2,
    ),
  );
  console.log(
    'PASS: isolated Blender simulation; no real activity recorded and no desktop toast sent.',
  );
} finally {
  await app.close();
  store.close();
}
