from django.apps import AppConfig


class ChatAdminConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'admin'
    label = 'chat_admin'
    verbose_name = 'Custom Admin Module'
