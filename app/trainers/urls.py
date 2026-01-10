from django.urls import path

from . import views

urlpatterns = [
    path("trainers/", views.trainer_list, name="trainer_list"),
    path("trainers/new/", views.trainer_create, name="trainer_create"),
    path("trainers/<int:pk>/", views.trainer_detail, name="trainer_detail"),
    path("trainers/<int:pk>/edit/", views.trainer_edit, name="trainer_edit"),
]
