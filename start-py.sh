source ./backend/.venv/bin/activate
uvicorn musicviz.api.server:app --host 127.0.0.1 --port 8765 --reload --reload-dir backend/musicviz

