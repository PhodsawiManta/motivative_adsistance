import { z } from 'zod';

export const memoryTypes = [
  'IDEA',
  'INTEREST',
  'GOAL',
  'TASK',
  'COMMITMENT',
  'REMINDER',
  'PREFERENCE',
  'CONTEXT',
] as const;
export const states = [
  'active',
  'inactive',
  'stale',
  'possibly_abandoned',
  'completed',
  'archived',
] as const;
export const memoryInput = z.object({
  type: z.enum(memoryTypes),
  title: z.string().min(1).max(500),
  deadline: z.iso.datetime().nullable().default(null),
  confidence: z.number().min(0).max(1),
});
export const extractionSchema = z.object({ memories: z.array(memoryInput).max(12) });
export const memoryPatch = z
  .object({
    title: z.string().min(1).max(500).optional(),
    status: z.enum(states).optional(),
    deadline: z.iso.datetime().nullable().optional(),
  })
  .strict();
export const activityInput = z
  .object({
    id: z.uuid(),
    timestamp: z.iso.datetime(),
    durationMs: z.number().int().min(0).max(60000),
    source: z.enum(['windows-desktop', 'simulation']),
    type: z.literal('foreground_window'),
    application: z.string().min(1).max(200),
    title: z.string().max(1000),
    idle: z.boolean(),
    metadata: z
      .object({
        fullscreen: z.boolean().default(false),
        idleSeconds: z.number().nonnegative().max(31536000).default(0),
      })
      .strict(),
  })
  .strict();
export type ActivityInput = z.infer<typeof activityInput>;
export const settingsSchema = z
  .object({
    trackingEnabled: z.boolean().default(false),
    notificationsEnabled: z.boolean().default(true),
    llmEnabled: z.boolean().default(false),
    excludedApplications: z.array(z.string().min(1).max(100)).max(100).default([]),
    storeWindowTitles: z.boolean().default(true),
    maxNotificationsPerDay: z.number().int().min(0).max(20).default(3),
    minimumMinutesBetweenNotifications: z.number().int().min(0).max(10080).default(180),
    perGoalCooldownMinutes: z.number().int().min(0).max(43200).default(1440),
    dismissalCooldownMinutes: z.number().int().min(0).max(10080).default(360),
    quietStart: z.number().int().min(0).max(23).default(23),
    quietEnd: z.number().int().min(0).max(23).default(8),
    timeZone: z
      .string()
      .refine((v) => {
        try {
          new Intl.DateTimeFormat('en', { timeZone: v });
          return true;
        } catch {
          return false;
        }
      }, 'Invalid IANA time zone')
      .default(Intl.DateTimeFormat().resolvedOptions().timeZone),
    weakThreshold: z.number().min(0).max(1).default(0.65),
    strongThreshold: z.number().min(0).max(1).default(0.8),
    retentionDays: z.number().int().min(1).max(3650).default(90),
  })
  .strict();
export type Settings = z.infer<typeof settingsSchema>;
export const feedbackSchema = z
  .object({
    action: z.enum(['opened', 'dismissed', 'snoozed', 'ignored', 'sent', 'delivery_failed']),
    snoozeMinutes: z.number().int().min(5).max(10080).default(60),
  })
  .strict();
export type ContextSnapshot = {
  timestamp: string;
  activeApplication: string | null;
  activeWindowTitle: string | null;
  idle: boolean;
  currentSessionDurationSeconds: number;
  recentApplications: string[];
  rapidSwitching: boolean;
  recentlyResumed: boolean;
  fullscreen: boolean;
  stale: boolean;
};
