import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createInterface } from 'node:readline';
import { resolve } from 'node:path';
import { activityInput, type ActivityInput } from '../../shared/src/schema';

export interface ActivityCollector {
  start(): void;
  stop(): void;
  status(): { running: boolean; error: string | null };
}
export class WindowsActivityCollector implements ActivityCollector {
  private child?: ChildProcessWithoutNullStreams;
  private error: string | null = null;
  constructor(private onEvent: (event: ActivityInput) => void) {}
  start() {
    if (this.child) return;
    if (process.platform !== 'win32') {
      this.error = 'Windows collection is unavailable on this platform';
      return;
    }
    this.error = null;
    const child = spawn(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        '-File',
        resolve('scripts/windows-activity.ps1'),
      ],
      { windowsHide: true, stdio: 'pipe' },
    );
    this.child = child;
    createInterface({ input: child.stdout }).on('line', (line) => {
      try {
        this.onEvent(activityInput.parse(JSON.parse(line)));
      } catch {
        this.error = 'Collector emitted an invalid sample';
      }
    });
    child.stderr.on('data', () => {
      this.error = 'Windows collector error; check PowerShell and desktop session availability';
    });
    child.on('error', () => {
      this.error = 'Unable to start Windows collector';
    });
    child.on('exit', (code) => {
      if (this.child === child) {
        this.child = undefined;
        if (code) this.error = 'Windows collector stopped unexpectedly';
      }
    });
  }
  stop() {
    const child = this.child;
    this.child = undefined;
    child?.kill();
  }
  status() {
    return { running: !!this.child, error: this.error };
  }
}
