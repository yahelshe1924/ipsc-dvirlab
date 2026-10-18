"""Stimulus-locked exploratory analysis of Intan RHS recordings (uV and uA)."""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent / '_packages'))
import argparse
import csv
import json
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from importrhsutilities import load_file


def onsets(active, gap):
    ix = np.flatnonzero(active)
    return ix[np.r_[True, np.diff(ix) > gap]] if ix.size else ix


def analyze(path, out, args):
    d, present = load_file(str(path))
    if not present:
        raise ValueError(f'No samples in {path}')
    fs = d['frequency_parameters']['amplifier_sample_rate']
    t, x, stim = d['t'], d['amplifier_data'], d['stim_data']
    names = [c['native_channel_name'] for c in d['amplifier_channels']]
    labels = {c['native_channel_name']: c['custom_channel_name'] for c in d['amplifier_channels']}
    folder = out / path.stem
    folder.mkdir(parents=True, exist_ok=True)
    gaps = int(np.count_nonzero(np.abs(np.diff(t) * fs - 1) > .1))
    active = np.any(stim != 0, axis=0)
    events = onsets(active, max(1, round(args.merge_ms * fs / 1000)))
    pre, post = round(args.pre_ms * fs / 1000), round(args.post_ms * fs / 1000)
    rel = np.arange(-pre, post) / fs * 1000
    baseline = (rel >= -args.pre_ms) & (rel < -1)
    response = (rel >= args.blank_ms) & (rel < args.post_ms)
    valid = []
    for e in events:
        if e < pre or e + post > len(t):
            continue
        # Reject epochs with another pulse in baseline or response window.
        others = events[events != e]
        if np.any((others >= e-pre) & (others < e+post)):
            continue
        if np.any(np.abs(np.diff(t[e-pre:e+post]) * fs - 1) > .1):
            continue
        valid.append(e)
    fig, ax = plt.subplots(2, 1, figsize=(13, 6), sharex=True)
    step = max(1, len(t) // 15000)
    # Min/max envelope preserves brief artifacts missed by simple downsampling.
    n = len(t)//step
    xx = x[:, :n*step].reshape(len(x), n, step)
    tt = t[:n*step:step]
    for c, name in enumerate(names):
        ax[0].fill_between(tt, xx[c].min(1), xx[c].max(1), alpha=.35, label=name)
    ax[0].set(ylabel='Recorded voltage (uV)', title=path.stem)
    ax[0].legend(ncol=8, fontsize=7)
    for c in range(len(stim)):
        if np.any(stim[c]):
            ax[1].plot(t, stim[c], label=names[c])
    ax[1].set(xlabel='Time (s)', ylabel='Stored stimulus (uA)')
    fig.tight_layout(); fig.savefig(folder/'overview.png', dpi=140); plt.close(fig)
    rows = []
    for c, name in enumerate(names):
        row = dict(recording=path.stem, channel=name, custom_label=labels[name], fs=fs, duration_s=len(t)/fs,
                   pulses=len(events), usable_epochs=len(valid), timestamp_gaps=gaps,
                   stimulus_peak_uA=float(np.max(np.abs(stim))),
                   raw_rms_uV=float(np.std(x[c])), rail_fraction=float(np.mean(np.abs(x[c]) >= 6380)))
        if valid:
            ep = np.stack([x[c, e-pre:e+post] for e in valid])
            ep -= np.mean(ep[:, baseline], axis=1, keepdims=True)
            mean = ep.mean(0)
            b = np.sqrt(np.mean(ep[:, baseline]**2, axis=1))
            r = np.sqrt(np.mean(ep[:, response]**2, axis=1))
            peak = np.flatnonzero(response)[np.argmax(np.abs(mean[response]))]
            row.update(baseline_rms_uV=float(np.median(b)), response_rms_uV=float(np.median(r)),
                       rms_ratio=float(np.median(r)/max(np.median(b), 1e-12)),
                       mean_peak_uV=float(mean[peak]), peak_latency_ms=float(rel[peak]))
            fig, ax = plt.subplots(2, 1, figsize=(9, 7), sharex=True)
            ax[0].plot(rel, ep[:100].T, color='gray', alpha=.15, lw=.5)
            ax[0].plot(rel, mean, color='navy', label=f'Mean; n={len(ep)}')
            ax[0].plot(rel, np.median(ep,axis=0), color='teal', lw=1, label='Median')
            if len(ep)>1:
                sem = ep.std(0, ddof=1)/np.sqrt(len(ep))
                ax[0].fill_between(rel, mean-sem, mean+sem, alpha=.3)
            ax[0].set(ylabel='Baseline-subtracted uV', title=f'{path.stem} | {name}')
            ax[0].legend()
            lim = max(float(np.percentile(np.abs(ep), 98)), 1)
            im=ax[1].imshow(ep, aspect='auto', extent=[rel[0], rel[-1], len(ep), 0],
                            cmap='RdBu_r', vmin=-lim, vmax=lim, interpolation='nearest')
            fig.colorbar(im, ax=ax[1], label='uV (color clipped at 98th percentile)')
            ax[1].set(xlabel='Time from stored stimulus onset (ms)', ylabel='Pulse number')
            for a in ax:
                a.axvspan(0, args.blank_ms, color='orange', alpha=.25)
                a.axvline(0, color='black', lw=.7)
            fig.tight_layout(); fig.savefig(folder/f'{name}_locked.png', dpi=140); plt.close(fig)
        rows.append(row)
    metadata = dict(file=str(path), parameters=vars(args), channels=names, channel_labels=labels,
                    stimulus_channels=[names[i] for i in range(len(stim)) if np.any(stim[i])],
                    events_s=t[events].tolist(), notes=d.get('notes', {}))
    (folder/'metadata.json').write_text(json.dumps(metadata, indent=2, default=str), encoding='utf-8')
    return rows


def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('input', type=Path)
    p.add_argument('--output', type=Path, default=Path(__file__).parent/'results')
    p.add_argument('--pre-ms', type=float, default=20)
    p.add_argument('--post-ms', type=float, default=50)
    p.add_argument('--blank-ms', type=float, default=3)
    p.add_argument('--merge-ms', type=float, default=1, help='Merge phases separated by <= this gap')
    a=p.parse_args()
    if not (a.pre_ms>1 and 0<=a.blank_ms<a.post_ms and a.merge_ms>0):
        p.error('Require pre>1, 0<=blank<post, merge>0')
    files=sorted(a.input.rglob('*.rhs')) if a.input.is_dir() else [a.input]
    if not files: p.error('No RHS files found')
    a.output.mkdir(parents=True, exist_ok=True)
    rows=[]
    for f in files: rows.extend(analyze(f, a.output, a))
    fields=list(dict.fromkeys(k for r in rows for k in r))
    with (a.output/'summary.csv').open('w', newline='', encoding='utf-8-sig') as f:
        w=csv.DictWriter(f, fieldnames=fields); w.writeheader(); w.writerows(rows)
    plot_summary(rows, a.output)
    print(f'Results: {a.output.resolve()}')


def plot_summary(rows, out):
    recordings=list(dict.fromkeys(r['recording'] for r in rows if 'rms_ratio' in r))
    channels=list(dict.fromkeys(r['channel'] for r in rows))
    if not recordings: return
    matrix=np.full((len(recordings),len(channels)), np.nan)
    for r in rows:
        if 'rms_ratio' in r:
            matrix[recordings.index(r['recording']),channels.index(r['channel'])]=r['rms_ratio']
    fig,ax=plt.subplots(figsize=(15,6))
    im=ax.imshow(matrix, aspect='auto', cmap='viridis', vmin=0, vmax=max(2,float(np.nanpercentile(matrix,95))))
    ax.set_xticks(range(len(channels)),channels, rotation=90)
    ax.set_yticks(range(len(recordings)),recordings)
    ax.set_title('Median post-stimulus RMS / median pre-stimulus RMS; descriptive, includes residual artifacts')
    fig.colorbar(im,ax=ax,label='RMS ratio (upper color scale clipped)')
    fig.tight_layout(); fig.savefig(out/'response_comparison.png',dpi=150); plt.close(fig)


if __name__=='__main__': main()
