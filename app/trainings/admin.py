from django.contrib import admin

from .models import Training, TrainingType


@admin.register(TrainingType)
class TrainingTypeAdmin(admin.ModelAdmin):
    search_fields = ["name"]


@admin.register(Training)
class TrainingAdmin(admin.ModelAdmin):
    list_display = [
        "training_type",
        "customer_name",
        "start_datetime",
        "status",
        "assigned_trainer",
    ]
    list_filter = ["status", "training_type"]
    search_fields = ["address", "notes"]
