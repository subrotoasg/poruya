#!/usr/bin/env node
/**
 * পড়ুয়া — static site generator.
 *
 * Reads  : content/subjects.json  +  content/topics/<id>.json
 * Writes : index.html, <subject>/index.html, <subject>/<topic>/index.html,
 *          per-topic Markdown mirrors, search-index.json, sitemap.xml,
 *          robots.txt, llms.txt, llms-full.txt, manifest.webmanifest
 *
 * Add a subject/topic: drop a JSON file into content/topics/, list its id in
 * content/subjects.json, then run `node build.mjs`.
 */

import { readFileSync, writeFileSync, mkdirSync, rmSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const read = (p) => JSON.parse(readFileSync(join(ROOT, p), 'utf8'));
const out = (p, s) => { mkdirSync(dirname(join(ROOT, p)), { recursive: true }); writeFileSync(join(ROOT, p), s); };

const cfg = read('content/subjects.json');
const SITE = cfg.site;
const BASEURL = SITE.url.replace(/\/$/, '');

/* ------------------------------------------------------------------ utils */
const esc = (s = '') => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const bn = (n) => String(n).replace(/\d/g, (d) => '০১২৩৪৫৬৭৮৯'[d]);

/** Inline markup → HTML.  *gold*  _green_  `cyan`  */
function inline(s = '') {
  return esc(s)
    .replace(/`([^`]+)`/g, '<span class="hl hl-cyan">$1</span>')
    .replace(/\*([^*]+)\*/g, '<mark class="hl hl-gold">$1</mark>')
    .replace(/_([^_]+)_/g, '<span class="hl hl-green">$1</span>');
}
/** Inline markup → plain text (for search index, Markdown, meta descriptions). */
function plain(s = '') {
  return String(s).replace(/[`*_]/g, '').replace(/\s+/g, ' ').trim();
}

const ICON = {
  sun: '<path d="M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10Z"/><path d="M12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
  book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  bookmark: '<path d="m19 21-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  bulb: '<path d="M9 18h6M10 22h4"/><path d="M15.1 14c.3-1.3 1-2 2-3a5.5 5.5 0 1 0-8.2 0c1 1 1.7 1.7 2 3"/>',
  flag: '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><path d="M4 22v-7"/>'
};
const svg = (name, cls = '') =>
  `<svg${cls ? ` class="${cls}"` : ''} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[name] || ''}</svg>`;

/* ------------------------------------------------------------------ load */
const topics = new Map();
for (const s of cfg.subjects) {
  for (const tid of s.topics) {
    const p = `content/topics/${tid}.json`;
    if (!existsSync(join(ROOT, p))) { console.warn(`  ! missing ${p} — skipped`); continue; }
    const t = read(p);
    t.subjectRef = s;
    t.url = `${s.id}/${t.id}/`;
    t.cardCount = t.sections.reduce((n, sec) => n + sec.cards.length, 0);
    topics.set(tid, t);
  }
  s.topicObjs = s.topics.map((id) => topics.get(id)).filter(Boolean);
  s.cardCount = s.topicObjs.reduce((n, t) => n + t.cardCount, 0);
}
const allTopics = [...topics.values()];
const TOTAL_CARDS = allTopics.reduce((n, t) => n + t.cardCount, 0);

/* ------------------------------------------------------------------ shell */
function depth(url) { return url ? url.split('/').filter(Boolean).length : 0; }

function layout({ url = '', title, desc, bodyClass = '', bodyAttrs = '', jsonld = [], main, keywords = [] }) {
  const base = depth(url) ? '../'.repeat(depth(url)) : './';
  const canonical = `${BASEURL}/${url}`;
  return `<!doctype html>
<html lang="bn" data-base="${base}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
${keywords.length ? `<meta name="keywords" content="${esc(keywords.join(', '))}">\n` : ''}<link rel="canonical" href="${canonical}">
<meta name="robots" content="index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1">
<meta name="theme-color" content="#faf9f6">
<meta name="color-scheme" content="light dark">
<meta property="og:type" content="${url ? 'article' : 'website'}">
<meta property="og:site_name" content="${esc(SITE.name)}">
<meta property="og:locale" content="${SITE.locale}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${canonical}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(desc)}">
<link rel="icon" href="${base}assets/favicon.svg" type="image/svg+xml">
<link rel="manifest" href="${base}manifest.webmanifest">
<link rel="alternate" type="text/markdown" href="${canonical}index.md">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Hind+Siliguri:wght@400;500;600;700&family=Noto+Serif+Bengali:wght@400;500;600;700&family=Inter:wght@400;500;600;700&display=swap">
<link rel="stylesheet" href="${base}assets/css/style.css">
<script>try{var t=localStorage.getItem('theme');if(t==='dark'||t==='light')document.documentElement.setAttribute('data-theme',t)}catch(e){}</script>
${jsonld.map((j) => `<script type="application/ld+json">${JSON.stringify(j)}</script>`).join('\n')}
</head>
<body class="${bodyClass}"${bodyAttrs}>
<a class="skip-link" href="#main">মূল কন্টেন্টে যান</a>

<header class="site-header">
  <div class="wrap">
    <a class="brand" href="${base}">
      <span class="brand-mark">${svg('book')}</span>
      ${esc(SITE.name)}
    </a>
    <nav class="header-nav" aria-label="প্রধান মেনু">
      <a href="${base}">হোম</a>
      ${cfg.subjects.map((s) => `<a href="${base}${s.id}/">${esc(s.short || s.name)}</a>`).join('\n      ')}
    </nav>
    <div class="header-tools">
      <button class="search-trigger" data-search-open type="button" aria-label="খুঁজুন">
        ${svg('search')}<span>খুঁজুন…</span><kbd>/</kbd>
      </button>
      <button class="icon-btn" data-theme-btn type="button" aria-label="থিম পরিবর্তন">${svg('sun')}</button>
    </div>
  </div>
  <div class="progress-rail" aria-hidden="true"><i></i></div>
</header>

<main id="main">
${main}
</main>

<footer class="site-footer">
  <div class="wrap">
    <div class="footer-grid">
      <div>
        <h5>${esc(SITE.name)}</h5>
        <p style="color:var(--ink-3);font-size:.92rem;margin:0;max-width:34ch">${esc(SITE.tagline)}</p>
      </div>
      ${cfg.subjects.map((s) => `<div>
        <h5>${esc(s.name)}</h5>
        <ul>${s.topicObjs.map((t) => `<li><a href="${base}${t.url}">${esc(t.title)}</a></li>`).join('')}</ul>
      </div>`).join('\n      ')}
      <div>
        <h5>রিসোর্স</h5>
        <ul>
          <li><a href="${base}sitemap.xml">সাইটম্যাপ</a></li>
          <li><a href="${base}llms.txt">llms.txt</a></li>
          <li><a href="${base}content/search-index.json">কন্টেন্ট API (JSON)</a></li>
        </ul>
      </div>
    </div>
    <div class="footer-note">
      কীবোর্ড শর্টকাট — <kbd>/</kbd> খুঁজুন · <kbd>j</kbd>/<kbd>k</kbd> পরের/আগের কার্ড · <kbd>t</kbd> থিম
    </div>
  </div>
</footer>

<div class="search-overlay" role="dialog" aria-modal="true" aria-label="খুঁজুন">
  <div class="search-panel">
    <div class="search-field">
      ${svg('search')}
      <input type="search" placeholder="বিষয়, টপিক বা শব্দ লিখুন…" autocomplete="off" spellcheck="false" aria-label="অনুসন্ধান">
      <button class="icon-btn" data-close type="button" aria-label="বন্ধ করুন" style="width:30px;height:30px">✕</button>
    </div>
    <div class="search-results"><div class="search-empty">বিষয়, টপিক বা যেকোনো শব্দ লিখে খুঁজুন</div></div>
    <div class="search-foot">
      <span><kbd>↑</kbd><kbd>↓</kbd> নেভিগেট</span><span><kbd>↵</kbd> খুলুন</span><span><kbd>esc</kbd> বন্ধ</span>
    </div>
  </div>
</div>

<script src="${base}assets/js/app.js" defer></script>
</body>
</html>`;
}

/* ------------------------------------------------------------------ blocks */
function renderBlock(b) {
  switch (b.t) {
    case 'p':
      return `<p>${inline(b.v)}</p>`;
    case 'ul':
      return `<ul>${b.v.map((x) => `<li>${inline(x)}</li>`).join('')}</ul>`;
    case 'flow':
      return `<div class="flow">${b.v.map((s, i) =>
        (i ? `<span class="flow-arrow">${svg('arrow')}</span>` : '') +
        `<span class="flow-step">${inline(s)}</span>`).join('')}</div>`;
    case 'note':
      return `<div class="note"><div class="note-k">${inline(b.k)}</div><div class="note-v">${inline(b.v)}</div></div>`;
    case 'kv':
      return `<dl class="kv">${b.v.map(([k, v]) =>
        `<div class="kv-row"><dt>${inline(k)}</dt><dd>${inline(v)}</dd></div>`).join('')}</dl>`;
    case 'tip':
      return `<div class="tip"><span class="tip-icon">${svg('bulb')}</span><div class="tip-body">${inline(b.v)}</div></div>`;
    case 'quiz':
      return `<div class="quiz" data-answer="${b.a}">
        <p class="quiz-q">${inline(b.q)}${b.src ? ` <span class="quiz-src">[${esc(b.src)}]</span>` : ''}</p>
        <ol class="quiz-opts">${b.v.map((o, i) =>
          `<li><button type="button" class="quiz-opt" data-i="${i}"><span class="quiz-key">${'কখগঘঙচ'[i] || i + 1}</span><span>${inline(o)}</span></button></li>`).join('')}
        </ol>
        ${b.note ? `<p class="quiz-note" hidden>${inline(b.note)}</p>` : ''}
      </div>`;
    case 'table':
      return `<div class="table-wrap"${b.c ? ` data-caption="${esc(b.c)}"` : ''}>
        <table>
          <thead><tr>${b.h.map((h) => `<th>${inline(h)}</th>`).join('')}</tr></thead>
          <tbody>${b.v.map((row) =>
            `<tr>${row.map((cell, i) => `<td data-label="${esc(plain(b.h[i] || ''))}">${inline(cell)}</td>`).join('')}</tr>`).join('')}
          </tbody>
        </table>
      </div>`;
    default:
      return '';
  }
}

function blockText(b) {
  switch (b.t) {
    case 'p': case 'tip': return plain(b.v);
    case 'ul': return b.v.map(plain).join(' ');
    case 'flow': return b.v.map(plain).join(' → ');
    case 'note': return plain(b.k) + ': ' + plain(b.v);
    case 'kv': return b.v.map(([k, v]) => plain(k) + ' — ' + plain(v)).join('; ');
    case 'quiz': return plain(b.q) + ' ' + b.v.map(plain).join(' ');
    case 'table': return b.h.map(plain).join(' | ') + ' ' + b.v.map((r) => r.map(plain).join(' | ')).join(' ');
    default: return '';
  }
}

function blockMd(b) {
  switch (b.t) {
    case 'p': return plain(b.v);
    case 'tip': return `> 💡 ${plain(b.v)}`;
    case 'ul': return b.v.map((x) => `- ${plain(x)}`).join('\n');
    case 'flow': return b.v.map(plain).join(' → ');
    case 'note': return `**${plain(b.k)}** — ${plain(b.v)}`;
    case 'kv': return ['| | |', '|---|---|', ...b.v.map(([k, v]) => `| ${plain(k)} | ${plain(v)} |`)].join('\n');
    case 'quiz': return [plain(b.q), ...b.v.map((o, i) =>
      `${i === b.a ? '- [x]' : '- [ ]'} ${plain(o)}`)].join('\n');
    case 'table': return [
      '| ' + b.h.map(plain).join(' | ') + ' |',
      '|' + b.h.map(() => '---').join('|') + '|',
      ...b.v.map((r) => '| ' + r.map(plain).join(' | ') + ' |')
    ].join('\n');
    default: return '';
  }
}

/* ------------------------------------------------------------------ pages */
function homePage() {
  const main = `
<section class="hero">
  <div class="wrap">
    <span class="eyebrow">${svg('check')} পরীক্ষার পূর্ণাঙ্গ প্রস্তুতি</span>
    <h1>${esc(SITE.tagline)}</h1>
    <p class="lede">${esc(SITE.description)}</p>
    <div class="stat-row">
      <div class="stat"><b>${bn(cfg.subjects.length)}</b><span>বিষয়</span></div>
      <div class="stat"><b>${bn(allTopics.length)}</b><span>টপিক</span></div>
      <div class="stat"><b>${bn(TOTAL_CARDS)}</b><span>নোট কার্ড</span></div>
    </div>
    <div class="btn-row">
      <a class="btn btn-primary" href="${cfg.subjects[0].id}/">পড়া শুরু করুন ${svg('arrow')}</a>
      <button class="btn btn-ghost" data-search-open type="button">${svg('search')} খুঁজে দেখুন</button>
    </div>
  </div>
</section>

<section class="section">
  <div class="wrap">
    <div class="section-head">
      <div><h2>বিষয়সমূহ</h2><p>প্রতিটি বিষয়ের ভেতরে টপিক অনুযায়ী সাজানো নোট</p></div>
    </div>
    <div class="grid grid-3">
      ${cfg.subjects.map((s, i) => `<a class="tile" href="${s.id}/">
        <span class="tile-index">${bn(i + 1)}</span>
        <h3>${esc(s.name)}</h3>
        <p>${esc(s.tagline)}</p>
        <div class="tile-meta">
          <span class="chip">${bn(s.topicObjs.length)} টপিক</span>
          <span class="chip">${bn(s.cardCount)} কার্ড</span>
        </div>
      </a>`).join('\n      ')}
    </div>
  </div>
</section>

<section class="section" style="padding-top:0">
  <div class="wrap">
    <div class="section-head"><div><h2>সর্বশেষ টপিক</h2><p>সরাসরি পড়তে শুরু করুন</p></div></div>
    <div class="grid grid-2">
      ${allTopics.slice(0, 6).map((t) => `<a class="tile" href="${t.url}">
        <h3>${esc(t.title)}</h3>
        <p>${esc(t.description)}</p>
        <div class="tile-meta">
          <span class="chip">${esc(t.subjectRef.short || t.subjectRef.name)}</span>
          <span class="chip">${bn(t.cardCount)} কার্ড</span>
          <span class="chip" data-progress-for="${t.id}"></span>
        </div>
      </a>`).join('\n      ')}
    </div>
  </div>
</section>`;

  return layout({
    url: '',
    title: `${SITE.name} — ${SITE.tagline}`,
    desc: SITE.description,
    main,
    keywords: ['বিসিএস প্রস্তুতি', 'বাংলাদেশ বিষয়াবলি', 'সাধারণ জ্ঞান', 'চাকরির পরীক্ষা', 'মেডিকেল ভর্তি'],
    jsonld: [
      { '@context': 'https://schema.org', '@type': 'WebSite', name: SITE.name, url: BASEURL + '/', inLanguage: 'bn', description: SITE.description },
      {
        '@context': 'https://schema.org', '@type': 'ItemList',
        itemListElement: cfg.subjects.map((s, i) => ({ '@type': 'ListItem', position: i + 1, name: s.name, url: `${BASEURL}/${s.id}/` }))
      }
    ]
  });
}

function subjectPage(s) {
  const main = `
<section class="hero" style="padding-bottom:12px">
  <div class="wrap">
    <nav class="breadcrumb" aria-label="ব্রেডক্রাম্ব">
      <a href="../">হোম</a><span aria-hidden="true">›</span><span>${esc(s.name)}</span>
    </nav>
    <h1>${esc(s.name)}</h1>
    <p class="lede">${esc(s.description)}</p>
    <div class="stat-row">
      <div class="stat"><b>${bn(s.topicObjs.length)}</b><span>টপিক</span></div>
      <div class="stat"><b>${bn(s.cardCount)}</b><span>নোট কার্ড</span></div>
    </div>
  </div>
</section>

<section class="section">
  <div class="wrap">
    <div class="section-head"><div><h2>টপিকসমূহ</h2><p>ধারাবাহিকভাবে একটার পর একটা পড়ুন</p></div></div>
    <div class="grid grid-2">
      ${s.topicObjs.map((t, i) => `<a class="tile" href="${t.id}/">
        <span class="tile-index">${bn(i + 1)}</span>
        <h3>${esc(t.title)}</h3>
        <p>${esc(t.description)}</p>
        <div class="tile-meta">
          <span class="chip">${bn(t.sections.length)} অধ্যায়</span>
          <span class="chip">${bn(t.cardCount)} কার্ড</span>
          <span class="chip" data-progress-for="${t.id}"></span>
        </div>
      </a>`).join('\n      ')}
    </div>
  </div>
</section>`;

  return layout({
    url: `${s.id}/`,
    title: `${s.name} — ${SITE.name}`,
    desc: s.description,
    main,
    keywords: [s.name, ...s.topicObjs.map((t) => t.title)],
    jsonld: [{
      '@context': 'https://schema.org', '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'হোম', item: BASEURL + '/' },
        { '@type': 'ListItem', position: 2, name: s.name, item: `${BASEURL}/${s.id}/` }
      ]
    }]
  });
}

function topicPage(t, prev, next) {
  const s = t.subjectRef;
  let n = 0;

  const toc = `<nav class="toc" aria-label="এই পাতার সূচি">
  <h4>সূচিপত্র</h4>
  <ol>
    ${t.sections.map((sec, si) => `<li class="toc-sec">
      <a href="#${sec.id}">${bn(si + 1)}. ${esc(sec.title)}</a>
      <ol>${sec.cards.map((c) => `<li><a href="#${c.id}">${esc(c.title)}</a></li>`).join('')}</ol>
    </li>`).join('\n    ')}
  </ol>
</nav>`;

  const body = t.sections.map((sec, si) => `<section class="sec" id="${sec.id}">
  <div class="sec-head">
    <span class="sec-num">${bn(si + 1)}</span>
    <h2>${esc(sec.title)}</h2>
  </div>
  ${sec.cards.map((c) => {
    n++;
    return `<article class="card" id="${c.id}">
    <div class="card-head">
      <span class="card-num">${bn(n)}</span>
      <h3>${esc(c.title)}</h3>
      <div class="card-actions">
        <button class="mini-btn rd" type="button" aria-pressed="false" aria-label="পড়া হয়েছে চিহ্নিত করুন" title="পড়া হয়েছে">${svg('check')}</button>
        <button class="mini-btn bm" type="button" aria-pressed="false" aria-label="বুকমার্ক" title="বুকমার্ক">${svg('bookmark')}</button>
        <button class="mini-btn cp" type="button" aria-label="লিংক কপি" title="লিংক কপি">${svg('link')}</button>
      </div>
    </div>
    <div class="card-body">
      ${c.blocks.map(renderBlock).join('\n      ')}
    </div>
  </article>`;
  }).join('\n  ')}
</section>`).join('\n');

  const main = `<div class="wrap">
  <div class="topic-layout">
    ${toc}
    <div>
      <header class="topic-head">
        <nav class="breadcrumb" aria-label="ব্রেডক্রাম্ব">
          <a href="../../">হোম</a><span aria-hidden="true">›</span>
          <a href="../">${esc(s.name)}</a><span aria-hidden="true">›</span>
          <span>${esc(t.title)}</span>
        </nav>
        <h1>${esc(t.title)}</h1>
        ${t.subtitle ? `<p class="sub">${esc(t.subtitle)}</p>` : ''}
        <div class="topic-meta">
          <span class="chip">${bn(t.sections.length)} অধ্যায়</span>
          <span class="chip">${bn(t.cardCount)} কার্ড</span>
          <span class="chip" data-read-count>০ / ${bn(t.cardCount)} পড়া হয়েছে</span>
        </div>
      </header>
      ${body}
      <nav class="pager" aria-label="টপিক নেভিগেশন">
        ${prev ? `<a href="../${prev.id}/"><small>← আগের টপিক</small><b>${esc(prev.title)}</b></a>` : '<span></span>'}
        ${next ? `<a class="next" href="../${next.id}/"><small>পরের টপিক →</small><b>${esc(next.title)}</b></a>` : '<span></span>'}
      </nav>
    </div>
  </div>
</div>

<button class="toc-fab" type="button" aria-label="সূচিপত্র খুলুন">${svg('list')} সূচিপত্র</button>
<div class="drawer" aria-hidden="true">
  <div class="drawer-scrim"></div>
  <div class="drawer-panel">${toc}</div>
</div>`;

  return layout({
    url: t.url,
    title: `${t.title} — ${s.name} | ${SITE.name}`,
    desc: t.description,
    bodyAttrs: ` data-topic="${t.id}"`,
    main,
    keywords: t.keywords || [],
    jsonld: [
      {
        '@context': 'https://schema.org', '@type': 'Article',
        headline: t.title, description: t.description, inLanguage: 'bn',
        mainEntityOfPage: `${BASEURL}/${t.url}`,
        articleSection: s.name,
        keywords: (t.keywords || []).join(', '),
        isPartOf: { '@type': 'CreativeWorkSeries', name: s.name, url: `${BASEURL}/${s.id}/` }
      },
      {
        '@context': 'https://schema.org', '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'হোম', item: BASEURL + '/' },
          { '@type': 'ListItem', position: 2, name: s.name, item: `${BASEURL}/${s.id}/` },
          { '@type': 'ListItem', position: 3, name: t.title, item: `${BASEURL}/${t.url}` }
        ]
      },
      {
        '@context': 'https://schema.org', '@type': 'LearningResource',
        name: t.title, learningResourceType: 'নোট', educationalLevel: 'পরীক্ষা প্রস্তুতি',
        inLanguage: 'bn', url: `${BASEURL}/${t.url}`,
        teaches: t.sections.map((sec) => sec.title).join(', ')
      }
    ]
  });
}

function topicMarkdown(t) {
  const s = t.subjectRef;
  const lines = [
    `# ${t.title}`, '',
    `> ${t.description}`, '',
    `**বিষয়:** ${s.name} · **অধ্যায়:** ${t.sections.length} · **কার্ড:** ${t.cardCount}`, '',
    `সূত্র: ${BASEURL}/${t.url}`, '', '---', ''
  ];
  for (const sec of t.sections) {
    lines.push(`## ${sec.title}`, '');
    for (const c of sec.cards) {
      lines.push(`### ${c.title}`, '');
      for (const b of c.blocks) { const m = blockMd(b); if (m) lines.push(m, ''); }
    }
  }
  return lines.join('\n');
}

/* ------------------------------------------------------------------ emit */
console.log('পড়ুয়া — building…');

for (const d of ['assets/favicon.svg']) { /* placeholder loop keeps assets explicit */ }

out('index.html', homePage());
console.log('  · index.html');

for (const s of cfg.subjects) {
  out(`${s.id}/index.html`, subjectPage(s));
  console.log(`  · ${s.id}/index.html`);
  s.topicObjs.forEach((t, i) => {
    out(`${t.url}index.html`, topicPage(t, s.topicObjs[i - 1], s.topicObjs[i + 1]));
    out(`${t.url}index.md`, topicMarkdown(t));
    console.log(`  · ${t.url} (html + md)`);
  });
}

/* search index */
const index = [];
for (const t of allTopics) {
  index.push({ u: t.url, t: t.title, s: t.subjectRef.name, b: plain(t.description) });
  for (const sec of t.sections) {
    for (const c of sec.cards) {
      index.push({
        u: `${t.url}#${c.id}`,
        t: c.title,
        s: `${t.subjectRef.name} › ${t.title} › ${sec.title}`,
        b: c.blocks.map(blockText).filter(Boolean).join(' ')
      });
    }
  }
}
out('content/search-index.json', JSON.stringify(index));
console.log(`  · content/search-index.json (${index.length} entries)`);

/* favicon */
out('assets/favicon.svg', `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
<rect width="64" height="64" rx="15" fill="#0f7a52"/>
<path d="M14 48.5A6.5 6.5 0 0 1 20.5 42H50" stroke="#fff" stroke-width="4" fill="none" stroke-linecap="round"/>
<path d="M20.5 10H50v40H20.5A6.5 6.5 0 0 1 14 43.5v-27A6.5 6.5 0 0 1 20.5 10Z" stroke="#fff" stroke-width="4" fill="none" stroke-linejoin="round"/>
</svg>`);

/* manifest */
out('manifest.webmanifest', JSON.stringify({
  name: SITE.name, short_name: SITE.name, description: SITE.description,
  start_url: '/', display: 'standalone', background_color: '#faf9f6', theme_color: '#0f7a52',
  lang: 'bn', dir: 'ltr',
  icons: [{ src: '/assets/favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }]
}, null, 2));

/* sitemap */
const today = new Date().toISOString().slice(0, 10);
const urls = [
  { loc: BASEURL + '/', pri: '1.0' },
  ...cfg.subjects.map((s) => ({ loc: `${BASEURL}/${s.id}/`, pri: '0.9' })),
  ...allTopics.map((t) => ({ loc: `${BASEURL}/${t.url}`, pri: '0.8' }))
];
out('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${u.loc}</loc><lastmod>${today}</lastmod><changefreq>weekly</changefreq><priority>${u.pri}</priority></url>`).join('\n')}
</urlset>`);

/* robots */
out('robots.txt', `User-agent: *
Allow: /

# AI assistants — a plain-text map of this site lives at /llms.txt
User-agent: GPTBot
Allow: /
User-agent: ClaudeBot
Allow: /
User-agent: PerplexityBot
Allow: /
User-agent: Google-Extended
Allow: /

Sitemap: ${BASEURL}/sitemap.xml
`);

/* llms.txt */
out('llms.txt', `# ${SITE.name}

> ${SITE.description}

বাংলা ভাষায় পরীক্ষা-প্রস্তুতির নোট। প্রতিটি টপিকের একটি প্লেইন-টেক্সট (Markdown) সংস্করণ
আছে — পাতার URL-এর শেষে \`index.md\` যোগ করলেই পাওয়া যায়।
সম্পূর্ণ কন্টেন্ট JSON আকারে: ${BASEURL}/content/search-index.json

${cfg.subjects.map((s) => `## ${s.name}\n\n${s.tagline}\n\n${s.topicObjs
    .map((t) => `- [${t.title}](${BASEURL}/${t.url}index.md): ${t.description}`).join('\n')}`).join('\n\n')}

## Optional

- [সম্পূর্ণ কন্টেন্ট এক ফাইলে](${BASEURL}/llms-full.txt)
- [সাইটম্যাপ](${BASEURL}/sitemap.xml)
`);

/* llms-full.txt */
out('llms-full.txt', `# ${SITE.name} — সম্পূর্ণ কন্টেন্ট\n\n${SITE.description}\n\n` +
  allTopics.map((t) => topicMarkdown(t)).join('\n\n---\n\n'));

console.log(`  · sitemap.xml, robots.txt, llms.txt, llms-full.txt, manifest, favicon`);
console.log(`\n✓ ${cfg.subjects.length} বিষয় · ${allTopics.length} টপিক · ${TOTAL_CARDS} কার্ড`);
