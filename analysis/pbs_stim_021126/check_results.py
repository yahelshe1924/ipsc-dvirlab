"""Validate PBS trial counts, flag interpretation, recovery rules and outputs."""
from pathlib import Path
import csv
from html.parser import HTMLParser
from urllib.parse import unquote
import rhs_io
import numpy as np
import importrhsutilities as official
from analyze_pbs import return_time,tail_return_time

fs=30000;v=np.zeros(round(.1*fs));v[:round(.005*fs)]=500;v[round(.03*fs):round(.035*fs)]=500
eligible=np.ones(len(v),bool)
assert return_time(v,eligible,0,fs,150,20)==5
assert tail_return_time(v,eligible,0,fs,150)==35
assert tail_return_time(np.full(len(v),500),eligible,0,fs,150) is None
root=Path(__file__).parent/'results'
def read(name):
    with (root/name).open(encoding='utf-8-sig') as f:return list(csv.DictReader(f))
summary=read('summary.csv');flags=read('flags.csv');trials=read('trial_metrics.csv');settings=read('settings_comparison.csv')
assert len(summary)==len(flags)==len(settings)==9 and len(trials)==450
assert all(int(r['pulses'])==50 for r in summary)
assert len(set(r['negative_threshold_uV'] for r in summary))==1
assert all(int(r['timestamp_gaps'])==0 for r in summary)
for r in flags:
    expected=50 if r['state']=='settle on' else 0
    assert int(r['rec_settle_pulses'])==int(r['stim_settle_pulses'])==expected
    # Independently compare the decoded status bit with Intan's parser.
    with np.load(root/'cache'/(r['recording']+'.npz')) as z:
        words=np.array(z['words']);current=np.array(z['current'])
    count=0
    for sample in (t for t in trials if t['recording']==r['recording']):
        s=round(float(sample['onset_s'])*fs)
        # Intan's parser expects an integer type allowing negative polarity.
        block={'stim_data_raw':words[:,s:s+12].astype(np.int32)}
        official.extract_stim_data(block)
        count+=int(block['compliance_limit_data'][1].any())
        np.testing.assert_allclose(block['stim_data'][1]*.5,current[s:s+12],atol=1e-6)
    assert count==int(r['stim_compliance_pulses'])
assert set(float(r['current_uA']) for r in summary if float(r['declared_current_uA'])<5)=={1,2,4}
assert all(float(r['declared_current_uA'])==float(r['current_uA']) for r in summary)
missing=[]
class Links(HTMLParser):
    def handle_starttag(self,tag,attrs):
        for k,v in attrs:
            if k in ('src','href') and not v.startswith(('http:','https:','#')) and not (root/unquote(v)).exists():missing.append(v)
Links().feed((root/'report.html').read_text(encoding='utf-8'))
assert not missing,missing
print('PASS: first-return and last-excursion recovery distinguish rebound; unresolved stays missing')
print('PASS: 9 recordings / 450 pulses / fixed threshold / continuous timestamps')
print('PASS: recorded REC and STIM settle flags match settings; compliance verified against official Intan parser')
print('PASS: signed current decode and every pulse compliance flag match Intan parser; corrected 4 uA command verified')
print('PASS: all report links and figures exist')
