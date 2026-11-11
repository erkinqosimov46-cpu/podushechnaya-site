import type { CatalogAct, Lang, LawNode } from './types';

/** «175^1» → «175¹» (для простого текста). */
const SUP: Record<string, string> = { '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹' };
export const supText = (s: string) => s.replace(/\^(\d+)/g, (_, d: string) => [...d].map((c) => SUP[c]).join(''));

export const dmy = (iso?: string | null) => (iso ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}` : '');

const UZ_PREFIX: Record<string, string> = { ЗРУ: 'ЎРҚ', УП: 'ПФ', ПП: 'ПҚ' };

/** Номер акта так, как он пишется на выбранном языке. */
export function actNumber(a: Pick<CatalogAct, 'kind' | 'number'>, lang: Lang): string {
  if (!a.number) return '';
  const n = a.number;
  if (a.kind === 'mj') return lang === 'ru' ? `рег. № ${n}` : `${n}-сон рўйхат`;
  const m = n.match(/^(ЗРУ|УП|ПП)-(.+)$/);
  if (m) return lang === 'ru' ? n : `${UZ_PREFIX[m[1]]}-${m[2]}`;
  if (a.kind === 'pkm') return lang === 'ru' ? `ПКМ № ${n}` : `ВМҚ ${n}-сон`;
  return lang === 'ru' ? `№ ${n}` : `${n}-сон`;
}

/** Короткое имя акта для шапки и ссылок. */
export function actShort(a: CatalogAct, lang: Lang): string {
  const named: Record<string, Record<Lang, string>> = {
    bk: { ru: 'Бюджетный кодекс', uz: 'Бюджет кодекси' },
    'gk-1': { ru: 'ГК, часть 1', uz: 'ФК, 1-қисм' },
    'gk-2': { ru: 'ГК, часть 2', uz: 'ФК, 2-қисм' },
    koao: { ru: 'КоАО', uz: 'МЖтК' },
    uk: { ru: 'УК', uz: 'ЖК' },
    tk: { ru: 'Трудовой кодекс', uz: 'Меҳнат кодекси' },
    konst: { ru: 'Конституция', uz: 'Конституция' },
    'gazna-ustav': { ru: 'Устав Казначейства', uz: 'Ғазначилик низоми' },
  };
  if (named[a.slug]) return named[a.slug][lang];
  return actNumber(a, lang);
}

/** Подпись узла: «Статья 357», «357-модда», «Пункт 45», «45-банд», иначе — метка из источника. */
export function nodeLabel(n: LawNode, lang: Lang): string {
  if (n.type === 'article' && n.num) return lang === 'ru' ? `Статья ${supText(n.num)}` : `${supText(n.num)}-модда`;
  if (n.type === 'point' && n.num) return lang === 'ru' ? `Пункт ${supText(n.num)}` : `${supText(n.num)}-банд`;
  if (n.type === 'page') return n.title;
  if (n.type === 'preamble') return lang === 'ru' ? 'Преамбула' : 'Муқаддима';
  if (n.type === 'appendix') return n.num ? (lang === 'ru' ? `Приложение ${n.num}` : `${n.num}-илова`) : lang === 'ru' ? 'Приложение' : 'Илова';
  if (n.type === 'newEdition') return lang === 'ru' ? 'Закон в новой редакции' : 'Қонуннинг янги таҳрири';
  return supText((n.label || '').replace(/\.$/, ''));
}

/** Ссылка-цитата на норму: «ст. 357 ч. 1» / «357-модда 1-қисм», «п. 29 пп. а» / «29-банд «а» кичик банди». */
export function cite(n: LawNode, lang: Lang, block?: { part?: number; sub?: string; abz?: number }): string {
  const base = nodeLabel(n, lang);
  if (!block) return base;
  if (n.type === 'article' && block.part) return lang === 'ru' ? `ст. ${supText(n.num!)} ч. ${block.part}` : `${supText(n.num!)}-модда ${block.part}-қисм`;
  if (n.type === 'point' && block.sub) return lang === 'ru' ? `п. ${supText(n.num!)} пп. «${block.sub}»` : `${supText(n.num!)}-банд «${block.sub}» кичик банди`;
  return base;
}

/** Для поиска: «ст. 122», «122-модда», «45-банд», «п. 45», «175¹», «175-1». */
export function parseNumberQuery(q: string): { type: 'article' | 'point' | 'any'; num: string } | null {
  const s = q
    .trim()
    .toLowerCase()
    .replace(/[¹²³⁴⁵⁶⁷⁸⁹⁰]+/g, (m) => '^' + [...m].map((c) => '⁰¹²³⁴⁵⁶⁷⁸⁹'.indexOf(c)).join(''));
  let m;
  const num = '(\\d{1,4}(?:\\^\\d{1,2})?)';
  if ((m = s.match(new RegExp(`^(?:ст\\.?|статья|статьи|модда)\\s*${num}$`)))) return { type: 'article', num: m[1] };
  if ((m = s.match(new RegExp(`^${num}\\s*-?\\s*(?:модда|моддаси|ст\\.?|статья)$`)))) return { type: 'article', num: m[1] };
  if ((m = s.match(new RegExp(`^(?:п\\.?|пункт|банд)\\s*${num}$`)))) return { type: 'point', num: m[1] };
  if ((m = s.match(new RegExp(`^${num}\\s*-?\\s*(?:банд|банди|пункт|п\\.?)$`)))) return { type: 'point', num: m[1] };
  if ((m = s.match(/^(\d{1,4})\s*[-_]\s*(\d{1,2})$/))) return { type: 'any', num: `${m[1]}^${m[2]}` };
  if ((m = s.match(new RegExp(`^${num}$`)))) return { type: 'any', num: m[1] };
  return null;
}

/** Плоский текст абзаца для поиска. */
export const plainHtml = (h: string) =>
  h
    .replace(/<sup>\s*([^<]*?)\s*<\/sup>/g, '^$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();

/** Нормализация для поиска (регистр, ё). */
export const norm = (s: string) => s.toLowerCase().replace(/ё/g, 'е');

export function shuffle<T>(arr: T[], seed = Math.random()): T[] {
  const a = [...arr];
  let x = Math.floor(seed * 2 ** 31) || 1;
  for (let i = a.length - 1; i > 0; i--) {
    x = (x * 48271) % 2147483647;
    const j = x % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
