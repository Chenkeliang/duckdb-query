"""Request models for independent Quack remote services."""

from __future__ import annotations

from urllib.parse import urlsplit

from pydantic import BaseModel, ConfigDict, Field, SecretStr, field_validator


class QuackServiceConfig(BaseModel):
    """Saved or unsaved configuration; omitted update tokens retain the secret."""

    model_config = ConfigDict(extra="forbid", hide_input_in_errors=True)

    name: str = Field(min_length=1, max_length=200)
    uri: str = Field(min_length=7, max_length=1024)
    token: SecretStr | None = None
    disable_ssl: bool | None = None
    ssl_fingerprint: str | None = Field(default=None, max_length=256)
    timeout_seconds: int = Field(default=30, ge=1, le=600)

    @field_validator("name")
    @classmethod
    def validate_name(cls, value: str) -> str:
        """Reject whitespace-only names."""
        value = value.strip()
        if not value:
            raise ValueError("Service name must not be blank")
        return value

    @field_validator("uri")
    @classmethod
    def validate_uri(cls, value: str) -> str:
        """Accept only an endpoint, never credentials or SQL in an address."""
        value = value.strip()
        if not value.startswith("quack:") or any(char.isspace() for char in value):
            raise ValueError("Expected a Quack service URI")
        try:
            parsed = urlsplit("//" + value[6:].removeprefix("//"))
            port = parsed.port
            valid = (parsed.hostname and not parsed.username and not parsed.password
                     and not parsed.path and not parsed.query and not parsed.fragment
                     and not any(char in value for char in "'\"\\\x00")
                     and (port is None or 0 < port < 65536))
        except ValueError:
            valid = False
        if not valid:
            raise ValueError("Quack URI must contain only a host and optional port")
        return value


class QuackExecuteRequest(BaseModel):
    """Read-only remote SQL; the service ID comes from the route path."""

    model_config = ConfigDict(extra="forbid")

    sql: str = Field(min_length=1)
    is_preview: bool = True
    request_id: str | None = Field(default=None, max_length=200)
