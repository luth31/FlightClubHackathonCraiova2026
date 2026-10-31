import {useCallback, useEffect, useState} from 'react';
import {ArrowLeft, RefreshCw} from 'lucide-react';
import {api} from '@/services/api-client';
import {ErrorMessage} from '@/components/ui';
import type {Page, User} from '@/types';
import {PowerReport} from './PowerReport';
import {ReportHub} from './ReportHub';
import {normalizeReport} from './normalize';
import type {ReportBriefing, ReportCatalog, ReportData, SelectReport} from './types';
import './reports.css';
import './bi.css';
import './workspace.css';
import './briefing.css';

function routeReport() { return location.hash.startsWith('#reports/') ? location.hash.split('/')[1]?.split('?')[0] || '' : ''; }
function routeDepartment() { return new URLSearchParams(location.hash.split('?')[1] || '').get('department') || ''; }
function localToday() { return new Intl.DateTimeFormat('sv-SE', {timeZone:'Europe/Bucharest'}).format(new Date()); }
function storedPins(userId: string): string[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(`aerodesk-pinned-reports-${userId}`) || '[]');
    return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
  } catch { return []; }
}

function ReportSkeleton() {
  return <div className="rp-skeleton" role="status" aria-label="Se încarcă rapoartele"><span/><h2>Pregătim perspectiva ta.</h2><p>Se încarcă datele accesibile contului.</p><div>{[0, 1, 2].map(i => <i key={i}/>)}</div></div>;
}

export function ReportsPage({user, revision, onOpen, onNavigate, notify}: {user: User; revision: number; onOpen: (id: string) => void; onNavigate: (page: Page) => void; notify: (message: string) => void}) {
  const [reportId, setReportId] = useState(routeReport), [department, setDepartment] = useState(routeDepartment), [days, setDays] = useState(90);
  const [briefing, setBriefing] = useState<ReportBriefing>();
  const [catalog, setCatalog] = useState<ReportCatalog>(), [data, setData] = useState<ReportData>(), [error, setError] = useState(''), [refreshing, setRefreshing] = useState(false), [tick, setTick] = useState(0);
  const [pins, setPins] = useState<string[]>(() => storedPins(user.id));
  useEffect(() => {
    const handler = () => { setReportId(routeReport()); setDepartment(routeDepartment()); };
    window.addEventListener('hashchange', handler);
    return () => window.removeEventListener('hashchange', handler);
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    let busy = false;
    async function load() {
      if (busy || controller.signal.aborted) return;
      busy = true; setRefreshing(true);
      try {
        if (!reportId) {
          const next = await api<ReportBriefing>(`/reports/briefing?department=${encodeURIComponent(department)}`, {signal:controller.signal});
          if (controller.signal.aborted) return;
          setBriefing(next); setCatalog(next.catalog); setData(undefined); setError('');
        } else {
        const [nextCatalog, nextData] = await Promise.all([
          api<ReportCatalog>('/reports', {signal: controller.signal}),
          api<ReportData>(`/reports/${encodeURIComponent(reportId)}?days=${days}&department=${encodeURIComponent(department)}&as_of=${localToday()}`, {signal: controller.signal}),
        ]);
        if (controller.signal.aborted) return;
        setCatalog(nextCatalog); setData(nextData ? normalizeReport(nextData) : undefined); setError('');
        }
      } catch (e) {
        if (!controller.signal.aborted) { setData(undefined); setCatalog(undefined); setBriefing(undefined); setError((e as Error).message); }
      } finally {
        busy = false;
        if (!controller.signal.aborted) setRefreshing(false);
      }
    }
    void load();
    const timer = setInterval(() => { if (!document.hidden) void load(); }, 60000);
    const focus = () => { if (!document.hidden) void load(); };
    window.addEventListener('focus', focus);
    return () => { controller.abort(); clearInterval(timer); window.removeEventListener('focus', focus); };
  }, [reportId, department, days, revision, tick, user.id]);
  const refresh = useCallback(() => setTick(v => v + 1), []);
  const select:SelectReport = (id, options={}) => { const query=new URLSearchParams(); const scope=options.department ?? department; if(scope)query.set('department',scope); if(options.status)query.set('status',options.status); if(options.focus)query.set('focus',options.focus); if(options.tab)query.set('view',options.tab); location.hash = id ? `reports/${id}`+(query.size?'?'+query.toString():'') : 'reports'; window.scrollTo(0,0); };
  function pin(id: string) {
    const next = pins.includes(id) ? pins.filter(p => p !== id) : [...pins, id];
    setPins(next);
    try { localStorage.setItem(`aerodesk-pinned-reports-${user.id}`, JSON.stringify(next)); }
    catch { notify('Preferința este păstrată pentru această vizită.'); }
  }
  if (error) return <div className="rp-page"><button className="rp-back-to-hub" onClick={() => select('')}><ArrowLeft size={15}/>Centrul de rapoarte</button><ErrorMessage message={error} retry={refresh}/></div>;
  if (!catalog || (!reportId&&!briefing) || (reportId && data?.report.id !== reportId)) return <div className="rp-page"><ReportSkeleton/></div>;
  return <div className="rp-page">{reportId && data ? <>
    <div className="rp-report-navigation"><button className="rp-back-to-hub" onClick={() => select('')}><ArrowLeft size={15}/>Biblioteca de rapoarte</button><span>/</span><select aria-label="Schimbă raportul" value={reportId} onChange={e => select(e.target.value)}>{catalog.items.map(r => <option key={r.id} value={r.id}>{r.title}</option>)}</select><span className="rp-live-tag">{refreshing ? <RefreshCw size={12} className="rp-spin"/> : <i/>}{refreshing ? 'Se actualizează…' : 'Conectat la datele aplicației'}</span></div>
    <PowerReport key={data.report.id} data={data} days={days} department={department} onDays={setDays} onDepartment={setDepartment} onOpen={onOpen} onNavigate={onNavigate} onRefresh={refresh} refreshing={refreshing} pinned={pins.includes(data.report.id)} onPin={() => pin(data.report.id)} notify={notify}/>
  </> : briefing&&<ReportHub data={briefing} pins={pins} onPin={pin} onSelect={select} user={user} onOpen={onOpen} onNavigate={onNavigate} onRefresh={refresh} refreshing={refreshing} department={department} onDepartment={setDepartment}/>}</div>;
}
