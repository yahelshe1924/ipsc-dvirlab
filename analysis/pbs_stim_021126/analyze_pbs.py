"""PBS artifact control: local+global Amp Settle off versus on.

There is no tissue: all detected events are non-neural. Return times are
operational noise-envelope measures, not universal clean-recording boundaries.
"""
from pathlib import Path
import sys
import importlib.util
import argparse
import csv
import json
import html
import re
import xml.etree.ElementTree as ET
import rhs_io
import numpy as np
from scipy.signal import welch
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

source=Path(__file__).resolve().parents[1]/'spinal_stim_181026'/'analyze_experiment.py'
spec=importlib.util.spec_from_file_location('validated_core',source);core=importlib.util.module_from_spec(spec);spec.loader.exec_module(core)


def xml_settings(folder):
    root=ET.parse(folder/'settings.xml').getroot()
    g=next(e for e in root.iter() if e.tag=='GeneralConfig')
    channels={e.attrib['NativeChannelName']:dict(e.attrib) for e in root.iter() if e.tag=='StimChannel'}
    return dict(general=dict(g.attrib),stim=channels.get('A-004',{}),rec=channels.get('A-010',{}),rhx_version=root.attrib.get('Version'))


def return_time(values,eligible,start,fs,limit,stable_ms,block_ms=.5):
    step=round(block_ms*fs/1000);n=len(values)//step
    if n==0:return None
    blocks=values[:n*step].reshape(n,step);valid=eligible[:n*step].reshape(n,step).all(1)
    good=(np.max(np.abs(np.nan_to_num(blocks,nan=np.inf)),axis=1)<=limit)&valid
    count=int(np.ceil(stable_ms/block_ms))
    for j in range(max(0,int(np.ceil(start/step))),n-count+1):
        if good[j:j+count].all():return j*step/fs*1000
    return None


def quantiles(values):
    v=[x for x in values if x is not None and np.isfinite(x)]
    return dict(n_resolved=len(v),median_ms=float(np.median(v)) if v else None,
                p95_ms=float(np.quantile(v,.95)) if v else None,max_ms=max(v) if v else None)


def tail_return_time(values,eligible,start,fs,limit,stable_ms=20):
    """Require no later envelope exceedance through the observed 500 ms tail."""
    step=round(.0005*fs);n=len(values)//step
    if not n:return None
    good=(np.max(np.abs(values[:n*step].reshape(n,step)),axis=1)<=limit)&eligible[:n*step].reshape(n,step).all(1)
    first=max(0,int(np.ceil(start/step)));bad=np.flatnonzero(~good[first:])+first
    j=max(first,int(bad[-1]+1) if len(bad) else first)
    return j*step/fs*1000 if n-j>=int(np.ceil(stable_ms/.5)) else None


def candidate_hist(y,events,groups,fs):
    edges=np.arange(-100,505,5);counts=np.zeros(len(edges)-1);exposure=np.zeros_like(counts)
    for s,e in groups:
        ix=events[(events>=s-round(.1*fs))&(events<s+round(.5*fs))]
        counts+=np.histogram((ix-s)/fs*1000,edges)[0]
        lo=max(0,s-round(.1*fs));hi=min(len(y),s+round(.5*fs))
        tt=(np.arange(lo,hi)-s)/fs*1000
        exposure+=np.histogram(tt[np.isfinite(y[lo:hi])],edges)[0]/fs
    rate=np.divide(counts,exposure,out=np.full_like(counts,np.nan),where=exposure>0)
    return edges,counts,exposure,rate


def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('input',type=Path);p.add_argument('--output',type=Path,default=Path(__file__).parent/'results');args=p.parse_args()
    out=args.output;out.mkdir(parents=True,exist_ok=True);figures=out/'figures';figures.mkdir(exist_ok=True)
    folders=sorted(args.input.glob('stim test PBS*'),key=lambda f:f.name[-6:])
    annotation_path=Path(__file__).parent/'session_annotations.json'
    annotations=json.loads(annotation_path.read_text(encoding='utf-8')) if annotation_path.exists() else {}
    # Grounded recordings have a different experimental factor; analyze them
    # separately rather than mixing them into the original off/on comparison.
    folders=[f for f in folders if not annotations.get(f.name,{}).get('exclude_from_settle_comparison',annotations.get(f.name,{}).get('cage_grounded',False))]
    records=[];settings=[]
    for folder in folders:
        d,meta=rhs_io.load_session(folder,out/'cache');d['groups']=core.groups_of_pulses(d['current'],float(d['fs']))
        config=xml_settings(folder);on=config['general'].get('HeadstageGlobalSettle')=='True' and config['stim'].get('EnableAmpSettle')=='True'
        values=sorted(set(round(float(np.max(np.abs(d['current'][s:e]))),3) for s,e in d['groups']))
        if len(values)!=1:raise ValueError(f'Mixed amplitudes: {folder}')
        declared=int(re.search(r'(\d+)uA',folder.name)[1])
        records.append(dict(name=folder.name,on=on,state='settle on' if on else 'settle off',current=values[0],declared_current=declared,data=d,meta=meta,settings=config))
        settings.append(dict(recording=folder.name,declared_current_uA=declared,stored_current_uA=values[0],
                             configured_first_phase_uA=config['stim'].get('FirstPhaseAmplitudeMicroAmps'),
                             configured_second_phase_uA=config['stim'].get('SecondPhaseAmplitudeMicroAmps'),
                             global_settle=config['general'].get('HeadstageGlobalSettle'),
                             stim_enable_settle=config['stim'].get('EnableAmpSettle'),pre_settle_us=config['stim'].get('PreStimAmpSettleMicroseconds'),
                             post_settle_us=config['stim'].get('PostStimAmpSettleMicroseconds'),maintain_train=config['stim'].get('MaintainAmpSettle'),
                             traditional_fast_settle=config['general'].get('UseFastSettle'),settle_bandwidth_Hz=config['general'].get('DesiredLowerSettleBandwidthHertz'),
                             charge_recovery=config['stim'].get('EnableChargeRecovery'),phase1_us=config['stim'].get('FirstPhaseDurationMicroseconds'),
                             phase2_us=config['stim'].get('SecondPhaseDurationMicroseconds'),shape=config['stim'].get('Shape'),
                             display_highpass_Hz=config['general'].get('HighpassFilterCutoffFreqHertz'),dc_saved=meta['files'][0]['bandwidth']['dc_amplifier_data_saved']))
    core.save_csv(out/'settings_comparison.csv',settings)
    # One detection threshold for all PBS recordings, not a separate threshold per condition.
    reference=next(r for r in records if not r['on'] and r['current']==5)
    d=reference['data'];fs=float(d['fs']);ref_y=core.filter_signal(d);first=d['groups'][0][0]
    ref_values=ref_y[round(.2*fs):first-round(.02*fs)]
    sigma_ref=core.robust_sigma(ref_values);threshold=4.5*sigma_ref
    summary=[];trials=[];false_counts=[];raw_metrics=[];return_summary=[];flag_summary=[]
    for r in records:
        d=r['data'];fs=float(d['fs']);x=d['x'][0];groups=d['groups'];words=d['words']
        y=core.filter_signal(d);events=core.detect(y,threshold,fs);r['filtered']=y;r['events']=events
        ep,rel,ids=core.lock_epochs(x,groups,fs,100,500)
        centers=np.median(ep[:,(rel>=-100)&(rel<-10)],axis=1)
        corrected=ep-centers[:,None];r['epochs']=corrected;r['rel']=rel;r['ids']=ids
        fep,_,_=core.lock_epochs(y,groups,fs,100,500);r['filtered_epochs']=fep
        local=[];stim_flagged=0;rec_flagged=0;stim_settle_pulses=0;rec_settle_pulses=0
        for i,(s,e) in enumerate(groups):
            hi=min(len(x),s+round(.5*fs));raw=x[s:hi]-float(np.median(x[max(0,s-round(.1*fs)):s-round(.01*fs)]))
            pre=x[max(0,s-round(.1*fs)):s-round(.01*fs)];rawsigma=core.robust_sigma(pre)
            raw_limit=max(150,5*rawsigma)
            flags=np.any((words[:,s:hi]&np.uint16(57344))!=0,axis=0)
            near_end=min(len(x),e+round(.01*fs))
            settle_stim=(words[1,s:near_end]&8192)!=0;settle_rec=(words[0,s:near_end]&8192)!=0
            comp_stim=(words[1,s:e]&32768)!=0;comp_rec=(words[0,s:e]&32768)!=0
            stim_flagged+=int(comp_stim.any());rec_flagged+=int(comp_rec.any())
            stim_settle_pulses+=int(settle_stim.any());rec_settle_pulses+=int(settle_rec.any())
            settle_end=max((np.flatnonzero(settle_rec)[-1]+1) if settle_rec.any() else e-s,
                           (np.flatnonzero(settle_stim)[-1]+1) if settle_stim.any() else e-s)
            # Raw return: must be outside known hardware events.
            rt5=return_time(raw,~flags,max(e-s,settle_end),fs,raw_limit,5)
            rt20=return_time(raw,~flags,max(e-s,settle_end),fs,raw_limit,20)
            tail=tail_return_time(raw,~flags,max(e-s,settle_end),fs,raw_limit)
            entry=dict(recording=r['name'],state=r['state'],current_uA=r['current'],pulse=i+1,onset_s=s/fs,
                       rec_settle=bool(settle_rec.any()),stim_settle=bool(settle_stim.any()),rec_settle_end_ms=(np.flatnonzero(settle_rec)[-1]+1)/fs*1000 if settle_rec.any() else None,
                       stim_compliance_during_current=bool(comp_stim.any()),rec_compliance_during_current=bool(comp_rec.any()),
                       raw_pre_sigma_uV=rawsigma,raw_envelope_limit_uV=raw_limit,
                       raw_return_5ms_stability_ms=rt5,raw_return_20ms_stability_ms=rt20,
                       raw_tail_return_through_500ms=tail,
                       peak_abs_0_500ms_uV=float(np.max(np.abs(raw))),
                       samples_abs_above_5mV=int(np.count_nonzero(np.abs(raw)>=5000)))
            local.append(entry);trials.append(entry)
        q5=quantiles([t['raw_return_5ms_stability_ms'] for t in local]);q20=quantiles([t['raw_return_20ms_stability_ms'] for t in local])
        qt=quantiles([t['raw_tail_return_through_500ms'] for t in local])
        return_summary.append(dict(recording=r['name'],state=r['state'],current_uA=r['current'],pulses=len(groups),
                                   raw5_resolved=q5['n_resolved'],raw5_median_ms=q5['median_ms'],raw5_p95_ms=q5['p95_ms'],raw5_max_ms=q5['max_ms'],
                                   raw20_resolved=q20['n_resolved'],raw20_median_ms=q20['median_ms'],raw20_p95_ms=q20['p95_ms'],raw20_max_ms=q20['max_ms'],
                                   tail_resolved=qt['n_resolved'],tail_median_ms=qt['median_ms'],tail_p95_ms=qt['p95_ms'],tail_max_ms=qt['max_ms']))
        flag_summary.append(dict(recording=r['name'],state=r['state'],current_uA=r['current'],pulses=len(groups),
                                 rec_settle_pulses=rec_settle_pulses,stim_settle_pulses=stim_settle_pulses,
                                 stim_compliance_pulses=stim_flagged,rec_compliance_pulses=rec_flagged))
        first=groups[0][0];raw_initial=x[round(.2*fs):first-round(.02*fs)]
        freq,power=welch(raw_initial,fs=fs,nperseg=min(round(fs),len(raw_initial)),nfft=round(fs))
        band=(freq>=300)&(freq<=5000);harm=band&(np.abs(freq/50-np.round(freq/50))<=2.01/50)
        summary.append(dict(recording=r['name'],state=r['state'],current_uA=r['current'],declared_current_uA=r['declared_current'],rhs_files=len(r['meta']['files']),
                            pulses=len(groups),duration_s=len(x)/fs,initial_baseline_s=first/fs,
                            pulse_width_ms=float(np.median([(e-s)/fs*1000 for s,e in groups])),
                            interval_s=float(np.median(np.diff([s for s,e in groups]))/fs),
                            initial_filtered_sigma_uV=core.robust_sigma(y[round(.2*fs):first-round(.02*fs)]),
                            initial_harmonic_fraction=float(power[harm].sum()/power[band].sum()),
                            negative_threshold_uV=threshold,whole_recording_false_candidates=len(events),
                            timestamp_gaps=int(np.count_nonzero(np.diff(d['ticks'].astype(np.int64))!=1))))
        for low,high in ((2,10),(10,100),(100,300),(300,500)):
            stat,trial=core.paired_windows(y,events,groups,fs,low,high)
            false_counts.append(dict(recording=r['name'],state=r['state'],current_uA=r['current'],window_start_ms=low,window_end_ms=high,**stat))
        for low,high in ((2,10),(10,100),(100,300),(300,500)):
            mask=(rel>=low)&(rel<high)
            med_raw_rms=np.median(np.sqrt(np.mean(corrected[:,mask]**2,axis=1)))
            available=np.isfinite(fep[:,mask]);values=np.where(available,fep[:,mask],0)
            den=available.sum(1);rms=np.sqrt(np.divide((values*values).sum(1),den,out=np.full(len(den),np.nan),where=den>0))
            raw_metrics.append(dict(recording=r['name'],state=r['state'],current_uA=r['current'],window_start_ms=low,window_end_ms=high,
                                    median_raw_rms_uV=float(med_raw_rms),median_filtered_rms_uV=float(np.nanmedian(rms)),
                                    median_raw_abs_peak_uV=float(np.median(np.max(np.abs(corrected[:,mask]),axis=1)))))
        folder=out/r['name'];folder.mkdir(exist_ok=True)
        np.savez_compressed(folder/'epochs.npz',raw_baseline_subtracted_uV=corrected,filtered_uV=fep,time_ms=rel)
        np.savez_compressed(folder/'false_candidates.npz',sample=events,time_s=events/fs,peak_uV=y[events])
        print('ANALYZED',r['state'],r['current'],'pulses',len(groups),'REC settle',rec_settle_pulses,'compliance STIM',stim_flagged,'raw20 median',q20['median_ms'],flush=True)
    for name,rows in [('summary.csv',summary),('trial_metrics.csv',trials),('raw_recovery.csv',return_summary),('flags.csv',flag_summary),('false_candidates.csv',false_counts),('amplitude_metrics.csv',raw_metrics)]:core.save_csv(out/name,rows)
    comparisons=[]
    for current in (5,20,100):
        fig,ax=plt.subplots(4,2,figsize=(14,13));colors={False:'#d95f02',True:'#1b9e77'}
        for r in sorted([r for r in records if r['current']==current],key=lambda r:r['on']):
            col=colors[r['on']];rel=r['rel'];ep=r['epochs'];fep=r['filtered_epochs']
            med=np.median(ep,axis=0);qlo=np.quantile(ep,.1,axis=0);qhi=np.quantile(ep,.9,axis=0)
            for aa in ax[0,:]:
                aa.plot(rel,med,color=col,label=r['state']);aa.fill_between(rel,qlo,qhi,color=col,alpha=.12)
            ax[0,0].set_xlim(-2,20);ax[0,1].set_xlim(-10,500)
            counts=np.isfinite(fep).sum(0);mean=np.divide(np.nansum(fep,axis=0),counts,out=np.full(fep.shape[1],np.nan),where=counts>0)
            for aa in ax[1,:]:aa.plot(rel,mean,color=col,label=r['state'])
            ax[1,0].set_xlim(-5,30);ax[1,1].set_xlim(-10,500)
            edges,cn,ex,rate=candidate_hist(r['filtered'],r['events'],r['data']['groups'],float(r['data']['fs']))
            ax[2,0].stairs(rate,edges,color=col,label=r['state']);ax[2,0].set_xlim(-100,500)
            for rownum in [2,3]:
                if rownum==2:
                    for low,high in ((2,10),(10,100),(100,300),(300,500)):
                        m=next(m for m in raw_metrics if m['recording']==r['name'] and m['window_start_ms']==low)
                        ax[2,1].plot((low+high)/2,m['median_raw_rms_uV'],'o',color=col)
                else:
                    q=next(q for q in return_summary if q['recording']==r['name'])
                    vals=[t['raw_return_20ms_stability_ms'] for t in trials if t['recording']==r['name'] and t['raw_return_20ms_stability_ms'] is not None]
                    vals=np.sort(vals)
                    if len(vals):ax[3,0].step(vals,np.arange(1,len(vals)+1)/len(r['data']['groups']),where='post',color=col,label=r['state'])
                    # Raw examples around pulse #10, same scales across conditions.
                    i=min(9,len(ep)-1);ax[3,1].plot(rel,ep[i],color=col,label=r['state']);ax[3,1].set_xlim(-5,200)
        ax[0,0].set_ylabel('Median raw REC (uV)');ax[0,1].set_title('Median and 10-90% trial envelope')
        ax[1,0].set_ylabel('Mean filtered REC (uV)');ax[1,1].set_title('300-5000 Hz; artifact/flag masks plus filter guard')
        ax[2,0].set_ylabel('False candidates/valid s');ax[2,0].set_title('PBS has no neural spikes')
        ax[2,1].set(xlabel='Window midpoint (ms)',ylabel='Median raw RMS (uV)',yscale='log',title='Residual raw amplitude by window')
        ax[3,0].set(xlim=(0,500),ylim=(0,1.02),xlabel='Raw-return time, 20 ms stability (ms)',ylabel='Fraction of all pulses returned')
        ax[3,1].set(title='Single-trial example (#10)',ylabel='Raw REC (uV)')
        for aa in (ax[0,0],ax[0,1],ax[1,0],ax[1,1],ax[2,0],ax[3,1]):aa.axvline(0,color='black',lw=.6);aa.set_xlabel('Time from stored current onset (ms)')
        ax[0,0].legend();ax[2,0].legend();fig.suptitle(f'PBS {current} uA: Amp Settle OFF versus ON; same electrode/connection geometry')
        fig.tight_layout();fig.savefig(figures/f'PBS_{current}uA_comparison.png',dpi=140);plt.close(fig)
        off=next(r for r in return_summary if r['current_uA']==current and r['state']=='settle off');on=next(r for r in return_summary if r['current_uA']==current and r['state']=='settle on')
        comparisons.append(dict(current_uA=current,off_raw20_median_ms=off['raw20_median_ms'],on_raw20_median_ms=on['raw20_median_ms'],
                                off_resolved=off['raw20_resolved'],on_resolved=on['raw20_resolved'],
                                change_ms=on['raw20_median_ms']-off['raw20_median_ms'] if on['raw20_median_ms'] is not None and off['raw20_median_ms'] is not None else None))
    core.save_csv(out/'off_on_comparison.csv',comparisons)
    low_currents=[r for r in records if r['on'] and r['current'] in (1,2,4,5)]
    if any(r['current']<5 for r in low_currents):
        fig,ax=plt.subplots(3,2,figsize=(14,11))
        colors={1:'#7570b3',2:'#e7298a',4:'#66a61e',5:'#1b9e77'}
        for r in sorted(low_currents,key=lambda r:r['current']):
            col=colors[r['current']];rel=r['rel'];med=np.median(r['epochs'],axis=0)
            suffix=f' (file named {r["declared_current"]} uA)' if r['current']!=r['declared_current'] else ''
            label=f'{r["current"]:g} uA{suffix}, settle on'
            ax[0,0].plot(rel,med,color=col,label=label);ax[0,1].plot(rel,med,color=col,label=label)
            fep=r['filtered_epochs'];count=np.isfinite(fep).sum(0)
            mean=np.divide(np.nansum(fep,axis=0),count,out=np.full(fep.shape[1],np.nan),where=count>0)
            ax[1,0].plot(rel,mean,color=col,label=label)
            edges,cn,ex,rate=candidate_hist(r['filtered'],r['events'],r['data']['groups'],float(r['data']['fs']))
            ax[1,1].stairs(rate,edges,color=col,label=label)
            for low,high in ((2,10),(10,100),(100,300),(300,500)):
                m=next(m for m in raw_metrics if m['recording']==r['name'] and m['window_start_ms']==low)
                ax[2,0].plot((low+high)/2,m['median_raw_rms_uV'],'o',color=col)
            flags=next(v for v in flag_summary if v['recording']==r['name'])
            tick=f'{int(r["current"])}'+(f' (file {r["declared_current"]})' if suffix else '')
            ax[2,1].bar(tick,flags['stim_compliance_pulses']/flags['pulses']*100,color=col)
        ax[0,0].set(xlim=(-2,20),ylabel='Median raw REC (uV)',title='Early raw artifact')
        ax[0,1].set(xlim=(-10,500),ylabel='Median raw REC (uV)',title='Raw recovery tail')
        ax[1,0].set(xlim=(-10,100),ylabel='Mean filtered REC (uV)',title='300-5000 Hz; masked intervals omitted')
        ax[1,1].set(xlim=(-100,500),ylabel='False candidates/valid s',title='No tissue: candidates are non-neural')
        ax[2,0].set(xlabel='Window midpoint (ms)',ylabel='Median raw RMS (uV)',yscale='log')
        ax[2,1].set(xlabel='Current command (uA)',ylabel='Pulses with STIM compliance (%)',ylim=(0,105))
        for aa in ax[:2,:].flat:aa.axvline(0,color='black',lw=.6);aa.set_xlabel('Time from stored current onset (ms)')
        ax[0,0].legend(fontsize=8);fig.suptitle('PBS lower-current tests: all with local/global Amp Settle enabled')
        fig.tight_layout();fig.savefig(figures/'PBS_low_current_comparison.png',dpi=145);plt.close(fig)
        low_summary=[]
        for r in sorted(low_currents,key=lambda r:r['current']):
            f=next(v for v in flag_summary if v['recording']==r['name']);q=next(v for v in return_summary if v['recording']==r['name']);m=next(v for v in raw_metrics if v['recording']==r['name'] and v['window_start_ms']==10)
            low_summary.append(dict(recording=r['name'],current_uA=r['current'],declared_current_uA=r['declared_current'],pulses=f['pulses'],
                                    stim_compliance_pulses=f['stim_compliance_pulses'],rec_settle_pulses=f['rec_settle_pulses'],
                                    raw_rms_10_100ms_uV=m['median_raw_rms_uV'],raw_first_return20_median_ms=q['raw20_median_ms'],
                                    tail_resolved=q['tail_resolved'],tail_median_ms=q['tail_median_ms']))
        core.save_csv(out/'low_current_summary.csv',low_summary)
    methods=dict(no_tissue=True,same_electrode_copper_ref_ground_positions_confirmed=True,channel_mapping={'REC':'A-010','STIM':'A-004'},
                 baseline_reference_recording=reference['name'],sigma_ref_uV=sigma_ref,negative_threshold_uV=threshold,
                 extra_notch=False,raw_baseline='Per-pulse median -100 to -10 ms',
                 raw_return='First 0.5 ms bin after pulse/settle within max(150 uV,5 x pre-pulse robust raw sigma), continuously for 5 or 20 ms, no saved flags; search to 500 ms. This can precede a later excursion. A separate tail measure requires remaining within the same envelope through 500 ms, with at least 20 ms observed after return.',
                 naming_mismatches=[dict(recording=r['name'],declared_uA=r['declared_current'],stored_uA=r['current']) for r in records if r['declared_current']!=r['current']],
                 caveats=['Operational return criterion, not a validated spike-safe boundary','Global settle and local settle changed together; separate effects cannot be isolated','Sequential off then on, no repeated crossover','Lower-current tests have no matched settle-off conditions; inspect naming_mismatches for any label discrepancies','No independent current measurement; DC not saved','PBS response is non-neural; amplitude threshold alone cannot validate neural origin','No subtraction of PBS template from tissue data','Shared channels are not independent controls'],
                 settings={r['name']:r['settings'] for r in records})
    (out/'methods.json').write_text(json.dumps(methods,indent=2),encoding='utf-8')
    write_report(out,summary,return_summary,flag_summary,comparisons,settings)
    print('DONE',out,flush=True)


def write_report(out,summary,recovery,flags,comparisons,settings):
    parts=['<!doctype html><meta charset="utf-8"><title>PBS stimulation artifact control — 2 November 2026</title>',
           '<style>body{font:16px system-ui;max-width:1200px;margin:30px auto;color:#172538}img{width:100%}table{border-collapse:collapse}td,th{padding:8px;border:1px solid #bbb}p{line-height:1.5}.note{background:#fff2d0;padding:15px}</style>',
           '<h1>PBS, no tissue: Amp Settle off versus on</h1>',
           '<p class="note">All threshold events in these recordings are non-neural. Electrode/copper/REF/GND positions were unchanged, per the experimenter. Local STIM settle and global settle were changed together: these tests do not isolate their individual effects. Sequential recordings are not a randomized crossover.</p>',
           '<p>Raw acquisition signals are compared without additional notch or interpolation. Initial negative-event detector: 300–5000 Hz, order-3 Butterworth forward/backward on separate clean segments; current and hardware flags excluded through 3 ms after their end, plus 5 ms filtering-edge guard. One common threshold across all included PBS recordings. This detector is used to quantify false candidates, not neural spikes.</p>',
           '<p>Raw recovery is an operational baseline-envelope criterion: first 0.5 ms bin after current/settle end, within max(150 uV, 5 × pre-pulse robust raw noise) continuously for 5 or 20 ms, with no hardware flags. A first return may precede a later rebound; it is not a clean-signal boundary. The stricter tail metric requires staying inside that envelope through 500 ms, with at least 20 ms observed after return. Neither measure establishes absence of artifact or compatibility with small-spike detection.</p>',
           '<h2>Actual recorded hardware flags and raw return</h2><table><tr><th>uA</th><th>State</th><th>Pulses</th><th>REC settle pulses</th><th>STIM compliance pulses</th><th>First raw-return median (20 ms stability)</th><th>Last-excursion tail-return median</th><th>Tail resolved / all pulses</th></tr>']
    for row in flags:
        q=next(q for q in recovery if q['recording']==row['recording'])
        fmt=lambda v:'unresolved' if v is None else f'{v:.1f} ms'
        parts.append(f'<tr><td>{row["current_uA"]:g}</td><td>{row["state"]}</td><td>{row["pulses"]}</td><td>{row["rec_settle_pulses"]}/{row["pulses"]}</td><td>{row["stim_compliance_pulses"]}/{row["pulses"]}</td><td>{fmt(q["raw20_median_ms"])}</td><td>{fmt(q["tail_median_ms"])}</td><td>{q["tail_resolved"]}/{row["pulses"]}</td></tr>')
    parts.append('</table><h2>Equal-scale off/on comparisons</h2>')
    if (out/'figures'/'PBS_low_current_comparison.png').exists():
        mismatch=[r for r in summary if r['current_uA']!=r['declared_current_uA']]
        note='; '.join(f'{html.escape(r["recording"])}: label {r["declared_current_uA"]} uA, stored {r["current_uA"]:g} uA' for r in mismatch)
        note=note or 'Current labels agree with decoded RHS commands in all included recordings.'
        parts.append('<h2>Lower-current tests</h2><p class="note">'+note+' All lower-current tests use local/global Amp Settle. No matched settle-off tests exist at these lower currents.</p><img src="figures/PBS_low_current_comparison.png"><p><a href="low_current_summary.csv">Lower-current summary</a></p>')
    for current in (5,20,100):parts.append(f'<h3>{current} uA</h3><img src="figures/PBS_{current}uA_comparison.png">')
    parts.append('<h2>Files and methods</h2><p>'+ ' · '.join(f'<a href="{name}">{name}</a>' for name in ['summary.csv','settings_comparison.csv','flags.csv','raw_recovery.csv','trial_metrics.csv','off_on_comparison.csv','false_candidates.csv','amplitude_metrics.csv','methods.json'])+'</p>')
    (out/'report.html').write_text('\n'.join(parts),encoding='utf-8')


if __name__=='__main__':main()
