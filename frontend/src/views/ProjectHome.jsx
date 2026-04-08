import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useStore } from '../store/useStore.js';

export default function ProjectHome() {
  const { projects, loadProjects, createProject, deleteProject } = useStore();
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    loadProjects().catch(() => {});
  }, [loadProjects]);

  async function handleCreate(e) {
    e.preventDefault();
    if (!name.trim()) return;
    setCreating(true);
    try {
      const project = await createProject(name.trim());
      setName('');
      navigate(`/projects/${project.id}`);
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto p-10">
      <h1 className="text-4xl font-bold tracking-tight mb-2">MusicViz</h1>
      <p className="text-zinc-400 mb-10">
        Fingerprint music and generate visual experiences from the analysis.
      </p>

      <section className="mb-10">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-500 mb-3">
          New Project
        </h2>
        <form onSubmit={handleCreate} className="flex gap-2">
          <input
            type="text"
            placeholder="Project name…"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="flex-1 bg-zinc-900 border border-zinc-800 rounded px-4 py-2 focus:outline-none focus:border-zinc-600"
          />
          <button
            type="submit"
            disabled={creating || !name.trim()}
            className="bg-indigo-600 hover:bg-indigo-500 disabled:bg-zinc-800 disabled:text-zinc-500 px-5 py-2 rounded font-medium"
          >
            Create
          </button>
        </form>
      </section>

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-500 mb-3">
          Recent Projects
        </h2>
        {projects.length === 0 ? (
          <p className="text-zinc-600">No projects yet.</p>
        ) : (
          <ul className="space-y-2">
            {projects.map((p) => (
              <li
                key={p.id}
                className="flex items-center justify-between bg-zinc-900 border border-zinc-800 rounded px-4 py-3 hover:border-zinc-700"
              >
                <Link to={`/projects/${p.id}`} className="flex-1">
                  <div className="font-medium">{p.name}</div>
                  <div className="text-xs text-zinc-500">
                    Modified {new Date(p.modified).toLocaleString()}
                  </div>
                </Link>
                <button
                  onClick={() => {
                    if (confirm(`Delete project "${p.name}"? This removes all fingerprint data.`)) {
                      deleteProject(p.id);
                    }
                  }}
                  className="text-zinc-500 hover:text-red-400 text-sm"
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
