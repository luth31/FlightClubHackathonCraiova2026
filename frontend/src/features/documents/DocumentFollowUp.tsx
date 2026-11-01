import {t,useLanguage} from '@/i18n';
import {useState, type FormEvent} from 'react';
import {Archive, BellRing, CalendarClock, CirclePause, RotateCcw} from 'lucide-react';
import {api} from '@/services/api-client';
import {Modal, ErrorMessage} from '@/components/ui';
import {date} from '@/utils/format';
import {DocumentPerson} from './DocumentPerson';
import type {DocumentRecord, DocumentFollowUpState} from '@/types';

type Action = 'snooze' | 'clear_reminder' | 'do_not_renew' | 'resume_renewal';
export function DocumentFollowUp({doc, onChanged, notify, onArchive, canArchive}: {
  doc: DocumentRecord; onChanged: () => void; notify: (message: string) => void;
  onArchive: () => void; canArchive: boolean;
}) {
  useLanguage();
  const [action, setAction] = useState<Action>();
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [remindOn, setRemindOn] = useState(''), [reason, setReason] = useState(''), [responsible, setResponsible] = useState('');
  const [opening, setOpening] = useState<DocumentFollowUpState>();
  const [openingVersion, setOpeningVersion] = useState(0);
  const state = doc.follow_up;
  if (!state) return null;
  function open(next: Action) {
    setOpening(state); setOpeningVersion(doc.version); setAction(next); setError(''); setReason('');
    setRemindOn(state?.remind_on || '');
    setResponsible(state?.decision?.responsible_id || (state?.candidates?.length === 1 ? state.candidates[0].id : ''));
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!opening || !action || busy) return;
    setBusy(true); setError('');
    try {
      const personal = ['snooze', 'clear_reminder'].includes(action);
      await api(`/documents/${doc.id}/follow-up`, {method:'POST', body:JSON.stringify({
        action, version: openingVersion, revision: personal ? opening.reminder_revision : opening.decision_revision,
        ...(action === 'snooze' ? {remind_on:remindOn} : {}),
        ...(!personal ? {reason, ...(action === 'do_not_renew' ? {responsible_id:responsible} : {})} : {}),
      })});
      setAction(undefined); onChanged();
      notify(action === 'snooze' ? `Memento programat pentru ${date(remindOn)}.` :
        action === 'do_not_renew' ? 'Decizia de nereînnoire a fost înregistrată.' : 'Urmărirea a fost actualizată.');
    } catch (failure) { setError((failure as Error).message); }
    finally { setBusy(false); }
  }
  const titles: Record<Action, string> = {
    snooze:'Amintește-mi pe…', clear_reminder:state.snoozed ? 'Reia alertele mele' : 'Încheie mementoul',
    do_not_renew:'Nu se reînnoiește', resume_renewal:'Reia urmărirea reînnoirii',
  };
  const tomorrow = new Date(state.reference_date + 'T12:00:00Z');
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  return <section className="panel document-followup" aria-label={t("Alerte și urmărire")}>
    <div className="document-followup-heading"><BellRing size={18}/><h2>{t("Alerte și urmărire")}</h2></div>
    {doc.status === 'archived' ? <p>{t("Documentul este în arhivă. Fișierele și istoricul rămân disponibile; avertizările de expirare sunt oprite.")}</p> : <>
      {state.not_renewing && state.decision ? <div className="followup-decision">
        <strong><CirclePause size={15}/>{t("Nu se reînnoiește")}</strong><p>{state.decision.reason}</p>
        <span>{t("Responsabil:")}{' '}<DocumentPerson name={state.decision.responsible} userId={state.decision.responsible_id}/></span>
        {!state.decision.responsible_active && <p>{t("Responsabilul nu mai este activ. Actualizează persoana desemnată.")}</p>}
        <small>{t("Decizie înregistrată de")}{' '}{state.decision.decided_by}, {date(state.decision.decided_at)}.</small>
        <p>{t("Avertizările de expirare și urmărirea reînnoirii sunt oprite. Contractul își păstrează data de valabilitate.")}</p>
      </div> : state.snoozed ? <p className="followup-personal-state"><CalendarClock size={16}/>{t("Alertele tale sunt amânate până la")}{' '}<strong>{date(state.remind_on!)}</strong>.</p> :
        state.reminder_due ? <p className="followup-personal-state"><BellRing size={16}/>{t("Ai programat revenirea la acest document pentru")}{' '}<strong>{date(state.remind_on!)}</strong>.</p> :
        <p>{t("Programează o revenire sau înregistrează decizia privind continuarea contractului.")}</p>}
      <div className="document-followup-actions">
        {state.can_remind && !state.not_renewing && <button className="button secondary small-button" onClick={() => open('snooze')}><CalendarClock size={15}/>{state.remind_on ? t("Schimbă data mementoului") : t("Amintește-mi pe…")}</button>}
        {!!state.remind_on && !state.not_renewing && <button className="text-button" onClick={() => open('clear_reminder')}><RotateCcw size={14}/>{titles.clear_reminder}</button>}
        {state.can_decide && <button className="button secondary small-button" onClick={() => open('do_not_renew')}><CirclePause size={15}/>{state.not_renewing ? t("Modifică decizia / responsabilul") : t("Nu se reînnoiește")}</button>}
        {state.can_decide && state.not_renewing && <button className="text-button" onClick={() => open('resume_renewal')}><RotateCcw size={14}/>{t("Reia urmărirea reînnoirii")}</button>}
        {canArchive && <button className="text-button" onClick={onArchive}><Archive size={15}/>{t("Mută în arhivă")}</button>}
      </div>
    </>}
    {action && <Modal title={titles[action]} subtitle={doc.title} onClose={() => {if (!busy) setAction(undefined);}}>
      <form className="modal-body" onSubmit={submit}>
        {action === 'snooze' && <>
          <p>{t("Mementoul va apărea în Acasă la data aleasă. Până atunci, avertizările tale de expirare și reînnoire sunt amânate. Sarcinile de aprobare și alertele colegilor rămân active.")}</p>
          <label className="field">{t("Data revenirii")}<input type="date" required min={tomorrow.toISOString().slice(0,10)} value={remindOn} onChange={e => setRemindOn(e.target.value)}/></label>
          {doc.expires_at && remindOn > doc.expires_at.slice(0,10) && <p className="followup-date-notice">{t("Data aleasă este după expirarea documentului (")}{date(doc.expires_at)}).</p>}
        </>}
        {action === 'clear_reminder' && <p>{t("Mementoul personal se încheie. Avertizările obișnuite de expirare și reînnoire devin din nou active.")}</p>}
        {['do_not_renew', 'resume_renewal'].includes(action) && <>
          <p>{action === 'do_not_renew' ? t("Decizia se aplică aeroportului și oprește avertizările de expirare și urmărirea reînnoirii pentru această versiune. Documentul și data expirării rămân în registru.") : t("Avertizările de expirare și urmărirea reînnoirii vor fi reluate. Decizia anterioară rămâne în istoric.")}</p>
          {action === 'do_not_renew' && <label className="field">{t("Responsabil pentru decizie")}<select required value={responsible} onChange={e => setResponsible(e.target.value)}><option value="">{t("Alege responsabilul")}</option>{state.candidates?.map(person => <option key={person.id} value={person.id}>{person.name} · {person.department}</option>)}</select></label>}
          <label className="field">{t("Motivul deciziei")}<textarea required minLength={10} maxLength={2000} rows={3} value={reason} onChange={e => setReason(e.target.value)}/></label>
        </>}
        {error && <ErrorMessage message={error}/>}
        <div className="modal-footer"><button type="button" className="button secondary" disabled={busy} onClick={() => setAction(undefined)}>{t("Renunță")}</button><button className="button primary" disabled={busy}>{busy ? t("Se salvează…") : t("Salvează")}</button></div>
      </form>
    </Modal>}
  </section>;
}
