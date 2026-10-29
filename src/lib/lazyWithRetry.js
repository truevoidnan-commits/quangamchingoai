import React from 'react';

/**
 * Fallback Suspense component matching app dark theme.
 * Completely dark, seamless, no white flash.
 */
export function RouteLoadingFallback() {
  return React.createElement(
    'div',
    {
      style: {
        minHeight: '60vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '14px',
        color: '#94a3b8',
        fontSize: '0.95rem',
        userSelect: 'none',
        backgroundColor: 'transparent',
      },
    },
    React.createElement('div', {
      style: {
        width: '26px',
        height: '26px',
        border: '2.5px solid rgba(148, 163, 184, 0.2)',
        borderTopColor: '#38bdf8',
        borderRadius: '50%',
        animation: 'routeSpin 0.75s linear infinite',
      },
    }),
    React.createElement('span', null, 'Đang tải…'),
    React.createElement(
      'style',
      null,
      `@keyframes routeSpin { to { transform: rotate(360deg); } }`
    )
  );
}

/**
 * Checks whether an error is caused by a missing chunk/dynamic module.
 */
export function isChunkLoadError(error) {
  if (!error) return false;
  const msg = (error.message || String(error)).toLowerCase();
  return (
    msg.includes('dynamically imported module') ||
    msg.includes('failed to fetch') ||
    msg.includes('loading chunk') ||
    msg.includes('loading css chunk') ||
    msg.includes('importing a module script failed') ||
    msg.includes('error loading dynamically imported module') ||
    msg.includes('error resolving module specifier')
  );
}

/**
 * Enhanced React.lazy with 1 retry and 1 page reload on chunk load failure.
 * Prevents white-screen issues on GitHub Pages when old deployment chunks are purged.
 * 
 * @param {() => Promise<{ default: React.ComponentType<any> }>} importFn
 * @param {string} [chunkName='chunk']
 */
export function lazyWithRetry(importFn, chunkName = 'chunk') {
  return React.lazy(async () => {
    const sessionKey = `tcl_chunk_retry_${chunkName}`;

    // 1. Initial attempt
    try {
      const module = await importFn();
      try {
        sessionStorage.removeItem(sessionKey);
      } catch (e) {}
      return module;
    } catch (firstError) {
      console.warn(`[lazyWithRetry] Initial load failed for ${chunkName}, retrying in 800ms...`, firstError);

      // 2. Retry 1 time after 800ms
      try {
        await new Promise((resolve) => setTimeout(resolve, 800));
        const module = await importFn();
        try {
          sessionStorage.removeItem(sessionKey);
        } catch (e) {}
        return module;
      } catch (secondError) {
        console.error(`[lazyWithRetry] Second attempt failed for ${chunkName}:`, secondError);

        let hasReloaded = false;
        try {
          hasReloaded = Boolean(sessionStorage.getItem(sessionKey));
        } catch (e) {
          hasReloaded = true; // Prevent reload loop if sessionStorage is blocked
        }

        // 3. If chunk error and hasn't reloaded yet, reload once
        if (isChunkLoadError(secondError) && !hasReloaded && typeof window !== 'undefined') {
          try {
            sessionStorage.setItem(sessionKey, String(Date.now()));
          } catch (e) {}
          console.warn(`[lazyWithRetry] Reloading page once for updated chunk ${chunkName}...`);
          window.location.reload();
          // Never resolve so React doesn't render ErrorBoundary before reload occurs
          return new Promise(() => {});
        }

        // 4. Already reloaded or not a chunk error: clean up key and throw to ErrorBoundary
        try {
          sessionStorage.removeItem(sessionKey);
        } catch (e) {}
        throw secondError;
      }
    }
  });
}

/**
 * Idle background prefetch for critical interactive routes.
 * Avoids any spinner delay when users click into Cultivation / Sanctum.
 * Respects Data Saver and slow mobile networks.
 *
 * @param {Array<() => Promise<any>>} importFns
 */
export function prefetchLazyRoutes(importFns = []) {
  if (typeof window === 'undefined') return;

  const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  if (conn) {
    if (conn.saveData === true) return;
    const type = String(conn.effectiveType || '').toLowerCase();
    if (type === 'slow-2g' || type === '2g') return;
  }

  const runIdle = typeof window.requestIdleCallback === 'function'
    ? (cb) => window.requestIdleCallback(cb, { timeout: 4000 })
    : (cb) => setTimeout(cb, 3000);

  runIdle(() => {
    importFns.forEach((fn) => {
      try {
        fn().catch(() => {});
      } catch (e) {}
    });
  });
}
