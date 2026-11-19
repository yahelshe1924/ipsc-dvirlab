from pathlib import Path
from analyze_pbs import core
import rhs_io, numpy as np, sys
for p in sorted(Path(sys.argv[1]).glob('stim '+sys.argv[2]+'*041126*')):
 d,m=rhs_io.load_session(p,Path('analysis/pbs_stim_021126/results/cache'))
 fs=float(d['fs']); g=core.groups_of_pulses(d['current'],fs); d['groups']=g
 y=core.filter_signal(d); x=d['x'][0]
 e,t,_=core.lock_epochs(x,g,fs,100,500)
 e=e-np.median(e[:,(t>=-100)&(t<-10)],axis=1)[:,None]
 def rms(lo,hi):
  return round(float(np.median(np.sqrt(np.mean(e[:,(t>=lo)&(t<hi)]**2,axis=1)))),2)
 def sig(lo,hi):
  return round(float(np.nanmedian([core.robust_sigma(y[max(0,s+round(lo*fs/1000)):s+round(hi*fs/1000)]) for s,_ in g])),2)
 w=d['words']; print(p.name, 'channels',m['files'][0]['active_stim_channels'], 'pulses',len(g),'command',float(np.max(np.abs(d['current']))),'comp',sum(bool(np.any(w[1,a:b]&32768)) for a,b in g),'settle',sum(bool(np.any(w[0,a:b]&8192)) for a,b in g),'raw RMS', [rms(*w) for w in [(-100,-10),(0,2),(2,10),(10,100),(100,300),(300,500)]], 'filtered sigma', [sig(*w) for w in [(-100,-10),(10,100),(100,300),(300,500)]], 'peak',round(float(np.median(np.max(np.abs(e[:,(t>=0)&(t<20)]),axis=1)))),flush=True)

