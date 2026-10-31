"""Shared server-side OpenAI Responses adapter. Never logs prompts or credentials."""
import json
from threading import BoundedSemaphore
import httpx
from app.config import settings
from app.core.exceptions import DomainError

_slots = BoundedSemaphore(4)


def configured():
    return bool(settings.openai_api_key.get_secret_value())


def structured_response(*, instructions, payload, schema, task):
    if not configured():
        raise DomainError('Luna nu este conectată. Configurează OPENAI_API_KEY pe server; editorul manual rămâne disponibil.', 503)
    if not _slots.acquire(blocking=False):
        raise DomainError('Luna analizează deja mai multe documente. Încearcă din nou în câteva momente.', 429)
    model = (settings.openai_redaction_model or settings.openai_model) if task == 'redaction' else settings.openai_model
    try:
        with httpx.Client(timeout=httpx.Timeout(45, connect=5), follow_redirects=False) as client:
            response = client.post('https://api.openai.com/v1/responses',
                headers={'Authorization': 'Bearer ' + settings.openai_api_key.get_secret_value()},
                json={'model': model, 'store': False, 'instructions': instructions,
                      'input': json.dumps(payload, ensure_ascii=False), 'max_output_tokens': 8000,
                      'text': {'format': {'type': 'json_schema', 'name': task, 'strict': True, 'schema': schema}}})
        if response.status_code == 429:
            raise DomainError('Luna a atins limita de utilizare. Încearcă din nou mai târziu.', 429)
        if response.status_code != 200:
            raise DomainError('Conexiunea Luna nu a putut fi validată. Verifică cheia, modelul și accesul proiectului.', 502)
        result = response.json()
        if result.get('status') != 'completed':
            raise DomainError('Luna nu a terminat analiza. Selecțiile tale sunt păstrate; încearcă din nou.', 502)
        contents = [part for item in result.get('output', []) if item.get('type') == 'message'
                    for part in item.get('content', [])]
        if any(part.get('type') == 'refusal' for part in contents):
            raise DomainError('Luna nu poate analiza acest document. Poți continua manual.', 422)
        outputs = [part['text'] for part in contents if part.get('type') == 'output_text']
        if len(outputs) != 1:
            raise ValueError('Ambiguous structured output')
        return json.loads(outputs[0]), model
    except (httpx.HTTPError, ValueError, KeyError, TypeError, AttributeError):
        raise DomainError('Analiza Luna nu este disponibilă momentan. Selecțiile tale sunt păstrate.', 502) from None
    finally:
        _slots.release()
