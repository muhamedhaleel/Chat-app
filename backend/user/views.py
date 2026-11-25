from datetime import timedelta
from django.shortcuts import render
from django.db.models import Q
from django.contrib.auth.models import User
from django.utils import timezone

from rest_framework.decorators import api_view, permission_classes, authentication_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework import status
from rest_framework_simplejwt.tokens import RefreshToken

from .models import UserProfile, Interest, Message
from .profile_store import get_extra_profile, set_extra_profile
from .serializers import (
    SignupSerializer,
    LoginSerializer,
    ProfileSerializer,
    PublicProfileSerializer,
    InterestSerializer,
    MessageSerializer
)


@api_view(['POST'])
@authentication_classes([])
@permission_classes([AllowAny])
def signup(request):
    serializer = SignupSerializer(data=request.data)

    if serializer.is_valid():
        user = serializer.save()

        return Response({
            'success': True,
            'message': 'User registered successfully',
            'data': {
                'id': user.id,
                'username': user.username,
                'email': user.email
            }
        }, status=status.HTTP_201_CREATED)

    return Response({
        'success': False,
        'errors': serializer.errors
    }, status=status.HTTP_400_BAD_REQUEST)


@api_view(['POST'])
@authentication_classes([])
@permission_classes([AllowAny])
def login(request):
    serializer = LoginSerializer(data=request.data)

    if serializer.is_valid():
        user = serializer.validated_data['user']
        refresh = RefreshToken.for_user(user)

        return Response({
            'success': True,
            'message': 'Login successful',
            'data': {
                'id': user.id,
                'username': user.username,
                'email': user.email,
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


@api_view(['GET', 'PUT', 'PATCH'])
@permission_classes([IsAuthenticated])
def profile_view(request):
    user = request.user

    if request.method in ['PUT', 'PATCH']:
        first_name = request.data.get('first_name')
        last_name = request.data.get('last_name')
        email = request.data.get('email')
        bio = request.data.get('bio')
        gender = request.data.get('gender')

        if email:
            if User.objects.filter(email__iexact=email).exclude(pk=user.pk).exists():
                return Response({
                    'success': False,
                    'errors': {'email': ['This email is already in use by another account.']}
                }, status=status.HTTP_400_BAD_REQUEST)
            user.email = email

        if first_name is not None:
            user.first_name = first_name
        if last_name is not None:
            user.last_name = last_name

        user.save()

        # Persist gender & bio safely to store
        set_extra_profile(user.id, bio=bio, gender=gender)

        try:
            profile, _ = UserProfile.objects.get_or_create(user=user)
            if bio is not None and hasattr(profile, 'bio'):
                profile.bio = bio
            if gender is not None and hasattr(profile, 'gender'):
                profile.gender = gender
            profile.save()
        except Exception:
            pass

        extra = get_extra_profile(user.id)
        return Response({
            'success': True,
            'message': 'Profile updated successfully',
            'data': {
                'id': user.id,
                'username': user.username,
                'email': user.email,
                'first_name': user.first_name,
                'last_name': user.last_name,
                'bio': extra.get('bio', ''),
                'gender': extra.get('gender', ''),
                'is_blocked': False,
                'date_joined': user.date_joined
            }
        }, status=status.HTTP_200_OK)

    # GET
    extra = get_extra_profile(user.id)
    bio_val = extra.get('bio', '')
    gender_val = extra.get('gender', '')

    try:
        profile, _ = UserProfile.objects.get_or_create(user=user)
        serializer = ProfileSerializer(profile)
        data = dict(serializer.data)
        if not data.get('gender'):
            data['gender'] = gender_val
        if not data.get('bio'):
            data['bio'] = bio_val
        return Response({'success': True, 'data': data}, status=status.HTTP_200_OK)
    except Exception:
        return Response({
            'success': True,
            'data': {
                'id': user.id,
                'username': user.username,
                'email': user.email,
                'first_name': user.first_name,
                'last_name': user.last_name,
                'bio': bio_val,
                'gender': gender_val,
                'is_blocked': False,
                'date_joined': user.date_joined
            }
        }, status=status.HTTP_200_OK)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def browse_users(request):
    """
    Returns other registered members.
    Includes interest status (e.g. pending, accepted, rejected, or none) relative to the logged-in user.
    """
    search_query = request.GET.get('search', '').strip()
    gender_filter = request.GET.get('gender', '').strip()
    completed_only = request.GET.get('completed_only', 'false').lower() == 'true'

    try:
        profiles = UserProfile.objects.filter(
            user__is_active=True,
            is_blocked=False
        ).exclude(user=request.user).select_related('user').order_by('-user__date_joined')

        if completed_only:
            profiles = profiles.filter(~Q(user__first_name=''), ~Q(gender=''))

        if search_query:
            profiles = profiles.filter(
                Q(user__username__icontains=search_query) |
                Q(user__first_name__icontains=search_query) |
                Q(user__last_name__icontains=search_query)
            )

        if gender_filter and gender_filter != 'all':
            profiles = profiles.filter(gender__iexact=gender_filter)

        serializer = PublicProfileSerializer(profiles, many=True)
        users_data = list(serializer.data)

        # Attach existing interest statuses for logged-in user
        sent_map = {
            i.receiver_id: (i.id, i.status) for i in Interest.objects.filter(sender=request.user)
        }
        received_map = {
            i.sender_id: (i.id, i.status) for i in Interest.objects.filter(receiver=request.user)
        }

        for u in users_data:
            uid = u['user_id']
            extra = get_extra_profile(uid)
            if not u.get('gender'):
                u['gender'] = extra.get('gender', '')
            if not u.get('bio'):
                u['bio'] = extra.get('bio', '')

            # Re-check profile completeness with fallback store
            if u.get('first_name') and u.get('gender'):
                u['is_profile_completed'] = True

            if uid in sent_map:
                u['interest_id'] = sent_map[uid][0]
                u['interest_direction'] = 'sent'
                u['interest_status'] = sent_map[uid][1]
            elif uid in received_map:
                u['interest_id'] = received_map[uid][0]
                u['interest_direction'] = 'received'
                u['interest_status'] = received_map[uid][1]
            else:
                u['interest_id'] = None
                u['interest_direction'] = None
                u['interest_status'] = None

        return Response({
            'success': True,
            'count': len(users_data),
            'data': users_data
        }, status=status.HTTP_200_OK)
    except Exception:
        users = User.objects.filter(is_active=True).exclude(id=request.user.id).order_by('-date_joined')
        data = []
        sent_map = {}
        received_map = {}
        try:
            sent_map = {i.receiver_id: (i.id, i.status) for i in Interest.objects.filter(sender=request.user)}
            received_map = {i.sender_id: (i.id, i.status) for i in Interest.objects.filter(receiver=request.user)}
        except Exception:
            pass

        for u in users:
            extra = get_extra_profile(u.id)
            iid = None
            direction = None
            istatus = None
            if u.id in sent_map:
                iid = sent_map[u.id][0]
                direction = 'sent'
                istatus = sent_map[u.id][1]
            elif u.id in received_map:
                iid = received_map[u.id][0]
                direction = 'received'
                istatus = received_map[u.id][1]

            data.append({
                'user_id': u.id,
                'username': u.username,
                'email': u.email,
                'first_name': u.first_name,
                'last_name': u.last_name,
                'bio': extra.get('bio', ''),
                'gender': extra.get('gender', ''),
                'is_profile_completed': bool(u.first_name and extra.get('gender')),
                'date_joined': u.date_joined,
                'interest_id': iid,
                'interest_direction': direction,
                'interest_status': istatus
            })

        return Response({
            'success': True,
            'count': len(data),
            'data': data
        }, status=status.HTTP_200_OK)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def user_detail(request, user_id):
    try:
        profile = UserProfile.objects.select_related('user').get(
            user__id=user_id,
            user__is_active=True,
            is_blocked=False
        )
        serializer = PublicProfileSerializer(profile)
        data = dict(serializer.data)
        extra = get_extra_profile(user_id)
        if not data.get('gender'):
            data['gender'] = extra.get('gender', '')
        if not data.get('bio'):
            data['bio'] = extra.get('bio', '')

        # Check interest relation
        interest = Interest.objects.filter(
            Q(sender=request.user, receiver_id=user_id) |
            Q(sender_id=user_id, receiver=request.user)
        ).first()

        if interest:
            data['interest'] = {
                'id': interest.id,
                'status': interest.status,
                'is_sender': (interest.sender_id == request.user.id),
                'message': interest.message
            }
        else:
            data['interest'] = None

        return Response({'success': True, 'data': data}, status=status.HTTP_200_OK)
    except Exception:
        return Response({'success': False, 'message': 'User not found'}, status=status.HTTP_404_NOT_FOUND)


# ==============================================================================
# Interest System Views (Send, View Received, View Sent, Accept/Reject)
# ==============================================================================

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def send_interest(request, user_id):
    if request.user.id == user_id:
        return Response({
            'success': False,
            'message': 'You cannot send an interest request to yourself.'
        }, status=status.HTTP_400_BAD_REQUEST)

    try:
        target_user = User.objects.get(id=user_id, is_active=True)
    except User.DoesNotExist:
        return Response({
            'success': False,
            'message': 'Target user not found or is inactive.'
        }, status=status.HTTP_404_NOT_FOUND)

    message = request.data.get('message', '').strip()
    if not message:
        message = f"Hello {target_user.first_name or target_user.username}, I would like to connect with you!"

    existing_sent = Interest.objects.filter(sender=request.user, receiver=target_user).first()
    if existing_sent:
        if existing_sent.status == 'pending':
            return Response({
                'success': False,
                'message': 'You have already sent an interest request to this user.'
            }, status=status.HTTP_400_BAD_REQUEST)
        elif existing_sent.status == 'accepted':
            return Response({
                'success': True,
                'message': 'You are already connected with this user.'
            }, status=status.HTTP_200_OK)
        else:
            existing_sent.status = 'pending'
            existing_sent.message = message
            existing_sent.save()
            return Response({
                'success': True,
                'message': 'Interest request re-sent successfully.',
                'data': InterestSerializer(existing_sent).data
            }, status=status.HTTP_200_OK)

    existing_received = Interest.objects.filter(sender=target_user, receiver=request.user).first()
    if existing_received:
        existing_received.status = 'accepted'
        existing_received.save()
        return Response({
            'success': True,
            'message': f'{target_user.username} had already sent you an interest! You are now connected.',
            'data': InterestSerializer(existing_received).data
        }, status=status.HTTP_200_OK)

    interest = Interest.objects.create(
        sender=request.user,
        receiver=target_user,
        message=message,
        status='pending'
    )

    return Response({
        'success': True,
        'message': f'Interest sent to {target_user.username} successfully!',
        'data': InterestSerializer(interest).data
    }, status=status.HTTP_201_CREATED)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def received_interests(request):
    try:
        interests = Interest.objects.filter(receiver=request.user).select_related('sender').order_by('-created_at')
        serializer = InterestSerializer(interests, many=True)
        return Response({
            'success': True,
            'count': len(serializer.data),
            'data': serializer.data
        }, status=status.HTTP_200_OK)
    except Exception:
        return Response({'success': True, 'count': 0, 'data': []}, status=status.HTTP_200_OK)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def sent_interests(request):
    try:
        interests = Interest.objects.filter(sender=request.user).select_related('receiver').order_by('-created_at')
        serializer = InterestSerializer(interests, many=True)
        return Response({
            'success': True,
            'count': len(serializer.data),
            'data': serializer.data
        }, status=status.HTTP_200_OK)
    except Exception:
        return Response({'success': True, 'count': 0, 'data': []}, status=status.HTTP_200_OK)


@api_view(['DELETE', 'POST'])
@permission_classes([IsAuthenticated])
def cancel_interest(request, interest_id):
    """
    Allows the sender to cancel a pending interest request.
    """
    try:
        interest = Interest.objects.select_related('receiver').get(id=interest_id, sender=request.user)
    except Interest.DoesNotExist:
        return Response({
            'success': False,
            'message': 'Sent interest request not found.'
        }, status=status.HTTP_404_NOT_FOUND)

    if interest.status != 'pending':
        return Response({
            'success': False,
            'message': 'Only pending interest requests can be cancelled.'
        }, status=status.HTTP_400_BAD_REQUEST)

    receiver_name = interest.receiver.first_name or interest.receiver.username
    interest.delete()

    return Response({
        'success': True,
        'message': f'Interest request to {receiver_name} has been cancelled.'
    }, status=status.HTTP_200_OK)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def respond_interest(request, interest_id):
    action = request.data.get('action', '').lower().strip()
    if action not in ['accept', 'reject']:
        return Response({
            'success': False,
            'message': "Action must be either 'accept' or 'reject'."
        }, status=status.HTTP_400_BAD_REQUEST)

    try:
        interest = Interest.objects.select_related('sender', 'receiver').get(id=interest_id, receiver=request.user)
    except Interest.DoesNotExist:
        return Response({
            'success': False,
            'message': 'Interest request not found or does not belong to you.'
        }, status=status.HTTP_404_NOT_FOUND)

    new_status = 'accepted' if action == 'accept' else 'rejected'
    interest.status = new_status
    interest.save()

    sender_name = interest.sender.first_name or interest.sender.username
    msg = f"Interest request from {sender_name} accepted! You can now chat in real-time." if action == 'accept' else f"Interest request from {sender_name} rejected."

    return Response({
        'success': True,
        'message': msg,
        'data': InterestSerializer(interest).data
    }, status=status.HTTP_200_OK)


# ==============================================================================
# Chat System Views (Enabled only for accepted matches)
# ==============================================================================

def _get_chat_close_meta(interest):
    """
    Returns close-chat metadata for an accepted/closed Interest.
    Either participant can close an active chat manually at any time.
    """
    is_closed = interest.status == 'closed'
    if is_closed:
        return {
            'status': 'closed',
            'is_closed': True,
            'can_close_chat': False,
            'accepted_at': interest.updated_at.isoformat(),
        }

    return {
        'status': 'accepted',
        'is_closed': False,
        'can_close_chat': True,
        'accepted_at': interest.updated_at.isoformat(),
    }


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_conversations(request):
    """
    Returns all mutual accepted (and closed) connections ready for chat.
    """
    user = request.user
    try:
        accepted_interests = Interest.objects.filter(
            (Q(sender=user) | Q(receiver=user)),
            status__in=['accepted', 'closed']
        ).select_related('sender', 'receiver').order_by('-updated_at')

        conversations = []
        seen_partners = set()

        for item in accepted_interests:
            partner = item.receiver if item.sender_id == user.id else item.sender
            if partner.id in seen_partners:
                continue
            seen_partners.add(partner.id)

            try:
                last_msg = Message.objects.filter(
                    (Q(sender=user, receiver=partner) | Q(sender=partner, receiver=user))
                ).order_by('-created_at').first()

                unread = Message.objects.filter(sender=partner, receiver=user, is_read=False).count()
            except Exception:
                last_msg = None
                unread = 0

            extra = get_extra_profile(partner.id)
            partner_gender = extra.get('gender', '')
            if not partner_gender:
                try:
                    partner_gender = partner.profile.gender or ''
                except Exception:
                    partner_gender = ''

            close_meta = _get_chat_close_meta(item)

            conversations.append({
                'partner_id': partner.id,
                'partner_username': partner.username,
                'partner_first_name': partner.first_name,
                'partner_last_name': partner.last_name,
                'partner_gender': partner_gender,
                'last_message': last_msg.content if last_msg else (item.message or 'Matched! Start chatting.'),
                'last_message_time': last_msg.created_at if last_msg else item.updated_at,
                'unread_count': unread,
                **close_meta,
            })

        return Response({'success': True, 'data': conversations}, status=status.HTTP_200_OK)
    except Exception:
        return Response({'success': True, 'data': []}, status=status.HTTP_200_OK)


@api_view(['GET', 'POST'])
@permission_classes([IsAuthenticated])
def chat_messages(request, partner_id):
    """
    GET: Retrieve message history between logged-in user and partner_id.
    POST: Send message to partner_id (requires mutual accepted interest, not closed).
    """
    user = request.user

    interest = Interest.objects.filter(
        (Q(sender=user, receiver_id=partner_id) | Q(sender_id=partner_id, receiver=user)),
        status__in=['accepted', 'closed']
    ).first()

    if not interest:
        return Response({
            'success': False,
            'message': 'You can only chat with members whose interest has been accepted.'
        }, status=status.HTTP_403_FORBIDDEN)

    try:
        partner = User.objects.get(id=partner_id, is_active=True)
    except User.DoesNotExist:
        return Response({'success': False, 'message': 'Partner user not found.'}, status=status.HTTP_404_NOT_FOUND)

    if request.method == 'GET':
        try:
            messages = Message.objects.filter(
                (Q(sender=user, receiver=partner) | Q(sender=partner, receiver=user))
            ).order_by('created_at')

            Message.objects.filter(sender=partner, receiver=user, is_read=False).update(is_read=True)

            serializer = MessageSerializer(messages, many=True)
            return Response({
                'success': True,
                'data': serializer.data,
                'chat_meta': _get_chat_close_meta(interest),
            }, status=status.HTTP_200_OK)
        except Exception:
            return Response({
                'success': True,
                'data': [],
                'chat_meta': _get_chat_close_meta(interest),
            }, status=status.HTTP_200_OK)

    elif request.method == 'POST':
        if interest.status == 'closed':
            return Response({
                'success': False,
                'message': 'This chat has been closed and no new messages can be sent.'
            }, status=status.HTTP_403_FORBIDDEN)

        content = request.data.get('content', '').strip()
        if not content:
            return Response({'success': False, 'message': 'Message cannot be empty.'}, status=status.HTTP_400_BAD_REQUEST)

        msg = Message.objects.create(
            sender=user,
            receiver=partner,
            content=content
        )
        serializer = MessageSerializer(msg)
        msg_data = dict(serializer.data)
        msg_data['sender_first_name'] = user.first_name
        msg_data['created_at'] = msg.created_at.isoformat()

        # Broadcast to WebSocket room so live recipients receive REST-sent messages immediately
        try:
            from asgiref.sync import async_to_sync
            from channels.layers import get_channel_layer
            channel_layer = get_channel_layer()
            if channel_layer is not None:
                lo, hi = sorted([user.id, partner.id])
                async_to_sync(channel_layer.group_send)(
                    f"chat_{lo}_{hi}",
                    {
                        "type": "chat.message",
                        "message": msg_data,
                    },
                )
        except Exception:
            pass

        return Response({'success': True, 'data': serializer.data}, status=status.HTTP_201_CREATED)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def close_chat(request, partner_id):
    """
    Allows either participant to manually close an accepted chat at any time.
    """
    user = request.user
    interest = Interest.objects.filter(
        (Q(sender=user, receiver_id=partner_id) | Q(sender_id=partner_id, receiver=user)),
        status__in=['accepted', 'closed']
    ).first()

    if not interest:
        return Response({
            'success': False,
            'message': 'No active chat connection found with this user.'
        }, status=status.HTTP_403_FORBIDDEN)

    if interest.status == 'closed':
        return Response({
            'success': False,
            'message': 'This chat is already closed.'
        }, status=status.HTTP_400_BAD_REQUEST)

    interest.status = 'closed'
    interest.save()

    # Notify connected WebSocket clients in real time
    try:
        from asgiref.sync import async_to_sync
        from channels.layers import get_channel_layer
        channel_layer = get_channel_layer()
        if channel_layer is not None:
            lo, hi = sorted([user.id, int(partner_id)])
            async_to_sync(channel_layer.group_send)(
                f"chat_{lo}_{hi}",
                {
                    "type": "chat.closed",
                    "closed_by": user.username,
                },
            )
    except Exception:
        pass

    return Response({
        'success': True,
        'message': 'Chat has been closed.',
        'chat_meta': _get_chat_close_meta(interest),
    }, status=status.HTTP_200_OK)
