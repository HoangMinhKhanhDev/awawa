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
    $n = 0;
    try { $n = (int)q_one('SELECT COUNT(*) c FROM questions')['c']; } catch (Exception $e) {}
    j(array('status' => 'ok', 'backend' => 'hostinger-mysql', 'time' => date('Y-m-d\TH:i:s'), 'total_questions' => $n));
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
    db()->prepare('INSERT INTO attempts (exam_id, mode, correct, total, accuracy, detail, student_name, focus_exits, focus_log) VALUES (?,?,?,?,?,?,?,?,?)')
        ->execute(array(
            $examId, $mode, $correct, $total, $acc,
            json_encode($details, JSON_UNESCAPED_UNICODE),
            mb_substr(trim($b['student_name'] ?? ''), 0, 100),
            max(0, (int)($b['focus_exits'] ?? 0)),
            json_encode($flog, JSON_UNESCAPED_UNICODE),
        ));
    j(array('attempt_id' => (int)db()->lastInsertId(), 'correct' => $correct, 'total' => $total, 'accuracy' => $acc, 'focus_exits' => max(0, (int)($b['focus_exits'] ?? 0))));
}

// ---------------- ATTEMPTS ----------------
if ($method === 'GET' && $path === '/attempts') {
    $sql = 'SELECT * FROM attempts WHERE 1=1';
    $p = array();
    if (!empty($_GET['student_name'])) { $sql .= ' AND student_name=?'; $p[] = $_GET['student_name']; }
    if (!empty($_GET['mode'])) { $sql .= ' AND mode=?'; $p[] = $_GET['mode']; }
    $sql .= ' ORDER BY id DESC LIMIT 200';
    j(array_map('row_to_attempt', q_all($sql, $p)));
}

// ---------------- STATS ----------------
if ($method === 'GET' && $path === '/stats/overview') {
    $filter = $_GET['student_name'] ?? '';
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
        j(q_all($sql, $p));
    }
    if ($method === 'POST') {
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
        db()->prepare('DELETE FROM students WHERE id=?')->execute(array($sid));
        j(array('ok' => true));
    }
}

// ---------------- UPLOAD ẢNH ----------------
if ($method === 'POST' && $path === '/uploads') {
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

jerr('Không tìm thấy API: ' . $path, 404);
