(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const config = window.OOS_CONFIG || {};
  const demo = config.demo === true || new URLSearchParams(location.search).get('demo') === '1';
  const state = {auth:null,filter:'ready',page:1,records:[],health:{},mode:'create',lookup:null,detail:null,requestId:null,closeRequestId:null,listGeneration:0,scanner:null,scanning:false};
  const type = {'รอสินค้า':'waiting','รอเติม':'ready','ตรวจสอบข้อมูล':'review','ปิดแล้ว':'closed'};
  const storage = {get:k=>{try{return sessionStorage.getItem(k);}catch{return null;}},set:(k,v)=>{try{sessionStorage.setItem(k,v);}catch{}},remove:k=>{try{sessionStorage.removeItem(k);}catch{}}};
  const make = (tag,cls,text) => {const el=document.createElement(tag);if(cls)el.className=cls;if(text!==undefined)el.textContent=text;return el;};
  const when = value => value ? new Intl.DateTimeFormat('th-TH',{dateStyle:'short',timeStyle:'short',timeZone:'Asia/Bangkok'}).format(new Date(value)) : 'ยังไม่ได้ตรวจ';
  const uuid = () => crypto.randomUUID ? crypto.randomUUID() : Array.from(crypto.getRandomValues(new Uint8Array(20)),n=>n.toString(16).padStart(2,'0')).join('');
  function toast(message,error=false) {$('toast').textContent=message;$('toast').classList.toggle('error',error);$('toast').hidden=false;clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('toast').hidden=true,5500);}
  function busy(root,on) {root.dataset.busy=String(on);root.querySelectorAll('button,input').forEach(el=>el.disabled=on);}
  async function api(action,data={}) {
    const payload={action,...data,actor:state.auth?.actor,branch:state.auth?.branch,accessKey:state.auth?.accessKey};
    if(demo)return window.OOS_DEMO.request(payload);
    if(!config.apiUrl||!/^https:\/\//.test(config.apiUrl))throw new Error('ยังไม่ได้ตั้งค่าการเชื่อมต่อ กรุณาติดต่อผู้ดูแล');
    const controller=new AbortController(), timer=setTimeout(()=>controller.abort(),90000);
    try {
      const response=await fetch(config.apiUrl,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),signal:controller.signal,cache:'no-store',credentials:'omit'});
      const result=await response.json();
      if(result.ok!==true)throw new Error(result.error?.message || 'ระบบไม่ยืนยันผล กรุณาลองอีกครั้ง');
      if(!response.ok || !result.data)throw new Error('ระบบตอบกลับไม่ครบ กรุณาลองอีกครั้ง');
      return result.data;
    } catch(error) {
      if(error.name==='AbortError'||error instanceof TypeError||error instanceof SyntaxError)throw new Error('ยังยืนยันผลไม่ได้ กรุณาตรวจอินเทอร์เน็ต แล้วลองรายการเดิมอีกครั้ง ระบบจะตรวจคำขอซ้ำก่อนบันทึก');
      throw error;
    } finally {clearTimeout(timer);}
  }
  function showHealth(h) {
    state.health=h;
    const msg=h.error ? h.error : h.paused ? 'กำลังอัปเดตข้อมูลต้นทาง · หยุดตรวจสต๊อกชั่วคราว' : h.pending ? 'ข้อมูลต้นทางมีการเปลี่ยนแปลง · กำลังรอตรวจสต๊อกใหม่' : 'ตรวจสต๊อกล่าสุด '+when(h.lastSyncAt);
    $('health').textContent=msg;$('health').className='health'+(h.error?' error':h.paused||h.pending?' warning':'');
    $('pause-btn').textContent=h.paused?'อัปเดตข้อมูลครบแล้ว เริ่มตรวจสต๊อก':'หยุดตรวจสต๊อกชั่วคราว';
  }
  async function enter() {
    const data=await api('bootstrap');state.auth.role=data.role;
    $('login-view').hidden=true;$('app-view').hidden=false;
    $('user-label').textContent=state.auth.actor+' · '+state.auth.branch;
    $('branch-label').textContent='สาขา '+state.auth.branch;
    $('admin-controls').hidden=data.role!=='admin';showHealth(data.health);
    if(!demo)storage.set('oos-session',JSON.stringify(state.auth));
    await load();
  }
  async function load(more=false) {
    const generation=++state.listGeneration;
    $('list-status').textContent='กำลังอ่านรายการ…';$('load-more').disabled=true;$('refresh-btn').disabled=true;
    try {
      const page=more?state.page+1:1;
      const data=await api('list',{filter:state.filter,query:$('search').value.trim(),section:$('section-filter').value.trim(),page});
      if(generation!==state.listGeneration)return;
      state.page=page;state.records=more?state.records.concat(data.records):data.records;
      ['ready','waiting','review'].forEach(k=>{$('count-'+k).textContent=Number(data.counts[k]||0).toLocaleString('th-TH');});
      $('total-label').textContent=data.total+' รายการ';showHealth(data.health);
      $('list-updated').textContent='อ่านรายการ '+new Intl.DateTimeFormat('th-TH',{hour:'2-digit',minute:'2-digit',timeZone:'Asia/Bangkok'}).format(new Date());
      renderRecords();$('load-more').hidden=!data.hasMore;$('list-status').textContent='แสดง '+state.records.length+' จาก '+data.total+' รายการ';
    } catch(error) {
      if(generation!==state.listGeneration)return;
      if(!more){state.records=[];$('records').replaceChildren(make('div','empty','อ่านรายการไม่สำเร็จ กรุณากดอัปเดตรายการอีกครั้ง'));}
      $('list-status').textContent=error.message;$('load-more').hidden=true;toast(error.message,true);
    } finally {if(generation===state.listGeneration){$('load-more').disabled=false;$('refresh-btn').disabled=false;}}
  }
  function boxIcon() {
    const el=make('div','record-icon');
    // Static SVG only. Product and user data are always textContent.
    el.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 7 9-4 9 4v11l-9 4-9-4zM3 7l9 4 9-4M12 11v11M8 5l9 4v5"/></svg>';
    return el;
  }
  function renderRecords() {
    const root=$('records');root.replaceChildren();
    if(!state.records.length) {
      const empty=make('div','empty');empty.append(make('div','empty-icon','✓'),make('strong','','ไม่มีรายการในมุมมองนี้'),make('span','','เลือกสถานะอื่น หรือบันทึก OOS เมื่อพบของขาด'));root.append(empty);return;
    }
    for(const r of state.records) {
      const row=make('article','record'), main=make('div','record-main'), info=make('div');
      const sub=make('div','record-sub');sub.append(make('span','section-pill','SECTION '+r.section),make('span','',r.productKey));
      info.append(make('h3','',r.name),sub,make('div','record-meta',r.issue || (r.status==='ปิดแล้ว' ? 'เติมโดย '+r.closedBy+' · '+when(r.closedAt) : (r.labelLocation || 'ป้ายบน top stock')+' · บันทึก '+when(r.openedAt))));main.append(boxIcon(),info);
      const stock=make('div','record-stock',r.stock===''||r.stock===null?'—':String(r.stock));stock.append(make('small','','ในชีท'));
      const action=make('div','record-action'), btn=make('button','',r.status==='ปิดแล้ว'?'ดูประวัติ ↗':'ตรวจ / เติมสินค้า ↗');btn.addEventListener('click',()=>openDetail(r));
      action.append(make('span','badge '+(type[r.status]||''),r.status),btn);row.append(main,stock,action);root.append(row);
    }
  }
  function selectFilter(filter) {
    state.filter=filter;
    document.querySelectorAll('.tabs [data-filter]').forEach(el=>el.classList.toggle('selected',el.dataset.filter===filter));
    document.querySelectorAll('.side-link').forEach(el=>el.classList.toggle('active',filter==='closed'?el.dataset.filter==='closed':el.dataset.filter==='ready'));
    load();
  }
  function previewProduct(root,r) {
    root.replaceChildren(make('h3','',r.name));
    root.append(make('p','','รหัส '+r.productKey+' · บาร์โค้ด '+r.barcode));
    const stock=make('p');stock.append(make('strong','','คงเหลือในชีท '+(r.stock===''||r.stock===null?'ไม่ทราบ':r.stock)));root.append(stock);
    if(r.section)root.append(make('p','','Section '+r.section+' · '+(r.labelLocation||'ป้ายบน top stock')));
    root.append(make('p','','ตรวจสินค้าเมื่อ '+when(r.checkedAt)));
    if(r.sourceUpdatedAt)root.append(make('p','','ข้อมูลสินค้าต้นทาง '+r.sourceUpdatedAt));
    if(r.issue)root.append(make('p','form-error',r.issue));
  }
  function openScan(mode) {
    state.mode=mode;state.lookup=null;state.requestId=null;
    $('scan-title').textContent=mode==='create'?'บันทึกสินค้า OOS':'สแกนสินค้าที่เติมแล้ว';
    $('lookup-form').reset();$('create-form').reset();$('create-form').hidden=true;$('existing-record').hidden=true;$('scan-error').textContent='';
    $('scan-dialog').showModal();setTimeout(()=>$('barcode').focus(),50);
  }
  async function lookup() {
    await stopCamera();$('scan-error').textContent='';$('create-form').hidden=true;$('existing-record').hidden=true;
    busy($('scan-dialog'),true);$('lookup-btn').textContent='กำลังค้นหา…';
    try {
      const barcode=$('barcode').value.trim(), data=await api('lookup',{barcode});state.lookup=data;
      if(data.active) {
        if(state.mode==='close') {$('scan-dialog').close();openDetail(data.active);return;}
        const root=$('existing-record');root.replaceChildren();root.hidden=false;
        const p=make('div','product-preview');previewProduct(p,data.active);
        const btn=make('button','btn secondary full','เปิดรายการเดิม');btn.addEventListener('click',()=>{$('scan-dialog').close();openDetail(data.active);});
        root.append(make('p','notice','สินค้านี้มีรายการ OOS อยู่แล้ว ไม่ต้องบันทึกซ้ำ'),p,btn);return;
      }
      if(state.mode==='close')throw new Error('สินค้านี้ไม่มีรายการ OOS ที่ยังเปิดอยู่');
      if(data.product.issue||data.product.stock!==0)throw new Error(data.product.issue||'ยอดคงเหลือในชีทไม่เป็น 0 จึงยังบันทึก OOS ไม่ได้');
      state.requestId=uuid();$('create-form').reset();previewProduct($('lookup-product'),data.product);
      $('new-section').value=data.section||'';$('new-location').value=data.labelLocation||'';
      $('section-hint').textContent=data.section?'ดึง Section ที่เคยบันทึกไว้แล้ว แก้ได้หากมีการย้ายสินค้า':'ครั้งแรกของสินค้านี้ กรุณาระบุ Section ระบบจะจำไว้ครั้งต่อไป';
      $('create-form').hidden=false;
    } catch(error) {$('scan-error').textContent=error.message;}
    finally {busy($('scan-dialog'),false);$('lookup-btn').textContent='ค้นหา';}
  }
  function openDetail(r) {
    state.detail=r;state.closeRequestId=uuid();$('close-form').reset();$('close-error').textContent='';$('section-error').textContent='';
    $('edit-section-details').open=false;$('edit-section').value=r.section;$('edit-location').value=r.labelLocation||'';
    previewProduct($('detail-product'),r);
    const closed=r.status==='ปิดแล้ว';$('close-form').hidden=closed;$('edit-section-details').hidden=closed;
    $('detail-title').textContent=closed?'ประวัติการเติม':'เติมสินค้าและคืนป้าย';
    if(closed)$('detail-product').append(make('p','','ปิดโดย '+r.closedBy+' · '+when(r.closedAt)),make('p','','คืนป้าย: '+r.labelReturned));
    $('detail-dialog').showModal();
  }
  async function loadScanner() {
    if(window.Html5Qrcode)return;
    await new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='vendor/html5-qrcode.min.js';s.onload=resolve;s.onerror=()=>reject(new Error('โหลดเครื่องสแกนไม่ได้ ใช้ช่องพิมพ์บาร์โค้ดหรือเครื่องสแกน USB ได้'));document.head.append(s);});
  }
  let cameraGeneration=0;
  async function startCamera() {
    if(state.scanning)return;
    if(!window.isSecureContext){$('scan-error').textContent='เปิดเว็บผ่าน HTTPS เพื่อใช้กล้อง หรือพิมพ์บาร์โค้ดแทน';return;}
    const generation=++cameraGeneration;
    $('camera-btn').disabled=true;$('scan-error').textContent='';
    try {
      await loadScanner();if(generation!==cameraGeneration)return;$('camera-box').hidden=false;
      state.scanner=new Html5Qrcode('camera-reader',{formatsToSupport:[Html5QrcodeSupportedFormats.EAN_13,Html5QrcodeSupportedFormats.EAN_8,Html5QrcodeSupportedFormats.UPC_A,Html5QrcodeSupportedFormats.UPC_E,Html5QrcodeSupportedFormats.CODE_128,Html5QrcodeSupportedFormats.CODE_39],verbose:false});
      let handled=false;const scanner=state.scanner;
      await scanner.start({facingMode:'environment'},{fps:10,qrbox:(w,h)=>({width:Math.min(w-30,300),height:Math.min(h-30,140)})},async code=>{
        if(handled||generation!==cameraGeneration)return;handled=true;$('barcode').value=code;await stopCamera();await lookup();
      },()=>{});
      if(generation!==cameraGeneration){try{await scanner.stop();scanner.clear();}catch{}return;}state.scanning=true;
    } catch(error) {$('camera-box').hidden=true;$('scan-error').textContent='เปิดกล้องไม่ได้ กรุณาอนุญาตกล้องและเปิดผ่าน Chrome/Safari หรือใช้ช่องพิมพ์บาร์โค้ด';state.scanner=null;}
    finally {$('camera-btn').disabled=false;}
  }
  async function stopCamera() {
    cameraGeneration++;
    const scanner=state.scanner;state.scanner=null;state.scanning=false;
    if(scanner){try{await scanner.stop();scanner.clear();}catch{}}
    $('camera-box').hidden=true;
  }
  $('login-form').addEventListener('submit',async e=>{
    e.preventDefault();$('login-error').textContent='';busy($('login-form'),true);
    state.auth={actor:$('actor').value.trim(),branch:$('branch').value.trim(),accessKey:$('access-key').value};
    try{await enter();}catch(error){$('login-error').textContent=error.message;state.auth=null;}finally{busy($('login-form'),false);}
  });
  $('lookup-form').addEventListener('submit',e=>{e.preventDefault();lookup();});
  $('create-form').addEventListener('submit',async e=>{
    e.preventDefault();if(!state.lookup)return;$('scan-error').textContent='';
    const payload={requestId:state.requestId,barcode:state.lookup.product.barcode,section:$('new-section').value.trim(),labelLocation:$('new-location').value.trim(),note:$('new-note').value.trim(),confirmedZero:$('confirm-zero').checked};
    busy($('scan-dialog'),true);$('save-oos').textContent='กำลังยืนยันการบันทึก…';
    try {const data=await api('create',payload);if(!data.record?.id)throw new Error('ยังยืนยันผลการบันทึกไม่ได้ กรุณาลองอีกครั้ง');$('scan-dialog').close();toast(data.alreadyOpen?'มีรายการเดิมอยู่แล้ว ระบบไม่สร้างซ้ำ':'บันทึก OOS แล้ว เก็บป้ายตาม Section ได้เลย');selectFilter('waiting');}
    catch(error){$('scan-error').textContent=error.message;}
    finally{busy($('scan-dialog'),false);$('save-oos').textContent='บันทึก OOS และจำ Section';}
  });
  $('close-form').addEventListener('submit',async e=>{
    e.preventDefault();$('close-error').textContent='';const id=state.detail.id;
    const payload={id,requestId:state.closeRequestId,confirmedFilled:$('confirm-filled').checked,confirmedLabel:$('confirm-label').checked};
    busy($('detail-dialog'),true);$('close-record').textContent='กำลังยืนยันการบันทึก…';
    try{const data=await api('close',payload);if(data.record?.id!==id||data.record.status!=='ปิดแล้ว')throw new Error('ยังยืนยันการปิดรายการไม่ได้ กรุณาลองอีกครั้ง');$('detail-dialog').close();toast(data.alreadyClosed?'รายการนี้ปิดแล้ว':'เติมสินค้าและคืนป้ายแล้ว เก็บประวัติเรียบร้อย');await load();}
    catch(error){$('close-error').textContent=error.message;}
    finally{busy($('detail-dialog'),false);$('close-record').textContent='ยืนยันเติมสินค้าและปิดรายการ';}
  });
  $('section-form').addEventListener('submit',async e=>{
    e.preventDefault();$('section-error').textContent='';const payload={id:state.detail.id,section:$('edit-section').value.trim(),labelLocation:$('edit-location').value.trim()};busy($('detail-dialog'),true);
    try{const data=await api('section',payload);state.detail=data.record;previewProduct($('detail-product'),data.record);$('edit-section-details').open=false;toast('จำ Section ใหม่แล้ว');await load();}catch(error){$('section-error').textContent=error.message;}finally{busy($('detail-dialog'),false);}
  });
  $('pause-btn').addEventListener('click',async()=>{const paused=!state.health.paused;$('pause-btn').disabled=true;$('pause-error').textContent='';try{await api('pause',{paused});await load();toast(paused?'หยุดตรวจสต๊อกแล้ว เริ่มอัปเดตชีทได้':'เปิดตรวจสต๊อกแล้ว ระบบจะตรวจหลังข้อมูลนิ่ง');}catch(error){$('pause-error').textContent=error.message;}finally{$('pause-btn').disabled=false;}});
  $('add-btn').addEventListener('click',()=>openScan('create'));$('refill-btn').addEventListener('click',()=>openScan('close'));
  $('camera-btn').addEventListener('click',startCamera);$('stop-camera').addEventListener('click',stopCamera);
  document.querySelectorAll('[data-filter]').forEach(el=>el.addEventListener('click',()=>selectFilter(el.dataset.filter)));
  $('refresh-btn').addEventListener('click',()=>load());$('load-more').addEventListener('click',()=>load(true));
  let searchTimer;['search','section-filter'].forEach(id=>$(id).addEventListener('input',()=>{clearTimeout(searchTimer);searchTimer=setTimeout(()=>load(),350);}));
  document.querySelectorAll('[data-close]').forEach(el=>el.addEventListener('click',()=>{if($(el.dataset.close).dataset.busy!=='true')$(el.dataset.close).close();}));
  document.querySelectorAll('dialog').forEach(dialog=>dialog.addEventListener('cancel',e=>{if(dialog.dataset.busy==='true')e.preventDefault();}));
  $('scan-dialog').addEventListener('close',stopCamera);document.addEventListener('visibilitychange',()=>{if(document.hidden)stopCamera();});
  $('account-btn').addEventListener('click',()=>{if(!state.auth)return;$('account-info').textContent=state.auth.actor+' · สาขา '+state.auth.branch;$('account-dialog').showModal();});
  $('logout-btn').addEventListener('click',()=>{storage.remove('oos-session');location.href=location.pathname;});
  $('demo-banner').hidden=!demo;$('demo-scan-hint').hidden=!demo;
  $('branch').value=config.defaultBranch||'1000';$('setup-notice').hidden=!!config.apiUrl||demo;
  if(demo){state.auth={actor:'พนักงานตัวอย่าง',branch:'1000',accessKey:'demo',role:'admin'};enter().catch(e=>toast(e.message,true));}
  else{try{const saved=storage.get('oos-session');if(saved){state.auth=JSON.parse(saved);enter().catch(()=>{storage.remove('oos-session');state.auth=null;$('app-view').hidden=true;$('login-view').hidden=false;});}}catch{storage.remove('oos-session');}}
})();
