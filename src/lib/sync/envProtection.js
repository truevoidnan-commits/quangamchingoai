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
  if (_overrideHostForTesting !== null) {
    return typeof _overrideHostForTesting === 'string' && _overrideHostForTesting.endsWith('github.io');
  }
  if (typeof window === 'undefined' || !window.location) {
    return false;
  }
  const hostname = window.location.hostname || '';
  return hostname.endsWith('github.io');
}
