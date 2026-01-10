from django.contrib import admin
from django.contrib.auth import views as auth_views
from django.urls import include, path, re_path

from frontend import views as frontend_views

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/", include("api.urls")),
    path("login/", auth_views.LoginView.as_view(), name="login"),
    path("logout/", auth_views.LogoutView.as_view(), name="logout"),
    re_path(r"^.*$", frontend_views.spa),
]
