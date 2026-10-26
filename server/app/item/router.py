from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import (
    APIRouter,
    Depends,
    File,
    HTTPException,
    Query,
    UploadFile,
    status,
)
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import get_current_user, get_optional_user
from app.common.schema import Page
from app.config import settings
from app.db.session import get_db
from app.item import service, storage
from app.item.schema import (
    ItemCreate,
    ItemImageRead,
    ItemListQuery,
    ItemRead,
    ItemUpdate,
    MyItemsQuery,
)
from app.rate_limit import upload_rate_limit
from app.user.model import User

router = APIRouter(prefix="/items", tags=["Items"])
media_router = APIRouter(prefix="/media", tags=["Media"])


def _item_http_exception(exc: service.ItemError) -> HTTPException:
    return HTTPException(status_code=exc.status_code, detail=str(exc))


@router.post("", response_model=ItemRead, status_code=status.HTTP_201_CREATED)
async def create_item(
    payload: ItemCreate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ItemRead:
    return await service.create_item(db, actor=current_user, payload=payload)


@router.get("", response_model=Page[ItemRead])
async def list_items(
    query: Annotated[ItemListQuery, Query()],
    current_user: Annotated[User | None, Depends(get_optional_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> Page[ItemRead]:
    return await service.list_items(
        db,
        query,
        viewer_id=current_user.id if current_user is not None else None,
    )


@router.get("/mine", response_model=Page[ItemRead])
async def list_my_items(
    query: Annotated[MyItemsQuery, Query()],
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> Page[ItemRead]:
    return await service.list_my_items(db, actor=current_user, query=query)


@router.get("/{item_id}", response_model=ItemRead)
async def get_item(
    item_id: uuid.UUID,
    current_user: Annotated[User | None, Depends(get_optional_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ItemRead:
    try:
        return await service.get_item(
            db,
            item_id,
            viewer_id=current_user.id if current_user is not None else None,
        )
    except service.ItemError as exc:
        raise _item_http_exception(exc) from exc


@router.patch("/{item_id}", response_model=ItemRead)
async def update_item(
    item_id: uuid.UUID,
    payload: ItemUpdate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ItemRead:
    try:
        return await service.update_item(
            db,
            actor=current_user,
            item_id=item_id,
            payload=payload,
        )
    except service.ItemError as exc:
        raise _item_http_exception(exc) from exc


@router.delete("/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def withdraw_item(
    item_id: uuid.UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> None:
    try:
        await service.withdraw_item(db, actor=current_user, item_id=item_id)
    except service.ItemError as exc:
        raise _item_http_exception(exc) from exc


@router.post("/{item_id}/close", response_model=ItemRead)
async def close_item(
    item_id: uuid.UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ItemRead:
    try:
        return await service.close_item(db, actor=current_user, item_id=item_id)
    except service.ItemError as exc:
        raise _item_http_exception(exc) from exc


@router.post(
    "/{item_id}/images",
    response_model=ItemImageRead,
    status_code=status.HTTP_201_CREATED,
)
async def upload_item_image(
    item_id: uuid.UUID,
    file: Annotated[UploadFile, File()],
    current_user: Annotated[User, Depends(get_current_user)],
    _rate_limit: Annotated[None, Depends(upload_rate_limit)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ItemImageRead:
    data = await file.read(settings.max_image_size_bytes + 1)
    if len(data) > settings.max_image_size_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_CONTENT_TOO_LARGE,
            detail="Image exceeds the size limit",
        )

    try:
        return await service.add_image(
            db,
            actor=current_user,
            item_id=item_id,
            data=data,
        )
    except storage.InvalidImageError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=str(exc),
        ) from exc
    except storage.ImageTooLargeError as exc:
        raise HTTPException(
            status_code=status.HTTP_413_CONTENT_TOO_LARGE,
            detail=str(exc),
        ) from exc
    except storage.StorageError as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not store image",
        ) from exc
    except service.ItemError as exc:
        raise _item_http_exception(exc) from exc
    except OSError as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not store image",
        ) from exc


@router.delete(
    "/{item_id}/images/{image_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_item_image(
    item_id: uuid.UUID,
    image_id: uuid.UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> None:
    try:
        await service.delete_image(
            db,
            actor=current_user,
            item_id=item_id,
            image_id=image_id,
        )
    except service.ItemError as exc:
        raise _item_http_exception(exc) from exc


@media_router.get(
    "/items/{item_id}/images/{image_id}",
    response_class=FileResponse,
)
async def get_media(
    item_id: uuid.UUID,
    image_id: uuid.UUID,
    token: Annotated[str, Query(min_length=1)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> FileResponse:
    if not storage.verify_media_token(token, item_id, image_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid or expired media token",
        )

    try:
        image = await service.get_media_image(
            db,
            item_id=item_id,
            image_id=image_id,
        )
    except service.ItemError as exc:
        raise _item_http_exception(exc) from exc

    try:
        path = storage.resolve_storage_path(image.storage_key)
    except storage.StorageError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Image not found",
        ) from exc

    if not path.is_file():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Image not found",
        )

    return FileResponse(
        path,
        media_type=image.mime_type,
        headers={
            "Cache-Control": f"private, max-age={settings.media_url_expire_seconds}",
            "X-Content-Type-Options": "nosniff",
        },
    )
