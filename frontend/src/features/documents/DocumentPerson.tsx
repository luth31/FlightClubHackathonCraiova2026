import {PersonAvatar} from '@/components/people/PersonAvatar';
import {PersonReference} from '@/components/people/PersonReference';

export function DocumentPerson({name, userId}: {name: string; userId?: string | null}) {
  if (userId === 'system' || userId === 'seed') return <span>{name}</span>;
  return <span className="document-person">
    <PersonAvatar userId={userId || undefined} name={name} className="avatar document-person-avatar"/>
    <span className="document-person-name"><PersonReference name={name} userId={userId}/></span>
  </span>;
}
