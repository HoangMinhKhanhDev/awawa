# Cloze (diem khuyet) grading — mirror PHP grade_cloze.
import json
import re
import unicodedata


def cloze_norm(s) -> str:
    s = str(s or "").strip().lower()
    s = unicodedata.normalize("NFD", s)
    s = "".join(c for c in s if not unicodedata.combining(c))
    s = re.sub(r"[^a-z0-9]+", "", s)
    return s


def cloze_blank_count(content: str) -> int:
    n1 = len(re.findall(r"\{\{[^}]+\}\}", content or ""))
    n2 = len(re.findall(r"_{3,}", content or ""))
    return max(n1, n2)


def cloze_answers(correct_answer: str) -> list:
    parts = re.split(r"\|\||\||;", str(correct_answer or ""))
    return [p.strip() for p in parts if p.strip()]


def grade_cloze(content: str, correct_answer: str, user_answer):
    answers = cloze_answers(correct_answer)
    n_blanks = cloze_blank_count(content)
    if not answers:
        return None
    if isinstance(user_answer, list):
        ua = user_answer
    else:
        try:
            ua = json.loads(user_answer) if isinstance(user_answer, str) else None
        except Exception:
            ua = None
        if not isinstance(ua, list):
            ua = [x.strip() for x in str(user_answer or "").split(",")]
    if len(ua) == 1 and len(answers) > 1 and isinstance(ua[0], str):
        split = [x.strip() for x in ua[0].split(",")]
        if len(split) == len(answers):
            ua = split
    correct = 0
    detail = []
    for i, ans in enumerate(answers):
        if i < len(ua):
            u = ua[i]
            if isinstance(u, dict):
                u = u.get("text") or u.get("answer") or ""
        else:
            u = ""
        ok = cloze_norm(u) != "" and cloze_norm(u) == cloze_norm(ans)
        detail.append({"blank": i + 1, "ok": ok, "answer": ans, "user": str(u)})
        if ok:
            correct += 1
    total = max(len(answers), n_blanks, 1)
    return {"correct": correct, "total": total, "detail": detail}
