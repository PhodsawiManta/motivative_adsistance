import { useEffect, useState } from 'react';
import { api, type Memory as MemoryType, type AIStatus, type AIProblem } from '../api';
import type { Action } from '../App';
import { Empty } from './Overview';
import { label, problemText } from '../locale';
type Message = { id: string; role: string; content: string; conversationId: string };
export function Chat({ action }: { action: Action }) {
  const [messages, setMessages] = useState<Message[]>([]),
    [text, setText] = useState(''),
    [busy, setBusy] = useState(false),
    [mode, setMode] = useState(''),
    [status, setStatus] = useState<AIStatus>(),
    [problem, setProblem] = useState<AIProblem | null>(null),
    [memoryWarning, setMemoryWarning] = useState<string | null>(null);
  const load = async () => setMessages(await api<Message[]>('/messages'));
  useEffect(() => {
    void action(async () => {
      await load();
      const current = await api<AIStatus>('/ai/status');
      setStatus(current);
      setProblem(current.problem);
    });
  }, []);
  async function send() {
    if (!text.trim() || busy) return;
    setBusy(true);
    await action(async () => {
      const result = await api<{
        mode: string;
        aiProblem: AIProblem | null;
        extraction: { problem: AIProblem | null };
      }>('/chat', 'POST', {
        content: text,
        ...(messages.length
          ? { conversationId: messages[messages.length - 1].conversationId }
          : {}),
      });
      setMode(result.mode);
      setProblem(result.aiProblem);
      setMemoryWarning(
        result.mode === 'AI response' && result.extraction.problem
          ? problemText(result.extraction.problem)
          : null,
      );
      setText('');
      await load();
    });
    setBusy(false);
  }
  return (
    <>
      <div className="page-title">
        <div className="eyebrow">พื้นที่ให้คุณเล่าความคิด</div>
        <h1>มีอะไรอยู่ในใจบ้าง?</h1>
        <p>ไอเดียยังเป็นแค่ไอเดียได้ ผมจะจำสิ่งที่คุณเล่าให้ฟัง</p>
      </div>
      <section className="panel chat-panel">
        <div className="ai-status" role="status">
          <strong>
            {mode === 'AI response'
              ? 'ได้รับคำตอบจาก AI แล้ว'
              : status?.enabled && status?.configured
                ? 'เปิดใช้งาน AI แล้ว'
                : status
                  ? 'โหมดในเครื่อง'
                  : 'กำลังตรวจสอบการตั้งค่า AI…'}
          </strong>
          {status?.model && <span>โมเดล: {status.model}</span>}
          {problem ? (
            <p>{problemText(problem)}</p>
          ) : status && !mode ? (
            <p>ระบบจะตรวจสอบการเชื่อมต่อเมื่อคุณส่งข้อความ</p>
          ) : null}
          {memoryWarning && <p>สกัดความจำด้วยกฎในเครื่อง: {memoryWarning}</p>}
          <a href="#settings">ตั้งค่า AI →</a>
        </div>
        <div className="chat-messages" aria-live="polite">
          {messages.length ? (
            messages.map((m) => (
              <div className={`message ${m.role}`} key={m.id}>
                <small>{m.role === 'user' ? 'คุณ' : 'MOTIVATIVE'}</small>
                <p>{m.content}</p>
              </div>
            ))
          ) : (
            <Empty
              icon="↗"
              title="เริ่มเล่าได้เลย"
              text="เล่าเป้าหมาย ไอเดียที่อยากทำสักวัน หรือถามถึงสิ่งที่เคยทำไว้"
            />
          )}
          {busy && <div className="muted">กำลังเตรียมคำตอบ…</div>}
        </div>
        <div className="prompt-chips">
          {[
            'ฉันอยากทำตัวละครใน Blender ให้เสร็จ',
            'เมื่อวานฉันทำอะไรไปบ้าง?',
            'ฉันเคยพูดถึงไอเดียอะไรบ้าง?',
          ].map((p) => (
            <button className="secondary" key={p} onClick={() => setText(p)}>
              {p}
            </button>
          ))}
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          <textarea
            aria-label="ข้อความ"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="ความคิด เป้าหมาย หรือคำถาม…"
            maxLength={8000}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
          />
          <button disabled={busy || !text.trim()} type="submit">
            ส่ง ↗
          </button>
        </form>
        <small className="chat-mode">
          {label(mode) ||
            (status?.enabled && status?.configured
              ? 'เปิด AI แล้ว · ยังไม่ได้ทดสอบการเชื่อมต่อ'
              : 'โหมดในเครื่อง')}{' '}
          · คุณแก้ไขสิ่งที่บันทึกไว้ได้ในหน้าความจำ
        </small>
      </section>
    </>
  );
}
export function Memory({ action }: { action: Action }) {
  const [rows, setRows] = useState<MemoryType[]>([]),
    [type, setType] = useState('ALL');
  const load = async () => setRows(await api<MemoryType[]>('/memories'));
  useEffect(() => {
    void action(load);
  }, []);
  return (
    <>
      <div className="page-title">
        <div className="eyebrow">สิ่งที่อยากจดจำ</div>
        <h1>เก็บความคิดและความตั้งใจ</h1>
        <p>รวมความตั้งใจและไอเดีย พร้อมที่มาของแต่ละเรื่อง</p>
      </div>
      <div className="filters">
        <select aria-label="ประเภทความจำ" value={type} onChange={(e) => setType(e.target.value)}>
          {[
            'ALL',
            'GOAL',
            'TASK',
            'COMMITMENT',
            'IDEA',
            'INTEREST',
            'REMINDER',
            'PREFERENCE',
            'CONTEXT',
          ].map((t) => (
            <option key={t} value={t}>
              {label(t)}
            </option>
          ))}
        </select>
        <span>{rows.length} ข้อความที่บันทึกไว้</span>
      </div>
      <div className="memory-grid">
        {rows
          .filter((r) => type === 'ALL' || r.type === type)
          .map((m) => (
            <MemoryCard
              key={m.id}
              memory={m}
              save={(patch) =>
                action(async () => {
                  await api(`/memories/${m.id}`, 'PATCH', patch);
                  await load();
                })
              }
              remove={() =>
                action(async () => {
                  await api(`/memories/${m.id}`, 'DELETE');
                  await load();
                })
              }
            />
          ))}
      </div>
      {!rows.length && (
        <section className="panel">
          <Empty
            icon="◇"
            title="ฝากความคิดไว้ตรงนี้"
            text="เล่าสิ่งที่อยากจำให้ผู้ช่วยฟัง ระบบจะแยกไอเดีย เป้าหมาย และสิ่งที่ตั้งใจไว้ให้"
          />
        </section>
      )}
      <Insights action={action} />
    </>
  );
}
function MemoryCard({
  memory: m,
  save,
  remove,
}: {
  memory: MemoryType;
  save: (patch: unknown) => Promise<void>;
  remove: () => Promise<void>;
}) {
  const [title, setTitle] = useState(m.title),
    [confirm, setConfirm] = useState(false);
  return (
    <article className="panel memory-card">
      <div className="notice-top">
        <span className="tag">{label(m.type)}</span>
        <small>{Math.round(m.confidence * 100)}% ความมั่นใจในการสกัด</small>
      </div>
      <textarea
        aria-label="ข้อความความจำ"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        maxLength={500}
      />
      <div className="memory-controls">
        <select
          aria-label="สถานะความจำ"
          value={m.status}
          onChange={(e) => void save({ status: e.target.value })}
        >
          {['active', 'inactive', 'stale', 'possibly_abandoned', 'completed', 'archived'].map(
            (s) => (
              <option key={s} value={s}>
                {label(s)}
              </option>
            ),
          )}
        </select>
        <button
          className="secondary"
          disabled={title === m.title || !title.trim()}
          onClick={() => void save({ title })}
        >
          บันทึกข้อความ
        </button>
      </div>
      <label>
        กำหนดเสร็จ{' '}
        <input
          type="datetime-local"
          aria-label="กำหนดเสร็จ"
          value={
            m.deadline
              ? new Date(Date.parse(m.deadline) - new Date(m.deadline).getTimezoneOffset() * 60000)
                  .toISOString()
                  .slice(0, 16)
              : ''
          }
          onChange={(e) =>
            void save({ deadline: e.target.value ? new Date(e.target.value).toISOString() : null })
          }
        />
      </label>
      <details>
        <summary>แหล่งที่มา</summary>
        <small>
          ข้อความที่คุณบอก · {new Date(m.createdAt).toLocaleString('th-TH')}
          <br />
          ข้อความต้นทาง: {m.sourceId}
          <br />
          เรียบเรียงจากสิ่งที่คุณบอก สามารถแก้ไขได้
        </small>
      </details>
      {confirm ? (
        <div className="button-row">
          <button className="danger" onClick={() => void remove()}>
            ยืนยันลบความจำนี้
          </button>
          <button className="secondary" onClick={() => setConfirm(false)}>
            ยกเลิก
          </button>
        </div>
      ) : (
        <button className="text-danger" onClick={() => setConfirm(true)}>
          ลบความจำ
        </button>
      )}
    </article>
  );
}
function Insights({ action }: { action: Action }) {
  const [rows, setRows] = useState<
    { id: string; content: string; confidence: number; epistemicType: string }[]
  >([]);
  const load = async () => setRows(await api<typeof rows>('/insights'));
  useEffect(() => {
    void action(load);
  }, []);
  return (
    <section className="panel">
      <div className="section-heading">
        <h2>ความเชื่อมโยงที่อาจเป็นไปได้</h2>
        <span className="tag">ข้อสันนิษฐาน ไม่ใช่ข้อเท็จจริง</span>
      </div>
      {rows.length ? (
        rows.map((r) => (
          <div className="decision" key={r.id}>
            <div>
              <strong>{r.content}</strong>
              <small>
                {label(r.epistemicType)} · ความมั่นใจ {r.confidence.toFixed(2)}
              </small>
            </div>
            <button
              className="secondary"
              onClick={() =>
                void action(async () => {
                  await api(`/insights/${r.id}`, 'DELETE');
                  await load();
                })
              }
            >
              ลบ
            </button>
          </div>
        ))
      ) : (
        <p className="muted">ยังไม่มีความเชื่อมโยงที่สรุปได้</p>
      )}
    </section>
  );
}
