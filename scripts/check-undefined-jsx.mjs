import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as parser from '@babel/parser';
import traverseModule from '@babel/traverse';

const traverse = traverseModule.default || traverseModule;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const srcDir = path.join(projectRoot, 'src');

const KNOWN_GLOBALS = new Set([
  // JavaScript standard built-ins
  'Array', 'ArrayBuffer', 'AsyncFunction', 'Atomics', 'BigInt', 'BigInt64Array', 'BigUint64Array',
  'Boolean', 'DataView', 'Date', 'Error', 'EvalError', 'Float32Array', 'Float64Array',
  'Function', 'Generator', 'GeneratorFunction', 'Infinity', 'Int16Array', 'Int32Array', 'Int8Array',
  'InternalError', 'Intl', 'JSON', 'Map', 'Math', 'NaN', 'Number', 'Object', 'Promise', 'Proxy',
  'RangeError', 'ReferenceError', 'Reflect', 'RegExp', 'Set', 'SharedArrayBuffer', 'String', 'Symbol',
  'SyntaxError', 'TypeError', 'URIError', 'Uint16Array', 'Uint32Array', 'Uint8Array', 'Uint8ClampedArray',
  'WeakMap', 'WeakSet', 'WebAssembly', 'decodeURI', 'decodeURIComponent', 'encodeURI', 'encodeURIComponent',
  'eval', 'isFinite', 'isNaN', 'parseFloat', 'parseInt', 'undefined', 'escape', 'unescape',
  // Browser Web APIs & DOM
  'window', 'document', 'console', 'navigator', 'location', 'history', 'localStorage', 'sessionStorage',
  'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'requestAnimationFrame', 'cancelAnimationFrame',
  'fetch', 'Headers', 'Request', 'Response', 'FormData', 'URL', 'URLSearchParams', 'Blob', 'File',
  'FileReader', 'FileList', 'Image', 'Audio', 'ImageData', 'CanvasRenderingContext2D', 'HTMLCanvasElement',
  'HTMLElement', 'Element', 'Node', 'DocumentFragment', 'Event', 'CustomEvent', 'MouseEvent', 'KeyboardEvent',
  'TouchEvent', 'WheelEvent', 'FocusEvent', 'UIEvent', 'AnimationEvent', 'TransitionEvent',
  'IntersectionObserver', 'MutationObserver', 'ResizeObserver', 'PerformanceObserver',
  'performance', 'crypto', 'cryptoSubtle', 'indexedDB', 'IDBKeyRange', 'IDBDatabase', 'IDBTransaction',
  'TextEncoder', 'TextDecoder', 'CompressionStream', 'DecompressionStream', 'DOMParser', 'DOMException',
  'atob', 'btoa', 'alert', 'confirm', 'prompt', 'open', 'close', 'scroll', 'scrollTo', 'scrollBy',
  'matchMedia', 'getComputedStyle', 'queueMicrotask', 'structuredClone', 'reportError',
  'AbortController', 'AbortSignal', 'EventTarget', 'MessageChannel', 'MessagePort',
  'Worker', 'SharedWorker', 'WebSocket', 'XMLHttpRequest',
  // Environment / Bundler / React globals
  'process', 'global', 'globalThis', 'Buffer', 'React', 'JSX', 'import'
]);

function getAllFiles(dir, exts = ['.jsx', '.js']) {
  const results = [];
  const list = fs.readdirSync(dir);
  for (const file of list) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      results.push(...getAllFiles(fullPath, exts));
    } else if (exts.includes(path.extname(file))) {
      results.push(fullPath);
    }
  }
  return results;
}

let errorCount = 0;
const files = getAllFiles(srcDir);

for (const filePath of files) {
  const relPath = path.relative(projectRoot, filePath).replace(/\\/g, '/');
  const code = fs.readFileSync(filePath, 'utf-8');

  let ast;
  try {
    ast = parser.parse(code, {
      sourceType: 'module',
      plugins: ['jsx', 'exportDefaultFrom'],
      errorRecovery: true,
    });
  } catch (err) {
    console.error(`[check:jsx-undefined] Parser error in ${relPath}: ${err.message}`);
    errorCount++;
    continue;
  }

  traverse(ast, {
    // 1. Check JSX Opening Elements (<MyComponent />)
    JSXOpeningElement(pathNode) {
      const nameNode = pathNode.node.name;
      if (nameNode.type === 'JSXIdentifier') {
        const name = nameNode.name;
        // Capitalized identifiers in JSX are component references
        if (/^[A-Z]/.test(name)) {
          if (!pathNode.scope.hasBinding(name) && !KNOWN_GLOBALS.has(name)) {
            const line = pathNode.node.loc?.start?.line || 0;
            const col = pathNode.node.loc?.start?.column || 0;
            console.error(`[check:jsx-undefined] Undefined JSX Component <${name}> at ${relPath}:${line}:${col}`);
            errorCount++;
          }
        }
      } else if (nameNode.type === 'JSXMemberExpression') {
        let root = nameNode;
        while (root.type === 'JSXMemberExpression') {
          root = root.object;
        }
        if (root.type === 'JSXIdentifier') {
          const rootName = root.name;
          if (!pathNode.scope.hasBinding(rootName) && !KNOWN_GLOBALS.has(rootName)) {
            const line = pathNode.node.loc?.start?.line || 0;
            const col = pathNode.node.loc?.start?.column || 0;
            console.error(`[check:jsx-undefined] Undefined JSX Root Object <${rootName}.> at ${relPath}:${line}:${col}`);
            errorCount++;
          }
        }
      }
    },

    // 2. Check referenced uppercase identifiers (potential component/class variables)
    Identifier(pathNode) {
      if (!pathNode.isReferencedIdentifier()) return;
      const name = pathNode.node.name;

      // Only check capitalized names that might represent components or classes
      if (/^[A-Z]/.test(name)) {
        // Skip JSX attribute names like <Tag PropName="val" />
        if (pathNode.parent.type === 'JSXAttribute') return;

        if (!pathNode.scope.hasBinding(name) && !KNOWN_GLOBALS.has(name)) {
          // Additional check: ignore TypeScript types or import assertions if any
          const line = pathNode.node.loc?.start?.line || 0;
          const col = pathNode.node.loc?.start?.column || 0;
          console.error(`[check:jsx-undefined] Undefined Capitalized Identifier "${name}" at ${relPath}:${line}:${col}`);
          errorCount++;
        }
      }
    }
  });
}

if (errorCount > 0) {
  console.error(`\n[check:jsx-undefined] FAILED: Found ${errorCount} undefined JSX/Component references.`);
  process.exit(1);
} else {
  console.log(`[check:jsx-undefined] PASSED: Scanned ${files.length} files. Zero undefined JSX/Component references.`);
  process.exit(0);
}
