from datetime import datetime

from fastapi import APIRouter

from deps import get_db

router = APIRouter()


@router.get("/api/health")
def health():
    gdb = get_db()
    return {"status": "ok", "time": datetime.now().isoformat(timespec="seconds"),
            "db": gdb.path if gdb else None, "total_questions": gdb.count("questions") if gdb else 0}
