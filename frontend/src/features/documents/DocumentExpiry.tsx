import {date} from '@/utils/format';
import {t,useLanguage} from '@/i18n';

export function expiryPresentation({expiresAt, daysRemaining, validated, status}: {
  expiresAt?: string | null; daysRemaining?: number | null; validated: boolean; status: string;
}) {
  if (status === 'archived') return {tone:'neutral', label:t('Arhivat')};
  if (!expiresAt) return {tone:'neutral', label:t('Fără termen înregistrat')};
  if (!validated || daysRemaining == null || !Number.isFinite(daysRemaining))
    return {tone:'neutral', label:t('Dată de verificat')};
  if (daysRemaining < 0) return {tone:'expired', label:daysRemaining===-1?t('Expirat · 1 zi'):t('Expirat · {days} zile',{days:-daysRemaining})};
  if (daysRemaining === 0) return {tone:'urgent', label:t('Expiră astăzi')};
  const remaining = daysRemaining === 1 ? t('Expiră mâine') : t('Zile rămase: {days}',{days:daysRemaining});
  return {tone:daysRemaining <= 30 ? 'urgent' : daysRemaining <= 60 ? 'soon' : 'valid', label:remaining};
}

export function DocumentExpiry(props: Parameters<typeof expiryPresentation>[0] & {muted?: boolean}) {
  useLanguage();
  const {tone, label} = expiryPresentation(props);
  return <span className={`document-expiry document-expiry--${props.muted ? 'neutral' : tone}`}>
    {props.expiresAt && <time dateTime={props.expiresAt}>{date(props.expiresAt)}</time>}
    <span>{label}</span>
  </span>;
}
