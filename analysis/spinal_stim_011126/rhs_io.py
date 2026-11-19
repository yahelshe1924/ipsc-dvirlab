"""Selected-channel RHS reader using Intan's official header/block definition.

No extra software notch is applied. Amplifier units: microvolts; current: uA.
"""
import sys
from pathlib import Path
import contextlib
import io
import json
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'spinal_stim'/'_packages'))
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'spinal_stim'))
import numpy as np
import importrhsutilities as official


def block_dtype(h):
    n=h['num_amplifier_channels'];fields=[('ticks','<i4',(128,)),('amp','<u2',(n,128))]
    if h['dc_amplifier_data_saved']:fields.append(('dc','<u2',(n,128)))
    fields.append(('stim','<u2',(n,128)))
    for name,key in [('adc','num_board_adc_channels'),('dac','num_board_dac_channels')]:
        if h[key]:fields.append((name,'<u2',(h[key],128)))
    for name,key in [('din','num_board_dig_in_channels'),('dout','num_board_dig_out_channels')]:
        if h[key]:fields.append((name,'<u2',(128,)))
    dt=np.dtype(fields)
    assert dt.itemsize==official.get_bytes_per_data_block(h)
    return dt


def read_selected(file):
    with file.open('rb') as f,contextlib.redirect_stdout(io.StringIO()):
        h=official.read_header(f);offset=f.tell()
    dt=block_dtype(h);size=file.stat().st_size-offset
    if size%dt.itemsize:raise ValueError(f'Incomplete block: {file}')
    blocks=np.memmap(file,dtype=dt,mode='r',offset=offset,shape=(size//dt.itemsize,))
    channels=h['amplifier_channels']
    rec=[i for i,c in enumerate(channels) if c['custom_channel_name'].lower()=='rec']
    stim=[i for i,c in enumerate(channels) if c['custom_channel_name'].lower()=='stim']
    if len(rec)!=1 or len(stim)!=1:raise ValueError(f'Non-unique REC/STIM mapping: {file}')
    ri,si=rec[0],stim[0]
    selected=list(dict.fromkeys([ri,si]+[i for i,c in enumerate(channels) if c['native_channel_name'] in ('A-000','A-001','A-003')]))
    amp=np.stack([blocks['amp'][:,i,:].reshape(-1).astype(np.float32) for i in selected])
    amp=(amp-32768)*np.float32(.195)
    words=np.stack([blocks['stim'][:,i,:].reshape(-1) for i in [ri,si]])
    w=words[1].astype(np.int32)
    current=((w&255)*(1-2*((w&256)>>8))*h['stim_step_size']*1e6).astype(np.float32)
    active_channels=[channels[i]['native_channel_name'] for i in range(len(channels)) if np.any(blocks['stim'][:,i,:]&255)]
    ticks=np.array(blocks['ticks'].reshape(-1))
    # Check first block against the official decoder before using this fast path.
    with file.open('rb') as f:
        f.seek(offset)
        expected={'t':np.zeros(128),'amplifier_data':np.zeros((len(channels),128)),
                  'stim_data_raw':np.zeros((len(channels),128)),
                  'board_adc_data':np.zeros((h['num_board_adc_channels'],128)),
                  'board_dac_data':np.zeros((h['num_board_dac_channels'],128)),
                  'board_dig_in_raw':np.zeros(128),'board_dig_out_raw':np.zeros(128)}
        if h['dc_amplifier_data_saved']:expected['dc_amplifier_data']=np.zeros((len(channels),128))
        official.read_one_data_block(expected,h,0,f)
    np.testing.assert_array_equal(ticks[:128],expected['t'])
    np.testing.assert_allclose(amp[0,:128],.195*(expected['amplifier_data'][ri]-32768),atol=.001)
    np.testing.assert_array_equal(words[1,:128],expected['stim_data_raw'][si])
    result=dict(x=amp,words=words,current=current,ticks=ticks,fs=np.array(h['sample_rate']))
    meta=dict(file=str(file),size_bytes=file.stat().st_size,samples=len(ticks),
              first_tick=int(ticks[0]),last_tick=int(ticks[-1]),
              gaps=int(np.count_nonzero(np.diff(ticks.astype(np.int64))!=1)),
              selected_channels=[channels[i] for i in selected],
              active_stim_channels=active_channels,fs=h['sample_rate'],
              bandwidth={k:h.get(k) for k in ('frequency_parameters','notch_filter_frequency','stim_step_size','dc_amplifier_data_saved')},
              notes=h.get('notes',{}),reader_validation='First block matches official Intan block reader')
    # Frequency settings live at the header root in the official reader.
    meta['header_parameters']={k:v for k,v in h.items() if not isinstance(v,(list,dict))}
    del blocks
    return result,meta


def load_session(folder,cache):
    cache.mkdir(parents=True,exist_ok=True)
    target=cache/(folder.name+'.npz');meta_path=cache/(folder.name+'.json')
    files=sorted(folder.glob('*.rhs'))
    signature=[(str(f),f.stat().st_size,f.stat().st_mtime_ns) for f in files]
    if target.exists() and meta_path.exists():
        meta=json.loads(meta_path.read_text(encoding='utf-8'))
        if meta['signature']==[list(s) for s in signature]:
            with np.load(target) as z:return {k:z[k] for k in z.files},meta
    arrays=[];metas=[]
    for f in files:
        d,m=read_selected(f);arrays.append(d);metas.append(m)
    for prev,cur in zip(metas,metas[1:]):
        if prev['last_tick']+1!=cur['first_tick']:raise ValueError(f'Noncontinuous split files: {folder}')
        if prev['fs']!=cur['fs'] or prev['selected_channels']!=cur['selected_channels']:
            raise ValueError(f'Header change across split files: {folder}')
    d={key:np.concatenate([a[key] for a in arrays],axis=1 if key in ('x','words') else 0)
       for key in ('x','words','current','ticks')};d['fs']=arrays[0]['fs']
    meta=dict(session=folder.name,signature=signature,files=metas,split_continuity_verified=True)
    np.savez_compressed(target,**d);meta_path.write_text(json.dumps(meta,indent=2,default=str),encoding='utf-8')
    return d,meta


if __name__=='__main__':
    import argparse
    p=argparse.ArgumentParser();p.add_argument('input',type=Path);p.add_argument('cache',type=Path);a=p.parse_args()
    for folder in sorted(a.input.iterdir()):
        if folder.is_dir() and list(folder.glob('*.rhs')):
            d,m=load_session(folder,a.cache)
            print(folder.name,'seconds',len(d['ticks'])/float(d['fs']),'files',len(m['files']),
                  'REC',m['files'][0]['selected_channels'][0]['native_channel_name'],
                  'peak_uA',float(np.max(np.abs(d['current']))),flush=True)
