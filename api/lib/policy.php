<?php

function policy_table_exists($table)
{
    try {
        $row = q_one('SELECT 1 AS ok FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ?', array((string) $table));
        return (bool) $row;
    } catch (Throwable $exception) {
        return false;
    }
}

function policy_legacy_route_allowed($path)
{
    if (getenv('AWAWA_MIGRATIONS_REQUIRED') !== '1') return true;
    if (getenv('AWAWA_STRICT_TENANT') === '0') return true;
    $allowed = array(
        '/health',
        '/auth/register',
        '/auth/login',
        '/auth/logout',
        '/auth/me',
        '/auth/profile',
        '/auth/password',
        '/auth/forgot-password',
        '/auth/reset-password',
        '/permissions',
        '/migrate',
        '/files/',
        '/me/avatar',
    );
    foreach ($allowed as $prefix) {
        if ($prefix === $path || strpos($path, $prefix) === 0) return true;
    }
    return false;
}

function policy_require_schema()
{
    $required = array(
        'schema_migrations',
        'schools',
        'school_memberships',
        'user_system_roles',
        'teams',
        'subjects',
        'team_memberships',
        'module_catalog',
        'school_modules',
        'team_modules',
        'team_module_settings',
        'break_glass_grants',
        'audit_events',
    );
    foreach ($required as $table) {
        if (!policy_table_exists($table)) {
            j(array('error' => 'Cơ sở dữ liệu chưa chạy migration bắt buộc.', 'code' => 'migration_required', 'table' => $table), 503);
        }
    }
    $applied = (int) q_one("SELECT COUNT(*) AS total FROM `schema_migrations` WHERE `status` = 'completed' AND `version` IN ('0001_legacy_contract','0002_school_memberships','0003_legacy_parity','0004_class_team_links','0005_team_memberships','0006_module_catalog','0007_audit_break_glass','0008_tenant_scope_columns','0009_team_operations','0010_permission_catalog')")['total'];
    if ($applied !== 10) {
        j(array('error' => 'API v2 yêu cầu migration 0001–0010 hoàn tất.', 'code' => 'migration_required', 'applied' => $applied), 503);
    }
}

function policy_system_roles($userId)
{
    $rows = q_all("SELECT `role` FROM `user_system_roles` WHERE `user_id` = ? AND `role` IN ('super_admin') AND `status` = 'active' AND `revoked_at` IS NULL ORDER BY `role`", array((int) $userId));
    $roles = array();
    foreach ($rows as $row) $roles[] = (string) $row['role'];
    return $roles;
}

function policy_system_capability($me, $permission)
{
    foreach (policy_system_roles((int) $me['id']) as $role) {
        $row = q_one('SELECT `allowed` FROM `role_permissions` WHERE `role`=? AND `perm_key`=? LIMIT 1', array($role, (string) $permission));
        if ($row && (int) $row['allowed'] === 1) return true;
    }
    return false;
}

function policy_has_system_role($userId, $role)
{
    $row = q_one("SELECT 1 AS ok FROM `user_system_roles` WHERE `user_id` = ? AND `role` = ? AND `status` = 'active' AND `revoked_at` IS NULL", array((int) $userId, (string) $role));
    return (bool) $row;
}

function policy_active_break_glass($userId, $schoolId)
{
    $row = q_one(
        "SELECT bg.`id`, bg.`reason` FROM `break_glass_grants` bg INNER JOIN `schools` s ON s.`id` = bg.`school_id` AND s.`status` = 'active' WHERE bg.`user_id` = ? AND bg.`school_id` = ? AND bg.`status` = 'active' AND bg.`revoked_at` IS NULL AND bg.`expires_at` > NOW() ORDER BY bg.`expires_at` DESC LIMIT 1",
        array((int) $userId, (int) $schoolId)
    );
    return $row ? $row : null;
}

function policy_resolve_school($me, $schoolId)
{
    $schoolId = (int) $schoolId;
    if ($schoolId <= 0) jerr('Không tìm thấy trường.', 404);
    $membership = q_one(
        "SELECT sm.`role` FROM `school_memberships` sm INNER JOIN `schools` s ON s.`id` = sm.`school_id` WHERE sm.`school_id` = ? AND sm.`user_id` = ? AND sm.`status` = 'active' AND sm.`left_at` IS NULL AND s.`status` = 'active'",
        array($schoolId, (int) $me['id'])
    );
    if ($membership) {
        $role = (string) $membership['role'];
        if (!in_array($role, array('admin', 'teacher', 'student'), true)) jerr('Không tìm thấy trường.', 404);
        return array(
            'school_id' => $schoolId,
            'role' => $role,
            'team_role' => null,
            'break_glass_grant_id' => 0,
            'break_glass_reason' => '',
        );
    }
    if (policy_has_system_role((int) $me['id'], 'super_admin')) {
        $grant = policy_active_break_glass((int) $me['id'], $schoolId);
        if ($grant) {
            $context = array(
                'school_id' => $schoolId,
                'role' => 'super_admin',
                'team_role' => 'super_admin',
                'break_glass_grant_id' => (int) $grant['id'],
                'break_glass_reason' => (string) $grant['reason'],
            );
            policy_audit($me, $context, 'tenant.break_glass.resolve', 'school', (string) $schoolId, 'allow', (string) $grant['reason'], array('grant_id' => (int) $grant['id']));
            return $context;
        }
    }
    jerr('Không tìm thấy trường.', 404);
}

function policy_resolve_team($me, $schoolId, $subjectId, $teamId)
{
    $context = policy_resolve_school($me, $schoolId);
    $team = q_one(
        'SELECT t.`id`, t.`school_id`, t.`school_year_id`, t.`subject_id`, t.`slug`, t.`name`, t.`description`, t.`status`, s.`name` AS `subject_name` FROM `teams` t INNER JOIN `subjects` s ON s.`id` = t.`subject_id` AND s.`school_id` = t.`school_id` AND s.`status` = \'active\' WHERE t.`id` = ? AND t.`school_id` = ? AND t.`subject_id` = ? LIMIT 1',
        array((int) $teamId, (int) $schoolId, (string) $subjectId)
    );
    if (!$team || (string) $team['status'] !== 'active') jerr('Không tìm thấy đội tuyển.', 404);

    $teamRole = null;
    if ($context['role'] === 'admin' || $context['role'] === 'super_admin') {
        $teamRole = $context['role'];
    } else {
        $membership = q_one(
            "SELECT `role` FROM `team_memberships` WHERE `team_id` = ? AND `user_id` = ? AND `school_id` = ? AND `role` IN ('student', 'coach') AND `access` = 'include' AND `status` = 'active' AND `left_at` IS NULL ORDER BY `role` LIMIT 1",
            array((int) $teamId, (int) $me['id'], (int) $schoolId)
        );
        if ($membership) $teamRole = (string) $membership['role'];
    }

    $allowed = false;
    if ($context['role'] === 'admin' || $context['role'] === 'super_admin') $allowed = true;
    if ($context['role'] === 'teacher' && $teamRole === 'coach') $allowed = true;
    if ($context['role'] === 'student' && $teamRole === 'student') $allowed = true;
    if (!$allowed) jerr('Không tìm thấy đội tuyển.', 404);

    $context['team_id'] = (int) $team['id'];
    $context['team_role'] = $teamRole;
    $context['team'] = $team;
    return $context;
}

function policy_capability($me, $context, $permission)
{
    $actor = $me;
    $actor['role'] = (string) $context['role'];
    $scope = isset($context['team_id']) ? 'team' : ((string) $context['role'] === 'admin' ? 'school' : ((string) $context['role'] === 'teacher' ? 'team' : 'own'));
    return perm_allows($actor, $permission, array('scope' => $scope, 'team_id' => isset($context['team_id']) ? (int) $context['team_id'] : null));
}

function policy_module($context, $moduleCode)
{
    $row = q_one(
        'SELECT mc.`id`, mc.`code`, mc.`name`, mc.`description`, mc.`category`, mc.`route_slug`, mc.`status`, mc.`settings_schema_version`, sm.`available`, sm.`default_enabled`, COALESCE(tm.`enabled`, sm.`default_enabled`, 0) AS `enabled`, tm.`position`, tms.`settings_json`, tms.`schema_version` FROM `module_catalog` mc INNER JOIN `school_modules` sm ON sm.`module_id` = mc.`id` AND sm.`school_id` = ? AND sm.`available` = 1 LEFT JOIN `team_modules` tm ON tm.`module_id` = mc.`id` AND tm.`team_id` = ? LEFT JOIN `team_module_settings` tms ON tms.`module_id` = mc.`id` AND tms.`team_id` = ? WHERE mc.`code` = ? AND mc.`status` = \'active\' LIMIT 1',
        array((int) $context['school_id'], (int) $context['team_id'], (int) $context['team_id'], (string) $moduleCode)
    );
    if (!$row) jerr('Không tìm thấy module.', 404);
    return $row;
}

function policy_actor_school_id($me, $required = false)
{
    $requested = (int) ($_SERVER['HTTP_X_SCHOOL_ID'] ?? 0);
    $rows = q_all("SELECT school_id FROM school_memberships WHERE user_id=? AND status='active' AND left_at IS NULL ORDER BY id", array((int) $me['id']));
    $allowed = array();
    foreach ($rows as $row) $allowed[] = (int) $row['school_id'];
    if ($requested > 0 && in_array($requested, $allowed, true)) return $requested;
    if (count($allowed) === 1) return $allowed[0];
    if ($requested <= 0 && count($allowed) > 1 && $required) jerr('Vui lòng chọn trường.', 409);
    if ($required) jerr('Tài khoản chưa được gán vào trường.', 403);
    return 0;
}

function policy_file_assets_ready()
{
    return policy_table_exists('file_assets');
}

function policy_create_file_asset($me, $storageKey, $originalName, $mimeType, $sizeBytes, $teamId = 0, $ownerType = 'upload', $ownerId = '')
{
    if (!policy_file_assets_ready()) return 0;
    $schoolId = null;
    if ((int) $teamId > 0) {
        $team = q_one('SELECT school_id FROM teams WHERE id=?', array((int) $teamId));
        if ($team) $schoolId = $team['school_id'] !== null ? (int) $team['school_id'] : null;
    }
    if ($schoolId === null) {
        $actorSchoolId = policy_actor_school_id($me, false);
        if ($actorSchoolId > 0) $schoolId = $actorSchoolId;
    }
    db()->prepare(
        'INSERT INTO file_assets (school_id,team_id,uploader_user_id,owner_type,owner_id,storage_key,original_name,mime_type,size_bytes,status) VALUES (?,?,?,?,?,?,?,?,?,\'active\')'
    )->execute(array(
        $schoolId,
        (int) $teamId > 0 ? (int) $teamId : null,
        (int) $me['id'],
        (string) $ownerType,
        (string) $ownerId,
        (string) $storageKey,
        (string) $originalName,
        (string) $mimeType,
        (int) $sizeBytes,
    ));
    return (int) db()->lastInsertId();
}

function policy_file_url($assetId)
{
    $base = PUBLIC_BASE;
    if ($base === '') {
        $https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');
        $base = ($https ? 'https' : 'http') . '://' . ($_SERVER['HTTP_HOST'] ?? '');
    }
    return rtrim($base, '/') . '/api/files/' . (int) $assetId;
}

function policy_actor_file_allowed($me, $asset)
{
    if ((int) $asset['uploader_user_id'] === (int) $me['id']) return true;
    $schoolId = $asset['school_id'] === null ? 0 : (int) $asset['school_id'];
    if ($schoolId > 0) {
        if (policy_has_system_role((int) $me['id'], 'super_admin') && policy_active_break_glass((int) $me['id'], $schoolId)) return true;
        $membership = q_one("SELECT role FROM school_memberships WHERE school_id=? AND user_id=? AND status='active' AND left_at IS NULL", array($schoolId, (int) $me['id']));
        if (!$membership) return false;
        if ((string) $membership['role'] === 'admin') return true;
        if ((string) $membership['role'] === 'teacher' && $asset['team_id'] === null) return true;
        if ($asset['team_id'] !== null) {
            $teamRole = (string) $membership['role'] === 'teacher' ? 'coach' : 'student';
            $allowed = q_one("SELECT 1 AS ok FROM team_memberships WHERE team_id=? AND user_id=? AND role=? AND access='include' AND status='active' AND left_at IS NULL", array((int) $asset['team_id'], (int) $me['id'], $teamRole));
            return (bool) $allowed;
        }
    }
    return policy_has_system_role((int) $me['id'], 'super_admin');
}

function policy_request_id()
{
    $requestId = trim((string) ($_SERVER['HTTP_X_REQUEST_ID'] ?? ''));
    if ($requestId === '' || strlen($requestId) > 64 || !preg_match('/^[A-Za-z0-9._:-]+$/', $requestId)) $requestId = bin2hex(random_bytes(16));
    return $requestId;
}

function policy_audit($me, $context, $action, $resourceType, $resourceId, $decision, $reason = '', $metadata = array())
{
    $requestId = policy_request_id();
    if (!headers_sent()) header('X-Request-ID: ' . $requestId);
    $ip = (string) ($_SERVER['REMOTE_ADDR'] ?? '');
    $agent = (string) ($_SERVER['HTTP_USER_AGENT'] ?? '');
    $encoded = json_encode($metadata, JSON_UNESCAPED_UNICODE);
    if ($encoded === false) $encoded = '{}';
    db()->prepare(
        'INSERT INTO `audit_events` (`request_id`, `actor_user_id`, `actor_role`, `school_id`, `team_id`, `action`, `resource_type`, `resource_id`, `decision`, `reason`, `metadata`, `ip_hash`, `user_agent_hash`) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)'
    )->execute(array(
        $requestId,
        (int) $me['id'],
        (string) ($me['role'] ?? 'unknown'),
        isset($context['school_id']) ? (int) $context['school_id'] : null,
        isset($context['team_id']) ? (int) $context['team_id'] : null,
        (string) $action,
        (string) $resourceType,
        (string) $resourceId,
        (string) $decision,
        (string) $reason,
        $encoded,
        $ip === '' ? null : hash('sha256', $ip),
        $agent === '' ? null : hash('sha256', $agent),
    ));
    return $requestId;
}
