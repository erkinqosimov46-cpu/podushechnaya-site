#!/usr/bin/env node
// Рисует иконки PWA из SVG (нужен Playwright с Chromium). Иконки уже лежат в public/icons —
// запускать только если хотите их перерисовать: node scripts/make-icons.mjs
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');

// Печать казначейства: зелёное поле, двойное кольцо, параграф.
const svg = (pad) => `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="${pad ? 0 : 112}" fill="#0e5c43"/>
  <g transform="translate(256 256) scale(${pad ? 0.78 : 1})">
    <circle r="178" fill="none" stroke="#f4f0e5" stroke-width="14"/>
    <circle r="150" fill="none" stroke="#f4f0e5" stroke-width="5" stroke-dasharray="2 13"/>
    <text x="0" y="84" text-anchor="middle" font-family="PT Serif, Georgia, serif" font-weight="700" font-size="250" fill="#f4f0e5">§</text>
    <rect x="-98" y="112" width="196" height="10" rx="5" fill="#c9a24a"/>
  </g>
</svg>`;

const browser = await chromium.launch();
const page = await browser.newPage();
for (const [name, size, pad] of [
  ['icon-192.png', 192, false],
  ['icon-512.png', 512, false],
  ['icon-maskable-512.png', 512, true],
  ['apple-touch-icon.png', 180, true],
]) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0;background:transparent">${svg(pad).replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`);
  await writeFile(join(ROOT, 'public', 'icons', name), await page.screenshot({ omitBackground: !pad }));
}
await browser.close();
console.log('icons ok');
