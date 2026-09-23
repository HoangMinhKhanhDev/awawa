import json

from fastapi import APIRouter, File, Request, UploadFile
from typing import Optional

from auth import require_teacher
from deps import get_db
from files import extract_file_text
from models import BulkIn, PreviewIn, QuestionIn, TopicIn
from serializers import row_to_q

router = APIRouter()


@router.get("/api/subjects")
def subjects():
    return [dict(r) for r in get_db().q("SELECT * FROM subjects ORDER BY name")]


@router.get("/api/topics")
def topics(subject_id: Optional[str] = None):
    if subject_id:
        return [dict(r) for r in get_db().q("SELECT * FROM topics WHERE subject_id=? ORDER BY name", (subject_id,))]
    return [dict(r) for r in get_db().q("SELECT * FROM topics ORDER BY name")]


@router.post("/api/topics")
def create_topic(payload: TopicIn, request: Request):
    require_teacher(request)
    if not payload.name.strip():
        raise HTTPException(400, "Thiáº¿u tÃªn chuyÃªn Ä‘á»")
    if not get_db().q1("SELECT 1 FROM subjects WHERE id=?", (payload.subject_id,)):
        raise HTTPException(400, "MÃ´n khÃ´ng tá»“n táº¡i")
    import uuid
    tid = (payload.id or "").strip() or f"t-{uuid.uuid4().hex[:8]}"
    if get_db().q1("SELECT 1 FROM topics WHERE id=?", (tid,)):
        raise HTTPException(400, "MÃ£ chuyÃªn Ä‘á» Ä‘Ã£ tá»“n táº¡i")
    get_db().exec("INSERT INTO topics (id, subject_id, name, grade) VALUES (?,?,?,?)",
            (tid, payload.subject_id, payload.name.strip()[:200], int(payload.grade or 12)))
    return {"id": tid}


@router.get("/api/questions")
def list_questions(subject_id: Optional[str] = None, topic_id: Optional[str] = None,
                    grade: Optional[str] = None, difficulty: Optional[str] = None,
                    qtype: Optional[str] = None, search: Optional[str] = None, limit: int = 200):
    sql = "SELECT * FROM questions WHERE 1=1"
    params = []
    if subject_id: sql += " AND subject_id=?"; params.append(subject_id)
    if topic_id: sql += " AND topic_id=?"; params.append(topic_id)
    if grade: sql += " AND grade=?"; params.append(int(grade))
    if difficulty: sql += " AND difficulty=?"; params.append(difficulty)
    if qtype: sql += " AND qtype=?"; params.append(qtype)
    if search: sql += " AND content LIKE ?"; params.append(f"%{search}%")
    sql += " ORDER BY id DESC LIMIT ?"
    params.append(max(1, min(limit, 500)))
    return [row_to_q(r) for r in get_db().q(sql, tuple(params))]


@router.post("/api/questions")
def create_question(payload: QuestionIn, request: Request):
    require_teacher(request)
    if payload.subject_id and not get_db().q1("SELECT 1 FROM subjects WHERE id=?", (payload.subject_id,)):
        raise HTTPException(400, "MÃ´n khÃ´ng tá»“n táº¡i")
    now = datetime.now().isoformat(timespec="seconds")
    cur = get_db().exec(
        "INSERT INTO questions (subject_id, topic_id, grade, difficulty, qtype, content, options, correct_answer, explanation, score, source, image_url, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
        (payload.subject_id, payload.topic_id, payload.grade, payload.difficulty, payload.qtype,
         payload.content.strip(), json.dumps(payload.options or [], ensure_ascii=False),
         (payload.correct_answer or "").strip(), payload.explanation or "", payload.score, "thá»§ cÃ´ng",
         (payload.image_url or "").strip()[:2000], now))
    return {"id": cur.lastrowid}


@router.post("/api/questions/bulk")
def bulk(payload: BulkIn, request: Request):
    require_teacher(request)
    now = datetime.now().isoformat(timespec="seconds")
    n = 0
    for it in payload.items or []:
        if not (it.get("content") or "").strip() or not it.get("subject_id"):
            continue
        get_db().exec(
            "INSERT INTO questions (subject_id, topic_id, grade, difficulty, qtype, content, options, correct_answer, explanation, score, source, image_url, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
            (it.get("subject_id"), it.get("topic_id"), int(it.get("grade") or 12),
             it.get("difficulty") or "váº­n dá»¥ng", it.get("qtype") or "trac_nghiem",
             it.get("content", "").strip(), json.dumps(it.get("options") or [], ensure_ascii=False),
             (it.get("correct_answer") or "").strip(), it.get("explanation") or "", float(it.get("score") or 1), "nháº­p Ä‘á»",
             (it.get("image_url") or "").strip()[:2000] if isinstance(it.get("image_url"), str) else "", now))
        n += 1
    return {"inserted": n}


@router.put("/api/questions/{qid}")
def update_question(qid: int, payload: QuestionIn, request: Request):
    require_teacher(request)
    r = get_db().q1("SELECT * FROM questions WHERE id=?", (qid,))
    if not r: raise HTTPException(404, "KhÃ´ng tÃ¬m tháº¥y cÃ¢u há»i")
    get_db().exec("UPDATE questions SET subject_id=?, topic_id=?, grade=?, difficulty=?, qtype=?, content=?, options=?, correct_answer=?, explanation=?, score=?, image_url=? WHERE id=?",
            (payload.subject_id, payload.topic_id, payload.grade, payload.difficulty, payload.qtype,
             payload.content.strip(), json.dumps(payload.options or [], ensure_ascii=False),
             (payload.correct_answer or "").strip(), payload.explanation or "", payload.score,
             (payload.image_url or "").strip()[:2000], qid))
    return {"ok": True}


@router.delete("/api/questions/{qid}")
def delete_question(qid: int, request: Request):
    require_teacher(request)
    get_db().exec("DELETE FROM questions WHERE id=?", (qid,))
    return {"ok": True}


@router.post("/api/import/preview-text")
def preview_text(payload: PreviewIn):
    return {"text": payload.text, "drafts": parse_text_to_drafts(payload.text)}


@router.post("/api/import/upload")
async def upload(file: UploadFile = File(...), request: Request = None):
    if request is not None:
        require_teacher(request)
    data = await file.read()
    if len(data) > 15 * 1024 * 1024:
        raise HTTPException(400, "File quÃ¡ lá»›n (>15MB)")
    try:
        text = extract_file_text(file.filename or "", data)
    except ValueError as e:
        raise HTTPException(400, str(e))
    except Exception as e:
        raise HTTPException(400, f"KhÃ´ng Ä‘á»c Ä‘Æ°á»£c file: {e}")
    return {"filename": file.filename, "text": text[:50000], "drafts": parse_text_to_drafts(text)}
