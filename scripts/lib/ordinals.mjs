// Порядковые числительные RU / UZ → число (1–99). Нужны, чтобы сверять нумерацию парсера
// с примечаниями lex.uz вида «абзац тридцать шестой статьи 3» / «1-банднинг иккинчи хатбошиси».

const RU_UNITS = [
  ['перв', 1], ['втор', 2], ['трет', 3], ['четверт', 4], ['пят', 5],
  ['шест', 6], ['седьм', 7], ['восьм', 8], ['девят', 9],
];
const RU_TEENS = [
  ['одиннадцат', 11], ['двенадцат', 12], ['тринадцат', 13], ['четырнадцат', 14], ['пятнадцат', 15],
  ['шестнадцат', 16], ['семнадцат', 17], ['восемнадцат', 18], ['девятнадцат', 19], ['десят', 10],
];
const RU_TENS_ORD = [
  ['двадцат', 20], ['тридцат', 30], ['сороков', 40], ['пятидесят', 50], ['шестидесят', 60],
  ['семидесят', 70], ['восьмидесят', 80], ['девяност', 90],
];
const RU_TENS_CARD = { двадцать: 20, тридцать: 30, сорок: 40, пятьдесят: 50, шестьдесят: 60, семьдесят: 70, восемьдесят: 80, девяносто: 90 };

function ruWord(w) {
  for (const list of [RU_TEENS, RU_TENS_ORD, RU_UNITS]) {
    for (const [stem, n] of list) if (w.startsWith(stem)) return n;
  }
  return null;
}

/** «тридцать шестой» → 36, «первая» → 1. */
export function ruOrdinal(phrase) {
  const words = phrase.toLowerCase().replace(/ё/g, 'е').split(/\s+/).filter(Boolean);
  if (words.length === 2 && RU_TENS_CARD[words[0]] != null) {
    const u = ruWord(words[1]);
    return u != null && u < 10 ? RU_TENS_CARD[words[0]] + u : null;
  }
  return words.length === 1 ? ruWord(words[0]) : null;
}

const UZ_UNITS = { бир: 1, икки: 2, уч: 3, тўрт: 4, беш: 5, олти: 6, етти: 7, саккиз: 8, тўққиз: 9 };
const UZ_TENS = { ўн: 10, йигирма: 20, ўттиз: 30, қирқ: 40, эллик: 50, олтмиш: 60, етмиш: 70, саксон: 80, тўқсон: 90 };

function uzOrdWord(w) {
  const base = w.replace(/(?:и)?нчи.*$/, '');
  if (UZ_UNITS[base] != null) return UZ_UNITS[base];
  if (UZ_TENS[base] != null) return UZ_TENS[base];
  return null;
}

/** «ўн учинчи» → 13, «иккинчи» → 2. */
export function uzOrdinal(phrase) {
  const words = phrase.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 2 && UZ_TENS[words[0]] != null) {
    const u = uzOrdWord(words[1]);
    return u != null && u < 10 ? UZ_TENS[words[0]] + u : null;
  }
  return words.length === 1 ? uzOrdWord(words[0]) : null;
}

const ROMAN = { I: 1, V: 5, X: 10, L: 50, C: 100 };
/** Римские цифры; кириллические Х и І приводятся к латинским. */
export function roman(s) {
  const t = s.replace(/Х/g, 'X').replace(/І/g, 'I').replace(/С/g, 'C').toUpperCase();
  if (!/^[IVXLC]+$/.test(t)) return null;
  let n = 0;
  for (let i = 0; i < t.length; i++) {
    const v = ROMAN[t[i]];
    const next = ROMAN[t[i + 1]] ?? 0;
    n += v < next ? -v : v;
  }
  return n;
}

const RU_CARD_ORD = {
  первый: 1, второй: 2, третий: 3, четвертый: 4, четвёртый: 4, пятый: 5, шестой: 6, седьмой: 7, восьмой: 8, девятый: 9, десятый: 10,
};
const UZ_CARD_ORD = { биринчи: 1, иккинчи: 2, учинчи: 3, тўртинчи: 4, бешинчи: 5, олтинчи: 6, еттинчи: 7, саккизинчи: 8, тўққизинчи: 9, ўнинчи: 10 };
/** «ПЕРВЫЙ» / «БИРИНЧИ» в заголовках разделов. */
export function headingOrdinal(word) {
  const w = word.toLowerCase();
  return RU_CARD_ORD[w] ?? UZ_CARD_ORD[w] ?? null;
}
