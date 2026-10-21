# UTA Conformance Vectors — Negative Examples

These vectors are reproducible negative test cases for the UTA Trust API verifier.
Each one can be run with a single `curl` command against the live verifier.

## Vectors

### 1. Invalid Signature (`invalid-signature.json`)

A well-formed ATC card where one byte of the Ed25519 signature has been flipped.
The verifier must reject it because the signature does not match the canonical
JSON of the payload.

```bash
curl -s -X POST https://uta-trust-api.eddyflores100.workers.dev/v1/trust/verify \
  -H "Content-Type: application/json" \
  -d @invalid-signature.json | jq .
```

**Expected:** HTTP 401, `detail: "signature verification failed"`

### 2. Untrusted Issuer (`wrong-ca.json`)

A well-formed card signed by a key that is NOT in the trust anchor set.
The card itself is syntactically valid — the CA key simply isn't recognized.

```bash
curl -s -X POST https://uta-trust-api.eddyflores100.workers.dev/v1/trust/verify \
  -H "Content-Type: application/json" \
  -d @wrong-ca.json | jq .
```

**Expected:** HTTP 401, `detail: "untrusted issuer: signing key not in trust anchor"`

### 3. Expired Card (`expired-atc.json`)

A well-formed, correctly-signed card whose `metadata.expires_at` is in the past.
The verifier must reject it even though the signature is valid.

```bash
curl -s -X POST https://uta-trust-api.eddyflores100.workers.dev/v1/trust/verify \
  -H "Content-Type: application/json" \
  -d @expired-atc.json | jq .
```

**Expected:** HTTP 401, `detail: "card expired"`

### 4. Revoked Key (`revoked-atc.json`)

A well-formed, correctly-signed card whose signing key has been revoked.
The verifier must reject it because the key appears in the signed revocation list.

```bash
curl -s -X POST https://uta-trust-api.eddyflores100.workers.dev/v1/trust/verify \
  -H "Content-Type: application/json" \
  -d @revoked-atc.json | jq .
```

**Expected:** HTTP 401, `detail: "signing key revoked"`

## Notes

- These vectors use throwaway Ed25519 test keys (not production keys).
- The canonical JSON (JCS RFC 8785) of each payload is provided alongside the `.json` file as `.canonical.txt`.
- The SHA-256 hash of each canonical form is provided as `.sha256`.
- The raw bytes (for binary protocols) are provided as `.bytes.base64` and `.bytes.hex`.
