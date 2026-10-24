// BoardPilot site: "Try it live". Replaces the screenshot with the browser demo (/demo/) only when
// the visitor clicks, so the page itself stays light. Small screens and touch devices keep the
// plain link, which opens the demo full-screen in a new tab. Generated markup: scripts/site/demo.mjs.
// On the landing page, links with data-demo (the demo gallery, the feature rows) play in the main
// player (#try) instead of a new tab, on screens roomy enough for it.

(function () {
  var roomy = window.matchMedia('(min-width: 900px) and (pointer: fine)');

  // A new iframe every time: the demos differ only in the URL hash, which would not reload the app.
  function play(box, src) {
    var frame = document.createElement('iframe');
    frame.src = src;
    frame.title = box.dataset.title || 'BoardPilot';
    frame.allow = 'fullscreen; clipboard-write';
    frame.setAttribute('allowfullscreen', '');
    var full = document.createElement('a');
    full.className = 'try-live-full';
    full.href = src;
    full.target = '_blank';
    full.rel = 'noopener';
    full.textContent = box.dataset.full || 'Open full screen';
    box.classList.add('on');
    box.replaceChildren(frame, full);
    frame.focus();
  }

  document.querySelectorAll('.try-live').forEach(function (box) {
    var link = box.querySelector('.try-live-btn');
    if (!link) return;
    link.addEventListener('click', function (e) {
      if (!roomy.matches || e.metaKey || e.ctrlKey || e.shiftKey) return; // new tab
      e.preventDefault();
      play(box, box.dataset.src);
    });
  });

  // The gallery: play a demo in the main player and say so on its card and above the player.
  var stage = document.getElementById('try');
  var player = stage && stage.querySelector('.try-live');
  if (!player) return;
  var head = stage.querySelector('.demo-stage-head');
  var lead = stage.querySelector('.demo-stage-lead');
  document.querySelectorAll('a[data-demo]').forEach(function (a) {
    a.addEventListener('click', function (e) {
      if (!roomy.matches || e.metaKey || e.ctrlKey || e.shiftKey) return; // new tab
      e.preventDefault();
      var src = a.dataset.demo;
      var card = null;
      document.querySelectorAll('.demo-card').forEach(function (c) {
        var on = !!c.querySelector('a[data-demo="' + src + '"]');
        c.classList.toggle('playing', on);
        if (on) card = c;
      });
      if (card && head) {
        var kind = card.querySelector('.kind');
        var title = card.querySelector('h3');
        var text = card.querySelector('.demo-body p');
        head.replaceChildren(kind.cloneNode(true), title.cloneNode(true));
        if (lead && text) lead.textContent = text.textContent;
      }
      play(player, src);
      stage.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });
})();
