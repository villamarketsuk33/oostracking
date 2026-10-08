(() => {
  'use strict';
  const $=id=>document.getElementById(id), config=window.OOS_CONFIG||{};
  const demo=config.demo===true||new URLSearchParams(location.search).get('demo')==='1';
  const state={auth:null,cart:[],lookup:null,pending:null,document:null,cancel:false,scanner:null,busy:false,round:null};
  const el=(tag,text,cls)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e;};
  const time=v=>v?new Intl.DateTimeFormat('th-TH',{dateStyle:'short',timeStyle:'short',timeZone:'Asia/Bangkok'}).format(new Date(v)):'—';
  const count=v=>Number(v).toLocaleString('th-TH',{maximumFractionDigits:3});
  const storage={get:k=>{try{return JSON.parse(sessionStorage.getItem(k)||'null');}catch{return null;}},put:(k,v)=>{try{sessionStorage.setItem(k,JSON.stringify(v));}catch{}},remove:k=>{try{sessionStorage.removeItem(k);}catch{}}};
  const pendingKey=()=>`rq-pending:${state.auth.branch}:${state.auth.actor}`;
  async function api(action,data={}) {
    const payload={...data,action,actor:state.auth.actor,branch:state.auth.branch,accessKey:state.auth.accessKey,roundToken:data.roundToken||window.ExportGate.token};
    if(demo)return window.RequisitionDemo.request(payload);
    let endpoint;try{endpoint=new URL(config.apiUrl);}catch{throw new Error('ยังไม่ได้ตั้งค่า URL Apps Script /exec ใน web/config.js');}
    if(endpoint.protocol!=='https:'||endpoint.hostname!=='script.google.com'||!endpoint.pathname.endsWith('/exec')||endpoint.search||endpoint.hash)throw new Error('URL ระบบไม่ถูกต้อง กรุณาตั้งค่า Apps Script Web App /exec');
    const controller=new AbortController(), timer=setTimeout(()=>controller.abort(),180000);
    try {
      const response=await fetch(endpoint.href,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify(payload),credentials:'omit',redirect:'follow',signal:controller.signal});
      const result=await response.json();
      if(result.ok!==true){const error=new Error(result.error?.message||'ระบบไม่ยืนยันผล');error.code=result.error?.code;throw error;}
      if(!response.ok||!result.data)throw new Error('ระบบตอบกลับไม่ครบ กรุณาตรวจผลก่อนทำรายการใหม่');
      return result.data;
    } catch(error) {
      if(!error.code){error.uncertain=true;error.message='ยังยืนยันผลไม่ได้ กรุณาตรวจการเชื่อมต่อแล้วลองคำขอเดิมอีกครั้ง ระบบจะไม่บันทึกซ้ำ';}
      throw error;
    } finally {clearTimeout(timer);}
  }
  function lock(on) {
    state.busy=on;
    $('rq-new-view').querySelectorAll('input,select,button').forEach(e=>e.disabled=on||!!state.pending);
    $('rq-save').disabled=on||!state.cart.length;
    $('rq-new-round').disabled=on;
    $('rq-save').textContent=on?'กำลังยืนยันผลการบันทึก…':state.pending?'ตรวจและลองบันทึกคำขอเดิม':'บันทึกใบเบิกลง Google Sheets';
  }
  function showSnapshot(s) {
    state.round=s;
    $('rq-source-time').textContent=demo?'โหมดตัวอย่าง · ข้อมูลจำลอง':'สต๊อกต้นทางถึง '+time(s.dataAsOf);
    $('rq-source-detail').textContent='ไฟล์อัปเดต '+time(s.sourceModifiedAt)+' · ใช้รอบนี้ได้ถึง '+time(s.expiresAt)+' · รีโหลดหรือเริ่มรอบใหม่ ต้องอัปเดต Export อีกครั้ง';
  }
  async function startRound(resume=false) {
    if(demo){showSnapshot(window.RequisitionDemo.snapshot);return;}
    const transferred=resume?await window.ExportGate.resume(api):null;
    showSnapshot(transferred||await window.ExportGate.unlock(api));
  }
  async function enter() {
    const data=await api('bootstrap');state.auth.role=data.role;
    if(!demo)storage.put('oos-session',state.auth);
    $('rq-login').hidden=true;$('rq-work').hidden=false;$('rq-logout').hidden=false;
    $('rq-user').textContent='สาขา '+state.auth.branch+' · '+state.auth.actor;
    const saved=demo?null:storage.get(pendingKey());
    if(saved&&saved.items&&saved.requestId){state.pending=saved;state.cart=saved.items.map(x=>({...x,name:x.name||x.productCode}));}
    renderCart();
    if(state.pending) {
      $('rq-source-time').textContent='มีคำขอเดิมรอยืนยันผล — กดลองบันทึกคำขอเดิม';
    } else {
      await startRound(true);
      const transfer=storage.get('villa-oos-to-requisition');storage.remove('villa-oos-to-requisition');
      if(transfer&&transfer.branch===state.auth.branch&&transfer.productCode) {
        $('rq-lookup-type').value='sku';$('rq-query').value=transfer.productCode;
        await lookup();
        if(state.lookup) {
          $('rq-section').value=transfer.section||state.lookup.section||'';
          $('rq-note').value=('จาก OOS '+transfer.oosId+' · ป้าย '+(transfer.labelLocation||'ตาม Section')).slice(0,300);
        }
      }
    }
    $('rq-query').focus();
  }
  async function lookup() {
    if(state.pending||state.busy)return;
    $('rq-search-error').textContent='';$('rq-item-form').hidden=true;$('rq-search-empty').hidden=true;
    state.lookup=null;$('rq-search-btn').disabled=true;
    $('rq-name-results').replaceChildren();
    try {
      if($('rq-lookup-type').value==='name') {
        const data=await api('req.search',{query:$('rq-query').value.trim()}), root=$('rq-name-results');
        if(!data.products.length)root.append(el('p','ไม่พบชื่อสินค้านี้ใน Export'));
        for(const p of data.products) {
          const button=el('button',p.name,'btn secondary');button.type='button';
          button.append(el('small','รหัส '+p.productCode+' · บาร์โค้ด '+p.barcode));
          button.onclick=()=>{$('rq-lookup-type').value='sku';$('rq-query').value=p.productCode;lookup();};
          root.append(button);
        }
        if(data.hasMore)root.append(el('p','แสดง 30 รายการแรก พิมพ์ชื่อให้ละเอียดขึ้นเพื่อหาเพิ่มเติม','small muted'));
        return;
      }
      const data=await api('req.lookup',{query:$('rq-query').value.trim(),lookupType:$('rq-lookup-type').value});
      const p=data.product;state.lookup=p;
      const root=$('rq-product');root.replaceChildren(el('h3',p.name),el('p','รหัส '+p.productCode+' · บาร์โค้ด '+p.barcode));
      const stock=el('div',undefined,'rq-stock'),left=el('div');left.append(el('strong',count(p.stock)),el('span',' คงเหลือทั้งร้าน (Z)'));stock.append(left,el('span','ขายรายวัน '+(p.dailySales===null?'—':count(p.dailySales))));root.append(stock);
      if(p.unitWarning)root.append(el('p','รหัสสั่งซื้อ AB ต่างจากรหัสสินค้า E — ระบบไม่แปลงชิ้น/แพ็กให้ กรุณาตรวจหน่วยของรหัสนี้','rq-warning'));
      if(data.openDocuments.length){root.append(el('p','มีใบเบิกค้าง: '+data.openDocuments.join(', ')+' กรุณาจัดการใบเดิมก่อน','rq-warning'));}
      if(p.stock<=0)root.append(el('p','คงเหลือเป็น 0 จึงยังเบิกไม่ได้ ให้ติดตามในหน้า OOS หรือตรวจแก้สต๊อกก่อน','rq-warning'));
      $('rq-item-form').reset();$('rq-section').value=p.section||'';$('rq-qty').max=String(p.stock);$('rq-qty').value=String(Math.min(1,Math.max(0,p.stock)));
      $('rq-item-form').hidden=false;$('rq-add-btn').disabled=p.stock<=0||data.openDocuments.length>0;
    } catch(error){$('rq-search-error').textContent=error.message;}
    finally{$('rq-search-btn').disabled=false;}
  }
  function renderCart() {
    const root=$('rq-cart');root.replaceChildren();$('rq-count').textContent=state.cart.length;
    if(!state.cart.length)root.append(el('div','ยังไม่มีรายการเบิก\nเลือกสินค้าจากช่องค้นหาด้านซ้าย','rq-placeholder'));
    state.cart.forEach((x,i)=>{
      const card=el('article',undefined,'rq-cart-item');card.append(el('h3',(i+1)+'. '+x.name),el('p',x.productCode+' · Section '+x.section),el('p',x.reason+(x.note?' · '+x.note:'')));
      const row=el('div',undefined,'rq-inline'),remove=el('button','นำออก','text-btn');remove.type='button';remove.onclick=()=>{state.cart.splice(i,1);renderCart();};row.append(el('strong',count(x.qty)+' '+x.unit),remove);card.append(row);root.append(card);
    });
    lock(false);
  }
  function selectView(history) {
    $('rq-new-view').hidden=history;$('rq-history-view').hidden=!history;
    $('rq-tab-new').classList.toggle('active',!history);$('rq-tab-history').classList.toggle('active',history);
    if(history)loadHistory();
  }
  async function save() {
    if(!state.cart.length||state.busy)return;
    $('rq-save-error').textContent='';
    if(!state.pending){
      state.pending={requestId:crypto.randomUUID(),items:state.cart.map(x=>({...x}))};
      if(!demo) {
        try{sessionStorage.setItem(pendingKey(),JSON.stringify(state.pending));}
        catch{state.pending=null;$('rq-save-error').textContent='เบราว์เซอร์ไม่อนุญาตเก็บคำขอ กรุณาอนุญาต storage ก่อนบันทึก';return;}
      }
    }
    lock(true);
    try {
      const data=await api('req.create',state.pending);
      if(!data.document?.id||!Array.isArray(data.document.items))throw new Error('ระบบยังไม่ยืนยันเลขที่ใบเบิก กรุณาลองคำขอเดิม');
      state.pending=null;state.cart=[];if(!demo)storage.remove(pendingKey());
      $('rq-item-form').hidden=true;$('rq-search-empty').hidden=false;renderCart();showDocument(data.document);
    } catch(error) {
      $('rq-save-error').textContent=error.message;
      // Validation errors occur before the write. An uncertain network/server result
      // MUST keep the same immutable payload and request ID until resolved.
      const beforeWrite=['ROUND_REQUIRED','ROUND_EXPIRED','ROUND_CHANGED','UPDATING','VALIDATION','CONFIRM_REQUIRED','NOT_FOUND','STOCK_REVIEW','SOURCE_SCHEMA','INSUFFICIENT_STOCK','OPEN_REQUISITION','DUPLICATE_SKU','AMBIGUOUS','UNAUTHORIZED'];
      if(beforeWrite.includes(error.code)){state.pending=null;if(!demo)storage.remove(pendingKey());}
    } finally{lock(false);}
  }
  function badge(status) {return el('span',status,'rq-badge'+(status==='เติมครบแล้ว'?' done':status==='ยกเลิก'?' cancel':''));}
  async function loadHistory() {
    $('rq-history-error').textContent='';$('rq-history-refresh').disabled=true;
    try {
      const data=await api('req.list',{query:$('rq-history-query').value.trim()}),root=$('rq-history-list');root.replaceChildren();
      if(!data.documents.length)root.append(el('div','ยังไม่มีใบเบิกตามที่ค้นหา','rq-placeholder'));
      for(const d of data.documents){const card=el('article',undefined,'rq-history-card'),info=el('div'),title=el('h3',d.id);title.append(badge(d.status));info.append(title,el('p',time(d.createdAt)+' · '+d.actor+' · '+d.items.length+' รายการ'),el('p',d.items.slice(0,2).map(x=>x.name).join(' / ')));const button=el('button','เปิด / พิมพ์','btn secondary');button.onclick=async()=>{button.disabled=true;try{showDocument((await api('req.get',{id:d.id})).document);}catch(error){$('rq-history-error').textContent=error.message;}finally{button.disabled=false;}};card.append(info,button);root.append(card);}
      if(data.total>100)root.append(el('p','แสดง 100 ใบล่าสุดจาก '+data.total+' ใบ ใช้ช่องค้นหาเพื่อหาใบเก่า','small muted'));
    } catch(error){$('rq-history-error').textContent=error.message;}
    finally{$('rq-history-refresh').disabled=false;}
  }
  function dataTable(d,print=false) {
    const table=el('table',undefined,print?'':'rq-table'),head=el('thead'),row=el('tr');
    if(print){const columns=el('colgroup');[6,19,27,11,10,9,9,9].forEach(w=>{const col=el('col');col.style.width=w+'%';columns.append(col);});table.append(columns);}
    const titles=print?['ลำดับ','รหัส / บาร์โค้ด','สินค้า / หมายเหตุ','Section','หน่วย','คงเหลือ Z','จำนวนเบิก','จัด / รับจริง']:['สินค้า / รหัส','Section','คงเหลือ Z','จำนวนเบิก','สาเหตุ'];
    if(print){const identity=el('tr'),cell=el('th','เลขที่ใบเบิก '+d.id+' · สาขา '+d.branch);cell.colSpan=8;cell.className='print-repeat-id';identity.append(cell);head.append(identity);}
    titles.forEach(t=>row.append(el('th',t)));head.append(row);table.append(head);const body=el('tbody');
    d.items.forEach((x,i)=>{
      const r=el('tr');
      if(print){r.append(el('td',i+1));const ids=el('td',x.productCode);ids.append(el('small',x.barcode));const product=el('td',x.name);product.append(el('small',x.reason+(x.note?' · '+x.note:'')));r.append(ids,product,el('td',x.section),el('td',x.unit),el('td',count(x.stock)),el('td',count(x.qty)),el('td',x.filledQty!==''&&x.filledQty!==undefined?count(x.filledQty):'______'));}
      else{const name=el('td',x.name);name.append(el('small',x.productCode+' · '+x.barcode));if(x.note)name.append(el('small',x.note));r.append(name,el('td',x.section),el('td',count(x.stock),'number'),el('td',count(x.qty)+' '+x.unit,'number'),el('td',x.reason));}body.append(r);
    });table.append(body);return table;
  }
  function showDocument(d) {
    state.document=d;$('rq-document-title').textContent=d.id;$('rq-document-error').textContent='';
    const root=$('rq-document-body');root.replaceChildren();const meta=el('p','สาขา '+d.branch+' '+d.branchName+' · ผู้เบิก '+d.actor+'\nวันที่ '+time(d.createdAt),'rq-doc-meta');meta.style.whiteSpace='pre-line';meta.append(badge(d.status));root.append(meta);
    root.append(el('p','สต๊อกต้นทางถึง '+time(d.dataAsOf)+' · ไฟล์อัปเดต '+time(d.sourceModifiedAt),'small muted'));
    const wrap=el('div',undefined,'rq-table-wrap');wrap.append(dataTable(d));root.append(wrap);
    if(d.closeNote)root.append(el('p','หมายเหตุปิดงาน: '+d.closeNote,'small muted'));
    const open=d.status==='รอจัดสินค้า';$('rq-finish-open').hidden=!open;$('rq-cancel-open').hidden=!open;
    if(!$('rq-document-dialog').open)$('rq-document-dialog').showModal();
  }
  function preparePrint(d) {
    const root=$('rq-print-sheet');root.replaceChildren(el('p','VILLA MARKET','print-brand'),el('h1','ใบเบิกสินค้าลงหน้าร้าน'));
    if(demo)root.append(el('p','ตัวอย่าง — ไม่ใช่ใบเบิกจริง','print-demo'));
    root.append(el('p','เลขที่ '+d.id+' · '+d.status,'print-status'));
    const meta=el('div',undefined,'print-meta');['สาขา '+d.branch+' '+d.branchName,'วันที่ '+time(d.createdAt),'ผู้เบิก '+d.actor,'จำนวน '+d.items.length+' รายการ'].forEach(t=>meta.append(el('div',t)));root.append(meta);
    root.append(el('p','ข้อมูลสต๊อกถึง '+time(d.dataAsOf)+' | ไฟล์อัปเดต '+time(d.sourceModifiedAt)+' | ยืนยัน '+time(d.verifiedAt),'print-note'));
    root.append(dataTable(d,true));
    const footer=el('div',undefined,'print-footer');footer.append(el('p','เลขที่ใบเบิก '+d.id,'print-note'));
    footer.append(el('p','ยอดคงเหลือ Z เป็นยอดทั้งร้าน ณ เวลาบันทึกใบเบิก ไม่ใช่จำนวนในคลังโดยเฉพาะ\nตรวจรหัสสินค้าและหน่วยทุกบรรทัด · การเบิกภายในร้านไม่หักยอดสต๊อกในระบบซ้ำ','print-note'));
    if(d.closeNote)footer.append(el('p','หมายเหตุปิดงาน: '+d.closeNote,'print-note'));
    const sign=el('div',undefined,'print-signatures');['ผู้เบิกสินค้า','ผู้จัดสินค้า / คลัง','ผู้รับและเติมหน้าร้าน'].forEach(t=>sign.append(el('p',t+'\nวันที่/เวลา ______________')));footer.append(sign);root.append(footer);
  }
  async function print() {
    if(!state.document?.id)return;
    preparePrint(state.document);await document.fonts.ready;
    const old=document.title;document.title=state.document.id;
    // Close the top-layer modal for printing; restore it after the print dialog.
    $('rq-document-dialog').close();
    const restore=()=>{document.title=old;if(!$('rq-document-dialog').open)$('rq-document-dialog').showModal();window.removeEventListener('afterprint',restore);};
    window.addEventListener('afterprint',restore);window.print();
  }
  function openFinish(cancel) {
    state.cancel=cancel;$('rq-finish-form').reset();$('rq-finish-error').textContent='';$('rq-finish-title').textContent=cancel?'ยกเลิกใบเบิก':'ยืนยันเติมครบ';
    $('rq-finish-help').textContent=cancel?'ระบุเหตุผล หากเติมบางส่วนแล้ว ให้บันทึกจำนวนที่เติมไว้ในหมายเหตุ ก่อนออกใบใหม่เฉพาะส่วนที่เหลือ':'ใช้เมื่อเติมครบทุกบรรทัดแล้ว หากยังไม่ครบให้คงใบเบิกไว้เป็นงานค้าง';
    $('rq-finish-checks').hidden=cancel;$('rq-confirm-filled').required=!cancel;$('rq-confirm-label').required=!cancel;$('rq-finish-note').required=cancel;$('rq-finish-dialog').showModal();
  }
  let cameraGeneration=0;
  async function stopCamera() {
    cameraGeneration++;const scanner=state.scanner;state.scanner=null;
    if(scanner){try{await scanner.stop();scanner.clear();}catch{}}$('rq-camera-box').hidden=true;$('rq-camera-btn').disabled=false;
  }
  async function startCamera() {
    if(state.scanner||state.pending)return;
    const generation=++cameraGeneration;$('rq-camera-btn').disabled=true;
    try {
      if(!window.isSecureContext)throw new Error('กล้องต้องเปิดผ่าน HTTPS ใช้เครื่องสแกนหรือพิมพ์รหัสแทนได้');
      if(!window.Html5Qrcode)await new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='vendor/html5-qrcode.min.js';script.onload=resolve;script.onerror=()=>reject(new Error('โหลดกล้องไม่ได้ กรุณาพิมพ์รหัสแทน'));document.head.append(script);});
      if(generation!==cameraGeneration)return;
      $('rq-camera-box').hidden=false;const scanner=new Html5Qrcode('rq-camera-reader');state.scanner=scanner;let handled=false;
      await scanner.start({facingMode:'environment'},{fps:10,qrbox:{width:240,height:120}},async code=>{if(handled||generation!==cameraGeneration)return;handled=true;$('rq-query').value=code;$('rq-lookup-type').value='barcode';await stopCamera();lookup();},()=>{});
      if(generation!==cameraGeneration){try{await scanner.stop();scanner.clear();}catch{}}
    } catch(error){$('rq-search-error').textContent=error.message||'เปิดกล้องไม่ได้ กรุณาอนุญาตกล้องหรือพิมพ์รหัส';await stopCamera();}
  }
  $('rq-login-form').addEventListener('submit',async e=>{e.preventDefault();const btn=e.currentTarget.querySelector('button');btn.disabled=true;$('rq-login-error').textContent='';state.auth={actor:$('rq-actor').value.trim(),branch:$('rq-branch').value.trim(),accessKey:$('rq-key').value};try{await enter();}catch(error){$('rq-login').hidden=false;$('rq-work').hidden=true;$('rq-login-error').textContent=error.message;}finally{btn.disabled=false;}});
  $('rq-search-form').addEventListener('submit',e=>{e.preventDefault();lookup();});
  $('rq-item-form').addEventListener('submit',e=>{e.preventDefault();if(!state.lookup||state.pending)return;const p=state.lookup,qty=Number($('rq-qty').value);if(state.cart.some(x=>x.productCode===p.productCode)){$('rq-search-error').textContent='สินค้านี้อยู่ในใบเบิกแล้ว นำรายการเดิมออกก่อนปรับจำนวน';return;}if(state.cart.length>=40){$('rq-search-error').textContent='ครบ 40 รายการแล้ว กรุณาบันทึกใบนี้ก่อน';return;}if(qty<=0||qty>p.stock){$('rq-search-error').textContent='จำนวนเบิกต้องมากกว่า 0 และไม่เกินยอดคงเหลือ';return;}state.cart.push({productCode:p.productCode,name:p.name,qty,unit:$('rq-unit').value.trim(),section:$('rq-section').value.trim(),reason:$('rq-reason').value,note:$('rq-note').value.trim(),unitConfirmed:$('rq-unit-confirm').checked});renderCart();$('rq-item-form').hidden=true;$('rq-search-empty').hidden=false;$('rq-query').value='';$('rq-query').focus();});
  $('rq-save').onclick=save;$('rq-tab-new').onclick=()=>selectView(false);$('rq-tab-history').onclick=()=>selectView(true);$('rq-history-refresh').onclick=loadHistory;$('rq-history-form').onsubmit=e=>{e.preventDefault();loadHistory();};
  $('rq-new-round').onclick=async()=>{try{await stopCamera();await startRound();state.lookup=null;$('rq-item-form').hidden=true;$('rq-search-error').textContent='ตรวจ Export รอบใหม่แล้ว ระบบจะตรวจสต๊อกทุกรายการอีกครั้งตอนบันทึก';}catch(error){$('rq-save-error').textContent=error.message;}};
  $('rq-document-close').onclick=()=>$('rq-document-dialog').close();$('rq-print').onclick=print;$('rq-finish-open').onclick=()=>openFinish(false);$('rq-cancel-open').onclick=()=>openFinish(true);$('rq-finish-close').onclick=()=>$('rq-finish-dialog').close();
  $('rq-finish-form').onsubmit=async e=>{e.preventDefault();const btn=e.currentTarget.querySelector('button');btn.disabled=true;$('rq-finish-error').textContent='';try{const data=await api('req.finish',{id:state.document.id,cancel:state.cancel,note:$('rq-finish-note').value.trim(),confirmedFilled:$('rq-confirm-filled').checked,confirmedLabel:$('rq-confirm-label').checked});$('rq-finish-dialog').close();showDocument(data.document);if(!$('rq-history-view').hidden)loadHistory();}catch(error){$('rq-finish-error').textContent=error.message;}finally{btn.disabled=false;}};
  $('rq-camera-btn').onclick=startCamera;$('rq-camera-stop').onclick=stopCamera;document.addEventListener('visibilitychange',()=>{if(document.hidden)stopCamera();});
  $('rq-logout').onclick=()=>{storage.remove('oos-session');location.href=location.pathname;};
  setInterval(()=>{if(!demo&&state.round&&Date.now()>=Date.parse(state.round.expiresAt)){$('rq-source-time').textContent='รอบข้อมูลหมดอายุ — อัปเดต Export ก่อนเบิกใบใหม่';}},30000);
  window.addEventListener('beforeunload',e=>{if(state.cart.length){e.preventDefault();e.returnValue='';}});
  $('rq-demo').hidden=!demo;$('rq-demo-hint').hidden=!demo;$('rq-branch').value=config.defaultBranch||'1000';
  if(demo){state.auth={actor:'พนักงานตัวอย่าง',branch:'1000',accessKey:'demo'};enter().catch(error=>{$('rq-login-error').textContent=error.message;});}
  else{const saved=storage.get('oos-session');if(saved?.actor&&saved?.branch&&saved?.accessKey){state.auth=saved;enter().catch(error=>{$('rq-login').hidden=false;$('rq-work').hidden=true;$('rq-login-error').textContent=error.message;});}}
})();
