import assert from 'node:assert/strict';
import test from 'node:test';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';

const bundle=await build({entryPoints:[fileURLToPath(new URL('../src/features/operations/nfc-links.ts',import.meta.url))],bundle:true,write:false,platform:'node',format:'cjs',packages:'external'});
const module={exports:{}};
new Function('require','module','exports',bundle.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports);
const {cardFromHash,rememberNfcLink,pendingNfcCard,clearNfcLink,nfcLink}=module.exports;
const origin='https://aeroport-craiova.taileceb7a.ts.net';
const storageKey='flyleaf.pendingNfc';
const capturedAt=1_800_000_000_000;

function browser(t,path='/#operations?view=station&card=DEMO-NFC-101'){
  const dom=new JSDOM('<main/>',{url:origin+path});
  const descriptors=new Map(['window','sessionStorage'].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
  Object.defineProperty(globalThis,'window',{value:dom.window,configurable:true});
  Object.defineProperty(globalThis,'sessionStorage',{value:dom.window.sessionStorage,configurable:true});
  t.after(()=>{dom.window.close();for(const [key,descriptor]of descriptors){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}});
  return dom;
}

test('card URI is captured before login and survives the same-tab OIDC callback and frontend redirect',t=>{
  const dom=browser(t);t.mock.method(Date,'now',()=>capturedAt);
  rememberNfcLink();assert.equal(pendingNfcCard(),'DEMO-NFC-101');
  dom.reconfigure({url:origin+'/api/auth/oidc/callback?code=test-code&state=test-state'});
  rememberNfcLink();assert.equal(cardFromHash(window.location.hash),null);assert.equal(pendingNfcCard(),'DEMO-NFC-101');
  dom.reconfigure({url:origin+'/'});assert.equal(pendingNfcCard(),'DEMO-NFC-101');
  clearNfcLink();assert.equal(pendingNfcCard(),null);
});

test('pending cards expire at thirty minutes and a later legitimate card replaces the earlier one',t=>{
  const dom=browser(t);let now=capturedAt;t.mock.method(Date,'now',()=>now);
  rememberNfcLink();now+=30*60*1000-1;assert.equal(pendingNfcCard(),'DEMO-NFC-101');
  now++;assert.equal(pendingNfcCard(),null);
  dom.reconfigure({url:origin+'/#operations?view=station&card=DEMO-NFC-104'});
  rememberNfcLink();assert.equal(pendingNfcCard(),'DEMO-NFC-104');
});

test('card parsing rejects other sections, URLs, delimiters, whitespace and oversized identifiers',()=>{
  assert.equal(cardFromHash('#operations?view=station&card=reader%3A101_A'),'reader:101_A');
  for(const hash of ['#people?card=DEMO-NFC-101','#operations?card=','#operations?card=https%3A%2F%2Fevil.test',
    '#operations?card=DEMO%26action%3Dcheck_out','#operations?card=DEMO-NFC-101%0A',
    '#operations?card=%20DEMO-NFC-101','#operations?card='+ 'a'.repeat(81)]){
    assert.equal(cardFromHash(hash),null,hash);
  }
});

test('malformed storage cannot restore numeric, array, missing, expired or future card data',t=>{
  browser(t);t.mock.method(Date,'now',()=>capturedAt);
  for(const value of [{card:101,at:capturedAt},{card:['DEMO-NFC-101'],at:capturedAt},
    {at:capturedAt},{card:'DEMO-NFC-101',at:capturedAt+1},{card:'DEMO-NFC-101',at:String(capturedAt)},
    {card:'DEMO-NFC-101',at:null},{card:'DEMO-NFC-101',at:capturedAt-30*60*1000},
    {card:'DEMO-NFC-101\n',at:capturedAt},null,[]]){
    sessionStorage.setItem(storageKey,JSON.stringify(value));assert.equal(pendingNfcCard(),null,JSON.stringify(value));
  }
  sessionStorage.setItem(storageKey,'not-json');assert.equal(pendingNfcCard(),null);
});

test('generated card URLs preserve the current deployment origin and base path, dropping old query/hash',t=>{
  browser(t,'/flyleaf/?utm_source=demo#documents');
  const url=new URL(nfcLink('reader:101_A'));
  assert.equal(url.origin,origin);assert.equal(url.pathname,'/flyleaf/');assert.equal(url.search,'');
  assert.equal(url.hash,'#people?tab=attendance&card=reader%3A101_A');assert.equal(cardFromHash(url.hash),'reader:101_A');
  const hostile=new URL(nfcLink('https://evil.test/#operations?card=101'));
  assert.equal(hostile.origin,origin);assert.equal(cardFromHash(hostile.hash),null);
});

test('unavailable session storage leaves card-URL parsing usable and fails closed during restoration',t=>{
  browser(t);Object.defineProperty(globalThis,'sessionStorage',{get(){throw new Error('Storage unavailable');},configurable:true});
  assert.doesNotThrow(rememberNfcLink);assert.equal(pendingNfcCard(),null);assert.doesNotThrow(clearNfcLink);
  assert.equal(cardFromHash(window.location.hash),'DEMO-NFC-101');
});


test('team attendance card links are captured and retain the existing card identifiers',t=>{
  browser(t,'/#people?tab=attendance&card=DEMO-NFC-104');
  rememberNfcLink();assert.equal(pendingNfcCard(),'DEMO-NFC-104');
  assert.equal(cardFromHash('#people?tab=leave&card=DEMO-NFC-104'),null);
});
