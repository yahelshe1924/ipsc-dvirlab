from pathlib import Path
import sys
from analyze_pbs import xml_settings
root=Path(sys.argv[1])
for pat in ['stim phys test 4 10*','stim phys test 5*']:
 for p in root.glob(pat):
  s=xml_settings(p)['stim']
  print(p.name,{k:s.get(k) for k in ['FirstPhaseAmplitudeMicroAmps','FirstPhaseDurationMicroseconds','SecondPhaseDurationMicroseconds','PostStimAmpSettleMicroseconds']})
