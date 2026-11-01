"""Evidence selection and provenance regressions, without paid model calls."""
from app.operations.procedures import engine
from test_procedures import connect


def group(identifier, affected, count=3, observed=True):
    return {
        'id': identifier, 'callsign': identifier, 'category': 'flight', 'direction': 'departure',
        'scheduled_at': '2026-10-30T08:00:00+00:00',
        'actual_at': '2026-10-30T08:05:00+00:00' if observed else None,
        'severity': 'yellow' if affected else 'neutral', 'delay_minutes': 5 if affected else 0,
        'events': [dict(id=f'{identifier}-{i}', kind='gate_open', title='Poartă',
                        actual_at='2026-10-30T08:00:00+00:00' if observed else None,
                        planned_at='2026-10-30T07:55:00+00:00',
                        severity='yellow' if affected else 'neutral', delay_minutes=5 if affected else 0)
                   for i in range(count)],
    }


def test_comparison_examples_are_included_without_partial_groups_or_future_events():
    groups = [group('late-a', True), group('late-b', True), group('normal-a', False),
              group('normal-b', False), group('future', False, observed=False)]
    evidence, coverage = engine.select_evidence(groups, limit=7)
    assert len(evidence) == 6
    assert {e['group_affected'] for e in evidence} == {True, False}
    assert all(e['actual_at'] and not e['group_id'].startswith('future') for e in evidence)
    assert all(sum(e['group_id'] == identifier for e in evidence) == 3
               for identifier in {e['group_id'] for e in evidence})
    assert coverage['observed_groups'] == 4
    assert coverage['affected_groups'] == coverage['unaffected_groups'] == 2
    assert coverage['omitted_events'] == 6
    assert coverage['selected_affected_groups'] == coverage['selected_unaffected_groups'] == 1


def test_oversized_group_is_omitted_whole_and_selection_is_deterministic():
    groups = [group('late-large', True, 125), group('late-small', True), group('normal', False)]
    evidence, coverage = engine.select_evidence(groups)
    assert len(evidence) == 6 and coverage['omitted_events'] == 125
    assert all(e['group_id'] != 'late-large' for e in evidence)
    assert engine.select_evidence(list(reversed(groups))) == (evidence, coverage)


def test_model_change_marks_saved_analysis_stale_and_does_not_reuse_cache(admin, monkeypatch):
    calls = connect(monkeypatch)
    monkeypatch.setattr(engine.settings, 'openai_model', 'evidence-regression-model-a')
    first = admin.post('/api/operations/strategy-analysis')
    assert first.status_code == 200, first.text
    assert first.json()['analysis']['cohort']['selected_unaffected_groups'] > 0
    monkeypatch.setattr(engine.settings, 'openai_model', 'evidence-regression-model-b')
    assert admin.get('/api/operations/strategy-analysis').json()['analysis']['stale']
    second = admin.post('/api/operations/strategy-analysis')
    assert second.status_code == 200, second.text
    assert not second.json()['cached'] and len(calls) == 2
    assert first.json()['analysis']['id'] != second.json()['analysis']['id']


def test_registry_sources_do_not_claim_an_unverified_pdf_page(admin):
    response = admin.post('/api/assistant', json={'question': 'Ce contracte expiră în 60 de zile?'})
    assert response.status_code == 200
    sources = response.json()['sources']
    assert sources
    assert all(s['page'] is None and s['source_type'] == 'validated_metadata' for s in sources)
