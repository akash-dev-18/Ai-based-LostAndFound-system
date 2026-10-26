from __future__ import annotations

import hashlib
import hmac
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from io import BytesIO
from pathlib import Path

from PIL import Image, ImageOps, UnidentifiedImageError

from app.config import settings


class StorageError(Exception):
    pass


class InvalidImageError(StorageError):
    pass


class ImageTooLargeError(StorageError):
    pass


@dataclass(frozen=True)
class ProcessedImage:
    data: bytes
    mime_type: str
    extension: str
    width: int
    height: int


def process_image(data: bytes) -> ProcessedImage:
    if not data:
        raise InvalidImageError("Image is empty")
    if len(data) > settings.max_image_size_bytes:
        raise ImageTooLargeError("Image exceeds the size limit")

    try:
        with Image.open(BytesIO(data)) as original:
            image_format = original.format
            width, height = original.size
            original.verify()

        if image_format not in {"JPEG", "PNG", "WEBP"}:
            raise InvalidImageError("Only JPEG, PNG and WebP images are allowed")
        if width <= 0 or height <= 0:
            raise InvalidImageError("Image has invalid dimensions")
        if width * height > settings.max_image_pixels:
            raise ImageTooLargeError("Image exceeds the pixel limit")

        with Image.open(BytesIO(data)) as original:
            image = ImageOps.exif_transpose(original)
            width, height = image.size

            if image_format == "JPEG":
                image = image.convert("RGB")
                save_options = {"format": "JPEG", "quality": 90, "optimize": True}
            elif image_format == "PNG":
                if image.mode not in {"RGB", "RGBA", "L", "LA", "P"}:
                    image = image.convert("RGBA" if "A" in image.getbands() else "RGB")
                save_options = {"format": "PNG", "optimize": True}
            else:
                if image.mode not in {"RGB", "RGBA"}:
                    image = image.convert("RGBA" if "A" in image.getbands() else "RGB")
                save_options = {"format": "WEBP", "quality": 90, "method": 6}

            output = BytesIO()
            image.save(output, **save_options)
            processed_data = output.getvalue()
    except (UnidentifiedImageError, OSError) as exc:
        raise InvalidImageError("Unsupported or corrupt image") from exc
    except Image.DecompressionBombError as exc:
        raise ImageTooLargeError("Image exceeds the pixel limit") from exc

    if len(processed_data) > settings.max_image_size_bytes:
        raise ImageTooLargeError("Processed image exceeds the size limit")

    mime_types = {
        "JPEG": "image/jpeg",
        "PNG": "image/png",
        "WEBP": "image/webp",
    }
    extensions = {"JPEG": ".jpg", "PNG": ".png", "WEBP": ".webp"}

    return ProcessedImage(
        data=processed_data,
        mime_type=mime_types[image_format],
        extension=extensions[image_format],
        width=width,
        height=height,
    )


def save_image(item_id: uuid.UUID, image: ProcessedImage) -> str:
    storage_key = f"items/{item_id}/{uuid.uuid4().hex}{image.extension}"
    path = resolve_storage_path(storage_key)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(image.data)
    return storage_key


def delete_image(storage_key: str) -> None:
    resolve_storage_path(storage_key).unlink(missing_ok=True)


def resolve_storage_path(storage_key: str) -> Path:
    root = settings.storage_dir.resolve()
    path = (root / storage_key).resolve()
    if not path.is_relative_to(root):
        raise StorageError("Invalid storage key")
    return path


def build_media_url(item_id: uuid.UUID, image_id: uuid.UUID) -> str:
    expires_at = int(
        (
            datetime.now(UTC) + timedelta(seconds=settings.media_url_expire_seconds)
        ).timestamp()
    )
    signature = _sign(item_id, image_id, expires_at)
    return (
        f"{settings.api_v1_prefix}/media/items/{item_id}/images/{image_id}"
        f"?token={expires_at}.{signature}"
    )


def verify_media_token(token: str, item_id: uuid.UUID, image_id: uuid.UUID) -> bool:
    try:
        expires_text, signature = token.split(".", 1)
        expires_at = int(expires_text)
    except ValueError:
        return False

    if expires_at < int(datetime.now(UTC).timestamp()):
        return False

    expected_signature = _sign(item_id, image_id, expires_at)
    return hmac.compare_digest(signature, expected_signature)


def _sign(item_id: uuid.UUID, image_id: uuid.UUID, expires_at: int) -> str:
    message = f"{item_id}:{image_id}:{expires_at}".encode()
    return hmac.new(
        settings.jwt_secret_key.encode(),
        message,
        hashlib.sha256,
    ).hexdigest()
