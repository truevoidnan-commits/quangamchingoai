import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const appSource = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
const errorBoundary = appSource.split('class ErrorBoundary extends React.Component {')[1]
  ?.split('function MainLayout()')[0];

test('ErrorBoundary recovery does not erase browser data', () => {
  assert.ok(errorBoundary, 'ErrorBoundary source must exist');
  assert.doesNotMatch(errorBoundary, /(?:localStorage|sessionStorage)\.(?:clear|removeItem)\s*\(/);
  assert.doesNotMatch(errorBoundary, /indexedDB\.deleteDatabase\s*\(/);
  assert.doesNotMatch(errorBoundary, /caches\.delete\s*\(/);
});

test('ErrorBoundary retains a safe reload button', () => {
  assert.match(errorBoundary, /onClick=\{\(\)\s*=>\s*window\.location\.reload\(\)\}/);
  assert.match(errorBoundary, /Tải lại trang/);
});
