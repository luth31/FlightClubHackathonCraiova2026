from datetime import datetime, timedelta, timezone
from io import BytesIO
from urllib.parse import quote
from uuid import uuid4
import warnings

from PIL import Image, ImageOps, UnidentifiedImageError
from sqlalchemy import text
from app.core.exceptions import DomainError
from app.people.models import User, UserProfile

MAX_PHOTO_BYTES = 2 * 1024 * 1024
MAX_PHOTO_PIXELS = 16_000_000


def utc_now():
    return datetime.now(timezone.utc)


def profile_dict(profile, now=None):
    now = now or utc_now()
    presence_active = profile and (not profile.presence_expires_at or datetime.fromisoformat(profile.presence_expires_at) > now)
    message_active = profile and (not profile.message_expires_at or datetime.fromisoformat(profile.message_expires_at) > now)
    return {
        'presence': profile.presence if presence_active else 'automatic',
        'presence_expires_at': profile.presence_expires_at if presence_active else None,
        'status_message': profile.status_message if message_active else '',
        'message_expires_at': profile.message_expires_at if message_active else None,
        'photo_url': f'/api/people/{quote(profile.user_id, safe="")}/photo?v={profile.photo_revision}' if profile and profile.photo_revision else None,
    }


def own_profile(db, user):
    return profile_dict(db.get(UserProfile, user.id))


def writable_profile(db, user):
    # Serialize first creation and independent field updates in the SQLite workspace.
    db.execute(text('BEGIN IMMEDIATE'))
    profile = db.get(UserProfile, user.id)
    if profile is None:
        profile = UserProfile(user_id=user.id, presence='automatic', status_message='')
        db.add(profile)
    return profile


def expiry(minutes):
    return (utc_now() + timedelta(minutes=minutes)).isoformat() if minutes else None


def set_presence(db, user, payload):
    profile = writable_profile(db, user)
    profile.presence = payload.status
    profile.presence_expires_at = expiry(payload.duration_minutes) if payload.status != 'automatic' else None
    db.commit()
    return profile_dict(profile)


def set_message(db, user, payload):
    profile = writable_profile(db, user)
    profile.status_message = payload.message.strip()
    profile.message_expires_at = expiry(payload.duration_minutes) if profile.status_message else None
    db.commit()
    return profile_dict(profile)


def normalized_photo(content):
    if not content or len(content) > MAX_PHOTO_BYTES:
        raise DomainError('Alege o fotografie de cel mult 2 MB.', 422)
    try:
        with warnings.catch_warnings():
            warnings.simplefilter('error', Image.DecompressionBombWarning)
            with Image.open(BytesIO(content)) as image:
                if image.format not in ('JPEG', 'PNG', 'WEBP'):
                    raise DomainError('Folosește o fotografie JPG, PNG sau WebP.', 422)
                if image.width * image.height > MAX_PHOTO_PIXELS:
                    raise DomainError('Fotografia poate avea cel mult 16 megapixeli.', 422)
                image.load()
                square = ImageOps.fit(ImageOps.exif_transpose(image).convert('RGB'), (256, 256), method=Image.Resampling.LANCZOS)
                # A fresh image drops metadata, including location and EXIF data.
                clean = Image.new('RGB', square.size)
                clean.paste(square)
                output = BytesIO()
                clean.save(output, format='PNG')
                return output.getvalue()
    except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError, Image.DecompressionBombWarning):
        raise DomainError('Fotografia nu poate fi citită. Alege un fișier JPG, PNG sau WebP valid.', 422)


def set_photo(db, user, content):
    photo = normalized_photo(content)
    profile = writable_profile(db, user)
    profile.photo = photo
    profile.photo_revision = uuid4().hex
    db.commit()
    return profile_dict(profile)


def remove_photo(db, user):
    profile = writable_profile(db, user)
    profile.photo = None
    profile.photo_revision = None
    db.commit()
    return profile_dict(profile)


def read_photo(db, user, user_id):
    subject = db.get(User, user_id)
    if not subject or subject.airport_id != user.airport_id:
        raise DomainError('Fotografia nu a fost găsită.', 404)
    profile = db.get(UserProfile, subject.id)
    if not profile or not profile.photo:
        raise DomainError('Fotografia nu a fost găsită.', 404)
    return profile.photo
