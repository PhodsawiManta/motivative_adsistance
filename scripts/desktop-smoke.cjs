// Tests only this project's renderer and native notification adapter, not other applications.
const { app, BrowserWindow, Notification } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { WindowsNotificationAdapter } = require('../apps/desktop/notification-adapter.cjs');
app.setPath('userData', path.resolve('data/smoke-desktop'));
app.disableHardwareAcceleration();
app.setAppUserModelId(process.execPath);
app.whenReady().then(async () => {
  const window = new BrowserWindow({
    show: false,
    width: 1320,
    height: 900,
    webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true },
  });
  try {
    for (const [route, text] of [
      ['today', 'วันนี้ ก้าวไปอีกนิด'],
      ['chat', 'มีอะไรอยู่ในใจบ้าง?'],
      ['memory', 'เก็บความคิดและความตั้งใจ'],
      ['activity', 'กิจกรรมของคุณ'],
      ['notifications', 'เตือนเบา ๆ อย่างมีเหตุผล'],
      ['settings', 'ตั้งค่าให้เหมาะกับคุณ'],
    ]) {
      await window.loadURL(`http://127.0.0.1:5190/#${route}`);
      let ready = false;
      for (let i = 0; i < 40; i++) {
        ready = await window.webContents.executeJavaScript(
          `document.body.innerText.includes(${JSON.stringify(text)})`,
        );
        if (ready) break;
        await new Promise((r) => setTimeout(r, 100));
      }
      if (!ready) throw new Error(`Page did not render: ${route}`);
      console.log(`PASS: ${route} renderer`);
      if (route === 'today' || process.env.RENDER_ONLY) {
        fs.mkdirSync('artifacts', { recursive: true });
        fs.writeFileSync(
          process.env.RENDER_ONLY ? `artifacts/${route}-th.png` : 'artifacts/dashboard.png',
          (await window.webContents.capturePage()).toPNG(),
        );
      }
    }
    if (process.env.RENDER_ONLY) return app.exit(0);
    await new Promise((resolve, reject) => {
      if (!Notification.isSupported()) return reject(new Error('Native notifications unavailable'));
      const adapter = new WindowsNotificationAdapter();
      const timeout = setTimeout(
        () => reject(new Error('Windows did not acknowledge the notification')),
        10000,
      );
      adapter.deliver(
        'smoke',
        'Motivative desktop check: your local assistant can deliver a gentle notification.',
        {
          sent: () => {
            clearTimeout(timeout);
            console.log('PASS: Windows acknowledged native notification show');
            setTimeout(() => {
              adapter.closeAll();
              resolve();
            }, 1500);
          },
          opened: () => {},
          failed: () => {
            clearTimeout(timeout);
            reject(new Error('Native notification failed'));
          },
        },
      );
    });
    app.exit(0);
  } catch (error) {
    console.error(error);
    app.exit(1);
  }
});
