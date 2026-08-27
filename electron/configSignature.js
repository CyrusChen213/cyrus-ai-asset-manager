import { createPrivateKey, createPublicKey, sign, verify } from 'node:crypto';

export const configSignatureKeyId = 'cyrus-config-v1';
export const configSignatureAlgorithm = 'ECDSA-P256-SHA256';
export const configPublicKeyBase64 = 'MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEVpO40RP3+UaryXCJp2k8DA6pdubOX71Gwj3+Aq5W4t3RvySijxCzJZz22yG5iVjZcKuvmvRPoTDlvGAlCswgEQ==';

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

function decodeBase64Url(value = '') {
  const normalized = String(value).replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  return Buffer.from(padded, 'base64');
}

function encodeBase64Url(buffer) {
  return Buffer.from(buffer).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export function signConfigPayload(payload, privateKeyBase64) {
  const key = String(privateKeyBase64 || '').trim();
  if (!key) throw new Error('缺少配置签名私钥，请确认这是管理版并且已配置签名钥匙。');
  const privateKey = createPrivateKey({ key: Buffer.from(key, 'base64'), format: 'der', type: 'pkcs8' });
  const body = canonicalConfigString(payload);
  const signature = sign('sha256', Buffer.from(body, 'utf8'), {
    key: privateKey,
    dsaEncoding: 'ieee-p1363',
  });
  return {
    ...payload,
    signature: {
      keyId: configSignatureKeyId,
      algorithm: configSignatureAlgorithm,
      value: encodeBase64Url(signature),
    },
  };
}

export function verifySignedConfig(payload) {
  const signature = payload?.signature || {};
  if (signature.keyId !== configSignatureKeyId) {
    return { ok: false, reason: '配置签名来源不正确。' };
  }
  if (signature.algorithm !== configSignatureAlgorithm) {
    return { ok: false, reason: '配置签名算法不正确。' };
  }
  if (!signature.value) {
    return { ok: false, reason: '配置缺少签名。' };
  }
  try {
    const publicKey = createPublicKey({ key: Buffer.from(configPublicKeyBase64, 'base64'), format: 'der', type: 'spki' });
    const body = canonicalConfigString(payload);
    const ok = verify('sha256', Buffer.from(body, 'utf8'), {
      key: publicKey,
      dsaEncoding: 'ieee-p1363',
    }, decodeBase64Url(signature.value));
    return ok ? { ok: true } : { ok: false, reason: '配置签名校验失败。' };
  } catch {
    return { ok: false, reason: '配置签名无法读取。' };
  }
}
