const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');

const wrapper = path.resolve(__dirname, '../bin/codex');
const container = 'codex-00000000';

// Run the real wrapper and its remote shell command. Only external Podman and
// Codex processes are replaced, so these checks require neither a login nor an
// installed container runtime.
function run(args, overrides = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-wrapper-'));
  const log = path.join(dir, 'calls.jsonl');
  const mock = path.join(dir, 'mock.cjs');
  fs.writeFileSync(mock, `#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const tool = path.basename(process.argv[1]);
const args = process.argv.slice(2);
if (tool === 'uuidgen') {
  console.log('00000000-0000-0000-0000-000000000000');
  process.exit(0);
}
fs.appendFileSync(process.env.WRAPPER_TEST_LOG, JSON.stringify({tool, args}) + '\\n');
if (tool === 'codex') {
  if (args[0] === 'remote-control') {
    if (process.env.MOCK_REMOTE_EXIT) console.error('Remote startup failed');
    process.exit(Number(process.env.MOCK_REMOTE_EXIT || 0));
  }
  process.exit(Number(process.env.MOCK_SESSION_EXIT || 0));
}
if (args[0] === 'run') {
  console.log('test-container-id');
  process.exit(Number(process.env.MOCK_RUN_EXIT || 0));
}
if (args[0] === 'exec') {
  const command = args.slice(args.indexOf('${container}') + 1);
  if (command[0] === '/bin/sh') {
    const result = spawnSync(command[0], command.slice(1), {stdio: 'inherit'});
    process.exit(result.status ?? 1);
  }
  process.exit(Number(process.env.MOCK_INIT_EXIT || 0));
}
`, { mode: 0o755 });
  for (const tool of ['podman', 'codex', 'uuidgen']) {
    fs.symlinkSync(mock, path.join(dir, tool));
  }
  try {
    const result = spawnSync('bash', [wrapper, ...args], {
      encoding: 'utf8',
      timeout: 10000,
      env: {
        ...process.env,
        PATH: `${dir}:${process.env.PATH}`,
        OPENAI_API_KEY: 'test-key',
        WRAPPER_TEST_LOG: log,
        ...overrides,
      },
    });
    assert.ifError(result.error);
    const calls = fs.existsSync(log)
      ? fs.readFileSync(log, 'utf8').trim().split('\n').map(JSON.parse)
      : [];
    return { ...result, calls };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

const codexCalls = result => result.calls.filter(call => call.tool === 'codex');
const stopped = result => result.calls.filter(call => call.tool === 'podman' && call.args[0] === 'stop');

test('remote mode starts the daemon, preserves session arguments, and cleans up', () => {
  const args = ['-m', 'example-model', '-c', 'notice="two words"', 'Explain "this"\n$(false) *'];
  const result = run(['--local', '--remote', ...args]);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.calls[0].args.slice(-4), ['--entrypoint', '/bin/sleep', 'codex:latest', 'infinity']);
  assert.deepEqual(codexCalls(result).map(call => call.args), [
    ['remote-control', 'start'],
    ['--sandbox', 'danger-full-access', '--remote', 'unix://', ...args],
  ]);
  assert.deepEqual(stopped(result).map(call => call.args), [['stop', container]]);
  assert.ok(!result.calls.some(call => call.args.includes('attach')));
});

test('initialization finishes before remote startup', () => {
  const result = run(['--remote', '--apk-packages', 'jq,curl', '--init-script', 'root init.sh', '--init-script-codex', 'user init.sh', 'resume', '--last']);
  assert.equal(result.status, 0, result.stderr);
  const commands = result.calls.filter(call => call.tool === 'podman' && call.args[0] === 'exec');
  assert.deepEqual(commands.map(call => call.args.slice(call.args.indexOf(container) + 1, call.args.indexOf(container) + 2)), [
    ['/bin/bash'], ['bash'], ['bash'], ['/bin/sh'],
  ]);
  assert.deepEqual(codexCalls(result)[1].args.slice(-2), ['resume', '--last']);
});

test('remote startup failure is visible and skips the session', () => {
  const result = run(['--remote'], { MOCK_REMOTE_EXIT: '23' });
  assert.equal(result.status, 23);
  assert.match(result.stderr, /Remote startup failed/);
  assert.equal(codexCalls(result).length, 1);
  assert.equal(stopped(result).length, 1);
  assert.ok(!result.calls.some(call => call.args.includes('attach')));
});

test('session exit status survives container cleanup', () => {
  const result = run(['--remote'], { MOCK_SESSION_EXIT: '42' });
  assert.equal(result.status, 42);
  assert.equal(stopped(result).length, 1);
});

test('container creation failure skips exec, attach, and stop', () => {
  const result = run(['--remote'], { MOCK_RUN_EXIT: '125' });
  assert.equal(result.status, 125);
  assert.equal(result.calls.length, 1);
});

test('initialization failure skips remote startup and cleans up', () => {
  const result = run(['--remote', '--init-script', 'init.sh'], { MOCK_INIT_EXIT: '19' });
  assert.equal(result.status, 19);
  assert.equal(codexCalls(result).length, 0);
  assert.equal(stopped(result).length, 1);
});

test('ordinary mode keeps the image entrypoint and attaches', () => {
  const result = run(['--local', 'a prompt with spaces']);
  assert.equal(result.status, 0);
  assert.deepEqual(result.calls[0].args.slice(-2), ['codex:latest', 'a prompt with spaces']);
  assert.ok(!result.calls[0].args.includes('--entrypoint'));
  assert.deepEqual(result.calls[1].args, ['container', 'attach', container]);
  assert.equal(stopped(result).length, 0);
});

test('ordinary initialization failure also cleans up its container', () => {
  const result = run(['--init-script', 'init.sh'], { MOCK_INIT_EXIT: '19' });
  assert.equal(result.status, 19);
  assert.equal(stopped(result).length, 1);
  assert.ok(!result.calls.some(call => call.args.includes('attach')));
});

test('separator forwards the native Codex remote flag unchanged', () => {
  const result = run(['--local', '--', '--remote', 'ws://example.invalid:1234']);
  assert.equal(result.status, 0);
  assert.deepEqual(result.calls[0].args.slice(-3), ['codex:latest', '--remote', 'ws://example.invalid:1234']);
  assert.ok(!result.calls[0].args.includes('--entrypoint'));
});

test('help documents remote mode without starting a container', () => {
  const result = run(['--help']);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /--remote\s+Enable remote control/);
  assert.equal(result.calls.length, 0);
});
