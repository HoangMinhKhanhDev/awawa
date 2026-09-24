import json
from datetime import datetime

from fastapi import APIRouter, File, HTTPException, Request, UploadFile
from typing import Optional

from auth import require_perm, require_teacher
from deps import get_db
from files import extract_file_text, parse_text_to_drafts
from models import BulkIn, MaterialIn, PreviewIn, QuestionIn, TopicIn, TopicUpdateIn
from serializers import row_to_q

router = APIRouter()

TOPIC_MAX_DEPTH = 8
TOPIC_STATUSES = ("draft", "review", "published", "archived")


def validate_topic_parent(parent_id, topic_id, subject_id):
    parent = str(parent_id or "").strip() or None
    if parent is None:
        return None
    target = str(topic_id or "")
    seen = set()
    current = parent
    depth = 1
    while current:
        if current == target or current in seen:
            raise HTTPException(400, "Chuyen de cha khong hop le.")
        seen.add(current)
        row = get_db().q1("SELECT id, subject_id, parent_id FROM topics WHERE id=?", (current,))
        if not row:
            raise HTTPException(400, "Chuyen de cha khong ton tai.")
        if str(row["subject_id"] or "") != str(subject_id or ""):
            raise HTTPException(400, "Chuyen de cha phai cung mon.")
        depth += 1
        if depth > TOPIC_MAX_DEPTH:
            raise HTTPException(400, "Do sau chuyen de qua gioi han.")
        current = str(row["parent_id"] or "").strip() or None
    return parent


@router.get("/api/subjects")
def subjects():
    return [dict(r) for r in get_db().q("SELECT * FROM subjects ORDER BY name")]


@router.get("/api/topics")
def topics(subject_id: Optional[str] = None, tree: int = 0, request: Request = None):
    from auth import is_staff, optional_session
    me = optional_session(request) if request is not None else None
    staff = is_staff(me)
    lesson_filter = "" if staff else " AND COALESCE(l.status,'published')='published'"
    base = f"""SELECT t.*,
                  (SELECT COUNT(*) FROM lessons l WHERE l.topic_id=t.id{lesson_filter}) lesson_count,
                  (SELECT COUNT(*) FROM lessons l WHERE l.topic_id=t.id{lesson_filter} AND COALESCE(l.required,1)=1) required_count
               FROM topics t"""
    if subject_id:
        rows = [dict(r) for r in get_db().q(base + " WHERE t.subject_id=? ORDER BY position, name", (subject_id,))]
    else:
        rows = [dict(r) for r in get_db().q(base + " ORDER BY subject_id, position, name")]
    if not staff:
        published = {str(r["id"]): r for r in rows if (r.get("status") or "published") == "published"}
        visible = []
        for row in rows:
            if (row.get("status") or "published") != "published":
                continue
            parent = str(row.get("parent_id") or "").strip()
            seen = set()
            while parent:
                if parent in seen or parent not in published:
                    break
                seen.add(parent)
                parent = str(published[parent].get("parent_id") or "").strip()
            if not parent:
                visible.append(row)
        rows = visible
    if not tree:
        return rows
    by_id = {}
    for r in rows:
        r["children"] = []
        by_id[r["id"]] = r
    out = []
    for r in rows:
        pid = r.get("parent_id")
        if pid and pid in by_id and pid != r["id"]:
            by_id[pid]["children"].append(by_id[r["id"]])
        else:
            out.append(by_id[r["id"]])
    return out


@router.post("/api/topics")
def create_topic(payload: TopicIn, request: Request):
    require_perm(request, "bank.manage")
    if not payload.name.strip():
        raise HTTPException(400, "Thieu ten chuyen de")
    if not get_db().q1("SELECT 1 FROM subjects WHERE id=?", (payload.subject_id,)):
        raise HTTPException(400, "Mon khong ton tai")
    import uuid
    tid = (payload.id or "").strip() or f"t-{uuid.uuid4().hex[:8]}"
    if get_db().q1("SELECT 1 FROM topics WHERE id=?", (tid,)):
        raise HTTPException(400, "Ma chuyen de da ton tai")
    parent = validate_topic_parent(payload.parent_id, tid, payload.subject_id)
    status = payload.status if payload.status is not None else "published"
    if status not in TOPIC_STATUSES:
        raise HTTPException(400, "Trang thai khong hop le.")
    pos = int(payload.position or 0)
    if pos <= 0:
        pos = (get_db().q1("SELECT COALESCE(MAX(position),0)+1 p FROM topics WHERE subject_id=?", (payload.subject_id,)) or {"p": 1})["p"]
    get_db().exec("INSERT INTO topics (id, subject_id, name, grade, description, parent_id, position, status) VALUES (?,?,?,?,?,?,?,?)",
            (tid, payload.subject_id, payload.name.strip()[:200], int(payload.grade or 12),
             (payload.description or "")[:1000], parent, pos, status))
    return {"id": tid}


@router.put("/api/topics/{tid}")
def update_topic(tid: str, payload: TopicUpdateIn, request: Request):
    require_perm(request, "bank.manage")
    t = get_db().q1("SELECT * FROM topics WHERE id=?", (tid,))
    if not t:
        raise HTTPException(404, "Khong tim thay chuyen de")
    name = (payload.name or t["name"]).strip()[:200] or t["name"]
    desc = payload.description if payload.description is not None else (t["description"] or "")
    grade = payload.grade if payload.grade is not None else t["grade"]
    parent_fields = getattr(payload, "model_fields_set", None)
    if parent_fields is None:
        parent_fields = getattr(payload, "__fields_set__", set())
    parent = payload.parent_id if "parent_id" in parent_fields else t["parent_id"] if "parent_id" in t.keys() else None
    parent = validate_topic_parent(parent, tid, t["subject_id"])
    status = payload.status if payload.status is not None else (t["status"] if "status" in t.keys() and t["status"] else "published")
    if status not in TOPIC_STATUSES:
        raise HTTPException(400, "Trang thai khong hop le.")
    pos = int(payload.position) if payload.position is not None else int(t["position"] or 0) if "position" in t.keys() else 0
    if pos <= 0:
        pos = int(t["position"] or 0) if "position" in t.keys() else 0
    get_db().exec("UPDATE topics SET name=?, description=?, grade=?, parent_id=?, position=?, status=? WHERE id=?",
                  (name, desc[:1000], int(grade or 12), parent, pos, status, tid))
    return {"ok": True}


@router.delete("/api/topics/{tid}")
def delete_topic(tid: str, request: Request):
    require_perm(request, "bank.manage")
    db = get_db()
    if not db.q1("SELECT 1 FROM topics WHERE id=?", (tid,)):
        raise HTTPException(404, "Khong tim thay chuyen de")
    lesson_ids = [r["id"] for r in db.q("SELECT id FROM lessons WHERE topic_id=?", (tid,))]
    for lid in lesson_ids:
        db.exec("DELETE FROM lesson_completions WHERE lesson_id=?", (lid,))
        db.exec("DELETE FROM lesson_blocks WHERE lesson_id=?", (lid,))
    db.exec("DELETE FROM lessons WHERE topic_id=?", (tid,))
    db.exec("UPDATE topics SET parent_id=NULL WHERE parent_id=?", (tid,))
    db.exec("DELETE FROM topics WHERE id=?", (tid,))
    return {"ok": True}


@router.get("/api/questions")
def list_questions(subject_id: Optional[str] = None, topic_id: Optional[str] = None,
                    grade: Optional[str] = None, difficulty: Optional[str] = None,
                    qtype: Optional[str] = None, search: Optional[str] = None,
                    tag: Optional[str] = None, code: Optional[str] = None, limit: int = 200,
                    request: Request = None):
    require_perm(request, "bank.manage")
    sql = "SELECT * FROM questions WHERE 1=1"
    params = []
    if subject_id: sql += " AND subject_id=?"; params.append(subject_id)
    if topic_id: sql += " AND topic_id=?"; params.append(topic_id)
    if grade: sql += " AND grade=?"; params.append(int(grade))
    if difficulty: sql += " AND difficulty=?"; params.append(difficulty)
    if qtype: sql += " AND qtype=?"; params.append(qtype)
    if search: sql += " AND content LIKE ?"; params.append(f"%{search}%")
    if code: sql += " AND code LIKE ?"; params.append(f"%{code}%")
    if tag: sql += " AND tags LIKE ?"; params.append(f"%{tag}%")
    sql += " ORDER BY id DESC LIMIT ?"
    params.append(max(1, min(limit, 500)))
    return [row_to_q(r, True) for r in get_db().q(sql, tuple(params))]


@router.get("/api/questions/{qid}")
def get_question(qid: int, request: Request):
    require_perm(request, "bank.manage")
    r = get_db().q1("SELECT * FROM questions WHERE id=?", (qid,))
    if not r:
        raise HTTPException(404, "Khong tim thay cau hoi")
    return row_to_q(r, True)


def _insert_question(payload: QuestionIn, source: str):
    now = datetime.now().isoformat(timespec="seconds")
    code = (payload.code or "").strip()[:64]
    tags = json.dumps(payload.tags or [], ensure_ascii=False)
    cur = get_db().exec(
        "INSERT INTO questions (subject_id, topic_id, grade, difficulty, qtype, content, options, correct_answer, explanation, score, source, image_url, code, tags, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        (payload.subject_id, payload.topic_id, payload.grade, payload.difficulty, payload.qtype,
         payload.content.strip(), json.dumps(payload.options or [], ensure_ascii=False),
         (payload.correct_answer or "").strip(), payload.explanation or "", payload.score, source,
         (payload.image_url or "").strip()[:2000], code, tags, now))
    qid = cur.lastrowid
    if not code:
        code = f"Q{qid}"
        get_db().exec("UPDATE questions SET code=? WHERE id=?", (code, qid))
    return qid, code


@router.post("/api/questions")
def create_question(payload: QuestionIn, request: Request):
    require_perm(request, "bank.manage")
    if payload.subject_id and not get_db().q1("SELECT 1 FROM subjects WHERE id=?", (payload.subject_id,)):
        raise HTTPException(400, "Mon khong ton tai")
    qid, code = _insert_question(payload, "thu cong")
    return {"id": qid, "code": code}


@router.post("/api/questions/{qid}/duplicate")
def duplicate_question(qid: int, request: Request):
    require_perm(request, "bank.manage")
    r = get_db().q1("SELECT * FROM questions WHERE id=?", (qid,))
    if not r:
        raise HTTPException(404, "Khong tim thay cau hoi")
    payload = QuestionIn(
        subject_id=r["subject_id"], topic_id=r["topic_id"], grade=r["grade"],
        difficulty=r["difficulty"], qtype=r["qtype"], content=r["content"],
        options=json.loads(r["options"] or "[]") if r["options"] else [],
        correct_answer=r["correct_answer"] or "", explanation=r["explanation"] or "",
        score=r["score"] or 1, image_url=r["image_url"] or "",
        code="", tags=json.loads(r["tags"] or "[]") if r["tags"] else [],
    )
    new_id, code = _insert_question(payload, "nhan ban")
    return {"id": new_id, "code": code}


@router.post("/api/questions/bulk")
def bulk(payload: BulkIn, request: Request):
    require_perm(request, "bank.manage")
    now = datetime.now().isoformat(timespec="seconds")
    n = 0
    for it in payload.items or []:
        if not (it.get("content") or "").strip() or not it.get("subject_id"):
            continue
        get_db().exec(
            "INSERT INTO questions (subject_id, topic_id, grade, difficulty, qtype, content, options, correct_answer, explanation, score, source, image_url, code, tags, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
            (it.get("subject_id"), it.get("topic_id"), int(it.get("grade") or 12),
             it.get("difficulty") or "van dung", it.get("qtype") or "trac_nghiem",
             it.get("content", "").strip(), json.dumps(it.get("options") or [], ensure_ascii=False),
             (it.get("correct_answer") or "").strip(), it.get("explanation") or "", float(it.get("score") or 1), "nhap de",
             (it.get("image_url") or "").strip()[:2000] if isinstance(it.get("image_url"), str) else "",
             (it.get("code") or "").strip()[:64],
             json.dumps(it.get("tags") or [], ensure_ascii=False), now))
        n += 1
    return {"inserted": n}


@router.put("/api/questions/{qid}")
def update_question(qid: int, payload: QuestionIn, request: Request):
    require_perm(request, "bank.manage")
    r = get_db().q1("SELECT * FROM questions WHERE id=?", (qid,))
    if not r: raise HTTPException(404, "Khong tim thay cau hoi")
    get_db().exec("UPDATE questions SET subject_id=?, topic_id=?, grade=?, difficulty=?, qtype=?, content=?, options=?, correct_answer=?, explanation=?, score=?, image_url=?, code=?, tags=? WHERE id=?",
            (payload.subject_id, payload.topic_id, payload.grade, payload.difficulty, payload.qtype,
             payload.content.strip(), json.dumps(payload.options or [], ensure_ascii=False),
             (payload.correct_answer or "").strip(), payload.explanation or "", payload.score,
             (payload.image_url or "").strip()[:2000],
             (payload.code or r["code"] or "").strip()[:64],
             json.dumps(payload.tags or [], ensure_ascii=False), qid))
    return {"ok": True}


@router.delete("/api/questions/{qid}")
def delete_question(qid: int, request: Request):
    require_perm(request, "bank.manage")
    get_db().exec("DELETE FROM questions WHERE id=?", (qid,))
    return {"ok": True}


@router.post("/api/import/preview-text")
def preview_text(payload: PreviewIn):
    return {"text": payload.text, "drafts": parse_text_to_drafts(payload.text)}


# ---------------- MATERIALS (thư viện học liệu) ----------------
@router.get("/api/materials")
def list_materials(subject_id: Optional[str] = None, topic_id: Optional[str] = None):
    sql = "SELECT * FROM materials WHERE 1=1"
    params = []
    if subject_id: sql += " AND subject_id=?"; params.append(subject_id)
    if topic_id: sql += " AND topic_id=?"; params.append(topic_id)
    sql += " ORDER BY id DESC LIMIT 200"
    return [dict(r) for r in get_db().q(sql, tuple(params))]


@router.post("/api/materials")
def create_material(payload: MaterialIn, request: Request):
    me = require_perm(request, "materials.write")
    if not (payload.title or "").strip():
        raise HTTPException(400, "Thieu ten tai lieu")
    now = datetime.now().isoformat(timespec="seconds")
    cur = get_db().exec(
        "INSERT INTO materials (subject_id, topic_id, title, description, file_url, file_type, grade, created_by, created_at) VALUES (?,?,?,?,?,?,?,?,?)",
        ((payload.subject_id or "").strip() or None, (payload.topic_id or "").strip() or None,
         payload.title.strip()[:255], (payload.description or "")[:2000],
         (payload.file_url or "").strip()[:2000], (payload.file_type or "").strip()[:32],
         int(payload.grade or 12), me["id"], now))
    return {"id": cur.lastrowid}


@router.delete("/api/materials/{mid}")
def delete_material(mid: int, request: Request):
    require_perm(request, "materials.write")
    get_db().exec("DELETE FROM materials WHERE id=?", (mid,))
    return {"ok": True}


@router.post("/api/import/upload")
async def upload(file: UploadFile = File(...), request: Request = None):
    if request is not None:
        require_perm(request, "import.manage")
    data = await file.read()
    if len(data) > 15 * 1024 * 1024:
        raise HTTPException(400, "File qua lon (>15MB)")
    try:
        text = extract_file_text(file.filename or "", data)
    except ValueError as e:
        raise HTTPException(400, str(e))
    except Exception as e:
        raise HTTPException(400, f"Khong doc duoc file: {e}")
    return {"filename": file.filename, "text": text[:50000], "drafts": parse_text_to_drafts(text)}
