import type { Config } from 'tailwindcss';

/**
 * Strandply design tokens. Values are measured from design-reference/project/*.dc.html.
 * The raw values live as CSS variables in src/styles/tokens.css. This file maps them into Tailwind.
 *
 * `colors`, `fontSize` and `borderRadius` REPLACE Tailwind's defaults on purpose:
 * there is no `blue-*` and no `red-*`, so off-palette colours fail to compile.
 * Red exists only as `primary`, and <Button variant="primary"> is the single consumer that fills with it.
 */
const token = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    colors: {
      transparent: 'transparent',
      current: 'currentColor',
      inherit: 'inherit',

      primary: {
        DEFAULT: token('primary'), // #D71920 — one primary action per screen
        light: token('primary-light'), // #FFF1F2 — active nav, active tab pill, bad KPI circle
        tint: token('primary-tint'), // #FFF7F7 — selected table rows, active sub-nav
        border: token('primary-border'), // #F3C4C6 — danger-outline border, emphasised KPI border
      },
      ink: token('ink'), // #172033 — body text, doc numbers, focus border
      muted: token('muted'), // #667085 — secondary text, table headers
      faint: token('faint'), // #98A2B3 — meta, placeholders, KPI labels
      border: token('border'), // #E6E8EC — card and control borders
      divider: token('divider'), // #EEF0F3 — row separators
      subtle: token('subtle'), // #F5F6F8 — neutral pills, icon circles, sign-in page
      page: token('page'), // #F8F9FA — app background, table header, bulk bar
      card: token('card'), // #FFFFFF

      amber: { DEFAULT: token('amber'), light: token('amber-light') }, // #D97706 / #FFFBEB
      green: { DEFAULT: token('green'), light: token('green-light') }, // #16A34A / #F0FDF4
      purple: { DEFAULT: token('purple'), light: token('purple-light') }, // #7C3AED / #F5F3FF

      chart: {
        bar: token('chart-bar'), // #CBD2DC — neutral bars (current month uses primary)
        faint: token('chart-faint'), // #D0D5DD
      },
      overlay: 'rgb(var(--ink) / 0.32)',
    },

    fontFamily: {
      sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
    },

    // [size, lineHeight]. Every size that appears in the mockups, and nothing else.
    fontSize: {
      'doc-xs': ['9px', '1.4'], // A4 invoice preview fine print
      'doc-sm': ['10px', '1.4'],
      'label-sm': ['10.5px', '1.3'], // compact KPI label (Sales dashboard)
      label: ['11px', '1.3'], // uppercase labels, table headers, pills
      caption: ['11.5px', '1.4'], // tab counts, footers, alert meta
      meta: ['12px', '1.45'], // KPI meta, secondary lines
      sm: ['12.5px', '1.45'], // table body, small buttons, form labels
      base: ['13px', '1.5'], // default UI text, buttons, inputs
      md: ['13.5px', '1.45'], // tabs, segmented choices
      lg: ['14px', '1.45'], // large inputs, sign-in button
      title: ['15px', '1.4'], // card titles, command-palette input
      xl: ['16px', '1.35'], // section headings
      'kpi-sm': ['20px', '1.2'], // compact KPI values (Sales dashboard)
      kpi: ['22px', '1.2'], // KPI values
      h1: ['24px', '1.25'], // page titles
    },

    letterSpacing: {
      tight: '-0.2px', // h1
      normal: '0',
      label: '0.4px', // uppercase labels
      wide: '0.6px',
    },

    borderRadius: {
      none: '0',
      xs: '2px', // bars, progress
      sm: '4px', // checkboxes, small chips
      kbd: '5px', // keyboard hints (Esc)
      md: '6px', // segmented-control inner buttons
      pager: '7px', // pagination squares
      DEFAULT: '8px', // buttons, inputs, selects
      lg: '12px', // cards, tables, modals
      full: '9999px', // pills, icon circles
    },

    boxShadow: {
      none: 'none',
      overlay: '0 8px 24px rgb(23 32 51 / 0.12)', // modal, palette, toast
    },

    extend: {
      // Default 4px scale plus the off-grid steps the mockups use.
      spacing: {
        0.75: '3px',
        1.25: '5px',
        1.75: '7px',
        2.75: '11px',
        4.5: '18px',
        5.5: '22px',
        7.5: '30px', // pagination squares, segmented buttons
        8.5: '34px', // KPI icon circle
        12.5: '50px', // bulk-action bar
        13: '52px', // table footer
        // Component dimensions
        'ctl-sm': '32px', // bulk-bar and toolbar buttons
        ctl: '36px', // default buttons, inputs, selects
        'ctl-lg': '42px', // sign-in inputs
        'ctl-xl': '44px', // sign-in button
        'row-head': '34px', // table header
        row: '38px', // table row, tabs
        topbar: '60px',
        sidebar: '232px',
        'sidebar-rail': '64px', // collapsed sidebar (not in the mockups: icon rail)
        'modal-top': '92px', // modals and the command palette sit top-aligned, not centred
      },
    },
  },
  plugins: [],
} satisfies Config;
