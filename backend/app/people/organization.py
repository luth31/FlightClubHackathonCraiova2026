"""Four demo departments; historical document business areas remain unchanged."""

DEPARTMENTS = [
    ('dept-tehnic', 'Tehnic', 'technical-head'),
    ('dept-achizitii', 'Achiziții', 'manager'),
    ('dept-hr', 'Resurse umane', 'hr'),
    ('dept-conformitate', 'Conformitate', 'reviewer'),
]
DEPARTMENT_LABELS = {'Tehnic': 'Tehnic și operațiuni', 'Achiziții': 'Achiziții și financiar',
                     'Resurse umane': 'Resurse umane', 'Conformitate': 'Conformitate și control'}
AREA_DEPARTMENTS = {'Operațiuni': 'Tehnic', 'Financiar': 'Achiziții'}
LEGACY_IDS = {'dept-operatiuni': 'dept-tehnic', 'dept-financiar': 'dept-achizitii'}
TECHNICAL_CATEGORIES = ('Raport de mentenanță', 'Proces-verbal', 'Procedură', 'Instruire')
RESTRICTED = ('restricted', 'confidential', 'confidențial')
PUBLISHED = ('approved', 'signed', 'archived')


def canonical_department(name):
    return AREA_DEPARTMENTS.get(name, name)


def department_areas(name):
    canonical = canonical_department(name)
    return {canonical} | {area for area, department in AREA_DEPARTMENTS.items() if department == canonical}
