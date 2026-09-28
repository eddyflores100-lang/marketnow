/**
 * M-02/M-06 round-trip test: artifact binding inside the certificate signature.
 *
 * 1. generateCertificate() with artifact extras → cert.artifact.bound === true,
 *    and verifyCertificate() returns true (artifact is INSIDE the signed payload).
 * 2. Tampering with cert.artifact.shasum must break the signature (the whole
 *    point of the binding: you cannot re-attach a certificate to another artifact).
 * 3. Default (no extras) → explicit unbound artifact block, still verifies.
 * 4. Legacy certs (pre-M-02, no artifact field) still verify — backward compatible.
 */
import { generateCertificate, verifyCertificate } from '../../lib/sentinel-audit.mjs';
import { readFileSync } from 'node:fs';

const SECRET = 'test-secret-do-not-use-in-prod';
let failures = 0;
function assert(name, cond, detail = '') {
  console.log(`  [${cond ? 'PASS' : 'FAIL'}] ${name}${cond ? '' : ' — ' + detail}`);
  if (!cond) failures++;
}

const fakeReport = {
  skill: { id: 'test-skill-001', name: 'Test Skill', version: '1.2.3' },
  audit: {
    overall_score: 9, max_score: 10, risk_level: 'low',
    risk_breakdown: { l15_l16: 'low', l2: 'not_available', final: 'low' },
    layers: {
      l15: { findings: 0 },
      l16: { semgrep_findings: 0, secret_findings: 0, osv_findings: 0 },
      l2: { has_results: true, score: 9, execution_status: 'completed' },
    },
  },
};

const artifactExtras = {
  artifact: {
    bound: true, source: 'npm', version: '1.2.3',
    shasum: 'a'.repeat(40), integrity: 'sha512-' + 'b'.repeat(86),
    tarball_bytes: 12345, resolved_at: '2026-09-28T00:00:00Z',
  },
};

console.log('\nM-02/M-06 certificate artifact binding round-trip:');

// 1. bound artifact verifies
const bound = await generateCertificate(fakeReport, SECRET, artifactExtras);
assert('cert carries artifact.bound=true', bound.artifact?.bound === true);
assert('cert carries shasum', bound.artifact?.shasum === 'a'.repeat(40));
assert('verifyCertificate accepts the bound cert', await verifyCertificate(bound, SECRET));

// 2. tamper with artifact identity → signature breaks
const tampered = JSON.parse(JSON.stringify(bound));
tampered.artifact.shasum = 'f'.repeat(40); // re-attach to a different artifact
assert('tampering artifact.shasum BREAKS the signature', !(await verifyCertificate(tampered, SECRET)));

const tamperedVersion = JSON.parse(JSON.stringify(bound));
tamperedVersion.artifact.version = '9.9.9';
assert('tampering artifact.version BREAKS the signature', !(await verifyCertificate(tamperedVersion, SECRET)));

// 3. default = explicit unbound block
const unbound = await generateCertificate(fakeReport, SECRET);
assert('default cert has explicit artifact.bound=false', unbound.artifact?.bound === false);
assert('default cert states the reason', typeof unbound.artifact?.reason === 'string' && unbound.artifact.reason.length > 10);
assert('default cert still verifies', await verifyCertificate(unbound, SECRET));

// 4. legacy v1 certificates (pre-cutoff, old canonical) still verify — but a
// post-cutoff cert without cert_v is REJECTED (fail-closed anti-downgrade).
const { createHash } = await import('node:crypto');
const legacy = JSON.parse(JSON.stringify(unbound));
delete legacy.artifact; // simulate a v1-shaped cert
delete legacy.cert_v;
legacy.issued_at = '2026-09-27T00:00:00.000Z'; // genuinely pre-cutoff
legacy.expires_at = '2026-10-04T00:00:00.000Z';
const legacyPayload = { ...legacy };
delete legacyPayload.signature;
delete legacyPayload.signature_algorithm;
delete legacyPayload.verification_url;
legacy.signature = createHash('sha256')
  .update(JSON.stringify(legacyPayload, Object.keys(legacyPayload).sort()) + '|' + SECRET)
  .digest('hex');
assert('legacy v1 cert (pre-cutoff, old canonical) still verifies', await verifyCertificate(legacy, SECRET));

const futureLegacy = JSON.parse(JSON.stringify(legacy));
futureLegacy.issued_at = '2026-10-20T00:00:00.000Z'; // post-cutoff, no cert_v
futureLegacy.expires_at = '2026-10-27T00:00:00.000Z';
const fp = { ...futureLegacy };
delete fp.signature; delete fp.signature_algorithm; delete fp.verification_url;
futureLegacy.signature = createHash('sha256')
  .update(JSON.stringify(fp, Object.keys(fp).sort()) + '|' + SECRET)
  .digest('hex');
assert('post-cutoff cert WITHOUT cert_v is rejected (fail-closed)', !(await verifyCertificate(futureLegacy, SECRET)));

// 4b. downgrading is structurally impossible: a cert_v: 2 signature is
// computed over the RECURSIVE canonical (nested content included), while the
// legacy weak check drops nested content — the two canonical forms of the
// same payload produce different hashes. So stripping cert_v from a v2 cert
// can never make it verify under the v1 path (and faking issued_at breaks
// the v1 scalar coverage anyway). The window only accepts certs that were
// SIGNED with v1 canonical in the first place.
const stripped = JSON.parse(JSON.stringify(bound));
stripped.artifact.shasum = 'f'.repeat(40); // tamper
delete stripped.cert_v;                    // try downgrade
assert('strip-downgrade of a v2 cert (nested tamper) is REJECTED even inside the window', !(await verifyCertificate(stripped, SECRET)));
// ...but tampering a TOP-LEVEL scalar on the same stripped cert is caught even
// in the weak path (v1 covers scalars):
const strippedScalar = JSON.parse(JSON.stringify(stripped));
strippedScalar.overall_score = 10;
assert('tampering a top-level scalar is caught even in the legacy weak path', !(await verifyCertificate(strippedScalar, SECRET)));
// and the real defense: the same strip attack with a NEW issued_at fails:
const strippedNew = JSON.parse(JSON.stringify(bound));
strippedNew.artifact.shasum = 'f'.repeat(40);
delete strippedNew.cert_v;
strippedNew.issued_at = '2026-10-20T00:00:00.000Z';
assert('strip attack with post-cutoff issued_at is REJECTED (cert_v forge blocked)', !(await verifyCertificate(strippedNew, SECRET)));

// 5. drift-detection shape sanity (mirrors api/audit-skill.js logic)
const driftMatches = String(bound.artifact.version) === String(fakeReport.skill.version);
const driftMismatch = String(bound.artifact.version) === String('0.0.1');
assert('drift comparator: same version matches', driftMatches && !driftMismatch);

// 6. batch flow parity: audit-all-skills artifactExtrasFor() shape
const scansDoc = JSON.parse(readFileSync(new URL('../../public/api/certification-scans.json', import.meta.url), 'utf8'));
const rows = Array.isArray(scansDoc) ? scansDoc : (scansDoc.scans || []);
const withShasum = rows.filter(r => r && r.name && r.shasum).length;
console.log(`  (info) certification-scans rows available for binding: ${withShasum}/${rows.length}`);
assert('at least one scan row carries a registry shasum to bind', withShasum > 0);

console.log(failures === 0 ? '\n✅ artifact binding round-trip: ALL PASS\n' : `\n❌ ${failures} FAILURE(S)\n`);
process.exit(failures === 0 ? 0 : 1);
