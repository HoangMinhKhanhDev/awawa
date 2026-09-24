-- ============================================================
-- Ôn luyện HSG — Schema MySQL (Hostinger) — Phase 1a
-- Chạy 1 lần trong phpMyAdmin → chọn DB → tab SQL → Paste → Thực hiện
-- Bảng dùng utf8mb4 (ký tự Toán + tiếng Việt)
-- ============================================================
SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS subjects (
  id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  code VARCHAR(32) NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS topics (
  id VARCHAR(64) PRIMARY KEY,
  subject_id VARCHAR(64) NOT NULL,
  name VARCHAR(200) NOT NULL,
  grade INT DEFAULT 12,
  description TEXT NULL,
  CONSTRAINT fk_topics_subject FOREIGN KEY (subject_id)
    REFERENCES subjects (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS questions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  subject_id VARCHAR(64) NOT NULL,
  topic_id VARCHAR(64) NULL,
  grade INT DEFAULT 12,
  difficulty VARCHAR(32) DEFAULT 'vận dụng',
  qtype VARCHAR(32) DEFAULT 'trac_nghiem',
  content TEXT NOT NULL,
  options MEDIUMTEXT NULL,
  correct_answer TEXT NULL,
  explanation TEXT NULL,
  score FLOAT DEFAULT 1,
  source VARCHAR(32) DEFAULT 'mẫu',
  image_url VARCHAR(2000) DEFAULT '',
  code VARCHAR(64) DEFAULT '',
  tags TEXT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_q_subject FOREIGN KEY (subject_id)
    REFERENCES subjects (id) ON DELETE CASCADE,
  CONSTRAINT fk_q_topic FOREIGN KEY (topic_id)
    REFERENCES topics (id) ON DELETE SET NULL,
  INDEX idx_q_subject (subject_id),
  INDEX idx_q_topic (topic_id),
  INDEX idx_q_grade (grade),
  FULLTEXT INDEX ft_q_content (content)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS students (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  class_name VARCHAR(50) DEFAULT '',
  team VARCHAR(50) DEFAULT '',
  note VARCHAR(500) DEFAULT '',
  dob DATE NULL,
  gender VARCHAR(16) DEFAULT '',
  phone VARCHAR(20) NULL,
  email VARCHAR(190) NULL,
  password_hash VARCHAR(255) NULL,
  role VARCHAR(20) DEFAULT 'student',
  active TINYINT DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_s_phone (phone),
  UNIQUE KEY uq_s_email (email),
  INDEX idx_s_team (team),
  INDEX idx_s_name (name),
  INDEX idx_s_role (role)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS sessions (
  token_hash CHAR(64) PRIMARY KEY,
  student_id INT NOT NULL,
  expires_at DATETIME NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_sess_student (student_id),
  CONSTRAINT fk_sess_student FOREIGN KEY (student_id)
    REFERENCES students (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS classes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  join_code VARCHAR(16) NOT NULL UNIQUE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS class_members (
  id INT AUTO_INCREMENT PRIMARY KEY,
  class_id INT NOT NULL,
  user_id INT NOT NULL,
  joined_at DATETIME NULL,
  UNIQUE KEY uq_cm (class_id, user_id),
  INDEX idx_cm_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS school_years (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(50) NOT NULL UNIQUE,
  start_date VARCHAR(20) DEFAULT '',
  end_date VARCHAR(20) DEFAULT '',
  is_current TINYINT DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS grades (
  id INT AUTO_INCREMENT PRIMARY KEY,
  school_year_id INT NULL,
  name VARCHAR(80) NOT NULL,
  code VARCHAR(20) DEFAULT '',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_g_year (school_year_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS teams (
  id INT AUTO_INCREMENT PRIMARY KEY,
  school_id INT NULL,
  school_year_id INT NULL,
  grade_id INT NULL,
  subject_id VARCHAR(64) NULL,
  name VARCHAR(120) NOT NULL,
  description VARCHAR(500) DEFAULT '',
  join_code VARCHAR(16) NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_teams_code (join_code),
  INDEX idx_t_year (school_year_id),
  INDEX idx_t_subject (subject_id),
  INDEX idx_t_school (school_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS team_members (
  id INT AUTO_INCREMENT PRIMARY KEY,
  team_id INT NOT NULL,
  user_id INT NOT NULL,
  member_role VARCHAR(20) DEFAULT 'student',
  joined_at DATETIME NULL,
  left_at DATETIME NULL,
  UNIQUE KEY uq_tmu (team_id, user_id, member_role),
  INDEX idx_tm_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS exams (
  id INT AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(255) DEFAULT 'Đề',
  mode VARCHAR(32) DEFAULT 'practice',
  duration_min INT DEFAULT 45,
  question_ids MEDIUMTEXT NULL,
  shuffle_q TINYINT DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS attempts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  exam_id INT NULL,
  mode VARCHAR(32) DEFAULT 'practice',
  correct INT DEFAULT 0,
  total INT DEFAULT 0,
  accuracy FLOAT DEFAULT 0,
  detail MEDIUMTEXT NULL,
  student_name VARCHAR(100) DEFAULT '',
  student_id INT NULL,
  focus_exits INT DEFAULT 0,
  focus_log MEDIUMTEXT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_a_student (student_name),
  INDEX idx_a_student_id (student_id),
  INDEX idx_a_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS assignments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  class_id INT NULL,
  team_id INT NULL,
  topic_id VARCHAR(64) NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT NULL,
  deadline DATETIME NULL,
  created_by INT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_as_class (class_id),
  INDEX idx_as_team (team_id),
  CONSTRAINT fk_a_team FOREIGN KEY (team_id) REFERENCES teams (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS assign_questions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  assignment_id INT NOT NULL,
  idx INT NOT NULL DEFAULT 1,
  content TEXT NOT NULL,
  answer TEXT DEFAULT '',
  points REAL DEFAULT 1,
  INDEX idx_aq_assign (assignment_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS submissions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  assignment_id INT NOT NULL,
  student_id INT NOT NULL,
  answer MEDIUMTEXT DEFAULT '[]',
  score FLOAT NULL,
  feedback TEXT DEFAULT '',
  question_scores MEDIUMTEXT NULL,
  files TEXT NULL,
  submitted_at DATETIME NULL,
  graded_at DATETIME NULL,
  UNIQUE KEY uq_sub (assignment_id, student_id),
  INDEX idx_sub_student (student_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS grade_history (
  id INT AUTO_INCREMENT PRIMARY KEY,
  submission_id INT NOT NULL,
  score FLOAT NULL,
  feedback TEXT DEFAULT '',
  question_scores MEDIUMTEXT NULL,
  graded_by INT NULL,
  graded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_gh_sub (submission_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS materials (
  id INT AUTO_INCREMENT PRIMARY KEY,
  subject_id VARCHAR(64) NULL,
  topic_id VARCHAR(64) NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT DEFAULT '',
  file_url VARCHAR(2000) DEFAULT '',
  file_type VARCHAR(32) DEFAULT '',
  grade INT DEFAULT 12,
  created_by INT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_mat_subject (subject_id),
  INDEX idx_mat_topic (topic_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS notifications (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NULL,
  title VARCHAR(255) NOT NULL,
  body TEXT DEFAULT '',
  link VARCHAR(500) DEFAULT '',
  read_at DATETIME NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_n_user (user_id),
  INDEX idx_n_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS password_resets (
  id INT AUTO_INCREMENT PRIMARY KEY,
  student_id INT NOT NULL,
  code VARCHAR(16) NOT NULL,
  expires_at DATETIME NOT NULL,
  used_at DATETIME NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_pr_student (student_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS lessons (
  id INT AUTO_INCREMENT PRIMARY KEY,
  topic_id VARCHAR(64) NOT NULL,
  title VARCHAR(255) NOT NULL,
  content MEDIUMTEXT DEFAULT '',
  idx INT DEFAULT 1,
  required TINYINT DEFAULT 1,
  advanced TINYINT DEFAULT 0,
  INDEX idx_l_topic (topic_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS lesson_completions (
  student_id INT NOT NULL,
  lesson_id INT NOT NULL,
  completed_at DATETIME NULL,
  PRIMARY KEY (student_id, lesson_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
