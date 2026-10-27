const http = require('http');
const fs = require('fs');

function req(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: '127.0.0.1', port: 3000, path, method,
      headers: { 'Content-Type': 'application/json' },
    };
    if (token) opts.headers['Authorization'] = 'Bearer ' + token;
    const r = http.request(opts, (res) => {
      let d = ''; res.on('data', c => d += c); res.on('end', () => resolve({ s: res.statusCode, body: d }));
    });
    r.on('error', reject);
    if (body) r.write(typeof body === 'string' ? body : JSON.stringify(body));
    r.end();
  });
}

function sse(method, path, body, token, onEvent) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: '127.0.0.1', port: 3000, path, method,
      headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
    };
    if (token) opts.headers['Authorization'] = 'Bearer ' + token;
    const r = http.request(opts, (res) => {
      let buf = '';
      res.on('data', (c) => {
        buf += c.toString();
        let idx;
        while ((idx = buf.indexOf('\n\n')) !== -1) {
          const ev = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          for (const line of ev.split('\n')) {
            if (!line.startsWith('data:')) continue;
            const d = line.slice(5).trim();
            if (!d) continue;
            try { onEvent(JSON.parse(d)); } catch {}
          }
        }
      });
      res.on('end', resolve);
    });
    r.on('error', reject);
    if (body) r.write(typeof body === 'string' ? body : JSON.stringify(body));
    r.end();
  });
}

async function main() {
  const args = process.argv.slice(2);
  const [label, cid, aid, message] = args;
  const outFile = `./data/debug_${label}.md`;

  console.log(`[${label}] Running...`);

  const login = await req('POST', '/api/auth/login', {
    school: 'test', studentId: '0', password: '123456',
  });
  if (login.s !== 200) { console.log('login failed'); process.exit(1); }
  const token = JSON.parse(login.body).token;

  fs.writeFileSync('./data/debug.log', '');
  const events = [];
  try {
    await sse('POST', `/api/classes/${cid}/agents/${aid}/chat`,
      { message, conversationId: null }, token,
      (evt) => events.push(evt));
  } catch (e) { console.log('[sse err]', e.message); }

  const log = fs.readFileSync('./data/debug.log', 'utf-8');

  const md = [];
  md.push(`# Debug Log: ${label}`);
  md.push('');
  md.push(`**User message:** ${message}`);
  md.push(`**agentId:** ${aid}`);
  md.push(`**classId:** ${cid}`);
  md.push('');
  md.push('## SSE Events');
  md.push('');
  for (const e of events) {
    const parts = [e.type];
    if (e.toolName) parts.push(`tool=${e.toolName}`);
    if (e.skillName) parts.push(`skill=${e.skillName}`);
    if (e.toolArgs) parts.push(`args=${JSON.stringify(e.toolArgs)}`);
    if (e.toolResult !== undefined) {
      const tr = typeof e.toolResult === 'string' ? e.toolResult : JSON.stringify(e.toolResult);
      parts.push(`result=${tr.slice(0, 200)}`);
    }
    if (e.answer) parts.push(`answer=${e.answer.slice(0, 500)}`);
    md.push(`- ${parts.join(' | ')}`);
  }
  md.push('');
  md.push('## Raw debug.log');
  md.push('');
  md.push('```');
  md.push(log);
  md.push('```');
  fs.writeFileSync(outFile, md.join('\n'));
  console.log(`[${label}] -> ${outFile}`);
}

main().catch((e) => { console.error('FATAL', e); process.exit(1); });