from rest_framework import serializers
from django.contrib.auth import authenticate
from django.contrib.auth.models import User
from django.contrib.auth.password_validation import validate_password

from .models import UserProfile, Interest, Message
from .profile_store import get_extra_profile, set_extra_profile


class SignupSerializer(serializers.ModelSerializer):

    password = serializers.CharField(
        write_only=True,
        validators=[validate_password]
    )

    class Meta:
        model = User
        fields = ['username', 'email', 'password']

    def validate_email(self, value):
        if User.objects.filter(email__iexact=value).exists():
            raise serializers.ValidationError(
                "Email already registered."
            )
        return value

    def create(self, validated_data):
        user = User.objects.create_user(**validated_data)
        try:
            UserProfile.objects.get_or_create(user=user)
        except Exception:
            pass
        return user


class LoginSerializer(serializers.Serializer):
    username = serializers.CharField(required=True)
    password = serializers.CharField(write_only=True, required=True)

    def validate(self, attrs):
        username = attrs.get('username')
        password = attrs.get('password')

        if not username or not password:
            raise serializers.ValidationError("Both username/email and password are required.")

        user = None
        # Support login via email or username
        if '@' in username:
            try:
                user_obj = User.objects.get(email__iexact=username)
                user = authenticate(username=user_obj.username, password=password)
            except User.DoesNotExist:
                user = None
            except User.MultipleObjectsReturned:
                user_obj = User.objects.filter(email__iexact=username).first()
                if user_obj:
                    user = authenticate(username=user_obj.username, password=password)
        else:
            user = authenticate(username=username, password=password)

        if not user:
            raise serializers.ValidationError("Invalid credentials. Please check your username/email and password.")

        if not user.is_active:
            raise serializers.ValidationError("This account is inactive.")

        try:
            if hasattr(user, 'profile') and user.profile.is_blocked:
                raise serializers.ValidationError("Your account has been blocked. Please contact an administrator.")
        except serializers.ValidationError:
            raise
        except Exception:
            pass

        attrs['user'] = user
        return attrs


class ProfileSerializer(serializers.ModelSerializer):
    # Chat compares this id with Message.sender_id, which is the auth user pk.
    id = serializers.IntegerField(source='user.id', read_only=True)
    username = serializers.CharField(source='user.username', read_only=True)
    email = serializers.EmailField(source='user.email')
    first_name = serializers.CharField(source='user.first_name', allow_blank=True, required=False)
    last_name = serializers.CharField(source='user.last_name', allow_blank=True, required=False)
    bio = serializers.SerializerMethodField()
    gender = serializers.SerializerMethodField()
    date_joined = serializers.DateTimeField(source='user.date_joined', read_only=True)

    class Meta:
        model = UserProfile
        fields = ['id', 'username', 'email', 'first_name', 'last_name', 'bio', 'gender', 'is_blocked', 'date_joined']
        read_only_fields = ['id', 'username', 'is_blocked', 'date_joined']

    def get_bio(self, obj):
        extra = get_extra_profile(obj.user.id)
        if extra.get('bio'):
            return extra['bio']
        try:
            return getattr(obj, 'bio', '')
        except Exception:
            return ''

    def get_gender(self, obj):
        extra = get_extra_profile(obj.user.id)
        if extra.get('gender'):
            return extra['gender']
        try:
            return getattr(obj, 'gender', '')
        except Exception:
            return ''

    def update(self, instance, validated_data):
        user_data = validated_data.pop('user', {})
        user = instance.user

        # Get values from initial_data as primary fallback
        first_name = self.initial_data.get('first_name', user_data.get('first_name'))
        last_name = self.initial_data.get('last_name', user_data.get('last_name'))
        email = self.initial_data.get('email', user_data.get('email'))
        gender = self.initial_data.get('gender', validated_data.get('gender'))
        bio = self.initial_data.get('bio', validated_data.get('bio'))

        if email:
            if User.objects.filter(email__iexact=email).exclude(pk=user.pk).exists():
                raise serializers.ValidationError({"email": ["This email is already in use by another account."]})
            user.email = email

        if first_name is not None:
            user.first_name = first_name

        if last_name is not None:
            user.last_name = last_name

        user.save()

        # Save extra fields safely to JSON profile store
        set_extra_profile(user.id, bio=bio, gender=gender)

        # Also try saving to UserProfile model if columns exist
        try:
            if bio is not None and hasattr(instance, 'bio'):
                instance.bio = bio
            if gender is not None and hasattr(instance, 'gender'):
                instance.gender = gender
            instance.save()
        except Exception:
            pass

        return instance


class PublicProfileSerializer(serializers.ModelSerializer):
    username = serializers.CharField(source='user.username', read_only=True)
    email = serializers.EmailField(source='user.email', read_only=True)
    first_name = serializers.CharField(source='user.first_name', read_only=True)
    last_name = serializers.CharField(source='user.last_name', read_only=True)
    date_joined = serializers.DateTimeField(source='user.date_joined', read_only=True)
    user_id = serializers.IntegerField(source='user.id', read_only=True)
    bio = serializers.SerializerMethodField()
    gender = serializers.SerializerMethodField()
    is_profile_completed = serializers.SerializerMethodField()

    class Meta:
        model = UserProfile
        fields = ['user_id', 'username', 'email', 'first_name', 'last_name', 'bio', 'gender', 'is_profile_completed', 'date_joined']

    def get_bio(self, obj):
        extra = get_extra_profile(obj.user.id)
        if extra.get('bio'):
            return extra['bio']
        try:
            return getattr(obj, 'bio', '')
        except Exception:
            return ''

    def get_gender(self, obj):
        extra = get_extra_profile(obj.user.id)
        if extra.get('gender'):
            return extra['gender']
        try:
            return getattr(obj, 'gender', '')
        except Exception:
            return ''

    def get_is_profile_completed(self, obj):
        first_name = getattr(obj.user, 'first_name', '')
        gender = self.get_gender(obj)
        return bool(first_name and gender)


class InterestSerializer(serializers.ModelSerializer):
    sender_id = serializers.IntegerField(source='sender.id', read_only=True)
    sender_username = serializers.CharField(source='sender.username', read_only=True)
    sender_first_name = serializers.CharField(source='sender.first_name', read_only=True)
    sender_last_name = serializers.CharField(source='sender.last_name', read_only=True)
    sender_gender = serializers.SerializerMethodField()

    receiver_id = serializers.IntegerField(source='receiver.id', read_only=True)
    receiver_username = serializers.CharField(source='receiver.username', read_only=True)
    receiver_first_name = serializers.CharField(source='receiver.first_name', read_only=True)
    receiver_last_name = serializers.CharField(source='receiver.last_name', read_only=True)
    receiver_gender = serializers.SerializerMethodField()

    class Meta:
        model = Interest
        fields = [
            'id',
            'sender_id',
            'sender_username',
            'sender_first_name',
            'sender_last_name',
            'sender_gender',
            'receiver_id',
            'receiver_username',
            'receiver_first_name',
            'receiver_last_name',
            'receiver_gender',
            'message',
            'status',
            'created_at',
            'updated_at'
        ]
        read_only_fields = ['id', 'status', 'created_at', 'updated_at']

    def get_sender_gender(self, obj):
        extra = get_extra_profile(obj.sender.id)
        if extra.get('gender'):
            return extra['gender']
        try:
            return getattr(obj.sender.profile, 'gender', '')
        except Exception:
            return ''

    def get_receiver_gender(self, obj):
        extra = get_extra_profile(obj.receiver.id)
        if extra.get('gender'):
            return extra['gender']
        try:
            return getattr(obj.receiver.profile, 'gender', '')
        except Exception:
            return ''


class MessageSerializer(serializers.ModelSerializer):
    sender_id = serializers.IntegerField(source='sender.id', read_only=True)
    sender_username = serializers.CharField(source='sender.username', read_only=True)
    receiver_id = serializers.IntegerField(source='receiver.id', read_only=True)
    receiver_username = serializers.CharField(source='receiver.username', read_only=True)

    class Meta:
        model = Message
        fields = ['id', 'sender_id', 'sender_username', 'receiver_id', 'receiver_username', 'content', 'is_read', 'created_at']
        read_only_fields = ['id', 'sender_id', 'sender_username', 'receiver_id', 'receiver_username', 'is_read', 'created_at']
