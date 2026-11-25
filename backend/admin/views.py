from django.contrib.auth.models import User
from rest_framework import status
from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework_simplejwt.tokens import RefreshToken

from user.models import UserProfile, Interest, Message
from .serializers import (
    AdminLoginSerializer,
    AdminUserListSerializer,
    AdminCreateUserSerializer,
)


def _is_admin(user):
    return bool(user and user.is_authenticated and (user.is_staff or user.is_superuser))


@api_view(['POST'])
@authentication_classes([])
@permission_classes([AllowAny])
def admin_login(request):
    serializer = AdminLoginSerializer(data=request.data)
    if serializer.is_valid():
        user = serializer.validated_data['user']
        refresh = RefreshToken.for_user(user)
        return Response({
            'success': True,
            'message': 'Admin login successful',
            'data': {
                'id': user.id,
                'username': user.username,
                'email': user.email,
                'is_staff': user.is_staff,
                'is_superuser': user.is_superuser,
                'tokens': {
                    'access': str(refresh.access_token),
                    'refresh': str(refresh),
                }
            }
        }, status=status.HTTP_200_OK)

    return Response({
        'success': False,
        'errors': serializer.errors
    }, status=status.HTTP_400_BAD_REQUEST)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def admin_dashboard(request):
    if not _is_admin(request.user):
        return Response({
            'success': False,
            'message': 'Admin privileges required.'
        }, status=status.HTTP_403_FORBIDDEN)

    users_qs = User.objects.all().order_by('-date_joined')
    total_users = users_qs.count()
    active_users = users_qs.filter(is_active=True).count()
    staff_users = users_qs.filter(is_staff=True).count()

    try:
        blocked_users = UserProfile.objects.filter(is_blocked=True).count()
    except Exception:
        blocked_users = 0

    try:
        total_interests = Interest.objects.count()
        pending_interests = Interest.objects.filter(status='pending').count()
        accepted_interests = Interest.objects.filter(status='accepted').count()
        rejected_interests = Interest.objects.filter(status='rejected').count()
    except Exception:
        total_interests = pending_interests = accepted_interests = rejected_interests = 0

    try:
        total_messages = Message.objects.count()
    except Exception:
        total_messages = 0

    search = request.GET.get('search', '').strip()
    if search:
        from django.db.models import Q
        users_qs = users_qs.filter(
            Q(username__icontains=search) |
            Q(email__icontains=search) |
            Q(first_name__icontains=search) |
            Q(last_name__icontains=search)
        )

    users_data = AdminUserListSerializer(users_qs, many=True).data

    return Response({
        'success': True,
        'stats': {
            'total_users': total_users,
            'active_users': active_users,
            'blocked_users': blocked_users,
            'staff_users': staff_users,
            'total_interests': total_interests,
            'pending_interests': pending_interests,
            'accepted_interests': accepted_interests,
            'rejected_interests': rejected_interests,
            'total_messages': total_messages,
        },
        'users': users_data,
    }, status=status.HTTP_200_OK)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def admin_create_user(request):
    if not _is_admin(request.user):
        return Response({
            'success': False,
            'message': 'Admin privileges required.'
        }, status=status.HTTP_403_FORBIDDEN)

    serializer = AdminCreateUserSerializer(data=request.data)
    if serializer.is_valid():
        user = serializer.save()
        return Response({
            'success': True,
            'message': f'User "{user.username}" created successfully.',
            'data': AdminUserListSerializer(user).data
        }, status=status.HTTP_201_CREATED)

    return Response({
        'success': False,
        'errors': serializer.errors
    }, status=status.HTTP_400_BAD_REQUEST)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def admin_toggle_block_user(request, user_id):
    if not _is_admin(request.user):
        return Response({
            'success': False,
            'message': 'Admin privileges required.'
        }, status=status.HTTP_403_FORBIDDEN)

    if request.user.id == user_id:
        return Response({
            'success': False,
            'message': 'You cannot block your own admin account.'
        }, status=status.HTTP_400_BAD_REQUEST)

    try:
        target = User.objects.get(id=user_id)
    except User.DoesNotExist:
        return Response({'success': False, 'message': 'User not found.'}, status=status.HTTP_404_NOT_FOUND)

    profile, _ = UserProfile.objects.get_or_create(user=target)
    profile.is_blocked = not profile.is_blocked
    profile.save()

    action_label = 'blocked' if profile.is_blocked else 'unblocked'
    return Response({
        'success': True,
        'message': f'User "{target.username}" has been {action_label}.',
        'is_blocked': profile.is_blocked,
    }, status=status.HTTP_200_OK)
