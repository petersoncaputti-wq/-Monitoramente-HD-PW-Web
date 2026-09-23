import { spawn } from 'node:child_process';

const isWindows = process.platform === 'win32';
const npmCommand = isWindows ? 'npm.cmd' : 'npm';
const nodeCommand = process.execPath;

const processes = [
  spawn(nodeCommand, ['server/index.mjs'], { stdio: 'inherit' }),
  spawn(npmCommand, ['exec', 'vite', '--', '--host', '127.0.0.1'], {
    shell: isWindows,
    stdio: 'inherit',
  }),
];

let stopping = false;

function stop(exitCode = 0) {
  if (stopping) return;
  stopping = true;

  for (const child of processes) {
    if (!child.killed) child.kill();
  }

  process.exitCode = exitCode;
}

for (const child of processes) {
  child.on('exit', (code) => {
    if (!stopping && code && code !== 0) stop(code);
  });
  child.on('error', (error) => {
    console.error(error);
    stop(1);
  });
}

process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());
