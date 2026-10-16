#!/usr/bin/env python3
"""Reproduce sampling/dropout and completion regressions against a git revision.

Run from the checkout: .venv/bin/python tools/benchmark_reliability.py
This synthetic benchmark tests specific failure modes. It does not establish
physical frequency accuracy, real-printer acceptance rates or force accuracy.
"""
import argparse
import json
import os
import subprocess
import sys
import types

import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
import chordata_belts as current


def recording(t, frequency=91., seed=917):
    rng = np.random.default_rng(seed)
    axes = [rng.normal(0., 20., len(t)) for _ in range(3)]
    for onset in (1., 2.2, 3.4, 4.6, 5.8):
        age = np.maximum(t - onset, 0.)
        envelope = np.where(t >= onset, np.exp(-age / .3), 0.)
        fundamental = 1500. * envelope * np.sin(2. * np.pi * frequency * age)
        harmonic = 4500. * envelope ** 2 * np.sin(4. * np.pi * frequency * age)
        axes[0] += .7 * harmonic + .3 * fundamental
        axes[1] += .7 * harmonic - .3 * fundamental
        axes[2] += .4 * fundamental
    return axes


def evaluate(module, t, axes, quiet):
    try:
        result = module.analyse(t, *axes, target=110., expect=5, quiet=quiet)
        return {"accepted": result["freq"] is not None,
                "estimate_hz": result.get("freq_estimate", result["freq"]),
                "display_hz": result["freq"], "used": result["used"]}
    except ValueError as error:
        return {"accepted": False, "rejected": str(error)}


def plan_case(module, frequencies, target=110.):
    mean = float(np.mean(frequencies))
    result = {"freq": round(mean, 1), "freq_estimate": mean, "used": len(frequencies),
              "quality": {"usable": True, "repeatability": current._repeatability(frequencies)}}
    advice, updates = module.plan({"A": result, "B": result, "target": target,
                                  "tol": .25, "plucks": 5})
    return {"done": updates["done"], "advice": advice}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--baseline-ref", default="12c6a30566f1668875063da5ec0b338b0d4c0b11",
                        help="git revision before the reliability changes (override for other revisions)")
    args = parser.parse_args()
    baseline = types.ModuleType("chordata_belts_baseline")
    source = subprocess.check_output(["git", "show", args.baseline_ref + ":chordata_belts.py"], cwd=ROOT)
    exec(compile(source, args.baseline_ref + ":chordata_belts.py", "exec"), baseline.__dict__)
    revision = subprocess.check_output(["git", "rev-parse", args.baseline_ref], cwd=ROOT, text=True).strip()
    fs = 3200.
    t = np.arange(int(8. * fs)) / fs
    axes = recording(t)
    quiet = [np.random.default_rng(71 + i).normal(0., 20., int(1.5 * fs)) for i in range(3)]
    gap = (t < .2) | (t >= .3)
    jittered = t + .03 / fs * np.sin(np.arange(len(t)) * 1.7)
    cases = {"uniform_91_hz": (t, axes),
             "100ms_missing_samples": (t[gap], [a[gap] for a in axes]),
             "bounded_timestamp_jitter": (jittered, recording(jittered))}
    output = {"baseline_revision": revision, "seed": 917, "sample_rate_hz": fs,
              "reference_hz": 91., "measurements": {}, "completion": {}}
    for name, (times, signals) in cases.items():
        output["measurements"][name] = {"before": evaluate(baseline, times, signals, quiet),
                                         "after": evaluate(current, times, signals, quiet)}
    for name, frequencies, target in (
            ("stable_center", [109.98, 110.01, 110., 110.02, 109.99], 110.),
            ("variable_center", [109.6, 109.8, 110., 110.2, 110.4], 110.),
            ("rounded_boundary", [109.78] * 5, 110.04)):
        output["completion"][name] = {"before": plan_case(baseline, frequencies, target),
                                      "after": plan_case(current, frequencies, target)}
    print(json.dumps(output, indent=2, allow_nan=False))
    return output


if __name__ == "__main__":
    main()
