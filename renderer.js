import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';

const ffmpegBinary = process.env.FFMPEG_PATH || 'ffmpeg';

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

function srtTime(seconds) {
  const whole = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(whole / 3600)).padStart(2, '0')}:${String(Math.floor((whole % 3600) / 60)).padStart(2, '0')}:${String(whole % 60).padStart(2, '0')},000`;
}

function createSrt(project) {
  let cursor = 0;
  return (project.scenes || []).map((scene, index) => {
    const start = cursor; cursor += Number(scene.seconds || 3);
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
  await fs.writeFile(srtPath, createSrt(project));
  const filter = 'scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=black';
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  try {
    const narration = [project.hook, project.voiceover, project.cta].filter(Boolean).join(' ');
    await runText('say', ['-v', process.env.TTS_VOICE || 'Tingting', '-o', narrationPath, narration]);
    await run(ffmpegBinary, ['-y', '-f', 'concat', '-safe', '0', '-i', listPath, '-i', narrationPath, '-i', srtPath, '-map', '0:v:0', '-map', '1:a:0', '-map', '2:0', '-vf', filter, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-c:a', 'aac', '-b:a', '128k', '-c:s', 'mov_text', '-metadata:s:s:0', 'language=chi', '-shortest', '-movflags', '+faststart', outputPath]);
  } finally {
    await fs.rm(listPath, { force: true });
    await fs.rm(srtPath, { force: true });
    await fs.rm(narrationPath, { force: true });
  }
  return outputPath;
}
