/**
 * MarketNow — interactive docs initialization (extracted from inline <script>
 * for strict CSP: script-src is now "self" + jsDelivr-with-SRI only, so the
 * spec + SwaggerUI init must live in a local file, not inline HTML).
 */
window.onload = () => {
  const spec = {
    openapi: '3.0.3',
    info: {
      title: 'UTA — Universal Trust Adapter API',
      version: '1.0.0',
      description: 'The universal adapter that translates between ALL agent trust credential formats. 9 formats, 12-stage fail-closed pipeline, 460+ tests.\n\nBase URL: `https://www.marketnow.site`\nNo auth required. No rate limit.',
      contact: { name: 'AliceLabs LLC', url: 'https://www.marketnow.site', email: 'info@alicelabs.site' },
      license: { name: 'AL-1.0', url: 'https://github.com/alicelabs-llc/universal-trust-adapter/blob/main/LICENSE-AL-1.0' }
    },
    servers: [{ url: 'https://www.marketnow.site', description: 'Production' }],
    paths: {
      '/api/trust': {
        get: {
          summary: 'Get UTA service info',
          description: 'Returns service metadata: 8 formats, 12-stage pipeline, 6,744 ops/sec, 480 tests.',
          tags: ['Service'],
          responses: {
            '200': { description: 'Service info', content: { 'application/json': { schema: { type: 'object', properties: {
              service: { type: 'string', example: 'MarketNow Universal Trust API' },
              version: { type: 'string', example: '1.0.0' },
              uts_version: { type: 'string', example: '2.0.0' },
              pipeline_stages: { type: 'integer', example: 12 },
              test_count: { type: 'integer', example: 480 },
              performance: { type: 'string', example: '6,744 verifications/sec' }
            }}}}}
          }
        }
      },
      '/api/trust?action=formats': {
        get: {
          summary: 'List all 8 supported credential formats',
          description: 'Returns the list of all supported credential formats with their status (stable/beta) and algorithms.',
          tags: ['Formats'],
          parameters: [{ name: 'action', in: 'query', required: true, schema: { type: 'string', enum: ['formats'] }}],
          responses: {
            '200': { description: 'Format list', content: { 'application/json': { schema: { type: 'object', properties: {
              total_formats: { type: 'integer', example: 8 },
              formats: { type: 'array', items: { type: 'object', properties: {
                id: { type: 'string', example: 'atc-v3' },
                name: { type: 'string', example: 'Agent Trust Card v3' },
                status: { type: 'string', example: 'stable' },
                algorithm: { type: 'string', example: 'Ed25519 (RFC 8032)' }
              }}}
            }}}}}
          }
        }
      },
      '/api/trust?action=pipeline': {
        get: {
          summary: 'Get the 12-stage verification pipeline',
          tags: ['Pipeline'],
          parameters: [{ name: 'action', in: 'query', required: true, schema: { type: 'string', enum: ['pipeline'] }}],
          responses: { '200': { description: 'Pipeline stages', content: { 'application/json': { schema: { type: 'object' }}}}}
        }
      },
      '/api/trust?action=revocation': {
        get: {
          summary: 'List revocation methods',
          tags: ['Revocation'],
          parameters: [{ name: 'action', in: 'query', required: true, schema: { type: 'string', enum: ['revocation'] }}],
          responses: { '200': { description: 'Revocation methods', content: { 'application/json': { schema: { type: 'object' }}}}}
        }
      },
      '/api/trust?action=verify': {
        post: {
          summary: 'Verify any credential (auto-detect format)',
          description: 'POST any credential payload. UTA auto-detects the format and runs the 12-stage fail-closed pipeline.\n\nReturns: valid/invalid, detected format, UTS translation, warnings.',
          tags: ['Verify'],
          parameters: [{ name: 'action', in: 'query', required: true, schema: { type: 'string', enum: ['verify'] }}],
          requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: {
            payload: { type: 'object', description: 'Any credential payload (ATC, JWT, W3C VC, A2A, EAT-AI, ZTA, MCP Card, X.509)' }
          }}}}},
          responses: {
            '200': { description: 'Verification result', content: { 'application/json': { schema: { type: 'object', properties: {
              valid: { type: 'boolean', example: true },
              detected_format: { type: 'string', example: 'atc-v3' },
              uts: { type: 'object', description: 'Universal Trust Schema translation' },
              warnings: { type: 'array', items: { type: 'string' }}
            }}}}}
          }
        }
      },
      '/api/trust?action=translate': {
        post: {
          summary: 'Translate credential from one format to another',
          description: 'Translate any credential from format X to format Y via UTS (Universal Trust Schema) as intermediate.',
          tags: ['Translate'],
          parameters: [{ name: 'action', in: 'query', required: true, schema: { type: 'string', enum: ['translate'] }}],
          requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: {
            from: { type: 'string', example: 'atc-v3', description: 'Source format (or "auto")' },
            to: { type: 'string', example: 'jwt', description: 'Target format' },
            payload: { type: 'object', description: 'The credential to translate' }
          }}}}},
          responses: { '200': { description: 'Translated credential', content: { 'application/json': { schema: { type: 'object' }}}}}
        }
      },
      '/api/trust?action=issue': {
        post: {
          summary: 'Issue credentials in multiple formats',
          description: 'Issue a new credential in one or more formats simultaneously.',
          tags: ['Issue'],
          parameters: [{ name: 'action', in: 'query', required: true, schema: { type: 'string', enum: ['issue'] }}],
          requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: {
            subject: { type: 'object' },
            identity: { type: 'object' },
            trust: { type: 'object' },
            formats: { type: 'array', items: { type: 'string' }, example: ['atc-v3', 'jwt', 'w3c-vc'] }
          }}}}},
          responses: { '200': { description: 'Issued credentials', content: { 'application/json': { schema: { type: 'object' }}}}}
        }
      },
      '/api/trust?action=bridge': {
        post: {
          summary: 'Bridge: verify in ecosystem A, issue in B',
          description: 'Verify a credential in one format, then issue a new credential in a different format. Example: verify A2A, issue ATC v3.',
          tags: ['Bridge'],
          parameters: [{ name: 'action', in: 'query', required: true, schema: { type: 'string', enum: ['bridge'] }}],
          requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: {
            verify_in: { type: 'string', example: 'a2a-card' },
            issue_as: { type: 'string', example: 'atc-v3' },
            payload: { type: 'object' },
            policy: { type: 'object', properties: { min_trust_score: { type: 'integer', example: 7 }}}
          }}}}},
          responses: { '200': { description: 'Bridge result', content: { 'application/json': { schema: { type: 'object' }}}}}
        }
      },
      '/api/skills.json': {
        get: { summary: 'Get all 68,388 MCP skills', tags: ['Skills'], responses: { '200': { description: 'Skills array', content: { 'application/json': { schema: { type: 'array' }}}}}}
      },
      '/api/categories.json': {
        get: { summary: 'Get 16 skill categories', tags: ['Skills'], responses: { '200': { description: 'Categories', content: { 'application/json': { schema: { type: 'array' }}}}}}
      },
      '/api/audit-report.json': {
        get: { summary: 'Get certification report (68,388 MCP skills index-certified)', tags: ['Audit'], responses: { '200': { description: 'Audit report', content: { 'application/json': { schema: { type: 'object' }}}}}}
      },
      '/api/atc.json': {
        get: { summary: 'Get ATC service info (57 cards issued)', tags: ['ATC'], responses: { '200': { description: 'ATC info', content: { 'application/json': { schema: { type: 'object' }}}}}}
      },
      '/api/interceptor.json': {
        get: { summary: 'Get MCP Interceptor info (5 policy rules)', tags: ['Interceptor'], responses: { '200': { description: 'Interceptor info', content: { 'application/json': { schema: { type: 'object' }}}}}}
      },
      '/api/security.json': {
        get: { summary: 'Get security stats (1.2M scans, 1,030 threats)', tags: ['Security'], responses: { '200': { description: 'Security stats', content: { 'application/json': { schema: { type: 'object' }}}}}}
      }
    },
    tags: [
      { name: 'Service', description: 'Service info and health' },
      { name: 'Formats', description: '8 credential format support' },
      { name: 'Pipeline', description: '12-stage verification pipeline' },
      { name: 'Verify', description: 'Auto-detect + verify any credential' },
      { name: 'Translate', description: 'Translate between formats' },
      { name: 'Issue', description: 'Issue new credentials' },
      { name: 'Bridge', description: 'Cross-ecosystem bridge' },
      { name: 'Revocation', description: 'Revocation methods (CRL + OCSP + Bitstring)' },
      { name: 'ATC', description: 'Agent Trust Card endpoints' },
      { name: 'Interceptor', description: 'MCP Interceptor (5 policy rules)' },
      { name: 'Security', description: 'Security audit stats' },
      { name: 'Skills', description: '68,388 MCP skills catalog' },
      { name: 'Audit', description: 'Security audit report' }
    ]
  };

  SwaggerUIBundle({
    spec: spec,
    dom_id: '#swagger-ui',
    presets: [SwaggerUIBundle.presets.apis, SwaggerUIStandalonePreset],
    layout: 'StandaloneLayout',
    deepLinking: true,
    defaultModelsExpandDepth: 2,
    defaultModelExpandDepth: 2,
    tryItOutEnabled: true,
  });
};
