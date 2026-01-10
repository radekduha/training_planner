from django.contrib import admin

from .models import Trainer, TrainerRule, TrainerSkill


@admin.register(Trainer)
class TrainerAdmin(admin.ModelAdmin):
    list_display = ["name", "email", "phone", "hourly_rate", "travel_rate_km"]
    search_fields = ["name", "email", "phone"]


@admin.register(TrainerSkill)
class TrainerSkillAdmin(admin.ModelAdmin):
    list_display = ["trainer", "training_type"]
    list_filter = ["training_type"]


@admin.register(TrainerRule)
class TrainerRuleAdmin(admin.ModelAdmin):
    list_display = ["trainer", "rule_type"]
    list_filter = ["rule_type"]
