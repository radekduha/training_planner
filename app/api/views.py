from __future__ import annotations

import calendar
import json
from datetime import date, timedelta
from typing import Any, Optional

from django.contrib.auth import authenticate, login as auth_login, logout as auth_logout
from django.contrib.auth.decorators import login_required
from django.http import HttpRequest, JsonResponse
from django.shortcuts import get_object_or_404
from django.views.decorators.csrf import ensure_csrf_cookie
from django.views.decorators.http import require_http_methods

from geocoding.services import geocode_address
from matching.services import LONG_TRIP_THRESHOLD_KM, haversine_km, recommend_trainers
from trainers.forms import TrainerForm
from trainers.models import Trainer
from trainings.forms import TrainingForm, TrainingTypeForm, TrainingUpdateForm
from trainings.models import Training, TrainingStatus, TrainingType


def _parse_json(request: HttpRequest) -> dict[str, Any]:
    if not request.body:
        return {}
    try:
        return json.loads(request.body)
    except json.JSONDecodeError as exc:
        raise ValueError("Invalid JSON payload.") from exc


def _json_error(message: str, status: int = 400) -> JsonResponse:
    return JsonResponse({"error": message}, status=status)


def _form_errors(form) -> JsonResponse:
    return JsonResponse({"errors": form.errors.get_json_data()}, status=400)


def _parse_date(value: Optional[str]) -> Optional[date]:
    if not value:
        return None
    try:
        return date.fromisoformat(value)
    except ValueError:
        return None


def _parse_int(value: Optional[str], default: int, min_value: Optional[int] = None, max_value: Optional[int] = None) -> int:
    if value is None or value == "":
        return default
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return default
    if min_value is not None and parsed < min_value:
        return default
    if max_value is not None and parsed > max_value:
        return default
    return parsed


def _decimal(value):
    if value is None:
        return None
    return float(value)


def _training_type_payload(training_type: TrainingType) -> dict[str, Any]:
    return {"id": training_type.id, "name": training_type.name}


def _trainer_summary(trainer: Trainer) -> dict[str, Any]:
    return {"id": trainer.id, "name": trainer.name}


def _trainer_payload(trainer: Trainer, detail: bool = False) -> dict[str, Any]:
    payload = {
        "id": trainer.id,
        "name": trainer.name,
        "email": trainer.email,
        "phone": trainer.phone,
        "home_address": trainer.home_address,
        "home_lat": trainer.home_lat,
        "home_lng": trainer.home_lng,
        "hourly_rate": _decimal(trainer.hourly_rate),
        "travel_rate_km": _decimal(trainer.travel_rate_km),
        "notes": trainer.notes,
    }
    if detail:
        payload["training_types"] = [
            _training_type_payload(skill.training_type) for skill in trainer.skills.all()
        ]
        payload["rules"] = [
            {
                "type": rule.rule_type,
                "label": rule.get_rule_type_display(),
                "value": rule.rule_value.get("value"),
            }
            for rule in trainer.rules.all()
        ]
    return payload


def _training_list_item(training: Training) -> dict[str, Any]:
    assigned_trainer = (
        _trainer_summary(training.assigned_trainer) if training.assigned_trainer_id else None
    )
    return {
        "id": training.id,
        "training_type": _training_type_payload(training.training_type),
        "customer_name": training.customer_name,
        "address": training.address,
        "start_datetime": training.start_datetime.isoformat(),
        "end_datetime": training.end_datetime.isoformat(),
        "status": training.status,
        "status_label": training.get_status_display(),
        "assigned_trainer": assigned_trainer,
    }


def _training_payload(training: Training) -> dict[str, Any]:
    payload = _training_list_item(training)
    payload.update(
        {
            "lat": training.lat,
            "lng": training.lng,
            "assignment_reason": training.assignment_reason,
            "notes": training.notes,
            "google_event_id": training.google_event_id,
        }
    )
    return payload


def _serialize_recommendations(training: Training) -> dict[str, Any]:
    trainers = Trainer.objects.prefetch_related("skills__training_type", "rules")
    existing_trainings = Training.objects.filter(
        assigned_trainer__isnull=False
    ).exclude(status=TrainingStatus.CANCELED)
    recommendations = recommend_trainers(training, trainers, existing_trainings)
    matches = []
    for match in recommendations.matches:
        matches.append(
            {
                "trainer": _trainer_summary(match.trainer),
                "score": match.score,
                "estimated_cost": _decimal(match.estimated_cost),
                "reasons": list(match.reasons),
                "warnings": list(match.warnings),
            }
        )
    return {"matches": matches, "used_compromise": recommendations.used_compromise}


@ensure_csrf_cookie
@require_http_methods(["GET"])
def csrf_cookie(request: HttpRequest) -> JsonResponse:
    return JsonResponse({"ok": True})


@require_http_methods(["POST"])
def login_view(request: HttpRequest) -> JsonResponse:
    try:
        payload = _parse_json(request)
    except ValueError as exc:
        return _json_error(str(exc))

    username = payload.get("username")
    password = payload.get("password")
    if not username or not password:
        return _json_error("Username and password are required.")

    user = authenticate(request, username=username, password=password)
    if user is None:
        return _json_error("Invalid credentials.", status=400)

    auth_login(request, user)
    return JsonResponse({"ok": True, "user": {"id": user.id, "username": user.get_username()}})


@require_http_methods(["POST"])
def logout_view(request: HttpRequest) -> JsonResponse:
    auth_logout(request)
    return JsonResponse({"ok": True})


@login_required
@require_http_methods(["GET"])
def meta(request: HttpRequest) -> JsonResponse:
    training_types = TrainingType.objects.all()
    trainers = Trainer.objects.all()
    return JsonResponse(
        {
            "training_types": [_training_type_payload(ttype) for ttype in training_types],
            "trainer_choices": [_trainer_summary(trainer) for trainer in trainers],
            "status_choices": [
                {"value": value, "label": label} for value, label in TrainingStatus.choices
            ],
        }
    )


@login_required
@require_http_methods(["GET", "POST"])
def trainings_collection(request: HttpRequest) -> JsonResponse:
    if request.method == "GET":
        trainings = Training.objects.select_related("training_type", "assigned_trainer")
        status = request.GET.get("status")
        training_type_id = request.GET.get("training_type")
        start_date = _parse_date(request.GET.get("start_date"))
        end_date = _parse_date(request.GET.get("end_date"))
        no_trainer = request.GET.get("no_trainer")
        if status:
            trainings = trainings.filter(status=status)
        if training_type_id:
            trainings = trainings.filter(training_type_id=training_type_id)
        if start_date:
            trainings = trainings.filter(start_datetime__date__gte=start_date)
        if end_date:
            trainings = trainings.filter(start_datetime__date__lte=end_date)
        if no_trainer:
            trainings = trainings.filter(
                assigned_trainer__isnull=True,
                status__in=[TrainingStatus.DRAFT, TrainingStatus.WAITING],
            )
        trainings = trainings[:100]
        return JsonResponse({"items": [_training_list_item(item) for item in trainings]})

    try:
        payload = _parse_json(request)
    except ValueError as exc:
        return _json_error(str(exc))

    payload.setdefault("status", TrainingStatus.WAITING)
    form = TrainingForm(payload)
    if not form.is_valid():
        return _form_errors(form)

    training = form.save(commit=False)
    if training.lat is None or training.lng is None:
        geo = geocode_address(training.address)
        if geo:
            training.lat = geo.lat
            training.lng = geo.lng
    training.save()
    return JsonResponse({"item": _training_payload(training)}, status=201)


@login_required
@require_http_methods(["GET", "PUT", "PATCH"])
def training_detail(request: HttpRequest, pk: int) -> JsonResponse:
    training = get_object_or_404(
        Training.objects.select_related("training_type", "assigned_trainer"),
        pk=pk,
    )
    if request.method == "GET":
        return JsonResponse(
            {
                "item": _training_payload(training),
                "recommendations": _serialize_recommendations(training),
            }
        )

    try:
        payload = _parse_json(request)
    except ValueError as exc:
        return _json_error(str(exc))

    if request.method == "PATCH":
        payload.setdefault("status", training.status)
        payload.setdefault("assigned_trainer", training.assigned_trainer_id)
        payload.setdefault("customer_name", training.customer_name)
        payload.setdefault("assignment_reason", training.assignment_reason)
        payload.setdefault("notes", training.notes)
        form = TrainingUpdateForm(payload, instance=training)
    else:
        form = TrainingForm(payload, instance=training)

    if not form.is_valid():
        return _form_errors(form)

    training = form.save(commit=False)
    if training.lat is None or training.lng is None:
        geo = geocode_address(training.address)
        if geo:
            training.lat = geo.lat
            training.lng = geo.lng
    training.save()
    return JsonResponse({"item": _training_payload(training)})


@login_required
@require_http_methods(["GET", "POST"])
def trainers_collection(request: HttpRequest) -> JsonResponse:
    if request.method == "GET":
        trainers = Trainer.objects.all()
        return JsonResponse({"items": [_trainer_payload(trainer) for trainer in trainers]})

    try:
        payload = _parse_json(request)
    except ValueError as exc:
        return _json_error(str(exc))

    form = TrainerForm(payload)
    if not form.is_valid():
        return _form_errors(form)

    trainer = form.save()
    if trainer.home_lat is None or trainer.home_lng is None:
        geo = geocode_address(trainer.home_address)
        if geo:
            trainer.home_lat = geo.lat
            trainer.home_lng = geo.lng
            trainer.save(update_fields=["home_lat", "home_lng"])
    return JsonResponse({"item": _trainer_payload(trainer, detail=True)}, status=201)


@login_required
@require_http_methods(["GET", "PUT"])
def trainer_detail(request: HttpRequest, pk: int) -> JsonResponse:
    trainer = get_object_or_404(
        Trainer.objects.prefetch_related("skills__training_type", "rules"),
        pk=pk,
    )
    if request.method == "GET":
        trainings = Training.objects.filter(assigned_trainer=trainer).order_by("-start_datetime")
        today = date.today()
        month_trainings = (
            Training.objects.filter(
                assigned_trainer=trainer,
                start_datetime__year=today.year,
                start_datetime__month=today.month,
            )
            .exclude(status=TrainingStatus.CANCELED)
            .only("start_datetime", "lat", "lng")
        )
        month_long_trips = 0
        if trainer.home_lat is not None and trainer.home_lng is not None:
            for item in month_trainings:
                if item.lat is None or item.lng is None:
                    continue
                distance = haversine_km(
                    item.lat, item.lng, trainer.home_lat, trainer.home_lng
                )
                if distance > LONG_TRIP_THRESHOLD_KM:
                    month_long_trips += 1
        return JsonResponse(
            {
                "item": _trainer_payload(trainer, detail=True),
                "assigned_trainings": [_training_list_item(item) for item in trainings],
                "month_workload": month_trainings.count(),
                "month_long_trips": month_long_trips,
            }
        )

    try:
        payload = _parse_json(request)
    except ValueError as exc:
        return _json_error(str(exc))

    form = TrainerForm(payload, instance=trainer)
    if not form.is_valid():
        return _form_errors(form)

    trainer = form.save()
    if trainer.home_lat is None or trainer.home_lng is None:
        geo = geocode_address(trainer.home_address)
        if geo:
            trainer.home_lat = geo.lat
            trainer.home_lng = geo.lng
            trainer.save(update_fields=["home_lat", "home_lng"])
    return JsonResponse({"item": _trainer_payload(trainer, detail=True)})


@login_required
@require_http_methods(["GET", "POST"])
def training_types_collection(request: HttpRequest) -> JsonResponse:
    if request.method == "GET":
        training_types = TrainingType.objects.all()
        return JsonResponse({"items": [_training_type_payload(item) for item in training_types]})

    try:
        payload = _parse_json(request)
    except ValueError as exc:
        return _json_error(str(exc))

    form = TrainingTypeForm(payload)
    if not form.is_valid():
        return _form_errors(form)

    training_type = form.save()
    return JsonResponse({"item": _training_type_payload(training_type)}, status=201)


@login_required
@require_http_methods(["GET"])
def calendar_month(request: HttpRequest) -> JsonResponse:
    today = date.today()
    year = _parse_int(request.GET.get("year"), today.year)
    month = _parse_int(request.GET.get("month"), today.month, min_value=1, max_value=12)
    cal = calendar.Calendar(firstweekday=0)
    month_days = list(cal.itermonthdates(year, month))
    trainings = (
        Training.objects.filter(start_datetime__year=year, start_datetime__month=month)
        .select_related("training_type", "assigned_trainer")
        .order_by("start_datetime")
    )
    trainings_by_day: dict[date, list[Training]] = {}
    for training in trainings:
        trainings_by_day.setdefault(training.start_datetime.date(), []).append(training)
    weeks = []
    for i in range(0, len(month_days), 7):
        week = []
        for day in month_days[i : i + 7]:
            week.append(
                {
                    "date": day.isoformat(),
                    "in_month": day.month == month,
                    "trainings": [
                        {
                            "id": item.id,
                            "label": item.training_type.name,
                            "customer_name": item.customer_name,
                            "status": item.status,
                            "status_label": item.get_status_display(),
                            "start_time": item.start_datetime.strftime("%H:%M"),
                            "address": item.address,
                        }
                        for item in trainings_by_day.get(day, [])
                    ],
                }
            )
        weeks.append(week)
    prev_month = month - 1
    prev_year = year
    next_month = month + 1
    next_year = year
    if prev_month < 1:
        prev_month = 12
        prev_year -= 1
    if next_month > 12:
        next_month = 1
        next_year += 1
    return JsonResponse(
        {
            "month": month,
            "year": year,
            "month_name": calendar.month_name[month],
            "weeks": weeks,
            "prev_month": prev_month,
            "prev_year": prev_year,
            "next_month": next_month,
            "next_year": next_year,
            "today": today.isoformat(),
        }
    )


@login_required
@require_http_methods(["GET"])
def calendar_week(request: HttpRequest) -> JsonResponse:
    today = date.today()
    selected = _parse_date(request.GET.get("date")) or today
    week_start = selected - timedelta(days=selected.weekday())
    days = [week_start + timedelta(days=i) for i in range(7)]
    trainings = (
        Training.objects.filter(start_datetime__date__range=[days[0], days[-1]])
        .select_related("training_type", "assigned_trainer")
        .order_by("start_datetime")
    )
    trainings_by_day: dict[date, list[Training]] = {}
    for training in trainings:
        trainings_by_day.setdefault(training.start_datetime.date(), []).append(training)
    payload_days = []
    for day in days:
        payload_days.append(
            {
                "date": day.isoformat(),
                "label": day.strftime("%a %d"),
                "trainings": [
                    {
                        "id": item.id,
                        "label": item.training_type.name,
                        "customer_name": item.customer_name,
                        "status": item.status,
                        "status_label": item.get_status_display(),
                        "start_time": item.start_datetime.strftime("%H:%M"),
                        "address": item.address,
                    }
                    for item in trainings_by_day.get(day, [])
                ],
            }
        )
    return JsonResponse(
        {
            "week_start": week_start.isoformat(),
            "days": payload_days,
            "prev_date": (week_start - timedelta(days=7)).isoformat(),
            "next_date": (week_start + timedelta(days=7)).isoformat(),
        }
    )
