import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Archive,
  BookOpen,
  CheckSquare,
  ChevronDown,
  Columns3,
  Copy,
  ExternalLink,
  Folder,
  FolderPlus,
  Image as ImageIcon,
  Import,
  List,
  ChevronLeft,
  ChevronRight,
  Maximize2,
  Minus,
  Moon,
  PanelRight,
  Pencil,
  Puzzle,
  RefreshCw,
  RotateCcw,
  RotateCw,
  Search,
  Settings,
  SlidersHorizontal,
  Sparkles,
  Sun,
  Tags,
  Trash2,
  Users,
  Video,
  WandSparkles,
  X,
} from 'lucide-react';
import './styles.css';
import { DEFAULT_REMOTE_ADS_URL, DEFAULT_UPDATE_CONFIG_URL } from './appConfig';
import { CONFIG_PRIVATE_KEY_BASE64, hasConfigSigningKey, verifySignedConfig } from './configSignature';

const IS_ADMIN_BUILD = import.meta.env.VITE_APP_VARIANT !== 'user';

const COLOR_BUCKETS = [
  { name: '红', hex: '#ef4444', hue: [345, 15] },
  { name: '橙', hex: '#f97316', hue: [16, 44] },
  { name: '黄', hex: '#eab308', hue: [45, 65] },
  { name: '绿', hex: '#22c55e', hue: [66, 165] },
  { name: '青', hex: '#06b6d4', hue: [166, 195] },
  { name: '蓝', hex: '#3b82f6', hue: [196, 255] },
  { name: '紫', hex: '#8b5cf6', hue: [256, 284] },
  { name: '粉', hex: '#ec4899', hue: [285, 344] },
  { name: '棕', hex: '#92400e', fixed: 'brown' },
  { name: '黑', hex: '#111827', fixed: 'black' },
  { name: '灰', hex: '#6b7280', fixed: 'gray' },
  { name: '白', hex: '#f8fafc', fixed: 'white' },
];

const DETAIL_LEVELS = ['简洁', '中等', '详细', '超详细'];

const THUMBNAIL_MIN = 148;
const THUMBNAIL_MAX = 320;
const THUMBNAIL_DEFAULT = THUMBNAIL_MIN;
const THUMBNAIL_CACHE_VERSION = 2;
const COLOR_ANALYSIS_VERSION = 2;
const IMAGE_THUMBNAIL_SIDE = 560;
const VIDEO_THUMBNAIL_WIDTH = 720;
const VIDEO_THUMBNAIL_HEIGHT = 440;
const AI_BATCH_CONCURRENCY = 5;
const RUNNINGHUB_LOGIN_URL = 'https://www.runninghub.cn/user-center/1931373230005592065/webapp?inviteCode=rh-v1316';
const PLUGIN_RELEASE_URL = 'https://github.com/CyrusChen213/cyrus-ai-asset-manager/releases/latest';
const AI_GROUP_QR_IMAGE = './community/ai-group-qr.png';
const RUNNINGHUB_GUIDE_IMAGES = [
  { src: './tutorials/runninghub/step-1.png', title: '第一步：登录后进入 API' },
  { src: './tutorials/runninghub/step-2.png', title: '第二步：选择 LLM' },
  { src: './tutorials/runninghub/step-3.png', title: '第三步：进入密钥' },
  { src: './tutorials/runninghub/step-4.png', title: '第四步：新建或复制 API Key' },
  { src: './tutorials/runninghub/step-5.png', title: '第五步：打开软件 AI 设置' },
  { src: './tutorials/runninghub/step-6.png', title: '第六步：选择 RunningHub 并粘贴密钥' },
  { src: './tutorials/runninghub/step-7.png', title: '第七步：获取模型、测试连接并保存' },
];

const EMPTY_FILTERS = {
  colors: [],
  tags: [],
  kinds: [],
  extensions: [],
  promptStatuses: [],
  orientations: [],
};

const KIND_OPTIONS = [
  { value: 'image', label: '图片' },
  { value: 'animation', label: '动图' },
  { value: 'video', label: '视频' },
  { value: 'file', label: '其他' },
];

const KIND_LABELS = Object.fromEntries(KIND_OPTIONS.map((item) => [item.value, item.label]));

const PROMPT_STATUS_OPTIONS = [
  { value: 'none', label: '未生成' },
  { value: 'pending', label: '待生成' },
  { value: 'generating', label: '生成中' },
  { value: 'generated', label: '已生成' },
  { value: 'failed', label: '生成失败' },
];

function isTypingTarget(target) {
  const tag = target?.tagName?.toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select' || target?.isContentEditable;
}

function useConfirmShortcut({ enabled = true, onConfirm, onCancel }) {
  useEffect(() => {
    if (!enabled) return undefined;
    function handleKeyDown(event) {
      if (event.isComposing || event.repeat) return;
      if (event.key === 'Escape' && onCancel) {
        event.preventDefault();
        event.stopPropagation();
        onCancel();
        return;
      }
      if (event.key === 'Enter' && !isTypingTarget(event.target) && onConfirm) {
        event.preventDefault();
        event.stopPropagation();
        onConfirm();
      }
    }
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [enabled, onConfirm, onCancel]);
}

const ORIENTATION_OPTIONS = [
  { value: 'landscape', label: '横图' },
  { value: 'portrait', label: '竖图' },
  { value: 'square', label: '方图' },
  { value: 'unknown', label: '未知尺寸' },
];

const SORT_OPTIONS = [
  { value: 'createdAt', label: '创建时间' },
  { value: 'updatedAt', label: '最近编辑' },
  { value: 'name', label: '文件名' },
  { value: 'size', label: '文件大小' },
  { value: 'resolution', label: '分辨率' },
  { value: 'extension', label: '格式' },
];

const RUNNINGHUB_LLM_BASE_URL = 'https://llm.runninghub.cn/v1';

const DEFAULT_AI_SETTINGS = {
  enabled: false,
  activeProfileId: 'default',
  profiles: [],
  provider: 'runninghub',
  baseUrl: RUNNINGHUB_LLM_BASE_URL,
  apiKey: '',
  model: 'bytedance/doubao-seed-2.0-pro',
  note: '',
};

const DEFAULT_ADS = [];
const DEFAULT_REMOTE_AD_SETTINGS = {
  configUrl: DEFAULT_REMOTE_ADS_URL,
  cachedAds: [],
  lastFetchedAt: '',
};
const DEFAULT_UPDATE_SETTINGS = {
  configUrl: DEFAULT_UPDATE_CONFIG_URL,
  lastCheckedAt: '',
  lastVersion: '',
};

function createAdItem(seed = {}) {
  return {
    id: seed.id || (window.crypto?.randomUUID?.() || `ad-${Date.now()}-${Math.random().toString(16).slice(2)}`),
    title: seed.title || '广告位',
    imagePath: seed.imagePath || '',
    imageUrl: seed.imageUrl || '',
    url: seed.url || seed.linkUrl || '',
    enabled: seed.enabled !== false,
    createdAt: seed.createdAt || new Date().toISOString(),
    updatedAt: seed.updatedAt || new Date().toISOString(),
  };
}

function normalizeAdSettings(items = []) {
  return (Array.isArray(items) ? items : [])
    .map((item) => createAdItem(item))
    .filter((item) => item.imagePath || item.imageUrl);
}

function normalizeRemoteAdSettings(settings = {}) {
  return {
    ...DEFAULT_REMOTE_AD_SETTINGS,
    ...(settings || {}),
    configUrl: String(settings?.configUrl || '').trim(),
    cachedAds: normalizeAdSettings(settings?.cachedAds || []),
    lastFetchedAt: settings?.lastFetchedAt || '',
  };
}

function resolveAdResourceUrl(value, baseUrl = '') {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^(https?:|data:|asset:)/i.test(raw)) return raw;
  if (!baseUrl) return raw;
  try {
    return new URL(raw, baseUrl).href;
  } catch {
    return raw;
  }
}

function normalizeRemoteAdConfig(payload, baseUrl = '') {
  const source = Array.isArray(payload) ? payload : payload?.ads;
  const ads = normalizeAdSettings(source || []).map((ad) => ({
    ...ad,
    imageUrl: resolveAdResourceUrl(ad.imageUrl || ad.imagePath, baseUrl),
    imagePath: '',
    url: resolveAdResourceUrl(ad.url, baseUrl),
  }));
  return {
    version: payload?.version || 1,
    updatedAt: payload?.updatedAt || '',
    ads,
  };
}

function normalizeUpdateSettings(settings = {}) {
  return {
    ...DEFAULT_UPDATE_SETTINGS,
    ...(settings || {}),
    configUrl: String(settings?.configUrl || DEFAULT_UPDATE_SETTINGS.configUrl || '').trim(),
    lastCheckedAt: settings?.lastCheckedAt || '',
    lastVersion: settings?.lastVersion || '',
  };
}

function formatVersionLabel(version) {
  const text = String(version || '').trim();
  if (!text) return 'v1.0';
  return `v${text.replace(/\.0$/, '')}`;
}

function createAiProfile(seed = {}) {
  const id = seed.id || (window.crypto?.randomUUID?.() || `ai-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  const hasCustomConfig = Boolean(seed.apiKey || seed.baseUrl || seed.model);
  const provider = seed.provider && (seed.provider !== 'openai-compatible' || hasCustomConfig)
    ? seed.provider
    : 'runninghub';
  return {
    id,
    name: seed.name || (provider === 'runninghub' ? 'RunningHub API' : '默认 API'),
    note: seed.note || '',
    provider,
    baseUrl: seed.baseUrl || (provider === 'runninghub' ? RUNNINGHUB_LLM_BASE_URL : ''),
    apiKey: seed.apiKey || '',
    model: seed.model || (provider === 'runninghub' ? 'bytedance/doubao-seed-2.0-pro' : ''),
  };
}

function normalizeAiSettings(settings = {}) {
  const legacyProfile = createAiProfile({
    id: settings.activeProfileId || 'default',
    name: settings.name || '默认 API',
    note: settings.note || '',
    provider: settings.provider,
    baseUrl: settings.baseUrl,
    apiKey: settings.apiKey,
    model: settings.model,
  });
  const profiles = (Array.isArray(settings.profiles) && settings.profiles.length ? settings.profiles : [legacyProfile])
    .map((profile, index) => createAiProfile({ ...profile, name: profile.name || `API ${index + 1}` }));
  const activeProfileId = profiles.some((profile) => profile.id === settings.activeProfileId)
    ? settings.activeProfileId
    : profiles[0]?.id || 'default';
  const active = profiles.find((profile) => profile.id === activeProfileId) || profiles[0] || legacyProfile;
  return {
    ...DEFAULT_AI_SETTINGS,
    ...active,
    enabled: settings.enabled === true,
    activeProfileId: active.id,
    profiles,
  };
}

function estimateAssetCardHeight(asset, thumbnailSize) {
  const width = Math.max(96, thumbnailSize || THUMBNAIL_DEFAULT);
  const ratio = asset.width && asset.height
    ? asset.width / asset.height
    : asset.kind === 'video'
      ? 16 / 9
      : 1;
  const thumbHeight = Math.max(52, width / Math.max(ratio, 0.18));
  return thumbHeight + 47;
}

function buildMasonryColumns(assets, thumbnailSize, stageWidth) {
  const availableWidth = Math.max(thumbnailSize, stageWidth || thumbnailSize);
  const columnCount = Math.max(1, Math.floor((availableWidth + 14) / Math.max(thumbnailSize + 14, 120)));
  const columns = Array.from({ length: columnCount }, () => ({ height: 0, assets: [] }));
  for (const asset of assets) {
    const target = columns.reduce((shortest, column) => (column.height < shortest.height ? column : shortest), columns[0]);
    target.assets.push(asset);
    target.height += estimateAssetCardHeight(asset, thumbnailSize) + 14;
  }
  return columns.map((column) => column.assets);
}

function assetUrl(filePath, cacheKey) {
  if (!filePath) return '';
  if (/^(https?:|data:|asset:)/i.test(filePath)) return cacheKey ? `${filePath}${filePath.includes('?') ? '&' : '?'}v=${encodeURIComponent(cacheKey)}` : filePath;
  const normalized = filePath.replace(/\\/g, '/');
  const url = encodeURI(`asset:///${normalized.replace(/^([A-Za-z]):/, '$1:')}`);
  return cacheKey ? `${url}?v=${encodeURIComponent(cacheKey)}` : url;
}

function adImageSrc(ad) {
  return ad?.imageUrl || assetUrl(ad?.imagePath || '');
}

function formatBytes(bytes) {
  if (bytes === null || bytes === undefined) return '-';
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = bytes;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }
  return `${size.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}

function formatDate(value) {
  if (!value) return '-';
  return new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}

function hslFromRgb(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  let h = 0;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s, l };
}

function colorNameFromRgb(r, g, b) {
  const { h, s, l } = hslFromRgb(r, g, b);
  if (l < 0.13) return '黑';
  if (l > 0.88 && s < 0.24) return '白';
  if (s < 0.16) return '灰';
  if (h >= 20 && h <= 45 && l < 0.42 && s > 0.2) return '棕';
  const bucket = COLOR_BUCKETS.find((item) => {
    if (!item.hue) return false;
    const [from, to] = item.hue;
    return from <= to ? h >= from && h <= to : h >= from || h <= to;
  });
  return bucket?.name || '灰';
}

function averageColorFromCanvas(canvas) {
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return null;
  const { width, height } = canvas;
  if (!width || !height) return null;
  const data = context.getImageData(0, 0, width, height).data;
  let r = 0;
  let g = 0;
  let b = 0;
  let count = 0;
  for (let index = 0; index < data.length; index += 16) {
    if (data[index + 3] < 20) continue;
    r += data[index];
    g += data[index + 1];
    b += data[index + 2];
    count += 1;
  }
  if (!count) return null;
  const avg = [Math.round(r / count), Math.round(g / count), Math.round(b / count)];
  return { hex: `#${avg.map((part) => part.toString(16).padStart(2, '0')).join('')}`, name: colorNameFromRgb(avg[0], avg[1], avg[2]) };
}

function dominantColorsFromCanvas(canvas, limit = 6) {
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context || !canvas.width || !canvas.height) return [];
  const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
  const buckets = new Map();
  for (let index = 0; index < data.length; index += 16) {
    if (data[index + 3] < 35) continue;
    const r = data[index];
    const g = data[index + 1];
    const b = data[index + 2];
    const name = colorNameFromRgb(r, g, b);
    const key = name;
    const current = buckets.get(key) || { name, r: 0, g: 0, b: 0, count: 0 };
    current.r += r;
    current.g += g;
    current.b += b;
    current.count += 1;
    buckets.set(key, current);
  }
  return [...buckets.values()]
    .filter((item) => item.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, limit)
    .map((item) => {
      const rgb = [
        Math.round(item.r / item.count),
        Math.round(item.g / item.count),
        Math.round(item.b / item.count),
      ];
      return {
        name: item.name,
        hex: `#${rgb.map((part) => part.toString(16).padStart(2, '0')).join('')}`,
        weight: item.count,
      };
    });
}

function normalizeHexColor(hex) {
  const value = String(hex || '').replace('#', '').trim();
  if (!/^[0-9a-f]{6}$/i.test(value)) return '';
  return `#${value.toLowerCase()}`;
}

function scoreFrame(canvas) {
  const color = averageColorFromCanvas(canvas);
  const colors = dominantColorsFromCanvas(canvas);
  if (!color) return { score: 0, color: null };
  const context = canvas.getContext('2d', { willReadFrequently: true });
  const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
  let brightness = 0;
  let variance = 0;
  const samples = [];
  for (let index = 0; index < data.length; index += 64) {
    const value = (data[index] + data[index + 1] + data[index + 2]) / 3;
    brightness += value;
    samples.push(value);
  }
  brightness /= Math.max(samples.length, 1);
  for (const sample of samples) variance += Math.abs(sample - brightness);
  variance /= Math.max(samples.length, 1);
  const tooDark = brightness < 18;
  const tooLight = brightness > 238;
  const tooFlat = variance < 9;
  return { score: (tooDark || tooLight ? 0 : 30) + Math.min(variance, 70) + (tooFlat ? -20 : 0), color, colors };
}

async function blobFromBinaryBuffer(binary) {
  return binary instanceof Blob ? binary : new Blob([binary]);
}

function mediaMimeFromPath(path) {
  const extension = path.split('.').pop()?.toLowerCase();
  const mimeByExtension = {
    mp4: 'video/mp4',
    m4v: 'video/mp4',
    webm: 'video/webm',
    mov: 'video/quicktime',
    mkv: 'video/x-matroska',
    avi: 'video/x-msvideo',
  };
  return mimeByExtension[extension] || 'video/mp4';
}

function videoBlobFromBinary(binary, path) {
  return new Blob([binary], { type: mediaMimeFromPath(path) });
}

function getPromptStatus(asset) {
  if (asset.promptStatus) return asset.promptStatus;
  if (asset.prompt?.zh?.startsWith('待接入 AI 提示词生成')) return 'pending';
  return asset.prompt ? 'generated' : 'none';
}

function isTrashedAsset(asset) {
  return !!asset?.deletedAt;
}

function trashDaysLeft(asset) {
  if (!asset?.deleteExpiresAt) return 30;
  const ms = Date.parse(asset.deleteExpiresAt) - Date.now();
  return Math.max(0, Math.ceil(ms / (24 * 60 * 60 * 1000)));
}

function getAssetOrientation(asset) {
  if (!asset.width || !asset.height) return 'unknown';
  const ratio = asset.width / asset.height;
  if (ratio > 1.12) return 'landscape';
  if (ratio < 0.88) return 'portrait';
  return 'square';
}

function getAssetTags(asset) {
  return [...new Set([...(asset.autoTags || []), ...(asset.userTags || [])]
    .map((tag) => String(tag || '').trim())
    .filter(Boolean))];
}

function buildFolderTree(folders = []) {
  const nodes = folders.map((folder) => ({ ...folder, children: [] }));
  const byId = new Map(nodes.map((folder) => [folder.id, folder]));
  const roots = [];
  for (const node of nodes) {
    const parent = node.parentId ? byId.get(node.parentId) : null;
    if (parent && parent.id !== node.id) parent.children.push(node);
    else roots.push(node);
  }
  return roots;
}

function flattenFolderTree(folders = []) {
  const result = [];
  function walk(items, depth = 0) {
    for (const folder of items) {
      result.push({ ...folder, depth });
      if (folder.children?.length) walk(folder.children, depth + 1);
    }
  }
  walk(buildFolderTree(folders));
  return result;
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

function folderOptionLabel(folder) {
  return `${'　'.repeat(folder.depth || 0)}${folder.depth ? '└ ' : ''}${folder.name}`;
}

function hasAiTags(asset) {
  return asset?.aiTagStatus === 'done'
    || !!asset?.aiTags?.generatedAt
    || (Array.isArray(asset?.aiTags?.tags) && asset.aiTags.tags.length > 0)
    || (Array.isArray(asset?.aiTags?.contentTags) && asset.aiTags.contentTags.length > 0);
}

function toggleFilterValue(filters, group, value) {
  const current = filters[group] || [];
  return {
    ...filters,
    [group]: current.includes(value) ? current.filter((item) => item !== value) : [...current, value],
  };
}

function isFilterMatch(selected, value) {
  return selected.length === 0 || selected.includes(value);
}

function getFilterChips(filters) {
  const chips = [];
  const optionLabels = {
    kinds: Object.fromEntries(KIND_OPTIONS.map((item) => [item.value, item.label])),
    promptStatuses: Object.fromEntries(PROMPT_STATUS_OPTIONS.map((item) => [item.value, item.label])),
    orientations: Object.fromEntries(ORIENTATION_OPTIONS.map((item) => [item.value, item.label])),
  };
  filters.colors.forEach((value) => chips.push({ group: 'colors', value, label: `颜色：${value}` }));
  filters.tags.forEach((value) => chips.push({ group: 'tags', value, label: `标签：${value}` }));
  filters.kinds.forEach((value) => chips.push({ group: 'kinds', value, label: `类型：${optionLabels.kinds[value] || value}` }));
  filters.extensions.forEach((value) => chips.push({ group: 'extensions', value, label: `格式：${value.replace('.', '').toUpperCase()}` }));
  filters.promptStatuses.forEach((value) => chips.push({ group: 'promptStatuses', value, label: `提示词：${optionLabels.promptStatuses[value] || value}` }));
  filters.orientations.forEach((value) => chips.push({ group: 'orientations', value, label: `尺寸：${optionLabels.orientations[value] || value}` }));
  return chips;
}

function getSortValue(asset, sortKey) {
  if (sortKey === 'createdAt') return new Date(asset.createdAt || 0).getTime();
  if (sortKey === 'updatedAt') return new Date(asset.updatedAt || asset.createdAt || 0).getTime();
  if (sortKey === 'name') return (asset.originalName || asset.name || '').toLowerCase();
  if (sortKey === 'size') return asset.size || 0;
  if (sortKey === 'resolution') return (asset.width || 0) * (asset.height || 0);
  if (sortKey === 'extension') return (asset.extension || '').toLowerCase();
  return 0;
}

function sortAssets(assets, sortState) {
  const direction = sortState.direction === 'asc' ? 1 : -1;
  return assets.map((asset, index) => ({ asset, index })).sort((aItem, bItem) => {
    const a = aItem.asset;
    const b = bItem.asset;
    const aValue = getSortValue(a, sortState.key);
    const bValue = getSortValue(b, sortState.key);
    if (typeof aValue === 'string' || typeof bValue === 'string') {
      const result = String(aValue).localeCompare(String(bValue), 'zh-CN', { numeric: true });
      return (result * direction) || aItem.index - bItem.index;
    }
    const result = ((aValue || 0) - (bValue || 0)) * direction;
    return result || aItem.index - bItem.index;
  }).map((item) => item.asset);
}

function normalizeDatabase(database) {
  if (!database?.assets) {
    if (!database) return database;
    const settings = database.settings || {};
    const ads = normalizeAdSettings(settings.ads || DEFAULT_ADS);
    const remoteAds = normalizeRemoteAdSettings(settings.remoteAds || {});
    if (ads === settings.ads && remoteAds === settings.remoteAds) return database;
    return {
      ...database,
      settings: {
        ...settings,
        ads,
        remoteAds,
      },
    };
  }
  let changed = false;
  const assets = database.assets.map((asset) => {
    const status = getPromptStatus(asset);
    const shouldFixStaticWebpKind = asset.extension === '.webp' && asset.kind === 'animation' && asset.animationDetected !== true;
    const shouldResetGeneratingPrompt = status === 'generating';
    if (asset.promptStatus === status && !(status === 'pending' && asset.prompt) && !shouldFixStaticWebpKind && !shouldResetGeneratingPrompt) return asset;
    changed = true;
    return {
      ...asset,
      kind: shouldFixStaticWebpKind ? 'image' : asset.kind,
      autoTags: shouldFixStaticWebpKind ? (asset.autoTags || []).filter((tag) => tag !== '动图') : asset.autoTags,
      prompt: (status === 'pending' && asset.prompt?.zh?.startsWith('待接入 AI 提示词生成')) || shouldResetGeneratingPrompt ? null : asset.prompt,
      promptStatus: shouldResetGeneratingPrompt ? 'none' : status,
      promptError: shouldResetGeneratingPrompt ? '' : asset.promptError,
      promptLevel: asset.promptLevel || asset.prompt?.level || '中等',
    };
  });
  const settings = database.settings || {};
  const ads = normalizeAdSettings(settings.ads || DEFAULT_ADS);
  const remoteAds = normalizeRemoteAdSettings(settings.remoteAds || {});
  if (changed || ads !== settings.ads || remoteAds !== settings.remoteAds) {
    return {
      ...database,
      assets,
      settings: {
        ...settings,
        ads,
        remoteAds,
      },
    };
  }
  return database;
}

function Onboarding({ onSelectExisting, onCreateNew }) {
  const [step, setStep] = useState('start');
  const [error, setError] = useState('');

  async function run(action) {
    setError('');
    const result = await action();
    if (result?.error) setError(result.message || '没有找到可用的素材库。');
  }

  return (
    <main className="onboarding">
      <section className="onboarding-panel">
        <div className="brand-mark"><Archive size={28} /></div>
        <h1>Cyrus Ai素材管理</h1>
        {step === 'start' && (
          <>
            <p>你之前是否已经创建过 Cyrus Ai 素材库？如果有，选择已有素材库即可恢复原来的素材、文件夹、标签和提示词。</p>
            <div className="onboarding-choice-grid">
              <button type="button" onClick={() => setStep('existing')}>
                <Folder size={18} />
                <strong>我已经有素材库</strong>
                <span>选择以前创建过的 Cyrus Ai 素材库。</span>
              </button>
              <button type="button" onClick={() => setStep('create')}>
                <FolderPlus size={18} />
                <strong>还没有，创建新库</strong>
                <span>选择一个本地文件夹，软件会创建新的素材库结构。</span>
              </button>
            </div>
          </>
        )}
        {step === 'existing' && (
          <>
            <p>请选择已有的 Cyrus Ai 素材库文件夹。正确的素材库里面会有 database、originals、thumbnails 等目录。</p>
            <div className="onboarding-actions">
              <button className="secondary-button" onClick={() => { setError(''); setStep('start'); }}>
                <ChevronLeft size={16} />
                返回
              </button>
              <button className="primary-button" onClick={() => run(onSelectExisting)}>
                <Folder size={18} />
                选择已有素材库
              </button>
            </div>
          </>
        )}
        {step === 'create' && (
          <>
            <p>请选择一个本地文件夹来创建新素材库。软件会在里面创建 originals、thumbnails、database、backups 等目录。</p>
            <div className="onboarding-actions">
              <button className="secondary-button" onClick={() => { setError(''); setStep('start'); }}>
                <ChevronLeft size={16} />
                返回
              </button>
              <button className="primary-button" onClick={() => run(onCreateNew)}>
                <FolderPlus size={18} />
                创建新素材库
              </button>
            </div>
          </>
        )}
        {error && <p className="onboarding-error">{error}</p>}
        <p className="tiny-copy">默认自动保存来源信息；商用前请确认素材授权。</p>
      </section>
    </main>
  );
}

function Sidebar({ folders, selectedFolderId, onSelectFolder, onCreateFolder, onRenameFolder, onDeleteFolder, onDropToFolder, onContextMenuFolder, onBlankPointerDown, stats, thumbnailSize, onThumbnailSize }) {
  const [dragFolderId, setDragFolderId] = useState(null);
  const [collapsedFolderIds, setCollapsedFolderIds] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('assetVaultCollapsedFolders') || '[]');
    } catch {
      return [];
    }
  });
  const folderRows = useMemo(() => {
    const collapsed = new Set(collapsedFolderIds);
    const rows = [];
    function walk(items, depth = 0) {
      for (const folder of items) {
        const hasChildren = !!folder.children?.length;
        const isCollapsed = collapsed.has(folder.id);
        rows.push({ ...folder, depth, hasChildren, isCollapsed });
        if (hasChildren && !isCollapsed) walk(folder.children, depth + 1);
      }
    }
    walk(buildFolderTree(folders));
    return rows;
  }, [folders, collapsedFolderIds]);

  useEffect(() => {
    localStorage.setItem('assetVaultCollapsedFolders', JSON.stringify(collapsedFolderIds));
  }, [collapsedFolderIds]);

  function getDroppedPaths(event) {
    return Array.from(event.dataTransfer.files || []).map((file) => window.assetVaultFile?.getPath?.(file)).filter(Boolean);
  }

  function handleFolderDrop(event, folderId) {
    event.preventDefault();
    event.stopPropagation();
    setDragFolderId(null);
    const assetIdsText = event.dataTransfer.getData('application/x-asset-vault-assets');
    if (assetIdsText) {
      try {
        const assetIds = JSON.parse(assetIdsText);
        if (Array.isArray(assetIds) && assetIds.length) {
          onDropToFolder(folderId, [], assetIds);
          return;
        }
      } catch {}
    }
    const paths = getDroppedPaths(event);
    if (paths.length) onDropToFolder(folderId, paths, null);
  }

  function toggleFolderCollapse(event, folder) {
    event.preventDefault();
    event.stopPropagation();
    if (!folder.hasChildren) return;
    setCollapsedFolderIds((current) => (
      current.includes(folder.id)
        ? current.filter((id) => id !== folder.id)
        : [...current, folder.id]
    ));
  }

  return (
    <aside
      className="sidebar"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onBlankPointerDown?.(event);
      }}
    >
      <nav className="nav-section">
        <button className={`nav-item ${selectedFolderId === 'all' ? 'active' : ''}`} onClick={() => onSelectFolder('all')}>
          <ImageIcon size={17} /> 全部素材 <span>{stats.total}</span>
        </button>
        <button className={`nav-item ${selectedFolderId === 'unprompted' ? 'active' : ''}`} onClick={() => onSelectFolder('unprompted')}>
          <Sparkles size={17} /> 未生成提示词 <span>{stats.unprompted}</span>
        </button>
        <button className={`nav-item ${selectedFolderId === 'untagged' ? 'active' : ''}`} onClick={() => onSelectFolder('untagged')}>
          <Tags size={17} /> 未Ai打标签 <span>{stats.untagged}</span>
        </button>
      </nav>
      <section
        className="nav-section"
        onPointerDown={(event) => {
          if (event.target === event.currentTarget) onBlankPointerDown?.(event);
        }}
      >
        <div className="section-title">
          <span>文件夹</span>
          <button className="icon-button" title="新建文件夹" onClick={() => onCreateFolder(null)}><FolderPlus size={16} /></button>
        </div>
        {folderRows.map((folder) => (
          <div
            className={`folder-row ${selectedFolderId === folder.id ? 'active' : ''} ${dragFolderId === folder.id ? 'drop-hover' : ''}`}
            key={folder.id}
            style={{ '--folder-depth': folder.depth || 0 }}
            onDragEnter={(event) => {
              if (!event.dataTransfer?.types?.includes('Files')) return;
              event.preventDefault();
              setDragFolderId(folder.id);
            }}
            onDragOver={(event) => {
              if (!event.dataTransfer?.types?.includes('Files')) return;
              event.preventDefault();
              event.dataTransfer.dropEffect = 'copy';
            }}
            onDragLeave={(event) => {
              if (event.currentTarget.contains(event.relatedTarget)) return;
              setDragFolderId(null);
            }}
            onDrop={(event) => handleFolderDrop(event, folder.id)}
            onContextMenu={(event) => {
              event.preventDefault();
              onContextMenuFolder?.(event, folder);
            }}
          >
            <button
              onClick={() => onSelectFolder(folder.id)}
              onDoubleClick={(event) => {
                if (folder.isDefault) return;
                event.preventDefault();
                onRenameFolder(folder.id);
              }}
            >
              <span
                className={`folder-caret ${folder.hasChildren ? '' : 'empty'}`}
                onClick={(event) => toggleFolderCollapse(event, folder)}
                title={folder.hasChildren ? (folder.isCollapsed ? '展开子文件夹' : '折叠子文件夹') : ''}
              >
                {folder.hasChildren ? (folder.isCollapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />) : null}
              </span>
              <Folder size={16} />
              <span className="folder-name">{folder.name}</span>
              <em>{stats.byFolder[folder.id] || 0}</em>
            </button>
            <div className="row-actions">
              <button title="新建子文件夹" onClick={() => onCreateFolder(folder.id)}><FolderPlus size={13} /></button>
              {!folder.isDefault && (
                <>
                <button title="重命名" onClick={() => onRenameFolder(folder.id)}><Pencil size={13} /></button>
                <button title="删除文件夹" onClick={() => onDeleteFolder(folder.id)}><Trash2 size={13} /></button>
                </>
              )}
            </div>
          </div>
        ))}
      </section>
      <section className="nav-section display-section">
        <div className="sidebar-zoom-control">
          <div>
            <span>列宽</span>
            <em>{thumbnailSize}px</em>
          </div>
          <input
            type="range"
            min={THUMBNAIL_MIN}
            max={THUMBNAIL_MAX}
            step="2"
            value={thumbnailSize}
            onInput={(event) => onThumbnailSize(Number(event.currentTarget.value))}
            onChange={(event) => onThumbnailSize(Number(event.currentTarget.value))}
          />
        </div>
      </section>
    </aside>
  );
}

function FilterGroup({ title, children }) {
  return (
    <section className="filter-group">
      <div className="filter-group-title">{title}</div>
      {children}
    </section>
  );
}

function TagFilterPicker({ tags, selectedTags, onToggleTag, onClearTags }) {
  const [open, setOpen] = useState(false);
  const [tagQuery, setTagQuery] = useState('');
  const pickerRef = useRef(null);
  const selectedSet = new Set(selectedTags);
  const filteredTags = tags
    .filter((tag) => tag.name.toLowerCase().includes(tagQuery.trim().toLowerCase()))
    .sort((a, b) => {
      const selectedScore = Number(selectedSet.has(b.name)) - Number(selectedSet.has(a.name));
      if (selectedScore) return selectedScore;
      return b.count - a.count || a.name.localeCompare(b.name, 'zh-CN');
    })
    .slice(0, 80);

  useEffect(() => {
    if (!open) return undefined;
    function handlePointerDown(event) {
      if (!pickerRef.current?.contains(event.target)) setOpen(false);
    }
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [open]);

  return (
    <div className="tag-filter" ref={pickerRef}>
      <button className={`tag-filter-trigger ${selectedTags.length ? 'active' : ''}`} onClick={() => setOpen((value) => !value)}>
        <strong>标签</strong>
        <span>{selectedTags.length ? `已选 ${selectedTags.length}` : '智能 / 手动标签'}</span>
        <em>选择</em>
        <ChevronDown size={14} />
      </button>
      {open && (
        <div className="tag-filter-popover">
          <div className="tag-filter-search">
            <Search size={15} />
            <input value={tagQuery} onChange={(event) => setTagQuery(event.target.value)} placeholder="搜索标签" autoFocus />
          </div>
          <div className="tag-filter-selected">
            {selectedTags.length ? selectedTags.map((tag) => (
              <button key={tag} onClick={() => onToggleTag(tag)}>{tag}<X size={12} /></button>
            )) : <span>可以筛选智能标签和手动标签</span>}
          </div>
          <div className="tag-filter-list">
            {filteredTags.length ? filteredTags.map((tag) => (
              <button className={selectedSet.has(tag.name) ? 'active' : ''} key={tag.name} onClick={() => onToggleTag(tag.name)}>
                <span>{tag.name}</span>
                <em>{tag.count}</em>
              </button>
            )) : <div className="filter-empty">没有匹配的标签</div>}
          </div>
          <div className="tag-filter-actions">
            <button onClick={onClearTags} disabled={!selectedTags.length}>清空标签</button>
            <button onClick={() => setOpen(false)}>完成</button>
          </div>
        </div>
      )}
    </div>
  );
}

function normalizeExternalUrl(url) {
  const value = String(url || '').trim();
  if (!value) return '';
  return /^https?:\/\//i.test(value) ? value : `https://${value}`;
}

function AdBanner({ ads, onOpenExternal }) {
  const activeAds = useMemo(() => normalizeAdSettings(ads).filter((ad) => ad.enabled), [ads]);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (!activeAds.length) return undefined;
    setIndex((current) => current % activeAds.length);
    if (activeAds.length <= 1) return undefined;
    const timer = setInterval(() => {
      setIndex((current) => (current + 1) % activeAds.length);
    }, 5200);
    return () => clearInterval(timer);
  }, [activeAds.length]);

  if (!activeAds.length) {
    return (
      <div className="ad-banner empty" title="暂无广告内容">
        <ImageIcon size={15} />
        广告位
      </div>
    );
  }

  const ad = activeAds[index] || activeAds[0];
  async function openAd() {
    const url = normalizeExternalUrl(ad.url);
    if (url) await onOpenExternal?.(url);
  }

  return (
    <div className="ad-banner filled">
      <button className="ad-banner-link" title={ad.url ? `打开：${ad.url}` : '这条广告未填写跳转链接'} onClick={openAd}>
        <img src={adImageSrc(ad)} alt="" />
      </button>
      {activeAds.length > 1 && (
        <div className="ad-banner-dots">
          {activeAds.map((item, dotIndex) => <span className={dotIndex === index ? 'active' : ''} key={item.id} />)}
        </div>
      )}
    </div>
  );
}

function AppTitlebar({ query, onQuery, onImport, onExportLibrary, onImportLibrary, onOpenSettings, onOpenRhGuide, onToggleTheme, theme, filters, onToggleFilter, onClearFilters, filterOptions, viewMode, onToggleViewMode, onOpenTrash, trashActive, trashCount }) {
  const [filterOpen, setFilterOpen] = useState(false);
  const [importMenuOpen, setImportMenuOpen] = useState(false);
  const filterRef = useRef(null);
  const importMenuRef = useRef(null);
  const activeFilterCount = getFilterChips(filters).length;

  useEffect(() => {
    if (!filterOpen) return undefined;
    function handlePointerDown(event) {
      if (!filterRef.current?.contains(event.target)) setFilterOpen(false);
    }
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [filterOpen]);

  useEffect(() => {
    if (!importMenuOpen) return undefined;
    function handlePointerDown(event) {
      if (!importMenuRef.current?.contains(event.target)) setImportMenuOpen(false);
    }
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [importMenuOpen]);

  function runImportAction(action) {
    setImportMenuOpen(false);
    action();
  }

  return (
    <header className="topbar">
      <div className="title-brand">
        <Archive size={22} />
        <strong>Cyrus Ai素材管理</strong>
      </div>
      <div className="title-spacer" />
      <div className="topbar-search-tools">
        <div className="search-box">
          <Search size={18} />
          <input value={query} onChange={(event) => onQuery(event.target.value)} placeholder="搜索：动漫 蓝色 海报 / 格式:webp / ship png" />
        </div>
        <button className={`icon-tool trash-tool ${trashActive ? 'active' : ''}`} title="回收站" onClick={onOpenTrash}>
          <Trash2 size={16} />
          {trashCount > 0 && <span>{trashCount > 99 ? '99+' : trashCount}</span>}
        </button>
        <div className="filter-anchor" ref={filterRef}>
          <button className={`icon-tool filter-button ${activeFilterCount ? 'active' : ''}`} title="筛选" onClick={() => setFilterOpen((value) => !value)}>
            <SlidersHorizontal size={16} />
            {activeFilterCount > 0 && <span>{activeFilterCount}</span>}
          </button>
          {filterOpen && (
            <div className="filter-popover">
              <div className="filter-popover-head">
                <strong>叠加筛选</strong>
                <button onClick={onClearFilters} disabled={!activeFilterCount}>清除</button>
              </div>
              <FilterGroup title="类型">
                <div className="filter-pills">
                  {KIND_OPTIONS.map((option) => (
                    <button
                      className={filters.kinds.includes(option.value) ? 'active' : ''}
                      key={option.value}
                      onClick={() => onToggleFilter('kinds', option.value)}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </FilterGroup>
              <FilterGroup title="格式">
                <div className="filter-pills compact">
                  {filterOptions.extensions.length ? filterOptions.extensions.map((extension) => (
                    <button
                      className={filters.extensions.includes(extension) ? 'active' : ''}
                      key={extension}
                      onClick={() => onToggleFilter('extensions', extension)}
                    >
                      {extension.replace('.', '').toUpperCase()}
                    </button>
                  )) : <span className="filter-empty">暂无可筛选格式</span>}
                </div>
              </FilterGroup>
              <FilterGroup title="颜色">
                <div className="filter-colors">
                  {COLOR_BUCKETS.map((color) => (
                    <button
                      className={filters.colors.includes(color.name) ? 'active' : ''}
                      key={color.name}
                      onClick={() => onToggleFilter('colors', color.name)}
                      title={color.name}
                    >
                      <span style={{ backgroundColor: color.hex }} />
                      {color.name}
                    </button>
                  ))}
                </div>
              </FilterGroup>
              <FilterGroup title="标签">
                <TagFilterPicker
                  tags={filterOptions.tags}
                  selectedTags={filters.tags}
                  onToggleTag={(tag) => onToggleFilter('tags', tag)}
                  onClearTags={() => onClearFilters({ only: 'tags' })}
                />
              </FilterGroup>
              <FilterGroup title="提示词">
                <div className="filter-pills">
                  {PROMPT_STATUS_OPTIONS.map((option) => (
                    <button
                      className={filters.promptStatuses.includes(option.value) ? 'active' : ''}
                      key={option.value}
                      onClick={() => onToggleFilter('promptStatuses', option.value)}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </FilterGroup>
              <FilterGroup title="画面">
                <div className="filter-pills">
                  {ORIENTATION_OPTIONS.map((option) => (
                    <button
                      className={filters.orientations.includes(option.value) ? 'active' : ''}
                      key={option.value}
                      onClick={() => onToggleFilter('orientations', option.value)}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </FilterGroup>
            </div>
          )}
        </div>
      </div>
      <div className="topbar-actions">
        <div className="view-switch">
          <button
            className="active"
            title={viewMode === 'masonry' ? '切换到列表视图' : '切换到瀑布流视图'}
            onClick={onToggleViewMode}
          >
            {viewMode === 'masonry' ? <Columns3 size={17} /> : <List size={17} />}
          </button>
        </div>
        <button className="ghost-button icon-only" title="AI 设置" onClick={onOpenSettings}><Settings size={17} /></button>
        <button className="ghost-button rh-guide-button" title="接入Ai指南" onClick={onOpenRhGuide}>
          <BookOpen size={16} />
          接入Ai指南
        </button>
        <button className="ghost-button" onClick={onToggleTheme}>{theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}{theme === 'dark' ? '浅色' : '暗色'}</button>
        <div className="import-menu-anchor" ref={importMenuRef}>
          <button className="primary-button import-button" onClick={() => setImportMenuOpen((value) => !value)}>
            <Import size={17} /> 导入/导出 <ChevronDown size={15} />
          </button>
          {importMenuOpen && (
            <div className="import-menu">
              <button onClick={() => runImportAction(onImport)}>导入素材</button>
              <button onClick={() => runImportAction(onExportLibrary)}>导出数据迁移</button>
              <button onClick={() => runImportAction(onImportLibrary)}>导入迁移的数据</button>
            </div>
          )}
        </div>
        <div className="window-actions">
          <button title="最小化" onClick={() => window.assetVault.minimizeWindow()}><Minus size={18} /></button>
          <button title="最大化" onClick={() => window.assetVault.toggleMaximizeWindow()}><Maximize2 size={17} /></button>
          <button title="关闭" onClick={() => window.assetVault.closeWindow()}><X size={18} /></button>
        </div>
      </div>
    </header>
  );
}

function SortMenu({ sortState, onSortChange }) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef(null);
  const current = SORT_OPTIONS.find((item) => item.value === sortState.key) || SORT_OPTIONS[0];

  useEffect(() => {
    if (!open) return undefined;
    function handlePointerDown(event) {
      if (!menuRef.current?.contains(event.target)) setOpen(false);
    }
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [open]);

  function choose(option) {
    onSortChange((currentState) => ({
      key: option.value,
      direction: currentState.key === option.value && currentState.direction === 'desc' ? 'asc' : 'desc',
    }));
    setOpen(false);
  }

  return (
    <div className="sort-menu" ref={menuRef}>
      <button className="sort-button" onClick={() => setOpen((value) => !value)}>
        {current.label}{sortState.direction === 'desc' ? ' ↓' : ' ↑'} <ChevronDown size={14} />
      </button>
      {open && (
        <div className="sort-popover">
          {SORT_OPTIONS.map((option) => (
            <button className={sortState.key === option.value ? 'active' : ''} key={option.value} onClick={() => choose(option)}>
              <span>{option.label}</span>
              {sortState.key === option.value && <em>{sortState.direction === 'desc' ? '降序' : '升序'}</em>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function CollectionHeader({ count, title = '全部素材', subtitle = null, filterChips, onRemoveFilter, onClearFilters, hasQuery, sortState, onSortChange, importProgress }) {
  const hasFilters = filterChips.length > 0 || hasQuery;
  return (
    <div className="collection-header">
      <ImportProgressStrip progress={importProgress} />
      <div className="collection-meta">
        {filterChips.map((chip) => (
          <button className="filter-chip" key={`${chip.group}-${chip.value}`} onClick={() => onRemoveFilter(chip.group, chip.value)}>
            {chip.label}<X size={12} />
          </button>
        ))}
        {hasQuery && <span className="filter-chip muted">含搜索词</span>}
        <SortMenu sortState={sortState} onSortChange={onSortChange} />
        {hasFilters && <button onClick={onClearFilters}>清除筛选</button>}
      </div>
    </div>
  );
}

function ImportProgressStrip({ progress }) {
  if (!progress || progress.state === 'idle') return null;
  const total = progress.total || 0;
  const completed = progress.completed || 0;
  const success = progress.success || 0;
  const failed = progress.failed || 0;
  const remaining = Math.max(0, total - completed);
  const percent = total ? Math.min(100, Math.round((completed / total) * 100)) : 0;
  const done = progress.state === 'done';
  const labelText = progress.source?.includes('local') ? '\u672c\u5730\u5bfc\u5165' : '\u7f51\u9875\u6536\u96c6';

  return (
    <div className={`import-progress-strip ${done ? 'done' : ''} ${failed ? 'has-failed' : ''}`}>
      <div className="import-progress-text">
        <strong>{done ? `${labelText}\u5b8c\u6210` : `${labelText}\u4e2d`}</strong>
        <span>{`\u5171 ${total} \u5f20 \u00b7 \u5df2\u5b8c\u6210 ${completed} \u00b7 \u5269\u4f59 ${remaining} \u00b7 \u6210\u529f ${success} \u00b7 \u5931\u8d25 ${failed}`}</span>
      </div>
      <div className="import-progress-track" aria-hidden="true">
        <i style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
  const label = progress.source?.includes('local') ? '本地导入' : '网页收集';

  return (
    <div className={`import-progress-strip ${done ? 'done' : ''} ${failed ? 'has-failed' : ''}`}>
      <div className="import-progress-text">
        <strong>{done ? `${label}完成` : `${label}中`}</strong>
        <span>共 {total} 张 · 已完成 {completed} · 剩余 {remaining} · 成功 {success} · 失败 {failed}</span>
      </div>
      <div className="import-progress-track" aria-hidden="true">
        <i style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

function BatchBar({ count, isExiting = false, trashMode = false, onClear, onDelete, onRestore, onExport, onSelectAll, onAiTags, onReversePrompts, aiBusy, promptBusy }) {
  const [promptLevel, setPromptLevel] = useState('中等');
  const actionBusy = aiBusy || promptBusy;

  return (
    <div className={`batch-bar ${isExiting ? 'is-exiting' : ''}`}>
      <span><CheckSquare size={15} /> 已选 {count} 个</span>
      <div className="batch-tools">
        {trashMode ? (
          <>
            <button className="ghost-button" onClick={onRestore}><RefreshCw size={14} /> 恢复选中</button>
            <button className="ghost-button" onClick={onSelectAll}>全选</button>
            <button className="ghost-button" onClick={onClear}>取消选择</button>
            <button className="danger-button" onClick={onDelete}><Trash2 size={15} /> 永久删除</button>
          </>
        ) : (
          <>
        <button className="ghost-button" onClick={onExport}>导出</button>
        <button className="ghost-button" onClick={onAiTags} disabled={actionBusy}><Sparkles size={14} /> {aiBusy ? '生成中' : 'AI 标签'}</button>
        <label className="batch-prompt-control">反推
          <select value={promptLevel} onChange={(event) => setPromptLevel(event.target.value)} disabled={actionBusy}>
            {DETAIL_LEVELS.map((level) => <option key={level} value={level}>{level}</option>)}
          </select>
          <button className="ghost-button" onClick={() => onReversePrompts(promptLevel)} disabled={actionBusy}>
            <WandSparkles size={14} /> {promptBusy ? '反推中' : '批量反推'}
          </button>
        </label>
        <button className="ghost-button" onClick={onSelectAll}>全选</button>
        <button className="ghost-button" onClick={onClear}>取消选择</button>
        <button className="danger-button" onClick={onDelete}><Trash2 size={15} /> 删除选中</button>
          </>
        )}
      </div>
    </div>
  );
}

function AssetGrid({
  assets,
  selectedId,
  selectedIds,
  onSelect,
  onToggleSelect,
  onRangeSelect,
  onBoxSelect,
  onOpenPreview,
  viewMode = 'masonry',
  thumbnailSize,
  onThumbnailSize,
  onDropImport,
  onAssetDragStart,
  onContextMenuAsset,
  restoreAssetId,
  onRestoredAsset,
}) {
  const stageRef = useRef(null);
  const [selectionBox, setSelectionBox] = useState(null);
  const [stageWidth, setStageWidth] = useState(0);
  const masonryColumns = useMemo(() => buildMasonryColumns(assets, thumbnailSize, stageWidth), [assets, thumbnailSize, stageWidth]);

  function handleWheel(event) {
    if (!event.ctrlKey) return;
    event.preventDefault();
    const direction = event.deltaY > 0 ? -1 : 1;
    const delta = Math.max(4, Math.min(18, Math.round(Math.abs(event.deltaY) / 8))) * direction;
    onThumbnailSize((current) => Math.max(THUMBNAIL_MIN, Math.min(THUMBNAIL_MAX, current + delta)));
  }

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return undefined;
    function handleWindowWheel(event) {
      if (!event.ctrlKey) return;
      const rect = stage.getBoundingClientRect();
      const insideStage = event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom;
      if (!insideStage) return;
      handleWheel(event);
    }
    window.addEventListener('wheel', handleWindowWheel, { passive: false });
    return () => window.removeEventListener('wheel', handleWindowWheel);
  }, [thumbnailSize]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return undefined;
    const updateWidth = () => setStageWidth(stage.clientWidth);
    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(stage);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!restoreAssetId) return;
    const stage = stageRef.current;
    if (!stage) return;
    let cancelled = false;
    let frame = 0;
    let attempts = 0;
    const restore = () => {
      if (cancelled) return;
      attempts += 1;
      const element = stage.querySelector(`[data-asset-id="${restoreAssetId}"]`);
      if (element) {
        element.scrollIntoView({ block: 'center', inline: 'nearest' });
        onSelect?.(restoreAssetId);
        onRestoredAsset?.();
        return;
      }
      if (attempts > 24) {
        onRestoredAsset?.();
        return;
      }
      frame = window.requestAnimationFrame(restore);
    };
    frame = window.requestAnimationFrame(() => {
      frame = window.requestAnimationFrame(restore);
    });
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frame);
    };
  }, [restoreAssetId, assets, stageWidth, onRestoredAsset, onSelect]);

  function handleDrop(event) {
    event.preventDefault();
    if (event.dataTransfer.getData('application/x-asset-vault-assets')) return;
    const paths = Array.from(event.dataTransfer.files || []).map((file) => window.assetVaultFile?.getPath?.(file)).filter(Boolean);
    if (paths.length) onDropImport(paths);
  }

  function handlePointerDown(event) {
    if (event.target.closest('button, input, select, textarea, video, .free-crop-box, .free-crop-handle')) return;
    if (event.button !== 0 || event.target.closest('.asset-card, .asset-list-row')) return;
    const stage = stageRef.current;
    if (!stage) return;
    const stageRect = stage.getBoundingClientRect();
    const start = { x: event.clientX, y: event.clientY };
    let dragging = false;

    function updateBox(currentEvent) {
      const left = Math.min(start.x, currentEvent.clientX);
      const top = Math.min(start.y, currentEvent.clientY);
      const right = Math.max(start.x, currentEvent.clientX);
      const bottom = Math.max(start.y, currentEvent.clientY);
      if (!dragging && (Math.abs(currentEvent.clientX - start.x) > 4 || Math.abs(currentEvent.clientY - start.y) > 4)) dragging = true;
      if (!dragging) return;
      setSelectionBox({
        left: left - stageRect.left + stage.scrollLeft,
        top: top - stageRect.top + stage.scrollTop,
        width: right - left,
        height: bottom - top,
      });
    }

    function finishBox(upEvent) {
      document.removeEventListener('pointermove', updateBox);
      document.removeEventListener('pointerup', finishBox);
      if (dragging) {
        const left = Math.min(start.x, upEvent.clientX);
        const top = Math.min(start.y, upEvent.clientY);
        const right = Math.max(start.x, upEvent.clientX);
        const bottom = Math.max(start.y, upEvent.clientY);
        const selected = assets.filter((asset) => {
          const element = stage.querySelector(`[data-asset-id="${asset.id}"]`);
          if (!element) return false;
          const rect = element.getBoundingClientRect();
          return rect.left < right && rect.right > left && rect.top < bottom && rect.bottom > top;
        }).map((asset) => asset.id);
        onBoxSelect(selected, upEvent.ctrlKey || upEvent.metaKey);
      } else if (!upEvent.ctrlKey && !upEvent.metaKey && !upEvent.shiftKey) {
        onBoxSelect([], false);
      }
      setSelectionBox(null);
    }

    document.addEventListener('pointermove', updateBox);
    document.addEventListener('pointerup', finishBox);
  }

  return (
    <section
      className={`asset-stage ${selectionBox ? 'is-box-selecting' : ''} ${selectedIds.length > 1 ? 'is-multi-selecting' : ''}`}
      ref={stageRef}
      onPointerDown={handlePointerDown}
      onDragOver={(event) => event.preventDefault()}
      onDrop={handleDrop}
    >
      {assets.length === 0 ? (
        <div className="empty-state">
          <ImageIcon size={38} />
          <h3>还没有匹配的素材</h3>
          <p>拖拽图片、GIF 或视频到这里，或者点击右上角导入。按住 Ctrl + 鼠标滚轮可以调整瀑布流列宽。</p>
        </div>
      ) : viewMode === 'list' ? (
        <div className="asset-list-view">
          <div className="asset-list-head">
            <span>素材</span>
            <span>类型</span>
            <span>尺寸</span>
            <span>大小</span>
            <span>标签</span>
            <span>来源</span>
          </div>
          {assets.map((asset) => {
            const isSelected = selectedIds.includes(asset.id) || selectedId === asset.id;
            const isMultiMode = selectedIds.length > 1;
            const isMultiSelected = isMultiMode && selectedIds.includes(asset.id);
            const thumbSrc = asset.kind === 'video'
              ? (asset.thumbnail ? assetUrl(asset.thumbnail, asset.thumbnailVersion || 1) : '')
              : assetUrl(asset.path);
            const tags = getAssetTags(asset);
            const sourceLabel = asset.source?.type === 'web' ? '网页收集' : asset.source?.type === 'edited-copy' ? '编辑副本' : '本地导入';
            return (
              <button
                key={asset.id}
                data-asset-id={asset.id}
                className={`asset-list-row ${isSelected ? 'selected' : ''}`}
                draggable
                onDragStart={(event) => onAssetDragStart?.(event, asset)}
                onClick={(event) => {
                  if (event.shiftKey) {
                    onRangeSelect(asset.id);
                    return;
                  }
                  if (event.ctrlKey || event.metaKey) {
                    onToggleSelect(asset.id);
                    return;
                  }
                  onSelect(asset.id);
                }}
                onDoubleClick={() => onOpenPreview(asset.id)}
                onContextMenu={(event) => onContextMenuAsset(event, asset)}
              >
                <span
                  className={`asset-select-dot ${isMultiMode ? 'multi-mode' : ''} ${isMultiSelected ? 'active' : ''} ${isSelected && !isMultiMode ? 'single-selected' : ''}`}
                  title={isSelected ? '取消选择' : '加入选择'}
                  onClick={(event) => {
                    event.stopPropagation();
                    onToggleSelect(asset.id);
                  }}
                />
                <span className="asset-list-main">
                  <span className="asset-list-thumb">
                    {asset.kind === 'video' ? (
                      asset.thumbnail ? <img loading="lazy" src={thumbSrc} alt={asset.name} /> : <Video size={20} />
                    ) : (
                      <img loading="lazy" src={thumbSrc} alt={asset.name} />
                    )}
                  </span>
                  <span className="asset-list-name">
                    <strong title={asset.originalName || asset.name}>{asset.originalName || asset.name}</strong>
                    <em>{asset.extension?.replace('.', '').toUpperCase() || '未知'} · {formatDate(asset.createdAt)}</em>
                  </span>
                </span>
                <span>{KIND_LABELS[asset.kind] || asset.kind || '素材'}</span>
                <span>{asset.width && asset.height ? `${asset.width} x ${asset.height}` : '未知'}</span>
                <span>{formatBytes(asset.size)}</span>
                <span className="asset-list-tags">{tags.length ? tags.slice(0, 3).join(' / ') : '未打标签'}</span>
                <span>{sourceLabel}</span>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="asset-grid" style={{ '--thumbnail-size': `${thumbnailSize}px` }}>
          {masonryColumns.map((column, columnIndex) => (
            <div className="asset-column" key={`column-${columnIndex}`}>
              {column.map((asset) => {
            const isSelected = selectedIds.includes(asset.id) || selectedId === asset.id;
            const isMultiMode = selectedIds.length > 1;
            const isMultiSelected = isMultiMode && selectedIds.includes(asset.id);
            const thumbSrc = asset.kind === 'video'
              ? (asset.thumbnail ? assetUrl(asset.thumbnail, asset.thumbnailVersion || 1) : '')
              : assetUrl(asset.path);
            const thumbAspectRatio = asset.width && asset.height
              ? `${asset.width} / ${asset.height}`
              : asset.kind === 'video'
                ? '16 / 9'
                : '1 / 1';
            const color = asset.colors?.[0];
            return (
              <button
                key={asset.id}
                data-asset-id={asset.id}
                className={`asset-card ${isSelected ? 'selected' : ''}`}
                draggable
                onDragStart={(event) => onAssetDragStart?.(event, asset)}
                onClick={(event) => {
                  if (event.shiftKey) {
                    onRangeSelect(asset.id);
                    return;
                  }
                  if (event.ctrlKey || event.metaKey) {
                    onToggleSelect(asset.id);
                    return;
                  }
                  onSelect(asset.id);
                }}
                onDoubleClick={() => onOpenPreview(asset.id)}
                onContextMenu={(event) => onContextMenuAsset(event, asset)}
              >
                <span
                  className={`asset-select-dot ${isMultiMode ? 'multi-mode' : ''} ${isMultiSelected ? 'active' : ''} ${isSelected && !isMultiMode ? 'single-selected' : ''}`}
                  title={isSelected ? '取消选择' : '加入选择'}
                  onClick={(event) => {
                    event.stopPropagation();
                    onToggleSelect(asset.id);
                  }}
                />
                <div className="thumb" style={{ aspectRatio: thumbAspectRatio }}>
                  {asset.kind === 'video' ? (
                    asset.thumbnail ? <img loading="lazy" src={thumbSrc} alt={asset.name} /> : <div className="video-placeholder"><Video size={34} /><span>封面生成中</span></div>
                  ) : (
                    <img loading="lazy" src={thumbSrc} alt={asset.name} />
                  )}
                  <span className="kind-badge">{asset.kind === 'video' ? '视频' : asset.kind === 'animation' ? '动图' : '图片'}</span>
                </div>
                <div className="asset-meta">
                  <span>{asset.originalName || asset.name}</span>
                  <em>
                    <span>{asset.width && asset.height ? `${asset.width}x${asset.height}` : asset.extension.replace('.', '').toUpperCase()}</span>
                    {color && <i style={{ backgroundColor: color.hex }} title={color.name} />}
                  </em>
                </div>
              </button>
            );
          })}
            </div>
          ))}
        </div>
      )}
      {selectionBox && <div className="selection-box" style={selectionBox} />}
    </section>
  );
}

function DetailsPanel({ asset, folderName, aiEnabled, aiBusy, promptBusy, ads, onGenerateAiTags, onReversePrompt, onCancelReversePrompt, onUpdateTags, onMoveFolder, folders, onOpenPreview, onShowItem, onOpenExternal, onCopyText, onPromptStub, onDelete, onUpdatePromptLevel }) {
  const [tagDraft, setTagDraft] = useState('');
  const [editingTag, setEditingTag] = useState(null);
  const [editingTagValue, setEditingTagValue] = useState('');
  const [pendingDeleteTag, setPendingDeleteTag] = useState(null);
  const [sourceCopyStatus, setSourceCopyStatus] = useState(null);
  const [colorCopyStatus, setColorCopyStatus] = useState(null);
  const [isScrolling, setIsScrolling] = useState(false);
  const scrollTimerRef = useRef(null);
  const sourceCopyTimerRef = useRef(null);
  const colorCopyTimerRef = useRef(null);
  const folderOptions = useMemo(() => flattenFolderTree(folders), [folders]);

  useEffect(() => () => {
    clearTimeout(scrollTimerRef.current);
    clearTimeout(sourceCopyTimerRef.current);
    clearTimeout(colorCopyTimerRef.current);
  }, []);
  useEffect(() => {
    setTagDraft('');
    setEditingTag(null);
    setEditingTagValue('');
    setPendingDeleteTag(null);
    setSourceCopyStatus(null);
    setColorCopyStatus(null);
    clearTimeout(sourceCopyTimerRef.current);
    clearTimeout(colorCopyTimerRef.current);
  }, [asset?.id]);

  function handleScroll() {
    setIsScrolling(true);
    clearTimeout(scrollTimerRef.current);
    scrollTimerRef.current = setTimeout(() => setIsScrolling(false), 900);
  }

  if (!asset) {
    return (
      <aside className={`details-panel ${isScrolling ? 'is-scrolling' : ''}`} onScroll={handleScroll}>
        <div className="detail-ad-slot">
          <AdBanner ads={ads} onOpenExternal={onOpenExternal} />
        </div>
        <div className="empty-details">
          <PanelRight size={28} />
          <p>选择一个素材查看详情、标签和来源信息。</p>
        </div>
      </aside>
    );
  }
  const tags = [...new Set([...(asset.autoTags || []), ...(asset.userTags || [])])];
  const colorTags = [...new Set((asset.colors || []).map((color) => color.name).filter(Boolean))];
  const visibleColors = asset.colors?.length ? asset.colors : COLOR_BUCKETS.slice(0, 6);
  const promptStatus = getPromptStatus(asset);
  const canReversePrompt = asset.kind !== 'video';
  function addTag() {
    const value = tagDraft.trim();
    if (!value) return;
    onUpdateTags(asset.id, [...new Set([...(asset.userTags || []), value])]);
    setTagDraft('');
  }
  function commitTagEdit(oldTag = editingTag) {
    const value = editingTagValue.trim();
    if (!oldTag || !value) {
      setEditingTag(null);
      return;
    }
    const autoTags = (asset.autoTags || []).filter((item) => item !== oldTag);
    const userTags = (asset.userTags || []).filter((item) => item !== oldTag);
    onUpdateTags(asset.id, [...new Set([...userTags, value])], autoTags);
    setEditingTag(null);
    setEditingTagValue('');
  }
  function startTagEdit(tag) {
    setEditingTag(tag);
    setEditingTagValue(tag);
  }
  function removeTag(tag) {
    setPendingDeleteTag(tag);
  }
  function confirmRemoveTag() {
    const tag = pendingDeleteTag;
    if (!tag) return;
    const autoTags = (asset.autoTags || []).filter((item) => item !== tag);
    const userTags = (asset.userTags || []).filter((item) => item !== tag);
    onUpdateTags(asset.id, userTags, autoTags);
    setPendingDeleteTag(null);
  }
  const openSourceUrl = asset.source?.detailPageUrl || asset.source?.pageUrl || '';
  async function copyAssetLink() {
    const ok = await onCopyText(asset.source?.assetUrl, '');
    clearTimeout(sourceCopyTimerRef.current);
    setSourceCopyStatus(ok ? { type: 'success', text: '复制成功' } : { type: 'error', text: '复制失败' });
    sourceCopyTimerRef.current = setTimeout(() => setSourceCopyStatus(null), 3000);
  }
  async function copyColor(color) {
    const hex = normalizeHexColor(color.hex);
    const ok = await onCopyText(hex, '');
    clearTimeout(colorCopyTimerRef.current);
    setColorCopyStatus(ok ? { type: 'success', text: `已复制 ${hex}` } : { type: 'error', text: '复制失败' });
    colorCopyTimerRef.current = setTimeout(() => setColorCopyStatus(null), 3000);
  }
  return (
    <>
    <aside className={`details-panel ${isScrolling ? 'is-scrolling' : ''}`} onScroll={handleScroll}>
      <div className="detail-ad-slot">
        <AdBanner ads={ads} onOpenExternal={onOpenExternal} />
      </div>
      <div className="inspector-head">
        <h2>素材详情</h2>
      </div>
      <div className="details-stack">
        <section className="inspector-section">
          <div className="section-title plain"><span>基本信息</span></div>
          <div className="meta-grid">
            <span>文件名</span><strong title={asset.originalName}>{asset.originalName || asset.name}</strong>
            <span>文件类型</span><strong>{asset.extension.replace('.', '').toUpperCase()}</strong>
            <span>文件大小</span><strong>{formatBytes(asset.size)}</strong>
            <span>分辨率</span><strong>{asset.width && asset.height ? `${asset.width} x ${asset.height}` : '整理中'}</strong>
            {asset.analysisStatus === 'failed' && <><span>整理状态</span><strong title={asset.analysisError || ''}>{asset.analysisIgnored ? '已忽略提醒' : '失败'}：{asset.analysisError || '文件可能损坏或格式暂不支持'}</strong></>}
            <span>创建时间</span><strong>{formatDate(asset.createdAt)}</strong>
            <span>修改时间</span><strong>{formatDate(asset.updatedAt || asset.createdAt)}</strong>
            <span>文件夹</span><strong>{folderName}</strong>
          </div>
        </section>
        <label className="field-label">移动到
          <select value={asset.folderId} onChange={(event) => onMoveFolder(asset.id, event.target.value)}>
            {folderOptions.map((folder) => <option key={folder.id} value={folder.id}>{folderOptionLabel(folder)}</option>)}
          </select>
        </label>
        <section className="inspector-section">
          <div className="section-title plain">
            <span>标签</span>
            <button
              className="mini-action-button"
              title={aiEnabled ? '用 AI 生成素材标签' : '请先在 AI 设置里配置 API'}
              disabled={!aiEnabled || aiBusy || asset.kind === 'video'}
              onClick={() => onGenerateAiTags(asset)}
            >
              {aiBusy ? <RefreshCw size={14} className="spin-icon" /> : <WandSparkles size={14} />} {aiBusy ? '生成中' : 'AI 标签'}
            </button>
          </div>
          <div className="tag-list">
            {tags.map((tag) => (
              <span className="tag-chip" key={tag} onDoubleClick={() => startTagEdit(tag)} title="双击编辑标签">
                {editingTag === tag ? (
                  <input
                    autoFocus
                    value={editingTagValue}
                    onBlur={() => commitTagEdit(tag)}
                    onChange={(event) => setEditingTagValue(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') commitTagEdit(tag);
                      if (event.key === 'Escape') setEditingTag(null);
                    }}
                  />
                ) : (
                  <span>{tag}</span>
                )}
                <button onClick={() => removeTag(tag)} title="删除标签"><X size={12} /></button>
              </span>
            ))}
          </div>
          <div className="tag-input">
            <input value={tagDraft} onChange={(event) => setTagDraft(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && addTag()} placeholder="添加标签" />
            <button onClick={addTag}>添加</button>
          </div>
        </section>
        <section className="inspector-section">
          <div className="section-title plain"><span>颜色</span></div>
          <div className="detail-colors">
            {visibleColors.slice(0, 8).map((color) => (
              <button
                key={`${color.name}-${color.hex}`}
                style={{ backgroundColor: color.hex }}
                title={`${color.name}：${normalizeHexColor(color.hex) || color.hex}`}
                type="button"
                disabled={!normalizeHexColor(color.hex)}
                onClick={() => copyColor(color)}
              />
            ))}
            {colorTags.length > 0 && <em>{colorTags.slice(0, 6).join(' / ')}</em>}
            {colorCopyStatus && <span className={`copy-inline-status color-copy-status ${colorCopyStatus.type}`}>{colorCopyStatus.text}</span>}
          </div>
        </section>
        <section className="inspector-section">
          <div className="section-title plain">
            <span>来源</span>
          </div>
          <div className="source-table">
            <span>来源</span><strong>{asset.source?.type === 'web' ? '网页收集' : asset.source?.type === 'edited-copy' ? '编辑副本' : '本地导入'}</strong>
            {asset.source?.type === 'web' && (
              <>
                <span>网页标题</span><strong title={asset.source.pageTitle || ''}>{asset.source.pageTitle || '未记录'}</strong>
                <span>页面链接</span><strong title={asset.source.pageUrl || ''}>{asset.source.pageUrl || '未记录'}</strong>
                <span>详情页</span><strong title={asset.source.detailPageUrl || ''}>{asset.source.detailPageUrl || '未记录'}</strong>
                <span>素材链接</span><strong title={asset.source.assetUrl || ''}>{asset.source.assetUrl || '未记录'}</strong>
              </>
            )}
            <span>模型</span><strong>待记录</strong>
            <span>许可说明</span><strong>{asset.source?.licenseNote || '个人学习与参考使用'}</strong>
          </div>
          {asset.source?.type === 'web' && (
            <div className="source-actions">
              <button disabled={!openSourceUrl} onClick={() => onOpenExternal(openSourceUrl)}><ExternalLink size={14} /> 打开原网页</button>
              <div className="source-copy-wrap">
                <button disabled={!asset.source.assetUrl} onClick={copyAssetLink}><Copy size={14} /> 复制链接</button>
                {sourceCopyStatus && <span className={`copy-inline-status ${sourceCopyStatus.type}`}>{sourceCopyStatus.text}</span>}
              </div>
            </div>
          )}
        </section>
        {canReversePrompt && <section className="inspector-section">
          <div className="section-title plain">
            <span>提示词反推</span>
            {promptStatus === 'generated' && (
              <button className="icon-link" title="重新反推" disabled={!aiEnabled || promptBusy} onClick={() => onReversePrompt(asset)}>
                <RefreshCw size={14} className={promptBusy ? 'spin-icon' : ''} />
              </button>
            )}
          </div>
          <label className="prompt-level">详细程度
            <select value={asset.promptLevel || '中等'} onChange={(event) => onUpdatePromptLevel(asset.id, event.target.value)}>
              {DETAIL_LEVELS.map((level) => <option key={level}>{level}</option>)}
            </select>
          </label>
          {promptStatus === 'generated' && asset.prompt ? (
            <PromptResultCard asset={asset} onCopyText={onCopyText} />
          ) : promptStatus === 'generating' || promptBusy ? (
            <div className="prompt-box">
              <p className="prompt-running"><RefreshCw size={16} className="spin-icon" /> 正在反推中英双语提示词，请稍等...</p>
              <button className="ghost-button full" onClick={() => onCancelReversePrompt(asset)}><X size={16} /> 取消反推</button>
            </div>
          ) : promptStatus === 'failed' ? (
            <div className="prompt-box has-error">
              <p>反推失败：{asset.promptError || '请求超时或模型暂时不可用。'}</p>
              <button className="ghost-button full" disabled={!aiEnabled} onClick={() => onReversePrompt(asset)}><RefreshCw size={16} /> 重试反推</button>
            </div>
          ) : (
            <div className="prompt-box">
              <p>使用当前 AI 方案反推中英双语 prompt。可以先选择详细程度，不选默认中等。</p>
              <button className="ghost-button full" disabled={!aiEnabled} onClick={() => onReversePrompt(asset)}><WandSparkles size={16} /> 反推提示词</button>
            </div>
          )}
        </section>}
        <div className="detail-actions">
          <button onClick={() => onShowItem(asset.path)}><ExternalLink size={15} /> 所在目录</button>
          <button onClick={() => navigator.clipboard?.writeText(asset.path)}><Copy size={15} /> 复制路径</button>
          <button className="danger-button" onClick={() => onDelete([asset.id])}><Trash2 size={15} /> 删除</button>
        </div>
      </div>
    </aside>
    {pendingDeleteTag && (
      <ConfirmActionDialog
        title="删除标签"
        message={`将从当前素材移除标签“${pendingDeleteTag}”。这不会删除素材文件，但会影响后续按这个标签查找。`}
        items={[pendingDeleteTag]}
        confirmText="删除标签"
        onCancel={() => setPendingDeleteTag(null)}
        onConfirm={confirmRemoveTag}
      />
    )}
    </>
  );
}

function PromptResultCard({ asset, onCopyText }) {
  const [copyStatus, setCopyStatus] = useState(null);
  if (!asset?.prompt) return null;
  const previewSrc = assetUrl(asset.path);
  const zh = asset.prompt.zh || '';
  const en = asset.prompt.en || '';

  async function copyPrompt(text, key) {
    const ok = await onCopyText(text, '');
    setCopyStatus({
      key,
      type: ok ? 'success' : 'error',
      text: ok ? '复制成功' : '复制失败',
    });
    setTimeout(() => {
      setCopyStatus((current) => (current?.key === key ? null : current));
    }, 3000);
  }

  return (
    <div className="prompt-result-card">
      <div className="prompt-thumb-wrap">
        <button className="prompt-thumb" title="悬停查看大图" type="button">
          <img src={previewSrc} alt={asset.name} />
        </button>
        <div className="prompt-hover-preview">
          <img src={previewSrc} alt={asset.name} />
        </div>
        <div className="prompt-result-meta">
          <strong>{asset.prompt.level || asset.promptLevel || '中等'}</strong>
          <span>{asset.prompt.model || '当前 AI 方案'}</span>
        </div>
      </div>
      <div className="prompt-language-block">
        <div className="prompt-language-head">
          <span>中文 Prompt</span>
          <span className="prompt-copy-wrap">
            <button onClick={() => copyPrompt(zh, 'zh')}><Copy size={13} /> 复制</button>
            {copyStatus?.key === 'zh' && <span className={`copy-inline-status ${copyStatus.type}`}>{copyStatus.text}</span>}
          </span>
        </div>
        <p>{zh}</p>
      </div>
      <div className="prompt-language-block">
        <div className="prompt-language-head">
          <span>English Prompt</span>
          <span className="prompt-copy-wrap">
            <button onClick={() => copyPrompt(en, 'en')}><Copy size={13} /> 复制</button>
            {copyStatus?.key === 'en' && <span className={`copy-inline-status ${copyStatus.type}`}>{copyStatus.text}</span>}
          </span>
        </div>
        <p>{en}</p>
      </div>
    </div>
  );
}

function InlinePreview({ asset, hasPrevious = false, hasNext = false, onPrevious, onNext, onClose, onDelete, onSaveEditedCopy }) {
  const [scale, setScale] = useState('fit');
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [rotation, setRotation] = useState(0);
  const [cropPreset, setCropPreset] = useState('原图');
  const [freeCrop, setFreeCrop] = useState({ x: 12, y: 12, width: 76, height: 76 });
  const [videoSrc, setVideoSrc] = useState('');
  const [videoPoster, setVideoPoster] = useState('');
  const [saving, setSaving] = useState(false);
  const dragRef = useRef(null);
  const cropDragRef = useRef(null);
  const canvasRef = useRef(null);

  useEffect(() => {
    window.getSelection?.().removeAllRanges();
    setScale('fit');
    setOffset({ x: 0, y: 0 });
    setRotation(0);
    setCropPreset('原图');
    setFreeCrop({ x: 12, y: 12, width: 76, height: 76 });
    return () => {
      window.getSelection?.().removeAllRanges();
    };
  }, [asset?.id]);

  useEffect(() => {
    let active = true;
    let objectUrl = '';
    async function loadVideo() {
      if (!asset || asset.kind !== 'video') return;
      setVideoPoster(asset.thumbnail ? assetUrl(asset.thumbnail) : '');
      const binary = await window.assetVault.readBinary(asset.path);
      const blob = videoBlobFromBinary(binary, asset.path);
      objectUrl = URL.createObjectURL(blob);
      if (active) setVideoSrc(objectUrl);
      else URL.revokeObjectURL(objectUrl);
    }
    setVideoSrc('');
    setVideoPoster('');
    loadVideo().catch(() => setVideoSrc(''));
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [asset]);

  async function renderEditedImage() {
    const image = new Image();
    image.src = assetUrl(asset.path);
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = reject;
    });

    const normalizedRotation = ((rotation % 360) + 360) % 360;
    const rotated = normalizedRotation === 90 || normalizedRotation === 270;
    let sourceWidth = image.naturalWidth;
    let sourceHeight = image.naturalHeight;
    let sourceX = 0;
    let sourceY = 0;
    const presetRatios = { '1:1': 1, '4:3': 4 / 3, '3:4': 3 / 4, '16:9': 16 / 9, '9:16': 9 / 16 };
    const targetRatio = presetRatios[cropPreset];
    if (cropPreset === '自由') {
      sourceX = Math.round(image.naturalWidth * (freeCrop.x / 100));
      sourceY = Math.round(image.naturalHeight * (freeCrop.y / 100));
      sourceWidth = Math.round(image.naturalWidth * (freeCrop.width / 100));
      sourceHeight = Math.round(image.naturalHeight * (freeCrop.height / 100));
    } else if (targetRatio) {
        const frame = canvasRef.current?.querySelector('.crop-frame');
        const frameRect = frame?.getBoundingClientRect();
        if (frameRect?.width && frameRect?.height) {
          const viewScale = scale === 'fit' ? 1 : scale;
        const imageRatio = image.naturalWidth / image.naturalHeight;
        const baseScale = imageRatio > targetRatio ? frameRect.height / image.naturalHeight : frameRect.width / image.naturalWidth;
        const renderedWidth = image.naturalWidth * baseScale * viewScale;
        const renderedHeight = image.naturalHeight * baseScale * viewScale;
        const imageLeft = (frameRect.width - renderedWidth) / 2 + offset.x;
        const imageTop = (frameRect.height - renderedHeight) / 2 + offset.y;
        sourceWidth = Math.min(image.naturalWidth, Math.round(frameRect.width / (baseScale * viewScale)));
        sourceHeight = Math.min(image.naturalHeight, Math.round(frameRect.height / (baseScale * viewScale)));
        sourceX = Math.round(-imageLeft / (baseScale * viewScale));
        sourceY = Math.round(-imageTop / (baseScale * viewScale));
        sourceX = Math.max(0, Math.min(image.naturalWidth - sourceWidth, sourceX));
        sourceY = Math.max(0, Math.min(image.naturalHeight - sourceHeight, sourceY));
      } else {
        const currentRatio = sourceWidth / sourceHeight;
        if (currentRatio > targetRatio) {
          sourceWidth = Math.round(sourceHeight * targetRatio);
          sourceX = Math.round((image.naturalWidth - sourceWidth) / 2);
        } else {
          sourceHeight = Math.round(sourceWidth / targetRatio);
          sourceY = Math.round((image.naturalHeight - sourceHeight) / 2);
        }
      }
    }

    const canvas = document.createElement('canvas');
    canvas.width = rotated ? sourceHeight : sourceWidth;
    canvas.height = rotated ? sourceWidth : sourceHeight;
    const context = canvas.getContext('2d');
    context.save();
    if (normalizedRotation === 90) {
      context.translate(canvas.width, 0);
      context.rotate(Math.PI / 2);
    } else if (normalizedRotation === 180) {
      context.translate(canvas.width, canvas.height);
      context.rotate(Math.PI);
    } else if (normalizedRotation === 270) {
      context.translate(0, canvas.height);
      context.rotate(-Math.PI / 2);
    }
    context.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, sourceWidth, sourceHeight);
    context.restore();
    return {
      dataUrl: canvas.toDataURL('image/png'),
      width: canvas.width,
      height: canvas.height,
    };
  }

  async function saveCopy() {
    if (!asset || asset.kind === 'video' || saving) return;
    setSaving(true);
    try {
      const rendered = await renderEditedImage();
      await onSaveEditedCopy(asset, rendered.dataUrl, {
        width: rendered.width,
        height: rendered.height,
        rotation,
        cropPreset,
      });
    } catch {
      // saveEditedCopy already shows the user-facing failure notice.
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    function handleKeyDown(event) {
      if (event.isComposing || event.repeat) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key === 'ArrowLeft' && !isTypingTarget(event.target)) {
        event.preventDefault();
        onPrevious?.();
        return;
      }
      if (event.key === 'ArrowRight' && !isTypingTarget(event.target)) {
        event.preventDefault();
        onNext?.();
        return;
      }
      if (event.key !== 'Enter' || isTypingTarget(event.target)) return;
      event.preventDefault();
      saveCopy();
    }
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [asset, rotation, cropPreset, freeCrop, saving, onClose, onPrevious, onNext]);

  if (!asset) return null;
  const isVideo = asset.kind === 'video';
  const presetRatios = { '1:1': 1, '4:3': 4 / 3, '3:4': 3 / 4, '16:9': 16 / 9, '9:16': 9 / 16 };
  const activeCropRatio = presetRatios[cropPreset] || null;
  const assetRatio = asset.width && asset.height ? asset.width / asset.height : 1;
  const ratioCropImageStyle = activeCropRatio
    ? (assetRatio > activeCropRatio
      ? { width: 'auto', height: '100%', maxWidth: 'none', maxHeight: 'none', objectFit: 'contain' }
      : { width: '100%', height: 'auto', maxWidth: 'none', maxHeight: 'none', objectFit: 'contain' })
    : null;
  const imageRatioStyle = !isVideo && asset.width && asset.height && (cropPreset === '原图' || cropPreset === '自由')
    ? { aspectRatio: `${asset.width} / ${asset.height}`, '--ratio': asset.width / asset.height }
    : undefined;

  function reset() {
    setScale('fit');
    setOffset({ x: 0, y: 0 });
    setRotation(0);
    setFreeCrop({ x: 12, y: 12, width: 76, height: 76 });
  }

  function getOneToOneScale() {
    if (!asset?.width || !asset?.height) return 1;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect?.width || !rect?.height) return 1;
    const normalizedRotation = ((rotation % 360) + 360) % 360;
    const rotated = normalizedRotation === 90 || normalizedRotation === 270;
    const width = rotated ? asset.height : asset.width;
    const height = rotated ? asset.width : asset.height;
    const fitRatio = Math.min((rect.width - 8) / width, (rect.height - 8) / height, 1);
    return Math.max(1, Math.min(8, 1 / Math.max(fitRatio, 0.01)));
  }

  function handleWheel(event) {
    if (cropPreset === '自由') return;
    event.preventDefault();
    const currentScale = scale === 'fit' ? 1 : scale;
    const minScale = cropPreset === '原图' ? 0.2 : 1;
    const nextScale = Math.max(minScale, Math.min(6, currentScale + (event.deltaY > 0 ? -0.12 : 0.12)));
    if (nextScale === currentScale) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const pointerX = event.clientX - rect.left - rect.width / 2;
    const pointerY = event.clientY - rect.top - rect.height / 2;
    const ratio = nextScale / currentScale;
    setOffset((current) => ({
      x: pointerX - (pointerX - current.x) * ratio,
      y: pointerY - (pointerY - current.y) * ratio,
    }));
    setScale(nextScale);
  }

  function togglePreviewScale(event) {
    if (event.target.closest('button, input, select, textarea, video, .free-crop-box, .free-crop-handle')) return;
    event.preventDefault();
    window.getSelection?.().removeAllRanges();
    if (scale === 'fit') {
      setScale(getOneToOneScale());
      setOffset({ x: 0, y: 0 });
      return;
    }
    setScale('fit');
    setOffset({ x: 0, y: 0 });
  }

  function handlePointerDown(event) {
    if (event.target.closest('button, input, select, textarea, video, .free-crop-box, .free-crop-handle')) return;
    if (cropPreset === '自由') return;
    event.preventDefault();
    window.getSelection?.().removeAllRanges();
    dragRef.current = { x: event.clientX, y: event.clientY, offset };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event) {
    if (!dragRef.current) return;
    event.preventDefault();
    const dx = event.clientX - dragRef.current.x;
    const dy = event.clientY - dragRef.current.y;
    setOffset({ x: dragRef.current.offset.x + dx, y: dragRef.current.offset.y + dy });
  }

  function stopPan(event) {
    dragRef.current = null;
    if (event?.currentTarget?.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    window.getSelection?.().removeAllRanges();
  }

  function startFreeCropDrag(event, mode) {
    event.preventDefault();
    event.stopPropagation();
    const frame = event.currentTarget.closest('.crop-frame');
    if (!frame) return;
    cropDragRef.current = {
      mode,
      startX: event.clientX,
      startY: event.clientY,
      rect: frame.getBoundingClientRect(),
      crop: freeCrop,
    };
  }

  function updateFreeCrop(event) {
    if (!cropDragRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    const { mode, startX, startY, rect, crop } = cropDragRef.current;
    const dx = ((event.clientX - startX) / rect.width) * 100;
    const dy = ((event.clientY - startY) / rect.height) * 100;
    const minSize = 8;
    let next = { ...crop };
    if (mode === 'move') {
      next.x = Math.max(0, Math.min(100 - crop.width, crop.x + dx));
      next.y = Math.max(0, Math.min(100 - crop.height, crop.y + dy));
    } else {
      if (mode.includes('e')) next.width = Math.max(minSize, Math.min(100 - crop.x, crop.width + dx));
      if (mode.includes('s')) next.height = Math.max(minSize, Math.min(100 - crop.y, crop.height + dy));
      if (mode.includes('w')) {
        const x = Math.max(0, Math.min(crop.x + crop.width - minSize, crop.x + dx));
        next.width = crop.width + crop.x - x;
        next.x = x;
      }
      if (mode.includes('n')) {
        const y = Math.max(0, Math.min(crop.y + crop.height - minSize, crop.y + dy));
        next.height = crop.height + crop.y - y;
        next.y = y;
      }
    }
    setFreeCrop(next);
  }

  function stopFreeCropDrag() {
    cropDragRef.current = null;
  }

  useEffect(() => {
    if (cropPreset !== '自由') return undefined;
    function handleMove(event) {
      updateFreeCrop(event);
    }
    function handleUp() {
      stopFreeCropDrag();
    }
    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
    };
  }, [cropPreset, freeCrop]);

  return (
    <section className="inline-preview">
      <div className="inline-preview-toolbar">
        <div className="preview-title">
          <strong>{asset.originalName || asset.name}</strong>
          <span>{isVideo ? '视频预览' : '图片预览'}</span>
        </div>
        <div className="preview-tools">
          {!isVideo && (
            <>
              <button onClick={() => setRotation((value) => value - 90)}><RotateCcw size={15} /> 左转</button>
              <button onClick={() => setRotation((value) => value + 90)}><RotateCw size={15} /> 右转</button>
              <label className="crop-select">裁剪
                <select
                  value={cropPreset}
                  onChange={(event) => {
                    setCropPreset(event.target.value);
                    setScale('fit');
                    setOffset({ x: 0, y: 0 });
                    event.currentTarget.blur();
                  }}
                  onKeyDown={(event) => {
                    if (event.key !== 'Enter') return;
                    event.preventDefault();
                    event.currentTarget.blur();
                    saveCopy();
                  }}
                >
                  {['原图', '自由', '1:1', '4:3', '3:4', '16:9', '9:16'].map((preset) => <option key={preset}>{preset}</option>)}
                </select>
              </label>
              <button onClick={saveCopy} disabled={saving}><CheckSquare size={15} /> {saving ? '保存中' : '保存副本'}</button>
            </>
          )}
          <button onClick={reset}><RefreshCw size={15} /> 复原</button>
          <button className="danger-button" onClick={() => onDelete([asset.id])}><Trash2 size={15} /> 删除</button>
          <button onClick={onClose}><X size={17} /></button>
        </div>
      </div>
      <div
        ref={canvasRef}
        className="preview-canvas"
        onWheel={handleWheel}
        onDoubleClick={togglePreviewScale}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={stopPan}
        onPointerCancel={stopPan}
        onPointerLeave={stopPan}
        onDragStart={(event) => event.preventDefault()}
      >
        <button
          className="preview-nav-button previous"
          type="button"
          disabled={!hasPrevious}
          title="上一个素材"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            onPrevious?.();
          }}
        >
          <ChevronLeft size={24} />
        </button>
        <button
          className="preview-nav-button next"
          type="button"
          disabled={!hasNext}
          title="下一个素材"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            onNext?.();
          }}
        >
          <ChevronRight size={24} />
        </button>
        {isVideo ? (
          videoSrc ? <video controls src={videoSrc} poster={videoPoster} style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale === 'fit' ? 1 : scale})` }} /> : <div className="preview-loading">视频加载中...</div>
        ) : (
          <div className={`crop-frame crop-${cropPreset.replace(':', '-')} ${scale === 'fit' ? 'fit-mode' : ''}`} style={imageRatioStyle}>
            <img
              src={assetUrl(asset.path)}
              alt={asset.name}
              style={{
                ...(ratioCropImageStyle || {}),
                transform: `translate(${offset.x}px, ${offset.y}px) rotate(${rotation}deg) scale(${scale === 'fit' ? 1 : scale})`,
              }}
              draggable="false"
            />
            {cropPreset === '自由' && (
              <div
                className="free-crop-box"
                style={{ left: `${freeCrop.x}%`, top: `${freeCrop.y}%`, width: `${freeCrop.width}%`, height: `${freeCrop.height}%` }}
                onPointerDown={(event) => startFreeCropDrag(event, 'move')}
              >
                {['nw', 'ne', 'sw', 'se'].map((handle) => (
                  <span
                    key={handle}
                    className={`free-crop-handle ${handle}`}
                    onPointerDown={(event) => startFreeCropDrag(event, handle)}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

function DeleteFolderDialog({ folder, folders, onCancel, onConfirm }) {
  const [mode, setMode] = useState('move-default');
  const [targetFolder, setTargetFolder] = useState('default');
  const blockedFolderIds = useMemo(() => (folder ? getFolderDescendantIds(folders, folder.id) : new Set()), [folders, folder]);
  const targetFolderOptions = useMemo(() => flattenFolderTree(folders).filter((item) => !blockedFolderIds.has(item.id)), [folders, blockedFolderIds]);
  useConfirmShortcut({
    enabled: !!folder,
    onConfirm: () => onConfirm(mode, targetFolder),
    onCancel,
  });
  if (!folder) return null;
  const childCount = Math.max(0, blockedFolderIds.size - 1);
  return (
    <div className="modal-backdrop">
      <section className="dialog">
        <h3>删除文件夹：{folder.name}</h3>
        <p>
          将删除这个文件夹分类{childCount ? `，并同时处理下面的 ${childCount} 个子文件夹` : ''}。本地素材文件不会直接删除，请选择里面的素材记录如何处理。
        </p>
        <label className="radio-row"><input type="radio" checked={mode === 'move-default'} onChange={() => setMode('move-default')} /> 移动素材到默认收藏</label>
        <label className="radio-row"><input type="radio" checked={mode === 'move-other'} onChange={() => setMode('move-other')} /> 移动到其他文件夹</label>
        {mode === 'move-other' && (
          <select value={targetFolder} onChange={(event) => setTargetFolder(event.target.value)}>
            {targetFolderOptions.map((item) => <option key={item.id} value={item.id}>{folderOptionLabel(item)}</option>)}
          </select>
        )}
        <label className="radio-row"><input type="radio" checked={mode === 'trash-assets'} onChange={() => setMode('trash-assets')} /> 此文件夹“{folder.name}”和素材一起删除，回收站保存30天后永久删除</label>
        <div className="dialog-actions">
          <button onClick={onCancel}>取消</button>
          <button className="danger-button" onClick={() => onConfirm(mode, targetFolder)}>确认删除</button>
        </div>
      </section>
    </div>
  );
}

function DeleteAssetsDialog({ assets, permanent = false, onCancel, onConfirm }) {
  useConfirmShortcut({
    enabled: !!assets?.length,
    onConfirm,
    onCancel,
  });
  if (!assets?.length) return null;
  return (
    <div className="modal-backdrop">
      <section className="dialog danger-dialog">
        <h3>{permanent ? '永久删除素材' : '移入回收站'}</h3>
        <p>
          {permanent
            ? `将永久删除 ${assets.length} 个素材。这会从素材库磁盘目录中删除原文件和缩略图，操作不可撤销。`
            : `将把 ${assets.length} 个素材移入回收站，30 天后自动永久删除。你可以在回收站里恢复。`}
        </p>
        <div className="delete-list">
          {assets.slice(0, 6).map((asset) => <span key={asset.id}>{asset.originalName || asset.name}</span>)}
          {assets.length > 6 && <em>以及另外 {assets.length - 6} 个素材</em>}
        </div>
        <div className="dialog-actions">
          <button onClick={onCancel}>取消</button>
          <button className="danger-button" onClick={onConfirm}>{permanent ? '永久删除' : '移入回收站'}</button>
        </div>
      </section>
    </div>
  );
}

function ConfirmActionDialog({ title, message, items = [], confirmText = '确认删除', variant = 'danger', onCancel, onConfirm }) {
  useConfirmShortcut({
    enabled: true,
    onConfirm,
    onCancel,
  });
  return (
    <div className="modal-backdrop">
      <section className="dialog danger-dialog">
        <h3>{title}</h3>
        <p>{message}</p>
        {items.length > 0 && (
          <div className="delete-list">
            {items.slice(0, 6).map((item) => <span key={item}>{item}</span>)}
            {items.length > 6 && <em>以及另外 {items.length - 6} 项</em>}
          </div>
        )}
        <div className="dialog-actions">
          <button onClick={onCancel}>取消</button>
          <button className={variant === 'danger' ? 'danger-button' : 'primary-button'} onClick={onConfirm}>{confirmText}</button>
        </div>
      </section>
    </div>
  );
}

function ExportDataDialog({ folders, stats, onCancel, onConfirm }) {
  const folderOptions = useMemo(() => flattenFolderTree(folders), [folders]);
  const [mode, setMode] = useState('all');
  const [selectedFolderIds, setSelectedFolderIds] = useState(() => folders.map((folder) => folder.id));
  const selectedCount = selectedFolderIds.reduce((total, folderId) => total + (stats.byFolder[folderId] || 0), 0);
  const canConfirm = mode === 'all' || selectedFolderIds.length > 0;

  useConfirmShortcut({
    enabled: canConfirm,
    onConfirm: () => onConfirm(mode === 'all' ? null : selectedFolderIds),
    onCancel,
  });

  function toggleFolder(folderId) {
    setSelectedFolderIds((current) => (
      current.includes(folderId)
        ? current.filter((id) => id !== folderId)
        : [...current, folderId]
    ));
  }

  return (
    <div className="modal-backdrop">
      <section className="dialog export-data-dialog">
        <button className="dialog-close" title="关闭" onClick={onCancel}><X size={16} /></button>
        <h3>导出数据迁移</h3>
        <p>可以导出全部素材库数据，也可以只导出指定文件夹。导出的迁移数据包以后可通过“导入迁移的数据”合并恢复，不会覆盖原来的素材库。</p>
        <div className="export-mode-grid">
          <button className={mode === 'all' ? 'active' : ''} onClick={() => setMode('all')}>
            <Archive size={17} />
            <strong>全部数据</strong>
            <span>{stats.total} 个素材</span>
          </button>
          <button className={mode === 'folders' ? 'active' : ''} onClick={() => setMode('folders')}>
            <Folder size={17} />
            <strong>按文件夹导出</strong>
            <span>已选 {selectedFolderIds.length} 个文件夹 · {selectedCount} 个素材</span>
          </button>
        </div>
        {mode === 'folders' && (
          <>
            <div className="export-folder-toolbar">
              <span>选择要导出的文件夹</span>
              <div>
                <button onClick={() => setSelectedFolderIds(folders.map((folder) => folder.id))}>全选</button>
                <button onClick={() => setSelectedFolderIds([])}>清空</button>
              </div>
            </div>
            <div className="export-folder-list">
              {folderOptions.map((folder) => (
                <label className="export-folder-row" key={folder.id}>
                  <input
                    type="checkbox"
                    checked={selectedFolderIds.includes(folder.id)}
                    onChange={() => toggleFolder(folder.id)}
                  />
                  <span>{folderOptionLabel(folder)}</span>
                  <em>{stats.byFolder[folder.id] || 0} 个</em>
                </label>
              ))}
            </div>
          </>
        )}
        <div className="dialog-actions">
          <button onClick={onCancel}>取消</button>
          <button className="primary-button" disabled={!canConfirm} onClick={() => onConfirm(mode === 'all' ? null : selectedFolderIds)}>
            开始导出
          </button>
        </div>
      </section>
    </div>
  );
}

function DuplicateImportDialog({ duplicates, onImport, onCancel }) {
  useConfirmShortcut({
    enabled: !!duplicates?.length,
    onConfirm: onImport,
    onCancel,
  });
  if (!duplicates?.length) return null;
  return (
    <div className="modal-backdrop">
      <section className="dialog duplicate-dialog">
        <h3>发现重复素材</h3>
        <p>以下素材之前已经收藏过。选择“导入”会保留本次重复副本；选择“取消”会删除这次重复导入的副本。</p>
        <div className="delete-list">
          {duplicates.slice(0, 6).map((item) => (
            <span key={item.imported?.id || item.originalName}>{item.imported?.originalName || item.originalName || item.existing?.originalName || item.existing?.name}</span>
          ))}
          {duplicates.length > 6 && <em>以及另外 {duplicates.length - 6} 个重复素材</em>}
        </div>
        <div className="dialog-actions">
          <button onClick={onCancel}>取消</button>
          <button onClick={onImport}>导入</button>
        </div>
      </section>
    </div>
  );
}

function FolderDropActionDialog({ action, folder, count, onCancel, onConfirm }) {
  useConfirmShortcut({
    enabled: !!action,
    onConfirm: () => onConfirm('move'),
    onCancel,
  });
  if (!action || !folder) return null;
  return (
    <div className="modal-backdrop">
      <section className="dialog small-dialog">
        <button className="dialog-close" onClick={onCancel}><X size={16} /></button>
        <h3>放入“{folder.name}”</h3>
        <p>要把 {count} 个素材复制到这个文件夹，还是移动到这个文件夹？</p>
        <div className="dialog-actions">
          <button onClick={onCancel}>取消</button>
          <button onClick={() => onConfirm('copy')}>复制到这里</button>
          <button className="primary-button" onClick={() => onConfirm('move')}>移动到这里</button>
        </div>
      </section>
    </div>
  );
}

function AdManagerDialog({ open, ads, remoteConfig, onCancel, onSave, onChooseImage, onExportPackage, onTestRemote }) {
  const [draft, setDraft] = useState(() => normalizeAdSettings(ads));
  const [configUrl, setConfigUrl] = useState(() => normalizeRemoteAdSettings(remoteConfig).configUrl);
  const [error, setError] = useState('');
  const [remoteStatus, setRemoteStatus] = useState('');

  useEffect(() => {
    if (open) {
      setDraft(normalizeAdSettings(ads));
      setConfigUrl(normalizeRemoteAdSettings(remoteConfig).configUrl);
      setError('');
      setRemoteStatus('');
    }
  }, [open, ads, remoteConfig]);

  useConfirmShortcut({
    enabled: open,
    onConfirm: save,
    onCancel,
  });

  async function addImage() {
    try {
      const result = await onChooseImage();
      if (!result?.path) return;
      const now = new Date().toISOString();
      const ad = createAdItem({
          title: result.name || '广告图片',
          imagePath: result.path,
          url: '',
          enabled: true,
          createdAt: now,
          updatedAt: now,
      });
      setDraft((current) => {
        const next = [...current, ad];
        onSave(normalizeAdSettings(next), { ...normalizeRemoteAdSettings(remoteConfig), configUrl: configUrl.trim() });
        return next;
      });
    } catch (addError) {
      setError(`添加广告失败：${addError?.message || '请选择可读取的图片。'}`);
    }
  }

  function updateAd(id, patch) {
    setDraft((current) => current.map((ad) => (
      ad.id === id ? { ...ad, ...patch, updatedAt: new Date().toISOString() } : ad
    )));
  }

  function removeAd(id) {
    setDraft((current) => {
      const next = current.filter((ad) => ad.id !== id);
      onSave(normalizeAdSettings(next), { ...normalizeRemoteAdSettings(remoteConfig), configUrl: configUrl.trim() });
      return next;
    });
  }

  function save() {
    onSave(normalizeAdSettings(draft), { ...normalizeRemoteAdSettings(remoteConfig), configUrl: configUrl.trim() });
  }

  async function testRemote() {
    try {
      setError('');
      setRemoteStatus('正在读取云端 ads.json...');
      const result = await onTestRemote?.(configUrl.trim());
      if (result?.count !== undefined) setRemoteStatus(`读取成功：找到 ${result.count} 条可用广告。`);
      else setRemoteStatus('');
    } catch (testError) {
      setRemoteStatus('');
      setError(`读取失败：${testError?.message || '请检查 ads.json 地址是否可访问。'}`);
    }
  }

  async function exportPackage() {
    try {
      setError('');
      const normalizedDraft = normalizeAdSettings(draft);
      onSave(normalizedDraft, { ...normalizeRemoteAdSettings(remoteConfig), configUrl: configUrl.trim() });
      const result = await onExportPackage?.(normalizedDraft);
      if (result?.path) setRemoteStatus(`广告包已导出：${result.path}`);
    } catch (exportError) {
      setError(`导出失败：${exportError?.message || '请检查广告图片是否可访问。'}`);
    }
  }

  if (!open) return null;
  return (
    <div className="modal-backdrop">
      <section className="dialog ad-dialog">
        <button className="dialog-close" title="关闭" onClick={onCancel}><X size={17} /></button>
        <div className="ad-dialog-head">
          <h3>广告配置生成器</h3>
          <p>按顺序操作：先做广告内容，再导出带签名的广告包，上传后把云端 ads.json 地址粘贴回来测试并保存。</p>
        </div>
        <div className="ad-dialog-body">
          <div className="ad-step-card">
            <div className="ad-step-head">
              <span>1</span>
              <div>
                <strong>添加广告图片和跳转链接</strong>
                <em>标题只给你管理用，用户不会看到。推荐 21:9 横幅图，例如 2100 x 900。</em>
              </div>
              <button className="primary-button" onClick={addImage}>
                <ImageIcon size={16} />
                添加图片广告
              </button>
            </div>
            <div className="ad-editor-list">
              {draft.length ? draft.map((ad) => (
                <div className="ad-editor-item" key={ad.id}>
                  <img src={adImageSrc(ad)} alt="" />
                  <div className="ad-editor-fields">
                    <label>
                      <span>广告名称</span>
                      <input value={ad.title} onChange={(event) => updateAd(ad.id, { title: event.target.value })} placeholder="方便自己识别" />
                    </label>
                    <label>
                      <span>点击跳转网址</span>
                      <input value={ad.url} onChange={(event) => updateAd(ad.id, { url: event.target.value })} placeholder="例如 https://example.com" />
                    </label>
                    <label className="ad-enable-row">
                      <input type="checkbox" checked={ad.enabled} onChange={(event) => updateAd(ad.id, { enabled: event.target.checked })} />
                      启用这个广告
                    </label>
                  </div>
                  <button className="danger-text ad-delete-button" onClick={() => removeAd(ad.id)}>删除</button>
                </div>
              )) : (
                <div className="ad-empty-state">
                  <ImageIcon size={22} />
                  <strong>还没有广告图片</strong>
                  <span>先点击右上角“添加图片广告”。</span>
                </div>
              )}
            </div>
          </div>
          <div className="ad-step-grid">
            <div className="ad-step-card compact">
              <div className="ad-step-head">
                <span>2</span>
                <div>
                  <strong>导出广告包</strong>
                  <em>会生成带签名的 ads.json 和 ads 图片文件夹，用来上传到 GitHub Pages 或云存储。</em>
                </div>
                <button className="ghost-button" onClick={exportPackage} disabled={!draft.length}>
                  <ExternalLink size={15} />
                  导出广告包
                </button>
              </div>
            </div>
            <div className="ad-step-card compact">
              <div className="ad-step-head">
                <span>3</span>
                <div>
                  <strong>上传后填写云端地址</strong>
                  <em>把上传后的 ads.json 链接贴到这里，测试成功后保存。</em>
                </div>
              </div>
              <label className="ad-remote-field">
                <span>云端 ads.json 地址</span>
                <div>
                  <input value={configUrl} onChange={(event) => { setConfigUrl(event.target.value); setRemoteStatus(''); }} placeholder="例如 https://你的用户名.github.io/广告仓库/ads.json" />
                  <button type="button" onClick={testRemote} disabled={!configUrl.trim()}>测试读取</button>
                </div>
              </label>
            </div>
          </div>
          <div className="ad-size-hint">
            <strong>图片格式提醒</strong>
            <span>支持 PNG / JPG / WebP / GIF / SVG。正式使用时建议上传新文件名，避免用户看到缓存旧图。</span>
          </div>
          {remoteStatus && <p className="form-success">{remoteStatus}</p>}
          {error && <p className="form-error">{error}</p>}
        </div>
        <div className="dialog-actions">
          <button onClick={onCancel}>取消</button>
          <button className="primary-button" onClick={save}>保存</button>
        </div>
      </section>
    </div>
  );
}

function RunningHubGuideDialog({ open, onCancel, onOpenExternal }) {
  const [error, setError] = useState('');
  const [activeStep, setActiveStep] = useState(0);
  const [zoomOpen, setZoomOpen] = useState(false);
  const [zoomScale, setZoomScale] = useState(1);
  const [zoomOffset, setZoomOffset] = useState({ x: 0, y: 0 });
  const zoomDragRef = useRef(null);

  useEffect(() => {
    if (open) {
      setError('');
      setActiveStep(0);
      closeZoomImage();
    }
  }, [open]);

  useEffect(() => {
    closeZoomImage();
  }, [activeStep]);

  useConfirmShortcut({
    enabled: open,
    onCancel: zoomOpen ? closeZoomImage : onCancel,
  });

  async function openRunningHub() {
    try {
      await onOpenExternal?.(RUNNINGHUB_LOGIN_URL);
    } catch (openError) {
      setError(`打开 RunningHub 失败：${openError?.message || '请检查系统默认浏览器。'}`);
    }
  }

  function openZoomImage() {
    setZoomOpen(true);
    setZoomScale(1);
    setZoomOffset({ x: 0, y: 0 });
  }

  function closeZoomImage() {
    setZoomOpen(false);
    setZoomScale(1);
    setZoomOffset({ x: 0, y: 0 });
    zoomDragRef.current = null;
  }

  function updateZoom(nextScale) {
    const clamped = Math.max(0.7, Math.min(4, nextScale));
    setZoomScale(clamped);
    if (clamped <= 1) setZoomOffset({ x: 0, y: 0 });
  }

  function handleZoomWheel(event) {
    event.preventDefault();
    updateZoom(zoomScale + (event.deltaY < 0 ? 0.18 : -0.18));
  }

  function startZoomDrag(event) {
    if (zoomScale <= 1) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    zoomDragRef.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      offsetX: zoomOffset.x,
      offsetY: zoomOffset.y,
    };
  }

  function moveZoomDrag(event) {
    const drag = zoomDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    setZoomOffset({
      x: drag.offsetX + event.clientX - drag.x,
      y: drag.offsetY + event.clientY - drag.y,
    });
  }

  function endZoomDrag(event) {
    if (zoomDragRef.current?.pointerId === event.pointerId) zoomDragRef.current = null;
  }

  if (!open) return null;
  const image = RUNNINGHUB_GUIDE_IMAGES[activeStep] || RUNNINGHUB_GUIDE_IMAGES[0];
  return (
    <div className="modal-backdrop">
      <section className="dialog rh-guide-dialog">
        <button className="dialog-close" title="关闭" onClick={onCancel}><X size={17} /></button>
        <div className="rh-guide-head">
          <div>
            <h3>接入Ai指南</h3>
            <p>先打开 RH 登录入口，复制 API Key 后回到软件 AI 设置里粘贴、获取模型、测试连接并保存。</p>
          </div>
          <button className="primary-button rh-login-button" onClick={openRunningHub}>
            <ExternalLink size={15} />
            注册RunningHub开启Ai管理
          </button>
        </div>
        {error && <p className="form-error">{error}</p>}
        <div className="rh-guide-body">
          <div className="rh-guide-step-list">
            {RUNNINGHUB_GUIDE_IMAGES.map((item, index) => (
              <button
                className={activeStep === index ? 'active' : ''}
                key={item.src}
                onClick={() => setActiveStep(index)}
              >
                <span>{index + 1}</span>
                {item.title.replace(/^第.+?：/, '')}
              </button>
            ))}
          </div>
          <div className="rh-guide-viewer">
            <div className="rh-guide-viewer-title">
              <strong>{image.title}</strong>
              <span>{activeStep + 1} / {RUNNINGHUB_GUIDE_IMAGES.length}</span>
            </div>
            <div className="rh-guide-image-wrap">
              <button className="rh-guide-image-button" title="查看大图" onClick={openZoomImage}>
                <img src={image.src} alt={image.title} />
              </button>
            </div>
            <div className="rh-guide-nav">
              <button disabled={activeStep <= 0} onClick={() => setActiveStep((step) => Math.max(0, step - 1))}>
                <ChevronLeft size={15} />
                上一步
              </button>
              <button disabled={activeStep >= RUNNINGHUB_GUIDE_IMAGES.length - 1} onClick={() => setActiveStep((step) => Math.min(RUNNINGHUB_GUIDE_IMAGES.length - 1, step + 1))}>
                下一步
                <ChevronRight size={15} />
              </button>
            </div>
          </div>
        </div>
        {zoomOpen && (
          <div className="rh-image-zoom-backdrop" onClick={closeZoomImage}>
            <div className="rh-image-zoom-toolbar" onClick={(event) => event.stopPropagation()}>
              <strong>{image.title}</strong>
              <span>{Math.round(zoomScale * 100)}%</span>
              <button onClick={() => updateZoom(zoomScale - 0.2)}>缩小</button>
              <button onClick={() => updateZoom(zoomScale + 0.2)}>放大</button>
              <button onClick={() => { setZoomScale(1); setZoomOffset({ x: 0, y: 0 }); }}>复原</button>
              <button title="关闭" onClick={closeZoomImage}><X size={15} /></button>
            </div>
            <div className="rh-image-zoom-stage" onClick={closeZoomImage} onWheel={handleZoomWheel}>
              <img
                src={image.src}
                alt={image.title}
                draggable={false}
                onClick={(event) => event.stopPropagation()}
                onPointerDown={startZoomDrag}
                onPointerMove={moveZoomDrag}
                onPointerUp={endZoomDrag}
                onPointerCancel={endZoomDrag}
                style={{ transform: `translate(${zoomOffset.x}px, ${zoomOffset.y}px) scale(${zoomScale})` }}
              />
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function FolderNameDialog({ mode, folder, parentFolder, folders, onCancel, onConfirm }) {
  const [name, setName] = useState(folder?.name || '');
  const [error, setError] = useState('');
  const parentId = mode === 'create' ? (parentFolder?.id || null) : (folder?.parentId || null);
  function submit() {
    const value = name.trim();
    if (!value) {
      setError('请输入文件夹名称。');
      return;
    }
    const exists = folders.some((item) => item.id !== folder?.id && (item.parentId || null) === parentId && item.name === value);
    if (exists) {
      setError('同一级里已存在同名文件夹。');
      return;
    }
    onConfirm(value);
  }
  useConfirmShortcut({
    enabled: !!mode,
    onConfirm: submit,
    onCancel,
  });
  if (!mode) return null;
  return (
    <div className="modal-backdrop">
      <section className="dialog">
        <h3>{mode === 'create' ? '新建文件夹' : '重命名文件夹'}</h3>
        <p>{mode === 'create' && parentFolder ? `将在“${parentFolder.name}”下创建子文件夹。` : '文件夹用于整理素材，不会改变本地原文件名。'}</p>
        <input
          className="dialog-input"
          autoFocus
          value={name}
          onChange={(event) => { setName(event.target.value); setError(''); }}
          onKeyDown={(event) => event.key === 'Enter' && submit()}
          placeholder="文件夹名称"
        />
        {error && <p className="form-error">{error}</p>}
        <div className="dialog-actions">
          <button onClick={onCancel}>取消</button>
          <button className="primary-button" onClick={submit}>{mode === 'create' ? '创建' : '保存'}</button>
        </div>
      </section>
    </div>
  );
}

function AiSettingsDialog({
  open,
  rootPath,
  libraryStats,
  settings,
  testing,
  loadingModels,
  updateSettings,
  updateStatus,
  appVersion,
  onCancel,
  onSave,
  onTest,
  onListModels,
  onOpenLibraryRoot,
  onRequestSwitchLibrary,
  onOpenExternal,
  onCopyText,
  onOpenAdManager,
  onSaveUpdateSettings,
  onCheckUpdate,
  onInstall,
  onChooseUpdateInstaller,
  onExportUpdateConfig,
}) {
  const [draft, setDraft] = useState(() => normalizeAiSettings(settings));
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [modelQuery, setModelQuery] = useState('');
  const [modelOptions, setModelOptions] = useState([]);
  const [modelMessage, setModelMessage] = useState('');
  const [pendingDeleteProfile, setPendingDeleteProfile] = useState(null);
  const [extensionInfo, setExtensionInfo] = useState(null);
  const [extensionMessage, setExtensionMessage] = useState('');
  const [updateConfigUrl, setUpdateConfigUrl] = useState(() => normalizeUpdateSettings(updateSettings).configUrl);
  const [siteSaved, setSiteSaved] = useState(false);
  const [showAdminSiteSettings, setShowAdminSiteSettings] = useState(() => localStorage.getItem('assetVaultAdminSiteSettings') === '1');
  const [updateDraft, setUpdateDraft] = useState({
    version: '',
    title: '发现新版本',
    installerUrl: '',
    fileName: '',
    sha256: '',
    size: 0,
    notes: '',
  });
  const [activeSettingsPage, setActiveSettingsPage] = useState('library');
  const nameInputRef = useRef(null);
  const aiProfileFormRef = useRef(null);
  const wasOpenRef = useRef(false);

  useEffect(() => {
    if (open && !wasOpenRef.current) {
      setDraft(normalizeAiSettings(settings));
      setError('');
      setSaved(false);
      setModelQuery('');
      setModelOptions([]);
      setModelMessage('');
      setPendingDeleteProfile(null);
      setExtensionMessage('');
      setUpdateConfigUrl(normalizeUpdateSettings(updateSettings).configUrl);
      setSiteSaved(false);
      setActiveSettingsPage('library');
    }
    wasOpenRef.current = open;
  }, [open, settings, updateSettings]);

  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    window.assetVault.getExtensionInfo?.().then((info) => {
      if (!cancelled) setExtensionInfo(info || null);
    }).catch(() => {
      if (!cancelled) setExtensionInfo(null);
    });
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    localStorage.setItem('assetVaultAdminSiteSettings', showAdminSiteSettings ? '1' : '0');
  }, [showAdminSiteSettings]);

  const activeProfile = draft.profiles.find((profile) => profile.id === draft.activeProfileId) || draft.profiles[0] || createAiProfile();

  function selectProfile(profileId) {
    setSaved(false);
    setError('');
    setModelQuery('');
    setModelOptions([]);
    setModelMessage('');
    setDraft((current) => ({ ...current, activeProfileId: profileId }));
  }

  function updateActiveProfile(patch) {
    setSaved(false);
    if ('baseUrl' in patch || 'apiKey' in patch || 'provider' in patch) {
      setModelOptions([]);
      setModelMessage('');
    }
    setDraft((current) => {
      const activeId = current.activeProfileId || current.profiles[0]?.id || 'default';
      return {
        ...current,
        activeProfileId: activeId,
        profiles: current.profiles.map((profile) => (
          profile.id === activeId ? { ...profile, ...patch } : profile
        )),
      };
    });
  }

  function addProfile() {
    setSaved(false);
    const profile = createAiProfile({ name: `API ${draft.profiles.length + 1}` });
    setDraft((current) => ({
      ...current,
      activeProfileId: profile.id,
      profiles: [...current.profiles, profile],
    }));
    window.setTimeout(() => nameInputRef.current?.focus(), 0);
  }

  function renameProfile(profileId) {
    selectProfile(profileId);
    window.setTimeout(() => {
      nameInputRef.current?.focus();
      nameInputRef.current?.select();
    }, 0);
  }

  function requestDeleteProfile(profile = activeProfile) {
    setSaved(false);
    if (draft.profiles.length <= 1) {
      setError('至少保留一个 API 配置。');
      return;
    }
    setPendingDeleteProfile(profile);
  }

  function deleteProfile() {
    if (!pendingDeleteProfile) return;
    setDraft((current) => {
      const nextProfiles = current.profiles.filter((profile) => profile.id !== pendingDeleteProfile.id);
      return {
        ...current,
        activeProfileId: current.activeProfileId === pendingDeleteProfile.id
          ? (nextProfiles[0]?.id || 'default')
          : current.activeProfileId,
        profiles: nextProfiles,
      };
    });
    setPendingDeleteProfile(null);
  }

  function validate(profile = activeProfile, sourceDraft = draft) {
    const provider = profile.provider || 'openai-compatible';
    const baseUrl = provider === 'runninghub'
      ? (String(profile.baseUrl || '').trim() || RUNNINGHUB_LLM_BASE_URL)
      : String(profile.baseUrl || '').trim();
    const next = {
      ...sourceDraft,
      ...profile,
      enabled: true,
      activeProfileId: profile.id,
      profiles: sourceDraft.profiles.map((item) => (
        item.id === profile.id
          ? {
              ...item,
              name: String(item.name || '未命名 API').trim(),
              note: String(item.note || '').trim(),
              provider,
              baseUrl,
              apiKey: String(item.apiKey || '').trim(),
              model: String(item.model || '').trim(),
            }
          : item
      )),
      provider,
      baseUrl,
      apiKey: String(profile.apiKey || '').trim(),
      model: String(profile.model || '').trim(),
      note: String(profile.note || '').trim(),
    };
    if (!next.baseUrl) return setError('请填写 API 地址。'), null;
    if (!next.apiKey) return setError('请填写 API Key。'), null;
    if (!next.model) return setError('请填写模型名称。'), null;
    setError('');
    return next;
  }

  function save() {
    const next = validate();
    if (next) {
      onSave(next);
      setSaved(true);
    }
  }

  function enableProfile(profile) {
    const nextDraft = { ...draft, activeProfileId: profile.id };
    setDraft(nextDraft);
    const next = validate(profile, nextDraft);
    if (next) {
      onSave(next);
      setSaved(true);
    } else {
      setSaved(false);
    }
  }

  function saveSiteConfig() {
    onSaveUpdateSettings?.({ ...normalizeUpdateSettings(updateSettings), configUrl: updateConfigUrl.trim() });
    setSiteSaved(true);
  }

  function checkOrInstallUpdate() {
    const normalizedUpdate = normalizeUpdateSettings(updateSettings);
    const configUrl = (updateConfigUrl.trim() || normalizedUpdate.configUrl || DEFAULT_UPDATE_CONFIG_URL).trim();
    if (updateStatus?.installerPath && ['downloaded', 'downloaded-later'].includes(updateStatus?.state)) {
      onInstall?.();
      return;
    }
    if (IS_ADMIN_BUILD) {
      onSaveUpdateSettings?.({ ...normalizedUpdate, configUrl });
      setUpdateConfigUrl(configUrl);
    }
    onCheckUpdate?.({ manual: true, configUrl });
  }

  async function chooseUpdateInstaller() {
    try {
      setError('');
      const result = await onChooseUpdateInstaller?.();
      if (!result) return;
      setUpdateDraft((current) => ({
        ...current,
        fileName: result.fileName || current.fileName,
        sha256: result.sha256 || current.sha256,
        size: result.size || 0,
      }));
    } catch (chooseError) {
      setError(`选择安装包失败：${chooseError?.message || '请重新选择安装包。'}`);
    }
  }

  async function exportSignedUpdateConfig() {
    try {
      setError('');
      if (!hasConfigSigningKey()) throw new Error('当前版本缺少配置签名钥匙，请使用管理版导出 update.json。');
      const notes = String(updateDraft.notes || '')
        .split(/\r?\n/)
        .map((item) => item.trim())
        .filter(Boolean);
      const result = await onExportUpdateConfig?.({
        version: updateDraft.version,
        title: updateDraft.title || '发现新版本',
        installerUrl: updateDraft.installerUrl,
        fileName: updateDraft.fileName,
        sha256: updateDraft.sha256,
        size: updateDraft.size,
        notes,
        force: false,
      }, CONFIG_PRIVATE_KEY_BASE64);
      if (result?.path) setSiteSaved(true);
    } catch (exportError) {
      setError(`导出 update.json 失败：${exportError?.message || '请检查版本号、下载链接和签名钥匙。'}`);
    }
  }

  function test() {
    const next = validate();
    if (next) onTest(next);
  }

  async function openRunningHubLogin() {
    try {
      await onOpenExternal?.(RUNNINGHUB_LOGIN_URL);
    } catch (openError) {
      setError(`RunningHub 登录入口打开失败：${openError?.message || '请检查系统默认浏览器。'}`);
    }
  }

  async function getLatestExtensionInfo() {
    const info = await window.assetVault.getExtensionInfo?.();
    if (info) setExtensionInfo(info);
    return info || extensionInfo;
  }

  async function openExtensionFolder() {
    try {
      setExtensionMessage('');
      const info = await getLatestExtensionInfo();
      if (!info?.exists || !info.path) {
        setExtensionMessage('没有找到插件文件夹，请确认当前版本安装完整。');
        return;
      }
      const errorMessage = await window.assetVault.openPath?.(info.path);
      if (errorMessage) setExtensionMessage(`打开失败：${errorMessage}`);
    } catch (openError) {
      setExtensionMessage(`打开插件文件夹失败：${openError?.message || '请稍后重试。'}`);
    }
  }

  async function copyExtensionPath() {
    try {
      setExtensionMessage('');
      const info = await getLatestExtensionInfo();
      if (!info?.path) {
        setExtensionMessage('没有找到可复制的插件路径。');
        return;
      }
      await onCopyText?.(info.path, '插件路径已复制。');
      setExtensionMessage('插件路径已复制。');
    } catch {
      setExtensionMessage('复制插件路径失败。');
    }
  }

  async function openBrowserExtensionPage(url = 'chrome://extensions/') {
    try {
      setExtensionMessage('');
      await onOpenExternal?.(url);
    } catch (openError) {
      setExtensionMessage(`打开扩展管理页失败：${openError?.message || '可以手动在浏览器地址栏输入 chrome://extensions/'}`);
    }
  }

  async function prepareExtensionInstall(browser = 'chrome') {
    try {
      setExtensionMessage('');
      const result = await window.assetVault.prepareExtensionInstall?.(browser);
      if (result) {
        setExtensionInfo((current) => ({ ...current, ...result }));
        await onCopyText?.(result.path, '插件路径已复制。');
      }
      setExtensionMessage(browser === 'edge'
        ? '已打开 Edge 扩展页，并复制插件路径。请开启开发者模式后加载这个文件夹。'
        : '已打开 Chrome 扩展页，并复制插件路径。请开启开发者模式后加载这个文件夹。');
    } catch (installError) {
      setExtensionMessage(`准备插件失败：${installError?.message || '请确认软件安装完整。'}`);
    }
  }

  async function openPluginReleasePage() {
    try {
      setExtensionMessage('');
      await onOpenExternal?.(extensionInfo?.githubUrl || PLUGIN_RELEASE_URL);
    } catch (openError) {
      setExtensionMessage(`打开 GitHub 下载页失败：${openError?.message || '请稍后重试。'}`);
    }
  }

  async function loadModels() {
    const profile = activeProfile;
    const scrollTop = aiProfileFormRef.current?.scrollTop || 0;
    const provider = profile.provider || 'openai-compatible';
    const baseUrl = provider === 'runninghub'
      ? (profile.baseUrl.trim() || RUNNINGHUB_LLM_BASE_URL)
      : profile.baseUrl.trim();
    const partial = {
      ...profile,
      provider,
      baseUrl,
      apiKey: profile.apiKey.trim(),
      model: profile.model.trim(),
    };
    if (!partial.baseUrl) return setError('请先填写 API 地址。');
    if (!partial.apiKey) return setError('请先填写 API Key。');
    setError('');
    setModelMessage('');
    const result = await onListModels(partial);
    if (result?.models?.length) {
      setModelOptions(result.models);
      setModelMessage(`已读取 ${result.models.length} 个模型。`);
      window.requestAnimationFrame(() => {
        if (aiProfileFormRef.current) aiProfileFormRef.current.scrollTop = scrollTop;
      });
    } else if (result) {
      setModelOptions([]);
      setModelMessage('没有读取到模型列表，可以继续手动填写模型名称。');
      window.requestAnimationFrame(() => {
        if (aiProfileFormRef.current) aiProfileFormRef.current.scrollTop = scrollTop;
      });
    }
  }

  useConfirmShortcut({
    enabled: open && activeSettingsPage === 'ai' && !pendingDeleteProfile,
    onConfirm: save,
    onCancel,
  });

  if (!open) return null;
  const isRunningHub = activeProfile.provider === 'runninghub';
  return (
    <>
    <div className="modal-backdrop">
      <section className="dialog ai-dialog">
        <button className="dialog-close" title="关闭" onClick={onCancel}><X size={17} /></button>
        <h3>设置</h3>
        <p>左侧选择功能，右侧修改详细设置。</p>
        <div className="settings-app-layout">
          <aside className="settings-sidebar">
            <button
              type="button"
              className={activeSettingsPage === 'library' ? 'active' : ''}
              onClick={() => setActiveSettingsPage('library')}
            >
              <Folder size={15} />
              <span>素材库</span>
            </button>
            <button
              type="button"
              className={activeSettingsPage === 'ai' ? 'active' : ''}
              onClick={() => setActiveSettingsPage('ai')}
            >
              <Sparkles size={15} />
              <span>AI 接口</span>
            </button>
            <button
              type="button"
              className={activeSettingsPage === 'community' ? 'active' : ''}
              onClick={() => setActiveSettingsPage('community')}
            >
              <Users size={15} />
              <span>加入Ai交流群</span>
            </button>
            <button
              type="button"
              className={activeSettingsPage === 'update' ? 'active' : ''}
              onClick={() => setActiveSettingsPage('update')}
            >
              <RefreshCw size={15} />
              <span>软件更新</span>
            </button>
            <button
              type="button"
              className={activeSettingsPage === 'extension' ? 'active' : ''}
              onClick={() => setActiveSettingsPage('extension')}
            >
              <Puzzle size={15} />
              <span>素材采集插件</span>
            </button>
            {IS_ADMIN_BUILD && (
              <button
                type="button"
                className={activeSettingsPage === 'admin' ? 'active' : ''}
                onClick={() => setActiveSettingsPage('admin')}
              >
                <Settings size={15} />
                <span>管理设置</span>
              </button>
            )}
          </aside>
          <div className="settings-detail-panel">
            {activeSettingsPage === 'library' && (
              <div className="library-settings-page">
                <div className="section-label">
                  <strong>素材库</strong>
                  <span>素材、文件夹、标签、提示词和缩略图都保存在这个本地目录里。</span>
                </div>
                <div className="library-settings-card">
                  <div className="library-settings-main">
                    <span className="library-settings-icon"><Folder size={16} /></span>
                    <div>
                      <strong>当前素材库位置</strong>
                      <span title={rootPath}>{rootPath || '还没有选择素材库'}</span>
                    </div>
                  </div>
                  <div className="library-settings-meta">
                    <span>{(libraryStats?.assets || 0).toLocaleString('zh-CN')} 个素材</span>
                    <span>{(libraryStats?.folders || 0).toLocaleString('zh-CN')} 个文件夹</span>
                  </div>
                  <div className="library-settings-actions">
                    <button type="button" className="secondary-button" onClick={onOpenLibraryRoot} disabled={!rootPath}>
                      打开位置
                    </button>
                    <button type="button" className="secondary-button" onClick={onRequestSwitchLibrary}>
                      切换素材库
                    </button>
                  </div>
                </div>
                <div className="settings-note inline-note">
                  切换素材库不会移动、删除或覆盖当前素材库，只是让软件打开另一个本地素材库目录。
                </div>
              </div>
            )}
            {activeSettingsPage === 'update' && (
              <div className="library-settings-page">
                <div className="section-label">
                  <strong>软件更新</strong>
                  <span>可以主动检测新版本。发现新版后会自动下载，下载完成再提示安装，不会影响素材库数据。</span>
                </div>
                <div className="library-settings-card update-settings-card">
                  <div className="library-settings-main">
                    <span className="library-settings-icon"><RefreshCw size={16} /></span>
                    <div>
                      <strong>当前版本 {formatVersionLabel(appVersion)}</strong>
                      <span>
                        {updateStatus?.state === 'checking'
                          ? '正在检测新版本...'
                          : updateStatus?.state === 'downloading'
                            ? `正在下载更新 ${Math.round(updateStatus?.percent || 0)}%`
                            : updateStatus?.state === 'downloaded' || updateStatus?.state === 'downloaded-later'
                              ? `新版 ${formatVersionLabel(updateStatus?.latestVersion || updateStatus?.update?.version)} 已下载完成`
                              : updateStatus?.state === 'latest'
                                ? '已经是最新版本'
                                : updateStatus?.state === 'failed'
                                  ? (updateStatus?.message || '更新检测失败，可以稍后重试')
                                  : '点击右侧按钮检查是否有新版'}
                      </span>
                    </div>
                  </div>
                  <div className="library-settings-meta">
                    {normalizeUpdateSettings(updateSettings).lastCheckedAt && <span>上次检测 {formatDate(normalizeUpdateSettings(updateSettings).lastCheckedAt)}</span>}
                    {updateStatus?.latestVersion && <span>最新 {formatVersionLabel(updateStatus.latestVersion)}</span>}
                  </div>
                  <div className="library-settings-actions">
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={checkOrInstallUpdate}
                      disabled={updateStatus?.state === 'checking' || updateStatus?.state === 'downloading'}
                    >
                      <RefreshCw size={14} className={updateStatus?.state === 'checking' || updateStatus?.state === 'downloading' ? 'spin-icon' : ''} />
                      {updateStatus?.state === 'checking'
                        ? '检查中'
                        : updateStatus?.state === 'downloading'
                          ? '下载中'
                          : updateStatus?.installerPath && ['downloaded', 'downloaded-later'].includes(updateStatus?.state)
                            ? '现在安装'
                            : '检测新版本'}
                    </button>
                  </div>
                </div>
                <div className="settings-note inline-note">
                  更新前会先保存当前素材库。软件升级不会删除素材、文件夹、标签、反推提示词和来源信息。
                </div>
              </div>
            )}
            {activeSettingsPage === 'extension' && (
              <div className="library-settings-page">
                <div className="section-label">
                  <strong>素材采集插件</strong>
                  <span>插件用于在浏览器里扫描网页素材，再收集到本地素材库。软件会先准备好插件，浏览器里需要用户确认加载一次。</span>
                </div>
                <div className="plugin-install-card">
                  <div className="plugin-install-head">
                    <span className="library-settings-icon"><Puzzle size={16} /></span>
                    <div>
                      <strong>{extensionInfo?.name || 'Cyrus 素材采集插件'}</strong>
                      <span>{extensionInfo?.version ? `插件版本 ${extensionInfo.version}` : '安装后可在浏览器扩展里启用'}</span>
                    </div>
                  </div>
                  <div className="plugin-install-hero">
                    <div>
                      <strong>安装浏览器采集插件</strong>
                      <span>点击后自动打开扩展管理页，并复制插件文件夹路径。</span>
                    </div>
                    <div className="plugin-install-buttons">
                      <button type="button" className="primary-button" onClick={() => prepareExtensionInstall('chrome')}>
                        <Puzzle size={14} />
                        安装到 Chrome
                      </button>
                      <button type="button" className="secondary-button" onClick={() => prepareExtensionInstall('edge')}>
                        <Puzzle size={14} />
                        安装到 Edge
                      </button>
                    </div>
                  </div>
                  <div className="plugin-path-box">
                    <span>插件文件夹</span>
                    <strong title={extensionInfo?.path || ''}>{extensionInfo?.path || '正在读取插件路径...'}</strong>
                  </div>
                  <div className="plugin-action-grid">
                    <button type="button" className="secondary-button" onClick={openExtensionFolder}>
                      <Folder size={14} />
                      打开插件文件夹
                    </button>
                    <button type="button" className="secondary-button" onClick={copyExtensionPath}>
                      <Copy size={14} />
                      复制插件路径
                    </button>
                    <button type="button" className="secondary-button" onClick={() => openBrowserExtensionPage(extensionInfo?.chromeExtensionsUrl || 'chrome://extensions/')}>
                      <ExternalLink size={14} />
                      打开 Chrome 扩展页
                    </button>
                    <button type="button" className="secondary-button" onClick={() => openBrowserExtensionPage(extensionInfo?.edgeExtensionsUrl || 'edge://extensions/')}>
                      <ExternalLink size={14} />
                      打开 Edge 扩展页
                    </button>
                  </div>
                  {extensionMessage && <div className="settings-success small-success">{extensionMessage}</div>}
                </div>
                <div className="plugin-steps">
                  <div>
                    <span>1</span>
                    <strong>点击安装按钮</strong>
                    <p>软件会打开浏览器扩展页，并把插件路径复制好。</p>
                  </div>
                  <div>
                    <span>2</span>
                    <strong>开启开发者模式</strong>
                    <p>扩展页面右上角一般会有“开发者模式”开关。</p>
                  </div>
                  <div>
                    <span>3</span>
                    <strong>加载插件文件夹</strong>
                    <p>点击“加载已解压的扩展程序”，选择上面的插件文件夹。</p>
                  </div>
                </div>
                <div className="site-settings-actions">
                  <div className="site-settings-summary">
                    <strong>GitHub 单独下载</strong>
                    <span>如果安装包里没有插件，或想单独更新插件，可以去 Release 页面下载插件压缩包。</span>
                  </div>
                  <button type="button" className="secondary-button" onClick={openPluginReleasePage}>
                    <ExternalLink size={14} />
                    打开 GitHub
                  </button>
                </div>
              </div>
            )}
            {activeSettingsPage === 'community' && (
              <div className="library-settings-page">
                <div className="section-label">
                  <strong>加入Ai交流群</strong>
                  <span>扫码添加好友，加入 Cyrus Ai素材管理交流群，方便获取使用帮助和后续功能通知。</span>
                </div>
                <div className="community-qr-card">
                  <div className="community-qr-frame">
                    <img src={AI_GROUP_QR_IMAGE} alt="加入Ai交流群二维码" />
                  </div>
                  <div className="community-qr-copy">
                    <strong>微信扫码加入</strong>
                    <span>打开微信扫一扫，添加后备注 Cyrus，即可加入交流群。</span>
                  </div>
                </div>
              </div>
            )}
            {activeSettingsPage === 'ai' && (
              <div className="ai-settings-layout">
          <div className="ai-profile-list">
            {draft.profiles.map((profile) => (
              <div
                className={`ai-profile-item ${profile.id === draft.activeProfileId ? 'active' : ''}`}
                key={profile.id}
              >
                <button
                  type="button"
                  className="profile-select"
                  onClick={() => selectProfile(profile.id)}
                >
                  <strong>{profile.name || '未命名 API'}</strong>
                  <span>{profile.model || '未填写模型'}</span>
                </button>
                <div className="profile-actions">
                  <button
                    type="button"
                    className={profile.id === draft.activeProfileId ? 'is-active' : ''}
                    title={profile.id === draft.activeProfileId ? '当前正在使用' : '启用这个 API'}
                    onClick={() => enableProfile(profile)}
                  >
                    {profile.id === draft.activeProfileId ? '已启用' : '启用'}
                  </button>
                  <button type="button" title="改名字" onClick={() => renameProfile(profile.id)}>
                    <Pencil size={12} />
                  </button>
                  <button
                    type="button"
                    className="danger"
                    title="删除"
                    disabled={draft.profiles.length <= 1}
                    onClick={() => requestDeleteProfile(profile)}
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            ))}
            <button className="add-profile-button" onClick={addProfile}>新增 API</button>
          </div>
          <div className="ai-profile-form" ref={aiProfileFormRef}>
            <div className="api-settings-card">
              <div className="section-label">
                <strong>API 设置</strong>
                <span>这里保存的是当前选中的 API 方案。</span>
              </div>
              <label className="settings-field">
                <span>方案名称</span>
                <input
                  ref={nameInputRef}
                  value={activeProfile.name}
                  onChange={(event) => updateActiveProfile({ name: event.target.value })}
                  placeholder="例如 OpenRouter / 硅基流动 / 公司中转"
                />
              </label>
              <label className="settings-field">
                <span>备注</span>
                <input
                  value={activeProfile.note}
                  onChange={(event) => updateActiveProfile({ note: event.target.value })}
                  placeholder="例如便宜、速度快、备用、专门看图"
                />
              </label>
              <label className="settings-field">
                <span>服务类型</span>
                <select
                  value={activeProfile.provider}
                  onChange={(event) => {
                    const provider = event.target.value;
                    updateActiveProfile({
                      provider,
                      baseUrl: provider === 'runninghub' ? RUNNINGHUB_LLM_BASE_URL : activeProfile.baseUrl,
                      model: provider === 'runninghub' && !activeProfile.model ? 'bytedance/doubao-seed-2.0-pro' : activeProfile.model,
                    });
                  }}
                >
                  <option value="openai-compatible">OpenAI 兼容 / 第三方聚合</option>
                  <option value="runninghub">RunningHub LLM 专用</option>
                </select>
              </label>
              <label className="settings-field">
                <span>{isRunningHub ? 'RunningHub LLM 网关' : 'API 地址'}</span>
                <input
                  value={isRunningHub ? (activeProfile.baseUrl || RUNNINGHUB_LLM_BASE_URL) : activeProfile.baseUrl}
                  onChange={(event) => updateActiveProfile({ baseUrl: event.target.value })}
                  placeholder={isRunningHub ? RUNNINGHUB_LLM_BASE_URL : '例如 https://api.openai.com/v1 或聚合接口地址'}
                />
              </label>
              <label className="settings-field">
                <span>API Key</span>
                <input
                  type="password"
                  value={activeProfile.apiKey}
                  onChange={(event) => updateActiveProfile({ apiKey: event.target.value })}
                  placeholder="sk-..."
                />
              </label>
              {isRunningHub && (
                <div className="provider-login-card">
                  <div>
                    <strong>RunningHub 登录入口</strong>
                    <span>登录 RH 后可进入用户中心，获取或管理 API Key。</span>
                  </div>
                  <button type="button" onClick={openRunningHubLogin}>
                    <ExternalLink size={14} />
                    注册RunningHub开启Ai管理
                  </button>
                </div>
              )}
              <label className="settings-field">
                <span>模型名称</span>
                <input
                  value={activeProfile.model}
                  onChange={(event) => updateActiveProfile({ model: event.target.value })}
                  placeholder={isRunningHub ? '例如 bytedance/doubao-seed-2.0-pro' : '例如 gpt-4o-mini、qwen-vl-plus 等'}
                />
              </label>
              <div className="model-picker">
                <div className="model-picker-actions">
                  <button type="button" onClick={loadModels} disabled={loadingModels}>{loadingModels ? '读取中' : '获取模型'}</button>
                  <input
                    value={modelQuery}
                    onChange={(event) => setModelQuery(event.target.value)}
                    placeholder="搜索模型"
                    disabled={!modelOptions.length}
                  />
                </div>
                {modelMessage && <span className="model-picker-message">{modelMessage}</span>}
                {modelOptions.length > 0 && (
                  <div className="model-option-list">
                    <button
                      className="model-option-close"
                      type="button"
                      title="收起模型列表"
                      onClick={() => {
                        setModelOptions([]);
                        setModelQuery('');
                        setModelMessage('');
                      }}
                    >
                      <X size={15} strokeWidth={2.2} />
                    </button>
                    <div className="model-option-items">
                      {modelOptions
                        .filter((model) => model.id.toLowerCase().includes(modelQuery.trim().toLowerCase()))
                        .slice(0, 80)
                        .map((model) => (
                          <button
                            className={activeProfile.model === model.id ? 'active' : ''}
                            key={model.id}
                            type="button"
                            title={`${model.id} · ${model.vision ? '支持看图' : '文本模型'}${model.owner ? ` · ${model.owner}` : ''}`}
                            onClick={() => {
                              if (!model.vision) {
                                setError('这个模型不适合图片识别，请选择支持看图的模型。');
                                return;
                              }
                              setError('');
                              updateActiveProfile({ model: model.id });
                              setModelOptions([]);
                              setModelQuery('');
                              setModelMessage(`已选用模型：${model.id}`);
                            }}
                          >
                            {model.id}
                          </button>
                        ))}
                    </div>
                  </div>
                )}
              </div>
              <div className="api-settings-footer">
                <span>{IS_ADMIN_BUILD ? '保存当前选中的 API 方案，不影响广告和更新地址。' : '保存当前选中的 API 设置。'}</span>
              <button className="primary-button" onClick={save}>保存 API 设置</button>
            </div>
          </div>
              </div>
              </div>
            )}
            {IS_ADMIN_BUILD && activeSettingsPage === 'admin' && (
              !showAdminSiteSettings ? (
                <div className="admin-site-toggle">
                  <div>
                    <strong>广告与更新（管理员）</strong>
                    <span>普通用户默认不显示。点开后才能设置 ads.json 和 update.json。</span>
                  </div>
                  <button type="button" className="secondary-button" onClick={() => setShowAdminSiteSettings(true)}>
                    展开管理员设置
                  </button>
                </div>
              ) : (
                <div className="site-settings-card">
                  <div className="site-settings-head">
                    <div>
                      <strong>广告与更新（管理员）</strong>
                      <span>广告配置在“管理广告”里保存；update.json 地址只需要在这里保存一次。</span>
                    </div>
                    <div className="site-settings-head-actions">
                      <button type="button" className="secondary-button" onClick={() => setShowAdminSiteSettings(false)}>
                        收起管理员设置
                      </button>
                      <button type="button" onClick={saveSiteConfig} className="secondary-button">
                        保存广告/更新
                      </button>
                    </div>
                  </div>
                  <div className="site-settings-grid">
                    <label className="settings-field compact-field">
                      <span>update.json 地址</span>
                      <input
                        value={updateConfigUrl}
                        onChange={(event) => {
                          setUpdateConfigUrl(event.target.value);
                          setSiteSaved(false);
                        }}
                        placeholder="例如 https://你的域名/update.json"
                      />
                    </label>
                    <div className="site-settings-actions">
                      <div className="site-settings-summary">
                        <strong>素材详情广告位</strong>
                        <span>广告图片和跳转链接单独在广告管理里维护。</span>
                      </div>
                      <button type="button" className="secondary-button" onClick={onOpenAdManager}>
                        <ImageIcon size={14} />
                        管理广告
                      </button>
                    </div>
                  </div>
                  <div className="signed-update-builder">
                    <div className="section-label">
                      <strong>生成 update.json（带签名）</strong>
                      <span>安装包仍然上传到 GitHub Release，这里只生成给 GitHub Pages 使用的更新配置文件。</span>
                    </div>
                    <div className="signed-update-grid">
                      <label className="settings-field compact-field">
                        <span>新版版本号</span>
                        <input
                          value={updateDraft.version}
                          onChange={(event) => setUpdateDraft((current) => ({ ...current, version: event.target.value }))}
                          placeholder="例如 1.0.3"
                        />
                      </label>
                      <label className="settings-field compact-field">
                        <span>安装包下载链接</span>
                        <input
                          value={updateDraft.installerUrl}
                          onChange={(event) => setUpdateDraft((current) => ({ ...current, installerUrl: event.target.value }))}
                          placeholder="GitHub Release 里的 exe 下载链接"
                        />
                      </label>
                      <label className="settings-field compact-field">
                        <span>安装包文件名</span>
                        <input
                          value={updateDraft.fileName}
                          onChange={(event) => setUpdateDraft((current) => ({ ...current, fileName: event.target.value }))}
                          placeholder="例如 Cyrus-Ai-Asset-Manager-User-v1.0.3.exe"
                        />
                      </label>
                      <label className="settings-field compact-field">
                        <span>SHA256 校验值</span>
                        <input
                          value={updateDraft.sha256}
                          onChange={(event) => setUpdateDraft((current) => ({ ...current, sha256: event.target.value }))}
                          placeholder="选择本地安装包后自动填写"
                        />
                      </label>
                      <label className="settings-field compact-field wide">
                        <span>更新说明</span>
                        <textarea
                          value={updateDraft.notes}
                          onChange={(event) => setUpdateDraft((current) => ({ ...current, notes: event.target.value }))}
                          placeholder="一行一条，例如：修复模型选择列表体验"
                        />
                      </label>
                    </div>
                    <div className="signed-update-actions">
                      <button type="button" className="secondary-button" onClick={chooseUpdateInstaller}>
                        选择安装包并计算校验
                      </button>
                      <button type="button" className="primary-button" onClick={exportSignedUpdateConfig}>
                        导出带签名 update.json
                      </button>
                    </div>
                  </div>
                  {siteSaved && <div className="settings-success small-success">广告和更新地址已保存。</div>}
                  <div className="site-settings-footer">
                    <div>
                      <strong>软件更新</strong>
                      <span>
                        当前版本 {formatVersionLabel(appVersion)}
                        {updateStatus?.latestVersion ? ` · 最新版本 ${formatVersionLabel(updateStatus.latestVersion)}` : ''}
                      </span>
                    </div>
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={checkOrInstallUpdate}
                      disabled={updateStatus?.state === 'checking' || updateStatus?.state === 'downloading'}
                    >
                      <RefreshCw size={14} className={updateStatus?.state === 'checking' || updateStatus?.state === 'downloading' ? 'spin-icon' : ''} />
                      {updateStatus?.state === 'checking'
                        ? '检查中'
                        : updateStatus?.state === 'downloading'
                          ? '下载中'
                          : updateStatus?.installerPath && ['downloaded', 'downloaded-later'].includes(updateStatus?.state)
                            ? '现在安装'
                            : '检查更新'}
                    </button>
                  </div>
                </div>
              )
            )}
          </div>
        </div>
        {activeSettingsPage === 'ai' && (
          <div className="settings-note">
            {isRunningHub
              ? 'RunningHub LLM 模式会自动使用 llm.runninghub.cn 的 OpenAI 兼容网关。连接测试会读取模型列表并发送一次短文本；生成标签或反推时才会上传所选图片。'
              : 'API Key 只保存在当前本地素材库配置里。连接测试只发送短文本；生成标签时才会上传所选图片给你配置的 AI 服务。'}
          </div>
        )}
        {saved && <div className="settings-success">保存成功，当前选中的 API 方案已生效。</div>}
        {error && <p className="form-error">{error}</p>}
        <div className="dialog-actions">
          <button onClick={onCancel}>关闭</button>
          {activeSettingsPage === 'ai' && <button onClick={test} disabled={testing}>{testing ? '测试中' : '测试连接'}</button>}
        </div>
      </section>
    </div>
    {pendingDeleteProfile && (
      <ConfirmActionDialog
        title="删除 API 配置方案"
        message={`将删除“${pendingDeleteProfile.name || '未命名 API'}”这套本地 API 配置。不会影响你的平台账号，但删除后如果没有保存过，当前填写内容无法恢复。`}
        items={[pendingDeleteProfile.name || '未命名 API']}
        confirmText="删除方案"
        onCancel={() => setPendingDeleteProfile(null)}
        onConfirm={deleteProfile}
      />
    )}
    </>
  );
}

function Notice({ notice, onClose }) {
  if (!notice) return null;
  return (
    <div className={`notice ${notice.type || 'info'} ${notice.placement === 'center' ? 'center' : ''}`}>
      <span>{notice.message}</span>
      <button onClick={onClose}><X size={14} /></button>
    </div>
  );
}

function TaskToast({ tasks, failedAssets, batchAiTask, batchPromptTask, onRetryFailed, onIgnoreFailed, onRetryBatchAi, onRetryBatchPrompt }) {
  const runningCount = tasks.length;
  const failedCount = failedAssets.length;
  if (!runningCount && !failedCount && !batchAiTask && !batchPromptTask) return null;
  const currentTask = tasks[0];
  const failedPreview = failedAssets.slice(0, 2).map((asset) => asset.originalName || asset.name).join('、');
  const batchTask = batchPromptTask || batchAiTask;
  if (batchTask) {
    const percent = batchTask.total ? Math.round((batchTask.completed / batchTask.total) * 100) : 0;
    const isPromptTask = batchTask.type === 'prompt';
    return (
      <div className={`task-toast ${batchTask.failed ? 'has-failed' : ''}`}>
        <div>
          <strong>{batchTask.done ? (isPromptTask ? '提示词反推完成' : 'AI 标签处理完成') : (isPromptTask ? '正在批量反推提示词' : '正在批量生成 AI 标签')}</strong>
          <span>共 {batchTask.total} 张 · 已完成 {batchTask.completed} · 成功 {batchTask.success} · 失败 {batchTask.failed} · {percent}%</span>
        </div>
        {batchTask.done && batchTask.failed > 0 && (
          <div className="task-toast-actions">
            <button onClick={isPromptTask ? onRetryBatchPrompt : onRetryBatchAi}>重试失败项</button>
          </div>
        )}
      </div>
    );
  }
  return (
    <div className={`task-toast ${failedCount ? 'has-failed' : ''}`}>
      <div>
        <strong>{runningCount ? `正在整理 ${runningCount} 个素材` : `${failedCount} 个素材整理失败`}</strong>
        <span>
          {runningCount
            ? `${currentTask.stage}：${currentTask.name}`
            : `${failedPreview || '部分素材'} 处理失败，可重试或检查文件是否损坏`}
        </span>
      </div>
      {failedCount > 0 && (
        <div className="task-toast-actions">
          <button onClick={onRetryFailed}>重试失败项</button>
          <button onClick={onIgnoreFailed}>忽略提醒</button>
        </div>
      )}
    </div>
  );
}

function UpdateToast({ status, hidden, onClose }) {
  if (hidden || !status) return null;
  if (!['checking', 'downloading', 'failed'].includes(status.state)) return null;
  const isFailed = status.state === 'failed';
  const title = isFailed
    ? (status.retryExhausted ? '更新仍失败' : '更新失败')
    : status.state === 'checking'
      ? '检查更新中'
      : `新版本 ${status.latestVersion || ''}`;
  const subtitle = isFailed
    ? (status.retryExhausted ? '下次启动再试' : '10 分钟后重试')
    : status.state === 'checking'
      ? '正在读取配置'
      : `下载中 ${Math.max(0, Math.min(100, Math.round(status.percent || 0)))}%`;
  return (
    <div className={`update-toast ${isFailed ? 'has-failed' : ''}`}>
      <div>
        <strong>{title}</strong>
        <span>{subtitle}</span>
      </div>
      {status.state === 'downloading' && (
        <div className="update-progress-track">
          <i style={{ width: `${Math.max(2, Math.min(100, status.percent || 0))}%` }} />
        </div>
      )}
      {isFailed && <button title="关闭提示" onClick={onClose}><X size={14} /></button>}
    </div>
  );
}

function UpdateInstallDialog({ status, onCancel, onInstall }) {
  useConfirmShortcut({
    enabled: status?.state === 'downloaded' && !!status.update,
    onConfirm: onInstall,
    onCancel,
  });
  if (status?.state !== 'downloaded' || !status.update) return null;
  return (
    <div className="modal-backdrop">
      <section className="dialog update-install-dialog">
        <h3>新版本已下载</h3>
        <p>版本：{formatVersionLabel(status.update.version)}</p>
        <div className="update-notes">
          <strong>更新内容</strong>
          {(status.update.notes?.length ? status.update.notes : ['优化软件稳定性和使用体验。']).map((note) => (
            <span key={note}>- {note}</span>
          ))}
        </div>
        <p className="update-safe-note">现在安装会先备份素材库数据库。你的素材、文件夹、标签、反推提示词和来源信息都会保留。</p>
        <div className="dialog-actions">
          <button onClick={onCancel}>稍后安装</button>
          <button className="primary-button" onClick={onInstall}>现在安装并重启</button>
        </div>
      </section>
    </div>
  );
}

function App() {
  const [rootPath, setRootPath] = useState(() => localStorage.getItem('assetVaultRoot') || '');
  const [database, setDatabase] = useState(null);
  const [selectedFolderId, setSelectedFolderId] = useState(() => localStorage.getItem('assetVaultSelectedFolder') || 'all');
  const [selectedAssetId, setSelectedAssetId] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [sortState, setSortState] = useState({ key: 'createdAt', direction: 'desc' });
  const [query, setQuery] = useState('');
  const [viewMode, setViewMode] = useState(() => localStorage.getItem('assetVaultViewMode') || 'masonry');
  const [theme, setTheme] = useState(() => localStorage.getItem('assetVaultTheme') || 'dark');
  const [thumbnailSize, setThumbnailSize] = useState(() => {
    const saved = Number(localStorage.getItem('assetVaultThumb')) || THUMBNAIL_DEFAULT;
    return Math.max(THUMBNAIL_MIN, Math.min(THUMBNAIL_MAX, saved));
  });
  const [previewId, setPreviewId] = useState(null);
  const [restorePreviewAssetId, setRestorePreviewAssetId] = useState(null);
  const [deleteFolderId, setDeleteFolderId] = useState(null);
  const [folderDialog, setFolderDialog] = useState(null);
  const [pendingDeleteIds, setPendingDeleteIds] = useState([]);
  const [folderDropAction, setFolderDropAction] = useState(null);
  const [duplicateImportItems, setDuplicateImportItems] = useState([]);
  const [notice, setNotice] = useState(null);
  const [contextMenu, setContextMenu] = useState(null);
  const [folderContextMenu, setFolderContextMenu] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [importProgress, setImportProgress] = useState(null);
  const [showBatchBar, setShowBatchBar] = useState(false);
  const [batchBarOpen, setBatchBarOpen] = useState(false);
  const [batchBarCount, setBatchBarCount] = useState(0);
  const [aiDialogOpen, setAiDialogOpen] = useState(false);
  const [rhGuideOpen, setRhGuideOpen] = useState(false);
  const [adDialogOpen, setAdDialogOpen] = useState(false);
  const [exportDataDialogOpen, setExportDataDialogOpen] = useState(false);
  const [librarySwitchPending, setLibrarySwitchPending] = useState(false);
  const [aiTesting, setAiTesting] = useState(false);
  const [aiModelsLoading, setAiModelsLoading] = useState(false);
  const [aiBusyAssetId, setAiBusyAssetId] = useState(null);
  const [batchAiTask, setBatchAiTask] = useState(null);
  const [batchPromptTask, setBatchPromptTask] = useState(null);
  const [promptBusyAssetId, setPromptBusyAssetId] = useState(null);
  const [appVersion, setAppVersion] = useState('');
  const [updateStatus, setUpdateStatus] = useState({ state: 'idle', percent: 0 });
  const [updateToastHidden, setUpdateToastHidden] = useState(false);
  const promptRequestRef = useRef(null);
  const cancelledPromptRequestsRef = useRef(new Set());
  const analyzingRef = useRef(new Set());
  const selectionAnchorRef = useRef(null);
  const updateAutoCheckedRef = useRef('');
  const updateRetryTimerRef = useRef(null);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('assetVaultTheme', theme);
  }, [theme]);

  useEffect(() => {
    window.assetVault.getAppVersion?.().then((result) => {
      setAppVersion(result?.version || '');
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!window.assetVault.onUpdateProgress) return undefined;
    return window.assetVault.onUpdateProgress((progress) => {
      setUpdateToastHidden(false);
      setUpdateStatus((current) => ({
        ...current,
        state: progress.state || current.state,
        percent: progress.percent ?? current.percent ?? 0,
        latestVersion: progress.version || current.latestVersion || '',
        message: progress.message || current.message || '',
        updatedAt: progress.updatedAt || new Date().toISOString(),
      }));
    });
  }, []);

  useEffect(() => {
    if (updateRetryTimerRef.current) {
      clearTimeout(updateRetryTimerRef.current);
      updateRetryTimerRef.current = null;
    }
    if (updateStatus.state !== 'failed' || updateToastHidden) return undefined;
    updateRetryTimerRef.current = setTimeout(() => {
      setUpdateToastHidden(true);
      updateRetryTimerRef.current = null;
    }, 3000);
    return () => {
      if (updateRetryTimerRef.current) {
        clearTimeout(updateRetryTimerRef.current);
        updateRetryTimerRef.current = null;
      }
    };
  }, [updateStatus.state, updateToastHidden]);

  useEffect(() => () => {
    if (updateRetryTimerRef.current) clearTimeout(updateRetryTimerRef.current);
  }, []);

  useEffect(() => {
    localStorage.setItem('assetVaultThumb', String(thumbnailSize));
  }, [thumbnailSize]);

  useEffect(() => {
    localStorage.setItem('assetVaultViewMode', viewMode);
  }, [viewMode]);

  useEffect(() => {
    localStorage.setItem('assetVaultSelectedFolder', selectedFolderId);
  }, [selectedFolderId]);

  useEffect(() => {
    if (!database) return;
    if (['all', 'unprompted', 'untagged', 'trash'].includes(selectedFolderId)) return;
    if (database.folders.some((folder) => folder.id === selectedFolderId)) return;
    setSelectedFolderId('all');
  }, [database, selectedFolderId]);

  useEffect(() => {
    if (!rootPath) return;
    window.assetVault.setActiveRoot?.(rootPath);
    window.assetVault.loadLibrary(rootPath).then((result) => {
      if (result?.database) setDatabase(normalizeDatabase(result.database));
    }).catch(() => {
      localStorage.removeItem('assetVaultRoot');
      setRootPath('');
    });
  }, [rootPath]);

  useEffect(() => {
    if (!window.assetVault.onExtensionImported) return undefined;
    return window.assetVault.onExtensionImported((result) => {
      if (!result?.database) return;
      const normalized = normalizeDatabase(result.database);
      setDatabase(normalized);
      if (result.imported?.[0]) {
        setSelectedFolderId(result.imported[0].folderId || 'all');
        setSelectedAssetId(result.imported[0].id);
        setSelectedIds([result.imported[0].id]);
      }
      showImportSummary(result);
      if (result.failed?.length) {
        const failedPreview = result.failed.slice(0, 2).map((item) => item.reason).join('；');
        setNotice({ type: 'error', message: `网页收集有 ${result.failed.length} 个失败：${failedPreview}` });
      }
    });
  }, []);

  useEffect(() => {
    if (!window.assetVault.onImportProgress) return undefined;
    return window.assetVault.onImportProgress((progress) => {
      setImportProgress(progress);
    });
  }, []);

  useEffect(() => {
    if (!importProgress || importProgress.state !== 'done') return undefined;
    const timeout = setTimeout(() => setImportProgress(null), 5000);
    return () => clearTimeout(timeout);
  }, [importProgress]);

  useEffect(() => {
    if (!rootPath || !database) return;
    let cancelled = false;
    const timeout = setTimeout(async () => {
      try {
        const saved = await window.assetVault.saveLibrary(rootPath, database);
        if (!cancelled && saved && JSON.stringify(saved) !== JSON.stringify(database)) {
          setDatabase(normalizeDatabase(saved));
        }
      } catch {}
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [database, rootPath]);

  useEffect(() => {
    if (!database) return;
    const pending = database.assets
      .filter((asset) => {
        if (isTrashedAsset(asset)) return false;
        const needsMeta = !asset.width || !asset.colors?.length || asset.colorVersion !== COLOR_ANALYSIS_VERSION;
        const needsThumbnail = !asset.thumbnail || asset.thumbnailVersion !== THUMBNAIL_CACHE_VERSION;
        const retryableFailedThumbnail = needsThumbnail && (asset.analysisAttempts || 0) < 3;
        return (asset.analysisStatus !== 'failed' || retryableFailedThumbnail)
          && (needsMeta || needsThumbnail)
          && !analyzingRef.current.has(asset.id);
      })
      .slice(0, 3);
    pending.forEach((asset) => analyzeAsset(asset));
  }, [database]);

  useEffect(() => {
    async function handleKeyDown(event) {
      const tag = event.target?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || event.target?.isContentEditable) return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'c' && selectedIds.length) {
        event.preventDefault();
        await copyAssetFiles(selectedIds);
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'v') {
        event.preventDefault();
        try {
          const paths = await window.assetVault.readFilesFromClipboard?.();
          if (paths?.length) {
            await importDropped(paths);
            setNotice({ type: 'success', message: `已从剪贴板导入 ${paths.length} 个文件。` });
          } else {
            const imageFile = await window.assetVault.readImageFileFromClipboard?.();
            if (imageFile?.path) {
              await importDropped([imageFile.path], getCurrentImportFolderId());
            } else {
              setNotice({ type: 'info', message: '剪贴板里没有可导入的素材。' });
            }
          }
        } catch (error) {
          setNotice({ type: 'error', message: `粘贴导入失败：${error?.message || '剪贴板内容无法读取。'}` });
        }
        return;
      }
      if (event.key === 'Delete' && selectedIds.length) {
        event.preventDefault();
        requestDeleteAssets(selectedIds);
      }
      if (event.key === 'Escape') {
        setSelectedIds([]);
        setContextMenu(null);
      }
    }
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [selectedIds, database, rootPath, selectedFolderId]);

  useEffect(() => {
    if (!notice) return undefined;
    const timeout = setTimeout(() => setNotice(null), 3600);
    return () => clearTimeout(timeout);
  }, [notice]);

  useEffect(() => {
    if (selectedIds.length > 0) {
      setBatchBarCount(selectedIds.length);
      setShowBatchBar(true);
      setBatchBarOpen(true);
      return undefined;
    }
    setBatchBarOpen(false);
    const timeout = setTimeout(() => setShowBatchBar(false), 520);
    return () => clearTimeout(timeout);
  }, [selectedIds.length]);

  useEffect(() => {
    if (!batchAiTask?.done || batchAiTask.failed > 0) return undefined;
    const timeout = setTimeout(() => setBatchAiTask(null), 4200);
    return () => clearTimeout(timeout);
  }, [batchAiTask]);

  useEffect(() => {
    if (!batchPromptTask?.done || batchPromptTask.failed > 0) return undefined;
    const timeout = setTimeout(() => setBatchPromptTask(null), 4200);
    return () => clearTimeout(timeout);
  }, [batchPromptTask]);

  useEffect(() => {
    if (!contextMenu && !folderContextMenu) return undefined;
    function handlePointerDown(event) {
      if (!event.target.closest('.context-menu')) {
        setContextMenu(null);
        setFolderContextMenu(null);
      }
    }
    window.addEventListener('pointerdown', handlePointerDown);
    return () => window.removeEventListener('pointerdown', handlePointerDown);
  }, [contextMenu, folderContextMenu]);

  async function applyLibraryRootResult(result, options = {}) {
    if (!result) return;
    if (result.error) return result;
    setRootPath(result.rootPath);
    setDatabase(normalizeDatabase(result.database));
    setSelectedFolderId('all');
    setSelectedAssetId(null);
    setSelectedIds([]);
    setPreviewId(null);
    localStorage.setItem('assetVaultRoot', result.rootPath);
    localStorage.setItem('assetVaultSelectedFolder', 'all');
    if (options.notify) {
      setNotice({ type: 'success', message: '素材库已切换。' });
    }
    return result;
  }

  async function chooseRoot(options = {}) {
    const result = await window.assetVault.chooseRoot();
    return applyLibraryRootResult(result, options);
  }

  async function selectExistingRoot(options = {}) {
    const result = await window.assetVault.selectExistingRoot?.();
    return applyLibraryRootResult(result, options);
  }

  async function createNewRoot(options = {}) {
    const result = await window.assetVault.createRoot?.();
    return applyLibraryRootResult(result, options);
  }

  async function openCurrentLibraryRoot() {
    if (!rootPath) return;
    try {
      const errorMessage = await window.assetVault.openPath?.(rootPath);
      if (errorMessage) setNotice({ type: 'error', message: `打开失败：${errorMessage}` });
    } catch (error) {
      setNotice({ type: 'error', message: `打开失败：${error?.message || '请检查素材库路径是否存在。'}` });
    }
  }

  async function confirmSwitchLibrary() {
    setLibrarySwitchPending(false);
    const result = await selectExistingRoot({ notify: true });
    if (result?.error) setNotice({ type: 'error', message: result.message || '没有找到可用的素材库。' });
  }

  function updateDatabase(recipe) {
    setDatabase((current) => {
      const next = structuredClone(current);
      recipe(next);
      return next;
    });
  }

  function upsertAsset(assetId, patch) {
    updateDatabase((next) => {
      const index = next.assets.findIndex((asset) => asset.id === assetId);
      if (index >= 0) next.assets[index] = { ...next.assets[index], ...patch, updatedAt: new Date().toISOString() };
    });
  }

  function showImportSummary(result) {
    const importedCount = result.imported?.length || 0;
    const skippedCount = result.duplicates?.filter((item) => item.skipped).length || 0;
    const duplicateCopyCount = result.duplicates?.filter((item) => item.imported).length || 0;
    const parts = [];
    if (importedCount) parts.push(`已导入 ${importedCount} 个素材`);
    if (skippedCount) parts.push(`跳过 ${skippedCount} 个重复`);
    if (duplicateCopyCount) parts.push(`保留 ${duplicateCopyCount} 个重复副本`);
    if (parts.length) setNotice({ type: 'success', message: `${parts.join('，')}。后台会继续整理颜色、尺寸和视频封面。` });
    const duplicateCopies = (result.duplicates || []).filter((item) => item.imported?.id);
    if (duplicateCopies.length) setDuplicateImportItems(duplicateCopies);
  }

  function getCurrentImportFolderId() {
    return ['all', 'unprompted', 'untagged', 'trash'].includes(selectedFolderId) ? 'default' : selectedFolderId;
  }

  async function importDialog() {
    try {
      const folderId = getCurrentImportFolderId();
      const result = await window.assetVault.importDialog(rootPath, folderId);
      if (!result) return;
      setDatabase(normalizeDatabase(result.database));
      if (result.imported[0]) {
        setSelectedAssetId(result.imported[0].id);
        setSelectedIds([result.imported[0].id]);
      }
      showImportSummary(result);
    } catch (error) {
      setNotice({ type: 'error', message: `导入失败：${error?.message || '请检查文件是否仍可访问。'}` });
    }
  }

  async function exportLibraryPackage(folderIds = null) {
    try {
      const options = Array.isArray(folderIds) ? { folderIds } : {};
      const result = await window.assetVault.exportLibraryPackage(rootPath, options);
      if (!result) return;
      setExportDataDialogOpen(false);
      const failed = result.failed?.length || 0;
      const scoped = Array.isArray(folderIds) && folderIds.length;
      setNotice({
        type: failed ? 'error' : 'success',
        message: failed
          ? `数据迁移导出完成：成功 ${result.exportedCount || 0} 个，失败 ${failed} 个。`
          : `${scoped ? '文件夹数据' : '全部数据'}导出完成：${result.exportedCount || 0} 个素材已打包。`,
      });
    } catch (error) {
      setNotice({ type: 'error', message: `数据迁移导出失败：${error?.message || '请选择可写入的位置。'}` });
    }
  }

  async function exportFolderData(folder) {
    if (!folder) return;
    await exportLibraryPackage([folder.id]);
  }

  async function exportFolderAssets(folder) {
    if (!folder || !database) return;
    const folderIds = getFolderDescendantIds(database.folders, folder.id);
    const assets = (database.assets || []).filter((asset) => !isTrashedAsset(asset) && folderIds.has(asset.folderId));
    if (!assets.length) {
      setNotice({ type: 'info', message: `“${folder.name}”里没有可导出的素材。` });
      return;
    }
    try {
      const result = await window.assetVault.exportAssets(assets);
      if (!result) return;
      const failed = result.failed?.length || 0;
      setNotice({
        type: failed ? 'error' : 'success',
        message: failed
          ? `文件夹素材导出完成：成功 ${result.exported?.length || 0} 个，失败 ${failed} 个。`
          : `已导出“${folder.name}”里的 ${result.exported?.length || 0} 个素材。`,
      });
    } catch (error) {
      setNotice({ type: 'error', message: `导出素材失败：${error?.message || '请选择可写入的位置。'}` });
    }
  }

  async function openFolderLocation(folder) {
    if (!folder) return;
    try {
      const errorMessage = await window.assetVault.openFolderLocation(rootPath, folder.id);
      if (errorMessage) setNotice({ type: 'error', message: `打开文件位置失败：${errorMessage}` });
    } catch (error) {
      setNotice({ type: 'error', message: `打开文件位置失败：${error?.message || '无法打开本地文件夹。'}` });
    }
  }

  async function importLibraryPackage() {
    try {
      const result = await window.assetVault.importLibraryPackage(rootPath);
      if (!result) return;
      setDatabase(normalizeDatabase(result.database));
      const imported = result.imported || [];
      if (imported[0]) {
        setSelectedFolderId(imported[0].folderId || 'all');
        setSelectedAssetId(imported[0].id);
        setSelectedIds([imported[0].id]);
      }
      const failed = result.failed?.length || 0;
      setNotice({
        type: failed ? 'error' : 'success',
        message: failed
          ? `迁移数据导入完成：成功 ${imported.length} 个，失败 ${failed} 个。当前素材库原有数据未被覆盖。`
          : `迁移数据导入完成：已合并 ${imported.length} 个素材，原有数据未被覆盖。`,
      });
    } catch (error) {
      setNotice({ type: 'error', message: `迁移数据导入失败：${error?.message || '数据包无法读取。'}` });
    }
  }

  async function importDropped(paths, targetFolderId = null, options = {}) {
    try {
      const folderId = targetFolderId || getCurrentImportFolderId();
      const result = await window.assetVault.importDropped(rootPath, paths, folderId);
      if (!result) return;
      setDatabase(normalizeDatabase(result.database));
      if (options.selectFolder && folderId) setSelectedFolderId(folderId);
      if (result.imported[0]) {
        setSelectedAssetId(result.imported[0].id);
        setSelectedIds([result.imported[0].id]);
      }
      showImportSummary(result);
    } catch (error) {
      setNotice({ type: 'error', message: `拖拽导入失败：${error?.message || '请检查文件是否仍可访问。'}` });
    }
  }

  async function saveEditedCopy(sourceAsset, dataUrl, edits) {
    try {
      const result = await window.assetVault.saveEditedCopy(rootPath, sourceAsset, dataUrl, edits);
      if (!result?.database || !result?.asset) throw new Error('没有收到新副本信息');
      setDatabase(normalizeDatabase(result.database));
      setSelectedAssetId(result.asset.id);
      setSelectedIds([result.asset.id]);
      setPreviewId(null);
      setNotice({ type: 'success', message: '已保存为新的编辑副本。' });
    } catch (error) {
      setNotice({ type: 'error', message: `保存副本失败：${error?.message || '请确认素材库目录可写。'}` });
      throw error;
    }
  }

  function requestDeleteAssets(ids) {
    const uniqueIds = [...new Set(ids)].filter(Boolean);
    if (!uniqueIds.length || !database) return;
    const targetAssets = database.assets.filter((asset) => uniqueIds.includes(asset.id));
    if (!targetAssets.length) return;
    setPendingDeleteIds(uniqueIds);
  }

  async function confirmDeleteAssets() {
    const uniqueIds = [...new Set(pendingDeleteIds)].filter(Boolean);
    if (!uniqueIds.length || !database) return;
    const permanent = selectedFolderId === 'trash' || database.assets.filter((asset) => uniqueIds.includes(asset.id)).every(isTrashedAsset);
    try {
      const result = permanent
        ? await window.assetVault.deleteAssets(rootPath, uniqueIds)
        : await window.assetVault.trashAssets(rootPath, uniqueIds);
      setDatabase(normalizeDatabase(result.database));
      setSelectedIds((current) => current.filter((id) => !uniqueIds.includes(id)));
      if (selectedAssetId && uniqueIds.includes(selectedAssetId)) setSelectedAssetId(result.database.assets[0]?.id || null);
      if (previewId && uniqueIds.includes(previewId)) setPreviewId(null);
      setPendingDeleteIds([]);
      setNotice({
        type: 'success',
        message: permanent
          ? `已永久删除 ${result.removedCount || uniqueIds.length} 个素材。`
          : `已移入回收站 ${result.trashedCount || uniqueIds.length} 个素材，30 天后自动删除。`,
      });
    } catch (error) {
      setNotice({ type: 'error', message: `删除失败：${error?.message || '请检查素材库文件权限。'}` });
    }
  }

  async function restoreAssets(assetIds = selectedIds) {
    const uniqueIds = [...new Set(assetIds)].filter(Boolean);
    if (!uniqueIds.length) return;
    try {
      const result = await window.assetVault.restoreAssets(rootPath, uniqueIds);
      setDatabase(normalizeDatabase(result.database));
      setSelectedIds([]);
      if (selectedAssetId && uniqueIds.includes(selectedAssetId)) setSelectedAssetId(uniqueIds[0]);
      setNotice({ type: 'success', message: `已恢复 ${result.restoredCount || uniqueIds.length} 个素材。` });
    } catch (error) {
      setNotice({ type: 'error', message: `恢复失败：${error?.message || '请检查素材库文件权限。'}` });
    }
  }

  async function removeDuplicateImportCopies() {
    const ids = duplicateImportItems.map((item) => item.imported?.id).filter(Boolean);
    setDuplicateImportItems([]);
    if (!ids.length) return;
    try {
      const result = await window.assetVault.deleteAssets(rootPath, ids);
      setDatabase(normalizeDatabase(result.database));
      setSelectedIds((current) => current.filter((id) => !ids.includes(id)));
      if (selectedAssetId && ids.includes(selectedAssetId)) setSelectedAssetId(result.database.assets[0]?.id || null);
      if (previewId && ids.includes(previewId)) setPreviewId(null);
      setNotice({ type: 'success', message: `已删除 ${result.removedCount || ids.length} 个本次重复导入的副本。` });
    } catch (error) {
      setNotice({ type: 'error', message: `取消重复导入失败：${error?.message || '请手动删除本次重复副本。'}` });
    }
  }

  async function analyzeAsset(asset) {
    const taskId = `${asset.id}-analyze`;
    const taskName = asset.originalName || asset.name || '未命名素材';
    const setTaskStage = (stage) => {
      setTasks((items) => {
        const nextTask = { id: taskId, assetId: asset.id, name: taskName, stage };
        return items.some((item) => item.id === taskId)
          ? items.map((item) => (item.id === taskId ? nextTask : item))
          : [...items, nextTask];
      });
    };
    analyzingRef.current.add(asset.id);
    setTaskStage('读取素材信息');
    try {
      if (asset.kind === 'video') {
        setTaskStage('生成视频封面');
        const meta = await analyzeVideo(asset.path);
        if (meta.coverFrame) {
          setTaskStage('保存视频封面');
          meta.thumbnail = await window.assetVault.saveThumbnail(rootPath, asset.id, meta.coverFrame, 'jpg');
          delete meta.coverFrame;
        }
        meta.analysisStatus = 'done';
        meta.analysisError = null;
        upsertAsset(asset.id, meta);
      } else {
        setTaskStage('分析图片颜色');
        const meta = await analyzeImage(asset.path);
        if (meta.thumbnailData) {
          setTaskStage('保存显示缓存');
          meta.thumbnail = await window.assetVault.saveThumbnail(rootPath, asset.id, meta.thumbnailData, 'jpg');
          delete meta.thumbnailData;
        }
        meta.analysisStatus = 'done';
        meta.analysisError = null;
        upsertAsset(asset.id, meta);
      }
    } catch (error) {
      upsertAsset(asset.id, {
        analysisStatus: 'failed',
        analysisAttempts: (asset.analysisAttempts || 0) + 1,
        analysisError: error?.message || '整理失败',
        analysisIgnored: false,
        autoTags: [...new Set([...(asset.autoTags || []), '整理失败', '待补充'])],
      });
      setNotice({ type: 'error', message: `整理失败：${taskName}。可在左侧“整理失败”提示中重试或忽略。` });
    } finally {
      analyzingRef.current.delete(asset.id);
      setTasks((items) => items.filter((item) => item.id !== taskId));
    }
  }

  function retryFailedAnalysis() {
    updateDatabase((next) => {
      next.assets = next.assets.map((asset) => (
        asset.analysisStatus === 'failed'
          ? {
              ...asset,
              analysisStatus: 'pending',
              analysisAttempts: 0,
              analysisError: null,
              analysisIgnored: false,
              autoTags: (asset.autoTags || []).filter((tag) => tag !== '整理失败' && tag !== '待补充'),
              updatedAt: new Date().toISOString(),
            }
          : asset
      ));
    });
    setNotice({ type: 'info', message: '已重新加入整理队列。' });
  }

  function ignoreFailedAnalysis() {
    updateDatabase((next) => {
      next.assets = next.assets.map((asset) => (
        asset.analysisStatus === 'failed'
          ? { ...asset, analysisIgnored: true, updatedAt: new Date().toISOString() }
          : asset
      ));
    });
    setNotice({ type: 'info', message: '已忽略整理失败提醒，素材仍保留，可通过“整理失败”标签筛选。' });
  }

  function analyzeImage(path) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => {
        const colorCanvas = document.createElement('canvas');
        const colorSide = 120;
        const colorRatio = Math.min(colorSide / image.naturalWidth, colorSide / image.naturalHeight, 1);
        colorCanvas.width = Math.max(1, Math.round(image.naturalWidth * colorRatio));
        colorCanvas.height = Math.max(1, Math.round(image.naturalHeight * colorRatio));
        const colorContext = colorCanvas.getContext('2d');
        colorContext.imageSmoothingEnabled = true;
        colorContext.imageSmoothingQuality = 'high';
        colorContext.drawImage(image, 0, 0, colorCanvas.width, colorCanvas.height);

        const thumbCanvas = document.createElement('canvas');
        const thumbRatio = Math.min(IMAGE_THUMBNAIL_SIDE / image.naturalWidth, IMAGE_THUMBNAIL_SIDE / image.naturalHeight, 1);
        thumbCanvas.width = Math.max(1, Math.round(image.naturalWidth * thumbRatio));
        thumbCanvas.height = Math.max(1, Math.round(image.naturalHeight * thumbRatio));
        const thumbContext = thumbCanvas.getContext('2d');
        thumbContext.imageSmoothingEnabled = true;
        thumbContext.imageSmoothingQuality = 'high';
        thumbContext.drawImage(image, 0, 0, thumbCanvas.width, thumbCanvas.height);

        const colors = dominantColorsFromCanvas(colorCanvas);
        resolve({
          width: image.naturalWidth,
          height: image.naturalHeight,
          colors,
          colorVersion: COLOR_ANALYSIS_VERSION,
          thumbnailData: thumbCanvas.toDataURL('image/jpeg', 0.9),
          thumbnailVersion: THUMBNAIL_CACHE_VERSION,
          autoTags: [...new Set(colors.map((color) => color.name).filter(Boolean))],
        });
      };
      image.onerror = reject;
      image.src = assetUrl(path);
    });
  }

  async function captureVideoFrame(video, time) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('视频帧抽取超时')), 2400);
      video.currentTime = time;
      video.onseeked = () => {
        clearTimeout(timeout);
        const canvas = document.createElement('canvas');
        const ratio = Math.min(VIDEO_THUMBNAIL_WIDTH / video.videoWidth, VIDEO_THUMBNAIL_HEIGHT / video.videoHeight, 1);
        canvas.width = Math.max(1, Math.round(video.videoWidth * ratio));
        canvas.height = Math.max(1, Math.round(video.videoHeight * ratio));
        const context = canvas.getContext('2d');
        context.imageSmoothingEnabled = true;
        context.imageSmoothingQuality = 'high';
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        const scored = scoreFrame(canvas);
        resolve({ ...scored, dataUrl: canvas.toDataURL('image/jpeg', 0.86) });
      };
      video.onerror = () => {
        clearTimeout(timeout);
        reject(new Error('视频帧抽取失败'));
      };
    });
  }

  async function analyzeVideo(path) {
    const binary = await window.assetVault.readBinary(path);
    const blob = videoBlobFromBinary(binary, path);
    const objectUrl = URL.createObjectURL(blob);
    try {
      const video = document.createElement('video');
      video.muted = true;
      video.preload = 'metadata';
      video.src = objectUrl;
      await new Promise((resolve, reject) => {
        video.onloadedmetadata = resolve;
        video.onerror = reject;
      });
      const duration = Number.isFinite(video.duration) ? video.duration : 0;
      const candidates = [0.1, 1, 3, 5, duration * 0.1, duration * 0.25].filter((time) => time >= 0 && time <= Math.max(duration - 0.05, 0));
      let best = null;
      for (const time of [...new Set(candidates)]) {
        const frame = await captureVideoFrame(video, time).catch(() => null);
        if (frame && (!best || frame.score > best.score)) best = frame;
      }
      return {
        width: video.videoWidth || null,
        height: video.videoHeight || null,
        duration,
        coverFrame: best?.dataUrl || null,
        thumbnailVersion: best?.dataUrl ? THUMBNAIL_CACHE_VERSION : undefined,
        colors: best?.colors?.length ? best.colors : (best?.color ? [best.color] : []),
        colorVersion: COLOR_ANALYSIS_VERSION,
        autoTags: [...new Set((best?.colors?.length ? best.colors : [best?.color]).map((color) => color?.name).filter(Boolean))],
      };
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  }

  function createFolder(parentId = null) {
    setFolderDialog({ mode: 'create', folderId: null, parentId });
  }

  function confirmFolderName(name) {
    updateDatabase((next) => {
      if (folderDialog?.mode === 'create') {
        next.folders.push({
          id: window.crypto.randomUUID(),
          name,
          parentId: folderDialog.parentId || null,
          isDefault: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      } else if (folderDialog?.mode === 'rename') {
        const target = next.folders.find((item) => item.id === folderDialog.folderId);
        if (target) {
          target.name = name;
          target.updatedAt = new Date().toISOString();
        }
      }
    });
    setFolderDialog(null);
  }

  function renameFolder(folderId) {
    setFolderDialog({ mode: 'rename', folderId });
  }

  function confirmDeleteFolder(mode, targetFolder) {
    updateDatabase((next) => {
      const folderIds = getFolderDescendantIds(next.folders, deleteFolderId);
      const foldersById = new Map(next.folders.map((folder) => [folder.id, folder]));
      function getRestoreParentId(folderId) {
        let parentId = foldersById.get(folderId)?.parentId || null;
        while (parentId && folderIds.has(parentId)) {
          parentId = foldersById.get(parentId)?.parentId || null;
        }
        return parentId && foldersById.has(parentId) ? parentId : 'default';
      }
      if (mode === 'trash-assets') {
        const now = new Date();
        const deletedAt = now.toISOString();
        const deleteExpiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();
        next.assets = next.assets.map((asset) => (
          folderIds.has(asset.folderId) && !isTrashedAsset(asset)
            ? {
                ...asset,
                deletedAt,
                deleteExpiresAt,
                deletedFromFolderId: asset.folderId || 'default',
                deletedFromParentFolderId: getRestoreParentId(asset.folderId),
                folderId: 'default',
                updatedAt: deletedAt,
              }
            : asset
        ));
      } else {
        const destination = mode === 'move-other' ? targetFolder : 'default';
        next.assets = next.assets.map((asset) => (folderIds.has(asset.folderId) ? { ...asset, folderId: destination } : asset));
      }
      next.folders = next.folders.filter((folder) => !folderIds.has(folder.id));
    });
    if (getFolderDescendantIds(database.folders, deleteFolderId).has(selectedFolderId)) setSelectedFolderId('all');
    setDeleteFolderId(null);
    setNotice({
      type: 'success',
      message: mode === 'trash-assets' ? '文件夹已删除，里面的素材已移入回收站，30天后自动永久删除。' : '文件夹已删除，素材已按选择处理。',
    });
  }

  async function moveAsset(assetId, folderId) {
    try {
      const result = await window.assetVault.moveAssetsToFolder(rootPath, [assetId], folderId);
      setDatabase(normalizeDatabase(result.database));
      setNotice({ type: 'success', message: '已移动素材，并同步到本地文件夹。' });
    } catch (error) {
      setNotice({ type: 'error', message: `移动失败：${error?.message || '请检查素材文件是否可访问。'}` });
    }
  }

  function updateUserTags(assetId, userTags, autoTags) {
    const patch = { userTags };
    if (Array.isArray(autoTags)) patch.autoTags = autoTags;
    upsertAsset(assetId, patch);
  }

  function getAiSettings() {
    return normalizeAiSettings(database?.settings?.ai || {});
  }

  function getAdSettings() {
    return adSettings;
  }

  function getRemoteAdSettings() {
    return normalizeRemoteAdSettings(database?.settings?.remoteAds || {});
  }

  function getUpdateSettings() {
    return normalizeUpdateSettings(database?.settings?.update || {});
  }

  function saveAiSettings(settings) {
    const normalized = normalizeAiSettings(settings);
    updateDatabase((next) => {
      next.settings = {
        ...(next.settings || {}),
        ai: {
          ...normalized,
          enabled: true,
          updatedAt: new Date().toISOString(),
        },
      };
    });
    setNotice({ type: 'success', message: 'AI 设置已保存。' });
  }

  async function loadRemoteAdConfig(configUrl, options = {}) {
    const url = String(configUrl || '').trim();
    if (!url) throw new Error('请填写云端 ads.json 地址。');
    const response = await fetch(`${url}${url.includes('?') ? '&' : '?'}t=${Date.now()}`, { cache: 'no-store' });
    if (!response.ok) throw new Error(`读取失败：HTTP ${response.status}`);
    const payload = await response.json();
    const signatureCheck = await verifySignedConfig(payload);
    if (!signatureCheck.ok) {
      throw new Error(`广告配置签名无效：${signatureCheck.reason || '请确认 ads.json 是由管理版生成的。'}`);
    }
    const config = normalizeRemoteAdConfig(payload, response.url || url);
    const enabledCount = config.ads.filter((ad) => ad.enabled !== false).length;
    updateDatabase((next) => {
      next.settings = {
        ...(next.settings || {}),
        remoteAds: {
          ...normalizeRemoteAdSettings(next.settings?.remoteAds || {}),
          configUrl: url,
          cachedAds: config.ads,
          lastFetchedAt: new Date().toISOString(),
          lastVersion: config.version,
          lastUpdatedAt: config.updatedAt,
        },
      };
    });
    if (!options.silent) setNotice({ type: 'success', message: `云端广告读取成功：${enabledCount} 条可显示。` });
    return { count: enabledCount, ads: config.ads };
  }

  function saveAdSettings(items, remoteConfig = getRemoteAdSettings()) {
    const normalizedItems = normalizeAdSettings(items);
    const normalizedRemote = normalizeRemoteAdSettings(remoteConfig);
    updateDatabase((next) => {
      next.settings = {
        ...(next.settings || {}),
        ads: normalizedItems,
        remoteAds: {
          ...normalizeRemoteAdSettings(next.settings?.remoteAds || {}),
          ...normalizedRemote,
          configUrl: normalizedRemote.configUrl,
          cachedAds: normalizedItems,
          lastFetchedAt: new Date().toISOString(),
        },
      };
    });
    setNotice({ type: 'success', message: '广告位已保存。' });
  }

  function saveUpdateSettings(settings) {
    const normalized = normalizeUpdateSettings(settings);
    updateDatabase((next) => {
      next.settings = {
        ...(next.settings || {}),
        update: normalized,
      };
    });
  }

  async function runUpdateCheck({ manual = false, configUrl = '', retry = false } = {}) {
    const url = String(configUrl || getUpdateSettings().configUrl || '').trim();
    if (!url) {
      if (manual) setNotice({ type: 'info', message: '请先配置软件更新地址。' });
      return null;
    }
    if (['checking', 'downloading'].includes(updateStatus.state)) return null;
    if (updateRetryTimerRef.current && !retry) {
      clearTimeout(updateRetryTimerRef.current);
      updateRetryTimerRef.current = null;
    }
    setUpdateToastHidden(false);
    setUpdateStatus((current) => ({ ...current, state: 'checking', percent: 0, retryExhausted: false, message: '' }));
    try {
      const checked = await window.assetVault.checkUpdate?.(url);
      saveUpdateSettings({
        ...getUpdateSettings(),
        configUrl: url,
        lastCheckedAt: new Date().toISOString(),
        lastVersion: checked?.update?.version || checked?.currentVersion || '',
      });
      if (!checked?.available) {
        setUpdateStatus({
          state: 'latest',
          percent: 0,
          currentVersion: checked?.currentVersion || appVersion,
          latestVersion: checked?.update?.version || checked?.currentVersion || appVersion,
        });
        if (manual) setNotice({ type: 'success', message: '已经是最新版本。' });
        return checked;
      }
      setUpdateStatus({
        state: 'downloading',
        percent: 0,
        currentVersion: checked.currentVersion,
        latestVersion: checked.update.version,
        update: checked.update,
      });
      const downloaded = await window.assetVault.downloadUpdate?.(checked.update);
      setUpdateStatus({
        state: 'downloaded',
        percent: 100,
        currentVersion: checked.currentVersion,
        latestVersion: checked.update.version,
        update: downloaded?.update || checked.update,
        installerPath: downloaded?.installerPath,
        downloadedAt: downloaded?.downloadedAt,
      });
      return downloaded;
    } catch (error) {
      const nextState = {
        state: 'failed',
        percent: 0,
        latestVersion: updateStatus.latestVersion,
        update: updateStatus.update,
        message: error?.message || '更新下载失败',
        retryExhausted: retry,
      };
      setUpdateStatus(nextState);
      if (!retry) {
        updateRetryTimerRef.current = setTimeout(() => {
          updateRetryTimerRef.current = null;
          runUpdateCheck({ configUrl: url, retry: true });
        }, 10 * 60 * 1000);
      }
      if (manual) setNotice({ type: 'error', message: `更新失败：${error?.message || '请稍后重试。'}` });
      return null;
    }
  }

  async function installDownloadedUpdate() {
    if (!updateStatus.installerPath || !updateStatus.update) return;
    try {
      await window.assetVault.saveLibrary?.(rootPath, database);
      await window.assetVault.installUpdate?.({
        rootPath,
        installerPath: updateStatus.installerPath,
        version: updateStatus.update.version,
      });
    } catch (error) {
      setNotice({ type: 'error', message: `安装更新失败：${error?.message || '请稍后重试。'}`, placement: 'center' });
    }
  }

  async function chooseAdImage() {
    if (!rootPath) throw new Error('请先选择素材库位置。');
    return window.assetVault.chooseAdImage?.(rootPath);
  }

  async function exportAdPackage(items) {
    if (!rootPath) throw new Error('请先选择素材库位置。');
    if (!hasConfigSigningKey()) throw new Error('当前版本缺少配置签名钥匙，请使用管理版导出广告包。');
    const result = await window.assetVault.exportAdPackage?.(rootPath, normalizeAdSettings(items), CONFIG_PRIVATE_KEY_BASE64);
    if (result?.path) setNotice({ type: 'success', message: `广告包已导出：${result.count || 0} 条广告。` });
    return result;
  }

  async function chooseUpdateInstaller() {
    return window.assetVault.chooseUpdateInstaller?.();
  }

  async function exportUpdateConfig(config, privateKeyBase64) {
    const result = await window.assetVault.exportUpdateConfig?.(config, privateKeyBase64);
    if (result?.path) setNotice({ type: 'success', message: `带签名的 update.json 已导出：${result.path}` });
    return result;
  }

  async function testAiSettings(settings) {
    setAiTesting(true);
    try {
      const result = await window.assetVault.testAiConnection(settings);
      if (!result?.ok) throw new Error(result?.message || '连接测试失败');
      setNotice({ type: 'success', message: `AI 连接成功：${result.model || settings.model}` });
    } catch (error) {
      setNotice({ type: 'error', message: `AI 连接失败：${error?.message || '请检查 API 地址、Key 和模型名称。'}` });
    } finally {
      setAiTesting(false);
    }
  }

  async function listAiModels(settings) {
    setAiModelsLoading(true);
    try {
      const result = await window.assetVault.listAiModels(settings);
      setNotice({ type: 'success', message: `已读取 ${result.models?.length || 0} 个模型。` });
      return result;
    } catch (error) {
      setNotice({ type: 'error', message: `模型列表读取失败：${error?.message || '请检查 API 地址和 Key。'}` });
      return null;
    } finally {
      setAiModelsLoading(false);
    }
  }

  async function generateAiTags(asset) {
    if (!asset || asset.kind === 'video') return;
    const aiSettings = getAiSettings();
    if (!aiSettings.enabled || !aiSettings.apiKey || !aiSettings.baseUrl || !aiSettings.model) {
      setAiDialogOpen(true);
      setNotice({ type: 'info', message: '请先配置支持图片识别的 AI 接口。' });
      return;
    }
    setAiBusyAssetId(asset.id);
    try {
      const result = await window.assetVault.analyzeImageWithAi(aiSettings, asset);
      const nextTags = [...new Set([
        ...(asset.autoTags || []),
        ...(result.tags || []),
      ])];
      upsertAsset(asset.id, {
        autoTags: nextTags,
        aiTags: result,
        aiTagStatus: 'done',
        aiTagError: '',
        analysisStatus: 'done',
        analysisIgnored: false,
      });
      setNotice({ type: 'success', message: `已生成 ${result.tags?.length || 0} 个 AI 标签。` });
    } catch (error) {
      upsertAsset(asset.id, {
        aiTagStatus: 'failed',
        aiTagError: error?.message || 'AI 标签生成失败',
      });
      setNotice({ type: 'error', message: `AI 标签生成失败：${error?.message || '请检查模型是否支持图片识别。'}` });
    } finally {
      setAiBusyAssetId(null);
    }
  }

  async function runBatchAiTags(assetIds = selectedIds) {
    const aiSettings = getAiSettings();
    if (!aiSettings.enabled || !aiSettings.apiKey || !aiSettings.baseUrl || !aiSettings.model) {
      setAiDialogOpen(true);
      setNotice({ type: 'info', message: '请先配置支持图片识别的 AI 接口。' });
      return;
    }
    const ids = new Set(assetIds);
    const targets = (database?.assets || []).filter((asset) => ids.has(asset.id) && asset.kind !== 'video');
    const skipped = [...ids].length - targets.length;
    if (!targets.length) {
      setNotice({ type: 'info', message: skipped ? '选中的素材里没有可生成 AI 标签的图片。' : '请先选择素材。' });
      return;
    }
    let success = 0;
    let failed = 0;
    const failedIds = [];
    setBatchAiTask({ total: targets.length, completed: 0, success: 0, failed: 0, failedIds: [], done: false });
    setNotice({ type: 'info', message: skipped ? `已跳过 ${skipped} 个视频素材，开始生成 AI 标签。` : '开始批量生成 AI 标签。' });
    let completed = 0;
    for (let index = 0; index < targets.length; index += AI_BATCH_CONCURRENCY) {
      const chunk = targets.slice(index, index + AI_BATCH_CONCURRENCY);
      setBatchAiTask((current) => current ? {
        ...current,
        currentName: `正在处理 ${chunk.length} 张素材`,
      } : current);
      await Promise.all(chunk.map(async (asset) => {
        setAiBusyAssetId(asset.id);
        try {
          const result = await window.assetVault.analyzeImageWithAi(aiSettings, asset);
          const nextTags = [...new Set([...(asset.autoTags || []), ...(result.tags || [])])];
          upsertAsset(asset.id, {
            autoTags: nextTags,
            aiTags: result,
            aiTagStatus: 'done',
            aiTagError: '',
            analysisStatus: 'done',
            analysisIgnored: false,
          });
          success += 1;
        } catch (error) {
          failed += 1;
          failedIds.push(asset.id);
          upsertAsset(asset.id, {
            aiTagStatus: 'failed',
            aiTagError: error?.message || 'AI 标签生成失败',
          });
        } finally {
          completed += 1;
          setBatchAiTask({
            total: targets.length,
            completed,
            success,
            failed,
            failedIds: [...failedIds],
            done: completed >= targets.length,
          });
        }
      }));
    }
    setAiBusyAssetId(null);
    setNotice({
      type: failed ? 'error' : 'success',
      message: failed ? `AI 标签完成：成功 ${success}，失败 ${failed}。` : `已为 ${success} 个素材生成 AI 标签。`,
    });
  }

  function retryBatchAiTags() {
    const ids = batchAiTask?.failedIds || [];
    if (!ids.length) return;
    runBatchAiTags(ids);
  }

  async function runBatchReversePrompt(assetIds = selectedIds, level = '中等') {
    const aiSettings = getAiSettings();
    if (!aiSettings.enabled || !aiSettings.apiKey || !aiSettings.baseUrl || !aiSettings.model) {
      setAiDialogOpen(true);
      setNotice({ type: 'info', message: '请先配置支持图片识别的 AI 接口。' });
      return;
    }
    const ids = new Set(assetIds);
    const targets = (database?.assets || []).filter((asset) => ids.has(asset.id) && asset.kind !== 'video');
    const skipped = [...ids].length - targets.length;
    if (!targets.length) {
      setNotice({ type: 'info', message: skipped ? '选中的素材里没有可反推提示词的图片。' : '请先选择素材。' });
      return;
    }
    let success = 0;
    let failed = 0;
    const failedIds = [];
    setBatchPromptTask({ type: 'prompt', total: targets.length, completed: 0, success: 0, failed: 0, failedIds: [], level, done: false });
    setNotice({ type: 'info', message: skipped ? `已跳过 ${skipped} 个视频素材，开始批量反推提示词。` : '开始批量反推提示词。' });
    let completed = 0;
    for (let index = 0; index < targets.length; index += AI_BATCH_CONCURRENCY) {
      const chunk = targets.slice(index, index + AI_BATCH_CONCURRENCY);
      setBatchPromptTask((current) => current ? {
        ...current,
        currentName: `正在反推 ${chunk.length} 张素材`,
      } : current);
      await Promise.all(chunk.map(async (asset) => {
        const requestId = `${asset.id}-batch-prompt-${Date.now()}-${Math.random().toString(16).slice(2)}`;
        promptRequestRef.current = { assetId: asset.id, requestId };
        setPromptBusyAssetId(asset.id);
        upsertAsset(asset.id, {
          promptStatus: 'generating',
          promptError: '',
          promptLevel: level,
        });
        try {
          const prompt = await window.assetVault.reversePromptWithAi(aiSettings, asset, level, requestId);
          if (cancelledPromptRequestsRef.current.has(requestId)) {
            cancelledPromptRequestsRef.current.delete(requestId);
            failed += 1;
            failedIds.push(asset.id);
          } else {
            upsertAsset(asset.id, {
              prompt,
              promptStatus: 'generated',
              promptError: '',
              promptLevel: level,
            });
            success += 1;
          }
        } catch (error) {
          if (cancelledPromptRequestsRef.current.has(requestId) || /已取消反推/.test(error?.message || '')) {
            cancelledPromptRequestsRef.current.delete(requestId);
          }
          failed += 1;
          failedIds.push(asset.id);
          upsertAsset(asset.id, {
            prompt: null,
            promptStatus: 'failed',
            promptError: error?.message || '提示词反推失败或超时',
            promptLevel: level,
          });
        } finally {
          if (promptRequestRef.current?.requestId === requestId) {
            promptRequestRef.current = null;
          }
          completed += 1;
          setBatchPromptTask({
            type: 'prompt',
            total: targets.length,
            completed,
            success,
            failed,
            failedIds: [...failedIds],
            level,
            done: completed >= targets.length,
          });
        }
      }));
    }
    setPromptBusyAssetId(null);
    setNotice({
      type: failed ? 'error' : 'success',
      message: failed ? `提示词反推完成：成功 ${success}，失败 ${failed}。` : `已为 ${success} 个素材反推提示词。`,
    });
  }

  function retryBatchReversePrompt() {
    const ids = batchPromptTask?.failedIds || [];
    if (!ids.length) return;
    runBatchReversePrompt(ids, batchPromptTask?.level || '中等');
  }

  async function reversePrompt(asset) {
    if (!asset || asset.kind === 'video') return;
    const aiSettings = getAiSettings();
    if (!aiSettings.enabled || !aiSettings.apiKey || !aiSettings.baseUrl || !aiSettings.model) {
      setAiDialogOpen(true);
      setNotice({ type: 'info', message: '请先配置支持图片识别的 AI 接口。' });
      return;
    }
    const level = asset.promptLevel || '中等';
    const requestId = `${asset.id}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    promptRequestRef.current = { assetId: asset.id, requestId };
    setPromptBusyAssetId(asset.id);
    upsertAsset(asset.id, {
      promptStatus: 'generating',
      promptError: '',
      promptLevel: level,
    });
    try {
      const prompt = await window.assetVault.reversePromptWithAi(aiSettings, asset, level, requestId);
      if (cancelledPromptRequestsRef.current.has(requestId)) return;
      upsertAsset(asset.id, {
        prompt,
        promptStatus: 'generated',
        promptError: '',
        promptLevel: level,
      });
      setNotice({ type: 'success', message: '提示词反推完成。' });
    } catch (error) {
      if (cancelledPromptRequestsRef.current.has(requestId) || /已取消反推/.test(error?.message || '')) {
        cancelledPromptRequestsRef.current.delete(requestId);
        return;
      }
      upsertAsset(asset.id, {
        prompt: null,
        promptStatus: 'failed',
        promptError: error?.message || '提示词反推失败或超时',
        promptLevel: level,
      });
      setNotice({ type: 'error', message: `提示词反推失败：${error?.message || '请求超时或模型不可用。'}` });
    } finally {
      if (promptRequestRef.current?.requestId === requestId) {
        promptRequestRef.current = null;
        setPromptBusyAssetId(null);
      }
    }
  }

  async function cancelReversePrompt(asset) {
    const current = promptRequestRef.current;
    if (!asset) return;
    if (current?.assetId === asset.id) {
      cancelledPromptRequestsRef.current.add(current.requestId);
      await window.assetVault.cancelReversePrompt?.(current.requestId).catch(() => null);
    }
    upsertAsset(asset.id, {
      prompt: null,
      promptStatus: 'none',
      promptError: '',
      promptLevel: asset.promptLevel || '中等',
    });
    if (current?.assetId === asset.id) promptRequestRef.current = null;
    setPromptBusyAssetId(null);
    setNotice({ type: 'info', message: '已取消提示词反推。' });
  }

  async function batchMoveAssets(folderId, assetIds = selectedIds) {
    const ids = [...new Set(assetIds)].filter(Boolean);
    if (!ids.length) return;
    try {
      const result = await window.assetVault.moveAssetsToFolder(rootPath, ids, folderId);
      setDatabase(normalizeDatabase(result.database));
      setNotice({ type: 'success', message: `已移动 ${ids.length} 个素材，并同步到本地文件夹。` });
    } catch (error) {
      setNotice({ type: 'error', message: `移动失败：${error?.message || '请检查素材文件是否可访问。'}` });
    }
  }

  function batchAddTag(tag, assetIds = selectedIds) {
    const value = tag.trim();
    const ids = new Set(assetIds);
    if (!value || !ids.size) return;
    updateDatabase((next) => {
      next.assets = next.assets.map((asset) => {
        if (!ids.has(asset.id)) return asset;
        return {
          ...asset,
          userTags: [...new Set([...(asset.userTags || []), value])],
          updatedAt: new Date().toISOString(),
        };
      });
    });
    setNotice({ type: 'success', message: `已给 ${ids.size} 个素材添加标签“${value}”。` });
  }

  function startAssetDrag(event, asset) {
    const ids = selectedIds.includes(asset.id) && selectedIds.length > 1 ? selectedIds : [asset.id];
    const dragItems = ids
      .map((id) => database.assets.find((item) => item.id === id))
      .filter((item) => item?.path)
      .map((item) => ({ path: item.path, thumbnail: item.thumbnail || item.path }));
    if (dragItems.length && window.assetVault.startAssetDragOut) {
      event.preventDefault();
      window.assetVault.startAssetDragOut(dragItems);
      return;
    }
    event.dataTransfer.effectAllowed = 'copyMove';
    event.dataTransfer.setData('application/x-asset-vault-assets', JSON.stringify(ids));
    event.dataTransfer.setData('text/plain', ids.join(','));
  }

  function requestFolderDropAction(folderId, assetIds) {
    const ids = [...new Set(assetIds)].filter(Boolean);
    if (!ids.length) return;
    setFolderDropAction({ folderId, assetIds: ids });
  }

  async function confirmFolderDropAction(mode) {
    if (!folderDropAction) return;
    const { folderId, assetIds } = folderDropAction;
    setFolderDropAction(null);
    if (mode === 'move') {
      await batchMoveAssets(folderId, assetIds);
      setSelectedFolderId(folderId);
      return;
    }
    try {
      const result = await window.assetVault.copyAssetsToFolder(rootPath, assetIds, folderId);
      setDatabase(normalizeDatabase(result.database));
      setSelectedFolderId(folderId);
      if (result.copied?.[0]) {
        setSelectedAssetId(result.copied[0].id);
        setSelectedIds(result.copied.map((asset) => asset.id));
      }
      setNotice({ type: 'success', message: `已复制 ${result.copied?.length || 0} 个素材。` });
    } catch (error) {
      setNotice({ type: 'error', message: `复制失败：${error?.message || '请稍后重试。'}` });
    }
  }

  function batchRemoveTag(tag) {
    const ids = new Set(selectedIds);
    if (!tag || !ids.size) return;
    updateDatabase((next) => {
      next.assets = next.assets.map((asset) => {
        if (!ids.has(asset.id)) return asset;
        return {
          ...asset,
          autoTags: (asset.autoTags || []).filter((item) => item !== tag),
          userTags: (asset.userTags || []).filter((item) => item !== tag),
          updatedAt: new Date().toISOString(),
        };
      });
    });
    setNotice({ type: 'success', message: `已从选中素材移除标签“${tag}”。` });
  }

  async function exportSelectedAssets() {
    const ids = new Set(selectedIds);
    const assets = (database?.assets || []).filter((asset) => ids.has(asset.id));
    if (!assets.length) return;
    try {
      const result = await window.assetVault.exportAssets(assets);
      if (!result) return;
      const success = result.exported?.length || 0;
      const failed = result.failed?.length || 0;
      const firstReason = result.failed?.[0]?.reason ? `：${result.failed[0].reason}` : '';
      setNotice({
        type: failed ? 'error' : 'success',
        message: failed ? `已导出 ${success} 个，失败 ${failed} 个${firstReason}` : `已导出 ${success} 个素材。`,
      });
    } catch (error) {
      setNotice({ type: 'error', message: `导出失败：${error?.message || '请选择可写入的文件夹。'}` });
    }
  }

  async function copyAssetFiles(assetIds) {
    const ids = new Set(Array.isArray(assetIds) ? assetIds : [assetIds]);
    const paths = (database?.assets || [])
      .filter((asset) => ids.has(asset.id))
      .map((asset) => asset.path)
      .filter(Boolean);
    if (!paths.length) {
      setNotice({ type: 'error', message: '复制失败，没有找到可复制的素材文件。', placement: 'center' });
      return false;
    }
    try {
      const result = await window.assetVault.copyFilesToClipboard?.(paths);
      let message = `已复制 ${result?.count || 0} 个素材文件，可粘贴到资源管理器、微信、QQ、Word。`;
      if (result?.mode === 'files+image') message = '已复制 1 个素材文件，也可直接粘贴为图片。';
      const failMessage = result?.reason === 'missing'
        ? '复制失败，素材原文件不存在或已被移动。'
        : result?.reason === 'verify'
          ? '复制失败，系统剪贴板没有成功接收文件。'
          : '复制失败，请稍后重试。';
      setNotice(result?.ok ? { type: 'success', message, placement: 'center' } : { type: 'error', message: failMessage, placement: 'center' });
      return !!result?.ok;
    } catch (error) {
      setNotice({ type: 'error', message: `复制失败：${error?.message || '请稍后重试。'}`, placement: 'center' });
      return false;
    }
  }

  function updatePromptLevel(assetId, promptLevel) {
    upsertAsset(assetId, { promptLevel });
  }

  function markPromptStub(assetId, promptLevel = '中等') {
    upsertAsset(assetId, {
      prompt: null,
      promptStatus: 'pending',
      promptLevel,
    });
    setNotice({ type: 'success', message: `已标记为待生成提示词，详细程度：${promptLevel}。` });
  }

  async function copyTextToClipboard(text, successMessage = '已复制。') {
    if (!text) return false;
    try {
      await navigator.clipboard?.writeText(text);
      if (successMessage) setNotice({ type: 'success', message: successMessage });
      return true;
    } catch {
      setNotice({ type: 'error', message: '复制失败，请稍后重试。' });
      return false;
    }
  }

  function selectSingleAsset(assetId) {
    setSelectedAssetId(assetId);
    setSelectedIds([assetId]);
    selectionAnchorRef.current = assetId;
  }

  function toggleAssetSelection(assetId) {
    setSelectedAssetId(assetId);
    setSelectedIds((current) => {
      const next = current.includes(assetId) ? current.filter((id) => id !== assetId) : [...current, assetId];
      return next.length ? next : [assetId];
    });
    selectionAnchorRef.current = assetId;
  }

  function selectAssetRange(assetId) {
    const anchorId = selectionAnchorRef.current || selectedAssetId || assetId;
    const anchorIndex = filteredAssets.findIndex((asset) => asset.id === anchorId);
    const targetIndex = filteredAssets.findIndex((asset) => asset.id === assetId);
    if (anchorIndex < 0 || targetIndex < 0) {
      selectSingleAsset(assetId);
      return;
    }
    const [from, to] = anchorIndex < targetIndex ? [anchorIndex, targetIndex] : [targetIndex, anchorIndex];
    const ids = filteredAssets.slice(from, to + 1).map((asset) => asset.id);
    setSelectedAssetId(assetId);
    setSelectedIds(ids);
  }

  function selectAssetsFromBox(assetIds, append = false) {
    if (!assetIds.length) {
      if (!append) {
        setSelectedIds([]);
        setSelectedAssetId(null);
        selectionAnchorRef.current = null;
      }
      return;
    }
    setSelectedAssetId(assetIds[0]);
    setSelectedIds((current) => (append ? [...new Set([...current, ...assetIds])] : assetIds));
    selectionAnchorRef.current = assetIds[0];
  }

  function selectAllFilteredAssets() {
    const ids = filteredAssets.map((asset) => asset.id);
    setSelectedIds(ids);
    if (ids[0]) {
      setSelectedAssetId(ids[0]);
      selectionAnchorRef.current = ids[0];
    }
  }

  function toggleFilter(group, value) {
    setFilters((current) => toggleFilterValue(current, group, value));
  }

  function removeFilter(group, value) {
    setFilters((current) => ({
      ...current,
      [group]: (current[group] || []).filter((item) => item !== value),
    }));
  }

  function clearFilters({ includeFolder = false, only = null } = {}) {
    if (!only) setQuery('');
    setFilters((current) => (only ? { ...current, [only]: [] } : EMPTY_FILTERS));
    if (includeFolder) setSelectedFolderId('all');
  }

  function clearSelection() {
    setSelectedIds([]);
    setSelectedAssetId(null);
    selectionAnchorRef.current = null;
  }

  function clearSelectionFromBlankPointer(event) {
    if (!selectedIds.length || previewAsset) return;
    const target = event.target;
    if (target.closest([
      '.asset-card',
      '.asset-list-row',
      '.batch-bar-shell',
      '.collection-meta',
      '.sort-menu',
      '.filter-popover',
      '.context-menu',
      '.modal-backdrop',
      'button',
      'input',
      'select',
      'textarea',
      'video',
      'a',
    ].join(','))) return;
    clearSelection();
  }

  const stats = useMemo(() => {
    const byFolder = {};
    for (const folder of database?.folders || []) byFolder[folder.id] = 0;
    const activeAssets = (database?.assets || []).filter((asset) => !isTrashedAsset(asset));
    const trashedAssets = (database?.assets || []).filter(isTrashedAsset);
    for (const asset of activeAssets) byFolder[asset.folderId] = (byFolder[asset.folderId] || 0) + 1;
    for (const folder of database?.folders || []) {
      const folderIds = getFolderDescendantIds(database.folders, folder.id);
      byFolder[folder.id] = activeAssets.filter((asset) => folderIds.has(asset.folderId)).length;
    }
    return {
      total: activeAssets.length,
      trash: trashedAssets.length,
      unprompted: activeAssets.filter((asset) => getPromptStatus(asset) !== 'generated' && asset.kind !== 'video').length,
      untagged: activeAssets.filter((asset) => asset.kind !== 'video' && !hasAiTags(asset)).length,
      byFolder,
    };
  }, [database]);

  const filterOptions = useMemo(() => ({
    extensions: [...new Set((database?.assets || []).filter((asset) => !isTrashedAsset(asset)).map((asset) => asset.extension).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b)),
    tags: [...(database?.assets || []).filter((asset) => !isTrashedAsset(asset)).reduce((map, asset) => {
      for (const tag of getAssetTags(asset)) map.set(tag, (map.get(tag) || 0) + 1);
      return map;
    }, new Map())].map(([name, count]) => ({ name, count })),
  }), [database]);

  const filterChips = useMemo(() => getFilterChips(filters), [filters]);
  const selectedFolderScope = useMemo(() => (
    database && !['all', 'unprompted', 'untagged', 'trash'].includes(selectedFolderId)
      ? getFolderDescendantIds(database.folders, selectedFolderId)
      : null
  ), [database, selectedFolderId]);

  const filteredAssets = useMemo(() => {
    if (!database) return [];
    const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const result = database.assets.filter((asset) => {
      if (selectedFolderId === 'trash') {
        if (!isTrashedAsset(asset)) return false;
      } else if (isTrashedAsset(asset)) {
        return false;
      }
      if (selectedFolderScope && !selectedFolderScope.has(asset.folderId)) return false;
      if (selectedFolderId === 'unprompted' && (getPromptStatus(asset) === 'generated' || asset.kind === 'video')) return false;
      if (selectedFolderId === 'untagged' && (asset.kind === 'video' || hasAiTags(asset))) return false;
      if (!isFilterMatch(filters.kinds, asset.kind)) return false;
      if (!isFilterMatch(filters.extensions, asset.extension)) return false;
      if (!isFilterMatch(filters.promptStatuses, getPromptStatus(asset))) return false;
      if (!isFilterMatch(filters.orientations, getAssetOrientation(asset))) return false;
      if (filters.colors.length && !(asset.colors || []).some((color) => filters.colors.includes(color.name))) return false;
      if (filters.tags.length && !getAssetTags(asset).some((tag) => filters.tags.includes(tag))) return false;
      const haystack = [
        asset.name, asset.originalName, asset.extension, asset.kind, KIND_LABELS[asset.kind],
        ...(asset.autoTags || []), ...(asset.userTags || []), ...(asset.colors || []).map((color) => color.name),
        asset.prompt?.zh, asset.prompt?.en, asset.promptStatus, asset.promptLevel,
      ].join(' ').toLowerCase();
      return terms.every((term) => (term.startsWith('格式:') ? asset.extension.includes(term.replace('格式:', '.')) : haystack.includes(term)));
    });
    return sortAssets(result, sortState);
  }, [database, query, selectedFolderId, selectedFolderScope, filters, sortState]);

  const selectedAsset = filteredAssets.find((asset) => asset.id === selectedAssetId) || null;
  const previewAsset = database?.assets.find((asset) => asset.id === previewId) || null;
  const previewIndex = previewId ? filteredAssets.findIndex((asset) => asset.id === previewId) : -1;
  const hasPreviousPreview = previewIndex > 0;
  const hasNextPreview = previewIndex >= 0 && previewIndex < filteredAssets.length - 1;
  const deleteFolder = database?.folders.find((folder) => folder.id === deleteFolderId) || null;
  const folderDropTarget = database?.folders.find((folder) => folder.id === folderDropAction?.folderId) || null;
  const folderDialogFolder = database?.folders.find((folder) => folder.id === folderDialog?.folderId) || null;
  const folderDialogParent = database?.folders.find((folder) => folder.id === folderDialog?.parentId) || null;
  const pendingDeleteAssets = database?.assets.filter((asset) => pendingDeleteIds.includes(asset.id)) || [];
  const failedAnalysisAssets = database?.assets.filter((asset) => asset.analysisStatus === 'failed' && !asset.analysisIgnored) || [];
  const selectedBatchTags = useMemo(() => {
    const ids = new Set(selectedIds);
    return [...new Set((database?.assets || [])
      .filter((asset) => ids.has(asset.id))
      .flatMap((asset) => getAssetTags(asset)))]
      .sort((a, b) => a.localeCompare(b, 'zh-CN'));
  }, [database, selectedIds]);
  const folderOptions = useMemo(() => flattenFolderTree(database?.folders || []), [database]);
  const adSettings = useMemo(() => normalizeAdSettings(database?.settings?.ads || []), [database?.settings?.ads]);
  const remoteAdSettings = useMemo(() => normalizeRemoteAdSettings(database?.settings?.remoteAds || {}), [database?.settings?.remoteAds]);
  const displayAdSettings = useMemo(() => (
    remoteAdSettings.cachedAds.length ? remoteAdSettings.cachedAds : adSettings
  ), [remoteAdSettings.cachedAds, adSettings]);

  useEffect(() => {
    if (!database) return;
    const remote = normalizeRemoteAdSettings(database.settings?.remoteAds || {});
    if (!remote.configUrl) return;
    const lastFetched = new Date(remote.lastFetchedAt || 0).getTime();
    const isFresh = remote.cachedAds.length && Date.now() - lastFetched < 6 * 60 * 60 * 1000;
    if (isFresh) return;
    loadRemoteAdConfig(remote.configUrl, { silent: true }).catch((error) => {
      console.warn('云端广告读取失败', error);
    });
  }, [database?.settings?.remoteAds?.configUrl]);

  useEffect(() => {
    if (!database || !rootPath) return;
    const update = normalizeUpdateSettings(database.settings?.update || {});
    if (!update.configUrl) return;
    if (updateAutoCheckedRef.current === update.configUrl) return;
    updateAutoCheckedRef.current = update.configUrl;
    runUpdateCheck({ configUrl: update.configUrl }).catch(() => {});
  }, [database?.settings?.update?.configUrl, rootPath]);

  useEffect(() => {
    function handleSelectAll(event) {
      const tag = event.target?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || event.target?.isContentEditable) return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a') {
        event.preventDefault();
        selectAllFilteredAssets();
      }
    }
    window.addEventListener('keydown', handleSelectAll);
    return () => window.removeEventListener('keydown', handleSelectAll);
  }, [filteredAssets]);

  useEffect(() => {
    if (selectedAssetId && !filteredAssets.some((asset) => asset.id === selectedAssetId)) {
      setSelectedAssetId(null);
      setSelectedIds([]);
      selectionAnchorRef.current = null;
    }
    if (previewId && !filteredAssets.some((asset) => asset.id === previewId)) {
      setPreviewId(null);
    }
  }, [filteredAssets, selectedAssetId, previewId]);

  function openPreview(assetId) {
    setSelectedAssetId(assetId);
    setPreviewId(assetId);
  }

  function closePreview() {
    setRestorePreviewAssetId(previewId);
    setPreviewId(null);
  }

  function switchPreview(direction) {
    if (previewIndex < 0) return;
    const nextAsset = filteredAssets[previewIndex + direction];
    if (!nextAsset) return;
    setSelectedAssetId(nextAsset.id);
    setPreviewId(nextAsset.id);
  }

  if (!rootPath || !database) {
    return (
      <Onboarding
        onSelectExisting={selectExistingRoot}
        onCreateNew={createNewRoot}
      />
    );
  }

  return (
    <div className="app-window">
      <AppTitlebar
        query={query}
        onQuery={setQuery}
        onImport={importDialog}
        onExportLibrary={() => setExportDataDialogOpen(true)}
        onImportLibrary={importLibraryPackage}
        onOpenSettings={() => setAiDialogOpen(true)}
        onOpenRhGuide={() => setRhGuideOpen(true)}
        onToggleTheme={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
        theme={theme}
        filters={filters}
        onToggleFilter={toggleFilter}
        onClearFilters={clearFilters}
        filterOptions={filterOptions}
        viewMode={viewMode}
        onToggleViewMode={() => setViewMode((mode) => (mode === 'masonry' ? 'list' : 'masonry'))}
        onOpenTrash={() => {
          setSelectedFolderId((current) => (current === 'trash' ? 'all' : 'trash'));
          setSelectedAssetId(null);
          setSelectedIds([]);
        }}
        trashActive={selectedFolderId === 'trash'}
        trashCount={stats.trash}
      />
      <div className="app-shell">
        <Sidebar
          folders={database.folders}
          selectedFolderId={selectedFolderId}
          onSelectFolder={setSelectedFolderId}
          onCreateFolder={createFolder}
          onRenameFolder={renameFolder}
          onDeleteFolder={setDeleteFolderId}
          onDropToFolder={(folderId, paths, assetIds) => {
            if (assetIds?.length) requestFolderDropAction(folderId, assetIds);
            else importDropped(paths, folderId, { selectFolder: true });
          }}
          onContextMenuFolder={(event, folder) => {
            setContextMenu(null);
            setFolderContextMenu({ x: event.clientX, y: event.clientY, folder });
          }}
          onBlankPointerDown={clearSelection}
          stats={stats}
          thumbnailSize={thumbnailSize}
          onThumbnailSize={setThumbnailSize}
        />

        <main className={`main-workspace ${previewAsset ? 'previewing' : ''}`} onPointerDownCapture={clearSelectionFromBlankPointer}>
          {!previewAsset && (
            <div className={`batch-bar-shell ${batchBarOpen ? 'is-open' : 'is-closed'} ${showBatchBar ? 'is-mounted' : ''}`}>
              <BatchBar
                count={selectedIds.length || batchBarCount}
                isExiting={selectedIds.length === 0}
                trashMode={selectedFolderId === 'trash'}
                folders={database.folders}
                onClear={() => setSelectedIds([])}
                onDelete={() => requestDeleteAssets(selectedIds)}
                onRestore={() => restoreAssets(selectedIds)}
                onMove={batchMoveAssets}
                onAddTag={batchAddTag}
                onExport={exportSelectedAssets}
                onSelectAll={selectAllFilteredAssets}
                onAiTags={() => runBatchAiTags(selectedIds)}
                onReversePrompts={(level) => runBatchReversePrompt(selectedIds, level)}
                aiBusy={!!batchAiTask && !batchAiTask.done}
                promptBusy={!!batchPromptTask && !batchPromptTask.done}
              />
            </div>
          )}
          {!previewAsset && (
            <CollectionHeader
              count={filteredAssets.length}
              title={selectedFolderId === 'trash' ? '回收站' : '全部素材'}
              subtitle={selectedFolderId === 'trash' ? `${filteredAssets.length.toLocaleString('zh-CN')} 个素材 · 保留 30 天后自动永久删除` : null}
              filterChips={filterChips}
              onRemoveFilter={removeFilter}
              onClearFilters={() => clearFilters({ includeFolder: true })}
              hasQuery={query.trim().length > 0}
              sortState={sortState}
              onSortChange={setSortState}
              importProgress={importProgress}
            />
          )}
          {previewAsset ? (
            <InlinePreview
              asset={previewAsset}
              hasPrevious={hasPreviousPreview}
              hasNext={hasNextPreview}
              onPrevious={() => switchPreview(-1)}
              onNext={() => switchPreview(1)}
              onClose={closePreview}
              onDelete={requestDeleteAssets}
              onSaveEditedCopy={saveEditedCopy}
            />
          ) : (
            <AssetGrid
              assets={filteredAssets}
              selectedId={selectedAsset?.id}
              selectedIds={selectedIds}
              onSelect={selectSingleAsset}
              onToggleSelect={toggleAssetSelection}
              onRangeSelect={selectAssetRange}
              onBoxSelect={selectAssetsFromBox}
              onOpenPreview={openPreview}
              viewMode={viewMode}
              thumbnailSize={thumbnailSize}
              onThumbnailSize={setThumbnailSize}
              onDropImport={importDropped}
              onAssetDragStart={startAssetDrag}
              restoreAssetId={restorePreviewAssetId}
              onRestoredAsset={() => setRestorePreviewAssetId(null)}
              onContextMenuAsset={(event, asset) => {
                event.preventDefault();
                setSelectedAssetId(asset.id);
                const contextIds = selectedIds.includes(asset.id) && selectedIds.length > 1 ? selectedIds : [asset.id];
                setSelectedIds((current) => {
                  if (current.includes(asset.id)) return current;
                  selectionAnchorRef.current = asset.id;
                  return [asset.id];
                });
                setContextMenu({ x: event.clientX, y: event.clientY, asset, assetIds: contextIds });
              }}
            />
          )}
        </main>

        <DetailsPanel
          asset={selectedAsset}
          aiEnabled={!!(getAiSettings().enabled && getAiSettings().baseUrl && getAiSettings().apiKey && getAiSettings().model)}
          aiBusy={aiBusyAssetId === selectedAsset?.id}
          promptBusy={promptBusyAssetId === selectedAsset?.id}
          ads={displayAdSettings}
          onGenerateAiTags={generateAiTags}
          onReversePrompt={reversePrompt}
          onCancelReversePrompt={cancelReversePrompt}
          folderName={database.folders.find((folder) => folder.id === selectedAsset?.folderId)?.name || '未知'}
          folders={database.folders}
          onUpdateTags={updateUserTags}
          onMoveFolder={moveAsset}
          onOpenPreview={openPreview}
          onShowItem={(path) => window.assetVault.showItem(path)}
          onOpenExternal={(url) => window.assetVault.openExternal?.(url)}
          onCopyText={copyTextToClipboard}
          onPromptStub={markPromptStub}
          onUpdatePromptLevel={updatePromptLevel}
          onDelete={requestDeleteAssets}
        />
      </div>

      <DeleteFolderDialog folder={deleteFolder} folders={database.folders} onCancel={() => setDeleteFolderId(null)} onConfirm={confirmDeleteFolder} />
      <DeleteAssetsDialog
        assets={pendingDeleteAssets}
        permanent={selectedFolderId === 'trash' || pendingDeleteAssets.every(isTrashedAsset)}
        onCancel={() => setPendingDeleteIds([])}
        onConfirm={confirmDeleteAssets}
      />
      {exportDataDialogOpen && (
        <ExportDataDialog
          folders={database.folders}
          stats={stats}
          onCancel={() => setExportDataDialogOpen(false)}
          onConfirm={exportLibraryPackage}
        />
      )}
      <FolderDropActionDialog
        action={folderDropAction}
        folder={folderDropTarget}
        count={folderDropAction?.assetIds?.length || 0}
        onCancel={() => setFolderDropAction(null)}
        onConfirm={confirmFolderDropAction}
      />
      <DuplicateImportDialog duplicates={duplicateImportItems} onImport={() => setDuplicateImportItems([])} onCancel={removeDuplicateImportCopies} />
      <AiSettingsDialog
        open={aiDialogOpen}
        rootPath={rootPath}
        libraryStats={{
          assets: (database.assets || []).filter((asset) => !asset.deletedAt).length,
          folders: database.folders?.length || 0,
        }}
        settings={getAiSettings()}
        testing={aiTesting}
        loadingModels={aiModelsLoading}
        updateSettings={getUpdateSettings()}
        updateStatus={updateStatus}
        appVersion={appVersion}
        onCancel={() => setAiDialogOpen(false)}
        onSave={saveAiSettings}
        onTest={testAiSettings}
        onListModels={listAiModels}
        onOpenLibraryRoot={openCurrentLibraryRoot}
        onRequestSwitchLibrary={() => setLibrarySwitchPending(true)}
        onOpenExternal={(url) => window.assetVault.openExternal?.(url)}
        onCopyText={copyTextToClipboard}
        onOpenAdManager={IS_ADMIN_BUILD ? () => setAdDialogOpen(true) : undefined}
        onSaveUpdateSettings={saveUpdateSettings}
        onCheckUpdate={runUpdateCheck}
        onInstall={installDownloadedUpdate}
        onChooseUpdateInstaller={chooseUpdateInstaller}
        onExportUpdateConfig={exportUpdateConfig}
      />
      {librarySwitchPending && (
        <ConfirmActionDialog
          title="切换素材库"
          message="切换素材库只会让软件打开另一个本地素材库，不会移动、删除或覆盖当前素材库里的文件。"
          items={[rootPath || '当前素材库']}
          confirmText="选择素材库"
          variant="normal"
          onCancel={() => setLibrarySwitchPending(false)}
          onConfirm={confirmSwitchLibrary}
        />
      )}
      <RunningHubGuideDialog
        open={rhGuideOpen}
        onCancel={() => setRhGuideOpen(false)}
        onOpenExternal={(url) => window.assetVault.openExternal?.(url)}
      />
      {IS_ADMIN_BUILD && (
        <AdManagerDialog
          open={adDialogOpen}
          ads={getAdSettings()}
          remoteConfig={getRemoteAdSettings()}
          onCancel={() => setAdDialogOpen(false)}
          onSave={saveAdSettings}
          onChooseImage={chooseAdImage}
          onExportPackage={exportAdPackage}
          onTestRemote={loadRemoteAdConfig}
        />
      )}
      <FolderNameDialog
        mode={folderDialog?.mode}
        folder={folderDialogFolder}
        parentFolder={folderDialogParent}
        folders={database.folders}
        onCancel={() => setFolderDialog(null)}
        onConfirm={confirmFolderName}
      />
      <Notice notice={notice} onClose={() => setNotice(null)} />
      <UpdateToast status={updateStatus} hidden={updateToastHidden} onClose={() => setUpdateToastHidden(true)} />
      <UpdateInstallDialog
        status={updateStatus}
        onCancel={() => setUpdateStatus((current) => ({ ...current, state: 'downloaded-later' }))}
        onInstall={installDownloadedUpdate}
      />
      <TaskToast
        tasks={tasks}
        failedAssets={failedAnalysisAssets}
        batchAiTask={batchAiTask}
        batchPromptTask={batchPromptTask}
        onRetryFailed={retryFailedAnalysis}
        onIgnoreFailed={ignoreFailedAnalysis}
        onRetryBatchAi={retryBatchAiTags}
        onRetryBatchPrompt={retryBatchReversePrompt}
      />
      {contextMenu && (
        <div className="context-menu" style={{ left: contextMenu.x, top: contextMenu.y }}>
          <button onClick={() => { openPreview(contextMenu.asset.id); setContextMenu(null); }}>预览</button>
          <button onClick={async () => { await copyAssetFiles(contextMenu.assetIds || [contextMenu.asset.id]); setContextMenu(null); }}>
            {contextMenu.assetIds?.length > 1 ? `复制选中 ${contextMenu.assetIds.length} 个` : '复制素材'}
          </button>
          {selectedFolderId === 'trash' ? (
            <button onClick={() => { restoreAssets(contextMenu.assetIds || [contextMenu.asset.id]); setContextMenu(null); }}>恢复</button>
          ) : (
            <>
              <label className="context-menu-control">
                <span>移动到</span>
                <select
                  defaultValue=""
                  onChange={(event) => {
                    if (!event.target.value) return;
                  batchMoveAssets(event.target.value, contextMenu.assetIds || [contextMenu.asset.id]);
                  setContextMenu(null);
                  }}
                >
                  <option value="" disabled>选择文件夹</option>
                  {folderOptions.map((folder) => <option key={folder.id} value={folder.id}>{folderOptionLabel(folder)}</option>)}
                </select>
              </label>
              <form
                className="context-menu-control context-menu-tag"
                onSubmit={(event) => {
                  event.preventDefault();
                  const value = new FormData(event.currentTarget).get('tag');
                  batchAddTag(String(value || ''), contextMenu.assetIds || [contextMenu.asset.id]);
                  setContextMenu(null);
                }}
              >
                <span>添加标签</span>
                <div>
                  <input name="tag" placeholder="标签" autoComplete="off" />
                  <button type="submit">添加</button>
                </div>
              </form>
            </>
          )}
          <button onClick={() => { window.assetVault.showItem(contextMenu.asset.path); setContextMenu(null); }}>打开所在目录</button>
          <button className="danger-text" onClick={() => { requestDeleteAssets(contextMenu.assetIds || [contextMenu.asset.id]); setContextMenu(null); }}>
            {selectedFolderId === 'trash'
              ? (contextMenu.assetIds?.length > 1 ? `永久删除 ${contextMenu.assetIds.length} 个` : '永久删除')
              : (contextMenu.assetIds?.length > 1 ? `删除选中 ${contextMenu.assetIds.length} 个` : '删除')}
          </button>
        </div>
      )}
      {folderContextMenu && (
        <div className="context-menu folder-context-menu" style={{ left: folderContextMenu.x, top: folderContextMenu.y }}>
          <button onClick={async () => { const folder = folderContextMenu.folder; setFolderContextMenu(null); await exportFolderData(folder); }}>
            导出数据迁移
          </button>
          <button onClick={async () => { const folder = folderContextMenu.folder; setFolderContextMenu(null); await exportFolderAssets(folder); }}>
            导出所有素材
          </button>
          <button onClick={async () => { const folder = folderContextMenu.folder; setFolderContextMenu(null); await openFolderLocation(folder); }}>
            打开文件位置
          </button>
        </div>
      )}
    </div>
  );
}

createRoot(document.getElementById('root')).render(<App />);

