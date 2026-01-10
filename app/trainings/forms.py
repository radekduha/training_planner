from __future__ import annotations

from django import forms

from .models import Training, TrainingStatus, TrainingType


class TrainingForm(forms.ModelForm):
    class Meta:
        model = Training
        fields = [
            "training_type",
            "customer_name",
            "address",
            "lat",
            "lng",
            "start_datetime",
            "end_datetime",
            "status",
            "assigned_trainer",
            "assignment_reason",
            "notes",
        ]
        widgets = {
            "start_datetime": forms.DateTimeInput(
                attrs={"type": "datetime-local"}, format="%Y-%m-%dT%H:%M"
            ),
            "end_datetime": forms.DateTimeInput(
                attrs={"type": "datetime-local"}, format="%Y-%m-%dT%H:%M"
            ),
            "assignment_reason": forms.Textarea(attrs={"rows": 3}),
            "notes": forms.Textarea(attrs={"rows": 3}),
        }

    def __init__(self, *args, **kwargs) -> None:
        super().__init__(*args, **kwargs)
        if not self.instance.pk:
            self.fields["status"].initial = TrainingStatus.WAITING
        for field_name in ("start_datetime", "end_datetime"):
            self.fields[field_name].input_formats = ["%Y-%m-%dT%H:%M"]


class TrainingUpdateForm(forms.ModelForm):
    class Meta:
        model = Training
        fields = ["status", "assigned_trainer", "customer_name", "assignment_reason", "notes"]
        widgets = {
            "assignment_reason": forms.Textarea(attrs={"rows": 3}),
            "notes": forms.Textarea(attrs={"rows": 3}),
        }


class TrainingTypeForm(forms.ModelForm):
    class Meta:
        model = TrainingType
        fields = ["name"]
