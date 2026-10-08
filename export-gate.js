/* ProductList is maintained on Google Sheets; the app only reads a checked snapshot. */
window.ExportGate=(()=>{
  let token='',snapshot=null,pending=null;
  const listeners=[];
  function accept(value){token=value.roundToken;snapshot=value;listeners.forEach(fn=>fn(value));return value;}
  async function unlock(api){
    if(pending)return pending;
    token='';snapshot=null;
    pending=api('round.open').then(accept);
    try{return await pending;}finally{pending=null;}
  }
  async function resume(api){
    let saved;try{saved=JSON.parse(sessionStorage.getItem('villa-export-navigation')||'null');sessionStorage.removeItem('villa-export-navigation');}catch{return null;}
    if(!saved?.token)return null;
    try{return accept(await api('round.check',{roundToken:saved.token}));}catch{return null;}
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
  return {unlock,resume,navigate,onChange:fn=>listeners.push(fn),get token(){return token;},get snapshot(){return snapshot;}};
})();
