from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.services import model_registry
from app.services.session_wizard import (
    apply_session_credentials,
    is_session_ready,
    maybe_autocomplete_wizard_from_dotenv,
)

router = APIRouter(prefix="/session", tags=["session"])


class SessionStatusOut(BaseModel):
    ready: bool = Field(description="True after wizard completed or .env autofill (unless strict).")


class SessionSetupIn(BaseModel):
    primary_llm: str = Field(description="gemini | deepseek | kimi")
    api_key: str = Field(min_length=1, description="Provider API key for this run")
    tavily_api_key: str = Field(default="", description="Optional Tavily API key")
    model_id: str = Field(default="", description="Optional model override; defaults per provider")


class SessionSetupOut(BaseModel):
    ok: bool = True
    primary_llm: str
    model_id: str


@router.get("/status", response_model=SessionStatusOut)
def session_status() -> SessionStatusOut:
    maybe_autocomplete_wizard_from_dotenv()
    return SessionStatusOut(ready=is_session_ready())


@router.post("/setup", response_model=SessionSetupOut)
def session_setup(body: SessionSetupIn) -> SessionSetupOut:
    try:
        resolved = apply_session_credentials(
            primary_llm=body.primary_llm,
            api_key=body.api_key,
            tavily_api_key=body.tavily_api_key,
            model_id=body.model_id,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    model_registry.override_active_model_for_session(resolved)
    return SessionSetupOut(primary_llm=body.primary_llm.strip().lower(), model_id=resolved)
