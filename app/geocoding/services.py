from __future__ import annotations

import json
import os
import urllib.parse
import urllib.request
from dataclasses import dataclass
from typing import Optional


@dataclass(frozen=True)
class GeocodingResult:
    lat: float
    lng: float
    provider: str


def geocode_address(address: str) -> Optional[GeocodingResult]:
    """Geocode a free-text address using Nominatim with a local DB cache."""
    normalized = address.strip()
    if not normalized:
        return None

    from .models import GeocodingCache

    cached = GeocodingCache.objects.filter(address__iexact=normalized).first()
    if cached:
        return GeocodingResult(lat=cached.lat, lng=cached.lng, provider=cached.provider)

    query = urllib.parse.urlencode({"q": normalized, "format": "json", "limit": 1})
    url = f"https://nominatim.openstreetmap.org/search?{query}"
    user_agent = os.environ.get("GEOCODING_USER_AGENT", "training-planner-mvp")
    request = urllib.request.Request(url, headers={"User-Agent": user_agent})
    try:
        with urllib.request.urlopen(request, timeout=6) as response:
            payload = response.read().decode("utf-8")
    except Exception:
        return None

    try:
        data = json.loads(payload)
    except json.JSONDecodeError:
        return None

    if not data:
        return None

    try:
        lat = float(data[0]["lat"])
        lng = float(data[0]["lon"])
    except (KeyError, TypeError, ValueError):
        return None

    cache = GeocodingCache.objects.create(
        address=normalized, lat=lat, lng=lng, provider="nominatim"
    )
    return GeocodingResult(lat=cache.lat, lng=cache.lng, provider=cache.provider)
