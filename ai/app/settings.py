"""Environment for the AI service. Values come from the process env, then ai/.env (never committed)."""

import os
from pathlib import Path

from dotenv import load_dotenv

# override=False: variables already set (tests, docker, shell) win over the file
load_dotenv(Path(__file__).resolve().parent.parent / ".env", override=False)


def env(name: str, default: str = "") -> str:
    value = os.environ.get(name, "").strip()
    return value or default


def env_float(name: str, default: float) -> float:
    try:
        return float(env(name, str(default)))
    except ValueError:
        return default
