// Chaveiro Sena — main.js

// Mobile menu toggle
const menuBtn = document.getElementById('menu-btn');
const mobileMenu = document.getElementById('mobile-menu');
if (menuBtn && mobileMenu) {
  menuBtn.addEventListener('click', () => {
    const isOpen = mobileMenu.classList.toggle('is-open');
    menuBtn.setAttribute('aria-expanded', isOpen);
  });
}

// Fechar menu ao clicar num link
document.querySelectorAll('#mobile-menu a').forEach(link => {
  link.addEventListener('click', () => {
    mobileMenu.classList.remove('is-open');
    menuBtn.setAttribute('aria-expanded', false);
  });
});

// Sticky nav: adiciona classe ao fazer scroll
const nav = document.getElementById('main-nav');
if (nav) {
  window.addEventListener('scroll', () => {
    nav.classList.toggle('scrolled', window.scrollY > 50);
  }, { passive: true });
}

// FAQ accordion
document.querySelectorAll('.faq-question').forEach(btn => {
  btn.addEventListener('click', () => {
    const item = btn.closest('.faq-item');
    const isOpen = item.classList.contains('is-open');
    document.querySelectorAll('.faq-item').forEach(i => i.classList.remove('is-open'));
    if (!isOpen) item.classList.add('is-open');
    btn.setAttribute('aria-expanded', !isOpen);
  });
});

// Smooth scroll para âncoras internas
document.querySelectorAll('a[href^="#"]').forEach(a => {
  a.addEventListener('click', e => {
    const target = document.querySelector(a.getAttribute('href'));
    if (target) {
      e.preventDefault();
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });
});

// ---------------------------------------------------------------------------
// Registo de cliques no botao "Ligar" (links tel:) — 2026-09-15
// Alimenta a whitelist do anti-fraude: um IP que ja ligou e gente, e nunca deve
// ser bloqueado. Sem isto nao ha como validar a regra que bloqueia IPs, porque
// as conversoes sao chamadas medidas no Google Ads e nunca trazem IP.
// Backend: netlify/functions/log-call.js -> tabela call_clicks (Supabase).
// ---------------------------------------------------------------------------
(function () {
  var KEY = 'cs_gclid';
  var KEY_DEV = 'cs_device';

  // -------------------------------------------------------------------------
  // device_id — localStorage, NAO sessionStorage: tem de sobreviver a sessao,
  // senao a lista branca por dispositivo nunca liga duas visitas da mesma pessoa.
  //
  // Corre SEMPRE, mesmo sem gclid. E' de proposito: se so fosse escrito no
  // trafego pago, a lista branca nunca cruzava com as visitas organicas e um
  // dispositivo que ja ligou por via organica continuaria a ser tratado como
  // desconhecido no clique pago seguinte.
  // -------------------------------------------------------------------------
  var deviceId = null;
  try {
    deviceId = localStorage.getItem(KEY_DEV);
    if (!deviceId) {
      deviceId = (window.crypto && crypto.randomUUID)
        ? crypto.randomUUID()
        : 'd-' + Date.now().toString(16) + '-' + Math.random().toString(16).slice(2, 12);
      localStorage.setItem(KEY_DEV, deviceId);
    }
  } catch (e) {
    // localStorage bloqueado (modo privado, cookies off): segue sem device_id.
    // Nada aqui pode partir a pagina.
    deviceId = null;
  }

  // Espelho em cookie de 1a pessoa, para a validate-gclid o apanhar no <head>
  // sem ser preciso mexer nos HTML. Num visitante que volta, ja ca esta a tempo.
  try {
    if (deviceId && location.protocol === 'https:') {
      document.cookie = 'cs_device=' + deviceId + ';path=/;max-age=63072000;SameSite=Lax;Secure';
    }
  } catch (e) {}

  function cookie(nome) {
    try {
      var m = document.cookie.match(new RegExp('(^|;\\s*)' + nome + '=([^;]*)'));
      return m ? decodeURIComponent(m[2]) : null;
    } catch (e) { return null; }
  }

  // O gclid vem no URL da aterragem, mas o clique em "Ligar" pode acontecer
  // paginas a frente — por isso guarda-se na sessao.
  try {
    var g = new URLSearchParams(window.location.search).get('gclid');
    if (g) sessionStorage.setItem(KEY, g);
  } catch (e) {}

  // -------------------------------------------------------------------------
  // Ponte /r -> device_id. O /r e' Edge e corre antes de existir JS, por isso
  // grava o clique com device_id nulo e deixa o id da linha no cookie cs_click.
  // Aqui junta-se-lhe o device_id. Uma vez por clique; depois marca-se como
  // feito para nao repetir em cada pagina.
  // -------------------------------------------------------------------------
  (function ligarDispositivo() {
    if (!deviceId) return;
    var clickId = cookie('cs_click');
    var gclidAtual = null;
    try { gclidAtual = sessionStorage.getItem(KEY); } catch (e) {}
    if (!clickId && !gclidAtual) return;

    var marca = 'cs_linked_' + (clickId || gclidAtual);
    try { if (sessionStorage.getItem(marca)) return; } catch (e) {}

    var payload = JSON.stringify({
      click_id: clickId,
      gclid: gclidAtual,
      device_id: deviceId
    });
    var url = '/.netlify/functions/link-device';
    try {
      if (navigator.sendBeacon) {
        navigator.sendBeacon(url, new Blob([payload], { type: 'application/json' }));
      } else {
        fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: payload,
          keepalive: true
        }).catch(function () {});
      }
      try { sessionStorage.setItem(marca, '1'); } catch (e) {}
    } catch (e) {}
  })();

  function registarChamada() {
    var gclid = null;
    try { gclid = sessionStorage.getItem(KEY); } catch (e) {}
    var payload = JSON.stringify({
      gclid: gclid,
      device_id: deviceId,
      page: window.location.pathname
    });
    var url = '/.netlify/functions/log-call';

    // sendBeacon sobrevive a saida da pagina (abrir o marcador do telemovel).
    try {
      if (navigator.sendBeacon &&
          navigator.sendBeacon(url, new Blob([payload], { type: 'application/json' }))) {
        return;
      }
    } catch (e) {}

    // Plano B para browsers sem sendBeacon.
    try {
      fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
        keepalive: true
      }).catch(function () {});
    } catch (e) {}
  }

  // Captura para correr antes de qualquer handler que trave a propagacao.
  document.addEventListener('click', function (ev) {
    var alvo = ev.target;
    if (!alvo || typeof alvo.closest !== 'function') return;
    if (alvo.closest('a[href^="tel:"]')) registarChamada();
  }, true);
})();
