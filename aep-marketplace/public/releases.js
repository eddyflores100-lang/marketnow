/* Extracted from releases.html inline <script> for strict CSP (M-07). */

    fetch('/resilience.json').then(r => r.json()).then(manifest => {
      const html = manifest.packages.map(p => `
        <div class="pkg">
          <h3>${p.name} <code>v${p.version}</code></h3>
          <p>${p.description || ''}</p>
          <div class="channels">
            ${p.downloads.map((url, i) => `<div class="channel"><strong>${['NPM','jsDelivr','unpkg','marketnow.site'][i] || 'Channel '+(i+1)}:</strong> ${url}</div>`).join('')}
          </div>
        </div>
      `).join('');
      document.getElementById('packages').innerHTML = html;
    }).catch(e => {
      document.getElementById('packages').innerHTML = '<p>Error loading manifest. Try refreshing.</p>';
    });
  
