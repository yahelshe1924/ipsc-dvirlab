from pathlib import Path
import sys, contextlib, io, json
import rhs_io, numpy as np
from analyze_pbs import core, xml_settings
root=Path(sys.argv[1])
for p in sorted(root.glob('stim phys test*')):
 for f in sorted(p.glob('*.rhs')):
  with f.open('rb') as s,contextlib.redirect_stdout(io.StringIO()):
   h=rhs_io.official.read_header(s); offset=s.tell()
  b=np.memmap(f,dtype=rhs_io.block_dtype(h),mode='r',offset=offset)
  channels=h['amplifier_channels']; fs=h['sample_rate']
  print('HEADER',p.name,'duration',len(b)*128/fs,'fs',fs,'dc',h['dc_amplifier_data_saved'],'gaps',int(np.count_nonzero(np.diff(b['ticks'].reshape(-1).astype(np.int64))!=1)),'mapping',[(c['native_channel_name'],c['custom_channel_name']) for c in channels if c['custom_channel_name']!=c['native_channel_name']],flush=True)
  for i,c in enumerate(channels):
   w=b['stim'][:,i,:].reshape(-1)
   if np.any(w&255):
    g=core.groups_of_pulses(w&255,fs)
    print('STIM',c['native_channel_name'],'commands',np.unique((w[w&255!=0]&255)*h['stim_step_size']*1e6),'pulses',len(g),'compliance',sum(bool(np.any(w[a:e]&32768)) for a,e in g),flush=True)
 print('SETTINGS',json.dumps(xml_settings(p)),flush=True)
