import json
import secrets
import string
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Request

from auth import optional_session, require_teacher
from deps import get_db
from models import (AssignmentCreateIn, AssignmentSubmitIn, ClassCreateIn,
                    ClassJoinIn, CompleteIn, GradeIn, LessonCreateIn,
                    LessonUpdateIn, NotificationReadIn)

router = APIRouter()


def my_class_ids(user_id):
    return [r["team_id"] for r in get_db().q(
        "SELECT team_id FROM team_members WHERE user_id=? AND member_role='student' AND (left_at IS NULL OR left_at='')",
        (user_id,))]


def resolve_assign_team(me, payload):
    from fastapi import HTTPException
    from auth import is_admin, teacher_coached_team_ids
    tid = int(payload.team_id or 0)
    if not tid:
        tid = int(payload.class_id or 0)
    if not tid:
        if is_admin(me):
            r = get_db().q1("SELECT id FROM teams ORDER BY id")
            tid = int(r["id"]) if r else 0
        else:
            mine = teacher_coached_team_ids(me["id"])
            tid = mine[0] if mine else 0
    if not tid or not get_db().q1("SELECT 1 FROM teams WHERE id=?", (tid,)):
        raise HTTPException(400, "Thieu doi tuyen.")
    if not is_admin(me) and tid not in teacher_coached_team_ids(me["id"]):
        raise HTTPException(403, "Ban khong phu trach doi nay.")
    return tid


def me_or_401(request: Request) -> dict:
    me = optional_session(request)
    if not me:
        from fastapi import HTTPException
        raise HTTPException(401, "Chua dang nhap.")
    return me


def is_teacher(me) -> bool:
    return bool(me and (me.get("role") or "student") in ("teacher", "admin", "super_admin"))


def deadline_passed(deadline) -> bool:
    if not deadline:
        return False
    d = str(deadline).strip()
    if not d:
        return False
    # So sanh den cuoi ngay (23:59:59) neu chi co ngay
    if len(d) == 10:
        d = d + "T23:59:59"
    try:
        dl = datetime.fromisoformat(d.replace("Z", ""))
        return datetime.now() > dl
    except Exception:
        return False


def notify_class(team_id, title, body, link, db):
    now = datetime.now().isoformat(timespec="seconds")
    for r in db.q("SELECT user_id FROM team_members WHERE team_id=? AND member_role='student' AND (left_at IS NULL OR left_at='')", (team_id,)):
        db.exec("INSERT INTO notifications (user_id, title, body, link, created_at) VALUES (?,?,?,?,?)",
                (r["user_id"], title[:255], body[:1000], (link or "")[:500], now))


def sync_submission_answers(sid: int, aid: int, amap: dict):
    db = get_db()
    aqs = db.q("SELECT id, idx, question_id FROM assign_questions WHERE assignment_id=? ORDER BY idx", (aid,))
    if not aqs:
        return
    db.exec("DELETE FROM submission_answers WHERE submission_id=?", (sid,))
    for aq in aqs:
        idx = int(aq["idx"])
        text = amap.get(idx, amap.get(str(idx), ""))
        db.exec("INSERT INTO submission_answers (submission_id, question_id, assign_q_idx, answer) VALUES (?,?,?,?)",
                (sid, aq["question_id"], idx, str(text or "")[:4000]))


def sub_status(sub) -> str:
    if not sub:
        return "todo"
    if sub["score"] is not None:
        return "graded"
    if sub["submitted_at"]:
        return "submitted"
    return "draft"


# ---------------- CLASSES (alias teams — M2) ----------------
@router.get("/api/classes")
def list_classes(request: Request):
    me = me_or_401(request)
    db = get_db()
    if is_teacher(me):
        return [dict(r) for r in db.q("SELECT id, name, join_code, created_at FROM teams ORDER BY name")]
    ids = my_class_ids(me["id"])
    if not ids:
        return []
    qmarks = ",".join("?" * len(ids))
    return [dict(r) for r in db.q(f"SELECT id, name, join_code, created_at FROM teams WHERE id IN ({qmarks}) ORDER BY name", tuple(ids))]


@router.post("/api/classes")
def create_class(payload: ClassCreateIn, request: Request):
    db = get_db()
    me = require_teacher(request)
    name = (payload.name or "").strip()[:120]
    if not name:
        from fastapi import HTTPException
        raise HTTPException(400, "Thieu ten lop.")
    code = (payload.join_code or "").strip()[:16]
    if not code:
        code = "".join(secrets.choice(string.ascii_uppercase + string.digits) for _ in range(6))
    if db.q1("SELECT 1 FROM teams WHERE join_code=?", (code,)):
        from fastapi import HTTPException
        raise HTTPException(400, "Ma lop da ton tai.")
    now = datetime.now().isoformat(timespec="seconds")
    cur = db.exec("INSERT INTO teams (name, join_code, created_at) VALUES (?,?,?)", (name, code, now))
    tid = cur.lastrowid
    db.exec("INSERT OR IGNORE INTO team_members (team_id, user_id, member_role, joined_at) VALUES (?,?,?,?)",
            (tid, me["id"], "coach", now))
    return {"id": tid, "name": name, "join_code": code}


@router.post("/api/classes/join")
def join_class(payload: ClassJoinIn, request: Request):
    me = me_or_401(request)
    from fastapi import HTTPException
    if is_teacher(me):
        raise HTTPException(400, "Giao vien khong can vao lop bang ma.")
    code = (payload.join_code or "").strip()
    if not code:
        raise HTTPException(400, "Thieu ma lop.")
    cl = get_db().q1("SELECT id, name, join_code FROM teams WHERE join_code=?", (code,))
    if not cl:
        raise HTTPException(404, "Ma lop khong dung.")
    now = datetime.now().isoformat(timespec="seconds")
    get_db().exec("INSERT OR IGNORE INTO team_members (team_id, user_id, member_role, joined_at) VALUES (?,?,?,?)",
                  (cl["id"], me["id"], "student", now))
    get_db().exec("UPDATE students SET team=? WHERE id=?", (cl["name"], me["id"]))
    return {"class": {"id": cl["id"], "name": cl["name"], "join_code": cl["join_code"]}}


@router.get("/api/classes/{cid}/members")
def class_members(cid: int, request: Request):
    require_teacher(request)
    rows = get_db().q(
        "SELECT s.id, s.name, s.class_name, s.role, tm.joined_at FROM team_members tm JOIN students s ON s.id=tm.user_id WHERE tm.team_id=? AND tm.member_role='student' AND (tm.left_at IS NULL OR tm.left_at='') ORDER BY s.name",
        (cid,))
    out = []
    for r in rows:
        d = dict(r)
        d.pop("password_hash", None)
        out.append(d)
    return out


# ---------------- ASSIGNMENTS ----------------
@router.get("/api/assignments")
def list_assignments(request: Request, class_id: Optional[int] = None, team_id: Optional[int] = None):
    me = me_or_401(request)
    db = get_db()
    tid = team_id or class_id
    if is_teacher(me):
        if tid:
            return [dict(r) for r in db.q(
                "SELECT a.*, tt.name class_name, t.name topic_name FROM assignments a JOIN teams tt ON tt.id=a.team_id LEFT JOIN topics t ON t.id=a.topic_id WHERE a.team_id=? ORDER BY a.created_at DESC",
                (tid,))]
        return [dict(r) for r in db.q(
            "SELECT a.*, tt.name class_name, t.name topic_name FROM assignments a JOIN teams tt ON tt.id=a.team_id LEFT JOIN topics t ON t.id=a.topic_id ORDER BY a.created_at DESC")]
    ids = my_class_ids(me["id"])
    if not ids:
        return []
    qmarks = ",".join("?" * len(ids))
    rows = db.q(
        f"SELECT a.*, tt.name class_name, t.name topic_name FROM assignments a JOIN teams tt ON tt.id=a.team_id LEFT JOIN topics t ON t.id=a.topic_id WHERE a.team_id IN ({qmarks}) ORDER BY a.created_at DESC",
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
    me = require_teacher(request)
    title = (payload.title or "").strip()[:255]
    if not title:
        from fastapi import HTTPException
        raise HTTPException(400, "Thieu ten bai tap.")
    tid = resolve_assign_team(me, payload)
    topic = (payload.topic_id or "").strip() or None
    deadline = (payload.deadline or "").strip() or None
    now = datetime.now().isoformat(timespec="seconds")
    cur = db.exec(
        "INSERT INTO assignments (team_id, topic_id, title, description, deadline, created_by, created_at) VALUES (?,?,?,?,?,?,?)",
        (tid, topic, title, (payload.description or "")[:2000], deadline, me["id"] if me else None, now))
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
        qid = None if isinstance(q, str) else (int((q or {}).get("question_id") or 0) or None)
        if qid and not db.q1("SELECT 1 FROM questions WHERE id=?", (qid,)):
            qid = None
        db.exec("INSERT INTO assign_questions (assignment_id, idx, content, answer, points, question_id) VALUES (?,?,?,?,?,?)",
                (aid, i + 1, content[:4000], ans[:4000], pts, qid))
        n += 1
    if n == 0:
        from fastapi import HTTPException
        raise HTTPException(400, "Can it nhat 1 cau hoi.")
    # Thong bao cho hoc sinh trong doi
    try:
        dline = f" · hạn {deadline}" if deadline else ""
        notify_class(tid, f"Giao bài mới: {title}",
                     (payload.description or f"Bài tập mới{dline}")[:900],
                     f"/assignments/{aid}", db)
    except Exception:
        pass
    return {"id": aid, "questions": n}


@router.get("/api/assignments/{aid}")
def get_assignment(aid: int, request: Request):
    from fastapi import HTTPException
    me = me_or_401(request)
    db = get_db()
    a = db.q1(
        "SELECT a.*, tt.name class_name, t.name topic_name FROM assignments a JOIN teams tt ON tt.id=a.team_id LEFT JOIN topics t ON t.id=a.topic_id WHERE a.id=?",
        (aid,))
    if not a:
        raise HTTPException(404, "Khong tim thay bai tap.")
    d = dict(a)
    teacher = is_teacher(me)
    if not teacher and aid and int(a["team_id"]) not in my_class_ids(me["id"]):
        raise HTTPException(403, "Ban khong o lop nay.")
    d["deadline_passed"] = deadline_passed(a.get("deadline"))
    cols = "id, idx, content, points, question_id, answer" if teacher else "id, idx, content, points, question_id"
    d["questions"] = [dict(r) for r in db.q(
        f"SELECT {cols} FROM assign_questions WHERE assignment_id=? ORDER BY idx", (aid,))]
    if not teacher:
        sub = db.q1("SELECT id, answer, score, feedback, submitted_at, graded_at, question_scores, files FROM submissions WHERE assignment_id=? AND student_id=?",
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
    if int(a["team_id"]) not in my_class_ids(me["id"]):
        raise HTTPException(403, "Ban khong o lop nay.")
    if deadline_passed(a.get("deadline")):
        raise HTTPException(400, "Da qua han nop bai.")
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
    files = json.dumps([str(f)[:500] for f in (payload.files or [])[:10]], ensure_ascii=False)
    now = datetime.now().isoformat(timespec="seconds")
    if existing:
        db.exec("UPDATE submissions SET answer=?, files=?, submitted_at=?, question_scores=NULL, score=NULL, feedback=NULL, graded_at=NULL WHERE id=?",
                (blob, files, now, existing["id"]))
        sid = existing["id"]
    else:
        cur = db.exec("INSERT INTO submissions (assignment_id, student_id, answer, files, submitted_at) VALUES (?,?,?,?,?)",
                      (aid, me["id"], blob, files, now))
        sid = cur.lastrowid
    sync_submission_answers(sid, aid, m)
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
    if int(a["team_id"]) not in my_class_ids(me["id"]):
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
    files = json.dumps([str(f)[:500] for f in (payload.files or [])[:10]], ensure_ascii=False)
    if existing:
        db.exec("UPDATE submissions SET answer=?, files=? WHERE id=?", (blob, files, existing["id"]))
        sid = existing["id"]
    else:
        cur = db.exec("INSERT INTO submissions (assignment_id, student_id, answer, files, submitted_at) VALUES (?,?,?,?,NULL)",
                      (aid, me["id"], blob, files))
        sid = cur.lastrowid
    sync_submission_answers(sid, aid, m)
    return {"id": sid, "status": "draft"}


def sync_submission_answers(sid: int, aid: int, amap: dict):
    db = get_db()
    aqs = db.q("SELECT id, idx, question_id FROM assign_questions WHERE assignment_id=? ORDER BY idx", (aid,))
    if not aqs:
        return
    db.exec("DELETE FROM submission_answers WHERE submission_id=?", (sid,))
    for aq in aqs:
        idx = int(aq["idx"])
        text = amap.get(idx, amap.get(str(idx), ""))
        db.exec("INSERT INTO submission_answers (submission_id, question_id, assign_q_idx, answer) VALUES (?,?,?,?)",
                (sid, aq["question_id"], idx, str(text or "")[:4000]))


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
                  sub.submitted_at, sub.graded_at, sub.question_scores, sub.files
           FROM team_members tm JOIN students s ON s.id=tm.user_id
           LEFT JOIN submissions sub ON sub.assignment_id=? AND sub.student_id=s.id
           WHERE tm.team_id=? AND tm.member_role='student' AND (tm.left_at IS NULL OR tm.left_at='') ORDER BY s.name""",
        (aid, a["team_id"]))
    qs = [dict(r) for r in db.q("SELECT idx, content, answer, points, question_id FROM assign_questions WHERE assignment_id=? ORDER BY idx", (aid,))]
    out = []
    for r in rows:
        ans = json.loads(r["answer"]) if r["answer"] else None
        qscores = json.loads(r["question_scores"]) if r["question_scores"] else None
        try:
            files = json.loads(r["files"]) if r["files"] else []
        except Exception:
            files = []
        items = []
        if r["sub_id"] is not None:
            for it in db.q(
                """SELECT sa.id, sa.question_id, sa.assign_q_idx idx, sa.answer, sa.is_correct, sa.points, sa.feedback,
                          aq.content, aq.points max_points
                   FROM submission_answers sa LEFT JOIN assign_questions aq
                     ON aq.assignment_id=? AND aq.idx=sa.assign_q_idx
                   WHERE sa.submission_id=? ORDER BY sa.assign_q_idx""",
                (aid, r["sub_id"])):
                d = dict(it)
                d["id"] = int(d["id"])
                d["idx"] = int(d["idx"])
                d["is_correct"] = None if d["is_correct"] is None else int(d["is_correct"])
                d["points"] = None if d["points"] is None else float(d["points"])
                items.append(d)
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
            "question_scores": qscores, "files": files,
            "status": status, "answers": ans, "items": items,
        })
    return {"assignment": dict(a), "questions": qs, "submissions": out}


@router.put("/api/submissions/{sid}/grade")
def grade_submission(sid: int, payload: GradeIn, request: Request):
    from fastapi import HTTPException
    me = require_teacher(request)
    db = get_db()
    sub = db.q1("SELECT * FROM submissions WHERE id=?", (sid,))
    if not sub:
        raise HTTPException(404, "Khong tim thay bai nop.")
    score = max(0.0, min(10.0, float(payload.score)))
    now = datetime.now().isoformat(timespec="seconds")
    qs_json = json.dumps(payload.question_scores, ensure_ascii=False) if payload.question_scores is not None else None
    # Luu lich su sua diem truoc khi cap nhat
    db.exec(
        "INSERT INTO grade_history (submission_id, score, feedback, question_scores, graded_by, graded_at) VALUES (?,?,?,?,?,?)",
        (sid, sub["score"], sub["feedback"] or "", sub["question_scores"], me["id"], sub["graded_at"] or now))
    db.exec("UPDATE submissions SET score=?, feedback=?, question_scores=?, graded_at=? WHERE id=?",
            (score, (payload.feedback or "")[:1000], qs_json, now, sid))
    # M3: chi tiet tung cau
    if payload.items is not None:
        for it in payload.items or []:
            if not isinstance(it, dict):
                continue
            idx = int(it.get("idx") or 0)
            if idx <= 0:
                continue
            ic = it.get("is_correct")
            ic = None if ic is None else (1 if ic else 0)
            pt = it.get("points")
            pt = None if pt is None or pt == "" else float(pt)
            fb = str(it.get("feedback") or "")[:1000]
            db.exec("UPDATE submission_answers SET is_correct=?, points=?, feedback=? WHERE submission_id=? AND assign_q_idx=?",
                    (ic, pt, fb, sid, idx))
    return {"ok": True, "score": score}


@router.get("/api/submissions/{sid}/grade-history")
def grade_history(sid: int, request: Request):
    from fastapi import HTTPException
    require_teacher(request)
    rows = get_db().q(
        """SELECT g.id, g.score, g.feedback, g.question_scores, g.graded_at, s.name grader_name
           FROM grade_history g LEFT JOIN students s ON s.id=g.graded_by
           WHERE g.submission_id=? ORDER BY g.id DESC LIMIT 50""", (sid,))
    out = []
    for r in rows:
        d = dict(r)
        try:
            d["question_scores"] = json.loads(d["question_scores"]) if d["question_scores"] else None
        except Exception:
            d["question_scores"] = None
        out.append(d)
    return out


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
        assigned = db.q1(f"SELECT COUNT(*) c FROM assignments WHERE team_id IN ({qmarks})", tuple(ids))["c"]
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
        assigned = db.q1(f"SELECT COUNT(*) c FROM assignments WHERE team_id IN ({qmarks})", tuple(ids))["c"]
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
                  (SELECT COUNT(*) FROM lessons l WHERE l.topic_id=t.id AND COALESCE(l.required,1)=1) req_total,
                  (SELECT COUNT(*) FROM lessons l JOIN lesson_completions lc ON lc.lesson_id=l.id AND lc.student_id=? WHERE l.topic_id=t.id AND COALESCE(l.required,1)=1) req_done,
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
        # Dieu kien: hoan thanh khi du bai bat buoc (neu co) — coi het bai la bat buoc neu khong flag
        req_total = t["req_total"] if "req_total" in t.keys() else t["lt"]
        req_done = t["req_done"] if "req_done" in t.keys() else t["ld"]
        if int(req_total) > 0 and int(req_done) >= int(req_total):
            topics_done += 1
        elif current_topic is None and int(req_done) < int(req_total):
            current_topic = {"id": t["id"], "name": t["name"], "done": int(req_done), "total": int(req_total)}
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
        "timeline": [dict(r) for r in db.q(
            """SELECT DATE(COALESCE(graded_at, submitted_at)) day, AVG(score) avg_score, COUNT(*) n
               FROM submissions WHERE student_id=? AND score IS NOT NULL
               GROUP BY day ORDER BY day DESC LIMIT 90""", (me["id"],))],
    }


# ---------------- LESSONS ----------------
@router.get("/api/lessons")
def list_lessons(request: Request, topic_id: str = ""):
    from fastapi import HTTPException
    me = me_or_401(request)
    if not topic_id:
        raise HTTPException(400, "Thieu topic_id.")
    rows = get_db().q(
        """SELECT l.id, l.topic_id, l.title, l.content, l.idx,
                  COALESCE(l.required,1) required, COALESCE(l.advanced,0) advanced,
                  t.name topic_name,
                  (SELECT 1 FROM lesson_completions lc WHERE lc.lesson_id=l.id AND lc.student_id=?) completed
           FROM lessons l JOIN topics t ON t.id=l.topic_id WHERE l.topic_id=? ORDER BY l.idx, l.id""",
        (me["id"], topic_id))
    out = []
    for r in rows:
        d = dict(r)
        d["completed"] = bool(d["completed"])
        d["required"] = bool(d["required"])
        d["advanced"] = bool(d["advanced"])
        out.append(d)
    # Dieu kien hoan thanh: toan bo bai bat buoc da danh dau
    required = [x for x in out if x["required"]]
    req_done = sum(1 for x in required if x["completed"])
    return {
        "lessons": out,
        "required_total": len(required),
        "required_done": req_done,
        "topic_complete": bool(required) and req_done == len(required),
    }


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
    cur = db.exec("INSERT INTO lessons (topic_id, title, content, idx, required, advanced) VALUES (?,?,?,?,?,?)",
                  (topic_id, title, payload.content or "", max(1, payload.idx),
                   1 if payload.required else 0, 1 if payload.advanced else 0))
    return {"id": cur.lastrowid}


@router.put("/api/lessons/{lid}")
def update_lesson(lid: int, payload: LessonUpdateIn, request: Request):
    from fastapi import HTTPException
    require_teacher(request)
    db = get_db()
    l = db.q1("SELECT * FROM lessons WHERE id=?", (lid,))
    if not l:
        raise HTTPException(404, "Khong tim thay bai hoc.")
    title = (payload.title or l["title"]).strip()[:255] or l["title"]
    content = payload.content if payload.content is not None else (l["content"] or "")
    idx = payload.idx if payload.idx is not None else l["idx"]
    required = payload.required if payload.required is not None else (l["required"] if l["required"] is not None else 1)
    advanced = payload.advanced if payload.advanced is not None else (l["advanced"] if l["advanced"] is not None else 0)
    db.exec("UPDATE lessons SET title=?, content=?, idx=?, required=?, advanced=? WHERE id=?",
            (title, content, max(1, int(idx)), 1 if required else 0, 1 if advanced else 0, lid))
    return {"ok": True}


@router.delete("/api/lessons/{lid}")
def delete_lesson(lid: int, request: Request):
    from fastapi import HTTPException
    require_teacher(request)
    db = get_db()
    if not db.q1("SELECT 1 FROM lessons WHERE id=?", (lid,)):
        raise HTTPException(404, "Khong tim thay bai hoc.")
    db.exec("DELETE FROM lesson_completions WHERE lesson_id=?", (lid,))
    db.exec("DELETE FROM lessons WHERE id=?", (lid,))
    return {"ok": True}


@router.post("/api/lessons/{lid}/move")
def move_lesson(lid: int, request: Request, direction: str = "up"):
    """Doi thu tu bai hoc len/xuong (swap idx voi bai ke can)."""
    from fastapi import HTTPException
    require_teacher(request)
    db = get_db()
    l = db.q1("SELECT * FROM lessons WHERE id=?", (lid,))
    if not l:
        raise HTTPException(404, "Khong tim thay bai hoc.")
    order = "DESC" if direction == "up" else "ASC"
    neighbor = db.q1(
        f"SELECT * FROM lessons WHERE topic_id=? AND id<>? ORDER BY idx {order}, id {order} LIMIT 1",
        (l["topic_id"], lid))
    if not neighbor:
        return {"ok": True, "moved": False}
    db.exec("UPDATE lessons SET idx=? WHERE id=?", (neighbor["idx"], lid))
    db.exec("UPDATE lessons SET idx=? WHERE id=?", (l["idx"], neighbor["id"]))
    # Chuan hoa lai day du idx 1..n theo thu tu hien tai
    rows = db.q("SELECT id, idx FROM lessons WHERE topic_id=? ORDER BY idx, id", (l["topic_id"],))
    for i, r in enumerate(rows, 1):
        if int(r["idx"]) != i:
            db.exec("UPDATE lessons SET idx=? WHERE id=?", (i, r["id"]))
    return {"ok": True, "moved": True}


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


# ---------------- NOTIFICATIONS ----------------
@router.get("/api/notifications")
def list_notifications(request: Request, unread_only: int = 0):
    me = me_or_401(request)
    db = get_db()
    sql = "SELECT * FROM notifications WHERE user_id=?"
    if unread_only:
        sql += " AND read_at IS NULL"
    sql += " ORDER BY id DESC LIMIT 50"
    rows = [dict(r) for r in db.q(sql, (me["id"],))]
    unread = db.q1("SELECT COUNT(*) c FROM notifications WHERE user_id=? AND read_at IS NULL", (me["id"],))["c"]
    return {"items": rows, "unread": unread}


@router.post("/api/notifications/read")
def mark_notifications_read(payload: NotificationReadIn, request: Request):
    me = me_or_401(request)
    now = datetime.now().isoformat(timespec="seconds")
    if payload.id:
        get_db().exec("UPDATE notifications SET read_at=? WHERE id=? AND user_id=?", (now, int(payload.id), me["id"]))
    else:
        get_db().exec("UPDATE notifications SET read_at=? WHERE user_id=? AND read_at IS NULL", (now, me["id"]))
    return {"ok": True}


@router.get("/api/stats/team-timeline")
def team_timeline(request: Request, days: int = 30, team: str = ""):
    """Xu huong diem/lượt thi theo ngay cua doi tuyen (4.2)."""
    require_teacher(request)
    db = get_db()
    days = max(7, min(int(days or 30), 180))
    sql = """SELECT DATE(a.created_at) day, COUNT(*) n, AVG(a.accuracy) avg_acc, SUM(a.correct) c, SUM(a.total) t
             FROM attempts a JOIN students st ON st.id=a.student_id
             WHERE a.student_id IS NOT NULL AND a.created_at >= datetime('now', ?)"""
    params = [f"-{days} days"]
    if team:
        sql += " AND st.team=?"
        params.append(team)
    sql += " GROUP BY day ORDER BY day"
    rows = [dict(r) for r in db.q(sql, tuple(params))]
    gsql = """SELECT DATE(sub.graded_at) day, AVG(sub.score) avg_score, COUNT(*) n
              FROM submissions sub JOIN students st ON st.id=sub.student_id
              WHERE sub.score IS NOT NULL AND sub.graded_at >= datetime('now', ?)"""
    gparams = [f"-{days} days"]
    if team:
        gsql += " AND st.team=?"
        gparams.append(team)
    gsql += " GROUP BY day ORDER BY day"
    graded = [dict(r) for r in db.q(gsql, tuple(gparams))]
    return {"days": days, "team": team or "", "attempts": rows, "graded": graded}


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
