import { useEffect, useState } from 'react';
import { api, time, minutes, type Dashboard, type Session } from '../api';
import type { Action } from '../App';
import { label } from '../locale';
function PageTitle({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="page-title">
      <div className="eyebrow">{eyebrow}</div>
      <h1>{title}</h1>
      <p>{subtitle}</p>
    </div>
  );
}
export function Today({ data, action }: { data: Dashboard; action: Action }) {
  const usage = Object.entries(data.usage).sort((a, b) => b[1] - a[1]);
  const total = usage.reduce((sum, [, ms]) => sum + ms, 0);
  const active = data.memories.filter((m) => ['GOAL', 'TASK', 'COMMITMENT'].includes(m.type));
  const suggestion = data.notifications.find((n) => n.status === 'pending' || n.status === 'sent');
  return (
    <>
      <div className="title-row">
        <PageTitle
          eyebrow={new Date()
            .toLocaleDateString('th-TH', { weekday: 'long', month: 'long', day: 'numeric' })
            .toUpperCase()}
          title="วันนี้ ก้าวไปอีกนิด"
          subtitle="ทบทวนวันของคุณ แล้วค่อยเลือกสิ่งที่อยากทำต่อ"
        />
        <span className="date-chip">◷ &nbsp; วันนี้</span>
      </div>
      <section className="hero">
        <div>
          <div className="eyebrow">
            {data.context.activeApplication ? 'ช่วงเวลานี้' : 'พื้นที่ของคุณพร้อมแล้ว'}
          </div>
          <h2>
            {data.context.activeApplication
              ? `กำลังใช้งาน ${data.context.activeApplication}`
              : 'เริ่มจากสิ่งที่อยู่ในใจ'}
          </h2>
          <p>
            {data.context.activeApplication ? (
              <>
                {data.context.activeWindowTitle || 'ซ่อนชื่อหน้าต่างอยู่'}
                <br />
                กิจกรรมที่บันทึกได้ ·{' '}
                {data.context.idle
                  ? 'ไม่ได้ใช้งาน'
                  : minutes(data.context.currentSessionDurationSeconds * 1000) +
                    ' ในช่วงการใช้งานนี้'}
              </>
            ) : (
              'เล่าสิ่งที่คุณอยากกลับมาทำ แล้วผมจะช่วยหาจังหวะเหมาะ ๆ สำหรับก้าวเล็ก ๆ ถัดไป'
            )}
          </p>
          <a className="button cream" href="#chat">
            {active.length ? 'คุยเรื่องเดิมต่อ' : 'เล่าสิ่งที่อยู่ในใจ'} <span>↗</span>
          </a>
        </div>
        <div className="hero-art" aria-hidden="true">
          <div className="orbit o1" />
          <div className="orbit o2" />
          <div className="orbit o3" />
          <div className="seed">✳</div>
          <span className="art-caption">ทีละก้าว เพื่อไปต่อ</span>
        </div>
      </section>
      {!data.settings.trackingEnabled && (
        <div className="privacy-banner">
          <span>◉</span>
          <div>
            <strong>กิจกรรมเป็นข้อมูลส่วนตัว และตอนนี้พักการบันทึกอยู่</strong>
            <p>เปิดเมื่อคุณพร้อม ระบบบันทึกเฉพาะชื่อแอป ชื่อหน้าต่าง และเวลาที่ไม่ได้ใช้งาน</p>
          </div>
          <a href="#settings">ตั้งค่าการบันทึก →</a>
        </div>
      )}
      {data.collector.error && <div className="error">{data.collector.error}</div>}
      <div className="stats">
        <article>
          <span>เวลาใช้งานแอป</span>
          <strong>{minutes(total)}</strong>
          <small>ที่บันทึกวันนี้ · ไม่รวมเวลาที่ไม่ได้ใช้งาน</small>
        </article>
        <article>
          <span>สิ่งที่อยากกลับมาทำ</span>
          <strong>
            {active.length}
            <em> เรื่อง</em>
          </strong>
          <small>เป้าหมาย สิ่งที่ตั้งใจไว้ และงานที่ยังค้าง</small>
        </article>
        <article>
          <span>การเตือนเบา ๆ</span>
          <strong>
            {data.notifications.filter((n) => n.status === 'sent' || n.status === 'opened').length}
            <em> ครั้ง</em>
          </strong>
          <small>บางครั้งการไม่รบกวนก็เป็นทางเลือกที่ดี</small>
        </article>
      </div>
      <div className="two-column">
        <section className="panel">
          <div className="section-heading">
            <h2>วันนี้ของคุณ</h2>
            <a href="#activity">ดูกิจกรรม ↗</a>
          </div>
          {usage.length ? (
            <div className="usage">
              {usage.slice(0, 5).map(([app, ms], i) => (
                <div className="usage-row" key={app}>
                  <span className={`app-icon tone-${i % 3}`}>{app.slice(0, 1).toUpperCase()}</span>
                  <div>
                    <strong>{app}</strong>
                    <div className="bar">
                      <i style={{ width: `${Math.max(2, (ms / Math.max(total, 1)) * 100)}%` }} />
                    </div>
                  </div>
                  <span>{minutes(ms)}</span>
                </div>
              ))}
            </div>
          ) : (
            <Empty
              icon="▥"
              title="ยังไม่มีกิจกรรมของวันนี้"
              text="ช่วงการใช้งานแอปจะแสดงที่นี่เมื่อเปิดบันทึกกิจกรรม"
            />
          )}
          <div className="panel-foot">
            ข้อมูลที่สังเกตได้ <span>การใช้แอปไม่ได้หมายความว่างานคืบหน้าเสมอไป</span>
          </div>
        </section>
        <section className="panel next-step">
          <div className="section-heading">
            <h2>สิ่งที่อาจทำต่อได้</h2>
            <span className="tag">ค่อยเป็นค่อยไป</span>
          </div>
          {suggestion ? (
            <>
              <p className="suggestion">{suggestion.content}</p>
              <small>
                แนะนำจากสิ่งที่คุณบอกและกิจกรรมที่บันทึกได้ ความเชื่อมโยงนี้เป็นเพียงข้อสันนิษฐาน
              </small>
              <div className="button-row">
                <button
                  onClick={() =>
                    void action(() =>
                      api(`/notifications/${suggestion.id}/action`, 'POST', { action: 'opened' }),
                    )
                  }
                >
                  เปิดคำแนะนำ
                </button>
                <button
                  className="secondary"
                  onClick={() =>
                    void action(() =>
                      api(`/notifications/${suggestion.id}/action`, 'POST', { action: 'snoozed' }),
                    )
                  }
                >
                  ไว้ทีหลัง
                </button>
              </div>
            </>
          ) : (
            <Empty
              icon="✧"
              title="มีช่วงเงียบ ๆ บ้างก็ดี"
              text="ตอนนี้ไม่มีเรื่องที่ต้องเตือน ทำต่อในจังหวะของคุณได้เลย"
            />
          )}
          <a className="text-link" href="#notifications">
            ดูเหตุผลในการเลือกคำแนะนำ →
          </a>
        </section>
      </div>
      <section className="panel">
        <div className="section-heading">
          <h2>สิ่งที่อยู่ในใจ</h2>
          <a href="#memory">ดูความจำ ↗</a>
        </div>
        {active.length ? (
          <div className="intention-list">
            {active.slice(0, 4).map((m) => (
              <div key={m.id}>
                <span className="intention-dot" />
                <strong>{m.title}</strong>
                <span className="tag">{label(m.type)}</span>
                <small>{label(m.status)}</small>
              </div>
            ))}
          </div>
        ) : (
          <div className="inline-empty">
            “ฉันอยากทำตัวละครใน Blender ให้เสร็จ”{' '}
            <span>เริ่มจากความคิดสักอย่าง ยังไม่ต้องเป็นรายการงานก็ได้</span>
            <a href="#chat">เล่าให้ผู้ช่วยฟัง →</a>
          </div>
        )}
      </section>
    </>
  );
}
export function Empty({ icon, title, text }: { icon: string; title: string; text: string }) {
  return (
    <div className="empty">
      <span>{icon}</span>
      <h3>{title}</h3>
      <p>{text}</p>
    </div>
  );
}
export function Activity() {
  const [rows, setRows] = useState<Session[]>([]),
    [application, setApplication] = useState(''),
    [date, setDate] = useState(''),
    [kind, setKind] = useState('sessions'),
    [error, setError] = useState('');
  useEffect(() => {
    const query = new URLSearchParams({ kind });
    if (application) query.set('application', application);
    if (date) {
      query.set('from', new Date(`${date}T00:00:00`).toISOString());
      query.set('to', new Date(`${date}T23:59:59.999`).toISOString());
    }
    void api<Session[]>(`/activity?${query}`)
      .then(setRows)
      .catch((e) => setError(e.message));
  }, [application, date, kind]);
  return (
    <>
      <PageTitle
        eyebrow="จากกิจกรรมที่บันทึกได้"
        title="กิจกรรมของคุณ"
        subtitle="เก็บเฉพาะข้อมูลแอปที่ใช้งาน ไม่เก็บเนื้อหาเอกสาร ภาพหน้าจอ หรือการพิมพ์"
      />
      <div className="filters">
        <input
          aria-label="กรองตามแอป"
          placeholder="ชื่อแอป (ตรงตามชื่อจริง)"
          value={application}
          onChange={(e) => setApplication(e.target.value)}
        />
        <input
          aria-label="กรองตามวันที่"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
        <select aria-label="ประเภทกิจกรรม" value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="sessions">ช่วงการใช้งาน</option>
          <option value="events">เหตุการณ์ดิบ</option>
        </select>
        <span>500 รายการล่าสุด</span>
      </div>
      {error && <div className="error">{error}</div>}
      <section className="panel">
        {rows.length ? (
          <div className="timeline">
            {rows.map((raw) => {
              const r = raw as Session & { timestamp?: string };
              return (
                <article key={r.id}>
                  <time>
                    {time(r.start ?? r.timestamp!)}
                    <small>{new Date(r.start ?? r.timestamp!).toLocaleDateString('th-TH')}</small>
                  </time>
                  <span className="timeline-point" />
                  <div>
                    <strong>{r.application}</strong>
                    <p>{r.title || 'ไม่ได้เก็บชื่อหน้าต่าง'}</p>
                    <small>
                      {r.idle ? 'ไม่ได้ใช้งาน' : 'กำลังใช้งาน'} · {minutes(r.durationMs)} ·{' '}
                      {r.source}
                    </small>
                  </div>
                  <span className="tag">ข้อมูลที่สังเกตได้</span>
                </article>
              );
            })}
          </div>
        ) : (
          <Empty
            icon="◷"
            title="ยังไม่มีกิจกรรมที่ตรงกัน"
            text="เปิดการบันทึกในหน้าตั้งค่า หรือลองปรับตัวกรอง"
          />
        )}
      </section>
    </>
  );
}
type CandidateRow = {
  id: string;
  reason: string;
  score: number;
  decision: string;
  explanation: { reason: string[]; blocked: string[] };
};
export function Notifications({ data, action }: { data: Dashboard; action: Action }) {
  const [candidates, setCandidates] = useState<CandidateRow[]>([]);
  useEffect(() => {
    void api<CandidateRow[]>('/notification-candidates')
      .then(setCandidates)
      .catch(() => {});
  }, [data]);
  return (
    <>
      <PageTitle
        eyebrow="ทุกคำแนะนำมีเหตุผล"
        title="เตือนเบา ๆ อย่างมีเหตุผล"
        subtitle="ทุกคำแนะนำผ่านการพิจารณา เพราะไม่ใช่ทุกช่วงเวลาที่ควรถูกรบกวน"
      />
      <section className="panel">
        <div className="section-heading">
          <h2>ประวัติคำแนะนำ</h2>
          <button
            className="secondary"
            onClick={() => void action(() => api('/reminders/evaluate', 'POST', {}))}
          >
            ประเมินสถานการณ์ตอนนี้
          </button>
        </div>
        {data.notifications.length ? (
          data.notifications.map((n) => (
            <article className="notice" key={n.id}>
              <div className="notice-top">
                <span className="tag">{label(n.status)}</span>
                <small>
                  {new Date(n.createdAt).toLocaleString('th-TH')} · คะแนน {n.score.toFixed(2)}
                </small>
              </div>
              <p>{n.content}</p>
              <details>
                <summary>ทำไมจึงแนะนำเรื่องนี้?</summary>
                <ul>
                  {n.explanation.reason.map((r) => (
                    <li key={r}>{label(r)}</li>
                  ))}
                </ul>
                <div className="factor-grid">
                  {Object.entries(n.explanation.factors).map(([key, value]) => (
                    <span key={key}>
                      {label(key)}
                      <b>{value.toFixed(2)}</b>
                    </span>
                  ))}
                </div>
                <p>การตอบรับ: {n.feedback.map((f) => label(f.type)).join(' → ')}</p>
              </details>
              <div className="button-row">
                {['opened', 'dismissed', 'snoozed'].map((a) => (
                  <button
                    className="secondary"
                    key={a}
                    onClick={() =>
                      void action(() => api(`/notifications/${n.id}/action`, 'POST', { action: a }))
                    }
                  >
                    {a === 'opened'
                      ? 'เปิด'
                      : a === 'dismissed'
                        ? 'ปิดการเตือน'
                        : 'เตือนอีกใน 1 ชั่วโมง'}
                  </button>
                ))}
              </div>
            </article>
          ))
        ) : (
          <Empty
            icon="○"
            title="ยังไม่มีเรื่องที่ต้องเตือน"
            text="คำแนะนำตามสถานการณ์ คะแนน และการตอบรับของคุณจะแสดงที่นี่"
          />
        )}
      </section>
      <section className="panel">
        <div className="section-heading">
          <h2>บันทึกการตัดสินใจ</h2>
          <span className="tag">เรื่องที่พิจารณาอาจไม่ถูกส่งเตือน</span>
        </div>
        {candidates.length ? (
          candidates.map((c) => (
            <div className="decision" key={c.id}>
              <div>
                <strong>{label(c.reason)}</strong>
                <small>
                  {c.explanation.blocked.map(label).join(' · ') ||
                    c.explanation.reason.map(label).join(' · ')}
                </small>
              </div>
              <span>{c.score.toFixed(2)}</span>
              <span className="tag">{label(c.decision)}</span>
            </div>
          ))
        ) : (
          <p className="muted">
            ยังไม่มีเรื่องให้พิจารณา ลองบอกเป้าหมายในแชต แล้วเปิดแอปที่เกี่ยวข้อง
          </p>
        )}
      </section>
    </>
  );
}
