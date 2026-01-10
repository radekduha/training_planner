from django.urls import path

from . import views

urlpatterns = [
    path("", views.training_list, name="training_list"),
    path("trainings/new/", views.training_create, name="training_create"),
    path("trainings/<int:pk>/", views.training_detail, name="training_detail"),
    path("trainings/<int:pk>/edit/", views.training_edit, name="training_edit"),
    path("calendar/", views.training_calendar, name="training_calendar"),
    path("calendar/week/", views.training_calendar_week, name="training_calendar_week"),
    path("training-types/", views.training_type_list, name="training_type_list"),
]
