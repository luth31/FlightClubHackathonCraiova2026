import {useEffect, useId, useRef, useState, type FormEvent} from 'react';
import {Camera, Check, ChevronRight, Clock3, MessageSquare, RotateCcw, Trash2} from 'lucide-react';
import {api} from '@/services/api-client';
import type {Person, PersonProfile, Presence} from '@/features/people/types';
import {usePersonDirectory} from './PersonDirectory';
import {displayedPresence, liveProfile, presenceLabels} from './profile-status';

const durations = [[30, '30 de minute'], [60, '1 oră'], [240, '4 ore'], [480, '8 ore'], [1440, '24 de ore'], [0, 'Până îl schimb']] as const;
const statuses: Presence[] = ['available', 'busy', 'do_not_disturb', 'be_right_back', 'away', 'offline'];
const until = (value: string) => new Intl.DateTimeFormat('ro-RO', {timeZone: 'Europe/Bucharest', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'}).format(new Date(value));

export function OwnProfileControls({person, onEditingChange}: {person: Person; onEditingChange: (editing: boolean) => void}) {
  const {updateProfile, now} = usePersonDirectory();
  const profile = liveProfile(person.profile, now);
  const status = displayedPresence(person, now);
  const [panel, setPanel] = useState<'presence'|'message'|'photo'|null>(null);
  const [presence, setPresence] = useState<Presence>('available');
  const [duration, setDuration] = useState(60);
  const [message, setMessage] = useState('');
  const [file, setFile] = useState<File>();
  const [preview, setPreview] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const upload = useRef<HTMLInputElement>(null);
  const alive = useRef(true);
  const id = useId();
  useEffect(() => {alive.current = true; return () => {alive.current = false;};}, []);
  useEffect(() => {onEditingChange(panel !== null); return () => onEditingChange(false);}, [panel, onEditingChange]);
  useEffect(() => {
    if (!file) {setPreview(''); return;}
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  function open(next: typeof panel) {
    setError(''); setNotice(''); setPanel(next); setFile(undefined);
    setPresence(profile.presence === 'automatic' ? 'available' : profile.presence);
    setMessage(profile.status_message);
    setDuration(next === 'message' ? 1440 : 60);
  }
  async function save(operation: () => Promise<PersonProfile>, success: string) {
    setBusy(true); setError(''); setNotice('');
    try {
      const updated = await operation();
      if (!alive.current) return;
      updateProfile(person.id, updated); setPanel(null); setFile(undefined); setNotice(success);
    } catch (cause) {
      if (alive.current) setError((cause as Error).message);
    } finally {
      if (alive.current) setBusy(false);
    }
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    if (panel === 'presence') void save(() => api('/people/me/presence', {method: 'PATCH', body: JSON.stringify({status: presence, duration_minutes: duration || null})}), 'Statusul a fost salvat.');
    if (panel === 'message') void save(() => api('/people/me/status-message', {method: 'PATCH', body: JSON.stringify({message, duration_minutes: duration || null})}), message.trim() ? 'Mesajul de status a fost salvat.' : 'Mesajul de status a fost șters.');
    if (panel === 'photo' && file) {
      const body = new FormData(); body.append('file', file);
      void save(() => api('/people/me/photo', {method: 'POST', body}), 'Fotografia a fost actualizată.');
    }
  }

  return <section className="own-profile" aria-label="Setările profilului tău">
    <div className="own-profile-label">CONTUL TĂU</div>
    {!panel ? <div className="own-profile-actions">
      <button type="button" className="own-profile-action" onClick={() => open('presence')} aria-label="Schimbă statusul">
        <span className={`profile-status-dot profile-status-dot-${status}`} aria-hidden="true"/>
        <span><strong>{presenceLabels[status]}</strong><small>{profile.presence_expires_at ? `Revine automat pe ${until(profile.presence_expires_at)}` : profile.presence === 'automatic' ? 'Status automat · schimbă' : 'Status ales de tine · schimbă'}</small></span><ChevronRight size={15}/>
      </button>
      <button type="button" className="own-profile-action" onClick={() => open('message')}>
        <MessageSquare size={17}/><span><strong>{profile.status_message ? 'Editează mesajul de status' : 'Setează un mesaj de status'}</strong><small>Vizibil colegilor pe profilul tău</small></span><ChevronRight size={15}/>
      </button>
      <button type="button" className="own-profile-action" onClick={() => open('photo')}>
        <Camera size={17}/><span><strong>Schimbă fotografia</strong><small>Adaugă sau elimină poza de profil</small></span><ChevronRight size={15}/>
      </button>
    </div> : <form className="own-profile-form" onSubmit={submit}>
      <fieldset disabled={busy}>
        {panel === 'presence' && <>
          <label htmlFor={`${id}-status`}>Statusul tău</label>
          <select id={`${id}-status`} value={presence} onChange={event => setPresence(event.target.value as Presence)} autoFocus>
            {statuses.map(value => <option key={value} value={value}>{presenceLabels[value]}</option>)}
          </select>
          <p className="own-profile-hint">Colegii văd statusul ales. „Nu deranjați” indică preferința ta de disponibilitate.</p>
        </>}
        {panel === 'message' && <>
          <label htmlFor={`${id}-message`}>Mesajul de status</label>
          <textarea id={`${id}-message`} value={message} onChange={event => setMessage(event.target.value)} maxLength={280} rows={3} placeholder="De exemplu: Sunt pe platformă. Revin la 14:00." autoFocus/>
          <span className="own-profile-count">{message.length}/280</span>
        </>}
        {(panel === 'presence' || panel === 'message') && <>
          <label htmlFor={`${id}-duration`}><Clock3 size={14}/>{panel === 'presence' ? 'Revino la statusul automat după' : 'Șterge mesajul după'}</label>
          <select id={`${id}-duration`} value={duration} onChange={event => setDuration(Number(event.target.value))}>
            {durations.map(([value, label]) => <option key={value} value={value}>{value === 0 && panel === 'message' ? 'Până îl șterg' : label}</option>)}
          </select>
        </>}
        {panel === 'photo' && <>
          <div className="own-profile-photo-preview">
            {(preview || profile.photo_url) ? <img src={preview || profile.photo_url!} alt="Previzualizarea fotografiei de profil"/> : <Camera size={32} aria-hidden="true"/>}
          </div>
          <input ref={upload} hidden type="file" accept="image/jpeg,image/png,image/webp" aria-label="Alege fotografia de profil" onChange={event => {
            const selected = event.target.files?.[0]; event.target.value = '';
            if (!selected) return;
            if (selected.size > 2 * 1024 * 1024) {setError('Alege o fotografie de cel mult 2 MB.'); return;}
            if (selected.type && !['image/jpeg', 'image/png', 'image/webp'].includes(selected.type)) {setError('Folosește o fotografie JPG, PNG sau WebP.'); return;}
            setFile(selected); setError('');
          }}/>
          <button type="button" className="own-profile-photo-pick" onClick={() => upload.current?.click()}><Camera size={15}/>{file ? 'Alege altă fotografie' : 'Alege o fotografie'}</button>
          <p className="own-profile-hint">JPG, PNG sau WebP · maximum 2 MB. Fotografia este încadrată automat în centru.</p>
        </>}
        <div className="own-profile-form-actions">
          <button type="button" className="own-profile-cancel" onClick={() => open(null)}>Renunță</button>
          <button type="submit" className="own-profile-save" disabled={panel === 'photo' && !file}><Check size={14}/>{busy ? 'Se salvează…' : 'Salvează'}</button>
        </div>
        {panel === 'presence' && <button type="button" className="own-profile-reset" onClick={() => void save(() => api('/people/me/presence', {method: 'PATCH', body: JSON.stringify({status: 'automatic'})}), 'Statusul automat a fost restabilit.')}><RotateCcw size={14}/>Resetează statusul</button>}
        {panel === 'message' && profile.status_message && <button type="button" className="own-profile-reset" onClick={() => void save(() => api('/people/me/status-message', {method: 'PATCH', body: JSON.stringify({message: ''})}), 'Mesajul de status a fost șters.')}><Trash2 size={14}/>Șterge mesajul</button>}
        {panel === 'photo' && profile.photo_url && <button type="button" className="own-profile-reset" onClick={() => void save(() => api('/people/me/photo', {method: 'DELETE'}), 'Fotografia a fost eliminată.')}><Trash2 size={14}/>Elimină fotografia</button>}
      </fieldset>
    </form>}
    {error && <p className="own-profile-error" role="alert">{error}</p>}
    {notice && <p className="own-profile-notice" role="status"><Check size={14}/>{notice}</p>}
  </section>;
}
