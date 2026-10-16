import { useEffect, useState } from 'react';
import { api, type Settings, type Bootstrap, type AIProblem, type AIStatus } from '../api';
import type { Action } from '../App';
import { label, problemText } from '../locale';
export function SettingsPage({
  settings,
  boot,
  action,
}: {
  settings: Settings;
  boot: Bootstrap;
  action: Action;
}) {
  const [draft, setDraft] = useState(settings),
    [deleting, setDeleting] = useState(''),
    [saved, setSaved] = useState(false),
    [excluded, setExcluded] = useState(settings.excludedApplications.join(', ')),
    [testingAI, setTestingAI] = useState(false),
    [testResult, setTestResult] = useState<{ ok: boolean; problem: AIProblem | null }>(),
    [aiStatus, setAIStatus] = useState<AIStatus>();
  useEffect(() => {
    void action(async () => {
      setAIStatus(await api<AIStatus>('/ai/status'));
    });
  }, []);
  useEffect(() => {
    setDraft(settings);
    setExcluded(settings.excludedApplications.join(', '));
  }, [JSON.stringify(settings)]);
  function update<K extends keyof Settings>(key: K, value: Settings[K]) {
    setSaved(false);
    setDraft({ ...draft, [key]: value });
  }
  return (
    <>
      <div className="page-title">
        <div className="eyebrow">คุณเป็นคนเลือกเสมอ</div>
        <h1>ตั้งค่าให้เหมาะกับคุณ</h1>
        <p>เลือกสิ่งที่จะบันทึก เวลาที่ให้เตือน และข้อมูลที่จะเก็บไว้</p>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void action(async () => {
            await api('/settings', 'PATCH', draft);
            setSaved(true);
          });
        }}
      >
        <section className="panel settings-panel">
          <h2>กิจกรรมและความเป็นส่วนตัว</h2>
          <Toggle
            label="บันทึกกิจกรรมการใช้คอมพิวเตอร์"
            description="บันทึกชื่อแอป ชื่อหน้าต่าง (เลือกได้) และสถานะการใช้งาน ทุก 15 วินาที"
            checked={draft.trackingEnabled}
            change={(v) => update('trackingEnabled', v)}
          />
          <Toggle
            label="เก็บชื่อหน้าต่าง"
            description="ชื่อหน้าต่างอาจมีชื่อโครงการหรือเอกสารส่วนตัว"
            checked={draft.storeWindowTitles}
            change={(v) => update('storeWindowTitles', v)}
          />
          <label>
            แอปที่ไม่ต้องการบันทึก{' '}
            <input
              value={excluded}
              onChange={(e) => {
                setExcluded(e.target.value);
                update(
                  'excludedApplications',
                  e.target.value
                    .split(',')
                    .map((s) => s.trim())
                    .filter(Boolean),
                );
              }}
              placeholder="KeePass, 1Password"
            />
          </label>
          <label>
            ระยะเวลาเก็บกิจกรรมและผลวิเคราะห์ (วัน)
            <input
              type="number"
              min="1"
              max="3650"
              value={draft.retentionDays}
              onChange={(e) => update('retentionDays', Number(e.target.value))}
            />
          </label>
        </section>
        <section className="panel settings-panel">
          <h2>ผู้ให้บริการ AI</h2>
          <p className="muted">
            {boot.provider.configured
              ? `โมเดลที่ตั้งไว้: ${boot.provider.model}`
              : 'ยังไม่ได้ตั้งค่าผู้ให้บริการ ขณะนี้ใช้การจัดประเภทและสรุปข้อมูลในเครื่อง'}
          </p>
          {aiStatus?.baseUrl && (
            <p>
              ที่อยู่ API: <code>{aiStatus.baseUrl}</code>
            </p>
          )}
          <p>
            {settings.llmEnabled
              ? 'เปิดใช้งาน AI แล้ว'
              : 'ขณะนี้ปิด AI อยู่ แม้จะตั้งค่า API key แล้ว เปิดตัวเลือกด้านล่างและบันทึกเพื่อใช้ AI ในแชต'}
          </p>
          <Toggle
            label="เปิดใช้ AI ในแชต"
            description="รวมข้อความ กิจกรรมและความจำที่ค้นพบ หากใช้บริการภายนอก ข้อมูลเหล่านี้จะถูกส่งออกจากเครื่อง หากต้องการเก็บไว้ในเครื่องให้ใช้เซิร์ฟเวอร์ภายใน"
            checked={draft.llmEnabled}
            change={(v) => update('llmEnabled', v)}
          />
          {draft.llmEnabled !== settings.llmEnabled && (
            <p role="status">ยังไม่ได้บันทึก · การเปลี่ยนแปลงจะมีผลเมื่อกดบันทึกการตั้งค่า</p>
          )}
          <button type="submit">บันทึกการตั้งค่า</button>
          <p>
            ตั้งค่า <code>LLM_BASE_URL</code>, <code>LLM_MODEL</code> และหากจำเป็น ให้ใส่{' '}
            <code>LLM_API_KEY</code> ใน <code>.env</code> แล้วเริ่มแอปใหม่
            ระบบจะไม่ส่งคีย์มายังหน้าจอนี้
          </p>
          <button
            className="secondary"
            type="button"
            disabled={testingAI}
            onClick={() => {
              setTestingAI(true);
              setTestResult(undefined);
              void action(async () => {
                try {
                  setTestResult(await api('/ai/test', 'POST', {}));
                } finally {
                  setTestingAI(false);
                }
              });
            }}
          >
            {testingAI ? 'กำลังทดสอบการเชื่อมต่อ…' : 'ทดสอบการเชื่อมต่อ AI'}
          </button>
          <p>
            ทดสอบด้วยข้อความทักทายสั้น ๆ เท่านั้น ไม่ส่งกิจกรรมหรือประวัติสนทนา และไม่เปิด AI
            ให้อัตโนมัติเมื่อทดสอบสำเร็จ
          </p>
          {testResult && (
            <p role="status">
              {testResult.ok
                ? settings.llmEnabled
                  ? 'เชื่อมต่อสำเร็จ โมเดลตอบกลับแล้ว · เปิดใช้ AI ในแชตแล้ว'
                  : 'เชื่อมต่อสำเร็จ แต่ AI ในแชตยังปิดอยู่ · เลือก “เปิดใช้ AI ในแชต” แล้วกดบันทึกการตั้งค่า'
                : testResult.problem
                  ? problemText(testResult.problem)
                  : 'เชื่อมต่อไม่สำเร็จ'}
            </p>
          )}
        </section>
        <section className="panel settings-panel">
          <h2>ขอบเขตการแจ้งเตือน</h2>
          <Toggle
            label="อนุญาตการแจ้งเตือนตามสถานการณ์"
            description="แจ้งเตือนเฉพาะเรื่องที่ได้คะแนนสูงและผ่านเงื่อนไขทุกข้อ"
            checked={draft.notificationsEnabled}
            change={(v) => update('notificationsEnabled', v)}
          />
          <div className="settings-grid">
            {[
              ['maxNotificationsPerDay', 'จำนวนสูงสุดต่อวัน', 0, 20],
              ['minimumMinutesBetweenNotifications', 'ระยะห่างขั้นต่ำ (นาที)', 0, 10080],
              ['perGoalCooldownMinutes', 'เว้นระยะการเตือนเป้าหมายเดิม (นาที)', 0, 43200],
              ['dismissalCooldownMinutes', 'พักหลังปิดการเตือน (นาที)', 0, 10080],
              ['quietStart', 'เริ่มช่วงห้ามรบกวน (0–23 น.)', 0, 23],
              ['quietEnd', 'สิ้นสุดช่วงห้ามรบกวน (0–23 น.)', 0, 23],
            ].map(([key, label, min, max]) => (
              <label key={key}>
                {label}
                <input
                  type="number"
                  min={min}
                  max={max}
                  value={draft[key as keyof Settings] as number}
                  onChange={(e) => update(key as keyof Settings, Number(e.target.value))}
                />
              </label>
            ))}
          </div>
          <label>
            เขตเวลาสำหรับช่วงห้ามรบกวน
            <input value={draft.timeZone} onChange={(e) => update('timeZone', e.target.value)} />
          </label>
          <p className="muted">
            กำหนดเวลาเริ่มและสิ้นสุดเท่ากันเพื่อปิดช่วงห้ามรบกวน
            เรื่องที่คะแนนต่ำยังดูได้ในบันทึกการตัดสินใจ
          </p>
          <div className="settings-grid">
            <label>
              เกณฑ์คะแนนขั้นต่ำเพื่อพิจารณา
              <input
                type="number"
                step="0.01"
                min="0"
                max="1"
                value={draft.weakThreshold}
                onChange={(e) => update('weakThreshold', Number(e.target.value))}
              />
            </label>
            <label>
              เกณฑ์คะแนนสำหรับแจ้งเตือน
              <input
                type="number"
                step="0.01"
                min="0"
                max="1"
                value={draft.strongThreshold}
                onChange={(e) => update('strongThreshold', Number(e.target.value))}
              />
            </label>
          </div>
        </section>
        <div className="save-row">
          <button type="submit">บันทึกการตั้งค่า</button>
          {saved && <span role="status">บันทึกการตั้งค่าแล้ว</span>}
        </div>
      </form>
      <section className="panel settings-panel danger-panel">
        <h2>ข้อมูลของคุณ คุณจัดการได้</h2>
        <p>
          การลบกิจกรรมจะลบผลวิเคราะห์และประวัติคำแนะนำที่เกี่ยวข้องด้วย
          การลบบทสนทนาจะลบความจำที่สกัดจากบทสนทนานั้น การลบไม่สามารถกู้คืนได้
        </p>
        <div className="button-row">
          {['activity', 'interpretations', 'conversations', 'all'].map((scope) => (
            <button className="secondary" key={scope} onClick={() => setDeleting(scope)}>
              ลบ{label(scope)}
            </button>
          ))}
        </div>
        {deleting && (
          <div className="confirm">
            <strong>ลบ{label(deleting)}อย่างถาวรหรือไม่?</strong>
            <button
              className="danger"
              onClick={() =>
                void action(async () => {
                  await api(`/data/${deleting}`, 'DELETE');
                  setDeleting('');
                })
              }
            >
              ยืนยันลบ{label(deleting)}
            </button>
            <button className="secondary" onClick={() => setDeleting('')}>
              ยกเลิก
            </button>
          </div>
        )}
      </section>
    </>
  );
}
function Toggle({
  label,
  description,
  checked,
  change,
}: {
  label: string;
  description: string;
  checked: boolean;
  change: (v: boolean) => void;
}) {
  return (
    <label className="toggle-row">
      <div>
        <strong>{label}</strong>
        <small>{description}</small>
      </div>
      <input type="checkbox" checked={checked} onChange={(e) => change(e.target.checked)} />
    </label>
  );
}
