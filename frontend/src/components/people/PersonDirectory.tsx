import {createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode} from 'react';
import {api} from '@/services/api-client';
import type {Person, PersonProfile} from '@/features/people/types';
export type {Person} from '@/features/people/types';

interface ProfileDirectory {
  items: Person[];
  reference_date: string;
  current_user_id: string;
}

interface AccountActions {
  userId: string;
  signOut: () => void | Promise<void>;
  signingOut: boolean;
  signOutError: string;
}

const DirectoryContext = createContext<{
  data?: ProfileDirectory;
  error: boolean;
  refresh: () => void;
  updateProfile: (id: string, profile: PersonProfile) => void;
  now: number;
  account?: AccountActions;
}>({error: false, refresh: () => {}, updateProfile: () => {}, now: Date.now()});

// Keep one directory per signed-in workspace, shared by all person avatars.
export function PersonDirectoryProvider({revision, children, account}: {revision: number; children: ReactNode; account?: AccountActions}) {
  const [data, setData] = useState<ProfileDirectory>();
  const [error, setError] = useState(false);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [now, setNow] = useState(Date.now);
  const requestVersion = useRef(0);
  const refresh = useCallback(() => setRefreshVersion(value => value + 1), []);
  const updateProfile = useCallback((id: string, profile: PersonProfile) => {
    requestVersion.current += 1;
    setNow(Date.now());
    setData(current => current && {...current, items: current.items.map(person => person.id === id ? {...person, profile} : person)});
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const version = ++requestVersion.current;
    setError(false);
    api<ProfileDirectory>('/people', {signal: controller.signal})
      .then(result => {
        if (!controller.signal.aborted && version === requestVersion.current) {
          setNow(Date.now());
          setData({items: result.items, reference_date: result.reference_date, current_user_id: result.current_user_id});
        }
      })
      .catch(() => {
        if (!controller.signal.aborted && version === requestVersion.current) setError(true);
      });
    return () => controller.abort();
  }, [revision, refreshVersion]);

  useEffect(() => {
    const sync = () => {if (!document.hidden) {setNow(Date.now()); refresh();}};
    const timer = setInterval(sync, 60000);
    window.addEventListener('focus', sync);
    return () => {clearInterval(timer); window.removeEventListener('focus', sync);};
  }, [refresh]);

  useEffect(() => {
    const expiries = data?.items.flatMap(person => [person.profile?.presence_expires_at, person.profile?.message_expires_at])
      .filter((value): value is string => !!value).map(Date.parse).filter(value => value > now) || [];
    if (!expiries.length) return;
    const timer = setTimeout(() => setNow(Date.now()), Math.min(2147483647, Math.max(0, Math.min(...expiries) - Date.now()) + 50));
    return () => clearTimeout(timer);
  }, [data, now]);

  return <DirectoryContext.Provider value={{data, error, refresh, updateProfile, now, account}}>{children}</DirectoryContext.Provider>;
}

export function usePersonDirectory() {
  return useContext(DirectoryContext);
}
