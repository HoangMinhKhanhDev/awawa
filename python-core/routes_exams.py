import json
import random
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, HTTPException, Request

from auth import optional_session
from deps import get_db
from models import ExamIn, SubmitIn
from serializers import row_to_q

router = APIRouter()


@router.post("/api/exams")
def create_exam(payload: ExamIn):
    now = datetime.now().isoformat(timespec="seconds")
    mode = payload.mode or "exam"
    cur = get_db().exec("INSERT INTO exams (title, mode, duration_min, question_ids, created_at) VALUES (?,?,?,?,?)",
                  (payload.title, mode, payload.duration_min, json.dumps(payload.question_ids or []), now))
    return {"id": cur.lastrowid, "title": payload.title, "mode": mode}


@router.get("/api/exams")
def list_exams(request: Request, mode: str = "shared"):
    """GV đăng đề chia sẻ (mode=shared). HS xem danh sách shared để bấm làm."""
    rows = get_db().q(
        """SELECT id, title, mode, duration_min, question_ids, created_at
           FROM exams WHERE mode=? ORDER BY id DESC LIMIT 50""",
        (mode or "shared",))
    out = []
    for r in rows:
        try:
            ids = json.loads(r["question_ids"] or "[]")
        except Exception:
            ids = []
        out.append({
            "id": r["id"], "title": r["title"], "mode": r["mode"],
            "duration_min": r["duration_min"], "n_questions": len(ids),
            "created_at": r["created_at"],
        })
    return out


@router.get("/api/exams/{eid}")
def get_exam(eid: int, shuffle: int = 1):
    r = get_db().q1("SELECT * FROM exams WHERE id=?", (eid,))
    if not r: raise HTTPException(404, "Khong tim thay de")
    try: ids = json.loads(r["question_ids"] or "[]")
    except Exception: ids = []
    # Tron cau server-side (chong lo de) — moi lan tai lai thu tu khac
    do_shuffle = 1
    try:
        do_shuffle = int(r["shuffle_q"]) if r["shuffle_q"] is not None else 1
    except Exception:
        do_shuffle = 1
    if do_shuffle and shuffle and len(ids) > 1:
        random.shuffle(ids)
    qs = []
    for qid in ids:
        qr = get_db().q1("SELECT * FROM questions WHERE id=?", (qid,))
        if qr: qs.append(row_to_q(qr))
    try:
        duration = r["duration_min"]
    except Exception:
        duration = None
    return {"id": r["id"], "title": r["title"], "mode": r["mode"],
            "duration_min": duration, "questions": qs, "shuffled": bool(do_shuffle and shuffle)}


@router.post("/api/exams/{eid}/submit")
def submit_exam(eid: int, payload: SubmitIn, request: Request):
    exam = get_db().q1("SELECT * FROM exams WHERE id=?", (eid,)) if eid and eid < 10**12 else None
    mode = exam["mode"] if exam else "practice"
    correct = 0
    total = 0
    for a in payload.answers or []:
        qid = a.get("question_id")
        qr = get_db().q1("SELECT * FROM questions WHERE id=?", (qid,)) if qid else None
        if qr is None:
            continue
        if qr["qtype"] == "trac_nghiem":
            total += 1
            ua = str(a.get("user_answer") or "").strip().upper()
            ca = str(qr["correct_answer"] or "").strip().upper()
            if ua and ua == ca:
                correct += 1
                a["is_correct"] = True
            else:
                a["is_correct"] = False
        else:
            a["is_correct"] = None  # tá»± luáº­n: tá»± Ä‘á»‘i chiáº¿u, khÃ´ng auto cháº¥m
    acc = (correct / total) if total else 0
    now = datetime.now().isoformat(timespec="seconds")
    focus_exits = max(0, int(payload.focus_exits or 0))
    focus_log = payload.focus_log or []
    if not isinstance(focus_log, list):
        focus_log = []
    focus_log = focus_log[:200]  # chá»‘ng log quÃ¡ lá»›n
    sess = optional_session(request)
    sid = sess["id"] if sess else None
    cur = get_db().exec("INSERT INTO attempts (exam_id, mode, correct, total, accuracy, detail, student_name, student_id, focus_exits, focus_log, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
                  (eid if exam else None, mode, correct, total, acc, json.dumps(payload.answers or [], ensure_ascii=False),
                   (payload.student_name or "").strip()[:100], sid, focus_exits, json.dumps(focus_log, ensure_ascii=False), now))
    return {"attempt_id": cur.lastrowid, "correct": correct, "total": total, "accuracy": acc,
            "focus_exits": focus_exits}


@router.get("/api/attempts")
def attempts(student_name: Optional[str] = None, mode: Optional[str] = None, request: Request = None):
    me = optional_session(request) if request is not None else None
    is_teacher = bool(me and (me.get("role") or "student") in ("teacher", "admin", "super_admin"))
    if not me:
        return []
    sql = "SELECT * FROM attempts WHERE 1=1"
    params = []
    if not is_teacher:
        sql += " AND student_id=?"; params.append(me["id"])
    elif student_name:
        sql += " AND student_name=?"; params.append(student_name)
    if mode:
        sql += " AND mode=?"; params.append(mode)
    sql += " ORDER BY id DESC LIMIT 200"
    return [dict(r) for r in get_db().q(sql, tuple(params))]


@router.get("/api/stats/leaderboard")
def leaderboard(mode: str = "exam", team: Optional[str] = None, limit: int = 50):
    limit = max(1, min(limit or 50, 100))
    sql = "SELECT st.id, st.name, st.class_name, st.team, COUNT(a.id) n, MAX(a.accuracy) best, AVG(a.accuracy) avg, MAX(a.created_at) last_at FROM attempts a JOIN students st ON st.id=a.student_id WHERE a.student_id IS NOT NULL AND a.total > 0 AND COALESCE(st.role,'student') NOT IN ('teacher','admin') AND COALESCE(st.active,1)=1"
    params = []
    if mode == "exam" or mode == "practice":
        sql += " AND a.mode=?"; params.append(mode)
    if team:
        sql += " AND st.team=?"; params.append(team)
    sql += " GROUP BY st.id ORDER BY best DESC, avg DESC, n DESC LIMIT ?"
    params.append(limit)
    out = []
    for i, r in enumerate(get_db().q(sql, tuple(params)), 1):
        out.append({"rank": i, "student_id": r["id"], "name": r["name"],
                    "class_name": r["class_name"], "team": r["team"], "attempts": r["n"],
                    "best": round(r["best"] or 0, 4), "avg": round(r["avg"] or 0, 4),
                    "last_at": r["last_at"]})
    return {"mode": mode, "board": out}


@router.get("/api/stats/overview")
def stats(student_name: Optional[str] = None, request: Request = None):
    me = optional_session(request) if request is not None else None
    role = (me.get("role") if me else "student") or "student"
    if me and role not in ("teacher", "admin", "super_admin"):
        student_name = me["name"]
    total_q = get_db().count("questions")
    if student_name:
        rows_a = get_db().q("SELECT correct, total FROM attempts WHERE student_name=?", (student_name,))
        total_a = len(rows_a)
    else:
        total_a = get_db().count("attempts")
        rows_a = get_db().q("SELECT correct, total FROM attempts")
    c = sum((r["correct"] or 0) for r in rows_a)
    t = sum((r["total"] or 0) for r in rows_a)
    acc = (c / t) if t else 0
    by_subject = [dict(r) for r in get_db().q(
        "SELECT s.name subject, COUNT(q.id) count FROM subjects s LEFT JOIN questions q ON q.subject_id=s.id GROUP BY s.id ORDER BY count DESC")]
    # by topic: dá»±a trÃªn attempts detail
    topic_stat = {}
    for a in get_db().q("SELECT detail FROM attempts"):
        try: det = json.loads(a["detail"] or "[]")
        except Exception: det = []
        for d in det:
            qr = get_db().q1("SELECT topic_id FROM questions WHERE id=?", (d.get("question_id"),))
            if not qr or not qr["topic_id"]:
                continue
            tr = get_db().q1("SELECT name FROM topics WHERE id=?", (qr["topic_id"],))
            name = tr["name"] if tr else qr["topic_id"]
            s = topic_stat.setdefault(name, {"topic": name, "done": 0, "total": 0})
            if d.get("is_correct") is not None:
                s["total"] += 1
                if d.get("is_correct"): s["done"] += 1
    by_topic = []
    for v in topic_stat.values():
        v["accuracy"] = (v["done"] / v["total"]) if v["total"] else 0
        by_topic.append(v)
    by_topic.sort(key=lambda x: x["accuracy"])
    # Chá»‰ gáº¯n cá» "cáº§n Ã´n láº¡i" khi tá»‰ lá»‡ Ä‘Ãºng dÆ°á»›i 80%
    weak = [t for t in by_topic if t["accuracy"] < 0.8][:6]
    # Xáº¿p háº¡ng theo há»c sinh (cho quáº£n lÃ½ Ä‘á»™i tuyá»ƒn): gom theo student_name
    by_student = []
    for r in get_db().q("SELECT student_name, COUNT(*) n, SUM(correct) c, SUM(total) t, AVG(accuracy) avg_acc, MAX(created_at) last_at FROM attempts WHERE student_name<>'' GROUP BY student_name ORDER BY avg_acc DESC LIMIT 100"):
        tot = r["t"] or 0
        cor = r["c"] or 0
        by_student.append({
            "student_name": r["student_name"], "attempts": r["n"],
            "correct": cor, "total": tot,
            "accuracy": (cor / tot) if tot else 0,
            "last_at": r["last_at"],
        })
    return {"total_questions": total_q, "total_attempts": total_a, "accuracy": acc,
            "by_subject": by_subject, "by_topic": by_topic, "weak_topics": weak,
            "by_student": by_student}
