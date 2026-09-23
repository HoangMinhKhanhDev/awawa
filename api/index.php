<?php
// API cho MySQL Hostinger — mirror của python-core/main.py (bản rút gọn đủ dùng).
// Không framework, chạy được trên PHP 7.4+ của shared hosting.
require __DIR__ . '/config.php';

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Headers: Content-Type, X-Api-Token');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
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

function jlist($v) {
    if ($v === null || $v === '') return array();
    if (is_array($v)) return $v;
    $p = json_decode($v, true);
    return is_array($p) ? $p : array();
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

function row_to_q($r) {
    static $sm = null, $tm = null;
    if ($sm === null) { $sm = subj_map(); $tm = topic_map(); }
    return array(
        'id' => (int)$r['id'], 'subject_id' => $r['subject_id'],
        'subject_name' => isset($sm[$r['subject_id']]) ? $sm[$r['subject_id']] : $r['subject_id'],
        'topic_id' => $r['topic_id'],
        'topic_name' => ($r['topic_id'] && isset($tm[$r['topic_id']])) ? $tm[$r['topic_id']] : null,
        'grade' => (int)$r['grade'], 'difficulty' => $r['difficulty'], 'qtype' => $r['qtype'],
        'content' => $r['content'], 'options' => $r['options'] === null ? '[]' : $r['options'],
        'correct_answer' => $r['correct_answer'] === null ? '' : $r['correct_answer'],
        'explanation' => $r['explanation'] === null ? '' : $r['explanation'],
        'score' => (float)$r['score'], 'source' => $r['source'] === null ? '' : $r['source'],
        'image_url' => $r['image_url'] === null ? '' : $r['image_url'],
    );
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

// ---------------- TOPICS ----------------
if ($path === '/topics') {
    if ($method === 'GET') {
        $sid = $_GET['subject_id'] ?? '';
        if ($sid !== '') j(q_all('SELECT * FROM topics WHERE subject_id=? ORDER BY name', array($sid)));
        j(q_all('SELECT * FROM topics ORDER BY name'));
    }
    if ($method === 'POST') {
        require_teacher();
        $b = body();
        $name = trim($b['name'] ?? '');
        if ($name === '') jerr('Thiếu tên chuyên đề');
        if (!q_one('SELECT 1 FROM subjects WHERE id=?', array($b['subject_id'] ?? ''))) jerr('Môn không tồn tại');
        $tid = trim($b['id'] ?? '');
        if ($tid === '') $tid = 't-' . substr(md5(uniqid('', true)), 0, 8);
        if (q_one('SELECT 1 FROM topics WHERE id=?', array($tid))) jerr('Mã chuyên đề đã tồn tại');
        db()->prepare('INSERT INTO topics (id, subject_id, name, grade) VALUES (?,?,?,?)')
            ->execute(array($tid, $b['subject_id'], mb_substr($name, 0, 200), (int)($b['grade'] ?? 12)));
        j(array('id' => $tid));
    }
}

// ---------------- QUESTIONS LIST ----------------
if ($method === 'GET' && $path === '/questions') {
    $sql = 'SELECT * FROM questions WHERE 1=1';
    $p = array();
    if (!empty($_GET['subject_id'])) { $sql .= ' AND subject_id=?'; $p[] = $_GET['subject_id']; }
    if (!empty($_GET['topic_id'])) { $sql .= ' AND topic_id=?'; $p[] = $_GET['topic_id']; }
    if (isset($_GET['grade']) && $_GET['grade'] !== '') { $sql .= ' AND grade=?'; $p[] = (int)$_GET['grade']; }
    if (!empty($_GET['difficulty'])) { $sql .= ' AND difficulty=?'; $p[] = $_GET['difficulty']; }
    if (!empty($_GET['qtype'])) { $sql .= ' AND qtype=?'; $p[] = $_GET['qtype']; }
    if (!empty($_GET['search'])) { $sql .= ' AND content LIKE ?'; $p[] = '%' . $_GET['search'] . '%'; }
    $lim = isset($_GET['limit']) ? max(1, min((int)$_GET['limit'], 500)) : 200;
    $sql .= ' ORDER BY id DESC LIMIT ' . $lim;
    j(array_map('row_to_q', q_all($sql, $p)));
}

// ---------------- QUESTION CREATE ----------------
if ($method === 'POST' && $path === '/questions') {
    require_teacher();
    $b = body();
    if (empty($b['subject_id']) || trim($b['content'] ?? '') === '') jerr('Thiếu môn hoặc nội dung');
    if (!q_one('SELECT 1 FROM subjects WHERE id=?', array($b['subject_id']))) jerr('Môn không tồn tại');
    db()->prepare('INSERT INTO questions (subject_id, topic_id, grade, difficulty, qtype, content, options, correct_answer, explanation, score, source, image_url) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)')
        ->execute(array(
            $b['subject_id'], $b['topic_id'] ?? null, (int)($b['grade'] ?? 12),
            $b['difficulty'] ?? 'vận dụng', $b['qtype'] ?? 'trac_nghiem', trim($b['content']),
            json_encode($b['options'] ?? array(), JSON_UNESCAPED_UNICODE),
            trim($b['correct_answer'] ?? ''), $b['explanation'] ?? '',
            (float)($b['score'] ?? 1), 'thủ công', mb_substr(trim($b['image_url'] ?? ''), 0, 2000),
        ));
    j(array('id' => (int)db()->lastInsertId()));
}

// ---------------- QUESTIONS BULK ----------------
if ($method === 'POST' && $path === '/questions/bulk') {
    require_teacher();
    $b = body();
    $n = 0;
    $st = db()->prepare('INSERT INTO questions (subject_id, topic_id, grade, difficulty, qtype, content, options, correct_answer, explanation, score, source, image_url) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)');
    foreach (($b['items'] ?? array()) as $it) {
        if (trim($it['content'] ?? '') === '' || empty($it['subject_id'])) continue;
        $st->execute(array(
            $it['subject_id'], $it['topic_id'] ?? null, (int)($it['grade'] ?? 12),
            $it['difficulty'] ?? 'vận dụng', $it['qtype'] ?? 'trac_nghiem', trim($it['content']),
            json_encode($it['options'] ?? array(), JSON_UNESCAPED_UNICODE),
            trim($it['correct_answer'] ?? ''), $it['explanation'] ?? '',
            (float)($it['score'] ?? 1), 'nhập đề',
            is_string($it['image_url'] ?? null) ? mb_substr(trim($it['image_url']), 0, 2000) : '',
        ));
        $n++;
    }
    j(array('inserted' => $n));
}

// ---------------- QUESTION UPDATE/DELETE ----------------
if (preg_match('#^/questions/(\d+)$#', $path, $m)) {
    $qid = (int)$m[1];
    if ($method === 'PUT') {
        require_teacher();
        $b = body();
        if (!q_one('SELECT 1 FROM questions WHERE id=?', array($qid))) jerr('Không tìm thấy câu hỏi', 404);
        db()->prepare('UPDATE questions SET subject_id=?, topic_id=?, grade=?, difficulty=?, qtype=?, content=?, options=?, correct_answer=?, explanation=?, score=?, image_url=? WHERE id=?')
            ->execute(array(
                $b['subject_id'], $b['topic_id'] ?? null, (int)($b['grade'] ?? 12),
                $b['difficulty'] ?? 'vận dụng', $b['qtype'] ?? 'trac_nghiem', trim($b['content'] ?? ''),
                json_encode($b['options'] ?? array(), JSON_UNESCAPED_UNICODE),
                trim($b['correct_answer'] ?? ''), $b['explanation'] ?? '',
                (float)($b['score'] ?? 1), mb_substr(trim($b['image_url'] ?? ''), 0, 2000), $qid,
            ));
        j(array('ok' => true));
    }
    if ($method === 'DELETE') {
        require_teacher();
        db()->prepare('DELETE FROM questions WHERE id=?')->execute(array($qid));
        j(array('ok' => true));
    }
}

// ---------------- EXAMS ----------------
if ($method === 'POST' && $path === '/exams') {
    $b = body();
    db()->prepare('INSERT INTO exams (title, mode, duration_min, question_ids) VALUES (?,?,?,?)')
        ->execute(array(
            $b['title'] ?? 'Đề', $b['mode'] ?? 'practice', (int)($b['duration_min'] ?? 45),
            json_encode($b['question_ids'] ?? array(), JSON_UNESCAPED_UNICODE),
        ));
    j(array('id' => (int)db()->lastInsertId(), 'title' => $b['title'] ?? 'Đề', 'mode' => $b['mode'] ?? 'practice'));
}

if ($method === 'GET' && preg_match('#^/exams/(\d+)$#', $path, $m)) {
    $ex = q_one('SELECT * FROM exams WHERE id=?', array((int)$m[1]));
    if (!$ex) jerr('Không tìm thấy đề', 404);
    $ids = jlist($ex['question_ids']);
    $qs = array();
    if ($ids) {
        $in = implode(',', array_fill(0, count($ids), '?'));
        $byId = array();
        foreach (q_all("SELECT * FROM questions WHERE id IN ($in)", $ids) as $r) $byId[$r['id']] = $r;
        foreach ($ids as $qid) if (isset($byId[$qid])) $qs[] = row_to_q($byId[$qid]);
    }
    j(array('id' => (int)$ex['id'], 'title' => $ex['title'], 'mode' => $ex['mode'], 'questions' => $qs));
}

// ---------------- SUBMIT ----------------
if ($method === 'POST' && preg_match('#^/exams/(\d+)/submit$#', $path, $m)) {
    $eid = (int)$m[1];
    $b = body();
    $ex = q_one('SELECT * FROM exams WHERE id=?', array($eid));
    $mode = $ex ? $ex['mode'] : 'practice';
    $examId = $ex ? (int)$ex['id'] : null;
    $answers = $b['answers'] ?? array();
    $qids = array_values(array_unique(array_filter(array_map(function ($a) {
        return isset($a['question_id']) ? (int)$a['question_id'] : 0;
    }, $answers))));
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
        } else {
            $a['is_correct'] = null;
        }
        $details[] = $a;
    }
    $acc = $total ? $correct / $total : 0;
    $flog = is_array($b['focus_log'] ?? null) ? array_slice($b['focus_log'], 0, 200) : array();
    $sess = optional_session();
    $sid = $sess ? (int)$sess['id'] : null;
    db()->prepare('INSERT INTO attempts (exam_id, mode, correct, total, accuracy, detail, student_name, student_id, focus_exits, focus_log) VALUES (?,?,?,?,?,?,?,?,?,?)')
        ->execute(array(
            $examId, $mode, $correct, $total, $acc,
            json_encode($details, JSON_UNESCAPED_UNICODE),
            mb_substr(trim($b['student_name'] ?? ''), 0, 100), $sid,
            max(0, (int)($b['focus_exits'] ?? 0)),
            json_encode($flog, JSON_UNESCAPED_UNICODE),
        ));
    j(array('attempt_id' => (int)db()->lastInsertId(), 'correct' => $correct, 'total' => $total, 'accuracy' => $acc, 'focus_exits' => max(0, (int)($b['focus_exits'] ?? 0))));
}

// ---------------- ATTEMPTS ----------------
if ($method === 'GET' && $path === '/attempts') {
    $me = optional_session();
    $isTeacher = $me && ($me['role'] ?? 'student') === 'teacher';
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
// Chỉ lượt thi của tài khoản đăng nhập. Xếp theo % cao nhất → trung bình → số lượt.
if ($method === 'GET' && $path === '/stats/leaderboard') {
    $mode = $_GET['mode'] ?? 'exam';
    $team = trim($_GET['team'] ?? '');
    $limit = max(1, min((int)($_GET['limit'] ?? 50), 100));
    $sql = "SELECT st.id, st.name, st.class_name, st.team, COUNT(a.id) n, MAX(a.accuracy) best, AVG(a.accuracy) avg, MAX(a.created_at) last_at FROM attempts a JOIN students st ON st.id=a.student_id WHERE a.student_id IS NOT NULL AND a.total > 0 AND COALESCE(st.role,'student') <> 'teacher'";
    $p = array();
    if ($mode === 'exam' || $mode === 'practice') { $sql .= ' AND a.mode=?'; $p[] = $mode; }
    if ($team !== '') { $sql .= ' AND st.team=?'; $p[] = $team; }
    $sql .= ' GROUP BY st.id ORDER BY best DESC, avg DESC, n DESC LIMIT ' . $limit;
    $out = array(); $rank = 0;
    foreach (q_all($sql, $p) as $r) {
        $rank++;
        $out[] = array(
            'rank' => $rank, 'student_id' => (int)$r['id'], 'name' => $r['name'],
            'class_name' => $r['class_name'], 'team' => $r['team'], 'attempts' => (int)$r['n'],
            'best' => round((float)$r['best'], 4), 'avg' => round((float)$r['avg'], 4), 'last_at' => $r['last_at'],
        );
    }
    j(array('mode' => $mode, 'board' => $out));
}

// ---------------- STATS ----------------
if ($method === 'GET' && $path === '/stats/overview') {
    $me = optional_session();
    $isTeacher = $me && ($me['role'] ?? 'student') === 'teacher';
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
        $sql = 'SELECT * FROM students WHERE 1=1';
        $p = array();
        if (!empty($_GET['team'])) { $sql .= ' AND team=?'; $p[] = $_GET['team']; }
        if (!empty($_GET['search'])) { $sql .= ' AND name LIKE ?'; $p[] = '%' . $_GET['search'] . '%'; }
        $sql .= ' ORDER BY team, name LIMIT 500';
        j(array_map('public_student', q_all($sql, $p)));
    }
    if ($method === 'POST') {
        require_teacher();
        $b = body();
        if (trim($b['name'] ?? '') === '') jerr('Thiếu tên học sinh');
        db()->prepare('INSERT INTO students (name, class_name, team, note) VALUES (?,?,?,?)')
            ->execute(array(
                mb_substr(trim($b['name']), 0, 100), mb_substr(trim($b['class_name'] ?? ''), 0, 50),
                mb_substr(trim($b['team'] ?? ''), 0, 50), mb_substr(trim($b['note'] ?? ''), 0, 500),
            ));
        j(array('id' => (int)db()->lastInsertId()));
    }
}

if (preg_match('#^/students/(\d+)$#', $path, $m)) {
    $sid = (int)$m[1];
    if ($method === 'PUT') {
        require_teacher();
        $b = body();
        if (!q_one('SELECT 1 FROM students WHERE id=?', array($sid))) jerr('Không tìm thấy học sinh', 404);
        db()->prepare('UPDATE students SET name=?, class_name=?, team=?, note=? WHERE id=?')
            ->execute(array(
                mb_substr(trim($b['name'] ?? ''), 0, 100), mb_substr(trim($b['class_name'] ?? ''), 0, 50),
                mb_substr(trim($b['team'] ?? ''), 0, 50), mb_substr(trim($b['note'] ?? ''), 0, 500), $sid,
            ));
        j(array('ok' => true));
    }
    if ($method === 'DELETE') {
        require_teacher();
        db()->prepare('DELETE FROM students WHERE id=?')->execute(array($sid));
        j(array('ok' => true));
    }
}

// Giáo viên đặt lại mật khẩu cho học sinh (quên mật khẩu) — cần tài khoản giáo viên.
if (preg_match('#^/students/(\d+)/reset-password$#', $path, $m)) {
    if ($method !== 'PUT') jerr('Không hỗ trợ.', 405);
    require_teacher();
    $sid = (int)$m[1];
    if (!q_one('SELECT 1 FROM students WHERE id=?', array($sid))) jerr('Không tìm thấy học sinh', 404);
    $b = body();
    $npw = (string)($b['password'] ?? '');
    if (mb_strlen($npw) < 6) jerr('Mật khẩu mới ít nhất 6 ký tự.');
    db()->prepare('UPDATE students SET password_hash=? WHERE id=?')->execute(array(password_hash($npw, PASSWORD_DEFAULT), $sid));
    db()->prepare('DELETE FROM sessions WHERE student_id=?')->execute(array($sid));
    j(array('ok' => true));
}

// ---------------- UPLOAD ẢNH ----------------
if ($method === 'POST' && $path === '/uploads') {
    require_teacher();
    if (empty($_FILES['file']) || $_FILES['file']['error'] !== UPLOAD_ERR_OK) jerr('Chưa nhận được file ảnh.');
    $f = $_FILES['file'];
    $maxBytes = MAX_UPLOAD_MB * 1024 * 1024;
    if ($f['size'] > $maxBytes) jerr('Ảnh quá lớn (tối đa ' . MAX_UPLOAD_MB . 'MB).');
    $ext = strtolower(pathinfo($f['name'], PATHINFO_EXTENSION));
    if (!in_array($ext, array('jpg', 'jpeg', 'png', 'webp', 'gif'))) jerr('Chỉ nhận ảnh jpg/png/webp/gif.');
    $info = @getimagesize($f['tmp_name']);
    if ($info === false) jerr('File không phải ảnh hợp lệ.');
    $dir = rtrim(UPLOAD_DIR, '/');
    if (!is_dir($dir) && !mkdir($dir, 0755, true)) jerr('Không tạo được thư mục uploads.', 500);
    $safe = preg_replace('/[^\w.\-]/u', '_', $f['name']);
    $name = time() . '-' . mb_substr($safe, 0, 80);
    if (!move_uploaded_file($f['tmp_name'], $dir . '/' . $name)) jerr('Không lưu được file.', 500);
    $base = PUBLIC_BASE;
    if ($base === '') {
        $https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');
        $base = ($https ? 'https' : 'http') . '://' . ($_SERVER['HTTP_HOST'] ?? '');
    }
    j(array('url' => rtrim($base, '/') . '/uploads/' . $name));
}

// ================= MVP: LOP / BAI TAP / CHAM DIEM =================

function my_class_ids($user_id) {
    $ids = array();
    foreach (q_all('SELECT class_id FROM class_members WHERE user_id=?', array($user_id)) as $r) $ids[] = (int)$r['class_id'];
    return $ids;
}

function require_me() {
    return session_student();
}

function is_role_teacher($me) {
    return $me && (($me['role'] ?? 'student') === 'teacher');
}

function sub_status($sub) {
    if (!$sub) return 'todo';
    if ($sub['score'] !== null) return 'graded';
    if ($sub['submitted_at'] !== null && $sub['submitted_at'] !== '') return 'submitted';
    return 'draft';
}

// ---------------- CLASSES ----------------
if ($path === '/classes' && $method === 'GET') {
    $me = require_me();
    if (is_role_teacher($me)) {
        j(q_all('SELECT * FROM classes ORDER BY name'));
    }
    $ids = my_class_ids($me['id']);
    if (!$ids) { j(array()); }
    $in = implode(',', array_fill(0, count($ids), '?'));
    j(q_all("SELECT * FROM classes WHERE id IN ($in) ORDER BY name", $ids));
}

if ($path === '/classes' && $method === 'POST') {
    $me = require_me();
    if (!is_role_teacher($me)) jerr('Khu vực giáo viên.', 403);
    $b = body();
    $name = mb_substr(trim($b['name'] ?? ''), 0, 120);
    if ($name === '') jerr('Thiếu tên lớp.');
    $code = mb_substr(trim($b['join_code'] ?? ''), 0, 16);
    if ($code === '') $code = strtoupper(substr(md5(uniqid('', true)), 0, 8));
    if (q_one('SELECT 1 FROM classes WHERE join_code=?', array($code))) jerr('Mã lớp đã tồn tại.');
    db()->prepare('INSERT INTO classes (name, join_code) VALUES (?,?)')->execute(array($name, $code));
    j(array('id' => (int)db()->lastInsertId(), 'name' => $name, 'join_code' => $code));
}

if ($path === '/classes/join' && $method === 'POST') {
    $me = require_me();
    if (is_role_teacher($me)) jerr('Giáo viên không cần vào lớp bằng mã.', 400);
    $b = body();
    $code = trim($b['join_code'] ?? '');
    if ($code === '') jerr('Thiếu mã lớp.');
    $cl = q_one('SELECT * FROM classes WHERE join_code=?', array($code));
    if (!$cl) jerr('Mã lớp không đúng.', 404);
    db()->prepare('INSERT IGNORE INTO class_members (class_id, user_id) VALUES (?,?)')->execute(array($cl['id'], $me['id']));
    j(array('class' => $cl));
}

if (preg_match('#^/classes/(\d+)/members$#', $path, $m)) {
    if ($method !== 'GET') jerr('Không hỗ trợ.', 405);
    $me = require_me();
    if (!is_role_teacher($me)) jerr('Khu vực giáo viên.', 403);
    $cid = (int)$m[1];
    j(array_map(function ($r) { unset($r['password_hash']); return $r; },
        q_all('SELECT s.id, s.name, s.class_name, s.role, cm.joined_at FROM class_members cm JOIN students s ON s.id=cm.user_id WHERE cm.class_id=? ORDER BY s.name', array($cid))));
}

// ---------------- ASSIGNMENTS ----------------
if ($path === '/assignments' && $method === 'GET') {
    $me = require_me();
    if (is_role_teacher($me)) {
        $classId = isset($_GET['class_id']) ? (int)$_GET['class_id'] : 0;
        if ($classId) j(q_all('SELECT a.*, c.name class_name, t.name topic_name FROM assignments a JOIN classes c ON c.id=a.class_id LEFT JOIN topics t ON t.id=a.topic_id WHERE a.class_id=? ORDER BY a.created_at DESC', array($classId)));
        j(q_all('SELECT a.*, c.name class_name, t.name topic_name FROM assignments a JOIN classes c ON c.id=a.class_id LEFT JOIN topics t ON t.id=a.topic_id ORDER BY a.created_at DESC'));
    }
    $ids = my_class_ids($me['id']);
    if (!$ids) { j(array()); }
    $in = implode(',', array_fill(0, count($ids), '?'));
    $rows = q_all("SELECT a.*, c.name class_name, t.name topic_name FROM assignments a JOIN classes c ON c.id=a.class_id LEFT JOIN topics t ON t.id=a.topic_id WHERE a.class_id IN ($in) ORDER BY a.created_at DESC", $ids);
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
    $classId = (int)($b['class_id'] ?? 0);
    if ($title === '') jerr('Thiếu tên bài tập.');
    if (!$classId || !q_one('SELECT 1 FROM classes WHERE id=?', array($classId))) jerr('Thiếu lớp.');
    $topic = trim($b['topic_id'] ?? '');
    if ($topic === '') $topic = null;
    $deadline = trim($b['deadline'] ?? '');
    if ($deadline !== '' && !preg_match('/^\d{4}-\d{2}-\d{2}$/', $deadline)) $deadline = null;
    if ($deadline === '') $deadline = null;
    db()->prepare('INSERT INTO assignments (class_id, topic_id, title, description, deadline, created_by) VALUES (?,?,?,?,?,?)')
        ->execute(array($classId, $topic, $title, mb_substr(trim($b['description'] ?? ''), 0, 2000), $deadline, $me['id']));
    $aid = (int)db()->lastInsertId();
    $qs = is_array($b['questions'] ?? null) ? $b['questions'] : array();
    $n = 0;
    foreach ($qs as $i => $q) {
        $content = trim(is_string($q) ? $q : ($q['content'] ?? ''));
        if ($content === '') continue;
        $ans = is_string($q) ? '' : trim($q['answer'] ?? '');
        $pts = is_string($q) ? 1 : (float)($q['points'] ?? 1);
        if ($pts <= 0) $pts = 1;
        db()->prepare('INSERT INTO assign_questions (assignment_id, idx, content, answer, points) VALUES (?,?,?,?,?)')
            ->execute(array($aid, $i + 1, mb_substr($content, 0, 4000), mb_substr($ans, 0, 4000), $pts));
        $n++;
    }
    if ($n === 0) jerr('Cần ít nhất 1 câu hỏi.');
    j(array('id' => $aid, 'questions' => $n));
}

if (preg_match('#^/assignments/(\d+)$#', $path, $m)) {
    if ($method !== 'GET') jerr('Không hỗ trợ.', 405);
    $me = require_me();
    $aid = (int)$m[1];
    $a = q_one('SELECT a.*, c.name class_name, t.name topic_name FROM assignments a JOIN classes c ON c.id=a.class_id LEFT JOIN topics t ON t.id=a.topic_id WHERE a.id=?', array($aid));
    if (!$a) jerr('Không tìm thấy bài tập.', 404);
    $teacher = is_role_teacher($me);
    if (!$teacher && !in_array((int)$a['class_id'], my_class_ids($me['id']), true)) jerr('Bạn không ở lớp này.', 403);
    $qs = q_all('SELECT id, idx, content, points' . ($teacher ? ', answer' : '') . ' FROM assign_questions WHERE assignment_id=? ORDER BY idx', array($aid));
    $a['questions'] = $qs;
    if (!$teacher) {
        $sub = q_one('SELECT id, answer, score, feedback, submitted_at, graded_at, question_scores FROM submissions WHERE assignment_id=? AND student_id=?', array($aid, $me['id']));
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
    if (!in_array((int)$a['class_id'], my_class_ids($me['id']), true)) jerr('Bạn không ở lớp này.', 403);
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
    if ($existing) {
        db()->prepare('UPDATE submissions SET answer=?, submitted_at=NOW(), question_scores=NULL, score=NULL, feedback=NULL, graded_at=NULL WHERE id=?')->execute(array($payload, $existing['id']));
        $sid = (int)$existing['id'];
    } else {
        db()->prepare('INSERT INTO submissions (assignment_id, student_id, answer, submitted_at) VALUES (?,?,?,NOW())')
            ->execute(array($aid, $me['id'], $payload));
        $sid = (int)db()->lastInsertId();
    }
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
    if (!in_array((int)$a['class_id'], my_class_ids($me['id']), true)) jerr('Bạn không ở lớp này.', 403);
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
    if ($existing) {
        // khong dong thoi nop: neu chua nop thi van la draft
        db()->prepare('UPDATE submissions SET answer=? WHERE id=?')->execute(array($payload, $existing['id']));
        $sid = (int)$existing['id'];
    } else {
        db()->prepare('INSERT INTO submissions (assignment_id, student_id, answer, submitted_at) VALUES (?,?,?,NULL)')
            ->execute(array($aid, $me['id'], $payload));
        $sid = (int)db()->lastInsertId();
    }
    j(array('id' => $sid, 'status' => 'draft'));
}

if (preg_match('#^/assignments/(\d+)/submissions$#', $path, $m)) {
    if ($method !== 'GET') jerr('Không hỗ trợ.', 405);
    $me = require_me();
    if (!is_role_teacher($me)) jerr('Khu vực giáo viên.', 403);
    $aid = (int)$m[1];
    $a = q_one('SELECT * FROM assignments WHERE id=?', array($aid));
    if (!$a) jerr('Không tìm thấy bài tập.', 404);
    $rows = q_all('SELECT s.id sid, s.name, s.class_name, sub.id sub_id, sub.answer, sub.score, sub.feedback, sub.submitted_at, sub.graded_at, sub.question_scores
        FROM class_members cm JOIN students s ON s.id=cm.user_id
        LEFT JOIN submissions sub ON sub.assignment_id=? AND sub.student_id=s.id
        WHERE cm.class_id=? ORDER BY s.name', array($aid, $a['class_id']));
    $qs = q_all('SELECT idx, content, answer, points FROM assign_questions WHERE assignment_id=? ORDER BY idx', array($aid));
    $out = array();
    foreach ($rows as $r) {
        $ans = json_decode($r['answer'] ?? 'null', true);
        $qscores = json_decode($r['question_scores'] ?? 'null', true);
        $out[] = array(
            'submission_id' => $r['sub_id'] !== null ? (int)$r['sub_id'] : null,
            'student_id' => (int)$r['sid'], 'name' => $r['name'], 'class_name' => $r['class_name'],
            'score' => $r['score'] !== null ? (float)$r['score'] : null,
            'feedback' => $r['feedback'], 'submitted_at' => $r['submitted_at'],
            'graded_at' => $r['graded_at'], 'question_scores' => $qscores,
            'status' => sub_status($r['sub_id'] === null ? null : $r),
            'answers' => $ans,
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
    $b = body();
    $score = $b['score'] ?? null;
    if ($score === null || $score === '') jerr('Thiếu điểm.');
    $score = max(0, min(10, (float)$score));
    $qsc = is_array($b['question_scores'] ?? null) ? $b['question_scores'] : null;
    $qscJson = $qsc !== null ? json_encode($qsc, JSON_UNESCAPED_UNICODE) : null;
    db()->prepare('UPDATE submissions SET score=?, feedback=?, question_scores=?, graded_at=NOW() WHERE id=?')
        ->execute(array($score, mb_substr(trim($b['feedback'] ?? ''), 0, 1000), $qscJson, $sid));
    j(array('ok' => true, 'score' => $score));
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
        $assigned = (int)q_one("SELECT COUNT(*) c FROM assignments WHERE class_id IN ($in)", $ids)['c'];
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
        $assigned = (int)q_one("SELECT COUNT(*) c FROM assignments WHERE class_id IN ($in)", $ids)['c'];
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

    // Bai hoc: tong + da hoan thanh + tien do theo chuyen de
    $lessonsTotal = (int)q_one('SELECT COUNT(*) c FROM lessons')['c'];
    $lessonsDone = (int)q_one('SELECT COUNT(*) c FROM lesson_completions WHERE student_id=?', array($me['id']))['c'];
    $topicRows = q_all('SELECT t.id, t.name,
        (SELECT COUNT(*) FROM lessons l WHERE l.topic_id=t.id) lt,
        (SELECT COUNT(*) FROM lessons l JOIN lesson_completions lc ON lc.lesson_id=l.id AND lc.student_id=? WHERE l.topic_id=t.id) ld
        FROM topics t WHERE (SELECT COUNT(*) FROM lessons l2 WHERE l2.topic_id=t.id) > 0', array($me['id']));
    $topicsDone = 0; $topicsWithLessons = 0;
    $currentTopic = null;
    foreach ($topicRows as $t) {
        $topicsWithLessons++;
        if ((int)$t['lt'] === (int)$t['ld']) $topicsDone++;
        elseif ($currentTopic === null && (int)$t['ld'] < (int)$t['lt']) {
            $currentTopic = array('id' => $t['id'], 'name' => $t['name'], 'done' => (int)$t['ld'], 'total' => (int)$t['lt']);
        }
    }
    $lessonRatio = $lessonsTotal ? round($lessonsDone / $lessonsTotal, 3) : 0;
    $assignRatio = $assigned ? round($completed / $assigned, 3) : 0;
    // 72% cuoi cung: tron lesson + assignment (neu chua co bai hoc chi dung assignment)
    $overall = $lessonsTotal > 0 ? round(0.5 * $lessonRatio + 0.5 * $assignRatio, 3) : $assignRatio;

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
    ));
}

// ---------------- LESSONS ----------------
if ($path === '/lessons' && $method === 'GET') {
    $me = require_me();
    $topicId = trim($_GET['topic_id'] ?? '');
    if ($topicId === '') jerr('Thiếu topic_id.');
    $rows = q_all('SELECT l.id, l.topic_id, l.title, l.content, l.idx, t.name topic_name,
        (SELECT 1 FROM lesson_completions lc WHERE lc.lesson_id=l.id AND lc.student_id=?) completed
        FROM lessons l JOIN topics t ON t.id=l.topic_id WHERE l.topic_id=? ORDER BY l.idx', array($me['id'], $topicId));
    foreach ($rows as &$r) $r['completed'] = $r['completed'] ? true : false;
    unset($r);
    j($rows);
}

if ($path === '/lessons' && $method === 'POST') {
    $me = require_me();
    if (!is_role_teacher($me)) jerr('Khu vực giáo viên.', 403);
    $b = body();
    $topicId = trim($b['topic_id'] ?? '');
    $title = mb_substr(trim($b['title'] ?? ''), 0, 255);
    if ($topicId === '' || $title === '') jerr('Thiếu chủ đề hoặc tiêu đề.');
    if (!q_one('SELECT 1 FROM topics WHERE id=?', array($topicId))) jerr('Chuyên đề không tồn tại.');
    $idx = max(1, (int)($b['idx'] ?? 1));
    db()->prepare('INSERT INTO lessons (topic_id, title, content, idx) VALUES (?,?,?,?)')
        ->execute(array($topicId, $title, (string)($b['content'] ?? ''), $idx));
    j(array('id' => (int)db()->lastInsertId()));
}

if (preg_match('#^/lessons/(\d+)/complete$#', $path, $m)) {
    if ($method !== 'POST') jerr('Không hỗ trợ.', 405);
    $me = require_me();
    if (is_role_teacher($me)) jerr('Giáo viên không đánh dấu bài học.', 400);
    $lid = (int)$m[1];
    if (!q_one('SELECT 1 FROM lessons WHERE id=?', array($lid))) jerr('Không tìm thấy bài học.', 404);
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
    $students = (int)q_one("SELECT COUNT(*) c FROM students WHERE COALESCE(role,'student')<>'teacher'")['c'];
    $active = (int)q_one('SELECT COUNT(*) c FROM assignments WHERE deadline IS NULL OR deadline >= CURDATE()')['c'];
    $ungraded = (int)q_one('SELECT COUNT(*) c FROM submissions WHERE score IS NULL AND submitted_at IS NOT NULL')['c'];

    // Bai gan day + so da nop/chua nop
    $recent = q_all('SELECT a.id, a.title, a.deadline, a.topic_id, c.name class_name, t.name topic_name,
        (SELECT COUNT(*) FROM class_members cm WHERE cm.class_id=a.class_id) total,
        (SELECT COUNT(*) FROM submissions s WHERE s.assignment_id=a.id AND s.submitted_at IS NOT NULL) submitted
        FROM assignments a JOIN classes c ON c.id=a.class_id LEFT JOIN topics t ON t.id=a.topic_id
        ORDER BY a.created_at DESC LIMIT 5');

    // Tien do lop theo chuyen de: da nop / (so bai cua CD * so hs lop do)
    $tpRows = q_all('SELECT t.id tid, t.name tname, a.class_id,
        COUNT(DISTINCT a.id) an,
        (SELECT COUNT(*) FROM submissions s WHERE s.assignment_id=a.id AND s.submitted_at IS NOT NULL) done
        FROM topics t
        JOIN assignments a ON a.topic_id=t.id
        GROUP BY t.id, t.name, a.class_id ORDER BY t.name');
    $topicProgress = array();
    foreach ($tpRows as $t) {
        $members = (int)q_one('SELECT COUNT(*) c FROM class_members WHERE class_id=?', array($t['class_id']))['c'];
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

jerr('Không tìm thấy API: ' . $path, 404);
