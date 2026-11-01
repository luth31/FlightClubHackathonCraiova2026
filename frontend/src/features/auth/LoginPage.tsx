import {useState} from 'react';
import {ArrowRight,Plane,LoaderCircle,Check} from 'lucide-react';
import {api,setIdentity} from '@/services/api-client';
import {ErrorMessage} from '@/components/ui';
import type {Session} from '@/types';

export function LoginPage({session,onLogin}:{session:Session;onLogin:(s:Session)=>void}) {
  const [name,setName]=useState(''),[password,setPassword]=useState(''),[busy,setBusy]=useState(false);
  const [error,setError]=useState(new URLSearchParams(location.search).has('auth_error')?'Conectarea nu a putut fi finalizată. Încearcă din nou cu un cont activ al aeroportului.':'');
  const oidc=session.auth?.mode==='oidc';
  async function login(){
    if(busy)return;
    if(!name.trim()||!password.trim()){setError('Introdu numele și parola contului.');return}
    setBusy(true);setError('');
    const controller=new AbortController();
    const timeout=window.setTimeout(()=>controller.abort(),15000);
    try{
      const result=await api<Session&{redirect_url?:string}>('/auth/login',{method:'POST',body:JSON.stringify({user_id:name.trim(),password}),signal:controller.signal});
      // The local multi-airport demo resolves the account, authenticates it at its
      // airport and sets that airport's HttpOnly cookie. Same-origin redirects
      // may only change the hash, so refresh the session explicitly in that case.
      if(result.redirect_url){
        const target=new URL(result.redirect_url,location.href);
        if(target.origin!==location.origin){target.hash=location.hash||'#home';location.assign(target.href);return}
      }
      const signedIn=await api<Session>('/session',{signal:controller.signal});
      if(!signedIn.current_user)throw new Error('Sesiunea nu a putut fi deschisă. Încearcă să te conectezi din nou.');
      setIdentity(signedIn.current_user.id);
      onLogin(signedIn);
    }catch(e){setError(controller.signal.aborted?'Conectarea durează prea mult. Încearcă din nou.':(e as Error).message);setBusy(false)}
    finally{window.clearTimeout(timeout)}
  }
  return <main className="login-page">
    <div className="login-story">
      <a className="brand" href="#"><span className="brand-mark"><svg viewBox="0 0 32 32"><path d="M5 25 16 5l11 20h-7l-4-8-4 8z" fill="currentColor"/><path d="M8 21h18" stroke="#91b6a3" strokeWidth="2"/></svg></span>FlyLeaf<span className="brand-period">.</span></a>
      <div className="login-story-content"><div className="eyebrow">AEROPORTUL TĂU. CONECTAT.</div><h1>O zi mai clară.<br/><em>Împreună.</em></h1><p>Operațiuni, documente și echipă. Într-un singur loc.</p><div className="login-benefits"><span><Check size={16}/>Documente</span><span><Check size={16}/>Decizii</span><span><Check size={16}/>Colaborare</span></div></div>
      <svg className="runway-art" viewBox="0 0 600 180" fill="none" aria-hidden="true"><path d="M-40 150h230c80 0 75-100 160-100h300M-40 170h240c90 0 85-100 160-100h290" stroke="currentColor"/><path d="M-40 160h235c85 0 80-100 160-100h290" stroke="currentColor" strokeDasharray="8 12"/><circle cx="352" cy="59" r="8" fill="currentColor"/><path d="m345 58 9-7-1 8 6 4-2 2-6-4-4 5-2-1 2-5z" fill="#174c3f"/></svg>
      <div className="login-footer">FlyLeaf · Flight Club</div>
    </div>
    <div className="login-form-side"><div className="login-card">
      <span className="login-airport"><Plane size={20}/></span><div className="eyebrow">FLYLEAF</div>
      <h2>Bine ai venit.</h2><p>{oidc?'Folosește contul aeroportului.':'Conectează-te la spațiul tău de lucru.'}</p>
      {oidc?<a className="button primary full-width login-button" href={session.auth?.login_url||'/api/auth/oidc/login'}>Conectează-te<ArrowRight size={18}/></a>:<form onSubmit={event=>{event.preventDefault();void login()}}>
        <label className="field">Nume<input name="username" type="text" required maxLength={200} autoComplete="username" autoCapitalize="words" spellCheck={false} value={name} disabled={busy} onChange={e=>setName(e.target.value)}/></label>
        <label className="field">Parolă<input name="password" type="password" required maxLength={200} autoComplete="current-password" value={password} disabled={busy} onChange={e=>setPassword(e.target.value)}/></label>
        <button type="submit" className="button primary full-width login-button" disabled={busy||!name.trim()||!password.trim()}>{busy?<LoaderCircle className="spin" size={18}/>:<>Intră în spațiul de lucru<ArrowRight size={18}/></>}</button>
      </form>}
      {error&&<ErrorMessage message={error}/>}
    </div><small className="login-copyright">FlyLeaf©</small></div>
  </main>;
}
