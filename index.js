(function () {
  'use strict';
  if (window.lucide) lucide.createIcons();
  const api = window.RequisitionAPI;
  const byId = id => document.getElementById(id);
  const storageKey = 'villa-requisition-pending-v1';
  let inventoryMap = Object.create(null);
  let requisitionList = Object.create(null);
  let rawRows = [];
  let currentItem = null;
  let pending = null;
  let saved = false;
  let saving = false;
  let inventoryReady = false;
  const barcodeInput = byId('barcode-input');
  const qtyInput = byId('modal-qty-input');
  byId('req-date').value = api.today();
  byId('req-docno').value = 'สร้างเมื่อบันทึก';

  function controls() {
    const locked = Boolean(pending) || saved || saving;
    byId('req-date').disabled = locked;
    byId('file-upload').disabled = locked;
    byId('apply-columns-btn').disabled = locked;
    barcodeInput.disabled = locked || !inventoryReady;
    byId('check-section').classList.toggle('opacity-50', locked || !inventoryReady);
    byId('check-section').classList.toggle('pointer-events-none', locked || !inventoryReady);
    byId('save-req-btn').disabled = saving;
    byId('save-req-btn').classList.toggle('hidden', saved || !Object.keys(requisitionList).length);
    byId('print-req-btn').classList.toggle('hidden', !saved);
    byId('new-req-btn').classList.toggle('hidden', !saved);
  }

  function renderTable() {
    const tbody = byId('req-table-body');
    tbody.replaceChildren();
    const items = Object.values(requisitionList);
    if (!items.length) {
      tbody.innerHTML = '<tr><td colspan="5" class="px-6 py-8 text-center text-gray-400">ยังไม่มีรายการ</td></tr>';
    }
    for (const item of items) {
      const row = document.createElement('tr');
      row.innerHTML = `<td class="px-6 py-4 font-mono">${api.escapeHTML(item.barcode)}<br><span class="text-xs text-gray-400">${api.escapeHTML(item.prcode)}</span></td>
        <td class="px-6 py-4">${api.escapeHTML(item.name)}</td>
        <td class="px-6 py-4 text-right">${api.escapeHTML(item.balance)}</td>
        <td class="px-6 py-4 text-right font-bold text-indigo-600 text-lg">${api.escapeHTML(item.requestQty)}</td>`;
      const cell = document.createElement('td');
      cell.className = 'px-4 py-4 no-print';
      if (!saved && !pending) {
        const edit = document.createElement('button');
        edit.textContent = 'จำนวน';
        edit.className = 'text-blue-700 mr-3';
        edit.addEventListener('click', () => openModal(item));
        const remove = document.createElement('button');
        remove.textContent = 'ลบ';
        remove.className = 'text-red-700';
        remove.addEventListener('click', () => { delete requisitionList[item.barcode]; renderTable(); });
        cell.append(edit, remove);
      }
      row.append(cell);
      tbody.append(row);
    }
    controls();
  }

  byId('file-upload').addEventListener('change', async event => {
    const file = event.target.files[0];
    if (!file) return;
    inventoryReady = false;
    inventoryMap = Object.create(null);
    rawRows = [];
    byId('column-section').classList.add('hidden');
    byId('inventory-status').textContent = 'กำลังอ่านไฟล์...';
    controls();
    try {
      if (!window.XLSX) throw new Error('โหลดเครื่องมืออ่าน Excel ไม่สำเร็จ กรุณาตรวจอินเทอร์เน็ตแล้วรีเฟรช');
      const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
      const data = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { header: 1, raw: false, defval: '' });
      if (data.length < 2) throw new Error('ไฟล์ต้องมีหัวตารางแถวแรกและรายการสินค้า');
      const headers = data[0].map(value => String(value).trim());
      rawRows = data.slice(1).filter(row => row.some(value => String(value).trim() !== ''));
      const guessed = Inventory.guessColumns(headers);
      for (const key of ['barcode', 'prcode', 'name', 'balance']) {
        const select = byId('col-' + key);
        select.replaceChildren(new Option(key === 'prcode' ? 'ไม่มี / ไม่ใช้' : 'เลือกคอลัมน์', '-1'));
        headers.forEach((header, index) => select.add(new Option((index + 1) + '. ' + (header || '(ไม่มีชื่อคอลัมน์)'), String(index))));
        select.value = String(guessed[key]);
        select.onchange = () => { inventoryReady = false; controls(); };
      }
      byId('column-section').classList.remove('hidden');
      byId('inventory-status').textContent = 'อ่านไฟล์ ' + file.name + ' แล้ว โปรดตรวจและยืนยันคอลัมน์';
    } catch (error) {
      byId('inventory-status').textContent = error.message;
      alert(error.message);
    }
  });

  byId('apply-columns-btn').addEventListener('click', () => {
    try {
      const columns = Object.fromEntries(['barcode', 'prcode', 'name', 'balance'].map(key => [key, Number(byId('col-' + key).value)]));
      inventoryMap = Inventory.buildMap(rawRows, columns);
      inventoryReady = true;
      // ปรับยอดอ้างอิงของรายการที่อยู่ในใบเบิกด้วยเมื่อโหลดไฟล์ใหม่
      for (const item of Object.values(requisitionList)) {
        if (!inventoryMap[item.barcode]) throw new Error('รายการในใบเบิกไม่อยู่ในไฟล์ใหม่: ' + item.barcode);
      }
      for (const item of Object.values(requisitionList)) Object.assign(item, inventoryMap[item.barcode]);
      byId('inventory-status').textContent = 'พร้อมใช้ ' + Object.keys(inventoryMap).length + ' รายการ · ยอดคงเหลืออ้างอิงไฟล์ที่อัปโหลด';
      renderTable();
      barcodeInput.focus();
    } catch (error) {
      inventoryReady = false;
      controls();
      alert(error.message);
    }
  });

  barcodeInput.addEventListener('keydown', event => {
    if (event.key !== 'Enter' || !inventoryReady || pending || saved) return;
    event.preventDefault();
    const barcode = barcodeInput.value.trim();
    barcodeInput.value = '';
    if (!barcode) return;
    // ค้นหาตรงทุกหลัก ไม่ตัดบาร์โค้ด เพราะอาจได้คนละสินค้า
    const item = inventoryMap[barcode];
    if (item) openModal(item);
    else { alert('ไม่พบบาร์โค้ดนี้ในไฟล์ที่อัปโหลด'); barcodeInput.focus(); }
  });
  window.typeNum = number => { if (qtyInput.value.length < 9) qtyInput.value += number; };
  window.clearNum = () => { qtyInput.value = ''; };
  window.delNum = () => { qtyInput.value = qtyInput.value.slice(0, -1); };

  function openModal(item) {
    if (saved || pending || saving) return;
    currentItem = item;
    byId('modal-item-name').textContent = item.name;
    byId('modal-item-barcode').textContent = item.barcode;
    byId('modal-item-prcode').textContent = item.prcode;
    byId('modal-item-balance').textContent = item.balance;
    qtyInput.value = requisitionList[item.barcode]?.requestQty || '';
    byId('scan-modal').classList.remove('hidden');
  }
  function closeModal() {
    byId('scan-modal').classList.add('hidden');
    currentItem = null;
    barcodeInput.focus();
  }
  byId('modal-cancel-btn').addEventListener('click', closeModal);
  byId('modal-confirm-btn').addEventListener('click', () => {
    const qty = Number(qtyInput.value);
    if (!currentItem || !Number.isSafeInteger(qty) || qty <= 0) { alert('กรุณาใส่จำนวนเต็มมากกว่า 0'); return; }
    requisitionList[currentItem.barcode] = { ...currentItem, requestQty: qty };
    renderTable();
    closeModal();
  });

  byId('save-req-btn').addEventListener('click', async () => {
    if (saving || saved || !Object.keys(requisitionList).length) return;
    if (!byId('req-date').value) { alert('กรุณาระบุวันที่เบิก'); return; }
    if (!pending) {
      pending = {
        action: 'saveRequisition', requestId: api.createRequestId(),
        date: byId('req-date').value, items: Object.values(requisitionList).map(item => ({ ...item }))
      };
      // เก็บคำขอเดิมสำหรับ retry แม้รีเฟรชหน้า; ถ้าเก็บไม่ได้จะยังไม่ส่งคำขอ
      try { sessionStorage.setItem(storageKey, JSON.stringify(pending)); }
      catch (_) { pending = null; alert('เบราว์เซอร์ไม่อนุญาตเก็บคำขอ กรุณาอนุญาต storage ก่อนบันทึก'); return; }
    }
    saving = true;
    renderTable();
    byId('loading-overlay').classList.remove('hidden');
    byId('loading-overlay').classList.add('flex');
    try {
      const result = await api.post(pending);
      if (!result || result.status !== 'success' || !result.docNo) throw new Error('หลังบ้านยังไม่ยืนยันการบันทึก กรุณากดบันทึกซ้ำจากหน้าเดิม');
      byId('req-docno').value = result.docNo;
      byId('list-title').textContent = 'ใบเบิกที่บันทึกแล้ว';
      byId('save-status').textContent = 'บันทึกสำเร็จ เลขที่ ' + result.docNo + (result.duplicate ? ' (ยืนยันคำขอเดิม)' : '');
      saved = true;
      pending = null;
      sessionStorage.removeItem(storageKey);
    } catch (error) {
      if (error.definitelyFailed) {
        pending = null;
        sessionStorage.removeItem(storageKey);
      }
      byId('save-status').textContent = error.message + (pending ? ' · รายการนี้ล็อกไว้จนกว่าจะยืนยันผล ให้กดบันทึกซ้ำ' : '');
      alert(byId('save-status').textContent);
    } finally {
      saving = false;
      byId('loading-overlay').classList.add('hidden');
      byId('loading-overlay').classList.remove('flex');
      renderTable();
    }
  });
  byId('print-req-btn').addEventListener('click', () => window.print());
  byId('new-req-btn').addEventListener('click', () => {
    if (!saved) return;
    saved = false;
    requisitionList = Object.create(null);
    byId('req-date').value = api.today();
    byId('req-docno').value = 'สร้างเมื่อบันทึก';
    byId('list-title').textContent = 'รายการเบิก (เตรียมบันทึก)';
    byId('save-status').textContent = '';
    renderTable();
    barcodeInput.focus();
  });

  try {
    const stored = sessionStorage.getItem(storageKey);
    if (stored) {
      const restored = JSON.parse(stored);
      if (!restored.requestId || !restored.date || !Array.isArray(restored.items)) throw new Error('คำขอเดิมไม่สมบูรณ์');
      pending = restored;
      byId('req-date').value = pending.date;
      for (const item of pending.items) requisitionList[item.barcode] = item;
      byId('save-status').textContent = 'พบคำขอที่ยังไม่ยืนยันผล กรุณากดบันทึกอีกครั้งเพื่อยืนยันเลขใบเบิกเดิม';
    }
  } catch (_) {
    byId('save-status').textContent = 'ไม่สามารถอ่านคำขอเดิมได้ หากเคยส่งใบเบิกให้ตรวจในหน้าคลังก่อนสร้างใหม่';
  }
  renderTable();
})();
