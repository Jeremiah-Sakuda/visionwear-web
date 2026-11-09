import hashlib
import hmac
import secrets
import sqlite3
import time
from pathlib import Path

LIVE = ("waiting", "connecting", "active", "audio_only")
PAIRED = LIVE[1:]


def password_hash(password, salt):
    return hashlib.scrypt(password.encode(), salt=salt, n=2**14, r=8, p=1).hex()


def token_hash(token):
    return hashlib.sha256(token.encode()).hexdigest()


class Store:
    def __init__(self, path):
        Path(path).parent.mkdir(parents=True, exist_ok=True)
        self.db = sqlite3.connect(path)
        self.db.row_factory = sqlite3.Row
        self.db.executescript("""
            PRAGMA journal_mode = WAL;
            PRAGMA foreign_keys = ON;
            CREATE TABLE IF NOT EXISTS accounts (
                id TEXT PRIMARY KEY, role TEXT NOT NULL CHECK(role IN ('helper','vest')),
                label TEXT NOT NULL, salt BLOB NOT NULL, password TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS logins (
                token TEXT PRIMARY KEY, account TEXT NOT NULL REFERENCES accounts(id),
                expires REAL NOT NULL
            );
            CREATE TABLE IF NOT EXISTS requests (
                id TEXT PRIMARY KEY, vest TEXT NOT NULL REFERENCES accounts(id),
                helper TEXT REFERENCES accounts(id), state TEXT NOT NULL,
                created REAL NOT NULL, accepted REAL, ended REAL, reason TEXT
            );
            CREATE UNIQUE INDEX IF NOT EXISTS one_request_per_vest ON requests(vest)
                WHERE state IN ('waiting','connecting','active','audio_only');
            CREATE UNIQUE INDEX IF NOT EXISTS one_session_per_helper ON requests(helper)
                WHERE state IN ('connecting','active','audio_only');
        """)

    def add_account(self, name, role, label, password):
        salt = secrets.token_bytes(16)
        with self.db:
            self.db.execute("INSERT INTO accounts VALUES (?, ?, ?, ?, ?)",
                            (name, role, label, salt, password_hash(password, salt)))

    def login(self, name, password):
        row = self.db.execute("SELECT * FROM accounts WHERE id=?", (name,)).fetchone()
        digest = password_hash(password, row["salt"] if row else bytes(16))
        if not row or not hmac.compare_digest(digest, row["password"]):
            return None
        token = secrets.token_urlsafe(32)
        with self.db:
            self.db.execute("DELETE FROM logins WHERE expires<=?", (time.time(),))
            self.db.execute("INSERT INTO logins VALUES (?, ?, ?)",
                            (token_hash(token), name, time.time() + 8 * 3600))
        return token

    def identity(self, token):
        if not token:
            return None
        row = self.db.execute("""
            SELECT a.id, a.role, a.label FROM logins l JOIN accounts a ON l.account=a.id
            WHERE l.token=? AND l.expires>?
        """, (token_hash(token), time.time())).fetchone()
        return dict(row) if row else None

    def logout(self, token):
        if token:
            with self.db:
                self.db.execute("DELETE FROM logins WHERE token=?", (token_hash(token),))

    def request(self, request_id):
        row = self.db.execute("""
            SELECT r.*, a.label AS vest_label FROM requests r JOIN accounts a ON r.vest=a.id
            WHERE r.id=?
        """, (request_id,)).fetchone()
        return dict(row) if row else None

    def current(self, identity):
        column = "vest" if identity["role"] == "vest" else "helper"
        row = self.db.execute(f"""
            SELECT id FROM requests WHERE {column}=? AND state IN (?,?,?,?)
        """, (identity["id"], *LIVE)).fetchone()
        return self.request(row["id"]) if row else None

    def pending(self):
        return [self.request(r["id"]) for r in self.db.execute(
            "SELECT id FROM requests WHERE state='waiting' ORDER BY created"
        )]

    def open_requests(self):
        return [self.request(r["id"]) for r in self.db.execute(
            "SELECT id FROM requests WHERE state IN (?,?,?,?)", LIVE
        )]

    def create(self, request_id, vest):
        with self.db:
            self.db.execute("INSERT INTO requests (id, vest, state, created) VALUES (?, ?, 'waiting', ?)",
                            (request_id, vest, time.time()))
        return self.request(request_id)

    def accept(self, request_id, helper):
        try:
            with self.db:
                changed = self.db.execute("""
                    UPDATE requests SET helper=?, state='connecting', accepted=?
                    WHERE id=? AND state='waiting'
                """, (helper, time.time(), request_id)).rowcount
        except sqlite3.IntegrityError:
            return None
        return self.request(request_id) if changed else None

    def set_media(self, request_id, state):
        with self.db:
            self.db.execute("""
                UPDATE requests SET state=? WHERE id=? AND state IN (?,?,?)
            """, (state, request_id, *PAIRED))

    def end(self, request_id, reason):
        with self.db:
            changed = self.db.execute("""
                UPDATE requests SET state='ended', ended=?, reason=?
                WHERE id=? AND state IN (?,?,?,?)
            """, (time.time(), reason, request_id, *LIVE)).rowcount
        return self.request(request_id) if changed else None
