"""
WebSocket URL routing for the user/chat app.
Included from config/asgi.py.
"""

from django.urls import path
from . import consumers

websocket_urlpatterns = [
    path("ws/chat/<int:partner_id>/", consumers.ChatConsumer.as_asgi()),
]
