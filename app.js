const state = { style: '真实纪录', files: [], generated: false, projectId: null, plan: null };
const $ = (selector) => document.querySelector(selector);

document.querySelectorAll('.nav-item').forEach((item) => item.addEventListener('click', () => switchView(item.dataset.view)));
function switchView(view) {
  document.querySelectorAll('.nav-item').forEach((item) => item.classList.toggle('active', item.dataset.view === view));
  $('.content-grid').style.display = view === 'new' ? '' : 'none';
  document.querySelectorAll('.management-view').forEach((panel) => panel.classList.toggle('visible', panel.id === `${view}-view`));
  const names = { new: '新建宣传视频', history: '项目历史', assets: '素材库', settings: '门店设置' };
  $('.topbar h1').textContent = names[view];
  if (view === 'history') loadHistory();
  if (view === 'assets') loadAssets();
  if (view === 'settings') loadSettings();
}

async function api(path, options) { const response = await fetch(path, options); const body = await response.json(); if (!response.ok) throw new Error(body.error || '请求失败'); return body; }

async function loadHistory() {
  try { const projects = await api('/api/projects'); const list = $('#history-list'); if (!projects.length) { list.innerHTML = '<div class="empty-view">还没有生成过项目</div>'; return; } list.innerHTML = '<div class="history-row head"><span>项目名称</span><span>风格</span><span>素材</span><span>状态</span><span>操作</span></div>' + projects.map((project) => `<div class="history-row"><div class="history-title"><strong>${project.title || '未命名项目'}</strong><small>${new Date(project.createdAt).toLocaleString('zh-CN')}</small></div><span>${project.style || '-'}</span><span>${project.files} 个视频</span><span class="history-status ${project.render ? '' : 'pending'}">${project.render ? '已出片' : '仅方案'}</span><button class="row-action" data-project-id="${project.id}">${project.render ? '查看成片' : '查看项目'}</button></div>`).join(''); list.querySelectorAll('.row-action').forEach((button) => button.addEventListener('click', () => openProject(button.dataset.projectId))); } catch (error) { $('#history-list').innerHTML = `<div class="empty-view">${error.message}</div>`; }
}
async function openProject(id) { const project = await api(`/api/projects/${id}`); if (project.render) { $('#phone-screen').innerHTML = `<video src="${project.render.url}" controls autoplay playsinline style="width:100%;height:100%;object-fit:cover"></video>`; switchView('new'); showToast('已打开历史成片'); } else showToast('这是方案项目，当前可在历史记录中查看信息'); }
async function loadAssets() { try { const assets = await api('/api/assets'); $('#asset-count').textContent = `${assets.length} 个素材`; $('#asset-list').innerHTML = assets.length ? assets.map((asset) => `<article class="asset-card"><video src="/${asset.path.replace(/^data\//, 'data/')}" controls preload="metadata"></video><div class="asset-info"><strong>${asset.name}</strong><small>${asset.projectTitle || '未关联项目'} · ${(asset.size / 1024 / 1024).toFixed(1)} MB</small></div></article>`).join('') : '<div class="empty-view">上传视频并生成项目后，素材会出现在这里</div>'; } catch (error) { $('#asset-list').innerHTML = `<div class="empty-view">${error.message}</div>`; } }
async function loadSettings() { try { const settings = await api('/api/settings'); Object.entries(settings).forEach(([key, value]) => { const field = $(`[name="${key}"]`); if (field) field.value = value || ''; }); } catch (error) { showToast(error.message); } }
$('#refresh-history').addEventListener('click', loadHistory);
$('#settings-form').addEventListener('submit', async (event) => { event.preventDefault(); const data = Object.fromEntries(new FormData(event.currentTarget)); try { await api('/api/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }); $('#brand').value = data.brand; $('#contact').value = data.contact; showToast('门店设置已保存'); } catch (error) { showToast(error.message); } });

const brief = $('#brief');
const charCount = $('#char-count');
brief.addEventListener('input', () => {
  if (brief.value.length > 200) brief.value = brief.value.slice(0, 200);
  charCount.textContent = `${brief.value.length} / 200`;
});
charCount.textContent = `${brief.value.length} / 200`;

document.querySelectorAll('.style-card').forEach((card) => {
  card.addEventListener('click', () => {
    document.querySelectorAll('.style-card').forEach((item) => item.classList.remove('selected'));
    card.classList.add('selected');
    state.style = card.dataset.style;
    $('#project-name').textContent = `新建 · ${state.style}`;
  });
});

$('#video-files').addEventListener('change', (event) => {
  state.files = [...event.target.files];
  renderFiles();
  if (state.files.length) showToast(`已添加 ${state.files.length} 个素材片段`);
});

function renderFiles() {
  const list = $('#file-list');
  list.innerHTML = '';
  state.files.forEach((file, index) => {
    const item = document.createElement('div');
    item.className = 'file-item';
    item.draggable = true;
    item.dataset.index = index;
    item.addEventListener('dragstart', () => item.classList.add('dragging'));
    item.addEventListener('dragend', () => item.classList.remove('dragging'));
    item.addEventListener('dragover', (event) => event.preventDefault());
    item.addEventListener('drop', (event) => {
      event.preventDefault();
      const from = Number(document.querySelector('.file-item.dragging')?.dataset.index);
      const to = Number(item.dataset.index);
      if (Number.isInteger(from) && from !== to) { const [moved] = state.files.splice(from, 1); state.files.splice(to, 0, moved); renderFiles(); }
    });
    const order = document.createElement('em');
    order.className = 'file-order'; order.textContent = String(index + 1).padStart(2, '0'); item.append(order);
    const thumb = document.createElement('video');
    thumb.className = 'file-thumb';
    thumb.src = URL.createObjectURL(file);
    thumb.muted = true;
    thumb.preload = 'metadata';
    item.append(thumb);
    const name = document.createElement('span');
    name.textContent = file.name;
    const size = document.createElement('em');
    size.className = 'file-size';
    size.textContent = `${(file.size / 1024 / 1024).toFixed(1)} MB`;
    const actions = document.createElement('div'); actions.className = 'file-actions';
    [['↑', index - 1], ['↓', index + 1]].forEach(([label, target]) => {
      const move = document.createElement('button'); move.type = 'button'; move.textContent = label; move.disabled = target < 0 || target >= state.files.length; move.title = label === '↑' ? '上移' : '下移';
      move.addEventListener('click', () => { [state.files[index], state.files[target]] = [state.files[target], state.files[index]]; renderFiles(); }); actions.append(move);
    });
    item.append(name, size, actions);
    list.append(item);
  });
}

$('#brief-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = event.submitter;
  button.disabled = true;
  button.innerHTML = '<span>◌</span> 正在生成方案...';
  $('#status-pill').textContent = 'AI 分析中';
  $('#status-pill').classList.add('ready');
  try {
    const response = await fetch('/api/projects/preview', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ brief: brief.value, platform: $('#platform').value, duration: $('#duration').value, style: state.style, brand: $('#brand').value, contact: $('#contact').value, files: state.files.map((file) => ({ name: file.name, type: file.type })) }) });
    if (!response.ok) throw new Error((await response.json()).error || '生成失败');
    const plan = await response.json();
    state.plan = plan;
    generatePlan(plan);
    await saveProject(plan);
    button.disabled = false;
    button.innerHTML = '<span>✦</span> 重新生成方案 <b>⌘ ↵</b>';
    showToast('视频方案已生成，可以导出或继续修改');
  } catch (error) {
    button.disabled = false;
    button.innerHTML = '<span>✦</span> 生成视频方案 <b>⌘ ↵</b>';
    $('#status-pill').textContent = '生成失败';
    showToast(`生成失败：${error.message}`);
  }
});

async function generatePlan(plan = null) {
  state.generated = true;
  const duration = $('#duration').value;
  const brand = $('#brand').value.trim() || '你的装修门店';
  const contact = $('#contact').value.trim() || '欢迎到店咨询';
  const hasFiles = state.files.length > 0;
  const hook = plan?.hook || (state.style === '专业顾问' ? '装修别只看效果，更要看每一步是否说得清楚。' : state.style === '轻促销' ? '正在装修的朋友，这份开工攻略建议先收藏。' : '第一次装修，最怕开工之后才发现预算不够。');
  const voice = plan?.voiceover || `${hook} ${brand}从量房、设计到施工，把关键节点讲清楚，让每一分钱都花得明白。${contact}。`;
  $('#status-pill').textContent = '方案已就绪';
  $('#project-name').textContent = `${brand} · ${state.style}`;
  $('#result-card').classList.add('generated');
  $('#result-card').innerHTML = `<div class="result-title"><span class="spark">✦</span><div><strong>AI 家装顾问</strong><small>${duration} 秒 · ${state.style}</small></div></div><div class="result-empty"><b>开头钩子</b>${hook}<br /><br /><b>旁白提案</b>${voice}<br /><br /><b>素材安排</b>${plan?.assetPlan || (hasFiles ? `已匹配 ${state.files.length} 个上传片段，按“开工 → 施工 → 细节 → 到店”排列。` : '当前没有上传素材，将使用门店素材库中的对应镜头。')}</div>`;
  $('#download-button').disabled = false;
  renderPhonePreview(brand, hook, duration);
}

async function fileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error(`读取素材失败：${file.name}`));
    reader.readAsDataURL(file);
  });
}

async function saveProject(plan) {
  $('#status-pill').textContent = state.files.length ? '正在保存素材' : '正在保存项目';
  const files = await Promise.all(state.files.map(async (file) => ({ name: file.name, type: file.type, data: await fileAsDataUrl(file) })));
  const response = await fetch('/api/projects', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ brief: brief.value, platform: $('#platform').value, duration: $('#duration').value, style: state.style, brand: $('#brand').value, contact: $('#contact').value, files }) });
  if (!response.ok) throw new Error((await response.json()).error || '项目保存失败');
  const project = await response.json();
  state.projectId = project.id;
  $('#status-pill').textContent = '方案已保存';
  $('#render-button').disabled = !state.files.length;
  showToast(state.files.length ? '素材已保存，可以生成 MP4' : '方案已保存；上传素材后即可生成 MP4');
}

function renderPhonePreview(brand, hook, duration) {
  const screen = $('#phone-screen');
  screen.innerHTML = '';
  if (state.files[0]) {
    const video = document.createElement('video');
    video.src = URL.createObjectURL(state.files[0]);
    video.autoplay = true;
    video.loop = true;
    video.muted = true;
    video.playsInline = true;
    video.style.cssText = 'width:100%;height:100%;object-fit:cover;filter:saturate(.8) contrast(.95);';
    screen.append(video);
  } else {
    screen.style.background = 'linear-gradient(145deg,#526f5f,#c9d7bc 54%,#e7d4ad)';
  }
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:absolute;inset:0;padding:20px 16px;display:flex;flex-direction:column;justify-content:space-between;color:white;background:linear-gradient(180deg,#10261caa,transparent 45%,#10261cdd);text-shadow:0 1px 4px #0008;';
  overlay.innerHTML = `<div style="font-size:9px;letter-spacing:.1em">${brand} · 装修日记</div><div><strong style="font-size:16px;line-height:1.45;display:block">${hook}</strong><small style="font-size:9px;margin-top:10px;display:block">${duration}s short film</small></div>`;
  screen.append(overlay);
}

$('#download-button').addEventListener('click', () => {
  const plan = { brand: $('#brand').value, brief: brief.value, platform: $('#platform').value, duration: $('#duration').value, style: state.style, files: state.files.map((file) => file.name), generatedAt: new Date().toISOString() };
  const blob = new Blob([JSON.stringify(plan, null, 2)], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = 'zujing-video-plan.json';
  link.click();
  showToast('方案文件已导出');
});

$('#render-button').addEventListener('click', async () => {
  if ($('#render-button').dataset.rendered === 'true') {
    const link = document.createElement('a');
    link.href = $('#render-button').dataset.url;
    link.download = `${$('#brand').value || '装修宣传'}.mp4`;
    link.click();
    return;
  }
  if (!state.projectId) { showToast('请先生成并保存方案'); return; }
  const button = $('#render-button');
  button.disabled = true;
  button.textContent = '◌ 正在渲染 MP4...';
  $('#status-pill').textContent = '视频渲染中';
  try {
    const response = await fetch(`/api/projects/${state.projectId}/render`, { method: 'POST' });
    if (!response.ok) throw new Error((await response.json()).error || '渲染失败');
    const render = await response.json();
    const video = document.createElement('video');
    video.src = `${render.url}?t=${Date.now()}`;
    video.controls = true;
    video.autoplay = true;
    video.playsInline = true;
    video.style.cssText = 'width:100%;height:100%;object-fit:cover;';
    $('#phone-screen').innerHTML = '';
    $('#phone-screen').append(video);
    $('#status-pill').textContent = '成片已完成';
    button.textContent = '↓ 下载 MP4 成片';
    button.disabled = false;
    button.dataset.rendered = 'true';
    button.dataset.url = render.url;
    showToast('MP4 成片已生成');
  } catch (error) {
    button.disabled = false;
    button.textContent = '▶ 生成 MP4 成片';
    $('#status-pill').textContent = '渲染失败';
    showToast(`渲染失败：${error.message}`);
  }
});

function showToast(message) {
  const toast = $('#toast');
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2400);
}
