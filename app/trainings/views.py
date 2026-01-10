import calendar
from datetime import date, timedelta
from typing import Optional

from django.contrib import messages
from django.contrib.auth.decorators import login_required
from django.shortcuts import get_object_or_404, redirect, render
from django.urls import reverse

from geocoding.services import geocode_address
from matching.services import recommend_trainers
from trainers.models import Trainer

from .forms import TrainingForm, TrainingTypeForm, TrainingUpdateForm
from .models import Training, TrainingStatus, TrainingType


def _parse_date(value: Optional[str]) -> Optional[date]:
    if not value:
        return None
    try:
        return date.fromisoformat(value)
    except ValueError:
        return None


@login_required
def training_list(request):
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
    training_types = TrainingType.objects.all()
    return render(
        request,
        "trainings/index.html",
        {
            "trainings": trainings,
            "training_types": training_types,
            "status_choices": TrainingStatus.choices,
            "selected_status": status or "",
            "selected_type": training_type_id or "",
            "selected_start_date": start_date.isoformat() if start_date else "",
            "selected_end_date": end_date.isoformat() if end_date else "",
            "selected_no_trainer": no_trainer or "",
        },
    )


@login_required
def training_create(request):
    if request.method == "POST":
        form = TrainingForm(request.POST)
        if form.is_valid():
            training = form.save(commit=False)
            if training.lat is None or training.lng is None:
                geo = geocode_address(training.address)
                if geo:
                    training.lat = geo.lat
                    training.lng = geo.lng
                else:
                    messages.warning(
                        request, "Address could not be geocoded. Enter lat/lng manually."
                    )
            training.save()
            return redirect(reverse("training_detail", args=[training.pk]))
    else:
        form = TrainingForm()
    return render(request, "trainings/create.html", {"form": form})


@login_required
def training_detail(request, pk: int):
    training = get_object_or_404(Training, pk=pk)
    if request.method == "POST":
        form = TrainingUpdateForm(request.POST, instance=training)
        if form.is_valid():
            form.save()
            return redirect(reverse("training_detail", args=[training.pk]))
    else:
        form = TrainingUpdateForm(instance=training)

    trainers = Trainer.objects.prefetch_related("skills__training_type", "rules")
    existing_trainings = Training.objects.filter(
        assigned_trainer__isnull=False
    ).exclude(status=TrainingStatus.CANCELED)
    recommendations = recommend_trainers(training, trainers, existing_trainings)

    return render(
        request,
        "trainings/detail.html",
        {
            "training": training,
            "form": form,
            "recommendations": recommendations.matches,
            "used_compromise": recommendations.used_compromise,
        },
    )


@login_required
def training_edit(request, pk: int):
    training = get_object_or_404(Training, pk=pk)
    if request.method == "POST":
        form = TrainingForm(request.POST, instance=training)
        if form.is_valid():
            training = form.save(commit=False)
            if training.lat is None or training.lng is None:
                geo = geocode_address(training.address)
                if geo:
                    training.lat = geo.lat
                    training.lng = geo.lng
                else:
                    messages.warning(
                        request, "Address could not be geocoded. Enter lat/lng manually."
                    )
            training.save()
            return redirect(reverse("training_detail", args=[training.pk]))
    else:
        form = TrainingForm(instance=training)
    return render(request, "trainings/edit.html", {"form": form, "training": training})


@login_required
def training_type_list(request):
    if request.method == "POST":
        form = TrainingTypeForm(request.POST)
        if form.is_valid():
            form.save()
            return redirect(reverse("training_type_list"))
    else:
        form = TrainingTypeForm()
    training_types = TrainingType.objects.all()
    return render(
        request,
        "trainings/types.html",
        {"training_types": training_types, "form": form},
    )


@login_required
def training_calendar(request):
    today = date.today()
    year = int(request.GET.get("year", today.year))
    month = int(request.GET.get("month", today.month))
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
                    "date": day,
                    "in_month": day.month == month,
                    "trainings": trainings_by_day.get(day, []),
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
    return render(
        request,
        "trainings/calendar.html",
        {
            "weeks": weeks,
            "month": month,
            "year": year,
            "month_name": calendar.month_name[month],
            "prev_month": prev_month,
            "prev_year": prev_year,
            "next_month": next_month,
            "next_year": next_year,
            "today": today,
        },
    )


@login_required
def training_calendar_week(request):
    today = date.today()
    base_date = _parse_date(request.GET.get("date")) or today
    week_start = base_date - timedelta(days=base_date.weekday())
    week_end = week_start + timedelta(days=6)
    trainings = (
        Training.objects.filter(
            start_datetime__date__gte=week_start, start_datetime__date__lte=week_end
        )
        .select_related("training_type", "assigned_trainer")
        .order_by("start_datetime")
    )
    trainings_by_day: dict[date, list[Training]] = {}
    for training in trainings:
        trainings_by_day.setdefault(training.start_datetime.date(), []).append(training)
    days = []
    for offset in range(7):
        day = week_start + timedelta(days=offset)
        days.append({"date": day, "trainings": trainings_by_day.get(day, [])})
    return render(
        request,
        "trainings/week.html",
        {
            "days": days,
            "week_start": week_start,
            "week_end": week_end,
            "prev_date": week_start - timedelta(days=7),
            "next_date": week_start + timedelta(days=7),
        },
    )
