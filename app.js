(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const config = window.OOS_CONFIG || {};
  const demo = config.demo === true || new URLSearchParams(location.search).get('demo') === '1';
  const state = {auth:null,filter:'ready',page:1,records:[],health:{},mode:'create',lookup:null,detail:null,requestId:null,closeRequestId:null,listGeneration:0};
  const type = {'รอสินค้า':'waiting','รอเติม':'ready','ตรวจสอบข้อมูล':'review','ปิดแล้ว':'closed'};
  const storage = {get:k=>{try{return sessionStorage.getItem(k);}catch{return null;}},set:(k,v)=>{try{sessionStorage.setItem(k,v);}catch{}},remove:k=>{try{sessionStorage.removeItem(k);}catch{}}};
  const make = (tag,cls,text) => {const el=document.createElement(tag);if(cls)el.className=cls;if(text!==undefined)el.textContent=text;return el;};
  const when = value => value ? new Intl.DateTimeFormat('th-TH',{dateStyle:'short',timeStyle:'short',timeZone:'Asia/Bangkok'}).format(new Date(value)) : 'ยังไม่ได้ตรวจ';
  const uuid = () => crypto.randomUUID ? crypto.randomUUID() : Array.from(crypto.getRandomValues(new Uint8Array(20)),n=>n.toString(16).padStart(2,'0')).join('');
  function toast(message,error=false) {$('toast').textContent=message;$('toast').classList.toggle('error',error);$('toast').hidden=false;clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('toast').hidden=true,5500);}
  function busy(root,on) {root.dataset.busy=String(on);root.querySelectorAll('button,input').forEach(el=>el.disabled=on);}
  async function api(action,data={}) {
    if(demo)return window.OOS_DEMO.request({action,...data,actor:state.auth?.actor,branch:state.auth?.branch});
    return window.ExportGate.request((action,data)=>window.LineAuth.request(action,data),action,data);
  }
  function showHealth(h) {
    state.health=h;
    const msg=h.error ? h.error : h.paused ? 'กำลังอัปเดตข้อมูลต้นทาง · หยุดตรวจสต๊อกชั่วคราว' : h.pending ? 'ข้อมูลต้นทางมีการเปลี่ยนแปลง · กำลังรอตรวจสต๊อกใหม่' : 'ตรวจสต๊อกล่าสุด '+when(h.lastSyncAt);
    $('health').textContent=msg;$('health').className='health'+(h.error?' error':h.paused||h.pending?' warning':'');
    $('pause-btn').textContent=h.paused?'อัปเดตข้อมูลครบแล้ว เริ่มตรวจสต๊อก':'หยุดตรวจสต๊อกชั่วคราว';
  }
  let entering=null;
  function enter(){if(!entering)entering=startSession().finally(()=>{entering=null;});return entering;}
  async function startSession() {
    const data=await api('bootstrap',demo?{}:{startSession:true,view:'oos',filter:state.filter,roundToken:window.ExportGate.prepare()});state.auth=demo?{...state.auth,role:data.role}:data.employee;
    if(!state.auth?.actor)throw new Error('ระบบตอบข้อมูลพนักงานไม่ครบ');
    $('login-view').hidden=true;$('app-view').hidden=false;
    $('user-label').textContent=state.auth.actor+' · '+state.auth.branch;
    $('branch-label').textContent='สาขา '+state.auth.branch;
    $('admin-controls').hidden=data.role!=='admin';showHealth(data.health);
    if(!demo) {
      if(data.round)window.ExportGate.accept(data.round);
      else if(data.roundError){$('source-detail').textContent=data.roundError.message;toast(data.roundError.message,true);}
      else await window.ExportGate.resume(api)||await window.ExportGate.unlock(api);
    }
    if(data.list)showList(data.list);else await load();
  }
  function showList(data,more=false){
    state.page=data.page||1;state.records=more?state.records.concat(data.records):data.records;
    ['ready','waiting','review'].forEach(k=>{$('count-'+k).textContent=Number(data.counts[k]||0).toLocaleString('th-TH');});
    $('total-label').textContent=data.total+' รายการ';showHealth(data.health);
    $('list-updated').textContent='อ่านรายการ '+new Intl.DateTimeFormat('th-TH',{hour:'2-digit',minute:'2-digit',timeZone:'Asia/Bangkok'}).format(new Date());
    renderRecords();$('load-more').hidden=!data.hasMore;$('list-status').textContent='แสดง '+state.records.length+' จาก '+data.total+' รายการ';
  }
  async function load(more=false) {
    const generation=++state.listGeneration;
    $('list-status').textContent='กำลังอ่านรายการ…';$('load-more').disabled=true;$('refresh-btn').disabled=true;
    try {
      const page=more?state.page+1:1;
      const data=await api('list',{filter:state.filter,query:$('search').value.trim(),section:$('section-filter').value.trim(),page});
      if(generation!==state.listGeneration)return;
      showList(data,more);
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
      action.append(make('span','badge '+(type[r.status]||''),r.status),btn);
      if(r.status==='รอเติม'&&Number(r.stock)>0&&!r.issue) {
        const request=make('button','oos-requisition-btn','นำไปเบิกสินค้า →');
        request.addEventListener('click',()=>{
          if(demo){toast('ทดลองเบิกสินค้าได้ที่เมนูเบิกสินค้า');return;}
          try{sessionStorage.setItem('villa-oos-to-requisition',JSON.stringify({branch:state.auth.branch,productCode:r.productCode,section:r.section,labelLocation:r.labelLocation,oosId:r.id}));}
          catch{toast('เก็บรายการส่งต่อไม่ได้ กรุณาเปิดหน้าเบิกแล้วค้นด้วยรหัส '+r.productCode,true);return;}
          window.ExportGate.navigate('requisition.html');
        });
        action.append(request);
      }
      row.append(main,stock,action);root.append(row);
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
    $('lookup-form').reset();$('create-form').reset();$('create-form').hidden=true;$('existing-record').hidden=true;$('scan-error').textContent='';$('create-error').textContent='';
    $('scan-dialog').showModal();if(!window.matchMedia?.('(pointer: coarse)').matches)setTimeout(()=>$('barcode').focus(),50);
  }
  async function lookup() {
    await stopCamera();$('scan-error').textContent='';$('create-form').hidden=true;$('existing-record').hidden=true;
    busy($('scan-dialog'),true);$('lookup-btn').textContent='กำลังค้นหา…';
    try {
      if(/^\][A-Za-z]\d/.test($('barcode').value.trim()))$('barcode').value=window.BarcodeCamera.normalize($('barcode').value);
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
      $('section-hint').textContent=data.section?'ดึงตำแหน่งที่เคยบันทึกไว้แล้ว ตรวจหรือแก้ได้หากมีการย้ายสินค้า':'ครั้งแรกของสินค้านี้ กรุณาระบุ Section และตำแหน่งชั้นวาง';
      $('create-form').hidden=false;
      $('create-error').textContent='';$('scan-dialog').close();$('create-dialog').showModal();
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
  const barcodeCamera = window.BarcodeCamera.create({boxId:'camera-box',readerId:'camera-reader',
    onDetected:async code=>{$('barcode').value=window.BarcodeCamera.normalize(code);await lookup();},
    onError:message=>{$('scan-error').textContent=message;}
  });
  async function startCamera() {
    $('camera-btn').disabled=true;$('scan-error').textContent='';state.lookup=null;$('create-form').hidden=true;$('existing-record').hidden=true;
    try{await barcodeCamera.start();}finally{$('camera-btn').disabled=false;}
  }
  async function stopCamera() {await barcodeCamera.stop();}
  $('login-form').addEventListener('submit',async e=>{
    e.preventDefault();$('login-error').textContent='';busy($('login-form'),true);
    try{if(demo||await window.LineAuth.login())await enter();}catch(error){$('login-error').textContent=error.message;state.auth=null;$('app-view').hidden=true;$('login-view').hidden=false;}finally{busy($('login-form'),false);}
  });
  $('lookup-form').addEventListener('submit',e=>{e.preventDefault();lookup();});
  $('create-form').addEventListener('submit',async e=>{
    e.preventDefault();if(!state.lookup)return;$('create-error').textContent='';
    const payload={requestId:state.requestId,barcode:state.lookup.product.barcode,section:$('new-section').value.trim(),labelLocation:$('new-location').value.trim(),note:$('new-note').value.trim(),confirmedZero:$('confirm-zero').checked};
    busy($('create-dialog'),true);$('save-oos').textContent='กำลังยืนยันการบันทึก…';
    try {const data=await api('create',payload);if(!data.record?.id)throw new Error('ยังยืนยันผลการบันทึกไม่ได้ กรุณาลองอีกครั้ง');$('create-dialog').close();toast(data.alreadyOpen?'มีรายการเดิมอยู่แล้ว ระบบไม่สร้างซ้ำ':'บันทึก OOS และตำแหน่งสินค้าแล้ว');selectFilter('waiting');}
    catch(error){$('create-error').textContent=error.message;}
    finally{busy($('create-dialog'),false);$('save-oos').textContent='ยืนยันบันทึก OOS';}
  });
  $('placement-rescan').addEventListener('click',()=>{if($('create-dialog').dataset.busy==='true')return;$('create-dialog').close();openScan('create');});
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
  $('new-round-btn').addEventListener('click',async()=>{if(demo){toast('โหมดตัวอย่างไม่อัปเดตข้อมูลจริง');return;}try{await window.ExportGate.unlock(api);await load();}catch(error){toast(error.message,true);}});
  $('add-btn').addEventListener('click',()=>openScan('create'));$('refill-btn').addEventListener('click',()=>openScan('close'));
  $('camera-btn').addEventListener('click',startCamera);$('stop-camera').addEventListener('click',stopCamera);
  document.querySelectorAll('[data-filter]').forEach(el=>el.addEventListener('click',()=>selectFilter(el.dataset.filter)));
  $('refresh-btn').addEventListener('click',async()=>{try{if(!demo)await window.ExportGate.unlock(api);await load();}catch(error){toast(error.message,true);}});$('load-more').addEventListener('click',()=>load(true));
  let searchTimer;['search','section-filter'].forEach(id=>$(id).addEventListener('input',()=>{clearTimeout(searchTimer);searchTimer=setTimeout(()=>load(),350);}));
  document.querySelectorAll('[data-close]').forEach(el=>el.addEventListener('click',()=>{if($(el.dataset.close).dataset.busy!=='true')$(el.dataset.close).close();}));
  document.querySelectorAll('dialog').forEach(dialog=>dialog.addEventListener('cancel',e=>{if(dialog.dataset.busy==='true')e.preventDefault();}));
  $('scan-dialog').addEventListener('close',stopCamera);document.addEventListener('visibilitychange',()=>{if(document.hidden)stopCamera();});
  $('account-btn').addEventListener('click',()=>{if(!state.auth)return;$('account-info').textContent=state.auth.actor+' · สาขา '+state.auth.branch;$('account-dialog').showModal();});
  $('logout-btn').addEventListener('click',()=>{if(demo){location.href=location.pathname;return;}window.LineAuth.logout();});
  $('demo-banner').hidden=!demo;$('demo-scan-hint').hidden=!demo;
  $('setup-notice').hidden=!!(config.apiUrl&&config.liffId)||demo;
  window.ExportGate.onChange(s=>{$('source-detail').textContent='ProductList · ไฟล์แก้ไขล่าสุด '+when(s.sourceModifiedAt);});
  if(demo){state.auth={actor:'พนักงานตัวอย่าง',branch:'1000',accessKey:'demo',role:'admin'};enter().catch(e=>toast(e.message,true));}
  else{storage.remove('oos-session');window.LineAuth.ready().then(logged=>{if(logged)return enter();}).catch(error=>{state.auth=null;$('app-view').hidden=true;$('login-view').hidden=false;$('login-error').textContent=error.message;});}
})();
