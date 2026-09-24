<?php
// Debug agnes_chat_stream — xoa sau khi chay.
header('Content-Type: application/json; charset=utf-8');
error_reporting(E_ALL);
ini_set('display_errors', '1');
set_time_limit(180);
if (($_GET['k'] ?? '') !== 'aabbccdd11223344') { http_response_code(403); echo '{"error":"forbidden"}'; exit; }
require __DIR__ . '/api/config.php';
$events = array();
$emit = function ($ev, $data) use (&$events) {
    $events[] = array($ev, $data);
};
$t0 = microtime(true);
$raw = agnes_chat_stream(array(
    array('role' => 'user', 'content' => 'Tao 2 flashcard ve nhip tim. JSON {"cards":[{"front":"...","back":"..."}]}'),
), 'agnes-2.5-flash', $emit, 800, 0.3);
$ms = (int)((microtime(true) - $t0) * 1000);
$kinds = array();
foreach ($events as $e) { $kinds[$e[0]] = ($kinds[$e[0]] ?? 0) + 1; }
echo json_encode(array(
    'ms' => $ms,
    'kinds' => $kinds,
    'raw_len' => is_string($raw) ? strlen($raw) : null,
    'raw_head' => is_string($raw) ? substr($raw, 0, 300) : $raw,
    'events_head' => array_slice($events, 0, 3),
    'events_tail' => array_slice($events, -2),
), JSON_UNESCAPED_UNICODE);
@unlink(__FILE__);
