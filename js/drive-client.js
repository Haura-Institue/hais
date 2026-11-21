// Bridge Apps Script: token hanya lewat postMessage, bukan URL, log, atau localStorage.
export function createBridge(config, currentUser) {
  const configured = /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(config.webAppUrl || '');
  const channel = crypto.randomUUID(), pending = new Map();
  let target, origin, readyPromise;
  function ready() {
    if (!configured) return Promise.reject(new Error('Isi js/drive-config.js dengan URL Web App /exec.'));
    if (readyPromise) return readyPromise;
    readyPromise = new Promise((resolve,reject) => {
      const frame = document.createElement('iframe'); frame.hidden=true; frame.title='Penghubung data Haura'; frame.referrerPolicy='no-referrer';
      const timeout=setTimeout(()=>reject(new Error('Penghubung Drive belum merespons. Periksa deployment Anyone, SITE_ORIGIN, dan izin iframe browser. Muat ulang setelah diperbaiki.')),45000);
      window.addEventListener('message', event => {
        const d=event.data;
        if (!d || d.channel!==channel) return;
        if (!/^https:\/\/(?:[a-z0-9-]+\.)?googleusercontent\.com$/.test(event.origin) && event.origin!=='https://script.google.com') return;
        if (d.type==='haura-ready' && !target) { target=event.source; origin=event.origin; clearTimeout(timeout); resolve(); return; }
        if(event.source!==target || event.origin!==origin || d.type!=='haura-result') return;
        const p=pending.get(d.id); if(!p)return; clearTimeout(p.timer); pending.delete(d.id);
        if(d.ok)p.resolve(d.data);else p.reject(new Error(d.error||'Operasi Drive gagal.'));
      });
      frame.src=config.webAppUrl+'?channel='+encodeURIComponent(channel)+'&parentOrigin='+encodeURIComponent(location.origin);
      document.body.append(frame);
    });
    return readyPromise;
  }
  async function call(action,args={}) {
    await ready(); const user=currentUser(); const token=user?await user.getIdToken():'';
    const id=crypto.randomUUID();
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{pending.delete(id);reject(new Error('Operasi melewati batas waktu. Periksa data sebelum mengulang; operasi tulis mungkin sudah tersimpan.'));},90000);
      pending.set(id,{resolve,reject,timer});
      target.postMessage({type:'haura-call',channel,id,request:{action,args,token}},origin);
    });
  }
  return {configured,call};
}
export function revive(value) {
  if(Array.isArray(value))return value.map(revive);
  if(value && typeof value==='object') {
    if(typeof value.__hauraTime==='string')return {__hauraTime:value.__hauraTime,toDate:()=>new Date(value.__hauraTime)};
    return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,revive(v)]));
  }
  return value;
}
export function selectRows(rows,filters=[]) {
  let out=[...rows];
  for(const f of filters.filter(f=>f.type==='where')) out=out.filter(r=>r[f.field]===f.value);
  for(const f of filters.filter(f=>f.type==='orderBy'))out.sort((a,b)=>{
    const av=a[f.field]?.__hauraTime??a[f.field],bv=b[f.field]?.__hauraTime??b[f.field];
    return (av<bv?-1:av>bv?1:0)*(f.direction==='desc'?-1:1);
  });
  for(const f of filters.filter(f=>f.type==='limit'))out=out.slice(0,f.count);
  return out;
}
