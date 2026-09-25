<?php
require_once dirname(__DIR__) . '/lib/MigrationSchema.php';

return array(
    'up' => function (PDO $pdo): void {
        if (!MigrationSchema::tableExists($pdo, 'team_members')) {
            return;
        }
        if (!MigrationSchema::tableExists($pdo, 'team_memberships')) {
            throw new RuntimeException('team_memberships is required before dropping team_members.');
        }
        $pdo->exec(
            "INSERT IGNORE INTO `team_memberships`
                (`legacy_id`, `team_id`, `user_id`, `school_id`, `role`, `access`, `status`, `joined_at`, `left_at`, `source`)
             SELECT tm.`id`, tm.`team_id`, tm.`user_id`, COALESCE(NULLIF(tm.`school_id`, 0), t.`school_id`),
                    COALESCE(NULLIF(tm.`member_role`, ''), 'student'), 'include',
                    CASE WHEN tm.`left_at` IS NULL OR tm.`left_at` = '' THEN 'active' ELSE 'inactive' END,
                    tm.`joined_at`, tm.`left_at`, 'team_members'
             FROM `team_members` tm
             INNER JOIN `teams` t ON t.`id` = tm.`team_id`
             INNER JOIN `students` u ON u.`id` = tm.`user_id`
             WHERE (tm.`member_role` IS NULL OR tm.`member_role` = '' OR tm.`member_role` IN ('student', 'coach'))"
        );
        $missing = (int) $pdo->query(
            "SELECT COUNT(*) FROM `team_members` tm
             LEFT JOIN `team_memberships` m ON m.`legacy_id` = tm.`id`
             WHERE m.`id` IS NULL
               AND (tm.`member_role` IS NULL OR tm.`member_role` = '' OR tm.`member_role` IN ('student', 'coach'))"
        )->fetchColumn();
        if ($missing > 0) {
            throw new RuntimeException('team_members backfill is incomplete: ' . $missing . ' row(s) missing.');
        }
        $pdo->exec('DROP TABLE `team_members`');
    },
    'down' => function (PDO $pdo): void {
        throw new RuntimeException('Migration 0011_drop_legacy_team_members is not reversible because legacy membership rows were merged into team_memberships.');
    },
);
