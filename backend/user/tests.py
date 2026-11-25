import json
from django.contrib.auth.models import User
from django.test import TransactionTestCase, override_settings
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase, APIClient
from rest_framework_simplejwt.tokens import RefreshToken
from channels.testing import WebsocketCommunicator

from config.asgi import application
from .models import UserProfile, Interest, Message


INMEMORY_CHANNEL_LAYERS = {
    "default": {
        "BACKEND": "channels.layers.InMemoryChannelLayer",
    }
}


class UserAuthAndProfileTests(APITestCase):
    def setUp(self):
        self.client = APIClient()
        self.signup_url = reverse("signup")
        self.login_url = reverse("login")
        self.profile_url = reverse("profile")

    def test_signup_and_login_flow(self):
        # 1. Signup
        res = self.client.post(
            self.signup_url,
            {
                "username": "alice",
                "email": "alice@example.com",
                "password": "StrongPassword123!",
            },
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertTrue(res.data["success"])
        self.assertEqual(res.data["data"]["username"], "alice")

        # 2. Login with username
        res = self.client.post(
            self.login_url,
            {"username": "alice", "password": "StrongPassword123!"},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertIn("access", res.data["data"]["tokens"])

        # 3. Login with email
        res_email = self.client.post(
            self.login_url,
            {"username": "alice@example.com", "password": "StrongPassword123!"},
            format="json",
        )
        self.assertEqual(res_email.status_code, status.HTTP_200_OK)

    def test_profile_get_and_update(self):
        user = User.objects.create_user(
            username="bob", email="bob@example.com", password="StrongPassword123!"
        )
        UserProfile.objects.create(user=user)
        self.client.force_authenticate(user=user)

        res = self.client.put(
            self.profile_url,
            {
                "first_name": "Bob",
                "last_name": "Smith",
                "email": "bob@example.com",
                "gender": "male",
                "bio": "Hello there!",
            },
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["data"]["first_name"], "Bob")
        self.assertEqual(res.data["data"]["gender"], "male")
        self.assertEqual(res.data["data"]["bio"], "Hello there!")

        get_res = self.client.get(self.profile_url)
        self.assertEqual(get_res.status_code, status.HTTP_200_OK)
        self.assertEqual(get_res.data["data"]["first_name"], "Bob")


class InterestAndChatRestTests(APITestCase):
    def setUp(self):
        self.alice = User.objects.create_user(
            username="alice", email="alice@example.com", password="StrongPassword123!", first_name="Alice"
        )
        self.bob = User.objects.create_user(
            username="bob", email="bob@example.com", password="StrongPassword123!", first_name="Bob"
        )
        UserProfile.objects.create(user=self.alice, gender="female")
        UserProfile.objects.create(user=self.bob, gender="male")

        self.client = APIClient()

    def test_send_cancel_and_accept_interest_then_chat(self):
        # Alice sends interest to Bob
        self.client.force_authenticate(user=self.alice)
        send_res = self.client.post(
            reverse("send_interest", kwargs={"user_id": self.bob.id}),
            {"message": "Hi Bob, let's connect!"},
            format="json",
        )
        self.assertEqual(send_res.status_code, status.HTTP_201_CREATED)
        interest_id = send_res.data["data"]["id"]

        # Alice sees it in Sent Requests
        sent_res = self.client.get(reverse("sent_interests"))
        self.assertEqual(sent_res.status_code, status.HTTP_200_OK)
        self.assertEqual(sent_res.data["count"], 1)

        # Browse includes interest_id and status
        browse_res = self.client.get(reverse("browse_users"))
        self.assertEqual(browse_res.status_code, status.HTTP_200_OK)
        bob_entry = next(u for u in browse_res.data["data"] if u["user_id"] == self.bob.id)
        self.assertEqual(bob_entry["interest_id"], interest_id)
        self.assertEqual(bob_entry["interest_direction"], "sent")
        self.assertEqual(bob_entry["interest_status"], "pending")

        # Alice cancels the pending interest
        cancel_res = self.client.delete(reverse("cancel_interest", kwargs={"interest_id": interest_id}))
        self.assertEqual(cancel_res.status_code, status.HTTP_200_OK)
        self.assertFalse(Interest.objects.filter(id=interest_id).exists())

        # Alice re-sends interest to Bob
        send_res2 = self.client.post(
            reverse("send_interest", kwargs={"user_id": self.bob.id}),
            {"message": "Hi again Bob!"},
            format="json",
        )
        self.assertEqual(send_res2.status_code, status.HTTP_201_CREATED)
        interest_id2 = send_res2.data["data"]["id"]

        # Chat is forbidden before acceptance
        forbidden_res = self.client.get(reverse("chat_messages", kwargs={"partner_id": self.bob.id}))
        self.assertEqual(forbidden_res.status_code, status.HTTP_403_FORBIDDEN)

        # Bob views received requests and accepts
        self.client.force_authenticate(user=self.bob)
        recv_res = self.client.get(reverse("received_interests"))
        self.assertEqual(recv_res.status_code, status.HTTP_200_OK)
        self.assertEqual(recv_res.data["count"], 1)

        accept_res = self.client.post(
            reverse("respond_interest", kwargs={"interest_id": interest_id2}),
            {"action": "accept"},
            format="json",
        )
        self.assertEqual(accept_res.status_code, status.HTTP_200_OK)
        self.assertEqual(accept_res.data["data"]["status"], "accepted")

        # Cannot cancel an already accepted request
        self.client.force_authenticate(user=self.alice)
        cancel_accepted = self.client.delete(reverse("cancel_interest", kwargs={"interest_id": interest_id2}))
        self.assertEqual(cancel_accepted.status_code, status.HTTP_400_BAD_REQUEST)

        # Chat REST POST & GET now succeed
        msg_post = self.client.post(
            reverse("chat_messages", kwargs={"partner_id": self.bob.id}),
            {"content": "Hello Bob via REST!"},
            format="json",
        )
        self.assertEqual(msg_post.status_code, status.HTTP_201_CREATED)

        self.client.force_authenticate(user=self.bob)
        conv_res = self.client.get(reverse("get_conversations"))
        self.assertEqual(conv_res.status_code, status.HTTP_200_OK)
        self.assertEqual(len(conv_res.data["data"]), 1)

        msg_get = self.client.get(reverse("chat_messages", kwargs={"partner_id": self.alice.id}))
        self.assertEqual(msg_get.status_code, status.HTTP_200_OK)
        self.assertEqual(len(msg_get.data["data"]), 1)
        self.assertEqual(msg_get.data["data"][0]["content"], "Hello Bob via REST!")
        self.assertTrue(msg_get.data["chat_meta"]["can_close_chat"])

        # User can manually close the chat at any time
        close_ok = self.client.post(reverse("close_chat", kwargs={"partner_id": self.alice.id}))
        self.assertEqual(close_ok.status_code, status.HTTP_200_OK)
        self.assertTrue(close_ok.data["chat_meta"]["is_closed"])

        # Sending new messages after close is blocked
        post_after_close = self.client.post(
            reverse("chat_messages", kwargs={"partner_id": self.alice.id}),
            {"content": "Should fail"},
            format="json",
        )
        self.assertEqual(post_after_close.status_code, status.HTTP_403_FORBIDDEN)


@override_settings(CHANNEL_LAYERS=INMEMORY_CHANNEL_LAYERS)
class WebSocketChatTests(TransactionTestCase):
    def setUp(self):
        self.alice = User.objects.create_user(
            username="ws_alice", email="ws_alice@example.com", password="StrongPassword123!"
        )
        self.bob = User.objects.create_user(
            username="ws_bob", email="ws_bob@example.com", password="StrongPassword123!"
        )
        self.charlie = User.objects.create_user(
            username="ws_charlie", email="ws_charlie@example.com", password="StrongPassword123!"
        )
        Interest.objects.create(sender=self.alice, receiver=self.bob, status="accepted")

        self.alice_token = str(RefreshToken.for_user(self.alice).access_token)
        self.bob_token = str(RefreshToken.for_user(self.bob).access_token)
        self.charlie_token = str(RefreshToken.for_user(self.charlie).access_token)

    async def test_ws_rejects_unauthenticated_and_unconnected(self):
        # Missing token
        comm_no_auth = WebsocketCommunicator(application, f"/ws/chat/{self.bob.id}/")
        connected, code = await comm_no_auth.connect()
        self.assertFalse(connected)
        self.assertEqual(code, 4001)

        # Unconnected user (Charlie -> Alice)
        comm_unconnected = WebsocketCommunicator(
            application, f"/ws/chat/{self.alice.id}/?token={self.charlie_token}"
        )
        connected, code = await comm_unconnected.connect()
        self.assertFalse(connected)
        self.assertEqual(code, 4003)

    async def test_ws_realtime_chat_and_heartbeat(self):
        comm_alice = WebsocketCommunicator(
            application, f"/ws/chat/{self.bob.id}/?token={self.alice_token}"
        )
        comm_bob = WebsocketCommunicator(
            application, f"/ws/chat/{self.alice.id}/?token={self.bob_token}"
        )

        connected_a, _ = await comm_alice.connect()
        connected_b, _ = await comm_bob.connect()
        self.assertTrue(connected_a)
        self.assertTrue(connected_b)

        # Heartbeat ping/pong
        await comm_alice.send_json_to({"type": "ping"})
        pong = await comm_alice.receive_json_from()
        self.assertEqual(pong["type"], "pong")

        # Alice sends a chat message
        await comm_alice.send_json_to({"type": "chat_message", "content": "Real-time hello!"})

        recv_alice = await comm_alice.receive_json_from()
        recv_bob = await comm_bob.receive_json_from()

        self.assertEqual(recv_alice["type"], "chat_message")
        self.assertEqual(recv_alice["message"]["content"], "Real-time hello!")
        self.assertEqual(recv_bob["type"], "chat_message")
        self.assertEqual(recv_bob["message"]["content"], "Real-time hello!")
        self.assertEqual(recv_alice["message"]["id"], recv_bob["message"]["id"])

        await comm_alice.disconnect()
        await comm_bob.disconnect()
