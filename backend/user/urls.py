from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView

from . import views

urlpatterns = [
    path("signup/", views.signup, name="signup"),
    path("login/", views.login, name="login"),
    path("token/refresh/", TokenRefreshView.as_view(), name="token_refresh"),
    path("profile/", views.profile_view, name="profile"),
    path("browse/", views.browse_users, name="browse_users"),
    path("users/<int:user_id>/", views.user_detail, name="user_detail"),

    # Interest endpoints
    path("interests/send/<int:user_id>/", views.send_interest, name="send_interest"),
    path("interests/received/", views.received_interests, name="received_interests"),
    path("interests/sent/", views.sent_interests, name="sent_interests"),
    path("interests/<int:interest_id>/respond/", views.respond_interest, name="respond_interest"),
    path("interests/<int:interest_id>/cancel/", views.cancel_interest, name="cancel_interest"),

    # Chat endpoints
    path("chat/conversations/", views.get_conversations, name="get_conversations"),
    path("chat/messages/<int:partner_id>/", views.chat_messages, name="chat_messages"),
    path("chat/close/<int:partner_id>/", views.close_chat, name="close_chat"),
]
