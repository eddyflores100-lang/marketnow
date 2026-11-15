#!/usr/bin/env python3
"""AliceLabs reproducible read-only security audit orchestration.

No LLM credentials required: deterministic LangGraph nodes and Semgrep.
Optional AI review can be added later without weakening evidence gates.
"""
import argparse
import datetime as dt
import json
import os
from pathlib import Path
import subprocess
import sys
from typing import TypedDict

from langgraph.graph import StateGraph, END

class AuditState(TypedDict, total=False):
    repository: str
    sha: str
    inventory: dict
    scan: dict
    triage: dict
    verification: dict
    report: dict

def command(args, cwd=None, timeout=600):
    return subprocess.run(args, cwd=cwd, capture_output=True, text=True, timeout=timeout, check=False)

def inventory(state: AuditState):
    root=Path(state["repository"])
    tracked=command(["git","ls-files"],cwd=root)
    files=tracked.stdout.splitlines() if tracked.returncode==0 else []
    return {"inventory":{"tracked_files":len(files),"extensions":{e:sum(Path(f).suffix==e for f in files) for e in [".ts",".tsx",".js",".py",".go",".rs"]},"git_ok":tracked.returncode==0}}

def scan(state: AuditState):
    root=Path(state["repository"])
    output=root/"security-audit-results.json"
    result=command(["semgrep","scan","--config","p/owasp-top-ten","--json","--output",str(output),"."],cwd=root,timeout=900)
    try:
        payload=json.loads(output.read_text())
        ok=isinstance(payload.get("results"),list) and isinstance(payload.get("errors"),list)
    except (OSError,ValueError,TypeError):
        payload={"results":[],"errors":[{"message":"No valid scanner JSON"}]}
        ok=False
    return {"scan":{"exit_code":result.returncode,"output_valid":ok,"results":payload["results"],"errors":payload["errors"],"stderr_tail":result.stderr[-1500:]}}

def triage(state: AuditState):
    findings=[]
    for item in state["scan"]["results"]:
        findings.append({"rule":item.get("check_id"),"path":item.get("path"),"start":item.get("start",{}).get("line"),"severity":item.get("extra",{}).get("severity"),"status":"unverified","review_required":True})
    return {"triage":{"findings":findings,"confirmed":0,"note":"Static matches are not confirmed vulnerabilities. Independent reproduction required."}}

def verify(state: AuditState):
    s=state["scan"]
    return {"verification":{"scanner_completed":s["output_valid"] and s["exit_code"] in (0,1),"unverified_findings":len(state["triage"]["findings"]),"human_or_isolated_retest_completed":False}}

def report(state: AuditState):
    now=dt.datetime.now(dt.timezone.utc).isoformat()
    summary={"generated_at_utc":now,"repository":state["repository"],"commit_sha":state["sha"],"inventory":state["inventory"],"scanner":{"name":"Semgrep","config":"p/owasp-top-ten","exit_code":state["scan"]["exit_code"],"errors":state["scan"]["errors"],"valid_output":state["scan"]["output_valid"]},"triage":state["triage"],"verification":state["verification"],"limitations":["Automated internal scan, not third-party audit or certification","Findings are unverified until reproduced","Coverage limited to installed Semgrep rules and supported languages"]}
    return {"report":summary}

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument("--repo",default=".")
    parser.add_argument("--out",default="audit-artifacts")
    args=parser.parse_args()
    root=Path(args.repo).resolve()
    sha=command(["git","rev-parse","HEAD"],cwd=root).stdout.strip()
    graph=StateGraph(AuditState)
    for name,fn in [("inventory",inventory),("scan",scan),("triage",triage),("verify",verify),("report",report)]:
        graph.add_node(name,fn)
    graph.set_entry_point("inventory")
    for a,b in [("inventory","scan"),("scan","triage"),("triage","verify"),("verify","report")]:
        graph.add_edge(a,b)
    graph.add_edge("report",END)
    state=graph.compile().invoke({"repository":str(root),"sha":sha})
    out=Path(args.out)
    out.mkdir(parents=True,exist_ok=True)
    payload=json.dumps(state["report"],indent=2,ensure_ascii=False)
    (out/"audit-report.json").write_text(payload+"\n")
    findings=state["triage"]["findings"]
    lines=["# AliceLabs internal automated security scan",f"Commit: \`{sha}\`",f"UTC: {state['report']['generated_at_utc']}","",f"Unverified findings: {len(findings)}",f"Scanner completed: {state['verification']['scanner_completed']}","","Not a certification or independent security audit.","","## Findings"]
    lines += [f"- {f['severity']}: {f['rule']} at {f['path']}:{f['start']} — unverified" for f in findings] or ["- No matches reported; this does not prove absence of vulnerabilities."]
    (out/"audit-report.md").write_text("\n".join(lines)+"\n")
    print(f"Audit artifacts written to {out}")
    if not state["verification"]["scanner_completed"]:
        print("Scanner incomplete: check audit-report.json",file=sys.stderr)
        return 2
    return 0

if __name__=="__main__":
    sys.exit(main())
