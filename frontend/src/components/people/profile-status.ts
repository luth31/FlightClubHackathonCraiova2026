import type {Person, PersonProfile} from '@/features/people/types';

export const presenceLabels: Record<string, string> = {
  automatic: 'Automat', available: 'Disponibil', busy: 'Ocupat', do_not_disturb: 'Nu deranjați',
  be_right_back: 'Revin imediat', away: 'Absent', offline: 'Afișează offline',
  on_leave: 'În concediu', inactive: 'Cont inactiv', unknown: 'Status necunoscut',
};
export const emptyProfile: PersonProfile = {
  presence: 'automatic', presence_expires_at: null, status_message: '', message_expires_at: null, photo_url: null,
};

export function liveProfile(profile: PersonProfile | undefined, now: number): PersonProfile {
  const current = profile || emptyProfile;
  return {
    ...current,
    ...(current.presence_expires_at && Date.parse(current.presence_expires_at) <= now ? {presence: 'automatic', presence_expires_at: null} : {}),
    ...(current.message_expires_at && Date.parse(current.message_expires_at) <= now ? {status_message: '', message_expires_at: null} : {}),
  };
}

export function displayedPresence(person: Person | undefined, now: number) {
  if (!person) return 'unknown';
  if (!person.active) return 'inactive';
  const profile = liveProfile(person.profile, now);
  if (profile.presence !== 'automatic') return profile.presence;
  return person.availability === 'away' ? 'on_leave' : 'available';
}
