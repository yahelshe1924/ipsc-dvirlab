"""Paired intact/cut analysis, October 18, 2026.

Negative threshold crossings are candidate events, not confirmed neural spikes.
Raw data are retained; no additional notch or artifact interpolation is applied.
"""
from pathlib import Path
import sys
import csv
import json
import html
import argparse
import re
import numpy as np
from rhs_io import load_session
from scipy.signal import butter,sosfiltfilt,find_peaks,welch
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt


def runs(mask):
    e=np.diff(np.r_[False,mask,False].astype(np.int8))
    return list(zip(np.flatnonzero(e==1),np.flatnonzero(e==-1)))


def save_csv(path,rows):
    if not rows:return
    with path.open('w',newline='',encoding='utf-8-sig') as f:
        w=csv.DictWriter(f,fieldnames=list(rows[0]));w.writeheader();w.writerows(rows)


def groups_of_pulses(current,fs):
    out=[]
    for s,e in runs(current!=0):
        if out and s-out[-1][1]<=round(.001*fs):out[-1]=(out[-1][0],e)
        else:out.append((s,e))
    return out


def filter_signal(d,blank=3,guard=5,channel=0,band=(300,5000)):
    fs=float(d['fs']);x=d['x'][channel];valid=np.isfinite(x)&(np.abs(x)<6380)
    pre=round(.001*fs);post=round(blank*fs/1000);g=round(guard*fs/1000)
    for s,e in d['groups']:valid[max(0,s-pre):min(len(x),e+post)]=False
    # Settle, charge recovery and compliance on REC and actual STIM channel.
    flags=np.any((d['words']&np.uint16(57344))!=0,axis=0)
    for s,e in runs(flags):valid[max(0,s-pre):min(len(x),e+post)]=False
    gaps=np.flatnonzero(np.diff(d['ticks'].astype(np.int64))!=1)+1
    valid[gaps]=False
    y=np.full(len(x),np.nan,dtype=np.float32)
    sos=butter(3,band,btype='bandpass',fs=fs,output='sos')
    for s,e in runs(valid):
        if e-s<max(100,2*g+1):continue
        z=sosfiltfilt(sos,x[s:e])
        if g:y[s+g:e-g]=z[g:-g]
        else:y[s:e]=z
    return y


def robust_sigma(values):
    values=np.asarray(values);values=values[np.isfinite(values)]
    return float(np.median(np.abs(values-np.median(values)))/.6744897501960817) if len(values) else float('nan')


def pre_values(y,groups,fs):
    return np.concatenate([y[max(0,s-round(.2*fs)):max(0,s-round(.02*fs))] for s,e in groups])


def detect(y,threshold,fs):
    out=[]
    for s,e in runs(np.isfinite(y)):
        ix,_=find_peaks(-y[s:e],height=threshold,distance=max(1,round(.001*fs)))
        out.extend((ix+s).tolist())
    return np.array(out,dtype=np.int64)


def paired_windows(y,events,groups,fs,low=10,high=100):
    offsets=np.arange(round(low*fs/1000),round(high*fs/1000))
    event_mask=np.zeros(len(y),bool);event_mask[events]=True
    clean=np.isfinite(y);trial=[]
    for i,(s,e) in enumerate(groups):
        offsets_here=offsets[(s-offsets>=0)&(s+offsets<len(y))]
        eligible=clean[s-offsets_here]&clean[s+offsets_here]
        off=offsets_here[eligible]
        npre=int(event_mask[s-off].sum());npost=int(event_mask[s+off].sum());seconds=len(off)/fs
        trial.append(dict(pulse=i+1,pre_n=npre,post_n=npost,matched_s=seconds,
                          pre_hz=npre/seconds if seconds else np.nan,
                          post_hz=npost/seconds if seconds else np.nan,
                          delta_hz=(npost-npre)/seconds if seconds else np.nan,
                          post_latency_ms=','.join(f'{(i-s)/fs*1000:.3f}' for i in events[(events>=s+round(low*fs/1000))&(events<s+round(high*fs/1000))] if clean[i] and clean[s-(i-s)])))
    ex=sum(t['matched_s'] for t in trial);pre=sum(t['pre_n'] for t in trial);post=sum(t['post_n'] for t in trial)
    return dict(pre_n=pre,post_n=post,matched_exposure_s=ex,
                pre_hz=pre/ex if ex else np.nan,post_hz=post/ex if ex else np.nan,
                delta_hz=(post-pre)/ex if ex else np.nan,
                responding_trials=sum(t['post_n']>0 for t in trial),usable_trials=sum(t['matched_s']>0 for t in trial)),trial


def lock_epochs(x,groups,fs,pre=20,post=100):
    a=round(pre*fs/1000);b=round(post*fs/1000);eps=[];ids=[]
    for i,(s,e) in enumerate(groups):
        if s>=a and s+b<=len(x):eps.append(x[s-a:s+b]);ids.append(i)
    return np.array(eps),np.arange(-a,b)/fs*1000,ids


def summary_figure(records,prep,current,folder):
    pair=[r for r in records if r['prep']==prep and r['current_label']==current]
    if len(pair)!=2:return
    fig,ax=plt.subplots(5,1,figsize=(12,14));colors={'intact':'#2166ac','cut':'#b2182b'}
    baseline_limit=[];rasteroffset=0
    for r in sorted(pair,key=lambda r:r['state'],reverse=True):
        d=r['data'];fs=float(d['fs']);col=colors[r['state']];y=r['filtered'];events=r['events']
        ep,rel,_=lock_epochs(d['x'][0],d['groups'],fs,20,100)
        ep=ep-np.median(ep[:,(rel>=-20)&(rel<-2)],axis=1)[:,None]
        # Median and 10-90% trial envelope avoid interpreting means dominated by one trial.
        for a,window in [(ax[0],(-2,20)),(ax[1],(-20,100))]:
            step=max(1,round(fs/15000));tt=rel[::step];v=ep[:,::step]
            a.plot(tt,np.median(v,axis=0),color=col,label=r['state'])
            a.fill_between(tt,np.quantile(v,.1,axis=0),np.quantile(v,.9,axis=0),color=col,alpha=.15)
            a.set_xlim(window)
        fep,fr,_=lock_epochs(y,d['groups'],fs,20,100)
        available=np.isfinite(fep).sum(0)
        mean=np.divide(np.nansum(fep,axis=0),available,out=np.full(fep.shape[1],np.nan),where=available>0)
        ax[2].plot(fr,mean,color=col,label=r['state'])
        ras=[(events[(events>=s-round(.1*fs))&(events<s+round(.2*fs))]-s)/fs*1000 for s,e in d['groups']]
        ax[3].eventplot(ras,lineoffsets=np.arange(len(ras))+rasteroffset,colors=col,linelengths=.8)
        rasteroffset+=len(ras)+3
        edges=np.arange(-100,205,5);counts=np.zeros(len(edges)-1);ex=np.zeros_like(counts)
        for (s,e),rr in zip(d['groups'],ras):
            counts+=np.histogram(rr,edges)[0]
            lo=max(0,s-round(.1*fs));hi=min(len(y),s+round(.2*fs));tt=(np.arange(lo,hi)-s)/fs*1000
            ex+=np.histogram(tt[np.isfinite(y[lo:hi])],edges)[0]/fs
        rate=np.divide(counts,ex,out=np.full_like(counts,np.nan),where=ex>0)
        ax[4].stairs(rate,edges,color=col,label=r['state'])
    ax[0].set(title=f'SC{prep} | {current} uA | fixed threshold {pair[0]["threshold"]:.2f} uV',ylabel='Raw REC (uV)')
    ax[1].set(ylabel='Raw REC (uV)',title='Median and 10-90% trial envelope; baseline-subtracted')
    ax[2].set(ylabel='Mean filtered REC (uV)',xlim=(-20,100),title='300-5000 Hz; masked samples omitted')
    ax[3].set(ylabel='Trial index: intact then cut',xlim=(-100,200),ylim=(-1,rasteroffset),title='Negative threshold candidates; not sorted neural spikes')
    ax[4].set(ylabel='Candidates / valid second',xlabel='Time from stored current onset (ms)',xlim=(-100,200),title='Exposure-corrected PSTH, 5 ms bins')
    for a in ax:
        a.axvline(0,color='black',lw=.6)
    for a in (ax[2],ax[3],ax[4]):a.axvspan(-6,8.4,color='gray',alpha=.15)
    ax[0].legend();ax[4].legend();fig.tight_layout();fig.savefig(folder/f'SC{prep}_{current}uA_pair.png',dpi=140);plt.close(fig)


def qc_plot(r,folder):
    d=r['data'];fs=float(d['fs']);x=d['x'][0];y=r['filtered'];events=r['events'];n=len(x)
    fig,ax=plt.subplots(4,1,figsize=(12,10),sharex=True)
    step=round(.005*fs);bins=n//step;tt=np.arange(bins)*step/fs
    raw=x[:bins*step].reshape(bins,step)
    ax[0].fill_between(tt,raw.min(1),raw.max(1),color='#2166ac',alpha=.7)
    ax[0].set(ylabel='Raw REC envelope (uV)',title=r['name'])
    nsec=n//round(fs);sigma=[]
    for i in range(nsec):sigma.append(robust_sigma(y[i*round(fs):(i+1)*round(fs)]))
    ax[1].plot(np.arange(nsec)+.5,sigma);ax[1].axhline(r['sigma_ref'],color='black',ls='--',label='SC intact 5 uA initial reference')
    ax[1].set(ylabel='Filtered noise estimate (uV)');ax[1].legend(fontsize=8)
    edges=np.arange(0,n/fs+1,1);counts=np.histogram(events/fs,edges)[0]
    exposure=np.histogram(np.flatnonzero(np.isfinite(y))/fs,edges)[0]/fs
    rates=np.divide(counts,exposure,out=np.full(counts.shape,np.nan),where=exposure>0)
    ax[2].stairs(rates,edges);ax[2].set(ylabel='Candidates/valid s')
    for i in range(min(5,len(d['x']))):
        v=d['x'][i];ax[3].plot(np.arange(nsec)+.5,[np.std(v[j*round(fs):(j+1)*round(fs)]) for j in range(nsec)],label=r['meta']['files'][0]['selected_channels'][i]['native_channel_name'])
    ax[3].set(ylabel='Raw std by channel (uV)',xlabel='Time from recording start (s)');ax[3].legend(ncol=5,fontsize=8)
    for a in ax:
        for s,e in d['groups']:a.axvline(s/fs,color='red',alpha=.12,lw=.4)
        if d['groups']:a.axvspan(0,d['groups'][0][0]/fs,color='green',alpha=.08)
    fig.tight_layout();fig.savefig(folder/(r['name']+'_QC.png'),dpi=130);plt.close(fig)


def read_impedance(input_path,out):
    rows=[]
    for f in sorted(input_path.glob('*.csv')):
        name=f.name.lower();prep=3 if '3rd' in name else 2 if ('2nd' in name or '2ns' in name) else 1
        state='cut' if 'after' in name else 'intact'
        with f.open(encoding='utf-8-sig') as stream:
            for row in csv.DictReader(stream):
                rows.append(dict(file=f.name,prep=prep,state=state,channel=row['Channel Number'],label=row['Channel Name'],
                                 magnitude_ohm=float(row['Impedance Magnitude at 1000 Hz (ohms)']),phase_deg=float(row['Impedance Phase at 1000 Hz (degrees)'])))
    save_csv(out/'impedance_all_channels.csv',rows)
    selected=[r for r in rows if r['label'].lower() in ('rec','stim')];save_csv(out/'impedance_rec_stim.csv',selected)
    fig,ax=plt.subplots(1,2,figsize=(10,4))
    for a,label,scale in [(ax[0],'rec',1e6),(ax[1],'stim',1)]:
        for prep in (1,2,3):
            pair=sorted([r for r in selected if r['prep']==prep and r['label'].lower()==label],key=lambda r:r['state'],reverse=True)
            a.plot([0,1],[r['magnitude_ohm']/scale for r in pair],'-o',label=f'SC{prep}')
        a.set_xticks([0,1],['intact','cut']);a.set_ylabel('REC impedance (MOhm)' if label=='rec' else 'STIM impedance (Ohm)');a.legend()
    fig.suptitle('1 kHz impedance: reported values, not validated contact quality');fig.tight_layout();fig.savefig(out/'impedance.png',dpi=150);plt.close(fig)
    return selected


def main():
    p=argparse.ArgumentParser();p.add_argument('input',type=Path);p.add_argument('--output',type=Path,default=Path(__file__).parent/'results');a=p.parse_args()
    out=a.output;out.mkdir(parents=True,exist_ok=True);figures=out/'figures';figures.mkdir(exist_ok=True)
    folders=sorted([f for f in a.input.iterdir() if f.is_dir() and list(f.glob('*.rhs'))],key=lambda f:f.name[-6:])
    if len(folders)!=18:raise ValueError(f'Expected 18 sessions, found {len(folders)}; review manifest')
    impedance=read_impedance(a.input,out)
    records=[];manifest=[]
    for i,f in enumerate(folders):
        prep=i//6+1;state='intact' if i%6<3 else 'cut';current_label=(5,20,100)[i%3]
        d,meta=load_session(f,out/'cache');fs=float(d['fs']);d['groups']=groups_of_pulses(d['current'],fs)
        peak=float(np.max(np.abs(d['current'])))
        if abs(peak-current_label)>1:raise ValueError(f'Unexpected current {peak}: {f.name}')
        rec=dict(name=f.name,prep=prep,state=state,current_label=current_label,data=d,meta=meta)
        records.append(rec)
        starts=np.array([s for s,e in d['groups']]);widths=[(e-s)/fs*1000 for s,e in d['groups']]
        row=dict(recording=f.name,prep=prep,state=state,current_label_uA=current_label,stored_peak_uA=peak,
                 rhs_files=len(meta['files']),duration_s=len(d['ticks'])/fs,pulses=len(starts),
                 pre_first_pulse_s=float(starts[0]/fs) if len(starts) else None,
                 post_last_pulse_s=float((len(d['ticks'])-d['groups'][-1][1])/fs) if len(starts) else None,
                 pulse_width_median_ms=float(np.median(widths)) if widths else None,
                 interpulse_median_s=float(np.median(np.diff(starts))/fs) if len(starts)>1 else None,
                 timestamp_gaps=int(np.sum(np.diff(d['ticks'].astype(np.int64))!=1)),
                 rec_impedance_header_ohm=meta['files'][0]['selected_channels'][0]['electrode_impedance_magnitude'],
                 rec_phase_header_deg=meta['files'][0]['selected_channels'][0]['electrode_impedance_phase'],
                 compliance_rec_samples=int(np.sum(d['words'][0]&32768!=0)),
                 compliance_stim_samples=int(np.sum(d['words'][1]&32768!=0)),
                 rec_near_rail_fraction=float(np.mean(np.abs(d['x'][0])>=6380)),
                 active_channels=';'.join(meta['files'][0]['active_stim_channels']))
        manifest.append(row);print('MAPPED',prep,state,current_label,len(starts),f.name,flush=True)
    save_csv(out/'manifest.csv',manifest)
    # One common reference per preparation, independent of later pulse responses.
    refs={};refrows=[]
    for prep in (1,2,3):
        r=next(r for r in records if r['prep']==prep and r['state']=='intact' and r['current_label']==5)
        y=filter_signal(r['data']);fs=float(r['data']['fs']);first=r['data']['groups'][0][0]
        v=y[:max(0,first-round(.02*fs))]
        source='Initial no-stimulus segment, intact 5 uA; 20 ms before first pulse excluded'
        if np.isfinite(v).sum()<.5*fs:
            v=pre_values(y,r['data']['groups'],fs)
            source='Fallback: intact 5 uA, -200 to -20 ms before each pulse; insufficient initial baseline'
        refs[prep]=robust_sigma(v)
        refrows.append(dict(prep=prep,reference_recording=r['name'],reference=source,
                            sigma_uV=refs[prep],finite_reference_s=float(np.isfinite(v).sum()/fs)))
    save_csv(out/'threshold_references.csv',refrows)
    sensitivity=[];primary=[];qcrows=[];rng=np.random.default_rng(181026)
    for r in records:
        d=r['data'];fs=float(d['fs']);trials_default=[]
        for blank in (1,3,6):
            for guard in (2,5):
                y=filter_signal(d,blank,guard)
                for mult in (4,4.5,5):
                    threshold=refs[r['prep']]*mult;events=detect(y,threshold,fs)
                    for low,high in ((2,10),(10,100),(100,300)):
                        stat,trials=paired_windows(y,events,d['groups'],fs,low,high)
                        row=dict(recording=r['name'],prep=r['prep'],state=r['state'],current_uA=r['current_label'],
                                 blank_ms=blank,guard_ms=guard,multiplier=mult,threshold_uV=threshold,
                                 window_start_ms=low,window_end_ms=high,**stat)
                        sensitivity.append(row)
                        if blank==3 and guard==5 and mult==4.5 and low==10:
                            trials_default=trials;r['filtered']=y;r['events']=events;r['threshold']=threshold;r['sigma_ref']=refs[r['prep']]
                            vals=np.array([t['delta_hz'] for t in trials if np.isfinite(t['delta_hz'])]);bootstrap=rng.choice(vals,(2000,len(vals)),replace=True).mean(1)
                            row.update(delta_trial_bootstrap_low=float(np.quantile(bootstrap,.025)),delta_trial_bootstrap_high=float(np.quantile(bootstrap,.975)))
                            primary.append(row.copy())
        folder=out/r['name'];folder.mkdir(exist_ok=True);save_csv(folder/'primary_trials.csv',trials_default)
        y=r['filtered'];events=r['events'];clean=np.isfinite(y);npre=d['groups'][0][0]
        sigma=robust_sigma(pre_values(y,d['groups'],fs))
        qc=dict(recording=r['name'],prep=r['prep'],state=r['state'],current_uA=r['current_label'],
                pre_pulse_sigma_uV=sigma,sigma_ratio_to_reference=sigma/refs[r['prep']],
                candidates_whole_recording=len(events),valid_s=float(clean.sum()/fs),
                before_first_pulse_candidates=int(np.sum(events<npre)),before_first_pulse_valid_s=float(clean[:npre].sum()/fs),
                before_first_pulse_sigma_uV=robust_sigma(y[:npre]))
        qcrows.append(qc)
        np.savez_compressed(folder/'primary_events.npz',time_s=events/fs,peak_uV=y[events])
        # Raw epoch arrays retain full-resolution single trials for review.
        ep,rel,ids=lock_epochs(d['x'][0],d['groups'],fs,20,100)
        np.savez_compressed(folder/'raw_epochs.npz',epochs_uV=ep,time_ms=rel,trial_ids=ids)
        qc_plot(r,figures)
        print('ANALYZED',r['prep'],r['state'],r['current_label'], 'pre/post',primary[-1]['pre_n'],primary[-1]['post_n'],flush=True)
    # Ensure common keys across rows; primary bootstrap fields are saved separately.
    save_csv(out/'sensitivity.csv',[{k:v for k,v in row.items() if not k.startswith('delta_trial_bootstrap')} for row in sensitivity])
    save_csv(out/'primary_summary.csv',primary);save_csv(out/'signal_quality.csv',qcrows)
    for prep in (1,2,3):
        for current in (5,20,100):summary_figure(records,prep,current,figures)
    fig,ax=plt.subplots(1,3,figsize=(13,4),sharey=True)
    for j,current in enumerate((5,20,100)):
        for prep in (1,2,3):
            pair=sorted([row for row in primary if row['prep']==prep and row['current_uA']==current],key=lambda row:row['state'],reverse=True)
            ax[j].plot([0,1],[row['delta_hz'] for row in pair],'-o',label=f'SC{prep}')
        ax[j].axhline(0,color='black',ls='--',lw=.7);ax[j].set_xticks([0,1],['intact','cut']);ax[j].set_title(f'{current} uA');ax[j].legend()
    ax[0].set_ylabel('Post minus mirrored pre rate (candidates/s)');fig.suptitle('10-100 ms; common threshold within each preparation; candidates are not verified spikes')
    fig.tight_layout();fig.savefig(out/'paired_response.png',dpi=150);plt.close(fig)
    write_report(out,records,manifest,primary,qcrows,impedance,refrows)
    print('DONE',out,flush=True)


def write_report(out,records,manifest,primary,qc,impedance,refs):
    parts=['<!doctype html><meta charset="utf-8"><title>Intact versus cut SC — October 18, 2026</title>',
           '<style>body{font:16px system-ui;max-width:1200px;margin:30px auto;color:#172330}img{width:100%}table{border-collapse:collapse;font-size:14px}td,th{padding:7px;border:1px solid #bbb}p{line-height:1.5}.warning{background:#fff2d0;padding:16px}</style>',
           '<h1>Intact versus cut spinal cord — 18 October 2026</h1>',
           '<p class="warning">Exploratory candidate-event analysis, not spike sorting. REC impedance is reported at 27–46 MOhm with unusual phases: contact, wiring and impedance measurement require validation. A lack of detected responses does not establish lack of neural activation. The experimenter confirmed a cut between STIM and REC, a short no-stimulation period at each recording start, and an insulated platinum REC electrode with an exposed penetrating tip, kept in place after cutting.</p>',
           '<p>Sessions assigned chronologically: three intact then three cut per preparation, as specified by the experimenter. The 13:18 and 13:20 sessions labeled sc2 are assigned to SC3 intact. Split RHS files are joined only after checking timestamp and header continuity. Source recordings are unchanged.</p>',
           '<p>Fixed negative threshold per preparation = 4.5 × robust noise from the initial no-stimulation segment of intact 5 uA (20 ms before first pulse excluded). If less than 0.5 s is valid, pre-pulse samples (-200 to -20 ms) are used instead; see threshold_references.csv. Filter: 300–5000 Hz, third-order Butterworth forward/backward on separate clean segments. Current and hardware flags masked with 3 ms after end, plus 5 ms filter-edge guard. No extra notch, interpolation or template subtraction.</p>',
           '<p>Primary outcome: candidate rate after onset (10–100 ms) minus before onset (-100 to -10 ms), using mirrored valid samples for equal exposure. Sensitivity: thresholds 4/4.5/5, post-pulse exclusions 1/3/6 ms, guards 2/5 ms, windows 2–10, 10–100 and 100–300 ms. Early-window exposure can be near zero; inspect denominators. Trial-bootstrap intervals describe repeatability within a recording, not biological uncertainty or neural origin.</p>',
           '<h2>Paired primary response</h2><img src="paired_response.png">',
           '<table><tr><th>SC</th><th>State</th><th>uA</th><th>Pulses</th><th>Pre count / s</th><th>Post count / s</th><th>Pre Hz</th><th>Post Hz</th><th>Post-pre Hz</th><th>Noise/reference</th></tr>']
    for row in primary:
        q=next(q for q in qc if q['recording']==row['recording'])
        m=next(m for m in manifest if m['recording']==row['recording'])
        parts.append(f'<tr><td>{row["prep"]}</td><td>{row["state"]}</td><td>{row["current_uA"]}</td><td>{m["pulses"]}</td><td>{row["pre_n"]} / {row["matched_exposure_s"]:.3f}</td><td>{row["post_n"]} / {row["matched_exposure_s"]:.3f}</td><td>{row["pre_hz"]:.2f}</td><td>{row["post_hz"]:.2f}</td><td>{row["delta_hz"]:.2f}</td><td>{q["sigma_ratio_to_reference"]:.2f}</td></tr>')
    parts.extend(['</table><h2>Impedance</h2><img src="impedance.png">',
                  '<p>High REC magnitudes and atypical phases do not independently prove disconnection. Intan notes that parasitic/input capacitance affects very high-impedance measurements. Stable impedance across cutting does not validate tissue contact. Very low STIM impedance also requires checking the intended current path.</p>',
                  '<h2>Intact/cut pairs</h2>'])
    for prep in (1,2,3):
        for current in (5,20,100):parts.append(f'<h3>SC{prep}, {current} uA</h3><img loading="lazy" src="figures/SC{prep}_{current}uA_pair.png">')
    parts.append('<h2>Whole-recording quality and onset of stimulation</h2><p>Green marks time before first pulse; red lines mark stored current onsets. Candidate rates are exposure-corrected. Control-channel labels do not establish electrode connections.</p>')
    for r in records:parts.append('<h3>'+html.escape(r['name'])+'</h3><img loading="lazy" src="figures/'+html.escape(r['name'])+'_QC.png">')
    parts.append('<h2>Outputs</h2><p><a href="manifest.csv">Manifest</a> · <a href="primary_summary.csv">Primary results</a> · <a href="sensitivity.csv">Sensitivity</a> · <a href="signal_quality.csv">Signal quality</a> · <a href="impedance_rec_stim.csv">REC/STIM impedance</a></p><p>Documentation: <a href="https://intantech.com/files/Intan_RHS2116_datasheet.pdf">Intan RHS2116</a>, <a href="https://intantech.com/files/Intan_RHX_user_guide.pdf">RHX guide</a>.</p>')
    (out/'report.html').write_text('\n'.join(parts),encoding='utf-8')


if __name__=='__main__':main()
