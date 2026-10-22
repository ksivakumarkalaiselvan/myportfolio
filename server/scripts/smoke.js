/**
 * End-to-end smoke test against a running server.
 *   node server/scripts/smoke.js  [baseUrl]
 */
const BASE = process.argv[2] || 'http://127.0.0.1:3000';
const USER = process.env.ADMIN_USER || 'admin';
const PASS = process.env.ADMIN_PASSWORD || 'sivakumar2026';

let passed = 0;
let failed = 0;

async function check(label, fn) {
  try {
    const detail = await fn();
    passed += 1;
    console.log('  PASS  ' + label + (detail ? '  (' + detail + ')' : ''));
  } catch (err) {
    failed += 1;
    console.log('  FAIL  ' + label + '  -> ' + err.message);
  }
}

function expect(cond, msg) {
  if (!cond) throw new Error(msg);
}

const json = async (url, opts) => {
  const res = await fetch(url, opts);
  let body = null;
  try { body = await res.json(); } catch { /* empty */ }
  return { status: res.status, body };
};

console.log('\nSmoke testing ' + BASE + '\n');

await check('GET /api/health responds', async () => {
  const { status, body } = await json(BASE + '/api/health');
  expect(status === 200, 'status ' + status);
  expect(body && body.ok === true, 'body not ok');
  return 'driver=' + body.db;
});

await check('POST /api/messages stores a submission', async () => {
  const { status, body } = await json(BASE + '/api/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      name: 'Smoke Tester',
      email: 'smoke@example.com',
      subject: 'Automation check',
      message: 'Hello from the smoke test.'
    })
  });
  expect(status === 201, 'status ' + status);
  expect(body && body.ok === true, 'not ok');
  return 'id=' + body.id;
});

await check('POST /api/messages rejects a bad email', async () => {
  const { status } = await json(BASE + '/api/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'X', email: 'not-an-email', message: 'hi' })
  });
  expect(status === 400, 'status ' + status);
});

await check('GET /api/messages without token is 401', async () => {
  const { status } = await json(BASE + '/api/messages');
  expect(status === 401, 'status ' + status);
});

await check('POST /api/auth/login rejects wrong password', async () => {
  const { status } = await json(BASE + '/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: USER, password: 'wrong-password' })
  });
  expect(status === 401, 'status ' + status);
});

let token = '';
await check('POST /api/auth/login returns a token', async () => {
  const { status, body } = await json(BASE + '/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: USER, password: PASS })
  });
  expect(status === 200, 'status ' + status);
  expect(body && typeof body.token === 'string' && body.token.includes('.'), 'no token');
  token = body.token;
});

await check('GET /api/messages with token returns rows + stats', async () => {
  const { status, body } = await json(BASE + '/api/messages', {
    headers: { authorization: 'Bearer ' + token }
  });
  expect(status === 200, 'status ' + status);
  expect(Array.isArray(body.messages), 'messages not an array');
  expect(typeof body.stats.total === 'number', 'no stats');
  return body.messages.length + ' message(s), ' + body.stats.unread + ' unread';
});

await check('GET /api/messages with a forged token is 401', async () => {
  const { status } = await json(BASE + '/api/messages', {
    headers: { authorization: 'Bearer not.a.real.token' }
  });
  expect(status === 401, 'status ' + status);
});

await check('DELETE /api/messages/:id removes a row', async () => {
  const list = await json(BASE + '/api/messages', { headers: { authorization: 'Bearer ' + token } });
  const id = list.body.messages[0].id;
  const { status } = await json(BASE + '/api/messages/' + id, {
    method: 'DELETE',
    headers: { authorization: 'Bearer ' + token }
  });
  expect(status === 200, 'status ' + status);
});

await check('GET / serves the portfolio', async () => {
  const res = await fetch(BASE + '/');
  const html = await res.text();
  expect(res.status === 200, 'status ' + res.status);
  expect(html.includes('K. Sivakumar'), 'title not found');
});

console.log('\n' + passed + ' passed, ' + failed + ' failed\n');
// Node on Windows can trip over pending async handles if we exit immediately.
setTimeout(() => process.exit(failed === 0 ? 0 : 1), 150);
