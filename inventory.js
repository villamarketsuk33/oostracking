(function () {
  'use strict';
  const normalize = value => String(value == null ? '' : value).trim().toLowerCase().replace(/[\s_\-().]/g, '');
  const aliases = {
    barcode: ['barcode', 'bar code', 'ean', 'ean13', 'บาร์โค้ด'],
    prcode: ['prcode', 'productcode', 'itemcode', 'รหัสสินค้า'],
    name: ['name', 'productname', 'itemname', 'description', 'ชื่อสินค้า'],
    balance: ['onhand', 'stockonhand', 'stockqty', 'balance', 'คงเหลือ', 'ยอดคงเหลือ', 'qty', 'quantity']
  };
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
      throw new Error('กรุณาเลือกคอลัมน์บาร์โค้ด ชื่อสินค้า และยอดคงเหลือให้ครบ');
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
  window.Inventory = Object.freeze({ guessColumns, buildMap });
})();
