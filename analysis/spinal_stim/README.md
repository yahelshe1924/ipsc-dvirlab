# Intact spinal cord: stimulation and recording

## Artifact and baseline comparison

Run `python compare_baseline.py INPUT_FOLDER`. Outputs go to `baseline_comparison`:
`report.html`, raw artifact overlays, baseline-matched raster plots,
`sensitivity.csv` (thresholds 4/4.5/5 × baseline noise; post-pulse blanking 1/3/6 ms),
`artifact_summary.csv`, `baseline_rates.csv`, trial tables and `methods.json`.
The same baseline-derived absolute threshold is used within each preparation.
Baseline pseudo-pulses have the same count, median pulse duration, exclusion
mask and segmented filter as the respective stimulation recording. They are
spaced across the short baseline with reproducible jitter and are descriptive,
not independent controls. Compare valid exposure and noise ratios, not counts
alone. Settings cached in `cache` preserve REC and relevant hardware flags;
delete the cache to reread modified source files.

Artifact recovery is an operational heuristic: the first 2 ms with 0.5 ms
raw RMS and derivative RMS below empirical baseline 99.5-percentile limits,
after pulse and hardware flags end. A neural response can also exceed those
limits; an artifact can fall below them. Therefore this is not a validated
artifact/neural separation. Unresolved cases remain unresolved at 20 ms.
No extra software notch is applied in this analysis. Acquisition filtering
is retained. Five additional milliseconds per filtered segment edge remain
excluded and must not be confused with the measured raw recovery estimate.

## Spike candidates in REC

Run `python spikes.py INPUT_FOLDER` after installing requirements. This produces
`spike_results`: raster/PSTH/waveform plots, event timestamps, per-trial rates,
exposure-corrected histogram tables and noise/threshold metadata. REC is selected
by its saved custom label, not a hard-coded channel index.

Defaults: third-order Butterworth 300–5000 Hz, forward/backward filtering;
negative peaks beyond 4.5 times MAD/0.67449; minimum peak spacing 1 ms.
The spacing is a detection rule, not evidence of a single neuron's refractory
period. `--polarity both` detects either polarity. These are candidate events,
not sorted or verified neural units.

Each artifact-free segment is filtered independently. Current pulses are masked
from 1 ms before onset to 3 ms after current ends, including merged biphasic
phases; saved settle/recovery/compliance flags and near-rail samples are excluded.
An additional 5 ms is discarded at each filtered segment edge. Thus the earliest
post-stimulus interval is unobservable, not a zero spike count. PSTH divides by
actual valid exposure in each bin. Timestamp gaps split segments. Artifact tails
can persist longer: rerun with longer `--blank-ms` and compare thresholds such as
`--threshold 4`, `4.5`, `5`. Forward/backward filtering is noncausal; avoid using
these plots to infer submillisecond response onset. Stored pulse commands are
not an independent current measurement.

Paired trial CSV rates use valid time only; `isolated=False` marks windows close
to other pulses. No significance tests or biological-replicate pooling are done.
Assess repeatability, baseline activity, waveform shape and parameter sensitivity
before interpreting candidate counts as an evoked neural response.

Run with Python 3.10+ after `pip install -r requirements.txt`:

```powershell
python analyze.py 'G:\האחסון שלי\PhD results\Ex-Vivo (2026)\stim+read intact SC (111026)'
```

The official Intan reader is vendored unchanged from
https://github.com/Intan-Technologies/load-rhs-notebook-python (GPL-3.0, see COPYING).
Analysis is exploratory and uses the recorded amplifier signal, including any
acquisition filters and the reader's acquisition-matched notch filter.

## Outputs

- `overview.png`: min/max voltage envelopes and stored stimulation current.
- `*_locked.png`: individual pulse epochs, mean +/- SEM, and trial heatmap.
- `metadata.json`: detected pulse times, channels, and analysis settings.
- `summary.csv`: per-recording/channel counts, RMS, mean peak latency and rail fraction.

The saved custom labels were verified in all ten files: **REC = A-004**, **STIM = A-011**.
After analysis, run `python report.py` to create `results/report.html` with
the REC plots and a cross-recording summary. The initially generated plots use
the mean and SEM; rerunning the current analyzer also adds a median trace.

Stimulus timing comes from nonzero RHS stimulation samples, not filename labels.
Phases with gaps <=1 ms are grouped by default; check this against your protocol.
Default baseline is -20 to -1 ms, response 3 to 50 ms. Orange 0-3 ms is excluded
from response metrics but remains visible in plots. This is an initial choice,
not an established artifact duration. Change with `--blank-ms`, `--post-ms`,
`--pre-ms`, `--merge-ms`. Repeat with several blanking durations to assess
artifact sensitivity. No interpolation or extra filtering is performed.
Epochs with overlapping pulses, file boundaries or timestamp gaps are excluded.
If pulses are too frequent, shorten the windows; zero usable epochs means no
response conclusion is available. Baselines without stimulation get overview
plots and raw signal metrics only. Raw RMS includes artifacts and drift.

## Interpretation

Look for repeatable signals after the artifact, stable latency, and an amplitude
change with stimulus intensity *within the same preparation and electrode
configuration*. Compare recording channels separately from stimulating channels.
Stored current is the controller's saved command, not independent proof that
the intended current reached tissue. A time-locked waveform, high RMS ratio or
small SEM alone cannot distinguish evoked neural activity from electrical
artifact or amplifier recovery. SEM is across pulses, not biological replicates.
Peak latency is the absolute maximum of the mean in the response window, not
response onset or a conduction velocity. Rail fraction is a coarse clipping
screen at 6380 uV, not a complete amplifier-quality test.
Compliance, amplifier-settle and charge-recovery flags are loaded by the reader
but are not currently used to reject epochs; the fixed blanking interval must
therefore be checked against the actual pulse duration and amplifier recovery.

The two spinal cords are separate preparations. Do not pool their pulse counts
as independent biological samples. This script does not perform significance
tests or assert neural origin. Electrode mapping, pulse protocol, inspection of
artifact duration and appropriate controls are needed for that interpretation.
