<?php
// Debug /me/progress queries. Tu xoa sau khi chay.
header('Content-Type: application/json; charset=utf-8');
error_reporting(E_ALL);
ini_set('display_errors', '1');
if (($_GET['k'] ?? '') !== '476698c5de9719778f8f3600f04427dc') { http_response_code(403); echo '{"error":"forbidden"}'; exit; }
$uid = (int)($_GET['uid'] ?? 0);
try {
    $pdo = new PDO('mysql:host=localhost;dbname=u670570555_awawa;charset=utf8mb4', 'u670570555_awawa', '73dQWgTF8wFvb89l', array(PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION));
} catch (Exception $e) { http_response_code(500); echo json_encode(array('connect' => $e->getMessage())); exit; }
$steps = array();
try {
    $steps['assigned_ids'] = $pdo->prepare('SELECT class_id FROM class_members WHERE user_id=?');
    $steps['assigned_ids']->execute(array($uid));
    $ids = $steps['assigned_ids']->fetchAll(PDO::FETCH_COLUMN);
    $steps['ids'] = $ids;
    $assigned = 0;
    if ($ids) {
        $in = implode(',', array_fill(0, count($ids), '?'));
        $st = $pdo->prepare("SELECT COUNT(*) c FROM assignments WHERE class_id IN ($in)");
        $st->execute($ids);
        $assigned = (int)$st->fetch()['c'];
    }
    $steps['assigned'] = $assigned;
    $st = $pdo->prepare('SELECT sub.score, sub.submitted_at, a.topic_id, t.name topic_name FROM submissions sub JOIN assignments a ON a.id=sub.assignment_id LEFT JOIN topics t ON t.id=a.topic_id WHERE sub.student_id=?');
    $st->execute(array($uid));
    $subs = $st->fetchAll(PDO::FETCH_ASSOC);
    $steps['subs'] = count($subs);
    $st = $pdo->prepare('SELECT score FROM submissions WHERE student_id=? AND score IS NOT NULL ORDER BY graded_at DESC LIMIT 1');
    $st->execute(array($uid));
    $latest = $st->fetch();
    $steps['latest'] = $latest;
    $st = $pdo->prepare('SELECT a.title FROM submissions sub JOIN assignments a ON a.id=sub.assignment_id WHERE sub.student_id=? AND sub.score IS NOT NULL ORDER BY sub.graded_at DESC LIMIT 1');
    $st->execute(array($uid));
    $lt = $st->fetch();
    $steps['latest_title'] = $lt['title'] ?? null;
    $st = $pdo->prepare('SELECT COUNT(*) c FROM lessons');
    $st->execute();
    $steps['lessons_total'] = (int)$st->fetch()['c'];
    $st = $pdo->prepare('SELECT COUNT(*) c FROM lesson_completions WHERE student_id=?');
    $st->execute(array($uid));
    $steps['lessons_done'] = (int)$st->fetch()['c'];
    $sql = 'SELECT t.id, t.name,
        (SELECT COUNT(*) FROM lessons l WHERE l.topic_id=t.id) lt,
        (SELECT COUNT(*) FROM lessons l JOIN lesson_completions lc ON lc.lesson_id=l.id AND lc.student_id=? WHERE l.topic_id=t.id) ld
        FROM topics t WHERE (SELECT COUNT(*) FROM lessons l2 WHERE l2.topic_id=t.id) > 0';
    $st = $pdo->prepare($sql);
    $st->execute(array($uid, $uid));
    $steps['topic_rows'] = $st->fetchAll(PDO::FETCH_ASSOC);
    echo json_encode(array('ok' => true, 'steps' => $steps));
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(array('error' => $e->getMessage(), 'steps' => $steps));
}
@unlink(__FILE__);
