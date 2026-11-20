/** CSS và JS của site tĩnh xuất từ vault. JS là ES5 thuần (script cổ điển, không module, không fetch) để mở được từ file://. */

export const SITE_CSS = `:root{--bg:#fbfaf8;--fg:#1f1d1a;--muted:#79736b;--line:#e6e2db;--accent:#2f5d8a;--soft:#f1eee8;--card:#fff;color-scheme:light dark}
@media (prefers-color-scheme:dark){:root{--bg:#161513;--fg:#e8e4dd;--muted:#9a948a;--line:#2e2b27;--accent:#8ab4e0;--soft:#1f1d1a;--card:#1f1d1a}}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--fg);font:17px/1.7 system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif}
a{color:var(--accent);text-underline-offset:.18em}
.site-h,.md-doc,.backlinks,.site-f,.idx{max-width:720px;margin:0 auto;padding-left:20px;padding-right:20px}
.site-h{padding-top:22px;padding-bottom:10px;font-weight:600;letter-spacing:.01em}
.site-h a{color:var(--fg);text-decoration:none}
.site-h a:hover{color:var(--accent)}
.md-doc{padding-top:12px;padding-bottom:28px;overflow-wrap:break-word}
.md-doc h1,.md-doc h2,.md-doc h3,.md-doc h4,.md-doc h5,.md-doc h6{line-height:1.25;margin:1.8em 0 .5em}
.md-doc h1{font-size:2em;margin-top:.6em}
.md-doc h2{font-size:1.45em}
.md-doc h3{font-size:1.2em}
.md-doc p,.md-doc ul,.md-doc ol,.md-doc blockquote,.md-doc pre,.md-doc table{margin:0 0 1em}
.md-doc img{max-width:100%;height:auto}
.md-doc blockquote{margin-left:0;padding:.1em 1em;border-left:3px solid var(--line);color:var(--muted)}
.md-doc code{font:.88em ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;background:var(--soft);padding:.12em .35em;border-radius:4px}
.md-doc pre{background:var(--soft);padding:12px 14px;border-radius:8px;overflow-x:auto}
.md-doc pre code{background:none;padding:0}
.md-doc table{border-collapse:collapse;display:block;overflow-x:auto}
.md-doc th,.md-doc td{border:1px solid var(--line);padding:6px 10px;text-align:left}
.md-doc hr{border:0;border-top:1px solid var(--line);margin:2em 0}
.doc-title{margin-top:.6em}
.wl{text-decoration:none;border-bottom:1px solid color-mix(in srgb,var(--accent) 45%,transparent)}
.wl:hover{border-bottom-color:var(--accent)}
.wl-broken{color:var(--muted);border-bottom:1px dotted var(--muted);cursor:help}
.embed{margin:0 0 1.2em;padding:2px 16px 4px;border-left:3px solid var(--line);background:var(--soft);border-radius:0 8px 8px 0}
.embed-h{font-size:.82em;letter-spacing:.04em;text-transform:uppercase;margin:10px 0 0}
.embed-h a{color:var(--muted);text-decoration:none}
.backlinks{padding-top:6px;padding-bottom:20px;border-top:1px solid var(--line);font-size:.92em}
.backlinks h2{font-size:.78em;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);margin:16px 0 6px}
.backlinks ul{margin:0;padding-left:1.1em}
.site-f{padding-top:14px;padding-bottom:40px;color:var(--muted);font-size:.85em}
.idx{padding-top:8px;padding-bottom:30px}
.idx h1{margin:.4em 0 .1em}
.idx .sub{color:var(--muted);margin:0 0 1.4em}
.idx h2{font-size:.82em;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);margin:1.8em 0 .4em;border-bottom:1px solid var(--line);padding-bottom:4px}
.idx ul{list-style:none;margin:0;padding:0}
.idx li{padding:2px 0}
.count{font-weight:400;margin-left:.4em}
.wl-card{position:absolute;z-index:50;width:min(320px,calc(100vw - 16px));padding:10px 12px;background:var(--card);color:var(--fg);border:1px solid var(--line);border-radius:10px;box-shadow:0 6px 24px rgba(0,0,0,.14);font-size:14px;line-height:1.5;pointer-events:none}
.wl-card[hidden]{display:none}
.wl-card-t{display:block;margin-bottom:4px}
.wl-card-x{margin:0;color:var(--muted)}
@media (prefers-reduced-motion:no-preference){.wl-card{animation:wl-in .12s ease-out}@keyframes wl-in{from{opacity:0}to{opacity:1}}}
@media print{.site-h,.backlinks,.site-f,.wl-card{display:none}}
`;

export const SITE_JS = `(function () {
  'use strict';
  var data = window.MDPREV_PREVIEWS || {};
  var card = null;
  var titleEl = null;
  var textEl = null;
  var current = null;

  function linkOf(el) {
    while (el && el.nodeType === 1) {
      if (el.tagName === 'A' && el.classList.contains('wl') && el.hasAttribute('data-note')) return el;
      el = el.parentNode;
    }
    return null;
  }

  function hide() {
    if (card) card.hidden = true;
    if (current) current.removeAttribute('aria-describedby');
    current = null;
  }

  function show(a) {
    var d = data[a.getAttribute('data-note')];
    if (!d) return;
    if (!card) {
      card = document.createElement('div');
      card.className = 'wl-card';
      card.id = 'wl-card';
      card.setAttribute('role', 'tooltip');
      titleEl = document.createElement('strong');
      titleEl.className = 'wl-card-t';
      textEl = document.createElement('p');
      textEl.className = 'wl-card-x';
      card.appendChild(titleEl);
      card.appendChild(textEl);
      document.body.appendChild(card);
    }
    titleEl.textContent = d.t || '';
    textEl.textContent = d.x || '';
    textEl.hidden = !d.x;
    card.hidden = false;
    current = a;
    a.setAttribute('aria-describedby', 'wl-card');
    var r = a.getBoundingClientRect();
    var sx = window.pageXOffset || 0;
    var sy = window.pageYOffset || 0;
    var w = card.offsetWidth;
    var h = card.offsetHeight;
    var vw = document.documentElement.clientWidth;
    var left = Math.max(8, Math.min(r.left, vw - w - 8)) + sx;
    var top = r.bottom + 6;
    if (top + h > window.innerHeight && r.top - h - 6 > 0) top = r.top - h - 6;
    card.style.left = left + 'px';
    card.style.top = (top + sy) + 'px';
  }

  document.addEventListener('mouseover', function (e) {
    var a = linkOf(e.target);
    if (a && a !== current) show(a);
  });
  document.addEventListener('mouseout', function (e) {
    var a = linkOf(e.target);
    if (!a) return;
    var to = linkOf(e.relatedTarget);
    if (to !== a) hide();
  });
  document.addEventListener('focus', function (e) {
    var a = linkOf(e.target);
    if (a) show(a);
  }, true);
  document.addEventListener('blur', function (e) {
    if (linkOf(e.target)) hide();
  }, true);
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' || e.keyCode === 27) hide();
  });
})();
`;
