import i18n from '../i18n';

/**
 * pdfTemplates.ts
 * Shared PDF helper utilities — colors, layout building blocks, HTML wrapper.
 * Used by all PDF export modules in TillExpiry (reports, internal labels).
 *
 * Design system: warm cream (Newsreader / DM Sans / JetBrains Mono).
 */

// ─── Design tokens ────────────────────────────────────────────────────────────

export const PDF_COLORS = {
  // ── Core palette ──────────────────────────────
  paper:        '#F4ECD6',
  paperCard:    '#FAF3DE',
  paperSoft:    '#FDF8EC',
  paperWhite:   '#FFFCF5',

  rule:         '#D9CDB4',
  rule2:        '#FAF3DE',
  rule3:        '#FAF3DE',

  ink:          '#1A2540',
  ink2:         '#4A5570',
  ink3:         '#6B7280',
  ink4:         '#9CA3AF',
  textDark:     '#111827',

  accent:       '#E8842D',
  accentSoft:   '#FAEAD5',
  accentDeep:   '#B96219',

  green:        '#16A34A',
  greenSoft:    '#DCFCE7',

  orange:       '#E8842D',
  orangeSoft:   '#FAEAD5',

  red:          '#B14D38',
  redSoft:      '#FBE3DE',

  blueSoft:     '#DBEAFE',
  blueDeep:     '#1E3A8A',

  // ── Legacy aliases (keep old key names, new values) ──
  blue800:      '#1A2540',
  blue900:      '#0B1D44',
  blue700:      '#4A5570',
  blue600:      '#6B7280',
  blue500:      '#E8842D',
  blue200:      '#D9CDB4',
  blue100:      '#FAEAD5',
  blue50:       '#FDF8EC',

  muted:        '#6B7280',
  line:         '#D9CDB4',
  greenBg:      '#DCFCE7',

  amber:        '#D97706',
  amberBg:      '#FEF3C7',
};

// ─── Page sizes ───────────────────────────────────────────────────────────────

export const PAGE_SIZES = {
  a4:     { width: 595, height: 842 },
  mobile: { width: 375, height: 812 },
};

// ─── Shared CSS ───────────────────────────────────────────────────────────────

const SHARED_CSS = `
  @page {
    margin: 0;
  }

  @media screen {
    html,
    body {
      margin: 0;
      padding: 0;
      background: #33363B;
      overflow-x: hidden;
    }
    #preview-stage {
      width: 100vw;
      overflow-x: hidden;
      display: flex;
      justify-content: center;
      align-items: flex-start;
      background: #33363B;
    }
    .pdf-doc {
      width: 595px;
      min-height: 842px;
      padding: 28px 34px;
      background: #F4ECD6;
      transform-origin: top center;
    }
    .pdf-doc.landscape {
      width: 842px;
      min-height: 595px;
    }
  }
  @media print {
    html,
    body {
      background: transparent;
      margin: 0;
      padding: 0;
    }
    #preview-stage {
      display: block;
      width: auto;
      min-height: auto;
      overflow: visible;
      background: transparent;
    }
    .pdf-doc {
      width: 100%;
      min-height: auto;
      margin: 0;
      padding: 20mm 16mm;
      transform: none !important;
      background: transparent;
    }
  }

  * { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, Arial, sans-serif;
    background: #F4ECD6;
    color: #1A2540;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
    overflow-wrap: break-word;
    word-break: break-word;
  }

  /* ── New page header (.ph) ───────────────────── */
  .ph {
    display: flex;
    flex-direction: row;
    justify-content: space-between;
    align-items: flex-start;
    border-bottom: 1.5px solid #1A2540;
    padding-bottom: 18px;
    margin-bottom: 26px;
  }
  .ph-l {
    display: flex;
    flex-direction: row;
    gap: 10px;
    align-items: flex-start;
  }
  .ph-mark {
    width: 44px;
    height: 44px;
    background: #1A2540;
    border-radius: 11px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }
  .ph-brand {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  .ph-name {
    font-family: 'Newsreader', Georgia, serif;
    font-size: 19px;
    font-weight: 600;
    color: #1A2540;
    line-height: 1.2;
  }
  .ph-mod {
    font-family: 'JetBrains Mono', 'Courier New', monospace;
    font-size: 10px;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    color: #6B7280;
  }
  .ph-r {
    text-align: right;
    min-width: 0;
  }
  .ph-title {
    font-family: 'Newsreader', Georgia, serif;
    font-size: 22px;
    font-weight: 500;
    color: #1A2540;
    line-height: 1.2;
    overflow-wrap: anywhere;
  }
  .ph-sub {
    font-family: 'JetBrains Mono', 'Courier New', monospace;
    font-size: 10.5px;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: #6B7280;
    margin-top: 4px;
  }
  .ph-badge {
    display: inline-block;
    background: #FAF3DE;
    color: #B96219;
    font-family: 'JetBrains Mono', 'Courier New', monospace;
    font-size: 9.5px;
    font-weight: 500;
    padding: 3px 8px;
    border-radius: 100px;
    margin-top: 6px;
  }

  /* ── Card grids ──────────────────────────────── */
  .cards  { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; margin-bottom: 16px; }
  .c2     { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; margin-bottom: 16px; }
  .c3     { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 16px; }
  .c4     { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 16px; }
  .c2x2   { display: grid; grid-template-columns: repeat(2, 1fr); grid-template-rows: repeat(2, auto); gap: 10px; margin-bottom: 16px; }

  /* ── Cards ───────────────────────────────────── */
  .card {
    flex: 1 1 0;
    min-width: 0;
    container-type: inline-size;
    background: #FAF3DE;
    border: 1px solid #D9CDB4;
    border-radius: 10px;
    padding: 14px 16px;
  }
  .card.hero {
    background: #1A2540;
    color: #F4ECD6;
    border-color: #1A2540;
  }
  .card.green {
    background: #DCFCE7;
    border-color: #16A34A;
  }
  .card.orange {
    background: #FAEAD5;
    border-color: #E8842D;
  }
  .card.red {
    background: #FBE3DE;
    border-color: #B14D38;
  }
  .sc-label {
    font-family: 'JetBrains Mono', 'Courier New', monospace;
    font-size: 9.5px;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    color: #6B7280;
    margin-bottom: 6px;
  }
  .card.hero   .sc-label { color: rgba(244,236,214,0.7); }
  .card.green  .sc-label { color: #16A34A; }
  .card.orange .sc-label { color: #E8842D; }
  .card.red    .sc-label { color: #B14D38; }
  .sc-value {
    font-family: 'Newsreader', Georgia, serif;
    font-size: 20px;
    font-weight: 500;
    color: #1A2540;
    line-height: 1.1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: clip;
  }
  @supports (font-size: 1cqi) {
    .card .sc-value,
    .sum-card .sc-value { font-size: clamp(13px, 18cqi, 26px); }
  }
  .card.hero   .sc-value { color: #F4ECD6; }
  .card.green  .sc-value { color: #15803D; }
  .card.orange .sc-value { color: #B96219; }
  .card.red    .sc-value { color: #B14D38; }

  /* ── Backwards-compat sum-card classes ───────── */
  .sum-cards-row {
    display: flex;
    gap: 10px;
    padding: 16px 24px;
  }
  .sum-card {
    flex: 1 1 0;
    min-width: 0;
    container-type: inline-size;
    background: #FAF3DE;
    border: 1px solid #D9CDB4;
    border-radius: 10px;
    padding: 14px 16px;
  }
  .sum-card.hero {
    background: #1A2540;
  }
  .sum-card.hero .sc-label { color: rgba(244,236,214,0.7); }
  .sum-card.hero .sc-value { color: #F4ECD6; }

  /* ── Tables ──────────────────────────────────── */
  .tbl-wrap {
    background: #FAF3DE;
    border: 1px solid #D9CDB4;
    border-radius: 10px;
    overflow: hidden;
    margin-bottom: 16px;
  }
  .data-table,
  .t {
    width: 100%;
    border-collapse: collapse;
  }
  .data-table th,
  .t th {
    background: #FDF8EC;
    font-family: 'JetBrains Mono', 'Courier New', monospace;
    font-size: 9px;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: #6B7280;
    padding: 9px 12px;
    text-align: left;
  }
  .data-table td,
  .t td {
    font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, Arial, sans-serif;
    font-size: 11px;
    padding: 8px 12px;
    border-bottom: 1px solid #FAF3DE;
    color: #111827;
  }
  .t.zebra tr:nth-child(even) td {
    background: rgba(217,205,180,0.18);
  }
  .t td.num {
    text-align: right;
    font-family: 'JetBrains Mono', 'Courier New', monospace;
    white-space: nowrap;
  }
  .t td.pos { color: #16A34A; font-weight: 600; }
  .t td.neg { color: #B14D38; font-weight: 600; }

  /* ── Footer ──────────────────────────────────── */
  .pdf-footer {
    margin-top: auto;
    border-top: 1px solid #D9CDB4;
    padding-top: 16px;
    display: flex;
    justify-content: space-between;
    font-family: 'JetBrains Mono', 'Courier New', monospace;
    font-size: 10px;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: #6B7280;
  }

  /* ── Section header ──────────────────────────── */
  .section-h {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    margin: 14px 0 8px;
  }
  .section-h h3 {
    font-family: 'Newsreader', Georgia, serif;
    font-size: 13.5px;
    font-weight: 500;
    color: #1A2540;
    padding-left: 10px;
    position: relative;
  }
  .section-h h3::before {
    content: '';
    position: absolute;
    left: 0;
    top: 0;
    width: 3px;
    height: 12px;
    background: #E8842D;
    border-radius: 2px;
  }
  .section-h .meta {
    font-family: 'JetBrains Mono', 'Courier New', monospace;
    font-size: 9.5px;
    text-transform: uppercase;
    color: #9CA3AF;
  }

  /* ── Callout ─────────────────────────────────── */
  .callout {
    background: #FAF3DE;
    border: 1px solid #D9CDB4;
    border-left: 3px solid #E8842D;
    border-radius: 8px;
    padding: 12px 14px;
    font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, Arial, sans-serif;
    font-size: 11px;
    color: #4A5570;
    margin-bottom: 14px;
  }

  /* ── Body padding ────────────────────────────── */
  .pdf-body {
    padding: 0 24px 24px;
  }

  /* ── Page break ──────────────────────────────── */
  .page-break {
    page-break-before: always;
  }

  /* ── Backwards-compat old header classes ─────── */
  .pdf-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    padding: 16px 24px 14px;
    border-bottom: 1.5px solid #1A2540;
    margin-bottom: 20px;
  }
  .doc-type {
    font-family: 'JetBrains Mono', 'Courier New', monospace;
    font-size: 9px;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    color: #6B7280;
    margin-bottom: 3px;
  }
  .doc-title {
    font-family: 'Newsreader', Georgia, serif;
    font-size: 20px;
    font-weight: 600;
    color: #1A2540;
  }
  .doc-sub {
    font-family: 'JetBrains Mono', 'Courier New', monospace;
    font-size: 10px;
    color: #9CA3AF;
    margin-top: 4px;
  }
  .app-name {
    font-family: 'Newsreader', Georgia, serif;
    font-size: 13px;
    font-weight: 600;
    color: #1A2540;
    text-align: right;
  }
  .shop-name {
    font-family: 'JetBrains Mono', 'Courier New', monospace;
    font-size: 9px;
    text-transform: uppercase;
    color: #6B7280;
    text-align: right;
    margin-top: 4px;
  }
  .sec-title {
    font-family: 'Newsreader', Georgia, serif;
    font-size: 12px;
    font-weight: 600;
    color: #1A2540;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    margin: 14px 0 7px;
    padding-bottom: 4px;
    border-bottom: 1.5px solid #D9CDB4;
  }
  /* ── RTL (Arabic): tables and the header read from the right ── */
  [dir="rtl"] .data-table th, [dir="rtl"] .t th, [dir="rtl"] .data-table td, [dir="rtl"] .t td { text-align: right; }
  [dir="rtl"] .t td.num { text-align: left; }
  [dir="rtl"] .ph-r { text-align: left; }
  [dir="rtl"] .section-h h3 { padding-left: 0; padding-right: 10px; }
  [dir="rtl"] .section-h h3::before { left: auto; right: 0; }
  [dir="rtl"] .callout { border-left: 1px solid #D9CDB4; border-right: 3px solid #E8842D; }

  .total-bar {
    background: #1A2540;
    color: #F4ECD6;
    padding: 8px 12px;
    border-radius: 5px;
    display: flex;
    justify-content: space-between;
    font-family: 'Newsreader', Georgia, serif;
    font-size: 14px;
  }
`;

// ─── Building blocks ──────────────────────────────────────────────────────────

/**
 * Warm cream page header with SVG mark, brand name, title, subtitle and
 * shop badge.
 */
export function buildPageHeader(title: string, subtitle: string, shopName: string): string {
  return `
<div class="ph">
  <div class="ph-l">
    <div class="ph-mark">
      <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
        <rect x="3" y="4" width="16" height="14" rx="2" stroke="#F4ECD6" stroke-width="1.4"/>
        <path d="M6 8h10M6 11h7M6 14h5" stroke="#F4ECD6" stroke-width="1.4" stroke-linecap="round"/>
        <circle cx="16" cy="14" r="1.5" fill="#E8842D"/>
      </svg>
    </div>
    <div class="ph-brand">
      <span class="ph-name">${escHtml(i18n.t('appName', { defaultValue: 'TillExpiry' }))}</span>
      <span class="ph-mod">${escHtml(title)}</span>
    </div>
  </div>
  <div class="ph-r">
    <div class="ph-title">${escHtml(title)}</div>
    ${subtitle ? `<div class="ph-sub">${escHtml(subtitle)}</div>` : ''}
    ${shopName ? `<div class="ph-badge">&#9679; ${escHtml(shopName)}</div>` : ''}
  </div>
</div>`;
}

/**
 * Footer with 3 columns and a top border.
 * Right column always reads "Generated by TillExpiry".
 */
export function buildPageFooter(left: string, centre: string, pageNum: string | number): string {
  return `
<div class="pdf-footer">
  <span>${escHtml(String(left))}</span>
  <span>${centre ? escHtml(String(centre)) : ''}</span>
  <span>${pageNum !== '' ? `${escHtml(i18n.t('common.generatedBy', { defaultValue: 'Generated by TillExpiry' }))} &middot; ${escHtml(i18n.t('common.page', { defaultValue: 'Page' }))} ${pageNum}` : escHtml(i18n.t('common.generatedBy', { defaultValue: 'Generated by TillExpiry' }))}</span>
</div>`;
}

/**
 * A single summary card.
 */
export function buildSummaryCard(
  label: string,
  value: string,
  isHero = false,
  variant?: 'green' | 'orange' | 'red',
): string {
  let cls = 'card';
  if (isHero) {
    cls += ' hero';
  } else if (variant) {
    cls += ` ${variant}`;
  }
  return `
<div class="${cls}">
  <div class="sc-label">${escHtml(label)}</div>
  <div class="sc-value">${value}</div>
</div>`;
}

/**
 * A highlighted callout box with an accent left-border.
 */
export function buildCallout(text: string): string {
  return `<div class="callout">${escHtml(text)}</div>`;
}

/**
 * Section header with an accent bar and optional right-aligned metadata.
 */
export function buildSectionH(title: string, meta?: string): string {
  return `
<div class="section-h">
  <h3>${escHtml(title)}</h3>
  ${meta ? `<div class="meta">${escHtml(meta)}</div>` : ''}
</div>`;
}

/**
 * A zebra table from already-rendered text cells (every cell is escaped here). Columns listed in `numeric` are
 * right-aligned in a monospace face.
 */
export function buildTable(header: string[], body: string[][], numeric: number[] = []): string {
  const num = new Set(numeric);
  const head = `<tr>${header.map(h => `<th>${escHtml(h)}</th>`).join('')}</tr>`;
  const rows = body.map(r => `<tr>${r.map((c, i) => `<td${num.has(i) ? ' class="num"' : ''}>${escHtml(c)}</td>`).join('')}</tr>`).join('');
  return `<div class="tbl-wrap"><table class="t zebra"><thead>${head}</thead><tbody>${rows}</tbody></table></div>`;
}

/**
 * Wraps body HTML in a full HTML document with the shared CSS.
 */
export function wrapPdfHtml(
  bodyContent: string,
  extraStyles = '',
  opts: { landscape?: boolean } = {},
): string {
  const lang = i18n.language || 'en';
  const dir = lang === 'ar' ? 'rtl' : 'ltr';
  const docClass = opts.landscape ? 'pdf-doc landscape' : 'pdf-doc';
  return `<!DOCTYPE html>
<html lang="${escHtml(lang)}" dir="${dir}">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1, minimum-scale=1, maximum-scale=5, user-scalable=yes"/>
<!-- No remote Google Fonts. PDFs are generated offline; the CSS font-family stacks below render the document without a network dependency. -->
<style>
${SHARED_CSS}
${extraStyles}
</style>
</head>
<body>
<div id="preview-stage">
<main class="${docClass}">
${bodyContent}
</main>
</div>
</body>
</html>`;
}

/**
 * Returns a safe filename for a PDF export.
 */
export function buildPdfFilename(
  type: string,
  shopName: string,
  date: string,
  ref?: string,
): string {
  const safe = (s: string) =>
    s.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40);
  const parts = [safe(type), safe(shopName), date.replace(/\//g, '-')];
  if (ref) parts.push(safe(ref));
  return parts.join('_') + '.pdf';
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function escHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
