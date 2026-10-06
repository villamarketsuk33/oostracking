(function () {
  'use strict';
  if (window.lucide) lucide.createIcons();
  const api = window.RequisitionAPI;
  const byId = id => document.getElementById(id);
  byId('filter-date').value = api.today();
  let loading = false;
  function message(text, failed) {
    byId('data-body').replaceChildren();
    const cell = document.createElement('td');
    cell.colSpan = 4;
    cell.className = 'px-4 py-8 text-center ' + (failed ? 'text-red-600' : 'text-gray-500');
    cell.textContent = text;
    const row = document.createElement('tr');
    row.append(cell);
    byId('data-body').append(row);
  }
  async function fetchData() {
    if (loading) return;
    const date = byId('filter-date').value;
    if (!date) { message('กรุณาระบุวันที่', true); return; }
    loading = true;
    byId('refresh-btn').disabled = true;
    byId('filter-date').disabled = true;
    byId('print-btn').disabled = true;
    byId('loading').classList.remove('hidden');
    byId('filter-summary').textContent = '';
    message('กำลังดึงข้อมูล...');
    try {
      const data = await api.get({ action: 'listRequisitions', date });
      if (!Array.isArray(data)) throw new Error('รูปแบบข้อมูลใบเบิกไม่ถูกต้อง');
      const filtered = data.filter(row => row.Date === date).sort((a, b) => a.DocNo.localeCompare(b.DocNo));
      if (!filtered.length) message('ไม่พบรายการเบิกในวันที่ระบุ');
      else {
        byId('data-body').replaceChildren();
        let currentDoc = '';
        for (const item of filtered) {
          const row = document.createElement('tr');
          const newDoc = currentDoc !== item.DocNo;
          currentDoc = item.DocNo;
          row.innerHTML = `<td class="px-4 py-3 font-mono text-sm ${newDoc ? 'font-bold text-indigo-700' : 'text-transparent'}">${api.escapeHTML(item.DocNo)}</td>
            <td class="px-4 py-3 text-sm"><span class="font-bold">${api.escapeHTML(item.Prcode)}</span><br><span class="text-xs text-gray-500">${api.escapeHTML(item.Barcode)}</span></td>
            <td class="px-4 py-3 text-sm">${api.escapeHTML(item.Name)}</td>
            <td class="px-4 py-3 text-right font-bold text-lg">${api.escapeHTML(item.RequestQty)}</td>`;
          byId('data-body').append(row);
        }
        byId('print-btn').disabled = false;
      }
      byId('filter-summary').textContent = 'วันที่ ' + date + ' · ' + new Set(filtered.map(item => item.DocNo)).size + ' ใบเบิก · ' + filtered.length + ' รายการ';
    } catch (error) {
      message(error.message, true);
    } finally {
      loading = false;
      byId('refresh-btn').disabled = false;
      byId('filter-date').disabled = false;
      byId('loading').classList.add('hidden');
    }
  }
  byId('refresh-btn').addEventListener('click', fetchData);
  byId('filter-date').addEventListener('change', () => {
    byId('print-btn').disabled = true;
    byId('filter-summary').textContent = '';
    message('เปลี่ยนวันที่แล้ว กรุณากดดึงข้อมูล');
  });
  byId('print-btn').addEventListener('click', () => window.print());
})();
