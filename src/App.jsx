import React, { useEffect, Suspense } from 'react';
import { Routes, Route, useLocation } from 'react-router-dom';
import Header from './components/layout/Header';
import { CultivationProvider } from './context/CultivationContext';
import './styles/cultivation-theme.css';

// 1. Synchronous primary reading routes - instant startup, rock-solid reliability, zero spinner delay
import LibraryPage from './pages/LibraryPage';
import NovelDetailPage from './pages/NovelDetailPage';
import ReaderPage from './pages/ReaderPage';

// 2. Lazy loaded secondary routes via lazyWithRetry (anti-white-screen protection for GitHub Pages deployments)
import { lazyWithRetry, prefetchLazyRoutes, RouteLoadingFallback } from './lib/lazyWithRetry';

const CultivationWorkspace = lazyWithRetry(() => import('./pages/CultivationWorkspace'), 'CultivationWorkspace');
const SanctumPage = lazyWithRetry(() => import('./pages/SanctumPage'), 'SanctumPage');
const SyncPage = lazyWithRetry(() => import('./pages/SyncPage'), 'SyncPage');
const BackupPage = lazyWithRetry(() => import('./pages/BackupPage'), 'BackupPage');
const AddNovelPage = lazyWithRetry(() => import('./pages/AddNovelPage'), 'AddNovelPage');
const EditNovelPage = lazyWithRetry(() => import('./pages/EditNovelPage'), 'EditNovelPage');
const AddChapterPage = lazyWithRetry(() => import('./pages/AddChapterPage'), 'AddChapterPage');
const SearchPage = lazyWithRetry(() => import('./pages/SearchPage'), 'SearchPage');

import { preloadCoreArtifactIcons } from './lib/artifactIcons';
import { startBackgroundPrefetch } from './lib/backgroundPrefetch';
import { runMigrationV2 } from './lib/migration';
import SandboxBanner from './components/cultivation/SandboxBanner';
import { initAutoSync, pullCultivationBeforeMeditation } from './lib/sync/autoSync.js';

function ScrollRestorer() {
  const { pathname } = useLocation();
  useEffect(() => {
    // Không tự ý cuộn lên đầu nếu vào trang đọc truyện (ReaderPage tự quản lý khôi phục vị trí đọc dở)
    const isReaderRoute = pathname.includes('/read/') || pathname.includes('/chapter/');
    if (!isReaderRoute) {
      window.scrollTo(0, 0);
    }
  }, [pathname]);

  useEffect(() => {
    preloadCoreArtifactIcons();
    startBackgroundPrefetch();
    runMigrationV2().catch(() => {});
    pullCultivationBeforeMeditation().finally(() => {
      initAutoSync();
    });

    // Idle background prefetch for high-traffic secondary routes
    prefetchLazyRoutes([
      () => import('./pages/CultivationWorkspace'),
      () => import('./pages/SanctumPage'),
    ]);
  }, []);

  return null;
}

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, info: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, info) {
    console.error('Render Error Boundary Caught:', error, info);
    this.setState({ info });
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 40, background: '#0d1624', color: '#ff6b6b', fontFamily: 'monospace', zIndex: 9999, position: 'relative' }}>
          <h2>🚨 Đã có lỗi xảy ra khi tải giao diện:</h2>
          <pre style={{ background: '#1c0f0f', padding: 20, borderRadius: 8, overflowX: 'auto', color: '#ffd1d1' }}>
            {this.state.error?.toString()}
          </pre>
          <div style={{ marginTop: 20, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <button 
              onClick={() => window.location.reload()}
              style={{ padding: '10px 20px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600 }}
            >
              🔄 Tải lại trang
            </button>
            <button 
              onClick={() => { localStorage.clear(); window.location.reload(); }}
              style={{ padding: '10px 20px', background: '#334155', color: '#cbd5e1', border: 'none', borderRadius: 6, cursor: 'pointer' }}
            >
              Xóa Cache & Tải lại
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function MainLayout() {
  const location = useLocation();
  const hideHeader = 
    location.pathname.startsWith('/cultivation') || 
    location.pathname.startsWith('/sanctum') ||
    location.pathname.includes('/read/') ||
    location.pathname.includes('/chapter/');

  return (
    <>
      {!hideHeader && <Header />}
      <main className="main-content" style={{ padding: hideHeader ? 0 : undefined, margin: hideHeader ? 0 : undefined }}>
        <Routes>
          {/* Synchronous primary reading routes - zero spinner / zero delay */}
          <Route path="/" element={<LibraryPage />} />
          <Route path="/novel/:id" element={<NovelDetailPage />} />
          <Route path="/novel/:novelId" element={<NovelDetailPage />} />
          <Route path="/novel/:id/read/:chapterId" element={<ReaderPage />} />
          <Route path="/novel/:id/chapter/:chapterId" element={<ReaderPage />} />
          <Route path="/novel/:novelId/read/:chapterId" element={<ReaderPage />} />
          <Route path="/novel/:novelId/chapter/:chapterId" element={<ReaderPage />} />

          {/* Lazy loaded routes wrapped in Suspense with dark theme fallback */}
          <Route path="/add-novel" element={<Suspense fallback={<RouteLoadingFallback />}><AddNovelPage /></Suspense>} />
          <Route path="/edit-novel/:id" element={<Suspense fallback={<RouteLoadingFallback />}><EditNovelPage /></Suspense>} />
          <Route path="/edit-novel/:novelId" element={<Suspense fallback={<RouteLoadingFallback />}><EditNovelPage /></Suspense>} />
          <Route path="/novel/:id/edit" element={<Suspense fallback={<RouteLoadingFallback />}><EditNovelPage /></Suspense>} />
          <Route path="/novel/:novelId/edit" element={<Suspense fallback={<RouteLoadingFallback />}><EditNovelPage /></Suspense>} />
          <Route path="/novel/:id/add-chapter" element={<Suspense fallback={<RouteLoadingFallback />}><AddChapterPage /></Suspense>} />
          <Route path="/novel/:novelId/add-chapter" element={<Suspense fallback={<RouteLoadingFallback />}><AddChapterPage /></Suspense>} />
          <Route path="/novel/:novelId/edit-chapter/:chapterId" element={<Suspense fallback={<RouteLoadingFallback />}><AddChapterPage /></Suspense>} />
          <Route path="/search" element={<Suspense fallback={<RouteLoadingFallback />}><SearchPage /></Suspense>} />
          <Route path="/cultivation" element={<Suspense fallback={<RouteLoadingFallback />}><CultivationWorkspace /></Suspense>} />
          <Route path="/sanctum" element={<Suspense fallback={<RouteLoadingFallback />}><SanctumPage /></Suspense>} />
          <Route path="/sync" element={<Suspense fallback={<RouteLoadingFallback />}><SyncPage /></Suspense>} />
          <Route path="/backup" element={<Suspense fallback={<RouteLoadingFallback />}><BackupPage /></Suspense>} />
        </Routes>
      </main>
    </>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <CultivationProvider>
        <ScrollRestorer />
        <SandboxBanner />
        <MainLayout />
      </CultivationProvider>
    </ErrorBoundary>
  );
}
