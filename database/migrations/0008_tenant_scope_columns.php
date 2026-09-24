<?php
require_once dirname(__DIR__) . '/lib/MigrationSchema.php';

return array(
    'up' => function (PDO $pdo): void {
        $columns = array(
            'school_years' => array(
                'school_id' => 'INT NULL',
                'slug' => 'VARCHAR(160) NULL',
                'status' => 'VARCHAR(20) NOT NULL DEFAULT \'active\'',
            ),
            'grades' => array(
                'school_id' => 'INT NULL',
                'slug' => 'VARCHAR(160) NULL',
                'status' => 'VARCHAR(20) NOT NULL DEFAULT \'active\'',
            ),
            'classes' => array(
                'school_id' => 'INT NULL',
                'school_year_id' => 'INT NULL',
                'grade_id' => 'INT NULL',
                'slug' => 'VARCHAR(160) NULL',
                'status' => 'VARCHAR(20) NOT NULL DEFAULT \'active\'',
            ),
            'teams' => array(
                'school_id' => 'INT NULL',
                'slug' => 'VARCHAR(160) NULL',
                'status' => 'VARCHAR(20) NOT NULL DEFAULT \'active\'',
            ),
            'subjects' => array(
                'school_id' => 'INT NULL',
                'slug' => 'VARCHAR(160) NULL',
                'status' => 'VARCHAR(20) NOT NULL DEFAULT \'active\'',
                'updated_at' => 'DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP',
            ),
        );
        foreach ($columns as $table => $definitions) {
            foreach ($definitions as $column => $definition) {
                MigrationSchema::ensureColumn($pdo, $table, $column, $definition);
            }
        }
        if (getenv('AWAWA_MIGRATION_ASSIGN_SINGLE_SCHOOL') === '1') {
            $activeSchools = $pdo->query("SELECT `id` FROM `schools` WHERE `status`='active' ORDER BY `id`");
            if ($activeSchools === false) throw new RuntimeException('schools could not be read for single-school tenant backfill.');
            $activeSchoolIds = array_map('intval', $activeSchools->fetchAll(PDO::FETCH_COLUMN));
            if (count($activeSchoolIds) !== 1) throw new RuntimeException('AWAWA_MIGRATION_ASSIGN_SINGLE_SCHOOL=1 requires exactly one active school.');
            $schoolId = $activeSchoolIds[0];
            foreach (array('school_years', 'grades', 'classes', 'teams', 'subjects') as $table) {
                $pdo->prepare("UPDATE `$table` SET `school_id`=? WHERE `school_id` IS NULL")->execute(array($schoolId));
            }
            $pdo->prepare('UPDATE class_members cm INNER JOIN classes c ON c.id=cm.class_id SET cm.school_id=c.school_id WHERE cm.school_id IS NULL')->execute();
            $pdo->prepare('UPDATE team_members tm INNER JOIN teams t ON t.id=tm.team_id SET tm.school_id=t.school_id WHERE tm.school_id IS NULL')->execute();
        }
        MigrationSchema::ensureIndex($pdo, 'school_years', 'idx_school_years_school', '`school_id`');
        MigrationSchema::dropUniqueIndexesForColumn($pdo, 'school_years', 'name');
        MigrationSchema::ensureIndex($pdo, 'school_years', 'uq_school_years_school_name', '`school_id`, `name`');
        MigrationSchema::ensureIndex($pdo, 'grades', 'idx_grades_school', '`school_id`');
        MigrationSchema::ensureIndex($pdo, 'classes', 'idx_classes_school_year', '`school_year_id`');
        MigrationSchema::ensureIndex($pdo, 'classes', 'idx_classes_grade', '`grade_id`');
        MigrationSchema::ensureIndex($pdo, 'teams', 'idx_teams_school_subject', '`school_id`, `subject_id`');
        MigrationSchema::ensureIndex($pdo, 'subjects', 'idx_subjects_school_slug', '`school_id`, `slug`');

        $numericSlugs = array(
            'school_years' => array('id', 'nam-hoc'),
            'grades' => array('id', 'khoi'),
            'classes' => array('id', 'lop'),
            'teams' => array('id', 'doi-tuyen'),
        );
        foreach ($numericSlugs as $table => $config) {
            $rows = $pdo->query('SELECT `' . $config[0] . '` AS row_id FROM `' . $table . '` WHERE `slug` IS NULL OR `slug` = \'\'');
            if ($rows === false) {
                throw new RuntimeException($table . ' could not be read for slug backfill.');
            }
            $update = $pdo->prepare('UPDATE `' . $table . '` SET `slug` = ? WHERE `' . $config[0] . '` = ?');
            while (($row = $rows->fetch(PDO::FETCH_ASSOC)) !== false) {
                $update->execute(array($config[1] . '-' . (int) $row['row_id'], (int) $row['row_id']));
            }
        }

        $subjects = $pdo->query('SELECT `id`, `code`, `name` FROM `subjects` WHERE `slug` IS NULL OR `slug` = \'\'');
        if ($subjects === false) {
            throw new RuntimeException('subjects could not be read for slug backfill.');
        }
        $subjectSlug = $pdo->prepare('UPDATE `subjects` SET `slug` = ? WHERE `id` = ?');
        while (($subject = $subjects->fetch(PDO::FETCH_ASSOC)) !== false) {
            $source = trim((string) ($subject['code'] !== null && $subject['code'] !== '' ? $subject['code'] : $subject['name']));
            $ascii = function_exists('iconv') ? iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $source) : $source;
            if ($ascii === false) $ascii = $source;
            $slug = strtolower(trim((string) preg_replace('/[^a-zA-Z0-9]+/', '-', (string) $ascii), '-'));
            if ($slug === '') $slug = 'mon-' . substr(sha1((string) $subject['id']), 0, 10);
            $slug = substr($slug, 0, 140);
            $subjectSlug->execute(array($slug, $subject['id']));
        }

        $pdo->exec('UPDATE `class_members` cm INNER JOIN `classes` c ON c.`id` = cm.`class_id` SET cm.`school_id` = c.`school_id` WHERE cm.`school_id` IS NULL');
        $pdo->exec('UPDATE `team_members` tm INNER JOIN `teams` t ON t.`id` = tm.`team_id` SET tm.`school_id` = t.`school_id` WHERE tm.`school_id` IS NULL');
        if (MigrationSchema::tableExists($pdo, 'team_memberships')) {
            $pdo->exec('UPDATE `team_memberships` m INNER JOIN `teams` t ON t.`id` = m.`team_id` SET m.`school_id` = t.`school_id` WHERE m.`school_id` IS NULL');
        }

        foreach (array('school_years', 'grades', 'classes', 'teams', 'subjects') as $table) {
            $duplicates = $pdo->query('SELECT `school_id`, `slug`, COUNT(*) AS `total` FROM `' . $table . '` WHERE `school_id` IS NOT NULL AND `slug` IS NOT NULL AND `slug` <> \'\' GROUP BY `school_id`, `slug` HAVING COUNT(*) > 1 LIMIT 1');
            if ($duplicates === false) {
                throw new RuntimeException($table . ' duplicate slugs could not be checked.');
            }
            $duplicate = $duplicates->fetch(PDO::FETCH_ASSOC);
            if ($duplicate) {
                throw new RuntimeException('Duplicate tenant slug in ' . $table . ': school_id=' . $duplicate['school_id'] . ', slug=' . $duplicate['slug']);
            }
        }
        MigrationSchema::ensureIndex($pdo, 'school_years', 'uq_school_years_school_slug', '`school_id`, `slug`');
        MigrationSchema::ensureIndex($pdo, 'grades', 'uq_grades_school_slug', '`school_id`, `slug`');
        MigrationSchema::ensureIndex($pdo, 'classes', 'uq_classes_school_slug', '`school_id`, `slug`');
        MigrationSchema::ensureIndex($pdo, 'teams', 'uq_teams_school_slug', '`school_id`, `slug`');
        MigrationSchema::ensureIndex($pdo, 'subjects', 'uq_subjects_school_slug', '`school_id`, `slug`');
        MigrationSchema::ensureIndex($pdo, 'classes', 'uq_classes_school_id', '`school_id`, `id`');
        MigrationSchema::ensureIndex($pdo, 'teams', 'uq_teams_school_id', '`school_id`, `id`');

        $quarantine = $pdo->prepare(
            'INSERT IGNORE INTO `migration_quarantine` (`migration_version`, `entity_type`, `entity_id`, `reason`, `payload`) VALUES (?, ?, ?, ?, ?)'
        );
        foreach (array('school_years', 'grades', 'classes', 'subjects', 'teams') as $table) {
            $rows = $pdo->query('SELECT `id` FROM `' . $table . '` WHERE `school_id` IS NULL OR `school_id` <= 0');
            if ($rows === false) {
                throw new RuntimeException($table . ' could not be read for tenant quarantine.');
            }
            while (($row = $rows->fetch(PDO::FETCH_ASSOC)) !== false) {
                $quarantine->execute(array('0008_tenant_scope_columns', $table, (string) $row['id'], 'missing_school_id', json_encode(array('id' => $row['id']), JSON_UNESCAPED_UNICODE)));
            }
        }
        $checks = array(
            array('school_years', 'SELECT t.`id` FROM `school_years` t LEFT JOIN `schools` s ON s.`id` = t.`school_id` WHERE t.`school_id` IS NOT NULL AND s.`id` IS NULL', 'school_not_found'),
            array('grades', 'SELECT g.`id` FROM `grades` g LEFT JOIN `schools` s ON s.`id` = g.`school_id` LEFT JOIN `school_years` y ON y.`id` = g.`school_year_id` WHERE g.`school_id` IS NOT NULL AND (s.`id` IS NULL OR (g.`school_year_id` IS NOT NULL AND (y.`id` IS NULL OR y.`school_id` <> g.`school_id`)))', 'grade_tenant_mismatch'),
            array('classes', 'SELECT c.`id` FROM `classes` c LEFT JOIN `schools` s ON s.`id` = c.`school_id` LEFT JOIN `school_years` y ON y.`id` = c.`school_year_id` LEFT JOIN `grades` g ON g.`id` = c.`grade_id` WHERE c.`school_id` IS NOT NULL AND (s.`id` IS NULL OR (c.`school_year_id` IS NOT NULL AND (y.`id` IS NULL OR y.`school_id` <> c.`school_id`)) OR (c.`grade_id` IS NOT NULL AND (g.`id` IS NULL OR g.`school_id` <> c.`school_id`)))', 'class_tenant_mismatch'),
            array('subjects', 'SELECT t.`id` FROM `subjects` t LEFT JOIN `schools` s ON s.`id` = t.`school_id` WHERE t.`school_id` IS NOT NULL AND s.`id` IS NULL', 'school_not_found'),
            array('teams', 'SELECT t.`id` FROM `teams` t LEFT JOIN `schools` s ON s.`id` = t.`school_id` LEFT JOIN `subjects` x ON x.`id` = t.`subject_id` AND x.`school_id` = t.`school_id` WHERE t.`school_id` IS NOT NULL AND (s.`id` IS NULL OR x.`id` IS NULL)', 'team_subject_tenant_mismatch'),
            array('class_members', 'SELECT cm.`id` FROM `class_members` cm INNER JOIN `classes` c ON c.`id` = cm.`class_id` WHERE cm.`school_id` IS NULL OR c.`school_id` IS NULL OR cm.`school_id` <> c.`school_id`', 'class_membership_tenant_mismatch'),
            array('team_members', 'SELECT tm.`id` FROM `team_members` tm INNER JOIN `teams` t ON t.`id` = tm.`team_id` WHERE tm.`school_id` IS NULL OR t.`school_id` IS NULL OR tm.`school_id` <> t.`school_id`', 'team_membership_tenant_mismatch'),
        );
        if (MigrationSchema::tableExists($pdo, 'team_memberships')) {
            $checks[] = array('team_memberships', 'SELECT m.`id` FROM `team_memberships` m INNER JOIN `teams` t ON t.`id` = m.`team_id` WHERE m.`school_id` IS NULL OR t.`school_id` IS NULL OR m.`school_id` <> t.`school_id`', 'team_membership_tenant_mismatch');
        }
        foreach ($checks as $check) {
            $rows = $pdo->query($check[1]);
            if ($rows === false) {
                throw new RuntimeException($check[0] . ' tenant integrity could not be checked.');
            }
            while (($row = $rows->fetch(PDO::FETCH_ASSOC)) !== false) {
                $quarantine->execute(array('0008_tenant_scope_columns', $check[0], (string) $row['id'], $check[2], json_encode($row, JSON_UNESCAPED_UNICODE)));
            }
        }
    },
    'down' => function (PDO $pdo): void {
        throw new RuntimeException('Migration 0008_tenant_scope_columns is not reversible because slugs, tenant backfills, and quarantine decisions require operator review.');
    },
);
