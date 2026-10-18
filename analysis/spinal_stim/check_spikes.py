"""Synthetic check: injected negative spikes detected; masked artifact excluded."""
import tempfile
from pathlib import Path
from types import SimpleNamespace
import csv
import spikes as s
import numpy as np

fs=30000
rng=np.random.default_rng(71)
x=rng.normal(0,2,fs*3)
for time in (.5,1.03,2.03):
    center=round(time*fs)
    offsets=np.arange(-15,16)
    x[center+offsets]-=100*np.exp(-(offsets/3)**2)
x[fs:fs+15]=5000
stim=np.zeros((1,len(x)));stim[0,fs:fs+15]=10
d=dict(frequency_parameters={'amplifier_sample_rate':fs},t=np.arange(len(x))/fs,
       amplifier_channels=[dict(native_channel_name='A-004',custom_channel_name='rec')],
       amplifier_data=x[None,:],stim_data=stim)
s.load_file=lambda _: (d,True)
a=SimpleNamespace(channel='rec',low=300,high=5000,merge_ms=1,pre_blank_ms=1,
                  blank_ms=3,guard_ms=5,window_ms=100,threshold=4.5,polarity='negative',
                  refractory_ms=1,bins=20)
with tempfile.TemporaryDirectory() as tmp:
    s.process(Path('synthetic.rhs'),Path(tmp),a)
    with (Path(tmp)/'synthetic'/'events.csv').open() as f:
        events=np.array([float(r['time_s']) for r in csv.DictReader(f)])
    assert all(np.min(np.abs(events-t))<.001 for t in (.5,1.03,2.03))
    assert not np.any((events>.999)&(events<1.0085))
    print('PASS: injected events detected and stimulus artifact excluded')
