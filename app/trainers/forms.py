from __future__ import annotations

from django import forms

from trainings.models import TrainingType

from .models import Trainer, TrainerRule, TrainerRuleType, TrainerSkill


WEEKDAY_CHOICES = [
    ("0", "Monday"),
    ("1", "Tuesday"),
    ("2", "Wednesday"),
    ("3", "Thursday"),
    ("4", "Friday"),
    ("5", "Saturday"),
    ("6", "Sunday"),
]


class TrainerForm(forms.ModelForm):
    training_types = forms.ModelMultipleChoiceField(
        queryset=TrainingType.objects.all(),
        required=False,
        widget=forms.CheckboxSelectMultiple,
    )
    max_distance_km = forms.IntegerField(required=False, min_value=1)
    weekend_allowed = forms.BooleanField(required=False, initial=True)
    max_long_trips_per_month = forms.IntegerField(required=False, min_value=0)
    preferred_weekdays = forms.MultipleChoiceField(
        required=False, choices=WEEKDAY_CHOICES, widget=forms.CheckboxSelectMultiple
    )

    class Meta:
        model = Trainer
        fields = [
            "name",
            "email",
            "phone",
            "home_address",
            "home_lat",
            "home_lng",
            "hourly_rate",
            "travel_rate_km",
            "notes",
        ]
        widgets = {"notes": forms.Textarea(attrs={"rows": 3})}

    def __init__(self, *args, **kwargs) -> None:
        super().__init__(*args, **kwargs)
        if self.instance.pk:
            self.fields["training_types"].initial = self.instance.skills.values_list(
                "training_type_id", flat=True
            )
            self.fields["max_distance_km"].initial = _rule_value(
                self.instance, TrainerRuleType.MAX_DISTANCE_KM
            )
            weekend_allowed = _rule_value(self.instance, TrainerRuleType.WEEKEND_ALLOWED)
            self.fields["weekend_allowed"].initial = True if weekend_allowed is None else weekend_allowed
            self.fields["max_long_trips_per_month"].initial = _rule_value(
                self.instance, TrainerRuleType.MAX_LONG_TRIPS_PER_MONTH
            )
            weekdays = _rule_value(self.instance, TrainerRuleType.PREFERRED_WEEKDAYS) or []
            self.fields["preferred_weekdays"].initial = [str(day) for day in weekdays]
        else:
            self.fields["weekend_allowed"].initial = True

    def save(self, commit: bool = True) -> Trainer:
        trainer = super().save(commit=commit)
        if commit:
            self._save_training_types(trainer)
            self._save_rules(trainer)
        return trainer

    def _save_training_types(self, trainer: Trainer) -> None:
        TrainerSkill.objects.filter(trainer=trainer).delete()
        for training_type in self.cleaned_data.get("training_types", []):
            TrainerSkill.objects.create(trainer=trainer, training_type=training_type)

    def _save_rules(self, trainer: Trainer) -> None:
        _set_rule(trainer, TrainerRuleType.MAX_DISTANCE_KM, self.cleaned_data.get("max_distance_km"))
        _set_rule(trainer, TrainerRuleType.WEEKEND_ALLOWED, self.cleaned_data.get("weekend_allowed"))
        _set_rule(
            trainer,
            TrainerRuleType.MAX_LONG_TRIPS_PER_MONTH,
            self.cleaned_data.get("max_long_trips_per_month"),
        )
        preferred_weekdays = self.cleaned_data.get("preferred_weekdays") or []
        _set_rule(trainer, TrainerRuleType.PREFERRED_WEEKDAYS, [int(day) for day in preferred_weekdays])


def _rule_value(trainer: Trainer, rule_type: str):
    rule = TrainerRule.objects.filter(trainer=trainer, rule_type=rule_type).first()
    if not rule:
        return None
    return rule.rule_value.get("value")


def _set_rule(trainer: Trainer, rule_type: str, value) -> None:
    rule = TrainerRule.objects.filter(trainer=trainer, rule_type=rule_type).first()
    if value in (None, "", []):
        if rule:
            rule.delete()
        return
    payload = {"value": value}
    if rule:
        rule.rule_value = payload
        rule.save(update_fields=["rule_value"])
    else:
        TrainerRule.objects.create(trainer=trainer, rule_type=rule_type, rule_value=payload)
