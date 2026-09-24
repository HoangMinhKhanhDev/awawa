<?php
require_once dirname(__DIR__) . '/lib/MigrationSchema.php';

return array(
    'up' => function (PDO $pdo): void {
        MigrationSchema::ensureColumn($pdo, 'topics', 'parent_id', 'VARCHAR(64) NULL');
        MigrationSchema::ensureColumn($pdo, 'topics', 'position', 'INT NOT NULL DEFAULT 0');
        MigrationSchema::ensureColumn($pdo, 'topics', 'status', 'VARCHAR(20) NOT NULL DEFAULT \'published\'');
        MigrationSchema::ensureColumn($pdo, 'topics', 'code', 'VARCHAR(64) NULL');
        MigrationSchema::ensureColumn($pdo, 'subjects', 'code', 'VARCHAR(64) NULL');
        MigrationSchema::ensureIndex($pdo, 'topics', 'idx_topics_parent', '`parent_id`');
        MigrationSchema::ensureIndex($pdo, 'topics', 'idx_topics_status_position', '`status`, `position`');

        MigrationSchema::ensureColumn($pdo, 'lessons', 'required', 'TINYINT NOT NULL DEFAULT 1');
        MigrationSchema::ensureColumn($pdo, 'lessons', 'advanced', 'TINYINT NOT NULL DEFAULT 0');
        MigrationSchema::ensureColumn($pdo, 'lessons', 'status', 'VARCHAR(20) NOT NULL DEFAULT \'published\'');
        MigrationSchema::ensureColumn($pdo, 'lessons', 'published_at', 'DATETIME NULL');
        MigrationSchema::ensureColumn($pdo, 'lessons', 'code', 'VARCHAR(64) NULL');
        MigrationSchema::ensureIndex($pdo, 'lessons', 'idx_lessons_status', '`status`');

        MigrationSchema::ensureColumn($pdo, 'questions', 'code', 'VARCHAR(64) NOT NULL DEFAULT \'\'');
        MigrationSchema::ensureColumn($pdo, 'questions', 'tags', 'LONGTEXT NULL');
        MigrationSchema::ensureColumn($pdo, 'students', 'avatar_url', 'VARCHAR(2000) NULL');

        MigrationSchema::ensureColumn($pdo, 'assignments', 'team_id', 'INT NULL');
        MigrationSchema::ensureIndex($pdo, 'assignments', 'idx_assignments_team', '`team_id`');
        MigrationSchema::ensureColumn($pdo, 'assign_questions', 'question_id', 'INT NULL');
        MigrationSchema::ensureColumn($pdo, 'assign_questions', 'code', 'VARCHAR(64) NULL');
        MigrationSchema::ensureIndex($pdo, 'assign_questions', 'idx_assign_questions_question', '`question_id`');

        $pdo->exec(
            'CREATE TABLE IF NOT EXISTS `lesson_blocks` (
                `id` INT NOT NULL AUTO_INCREMENT,
                `lesson_id` INT NOT NULL,
                `type` VARCHAR(32) NOT NULL DEFAULT \'text\',
                `content` LONGTEXT NULL,
                `position` INT NOT NULL DEFAULT 1,
                `metadata` LONGTEXT NULL,
                `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (`id`),
                KEY `idx_lesson_blocks_lesson` (`lesson_id`, `position`, `id`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
        );
        foreach (array(
            'type' => 'VARCHAR(32) NOT NULL DEFAULT \'text\'',
            'content' => 'LONGTEXT NULL',
            'position' => 'INT NOT NULL DEFAULT 1',
            'metadata' => 'LONGTEXT NULL',
            'created_at' => 'DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP',
        ) as $column => $definition) {
            MigrationSchema::ensureColumn($pdo, 'lesson_blocks', $column, $definition);
        }
        MigrationSchema::ensureIndex($pdo, 'lesson_blocks', 'idx_lesson_blocks_lesson', '`lesson_id`, `position`, `id`');

        $pdo->exec(
            'CREATE TABLE IF NOT EXISTS `flashcards` (
                `id` INT NOT NULL AUTO_INCREMENT,
                `topic_id` VARCHAR(64) NULL,
                `lesson_id` INT NULL,
                `front` TEXT NOT NULL,
                `back` MEDIUMTEXT NULL,
                `idx` INT NOT NULL DEFAULT 1,
                `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (`id`),
                KEY `idx_flashcards_topic` (`topic_id`, `idx`, `id`),
                KEY `idx_flashcards_lesson` (`lesson_id`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
        );
        foreach (array(
            'topic_id' => 'VARCHAR(64) NULL',
            'lesson_id' => 'INT NULL',
            'front' => 'TEXT NOT NULL',
            'back' => 'MEDIUMTEXT NULL',
            'idx' => 'INT NOT NULL DEFAULT 1',
            'created_at' => 'DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP',
        ) as $column => $definition) {
            MigrationSchema::ensureColumn($pdo, 'flashcards', $column, $definition);
        }
        MigrationSchema::ensureIndex($pdo, 'flashcards', 'idx_flashcards_topic', '`topic_id`, `idx`, `id`');
        MigrationSchema::ensureIndex($pdo, 'flashcards', 'idx_flashcards_lesson', '`lesson_id`');

        $pdo->exec(
            'CREATE TABLE IF NOT EXISTS `flashcard_progress` (
                `student_id` INT NOT NULL,
                `card_id` INT NOT NULL,
                `box` TINYINT UNSIGNED NOT NULL DEFAULT 1,
                `last_reviewed_at` DATETIME NULL,
                PRIMARY KEY (`student_id`, `card_id`),
                KEY `idx_flashcard_progress_card` (`card_id`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
        );
        foreach (array(
            'box' => 'TINYINT UNSIGNED NOT NULL DEFAULT 1',
            'last_reviewed_at' => 'DATETIME NULL',
        ) as $column => $definition) {
            MigrationSchema::ensureColumn($pdo, 'flashcard_progress', $column, $definition);
        }
        MigrationSchema::ensureIndex($pdo, 'flashcard_progress', 'idx_flashcard_progress_card', '`card_id`');

        $pdo->exec(
            'CREATE TABLE IF NOT EXISTS `submission_answers` (
                `id` INT NOT NULL AUTO_INCREMENT,
                `submission_id` INT NOT NULL,
                `question_id` INT NULL,
                `assign_q_idx` INT NULL,
                `answer` LONGTEXT NULL,
                `is_correct` TINYINT NULL,
                `points` DECIMAL(10,2) NULL,
                `feedback` VARCHAR(1000) NULL,
                `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (`id`),
                KEY `idx_submission_answers_submission` (`submission_id`),
                KEY `idx_submission_answers_question` (`question_id`),
                KEY `idx_submission_answers_idx` (`submission_id`, `assign_q_idx`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
        );
        foreach (array(
            'submission_id' => 'INT NOT NULL',
            'question_id' => 'INT NULL',
            'assign_q_idx' => 'INT NULL',
            'answer' => 'LONGTEXT NULL',
            'is_correct' => 'TINYINT NULL',
            'points' => 'DECIMAL(10,2) NULL',
            'feedback' => 'VARCHAR(1000) NULL',
            'created_at' => 'DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP',
        ) as $column => $definition) {
            MigrationSchema::ensureColumn($pdo, 'submission_answers', $column, $definition);
        }
        MigrationSchema::ensureIndex($pdo, 'submission_answers', 'idx_submission_answers_submission', '`submission_id`');
        MigrationSchema::ensureIndex($pdo, 'submission_answers', 'idx_submission_answers_question', '`question_id`');
        MigrationSchema::ensureIndex($pdo, 'submission_answers', 'idx_submission_answers_idx', '`submission_id`, `assign_q_idx`');
    },
    'down' => function (PDO $pdo): void {
        throw new RuntimeException('Migration 0003_legacy_parity is not reversible because additive legacy data and compatibility columns cannot be safely reconstructed.');
    },
);
