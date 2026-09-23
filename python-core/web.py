from pathlib import Path

from fastapi import HTTPException
from fastapi.responses import FileResponse


STATIC_MEDIA = {
    ".js": "text/javascript",
    ".mjs": "text/javascript",
    ".css": "text/css",
    ".html": "text/html",
    ".json": "application/json",
    ".webmanifest": "application/manifest+json",
    ".png": "image/png",
    ".ico": "image/x-icon",
    ".svg": "image/svg+xml",
}




def mount_spa(app, static_dir):
    static_dir = Path(static_dir) if static_dir is not None else None

    @app.get("/{full_path:path}")
    def spa(full_path: str):
        # Phá»¥c vá»¥ báº£n web production (dist/) cÃ¹ng-origin vá»›i API.
        # ÄÄƒng kÃ½ SAU má»i route /api nÃªn khÃ´ng bao giá» nuá»‘t API.
        if static_dir is None:
            raise HTTPException(404, "ChÆ°a build web (npm run build:renderer) hoáº·c chÆ°a truyá»n --static")
        try:
            target = (static_dir / (full_path or "index.html")).resolve()
            target.relative_to(static_dir.resolve())
        except Exception:
            raise HTTPException(404, "Not found")
        if full_path and target.is_file():
            return FileResponse(target, media_type=STATIC_MEDIA.get(target.suffix.lower()))
        index = static_dir / "index.html"
        if index.is_file():
            return FileResponse(index, media_type="text/html")
        raise HTTPException(404, "Not found")
