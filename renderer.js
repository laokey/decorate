import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';

const ffmpegBinary = process.env.FFMPEG_PATH || 'ffmpeg';

function ttsEndpoint() {
  if (process.env.TTS_API_URL) return process.env.TTS_API_URL;
  const base = process.env.LLM_BASE_URL || '';
  if (base.includes('/compatible-mode/v1')) return base.replace('/compatible-mode/v1', '/api/v1/services/audio/tts/SpeechSynthesizer');
  return 'https://dashscope.aliyuncs.com/api/v1/services/audio/tts/SpeechSynthesizer';
}

function escapeConcatPath(filePath) {
  return filePath.replaceAll("'", "'\\''");
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('error', (err) => reject(new Error(`无法启动 FFmpeg：${err.message}`)));
    child.on('close', (code) => code === 0 ? resolve() : reject(new Error(`FFmpeg 渲染失败：${stderr.slice(-1200)}`)));
  });
}

function runText(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('error', reject);
    child.on('close', (code) => code === 0 ? resolve() : reject(new Error(stderr.slice(-800))));
  });
}

function readText(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = ''; let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('error', reject);
    child.on('close', (code) => code === 0 ? resolve(stdout.trim()) : reject(new Error(stderr.slice(-800))));
  });
}

export async function createNarration(project, narrationPath) {
  const text = [project.hook, project.voiceover, project.cta].filter(Boolean).join(' ');
  const apiKey = process.env.TTS_API_KEY || process.env.LLM_API_KEY;
  if (apiKey && process.env.TTS_DISABLED !== 'true') {
    const response = await fetch(ttsEndpoint(), { method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model: process.env.TTS_MODEL || 'cosyvoice-v3-flash', input: { text, voice: process.env.TTS_VOICE || 'longanyang', format: 'wav', sample_rate: 24000, language_hints: ['zh'] } }) });
    const payload = await response.json();
    if (!response.ok || !payload.output?.audio?.url) throw new Error(`阿里云语音合成失败：${payload.message || payload.code || response.status}`);
    const audio = await fetch(payload.output.audio.url);
    if (!audio.ok) throw new Error(`无法下载语音文件：${audio.status}`);
    await fs.writeFile(narrationPath, Buffer.from(await audio.arrayBuffer()));
    return;
  }
  if (process.platform !== 'darwin') throw new Error('CentOS 未配置 TTS_API_KEY，且系统没有 macOS say 命令。请在 .env 配置 TTS_API_KEY 或 LLM_API_KEY。');
  await runText('say', ['-v', project.voice || 'Tingting', '-o', narrationPath, text]);
}

function srtTime(seconds) {
  const whole = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(whole / 3600)).padStart(2, '0')}:${String(Math.floor((whole % 3600) / 60)).padStart(2, '0')}:${String(whole % 60).padStart(2, '0')},000`;
}

function createSrt(project, duration) {
  let cursor = 0;
  const scenes = project.scenes || [];
  const weights = scenes.map((scene) => Math.max(1, String(scene.copy || scene.title || '').length));
  const total = weights.reduce((sum, value) => sum + value, 0) || 1;
  return scenes.map((scene, index) => {
    const start = cursor; cursor += duration * weights[index] / total;
    return `${index + 1}\n${srtTime(start)} --> ${srtTime(cursor)}\n${scene.copy || scene.title || ''}\n`;
  }).join('\n');
}

export async function renderProject(project, root, outputPath) {
  if (!project.files?.length) throw new Error('项目没有可渲染的上传素材');
  const sourceFiles = project.files.map((file) => path.resolve(root, file.path));
  const existing = await Promise.all(sourceFiles.map(async (file) => { try { await fs.access(file); return file; } catch { return null; } }));
  const usableFiles = existing.filter(Boolean);
  if (!usableFiles.length) throw new Error('项目素材文件不存在，请重新上传素材');

  const listPath = `${outputPath}.concat.txt`;
  const srtPath = `${outputPath}.srt`;
  const narrationPath = `${outputPath}.aiff`;
  const list = usableFiles.map((file) => `file '${escapeConcatPath(file)}'`).join('\n');
  await fs.writeFile(listPath, `${list}\n`);
  const filter = 'scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=black';
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  try {
    await createNarration(project, narrationPath);
    const narrationDuration = Number(await readText('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', narrationPath]));
    await fs.writeFile(srtPath, createSrt(project, narrationDuration));
    const subtitleNames = { clean: '清爽白字', strong: '醒目黑底', warm: '暖色重点' };
    await run(ffmpegBinary, ['-y', '-f', 'concat', '-safe', '0', '-i', listPath, '-i', narrationPath, '-f', 'srt', '-i', srtPath, '-map', '0:v:0', '-map', '1:a:0', '-map', '2:0', '-vf', filter, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-c:a', 'aac', '-b:a', '128k', '-c:s', 'mov_text', '-metadata:s:s:0', 'language=chi', '-metadata:s:s:0', `handler_name=${subtitleNames[project.subtitleStyle] || subtitleNames.clean}`, '-shortest', '-movflags', '+faststart', outputPath]);
  } finally {
    await fs.rm(listPath, { force: true });
    await fs.rm(srtPath, { force: true });
    await fs.rm(narrationPath, { force: true });
  }
  return outputPath;
}
