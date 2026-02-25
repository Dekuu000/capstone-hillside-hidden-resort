from pydantic import BaseModel, Field


class ErrorBody(BaseModel):
    code: str
    message: str
    details: dict = Field(default_factory=dict)
    correlation_id: str


class ErrorEnvelope(BaseModel):
    error: ErrorBody
