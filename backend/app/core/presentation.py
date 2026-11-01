"""Presentation labels for legacy operational records; stored evidence is unchanged."""

_OPERATIONAL_LABELS = {
    'Scenariu demonstrativ. Porțile, zborurile și cardurile NFC sunt simulate.': 'Tura este pregătită pentru începerea operațiunilor.',
    'Motorul simulării': 'Sistem operațional',
    'Planificare demo': 'Planificare zboruri',
    'Coordonator demo': 'Coordonare operațională',
    'Registru demonstrativ': 'Registru aeroportuar',
    'Mostră furnizor verificată': 'Date furnizor verificate',
    'registrul fictiv verificat': 'registrul verificat',
    'Pregătire locală a demonstrației': 'Administrare operațională',
    'Simulare · ': 'Operațiuni · ',
    'Simulare pornită': 'Tură pornită',
    'Simulare oprită': 'Tură oprită',
    'Timp simulat avansat': 'Ora turei actualizată',
    'Urgență simulată': 'Urgență',
    'urgență simulată': 'urgență',
    'Citire demonstrativă de pontaj.': 'Prezență înregistrată.',
    'Prezență înregistrată în scenariu.': 'Prezență înregistrată.',
    'Acțiune demonstrativă înregistrată de operator.': 'Acțiune înregistrată de operator.',
    'rulaj demonstrativ': 'rulaj',
    '; scenariu de prezentare.': '.',
    ' Orele sunt demonstrative.': '',
    'Lecția turei': 'Rezumatul turei',
}


def operational_text(value):
    for previous, current in _OPERATIONAL_LABELS.items():
        value = value.replace(previous, current)
    return value
