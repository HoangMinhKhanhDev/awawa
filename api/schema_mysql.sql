-- ============================================================
-- Ôn luyện HSG Công nghệ — Schema MySQL (Hostinger)
-- Chạy 1 lần trong phpMyAdmin → chọn DB u670570555_awawa → tab SQL
-- Paste toàn bộ file này → Thực hiện
-- Bảng dùng utf8mb4 để chứa ký tự Toán (∫ √ → ω) và tiếng Việt đầy đủ
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

CREATE TABLE IF NOT EXISTS exams (
  id INT AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(255) DEFAULT 'Đề',
  mode VARCHAR(32) DEFAULT 'practice',
  duration_min INT DEFAULT 45,
  question_ids MEDIUMTEXT NULL,
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
  focus_exits INT DEFAULT 0,
  focus_log MEDIUMTEXT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_a_exam FOREIGN KEY (exam_id)
    REFERENCES exams (id) ON DELETE SET NULL,
  INDEX idx_a_student (student_name),
  INDEX idx_a_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS students (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  class_name VARCHAR(50) DEFAULT '',
  team VARCHAR(50) DEFAULT '',
  note VARCHAR(500) DEFAULT '',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_s_team (team),
  INDEX idx_s_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
