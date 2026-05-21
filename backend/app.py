from __future__ import annotations

import os
import secrets
import sqlite3
from datetime import datetime, timezone
from functools import wraps
from pathlib import Path

from flask import Flask, jsonify, request
from flask_cors import CORS
from werkzeug.security import check_password_hash, generate_password_hash

BASE_DIR = Path(__file__).resolve().parent
DATABASE_PATH = BASE_DIR / "app.db"

app = Flask(__name__)
CORS(app, resources={r"/api/*": {"origins": "*"}})


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def get_db() -> sqlite3.Connection:
    connection = sqlite3.connect(DATABASE_PATH)
    connection.row_factory = sqlite3.Row
    return connection


def init_db() -> None:
    db = get_db()
    db.executescript(
        """
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT 'USER',
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS tokens (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            token TEXT UNIQUE NOT NULL,
            created_at TEXT NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users (id)
        );

        CREATE TABLE IF NOT EXISTS server_state (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            status TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            updated_by INTEGER
        );

        CREATE TABLE IF NOT EXISTS command_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            action TEXT NOT NULL,
            status_after TEXT NOT NULL,
            created_at TEXT NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users (id)
        );
        """
    )

    state = db.execute("SELECT id FROM server_state WHERE id = 1").fetchone()
    if not state:
        db.execute(
            "INSERT INTO server_state (id, status, updated_at, updated_by) VALUES (1, ?, ?, NULL)",
            ("offline", utc_now()),
        )

    owner_username = os.getenv("OWNER_USERNAME", "owner")
    owner_password = os.getenv("OWNER_PASSWORD", "changeme123!")
    owner = db.execute("SELECT id FROM users WHERE username = ?", (owner_username,)).fetchone()

    if not owner:
        db.execute(
            "INSERT INTO users (username, password_hash, role, created_at) VALUES (?, ?, 'OWNER', ?)",
            (owner_username, generate_password_hash(owner_password), utc_now()),
        )

    db.commit()
    db.close()



def user_to_dict(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"],
        "username": row["username"],
        "role": row["role"],
        "created_at": row["created_at"],
    }



def get_current_user() -> sqlite3.Row | None:
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        return None

    token = auth_header.split(" ", 1)[1].strip()
    if not token:
        return None

    db = get_db()
    user = db.execute(
        """
        SELECT users.*
        FROM tokens
        JOIN users ON users.id = tokens.user_id
        WHERE tokens.token = ?
        """,
        (token,),
    ).fetchone()
    db.close()
    return user



def require_auth(view_func):
    @wraps(view_func)
    def wrapper(*args, **kwargs):
        user = get_current_user()
        if not user:
            return jsonify({"error": "Niet ingelogd"}), 401
        return view_func(user, *args, **kwargs)

    return wrapper



def require_admin(view_func):
    @wraps(view_func)
    def wrapper(*args, **kwargs):
        user = get_current_user()
        if not user:
            return jsonify({"error": "Niet ingelogd"}), 401
        if user["role"] not in ("ADMIN", "OWNER"):
            return jsonify({"error": "Geen adminrechten"}), 403
        return view_func(user, *args, **kwargs)

    return wrapper


@app.get("/")
def index():
    return jsonify({
        "name": "SMP prototype backend",
        "message": "Gebruik /api/health om de API te testen."
    })


@app.get("/api/health")
def health():
    return jsonify({
        "ok": True,
        "message": "Backend werkt.",
        "time": utc_now(),
    })


@app.post("/api/register")
def register():
    data = request.get_json(silent=True) or {}
    username = (data.get("username") or "").strip()
    password = data.get("password") or ""

    if len(username) < 3:
        return jsonify({"error": "Gebruikersnaam moet minimaal 3 tekens zijn."}), 400
    if len(password) < 6:
        return jsonify({"error": "Wachtwoord moet minimaal 6 tekens zijn."}), 400

    db = get_db()
    existing = db.execute("SELECT id FROM users WHERE username = ?", (username,)).fetchone()
    if existing:
        db.close()
        return jsonify({"error": "Gebruikersnaam bestaat al."}), 409

    db.execute(
        "INSERT INTO users (username, password_hash, role, created_at) VALUES (?, ?, 'USER', ?)",
        (username, generate_password_hash(password), utc_now()),
    )
    db.commit()
    db.close()

    return jsonify({"ok": True, "message": "Account aangemaakt."}), 201


@app.post("/api/login")
def login():
    data = request.get_json(silent=True) or {}
    username = (data.get("username") or "").strip()
    password = data.get("password") or ""

    db = get_db()
    user = db.execute("SELECT * FROM users WHERE username = ?", (username,)).fetchone()
    if not user or not check_password_hash(user["password_hash"], password):
        db.close()
        return jsonify({"error": "Ongeldige login."}), 401

    token = secrets.token_urlsafe(32)
    db.execute(
        "INSERT INTO tokens (user_id, token, created_at) VALUES (?, ?, ?)",
        (user["id"], token, utc_now()),
    )
    db.commit()
    db.close()

    return jsonify({
        "ok": True,
        "token": token,
        "user": user_to_dict(user),
    })


@app.post("/api/logout")
@require_auth
def logout(user):
    auth_header = request.headers.get("Authorization", "")
    token = auth_header.split(" ", 1)[1].strip()
    db = get_db()
    db.execute("DELETE FROM tokens WHERE token = ?", (token,))
    db.commit()
    db.close()
    return jsonify({"ok": True, "message": "Uitgelogd."})


@app.get("/api/me")
@require_auth
def me(user):
    return jsonify({"ok": True, "user": user_to_dict(user)})


@app.get("/api/admin/server")
@require_admin
def admin_server(user):
    db = get_db()
    state = db.execute("SELECT * FROM server_state WHERE id = 1").fetchone()
    commands = db.execute(
        """
        SELECT command_log.id, users.username, users.role, command_log.action, command_log.status_after, command_log.created_at
        FROM command_log
        JOIN users ON users.id = command_log.user_id
        ORDER BY command_log.id DESC
        LIMIT 20
        """
    ).fetchall()
    db.close()

    return jsonify({
        "ok": True,
        "server": {
            "status": state["status"],
            "updated_at": state["updated_at"],
            "updated_by": state["updated_by"],
        },
        "commands": [dict(row) for row in commands],
        "viewer": user_to_dict(user),
    })


@app.post("/api/admin/server/action")
@require_admin
def admin_server_action(user):
    data = request.get_json(silent=True) or {}
    action = (data.get("action") or "").strip().lower()
    allowed = {"start", "stop", "restart"}

    if action not in allowed:
        return jsonify({"error": "Actie moet start, stop of restart zijn."}), 400

    status_map = {
        "start": "online",
        "stop": "offline",
        "restart": "online",
    }
    new_status = status_map[action]

    db = get_db()
    db.execute(
        "UPDATE server_state SET status = ?, updated_at = ?, updated_by = ? WHERE id = 1",
        (new_status, utc_now(), user["id"]),
    )
    db.execute(
        "INSERT INTO command_log (user_id, action, status_after, created_at) VALUES (?, ?, ?, ?)",
        (user["id"], action, new_status, utc_now()),
    )
    db.commit()

    state = db.execute("SELECT * FROM server_state WHERE id = 1").fetchone()
    db.close()

    return jsonify({
        "ok": True,
        "message": f"Actie '{action}' uitgevoerd.",
        "server": {
            "status": state["status"],
            "updated_at": state["updated_at"],
            "updated_by": state["updated_by"],
        },
    })


@app.post("/api/admin/promote")
@require_admin
def promote_user(user):
    data = request.get_json(silent=True) or {}
    username = (data.get("username") or "").strip()
    new_role = (data.get("role") or "").strip().upper()

    if user["role"] != "OWNER":
        return jsonify({"error": "Alleen OWNER mag rollen aanpassen."}), 403

    if new_role not in {"USER", "ADMIN", "OWNER"}:
        return jsonify({"error": "Ongeldige rol."}), 400

    db = get_db()
    target = db.execute("SELECT * FROM users WHERE username = ?", (username,)).fetchone()
    if not target:
        db.close()
        return jsonify({"error": "Gebruiker niet gevonden."}), 404

    db.execute("UPDATE users SET role = ? WHERE id = ?", (new_role, target["id"]))
    db.commit()
    updated = db.execute("SELECT * FROM users WHERE id = ?", (target["id"],)).fetchone()
    db.close()

    return jsonify({"ok": True, "user": user_to_dict(updated)})


if __name__ == "__main__":
    init_db()
    app.run(debug=True)
