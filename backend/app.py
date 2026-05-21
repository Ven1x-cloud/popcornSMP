from __future__ import annotations

import os
import secrets
import sqlite3
from datetime import datetime, timedelta, timezone
from functools import wraps
from pathlib import Path
import re

from flask import Flask, jsonify, request
from flask_cors import CORS
from werkzeug.security import check_password_hash, generate_password_hash

BASE_DIR = Path(__file__).resolve().parent
DATABASE_PATH = BASE_DIR / "app.db"
USERNAME_RE = re.compile(r"^[A-Za-z0-9_]{3,20}$")

app = Flask(__name__)
CORS(app, resources={r"/api/*": {"origins": "*"}})


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def parse_iso_datetime(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        dt = datetime.fromisoformat(value)
    except ValueError:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt


def get_db() -> sqlite3.Connection:
    connection = sqlite3.connect(DATABASE_PATH)
    connection.row_factory = sqlite3.Row
    return connection


def ensure_column(db: sqlite3.Connection, table: str, column: str, definition: str) -> None:
    columns = {row["name"] for row in db.execute(f"PRAGMA table_info({table})").fetchall()}
    if column not in columns:
        db.execute(f"ALTER TABLE {table} ADD COLUMN {column} {definition}")


def find_user_by_username(db: sqlite3.Connection, username: str) -> sqlite3.Row | None:
    return db.execute(
        "SELECT * FROM users WHERE LOWER(username) = LOWER(?)",
        (username,),
    ).fetchone()


def find_user_by_link_code(db: sqlite3.Connection, code: str) -> sqlite3.Row | None:
    return db.execute(
        "SELECT * FROM users WHERE link_code = ?",
        (code,),
    ).fetchone()


def validate_username(username: str) -> str | None:
    if not USERNAME_RE.match(username):
        return "Gebruikersnaam moet 3-20 tekens zijn en alleen letters, cijfers of _ bevatten."
    return None


def validate_password(password: str) -> str | None:
    if len(password) < 8:
        return "Wachtwoord moet minimaal 8 tekens zijn."
    return None


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

    ensure_column(db, "users", "minecraft_uuid", "TEXT")
    ensure_column(db, "users", "minecraft_username", "TEXT")
    ensure_column(db, "users", "link_code", "TEXT")
    ensure_column(db, "users", "link_code_expires_at", "TEXT")

    state = db.execute("SELECT id FROM server_state WHERE id = 1").fetchone()
    if not state:
        db.execute(
            "INSERT INTO server_state (id, status, updated_at, updated_by) VALUES (1, ?, ?, NULL)",
            ("offline", utc_now()),
        )

    owner_username = os.getenv("OWNER_USERNAME", "owner")
    owner_password = os.getenv("OWNER_PASSWORD", "changeme123!")
    owner = find_user_by_username(db, owner_username)

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
        "minecraft_username": row["minecraft_username"],
        "minecraft_uuid": row["minecraft_uuid"],
        "linked": bool(row["minecraft_uuid"]),
        "link_code": row["link_code"],
        "link_code_expires_at": row["link_code_expires_at"],
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



def require_plugin_secret(view_func):
    @wraps(view_func)
    def wrapper(*args, **kwargs):
        expected_secret = os.getenv("PLUGIN_SECRET", "dev-plugin-secret")
        provided_secret = request.headers.get("X-Plugin-Secret", "")

        if not provided_secret or provided_secret != expected_secret:
            return jsonify({"error": "Ongeldige plugin secret."}), 401
        return view_func(*args, **kwargs)

    return wrapper


@app.get("/")
def index():
    return jsonify({
        "name": "Popcorn SMP backend",
        "message": "Gebruik de /api routes voor auth en admin acties.",
    })


@app.get("/api/health")
def health():
    return jsonify({
        "ok": True,
        "message": "Backend werkt.",
        "time": utc_now(),
    })


@app.get("/api/check-username")
def check_username():
    username = (request.args.get("username") or "").strip()
    error = validate_username(username)

    if error:
        return jsonify({"ok": False, "available": False, "error": error}), 400

    db = get_db()
    existing = find_user_by_username(db, username)
    db.close()

    return jsonify({
        "ok": True,
        "available": existing is None,
        "message": "Gebruikersnaam is beschikbaar." if existing is None else "Gebruikersnaam bestaat al.",
    })


@app.post("/api/register")
def register():
    data = request.get_json(silent=True) or {}
    username = (data.get("username") or "").strip()
    password = data.get("password") or ""

    username_error = validate_username(username)
    if username_error:
        return jsonify({"error": username_error}), 400

    password_error = validate_password(password)
    if password_error:
        return jsonify({"error": password_error}), 400

    db = get_db()
    existing = find_user_by_username(db, username)
    if existing:
        db.close()
        return jsonify({"error": "Deze gebruikersnaam bestaat al."}), 409

    db.execute(
        """
        INSERT INTO users (
            username, password_hash, role, created_at,
            minecraft_uuid, minecraft_username, link_code, link_code_expires_at
        ) VALUES (?, ?, 'USER', ?, NULL, NULL, NULL, NULL)
        """,
        (username, generate_password_hash(password), utc_now()),
    )
    db.commit()
    user = find_user_by_username(db, username)
    db.close()

    return jsonify({
        "ok": True,
        "message": "Account aangemaakt. Je kunt nu inloggen.",
        "user": user_to_dict(user),
    }), 201


@app.post("/api/login")
def login():
    data = request.get_json(silent=True) or {}
    username = (data.get("username") or "").strip()
    password = data.get("password") or ""

    db = get_db()
    user = find_user_by_username(db, username)
    if not user or not check_password_hash(user["password_hash"], password):
        db.close()
        return jsonify({"error": "Gebruikersnaam of wachtwoord klopt niet."}), 401

    token = secrets.token_urlsafe(32)
    db.execute(
        "INSERT INTO tokens (user_id, token, created_at) VALUES (?, ?, ?)",
        (user["id"], token, utc_now()),
    )
    db.commit()
    db.close()

    return jsonify({
        "ok": True,
        "message": f"Welkom terug, {user['username']}!",
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


@app.post("/api/me/link-code")
@require_auth
def create_link_code(user):
    code = f"POP-{secrets.randbelow(900000) + 100000}"
    expires_at = (datetime.now(timezone.utc) + timedelta(minutes=15)).isoformat()

    db = get_db()
    db.execute(
        "UPDATE users SET link_code = ?, link_code_expires_at = ? WHERE id = ?",
        (code, expires_at, user["id"]),
    )
    db.commit()
    updated = db.execute("SELECT * FROM users WHERE id = ?", (user["id"],)).fetchone()
    db.close()

    return jsonify({
        "ok": True,
        "message": "Nieuwe link-code aangemaakt.",
        "user": user_to_dict(updated),
    })


@app.post("/api/me/unlink")
@require_auth
def unlink_me(user):
    db = get_db()
    db.execute(
        """
        UPDATE users
        SET minecraft_uuid = NULL,
            minecraft_username = NULL,
            link_code = NULL,
            link_code_expires_at = NULL
        WHERE id = ?
        """,
        (user["id"],),
    )
    db.commit()
    updated = db.execute("SELECT * FROM users WHERE id = ?", (user["id"],)).fetchone()
    db.close()

    return jsonify({
        "ok": True,
        "message": "Minecraft account losgekoppeld.",
        "user": user_to_dict(updated),
    })


@app.delete("/api/me")
@require_auth
def delete_me(user):
    if user["role"] == "OWNER":
        return jsonify({"error": "Het OWNER account kan niet verwijderd worden."}), 403

    db = get_db()
    db.execute("DELETE FROM tokens WHERE user_id = ?", (user["id"],))
    db.execute("DELETE FROM command_log WHERE user_id = ?", (user["id"],))
    db.execute("DELETE FROM users WHERE id = ?", (user["id"],))
    db.commit()
    db.close()

    return jsonify({"ok": True, "message": "Je account is verwijderd."})


@app.get("/api/plugin/health")
@require_plugin_secret
def plugin_health():
    return jsonify({"ok": True, "message": "Plugin auth werkt.", "time": utc_now()})


@app.post("/api/plugin/link")
@require_plugin_secret
def plugin_link():
    data = request.get_json(silent=True) or {}
    code = (data.get("code") or "").strip().upper()
    minecraft_username = (data.get("minecraft_username") or "").strip()
    minecraft_uuid = (data.get("minecraft_uuid") or "").strip()

    if not code or not minecraft_username or not minecraft_uuid:
        return jsonify({"error": "code, minecraft_username en minecraft_uuid zijn verplicht."}), 400

    db = get_db()
    user = find_user_by_link_code(db, code)
    if not user:
        db.close()
        return jsonify({"error": "Link-code niet gevonden."}), 404

    expires_at = parse_iso_datetime(user["link_code_expires_at"])
    if not expires_at or expires_at < datetime.now(timezone.utc):
        db.close()
        return jsonify({"error": "Link-code is verlopen."}), 410

    taken = db.execute(
        "SELECT id, username FROM users WHERE minecraft_uuid = ? AND id != ?",
        (minecraft_uuid, user["id"]),
    ).fetchone()
    if taken:
        db.close()
        return jsonify({"error": f"Minecraft account is al gekoppeld aan {taken['username']}."}), 409

    db.execute(
        """
        UPDATE users
        SET minecraft_uuid = ?,
            minecraft_username = ?,
            link_code = NULL,
            link_code_expires_at = NULL
        WHERE id = ?
        """,
        (minecraft_uuid, minecraft_username, user["id"]),
    )
    db.commit()
    updated = db.execute("SELECT * FROM users WHERE id = ?", (user["id"],)).fetchone()
    db.close()

    return jsonify({
        "ok": True,
        "message": f"{minecraft_username} gekoppeld aan {updated['username']}",
        "user": user_to_dict(updated),
    })


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
    target = find_user_by_username(db, username)
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
