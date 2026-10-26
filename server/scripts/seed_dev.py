from __future__ import annotations

import argparse
import asyncio
import uuid
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

from PIL import Image, ImageDraw
from sqlalchemy import delete, select

from app import cache
from app.ai.matching.model import ItemMatch, MatchStatus
from app.ai.model import DocumentChunk, KnowledgeDocument, KnowledgeDocumentStatus
from app.audit.model import AuditLog
from app.auth.security import hash_password
from app.chat.model import (
    Conversation,
    ConversationParticipant,
    ConversationType,
    Message,
)
from app.claim.model import Claim, ClaimStatus
from app.config import settings
from app.db.session import AsyncSessionLocal, engine
from app.item import storage
from app.item.model import (
    Item,
    ItemImage,
    ItemStatus,
    ItemType,
    ProcessingStatus,
)
from app.notification.model import Notification, NotificationType
from app.user.model import User, UserRole

DEMO_PASSWORD = "Campus123!"
SEED_NAMESPACE = uuid.uuid5(uuid.NAMESPACE_URL, "lostfound.dev.seed.v1")
NOW = datetime.now(UTC)


def sid(kind: str, key: str) -> uuid.UUID:
    return uuid.uuid5(SEED_NAMESPACE, f"{kind}:{key}")


def ago(hours: float) -> datetime:
    return NOW - timedelta(hours=hours)


USERS: list[dict[str, Any]] = [
    {
        "key": "student",
        "name": "Avery Chen",
        "email": "student@campus.edu",
        "role": UserRole.USER,
        "is_active": True,
    },
    {
        "key": "finder",
        "name": "Maya Patel",
        "email": "finder@campus.edu",
        "role": UserRole.USER,
        "is_active": True,
    },
    {
        "key": "nina",
        "name": "Nina Alvarez",
        "email": "nina@campus.edu",
        "role": UserRole.USER,
        "is_active": True,
    },
    {
        "key": "manager",
        "name": "Jordan Lee",
        "email": "manager@campus.edu",
        "role": UserRole.MANAGER,
        "is_active": True,
    },
    {
        "key": "admin",
        "name": "Sam Rivera",
        "email": "admin@campus.edu",
        "role": UserRole.ADMIN,
        "is_active": True,
    },
    {
        "key": "disabled",
        "name": "Riley Park",
        "email": "disabled@campus.edu",
        "role": UserRole.USER,
        "is_active": False,
    },
]


ITEMS: list[dict[str, Any]] = [
    {
        "key": "backpack",
        "type": ItemType.FOUND,
        "status": ItemStatus.OPEN,
        "reporter": "finder",
        "title": "Black North Face backpack",
        "description": (
            "Black backpack found beside a study table on the second floor. "
            "There is a laptop sleeve, a small front pocket, and a silver key clip."
        ),
        "category": "Bags",
        "brand": "The North Face",
        "color": "Black",
        "location": "Hartley Library - 2nd floor",
        "occurred_hours_ago": 50,
        "created_hours_ago": 48,
        "image": "backpack",
    },
    {
        "key": "charger",
        "type": ItemType.LOST,
        "status": ItemStatus.OPEN,
        "reporter": "student",
        "title": "Silver MacBook charger",
        "description": (
            "Apple 67W USB-C charger with a white cable. I left it plugged in "
            "near the lounge sofas while charging my laptop."
        ),
        "category": "Electronics",
        "brand": "Apple",
        "color": "Silver",
        "location": "Student Center - Lounge",
        "occurred_hours_ago": 28,
        "created_hours_ago": 26,
        "image": "charger",
    },
    {
        "key": "bottle",
        "type": ItemType.FOUND,
        "status": ItemStatus.OPEN,
        "reporter": "finder",
        "title": "Blue Hydro Flask bottle",
        "description": (
            "Cobalt blue insulated bottle with a few campus stickers on the side. "
            "Found after open court hours near the water fountain."
        ),
        "category": "Bottles",
        "brand": "Hydro Flask",
        "color": "Cobalt",
        "location": "Recreation Center - Court 2",
        "occurred_hours_ago": 74,
        "created_hours_ago": 70,
        "image": "bottle",
    },
    {
        "key": "student-id",
        "type": ItemType.LOST,
        "status": ItemStatus.OPEN,
        "reporter": "nina",
        "title": "Student ID card",
        "description": (
            "White student ID card with a blue lanyard. The photo shows a person "
            "with dark hair and glasses. Last used at the dining hall entrance."
        ),
        "category": "Cards & IDs",
        "brand": None,
        "color": "White",
        "location": "Dining Hall - North entrance",
        "occurred_hours_ago": 7,
        "created_hours_ago": 5,
        "image": "id",
    },
    {
        "key": "airpods",
        "type": ItemType.FOUND,
        "status": ItemStatus.CLAIM_PENDING,
        "reporter": "finder",
        "title": "AirPods Pro in white case",
        "description": (
            "White charging case with a small scratch on the back. Found on a "
            "chair in the engineering building after a late lecture."
        ),
        "category": "Electronics",
        "brand": "Apple",
        "color": "White",
        "location": "Engineering Building - Room 204",
        "occurred_hours_ago": 100,
        "created_hours_ago": 96,
        "image": "airpods",
    },
    {
        "key": "wallet",
        "type": ItemType.FOUND,
        "status": ItemStatus.RESOLVED,
        "reporter": "finder",
        "title": "Brown leather wallet",
        "description": (
            "Brown bifold wallet with a student transit pass inside. Handed to "
            "campus security and claimed by the owner."
        ),
        "category": "Wallets",
        "brand": None,
        "color": "Brown",
        "location": "West Campus bus stop",
        "occurred_hours_ago": 250,
        "created_hours_ago": 244,
        "image": "wallet",
    },
    {
        "key": "glasses-lost",
        "type": ItemType.LOST,
        "status": ItemStatus.OPEN,
        "reporter": "nina",
        "title": "Black-frame prescription glasses",
        "description": (
            "Rectangular black frames in a dark blue case. The case has a small "
            "white sticker on the inside lid."
        ),
        "category": "Accessories",
        "brand": None,
        "color": "Black",
        "location": "Science Library - Quiet floor",
        "occurred_hours_ago": 52,
        "created_hours_ago": 50,
        "image": "glasses",
    },
    {
        "key": "glasses-found",
        "type": ItemType.FOUND,
        "status": ItemStatus.OPEN,
        "reporter": "finder",
        "title": "Black-frame glasses in case",
        "description": (
            "Rectangular black-frame glasses inside a dark blue case. Found on a "
            "reading table near the quiet-floor windows."
        ),
        "category": "Accessories",
        "brand": None,
        "color": "Black",
        "location": "Science Library - Front desk",
        "occurred_hours_ago": 28,
        "created_hours_ago": 26,
        "image": "glasses",
    },
    {
        "key": "hoodie",
        "type": ItemType.LOST,
        "status": ItemStatus.OPEN,
        "reporter": "nina",
        "title": "Grey campus hoodie",
        "description": (
            "Heather grey hoodie with a small embroidered campus crest on the left "
            "chest. Left in a studio cubby after a late class."
        ),
        "category": "Clothing",
        "brand": None,
        "color": "Grey",
        "location": "Arts Building - Studio 3",
        "occurred_hours_ago": 140,
        "created_hours_ago": 136,
        "image": "hoodie",
    },
    {
        "key": "hoodie-found",
        "type": ItemType.FOUND,
        "status": ItemStatus.OPEN,
        "reporter": "finder",
        "title": "Grey zip-up hoodie",
        "description": (
            "Heather grey zip-up hoodie with a campus crest on the chest. Found "
            "folded on a chair in the arts building."
        ),
        "category": "Clothing",
        "brand": None,
        "color": "Grey",
        "location": "Arts Building - Studio 1",
        "occurred_hours_ago": 120,
        "created_hours_ago": 118,
        "image": "hoodie",
    },
    {
        "key": "keys",
        "type": ItemType.FOUND,
        "status": ItemStatus.OPEN,
        "reporter": "finder",
        "title": "Key ring with red tag",
        "description": (
            "Three keys on a silver ring with a bright red plastic tag. Found "
            "near the stairwell on level two of the parking garage."
        ),
        "category": "Keys",
        "brand": None,
        "color": "Red",
        "location": "Parking Garage - Level 2",
        "occurred_hours_ago": 16,
        "created_hours_ago": 14,
        "image": "keys",
    },
    {
        "key": "umbrella",
        "type": ItemType.FOUND,
        "status": ItemStatus.CLOSED,
        "reporter": "finder",
        "title": "Compact black umbrella",
        "description": (
            "Small folding umbrella with a wooden handle. The report was closed "
            "after the owner picked it up from the main gate desk."
        ),
        "category": "Other",
        "brand": None,
        "color": "Black",
        "location": "Main Gate",
        "occurred_hours_ago": 480,
        "created_hours_ago": 472,
        "image": "umbrella",
    },
    {
        "key": "notebook",
        "type": ItemType.LOST,
        "status": ItemStatus.OPEN,
        "reporter": "student",
        "title": "Blue notebook with calculus notes",
        "description": (
            "Blue spiral notebook with handwritten calculus notes and a few "
            "yellow sticky tabs. My name is written inside the front cover."
        ),
        "category": "Books & Notes",
        "brand": None,
        "color": "Blue",
        "location": "Mathematics Building - Room 118",
        "occurred_hours_ago": 76,
        "created_hours_ago": 74,
        "image": "notebook",
    },
    {
        "key": "usb-c",
        "type": ItemType.FOUND,
        "status": ItemStatus.OPEN,
        "reporter": "finder",
        "title": "USB-C charger with braided cable",
        "description": (
            "White USB-C power adapter with a braided white cable. Found on a "
            "table in one of the student center study rooms."
        ),
        "category": "Electronics",
        "brand": None,
        "color": "White",
        "location": "Student Center - Study rooms",
        "occurred_hours_ago": 54,
        "created_hours_ago": 52,
        "image": "charger",
    },
    {
        "key": "id-found",
        "type": ItemType.FOUND,
        "status": ItemStatus.OPEN,
        "reporter": "finder",
        "title": "Student ID card - Nina A.",
        "description": (
            "White student ID card with a blue lanyard. The first name on the "
            "card begins with Nina. Held at the dining hall front desk."
        ),
        "category": "Cards & IDs",
        "brand": None,
        "color": "White",
        "location": "Dining Hall - Front desk",
        "occurred_hours_ago": 6,
        "created_hours_ago": 4,
        "image": "id",
    },
]


CLAIMS: list[dict[str, Any]] = [
    {
        "key": "backpack-pending",
        "item": "backpack",
        "claimant": "student",
        "status": ClaimStatus.PENDING,
        "message": (
            "This looks like my backpack. It has a silver key clip in the front "
            "pocket and a small tear on the left strap."
        ),
        "created_hours_ago": 20,
    },
    {
        "key": "airpods-approved",
        "item": "airpods",
        "claimant": "student",
        "status": ClaimStatus.APPROVED,
        "message": (
            "These are my AirPods. The case has a scratch on the back and the "
            "right bud has a tiny scuff near the stem."
        ),
        "created_hours_ago": 90,
        "reviewed_by": "manager",
        "reviewed_hours_ago": 86,
        "resolution_notes": "Approved. Bring student ID to the security desk.",
    },
    {
        "key": "bottle-rejected",
        "item": "bottle",
        "claimant": "nina",
        "status": ClaimStatus.REJECTED,
        "message": "I think this is my blue bottle.",
        "created_hours_ago": 60,
        "reviewed_by": "manager",
        "reviewed_hours_ago": 58,
        "resolution_notes": "The sticker pattern did not match the reported item.",
    },
    {
        "key": "wallet-completed",
        "item": "wallet",
        "claimant": "nina",
        "status": ClaimStatus.COMPLETED,
        "message": (
            "This is my wallet. It has my transit pass and a small photo in the "
            "left card slot."
        ),
        "created_hours_ago": 220,
        "reviewed_by": "manager",
        "reviewed_hours_ago": 210,
        "resolution_notes": "Identity verified and handover completed.",
    },
    {
        "key": "umbrella-cancelled",
        "item": "umbrella",
        "claimant": "student",
        "status": ClaimStatus.CANCELLED,
        "message": "I may have left this at the main gate.",
        "created_hours_ago": 460,
    },
    {
        "key": "glasses-pending",
        "item": "glasses-found",
        "claimant": "nina",
        "status": ClaimStatus.PENDING,
        "message": (
            "The case should have a small white sticker inside the lid. The "
            "frames are rectangular with black arms."
        ),
        "created_hours_ago": 18,
    },
]


MATCHES: list[dict[str, Any]] = [
    {
        "key": "glasses",
        "lost": "glasses-lost",
        "found": "glasses-found",
        "status": MatchStatus.NOTIFIED,
        "text_score": 0.88,
        "image_score": 0.81,
        "attribute_score": 0.94,
        "final_score": 0.87,
        "created_hours_ago": 24,
    },
    {
        "key": "charger",
        "lost": "charger",
        "found": "usb-c",
        "status": MatchStatus.PENDING,
        "text_score": 0.82,
        "image_score": None,
        "attribute_score": 0.76,
        "final_score": 0.79,
        "created_hours_ago": 40,
    },
    {
        "key": "student-id",
        "lost": "student-id",
        "found": "id-found",
        "status": MatchStatus.CONFIRMED,
        "text_score": 0.91,
        "image_score": 0.86,
        "attribute_score": 0.96,
        "final_score": 0.91,
        "created_hours_ago": 3,
    },
    {
        "key": "hoodie",
        "lost": "hoodie",
        "found": "hoodie-found",
        "status": MatchStatus.REJECTED,
        "text_score": 0.74,
        "image_score": 0.68,
        "attribute_score": 0.8,
        "final_score": 0.74,
        "created_hours_ago": 90,
    },
]


CONVERSATIONS: list[dict[str, Any]] = [
    {
        "key": "backpack",
        "type": ConversationType.DIRECT,
        "claim": "backpack-pending",
        "participants": ["student", "finder"],
        "created_hours_ago": 19,
        "messages": [
            ("student", "Hi! I submitted a claim for the black backpack.", 19),
            ("finder", "Thanks. I still have it at the library desk.", 18),
            ("student", "Great, I can bring my student ID this afternoon.", 17),
            ("finder", "Sounds good. Ask for Maya at the second-floor desk.", 16),
        ],
    },
    {
        "key": "airpods",
        "type": ConversationType.DIRECT,
        "claim": "airpods-approved",
        "participants": ["student", "finder"],
        "created_hours_ago": 89,
        "messages": [
            ("finder", "The AirPods are with campus security now.", 88),
            ("student", "Perfect, thank you for turning them in.", 87),
        ],
    },
    {
        "key": "glasses",
        "type": ConversationType.DIRECT,
        "match": "glasses",
        "participants": ["nina", "finder"],
        "created_hours_ago": 23,
        "messages": [
            ("finder", "I found a pair of black glasses in the science library.", 22),
            ("nina", "I think they might be mine. Does the case have a sticker?", 21),
            ("finder", "Yes, a small white sticker inside the lid.", 20),
        ],
    },
    {
        "key": "support",
        "type": ConversationType.SUPPORT,
        "participants": ["student", "manager"],
        "created_hours_ago": 12,
        "messages": [
            ("student", "How long does a claim review usually take?", 12),
            ("manager", "Most reviews are completed within one campus day.", 11),
            ("manager", "You will get a notification as soon as it is updated.", 10),
        ],
    },
    {
        "key": "wallet",
        "type": ConversationType.DIRECT,
        "claim": "wallet-completed",
        "participants": ["nina", "finder"],
        "created_hours_ago": 215,
        "messages": [
            ("nina", "I think the wallet is mine. It has my transit pass.", 214),
            ("finder", "Campus security has it. They can verify your ID.", 213),
        ],
    },
]


NOTIFICATIONS: list[dict[str, Any]] = [
    {
        "key": "student-match",
        "user": "student",
        "type": NotificationType.POSSIBLE_MATCH,
        "title": "Possible match for your charger",
        "body": "A USB-C charger was found in the student center.",
        "data": {
            "match_id": str(sid("match", "charger")),
            "item_id": str(sid("item", "usb-c")),
        },
        "created_hours_ago": 38,
    },
    {
        "key": "student-approved",
        "user": "student",
        "type": NotificationType.CLAIM_APPROVED,
        "title": "Claim approved",
        "body": "Your claim for the AirPods Pro was approved.",
        "data": {
            "claim_id": str(sid("claim", "airpods-approved")),
            "item_id": str(sid("item", "airpods")),
        },
        "created_hours_ago": 86,
        "read_hours_ago": 80,
    },
    {
        "key": "student-message",
        "user": "student",
        "type": NotificationType.NEW_MESSAGE,
        "title": "New message from Maya",
        "body": "Ask for Maya at the second-floor desk.",
        "data": {"conversation_id": str(sid("conversation", "backpack"))},
        "created_hours_ago": 16,
    },
    {
        "key": "student-announcement",
        "user": "student",
        "type": NotificationType.SYSTEM_ANNOUNCEMENT,
        "title": "Lost property desk hours",
        "body": "The security desk is open weekdays from 8:00 to 18:00.",
        "data": {},
        "created_hours_ago": 48,
        "read_hours_ago": 40,
    },
    {
        "key": "nina-rejected",
        "user": "nina",
        "type": NotificationType.CLAIM_REJECTED,
        "title": "Claim not approved",
        "body": "Your claim for the blue bottle was not approved.",
        "data": {
            "claim_id": str(sid("claim", "bottle-rejected")),
            "item_id": str(sid("item", "bottle")),
        },
        "created_hours_ago": 58,
    },
    {
        "key": "nina-match",
        "user": "nina",
        "type": NotificationType.POSSIBLE_MATCH,
        "title": "Possible match for your glasses",
        "body": "A pair of black-frame glasses was found in the science library.",
        "data": {
            "match_id": str(sid("match", "glasses")),
            "item_id": str(sid("item", "glasses-found")),
        },
        "created_hours_ago": 24,
    },
    {
        "key": "nina-completed",
        "user": "nina",
        "type": NotificationType.HANDOVER_COMPLETED,
        "title": "Handover complete",
        "body": "Your wallet has been returned. Thanks for confirming the details.",
        "data": {
            "claim_id": str(sid("claim", "wallet-completed")),
            "item_id": str(sid("item", "wallet")),
        },
        "created_hours_ago": 208,
        "read_hours_ago": 200,
    },
    {
        "key": "finder-claim",
        "user": "finder",
        "type": NotificationType.CLAIM_SUBMITTED,
        "title": "New claim on your report",
        "body": "Someone submitted a claim for the black backpack.",
        "data": {
            "claim_id": str(sid("claim", "backpack-pending")),
            "item_id": str(sid("item", "backpack")),
        },
        "created_hours_ago": 20,
    },
    {
        "key": "manager-announcement",
        "user": "manager",
        "type": NotificationType.SYSTEM_ANNOUNCEMENT,
        "title": "Two claims waiting for review",
        "body": "The claim queue has pending reviews for the backpack and glasses.",
        "data": {},
        "created_hours_ago": 10,
    },
    {
        "key": "admin-announcement",
        "user": "admin",
        "type": NotificationType.SYSTEM_ANNOUNCEMENT,
        "title": "Knowledge base needs indexing",
        "body": "Three policy documents are waiting to be indexed.",
        "data": {},
        "created_hours_ago": 9,
    },
]


AUDIT_LOGS: list[dict[str, Any]] = [
    ("item-backpack", "finder", "ITEM_CREATED", "ITEM", "item", "backpack", 48),
    ("item-airpods", "finder", "ITEM_CREATED", "ITEM", "item", "airpods", 96),
    (
        "claim-backpack",
        "student",
        "CLAIM_SUBMITTED",
        "CLAIM",
        "claim",
        "backpack-pending",
        20,
    ),
    (
        "claim-airpods",
        "manager",
        "CLAIM_APPROVED",
        "CLAIM",
        "claim",
        "airpods-approved",
        86,
    ),
    (
        "claim-bottle",
        "manager",
        "CLAIM_REJECTED",
        "CLAIM",
        "claim",
        "bottle-rejected",
        58,
    ),
    (
        "claim-wallet",
        "manager",
        "HANDOVER_COMPLETED",
        "CLAIM",
        "claim",
        "wallet-completed",
        210,
    ),
    ("user-role", "admin", "USER_ROLE_CHANGED", "USER", "user", "manager", 300),
    ("item-umbrella", "finder", "ITEM_CLOSED", "ITEM", "item", "umbrella", 460),
]


KNOWLEDGE_DOCUMENTS: list[dict[str, Any]] = [
    {
        "key": "policy",
        "title": "Campus Lost Property Policy",
        "source": "Student Handbook, section 7.4",
        "version": "2026.1",
        "content": (
            "Campus Lost and Found is operated by Campus Security. Items found on "
            "campus should be reported through the Lost and Found portal within 24 "
            "hours. High-value items such as wallets, phones, laptops, and identity "
            "cards should be handed to the security desk. Perishable items and "
            "unclaimed items may be disposed of after the published holding period. "
            "Students should not attempt to retrieve items directly from another "
            "student without a completed handover."
        ),
        "created_hours_ago": 240,
    },
    {
        "key": "claims",
        "title": "Claim and Handover Procedure",
        "source": "Campus Security operating procedure",
        "version": "2026.1",
        "content": (
            "To claim a found item, submit a claim with enough detail for staff to "
            "verify ownership. A claim is reviewed by a campus manager. If approved, "
            "the claimant must bring a student or staff ID to the security desk. "
            "Staff complete the handover in the portal after identity verification. "
            "The item is then marked as returned and the report is resolved. "
            "Rejected claims may be appealed by contacting Campus Security."
        ),
        "created_hours_ago": 220,
    },
    {
        "key": "privacy",
        "title": "Lost and Found Privacy Notice",
        "source": "University privacy office",
        "version": "2026.1",
        "content": (
            "Lost and Found reports are visible to the campus community so that "
            "owners and finders can be connected. Do not include sensitive personal "
            "information such as full identification numbers, financial account "
            "numbers, or private medical information in a public report. Claim "
            "details are visible only to the claimant and authorized staff. Chat "
            "messages are visible to the participants in the conversation."
        ),
        "created_hours_ago": 200,
    },
]


def _draw_image(kind: str, destination: Path) -> None:
    width, height = 900, 675
    background = "#F2EEE4"
    ink = "#25231F"
    accent = "#2457F5"
    image = Image.new("RGB", (width, height), background)
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle(
        (42, 42, width - 42, height - 42),
        radius=32,
        fill="#FFFDF8",
        outline="#E4DED2",
        width=3,
    )

    if kind == "backpack":
        draw.rounded_rectangle((330, 190, 570, 500), radius=70, fill=ink)
        draw.rounded_rectangle((300, 300, 370, 470), radius=28, fill="#3A3732")
        draw.rounded_rectangle((530, 300, 600, 470), radius=28, fill="#3A3732")
        draw.arc((365, 120, 535, 280), 180, 360, fill=ink, width=24)
        draw.rounded_rectangle((405, 390, 495, 425), radius=10, fill=accent)
    elif kind in {"charger", "usb"}:
        draw.rounded_rectangle(
            (330, 240, 570, 400), radius=28, fill="#F4F1EA", outline=ink, width=10
        )
        draw.rectangle((380, 400, 420, 450), fill=ink)
        draw.rectangle((480, 400, 520, 450), fill=ink)
        draw.arc((400, 440, 680, 640), 180, 330, fill=ink, width=14)
        draw.rounded_rectangle((315, 290, 365, 350), radius=12, fill=accent)
    elif kind == "bottle":
        draw.rounded_rectangle((380, 200, 520, 520), radius=48, fill=accent)
        draw.rounded_rectangle((410, 150, 490, 210), radius=18, fill="#1A3FB8")
        draw.rounded_rectangle((400, 280, 500, 330), radius=14, fill="#E8EEFF")
        draw.ellipse((430, 380, 470, 420), fill="#FFFDF8")
    elif kind == "id":
        draw.rounded_rectangle(
            (270, 210, 630, 470), radius=30, fill="#FFFDF8", outline=ink, width=8
        )
        draw.ellipse((310, 270, 410, 370), fill="#D9D2C5")
        draw.rounded_rectangle((450, 270, 590, 300), radius=8, fill=ink)
        draw.rounded_rectangle((450, 320, 570, 340), radius=6, fill="#B8B0A2")
        draw.rounded_rectangle((310, 400, 590, 420), radius=6, fill="#B8B0A2")
        draw.line((430, 210, 430, 470), fill=accent, width=8)
    elif kind == "airpods":
        draw.rounded_rectangle(
            (330, 250, 570, 470), radius=54, fill="#F7F5EF", outline=ink, width=8
        )
        draw.ellipse((380, 300, 430, 390), fill="#FFFDF8", outline=ink, width=7)
        draw.ellipse((470, 300, 520, 390), fill="#FFFDF8", outline=ink, width=7)
        draw.line((405, 380, 405, 430), fill=ink, width=14)
        draw.line((495, 380, 495, 430), fill=ink, width=14)
    elif kind == "wallet":
        draw.rounded_rectangle((300, 240, 600, 450), radius=28, fill="#7B4A2D")
        draw.rounded_rectangle((300, 300, 600, 380), radius=18, fill="#96603C")
        draw.rounded_rectangle((470, 330, 560, 370), radius=16, fill="#D8A96F")
        draw.ellipse((505, 340, 525, 360), fill=accent)
    elif kind == "glasses":
        draw.ellipse((250, 270, 420, 410), outline=ink, width=16)
        draw.ellipse((480, 270, 650, 410), outline=ink, width=16)
        draw.line((420, 330, 480, 330), fill=ink, width=14)
        draw.line((250, 320, 180, 290), fill=ink, width=12)
        draw.line((650, 320, 720, 290), fill=ink, width=12)
        draw.arc((330, 400, 570, 500), 20, 160, fill=accent, width=8)
    elif kind == "hoodie":
        draw.polygon(
            [(350, 220), (550, 220), (620, 350), (560, 520), (340, 520), (280, 350)],
            fill="#8D8A84",
        )
        draw.arc((350, 160, 550, 340), 0, 180, fill="#6D6A65", width=24)
        draw.rounded_rectangle((400, 330, 500, 350), radius=8, fill="#FFFDF8")
        draw.ellipse((420, 270, 480, 330), fill="#F2EEE4")
    elif kind == "keys":
        draw.ellipse((300, 240, 440, 380), outline=ink, width=18)
        draw.line((410, 350, 610, 500), fill=ink, width=18)
        draw.rectangle((570, 470, 650, 500), fill=ink)
        draw.rectangle((540, 510, 600, 540), fill=ink)
        draw.ellipse((600, 180, 700, 280), fill="#C7402F")
    elif kind == "umbrella":
        draw.arc((220, 180, 680, 520), 180, 360, fill=ink, width=20)
        draw.line((450, 180, 450, 500), fill=ink, width=14)
        draw.arc((450, 470, 540, 560), 0, 180, fill=ink, width=14)
        draw.line((450, 240, 300, 420), fill=ink, width=8)
        draw.line((450, 240, 600, 420), fill=ink, width=8)
        draw.line((450, 240, 450, 430), fill=ink, width=8)
    elif kind == "notebook":
        draw.rounded_rectangle((300, 190, 600, 500), radius=20, fill=accent)
        draw.rounded_rectangle((330, 220, 570, 470), radius=12, fill="#FFFDF8")
        for y in range(260, 440, 40):
            draw.line((370, y, 530, y), fill="#B8B0A2", width=6)
        for y in range(210, 490, 35):
            draw.ellipse((285, y, 315, y + 18), fill="#D9D2C5")
    else:
        draw.ellipse((330, 230, 570, 470), fill=accent)

    destination.parent.mkdir(parents=True, exist_ok=True)
    image.save(destination, format="JPEG", quality=88, optimize=True)


def _seed_image(item_id: uuid.UUID, image_id: uuid.UUID, kind: str) -> tuple[str, int]:
    storage_key = f"items/{item_id}/{image_id}.jpg"
    path = storage.resolve_storage_path(storage_key)
    _draw_image(kind, path)
    return storage_key, path.stat().st_size


async def reset_seed() -> None:
    user_ids = [sid("user", entry["key"]) for entry in USERS]
    item_ids = [sid("item", entry["key"]) for entry in ITEMS]
    claim_ids = [sid("claim", entry["key"]) for entry in CLAIMS]
    match_ids = [sid("match", entry["key"]) for entry in MATCHES]
    conversation_ids = [sid("conversation", entry["key"]) for entry in CONVERSATIONS]
    notification_ids = [sid("notification", entry["key"]) for entry in NOTIFICATIONS]
    audit_ids = [sid("audit", entry[0]) for entry in AUDIT_LOGS]
    document_ids = [sid("knowledge", entry["key"]) for entry in KNOWLEDGE_DOCUMENTS]

    async with AsyncSessionLocal() as db:
        storage_keys = list(
            (
                await db.scalars(
                    select(ItemImage.storage_key).where(ItemImage.item_id.in_(item_ids))
                )
            ).all()
        )
        await db.execute(
            delete(Notification).where(Notification.id.in_(notification_ids))
        )
        await db.execute(
            delete(Message).where(Message.conversation_id.in_(conversation_ids))
        )
        await db.execute(
            delete(ConversationParticipant).where(
                ConversationParticipant.conversation_id.in_(conversation_ids)
            )
        )
        await db.execute(
            delete(Conversation).where(Conversation.id.in_(conversation_ids))
        )
        await db.execute(delete(Claim).where(Claim.id.in_(claim_ids)))
        await db.execute(delete(ItemMatch).where(ItemMatch.id.in_(match_ids)))
        await db.execute(delete(AuditLog).where(AuditLog.id.in_(audit_ids)))
        await db.execute(delete(ItemImage).where(ItemImage.item_id.in_(item_ids)))
        await db.execute(delete(Item).where(Item.id.in_(item_ids)))
        await db.execute(
            delete(DocumentChunk).where(DocumentChunk.document_id.in_(document_ids))
        )
        await db.execute(
            delete(KnowledgeDocument).where(KnowledgeDocument.id.in_(document_ids))
        )
        await db.execute(delete(User).where(User.id.in_(user_ids)))
        await db.commit()

    for key in storage_keys:
        try:
            storage.delete_image(key)
        except OSError:
            pass

    await cache.bump_version("items")
    await cache.bump_version("rag")
    print("Removed seeded development data.")


async def seed(with_images: bool) -> None:
    async with AsyncSessionLocal() as db:
        existing = await db.scalar(
            select(User.id).where(User.email == "admin@campus.edu")
        )
        if existing is not None:
            print("Development data already exists. Use --reset to recreate it.")
            return

        password_hash = hash_password(DEMO_PASSWORD)
        users: dict[str, User] = {}
        for entry in USERS:
            user = User(
                id=sid("user", entry["key"]),
                name=entry["name"],
                email=entry["email"],
                password_hash=password_hash,
                role=entry["role"],
                is_active=entry["is_active"],
                created_at=ago(720),
                updated_at=ago(720),
            )
            users[entry["key"]] = user
            db.add(user)
        await db.flush()

        items: dict[str, Item] = {}
        for entry in ITEMS:
            created_at = ago(entry["created_hours_ago"])
            item = Item(
                id=sid("item", entry["key"]),
                reporter_id=users[entry["reporter"]].id,
                type=entry["type"],
                title=entry["title"],
                description=entry["description"],
                category=entry["category"],
                brand=entry["brand"],
                color=entry["color"],
                location=entry["location"],
                occurred_at=ago(entry["occurred_hours_ago"]),
                status=entry["status"],
                processing_status=ProcessingStatus.READY,
                created_at=created_at,
                updated_at=created_at + timedelta(minutes=12),
            )
            items[entry["key"]] = item
            db.add(item)
        await db.flush()

        if with_images:
            for entry in ITEMS:
                image_kind = entry.get("image")
                if image_kind is None:
                    continue
                item = items[entry["key"]]
                image_id = sid("image", entry["key"])
                storage_key, size_bytes = _seed_image(item.id, image_id, image_kind)
                db.add(
                    ItemImage(
                        id=image_id,
                        item_id=item.id,
                        storage_key=storage_key,
                        mime_type="image/jpeg",
                        size_bytes=size_bytes,
                        width=900,
                        height=675,
                        created_at=item.created_at + timedelta(minutes=2),
                    )
                )

        claims: dict[str, Claim] = {}
        for entry in CLAIMS:
            created_at = ago(entry["created_hours_ago"])
            reviewed_at = (
                ago(entry["reviewed_hours_ago"])
                if entry.get("reviewed_hours_ago") is not None
                else None
            )
            claim = Claim(
                id=sid("claim", entry["key"]),
                item_id=items[entry["item"]].id,
                claimant_id=users[entry["claimant"]].id,
                message=entry["message"],
                status=entry["status"],
                reviewed_by=(
                    users[entry["reviewed_by"]].id
                    if entry.get("reviewed_by") is not None
                    else None
                ),
                reviewed_at=reviewed_at,
                resolution_notes=entry.get("resolution_notes"),
                created_at=created_at,
                updated_at=reviewed_at or created_at,
            )
            claims[entry["key"]] = claim
            db.add(claim)
        await db.flush()

        matches: dict[str, ItemMatch] = {}
        for entry in MATCHES:
            created_at = ago(entry["created_hours_ago"])
            match = ItemMatch(
                id=sid("match", entry["key"]),
                lost_item_id=items[entry["lost"]].id,
                found_item_id=items[entry["found"]].id,
                text_score=entry["text_score"],
                image_score=entry["image_score"],
                attribute_score=entry["attribute_score"],
                final_score=entry["final_score"],
                status=entry["status"],
                model_version="seed-v1",
                created_at=created_at,
                updated_at=created_at + timedelta(minutes=5),
            )
            matches[entry["key"]] = match
            db.add(match)
        await db.flush()

        conversations: dict[str, Conversation] = {}
        for entry in CONVERSATIONS:
            created_at = ago(entry["created_hours_ago"])
            conversation = Conversation(
                id=sid("conversation", entry["key"]),
                type=entry["type"],
                claim_id=(claims[entry["claim"]].id if entry.get("claim") else None),
                match_id=(matches[entry["match"]].id if entry.get("match") else None),
                created_at=created_at,
                updated_at=created_at,
            )
            conversations[entry["key"]] = conversation
            db.add(conversation)
            await db.flush()
            for participant_key in entry["participants"]:
                db.add(
                    ConversationParticipant(
                        conversation_id=conversation.id,
                        user_id=users[participant_key].id,
                        joined_at=created_at,
                        last_read_at=created_at + timedelta(hours=1),
                    )
                )
            for index, (sender_key, content, hours_ago) in enumerate(entry["messages"]):
                message_time = ago(hours_ago)
                db.add(
                    Message(
                        id=sid("message", f"{entry['key']}:{index}"),
                        conversation_id=conversation.id,
                        sender_id=users[sender_key].id,
                        client_message_id=sid(
                            "client-message", f"{entry['key']}:{index}"
                        ),
                        content=content,
                        created_at=message_time,
                        edited_at=None,
                        deleted_at=None,
                    )
                )
                conversation.updated_at = message_time

        for entry in NOTIFICATIONS:
            created_at = ago(entry["created_hours_ago"])
            db.add(
                Notification(
                    id=sid("notification", entry["key"]),
                    user_id=users[entry["user"]].id,
                    type=entry["type"].value,
                    title=entry["title"],
                    body=entry["body"],
                    data=entry["data"],
                    dedupe_key=f"seed:{entry['key']}",
                    read_at=(
                        ago(entry["read_hours_ago"])
                        if entry.get("read_hours_ago") is not None
                        else None
                    ),
                    created_at=created_at,
                )
            )

        for (
            key,
            actor_key,
            action,
            entity_type,
            id_kind,
            id_key,
            hours_ago,
        ) in AUDIT_LOGS:
            entity_id = sid(id_kind, id_key)
            db.add(
                AuditLog(
                    id=sid("audit", key),
                    actor_id=users[actor_key].id,
                    action=action,
                    entity_type=entity_type,
                    entity_id=entity_id,
                    log_metadata={"seed": True, "action": action},
                    created_at=ago(hours_ago),
                )
            )

        for entry in KNOWLEDGE_DOCUMENTS:
            db.add(
                KnowledgeDocument(
                    id=sid("knowledge", entry["key"]),
                    title=entry["title"],
                    source=entry["source"],
                    version=entry["version"],
                    content=entry["content"],
                    status=KnowledgeDocumentStatus.PENDING,
                    created_at=ago(entry["created_hours_ago"]),
                    updated_at=ago(entry["created_hours_ago"]),
                )
            )

        await db.commit()

    await cache.bump_version("items")
    await cache.bump_version("rag")
    print("Seeded development data.")
    print(f"Demo password: {DEMO_PASSWORD}")
    print("student@campus.edu / finder@campus.edu / nina@campus.edu")
    print("manager@campus.edu / admin@campus.edu")


async def main() -> None:
    parser = argparse.ArgumentParser(description="Seed development data")
    parser.add_argument(
        "--reset",
        action="store_true",
        help="Remove previously seeded records before creating them again",
    )
    parser.add_argument(
        "--with-images",
        action="store_true",
        help="Generate simple placeholder images for demo items",
    )
    args = parser.parse_args()

    if settings.environment == "production":
        raise SystemExit("Refusing to seed development data in production.")

    if args.reset:
        await reset_seed()
    await seed(with_images=args.with_images)
    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
