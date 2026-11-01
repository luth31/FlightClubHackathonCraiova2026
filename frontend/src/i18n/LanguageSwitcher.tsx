import {Languages} from 'lucide-react';
import {setLanguage,t,useLanguage,type Language} from './index';
import './language.css';

export function LanguageSwitcher({compact=false}:{compact?:boolean}){
  const language=useLanguage();
  return <label className={'language-switcher'+(compact?' compact':'')}><Languages size={16} aria-hidden="true"/><span className="sr-only">{t('Limba interfeței')}</span><select aria-label={t('Limba interfeței')} value={language} onChange={event=>setLanguage(event.target.value as Language)}><option value="ro">Română</option><option value="en">English</option></select></label>;
}
