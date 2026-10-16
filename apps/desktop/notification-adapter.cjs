const { Notification } = require('electron');
/** Platform adapter contract: deliver(id, content, handlers), close(id), closeAll(). */
class WindowsNotificationAdapter {
  live = new Map();
  deliver(id, content, handlers) {
    if (this.live.has(id)) return;
    if (!Notification.isSupported()) {
      handlers.failed();
      return;
    }
    const toast = new Notification({ title: 'A small next step', body: content, silent: true });
    this.live.set(id, toast);
    toast.on('show', handlers.sent);
    toast.on('click', handlers.opened);
    // Native close is ambiguous on Windows; explicit dismiss/snooze lives in the dashboard.
    toast.on('close', () => this.live.delete(id));
    toast.on('failed', () => {
      this.live.delete(id);
      handlers.failed();
    });
    toast.show();
  }
  close(id) {
    this.live.get(id)?.close();
    this.live.delete(id);
  }
  closeAll() {
    for (const id of this.live.keys()) this.close(id);
  }
}
module.exports = { WindowsNotificationAdapter };
