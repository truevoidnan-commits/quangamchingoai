import { Routes, Route, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import Header from './components/layout/Header';
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

export default function App() {
  const location = useLocation();
  const isReader = location.pathname.includes('/read/');

  return (
    <>
      <ScrollRestorer />
      {/* Don't show global header on reader page — it has its own */}
      {!isReader && <Header />}
      <Routes>
        <Route path="/" element={<LibraryPage />} />
        <Route path="/novel/:novelId" element={<NovelDetailPage />} />
        <Route path="/novel/:novelId/read/:chapterId" element={<ReaderPage />} />
        <Route path="/add-novel" element={<AddNovelPage />} />
        <Route path="/novel/:novelId/edit" element={<EditNovelPage />} />
        <Route path="/novel/:novelId/add-chapter" element={<AddChapterPage />} />
        <Route path="/novel/:novelId/edit-chapter/:chapterId" element={<AddChapterPage />} />
        <Route path="/search" element={<SearchPage />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </>
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
