import json
from pathlib import Path
import numpy as np
from analyze_pbs import core
base=Path(__file__).parent/'results'
for name in ['stim test PBS settle_261102_132232','stim test PBS settle_261102_133546']:
    with np.load(base/'cache'/(name+'.npz')) as z:d={k:z[k] for k in z.files}
    d['groups']=core.groups_of_pulses(d['current'],float(d['fs']))
    y=core.filter_signal(d);fs=float(d['fs'])
    sig=[core.robust_sigma(y[s-round(.1*fs):s-round(.01*fs)]) for s,e in d['groups']]
    print(name, 'filtered pre-pulse sigma median / 10th / 90th:',np.percentile(sig,[50,10,90]))
