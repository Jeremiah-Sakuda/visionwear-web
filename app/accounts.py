import argparse
import getpass

from .main import database_path
from .store import Store


def main():
    parser = argparse.ArgumentParser(description="Create a VisionWear account.")
    parser.add_argument("role", choices=("helper", "vest"))
    parser.add_argument("email")
    parser.add_argument("label")
    args = parser.parse_args()
    password = getpass.getpass("New password: ")
    if len(password) < 12 or password != getpass.getpass("Confirm password: "):
        parser.error("Use at least 12 characters and enter the same password twice.")
    store = Store(database_path())
    try:
        store.add_account(args.email.strip().lower(), args.role, args.label, password)
    finally:
        store.db.close()


if __name__ == "__main__":
    main()
