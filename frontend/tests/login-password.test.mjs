import assert from 'node:assert/strict';
import test from 'node:test';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
import {act,createElement} from 'react';
function install(window){
  for(const key of ['window','document','navigator','location','localStorage','HTMLElement','HTMLInputElement','Event'])Object.defineProperty(globalThis,key,{value:key==='window'?window:window[key],configurable:true});
  globalThis.IS_REACT_ACT_ENVIRONMENT=true;
}
const initial=new JSDOM('',{url:'http://flyleaf.test/'});install(initial.window);
const {createRoot}=await import('react-dom/client');
const bundle=await build({entryPoints:[fileURLToPath(new URL('../src/features/auth/index.tsx',import.meta.url))],bundle:true,write:false,platform:'node',format:'cjs',packages:'external',jsx:'automatic',loader:{'.css':'empty'}});
const module={exports:{}};new Function('require','module','exports',bundle.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports);
const {LoginPage}=module.exports;initial.window.close();

async function setup(t,{redirect,sessionMissing=false}={}){
  const dom=new JSDOM('<div id="root"/>',{url:'http://flyleaf.test/'});install(dom.window);
  const posts=[],signedIn=[];
  globalThis.fetch=async(path,options={})=>{
    if(options.method==='POST'){
      posts.push(JSON.parse(options.body));
      return posts.at(-1).password==='Correct-test-password'?Response.json(redirect?{redirect_url:redirect}:{}):Response.json({detail:'Contul sau parola nu este corectă.'},{status:401});
    }
    return Response.json({current_user:sessionMissing?null:{id:'admin'}});
  };
  const root=createRoot(document.getElementById('root'));
  t.after(async()=>{await act(async()=>root.unmount());dom.window.close()});
  await act(async()=>root.render(createElement(LoginPage,{session:{airport:{id:'craiova',name:'Craiova'},auth:{mode:'demo'},users:[{id:'admin',name:'Director',role:'director',roles:['director']}]},onLogin:s=>signedIn.push(s)})));
  return {posts,signedIn};
}
async function input(value,selector='[type=password]'){await act(async()=>{const field=document.querySelector(selector);Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(field,value);field.dispatchEvent(new window.Event('input',{bubbles:true}))})}
test('sign-in shows only blank name and password fields with no account or airport choices',async t=>{
  await setup(t);
  assert.equal(document.querySelectorAll('input').length,2);
  assert.equal(document.querySelector('input[name=username]').value,'');
  assert.equal(document.querySelector('input[name=password]').value,'');
  assert.equal(document.querySelectorAll('select:not(.language-switcher select)').length,0);
  assert.deepEqual([...document.querySelector('.language-switcher select').options].map(option=>option.value),['ro','en']);
  await input('Correct-test-password');
  assert.equal(document.querySelector('.login-button').disabled,true);
});
test('blank and whitespace passwords never send a hidden default password',async t=>{
  const app=await setup(t),button=document.querySelector('.login-button');
  await input('Director','[name=username]');
  assert.equal(button.disabled,true);await act(async()=>button.click());
  await input('   ');assert.equal(button.disabled,true);
  await act(async()=>document.querySelector('form').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true})));
  assert.equal(app.posts.length,0);assert.equal(app.signedIn.length,0);
});
test('wrong password keeps the login screen and the typed password is sent unchanged',async t=>{
  const app=await setup(t);await input('Director','[name=username]');await input('Wrong-password');
  await act(async()=>document.querySelector('.login-button').click());
  assert.equal(app.posts[0].password,'Wrong-password');assert.equal(app.signedIn.length,0);
  assert.ok(document.querySelector('[role=alert]'));
});
test('an explicitly entered correct password signs in',async t=>{
  const app=await setup(t);await input('  Director  ','[name=username]');await input('Correct-test-password');
  await act(async()=>document.querySelector('.login-button').click());
  assert.equal(app.posts[0].password,'Correct-test-password');assert.equal(app.posts[0].user_id,'Director');assert.equal(app.signedIn[0].current_user.id,'admin');
});
test('the authenticated demo redirect opens the account airport without exposing credentials in its URL',async t=>{
  const app=await setup(t,{redirect:'http://127.0.0.1:5185/'}),destinations=[];
  Object.defineProperty(globalThis,'location',{value:{search:'',hash:'#sharing',href:'http://127.0.0.1:5184/#sharing',origin:'http://127.0.0.1:5184',assign:url=>destinations.push(url)},configurable:true});
  await input('Alexandru Mureșan','[name=username]');await input('Correct-test-password');
  await act(async()=>document.querySelector('.login-button').click());
  assert.deepEqual(destinations,['http://127.0.0.1:5185/#sharing']);
  assert.equal(app.signedIn.length,0);
});

test('a redirect to the current airport opens its session without waiting for hash navigation',async t=>{
  const app=await setup(t,{redirect:'http://flyleaf.test/'}),destinations=[];
  Object.defineProperty(globalThis,'location',{value:{search:'',hash:'#home',href:'http://flyleaf.test/#home',origin:'http://flyleaf.test',assign:url=>destinations.push(url)},configurable:true});
  await input('Ana Ionescu','[name=username]');await input('Correct-test-password');
  await act(async()=>document.querySelector('.login-button').click());
  assert.deepEqual(destinations,[]);
  assert.equal(app.signedIn[0].current_user.id,'admin');
});

test('an accepted login with no authenticated session shows an error and allows retry',async t=>{
  const app=await setup(t,{sessionMissing:true});
  await input('Ana Ionescu','[name=username]');await input('Correct-test-password');
  await act(async()=>document.querySelector('.login-button').click());
  assert.equal(app.signedIn.length,0);
  assert.match(document.querySelector('[role=alert]').textContent,/Sesiunea/);
  assert.equal(document.querySelector('.login-button').disabled,false);
});

test('a stalled login is aborted and returns to a usable form',async t=>{
  const app=await setup(t);
  let abortLogin;
  const originalTimeout=window.setTimeout.bind(window);
  window.setTimeout=(fn,delay,...args)=>delay===15000?(abortLogin=fn,0):originalTimeout(fn,delay,...args);
  globalThis.fetch=(_path,options)=>new Promise((_resolve,reject)=>{
    options.signal.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')),{once:true});
  });
  await input('Ana Ionescu','[name=username]');await input('Correct-test-password');
  await act(async()=>document.querySelector('.login-button').click());
  assert.equal(document.querySelector('.login-button').disabled,true);
  await act(async()=>abortLogin());
  assert.equal(app.signedIn.length,0);
  assert.match(document.querySelector('[role=alert]').textContent,/durează prea mult/);
  assert.equal(document.querySelector('.login-button').disabled,false);
});
