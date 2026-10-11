/*!
 * Onboarding AI website widget.
 *
 *   <script src="https://YOUR-HOST/embed.js" data-presenter="your-presenter-slug" async></script>
 *
 * Options (data-* attributes on the script tag):
 *   data-presenter  required - the presenter's slug (from the dashboard)
 *   data-label      launcher text            (default "Watch a live demo")
 *   data-color      accent colour            (default "#636bff")
 *   data-position   "right" | "left"         (default "right")
 *   data-name       visitor name to prefill  (e.g. your logged-in user's name)
 *   data-open       "true" to open on load
 *
 * JavaScript API: window.OnboardAI.open({ name }), .close(), .toggle()
 */
(function () {
  'use strict';
  if (window.OnboardAI && window.OnboardAI.__loaded) return;

  var script =
    document.currentScript ||
    document.querySelector('script[data-presenter][src*="embed.js"]');
  if (!script) return;
  var slug = script.getAttribute('data-presenter');
  if (!slug) {
    console.warn('[Onboarding AI] embed.js needs a data-presenter attribute');
    return;
  }
  var host = new URL(script.src, location.href).origin;
  var label = script.getAttribute('data-label') || 'Watch a live demo';
  var color = script.getAttribute('data-color') || '#636bff';
  var side = script.getAttribute('data-position') === 'left' ? 'left' : 'right';
  var prefillName = script.getAttribute('data-name') || '';

  var state = 'form'; // form | joining | live | ended (reported by the iframe)
  var isOpen = false;
  var frame = null;

  var root = document.createElement('div');
  root.setAttribute('data-onboard-ai', '');
  var shadow = root.attachShadow({ mode: 'open' });

  var css =
    ':host{all:initial}' +
    '*{box-sizing:border-box;font-family:Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}' +
    '.launcher{position:fixed;bottom:20px;' + side + ':20px;z-index:2147483000;display:flex;align-items:center;gap:10px;' +
    'height:52px;padding:0 20px 0 16px;border:0;border-radius:999px;background:' + color + ';color:#fff;font-size:15px;' +
    'font-weight:600;cursor:pointer;box-shadow:0 10px 30px rgba(0,0,0,.25);transition:transform .15s,box-shadow .15s}' +
    '.launcher:hover{transform:translateY(-2px);box-shadow:0 14px 34px rgba(0,0,0,.3)}' +
    '.launcher .dot{width:9px;height:9px;border-radius:50%;background:#3ef08e;box-shadow:0 0 0 0 rgba(62,240,142,.7);' +
    'animation:pulse 1.8s infinite}' +
    '@keyframes pulse{0%{box-shadow:0 0 0 0 rgba(62,240,142,.6)}70%{box-shadow:0 0 0 9px rgba(62,240,142,0)}' +
    '100%{box-shadow:0 0 0 0 rgba(62,240,142,0)}}' +
    '.launcher.hidden{opacity:0;pointer-events:none;transform:scale(.9)}' +
    '.backdrop{position:fixed;inset:0;z-index:2147483001;background:rgba(5,7,12,.55);opacity:0;pointer-events:none;' +
    'transition:opacity .2s}' +
    '.backdrop.show{opacity:1;pointer-events:auto}' +
    '.panel{position:fixed;z-index:2147483002;bottom:20px;' + side + ':20px;width:380px;height:min(600px,calc(100vh - 40px));' +
    'border-radius:16px;overflow:hidden;background:#0b0d12;box-shadow:0 20px 60px rgba(0,0,0,.45);' +
    'border:1px solid rgba(255,255,255,.08);opacity:0;transform:translateY(16px) scale(.98);pointer-events:none;' +
    'transition:opacity .2s,transform .2s,width .25s,height .25s,bottom .25s,' + side + ' .25s}' +
    '.panel.open{opacity:1;transform:none;pointer-events:auto}' +
    // Live: a large, centred stage so the shared screen is readable.
    '.panel.live{top:0;right:0;bottom:0;left:0;margin:auto;width:min(1280px,calc(100vw - 48px));' +
    'height:min(820px,calc(100vh - 48px))}' +
    '.bar{position:absolute;top:8px;right:8px;z-index:2;display:flex;gap:6px}' +
    '.bar button{width:30px;height:30px;border-radius:8px;border:0;cursor:pointer;color:#cfd3dc;' +
    'background:rgba(255,255,255,.08);font-size:16px;line-height:30px;padding:0}' +
    '.bar button:hover{background:rgba(255,255,255,.16);color:#fff}' +
    'iframe{width:100%;height:100%;border:0;display:block;background:#0b0d12}' +
    '@media (max-width:640px){.panel,.panel.live{inset:0;width:100vw;height:100vh;max-width:none;max-height:none;' +
    'border-radius:0}.launcher{bottom:16px;' + side + ':16px}}';

  var style = document.createElement('style');
  style.textContent = css;
  shadow.appendChild(style);

  var backdrop = document.createElement('div');
  backdrop.className = 'backdrop';
  shadow.appendChild(backdrop);

  var panel = document.createElement('div');
  panel.className = 'panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', label);
  var bar = document.createElement('div');
  bar.className = 'bar';
  var minimize = document.createElement('button');
  minimize.type = 'button';
  minimize.title = 'Minimize';
  minimize.setAttribute('aria-label', 'Minimize');
  minimize.textContent = '–';
  bar.appendChild(minimize);
  panel.appendChild(bar);
  shadow.appendChild(panel);

  var launcher = document.createElement('button');
  launcher.type = 'button';
  launcher.className = 'launcher';
  launcher.innerHTML = '<span class="dot"></span><span class="text"></span>';
  launcher.querySelector('.text').textContent = label;
  shadow.appendChild(launcher);

  function ensureFrame(name) {
    if (frame) return;
    var url = host + '/embed/' + encodeURIComponent(slug);
    if (name) url += '?name=' + encodeURIComponent(name);
    frame = document.createElement('iframe');
    frame.src = url;
    frame.title = label;
    // The visitor talks to the presenter, so the iframe needs the microphone.
    frame.allow = 'microphone; camera; autoplay; display-capture; fullscreen; clipboard-write';
    panel.appendChild(frame);
  }

  function render() {
    var live = state === 'live';
    panel.classList.toggle('open', isOpen);
    panel.classList.toggle('live', live);
    backdrop.classList.toggle('show', isOpen && live);
    launcher.classList.toggle('hidden', isOpen);
    // While a session runs in the background, the launcher offers a way back.
    launcher.querySelector('.text').textContent = !isOpen && live ? 'Return to live demo' : label;
  }

  function open(opts) {
    ensureFrame((opts && opts.name) || prefillName);
    isOpen = true;
    render();
  }

  // Minimizing never ends the call: the iframe (and the audio) stays alive.
  function close() {
    isOpen = false;
    render();
  }

  launcher.addEventListener('click', function () {
    open();
  });
  minimize.addEventListener('click', close);
  backdrop.addEventListener('click', close);
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && isOpen) close();
  });

  window.addEventListener('message', function (event) {
    if (event.origin !== host || !frame || event.source !== frame.contentWindow) return;
    var data = event.data;
    if (!data || data.source !== 'onboard-ai' || data.type !== 'state') return;
    state = data.state;
    render();
  });

  function mount() {
    document.body.appendChild(root);
    if (script.getAttribute('data-open') === 'true') open();
  }
  if (document.body) mount();
  else document.addEventListener('DOMContentLoaded', mount);

  window.OnboardAI = {
    __loaded: true,
    open: open,
    close: close,
    toggle: function () {
      isOpen ? close() : open();
    },
  };
})();
