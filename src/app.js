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
  if (type === 'weekly') return daysApart % (7 * interval) === 0;
  if (type === 'monthly') {
    const monthsApart = (target.getFullYear()-origin.getFullYear()) * 12 + target.getMonth()-origin.getMonth();
    return monthsApart % interval === 0 && target.getDate() === origin.getDate();
  }
  if (type === 'yearly') return (target.getFullYear()-origin.getFullYear()) % interval === 0 &&
    origin.getMonth() === target.getMonth() && origin.getDate() === target.getDate();
  return false;
}
function dayEvents(dateStr) {
  return state.events.filter(e => state.filters[e.category] && occursOn(e,dateStr))
    .sort((a,b) => (a.allDay ? '00:00' : a.start).localeCompare(b.allDay ? '00:00' : b.start) || a.title.localeCompare(b.title,'ko'));
}
function repeatLabel(r) {
  if (!r || r.type === 'none') return '';
  const type = r.type === 'custom' ? r.unit : r.type;
  const n = r.type === 'custom' ? Math.max(1,Number(r.interval) || 1) : 1;
  const units = {daily:'일',weekly:'주',monthly:'개월',yearly:'년'};
  if (!units[type]) return '사용자 지정';
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
  $('month-title').textContent = `${state.year}년 ${state.month + 1}월`;
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
    const num=el('span','day-number'+(date===state.selected?' is-selected-number':''),String(day));cell.append(num);
    const eventBox=el('div','cell-events');
    const events=dayEvents(date);
    const maxVisible=weeks === 6 ? 1 : 2;
    for(const e of events.slice(0,maxVisible)) {
      const cat=CATEGORIES[e.category];
      const pill=el('button',`event-pill ${cat.css}`);
      pill.type='button';pill.title=e.title.replaceAll('\n',' ')+' (더블클릭하여 수정)';
      const mark=el('span','pill-mark',cat.icon);
      pill.append(mark,document.createTextNode(e.title));
      pill.addEventListener('click',evt=>{evt.stopPropagation();selectDate(date);});
      pill.addEventListener('dblclick',evt=>{evt.stopPropagation();openEditor(e);});
      eventBox.append(pill);
    }
    if(events.length>maxVisible)eventBox.append(el('span','extra-events',`+${events.length-maxVisible}개 더`));
    cell.append(eventBox);
    cell.tabIndex=0;
    cell.setAttribute('role','button');
    cell.setAttribute('aria-label',`${state.month + 1}월 ${day}일, 일정 ${events.length}개. 더블클릭하여 추가`);
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
    const categoryIcon=icon({church:'church',work:'work',personal:'heart'}[e.category]);
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
  const type=$('event-repeat').value;
  $('repeat-details').hidden = type!=='custom';
  $('until-row').hidden = type==='none';
}
function updateAllDay() { $('time-fields').hidden = $('event-allday').checked; }
function openEditor(event=null, date=state.selected, isRepeat=false) {
  $('event-form').reset();
  $('event-id').value=event?.id||'';
  $('dialog-title').textContent=event?'일정 수정하기':isRepeat?'반복 일정 추가':'새 일정 추가';
  $('event-name').value=event?.title||'';
  $('event-date').value=event?.date||date;
  $('event-category').value=event?.category||'personal';
  $('event-allday').checked=event?.allDay??false;
  $('event-start').value=event?.start||'10:00';
  $('event-end').value=event?.end||'11:00';
  $('event-repeat').value=event?.repeat?.type||(isRepeat?'weekly':'none');
  $('repeat-interval').value=event?.repeat?.interval||1;
  $('repeat-unit').value=event?.repeat?.unit||'weekly';
  $('repeat-until').value=event?.repeat?.until||'';
  $('event-delete').hidden=!event;
  updateAllDay();updateRepeatFields();
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
  const type=$('event-repeat').value;
  const until=type==='none'?'':$('repeat-until').value;
  if(until && (!fromISO(until)||until<date)){showToast('반복 종료일은 시작일 이후여야 해요.');return;}
  const prevId=$('event-id').value;
  const record={
    id:prevId || (globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`),
    title,date,category:$('event-category').value,allDay,start,end,
    repeat:{type,interval:type==='custom'?Math.max(1,Math.min(99,Number($('repeat-interval').value)||1)):1,
      unit:type==='custom'?$('repeat-unit').value:undefined,until}
  };
  if(!validEvent(record)){showToast('일정 정보를 다시 확인해 주세요.');return;}
  if(prevId){const i=state.events.findIndex(e=>e.id===prevId);if(i>=0)state.events[i]=record;else state.events.push(record);}
  else state.events.push(record);
  state.filters[record.category]=true;
  persist();closeEditor();selectDate(record.date);renderFilters();
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
  const now=new Date();
  $('today-label').textContent=`오늘은 ${now.getFullYear()}년 ${now.getMonth()+1}월 ${now.getDate()}일 ${['일요일','월요일','화요일','수요일','목요일','금요일','토요일'][now.getDay()]}`;
  $('memo-input').value=state.memo;
  $('memo-input').addEventListener('input',()=>{
    state.memo=$('memo-input').value;
    $('memo-save').lastChild.textContent=' 저장 중...';
    clearTimeout(memoTimer);
    memoTimer=setTimeout(()=>{persist();$('memo-save').lastChild.textContent=' 자동 저장됨';},350);
  });
  $('prev-month').addEventListener('click',()=>{const d=new Date(state.year,state.month-1,1);state.year=d.getFullYear();state.month=d.getMonth();state.selected=toISO(d);renderCalendar();renderDayPanel();});
  $('next-month').addEventListener('click',()=>{const d=new Date(state.year,state.month+1,1);state.year=d.getFullYear();state.month=d.getMonth();state.selected=toISO(d);renderCalendar();renderDayPanel();});
  $('btn-repeat').addEventListener('click',()=>openEditor(null,state.selected,true));
  $('day-add').addEventListener('click',()=>openEditor(null,state.selected,false));
  $('go-today').addEventListener('click',()=>selectDate(toISO(new Date())));
  $('dialog-close').addEventListener('click',closeEditor);
  $('dialog-cancel').addEventListener('click',closeEditor);
  $('event-form').addEventListener('submit',submitEvent);
  $('event-delete').addEventListener('click',deleteEvent);
  $('event-repeat').addEventListener('change',updateRepeatFields);
  $('event-allday').addEventListener('change',updateAllDay);
  $('event-dialog').addEventListener('click',ev=>{if(ev.target===$('event-dialog'))closeEditor();});
  $('win-min').addEventListener('click',()=>window.desktop?.minimize());
  $('win-max').addEventListener('click',()=>window.desktop?.maximize());
  $('win-close').addEventListener('click',()=>window.desktop?.close());
  renderFilters();renderCalendar();renderDayPanel();
}
init();
