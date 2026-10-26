from __future__ import annotations

import threading
from pathlib import Path
from typing import TYPE_CHECKING, Any

from app.config import settings

if TYPE_CHECKING:
    from app.item.model import Item


TEXT_MODEL_NAME = settings.ai_text_model
TEXT_EMBEDDING_DIMENSIONS = settings.ai_text_dimensions
IMAGE_MODEL_NAME = settings.ai_image_model
IMAGE_EMBEDDING_DIMENSIONS = settings.ai_image_dimensions


class EmbeddingError(Exception):
    pass


_text_model: Any | None = None
_image_model: Any | None = None
_image_processor: Any | None = None
_text_lock = threading.Lock()
_image_lock = threading.Lock()


def build_item_text(item: Item) -> str:
    parts = [
        f"Type: {item.type.value}",
        f"Title: {item.title}",
        f"Description: {item.description}",
        f"Category: {item.category}",
    ]
    if item.brand:
        parts.append(f"Brand: {item.brand}")
    if item.color:
        parts.append(f"Color: {item.color}")
    parts.append(f"Location: {item.location}")
    return "\n".join(parts)


def encode_texts(texts: list[str]) -> list[list[float]]:
    if not texts:
        return []

    model = _get_text_model()
    with _text_lock:
        vectors = model.encode(
            texts,
            batch_size=16,
            normalize_embeddings=True,
            convert_to_numpy=True,
            show_progress_bar=False,
        )

    rows = vectors.tolist()
    for row in rows:
        if len(row) != TEXT_EMBEDDING_DIMENSIONS:
            raise EmbeddingError(
                f"Text model returned {len(row)} dimensions, "
                f"expected {TEXT_EMBEDDING_DIMENSIONS}"
            )
    return rows


def encode_images(paths: list[Path]) -> list[list[float]]:
    if not paths:
        return []

    from PIL import Image

    images = []
    try:
        for path in paths:
            with Image.open(path) as source:
                images.append(source.convert("RGB"))
    except OSError as exc:
        raise EmbeddingError(f"Could not read item image: {exc}") from exc

    model, processor = _get_image_model()
    with _image_lock:
        inputs = processor(images=images, return_tensors="pt")
        inputs = {name: value.to(settings.ai_device) for name, value in inputs.items()}

        import torch

        with torch.inference_mode():
            result = model.get_image_features(**inputs)

        if isinstance(result, torch.Tensor):
            features = result
        else:
            features = getattr(result, "pooler_output", None)
            if features is None:
                raise EmbeddingError("CLIP image encoder returned no pooled output")

        features = torch.nn.functional.normalize(features, p=2, dim=-1)

    rows = features.detach().cpu().tolist()
    for row in rows:
        if len(row) != IMAGE_EMBEDDING_DIMENSIONS:
            raise EmbeddingError(
                f"Image model returned {len(row)} dimensions, "
                f"expected {IMAGE_EMBEDDING_DIMENSIONS}"
            )
    return rows


def _get_text_model() -> Any:
    global _text_model
    if _text_model is not None:
        return _text_model

    with _text_lock:
        if _text_model is None:
            try:
                from sentence_transformers import SentenceTransformer

                model = SentenceTransformer(
                    TEXT_MODEL_NAME,
                    device=settings.ai_device,
                )
                model.eval()
            except Exception as exc:
                raise EmbeddingError(
                    f"Could not load text embedding model {TEXT_MODEL_NAME}: {exc}"
                ) from exc
            _text_model = model

    return _text_model


def _get_image_model() -> tuple[Any, Any]:
    global _image_model, _image_processor
    if _image_model is not None and _image_processor is not None:
        return _image_model, _image_processor

    with _image_lock:
        if _image_model is None or _image_processor is None:
            try:
                from transformers import CLIPModel, CLIPProcessor

                model = CLIPModel.from_pretrained(IMAGE_MODEL_NAME)
                processor = CLIPProcessor.from_pretrained(IMAGE_MODEL_NAME)
                model.to(settings.ai_device)
                model.eval()
            except Exception as exc:
                raise EmbeddingError(
                    f"Could not load image embedding model {IMAGE_MODEL_NAME}: {exc}"
                ) from exc
            _image_model = model
            _image_processor = processor

    return _image_model, _image_processor
