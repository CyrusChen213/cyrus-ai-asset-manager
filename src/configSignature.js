export const CONFIG_SIGNATURE_KEY_ID = 'cyrus-config-v1';
export const CONFIG_SIGNATURE_ALGORITHM = 'ECDSA-P256-SHA256';
export const CONFIG_PUBLIC_KEY_BASE64 = 'MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEVpO40RP3+UaryXCJp2k8DA6pdubOX71Gwj3+Aq5W4t3RvySijxCzJZz22yG5iVjZcKuvmvRPoTDlvGAlCswgEQ==';
export const CONFIG_PRIVATE_KEY_BASE64 = import.meta.env.VITE_CONFIG_PRIVATE_KEY_BASE64 || '';

function sortKeys(value) {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (!value || typeof value !== 'object') return value;
  return Object.keys(value).sort().reduce((result, key) => {
    if (key === 'signature') return result;
    const next = value[key];
    if (next !== undefined) result[key] = sortKeys(next);
    return result;
  }, {});
}

export function canonicalConfigString(payload) {
  return JSON.stringify(sortKeys(payload || {}));
}

function base64ToBytes(value = '') {
  const binary = atob(String(value).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function normalizeBase64Url(value = '') {
  const normalized = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
  return normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
}

export function hasConfigSigningKey() {
  return !!CONFIG_PRIVATE_KEY_BASE64.trim();
}

export async function verifySignedConfig(payload) {
  const signature = payload?.signature || {};
  if (signature.keyId !== CONFIG_SIGNATURE_KEY_ID) {
    return { ok: false, reason: '配置签名来源不正确。' };
  }
  if (signature.algorithm !== CONFIG_SIGNATURE_ALGORITHM) {
    return { ok: false, reason: '配置签名算法不正确。' };
  }
  if (!signature.value) {
    return { ok: false, reason: '配置缺少签名。' };
  }
  try {
    const publicKey = await crypto.subtle.importKey(
      'spki',
      base64ToBytes(CONFIG_PUBLIC_KEY_BASE64),
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['verify'],
    );
    const data = new TextEncoder().encode(canonicalConfigString(payload));
    const signatureBytes = base64ToBytes(normalizeBase64Url(signature.value));
    const ok = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, publicKey, signatureBytes, data);
    return ok ? { ok: true } : { ok: false, reason: '配置签名校验失败。' };
  } catch {
    return { ok: false, reason: '配置签名无法读取。' };
  }
}
