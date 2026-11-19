"""Spectral/contact and immediate artifact diagnostics; no neural-source claim."""
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).parent))
import rhs_io
import numpy as np
import csv
import json
from scipy.signal import welch,coherence
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from analyze_experiment import groups_of_pulses,save_csv,lock_epochs


def main():
    root=Path(__file__).parent/'results'
    with (root/'manifest.csv').open(encoding='utf-8-sig') as f:manifest=list(csv.DictReader(f))
    spectra=[];immediate=[];details={}
    for r in manifest:
        name=r['recording']
        with np.load(root/'cache'/(name+'.npz')) as z:d={k:z[k] for k in z.files}
        meta=json.loads((root/'cache'/(name+'.json')).read_text(encoding='utf-8'))
        fs=float(d['fs']);groups=groups_of_pulses(d['current'],fs)
        # Initial no-stimulus segment, excluding start transient and upcoming pulse.
        lo=round(.2*fs);hi=groups[0][0]-round(.02*fs)
        x=d['x'][:,lo:hi];nseg=min(round(fs),x.shape[1]);nfft=round(fs)
        f,p=welch(x,fs=fs,nperseg=nseg,nfft=nfft,axis=1)
        band=(f>=300)&(f<=5000)
        harmonic=band&(np.abs(f/50-np.round(f/50))<=2.01/50)
        rec=x[0];neighbor=x[-1]
        corr=float(np.corrcoef(rec,neighbor)[0,1])
        peak_idx=np.flatnonzero(band)[np.argmax(p[0,band])]
        spectra.append(dict(recording=name,prep=r['prep'],state=r['state'],current_uA=r['current_label_uA'],
                            no_stim_segment_s=x.shape[1]/fs,rec_raw_std_uV=float(np.std(rec)),
                            rec_neighbor_A003_corr=corr,rec_peak_300_5000_Hz=float(f[peak_idx]),
                            rec_power_near_50Hz_harmonics_fraction=float(np.sum(p[0,harmonic])/np.sum(p[0,band])),
                            neighbor_power_near_50Hz_harmonics_fraction=float(np.sum(p[-1,harmonic])/np.sum(p[-1,band])),
                            rec_phase_deg=r['rec_phase_header_deg'],rec_impedance_MOhm=float(r['rec_impedance_header_ohm'])/1e6))
        ep,rel,_=lock_epochs(d['x'][0],groups,fs,20,20)
        ep-=np.median(ep[:,(rel>=-20)&(rel<-2)],axis=1)[:,None]
        mean=ep.mean(0);median=np.median(ep,axis=0);pulse=(rel>=0)&(rel<.8)
        immediate.append(dict(recording=name,prep=r['prep'],state=r['state'],current_uA=r['current_label_uA'],
                              immediate_mean_peak_abs_uV=float(np.max(np.abs(mean[pulse]))),
                              immediate_median_peak_abs_uV=float(np.max(np.abs(median[pulse]))),
                              caution='0-0.8 ms overlaps current/artifact; not a neural response metric'))
        details[name]=(f,p,x[:,:round(.03*fs)],rel,ep,meta)
        print('SPECTRUM',name,'harmonic fraction',spectra[-1]['rec_power_near_50Hz_harmonics_fraction'],'neighbor correlation',corr,flush=True)
    save_csv(root/'spectral_quality.csv',spectra);save_csv(root/'immediate_component.csv',immediate)
    for prep in ('1','2','3'):
        selected=[r for r in manifest if r['prep']==prep and r['current_label_uA']=='5']
        fig,ax=plt.subplots(2,2,figsize=(13,8))
        for col,r in enumerate(selected):
            f,p,x,rel,ep,meta=details[r['recording']]
            for i,label in [(0,'REC A-004'),(1,'STIM A-011'),(4,'Neighbor A-003 (connection unknown)')]:
                ax[0,col].semilogy(f,p[i],label=label)
                ax[1,col].plot(np.arange(x.shape[1])/30000*1000,x[i],label=label,alpha=.8)
            ax[0,col].set(xlim=(0,2000),ylim=(1e-5,1e4),title=f'SC{prep} {r["state"]}: initial no-stimulus segment',xlabel='Frequency (Hz)',ylabel='PSD (uV²/Hz)')
            ax[1,col].set(xlabel='Time within initial segment (ms)',ylabel='Raw signal (uV)')
            ax[0,col].legend(fontsize=8)
        fig.suptitle('Similar spectral peaks on high-impedance REC and neighboring input; not proof of disconnection')
        fig.tight_layout();fig.savefig(root/f'SC{prep}_interference.png',dpi=150);plt.close(fig)
    fig,ax=plt.subplots(3,3,figsize=(15,10),sharex=True,sharey=True)
    for prep in ('1','2','3'):
        for j,current in enumerate(('5','20','100')):
            a=ax[int(prep)-1,j]
            for r in manifest:
                if r['prep']==prep and r['current_label_uA']==current:
                    f,p,x,rel,ep,meta=details[r['recording']]
                    col='#2166ac' if r['state']=='intact' else '#b2182b'
                    a.plot(rel,ep.mean(0),color=col,label=r['state'])
            a.set(xlim=(-1,3),title=f'SC{prep}, {current} uA');a.axvline(0,color='black',lw=.6);a.axvspan(0,.4,color='orange',alpha=.2)
            if j==0:a.set_ylabel('Mean raw REC (uV)')
            if prep=='3':a.set_xlabel('Time from current onset (ms)')
            a.legend(fontsize=8)
    fig.suptitle('Immediate component before and after cutting; current period in orange; no neural attribution')
    fig.tight_layout();fig.savefig(root/'immediate_intact_cut.png',dpi=150);plt.close(fig)
    report=root/'report.html';text=report.read_text(encoding='utf-8')
    extra='<h2>Spectral interference and immediate component</h2><p>Initial no-stimulation spectra show narrow peaks near 50 Hz harmonics. Similar peaks on REC and high-impedance A-003 suggest shared electrical pickup; the connection of A-003 is not known. This is not an independent proof of disconnection. The immediate mean response overlaps current delivery and persists after cutting; it must not be counted as confirmed neural activity.</p>'
    extra+=''.join(f'<img loading="lazy" src="SC{i}_interference.png">' for i in (1,2,3))
    extra+='<img loading="lazy" src="immediate_intact_cut.png"><p><a href="spectral_quality.csv">Spectral metrics</a> · <a href="immediate_component.csv">Immediate component metrics</a></p>'
    text=text.replace('<h2>Intact/cut pairs</h2>',extra+'<h2>Intact/cut pairs</h2>')
    report.write_text(text,encoding='utf-8')


if __name__=='__main__':main()
