import sqlite3
from pathlib import Path

from seed import ensure_cn_seed, seed


SCHEMA = """
CREATE TABLE IF NOT EXISTS subjects (id TEXT PRIMARY KEY, name TEXT NOT NULL, code TEXT);
CREATE TABLE IF NOT EXISTS topics (id TEXT PRIMARY KEY, subject_id TEXT NOT NULL, name TEXT NOT NULL, grade INTEGER DEFAULT 12,
  description TEXT DEFAULT '', parent_id TEXT, position INTEGER DEFAULT 0, status TEXT DEFAULT 'published');
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
  points REAL DEFAULT 1,
  question_id INTEGER
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
CREATE TABLE IF NOT EXISTS submission_answers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  submission_id INTEGER NOT NULL,
  question_id INTEGER,
  assign_q_idx INTEGER,
  answer TEXT DEFAULT '',
  is_correct INTEGER,
  points REAL,
  feedback TEXT DEFAULT ''
);
CREATE TABLE IF NOT EXISTS lessons (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  topic_id TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT DEFAULT '',
  idx INTEGER NOT NULL DEFAULT 1,
  status TEXT DEFAULT 'published',
  published_at TEXT
);
CREATE TABLE IF NOT EXISTS lesson_blocks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lesson_id INTEGER NOT NULL,
  type TEXT NOT NULL DEFAULT 'text',
  content TEXT DEFAULT '',
  position INTEGER NOT NULL DEFAULT 1,
  metadata TEXT
);
CREATE TABLE IF NOT EXISTS lesson_completions (
  student_id INTEGER NOT NULL,
  lesson_id INTEGER NOT NULL,
  completed_at TEXT,
  PRIMARY KEY (student_id, lesson_id)
);
CREATE TABLE IF NOT EXISTS flashcards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  topic_id TEXT,
  lesson_id INTEGER,
  front TEXT NOT NULL,
  back TEXT DEFAULT '',
  idx INTEGER NOT NULL DEFAULT 1,
  created_at TEXT
);
CREATE TABLE IF NOT EXISTS flashcard_progress (
  student_id INTEGER NOT NULL,
  card_id INTEGER NOT NULL,
  box INTEGER NOT NULL DEFAULT 1,
  last_reviewed_at TEXT,
  PRIMARY KEY (student_id, card_id)
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
    ("code", "TEXT DEFAULT ''"),
    ("tags", "TEXT DEFAULT '[]'"),
]

LESSON_MIGRATIONS = [
    ("required", "INTEGER DEFAULT 1"),
    ("advanced", "INTEGER DEFAULT 0"),
    ("status", "TEXT DEFAULT 'published'"),
    ("published_at", "TEXT"),
]

EXAM_MIGRATIONS = [
    ("shuffle_q", "INTEGER DEFAULT 1"),
]

MATERIAL_MIGRATIONS = []

STUDENT_MIGRATIONS = [
    ("dob", "TEXT"),
    ("gender", "TEXT DEFAULT ''"),
    ("phone", "TEXT"),
    ("email", "TEXT"),
    ("password_hash", "TEXT"),
    ("role", "TEXT DEFAULT 'student'"),
    ("active", "INTEGER DEFAULT 1"),
]

TOPIC_MIGRATIONS = [
    ("description", "TEXT DEFAULT ''"),
    ("parent_id", "TEXT"),
    ("position", "INTEGER DEFAULT 0"),
    ("status", "TEXT DEFAULT 'published'"),
]

ASSIGN_Q_MIGRATIONS = [
    ("points", "REAL DEFAULT 1"),
    ("question_id", "INTEGER"),
]

SUBMISSION_MIGRATIONS = [
    ("question_scores", "TEXT"),
    ("files", "TEXT DEFAULT '[]'"),
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
        lcols = {r[1] for r in self.conn.execute("PRAGMA table_info(lessons)").fetchall()}
        for name, ddl in LESSON_MIGRATIONS:
            if name not in lcols:
                self.conn.execute(f"ALTER TABLE lessons ADD COLUMN {name} {ddl}")
        ecols = {r[1] for r in self.conn.execute("PRAGMA table_info(exams)").fetchall()}
        for name, ddl in EXAM_MIGRATIONS:
            if name not in ecols:
                self.conn.execute(f"ALTER TABLE exams ADD COLUMN {name} {ddl}")
        self.conn.execute("""CREATE TABLE IF NOT EXISTS grade_history (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          submission_id INTEGER NOT NULL,
          score REAL,
          feedback TEXT DEFAULT '',
          question_scores TEXT,
          graded_by INTEGER,
          graded_at TEXT)""")
        self.conn.execute("""CREATE TABLE IF NOT EXISTS materials (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          subject_id TEXT,
          topic_id TEXT,
          title TEXT NOT NULL,
          description TEXT DEFAULT '',
          file_url TEXT DEFAULT '',
          file_type TEXT DEFAULT '',
          grade INTEGER DEFAULT 12,
          created_by INTEGER,
          created_at TEXT)""")
        self.conn.execute("""CREATE TABLE IF NOT EXISTS notifications (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER,
          title TEXT NOT NULL,
          body TEXT DEFAULT '',
          link TEXT DEFAULT '',
          read_at TEXT,
          created_at TEXT)""")
        self.conn.execute("""CREATE TABLE IF NOT EXISTS password_resets (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          student_id INTEGER NOT NULL,
          code TEXT NOT NULL,
          expires_at TEXT NOT NULL,
          used_at TEXT,
          created_at TEXT)""")
        self.conn.execute("""CREATE TABLE IF NOT EXISTS role_permissions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          role TEXT NOT NULL,
          perm_key TEXT NOT NULL,
          allowed INTEGER DEFAULT 0,
          scope TEXT DEFAULT '',
          UNIQUE (role, perm_key))""")
        rpcols = {r[1] for r in self.conn.execute("PRAGMA table_info(role_permissions)").fetchall()}
        if "scope" not in rpcols:
            self.conn.execute("ALTER TABLE role_permissions ADD COLUMN scope TEXT DEFAULT ''")
        self.seed_role_permissions()
        self.conn.commit()
        self.conn.execute("""CREATE TABLE IF NOT EXISTS sessions (
          token_hash TEXT PRIMARY KEY, student_id INTEGER NOT NULL,
          expires_at TEXT NOT NULL, created_at TEXT)""")
        self.conn.execute("""CREATE TABLE IF NOT EXISTS school_years (
          id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE,
          start_date TEXT DEFAULT '', end_date TEXT DEFAULT '',
          is_current INTEGER DEFAULT 0, created_at TEXT)""")
        self.conn.execute("""CREATE TABLE IF NOT EXISTS grades (
          id INTEGER PRIMARY KEY AUTOINCREMENT, school_year_id INTEGER,
          name TEXT NOT NULL, code TEXT DEFAULT '', created_at TEXT)""")
        self.conn.execute("""CREATE TABLE IF NOT EXISTS teams (
          id INTEGER PRIMARY KEY AUTOINCREMENT, school_year_id INTEGER,
          grade_id INTEGER, subject_id TEXT, name TEXT NOT NULL,
          description TEXT DEFAULT '', created_at TEXT)""")
        self.conn.execute("""CREATE TABLE IF NOT EXISTS team_members (
          id INTEGER PRIMARY KEY AUTOINCREMENT, team_id INTEGER NOT NULL,
          user_id INTEGER NOT NULL, member_role TEXT DEFAULT 'student',
          joined_at TEXT, left_at TEXT,
          UNIQUE (team_id, user_id, member_role))""")
        # Đảm bảo cột active trên DB cũ (PRAGMA ALTER đã chạy ở trên, thêm guard lần 2)
        scols2 = {r[1] for r in self.conn.execute("PRAGMA table_info(students)").fetchall()}
        if "active" not in scols2:
            self.conn.execute("ALTER TABLE students ADD COLUMN active INTEGER DEFAULT 1")
            self.conn.execute("UPDATE students SET active=1 WHERE active IS NULL")
        self.conn.commit()
        if self.count("classes") == 0:
            self.conn.execute("INSERT INTO classes (name, join_code) VALUES ('Lớp bồi dưỡng HSG', 'HSG2026')")
        self.conn.commit()
        if self.count("questions") == 0:
            seed(self)
        else:
            ensure_cn_seed(self)
        self.ensure_school_defaults()

    def count(self, table):
        return self.conn.execute(f"SELECT COUNT(*) c FROM {table}").fetchone()["c"]

    def ensure_school_defaults(self):
        """Seed nhẹ cấu trúc nhà trường nếu trống — idempotent."""
        from datetime import datetime
        now = datetime.now().isoformat(timespec="seconds")
        if self.count("school_years") == 0:
            self.conn.execute(
                "INSERT INTO school_years (name, start_date, end_date, is_current, created_at) VALUES (?,?,?,?,?)",
                ("2026-2027", "2026-09-01", "2027-05-31", 1, now))
        else:
            cur = self.conn.execute(
                "SELECT COUNT(*) c FROM school_years WHERE is_current=1").fetchone()["c"]
            if cur == 0:
                first = self.conn.execute("SELECT id FROM school_years ORDER BY id LIMIT 1").fetchone()
                if first:
                    self.conn.execute("UPDATE school_years SET is_current=1 WHERE id=?", (first["id"],))
        if self.count("grades") == 0:
            yid = self.conn.execute("SELECT id FROM school_years WHERE is_current=1").fetchone()["id"]
            for name, code in (("Khối 10", "10"), ("Khối 11", "11"), ("Khối 12", "12")):
                self.conn.execute(
                    "INSERT INTO grades (school_year_id, name, code, created_at) VALUES (?,?,?,?)",
                    (yid, name, code, now))
        if self.count("teams") == 0:
            yid = self.conn.execute("SELECT id FROM school_years WHERE is_current=1").fetchone()["id"]
            for name, sid in (("Nông nghiệp", "cn-nong"), ("Chăn nuôi", "cn-chan"),
                              ("Lâm nghiệp – Thủy sản", "cn-lamthuy"), ("HSG Vật lý", "ly")):
                self.conn.execute(
                    "INSERT INTO teams (school_year_id, subject_id, name, created_at) VALUES (?,?,?,?)",
                    (yid, sid, name, now))
        self.conn.commit()

    def q(self, sql, params=()):
        return self.conn.execute(sql, params).fetchall()

    def q1(self, sql, params=()):
        return self.conn.execute(sql, params).fetchone()

    def exec(self, sql, params=()):
        cur = self.conn.execute(sql, params)
        self.conn.commit()
        return cur

    # Permission matrix (1.7) — seed idempotent theo role
    DEFAULT_PERMS = {
        "student": {
            "practice": 1, "exam": 1, "assignments.submit": 1,
            "lessons.read": 1, "materials.read": 1, "progress.self": 1,
        },
        "teacher": {
            "practice": 1, "exam": 1, "assignments.submit": 0,
            "assignments.create": 1, "assignments.grade": 1,
            "lessons.read": 1, "lessons.write": 1,
            "bank.manage": 1, "import.manage": 1, "studio.manage": 1,
            "materials.read": 1, "materials.write": 1,
            "students.view": 1, "students.create": 1,
            "progress.self": 1, "progress.team": 1, "export.reports": 1,
            "school.view": 1,
        },
        "admin": {
            "practice": 1, "exam": 1, "assignments.submit": 0,
            "assignments.create": 1, "assignments.grade": 1,
            "lessons.read": 1, "lessons.write": 1,
            "bank.manage": 1, "import.manage": 1, "studio.manage": 1,
            "materials.read": 1, "materials.write": 1,
            "students.view": 1, "students.create": 1, "students.bulk": 1,
            "students.lock": 1, "students.delete": 1,
            "progress.self": 1, "progress.team": 1, "export.reports": 1,
            "school.view": 1, "school.manage": 1,
            "notifications.send": 1,
        },
        "super_admin": {
            "practice": 1, "exam": 1, "assignments.submit": 0,
            "assignments.create": 1, "assignments.grade": 1,
            "lessons.read": 1, "lessons.write": 1,
            "bank.manage": 1, "import.manage": 1, "studio.manage": 1,
            "materials.read": 1, "materials.write": 1,
            "students.view": 1, "students.create": 1, "students.bulk": 1,
            "students.lock": 1, "students.delete": 1, "students.role": 1,
            "progress.self": 1, "progress.team": 1, "export.reports": 1,
            "school.view": 1, "school.manage": 1,
            "notifications.send": 1,
            "permissions.manage": 1, "users.manage_admin": 1,
        },
    }

    _SCOPE = {"student": "own", "teacher": "team", "admin": "school", "super_admin": "system"}

    def seed_role_permissions(self):
        for role, perms in self.DEFAULT_PERMS.items():
            for key, allowed in perms.items():
                self.conn.execute(
                    """INSERT OR IGNORE INTO role_permissions (role, perm_key, allowed, scope)
                       VALUES (?,?,?,?)""", (role, key, allowed, self._SCOPE.get(role, "own")))
        for role, scope in self._SCOPE.items():
            self.conn.execute(
                "UPDATE role_permissions SET scope=? WHERE role=? AND (scope IS NULL OR scope='')",
                (scope, role))
        self.conn.commit()
