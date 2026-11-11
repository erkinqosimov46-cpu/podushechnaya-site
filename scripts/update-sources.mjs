#!/usr/bin/env node
// npm run update-sources — перекачивает все акты с lex.uz, показывает, у каких изменилась
// редакция или текст, и пересобирает content/ (парсер, глоссарий, таблица актов).
//   npm run update-sources -- --only bk,mj-2850
// Работает на Windows / macOS / Linux (только Node).

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const read = async (p) => (existsSync(p) ? JSON.parse(await readFile(p, 'utf8')) : null);
const registry = await read(join(ROOT, 'content', 'acts.json'));
const onlyIdx = args.indexOf('--only');
const only = onlyIdx >= 0 ? args[onlyIdx + 1].split(',') : null;
const acts = registry.acts.filter((a) => !only || only.includes(a.slug));

const snapshot = async () => {
  const out = {};
  for (const a of acts) {
    const m = await read(join(ROOT, 'sources', a.slug, 'meta.json'));
    if (!m) continue;
    out[a.slug] = Object.fromEntries(Object.entries(m.files).map(([k, f]) => [k, { edition: f.edition ?? null, sha: f.sha256, status: f.status ?? null, future: f.futureEditions ?? [] }]));
  }
  return out;
};

const run = (script, extra = []) => {
  const r = spawnSync(process.execPath, [join(ROOT, 'scripts', script), ...extra], { stdio: 'inherit', cwd: ROOT, env: { ...process.env, NODE_USE_ENV_PROXY: '1', NODE_NO_WARNINGS: '1' } });
  if (r.status !== 0) throw new Error(`${script} завершился с ошибкой`);
};

const before = await snapshot();
run('fetch-sources.mjs', ['--force', ...(only ? ['--only', only.join(',')] : [])]);
const after = await snapshot();

const changes = [];
for (const a of acts) {
  const b = before[a.slug] ?? {};
  const n = after[a.slug] ?? {};
  for (const [file, cur] of Object.entries(n)) {
    const old = b[file];
    if (!old) {
      changes.push({ act: a.slug, file, what: 'новый файл' });
      continue;
    }
    if (old.edition !== cur.edition) changes.push({ act: a.slug, file, what: `редакция ${old.edition ?? 'исх.'} → ${cur.edition ?? 'исх.'}` });
    else if (old.sha !== cur.sha) changes.push({ act: a.slug, file, what: 'текст изменился (редакция та же)' });
    if (old.status !== cur.status) changes.push({ act: a.slug, file, what: `статус: ${old.status ?? 'действует'} → ${cur.status ?? 'действует'}` });
    const newFuture = cur.future.filter((d) => !old.future.includes(d));
    if (newFuture.length) changes.push({ act: a.slug, file, what: `опубликована будущая редакция: ${newFuture.join(', ')}` });
  }
}

console.log('\n══ Изменения ══');
if (!changes.length) console.log('Изменений нет.');
else for (const c of changes) console.log(`• ${c.act.padEnd(12)} ${c.file.padEnd(14)} ${c.what}`);

const log = join(ROOT, 'content', 'UPDATES.md');
const prev = existsSync(log) ? await readFile(log, 'utf8') : '# Журнал обновлений источников\n';
const today = new Date().toISOString().slice(0, 10);
await writeFile(log, `${prev}\n## ${today}\n\n${changes.length ? changes.map((c) => `- \`${c.act}\` ${c.file}: ${c.what}`).join('\n') : '- изменений нет'}\n`);

if (changes.length || args.includes('--rebuild')) {
  console.log('\nПересобираю content/ …');
  run('parse-sources.mjs');
  run('build-glossary.mjs');
  run('acts-table.mjs');
  console.log('\nГотово. Проверьте content/PARSE_REPORT.md и сделайте коммит. Учебный слой к изменённым нормам стоит перепроверить.');
}
