(function () {
  'use strict';

  function endpoint() {
    const url = new URL(window.APP_CONFIG.apiUrl);
    if (url.origin !== 'https://script.google.com' || !/^\/macros\/s\/[^/]+\/exec$/.test(url.pathname)) {
      throw new Error('กรุณาตั้งค่า URL Web app ที่ลงท้าย /exec ใน config.js');
    }
    return url;
  }

  async function request(method, parameters) {
    const url = endpoint();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), window.APP_CONFIG.timeoutMs);
    const options = {
      method, mode: 'cors', credentials: 'omit', redirect: 'follow', signal: controller.signal
    };
    if (method === 'GET') {
      Object.entries(parameters || {}).forEach(([key, value]) => url.searchParams.set(key, value));
      url.searchParams.set('_ts', Date.now());
    } else {
      // JSON อยู่ใน body แต่ใช้ MIME แบบ simple request เพื่อไม่ส่ง OPTIONS preflight
      options.headers = { 'Content-Type': 'text/plain;charset=UTF-8' };
      options.body = JSON.stringify(parameters);
    }
    try {
      const response = await fetch(url.toString(), options);
      if (!response.ok) throw new Error('เซิร์ฟเวอร์ตอบ HTTP ' + response.status);
      const raw = await response.text();
      let result;
      try { result = JSON.parse(raw); }
      catch (_) { throw new Error('หลังบ้านไม่ได้ส่ง JSON: ตรวจว่า Deploy เป็น Web app และอนุญาต Anyone'); }
      if (result && result.status === 'error') {
        const error = new Error(result.message || 'หลังบ้านแจ้งข้อผิดพลาด');
        error.definitelyFailed = !result.mayHaveSaved;
        throw error;
      }
      return result;
    } catch (error) {
      if (error.name === 'AbortError') {
        throw new Error('รอหลังบ้านเกิน 60 วินาที หากเป็นการบันทึก ให้กดบันทึกซ้ำจากหน้าเดิม ระบบจะตรวจคำขอซ้ำ');
      }
      if (error instanceof TypeError) {
        throw new Error('เชื่อมต่อหลังบ้านไม่ได้: ตรวจอินเทอร์เน็ต URL /exec และสิทธิ์ Anyone ของ Web app');
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  window.RequisitionAPI = Object.freeze({
    get: parameters => request('GET', parameters),
    post: payload => request('POST', payload),
    today: () => {
      const parts = new Intl.DateTimeFormat('en', {
        timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit'
      }).formatToParts(new Date());
      const part = key => parts.find(value => value.type === key).value;
      return part('year') + '-' + part('month') + '-' + part('day');
    },
    createRequestId: () => crypto.randomUUID(),
    escapeHTML: value => String(value == null ? '' : value).replace(/[&<>"']/g, character => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[character])
  });
})();
