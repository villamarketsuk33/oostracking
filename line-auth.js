/* Fresh LIFF token on every API call; employee identity is verified on the server. */
window.LineAuth=(()=>{
  'use strict';
  let initialized=null;
  const config=window.OOS_CONFIG||{};
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
      const result=await response.json();
      if(result.ok!==true){const error=new Error(result.error?.message||'ระบบไม่ยืนยันผล');error.code=result.error?.code;throw error;}
      if(!response.ok||!result.data)throw new Error('ระบบตอบกลับไม่ครบ กรุณาลองคำขอเดิม');
      return result.data;
    } catch(error) {
      if(!error.code){error.uncertain=true;error.message='ยังยืนยันผลไม่ได้ กรุณาตรวจอินเทอร์เน็ตแล้วลองคำขอเดิมอีกครั้ง';}
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
