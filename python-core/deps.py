"""Shared runtime state (DB handle set once at startup)."""


db = None


def init_db(path):
    global db
    from pathlib import Path
    from database import DB
    db = DB(Path(path))
    return db


def get_db():
    return db
