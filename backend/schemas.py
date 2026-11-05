from datetime import date, datetime
from pydantic import BaseModel, EmailStr, Field


class UserCreate(BaseModel):
    name: str
    email: EmailStr
    password: str


class UserOut(BaseModel):
    id: int
    name: str
    email: EmailStr
    photo: str | None = None
    daily_goal_min: int

    model_config = {"from_attributes": True}

class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"

class TaskCreate(BaseModel):
    name: str
    label: str = "label_1"
    kind: str = "check"
    target: int = 1


class TaskOut(BaseModel):
    id: int
    name: str
    label: str
    kind: str
    target: int
    created_at: datetime

    model_config = {"from_attributes": True}


class CompleteRequest(BaseModel):
    day: date | None = None  # defaults to today
    amount: int = 1


class CompletionOut(BaseModel):
    id: int
    task_id: int
    day: date
    amount: int

    model_config = {"from_attributes": True}    

class FocusSessionCreate(BaseModel):
    seconds: int = Field(gt=0, le=86400)
    task_id: int | None = None
    day: date | None = None  # defaults to today


class FocusSessionOut(BaseModel):
    id: int
    task_id: int | None
    day: date
    seconds: int

    model_config = {"from_attributes": True}


class FocusToday(BaseModel):
    day: date
    total_seconds: int
    goal_seconds: int
    percent: float    

class TaskToday(BaseModel):
    id: int
    name: str
    label: str
    kind: str
    target: int
    amount_today: int
    done: bool


class SummaryToday(BaseModel):
    day: date
    tasks: list[TaskToday]
    tasks_done: int
    tasks_total: int
    focus: FocusToday    

class ExamCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    day: date


class ExamOut(BaseModel):
    id: int
    name: str
    day: date
    days_left: int    