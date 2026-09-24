<?php
// M3: assign_questions.question_id + submission_answers + backfill tu JSON cu. Tu xoa.
header('Content-Type: application/json; charset=utf-8');
if (($_GET['k'] ?? '') !== '7f26d7e351417a47ba937e651f616b93') { http_response_code(403); echo '{"error":"forbidden"}'; exit; }
try {
    $pdo = new PDO('mysql:host=localhost;dbname=u670570555_awawa;charset=utf8mb4', 'u670570555_awawa', '73dQWgTF8wFvb89l', array(PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION));
} catch (Exception $e) { http_response_code(500); echo json_encode(array('error' => $e->getMessage())); exit; }
$done = array(); $errors = array();
$steps = array(
    'aq_qid' => "ALTER TABLE assign_questions ADD COLUMN question_id INT NULL",
    'aq_idx' => "CREATE INDEX idx_aq_qid ON assign_questions (question_id)",
    'aq_fk' => "ALTER TABLE assign_questions ADD CONSTRAINT fk_aq_question FOREIGN KEY (question_id) REFERENCES questions (id) ON DELETE SET NULL",
    'sa_new' => "CREATE TABLE IF NOT EXISTS submission_answers (
      id INT AUTO_INCREMENT PRIMARY KEY,
      submission_id INT NOT NULL,
      question_id INT NULL,
      assign_q_idx INT NULL,
      answer TEXT,
      is_correct TINYINT NULL,
      points FLOAT NULL,
      feedback VARCHAR(1000) DEFAULT '',
      INDEX idx_sa_sub (submission_id),
      INDEX idx_sa_q (question_id),
      CONSTRAINT fk_sa_sub FOREIGN KEY (submission_id) REFERENCES submissions (id) ON DELETE CASCADE,
      CONSTRAINT fk_sa_q FOREIGN KEY (question_id) REFERENCES questions (id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
);
foreach ($steps as $k => $s) {
    try { $pdo->exec($s); $done[] = $k; } catch (Exception $e) { $errors[] = $k . ': ' . mb_substr($e->getMessage(), 0, 150); }
}
// Backfill: moi submission -> rows tu answer JSON + assign_questions
$subs = $pdo->query('SELECT id, assignment_id, answer, question_scores FROM submissions')->fetchAll(PDO::FETCH_ASSOC);
$rows = 0;
foreach ($subs as $sub) {
    $ans = json_decode($sub['answer'] ?? 'null', true);
    if (!is_array($ans)) $ans = array();
    $qsc = json_decode($sub['question_scores'] ?? 'null', true);
    if (!is_array($qsc)) $qsc = array();
    $aqs = $pdo->prepare('SELECT id, idx, question_id FROM assign_questions WHERE assignment_id=? ORDER BY idx');
    $aqs->execute(array($sub['assignment_id']));
    $ins = $pdo->prepare('INSERT IGNORE INTO submission_answers (submission_id, question_id, assign_q_idx, answer, is_correct, points, feedback) VALUES (?,?,?,?,?,?,?)');
    // INSERT IGNORE can khong unique key -> dung check ton tai
    $exists = $pdo->prepare('SELECT COUNT(*) c FROM submission_answers WHERE submission_id=?');
    $exists->execute(array($sub['id']));
    if ((int)$exists->fetch()['c'] > 0) continue;
    foreach ($aqs as $aq) {
        $idx = (int)$aq['idx'];
        $text = isset($ans[(string)$idx]) ? (string)$ans[(string)$idx] : (isset($ans[$idx]) ? (string)$ans[$idx] : '');
        $pt = isset($qsc[(string)$idx]) ? (float)$qsc[(string)$idx] : (isset($qsc[$idx]) ? (float)$qsc[$idx] : null);
        $ins->execute(array($sub['id'], $aq['question_id'], $idx, $text, null, $pt, ''));
        $rows++;
    }
}
echo json_encode(array('done' => $done, 'errors' => $errors, 'backfilled_rows' => $rows,
    'sa_total' => (int)$pdo->query('SELECT COUNT(*) c FROM submission_answers')->fetch()['c']));
@unlink(__FILE__);
