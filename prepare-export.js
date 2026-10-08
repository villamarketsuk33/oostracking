(() => {
  'use strict';
  const input=document.getElementById('export-file'),message=document.getElementById('export-message'),download=document.getElementById('export-download');
  let url='';
  input.addEventListener('change',async()=>{
    if(url){URL.revokeObjectURL(url);url='';}download.hidden=true;
    const file=input.files[0];if(!file)return;
    input.disabled=true;message.textContent='กำลังเตรียมไฟล์…';
    try {
      if(!/\.csv$/i.test(file.name))throw new Error('กรุณาเลือกไฟล์ CSV');
      const decoded=Inventory.decodeCSV(await file.arrayBuffer());
      url=URL.createObjectURL(new Blob(['\uFEFF',decoded.text],{type:'text/csv;charset=utf-8'}));
      download.href=url;download.download=file.name.replace(/\.csv$/i,'')+'-UTF8.csv';download.hidden=false;
      message.textContent='เตรียมแล้ว ดาวน์โหลดไฟล์นี้ไปนำเข้า ProductList / Export โดยรักษารหัสสินค้าและบาร์โค้ดเป็นข้อความ';
    } catch(error){message.textContent=error.message;}
    finally{input.disabled=false;}
  });
})();
