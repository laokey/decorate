import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { renderProject } from './renderer.js';

const root = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(root, 'data');
const uploadDir = path.join(dataDir, 'uploads');
const projectDir = path.join(dataDir, 'projects');
const outputDir = path.join(dataDir, 'renders');
const settingsPath = path.join(dataDir, 'store.json');
const port = Number(process.env.PORT || 4173);
const maxUploadBytes = Number(process.env.MAX_UPLOAD_MB || 500) * 1024 * 1024;
const maxRequestBytes = Math.ceil(maxUploadBytes * 1.5) + 10 * 1024 * 1024;
const mimeToExtension = { 'video/mp4': '.mp4', 'video/quicktime': '.mov', 'video/webm': '.webm' };

await Promise.all([fs.mkdir(uploadDir, { recursive: true }), fs.mkdir(projectDir, { recursive: true }), fs.mkdir(outputDir, { recursive: true })]);

const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' };
const send = (res, status, body) => { res.writeHead(status, headers); res.end(JSON.stringify(body)); };
const error = (res, status, message) => send(res, status, { error: message });

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > maxRequestBytes) { reject(new Error(`请求体过大，最多支持约 ${Math.floor(maxUploadBytes / 1024 / 1024)} MB 的总素材`)); req.destroy(); return; }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); } catch { reject(new Error('请求必须是 JSON')); }
    });
    req.on('error', reject);
  });
}

function safeName(name) { return String(name || 'video').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 100); }
function makeHook(style) { return style === '专业顾问' ? '装修别只看效果，更要看每一步是否说得清楚。' : style === '轻促销' ? '正在装修的朋友，这份开工攻略建议先收藏。' : '第一次装修，最怕开工之后才发现预算不够。'; }

function localPlan(input, files) {
  const brand = input.brand || '你的装修门店';
  const style = input.style || '真实纪录';
  const duration = Number(input.duration || 30);
  const hook = makeHook(style);
  const cta = input.contact || '欢迎到店咨询';
  const voiceover = `${hook} ${brand}从量房、设计到施工，把关键节点讲清楚，让每一分钱都花得明白。${cta}。`;
  return {
    title: `${brand} · ${style}装修日记`, duration, aspectRatio: input.platform?.includes('朋友圈') ? '16:9' : '9:16', style,
    hook, voiceover, cta, scenes: [
      { order: 1, seconds: 3, title: '开头钩子', copy: hook, assetTags: ['毛坯房', '开工现场'] },
      { order: 2, seconds: Math.max(5, Math.floor(duration * 0.25)), title: '真实施工', copy: '镜头跟随施工现场，展示工序与工地管理。', assetTags: ['施工', '工人', '工地细节'] },
      { order: 3, seconds: Math.max(5, Math.floor(duration * 0.25)), title: '专业细节', copy: '用近景拍摄材料、节点和验收标准，建立信任。', assetTags: ['水电', '验收', '材料'] },
      { order: 4, seconds: Math.max(5, duration - 3 - Math.max(5, Math.floor(duration * 0.25)) * 2), title: '到店行动', copy: cta, assetTags: ['门店', '设计师', '联系方式'] }
    ],
    assetPlan: files.length ? `已收到 ${files.length} 个上传片段，建议按“开工 → 施工 → 细节 → 到店”排列。` : '暂无上传素材，将从门店素材库匹配对应镜头。',
    music: style === '轻促销' ? '轻快、节奏清晰的生活方式音乐' : '温暖、克制的纪录感音乐',
    source: 'local-rule-engine'
  };
}

async function generateWithLLM(input, files) {
  if (!process.env.LLM_API_KEY) return localPlan(input, files);
  const prompt = `你是本地装修门店的家装营销顾问。根据以下信息生成严格 JSON，不要 Markdown：${JSON.stringify({ ...input, files: files.map((file) => file.name) })}。JSON 字段必须包含 title,duration,aspectRatio,style,hook,voiceover,cta,scenes,assetPlan,music。scenes 是包含 order,seconds,title,copy,assetTags 的数组。不得虚构案例、价格或客户评价，不得把网络素材冒充本店案例。`;
  const response = await fetch(`${process.env.LLM_BASE_URL || 'https://api.openai.com/v1'}/chat/completions`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.LLM_API_KEY}` }, body: JSON.stringify({ model: process.env.LLM_MODEL || 'gpt-4o-mini', temperature: 0.7, response_format: { type: 'json_object' }, messages: [{ role: 'system', content: '输出真实、合规、适合短视频获客的装修宣传方案。' }, { role: 'user', content: prompt }] }) });
  if (!response.ok) throw new Error(`LLM 请求失败: ${response.status}`);
  const payload = await response.json();
  return { ...JSON.parse(payload.choices?.[0]?.message?.content || '{}'), source: 'llm' };
}

async function saveFiles(files = []) {
  return Promise.all(files.map(async (file) => {
    const raw = String(file.data || '');
    const base64 = raw.includes(',') ? raw.slice(raw.indexOf(',') + 1) : raw;
    const buffer = Buffer.from(base64, 'base64');
    if (buffer.length > maxUploadBytes) throw new Error(`素材 ${file.name} 超过大小限制`);
    const id = crypto.randomUUID();
    const storedName = `${id}${mimeToExtension[file.type] || path.extname(safeName(file.name)) || '.bin'}`;
    await fs.writeFile(path.join(uploadDir, storedName), buffer);
    return { id, name: safeName(file.name), type: file.type || 'application/octet-stream', size: buffer.length, path: `data/uploads/${storedName}` };
  }));
}

async function createProject(input) {
  const files = await saveFiles(input.files);
  const plan = await generateWithLLM(input, files);
  const id = crypto.randomUUID();
  const project = { id, createdAt: new Date().toISOString(), brief: input.brief || '', brand: input.brand || '', contact: input.contact || '', platform: input.platform || '', ...plan, files };
  await fs.writeFile(path.join(projectDir, `${id}.json`), JSON.stringify(project, null, 2));
  return project;
}

async function readSettings() {
  try { return JSON.parse(await fs.readFile(settingsPath, 'utf8')); } catch { return { brand: '筑境整装', contact: '到店领取装修预算清单', address: '', phone: '', defaultStyle: '真实纪录', defaultDuration: '30', serviceArea: '' }; }
}

async function route(req, res) {
  if (req.method === 'OPTIONS') { res.writeHead(204, headers); res.end(); return; }
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (req.method === 'GET' && url.pathname === '/api/health') { send(res, 200, { ok: true, service: 'zujing-content-studio', ai: Boolean(process.env.LLM_API_KEY) }); return; }
  if (req.method === 'GET' && url.pathname === '/api/projects') {
    const files = await fs.readdir(projectDir); const projects = await Promise.all(files.filter((name) => name.endsWith('.json')).map(async (name) => JSON.parse(await fs.readFile(path.join(projectDir, name), 'utf8'))));
    projects.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)); send(res, 200, projects.map((project) => ({ id: project.id, title: project.title, brand: project.brand, style: project.style, duration: project.duration, createdAt: project.createdAt, render: project.render || null, files: project.files?.length || 0 })));
    return;
  }
  if (req.method === 'GET' && url.pathname === '/api/assets') {
    const projects = await fs.readdir(projectDir); const all = [];
    for (const name of projects.filter((item) => item.endsWith('.json'))) { const project = JSON.parse(await fs.readFile(path.join(projectDir, name), 'utf8')); for (const file of project.files || []) all.push({ ...file, projectId: project.id, projectTitle: project.title }); }
    const unique = [...new Map(all.map((file) => [file.id, file])).values()]; send(res, 200, unique); return;
  }
  if (req.method === 'GET' && url.pathname === '/api/settings') { send(res, 200, await readSettings()); return; }
  if (req.method === 'GET' && url.pathname.startsWith('/api/projects/')) {
    const id = path.basename(url.pathname);
    try {
      if (url.pathname.endsWith('/render')) { error(res, 405, '请使用 POST 渲染项目'); return; }
      send(res, 200, JSON.parse(await fs.readFile(path.join(projectDir, `${id}.json`), 'utf8')));
    } catch { error(res, 404, '项目不存在'); }
    return;
  }
  if (req.method === 'GET' && url.pathname.startsWith('/media/')) {
    const filePath = path.join(outputDir, path.basename(url.pathname));
    try { const content = await fs.readFile(filePath); res.writeHead(200, { 'Content-Type': 'video/mp4', 'Cache-Control': 'public, max-age=3600' }); res.end(content); } catch { error(res, 404, '成片不存在'); }
    return;
  }
  if (req.method === 'POST' && url.pathname === '/api/projects') {
    try { const project = await createProject(await readBody(req)); send(res, 201, project); } catch (err) { error(res, 400, err.message); }
    return;
  }
  if (req.method === 'PUT' && url.pathname === '/api/settings') { try { const settings = await readBody(req); await fs.writeFile(settingsPath, JSON.stringify(settings, null, 2)); send(res, 200, settings); } catch (err) { error(res, 400, err.message); } return; }
  if (req.method === 'POST' && /^\/api\/projects\/[^/]+\/render$/.test(url.pathname)) {
    const id = url.pathname.split('/')[3];
    try {
      const project = JSON.parse(await fs.readFile(path.join(projectDir, `${id}.json`), 'utf8'));
      const outputName = `${id}.mp4`;
      await renderProject(project, root, path.join(outputDir, outputName));
      project.render = { status: 'completed', url: `/media/${outputName}`, completedAt: new Date().toISOString() };
      await fs.writeFile(path.join(projectDir, `${id}.json`), JSON.stringify(project, null, 2));
      send(res, 200, project.render);
    } catch (err) { error(res, 422, err.message); }
    return;
  }
  if (req.method === 'POST' && url.pathname === '/api/projects/preview') {
    try { const input = await readBody(req); send(res, 200, await generateWithLLM(input, input.files || [])); } catch (err) { error(res, 400, err.message); }
    return;
  }
  if (req.method === 'GET') {
    const filePath = url.pathname === '/' ? path.join(root, 'index.html') : path.join(root, url.pathname);
    if (!filePath.startsWith(root)) { error(res, 403, '禁止访问'); return; }
    try { const content = await fs.readFile(filePath); const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' }; res.writeHead(200, { 'Content-Type': `${types[path.extname(filePath)] || 'application/octet-stream'}; charset=utf-8` }); res.end(content); } catch { error(res, 404, '资源不存在'); }
    return;
  }
  error(res, 404, '接口不存在');
}

http.createServer((req, res) => route(req, res).catch((err) => error(res, 500, err.message))).listen(port, () => console.log(`筑境内容工作台运行于 http://localhost:${port}`));
