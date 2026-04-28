"""Assistant API: chat, apply, simulations, MECE, roundtable, PPT framework."""

from __future__ import annotations

from fastapi import APIRouter

from . import chat_apply, mece, ppt, roundtable, simulations

router = APIRouter()
router.include_router(chat_apply.router)
router.include_router(roundtable.router)
router.include_router(simulations.router)
router.include_router(mece.router)
router.include_router(ppt.router)

__all__ = ["router"]
