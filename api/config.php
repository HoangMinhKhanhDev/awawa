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
// Agnes AI (OpenAI-compatible) — chi doc tu local.php / env, KHONG commit key
define('AGNES_API_KEY', envv('AGNES_API_KEY', ''));
define('AGNES_BASE_URL', envv('AGNES_BASE_URL', 'https://apihub.agnes-ai.com/v1'));
define('AGNES_DEFAULT_MODEL', envv('AGNES_DEFAULT_MODEL', 'agnes-2.5-flash'));
// 3 model sinh text hop le
function agnes_models() {
    return array('agnes-2.5-flash', 'agnes-2.0-flash', 'agnes-1.5-flash');
}

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

// Chặn khu giáo viên: teacher, admin hoặc super_admin.
function require_teacher() {
    $me = optional_session();
    $role = $me ? ($me['role'] ?? 'student') : '';
    if (!$me || !in_array($role, array('teacher', 'admin', 'super_admin'), true)) jerr('Khu vực giáo viên.', 403);
    return $me;
}

function require_admin() {
    $me = optional_session();
    $role = $me ? ($me['role'] ?? 'student') : '';
    if (!$me || !in_array($role, array('admin', 'super_admin'), true)) jerr('Khu vực quản trị.', 403);
    return $me;
}

function require_super_admin() {
    $me = optional_session();
    if (!$me || ($me['role'] ?? 'student') !== 'super_admin') jerr('Chỉ super admin.', 403);
    return $me;
}

function is_admin($me) {
    return $me && in_array(($me['role'] ?? 'student'), array('admin', 'super_admin'), true);
}

function is_super_admin($me) {
    return $me && (($me['role'] ?? 'student') === 'super_admin');
}

function is_staff($me) {
    return $me && in_array(($me['role'] ?? 'student'), array('teacher', 'admin', 'super_admin'), true);
}

function role_of($me) {
    if (!$me) return 'guest';
    $r = $me['role'] ?? 'student';
    return in_array($r, array('student', 'teacher', 'admin', 'super_admin'), true) ? $r : 'student';
}

function has_perm($me, $perm_key) {
    if (!$me) return false;
    $r = role_of($me);
    if ($r === 'super_admin') return true;
    $row = q_one('SELECT allowed FROM role_permissions WHERE role=? AND perm_key=?', array($r, $perm_key));
    if (!$row) {
        return is_staff($me) && (substr($perm_key, -5) === 'view' || substr($perm_key, -4) === 'read'
            || substr($perm_key, -4) === 'self' || substr($perm_key, -7) === 'manage');
    }
    return (int)$row['allowed'] === 1;
}

function require_perm($perm_key) {
    $me = optional_session();
    if (!$me) jerr('Chưa đăng nhập.', 401);
    if (!has_perm($me, $perm_key)) jerr('Bạn không có quyền: ' . $perm_key, 403);
    return $me;
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
        ensure_gd_schema();
    } catch (Exception $e) {
        // bỏ qua nếu DB chưa cấu hình — health sẽ báo
    }
}

// Tự thêm cột/bảng cho Giai đoạn 2–5 (safe chạy nhiều lần).
function ensure_gd_schema() {
    static $done = false;
    if ($done) return;
    $done = true;
    $addCol = function ($table, $col, $ddl) {
        foreach (q_all("SHOW COLUMNS FROM `$table`") as $c) {
            if ($c['Field'] === $col) return;
        }
        db()->exec("ALTER TABLE `$table` ADD COLUMN `$col` $ddl");
    };
    $addCol('questions', 'code', "VARCHAR(64) DEFAULT ''");
    $addCol('questions', 'tags', 'TEXT NULL');
    $addCol('lessons', 'required', 'TINYINT DEFAULT 1');
    $addCol('lessons', 'advanced', 'TINYINT DEFAULT 0');
    $addCol('submissions', 'files', 'TEXT NULL');
    $addCol('exams', 'shuffle_q', 'TINYINT DEFAULT 1');
    db()->exec("CREATE TABLE IF NOT EXISTS grade_history (
        id INT AUTO_INCREMENT PRIMARY KEY,
        submission_id INT NOT NULL,
        score FLOAT NULL,
        feedback TEXT DEFAULT '',
        question_scores MEDIUMTEXT NULL,
        graded_by INT NULL,
        graded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_gh_sub (submission_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    db()->exec("CREATE TABLE IF NOT EXISTS materials (
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
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    db()->exec("CREATE TABLE IF NOT EXISTS notifications (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NULL,
        title VARCHAR(255) NOT NULL,
        body TEXT DEFAULT '',
        link VARCHAR(500) DEFAULT '',
        read_at DATETIME NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_n_user (user_id),
        INDEX idx_n_created (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    db()->exec("CREATE TABLE IF NOT EXISTS password_resets (
        id INT AUTO_INCREMENT PRIMARY KEY,
        student_id INT NOT NULL,
        code VARCHAR(16) NOT NULL,
        expires_at DATETIME NOT NULL,
        used_at DATETIME NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_pr_student (student_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    db()->exec("CREATE TABLE IF NOT EXISTS role_permissions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        role VARCHAR(32) NOT NULL,
        perm_key VARCHAR(64) NOT NULL,
        allowed TINYINT DEFAULT 0,
        UNIQUE KEY uq_rp (role, perm_key)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    seed_role_permissions();
}

function default_role_perms() {
    return array(
        'student' => array(
            'practice' => 1, 'exam' => 1, 'assignments.submit' => 1,
            'lessons.read' => 1, 'materials.read' => 1, 'progress.self' => 1,
        ),
        'teacher' => array(
            'practice' => 1, 'exam' => 1, 'assignments.submit' => 0,
            'assignments.create' => 1, 'assignments.grade' => 1,
            'lessons.read' => 1, 'lessons.write' => 1,
            'bank.manage' => 1, 'import.manage' => 1, 'studio.manage' => 1,
            'materials.read' => 1, 'materials.write' => 1,
            'students.view' => 1, 'students.create' => 1,
            'progress.self' => 1, 'progress.team' => 1, 'export.reports' => 1,
            'school.view' => 1,
        ),
        'admin' => array(
            'practice' => 1, 'exam' => 1, 'assignments.submit' => 0,
            'assignments.create' => 1, 'assignments.grade' => 1,
            'lessons.read' => 1, 'lessons.write' => 1,
            'bank.manage' => 1, 'import.manage' => 1, 'studio.manage' => 1,
            'materials.read' => 1, 'materials.write' => 1,
            'students.view' => 1, 'students.create' => 1, 'students.bulk' => 1,
            'students.lock' => 1, 'students.delete' => 1,
            'progress.self' => 1, 'progress.team' => 1, 'export.reports' => 1,
            'school.view' => 1, 'school.manage' => 1,
            'notifications.send' => 1,
        ),
        'super_admin' => array(
            'practice' => 1, 'exam' => 1, 'assignments.submit' => 0,
            'assignments.create' => 1, 'assignments.grade' => 1,
            'lessons.read' => 1, 'lessons.write' => 1,
            'bank.manage' => 1, 'import.manage' => 1, 'studio.manage' => 1,
            'materials.read' => 1, 'materials.write' => 1,
            'students.view' => 1, 'students.create' => 1, 'students.bulk' => 1,
            'students.lock' => 1, 'students.delete' => 1, 'students.role' => 1,
            'progress.self' => 1, 'progress.team' => 1, 'export.reports' => 1,
            'school.view' => 1, 'school.manage' => 1,
            'notifications.send' => 1,
            'permissions.manage' => 1, 'users.manage_admin' => 1,
        ),
    );
}

function seed_role_permissions() {
    static $done = false;
    if ($done) return;
    $done = true;
    $st = db()->prepare('INSERT IGNORE INTO role_permissions (role, perm_key, allowed) VALUES (?,?,?)');
    foreach (default_role_perms() as $role => $perms) {
        foreach ($perms as $k => $v) $st->execute(array($role, $k, (int)$v));
    }
}

// ---------------- Agnes AI (OpenAI-compatible) ----------------
// Chi goi tu server — API key khong bao gio ra client.
function agnes_chat($messages, $model = '', $max_tokens = 4000, $temperature = 0.4) {
    if (AGNES_API_KEY === '') jerr('AI chua cau hinh (thieu AGNES_API_KEY).', 500);
    if ($model === '' || !in_array($model, agnes_models(), true)) $model = AGNES_DEFAULT_MODEL;
    $payload = json_encode(array(
        'model' => $model,
        'messages' => $messages,
        'temperature' => $temperature,
        'max_tokens' => $max_tokens,
    ), JSON_UNESCAPED_UNICODE);
    $ch = curl_init(rtrim(AGNES_BASE_URL, '/') . '/chat/completions');
    curl_setopt_array($ch, array(
        CURLOPT_POST => true,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER => array(
            'Authorization: Bearer ' . AGNES_API_KEY,
            'Content-Type: application/json',
        ),
        CURLOPT_POSTFIELDS => $payload,
        CURLOPT_TIMEOUT => 90,
        CURLOPT_CONNECTTIMEOUT => 15,
    ));
    $raw = curl_exec($ch);
    $err = curl_error($ch);
    $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    if ($raw === false) jerr('AI loi mang: ' . $err, 502);
    $j = json_decode($raw, true);
    if ($code >= 400) {
        $msg = $j['error']['message'] ?? ('HTTP ' . $code);
        jerr('AI tra loi loi: ' . mb_substr((string)$msg, 0, 300), 502);
    }
    $content = $j['choices'][0]['message']['content'] ?? '';
    if ($content === '') jerr('AI khong tra ve noi dung.', 502);
    return $content;
}

// Parse JSON tu AI: strip ```json fence, tim object/array dau tien.
function agnes_parse_json($text) {
    $t = trim((string)$text);
    $t = preg_replace('/^```(?:json)?\s*/i', '', $t);
    $t = preg_replace('/\s*```$/', '', $t);
    $t = trim($t);
    $start = strpos($t, '{');
    $arr = strpos($t, '[');
    if ($start === false && $arr === false) return null;
    if ($arr !== false && ($start === false || $arr < $start)) {
        $end = strrpos($t, ']');
        if ($end === false) return null;
        return json_decode(substr($t, $arr, $end - $arr + 1), true);
    }
    $end = strrpos($t, '}');
    if ($end === false) return null;
    $j = json_decode(substr($t, $start, $end - $start + 1), true);
    return $j;
}

// Streaming: goi Agnes voi stream=true, moi chunk SSE forward ra client qua $emit.
// $emit(string $event, array $data) — gui 1 event SSE. Tra ve noi dung text day du.
function agnes_chat_stream($messages, $model, $emit, $max_tokens = 4000, $temperature = 0.4) {
    if (AGNES_API_KEY === '') { $emit('error', array('message' => 'Thieu AGNES_API_KEY.')); return null; }
    if ($model === '' || !in_array($model, agnes_models(), true)) $model = AGNES_DEFAULT_MODEL;
    $payload = json_encode(array(
        'model' => $model,
        'messages' => $messages,
        'temperature' => $temperature,
        'max_tokens' => $max_tokens,
        'stream' => true,
    ), JSON_UNESCAPED_UNICODE);
    $ch = curl_init(rtrim(AGNES_BASE_URL, '/') . '/chat/completions');
    $buf = '';
    $full = '';
    $emit_fn = function ($ch, $chunk) use (&$buf, &$full, $emit) {
        $buf .= $chunk;
        // SSE: moi line bat dau "data: " (hoac data:)
        while (($pos = strpos($buf, "\n")) !== false) {
            $line = rtrim(substr($buf, 0, $pos), "\r");
            $buf = substr($buf, $pos + 1);
            if ($line === '' || strpos($line, 'data:') !== 0) continue;
            $data = trim(substr($line, 5));
            if ($data === '[DONE]') continue;
            $j = json_decode($data, true);
            $delta = $j['choices'][0]['delta']['content'] ?? '';
            if ($delta !== '') {
                $full .= $delta;
                $emit('delta', array('text' => $delta));
            }
        }
        return strlen($chunk);
    };
    curl_setopt_array($ch, array(
        CURLOPT_POST => true,
        CURLOPT_RETURNTRANSFER => false,
        CURLOPT_HEADER => false,
        CURLOPT_WRITEFUNCTION => $emit_fn,
        CURLOPT_HTTPHEADER => array(
            'Authorization: Bearer ' . AGNES_API_KEY,
            'Content-Type: application/json',
            'Accept: text/event-stream',
        ),
        CURLOPT_POSTFIELDS => $payload,
        CURLOPT_TIMEOUT => 120,
        CURLOPT_CONNECTTIMEOUT => 15,
        CURLOPT_FLUSH => true,
    ));
    $ok = curl_exec($ch);
    $err = curl_error($ch);
    $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    if ($ok === false && $err) {
        $emit('error', array('message' => 'AI loi mang: ' . $err));
        return null;
    }
    if ($code >= 400 && $full === '') {
        $emit('error', array('message' => 'AI loi HTTP ' . $code));
        return null;
    }
    if ($full === '') {
        $emit('error', array('message' => 'AI khong tra ve noi dung.'));
        return null;
    }
    return $full;
}

// ---------------- Cloze (diem khuyet) ----------------
// Norm: lowercase, bo dau, bo thua ky tu, trim.
function cloze_norm($s) {
    $s = mb_strtolower(trim((string)$s), 'UTF-8');
    $s = @iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $s);
    if ($s === false) $s = mb_strtolower(trim((string)$s), 'UTF-8');
    $s = preg_replace('/[^\p{L}\p{N}]+/u', '', $s);
    return $s;
}

// Dem so ___ hoac {{...}} trong content.
function cloze_blank_count($content) {
    $n = preg_match_all('/\{\{[^}]+\}\}/', (string)$content, $m1);
    $n2 = preg_match_all('/_{3,}/', (string)$content, $m2);
    return max((int)$n, (int)$n2);
}

// Danh sach dap an tu correct_answer: tach bang | , || hoac ;\n
function cloze_answers($correct_answer) {
    $parts = preg_split('/\|\||\||;/', (string)$correct_answer);
    $out = array();
    foreach ($parts as $p) {
        $p = trim($p);
        if ($p !== '') $out[] = $p;
    }
    return $out;
}

// $user: string "a,b,c" hoac JSON array, $correct: field answer
// Tra ve so cau dung / so blank (partial credit: moi blank dung 1 diem).
function grade_cloze($content, $correct_answer, $user_answer) {
    $answers = cloze_answers($correct_answer);
    $nBlanks = cloze_blank_count($content);
    if (!$answers) return null; // khong du thong tin -> khong cham
    if (is_array($user_answer)) $ua = $user_answer;
    else {
        $ua = json_decode((string)$user_answer, true);
        if (!is_array($ua)) {
            $ua = array();
            foreach (explode(',', (string)$user_answer) as $x) $ua[] = trim($x);
        }
    }
    // Neu HS gui string thay vi array: xu ly tung blank
    if (count($ua) === 1 && count($answers) > 1 && is_string($ua[0])) {
        $split = preg_split('/\s*,\s*/', trim((string)$ua[0]));
        if (count($split) === count($answers)) $ua = $split;
    }
    $correct = 0;
    $detail = array();
    foreach ($answers as $i => $ans) {
        $u = isset($ua[$i]) ? (is_array($ua[$i]) ? ($ua[$i]['text'] ?? '') : $ua[$i]) : '';
        $ok = cloze_norm($u) !== '' && cloze_norm($u) === cloze_norm($ans);
        $detail[] = array('blank' => $i + 1, 'ok' => $ok, 'answer' => $ans, 'user' => (string)$u);
        if ($ok) $correct++;
    }
    $total = max(count($answers), $nBlanks, 1);
    return array('correct' => $correct, 'total' => $total, 'detail' => $detail);
}
