# AliceLabs Security Audit — reproducible baseline

This is a **read-only, internal, deterministic** five-node LangGraph audit pipeline: inventory → Semgrep scan → triage → verification gate → report.

## Run locally
```sh
python -m pip install -r security-audit/requirements.txt
python security-audit/audit.py --repo . --out audit-artifacts
```

The workflow archives `audit-report.json`, `audit-report.md`, and `security-audit-results.json`. Scanner failures and Semgrep analysis errors fail the job; finding matches are classified as **unverified**, not silently asserted as vulnerabilities. No API keys or production secrets are needed.

## Trail of Bits methodology
Reference: https://github.com/trailofbits/skills
Suggested separate review stages: `audit-context-building`, `static-analysis`, `differential-review`, `fp-check`, `agentic-actions-auditor`, `supply-chain-risk-auditor`.

These skills are **not vendored, cloned, installed or executed** by this baseline. Before adding them, inspect license and pinned commit, review execution permissions, and preserve their attribution. AI model-based reviews are also not enabled in this baseline.

## Limitations
This is not a penetration test, independent audit, security certification, or proof of safety. It must not be presented as such to investors. Review the artifacts, confirm tool versions and reproduce findings in isolated environments before publication.

## Verification protocol
1. Open the PR's latest Actions run; require the internal-security-audit job to complete successfully.
2. Download the audit artifact and check `scanner.errors` is empty, `scanner.valid_output` is true, and `verification.scanner_completed` is true.
3. Compare `triage.findings` by rule and path with the previous run, not only the total count. New findings can replace old ones.
4. Inspect and independently reproduce any critical or high-severity finding in an isolated test environment before classifying it as confirmed.
5. Record the exact commit SHA and workflow run ID in any investor-facing evidence. Do not call the internal scan an independent audit.

**Important:** GitHub Actions can report a green job while the scan is incomplete if the verification gate ignores scanner errors. The current gate explicitly checks for Semgrep analysis errors.
