from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.services import model_registry

router = APIRouter(prefix="/models", tags=["models"])


class ModelBody(BaseModel):
    model: str = Field(..., min_length=1, description="Anthropic model id, e.g. claude-sonnet-4-20250514")


class ModelsResponse(BaseModel):
    models: list[str]
    current: str


@router.get("", response_model=ModelsResponse)
def get_models():
    return ModelsResponse(models=model_registry.list_models(), current=model_registry.get_active_model())


@router.post("/add", response_model=ModelsResponse)
def add_model(body: ModelBody):
    try:
        model_registry.add_model(body.model)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return ModelsResponse(models=model_registry.list_models(), current=model_registry.get_active_model())


@router.post("/remove", response_model=ModelsResponse)
def remove_model(body: ModelBody):
    try:
        models, current = model_registry.remove_model(body.model)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    return ModelsResponse(models=models, current=current)


@router.post("/select", response_model=ModelsResponse)
def select_model(body: ModelBody):
    try:
        model_registry.select_model(body.model)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return ModelsResponse(models=model_registry.list_models(), current=model_registry.get_active_model())
