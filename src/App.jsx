import React, { useEffect } from 'react';
import { Routes, Route, useLocation } from 'react-router-dom';
import Header from './components/layout/Header';
import LibraryPage from './pages/LibraryPage';
import NovelDetailPage from './pages/NovelDetailPage';
import ReaderPage from './pages/ReaderPage';
import AddNovelPage from './pages/AddNovelPage';
import EditNovelPage from './pages/EditNovelPage';
import AddChapterPage from './pages/AddChapterPage';
import SearchPage from './pages/SearchPage';
import CultivationWorkspace from './pages/CultivationWorkspace';
import SanctumPage from './pages/SanctumPage';
import { CultivationProvider } from './context/CultivationContext';
import './styles/cultivation-theme.css';

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
          <pre style={{ marginTop: 10, color: '#aaa', fontSize: 12 }}>
            {this.state.info?.componentStack}
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

export default function App() {
  const location = useLocation();
  const isReader = location.pathname.includes('/read/');
  const isCultivation = location.pathname === '/cultivation' || location.pathname === '/sanctum';

  return (
    <ErrorBoundary>
      <CultivationProvider>
        <ScrollRestorer />
        {/* Don't show global header on reader page, cultivation page, or sanctum page */}
        {(!isReader && !isCultivation) && <Header />}
        <Routes>
          <Route path="/" element={<LibraryPage />} />
          <Route path="/novel/:novelId" element={<NovelDetailPage />} />
          <Route path="/novel/:novelId/read/:chapterId" element={<ReaderPage />} />
          <Route path="/add-novel" element={<AddNovelPage />} />
          <Route path="/novel/:novelId/edit" element={<EditNovelPage />} />
          <Route path="/novel/:novelId/add-chapter" element={<AddChapterPage />} />
          <Route path="/novel/:novelId/edit-chapter/:chapterId" element={<AddChapterPage />} />
          <Route path="/search" element={<SearchPage />} />
          <Route path="/cultivation" element={<CultivationWorkspace />} />
          <Route path="/sanctum" element={<SanctumPage />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </CultivationProvider>
    </ErrorBoundary>
  );
}

function NotFound() {
  return (
    <div style={{ textAlign: 'center', padding: '100px 20px' }}>
      <h1 style={{ fontFamily: 'var(--font-serif)', color: 'var(--accent-gold)', fontSize: 56, marginBottom: 16 }}>
        404
      </h1>
      <h2 style={{ color: 'var(--text-secondary)', marginBottom: 12 }}>Không tìm thấy trang</h2>
      <a href="/" className="btn-ghost" style={{ display: 'inline-flex' }}>← Về trang chủ</a>
    </div>
  );
}