'use strict';

const HolidayService = (() => {
  const CACHE = 'usagi-holidays-v1';
  const read = name => { try { return JSON.parse(localStorage.getItem(name)); } catch { return null; } };
  const write = (name, value) => localStorage.setItem(name, JSON.stringify(value));
  let cache = read(CACHE) || {};
  if (typeof cache !== 'object' || Array.isArray(cache)) cache = {};
  const monthKey = (year, month) => `${year}-${String(month).padStart(2, '0')}`;
  let configured = false;
  function parse(text, year, month) {
    let response;
    try { response = JSON.parse(text).response; } catch {
      const xml = new DOMParser().parseFromString(text, 'application/xml');
      if (xml.querySelector('parsererror') || !xml.querySelector('response > header')) throw new Error('인증키와 특일 정보 활용신청 상태를 확인해 주세요.');
      const value = (node, tag) => node.querySelector(tag)?.textContent || '';
      response = { header: { resultCode: value(xml, 'resultCode') }, body: { items: { item: [...xml.querySelectorAll('item')].map(item => ({ locdate: value(item, 'locdate'), dateName: value(item, 'dateName'), isHoliday: value(item, 'isHoliday') })) }, totalCount: value(xml, 'totalCount') } };
    }
    if (String(response?.header?.resultCode) !== '00' || !response.body || response.body.totalCount === undefined) throw new Error('인증키와 특일 정보 활용신청 상태를 확인해 주세요.');
    const count = Number(response.body.totalCount);
    const raw = response.body.items?.item;
    if (!Number.isInteger(count) || count < 0 || (count > 0 && !raw)) throw new Error('공휴일 응답을 확인하지 못했어요. 다시 시도해 주세요.');
    const items = raw ? (Array.isArray(raw) ? raw : [raw]) : [];
    if (count > items.length) throw new Error('공휴일 정보를 모두 받지 못했어요. 다시 시도해 주세요.');
    const prefix = monthKey(year, month).replace('-', '');
    return items.filter(item => item.isHoliday === 'Y' && /^\d{8}$/.test(String(item.locdate)) && String(item.locdate).startsWith(prefix) && typeof item.dateName === 'string').map(item => {
      const date = String(item.locdate);
      return { date: `${date.slice(0,4)}-${date.slice(4,6)}-${date.slice(6)}`, name: item.dateName };
    });
  }
  async function request(year, month) {
    if (!window.desktop?.fetchHolidays) throw new Error('공휴일 자동 연동은 데스크톱 앱에서 사용할 수 있어요.');
    let text;
    {
      const result = await window.desktop.fetchHolidays({ year, month });
      if (result.error) throw new Error(result.error);
      text = result.text;
    }
    return parse(text, year, month);
  }
  function store(year, month, items) {
    cache[monthKey(year, month)] = { items, updated: Date.now() };
    try { write(CACHE, cache); } catch { /* Keep this session's data if storage is full. */ }
  }
  return { request, store,
    isConfigured: () => configured,
    initialize: async () => {
      try { configured = Boolean(await window.desktop?.holidaysConfigured?.()); } catch { configured = false; }
      try { localStorage.removeItem('usagi-holiday-key'); } catch { /* Old input-based configuration is no longer used. */ }
    },
    entry: (year, month) => cache[monthKey(year, month)],
    names: date => [...new Set((cache[date.slice(0,7)]?.items || []).filter(item => item.date === date).map(item => item.name === '기독탄신일' ? '성탄절' : item.name))].join(' · ')
  };
})();
