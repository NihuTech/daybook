# Daybook

A daily planner: habit tasks, focus timer, exams, notes, reminders and friends.

## Backend setup

Requires Python 3.12 or newer.

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
export DAYBOOK_SECRET="$(python -c 'import secrets; print(secrets.token_hex(32))')"
uvicorn main:app --reload
```

- API runs at http://127.0.0.1:8000
- Interactive docs: http://127.0.0.1:8000/docs
- The SQLite database `daybook.db` is created automatically in `backend/` (not committed).
- Run uvicorn from the `backend` folder, or it will create a second empty database elsewhere.
- Restarting with a new `DAYBOOK_SECRET` invalidates old login tokens.
- If you change a model, delete `daybook.db` and restart. Tables are only created, never altered.

## Authentication

1. `POST /register` with name, email and password.
2. `POST /login` with email and password. It returns an `access_token`.
3. Send it on every other request as the header `Authorization: Bearer <access_token>`.

Tokens last 24 hours. Missing or invalid tokens get `401`.

## Endpoints

All endpoints except health, hello, register and login need the `Authorization` header.

| Method | Path | Description |
|---|---|---|
| GET | /health | Server check |
| GET | /hello/{name} | Test greeting |
| POST | /register | Create an account |
| POST | /login | Get an access token |
| GET | /me | Current user |
| POST | /tasks | Create a task (name, label, kind, target) |
| GET | /tasks | List your tasks |
| POST | /tasks/{id}/complete | Mark done for a day (day defaults to today, amount) |
| POST | /focus-sessions | Save a focus session (seconds, optional task_id) |
| GET | /focus-sessions/today | Today's focus total, goal and percent |
| GET | /summary/today | Home screen data: tasks with done state, focus, next exam |
| POST | /exams | Create an exam (name, day) |
| GET | /exams | List exams, soonest first, with days_left |
| DELETE | /exams/{id} | Delete an exam |
| POST | /notes | Create a note (text up to 160 characters, color) |
| GET | /notes | List notes |
| PATCH | /notes/{id} | Edit text and/or color |
| DELETE | /notes/{id} | Delete a note |
| POST | /reminders | Create a reminder (text, remind_at without timezone) |
| GET | /reminders | List reminders |
| GET | /reminders/due | Reminders that are due and not yet fired |
| POST | /reminders/{id}/fire | Mark a reminder as fired |
| DELETE | /reminders/{id} | Delete a reminder |
| POST | /friends/requests | Send a friend request (email) |
| GET | /friends/requests | Incoming pending requests |
| POST | /friends/requests/{id}/accept | Accept a request (receiver only) |
| GET | /friends | List accepted friends |
| DELETE | /friends/{id} | Remove a friend, decline or cancel a request |

## Status codes

`201` created, `204` deleted, `401` not logged in, `404` not found or not yours,
`409` duplicate, `422` invalid input.