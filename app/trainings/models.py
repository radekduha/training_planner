from django.db import models

from core.models import TimeStampedModel


class TrainingStatus(models.TextChoices):
    DRAFT = "draft", "Draft"
    WAITING = "waiting", "Waiting for trainer"
    ASSIGNED = "assigned", "Assigned"
    CONFIRMED = "confirmed", "Confirmed"
    CANCELED = "canceled", "Canceled"


class TrainingType(TimeStampedModel):
    name = models.CharField(max_length=120, unique=True)

    class Meta:
        ordering = ["name"]

    def __str__(self) -> str:
        return self.name


class Training(TimeStampedModel):
    training_type = models.ForeignKey(
        "trainings.TrainingType",
        on_delete=models.PROTECT,
        related_name="trainings",
    )
    customer_name = models.CharField("objednavatel", max_length=200, blank=True)
    address = models.CharField(max_length=255)
    lat = models.FloatField(null=True, blank=True)
    lng = models.FloatField(null=True, blank=True)
    start_datetime = models.DateTimeField()
    end_datetime = models.DateTimeField()
    status = models.CharField(
        max_length=20,
        choices=TrainingStatus.choices,
        default=TrainingStatus.DRAFT,
    )
    assigned_trainer = models.ForeignKey(
        "trainers.Trainer",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="assigned_trainings",
    )
    assignment_reason = models.TextField(blank=True)
    google_event_id = models.CharField(max_length=255, blank=True)
    notes = models.TextField(blank=True)

    class Meta:
        ordering = ["-start_datetime"]
        indexes = [
            models.Index(fields=["start_datetime"]),
            models.Index(fields=["status"]),
            models.Index(fields=["assigned_trainer"]),
        ]
        constraints = [
            models.CheckConstraint(
                check=models.Q(end_datetime__gt=models.F("start_datetime")),
                name="training_end_after_start",
            )
        ]

    def __str__(self) -> str:
        return f"{self.training_type} @ {self.start_datetime:%Y-%m-%d %H:%M}"
