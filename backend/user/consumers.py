"""
WebSocket Consumer for Real-Time Chat using Django Channels + Redis.

Each chat room is a bidirectional channel between two users.
Room name: chat_<smaller_user_id>_<larger_user_id>
  - Deterministic so both users always join the same group.

Authentication: JWT token is passed as a query parameter (?token=...)
  when establishing the WebSocket connection.
"""

import json
import logging
from urllib.parse import parse_qs

from asgiref.sync import sync_to_async
from channels.generic.websocket import AsyncWebsocketConsumer
from django.contrib.auth.models import User
from django.db.models import Q

from .models import Interest, Message
from .profile_store import get_extra_profile

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# JWT helpers (pure Python – no Django request object needed)
# ---------------------------------------------------------------------------

def _decode_jwt_user_id(token: str) -> int | None:
    """
    Decode a SimpleJWT access token and return the user pk.
    Returns None if the token is invalid or expired.
    """
    try:
        from rest_framework_simplejwt.tokens import AccessToken
        access = AccessToken(token)
        return access["user_id"]
    except Exception:
        return None


# ---------------------------------------------------------------------------
# Async helper: verify two users are connected (accepted interest)
# ---------------------------------------------------------------------------

@sync_to_async
def _are_connected(user_id: int, partner_id: int) -> bool:
    return Interest.objects.filter(
        Q(sender_id=user_id, receiver_id=partner_id) |
        Q(sender_id=partner_id, receiver_id=user_id),
        status="accepted",
    ).exists()


@sync_to_async
def _save_message(sender_id: int, receiver_id: int, content: str):
    """Persist the message to the database and return a plain dict."""
    msg = Message.objects.create(
        sender_id=sender_id,
        receiver_id=receiver_id,
        content=content,
    )
    sender = msg.sender
    return {
        "id": msg.id,
        "sender_id": sender.id,
        "sender_username": sender.username,
        "sender_first_name": sender.first_name,
        "receiver_id": receiver_id,
        "content": msg.content,
        "is_read": msg.is_read,
        "created_at": msg.created_at.isoformat(),
    }


@sync_to_async
def _get_user(user_id: int):
    try:
        return User.objects.get(pk=user_id, is_active=True)
    except User.DoesNotExist:
        return None


# ---------------------------------------------------------------------------
# WebSocket Consumer
# ---------------------------------------------------------------------------

class ChatConsumer(AsyncWebsocketConsumer):
    """
    Handles a single WebSocket connection for the chat between two users.

    URL pattern:   ws/chat/<partner_id>/
    Auth param:    ?token=<jwt_access_token>
    """

    # ------------------------------------------------------------------ #
    #  Connection lifecycle                                                #
    # ------------------------------------------------------------------ #

    async def connect(self):
        # 1. Extract JWT from query string
        qs = parse_qs(self.scope["query_string"].decode())
        token = qs.get("token", [None])[0]

        if not token:
            await self.close(code=4001)
            return

        user_id = _decode_jwt_user_id(token)
        if not user_id:
            await self.close(code=4001)
            return

        self.user = await _get_user(user_id)
        if not self.user:
            await self.close(code=4001)
            return

        # 2. Resolve partner from URL route
        try:
            self.partner_id = int(self.scope["url_route"]["kwargs"]["partner_id"])
        except (KeyError, ValueError):
            await self.close(code=4002)
            return

        # 3. Verify mutual accepted interest
        connected = await _are_connected(self.user.id, self.partner_id)
        if not connected:
            await self.close(code=4003)
            return

        # 4. Build a deterministic room name
        lo, hi = sorted([self.user.id, self.partner_id])
        self.room_group_name = f"chat_{lo}_{hi}"

        # 5. Join the channel group and accept the socket
        try:
            await self.channel_layer.group_add(self.room_group_name, self.channel_name)
        except Exception:
            logger.exception("Redis channel layer is unavailable for room %s", self.room_group_name)
            await self.close(code=1011)
            return

        await self.accept()

        logger.info(
            "WebSocket opened: user=%s partner=%s room=%s",
            self.user.username, self.partner_id, self.room_group_name,
        )

    async def disconnect(self, close_code):
        if hasattr(self, "room_group_name"):
            await self.channel_layer.group_discard(self.room_group_name, self.channel_name)
        logger.info("WebSocket closed: code=%s", close_code)

    # ------------------------------------------------------------------ #
    #  Receive message from WebSocket client                              #
    # ------------------------------------------------------------------ #

    async def receive(self, text_data=None, bytes_data=None):
        if not text_data:
            return

        try:
            payload = json.loads(text_data)
        except json.JSONDecodeError:
            return

        msg_type = payload.get("type", "chat_message")

        if msg_type == "chat_message":
            content = str(payload.get("content", "")).strip()
            if not content:
                return

            # Ensure connection is still active (not closed)
            still_connected = await _are_connected(self.user.id, self.partner_id)
            if not still_connected:
                await self.send(text_data=json.dumps({
                    "type": "chat_closed",
                    "closed_by": "system",
                }))
                await self.close(code=4003)
                return

            # Persist to DB
            msg_data = await _save_message(self.user.id, self.partner_id, content)

            # Broadcast to everyone in the room group (both WebSocket connections)
            await self.channel_layer.group_send(
                self.room_group_name,
                {
                    "type": "chat.message",   # maps to chat_message() handler
                    "message": msg_data,
                },
            )

        elif msg_type == "ping":
            await self.send(text_data=json.dumps({"type": "pong"}))

        elif msg_type == "read_receipt":
            # Optionally handle read-receipt events later
            pass

    # ------------------------------------------------------------------ #
    #  Receive broadcast event from channel layer → forward to WS         #
    # ------------------------------------------------------------------ #

    async def chat_message(self, event):
        """Called when group_send dispatches a 'chat.message' event."""
        await self.send(text_data=json.dumps({
            "type": "chat_message",
            "message": event["message"],
        }))

    async def chat_closed(self, event):
        """Called when group_send dispatches a 'chat.closed' event."""
        await self.send(text_data=json.dumps({
            "type": "chat_closed",
            "closed_by": event.get("closed_by", ""),
        }))
