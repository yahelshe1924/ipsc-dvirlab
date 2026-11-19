from pathlib import Path
from analyze_pbs import core, xml_settings
import rhs_io, numpy as np, json
import sys
root=Path(sys.argv[1])
for p in sorted(root.glob('stim sc5*041126*')):
 for f in p.glob('*.rhs'):
  with f.open('rb') as s: h=rhs_io.official.read_header(s); offset=s.tell()
  c=h['amplifier_channels']; b=np.memmap(f,dtype=rhs_io.block_dtype(h),mode='r',offset=offset)
  fs=h['sample_rate']
  active=[]
  for i,ch in enumerate(c):
   w=b['stim'][:,i,:].reshape(-1)
   groups=core.groups_of_pulses(w&255,fs)
   if not groups: continue
   active.append((ch['native_channel_name'], sorted(set(np.round((w[w&255!=0]&255)*h['stim_step_size']*1e6,5))),len(groups),sum(bool(np.any(w[s:e]&32768)) for s,e in groups)))
  x=xml_settings(p)
  print('RESULT',p.name,active,'custom',[(a['native_channel_name'],a['custom_channel_name']) for a in c if a['custom_channel_name']!=a['native_channel_name']],'global',x['general'].get('HeadstageGlobalSettle'),flush=True)
