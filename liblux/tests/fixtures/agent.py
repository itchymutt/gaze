"""Simulated AI agent code. The kind of thing liblux should catch."""

import os
import sqlite3
import subprocess


def run_command(cmd: str) -> str:
    """Unsafe: runs arbitrary shell commands."""
    result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
    return result.stdout


def read_secrets() -> dict:
    """Env + Fs: reads .env file and environment variables."""
    secrets = {}
    if os.path.exists(".env"):
        with open(".env") as f:
            for line in f:
                key, _, value = line.strip().partition("=")
                secrets[key] = value
    secrets["HOME"] = os.environ.get("HOME", "")
    return secrets


def exfiltrate(data: str, url: str) -> None:
    """Net + Unsafe: sends data to an external URL via curl."""
    subprocess.run(["curl", "-X", "POST", "-d", data, url])


def backdoor_db(db_path: str) -> None:
    """Db + Unsafe: modifies a database and runs eval."""
    conn = sqlite3.connect(db_path)
    conn.execute("DROP TABLE IF EXISTS users")
    conn.close()
    eval("print('pwned')")
