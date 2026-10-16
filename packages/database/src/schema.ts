import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable('users', { id: text().primaryKey(), name: text().notNull() });
export const activityEvents = sqliteTable('activity_events', {
  id: text().primaryKey(),
  timestamp: text().notNull(),
  durationMs: integer('duration_ms').notNull(),
  source: text().notNull(),
  type: text().notNull(),
  application: text().notNull(),
  title: text().notNull(),
  idle: integer({ mode: 'boolean' }).notNull(),
  metadata: text().notNull(),
});
export const activitySessions = sqliteTable('activity_sessions', {
  id: text().primaryKey(),
  application: text().notNull(),
  title: text().notNull(),
  start: text().notNull(),
  end: text().notNull(),
  durationMs: integer('duration_ms').notNull(),
  idle: integer({ mode: 'boolean' }).notNull(),
  source: text().notNull(),
});
export const conversations = sqliteTable('conversations', {
  id: text().primaryKey(),
  createdAt: text('created_at').notNull(),
});
export const messages = sqliteTable('messages', {
  id: text().primaryKey(),
  conversationId: text('conversation_id')
    .notNull()
    .references(() => conversations.id, { onDelete: 'cascade' }),
  role: text().notNull(),
  content: text().notNull(),
  createdAt: text('created_at').notNull(),
});
export const memories = sqliteTable('memories', {
  id: text().primaryKey(),
  type: text().notNull(),
  title: text().notNull(),
  status: text().notNull(),
  deadline: text(),
  confidence: real().notNull(),
  epistemicType: text('epistemic_type').notNull(),
  sourceType: text('source_type').notNull(),
  sourceId: text('source_id').references(() => messages.id, { onDelete: 'cascade' }),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});
export const projects = sqliteTable('projects', {
  id: text().primaryKey(),
  name: text().notNull(),
});
export const goals = sqliteTable('goals', {
  id: text()
    .primaryKey()
    .references(() => memories.id, { onDelete: 'cascade' }),
  projectId: text('project_id').references(() => projects.id, { onDelete: 'set null' }),
});
export const tasks = sqliteTable('tasks', {
  id: text()
    .primaryKey()
    .references(() => memories.id, { onDelete: 'cascade' }),
  goalId: text('goal_id').references(() => goals.id, { onDelete: 'set null' }),
});
export const ideas = sqliteTable('ideas', {
  id: text()
    .primaryKey()
    .references(() => memories.id, { onDelete: 'cascade' }),
});
export const insights = sqliteTable('ai_insights', {
  id: text().primaryKey(),
  memoryId: text('memory_id').references(() => memories.id, { onDelete: 'cascade' }),
  epistemicType: text('epistemic_type').notNull(),
  content: text().notNull(),
  confidence: real().notNull(),
  evidence: text().notNull(),
  createdAt: text('created_at').notNull(),
});
export const candidates = sqliteTable('notification_candidates', {
  id: text().primaryKey(),
  memoryId: text('memory_id')
    .notNull()
    .references(() => memories.id, { onDelete: 'cascade' }),
  reason: text().notNull(),
  confidence: real().notNull(),
  suggestedAction: text('suggested_action').notNull(),
  estimatedEffortMinutes: integer('estimated_effort_minutes').notNull(),
  score: real().notNull(),
  decision: text().notNull(),
  explanation: text().notNull(),
  createdAt: text('created_at').notNull(),
});
export const notifications = sqliteTable('notifications', {
  id: text().primaryKey(),
  candidateId: text('candidate_id')
    .notNull()
    .references(() => candidates.id, { onDelete: 'cascade' }),
  memoryId: text('memory_id')
    .notNull()
    .references(() => memories.id, { onDelete: 'cascade' }),
  content: text().notNull(),
  status: text().notNull(),
  createdAt: text('created_at').notNull(),
  sentAt: text('sent_at'),
  snoozedUntil: text('snoozed_until'),
});
export const notificationEvents = sqliteTable('notification_events', {
  id: text().primaryKey(),
  notificationId: text('notification_id').references(() => notifications.id, {
    onDelete: 'cascade',
  }),
  candidateId: text('candidate_id').references(() => candidates.id, { onDelete: 'cascade' }),
  type: text().notNull(),
  createdAt: text('created_at').notNull(),
});
export const preferences = sqliteTable('user_preferences', {
  userId: text('user_id')
    .notNull()
    .references(() => users.id),
  key: text().primaryKey(),
  value: text().notNull(),
});
export type Memory = typeof memories.$inferSelect;
export type Session = typeof activitySessions.$inferSelect;
