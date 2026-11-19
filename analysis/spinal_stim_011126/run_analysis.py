"""November 1 paired intact/cut analysis with verified channel/current mapping.

Threshold crossings are candidate events, not verified neural spikes. Shared
electrode inputs are not independent biological or recording replicates.
"""
from pathlib import Path
import sys
import importlib.util
import argparse
import csv
import json
import re
import html
import rhs_io
import numpy as np
from scipy.signal import welch
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

CORE_PATH=Path(__file__).resolve().parents[1]/'spinal_stim_181026'/'analyze_experiment.py'
spec=importlib.util.spec_from_file_location('validated_core',CORE_PATH)
core=importlib.util.module_from_spec(spec);spec.loader.exec_module(core)


def normalize_rows(rows):
    keys=list(dict.fromkeys(k for r in rows for k in r))
    return [{k:r.get(k,'') for k in keys} for r in rows]


def psth(y,events,groups,fs):
    edges=np.arange(-100,205,5);counts=np.zeros(len(edges)-1);ex=np.zeros_like(counts)
    ras=[]
    for s,e in groups:
        local=events[(events>=s-round(.1*fs))&(events<s+round(.2*fs))]
        rel=(local-s)/fs*1000;ras.append(rel);counts+=np.histogram(rel,edges)[0]
        lo=max(0,s-round(.1*fs));hi=min(len(y),s+round(.2*fs))
        tt=(np.arange(lo,hi)-s)/fs*1000
        ex+=np.histogram(tt[np.isfinite(y[lo:hi])],edges)[0]/fs
    rate=np.divide(counts,ex,out=np.full_like(counts,np.nan),where=ex>0)
    return edges,counts,ex,rate,ras


def waveform_figure(r,out):
    d=r['data'];fs=float(d['fs']);y=r['filtered'];events=r['events']
    first=d['groups'][0][0]
    # Same scale and same threshold for initial baseline and late train segment.
    a=max(round(.2*fs),first-round(.55*fs));b=min(first-round(.02*fs),a+round(.3*fs))
    center=d['groups'][min(10,len(d['groups'])-1)][0]+round(.015*fs)
    windows=[(a,b,'Initial no-stimulation segment'),(center,min(len(y),center+(b-a)),'Train segment after a pulse')]
    fig,ax=plt.subplots(2,2,figsize=(13,6),sharey='row')
    for col,(s,e,label) in enumerate(windows):
        tt=(np.arange(s,e)-s)/fs*1000
        ax[0,col].plot(tt,d['x'][0,s:e],lw=.6)
        ax[1,col].plot(tt,y[s:e],lw=.6)
        ax[1,col].axhline(-r['threshold'],color='red',ls='--',label=f'-{r["threshold"]:.2f} uV')
        ax[0,col].set_title(label);ax[1,col].set_xlabel('Time within segment (ms)');ax[1,col].legend(fontsize=8)
    ax[0,0].set_ylabel('Raw REC (uV)');ax[1,0].set_ylabel('300-5000 Hz REC (uV)')
    fig.suptitle(r['name']);fig.tight_layout();fig.savefig(out/(r['name']+'_traces.png'),dpi=130);plt.close(fig)


def spectral_metrics(r):
    d=r['data'];fs=float(d['fs']);first=d['groups'][0][0]
    lo=round(.2*fs);hi=first-round(.02*fs)
    if hi-lo<.1*fs:return {},None
    x=d['x'][:,lo:hi];nperseg=min(round(fs),x.shape[1])
    freq,power=welch(x,fs=fs,nperseg=nperseg,nfft=round(fs),axis=1)
    band=(freq>=300)&(freq<=5000)
    harmonic=band&(np.abs(freq/50-np.round(freq/50))<=2.01/50)
    peak=np.flatnonzero(band)[np.argmax(power[0,band])]
    row=dict(recording=r['name'],prep=r['prep'],state=r['state'],current_uA=r['current_label'],
             initial_segment_s=x.shape[1]/fs,initial_raw_std_uV=float(np.std(x[0])),
             harmonic_power_fraction=float(power[0,harmonic].sum()/power[0,band].sum()),
             peak_frequency_Hz=float(freq[peak]),rec_A003_correlation=float(np.corrcoef(x[0],x[-1])[0,1]),
             shared_input_warning='Connection of diagnostic channels unknown; correlation is not independent evidence of interference')
    return row,(freq,power)


def report(out,records,manifest,primary,quality,refs,spectra,immediate,issues):
    parts=['<!doctype html><meta charset="utf-8"><title>Spinal cord — 1 November 2026</title>',
           '<style>body{font:16px system-ui;max-width:1200px;margin:30px auto;color:#182738}img{width:100%}table{border-collapse:collapse;font-size:14px}td,th{padding:7px;border:1px solid #bbb}p{line-height:1.5}.note{padding:15px;background:#fff2d0}</style>',
           '<h1>Three intact/cut spinal cords — 1 November 2026</h1>',
           '<p class="note">New platinum electrodes; REC = A-010, STIM = A-004. Each electrode connects to multiple headstage pins through a separate copper conductor. Connections and electrode positions remained fixed within the experiment; cut between STIM and REC confirmed by the experimenter. Shared inputs are not independent recordings. Header impedance values are zero placeholders, not evidence of zero electrode impedance. No separate impedance files were found.</p>',
           '<p>Actual currents and pulse times are decoded from RHS data; source names remain in manifest.csv. Split files are joined only after continuity checks. No extra notch or template subtraction. Initial baseline is short and precedes this recording, but may follow earlier stimulation sessions.</p>',
           '<p>Same threshold within each preparation: 4.5 × MAD/0.67449 from initial intact 5 uA segment, excluding the first 0.2 s and final 20 ms before current onset. Fallback pre-pulse reference is explicitly recorded if needed. Negative peaks, minimum separation 1 ms; third-order 300–5000 Hz Butterworth, forward/backward on separate clean segments. Current/hardware flags masked until 3 ms after end, then 5 ms additional filter-edge guard.</p>',
           '<p>Primary comparison: 10–100 ms after onset versus mirrored -100 to -10 ms before onset, using identical valid sample offsets. Sensitivity: thresholds 4/4.5/5; recovery exclusions 1/3/6 ms; guards 2/5 ms; windows 2–10, 10–100, 100–300 ms. Missing early observations are not zeros. Trial-bootstrap intervals are within-recording descriptive intervals, not biological uncertainty or proof of neural origin. Candidate waveforms and artifacts require inspection.</p>']
    if issues:parts.append('<p class="note">File/protocol checks: '+'; '.join(html.escape(i) for i in issues)+'</p>')
    parts+=['<h2>Paired responses</h2><img src="paired_response.png">',
            '<table><tr><th>SC</th><th>State</th><th>Actual uA</th><th>Pulses</th><th>Before Hz</th><th>After Hz</th><th>After-before Hz</th><th>Post trials with events</th><th>Noise/reference</th></tr>']
    for row in primary:
        q=next(q for q in quality if q['recording']==row['recording']);m=next(m for m in manifest if m['recording']==row['recording'])
        parts.append(f'<tr><td>{row["prep"]}</td><td>{row["state"]}</td><td>{row["current_uA"]}</td><td>{m["pulses"]}</td><td>{row["pre_hz"]:.2f}</td><td>{row["post_hz"]:.2f}</td><td>{row["delta_hz"]:.2f}</td><td>{row["responding_trials"]}/{row["usable_trials"]}</td><td>{q["sigma_ratio_to_reference"]:.2f}</td></tr>')
    parts+=['</table><h2>Immediate component</h2><p>These raw waveforms overlap current delivery. Persistence after cutting supports artifact interpretation for a component, not absence of all neural activation.</p><img src="immediate_intact_cut.png">',
            '<h2>Initial no-stimulation spectra</h2><p>Fraction near 50 Hz harmonics is measured within ±2 Hz of harmonic frequencies, relative to 300–5000 Hz power. Short baselines limit spectral precision. Diagnostic channels may be physically joined, so correlation cannot be treated as an independent control.</p><img src="spectra.png">',
            '<h2>Pair plots</h2>']
    for prep in (1,2,3):
        for current in (5,20,100):
            f=out/'figures'/f'SC{prep}_{current}uA_pair.png'
            if f.exists():parts.append(f'<h3>SC{prep}, {current} uA</h3><img loading="lazy" src="figures/{f.name}">')
    parts.append('<h2>Whole-recording signal quality and equal-scale traces</h2>')
    for r in records:
        name=html.escape(r['name'])
        parts.append(f'<h3>{name}</h3><img loading="lazy" src="figures/{name}_QC.png"><img loading="lazy" src="figures/{name}_traces.png"><img loading="lazy" src="figures/{name}_candidates.png">')
    parts.append('<h2>Data and methods</h2><p>')
    parts.append(' · '.join(f'<a href="{f}">{f}</a>' for f in ['manifest.csv','threshold_references.csv','primary_summary.csv','sensitivity.csv','signal_quality.csv','spectral_quality.csv','immediate_component.csv','methods.json']))
    parts.append('</p>')
    (out/'report.html').write_text('\n'.join(parts),encoding='utf-8')


def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('input',type=Path);p.add_argument('--output',type=Path,default=Path(__file__).parent/'results');args=p.parse_args()
    out=args.output;out.mkdir(parents=True,exist_ok=True);figs=out/'figures';figs.mkdir(exist_ok=True)
    folders=sorted([f for f in args.input.iterdir() if f.is_dir() and list(f.glob('*.rhs'))],key=lambda f:f.name[-6:])
    records=[];manifest=[];issues=[]
    for folder in folders:
        match=re.search(r'sc([123])\s+(cut\s+)?(\d+)uA',folder.name,re.I)
        if not match:raise ValueError(f'Cannot map {folder.name}')
        prep=int(match[1]);state='cut' if match[2] else 'intact';declared=int(match[3])
        d,meta=rhs_io.load_session(folder,out/'cache');fs=float(d['fs']);d['groups']=core.groups_of_pulses(d['current'],fs)
        if not d['groups']:raise ValueError(f'No stored current pulses: {folder.name}')
        values=[float(np.max(np.abs(d['current'][s:e]))) for s,e in d['groups']]
        currents=sorted(set(round(v,3) for v in values))
        if len(currents)!=1:raise ValueError(f'Mixed current amplitudes in {folder.name}: {currents}')
        actual=min((5,20,100),key=lambda c:abs(c-currents[0]))
        if abs(actual-currents[0])>1:raise ValueError(f'Unexpected current {currents}: {folder.name}')
        if actual!=declared:issues.append(f'{folder.name}: folder says {declared} uA, stored current {currents[0]} uA')
        for file in meta['files']:
            label=re.search(r'(\d+)uA',Path(file['file']).name)
            if label and int(label[1])!=actual:issues.append(f'{Path(file["file"]).name}: filename current disagrees with stored {actual} uA')
            # A trailing split file may contain only post-train baseline.
            if set(file['active_stim_channels'])-{'A-004'}:raise ValueError(f'Unexpected active stimulation channels: {file}')
        r=dict(name=folder.name,prep=prep,state=state,current_label=actual,data=d,meta=meta);records.append(r)
        starts=np.array([s for s,e in d['groups']]);pulsewidth=[(e-s)/fs*1000 for s,e in d['groups']]
        row=dict(recording=folder.name,prep=prep,state=state,current_label_uA=declared,current_actual_uA=currents[0],
                 rhs_files=len(meta['files']),duration_s=len(d['ticks'])/fs,pulses=len(starts),
                 initial_no_stim_s=float(starts[0]/fs),post_last_pulse_s=float((len(d['ticks'])-d['groups'][-1][1])/fs),
                 pulse_width_ms=float(np.median(pulsewidth)),interval_s=float(np.median(np.diff(starts))/fs),
                 rec_channel=meta['files'][0]['selected_channels'][0]['native_channel_name'],stim_channel=meta['files'][0]['selected_channels'][1]['native_channel_name'],
                 timestamp_gaps=int(np.count_nonzero(np.diff(d['ticks'].astype(np.int64))!=1)),
                 compliance_rec_samples=int(np.count_nonzero(d['words'][0]&32768)),compliance_stim_samples=int(np.count_nonzero(d['words'][1]&32768)),
                 near_rail_rec_fraction=float(np.mean(np.abs(d['x'][0])>=6380)),
                 impedance_header_status='All selected impedance fields zero: no usable impedance measurement')
        manifest.append(row);print('MAPPED',prep,state,actual,len(starts),'baseline_s',row['initial_no_stim_s'],flush=True)
    core.save_csv(out/'manifest.csv',manifest)
    keys=[(r['prep'],r['state'],r['current_label']) for r in records]
    if len(set(keys))!=len(keys):issues.append('Duplicate actual-current condition: inspect manifest before combining')
    refs={};refrows=[]
    for prep in (1,2,3):
        r=next(r for r in records if (r['prep'],r['state'],r['current_label'])==(prep,'intact',5));d=r['data'];fs=float(d['fs'])
        y=core.filter_signal(d);first=d['groups'][0][0];v=y[round(.2*fs):max(round(.2*fs),first-round(.02*fs))]
        source='initial intact 5 uA no-stim segment, first 0.2 s and final 20 ms excluded'
        if np.isfinite(v).sum()<.5*fs:
            v=core.pre_values(y,d['groups'],fs);source='fallback intact 5 uA -200 to -20 ms pre-pulse samples'
        refs[prep]=core.robust_sigma(v)
        refrows.append(dict(prep=prep,reference_recording=r['name'],source=source,sigma_uV=refs[prep],valid_reference_s=float(np.isfinite(v).sum()/fs)))
    core.save_csv(out/'threshold_references.csv',refrows)
    sensitivity=[];primary=[];quality=[];spectra=[];immediate=[];rng=np.random.default_rng(112026);spec_data={}
    for r in records:
        d=r['data'];fs=float(d['fs']);r['sigma_ref']=refs[r['prep']];folder=out/r['name'];folder.mkdir(exist_ok=True)
        for blank in (1,3,6):
            for guard in (2,5):
                y=core.filter_signal(d,blank,guard)
                for mult in (4,4.5,5):
                    threshold=mult*r['sigma_ref'];events=core.detect(y,threshold,fs)
                    for low,high in ((2,10),(10,100),(100,300)):
                        stat,trials=core.paired_windows(y,events,d['groups'],fs,low,high)
                        row=dict(recording=r['name'],prep=r['prep'],state=r['state'],current_uA=r['current_label'],
                                 blank_ms=blank,guard_ms=guard,multiplier=mult,threshold_uV=threshold,
                                 window_start_ms=low,window_end_ms=high,**stat)
                        sensitivity.append(row)
                        if (blank,guard,mult,low)==(3,5,4.5,10):
                            r['filtered']=y;r['events']=events;r['threshold']=threshold
                            vals=np.array([t['delta_hz'] for t in trials if np.isfinite(t['delta_hz'])])
                            boot=rng.choice(vals,(2000,len(vals)),replace=True).mean(1)
                            primary.append(dict(**row,delta_trial_bootstrap_low=float(np.quantile(boot,.025)),delta_trial_bootstrap_high=float(np.quantile(boot,.975))))
                            core.save_csv(folder/'primary_trials.csv',trials)
        y=r['filtered'];events=r['events'];clean=np.isfinite(y);first=d['groups'][0][0]
        initial_mask=clean.copy();initial_mask[first:]=False;initial_mask[:round(.2*fs)]=False
        sigma=core.robust_sigma(core.pre_values(y,d['groups'],fs))
        quality.append(dict(recording=r['name'],prep=r['prep'],state=r['state'],current_uA=r['current_label'],
                            pre_pulse_sigma_uV=sigma,sigma_ratio_to_reference=sigma/r['sigma_ref'],
                            candidates_whole=len(events),whole_valid_s=float(clean.sum()/fs),initial_candidates=int(initial_mask[events].sum()),
                            initial_valid_s=float(initial_mask.sum()/fs),initial_sigma_uV=core.robust_sigma(y[initial_mask])))
        np.savez_compressed(folder/'candidate_events.npz',sample=events,time_s=events/fs,peak_uV=y[events])
        ep,rel,_=core.lock_epochs(d['x'][0],d['groups'],fs,20,100)
        np.savez_compressed(folder/'raw_epochs.npz',epochs_uV=ep,time_ms=rel)
        ep=ep-np.median(ep[:,(rel>=-20)&(rel<-2)],axis=1)[:,None]
        r['raw_mean']=ep.mean(0);r['raw_rel']=rel
        mask=(rel>=0)&(rel<.8)
        immediate.append(dict(recording=r['name'],prep=r['prep'],state=r['state'],current_uA=r['current_label'],
                              mean_peak_abs_0_0p8ms_uV=float(np.max(np.abs(r['raw_mean'][mask]))),not_neural_measure='Overlaps current delivery and artifact'))
        sp,spdata=spectral_metrics(r)
        if sp:spectra.append(sp);spec_data[r['name']]=spdata
        core.qc_plot(r,figs);waveform_figure(r,figs)
        # Waveforms are labeled by their timing, avoiding selection-only inference.
        before=round(.0007*fs);after=round(.0015*fs);event_phase=np.zeros(len(y),np.int8)
        for s,e in d['groups']:
            event_phase[max(0,s-round(.1*fs)):max(0,s-round(.01*fs))]=-1
            event_phase[s+round(.01*fs):min(len(y),s+round(.1*fs))]=1
        fig,ax=plt.subplots(1,2,figsize=(11,4),sharey=True)
        for a,phase,label in [(ax[0],-1,'Before pulses'),(ax[1],1,'After pulses (10-100 ms)')]:
            chosen=events[event_phase[events]==phase]
            wave=np.array([y[e-before:e+after] for e in chosen if e>=before and e+after<=len(y) and clean[e-before:e+after].all()])
            if len(wave):
                tt=np.arange(-before,after)/fs*1000;a.plot(tt,wave[:200].T,color='gray',alpha=.15,lw=.6);a.plot(tt,np.median(wave,axis=0),color='navy')
            a.set(title=f'{label}: {len(wave)} complete waveforms',xlabel='Time from negative peak (ms)')
        ax[0].set_ylabel('Filtered REC (uV)');fig.suptitle('Threshold-selected candidates; median spike-like shape alone does not establish neural origin')
        fig.tight_layout();fig.savefig(figs/(r['name']+'_candidates.png'),dpi=130);plt.close(fig)
        print('ANALYZED',r['prep'],r['state'],r['current_label'],'pre/post',primary[-1]['pre_n'],primary[-1]['post_n'],'noise ratio',quality[-1]['sigma_ratio_to_reference'],flush=True)
    for name,rows in [('sensitivity.csv',sensitivity),('primary_summary.csv',primary),('signal_quality.csv',quality),('spectral_quality.csv',spectra),('immediate_component.csv',immediate)]:core.save_csv(out/name,normalize_rows(rows))
    for prep in (1,2,3):
        for current in (5,20,100):core.summary_figure(records,prep,current,figs)
    fig,ax=plt.subplots(1,3,figsize=(13,4),sharey=True)
    for j,current in enumerate((5,20,100)):
        for prep in (1,2,3):
            pair=sorted([r for r in primary if r['prep']==prep and r['current_uA']==current],key=lambda r:r['state'],reverse=True)
            if len(pair)==2:ax[j].plot([0,1],[r['delta_hz'] for r in pair],'-o',label=f'SC{prep}')
        ax[j].axhline(0,color='black',ls='--',lw=.7);ax[j].set_xticks([0,1],['intact','cut']);ax[j].set_title(f'{current} uA');ax[j].legend()
    ax[0].set_ylabel('Post minus mirrored pre rate (candidates/s)');fig.suptitle('10-100 ms, fixed threshold within preparation; descriptive candidate counts')
    fig.tight_layout();fig.savefig(out/'paired_response.png',dpi=150);plt.close(fig)
    fig,ax=plt.subplots(3,3,figsize=(15,10),sharex=True,sharey=True)
    for r in records:
        aa=ax[r['prep']-1,(5,20,100).index(r['current_label'])];col='#2166ac' if r['state']=='intact' else '#b2182b'
        aa.plot(r['raw_rel'],r['raw_mean'],color=col,label=r['state'])
        aa.set(xlim=(-1,3),title=f'SC{r["prep"]}, {r["current_label"]} uA');aa.axvspan(0,.4,color='orange',alpha=.15)
        if r['prep']==3:aa.set_xlabel('Time from current onset (ms)')
        aa.legend(fontsize=8)
    for aa in ax[:,0]:aa.set_ylabel('Mean raw REC (uV)')
    fig.suptitle('Immediate component; overlaps current and is not a neural response measure');fig.tight_layout();fig.savefig(out/'immediate_intact_cut.png',dpi=150);plt.close(fig)
    fig,ax=plt.subplots(1,3,figsize=(14,4),sharey=True)
    for r in records:
        if r['current_label']==5 and r['name'] in spec_data:
            freq,power=spec_data[r['name']];ax[r['prep']-1].semilogy(freq,power[0],label=r['state'])
    for i,aa in enumerate(ax):aa.set(xlim=(0,2000),xlabel='Frequency (Hz)',title=f'SC{i+1} initial baseline');aa.legend()
    ax[0].set_ylabel('REC PSD (uV²/Hz)');fig.tight_layout();fig.savefig(out/'spectra.png',dpi=150);plt.close(fig)
    methods=dict(seed=112026,rec_channel='A-010',stim_channel='A-004',cut_between_stim_rec=True,electrode_and_copper_positions_fixed=True,
                 multiple_inputs_per_electrode=True,extra_notch=False,polarity='negative',filter='Butterworth order 3, 300-5000 Hz, forward/backward, clean segments only',
                 baseline_references=refrows,issues=issues,source_images=[f.name for f in args.input.glob('*.nd2')],
                 microscopy_scope='ND2 files inventoried; not used as proof of cut completeness or electrophysiological response',
                 limitations=['Header zeros are not usable impedance measurements','Shared channels are not independent controls','Early artifact-masked intervals remain unobserved','Trials are not biological replicates','Fixed threshold can be confounded by noise differences','No artifact/neural-source separation is established by a threshold crossing'])
    (out/'methods.json').write_text(json.dumps(methods,indent=2),encoding='utf-8')
    report(out,records,manifest,primary,quality,refrows,spectra,immediate,issues)
    print('DONE',out,flush=True)


if __name__=='__main__':main()
