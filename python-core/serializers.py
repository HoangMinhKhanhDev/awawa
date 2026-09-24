from deps import get_db


def row_to_q(r, include_answer=False):
    subj = get_db().q1("SELECT name FROM subjects WHERE id=?", (r["subject_id"],))
    topic = get_db().q1("SELECT name FROM topics WHERE id=?", (r["topic_id"],)) if r["topic_id"] else None
    try:
        img = r["image_url"]
    except Exception:
        img = ""
    try:
        code = r["code"] or ""
    except Exception:
        code = ""
    try:
        tags_raw = r["tags"] or "[]"
    except Exception:
        tags_raw = "[]"
    import json as _json
    try:
        tags = _json.loads(tags_raw) if isinstance(tags_raw, str) else (tags_raw or [])
        if not isinstance(tags, list):
            tags = []
    except Exception:
        tags = []
    out = {
        "id": r["id"], "subject_id": r["subject_id"],
        "subject_name": subj["name"] if subj else r["subject_id"],
        "topic_id": r["topic_id"], "topic_name": topic["name"] if topic else None,
        "grade": r["grade"], "difficulty": r["difficulty"], "qtype": r["qtype"],
        "content": r["content"], "options": r["options"],
        "score": r["score"], "source": r["source"],
        "image_url": img or "",
        "code": code, "tags": tags,
    }
    if include_answer:
        out["correct_answer"] = r["correct_answer"]
        out["explanation"] = r["explanation"]
    return out
