<?php

function v2_module_payload($row)
{
    $settings = array();
    if (!empty($row['settings_json'])) {
        $decoded = json_decode((string) $row['settings_json'], true);
        if (is_array($decoded)) $settings = $decoded;
    }
    return array(
        'id' => (int) $row['id'],
        'code' => (string) $row['code'],
        'name' => (string) $row['name'],
        'description' => (string) ($row['description'] ?? ''),
        'category' => (string) ($row['category'] ?? 'learning'),
        'route_slug' => (string) ($row['route_slug'] ?? ''),
        'available' => (bool) ($row['available'] ?? false),
        'default_enabled' => (bool) ($row['default_enabled'] ?? false),
        'enabled' => (bool) ($row['enabled'] ?? false),
        'position' => (int) ($row['position'] ?? 0),
        'settings' => $settings,
        'settings_schema_version' => (int) ($row['schema_version'] ?? $row['settings_schema_version'] ?? 1),
    );
}

function v2_school_teams($me, $schoolId, $role)
{
    $membershipFilter = '';
    if ($role === 'teacher') {
        $membershipFilter = " AND EXISTS (SELECT 1 FROM `team_memberships` tm WHERE tm.`team_id` = t.`id` AND tm.`user_id` = ? AND tm.`role` = 'coach' AND tm.`access` = 'include' AND tm.`status` = 'active' AND tm.`left_at` IS NULL)";
    } elseif ($role === 'student') {
        $membershipFilter = " AND EXISTS (SELECT 1 FROM `team_memberships` tm WHERE tm.`team_id` = t.`id` AND tm.`user_id` = ? AND tm.`role` = 'student' AND tm.`access` = 'include' AND tm.`status` = 'active' AND tm.`left_at` IS NULL)";
    }
    $params = array_merge(
        array((int) $me['id'], (int) $schoolId),
        ($role === 'teacher' || $role === 'student') ? array((int) $me['id']) : array()
    );
    $rows = q_all(
        "SELECT t.`id`, t.`slug`, t.`name`, t.`subject_id`, t.`description`, s.`name` AS `subject_name`, (SELECT tm.`role` FROM `team_memberships` tm WHERE tm.`team_id` = t.`id` AND tm.`user_id` = ? LIMIT 1) AS `membership_role` FROM `teams` t INNER JOIN `subjects` s ON s.`id` = t.`subject_id` AND s.`school_id` = t.`school_id` WHERE t.`school_id` = ? AND t.`status` = 'active' AND s.`status` = 'active'" . $membershipFilter . ' ORDER BY s.`name`, t.`name`',
        $params
    );
    $teams = array();
    foreach ($rows as $row) {
        $teams[] = array(
            'id' => (int) $row['id'],
            'slug' => (string) $row['slug'],
            'name' => (string) $row['name'],
            'description' => (string) ($row['description'] ?? ''),
            'subject_id' => (string) $row['subject_id'],
            'subject_name' => (string) $row['subject_name'],
            'membership_role' => $row['membership_role'] !== null ? (string) $row['membership_role'] : null,
        );
    }
    return $teams;
}

function v2_slug($value, $fallback)
{
    $ascii = function_exists('iconv') ? iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', trim((string) $value)) : trim((string) $value);
    if ($ascii === false) $ascii = trim((string) $value);
    $slug = strtolower(trim((string) preg_replace('/[^a-zA-Z0-9]+/', '-', (string) $ascii), '-'));
    if ($slug === '') $slug = $fallback;
    return substr($slug, 0, 140);
}

function v2_unique_slug($table, $schoolId, $value, $fallback, $excludeId = 0)
{
    $base = v2_slug($value, $fallback);
    $slug = $base;
    $suffix = 2;
    while (q_one("SELECT 1 FROM `$table` WHERE school_id=? AND slug=? AND id<>?", array((int) $schoolId, $slug, $excludeId))) {
        $slug = substr($base, 0, 132) . '-' . $suffix;
        $suffix++;
    }
    return $slug;
}

function v2_unique_global_slug($table, $value, $fallback, $excludeId = 0)
{
    $base = v2_slug($value, $fallback);
    $slug = $base;
    $suffix = 2;
    while (q_one("SELECT 1 FROM `$table` WHERE slug=? AND id<>?", array($slug, (int) $excludeId))) {
        $slug = substr($base, 0, 132) . '-' . $suffix;
        $suffix++;
    }
    return $slug;
}

function v2_reconcile_class_team_students($teamId)
{
    $teamId = (int) $teamId;
    $linkedUsers = array();
    $classSourceIds = array();
    foreach (q_all(
        "SELECT DISTINCT cm.`user_id`, cm.`class_id` FROM `class_members` cm INNER JOIN `class_team_links` ctl ON ctl.`class_id` = cm.`class_id` AND ctl.`team_id` = ? AND ctl.`status` = 'active'",
        array($teamId)
    ) as $row) {
        $userId = (int) $row['user_id'];
        $linkedUsers[$userId] = true;
        if (!isset($classSourceIds[$userId])) $classSourceIds[$userId] = (int) $row['class_id'];
    }
    $classSourced = array();
    foreach (q_all("SELECT user_id FROM team_memberships WHERE team_id=? AND source='class'", array($teamId)) as $row) {
        $classSourced[(int) $row['user_id']] = true;
    }
    $affectedUsers = array_merge(array_keys($linkedUsers), array_keys($classSourced));
    foreach (array_unique($affectedUsers) as $userId) {
        $target = q_one('SELECT source, access, status FROM team_memberships WHERE team_id=? AND user_id=? AND role=\'student\'', array($teamId, $userId));
        if ($target && (string) $target['source'] === 'manual') continue;
        if (isset($linkedUsers[$userId])) {
            sync_team_membership_target($teamId, $userId, 'student', true, 'class', 'include', isset($classSourceIds[$userId]) ? $classSourceIds[$userId] : null);
        } else {
            remove_team_membership_target($teamId, $userId, 'student', 'class');
        }
        $effective = q_one('SELECT access, status FROM team_memberships WHERE team_id=? AND user_id=? AND role=\'student\'', array($teamId, $userId));
        $included = $effective && (string) $effective['access'] === 'include' && (string) $effective['status'] === 'active';
        if ($included) {
            db()->prepare("UPDATE team_members SET left_at=NULL WHERE team_id=? AND user_id=? AND member_role='student'")->execute(array($teamId, $userId));
            db()->prepare("INSERT IGNORE INTO team_members (team_id,user_id,member_role,joined_at) VALUES (?,?,'student',NOW())")->execute(array($teamId, $userId));
        } else {
            db()->prepare("UPDATE team_members SET left_at=NOW() WHERE team_id=? AND user_id=? AND member_role='student' AND (left_at IS NULL OR left_at='')")->execute(array($teamId, $userId));
        }
    }
}

function v2_sync_legacy_role($userId)
{
    $systemRoles = policy_system_roles((int) $userId);
    $memberships = q_all("SELECT `role` FROM `school_memberships` WHERE `user_id` = ? AND `status` = 'active' AND `left_at` IS NULL", array((int) $userId));
    $role = 'student';
    if (in_array('super_admin', $systemRoles, true)) $role = 'super_admin';
    elseif (in_array('admin', array_column($memberships, 'role'), true)) $role = 'admin';
    elseif (in_array('teacher', array_column($memberships, 'role'), true)) $role = 'teacher';
    $active = count($memberships) > 0 || in_array('super_admin', $systemRoles, true) ? 1 : 0;
    db()->prepare('UPDATE students SET role=?, active=? WHERE id=?')->execute(array($role, $active, (int) $userId));
    if ($active === 0) db()->prepare('DELETE FROM sessions WHERE student_id=?')->execute(array((int) $userId));
}

function handle_v2_api($method, $path)
{
    if (strpos($path, '/v2/') !== 0 && $path !== '/v2') return false;
    policy_require_schema();
    $me = session_student();
    if ((int) ($me['active'] ?? 1) !== 1) jerr('Tài khoản đã bị khóa.', 403);
    $systemRoles = policy_system_roles((int) $me['id']);

    if ($method === 'GET' && $path === '/v2/me/contexts') {
        $schools = array();
        $memberships = q_all(
            "SELECT sm.`school_id`, sm.`role`, s.`slug`, s.`name`, s.`status` FROM `school_memberships` sm INNER JOIN `schools` s ON s.`id` = sm.`school_id` WHERE sm.`user_id` = ? AND sm.`status` = 'active' AND sm.`left_at` IS NULL AND s.`status` = 'active' ORDER BY s.`name`",
            array((int) $me['id'])
        );
        foreach ($memberships as $membership) {
            $schoolId = (int) $membership['school_id'];
            $schools[$schoolId] = array(
                'id' => $schoolId,
                'slug' => (string) $membership['slug'],
                'name' => (string) $membership['name'],
                'role' => (string) $membership['role'],
                'teams' => v2_school_teams($me, $schoolId, (string) $membership['role']),
            );
        }
        if (in_array('super_admin', $systemRoles, true)) {
            $grants = q_all(
                "SELECT bg.`school_id`, bg.`id` AS `grant_id`, bg.`reason`, s.`slug`, s.`name` FROM `break_glass_grants` bg INNER JOIN `schools` s ON s.`id` = bg.`school_id` WHERE bg.`user_id` = ? AND bg.`status` = 'active' AND bg.`revoked_at` IS NULL AND bg.`expires_at` > NOW() AND s.`status` = 'active' ORDER BY s.`name`",
                array((int) $me['id'])
            );
            foreach ($grants as $grant) {
                $schoolId = (int) $grant['school_id'];
                policy_audit($me, array('school_id' => $schoolId, 'break_glass_grant_id' => (int) $grant['grant_id']), 'tenant.break_glass.contexts', 'school', (string) $schoolId, 'allow', (string) $grant['reason'], array('grant_id' => (int) $grant['grant_id']));
                if (isset($schools[$schoolId])) {
                    $schools[$schoolId]['break_glass_grant_id'] = (int) $grant['grant_id'];
                    continue;
                }
                $schools[$schoolId] = array(
                    'id' => $schoolId,
                    'slug' => (string) $grant['slug'],
                    'name' => (string) $grant['name'],
                    'role' => 'super_admin',
                    'break_glass_grant_id' => (int) $grant['grant_id'],
                    'teams' => v2_school_teams($me, $schoolId, 'super_admin'),
                );
            }
        }
        j(array('user' => $me, 'system_roles' => $systemRoles, 'schools' => array_values($schools)));
    }

    if ($path === '/v2/schools' && $method === 'POST') {
        if (!policy_system_capability($me, 'platform.manage')) jerr('Bạn không có quyền tạo trường.', 403);
        $payload = body();
        $name = mb_substr(trim((string) ($payload['name'] ?? '')), 0, 200);
        $code = mb_substr(trim((string) ($payload['code'] ?? '')), 0, 64);
        $timezone = (string) ($payload['timezone'] ?? 'Asia/Ho_Chi_Minh');
        if ($name === '') jerr('Thiếu tên trường.', 422);
        if (!in_array($timezone, timezone_identifiers_list(), true)) jerr('Múi giờ không hợp lệ.', 422);
        $slug = v2_unique_global_slug('schools', $name, 'truong');
        db()->prepare("INSERT INTO schools (name,slug,code,timezone,status) VALUES (?,?,?,?,'active')")->execute(array($name, $slug, $code, $timezone));
        $schoolId = (int) db()->lastInsertId();
        $context = array('school_id' => $schoolId, 'role' => 'super_admin', 'break_glass_grant_id' => 0);
        policy_audit($me, $context, 'platform.school.create', 'school', (string) $schoolId, 'allow', '', array('name' => $name, 'slug' => $slug));
        j(array('id' => $schoolId, 'name' => $name, 'slug' => $slug, 'code' => $code, 'timezone' => $timezone, 'status' => 'active'));
    }

    if (preg_match('#^/v2/schools/([1-9][0-9]*)$#', $path, $match) && ($method === 'PUT' || $method === 'PATCH' || $method === 'DELETE')) {
        $context = policy_resolve_school($me, (int) $match[1]);
        if (!policy_capability($me, $context, 'school.manage')) jerr('Bạn không có quyền cập nhật trường.', 403);
        $schoolId = (int) $context['school_id'];
        $school = q_one("SELECT * FROM `schools` WHERE `id`=? AND `status`='active'", array($schoolId));
        if (!$school) jerr('Không tìm thấy trường.', 404);
        $name = (string) $school['name'];
        $code = (string) ($school['code'] ?? '');
        $timezone = (string) ($school['timezone'] ?? 'Asia/Ho_Chi_Minh');
        $status = 'active';
        if ($method !== 'DELETE') {
            $payload = body();
            $name = mb_substr(trim((string) ($payload['name'] ?? $name)), 0, 200);
            $code = mb_substr(trim((string) ($payload['code'] ?? $code)), 0, 64);
            $timezone = (string) ($payload['timezone'] ?? $timezone);
            $status = (string) ($payload['status'] ?? 'active');
            if ($name === '') jerr('Thiếu tên trường.', 422);
            if (!in_array($timezone, timezone_identifiers_list(), true)) jerr('Múi giờ không hợp lệ.', 422);
            if (!in_array($status, array('active', 'archived'), true)) jerr('Trạng thái trường không hợp lệ.', 422);
        } else {
            $activeTeams = (int) q_one("SELECT COUNT(*) AS `total` FROM `teams` WHERE `school_id`=? AND `status`='active'", array($schoolId))['total'];
            $activeClasses = (int) q_one("SELECT COUNT(*) AS `total` FROM `classes` WHERE `school_id`=? AND `status`='active'", array($schoolId))['total'];
            if ($activeTeams > 0 || $activeClasses > 0) jerr('Trường vẫn còn đội hoặc lớp hoạt động.', 409);
            $status = 'archived';
        }
        $slug = v2_unique_global_slug('schools', $name, 'truong', $schoolId);
        db()->prepare('UPDATE schools SET name=?, slug=?, code=?, timezone=?, status=?, updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute(array($name, $slug, $code, $timezone, $status, $schoolId));
        policy_audit($me, $context, $method === 'DELETE' ? 'platform.school.archive' : 'school.update', 'school', (string) $schoolId, 'allow', '', array('name' => $name, 'slug' => $slug, 'status' => $status));
        j(array('id' => $schoolId, 'name' => $name, 'slug' => $slug, 'code' => $code, 'timezone' => $timezone, 'status' => $status));
    }

    if ($path === '/v2/system-roles' && ($method === 'GET' || $method === 'POST')) {
        if (!policy_system_capability($me, 'users.manage_admin')) jerr('Bạn không có quyền quản lý super_admin.', 403);
        if ($method === 'GET') {
            $rows = q_all("SELECT usr.`user_id`, u.`name`, u.`phone`, usr.`status`, usr.`granted_at`, usr.`revoked_at` FROM `user_system_roles` usr INNER JOIN `students` u ON u.`id`=usr.`user_id` WHERE usr.`role`='super_admin' ORDER BY usr.`status`, u.`name`");
            j(array('system_roles' => $rows));
        }
        $payload = body();
        $userId = (int) ($payload['user_id'] ?? 0);
        if (!q_one('SELECT id FROM students WHERE id=?', array($userId))) jerr('Không tìm thấy người dùng.', 404);
        db()->prepare("INSERT INTO user_system_roles (user_id,role,status,granted_by) VALUES (?,'super_admin','active',?) ON DUPLICATE KEY UPDATE status='active', revoked_at=NULL, granted_by=VALUES(granted_by), granted_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP")->execute(array($userId, (int) $me['id']));
        v2_sync_legacy_role($userId);
        policy_audit($me, array(), 'platform.system_role.grant', 'user', (string) $userId, 'allow', '', array('role' => 'super_admin'));
        j(array('user_id' => $userId, 'role' => 'super_admin', 'status' => 'active'));
    }

    if (preg_match('#^/v2/system-roles/([1-9][0-9]*)$#', $path, $match) && $method === 'DELETE') {
        if (!policy_system_capability($me, 'users.manage_admin')) jerr('Bạn không có quyền quản lý super_admin.', 403);
        $userId = (int) $match[1];
        if ($userId === (int) $me['id']) jerr('Không thể tự thu hồi quyền super_admin.', 409);
        $role = q_one("SELECT id FROM user_system_roles WHERE user_id=? AND role='super_admin' AND status='active' AND revoked_at IS NULL", array($userId));
        if (!$role) jerr('Không tìm thấy super_admin.', 404);
        $others = (int) q_one("SELECT COUNT(*) AS `total` FROM `user_system_roles` WHERE `role`='super_admin' AND `status`='active' AND `revoked_at` IS NULL AND `user_id`<>?", array($userId))['total'];
        if ($others < 1) jerr('Hệ thống phải có ít nhất một super_admin.', 409);
        db()->prepare("UPDATE user_system_roles SET status='revoked', revoked_at=NOW(), updated_at=CURRENT_TIMESTAMP WHERE id=?")->execute(array((int) $role['id']));
        v2_sync_legacy_role($userId);
        policy_audit($me, array(), 'platform.system_role.revoke', 'user', (string) $userId, 'allow', '', array('role' => 'super_admin'));
        j(array('ok' => true, 'user_id' => $userId, 'status' => 'revoked'));
    }

    if ($path === '/v2/break-glass' && ($method === 'GET' || $method === 'POST')) {
        if (!policy_system_capability($me, 'platform.manage')) jerr('Bạn không có quyền quản lý quyền truy cập khẩn cấp.', 403);
        if ($method === 'GET') {
            $rows = q_all("SELECT bg.`id`, bg.`user_id`, u.`name` AS `user_name`, bg.`school_id`, s.`name` AS `school_name`, bg.`reason`, bg.`granted_by`, bg.`granted_at`, bg.`expires_at`, bg.`revoked_at`, bg.`status` FROM `break_glass_grants` bg INNER JOIN `students` u ON u.`id`=bg.`user_id` INNER JOIN `schools` s ON s.`id`=bg.`school_id` ORDER BY bg.`granted_at` DESC LIMIT 100");
            j(array('grants' => $rows));
        }
        $payload = body();
        $userId = (int) ($payload['user_id'] ?? 0);
        $schoolId = (int) ($payload['school_id'] ?? 0);
        $reason = mb_substr(trim((string) ($payload['reason'] ?? '')), 0, 1000);
        $minutes = (int) ($payload['duration_minutes'] ?? 60);
        if (!in_array('super_admin', policy_system_roles($userId), true)) jerr('Chỉ cấp break-glass cho super_admin.', 422);
        if (!q_one("SELECT id FROM schools WHERE id=? AND status='active'", array($schoolId))) jerr('Trường không hoạt động.', 422);
        if (mb_strlen($reason) < 8) jerr('Lý do break-glass phải có ít nhất 8 ký tự.', 422);
        if ($minutes < 5 || $minutes > 1440) jerr('Thời hạn break-glass phải từ 5 đến 1440 phút.', 422);
        $expiresAt = date('Y-m-d H:i:s', time() + $minutes * 60);
        db()->prepare("INSERT INTO break_glass_grants (user_id,school_id,reason,granted_by,expires_at,status) VALUES (?,?,?,?,?,'active')")->execute(array($userId, $schoolId, $reason, (int) $me['id'], $expiresAt));
        $grantId = (int) db()->lastInsertId();
        $context = array('school_id' => $schoolId, 'role' => 'super_admin', 'break_glass_grant_id' => $grantId);
        policy_audit($me, $context, 'platform.break_glass.grant', 'user', (string) $userId, 'allow', $reason, array('school_id' => $schoolId, 'expires_at' => $expiresAt));
        j(array('id' => $grantId, 'user_id' => $userId, 'school_id' => $schoolId, 'reason' => $reason, 'expires_at' => $expiresAt, 'status' => 'active'));
    }

    if (preg_match('#^/v2/break-glass/([1-9][0-9]*)$#', $path, $match) && $method === 'DELETE') {
        if (!policy_system_capability($me, 'platform.manage')) jerr('Bạn không có quyền thu hồi quyền truy cập khẩn cấp.', 403);
        $grantId = (int) $match[1];
        $grant = q_one("SELECT * FROM break_glass_grants WHERE id=? AND status='active'", array($grantId));
        if (!$grant) jerr('Không tìm thấy quyền truy cập khẩn cấp.', 404);
        db()->prepare("UPDATE break_glass_grants SET status='revoked', revoked_at=NOW(), updated_at=CURRENT_TIMESTAMP WHERE id=?")->execute(array($grantId));
        $context = array('school_id' => (int) $grant['school_id'], 'role' => 'super_admin', 'break_glass_grant_id' => $grantId);
        policy_audit($me, $context, 'platform.break_glass.revoke', 'user', (string) $grant['user_id'], 'allow', (string) $grant['reason'], array('school_id' => (int) $grant['school_id']));
        j(array('ok' => true, 'id' => $grantId, 'status' => 'revoked'));
    }

    if (preg_match('#^/v2/schools/([1-9][0-9]*)/users$#', $path, $match)) {
        $context = policy_resolve_school($me, (int) $match[1]);
        if (!policy_capability($me, $context, 'school.manage')) jerr('Bạn không có quyền quản lý người dùng trong trường.', 403);
        if ($method === 'GET') {
            $rows = q_all(
                "SELECT u.`id`, u.`name`, u.`phone`, u.`active`, sm.`id` AS `membership_id`, sm.`role`, sm.`status`, sm.`joined_at`, sm.`left_at`, (SELECT COUNT(*) FROM `team_memberships` tm WHERE tm.`user_id` = u.`id` AND tm.`school_id` = sm.`school_id` AND tm.`access` = 'include' AND tm.`status` = 'active' AND tm.`left_at` IS NULL) AS `team_count` FROM `school_memberships` sm INNER JOIN `students` u ON u.`id` = sm.`user_id` WHERE sm.`school_id` = ? ORDER BY FIELD(sm.`role`, 'admin', 'teacher', 'student'), u.`name`",
                array((int) $context['school_id'])
            );
            $users = array();
            foreach ($rows as $row) {
                $users[] = array(
                    'id' => (int) $row['id'],
                    'name' => (string) $row['name'],
                    'phone' => (string) $row['phone'],
                    'active' => (bool) $row['active'],
                    'membership_id' => (int) $row['membership_id'],
                    'role' => (string) $row['role'],
                    'status' => (string) $row['status'],
                    'joined_at' => $row['joined_at'],
                    'left_at' => $row['left_at'],
                    'team_count' => (int) $row['team_count'],
                );
            }
            j(array('school_id' => (int) $context['school_id'], 'users' => $users));
        }
        if ($method === 'POST') {
            $payload = body();
            $name = mb_substr(trim((string) ($payload['name'] ?? '')), 0, 120);
            $phone = preg_replace('/[^0-9+]/', '', (string) ($payload['phone'] ?? ''));
            $role = (string) ($payload['role'] ?? 'student');
            if ($name === '') jerr('Thiếu tên người dùng.', 422);
            if (!preg_match('/^\+?[0-9]{8,20}$/', (string) $phone)) jerr('Số điện thoại không hợp lệ.', 422);
            if (!in_array($role, array('student', 'teacher', 'admin'), true)) jerr('Vai trò người dùng không hợp lệ.', 422);
            $existing = q_one('SELECT id, active FROM students WHERE phone=?', array($phone));
            $existingMembership = null;
            if ($existing && in_array('super_admin', policy_system_roles((int) $existing['id']), true)) jerr('Tài khoản super_admin phải được quản lý ở cấp hệ thống.', 409);
            if ($existing) {
                $existingMembership = q_one('SELECT id, status FROM school_memberships WHERE school_id=? AND user_id=?', array((int) $context['school_id'], (int) $existing['id']));
                if ($existingMembership && $existingMembership['status'] === 'active' && $existingMembership['left_at'] === null) jerr('Người dùng đã thuộc trường này.', 409);
            }
            $pdo = db();
            $pdo->beginTransaction();
            try {
                if ($existing) {
                    $userId = (int) $existing['id'];
                    $pdo->prepare('UPDATE students SET name=?, active=1 WHERE id=?')->execute(array($name, $userId));
                    if ($existingMembership) {
                        $pdo->prepare("UPDATE school_memberships SET role=?, status='active', joined_at=CURRENT_TIMESTAMP, left_at=NULL WHERE id=?")->execute(array($role, (int) $existingMembership['id']));
                    } else {
                        $pdo->prepare("INSERT INTO school_memberships (school_id,user_id,role,status,joined_at) VALUES (?,?,?,'active',CURRENT_TIMESTAMP)")->execute(array((int) $context['school_id'], $userId, $role));
                    }
                } else {
                    $pdo->prepare('INSERT INTO students (name,phone,role,active) VALUES (?,?,?,1)')->execute(array($name, $phone, $role));
                    $userId = (int) $pdo->lastInsertId();
                    $pdo->prepare("INSERT INTO school_memberships (school_id,user_id,role,status,joined_at) VALUES (?,?,?,'active',CURRENT_TIMESTAMP)")->execute(array((int) $context['school_id'], $userId, $role));
                }
                v2_sync_legacy_role($userId);
                policy_audit($me, $context, 'school.user.create', 'user', (string) $userId, 'allow', '', array('role' => $role, 'existing_user' => (bool) $existing));
                $pdo->commit();
            } catch (Throwable $exception) {
                if ($pdo->inTransaction()) $pdo->rollBack();
                throw $exception;
            }
            j(array('id' => $userId, 'name' => $name, 'phone' => $phone, 'role' => $role, 'existing_user' => (bool) $existing));
        }
    }

    if (preg_match('#^/v2/schools/([1-9][0-9]*)/users/([1-9][0-9]*)$#', $path, $match) && ($method === 'PUT' || $method === 'PATCH' || $method === 'DELETE')) {
        $context = policy_resolve_school($me, (int) $match[1]);
        if (!policy_capability($me, $context, 'school.manage')) jerr('Bạn không có quyền quản lý người dùng trong trường.', 403);
        $userId = (int) $match[2];
        $membership = q_one('SELECT * FROM school_memberships WHERE school_id=? AND user_id=?', array((int) $context['school_id'], $userId));
        if (!$membership) jerr('Không tìm thấy người dùng trong trường.', 404);
        if (in_array('super_admin', policy_system_roles($userId), true)) jerr('Không thể thay đổi super_admin trong phạm vi trường.', 409);
        $nextRole = (string) $membership['role'];
        $nextStatus = (string) $membership['status'];
        if ($method !== 'DELETE') {
            $payload = body();
            $nextRole = (string) ($payload['role'] ?? $nextRole);
            $nextStatus = (string) ($payload['status'] ?? $nextStatus);
            if (!in_array($nextRole, array('student', 'teacher', 'admin'), true)) jerr('Vai trò người dùng không hợp lệ.', 422);
            if (!in_array($nextStatus, array('active', 'inactive'), true)) jerr('Trạng thái người dùng không hợp lệ.', 422);
        } else {
            $nextStatus = 'inactive';
        }
        if ($userId === (int) $me['id'] && ($nextRole !== 'admin' || $nextStatus !== 'active')) jerr('Không thể tự khóa hoặc hạ quyền tài khoản đang đăng nhập.', 409);
        if ((string) $membership['role'] === 'admin' && $membership['status'] === 'active' && ($nextRole !== 'admin' || $nextStatus !== 'active')) {
            $otherAdmins = (int) q_one("SELECT COUNT(*) AS `total` FROM `school_memberships` WHERE school_id=? AND `role`='admin' AND `status`='active' AND `left_at` IS NULL AND `user_id`<>?", array((int) $context['school_id'], $userId))['total'];
            if ($otherAdmins < 1) jerr('Trường phải có ít nhất một quản trị hoạt động.', 409);
        }
        $pdo = db();
        $pdo->beginTransaction();
        try {
            $pdo->prepare('UPDATE school_memberships SET role=?, status=?, left_at=IF(?=\'inactive\',COALESCE(left_at,NOW()),left_at) WHERE id=?')->execute(array($nextRole, $nextStatus, $nextStatus, (int) $membership['id']));
            v2_sync_legacy_role($userId);
            policy_audit($me, $context, $method === 'DELETE' ? 'school.user.remove' : 'school.user.update', 'user', (string) $userId, 'allow', '', array('role' => $nextRole, 'status' => $nextStatus));
            $pdo->commit();
        } catch (Throwable $exception) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            throw $exception;
        }
        j(array('ok' => true, 'user_id' => $userId, 'role' => $nextRole, 'status' => $nextStatus));
    }

    if (preg_match('#^/v2/schools/([1-9][0-9]*)/years$#', $path, $match) && ($method === 'GET' || $method === 'POST')) {
        $context = policy_resolve_school($me, (int) $match[1]);
        if ($method === 'GET') {
            $rows = q_all("SELECT `id`, `name`, `start_date`, `end_date`, `is_current`, `status` FROM `school_years` WHERE `school_id`=? ORDER BY `is_current` DESC, `name` DESC", array((int) $context['school_id']));
            j(array('school_id' => (int) $context['school_id'], 'years' => $rows));
        }
        if (!policy_capability($me, $context, 'school.manage')) jerr('Bạn không có quyền quản lý năm học.', 403);
        $payload = body();
        $name = mb_substr(trim((string) ($payload['name'] ?? '')), 0, 50);
        $startDate = (string) ($payload['start_date'] ?? '');
        $endDate = (string) ($payload['end_date'] ?? '');
        if ($name === '') jerr('Thiếu tên năm học.', 422);
        if ($startDate !== '' && !preg_match('/^\d{4}-\d{2}-\d{2}$/', $startDate)) jerr('Ngày bắt đầu không hợp lệ.', 422);
        if ($endDate !== '' && !preg_match('/^\d{4}-\d{2}-\d{2}$/', $endDate)) jerr('Ngày kết thúc không hợp lệ.', 422);
        $isCurrent = !empty($payload['is_current']) ? 1 : 0;
        $pdo = db();
        $pdo->beginTransaction();
        try {
            if ($isCurrent) $pdo->prepare('UPDATE school_years SET is_current=0 WHERE school_id=?')->execute(array((int) $context['school_id']));
            $pdo->prepare("INSERT INTO school_years (name,start_date,end_date,is_current,school_id,status) VALUES (?,?,?,?,?,'active')")->execute(array($name, $startDate, $endDate, $isCurrent, (int) $context['school_id']));
            $yearId = (int) $pdo->lastInsertId();
            policy_audit($me, $context, 'school.year.create', 'school_year', (string) $yearId, 'allow', '', array('name' => $name, 'is_current' => (bool) $isCurrent));
            $pdo->commit();
        } catch (Throwable $exception) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            throw $exception;
        }
        j(array('id' => $yearId, 'name' => $name, 'start_date' => $startDate, 'end_date' => $endDate, 'is_current' => (bool) $isCurrent, 'status' => 'active'));
    }

    if (preg_match('#^/v2/schools/([1-9][0-9]*)/years/([1-9][0-9]*)$#', $path, $match) && ($method === 'PUT' || $method === 'PATCH' || $method === 'DELETE')) {
        $context = policy_resolve_school($me, (int) $match[1]);
        if (!policy_capability($me, $context, 'school.manage')) jerr('Bạn không có quyền quản lý năm học.', 403);
        $yearId = (int) $match[2];
        $year = q_one("SELECT * FROM `school_years` WHERE `id`=? AND `school_id`=? AND `status`='active'", array($yearId, (int) $context['school_id']));
        if (!$year) jerr('Không tìm thấy năm học.', 404);
        $name = (string) $year['name'];
        $startDate = (string) ($year['start_date'] ?? '');
        $endDate = (string) ($year['end_date'] ?? '');
        $isCurrent = (int) $year['is_current'];
        $status = 'active';
        if ($method !== 'DELETE') {
            $payload = body();
            $name = mb_substr(trim((string) ($payload['name'] ?? $name)), 0, 50);
            $startDate = (string) ($payload['start_date'] ?? $startDate);
            $endDate = (string) ($payload['end_date'] ?? $endDate);
            $isCurrent = array_key_exists('is_current', $payload) ? (!empty($payload['is_current']) ? 1 : 0) : $isCurrent;
            $status = (string) ($payload['status'] ?? 'active');
            if ($name === '') jerr('Thiếu tên năm học.', 422);
            if ($startDate !== '' && !preg_match('/^\d{4}-\d{2}-\d{2}$/', $startDate)) jerr('Ngày bắt đầu không hợp lệ.', 422);
            if ($endDate !== '' && !preg_match('/^\d{4}-\d{2}-\d{2}$/', $endDate)) jerr('Ngày kết thúc không hợp lệ.', 422);
            if (!in_array($status, array('active', 'archived'), true)) jerr('Trạng thái năm học không hợp lệ.', 422);
        } else {
            $isCurrent = 0;
            $status = 'archived';
        }
        $pdo = db();
        $pdo->beginTransaction();
        try {
            if ($isCurrent) $pdo->prepare('UPDATE school_years SET is_current=0 WHERE school_id=? AND id<>?')->execute(array((int) $context['school_id'], $yearId));
            $pdo->prepare('UPDATE school_years SET name=?, start_date=?, end_date=?, is_current=?, status=? WHERE id=? AND school_id=?')->execute(array($name, $startDate, $endDate, $isCurrent, $status, $yearId, (int) $context['school_id']));
            policy_audit($me, $context, $method === 'DELETE' ? 'school.year.archive' : 'school.year.update', 'school_year', (string) $yearId, 'allow', '', array('name' => $name, 'status' => $status, 'is_current' => (bool) $isCurrent));
            $pdo->commit();
        } catch (Throwable $exception) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            throw $exception;
        }
        j(array('id' => $yearId, 'name' => $name, 'start_date' => $startDate, 'end_date' => $endDate, 'is_current' => (bool) $isCurrent, 'status' => $status));
    }

    if (preg_match('#^/v2/schools/([1-9][0-9]*)/grades$#', $path, $match) && ($method === 'GET' || $method === 'POST')) {
        $context = policy_resolve_school($me, (int) $match[1]);
        if ($method === 'GET') {
            $rows = q_all("SELECT `id`, `school_year_id`, `name`, `code`, `status` FROM `grades` WHERE `school_id`=? ORDER BY `school_year_id`, `name`", array((int) $context['school_id']));
            j(array('school_id' => (int) $context['school_id'], 'grades' => $rows));
        }
        if (!policy_capability($me, $context, 'school.manage')) jerr('Bạn không có quyền quản lý khối.', 403);
        $payload = body();
        $yearId = (int) ($payload['school_year_id'] ?? 0);
        $name = mb_substr(trim((string) ($payload['name'] ?? '')), 0, 80);
        $code = mb_substr(trim((string) ($payload['code'] ?? '')), 0, 20);
        if ($name === '') jerr('Thiếu tên khối.', 422);
        if ($yearId < 1 || !q_one('SELECT id FROM school_years WHERE id=? AND school_id=? AND status=\'active\'', array($yearId, (int) $context['school_id']))) jerr('Năm học không thuộc trường.', 422);
        db()->prepare("INSERT INTO grades (school_year_id,name,code,school_id,status) VALUES (?,?,?,?,'active')")->execute(array($yearId, $name, $code, (int) $context['school_id']));
        $gradeId = (int) db()->lastInsertId();
        policy_audit($me, $context, 'school.grade.create', 'grade', (string) $gradeId, 'allow', '', array('name' => $name, 'school_year_id' => $yearId));
        j(array('id' => $gradeId, 'school_year_id' => $yearId, 'name' => $name, 'code' => $code, 'status' => 'active'));
    }

    if (preg_match('#^/v2/schools/([1-9][0-9]*)/grades/([1-9][0-9]*)$#', $path, $match) && ($method === 'PUT' || $method === 'PATCH' || $method === 'DELETE')) {
        $context = policy_resolve_school($me, (int) $match[1]);
        if (!policy_capability($me, $context, 'school.manage')) jerr('Bạn không có quyền quản lý khối.', 403);
        $gradeId = (int) $match[2];
        $grade = q_one("SELECT * FROM `grades` WHERE `id`=? AND `school_id`=? AND `status`='active'", array($gradeId, (int) $context['school_id']));
        if (!$grade) jerr('Không tìm thấy khối.', 404);
        $name = (string) $grade['name'];
        $code = (string) ($grade['code'] ?? '');
        $yearId = (int) $grade['school_year_id'];
        $status = 'active';
        if ($method !== 'DELETE') {
            $payload = body();
            $name = mb_substr(trim((string) ($payload['name'] ?? $name)), 0, 80);
            $code = mb_substr(trim((string) ($payload['code'] ?? $code)), 0, 20);
            $yearId = (int) ($payload['school_year_id'] ?? $yearId);
            $status = (string) ($payload['status'] ?? 'active');
            if ($name === '') jerr('Thiếu tên khối.', 422);
            if (!in_array($status, array('active', 'archived'), true)) jerr('Trạng thái khối không hợp lệ.', 422);
        } else {
            if ((int) q_one('SELECT COUNT(*) AS `total` FROM `teams` WHERE `grade_id`=? AND `status`=\'active\'', array($gradeId))['total'] > 0) jerr('Khối vẫn đang có đội hoạt động.', 409);
            $status = 'archived';
        }
        if ($yearId < 1 || !q_one('SELECT id FROM school_years WHERE id=? AND school_id=?', array($yearId, (int) $context['school_id']))) jerr('Năm học không thuộc trường.', 422);
        db()->prepare('UPDATE grades SET school_year_id=?, name=?, code=?, status=? WHERE id=? AND school_id=?')->execute(array($yearId, $name, $code, $status, $gradeId, (int) $context['school_id']));
        policy_audit($me, $context, $method === 'DELETE' ? 'school.grade.archive' : 'school.grade.update', 'grade', (string) $gradeId, 'allow', '', array('name' => $name, 'status' => $status));
        j(array('id' => $gradeId, 'school_year_id' => $yearId, 'name' => $name, 'code' => $code, 'status' => $status));
    }

    if (preg_match('#^/v2/schools/([1-9][0-9]*)/classes$#', $path, $match)) {
        $context = policy_resolve_school($me, (int) $match[1]);
        if ($method === 'GET') {
            $rows = q_all(
                'SELECT c.`id`, c.`slug`, c.`name`, c.`school_year_id`, c.`grade_id`, c.`status`, c.`created_at`, COUNT(ctl.`id`) AS `team_count`, GROUP_CONCAT(ctl.`team_id` ORDER BY ctl.`team_id` SEPARATOR \',\') AS `linked_team_ids` FROM `classes` c LEFT JOIN `class_team_links` ctl ON ctl.`class_id` = c.`id` AND ctl.`status` = \'active\' WHERE c.`school_id` = ? AND c.`status` = \'active\' GROUP BY c.`id` ORDER BY c.`name`',
                array((int) $context['school_id'])
            );
            $classes = array();
            foreach ($rows as $row) {
                $classes[] = array(
                    'id' => (int) $row['id'],
                    'slug' => (string) $row['slug'],
                    'name' => (string) $row['name'],
                    'school_year_id' => (int) $row['school_year_id'],
                    'grade_id' => (int) $row['grade_id'],
                    'team_count' => (int) $row['team_count'],
                    'linked_team_ids' => $row['linked_team_ids'] === null || $row['linked_team_ids'] === '' ? array() : array_map('intval', explode(',', $row['linked_team_ids'])),
                    'created_at' => $row['created_at'],
                );
            }
            j(array('school_id' => $context['school_id'], 'role' => $context['role'], 'classes' => $classes));
        }
        if ($method === 'POST') {
            if (!policy_capability($me, $context, 'classes.manage')) jerr('Bạn không có quyền tạo lớp.', 403);
            $payload = body();
            $name = mb_substr(trim((string) ($payload['name'] ?? '')), 0, 120);
            if ($name === '') jerr('Thiếu tên lớp.', 422);
            $yearId = (int) ($payload['school_year_id'] ?? 0);
            $gradeId = (int) ($payload['grade_id'] ?? 0);
            $year = $yearId > 0 ? q_one("SELECT id FROM school_years WHERE id=? AND school_id=? AND status='active'", array($yearId, (int) $context['school_id'])) : null;
            $grade = $gradeId > 0 ? q_one("SELECT id FROM grades WHERE id=? AND school_id=? AND school_year_id=? AND status='active'", array($gradeId, (int) $context['school_id'], $yearId)) : null;
            if ($yearId < 1 || !$year) jerr('Năm học không thuộc trường.', 422);
            if ($gradeId < 1 || !$grade) jerr('Khối không thuộc năm học.', 422);
            $slug = v2_unique_slug('classes', (int) $context['school_id'], $name, 'lop');
            $joinCode = strtoupper('CLS' . bin2hex(random_bytes(6)));
            db()->prepare('INSERT INTO classes (name, join_code, school_id, school_year_id, grade_id, slug, status) VALUES (?,?,?,?,?,?,\'active\')')
                ->execute(array($name, $joinCode, (int) $context['school_id'], $yearId > 0 ? $yearId : null, $gradeId > 0 ? $gradeId : null, $slug));
            $classId = (int) db()->lastInsertId();
            policy_audit($me, $context, 'school.class.create', 'class', (string) $classId, 'allow', '', array('name' => $name));
            j(array('id' => $classId, 'slug' => $slug, 'name' => $name, 'join_code' => $joinCode));
        }
    }

    if (preg_match('#^/v2/schools/([1-9][0-9]*)/classes/([1-9][0-9]*)$#', $path, $match) && ($method === 'PUT' || $method === 'PATCH' || $method === 'DELETE')) {
        $context = policy_resolve_school($me, (int) $match[1]);
        if (!policy_capability($me, $context, 'classes.manage')) jerr('Bạn không có quyền cập nhật lớp.', 403);
        $classId = (int) $match[2];
        $class = q_one("SELECT * FROM `classes` WHERE `id`=? AND `school_id`=? AND `status`='active'", array($classId, (int) $context['school_id']));
        if (!$class) jerr('Không tìm thấy lớp.', 404);
        $slug = (string) $class['slug'];
        $name = (string) $class['name'];
        $yearId = (int) $class['school_year_id'];
        $gradeId = (int) $class['grade_id'];
        $status = 'active';
        if ($method !== 'DELETE') {
            $payload = body();
            $name = mb_substr(trim((string) ($payload['name'] ?? $name)), 0, 120);
            $yearId = (int) ($payload['school_year_id'] ?? $yearId);
            $gradeId = (int) ($payload['grade_id'] ?? $gradeId);
            $status = (string) ($payload['status'] ?? 'active');
            if ($name === '') jerr('Thiếu tên lớp.', 422);
            if (!in_array($status, array('active', 'archived'), true)) jerr('Trạng thái lớp không hợp lệ.', 422);
            if ($yearId > 0 && !q_one("SELECT id FROM school_years WHERE id=? AND school_id=? AND status='active'", array($yearId, (int) $context['school_id']))) jerr('Năm học không thuộc trường.', 422);
            if ($gradeId > 0 && !q_one("SELECT id FROM grades WHERE id=? AND school_id=? AND school_year_id=? AND status='active'", array($gradeId, (int) $context['school_id'], $yearId))) jerr('Khối không thuộc năm học.', 422);
        } else {
            $status = 'archived';
        }
        $teamIds = array_column(q_all("SELECT team_id FROM class_team_links WHERE class_id=? AND status='active'", array($classId)), 'team_id');
        $slug = v2_unique_slug('classes', (int) $context['school_id'], $name, 'lop', $classId);
        $pdo = db();
        $pdo->beginTransaction();
        try {
            $pdo->prepare('UPDATE classes SET name=?, slug=?, school_year_id=?, grade_id=?, status=?, updated_at=CURRENT_TIMESTAMP WHERE id=? AND school_id=?')->execute(array($name, $slug, $yearId > 0 ? $yearId : null, $gradeId > 0 ? $gradeId : null, $status, $classId, (int) $context['school_id']));
            if ($status === 'archived') {
                $pdo->prepare("UPDATE class_team_links SET status='inactive' WHERE class_id=? AND status='active'")->execute(array($classId));
            }
            policy_audit($me, $context, $method === 'DELETE' ? 'school.class.archive' : 'school.class.update', 'class', (string) $classId, 'allow', '', array('name' => $name, 'status' => $status));
            $pdo->commit();
        } catch (Throwable $exception) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            throw $exception;
        }
        foreach ($teamIds as $teamId) v2_reconcile_class_team_students((int) $teamId);
        j(array('ok' => true, 'id' => $classId, 'name' => $name, 'slug' => $slug, 'status' => $status));
    }

    if (preg_match('#^/v2/schools/([1-9][0-9]*)/classes/([1-9][0-9]*)/members$#', $path, $match) && ($method === 'GET' || $method === 'POST')) {
        $context = policy_resolve_school($me, (int) $match[1]);
        $classId = (int) $match[2];
        $class = q_one("SELECT `id`, `name` FROM `classes` WHERE `id`=? AND `school_id`=? AND `status`='active'", array($classId, (int) $context['school_id']));
        if (!$class) jerr('Không tìm thấy lớp.', 404);
        if ($method === 'GET') {
            $rows = q_all("SELECT u.`id`, u.`name`, cm.`joined_at` FROM `class_members` cm INNER JOIN `students` u ON u.`id`=cm.`user_id` WHERE cm.`class_id`=? AND cm.`school_id`=? ORDER BY u.`name`", array($classId, (int) $context['school_id']));
            $members = array();
            foreach ($rows as $row) $members[] = array('user_id' => (int) $row['id'], 'name' => (string) $row['name'], 'joined_at' => $row['joined_at']);
            j(array('class' => $class, 'members' => $members));
        }
        if (!policy_capability($me, $context, 'classes.manage')) jerr('Bạn không có quyền quản lý lớp.', 403);
        $payload = body();
        $userId = (int) ($payload['user_id'] ?? 0);
        $membership = q_one("SELECT `role` FROM `school_memberships` WHERE `school_id`=? AND `user_id`=? AND `status`='active' AND `left_at` IS NULL", array((int) $context['school_id'], $userId));
        if (!$membership || (string) $membership['role'] !== 'student') jerr('Học sinh không thuộc trường.', 422);
        db()->prepare('INSERT INTO class_members (class_id,user_id,school_id,joined_at) VALUES (?,?,?,CURRENT_TIMESTAMP) ON DUPLICATE KEY UPDATE school_id=VALUES(school_id), joined_at=VALUES(joined_at)')->execute(array($classId, $userId, (int) $context['school_id']));
        $teamIds = array_column(q_all("SELECT team_id FROM class_team_links WHERE class_id=? AND status='active'", array($classId)), 'team_id');
        foreach ($teamIds as $teamId) v2_reconcile_class_team_students((int) $teamId);
        policy_audit($me, $context, 'school.class.member.add', 'class', (string) $classId, 'allow', '', array('user_id' => $userId));
        j(array('ok' => true, 'class_id' => $classId, 'user_id' => $userId));
    }

    if (preg_match('#^/v2/schools/([1-9][0-9]*)/classes/([1-9][0-9]*)/members/([1-9][0-9]*)$#', $path, $match) && $method === 'DELETE') {
        $context = policy_resolve_school($me, (int) $match[1]);
        if (!policy_capability($me, $context, 'classes.manage')) jerr('Bạn không có quyền quản lý lớp.', 403);
        $classId = (int) $match[2];
        $userId = (int) $match[3];
        if (!q_one("SELECT id FROM classes WHERE id=? AND school_id=? AND status='active'", array($classId, (int) $context['school_id']))) jerr('Không tìm thấy lớp.', 404);
        $teamIds = array_column(q_all("SELECT team_id FROM class_team_links WHERE class_id=? AND status='active'", array($classId)), 'team_id');
        db()->prepare('DELETE FROM class_members WHERE class_id=? AND user_id=? AND school_id=?')->execute(array($classId, $userId, (int) $context['school_id']));
        foreach ($teamIds as $teamId) v2_reconcile_class_team_students((int) $teamId);
        policy_audit($me, $context, 'school.class.member.remove', 'class', (string) $classId, 'allow', '', array('user_id' => $userId));
        j(array('ok' => true, 'class_id' => $classId, 'user_id' => $userId));
    }

    if (preg_match('#^/v2/schools/([1-9][0-9]*)/subjects/([^/]+)/teams/([1-9][0-9]*)/classes/([1-9][0-9]*)$#', $path, $match)) {
        $context = policy_resolve_team($me, (int) $match[1], urldecode($match[2]), (int) $match[3]);
        $classId = (int) $match[4];
        $class = q_one('SELECT id, name FROM classes WHERE id=? AND school_id=? AND status=\'active\'', array($classId, (int) $context['school_id']));
        if (!$class) jerr('Không tìm thấy lớp.', 404);
        if ($method === 'GET') {
            $link = q_one('SELECT id, status, created_at FROM class_team_links WHERE class_id=? AND team_id=?', array($classId, (int) $context['team_id']));
            j(array('class' => $class, 'link' => $link));
        }
        if ($method === 'POST') {
            if (!policy_capability($me, $context, 'class_team.manage')) jerr('Bạn không có quyền liên kết lớp.', 403);
            db()->prepare("INSERT INTO class_team_links (class_id,team_id,school_id,status) VALUES (?,?,?,'active') ON DUPLICATE KEY UPDATE school_id=VALUES(school_id), status='active'")
                ->execute(array($classId, (int) $context['team_id'], (int) $context['school_id']));
            v2_reconcile_class_team_students((int) $context['team_id']);
            policy_audit($me, $context, 'class.team.link', 'class', (string) $classId, 'allow', '', array('team_id' => (int) $context['team_id']));
            j(array('ok' => true, 'class_id' => $classId, 'team_id' => (int) $context['team_id']));
        }
        if ($method === 'DELETE') {
            if (!policy_capability($me, $context, 'class_team.manage')) jerr('Bạn không có quyền bỏ liên kết lớp.', 403);
            db()->prepare('DELETE FROM class_team_links WHERE class_id=? AND team_id=?')->execute(array($classId, (int) $context['team_id']));
            v2_reconcile_class_team_students((int) $context['team_id']);
            policy_audit($me, $context, 'class.team.unlink', 'class', (string) $classId, 'allow', '', array('team_id' => (int) $context['team_id']));
            j(array('ok' => true));
        }
    }

    if ($method === 'GET' && preg_match('#^/v2/schools/([1-9][0-9]*)/subjects/([^/]+)/teams/([1-9][0-9]*)/members$#', $path, $match)) {
        $context = policy_resolve_team($me, (int) $match[1], urldecode($match[2]), (int) $match[3]);
        $rows = q_all(
            "SELECT tm.`user_id`, tm.`role`, tm.`access`, tm.`status`, tm.`source`, tm.`source_class_id`, tm.`joined_at`, tm.`left_at`, u.`name` FROM `team_memberships` tm INNER JOIN `students` u ON u.`id` = tm.`user_id` WHERE tm.`team_id` = ? AND tm.`school_id` = ? ORDER BY FIELD(tm.`role`, 'coach', 'student'), u.`name`",
            array((int) $context['team_id'], (int) $context['school_id'])
        );
        $members = array();
        foreach ($rows as $row) {
            $members[] = array(
                'user_id' => (int) $row['user_id'],
                'name' => (string) $row['name'],
                'role' => (string) $row['role'],
                'access' => (string) $row['access'],
                'status' => (string) $row['status'],
                'source' => (string) $row['source'],
                'source_class_id' => $row['source_class_id'] === null ? null : (int) $row['source_class_id'],
                'joined_at' => $row['joined_at'],
                'left_at' => $row['left_at'],
            );
        }
        j(array('team_id' => (int) $context['team_id'], 'members' => $members));
    }

    if (preg_match('#^/v2/schools/([1-9][0-9]*)/subjects/([^/]+)/teams/([1-9][0-9]*)/members/([1-9][0-9]*)$#', $path, $match) && $method === 'PUT') {
        $context = policy_resolve_team($me, (int) $match[1], urldecode($match[2]), (int) $match[3]);
        if (!policy_capability($me, $context, 'team.membership.override')) jerr('Bạn không có quyền override membership.', 403);
        $userId = (int) $match[4];
        $payload = body();
        $access = (string) ($payload['access'] ?? 'include');
        $role = (string) ($payload['role'] ?? 'student');
        if (!in_array($access, array('include', 'exclude'), true) || !in_array($role, array('student', 'coach'), true)) jerr('Membership không hợp lệ.', 422);
        $membership = q_one("SELECT role FROM school_memberships WHERE school_id=? AND user_id=? AND status='active' AND left_at IS NULL", array((int) $context['school_id'], $userId));
        if (!$membership) jerr('Người dùng không thuộc trường.', 422);
        if ($role === 'coach' && !in_array((string) $membership['role'], array('teacher', 'admin'), true)) jerr('Coach phải là giáo viên hoặc quản trị.', 422);
        $included = $access === 'include';
        $otherRole = $role === 'coach' ? 'student' : 'coach';
        remove_team_membership_target((int) $context['team_id'], $userId, $otherRole, 'manual');
        db()->prepare("UPDATE team_members SET left_at=NOW() WHERE team_id=? AND user_id=? AND member_role=? AND (left_at IS NULL OR left_at='')")->execute(array((int) $context['team_id'], $userId, $otherRole));
        sync_team_membership_target((int) $context['team_id'], $userId, $role, true, 'manual', $access, null);
        if ($included) {
            db()->prepare("UPDATE team_members SET left_at=NULL WHERE team_id=? AND user_id=? AND member_role=?")->execute(array((int) $context['team_id'], $userId, $role));
            db()->prepare("INSERT IGNORE INTO team_members (team_id,user_id,member_role,joined_at) VALUES (?,?,?,NOW())")->execute(array((int) $context['team_id'], $userId, $role));
        } else {
            db()->prepare("UPDATE team_members SET left_at=NOW() WHERE team_id=? AND user_id=? AND member_role=? AND (left_at IS NULL OR left_at='')")->execute(array((int) $context['team_id'], $userId, $role));
        }
        policy_audit($me, $context, 'team.membership.override', 'user', (string) $userId, 'allow', '', array('role' => $role, 'access' => $access));
        j(array('ok' => true, 'user_id' => $userId, 'role' => $role, 'access' => $access));
    }

    if (preg_match('#^/v2/schools/([1-9][0-9]*)/subjects$#', $path, $match) && ($method === 'GET' || $method === 'POST')) {
        $context = policy_resolve_school($me, (int) $match[1]);
        if ($method === 'POST' && !policy_capability($me, $context, 'content.publish_school')) jerr('Bạn không có quyền tạo môn học.', 403);
        if ($method === 'POST') {
            $payload = body();
            $name = mb_substr(trim((string) ($payload['name'] ?? '')), 0, 200);
            $code = mb_substr(trim((string) ($payload['code'] ?? '')), 0, 32);
            if ($name === '') jerr('Thiếu tên môn học.', 422);
            $slug = v2_unique_slug('subjects', (int) $context['school_id'], $name, 'mon');
            $subjectId = substr($slug, 0, 48) . '-' . bin2hex(random_bytes(4));
            db()->prepare("INSERT INTO subjects (id,name,code,school_id,slug,status) VALUES (?,?,?,?,?,'active')")->execute(array($subjectId, $name, $code, (int) $context['school_id'], $slug));
            policy_audit($me, $context, 'school.subject.create', 'subject', $subjectId, 'allow', '', array('name' => $name, 'code' => $code));
            j(array('id' => $subjectId, 'name' => $name, 'code' => $code, 'slug' => $slug, 'status' => 'active'));
        }
        $teams = v2_school_teams($me, $context['school_id'], $context['role']);
        $subjects = array();
        if ($context['role'] === 'admin' || $context['role'] === 'super_admin') {
            $rows = q_all("SELECT `id`, `name`, `code`, `slug` FROM `subjects` WHERE `school_id` = ? AND `status` = 'active' ORDER BY `name`", array((int) $context['school_id']));
            foreach ($rows as $row) $subjects[(string) $row['id']] = array('id' => (string) $row['id'], 'name' => (string) $row['name'], 'code' => (string) ($row['code'] ?? ''), 'slug' => (string) $row['slug']);
        } else {
            foreach ($teams as $team) {
                if (isset($subjects[$team['subject_id']])) continue;
                $subjects[$team['subject_id']] = array('id' => $team['subject_id'], 'name' => $team['subject_name'], 'code' => '', 'slug' => '');
            }
        }
        j(array('school_id' => $context['school_id'], 'role' => $context['role'], 'subjects' => array_values($subjects)));
    }

    if (preg_match('#^/v2/schools/([1-9][0-9]*)/subjects/([^/]+)$#', $path, $match) && ($method === 'PUT' || $method === 'PATCH' || $method === 'DELETE')) {
        $context = policy_resolve_school($me, (int) $match[1]);
        if (!policy_capability($me, $context, 'content.publish_school')) jerr('Bạn không có quyền cập nhật môn học.', 403);
        $subjectId = urldecode((string) $match[2]);
        $subject = q_one("SELECT * FROM `subjects` WHERE `id`=? AND `school_id`=? AND `status`='active'", array($subjectId, (int) $context['school_id']));
        if (!$subject) jerr('Không tìm thấy môn học.', 404);
        $name = (string) $subject['name'];
        $slug = (string) $subject['slug'];
        $code = (string) ($subject['code'] ?? '');
        $status = 'active';
        if ($method !== 'DELETE') {
            $payload = body();
            $name = mb_substr(trim((string) ($payload['name'] ?? $name)), 0, 200);
            $code = mb_substr(trim((string) ($payload['code'] ?? $code)), 0, 32);
            $status = (string) ($payload['status'] ?? 'active');
            if ($name === '') jerr('Thiếu tên môn học.', 422);
            if (!in_array($status, array('active', 'archived'), true)) jerr('Trạng thái môn học không hợp lệ.', 422);
        } else {
            if ((int) q_one("SELECT COUNT(*) AS `total` FROM `teams` WHERE `subject_id`=? AND `status`='active'", array($subjectId))['total'] > 0) jerr('Môn học vẫn đang có đội hoạt động.', 409);
            $status = 'archived';
        }
        $slug = v2_unique_slug('subjects', (int) $context['school_id'], $name, 'mon', $subjectId);
        db()->prepare('UPDATE subjects SET name=?, slug=?, code=?, status=?, updated_at=CURRENT_TIMESTAMP WHERE id=? AND school_id=?')->execute(array($name, $slug, $code, $status, $subjectId, (int) $context['school_id']));
        policy_audit($me, $context, $method === 'DELETE' ? 'school.subject.archive' : 'school.subject.update', 'subject', $subjectId, 'allow', '', array('name' => $name, 'status' => $status));
        j(array('id' => $subjectId, 'name' => $name, 'slug' => $slug, 'code' => $code, 'status' => $status));
    }

    if ($method === 'GET' && preg_match('#^/v2/schools/([1-9][0-9]*)/teams$#', $path, $match)) {
        $context = policy_resolve_school($me, (int) $match[1]);
        $teams = v2_school_teams($me, $context['school_id'], $context['role']);
        if ($context['role'] === 'admin' || $context['role'] === 'super_admin') {
            $rows = q_all("SELECT t.`id`, t.`school_year_id`, t.`grade_id`, y.`name` AS `year_name`, g.`name` AS `grade_name` FROM `teams` t LEFT JOIN `school_years` y ON y.`id`=t.`school_year_id` AND y.`school_id`=t.`school_id` LEFT JOIN `grades` g ON g.`id`=t.`grade_id` AND g.`school_id`=t.`school_id` WHERE t.`school_id`=? AND t.`status`='active'", array((int) $context['school_id']));
            $meta = array();
            foreach ($rows as $row) $meta[(int) $row['id']] = $row;
            foreach ($teams as &$team) {
                $row = $meta[(int) $team['id']] ?? array();
                $team['school_year_id'] = (int) ($row['school_year_id'] ?? 0);
                $team['grade_id'] = (int) ($row['grade_id'] ?? 0);
                $team['year_name'] = (string) ($row['year_name'] ?? '');
                $team['grade_name'] = (string) ($row['grade_name'] ?? '');
            }
            unset($team);
        }
        j(array('school_id' => (int) $context['school_id'], 'role' => $context['role'], 'teams' => $teams));
    }

    if (preg_match('#^/v2/schools/([1-9][0-9]*)/subjects/([^/]+)/teams$#', $path, $match) && ($method === 'GET' || $method === 'POST')) {
        $context = policy_resolve_school($me, (int) $match[1]);
        $subjectId = urldecode((string) $match[2]);
        if ($method === 'GET') {
            $teams = array_values(array_filter(v2_school_teams($me, $context['school_id'], $context['role']), function ($team) use ($subjectId) {
                return (string) $team['subject_id'] === $subjectId;
            }));
            j(array('school_id' => $context['school_id'], 'subject_id' => $subjectId, 'role' => $context['role'], 'teams' => $teams));
        }
        if (!policy_capability($me, $context, 'school.manage')) jerr('Bạn không có quyền tạo đội.', 403);
        $subject = q_one("SELECT `id` FROM `subjects` WHERE `id`=? AND `school_id`=? AND `status`='active'", array($subjectId, (int) $context['school_id']));
        if (!$subject) jerr('Môn học không thuộc trường.', 422);
        $payload = body();
        $name = mb_substr(trim((string) ($payload['name'] ?? '')), 0, 120);
        $description = mb_substr(trim((string) ($payload['description'] ?? '')), 0, 500);
        $yearId = (int) ($payload['school_year_id'] ?? 0);
        $gradeId = (int) ($payload['grade_id'] ?? 0);
        if ($name === '') jerr('Thiếu tên đội.', 422);
        if ($yearId < 1 || !q_one("SELECT id FROM school_years WHERE id=? AND school_id=? AND status='active'", array($yearId, (int) $context['school_id']))) jerr('Năm học không thuộc trường.', 422);
        if ($gradeId < 1 || !q_one("SELECT id FROM grades WHERE id=? AND school_id=? AND school_year_id=? AND status='active'", array($gradeId, (int) $context['school_id'], $yearId))) jerr('Khối không thuộc năm học.', 422);
        $slug = v2_unique_slug('teams', (int) $context['school_id'], $name, 'doi');
        $joinCode = strtoupper('TEAM' . bin2hex(random_bytes(6)));
        $pdo = db();
        $pdo->beginTransaction();
        try {
            $pdo->prepare("INSERT INTO teams (school_id,school_year_id,grade_id,subject_id,name,description,join_code,slug,status) VALUES (?,?,?,?,?,?,?,?,'active')")->execute(array((int) $context['school_id'], $yearId, $gradeId, $subjectId, $name, $description, $joinCode, $slug));
            $teamId = (int) $pdo->lastInsertId();
            $pdo->prepare('INSERT INTO team_modules (team_id,module_id,enabled,position,enabled_at,disabled_at,configured_by) SELECT ?,sm.module_id,sm.default_enabled,sm.position,IF(sm.default_enabled=1,CURRENT_TIMESTAMP,NULL),IF(sm.default_enabled=0,CURRENT_TIMESTAMP,NULL),? FROM school_modules sm WHERE sm.school_id=? AND sm.available=1')->execute(array($teamId, (int) $me['id'], (int) $context['school_id']));
            policy_audit($me, $context, 'school.team.create', 'team', (string) $teamId, 'allow', '', array('subject_id' => $subjectId, 'school_year_id' => $yearId, 'grade_id' => $gradeId));
            $pdo->commit();
        } catch (Throwable $exception) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            throw $exception;
        }
        j(array('id' => $teamId, 'slug' => $slug, 'name' => $name, 'join_code' => $joinCode, 'subject_id' => $subjectId, 'school_year_id' => $yearId, 'grade_id' => $gradeId));
    }

    if (preg_match('#^/v2/schools/([1-9][0-9]*)/subjects/([^/]+)/teams/([1-9][0-9]*)$#', $path, $match) && ($method === 'PUT' || $method === 'PATCH' || $method === 'DELETE')) {
        $context = policy_resolve_team($me, (int) $match[1], urldecode($match[2]), (int) $match[3]);
        if (!policy_capability($me, $context, 'school.manage')) jerr('Bạn không có quyền cập nhật đội.', 403);
        $teamId = (int) $context['team_id'];
        $name = (string) $context['team']['name'];
        $slug = (string) $context['team']['slug'];
        $description = (string) ($context['team']['description'] ?? '');
        $status = 'active';
        if ($method !== 'DELETE') {
            $payload = body();
            $name = mb_substr(trim((string) ($payload['name'] ?? $name)), 0, 120);
            $description = mb_substr(trim((string) ($payload['description'] ?? $description)), 0, 500);
            $status = (string) ($payload['status'] ?? 'active');
            if ($name === '') jerr('Thiếu tên đội.', 422);
            if (!in_array($status, array('active', 'archived'), true)) jerr('Trạng thái đội không hợp lệ.', 422);
        } else {
            $status = 'archived';
        }
        $slug = v2_unique_slug('teams', (int) $context['school_id'], $name, 'doi', $teamId);
        $pdo = db();
        $pdo->beginTransaction();
        try {
            $pdo->prepare('UPDATE teams SET name=?, slug=?, description=?, status=?, updated_at=CURRENT_TIMESTAMP WHERE id=? AND school_id=?')->execute(array($name, $slug, $description, $status, $teamId, (int) $context['school_id']));
            if ($status === 'archived') {
                $pdo->prepare("UPDATE team_memberships SET status='inactive', left_at=COALESCE(left_at,NOW()) WHERE team_id=? AND status='active'")->execute(array($teamId));
                $pdo->prepare("UPDATE class_team_links SET status='inactive' WHERE team_id=? AND status='active'")->execute(array($teamId));
            }
            policy_audit($me, $context, $method === 'DELETE' ? 'school.team.archive' : 'school.team.update', 'team', (string) $teamId, 'allow', '', array('name' => $name, 'status' => $status));
            $pdo->commit();
        } catch (Throwable $exception) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            throw $exception;
        }
        j(array('ok' => true, 'id' => $teamId, 'name' => $name, 'slug' => $slug, 'description' => $description, 'status' => $status));
    }

    if (preg_match('#^/v2/schools/([1-9][0-9]*)/subjects/([^/]+)/teams/([1-9][0-9]*)(/modules(?:/([a-z0-9_-]+))?)?$#', $path, $match)) {
        $context = policy_resolve_team($me, (int) $match[1], urldecode($match[2]), (int) $match[3]);
        $team = $context['team'];

        if ($method === 'GET' && !isset($match[4])) {
            $counts = q_one(
                'SELECT (SELECT COUNT(*) FROM `team_memberships` WHERE `team_id` = ? AND `role` = \'student\' AND `access` = \'include\' AND `status` = \'active\' AND `left_at` IS NULL) AS `student_count`, (SELECT COUNT(*) FROM `team_memberships` WHERE `team_id` = ? AND `role` = \'coach\' AND `access` = \'include\' AND `status` = \'active\' AND `left_at` IS NULL) AS `coach_count`',
                array((int) $team['id'], (int) $team['id'])
            );
            j(array(
                'school_id' => $context['school_id'],
                'role' => $context['role'],
                'team_role' => $context['team_role'],
                'team' => array(
                    'id' => (int) $team['id'],
                    'slug' => (string) $team['slug'],
                    'name' => (string) $team['name'],
                    'description' => (string) $team['description'],
                    'school_year_id' => (int) $team['school_year_id'],
                    'subject_id' => (string) $team['subject_id'],
                    'subject_name' => (string) $team['subject_name'],
                    'student_count' => (int) $counts['student_count'],
                    'coach_count' => (int) $counts['coach_count'],
                ),
            ));
        }

        if ($method === 'GET' && isset($match[4]) && $match[4] === '/modules' && !isset($match[5])) {
            $visibility = $context['role'] === 'student' ? ' AND COALESCE(tm.`enabled`, sm.`default_enabled`, 0) = 1' : '';
            $rows = q_all(
                'SELECT mc.`id`, mc.`code`, mc.`name`, mc.`description`, mc.`category`, mc.`route_slug`, mc.`settings_schema_version`, sm.`available`, sm.`default_enabled`, COALESCE(tm.`enabled`, sm.`default_enabled`, 0) AS `enabled`, tm.`position`, tms.`settings_json`, tms.`schema_version` FROM `module_catalog` mc INNER JOIN `school_modules` sm ON sm.`module_id` = mc.`id` AND sm.`school_id` = ? AND sm.`available` = 1 LEFT JOIN `team_modules` tm ON tm.`module_id` = mc.`id` AND tm.`team_id` = ? LEFT JOIN `team_module_settings` tms ON tms.`module_id` = mc.`id` AND tms.`team_id` = ? WHERE mc.`status` = \'active\'' . $visibility . ' ORDER BY mc.`position`, mc.`name`',
                array((int) $context['school_id'], (int) $context['team_id'], (int) $context['team_id'])
            );
            $modules = array();
            foreach ($rows as $row) $modules[] = v2_module_payload($row);
            j(array('team_id' => $context['team_id'], 'modules' => $modules));
        }

        if ($method === 'GET' && isset($match[4]) && $match[4] === '/modules' && isset($match[5])) {
            $module = policy_module($context, $match[5]);
            if ($context['role'] === 'student' && !(bool) $module['enabled']) jerr('Không tìm thấy module.', 404);
            j(v2_module_payload($module));
        }

        if (($method === 'PUT' || $method === 'PATCH') && isset($match[4]) && $match[4] === '/modules' && isset($match[5])) {
            if (!policy_capability($me, $context, 'team.modules.manage')) jerr('Bạn không có quyền quản lý module.', 403);
            $module = policy_module($context, $match[5]);
            $payload = body();
            $existing = q_one('SELECT `enabled`, `position` FROM `team_modules` WHERE `team_id` = ? AND `module_id` = ?', array((int) $context['team_id'], (int) $module['id']));
            if (!$existing && !array_key_exists('enabled', $payload)) jerr('Thiếu trạng thái bật/tắt module.', 422);
            if (array_key_exists('enabled', $payload)) {
                $rawEnabled = $payload['enabled'];
                if (is_bool($rawEnabled)) $enabled = $rawEnabled ? 1 : 0;
                elseif (is_int($rawEnabled) && ($rawEnabled === 0 || $rawEnabled === 1)) $enabled = $rawEnabled;
                else jerr('Trạng thái bật/tắt module không hợp lệ.', 422);
            } else {
                $enabled = (int) $existing['enabled'];
            }
            if (array_key_exists('position', $payload)) {
                if (!is_int($payload['position']) || $payload['position'] < 0 || $payload['position'] > 10000) jerr('Vị trí module không hợp lệ.', 422);
                $position = (int) $payload['position'];
            } else {
                $position = $existing ? (int) $existing['position'] : 0;
            }
            $settings = null;
            if (array_key_exists('settings', $payload)) {
                if (!is_array($payload['settings'])) jerr('Cấu hình module không hợp lệ.', 422);
                $settings = json_encode($payload['settings'], JSON_UNESCAPED_UNICODE);
                if ($settings === false || strlen($settings) > 65535) jerr('Cấu hình module không hợp lệ.', 422);
            }
            $pdo = db();
            $pdo->beginTransaction();
            try {
                $pdo->prepare(
                    'INSERT INTO `team_modules` (`team_id`, `module_id`, `enabled`, `position`, `enabled_at`, `disabled_at`, `configured_by`) VALUES (?,?,?,?,IF(? = 1, CURRENT_TIMESTAMP, NULL),IF(? = 0, CURRENT_TIMESTAMP, NULL),?) ON DUPLICATE KEY UPDATE `enabled` = VALUES(enabled), `position` = VALUES(position), `enabled_at` = IF(VALUES(enabled) = 1, COALESCE(`enabled_at`, CURRENT_TIMESTAMP), `enabled_at`), `disabled_at` = IF(VALUES(enabled) = 0, CURRENT_TIMESTAMP, NULL), `configured_by` = VALUES(configured_by), `updated_at` = CURRENT_TIMESTAMP'
                )->execute(array((int) $context['team_id'], (int) $module['id'], $enabled, $position, $enabled, $enabled, (int) $me['id']));
                if ($settings !== null) {
                    $pdo->prepare(
                        'INSERT INTO `team_module_settings` (`team_id`, `module_id`, `settings_json`, `schema_version`, `updated_by`) VALUES (?,?,?,?,?) ON DUPLICATE KEY UPDATE `settings_json` = VALUES(settings_json), `schema_version` = VALUES(schema_version), `updated_by` = VALUES(updated_by), `updated_at` = CURRENT_TIMESTAMP'
                    )->execute(array((int) $context['team_id'], (int) $module['id'], $settings, (int) $module['settings_schema_version'], (int) $me['id']));
                }
                policy_audit($me, $context, 'team.module.update', 'module', (string) $module['code'], 'allow', (string) ($context['break_glass_reason'] ?? ''), array(
                    'enabled' => (bool) $enabled,
                    'position' => $position,
                    'settings_updated' => $settings !== null,
                    'break_glass_grant_id' => (int) ($context['break_glass_grant_id'] ?? 0),
                ));
                $pdo->commit();
            } catch (Throwable $exception) {
                if ($pdo->inTransaction()) $pdo->rollBack();
                throw $exception;
            }
            $updated = policy_module($context, $match[5]);
            j(v2_module_payload($updated));
        }
    }

    jerr('API không tồn tại.', 404);
    return true;
}
