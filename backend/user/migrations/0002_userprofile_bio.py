from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('user', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='userprofile',
            name='bio',
            field=models.TextField(blank=True, default=''),
        ),
        migrations.AddField(
            model_name='userprofile',
            name='gender',
            field=models.CharField(
                blank=True,
                choices=[
                    ('male', 'Male'),
                    ('female', 'Female'),
                    ('other', 'Other'),
                    ('prefer_not_to_say', 'Prefer not to say')
                ],
                default='',
                max_length=20
            ),
        ),
    ]
