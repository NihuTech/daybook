from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError
from fastapi import Depends, FastAPI, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

import models
from auth import create_access_token, get_current_user
from database import Base, engine, get_db
from schemas import LoginRequest, Token, UserCreate, UserOut
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