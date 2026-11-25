from rest_framework import serializers
from django.contrib.auth import authenticate
from django.contrib.auth.models import User
from django.contrib.auth.password_validation import validate_password

from user.models import UserProfile, Interest
from user.profile_store import get_extra_profile, set_extra_profile


class AdminLoginSerializer(serializers.Serializer):
    username = serializers.CharField(required=True)
    password = serializers.CharField(write_only=True, required=True)

    def validate(self, attrs):
        username = attrs.get('username')
        password = attrs.get('password')

        if not username or not password:
            raise serializers.ValidationError("Both username/email and password are required.")

        user = None
        if '@' in username:
            user_obj = User.objects.filter(email__iexact=username).first()
            if user_obj:
                user = authenticate(username=user_obj.username, password=password)
        else:
            user = authenticate(username=username, password=password)

        if not user:
            raise serializers.ValidationError("Invalid admin credentials.")

        if not user.is_active:
            raise serializers.ValidationError("This account is inactive.")

        if not (user.is_staff or user.is_superuser):
            raise serializers.ValidationError("Access denied. Administrator privileges required.")

        attrs['user'] = user
        return attrs


class AdminUserListSerializer(serializers.ModelSerializer):
    bio = serializers.SerializerMethodField()
    gender = serializers.SerializerMethodField()
    is_blocked = serializers.SerializerMethodField()
    sent_interests_count = serializers.SerializerMethodField()
    received_interests_count = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            'id',
            'username',
            'email',
            'first_name',
            'last_name',
            'is_active',
            'is_staff',
            'is_superuser',
            'date_joined',
            'bio',
            'gender',
            'is_blocked',
            'sent_interests_count',
            'received_interests_count',
        ]

    def get_bio(self, obj):
        extra = get_extra_profile(obj.id)
        if extra.get('bio'):
            return extra['bio']
        try:
            return getattr(obj.profile, 'bio', '')
        except Exception:
            return ''

    def get_gender(self, obj):
        extra = get_extra_profile(obj.id)
        if extra.get('gender'):
            return extra['gender']
        try:
            return getattr(obj.profile, 'gender', '')
        except Exception:
            return ''

    def get_is_blocked(self, obj):
        try:
            return bool(obj.profile.is_blocked)
        except Exception:
            return False

    def get_sent_interests_count(self, obj):
        try:
            return Interest.objects.filter(sender=obj).count()
        except Exception:
            return 0

    def get_received_interests_count(self, obj):
        try:
            return Interest.objects.filter(receiver=obj).count()
        except Exception:
            return 0


class AdminCreateUserSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, validators=[validate_password])
    first_name = serializers.CharField(required=False, allow_blank=True, default='')
    last_name = serializers.CharField(required=False, allow_blank=True, default='')
    bio = serializers.CharField(required=False, allow_blank=True, default='')
    gender = serializers.CharField(required=False, allow_blank=True, default='')
    is_staff = serializers.BooleanField(required=False, default=False)

    class Meta:
        model = User
        fields = ['username', 'email', 'password', 'first_name', 'last_name', 'bio', 'gender', 'is_staff']

    def validate_email(self, value):
        if not value:
            raise serializers.ValidationError("Email is required.")
        if User.objects.filter(email__iexact=value).exists():
            raise serializers.ValidationError("Email already registered.")
        return value

    def create(self, validated_data):
        bio = validated_data.pop('bio', '')
        gender = validated_data.pop('gender', '')
        is_staff = validated_data.pop('is_staff', False)

        user = User.objects.create_user(
            username=validated_data['username'],
            email=validated_data['email'],
            password=validated_data['password'],
            first_name=validated_data.get('first_name', ''),
            last_name=validated_data.get('last_name', ''),
        )
        if is_staff:
            user.is_staff = True
            user.save()

        set_extra_profile(user.id, bio=bio, gender=gender)
        try:
            UserProfile.objects.update_or_create(
                user=user,
                defaults={'bio': bio, 'gender': gender}
            )
        except Exception:
            pass

        return user
