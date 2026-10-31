import assert from 'node:assert/strict';
import test from 'node:test';
import { readableFlowLabel } from '../src/features/documents/flow-label.ts';

test('old Windows labels become readable Romanian document titles', () => {
  assert.equal(readableFlowLabel('Raport de mentenanÈ›Äƒ - ScÄƒri pasageri SP-02'),
    'Raport de mentenanță - Scări pasageri SP-02');
  assert.equal(readableFlowLabel('Proces-verbal de recepÈ›ie / FacturÄƒ'),
    'Proces-verbal de recepție / Factură');
});

test('twice decoded Windows labels recover each Romanian letter', () => {
  assert.equal(readableFlowLabel('ScÃ„Æ’ri / recepÃˆâ€ºie'), 'Scări / recepție');
  const encoder = new TextEncoder();
  const decoder = new TextDecoder('windows-1252');
  const canonical = 'ăâîșțĂÂÎȘȚşţŞŢ';
  const once = decoder.decode(encoder.encode(canonical));
  const twice = decoder.decode(encoder.encode(once));
  assert.equal(readableFlowLabel(once), canonical);
  assert.equal(readableFlowLabel(twice), canonical);
});

test('correct accents and mixed Unicode text remain intact', () => {
  const canonical = 'Și Café · România / 倉庫 / Straße / ăâîșțĂÂÎȘȚşţŞŢ';
  assert.equal(readableFlowLabel(canonical), canonical);
  assert.equal(readableFlowLabel('Și recepÈ›ie · Café / 倉庫 / Scări'),
    'Și recepție · Café / 倉庫 / Scări');
});

test('unrelated literal symbols and other encoding errors are untouched', () => {
  const unrelated = 'Ã© / Ã± / Ä / Ã / Â / È / € / £ / � / SP-02';
  assert.equal(readableFlowLabel(unrelated), unrelated);
  assert.equal(readableFlowLabel(''), '');
});
