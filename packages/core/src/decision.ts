import type { ContextSnapshot, Settings } from '../../shared/src/schema';
import type { Memory, Session } from '../../database/src/schema';

export function contextMatch(title: string, application: string, window: string) {
  const stop = new Set([
    'want',
    'finish',
    'should',
    'need',
    'continue',
    'project',
    'this',
    'that',
    'with',
    'have',
    'make',
    'work',
    'working',
    'later',
    'remember',
    'characterization',
  ]);
  const tokens = (title.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? []).filter(
    (t) => !stop.has(t),
  );
  const haystack = `${application} ${window}`.toLowerCase();
  const matches = tokens.filter((t) => haystack.includes(t));
  return matches.length === 0 ? 0 : Math.min(1, 0.7 + matches.length * 0.15);
}
export type Candidate = {
  memory: Memory;
  reason: string;
  confidence: number;
  suggestedAction: string;
  estimatedEffortMinutes: number;
  match: number;
  inactivity: number;
  urgency: number;
  historySessionId: string | null;
};
export function generateCandidates(
  memories: Memory[],
  sessions: Session[],
  context: ContextSnapshot,
  now: Date,
): Candidate[] {
  return memories
    .filter(
      (m) =>
        ['GOAL', 'TASK', 'COMMITMENT', 'REMINDER'].includes(m.type) &&
        ['active', 'inactive', 'stale', 'possibly_abandoned'].includes(m.status),
    )
    .flatMap((memory) => {
      const match = contextMatch(
        memory.title,
        context.activeApplication ?? '',
        context.activeWindowTitle ?? '',
      );
      const deadline = memory.deadline ? Date.parse(memory.deadline) : null;
      const urgency =
        deadline === null ? 0 : Math.max(0, Math.min(1, 1 - (deadline - +now) / 172800000));
      const history = sessions.find(
        (s) =>
          !s.idle &&
          contextMatch(memory.title, s.application, s.title) > 0.7 &&
          +now - Date.parse(s.end) > 3600000,
      );
      const days = history
        ? (+now - Date.parse(history.end)) / 86400000
        : (+now - Date.parse(memory.createdAt)) / 86400000;
      if (!match && urgency < 0.5 && days < 3) return [];
      return [
        {
          memory,
          reason: match
            ? history
              ? 'related_project_reopened'
              : 'related_project_opened'
            : urgency >= 0.5
              ? 'deadline_approaching'
              : 'no_recent_matching_activity',
          confidence: Math.min(memory.confidence, match ? 0.9 : 0.6),
          suggestedAction: `Spend 10 minutes on one small next step: ${memory.title}`,
          estimatedEffortMinutes: 10,
          match,
          inactivity: Math.min(1, days / 7),
          urgency,
          historySessionId: history?.id ?? null,
        },
      ];
    });
}
export function quietHours(now: Date, settings: Settings) {
  const hour = Number(
    new Intl.DateTimeFormat('en-GB', {
      hour: '2-digit',
      hourCycle: 'h23',
      timeZone: settings.timeZone,
    }).format(now),
  );
  return settings.quietStart === settings.quietEnd
    ? false
    : settings.quietStart < settings.quietEnd
      ? hour >= settings.quietStart && hour < settings.quietEnd
      : hour >= settings.quietStart || hour < settings.quietEnd;
}
export type BudgetNotification = {
  memoryId: string;
  createdAt: string;
  status: string;
  snoozedUntil: string | null;
  sentAt: string | null;
};
export function budgetReasons(
  settings: Settings,
  history: BudgetNotification[],
  memoryId: string,
  now: Date,
  lastDismissed?: string,
): string[] {
  const reasons: string[] = [];
  if (!settings.notificationsEnabled) reasons.push('Notifications disabled');
  if (quietHours(now, settings)) reasons.push('Quiet hours');
  const day = (date: Date) =>
    new Intl.DateTimeFormat('en-CA', {
      timeZone: settings.timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
  const counted = history.filter((n) => n.status !== 'delivery_failed' && n.status !== 'expired');
  if (
    counted.filter((n) => day(new Date(n.createdAt)) === day(now)).length >=
    settings.maxNotificationsPerDay
  )
    reasons.push('Daily notification budget reached');
  if (
    counted.some(
      (n) => +now - Date.parse(n.createdAt) < settings.minimumMinutesBetweenNotifications * 60000,
    )
  )
    reasons.push('Minimum notification interval');
  if (
    counted.some(
      (n) =>
        n.memoryId === memoryId &&
        +now - Date.parse(n.createdAt) < settings.perGoalCooldownMinutes * 60000,
    )
  )
    reasons.push('Per-goal cooldown');
  if (
    history.some(
      (n) => n.memoryId === memoryId && n.snoozedUntil && Date.parse(n.snoozedUntil) > +now,
    )
  )
    reasons.push('Goal snoozed');
  if (lastDismissed && +now - Date.parse(lastDismissed) < settings.dismissalCooldownMinutes * 60000)
    reasons.push('Dismissal cooldown');
  return reasons;
}
export function scoreCandidate(
  candidate: Candidate,
  context: ContextSnapshot,
  settings: Settings,
  historySuccess = 0.5,
  fatigue = 0,
) {
  const interruptionCost = context.currentSessionDurationSeconds > 1200 ? 0.8 : 0;
  const factors = {
    relevance: 1,
    contextMatch: candidate.match,
    timing: context.idle ? 0 : 1,
    urgency: candidate.urgency,
    historicalSuccess: historySuccess,
    inactivitySinceProgress: candidate.inactivity,
    confidence: candidate.confidence,
    interruptionCost,
    notificationFatigue: fatigue,
  };
  const score = Math.max(
    0,
    Math.min(
      1,
      0.22 * factors.relevance +
        0.3 * factors.contextMatch +
        0.16 * factors.timing +
        0.07 * factors.urgency +
        0.08 * factors.historicalSuccess +
        0.05 * factors.inactivitySinceProgress +
        0.12 * factors.confidence -
        0.25 * interruptionCost -
        0.25 * fatigue,
    ),
  );
  const decision =
    score >= settings.strongThreshold
      ? 'STRONG_CANDIDATE'
      : score >= settings.weakThreshold
        ? 'WEAK_CANDIDATE'
        : 'SUPPRESS';
  const blocked: string[] = [];
  if (context.stale) blocked.push('No fresh activity context');
  if (context.idle) blocked.push('Computer is idle');
  if (context.fullscreen) blocked.push('Fullscreen application');
  if (context.rapidSwitching) blocked.push('Rapid application switching');
  if (context.recentlyResumed) blocked.push('Recently returned from idle');
  if (
    /teams|zoom|powerpnt|powerpoint|vlc|mpv/i.test(context.activeApplication ?? '') ||
    /presenting|slide show|meeting|youtube|netflix/i.test(context.activeWindowTitle ?? '')
  )
    blocked.push('Possible meeting, presentation or video');
  return { score, factors, decision, blocked };
}
export interface NotificationContentGenerator {
  generate(candidate: Candidate, context: ContextSnapshot): string;
}
export class ContextualNotificationContent implements NotificationContentGenerator {
  generate(candidate: Candidate, context: ContextSnapshot) {
    const title = candidate.memory.title.replace(/[.!?]+$/, '');
    if (/[\u0E00-\u0E7F]/.test(title))
      return candidate.match
        ? `คุณเปิด ${context.activeApplication} ซึ่งอาจเกี่ยวกับ “${title}” ลองใช้เวลา 10 นาทีทำต่ออีกนิดไหม?`
        : `คุณเคยบอกว่า “${title}” ถ้ามีเวลา ลองเลือกสิ่งเล็ก ๆ ที่จะทำต่อดูไหม?`;
    return candidate.match
      ? `You opened ${context.activeApplication}. This may relate to “${title}”. Want to spend 10 minutes on one small next step?`
      : `You mentioned “${title}”. Want to choose one small next step when you have a moment?`;
  }
}
