from django.contrib import admin
from django.urls import include, path, re_path

from frontend import views as frontend_views

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/", include("api.urls")),
    re_path(r"^.*$", frontend_views.spa),
]
