"""Matched 2 uA PBS comparison across troubleshooting stages."""
from pathlib import Path
import argparse
import csv
import json
import rhs_io
import numpy as np
from scipy.signal import welch
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from analyze_pbs import core,xml_settings,return_time,tail_return_time,quantiles


def main():
    p=argparse.ArgumentParser();p.add_argument('input',type=Path);args=p.parse_args()
    base=Path(__file__).parent/'results';out=base/'reassembly_comparison';out.mkdir(parents=True,exist_ok=True)
    definitions=[('before cage grounding','stim test PBS settle 2uA_261102_115746'),
                 ('cage grounded, before reassembly','stim test PBS settle 5uA_261102_125543'),
                 ('after reassembly','stim test PBS settle_261102_132232'),
                 ('repeat, unchanged connections','stim test PBS settle_261102_133546'),
                 ('grounded outlet, electrodes immersed','stim test PBS settle_261102_141016'),
                 ('grounded outlet, global settle restored','stim test PBS settle_261102_142034'),
                 ('copper contacts adjusted, 1 uA','stim test PBS settle_261102_144002')]
    records=[]
    for stage,name in definitions:
        d,meta=rhs_io.load_session(args.input/name,base/'cache');fs=float(d['fs']);d['groups']=core.groups_of_pulses(d['current'],fs)
        values=sorted(set(round(float(np.max(np.abs(d['current'][s:e]))),4) for s,e in d['groups']))
        if values!=([1.0] if name.endswith(('_141016','_142034','_144002')) else [2.0]):raise ValueError(f'Nonmatched current: {name} {values}')
        y=core.filter_signal(d);ep,rel,_=core.lock_epochs(d['x'][0],d['groups'],fs,100,500)
        ep=ep-np.median(ep[:,(rel>=-100)&(rel<-10)],axis=1)[:,None]
        fep,_,_=core.lock_epochs(y,d['groups'],fs,100,500)
        first=d['groups'][0][0];initial=y[round(.2*fs):first-round(.02*fs)];raw_initial=d['x'][0,round(.2*fs):first-round(.02*fs)]
        f,power=welch(raw_initial,fs=fs,nperseg=min(round(fs),len(raw_initial)),nfft=round(fs))
        records.append(dict(stage=stage,name=name,data=d,meta=meta,filtered=y,ep=ep,fep=fep,rel=rel,initial=initial,freq=f,power=power,settings=xml_settings(args.input/name)))
    reference=records[1];mask=(reference['rel']>=-100)&(reference['rel']<-10)
    envelope=max(150,5*core.robust_sigma(reference['ep'][:,mask].reshape(-1)))
    summary=[];trials=[];amplitudes=[]
    for r in records:
        d=r['data'];fs=float(d['fs']);x=d['x'][0];y=r['filtered'];words=d['words'];groups=d['groups'];rel=r['rel'];ep=r['ep'];fep=r['fep']
        local=[]
        for i,(s,e) in enumerate(groups):
            hi=min(len(x),s+round(.5*fs));pre=x[s-round(.1*fs):s-round(.01*fs)];raw=x[s:hi]-np.median(pre)
            flags=np.any((words[:,s:hi]&57344)!=0,axis=0);recsettle=(words[0,s:hi]&8192)!=0;stimsettle=(words[1,s:hi]&8192)!=0
            start=max(e-s,int(np.flatnonzero(recsettle)[-1]+1) if recsettle.any() else e-s)
            row=dict(stage=r['stage'],recording=r['name'],pulse=i+1,onset_s=s/fs,
                     stim_compliance=bool(np.any(words[1,s:e]&32768)),rec_compliance=bool(np.any(words[0,s:e]&32768)),
                     rec_settle=bool(recsettle.any()),stim_settle=bool(stimsettle.any()),
                     first_return20_ms=return_time(raw,~flags,start,fs,envelope,20),tail_return_ms=tail_return_time(raw,~flags,start,fs,envelope),
                     raw_samples_abs_ge_5mV=int(np.count_nonzero(np.abs(raw)>=5000)))
            local.append(row);trials.append(row)
        pre_mask=(rel>=-100)&(rel<-10);rawpre=np.sqrt(np.mean(ep[:,pre_mask]**2,axis=1))
        metrics={}
        for low,high in ((2,10),(10,100),(100,300),(300,500)):
            win=(rel>=low)&(rel<high);rms=np.sqrt(np.mean(ep[:,win]**2,axis=1))
            entry=dict(stage=r['stage'],recording=r['name'],window_start_ms=low,window_end_ms=high,
                       median_raw_rms_uV=float(np.median(rms)),median_pre_raw_rms_uV=float(np.median(rawpre)),
                       median_raw_rms_ratio_to_pre=float(np.median(rms/np.maximum(rawpre,1e-9))))
            amplitudes.append(entry)
            if low==10:metrics={k:v for k,v in entry.items() if k.startswith('median_')}
        q=quantiles([t['first_return20_ms'] for t in local]);tail=quantiles([t['tail_return_ms'] for t in local])
        band=(r['freq']>=300)&(r['freq']<=5000);harm=band&(np.abs(r['freq']/50-np.round(r['freq']/50))<=2.01/50)
        summary.append(dict(stage=r['stage'],recording=r['name'],current_uA=float(np.max(np.abs(d['current']))),pulses=len(groups),rhs_files=len(r['meta']['files']),
                            initial_baseline_s=groups[0][0]/fs,initial_filtered_sigma_uV=core.robust_sigma(r['initial']),
                            initial_harmonic_fraction=float(r['power'][harm].sum()/r['power'][band].sum()),
                            initial_harmonic_power_uV2=float(r['power'][harm].sum()),
                            stim_compliance_pulses=sum(t['stim_compliance'] for t in local),rec_compliance_pulses=sum(t['rec_compliance'] for t in local),
                            rec_settle_pulses=sum(t['rec_settle'] for t in local),stim_settle_pulses=sum(t['stim_settle'] for t in local),
                            median_abs_peak_0_20ms_uV=float(np.median(np.max(np.abs(ep[:,(rel>=0)&(rel<20)]),axis=1))),
                            first_return20_median_ms=q['median_ms'],first_return_resolved=q['n_resolved'],tail_return_median_ms=tail['median_ms'],tail_return_resolved=tail['n_resolved'],
                            raw_trials_abs_ge_5mV=sum(t['raw_samples_abs_ge_5mV']>0 for t in local),
                            dc_saved=r['meta']['files'][0]['bandwidth']['dc_amplifier_data_saved'],
                            timestamp_gaps=int(np.count_nonzero(np.diff(d['ticks'].astype(np.int64))!=1)),**metrics))
        print('ANALYZED',r['stage'],'compliance',summary[-1]['stim_compliance_pulses'],'noise',summary[-1]['initial_filtered_sigma_uV'],'raw RMS',summary[-1]['median_raw_rms_uV'],flush=True)
    core.save_csv(out/'summary.csv',summary);core.save_csv(out/'trial_metrics.csv',trials);core.save_csv(out/'amplitude_metrics.csv',amplitudes)
    fig,ax=plt.subplots(3,2,figsize=(14,11));colors=['#7570b3','#d95f02','#1b9e77','#e7298a','#1f78b4','#b15928','#66a61e']
    for r,col in zip(records,colors):
        rel=r['rel'];med=np.median(r['ep'],axis=0)
        for aa in ax[0,:]:aa.plot(rel,med,color=col,label=r['stage'])
        ax[1,0].semilogy(r['freq'],r['power'],color=col,label=r['stage'])
        fs=float(r['data']['fs']);v=r['initial'][:round(.1*fs)];ax[1,1].plot(np.arange(len(v))/fs*1000,v,color=col,label=r['stage'],lw=.6)
        available=np.isfinite(r['fep']).sum(0);mean=np.divide(np.nansum(r['fep'],axis=0),available,out=np.full(len(rel),np.nan),where=available>0)
        ax[2,0].plot(rel,mean,color=col,label=r['stage'])
        for low in (2,10,100,300):
            m=next(a for a in amplitudes if a['stage']==r['stage'] and a['window_start_ms']==low)
            ax[2,1].plot((m['window_start_ms']+m['window_end_ms'])/2,m['median_raw_rms_ratio_to_pre'],'o',color=col)
    ax[0,0].set(xlim=(-2,20),ylabel='Median raw REC (uV)',title='Same-scale early artifacts')
    ax[0,1].set(xlim=(-10,500),ylabel='Median raw REC (uV)',title='Recovery tail')
    ax[1,0].set(xlim=(0,2000),xlabel='Frequency (Hz)',ylabel='Initial PSD (uV²/Hz)')
    ax[1,1].set(xlabel='Time within initial baseline (ms)',ylabel='Filtered REC (uV)',title='Same-scale baseline examples')
    ax[2,0].set(xlim=(-10,100),xlabel='Time from pulse onset (ms)',ylabel='Mean filtered REC (uV)')
    ax[2,1].set(xlabel='Window midpoint (ms)',ylabel='Median raw RMS / pre-pulse RMS',yscale='log');ax[2,1].axhline(1,color='gray',ls='--')
    for aa in ax[0,:]:aa.set_xlabel('Time from pulse onset (ms)');aa.axvline(0,color='black',lw=.6)
    ax[0,0].legend(fontsize=8);fig.suptitle('PBS troubleshooting: latest 1 uA after copper adjustment; REC mapping provisional')
    fig.tight_layout();fig.savefig(out/'comparison.png',dpi=145);plt.close(fig)
    # Expanded new recording: avoid hiding a small artifact behind the old mV scale.
    r=records[-1];rel=r['rel'];ep=r['ep'];fig,ax=plt.subplots(2,1,figsize=(12,7))
    for aa in ax:
        aa.plot(rel,np.median(ep,axis=0),color=colors[-1]);aa.fill_between(rel,np.quantile(ep,.1,axis=0),np.quantile(ep,.9,axis=0),color=colors[-1],alpha=.2);aa.axvspan(0,1.4,color='gray',alpha=.15)
    ax[0].set(xlim=(-2,20),ylabel='Raw REC (uV)',title='Latest repeat: median and 10-90% envelope, expanded scale')
    ax[1].set(xlim=(-20,500),xlabel='Time from pulse onset (ms)',ylabel='Raw REC (uV)')
    fig.tight_layout();fig.savefig(out/'after_expanded.png',dpi=145);plt.close(fig)
    methods=dict(currents_uA=[r["current_uA"] for r in summary],raw_envelope_limit_fixed_uV=envelope,reference_for_envelope=reference['name'],
                 no_tissue=True,reference='Per-pulse raw median -100 to -10 ms',filter='Same validated 300-5000 Hz clean-segment filter; no additional notch',
                 user_change='Multimeter continuity check followed by disassembly and reconnection of all parts',
                 limitations=['Multiple physical connections changed simultaneously; no single fault can be localized','Physical electrode-to-input mapping may have changed after reassembly','No DC trace or independent current measurement','No known test-signal sensitivity check','A disappearance of compliance flags does not establish neural recording capability','Higher baseline noise limits detection of small events','Operational raw-return criterion is not a validated clean window'],
                 settings={r['name']:r['settings'] for r in records})
    (out/'methods.json').write_text(json.dumps(methods,indent=2),encoding='utf-8')
    parts=['<!doctype html><meta charset="utf-8"><title>PBS after reassembly</title>',
           '<style>body{font:16px system-ui;max-width:1200px;margin:30px auto}img{width:100%}table{border-collapse:collapse}td,th{padding:8px;border:1px solid #bbb}.note{background:#fff2d0;padding:15px}</style>',
           '<h1>PBS: after continuity check and reassembly</h1>',
           '<p class="note">The last three recordings store 1 uA commands; earlier recordings use 2 uA. The intended latest amplitude was 2 uA, but both XML and RHS commands specify 1 uA. REC settle is absent at 14:10 but restored at 14:20 (50/50), with Global Settle true. Both recordings retain 50/50 compliance flags. Files without REC/STIM custom names use the documented native mapping: STIM A-004 is verified active, while REC A-010 is assumed from earlier recordings. Changes cannot be attributed to the outlet alone. Reassembly changed multiple connections, so improved performance cannot be assigned to a single component. The physical mapping of shared electrode inputs may also have changed. No DC or independent current measurement is available; compliance alone does not establish recording sensitivity.</p>',
           '<p>Raw voltage is baseline-subtracted per pulse (-100 to -10 ms). Noise estimate uses 300–5000 Hz and the initial no-stimulation segment, excluding first 0.2 s. Return metrics use one fixed raw-envelope limit derived from the cage-grounded pre-reassembly reference, to avoid changing the acceptance threshold when noise changes.</p>',
           '<table><tr><th>Stage</th><th>Current uA</th><th>Pulses</th><th>STIM compliance</th><th>REC settle</th><th>Initial filtered noise uV</th><th>Raw RMS 10-100 ms uV</th><th>RMS / pre-pulse</th></tr>']
    for r in summary:parts.append(f'<tr><td>{r["stage"]}</td><td>{r["current_uA"]}</td><td>{r["pulses"]}</td><td>{r["stim_compliance_pulses"]}/{r["pulses"]}</td><td>{r["rec_settle_pulses"]}/{r["pulses"]}</td><td>{r["initial_filtered_sigma_uV"]:.2f}</td><td>{r["median_raw_rms_uV"]:.1f}</td><td>{r["median_raw_rms_ratio_to_pre"]:.2f}</td></tr>')
    parts+=['</table><p><strong>Latest 14:40 recording:</strong> copper contacts adjusted; physical input mapping may have changed. Stored command 1 uA; only 22 pulses recorded despite 50 configured. Compliance 0/22; REC/STIM settle 22/22. A-010 initial filtered sigma 1.74 uV is based on less than 0.6 s before stimulation and does not prove electrode connection. Early raw peak median 2.32 mV; 10-100 ms raw RMS / pre-pulse 22.83, so substantial artifact remains. Trial variability is large; median return times are not a universal exclusion window.</p><p><strong>14:20 recording:</strong> Global Settle true, REC settle 50/50, but compliance remains 50/50 and all trials exceed 5 mV. Stored amplitude is 1 uA despite intended 2 uA. Initial filtered sigma 14.4 uV; 10-100 ms raw RMS / pre-pulse 12.50. Recovery criterion median 66.5 ms in 49/50 trials is operational, not a validated clean window.</p><p><strong>14:10 recording:</strong> 1 uA, compliance 50/50, REC settle 0/50, filtered initial noise 13.2 uV. Large early artifacts return (all 50 trials exceed 5 mV); 10-100 ms raw RMS is 13.09 times pre-pulse. The outlet effect cannot be isolated because current and REC settle also differ. A-010 is an assumed REC mapping.</p><p>The unchanged-wiring repeat retains 0/50 compliance flags and a 10-100 ms post/pre RMS ratio of 1.05. Initial filtered noise decreases from 79.2 to 23.7 uV, while raw pre-pulse RMS increases from 138 to 213 uV and periodic interference is prominent. These are different measures: the recording is not uniformly quieter. No validated artifact-free early window or REC sensitivity has been established.</p><img src="comparison.png"><h2>Expanded post-reassembly recording</h2><img src="after_expanded.png">',
            '<p>'+' · '.join(f'<a href="{f}">{f}</a>' for f in ('summary.csv','trial_metrics.csv','amplitude_metrics.csv','methods.json'))+'</p>']
    (out/'report.html').write_text('\n'.join(parts),encoding='utf-8')
    link='<section class="note"><h2>New: post-reassembly recording</h2><p><a href="reassembly_comparison/report.html">Open matched 2 uA comparison after continuity check and reconnection</a>.</p></section>'
    page=base/'report.html';s=page.read_text(encoding='utf-8');heading='<h1>PBS, no tissue: Amp Settle off versus on</h1>';page.write_text(s if link in s else s.replace(heading,heading+link),encoding='utf-8')
    print('DONE',out,flush=True)


if __name__=='__main__':main()










