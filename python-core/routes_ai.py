# AI (Agnes) + Flashcards — mirror PHP. Key chi doc env AGNES_API_KEY.
import json
import os
import re
import urllib.error
import urllib.request
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from auth import optional_session, require_teacher
from deps import get_db

router = APIRouter()

AGNES_BASE = os.getenv("AGNES_BASE_URL", "https://apihub.agnes-ai.com/v1").rstrip("/")
AGNES_KEY = os.getenv("AGNES_API_KEY", "")
AGNES_DEFAULT = os.getenv("AGNES_DEFAULT_MODEL", "agnes-2.5-flash")
MODELS = ("agnes-2.5-flash", "agnes-2.0-flash", "agnes-1.5-flash")


class AiGenIn(BaseModel):
    type: str
    topic: str = ""
    subject: str = ""
    prompt: str = ""
    count: int = 5
    difficulty: str = "vận dụng"
    qtype: str = "trac_nghiem"
    model: str = ""


class CardIn(BaseModel):
    topic_id: str
    cards: list


class CardPut(BaseModel):
    front: str = ""
    back: str = ""


class ReviewIn(BaseModel):
    quality: int = 0


def agnes_chat(messages, model="", max_tokens=4000, temperature=0.4) -> str:
    if not AGNES_KEY:
        raise HTTPException(500, "AI chua cau hinh (thieu AGNES_API_KEY).")
    if model not in MODELS:
        model = AGNES_DEFAULT
    body = json.dumps({
        "model": model,
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_tokens,
    }, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(
        AGNES_BASE + "/chat/completions",
        data=body,
        headers={
            "Authorization": "Bearer " + AGNES_KEY,
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=90) as resp:
            j = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", "replace")[:300]
        raise HTTPException(502, f"AI loi {e.code}: {detail}")
    except Exception as e:
        raise HTTPException(502, f"AI loi mang: {e}")
    content = ""
    try:
        content = j["choices"][0]["message"]["content"]
    except Exception:
        pass
    if not content:
        raise HTTPException(502, "AI khong tra ve noi dung.")
    return content


def parse_json(text: str):
    t = (text or "").strip()
    t = re.sub(r"^```(?:json)?\s*", "", t, flags=re.I)
    t = re.sub(r"\s*```$", "", t)
    t = t.strip()
    try:
        return json.loads(t)
    except Exception:
        pass
    for open_c, close_c in (("{", "}"), ("[", "]")):
        s = t.find(open_c)
        e = t.rfind(close_c)
        if s >= 0 and e > s:
            try:
                return json.loads(t[s:e + 1])
            except Exception:
                continue
    return None


def build_messages(payload: AiGenIn):
    t = (payload.type or "").strip()
    topic = (payload.topic or "").strip()[:200]
    subject = (payload.subject or "").strip()[:200]
    extra = (payload.prompt or "").strip()[:1000]
    count = max(1, min(int(payload.count or 5), 30))
    difficulty = payload.difficulty or "van dung"
    qtype = payload.qtype if payload.qtype in ("trac_nghiem", "tu_luan", "dung_sai", "diem_khuyet") else "trac_nghiem"
    sys_msg = "Ban la AI giao vien mon hoc. Tra ve JSON THUAN, khong giai thich, khong markdown fence."
    if t in ("questions", "cloze"):
        if t == "cloze" or qtype == "diem_khuyet":
            want = '{"questions":[{"content":"Cau co ___ va {{tu}}","correct_answer":"a|b"}]}'
            user = (f"Tao {count} cau diem khuyet cho '{topic}' mon '{subject}'. "
                    f"Dung ___ hoac {{tu}} trong content, correct_answer tach bang | theo thu tu blank. {extra}")
        else:
            want = '{"questions":[{"content":"...","options":["A","B","C","D"],"correct_answer":"A","explanation":"..."}]}'
            user = (f"Tao {count} cau hoi {qtype} muc do {difficulty} cho mon '{subject}', chuyen de '{topic}'. {extra} "
                    f"Trac nghiem: options 4 loi, correct_answer A/B/C/D.")
    elif t == "lesson":
        want = '{"title":"...","content":"400-800 tu tieng Viet"}'
        user = f"Viet bai hoc chuyen de '{topic}' mon '{subject}'. {extra}"
    elif t == "exam":
        want = '{"title":"...","questions":[{"content":"...","options":["A","B","C","D"],"correct_answer":"A","explanation":"..."}]}'
        user = f"Tao de thi {count} cau trac nghiem mon '{subject}' chuyen de '{topic}', do kho {difficulty}. {extra}"
    else:
        want = '{"cards":[{"front":"...","back":"..."}]}'
        user = f"Tao {count} flashcard cho '{topic}' mon '{subject}'. Front ngan, back ro rang, tieng Viet. {extra}"
    return {
        "messages": [
            {"role": "system", "content": sys_msg},
            {"role": "user", "content": user + " JSON format: " + want},
        ],
        "type": t,
        "model": payload.model,
    }


def agnes_chat_stream(messages, model=""):
    """Yield delta text chunks; finally yield a marker then full text via generator pattern.
    Returns generator of (kind, payload): ('delta', str) | ('error', str) | ('done', str)."""
    if not AGNES_KEY:
        yield ("error", "AI chua cau hinh (thieu AGNES_API_KEY).")
        return
    if model not in MODELS:
        model = AGNES_DEFAULT
    body = json.dumps({
        "model": model,
        "messages": messages,
        "temperature": 0.4,
        "max_tokens": 4000,
        "stream": True,
    }, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(
        AGNES_BASE + "/chat/completions",
        data=body,
        headers={
            "Authorization": "Bearer " + AGNES_KEY,
            "Content-Type": "application/json",
            "Accept": "text/event-stream",
        },
        method="POST",
    )
    full = ""
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            for raw_line in resp:
                line = raw_line.decode("utf-8", "replace").strip()
                if not line.startswith("data:"):
                    continue
                data = line[5:].strip()
                if data == "[DONE]":
                    break
                try:
                    j = json.loads(data)
                except Exception:
                    continue
                delta = ""
                try:
                    delta = j["choices"][0]["delta"].get("content") or ""
                except Exception:
                    pass
                if delta:
                    full += delta
                    yield ("delta", delta)
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", "replace")[:300]
        yield ("error", f"AI loi {e.code}: {detail}")
        return
    except Exception as e:
        yield ("error", f"AI loi mang: {e}")
        return
    if not full:
        yield ("error", "AI khong tra ve noi dung.")
        return
    yield ("done", full)


def sse(event: str, data) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


@router.post("/api/ai/generate-stream")
def ai_generate_stream(payload: AiGenIn, request: Request):
    require_teacher(request)
    t = (payload.type or "").strip()
    if t not in ("questions", "lesson", "exam", "flashcards", "cloze"):
        raise HTTPException(400, "type khong hop le.")
    built = build_messages(payload)
    model = payload.model or AGNES_DEFAULT

    def gen():
        yield sse("meta", {"type": t, "model": model})
        full = None
        for kind, val in agnes_chat_stream(built["messages"], payload.model):
            if kind == "delta":
                yield sse("delta", {"text": val})
            elif kind == "error":
                yield sse("error", {"message": val})
                return
            elif kind == "done":
                full = val
        if not full:
            yield sse("error", {"message": "AI khong tra ve noi dung."})
            return
        parsed = parse_json(full)
        if parsed is None:
            yield sse("error", {"message": "AI khong tra JSON hop le."})
            return
        yield sse("result", {"type": t, "model": model, "data": parsed})

    return StreamingResponse(gen(), media_type="text/event-stream", headers={
        "Cache-Control": "no-cache",
        "X-Accel-Buffering": "no",
    })


@router.post("/api/ai/generate")
def ai_generate(payload: AiGenIn, request: Request):
    require_teacher(request)
    t = (payload.type or "").strip()
    if t not in ("questions", "lesson", "exam", "flashcards", "cloze"):
        raise HTTPException(400, "type khong hop le.")
    built = build_messages(payload)
    raw = agnes_chat(built["messages"], payload.model, 4000, 0.4)
    parsed = parse_json(raw)
    if parsed is None:
        raise HTTPException(502, "AI khong tra JSON hop le.")
    return {"type": t, "model": payload.model or AGNES_DEFAULT, "data": parsed}


# ---------------- FLASHCARDS ----------------
@router.get("/api/flashcards")
def list_flashcards(request: Request, topic_id: str = ""):
    me = optional_session(request)
    if not me:
        raise HTTPException(401, "Chua dang nhap.")
    if not topic_id:
        raise HTTPException(400, "Thieu topic_id.")
    db = get_db()
    cards = [dict(r) for r in db.q(
        "SELECT id, topic_id, lesson_id, front, back, idx FROM flashcards WHERE topic_id=? ORDER BY idx, id",
        (topic_id,))]
    is_staff = (me.get("role") or "student") in ("teacher", "admin", "super_admin")
    if not is_staff:
        prog = {r["card_id"]: r["box"] for r in db.q(
            "SELECT card_id, box FROM flashcard_progress WHERE student_id=?", (me["id"],))}
        for c in cards:
            c["box"] = prog.get(c["id"], 0)
    return cards


@router.post("/api/flashcards")
def create_flashcards(payload: CardIn, request: Request):
    require_teacher(request)
    db = get_db()
    topic_id = (payload.topic_id or "").strip()
    if not topic_id or not db.q1("SELECT 1 FROM topics WHERE id=?", (topic_id,)):
        raise HTTPException(400, "Thieu/sai topic.")
    start = db.q1("SELECT COALESCE(MAX(idx),0) m FROM flashcards WHERE topic_id=?", (topic_id,))["m"]
    n = 0
    for i, c in enumerate(payload.cards or []):
        if isinstance(c, str):
            front, back = c.strip(), ""
        else:
            front = str(c.get("front") or "").strip()[:1000]
            back = str(c.get("back") or "").strip()[:4000]
        if not front:
            continue
        db.exec("INSERT INTO flashcards (topic_id, front, back, idx, created_at) VALUES (?,?,?,?,?)",
                (topic_id, front, back, start + n + 1, datetime.now().isoformat(timespec="seconds")))
        n += 1
    if n == 0:
        raise HTTPException(400, "Khong co the hop le.")
    return {"inserted": n}


@router.put("/api/flashcards/{fid}")
def update_flashcard(fid: int, payload: CardPut, request: Request):
    require_teacher(request)
    db = get_db()
    if not db.q1("SELECT 1 FROM flashcards WHERE id=?", (fid,)):
        raise HTTPException(404, "Khong tim thay the.")
    db.exec("UPDATE flashcards SET front=?, back=? WHERE id=?",
            (payload.front.strip()[:1000], payload.back.strip()[:4000], fid))
    return {"ok": True}


@router.delete("/api/flashcards/{fid}")
def delete_flashcard(fid: int, request: Request):
    require_teacher(request)
    get_db().exec("DELETE FROM flashcards WHERE id=?", (fid,))
    return {"ok": True}


@router.post("/api/flashcards/{fid}/review")
def review_flashcard(fid: int, payload: ReviewIn, request: Request):
    me = optional_session(request)
    if not me:
        raise HTTPException(401, "Chua dang nhap.")
    if (me.get("role") or "student") in ("teacher", "admin", "super_admin"):
        raise HTTPException(400, "GV khong hoc flashcard.")
    db = get_db()
    if not db.q1("SELECT 1 FROM flashcards WHERE id=?", (fid,)):
        raise HTTPException(404, "Khong tim thay the.")
    q = max(0, min(2, int(payload.quality or 0)))
    row = db.q1("SELECT box FROM flashcard_progress WHERE student_id=? AND card_id=?", (me["id"], fid))
    box = int(row["box"]) if row else 1
    if q == 0:
        box = 1
    elif q == 2:
        box = min(4, box + 1)
    now = datetime.now().isoformat(timespec="seconds")
    db.exec(
        "INSERT INTO flashcard_progress (student_id, card_id, box, last_reviewed_at) VALUES (?,?,?,?) "
        "ON CONFLICT(student_id, card_id) DO UPDATE SET box=excluded.box, last_reviewed_at=excluded.last_reviewed_at",
        (me["id"], fid, box, now))
    return {"card_id": fid, "box": box}
