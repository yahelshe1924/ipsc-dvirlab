from pathlib import Path
import sys,contextlib,io,json
import rhs_io,numpy as np
from analyze_pbs import core,xml_settings
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
out=Path('analysis/spinal_stim_081126/results')
fig,axs=plt.subplots(2,4,figsize=(18,7));results=[]
for col,p in enumerate(sorted(Path(sys.argv[1]).glob('stim sc1*261108*'))):
 f=next(p.glob('*.rhs'))
 with f.open('rb') as stream,contextlib.redirect_stdout(io.StringIO()):
  h=rhs_io.official.read_header(stream);offset=stream.tell()
 b=np.memmap(f,dtype=rhs_io.block_dtype(h),mode='r',offset=offset)
 d,m=rhs_io.load_session(p,out/'cache');fs=float(d['fs']);groups=core.groups_of_pulses(d['current'],fs)
 settings=xml_settings(p)
 row={'recording':p.name,'post_settle_us':settings['stim'].get('PostStimAmpSettleMicroseconds'),'pre_settle_us':settings['stim'].get('PreStimAmpSettleMicroseconds'),'lower_settle_Hz':settings['general'].get('DesiredLowerSettleBandwidthHertz')}
 for key,name in [('stim','A-004'),('rec','A-011')]:
  idx=next(i for i,c in enumerate(h['amplifier_channels']) if c['native_channel_name']==name)
  dc=-.01923*(b['dc'][:,idx,:].reshape(-1).astype(np.int32)-512)
  epoch,t,_=core.lock_epochs(dc,groups,fs,10,100)
  baseline=np.median(epoch[:,(t>=-10)&(t<-1)],axis=1)
  mask=(t>=0)&(t<2)
  row[key+'_baseline_V']=float(np.median(baseline))
  row[key+'_early_min_V']=float(np.median(np.min(epoch[:,mask],axis=1)))
  row[key+'_early_max_V']=float(np.median(np.max(epoch[:,mask],axis=1)))
  row[key+'_max_abs_change_V']=float(np.median(np.max(np.abs(epoch-baseline[:,None]),axis=1)))
  axs[0,col].plot(t,np.median(epoch,axis=0),label=key)
  axs[1,col].plot(t,np.median(epoch,axis=0),label=key)
 for a in axs[:,col]:a.legend();a.set(ylabel='DC voltage (V)',xlabel='Time from onset (ms)',title=p.name.split('_081126')[0])
 axs[0,col].set_xlim(-1,3);axs[1,col].set_xlim(-10,100)
 results.append(row)
 print(json.dumps(row),flush=True)
fig.tight_layout();fig.savefig(out/'sc1_dc.png',dpi=150)
(out/'sc1_dc.json').write_text(json.dumps(results,indent=2),encoding='utf-8')

