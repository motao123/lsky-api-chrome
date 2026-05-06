// ===== 共享工具函数（popup.js 和 options.js 共用） =====

const BLOCKED_HOSTNAMES = [
  'metadata.google.internal', 'metadata.google.internal.',
  '169.254.169.254',
];

function isPrivateOrBlockedHostname(hostname) {
  if (BLOCKED_HOSTNAMES.includes(hostname.toLowerCase())) return true;
  // IPv6 映射的 IPv4 地址，如 ::ffff:127.0.0.1
  const v6mapped = /^::ffff:(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/i.exec(hostname);
  if (v6mapped) {
    const octets = v6mapped.slice(1).map(Number);
    return _isPrivateIPv4(octets[0], octets[1]);
  }
  // 纯 IPv4
  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
  const m = hostname.match(ipv4);
  if (m) {
    const [, a, b] = m.map(Number);
    return _isPrivateIPv4(a, b);
  }
  // IPv6 loopback / link-local
  if (/^::1$/i.test(hostname) || /^fe80:/i.test(hostname)) return true;
  return false;
}

function _isPrivateIPv4(a, b) {
  if (a === 10) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  if (a === 169 && b === 254) return true;
  return false;
}

function validateDomainForSSRF(domainValue) {
  try {
    const url = new URL(domainValue);
    return !isPrivateOrBlockedHostname(url.hostname);
  } catch {
    return false;
  }
}

async function ensureHostPermission(domain) {
  const origin = new URL(domain).origin + '/*';
  const granted = await chrome.permissions.contains({ origins: [origin] });
  if (granted) return true;
  return chrome.permissions.request({ origins: [origin] });
}

function truncateFileName(name, maxLen = 50) {
  if (name.length <= maxLen) return name;
  const ext = name.lastIndexOf('.');
  if (ext > 0 && name.length - ext <= 10) {
    return name.slice(0, maxLen - (name.length - ext) - 3) + '...' + name.slice(ext);
  }
  return name.slice(0, maxLen - 3) + '...';
}

function fetchWithTimeout(url, opts = {}, ms = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return fetch(url, { ...opts, signal: controller.signal }).finally(() => clearTimeout(timer));
}
