import { app, BrowserWindow, clipboard, dialog, ipcMain, protocol, shell, Menu, nativeImage } from 'electron';
import path from 'node:path';
import fs from 'node:fs/promises';
import { createReadStream, existsSync } from 'node:fs';
import { createWriteStream } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import http from 'node:http';
import https from 'node:https';
import { spawn } from 'node:child_process';
import ffmpegPath from 'ffmpeg-static';
import { signConfigPayload, verifySignedConfig } from './configSignature.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isDev = !app.isPackaged;

const imageExtensions = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp', '.tif', '.tiff', '.avif', '.svg', '.ico', '.heic', '.heif', '.jxl']);
const adImageExtensions = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.svg']);
const videoExtensions = new Set(['.mp4', '.webm', '.mov', '.mkv', '.avi', '.m4v', '.ogv', '.3gp', '.3g2', '.ts', '.m3u8']);
const animationExtensions = new Set(['.gif']);
const designExtensions = new Set(['.psd', '.ai', '.eps', '.pdf']);
const supportedRemoteExtensions = new Set([...imageExtensions, ...videoExtensions, ...designExtensions]);
const extensionRequestMaxBytes = 220 * 1024 * 1024;
const aiImageMaxBytes = 5 * 1024 * 1024;
const trashRetentionMs = 30 * 24 * 60 * 60 * 1000;
const dragFallbackIconDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAAACXBIWXMAAAsTAAALEwEAmpwYAAABuUlEQVR4nO2aPU7DQBCFXxYkJHQUNBQ0FNwAcggUFBwCS0BBS0FBR0FBQUVNR0FBQ08AZ+0YJ4l9z3jG3nF2ySopVnZm5v3Z2Z0xAAAAAAAAAAAAAAAAgEZm5z5w4n3nJd/smV3sBXiBN/AJLsAR2JHd8wW4gTfwCi7AIdh6GcAdOAHv4B1cxptgG7wLE0gaYI+RHR6BJeALPIFbcAFuYV4LrIF34BpcgltwAR7BJVzAOrkxSgF7juzIGcJjYALv4GcJfYAJ8jJDnP0rbBx4BM/BY3oMcIA1fI2QJ3/NpJ5LgucgA/wJkKe/DiMHAHf4Db8rL+GJXADJtAB14VgOc+TWGgD+MBrmNcAA/gNR6EJ3IALWADnKgQ1wDx/gCG7BFVTAEPwLr+FHxgg4AadqFDXAQL2AF7MNv0NHvhg3wBl7BtehvsQJWwAqYxgY4J4DvL1OCT+ADnIAPsC0bcgJH4FfYkJs/Mu3BRTgCt+ARvIovwN3QxpWwhq8B2cAyQhxlwBf4Gm/NhLD9PKOBD7ALj+ILcDt0cYV9YB1/gTfwCr4Ad2T0PAGu4A28ggtwCHZvA/gAgHkcgGd3N2Ccmv4/vZR7bT/8aQEAAAAAAAAAAAAAAEDP8gEw5nsn+G+R0gAAAABJRU5ErkJggg==';
const updateRequestTimeoutMs = 30000;
const updateDownloadTimeoutMs = 120000;
const defaultRemoteAdsUrl = 'https://cyruschen213.github.io/cyrus-ai-asset-manager/ads.json';
const defaultUpdateConfigUrl = 'https://cyruschen213.github.io/cyrus-ai-asset-manager/update.json';

let mainWindow;
let activeRootPath = '';
let extensionServer;
const extensionServerPort = 17321;
const aiRequestControllers = new Map();
let activeDownload = null;

function getAppVariant() {
  const explicit = String(process.env.CYRUS_APP_VARIANT || '').toLowerCase();
  if (explicit === 'user' || explicit === 'admin') return explicit;
  const appName = app.getName();
  if (appName.includes('用户版')) return 'user';
  return 'admin';
}

function getProductTitle() {
  return getAppVariant() === 'user' ? 'Cyrus Ai素材管理 用户版' : 'Cyrus Ai素材管理 管理版';
}

function getExtensionFolderPath() {
  if (isDev) return path.resolve(__dirname, '..', 'extension');
  return path.join(process.resourcesPath, 'app.asar.unpacked', 'extension');
}

function getBrowserExtensionUrl(browser = 'chrome') {
  return browser === 'edge' ? 'edge://extensions/' : 'chrome://extensions/';
}

function getBrowserExecutableCandidates(browser = 'chrome') {
  const programFiles = process.env.ProgramFiles || 'C:\\Program Files';
  const programFilesX86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
  const localAppData = process.env.LOCALAPPDATA || '';
  if (browser === 'edge') {
    return [
      path.join(programFilesX86, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
      path.join(programFiles, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
      localAppData ? path.join(localAppData, 'Microsoft', 'Edge', 'Application', 'msedge.exe') : '',
    ].filter(Boolean);
  }
  return [
    path.join(programFiles, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    path.join(programFilesX86, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    localAppData ? path.join(localAppData, 'Google', 'Chrome', 'Application', 'chrome.exe') : '',
  ].filter(Boolean);
}

async function openBrowserExtensionsPage(browser = 'chrome') {
  const targetUrl = getBrowserExtensionUrl(browser);
  const browserPath = getBrowserExecutableCandidates(browser).find((candidate) => existsSync(candidate));
  if (browserPath) {
    const child = spawn(browserPath, [targetUrl], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    });
    child.unref();
    return { opened: true, url: targetUrl, browserPath };
  }
  await shell.openExternal(targetUrl);
  return { opened: true, url: targetUrl, browserPath: '' };
}

app.setName(getProductTitle());
app.setPath('userData', path.join(app.getPath('appData'), getProductTitle()));

const singleInstanceLock = app.requestSingleInstanceLock();

if (!singleInstanceLock) {
  app.quit();
}

function ensureDir(dirPath) {
  return fs.mkdir(dirPath, { recursive: true });
}

function runPowershellJson(command, input) {
  return new Promise((resolve, reject) => {
    const utf8Command = `
[Console]::InputEncoding = [System.Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$OutputEncoding = [System.Text.UTF8Encoding]::new($false)
${command}`;
    const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-STA', '-Command', utf8Command], {
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk.toString('utf8'); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString('utf8'); });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve(stdout.trim());
      else reject(new Error(stderr.trim() || `PowerShell 退出码 ${code}`));
    });
    if (input !== undefined) child.stdin.write(JSON.stringify(input));
    child.stdin.end();
  });
}

function sendImportProgress(progress) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send('import:progress', {
    id: progress.id || 'import',
    source: progress.source || '素材导入',
    total: progress.total || 0,
    completed: progress.completed || 0,
    success: progress.success || 0,
    failed: progress.failed || 0,
    remaining: Math.max(0, (progress.total || 0) - (progress.completed || 0)),
    currentName: progress.currentName || '',
    state: progress.state || 'running',
    updatedAt: new Date().toISOString(),
  });
}

function getLibraryDirs(rootPath) {
  return {
    root: rootPath,
    originals: path.join(rootPath, 'originals'),
    thumbnails: path.join(rootPath, 'thumbnails'),
    ads: path.join(rootPath, 'ads'),
    database: path.join(rootPath, 'database'),
    exports: path.join(rootPath, 'exports'),
    backups: path.join(rootPath, 'backups'),
  };
}

async function ensureLibrary(rootPath) {
  const dirs = getLibraryDirs(rootPath);
  await Promise.all(Object.values(dirs).map((dir) => ensureDir(dir)));
  const dbPath = path.join(dirs.database, 'library.json');
  try {
    await fs.access(dbPath);
  } catch {
    await fs.writeFile(dbPath, JSON.stringify(createEmptyDatabase(), null, 2), 'utf8');
  }
  return dirs;
}

function createEmptyDatabase() {
  const now = new Date().toISOString();
  return {
    version: 1,
    folders: [
      {
        id: 'default',
        name: '默认收藏',
        isDefault: true,
        createdAt: now,
        updatedAt: now,
      },
    ],
    assets: [],
    settings: {
      theme: 'dark',
      thumbnailSize: 180,
      defaultFolderId: 'default',
      ads: [],
      remoteAds: {
        configUrl: defaultRemoteAdsUrl,
        cachedAds: [],
        lastFetchedAt: '',
      },
      update: {
        configUrl: defaultUpdateConfigUrl,
        lastCheckedAt: '',
        lastVersion: '',
      },
    },
  };
}

async function readDatabase(rootPath) {
  await ensureLibrary(rootPath);
  const dbPath = path.join(rootPath, 'database', 'library.json');
  const raw = await fs.readFile(dbPath, 'utf8');
  const database = JSON.parse(raw);
  return normalizeStoredAssetKinds(database);
}

async function writeDatabase(rootPath, database, options = {}) {
  const dirs = await ensureLibrary(rootPath);
  const dbPath = path.join(dirs.database, 'library.json');
  if (options.backup) {
    const backupPath = path.join(dirs.backups, `library-${Date.now()}.json`);
    try {
      await fs.copyFile(dbPath, backupPath);
    } catch {}
  }
  await fs.writeFile(dbPath, JSON.stringify(database, null, 2), 'utf8');
  return database;
}

async function removeAssetFiles(asset) {
  if (asset?.path) await fs.rm(asset.path, { force: true }).catch(() => {});
  if (asset?.thumbnail) await fs.rm(asset.thumbnail, { force: true }).catch(() => {});
}

async function cleanupExpiredTrash(rootPath, database) {
  const now = Date.now();
  const expired = [];
  const kept = [];
  for (const asset of database.assets || []) {
    const deletedAt = asset?.deletedAt ? Date.parse(asset.deletedAt) : 0;
    if (deletedAt && now - deletedAt >= trashRetentionMs) expired.push(asset);
    else kept.push(asset);
  }
  if (!expired.length) return { database, removedCount: 0 };
  for (const asset of expired) await removeAssetFiles(asset);
  database.assets = kept;
  await writeDatabase(rootPath, database, { backup: true });
  return { database, removedCount: expired.length };
}

async function hashFile(filePath) {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

function compareVersions(left, right) {
  const a = String(left || '0').split(/[.-]/).map((part) => Number.parseInt(part, 10) || 0);
  const b = String(right || '0').split(/[.-]/).map((part) => Number.parseInt(part, 10) || 0);
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    const delta = (a[index] || 0) - (b[index] || 0);
    if (delta > 0) return 1;
    if (delta < 0) return -1;
  }
  return 0;
}

function safeUpdateFileName(fileName, fallback = 'AI素材库-更新包.exe') {
  const name = String(fileName || fallback).replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').trim();
  return name.toLowerCase().endsWith('.exe') ? name : `${name || fallback}.exe`;
}

function normalizeUpdateConfig(payload = {}, options = {}) {
  const allowIncomplete = options.allowIncomplete === true;
  const version = String(payload.version || '').trim();
  const installerUrl = String(payload.installerUrl || payload.url || '').trim();
  if (!version) throw new Error('更新配置缺少版本号 version。');
  let parsedUrl = null;
  if (installerUrl) {
    parsedUrl = new URL(installerUrl);
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) throw new Error('安装包地址只支持 http 或 https。');
  } else if (!allowIncomplete) {
    throw new Error('更新配置缺少安装包地址 installerUrl。');
  }
  return {
    version,
    title: String(payload.title || '发现新版本').trim(),
    notes: Array.isArray(payload.notes)
      ? payload.notes.map((item) => String(item || '').trim()).filter(Boolean).slice(0, 20)
      : [],
    installerUrl: parsedUrl ? parsedUrl.toString() : '',
    fileName: safeUpdateFileName(payload.fileName || path.basename(parsedUrl.pathname) || `AI素材库-${version}.exe`),
    sha256: String(payload.sha256 || '').trim().toLowerCase(),
    force: payload.force === true,
    size: Number(payload.size) || 0,
  };
}

async function fetchJsonWithTimeout(url, timeoutMs = updateRequestTimeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${url}${String(url).includes('?') ? '&' : '?'}t=${Date.now()}`, {
      cache: 'no-store',
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) throw new Error(`读取更新配置失败：HTTP ${response.status}`);
    return response.json();
  } finally {
    clearTimeout(timeout);
  }
}

function sendUpdateProgress(progress) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send('updates:progress', {
    state: progress.state || 'downloading',
    version: progress.version || '',
    percent: Number.isFinite(progress.percent) ? progress.percent : 0,
    transferred: progress.transferred || 0,
    total: progress.total || 0,
    message: progress.message || '',
    updatedAt: new Date().toISOString(),
  });
}

function downloadFileWithProgress(fileUrl, targetPath, { version = '', expectedBytes = 0 } = {}) {
  return new Promise((resolve, reject) => {
    const requestUrl = new URL(fileUrl);
    const client = requestUrl.protocol === 'https:' ? https : http;
    const request = client.get(requestUrl, { timeout: updateDownloadTimeoutMs }, (response) => {
      if ([301, 302, 303, 307, 308].includes(response.statusCode) && response.headers.location) {
        response.resume();
        const redirected = new URL(response.headers.location, requestUrl).toString();
        downloadFileWithProgress(redirected, targetPath, { version, expectedBytes }).then(resolve, reject);
        return;
      }
      if (response.statusCode < 200 || response.statusCode >= 300) {
        response.resume();
        reject(new Error(`安装包下载失败：HTTP ${response.statusCode}`));
        return;
      }
      const total = Number(response.headers['content-length']) || expectedBytes || 0;
      let transferred = 0;
      const file = createWriteStream(targetPath);
      response.on('data', (chunk) => {
        transferred += chunk.length;
        const percent = total ? Math.min(99, Math.round((transferred / total) * 100)) : 0;
        sendUpdateProgress({ state: 'downloading', version, percent, transferred, total });
      });
      response.pipe(file);
      file.on('finish', () => {
        file.close(() => {
          sendUpdateProgress({ state: 'downloaded', version, percent: 100, transferred, total });
          resolve({ path: targetPath, transferred, total });
        });
      });
      file.on('error', reject);
      response.on('error', reject);
    });
    request.on('timeout', () => {
      request.destroy(new Error('安装包下载超时，请稍后重试。'));
    });
    request.on('error', reject);
  });
}

async function checkForUpdate(configUrl) {
  const url = String(configUrl || '').trim();
  if (!url) throw new Error('请先填写 update.json 地址。');
  const parsedUrl = new URL(url);
  if (!['http:', 'https:'].includes(parsedUrl.protocol)) throw new Error('update.json 地址只支持 http 或 https。');
  const payload = await fetchJsonWithTimeout(parsedUrl.toString());
  const signatureCheck = verifySignedConfig(payload);
  if (!signatureCheck.ok) {
    throw new Error(`更新配置签名无效：${signatureCheck.reason || '请确认 update.json 是由管理版生成的。'}`);
  }
  const update = normalizeUpdateConfig(payload, { allowIncomplete: true });
  const currentVersion = app.getVersion();
  const available = compareVersions(update.version, currentVersion) > 0;
  return {
    currentVersion,
    update,
    available,
    status: available ? 'available' : 'latest',
  };
}

async function downloadUpdate(update) {
  const normalized = normalizeUpdateConfig(update);
  if (activeDownload) throw new Error('已有更新正在下载。');
  const updatesDir = path.join(app.getPath('userData'), 'updates', normalized.version);
  await ensureDir(updatesDir);
  const installerPath = path.join(updatesDir, normalized.fileName);
  activeDownload = { version: normalized.version, installerPath };
  try {
    await fs.rm(installerPath, { force: true }).catch(() => {});
    sendUpdateProgress({ state: 'downloading', version: normalized.version, percent: 0, message: '开始下载更新' });
    await downloadFileWithProgress(normalized.installerUrl, installerPath, {
      version: normalized.version,
      expectedBytes: normalized.size,
    });
    if (normalized.sha256) {
      const actualHash = await hashFile(installerPath);
      if (actualHash.toLowerCase() !== normalized.sha256) {
        await fs.rm(installerPath, { force: true }).catch(() => {});
        throw new Error('安装包校验失败，已停止安装。');
      }
    }
    activeDownload = null;
    return {
      update: normalized,
      installerPath,
      downloadedAt: new Date().toISOString(),
    };
  } catch (error) {
    activeDownload = null;
    sendUpdateProgress({ state: 'failed', version: normalized.version, percent: 0, message: error?.message || '更新下载失败' });
    throw error;
  }
}

async function backupLibraryBeforeUpdate(rootPath, version) {
  if (!rootPath) return null;
  const dirs = await ensureLibrary(rootPath);
  const dbPath = path.join(dirs.database, 'library.json');
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(dirs.backups, `before-update-${safeUpdateFileName(version, 'update').replace(/\.exe$/i, '')}-${stamp}-library.json`);
  await fs.copyFile(dbPath, backupPath);
  return backupPath;
}

async function installDownloadedUpdate({ rootPath, installerPath, version } = {}) {
  const filePath = String(installerPath || '').trim();
  if (!filePath) throw new Error('没有找到已下载的安装包。');
  await fs.access(filePath);
  const backupPath = await backupLibraryBeforeUpdate(rootPath || activeRootPath, version || 'new-version').catch((error) => {
    throw new Error(`安装前备份失败：${error?.message || '请检查素材库是否可写入。'}`);
  });
  const child = spawn(filePath, [], {
    detached: true,
    stdio: 'ignore',
    windowsHide: false,
  });
  child.unref();
  setTimeout(() => app.quit(), 500);
  return { ok: true, backupPath };
}

function bufferFromDataUrl(dataUrl) {
  const match = /^data:([^;]+);base64,(.+)$/.exec(dataUrl || '');
  if (!match) throw new Error('Invalid data URL');
  return {
    mime: match[1],
    buffer: Buffer.from(match[2], 'base64'),
  };
}

function extensionFromMime(mime) {
  const cleanType = String(mime || '').split(';')[0].trim().toLowerCase();
  if (cleanType === 'image/jpeg') return '.jpg';
  if (cleanType === 'image/png') return '.png';
  if (cleanType === 'image/webp') return '.webp';
  if (cleanType === 'image/gif') return '.gif';
  if (cleanType === 'image/bmp') return '.bmp';
  if (cleanType === 'image/tiff') return '.tiff';
  if (cleanType === 'image/avif') return '.avif';
  if (cleanType === 'image/svg+xml') return '.svg';
  if (cleanType === 'image/x-icon' || cleanType === 'image/vnd.microsoft.icon') return '.ico';
  if (cleanType === 'image/heic') return '.heic';
  if (cleanType === 'image/heif') return '.heif';
  if (cleanType === 'image/jxl') return '.jxl';
  if (cleanType === 'application/pdf') return '.pdf';
  if (cleanType === 'image/vnd.adobe.photoshop') return '.psd';
  if (cleanType === 'application/postscript') return '.eps';
  if (cleanType === 'video/mp4') return '.mp4';
  if (cleanType === 'video/webm') return '.webm';
  if (cleanType === 'video/quicktime') return '.mov';
  if (cleanType === 'video/x-matroska') return '.mkv';
  if (cleanType === 'video/x-msvideo') return '.avi';
  if (cleanType === 'video/ogg') return '.ogv';
  if (cleanType === 'video/mp2t') return '.ts';
  if (cleanType === 'application/vnd.apple.mpegurl' || cleanType === 'application/x-mpegurl') return '.m3u8';
  if (cleanType.startsWith('video/')) return '.mp4';
  return '';
}

function extensionFromUrlOrType(url, contentType = '') {
  const cleanType = contentType.split(';')[0].trim().toLowerCase();
  if (cleanType === 'video/x-matroska') return '.mkv';
  if (cleanType === 'video/x-msvideo') return '.avi';
  if (cleanType === 'video/ogg') return '.ogv';
  if (cleanType === 'video/mp2t') return '.ts';
  if (cleanType === 'application/vnd.apple.mpegurl' || cleanType === 'application/x-mpegurl') return '.m3u8';
  const mimeExtension = extensionFromMime(cleanType);
  if (cleanType && (cleanType.startsWith('image/') || cleanType.startsWith('video/') || cleanType === 'application/pdf' || cleanType === 'application/postscript')) {
    return mimeExtension;
  }
  try {
    const extension = path.extname(new URL(url).pathname).toLowerCase();
    if (extension) return extension;
  } catch {}
  if (cleanType.startsWith('video/')) return '.mp4';
  if (cleanType.startsWith('image/')) return '.jpg';
  return '.bin';
}

function extensionFromBuffer(buffer, contentType = '') {
  if (!Buffer.isBuffer(buffer) || buffer.length < 4) return '';
  const head = buffer.subarray(0, Math.min(buffer.length, 64));
  const ascii = head.toString('latin1');
  const utf8Head = buffer.subarray(0, Math.min(buffer.length, 512)).toString('utf8').trimStart().toLowerCase();
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return '.jpg';
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return '.png';
  if (ascii.startsWith('GIF87a') || ascii.startsWith('GIF89a')) return '.gif';
  if (ascii.startsWith('RIFF') && ascii.slice(8, 12) === 'WEBP') return '.webp';
  if (ascii.startsWith('RIFF') && ascii.slice(8, 12) === 'AVI ') return '.avi';
  if (ascii.startsWith('BM')) return '.bmp';
  if (ascii.startsWith('II*\u0000') || ascii.startsWith('MM\u0000*')) return '.tiff';
  if (buffer.subarray(0, 4).equals(Buffer.from([0x00, 0x00, 0x01, 0x00]))) return '.ico';
  if (ascii.startsWith('%PDF')) return '.pdf';
  if (ascii.startsWith('8BPS')) return '.psd';
  if (ascii.startsWith('%!PS')) return '.eps';
  if (buffer[0] === 0x1a && buffer[1] === 0x45 && buffer[2] === 0xdf && buffer[3] === 0xa3) return '.webm';
  if (buffer[0] === 0x47 && buffer.length > 188 && buffer[188] === 0x47) return '.ts';
  if (ascii.slice(4, 8) === 'ftyp') {
    const brand = ascii.slice(8, 20);
    if (/avif|avis/.test(brand)) return '.avif';
    if (/heic|heix|hevc|hevx|mif1|msf1/.test(brand)) return '.heic';
    if (/qt  /.test(brand)) return '.mov';
    return '.mp4';
  }
  if (utf8Head.startsWith('#extm3u')) return '.m3u8';
  if (utf8Head.startsWith('<svg') || utf8Head.startsWith('<?xml') && utf8Head.includes('<svg')) return '.svg';
  if (contentType.split(';')[0].trim().toLowerCase() === 'image/svg+xml' && utf8Head.includes('<svg')) return '.svg';
  return '';
}

function supportedExtensionFromDownload(downloaded) {
  const sniffed = extensionFromBuffer(downloaded.buffer, downloaded.contentType);
  if (sniffed && supportedRemoteExtensions.has(sniffed)) return sniffed;
  const byMime = extensionFromMime(downloaded.contentType);
  if (byMime && supportedRemoteExtensions.has(byMime)) return byMime;
  const byUrl = extensionFromUrlOrType(downloaded.finalUrl, downloaded.contentType);
  if (supportedRemoteExtensions.has(byUrl)) {
    const cleanType = String(downloaded.contentType || '').split(';')[0].trim().toLowerCase();
    if (cleanType === 'text/html' || cleanType === 'application/json') return '';
    return byUrl;
  }
  return '';
}

function sanitizeFilePart(value, fallback = 'asset') {
  const cleaned = String(value || '')
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
  return cleaned || fallback;
}

function safeRelativePath(value, fallback = 'file') {
  const parts = String(value || '')
    .replace(/\\/g, '/')
    .split('/')
    .map((part) => sanitizeFilePart(part, fallback))
    .filter(Boolean)
    .filter((part) => part !== '.' && part !== '..');
  return parts.join(path.sep) || sanitizeFilePart(fallback, 'file');
}

function isPathInside(parent, child) {
  const relative = path.relative(path.resolve(parent), path.resolve(child));
  return !!relative && !relative.startsWith('..') && !path.isAbsolute(relative);
}

async function copyFileUnique(sourcePath, targetDir, preferredName) {
  await ensureDir(targetDir);
  const extension = path.extname(preferredName || sourcePath) || path.extname(sourcePath);
  const base = sanitizeFilePart(path.basename(preferredName || sourcePath, extension), 'asset');
  let targetPath = path.join(targetDir, `${base}${extension}`);
  let index = 2;
  while (true) {
    try {
      await fs.access(targetPath);
      targetPath = path.join(targetDir, `${base}_${index}${extension}`);
      index += 1;
    } catch {
      break;
    }
  }
  await fs.copyFile(sourcePath, targetPath);
  return targetPath;
}

function getFolderPathParts(database, folderId = 'default') {
  const folders = Array.isArray(database?.folders) ? database.folders : [];
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  let current = byId.get(folderId) || byId.get('default') || folders[0] || { id: 'default', name: '默认收藏' };
  const parts = [];
  const seen = new Set();
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    parts.unshift(sanitizeFilePart(current.name || '未命名文件夹', '未命名文件夹'));
    current = current.parentId ? byId.get(current.parentId) : null;
  }
  return parts.length ? parts : ['默认收藏'];
}

function getFolderAssetDir(rootPath, database, folderId = 'default', bucket = 'originals') {
  const dirs = getLibraryDirs(rootPath);
  const base = bucket === 'thumbnails' ? dirs.thumbnails : dirs.originals;
  return path.join(base, ...getFolderPathParts(database, folderId));
}

async function moveFileUnique(sourcePath, targetDir, preferredName) {
  await ensureDir(targetDir);
  const extension = path.extname(preferredName || sourcePath) || path.extname(sourcePath);
  const base = sanitizeFilePart(path.basename(preferredName || sourcePath, extension), 'asset');
  let targetPath = path.join(targetDir, `${base}${extension}`);
  if (path.resolve(sourcePath) === path.resolve(targetPath)) return sourcePath;
  let index = 2;
  while (true) {
    try {
      await fs.access(targetPath);
      targetPath = path.join(targetDir, `${base}_${index}${extension}`);
      index += 1;
    } catch {
      break;
    }
  }
  try {
    await fs.rename(sourcePath, targetPath);
  } catch {
    await fs.copyFile(sourcePath, targetPath);
    await fs.rm(sourcePath, { force: true }).catch(() => {});
  }
  return targetPath;
}

async function relocateAssetFilesToFolder(rootPath, database, asset) {
  if (!asset || asset.deletedAt) return false;
  let changed = false;
  if (asset.path) {
    const targetDir = getFolderAssetDir(rootPath, database, asset.folderId || 'default', 'originals');
    const targetPath = await moveFileUnique(asset.path, targetDir, asset.name || asset.originalName || path.basename(asset.path));
    if (targetPath !== asset.path) {
      asset.path = targetPath;
      asset.name = path.basename(targetPath);
      changed = true;
    }
  }
  if (asset.thumbnail) {
    const targetDir = getFolderAssetDir(rootPath, database, asset.folderId || 'default', 'thumbnails');
    const targetPath = await moveFileUnique(asset.thumbnail, targetDir, path.basename(asset.thumbnail));
    if (targetPath !== asset.thumbnail) {
      asset.thumbnail = targetPath;
      changed = true;
    }
  }
  if (changed) asset.updatedAt = new Date().toISOString();
  return changed;
}

async function removeEmptyDirectories(dirPath, keepRoot = true) {
  let entries = [];
  try {
    entries = await fs.readdir(dirPath, { withFileTypes: true });
  } catch {
    return false;
  }
  let empty = true;
  for (const entry of entries) {
    const entryPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      const childEmpty = await removeEmptyDirectories(entryPath, false);
      if (!childEmpty) empty = false;
    } else {
      empty = false;
    }
  }
  if (empty && !keepRoot) {
    await fs.rmdir(dirPath).catch(() => {});
    return true;
  }
  return empty;
}

async function ensureFolderDirectories(rootPath, database) {
  for (const folder of database.folders || []) {
    await ensureDir(getFolderAssetDir(rootPath, database, folder.id, 'originals'));
    await ensureDir(getFolderAssetDir(rootPath, database, folder.id, 'thumbnails'));
  }
}

async function archiveLegacyDateDirs(rootPath, database, bucket = 'originals') {
  const dirs = getLibraryDirs(rootPath);
  const base = bucket === 'thumbnails' ? dirs.thumbnails : dirs.originals;
  const expectedTopFolders = new Set((database.folders || []).map((folder) => getFolderPathParts(database, folder.id)[0]));
  let entries = [];
  try {
    entries = await fs.readdir(base, { withFileTypes: true });
  } catch {
    return 0;
  }
  let archived = 0;
  for (const entry of entries) {
    if (!entry.isDirectory() || !/^\d{4}$/.test(entry.name) || expectedTopFolders.has(entry.name)) continue;
    const sourcePath = path.join(base, entry.name);
    const backupRoot = path.join(dirs.backups, `legacy-${bucket}-${new Date().toISOString().replace(/[:.]/g, '-')}`);
    await ensureDir(backupRoot);
    let targetPath = path.join(backupRoot, entry.name);
    let index = 2;
    while (true) {
      try {
        await fs.access(targetPath);
        targetPath = path.join(backupRoot, `${entry.name}_${index}`);
        index += 1;
      } catch {
        break;
      }
    }
    await fs.rename(sourcePath, targetPath).catch(async () => {
      await fs.cp(sourcePath, targetPath, { recursive: true });
      await fs.rm(sourcePath, { recursive: true, force: true });
    });
    archived += 1;
  }
  return archived;
}

function folderStructureSignature(database) {
  return (database?.folders || [])
    .map((folder) => `${folder.id}:${folder.parentId || ''}:${folder.name || ''}`)
    .sort()
    .join('|');
}

async function syncLibraryFilesToFolders(rootPath, database) {
  const dirs = getLibraryDirs(rootPath);
  let movedCount = 0;
  for (const asset of database.assets || []) {
    try {
      if (await relocateAssetFilesToFolder(rootPath, database, asset)) movedCount += 1;
    } catch (error) {
      asset.folderSyncStatus = 'failed';
      asset.folderSyncError = error?.message || '本地文件夹同步失败';
    }
  }
  if (movedCount) await writeDatabase(rootPath, database, { backup: true });
  await archiveLegacyDateDirs(rootPath, database, 'originals');
  await archiveLegacyDateDirs(rootPath, database, 'thumbnails');
  await removeEmptyDirectories(dirs.originals, true);
  await removeEmptyDirectories(dirs.thumbnails, true);
  await ensureFolderDirectories(rootPath, database);
  return { database, movedCount };
}

async function zipDirectory(sourceDir, zipPath) {
  await fs.rm(zipPath, { force: true }).catch(() => {});
  const command = `
$source = ConvertFrom-Json ([Console]::In.ReadToEnd())
Add-Type -AssemblyName System.IO.Compression.FileSystem
if (Test-Path -LiteralPath $source.zip) { Remove-Item -LiteralPath $source.zip -Force }
[System.IO.Compression.ZipFile]::CreateFromDirectory($source.dir, $source.zip, [System.IO.Compression.CompressionLevel]::Optimal, $false, [System.Text.Encoding]::UTF8)
`;
  await runPowershellJson(command, { dir: sourceDir, zip: zipPath });
}

async function unzipToDirectory(zipPath, targetDir) {
  await fs.rm(targetDir, { recursive: true, force: true }).catch(() => {});
  await ensureDir(targetDir);
  const command = `
$source = ConvertFrom-Json ([Console]::In.ReadToEnd())
Add-Type -AssemblyName System.IO.Compression.FileSystem
[System.IO.Compression.ZipFile]::ExtractToDirectory($source.zip, $source.dir, [System.Text.Encoding]::UTF8)
`;
  await runPowershellJson(command, { zip: zipPath, dir: targetDir });
}

function hashBuffer(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

function isAnimatedWebpBuffer(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 32) return false;
  if (!buffer.subarray(0, 4).equals(Buffer.from('RIFF')) || !buffer.subarray(8, 12).equals(Buffer.from('WEBP'))) return false;
  return buffer.includes(Buffer.from('ANIM')) || buffer.includes(Buffer.from('ANMF'));
}

function getAssetKind(extension, buffer = null) {
  const normalized = extension.toLowerCase();
  if (videoExtensions.has(normalized)) return 'video';
  if (animationExtensions.has(normalized)) return 'animation';
  if (normalized === '.webp' && isAnimatedWebpBuffer(buffer)) return 'animation';
  if (imageExtensions.has(normalized)) return 'image';
  return 'file';
}

function buildAssetTags(asset) {
  const tags = new Set();
  tags.add(asset.extension.replace('.', '').toLowerCase());
  if (asset.kind === 'video') tags.add('视频素材');
  if (asset.kind === 'animation') tags.add('动图');
  if (asset.kind === 'image') tags.add('图片');
  return Array.from(tags);
}

function normalizeAiBaseUrl(baseUrl = '') {
  const trimmed = String(baseUrl || '').trim().replace(/\/+$/, '');
  if (!trimmed) throw new Error('请填写 API 地址');
  if (/\/chat\/completions$/i.test(trimmed)) return trimmed;
  if (/\/v1$/i.test(trimmed)) return `${trimmed}/chat/completions`;
  return `${trimmed}/v1/chat/completions`;
}

const RUNNINGHUB_LLM_BASE_URL = 'https://llm.runninghub.cn/v1';

function normalizeRunningHubBaseUrl(baseUrl = '') {
  const trimmed = String(baseUrl || '').trim().replace(/\/+$/, '') || RUNNINGHUB_LLM_BASE_URL;
  if (/\/chat\/completions$/i.test(trimmed)) return trimmed;
  if (/\/v1$/i.test(trimmed)) return `${trimmed}/chat/completions`;
  return `${trimmed}/v1/chat/completions`;
}

function modelListUrlFromChatUrl(chatUrl) {
  return chatUrl.replace(/\/chat\/completions$/i, '/models');
}

function sanitizeAiConfig(config = {}, options = {}) {
  const apiKey = String(config.apiKey || '').trim();
  const model = String(config.model || '').trim();
  const provider = config.provider || 'openai-compatible';
  if (!apiKey) throw new Error('请填写 API Key');
  if (!model && options.requireModel !== false) throw new Error('请填写模型名称');
  return {
    provider,
    baseUrl: provider === 'runninghub'
      ? normalizeRunningHubBaseUrl(config.baseUrl)
      : normalizeAiBaseUrl(config.baseUrl),
    apiKey,
    model,
  };
}

function normalizeModelListItem(item) {
  if (!item) return null;
  const id = String(item.id || item.name || '').trim();
  if (!id) return null;
  const capabilities = item.capabilities || {};
  const inputModalities = Array.isArray(capabilities.input_modalities)
    ? capabilities.input_modalities
    : Array.isArray(item.input_modalities)
      ? item.input_modalities
      : [];
  const vision = capabilities.vision === true || inputModalities.some((value) => /image|vision/i.test(String(value)));
  return {
    id,
    name: String(item.name || id),
    owner: String(item.owned_by || item.owner || ''),
    vision,
    free: capabilities.free === true,
  };
}

async function listAiModels(config) {
  const ai = sanitizeAiConfig(config, { requireModel: false });
  const response = await fetch(modelListUrlFromChatUrl(ai.baseUrl), {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${ai.apiKey}`,
    },
  });
  const text = await response.text();
  if (!response.ok) {
    let detail = text.slice(0, 240);
    try {
      const parsed = JSON.parse(text);
      detail = parsed.error?.message || parsed.message || detail;
    } catch {}
    throw new Error(`模型列表读取失败 ${response.status}：${friendlyAiError(response.status, detail || response.statusText, ai.provider)}`);
  }
  const data = JSON.parse(text);
  const source = Array.isArray(data.data) ? data.data : Array.isArray(data.models) ? data.models : [];
  const models = source.map(normalizeModelListItem).filter(Boolean);
  return {
    ok: true,
    endpoint: modelListUrlFromChatUrl(ai.baseUrl),
    models,
  };
}

function normalizeAiErrorDetail(detail = '') {
  return String(detail || '').trim().replace(/\s+/g, ' ').slice(0, 500);
}

function friendlyAiError(status, detail, provider) {
  const text = normalizeAiErrorDetail(detail);
  const lower = text.toLowerCase();
  const hasAny = (patterns) => patterns.some((pattern) => pattern.test(lower) || pattern.test(text));

  if (hasAny([
    /insufficient[_\s-]?quota/,
    /quota[_\s-]?exceeded/,
    /exceed(ed)?\s+quota/,
    /billing/,
    /payment/,
    /balance/,
    /credit/,
    /no\s+credits?/,
    /not\s+enough\s+(credit|balance|quota)/,
    /insufficient\s+(credit|balance|fund|quota)/,
    /余额不足/,
    /账户余额/,
    /额度不足/,
    /额度已用完/,
    /欠费/,
    /未充值/,
    /充值/,
    /账单/,
    /付费/,
  ])) {
    return 'API 账户余额不足、额度用完或账单异常，请到对应平台充值/开通额度后再试。';
  }

  if (hasAny([
    /rate[_\s-]?limit/,
    /too\s+many\s+requests/,
    /request\s+limit/,
    /限流/,
    /请求过于频繁/,
    /频率/,
  ])) {
    return '请求太频繁，接口被限流了，请稍等一会儿再试，或降低批量数量。';
  }

  if (hasAny([
    /vision/,
    /image/,
    /modalit/,
    /multi[-\s]?modal/,
    /unsupported\s+content/,
    /does\s+not\s+support/,
    /not\s+support/,
    /不支持.*(图片|图像|视觉|识图)/,
    /(图片|图像|视觉|识图).*不支持/,
  ])) {
    return '当前模型不支持识图，请换成支持图片/视觉输入的模型。';
  }

  if (hasAny([
    /model.*not.*found/,
    /unknown\s+model/,
    /invalid\s+model/,
    /模型不存在/,
    /模型.*不存在/,
    /找不到.*模型/,
  ])) {
    return '模型名称不存在或没有权限调用，请检查模型名称，或换一个可用模型。';
  }

  if (hasAny([
    /invalid\s+api\s*key/,
    /incorrect\s+api\s*key/,
    /unauthorized/,
    /authentication/,
    /api\s*key/,
    /apikey/,
    /鉴权/,
    /认证/,
    /授权/,
    /密钥/,
    /key.*错误/,
  ])) {
    return provider === 'runninghub'
      ? 'RunningHub 鉴权失败，请检查 API Key 是否复制完整，或确认该 Key 是否开通 LLM 调用权限。'
      : 'API Key 鉴权失败，请检查 Key 是否正确，或该模型是否有调用权限。';
  }

  if (hasAny([
    /timeout/,
    /timed?\s*out/,
    /network/,
    /econnreset/,
    /enotfound/,
    /socket/,
    /超时/,
    /网络/,
    /连接失败/,
  ])) {
    return 'AI 接口连接超时或网络不稳定，请检查 API 地址、代理/网络后再试。';
  }

  if (status === 400) return 'AI 请求格式不被当前接口接受，可能是模型不支持图片输入，或 API 地址不是聊天接口。';
  if (status === 401 || status === 403) {
    return provider === 'runninghub'
      ? 'RunningHub 鉴权失败或权限不足，请检查 API Key、账户权限和 LLM 服务是否开通。'
      : 'API Key 鉴权失败或权限不足，请检查 Key、模型权限和账户状态。';
  }
  if (status === 404) return '接口地址或模型不存在，请检查 API 地址和模型名称。';
  if (status === 408 || status === 504) return 'AI 接口响应超时，请稍后重试，或换一个更稳定的接口。';
  if (status === 413) return '图片太大，接口拒绝接收，请换一张更小的图片或先压缩后再试。';
  if (status === 429) return '请求过于频繁、额度不足或账户被限流，请稍后再试，并检查账户余额/额度。';
  if (status >= 500) return 'AI 平台服务暂时异常，请稍后重试；如果一直失败，可以切换其他 API 配置。';
  return text || 'AI 请求失败，请检查 API 配置、模型和网络。';
}

function extractJsonObject(text = '') {
  const trimmed = String(text || '').trim();
  if (!trimmed) throw new Error('AI 没有返回内容');
  try {
    return JSON.parse(trimmed);
  } catch {}
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    try {
      return JSON.parse(fenced[1].trim());
    } catch {}
  }
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(trimmed.slice(start, end + 1));
    } catch {}
  }
  throw new Error('AI 返回内容不是可识别的 JSON');
}

async function callOpenAiCompatible(config, messages, options = {}) {
  const ai = sanitizeAiConfig(config);
  const controller = new AbortController();
  if (options.signal?.aborted) controller.abort();
  const abortFromParent = () => controller.abort();
  options.signal?.addEventListener?.('abort', abortFromParent, { once: true });
  const timeout = setTimeout(() => controller.abort(), options.timeout || 45000);
  try {
    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${ai.apiKey}`,
    };
    if (/openrouter\.ai/i.test(ai.baseUrl)) {
      headers['HTTP-Referer'] = 'http://127.0.0.1';
      headers['X-Title'] = 'AI Asset Vault';
    }
    const response = await fetch(ai.baseUrl, {
      method: 'POST',
      headers,
      signal: controller.signal,
      body: JSON.stringify({
        model: ai.model,
        messages,
        temperature: options.temperature ?? 0.2,
        max_tokens: options.maxTokens || 900,
      }),
    });
    const text = await response.text();
    if (!response.ok) {
      let detail = text.slice(0, 240);
      try {
        const parsed = JSON.parse(text);
        detail = parsed.error?.message || parsed.message || detail;
      } catch {}
      throw new Error(`AI 请求失败 ${response.status}：${friendlyAiError(response.status, detail || response.statusText, ai.provider)}`);
    }
    const data = JSON.parse(text);
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error('AI 返回为空，请确认模型是否可用');
    return content;
  } catch (error) {
    if (error?.name === 'AbortError') {
      if (options.signal?.aborted) throw new Error('已取消反推');
      throw new Error('AI 请求超时，请检查 API 地址或网络');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener?.('abort', abortFromParent);
  }
}

async function fetchRunningHubModelInfo(config) {
  const ai = sanitizeAiConfig({ ...config, provider: 'runninghub' });
  const response = await fetch(modelListUrlFromChatUrl(ai.baseUrl), {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${ai.apiKey}`,
    },
  });
  const text = await response.text();
  if (!response.ok) {
    let detail = text.slice(0, 240);
    try {
      const parsed = JSON.parse(text);
      detail = parsed.error?.message || parsed.message || detail;
    } catch {}
    throw new Error(`RunningHub 模型列表读取失败 ${response.status}：${friendlyAiError(response.status, detail || response.statusText, 'runninghub')}`);
  }
  const data = JSON.parse(text);
  return Array.isArray(data.data)
    ? data.data.find((item) => item?.id === ai.model)
    : null;
}

function normalizeAiTags(value) {
  return [...new Set((Array.isArray(value) ? value : String(value || '').split(/[,\s，、]+/))
    .map((tag) => String(tag || '').trim())
    .filter(Boolean))]
    .slice(0, 18);
}

function mimeFromImageExtension(extension = '') {
  const clean = String(extension || '').replace(/^\./, '').toLowerCase();
  if (clean === 'jpg' || clean === 'jpeg') return 'image/jpeg';
  if (clean === 'png') return 'image/png';
  if (clean === 'webp') return 'image/webp';
  if (clean === 'gif') return 'image/gif';
  return 'image/png';
}

async function prepareImageForAi(asset, purpose = 'AI 分析') {
  if (!asset?.path) throw new Error('没有找到素材文件');
  const originalBuffer = await fs.readFile(asset.path);
  const extension = path.extname(asset.path).replace('.', '').toLowerCase();
  const originalMime = mimeFromImageExtension(extension);
  if (originalBuffer.length <= aiImageMaxBytes) {
    return {
      dataUrl: `data:${originalMime};base64,${originalBuffer.toString('base64')}`,
      compressed: false,
      bytes: originalBuffer.length,
      mime: originalMime,
    };
  }

  const source = nativeImage.createFromBuffer(originalBuffer);
  if (source.isEmpty()) {
    throw new Error(`图片超过 5MB，且当前格式无法自动压缩，请先手动压缩后再进行${purpose}。`);
  }

  const size = source.getSize();
  const longestSide = Math.max(size.width || 0, size.height || 0);
  if (!longestSide) {
    throw new Error(`图片超过 5MB，且无法读取尺寸，请先手动压缩后再进行${purpose}。`);
  }

  const qualities = [90, 84, 78, 72, 66];
  const sideLimits = [2600, 2200, 1800, 1500, 1200, 960, 760];
  let bestBuffer = null;
  for (const sideLimit of sideLimits) {
    const ratio = Math.min(1, sideLimit / longestSide);
    const width = Math.max(1, Math.round(size.width * ratio));
    const height = Math.max(1, Math.round(size.height * ratio));
    const resized = source.resize({ width, height, quality: 'best' });
    for (const quality of qualities) {
      const buffer = resized.toJPEG(quality);
      bestBuffer = buffer;
      if (buffer.length <= aiImageMaxBytes) {
        return {
          dataUrl: `data:image/jpeg;base64,${buffer.toString('base64')}`,
          compressed: true,
          bytes: buffer.length,
          originalBytes: originalBuffer.length,
          mime: 'image/jpeg',
          width,
          height,
        };
      }
    }
  }

  throw new Error(`图片超过 5MB，自动压缩后仍然太大，请先手动压缩后再进行${purpose}。`);
}

async function analyzeImageWithAi(config, asset) {
  if (!asset?.path) throw new Error('没有找到素材文件');
  if (asset.kind === 'video') throw new Error('视频暂不做 AI 图片分析');
  const preparedImage = await prepareImageForAi(asset, 'AI 标签生成');
  const imageUrl = preparedImage.dataUrl;
  const content = await callOpenAiCompatible(
    config,
    [
      {
        role: 'system',
        content: '你是中文素材库的图片整理助手。只返回严格 JSON，不要 Markdown，不要解释。',
      },
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: [
              '请分析这张图片，用中文返回适合素材管理的标签。',
              'JSON 字段必须包含：contentTags、typeTags、styleTags、colorTags、summary。',
              'contentTags 是画面主体/元素，typeTags 是素材类型，styleTags 是风格，colorTags 是基础颜色。',
              '每个标签尽量 2 到 6 个中文字符，不要超过 18 个总标签。',
              '不要返回负面提示词，不要返回版权判断。',
            ].join('\n'),
          },
          { type: 'image_url', image_url: { url: imageUrl } },
        ],
      },
    ],
    { maxTokens: 900 }
  );
  const parsed = extractJsonObject(content);
  const tags = normalizeAiTags([
    ...normalizeAiTags(parsed.contentTags),
    ...normalizeAiTags(parsed.typeTags),
    ...normalizeAiTags(parsed.styleTags),
    ...normalizeAiTags(parsed.colorTags),
  ]);
  return {
    tags,
    contentTags: normalizeAiTags(parsed.contentTags),
    typeTags: normalizeAiTags(parsed.typeTags),
    styleTags: normalizeAiTags(parsed.styleTags),
    colorTags: normalizeAiTags(parsed.colorTags),
    summary: String(parsed.summary || '').trim(),
    model: String(config.model || '').trim(),
    generatedAt: new Date().toISOString(),
  };
}

async function reversePromptWithAi(config, asset, level = '中等', options = {}) {
  if (!asset?.path) throw new Error('没有找到素材文件');
  if (asset.kind === 'video') throw new Error('视频不做提示词反推');
  const preparedImage = await prepareImageForAi(asset, '提示词反推');
  const detailMap = {
    简洁: '简短，约 1 到 2 句话',
    中等: '中等详细，包含主体、场景、风格、构图、光线、色彩',
    详细: '详细，包含主体细节、环境、服装/材质、镜头、构图、光影、色彩、氛围',
    超详细: '非常详细，适合直接用于图像生成，层次清晰但不要堆无关词',
  };
  const content = await callOpenAiCompatible(
    config,
    [
      {
        role: 'system',
        content: '你是图片提示词反推助手。只返回严格 JSON，不要 Markdown，不要解释。',
      },
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: [
              `请根据图片反推出中英双语 prompt，详细程度：${detailMap[level] || detailMap['中等']}。`,
              'JSON 字段必须包含：zh、en、subject、style、color、composition、lighting。',
              'zh 是中文完整提示词，en 是英文完整 prompt。',
              '不要生成负面提示词，不要做版权判断。',
            ].join('\n'),
          },
          { type: 'image_url', image_url: { url: preparedImage.dataUrl } },
        ],
      },
    ],
    { timeout: 60000, maxTokens: 1400, signal: options.signal }
  );
  const parsed = extractJsonObject(content);
  if (!parsed.zh || !parsed.en) throw new Error('AI 返回缺少中英提示词');
  return {
    zh: String(parsed.zh || '').trim(),
    en: String(parsed.en || '').trim(),
    subject: String(parsed.subject || '').trim(),
    style: String(parsed.style || '').trim(),
    color: String(parsed.color || '').trim(),
    composition: String(parsed.composition || '').trim(),
    lighting: String(parsed.lighting || '').trim(),
    level,
    model: String(config.model || '').trim(),
    generatedAt: new Date().toISOString(),
  };
}

async function normalizeStoredAssetKinds(database) {
  if (!Array.isArray(database?.assets)) return database;
  let changed = false;
  for (const asset of database.assets) {
    if (asset.extension !== '.webp' || asset.animationDetected === true || asset.animationDetected === false) continue;
    try {
      const buffer = await fs.readFile(asset.path);
      const animated = isAnimatedWebpBuffer(buffer);
      asset.animationDetected = animated;
      asset.kind = animated ? 'animation' : 'image';
      asset.autoTags = buildAssetTags({ ...asset, kind: asset.kind });
      changed = true;
    } catch {}
  }
  if (changed) database.__normalizedKinds = true;
  return database;
}

async function importFiles(rootPath, filePaths, folderId = 'default', options = {}) {
  const dirs = await ensureLibrary(rootPath);
  const database = await readDatabase(rootPath);
  const imported = [];
  const duplicates = [];
  const importId = `local-${Date.now()}`;
  const total = Array.isArray(filePaths) ? filePaths.length : 0;
  let completed = 0;
  let duplicateStrategy = options.duplicateStrategy || 'keep';
  const targetDir = getFolderAssetDir(rootPath, database, folderId, 'originals');
  await ensureDir(targetDir);
  let failed = 0;
  if (total) {
    sendImportProgress({
      id: importId,
      source: 'local',
      total,
      completed: 0,
      success: 0,
      failed: 0,
      state: 'running',
    });
  }

  for (const filePath of filePaths) {
    try {
    const stat = await fs.stat(filePath);
    if (!stat.isFile()) {
      completed += 1;
      continue;
    }

    const extension = path.extname(filePath).toLowerCase();
    const hash = await hashFile(filePath);
    const existing = database.assets.find((asset) => asset.hash === hash);
    if (existing && duplicateStrategy === 'ask') duplicateStrategy = 'keep';
    if (existing && duplicateStrategy === 'skip') {
      duplicates.push({ skipped: true, existing, originalName: path.basename(filePath) });
      completed += 1;
      sendImportProgress({
        id: importId,
        source: 'local',
        total,
        completed,
        success: imported.length,
        failed,
        currentName: path.basename(filePath),
        state: completed >= total ? 'done' : 'running',
      });
      continue;
    }
    const basename = path.basename(filePath, extension);
    const id = randomUUID();
    const safeName = `${hash.slice(0, 12)}_${basename || 'asset'}${extension}`;
    let targetPath = path.join(targetDir, safeName);

    try {
      await fs.access(targetPath);
      targetPath = path.join(targetDir, `${hash.slice(0, 12)}_${id.slice(0, 8)}_${basename || 'asset'}${extension}`);
    } catch {}

    await fs.copyFile(filePath, targetPath);
    const kindProbe = extension === '.webp' ? await fs.readFile(targetPath).catch(() => null) : null;
    const asset = {
      id,
      name: path.basename(targetPath),
      originalName: path.basename(filePath),
      extension,
      kind: getAssetKind(extension, kindProbe),
      folderId,
      path: targetPath,
      hash,
      size: stat.size,
      width: null,
      height: null,
      duration: null,
      colors: [],
      autoTags: [],
      userTags: [],
      prompt: null,
      promptStatus: 'none',
      promptLevel: '中等',
      source: null,
      thumbnail: null,
      coverFrame: null,
      analysisStatus: 'pending',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    asset.autoTags = buildAssetTags(asset);
    database.assets.unshift(asset);
    imported.push(asset);
    if (existing) duplicates.push({ imported: asset, existing });
    completed += 1;
    sendImportProgress({
      id: importId,
      source: 'local',
      total,
      completed,
      success: imported.length,
      failed,
      currentName: path.basename(filePath),
      state: completed >= total ? 'done' : 'running',
    });
    } catch {
      failed += 1;
      completed += 1;
      sendImportProgress({
        id: importId,
        source: 'local',
        total,
        completed,
        success: imported.length,
        failed,
        currentName: path.basename(filePath),
        state: completed >= total ? 'done' : 'running',
      });
    }
  }

  await writeDatabase(rootPath, database, { backup: true });
  return { database, imported, duplicates };
}

async function fetchRemoteAsset(url, pageUrl) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
        'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,video/*,*/*;q=0.8',
        ...(pageUrl ? { Referer: pageUrl } : {}),
      },
    });
    if (!response.ok) throw new Error(`下载失败 ${response.status}`);
    const contentLength = Number(response.headers.get('content-length') || 0);
    const maxBytes = 150 * 1024 * 1024;
    if (contentLength > maxBytes) throw new Error('文件超过 150MB，已跳过');
    const arrayBuffer = await response.arrayBuffer();
    if (arrayBuffer.byteLength > maxBytes) throw new Error('文件超过 150MB，已跳过');
    return {
      buffer: Buffer.from(arrayBuffer),
      contentType: response.headers.get('content-type') || '',
      finalUrl: response.url || url,
    };
  } finally {
    clearTimeout(timeout);
  }
}

function parseM3u8Playlist(text, playlistUrl) {
  const lines = String(text || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const variants = [];
  const segments = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (line.startsWith('#EXT-X-KEY')) throw new Error('视频流已加密，暂不支持直接合并');
    if (line.startsWith('#EXT-X-STREAM-INF')) {
      const next = lines[index + 1];
      if (next && !next.startsWith('#')) variants.push(new URL(next, playlistUrl).href);
    } else if (!line.startsWith('#')) {
      segments.push(new URL(line, playlistUrl).href);
    }
  }
  return { variants, segments };
}

async function fetchHlsAsTransportStream(url, pageUrl, depth = 0) {
  if (depth > 2) throw new Error('视频流层级过深，暂不支持');
  const playlist = await fetchRemoteAsset(url, pageUrl);
  const text = playlist.buffer.toString('utf8');
  if (!text.trimStart().startsWith('#EXTM3U')) throw new Error('不是有效的视频流列表');
  const { variants, segments } = parseM3u8Playlist(text, playlist.finalUrl || url);
  if (variants.length) {
    return fetchHlsAsTransportStream(variants[variants.length - 1], pageUrl, depth + 1);
  }
  if (!segments.length) throw new Error('视频流没有可下载分片');
  if (segments.length > 360) throw new Error('视频分片过多，暂不支持直接合并');
  const chunks = [];
  let totalBytes = 0;
  const maxBytes = 150 * 1024 * 1024;
  for (let index = 0; index < segments.length; index += 1) {
    const segment = await fetchRemoteAsset(segments[index], pageUrl);
    totalBytes += segment.buffer.length;
    if (totalBytes > maxBytes) throw new Error('视频超过 150MB，已跳过');
    chunks.push(segment.buffer);
  }
  return {
    buffer: Buffer.concat(chunks),
    contentType: 'video/mp2t',
    finalUrl: url,
  };
}

function parseM3u8PlaylistWithAudio(text, playlistUrl) {
  const lines = String(text || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const variants = [];
  const segments = [];
  const audioRenditions = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (line.startsWith('#EXT-X-KEY')) throw new Error('视频流已加密，暂不支持直接合并');
    if (line.startsWith('#EXT-X-MEDIA') && /TYPE=AUDIO/i.test(line)) {
      const uri = line.match(/URI="([^"]+)"/i)?.[1];
      if (uri) audioRenditions.push(new URL(uri, playlistUrl).href);
    }
    if (line.startsWith('#EXT-X-STREAM-INF')) {
      const next = lines[index + 1];
      if (next && !next.startsWith('#')) variants.push(new URL(next, playlistUrl).href);
    } else if (!line.startsWith('#')) {
      segments.push(new URL(line, playlistUrl).href);
    }
  }
  return { variants, segments, audioRenditions };
}

async function fetchHlsSegmentsWithAudio(url, pageUrl, maxBytes = 150 * 1024 * 1024, depth = 0) {
  if (depth > 2) throw new Error('视频流层级过深，暂不支持');
  const playlist = await fetchRemoteAsset(url, pageUrl);
  const text = playlist.buffer.toString('utf8');
  if (!text.trimStart().startsWith('#EXTM3U')) throw new Error('不是有效的视频流列表');
  const parsed = parseM3u8PlaylistWithAudio(text, playlist.finalUrl || url);
  if (parsed.variants.length) {
    const selected = await fetchHlsSegmentsWithAudio(parsed.variants[parsed.variants.length - 1], pageUrl, maxBytes, depth + 1);
    return {
      ...selected,
      audioRenditions: selected.audioRenditions.length ? selected.audioRenditions : parsed.audioRenditions,
    };
  }
  if (!parsed.segments.length) throw new Error('视频流没有可下载分片');
  if (parsed.segments.length > 360) throw new Error('视频分片过多，暂不支持直接合并');
  const chunks = [];
  let totalBytes = 0;
  for (const segmentUrl of parsed.segments) {
    const segment = await fetchRemoteAsset(segmentUrl, pageUrl);
    totalBytes += segment.buffer.length;
    if (totalBytes > maxBytes) throw new Error('视频超过本次下载限制');
    chunks.push(segment.buffer);
  }
  return {
    buffer: Buffer.concat(chunks),
    finalUrl: url,
    audioRenditions: parsed.audioRenditions,
  };
}

function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    if (!ffmpegPath) {
      reject(new Error('未找到视频合成器'));
      return;
    }
    const child = spawn(ffmpegPath, args, { windowsHide: true });
    let stderr = '';
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(stderr.trim().split(/\r?\n/).slice(-2).join(' ') || `ffmpeg exited ${code}`));
    });
  });
}

async function muxVideoAndAudio(videoBuffer, audioBuffer) {
  const tempDir = await fs.mkdtemp(path.join(app.getPath('temp'), 'asset-vault-'));
  const videoPath = path.join(tempDir, 'video.ts');
  const audioPath = path.join(tempDir, 'audio.ts');
  const outputPath = path.join(tempDir, 'output.mp4');
  try {
    await fs.writeFile(videoPath, videoBuffer);
    await fs.writeFile(audioPath, audioBuffer);
    await runFfmpeg(['-y', '-i', videoPath, '-i', audioPath, '-c', 'copy', '-map', '0:v:0', '-map', '1:a:0', '-shortest', outputPath]);
    return await fs.readFile(outputPath);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}

async function fetchHlsWithOptionalAudio(url, pageUrl, audioUrls = []) {
  const video = await fetchHlsSegmentsWithAudio(url, pageUrl, 150 * 1024 * 1024);
  const audioCandidates = uniqueRemoteUrls([
    ...audioUrls,
    ...video.audioRenditions,
  ]).filter((candidate) => /\.m3u8(?:[?#]|$)/i.test(candidate) && candidate !== url);

  for (const audioUrl of audioCandidates) {
    try {
      const audio = await fetchHlsSegmentsWithAudio(audioUrl, pageUrl, 50 * 1024 * 1024);
      const muxed = await muxVideoAndAudio(video.buffer, audio.buffer);
      return {
        buffer: muxed,
        contentType: 'video/mp4',
        finalUrl: url,
      };
    } catch (error) {
      console.warn('音频合成失败，已回退为无声视频', error);
    }
  }

  return {
    buffer: video.buffer,
    contentType: 'video/mp2t',
    finalUrl: url,
  };
}

function uniqueRemoteUrls(urls) {
  return [...new Set((urls || [])
    .map((url) => String(url || '').trim())
    .filter((url) => /^https?:\/\//i.test(url)))];
}

function isVideoRemoteUrl(url) {
  try {
    const extension = path.extname(new URL(url).pathname).toLowerCase();
    return videoExtensions.has(extension);
  } catch {
    return false;
  }
}

async function downloadRemoteWithFallbacks(remote, pageUrl) {
  const primaryUrl = String(remote.url || '').trim();
  if (remote.hydrationFailed && remote.type === 'video') {
    throw new Error(remote.dataError || '页面临时视频读取失败，无法直接保存真实视频');
  }

  if (remote.dataUrl) {
    const data = bufferFromDataUrl(remote.dataUrl);
    const finalUrl = remote.dataSourceUrl || primaryUrl;
    const downloaded = {
      ...data,
      contentType: data.mime,
      finalUrl,
    };
    if (remote.audioDataUrl && data.mime.startsWith('video/')) {
      try {
        const audio = bufferFromDataUrl(remote.audioDataUrl);
        const muxed = await muxVideoAndAudio(data.buffer, audio.buffer);
        return {
          downloaded: {
            buffer: muxed,
            contentType: 'video/mp4',
            finalUrl,
          },
          extension: '.mp4',
          sourceUrl: finalUrl,
          transferMode: 'browser-hls-audio-merge',
        };
      } catch (error) {
        console.warn('浏览器音频合成失败，已保存原视频流', error);
      }
    }
    const extension = supportedExtensionFromDownload(downloaded);
    if (extension) return { downloaded, extension, sourceUrl: finalUrl, transferMode: 'browser-data' };
  }

  if (!/^https?:\/\//i.test(primaryUrl)) throw new Error('只支持 http/https 链接，页面临时素材需要浏览器直接读取后发送');

  let candidates = uniqueRemoteUrls([
    primaryUrl,
    ...(Array.isArray(remote.candidateUrls) ? remote.candidateUrls : []),
    remote.fallbackUrl,
    remote.previewUrl,
    remote.poster,
  ]);
  if (remote.type === 'video') {
    candidates = candidates.filter((candidate) => isVideoRemoteUrl(candidate) && !/_audio\.m3u8(?:[?#]|$)/i.test(candidate));
    if (!candidates.length) throw new Error('没有找到真实视频链接，只扫到了封面图');
  }
  const errors = [];
  for (const candidate of candidates) {
    try {
      const isHls = /\.m3u8(?:\?|$)/i.test(candidate);
      const downloaded = isHls
        ? await fetchHlsWithOptionalAudio(
            candidate,
            pageUrl || remote.pageUrl,
            Array.isArray(remote.candidateUrls) ? remote.candidateUrls.filter((url) => /_audio\.m3u8(?:[?#]|$)/i.test(url)) : []
          )
        : await fetchRemoteAsset(candidate, pageUrl || remote.pageUrl);
      const extension = isHls ? supportedExtensionFromDownload(downloaded) || '.ts' : supportedExtensionFromDownload(downloaded);
      if (remote.type === 'video' && !videoExtensions.has(extension)) {
        errors.push(`${candidate}：下载到的是图片或非视频文件`);
        continue;
      }
      if (!extension) {
        errors.push(`${candidate}：不是可识别素材文件`);
        continue;
      }
      return { downloaded, extension, sourceUrl: candidate, transferMode: isHls ? 'hls-merge' : 'url-download' };
    } catch (error) {
      errors.push(`${candidate}：${error?.message || '下载失败'}`);
    }
  }

  if (remote.dataUrl) throw new Error('浏览器读取到的内容不是支持的素材格式，链接下载也失败');
  throw new Error(errors.slice(0, 3).join('；') || '所有候选链接都下载失败');
}

async function importRemoteAssets(rootPath, payload = {}, folderId = 'default') {
  if (!rootPath) throw new Error('请先在桌面软件中选择素材库位置');
  const dirs = await ensureLibrary(rootPath);
  const database = await readDatabase(rootPath);
  const imported = [];
  const duplicates = [];
  const failed = [];
  const batch = payload.batch && typeof payload.batch === 'object' ? payload.batch : null;
  const importId = batch?.id || `web-${Date.now()}`;
  const targetDir = getFolderAssetDir(rootPath, database, folderId, 'originals');
  await ensureDir(targetDir);

  const assets = Array.isArray(payload.assets) ? payload.assets.slice(0, 80) : [];
  let completed = Number(batch?.index || 0);
  const previousSuccess = Number(batch?.previousSuccess || 0);
  const previousFailed = Number(batch?.previousFailed || 0);
  const displayTotal = Math.max(Number(batch?.total || 0), assets.length);
  if (assets.length) {
    sendImportProgress({
      id: importId,
      source: '网页收集',
      total: assets.length,
      completed: 0,
      success: 0,
      failed: 0,
      state: 'running',
    });
  }
  for (const remote of assets) {
    try {
      const url = String(remote.url || '').trim();
      const { downloaded, extension, sourceUrl, transferMode } = await downloadRemoteWithFallbacks(remote, payload.page?.url);
      const hash = hashBuffer(downloaded.buffer);
      const existing = database.assets.find((asset) => asset.hash === hash);
      const id = randomUUID();
      const baseFromUrl = path.basename(new URL(downloaded.finalUrl).pathname, extension);
      const basename = sanitizeFilePart(remote.fileName ? path.basename(remote.fileName, path.extname(remote.fileName)) : baseFromUrl, 'web-asset');
      let targetPath = path.join(targetDir, `${hash.slice(0, 12)}_${basename}${extension}`);
      try {
        await fs.access(targetPath);
        targetPath = path.join(targetDir, `${hash.slice(0, 12)}_${id.slice(0, 8)}_${basename}${extension}`);
      } catch {}

      await fs.writeFile(targetPath, downloaded.buffer);
      const stat = await fs.stat(targetPath);
      const asset = {
        id,
        name: path.basename(targetPath),
        originalName: `${basename}${extension}`,
        extension,
        kind: getAssetKind(extension, downloaded.buffer),
        folderId,
        path: targetPath,
        hash,
        size: stat.size,
        width: remote.width || null,
        height: remote.height || null,
        duration: null,
        colors: [],
        autoTags: [],
        userTags: [],
        prompt: null,
        promptStatus: 'none',
        promptLevel: '中等',
        source: {
          type: 'web',
          pageTitle: payload.page?.title || remote.pageTitle || '',
          pageUrl: payload.page?.url || remote.pageUrl || '',
          detailPageUrl: remote.detailPageUrl || '',
          assetUrl: url,
          downloadedFrom: sourceUrl,
          finalUrl: downloaded.finalUrl,
          collectedAt: payload.collectedAt || new Date().toISOString(),
          transferMode,
          licenseNote: '个人学习与参考使用',
        },
        thumbnail: null,
        coverFrame: null,
        analysisStatus: 'pending',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      asset.autoTags = [...new Set([...buildAssetTags(asset), '网页收集'])];
      database.assets.unshift(asset);
      imported.push(asset);
      if (existing) duplicates.push({ imported: asset, existing });
    } catch (error) {
      failed.push({ url: remote?.url || '', reason: error?.message || '导入失败' });
    }
    completed += 1;
    sendImportProgress({
      id: importId,
      source: '网页收集',
      total: assets.length,
      completed,
      success: imported.length,
      failed: failed.length,
      currentName: remote?.fileName || remote?.title || remote?.url || '',
      total: displayTotal,
      success: previousSuccess + imported.length,
      failed: previousFailed + failed.length,
      state: completed >= displayTotal ? 'done' : 'running',
    });
  }

  await writeDatabase(rootPath, database, { backup: true });
  return { database, imported, duplicates, failed };
}

function makeExportRelativeAsset(rootPath, asset) {
  const exported = structuredClone(asset);
  const originalName = `${asset.id}${path.extname(asset.path || asset.name || '') || asset.extension || ''}`;
  exported.exportOriginal = path.join('originals', safeRelativePath(originalName, 'asset'));
  exported.path = exported.exportOriginal;
  if (asset.thumbnail) {
    const thumbName = `${asset.id}${path.extname(asset.thumbnail) || '.jpg'}`;
    exported.exportThumbnail = path.join('thumbnails', safeRelativePath(thumbName, 'thumb'));
    exported.thumbnail = exported.exportThumbnail;
  } else {
    exported.thumbnail = null;
  }
  exported.sourceLibraryRoot = rootPath;
  return exported;
}

function getFolderDescendantIds(folders = [], folderId) {
  const childrenByParent = new Map();
  for (const folder of folders) {
    if (!folder.parentId) continue;
    const children = childrenByParent.get(folder.parentId) || [];
    children.push(folder.id);
    childrenByParent.set(folder.parentId, children);
  }
  const ids = new Set([folderId]);
  const stack = [...(childrenByParent.get(folderId) || [])];
  while (stack.length) {
    const id = stack.pop();
    if (!id || ids.has(id)) continue;
    ids.add(id);
    stack.push(...(childrenByParent.get(id) || []));
  }
  return ids;
}

async function exportLibraryPackage(rootPath, options = {}) {
  await ensureLibrary(rootPath);
  const database = await readDatabase(rootPath);
  const requestedFolderIds = Array.isArray(options?.folderIds)
    ? [...new Set(options.folderIds.map((id) => String(id || '').trim()).filter(Boolean))]
    : [];
  const sourceFolders = Array.isArray(database.folders) ? database.folders : [];
  const sourceAssets = Array.isArray(database.assets) ? database.assets.filter((asset) => !asset.deletedAt) : [];
  const folderScope = requestedFolderIds.length
    ? requestedFolderIds.reduce((set, folderId) => {
        for (const id of getFolderDescendantIds(sourceFolders, folderId)) set.add(id);
        return set;
      }, new Set())
    : null;
  const exportFolders = folderScope
    ? sourceFolders.filter((folder) => folderScope.has(folder.id))
    : sourceFolders;
  const exportAssets = folderScope
    ? sourceAssets.filter((asset) => folderScope.has(asset.folderId))
    : sourceAssets;
  if (folderScope && !exportFolders.length) throw new Error('没有找到要导出的文件夹');
  const saveResult = await dialog.showSaveDialog(mainWindow, {
    title: '导出数据迁移',
    defaultPath: path.join(app.getPath('desktop'), `素材库数据迁移-${new Date().toISOString().slice(0, 10)}.avault.zip`),
    filters: [{ name: '素材库数据迁移包', extensions: ['zip'] }],
  });
  if (saveResult.canceled || !saveResult.filePath) return null;

  const tempDir = await fs.mkdtemp(path.join(app.getPath('temp'), 'asset-vault-export-'));
  try {
    await ensureDir(path.join(tempDir, 'originals'));
    await ensureDir(path.join(tempDir, 'thumbnails'));
    const exportedAssets = [];
    const failed = [];
    for (const asset of exportAssets) {
      try {
        if (!asset?.path) throw new Error('没有素材路径');
        await fs.access(asset.path);
        const exportAsset = makeExportRelativeAsset(rootPath, asset);
        await ensureDir(path.dirname(path.join(tempDir, exportAsset.exportOriginal)));
        await fs.copyFile(asset.path, path.join(tempDir, exportAsset.exportOriginal));
        if (asset.thumbnail && exportAsset.exportThumbnail) {
          await ensureDir(path.dirname(path.join(tempDir, exportAsset.exportThumbnail)));
          await fs.copyFile(asset.thumbnail, path.join(tempDir, exportAsset.exportThumbnail)).catch(() => {
            exportAsset.thumbnail = null;
            exportAsset.exportThumbnail = null;
          });
        }
        exportedAssets.push(exportAsset);
      } catch (error) {
        failed.push({ id: asset?.id, name: asset?.originalName || asset?.name || '未知素材', reason: error?.message || '导出失败' });
      }
    }

    const exportDatabase = {
      ...structuredClone(database),
      folders: structuredClone(exportFolders),
      assets: exportedAssets,
    };
    const manifest = {
      type: 'asset-vault-library-package',
      version: 1,
      exportedAt: new Date().toISOString(),
      app: 'AI Asset Vault',
      assetCount: exportedAssets.length,
      folderCount: exportFolders.length,
      scope: folderScope ? 'folders' : 'all',
      folderIds: requestedFolderIds,
      note: '该压缩包用于合并导入到素材库。API Key 不包含在导出内容中。',
    };
    await fs.writeFile(path.join(tempDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');
    await fs.writeFile(path.join(tempDir, 'database.json'), JSON.stringify(exportDatabase, null, 2), 'utf8');
    await fs.writeFile(path.join(tempDir, 'README.txt'), '素材库数据迁移包：在软件中选择“导入迁移的数据”即可合并到当前素材库，原有数据不会被覆盖。', 'utf8');
    await zipDirectory(tempDir, saveResult.filePath);
    return { path: saveResult.filePath, exportedCount: exportedAssets.length, failed };
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}

async function importLibraryPackage(rootPath) {
  const dirs = await ensureLibrary(rootPath);
  const openResult = await dialog.showOpenDialog(mainWindow, {
    title: '导入迁移的数据（合并到当前素材库）',
    properties: ['openFile'],
    filters: [
      { name: '素材库数据迁移包', extensions: ['zip'] },
      { name: '所有文件', extensions: ['*'] },
    ],
  });
  if (openResult.canceled || !openResult.filePaths?.[0]) return null;

  const packagePath = openResult.filePaths[0];
  const tempDir = await fs.mkdtemp(path.join(app.getPath('temp'), 'asset-vault-import-'));
  try {
    await unzipToDirectory(packagePath, tempDir);
    const manifest = JSON.parse(await fs.readFile(path.join(tempDir, 'manifest.json'), 'utf8'));
    if (manifest.type !== 'asset-vault-library-package') throw new Error('这不是有效的素材库数据迁移包');
    const importDatabase = await normalizeStoredAssetKinds(JSON.parse(await fs.readFile(path.join(tempDir, 'database.json'), 'utf8')));
    const currentDatabase = await readDatabase(rootPath);
    const now = new Date().toISOString();
    const folderIdMap = new Map();
    const existingFolderIds = new Set((currentDatabase.folders || []).map((folder) => folder.id));
    const folderKey = (parentId, name) => `${parentId || ''}::${String(name || '').trim()}`;
    const existingFoldersByKey = new Map((currentDatabase.folders || []).map((folder) => [folderKey(folder.parentId || null, folder.name), folder]));
    const importFolders = [...(importDatabase.folders || [])].sort((a, b) => {
      if (!a.parentId && b.parentId) return -1;
      if (a.parentId && !b.parentId) return 1;
      return 0;
    });

    for (const folder of importFolders) {
      if (folder.id === 'default') {
        folderIdMap.set(folder.id, 'default');
        continue;
      }
      const cleanName = String(folder.name || '').trim() || '导入文件夹';
      const mappedParentId = folder.parentId ? (folderIdMap.get(folder.parentId) || null) : null;
      const sameName = existingFoldersByKey.get(folderKey(mappedParentId, cleanName));
      if (sameName) {
        folderIdMap.set(folder.id, sameName.id);
        continue;
      }
      const id = randomUUID();
      const nextFolder = {
        ...folder,
        id,
        name: cleanName,
        parentId: mappedParentId,
        createdAt: folder.createdAt || now,
        updatedAt: now,
        isDefault: false,
      };
      folderIdMap.set(folder.id, id);
      currentDatabase.folders.push(nextFolder);
      existingFoldersByKey.set(folderKey(mappedParentId, cleanName), nextFolder);
      existingFolderIds.add(id);
    }

    const imported = [];
    const failed = [];
    for (const sourceAsset of importDatabase.assets || []) {
      try {
        const relativeOriginal = sourceAsset.exportOriginal || sourceAsset.path;
        const sourcePath = path.resolve(tempDir, relativeOriginal);
        if (!isPathInside(tempDir, sourcePath)) throw new Error('搬家包素材路径无效');
        await fs.access(sourcePath);
        const id = randomUUID();
        const preferredName = sourceAsset.originalName || sourceAsset.name || path.basename(sourcePath);
        const mappedFolderId = folderIdMap.get(sourceAsset.folderId) || (existingFolderIds.has(sourceAsset.folderId) ? sourceAsset.folderId : 'default');
        const importTargetDir = getFolderAssetDir(rootPath, currentDatabase, mappedFolderId, 'originals');
        const targetPath = await copyFileUnique(sourcePath, importTargetDir, preferredName);
        let thumbnail = null;
        const relativeThumb = sourceAsset.exportThumbnail || sourceAsset.thumbnail;
        if (relativeThumb) {
          const thumbSourcePath = path.resolve(tempDir, relativeThumb);
          if (isPathInside(tempDir, thumbSourcePath)) {
            const thumbExtension = path.extname(thumbSourcePath) || '.jpg';
            const thumbnailDir = getFolderAssetDir(rootPath, currentDatabase, mappedFolderId, 'thumbnails');
            await ensureDir(thumbnailDir);
            thumbnail = path.join(thumbnailDir, `${id}${thumbExtension}`);
            await fs.copyFile(thumbSourcePath, thumbnail).catch(() => { thumbnail = null; });
          }
        }
        const asset = {
          ...sourceAsset,
          id,
          name: path.basename(targetPath),
          path: targetPath,
          thumbnail,
          folderId: mappedFolderId,
          importedFromPackage: {
            packageName: path.basename(packagePath),
            sourceAssetId: sourceAsset.id,
            importedAt: now,
          },
          createdAt: sourceAsset.createdAt || now,
          updatedAt: now,
        };
        delete asset.exportOriginal;
        delete asset.exportThumbnail;
        delete asset.sourceLibraryRoot;
        currentDatabase.assets.unshift(asset);
        imported.push(asset);
      } catch (error) {
        failed.push({ id: sourceAsset?.id, name: sourceAsset?.originalName || sourceAsset?.name || '未知素材', reason: error?.message || '导入失败' });
      }
    }
    await writeDatabase(rootPath, currentDatabase, { backup: true });
    return { database: currentDatabase, imported, failed, packagePath };
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}

async function saveEditedCopy(rootPath, sourceAsset, dataUrl, edits = {}) {
  const dirs = await ensureLibrary(rootPath);
  const database = await readDatabase(rootPath);
  const { mime, buffer } = bufferFromDataUrl(dataUrl);
  const extension = extensionFromMime(mime);
  const hash = hashBuffer(buffer);
  const targetDir = getFolderAssetDir(rootPath, database, sourceAsset.folderId || 'default', 'originals');
  await ensureDir(targetDir);

  const sourceBase = path.basename(sourceAsset.originalName || sourceAsset.name || 'asset', path.extname(sourceAsset.originalName || sourceAsset.name || ''));
  const id = randomUUID();
  const safeName = `${hash.slice(0, 12)}_${sourceBase || 'asset'}_编辑副本${extension}`;
  let targetPath = path.join(targetDir, safeName);
  try {
    await fs.access(targetPath);
    targetPath = path.join(targetDir, `${hash.slice(0, 12)}_${id.slice(0, 8)}_${sourceBase || 'asset'}_编辑副本${extension}`);
  } catch {}

  await fs.writeFile(targetPath, buffer);
  const stat = await fs.stat(targetPath);
  const asset = {
    id,
    name: path.basename(targetPath),
    originalName: `${sourceBase || 'asset'}_编辑副本${extension}`,
    extension,
    kind: 'image',
    folderId: sourceAsset.folderId || 'default',
    path: targetPath,
    hash,
    size: stat.size,
    width: edits.width || null,
    height: edits.height || null,
    duration: null,
    colors: [],
    autoTags: [...new Set([...(sourceAsset.autoTags || []), '图片', '编辑副本', extension.replace('.', '')])],
    userTags: [...new Set(sourceAsset.userTags || [])],
    prompt: null,
    promptStatus: 'none',
    promptLevel: sourceAsset.promptLevel || '中等',
    source: { type: 'edited-copy', sourceAssetId: sourceAsset.id },
    thumbnail: null,
    coverFrame: null,
    analysisStatus: 'pending',
    editInfo: edits,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  database.assets.unshift(asset);
  await writeDatabase(rootPath, database, { backup: true });
  return { database, asset };
}

async function createWindow() {
  Menu.setApplicationMenu(null);
  app.setName(getProductTitle());

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1120,
    minHeight: 720,
    title: getProductTitle(),
    backgroundColor: '#101214',
    autoHideMenuBar: true,
    frame: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  if (isDev) {
    try {
      await mainWindow.loadURL('http://127.0.0.1:5173');
    } catch (loadError) {
      console.warn('开发服务器加载失败，改用本地 dist 页面：', loadError?.message || loadError);
      await mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
    }
  } else {
    await mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }
  mainWindow.setMenuBarVisibility(false);
}

function sendJson(response, statusCode, data) {
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, X-Asset-Vault-Extension',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  });
  response.end(JSON.stringify(data));
}

function readRequestJson(request) {
  return new Promise((resolve, reject) => {
    let raw = '';
    let tooLarge = false;
    request.setEncoding('utf8');
    request.on('data', (chunk) => {
      if (tooLarge) return;
      raw += chunk;
      if (raw.length > extensionRequestMaxBytes) {
        tooLarge = true;
        reject(new Error('请求内容过大'));
        request.resume();
      }
    });
    request.on('end', () => {
      if (tooLarge) return;
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        reject(new Error('请求格式不是有效 JSON'));
      }
    });
    request.on('error', reject);
  });
}

function startExtensionServer() {
  if (extensionServer) return;
  extensionServer = http.createServer(async (request, response) => {
    if (request.method === 'OPTIONS') {
      sendJson(response, 200, { ok: true });
      return;
    }
    const url = new URL(request.url || '/', `http://127.0.0.1:${extensionServerPort}`);
    if (request.method === 'GET' && url.pathname === '/status') {
      let folders = [];
      if (activeRootPath) {
        try {
          const database = await readDatabase(activeRootPath);
          folders = database.folders || [];
        } catch {}
      }
      sendJson(response, 200, { ok: true, hasLibrary: !!activeRootPath, folders });
      return;
    }
    if (request.method !== 'POST' || url.pathname !== '/collect') {
      sendJson(response, 404, { ok: false, error: '接口不存在' });
      return;
    }
    if (request.headers['x-asset-vault-extension'] !== 'web-collector') {
      sendJson(response, 403, { ok: false, error: '拒绝未知来源请求' });
      return;
    }
    try {
      const payload = await readRequestJson(request);
      const result = await importRemoteAssets(activeRootPath, payload, payload.folderId || 'default');
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('extension:imported', result);
        mainWindow.show();
      }
      sendJson(response, 200, {
        ok: true,
        importedCount: result.imported.length,
        duplicateCount: result.duplicates.length,
        imported: result.imported.map((asset) => ({
          id: asset.id,
          assetUrl: asset.source?.assetUrl || '',
          finalUrl: asset.source?.finalUrl || '',
          downloadedFrom: asset.source?.downloadedFrom || '',
          name: asset.originalName || asset.name,
        })),
        failed: result.failed,
      });
    } catch (error) {
      sendJson(response, 500, { ok: false, error: error?.message || '接收失败' });
    }
  });
  extensionServer.on('error', (error) => {
    if (error?.code === 'EADDRINUSE') {
      console.warn(`网页素材收集服务端口 ${extensionServerPort} 已被占用，当前窗口跳过启动接收服务。`);
      extensionServer = null;
      return;
    }
    console.warn('网页素材收集服务启动失败：', error);
    extensionServer = null;
  });
  extensionServer.listen(extensionServerPort, '127.0.0.1');
}

app.whenReady().then(() => {
  protocol.registerFileProtocol('asset', (request, callback) => {
    try {
      const url = new URL(request.url);
      let filePath = decodeURIComponent(url.pathname);
      if (filePath.startsWith('/')) filePath = filePath.slice(1);
      if (/^[a-zA-Z]:\//.test(filePath)) {
        filePath = filePath.replace(/\//g, '\\');
      }
      callback({ path: filePath });
    } catch {
      callback({ error: -2 });
    }
  });
  startExtensionServer();
});

app.whenReady().then(createWindow);

app.on('second-instance', () => {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
});

app.on('window-all-closed', () => {
  extensionServer?.close();
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

async function openLibraryRoot(rootPath) {
  activeRootPath = rootPath;
  await ensureLibrary(rootPath);
  let database = await readDatabase(rootPath);
  if (database.__normalizedKinds) {
    delete database.__normalizedKinds;
    await writeDatabase(rootPath, database, { backup: true });
  }
  database = (await cleanupExpiredTrash(rootPath, database)).database;
  database = (await syncLibraryFilesToFolders(rootPath, database)).database;
  return { rootPath, database };
}

ipcMain.handle('library:createRoot', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: '创建 Cyrus Ai 素材库',
    buttonLabel: '创建素材库',
    properties: ['openDirectory', 'createDirectory'],
  });
  if (result.canceled || !result.filePaths[0]) return null;
  return openLibraryRoot(result.filePaths[0]);
});

ipcMain.handle('library:selectExistingRoot', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: '选择已有 Cyrus Ai 素材库',
    buttonLabel: '选择素材库',
    properties: ['openDirectory'],
  });
  if (result.canceled || !result.filePaths[0]) return null;
  const rootPath = result.filePaths[0];
  const dbPath = path.join(rootPath, 'database', 'library.json');
  if (!existsSync(dbPath)) {
    return {
      error: 'missing-library',
      rootPath,
      message: '这个文件夹里没有找到 Cyrus Ai 素材库数据。请返回后选择“创建新素材库”，或重新选择已有素材库文件夹。',
    };
  }
  return openLibraryRoot(rootPath);
});

ipcMain.handle('library:chooseRoot', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: '选择素材库保存位置',
    properties: ['openDirectory', 'createDirectory'],
  });
  if (result.canceled || !result.filePaths[0]) return null;
  return openLibraryRoot(result.filePaths[0]);
});

ipcMain.handle('library:load', async (_, rootPath) => {
  if (!rootPath) return null;
  activeRootPath = rootPath;
  let database = await readDatabase(rootPath);
  if (database.__normalizedKinds) {
    delete database.__normalizedKinds;
    await writeDatabase(rootPath, database, { backup: true });
  }
  database = (await cleanupExpiredTrash(rootPath, database)).database;
  database = (await syncLibraryFilesToFolders(rootPath, database)).database;
  return { rootPath, database };
});

ipcMain.handle('library:setActiveRoot', async (_, rootPath) => {
  activeRootPath = rootPath || '';
  return { ok: true };
});

ipcMain.handle('library:save', async (_, rootPath, database) => {
  let previous = null;
  try {
    previous = await readDatabase(rootPath);
  } catch {}
  await writeDatabase(rootPath, database);
  if (folderStructureSignature(previous) !== folderStructureSignature(database)) {
    await syncLibraryFilesToFolders(rootPath, database);
  }
  return database;
});
ipcMain.handle('library:exportPackage', async (_, rootPath, options) => exportLibraryPackage(rootPath, options));
ipcMain.handle('library:importPackage', async (_, rootPath) => importLibraryPackage(rootPath));
ipcMain.handle('updates:getAppVersion', async () => ({ version: app.getVersion(), isPackaged: app.isPackaged }));
ipcMain.handle('updates:check', async (_, configUrl) => checkForUpdate(configUrl));
ipcMain.handle('updates:download', async (_, update) => downloadUpdate(update));
ipcMain.handle('updates:chooseInstaller', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: '选择新版安装包',
    filters: [
      { name: 'Windows 安装包', extensions: ['exe'] },
      { name: '所有文件', extensions: ['*'] },
    ],
    properties: ['openFile'],
  });
  if (result.canceled || !result.filePaths?.[0]) return null;
  const installerPath = result.filePaths[0];
  const stats = await fs.stat(installerPath);
  return {
    path: installerPath,
    fileName: path.basename(installerPath),
    size: stats.size,
    sha256: await hashFile(installerPath),
  };
});
ipcMain.handle('updates:exportConfig', async (_, config, privateKeyBase64) => {
  const normalized = normalizeUpdateConfig(config);
  const signed = signConfigPayload(normalized, privateKeyBase64);
  const result = await dialog.showSaveDialog(mainWindow, {
    title: '导出带签名的 update.json',
    defaultPath: path.join(app.getPath('desktop'), 'update.json'),
    filters: [{ name: 'JSON 配置文件', extensions: ['json'] }],
  });
  if (result.canceled || !result.filePath) return null;
  await fs.writeFile(result.filePath, `${JSON.stringify(signed, null, 2)}\n`, 'utf8');
  return { path: result.filePath, version: signed.version };
});
ipcMain.handle('updates:install', async (_, payload) => installDownloadedUpdate(payload));

ipcMain.handle('ai:testConnection', async (_, config) => {
  const provider = config?.provider || 'openai-compatible';
  let runningHubModel = null;
  if (provider === 'runninghub') {
    runningHubModel = await fetchRunningHubModelInfo(config);
  }
  const content = await callOpenAiCompatible(
    config,
    [
      { role: 'system', content: '你是连接测试助手，只返回 JSON。' },
      { role: 'user', content: '请返回 {"ok":true,"message":"连接成功"}' },
    ],
    { timeout: 30000, maxTokens: 80 }
  );
  let parsed = null;
  try {
    parsed = extractJsonObject(content);
  } catch {}
  return {
    ok: parsed?.ok === true || /连接成功|success|ok/i.test(content),
    message: provider === 'runninghub'
      ? `RunningHub 连接成功${runningHubModel?.capabilities?.vision ? '，当前模型支持看图' : '，但当前模型可能不支持看图'}`
      : (parsed?.message || '连接成功'),
    model: String(config?.model || '').trim(),
    provider,
    endpoint: sanitizeAiConfig(config).baseUrl,
    vision: runningHubModel?.capabilities?.vision === true,
  };
});

ipcMain.handle('ai:listModels', async (_, config) => listAiModels(config));
ipcMain.handle('ai:analyzeImage', async (_, config, asset) => analyzeImageWithAi(config, asset));
ipcMain.handle('ai:reversePrompt', async (_, config, asset, level, requestId) => {
  const id = String(requestId || '').trim();
  const controller = new AbortController();
  if (id) aiRequestControllers.set(id, controller);
  try {
    return await reversePromptWithAi(config, asset, level, { signal: controller.signal });
  } finally {
    if (id) aiRequestControllers.delete(id);
  }
});

ipcMain.handle('ai:cancelReversePrompt', async (_, requestId) => {
  const id = String(requestId || '').trim();
  const controller = aiRequestControllers.get(id);
  if (!controller) return { ok: false };
  controller.abort();
  aiRequestControllers.delete(id);
  return { ok: true };
});

ipcMain.handle('assets:importDialog', async (_, rootPath, folderId) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: '导入素材',
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: '素材文件', extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'tif', 'tiff', 'avif', 'svg', 'ico', 'heic', 'heif', 'jxl', 'psd', 'ai', 'eps', 'pdf', 'mp4', 'webm', 'mov', 'mkv', 'avi', 'm4v', 'ogv', '3gp', '3g2', 'ts', 'm3u8'] },
      { name: '所有文件', extensions: ['*'] },
    ],
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return importFiles(rootPath, result.filePaths, folderId, { duplicateStrategy: 'ask' });
});

ipcMain.handle('assets:importDropped', async (_, rootPath, filePaths, folderId) => importFiles(rootPath, filePaths, folderId, { duplicateStrategy: 'ask' }));

ipcMain.handle('assets:saveEditedCopy', async (_, rootPath, sourceAsset, dataUrl, edits) => saveEditedCopy(rootPath, sourceAsset, dataUrl, edits));

ipcMain.handle('assets:saveThumbnail', async (_, rootPath, assetId, dataUrl, extension = 'jpg') => {
  const dirs = await ensureLibrary(rootPath);
  const database = await readDatabase(rootPath);
  const asset = (database.assets || []).find((item) => item.id === assetId);
  const match = /^data:(?<mime>[-\w/+.]+);base64,(?<data>.+)$/.exec(dataUrl);
  if (!match?.groups?.data) throw new Error('Invalid thumbnail data');
  const safeExtension = extension.replace(/[^a-z0-9]/gi, '').toLowerCase() || 'jpg';
  const targetDir = asset ? getFolderAssetDir(rootPath, database, asset.folderId || 'default', 'thumbnails') : dirs.thumbnails;
  await ensureDir(targetDir);
  const targetPath = path.join(targetDir, `${assetId}.${safeExtension}`);
  await fs.writeFile(targetPath, Buffer.from(match.groups.data, 'base64'));
  return targetPath;
});

ipcMain.handle('assets:readBinary', async (_, filePath) => {
  const buffer = await fs.readFile(filePath);
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
});

ipcMain.handle('assets:delete', async (_, rootPath, assetIds) => {
  const database = await readDatabase(rootPath);
  const ids = new Set(Array.isArray(assetIds) ? assetIds : [assetIds]);
  const removed = database.assets.filter((asset) => ids.has(asset.id));
  for (const asset of removed) await removeAssetFiles(asset);
  database.assets = database.assets.filter((asset) => !ids.has(asset.id));
  await writeDatabase(rootPath, database, { backup: true });
  return { database, removedCount: removed.length };
});

ipcMain.handle('assets:trash', async (_, rootPath, assetIds) => {
  const database = await readDatabase(rootPath);
  const ids = new Set(Array.isArray(assetIds) ? assetIds : [assetIds]);
  const now = new Date();
  const deletedAt = now.toISOString();
  const deleteExpiresAt = new Date(now.getTime() + trashRetentionMs).toISOString();
  let trashedCount = 0;
  database.assets = (database.assets || []).map((asset) => {
    if (!ids.has(asset.id) || asset.deletedAt) return asset;
    trashedCount += 1;
    return {
      ...asset,
      deletedAt,
      deleteExpiresAt,
      deletedFromFolderId: asset.folderId || 'default',
      updatedAt: deletedAt,
    };
  });
  await writeDatabase(rootPath, database, { backup: true });
  return { database, trashedCount };
});

ipcMain.handle('assets:restore', async (_, rootPath, assetIds) => {
  const database = await readDatabase(rootPath);
  const ids = new Set(Array.isArray(assetIds) ? assetIds : [assetIds]);
  const folderIds = new Set((database.folders || []).map((folder) => folder.id));
  const now = new Date().toISOString();
  let restoredCount = 0;
  const restoredAssets = [];
  database.assets = (database.assets || []).map((asset) => {
    if (!ids.has(asset.id) || !asset.deletedAt) return asset;
    restoredCount += 1;
    const { deletedAt, deleteExpiresAt, deletedFromFolderId, deletedFromParentFolderId, ...restored } = asset;
    const targetFolderId = folderIds.has(deletedFromFolderId)
      ? deletedFromFolderId
      : (folderIds.has(deletedFromParentFolderId)
        ? deletedFromParentFolderId
        : (folderIds.has(asset.folderId) ? asset.folderId : 'default'));
    const restoredAsset = {
      ...restored,
      folderId: targetFolderId,
      updatedAt: now,
    };
    restoredAssets.push(restoredAsset);
    return restoredAsset;
  });
  for (const asset of restoredAssets) {
    await relocateAssetFilesToFolder(rootPath, database, asset).catch((error) => {
      asset.folderSyncStatus = 'failed';
      asset.folderSyncError = error?.message || '恢复到本地文件夹失败';
    });
  }
  await writeDatabase(rootPath, database, { backup: true });
  return { database, restoredCount };
});

ipcMain.handle('assets:emptyTrash', async (_, rootPath) => {
  const database = await readDatabase(rootPath);
  const removed = (database.assets || []).filter((asset) => asset.deletedAt);
  for (const asset of removed) await removeAssetFiles(asset);
  database.assets = (database.assets || []).filter((asset) => !asset.deletedAt);
  await writeDatabase(rootPath, database, { backup: true });
  return { database, removedCount: removed.length };
});

ipcMain.handle('assets:moveToFolder', async (_, rootPath, assetIds, folderId) => {
  const database = await readDatabase(rootPath);
  const ids = new Set(Array.isArray(assetIds) ? assetIds : [assetIds]);
  const now = new Date().toISOString();
  let movedCount = 0;
  for (const asset of database.assets || []) {
    if (!ids.has(asset.id) || asset.deletedAt) continue;
    asset.folderId = folderId || 'default';
    asset.updatedAt = now;
    try {
      if (await relocateAssetFilesToFolder(rootPath, database, asset)) {
        movedCount += 1;
      } else {
        movedCount += 1;
      }
      delete asset.folderSyncStatus;
      delete asset.folderSyncError;
    } catch (error) {
      asset.folderSyncStatus = 'failed';
      asset.folderSyncError = error?.message || '移动到本地文件夹失败';
    }
  }
  await writeDatabase(rootPath, database, { backup: true });
  return { database, movedCount };
});

ipcMain.handle('assets:copyToFolder', async (_, rootPath, assetIds, folderId) => {
  const dirs = await ensureLibrary(rootPath);
  const database = await readDatabase(rootPath);
  const ids = new Set(Array.isArray(assetIds) ? assetIds : [assetIds]);
  const sourceAssets = database.assets.filter((asset) => ids.has(asset.id));
  const copied = [];
  for (const source of sourceAssets) {
    try {
      await fs.access(source.path);
      const id = randomUUID();
      const extension = path.extname(source.path) || source.extension || '';
      const basename = sanitizeFilePart(path.basename(source.originalName || source.name || source.path, extension), 'asset');
      const targetDir = getFolderAssetDir(rootPath, database, folderId || 'default', 'originals');
      await ensureDir(targetDir);
      let targetPath = path.join(targetDir, `${source.hash?.slice(0, 12) || id.slice(0, 12)}_${id.slice(0, 8)}_${basename}${extension}`);
      let index = 2;
      while (true) {
        try {
          await fs.access(targetPath);
          targetPath = path.join(targetDir, `${source.hash?.slice(0, 12) || id.slice(0, 12)}_${id.slice(0, 8)}_${basename}_${index}${extension}`);
          index += 1;
        } catch {
          break;
        }
      }
      await fs.copyFile(source.path, targetPath);
      let thumbnail = null;
      if (source.thumbnail) {
        const thumbExtension = path.extname(source.thumbnail) || '.jpg';
        const thumbnailDir = getFolderAssetDir(rootPath, database, folderId || 'default', 'thumbnails');
        await ensureDir(thumbnailDir);
        thumbnail = path.join(thumbnailDir, `${id}${thumbExtension}`);
        await fs.copyFile(source.thumbnail, thumbnail).catch(() => { thumbnail = null; });
      }
      const now = new Date().toISOString();
      const asset = {
        ...source,
        id,
        name: path.basename(targetPath),
        folderId,
        path: targetPath,
        thumbnail,
        createdAt: now,
        updatedAt: now,
      };
      database.assets.unshift(asset);
      copied.push(asset);
    } catch {}
  }
  await writeDatabase(rootPath, database, { backup: true });
  return { database, copied };
});

ipcMain.handle('assets:export', async (_, assets) => {
  const items = Array.isArray(assets) ? assets.filter((asset) => asset?.path) : [];
  if (!items.length) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    title: '选择导出文件夹',
    properties: ['openDirectory', 'createDirectory'],
  });
  if (result.canceled || !result.filePaths?.[0]) return null;
  const targetDir = result.filePaths[0];
  const exported = [];
  const failed = [];
  for (const asset of items) {
    try {
      await fs.access(asset.path);
      const extension = path.extname(asset.path);
      const base = sanitizeFilePart(path.basename(asset.originalName || asset.name || asset.path, extension), 'asset');
      let targetPath = path.join(targetDir, `${base}${extension}`);
      let index = 2;
      while (true) {
        if (path.resolve(targetPath).toLowerCase() === path.resolve(asset.path).toLowerCase()) {
          targetPath = path.join(targetDir, `${base}_${index}${extension}`);
          index += 1;
          continue;
        }
        try {
          await fs.access(targetPath);
          targetPath = path.join(targetDir, `${base}_${index}${extension}`);
          index += 1;
        } catch {
          break;
        }
      }
      await fs.copyFile(asset.path, targetPath);
      exported.push({ id: asset.id, path: targetPath });
    } catch (error) {
      failed.push({ id: asset.id, name: asset.originalName || asset.name, reason: error?.message || '导出失败' });
    }
  }
  return { targetDir, exported, failed };
});

ipcMain.on('assets:startDragOut', (event, items) => {
  try {
    const list = Array.isArray(items) ? items : [items];
    const files = [...new Set(list
      .map((item) => String(item?.path || item || '').trim())
      .filter((filePath) => filePath && existsSync(filePath)))];
    if (!files.length) return;
    const iconSource = list
      .map((item) => String(item?.thumbnail || item?.path || item || '').trim())
      .find((filePath) => filePath && existsSync(filePath)) || files[0];
    let icon = nativeImage.createFromPath(iconSource);
    if (icon.isEmpty()) icon = nativeImage.createFromPath(files[0]);
    if (icon.isEmpty()) icon = nativeImage.createFromDataURL(dragFallbackIconDataUrl);
    if (!icon.isEmpty()) icon = icon.resize({ width: 64, height: 64, quality: 'best' });
    event.sender.startDrag({
      file: files[0],
      files,
      icon,
    });
  } catch (error) {
    console.error('assets:startDragOut failed', error);
  }
});

ipcMain.handle('ads:chooseImage', async (_, rootPath) => {
  if (!rootPath) return null;
  const dirs = await ensureLibrary(rootPath);
  const result = await dialog.showOpenDialog(mainWindow, {
    title: '选择广告图片',
    properties: ['openFile'],
    filters: [
      { name: '图片广告', extensions: Array.from(adImageExtensions).map((item) => item.replace('.', '')) },
      { name: '所有文件', extensions: ['*'] },
    ],
  });
  if (result.canceled || !result.filePaths?.[0]) return null;
  const sourcePath = result.filePaths[0];
  const extension = (path.extname(sourcePath) || '.png').toLowerCase();
  if (!adImageExtensions.has(extension)) throw new Error('广告图片请使用 JPG、PNG、WEBP、GIF 或 SVG 格式');
  const baseName = sanitizeFilePart(path.basename(sourcePath, extension), 'ad');
  const targetDir = dirs.ads;
  await ensureDir(targetDir);
  let targetPath = path.join(targetDir, `${Date.now()}_${baseName}${extension}`);
  let index = 2;
  while (true) {
    try {
      await fs.access(targetPath);
      targetPath = path.join(targetDir, `${Date.now()}_${baseName}_${index}${extension}`);
      index += 1;
    } catch {
      break;
    }
  }
  await fs.copyFile(sourcePath, targetPath);
  return { path: targetPath, name: path.basename(sourcePath) };
});

ipcMain.handle('ads:exportPackage', async (_, rootPath, ads, privateKeyBase64) => {
  if (!rootPath) throw new Error('请先选择素材库位置');
  await ensureLibrary(rootPath);
  const items = (Array.isArray(ads) ? ads : [])
    .filter((ad) => ad?.enabled !== false)
    .filter((ad) => ad?.imagePath || ad?.imageUrl);
  if (!items.length) throw new Error('请先添加至少一条启用的广告');
  const result = await dialog.showOpenDialog(mainWindow, {
    title: '选择广告包导出位置',
    defaultPath: app.getPath('desktop'),
    properties: ['openDirectory', 'createDirectory'],
  });
  if (result.canceled || !result.filePaths?.[0]) return null;
  const folderName = `广告包-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}`;
  const packageDir = path.join(result.filePaths[0], folderName);
  const adsDir = path.join(packageDir, 'ads');
  await ensureDir(adsDir);
  const exportedAds = [];
  for (const [index, ad] of items.entries()) {
    let imageUrl = String(ad.imageUrl || '').trim();
    if (ad.imagePath) {
      await fs.access(ad.imagePath);
      const extension = path.extname(ad.imagePath) || '.png';
      const base = sanitizeFilePart(path.basename(ad.imagePath, extension), `banner-${index + 1}`);
      let fileName = `${base}${extension}`;
      let targetPath = path.join(adsDir, fileName);
      let suffix = 2;
      while (true) {
        try {
          await fs.access(targetPath);
          fileName = `${base}_${suffix}${extension}`;
          targetPath = path.join(adsDir, fileName);
          suffix += 1;
        } catch {
          break;
        }
      }
      await fs.copyFile(ad.imagePath, targetPath);
      imageUrl = `ads/${fileName}`;
    }
    exportedAds.push({
      title: String(ad.title || `广告 ${index + 1}`).trim(),
      imageUrl,
      linkUrl: String(ad.url || ad.linkUrl || '').trim(),
      enabled: ad.enabled !== false,
    });
  }
  const config = signConfigPayload({
    version: 1,
    updatedAt: new Date().toISOString(),
    ads: exportedAds,
  }, privateKeyBase64);
  await fs.writeFile(path.join(packageDir, 'ads.json'), JSON.stringify(config, null, 2), 'utf8');
  await fs.writeFile(path.join(packageDir, '使用说明.txt'), '把本文件夹里的 ads.json 和 ads 文件夹一起上传到 GitHub Pages 或云存储。软件广告配置地址填写上传后的 ads.json 网址。ads.json 里的 imageUrl 使用相对路径，和 ads 文件夹保持同级即可。请不要手动改 ads.json 内容，否则签名会失效。', 'utf8');
  return { path: packageDir, count: exportedAds.length };
});

ipcMain.handle('folders:openLocation', async (_, rootPath, folderId) => {
  const database = await readDatabase(rootPath);
  const folderPath = getFolderAssetDir(rootPath, database, folderId || 'default', 'originals');
  await ensureDir(folderPath);
  return shell.openPath(folderPath);
});

ipcMain.handle('clipboard:copyFiles', async (_, filePaths) => {
  const paths = (Array.isArray(filePaths) ? filePaths : [filePaths])
    .map((item) => String(item || '').trim())
    .filter(Boolean);
  if (!paths.length) return { ok: false, count: 0 };
  const existing = [];
  const missing = [];
  for (const filePath of paths) {
    try {
      await fs.access(filePath);
      existing.push(filePath);
    } catch {
      missing.push(filePath);
    }
  }
  if (!existing.length) return { ok: false, count: 0, reason: 'missing', missing };

  const firstExtension = path.extname(existing[0]).toLowerCase();
  const imageClipboardExtensions = new Set(['.jpg', '.jpeg', '.png', '.bmp']);
  const imagePath = existing.length === 1 && imageClipboardExtensions.has(firstExtension) ? existing[0] : '';
  const clipboardPaths = existing;

  await runPowershellJson(`
$json = [Console]::In.ReadToEnd()
$payload = $json | ConvertFrom-Json
$paths = @($payload.paths)
$imagePath = [string]$payload.imagePath
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$collection = New-Object System.Collections.Specialized.StringCollection
foreach ($path in $paths) { [void]$collection.Add([string]$path) }
$data = New-Object System.Windows.Forms.DataObject
$data.SetFileDropList($collection)
if ($imagePath -and (Test-Path -LiteralPath $imagePath)) {
  try {
    $image = [System.Drawing.Image]::FromFile($imagePath)
    $bitmap = New-Object System.Drawing.Bitmap($image)
    $data.SetImage($bitmap)
    $image.Dispose()
  } catch {}
}
$dropEffect = New-Object System.IO.MemoryStream
$bytes = [BitConverter]::GetBytes([UInt32]1)
$dropEffect.Write($bytes, 0, $bytes.Length)
$dropEffect.Position = 0
$data.SetData("Preferred DropEffect", $dropEffect)
[System.Windows.Forms.Clipboard]::SetDataObject($data, $true)
Start-Sleep -Milliseconds 80
$items = [System.Windows.Forms.Clipboard]::GetFileDropList()
$actual = @($items | ForEach-Object { [string]$_ })
$expected = @($paths | ForEach-Object { [string]$_ })
$ok = $actual.Count -eq $expected.Count
if ($ok) {
  for ($i = 0; $i -lt $expected.Count; $i++) {
    if ($actual[$i] -ne $expected[$i]) { $ok = $false; break }
  }
}
@{ ok = $ok; paths = $actual } | ConvertTo-Json -Compress
`, { paths: clipboardPaths, imagePath });
  const verifyOutput = await runPowershellJson(`
Add-Type -AssemblyName System.Windows.Forms
$items = [System.Windows.Forms.Clipboard]::GetFileDropList()
@($items | ForEach-Object { [string]$_ }) | ConvertTo-Json -Compress
`);
  const verifiedPaths = verifyOutput ? JSON.parse(verifyOutput) : [];
  const normalizedVerifiedPaths = (Array.isArray(verifiedPaths) ? verifiedPaths : [verifiedPaths]).filter(Boolean);
  const verified = normalizedVerifiedPaths.length === clipboardPaths.length
    && normalizedVerifiedPaths.every((item, index) => path.resolve(item).toLowerCase() === path.resolve(clipboardPaths[index]).toLowerCase());
  if (!verified) return { ok: false, count: 0, mode: 'failed', reason: 'verify', expected: clipboardPaths, actual: normalizedVerifiedPaths };
  return {
    ok: true,
    count: existing.length,
    mode: imagePath ? 'files+image' : 'files',
  };
});

ipcMain.handle('clipboard:readFiles', async () => {
  const output = await runPowershellJson(`
Add-Type -AssemblyName System.Windows.Forms
$items = [System.Windows.Forms.Clipboard]::GetFileDropList()
@($items | ForEach-Object { [string]$_ }) | ConvertTo-Json -Compress
`);
  if (!output) return [];
  try {
    const parsed = JSON.parse(output);
    return Array.isArray(parsed) ? parsed.filter(Boolean) : [parsed].filter(Boolean);
  } catch {
    return [];
  }
});

ipcMain.handle('clipboard:readImageFile', async () => {
  const image = clipboard.readImage();
  if (image.isEmpty()) return null;
  const size = image.getSize();
  if (!size.width || !size.height) return null;
  const tempDir = path.join(app.getPath('temp'), 'asset-vault-clipboard');
  await ensureDir(tempDir);
  const filePath = path.join(tempDir, `clipboard-${Date.now()}-${randomUUID().slice(0, 8)}.png`);
  await fs.writeFile(filePath, image.toPNG());
  return { path: filePath, width: size.width, height: size.height };
});

ipcMain.handle('extension:getInfo', async () => {
  const folderPath = getExtensionFolderPath();
  const manifestPath = path.join(folderPath, 'manifest.json');
  let manifest = null;
  try {
    manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  } catch {}
  return {
    path: folderPath,
    manifestPath,
    exists: existsSync(manifestPath),
    name: manifest?.name || 'Cyrus 素材采集插件',
    version: manifest?.version || '',
    githubUrl: 'https://github.com/CyrusChen213/cyrus-ai-asset-manager/releases/latest',
    chromeExtensionsUrl: 'chrome://extensions/',
    edgeExtensionsUrl: 'edge://extensions/',
  };
});

ipcMain.handle('extension:prepareInstall', async (_, browser = 'chrome') => {
  const folderPath = getExtensionFolderPath();
  const manifestPath = path.join(folderPath, 'manifest.json');
  if (!existsSync(manifestPath)) {
    throw new Error('没有找到插件文件夹，请确认当前软件安装完整。');
  }
  let manifest = null;
  try {
    manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  } catch {}
  const openResult = await openBrowserExtensionsPage(browser === 'edge' ? 'edge' : 'chrome');
  return {
    path: folderPath,
    manifestPath,
    exists: true,
    name: manifest?.name || 'Cyrus 素材采集插件',
    version: manifest?.version || '',
    browser: browser === 'edge' ? 'edge' : 'chrome',
    ...openResult,
  };
});

ipcMain.handle('shell:showItem', async (_, itemPath) => shell.showItemInFolder(itemPath));
ipcMain.handle('shell:openPath', async (_, itemPath) => shell.openPath(itemPath));
ipcMain.handle('shell:openExternal', async (_, url) => shell.openExternal(url));
ipcMain.handle('window:minimize', () => mainWindow?.minimize());
ipcMain.handle('window:toggleMaximize', () => {
  if (!mainWindow) return false;
  if (mainWindow.isMaximized()) mainWindow.unmaximize();
  else mainWindow.maximize();
  return mainWindow.isMaximized();
});
ipcMain.handle('window:close', () => mainWindow?.close());
