import {useEffect, useState} from 'react';
import {Search, Building2} from 'lucide-react';
import {api} from '@/services/api-client';
import {Empty, ErrorMessage, Loading} from '@/components/ui';
import {SupplierDetail} from './SupplierDetail';
import type {Supplier} from './types';
import './suppliers.css';

export function SupplierCatalogPage({revision,onOpen}:{revision:number;onOpen:(id:string)=>void}) {
  const [items,setItems]=useState<Supplier[]>(), [error,setError]=useState(''),
    [query,setQuery]=useState(''), [selected,setSelected]=useState<string>(), [refresh,setRefresh]=useState(0);
  useEffect(()=>{
    let active=true;
    api<{items:Supplier[]}>('/suppliers').then(result=>{if(active){setItems(result.items);setError('')}})
      .catch(reason=>{if(active)setError(reason.message)});
    return()=>{active=false};
  },[revision,refresh]);
  const filtered=items?.filter(item=>`${item.name} ${item.tax_id||''} ${item.verified_contact}`.toLocaleLowerCase('ro').includes(query.toLocaleLowerCase('ro')));
  return <>
    <div className="page-heading"><div><div className="eyebrow">ACHIZIȚII ȘI FINANCIAR</div><h1>Furnizori</h1><p>Fișele comerciale și contractele din departamentul tău.</p></div></div>
    {error&&<ErrorMessage message={error} retry={()=>setRefresh(value=>value+1)}/>}
    {!items&&!error&&<Loading/>}
    {items&&<div className="panel"><div className="filters"><label className="search-input"><Search size={17}/><input aria-label="Caută un furnizor" placeholder="Caută un furnizor…" value={query} onChange={event=>setQuery(event.target.value)}/></label><span className="result-count">{filtered?.length} furnizori</span></div>
      <div className="supplier-reviews-list">{filtered?.map(item=><button className="supplier-review-row" key={item.id} onClick={()=>setSelected(item.id)}><Building2 size={20}/><span className="review-row-copy"><strong>{item.name}</strong><small>CUI {item.tax_id||'neînregistrat'} · {item.verified_contact}</small></span></button>)}</div>
      {!filtered?.length&&<Empty title="Niciun furnizor găsit"/>}
    </div>}
    {selected&&<SupplierDetail supplierId={selected} onClose={()=>setSelected(undefined)} onOpen={onOpen} onReview={()=>{}} onRegistration={()=>{}}/>}
  </>;
}
