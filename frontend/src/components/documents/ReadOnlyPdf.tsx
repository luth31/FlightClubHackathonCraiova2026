import {useEffect,useState} from 'react';
import {ChevronLeft,ChevronRight,Download,FileText,ZoomIn} from 'lucide-react';
import {download,fileUrl} from '@/services/api-client';
import {ErrorMessage,Loading} from '@/components/ui';
import './read-only-pdf.css';

export function representationUrl(source:string,representation:string,page?:number){
  const url=new URL(fileUrl(source),location.origin);
  url.searchParams.set('representation',representation);
  if(page!==undefined)url.searchParams.set('page',String(page));
  return url.pathname+url.search;
}

export function ReadOnlyPdf({source,title,word=true}:{source:string;title:string;word?:boolean}){
  const [pages,setPages]=useState(0),[page,setPage]=useState(1),[zoom,setZoom]=useState('fit');
  const [image,setImage]=useState(''),[error,setError]=useState(''),[downloadError,setDownloadError]=useState(''),[busy,setBusy]=useState(''),[retry,setRetry]=useState(0);
  useEffect(()=>{
    const controller=new AbortController();setPages(0);setPage(1);setError('');setImage('');
    void fetch(representationUrl(source,'info'),{credentials:'include',signal:controller.signal}).then(async response=>{
      const data=await response.json();if(!response.ok)throw new Error(data.detail||'Documentul nu este disponibil.');
      if(!controller.signal.aborted)setPages(data.pages);
    }).catch(e=>{if(!controller.signal.aborted)setError(e.message)});
    return()=>controller.abort();
  },[source,retry]);
  useEffect(()=>{
    if(!pages)return;
    const controller=new AbortController();let objectUrl='';setImage('');setError('');
    void fetch(representationUrl(source,'png',page),{credentials:'include',signal:controller.signal}).then(async response=>{
      if(!response.ok){const data=await response.json().catch(()=>({}));throw new Error(data.detail||'Pagina nu poate fi încărcată.')}
      const blob=await response.blob();if(controller.signal.aborted)return;
      objectUrl=URL.createObjectURL(blob);setImage(objectUrl);
    }).catch(e=>{if(!controller.signal.aborted)setError(e.message)});
    return()=>{controller.abort();if(objectUrl)URL.revokeObjectURL(objectUrl)};
  },[source,page,pages,retry]);
  async function save(format:'pdf'|'docx'){
    setBusy(format);setDownloadError('');
    // eslint-disable-next-line no-control-regex -- Strip control characters from downloaded filenames.
    try{await download(format==='pdf'?source:representationUrl(source,'docx'),title.replace(/[<>:"/\\|?*\x00-\x1f]/g,'-').slice(0,150)+'.'+format)}
    catch(e){setDownloadError((e as Error).message)}finally{setBusy('')}
  }
  return <section className="readonly-pdf" aria-label={`Previzualizare: ${title}`}>
    <div className="readonly-pdf-toolbar"><span className="readonly-pdf-mode">Doar citire</span><div className="readonly-pdf-pages"><button type="button" className="icon-button" aria-label="Pagina anterioară" disabled={page<=1} onClick={()=>setPage(v=>v-1)}><ChevronLeft size={17}/></button><span>Pagina {pages?page:'—'} / {pages||'—'}</span><button type="button" className="icon-button" aria-label="Pagina următoare" disabled={page>=pages} onClick={()=>setPage(v=>v+1)}><ChevronRight size={17}/></button></div><label><ZoomIn size={15}/><select aria-label="Mărirea documentului" value={zoom} onChange={e=>setZoom(e.target.value)}><option value="fit">Încadrează</option><option value="100">100%</option><option value="150">150%</option></select></label><button type="button" className="text-button" disabled={!!busy} onClick={()=>void save('pdf')}><Download size={15}/>{busy==='pdf'?'Se descarcă…':'Descarcă PDF'}</button>{word&&<button type="button" className="text-button" disabled={!!busy} onClick={()=>void save('docx')}><FileText size={15}/>{busy==='docx'?'Se pregătește…':'Descarcă Word'}</button>}</div>
    {downloadError&&<ErrorMessage message={downloadError}/>}
    <div className="readonly-pdf-canvas" style={{'--pdf-width':zoom==='fit'?'100%':zoom==='100'?'850px':'1275px'} as React.CSSProperties}>{error?<ErrorMessage message={error} retry={()=>setRetry(v=>v+1)}/>:image?<img src={image} alt={`Pagina ${page} din ${pages}: ${title}`} onError={()=>setError('Pagina nu poate fi afișată.')}/>:<Loading/>}</div>
    {word&&<p className="readonly-pdf-note">Word conține textul și tabelele pentru adaptare locală. Verifică aranjarea, apoi exportă în PDF pentru reîncărcare.</p>}
  </section>;
}
