// BoardPilot site: "Try it live". Replaces the screenshot with the browser demo (/demo/) only when
// the visitor clicks, so the page itself stays light. Small screens and touch devices keep the
// plain link, which opens the demo full-screen in a new tab. Generated markup: scripts/site/demo.mjs.

(function () {
  var roomy = window.matchMedia('(min-width: 900px) and (pointer: fine)');
  document.querySelectorAll('.try-live').forEach(function (box) {
    var link = box.querySelector('.try-live-btn');
    if (!link) return;
    link.addEventListener('click', function (e) {
      if (!roomy.matches || e.metaKey || e.ctrlKey || e.shiftKey) return; // new tab
      e.preventDefault();
      var frame = document.createElement('iframe');
      frame.src = box.dataset.src;
      frame.title = box.dataset.title || 'BoardPilot';
      frame.allow = 'fullscreen; clipboard-write';
      frame.setAttribute('allowfullscreen', '');
      var full = document.createElement('a');
      full.className = 'try-live-full';
      full.href = box.dataset.src;
      full.target = '_blank';
      full.rel = 'noopener';
      full.textContent = box.dataset.full || 'Open full screen';
      box.classList.add('on');
      box.replaceChildren(frame, full);
      frame.focus();
    });
  });
})();
