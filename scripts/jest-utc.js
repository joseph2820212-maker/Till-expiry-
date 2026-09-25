#!/usr/bin/env node
// Runs Jest with the timezone pinned to UTC on every platform. TZ must be in the
// environment before Node/V8 first reads the host zone, so it is set here and Jest
// runs as a child process; the POSIX-only `TZ=UTC jest` form fails in cmd.exe.
const { spawnSync } = require('child_process');

const result = spawnSync(process.execPath, [require.resolve('jest/bin/jest'), ...process.argv.slice(2)], {
  stdio: 'inherit',
  env: { ...process.env, TZ: 'UTC' },
});
if (result.error) throw result.error;
process.exit(result.status ?? 1);
