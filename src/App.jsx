import React, { useEffect } from 'react';
import { Routes, Route, useLocation } from 'react-router-dom';
import Header from './components/layout/Header';
import { CultivationProvider } from './context/CultivationContext';
import './styles/cultivation-theme.css';

// Direct synchronous imports for rock-solid reliability & instant loading (zero spinner delays)
import CultivationWorkspace from './pages/CultivationWorkspace';
import SanctumPage from './pages/SanctumPage';
import LibraryPage from './pages/LibraryPage';
import NovelDetailPage from './pages/NovelDetailPage';
import ReaderPage from './pages/ReaderPage';
import AddNovelPage from './pages/AddNovelPage';
import EditNovelPage from './pages/EditNovelPage';
import AddChapterPage from './pages/AddChapterPage';
import SearchPage from './pages/SearchPage';

function ScrollRestorer() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
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
