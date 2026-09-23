# Smoke: pipeline exam shared — python -X utf8 python-core/smoke_studio.py
import json
import sys
import urllib.error
import urllib.request

sys.stdout.reconfigure(encoding="utf-8")
BASE = "http://127.0.0.1:8765/api"


def req(path, data=None, token=None, method=None):
    body = None if data is None else json.dumps(data).encode()
    r = urllib.request.Request(
        BASE + path, data=body, method=method or ("POST" if data is not None else "GET")
    )
    r.add_header("Content-Type", "application/json")
    if token:
        r.add_header("X-Session-Token", token)
    try:
        with urllib.request.urlopen(r, timeout=8) as resp:
            return json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        return {"_err": e.code, "body": e.read().decode()[:300]}


def main():
    login = req("/auth/login", {"login": "0900000001", "password": "Gv@123456"})
    tok = login.get("token")
    print("login teacher", "OK" if tok else login)
    qs = req("/questions?limit=5", token=tok) or []
    ids = [q["id"] for q in qs[:5]]
    print("questions", len(ids))
    ex = req(
        "/exams",
        {"title": "De studio demo", "mode": "shared", "duration_min": 30, "question_ids": ids},
        token=tok,
    )
    print("create shared", ex)
    lst = req("/exams?mode=shared", token=tok)
    print("list shared", "n=" + str(len(lst)) if isinstance(lst, list) else lst)
    if isinstance(ex, dict) and ex.get("id"):
        g = req(f"/exams/{ex['id']}")
        print("get exam", "q=" + str(len(g.get("questions") or [])), "dur", g.get("duration_min"))
    # student sees list
    slogin = req("/auth/login", {"login": "0911111111", "password": "Hs@123456"})
    stok = slogin.get("token")
    slst = req("/exams?mode=shared", token=stok)
    print("student list shared", "n=" + str(len(slst)) if isinstance(slst, list) else slst)
    print("DONE")


if __name__ == "__main__":
    main()
