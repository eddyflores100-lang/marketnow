# UTA Conformance — Reproducible Vectors

Each vector can be verified with a single `curl` against the live verifier.

## Negative vectors (must-reject)

| Vector | Expected HTTP | Expected `detail` |
|--------|--------------|-------------------|
| `invalid-signature.json` | 401 | `signature verification failed` |
| `wrong-ca.json` | 401 | `untrusted issuer: signing key not in trust anchor` |
| `expired-atc.json` | 401 | `card expired` |
| `revoked-atc.json` | 401 | `signing key revoked` |

### Run all four

```bash
cd public/uta/conformance/vectors
for v in invalid-signature wrong-ca expired-atc revoked-atc; do
  echo "=== $v ==="
  curl -s -X POST https://uta-trust-api.eddyflores100.workers.dev/v1/trust/verify \
    -H "Content-Type: application/json" \
    -d @$v.json | jq '{status: .status, detail: .detail}'
done
```

## Positive vectors (must-accept)

| Vector | Expected HTTP |
|--------|--------------|
| `valid-atc.json` | 200 |
| `valid-mcp.json` | 200 |
| `valid-zta.json` | 200 |
| `valid-a2a.json` | 200 |

### Run all positives

```bash
for v in valid-atc valid-mcp valid-zta valid-a2a; do
  echo "=== $v ==="
  curl -s -X POST https://uta-trust-api.eddyflores100.workers.dev/v1/trust/verify \
    -H "Content-Type: application/json" \
    -d @$v.json | jq '{status: .status, card_id: .card_id}'
done
```
