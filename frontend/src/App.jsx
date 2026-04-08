import { Routes, Route, Link, useLocation } from 'react-router-dom';
import ProjectHome from './views/ProjectHome.jsx';
import Library from './views/Library.jsx';
import FingerprintDetail from './views/FingerprintDetail.jsx';
import ScenePlayer from './views/ScenePlayer.jsx';

export default function App() {
  const location = useLocation();
  const showNav = location.pathname !== '/';

  return (
    <div className="flex flex-col h-full">
      {showNav && (
        <header className="border-b border-zinc-800 bg-zinc-900/80 backdrop-blur px-6 py-3 flex items-center gap-6">
          <Link to="/" className="font-bold text-lg tracking-tight">
            MusicViz
          </Link>
          <nav className="text-sm text-zinc-400">
            <Link to="/" className="hover:text-zinc-100">Projects</Link>
          </nav>
        </header>
      )}
      <main className="flex-1 overflow-auto">
        <Routes>
          <Route path="/" element={<ProjectHome />} />
          <Route path="/projects/:projectId" element={<Library />} />
          <Route
            path="/projects/:projectId/songs/:songId"
            element={<FingerprintDetail />}
          />
          <Route
            path="/projects/:projectId/songs/:songId/play"
            element={<ScenePlayer />}
          />
        </Routes>
      </main>
    </div>
  );
}
