(function () {
  if (typeof window === 'undefined') {
    return;
  }

  if (window._env_) {
    window.__envConfigReady = Promise.resolve(window._env_);
    return;
  }

  if (window.__envConfigReady) {
    return;
  }

  window.__envConfigReady = new Promise(function (resolve) {
    var finalize = function () {
      resolve(window._env_ || {});
    };

    var existing = document.querySelector('script[data-env-config="runtime"]');
    if (existing) {
      if (existing.getAttribute('data-loaded') === 'true' || existing.getAttribute('data-failed') === 'true') {
        finalize();
        return;
      }

      existing.addEventListener('load', finalize, { once: true });
      existing.addEventListener('error', finalize, { once: true });
      return;
    }

    var script = document.createElement('script');
    script.src = '/env-config.js';
    script.async = false;
    script.defer = false;
    script.setAttribute('data-env-config', 'runtime');
    script.addEventListener('load', function () {
      script.setAttribute('data-loaded', 'true');
      finalize();
    }, { once: true });
    script.addEventListener('error', function () {
      script.setAttribute('data-failed', 'true');
      finalize();
    }, { once: true });
    document.head.appendChild(script);
  });
})();
