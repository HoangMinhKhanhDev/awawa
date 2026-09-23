-- ============================================================
-- Seed Phase 1a cho Hostinger MySQL — CHẠY SAU schema_mysql.sql
-- Tạo: lớp mặc định, năm học, khối, đội, admin + GV + HS demo
-- Idempotent: INSERT IGNORE / UPDATE theo phone
-- ============================================================
SET NAMES utf8mb4;

-- Lớp mặc định
INSERT IGNORE INTO classes (id, name, join_code) VALUES
  (1, 'Lớp bồi dưỡng HSG', 'HSG2026');

-- Năm học
INSERT IGNORE INTO school_years (id, name, start_date, end_date, is_current) VALUES
  (1, '2026-2027', '2026-09-01', '2027-05-31', 1);

-- Khối
INSERT IGNORE INTO grades (id, school_year_id, name, code) VALUES
  (1, 1, 'Khối 10', '10'),
  (2, 1, 'Khối 11', '11'),
  (3, 1, 'Khối 12', '12');

-- Đội tuyển
INSERT IGNORE INTO teams (id, school_year_id, grade_id, subject_id, name) VALUES
  (1, 1, 2, 'ly', 'HSG Vật lý'),
  (2, 1, 2, 'cn-nong', 'Nông nghiệp'),
  (3, 1, 2, 'cn-chan', 'Chăn nuôi'),
  (4, 1, 2, 'cn-lamthuy', 'Lâm nghiệp – Thủy sản');

-- Tài khoản demo (password_hash sinh lại ở PHP lần đầu — xem README Phase 1a)
-- HASH PBKDF2 dưới đây dùng chung seed_demo_accounts.py local;
-- trên production nên đặt lại mật khẩu qua SQL/PHP sau khi đăng nhập lần đầu bằng hash mới.
-- ADMIN  phone 0900000000 / admin@hsg.local  role=admin
-- TEACHER phone 0900000001 / giaovien@hsg.local role=teacher
-- STUDENT phone 0911111111 / nguyenvana@hsg.local role=student

-- Teachers (cấp lại password_hash bằng script hoặc để trống rồi reset)
INSERT IGNORE INTO students (name, class_name, team, note, dob, gender, phone, email, password_hash, role, active)
VALUES
  ('Quản trị Trường', 'ADMIN', '', 'Tài khoản admin demo', '1985-01-01', 'Khác',
   '0900000000', 'admin@hsg.local', NULL, 'admin', 1),
  ('Cô Trần Thị Giảng', 'GV', 'Ban HSG', 'Tài khoản demo giáo viên', '1990-05-12', 'Nữ',
   '0900000001', 'giaovien@hsg.local', NULL, 'teacher', 1),
  ('Nguyễn Văn A', '11A1', 'HSG Vật lý', 'Học sinh clone demo', '2010-09-09', 'Nam',
   '0911111111', 'nguyenvana@hsg.local', NULL, 'student', 1);

-- Coach: GV phụ trách 4 đội
INSERT IGNORE INTO team_members (team_id, user_id, member_role, joined_at)
SELECT t.id, s.id, 'coach', NOW()
FROM teams t CROSS JOIN students s
WHERE s.phone = '0900000001';

-- HS vào HSG Vật lý
INSERT IGNORE INTO team_members (team_id, user_id, member_role, joined_at)
SELECT 1, s.id, 'student', NOW() FROM students s WHERE s.phone = '0911111111';

-- HS vào lớp
INSERT IGNORE INTO class_members (class_id, user_id, joined_at)
SELECT 1, s.id, NOW() FROM students s WHERE s.phone = '0911111111';

-- Ghi chú: password_hash = NULL → chưa đăng nhập được.
-- Sau seed, đổi hash bằng script hoặc để trống rồi login sẽ fail (empty hash).
-- Khuyến nghị: chạy seed_demo_accounts.py local rồi copy 3 hash, hoặc set hash SQL:
-- Ví dụ hash mẫu sẽ được generate lại — xem scripts/set_mysql_passwords.php sau.
