<?php
// Cấu hình API — đọc từ Environment variables trong hPanel
// (Websites → herbaspalab.com → Environment variables).
// Khi chạy local mà chưa set env, copy api/local.example.php → api/local.php.
if (is_file(__DIR__ . '/local.php')) {
    $local = require __DIR__ . '/local.php';
    if (is_array($local)) {
        foreach ($local as $k => $v) {
            if (getenv($k) === false) putenv("$k=$v");
        }
    }
}

function envv($key, $default = '') {
    $v = getenv($key);
    return ($v === false || $v === null || $v === '') ? $default : $v;
}

define('DB_HOST', envv('DB_HOST', 'localhost'));
define('DB_NAME', envv('DB_NAME', ''));
define('DB_USER', envv('DB_USER', ''));
define('DB_PASS', envv('DB_PASS', ''));
// Token chia sẻ: nếu để trống = mở như bản LAN (tiện test).
// Nên đặt 1 chuỗi ngẫu nhiên, frontend gửi kèm header X-Api-Token.
define('API_TOKEN', envv('API_TOKEN', ''));
define('UPLOAD_DIR', envv('UPLOAD_DIR', __DIR__ . '/../uploads'));
define('PUBLIC_BASE', envv('PUBLIC_BASE', '')); // VD: https://herbspalab.com — để trống = tự đoán
define('MAX_UPLOAD_MB', (int)envv('MAX_UPLOAD_MB', '5'));

function db() {
    static $pdo = null;
    if ($pdo) return $pdo;
    if (DB_NAME === '' || DB_USER === '') {
        jerr('Chưa cấu hình database (DB_NAME/DB_USER trong Environment variables).', 500);
    }
    $pdo = new PDO(
        'mysql:host=' . DB_HOST . ';dbname=' . DB_NAME . ';charset=utf8mb4',
        DB_USER, DB_PASS,
        array(
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => true,
        )
    );
    return $pdo;
}

function j($data, $code = 200) {
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}

function jerr($msg, $code = 400) {
    j(array('error' => $msg), $code);
}

function body() {
    $raw = file_get_contents('php://input');
    $d = json_decode($raw === '' ? '{}' : $raw, true);
    return is_array($d) ? $d : array();
}

function check_token($path) {
    if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') return;
    if ($path === '/health') return; // cho widget trạng thái kiểm tra không cần token
    if ($path === '/auth/register' || $path === '/auth/login') return; // public cho học sinh tự đăng ký/đăng nhập
    if (API_TOKEN === '') return;    // chưa đặt token = mở (chế độ test)
    $got = $_SERVER['HTTP_X_API_TOKEN'] ?? '';
    if (!hash_equals(API_TOKEN, (string)$got)) jerr('Sai API token.', 403);
}

// ---------------- AUTH HỌC SINH (dùng chung) ----------------

function public_student($r) {
    if (!$r) return null;
    unset($r['password_hash']);
    return $r;
}

function norm_phone($p) {
    $p = preg_replace('/[^\d+]/', '', trim((string)$p));
    return mb_substr($p, 0, 20);
}

function valid_email($e) {
    $e = trim((string)$e);
    if ($e === '') return '';
    if (!filter_var($e, FILTER_VALIDATE_EMAIL)) jerr('Email không hợp lệ.');
    return mb_substr($e, 0, 190);
}

function valid_dob($d) {
    $d = trim((string)$d);
    if ($d === '') return null;
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $d)) jerr('Ngày sinh phải dạng YYYY-MM-DD.');
    $t = strtotime($d);
    if ($t === false || $t > time()) jerr('Ngày sinh không hợp lệ.');
    return $d;
}

function valid_gender($g) {
    $g = trim((string)$g);
    if ($g === '') return '';
    if (!in_array($g, array('Nam', 'Nữ', 'Khác'), true)) jerr('Giới tính phải là Nam, Nữ hoặc Khác.');
    return $g;
}

function new_session($student_id) {
    $tok = bin2hex(random_bytes(32));
    db()->prepare('INSERT INTO sessions (token_hash, student_id, expires_at) VALUES (?,?,DATE_ADD(NOW(), INTERVAL 30 DAY))')
        ->execute(array(hash('sha256', $tok), $student_id));
    return $tok;
}

function session_student() {
    $tok = $_SERVER['HTTP_X_SESSION_TOKEN'] ?? '';
    if ($tok === '' || !preg_match('/^[a-f0-9]{64}$/', $tok)) jerr('Chưa đăng nhập.', 401);
    $h = hash('sha256', $tok);
    $s = q_one('SELECT s.expires_at, st.* FROM sessions s JOIN students st ON st.id=s.student_id WHERE s.token_hash=?', array($h));
    if (!$s) jerr('Phiên đăng nhập hết hạn.', 401);
    if (strtotime($s['expires_at']) < time()) {
        db()->prepare('DELETE FROM sessions WHERE token_hash=?')->execute(array($h));
        jerr('Phiên đăng nhập hết hạn.', 401);
    }
    unset($s['expires_at']);
    return public_student($s);
}

// Session tùy chọn: có thì trả học sinh, không thì null (không báo lỗi).
function optional_session() {
    $tok = $_SERVER['HTTP_X_SESSION_TOKEN'] ?? '';
    if ($tok === '' || !preg_match('/^[a-f0-9]{64}$/', $tok)) return null;
    $h = hash('sha256', $tok);
    $s = q_one('SELECT s.expires_at, st.* FROM sessions s JOIN students st ON st.id=s.student_id WHERE s.token_hash=?', array($h));
    if (!$s || strtotime($s['expires_at']) < time()) return null;
    unset($s['expires_at']);
    return public_student($s);
}

// Chặn khu giáo viên: teacher hoặc admin.
function require_teacher() {
    $me = optional_session();
    $role = $me ? ($me['role'] ?? 'student') : '';
    if (!$me || ($role !== 'teacher' && $role !== 'admin')) jerr('Khu vực giáo viên.', 403);
    return $me;
}

function require_admin() {
    $me = optional_session();
    if (!$me || ($me['role'] ?? 'student') !== 'admin') jerr('Khu vực quản trị.', 403);
    return $me;
}

function is_admin($me) {
    return $me && (($me['role'] ?? 'student') === 'admin');
}

function is_staff($me) {
    return $me && in_array(($me['role'] ?? 'student'), array('teacher', 'admin'), true);
}

function teacher_coached_team_ids($user_id) {
    $rows = q_all(
        "SELECT team_id FROM team_members WHERE user_id=? AND member_role='coach' AND (left_at IS NULL OR left_at='')",
        array($user_id)
    );
    $ids = array();
    foreach ($rows as $r) $ids[] = (int)$r['team_id'];
    return $ids;
}

// Tự động thêm bảng Phase 1a nếu chưa có (safe chạy nhiều lần)
function ensure_school_schema() {
    static $done = false;
    if ($done) return;
    $done = true;
    try {
        db()->exec("CREATE TABLE IF NOT EXISTS school_years (
            id INT AUTO_INCREMENT PRIMARY KEY,
            name VARCHAR(50) NOT NULL UNIQUE,
            start_date VARCHAR(20) DEFAULT '',
            end_date VARCHAR(20) DEFAULT '',
            is_current TINYINT DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
        db()->exec("CREATE TABLE IF NOT EXISTS grades (
            id INT AUTO_INCREMENT PRIMARY KEY,
            school_year_id INT NULL,
            name VARCHAR(80) NOT NULL,
            code VARCHAR(20) DEFAULT '',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
        db()->exec("CREATE TABLE IF NOT EXISTS teams (
            id INT AUTO_INCREMENT PRIMARY KEY,
            school_year_id INT NULL,
            grade_id INT NULL,
            subject_id VARCHAR(64) NULL,
            name VARCHAR(120) NOT NULL,
            description VARCHAR(500) DEFAULT '',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
        db()->exec("CREATE TABLE IF NOT EXISTS team_members (
            id INT AUTO_INCREMENT PRIMARY KEY,
            team_id INT NOT NULL,
            user_id INT NOT NULL,
            member_role VARCHAR(20) DEFAULT 'student',
            joined_at DATETIME NULL,
            left_at DATETIME NULL,
            UNIQUE KEY uq_tmu (team_id, user_id, member_role)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
        // cột active
        $cols = array();
        foreach (q_all('SHOW COLUMNS FROM students') as $c) $cols[] = $c['Field'];
        if (!in_array('active', $cols, true)) {
            db()->exec("ALTER TABLE students ADD COLUMN active TINYINT DEFAULT 1");
        }
    } catch (Exception $e) {
        // bỏ qua nếu DB chưa cấu hình — health sẽ báo
    }
}
