export type Word = { id: string; text: string; rect: number[] };
export type PdfPage = { number: number; width: number; height: number; words: Word[]; method?: string };
export type Match = { page: number; word_ids: string[] };
export type Basis = { id: string; label: string; url: string; guidance: string };
export type Layout = {
  source_version: number; source_sha256: string; pages: PdfPage[];
  ai_available: boolean; legal_bases: Basis[];
};
export type Suggestion = {
  word_ids: string[]; category: string; reason: string;
  legal_basis_ids: string[]; caution: string;
};
export type Analysis = { suggestions: Suggestion[]; summary: string; model: string };
export type Preview = { preview_id: string; file_url: string };
