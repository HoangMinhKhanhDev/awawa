import json
import secrets
import string
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Request

from auth import optional_session, require_teacher
from deps import get_db
from models import (AssignmentCreateIn, AssignmentSubmitIn, ClassCreateIn,
                    ClassJoinIn, CompleteIn, GradeIn, LessonCreateIn)

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
    return bool(me and (me.get("role") or "student") in ("teacher", "admin"))


def sub_status(sub) -> str:
    if not sub:
        return "todo"
    if sub["score"] is not None:
        return "graded"
    if sub["submitted_at"]:
        return "submitted"
    return "draft"


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
        d["status"] = sub_status(sub)
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
        pts = 1.0 if isinstance(q, str) else float((q or {}).get("points") or 1)
        if pts <= 0:
            pts = 1.0
        db.exec("INSERT INTO assign_questions (assignment_id, idx, content, answer, points) VALUES (?,?,?,?,?)",
                (aid, i + 1, content[:4000], ans[:4000], pts))
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
    cols = "id, idx, content, points, answer" if teacher else "id, idx, content, points"
    d["questions"] = [dict(r) for r in db.q(
        f"SELECT {cols} FROM assign_questions WHERE assignment_id=? ORDER BY idx", (aid,))]
    if not teacher:
        sub = db.q1("SELECT id, answer, score, feedback, submitted_at, graded_at, question_scores FROM submissions WHERE assignment_id=? AND student_id=?",
                    (aid, me["id"]))
        d["my_submission"] = dict(sub) if sub else None
        d["status"] = sub_status(sub)
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
        db.exec("UPDATE submissions SET answer=?, submitted_at=?, question_scores=NULL, score=NULL, feedback=NULL, graded_at=NULL WHERE id=?",
                (blob, now, existing["id"]))
        sid = existing["id"]
    else:
        cur = db.exec("INSERT INTO submissions (assignment_id, student_id, answer, submitted_at) VALUES (?,?,?,?)",
                      (aid, me["id"], blob, now))
        sid = cur.lastrowid
    return {"id": sid, "status": "submitted"}


@router.post("/api/assignments/{aid}/draft")
def draft_assignment(aid: int, payload: AssignmentSubmitIn, request: Request):
    from fastapi import HTTPException
    me = me_or_401(request)
    db = get_db()
    if is_teacher(me):
        raise HTTPException(400, "Giao vien khong lam bai.")
    a = db.q1("SELECT * FROM assignments WHERE id=?", (aid,))
    if not a:
        raise HTTPException(404, "Khong tim thay bai tap.")
    if int(a["class_id"]) not in my_class_ids(me["id"]):
        raise HTTPException(403, "Ban khong o lop nay.")
    existing = db.q1("SELECT id, score FROM submissions WHERE assignment_id=? AND student_id=?", (aid, me["id"]))
    if existing and existing["score"] is not None:
        raise HTTPException(400, "Bai da cham, khong sua duoc.")
    m = {}
    for x in payload.answers or []:
        if not isinstance(x, dict):
            continue
        idx = int(x.get("idx") or 0)
        if idx > 0:
            m[idx] = str(x.get("text") or "")[:4000]
    blob = json.dumps(m, ensure_ascii=False)
    if existing:
        db.exec("UPDATE submissions SET answer=? WHERE id=?", (blob, existing["id"]))
        sid = existing["id"]
    else:
        cur = db.exec("INSERT INTO submissions (assignment_id, student_id, answer, submitted_at) VALUES (?,?,?,NULL)",
                      (aid, me["id"], blob))
        sid = cur.lastrowid
    return {"id": sid, "status": "draft"}


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
                  sub.submitted_at, sub.graded_at, sub.question_scores
           FROM class_members cm JOIN students s ON s.id=cm.user_id
           LEFT JOIN submissions sub ON sub.assignment_id=? AND sub.student_id=s.id
           WHERE cm.class_id=? ORDER BY s.name""",
        (aid, a["class_id"]))
    qs = [dict(r) for r in db.q("SELECT idx, content, answer, points FROM assign_questions WHERE assignment_id=? ORDER BY idx", (aid,))]
    out = []
    for r in rows:
        ans = json.loads(r["answer"]) if r["answer"] else None
        qscores = json.loads(r["question_scores"]) if r["question_scores"] else None
        if r["sub_id"] is None:
            status = "todo"
        elif r["score"] is not None:
            status = "graded"
        elif r["submitted_at"]:
            status = "submitted"
        else:
            status = "draft"
        out.append({
            "submission_id": r["sub_id"], "student_id": r["sid"], "name": r["name"],
            "class_name": r["class_name"], "score": r["score"], "feedback": r["feedback"],
            "submitted_at": r["submitted_at"], "graded_at": r["graded_at"],
            "question_scores": qscores,
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
    qs_json = json.dumps(payload.question_scores, ensure_ascii=False) if payload.question_scores is not None else None
    db.exec("UPDATE submissions SET score=?, feedback=?, question_scores=?, graded_at=? WHERE id=?",
            (score, (payload.feedback or "")[:1000], qs_json, now, sid))
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
           WHERE sub.student_id=? ORDER BY COALESCE(sub.submitted_at, sub.graded_at, sub.id) DESC LIMIT 100""",
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
        """SELECT sub.score, sub.submitted_at, t.name topic_name FROM submissions sub
           JOIN assignments a ON a.id=sub.assignment_id
           LEFT JOIN topics t ON t.id=a.topic_id
           WHERE sub.student_id=?""",
        (me["id"],))
    completed = sum(1 for s in subs if s["submitted_at"])
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
    latest_title = None
    if latest:
        lt = db.q1("SELECT a.title FROM submissions sub JOIN assignments a ON a.id=sub.assignment_id WHERE sub.student_id=? AND sub.score IS NOT NULL ORDER BY sub.graded_at DESC LIMIT 1",
                   (me["id"],))
        latest_title = lt["title"] if lt else None

    lessons_total = db.q1("SELECT COUNT(*) c FROM lessons")["c"]
    lessons_done = db.q1("SELECT COUNT(*) c FROM lesson_completions WHERE student_id=?", (me["id"]))["c"]
    topic_rows = db.q(
        """SELECT t.id, t.name,
                  (SELECT COUNT(*) FROM lessons l WHERE l.topic_id=t.id) lt,
                  (SELECT COUNT(*) FROM lessons l JOIN lesson_completions lc ON lc.lesson_id=l.id AND lc.student_id=? WHERE l.topic_id=t.id) ld
           FROM topics t
           WHERE (SELECT COUNT(*) FROM lessons l2 WHERE l2.topic_id=t.id) > 0""",
        (me["id"], me["id"]))
    topics_done = 0
    topics_total = 0
    current_topic = None
    for t in topic_rows:
        topics_total += 1
        if int(t["lt"]) == int(t["ld"]):
            topics_done += 1
        elif current_topic is None and int(t["ld"]) < int(t["lt"]):
            current_topic = {"id": t["id"], "name": t["name"], "done": int(t["ld"]), "total": int(t["lt"])}
    lesson_ratio = round(lessons_done / lessons_total, 3) if lessons_total else 0
    assign_ratio = round(completed / assigned, 3) if assigned else 0
    overall = round(0.5 * lesson_ratio + 0.5 * assign_ratio, 3) if lessons_total else assign_ratio
    return {
        "assigned": assigned,
        "completed": completed,
        "ratio": assign_ratio,
        "overall_ratio": overall,
        "avg_score": round(total / graded, 1) if graded else None,
        "latest_score": latest["score"] if latest else None,
        "latest_title": latest_title,
        "by_topic": by_topic,
        "lessons_total": lessons_total,
        "lessons_done": lessons_done,
        "lessons_ratio": lesson_ratio,
        "topics_done": topics_done,
        "topics_total": topics_total,
        "current_topic": current_topic,
    }


# ---------------- LESSONS ----------------
@router.get("/api/lessons")
def list_lessons(request: Request, topic_id: str = ""):
    from fastapi import HTTPException
    me = me_or_401(request)
    if not topic_id:
        raise HTTPException(400, "Thieu topic_id.")
    rows = get_db().q(
        """SELECT l.id, l.topic_id, l.title, l.content, l.idx, t.name topic_name,
                  (SELECT 1 FROM lesson_completions lc WHERE lc.lesson_id=l.id AND lc.student_id=?) completed
           FROM lessons l JOIN topics t ON t.id=l.topic_id WHERE l.topic_id=? ORDER BY l.idx""",
        (me["id"], topic_id))
    out = []
    for r in rows:
        d = dict(r)
        d["completed"] = bool(d["completed"])
        out.append(d)
    return out


@router.post("/api/lessons")
def create_lesson(payload: LessonCreateIn, request: Request):
    from fastapi import HTTPException
    require_teacher(request)
    db = get_db()
    topic_id = (payload.topic_id or "").strip()
    title = (payload.title or "").strip()[:255]
    if not topic_id or not title:
        raise HTTPException(400, "Thieu chu de hoac tieu de.")
    if not db.q1("SELECT 1 FROM topics WHERE id=?", (topic_id,)):
        raise HTTPException(400, "Chuyen de khong ton tai.")
    cur = db.exec("INSERT INTO lessons (topic_id, title, content, idx) VALUES (?,?,?,?)",
                  (topic_id, title, payload.content or "", max(1, payload.idx)))
    return {"id": cur.lastrowid}


@router.post("/api/lessons/{lid}/complete")
def complete_lesson(lid: int, payload: CompleteIn, request: Request):
    from fastapi import HTTPException
    me = me_or_401(request)
    if is_teacher(me):
        raise HTTPException(400, "Giao vien khong danh dau bai hoc.")
    db = get_db()
    if not db.q1("SELECT 1 FROM lessons WHERE id=?", (lid,)):
        raise HTTPException(404, "Khong tim thay bai hoc.")
    if payload.undo:
        db.exec("DELETE FROM lesson_completions WHERE student_id=? AND lesson_id=?", (me["id"], lid))
        return {"completed": False}
    now = datetime.now().isoformat(timespec="seconds")
    db.exec("INSERT OR IGNORE INTO lesson_completions (student_id, lesson_id, completed_at) VALUES (?,?,?)",
            (me["id"], lid, now))
    return {"completed": True}


# ---------------- TEACHER HOME OVERVIEW ----------------
@router.get("/api/stats/class-overview")
def class_overview(request: Request):
    require_teacher(request)
    db = get_db()
    students = db.q1("SELECT COUNT(*) c FROM students WHERE COALESCE(role,'student') NOT IN ('teacher','admin')")["c"]
    active = db.q1("SELECT COUNT(*) c FROM assignments WHERE deadline IS NULL OR deadline >= date('now')")["c"]
    ungraded = db.q1("SELECT COUNT(*) c FROM submissions WHERE score IS NULL AND submitted_at IS NOT NULL")["c"]
    recent = [dict(r) for r in db.q(
        """SELECT a.id, a.title, a.deadline, a.topic_id, c.name class_name, t.name topic_name,
                  (SELECT COUNT(*) FROM class_members cm WHERE cm.class_id=a.class_id) total,
                  (SELECT COUNT(*) FROM submissions s WHERE s.assignment_id=a.id AND s.submitted_at IS NOT NULL) submitted
           FROM assignments a JOIN classes c ON c.id=a.class_id LEFT JOIN topics t ON t.id=a.topic_id
           ORDER BY a.created_at DESC LIMIT 5""")]
    tp = [dict(r) for r in db.q(
        """SELECT t.id tid, t.name tname, a.class_id, COUNT(DISTINCT a.id) an
           FROM topics t JOIN assignments a ON a.topic_id=t.id
           GROUP BY t.id, t.name, a.class_id ORDER BY t.name""")]
    topic_progress = []
    for t in tp:
        members = db.q1("SELECT COUNT(*) c FROM class_members WHERE class_id=?", (t["class_id"],))["c"]
        expected = max(1, int(t["an"]) * int(members))
        done = db.q1(
            """SELECT COUNT(*) c FROM submissions s JOIN assignments a2 ON a2.id=s.assignment_id
               WHERE a2.topic_id=? AND s.submitted_at IS NOT NULL""", (t["tid"],))["c"]
        topic_progress.append({"topic": t["tname"], "pct": min(100, int(round(100 * done / expected)))})
    return {
        "students": students,
        "active_assignments": active,
        "ungraded": ungraded,
        "recent_assignments": recent,
        "topic_progress": topic_progress,
    }
