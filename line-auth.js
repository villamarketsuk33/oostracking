/* One-hour server-issued session shared by both pages in the same browser tab. */
window.LineAuth=(()=>{
  'use strict';
  let initialized=null,backendReady=null,renewing=null,session=null,sessionSupported=true,hadSession=false,generation=0;
  const config=window.OOS_CONFIG||{};
  const sessionKey='villa-line-session-v1';
  function problem(code,message,uncertain=false){const e=new Error(message);e.code=code;e.uncertain=uncertain;return e;}
  function forgetSession(){session=null;generation++;try{sessionStorage.removeItem(sessionKey);}catch{}}
  function currentSession(){
    if(!session)try{session=JSON.parse(sessionStorage.getItem(sessionKey)||'null');}catch{}
    if(!session)return null;
    if(session.apiUrl!==config.apiUrl||session.liffId!==config.liffId||typeof session.token!=='string'||!session.token.startsWith('v1.')||!Number.isFinite(session.expiresAt)){
      forgetSession();return null;
    }
    hadSession=true;
    if(session.expiresAt<=Date.now()){forgetSession();return null;}
    return session;
  }
  function rememberSession(value){
    if(!value||typeof value.token!=='string'||!value.token.startsWith('v1.')||!Number.isFinite(value.expiresAt)||value.expiresAt<=Date.now())return;
    hadSession=true;session={token:value.token,expiresAt:value.expiresAt,apiUrl:config.apiUrl,liffId:config.liffId};
    try{sessionStorage.setItem(sessionKey,JSON.stringify(session));}catch{}
  }
  async function loadLiff(){
    if(window.liff)return;
    await new Promise((resolve,reject)=>{
      const script=document.createElement('script');script.src='https://static.line-scdn.net/liff/edge/2/sdk.js';script.async=true;
      const failed=()=>{clearTimeout(timer);script.remove();reject(problem('LIFF_UNAVAILABLE','โหลด LINE ไม่สำเร็จ กรุณาตรวจอินเทอร์เน็ตแล้วลองใหม่'));};
      const timer=setTimeout(failed,20000);
      script.onload=()=>{clearTimeout(timer);if(window.liff)resolve();else failed();};script.onerror=failed;document.head.append(script);
    });
  }
  async function checkBackend(endpoint) {
    if(!backendReady)backendReady=(async()=>{
      const health=new URL(endpoint.href);health.searchParams.set('action','health');
      const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),20000);
      try{
        const response=await fetch(health.href,{method:'GET',mode:'cors',credentials:'omit',redirect:'follow',cache:'no-store',signal:controller.signal});
        let result;try{result=JSON.parse(await response.text());}catch{throw problem('DEPLOY_ACCESS','หลังบ้าน OOS ไม่ได้ตอบ JSON กรุณา Deploy แบบ Execute as me และ Who has access: Anyone แล้วใช้ URL /exec');}
        if(!response.ok)throw problem('DEPLOY_UNAVAILABLE','หลังบ้าน OOS ตอบ HTTP '+response.status+' กรุณาตรวจการ Deploy');
        if(result?.status!=='success'||result.version!=='github-pages-line-v4')throw problem('DEPLOY_VERSION','URL หลังบ้าน OOS ยังไม่ใช่รุ่น LINE Login (พบ '+String(result?.version||'ไม่ระบุรุ่น')+') กรุณาติดตั้ง Code.gs, OOS.gs, Requisition.gs, LineAuth.gs แล้ว Deploy → New version');
      }catch(error){if(error.code)throw error;throw problem('DEPLOY_CONNECTION','เชื่อมต่อหลังบ้าน OOS ไม่สำเร็จ กรุณาตรวจอินเทอร์เน็ตและสิทธิ์ Anyone ของ Web app');}
      finally{clearTimeout(timer);}
    })().catch(error=>{backendReady=null;throw error;});
    return backendReady;
  }
  async function initializeLiff() {
    if(!initialized) initialized=(async()=>{
      if(typeof config.liffId!=='string'||!/^\d{6,20}-[A-Za-z0-9_-]+$/.test(config.liffId))throw new Error('ผู้ดูแลต้องใส่ LIFF ID ของแอพ OOS ใน config.js โดยใช้ LINE Login channel เดียวกับฟอร์มลูกค้า');
      await loadLiff();
      await liff.init({liffId:config.liffId});
    })().catch(error=>{initialized=null;throw error;});
    await initialized;
  }
  async function ready() {
    if(currentSession())return true;
    await initializeLiff();return liff.isLoggedIn();
  }
  async function login() {
    if(await ready())return true;
    const redirect=new URL(location.href);if(redirect.protocol!=='https:')throw new Error('กรุณาเปิดแอพผ่าน HTTPS');
    redirect.search='';redirect.hash='';liff.login({redirectUri:redirect.href});return false;
  }
  async function request(action,data={}) {
    // On expiry establish a new session with a read-only bootstrap first.
    // Concurrent operations share that handshake; a write is never replayed.
    if(action!=='bootstrap'&&!currentSession()&&sessionSupported&&hadSession){
      if(!renewing)renewing=request('bootstrap').finally(()=>{renewing=null;});
      await renewing;
    }
    if(!await ready()){const e=new Error('กรุณาเข้าสู่ระบบด้วย LINE');e.code='AUTH_REQUIRED';throw e;}
    const active=currentSession(),token=active?null:liff.getAccessToken();
    if(!active&&!token){const e=new Error('เซสชัน LINE หมดอายุ กรุณาเข้าสู่ระบบใหม่');e.code='AUTH_INVALID';throw e;}
    let endpoint;try{endpoint=new URL(config.apiUrl);}catch{throw new Error('กรุณาตั้งค่า Apps Script /exec ใน config.js');}
    if(endpoint.protocol!=='https:'||endpoint.hostname!=='script.google.com'||!/^\/macros\/s\/[^/]+\/exec$/.test(endpoint.pathname)||endpoint.search||endpoint.hash)throw new Error('URL Apps Script ไม่ถูกต้อง');
    const body={...data,action,roundToken:data.roundToken||window.ExportGate?.token};
    for(const key of ['actor','branch','accessKey','lineUserId','role','accessToken','sessionToken'])delete body[key];
    if(active)body.sessionToken=active.token;else body.accessToken=token;
    const requestGeneration=generation;
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),90000);
    try {
      const response=await fetch(endpoint.href,{method:'POST',mode:'cors',headers:{'Content-Type':'text/plain;charset=UTF-8'},body:JSON.stringify(body),credentials:'omit',redirect:'follow',cache:'no-store',signal:controller.signal});
      let result;try{result=JSON.parse(await response.text());}catch{
        // Deployment diagnostics are a fallback, not an extra round trip on
        // every successful login. Never repeat a potentially committed write.
        try{await checkBackend(endpoint);}catch(error){error.uncertain=action!=='bootstrap';throw error;}
        throw problem('API_RESPONSE','หลังบ้าน OOS ไม่ได้ตอบ JSON กรุณาตรวจสิทธิ์ Web app และ Deploy เวอร์ชันใหม่'+(action==='bootstrap'?'':' หากเป็นการบันทึก ให้ลองคำขอเดิม'),action!=='bootstrap');
      }
      if(result?.error?.code==='UNAUTHORIZED')throw problem('DEPLOY_VERSION','หลังบ้าน OOS ยังใช้รหัสเข้าใช้งานแบบเดิม กรุณา Deploy โค้ดรุ่น LINE Login');
      if(result?.ok!==true){
        const error=new Error(result?.error?.message||result?.message||'ระบบไม่ยืนยันผล');error.code=result?.error?.code;
        if(['AUTH_SESSION_INVALID','AUTH_SESSION_EXPIRED','AUTH_INVALID','EMPLOYEE_INACTIVE','EMPLOYEE_AMBIGUOUS','NOT_REGISTERED'].includes(error.code))forgetSession();
        throw error;
      }
      if(!response.ok||!result.data)throw problem('API_RESPONSE','ระบบตอบกลับไม่ครบ กรุณาลองคำขอเดิม',true);
      if(action==='bootstrap'&&!active&&requestGeneration===generation){
        rememberSession(result.data.authSession);sessionSupported=!!currentSession();
      }
      return result.data;
    } catch(error) {
      if(!error.code){error.uncertain=action!=='bootstrap';error.message=action==='bootstrap'?'เชื่อมต่อหลังบ้าน OOS ไม่สำเร็จ กรุณาตรวจสิทธิ์ Web app และ Deploy เวอร์ชันใหม่':'ยังยืนยันผลไม่ได้ กรุณาตรวจอินเทอร์เน็ตแล้วลองคำขอเดิมอีกครั้ง';}
      throw error;
    } finally{clearTimeout(timer);}
  }
  async function logout() {
    forgetSession();sessionSupported=true;hadSession=false;
    try{sessionStorage.removeItem('oos-session');sessionStorage.removeItem('villa-export-navigation');sessionStorage.removeItem('villa-oos-to-requisition');}catch{}
    try{
      await initializeLiff();
      if(liff.isInClient()){liff.closeWindow();return;}
      if(liff.isLoggedIn())liff.logout();
    }catch{}
    location.href=location.pathname;
  }
  return Object.freeze({ready,login,request,logout});
})();
