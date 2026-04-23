"""A module with mixed pure and effectful functions."""

import json
import os
from pathlib import Path

import requests


def fetch_data(url: str) -> dict:
    """Net effect: makes an HTTP request."""
    response = requests.get(url)
    return response.json()


def load_config(path: str) -> dict:
    """Fs effect: reads a file."""
    with open(path) as f:
        return json.load(f)


def get_api_key() -> str:
    """Env effect: reads environment variable."""
    return os.getenv("API_KEY", "")


def transform(data: dict) -> dict:
    """Pure: no effects."""
    return {
        "count": len(data.get("items", [])),
        "total": sum(item["value"] for item in data.get("items", [])),
    }


def save_report(path: str, data: dict) -> None:
    """Fs effect: writes a file."""
    Path(path).write_text(json.dumps(data))


def main():
    """Multiple effects: Env, Net, Fs, Console."""
    key = get_api_key()
    data = fetch_data(f"https://api.example.com/data?key={key}")
    result = transform(data)
    save_report("report.json", result)
    print(f"Saved {result['count']} items")
