from datetime import date, datetime

from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError
from fastapi import Depends, FastAPI, HTTPException
from sqlalchemy import and_, func, or_, select
from sqlalchemy.orm import Session

import models
from auth import create_access_token, get_current_user
from database import Base, engine, get_db
from schemas import (
    CompleteRequest, CompletionOut, ExamCreate, ExamOut, FocusSessionCreate,
    FocusSessionOut, FocusToday, FriendRequestCreate, FriendshipOut, FriendUser,
    LoginRequest, NoteCreate, NoteOut, NoteUpdate, ReminderCreate, ReminderOut,
    SummaryToday, TaskCreate, TaskOut, TaskToday, Token, UserCreate, UserOut,
)

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


def build_focus_today(user: models.User, db: Session) -> FocusToday:
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


@app.get("/focus-sessions/today", response_model=FocusToday)
def focus_today(
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return build_focus_today(user, db)


def exam_out(exam: models.Exam) -> ExamOut:
    return ExamOut(
        id=exam.id,
        name=exam.name,
        day=exam.day,
        days_left=(exam.day - date.today()).days,
    )


@app.get("/summary/today", response_model=SummaryToday)
def summary_today(
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    today = date.today()
    tasks = db.scalars(
        select(models.Task).where(models.Task.user_id == user.id)
    ).all()

    completions = db.scalars(
        select(models.Completion).where(
            models.Completion.task_id.in_([t.id for t in tasks]),
            models.Completion.day == today,
        )
    ).all()
    amount_by_task = {c.task_id: c.amount for c in completions}

    items = []
    for t in tasks:
        amount = amount_by_task.get(t.id, 0)
        items.append(
            TaskToday(
                id=t.id,
                name=t.name,
                label=t.label,
                kind=t.kind,
                target=t.target,
                amount_today=amount,
                done=amount >= t.target,
            )
        )

    next_exam = db.scalars(
        select(models.Exam)
        .where(models.Exam.user_id == user.id, models.Exam.day >= today)
        .order_by(models.Exam.day)
        .limit(1)
    ).first()

    return SummaryToday(
        day=today,
        tasks=items,
        tasks_done=sum(1 for i in items if i.done),
        tasks_total=len(items),
        focus=build_focus_today(user, db),
        next_exam=exam_out(next_exam) if next_exam else None,
    )


@app.post("/exams", response_model=ExamOut, status_code=201)
def create_exam(
    data: ExamCreate,
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    exam = models.Exam(user_id=user.id, name=data.name, day=data.day)
    db.add(exam)
    db.commit()
    db.refresh(exam)
    return exam_out(exam)


@app.get("/exams", response_model=list[ExamOut])
def list_exams(
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    exams = db.scalars(
        select(models.Exam)
        .where(models.Exam.user_id == user.id)
        .order_by(models.Exam.day)
    ).all()
    return [exam_out(e) for e in exams]


@app.delete("/exams/{exam_id}", status_code=204)
def delete_exam(
    exam_id: int,
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    exam = db.get(models.Exam, exam_id)
    if exam is None or exam.user_id != user.id:
        raise HTTPException(status_code=404, detail="Exam not found")
    db.delete(exam)
    db.commit()

def get_own_note(note_id: int, user: models.User, db: Session) -> models.Note:
    note = db.get(models.Note, note_id)
    if note is None or note.user_id != user.id:
        raise HTTPException(status_code=404, detail="Note not found")
    return note


@app.post("/notes", response_model=NoteOut, status_code=201)
def create_note(
    data: NoteCreate,
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    note = models.Note(user_id=user.id, text=data.text, color=data.color)
    db.add(note)
    db.commit()
    db.refresh(note)
    return note


@app.get("/notes", response_model=list[NoteOut])
def list_notes(
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return db.scalars(
        select(models.Note).where(models.Note.user_id == user.id)
    ).all()


@app.patch("/notes/{note_id}", response_model=NoteOut)
def update_note(
    note_id: int,
    data: NoteUpdate,
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    note = get_own_note(note_id, user, db)
    for field, value in data.model_dump(exclude_unset=True).items():
        if value is not None:
            setattr(note, field, value)
    db.commit()
    db.refresh(note)
    return note


@app.delete("/notes/{note_id}", status_code=204)
def delete_note(
    note_id: int,
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    note = get_own_note(note_id, user, db)
    db.delete(note)
    db.commit()    

def get_own_reminder(
    reminder_id: int, user: models.User, db: Session
) -> models.Reminder:
    reminder = db.get(models.Reminder, reminder_id)
    if reminder is None or reminder.user_id != user.id:
        raise HTTPException(status_code=404, detail="Reminder not found")
    return reminder


@app.post("/reminders", response_model=ReminderOut, status_code=201)
def create_reminder(
    data: ReminderCreate,
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    reminder = models.Reminder(
        user_id=user.id, text=data.text, remind_at=data.remind_at
    )
    db.add(reminder)
    db.commit()
    db.refresh(reminder)
    return reminder


@app.get("/reminders", response_model=list[ReminderOut])
def list_reminders(
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return db.scalars(
        select(models.Reminder)
        .where(models.Reminder.user_id == user.id)
        .order_by(models.Reminder.remind_at)
    ).all()


@app.get("/reminders/due", response_model=list[ReminderOut])
def due_reminders(
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return db.scalars(
        select(models.Reminder)
        .where(
            models.Reminder.user_id == user.id,
            models.Reminder.fired == False,  # noqa: E712
            models.Reminder.remind_at <= datetime.now(),
        )
        .order_by(models.Reminder.remind_at)
    ).all()


@app.post("/reminders/{reminder_id}/fire", response_model=ReminderOut)
def fire_reminder(
    reminder_id: int,
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    reminder = get_own_reminder(reminder_id, user, db)
    reminder.fired = True
    db.commit()
    db.refresh(reminder)
    return reminder


@app.delete("/reminders/{reminder_id}", status_code=204)
def delete_reminder(
    reminder_id: int,
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    reminder = get_own_reminder(reminder_id, user, db)
    db.delete(reminder)
    db.commit()    

def friendship_out(f: models.Friendship, me: models.User, db: Session) -> FriendshipOut:
    other_id = f.addressee_id if f.requester_id == me.id else f.requester_id
    other = db.get(models.User, other_id)
    return FriendshipOut(
        id=f.id, status=f.status, user=FriendUser.model_validate(other)
    )


@app.post("/friends/requests", response_model=FriendshipOut, status_code=201)
def send_friend_request(
    data: FriendRequestCreate,
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    other = db.scalar(select(models.User).where(models.User.email == data.email))
    if other is None:
        raise HTTPException(status_code=404, detail="No user with that email")
    if other.id == user.id:
        raise HTTPException(status_code=400, detail="You can't friend yourself")

    existing = db.scalar(
        select(models.Friendship).where(
            or_(
                and_(
                    models.Friendship.requester_id == user.id,
                    models.Friendship.addressee_id == other.id,
                ),
                and_(
                    models.Friendship.requester_id == other.id,
                    models.Friendship.addressee_id == user.id,
                ),
            )
        )
    )
    if existing:
        raise HTTPException(status_code=409, detail="Request or friendship already exists")

    f = models.Friendship(requester_id=user.id, addressee_id=other.id)
    db.add(f)
    db.commit()
    db.refresh(f)
    return friendship_out(f, user, db)


@app.get("/friends/requests", response_model=list[FriendshipOut])
def incoming_requests(
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    rows = db.scalars(
        select(models.Friendship).where(
            models.Friendship.addressee_id == user.id,
            models.Friendship.status == "pending",
        )
    ).all()
    return [friendship_out(f, user, db) for f in rows]


@app.post("/friends/requests/{friendship_id}/accept", response_model=FriendshipOut)
def accept_request(
    friendship_id: int,
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    f = db.get(models.Friendship, friendship_id)
    if f is None or f.addressee_id != user.id or f.status != "pending":
        raise HTTPException(status_code=404, detail="Request not found")
    f.status = "accepted"
    db.commit()
    db.refresh(f)
    return friendship_out(f, user, db)


@app.get("/friends", response_model=list[FriendshipOut])
def list_friends(
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    rows = db.scalars(
        select(models.Friendship).where(
            models.Friendship.status == "accepted",
            or_(
                models.Friendship.requester_id == user.id,
                models.Friendship.addressee_id == user.id,
            ),
        )
    ).all()
    return [friendship_out(f, user, db) for f in rows]


@app.delete("/friends/{friendship_id}", status_code=204)
def remove_friendship(
    friendship_id: int,
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    f = db.get(models.Friendship, friendship_id)
    if f is None or user.id not in (f.requester_id, f.addressee_id):
        raise HTTPException(status_code=404, detail="Friendship not found")
    db.delete(f)
    db.commit()    