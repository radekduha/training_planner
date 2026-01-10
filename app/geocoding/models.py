from django.db import models

from core.models import TimeStampedModel


class GeocodingCache(TimeStampedModel):
    address = models.CharField(max_length=255, unique=True)
    lat = models.FloatField()
    lng = models.FloatField()
    provider = models.CharField(max_length=50, default="nominatim")

    def __str__(self) -> str:
        return f"{self.address} ({self.provider})"
