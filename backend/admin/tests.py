from django.contrib.auth.models import User
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase, APIClient

from user.models import UserProfile


class AdminApiTests(APITestCase):
    def setUp(self):
        self.client = APIClient()
        self.admin_user = User.objects.create_user(
            username="siteadmin",
            email="admin@example.com",
            password="AdminPassword123!",
            is_staff=True,
            is_superuser=True,
        )
        self.normal_user = User.objects.create_user(
            username="regular",
            email="regular@example.com",
            password="UserPassword123!",
            is_staff=False,
        )
        UserProfile.objects.create(user=self.admin_user)
        UserProfile.objects.create(user=self.normal_user)

    def test_admin_login_permissions(self):
        # Non-staff user cannot log into admin portal
        res_fail = self.client.post(
            reverse("admin_login"),
            {"username": "regular", "password": "UserPassword123!"},
            format="json",
        )
        self.assertEqual(res_fail.status_code, status.HTTP_400_BAD_REQUEST)

        # Staff/superuser can log in
        res_ok = self.client.post(
            reverse("admin_login"),
            {"username": "siteadmin", "password": "AdminPassword123!"},
            format="json",
        )
        self.assertEqual(res_ok.status_code, status.HTTP_200_OK)
        self.assertIn("access", res_ok.data["data"]["tokens"])

    def test_admin_dashboard_create_and_toggle_block(self):
        # Normal user gets 403 on dashboard
        self.client.force_authenticate(user=self.normal_user)
        res_forbidden = self.client.get(reverse("admin_dashboard"))
        self.assertEqual(res_forbidden.status_code, status.HTTP_403_FORBIDDEN)

        # Admin gets stats and user list
        self.client.force_authenticate(user=self.admin_user)
        dash_res = self.client.get(reverse("admin_dashboard"))
        self.assertEqual(dash_res.status_code, status.HTTP_200_OK)
        self.assertEqual(dash_res.data["stats"]["total_users"], 2)
        self.assertEqual(len(dash_res.data["users"]), 2)

        # Admin creates a new user
        create_res = self.client.post(
            reverse("admin_create_user"),
            {
                "username": "created_user",
                "email": "created@example.com",
                "password": "StrongPassword123!",
                "first_name": "Created",
                "last_name": "User",
                "gender": "female",
                "bio": "Added by admin",
            },
            format="json",
        )
        self.assertEqual(create_res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(User.objects.count(), 3)

        # Admin blocks & unblocks normal_user
        block_res = self.client.post(
            reverse("admin_toggle_block_user", kwargs={"user_id": self.normal_user.id})
        )
        self.assertEqual(block_res.status_code, status.HTTP_200_OK)
        self.assertTrue(block_res.data["is_blocked"])

        unblock_res = self.client.post(
            reverse("admin_toggle_block_user", kwargs={"user_id": self.normal_user.id})
        )
        self.assertEqual(unblock_res.status_code, status.HTTP_200_OK)
        self.assertFalse(unblock_res.data["is_blocked"])
