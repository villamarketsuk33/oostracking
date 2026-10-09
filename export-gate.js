/* ProductList is maintained on Google Sheets; the app only reads a checked snapshot. */
window.ExportGate=(()=>{
  let token='',snapshot=null,pending=null;
  const listeners=[];
  function accept(value){
    if(!value||typeof value.roundToken!=='string'||!value.roundToken||!Number.isFinite(Date.parse(value.expiresAt)))throw new Error('ระบบตอบข้อมูล ProductList ไม่ครบ กรุณาลองโหลดใหม่');
    token=value.roundToken;snapshot=value;listeners.forEach(fn=>fn(value));return value;
  }
  function prepare(){
    let saved;try{saved=JSON.parse(sessionStorage.getItem('villa-export-navigation')||'null');sessionStorage.removeItem('villa-export-navigation');}catch{}
    return saved?.token||token||'';
  }
  async function unlock(api){
    if(pending)return pending;
    pending=api('round.open').then(accept);
    try{return await pending;}finally{pending=null;}
  }
  async function resume(api){
    const saved=prepare();if(!saved)return null;
    try{return accept(await api('round.check',{roundToken:saved}));}catch{return null;}
  }
  async function ensure(api){
    if(pending)return pending;
    if(token&&snapshot&&Date.parse(snapshot.expiresAt)>Date.now())return snapshot;
    return unlock(api);
  }
  async function request(api,action,data={}){
    if(!['lookup','req.lookup','req.search'].includes(action))return api(action,data);
    await ensure(api);
    try{return await api(action,{...data,roundToken:token});}
    catch(error){
      if(!['ROUND_REQUIRED','ROUND_EXPIRED','ROUND_CHANGED'].includes(error.code))throw error;
      // Read-only retry after reloading a changed/evicted round. Writes retain
      // their immutable request IDs and always require an explicit retry.
      await unlock(api);return api(action,{...data,roundToken:token});
    }
  }
  function navigate(url){
    if(!['index.html','requisition.html'].includes(url))return;
    try{if(token)sessionStorage.setItem('villa-export-navigation',JSON.stringify({token}));}catch{}
    location.href=url;
  }
  document.querySelectorAll('a[href="index.html"],a[href="requisition.html"]').forEach(link=>link.addEventListener('click',e=>{
    if(e.ctrlKey||e.metaKey||e.shiftKey||e.altKey||e.button)return;
    if(window.OOS_CONFIG?.demo||new URLSearchParams(location.search).get('demo')==='1'){link.href=link.getAttribute('href')+'?demo=1';return;}
    e.preventDefault();navigate(link.getAttribute('href'));
  }));
  return {unlock,resume,prepare,accept,ensure,request,navigate,onChange:fn=>listeners.push(fn),get token(){return token;},get snapshot(){return snapshot;}};
})();
