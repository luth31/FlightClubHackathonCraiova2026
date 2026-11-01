import {useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type FocusEvent} from 'react';
import {createPortal} from 'react-dom';
import {Building2, Check, ChevronDown, Copy, LogOut, Mail, UserRound, X} from 'lucide-react';
import {date, initials, roleLabel} from '@/utils/format';
import {usePersonDirectory, type Person} from './PersonDirectory';
import {OwnProfileControls} from './OwnProfileControls';
import {displayedPresence, liveProfile, presenceLabels} from './profile-status';
import './person-avatar.css';

const focusable = 'button:not(:disabled), a[href], input:not(:disabled):not([hidden]), select:not(:disabled), textarea:not(:disabled)';

function ProfileImage({url, name}: {url: string | null; name: string}) {
  const [failed, setFailed] = useState<string>();
  return url && failed !== url ? <img className="person-avatar-image" src={url} alt="" onError={() => setFailed(url)}/> : initials(name);
}

export function PersonStatus({person}: {person: Person}) {
  const directory = usePersonDirectory();
  const current = directory.data?.items.find(item => item.id === person.id);
  const status = displayedPresence({...person, profile: current?.profile || person.profile}, directory.now);
  return <span className={`availability availability-${status}`}><i aria-hidden="true"/>{status === 'offline' ? 'Offline' : presenceLabels[status]}</span>;
}

export function PersonAvatar({userId, name, person, referenceDate, className = 'avatar', style, externalAirport, accountRole, disabled, openOnFocus = true}: {
  userId?: string;
  name: string;
  person?: Person;
  referenceDate?: string;
  className?: string;
  style?: CSSProperties;
  externalAirport?: string;
  accountRole?: string;
  disabled?: boolean;
  openOnFocus?: boolean;
}) {
  const directory = usePersonDirectory();
  // Audit entries can contain names rather than IDs. Ambiguous names stay unresolved.
  const personId = userId || person?.id;
  const matches = externalAirport ? undefined : directory.data?.items.filter(item => personId ? item.id === personId : item.name === name);
  const match = matches?.length === 1 ? matches[0] : undefined;
  const profile = person ? {...person, profile: match?.profile || person.profile} : match;
  const personal = liveProfile(profile?.profile, directory.now);
  const status = displayedPresence(profile, directory.now);
  const statusLabel = status === 'offline' ? 'Offline' : presenceLabels[status];
  const own = !externalAirport && !!(profile?.id || personId) &&
    (directory.account?.userId || directory.data?.current_user_id) === (profile?.id || personId);
  const [open, setOpen] = useState(false);
  const [copyState,setCopyState] = useState<'idle'|'copied'|'failed'>('idle');
  const trigger = useRef<HTMLButtonElement>(null);
  const card = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const suppressFocus = useRef(false);
  const editing = useRef(false);
  const onEditingChange = useCallback((value: boolean) => {editing.current = value;}, []);
  const id = useId();

  function clearTimer() {
    clearTimeout(timer.current);
  }
  function show() {
    clearTimer();
    setOpen(true);
  }
  async function copyEmail(){
    if(!profile?.email)return;
    try{await navigator.clipboard.writeText(profile.email);setCopyState('copied')}
    catch{setCopyState('failed')}
  }
  useEffect(()=>{setCopyState('idle')},[open,profile?.email]);
  const close = useCallback((restoreFocus = false) => {
    clearTimeout(timer.current);
    setOpen(false);
    if (restoreFocus) {
      suppressFocus.current = true;
      trigger.current?.focus({preventScroll: true});
      suppressFocus.current = false;
    }
  }, []);
  function scheduleClose() {
    clearTimer();
    if (editing.current) return;
    timer.current = setTimeout(() => {
      const active = document.activeElement;
      if (!card.current?.contains(active) && active !== trigger.current) setOpen(false);
    }, 250);
  }
  function blur(event: FocusEvent) {
    const next = event.relatedTarget as Node | null;
    if (!next) return;
    if (next !== trigger.current && !card.current?.contains(next)) close();
  }

  useEffect(() => () => clearTimeout(timer.current), []);

  useLayoutEffect(() => {
    if (!open || !card.current || !trigger.current) return;
    const panel = card.current;
    const anchor = trigger.current;
    function position() {
      const bounds = anchor.getBoundingClientRect();
      const margin = 12;
      const gap = 10;
      const width = panel.offsetWidth;
      const height = panel.offsetHeight;
      const below = bounds.bottom + gap;
      const top = below + height <= window.innerHeight - margin ? below : bounds.top - gap - height;
      panel.style.left = `${Math.max(margin, Math.min(bounds.left, window.innerWidth - width - margin))}px`;
      panel.style.top = `${Math.max(margin, Math.min(top, window.innerHeight - height - margin))}px`;
    }
    position();
    const observer = new ResizeObserver(position);
    observer.observe(panel);
    window.addEventListener('resize', position);
    window.addEventListener('scroll', position, true);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', position);
      window.removeEventListener('scroll', position, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function outside(event: PointerEvent) {
      const target = event.target as Node;
      if (!card.current?.contains(target) && !trigger.current?.contains(target)) close();
    }
    function escape(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      close(!!card.current?.contains(document.activeElement));
    }
    // Opening another person's card dismisses this one, including on keyboard focus.
    function otherCard(event: Event) {
      if ((event as CustomEvent<string>).detail !== id) close();
    }
    document.dispatchEvent(new CustomEvent('person-card-open', {detail: id}));
    document.addEventListener('person-card-open', otherCard);
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape, true);
    window.addEventListener('hashchange', outsideRoute);
    function outsideRoute() { close(); }
    return () => {
      document.removeEventListener('person-card-open', otherCard);
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape, true);
      window.removeEventListener('hashchange', outsideRoute);
    };
  }, [open, id, close]);

  return <>
    <button
      ref={trigger}
      type="button"
      className={`person-avatar-trigger ${accountRole ? 'person-account-trigger' : ''} ${className}`}
      style={style}
      disabled={disabled}
      aria-label={`Vezi profilul: ${name}`}
      aria-haspopup="dialog"
      aria-expanded={open}
      aria-controls={open ? id : undefined}
      onPointerEnter={event => {
        if (event.pointerType === 'touch') return;
        clearTimer();
        timer.current = setTimeout(() => setOpen(true), 180);
      }}
      onPointerLeave={scheduleClose}
      onFocus={() => { if (openOnFocus && !suppressFocus.current) show(); }}
      onBlur={blur}
      onClick={event => { event.stopPropagation(); show(); }}
      onKeyDown={event => {
        if (event.key === 'Tab' && open && !event.shiftKey) {
          const first = card.current?.querySelector<HTMLElement>(focusable);
          if (first) { event.preventDefault(); first.focus(); }
        }
      }}
    >
      {accountRole ? <>
        <span className="avatar person-account-avatar" aria-hidden="true">
          <ProfileImage url={personal.photo_url} name={name}/>
          {profile && <span className={`person-presence person-presence-${status}`}/>}
        </span>
        <span className="person-account-label"><strong>{name}</strong><small>{accountRole}</small></span>
        <ChevronDown size={15} aria-hidden="true"/>
      </> : <>
        <ProfileImage url={personal.photo_url} name={name}/>
        {profile && !externalAirport && <span className={`person-presence person-presence-${status}`} aria-hidden="true"/>}
      </>}
    </button>
    {open && createPortal(
      <div
        ref={card}
        id={id}
        className={`person-profile ${own ? 'person-profile-own' : ''}`}
        role="dialog"
        aria-label={`Profil: ${profile?.name || name}`}
        onPointerEnter={clearTimer}
        onPointerLeave={scheduleClose}
        onFocus={clearTimer}
        onBlur={blur}
        onKeyDown={event => {
          if (event.key !== 'Tab') return;
          const controls = card.current?.querySelectorAll<HTMLElement>(focusable);
          if (!controls?.length) return;
          if (event.shiftKey && document.activeElement === controls[0]) {
            event.preventDefault();
            trigger.current?.focus();
          } else if (!event.shiftKey && document.activeElement === controls[controls.length - 1]) {
            // Resume the page's natural tab order after the avatar.
            close(true);
          }
        }}
      >
        <button type="button" className="person-profile-close" aria-label="Închide profilul" onClick={() => close(true)}><X size={17}/></button>
        <div className="person-profile-header">
          <span className="person-profile-avatar" aria-hidden="true"><ProfileImage url={personal.photo_url} name={profile?.name || name}/></span>
          <div>
            <h2>{profile?.name || name}</h2>
            {profile && <p>{roleLabel[profile.job_title] || profile.job_title || roleLabel[profile.role] || profile.role}</p>}
            {externalAirport ? <span>{externalAirport}</span> : <span className={`person-profile-status person-profile-status-${status}`}><i aria-hidden="true"/>{statusLabel}</span>}
          </div>
        </div>
        {!externalAirport && personal.status_message && <p className="person-profile-status-message">{personal.status_message}</p>}
        {own && profile && <OwnProfileControls person={profile} onEditingChange={onEditingChange}/>}
        {profile ? <>
          <dl className="person-profile-details">
            <div><dt><Mail size={16}/>Email</dt><dd className="person-email-copy">{profile.email ? <><a href={`mailto:${profile.email}`}>{profile.email}</a><button type="button" aria-label="Copiază emailul" title="Copiază emailul" onClick={()=>void copyEmail()}>{copyState==='copied'?<Check size={15}/>:<Copy size={15}/>}</button></> : 'Nespecificat'}</dd></div>
            <div><dt><Building2 size={16}/>Departament</dt><dd>{profile.department || 'Nespecificat'}</dd></div>
            {!externalAirport && <div><dt><UserRound size={16}/>Manager</dt><dd>{profile.manager_name || 'Nespecificat'}</dd></div>}
          </dl>
          {copyState!=='idle'&&<p className="person-copy-status" role="status">{copyState==='copied'?'Email copiat.':'Copierea nu este disponibilă. Selectează și copiază adresa afișată.'}</p>}
          {((!own && profile.email) || profile.availability === 'away') && <div className="person-profile-footer">
            {!own && profile.email && <a className="person-profile-email" href={`mailto:${profile.email}`}><Mail size={15}/>Trimite email</a>}
            {!externalAirport && profile.availability === 'away' && <small>În concediu la {date(referenceDate || directory.data?.reference_date)}</small>}
          </div>}
        </> : <div className="person-profile-message" role="status">
          {directory.error ? <>Profilul nu a putut fi încărcat.<button type="button" onClick={directory.refresh}>Încearcă din nou</button></> : !directory.data ? 'Se încarcă profilul…' : 'Informațiile acestei persoane nu sunt disponibile în directorul echipei.'}
        </div>}
        {own && directory.account && <div className="person-profile-signout">
          <button type="button" className="logout-button person-signout-button" disabled={directory.account.signingOut} aria-busy={directory.account.signingOut} onClick={() => {close(true); void directory.account?.signOut();}}>
            <LogOut size={17}/>{directory.account.signingOut ? 'Se deconectează…' : 'Ieși din cont'}
          </button>
          {directory.account.signOutError && <p className="own-profile-error">{directory.account.signOutError}</p>}
        </div>}
      </div>, document.body,
    )}
  </>;
}
