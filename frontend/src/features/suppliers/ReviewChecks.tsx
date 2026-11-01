import {t,useLanguage} from '@/i18n';
import type { Review } from './types';
const names: Record<string,string> = {iban:'IBAN',sender:'Expeditor',source:'Contract',amount:'Valoare',service_period:'Perioada prestației'};
const results: Record<string,string> = {passed:'Efectuat · fără diferențe',failed:'Efectuat · neconcordanță',not_checked:'Neefectuat',not_applicable:'Neaplicabil'};
export function ReviewChecks({review}:{review:Review}) {
  useLanguage();
  return <section className="review-controls" aria-label={t("Controale efectuate")}>
    <h3>{t("Ce s-a verificat")}</h3>
    {review.checks ? review.checks.map(c=><div className="review-control" key={c.code}><strong>{names[c.code]||c.code}</strong><span>{results[c.result]||c.result}</span><small>{c.message}</small></div>) : <p>{t("Controale neînregistrate pentru acest caz istoric.")}</p>}
    {review.freshness.state!=='current'&&<div className="note-box"><p>{review.freshness.reasons.join(' ')}</p></div>}
  </section>;
}
