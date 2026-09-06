/**
 * The one stylesheet behind every browser page the hosted service renders: the console
 * (`hosted/builder-console`), its sign-in page, and this Worker's own OAuth consent screen.
 *
 * It carries the public site's visual language without turning utility screens into a themed
 * experience: ink `#0b0c10`, warm paper `#f3efe6`, proof orange `#ef5b32`, Inter for reading,
 * and Archivo for headings. The console should feel related to Clueless Creations while staying
 * direct, quiet, and easy to use.
 *
 * Zero client-side JavaScript and no external requests, so a page can keep a Content-Security-
 * Policy of `default-src 'none'`. The two web fonts are optional: the console Worker serves them
 * itself from `/fonts/` (`hosted/builder-console/console/fonts.ts`) and passes `fonts: true`;
 * this Worker has no font route, so its consent screen passes `fonts: false` and reads in the
 * same stack's system fallback. Nothing else differs between the two.
 */

export interface ThemeOptions {
  /** Emit the `@font-face` rules for `/fonts/inter-b2c-*.woff2` and `/fonts/archivo-b2c.woff2`. */
  readonly fonts: boolean;
}

const FONT_FACES = `
@font-face{font-family:"Inter B2C";src:url(/fonts/inter-b2c-400.woff2) format("woff2");font-weight:400;font-display:swap}
@font-face{font-family:"Inter B2C";src:url(/fonts/inter-b2c-500.woff2) format("woff2");font-weight:500;font-display:swap}
@font-face{font-family:"Inter B2C";src:url(/fonts/inter-b2c-600.woff2) format("woff2");font-weight:600;font-display:swap}
@font-face{font-family:"Archivo B2C";src:url(/fonts/archivo-b2c.woff2) format("woff2");font-weight:100 900;font-display:swap}
`;

const BASE = `
:root{color-scheme:dark;--ink:#0b0c10;--ink-2:#121318;--paper:#f3efe6;--paper-2:#ded8ca;--white:#f7f5ef;--muted:#9b9ba3;--orange:#ef5b32;--line:rgba(247,245,239,.16);--danger:#ff9b88;--ok:#9fe3b6;--font-body:"Inter B2C",Inter,-apple-system,"Segoe UI",Helvetica,Arial,sans-serif;--font-display:"Archivo B2C",Archivo,"Inter B2C",Inter,-apple-system,"Segoe UI",Helvetica,Arial,sans-serif;--mono:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
*{box-sizing:border-box}
html{background:var(--ink)}
body{margin:0;min-height:100vh;display:flex;flex-direction:column;background:var(--ink);color:var(--white);font:16px/1.55 var(--font-body);-webkit-font-smoothing:antialiased}
a{color:inherit;text-underline-offset:3px}
.wrap{width:min(calc(100% - 40px),980px);margin-inline:auto}
header.site{display:flex;align-items:center;justify-content:space-between;gap:16px 24px;flex-wrap:wrap;padding:22px 0;border-bottom:1px solid var(--line)}
.brand{display:inline-flex;align-items:center;gap:11px;text-decoration:none;font-weight:600;color:var(--paper);letter-spacing:-.01em}
.brand svg{width:30px;height:30px;color:var(--orange);flex:0 0 auto}
.brand small{font-weight:400;color:var(--muted);margin-left:2px}
nav.site-nav{display:flex;align-items:center;gap:6px 20px;flex-wrap:wrap;font-size:14px;color:var(--muted)}
nav.site-nav a{color:var(--muted);text-decoration:none}
nav.site-nav a:hover,nav.site-nav a[aria-current]{color:var(--white)}
nav.site-nav .who{color:var(--muted)}
main{flex:1;padding:58px 0 68px}
.eyebrow{display:block;font-size:11px;letter-spacing:.16em;text-transform:uppercase;font-weight:600;color:var(--orange)}
h1{margin:12px 0 18px;max-width:17ch;font:600 clamp(2.15rem,5vw,3.5rem)/1 var(--font-display);letter-spacing:-.05em;color:var(--paper)}
h2{margin:44px 0 12px;font:600 1.15rem/1.3 var(--font-body);letter-spacing:-.01em;color:var(--paper)}
h2:first-child{margin-top:0}
p{margin:.6rem 0;max-width:62ch}
.lede{font-size:1.12rem;line-height:1.55;color:#c7c6c2;max-width:55ch}
.muted{color:var(--muted)}
.help{font-size:.88rem;color:var(--muted);max-width:58ch}
dl{margin:20px 0;max-width:62ch}
dt{font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--muted);margin-top:16px}
dd{margin:4px 0 0}
table{width:100%;border-collapse:collapse;margin:16px 0}
th,td{text-align:left;padding:12px 10px;border-bottom:1px solid var(--line);font-size:.92rem;vertical-align:middle}
th{color:var(--muted);font-weight:500;font-size:11px;text-transform:uppercase;letter-spacing:.14em}
.mono{font-family:var(--mono);font-size:.92em}
code{font-family:var(--mono);font-size:.86em;background:rgba(247,245,239,.08);padding:.1em .35em;border-radius:3px;overflow-wrap:anywhere}
pre{margin:0;padding:15px 16px;background:#090a0d;border:1px solid var(--line);border-radius:8px;overflow-x:auto;font:.85rem/1.55 var(--mono);color:var(--paper)}
pre code{background:none;padding:0;font-size:inherit}
.badge{display:inline-block;padding:.18rem .52rem;border-radius:999px;font-size:.78rem;white-space:nowrap;border:1px solid var(--line);color:var(--muted)}
.badge.active{color:var(--ok);border-color:rgba(159,227,182,.4)}
.badge.revoked{color:var(--danger);border-color:rgba(255,155,136,.4)}
.notice{padding:13px 16px;background:rgba(239,91,50,.12);border-left:2px solid var(--orange);margin:18px 0;max-width:62ch;border-radius:0 8px 8px 0}
.notice p{margin:0}
.reveal{padding:22px 24px;background:var(--paper);color:var(--ink);margin:22px 0;max-width:62ch;border-radius:10px}
.reveal p,.reveal .help{color:#3d3a35}
.reveal strong{color:var(--ink)}
.reveal input{background:#fffdf8;color:var(--ink);border-color:#c8c2b5}
label{display:block;font-weight:500;margin-top:18px}
input[type=text],input[type=email],input[type=password],select{display:block;width:100%;max-width:36rem;font:inherit;color:var(--white);padding:.7rem .78rem;border:1px solid var(--line);border-radius:7px;background:var(--ink-2);margin:.4rem 0}
input.mono{font-family:var(--mono)}
fieldset{border:1px solid var(--line);border-radius:8px;margin:12px 0;padding:10px 14px;max-width:36rem}
legend{padding:0 .3rem;font-size:.85rem;color:var(--muted)}
.radio-row{display:block;font-weight:400;margin:.5rem 0}
.radio-row input{margin-right:.5rem}
.field-error{font-size:.9rem;color:var(--danger)}
input[aria-invalid="true"]{border-color:var(--danger)}
:focus-visible{outline:3px solid var(--orange);outline-offset:3px}
button,.btn{display:inline-flex;align-items:center;justify-content:center;gap:10px;min-height:48px;padding:0 20px;font:600 .94rem var(--font-body);border:1px solid var(--paper);border-radius:999px;cursor:pointer;background:var(--paper);color:var(--ink);text-decoration:none;transition:transform .2s cubic-bezier(.16,1,.3,1),background .2s}
button:hover,.btn:hover{transform:translateY(-1px)}
button.secondary,.btn--secondary{background:transparent;color:var(--white);border-color:var(--line)}
button.secondary:hover,.btn--secondary:hover{background:rgba(247,245,239,.05)}
.btn--wide{width:100%;max-width:26rem;min-height:56px;font-size:1.02rem}
button.danger{background:transparent;color:var(--danger);border-color:rgba(255,155,136,.5);min-height:40px;padding:0 14px;font-size:.85rem}
button.link{background:none;border:0;padding:0;min-height:0;color:var(--muted);font:inherit;font-size:14px;cursor:pointer;text-decoration:underline;text-underline-offset:3px;transition:none}
button.link:hover{color:var(--white);transform:none}
.row-form{display:inline;margin:0}
.actions{display:flex;gap:12px;flex-wrap:wrap;margin:22px 0}
.plans{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px;max-width:40rem;margin:16px 0}
.plan{padding:22px;border:1px solid var(--line);border-radius:10px;background:var(--ink-2)}
.plan strong{display:block;font-size:1.02rem}
.plan .price{font:600 1.8rem/1.1 var(--font-display);letter-spacing:-.03em;color:var(--paper);margin:8px 0 16px}
.plan form{margin:0}
.steps{list-style:none;margin:24px 0 0;padding:0;display:grid;gap:16px;max-width:40rem}
.steps li{display:grid;grid-template-columns:34px 1fr;gap:12px;align-items:baseline;padding:15px 0;border-top:1px solid var(--line)}
.steps .n{font:500 12px/1 var(--mono);letter-spacing:.14em;color:var(--orange)}
.steps strong{display:block;font-weight:600}
.steps span{color:var(--muted);font-size:.92rem}
.doors{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:16px;margin:28px 0}
.door{padding:22px;border:1px solid var(--line);border-radius:10px;background:var(--ink-2)}
.door h2{margin:0 0 6px}
.door p{color:var(--muted);font-size:.95rem}
.door .btn{margin-top:14px}
.status{display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:15px 17px;border:1px solid var(--line);border-radius:9px;background:var(--ink-2);max-width:62ch}
.status .dot{width:8px;height:8px;border-radius:50%;background:var(--muted);flex:0 0 auto}
.status.on .dot{background:var(--ok)}
.status.warn .dot{background:var(--orange)}
footer.site{margin-top:auto;padding:20px 0 34px;border-top:1px solid var(--line);display:flex;flex-wrap:wrap;gap:8px 22px;font-size:13px;color:var(--muted)}
footer.site a{color:var(--muted)}
@media(max-width:640px){.wrap{width:min(calc(100% - 28px),980px)}main{padding:38px 0 56px}h1{max-width:none}.brand small{display:none}}
@media(prefers-reduced-motion:reduce){button,.btn{transition:none}button:hover,.btn:hover{transform:none}}
`;

/** The full stylesheet for one page. */
export function themeCss(options: ThemeOptions): string {
  return `${options.fonts ? FONT_FACES : ""}${BASE}`;
}

/** A neutral Clueless Creations mark. Kept abstract so the chrome can survive a product rename. */
export const BRAND_MARK_SVG =
  '<svg viewBox="0 0 40 40" fill="none" aria-hidden="true"><circle cx="20" cy="20" r="13" stroke="currentColor" stroke-width="2.4"/><circle cx="20" cy="20" r="3.5" fill="currentColor"/></svg>';
