from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('user', '0004_message'),
    ]

    operations = [
        migrations.AlterField(
            model_name='interest',
            name='status',
            field=models.CharField(
                choices=[
                    ('pending', 'Pending'),
                    ('accepted', 'Accepted'),
                    ('rejected', 'Rejected'),
                    ('closed', 'Closed'),
                ],
                default='pending',
                max_length=20,
            ),
        ),
    ]
