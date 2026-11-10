import argparse
import sqlite3

from app.config import database_path


def list_users(db):
    users = db.execute(
        """
        SELECT id, label
        FROM accounts
        WHERE role = 'helper'
        ORDER BY id
        """
    ).fetchall()

    if not users:
        print("No registered volunteers found.")
        return

    print("\nRegistered VisionWear Volunteers")
    print("-" * 65)
    print(f"{'Email':<40} Name")
    print("-" * 65)

    for email, name in users:
        print(f"{email:<40} {name}")


def delete_user(db, email):
    email = email.strip().lower()

    user = db.execute(
        """
        SELECT id, label
        FROM accounts
        WHERE id = ? AND role = 'helper'
        """,
        (email,)
    ).fetchone()

    if not user:
        print("Volunteer not found.")
        return

    confirmation = input(
        f"Delete volunteer {user[1]} ({email})? Type DELETE to confirm: "
    )

    if confirmation != "DELETE":
        print("Deletion cancelled.")
        return

    try:
        with db:
            db.execute("DELETE FROM logins WHERE account = ?", (email,))
            db.execute(
                "DELETE FROM accounts WHERE id = ? AND role = 'helper'",
                (email,)
            )

        print(f"Volunteer {email} deleted successfully.")

    except sqlite3.IntegrityError:
        print(
            "Cannot delete this volunteer because other records "
            "still reference the account. No changes were committed."
        )


def main():
    parser = argparse.ArgumentParser(
        description="Manage VisionWear volunteer accounts."
    )

    parser.add_argument(
        "action",
        choices=["list", "delete"]
    )

    parser.add_argument(
        "email",
        nargs="?"
    )

    args = parser.parse_args()

    if args.action == "delete" and not args.email:
        parser.error("An email address is required for deletion.")

    db = sqlite3.connect(database_path())
    db.execute("PRAGMA foreign_keys = ON")

    try:
        if args.action == "list":
            list_users(db)

        elif args.action == "delete":
            delete_user(db, args.email)

    finally:
        db.close()


if __name__ == "__main__":
    main()