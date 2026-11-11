// Транслитерация узбекского текста: латиница → кириллица.
// Применяется только к документам, у которых в источнике нет кириллической версии
// (сейчас — устав Комитета с gov.uz). Результат помечается как транслитерация.

const APOS = "[’'ʻʼ‘`]";
const PAIRS = [
  [new RegExp(`O${APOS}`, 'g'), 'Ў'], [new RegExp(`o${APOS}`, 'g'), 'ў'],
  [new RegExp(`G${APOS}`, 'g'), 'Ғ'], [new RegExp(`g${APOS}`, 'g'), 'ғ'],
  [/Sh/g, 'Ш'], [/SH/g, 'Ш'], [/sh/g, 'ш'],
  [/Ch/g, 'Ч'], [/CH/g, 'Ч'], [/ch/g, 'ч'],
  [/Yo/g, 'Ё'], [/YO/g, 'Ё'], [/yo/g, 'ё'],
  [/Yu/g, 'Ю'], [/YU/g, 'Ю'], [/yu/g, 'ю'],
  [/Ya/g, 'Я'], [/YA/g, 'Я'], [/ya/g, 'я'],
  [/Ye/g, 'Е'], [/YE/g, 'Е'], [/ye/g, 'е'],
  [/Ts/g, 'Ц'], [/TS/g, 'Ц'], [/ts/g, 'ц'],
];
const SINGLE = {
  A: 'А', a: 'а', B: 'Б', b: 'б', D: 'Д', d: 'д', F: 'Ф', f: 'ф', G: 'Г', g: 'г', H: 'Ҳ', h: 'ҳ',
  I: 'И', i: 'и', J: 'Ж', j: 'ж', K: 'К', k: 'к', L: 'Л', l: 'л', M: 'М', m: 'м', N: 'Н', n: 'н',
  O: 'О', o: 'о', P: 'П', p: 'п', Q: 'Қ', q: 'қ', R: 'Р', r: 'р', S: 'С', s: 'с', T: 'Т', t: 'т',
  U: 'У', u: 'у', V: 'В', v: 'в', X: 'Х', x: 'х', Y: 'Й', y: 'й', Z: 'З', z: 'з', C: 'Ц', c: 'ц',
  W: 'В', w: 'в',
};

// Заимствования, которые по общим правилам передаются неверно (в латинице «s» вместо «ц», нет «ь»).
const WORDS = [
  ['budjet', 'бюджет'], ['funksiya', 'функция'], ['funksional', 'функционал'], ['aksiz', 'акциз'], ['aksiya', 'акция'],
  ['komissiya', 'комиссия'], ['litsenziya', 'лицензия'], ['obyekt', 'объект'], ['subyekt', 'субъект'],
  ['sex', 'цех'], ['prinsip', 'принцип'], ['sertifikat', 'сертификат'], ['koeffitsiyent', 'коэффициент'],
  ['inspeksiya', 'инспекция'], ['direksiya', 'дирекция'], ['seksiya', 'секция'], ['tranzaksiya', 'транзакция'],
  ['kompensatsiya', 'компенсация'], ['dotatsiya', 'дотация'], ['subsidiya', 'субсидия'], ['valyuta', 'валюта'],
];
// Месяцы: «ь» только у отдельного слова («26 июнь»), с аффиксом — без него («26 июндаги»).
const MONTHS = [['yanvar', 'январ'], ['fevral', 'феврал'], ['aprel', 'апрел'], ['iyun', 'июн'], ['iyul', 'июл'], ['sentabr', 'сентябр'], ['oktabr', 'октябр'], ['noyabr', 'ноябр'], ['dekabr', 'декабр']];
function fixWords(text) {
  let s = text;
  for (const [lat, cyr] of MONTHS) {
    s = s.replace(new RegExp(`(^|[^A-Za-z])(${lat})([A-Za-z]?)`, 'gi'), (_, pre, w, next) => {
      const base = w[0] === w[0].toUpperCase() ? cyr[0].toUpperCase() + cyr.slice(1) : cyr;
      return pre + base + (next ? next : 'ь');
    });
  }
  for (const [lat, cyr] of WORDS) {
    s = s.replace(new RegExp(`(^|[^A-Za-zʻʼ‘’'\`])(${lat})`, 'gi'), (_, pre, w) => pre + (w[0] === w[0].toUpperCase() ? cyr[0].toUpperCase() + cyr.slice(1) : cyr));
  }
  return s;
}

/** Переводит один фрагмент текста (без HTML-тегов). */
export function latnToCyrl(text) {
  // «e» в начале слова — «э», внутри — «е».
  let s = fixWords(text).replace(/(^|[^A-Za-zʻʼ‘’'`])E/g, '$1Э').replace(/(^|[^A-Za-zʻʼ‘’'`])e/g, '$1э');
  for (const [re, to] of PAIRS) s = s.replace(re, to);
  s = s.replace(/E/g, 'Е').replace(/e/g, 'е');
  s = s.replace(/[A-Za-z]/g, (ch) => SINGLE[ch] ?? ch);
  // Оставшийся апостроф после буквы — тутуқ белгиси (ъ).
  return s.replace(new RegExp(`([\\u0400-\\u04FF])${APOS}(?=[\\u0400-\\u04FF])`, 'g'), '$1ъ');
}

/** Транслитерирует текстовые узлы HTML, не трогая теги. */
export function latnToCyrlHtml(html) {
  return html.replace(/(^|>)([^<]+)/g, (_, gt, txt) => gt + latnToCyrl(txt));
}
