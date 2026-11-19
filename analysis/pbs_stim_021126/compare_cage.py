"""Compare matched PBS currents before/after external cage grounding.

All comparisons have local/global Amp Settle ON. Separate from settle off/on.
"""
from pathlib import Path
import argparse
import csv
import json
import html
import rhs_io
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from scipy.signal import welch
from analyze_pbs import core,xml_settings,return_time,tail_return_time,quantiles


def main():
    p=argparse.ArgumentParser();p.add_argument('input',type=Path);args=p.parse_args()
    base=Path(__file__).parent/'results';out=base/'cage_comparison';out.mkdir(parents=True,exist_ok=True)
    annotations=json.loads((Path(__file__).parent/'session_annotations.json').read_text(encoding='utf-8'))
    annotations={k:v for k,v in annotations.items() if v.get('comparison','cage')=='cage'}
    old={5:'stim test PBS settle 5uA_261102_113116',1:'stim test PBS settle 1uA_261102_115617',2:'stim test PBS settle 2uA_261102_115746'}
    sessions=[(name,False,current) for current,name in old.items()]+[(name,True,v['expected_current_uA']) for name,v in annotations.items()]
    records=[];summary=[];trial_rows=[];settings=[]
    for name,grounded,expected in sessions:
        d,meta=rhs_io.load_session(args.input/name,base/'cache');fs=float(d['fs']);groups=core.groups_of_pulses(d['current'],fs);d['groups']=groups
        peaks=sorted(set(round(float(np.max(np.abs(d['current'][s:e]))),4) for s,e in groups))
        if peaks!=[float(expected)]:raise ValueError(f'Unexpected current: {name} {peaks}, expected {expected}')
        config=xml_settings(args.input/name)
        if config['general'].get('HeadstageGlobalSettle')!='True' or config['stim'].get('EnableAmpSettle')!='True':raise ValueError(f'Settle configuration changed: {name}')
        cfg=dict(recording=name,cage_grounded=grounded,actual_current_uA=expected,settings=config)
        settings.append(cfg)
        x=d['x'][0];words=d['words'];y=core.filter_signal(d)
        first=groups[0][0];baseline=y[round(.2*fs):first-round(.02*fs)]
        rawbase=x[round(.2*fs):first-round(.02*fs)]
        freq,power=welch(rawbase,fs=fs,nperseg=min(round(fs),len(rawbase)),nfft=round(fs))
        band=(freq>=300)&(freq<=5000);harm=band&(np.abs(freq/50-np.round(freq/50))<=2.01/50)
        spectral_power=float(power[band].sum()*(freq[1]-freq[0]));harmonic_power=float(power[harm].sum()*(freq[1]-freq[0]))
        ep,rel,ids=core.lock_epochs(x,groups,fs,100,500)
        ep=ep-np.median(ep[:,(rel>=-100)&(rel<-10)],axis=1)[:,None]
        fep,_,_=core.lock_epochs(y,groups,fs,100,500)
        local=[]
        for i,(s,e) in enumerate(groups):
            hi=min(len(x),s+round(.5*fs));pre=x[s-round(.1*fs):s-round(.01*fs)]
            center=float(np.median(pre));limit=max(150,5*core.robust_sigma(pre));raw=x[s:hi]-center
            flags=np.any((words[:,s:hi]&57344)!=0,axis=0)
            settle_rec=(words[0,s:hi]&8192)!=0;settle_stim=(words[1,s:hi]&8192)!=0
            settle_end=max(e-s,int(np.flatnonzero(settle_rec)[-1]+1) if settle_rec.any() else e-s)
            row=dict(recording=name,cage_grounded=grounded,current_uA=expected,pulse=i+1,onset_s=s/fs,
                     stim_compliance=bool(np.any(words[1,s:e]&32768)),rec_compliance=bool(np.any(words[0,s:e]&32768)),
                     rec_settle=bool(settle_rec.any()),stim_settle=bool(settle_stim.any()),
                     raw_first_return20_ms=return_time(raw,~flags,settle_end,fs,limit,20),
                     raw_tail_return_ms=tail_return_time(raw,~flags,settle_end,fs,limit),
                     raw_envelope_limit_uV=limit,peak_abs_raw_uV=float(np.max(np.abs(raw))),
                     raw_samples_abs_ge_5mV=int(np.count_nonzero(np.abs(raw)>=5000)))
            trial_rows.append(row);local.append(row)
        rms={}
        for low,high in ((10,100),(100,300),(300,500)):
            win=(rel>=low)&(rel<high);rms[f'raw_rms_{low}_{high}ms_uV']=float(np.median(np.sqrt(np.mean(ep[:,win]**2,axis=1))))
        q=quantiles([t['raw_first_return20_ms'] for t in local]);tail=quantiles([t['raw_tail_return_ms'] for t in local])
        row=dict(recording=name,cage_grounded=grounded,current_uA=expected,pulses=len(groups),duration_s=len(x)/fs,
                 initial_baseline_s=first/fs,initial_filtered_sigma_uV=core.robust_sigma(baseline),
                 initial_band_power_uV2=spectral_power,initial_harmonic_power_uV2=harmonic_power,
                 initial_harmonic_fraction=harmonic_power/spectral_power,
                 stim_compliance_pulses=sum(t['stim_compliance'] for t in local),rec_compliance_pulses=sum(t['rec_compliance'] for t in local),
                 rec_settle_pulses=sum(t['rec_settle'] for t in local),stim_settle_pulses=sum(t['stim_settle'] for t in local),
                 raw_first_return20_median_ms=q['median_ms'],first_return_resolved=q['n_resolved'],
                 raw_tail_return_median_ms=tail['median_ms'],tail_return_resolved=tail['n_resolved'],
                 dc_saved=meta['files'][0]['bandwidth']['dc_amplifier_data_saved'],timestamp_gaps=int(np.count_nonzero(np.diff(d['ticks'].astype(np.int64))!=1)),**rms)
        summary.append(row);records.append(dict(name=name,grounded=grounded,current=expected,data=d,ep=ep,fep=fep,rel=rel,freq=freq,power=power,baseline=baseline,rawbase=rawbase))
        print('ANALYZED',name,'actual',expected,'grounded',grounded,'compliance',row['stim_compliance_pulses'],'noise',row['initial_filtered_sigma_uV'],flush=True)
    core.save_csv(out/'summary.csv',summary);core.save_csv(out/'trial_metrics.csv',trial_rows)
    comparisons=[]
    for current in (1,2,5):
        pair=[r for r in records if r['current']==current];b=next(s for s in summary if s['current_uA']==current and not s['cage_grounded']);a=next(s for s in summary if s['current_uA']==current and s['cage_grounded'])
        comparisons.append(dict(current_uA=current,before_sigma_uV=b['initial_filtered_sigma_uV'],after_sigma_uV=a['initial_filtered_sigma_uV'],
                                noise_sigma_ratio_after_before=a['initial_filtered_sigma_uV']/b['initial_filtered_sigma_uV'],
                                harmonic_power_ratio_after_before=a['initial_harmonic_power_uV2']/b['initial_harmonic_power_uV2'],
                                before_compliance_pulses=b['stim_compliance_pulses'],after_compliance_pulses=a['stim_compliance_pulses'],
                                before_raw_rms_10_100ms_uV=b['raw_rms_10_100ms_uV'],after_raw_rms_10_100ms_uV=a['raw_rms_10_100ms_uV']))
        fig,ax=plt.subplots(3,2,figsize=(14,11))
        for r in sorted(pair,key=lambda r:r['grounded']):
            col='#1b9e77' if r['grounded'] else '#d95f02';label='cage grounded' if r['grounded'] else 'cage ungrounded'
            rel=r['rel'];med=np.median(r['ep'],axis=0);qlo=np.quantile(r['ep'],.1,axis=0);qhi=np.quantile(r['ep'],.9,axis=0)
            for aa in ax[0,:]:aa.plot(rel,med,color=col,label=label);aa.fill_between(rel,qlo,qhi,color=col,alpha=.12)
            ax[1,0].semilogy(r['freq'],r['power'],color=col,label=label)
            fs=float(r['data']['fs']);limit=min(len(r['baseline']),round(.1*fs));ax[1,1].plot(np.arange(limit)/fs*1000,r['baseline'][:limit],color=col,label=label,lw=.6)
            available=np.isfinite(r['fep']).sum(0);mean=np.divide(np.nansum(r['fep'],axis=0),available,out=np.full(r['fep'].shape[1],np.nan),where=available>0)
            ax[2,0].plot(rel,mean,color=col,label=label)
            local=[t for t in trial_rows if t['recording']==r['name']];values=np.sort([t['raw_tail_return_ms'] for t in local if t['raw_tail_return_ms'] is not None])
            if len(values):ax[2,1].step(values,np.arange(1,len(values)+1)/len(local),where='post',color=col,label=label)
        ax[0,0].set(xlim=(-2,20),ylabel='Median raw REC (uV)',title='Early artifact')
        ax[0,1].set(xlim=(-10,500),ylabel='Median raw REC (uV)',title='Median and 10-90% envelope')
        ax[1,0].set(xlim=(0,2000),xlabel='Frequency (Hz)',ylabel='Initial REC PSD (uV²/Hz)')
        ax[1,1].set(xlabel='Time in initial baseline (ms)',ylabel='Filtered REC (uV)',title='Equal-scale 300-5000 Hz baseline examples')
        ax[2,0].set(xlim=(-10,100),xlabel='Time from pulse onset (ms)',ylabel='Mean filtered REC (uV)')
        ax[2,1].set(xlim=(0,500),ylim=(0,1.02),xlabel='Last-excursion return time (ms)',ylabel='Fraction of all pulses returned')
        for aa in ax[0,:]:aa.axvline(0,color='black',lw=.6);aa.set_xlabel('Time from pulse onset (ms)')
        ax[0,0].legend();ax[1,0].legend();fig.suptitle(f'PBS {current} uA — external cage grounding; local/global settle ON in both recordings')
        fig.tight_layout();fig.savefig(out/f'cage_{current}uA.png',dpi=140);plt.close(fig)
    core.save_csv(out/'comparison.csv',comparisons)
    methods=dict(cage_status_source='Experimenter report; connection to controller rear terminal, not headstage GND',
                 cage_connected_while_powered=True,connection_moment_not_recorded=True,
                 annotations=annotations,settings=settings,
                 caveats=['Sequential before/after recordings, no randomized crossover','There is no tissue; waveforms are non-neural','No current or DC voltage measurement: DC not saved','First 0.2 s excluded from initial noise reference, not proof that any connection transient is absent','Compliance predates cage grounding','Grounding effect and damage cannot be inferred from timing of connection alone','Shared inputs are not independent controls','Raw-return criterion is operational and not a validated spike-safe boundary'])
    (out/'methods.json').write_text(json.dumps(methods,indent=2),encoding='utf-8')
    parts=['<!doctype html><meta charset="utf-8"><title>PBS cage grounding comparison</title>',
           '<style>body{font:16px system-ui;max-width:1200px;margin:30px auto}img{width:100%}td,th{padding:8px;border:1px solid #bbb}table{border-collapse:collapse}.note{background:#fff2d0;padding:15px}</style>',
           '<h1>PBS: external Faraday cage grounding</h1>',
           '<p class="note">All recordings use local/global Amp Settle. New folders are all named 5 uA, but actual commands are 5, 1 and 2 uA in chronological order, verified in RHS. Cage status is provided by the experimenter. Grounding was connected to the controller rear terminal while powered; the moment of connection itself was not recorded. This is not evidence of hardware damage. Compliance already existed before connection.</p>',
           '<p>Initial filtered noise: 300–5000 Hz, robust MAD estimate after excluding first 0.2 s and 20 ms before stimulation. Harmonic power is measured within ±2 Hz of 50 Hz multiples over 300–5000 Hz; absolute power and fraction must be distinguished. Raw response is per-pulse baseline-subtracted using -100 to -10 ms. Return-to-envelope criteria are sensitivity measures, not a validated clean window. No tissue, no neural interpretation.</p>',
           '<table><tr><th>Actual uA</th><th>Cage grounded</th><th>Pulses</th><th>STIM compliance</th><th>REC settle</th><th>Initial noise uV</th><th>Raw RMS 10-100 ms, uV</th></tr>']
    for r in summary:parts.append(f'<tr><td>{r["current_uA"]}</td><td>{r["cage_grounded"]}</td><td>{r["pulses"]}</td><td>{r["stim_compliance_pulses"]}/{r["pulses"]}</td><td>{r["rec_settle_pulses"]}/{r["pulses"]}</td><td>{r["initial_filtered_sigma_uV"]:.2f}</td><td>{r["raw_rms_10_100ms_uV"]:.1f}</td></tr>')
    parts.append('</table>')
    for current in (1,2,5):parts.append(f'<h2>{current} uA</h2><img src="cage_{current}uA.png">')
    parts.append('<p>'+' · '.join(f'<a href="{name}">{name}</a>' for name in ['summary.csv','comparison.csv','trial_metrics.csv','methods.json'])+'</p>')
    (out/'report.html').write_text('\n'.join(parts),encoding='utf-8')
    mainpage=base/'report.html';s=mainpage.read_text(encoding='utf-8');h='<h1>PBS, no tissue: Amp Settle off versus on</h1>'
    s=s.replace(h,h+'<section class="note"><h2>New: cage-grounded tests</h2><p>The three new recordings (actual 5, 1 and 2 uA) are analyzed separately, so cage grounding is not confounded with the original settle off/on comparison. <a href="cage_comparison/report.html">Open cage-grounding comparison</a>.</p></section>')
    mainpage.write_text(s,encoding='utf-8')
    print('DONE',out,flush=True)


if __name__=='__main__':main()
