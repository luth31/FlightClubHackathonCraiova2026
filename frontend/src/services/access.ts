import type {Page, User} from '@/types';

export function pagePermissions(user?: User | null): Record<Page, boolean> {
  const roles = user?.roles || [];
  const director = roles.includes('director');
  const finance = roles.includes('finance');
  const head = roles.includes('department_head');
  const technician = roles.includes('technician') && !head && !director;
  const fallback = {home:true, operations:true, documents:true, approvals:true, people:true,
    contracts:!technician && (director || finance || (head && !roles.includes('hr'))),
    suppliers:director || finance || (head && user?.department === 'Achiziții'),
    sharing:director || (roles.includes('reviewer') && user?.department === 'Conformitate'),
    audit:!technician && (director || head || roles.includes('hr'))};
  if (!user?.permissions?.pages) return fallback;
  return Object.fromEntries(Object.keys(fallback).map(page =>
    [page, user.permissions?.pages[page as Page] === true])) as Record<Page, boolean>;
}

export function personalTasks(user?: User | null) {
  return !!user && user.roles.some(role => ['technician','employee'].includes(role)) &&
    !user.roles.some(role => ['director','department_head','reviewer','finance','hr'].includes(role));
}
