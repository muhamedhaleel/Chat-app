"""
ASGI entrypoint for config project.

Handles:
  - Standard HTTP requests  →  Django WSGI/ASGI application
  - WebSocket requests      →  Django Channels + Redis channel layer
"""

import os

from django.core.asgi import get_asgi_application

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

# Initialise Django before routing/consumers import models.
django_asgi_app = get_asgi_application()

from channels.auth import AuthMiddlewareStack  # noqa: E402
from channels.routing import ProtocolTypeRouter, URLRouter  # noqa: E402
from channels.security.websocket import AllowedHostsOriginValidator  # noqa: E402

from user.routing import websocket_urlpatterns  # noqa: E402

application = ProtocolTypeRouter(
    {
        # HTTP → standard Django views
        "http": django_asgi_app,

        # WebSocket → Channels consumer
        # AllowedHostsOriginValidator enforces ALLOWED_HOSTS (skipped in DEBUG)
        "websocket": AllowedHostsOriginValidator(
            AuthMiddlewareStack(
                URLRouter(websocket_urlpatterns)
            )
        ),
    }
)
