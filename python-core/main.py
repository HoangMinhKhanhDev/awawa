"""Python core cho phan mem on luyen HSG THPT (thin entry point).

Chay offline, luu SQLite local.
Run: python main.py --port 8765 --db-path ./data/app.db
Logic nam o cac module: database, seed, models, auth, files,
serializers, routes_*, app (build FastAPI), web (static SPA).
"""
import argparse
import sys
from pathlib import Path

try:
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
except Exception:
    pass

import deps
from app import build_app
from web import mount_spa

BASE_DIR = Path(__file__).parent
DEFAULT_DB = BASE_DIR / "data" / "app.db"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=8765)
    ap.add_argument("--host", type=str, default="127.0.0.1",
                    help="127.0.0.1 = local only; 0.0.0.0 = LAN")
    ap.add_argument("--db-path", type=str, default=str(DEFAULT_DB))
    ap.add_argument("--static", type=str, default=None,
                    help="Web build dir (VD: ../dist) de phuc vu PWA cung-origin voi API")
    args = ap.parse_args()
    db = deps.init_db(args.db_path)
    app = build_app()
    if args.static:
        p = Path(args.static)
        static_dir = p if p.is_absolute() else (BASE_DIR / p)
        mount_spa(app, static_dir)
        print(f"[core] static: {static_dir} (exists={static_dir.is_dir()})", flush=True)
    print(f"[core] DB: {args.db_path} | questions: {db.count('questions')}", flush=True)
    import uvicorn
    uvicorn.run(app, host=args.host, port=args.port, log_level="info")


if __name__ == "__main__":
    main()
