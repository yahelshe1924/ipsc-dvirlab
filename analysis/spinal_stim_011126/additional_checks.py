"""Audit voltage compliance, raw artifact timing and sensitivity results."""
from pathlib import Path
import csv
import json
import rhs_io
import numpy as np
from run_analysis import core,normalize_rows


def main():
    out=Path(__file__).parent/'results'
    with (out/'manifest.csv').open(encoding='utf-8-sig') as f:manifest=list(csv.DictReader(f))
    summaries=[];trials=[]
    for row in manifest:
        name=row['recording']
        with np.load(out/'cache'/(name+'.npz')) as z:d={k:z[k] for k in z.files}
        fs=float(d['fs']);groups=core.groups_of_pulses(d['current'],fs)
        flags=(d['words'][1]&32768)!=0
        local=[];in_pulse_mask=np.zeros(len(flags),bool)
        for i,(s,e) in enumerate(groups):
            in_pulse_mask[s:e]=True
            nearlo=max(0,s-round(.001*fs));nearhi=min(len(flags),e+round(.003*fs))
            entry=dict(recording=name,prep=row['prep'],state=row['state'],current_uA=row['current_actual_uA'],pulse=i+1,
                       onset_s=s/fs,flag_during_current=bool(flags[s:e].any()),flag_near_pulse=bool(flags[nearlo:nearhi].any()),
                       flagged_current_samples=int(flags[s:e].sum()),current_samples=e-s)
            local.append(entry);trials.append(entry)
        summaries.append(dict(recording=name,prep=row['prep'],state=row['state'],current_uA=row['current_actual_uA'],
                              pulses=len(groups),pulses_flag_during_current=sum(r['flag_during_current'] for r in local),
                              pulses_flag_near_current=sum(r['flag_near_pulse'] for r in local),
                              flagged_current_fraction=float(flags[in_pulse_mask].mean()),
                              flagged_outside_current_s=float(flags[~in_pulse_mask].sum()/fs),
                              total_flagged_s=float(flags.sum()/fs)))
    core.save_csv(out/'compliance_summary.csv',summaries);core.save_csv(out/'compliance_trials.csv',trials)
    with (out/'sensitivity.csv').open(encoding='utf-8-sig') as f:rows=list(csv.DictReader(f))
    summary=[]
    for m in manifest:
        rr=[r for r in rows if r['recording']==m['recording']]
        summary.append(dict(recording=m['recording'],prep=m['prep'],state=m['state'],current_uA=m['current_actual_uA'],
                            min_post_events=min(int(r['post_n']) for r in rr),max_post_events=max(int(r['post_n']) for r in rr),
                            min_pre_events=min(int(r['pre_n']) for r in rr),max_pre_events=max(int(r['pre_n']) for r in rr),
                            settings_with_post_events=sum(int(r['post_n'])>0 for r in rr)))
    core.save_csv(out/'sensitivity_overview.csv',summary)
    page=out/'report.html';s=page.read_text(encoding='utf-8')
    section='<h2>Stimulation voltage compliance</h2><p>A flag during current delivery means the requested current may not have been maintained. It is not a direct current measurement. A flag outside current delivery is reported separately. This constrains interpretation of negative response results and dose comparisons.</p><table><tr><th>SC</th><th>State</th><th>uA</th><th>Pulses flagged during current</th><th>Current samples flagged (%)</th></tr>'
    for r in summaries:section+=f'<tr><td>{r["prep"]}</td><td>{r["state"]}</td><td>{float(r["current_uA"]):g}</td><td>{r["pulses_flag_during_current"]}/{r["pulses"]}</td><td>{100*r["flagged_current_fraction"]:.1f}</td></tr>'
    section+='</table><p><a href="compliance_summary.csv">Compliance summary</a> · <a href="compliance_trials.csv">Per-pulse flags</a> · <a href="sensitivity_overview.csv">Sensitivity overview</a></p>'
    s=s.replace('<h2>Paired responses</h2>',section+'<h2>Paired responses</h2>')
    page.write_text(s,encoding='utf-8')
    print(json.dumps(summaries,indent=2))


if __name__=='__main__':main()
