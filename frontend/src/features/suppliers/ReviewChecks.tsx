import type { Review } from './types';
const names: Record<string,string> = {iban:'IBAN',sender:'Expeditor',source:'Contract',amount:'Valoare',service_period:'Perioada prestației'};
const results: Record<string,string> = {passed:'Efectuat · fără diferențe',failed:'Efectuat · neconcordanță',not_checked:'Neefectuat',not_applicable:'Neaplicabil'};
export function ReviewChecks({review}:{review:Review}) {
  return <section className="review-controls" aria-label="Controale efectuate">
    <h3>Ce s-a verificat</h3>
    {review.checks ? review.checks.map(c=><div className="review-control" key={c.code}><strong>{names[c.code]||c.code}</strong><span>{results[c.result]||c.result}</span><small>{c.message}</small></div>) : <p>Controale neînregistrate pentru acest caz istoric.</p>}
    {review.freshness.state!=='current'&&<div className="note-box"><p>{review.freshness.reasons.join(' ')}</p></div>}
  </section>;
}
