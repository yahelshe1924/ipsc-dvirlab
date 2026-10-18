"""REC artifact diagnostics and baseline-fixed spike sensitivity analysis.

Outputs are descriptive; neither recovery heuristics nor threshold crossings
establish neural origin. Separate preparations are never pooled.
"""
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).parent/'_packages'))
import argparse
import csv
import html
import json
import contextlib
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from scipy.signal import butter,sosfiltfilt,find_peaks
import importrhsutilities as rhs
from spikes import runs


def save_csv(path, rows):
    if not rows:return
    with path.open('w',newline='',encoding='utf-8-sig') as f:
        w=csv.DictWriter(f,fieldnames=list(rows[0]));w.writeheader();w.writerows(rows)


def prepare(file,cache):
    target=cache/(file.stem+'.npz')
    if not target.exists():
        # Preserve the acquisition signal: do not apply the reader's optional
        # software notch a second time before diagnosing the artifact.
        old=rhs.apply_notch_filter
        rhs.apply_notch_filter=lambda *_:None
        try:
            d,present=rhs.load_file(str(file))
        finally:rhs.apply_notch_filter=old
        if not present:raise ValueError(f'No samples: {file}')
        ch=d['amplifier_channels']
        rec=[i for i,c in enumerate(ch) if c['custom_channel_name'].lower()=='rec']
        if len(rec)!=1:raise ValueError(f'Cannot identify unique REC: {file}')
        c=rec[0]
        stimulation=np.any(d['stim_data']!=0,axis=0)
        stimulated=np.flatnonzero(np.any(d['stim_data']!=0,axis=1))
        relevant=np.unique(np.r_[c,stimulated]).astype(int)
        flags={}
        for key in ('amp_settle_data','charge_recovery_data','compliance_limit_data'):
            array=d.get(key,np.zeros_like(d['stim_data'],dtype=bool))
            flags[key]=np.any(array[relevant],axis=0)
        np.savez_compressed(target,x=d['amplifier_data'][c],t=d['t'],active=stimulation,
                            fs=d['frequency_parameters']['amplifier_sample_rate'],
                            current=float(np.max(np.abs(d['stim_data']))),
                            frequencies=json.dumps(d['frequency_parameters'],default=str),**flags)
    with np.load(target) as z:return {k:z[k] for k in z.files}


def pulses(mask,fs):
    result=[]
    for s,e in runs(mask):
        if result and s-result[-1][1]<=round(.001*fs):result[-1]=(result[-1][0],e)
        else:result.append((s,e))
    return result


def filtered(d,groups,blank):
    fs=float(d['fs']);x=d['x'];valid=np.isfinite(x)&(np.abs(x)<6380)
    pad=round(blank*fs/1000);pre=round(.001*fs);guard=round(.005*fs)
    for s,e in groups:valid[max(0,s-pre):min(len(x),e+pad)]=False
    for key in ('amp_settle_data','charge_recovery_data','compliance_limit_data'):
        for s,e in runs(d[key]):valid[max(0,s-pre):min(len(x),e+pad)]=False
    gaps=np.flatnonzero(np.abs(np.diff(d['t'])*fs-1)>.1)+1
    valid[gaps]=False
    y=np.full(len(x),np.nan)
    sos=butter(3,[300,5000],btype='bandpass',fs=fs,output='sos')
    for s,e in runs(valid):
        if e-s<=max(100,2*guard+1):continue
        z=sosfiltfilt(sos,x[s:e]);y[s+guard:e-guard]=z[guard:-guard]
    return y


def detect(y,threshold,fs):
    found=[]
    for s,e in runs(np.isfinite(y)):
        ix,_=find_peaks(-y[s:e],height=threshold,distance=round(.001*fs))
        found.extend((ix+s).tolist())
    return np.array(found,dtype=int)


def window_stats(y,ev,groups,fs):
    clean=np.isfinite(y);mask=np.zeros(len(y),bool);before=mask.copy();trial=[]
    for s,e in groups:
        lo=max(0,s-round(.1*fs));hi=min(len(y),s+round(.1*fs))
        before[lo:s]=True;mask[s:hi]=True
        # Actual masks remove the pulse, post-pulse recovery and filter guard.
        ids=ev[(ev>=s)&(ev<hi)]
        preids=ev[(ev>=lo)&(ev<s)]
        trial.append(dict(onset_sample=s,post_events=len(ids),pre_events=len(preids),
                          post_exposure_s=float(clean[s:hi].sum()/fs),
                          pre_exposure_s=float(clean[lo:s].sum()/fs),
                          latencies_ms=','.join(f'{(i-s)/fs*1000:.3f}' for i in ids)))
    mask &=clean;before &=clean
    n=int(mask[ev].sum());b=int(before[ev].sum());ex=mask.sum()/fs;bx=before.sum()/fs
    return dict(post_n=n,post_s=ex,post_hz=n/ex if ex else np.nan,
                pre_n=b,pre_s=bx,pre_hz=b/bx if bx else np.nan),trial


def artifact(d,base,groups,out,rng):
    fs=float(d['fs']);bfs=float(base['fs']);half=round(.02*fs)
    epochs=[];usable=[]
    for s,e in groups:
        if s-half>=0 and s+half<=len(d['x']) and np.all(np.abs(np.diff(d['t'][s-half:s+half])*fs-1)<.1):
            ep=d['x'][s-half:s+half].copy();ep-=np.median(ep[:round(.019*fs)])
            epochs.append(ep);usable.append((s,e))
    if not epochs:return {},[]
    ep=np.array(epochs);rel=np.arange(-half,half)/fs*1000
    # Baseline pseudo-epochs establish empirical local fluctuation thresholds.
    bh=round(.02*bfs)
    centers=rng.integers(bh,len(base['x'])-bh,size=1000)
    bep=np.array([base['x'][s-bh:s+bh]-np.median(base['x'][s-bh:s-round(.001*bfs)]) for s in centers])
    bins=np.arange(0,20.0001,.5)
    amp=[];rough=[];bamp=[];brough=[]
    for l,r in zip(bins[:-1],bins[1:]):
        a=ep[:,half+round(l*fs/1000):half+round(r*fs/1000)]
        b=bep[:,bh+round(l*bfs/1000):bh+round(r*bfs/1000)]
        amp.append(np.sqrt(np.mean(a*a,axis=1)));rough.append(np.sqrt(np.mean(np.diff(a,axis=1)**2,axis=1)))
        bamp.extend(np.sqrt(np.mean(b*b,axis=1)).tolist());brough.extend(np.sqrt(np.mean(np.diff(b,axis=1)**2,axis=1)).tolist())
    amp=np.array(amp).T;rough=np.array(rough).T
    at=float(np.quantile(bamp,.995));rt=float(np.quantile(brough,.995))
    trial=[]
    for i,(s,e) in enumerate(usable):
        bad=((amp[i]>at)|(rough[i]>rt))
        hardware=np.zeros(len(d['x']),bool)
        for k in ('amp_settle_data','charge_recovery_data','compliance_limit_data'):hardware|=d[k]
        flags=hardware[s:min(len(hardware),s+half)]
        end=max((e-s)/fs*1000, (np.flatnonzero(flags)[-1]+1)/fs*1000 if flags.any() else 0)
        candidate=None
        for j in range(len(bad)-3):
            if bins[j]>=end and not bad[j:j+4].any():candidate=float(bins[j]);break
        trial.append(dict(pulse=i+1,artifact_heuristic_recovery_ms=candidate,
                          hardware_end_ms=end,clipped_samples=int(np.sum(np.abs(d['x'][s:s+half])>=6380))))
    fig,ax=plt.subplots(3,1,figsize=(12,10))
    ax[0].plot(rel,ep.T,alpha=.45,lw=.7)
    ax[0].set(xlim=(-2,20),ylabel='Raw REC minus pre median (uV)',title=out.name+' | acquisition signal, no extra software notch')
    ax[1].plot(bins[:-1],amp.T,alpha=.5);ax[1].axhline(at,color='black',ls='--',label='Baseline 99.5 percentile')
    ax[1].set(ylabel='0.5 ms raw RMS (uV)');ax[1].set_yscale('symlog',linthresh=1);ax[1].legend()
    ax[2].plot(bins[:-1],rough.T,alpha=.5);ax[2].axhline(rt,color='black',ls='--')
    ax[2].set(ylabel='0.5 ms derivative RMS',xlabel='Time from current onset (ms)');ax[2].set_yscale('symlog',linthresh=1)
    for a in ax:a.axvline(0,color='red',lw=.8)
    fig.tight_layout();fig.savefig(out/'artifact.png',dpi=150);plt.close(fig)
    resolved=[v['artifact_heuristic_recovery_ms'] for v in trial if v['artifact_heuristic_recovery_ms'] is not None]
    return dict(recovery_resolved=len(resolved),pulses_checked=len(trial),
                recovery_median_ms=float(np.median(resolved)) if resolved else None,
                recovery_max_ms=max(resolved) if resolved else None,
                baseline_raw_rms_limit_uV=at,baseline_derivative_limit_uV=rt),trial


def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('input',type=Path)
    p.add_argument('--output',type=Path,default=Path(__file__).parent/'baseline_comparison')
    a=p.parse_args();out=a.output;out.mkdir(parents=True,exist_ok=True)
    cache=out/'cache';cache.mkdir(exist_ok=True)
    files=sorted(a.input.rglob('*.rhs'));rng=np.random.default_rng(20261015)
    records={f.stem:prepare(f,cache) for f in files}
    base_names={1:next(n for n in records if n.startswith('baseline_')),
                2:next(n for n in records if n.startswith('baseline 2'))}
    bases={g:records[n] for g,n in base_names.items()}
    sigmas={};base_rows=[]
    for g,b in bases.items():
        y=filtered(b,[],0);v=y[np.isfinite(y)];sigmas[g]=float(np.median(np.abs(v-np.median(v)))/.67448975)
        for mult in (4,4.5,5):
            ev=detect(y,mult*sigmas[g],float(b['fs']))
            base_rows.append(dict(preparation=g,baseline=base_names[g],multiplier=mult,threshold_uV=mult*sigmas[g],
                                  events=len(ev),valid_s=len(v)/float(b['fs']),rate_hz=len(ev)/(len(v)/float(b['fs']))))
    save_csv(out/'baseline_rates.csv',base_rows)
    rows=[];artrows=[];report=[]
    for name,d in records.items():
        groups=pulses(d['active'],float(d['fs']))
        if not groups:continue
        g=2 if name.startswith('2nd') else 1;b=bases[g];fs=float(d['fs']);bfs=float(b['fs'])
        folder=out/name;folder.mkdir(exist_ok=True)
        artifact_summary,art_trials=artifact(d,b,groups,folder,rng)
        artrows.append(dict(recording=name,preparation=g,**artifact_summary));save_csv(folder/'artifact_trials.csv',art_trials)
        # Same number of separated pseudo-pulses in this preparation's baseline.
        # Uniform centers with deterministic jitter; no claim of independent repeats.
        bc=np.linspace(.15,len(b['x'])/bfs-.15,len(groups))
        bc+=rng.uniform(-.02,.02,len(groups))
        duration=float(np.median([(e-s)/fs for s,e in groups]))
        bg=[(round(t*bfs),round((t+duration)*bfs)) for t in bc]
        default=None
        for blank in (1,3,6):
            y=filtered(d,groups,blank);by=filtered(b,bg,blank)
            for mult in (4,4.5,5):
                threshold=mult*sigmas[g];ev=detect(y,threshold,fs);bev=detect(by,threshold,bfs)
                stat,trials=window_stats(y,ev,groups,fs);bst,_=window_stats(by,bev,bg,bfs)
                # Local noise reports recording changes independently of fixed threshold.
                v=y[np.isfinite(y)];sigma=float(np.median(np.abs(v-np.median(v)))/.67448975)
                row=dict(recording=name,preparation=g,current_uA=float(d['current']),blank_after_end_ms=blank,
                         filter_guard_ms=5,multiplier=mult,threshold_uV=threshold,noise_ratio_to_baseline=sigma/sigmas[g],
                         pulses=len(groups),**stat,baseline_pseudo_post_n=bst['post_n'],
                         baseline_pseudo_post_s=bst['post_s'],baseline_pseudo_post_hz=bst['post_hz'])
                rows.append(row)
                if blank==3 and mult==4.5:
                    save_csv(folder/'paired_trials.csv',trials);default=(y,ev,by,bev,bg,row)
                    np.savez_compressed(folder/'candidate_events.npz',time_s=d['t'][ev],peak_uV=y[ev])
        y,ev,by,bev,bg,row=default
        fig,ax=plt.subplots(3,1,figsize=(12,10))
        ras=[(ev[(ev>=s-round(.1*fs))&(ev<s+round(.1*fs))]-s)/fs*1000 for s,e in groups]
        bras=[(bev[(bev>=s-round(.1*bfs))&(bev<s+round(.1*bfs))]-s)/bfs*1000 for s,e in bg]
        for aa,rr,label in [(ax[0],ras,'Stimulus'),(ax[1],bras,'Baseline pseudo-stimulus')]:
            aa.eventplot(rr);aa.set(xlim=(-100,100),ylim=(-.5,len(rr)-.5),ylabel=label+' trial');aa.axvline(0,color='red')
        ax[0].set_title(name+f' | fixed threshold {row["threshold_uV"]:.2f} uV')
        ax[1].set_xlabel('Time relative to real / pseudo onset (ms)')
        # All recorded candidates; distinguish from stimulus-locked candidates.
        npre=round(.0007*fs);npost=round(.0015*fs)
        wave=[y[e-npre:e+npost] for e in ev if e>=npre and e+npost<=len(y) and np.isfinite(y[e-npre:e+npost]).all()]
        if wave:
            wave=np.array(wave);wt=np.arange(-npre,npost)/fs*1000
            ax[2].plot(wt,wave[:200].T,color='gray',alpha=.2,lw=.7);ax[2].plot(wt,np.median(wave,axis=0),color='navy')
        ax[2].set(xlabel='Time from candidate peak (ms)',ylabel='Filtered uV',title='Candidates from entire recording; not sorted neural units')
        fig.tight_layout();fig.savefig(folder/'comparison.png',dpi=150);plt.close(fig)
        report.append((name,row))
        print('COMPLETED',name,flush=True)
    save_csv(out/'sensitivity.csv',rows);save_csv(out/'artifact_summary.csv',artrows)
    metadata=dict(seed=20261015,filter='third-order Butterworth 300-5000 Hz forward/backward, clean segments only',
                  software_notch=False,baseline_files=base_names,baseline_noise_sigma_uV=sigmas,
                  artifact_rule='First 2 ms of 0.5 ms bins with raw RMS and derivative RMS below baseline pooled 99.5 percentiles, after pulse and flags. Heuristic, not proof of artifact-free neural signal.',
                  caveats=['No independent artifact-only control; true responses and artifacts may overlap.',
                           'Baseline pseudo-trials reuse one short baseline recording per preparation, not biological replicates.',
                           'Baseline threshold sensitivity is descriptive; no inferential significance claim.',
                           'Filtering excludes an additional 5 ms on both sides of every clean segment.',
                           'Noise can differ between stimulation and baseline; inspect noise ratio.',
                           'Preparation assignment inferred from folder names; REC label verified per file.'])
    (out/'methods.json').write_text(json.dumps(metadata,indent=2),encoding='utf-8')
    parts=['<!doctype html><meta charset="utf-8"><title>Artifact and baseline comparison</title>',
           '<style>body{font:16px system-ui;max-width:1100px;margin:auto}img{width:100%}td,th{padding:8px;border:1px solid #ccc}table{border-collapse:collapse}</style>',
           '<h1>REC: artifact diagnostics and baseline-fixed detection</h1>',
           '<p>Same absolute threshold per preparation, estimated from its baseline. 300–5000 Hz, negative peaks, 1 ms minimum spacing. Default shown: 4.5 × baseline noise, 3 ms after pulse end plus 5 ms filter guard. Masked periods are unobservable. No claim of confirmed neural spikes or statistical significance.</p>',
           '<p>Artifact recovery plots are a heuristic: return below baseline 99.5 percentile limits for 2 ms. This cannot distinguish true evoked activity from residual artifact. Inspect individual trials. Pseudo-trials reuse the short baseline and are not independent biological repeats.</p>',
           '<table><tr><th>Recording</th><th>Noise / baseline</th><th>Before count / seconds</th><th>After count / seconds</th><th>Baseline pseudo after count / seconds</th></tr>']
    for name,r in report:
        parts.append(f'<tr><td>{html.escape(name)}</td><td>{r["noise_ratio_to_baseline"]:.2f}</td><td>{r["pre_n"]} / {r["pre_s"]:.3f}</td><td>{r["post_n"]} / {r["post_s"]:.3f}</td><td>{r["baseline_pseudo_post_n"]} / {r["baseline_pseudo_post_s"]:.3f}</td></tr>')
    parts.append('</table>')
    for name,r in report:
        parts.extend(['<h2>'+html.escape(name)+'</h2>',f'<img loading="lazy" src="{html.escape(name)}/artifact.png">',f'<img loading="lazy" src="{html.escape(name)}/comparison.png">'])
    (out/'report.html').write_text('\n'.join(parts),encoding='utf-8')
    print('DONE',out,flush=True)


if __name__=='__main__':main()
