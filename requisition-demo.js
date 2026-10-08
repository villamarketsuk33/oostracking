/* Explicitly local preview. Never calls the production API. */
window.RequisitionDemo=(()=>{
  const now=new Date().toISOString(), snapshot={sourceModifiedAt:now,dataAsOf:now,verifiedAt:now,expiresAt:new Date(Date.now()+7200000).toISOString()};
  const products=[
    {productCode:'0030033',barcode:'8001200000001',name:'AGNESI RIGATONI #49 500 G.',stock:12,section:'A5',dailySales:4},
    {productCode:'0181279',barcode:'028400000002',name:"CHEETOS FLAMIN’ HOT CRUNCHY CHEESE SNACKS 8 OZ",stock:80,section:'16',dailySales:15},
    {productCode:'0258362',barcode:'8712100000003',name:"HELLMANN’S MAYO REAL SQUEEZY 250 ML.",stock:57,section:'48',dailySales:3},
    {productCode:'0264828',barcode:'8850000000004',name:'เส้นอูด้งสด ตราคิน 200 กรัม',stock:0,section:'98',dailySales:7}
  ].map(x=>({...x,branch:'1000',branchName:'SUKHUMVIT 33 · ตัวอย่าง',orderCode:x.productCode,unitWarning:false}));
  const docs=[];let sequence=1;
  return {snapshot,async request(p){
    await new Promise(r=>setTimeout(r,100));
    if(p.action==='bootstrap')return {role:'staff'};
    if(p.action==='req.search')return {products:products.filter(x=>x.name.toLowerCase().includes(p.query.toLowerCase())),hasMore:false};
    if(p.action==='req.lookup'){const product=products.find(x=>p.lookupType==='sku'?x.productCode===p.query:x.barcode===p.query);if(!product)throw new Error('ตัวอย่าง: เลือกค้นจากรหัสสินค้า E แล้วกรอก 0030033, 0181279 หรือ 0258362');const open=docs.filter(d=>d.status==='รอจัดสินค้า'&&d.items.some(i=>i.productCode===product.productCode));return {product:{...product},openDocuments:open.map(d=>d.id),openQty:0};}
    if(p.action==='req.create'){const old=docs.find(d=>d.requestId===p.requestId);if(old)return {document:old,replayed:true};const id='DEMO-RQ-'+String(sequence++).padStart(4,'0');const items=p.items.map((x,i)=>{const product=products.find(v=>v.productCode===x.productCode);return {...product,...x,line:i+1,filledQty:''};});const d={id,status:'รอจัดสินค้า',createdAt:new Date().toISOString(),actor:p.actor,branch:p.branch,branchName:'SUKHUMVIT 33 · ตัวอย่าง',requestId:p.requestId,...snapshot,items};docs.unshift(d);return {document:d,saved:true};}
    if(p.action==='req.list')return {documents:docs.filter(d=>!p.query||JSON.stringify(d).toLowerCase().includes(p.query.toLowerCase())),total:docs.length};
    if(p.action==='req.get')return {document:docs.find(d=>d.id===p.id)};
    if(p.action==='req.finish'){const d=docs.find(d=>d.id===p.id);d.status=p.cancel?'ยกเลิก':'เติมครบแล้ว';d.closeNote=p.note;d.updatedBy=p.actor;d.items.forEach(x=>{x.filledQty=p.cancel?'':x.qty;});return {document:d};}
    throw new Error('ไม่มีคำสั่งในโหมดตัวอย่าง');
  }};
})();
