(function () {
  'use strict';
  const normalize = value => String(value == null ? '' : value).trim().toLowerCase().replace(/[\s_\-().]/g, '');
  const aliases = {
    barcode: ['barcode', 'bar code', 'ean', 'ean13', 'บาร์โค้ต', 'บาร์โค้ด', 'บาร์โค๊ด', 'บาร์โคด', 'บาร์โค้ดสินค้า'],
    prcode: ['prcode', 'productcode', 'itemcode', 'รหัสสินค้า'],
    name: ['name', 'productname', 'itemname', 'description', 'ชื่อสินค้า'],
    balance: ['ยอดคงเหลือปัจจุบัน', 'onhand', 'stockonhand', 'stockqty', 'balance', 'คงเหลือ', 'ยอดคงเหลือ', 'จำนวนคงเหลือ', 'qty', 'quantity']
  };

  function decodeCSV(buffer) {
    const bytes = new Uint8Array(buffer);
    let encoding;
    let text;
    // Excel อาจส่งออก UTF-16 พร้อม BOM; ตรวจ BOM ก่อน UTF-8
    if (bytes[0] === 0xff && bytes[1] === 0xfe) {
      encoding = 'UTF-16LE';
      text = new TextDecoder('utf-16le', { fatal: true }).decode(bytes);
    } else if (bytes[0] === 0xfe && bytes[1] === 0xff) {
      encoding = 'UTF-16BE';
      text = new TextDecoder('utf-16be', { fatal: true }).decode(bytes);
    } else {
      try {
        // fatal ป้องกันการแทนภาษาไทยด้วยอักขระเสียหายก่อนเลือก encoding ที่ถูกต้อง
        text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
        encoding = 'UTF-8';
      } catch (_) {
        text = new TextDecoder('windows-874', { fatal: true }).decode(bytes);
        encoding = 'Windows-874 / TIS-620';
      }
    }
    return { text: text.replace(/^\uFEFF/, ''), encoding };
  }

  async function readFile(file) {
    const buffer = await file.arrayBuffer();
    let workbook;
    let encoding = '';
    if (/\.csv$/i.test(file.name)) {
      const decoded = decodeCSV(buffer);
      encoding = decoded.encoding;
      // ถอด byte เป็น Unicode ก่อนส่งให้ SheetJS; raw:true รักษาศูนย์นำหน้ารหัส/บาร์โค้ด
      workbook = window.XLSX.read(decoded.text, { type: 'string', raw: true });
    } else {
      workbook = window.XLSX.read(buffer, { type: 'array' });
    }
    const data = window.XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], {
      header: 1, raw: false, defval: ''
    });
    return { data, encoding };
  }
  function guessColumns(headers) {
    const normalized = headers.map(normalize);
    return Object.fromEntries(Object.entries(aliases).map(([key, names]) => {
      for (const name of names) {
        const index = normalized.indexOf(normalize(name));
        if (index !== -1) return [key, index];
      }
      return [key, -1];
    }));
  }
  function buildMap(rows, columns) {
    if ([columns.barcode, columns.name, columns.balance].some(index => index < 0)) {
      throw new Error('ไม่พบคอลัมน์บาร์โค้ด ชื่อสินค้า หรือยอดคงเหลือในไฟล์ กรุณาอัปโหลดไฟล์ Export ตามรูปแบบเดิม');
    }
    const required = [columns.barcode, columns.name, columns.balance];
    if (columns.prcode >= 0) required.push(columns.prcode);
    if (new Set(required).size !== required.length) throw new Error('คอลัมน์แต่ละประเภทต้องไม่ซ้ำกัน');
    const map = Object.create(null);
    for (const row of rows) {
      const barcode = String(row[columns.barcode] == null ? '' : row[columns.barcode]).trim().replace(/^'/, '');
      if (!barcode) continue;
      const name = String(row[columns.name] == null ? '' : row[columns.name]).trim();
      const text = String(row[columns.balance] == null ? '' : row[columns.balance]).trim().replace(/,/g, '');
      const balance = text === '' ? NaN : Number(text);
      if (!name || !Number.isFinite(balance)) throw new Error('ข้อมูลไม่ครบหรือยอดคงเหลือไม่ใช่ตัวเลข: บาร์โค้ด ' + barcode);
      const prcode = columns.prcode < 0 ? '' : String(row[columns.prcode] == null ? '' : row[columns.prcode]).trim().replace(/^'/, '');
      const item = { barcode, prcode, name, balance };
      if (map[barcode] && JSON.stringify(map[barcode]) !== JSON.stringify(item)) {
        throw new Error('พบข้อมูลบาร์โค้ดซ้ำต่างกัน: ' + barcode + ' กรุณาตรวจไฟล์ก่อนใช้');
      }
      map[barcode] = item;
    }
    if (!Object.keys(map).length) throw new Error('ไฟล์นี้ไม่มีรายการสินค้าที่ใช้ได้');
    return map;
  }
  window.Inventory = Object.freeze({ guessColumns, buildMap, decodeCSV, readFile });
})();
