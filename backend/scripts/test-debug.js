const http = require('http');
const fs = require('fs');

function httpRequest(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: '127.0.0.1', port: 3000, path, method,
      headers: { 'Content-Type': 'application/json' },
    };
    if (token) opts.headers['Authorization'] = 'Bearer ' + token;
    const req = http.request(opts, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    if (body) req.write(typeof body === 'string' ? body : JSON.stringify(body));
    req.end();
  });
}

async function sseRequest(method, path, body, token, onEvent) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: '127.0.0.1', port: 3000, path, method,
      headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
    };
    if (token) opts.headers['Authorization'] = 'Bearer ' + token;
    const req = http.request(opts, (res) => {
      let buffer = '';
      res.on('data', (chunk) => {
        buffer += chunk.toString();
        let idx;
        while ((idx = buffer.indexOf('\n\n')) !== -1) {
          const event = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 2);
          const lines = event.split('\n');
          for (const line of lines) {
            if (!line.startsWith('data:')) continue;
            const data = line.slice(5).trim();
            if (!data) continue;
            try { onEvent(JSON.parse(data)); } catch {}
          }
        }
      });
      res.on('end', resolve);
    });
    req.on('error', reject);
    if (body) req.write(typeof body === 'string' ? body : JSON.stringify(body));
    req.end();
  });
}

async function runScenario(name, CID, AID, message, token) {
  console.log(`\n========== SCENARIO: ${name} ==========`);
  console.log(`  message: ${message}`);
  fs.writeFileSync('./data/debug.log', '');

  const events = [];
  await sseRequest(
    'POST',
    `/api/classes/${CID}/agents/${AID}/chat`,
    { message, conversationId: null },
    token,
    (evt) => { events.push(evt); }
  );

  console.log(`  events: ${events.map(e => e.type + (e.toolName ? ':' + e.toolName : '') + (e.skillName ? ':' + e.skillName : '')).join(', ')}`);

  const log = fs.readFileSync('./data/debug.log', 'utf-8');
  console.log('--- debug.log ---');
  console.log(log);
  console.log('--- end scenario ---');
}

async function main() {
  const CID = 'c5aa9ec3-36b2-4a0c-9778-df449b2ab0d9';
  const AID_WITH_PROMPT = 'e78d6301-c8fb-4383-a5ec-188bb7db8aa1';
  const AID_NO_PROMPT = 'df21a3dc-d6de-4872-bfc6-ce7dd85a2824';

  console.log('=== Login ===');
  const login = await httpRequest('POST', '/api/auth/login', {
    school: 'test', studentId: '0', password: '123456',
  });
  if (login.status !== 200) { console.log('LOGIN FAILED', login.body); return; }
  const token = JSON.parse(login.body).token;
  console.log('token ok');

  // Scenario 1: systemPrompt + tool calling (math + class stats)
  await runScenario(
    '1-SystemPrompt+ToolCalls',
    CID, AID_WITH_PROMPT,
    '计算 2^10 等于多少？顺便帮我统计下班级成员情况。',
    token
  );

  // Scenario 2: skill trigger (keyword match "考试")
  await runScenario(
    '2-SkillTriggered',
    CID, AID_WITH_PROMPT,
    '帮我出几道考试题目，难度中等',
    token
  );

  // Scenario 3: agent without systemPrompt (should use default)
  await runScenario(
    '3-NoSystemPrompt-Default',
    CID, AID_NO_PROMPT,
    '你好，请介绍一下你自己',
    token
  );
}

main().catch((e) => { console.error('FATAL:', e); process.exit(1); });