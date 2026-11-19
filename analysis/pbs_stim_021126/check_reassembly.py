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

base=Path(__file__).parent/'results';out=base/'reassembly_comparison'
def read(name):
    with (out/name).open(encoding='utf-8-sig') as f:return list(csv.DictReader(f))
rows=read('summary.csv');trials=read('trial_metrics.csv')
assert len(rows)==7 and len(trials)==322
assert [int(r['pulses']) for r in rows]==[50,50,50,50,50,50,22]
assert all(int(r['timestamp_gaps'])==0 for r in rows)
assert [float(r['current_uA']) for r in rows]==[2,2,2,2,1,1,1]
assert [int(r['stim_compliance_pulses']) for r in rows]==[50,50,0,0,50,50,0]
for r in rows:
    with np.load(base/'cache'/(r['recording']+'.npz')) as z:
        words=z['words'];current=z['current'];fs=float(z['fs'])
        count=0
        for s,e in core.groups_of_pulses(current,fs):
            parsed={'stim_data_raw':words[:,s:e].astype(np.int32)};official.extract_stim_data(parsed)
            np.testing.assert_allclose(parsed['stim_data'][1]*.5,current[s:e],atol=1e-6)
            count+=int(parsed['compliance_limit_data'][1].any())
    assert count==int(r['stim_compliance_pulses'])
    assert int(r['stim_settle_pulses'])==int(r['pulses'])
    assert int(r['rec_settle_pulses'])==(0 if r['recording'].endswith('_141016') else int(r['pulses']))
missing=[]
class Links(HTMLParser):
    def handle_starttag(self,tag,attrs):
        for k,v in attrs:
            if k in ('src','href') and not v.startswith(('http:','https:','#')) and not (out/unquote(v)).exists():missing.append(v)
Links().feed((out/'report.html').read_text(encoding='utf-8'));assert not missing,missing
print('PASS: 2 uA and latest 1 uA, 322 pulses, no timestamp gaps, actual currents verified by official decoder')
print('PASS: settle and compliance counts verified; all report figures and links exist')






