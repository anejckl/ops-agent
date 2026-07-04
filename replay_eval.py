#!/usr/bin/env python3
"""Replay historically-tricky conversations against the current OPS_MODEL and check the answers.
Usage: OPS_MODEL=llama3.1:8b python3 replay_eval.py [outfile.json]
Tool calls are recorded by wrapping ops_agent.TOOLS in place - zero production code changes."""
import json
import os
import re
import sys

import ops_agent as oa

CASES_PATH = os.path.join(os.path.dirname(__file__), "replay_set.jsonl")

called_tools = []
for _name, _fn in list(oa.TOOLS.items()):
    def _wrap(fn=_fn, name=_name):
        def inner(**kw):
            called_tools.append(name)
            return fn(**kw)
        return inner
    oa.TOOLS[_name] = _wrap()


def run_case(case):
    history = []
    replies = []
    case_tools = []
    for turn in case["turns"]:
        called_tools.clear()
        reply, history = oa.ask(turn, history)
        replies.append(reply)
        case_tools.append(list(called_tools))
    checks = case.get("checks", {})
    full_text = "\n".join(replies)
    failures = []
    for pat in checks.get("must_match", []):
        if not re.search(pat, full_text):
            failures.append(f"must_match failed: {pat}")
    for pat in checks.get("must_not_match", []):
        if re.search(pat, full_text):
            failures.append(f"must_not_match hit: {pat}")
    if checks.get("expect_tools") and not any(case_tools):
        failures.append("expect_tools: no tool was called in any turn")
    return {
        "id": case["id"],
        "model": oa.MODEL,
        "passed": not failures,
        "failures": failures,
        "tools_per_turn": case_tools,
        "replies": replies,
    }


def main():
    cases = [json.loads(l) for l in open(CASES_PATH) if l.strip()]
    only = os.environ.get("REPLAY_ONLY")
    if only:
        wanted = set(only.split(","))
        cases = [c for c in cases if c["id"] in wanted]
    results = []
    for case in cases:
        print(f"[{oa.MODEL}] {case['id']} ...", end=" ", flush=True)
        try:
            r = run_case(case)
        except Exception as e:
            r = {"id": case["id"], "model": oa.MODEL, "passed": False, "failures": [f"exception: {e}"], "replies": []}
        print("PASS" if r["passed"] else f"FAIL {r['failures']}")
        results.append(r)
    passed = sum(1 for r in results if r["passed"])
    print(f"\n{oa.MODEL}: {passed}/{len(results)} passed")
    out = sys.argv[1] if len(sys.argv) > 1 else f"replay_{oa.MODEL.replace(':', '_').replace('.', '_')}.json"
    with open(out, "w") as f:
        json.dump(results, f, indent=1)
    print("written:", out)


if __name__ == "__main__":
    main()
