const state = { style: '真实纪录', files: [], generated: false, projectId: null, plan: null };
const $ = (selector) => document.querySelector(selector);
let taskTimer;
function showTask(title, message) { $('#task-title').textContent = title; $('#task-message').textContent = message; $('#task-progress-bar').style.width = '10%'; $('#task-overlay').classList.add('visible'); $('#task-overlay').setAttribute('aria-hidden', 'false'); clearInterval(taskTimer); let progress = 10; taskTimer = setInterval(() => { progress = Math.min(progress + 4, 88); $('#task-progress-bar').style.width = `${progress}%`; }, 900); }
function updateTask(step, message, progress) { $('#task-message').textContent = message; $('#task-progress-bar').style.width = `${progress}%`; document.querySelectorAll('.task-steps span').forEach((item) => item.classList.remove('active')); $(`#task-step-${step}`).classList.add('active'); }
function hideTask() { clearInterval(taskTimer); $('#task-overlay').classList.remove('visible'); $('#task-overlay').setAttribute('aria-hidden', 'true'); }
$('#task-cancel').addEventListener('click', () => { hideTask(); showToast('任务仍在后台处理，请稍后查看状态'); });

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
$('#subtitle-style').addEventListener('change', () => { if (state.generated) renderPhonePreview($('#brand').value.trim() || '你的装修门店', state.plan?.hook || '', state.plan?.duration || ''); });
$('#voice-preview').addEventListener('click', async () => {
  const button = $('#voice-preview'); button.disabled = true; button.textContent = '生成中';
  try { const response = await fetch('/api/tts/preview', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ voice: $('#voice').value, text: '您好，这里是筑境整装。我们把装修每一个关键环节都讲清楚，让您的家住得安心。' }) }); const payload = await response.json(); if (!response.ok) throw new Error(payload.error || '试听失败'); const audio = new Audio(URL.createObjectURL(await (await fetch(payload.audio)).blob())); await audio.play(); } catch (error) { showToast(`试听失败：${error.message}`); } finally { button.disabled = false; button.textContent = '▶ 试听'; }
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
  showTask('正在生成视频方案', '正在分析你的需求和门店信息...');
  button.disabled = true;
  button.innerHTML = '<span>◌</span> 正在生成方案...';
  $('#status-pill').textContent = 'AI 分析中';
  $('#status-pill').classList.add('ready');
  try {
    updateTask(1, '正在分析你的需求和门店信息...', 24);
    const response = await fetch('/api/projects/preview', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ brief: brief.value, platform: $('#platform').value, duration: 30, style: state.style, voice: $('#voice').value, subtitleStyle: $('#subtitle-style').value, brand: $('#brand').value, contact: $('#contact').value, files: state.files.map((file) => ({ name: file.name, type: file.type })) }) });
    if (!response.ok) throw new Error((await response.json()).error || '生成失败');
    const plan = await response.json();
    updateTask(2, '脚本、旁白和镜头顺序已生成...', 58);
    state.plan = plan;
    generatePlan(plan);
    const project = await saveProject(plan);
    state.plan = project;
    generatePlan(project);
    updateTask(3, '项目和素材已保存，马上完成...', 100);
    hideTask();
    button.disabled = false;
    button.innerHTML = '<span>✦</span> 重新生成方案 <b>⌘ ↵</b>';
    showToast('视频方案已生成，可以导出或继续修改');
  } catch (error) {
    hideTask();
    button.disabled = false;
    button.innerHTML = '<span>✦</span> 生成视频方案 <b>⌘ ↵</b>';
    $('#status-pill').textContent = '生成失败';
    showToast(`生成失败：${error.message}`);
  }
});

async function generatePlan(plan = null) {
  state.generated = true;
  const duration = plan?.duration || '上传后计算';
  const brand = $('#brand').value.trim() || '你的装修门店';
  const contact = $('#contact').value.trim() || '欢迎到店咨询';
  const hasFiles = state.files.length > 0;
  const hook = typeof plan?.hook === 'string' ? plan.hook : (state.style === '专业顾问' ? '装修别只看效果，更要看每一步是否说得清楚。' : state.style === '轻促销' ? '正在装修的朋友，这份开工攻略建议先收藏。' : '第一次装修，最怕开工之后才发现预算不够。');
  const voice = typeof plan?.voiceover === 'string' ? plan.voiceover : `${hook} ${brand}从量房、设计到施工，把关键节点讲清楚，让每一分钱都花得明白。${contact}。`;
  $('#status-pill').textContent = '方案已就绪';
  $('#project-name').textContent = `${brand} · ${state.style}`;
  $('#result-card').classList.add('generated');
  $('#duration-value').textContent = `${duration} 秒`;
  $('#result-card').innerHTML = `<div class="result-title"><span class="spark">✦</span><div><strong>AI 家装顾问</strong><small>${duration} 秒 · ${state.style}</small></div></div><div class="editable-plan"><label>开头钩子<textarea id="edit-hook" rows="2">${hook}</textarea></label><label>旁白提案<textarea id="edit-voiceover" rows="5">${voice}</textarea></label><button class="secondary-button plan-save" id="save-plan" type="button">保存修改</button></div>`;
  $('#edit-hook').addEventListener('input', () => { state.plan.hook = $('#edit-hook').value; renderPhonePreview(brand, $('#edit-hook').value, duration); });
  $('#edit-voiceover').addEventListener('input', () => { state.plan.voiceover = $('#edit-voiceover').value; });
  $('#save-plan').addEventListener('click', savePlanEdits);
  $('#download-button').disabled = false;
  renderPhonePreview(brand, hook, duration);
}

async function savePlanEdits() { if (!state.projectId) return; try { const response = await fetch(`/api/projects/${state.projectId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ hook: $('#edit-hook').value, voiceover: $('#edit-voiceover').value }) }); if (!response.ok) throw new Error((await response.json()).error || '保存失败'); state.plan = await response.json(); showToast('钩子和旁白已保存'); } catch (error) { showToast(`保存失败：${error.message}`); } }

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
  const response = await fetch('/api/projects', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ brief: brief.value, platform: $('#platform').value, duration: 30, style: state.style, voice: $('#voice').value, subtitleStyle: $('#subtitle-style').value, brand: $('#brand').value, contact: $('#contact').value, files }) });
  if (!response.ok) throw new Error((await response.json()).error || '项目保存失败');
  const project = await response.json();
  state.projectId = project.id;
  $('#duration-value').textContent = `${project.duration} 秒`;
  $('#status-pill').textContent = '方案已保存';
  $('#render-button').disabled = !state.files.length;
  showToast(state.files.length ? '素材已保存，可以生成 MP4' : '方案已保存；上传素材后即可生成 MP4');
  return project;
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
  overlay.style.cssText = 'position:absolute;inset:0;padding:20px 16px;display:flex;flex-direction:column;justify-content:space-between;align-items:center;color:white;background:linear-gradient(180deg,#10261caa,transparent 45%,#10261cdd);text-shadow:0 1px 4px #0008;';
  overlay.innerHTML = `<div style="width:100%;font-size:9px;letter-spacing:.1em">${brand} · 装修日记</div><div style="width:100%;text-align:center"><strong class="preview-subtitle ${$('#subtitle-style').value}" style="font-size:16px;display:inline-block">${hook}</strong><small style="font-size:9px;margin-top:10px;display:block">${duration}s short film</small></div>`;
  screen.append(overlay);
}

$('#download-button').addEventListener('click', () => {
  const plan = { brand: $('#brand').value, brief: brief.value, platform: $('#platform').value, duration: state.plan?.duration || 0, style: state.style, files: state.files.map((file) => file.name), generatedAt: new Date().toISOString() };
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
  showTask('正在生成 MP4 成片', '正在拼接素材、生成旁白和字幕...');
  button.disabled = true;
  button.textContent = '◌ 正在渲染 MP4...';
  $('#status-pill').textContent = '视频渲染中';
  try {
    updateTask(1, '正在读取并排序视频素材...', 25);
    const response = await fetch(`/api/projects/${state.projectId}/render`, { method: 'POST' });
    if (!response.ok) throw new Error((await response.json()).error || '渲染失败');
    const render = await response.json();
    updateTask(2, '正在合成画面、旁白和字幕...', 76);
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
    updateTask(3, '成片已完成，可以预览或下载。', 100);
    hideTask();
    showToast('MP4 成片已生成');
  } catch (error) {
    hideTask();
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
