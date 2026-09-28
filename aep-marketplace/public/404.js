/* Extracted from 404.html inline <script> for strict CSP (M-07). */

      // GitHub Pages SPA fallback — redirect all 404s back to index.html
      // so React Router can handle the route client-side.
      //
      // This works because GitHub Pages serves 404.html for any path
      // that doesn't match a static file. We capture the original path
      // and redirect to /?p=<path>, which index.html reads and gives
      // to React Router via history.replaceState.
      var pathSegmentsToKeep = 1; // marketnow.site is at the root, no subpath
      var l = window.location;
      l.replace(
        l.protocol + '//' + l.hostname + (l.port ? ':' + l.port : '') +
        l.pathname.split('/').slice(0, 1 - pathSegmentsToKeep).join('/') + '/?' +
        (l.search ? l.search.slice(1) + '&' : '') +
        'p=' + l.pathname.split('/').slice(1 - pathSegmentsToKeep).join('/')
      );
    
