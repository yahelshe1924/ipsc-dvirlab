from pathlib import Path
import sys,json,csv
import rhs_io,numpy as np
from analyze_pbs import core,xml_settings
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
out=Path('analysis/spinal_stim_101126/results');out.mkdir(parents=True,exist_ok=True)
rows=[];fig,ax=plt.subplots(4,2,figsize=(12,13),sharex=True)
for p in sorted(Path(sys.argv[1]).glob('stim *261110*')):
 if not (p.name.startswith('stim sc') or p.name.startswith('stim phys only')):continue
 try:d,m=rhs_io.load_session(p,out/'cache')
 except (ValueError,OSError) as exc:
  print('SKIPPED',p.name,exc,flush=True);continue
 fs=float(d['fs']);g=core.groups_of_pulses(d['current'],fs);d['groups']=g
 y=core.filter_signal(d);x=d['x'][0];w=d['words']
 ep,t,_=core.lock_epochs(x,g,fs,100,500);ep-=np.median(ep[:,(t>=-100)&(t<-10)],axis=1)[:,None]
 settings=xml_settings(p); current=round(float(np.max(np.abs(d['current']))),6)
 comp=[];settle=[];dur=[];pre=[];post=[]
 for s,e in g:
  parsed={'stim_data_raw':w[:,s:e].astype(np.int32)};rhs_io.official.extract_stim_data(parsed)
  comp.append(bool(parsed['compliance_limit_data'][1].any()))
  dur.append(float(np.count_nonzero(w[1,s:e]&32768)/fs*1e6))
  settle.append(bool(np.any(w[0,s:s+round(.01*fs)]&8192)))
  pre.append(core.robust_sigma(y[s-round(.1*fs):s-round(.01*fs)]))
 def rms(a,b):return float(np.median(np.sqrt(np.mean(ep[:,(t>=a)&(t<b)]**2,axis=1))))
 row=dict(recording=p.name,post_settle_us=settings["stim"].get("PostStimAmpSettleMicroseconds"),phase_us=settings["stim"].get("FirstPhaseDurationMicroseconds"),current_uA=current,pulses=len(g),compliance_pulses=sum(comp),median_flagged_duration_us=float(np.median(dur)),rec_settle_pulses=sum(settle),global_settle=settings['general'].get('HeadstageGlobalSettle'),baseline_filtered_sigma_uV=float(np.nanmedian(pre)),baseline_raw_rms_uV=rms(-100,-10),raw_rms_10_100ms_uV=rms(10,100),raw_rms_100_300ms_uV=rms(100,300),raw_rms_300_500ms_uV=rms(300,500),median_peak_0_20ms_uV=float(np.median(np.max(np.abs(ep[:,(t>=0)&(t<20)]),axis=1))),trials_over_5mV=int(np.sum(np.max(np.abs(ep),axis=1)>=5000)),initial_baseline_s=g[0][0]/fs,timestamp_gaps=int(np.count_nonzero(np.diff(d['ticks'].astype(np.int64))!=1)),rec_channel=m['files'][0]['selected_channels'][0]['native_channel_name'],dc_saved=m['files'][0]['bandwidth']['dc_amplifier_data_saved'])
 rows.append(row)
 i=next((k for k in range(3) if p.name.startswith('stim sc'+str(k+4)+' ')),3)
 j=0 if '10nA' in p.name else 1
 ax[i,j].plot(t,np.median(ep,axis=0),label=p.name.split('_101126')[0])
 print(json.dumps(row),flush=True)


for a in ax.flat:
 if a.lines:a.legend()
 a.axvline(0,color='black',lw=.5)
 a.set(xlim=(-20,500),ylabel='Median raw REC (uV)',xlabel='Time from pulse onset (ms)')
fig.tight_layout();fig.savefig(out/'rec_comparison.png',dpi=140)
with (out/'summary.csv').open('w',newline='',encoding='utf-8') as f:
 writer=csv.DictWriter(f,fieldnames=list(rows[0]));writer.writeheader();writer.writerows(rows)
(out/'report.html').write_text('<meta charset="utf-8"><h1>DIV3 intact and cut, 10 November 2026</h1><p>Channels identified by saved labels. Compliance flags verified with official Intan decoder. See per-recording compliance counts below. Raw REC includes stimulation artifact. Only timestamp 261110 recordings are included.</p><img width="1100" src="rec_comparison.png"><p><a href="summary.csv">Measurements</a></p><pre>'+json.dumps(rows,indent=2)+'</pre>',encoding='utf-8')




