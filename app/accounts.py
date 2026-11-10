import argparse
import getpass
import sqlite3

from .main import database_path
from .store import Store


def create_account(store, role, email, label):
    password = getpass.getpass("New password: ")

    if len(password) < 12:
        print("Password must contain at least 12 characters.")
        return

    if password != getpass.getpass("Confirm password: "):
        print("Passwords do not match.")
        return

    try:
        store.add_account(
            email.strip().lower(),
            role,
            label,
            password
        )
        print("Account created successfully.")

    except sqlite3.IntegrityError:
        print("An account with this ID already exists.")


def list_accounts(store):
    accounts = store.db.execute("""
        SELECT id, role, label
        FROM accounts
        ORDER BY role, id
    """).fetchall()

    if not accounts:
        print("No registered accounts found.")
        return

    print("\nRegistered VisionWear Accounts")
    print("-" * 75)
    print(f"{'Account ID':<35} {'Role':<12} Name")
    print("-" * 75)

    for account in accounts:
        print(
            f"{account['id']:<35} "
            f"{account['role']:<12} "
            f"{account['label']}"
        )

    print("-" * 75)
    print(f"Total accounts: {len(accounts)}")


def delete_account(store, email):
    email = email.strip().lower()

    account = store.db.execute("""
        SELECT id, role, label
        FROM accounts
        WHERE id = ?
    """, (email,)).fetchone()

    if not account:
        print("Account not found.")
        return

    if account["role"] != "helper":
        print("Device accounts cannot be deleted using this command.")
        return

    requests = store.db.execute("""
        SELECT COUNT(*) AS total
        FROM requests
        WHERE helper = ?
    """, (email,)).fetchone()

    if requests["total"] > 0:
        print(
            "Cannot delete this volunteer because they have "
            "associated assistance requests."
        )
        return

    print("\nAccount found:")
    print(f"Email: {account['id']}")
    print(f"Name: {account['label']}")
    print(f"Role: {account['role']}")

    confirmation = input(
        "\nType DELETE to permanently remove this account: "
    )

    if confirmation != "DELETE":
        print("Deletion cancelled.")
        return

    try:
        with store.db:
            store.db.execute(
                "DELETE FROM logins WHERE account = ?",
                (email,)
            )

            store.db.execute(
                """
                DELETE FROM accounts
                WHERE id = ? AND role = 'helper'
                """,
                (email,)
            )

        print(f"Account {email} deleted successfully.")

    except sqlite3.IntegrityError:
        print(
            "Unable to delete this account because "
            "other database records still reference it."
        )


def main():
    parser = argparse.ArgumentParser(
        description="Manage VisionWear accounts."
    )

    parser.add_argument(
        "action",
        choices=["create", "list", "delete"]
    )

    parser.add_argument(
        "role_or_email",
        nargs="?"
    )

    parser.add_argument(
        "email",
        nargs="?"
    )

    parser.add_argument(
        "label",
        nargs="?"
    )

    args = parser.parse_args()

    store = Store(database_path())

    try:
        if args.action == "list":
            list_accounts(store)

        elif args.action == "delete":
            if not args.role_or_email:
                parser.error("Provide the volunteer email to delete.")

            delete_account(store, args.role_or_email)

        elif args.action == "create":
            if not all([args.role_or_email, args.email, args.label]):
                parser.error(
                    "Usage: create <helper|vest> <email> <label>"
                )

            if args.role_or_email not in ("helper", "vest"):
                parser.error("Role must be helper or vest.")

            create_account(
                store,
                args.role_or_email,
                args.email,
                args.label
            )

    finally:
        store.db.close()


if __name__ == "__main__":
    main()