import re
import unicodedata
from sqlalchemy.orm import Session
from app.database import get_db
from app.core.security import current_user
from app.documents.service import visible_documents,serialize
from app.config import settings

def norm(text):
    return ''.join(c for c in unicodedata.normalize('NFD',text.lower()) if unicodedata.category(c)!='Mn')

def source(d):
    return {'id':d['id'],'title':d['title'],'number':d['number'],'page':None,
            'source_type':'validated_metadata','excerpt':d['summary'][:300] or d['title'],'file_url':d['file_url']}

def ask(question,db,user):
    docs=[serialize(d,user=user) for d in visible_documents(db,user) if d.validated]
    q=norm(question)
    contracts=[d for d in docs if d['category']=='Contract']
    sources=[]
    if any(w in q for w in ('aprobar','avizar','aprobare','avizare')):
        result=[d for d in docs if d['status']=='in_review']
        answer=f'{len(result)} documente cu metadate validate așteaptă avizarea în registrul la care ai acces.'
        if result: answer+='\n\n'+'\n'.join(f'• {d["title"]} — {d["department"]}.' for d in result[:10])
        sources=result[:10]
    elif any(w in q for w in ('expir','reinno','termen')):
        period=re.search(r'\b(\d{1,3})\b',q); days=min(int(period.group(1)),365) if period else 60
        result=[d for d in contracts if d['days_remaining'] is not None and 0<=d['days_remaining']<=days and d['status']!='archived' and ('active' not in q or d['contract_status']=='active')]
        result.sort(key=lambda d:d['days_remaining'])
        answer=f'{len(result)} contracte din registrul validat expiră în următoarele {days} de zile, raportat la {settings.reference_date.strftime("%d.%m.%Y")}.'
        pending=sum(d['contract_status']=='pending' for d in result)
        if pending: answer+=f' Dintre acestea, {pending} sunt încă în avizare sau pregătire; termenele necesită urmărire.'
        if result: answer+='\n\n'+'\n'.join(f'• {d["title"]} — {d["expires_at"]} ({d["days_remaining"]} zile).' for d in result[:10])
        sources=result[:10]
    elif any(w in q for w in ('valoare','total','suma','buget')):
        result=[d for d in contracts if d['value'] is not None and d['contract_status']=='active']
        totals={}
        for d in result: totals[d['currency']]=totals.get(d['currency'],0)+d['value']
        amount='; '.join(f'{v:,.2f} {k}'.replace(',',' ') for k,v in totals.items()) or '0 RON'
        answer=f'Valoarea cumulată a celor {len(result)} contracte active cu metadate validate este {amount}. Monedele sunt raportate separat; aceasta este valoarea contractuală, nu suma plătită.'
        sources=result[:10]
    elif any(w in q for w in ('cate contract','contracte active','numar de contract')):
        result=[d for d in contracts if d['contract_status']=='active' and d['status']!='archived']
        answer=f'Ai acces la {len(result)} contracte active cu metadate validate, la data de referință {settings.reference_date.strftime("%d.%m.%Y")}. Sunt excluse ciornele nevalidate și documentele fără permisiune de acces.'
        sources=result[:10]
    else:
        ignored={'care','sunt','pentru','despre','arata','arata-mi','documente','unde','este','cine','ce','si','din','cu','la','de','the','what','find','show'}
        terms=[w for w in re.findall(r'\w+',q) if len(w)>2 and w not in ignored]
        ranked=[]
        for d in docs:
            text=norm(' '.join([d['title'],d['supplier'] or '',d['summary'],d['category'],d['department']]))
            score=sum(t in text for t in terms)
            if score: ranked.append((score,d))
        result=[d for _,d in sorted(ranked,key=lambda pair:pair[0],reverse=True)[:5]]
        if result:
            answer='Am găsit aceste documente validate în registrul la care ai acces:\n\n'+'\n'.join(f'• {d["title"]} ({d["number"]}) — {d["summary"][:220]}' for d in result)
            sources=result
        else: answer='Nu am găsit suficiente dovezi în documentele validate la care ai acces. Încearcă numele unui furnizor, un echipament sau o întrebare despre contractele active și termene. Nu voi inventa informații.'
    return {'answer':answer,'sources':[source(d) for d in sources],'mode':'validated-records','reference_date':str(settings.reference_date),'notice':'Asistent determinist de registru: calcule din metadate validate și căutare după termeni. Nu folosește un model generativ.'}
