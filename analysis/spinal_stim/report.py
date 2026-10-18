"""Build a focused REC report from analyze.py outputs."""
import csv
import html
from pathlib import Path
from analyze import plot_summary

root=Path(__file__).parent/'results'
with (root/'summary.csv').open(encoding='utf-8-sig') as f:
    rows=list(csv.DictReader(f))
for r in rows:
    if r.get('rms_ratio'): r['rms_ratio']=float(r['rms_ratio'])
    else: r.pop('rms_ratio',None)
plot_summary(rows,root)
rec=[r for r in rows if r['channel']=='A-004']
parts=['<!doctype html><meta charset="utf-8"><title>REC stimulation analysis</title>',
       '<style>body{font:16px system-ui;max-width:1100px;margin:30px auto}img{width:100%}td,th{padding:8px;border:1px solid #ddd}table{border-collapse:collapse}</style>',
       '<h1>REC (A-004) relative to STIM (A-011)</h1>',
       '<p>Channel labels verified in all ten RHS headers. Orange: 0–3 ms excluded from metrics. Response: 3–50 ms; baseline: −20 to −1 ms. Signals are in microvolts. Pulses are repeated measurements within a preparation.</p>',
       '<p>Time locking alone does not establish neural origin. Inspect single trials for artifact, drift and inconsistent responses. Peak latency is a descriptive maximum, not response onset. Compare the two preparations separately.</p>',
       '<table><tr><th>Recording</th><th>Pulses / usable</th><th>RMS ratio</th><th>Peak latency (ms)</th></tr>']
for r in rec:
    parts.append(f"<tr><td>{html.escape(r['recording'])}</td><td>{r['pulses']} / {r['usable_epochs']}</td><td>{r.get('rms_ratio','—')}</td><td>{r.get('peak_latency_ms','—')}</td></tr>")
parts.append('</table>')
for r in rec:
    folder=r['recording']
    parts.append('<h2>'+html.escape(folder)+'</h2>')
    for name in ['overview.png','A-004_locked.png']:
        if (root/folder/name).exists():
            parts.append(f'<img loading="lazy" src="{html.escape(folder)}/{name}">')
(root/'report.html').write_text('\n'.join(parts),encoding='utf-8')
print('REC summary')
for r in rec:
    print(r['recording'], 'pulses=',r['pulses'],'usable=',r['usable_epochs'],
          'RMS ratio=',r.get('rms_ratio'),'peak ms=',r.get('peak_latency_ms'))
