(function () {
  'use strict';

  window.RequisitionAPI = Object.freeze({
    today: () => {
      const parts = new Intl.DateTimeFormat('en', {
        timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit'
      }).formatToParts(new Date());
      const part = key => parts.find(value => value.type === key).value;
      return part('year') + '-' + part('month') + '-' + part('day');
    },
    escapeHTML: value => String(value == null ? '' : value).replace(/[&<>"']/g, character => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[character])
  });
})();
