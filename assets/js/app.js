/* পড়ুয়া — client enhancements. No dependencies. */
(function () {
  'use strict';

  var ROOT = document.documentElement;
  var BASE = ROOT.getAttribute('data-base') || '/';
  var store = {
    get: function (k, d) { try { var v = localStorage.getItem(k); return v === null ? d : v; } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
    json: function (k, d) { try { return JSON.parse(localStorage.getItem(k)) || d; } catch (e) { return d; } }
  };

  /* ------------------------------------------------ theme */
  function applyTheme(t) {
    if (t === 'light' || t === 'dark') ROOT.setAttribute('data-theme', t);
    else ROOT.removeAttribute('data-theme');
    var m = document.querySelector('meta[name="theme-color"]');
    if (m) {
      var dark = t === 'dark' || (t !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches);
      m.setAttribute('content', dark ? '#0e1013' : '#faf9f6');
    }
    document.querySelectorAll('[data-theme-btn]').forEach(function (b) {
      b.setAttribute('aria-label', 'থিম পরিবর্তন (বর্তমান: ' + ({ light: 'লাইট', dark: 'ডার্ক' }[t] || 'সিস্টেম') + ')');
    });
  }
  applyTheme(store.get('theme', 'system'));

  function cycleTheme() {
    var order = ['system', 'light', 'dark'];
    var cur = store.get('theme', 'system');
    var next = order[(order.indexOf(cur) + 1) % 3];
    store.set('theme', next);
    applyTheme(next);
    toast({ system: 'সিস্টেম থিম', light: 'লাইট মোড', dark: 'ডার্ক মোড' }[next]);
  }
  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-theme-btn]');
    if (b) { e.preventDefault(); cycleTheme(); }
  });

  /* ------------------------------------------------ toast */
  var toastEl;
  function toast(msg) {
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.setAttribute('role', 'status');
      toastEl.style.cssText =
        'position:fixed;left:50%;bottom:26px;transform:translateX(-50%) translateY(14px);z-index:400;' +
        'background:var(--surface);color:var(--ink);border:1px solid var(--line-2);border-radius:999px;' +
        'padding:9px 20px;font-family:var(--font-ui);font-size:.9rem;font-weight:600;' +
        'box-shadow:var(--shadow-lg);opacity:0;transition:opacity .2s,transform .2s;pointer-events:none';
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = msg;
    requestAnimationFrame(function () {
      toastEl.style.opacity = '1';
      toastEl.style.transform = 'translateX(-50%) translateY(0)';
    });
    clearTimeout(toastEl._t);
    toastEl._t = setTimeout(function () {
      toastEl.style.opacity = '0';
      toastEl.style.transform = 'translateX(-50%) translateY(14px)';
    }, 1700);
  }

  /* ------------------------------------------------ reading progress */
  var rail = document.querySelector('.progress-rail i');
  if (rail) {
    var tick = function () {
      var h = document.documentElement;
      var max = h.scrollHeight - h.clientHeight;
      rail.style.width = (max > 0 ? Math.min(100, (h.scrollTop / max) * 100) : 0) + '%';
    };
    addEventListener('scroll', tick, { passive: true });
    addEventListener('resize', tick);
    tick();
  }

  /* ------------------------------------------------ per-card read / bookmark state */
  var topicId = document.body.getAttribute('data-topic');
  if (topicId) {
    var READ = 'read:' + topicId, BM = 'bm:' + topicId;
    var readSet = store.json(READ, []);
    var bmSet = store.json(BM, []);

    document.querySelectorAll('.card').forEach(function (card) {
      var id = card.id;
      if (readSet.indexOf(id) > -1) card.classList.add('is-read');
      var r = card.querySelector('.mini-btn.rd');
      var b = card.querySelector('.mini-btn.bm');
      if (r) r.setAttribute('aria-pressed', readSet.indexOf(id) > -1);
      if (b) b.setAttribute('aria-pressed', bmSet.indexOf(id) > -1);
    });
    updateCount();

    document.addEventListener('click', function (e) {
      var btn = e.target.closest('.mini-btn');
      if (!btn) return;
      var card = btn.closest('.card');
      if (!card) return;
      var id = card.id;

      if (btn.classList.contains('rd')) {
        var i = readSet.indexOf(id);
        if (i > -1) { readSet.splice(i, 1); card.classList.remove('is-read'); }
        else { readSet.push(id); card.classList.add('is-read'); }
        btn.setAttribute('aria-pressed', i < 0);
        store.set(READ, JSON.stringify(readSet));
        updateCount();
      } else if (btn.classList.contains('bm')) {
        var j = bmSet.indexOf(id);
        if (j > -1) bmSet.splice(j, 1); else bmSet.push(id);
        btn.setAttribute('aria-pressed', j < 0);
        store.set(BM, JSON.stringify(bmSet));
        toast(j < 0 ? 'বুকমার্ক করা হয়েছে' : 'বুকমার্ক সরানো হয়েছে');
      } else if (btn.classList.contains('cp')) {
        var url = location.origin + location.pathname + '#' + id;
        (navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject())
          .then(function () { toast('লিংক কপি হয়েছে'); })
          .catch(function () { toast('কপি করা যায় নি'); });
      }
    });

    function updateCount() {
      var total = document.querySelectorAll('.card').length;
      var el = document.querySelector('[data-read-count]');
      if (el) el.textContent = toBn(readSet.length) + ' / ' + toBn(total) + ' পড়া হয়েছে';
      try {
        var idx = store.json('progress', {});
        idx[topicId] = { done: readSet.length, total: total };
        store.set('progress', JSON.stringify(idx));
      } catch (e) {}
    }
  }

  function toBn(n) { return String(n).replace(/\d/g, function (d) { return '০১২৩৪৫৬৭৮৯'[d]; }); }

  /* ------------------------------------------------ TOC scroll-spy */
  var tocLinks = [].slice.call(document.querySelectorAll('.toc a[href^="#"]'));
  if (tocLinks.length && 'IntersectionObserver' in window) {
    var map = {};
    tocLinks.forEach(function (a) { map[a.getAttribute('href').slice(1)] = a; });
    var targets = Object.keys(map).map(function (id) { return document.getElementById(id); }).filter(Boolean);
    var visible = new Set();
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) visible.add(en.target.id); else visible.delete(en.target.id);
      });
      var first = targets.find(function (t) { return visible.has(t.id); });
      tocLinks.forEach(function (a) { a.classList.remove('is-active'); });
      if (first && map[first.id]) {
        map[first.id].classList.add('is-active');
        var sec = map[first.id].closest('.toc-sec');
        if (sec) { var h = sec.querySelector(':scope > a'); if (h) h.classList.add('is-active'); }
      }
    }, { rootMargin: '-80px 0px -70% 0px', threshold: 0 });
    targets.forEach(function (t) { io.observe(t); });
  }

  /* ------------------------------------------------ mobile TOC drawer */
  var drawer = document.querySelector('.drawer');
  document.addEventListener('click', function (e) {
    if (e.target.closest('.toc-fab')) { drawer && drawer.classList.add('is-open'); document.body.style.overflow = 'hidden'; }
    else if (drawer && drawer.classList.contains('is-open') &&
      (e.target.closest('.drawer-scrim') || e.target.closest('.drawer a'))) {
      drawer.classList.remove('is-open'); document.body.style.overflow = '';
    }
  });

  /* ------------------------------------------------ search */
  var overlay = document.querySelector('.search-overlay');
  var input = overlay && overlay.querySelector('input');
  var results = overlay && overlay.querySelector('.search-results');
  var index = null, loading = false, sel = 0;

  function openSearch() {
    if (!overlay) return;
    overlay.classList.add('is-open');
    document.body.style.overflow = 'hidden';
    input.focus(); input.select();
    loadIndex();
  }
  function closeSearch() {
    if (!overlay) return;
    overlay.classList.remove('is-open');
    document.body.style.overflow = '';
  }
  function loadIndex() {
    if (index || loading) return;
    loading = true;
    fetch(BASE + 'content/search-index.json')
      .then(function (r) { return r.json(); })
      .then(function (j) { index = j; loading = false; if (input.value) runSearch(); })
      .catch(function () { loading = false; });
  }

  function normalize(s) { return s.toLowerCase().replace(/[‌‍]/g, ''); }

  function runSearch() {
    var q = normalize(input.value.trim());
    if (!q) { results.innerHTML = '<div class="search-empty">বিষয়, টপিক বা যেকোনো শব্দ লিখে খুঁজুন</div>'; return; }
    if (!index) { results.innerHTML = '<div class="search-empty">লোড হচ্ছে…</div>'; return; }

    var terms = q.split(/\s+/).filter(Boolean);
    var hits = [];
    for (var i = 0; i < index.length; i++) {
      var it = index[i], hay = it._n || (it._n = normalize(it.t + ' ' + it.b + ' ' + it.s));
      var score = 0, ok = true;
      for (var k = 0; k < terms.length; k++) {
        var p = hay.indexOf(terms[k]);
        if (p < 0) { ok = false; break; }
        score += normalize(it.t).indexOf(terms[k]) > -1 ? 60 : 10;
        score += Math.max(0, 20 - p / 40);
      }
      if (ok) hits.push({ it: it, score: score });
    }
    hits.sort(function (a, b) { return b.score - a.score; });
    hits = hits.slice(0, 30);

    if (!hits.length) { results.innerHTML = '<div class="search-empty">কিছু পাওয়া যায় নি</div>'; return; }

    sel = 0;
    results.innerHTML = hits.map(function (h, i) {
      var it = h.it;
      return '<a href="' + BASE + it.u + '" class="' + (i === 0 ? 'is-sel' : '') + '">' +
        '<div class="sr-title">' + mark(it.t, terms) + '</div>' +
        '<div class="sr-path">' + esc(it.s) + '</div>' +
        '<div class="sr-snip">' + mark(snippet(it.b, terms), terms) + '</div>' +
        '</a>';
    }).join('');
  }

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function snippet(body, terms) {
    var n = normalize(body), p = -1;
    for (var i = 0; i < terms.length && p < 0; i++) p = n.indexOf(terms[i]);
    if (p < 0) p = 0;
    var start = Math.max(0, p - 50);
    return (start > 0 ? '… ' : '') + body.slice(start, start + 170) + (body.length > start + 170 ? ' …' : '');
  }
  function mark(text, terms) {
    var out = esc(text);
    terms.forEach(function (t) {
      if (!t) return;
      var re = new RegExp('(' + t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'gi');
      out = out.replace(re, '<mark>$1</mark>');
    });
    return out;
  }

  if (overlay) {
    input.addEventListener('input', runSearch);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) closeSearch(); });
    overlay.querySelectorAll('[data-close]').forEach(function (b) { b.addEventListener('click', closeSearch); });
    input.addEventListener('keydown', function (e) {
      var items = results.querySelectorAll('a');
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        if (!items.length) return;
        items[sel] && items[sel].classList.remove('is-sel');
        sel = (sel + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
        items[sel].classList.add('is-sel');
        items[sel].scrollIntoView({ block: 'nearest' });
      } else if (e.key === 'Enter') {
        if (items[sel]) { e.preventDefault(); location.href = items[sel].href; }
      }
    });
  }
  document.addEventListener('click', function (e) {
    if (e.target.closest('[data-search-open]')) { e.preventDefault(); openSearch(); }
  });

  /* ------------------------------------------------ keyboard shortcuts */
  document.addEventListener('keydown', function (e) {
    var tag = (e.target.tagName || '').toLowerCase();
    var typing = tag === 'input' || tag === 'textarea' || e.target.isContentEditable;

    if (e.key === 'Escape') { closeSearch(); if (drawer) { drawer.classList.remove('is-open'); document.body.style.overflow = ''; } return; }
    if (typing) return;

    if (e.key === '/' || ((e.metaKey || e.ctrlKey) && e.key === 'k')) { e.preventDefault(); openSearch(); return; }
    if (e.key === 't' && !e.metaKey && !e.ctrlKey) { cycleTheme(); return; }

    if (e.key === 'j' || e.key === 'k') {
      var cards = [].slice.call(document.querySelectorAll('.card'));
      if (!cards.length) return;
      var top = window.scrollY + 90;
      var cur = cards.findIndex(function (c) { return c.offsetTop > top - 4; });
      var i = e.key === 'j' ? (cur < 0 ? cards.length - 1 : cur) : (cur <= 0 ? 0 : cur - 1);
      if (e.key === 'j' && cards[cur] && Math.abs(cards[cur].offsetTop - top) < 6) i = Math.min(cur + 1, cards.length - 1);
      cards[i] && cards[i].scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });

  /* ------------------------------------------------ progress badges on index pages */
  document.querySelectorAll('[data-progress-for]').forEach(function (el) {
    var id = el.getAttribute('data-progress-for');
    var p = store.json('progress', {})[id];
    if (p && p.done > 0) {
      el.textContent = toBn(p.done) + '/' + toBn(p.total) + ' পড়া';
      el.classList.add('chip-done');
    }
  });
})();

/* পড়ুয়া — quiz interaction */
(function () {
  'use strict';
  document.addEventListener('click', function (e) {
    var btn = e.target.closest('.quiz-opt');
    if (!btn) return;
    var quiz = btn.closest('.quiz');
    if (!quiz || quiz.classList.contains('is-done')) return;

    var correct = parseInt(quiz.getAttribute('data-answer'), 10);
    var picked = parseInt(btn.getAttribute('data-i'), 10);
    quiz.classList.add('is-done');

    quiz.querySelectorAll('.quiz-opt').forEach(function (o) {
      var i = parseInt(o.getAttribute('data-i'), 10);
      if (i === correct) o.setAttribute('data-state', 'right');
      else if (i === picked) o.setAttribute('data-state', 'wrong');
      o.setAttribute('aria-disabled', 'true');
    });
    var note = quiz.querySelector('.quiz-note');
    if (note) note.hidden = false;
  });
})();
