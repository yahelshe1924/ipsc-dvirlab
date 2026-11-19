# October 18, 2026: paired intact/cut spinal cord

Run with the Python environment used for `../spinal_stim` (numpy, scipy,
matplotlib and Intan's official `importrhsutilities.py`):

```powershell
python analyze_experiment.py 'G:\האחסון שלי\PhD results\Ex-Vivo (2026)\stim+read intact+cut SC (181026)'
python diagnose_interference.py
python check_analysis.py
```

`rhs_io.py` uses the official header decoder and validates the first block of
every source file against Intan's decoder. It memory maps the complete RHS
layout but copies only REC, STIM and three diagnostic channels. Acquisition
filtering remains present; no additional software notch is applied. Cached
data are invalidated when source file size or modification time changes.
Continuity and selected channel headers must agree before split files join.

Chronological assignment was authorized by the experimenter: each group of six
sessions comprises intact 5/20/100 uA, then cut 5/20/100 uA. The sessions named
sc2 intact at 13:18 and 13:20 therefore belong to SC3 intact. Original names
remain in the manifest. The cut was between STIM and REC. The platinum REC tip
remained in the tissue at the same location after cutting, per the experimenter.

See `results/report.html`. CSV files contain the full manifest, initial-baseline
noise references, primary matched pre/post counts, spectral and impedance
metrics, and all 972 sensitivity rows. Candidate events and full-resolution
raw epochs are saved per session. Fixed thresholds come from the initial
no-stimulation segment of intact 5 uA per preparation. Primary comparisons use
the exact same valid sample offsets mirrored before/after onset (10–100 ms).
Noise references include the acquisition-start transient, but MAD is robust to
a short transient; whole-recording QC plots expose that transient explicitly.

Sensitivity settings: 4/4.5/5 times reference noise; 1/3/6 ms exclusion after
pulse/hardware-flag end; 2/5 ms additional filtering-edge exclusion; windows
2–10, 10–100 and 100–300 ms. Early-window exposure can be mostly missing.
Threshold events are not sorted or confirmed neural spikes. Trial-bootstrap
intervals are descriptive within a recording, not uncertainty across animals;
all-zero intervals do not establish biological absence.

Reported impedance is not taken as proof of connection or disconnection.
The spectral diagnostic measures the fraction of 300–5000 Hz PSD within ±2 Hz
of 50 Hz harmonics, using initial no-stimulus segments after 0.2 s. These short
segments limit spectral precision (especially SC1 intact 100 uA). A-003's
physical connection is unknown. Correlation with it supports shared pickup but
cannot establish a source. Immediate 0–0.8 ms waveform peaks overlap current
delivery and are **not** treated as neural response measures.
