from django.urls import path
from . import views

urlpatterns = [
    path("login/", views.admin_login, name="admin_login"),
    path("dashboard/", views.admin_dashboard, name="admin_dashboard"),
    path("users/create/", views.admin_create_user, name="admin_create_user"),
    path("users/<int:user_id>/toggle-block/", views.admin_toggle_block_user, name="admin_toggle_block_user"),
]
