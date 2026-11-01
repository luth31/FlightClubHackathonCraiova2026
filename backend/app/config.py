from datetime import date
from pathlib import Path
from typing import Literal
from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import SecretStr, Field, AliasChoices

ROOT = Path(__file__).resolve().parents[2]
class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix='FLYLEAF_', env_file=(ROOT / '.env', ROOT / 'backend' / '.env'), extra='ignore')
    database_url: str = f'sqlite:///{ROOT / "data" / "flyleaf.db"}'
    storage_dir: Path = ROOT / 'data' / 'storage'
    corpus_dir: Path = ROOT / 'data'
    reference_date: date = date(2026, 10, 30)
    seed_documents: bool = True
    extraction_enabled: bool = True
    tessdata_dir: Path = ROOT / "data" / "tessdata"
    airport_id: str = 'craiova'
    airport_name: str = 'Aeroportul Craiova'
    cookie_secure: bool = False
    auth_mode: Literal['demo', 'oidc'] = 'demo'
    oidc_issuer: str = ''
    oidc_internal_issuer: str = ''
    oidc_client_id: str = 'flyleaf-web'
    oidc_redirect_uri: str = ''
    oidc_frontend_url: str = ''
    oidc_extra_origins: list[str] = []
    oidc_subject_map: dict[str, str] | None = None
    oidc_session_minutes: int = 60
    keycloak_provisioning_client_id: str = 'flyleaf-provisioner'
    keycloak_provisioning_client_secret: SecretStr = SecretStr('')
    keycloak_activation_email: bool = False
    openai_api_key: SecretStr = Field(default=SecretStr(''), validation_alias=AliasChoices('FLYLEAF_OPENAI_API_KEY','OPENAI_API_KEY'))
    openai_model: str = 'gpt-6-luna'
    openai_redaction_model: str = ''
    google_maps_api_key: SecretStr = Field(default=SecretStr(''), validation_alias=AliasChoices('FLYLEAF_GOOGLE_MAPS_API_KEY', 'GOOGLE_MAPS_API_KEY'))
    exchange_url: str = ''
    exchange_token_file: Path | None = None
    cors_origins: list[str] = ['http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:4173', 'http://127.0.0.1:4173']
settings = Settings()
