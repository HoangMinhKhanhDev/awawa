<?php
require_once dirname(__DIR__) . '/lib/MigrationSchema.php';

return array(
    'up' => function (PDO $pdo): void {
        $tables = array(
            'subjects',
            'topics',
            'questions',
            'students',
            'sessions',
            'classes',
            'class_members',
            'school_years',
            'grades',
            'teams',
            'team_members',
            'exams',
            'attempts',
            'assignments',
            'assign_questions',
            'submissions',
            'grade_history',
            'materials',
            'notifications',
            'password_resets',
            'lessons',
            'lesson_completions',
        );
        $missing = array();
        foreach ($tables as $table) {
            if (!MigrationSchema::tableExists($pdo, $table)) {
                $missing[] = $table;
            }
        }
        if (count($missing) > 0) {
            throw new RuntimeException('Legacy baseline is incomplete; missing tables: ' . implode(', ', $missing));
        }
    },
    'down' => function (PDO $pdo): void {
    },
);
