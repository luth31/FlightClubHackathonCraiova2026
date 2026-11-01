import {LanguageSwitcher} from '@/i18n/LanguageSwitcher';
import {t,useLanguage} from '@/i18n';
import {useState} from 'react';
import './login-branding.css';
import {ArrowRight,Plane,LoaderCircle,Check} from 'lucide-react';
import {api,setIdentity} from '@/services/api-client';
import {ErrorMessage} from '@/components/ui';
import type {Session} from '@/types';

export function LoginPage({session,onLogin}:{session:Session;onLogin:(s:Session)=>void}) {
  useLanguage();
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
      <a className="brand flyleaf-login-brand" href="#" aria-label="FlyLeaf"><img src="/branding/flyleaf-logo.png" alt="FlyLeaf" width="340" height="130"/></a>
      <div className="login-story-content"><div className="eyebrow">FLYLEAF</div><h1>Less paperwork. More possibility.</h1><p>{t("Operațiuni, documente și echipă. Într-un singur loc.")}</p><div className="login-benefits"><span><Check size={16}/>{t("Documente")}</span><span><Check size={16}/>{t("Decizii")}</span><span><Check size={16}/>{t("Colaborare")}</span></div></div>
      <svg className="runway-art" viewBox="0 0 600 180" fill="none" aria-hidden="true"><path d="M-40 150h230c80 0 75-100 160-100h300M-40 170h240c90 0 85-100 160-100h290" stroke="currentColor"/><path d="M-40 160h235c85 0 80-100 160-100h290" stroke="currentColor" strokeDasharray="8 12"/><circle cx="352" cy="59" r="8" fill="currentColor"/><path d="m345 58 9-7-1 8 6 4-2 2-6-4-4 5-2-1 2-5z" fill="#174c3f"/></svg>
      <div className="login-footer">FlyLeaf · Flight Club</div>
    </div>
    <div className="login-form-side"><LanguageSwitcher/><div className="login-card">
      <span className="login-airport"><Plane size={20}/></span><div className="eyebrow">FLYLEAF</div>
      <h2>{t("Bine ai venit.")}</h2><p>{oidc?t("Folosește contul aeroportului."):t("Conectează-te la spațiul tău de lucru.")}</p>
      {oidc?<a className="button primary full-width login-button" href={session.auth?.login_url||'/api/auth/oidc/login'}>{t("Conectează-te")}<ArrowRight size={18}/></a>:<form onSubmit={event=>{event.preventDefault();void login()}}>
        <label className="field">{t("Nume")}<input name="username" type="text" required maxLength={200} autoComplete="username" autoCapitalize="words" spellCheck={false} value={name} disabled={busy} onChange={e=>setName(e.target.value)}/></label>
        <label className="field">{t("Parolă")}<input name="password" type="password" required maxLength={200} autoComplete="current-password" value={password} disabled={busy} onChange={e=>setPassword(e.target.value)}/></label>
        <button type="submit" className="button primary full-width login-button" disabled={busy||!name.trim()||!password.trim()}>{busy?<LoaderCircle className="spin" size={18}/>:<>{t("Intră în spațiul de lucru")}<ArrowRight size={18}/></>}</button>
      </form>}
      {error&&<ErrorMessage message={error}/>}
    </div><small className="login-copyright">FlyLeaf©</small></div>
  </main>;
}
