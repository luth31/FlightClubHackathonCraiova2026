import type {ReactNode} from 'react';
import {PersonAvatar} from './PersonAvatar';
import {usePersonDirectory, type Person} from './PersonDirectory';

/** Account references resolve by ID; old name-only records require one exact match.
 * Role labels, organizations and ambiguous names remain ordinary text.
 * Embedded references preserve the containing button/link and its click action.
 */
export function PersonReference({name,userId,person,externalAirport,children,embedded=false}: {
  name?: string | null;
  userId?: string | null;
  person?: Person;
  externalAirport?: string;
  children?: ReactNode;
  embedded?: boolean;
}) {
  const directory = usePersonDirectory();
  const label = name || person?.name || '';
  const matches = !externalAirport && !userId && !person
    ? directory.data?.items.filter(item => item.name === label) : undefined;
  if (!label) return <>—</>;
  if (!userId && !person && matches?.length !== 1) return <>{children || label}</>;
  return <PersonAvatar name={label} userId={userId || undefined} person={person}
    externalAirport={externalAirport} embedded={embedded} className="person-name">
    {children || label}
  </PersonAvatar>;
}
