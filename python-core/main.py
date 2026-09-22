"""Python core cho pháº§n má»m Ã´n luyá»‡n HSG THPT.
Cháº¡y offline, lÆ°u SQLite local. KhÃ´ng OCR, khÃ´ng Ä‘á»“ng bá»™ á»Ÿ báº£n Ä‘áº§u.
Run: python main.py --port 8765 --db-path ./data/app.db
"""
import argparse
import json
import re
import sqlite3
import sys
import time
from datetime import datetime
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel

# MIME Ã©p cá»©ng cho file PWA (Windows hay Ä‘oÃ¡n sai .js/.webmanifest,
# Chrome tá»« chá»‘i Ä‘Äƒng kÃ½ SW náº¿u sai MIME)
STATIC_MEDIA = {
    ".js": "text/javascript",
    ".mjs": "text/javascript",
    ".css": "text/css",
    ".html": "text/html",
    ".json": "application/json",
    ".webmanifest": "application/manifest+json",
    ".png": "image/png",
    ".ico": "image/x-icon",
    ".svg": "image/svg+xml",
}
STATIC_DIR: Optional[Path] = None

BASE_DIR = Path(__file__).parent
DEFAULT_DB = BASE_DIR / "data" / "app.db"

try:
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
except Exception:
    pass

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
  focus_exits INTEGER DEFAULT 0,
  focus_log TEXT DEFAULT '[]',
  created_at TEXT
);
"""

# Cá»™t má»›i cho DB Ä‘Ã£ tá»“n táº¡i tá»« báº£n cÅ© (migrate nháº¹, khÃ´ng máº¥t dá»¯ liá»‡u)
ATTEMPT_MIGRATIONS = [
    ("student_name", "TEXT DEFAULT ''"),
    ("focus_exits", "INTEGER DEFAULT 0"),
    ("focus_log", "TEXT DEFAULT '[]'"),
]

QUESTION_MIGRATIONS = [
    ("image_url", "TEXT DEFAULT ''"),
]

# ---------- DB ----------
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


def seed(db: DB):
    now = datetime.now().isoformat(timespec="seconds")
    subjects = [
        ("toan", "ToÃ¡n", "TOAN"),
        ("ly", "Váº­t lÃ­", "LY"),
        ("hoa", "HÃ³a há»c", "HOA"),
        ("van", "Ngá»¯ vÄƒn", "VAN"),
        ("anh", "Tiáº¿ng Anh", "ANH"),
        ("cn-nong", "CÃ´ng nghá»‡ NÃ´ng nghiá»‡p", "CN-NN"),
        ("cn-chan", "CÃ´ng nghá»‡ ChÄƒn nuÃ´i", "CN-CN"),
        ("cn-lamthuy", "CÃ´ng nghá»‡ LÃ¢m nghiá»‡p â€“ Thá»§y sáº£n", "CN-LTS"),
    ]
    for sid, name, code in subjects:
        db.exec("INSERT OR IGNORE INTO subjects (id, name, code) VALUES (?,?,?)", (sid, name, code))
    topics = [
        ("toan-hamso", "toan", "HÃ m sá»‘ vÃ  Ä‘á»“ thá»‹", 12),
        ("toan-tichphan", "toan", "NguyÃªn hÃ m â€“ TÃ­ch phÃ¢n", 12),
        ("toan-hinhkg", "toan", "HÃ¬nh há»c khÃ´ng gian", 11),
        ("ly-dao-dong", "ly", "Dao Ä‘á»™ng cÆ¡", 12),
        ("ly-dien", "ly", "DÃ²ng Ä‘iá»‡n xoay chiá»u", 12),
        ("hoa-huuco", "hoa", "HÃ³a há»¯u cÆ¡", 11),
        ("van-nghiluan", "van", "Nghá»‹ luáº­n vÄƒn há»c", 12),
        ("anh-nguphap", "anh", "Ngá»¯ phÃ¡p nÃ¢ng cao", 12),
        # --- CÃ´ng nghá»‡ NÃ´ng nghiá»‡p ---
        ("cn-nong-dattrong", "cn-nong", "Äáº¥t trá»“ng & giÃ¡ thá»ƒ", 10),
        ("cn-nong-phanbon", "cn-nong", "PhÃ¢n bÃ³n & dinh dÆ°á»¡ng cÃ¢y trá»“ng", 11),
        ("cn-nong-giong", "cn-nong", "Giá»‘ng cÃ¢y trá»“ng & nhÃ¢n giá»‘ng", 11),
        ("cn-nong-bvtv", "cn-nong", "Báº£o vá»‡ thá»±c váº­t & dá»‹ch háº¡i", 12),
        ("cn-nong-cncao", "cn-nong", "NÃ´ng nghiá»‡p cÃ´ng nghá»‡ cao", 12),
        ("cn-nong-baoquan", "cn-nong", "Thu hoáº¡ch, báº£o quáº£n & cháº¿ biáº¿n", 12),
        # --- CÃ´ng nghá»‡ ChÄƒn nuÃ´i ---
        ("cn-chan-giong", "cn-chan", "Giá»‘ng váº­t nuÃ´i", 11),
        ("cn-chan-thucan", "cn-chan", "Thá»©c Äƒn & dinh dÆ°á»¡ng váº­t nuÃ´i", 11),
        ("cn-chan-chuong", "cn-chan", "Chuá»“ng tráº¡i & mÃ´i trÆ°á»ng", 11),
        ("cn-chan-thuy", "cn-chan", "ThÃº y & phÃ²ng trá»‹ bá»‡nh", 12),
        ("cn-chan-cncao", "cn-chan", "ChÄƒn nuÃ´i cÃ´ng nghá»‡ cao & ATSH", 12),
        ("cn-chan-chebien", "cn-chan", "Thu hoáº¡ch, báº£o quáº£n & cháº¿ biáº¿n SP chÄƒn nuÃ´i", 12),
        # --- LÃ¢m nghiá»‡p â€“ Thá»§y sáº£n ---
        ("cn-lam-rung", "cn-lamthuy", "Giá»‘ng cÃ¢y rá»«ng & trá»“ng rá»«ng", 11),
        ("cn-lam-quanly", "cn-lamthuy", "Quáº£n lÃ½, báº£o vá»‡ rá»«ng & mÃ´i trÆ°á»ng", 12),
        ("cn-thuy-giong", "cn-lamthuy", "Giá»‘ng & thá»©c Äƒn thá»§y sáº£n", 11),
        ("cn-thuy-nuoi", "cn-lamthuy", "Ká»¹ thuáº­t nuÃ´i trá»“ng thá»§y sáº£n", 12),
        ("cn-thuy-benh", "cn-lamthuy", "PhÃ²ng trá»‹ bá»‡nh thá»§y sáº£n", 12),
        ("cn-thuy-chebien", "cn-lamthuy", "Thu hoáº¡ch, báº£o quáº£n & cháº¿ biáº¿n lÃ¢m-thá»§y sáº£n", 12),
    ]
    for tid, sid, name, grade in topics:
        db.exec("INSERT OR IGNORE INTO topics (id, subject_id, name, grade) VALUES (?,?,?,?)", (tid, sid, name, grade))

    Q = [
        ("toan", "toan-hamso", 12, "váº­n dá»¥ng", "trac_nghiem", "Cho hÃ m sá»‘ y = x^3 - 3x + 1. Sá»‘ Ä‘iá»ƒm cá»±c trá»‹ cá»§a Ä‘á»“ thá»‹ hÃ m sá»‘ lÃ :", ["0", "1", "2", "3"], "C", "y' = 3x^2 - 3 = 0 â‡” x = Â±1 nÃªn cÃ³ 2 Ä‘iá»ƒm cá»±c trá»‹.", 1),
        ("toan", "toan-hamso", 12, "thÃ´ng hiá»ƒu", "trac_nghiem", "GiÃ¡ trá»‹ lá»›n nháº¥t cá»§a hÃ m sá»‘ y = -x^2 + 4x - 3 trÃªn Ä‘oáº¡n [0; 4] lÃ :", ["1", "0", "4", "-3"], "A", "Äá»‰nh parabol táº¡i x = 2, y = 1.", 1),
        ("toan", "toan-tichphan", 12, "váº­n dá»¥ng cao", "tu_luan", "TÃ­nh tÃ­ch phÃ¢n I = âˆ«(0â†’1) xÂ·e^x dx. TrÃ¬nh bÃ y tá»«ng bÆ°á»›c.", "", "I = 1 (tÃ­ch phÃ¢n tá»«ng pháº§n: u = x, dv = e^x dx).", "Äáº·t u = x, dv = e^x dx â‡’ I = [xÂ·e^x](0â†’1) - âˆ«e^x dx = e - (e - 1) = 1.", 2),
        ("toan", "toan-hinhkg", 11, "váº­n dá»¥ng", "trac_nghiem", "Cho hÃ¬nh chÃ³p S.ABCD cÃ³ Ä‘Ã¡y lÃ  hÃ¬nh vuÃ´ng cáº¡nh a, SA âŠ¥ Ä‘Ã¡y, SA = a. Thá»ƒ tÃ­ch khá»‘i chÃ³p lÃ :", ["a^3/3", "a^3", "a^3/2", "2a^3/3"], "A", "V = (1/3)Â·a^2Â·a = a^3/3.", 1),
        ("ly", "ly-dao-dong", 12, "thÃ´ng hiá»ƒu", "trac_nghiem", "Má»™t con láº¯c lÃ² xo dao Ä‘á»™ng Ä‘iá»u hÃ²a vá»›i chu kÃ¬ T. Táº§n sá»‘ gÃ³c Ï‰ báº±ng:", ["2Ï€T", "T/2Ï€", "2Ï€/T", "1/T"], "C", "Ï‰ = 2Ï€/T.", 1),
        ("ly", "ly-dien", 12, "váº­n dá»¥ng", "trac_nghiem", "Äáº·t Ä‘iá»‡n Ã¡p u = 220âˆš2Â·cos(100Ï€t) V vÃ o Ä‘iá»‡n trá»Ÿ 110 Î©. CÃ´ng suáº¥t tiÃªu thá»¥ lÃ :", ["220 W", "440 W", "110 W", "880 W"], "B", "P = UÂ²/R = 220Â²/110 = 440 W.", 1),
        ("ly", "ly-dao-dong", 12, "váº­n dá»¥ng cao", "tu_luan", "NÃªu cÃ¡ch xÃ¡c Ä‘á»‹nh gia tá»‘c trá»ng trÆ°á»ng báº±ng con láº¯c Ä‘Æ¡n trong phÃ²ng thÃ­ nghiá»‡m (dá»¥ng cá»¥, cÃ¡c bÆ°á»›c, xá»­ lÃ­ sá»‘ liá»‡u).", "", "T = 2Ï€âˆš(l/g) â‡’ g = 4Ï€Â²l/TÂ²; Ä‘o l, Ä‘o T nhiá»u láº§n rá»“i tÃ­nh trung bÃ¬nh.", "Cáº§n Ä‘o chiá»u dÃ i, Ä‘o thá»i gian 20â€“30 dao Ä‘á»™ng, láº·p láº¡i, tÃ­nh sai sá»‘.", 2),
        ("hoa", "hoa-huuco", 11, "nháº­n biáº¿t", "trac_nghiem", "Cháº¥t nÃ o sau Ä‘Ã¢y thuá»™c dÃ£y Ä‘á»“ng Ä‘áº³ng ankan?", ["C2H4", "C3H8", "C2H2", "C6H6"], "B", "Ankan cÃ³ cÃ´ng thá»©c CnH2n+2.", 1),
        ("hoa", "hoa-huuco", 11, "váº­n dá»¥ng", "tu_luan", "Viáº¿t phÆ°Æ¡ng trÃ¬nh Ä‘á»‘t chÃ¡y hoÃ n toÃ n ethanol vÃ  tÃ­nh thá»ƒ tÃ­ch CO2 (Ä‘kc) khi Ä‘á»‘t 9,2 g ethanol.", "", "C2H5OH + 3O2 â†’ 2CO2 + 3H2O; n = 0,2 mol â‡’ V(CO2) â‰ˆ 9,916 L (Ä‘kc).", "CÃ¢n báº±ng PTHH, tÃ­nh mol rá»“i suy ra thá»ƒ tÃ­ch khÃ­.", 2),
        ("van", "van-nghiluan", 12, "váº­n dá»¥ng", "tu_luan", "PhÃ¢n tÃ­ch hÃ¬nh tÆ°á»£ng ngÆ°á»i lÃ¡i Ä‘Ã² trong tÃ¹y bÃºt 'NgÆ°á»i lÃ¡i Ä‘Ã² SÃ´ng ÄÃ ' (Nguyá»…n TuÃ¢n). Láº­p dÃ n Ã½ chi tiáº¿t.", "", "DÃ n Ã½: má»Ÿ bÃ i â€“ thÃ¢n bÃ i (váº» Ä‘áº¹p hung báº¡o/trá»¯ tÃ¬nh cá»§a sÃ´ng ÄÃ ; váº» Ä‘áº¹p tÃ i hoa, trÃ­ dÅ©ng cá»§a Ã´ng lÃ¡i Ä‘Ã²) â€“ káº¿t bÃ i.", "Cháº¥m theo bá»‘ cá»¥c, dáº«n chá»©ng, lÃ­ láº½ vÃ  diá»…n Ä‘áº¡t; tá»± Ä‘á»‘i chiáº¿u vá»›i Ä‘Ã¡p Ã¡n.", 3),
        ("anh", "anh-nguphap", 12, "váº­n dá»¥ng", "trac_nghiem", "Choose the best answer: By the time we arrived, the competition _____.", ["has started", "had started", "starts", "will start"], "B", "HÃ nh Ä‘á»™ng xáº£y ra trÆ°á»›c má»™t má»‘c trong quÃ¡ khá»© â†’ past perfect.", 1),
        ("anh", "anh-nguphap", 12, "thÃ´ng hiá»ƒu", "trac_nghiem", "The proposal was approved _____ a majority vote.", ["with", "by", "for", "in"], "B", "'by a majority vote' lÃ  cá»¥m cá»‘ Ä‘á»‹nh.", 1),
        # --- Máº«u CÃ´ng nghá»‡ NÃ´ng nghiá»‡p (HSG/Ä‘á»™i tuyá»ƒn) ---
        ("cn-nong", "cn-nong-dattrong", 10, "thÃ´ng hiá»ƒu", "trac_nghiem", "Keo Ä‘áº¥t cÃ³ vai trÃ² quan trá»ng nháº¥t nÃ o Ä‘á»‘i vá»›i dinh dÆ°á»¡ng cÃ¢y trá»“ng?", ["Giá»¯ nÆ°á»›c cÆ¡ há»c", "Háº¥p phá»¥ vÃ  trao Ä‘á»•i cation (CEC), giá»¯ dinh dÆ°á»¡ng", "Táº¡o mÃ u cho Ä‘áº¥t", "Diá»‡t vi sinh váº­t"], "B", "Keo Ä‘áº¥t quyáº¿t Ä‘á»‹nh kháº£ nÄƒng háº¥p phá»¥ â€“ trao Ä‘á»•i ion, giá»¯ dinh dÆ°á»¡ng chá»‘ng rá»­a trÃ´i.", 1),
        ("cn-nong", "cn-nong-phanbon", 11, "váº­n dá»¥ng", "trac_nghiem", "Ruá»™ng lÃºa thiáº¿u Ä‘áº¡m (N) thÆ°á»ng biá»ƒu hiá»‡n trÆ°á»›c tiÃªn á»Ÿ:", ["LÃ¡ giÃ  vÃ ng tá»« chÃ³p vÃ  mÃ©p lÃ¡ lan dáº§n", "Äá»‘m nÃ¢u trÃªn lÃ¡ non", "Thá»‘i rá»…", "Cong lÃ¡ non"], "A", "N linh Ä‘á»™ng nÃªn triá»‡u chá»©ng thiáº¿u hiá»‡n á»Ÿ lÃ¡ giÃ  trÆ°á»›c: vÃ ng Ãºa tá»« chÃ³p/mÃ©p.", 1),
        ("cn-nong", "cn-nong-giong", 11, "váº­n dá»¥ng", "tu_luan", "So sÃ¡nh Æ°u â€“ nhÆ°á»£c Ä‘iá»ƒm cá»§a nhÃ¢n giá»‘ng vÃ´ tÃ­nh (giÃ¢m, chiáº¿t, ghÃ©p) vá»›i gieo háº¡t trong sáº£n xuáº¥t cÃ¢y Äƒn quáº£. NÃªu 1 vÃ­ dá»¥ Ä‘á»™i tuyá»ƒn hay gáº·p.", "", "VÃ´ tÃ­nh: giá»¯ nguyÃªn Ä‘áº·c tÃ­nh máº¹, ra quáº£ sá»›m, Ä‘á»“ng Ä‘á»u; nhÆ°á»£c: bá»™ rá»… yáº¿u hÆ¡n, lÃ¢y bá»‡nh há»‡ thá»‘ng, thoÃ¡i hÃ³a náº¿u láº¡m dá»¥ng. VÃ­ dá»¥: ghÃ©p xoÃ i, chiáº¿t bÆ°á»Ÿi.", "Cháº¥m theo 3 Ã½: giá»¯ kiá»ƒu gen â€“ thá»i gian cho quáº£ â€“ rá»§i ro dá»‹ch bá»‡nh/bá»™ rá»…. Tá»± Ä‘á»‘i chiáº¿u.", 2),
        ("cn-nong", "cn-nong-bvtv", 12, "váº­n dá»¥ng cao", "tu_luan", "TrÃ¬nh bÃ y nguyÃªn táº¯c IPM (quáº£n lÃ½ dá»‹ch háº¡i tá»•ng há»£p) trÃªn lÃºa. Láº­p sÆ¡ Ä‘á»“ cÃ¡c biá»‡n phÃ¡p tá»« canh tÃ¡c â€“ sinh há»c â€“ hÃ³a há»c, nÃªu ngÆ°á»¡ng phÃ²ng trá»«.", "", "IPM: phÃ²ng lÃ  chÃ­nh (giá»‘ng khÃ¡ng, vá»‡ sinh Ä‘á»“ng, luÃ¢n canh), theo dÃµi báº«y + ngÆ°á»¡ng, Æ°u tiÃªn sinh há»c/tháº£o má»™c, hÃ³a há»c lÃ  cuá»‘i cÃ¹ng â€“ Ä‘Ãºng thuá»‘c, Ä‘Ãºng lÃºc, Ä‘Ãºng liá»u.", "Barem HSG: 0,5Ä‘ nguyÃªn táº¯c + 1Ä‘ nhÃ³m biá»‡n phÃ¡p + 0,5Ä‘ ngÆ°á»¡ng/vÃ­ dá»¥ (ráº§y nÃ¢u, Ä‘áº¡o Ã´n).", 3),
        ("cn-nong", "cn-nong-cncao", 12, "váº­n dá»¥ng", "trac_nghiem", "Æ¯u Ä‘iá»ƒm lá»›n nháº¥t cá»§a tÆ°á»›i nhá» giá»t káº¿t há»£p cáº£m biáº¿n áº©m trong nhÃ  mÃ ng lÃ :", ["TÄƒng cÃ´ng lao Ä‘á»™ng", "Tiáº¿t kiá»‡m nÆ°á»›c â€“ phÃ¢n, á»•n Ä‘á»‹nh áº©m vÃ¹ng rá»…", "TÄƒng cá» dáº¡i", "KhÃ´ng cáº§n Ä‘iá»‡n"], "B", "TÆ°á»›i nhá» giá»t + cáº£m biáº¿n giÃºp tiáº¿t kiá»‡m 30â€“60% nÆ°á»›c, Ä‘Æ°a phÃ¢n theo nÆ°á»›c (fertigation).", 1),
        # --- Máº«u ChÄƒn nuÃ´i ---
        ("cn-chan", "cn-chan-giong", 11, "thÃ´ng hiá»ƒu", "trac_nghiem", "Chá»‰ tiÃªu quan trá»ng nháº¥t khi chá»n lá»£n nÃ¡i háº­u bá»‹ cho Ä‘á»™i giá»‘ng lÃ :", ["MÃ u lÃ´ng Ä‘áº¹p", "Ngoáº¡i hÃ¬nh cÃ¢n Ä‘á»‘i, vÃº Ä‘á»u, lÃ½ lá»‹ch sinh sáº£n tá»‘t", "Ä‚n nhiá»u", "KÃªu to"], "B", "Chá»n theo ngoáº¡i hÃ¬nh + nÄƒng suáº¥t bá»‘ máº¹ + sá»‘ vÃº, khoáº£ng cÃ¡ch vÃº.", 1),
        ("cn-chan", "cn-chan-thucan", 11, "váº­n dá»¥ng", "trac_nghiem", "Protein thÃ´ trong kháº©u pháº§n gÃ  Ä‘áº» cáº§n cao hÆ¡n gÃ  thá»‹t giai Ä‘oáº¡n vá»— bÃ©o vÃ¬:", ["Äá»ƒ tÄƒng má»¡", "Äá»ƒ táº¡o trá»©ng (lÃ²ng tráº¯ng) vÃ  duy trÃ¬ Ä‘áº»", "Äá»ƒ giáº£m Ä‘áº»", "Äá»ƒ tÄƒng nÆ°á»›c uá»‘ng"], "B", "GÃ  Ä‘áº» cáº§n ~16â€“18% protein Ä‘á»ƒ táº¡o trá»©ng.", 1),
        ("cn-chan", "cn-chan-thuy", 12, "váº­n dá»¥ng cao", "tu_luan", "Láº­p quy trÃ¬nh an toÃ n sinh há»c (ATSH) cho tráº¡i gÃ  5000 con phÃ²ng cÃºm gia cáº§m: tá»« cá»•ng â€“ chuá»“ng â€“ con ngÆ°á»i â€“ xá»­ lÃ½ cháº¥t tháº£i.", "", "ATSH 4 lá»›p: cÃ¡ch ly (hÃ ng rÃ o, há»‘ sÃ¡t trÃ¹ng, all-in/all-out) â€“ vá»‡ sinh (phun, thay quáº§n Ã¡o) â€“ vaccine + giÃ¡m sÃ¡t â€“ xá»­ lÃ½ phÃ¢n/xÃ¡c Ä‘Ãºng (á»§, Ä‘á»‘t/chÃ´n).", "Barem: má»—i lá»›p 0,5â€“0,75Ä‘ + vÃ­ dá»¥ lá»‹ch vaccine.", 3),
        ("cn-chan", "cn-chan-chuong", 11, "váº­n dá»¥ng", "tu_luan", "NÃªu yÃªu cáº§u tiá»ƒu khÃ­ háº­u chuá»“ng bÃ² sá»¯a (nhiá»‡t Ä‘á»™, áº©m, thÃ´ng thoÃ¡ng, ná»n) vÃ  cÃ¡ch chá»‘ng nÃ³ng áº©m á»Ÿ miá»n Báº¯c.", "", "18â€“25Â°C, áº©m 60â€“75%, thoÃ¡ng, ná»n khÃ´ â€“ dá»‘c 2â€“3%. Chá»‘ng nÃ³ng: mÃ¡i cao, phun sÆ°Æ¡ng + quáº¡t, trá»“ng cÃ¢y, máº­t Ä‘á»™ há»£p lÃ½.", "Cháº¥m theo 4 yáº¿u tá»‘ + 2 giáº£i phÃ¡p chá»‘ng nÃ³ng.", 2),
        # --- Máº«u LÃ¢m nghiá»‡p â€“ Thá»§y sáº£n ---
        ("cn-lamthuy", "cn-lam-rung", 11, "thÃ´ng hiá»ƒu", "trac_nghiem", "Ká»¹ thuáº­t táº¡o cÃ¢y con báº±ng báº§u Ä‘áº¥t trong lÃ¢m nghiá»‡p nháº±m:", ["Giáº£m tá»‰ lá»‡ sá»‘ng", "Báº£o vá»‡ bá»™ rá»…, nÃ¢ng tá»‰ lá»‡ sá»‘ng khi trá»“ng rá»«ng", "TÄƒng sÃ¢u bá»‡nh", "KhÃ´ng cáº§n chÄƒm sÃ³c"], "B", "Báº§u giÃºp rá»… nguyÃªn váº¹n, cÃ¢y há»“i xanh nhanh.", 1),
        ("cn-lamthuy", "cn-lam-quanly", 12, "váº­n dá»¥ng", "tu_luan", "NÃªu vai trÃ² cá»§a rá»«ng phÃ²ng há»™ Ä‘áº§u nguá»“n vÃ  Ä‘á» xuáº¥t 3 giáº£i phÃ¡p quáº£n lÃ½ bá»n vá»¯ng á»Ÿ Ä‘á»‹a phÆ°Æ¡ng em.", "", "Cháº¯n lÅ©, giá»¯ nÆ°á»›c, chá»‘ng xÃ³i mÃ²n, Ä‘a dáº¡ng sinh há»c. Giáº£i phÃ¡p: giao Ä‘áº¥t rá»«ng + chi tráº£ DVMTR, tuáº§n tra cá»™ng Ä‘á»“ng, trá»“ng rá»«ng há»—n loÃ i.", "0,75Ä‘ vai trÃ² + 1,25Ä‘ giáº£i phÃ¡p thá»±c táº¿.", 2),
        ("cn-lamthuy", "cn-thuy-nuoi", 12, "váº­n dá»¥ng", "trac_nghiem", "Yáº¿u tá»‘ nÆ°á»›c quan trá»ng nháº¥t pháº£i kiá»ƒm tra má»—i sÃ¡ng trong ao nuÃ´i tÃ´m thÃ¢m canh lÃ :", ["MÃ u quáº§n Ã¡o cÃ´ng nhÃ¢n", "Oxy hÃ²a tan (DO), pH, NH3/khÃ­ Ä‘á»™c", "Tiáº¿ng quáº¡t", "GiÃ¡ tÃ´m"], "B", "DO sÃ¡ng sá»›m tháº¥p nháº¥t; NH3/NO2 gÃ¢y Ä‘á»™c sau cho Äƒn.", 1),
        ("cn-lamthuy", "cn-thuy-benh", 12, "váº­n dá»¥ng cao", "tu_luan", "TrÃ¬nh bÃ y quy trÃ¬nh phÃ²ng bá»‡nh tá»•ng há»£p cho cÃ¡ rÃ´ phi nuÃ´i lá»“ng: tá»« con giá»‘ng â€“ máº­t Ä‘á»™ â€“ thá»©c Äƒn â€“ xá»­ lÃ½ nÆ°á»›c â€“ vaccine/hÃ³a cháº¥t.", "", "Giá»‘ng sáº¡ch kiá»ƒm dá»‹ch â€“ máº­t Ä‘á»™ há»£p lÃ½ â€“ Äƒn Ä‘Ãºng, khÃ´ng thá»«a â€“ treo tÃºi vÃ´i/thuá»‘c Ä‘á»‹nh ká»³ â€“ táº¯m muá»‘i/KMnO4 khi váº­n chuyá»ƒn â€“ cÃ¡ch ly cÃ¡ bá»‡nh.", "Cháº¥m theo chuá»—i phÃ²ng > trá»‹; nÃªu Ä‘Æ°á»£c 5 máº¯t xÃ­ch.", 3),
    ]
    for s, t, g, d, qt, content, opts, ans, exp, score in Q:
        db.exec(
            "INSERT INTO questions (subject_id, topic_id, grade, difficulty, qtype, content, options, correct_answer, explanation, score, source, image_url, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
            (s, t, g, d, qt, content, json.dumps(opts, ensure_ascii=False) if isinstance(opts, list) else "[]",
             ans if isinstance(ans, str) else "", exp, score, "máº«u", "", now),
        )
    print(f"[seed] loaded {len(Q)} sample questions.", flush=True)


CN_SUBJECTS = [
    ("cn-nong", "CÃ´ng nghá»‡ NÃ´ng nghiá»‡p", "CN-NN"),
    ("cn-chan", "CÃ´ng nghá»‡ ChÄƒn nuÃ´i", "CN-CN"),
    ("cn-lamthuy", "CÃ´ng nghá»‡ LÃ¢m nghiá»‡p â€“ Thá»§y sáº£n", "CN-LTS"),
]

CN_TOPICS = [
    ("cn-nong-dattrong", "cn-nong", "Äáº¥t trá»“ng & giÃ¡ thá»ƒ", 10),
    ("cn-nong-phanbon", "cn-nong", "PhÃ¢n bÃ³n & dinh dÆ°á»¡ng cÃ¢y trá»“ng", 11),
    ("cn-nong-giong", "cn-nong", "Giá»‘ng cÃ¢y trá»“ng & nhÃ¢n giá»‘ng", 11),
    ("cn-nong-bvtv", "cn-nong", "Báº£o vá»‡ thá»±c váº­t & dá»‹ch háº¡i", 12),
    ("cn-nong-cncao", "cn-nong", "NÃ´ng nghiá»‡p cÃ´ng nghá»‡ cao", 12),
    ("cn-nong-baoquan", "cn-nong", "Thu hoáº¡ch, báº£o quáº£n & cháº¿ biáº¿n", 12),
    ("cn-chan-giong", "cn-chan", "Giá»‘ng váº­t nuÃ´i", 11),
    ("cn-chan-thucan", "cn-chan", "Thá»©c Äƒn & dinh dÆ°á»¡ng váº­t nuÃ´i", 11),
    ("cn-chan-chuong", "cn-chan", "Chuá»“ng tráº¡i & mÃ´i trÆ°á»ng", 11),
    ("cn-chan-thuy", "cn-chan", "ThÃº y & phÃ²ng trá»‹ bá»‡nh", 12),
    ("cn-chan-cncao", "cn-chan", "ChÄƒn nuÃ´i cÃ´ng nghá»‡ cao & ATSH", 12),
    ("cn-chan-chebien", "cn-chan", "Thu hoáº¡ch, báº£o quáº£n & cháº¿ biáº¿n SP chÄƒn nuÃ´i", 12),
    ("cn-lam-rung", "cn-lamthuy", "Giá»‘ng cÃ¢y rá»«ng & trá»“ng rá»«ng", 11),
    ("cn-lam-quanly", "cn-lamthuy", "Quáº£n lÃ½, báº£o vá»‡ rá»«ng & mÃ´i trÆ°á»ng", 12),
    ("cn-thuy-giong", "cn-lamthuy", "Giá»‘ng & thá»©c Äƒn thá»§y sáº£n", 11),
    ("cn-thuy-nuoi", "cn-lamthuy", "Ká»¹ thuáº­t nuÃ´i trá»“ng thá»§y sáº£n", 12),
    ("cn-thuy-benh", "cn-lamthuy", "PhÃ²ng trá»‹ bá»‡nh thá»§y sáº£n", 12),
    ("cn-thuy-chebien", "cn-lamthuy", "Thu hoáº¡ch, báº£o quáº£n & cháº¿ biáº¿n lÃ¢m-thá»§y sáº£n", 12),
]


def ensure_cn_seed(db: DB):
    """DB cÅ© Ä‘Ã£ cÃ³ dá»¯ liá»‡u: chá»‰ bá»• sung 3 mÃ´n CN + topics, khÃ´ng xÃ³a gÃ¬.
    Chá»‰ chÃ¨n cÃ¢u há»i máº«u CN náº¿u chÆ°a cÃ³ cÃ¢u nÃ o thuá»™c 3 mÃ´n nÃ y."""
    for sid, name, code in CN_SUBJECTS:
        db.exec("INSERT OR IGNORE INTO subjects (id, name, code) VALUES (?,?,?)", (sid, name, code))
    for tid, sid, name, grade in CN_TOPICS:
        db.exec("INSERT OR IGNORE INTO topics (id, subject_id, name, grade) VALUES (?,?,?,?)", (tid, sid, name, grade))
    row = db.q1("SELECT COUNT(*) c FROM questions WHERE subject_id IN ('cn-nong','cn-chan','cn-lamthuy')")
    if row and row["c"] > 0:
        return
    now = datetime.now().isoformat(timespec="seconds")
    samples = [
        ("cn-nong", "cn-nong-dattrong", 10, "thÃ´ng hiá»ƒu", "trac_nghiem", "Keo Ä‘áº¥t cÃ³ vai trÃ² quan trá»ng nháº¥t nÃ o Ä‘á»‘i vá»›i dinh dÆ°á»¡ng cÃ¢y trá»“ng?", ["Giá»¯ nÆ°á»›c cÆ¡ há»c", "Háº¥p phá»¥ vÃ  trao Ä‘á»•i cation (CEC), giá»¯ dinh dÆ°á»¡ng", "Táº¡o mÃ u cho Ä‘áº¥t", "Diá»‡t vi sinh váº­t"], "B", "Keo Ä‘áº¥t quyáº¿t Ä‘á»‹nh kháº£ nÄƒng háº¥p phá»¥ â€“ trao Ä‘á»•i ion.", 1),
        ("cn-nong", "cn-nong-phanbon", 11, "váº­n dá»¥ng", "trac_nghiem", "Ruá»™ng lÃºa thiáº¿u Ä‘áº¡m (N) thÆ°á»ng biá»ƒu hiá»‡n trÆ°á»›c tiÃªn á»Ÿ:", ["LÃ¡ giÃ  vÃ ng tá»« chÃ³p vÃ  mÃ©p lÃ¡ lan dáº§n", "Äá»‘m nÃ¢u trÃªn lÃ¡ non", "Thá»‘i rá»…", "Cong lÃ¡ non"], "A", "N linh Ä‘á»™ng nÃªn thiáº¿u hiá»‡n á»Ÿ lÃ¡ giÃ  trÆ°á»›c.", 1),
        ("cn-nong", "cn-nong-bvtv", 12, "váº­n dá»¥ng cao", "tu_luan", "TrÃ¬nh bÃ y nguyÃªn táº¯c IPM trÃªn lÃºa vÃ  láº­p sÆ¡ Ä‘á»“ cÃ¡c biá»‡n phÃ¡p.", "", "IPM: phÃ²ng lÃ  chÃ­nh, ngÆ°á»¡ng phÃ²ng trá»«, Æ°u tiÃªn sinh há»c, hÃ³a há»c cuá»‘i cÃ¹ng.", "Barem HSG: nguyÃªn táº¯c + nhÃ³m biá»‡n phÃ¡p + ngÆ°á»¡ng.", 3),
        ("cn-chan", "cn-chan-giong", 11, "thÃ´ng hiá»ƒu", "trac_nghiem", "Chá»‰ tiÃªu quan trá»ng nháº¥t khi chá»n lá»£n nÃ¡i háº­u bá»‹ lÃ :", ["MÃ u lÃ´ng Ä‘áº¹p", "Ngoáº¡i hÃ¬nh cÃ¢n Ä‘á»‘i, vÃº Ä‘á»u, lÃ½ lá»‹ch sinh sáº£n tá»‘t", "Ä‚n nhiá»u", "KÃªu to"], "B", "Chá»n theo ngoáº¡i hÃ¬nh + nÄƒng suáº¥t bá»‘ máº¹.", 1),
        ("cn-chan", "cn-chan-thuy", 12, "váº­n dá»¥ng cao", "tu_luan", "Láº­p quy trÃ¬nh an toÃ n sinh há»c cho tráº¡i gÃ  5000 con phÃ²ng cÃºm gia cáº§m.", "", "ATSH 4 lá»›p: cÃ¡ch ly â€“ vá»‡ sinh â€“ vaccine + giÃ¡m sÃ¡t â€“ xá»­ lÃ½ cháº¥t tháº£i.", "Má»—i lá»›p 0,5â€“0,75Ä‘.", 3),
        ("cn-lamthuy", "cn-thuy-nuoi", 12, "váº­n dá»¥ng", "trac_nghiem", "Yáº¿u tá»‘ nÆ°á»›c quan trá»ng nháº¥t pháº£i kiá»ƒm tra má»—i sÃ¡ng trong ao tÃ´m thÃ¢m canh lÃ :", ["MÃ u quáº§n Ã¡o cÃ´ng nhÃ¢n", "Oxy hÃ²a tan (DO), pH, NH3/khÃ­ Ä‘á»™c", "Tiáº¿ng quáº¡t", "GiÃ¡ tÃ´m"], "B", "DO sÃ¡ng sá»›m tháº¥p nháº¥t; NH3 gÃ¢y Ä‘á»™c.", 1),
        ("cn-lamthuy", "cn-thuy-benh", 12, "váº­n dá»¥ng cao", "tu_luan", "TrÃ¬nh bÃ y quy trÃ¬nh phÃ²ng bá»‡nh tá»•ng há»£p cho cÃ¡ rÃ´ phi nuÃ´i lá»“ng.", "", "Giá»‘ng sáº¡ch â€“ máº­t Ä‘á»™ há»£p lÃ½ â€“ Äƒn Ä‘Ãºng â€“ xá»­ lÃ½ nÆ°á»›c â€“ cÃ¡ch ly cÃ¡ bá»‡nh.", "Cháº¥m theo chuá»—i phÃ²ng > trá»‹.", 3),
    ]
    for s, t, g, d, qt, content, opts, ans, exp, score in samples:
        db.exec(
            "INSERT INTO questions (subject_id, topic_id, grade, difficulty, qtype, content, options, correct_answer, explanation, score, source, image_url, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
            (s, t, g, d, qt, content, json.dumps(opts, ensure_ascii=False) if isinstance(opts, list) else "[]",
             ans if isinstance(ans, str) else "", exp, score, "máº«u-cn", "", now),
        )
    print(f"[seed] added {len(samples)} CN sample questions to existing DB.", flush=True)


# ---------- Import parsing ----------
OPT_RE = re.compile(r"^\s*([A-Da-d])[\.\)\:\-â€“]\s*(.+)$")
ANSWER_RE = re.compile(r"(?:Ä‘Ã¡p\s*Ã¡n|dap\s*an|answer|key)\s*[:\-â€“]?\s*([A-Da-d])", re.IGNORECASE)
SPLIT_RE = re.compile(r"(?:^|\n)\s*(CÃ¢u\s+\d+\s*[\.\:\-\)]?)", re.IGNORECASE)
EXPL_RE = re.compile(r"(lá»i\s*giáº£i|hÆ°á»›ng\s*dáº«n|giáº£i\s*thÃ­ch|solution)\s*[:\-â€“]?", re.IGNORECASE)

def parse_text_to_drafts(text: str):
    text = (text or "").replace("\r\n", "\n").strip()
    if not text:
        return []
    parts = SPLIT_RE.split(text)
    # parts: ['', 'CÃ¢u 1:', ' ná»™i dung...', 'CÃ¢u 2:', ' ...']
    chunks = []
    if len(parts) >= 3:
        for i in range(1, len(parts), 2):
            head = parts[i].strip()
            body = parts[i + 1] if i + 1 < len(parts) else ""
            chunks.append((head + " " + body.strip()).strip())
    else:
        # fallback: tÃ¡ch theo dÃ²ng trá»‘ng dÃ i
        chunks = [c.strip() for c in re.split(r"\n\s*\n", text) if c.strip()]
    drafts = []
    for ch in chunks:
        lines = [ln.rstrip() for ln in ch.split("\n")]
        options, content_lines, answer, expl = [], [], "", ""
        in_expl = False
        expl_lines = []
        for ln in lines:
            if EXPL_RE.search(ln):
                in_expl = True
                expl_lines.append(EXPL_RE.sub("", ln).strip())
                continue
            if in_expl:
                expl_lines.append(ln)
                continue
            m = OPT_RE.match(ln.strip())
            if m:
                options.append(m.group(2).strip())
                # Ä‘Ã¡p Ã¡n cÃ³ thá»ƒ náº±m cÃ¹ng dÃ²ng phÆ°Æ¡ng Ã¡n
                am = ANSWER_RE.search(ln)
                if am and not answer:
                    answer = am.group(1).upper()
                continue
            am = ANSWER_RE.search(ln)
            if am and not answer:
                answer = am.group(1).upper()
                # bá» dÃ²ng Ä‘Ã¡p Ã¡n khá»i ná»™i dung
                rest = ANSWER_RE.sub("", ln).strip(" :-â€“")
                if rest:
                    content_lines.append(rest)
                continue
            content_lines.append(ln)
        content = "\n".join(content_lines).strip()
        content = re.sub(r"^(CÃ¢u\s+\d+\s*[\.\:\-\)]?)\s*", "", content, flags=re.IGNORECASE).strip()
        explanation = "\n".join(expl_lines).strip()
        if len(options) >= 2:
            qtype = "trac_nghiem"
            options = (options + ["", "", "", ""])[:4]
        else:
            qtype = "tu_luan"
            options = []
            if not answer:
                # vá»›i tá»± luáº­n, pháº§n sau "ÄÃ¡p Ã¡n:" Ä‘Ã£ bá»‹ tÃ¡ch; thá»­ láº¥y dÃ²ng cuá»‘i lÃ m gá»£i Ã½
                answer = ""
        if not content:
            continue
        drafts.append({
            "content": content[:2000],
            "options": options,
            "correct_answer": answer,
            "explanation": explanation,
            "qtype": qtype,
            "difficulty": "váº­n dá»¥ng",
        })
    return drafts


def extract_file_text(filename: str, data: bytes) -> str:
    name = (filename or "").lower()
    if name.endswith(".txt"):
        for enc in ("utf-8", "utf-8-sig", "cp1258", "latin-1"):
            try:
                return data.decode(enc)
            except Exception:
                continue
        return data.decode("utf-8", errors="ignore")
    if name.endswith(".docx"):
        from docx import Document
        import io
        doc = Document(io.BytesIO(data))
        paras = [p.text for p in doc.paragraphs]
        # kÃ¨m báº£ng
        for tb in doc.tables:
            for row in tb.rows:
                paras.append(" | ".join(c.text for c in row.cells))
        return "\n".join(paras)
    if name.endswith(".pdf"):
        from pypdf import PdfReader
        import io
        reader = PdfReader(io.BytesIO(data))
        texts = []
        for page in reader.pages:
            try:
                texts.append(page.extract_text() or "")
            except Exception:
                texts.append("")
        full = "\n".join(texts).strip()
        if len(full) < 20:
            raise ValueError("PDF khÃ´ng cÃ³ lá»›p chá»¯ (cÃ³ thá»ƒ lÃ  file scan). Báº£n Ä‘áº§u chÆ°a há»— trá»£ OCR â€” hÃ£y dÃ¹ng file DOCX/PDF text.")
        return full
    raise ValueError("Äá»‹nh dáº¡ng chÆ°a há»— trá»£. HÃ£y dÃ¹ng .docx, .pdf (cÃ³ text) hoáº·c .txt.")


# ---------- API ----------
app = FastAPI(title="OnLuyen HSG Core")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], allow_credentials=True,
    allow_methods=["*"], allow_headers=["*"],
)
db: Optional[DB] = None


class QuestionIn(BaseModel):
    subject_id: str
    topic_id: Optional[str] = None
    grade: int = 12
    difficulty: str = "váº­n dá»¥ng"
    qtype: str = "trac_nghiem"
    content: str
    options: list = []
    correct_answer: str = ""
    explanation: str = ""
    score: float = 1
    image_url: str = ""


class StudentIn(BaseModel):
    name: str
    class_name: str = ""
    team: str = ""
    note: str = ""


class TopicIn(BaseModel):
    id: Optional[str] = None
    subject_id: str
    name: str
    grade: int = 12


class BulkIn(BaseModel):
    items: list


class ExamIn(BaseModel):
    title: str = "Äá»"
    mode: str = "practice"
    duration_min: int = 45
    question_ids: list = []


class SubmitIn(BaseModel):
    answers: list = []
    student_name: str = ""
    focus_exits: int = 0
    focus_log: list = []


class PreviewIn(BaseModel):
    text: str = ""


def row_to_q(r):
    subj = db.q1("SELECT name FROM subjects WHERE id=?", (r["subject_id"],))
    topic = db.q1("SELECT name FROM topics WHERE id=?", (r["topic_id"],)) if r["topic_id"] else None
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


@app.get("/api/health")
def health():
    return {"status": "ok", "time": datetime.now().isoformat(timespec="seconds"),
            "db": db.path if db else None, "total_questions": db.count("questions") if db else 0}


@app.get("/api/subjects")
def subjects():
    return [dict(r) for r in db.q("SELECT * FROM subjects ORDER BY name")]


@app.get("/api/topics")
def topics(subject_id: Optional[str] = None):
    if subject_id:
        return [dict(r) for r in db.q("SELECT * FROM topics WHERE subject_id=? ORDER BY name", (subject_id,))]
    return [dict(r) for r in db.q("SELECT * FROM topics ORDER BY name")]


@app.post("/api/topics")
def create_topic(payload: TopicIn):
    if not payload.name.strip():
        raise HTTPException(400, "Thiáº¿u tÃªn chuyÃªn Ä‘á»")
    if not db.q1("SELECT 1 FROM subjects WHERE id=?", (payload.subject_id,)):
        raise HTTPException(400, "MÃ´n khÃ´ng tá»“n táº¡i")
    import uuid
    tid = (payload.id or "").strip() or f"t-{uuid.uuid4().hex[:8]}"
    if db.q1("SELECT 1 FROM topics WHERE id=?", (tid,)):
        raise HTTPException(400, "MÃ£ chuyÃªn Ä‘á» Ä‘Ã£ tá»“n táº¡i")
    db.exec("INSERT INTO topics (id, subject_id, name, grade) VALUES (?,?,?,?)",
            (tid, payload.subject_id, payload.name.strip()[:200], int(payload.grade or 12)))
    return {"id": tid}


@app.get("/api/students")
def list_students(team: Optional[str] = None, search: Optional[str] = None):
    sql = "SELECT * FROM students WHERE 1=1"
    params = []
    if team:
        sql += " AND team=?"; params.append(team)
    if search:
        sql += " AND name LIKE ?"; params.append(f"%{search}%")
    sql += " ORDER BY team, name LIMIT 500"
    return [dict(r) for r in db.q(sql, tuple(params))]


@app.post("/api/students")
def create_student(payload: StudentIn):
    if not payload.name.strip():
        raise HTTPException(400, "Thiáº¿u tÃªn há»c sinh")
    now = datetime.now().isoformat(timespec="seconds")
    cur = db.exec("INSERT INTO students (name, class_name, team, note, created_at) VALUES (?,?,?,?,?)",
                  (payload.name.strip()[:100], (payload.class_name or "").strip()[:50],
                   (payload.team or "").strip()[:50], (payload.note or "").strip()[:500], now))
    return {"id": cur.lastrowid}


@app.put("/api/students/{sid}")
def update_student(sid: int, payload: StudentIn):
    r = db.q1("SELECT * FROM students WHERE id=?", (sid,))
    if not r: raise HTTPException(404, "KhÃ´ng tÃ¬m tháº¥y há»c sinh")
    db.exec("UPDATE students SET name=?, class_name=?, team=?, note=? WHERE id=?",
            (payload.name.strip()[:100], (payload.class_name or "").strip()[:50],
             (payload.team or "").strip()[:50], (payload.note or "").strip()[:500], sid))
    return {"ok": True}


@app.delete("/api/students/{sid}")
def delete_student(sid: int):
    db.exec("DELETE FROM students WHERE id=?", (sid,))
    return {"ok": True}


@app.get("/api/questions")
def list_questions(subject_id: Optional[str] = None, topic_id: Optional[str] = None,
                    grade: Optional[str] = None, difficulty: Optional[str] = None,
                    qtype: Optional[str] = None, search: Optional[str] = None, limit: int = 200):
    sql = "SELECT * FROM questions WHERE 1=1"
    params = []
    if subject_id: sql += " AND subject_id=?"; params.append(subject_id)
    if topic_id: sql += " AND topic_id=?"; params.append(topic_id)
    if grade: sql += " AND grade=?"; params.append(int(grade))
    if difficulty: sql += " AND difficulty=?"; params.append(difficulty)
    if qtype: sql += " AND qtype=?"; params.append(qtype)
    if search: sql += " AND content LIKE ?"; params.append(f"%{search}%")
    sql += " ORDER BY id DESC LIMIT ?"
    params.append(max(1, min(limit, 500)))
    return [row_to_q(r) for r in db.q(sql, tuple(params))]


@app.post("/api/questions")
def create_question(payload: QuestionIn):
    if payload.subject_id and not db.q1("SELECT 1 FROM subjects WHERE id=?", (payload.subject_id,)):
        raise HTTPException(400, "MÃ´n khÃ´ng tá»“n táº¡i")
    now = datetime.now().isoformat(timespec="seconds")
    cur = db.exec(
        "INSERT INTO questions (subject_id, topic_id, grade, difficulty, qtype, content, options, correct_answer, explanation, score, source, image_url, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
        (payload.subject_id, payload.topic_id, payload.grade, payload.difficulty, payload.qtype,
         payload.content.strip(), json.dumps(payload.options or [], ensure_ascii=False),
         (payload.correct_answer or "").strip(), payload.explanation or "", payload.score, "thá»§ cÃ´ng",
         (payload.image_url or "").strip()[:2000], now))
    return {"id": cur.lastrowid}


@app.post("/api/questions/bulk")
def bulk(payload: BulkIn):
    now = datetime.now().isoformat(timespec="seconds")
    n = 0
    for it in payload.items or []:
        if not (it.get("content") or "").strip() or not it.get("subject_id"):
            continue
        db.exec(
            "INSERT INTO questions (subject_id, topic_id, grade, difficulty, qtype, content, options, correct_answer, explanation, score, source, image_url, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
            (it.get("subject_id"), it.get("topic_id"), int(it.get("grade") or 12),
             it.get("difficulty") or "váº­n dá»¥ng", it.get("qtype") or "trac_nghiem",
             it.get("content", "").strip(), json.dumps(it.get("options") or [], ensure_ascii=False),
             (it.get("correct_answer") or "").strip(), it.get("explanation") or "", float(it.get("score") or 1), "nháº­p Ä‘á»",
             (it.get("image_url") or "").strip()[:2000] if isinstance(it.get("image_url"), str) else "", now))
        n += 1
    return {"inserted": n}


@app.put("/api/questions/{qid}")
def update_question(qid: int, payload: QuestionIn):
    r = db.q1("SELECT * FROM questions WHERE id=?", (qid,))
    if not r: raise HTTPException(404, "KhÃ´ng tÃ¬m tháº¥y cÃ¢u há»i")
    db.exec("UPDATE questions SET subject_id=?, topic_id=?, grade=?, difficulty=?, qtype=?, content=?, options=?, correct_answer=?, explanation=?, score=?, image_url=? WHERE id=?",
            (payload.subject_id, payload.topic_id, payload.grade, payload.difficulty, payload.qtype,
             payload.content.strip(), json.dumps(payload.options or [], ensure_ascii=False),
             (payload.correct_answer or "").strip(), payload.explanation or "", payload.score,
             (payload.image_url or "").strip()[:2000], qid))
    return {"ok": True}


@app.delete("/api/questions/{qid}")
def delete_question(qid: int):
    db.exec("DELETE FROM questions WHERE id=?", (qid,))
    return {"ok": True}


@app.post("/api/exams")
def create_exam(payload: ExamIn):
    now = datetime.now().isoformat(timespec="seconds")
    cur = db.exec("INSERT INTO exams (title, mode, duration_min, question_ids, created_at) VALUES (?,?,?,?,?)",
                  (payload.title, payload.mode, payload.duration_min, json.dumps(payload.question_ids or []), now))
    return {"id": cur.lastrowid, "title": payload.title, "mode": payload.mode}


@app.get("/api/exams/{eid}")
def get_exam(eid: int):
    r = db.q1("SELECT * FROM exams WHERE id=?", (eid,))
    if not r: raise HTTPException(404, "KhÃ´ng tÃ¬m tháº¥y Ä‘á»")
    try: ids = json.loads(r["question_ids"] or "[]")
    except Exception: ids = []
    qs = []
    for qid in ids:
        qr = db.q1("SELECT * FROM questions WHERE id=?", (qid,))
        if qr: qs.append(row_to_q(qr))
    return {"id": r["id"], "title": r["title"], "mode": r["mode"], "questions": qs}


@app.post("/api/exams/{eid}/submit")
def submit_exam(eid: int, payload: SubmitIn):
    exam = db.q1("SELECT * FROM exams WHERE id=?", (eid,)) if eid and eid < 10**12 else None
    mode = exam["mode"] if exam else "practice"
    correct = 0
    total = 0
    for a in payload.answers or []:
        qid = a.get("question_id")
        qr = db.q1("SELECT * FROM questions WHERE id=?", (qid,)) if qid else None
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
    cur = db.exec("INSERT INTO attempts (exam_id, mode, correct, total, accuracy, detail, student_name, focus_exits, focus_log, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
                  (eid if exam else None, mode, correct, total, acc, json.dumps(payload.answers or [], ensure_ascii=False),
                   (payload.student_name or "").strip()[:100], focus_exits, json.dumps(focus_log, ensure_ascii=False), now))
    return {"attempt_id": cur.lastrowid, "correct": correct, "total": total, "accuracy": acc,
            "focus_exits": focus_exits}


@app.get("/api/attempts")
def attempts(student_name: Optional[str] = None, mode: Optional[str] = None):
    sql = "SELECT * FROM attempts WHERE 1=1"
    params = []
    if student_name:
        sql += " AND student_name=?"; params.append(student_name)
    if mode:
        sql += " AND mode=?"; params.append(mode)
    sql += " ORDER BY id DESC LIMIT 200"
    return [dict(r) for r in db.q(sql, tuple(params))]


@app.get("/api/stats/overview")
def stats(student_name: Optional[str] = None):
    total_q = db.count("questions")
    if student_name:
        rows_a = db.q("SELECT correct, total FROM attempts WHERE student_name=?", (student_name,))
        total_a = len(rows_a)
    else:
        total_a = db.count("attempts")
        rows_a = db.q("SELECT correct, total FROM attempts")
    c = sum((r["correct"] or 0) for r in rows_a)
    t = sum((r["total"] or 0) for r in rows_a)
    acc = (c / t) if t else 0
    by_subject = [dict(r) for r in db.q(
        "SELECT s.name subject, COUNT(q.id) count FROM subjects s LEFT JOIN questions q ON q.subject_id=s.id GROUP BY s.id ORDER BY count DESC")]
    # by topic: dá»±a trÃªn attempts detail
    topic_stat = {}
    for a in db.q("SELECT detail FROM attempts"):
        try: det = json.loads(a["detail"] or "[]")
        except Exception: det = []
        for d in det:
            qr = db.q1("SELECT topic_id FROM questions WHERE id=?", (d.get("question_id"),))
            if not qr or not qr["topic_id"]:
                continue
            tr = db.q1("SELECT name FROM topics WHERE id=?", (qr["topic_id"],))
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
    for r in db.q("SELECT student_name, COUNT(*) n, SUM(correct) c, SUM(total) t, AVG(accuracy) avg_acc, MAX(created_at) last_at FROM attempts WHERE student_name<>'' GROUP BY student_name ORDER BY avg_acc DESC LIMIT 100"):
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


@app.post("/api/import/preview-text")
def preview_text(payload: PreviewIn):
    return {"text": payload.text, "drafts": parse_text_to_drafts(payload.text)}


@app.post("/api/import/upload")
async def upload(file: UploadFile = File(...)):
    data = await file.read()
    if len(data) > 15 * 1024 * 1024:
        raise HTTPException(400, "File quÃ¡ lá»›n (>15MB)")
    try:
        text = extract_file_text(file.filename or "", data)
    except ValueError as e:
        raise HTTPException(400, str(e))
    except Exception as e:
        raise HTTPException(400, f"KhÃ´ng Ä‘á»c Ä‘Æ°á»£c file: {e}")
    return {"filename": file.filename, "text": text[:50000], "drafts": parse_text_to_drafts(text)}


@app.get("/{full_path:path}")
def spa(full_path: str):
    # Phá»¥c vá»¥ báº£n web production (dist/) cÃ¹ng-origin vá»›i API.
    # ÄÄƒng kÃ½ SAU má»i route /api nÃªn khÃ´ng bao giá» nuá»‘t API.
    if STATIC_DIR is None:
        raise HTTPException(404, "ChÆ°a build web (npm run build:renderer) hoáº·c chÆ°a truyá»n --static")
    try:
        target = (STATIC_DIR / (full_path or "index.html")).resolve()
        target.relative_to(STATIC_DIR.resolve())
    except Exception:
        raise HTTPException(404, "Not found")
    if full_path and target.is_file():
        return FileResponse(target, media_type=STATIC_MEDIA.get(target.suffix.lower()))
    index = STATIC_DIR / "index.html"
    if index.is_file():
        return FileResponse(index, media_type="text/html")
    raise HTTPException(404, "Not found")


def main():
    global db, STATIC_DIR
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=8765)
    ap.add_argument("--host", type=str, default="127.0.0.1",
                    help="127.0.0.1 = chá»‰ mÃ¡y nÃ y; 0.0.0.0 = cho phÃ©p Ä‘iá»‡n thoáº¡i trong cÃ¹ng WiFi truy cáº­p (thá»­ nghiá»‡m LAN)")
    ap.add_argument("--db-path", type=str, default=str(DEFAULT_DB))
    ap.add_argument("--static", type=str, default=None,
                    help="ThÆ° má»¥c web build (VD: ../dist) Ä‘á»ƒ phá»¥c vá»¥ PWA cÃ¹ng-origin vá»›i API")
    args = ap.parse_args()
    db = DB(Path(args.db_path))
    if args.static:
        p = Path(args.static)
        STATIC_DIR = p if p.is_absolute() else (BASE_DIR / p)
        print(f"[core] static: {STATIC_DIR} (exists={STATIC_DIR.is_dir()})", flush=True)
    print(f"[core] DB: {args.db_path} | questions: {db.count('questions')}", flush=True)
    import uvicorn
    uvicorn.run(app, host=args.host, port=args.port, log_level="info")


if __name__ == "__main__":
    main()

