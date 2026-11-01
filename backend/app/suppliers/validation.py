"""Local syntax validation, including explicitly fictional demo domains."""
import re
from email.headerregistry import Address

def normalize_email(value: str) -> str:
    value = value.strip().lower()
    if any(c.isspace() for c in value) or any(c in value for c in '<>,;'):
        raise ValueError('Introdu o singură adresă de e-mail, fără nume afișat.')
    try:
        address = Address(addr_spec=value)
    except (ValueError, IndexError) as exc:
        raise ValueError('Adresa de e-mail nu are un format valid.') from exc
    labels = address.domain.split('.')
    if not address.username or len(labels) < 2 or any(not re.fullmatch(r'[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?', label) for label in labels):
        raise ValueError('Adresa de e-mail nu are un format valid.')
    return value

def normalize_tax_id(value: str) -> str:
    value=value.strip().upper().removeprefix('RO').strip()
    if not re.fullmatch(r'[0-9]{2,10}',value): raise ValueError('CUI-ul trebuie să conțină între 2 și 10 cifre.')
    return value
