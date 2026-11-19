# November 1, 2026 — intact/cut spinal cord analysis

Uses numpy, scipy and matplotlib in the sibling `spinal_stim/_packages` folder
and Intan's official RHS reader (license in `../spinal_stim/COPYING`).
`rhs_io.py` validates the first block of every source against Intan's decoder
and joins split files only after timestamp and selected-header consistency
checks. Cached files are invalidated by source size/modification changes.

```powershell
python run_analysis.py 'G:\האחסון שלי\PhD results\Ex-Vivo (2026)\stim+read intact+cut SC (011126)'
python additional_checks.py
python recovery_audit.py
python check_results.py
```

Run in that order. The last two processing scripts append audits to the report;
rerun `run_analysis.py` first to rebuild rather than append duplicate sections.
Processing reuses reviewed functions in `../spinal_stim_181026/analyze_experiment.py`.
Results are in `results/report.html`; source recordings are unchanged.

REC is A-010 and STIM is A-004 for this experiment. Do not reuse the previous
experiment's channel numbers. Preparation/state come from folder labels;
current amplitude is independently checked from every decoded pulse. The
SC2 cut 100 uA folder contains an RHS filename saying 5 uA, but stored commands
are 100 uA. This discrepancy is preserved in methods.json and the report.

The initial detector uses a common baseline-derived threshold per preparation,
negative peak candidates and mirrored clean pre/post samples. Baselines exclude
the first 0.2 s and final 20 ms before current delivery. Acquisition filters are
retained; no extra software notch, interpolation or artifact subtraction is used.
Initial thresholds/windows do not automatically exclude long amplifier recovery.
See the additional recovery audit before interpreting candidates as neural.

Recovery rejection is conservative and not a validated neural/artifact separator:
raw excursions above max(1000 uV, 10 × pre-pulse raw MAD noise) trigger rejection
until the raw envelope is within max(150 uV, 5 × pre-pulse raw noise) for 5 ms
with no hardware flags, up to 300 ms. Add 3 ms rejection plus 5 ms filter guard.
This can discard true responses; no usable exposure means no conclusion, not
zero activity. No inference of biological silence follows from missing data.

Inputs bridged through copper are not independent electrode measurements.
Zero header impedance values are missing/unusable measurements, not zero ohms.
ND2 files are inventoried but not interpreted as proof of functional conduction
or anatomical completeness of the cut. The experimenter confirmed a cut between
STIM/REC and fixed electrode/copper positions throughout intact/cut measurements.

The report separates the initial fixed-window detector from the recovery audit.
Trial-bootstrap intervals reflect only repeatability within a recording and are
not biological-replicate intervals or proof of neural origin. Voltage-compliance
flags constrain whether a requested current could be maintained; absence of flags
does not independently verify current delivery.
