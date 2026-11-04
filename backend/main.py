from datetime import date
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError
from fastapi import Depends, FastAPI, HTTPException
from sqlalchemy import func, select
from schemas import (
    CompleteRequest, CompletionOut, FocusSessionCreate, FocusSessionOut,
    FocusToday, LoginRequest, TaskCreate, TaskOut, Token, UserCreate, UserOut,
)
from sqlalchemy.orm import Session

import models
from auth import create_access_token, get_current_user
from database import Base, engine, get_db
app = FastAPI(title="Daybook API")
Base.metadata.create_all(engine)

ph = PasswordHasher()


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/hello/{name}")
def hello(name: str):
    return {"message": f"Hello, {name}"}


@app.post("/register", response_model=UserOut, status_code=201)
def register(data: UserCreate, db: Session = Depends(get_db)):
    existing = db.scalar(select(models.User).where(models.User.email == data.email))
    if existing:
        raise HTTPException(status_code=409, detail="Email already registered")

    user = models.User(
        name=data.name,
        email=data.email,
        password_hash=ph.hash(data.password),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user

@app.post("/login", response_model=Token)
def login(data: LoginRequest, db: Session = Depends(get_db)):
    user = db.scalar(select(models.User).where(models.User.email == data.email))
    invalid = HTTPException(status_code=401, detail="Invalid email or password")
    if user is None:
        raise invalid
    try:
        ph.verify(user.password_hash, data.password)
    except VerifyMismatchError:
        raise invalid
    return Token(access_token=create_access_token(user.id))


@app.get("/me", response_model=UserOut)
def me(user: models.User = Depends(get_current_user)):
    return user

@app.post("/tasks", response_model=TaskOut, status_code=201)
def create_task(
    data: TaskCreate,
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    task = models.Task(user_id=user.id, **data.model_dump())
    db.add(task)
    db.commit()
    db.refresh(task)
    return task


@app.get("/tasks", response_model=list[TaskOut])
def list_tasks(
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return db.scalars(
        select(models.Task).where(models.Task.user_id == user.id)
    ).all()


@app.post("/tasks/{task_id}/complete", response_model=CompletionOut)
def complete_task(
    task_id: int,
    data: CompleteRequest,
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    task = db.get(models.Task, task_id)
    if task is None or task.user_id != user.id:
        raise HTTPException(status_code=404, detail="Task not found")

    day = data.day or date.today()
    completion = db.scalar(
        select(models.Completion).where(
            models.Completion.task_id == task_id,
            models.Completion.day == day,
        )
    )
    if completion:
        completion.amount = data.amount
    else:
        completion = models.Completion(task_id=task_id, day=day, amount=data.amount)
        db.add(completion)
    db.commit()
    db.refresh(completion)
    return completion

@app.post("/focus-sessions", response_model=FocusSessionOut, status_code=201)
def create_focus_session(
    data: FocusSessionCreate,
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if data.task_id is not None:
        task = db.get(models.Task, data.task_id)
        if task is None or task.user_id != user.id:
            raise HTTPException(status_code=404, detail="Task not found")

    session = models.FocusSession(
        user_id=user.id,
        task_id=data.task_id,
        day=data.day or date.today(),
        seconds=data.seconds,
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    return session


@app.get("/focus-sessions/today", response_model=FocusToday)
def focus_today(
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    today = date.today()
    total = db.scalar(
        select(func.coalesce(func.sum(models.FocusSession.seconds), 0)).where(
            models.FocusSession.user_id == user.id,
            models.FocusSession.day == today,
        )
    )
    goal = user.daily_goal_min * 60
    return FocusToday(
        day=today,
        total_seconds=total,
        goal_seconds=goal,
        percent=round(total / goal * 100, 1) if goal else 0.0,
    )