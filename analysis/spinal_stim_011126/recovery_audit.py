"""Conservative raw-recovery rejection sensitivity, not artifact subtraction.

Large post-stimulus excursions are not interpreted as spikes. Missing clean
time remains missing, never evidence of biological silence.
"""
from pathlib import Path
import csv
import json
import rhs_io
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from run_analysis import core


def main():
    out=Path(__file__).parent/'results'
    with (out/'manifest.csv').open(encoding='utf-8-sig') as f:manifest=list(csv.DictReader(f))
    with (out/'threshold_references.csv').open(encoding='utf-8-sig') as f:refs={int(r['prep']):float(r['sigma_uV']) for r in csv.DictReader(f)}
    recovery=[];summary=[];audit=[]
    for r in manifest:
        name=r['recording'];fs=30000
        with np.load(out/'cache'/(name+'.npz')) as z:d={k:z[k] for k in z.files}
        fs=float(d['fs']);x=d['x'][0];d['groups']=core.groups_of_pulses(d['current'],fs)
        flags=np.any((d['words']&57344)!=0,axis=0)
        software_mask=np.zeros(len(x),bool)
        pertrial=[]
        for i,(s,e) in enumerate(d['groups']):
            pre=x[max(0,s-round(.1*fs)):max(0,s-round(.01*fs))]
            center=float(np.median(pre));sigma=core.robust_sigma(pre);limit=max(150,5*sigma)
            end=min(len(x),s+round(.3*fs));raw=x[s:end]-center
            severe=bool(np.max(np.abs(raw))>=max(1000,10*sigma))
            over5mv=np.abs(raw)>=5000
            resolved=None
            if severe:
                # 0.5 ms block maxima; require 5 ms continuously inside a
                # baseline-derived raw envelope and no saved hardware flags.
                step=round(.0005*fs);nb=(end-s)//step
                rawmax=np.max(np.abs(raw[:nb*step]).reshape(nb,step),axis=1)
                badflag=np.any(flags[s:s+nb*step].reshape(nb,step),axis=1)
                good=(rawmax<=limit)&~badflag
                for j in range(nb-9):
                    if s+j*step>=e and good[j:j+10].all():resolved=(j*step)/fs*1000;break
                rejection_end=end if resolved is None else min(len(x),s+round((resolved+3)*fs/1000))
                software_mask[s:rejection_end]=True
            entry=dict(recording=name,prep=r['prep'],state=r['state'],current_uA=r['current_actual_uA'],pulse=i+1,
                       onset_s=s/fs,severe_excursion=severe,peak_abs_raw_uV=float(np.max(np.abs(raw))),
                       samples_beyond_5mV=int(over5mv.sum()),raw_envelope_limit_uV=limit,
                       raw_return_ms=resolved,raw_return_unresolved_by_300ms=severe and resolved is None)
            pertrial.append(entry);recovery.append(entry)
        with np.load(out/name/'candidate_events.npz') as z:old=np.array(z['sample'])
        oldy=core.filter_signal(d)
        # A temporary NaN mask forces the existing filter to use new separate
        # clean segments. Raw data on disk are never changed or interpolated.
        d2=dict(d);d2['x']=d['x'].copy();d2['x'][0,software_mask]=np.nan
        newy=core.filter_signal(d2);newevents=core.detect(newy,4.5*refs[int(r['prep'])],fs)
        for low,high in ((10,100),(100,300)):
            stat,trials=core.paired_windows(newy,newevents,d['groups'],fs,low,high)
            summary.append(dict(recording=name,prep=r['prep'],state=r['state'],current_uA=r['current_actual_uA'],
                                window_start_ms=low,window_end_ms=high,severe_trials=sum(t['severe_excursion'] for t in pertrial),
                                raw_return_unresolved_trials=sum(t['raw_return_unresolved_by_300ms'] for t in pertrial),**stat))
        for event in old:
            # Audit only events in 10-100 ms after an actual pulse.
            preceding=[(i,s,e) for i,(s,e) in enumerate(d['groups']) if round(.01*fs)<=event-s<round(.1*fs)]
            if not preceding:continue
            i,s,e=preceding[0];lo=max(0,event-round(.002*fs));hi=min(len(x),event+round(.002*fs))
            audit.append(dict(recording=name,prep=r['prep'],state=r['state'],current_uA=r['current_actual_uA'],pulse=i+1,
                              event_latency_ms=(event-s)/fs*1000,filtered_peak_uV=float(oldy[event]),raw_at_peak_uV=float(x[event]),
                              raw_abs_max_within_2ms_uV=float(np.max(np.abs(x[lo:hi]))),
                              severe_trial=pertrial[i]['severe_excursion'],raw_return_ms=pertrial[i]['raw_return_ms'],
                              retained_as_observable_after_recovery=bool(np.isfinite(newy[event]))))
        if len(old):
            candidate=np.array([e for e in old if any(round(.01*fs)<=e-s<round(.1*fs) for s,t in d['groups'])])
            if len(candidate):
                chosen=candidate[:min(4,len(candidate))];fig,ax=plt.subplots(len(chosen),2,figsize=(12,3*len(chosen)),squeeze=False)
                for j,event in enumerate(chosen):
                    s=max(s for s,e in d['groups'] if s<=event)
                    lo=max(0,event-round(.01*fs));hi=min(len(x),event+round(.01*fs));tt=(np.arange(lo,hi)-s)/fs*1000
                    ax[j,0].plot(tt,x[lo:hi]);ax[j,0].axvline((event-s)/fs*1000,color='red');ax[j,0].axhline(-5000,color='gray',ls='--');ax[j,0].axhline(5000,color='gray',ls='--')
                    ax[j,1].plot(tt,oldy[lo:hi],label='original filtered');ax[j,1].plot(tt,newy[lo:hi],label='recovery-rejected filtered')
                    ax[j,1].axvline((event-s)/fs*1000,color='red');ax[j,1].legend(fontsize=8)
                    ax[j,0].set(xlabel='Time from pulse onset (ms)',ylabel='Raw REC (uV)');ax[j,1].set(xlabel='Time from pulse onset (ms)',ylabel='Filtered REC (uV)')
                fig.suptitle(name+' | examples of original threshold candidates during large raw excursions')
                fig.tight_layout();fig.savefig(out/'figures'/(name+'_recovery_audit.png'),dpi=140);plt.close(fig)
        print('RECOVERY',name,'severe',sum(t['severe_excursion'] for t in pertrial),'unresolved',sum(t['raw_return_unresolved_by_300ms'] for t in pertrial),'remaining events',len(newevents),flush=True)
    core.save_csv(out/'raw_recovery_trials.csv',recovery);core.save_csv(out/'recovery_rejected_summary.csv',summary);core.save_csv(out/'candidate_raw_audit.csv',audit)
    page=out/'report.html';s=page.read_text(encoding='utf-8')
    intro='<h2>Conservative raw-recovery audit</h2><p class="note">Some original threshold candidates occur during millivolt-scale raw excursions. These are not validated neural spikes. As a sensitivity check, trials exceeding max(1000 uV, 10 × pre-pulse raw noise) are rejected until raw voltage stays within max(150 uV, 5 × pre-pulse raw noise) for 5 ms with no hardware flags; search ends at 300 ms. An additional 3 ms rejection and 5 ms filter guard follow. This may discard genuine responses and is not validated artifact separation. Zero usable exposure means no conclusion, not zero activity.</p><table><tr><th>SC</th><th>State</th><th>uA</th><th>Window ms</th><th>Severe trials</th><th>Valid matched seconds</th><th>Pre events</th><th>Post events</th></tr>'
    for row in summary:
        if row['window_start_ms']==10:intro+=f'<tr><td>{row["prep"]}</td><td>{row["state"]}</td><td>{float(row["current_uA"]):g}</td><td>10-100</td><td>{row["severe_trials"]}/50</td><td>{row["matched_exposure_s"]:.3f}</td><td>{row["pre_n"]}</td><td>{row["post_n"]}</td></tr>'
    intro+='</table><p><a href="raw_recovery_trials.csv">Raw recovery trials</a> · <a href="recovery_rejected_summary.csv">Recovery-rejected comparison</a> · <a href="candidate_raw_audit.csv">Original candidate raw audit</a></p>'
    for f in sorted((out/'figures').glob('*_recovery_audit.png')):intro+='<img loading="lazy" src="figures/'+f.name+'">'
    s=s.replace('<h2>Paired responses</h2>',intro+'<h2>Paired responses: initial fixed-window detector</h2>');page.write_text(s,encoding='utf-8')


if __name__=='__main__':main()
