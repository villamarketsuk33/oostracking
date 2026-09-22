/* Explicit preview only. No network calls, no Google Sheet writes. */
window.OOS_DEMO = (()=>{
  const at=new Date().toISOString(), before=new Date(Date.now()-86400000*2).toISOString();
  let paused=false;
  const records=[
    {id:'demo1',name:'ข้าวโอ๊ต ออร์แกนิก 500 กรัม',section:'12',stock:24,status:'รอเติม',labelLocation:'top stock · กล่องป้าย Section 12'},
    {id:'demo2',name:'นมอัลมอนด์ รสธรรมชาติ 1 ลิตร',section:'08',stock:12,status:'รอเติม',labelLocation:'top stock · ช่องกลาง'},
    {id:'demo3',name:'พาสต้า เส้นสปาเก็ตตี 500 กรัม',section:'14',stock:8,status:'รอเติม',labelLocation:'top stock · กล่องป้าย Section 14'},
    {id:'demo4',name:'กาแฟคั่วบด 250 กรัม',section:'09',stock:0,status:'รอสินค้า',labelLocation:'top stock · ช่องซ้าย'},
    {id:'demo5',name:'น้ำแร่ธรรมชาติ 750 มล.',section:'04',stock:0,status:'รอสินค้า',labelLocation:'top stock · ช่องกลาง'},
    {id:'demo6',name:'ซอสพาสต้า มะเขือเทศ 350 กรัม',section:'14',stock:'',status:'ตรวจสอบข้อมูล',labelLocation:'top stock',issue:'ยอดคงเหลือว่าง กรุณาตรวจข้อมูลต้นทาง'}
  ].map((r,i)=>({...r,branch:'1000',branchName:'สาขาตัวอย่าง',productKey:'DEMO-'+String(i+1).padStart(3,'0'),productCode:'DEMO-'+String(i+1).padStart(3,'0'),barcode:'DEMO-'+String(i+1).padStart(3,'0'),openedAt:before,checkedAt:at,openedBy:'พนักงานตัวอย่าง',sourceUpdatedAt:'ข้อมูลจำลอง',initialStock:0}));
  const sections={}, requests={};
  const health=()=>({paused,pending:false,lastSyncAt:at,error:null});
  return {async request(p){
    await new Promise(resolve=>setTimeout(resolve,180));
    if(p.action==='bootstrap')return {role:'admin',defaultBranch:'1000',health:health()};
    if(p.action==='list'){
      const types={'รอสินค้า':'waiting','รอเติม':'ready','ตรวจสอบข้อมูล':'review','ปิดแล้ว':'closed'},counts={waiting:0,ready:0,review:0,closed:0};
      records.forEach(r=>counts[types[r.status]]++);
      const filtered=records.filter(r=>(p.filter==='all'?r.status!=='ปิดแล้ว':types[r.status]===p.filter)&&(!p.section||r.section===p.section)&&(!p.query||[r.name,r.barcode,r.productKey,r.section].join(' ').toLowerCase().includes(p.query.toLowerCase())));
      return {records:filtered.map(r=>({...r})),counts,total:filtered.length,page:1,hasMore:false,health:health()};
    }
    if(p.action==='lookup'){
      const active=records.find(r=>r.barcode===p.barcode&&r.status!=='ปิดแล้ว');
      if(active)return {product:{...active},section:active.section,labelLocation:active.labelLocation,active:{...active}};
      const previous=records.find(r=>r.barcode===p.barcode);
      if(p.barcode!=='DEMO-NEW'&&!previous)throw new Error('ตัวอย่าง: ใช้ DEMO-NEW เพื่อเพิ่มสินค้า หรือ DEMO-001 เพื่อเติมสินค้า');
      const product=previous?{...previous,stock:0}:{branch:'1000',branchName:'สาขาตัวอย่าง',productKey:'DEMO-NEW',productCode:'DEMO-NEW',barcode:'DEMO-NEW',name:'สินค้าทดลองบันทึก OOS',stock:0,checkedAt:at,sourceUpdatedAt:'ข้อมูลจำลอง',issue:''};
      return {product,section:sections[p.barcode]?.section||previous?.section||'',labelLocation:sections[p.barcode]?.labelLocation||previous?.labelLocation||'',active:null};
    }
    if(p.action==='create'){
      if(requests[p.requestId])return {record:requests[p.requestId],replayed:true};
      const active=records.find(r=>r.barcode===p.barcode&&r.status!=='ปิดแล้ว');if(active)return {record:{...active},alreadyOpen:true};
      if(!p.confirmedZero||!p.section)throw new Error('กรอก Section และยืนยันสต๊อก 0 ก่อน');
      const r={id:'demo-'+Date.now(),branch:'1000',branchName:'สาขาตัวอย่าง',productKey:p.barcode,productCode:p.barcode,barcode:p.barcode,name:'สินค้าทดลองบันทึก OOS',stock:0,initialStock:0,status:'รอสินค้า',section:p.section,labelLocation:p.labelLocation,openedAt:new Date().toISOString(),openedBy:p.actor,checkedAt:at,sourceUpdatedAt:'ข้อมูลจำลอง'};
      records.unshift(r);sections[p.barcode]=r;requests[p.requestId]=r;return {record:{...r},saved:true};
    }
    if(p.action==='close'){
      if(!p.confirmedFilled||!p.confirmedLabel)throw new Error('ต้องยืนยันเติมสินค้าและคืนป้ายแล้วทั้งสองข้อ');
      const r=records.find(r=>r.id===p.id);if(!r)throw new Error('ไม่พบรายการ');r.status='ปิดแล้ว';r.closedBy=p.actor;r.closedAt=new Date().toISOString();r.labelReturned='คืนแล้ว';return {record:{...r},saved:true};
    }
    if(p.action==='section'){const r=records.find(r=>r.id===p.id);r.section=p.section;r.labelLocation=p.labelLocation;sections[r.barcode]=r;return {record:{...r}};}
    if(p.action==='pause'){paused=p.paused;return {paused};}
    throw new Error('ไม่พบคำสั่งตัวอย่าง');
  }};
})();
