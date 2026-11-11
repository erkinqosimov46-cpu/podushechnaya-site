export type Lang = 'ru' | 'uz';

export type Block = {
  lexId?: string;
  k: 'p' | 'table' | 'center' | 'right' | 'footnote' | 'lexnote' | string;
  html: string;
  part?: number;
  item?: string;
  sub?: string;
  abz?: number;
  changes?: string[];
  prev?: string;
  unofficial?: boolean;
  lexNotes?: string[];
};

export type NodeType =
  | 'codePart' | 'section' | 'subsection' | 'chapter' | 'paragraph' | 'heading'
  | 'appendix' | 'newEdition' | 'preamble' | 'article' | 'point' | 'page';

export type LawNode = {
  id: string;
  type: NodeType;
  num: string | null;
  label: string;
  title: string;
  lexId?: string;
  children?: LawNode[];
  blocks?: Block[];
  repealed?: string;
  scope?: 'core' | 'extra';
  sign?: string[];
};

export type ActDoc = {
  slug: string;
  lang: Lang;
  source: {
    site: string;
    url?: string;
    urls?: string[];
    lexId?: number;
    edition?: string | null;
    futureEditions?: string[];
    status?: string | null;
    fetchedAt?: string;
    updated?: string | null;
  };
  script: 'cyrl' | 'cyrl-lexuz' | 'translit' | null;
  coverage: 'full' | 'partial' | 'none';
  mode: 'articles' | 'points' | 'pages';
  scope?: 'full' | 'profile' | 'pending';
  head: Block[];
  tree: LawNode[];
};

export type CatalogAct = {
  slug: string;
  group: string;
  kind: 'konst' | 'kodeks' | 'zru' | 'up' | 'pp' | 'pkm' | 'mj' | 'other';
  number: string;
  date: string;
  title: Record<Lang, string>;
  source: string;
  lex: Record<Lang, number> | null;
  pages: { id: string; ru: string; uz: string }[] | null;
  edition: Record<Lang, string | null>;
  futureEditions: string[];
  status: string | null;
  fetchedAt: string | null;
  coverageRu: 'full' | 'partial' | 'none';
  uzScript: ActDoc['script'];
  scope: 'full' | 'profile' | 'pending';
  note: { ru?: string; uz?: string } | null;
  leaves: number;
  tests: Partial<Record<Lang, number>>;
};

export type Catalog = {
  checkedAt: string;
  groups: { id: string; title: Record<Lang, string>; late: boolean }[];
  acts: CatalogAct[];
};

/** [акт, id узла, тип, номер, заголовок, начало текста] */
export type IndexRow = [string, string, NodeType, string, string, string];

export type Question = {
  id: string;
  /** Узел, к которому относится вопрос (статья / пункт), — для ссылки «Норма». */
  node: string;
  /** Глава / раздел — для выбора «тест по главе». */
  chapter?: string;
  type: 'single' | 'multi' | 'tf' | 'where' | 'case';
  q: string;
  options: string[];
  correct: number[];
  explain: string;
  ref: { label: string; node?: string };
};

export type TestBank = { act: string; lang: Lang; questions: Question[] };

export type Study = {
  /** Пояснения к главам и нормам; ключ — id узла. */
  nodes: Record<string, { meaning?: string; example?: string; mistakes?: string; related?: { act: string; node: string; label: string }[] }>;
};

export type Glossary = {
  terms: { ru: string; uz: string; defRu: string; defUz: string; ref: { act: string; node: string; abz: number } }[];
  abbreviations: { lang: Lang; abbr: string; context: string; ref: { act: string; node: string } }[];
  actTypes: { ru: string; uz: string; fullRu: string; fullUz: string }[];
};

export type Plan = {
  note: Record<Lang, string>;
  weeks: { title: Record<Lang, string>; items: { act: string; node?: string }[] }[];
};
