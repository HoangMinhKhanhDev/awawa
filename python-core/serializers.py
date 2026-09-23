from deps import get_db


def row_to_q(r):
    subj = get_db().q1("SELECT name FROM subjects WHERE id=?", (r["subject_id"],))
    topic = get_db().q1("SELECT name FROM topics WHERE id=?", (r["topic_id"],)) if r["topic_id"] else None
    try:
        img = r["image_url"]
    except Exception:
        img = ""
    return {
        "id": r["id"], "subject_id": r["subject_id"],
        "subject_name": subj["name"] if subj else r["subject_id"],
        "topic_id": r["topic_id"], "topic_name": topic["name"] if topic else None,
        "grade": r["grade"], "difficulty": r["difficulty"], "qtype": r["qtype"],
        "content": r["content"], "options": r["options"],
        "correct_answer": r["correct_answer"], "explanation": r["explanation"],
        "score": r["score"], "source": r["source"],
        "image_url": img or "",
    }
