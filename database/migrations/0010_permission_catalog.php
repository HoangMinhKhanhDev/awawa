<?php
require_once dirname(__DIR__) . '/lib/MigrationSchema.php';

return array(
    'up' => function (PDO $pdo): void {
        $pdo->exec(
            'CREATE TABLE IF NOT EXISTS `role_permissions` (
                `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
                `role` VARCHAR(32) NOT NULL,
                `perm_key` VARCHAR(96) NOT NULL,
                `allowed` TINYINT NOT NULL DEFAULT 0,
                `scope` VARCHAR(20) NOT NULL DEFAULT \'own\',
                `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (`id`),
                UNIQUE KEY `uq_role_permissions` (`role`, `perm_key`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
        );
        foreach (array(
            'scope' => 'VARCHAR(20) NOT NULL DEFAULT \'own\'',
            'created_at' => 'DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP',
            'updated_at' => 'DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP',
        ) as $column => $definition) {
            MigrationSchema::ensureColumn($pdo, 'role_permissions', $column, $definition);
        }
        MigrationSchema::ensureIndex($pdo, 'role_permissions', 'uq_role_permissions', '`role`, `perm_key`');

        $defaults = array(
            'student' => array(
                'scope' => 'own',
                'permissions' => array('practice', 'exam', 'assignments.submit', 'lessons.read', 'materials.read', 'flashcards.read', 'flashcards.review', 'progress.self'),
            ),
            'teacher' => array(
                'scope' => 'team',
                'permissions' => array('practice', 'exam', 'assignments.create', 'assignments.grade', 'lessons.read', 'lessons.write', 'bank.manage', 'import.manage', 'studio.manage', 'materials.read', 'materials.write', 'flashcards.manage', 'students.view', 'students.create', 'progress.self', 'progress.team', 'export.reports', 'school.view', 'content.publish_school'),
            ),
            'admin' => array(
                'scope' => 'school',
                'permissions' => array('practice', 'exam', 'assignments.create', 'assignments.grade', 'lessons.read', 'lessons.write', 'bank.manage', 'import.manage', 'studio.manage', 'materials.read', 'materials.write', 'flashcards.manage', 'students.view', 'students.create', 'students.bulk', 'students.lock', 'students.delete', 'students.role', 'progress.self', 'progress.team', 'export.reports', 'school.view', 'school.manage', 'classes.manage', 'class_team.manage', 'team.modules.manage', 'team.membership.override', 'content.publish_school', 'notifications.send'),
            ),
            'super_admin' => array(
                'scope' => 'system',
                'permissions' => array('practice', 'exam', 'assignments.create', 'assignments.grade', 'lessons.read', 'lessons.write', 'bank.manage', 'import.manage', 'studio.manage', 'materials.read', 'materials.write', 'flashcards.manage', 'students.view', 'students.create', 'students.bulk', 'students.lock', 'students.delete', 'students.role', 'progress.self', 'progress.team', 'export.reports', 'school.view', 'school.manage', 'classes.manage', 'class_team.manage', 'team.modules.manage', 'team.membership.override', 'content.publish_school', 'notifications.send', 'permissions.manage', 'users.manage_admin', 'platform.manage'),
            ),
        );
        $insert = $pdo->prepare('INSERT IGNORE INTO role_permissions (role,perm_key,allowed,scope) VALUES (?,?,?,?)');
        foreach ($defaults as $role => $config) {
            foreach ($config['permissions'] as $permission) {
                $insert->execute(array($role, $permission, 1, $config['scope']));
            }
        }
        $scope = $pdo->prepare('UPDATE role_permissions SET scope=? WHERE role=? AND (scope IS NULL OR scope=\'\')');
        foreach ($defaults as $role => $config) $scope->execute(array($config['scope'], $role));
        $defaultScope = $pdo->prepare("UPDATE role_permissions SET scope=? WHERE role=? AND perm_key=? AND scope='own'");
        foreach ($defaults as $role => $config) {
            foreach ($config['permissions'] as $permission) $defaultScope->execute(array($config['scope'], $role, $permission));
        }
    },
    'down' => function (PDO $pdo): void {
        throw new RuntimeException('Migration 0010_permission_catalog is not reversible because permission changes require an explicit administrator decision.');
    },
);
