# PBS stimulation artifact control — 2 November 2026

```powershell
python analyze_pbs.py 'G:\האחסון שלי\PhD results\Ex-Vivo (2026)\stim+read intact+cut SC (011126)'
python check_results.py
```

Only folders named `stim test PBS*` are included. Existing tissue analyses are
unchanged. Uses numpy/scipy/matplotlib and the official Intan reader from sibling
`spinal_stim`, with processing helpers from `spinal_stim_181026`. The fast reader
validates every source's first block against Intan's official decoder. No extra
software notch or interpolation is applied; acquisition bandwidth is retained.

The updated dataset contains nine recordings / 450 pulses, including verified
1, 2 and corrected 4 uA tests. The corrected 4 uA file at 12:07:56 replaces an
earlier mislabeled recording at 11:58:54 that contained 2 uA. Declared and actual
amplitudes are preserved separately in the output tables; stale cached sources
are not automatically included in the analysis.

Three later recordings after cage grounding are annotated separately in
`session_annotations.json`. Their folder labels all say 5 uA, but actual currents
are 5/1/2 uA. Run `python compare_cage.py INPUT_FOLDER` and `python check_cage.py`
for the matched 1/2/5 uA comparison in `results/cage_comparison/report.html`.
The original settle off/on script excludes these annotations to avoid mixing
grounding and settle effects. `compare_cage.py` links its report from the main
report; rerun the original report before it to avoid duplicate appended links.

Outputs: `results/report.html`, settings/flag/recovery/amplitude CSV tables,
per-pulse metrics, cached selected signals and full-resolution trial epochs.
One absolute negative-candidate threshold is derived from initial 5 uA PBS-off
baseline and used across all six recordings. There is no tissue, so none of
these events could be neuronal spikes. A lack of candidates at this high
threshold does not demonstrate a clean signal.

Local STIM settle and global settle change together. The experimenter confirmed
the same electrode, copper, reference and ground geometry in off/on recordings.
The sequential design cannot isolate slow drift from all treatment effects.
Both saved XML and recorded REC/STIM settle bits are checked. Voltage compliance
is assessed specifically during each current pulse. It is not a current meter.
DC amplifier waveforms were not saved.

Raw return: baseline subtract each pulse using -100 to -10 ms; envelope limit
max(150 uV, five times local pre-pulse robust raw sigma). Search 0.5 ms blocks
after pulse and settle end, excluding hardware flags. First-return metrics need
5 or 20 ms inside the envelope but can precede a later rebound. The stricter
tail metric requires staying inside the envelope to 500 ms, with at least 20 ms
observed after return. Unresolved trials stay missing. Neither measure validates
an artifact-free interval for small spikes, and conditional medians must always
be read with the resolved-trial denominator.

Residual amplitude is reported separately in 2–10, 10–100, 100–300 and 300–500 ms
windows. Raw amplitude and filtered candidate metrics answer different questions.
No PBS template was subtracted from tissue recordings; electrical boundary
conditions differ when tissue is present. Shared inputs are not independent
electrode controls.
