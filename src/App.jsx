import React, { useEffect, Suspense, lazy } from 'react';
import { Routes, Route, useLocation } from 'react-router-dom';
import Header from './components/layout/Header';
import { CultivationProvider } from './context/CultivationContext';
import './styles/cultivation-theme.css';

// Lazy load all pages for instant page reload and ultra-fast initial load
const CultivationWorkspace = lazy(() => import('./pages/CultivationWorkspace'));
const SanctumPage = lazy(() => import('./pages/SanctumPage'));
const LibraryPage = lazy(() => import('./pages/LibraryPage'));
const NovelDetailPage = lazy(() => import('./pages/NovelDetailPage'));
const ReaderPage = lazy(() => import('./pages/ReaderPage'));
const AddNovelPage = lazy(() => import('./pages/AddNovelPage'));
const EditNovelPage = lazy(() => import('./pages/EditNovelPage'));
const AddChapterPage = lazy(() => import('./pages/AddChapterPage'));
const SearchPage = lazy(() => import('./pages/SearchPage'));

function ScrollRestorer() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

function PageFallback() {
  return (
    <div style={{
      width: '100vw',
      height: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#040710',
      color: '#22c3f0',
      fontFamily: "'Noto Serif', serif",
      fontSize: 14,
      gap: 12
    }}>
      <div style={{
        width: 24,
        height: 24,
        border: '2px solid rgba(34, 195, 240, 0.2)',
        borderTopColor: '#22c3f0',
        borderRadius: '50%',
        animation: 'spin 0.8s linear infinite'
      }} />
      <span>Đang mở Tiên Phủ...</span>
    </div>
  );
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
          <button 
            onClick={() => { localStorage.clear(); window.location.reload(); }}
            style={{ marginTop: 20, padding: '10px 20px', background: '#e24b4a', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}
          >
            Xóa Cache LocalStorage & Tải lại
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

function MainLayout() {
  const location = useLocation();
  const hideHeader = location.pathname.startsWith('/cultivation') || location.pathname.startsWith('/sanctum');

  return (
    <>
      {!hideHeader && <Header />}
      <main className="main-content" style={{ padding: hideHeader ? 0 : undefined, margin: hideHeader ? 0 : undefined }}>
        <Suspense fallback={<PageFallback />}>
                    <Routes>
            <Route path="/" element={<LibraryPage />} />
            <Route path="/novel/:id" element={<NovelDetailPage />} />
            <Route path="/novel/:novelId" element={<NovelDetailPage />} />
            <Route path="/novel/:id/read/:chapterId" element={<ReaderPage />} />
            <Route path="/novel/:id/chapter/:chapterId" element={<ReaderPage />} />
            <Route path="/novel/:novelId/read/:chapterId" element={<ReaderPage />} />
            <Route path="/novel/:novelId/chapter/:chapterId" element={<ReaderPage />} />
            <Route path="/add-novel" element={<AddNovelPage />} />
            <Route path="/edit-novel/:id" element={<EditNovelPage />} />
            <Route path="/novel/:id/edit" element={<EditNovelPage />} />
            <Route path="/novel/:id/add-chapter" element={<AddChapterPage />} />
            <Route path="/novel/:novelId/add-chapter" element={<AddChapterPage />} />
            <Route path="/novel/:novelId/edit-chapter/:chapterId" element={<AddChapterPage />} />
            <Route path="/search" element={<SearchPage />} />
            <Route path="/cultivation" element={<CultivationWorkspace />} />
            <Route path="/sanctum" element={<SanctumPage />} />
          </Routes>
        </Suspense>
      </main>
    </>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <CultivationProvider>
        <ScrollRestorer />
        <MainLayout />
      </CultivationProvider>
    </ErrorBoundary>
  );
}
