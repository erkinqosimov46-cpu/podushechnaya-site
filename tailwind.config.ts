import type { Config } from 'tailwindcss';

const v = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

export default {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  darkMode: 'media',
  theme: {
    extend: {
      colors: {
        paper: v('paper'),
        sheet: v('sheet'),
        ink: v('ink'),
        muted: v('muted'),
        rule: v('rule'),
        seal: v('seal'),
        sealink: v('sealink'),
        stamp: v('stamp'),
        amber: v('amber'),
      },
      fontFamily: {
        ui: ['"Golos Text"', 'system-ui', 'sans-serif'],
        law: ['"PT Serif"', 'Georgia', 'serif'],
      },
      maxWidth: { app: '480px' },
    },
  },
  plugins: [],
} satisfies Config;
