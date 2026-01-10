from datetime import date

from django.contrib import messages
from django.contrib.auth.decorators import login_required
from django.shortcuts import get_object_or_404, redirect, render
from django.urls import reverse

from geocoding.services import geocode_address
from matching.services import LONG_TRIP_THRESHOLD_KM, haversine_km
from trainings.models import Training, TrainingStatus

from .forms import TrainerForm
from .models import Trainer


@login_required
def trainer_list(request):
    trainers = Trainer.objects.all()
    return render(request, "trainers/index.html", {"trainers": trainers})


@login_required
def trainer_create(request):
    if request.method == "POST":
        form = TrainerForm(request.POST)
        if form.is_valid():
            trainer = form.save()
            if trainer.home_lat is None or trainer.home_lng is None:
                geo = geocode_address(trainer.home_address)
                if geo:
                    trainer.home_lat = geo.lat
                    trainer.home_lng = geo.lng
                    trainer.save(update_fields=["home_lat", "home_lng"])
                else:
                    messages.warning(
                        request, "Address could not be geocoded. Enter lat/lng manually."
                    )
            return redirect(reverse("trainer_detail", args=[trainer.pk]))
    else:
        form = TrainerForm()
    return render(request, "trainers/create.html", {"form": form})


@login_required
def trainer_detail(request, pk: int):
    trainer = get_object_or_404(Trainer, pk=pk)
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
    return render(
        request,
        "trainers/detail.html",
        {
            "trainer": trainer,
            "trainings": trainings,
            "month_workload": month_trainings.count(),
            "month_long_trips": month_long_trips,
        },
    )


@login_required
def trainer_edit(request, pk: int):
    trainer = get_object_or_404(Trainer, pk=pk)
    if request.method == "POST":
        form = TrainerForm(request.POST, instance=trainer)
        if form.is_valid():
            trainer = form.save()
            if trainer.home_lat is None or trainer.home_lng is None:
                geo = geocode_address(trainer.home_address)
                if geo:
                    trainer.home_lat = geo.lat
                    trainer.home_lng = geo.lng
                    trainer.save(update_fields=["home_lat", "home_lng"])
                else:
                    messages.warning(
                        request, "Address could not be geocoded. Enter lat/lng manually."
                    )
            return redirect(reverse("trainer_detail", args=[trainer.pk]))
    else:
        form = TrainerForm(instance=trainer)
    return render(request, "trainers/edit.html", {"form": form, "trainer": trainer})
