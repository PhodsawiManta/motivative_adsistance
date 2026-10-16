import { and, desc, eq, gte, lte } from 'drizzle-orm';
import type { Store } from '../../database/src';
import {
  conversations,
  messages,
  memories,
  goals,
  tasks,
  ideas,
  activitySessions,
  notifications,
  notificationEvents,
} from '../../database/src/schema';
import { MemoryExtractor, ConversationResponder, type LLMProvider } from './ai';
import { isRecallQuestion } from './ai-status';
import type { ActivityService } from './activity';

export class ConversationService {
  private extractor: MemoryExtractor;
  private responder: ConversationResponder;
  constructor(
    private store: Store,
    private activity: ActivityService,
    provider?: LLMProvider,
    private now: () => Date = () => new Date(),
  ) {
    this.extractor = new MemoryExtractor(provider);
    this.responder = new ConversationResponder(provider);
  }
  async send(content: string, conversationId?: string) {
    const db = this.store.db,
      timestamp = this.now().toISOString();
    if (
      conversationId &&
      !db.select().from(conversations).where(eq(conversations.id, conversationId)).get()
    )
      throw new Error('Conversation not found');
    if (!conversationId) {
      conversationId = crypto.randomUUID();
      db.insert(conversations).values({ id: conversationId, createdAt: timestamp }).run();
    }
    const id = crypto.randomUUID();
    db.insert(messages)
      .values({ id, conversationId, role: 'user', content, createdAt: timestamp })
      .run();
    const recent = db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, conversationId))
      .orderBy(desc(messages.createdAt))
      .limit(12)
      .all()
      .reverse();
    // A direct stop request takes effect without relying on a model or uncertain goal resolution.
    const stop =
      /\b(don['’]t|do not|stop)\s+(remind|reminding|notifications)|ไม่ต้องเตือน|หยุดแจ้งเตือน|ปิดการแจ้งเตือน/i.test(
        content,
      );
    if (stop) {
      this.store.setSettings({ notificationsEnabled: false });
      db.update(notifications)
        .set({ status: 'expired' })
        .where(eq(notifications.status, 'pending'))
        .run();
    }
    const extracted = await this.extractor.extract(
      content,
      JSON.stringify(recent),
      this.store.settings().llmEnabled,
    );
    const created: (typeof memories.$inferSelect)[] = [];
    db.transaction((tx) => {
      for (const value of extracted.memories) {
        const duplicate = tx
          .select()
          .from(memories)
          .where(and(eq(memories.title, value.title), eq(memories.type, value.type)))
          .get();
        if (duplicate) continue;
        const memory = {
          ...value,
          id: crypto.randomUUID(),
          status: 'active',
          epistemicType: 'USER_STATEMENT',
          sourceType: 'conversation',
          sourceId: id,
          createdAt: timestamp,
          updatedAt: timestamp,
        };
        tx.insert(memories).values(memory).run();
        if (value.type === 'GOAL' || value.type === 'COMMITMENT')
          tx.insert(goals).values({ id: memory.id }).run();
        if (value.type === 'TASK') tx.insert(tasks).values({ id: memory.id }).run();
        if (value.type === 'IDEA') tx.insert(ideas).values({ id: memory.id }).run();
        created.push(memory);
      }
    });
    const recall = isRecallQuestion(content);
    const evidence = recall ? this.retrieve(content) : {};
    const fallback = stop
      ? /[\u0E00-\u0E7F]/.test(content)
        ? 'ปิดการแจ้งเตือนแล้ว คุณเปิดอีกครั้งได้ในหน้าตั้งค่า'
        : 'Reminders are now disabled. You can re-enable them in Settings.'
      : created.length
        ? /[\u0E00-\u0E7F]/.test(content)
          ? `บันทึก ${created.map((m) => `“${m.title}”`).join(' และ ')} แล้ว คุณแก้ไขได้ในหน้าความจำ`
          : `I saved ${created.map((m) => `${m.type.toLowerCase()}: “${m.title}”`).join('; ')}. You can edit this in Memory. ${created.some((m) => /\bby\b/i.test(m.title) && !m.deadline) ? 'The deadline was not resolved; set an exact date in Memory.' : ''}`
        : recall
          ? this.localSummary(content, evidence as ReturnType<ConversationService['retrieve']>)
          : !this.store.settings().llmEnabled
            ? /[\u0E00-\u0E7F]/.test(content)
              ? 'AI ในแชตยังปิดอยู่ครับ แม้ทดสอบการเชื่อมต่อสำเร็จแล้ว ให้เลือก “เปิดใช้ AI ในแชต” ในหน้าตั้งค่า แล้วกดบันทึกการตั้งค่า จากนั้นส่งข้อความอีกครั้งได้เลย'
              : 'AI chat is turned off, even if the connection test succeeds. Enable AI chat in Settings and save your settings, then send your message again.'
            : /[\u0E00-\u0E7F]/.test(content)
              ? 'ตอนนี้แชตยังไม่ได้เชื่อมต่อ AI ครับ ดูสาเหตุและวิธีแก้ในสถานะ AI ด้านบนได้เลย ระหว่างนี้ยังบันทึกข้อความและใช้ความจำแบบ local ได้'
              : 'AI chat is not connected right now. Check the AI status above for the reason and next step. I can still save your messages and use local memory rules.';
    const result = stop
      ? { text: fallback, mode: 'local action', problem: null }
      : await this.responder.respond(
          content,
          { ...evidence, conversation: recent, createdMemories: created },
          fallback,
          this.store.settings().llmEnabled,
          recall,
        );
    const response = result.text;
    db.insert(messages)
      .values({
        id: crypto.randomUUID(),
        conversationId,
        role: 'assistant',
        content: response,
        createdAt: this.now().toISOString(),
      })
      .run();
    return {
      conversationId,
      response,
      memories: created,
      mode: result.mode,
      aiProblem: result.problem,
      extraction: { mode: extracted.mode, problem: extracted.problem },
    };
  }
  retrieve(question: string) {
    const now = this.now();
    let from = new Date(+now - 7 * 86400000),
      to = now;
    if (/yesterday|เมื่อวาน/i.test(question)) {
      from = new Date(now);
      from.setHours(0, 0, 0, 0);
      to = new Date(from);
      from.setDate(from.getDate() - 1);
    }
    if (/last week|สัปดาห์ที่แล้ว|อาทิตย์ที่แล้ว/i.test(question)) {
      to = new Date(now);
      to.setHours(0, 0, 0, 0);
      to.setDate(to.getDate() - ((to.getDay() + 6) % 7));
      from = new Date(+to - 7 * 86400000);
    }
    const rows = this.store.db
      .select()
      .from(activitySessions)
      .where(
        and(
          gte(activitySessions.end, from.toISOString()),
          lte(activitySessions.start, to.toISOString()),
        ),
      )
      .orderBy(desc(activitySessions.end))
      .limit(150)
      .all();
    const memoryRows = this.store.db
      .select()
      .from(memories)
      .orderBy(desc(memories.createdAt))
      .limit(300)
      .all();
    const filtered = memoryRows.filter((m) =>
      /ideas|ไอเดีย/i.test(question)
        ? m.type === 'IDEA'
        : /last week|สัปดาห์ที่แล้ว|อาทิตย์ที่แล้ว/i.test(question)
          ? m.createdAt >= from.toISOString() && m.createdAt < to.toISOString()
          : /unfinished|haven.t|stale|งานที่ค้าง|ทำอะไรค้าง/i.test(question)
            ? !['completed', 'archived'].includes(m.status)
            : true,
    );
    return {
      range: { from: from.toISOString(), to: to.toISOString() },
      activity: rows.map((r) => ({ ...r, epistemicType: 'OBSERVATION' })),
      memories: filtered,
      current: this.activity.context(),
    };
  }
  private localSummary(question: string, evidence: ReturnType<ConversationService['retrieve']>) {
    if (/[\u0E00-\u0E7F]/.test(question)) {
      if (/ตอนนี้|ทำอะไรอยู่/i.test(question))
        return evidence.current.activeApplication
          ? `ขณะนี้พบการใช้งาน ${evidence.current.activeApplication} แต่ยังสรุปไม่ได้ว่าคุณกำลังทำเป้าหมายใด`
          : 'ยังไม่มีกิจกรรมล่าสุด เปิดการบันทึกกิจกรรมเพื่อดูแอปที่กำลังใช้งาน';
      const usage = new Map<string, number>();
      for (const session of evidence.activity)
        if (!session.idle)
          usage.set(
            session.application,
            (usage.get(session.application) ?? 0) + session.durationMs,
          );
      const observed = usage.size
        ? `กิจกรรมในช่วงเวลาที่ถาม: ${[...usage].map(([app, ms]) => `${app} ${Math.round(ms / 60000)} นาที`).join(', ')}`
        : 'ไม่มีบันทึกกิจกรรมในช่วงเวลาที่ถาม';
      const statements = evidence.memories.length
        ? `สิ่งที่คุณเคยบอก: ${evidence.memories
            .slice(0, 8)
            .map((m) => m.title)
            .join(' · ')}`
        : 'ไม่พบความจำที่ตรงกัน';
      return `${observed}\n\n${statements}\n\nการใช้งานแอปไม่ได้ยืนยันว่างานคืบหน้าหรือเสร็จแล้ว`;
    }
    if (/current|now/i.test(question))
      return evidence.current.activeApplication
        ? `Observed now: ${evidence.current.activeApplication}${evidence.current.activeWindowTitle ? ` — ${evidence.current.activeWindowTitle}` : ''}. This does not establish which goal you are working on.`
        : 'There is no fresh activity observation. Enable tracking to see the current application.';
    const usage = new Map<string, number>();
    for (const s of evidence.activity)
      if (!s.idle) usage.set(s.application, (usage.get(s.application) ?? 0) + s.durationMs);
    const observed = usage.size
      ? `Observed foreground activity in the retrieved period: ${[...usage].map(([app, ms]) => `${app}: ${Math.round(ms / 60000)} minutes`).join(', ')}.`
      : 'No activity was recorded in the requested period.';
    const statements = evidence.memories.length
      ? `Your recorded statements: ${evidence.memories
          .slice(0, 8)
          .map((m) => `[${m.type}; ${m.status}] ${m.title}`)
          .join('; ')}.`
      : 'No matching memories are recorded.';
    return `${observed}\n\n${statements}\n\nActivity is evidence of application use, not proof of progress or completion. ${/haven.t|stale|unfinished/i.test(question) ? 'Active memories may remain unfinished; absence of matching activity is not evidence of abandonment.' : ''}`;
  }
}
