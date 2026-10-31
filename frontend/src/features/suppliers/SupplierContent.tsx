import type { ReactNode } from 'react';
import { ErrorMessage, Loading } from '@/components/ui';

export function SupplierContent({error, loading, retry, children}: {
  error: string; loading: boolean; retry?: () => void; children: ReactNode;
}) {
  return <>{error && <ErrorMessage message={error} retry={retry}/>}
    {loading ? !error && <Loading/> : children}
  </>;
}
