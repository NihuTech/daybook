from datetime import date, datetime
from pydantic import BaseModel, EmailStr


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