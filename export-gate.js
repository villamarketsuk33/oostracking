/* Consume a round once on mode navigation; reload/reopen starts a fresh round. */
window.ExportGate = (()=>{
  let token='', snapshot=null, pending=null;
  const el=(tag,text,cls)=>{const x=document.createElement(tag);if(text!==undefined)x.textContent=text;if(cls)x.className=cls;return x;};
  async function unlock(api) {
    if(pending)return pending;
    token='';snapshot=null;
    pending=new Promise(async(resolve,reject)=>{
      let dialog;
      try {
        const start=await api('round.begin');
        dialog=el('dialog',undefined,'export-gate');
        dialog.append(el('span','ก่อนเริ่มรอบใช้งาน','eyebrow'),el('h2','อัปเดต Export ก่อนเบิกสินค้า'));
        dialog.append(el('p','1. อัปเดตข้อมูลในระบบสต๊อก แล้วส่งออกรายงานใหม่\n2. นำเข้าข้อมูลแทนที่แท็บ '+start.sourceSheet+' ในไฟล์ '+start.sourceName+'\n3. กลับมาตรวจยืนยันที่หน้านี้'));
        const link=el('a','เปิดไฟล์ Export บน Google Drive ↗','btn secondary full');link.href=start.sourceUrl;link.target='_blank';link.rel='noopener noreferrer';dialog.append(link);
        const prepare=el('a','เตรียมไฟล์ Export ภาษาไทย','small');prepare.href='prepare-export.html';prepare.target='_blank';prepare.rel='noopener noreferrer';dialog.append(prepare);
        const info=el('p','ต้องอัปเดตหลังเริ่มรอบนี้ และรอข้อมูลนิ่ง '+start.quietMinutes+' นาที · อายุสต๊อกไม่เกิน '+start.maxAgeMinutes+' นาที','small muted');dialog.append(info);
        const form=el('form'),label=el('label','ข้อมูลสต๊อกต้นทางอัปเดตถึงเวลาใด');
        const date=el('input');date.type='datetime-local';date.required=true;date.name='dataAsOf';label.append(date);
        form.append(label,el('p','กรอกเวลาข้อมูลในระบบสต๊อก ตามเวลาประเทศไทย ไม่ใช่เวลาอัปโหลดไฟล์','small muted'));
        const checkLabel=el('label',undefined,'check-row'),check=el('input');check.type='checkbox';check.required=true;check.name='confirmExportUpdated';
        checkLabel.append(check,el('span','ฉันนำเข้า Export ล่าสุดครบแล้ว ตรวจรหัสสาขา และรักษาเลข 0 นำหน้ารหัสสินค้า/บาร์โค้ด'));form.append(checkLabel);
        const error=el('p','','form-error');error.setAttribute('role','alert');
        const button=el('button','ตรวจไฟล์และเริ่มใช้งาน','btn primary full');button.type='submit';form.append(error,button);dialog.append(form);
        const leave=el('button','ออกจากระบบ','text-btn');leave.type='button';leave.onclick=()=>{try{sessionStorage.removeItem('oos-session');}catch{}location.reload();};dialog.append(leave);
        dialog.addEventListener('cancel',e=>e.preventDefault());document.body.append(dialog);dialog.showModal();
        form.addEventListener('submit',async e=>{
          e.preventDefault();button.disabled=true;date.disabled=true;check.disabled=true;error.textContent='';button.textContent='กำลังตรวจไฟล์…';
          try {
            const verified=await api('round.verify',{roundToken:start.roundToken,dataAsOf:date.value+(date.value.length===16?':00':'')+'+07:00',confirmExportUpdated:check.checked});
            token=verified.roundToken;snapshot=verified;dialog.close();dialog.remove();resolve(verified);
          } catch(err) {error.textContent=err.message;}
          finally{button.disabled=false;date.disabled=false;check.disabled=false;button.textContent='ตรวจไฟล์และเริ่มใช้งาน';}
        });
      } catch(error) {if(dialog)dialog.remove();reject(error);}
    });
    try{return await pending;}finally{pending=null;}
  }
  async function resume(api) {
    let saved;
    try{saved=JSON.parse(sessionStorage.getItem('villa-export-navigation')||'null');sessionStorage.removeItem('villa-export-navigation');}catch{return null;}
    if(!saved?.token)return null;
    try{const verified=await api('round.check',{roundToken:saved.token});token=verified.roundToken;snapshot=verified;return verified;}
    catch{token='';snapshot=null;return null;}
  }
  function navigate(url) {
    if(!['index.html','requisition.html'].includes(url))return;
    try{if(token&&snapshot)sessionStorage.setItem('villa-export-navigation',JSON.stringify({token}));}catch{}
    location.href=url;
  }
  document.querySelectorAll('a[href="index.html"],a[href="requisition.html"]').forEach(link=>link.addEventListener('click',e=>{
    if(e.ctrlKey||e.metaKey||e.shiftKey||e.altKey||e.button)return;
    if(window.OOS_CONFIG?.demo||new URLSearchParams(location.search).get('demo')==='1'){link.href=link.getAttribute('href')+'?demo=1';return;}
    e.preventDefault();navigate(link.getAttribute('href'));
  }));
  return {unlock,resume,navigate,get token(){return token;},get snapshot(){return snapshot;}};
})();
