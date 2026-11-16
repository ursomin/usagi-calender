'use strict';

// 모든 일정은 각 사용자 컴퓨터의 로컬 저장소에 저장됩니다. 서버로 전송하지 않습니다.
const STORAGE_KEY = 'bunny-calendar-v1';
const CATEGORIES = {
  church: { name: '교회', icon: '✝', css: 'church' },
  work: { name: '회사', icon: '▣', css: 'work' },
  personal: { name: '개인일정', icon: '♡', css: 'personal' }
};
const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];
const demo = new URLSearchParams(location.search).has('demo');
const $ = id => document.getElementById(id);
const pad2 = n => String(n).padStart(2, '0');
const toISO = d => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const fromISO = str => {
  const parts = String(str || '').split('-').map(Number);
  if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) return null;
  const d = new Date(parts[0], parts[1] - 1, parts[2]);
  return toISO(d) === str ? d : null;
};
const dateUTC = d => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
const isValidTime = time => /^([01]\d|2[0-3]):[0-5]\d$/.test(String(time));
const el = (tag, cls = '', text = '') => {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== '') node.textContent = text;
  return node;
};
const icon = name => {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.classList.add('icon');
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttribute('href', `#i-${name}`);
  svg.append(use);
  return svg;
};
function sampleEvents() {
  return [
    {id:'sample-1',title:'문테기',date:'2026-11-03',category:'personal',allDay:true,start:'',end:'',repeat:{type:'weekly',interval:1,until:''}},
    {id:'sample-2',title:'융합교육의 이론과 실제\n컴퓨터 네트워크',date:'2026-11-06',category:'church',allDay:false,start:'10:00',end:'12:00',repeat:{type:'weekly',interval:1,until:''}},
    {id:'sample-3',title:'SQLD 시험\nWHS 특강',date:'2026-11-14',category:'work',allDay:true,start:'',end:'',repeat:{type:'none',interval:1,until:''}},
    {id:'sample-4',title:'친구들과 저녁 약속',date:'2026-11-28',category:'personal',allDay:false,start:'18:00',end:'20:00',repeat:{type:'none',interval:1,until:''}},
    {id:'sample-5',title:'월간 보고서 제출',date:'2026-11-30',category:'work',allDay:true,start:'',end:'',repeat:{type:'monthly',interval:1,until:''}}
  ];
}
function readSaved() {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    return {
      events: Array.isArray(value.events) ? value.events.filter(validEvent) : [],
      memo: typeof value.memo === 'string' ? value.memo : '',
      filters: value.filters && typeof value.filters === 'object' ? value.filters : {}
    };
  } catch { return { events: [], memo: '', filters: {} }; }
}
const saved = demo ? { events: sampleEvents(), memo:'우사기 캘린더 만들기 ✨\n자격증 공부 일정 정리하기\n담당 교수님 상담', filters:{} } : readSaved();
const today = demo ? new Date(2026,10,13) : new Date();
const state = {
  year: today.getFullYear(), month: today.getMonth(), selected: toISO(today),
  events: saved.events, memo:saved.memo,
  filters: { church:saved.filters.church !== false, work:saved.filters.work !== false, personal:saved.filters.personal !== false }
};
let memoTimer;
let toastTimer;
const holidayAttempts = new Set();
const holidayErrors = new Map();
function updateHolidayStatus() {
  const id = `${state.year}-${state.month + 1}`;
  const entry = HolidayService.entry(state.year, state.month + 1);
  $('holiday-status').textContent = holidayErrors.has(id)
    ? (entry ? '저장된 공휴일 표시 중 · 업데이트 실패' : '공휴일 조회 실패 · 앱을 다시 열어 주세요.')
    : '';
  $('holiday-status').title = holidayErrors.get(id) || '';
}
async function loadHolidays() {
  const year = state.year, month = state.month + 1, id = `${year}-${month}`;
  const entry = HolidayService.entry(year, month);
  updateHolidayStatus();
  if (!HolidayService.isConfigured() || holidayAttempts.has(id) || (entry && Date.now() - entry.updated < 86400000)) return;
  holidayAttempts.add(id);
  try {
    const items = await HolidayService.request(year, month);
    HolidayService.store(year, month, items); holidayErrors.delete(id);
    if (year === state.year && month === state.month + 1) { renderCalendar(); renderDayPanel(); }
  } catch (error) {
    holidayErrors.set(id, error.message);
    if (year === state.year && month === state.month + 1) updateHolidayStatus();
  }
}

function persist() {
  if (demo) return;
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ events:state.events, memo:state.memo, filters:state.filters })); }
  catch { showToast('저장 공간을 사용할 수 없어 변경 사항을 저장하지 못했어요.'); }
}
function showToast(msg) {
  const toast = $('toast');
  toast.textContent = msg;
  toast.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('visible'), 2800);
}
function validEvent(e) {
  return e && typeof e.id === 'string' && e.id.length <= 100 &&
    typeof e.title === 'string' && e.title.trim().length > 0 && e.title.length <= 100 &&
    fromISO(e.date) && CATEGORIES[e.category] &&
    (!e.repeat || ['none','daily','weekly','monthly','yearly','custom'].includes(e.repeat.type)) &&
    (e.allDay === true || (isValidTime(e.start) && isValidTime(e.end)));
}
function occursOn(event, targetString) {
  if (event.date > targetString) return false;
  const origin = fromISO(event.date), target = fromISO(targetString);
  if (!origin || !target) return false;
  const r = event.repeat || {type:'none'};
  if (r.until && targetString > r.until) return false;
  if (r.type === 'none' || !r.type) return event.date === targetString;
  const type = r.type === 'custom' ? (r.unit || 'weekly') : r.type;
  const interval = Math.max(1, Math.min(99, Number(r.interval) || 1));
  const daysApart = Math.round((dateUTC(target) - dateUTC(origin)) / 86400000);
  if (type === 'daily') return daysApart % interval === 0;
  if (type === 'weekly') {
    const weekdays = Array.isArray(r.weekdays) && r.weekdays.length ? r.weekdays : [origin.getDay()];
    const weekOffset = Math.floor((dateUTC(target) - dateUTC(new Date(origin.getFullYear(), origin.getMonth(), origin.getDate() - origin.getDay()))) / (7 * 86400000));
    return weekdays.includes(target.getDay()) && weekOffset % interval === 0;
  }
  if (type === 'monthly') {
    const monthsApart = (target.getFullYear()-origin.getFullYear()) * 12 + target.getMonth()-origin.getMonth();
    return monthsApart % interval === 0 && target.getDate() === origin.getDate();
  }
  if (type === 'yearly') return (target.getFullYear()-origin.getFullYear()) % interval === 0 &&
    origin.getMonth() === target.getMonth() && origin.getDate() === target.getDate();
  return false;
}
function dayEvents(dateStr) {
  return state.events.filter(e => occursOn(e,dateStr))
    .sort((a,b) => (a.allDay ? '00:00' : a.start).localeCompare(b.allDay ? '00:00' : b.start) || a.title.localeCompare(b.title,'ko'));
}
function repeatLabel(r) {
  if (!r || r.type === 'none') return '';
  const type = r.type === 'custom' ? r.unit : r.type;
  const n = r.type === 'custom' ? Math.max(1,Number(r.interval) || 1) : 1;
  const units = {daily:'일',weekly:'주',monthly:'개월',yearly:'년'};
  if (!units[type]) return '사용자 지정';
  if (type === 'weekly' && Array.isArray(r.weekdays) && r.weekdays.length) return `매주 ${r.weekdays.slice().sort((a,b)=>a-b).map(day=>['일','월','화','수','목','금','토'][day]).join('·')}`;
  return n === 1 ? ({daily:'매일',weekly:'매주',monthly:'매월',yearly:'매년'}[type]) : `${n}${units[type]}마다`;
}
function renderFilters() {
  const list = $('category-filters'); list.replaceChildren();
  for (const [key, cat] of Object.entries(CATEGORIES)) {
    const b = el('button',`category-chip ${cat.css}${state.filters[key]?'':' inactive'}`);
    b.type='button'; b.setAttribute('aria-pressed',String(state.filters[key]));
    const chk = el('span','chip-check'); chk.append(icon('check'));
    const symbol = icon({church:'church',work:'work',personal:'calendar'}[key]);
    symbol.classList.add('category-symbol');
    b.append(chk,symbol,el('span','',cat.name));
    b.addEventListener('click', () => {
      state.filters[key]=!state.filters[key];
      persist(); renderFilters();renderCalendar();renderDayPanel();
    });
    list.append(b);
  }
}
function renderCalendar() {
  loadHolidays();
  $('calendar-year').textContent = `${state.year}년`;
  $('month-title').textContent = `${state.month + 1}월`;
  const grid = $('calendar-grid'); grid.replaceChildren();
  for(let i=0;i<7;i++) {
    const heading = el('div',`weekday${i===0?' sunday':''}${i===6?' saturday':''}`,WEEKDAY_LABELS[i]);
    grid.append(heading);
  }
  const firstWeekday=new Date(state.year,state.month,1).getDay();
  const count=new Date(state.year,state.month+1,0).getDate();
  const weeks=Math.ceil((firstWeekday+count)/7);
  grid.style.setProperty('--weeks',weeks);
  grid.dataset.weeks=String(weeks);
  for(let index=0;index<weeks*7;index++){
    const day=index-firstWeekday+1;
    const dow=index%7;
    const cell=el('div',`day-cell${dow===0?' sunday':''}${dow===6?' saturday':''}`);
    if(day<1 || day>count){cell.classList.add('blank');grid.append(cell);continue;}
    const date=toISO(new Date(state.year,state.month,day));
    cell.dataset.date=date;
    if(date===state.selected)cell.classList.add('selected');
    if(date===toISO(new Date()))cell.classList.add('today');
    const dateHeading=el('div','day-date');
    const num=el('span','day-number'+(date===state.selected?' is-selected-number':''),String(day));dateHeading.append(num);cell.append(dateHeading);
    const holiday = HolidayService.names(date);
    if (holiday) {
      cell.classList.add('public-holiday');
      const label = el('span', 'holiday-name', holiday); label.title = holiday; dateHeading.append(label);
    }
    const eventBox=el('div','cell-events');
    const events=dayEvents(date);
    for(const e of events) {
      const cat=CATEGORIES[e.category];
      const pill=el('button',`event-pill ${cat.css}`);
      pill.type='button';pill.title=e.title.replaceAll('\n',' ')+' (더블클릭하여 수정)';
      const mark=icon({church:'church',work:'work',personal:'calendar'}[e.category]);
      mark.classList.add('pill-mark');
      pill.append(mark,document.createTextNode(e.title));
      pill.addEventListener('click',evt=>{evt.stopPropagation();selectDate(date);});
      pill.addEventListener('dblclick',evt=>{evt.stopPropagation();openEditor(e);});
      eventBox.append(pill);
    }
    cell.append(eventBox);
    cell.tabIndex=0;
    cell.setAttribute('role','button');
    cell.setAttribute('aria-label',`${state.month + 1}월 ${day}일, ${holiday ? holiday + ', ' : ''}일정 ${events.length}개. 더블클릭하여 추가`);
    cell.addEventListener('click',()=>selectDate(date));
    cell.addEventListener('dblclick',()=>openEditor(null,date,false));
    cell.addEventListener('keydown',e=>{
      if(e.key==='Enter'||e.key===' '){e.preventDefault();selectDate(date);}
      if(e.key==='F2'){e.preventDefault();openEditor(null,date,false);}
    });
    grid.append(cell);
  }
}
function selectDate(date) {
  state.selected=date;
  const parsed=fromISO(date);
  state.year=parsed.getFullYear(); state.month=parsed.getMonth();
  renderCalendar();renderDayPanel();
}
function renderDayPanel() {
  const d=fromISO(state.selected);
  $('selected-date-title').textContent=`${d.getMonth()+1}월 ${d.getDate()}일 (${WEEKDAY_LABELS[d.getDay()]})`;
  let holidayLabel = $('selected-holiday');
  if (!holidayLabel) {
    holidayLabel = el('div', 'selected-holiday'); holidayLabel.id = 'selected-holiday';
    document.querySelector('.day-heading').after(holidayLabel);
  }
  holidayLabel.textContent = HolidayService.names(state.selected);
  holidayLabel.hidden = !holidayLabel.textContent;
  const events=dayEvents(state.selected);
  $('day-count-label').textContent=`이날의 일정 ${events.length}개`;
  const container=$('day-events');container.replaceChildren();
  if(!events.length){
    const empty=el('div','day-empty');
    const img=el('img');img.src='assets/usagi-standing.png';img.alt='우사기';
    empty.append(img,el('strong','','아직 일정이 없는 날이에요'),el('p','','오른쪽 위 + 버튼이나 날짜 더블클릭으로\n새 일정을 추가해 보세요.'));
    container.append(empty);
    return;
  }
  for(const e of events){
    const cat=CATEGORIES[e.category];
    const article=el('article',`detail-event ${cat.css}`);
    article.tabIndex=0;article.setAttribute('role','button');article.setAttribute('aria-label',`${e.title} 수정`);
    const heading=el('div','detail-title');
    const categoryIcon=icon({church:'church',work:'work',personal:'calendar'}[e.category]);
    categoryIcon.classList.add('detail-symbol');
    heading.append(categoryIcon,el('h3','',e.title),el('span','detail-category',cat.name));
    const when=el('div','detail-meta');when.append(icon('clock'),el('span','',e.allDay?'하루 종일':`${e.start} ~ ${e.end}`));
    article.append(heading,when);
    if(e.repeat && e.repeat.type!=='none'){
      const repeat=el('div','detail-meta');repeat.append(icon('repeat'),el('span','',`반복: ${repeatLabel(e.repeat)}${e.repeat.until?' · '+e.repeat.until+'까지':''}`));article.append(repeat);
    }
    if(container.childElementCount===0){
      const sticker=el('img','detail-usagi');sticker.src='assets/usagi-loading.png';sticker.alt='';article.append(sticker);
    }
    article.addEventListener('click',()=>openEditor(e));
    article.addEventListener('keydown',ev=>{if(ev.key==='Enter'||ev.key===' '){ev.preventDefault();openEditor(e);}});
    container.append(article);
  }
}
function updateRepeatFields() {
  const days=Array.from(document.querySelectorAll('#repeat-weekdays button[aria-pressed="true"]'),button=>Number(button.dataset.weekday));
  $('repeat-state').textContent=days.length ? `매주 ${days.sort((a,b)=>a-b).map(day=>['일','월','화','수','목','금','토'][day]).join(' · ')}` : '안 함';
  $('repeat-end-toggle').hidden=!days.length;
}
function timeToMinutes(value) { const [hours, minutes] = value.split(':').map(Number); return hours * 60 + minutes; }
function minutesToTime(value) { return `${pad2(Math.floor(value / 60))}:${pad2(value % 60)}`; }
function formatTime(value) {
  const hours = Math.floor(value / 60), minutes = value % 60;
  return `${hours < 12 ? '오전' : '오후'} ${hours % 12 || 12}:${pad2(minutes)}`;
}
function updateTimeRange(changed, source = 'range') {
  const start = $('range-start'), end = $('range-end');
  let startValue = Number(start.value), endValue = Number(end.value);
  if (source === 'range') {
    if (changed === start && startValue > endValue) end.value = String(endValue = startValue);
    if (changed === end && endValue < startValue) start.value = String(startValue = endValue);
    $('event-start').value = minutesToTime(startValue);
    $('event-end').value = minutesToTime(endValue);
  } else {
    startValue = timeToMinutes($('event-start').value);
    endValue = timeToMinutes($('event-end').value);
    if (changed === $('event-start') && startValue > endValue) { endValue = startValue; $('event-end').value = minutesToTime(endValue); }
    if (changed === $('event-end') && endValue < startValue) { startValue = endValue; $('event-start').value = minutesToTime(startValue); }
    start.value = String(startValue); end.value = String(endValue);
  }
  const left = startValue / 1430 * 100, right = endValue / 1430 * 100;
  $('time-range-fill').style.left = `${left}%`;
  $('time-range-fill').style.width = `${right-left}%`;
}
function updateAllDay() { $('time-fields').hidden = $('event-allday').checked; }
function openEditor(event=null, date=state.selected) {
  $('event-form').reset();
  $('event-id').value=event?.id||'';
  $('dialog-title').textContent=event?'일정 수정하기':'새 일정 추가';
  $('event-name').value=event?.title||'';
  $('event-date').value=event?.date||date;
  $('event-category').value=event?.category||'personal';
  $('event-allday').checked=event?.allDay??false;
  $('event-start').value=event?.start||'10:00';
  $('event-end').value=event?.end||'11:00';
  $('repeat-until').value=event?.repeat?.until||'';
  const weeklyDays = event?.repeat?.type==='weekly' ? (event.repeat.weekdays || [fromISO(event.date).getDay()]) : [];
  document.querySelectorAll('#repeat-weekdays button').forEach(button => {
    button.setAttribute('aria-pressed', String(weeklyDays.includes(Number(button.dataset.weekday))));
  });
  $('until-row').hidden = !event?.repeat?.until || !weeklyDays.length;
  $('repeat-end-toggle').setAttribute('aria-expanded', String(Boolean(event?.repeat?.until)));
  $('repeat-end-toggle').querySelector('span').textContent = event?.repeat?.until ? '−' : '＋';
  $('event-delete').hidden=!event;
  updateAllDay();updateRepeatFields();updateTimeRange();
  $('event-dialog').showModal();
  $('event-name').focus();
}
function closeEditor() { $('event-dialog').close(); }
function submitEvent(ev) {
  ev.preventDefault();
  const title=$('event-name').value.trim();
  const date=$('event-date').value;
  if(!title || !fromISO(date)){showToast('일정 이름과 날짜를 확인해 주세요.');return;}
  const allDay=$('event-allday').checked;
  const start=allDay?'':$('event-start').value;
  const end=allDay?'':$('event-end').value;
  if(!allDay && (!isValidTime(start)||!isValidTime(end)||start>=end)){showToast('종료 시간은 시작 시간보다 뒤여야 해요.');return;}
  const weekdays=Array.from(document.querySelectorAll('#repeat-weekdays button[aria-pressed="true"]'),button=>Number(button.dataset.weekday));
  const type=weekdays.length?'weekly':'none';
  const until=type==='none'?'':$('repeat-until').value;
  if(until && (!fromISO(until)||until<date)){showToast('반복 종료일은 시작일 이후여야 해요.');return;}
  const prevId=$('event-id').value;
  const record={
    id:prevId || (globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`),
    title,date,category:$('event-category').value,allDay,start,end,
    repeat:{type,interval:1,weekdays:type==='weekly'?weekdays:undefined,until}
  };
  if(!validEvent(record)){showToast('일정 정보를 다시 확인해 주세요.');return;}
  if(prevId){const i=state.events.findIndex(e=>e.id===prevId);if(i>=0)state.events[i]=record;else state.events.push(record);}
  else state.events.push(record);
  persist();closeEditor();selectDate(record.date);
  showToast(prevId?'일정을 수정했어요.':'일정을 저장했어요.');
}
function deleteEvent() {
  const id=$('event-id').value;
  const event=state.events.find(e=>e.id===id);
  if(!event)return;
  const message=event.repeat?.type!=='none'?'반복 일정 전체를 삭제할까요?':'이 일정을 삭제할까요?';
  if(!window.confirm(message))return;
  state.events=state.events.filter(e=>e.id!==id);
  persist();closeEditor();renderCalendar();renderDayPanel();showToast('일정을 삭제했어요.');
}
function init() {
  HolidayService.initialize().then(() => { renderCalendar(); renderDayPanel(); });
  $('memo-input').value=state.memo;
  $('memo-input').addEventListener('input',()=>{
    state.memo=$('memo-input').value;
    $('memo-save').lastChild.textContent=' 저장 중...';
    clearTimeout(memoTimer);
    memoTimer=setTimeout(()=>{persist();$('memo-save').lastChild.textContent=' 자동 저장됨';},350);
  });
  $('prev-month').addEventListener('click',()=>{const d=new Date(state.year,state.month-1,1);state.year=d.getFullYear();state.month=d.getMonth();state.selected=toISO(d);renderCalendar();renderDayPanel();});
  $('next-month').addEventListener('click',()=>{const d=new Date(state.year,state.month+1,1);state.year=d.getFullYear();state.month=d.getMonth();state.selected=toISO(d);renderCalendar();renderDayPanel();});
  $('day-add').addEventListener('click',()=>openEditor(null,state.selected,false));
  $('dialog-close').addEventListener('click',closeEditor);
  $('dialog-cancel').addEventListener('click',closeEditor);
  $('event-form').addEventListener('submit',submitEvent);
  $('event-delete').addEventListener('click',deleteEvent);
  document.querySelectorAll('#repeat-weekdays button').forEach(button => button.addEventListener('click',()=>{
    button.setAttribute('aria-pressed',String(button.getAttribute('aria-pressed')!=='true'));
    if(!document.querySelector('#repeat-weekdays button[aria-pressed="true"]')) { $('until-row').hidden=true; $('repeat-end-toggle').setAttribute('aria-expanded','false'); $('repeat-end-toggle').querySelector('span').textContent='＋'; }
    updateRepeatFields();
  }));
  $('repeat-end-toggle').addEventListener('click',()=>{
    const open=$('until-row').hidden;
    $('until-row').hidden=!open;
    $('repeat-end-toggle').setAttribute('aria-expanded',String(open));
    $('repeat-end-toggle').querySelector('span').textContent=open?'−':'＋';
  });
  $('event-allday').addEventListener('change',updateAllDay);
  $('range-start').addEventListener('input',()=>updateTimeRange($('range-start')));
  $('range-end').addEventListener('input',()=>updateTimeRange($('range-end')));
  $('event-start').addEventListener('input',()=>updateTimeRange($('event-start'),'time'));
  $('event-end').addEventListener('input',()=>updateTimeRange($('event-end'),'time'));
  $('event-dialog').addEventListener('click',ev=>{if(ev.target===$('event-dialog'))closeEditor();});
  $('win-min').addEventListener('click',()=>window.desktop?.minimize());
  $('win-max').addEventListener('click',()=>window.desktop?.maximize());
  $('win-close').addEventListener('click',()=>window.desktop?.close());
  renderCalendar();renderDayPanel();
}
init();
