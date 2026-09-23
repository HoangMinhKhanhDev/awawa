import json
import secrets
import string
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Request

from auth import optional_session, require_teacher
from deps import get_db
from models import AssignmentCreateIn, AssignmentSubmitIn, ClassCreateIn, ClassJoinIn, GradeIn

router = APIRouter()


def my_class_ids(user_id):
    return [r["class_id"] for r in get_db().q("SELECT class_id FROM class_members WHERE user_id=?", (user_id,))]


def me_or_401(request: Request) -> dict:
    me = optional_session(request)
    if not me:
        from fastapi import HTTPException
        raise HTTPException(401, "Chua dang nhap.")
    return me


def is_teacher(me) -> bool:
    return bool(me and (me.get("role") or "student") == "teacher")


# ---------------- CLASSES ----------------
@router.get("/api/classes")
def list_classes(request: Request):
    me = me_or_401(request)
    db = get_db()
    if is_teacher(me):
        return [dict(r) for r in db.q("SELECT * FROM classes ORDER BY name")]
    ids = my_class_ids(me["id"])
    if not ids:
        return []
    qmarks = ",".join("?" * len(ids))
    return [dict(r) for r in db.q(f"SELECT * FROM classes WHERE id IN ({qmarks}) ORDER BY name", tuple(ids))]


@router.post("/api/classes")
def create_class(payload: ClassCreateIn, request: Request):
    db = get_db()
    require_teacher(request)
    name = (payload.name or "").strip()[:120]
    if not name:
        from fastapi import HTTPException
        raise HTTPException(400, "Thieu ten lop.")
    code = (payload.join_code or "").strip()[:16]
    if not code:
        code = "".join(secrets.choice(string.ascii_uppercase + string.digits) for _ in range(8))
    if db.q1("SELECT 1 FROM classes WHERE join_code=?", (code,)):
        from fastapi import HTTPException
        raise HTTPException(400, "Ma lop da ton tai.")
    now = datetime.now().isoformat(timespec="seconds")
    cur = db.exec("INSERT INTO classes (name, join_code, created_at) VALUES (?,?,?)", (name, code, now))
    return {"id": cur.lastrowid, "name": name, "join_code": code}


@router.post("/api/classes/join")
def join_class(payload: ClassJoinIn, request: Request):
    me = me_or_401(request)
    from fastapi import HTTPException
    if is_teacher(me):
        raise HTTPException(400, "Giao vien khong can vao lop bang ma.")
    code = (payload.join_code or "").strip()
    if not code:
        raise HTTPException(400, "Thieu ma lop.")
    cl = get_db().q1("SELECT * FROM classes WHERE join_code=?", (code,))
    if not cl:
        raise HTTPException(404, "Ma lop khong dung.")
    now = datetime.now().isoformat(timespec="seconds")
    get_db().exec("INSERT OR IGNORE INTO class_members (class_id, user_id, joined_at) VALUES (?,?,?)",
                  (cl["id"], me["id"], now))
    return {"class": dict(cl)}


@router.get("/api/classes/{cid}/members")
def class_members(cid: int, request: Request):
    require_teacher(request)
    rows = get_db().q(
        "SELECT s.id, s.name, s.class_name, s.role, cm.joined_at FROM class_members cm JOIN students s ON s.id=cm.user_id WHERE cm.class_id=? ORDER BY s.name",
        (cid,))
    out = []
    for r in rows:
        d = dict(r)
        d.pop("password_hash", None)
        out.append(d)
    return out


# ---------------- ASSIGNMENTS ----------------
@router.get("/api/assignments")
def list_assignments(request: Request, class_id: Optional[int] = None):
    me = me_or_401(request)
    db = get_db()
    if is_teacher(me):
        if class_id:
            return [dict(r) for r in db.q(
                "SELECT a.*, c.name class_name, t.name topic_name FROM assignments a JOIN classes c ON c.id=a.class_id LEFT JOIN topics t ON t.id=a.topic_id WHERE a.class_id=? ORDER BY a.created_at DESC",
                (class_id,))]
        return [dict(r) for r in db.q(
            "SELECT a.*, c.name class_name, t.name topic_name FROM assignments a JOIN classes c ON c.id=a.class_id LEFT JOIN topics t ON t.id=a.topic_id ORDER BY a.created_at DESC")]
    ids = my_class_ids(me["id"])
    if not ids:
        return []
    qmarks = ",".join("?" * len(ids))
    rows = db.q(
        f"SELECT a.*, c.name class_name, t.name topic_name FROM assignments a JOIN classes c ON c.id=a.class_id LEFT JOIN topics t ON t.id=a.topic_id WHERE a.class_id IN ({qmarks}) ORDER BY a.created_at DESC",
        tuple(ids))
    out = []
    for r in rows:
        d = dict(r)
        sub = db.q1("SELECT id, score, feedback, submitted_at FROM submissions WHERE assignment_id=? AND student_id=?",
                    (d["id"], me["id"]))
        d["my_submission"] = dict(sub) if sub else None
        if not sub:
            d["status"] = "todo"
        elif sub["score"] is not None:
            d["status"] = "graded"
        else:
            d["status"] = "submitted"
        out.append(d)
    return out


@router.post("/api/assignments")
def create_assignment(payload: AssignmentCreateIn, request: Request):
    db = get_db()
    require_teacher(request)
    title = (payload.title or "").strip()[:255]
    if not title:
        from fastapi import HTTPException
        raise HTTPException(400, "Thieu ten bai tap.")
    if not payload.class_id or not db.q1("SELECT 1 FROM classes WHERE id=?", (payload.class_id,)):
        from fastapi import HTTPException
        raise HTTPException(400, "Thieu lop.")
    topic = (payload.topic_id or "").strip() or None
    deadline = (payload.deadline or "").strip() or None
    now = datetime.now().isoformat(timespec="seconds")
    me = optional_session(request)
    cur = db.exec(
        "INSERT INTO assignments (class_id, topic_id, title, description, deadline, created_by, created_at) VALUES (?,?,?,?,?,?,?)",
        (payload.class_id, topic, title, (payload.description or "")[:2000], deadline, me["id"] if me else None, now))
    aid = cur.lastrowid
    n = 0
    for i, q in enumerate(payload.questions or []):
        content = (q or "").strip() if isinstance(q, str) else str((q or {}).get("content", "")).strip()
        if not content:
            continue
        ans = "" if isinstance(q, str) else str((q or {}).get("answer", "")).strip()
        db.exec("INSERT INTO assign_questions (assignment_id, idx, content, answer) VALUES (?,?,?,?)",
                (aid, i + 1, content[:4000], ans[:4000]))
        n += 1
    if n == 0:
        from fastapi import HTTPException
        raise HTTPException(400, "Can it nhat 1 cau hoi.")
    return {"id": aid, "questions": n}


@router.get("/api/assignments/{aid}")
def get_assignment(aid: int, request: Request):
    from fastapi import HTTPException
    me = me_or_401(request)
    db = get_db()
    a = db.q1(
        "SELECT a.*, c.name class_name, t.name topic_name FROM assignments a JOIN classes c ON c.id=a.class_id LEFT JOIN topics t ON t.id=a.topic_id WHERE a.id=?",
        (aid,))
    if not a:
        raise HTTPException(404, "Khong tim thay bai tap.")
    d = dict(a)
    teacher = is_teacher(me)
    if not teacher and aid and int(a["class_id"]) not in my_class_ids(me["id"]):
        raise HTTPException(403, "Ban khong o lop nay.")
    cols = "id, idx, content, answer" if teacher else "id, idx, content"
    d["questions"] = [dict(r) for r in db.q(
        f"SELECT {cols} FROM assign_questions WHERE assignment_id=? ORDER BY idx", (aid,))]
    if not teacher:
        sub = db.q1("SELECT id, answer, score, feedback, submitted_at, graded_at FROM submissions WHERE assignment_id=? AND student_id=?",
                    (aid, me["id"]))
        d["my_submission"] = dict(sub) if sub else None
    return d


@router.post("/api/assignments/{aid}/submit")
def submit_assignment(aid: int, payload: AssignmentSubmitIn, request: Request):
    from fastapi import HTTPException
    me = me_or_401(request)
    db = get_db()
    if is_teacher(me):
        raise HTTPException(400, "Giao vien khong nop bai.")
    a = db.q1("SELECT * FROM assignments WHERE id=?", (aid,))
    if not a:
        raise HTTPException(404, "Khong tim thay bai tap.")
    if int(a["class_id"]) not in my_class_ids(me["id"]):
        raise HTTPException(403, "Ban khong o lop nay.")
    existing = db.q1("SELECT id, score FROM submissions WHERE assignment_id=? AND student_id=?", (aid, me["id"]))
    if existing and existing["score"] is not None:
        raise HTTPException(400, "Bai da cham, khong the nop lai.")
    m = {}
    for x in payload.answers or []:
        if not isinstance(x, dict):
            continue
        idx = int(x.get("idx") or 0)
        if idx > 0:
            m[idx] = str(x.get("text") or "")[:4000]
    blob = json.dumps(m, ensure_ascii=False)
    now = datetime.now().isoformat(timespec="seconds")
    if existing:
        db.exec("UPDATE submissions SET answer=?, submitted_at=? WHERE id=?", (blob, now, existing["id"]))
        sid = existing["id"]
    else:
        cur = db.exec("INSERT INTO submissions (assignment_id, student_id, answer, submitted_at) VALUES (?,?,?,?)",
                      (aid, me["id"], blob, now))
        sid = cur.lastrowid
    return {"id": sid, "status": "submitted"}


@router.get("/api/assignments/{aid}/submissions")
def list_submissions(aid: int, request: Request):
    from fastapi import HTTPException
    require_teacher(request)
    db = get_db()
    a = db.q1("SELECT * FROM assignments WHERE id=?", (aid,))
    if not a:
        raise HTTPException(404, "Khong tim thay bai tap.")
    rows = db.q(
        """SELECT s.id sid, s.name, s.class_name, sub.id sub_id, sub.answer, sub.score, sub.feedback,
                  sub.submitted_at, sub.graded_at
           FROM class_members cm JOIN students s ON s.id=cm.user_id
           LEFT JOIN submissions sub ON sub.assignment_id=? AND sub.student_id=s.id
           WHERE cm.class_id=? ORDER BY s.name""",
        (aid, a["class_id"]))
    qs = [dict(r) for r in db.q("SELECT idx, content, answer FROM assign_questions WHERE assignment_id=? ORDER BY idx", (aid,))]
    out = []
    for r in rows:
        ans = json.loads(r["answer"]) if r["answer"] else None
        if r["sub_id"] is None:
            status = "todo"
        elif r["score"] is not None:
            status = "graded"
        else:
            status = "submitted"
        out.append({
            "submission_id": r["sub_id"], "student_id": r["sid"], "name": r["name"],
            "class_name": r["class_name"], "score": r["score"], "feedback": r["feedback"],
            "submitted_at": r["submitted_at"], "graded_at": r["graded_at"],
            "status": status, "answers": ans,
        })
    return {"assignment": dict(a), "questions": qs, "submissions": out}


@router.put("/api/submissions/{sid}/grade")
def grade_submission(sid: int, payload: GradeIn, request: Request):
    from fastapi import HTTPException
    require_teacher(request)
    db = get_db()
    sub = db.q1("SELECT * FROM submissions WHERE id=?", (sid,))
    if not sub:
        raise HTTPException(404, "Khong tim thay bai nop.")
    score = max(0.0, min(10.0, float(payload.score)))
    now = datetime.now().isoformat(timespec="seconds")
    db.exec("UPDATE submissions SET score=?, feedback=?, graded_at=? WHERE id=?",
            (score, (payload.feedback or "")[:1000], now, sid))
    return {"ok": True, "score": score}


# ---------------- ME: RESULTS + PROGRESS ----------------
@router.get("/api/me/results")
def me_results(request: Request):
    from fastapi import HTTPException
    me = me_or_401(request)
    if is_teacher(me):
        raise HTTPException(400, "Endpoint cua hoc sinh.")
    db = get_db()
    rows = db.q(
        """SELECT sub.id, sub.score, sub.feedback, sub.submitted_at, sub.graded_at, sub.answer,
                  a.id aid, a.title, a.deadline, a.topic_id, t.name topic_name
           FROM submissions sub
           JOIN assignments a ON a.id=sub.assignment_id
           LEFT JOIN topics t ON t.id=a.topic_id
           WHERE sub.student_id=? ORDER BY sub.submitted_at DESC LIMIT 100""",
        (me["id"],))
    results = [dict(r) for r in rows]
    ids = my_class_ids(me["id"])
    assigned = 0
    if ids:
        qmarks = ",".join("?" * len(ids))
        assigned = db.q1(f"SELECT COUNT(*) c FROM assignments WHERE class_id IN ({qmarks})", tuple(ids))["c"]
    return {"results": results, "assigned_total": assigned}


@router.get("/api/me/progress")
def me_progress(request: Request):
    from fastapi import HTTPException
    me = me_or_401(request)
    if is_teacher(me):
        raise HTTPException(400, "Endpoint cua hoc sinh.")
    db = get_db()
    ids = my_class_ids(me["id"])
    assigned = 0
    if ids:
        qmarks = ",".join("?" * len(ids))
        assigned = db.q1(f"SELECT COUNT(*) c FROM assignments WHERE class_id IN ({qmarks})", tuple(ids))["c"]
    subs = db.q(
        """SELECT sub.score, t.name topic_name FROM submissions sub
           JOIN assignments a ON a.id=sub.assignment_id
           LEFT JOIN topics t ON t.id=a.topic_id
           WHERE sub.student_id=?""",
        (me["id"],))
    completed = len(subs)
    graded = 0
    total = 0.0
    topic_sum = {}
    for s in subs:
        if s["score"] is not None:
            graded += 1
            total += float(s["score"])
            tn = s["topic_name"] or "Chung"
            if tn not in topic_sum:
                topic_sum[tn] = {"topic": tn, "sum": 0.0, "n": 0}
            topic_sum[tn]["sum"] += float(s["score"])
            topic_sum[tn]["n"] += 1
    by_topic = [{"topic": t["topic"], "avg": round(t["sum"] / t["n"], 1), "n": t["n"]}
                for t in topic_sum.values()]
    by_topic.sort(key=lambda x: -x["avg"])
    latest = db.q1("SELECT score FROM submissions WHERE student_id=? AND score IS NOT NULL ORDER BY graded_at DESC LIMIT 1",
                   (me["id"],))
    return {
        "assigned": assigned,
        "completed": completed,
        "ratio": round(completed / assigned, 3) if assigned else 0,
        "avg_score": round(total / graded, 1) if graded else None,
        "latest_score": latest["score"] if latest else None,
        "by_topic": by_topic,
    }


# ---------------- TEACHER HOME OVERVIEW ----------------
@router.get("/api/stats/class-overview")
def class_overview(request: Request):
    require_teacher(request)
    db = get_db()
    students = db.q1("SELECT COUNT(*) c FROM students WHERE COALESCE(role,'student')<>'teacher'")["c"]
    active = db.q1("SELECT COUNT(*) c FROM assignments WHERE deadline IS NULL OR deadline >= date('now')")["c"]
    ungraded = db.q1("SELECT COUNT(*) c FROM submissions WHERE score IS NULL")["c"]
    return {"students": students, "active_assignments": active, "ungraded": ungraded}
