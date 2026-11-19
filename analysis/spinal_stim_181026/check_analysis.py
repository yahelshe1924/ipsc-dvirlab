"""Focused synthetic and result-consistency checks."""
import rhs_io
import numpy as np
from pathlib import Path
import csv
from analyze_experiment import filter_signal,detect,paired_windows,groups_of_pulses

fs=30000;n=fs*3;rng=np.random.default_rng(181026)
x=rng.normal(0,2,n).astype(np.float32)
for time in (.95,1.05,2.05):
    center=round(time*fs);offset=np.arange(-15,16)
    x[center+offset]-=100*np.exp(-(offset/3)**2)
x[fs:fs+12]=5000
d=dict(fs=fs,x=x[None],words=np.zeros((2,n),np.uint16),ticks=np.arange(n,dtype=np.int32),groups=[(fs,fs+12),(2*fs,2*fs+12)])
y=filter_signal(d);events=detect(y,10,fs)
assert all(np.any(np.abs(events/fs-t)<.001) for t in (.95,1.05,2.05))
assert not np.any((events>=fs-180)&(events<fs+252))
stat,trials=paired_windows(y,events,d['groups'],fs)
assert stat['pre_n']>=1 and stat['post_n']>=2
assert abs(stat['matched_exposure_s']-.18)<1/fs
current=np.zeros(100);current[10:16]=-5;current[17:23]=5
assert groups_of_pulses(current,fs)==[(10,23)]
root=Path(__file__).parent/'results'
with (root/'sensitivity.csv').open(encoding='utf-8-sig') as f:rows=list(csv.DictReader(f))
assert len(rows)==18*3*2*3*3
thresholds={}
for r in rows:thresholds.setdefault((r['prep'],r['multiplier']),set()).add(r['threshold_uV'])
assert all(len(v)==1 for v in thresholds.values())
with (root/'manifest.csv').open(encoding='utf-8-sig') as f:manifest=list(csv.DictReader(f))
assert len(manifest)==18 and sum(int(m['pulses']) for m in manifest)==900
assert sum(int(m['rhs_files']) for m in manifest)==21
assert all(int(m['timestamp_gaps'])==0 for m in manifest)
print('PASS: injected events recovered; artifact excluded; mirrored exposure matched; biphasic grouping correct')
print('PASS: 972 sensitivity rows; thresholds fixed per preparation; 18 sessions / 21 files / 900 stored pulses; no timestamp gaps')
