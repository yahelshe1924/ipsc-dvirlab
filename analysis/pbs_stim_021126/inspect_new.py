from pathlib import Path
import rhs_io,contextlib,io
from analyze_pbs import xml_settings
p=Path('G:/האחסון שלי/PhD results/Ex-Vivo (2026)/stim+read intact+cut SC (011126)/stim test PBS settle_261102_141016')
f=next(p.glob('*.rhs'))
with f.open('rb') as stream,contextlib.redirect_stdout(io.StringIO()):
 h=rhs_io.official.read_header(stream);offset=stream.tell()
b=rhs_io.np.memmap(f,dtype=rhs_io.block_dtype(h),mode='r',offset=offset)
print('Active STIM channels:',[c['native_channel_name'] for i,c in enumerate(h['amplifier_channels']) if rhs_io.np.any(b['stim'][:,i,:]&255)])
print('settings',xml_settings(p)['stim'])
