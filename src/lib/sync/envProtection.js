/**
 * src/lib/sync/envProtection.js
 * Kiểm tra môi trường để bảo vệ dữ liệu Cloud thật khi phát triển trên localhost/test.
 */

let _overrideHostForTesting = null;

export function setHostOverrideForTesting(host) {
  _overrideHostForTesting = host;
}

export function getHostOverrideForTesting() {
  return _overrideHostForTesting;
}

export function isProductionHost() {
  if (typeof window !== 'undefined' && window.__ALLOW_LOCAL_SYNC__ === true) {
    const host = window.location?.hostname || '';
    if (host === 'localhost' || host === '127.0.0.1' || host === '::1') {
      return true;
    }
  }
  if (_overrideHostForTesting !== null) {
    return typeof _overrideHostForTesting === 'string' && _overrideHostForTesting.endsWith('github.io');
  }
  if (typeof window === 'undefined' || !window.location) {
    return false;
  }
  const hostname = window.location.hostname || '';
  return hostname.endsWith('github.io');
}
