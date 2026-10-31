from datetime import date
from pathlib import Path
from typing import Literal
from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT = Path(__file__).resolve().parents[2]
class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix='AERODESK_', env_file='.env', extra='ignore')
    database_url: str = f'sqlite:///{ROOT / "data" / "aerodesk.db"}'
    storage_dir: Path = ROOT / 'data' / 'storage'
    corpus_dir: Path = ROOT / 'data'
    reference_date: date = date(2026, 10, 30)
    seed_documents: bool = True
    airport_id: str = 'dunarea'
    airport_name: str = 'Aeroportul Dunărea'
    cookie_secure: bool = False
    auth_mode: Literal['demo', 'oidc'] = 'demo'
    oidc_issuer: str = ''
    oidc_internal_issuer: str = ''
    oidc_client_id: str = 'aerodesk-web'
    oidc_redirect_uri: str = ''
    oidc_frontend_url: str = ''
    oidc_subject_map: dict[str, str] | None = None
    oidc_session_minutes: int = 60
    exchange_url: str = ''
    exchange_token_file: Path | None = None
    cors_origins: list[str] = ['http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:4173', 'http://127.0.0.1:4173']
settings = Settings()
