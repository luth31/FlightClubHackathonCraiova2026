import {date} from '@/utils/format';

export function expiryPresentation({expiresAt, daysRemaining, validated, status}: {
  expiresAt?: string | null; daysRemaining?: number | null; validated: boolean; status: string;
}) {
  if (status === 'archived') return {tone:'neutral', label:'Arhivat'};
  if (!expiresAt) return {tone:'neutral', label:'Fără termen înregistrat'};
  if (!validated || daysRemaining == null || !Number.isFinite(daysRemaining))
    return {tone:'neutral', label:'Dată de verificat'};
  if (daysRemaining < 0) return {tone:'expired', label:`Expirat · ${-daysRemaining === 1 ? '1 zi' : `${-daysRemaining} zile`}`};
  if (daysRemaining === 0) return {tone:'urgent', label:'Expiră astăzi'};
  const remaining = daysRemaining === 1 ? 'Expiră mâine' : `Zile rămase: ${daysRemaining}`;
  return {tone:daysRemaining <= 30 ? 'urgent' : daysRemaining <= 60 ? 'soon' : 'valid', label:remaining};
}

export function DocumentExpiry(props: Parameters<typeof expiryPresentation>[0] & {muted?: boolean}) {
  const {tone, label} = expiryPresentation(props);
  return <span className={`document-expiry document-expiry--${props.muted ? 'neutral' : tone}`}>
    {props.expiresAt && <time dateTime={props.expiresAt}>{date(props.expiresAt)}</time>}
    <span>{label}</span>
  </span>;
}
