"""Synthetic processing checks and November result consistency audit."""
from pathlib import Path
import csv
from html.parser import HTMLParser
from urllib.parse import unquote
import rhs_io
import numpy as np
from run_analysis import core

fs=30000;n=fs*3;rng=np.random.default_rng(112026)
x=rng.normal(0,2,n).astype(np.float32)
for time in (.95,1.05,2.05):
    center=round(time*fs);off=np.arange(-15,16)
    x[center+off]-=100*np.exp(-(off/3)**2)
x[fs:fs+12]=5000
d=dict(fs=fs,x=x[None],words=np.zeros((2,n),np.uint16),ticks=np.arange(n,dtype=np.int32),groups=[(fs,fs+12),(2*fs,2*fs+12)])
y=core.filter_signal(d);events=core.detect(y,10,fs)
assert all(np.any(np.abs(events/fs-t)<.001) for t in (.95,1.05,2.05))
assert not np.any((events>=fs-180)&(events<fs+252))
stat,trials=core.paired_windows(y,events,d['groups'],fs)
assert stat['pre_n']>=1 and stat['post_n']>=2
assert abs(stat['matched_exposure_s']-.18)<1/fs
root=Path(__file__).parent/'results'
def read(name):
    with (root/name).open(encoding='utf-8-sig') as f:return list(csv.DictReader(f))
m=read('manifest.csv');s=read('sensitivity.csv');p=read('primary_summary.csv');a=read('candidate_raw_audit.csv');c=read('compliance_summary.csv')
assert len(m)==18 and len(p)==18 and len(s)==972
assert sum(int(r['rhs_files']) for r in m)==20
assert all(int(r['pulses'])==50 for r in m)
assert all(r['rec_channel']=='A-010' and r['stim_channel']=='A-004' for r in m)
assert all(int(r['timestamp_gaps'])==0 for r in m)
assert sum(int(r['post_n']) for r in p)==len(a)==40
assert all(r['retained_as_observable_after_recovery']=='False' for r in a)
assert sum(int(r['pulses_flag_during_current'])>0 for r in c)==7
thresholds={}
for r in s:thresholds.setdefault((r['prep'],r['multiplier']),set()).add(r['threshold_uV'])
assert all(len(v)==1 for v in thresholds.values())
missing=[]
class CheckLinks(HTMLParser):
    def handle_starttag(self,tag,attrs):
        for key,value in attrs:
            if key in ('src','href') and not value.startswith(('http:','https:','#')) and not (root/unquote(value)).exists():missing.append(value)
CheckLinks().feed((root/'report.html').read_text(encoding='utf-8'))
assert not missing,missing
print('PASS: injected spike recovery, stimulus exclusion, and matched pre/post exposure')
print('PASS: 18 sessions / 20 RHS files / 900 pulses, new channel mapping, no timestamp gaps')
print('PASS: 972 fixed-threshold sensitivity rows; all 40 primary candidates audited; compliance in 7 conditions')
print('PASS: all local report images and links exist')
