from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

from django.conf import settings
from django.contrib.auth.decorators import login_required
from django.shortcuts import render


@lru_cache(maxsize=1)
def _load_manifest() -> dict:
    manifest_path = Path(settings.BASE_DIR) / "static" / "frontend" / "manifest.json"
    if not manifest_path.exists():
        return {}
    return json.loads(manifest_path.read_text())


def _vite_assets() -> dict[str, object]:
    manifest = _load_manifest()
    entry = manifest.get("index.html")
    if not entry:
        return {"js": None, "css": []}
    return {"js": entry.get("file"), "css": entry.get("css", [])}


@login_required
def spa(request):
    return render(
        request,
        "spa.html",
        {
            "vite_dev_server": settings.VITE_DEV_SERVER,
            "vite_assets": _vite_assets(),
        },
    )
