# Smoke test Phase 1a — chạy: python -X utf8 python-core/smoke_phase1a.py
import json
import sys
import urllib.error
import urllib.request

sys.stdout.reconfigure(encoding="utf-8")
BASE = "http://127.0.0.1:8765/api"


def req(path, data=None, token=None, method=None):
    body = None if data is None else json.dumps(data).encode()
    r = urllib.request.Request(
        BASE + path,
        data=body,
        method=method or ("POST" if data is not None else "GET"),
    )
    r.add_header("Content-Type", "application/json")
    if token:
        r.add_header("X-Session-Token", token)
    try:
        with urllib.request.urlopen(r, timeout=8) as resp:
            return json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        return {"_err": e.code, "body": e.read().decode()[:400]}


def main():
    tokens = {}
    for name, login, pw in [
        ("admin", "0900000000", "Adm@123456"),
        ("teacher", "0900000001", "Gv@123456"),
        ("student", "0911111111", "Hs@123456"),
    ]:
        r = req("/auth/login", {"login": login, "password": pw})
        ok = "token" in r
        print(f"login {name}: {'OK' if ok else r}")
        if ok:
            tokens[name] = r["token"]
            st = r["student"]
            print(f"  role={st.get('role')} active={st.get('active')}")

    admin = tokens.get("admin")
    teacher = tokens.get("teacher")
    student = tokens.get("student")
    if not admin:
        print("FAIL: no admin login")
        sys.exit(1)

    years = req("/school-years", token=admin)
    print("years:", years if isinstance(years, dict) else f"n={len(years)}")
    grades = req("/grades", token=admin)
    print("grades n:", len(grades) if isinstance(grades, list) else grades)
    teams = req("/teams", token=admin)
    print("teams n:", len(teams) if isinstance(teams, list) else teams)
    print("me/teams admin n:", len(req("/me/teams", token=admin) or []))
    print("me/teams teacher:", req("/me/teams", token=teacher))
    print("students admin n:", len(req("/students", token=admin) or []))
    print("students teacher n:", len(req("/students", token=teacher) or []))
    print("students student n:", len(req("/students", token=student) or []))

    print("teacher create team (should 403):", req("/teams", {"name": "Hack"}, token=teacher))
    y = req("/school-years", {"name": "TEST-2028", "is_current": 0}, token=admin)
    print("create year:", y)
    if isinstance(y, dict) and y.get("id"):
        print("del year:", req(f"/school-years/{y['id']}", method="DELETE", token=admin))

    studs = req("/students", token=admin) or []
    target = next((s for s in studs if (s.get("role") or "student") == "student" and s.get("id")), None)
    if target:
        sid = target["id"]
        print("lock:", req(f"/students/{sid}/active", {"active": 0}, token=admin, method="PUT"))
        if target.get("phone") and target.get("password_hash") is None:
            pass
        # đăng nhập đúng mật khẩu HS demo nếu là clone
        if target.get("phone") == "0911111111":
            print("locked login correct pw (should 403):", req("/auth/login", {"login": "0911111111", "password": "Hs@123456"}))
        print("unlock:", req(f"/students/{sid}/active", {"active": 1}, token=admin, method="PUT"))

    if studs:
        print("teacher cannot lock:", req(f"/students/{studs[0]['id']}/active", {"active": 0}, token=teacher, method="PUT"))
    print("student list self-only n:", len(req("/students", token=student) or []))
    print("DONE")


if __name__ == "__main__":
    main()
