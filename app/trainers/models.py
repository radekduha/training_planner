from django.db import models

from core.models import TimeStampedModel


class TrainerRuleType(models.TextChoices):
    MAX_DISTANCE_KM = "max_distance_km", "Max distance (km)"
    WEEKEND_ALLOWED = "weekend_allowed", "Weekend allowed"
    MAX_LONG_TRIPS_PER_MONTH = "max_long_trips_per_month", "Max long trips per month"
    PREFERRED_WEEKDAYS = "preferred_weekdays", "Preferred weekdays"


class Trainer(TimeStampedModel):
    name = models.CharField(max_length=200)
    email = models.EmailField(blank=True)
    phone = models.CharField(max_length=50, blank=True)
    home_address = models.CharField(max_length=255)
    home_lat = models.FloatField(null=True, blank=True)
    home_lng = models.FloatField(null=True, blank=True)
    hourly_rate = models.DecimalField(
        "hourly rate (CZK)", max_digits=10, decimal_places=2, null=True, blank=True
    )
    travel_rate_km = models.DecimalField(
        "travel rate (CZK/km)", max_digits=10, decimal_places=2, null=True, blank=True
    )
    notes = models.TextField(blank=True)

    class Meta:
        ordering = ["name"]

    def __str__(self) -> str:
        return self.name


class TrainerSkill(models.Model):
    trainer = models.ForeignKey(
        "trainers.Trainer", on_delete=models.CASCADE, related_name="skills"
    )
    training_type = models.ForeignKey(
        "trainings.TrainingType", on_delete=models.CASCADE, related_name="trainer_skills"
    )

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["trainer", "training_type"], name="unique_trainer_skill"
            )
        ]

    def __str__(self) -> str:
        return f"{self.trainer} - {self.training_type}"


class TrainerRule(models.Model):
    trainer = models.ForeignKey(
        "trainers.Trainer", on_delete=models.CASCADE, related_name="rules"
    )
    rule_type = models.CharField(max_length=50, choices=TrainerRuleType.choices)
    rule_value = models.JSONField(default=dict, blank=True)

    class Meta:
        indexes = [models.Index(fields=["trainer", "rule_type"])]

    def __str__(self) -> str:
        return f"{self.trainer} - {self.rule_type}"
