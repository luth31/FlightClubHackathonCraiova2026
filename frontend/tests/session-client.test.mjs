import assert from 'node:assert/strict';
import test from 'node:test';
import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';

globalThis.localStorage={getItem:()=>null,setItem(){},removeItem(){}};
const bundle=await build({entryPoints:[fileURLToPath(new URL('../src/services/api-client.ts',import.meta.url))],bundle:true,write:false,platform:'node',format:'cjs'});
const module={exports:{}};
new Function('module','exports',bundle.outputFiles[0].text)(module,module.exports);
const {api,download,setIdentity,onSessionExpired,isSessionExpired}=module.exports;
const unauthorized=()=>Response.json({detail:'Conectează-te pentru a continua.'},{status:401});

test('concurrent 401s notify once and stop further protected requests',async()=>{
  setIdentity('admin');
  let notifications=0,requests=0;
  const remove=onSessionExpired(()=>notifications++);
  globalThis.fetch=async()=>{requests++;return unauthorized();};
  await Promise.allSettled([api('/documents'),api('/operations'),api('/tasks')]);
  assert.equal(notifications,1);
  assert.equal(isSessionExpired(),true);
  await assert.rejects(api('/documents'));
  assert.equal(requests,3);
  remove();
});

test('an old request cannot expire a newly authenticated session',async()=>{
  setIdentity('old');
  let finish;
  globalThis.fetch=()=>new Promise(resolve=>{finish=resolve;});
  const pending=api('/documents');
  setIdentity('new');
  finish(unauthorized());
  await assert.rejects(pending);
  assert.equal(isSessionExpired(),false);
});

test('download 401 expires the session too',async()=>{
  setIdentity('admin');
  globalThis.fetch=async()=>unauthorized();
  await assert.rejects(download('/documents/one/file','one.pdf'));
  assert.equal(isSessionExpired(),true);
});

test('wrong password and permission denials stay local to the request',async()=>{
  setIdentity('admin');
  globalThis.fetch=async()=>unauthorized();
  await assert.rejects(api('/auth/login',{method:'POST'}));
  assert.equal(isSessionExpired(),false);
  globalThis.fetch=async()=>Response.json({detail:'Forbidden'},{status:403});
  await assert.rejects(api('/documents'));
  assert.equal(isSessionExpired(),false);
});
