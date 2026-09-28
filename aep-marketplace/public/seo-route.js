/* Extracted from index.html inline <script> for strict CSP (M-07):
 * script-src is now self-only for the SPA, so this must be a local file. */
      // Update canonical URL and title based on current route (SPA fix for SEO)
      (function() {
        var path = window.location.pathname;
        if (path !== '/' && path !== '') {
          var canonical = document.querySelector('link[rel="canonical"]');
          if (canonical) {
            canonical.href = 'https://www.marketnow.site' + path;
          }
          var ogUrl = document.querySelector('meta[property="og:url"]');
          if (ogUrl) {
            ogUrl.content = 'https://www.marketnow.site' + path;
          }
        }

        // Dynamic page titles for SEO (prevents duplicate title penalty)
        var pageTitle = document.title;
        var routeTitles = {
          '/registry': 'Browse 68,388 MCP Skills — MarketNow Registry',
          '/trust': 'Trust Roadmap — Sentinel v3.0 Audit Pipeline — MarketNow',
          '/security': 'Sentinel v3.0 Security Audit Methodology — MarketNow',
          '/pricing': 'Pricing — Sentinel PRO $9.99/mo, ENTERPRISE $49.99/mo — MarketNow',
          '/about': 'About AliceLabs LLC — MarketNow',
          '/handshake': 'MarketNow — Trust Layer for Agent Commerce',
          '/verify': 'Verify Sentinel Certificate — MarketNow',
          '/catalog': 'Catalog Transparency — Where 68,388 MCP Skills Come From — MarketNow',
          '/policies': 'Terms, Refund, Privacy Policies — MarketNow',
          '/mandates': 'AP2 Mandates — Human-in-Loop Agent Spending — MarketNow',
          '/standards': 'Open Standards — MCP, AP2, x402 — MarketNow',
          '/embed': 'Embed Badges — Powered by MarketNow',
          '/submit': 'Submit Your MCP Server — MarketNow',
          '/dashboard': 'Dashboard — MarketNow',
          '/governance': 'Governance — MarketNow',
          '/vault': 'Vault — MarketNow',
          '/compare': 'Compare MCP Marketplaces — MarketNow',
          '/buyers-guide': 'MCP Server Buyer\'s Guide — MarketNow',
          '/onboarding': 'Onboarding — MarketNow',
          '/blog': 'Blog — MarketNow',
        };
        if (routeTitles[path]) {
          document.title = routeTitles[path];
        }
      })();
    