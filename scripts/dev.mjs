import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const children = [];
const env = { ...process.env, DESKTOP_TOKEN: randomUUID() };
delete env.ELECTRON_RUN_AS_NODE;
function run(command, args) {
  const child = spawn(command, args, { env, stdio: 'inherit', windowsHide: true });
  children.push(child);
  child.on('exit', (code) => {
    if (!stopping) stop(code ?? 0);
  });
  return child;
}
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill();
  setTimeout(() => process.exit(code), 500);
}
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => stop());
run(process.execPath, ['--import', 'tsx', 'apps/api/src/index.ts']);
async function wait(url) {
  for (let i = 0; i < 80; i++) {
    if (stopping) return false;
    try {
      const response = await fetch(url);
      if (response.ok) return true;
    } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Service did not start: ${url}`);
}
try {
  if (await wait('http://127.0.0.1:4318/api/v1/health')) {
    run(process.execPath, ['node_modules/vite/bin/vite.js', '--config', 'apps/web/vite.config.ts']);
    if (await wait('http://127.0.0.1:5190'))
      run(require('electron'), ['apps/desktop/main.cjs']);
  }
} catch (error) {
  console.error(error.message);
  stop(1);
}
