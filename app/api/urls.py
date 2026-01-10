from django.urls import path

from . import views


urlpatterns = [
    path("csrf/", views.csrf_cookie, name="api_csrf"),
    path("meta/", views.meta, name="api_meta"),
    path("trainings/", views.trainings_collection, name="api_trainings"),
    path("trainings/<int:pk>/", views.training_detail, name="api_training_detail"),
    path("trainers/", views.trainers_collection, name="api_trainers"),
    path("trainers/<int:pk>/", views.trainer_detail, name="api_trainer_detail"),
    path("training-types/", views.training_types_collection, name="api_training_types"),
    path("calendar/month/", views.calendar_month, name="api_calendar_month"),
    path("calendar/week/", views.calendar_week, name="api_calendar_week"),
]
