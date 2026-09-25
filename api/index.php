<?php
// API PHP/MySQL cho Hostinger — front controller duy nhất của ứng dụng.
// Không framework, chạy được trên PHP 7.4+ của shared hosting.
require __DIR__ . '/config.php';

header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: same-origin');
header('X-Frame-Options: DENY');
$allowedOrigins = array_values(array_filter(array_map('trim', explode(',', envv('ALLOWED_ORIGINS', '')))));
$requestOrigin = trim((string)($_SERVER['HTTP_ORIGIN'] ?? ''));
if ($requestOrigin !== '' && in_array($requestOrigin, $allowedOrigins, true)) {
    header('Access-Control-Allow-Origin: ' . $requestOrigin);
    header('Vary: Origin');
    header('Access-Control-Allow-Headers: Content-Type, X-Session-Token, X-School-ID, X-Request-ID');
    header('Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS');
    header('Access-Control-Max-Age: 600');
}
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') exit(0);

$method = $_SERVER['REQUEST_METHOD'];

// Lấy path: ưu tiên ?p= (từ .htaccess), rồi PATH_INFO, rồi REQUEST_URI
$path = '/';
if (isset($_GET['p']) && $_GET['p'] !== '') {
    $path = '/' . ltrim($_GET['p'], '/');
} elseif (!empty($_SERVER['PATH_INFO'])) {
    $path = $_SERVER['PATH_INFO'];
} else {
    $uri = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH);
    $scriptDir = rtrim(str_replace('\\', '/', dirname($_SERVER['SCRIPT_NAME'] ?? '')), '/');
    if ($scriptDir !== '' && strpos($uri, $scriptDir) === 0) {
        $path = substr($uri, strlen($scriptDir));
    } else {
        $path = $uri;
    }
    // Bỏ tiền tố /index.php nếu còn sót
    $path = preg_replace('#^/index\.php#', '', $path === '' ? '/' : $path);
}
if ($path === '' || $path[0] !== '/') $path = '/' . $path;

check_token($path);

function q_all($sql, $params = array()) {
    $st = db()->prepare($sql);
    $st->execute($params);
    return $st->fetchAll();
}

function q_one($sql, $params = array()) {
    $st = db()->prepare($sql);
    $st->execute($params);
    $r = $st->fetch();
    return $r === false ? null : $r;
}

require_once __DIR__ . '/lib/policy.php';
require_once __DIR__ . '/routes_v2.php';
if (handle_v2_api($method, $path)) exit;

function jlist($v) {
    if ($v === null || $v === '') return array();
    if (is_array($v)) return $v;
    $p = json_decode($v, true);
    return is_array($p) ? $p : array();
}

function validate_topic_parent($parent, $topic_id, $subject_id) {
    $parent = trim((string)$parent);
    if ($parent === '') return null;
    $target = (string)$topic_id;
    $seen = array();
    $current = $parent;
    $depth = 1;
    while ($current !== '') {
        if ($current === $target || isset($seen[$current])) jerr('Chuyên đề cha không hợp lệ.');
        $seen[$current] = true;
        $row = q_one('SELECT id, subject_id, parent_id FROM topics WHERE id=?', array($current));
        if (!$row) jerr('Chuyên đề cha không tồn tại.');
        if ((string)$row['subject_id'] !== (string)$subject_id) jerr('Chuyên đề cha phải cùng môn.');
        $depth++;
        if ($depth > 8) jerr('Độ sâu chuyên đề quá giới hạn.');
        $current = trim((string)($row['parent_id'] ?? ''));
    }
    return $parent;
}

function subj_map() {
    $m = array();
    foreach (q_all('SELECT id, name FROM subjects') as $r) $m[$r['id']] = $r['name'];
    return $m;
}

function topic_map() {
    $m = array();
    foreach (q_all('SELECT id, name FROM topics') as $r) $m[$r['id']] = $r['name'];
    return $m;
}

function row_to_q($r, $includeAnswer = false) {
    static $sm = null, $tm = null;
    if ($sm === null) { $sm = subj_map(); $tm = topic_map(); }
    $tags = array();
    if (!empty($r['tags'])) {
        $p = json_decode($r['tags'], true);
        if (is_array($p)) $tags = $p;
    }
    $out = array(
        'id' => (int)$r['id'], 'subject_id' => $r['subject_id'],
        'subject_name' => isset($sm[$r['subject_id']]) ? $sm[$r['subject_id']] : $r['subject_id'],
        'topic_id' => $r['topic_id'],
        'topic_name' => ($r['topic_id'] && isset($tm[$r['topic_id']])) ? $tm[$r['topic_id']] : null,
        'grade' => (int)$r['grade'], 'difficulty' => $r['difficulty'], 'qtype' => $r['qtype'],
        'content' => $r['content'], 'options' => $r['options'] === null ? '[]' : $r['options'],
        'score' => (float)$r['score'], 'source' => $r['source'] === null ? '' : $r['source'],
        'image_url' => $r['image_url'] === null ? '' : $r['image_url'],
        'code' => isset($r['code']) && $r['code'] !== null ? $r['code'] : '',
        'tags' => $tags,
    );
    if ($includeAnswer) {
        $out['correct_answer'] = $r['correct_answer'] === null ? '' : $r['correct_answer'];
        $out['explanation'] = $r['explanation'] === null ? '' : $r['explanation'];
    }
    return $out;
}

function row_to_attempt($r) {
    return array(
        'id' => (int)$r['id'], 'exam_id' => $r['exam_id'] === null ? null : (int)$r['exam_id'],
        'mode' => $r['mode'], 'correct' => (int)$r['correct'], 'total' => (int)$r['total'],
        'accuracy' => (float)$r['accuracy'], 'detail' => jlist($r['detail']),
        'student_name' => $r['student_name'] === null ? '' : $r['student_name'],
        'focus_exits' => (int)$r['focus_exits'], 'focus_log' => jlist($r['focus_log']),
        'created_at' => $r['created_at'],
    );
}

// ---------------- HEALTH ----------------
if ($method === 'GET' && $path === '/health') {
    $n = 0; $err = '';
    try { $n = (int)q_one('SELECT COUNT(*) c FROM questions')['c']; }
    catch (Exception $e) { $err = 'DB chưa kết nối: kiểm tra DB_HOST/DB_NAME/DB_USER/DB_PASS trong Environment variables hoặc api/local.php.'; }
    j(array('status' => 'ok', 'backend' => 'hostinger-mysql', 'time' => date('Y-m-d\TH:i:s'), 'total_questions' => $n, 'db_error' => $err));
}

if ($path === '/migrate' && ($method === 'GET' || $method === 'POST')) {
    $token = trim((string)($_SERVER['HTTP_X_API_TOKEN'] ?? ''));
    if (API_TOKEN === '' || $token === '' || !hash_equals(API_TOKEN, $token)) jerr('Sai API token.', 403);
    $migrationRoot = dirname(__DIR__) . '/database';
    if (!is_dir($migrationRoot . '/migrations') || !is_file($migrationRoot . '/lib/Migrator.php')) jerr('Chưa deploy database/migrations.', 503);
    require_once $migrationRoot . '/lib/Migrator.php';
    try {
        $migrator = new Migrator(db(), $migrationRoot . '/migrations');
        $status = $migrator->status();
        $completed = 0;
        $pending = 0;
        foreach ($status as $row) {
            if ((string) $row['status'] === 'completed') $completed++;
            else $pending++;
        }
        $schoolCount = 0;
        try { $schoolCount = (int) q_one('SELECT COUNT(*) AS total FROM schools')['total']; } catch (Throwable $ignored) {}
        $payload = $method === 'GET' ? array() : body();
        $action = (string) ($payload['action'] ?? 'status');
        if ($action !== 'migrate') {
            j(array('ok' => true, 'completed' => $completed, 'pending' => $pending, 'schools' => $schoolCount, 'migrations' => $status));
        }
        if ($pending === 0) jerr('Không còn migration cần chạy.', 409);
        $slug = trim((string) ($payload['default_school_slug'] ?? ''));
        $name = trim((string) ($payload['default_school_name'] ?? ''));
        if ($schoolCount === 0 && ($slug === '' || $name === '')) jerr('Cần default_school_slug và default_school_name khi chưa có trường.', 422);
        if ($slug !== '') putenv('AWAWA_MIGRATION_DEFAULT_SCHOOL_SLUG=' . $slug);
        if ($name !== '') putenv('AWAWA_MIGRATION_DEFAULT_SCHOOL_NAME=' . $name);
        if (!empty($payload['default_school_code'])) putenv('AWAWA_MIGRATION_DEFAULT_SCHOOL_CODE=' . (string) $payload['default_school_code']);
        if (!empty($payload['assign_single_school'])) putenv('AWAWA_MIGRATION_ASSIGN_SINGLE_SCHOOL=1');
        $ran = $migrator->migrate();
        j(array('ok' => true, 'ran' => count($ran), 'results' => $ran, 'migrations' => $migrator->status()));
    } catch (Throwable $exception) {
        jerr('Migration lỗi: ' . $exception->getMessage(), 500);
    }
}

// ---------------- AUTH HỌC SINH ----------------
if ($path === '/auth/register' && $method === 'POST') {
    $b = body();
    $name = mb_substr(trim($b['name'] ?? ''), 0, 100);
    $class = mb_substr(trim($b['class_name'] ?? ''), 0, 50);
    $pw = (string)($b['password'] ?? '');
    if ($name === '') jerr('Thiếu họ tên.');
    if ($class === '') jerr('Thiếu lớp.');
    if (mb_strlen($pw) < 6) jerr('Mật khẩu ít nhất 6 ký tự.');
    $phone = norm_phone($b['phone'] ?? '');
    $email = valid_email($b['email'] ?? '');
    if ($phone === '' && $email === '') jerr('Cần số điện thoại hoặc email (ít nhất 1 trong 2).');
    if ($phone !== '' && q_one('SELECT 1 FROM students WHERE phone=?', array($phone))) jerr('Số điện thoại đã được dùng.');
    if ($email !== '' && q_one('SELECT 1 FROM students WHERE email=?', array($email))) jerr('Email đã được dùng.');
    $dob = valid_dob($b['dob'] ?? '');
    $gender = valid_gender($b['gender'] ?? '');
    $role = 'student';
    $tc = trim((string)($b['teacher_code'] ?? ''));
    if ($tc !== '') {
        $expect = envv('TEACHER_CODE', '');
        if ($expect === '' || !hash_equals($expect, $tc)) jerr('Mã giáo viên không đúng.');
        $role = 'teacher';
    }
    db()->prepare('INSERT INTO students (name, class_name, dob, gender, phone, email, password_hash, role) VALUES (?,?,?,?,?,?,?,?)')
        ->execute(array($name, $class, $dob, $gender, $phone === '' ? null : $phone, $email === '' ? null : $email, password_hash($pw, PASSWORD_DEFAULT), $role));
    $sid = (int)db()->lastInsertId();
    $tok = new_session($sid);
    j(array('token' => $tok, 'student' => public_student(q_one('SELECT * FROM students WHERE id=?', array($sid)))));
}

if ($path === '/auth/login' && $method === 'POST') {
    $b = body();
    $login = trim((string)($b['login'] ?? ''));
    $pw = (string)($b['password'] ?? '');
    if ($login === '' || $pw === '') jerr('Thiếu tên đăng nhập hoặc mật khẩu.');
    db()->prepare('DELETE FROM sessions WHERE expires_at < NOW()')->execute();
    $phone = norm_phone($login);
    $st = q_one('SELECT * FROM students WHERE phone=? OR email=?', array($phone, $login));
    if (!$st || empty($st['password_hash']) || !password_verify($pw, $st['password_hash'])) jerr('Sai tên đăng nhập hoặc mật khẩu.', 401);
    if (isset($st['active']) && (int)$st['active'] === 0) jerr('Tài khoản đã bị khóa. Liên hệ giáo viên/quan tri.', 403);
    $tok = new_session((int)$st['id']);
    j(array('token' => $tok, 'student' => public_student(q_one('SELECT * FROM students WHERE id=?', array($st['id'])))));
}

if ($path === '/auth/me' && $method === 'GET') {
    j(array('student' => session_student()));
}

if ($path === '/auth/logout' && $method === 'POST') {
    $tok = $_SERVER['HTTP_X_SESSION_TOKEN'] ?? '';
    if (preg_match('/^[a-f0-9]{64}$/', $tok)) {
        db()->prepare('DELETE FROM sessions WHERE token_hash=?')->execute(array(hash('sha256', $tok)));
    }
    j(array('ok' => true));
}

if ($path === '/auth/profile' && $method === 'PUT') {
    $me = session_student();
    $b = body();
    $name = mb_substr(trim($b['name'] ?? $me['name']), 0, 100);
    $class = mb_substr(trim($b['class_name'] ?? $me['class_name']), 0, 50);
    if ($name === '') jerr('Thiếu họ tên.');
    if ($class === '') jerr('Thiếu lớp.');
    $phone = norm_phone($b['phone'] ?? ($me['phone'] ?? ''));
    $email = valid_email($b['email'] ?? ($me['email'] ?? ''));
    if ($phone === '' && $email === '') jerr('Cần số điện thoại hoặc email (ít nhất 1 trong 2).');
    if ($phone !== '' && q_one('SELECT 1 FROM students WHERE phone=? AND id<>?', array($phone, $me['id']))) jerr('Số điện thoại đã được dùng.');
    if ($email !== '' && q_one('SELECT 1 FROM students WHERE email=? AND id<>?', array($email, $me['id']))) jerr('Email đã được dùng.');
    $dob = valid_dob($b['dob'] ?? ($me['dob'] ?? ''));
    $gender = valid_gender($b['gender'] ?? ($me['gender'] ?? ''));
    db()->prepare('UPDATE students SET name=?, class_name=?, dob=?, gender=?, phone=?, email=? WHERE id=?')
        ->execute(array($name, $class, $dob, $gender, $phone === '' ? null : $phone, $email === '' ? null : $email, $me['id']));
    j(array('student' => public_student(q_one('SELECT * FROM students WHERE id=?', array($me['id'])))));
}

if ($path === '/auth/password' && $method === 'PUT') {
    $me = session_student();
    $b = body();
    $full = q_one('SELECT * FROM students WHERE id=?', array($me['id']));
    if (empty($full['password_hash']) || !password_verify((string)($b['old_password'] ?? ''), $full['password_hash'])) jerr('Mật khẩu cũ không đúng.', 401);
    $npw = (string)($b['new_password'] ?? '');
    if (mb_strlen($npw) < 6) jerr('Mật khẩu mới ít nhất 6 ký tự.');
    db()->prepare('UPDATE students SET password_hash=? WHERE id=?')->execute(array(password_hash($npw, PASSWORD_DEFAULT), $me['id']));
    db()->prepare('DELETE FROM sessions WHERE student_id=?')->execute(array($me['id']));
    $tok = new_session((int)$me['id']);
    j(array('ok' => true, 'token' => $tok));
}

// ---------------- SUBJECTS ----------------
if ($method === 'GET' && $path === '/subjects') {
    j(q_all('SELECT * FROM subjects ORDER BY name'));
}

// ---------------- TOPICS (cay: parent_id/position/status) ----------------
if ($path === '/topics') {
    if ($method === 'GET') {
        $sid = $_GET['subject_id'] ?? '';
        $staffTopics = is_role_teacher(optional_session());
        $lessonStatus = $staffTopics ? '' : " AND COALESCE(l.status,'published')='published'";
        $base = "SELECT t.*, (SELECT COUNT(*) FROM lessons l WHERE l.topic_id=t.id" . $lessonStatus . ") lesson_count,
            (SELECT COUNT(*) FROM lessons l WHERE l.topic_id=t.id" . $lessonStatus . " AND COALESCE(l.required,1)=1) required_count FROM topics t";
        $rows = ($sid !== '')
            ? q_all($base . ' WHERE t.subject_id=? ORDER BY t.position, t.name', array($sid))
            : q_all($base . ' ORDER BY t.subject_id, t.position, t.name');
        // HS chi thay topic published; GV xem tat ca
        if (!$staffTopics) {
            $published = array();
            foreach ($rows as $r) {
                if (($r['status'] ?? 'published') === 'published') $published[(string)$r['id']] = $r;
            }
            $rows = array_values(array_filter($rows, function ($r) use ($published) {
                if (($r['status'] ?? 'published') !== 'published') return false;
                $parent = trim((string)($r['parent_id'] ?? ''));
                $seen = array();
                while ($parent !== '') {
                    if (isset($seen[$parent]) || !isset($published[$parent])) return false;
                    $seen[$parent] = true;
                    $parent = trim((string)($published[$parent]['parent_id'] ?? ''));
                }
                return true;
            }));
        }
        if (!empty($_GET['tree'])) {
            $byId = array();
            foreach ($rows as $r) { $r['children'] = array(); $byId[$r['id']] = $r; }
            $tree = array();
            foreach ($byId as $id => &$r) {
                $pid = $r['parent_id'] ?? null;
                if ($pid && isset($byId[$pid]) && $pid !== $id) $byId[$pid]['children'][] = &$r;
                else $tree[] = &$r;
            }
            unset($r);
            j($tree);
        }
        j($rows);
    }
    if ($method === 'POST') {
        require_perm('bank.manage');
        $b = body();
        $name = trim($b['name'] ?? '');
        if ($name === '') jerr('Thiếu tên chuyên đề');
        if (!q_one('SELECT 1 FROM subjects WHERE id=?', array($b['subject_id'] ?? ''))) jerr('Môn không tồn tại');
        $tid = trim($b['id'] ?? '');
        if ($tid === '') $tid = 't-' . substr(md5(uniqid('', true)), 0, 8);
        if (q_one('SELECT 1 FROM topics WHERE id=?', array($tid))) jerr('Mã chuyên đề đã tồn tại');
        $parent = validate_topic_parent($b['parent_id'] ?? '', $tid, $b['subject_id'] ?? '');
        $status = array_key_exists('status', $b) && $b['status'] !== null && $b['status'] !== '' ? (string)$b['status'] : 'published';
        if (!in_array($status, array('draft', 'review', 'published', 'archived'), true)) jerr('Trạng thái không hợp lệ.');
        $pos = isset($b['position']) ? max(1, (int)$b['position']) : (int)q_one('SELECT COALESCE(MAX(position),0)+1 p FROM topics WHERE subject_id=?', array($b['subject_id']))['p'];
        db()->prepare('INSERT INTO topics (id, subject_id, name, grade, description, parent_id, position, status) VALUES (?,?,?,?,?,?,?,?)')
            ->execute(array($tid, $b['subject_id'], mb_substr($name, 0, 200), (int)($b['grade'] ?? 12), mb_substr(trim($b['description'] ?? ''), 0, 1000), $parent !== '' ? $parent : null, $pos, $status));
        j(array('id' => $tid));
    }
}

if (preg_match('#^/topics/([^/]+)$#', $path, $m)) {
    $tid = $m[1];
    if ($method === 'PUT') {
        require_perm('bank.manage');
        $t = q_one('SELECT * FROM topics WHERE id=?', array($tid));
        if (!$t) jerr('Không tìm thấy chuyên đề', 404);
        $b = body();
        $name = trim($b['name'] ?? $t['name']);
        if ($name === '') $name = $t['name'];
        $desc = array_key_exists('description', $b) ? mb_substr(trim($b['description']), 0, 1000) : $t['description'];
        $grade = array_key_exists('grade', $b) && $b['grade'] !== null ? (int)$b['grade'] : (int)$t['grade'];
        $parent = array_key_exists('parent_id', $b) ? trim((string)($b['parent_id'] ?? '')) : trim((string)($t['parent_id'] ?? ''));
        $parent = validate_topic_parent($parent, $tid, $t['subject_id'] ?? '');
        $status = array_key_exists('status', $b) && $b['status'] !== null && $b['status'] !== '' ? (string)$b['status'] : ($t['status'] ?? 'published');
        if (!in_array($status, array('draft', 'review', 'published', 'archived'), true)) jerr('Trạng thái không hợp lệ.');
        $pos = array_key_exists('position', $b) && $b['position'] !== null ? max(1, (int)$b['position']) : (int)($t['position'] ?? 0);
        db()->prepare('UPDATE topics SET name=?, description=?, grade=?, parent_id=?, position=?, status=? WHERE id=?')
            ->execute(array(mb_substr($name, 0, 200), $desc, $grade, $parent !== '' ? $parent : null, $pos, $status, $tid));
        j(array('ok' => true));
    }
    if ($method === 'DELETE') {
        require_perm('bank.manage');
        if (!q_one('SELECT 1 FROM topics WHERE id=?', array($tid))) jerr('Không tìm thấy chuyên đề', 404);
        // Con tro thanh root; bai hoc xoa kem (giu behavior cu)
        db()->prepare('UPDATE topics SET parent_id=NULL WHERE parent_id=?')->execute(array($tid));
        $lids = q_all('SELECT id FROM lessons WHERE topic_id=?', array($tid));
        foreach ($lids as $l) {
            db()->prepare('DELETE FROM lesson_completions WHERE lesson_id=?')->execute(array($l['id']));
            db()->prepare('DELETE FROM lesson_blocks WHERE lesson_id=?')->execute(array($l['id']));
        }
        db()->prepare('DELETE FROM lessons WHERE topic_id=?')->execute(array($tid));
        db()->prepare('DELETE FROM topics WHERE id=?')->execute(array($tid));
        j(array('ok' => true));
    }
}

// ---------------- QUESTIONS LIST ----------------
if ($method === 'GET' && $path === '/questions') {
    require_perm('bank.manage');
    $sql = 'SELECT * FROM questions WHERE 1=1';
    $p = array();
    if (!empty($_GET['subject_id'])) { $sql .= ' AND subject_id=?'; $p[] = $_GET['subject_id']; }
    if (!empty($_GET['topic_id'])) { $sql .= ' AND topic_id=?'; $p[] = $_GET['topic_id']; }
    if (isset($_GET['grade']) && $_GET['grade'] !== '') { $sql .= ' AND grade=?'; $p[] = (int)$_GET['grade']; }
    if (!empty($_GET['difficulty'])) { $sql .= ' AND difficulty=?'; $p[] = $_GET['difficulty']; }
    if (!empty($_GET['qtype'])) { $sql .= ' AND qtype=?'; $p[] = $_GET['qtype']; }
    if (!empty($_GET['search'])) { $sql .= ' AND content LIKE ?'; $p[] = '%' . $_GET['search'] . '%'; }
    if (!empty($_GET['code'])) { $sql .= ' AND code LIKE ?'; $p[] = '%' . $_GET['code'] . '%'; }
    if (!empty($_GET['tag'])) { $sql .= ' AND tags LIKE ?'; $p[] = '%' . $_GET['tag'] . '%'; }
    $lim = isset($_GET['limit']) ? max(1, min((int)$_GET['limit'], 500)) : 200;
    $sql .= ' ORDER BY id DESC LIMIT ' . $lim;
    j(array_map(function ($row) { return row_to_q($row, true); }, q_all($sql, $p)));
}

if ($method === 'GET' && preg_match('#^/questions/(\d+)$#', $path, $m)) {
    require_perm('bank.manage');
    $r = q_one('SELECT * FROM questions WHERE id=?', array((int)$m[1]));
    if (!$r) jerr('Không tìm thấy câu hỏi', 404);
    j(row_to_q($r, true));
}

function insert_question_row($b, $source) {
    $code = mb_substr(trim($b['code'] ?? ''), 0, 64);
    $tags = json_encode(is_array($b['tags'] ?? null) ? $b['tags'] : array(), JSON_UNESCAPED_UNICODE);
    db()->prepare('INSERT INTO questions (subject_id, topic_id, grade, difficulty, qtype, content, options, correct_answer, explanation, score, source, image_url, code, tags) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
        ->execute(array(
            $b['subject_id'], $b['topic_id'] ?? null, (int)($b['grade'] ?? 12),
            $b['difficulty'] ?? 'vận dụng', $b['qtype'] ?? 'trac_nghiem', trim($b['content'] ?? ''),
            json_encode($b['options'] ?? array(), JSON_UNESCAPED_UNICODE),
            trim($b['correct_answer'] ?? ''), $b['explanation'] ?? '',
            (float)($b['score'] ?? 1), $source, mb_substr(trim($b['image_url'] ?? ''), 0, 2000),
            $code, $tags,
        ));
    $qid = (int)db()->lastInsertId();
    if ($code === '') {
        $code = 'Q' . $qid;
        db()->prepare('UPDATE questions SET code=? WHERE id=?')->execute(array($code, $qid));
    }
    return array($qid, $code);
}

// ---------------- QUESTION CREATE ----------------
if ($method === 'POST' && $path === '/questions') {
    require_perm('bank.manage');
    $b = body();
    if (empty($b['subject_id']) || trim($b['content'] ?? '') === '') jerr('Thiếu môn hoặc nội dung');
    if (!q_one('SELECT 1 FROM subjects WHERE id=?', array($b['subject_id']))) jerr('Môn không tồn tại');
    $b['source'] = 'thủ công';
    list($qid, $code) = insert_question_row($b, 'thủ công');
    j(array('id' => $qid, 'code' => $code));
}

if ($method === 'POST' && preg_match('#^/questions/(\d+)/duplicate$#', $path, $m)) {
    require_perm('bank.manage');
    $src = q_one('SELECT * FROM questions WHERE id=?', array((int)$m[1]));
    if (!$src) jerr('Không tìm thấy câu hỏi', 404);
    $b = array(
        'subject_id' => $src['subject_id'], 'topic_id' => $src['topic_id'],
        'grade' => (int)$src['grade'], 'difficulty' => $src['difficulty'],
        'qtype' => $src['qtype'], 'content' => $src['content'],
        'options' => json_decode($src['options'] ?: '[]', true),
        'correct_answer' => $src['correct_answer'], 'explanation' => $src['explanation'],
        'score' => (float)$src['score'], 'image_url' => $src['image_url'],
        'code' => '', 'tags' => json_decode($src['tags'] ?: '[]', true),
    );
    list($qid, $code) = insert_question_row($b, 'nhân bản');
    j(array('id' => $qid, 'code' => $code));
}

// ---------------- QUESTIONS BULK ----------------
if ($method === 'POST' && $path === '/questions/bulk') {
    require_perm('bank.manage');
    $b = body();
    $n = 0;
    foreach (($b['items'] ?? array()) as $it) {
        if (trim($it['content'] ?? '') === '' || empty($it['subject_id'])) continue;
        insert_question_row($it, 'nhập đề');
        $n++;
    }
    j(array('inserted' => $n));
}

// ---------------- QUESTION UPDATE/DELETE ----------------
if (preg_match('#^/questions/(\d+)$#', $path, $m)) {
    $qid = (int)$m[1];
    if ($method === 'PUT') {
        require_perm('bank.manage');
        $b = body();
        if (!q_one('SELECT 1 FROM questions WHERE id=?', array($qid))) jerr('Không tìm thấy câu hỏi', 404);
        $prev = q_one('SELECT code FROM questions WHERE id=?', array($qid));
        $code = mb_substr(trim($b['code'] ?? ($prev['code'] ?? '')), 0, 64);
        $tags = json_encode(is_array($b['tags'] ?? null) ? $b['tags'] : array(), JSON_UNESCAPED_UNICODE);
        db()->prepare('UPDATE questions SET subject_id=?, topic_id=?, grade=?, difficulty=?, qtype=?, content=?, options=?, correct_answer=?, explanation=?, score=?, image_url=?, code=?, tags=? WHERE id=?')
            ->execute(array(
                $b['subject_id'], $b['topic_id'] ?? null, (int)($b['grade'] ?? 12),
                $b['difficulty'] ?? 'vận dụng', $b['qtype'] ?? 'trac_nghiem', trim($b['content'] ?? ''),
                json_encode($b['options'] ?? array(), JSON_UNESCAPED_UNICODE),
                trim($b['correct_answer'] ?? ''), $b['explanation'] ?? '',
                (float)($b['score'] ?? 1), mb_substr(trim($b['image_url'] ?? ''), 0, 2000),
                $code, $tags, $qid,
            ));
        j(array('ok' => true));
    }
    if ($method === 'DELETE') {
        require_perm('bank.manage');
        db()->prepare('DELETE FROM questions WHERE id=?')->execute(array($qid));
        j(array('ok' => true));
    }
}

// ---------------- EXAMS ----------------
if ($method === 'POST' && $path === '/exams') {
    $b = body();
    $mode = $b['mode'] ?? 'practice';
    // De "shared" (dung trong Studio) chi GV+admin; practice/exam HS tu tao khi lam bai
    if ($mode === 'shared') require_perm('studio.manage');
    db()->prepare('INSERT INTO exams (title, mode, duration_min, question_ids) VALUES (?,?,?,?)')
        ->execute(array(
            $b['title'] ?? 'Đề', $mode, (int)($b['duration_min'] ?? 45),
            json_encode($b['question_ids'] ?? array(), JSON_UNESCAPED_UNICODE),
        ));
    j(array('id' => (int)db()->lastInsertId(), 'title' => $b['title'] ?? 'Đề', 'mode' => $mode));
}

if ($method === 'GET' && $path === '/exams') {
    $mode = isset($_GET['mode']) && $_GET['mode'] !== '' ? $_GET['mode'] : 'shared';
    $rows = q_all('SELECT id, title, mode, duration_min, question_ids, created_at FROM exams WHERE mode=? ORDER BY id DESC LIMIT 50', array($mode));
    $out = array();
    foreach ($rows as $r) {
        $ids = jlist($r['question_ids']);
        $out[] = array(
            'id' => (int)$r['id'], 'title' => $r['title'], 'mode' => $r['mode'],
            'duration_min' => (int)$r['duration_min'], 'n_questions' => count($ids),
            'created_at' => $r['created_at'],
        );
    }
    j($out);
}

if ($method === 'GET' && preg_match('#^/exams/(\d+)$#', $path, $m)) {
    $ex = q_one('SELECT * FROM exams WHERE id=?', array((int)$m[1]));
    if (!$ex) jerr('Không tìm thấy đề', 404);
    $previewViewer = isset($_GET['preview']) && $_GET['preview'] === '1' ? optional_session() : null;
    $includeAnswer = $previewViewer && is_role_teacher($previewViewer);
    $ids = jlist($ex['question_ids']);
    $doShuffle = !isset($ex['shuffle_q']) || (int)$ex['shuffle_q'] === 1;
    $wantShuffle = !isset($_GET['shuffle']) || (int)$_GET['shuffle'] === 1;
    if ($doShuffle && $wantShuffle && count($ids) > 1) shuffle($ids);
    $qs = array();
    if ($ids) {
        $in = implode(',', array_fill(0, count($ids), '?'));
        $byId = array();
        foreach (q_all("SELECT * FROM questions WHERE id IN ($in)", $ids) as $r) $byId[$r['id']] = $r;
        foreach ($ids as $qid) if (isset($byId[$qid])) $qs[] = row_to_q($byId[$qid], $includeAnswer);
    }
    j(array('id' => (int)$ex['id'], 'title' => $ex['title'], 'mode' => $ex['mode'],
        'duration_min' => (int)$ex['duration_min'], 'questions' => $qs,
        'shuffled' => (bool)($doShuffle && $wantShuffle)));
}

// ---------------- SUBMIT ----------------
if ($method === 'POST' && preg_match('#^/exams/(\d+)/submit$#', $path, $m)) {
    $eid = (int)$m[1];
    $b = body();
    $ex = q_one('SELECT * FROM exams WHERE id=?', array($eid));
    if (!$ex) jerr('Không tìm thấy đề', 404);
    $mode = $ex['mode'];
    $examId = (int) $ex['id'];
    $answers = is_array($b['answers'] ?? null) ? $b['answers'] : array();
    $allowedQuestionIds = array_fill_keys(array_map('intval', jlist($ex['question_ids'])), true);
    foreach ($answers as $answer) {
        $questionId = isset($answer['question_id']) ? (int) $answer['question_id'] : 0;
        if ($questionId <= 0 || !isset($allowedQuestionIds[$questionId])) jerr('Câu hỏi không thuộc đề.', 422);
    }
    $qids = array_values(array_unique(array_map(function ($a) {
        return isset($a['question_id']) ? (int)$a['question_id'] : 0;
    }, $answers)));
    $byId = array();
    if ($qids) {
        $in = implode(',', array_fill(0, count($qids), '?'));
        foreach (q_all("SELECT id, qtype, correct_answer FROM questions WHERE id IN ($in)", $qids) as $r) $byId[$r['id']] = $r;
    }
    $correct = 0; $total = 0;
    $details = array();
    foreach ($answers as $a) {
        $qid = isset($a['question_id']) ? (int)$a['question_id'] : 0;
        $qr = $byId[$qid] ?? null;
        if (!$qr) { $a['is_correct'] = null; $details[] = $a; continue; }
        if ($qr['qtype'] === 'trac_nghiem') {
            $total++;
            $ua = mb_strtoupper(trim($a['user_answer'] ?? ''));
            $ca = mb_strtoupper(trim($qr['correct_answer'] ?? ''));
            $ok = ($ua !== '' && $ua === $ca);
            if ($ok) $correct++;
            $a['is_correct'] = $ok;
        } elseif ($qr['qtype'] === 'diem_khuyet') {
            // Cloze: user_answer co the la array [{blank,text}] hoac string "a,b"
            $content = q_one('SELECT content FROM questions WHERE id=?', array($qid));
            $g = grade_cloze($content['content'] ?? '', $qr['correct_answer'] ?? '', $a['user_answer'] ?? '');
            if ($g) {
                $total += $g['total'];
                $correct += $g['correct'];
                $a['is_correct'] = ($g['correct'] >= $g['total']);
                $a['cloze'] = $g['detail'];
            } else {
                $a['is_correct'] = null;
            }
        } elseif ($qr['qtype'] === 'dung_sai') {
            $total++;
            $norm = function ($v) {
                $u = mb_strtoupper(preg_replace('/\s+/', '', trim((string) $v)));
                if (in_array($u, array('ĐÚNG', 'DUNG', 'TRUE', 'T', '1'), true)) return 'DUNG';
                if (in_array($u, array('SAI', 'FALSE', 'F', '0'), true)) return 'SAI';
                return $u;
            };
            $ua = $norm($a['user_answer'] ?? '');
            $ca = $norm($qr['correct_answer'] ?? '');
            $ok = $ua !== '' && $ua === $ca;
            if ($ok) $correct++;
            $a['is_correct'] = $ok;
        } else {
            $a['is_correct'] = null;
        }
        $details[] = $a;
    }
    $acc = $total ? $correct / $total : 0;
    $flog = is_array($b['focus_log'] ?? null) ? array_slice($b['focus_log'], 0, 200) : array();
    $sess = session_student();
    $sid = (int) $sess['id'];
    if (team_operations_ready()) {
        db()->prepare('INSERT INTO attempts (exam_id, team_id, mode, status, correct, total, accuracy, detail, student_name, student_id, focus_exits, focus_log, started_at, submitted_at) VALUES (?,?,?,\'submitted\',?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)')
            ->execute(array(
                $examId, $ex['team_id'] ?? null, $mode, $correct, $total, $acc,
                json_encode($details, JSON_UNESCAPED_UNICODE),
                mb_substr(trim((string) ($sess['name'] ?? '')), 0, 100), $sid,
                max(0, (int)($b['focus_exits'] ?? 0)),
                json_encode($flog, JSON_UNESCAPED_UNICODE),
            ));
    } else {
        db()->prepare('INSERT INTO attempts (exam_id, mode, correct, total, accuracy, detail, student_name, student_id, focus_exits, focus_log) VALUES (?,?,?,?,?,?,?,?,?,?)')
            ->execute(array(
                $examId, $mode, $correct, $total, $acc,
                json_encode($details, JSON_UNESCAPED_UNICODE),
                mb_substr(trim((string) ($sess['name'] ?? '')), 0, 100), $sid,
                max(0, (int)($b['focus_exits'] ?? 0)),
                json_encode($flog, JSON_UNESCAPED_UNICODE),
            ));
    }
    j(array('attempt_id' => (int)db()->lastInsertId(), 'correct' => $correct, 'total' => $total, 'accuracy' => $acc, 'focus_exits' => max(0, (int)($b['focus_exits'] ?? 0)), 'answers' => $details));
}

// ---------------- ATTEMPTS ----------------
if ($method === 'GET' && $path === '/attempts') {
    $me = optional_session();
    $isTeacher = $me && in_array(($me['role'] ?? 'student'), array('teacher', 'admin', 'super_admin'), true);
    if (!$me) j(array());
    $sql = 'SELECT * FROM attempts WHERE 1=1';
    $p = array();
    if (!$isTeacher) {
        $sql .= ' AND student_id=?'; $p[] = (int)$me['id'];
    } elseif (!empty($_GET['student_name'])) { $sql .= ' AND student_name=?'; $p[] = $_GET['student_name']; }
    if (!empty($_GET['mode'])) { $sql .= ' AND mode=?'; $p[] = $_GET['mode']; }
    $sql .= ' ORDER BY id DESC LIMIT 200';
    j(array_map('row_to_attempt', q_all($sql, $p)));
}

// ---------------- LEADERBOARD ----------------
// HS thay thay nhau: ten, lop, diem. Chi luot cua tai khoan dang dang nhap.
if ($method === 'GET' && $path === '/stats/leaderboard') {
    $mode = $_GET['mode'] ?? 'exam';
    $team = trim($_GET['team'] ?? '');
    $limit = max(1, min((int)($_GET['limit'] ?? 50), 100));
    $p = array();
    $attemptJoin = ' LEFT JOIN attempts a ON a.student_id=st.id AND a.total > 0';
    if ($mode === 'exam' || $mode === 'practice') { $attemptJoin .= ' AND a.mode=?'; $p[] = $mode; }
    $sql = "SELECT st.id, st.name, st.class_name, st.team, st.avatar_url,
        COUNT(a.id) n, MAX(a.accuracy) best, AVG(a.accuracy) avg, MAX(a.created_at) last_at,
        sc.aavg assign_avg, sc.an assign_n
        FROM students st" . $attemptJoin . "
        LEFT JOIN (
            SELECT student_id, AVG(score) aavg, COUNT(*) an
            FROM submissions WHERE score IS NOT NULL GROUP BY student_id
        ) sc ON sc.student_id = st.id
        WHERE COALESCE(st.role,'student') NOT IN ('teacher','admin','super_admin')
          AND COALESCE(st.active,1)=1";
    if ($team !== '') { $sql .= ' AND st.team=?'; $p[] = $team; }
    $sql .= ' GROUP BY st.id ORDER BY best DESC, avg DESC, n DESC LIMIT ' . $limit;
    $out = array(); $rank = 0;
    try { $leaderboardRows = q_all($sql, $p); }
    catch (Throwable $e) { jerr('Leaderboard loi: ' . $e->getMessage(), 500); }
    foreach ($leaderboardRows as $r) {
        $rank++;
        $out[] = array(
            'rank' => $rank, 'student_id' => (int)$r['id'], 'name' => $r['name'],
            'class_name' => $r['class_name'], 'team' => $r['team'],
            'avatar_url' => $r['avatar_url'] ?? null,
            'attempts' => (int)$r['n'],
            'best' => $r['best'] !== null ? round((float)$r['best'], 4) : null,
            'avg' => $r['avg'] !== null ? round((float)$r['avg'], 4) : null,
            'assign_avg' => $r['assign_avg'] !== null ? round((float)$r['assign_avg'], 1) : null,
            'assign_n' => $r['assign_n'] !== null ? (int)$r['assign_n'] : 0,
            'last_at' => $r['last_at'],
        );
    }
    // Neu chua ai thi -> lay bang diem bai tap (dang nop/cham) de HS van thay nhau
    if (!$out && ($mode === 'assign' || $mode === 'all')) {
        $rows = q_all("SELECT st.id, st.name, st.class_name, st.team, st.avatar_url,
            AVG(sub.score) best, AVG(sub.score) avg, COUNT(*) n, MAX(sub.graded_at) last_at
            FROM submissions sub JOIN students st ON st.id=sub.student_id
            WHERE sub.score IS NOT NULL AND COALESCE(st.role,'student') NOT IN ('teacher','admin','super_admin')
            GROUP BY st.id ORDER BY best DESC LIMIT " . $limit);
        foreach ($rows as $r) {
            $rank++;
            $out[] = array(
                'rank' => $rank, 'student_id' => (int)$r['id'], 'name' => $r['name'],
                'class_name' => $r['class_name'], 'team' => $r['team'],
                'avatar_url' => $r['avatar_url'] ?? null, 'attempts' => (int)$r['n'],
                'best' => round((float)$r['best'] / 10, 4), 'avg' => round((float)$r['avg'] / 10, 4),
                'assign_avg' => round((float)$r['best'], 1), 'assign_n' => (int)$r['n'],
                'last_at' => $r['last_at'],
            );
        }
    }
    j(array('mode' => $mode, 'board' => $out));
}

// ---------------- STATS ----------------
if ($method === 'GET' && $path === '/stats/overview') {
    $me = optional_session();
    $isTeacher = $me && in_array(($me['role'] ?? 'student'), array('teacher', 'admin', 'super_admin'), true);
    $filter = $_GET['student_name'] ?? '';
    if ($me && !$isTeacher) $filter = $me['name']; // học sinh chỉ xem số của mình
    $totalQ = (int)q_one('SELECT COUNT(*) c FROM questions')['c'];
    if ($filter !== '') {
        $rows = q_all('SELECT correct, total FROM attempts WHERE student_name=?', array($filter));
        $totalA = count($rows);
    } else {
        $totalA = (int)q_one('SELECT COUNT(*) c FROM attempts')['c'];
        $rows = q_all('SELECT correct, total FROM attempts');
    }
    $c = 0; $t = 0;
    foreach ($rows as $r) { $c += (int)$r['correct']; $t += (int)$r['total']; }

    $bySubject = array();
    foreach (q_all('SELECT s.name subject, COUNT(q.id) count FROM subjects s LEFT JOIN questions q ON q.subject_id=s.id GROUP BY s.id ORDER BY count DESC') as $r) {
        $bySubject[] = array('subject' => $r['subject'], 'count' => (int)$r['count']);
    }

    $lim = $filter !== '' ? 2000 : 500;
    $det = q_all('SELECT detail, student_name FROM attempts ORDER BY id DESC LIMIT ' . $lim);
    if ($filter !== '') {
        $det = array_values(array_filter($det, function ($a) use ($filter) { return $a['student_name'] === $filter; }));
    }
    $need = array();
    foreach ($det as $a) {
        foreach (jlist($a['detail']) as $d) {
            if (isset($d['question_id'])) $need[(int)$d['question_id']] = true;
        }
    }
    $qTopic = array();
    $ids = array_keys($need);
    foreach (array_chunk($ids, 500) as $chunk) {
        if (!$chunk) continue;
        $in = implode(',', array_fill(0, count($chunk), '?'));
        foreach (q_all("SELECT id, topic_id FROM questions WHERE id IN ($in)", $chunk) as $r) $qTopic[$r['id']] = $r['topic_id'];
    }
    $tName = topic_map();
    $tstat = array();
    foreach ($det as $a) {
        foreach (jlist($a['detail']) as $d) {
            if (!isset($d['is_correct']) || $d['is_correct'] === null) continue;
            $tid = $qTopic[(int)($d['question_id'] ?? 0)] ?? null;
            if (!$tid) continue;
            $nm = $tName[$tid] ?? $tid;
            if (!isset($tstat[$nm])) $tstat[$nm] = array('topic' => $nm, 'done' => 0, 'total' => 0);
            $tstat[$nm]['total']++;
            if ($d['is_correct']) $tstat[$nm]['done']++;
        }
    }
    $byTopic = array_values($tstat);
    foreach ($byTopic as &$v) $v['accuracy'] = $v['total'] ? $v['done'] / $v['total'] : 0;
    unset($v);
    usort($byTopic, function ($a, $b) { return $a['accuracy'] <=> $b['accuracy']; });
    $weak = array_values(array_filter($byTopic, function ($x) { return $x['accuracy'] < 0.8; }));
    $weak = array_slice($weak, 0, 6);

    $byStudent = array();
    if ($filter === '') {
        foreach (q_all("SELECT student_name, COUNT(*) n, COALESCE(SUM(correct),0) c, COALESCE(SUM(total),0) t, MAX(created_at) last_at FROM attempts WHERE student_name<>'' GROUP BY student_name ORDER BY (COALESCE(SUM(correct),0)/NULLIF(COALESCE(SUM(total),0),0)) DESC LIMIT 100") as $r) {
            $tt = (int)$r['t']; $cc = (int)$r['c'];
            $byStudent[] = array(
                'student_name' => $r['student_name'], 'attempts' => (int)$r['n'],
                'correct' => $cc, 'total' => $tt,
                'accuracy' => $tt ? $cc / $tt : 0, 'last_at' => $r['last_at'],
            );
        }
    }

    j(array(
        'total_questions' => $totalQ, 'total_attempts' => $totalA, 'accuracy' => $t ? $c / $t : 0,
        'by_subject' => $bySubject, 'by_topic' => $byTopic, 'weak_topics' => $weak,
        'by_student' => $byStudent,
    ));
}

// ---------------- STUDENTS ----------------
if ($path === '/students') {
    if ($method === 'GET') {
        $me = optional_session();
        if (!$me) j(array());
        $role = $me['role'] ?? 'student';
        // JOIN phai truoc WHERE — nếu nối sau WHERE 1=1 sẽ lỗi SQL 500
        $sql = 'SELECT DISTINCT s.* FROM students s';
        $p = array();
        if ($role === 'teacher') {
            $tids = teacher_coached_team_ids((int)$me['id']);
            if (!$tids) j(array());
            $in = implode(',', array_fill(0, count($tids), '?'));
            $sql .= " JOIN team_memberships tm ON tm.user_id=s.id AND tm.role='student' AND tm.access='include' AND tm.status='active' AND tm.left_at IS NULL AND tm.team_id IN ($in)";
            $p = array_merge($p, $tids);
        }
        $sql .= ' WHERE 1=1';
        if ($role !== 'teacher' && $role !== 'admin' && $role !== 'super_admin') {
            $sql .= ' AND s.id=?';
            $p[] = (int)$me['id'];
        }
        if (!empty($_GET['team'])) { $sql .= ' AND s.team=?'; $p[] = $_GET['team']; }
        if (!empty($_GET['search'])) { $sql .= ' AND s.name LIKE ?'; $p[] = '%' . $_GET['search'] . '%'; }
        if (isset($_GET['active']) && $_GET['active'] !== '') { $sql .= ' AND s.active=?'; $p[] = (int)$_GET['active']; }
        $sql .= ' ORDER BY s.team, s.name LIMIT 500';
        $rows = q_all($sql, $p);
        foreach ($rows as &$r) {
            if (!isset($r['active']) || $r['active'] === null) $r['active'] = 1;
            unset($r['password_hash']);
        }
        j($rows);
    }
    if ($method === 'POST') {
        $me = require_teacher();
        $b = body();
        if (trim($b['name'] ?? '') === '') jerr('Thiếu tên học sinh');
        $team = mb_substr(trim($b['team'] ?? ''), 0, 50);
        $tid = isset($b['team_id']) && $b['team_id'] ? (int)$b['team_id'] : 0;
        if (!is_admin($me) && !$tid) {
            $mine = teacher_coached_team_ids((int)$me['id']);
            $tid = $mine ? $mine[0] : 0;
        }
        $schoolId = 0;
        if ($tid) {
            $t = q_one('SELECT name, school_id FROM teams WHERE id=?', array($tid));
            if ($t) {
                $team = $t['name'];
                $schoolId = (int)($t['school_id'] ?? 0);
            }
        }
        db()->prepare('INSERT INTO students (name, class_name, team, note, active, school_id) VALUES (?,?,?,?,1,?)')
            ->execute(array(
                mb_substr(trim($b['name']), 0, 100), mb_substr(trim($b['class_name'] ?? ''), 0, 50),
                $team, mb_substr(trim($b['note'] ?? ''), 0, 500), $schoolId > 0 ? $schoolId : null,
            ));
        $sid = (int)db()->lastInsertId();
        if ($schoolId > 0) sync_school_membership_target($schoolId, $sid, 'student', true);
        if ($tid) {
            sync_team_membership_target($tid, $sid, 'student', true, 'manual');
        }
        j(array('id' => $sid));
    }
}

if (preg_match('#^/students/(\d+)$#', $path, $m)) {
    $sid = (int)$m[1];
    if ($method === 'PUT') {
        $me = require_teacher();
        $b = body();
        if (!q_one('SELECT 1 FROM students WHERE id=?', array($sid))) jerr('Không tìm thấy học sinh', 404);
        require_same_team_or_admin($me, $sid);
        db()->prepare('UPDATE students SET name=?, class_name=?, team=?, note=? WHERE id=?')
            ->execute(array(
                mb_substr(trim($b['name'] ?? ''), 0, 100), mb_substr(trim($b['class_name'] ?? ''), 0, 50),
                mb_substr(trim($b['team'] ?? ''), 0, 50), mb_substr(trim($b['note'] ?? ''), 0, 500), $sid,
            ));
        j(array('ok' => true));
    }
    if ($method === 'DELETE') {
        $me = require_teacher();
        require_same_team_or_admin($me, $sid);
        remove_team_membership_target(null, $sid);
        remove_school_membership_target($sid);
        db()->prepare('DELETE FROM students WHERE id=?')->execute(array($sid));
        j(array('ok' => true));
    }
}

if (preg_match('#^/students/(\d+)/active$#', $path, $m)) {
    if ($method !== 'PUT') jerr('Không hỗ trợ.', 405);
    $me = require_admin();
    $sid = (int)$m[1];
    $b = body();
    $val = empty($b['active']) ? 0 : 1;
    if ((int)$me['id'] === $sid && $val === 0) jerr('Không thể khóa tài khoản của mình.');
    if (!q_one('SELECT 1 FROM students WHERE id=?', array($sid))) jerr('Không tìm thấy.', 404);
    db()->prepare('UPDATE students SET active=? WHERE id=?')->execute(array($val, $sid));
    if ($val === 0) db()->prepare('DELETE FROM sessions WHERE student_id=?')->execute(array($sid));
    j(array('ok' => true, 'active' => $val));
}

// Giáo viên đặt lại mật khẩu cho học sinh (quên mật khẩu) — cần tài khoản giáo viên.
if (preg_match('#^/students/(\d+)/reset-password$#', $path, $m)) {
    if ($method !== 'PUT') jerr('Không hỗ trợ.', 405);
    $me = require_teacher();
    $sid = (int)$m[1];
    if (!q_one('SELECT 1 FROM students WHERE id=?', array($sid))) jerr('Không tìm thấy học sinh', 404);
    require_same_team_or_admin($me, $sid);
    $b = body();
    $npw = (string)($b['password'] ?? '');
    if (mb_strlen($npw) < 6) jerr('Mật khẩu mới ít nhất 6 ký tự.');
    db()->prepare('UPDATE students SET password_hash=? WHERE id=?')->execute(array(password_hash($npw, PASSWORD_DEFAULT), $sid));
    db()->prepare('DELETE FROM sessions WHERE student_id=?')->execute(array($sid));
    j(array('ok' => true));
}

// ---------------- BULK USER (1.15) ----------------
if ($path === '/students/bulk' && $method === 'POST') {
    $me = require_me();
    if (!has_perm($me, 'students.bulk')) jerr('Bạn không có quyền bulk user.', 403);
    $b = body();
    $ids = array();
    foreach ((array)($b['ids'] ?? array()) as $i) {
        $i = (int)$i;
        if ($i > 0) $ids[] = $i;
    }
    if (!$ids) jerr('Chưa chọn tài khoản.');
    if (count($ids) > 200) jerr('Tối đa 200 tài khoản / lần.');
    $action = trim((string)($b['action'] ?? ''));
    $affected = 0;
    $skipped = array();
    if ($action === 'activate') {
        foreach ($ids as $sid) {
            if ($sid === (int)$me['id'] || !q_one('SELECT 1 FROM students WHERE id=?', array($sid))) { $skipped[] = $sid; continue; }
            db()->prepare('UPDATE students SET active=1 WHERE id=?')->execute(array($sid));
            $affected++;
        }
    } elseif ($action === 'deactivate') {
        foreach ($ids as $sid) {
            if ($sid === (int)$me['id'] || !q_one('SELECT 1 FROM students WHERE id=?', array($sid))) { $skipped[] = $sid; continue; }
            db()->prepare('UPDATE students SET active=0 WHERE id=?')->execute(array($sid));
            db()->prepare('DELETE FROM sessions WHERE student_id=?')->execute(array($sid));
            $affected++;
        }
    } elseif ($action === 'delete') {
        if (!has_perm($me, 'students.delete')) jerr('Bạn không có quyền xóa.', 403);
        foreach ($ids as $sid) {
            if ($sid === (int)$me['id'] || !q_one('SELECT 1 FROM students WHERE id=?', array($sid))) { $skipped[] = $sid; continue; }
            foreach (array('team_memberships', 'sessions', 'lesson_completions', 'notifications', 'class_members') as $t) {
                db()->prepare("DELETE FROM `$t` WHERE user_id=?")->execute(array($sid));
            }
            db()->prepare('DELETE FROM students WHERE id=?')->execute(array($sid));
            $affected++;
        }
    } elseif ($action === 'set_role') {
        if (!has_perm($me, 'students.role')) jerr('Chỉ super admin được đổi role.', 403);
        $newRole = trim((string)($b['role'] ?? ''));
        if (!in_array($newRole, array('student', 'teacher', 'admin'), true)) jerr('Role không hợp lệ.');
        foreach ($ids as $sid) {
            if ($sid === (int)$me['id'] || !q_one('SELECT 1 FROM students WHERE id=?', array($sid))) { $skipped[] = $sid; continue; }
            db()->prepare('UPDATE students SET role=? WHERE id=?')->execute(array($newRole, $sid));
            db()->prepare('DELETE FROM sessions WHERE student_id=?')->execute(array($sid));
            $affected++;
        }
    } else {
        jerr('Action không hỗ trợ: ' . $action);
    }
    j(array('ok' => true, 'action' => $action, 'affected' => $affected, 'skipped' => $skipped));
}

// ---------------- PERMISSION MATRIX (1.7) ----------------
if ($path === '/permissions' && $method === 'GET') {
    $me = require_me();
    $r = role_of($me);
    $matrix = array();
    $scopeMatrix = array();
    $keys = array();
    foreach (q_all('SELECT role, perm_key, allowed, scope FROM role_permissions ORDER BY role, perm_key') as $row) {
        $matrix[$row['role']][$row['perm_key']] = ((int)$row['allowed'] === 1);
        $scopeMatrix[$row['role']][$row['perm_key']] = (string)($row['scope'] ?? default_scope_for_role((string)$row['role']));
        $keys[$row['perm_key']] = true;
    }
    j(array(
        'my_role' => $r,
        'my_perms' => isset($matrix[$r]) ? $matrix[$r] : array(),
        'can_manage' => is_super_admin($me),
        'matrix' => is_super_admin($me) ? $matrix : array(),
        'scope_matrix' => is_super_admin($me) ? $scopeMatrix : array(),
        'roles' => array('student', 'teacher', 'admin', 'super_admin'),
        'perm_keys' => array_keys($keys),
    ));
}

if ($path === '/permissions' && $method === 'PUT') {
    require_super_admin();
    $b = body();
    $role = trim((string)($b['role'] ?? ''));
    if (!in_array($role, array('student', 'teacher', 'admin'), true)) jerr('Không được sửa super_admin.');
    $perms = is_array($b['perms'] ?? null) ? $b['perms'] : array();
    $scopes = is_array($b['scopes'] ?? null) ? $b['scopes'] : array();
    $maxScope = scope_rank(default_scope_for_role($role));
    $st = db()->prepare('INSERT INTO role_permissions (role, perm_key, allowed, scope) VALUES (?,?,?,?)
        ON DUPLICATE KEY UPDATE allowed=VALUES(allowed), scope=VALUES(scope), updated_at=CURRENT_TIMESTAMP');
    $n = 0;
    foreach ($perms as $k => $v) {
        $scope = (string)($scopes[$k] ?? default_scope_for_role($role));
        if (!in_array($scope, array('own', 'team', 'school', 'system'), true) || scope_rank($scope) > $maxScope) jerr('Scope không hợp lệ.');
        $st->execute(array($role, mb_substr((string)$k, 0, 96), $v ? 1 : 0, $scope));
        $n++;
    }
    j(array('ok' => true, 'role' => $role, 'changed' => $n));
}

// ---------------- CẤU TRÚC NHÀ TRƯỜNG (Phase 1a) ----------------
if ($path === '/school-years') {
    if ($method === 'GET') {
        j(q_all('SELECT * FROM school_years ORDER BY is_current DESC, name DESC'));
    }
    if ($method === 'POST') {
        require_admin();
        $b = body();
        $name = mb_substr(trim($b['name'] ?? ''), 0, 50);
        if ($name === '') jerr('Thiếu tên năm học.');
        $cur = empty($b['is_current']) ? 0 : 1;
        if ($cur) db()->exec('UPDATE school_years SET is_current=0');
        db()->prepare('INSERT INTO school_years (name, start_date, end_date, is_current) VALUES (?,?,?,?)')
            ->execute(array($name, $b['start_date'] ?? '', $b['end_date'] ?? '', $cur));
        j(array('id' => (int)db()->lastInsertId()));
    }
}

if (preg_match('#^/school-years/(\d+)$#', $path, $m)) {
    $sid = (int)$m[1];
    if ($method === 'PUT') {
        require_admin();
        $b = body();
        $name = mb_substr(trim($b['name'] ?? ''), 0, 50);
        if ($name === '') jerr('Thiếu tên năm học.');
        $cur = empty($b['is_current']) ? 0 : 1;
        if ($cur) db()->exec('UPDATE school_years SET is_current=0');
        db()->prepare('UPDATE school_years SET name=?, start_date=?, end_date=?, is_current=? WHERE id=?')
            ->execute(array($name, $b['start_date'] ?? '', $b['end_date'] ?? '', $cur, $sid));
        j(array('ok' => true));
    }
    if ($method === 'DELETE') {
        require_admin();
        db()->prepare('DELETE FROM school_years WHERE id=?')->execute(array($sid));
        j(array('ok' => true));
    }
}

if ($path === '/grades') {
    if ($method === 'GET') {
        j(q_all('SELECT g.*, y.name year_name FROM grades g LEFT JOIN school_years y ON y.id=g.school_year_id ORDER BY g.code, g.name'));
    }
    if ($method === 'POST') {
        require_admin();
        $b = body();
        $name = mb_substr(trim($b['name'] ?? ''), 0, 80);
        if ($name === '') jerr('Thiếu tên khối.');
        $yid = isset($b['school_year_id']) && $b['school_year_id'] ? (int)$b['school_year_id'] : null;
        if (!$yid) {
            $cy = q_one('SELECT id FROM school_years WHERE is_current=1 LIMIT 1');
            $yid = $cy ? (int)$cy['id'] : null;
        }
        db()->prepare('INSERT INTO grades (school_year_id, name, code) VALUES (?,?,?)')
            ->execute(array($yid, $name, mb_substr(trim($b['code'] ?? ''), 0, 20)));
        j(array('id' => (int)db()->lastInsertId()));
    }
}

if (preg_match('#^/grades/(\d+)$#', $path, $m)) {
    $gid = (int)$m[1];
    if ($method === 'PUT') {
        require_admin();
        $b = body();
        db()->prepare('UPDATE grades SET name=?, code=? WHERE id=?')
            ->execute(array(mb_substr(trim($b['name'] ?? ''), 0, 80), mb_substr(trim($b['code'] ?? ''), 0, 20), $gid));
        j(array('ok' => true));
    }
    if ($method === 'DELETE') {
        require_admin();
        db()->prepare('DELETE FROM grades WHERE id=?')->execute(array($gid));
        j(array('ok' => true));
    }
}

if ($path === '/teams') {
    if ($method === 'GET') {
        $me = optional_session();
        $mine = !empty($_GET['mine']);
        $sql = "SELECT t.*, y.name year_name, g.name grade_name, s.name subject_name,
            (SELECT COUNT(*) FROM team_memberships tm WHERE tm.team_id=t.id AND tm.role='student' AND tm.access='include' AND tm.status='active' AND tm.left_at IS NULL) student_count,
            (SELECT COUNT(*) FROM team_memberships tm WHERE tm.team_id=t.id AND tm.role='coach' AND tm.access='include' AND tm.status='active' AND tm.left_at IS NULL) coach_count
            FROM teams t
            LEFT JOIN school_years y ON y.id=t.school_year_id
            LEFT JOIN grades g ON g.id=t.grade_id
            LEFT JOIN subjects s ON s.id=t.subject_id";
        $p = array();
        if (!empty($_GET['school_year_id'])) { $sql .= ' WHERE t.school_year_id=?'; $p[] = (int)$_GET['school_year_id']; }
        if ($mine && $me && !is_admin($me)) {
            $tids = teacher_coached_team_ids((int)$me['id']);
            if (!$tids) j(array());
            $in = implode(',', array_fill(0, count($tids), '?'));
            $sql .= (strpos($sql, ' WHERE ') !== false ? ' AND' : ' WHERE') . " t.id IN ($in)";
            $p = array_merge($p, $tids);
        }
        $sql .= ' ORDER BY t.name';
        j(q_all($sql, $p));
    }
    if ($method === 'POST') {
        require_admin();
        $b = body();
        $name = mb_substr(trim($b['name'] ?? ''), 0, 120);
        if ($name === '') jerr('Thiếu tên đội tuyển.');
        $yid = isset($b['school_year_id']) && $b['school_year_id'] ? (int)$b['school_year_id'] : null;
        if (!$yid) {
            $cy = q_one('SELECT id FROM school_years WHERE is_current=1 LIMIT 1');
            $yid = $cy ? (int)$cy['id'] : null;
        }
        db()->prepare('INSERT INTO teams (school_year_id, grade_id, subject_id, name, description) VALUES (?,?,?,?,?)')
            ->execute(array(
                $yid,
                isset($b['grade_id']) && $b['grade_id'] ? (int)$b['grade_id'] : null,
                !empty($b['subject_id']) ? $b['subject_id'] : null,
                $name, mb_substr(trim($b['description'] ?? ''), 0, 500),
            ));
        j(array('id' => (int)db()->lastInsertId()));
    }
}

if (preg_match('#^/teams/(\d+)$#', $path, $m)) {
    $tid = (int)$m[1];
    if ($method === 'PUT') {
        require_admin();
        $b = body();
        db()->prepare('UPDATE teams SET name=?, subject_id=?, grade_id=?, description=? WHERE id=?')
            ->execute(array(
                mb_substr(trim($b['name'] ?? ''), 0, 120),
                !empty($b['subject_id']) ? $b['subject_id'] : null,
                isset($b['grade_id']) && $b['grade_id'] ? (int)$b['grade_id'] : null,
                mb_substr(trim($b['description'] ?? ''), 0, 500), $tid,
            ));
        j(array('ok' => true));
    }
    if ($method === 'DELETE') {
        require_admin();
        remove_team_membership_target($tid);
        db()->prepare('DELETE FROM teams WHERE id=?')->execute(array($tid));
        j(array('ok' => true));
    }
}

if (preg_match('#^/teams/(\d+)/members$#', $path, $m)) {
    $tid = (int)$m[1];
    if ($method === 'GET') {
        require_teacher();
        j(q_all(
            "SELECT tm.id mid, tm.user_id, tm.role member_role, tm.access, tm.status, tm.source, tm.joined_at, tm.left_at,
                    s.name, s.class_name, s.phone, s.email, s.role, s.active
             FROM team_memberships tm JOIN students s ON s.id=tm.user_id
             WHERE tm.team_id=? ORDER BY tm.role DESC, s.name",
            array($tid)
        ));
    }
    if ($method === 'POST') {
        $me = require_teacher();
        $b = body();
        $uid = (int)($b['user_id'] ?? 0);
        $role = trim($b['member_role'] ?? 'student');
        if (!in_array($role, array('student', 'coach'), true)) $role = 'student';
        if (!q_one('SELECT 1 FROM teams WHERE id=?', array($tid))) jerr('Không tìm thấy đội.', 404);
        if (!q_one('SELECT 1 FROM students WHERE id=?', array($uid))) jerr('Không tìm thấy người dùng.', 404);
        if (!is_admin($me)) {
            $mine = teacher_coached_team_ids((int)$me['id']);
            if (!in_array($tid, $mine, true)) jerr('Bạn không phụ trách đội này.', 403);
            if ($role === 'coach') jerr('Chỉ admin được phân công coach.', 403);
        }
        sync_team_membership_target($tid, $uid, $role, true, 'manual');
        if ($role === 'student') {
            $t = q_one('SELECT name FROM teams WHERE id=?', array($tid));
            if ($t) db()->prepare('UPDATE students SET team=? WHERE id=?')->execute(array($t['name'], $uid));
        }
        j(array('ok' => true));
    }
}

if (preg_match('#^/teams/(\d+)/members/(\d+)$#', $path, $m)) {
    $tid = (int)$m[1];
    $uid = (int)$m[2];
    if ($method === 'DELETE') {
        $me = require_teacher();
        if (!is_admin($me)) {
            $mine = teacher_coached_team_ids((int)$me['id']);
            if (!in_array($tid, $mine, true)) jerr('Bạn không phụ trách đội này.', 403);
        }
        remove_team_membership_target($tid, $uid);
        j(array('ok' => true));
    }
}

if ($path === '/me/teams') {
    if ($method !== 'GET') jerr('Không hỗ trợ.', 405);
    $me = optional_session();
    if (!$me) j(array());
    if (is_admin($me)) {
        j(q_all("SELECT t.*,
            (SELECT COUNT(*) FROM team_memberships tm WHERE tm.team_id=t.id AND tm.role='student' AND tm.access='include' AND tm.status='active' AND tm.left_at IS NULL) student_count
            FROM teams t ORDER BY t.name"));
    }
    $tids = teacher_coached_team_ids((int)$me['id']);
    if (!$tids) j(array());
    $in = implode(',', array_fill(0, count($tids), '?'));
    j(q_all("SELECT t.*,
        (SELECT COUNT(*) FROM team_memberships tm WHERE tm.team_id=t.id AND tm.role='student' AND tm.access='include' AND tm.status='active' AND tm.left_at IS NULL) student_count
        FROM teams t WHERE t.id IN ($in) ORDER BY t.name", $tids));
}

if ($path === '/me/subjects' && $method === 'GET') {
    $me = require_me();
    $ids = my_class_ids($me['id']);
    if (!$ids) j(array());
    $in = implode(',', array_fill(0, count($ids), '?'));
    j(q_all("SELECT DISTINCT s.id, s.name, s.code FROM subjects s JOIN teams t ON t.subject_id=s.id WHERE t.id IN ($in) ORDER BY s.name", $ids));
}

// ---------------- UPLOAD ẢNH + HỌC LIỆU / BÀI TẬP ----------------
if ($method === 'POST' && $path === '/uploads') {
    $me = optional_session();
    if (!$me) jerr('Chưa đăng nhập.', 401);
    $role = $me['role'] ?? 'student';
    if (empty($_FILES['file']) || $_FILES['file']['error'] !== UPLOAD_ERR_OK) jerr('Chưa nhận được file.');
    $f = $_FILES['file'];
    $maxBytes = MAX_UPLOAD_MB * 1024 * 1024;
    if ($f['size'] > $maxBytes) jerr('File quá lớn (tối đa ' . MAX_UPLOAD_MB . 'MB).');
    $ext = strtolower(pathinfo($f['name'], PATHINFO_EXTENSION));
    $imgOk = array('jpg', 'jpeg', 'png', 'webp', 'gif');
    $docOk = array('pdf', 'doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx', 'txt', 'zip', 'rar');
    $isStaff = in_array($role, array('teacher', 'admin'), true);
    if ($isStaff) {
        if (!in_array($ext, array_merge($imgOk, $docOk))) jerr('Chỉ nhận ảnh hoặc file tài liệu (pdf/doc/docx/ppt…).');
    } else {
        if (!in_array($ext, $docOk)) jerr('Học sinh chỉ nộp file pdf/doc/docx/zip…');
    }
    if (in_array($ext, $imgOk, true)) {
        $info = @getimagesize($f['tmp_name']);
        if ($info === false) jerr('File không phải ảnh hợp lệ.');
    }
    $dir = rtrim(UPLOAD_DIR, '/');
    if (!is_dir($dir) && !mkdir($dir, 0755, true)) jerr('Không tạo được thư mục uploads.', 500);
    $safe = preg_replace('/[^\w.\-]/u', '_', $f['name']);
    $name = time() . '-' . mb_substr($safe, 0, 80);
    if (!move_uploaded_file($f['tmp_name'], $dir . '/' . $name)) jerr('Không lưu được file.', 500);
    $teamId = (int)($_POST['team_id'] ?? 0);
    if ($role === 'student' && $teamId <= 0) jerr('Học sinh phải tải file trong phạm vi đội tuyển.', 422);
    if ($teamId > 0) {
        $team = q_one('SELECT school_id FROM teams WHERE id=?', array($teamId));
        if (!$team) { @unlink($dir . '/' . $name); jerr('Không tìm thấy đội.', 404); }
        $allowed = is_admin($me) || in_array($teamId, teacher_coached_team_ids((int) $me['id']), true) || in_array($teamId, student_team_ids((int) $me['id']), true);
        if (!$allowed) { @unlink($dir . '/' . $name); jerr('Bạn không có quyền tải lên đội này.', 403); }
    }
    $mime = function_exists('mime_content_type') ? (string) mime_content_type($dir . '/' . $name) : (string) ($f['type'] ?? 'application/octet-stream');
    $ownerType = preg_replace('/[^a-z_]/i', '', (string)($_POST['owner_type'] ?? 'upload')) ?: 'upload';
    $ownerId = mb_substr(trim((string)($_POST['owner_id'] ?? '')), 0, 128);
    $assetId = policy_create_file_asset($me, $name, (string)$f['name'], $mime, (int)$f['size'], $teamId, $ownerType, $ownerId);
    if ($assetId <= 0) {
        @unlink($dir . '/' . $name);
        jerr('Chưa chạy migration file_assets.', 503);
    }
    $asset = q_one('SELECT school_id, team_id FROM file_assets WHERE id=?', array($assetId));
    policy_audit($me, array('school_id' => $asset['school_id'] ?? null, 'team_id' => $asset['team_id'] ?? null), 'file.upload', 'file_asset', (string)$assetId, 'allow', '', array('mime_type' => $mime, 'size_bytes' => (int)$f['size']));
    j(array('asset_id' => $assetId, 'url' => policy_file_url($assetId), 'name' => (string)$f['name'], 'mime_type' => $mime, 'size_bytes' => (int)$f['size']));
}

if ($method === 'GET' && preg_match('#^/files/([1-9][0-9]*)$#', $path, $match)) {
    $me = session_student();
    $asset = q_one("SELECT * FROM file_assets WHERE id=? AND status='active'", array((int)$match[1]));
    if (!$asset || !policy_actor_file_allowed($me, $asset)) jerr('Không tìm thấy tệp.', 404);
    $base = realpath(UPLOAD_DIR);
    $file = realpath(rtrim(UPLOAD_DIR, '/\\') . '/' . $asset['storage_key']);
    if ($base === false || $file === false || strpos($file, $base . DIRECTORY_SEPARATOR) !== 0 || !is_file($file)) jerr('Không tìm thấy tệp.', 404);
    $mime = (string)($asset['mime_type'] ?: 'application/octet-stream');
    $inline = strpos($mime, 'image/') === 0 || $mime === 'application/pdf' || $mime === 'text/plain';
    header('Content-Type: ' . $mime);
    header('Content-Length: ' . filesize($file));
    header('Content-Disposition: ' . ($inline ? 'inline' : 'attachment') . "; filename*=UTF-8''" . rawurlencode((string)$asset['original_name']));
    header('Cache-Control: private, no-store');
    policy_audit($me, array('school_id' => $asset['school_id'], 'team_id' => $asset['team_id']), 'file.access', 'file_asset', (string)$asset['id'], 'allow');
    readfile($file);
    exit;
}

// ---------------- AVATAR (luu webp) ----------------
// Client nen resize + chuyen webp truoc khi gui; server van chong ve va luu .webp
if ($path === '/me/avatar' && $method === 'POST') {
    $me = session_student();
    if (empty($_FILES['avatar']) || $_FILES['avatar']['error'] !== UPLOAD_ERR_OK) jerr('Thiếu file ảnh.');
    $f = $_FILES['avatar'];
    if ($f['size'] > 2 * 1024 * 1024) jerr('Ảnh tối đa 2MB.');
    $info = @getimagesize($f['tmp_name']);
    if ($info === false) jerr('File không phải ảnh hợp lệ.');
    $dir = rtrim(UPLOAD_DIR, '/') . '/avatars';
    if (!is_dir($dir) && !mkdir($dir, 0755, true)) jerr('Không tạo thư mục avatars.', 500);

    $ext = strtolower(pathinfo($f['name'], PATHINFO_EXTENSION));
    $fname = $me['id'] . '_' . time() . '.webp';
    $abs = rtrim(UPLOAD_DIR, '/') . '/avatars/' . $fname;

    $converted = false;
    if (function_exists('imagewebp')) {
        $src = null;
        $type = $info[2];
        if ($type === IMAGETYPE_JPEG && function_exists('imagecreatefromjpeg')) $src = @imagecreatefromjpeg($f['tmp_name']);
        elseif ($type === IMAGETYPE_PNG && function_exists('imagecreatefrompng')) $src = @imagecreatefrompng($f['tmp_name']);
        elseif ($type === IMAGETYPE_GIF && function_exists('imagecreatefromgif')) $src = @imagecreatefromgif($f['tmp_name']);
        elseif ($type === IMAGETYPE_WEBP && function_exists('imagecreatefromwebp')) $src = @imagecreatefromwebp($f['tmp_name']);
        if ($src) {
            $w = imagesx($src); $h = imagesy($src);
            $max = 256;
            if ($w > $max || $h > $max) {
                $ratio = min($max / $w, $max / $h);
                $nw = max(1, (int)round($w * $ratio));
                $nh = max(1, (int)round($h * $ratio));
                $dst = imagecreatetruecolor($nw, $nh);
                imagecopyresampled($dst, $src, 0, 0, 0, 0, $nw, $nh, $w, $h);
                imagedestroy($src);
                $src = $dst;
            }
            if (imagewebp($src, $abs, 82)) $converted = true;
            imagedestroy($src);
        }
    }
    if (!$converted) {
        // Khong GD/webp: chi chap nhan neu client da gui .webp
        if ($ext !== 'webp') jerr('Máy chủ không convert được ảnh — hãy tải lên dạng .webp (app tự chuyển khi chọn ảnh).', 500);
        if (!move_uploaded_file($f['tmp_name'], $abs)) jerr('Không lưu được file.', 500);
    }

    $storageKey = 'avatars/' . $fname;
    $assetId = policy_create_file_asset($me, $storageKey, (string)$f['name'], 'image/webp', (int)filesize($abs), 0, 'profile', (string)$me['id']);
    if ($assetId <= 0) {
        @unlink($abs);
        jerr('Chưa chạy migration file_assets.', 503);
    }
    $avatarUrl = policy_file_url($assetId);
    $old = q_one('SELECT avatar_url FROM students WHERE id=?', array($me['id']));
    if (!empty($old['avatar_url']) && strpos($old['avatar_url'], '/api/files/') !== false) {
        $oldId = (int) basename($old['avatar_url']);
        $oldAsset = $oldId > 0 ? q_one('SELECT storage_key FROM file_assets WHERE id=? AND uploader_user_id=?', array($oldId, (int)$me['id'])) : null;
        if ($oldAsset) {
            $oldAbs = rtrim(UPLOAD_DIR, '/') . '/' . $oldAsset['storage_key'];
            if (is_file($oldAbs)) @unlink($oldAbs);
            db()->prepare("UPDATE file_assets SET status='deleted', updated_at=NOW() WHERE id=?")->execute(array($oldId));
        }
    } elseif (!empty($old['avatar_url']) && strpos($old['avatar_url'], '/uploads/avatars/') === 0) {
        $oldAbs = rtrim(UPLOAD_DIR, '/') . '/avatars/' . basename($old['avatar_url']);
        if (is_file($oldAbs)) @unlink($oldAbs);
    }
    db()->prepare('UPDATE students SET avatar_url=? WHERE id=?')->execute(array($avatarUrl, $me['id']));
    $fresh = q_one('SELECT * FROM students WHERE id=?', array($me['id']));
    j(array('ok' => true, 'avatar_url' => $avatarUrl, 'asset_id' => $assetId, 'student' => public_student($fresh)));
}

if ($path === '/me/avatar' && $method === 'DELETE') {
    $me = session_student();
    $old = q_one('SELECT avatar_url FROM students WHERE id=?', array($me['id']));
    if (!empty($old['avatar_url']) && strpos($old['avatar_url'], '/api/files/') !== false) {
        $oldId = (int) basename($old['avatar_url']);
        $oldAsset = $oldId > 0 ? q_one('SELECT storage_key FROM file_assets WHERE id=? AND uploader_user_id=?', array($oldId, (int)$me['id'])) : null;
        if ($oldAsset) {
            $oldAbs = rtrim(UPLOAD_DIR, '/') . '/' . $oldAsset['storage_key'];
            if (is_file($oldAbs)) @unlink($oldAbs);
            db()->prepare("UPDATE file_assets SET status='deleted', updated_at=NOW() WHERE id=?")->execute(array($oldId));
        }
    }
    db()->prepare('UPDATE students SET avatar_url=NULL WHERE id=?')->execute(array($me['id']));
    j(array('ok' => true));
}

// ================= MVP: LOP / BAI TAP / CHAM DIEM =================
// M2: classes -> teams. "class" o endpoints la alias cua team.
// my_class_ids = teams HS dang la thanh vien (member_role='student').

function my_class_ids($user_id) {
    return student_team_ids((int)$user_id);
}

// teacher admin coi duoc tat ca; teacher thuong chi to chuc doi minh
function assign_team_ids_visible($me) {
    if (!$me) return array();
    if (is_admin($me)) {
        $ids = array();
        foreach (q_all('SELECT id FROM teams ORDER BY id') as $r) $ids[] = (int)$r['id'];
        return $ids;
    }
    return teacher_coached_team_ids((int)$me['id']);
}

function require_me() {
    return session_student();
}

function is_role_teacher($me) {
    return $me && in_array(($me['role'] ?? 'student'), array('teacher', 'admin', 'super_admin'), true);
}

function sub_status($sub) {
    if (!$sub) return 'todo';
    if ($sub['score'] !== null) return 'graded';
    if ($sub['submitted_at'] !== null && $sub['submitted_at'] !== '') return 'submitted';
    return 'draft';
}

// M3: dong bo submission_answers tu map idx=>text (ghi de, chua cham)
function sync_submission_answers($sid, $aid, $map) {
    $aqs = q_all('SELECT id, idx, question_id FROM assign_questions WHERE assignment_id=? ORDER BY idx', array($aid));
    if (!$aqs) return;
    db()->prepare('DELETE FROM submission_answers WHERE submission_id=?')->execute(array($sid));
    $ins = db()->prepare('INSERT INTO submission_answers (submission_id, question_id, assign_q_idx, answer) VALUES (?,?,?,?)');
    foreach ($aqs as $aq) {
        $idx = (int)$aq['idx'];
        $text = isset($map[(string)$idx]) ? (string)$map[(string)$idx] : (isset($map[$idx]) ? (string)$map[$idx] : '');
        $ins->execute(array($sid, $aq['question_id'], $idx, mb_substr($text, 0, 4000)));
    }
}

function deadline_passed($deadline) {
    if ($deadline === null || $deadline === '') return false;
    // Date-only → so sanh den cuoi ngay
    if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $deadline)) {
        return strtotime($deadline . ' 23:59:59') < time();
    }
    $t = strtotime($deadline);
    return $t !== false && $t < time();
}

// ---------------- CLASS (ALIAS TEAM) — M2: /classes hoc = /teams ----------------
if ($path === '/classes' && $method === 'GET') {
    // Alias /classes -> /teams (M2)
    $me = require_me();
    if (is_role_teacher($me)) {
        j(q_all('SELECT id, name, join_code, created_at FROM teams ORDER BY name'));
    }
    $ids = my_class_ids($me['id']);
    if (!$ids) { j(array()); }
    $in = implode(',', array_fill(0, count($ids), '?'));
    j(q_all("SELECT id, name, join_code, created_at FROM teams WHERE id IN ($in) ORDER BY name", $ids));
}

if ($path === '/classes' && $method === 'POST') {
    $me = require_me();
    if (!is_role_teacher($me)) jerr('Khu vực giáo viên.', 403);
    $b = body();
    $name = mb_substr(trim($b['name'] ?? ''), 0, 120);
    if ($name === '') jerr('Thiếu tên lớp.');
    $code = mb_substr(trim($b['join_code'] ?? ''), 0, 16);
    if ($code === '') $code = strtoupper(substr(md5(uniqid('', true)), 0, 6));
    if (q_one('SELECT 1 FROM teams WHERE join_code=?', array($code))) jerr('Mã lớp đã tồn tại.');
    $schoolId = school_membership_target_ready()
        ? (int)(q_one("SELECT school_id FROM school_memberships WHERE user_id=? AND role IN ('teacher','admin') AND status='active' AND left_at IS NULL ORDER BY id LIMIT 1", array((int)$me['id']))['school_id'] ?? 0)
        : (int)($me['school_id'] ?? 0);
    if ($schoolId <= 0) jerr('Tài khoản chưa được gán vào trường.', 409);
    db()->prepare('INSERT INTO teams (name, join_code, school_id) VALUES (?,?,?)')->execute(array($name, $code, $schoolId));
    $tid = (int)db()->lastInsertId();
    sync_team_membership_target($tid, $me['id'], 'coach', true, 'manual');
    j(array('id' => $tid, 'name' => $name, 'join_code' => $code));
}

if ($path === '/classes/join' && $method === 'POST') {
    $me = require_me();
    if (is_role_teacher($me)) jerr('Giáo viên không cần vào lớp bằng mã.', 400);
    $b = body();
    $code = trim($b['join_code'] ?? '');
    if ($code === '') jerr('Thiếu mã lớp.');
    $cl = q_one('SELECT id, name, join_code, school_id FROM teams WHERE join_code=?', array($code));
    if (!$cl) jerr('Mã lớp không đúng.', 404);
    $teamSchoolId = (int)($cl['school_id'] ?? 0);
    $studentSchoolId = (int)($me['school_id'] ?? 0);
    if ($teamSchoolId > 0 && $studentSchoolId > 0 && $teamSchoolId !== $studentSchoolId) jerr('Mã lớp không thuộc trường của bạn.', 403);
    sync_team_membership_target($cl['id'], $me['id'], 'student', true, 'invite');
    if ($teamSchoolId > 0) sync_school_membership_target($teamSchoolId, $me['id'], 'student', true);
    if ($teamSchoolId > 0 && $studentSchoolId <= 0) {
        db()->prepare('UPDATE students SET team=?, school_id=? WHERE id=?')->execute(array($cl['name'], $teamSchoolId, $me['id']));
    } else {
        db()->prepare('UPDATE students SET team=? WHERE id=?')->execute(array($cl['name'], $me['id']));
    }
    j(array('class' => array('id' => $cl['id'], 'name' => $cl['name'], 'join_code' => $cl['join_code'])));
}

if (preg_match('#^/classes/(\d+)/members$#', $path, $m)) {
    if ($method !== 'GET') jerr('Không hỗ trợ.', 405);
    $me = require_me();
    if (!is_role_teacher($me)) jerr('Khu vực giáo viên.', 403);
    $cid = (int)$m[1];
    j(array_map(function ($r) { unset($r['password_hash']); return $r; },
        q_all("SELECT s.id, s.name, s.class_name, s.role, tm.joined_at FROM team_memberships tm JOIN students s ON s.id=tm.user_id WHERE tm.team_id=? AND tm.role='student' AND tm.access='include' AND tm.status='active' AND tm.left_at IS NULL ORDER BY s.name", array($cid))));
}

// Team id cho assignment: nhan team_id hoac class_id (legacy), kie' m tra GV phai coach/admin
function resolve_assign_team($me, $b) {
    $tid = (int)($b['team_id'] ?? 0);
    if (!$tid) $tid = (int)($b['class_id'] ?? 0);
    if (!$tid) {
        $mine = teacher_coached_team_ids((int)$me['id']);
        if (is_admin($me)) {
            $any = q_one('SELECT id FROM teams ORDER BY id');
            $tid = $any ? (int)$any['id'] : 0;
        } else {
            $tid = $mine ? $mine[0] : 0;
        }
    }
    if (!$tid || !q_one('SELECT 1 FROM teams WHERE id=?', array($tid))) jerr('Thiếu đội tuyển.');
    if (!is_admin($me)) {
        $mine = teacher_coached_team_ids((int)$me['id']);
        if (!in_array($tid, $mine, true)) jerr('Bạn không phụ trách đội này.', 403);
    }
    return $tid;
}

// ---------------- ASSIGNMENTS ----------------
if ($path === '/assignments' && $method === 'GET') {
    $me = require_me();
    if (is_role_teacher($me)) {
        $tId = isset($_GET['team_id']) ? (int)$_GET['team_id'] : (isset($_GET['class_id']) ? (int)$_GET['class_id'] : 0);
        if ($tId) j(q_all('SELECT a.*, tt.name class_name, t.name topic_name FROM assignments a JOIN teams tt ON tt.id=a.team_id LEFT JOIN topics t ON t.id=a.topic_id WHERE a.team_id=? ORDER BY a.created_at DESC', array($tId)));
        j(q_all('SELECT a.*, tt.name class_name, t.name topic_name FROM assignments a JOIN teams tt ON tt.id=a.team_id LEFT JOIN topics t ON t.id=a.topic_id ORDER BY a.created_at DESC'));
    }
    $ids = my_class_ids($me['id']);
    if (!$ids) { j(array()); }
    $in = implode(',', array_fill(0, count($ids), '?'));
    $rows = q_all("SELECT a.*, tt.name class_name, t.name topic_name FROM assignments a JOIN teams tt ON tt.id=a.team_id LEFT JOIN topics t ON t.id=a.topic_id WHERE a.team_id IN ($in) ORDER BY a.created_at DESC", $ids);
    $out = array();
    foreach ($rows as $r) {
        $sub = q_one('SELECT id, score, feedback, submitted_at FROM submissions WHERE assignment_id=? AND student_id=?', array($r['id'], $me['id']));
        $r['my_submission'] = $sub ? $sub : null;
        $r['status'] = sub_status($sub);
        $out[] = $r;
    }
    j($out);
}

if ($path === '/assignments' && $method === 'POST') {
    $me = require_me();
    if (!is_role_teacher($me)) jerr('Khu vực giáo viên.', 403);
    $b = body();
    $title = mb_substr(trim($b['title'] ?? ''), 0, 255);
    if ($title === '') jerr('Thiếu tên bài tập.');
    $teamId = resolve_assign_team($me, $b);
    $topic = trim($b['topic_id'] ?? '');
    if ($topic === '') $topic = null;
    $deadline = trim($b['deadline'] ?? '');
    if ($deadline !== '' && !preg_match('/^\d{4}-\d{2}-\d{2}$/', $deadline)) $deadline = null;
    if ($deadline === '') $deadline = null;
    db()->prepare('INSERT INTO assignments (team_id, topic_id, title, description, deadline, created_by) VALUES (?,?,?,?,?,?)')
        ->execute(array($teamId, $topic, $title, mb_substr(trim($b['description'] ?? ''), 0, 2000), $deadline, $me['id']));
    $aid = (int)db()->lastInsertId();
    $qs = is_array($b['questions'] ?? null) ? $b['questions'] : array();
    $n = 0;
    foreach ($qs as $i => $q) {
        $content = trim(is_string($q) ? $q : ($q['content'] ?? ''));
        if ($content === '') continue;
        $ans = is_string($q) ? '' : trim($q['answer'] ?? '');
        $pts = is_string($q) ? 1 : (float)($q['points'] ?? 1);
        if ($pts <= 0) $pts = 1;
        // M3: lien ket cau hoi ngan hang (question_id) neu co
        $qid = is_string($q) ? null : (isset($q['question_id']) ? (int)$q['question_id'] : null);
        if ($qid && !q_one('SELECT 1 FROM questions WHERE id=?', array($qid))) $qid = null;
        db()->prepare('INSERT INTO assign_questions (assignment_id, idx, content, answer, points, question_id) VALUES (?,?,?,?,?,?)')
            ->execute(array($aid, $i + 1, mb_substr($content, 0, 4000), mb_substr($ans, 0, 4000), $pts, $qid));
        $n++;
    }
    if ($n === 0) jerr('Cần ít nhất 1 câu hỏi.');
    try {
        $dline = $deadline ? ' · hạn ' . $deadline : '';
        notify_class($teamId, 'Giao bài mới: ' . $title,
            mb_substr(($b['description'] ?? '') !== '' ? $b['description'] : ('Bài tập mới' . $dline), 0, 900),
            '/assignments/' . $aid);
    } catch (Exception $e) {}
    j(array('id' => $aid, 'questions' => $n));
}

if (preg_match('#^/assignments/(\d+)$#', $path, $m)) {
    if ($method !== 'GET') jerr('Không hỗ trợ.', 405);
    $me = require_me();
    $aid = (int)$m[1];
    $a = q_one('SELECT a.*, tt.name class_name, t.name topic_name FROM assignments a JOIN teams tt ON tt.id=a.team_id LEFT JOIN topics t ON t.id=a.topic_id WHERE a.id=?', array($aid));
    if (!$a) jerr('Không tìm thấy bài tập.', 404);
    $teacher = is_role_teacher($me);
    if (!$teacher && !in_array((int)$a['team_id'], my_class_ids($me['id']), true)) jerr('Bạn không ở lớp này.', 403);
    $a['deadline_passed'] = deadline_passed($a['deadline'] ?? null);
    $qs = q_all('SELECT id, idx, content, points, question_id' . ($teacher ? ', answer' : '') . ' FROM assign_questions WHERE assignment_id=? ORDER BY idx', array($aid));
    $a['questions'] = $qs;
    if (!$teacher) {
        $sub = q_one('SELECT id, answer, score, feedback, submitted_at, graded_at, question_scores, files FROM submissions WHERE assignment_id=? AND student_id=?', array($aid, $me['id']));
        $a['my_submission'] = $sub ? $sub : null;
        $a['status'] = sub_status($sub);
    }
    j($a);
}

if (preg_match('#^/assignments/(\d+)/submit$#', $path, $m)) {
    if ($method !== 'POST') jerr('Không hỗ trợ.', 405);
    $me = require_me();
    if (is_role_teacher($me)) jerr('Giáo viên không nộp bài.', 400);
    $aid = (int)$m[1];
    $a = q_one('SELECT * FROM assignments WHERE id=?', array($aid));
    if (!$a) jerr('Không tìm thấy bài tập.', 404);
    if (!in_array((int)$a['team_id'], my_class_ids($me['id']), true)) jerr('Bạn không ở lớp này.', 403);
    if (deadline_passed($a['deadline'] ?? null)) jerr('Đã qua hạn nộp bài.', 400);
    $existing = q_one('SELECT id, score FROM submissions WHERE assignment_id=? AND student_id=?', array($aid, $me['id']));
    if ($existing && $existing['score'] !== null) jerr('Bài đã chấm, không thể nộp lại.', 400);
    $b = body();
    $answers = is_array($b['answers'] ?? null) ? $b['answers'] : array();
    $map = array();
    foreach ($answers as $x) {
        $idx = (int)($x['idx'] ?? 0);
        if ($idx > 0) $map[$idx] = mb_substr(trim($x['text'] ?? ''), 0, 4000);
    }
    $payload = json_encode($map, JSON_UNESCAPED_UNICODE);
    $files = json_encode(array_slice(array_map(function ($f) { return mb_substr((string)$f, 0, 500); }, is_array($b['files'] ?? null) ? $b['files'] : array()), 0, 10), JSON_UNESCAPED_UNICODE);
    if ($existing) {
        if (team_operations_ready()) {
            db()->prepare('UPDATE submissions SET team_id=?, status=\'submitted\', answer=?, files=?, submitted_at=NOW(), question_scores=NULL, score=NULL, feedback=NULL, graded_at=NULL, updated_at=NOW() WHERE id=?')->execute(array((int) $a['team_id'], $payload, $files, $existing['id']));
        } else {
            db()->prepare('UPDATE submissions SET answer=?, files=?, submitted_at=NOW(), question_scores=NULL, score=NULL, feedback=NULL, graded_at=NULL WHERE id=?')->execute(array($payload, $files, $existing['id']));
        }
        $sid = (int)$existing['id'];
    } else {
        if (team_operations_ready()) {
            db()->prepare('INSERT INTO submissions (assignment_id, student_id, team_id, status, answer, files, submitted_at, updated_at) VALUES (?,?,?,\'submitted\',?,?,NOW(),NOW())')
                ->execute(array($aid, $me['id'], (int) $a['team_id'], $payload, $files));
        } else {
            db()->prepare('INSERT INTO submissions (assignment_id, student_id, answer, files, submitted_at) VALUES (?,?,?,?,NOW())')
                ->execute(array($aid, $me['id'], $payload, $files));
        }
        $sid = (int)db()->lastInsertId();
    }
    sync_submission_answers($sid, $aid, $map);
    j(array('id' => $sid, 'status' => 'submitted'));
}

// Luu nhap: luu cau tra loi ma khong nop (submitted_at van NULL)
if (preg_match('#^/assignments/(\d+)/draft$#', $path, $m)) {
    if ($method !== 'POST') jerr('Không hỗ trợ.', 405);
    $me = require_me();
    if (is_role_teacher($me)) jerr('Giáo viên không làm bài.', 400);
    $aid = (int)$m[1];
    $a = q_one('SELECT * FROM assignments WHERE id=?', array($aid));
    if (!$a) jerr('Không tìm thấy bài tập.', 404);
    if (!in_array((int)$a['team_id'], my_class_ids($me['id']), true)) jerr('Bạn không ở lớp này.', 403);
    $existing = q_one('SELECT id, score FROM submissions WHERE assignment_id=? AND student_id=?', array($aid, $me['id']));
    if ($existing && $existing['score'] !== null) jerr('Bài đã chấm, không sửa được.', 400);
    $b = body();
    $answers = is_array($b['answers'] ?? null) ? $b['answers'] : array();
    $map = array();
    foreach ($answers as $x) {
        $idx = (int)($x['idx'] ?? 0);
        if ($idx > 0) $map[$idx] = mb_substr(trim($x['text'] ?? ''), 0, 4000);
    }
    $payload = json_encode($map, JSON_UNESCAPED_UNICODE);
    $files = json_encode(array_slice(array_map(function ($f) { return mb_substr((string)$f, 0, 500); }, is_array($b['files'] ?? null) ? $b['files'] : array()), 0, 10), JSON_UNESCAPED_UNICODE);
    if ($existing) {
        if (team_operations_ready()) {
            db()->prepare('UPDATE submissions SET team_id=?, status=\'draft\', answer=?, files=?, updated_at=NOW() WHERE id=?')->execute(array((int) $a['team_id'], $payload, $files, $existing['id']));
        } else {
            db()->prepare('UPDATE submissions SET answer=?, files=? WHERE id=?')->execute(array($payload, $files, $existing['id']));
        }
        $sid = (int)$existing['id'];
    } else {
        if (team_operations_ready()) {
            db()->prepare('INSERT INTO submissions (assignment_id, student_id, team_id, status, answer, files, submitted_at, updated_at) VALUES (?,?,?,\'draft\',?,?,NULL,NOW())')
                ->execute(array($aid, $me['id'], (int) $a['team_id'], $payload, $files));
        } else {
            db()->prepare('INSERT INTO submissions (assignment_id, student_id, answer, files, submitted_at) VALUES (?,?,?,?,NULL)')
                ->execute(array($aid, $me['id'], $payload, $files));
        }
        $sid = (int)db()->lastInsertId();
    }
    sync_submission_answers($sid, $aid, $map);
    j(array('id' => $sid, 'status' => 'draft'));
}

if (preg_match('#^/assignments/(\d+)/submissions$#', $path, $m)) {
    if ($method !== 'GET') jerr('Không hỗ trợ.', 405);
    $me = require_me();
    if (!is_role_teacher($me)) jerr('Khu vực giáo viên.', 403);
    $aid = (int)$m[1];
    $a = q_one('SELECT * FROM assignments WHERE id=?', array($aid));
    if (!$a) jerr('Không tìm thấy bài tập.', 404);
    require_team_coach_or_admin($me, (int)$a['team_id']);
    $rows = q_all('SELECT s.id sid, s.name, s.class_name, sub.id sub_id, sub.answer, sub.score, sub.feedback, sub.submitted_at, sub.graded_at, sub.question_scores, sub.files
        FROM team_memberships tm JOIN students s ON s.id=tm.user_id
        LEFT JOIN submissions sub ON sub.assignment_id=? AND sub.student_id=s.id
        WHERE tm.team_id=? AND tm.role=\'student\' AND tm.access=\'include\' AND tm.status=\'active\' AND tm.left_at IS NULL ORDER BY s.name', array($aid, $a['team_id']));
    $qs = q_all('SELECT idx, content, answer, points, question_id FROM assign_questions WHERE assignment_id=? ORDER BY idx', array($aid));
    $out = array();
    foreach ($rows as $r) {
        $ans = json_decode($r['answer'] ?? 'null', true);
        $qscores = json_decode($r['question_scores'] ?? 'null', true);
        $files = json_decode($r['files'] ?? '[]', true);
        if (!is_array($files)) $files = array();
        $items = array();
        if ($r['sub_id'] !== null) {
            $items = q_all('SELECT sa.id, sa.question_id, sa.assign_q_idx idx, sa.answer, sa.is_correct, sa.points, sa.feedback, aq.content, aq.points max_points
                FROM submission_answers sa LEFT JOIN assign_questions aq ON aq.assignment_id=? AND aq.idx=sa.assign_q_idx
                WHERE sa.submission_id=? ORDER BY sa.assign_q_idx', array($aid, $r['sub_id']));
            foreach ($items as &$it) {
                $it['id'] = (int)$it['id'];
                $it['idx'] = (int)$it['idx'];
                $it['is_correct'] = $it['is_correct'] !== null ? (int)$it['is_correct'] : null;
                $it['points'] = $it['points'] !== null ? (float)$it['points'] : null;
            }
            unset($it);
        }
        $out[] = array(
            'submission_id' => $r['sub_id'] !== null ? (int)$r['sub_id'] : null,
            'student_id' => (int)$r['sid'], 'name' => $r['name'], 'class_name' => $r['class_name'],
            'score' => $r['score'] !== null ? (float)$r['score'] : null,
            'feedback' => $r['feedback'], 'submitted_at' => $r['submitted_at'],
            'graded_at' => $r['graded_at'], 'question_scores' => $qscores,
            'files' => $files,
            'status' => sub_status($r['sub_id'] === null ? null : $r),
            'answers' => $ans,
            'items' => $items,
        );
    }
    j(array('assignment' => $a, 'questions' => $qs, 'submissions' => $out));
}

if (preg_match('#^/submissions/(\d+)/grade$#', $path, $m)) {
    if ($method !== 'PUT') jerr('Không hỗ trợ.', 405);
    $me = require_me();
    if (!is_role_teacher($me)) jerr('Khu vực giáo viên.', 403);
    $sid = (int)$m[1];
    $sub = q_one('SELECT * FROM submissions WHERE id=?', array($sid));
    if (!$sub) jerr('Không tìm thấy bài nộp.', 404);
    $gass = q_one('SELECT team_id FROM assignments WHERE id=?', array((int)$sub['assignment_id']));
    require_team_coach_or_admin($me, (int)($gass['team_id'] ?? 0));
    $b = body();
    $score = $b['score'] ?? null;
    if ($score === null || $score === '') jerr('Thiếu điểm.');
    $score = max(0, min(10, (float)$score));
    $qsc = is_array($b['question_scores'] ?? null) ? $b['question_scores'] : null;
    $qscJson = $qsc !== null ? json_encode($qsc, JSON_UNESCAPED_UNICODE) : null;
    // Lịch sử sửa điểm (3.7)
    db()->prepare('INSERT INTO grade_history (submission_id, score, feedback, question_scores, graded_by, graded_at) VALUES (?,?,?,?,?,?)')
        ->execute(array($sid, $sub['score'], $sub['feedback'] ?? '', $sub['question_scores'], $me['id'], $sub['graded_at']));
    if (team_operations_ready()) {
        db()->prepare('UPDATE submissions SET score=?, feedback=?, question_scores=?, status=\'graded\', graded_by=?, graded_at=NOW(), updated_at=NOW() WHERE id=?')
            ->execute(array($score, mb_substr(trim($b['feedback'] ?? ''), 0, 1000), $qscJson, (int) $me['id'], $sid));
    } else {
        db()->prepare('UPDATE submissions SET score=?, feedback=?, question_scores=?, graded_at=NOW() WHERE id=?')
            ->execute(array($score, mb_substr(trim($b['feedback'] ?? ''), 0, 1000), $qscJson, $sid));
    }
    // M3: chi tiet tung cau (items: [{idx, is_correct, points, feedback}])
    if (is_array($b['items'] ?? null)) {
        $upd = db()->prepare('UPDATE submission_answers SET is_correct=?, points=?, feedback=? WHERE submission_id=? AND assign_q_idx=?');
        foreach ($b['items'] as $it) {
            $idx = (int)($it['idx'] ?? 0);
            if ($idx <= 0) continue;
            $ic = array_key_exists('is_correct', $it) && $it['is_correct'] !== null ? ((int)(bool)$it['is_correct']) : null;
            $pt = array_key_exists('points', $it) && $it['points'] !== null && $it['points'] !== '' ? (float)$it['points'] : null;
            $fb = mb_substr(trim($it['feedback'] ?? ''), 0, 1000);
            $upd->execute(array($ic, $pt, $fb, $sid, $idx));
        }
    }
    j(array('ok' => true, 'score' => $score));
}

if (preg_match('#^/submissions/(\d+)/grade-history$#', $path, $m)) {
    if ($method !== 'GET') jerr('Không hỗ trợ.', 405);
    require_teacher();
    $rows = q_all('SELECT g.id, g.score, g.feedback, g.question_scores, g.graded_at, s.name grader_name
        FROM grade_history g LEFT JOIN students s ON s.id=g.graded_by
        WHERE g.submission_id=? ORDER BY g.id DESC LIMIT 50', array((int)$m[1]));
    foreach ($rows as &$r) {
        $r['id'] = (int)$r['id'];
        $r['score'] = $r['score'] !== null ? (float)$r['score'] : null;
        $r['question_scores'] = json_decode($r['question_scores'] ?? 'null', true);
    }
    j($rows);
}

// ---------------- ME: RESULTS + PROGRESS ----------------
if ($path === '/me/results' && $method === 'GET') {
    $me = require_me();
    if (is_role_teacher($me)) jerr('Endpoint của học sinh.', 400);
    $rows = q_all('SELECT sub.id, sub.score, sub.feedback, sub.submitted_at, sub.graded_at, sub.answer,
            a.id aid, a.title, a.deadline, a.topic_id, t.name topic_name
        FROM submissions sub
        JOIN assignments a ON a.id=sub.assignment_id
        LEFT JOIN topics t ON t.id=a.topic_id
        WHERE sub.student_id=? ORDER BY COALESCE(sub.submitted_at, sub.graded_at, sub.id) DESC LIMIT 100', array($me['id']));
    $ids = my_class_ids($me['id']);
    $assigned = 0;
    if ($ids) {
        $in = implode(',', array_fill(0, count($ids), '?'));
        $assigned = (int)q_one("SELECT COUNT(*) c FROM assignments WHERE team_id IN ($in)", $ids)['c'];
    }
    j(array('results' => $rows, 'assigned_total' => $assigned));
}

if ($path === '/me/progress' && $method === 'GET') {
    $me = require_me();
    if (is_role_teacher($me)) jerr('Endpoint của học sinh.', 400);
    $ids = my_class_ids($me['id']);
    $assigned = 0;
    if ($ids) {
        $in = implode(',', array_fill(0, count($ids), '?'));
        $assigned = (int)q_one("SELECT COUNT(*) c FROM assignments WHERE team_id IN ($in)", $ids)['c'];
    }
    $subs = q_all('SELECT sub.score, sub.submitted_at, a.topic_id, t.name topic_name FROM submissions sub JOIN assignments a ON a.id=sub.assignment_id LEFT JOIN topics t ON t.id=a.topic_id WHERE sub.student_id=?', array($me['id']));
    $completed = 0; $graded = 0; $sum = 0.0;
    $topicSum = array();
    foreach ($subs as $s) {
        if ($s['submitted_at'] !== null && $s['submitted_at'] !== '') $completed++;
        if ($s['score'] !== null) {
            $graded++;
            $sum += (float)$s['score'];
            $tn = $s['topic_name'] ?: 'Chung';
            if (!isset($topicSum[$tn])) $topicSum[$tn] = array('topic' => $tn, 'sum' => 0.0, 'n' => 0);
            $topicSum[$tn]['sum'] += (float)$s['score'];
            $topicSum[$tn]['n']++;
        }
    }
    $byTopic = array();
    foreach ($topicSum as $t) $byTopic[] = array('topic' => $t['topic'], 'avg' => $t['n'] ? round($t['sum'] / $t['n'], 1) : 0, 'n' => $t['n']);
    usort($byTopic, function ($x, $y) { return $y['avg'] <=> $x['avg']; });
    $latest = q_one('SELECT score FROM submissions WHERE student_id=? AND score IS NOT NULL ORDER BY graded_at DESC LIMIT 1', array($me['id']));
    $latestTitle = null;
    if ($latest) {
        $ltRow = q_one('SELECT a.title FROM submissions sub JOIN assignments a ON a.id=sub.assignment_id WHERE sub.student_id=? AND sub.score IS NOT NULL ORDER BY sub.graded_at DESC LIMIT 1', array($me['id']));
        $latestTitle = $ltRow['title'] ?? null;
    }

    // Bai hoc: tong + da hoan thanh + tien do theo chuyen de (chi tinh bai bat buoc)
    $lessonsTotal = (int)q_one("SELECT COUNT(*) c FROM lessons l JOIN topics t ON t.id=l.topic_id
        WHERE COALESCE(l.status,'published')='published' AND COALESCE(t.status,'published')='published'")['c'];
    $lessonsDone = (int)q_one("SELECT COUNT(*) c FROM lesson_completions lc
        JOIN lessons l ON l.id=lc.lesson_id JOIN topics t ON t.id=l.topic_id
        WHERE lc.student_id=? AND COALESCE(l.status,'published')='published' AND COALESCE(t.status,'published')='published'", array($me['id']))['c'];
    $topicRows = q_all("SELECT t.id, t.name,
        (SELECT COUNT(*) FROM lessons l WHERE l.topic_id=t.id AND COALESCE(l.status,'published')='published' AND COALESCE(l.required,1)=1) req_total,
        (SELECT COUNT(*) FROM lessons l JOIN lesson_completions lc ON lc.lesson_id=l.id AND lc.student_id=? WHERE l.topic_id=t.id AND COALESCE(l.status,'published')='published' AND COALESCE(l.required,1)=1) req_done,
        (SELECT COUNT(*) FROM lessons l WHERE l.topic_id=t.id AND COALESCE(l.status,'published')='published') lt,
        (SELECT COUNT(*) FROM lessons l JOIN lesson_completions lc ON lc.lesson_id=l.id AND lc.student_id=? WHERE l.topic_id=t.id AND COALESCE(l.status,'published')='published') ld
        FROM topics t WHERE COALESCE(t.status,'published')='published'
        AND (SELECT COUNT(*) FROM lessons l2 WHERE l2.topic_id=t.id AND COALESCE(l2.status,'published')='published') > 0", array($me['id'], $me['id']));
    $topicsDone = 0; $topicsWithLessons = 0;
    $currentTopic = null;
    foreach ($topicRows as $t) {
        $topicsWithLessons++;
        $rt = (int)$t['req_total']; $rd = (int)$t['req_done'];
        if ($rt > 0 && $rd >= $rt) $topicsDone++;
        elseif ($currentTopic === null && $rd < $rt) {
            $currentTopic = array('id' => $t['id'], 'name' => $t['name'], 'done' => $rd, 'total' => $rt);
        }
    }
    $lessonRatio = $lessonsTotal ? round($lessonsDone / $lessonsTotal, 3) : 0;
    $assignRatio = $assigned ? round($completed / $assigned, 3) : 0;
    // 72% cuoi cung: tron lesson + assignment (neu chua co bai hoc chi dung assignment)
    $overall = $lessonsTotal > 0 ? round(0.5 * $lessonRatio + 0.5 * $assignRatio, 3) : $assignRatio;

    // Timeline diem theo ngay (4.2)
    $timeline = q_all('SELECT DATE(COALESCE(graded_at, submitted_at)) day, AVG(score) avg_score, COUNT(*) n
        FROM submissions WHERE student_id=? AND score IS NOT NULL
        GROUP BY day ORDER BY day DESC LIMIT 90', array($me['id']));
    foreach ($timeline as &$tl) {
        $tl['avg_score'] = $tl['avg_score'] !== null ? round((float)$tl['avg_score'], 1) : null;
        $tl['n'] = (int)$tl['n'];
    }
    unset($tl);

    j(array(
        'assigned' => $assigned,
        'completed' => $completed,
        'ratio' => $assigned ? round($completed / $assigned, 3) : 0,
        'overall_ratio' => $overall,
        'avg_score' => $graded ? round($sum / $graded, 1) : null,
        'latest_score' => $latest ? (float)$latest['score'] : null,
        'latest_title' => $latestTitle,
        'by_topic' => $byTopic,
        'lessons_total' => $lessonsTotal,
        'lessons_done' => $lessonsDone,
        'lessons_ratio' => $lessonRatio,
        'topics_done' => $topicsDone,
        'topics_total' => $topicsWithLessons,
        'current_topic' => $currentTopic,
        'timeline' => $timeline,
    ));
}

// ---------------- LESSONS ----------------
if ($path === '/lessons' && $method === 'GET') {
    $me = require_me();
    $topicId = trim($_GET['topic_id'] ?? '');
    if ($topicId === '') jerr('Thiếu topic_id.');
    $rows = q_all('SELECT l.id, l.topic_id, l.title, l.content, l.idx,
        COALESCE(l.required,1) required, COALESCE(l.advanced,0) advanced,
        COALESCE(l.status,\'published\') status, l.published_at, t.name topic_name,
        COALESCE(t.status,\'published\') topic_status,
        (SELECT 1 FROM lesson_completions lc WHERE lc.lesson_id=l.id AND lc.student_id=?) completed
        FROM lessons l JOIN topics t ON t.id=l.topic_id WHERE l.topic_id=? ORDER BY l.idx, l.id',
        array($me['id'], $topicId));
    $isStaffL = is_role_teacher($me);
    if (!$isStaffL) {
        $rows = array_values(array_filter($rows, function ($r) {
            return ($r['status'] ?? 'published') === 'published' && ($r['topic_status'] ?? 'published') === 'published';
        }));
    }
    $bmap = array();
    if ($rows) {
        $lids = array();
        foreach ($rows as $r) $lids[] = (int)$r['id'];
        $in = implode(',', array_fill(0, count($lids), '?'));
        foreach (q_all("SELECT id, lesson_id, type, content, position, metadata FROM lesson_blocks WHERE lesson_id IN ($in) ORDER BY position, id", $lids) as $b) {
            $bmap[(int)$b['lesson_id']][] = $b;
        }
    }
    $lessons = array();
    $reqTotal = 0; $reqDone = 0;
    foreach ($rows as $r) {
        $r['completed'] = $r['completed'] ? true : false;
        $r['required'] = $r['required'] ? true : false;
        $r['advanced'] = $r['advanced'] ? true : false;
        $r['blocks'] = $bmap[(int)$r['id']] ?? array();
        if ($r['required']) {
            $reqTotal++;
            if ($r['completed']) $reqDone++;
        }
        $lessons[] = $r;
    }
    j(array(
        'lessons' => $lessons,
        'required_total' => $reqTotal,
        'required_done' => $reqDone,
        'topic_complete' => $reqTotal > 0 && $reqDone === $reqTotal,
    ));
}

if ($path === '/lessons' && $method === 'POST') {
    $me = require_perm('lessons.write');
    $b = body();
    $topicId = trim($b['topic_id'] ?? '');
    $title = mb_substr(trim($b['title'] ?? ''), 0, 255);
    if ($topicId === '' || $title === '') jerr('Thiếu chủ đề hoặc tiêu đề.');
    if (!q_one('SELECT 1 FROM topics WHERE id=?', array($topicId))) jerr('Chuyên đề không tồn tại.');
    $idx = max(1, (int)($b['idx'] ?? 1));
    $req = empty($b['required']) ? 0 : 1;
    $adv = empty($b['advanced']) ? 0 : 1;
    $status = array_key_exists('status', $b) && $b['status'] !== null && $b['status'] !== '' ? (string)$b['status'] : 'published';
    if (!in_array($status, array('draft', 'review', 'published', 'archived'), true)) jerr('Trạng thái không hợp lệ.');
    $publishedAt = $status === 'published' ? date('Y-m-d H:i:s') : null;
    db()->prepare('INSERT INTO lessons (topic_id, title, content, idx, required, advanced, status, published_at) VALUES (?,?,?,?,?,?,?,?)')
        ->execute(array($topicId, $title, (string)($b['content'] ?? ''), $idx, $req, $adv, $status, $publishedAt));
    $nid = (int)db()->lastInsertId();
    // Khoi tao 1 block text tu content (M5)
    $content = (string)($b['content'] ?? '');
    if (trim($content) !== '') {
        db()->prepare('INSERT INTO lesson_blocks (lesson_id, type, content, position) VALUES (?,?,?,1)')
            ->execute(array($nid, 'text', $content));
    }
    j(array('id' => $nid));
}

if (preg_match('#^/lessons/(\d+)$#', $path, $m)) {
    $lid = (int)$m[1];
    if ($method === 'PUT') {
        require_perm('lessons.write');
        $l = q_one('SELECT * FROM lessons WHERE id=?', array($lid));
        if (!$l) jerr('Không tìm thấy bài học.', 404);
        $b = body();
        $title = trim($b['title'] ?? $l['title']);
        if ($title === '') $title = $l['title'];
        $content = array_key_exists('content', $b) ? (string)$b['content'] : $l['content'];
        $idx = array_key_exists('idx', $b) && $b['idx'] !== null ? max(1, (int)$b['idx']) : (int)$l['idx'];
        $req = array_key_exists('required', $b) && $b['required'] !== null ? (empty($b['required']) ? 0 : 1) : (int)($l['required'] ?? 1);
        $adv = array_key_exists('advanced', $b) && $b['advanced'] !== null ? (empty($b['advanced']) ? 0 : 1) : (int)($l['advanced'] ?? 0);
        $status = array_key_exists('status', $b) && $b['status'] !== null && $b['status'] !== '' ? (string)$b['status'] : ($l['status'] ?? 'published');
        if (!in_array($status, array('draft', 'review', 'published', 'archived'), true)) jerr('Trạng thái không hợp lệ.');
        $pub = null;
        if ($status === 'published' && empty($l['published_at'])) $pub = date('Y-m-d H:i:s');
        db()->prepare('UPDATE lessons SET title=?, content=?, idx=?, required=?, advanced=?, status=?' . ($pub ? ', published_at=?' : '') . ' WHERE id=?')
            ->execute($pub
                ? array(mb_substr($title, 0, 255), $content, $idx, $req, $adv, $status, $pub, $lid)
                : array(mb_substr($title, 0, 255), $content, $idx, $req, $adv, $status, $lid));
        j(array('ok' => true));
    }
    if ($method === 'DELETE') {
        require_perm('lessons.write');
        db()->prepare('DELETE FROM lesson_completions WHERE lesson_id=?')->execute(array($lid));
        db()->prepare('DELETE FROM lesson_blocks WHERE lesson_id=?')->execute(array($lid));
        db()->prepare('DELETE FROM lessons WHERE id=?')->execute(array($lid));
        j(array('ok' => true));
    }
}

if (preg_match('#^/lessons/(\d+)/move$#', $path, $m) && $method === 'POST') {
    require_perm('lessons.write');
    $lid = (int)$m[1];
    $l = q_one('SELECT * FROM lessons WHERE id=?', array($lid));
    if (!$l) jerr('Không tìm thấy bài học.', 404);
    $dir = (($_GET['direction'] ?? 'up') === 'down') ? 'ASC' : 'DESC';
    $nb = q_one("SELECT * FROM lessons WHERE topic_id=? AND id<>? ORDER BY idx $dir, id $dir LIMIT 1",
        array($l['topic_id'], $lid));
    if (!$nb) j(array('ok' => true, 'moved' => false));
    db()->prepare('UPDATE lessons SET idx=? WHERE id=?')->execute(array($nb['idx'], $lid));
    db()->prepare('UPDATE lessons SET idx=? WHERE id=?')->execute(array($l['idx'], $nb['id']));
    $rows = q_all('SELECT id FROM lessons WHERE topic_id=? ORDER BY idx, id', array($l['topic_id']));
    $i = 1;
    foreach ($rows as $r) {
        db()->prepare('UPDATE lessons SET idx=? WHERE id=?')->execute(array($i, $r['id']));
        $i++;
    }
    j(array('ok' => true, 'moved' => true));
}

// ---------------- LESSON BLOCKS (M5) ----------------
$BLOCK_TYPES = array('text', 'image', 'table', 'note', 'example', 'fill_blank', 'question', 'attachment');

if (preg_match('#^/lessons/(\d+)/blocks$#', $path, $m)) {
    $lid = (int)$m[1];
    if ($method === 'GET') {
        $me = require_me();
        $lesson = q_one("SELECT l.id, COALESCE(l.status,'published') status, COALESCE(t.status,'published') topic_status
            FROM lessons l JOIN topics t ON t.id=l.topic_id WHERE l.id=?", array($lid));
        if (!$lesson) jerr('Không tìm thấy bài học.', 404);
        if (!is_role_teacher($me) && (($lesson['status'] ?? 'published') !== 'published' || ($lesson['topic_status'] ?? 'published') !== 'published')) jerr('Không tìm thấy bài học.', 404);
        j(q_all('SELECT id, lesson_id, type, content, position, metadata FROM lesson_blocks WHERE lesson_id=? ORDER BY position, id', array($lid)));
    }
    if ($method === 'POST') {
        require_perm('lessons.write');
        if (!q_one('SELECT 1 FROM lessons WHERE id=?', array($lid))) jerr('Không tìm thấy bài học.', 404);
        $b = body();
        $type = trim($b['type'] ?? 'text');
        if (!in_array($type, $BLOCK_TYPES, true)) jerr('Loại block không hợp lệ.');
        $pos = isset($b['position']) ? max(1, (int)$b['position']) : (int)q_one('SELECT COALESCE(MAX(position),0)+1 p FROM lesson_blocks WHERE lesson_id=?', array($lid))['p'];
        $meta = isset($b['metadata']) ? (is_string($b['metadata']) ? $b['metadata'] : json_encode($b['metadata'], JSON_UNESCAPED_UNICODE)) : null;
        db()->prepare('INSERT INTO lesson_blocks (lesson_id, type, content, position, metadata) VALUES (?,?,?,?,?)')
            ->execute(array($lid, $type, (string)($b['content'] ?? ''), $pos, $meta));
        j(array('id' => (int)db()->lastInsertId()));
    }
}

if (preg_match('#^/blocks/(\d+)$#', $path, $m)) {
    $bid = (int)$m[1];
    if ($method === 'PUT') {
        require_perm('lessons.write');
        $bl = q_one('SELECT * FROM lesson_blocks WHERE id=?', array($bid));
        if (!$bl) jerr('Không tìm thấy block.', 404);
        $b = body();
        $type = array_key_exists('type', $b) ? trim($b['type']) : $bl['type'];
        if (!in_array($type, $BLOCK_TYPES, true)) jerr('Loại block không hợp lệ.');
        $content = array_key_exists('content', $b) ? (string)$b['content'] : $bl['content'];
        $pos = array_key_exists('position', $b) && $b['position'] !== null ? max(1, (int)$b['position']) : (int)$bl['position'];
        $meta = array_key_exists('metadata', $b)
            ? (is_string($b['metadata']) ? $b['metadata'] : json_encode($b['metadata'], JSON_UNESCAPED_UNICODE))
            : $bl['metadata'];
        db()->prepare('UPDATE lesson_blocks SET type=?, content=?, position=?, metadata=? WHERE id=?')
            ->execute(array($type, $content, $pos, $meta, $bid));
        j(array('ok' => true));
    }
    if ($method === 'DELETE') {
        require_perm('lessons.write');
        db()->prepare('DELETE FROM lesson_blocks WHERE id=?')->execute(array($bid));
        j(array('ok' => true));
    }
}

if (preg_match('#^/lessons/(\d+)/complete$#', $path, $m)) {
    if ($method !== 'POST') jerr('Không hỗ trợ.', 405);
    $me = require_me();
    if (is_role_teacher($me)) jerr('Giáo viên không đánh dấu bài học.', 400);
    $lid = (int)$m[1];
    $lesson = q_one("SELECT l.id, COALESCE(l.status,'published') status, COALESCE(t.status,'published') topic_status
        FROM lessons l JOIN topics t ON t.id=l.topic_id WHERE l.id=?", array($lid));
    if (!$lesson) jerr('Không tìm thấy bài học.', 404);
    if (($lesson['status'] ?? 'published') !== 'published' || ($lesson['topic_status'] ?? 'published') !== 'published') jerr('Không tìm thấy bài học.', 404);
    $b = body();
    if (!empty($b['undo'])) {
        db()->prepare('DELETE FROM lesson_completions WHERE student_id=? AND lesson_id=?')->execute(array($me['id'], $lid));
        j(array('completed' => false));
    }
    db()->prepare('INSERT IGNORE INTO lesson_completions (student_id, lesson_id) VALUES (?,?)')->execute(array($me['id'], $lid));
    j(array('completed' => true));
}

// ---------------- TEACHER HOME OVERVIEW ----------------
if ($path === '/stats/class-overview' && $method === 'GET') {
    $me = require_me();
    if (!is_role_teacher($me)) jerr('Khu vực giáo viên.', 403);
    $students = (int)q_one("SELECT COUNT(*) c FROM students WHERE COALESCE(role,'student') NOT IN ('teacher','admin','super_admin')")['c'];
    $active = (int)q_one('SELECT COUNT(*) c FROM assignments WHERE deadline IS NULL OR deadline >= CURDATE()')['c'];
    $ungraded = (int)q_one('SELECT COUNT(*) c FROM submissions WHERE score IS NULL AND submitted_at IS NOT NULL')['c'];

    // Bai gan day + so da nop/chua nop (join teams)
    $recent = q_all('SELECT a.id, a.title, a.deadline, a.topic_id, tt.name class_name, t.name topic_name,
        (SELECT COUNT(*) FROM team_memberships tm WHERE tm.team_id=a.team_id AND tm.role=\'student\' AND tm.access=\'include\' AND tm.status=\'active\' AND tm.left_at IS NULL) total,
        (SELECT COUNT(*) FROM submissions s WHERE s.assignment_id=a.id AND s.submitted_at IS NOT NULL) submitted
        FROM assignments a JOIN teams tt ON tt.id=a.team_id LEFT JOIN topics t ON t.id=a.topic_id
        ORDER BY a.created_at DESC LIMIT 5');

    // Tien do lop theo chuyen de: da nop / (so bai cua CD * so hs lop do)
    $tpRows = q_all('SELECT t.id tid, t.name tname, a.team_id,
        COUNT(DISTINCT a.id) an,
        (SELECT COUNT(*) FROM submissions s WHERE s.assignment_id=a.id AND s.submitted_at IS NOT NULL) done
        FROM topics t
        JOIN assignments a ON a.topic_id=t.id
        GROUP BY t.id, t.name, a.team_id ORDER BY t.name');
    $topicProgress = array();
    foreach ($tpRows as $t) {
        $members = (int)q_one("SELECT COUNT(*) c FROM team_memberships WHERE team_id=? AND role='student' AND access='include' AND status='active' AND left_at IS NULL", array($t['team_id']))['c'];
        $expected = max(1, (int)$t['an'] * $members);
        // done = tong da nop tren cac bai cua CD nay (tinh lai chinh xac)
        $done = (int)q_one('SELECT COUNT(*) c FROM submissions s JOIN assignments a2 ON a2.id=s.assignment_id WHERE a2.topic_id=? AND s.submitted_at IS NOT NULL', array($t['tid']))['c'];
        $topicProgress[] = array('topic' => $t['tname'], 'pct' => min(100, (int)round(100 * $done / $expected)));
    }

    j(array(
        'students' => $students,
        'active_assignments' => $active,
        'ungraded' => $ungraded,
        'recent_assignments' => $recent,
        'topic_progress' => $topicProgress,
    ));
}

// ---------------- MATERIALS ----------------
if ($path === '/materials') {
    if ($method === 'GET') {
        $me = optional_session();
        if (!$me) jerr('Chưa đăng nhập.', 401);
        $sql = 'SELECT * FROM materials WHERE 1=1';
        $p = array();
        if (!empty($_GET['subject_id'])) { $sql .= ' AND subject_id=?'; $p[] = $_GET['subject_id']; }
        if (!empty($_GET['topic_id'])) { $sql .= ' AND topic_id=?'; $p[] = $_GET['topic_id']; }
        $sql .= ' ORDER BY id DESC LIMIT 200';
        j(q_all($sql, $p));
    }
    if ($method === 'POST') {
        $me = require_perm('materials.write');
        $b = body();
        if (trim($b['title'] ?? '') === '') jerr('Thiếu tên tài liệu');
        db()->prepare('INSERT INTO materials (subject_id, topic_id, title, description, file_url, file_type, grade, created_by) VALUES (?,?,?,?,?,?,?,?)')
            ->execute(array(
                !empty($b['subject_id']) ? $b['subject_id'] : null,
                !empty($b['topic_id']) ? $b['topic_id'] : null,
                mb_substr(trim($b['title']), 0, 255),
                mb_substr(trim($b['description'] ?? ''), 0, 2000),
                mb_substr(trim($b['file_url'] ?? ''), 0, 2000),
                mb_substr(trim($b['file_type'] ?? ''), 0, 32),
                (int)($b['grade'] ?? 12), $me['id'],
            ));
        j(array('id' => (int)db()->lastInsertId()));
    }
}

if (preg_match('#^/materials/(\d+)$#', $path, $m) && $method === 'DELETE') {
    require_perm('materials.write');
    db()->prepare('DELETE FROM materials WHERE id=?')->execute(array((int)$m[1]));
    j(array('ok' => true));
}

// ---------------- NOTIFICATIONS ----------------
if ($path === '/notifications' && $method === 'GET') {
    $me = require_me();
    $unreadOnly = !empty($_GET['unread_only']);
    $sql = 'SELECT * FROM notifications WHERE user_id=?';
    $p = array($me['id']);
    if ($unreadOnly) $sql .= ' AND read_at IS NULL';
    $sql .= ' ORDER BY id DESC LIMIT 50';
    $items = q_all($sql, $p);
    $unread = (int)q_one('SELECT COUNT(*) c FROM notifications WHERE user_id=? AND read_at IS NULL', array($me['id']))['c'];
    foreach ($items as &$it) $it['id'] = (int)$it['id'];
    j(array('items' => $items, 'unread' => $unread));
}

if ($path === '/notifications/read' && $method === 'POST') {
    $me = require_me();
    $b = body();
    if (!empty($b['id'])) {
        db()->prepare('UPDATE notifications SET read_at=NOW() WHERE id=? AND user_id=?')->execute(array((int)$b['id'], $me['id']));
    } else {
        db()->prepare('UPDATE notifications SET read_at=NOW() WHERE user_id=? AND read_at IS NULL')->execute(array($me['id']));
    }
    j(array('ok' => true));
}

function notify_class($team_id, $title, $bodyTxt, $link) {
    $members = q_all("SELECT user_id FROM team_memberships WHERE team_id=? AND role='student' AND access='include' AND status='active' AND left_at IS NULL", array($team_id));
    $st = db()->prepare('INSERT INTO notifications (user_id, title, body, link) VALUES (?,?,?,?)');
    foreach ($members as $m) {
        $st->execute(array($m['user_id'], mb_substr($title, 0, 255), mb_substr($bodyTxt, 0, 1000), mb_substr($link, 0, 500)));
    }
}

// ---------------- FORGOT / RESET PASSWORD (SMTP) ----------------
if ($path === '/auth/forgot-password' && $method === 'POST') {
    $b = body();
    $email = strtolower(trim($b['email'] ?? ''));
    if ($email === '' || strpos($email, '@') === false) jerr('Nhập email hợp lệ.');
    $st = q_one('SELECT id, email FROM students WHERE LOWER(email)=?', array($email));
    if (!$st) j(array('ok' => true, 'sent' => false, 'message' => 'Nếu email tồn tại, chúng tôi đã gửi mã.'));
    $code = strtoupper(substr(bin2hex(random_bytes(4)), 0, 6));
    db()->prepare('INSERT INTO password_resets (student_id, code, expires_at) VALUES (?,?,DATE_ADD(NOW(), INTERVAL 15 MINUTE))')
        ->execute(array($st['id'], $code));
    $smtpHost = envv('SMTP_HOST', '');
    $sent = false;
    if ($smtpHost !== '' && function_exists('mail')) {
        $subj = '[OnLuyen HSG] Ma dat lai mat khau';
        $msg = "Ma dat lai mat khau cua ban la: $code\r\nMa co hieu luc 15 phut.";
        $headers = 'From: ' . envv('SMTP_FROM', envv('SMTP_USER', 'no-reply@localhost')) . "\r\n" .
            'Content-Type: text/plain; charset=utf-8';
        $sent = @mail($st['email'], $subj, $msg, $headers);
    }
    j(array('ok' => true, 'sent' => (bool)$sent,
        'message' => $sent ? 'Đã gửi mã qua email.' : 'Chưa cấu hình SMTP — liên hệ giáo viên đặt lại mật khẩu.'));
}

if ($path === '/auth/reset-password' && $method === 'POST') {
    $b = body();
    $email = strtolower(trim($b['email'] ?? ''));
    $code = strtoupper(trim($b['code'] ?? ''));
    $npw = (string)($b['new_password'] ?? '');
    if (mb_strlen($npw) < 6) jerr('Mật khẩu mới ít nhất 6 ký tự.');
    $st = q_one('SELECT id FROM students WHERE LOWER(email)=?', array($email));
    if (!$st || $code === '') jerr('Mã không đúng hoặc hết hạn.');
    $row = q_one('SELECT * FROM password_resets WHERE student_id=? AND code=? AND used_at IS NULL ORDER BY id DESC LIMIT 1',
        array($st['id'], $code));
    if (!$row) jerr('Mã không đúng hoặc đã dùng.');
    if (strtotime($row['expires_at']) < time()) jerr('Mã đã hết hạn.');
    db()->prepare('UPDATE password_resets SET used_at=NOW() WHERE id=?')->execute(array($row['id']));
    db()->prepare('UPDATE students SET password_hash=? WHERE id=?')->execute(array(password_hash($npw, PASSWORD_DEFAULT), $st['id']));
    db()->prepare('DELETE FROM sessions WHERE student_id=?')->execute(array($st['id']));
    j(array('ok' => true));
}

// ---------------- TEAM TIMELINE (4.2) ----------------
if ($path === '/stats/team-timeline' && $method === 'GET') {
    require_teacher();
    $days = max(7, min((int)($_GET['days'] ?? 30), 180));
    $team = trim($_GET['team'] ?? '');
    $sql = "SELECT DATE(a.created_at) day, COUNT(*) n, AVG(a.accuracy) avg_acc, SUM(a.correct) c, SUM(a.total) t
            FROM attempts a JOIN students st ON st.id=a.student_id
            WHERE a.student_id IS NOT NULL AND a.created_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)";
    $p = array($days);
    if ($team !== '') { $sql .= ' AND st.team=?'; $p[] = $team; }
    $sql .= ' GROUP BY day ORDER BY day';
    $attempts = q_all($sql, $p);
    $gsql = "SELECT DATE(sub.graded_at) day, AVG(sub.score) avg_score, COUNT(*) n
             FROM submissions sub JOIN students st ON st.id=sub.student_id
             WHERE sub.score IS NOT NULL AND sub.graded_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)";
    $gp = array($days);
    if ($team !== '') { $gsql .= ' AND st.team=?'; $gp[] = $team; }
    $gsql .= ' GROUP BY day ORDER BY day';
    $graded = q_all($gsql, $gp);
    foreach ($attempts as &$a) { $a['avg_acc'] = $a['avg_acc'] !== null ? (float)$a['avg_acc'] : 0; $a['n'] = (int)$a['n']; }
    unset($a);
    foreach ($graded as &$g) { $g['avg_score'] = $g['avg_score'] !== null ? (float)$g['avg_score'] : null; $g['n'] = (int)$g['n']; }
    unset($g);
    j(array('days' => $days, 'team' => $team, 'attempts' => $attempts, 'graded' => $graded));
}

// ---------------- AI (Agnes) ----------------
// Xay dung system+user messages cho 5 type. Dung chung cho generate va stream.
function ai_build_messages($b) {
    $type = trim($b['type'] ?? '');
    $topic = mb_substr(trim($b['topic'] ?? ''), 0, 200);
    $subject = mb_substr(trim($b['subject'] ?? ''), 0, 200);
    $extra = mb_substr(trim($b['prompt'] ?? ''), 0, 1000);
    $count = max(1, min((int)($b['count'] ?? 5), 30));
    $difficulty = trim($b['difficulty'] ?? 'vận dụng');
    $qtype = in_array($b['qtype'] ?? '', array('trac_nghiem', 'tu_luan', 'dung_sai', 'diem_khuyet'), true) ? $b['qtype'] : 'trac_nghiem';
    $sys = 'Ban la AI giao vien mon hoc. Tra ve JSON THUAN, khong giai thich, khong markdown fence.';
    $user = '';
    $want = '';
    if ($type === 'questions') {
        $want = '{"questions":[{"content":"...","options":["A","B","C","D"]|null,"correct_answer":"A|B|C|D|text","explanation":"...","qtype":"trac_nghiem|tu_luan|dung_sai"}]}';
        $user = "Tao {$count} cau hoi {$qtype} muc do {$difficulty} cho mon '{$subject}', chuyen de '{$topic}'."
            . ($extra ? " Yeu cau: {$extra}." : '')
            . " Truc nghiem: options 4 loi A-D, correct_answer la chu cai A/B/C/D. Van ban: correct_answer la dap an mau.";
        if ($qtype === 'diem_khuyet') {
            $want = '{"questions":[{"content":"Cau co ___ va {{tu thay}}","correct_answer":"dap_an|tu_thay"}]}';
            $user = "Tao {$count} cau diem khuyet (cloze) cho '{$topic}'. Dung ___ hoac {{dap_an}} trong content. correct_answer cac dap an tach bang | theo thu tu blank.";
        } elseif ($qtype === 'dung_sai') {
            $want = '{"questions":[{"qtype":"dung_sai","content":"...","options":["Đúng","Sai"],"correct_answer":"DUNG|SAI","explanation":"..."}]}';
            $user = "Tao {$count} cau dung/sai muc do {$difficulty} cho mon '{$subject}', chuyen de '{$topic}'. Moi cau la mot nhan dinh, options luon la [\"Đúng\",\"Sai\"], correct_answer la DUNG hoac SAI.";
        }
    } elseif ($type === 'cloze') {
        $want = '{"questions":[{"content":"...","correct_answer":"a|b"}]}';
        $user = "Tao {$count} cau diem khuyet cho '{$topic}' mon '{$subject}'. Dung ___ hoac {{tu}} trong content, correct_answer tach bang | theo thu tu.{$extra}";
    } elseif ($type === 'lesson') {
        $want = '{"title":"...","content":"noi dung bai hoc, ngan gon co cau muc, vi du, cong thuc"}';
        $user = "Viet bai hoc cho chuyen de '{$topic}' mon '{$subject}'. {$extra} Content 400-800 tu, co muc de doc, tieng Viet.";
    } elseif ($type === 'exam') {
        $want = '{"title":"...","questions":[{"qtype":"trac_nghiem|dung_sai","content":"...","options":["A","B","C","D"]|["Đúng","Sai"],"correct_answer":"A|DUNG|SAI","explanation":"..."}]}';
        $user = "Tao de thi {$count} cau mon '{$subject}' chuyen de '{$topic}', do kho {$difficulty}, gom ca trac nghiem nhieu lua chon (qtype trac_nghiem, options A-D, correct_answer la chu cai) va dung/sai (qtype dung_sai, options [\"Đúng\",\"Sai\"], correct_answer la DUNG hoac SAI).{$extra}";
    } elseif ($type === 'flashcards') {
        $want = '{"cards":[{"front":"cau hoi/ngu canh","back":"dap an/ngan gon"}]}';
        $user = "Tao {$count} flashcard cho '{$topic}' mon '{$subject}'. Front ngan hoi, back dap an ro rang, tieng Viet.{$extra}";
    } elseif ($type === 'parse') {
        $rawText = mb_substr(trim((string) ($b['text'] ?? '')), 0, 14000);
        $want = '{"questions":[{"qtype":"trac_nghiem|dung_sai|diem_khuyet|tu_luan","content":"...","options":["A","B","C","D"]|["Đúng","Sai"]|[],"correct_answer":"A|DUNG|SAI|text","explanation":"..."}]}';
        $user = "Doc van ban de thi sau va TACH thanh tung cau hoi. Giu NGUYEN noi dung va loi giai neu co. Phan loai dung qtype: trac_nghiem (options A-D, correct_answer la chu cai A/B/C/D), dung_sai (options [\"Đúng\",\"Sai\"], correct_answer la DUNG hoac SAI), diem_khuyet (co ___ hoac {{...}}, correct_answer cac tu cach nhau bang | theo thu tu), tu_luan (correct_answer la dap an mau ngan gon). QUAN TRONG: moi cau BAT BUOC phai co correct_answer de cham diem. Neu de khong ghi dap an, hay TU GIAI va dien dap an dung nhat. Khong de trong correct_answer. Van ban:\n" . $rawText;
    }
    return array(
        'messages' => array(
            array('role' => 'system', 'content' => $sys),
            array('role' => 'user', 'content' => $user . " JSON format: " . $want),
        ),
        'type' => $type,
        'model' => trim($b['model'] ?? ''),
    );
}

function ai_normalize($type, $parsed) {
    if ($type === 'flashcards' && isset($parsed['cards'])) return $parsed;
    if (($type === 'questions' || $type === 'cloze' || $type === 'parse') && isset($parsed['questions'])) return array('questions' => $parsed['questions']);
    return $parsed;
}

// POST /ai/generate — blocking (du lieu JSON day du).
if ($path === '/ai/generate' && $method === 'POST') {
    require_perm('studio.manage');
    $b = body();
    $type = trim($b['type'] ?? '');
    if (!in_array($type, array('questions', 'lesson', 'exam', 'flashcards', 'cloze', 'parse'), true)) jerr('type khong hop le.');
    $built = ai_build_messages($b);
    $raw = agnes_chat($built['messages'], $built['model'], 6000, 0.2);
    $parsed = agnes_parse_json($raw);
    if ($parsed === null) jerr('AI khong tra JSON hop le. Thu lai hoac doi model.', 502);
    j(array('type' => $type, 'model' => $built['model'] ?: AGNES_DEFAULT_MODEL, 'data' => ai_normalize($type, $parsed)));
}

// POST /ai/generate-stream — SSE: delta... rồi result/error. Hien realtime o client.
if ($path === '/ai/generate-stream' && $method === 'POST') {
    require_perm('studio.manage');
    $b = body();
    $type = trim($b['type'] ?? '');
    if (!in_array($type, array('questions', 'lesson', 'exam', 'flashcards', 'cloze', 'parse'), true)) jerr('type khong hop le.');
    $built = ai_build_messages($b);
    @set_time_limit(180);
    @ini_set('max_execution_time', '180');
    @ini_set('output_buffering', '0');
    header('Content-Type: text/event-stream; charset=utf-8');
    header('Cache-Control: no-cache');
    header('X-Accel-Buffering: no');
    while (ob_get_level() > 0) { @ob_end_flush(); }
    $emit = function ($event, $data) {
        echo 'event: ' . $event . "\n";
        echo 'data: ' . json_encode($data, JSON_UNESCAPED_UNICODE) . "\n\n";
        if (function_exists('flush')) flush();
        if (function_exists('ob_flush')) @ob_flush();
    };
    $emit('meta', array('type' => $type, 'model' => $built['model'] ?: AGNES_DEFAULT_MODEL));
    $raw = agnes_chat_stream($built['messages'], $built['model'], $emit, 4000, 0.4);
    if ($raw === null) { exit; } // error da gui
    $parsed = agnes_parse_json($raw);
    if ($parsed === null) {
        $emit('error', array('message' => 'AI khong tra JSON hop le. Thu lai hoac doi model.'));
        exit;
    }
    $emit('result', array('type' => $type, 'model' => $built['model'] ?: AGNES_DEFAULT_MODEL, 'data' => ai_normalize($type, $parsed)));
    exit;
}

// ---------------- FLASHCARDS ----------------
if ($path === '/flashcards' && $method === 'GET') {
    $me = optional_session();
    if (!$me) jerr('Chưa đăng nhập.', 401);
    $topicId = trim($_GET['topic_id'] ?? '');
    if ($topicId === '') jerr('Thiếu topic_id.');
    $cards = q_all('SELECT id, topic_id, lesson_id, front, back, idx FROM flashcards WHERE topic_id=? ORDER BY idx, id', array($topicId));
    $isStaff = is_role_teacher($me);
    if (!$isStaff) {
        $prog = array();
        foreach (q_all('SELECT card_id, box FROM flashcard_progress WHERE student_id=?', array($me['id'])) as $r) {
            $prog[(int)$r['card_id']] = (int)$r['box'];
        }
        foreach ($cards as &$c) $c['box'] = $prog[(int)$c['id']] ?? 0;
        unset($c);
    }
    j($cards);
}

if ($path === '/flashcards' && $method === 'POST') {
    $me = require_perm('bank.manage');
    $b = body();
    $topicId = trim($b['topic_id'] ?? '');
    if ($topicId === '' || !q_one('SELECT 1 FROM topics WHERE id=?', array($topicId))) jerr('Thiếu/chưa đúng topic.');
    $items = is_array($b['cards'] ?? null) ? $b['cards'] : array();
    if (!$items) jerr('Thiếu cards.');
    $n = 0;
    $start = (int)q_one('SELECT COALESCE(MAX(idx),0) m FROM flashcards WHERE topic_id=?', array($topicId))['m'];
    foreach ($items as $i => $c) {
        $front = mb_substr(trim(is_string($c) ? $c : ($c['front'] ?? '')), 0, 1000);
        $back = mb_substr(trim(is_string($c) ? '' : ($c['back'] ?? '')), 0, 4000);
        if ($front === '') continue;
        db()->prepare('INSERT INTO flashcards (topic_id, front, back, idx) VALUES (?,?,?,?)')
            ->execute(array($topicId, $front, $back, $start + $n + 1));
        $n++;
    }
    if ($n === 0) jerr('Không có thẻ hợp lệ.');
    j(array('inserted' => $n));
}

if (preg_match('#^/flashcards/(\d+)$#', $path, $m)) {
    $fid = (int)$m[1];
    if ($method === 'PUT') {
        require_perm('bank.manage');
        $b = body();
        if (!q_one('SELECT 1 FROM flashcards WHERE id=?', array($fid))) jerr('Không tìm thấy thẻ.', 404);
        db()->prepare('UPDATE flashcards SET front=?, back=? WHERE id=?')
            ->execute(array(mb_substr(trim($b['front'] ?? ''), 0, 1000), mb_substr(trim($b['back'] ?? ''), 0, 4000), $fid));
        j(array('ok' => true));
    }
    if ($method === 'DELETE') {
        require_perm('bank.manage');
        db()->prepare('DELETE FROM flashcards WHERE id=?')->execute(array($fid));
        j(array('ok' => true));
    }
}

// Review Leitner don gian: quality 0 (khong nho), 1 (mo mo), 2 (nho) -> box 1..4
if (preg_match('#^/flashcards/(\d+)/review$#', $path, $m)) {
    if ($method !== 'POST') jerr('Không hỗ trợ.', 405);
    $me = require_me();
    if (is_role_teacher($me)) jerr('GV khong hoc flashcard.', 400);
    $fid = (int)$m[1];
    if (!q_one('SELECT 1 FROM flashcards WHERE id=?', array($fid))) jerr('Không tìm thấy thẻ.', 404);
    $b = body();
    $q = (int)($b['quality'] ?? 0);
    if ($q < 0) $q = 0;
    if ($q > 2) $q = 2;
    $cur = q_one('SELECT box FROM flashcard_progress WHERE student_id=? AND card_id=?', array($me['id'], $fid));
    $box = $cur ? (int)$cur['box'] : 1;
    if ($q === 0) $box = 1;
    elseif ($q === 1) $box = max(1, min(4, $box)); // mo mo: giu
    else $box = min(4, $box + 1); // nho: tang box
    db()->prepare('INSERT INTO flashcard_progress (student_id, card_id, box, last_reviewed_at) VALUES (?,?,?,NOW())
        ON DUPLICATE KEY UPDATE box=VALUES(box), last_reviewed_at=VALUES(last_reviewed_at)')
        ->execute(array($me['id'], $fid, $box));
    j(array('card_id' => $fid, 'box' => $box));
}

jerr('Không tìm thấy API: ' . $path, 404);
