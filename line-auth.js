/* Fresh LIFF token on every API call; employee identity is verified on the server. */
window.LineAuth=(()=>{
  'use strict';
  let initialized=null,backendReady=null;
  const config=window.OOS_CONFIG||{};
  function problem(code,message,uncertain=false){const e=new Error(message);e.code=code;e.uncertain=uncertain;return e;}
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
  async function ready() {
    if(!initialized) initialized=(async()=>{
      if(!window.liff)throw new Error('โหลด LINE ไม่สำเร็จ กรุณาตรวจอินเทอร์เน็ตแล้วเปิดหน้าใหม่');
      if(typeof config.liffId!=='string'||!/^\d{6,20}-[A-Za-z0-9_-]+$/.test(config.liffId))throw new Error('ผู้ดูแลต้องใส่ LIFF ID ของแอพ OOS ใน config.js โดยใช้ LINE Login channel เดียวกับฟอร์มลูกค้า');
      await liff.init({liffId:config.liffId});
    })().catch(error=>{initialized=null;throw error;});
    await initialized;return liff.isLoggedIn();
  }
  async function login() {
    if(await ready())return true;
    const redirect=new URL(location.href);if(redirect.protocol!=='https:')throw new Error('กรุณาเปิดแอพผ่าน HTTPS');
    redirect.search='';redirect.hash='';liff.login({redirectUri:redirect.href});return false;
  }
  async function request(action,data={}) {
    if(!await ready()){const e=new Error('กรุณาเข้าสู่ระบบด้วย LINE');e.code='AUTH_REQUIRED';throw e;}
    const token=liff.getAccessToken();if(!token){const e=new Error('เซสชัน LINE หมดอายุ กรุณาเข้าสู่ระบบใหม่');e.code='AUTH_INVALID';throw e;}
    let endpoint;try{endpoint=new URL(config.apiUrl);}catch{throw new Error('กรุณาตั้งค่า Apps Script /exec ใน config.js');}
    if(endpoint.protocol!=='https:'||endpoint.hostname!=='script.google.com'||!/^\/macros\/s\/[^/]+\/exec$/.test(endpoint.pathname)||endpoint.search||endpoint.hash)throw new Error('URL Apps Script ไม่ถูกต้อง');
    const body={...data,action,accessToken:token,roundToken:data.roundToken||window.ExportGate?.token};
    delete body.actor;delete body.branch;delete body.accessKey;delete body.lineUserId;
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
      if(result?.ok!==true){const error=new Error(result?.error?.message||result?.message||'ระบบไม่ยืนยันผล');error.code=result?.error?.code;throw error;}
      if(!response.ok||!result.data)throw problem('API_RESPONSE','ระบบตอบกลับไม่ครบ กรุณาลองคำขอเดิม',true);
      return result.data;
    } catch(error) {
      if(!error.code){error.uncertain=action!=='bootstrap';error.message=action==='bootstrap'?'เชื่อมต่อหลังบ้าน OOS ไม่สำเร็จ กรุณาตรวจสิทธิ์ Web app และ Deploy เวอร์ชันใหม่':'ยังยืนยันผลไม่ได้ กรุณาตรวจอินเทอร์เน็ตแล้วลองคำขอเดิมอีกครั้ง';}
      throw error;
    } finally{clearTimeout(timer);}
  }
  function logout() {
    try{sessionStorage.removeItem('oos-session');sessionStorage.removeItem('villa-export-navigation');sessionStorage.removeItem('villa-oos-to-requisition');}catch{}
    if(window.liff?.isInClient()){liff.closeWindow();return;}
    if(window.liff?.isLoggedIn())liff.logout();location.href=location.pathname;
  }
  return Object.freeze({ready,login,request,logout});
})();
