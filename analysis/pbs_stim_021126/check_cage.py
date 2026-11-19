"""Validate matched cage comparison and new mislabeled-current recordings."""
from pathlib import Path
import csv
import json
from html.parser import HTMLParser
from urllib.parse import unquote
import rhs_io
import numpy as np
import importrhsutilities as official
from analyze_pbs import core

base=Path(__file__).parent/'results';out=base/'cage_comparison'
def read(name):
    with (out/name).open(encoding='utf-8-sig') as f:return list(csv.DictReader(f))
rows=read('summary.csv');trials=read('trial_metrics.csv');comp=read('comparison.csv')
assert len(rows)==6 and len(trials)==300 and len(comp)==3
assert all(int(r['pulses'])==50 and int(r['timestamp_gaps'])==0 for r in rows)
assert {int(r['current_uA']) for r in rows if r['cage_grounded']=='True'}=={1,2,5}
for r in rows:
    with np.load(base/'cache'/(r['recording']+'.npz')) as z:
        words=z['words'];current=z['current'];fs=float(z['fs'])
        count=0
        for s,e in core.groups_of_pulses(current,fs):
            parsed={'stim_data_raw':words[:,s:e].astype(np.int32)};official.extract_stim_data(parsed)
            np.testing.assert_allclose(parsed['stim_data'][1]*.5,current[s:e],atol=1e-6)
            count+=int(parsed['compliance_limit_data'][1].any())
    assert count==int(r['stim_compliance_pulses'])
    assert int(r['rec_settle_pulses'])==int(r['stim_settle_pulses'])==50
missing=[]
class Links(HTMLParser):
    def handle_starttag(self,tag,attrs):
        for k,v in attrs:
            if k in ('src','href') and not v.startswith(('http:','https:','#')) and not (out/unquote(v)).exists():missing.append(v)
Links().feed((out/'report.html').read_text(encoding='utf-8'));assert not missing,missing
print('PASS: matched 1/2/5 uA, 300 pulses, no timestamp gaps, actual currents verified by official decoder')
print('PASS: settle and compliance counts verified; all report figures and links exist')
