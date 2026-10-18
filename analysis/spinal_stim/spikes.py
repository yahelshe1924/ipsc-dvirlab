"""Exploratory extracellular spike-event analysis; not spike sorting.

Run: python spikes.py INPUT_FOLDER --output spike_results
Requires numpy, matplotlib, scipy. Uses the official Intan RHS reader.
"""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent / '_packages'))
import argparse
import csv
import json
import html
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from scipy.signal import butter, sosfiltfilt, find_peaks
from importrhsutilities import load_file


def runs(mask):
    edges = np.diff(np.r_[False, mask, False].astype(int))
    return zip(np.flatnonzero(edges == 1), np.flatnonzero(edges == -1))


def process(file, out, a):
    d, present = load_file(str(file))
    if not present:
        raise ValueError(f'No signal: {file}')
    fs = float(d['frequency_parameters']['amplifier_sample_rate'])
    if not 0 < a.low < a.high < fs / 2:
        raise ValueError(f'Invalid band for sampling rate {fs}')
    channels = d['amplifier_channels']
    matches = [i for i, c in enumerate(channels)
               if a.channel.lower() in (c['native_channel_name'].lower(), c['custom_channel_name'].lower())]
    if len(matches) != 1:
        raise ValueError(f'Expected one channel named {a.channel}, found {len(matches)}')
    c = matches[0]
    x = np.asarray(d['amplifier_data'][c], dtype=float)
    t = np.asarray(d['t'])
    active = np.any(d['stim_data'] != 0, axis=0)
    pulse_runs = list(runs(active))
    starts = np.array([s for s, e in pulse_runs], dtype=int)
    if len(starts):
        # Group phases using the gap from the previous phase's end.
        grouped = [pulse_runs[0]]
        for s, e in pulse_runs[1:]:
            if s - grouped[-1][1] <= round(a.merge_ms * fs / 1000):
                grouped[-1] = (grouped[-1][0], e)
            else:
                grouped.append((s, e))
        starts = np.array([s for s, e in grouped], dtype=int)
    else:
        grouped = []
    valid = np.isfinite(x) & (np.abs(x) < 6380)
    # Mask current delivery, pre-artifact, post-current recovery and saved hardware flags.
    for s, e in grouped:
        valid[max(0,s-round(a.pre_blank_ms*fs/1000)):min(len(x),e+round(a.blank_ms*fs/1000))] = False
    for key in ('amp_settle_data', 'charge_recovery_data', 'compliance_limit_data'):
        if key in d:
            flagged = np.any(d[key], axis=0)
            for s, e in runs(flagged):
                valid[max(0,s-round(a.pre_blank_ms*fs/1000)):min(len(x),e+round(a.blank_ms*fs/1000))] = False
    # Split at timestamp discontinuities: never filter across a gap.
    gaps = np.flatnonzero(np.abs(np.diff(t)*fs-1) > .1)+1
    valid[gaps] = False
    y = np.full(len(x), np.nan)
    sos = butter(3, [a.low, a.high], btype='bandpass', fs=fs, output='sos')
    guard = round(a.guard_ms*fs/1000)
    for s, e in runs(valid):
        if e-s <= max(100,2*guard+1):
            continue
        # Filter separate clean segments; artifact samples never enter the filter.
        z = sosfiltfilt(sos,x[s:e])
        y[s+guard:e-guard] = z[guard:len(z)-guard] if guard else z
    clean = np.isfinite(y)
    # Prefer pre-stimulus samples for a common recording-level threshold.
    noise_mask = np.zeros(len(x),bool)
    for s in starts:
        noise_mask[max(0,s-round(a.window_ms*fs/1000)):max(0,s-round(a.pre_blank_ms*fs/1000))] = True
    noise_mask &= clean
    source = 'pre-stimulus'
    if noise_mask.sum() < fs:
        noise_mask = clean
        source = 'all valid samples (less than 1 s pre-stimulus available)'
    values = y[noise_mask]
    if len(values) < 100:
        raise ValueError(f'Insufficient clean data: {file}')
    sigma = float(np.median(np.abs(values-np.median(values)))/0.67448975)
    if sigma <= 0:
        raise ValueError(f'Zero noise estimate: {file}')
    threshold = a.threshold*sigma
    events = []
    for s,e in runs(clean):
        # Negative peaks by default; optional absolute peaks for either polarity.
        z = -y[s:e] if a.polarity == 'negative' else np.abs(y[s:e])
        ix,_ = find_peaks(z,height=threshold,distance=max(1,round(a.refractory_ms*fs/1000)))
        events.extend((ix+s).tolist())
    events=np.array(events,dtype=int)
    folder=out/file.stem
    folder.mkdir(parents=True,exist_ok=True)
    with (folder/'events.csv').open('w',newline='') as f:
        w=csv.writer(f);w.writerow(['sample','time_s','filtered_peak_uV'])
        w.writerows((int(i),float(t[i]),float(y[i])) for i in events)
    # Exposure-corrected histogram: excluded time is not treated as zero activity.
    edges=np.linspace(-a.window_ms,a.window_ms,2*a.bins+1)
    counts=np.zeros(len(edges)-1); exposure=np.zeros_like(counts)
    raster=[]; trial_rows=[]
    for trial,s in enumerate(starts):
        rel=(t[events]-t[s])*1000
        near=rel[(rel>=edges[0]) & (rel<edges[-1])]
        raster.append(near)
        counts+=np.histogram(near,edges)[0]
        lo=max(0,s-round(a.window_ms*fs/1000));hi=min(len(t),s+round(a.window_ms*fs/1000))
        rt=(t[lo:hi]-t[s])*1000
        exposure+=np.histogram(rt[clean[lo:hi]],edges)[0]/fs
        # Exclude overlapping stimulus windows from paired pre/post comparison.
        isolated=not np.any((starts!=s)&(np.abs(starts-s)<2*a.window_ms*fs/1000))
        b=(rt<-a.pre_blank_ms)&(rt>=-a.window_ms)&clean[lo:hi]
        p=(rt>=a.blank_ms+a.guard_ms)&(rt<a.window_ms)&clean[lo:hi]
        bt=b.sum()/fs;pt=p.sum()/fs
        bn=np.count_nonzero((near>=-a.window_ms)&(near<-a.pre_blank_ms))
        pn=np.count_nonzero((near>=a.blank_ms+a.guard_ms)&(near<a.window_ms))
        trial_rows.append(dict(trial=trial+1,onset_s=float(t[s]),isolated=isolated,
                               pre_exposure_s=bt,post_exposure_s=pt,
                               pre_rate_hz=bn/bt if bt else None,post_rate_hz=pn/pt if pt else None))
    fig,ax=plt.subplots(3,1,figsize=(11,10))
    if raster:
        ax[0].eventplot(raster,linelengths=.8)
        ax[0].set_ylim(-.5,len(raster)-.5)
        ax[0].axvline(0,color='red');ax[0].set(xlim=(edges[0],edges[-1]),ylabel='Pulse index',title=file.stem+' | REC spike candidates')
        rate=np.divide(counts,exposure,out=np.full_like(counts,np.nan),where=exposure>0)
        ax[1].stairs(rate,edges)
        ax[1].axvline(0,color='red');ax[1].set(xlabel='Time from stored stimulus onset (ms)',ylabel='Candidate events/s')
    else:
        ax[0].text(.1,.5,'No stored stimulation: baseline recording',transform=ax[0].transAxes)
        ax[1].text(.1,.5,f'{len(events)} candidates / {clean.sum()/fs:.2f} valid s',transform=ax[1].transAxes)
    before=round(.7*fs/1000);after=round(1.5*fs/1000)
    wave=[y[i-before:i+after] for i in events if i>=before and i+after<=len(y) and np.all(clean[i-before:i+after])]
    if wave:
        wave=np.array(wave)
        wt=np.arange(-before,after)/fs*1000
        ax[2].plot(wt,wave[:200].T,color='gray',alpha=.15,lw=.6)
        ax[2].plot(wt,np.median(wave,axis=0),color='navy',label='Median')
        ax[2].legend()
    ax[2].set(xlabel='Time from detected peak (ms)',ylabel='Filtered uV',title='Candidates across entire recording; not sorted units')
    fig.tight_layout();fig.savefig(folder/'spikes.png',dpi=150);plt.close(fig)
    if trial_rows:
        with (folder/'trials.csv').open('w',newline='') as f:
            w=csv.DictWriter(f,fieldnames=list(trial_rows[0]));w.writeheader();w.writerows(trial_rows)
    with (folder/'psth.csv').open('w',newline='') as f:
        w=csv.writer(f);w.writerow(['left_ms','right_ms','count','valid_exposure_s','rate_hz'])
        w.writerows((l,r,n,ex,n/ex if ex else '') for l,r,n,ex in zip(edges[:-1],edges[1:],counts,exposure))
    meta=dict(file=str(file),channel=channels[c],parameters=vars(a),noise_sigma_uV=sigma,
              threshold_uV=threshold,noise_source=source,pulses=len(starts),candidates=len(events),
              valid_duration_s=float(clean.sum()/fs),timestamp_gaps=len(gaps),
              warning='Threshold events are not confirmed neural spikes. Blanking plus filtering guards create unobservable intervals. No sorting or inferential testing.')
    (folder/'metadata.json').write_text(json.dumps(meta,indent=2,default=str),encoding='utf-8')
    return dict(recording=file.stem,pulses=len(starts),candidates=len(events),threshold_uV=threshold,
                valid_duration_s=float(clean.sum()/fs))


def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('input',type=Path)
    p.add_argument('--output',type=Path,default=Path(__file__).parent/'spike_results')
    p.add_argument('--channel',default='rec')
    p.add_argument('--low',type=float,default=300)
    p.add_argument('--high',type=float,default=5000)
    p.add_argument('--threshold',type=float,default=4.5)
    p.add_argument('--polarity',choices=['negative','both'],default='negative')
    p.add_argument('--refractory-ms',type=float,default=1)
    p.add_argument('--pre-blank-ms',type=float,default=1)
    p.add_argument('--blank-ms',type=float,default=3,help='Excluded time after END of current pulse')
    p.add_argument('--guard-ms',type=float,default=5,help='Additional discarded filter-edge time')
    p.add_argument('--merge-ms',type=float,default=1)
    p.add_argument('--window-ms',type=float,default=100)
    p.add_argument('--bins',type=int,default=20,help='Number of histogram bins on each side')
    a=p.parse_args()
    if min(a.threshold,a.refractory_ms,a.window_ms,a.bins)<=0 or min(a.pre_blank_ms,a.blank_ms,a.guard_ms,a.merge_ms)<0:
        p.error('Threshold, refractory, window and bins must be positive; exclusion durations nonnegative')
    files=sorted(a.input.rglob('*.rhs')) if a.input.is_dir() else [a.input]
    if not files:p.error('No RHS files found')
    a.output.mkdir(parents=True,exist_ok=True)
    rows=[process(f,a.output,a) for f in files]
    with (a.output/'summary.csv').open('w',newline='',encoding='utf-8-sig') as f:
        w=csv.DictWriter(f,fieldnames=list(rows[0]));w.writeheader();w.writerows(rows)
    write_report(a.output)


def write_report(out):
    parts=['<!doctype html><meta charset="utf-8"><title>REC spike candidates</title>',
           '<style>body{font:16px system-ui;max-width:1100px;margin:auto}img{width:100%}</style>',
           '<h1>REC: spike candidates relative to stimulation</h1>',
           '<p>Default 300–5000 Hz; negative threshold 4.5 × robust noise. '
           'Masked periods have no observation, not zero spikes. '
           'Waveforms show candidates from the entire recording; raster/PSTH show ±100 ms around pulses. '
           'Candidates are not confirmed neural spikes. Preparations must be interpreted separately.</p>']
    for folder in sorted(out.iterdir()):
        if folder.is_dir() and (folder/'metadata.json').exists():
            meta=json.loads((folder/'metadata.json').read_text(encoding='utf-8'))
            parts.extend(['<h2>'+html.escape(folder.name)+'</h2>',
                          f"<p>Pulses: {meta['pulses']}; candidates in entire recording: {meta['candidates']}; threshold: {meta['threshold_uV']:.2f} uV</p>",
                          '<img loading="lazy" src="'+html.escape(folder.name)+'/spikes.png">'])
    (out/'report.html').write_text('\n'.join(parts),encoding='utf-8')


if __name__=='__main__':main()
