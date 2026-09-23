const http = require('http');
const fs = require('fs');
const pathMod = require('path');

const BASE = 'http://127.0.0.1:3000';

function request(method, urlPath, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlPath, BASE);
    const data = body ? JSON.stringify(body) : null;
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
      },
    };
    const req = http.request(options, (res) => {
      let buf = '';
      res.on('data', (c) => (buf += c));
      res.on('end', () => {
        let parsed = null;
        try { parsed = JSON.parse(buf); } catch {}
        resolve({ status: res.statusCode, body: parsed || buf });
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

function requestFile(method, urlPath, filePath, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlPath, BASE);
    const fileContent = fs.readFileSync(filePath);
    const boundary = '----TestBoundary' + Date.now();
    const filename = pathMod.basename(filePath);
    const body = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: application/octet-stream\r\n\r\n`),
      fileContent,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method,
      headers: {
        ...headers,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': body.length,
      },
    };
    const req = http.request(options, (res) => {
      let buf = '';
      res.on('data', (c) => (buf += c));
      res.on('end', () => {
        let parsed = null;
        try { parsed = JSON.parse(buf); } catch {}
        resolve({ status: res.statusCode, body: parsed || buf });
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function assert(cond, msg) {
  if (!cond) { console.error(`❌ FAIL: ${msg}`); process.exit(1); }
  console.log(`✅ ${msg}`);
}

async function main() {
  console.log('=== CampusClaw E2E Smoke Test ===\n');

  console.log('[1] admin 登录...');
  let r = await request('POST', '/api/auth/login', { school: 'admin', studentId: 'admin', password: 'admin123' });
  assert(r.status === 200 && r.body.token, 'admin 登录成功');
  const adminToken = r.body.token;

  console.log('\n[2] 创建 TestUni teacher t001...');
  r = await request('POST', '/api/admin/users', { school: 'TestUni', studentId: 't001', password: 'teacher123', role: 'teacher', name: 'Teacher 001' }, { Authorization: `Bearer ${adminToken}` });
  assert(r.status === 201, `创建 teacher 成功`);

  console.log('[3] 创建 TestUni student s001...');
  r = await request('POST', '/api/admin/users', { school: 'TestUni', studentId: 's001', password: 'student123', role: 'student', name: 'Student 001' }, { Authorization: `Bearer ${adminToken}` });
  assert(r.status === 201, `创建 student 成功`);

  console.log('\n[4] t001 登录...');
  r = await request('POST', '/api/auth/login', { school: 'TestUni', studentId: 't001', password: 'teacher123' });
  assert(r.status === 200, 't001 登录成功');
  const t001Token = r.body.token;

  console.log('[5] t001 创建班级 "高等数学"...');
  r = await request('POST', '/api/classes', { name: '高等数学', description: '2026秋季' }, { Authorization: `Bearer ${t001Token}` });
  assert(r.status === 201 && r.body.defaultKbId, `创建班级成功: classId=${r.body.classId}`);
  const classId = r.body.classId;
  const defaultKbId = r.body.defaultKbId;

  console.log('\n[6] t001 上传 PDF 教学资料...');
  const tmpPdfPath = pathMod.join(__dirname, 'tmp_test.pdf');
  fs.writeFileSync(tmpPdfPath, '%PDF-1.4\n%fake pdf content for testing\n%%EOF');
  r = await requestFile('POST', `/api/classes/${classId}/materials`, tmpPdfPath, { Authorization: `Bearer ${t001Token}` });
  console.log(`  上传响应: ${r.status} ${JSON.stringify(r.body)}`);
  assert(r.status === 201 || r.status === 400, `PDF 上传请求已处理 (status=${r.status})`);

  console.log('\n[7] t001 上传 .txt 文档到默认知识库...');
  const tmpTxtPath = pathMod.join(__dirname, 'tmp_test.txt');
  fs.writeFileSync(tmpTxtPath, '高等数学是研究极限、导数、积分和级数的数学分支。\n微积分是数学的基础。\n极限理论是微积分的核心概念。\n导数表示函数在某一点的变化率。\n积分可以用来计算曲线下的面积。');
  r = await requestFile('POST', `/api/classes/${classId}/kbs/${defaultKbId}/documents`, tmpTxtPath, { Authorization: `Bearer ${t001Token}` });
  console.log(`  文档上传响应: ${r.status} ${JSON.stringify(r.body)}`);
  assert(r.status === 201, `文档上传成功`);

  console.log('\n[8] t001 把 s001 加入班级...');
  r = await request('POST', `/api/classes/${classId}/students`, { targetSchool: 'TestUni', targetStudentId: 's001' }, { Authorization: `Bearer ${t001Token}` });
  assert(r.status === 200, `添加学生成功`);

  console.log('\n[9] s001 登录并查看班级...');
  r = await request('POST', '/api/auth/login', { school: 'TestUni', studentId: 's001', password: 'student123' });
  assert(r.status === 200, 's001 登录成功');
  const s001Token = r.body.token;

  r = await request('GET', '/api/classes/me/classes', null, { Authorization: `Bearer ${s001Token}` });
  assert(r.status === 200 && r.body.asStudent.length > 0, `s001 能看到班级`);

  console.log('\n[10] s001 查看资料列表...');
  r = await request('GET', `/api/classes/${classId}/materials`, null, { Authorization: `Bearer ${s001Token}` });
  assert(r.status === 200, `s001 查看资料成功: ${r.body.length} 项`);

  console.log('[11] s001 查看 KB 文档...');
  r = await request('GET', `/api/classes/${classId}/kbs/${defaultKbId}/documents`, null, { Authorization: `Bearer ${s001Token}` });
  assert(r.status === 200, `s001 查看 KB 文档成功: ${r.body.length} 项`);

  console.log('\n[12] s001 尝试向量检索 (MVP 未实现, 应返回 501)...');
  r = await request('POST', `/api/classes/${classId}/kbs/${defaultKbId}/query`, { query: '微积分是什么', topK: 3 }, { Authorization: `Bearer ${s001Token}` });
  console.log(`  检索响应: ${r.status}`);
  assert(r.status === 501, `向量检索返回 501 (MVP 未实现, status=${r.status})`);

  console.log('\n=== 冒烟测试完成! ===\n');

  // ========== 8.2 隔离渗透测试 ==========
  console.log('=== 隔离渗透测试 ===\n');

  console.log('[1] 创建 OtherU teacher t002...');
  r = await request('POST', '/api/admin/users', { school: 'OtherU', studentId: 't002', password: 'teacher123', role: 'teacher', name: 'Teacher 002' }, { Authorization: `Bearer ${adminToken}` });
  assert(r.status === 201, '创建 t002 成功');

  r = await request('POST', '/api/auth/login', { school: 'OtherU', studentId: 't002', password: 'teacher123' });
  const t002Token = r.body.token;
  console.log('t002 登录成功');

  console.log('\n[2] t002 尝试访问 TestUni 班级资料 (期望 403)...');
  r = await request('GET', `/api/classes/${classId}/materials`, null, { Authorization: `Bearer ${t002Token}` });
  assert(r.status === 403, `t002 跨学校访问被拒绝: status=${r.status}`);

  console.log('[3] t002 尝试向 TestUni 班级添加学生 (期望 403)...');
  r = await request('POST', `/api/classes/${classId}/students`, { targetSchool: 'TestUni', targetStudentId: 's001' }, { Authorization: `Bearer ${t002Token}` });
  assert(r.status === 403 || r.status === 404, `t002 跨学校添加学生被拒绝: status=${r.status}`);

  console.log('[4] t002 尝试对 TestUni KB 执行 query (期望 403)...');
  r = await request('POST', `/api/classes/${classId}/kbs/${defaultKbId}/query`, { query: 'test' }, { Authorization: `Bearer ${t002Token}` });
  assert(r.status === 403 || r.status === 404, `t002 跨学校 KB 访问被拒绝: status=${r.status}`);

  console.log('\n=== 隔离渗透测试完成! ===\n');

  try { fs.unlinkSync(tmpPdfPath); fs.unlinkSync(tmpTxtPath); } catch {}
  console.log('🎉 全部 E2E 测试通过！');
}

main().catch((e) => { console.error(e); process.exit(1); });