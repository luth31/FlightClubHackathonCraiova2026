import {useEffect, useLayoutEffect, useState} from 'react';
import type {Page} from '@/types';

export const pageLabels: Record<Page, string> = {
  home: 'Acasă', documents: 'Documente', contracts: 'Documente', suppliers: 'Furnizori',
  approvals: 'Aprobări', people: 'Echipă', sharing: 'Colaborare', audit: 'Jurnal de activitate',
  operations: 'Operațiuni la sol', reports: 'Rapoarte', equipment: 'Echipamente', assistant: 'Întreabă FlyLeaf',
};
const currentPage = (page: Page): Page => page === 'contracts' || page === 'approvals' ? 'documents' : page;
export type DocumentView = 'list' | 'contracts' | 'approvals' | 'renewals' | 'flow' | 'procurement';
type Route = {page: Page; doc?: string; documentView?: DocumentView; query?: string; filter?: string; renewalId?: string; equipmentId?: string; assistantDocumentId?: string};
type NavigationState = {userId?: string; origin: Page; originHash?: string; documentDepth: number; scroll?: [number, number]};
const isPage = (value: string): value is Page => Object.hasOwn(pageLabels, value);

export function parseRoute(hash: string): Route {
  const [path, query = ''] = hash.replace(/^#/, '').split('?');
  const params = new URLSearchParams(query);
  if (path === 'contracts' || path === 'approvals' || path.startsWith('documents/') || path === 'documents' && query) {
    const view = path === 'contracts' || path === 'approvals' ? path : path.split('/')[1] || params.get('view');
    return {page: 'documents', documentView: ['contracts','approvals','renewals','flow','procurement'].includes(view || '') ? view as DocumentView : 'list', query: params.get('q') || '', filter: params.get('filter') || '', renewalId: params.get('renewal') || undefined};
  }
  if (path.startsWith('equipment/')) {
    try { return {page:'equipment', equipmentId:decodeURIComponent(path.slice(10))}; }
    catch { return {page:'equipment'}; }
  }
  if (path === 'assistant' && params.has('document')) return {page:'assistant', assistantDocumentId:params.get('document') || undefined};
  if (path === 'operations' && new URLSearchParams(query).get('view') === 'station') return {page: 'people'};
  if (path.startsWith('reports/')) return {page: 'reports'};
  if (path === 'document') return {page: 'documents'};
  if (!path.startsWith('document/')) return {page: isPage(path) ? currentPage(path) : 'home'};
  const origin = new URLSearchParams(query).get('from') || 'documents';
  try {
    const doc = decodeURIComponent(path.slice('document/'.length));
    return doc ? {page: isPage(origin) ? currentPage(origin) : 'documents', doc} : {page: 'documents'};
  } catch {
    return {page: 'documents'};
  }
}

export const documentHref = (id: string, origin: Page) =>
  `#document/${encodeURIComponent(id)}?from=${currentPage(origin)}`;

// Only our own document chain can use history.go. Copied/legacy links stay inside the app.
export function useNavigation(userId: string | undefined, allowedPages: Record<Page,boolean>) {
  const [route, setRoute] = useState(() => parseRoute(window.location.hash));
  const page = allowedPages[route.page] ? route.page : 'documents';
  const readState = (): NavigationState | undefined => window.history.state?.flyleafNavigation;

  // Restore only after React has revealed the list; scrolling a hidden view clamps to zero.
  useLayoutEffect(() => {
    const state: NavigationState | undefined = window.history.state?.flyleafNavigation;
    const scroll = !route.doc && state?.userId === userId && state?.origin === page ? state.scroll : undefined;
    window.scrollTo(...(scroll || [0, 0]));
  }, [route, page, userId]);

  useEffect(() => {
    const sync = () => setRoute(parseRoute(window.location.hash));
    const previousRestoration = window.history.scrollRestoration;
    window.history.scrollRestoration = 'manual';
    window.addEventListener('popstate', sync);
    window.addEventListener('hashchange', sync);
    return () => {
      window.history.scrollRestoration = previousRestoration;
      window.removeEventListener('popstate', sync);
      window.removeEventListener('hashchange', sync);
    };
  }, [userId]);

  function write(hash: string, state: NavigationState, replace = false) {
    const oldURL = window.location.href;
    const method = replace ? 'replaceState' : 'pushState';
    window.history[method]({...window.history.state, flyleafNavigation: state}, '', hash);
    setRoute(parseRoute(hash));
    // pushState does not notify nested views that read report/operations hashes.
    if (oldURL !== window.location.href)
      window.dispatchEvent(new window.HashChangeEvent('hashchange', {oldURL, newURL: window.location.href}));
  }

  function navigate(destination: Page, suffix = '') {
    const alias = destination === 'contracts' || destination === 'approvals' ? '/' + destination : '';
    destination = currentPage(destination);
    const allowed = allowedPages[destination] ? destination : 'documents';
    const hash = `#${allowed}${alias || suffix}`;
    write(hash, {userId, origin: allowed, documentDepth: 0}, window.location.hash === hash);
  }

  function openDocument(id: string) {
    if (!id || route.doc === id) return;
    let depth = 0;
    let originHash = readState()?.originHash;
    if (!route.doc) {
      // Canonicalize restricted/unknown list hashes before creating a return entry.
      originHash = parseRoute(window.location.hash).page === page ? window.location.hash : `#${page}`;
      window.history.replaceState({...window.history.state, flyleafNavigation: {
        userId, origin: page, documentDepth: 0, scroll: [window.scrollX, window.scrollY],
      }}, '', originHash);
      depth = 1;
    } else {
      const previous = readState();
      if (previous && previous.userId === userId && previous.origin === page && previous.documentDepth > 0)
        depth = previous.documentDepth + 1;
    }
    write(documentHref(id, page), {userId, origin: page, originHash, documentDepth: depth});
  }

  function returnToOrigin() {
    const state = readState();
    if (route.doc && state && state.userId === userId && state.origin === page && state.documentDepth > 0) {
      window.history.go(-state.documentDepth);
    } else {
      write(`#${page}`, {userId, origin: page, documentDepth: 0}, true);
    }
  }

  const state = readState();
  const context = route.doc && state && state.userId === userId && state.originHash ? parseRoute(state.originHash) : route;
  const workspaceHash = route.doc && state?.userId === userId && state?.originHash ? state.originHash : window.location.hash;
  return {...context, workspaceHash, page, doc: route.doc, navigate, openDocument, returnToOrigin};
}
