import assert from 'node:assert/strict';
import test from 'node:test';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';

const bundle=await build({entryPoints:[fileURLToPath(new URL('../src/features/documents/DocumentExpiry.tsx',import.meta.url))],
  bundle:true,write:false,platform:'node',format:'cjs',packages:'external',jsx:'automatic'});
const module={exports:{}};
new Function('require','module','exports',bundle.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports);
const {expiryPresentation,DocumentExpiry}=module.exports;
const document={expiresAt:'2026-11-15',validated:true,status:'approved'};

test('expiry warning distinguishes 60/30-day boundaries, today and actual expiry',()=>{
  for(const [days,tone,label] of [[61,'valid','Zile rămase: 61'],[60,'soon','Zile rămase: 60'],[31,'soon','Zile rămase: 31'],
    [30,'urgent','Zile rămase: 30'],[1,'urgent','Expiră mâine'],[0,'urgent','Expiră astăzi'],[-1,'expired','Expirat · 1 zi'],[-30,'expired','Expirat · 30 zile']]) {
    assert.deepEqual(expiryPresentation({...document,daysRemaining:days}),{tone,label});
    const markup=renderToStaticMarkup(createElement(DocumentExpiry,{...document,daysRemaining:days}));
    assert.ok(markup.includes(label),'Severity must be readable without identifying its color');
    assert.match(markup,/datetime="2026-11-15"/i);
  }
});

test('unvalidated, unknown and archived dates do not claim verified urgency or validity',()=>{
  assert.equal(expiryPresentation({...document,daysRemaining:-10,validated:false}).tone,'neutral');
  assert.equal(expiryPresentation({...document,daysRemaining:100,validated:false}).label,'Dată de verificat');
  assert.equal(expiryPresentation({...document,daysRemaining:null}).tone,'neutral');
  assert.equal(expiryPresentation({...document,daysRemaining:NaN}).tone,'neutral');
  assert.equal(expiryPresentation({...document,expiresAt:null,daysRemaining:20}).label,'Fără termen înregistrat');
  assert.deepEqual(expiryPresentation({...document,status:'archived',daysRemaining:-10}),{tone:'neutral',label:'Arhivat'});
});

test('suppressed alerts keep the true expired date and label without an alarm color',()=>{
  const markup=renderToStaticMarkup(createElement(DocumentExpiry,{...document,daysRemaining:-10,muted:true}));
  assert.match(markup,/document-expiry--neutral/);
  assert.match(markup,/Expirat · 10 zile/);
  assert.match(markup,/datetime="2026-11-15"/i);
});
