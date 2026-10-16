const { app, BrowserWindow } = require('electron');
const { WindowsNotificationAdapter } = require('./notification-adapter.cjs');
const path = require('node:path');
app.disableHardwareAcceleration();
// Keep local runtime files alongside the local database in this development MVP.
app.setPath('userData', path.resolve('data/desktop'));
app.setAppUserModelId(process.execPath);
let window,
  timer,
  busy = false;
const adapter = new WindowsNotificationAdapter();
const base = 'http://127.0.0.1:4318/api/v1';
const token = process.env.DESKTOP_TOKEN;
async function request(route, body) {
  const response = await fetch(base + route, {
    method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json', 'x-desktop-token': token ?? '' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!response.ok) throw new Error(`Local API: ${response.status}`);
  return response.json();
}
async function feedback(id, action) {
  try {
    await request(`/notifications/${id}/action`, { action });
  } catch {
    console.error('Could not store notification feedback');
  }
}
async function poll() {
  if (busy || !token) return;
  busy = true;
  try {
    for (const item of await request('/desktop/pending')) {
      adapter.deliver(item.id, item.content, {
        sent: () => {
          void feedback(item.id, 'sent');
        },
        opened: () => {
          void feedback(item.id, 'opened');
          window.show();
          window.focus();
          void window.loadURL('http://127.0.0.1:5190/#notifications');
        },
        failed: () => {
          void feedback(item.id, 'delivery_failed');
        },
      });
    }
  } catch {
    /* API may be restarting; retry next tick. */
  } finally {
    busy = false;
  }
}
app.whenReady().then(() => {
  window = new BrowserWindow({
    width: 1320,
    height: 900,
    minWidth: 860,
    minHeight: 640,
    title: 'Motivative',
    backgroundColor: '#111915',
    webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true },
  });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event, url) => {
    if (new URL(url).origin !== 'http://127.0.0.1:5190') event.preventDefault();
  });
  window.loadURL('http://127.0.0.1:5190');
  timer = setInterval(poll, 10000);
  void poll();
});
app.on('window-all-closed', () => {
  clearInterval(timer);
  adapter.closeAll();
  app.quit();
});
