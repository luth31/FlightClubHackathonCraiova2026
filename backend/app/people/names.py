"""Structured employee names with a fallback for legacy profiles."""


def split_name(name):
    parts = name.split()
    return {'first_name': parts[0] if parts else '',
        'middle_name': ' '.join(parts[1:-1]), 'last_name': parts[-1] if len(parts) > 1 else ''}


def person_names(person):
    if getattr(person, 'first_name', '') and getattr(person, 'last_name', ''):
        return {key: getattr(person, key, '') for key in ('first_name', 'middle_name', 'last_name')}
    return split_name(person.name)


def display_name(first_name, middle_name, last_name):
    return ' '.join(part for part in (first_name, middle_name, last_name) if part)
