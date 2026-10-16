# Local validation record

Date: 2026-10-16. Checkout: `/home/hermes/Chordata`, based on upstream
`db24b8602d068108c1da67d5a4acf8ee420480c3`. This records validation of the rewrite before publication to the fork.
The initial publication record is retained below; the final section records the
subsequent measurement and CAD changes.

## Executed

| Check | Result |
| --- | --- |
| Python unit/integration-contract tests | 44 passed on Python 3.12.13 |
| Synthetic signal and adjustment-planner checks, including current upstream | 48 passed |
| Chromium browser suite | Passed at 390 px and 1280 px |
| Installer tests | Included above: Klipper/Kalico layout, reruns, user settings/navigation preservation, malformed navigation, regular-file protection |
| Shell syntax, Python compilation, whitespace | Passed |
| Actual isolated Moonraker daemon | Component loaded; page 200; unauthenticated settings/review 401; trusted requests accepted; disabled AI review works with no Klippy connection |
| Private settings | Actual daemon saved with mode 0600; API omitted provider key |

Commands:

```sh
.venv/bin/python -m unittest discover -s tests -v
.venv/bin/python tests/test_belts.py
bash -n install.sh
.venv/bin/python -m compileall -q chordata.py chordata_belts.py moonraker
npm test
git diff --check
```

Local Chromium ran using the already installed headless-shell executable through
`CHROMIUM_EXECUTABLE`. The browser suite verifies that demo mode never opens a
WebSocket, that current belt samples replace prior samples, and that null rejected
frequencies remain visible in the table without invented chart points. It checks
CSV escaping, endpoint configuration, explicit provider-key clearing, session-only
Moonraker authentication, and invalidation of displayed AI advice on a new recording.
Moonraker API calls in that browser suite are simulated.

The separate real-daemon smoke check used Moonraker revision
`9e676eba6b02661a4dfa3ec6e7ac3f3504498e6d` in temporary directories, bound to
localhost with no Klippy socket. It exercised actual HTTP routing and authorization,
not a fake server. The daemon was stopped afterward. No installed printer service
or configuration was changed.

## Independent review

A subagent reviewed the measurement lifecycle, direct-command interlocks, installer,
UI and optional AI component, and added backend regression tests. It found that
completed AI advice remained visible after a new measurement. The UI now clears
that advice when measurements change and discards responses to outdated requests;
the browser regression passes. No blocking backend or installer defect remained in
that review. The final provider-key clear control has an additional browser test.

## Laya's contribution and limits

Native Laya selected the coding model and advised an architecture with deterministic
signal processing, optional asynchronous Moonraker review, and an extension of the
existing companion page. Laya Router was also consulted under the workspace policy.
Routing was advisory; the work's actual code, credential and printer-state boundaries
were checked independently.

Two live native Laya trials used the application's actual review question and
synthetic measurement summaries:

| Fixture | Selected answer | Confidence | Application treatment at 0.7 |
| --- | --- | --- | --- |
| Complete, consistent A/B pair | repeat | 0.1718 | Abstain |
| Partial pair with weak belt B | repeat | 0.1275 | Abstain |

The clean fixture did not receive the expected comparison answer. These trials
validate an uncertainty path, not classification accuracy. An independent subagent's
Laya review of the implementation evidence also abstained (confidence 0.0934).
A final evidence review also withheld its readiness answer (confidence 0.0674).
AI review therefore remains optional and experimental; numerical DSP remains the
measurement authority. No confidence value is presented as proof of code correctness.

Jev's coding-agent integration was unavailable because this checkout was not enrolled
and the private setup browser could not open. Native Laya remained available. The
application's Jev HTTP integration follows the current TypeSafe System One contract
and has request/response tests; no live Jev provider call was made.

## Still requires a physical printer

- Standalone recording and live sample arrival on the user's Klipper/Kalico version,
  accelerometer and host hardware.
- Comparison against reference recordings and known manufacturer targets.
- Mainsail sidebar/proxy behavior in the user's installation.
- Saved-position motion with the printer's actual coordinate offsets and travel limits.
- Labelled real recordings before treating AI quality advice as useful.

The original upstream real-recording and virtual-printer claims were not reproduced
as part of this rewrite. The publication checks GitHub Actions separately; the local
installer tests use temporary directories; the installer was not run on a real printer.

## Publication preparation

The fork adds a detailed illustrated user guide, troubleshooting reference and four
reproducible screenshots captured from the offline demo. They contain illustrative
data and no provider credentials. New installer update entries now follow
`alextverdyy/Chordata`; existing entries remain untouched and migration is documented.

The fork was created after upstream advanced to `b4b2adb47b199d265ccedd9223b6c73d09185191`.
Both newer upstream commits were merged before publication, retaining the tap's
per-mode ring duration, width and guard features. The combined analysis validator
accepts both plain frequency modes and the new ring objects; valid and invalid
ring-object regression cases were added. After integration, 44 Python tests, all
48 synthetic/planner checks, and the Chromium suite passed.

## Follow-up: sampling reliability, spectrum and CAD tutorial

The follow-up branch `feature/reliable-spectrum-guide` adds deterministic input
integrity and completion checks, a measured recent-window spectrum, and an actual
official Trident CAD viewer with bundled Three.js. The earlier PR remains a separate
change. See [measurement methods and before/after evidence](MEASUREMENT_RELIABILITY.md)
and [CAD source/conversion](TRIDENT_CAD.md).

Independent review added regressions for dropped samples, quiet-reference integrity,
jitter, exact-frequency tolerance, repeatability, incomplete counts, spectrum bounds,
recent-window selection, gain normalization and silence. The recorded benchmark
reproduces the old 91 Hz → 89.9 Hz dropout error and shows rejection after the fix.
Subagent review also independently matched the source archive's Git blob identity
to the pinned official repository, and tested nested translation/rotation handling
in the mesh converter.

Laya was consulted for the architecture and bounded review questions. It ranked the
single-app architecture highest but abstained at low confidence; the deployment
choice follows the user's preference and the existing Moonraker companion. Laya
did not validate physical accuracy. The engineering claims rest on the reproducible
regressions, source inspection and browser/runtime checks.

### Executed follow-up checks

| Check | Result |
| --- | --- |
| Python unit/integration-contract tests | 65 passed on Python 3.12.13 |
| Existing synthetic signal and planner checks | 48 passed |
| Browser suites | All four passed: page, spectrum, CAD guide and independent CAD integration |
| Actual CAD | Official pinned STEP converted; 373,377 triangles, 27 mesh groups, 8,799,064-byte self-contained GLB; source and asset checksum tests passed |
| Viewer behavior | Real WebGL2 render, local lazy loading, keyboard orbit, camera focus, isolation, x-ray, sensor scrub, hidden pause, reduced motion, context loss and written fallback |
| Mobile/desktop | Browser layout checks at 390 px and 1100/1280 px; updated spectrum and CAD screenshots visually inspected |
| Actual isolated Moonraker | JavaScript and GLB returned 200, correct MIME types and matching checksums; unauthenticated settings/review returned 401; trusted disabled review returned without a provider |
| Shell syntax, Python compilation, whitespace | Passed |

The temporary Moonraker daemon was stopped after the check. No printer service was
changed. The design detector reported one existing warning about tight line height
in the large numeric readings; no new finding was reported for the guide or spectrum.
Whitespace checking excludes the generated Three.js bundle's upstream shader
strings through `.gitattributes`; CI verifies the bundle by rebuilding it.

A final native Laya evidence review withheld both answers at the 0.7 threshold:
next-validation choice confidence 0.0143, calibrated-accuracy boolean confidence
0.5951. This inconclusive advice does not replace tests or physical validation.
No live Jev provider call was made. Real printer recordings, calibrated frequency
comparison and performance on the intended printer host remain unverified.
