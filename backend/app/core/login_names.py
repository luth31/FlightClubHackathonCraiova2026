"""Shared name normalization for local demo sign-in and its airport router."""
import unicodedata


def normalize_login(value: str) -> str:
    decomposed = unicodedata.normalize('NFKD', value.strip().casefold())
    return ' '.join(''.join(char for char in decomposed if not unicodedata.combining(char)).split())
