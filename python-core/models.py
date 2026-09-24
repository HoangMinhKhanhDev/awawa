from typing import Optional

from pydantic import BaseModel


class QuestionIn(BaseModel):
    subject_id: str
    topic_id: Optional[str] = None
    grade: int = 12
    difficulty: str = "váº­n dá»¥ng"
    qtype: str = "trac_nghiem"
    content: str
    options: list = []
    correct_answer: str = ""
    explanation: str = ""
    score: float = 1
    image_url: str = ""
    code: str = ""
    tags: list = []
class TopicUpdateIn(BaseModel):
    name: str = ""
    description: str = ""
    grade: Optional[int] = None
class LessonUpdateIn(BaseModel):
    title: str = ""
    content: Optional[str] = None
    idx: Optional[int] = None
    required: Optional[int] = None
    advanced: Optional[int] = None
class MaterialIn(BaseModel):
    subject_id: str = ""
    topic_id: Optional[str] = None
    title: str = ""
    description: str = ""
    file_url: str = ""
    file_type: str = ""
    grade: int = 12
class ForgotIn(BaseModel):
    email: str = ""
class ResetPasswordIn(BaseModel):
    email: str = ""
    code: str = ""
    new_password: str = ""
class ExamInShuffle(BaseModel):
    shuffle_q: Optional[int] = None
class NotificationReadIn(BaseModel):
    id: Optional[int] = None
class BulkStudentsIn(BaseModel):
    ids: list = []
    action: str = ""  # activate | deactivate | delete | set_role
    role: Optional[str] = None
class PermUpdateIn(BaseModel):
    role: str
    perms: dict = {}  # perm_key -> 0/1
class RoleIn(BaseModel):
    role: str = ""
class StudentIn(BaseModel):
    name: str
    class_name: str = ""
    team: str = ""
    note: str = ""
    team_id: Optional[int] = None
    active: Optional[int] = None
class SchoolYearIn(BaseModel):
    name: str
    start_date: str = ""
    end_date: str = ""
    is_current: int = 0
class GradeIn(BaseModel):
    school_year_id: Optional[int] = None
    name: str
    code: str = ""
class TeamIn(BaseModel):
    school_year_id: Optional[int] = None
    grade_id: Optional[int] = None
    subject_id: Optional[str] = None
    name: str
    description: str = ""
class TeamMemberIn(BaseModel):
    user_id: int
    member_role: str = "student"
class ActiveIn(BaseModel):
    active: int
class TopicIn(BaseModel):
    id: Optional[str] = None
    subject_id: str
    name: str
    grade: int = 12
    description: str = ""
class BulkIn(BaseModel):
    items: list
class ExamIn(BaseModel):
    title: str = "Äá»"
    mode: str = "practice"
    duration_min: int = 45
    question_ids: list = []
class SubmitIn(BaseModel):
    answers: list = []
    student_name: str = ""
    student_id: Optional[int] = None
    focus_exits: int = 0
    focus_log: list = []
class PreviewIn(BaseModel):
    text: str = ""
class RegisterIn(BaseModel):
    name: str = ""
    class_name: str = ""
    dob: Optional[str] = None
    gender: str = ""
    phone: str = ""
    email: str = ""
    password: str = ""
    teacher_code: str = ""
class LoginIn(BaseModel):
    login: str = ""
    password: str = ""
class ProfileIn(BaseModel):
    name: Optional[str] = None
    class_name: Optional[str] = None
    dob: Optional[str] = None
    gender: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
class PasswordIn(BaseModel):
    old_password: str = ""
    new_password: str = ""
class ResetIn(BaseModel):
    password: str = ""
class ClassCreateIn(BaseModel):
    name: str = ""
    join_code: str = ""
class ClassJoinIn(BaseModel):
    join_code: str = ""
class AssignmentCreateIn(BaseModel):
    class_id: int
    topic_id: Optional[str] = None
    title: str = ""
    description: str = ""
    deadline: Optional[str] = None
    questions: list = []
class AssignmentSubmitIn(BaseModel):
    answers: list = []
    files: list = []
class GradeIn(BaseModel):
    score: float
    feedback: str = ""
    question_scores: Optional[dict] = None
class LessonCreateIn(BaseModel):
    topic_id: str = ""
    title: str = ""
    content: str = ""
    idx: int = 1
    required: int = 1
    advanced: int = 0
class CompleteIn(BaseModel):
    undo: bool = False
