from __future__ import annotations

import os
from pathlib import Path
from urllib.parse import urlparse

BASE_DIR = Path(__file__).resolve().parent.parent
PROJECT_DIR = BASE_DIR.parent


def _load_env_file(path: Path) -> None:
    if not path.exists():
        return
    for raw_line in path.read_text().splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        key, _, value = line.partition("=")
        if not key:
            continue
        os.environ.setdefault(key, value)


for env_path in (PROJECT_DIR / ".env", BASE_DIR / ".env"):
    _load_env_file(env_path)


def _bool_env(name: str, default: bool = False) -> bool:
    value = os.environ.get(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def _database_from_url(url: str) -> dict[str, str | Path]:
    parsed = urlparse(url)
    scheme = parsed.scheme
    if scheme in {"sqlite", ""}:
        if parsed.path and parsed.path != "/":
            name = PROJECT_DIR / parsed.path.lstrip("/")
        else:
            name = PROJECT_DIR / "db.sqlite3"
        return {"ENGINE": "django.db.backends.sqlite3", "NAME": name}
    if scheme in {"postgres", "postgresql"}:
        return {
            "ENGINE": "django.db.backends.postgresql",
            "NAME": parsed.path.lstrip("/"),
            "USER": parsed.username or "",
            "PASSWORD": parsed.password or "",
            "HOST": parsed.hostname or "",
            "PORT": str(parsed.port or ""),
        }
    raise ValueError(f"Unsupported DATABASE_URL scheme: {scheme}")


SECRET_KEY = os.environ.get("SECRET_KEY", "dev-insecure-change-me")
DEBUG = _bool_env("DEBUG", default=False)
ALLOWED_HOSTS = [
    host.strip()
    for host in os.environ.get("ALLOWED_HOSTS", "localhost,127.0.0.1").split(",")
    if host.strip()
]

LANGUAGE_CODE = os.environ.get("LANGUAGE_CODE", "cs")
TIME_ZONE = os.environ.get("TIME_ZONE", "Europe/Prague")
USE_I18N = True
USE_TZ = True

DATABASE_URL = os.environ.get("DATABASE_URL", "sqlite:///db.sqlite3")
DATABASES = {"default": _database_from_url(DATABASE_URL)}

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "core",
    "trainers",
    "trainings",
    "matching",
    "geocoding",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "training_planner.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [BASE_DIR / "templates"],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    }
]

WSGI_APPLICATION = "training_planner.wsgi.application"
ASGI_APPLICATION = "training_planner.asgi.application"

AUTH_PASSWORD_VALIDATORS = [
    {
        "NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator",
    },
    {
        "NAME": "django.contrib.auth.password_validation.MinimumLengthValidator",
    },
    {
        "NAME": "django.contrib.auth.password_validation.CommonPasswordValidator",
    },
    {
        "NAME": "django.contrib.auth.password_validation.NumericPasswordValidator",
    },
]

STATIC_URL = "static/"
STATIC_ROOT = PROJECT_DIR / "staticfiles"
STATICFILES_DIRS = [BASE_DIR / "static"]

VITE_DEV_SERVER = os.environ.get("VITE_DEV_SERVER", "")

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

LOGIN_URL = "login"
LOGIN_REDIRECT_URL = "training_list"
LOGOUT_REDIRECT_URL = "login"
