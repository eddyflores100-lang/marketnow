# AliceLabs Security Audit — reproducible baseline

This is a **read-only, internal, deterministic** five-node LangGraph audit pipeline: inventory → Semgrep scan → triage → verification gate → report.

## Run locally
```sh
python -m pip install -r security-audit/requirements.txt
python security-audit/audit.py --repo . --out audit-artifacts
```

The workflow archives `audit-report.json`, `audit-report.md`, and `security-audit-results.json`. Scanner failures fail the job; finding matches are classified as **unverified**, not silently asserted as vulnerabilities. No API keys or production secrets are needed.

## Trail of Bits methodology
Reference: https://github.com/trailofbits/skills
Suggested separate review stages: `audit-context-building`, `static-analysis`, `differential-review`, `fp-check`, `agentic-actions-auditor`, `supply-chain-risk-auditor`.

These skills are **not vendored, cloned, installed or executed** by this baseline. Before adding them, inspect license and pinned commit, review execution permissions, and preserve their attribution. AI model-based reviews are also not enabled in this baseline.

## Limitations
This is not a penetration test, independent audit, security certification, or proof of safety. It must not be presented as such to investors. Review the artifacts, confirm tool versions and reproduce findings in isolated environments before publication.
