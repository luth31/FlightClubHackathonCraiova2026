#!/usr/bin/env python3
"""Extract only public origins; Tailscale must never override shared API keys."""
from pathlib import Path
import shlex
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[1]
NAMES = ('FLYLEAF_CRAIOVA_PUBLIC_URL', 'FLYLEAF_SIBIU_PUBLIC_URL')


def prepare_origins():
    values = {}
    for line in (ROOT / '.env.tailscale').read_text().splitlines():
        name, separator, raw = line.partition('=')
        name = name.strip().removeprefix('export ').strip()
        if not separator or name not in NAMES:
            continue
        parts = shlex.split(raw, comments=True)
        if len(parts) != 1:
            raise ValueError(f'{name}: expected one HTTPS origin.')
        value = parts[0]
        parsed = urlsplit(value)
        if (parsed.scheme != 'https' or not parsed.hostname or parsed.username or parsed.password
                or parsed.path or parsed.query or parsed.fragment or '$' in value):
            raise ValueError(f'{name}: use an HTTPS origin without credentials, path or trailing slash.')
        values[name] = value
    if set(values) != set(NAMES):
        raise ValueError('Set both airport public origins in .env.tailscale.')
    destination = ROOT / '.runtime/tailscale.origins.env'
    destination.parent.mkdir(exist_ok=True)
    destination.write_text(''.join(f'{name}={values[name]}\n' for name in NAMES))
    destination.chmod(0o600)
    return destination


if __name__ == '__main__':
    prepare_origins()
