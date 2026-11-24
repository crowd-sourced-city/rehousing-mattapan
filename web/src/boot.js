// Safety net for the moments before React starts. vite.config.ts inlines it into
// each page's <head>. If the app's own code fails to download or crashes before
// the app is running, show the error screen (plain HTML, since React may never
// load) instead of leaving the "Loading…" placeholder up forever.
// After the app starts, src/components/ErrorScreen.tsx takes over.
(function () {
  var shown = false;
  function show(what, detail) {
    if (shown || window.__appStarted) return;
    var root = document.getElementById('root');
    if (!root) return;
    shown = true;
    var info = [
      what,
      '',
      'Page:     ' + location.href,
      'Time:     ' + new Date().toISOString(),
      'Build:    ' + __BUILD__,
      'Browser:  ' + navigator.userAgent,
      '',
      detail || '(no further detail)',
    ].join('\n');
    root.innerHTML =
      '<main class="error-screen" role="alert">' +
      '<h1>Something went wrong</h1>' +
      '<p>The page couldn’t start. This is usually a brief connection problem: reloading normally fixes it.</p>' +
      '<div class="error-actions"><button class="btn primary" type="button">Reload page</button></div>' +
      '<details class="exp dev-info"><summary>Developer Info</summary><pre></pre></details>' +
      '</main>';
    root.querySelector('pre').textContent = info;
    root.querySelector('button').onclick = function () {
      location.reload();
    };
  }
  window.addEventListener(
    'error',
    function (e) {
      var t = e.target;
      if (t && t !== window && (t.tagName === 'SCRIPT' || t.tagName === 'LINK')) {
        var url = t.src || t.href || '';
        // Only our own files matter: if Google Fonts fails, the page still works in a fallback font.
        if (url.indexOf(location.origin) !== 0) return;
        if (t.tagName === 'LINK' && !/stylesheet|modulepreload/.test(t.rel)) return;
        show('Failed to load ' + url);
      } else if (e.error || e.message) {
        show(String(e.error || e.message), e.error && e.error.stack);
      }
    },
    true, // capture: resource load errors don't bubble
  );
  window.addEventListener('unhandledrejection', function (e) {
    show('Unhandled promise rejection: ' + String(e.reason), e.reason && e.reason.stack);
  });
})();
