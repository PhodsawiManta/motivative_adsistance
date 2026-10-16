import { useCallback, useEffect, useState } from 'react';
import { api, bootstrap, type Bootstrap, type Dashboard } from './api';
import { Today, Activity, Notifications } from './pages/Overview';
import { Chat, Memory } from './pages/Memory';
import { SettingsPage } from './pages/Settings';
const tabs = [
  ['today', '◷', 'วันนี้'],
  ['chat', '↗', 'แชต'],
  ['memory', '◇', 'ความจำ'],
  ['activity', '▥', 'กิจกรรม'],
  ['notifications', '○', 'การแจ้งเตือน'],
  ['settings', '⚙', 'ตั้งค่า'],
];
export function App() {
  const [page, setPage] = useState(location.hash.slice(1) || 'today');
  const [boot, setBoot] = useState<Bootstrap>();
  const [data, setData] = useState<Dashboard>();
  const [error, setError] = useState('');
  const refresh = useCallback(async () => {
    try {
      // Refresh the local token too, so startup failures and API restarts recover.
      setBoot(await bootstrap());
      setData(await api<Dashboard>('/dashboard'));
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  useEffect(() => {
    void refresh();
    const timer = setInterval(() => {
      void refresh();
    }, 15000);
    const change = () => setPage(location.hash.slice(1) || 'today');
    window.addEventListener('hashchange', change);
    return () => {
      clearInterval(timer);
      window.removeEventListener('hashchange', change);
    };
  }, [refresh]);
  const action = async (fn: () => Promise<unknown>) => {
    setError('');
    try {
      await fn();
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <div className="shell">
      <aside className="sidebar">
        <a className="brand" href="#today">
          <span className="brandmark">
            m<span>·</span>
          </span>
          motivative
        </a>
        <div className="workspace">
          <span className="avatar">Y</span>
          <div>
            พื้นที่ของคุณ<small>ส่วนตัว · เก็บข้อมูลในเครื่อง</small>
          </div>
          <span className="local-dot" />
        </div>
        <div className="nav-label">ทุกวันอย่างมีเป้าหมาย</div>
        <nav>
          {tabs.map(([id, icon, label]) => (
            <a key={id} href={`#${id}`} className={page === id ? 'selected' : ''}>
              <span>{icon}</span>
              {label}
              {id === 'notifications' &&
                !!data?.notifications.filter((n) => n.status === 'pending').length && (
                  <b>{data.notifications.filter((n) => n.status === 'pending').length}</b>
                )}
            </a>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="leaf">✳</div>
          <h3>
            ก้าวไปทีละนิด
            <br />
            ในจังหวะของคุณ
          </h3>
          <p>
            ช่วยเมื่อคุณต้องการ
            <br />
            เงียบเมื่อคุณต้องการสมาธิ
          </p>
          <div className="local-note">◉ &nbsp; ข้อมูลของคุณเก็บไว้ในเครื่อง</div>
        </div>
      </aside>
      <main>
        <header>
          <div className="breadcrumb">
            พื้นที่ของคุณ <span>/</span> {tabs.find((t) => t[0] === page)?.[2] ?? 'วันนี้'}
          </div>
          <div className={`tracking ${data?.settings.trackingEnabled ? 'on' : ''}`}>
            <i />
            {data?.settings.trackingEnabled ? 'กำลังบันทึกกิจกรรม' : 'พักการบันทึกกิจกรรม'}
            <a href="#settings">จัดการ</a>
          </div>
        </header>
        {error && (
          <div className="error" role="alert">
            {error}
            <button onClick={() => setError('')}>×</button>
          </div>
        )}
        {!data || !boot ? (
          <div className="loading">
            {error ? (
              <>
                <p>กำลังรอระบบในเครื่อง และจะเชื่อมต่อใหม่โดยอัตโนมัติ</p>
                <button onClick={() => void refresh()}>ลองอีกครั้ง</button>
              </>
            ) : (
              'กำลังเปิดพื้นที่ของคุณ…'
            )}
          </div>
        ) : (
          <div className="content">
            {page === 'today' ? (
              <Today data={data} action={action} />
            ) : page === 'chat' ? (
              <Chat action={action} />
            ) : page === 'memory' ? (
              <Memory action={action} />
            ) : page === 'activity' ? (
              <Activity />
            ) : page === 'notifications' ? (
              <Notifications data={data} action={action} />
            ) : page === 'settings' ? (
              <SettingsPage settings={data.settings} boot={boot} action={action} />
            ) : (
              <Today data={data} action={action} />
            )}
          </div>
        )}
        <footer>
          ช่วยให้แต่ละช่วงเวลามีความหมาย โดยไม่เพิ่มเวลาอยู่หน้าจอ{' '}
          <span>พื้นที่ส่วนตัวในเครื่อง</span>
        </footer>
      </main>
    </div>
  );
}
export type Action = (fn: () => Promise<unknown>) => Promise<void>;
