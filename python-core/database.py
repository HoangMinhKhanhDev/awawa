import sqlite3
from pathlib import Path

from seed import ensure_cn_seed, seed


SCHEMA = """
CREATE TABLE IF NOT EXISTS subjects (id TEXT PRIMARY KEY, name TEXT NOT NULL, code TEXT);
CREATE TABLE IF NOT EXISTS topics (id TEXT PRIMARY KEY, subject_id TEXT NOT NULL, name TEXT NOT NULL, grade INTEGER DEFAULT 12);
CREATE TABLE IF NOT EXISTS questions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  subject_id TEXT NOT NULL,
  topic_id TEXT,
  grade INTEGER DEFAULT 12,
  difficulty TEXT DEFAULT 'váº­n dá»¥ng',
  qtype TEXT DEFAULT 'trac_nghiem',
  content TEXT NOT NULL,
  options TEXT DEFAULT '[]',
  correct_answer TEXT DEFAULT '',
  explanation TEXT DEFAULT '',
  score REAL DEFAULT 1,
  source TEXT DEFAULT 'máº«u',
  image_url TEXT DEFAULT '',
  created_at TEXT
);
CREATE TABLE IF NOT EXISTS students (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  class_name TEXT DEFAULT '',
  team TEXT DEFAULT '',
  note TEXT DEFAULT '',
  dob TEXT,
  gender TEXT DEFAULT '',
  phone TEXT,
  email TEXT,
  password_hash TEXT,
  role TEXT DEFAULT 'student',
  created_at TEXT
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  student_id INTEGER NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT
);
CREATE TABLE IF NOT EXISTS exams (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT DEFAULT 'Äá»',
  mode TEXT DEFAULT 'practice',
  duration_min INTEGER DEFAULT 45,
  question_ids TEXT DEFAULT '[]',
  created_at TEXT
);
CREATE TABLE IF NOT EXISTS attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  exam_id INTEGER,
  mode TEXT DEFAULT 'practice',
  correct INTEGER DEFAULT 0,
  total INTEGER DEFAULT 0,
  accuracy REAL DEFAULT 0,
  detail TEXT DEFAULT '[]',
  student_name TEXT DEFAULT '',
  student_id INTEGER,
  focus_exits INTEGER DEFAULT 0,
  focus_log TEXT DEFAULT '[]',
  created_at TEXT
);
CREATE TABLE IF NOT EXISTS classes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  join_code TEXT NOT NULL UNIQUE,
  created_at TEXT
);
CREATE TABLE IF NOT EXISTS class_members (
  class_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  joined_at TEXT,
  PRIMARY KEY (class_id, user_id)
);
CREATE TABLE IF NOT EXISTS assignments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  class_id INTEGER NOT NULL,
  topic_id TEXT,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  deadline TEXT,
  created_by INTEGER,
  created_at TEXT
);
CREATE TABLE IF NOT EXISTS assign_questions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  assignment_id INTEGER NOT NULL,
  idx INTEGER NOT NULL DEFAULT 1,
  content TEXT NOT NULL,
  answer TEXT DEFAULT '',
  points REAL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS submissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  assignment_id INTEGER NOT NULL,
  student_id INTEGER NOT NULL,
  answer TEXT DEFAULT '[]',
  score REAL,
  feedback TEXT DEFAULT '',
  question_scores TEXT,
  submitted_at TEXT,
  graded_at TEXT,
  UNIQUE (assignment_id, student_id)
);
CREATE TABLE IF NOT EXISTS lessons (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  topic_id TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT DEFAULT '',
  idx INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS lesson_completions (
  student_id INTEGER NOT NULL,
  lesson_id INTEGER NOT NULL,
  completed_at TEXT,
  PRIMARY KEY (student_id, lesson_id)
);
"""


# Cá»™t má»›i cho DB Ä‘Ã£ tá»“n táº¡i tá»« báº£n cÅ© (migrate nháº¹, khÃ´ng máº¥t dá»¯ liá»‡u)
ATTEMPT_MIGRATIONS = [
    ("student_name", "TEXT DEFAULT ''"),
    ("student_id", "INTEGER"),
    ("focus_exits", "INTEGER DEFAULT 0"),
    ("focus_log", "TEXT DEFAULT '[]'"),
]

QUESTION_MIGRATIONS = [
    ("image_url", "TEXT DEFAULT ''"),
]

STUDENT_MIGRATIONS = [
    ("dob", "TEXT"),
    ("gender", "TEXT DEFAULT ''"),
    ("phone", "TEXT"),
    ("email", "TEXT"),
    ("password_hash", "TEXT"),
    ("role", "TEXT DEFAULT 'student'"),
]

TOPIC_MIGRATIONS = [
    ("description", "TEXT DEFAULT ''"),
]

ASSIGN_Q_MIGRATIONS = [
    ("points", "REAL DEFAULT 1"),
]

SUBMISSION_MIGRATIONS = [
    ("question_scores", "TEXT"),
]


class DB:
    def __init__(self, path: Path):
        path.parent.mkdir(parents=True, exist_ok=True)
        self.path = str(path)
        self.conn = sqlite3.connect(self.path, check_same_thread=False)
        self.conn.row_factory = sqlite3.Row
        self.conn.executescript(SCHEMA)
        self.conn.commit()
        cols = {r[1] for r in self.conn.execute("PRAGMA table_info(attempts)").fetchall()}
        for name, ddl in ATTEMPT_MIGRATIONS:
            if name not in cols:
                self.conn.execute(f"ALTER TABLE attempts ADD COLUMN {name} {ddl}")
        qcols = {r[1] for r in self.conn.execute("PRAGMA table_info(questions)").fetchall()}
        for name, ddl in QUESTION_MIGRATIONS:
            if name not in qcols:
                self.conn.execute(f"ALTER TABLE questions ADD COLUMN {name} {ddl}")
        scols = {r[1] for r in self.conn.execute("PRAGMA table_info(students)").fetchall()}
        for name, ddl in STUDENT_MIGRATIONS:
            if name not in scols:
                self.conn.execute(f"ALTER TABLE students ADD COLUMN {name} {ddl}")
        tcols = {r[1] for r in self.conn.execute("PRAGMA table_info(topics)").fetchall()}
        for name, ddl in TOPIC_MIGRATIONS:
            if name not in tcols:
                self.conn.execute(f"ALTER TABLE topics ADD COLUMN {name} {ddl}")
        aqcols = {r[1] for r in self.conn.execute("PRAGMA table_info(assign_questions)").fetchall()}
        for name, ddl in ASSIGN_Q_MIGRATIONS:
            if name not in aqcols:
                self.conn.execute(f"ALTER TABLE assign_questions ADD COLUMN {name} {ddl}")
        subcols = {r[1] for r in self.conn.execute("PRAGMA table_info(submissions)").fetchall()}
        for name, ddl in SUBMISSION_MIGRATIONS:
            if name not in subcols:
                self.conn.execute(f"ALTER TABLE submissions ADD COLUMN {name} {ddl}")
        self.conn.execute("""CREATE TABLE IF NOT EXISTS sessions (
          token_hash TEXT PRIMARY KEY, student_id INTEGER NOT NULL,
          expires_at TEXT NOT NULL, created_at TEXT)""")
        if self.count("classes") == 0:
            self.conn.execute("INSERT INTO classes (name, join_code) VALUES ('Lớp bồi dưỡng HSG', 'HSG2026')")
        self.conn.commit()
        if self.count("questions") == 0:
            seed(self)
        else:
            ensure_cn_seed(self)

    def count(self, table):
        return self.conn.execute(f"SELECT COUNT(*) c FROM {table}").fetchone()["c"]

    def q(self, sql, params=()):
        return self.conn.execute(sql, params).fetchall()

    def q1(self, sql, params=()):
        return self.conn.execute(sql, params).fetchone()

    def exec(self, sql, params=()):
        cur = self.conn.execute(sql, params)
        self.conn.commit()
        return cur
