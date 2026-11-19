from pathlib import Path
import rhs_io, numpy as np
from analyze_pbs import core
out=Path('analysis/spinal_stim_101126/results')
lines=['recording,eligible,total,baseline_uV,rms_10_100_uV,rms_100_300_uV']
for p in sorted((out/'cache').glob('*.npz')):
 with np.load(p) as z:
  fs=float(z['fs']); groups=core.groups_of_pulses(z['current'],fs); w=z['words'][1]; x=z['x'][0]
  clean=[(s,e) for s,e in groups if not np.any(w[s:e]&32768)]
  ep,t,_=core.lock_epochs(x,clean,fs,100,500)
  ep-=np.median(ep[:,(t>=-100)&(t<-10)],axis=1)[:,None]
  vals=[np.median(np.sqrt(np.mean(ep[:,(t>=a)&(t<b)]**2,axis=1))) for a,b in [(-100,-10),(10,100),(100,300)]]
  lines.append(f'{p.stem},{len(clean)},{len(groups)},'+','.join(f'{v:.2f}' for v in vals))
(out/'no_compliance.csv').write_text('\n'.join(lines),encoding='utf-8')
print('\n'.join(lines))
