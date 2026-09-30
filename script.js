/* ===== Freebies AI Training — общая логика =====
   Прогресс хранится в localStorage. Позже это место можно
   заменить на запросы к api/api.js, когда появятся аккаунты.

   Типы заданий (поле "type" в lessons.json):
     read        — теория
     fillchoice  — предложение с пропусками, в каждом выбор из двух слов
     quiz        — вопрос с вариантами ответа (2-4)
     truefalse   — несколько утверждений: верно / неверно
     match       — соединить пары (термин ↔ описание)
     order       — расставить шаги по порядку
     sort        — разложить пункты по двум группам
     practice    — практическое задание с полем для ответа
*/

const TOTAL_LESSONS = 20;
const STORAGE_KEY = 'fat_progress_v2';

/* ---------- Защита от недогрузки api/client.js -----------
   Если файл api/client.js по какой-то причине не подключился
   (не задеплоен, неверный путь, порядок тегов), все функции
   генерации сразу дают понятную ошибку вместо "is not defined". */
if(typeof generateText !== 'function'){
  window.generateText = async function(){
    throw new Error('Модуль api/client.js не загружен — проверь, что файл лежит в папке api/ и подключён в HTML раньше script.js');
  };
}
if(typeof generateImage !== 'function'){
  window.generateImage = async function(){
    throw new Error('Модуль api/client.js не загружен — проверь, что файл лежит в папке api/ и подключён в HTML раньше script.js');
  };
}

/* ===== Робот-помощник (Mood) =====
   На первом задании урока — случайное настроение (01-03).
   На остальных заданиях — по числу ошибок, допущенных при
   решении текущего задания: 0 ошибок → Mood01, 1 → Mood02,
   2 → Mood03, 3 → Mood04, 4+ (или "везде ошибался") → Mood05.
   После последнего задания (практики) — Mood00 на весь экран. */
let _mistakeCount = 0;

function robotMoodForMistakes(count){
  if(count<=0) return 'Mood01';
  if(count===1) return 'Mood02';
  if(count===2) return 'Mood03';
  if(count===3) return 'Mood04';
  return 'Mood05';
}
function randomFirstMood(){
  const moods=['Mood01','Mood02','Mood03'];
  return moods[Math.floor(Math.random()*moods.length)];
}
function showRobot(mood){
  const el=document.getElementById('robotBuddy');
  if(!el) return;
  el.src='img/'+mood+'.png';
  el.style.display='';
}
function hideRobot(){
  const el=document.getElementById('robotBuddy');
  if(el) el.style.display='none';
}
function registerMistake(){
  _mistakeCount++;
  showRobot(robotMoodForMistakes(_mistakeCount));
}
function showFullscreenRobot(){
  const el=document.getElementById('robotFullscreen');
  if(!el) return;
  el.style.display='flex';
  el.querySelector('img').src='img/Mood00.png';
}
function hideFullscreenRobot(){
  const el=document.getElementById('robotFullscreen');
  if(el) el.style.display='none';
}

/* ---------- Утилиты ---------- */
function notify(msg){
  const t=document.getElementById('toast');
  if(!t) return;
  t.textContent=msg;
  t.classList.add('show');
  clearTimeout(window.tt);
  window.tt=setTimeout(()=>t.classList.remove('show'),2200);
}
function esc(s){
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function shuffle(arr){
  const a=arr.slice();
  for(let i=a.length-1;i>0;i--){
    const j=Math.floor(Math.random()*(i+1));
    [a[i],a[j]]=[a[j],a[i]];
  }
  return a;
}
// перемешивает так, чтобы порядок гарантированно отличался от исходного
function shuffleDifferent(arr){
  let a=shuffle(arr), tries=0;
  while(arr.length>1 && a.every((v,i)=>v===arr[i]) && tries<10){ a=shuffle(arr); tries++; }
  return a;
}

/* ---------- Прогресс (localStorage) ---------- */
function getProgress(){
  try{ return JSON.parse(localStorage.getItem(STORAGE_KEY)||'{}'); }
  catch(e){ return {}; }
}
function saveProgress(p){ localStorage.setItem(STORAGE_KEY, JSON.stringify(p)); }
function markTaskDone(lessonId, taskIndex){
  const p=getProgress();
  if(!p[lessonId]) p[lessonId]=[];
  if(!p[lessonId].includes(taskIndex)) p[lessonId].push(taskIndex);
  saveProgress(p);
}
function getDoneTasks(lessonId){ return getProgress()[lessonId] || []; }
function isLessonComplete(lessonId, totalTasks){ return getDoneTasks(lessonId).length >= totalTasks; }

/* ---------- Главная: карточки уроков (все доступны сразу) ----------
   Квадратные разноцветные карточки в духе Uchi.ru: сверху иконка,
   ниже — РЕАЛЬНЫЙ заголовок урока, и лейбл "Урок N" под ним. */
function renderLessonGrid(){
  const grid=document.getElementById('lessonGrid');
  if(!grid) return;
  fetch('lessons.json').then(r=>r.json()).then(data=>{
    let completedCount=0, html='';
    for(let id=1; id<=TOTAL_LESSONS; id++){
      const lid=String(id), lesson=data[lid];
      if(!lesson) continue;
      const total=lesson.tasks.length;
      const done=getDoneTasks(lid).length;
      const complete=isLessonComplete(lid,total);
      if(complete) completedCount++;
      const badge=`<span class="card-progress-badge ${complete?'done':''}"><span class="ring-dot"></span>${done}/${total}</span>`;
      // У уроков 1-19 есть картинка img/uN.png, которая закрывает ВСЮ карточку.
      // Если файла нет (или урок 20) — карточка остаётся цветной заглушкой с иконкой.
      const hasImage=id<20;
      if(hasImage){
        html+=`
        <article class="lesson-card" onclick="location.href='urok.html?id=${lid}'">
          ${badge}
          <img src="img/u${lid}.png" class="card-cover-img no-download" oncontextmenu="return false" draggable="false" alt="Урок ${lid}: ${esc(lesson.title)}"
               onerror="this.closest('.lesson-card').classList.add('no-image','${lesson.cover}');this.outerHTML='<div class=\\'card-icon-row\\'><div class=\\'illustration\\'>${lesson.icon}</div></div><div class=\\'card-text\\'><h2>${esc(lesson.title)}</h2><span class=\\'lesson-number\\'>Урок ${lid}</span></div>'">
        </article>`;
      } else {
        html+=`
        <article class="lesson-card no-image ${lesson.cover}" onclick="location.href='urok.html?id=${lid}'">
          ${badge}
          <div class="card-icon-row"><div class="illustration">${lesson.icon}</div></div>
          <div class="card-text">
            <h2>${lesson.title}</h2>
            <span class="lesson-number">Урок ${lid}</span>
          </div>
        </article>`;
      }
    }
    grid.innerHTML=html;
    const overallPct=Math.round((completedCount/TOTAL_LESSONS)*100);
    const ring=document.getElementById('overallRing');
    const pctLabel=document.getElementById('overallPct');
    const textLabel=document.getElementById('overallText');
    if(ring) ring.style.setProperty('--pct', overallPct+'%');
    if(pctLabel) pctLabel.textContent=overallPct+'%';
    if(textLabel) textLabel.textContent=completedCount+' из '+TOTAL_LESSONS;
  });
}

/* ==========================================================
   Страница урока — задания показываются ПО ОДНОМУ
   ========================================================== */
let _lessonData=null, _lessonId=null, _currentStep=0, _state={};

function isDone(index){ return getDoneTasks(_lessonId).includes(index); }

// первое ещё не выполненное задание (или tasks.length, если всё пройдено)
function firstUndone(){
  const done=getDoneTasks(_lessonId);
  const i=_lessonData.tasks.findIndex((_,k)=>!done.includes(k));
  return i===-1 ? _lessonData.tasks.length : i;
}

// Единый файл урока: номер берём из URL (urok.html?id=3).
// Если id не передан или не найден — используем урок 1.
function getLessonIdFromUrl(){
  const params=new URLSearchParams(window.location.search);
  return params.get('id') || '1';
}

function renderLessonPage(lessonId){
  _lessonId = String(lessonId || getLessonIdFromUrl());
  fetch('lessons.json').then(r=>r.json()).then(data=>{
    _lessonData=data[_lessonId];
    if(!_lessonData){ notify('Урок не найден'); return; }
    document.getElementById('lessonTopic').textContent=_lessonData.topic;
    document.getElementById('lessonTitle').textContent=_lessonData.title;
    document.title='Урок '+_lessonId+' — '+_lessonData.title;
    _currentStep=firstUndone();
    renderStepTrack();
    renderCurrentStep();
    renderLessonSideNav(data);
  });
}

// Кнопки "предыдущий/следующий урок" внизу страницы, если есть в разметке
function renderLessonSideNav(data){
  const nav=document.getElementById('lessonSideNav');
  if(!nav) return;
  const id=Number(_lessonId);
  const prevId=id-1, nextId=id+1;
  const prevOk=data[String(prevId)];
  const nextOk=data[String(nextId)];
  nav.innerHTML=`
    ${prevOk?`<button class="nav-btn" onclick="location.href='urok.html?id=${prevId}'">← Урок ${prevId}</button>`:'<span></span>'}
    ${nextOk?`<button class="nav-btn" onclick="location.href='urok.html?id=${nextId}'">Урок ${nextId} →</button>`:'<span></span>'}
  `;
}

function renderStepTrack(){
  const track=document.getElementById('stepTrack');
  const label=document.getElementById('stepLabel');
  if(!track) return;
  const done=getDoneTasks(_lessonId);
  track.innerHTML=_lessonData.tasks.map((_,i)=>{
    const cls=done.includes(i)?'done':(i===_currentStep?'current':'');
    return `<div class="step-dot ${cls}" onclick="goToStep(${i})"><i></i></div>`;
  }).join('');
  label.textContent = _currentStep>=_lessonData.tasks.length
    ? 'Урок завершён 🎉'
    : `Шаг ${_currentStep+1} из ${_lessonData.tasks.length}`;
}

// Назад — можно всегда. Вперёд — только до первого невыполненного задания.
function goToStep(index){
  if(index<0) return;
  if(index<=firstUndone()){
    _currentStep=index;
    renderStepTrack();
    renderCurrentStep();
    window.scrollTo({top:0,behavior:'smooth'});
  } else {
    notify('Сначала выполни текущее задание');
  }
}

function renderCurrentStep(){
  const container=document.getElementById('tasksContainer');
  if(!container) return;
  _mistakeCount=0;
  if(_currentStep>=_lessonData.tasks.length){
    container.innerHTML=renderCompleteScreen();
    hideRobot();
    showFullscreenRobot();
    return;
  }
  hideFullscreenRobot();
  const index=_currentStep, task=_lessonData.tasks[index];
  _state={};
  const render=RENDERERS[task.type];
  if(!render){
    container.innerHTML='<div class="task">Неизвестный тип задания: '+esc(task.type)+'</div>';
    return;
  }
  container.innerHTML=render(index,task);
  if(AFTER[task.type]) AFTER[task.type]();
  // робот: на первом задании — случайное настроение, дальше — по ошибкам (обновляется по ходу решения)
  if(index===0) showRobot(randomFirstMood());
  else showRobot(robotMoodForMistakes(0));
}

/* ---------- Боковая панель теории (кнопка book.png) ---------- */
function openTheoryPanel(){
  const panel=document.getElementById('theoryPanel');
  if(!panel || !_lessonData) return;
  const readTask=_lessonData.tasks.find(t=>t.type==='read');
  const body=document.getElementById('theoryPanelBody');
  body.innerHTML = readTask ? readTask.text : '<p>Для этого урока теория не найдена.</p>';
  panel.classList.add('open');
}
function closeTheoryPanel(){
  const panel=document.getElementById('theoryPanel');
  if(panel) panel.classList.remove('open');
}

function renderCompleteScreen(){
  const nextId=Number(_lessonId)+1;
  const hasNext=nextId<=TOTAL_LESSONS;
  return `
  <div class="lesson-complete">
    <div class="big-emoji">🎉</div>
    <h2>Урок пройден!</h2>
    <p>Отличная работа — ты закрыл все задания этого урока.</p>
    <div class="complete-actions">
      <button class="check-btn" onclick="location.href='main.html'">К списку уроков</button>
      ${hasNext?`<button class="check-btn" onclick="location.href='urok.html?id=${nextId}'">Следующий урок →</button>`:''}
    </div>
  </div>`;
}

/* ---------- Общие куски разметки ---------- */
function shell(index, task, tag, tagClass, body, footerHtml){
  const done=isDone(index);
  return `
  <div class="task">
    <div class="task-head">
      <div class="task-num ${done?'done':''}">${done?'✓':index+1}</div>
      <div class="task-title">${task.title}</div>
      <div class="task-tag ${tagClass||''}">${tag}</div>
    </div>
    <div class="task-body">${body}</div>
    ${footerHtml}
  </div>`;
}

// checkLabel = null → без кнопки «Проверить» (например, в заданиях с парами)
function footer(index, checkLabel){
  const done=isDone(index);
  const last=index===_lessonData.tasks.length-1;
  const nextLabel=last?'Завершить урок 🎉':'Дальше →';
  const checkBtn=checkLabel?`<button class="check-btn" id="checkBtn" onclick="checkCurrent()">${checkLabel}</button>`:'';
  return `
  <div class="task-actions">
    ${checkBtn}
    <button class="check-btn secondary" id="nextBtn" style="${done?'':'display:none'}" onclick="goToStep(${index+1})">${nextLabel}</button>
  </div>
  <div class="task-feedback" id="feedback-box"></div>`;
}

function showFeedback(ok,msg){
  const fb=document.getElementById('feedback-box');
  if(!fb) return;
  fb.className='task-feedback show '+(ok?'ok':'no');
  fb.innerHTML=msg;
}

// задание выполнено: сохраняем, показываем «Дальше», прячем «Проверить»
function completeTask(index,msg){
  markTaskDone(_lessonId,index);
  showFeedback(true,msg);
  const cb=document.getElementById('checkBtn'); if(cb) cb.style.display='none';
  const nb=document.getElementById('nextBtn'); if(nb) nb.style.display='';
  renderStepTrack();
  showRobot(robotMoodForMistakes(_mistakeCount));
}

function checkCurrent(){
  const index=_currentStep, task=_lessonData.tasks[index];
  const check=CHECKERS[task.type];
  if(check) check(index,task);
}

/* ==================== Тип: read ==================== */
function renderRead(index,task){
  return shell(index,task,'Теория','',task.text,
    `<div class="task-actions"><button class="check-btn" onclick="finishRead(${index})">Понятно, дальше →</button></div>`);
}
function finishRead(index){
  markTaskDone(_lessonId,index);
  goToStep(index+1);
}

/* ==================== Тип: fillchoice (выбор из двух) ==================== */
function renderFillChoice(index,task){
  _state={blanks:task.blanks.map(b=>({opts:shuffle(b.options),chosen:null,answer:b.answer}))};
  let text=task.text;
  task.blanks.forEach((_,bi)=>{
    const b=_state.blanks[bi];
    const btns=b.opts.map((o,oi)=>
      `<button type="button" class="opt-chip" id="opt-${bi}-${oi}" onclick="pickBlank(${bi},${oi})">${esc(o)}</button>`
    ).join('');
    const html=`<span class="choice-blank">${btns}</span>`;
    text=text.replace('{'+bi+'}',()=>html);
  });
  return shell(index,task,'Выбери','',`<p>${text}</p>`,footer(index,'Проверить'));
}
function pickBlank(bi,oi){
  const b=_state.blanks[bi];
  b.chosen=oi;
  b.opts.forEach((_,k)=>{
    const el=document.getElementById(`opt-${bi}-${k}`);
    el.classList.toggle('selected',k===oi);
    el.classList.remove('correct','wrong');
  });
}
function checkFillChoice(index){
  if(_state.blanks.some(b=>b.chosen===null)){ notify('Выбери слово в каждом пропуске'); return; }
  let ok=true;
  _state.blanks.forEach((b,bi)=>{
    const right=b.opts[b.chosen]===b.answer;
    document.getElementById(`opt-${bi}-${b.chosen}`).classList.add(right?'correct':'wrong');
    if(!right) ok=false;
  });
  if(ok) completeTask(index,'✓ Всё верно!');
  else { registerMistake(); showFeedback(false,'Не совсем — поменяй красные слова и проверь ещё раз'); }
}

/* ==================== Тип: quiz ==================== */
function renderQuiz(index,task){
  _state={opts:shuffle(task.options),chosen:null};
  const letters=['А','Б','В','Г'];
  const opts=_state.opts.map((o,i)=>
    `<button type="button" class="quiz-option" id="qo-${i}" onclick="pickQuiz(${i})"><span class="letter">${letters[i]}</span><span>${esc(o)}</span></button>`
  ).join('');
  return shell(index,task,'Вопрос','',
    `<p class="quiz-q">${task.question}</p><div class="quiz-options">${opts}</div>`,
    footer(index,'Проверить'));
}
function pickQuiz(i){
  _state.chosen=i;
  _state.opts.forEach((_,k)=>{
    const el=document.getElementById('qo-'+k);
    el.classList.toggle('selected',k===i);
    el.classList.remove('correct','wrong');
  });
}
function checkQuiz(index,task){
  if(_state.chosen===null){ notify('Выбери ответ'); return; }
  const right=_state.opts[_state.chosen]===task.answer;
  document.getElementById('qo-'+_state.chosen).classList.add(right?'correct':'wrong');
  if(right) completeTask(index,'✓ Верно! '+(task.explain||''));
  else { registerMistake(); showFeedback(false,'Не совсем — подумай ещё и выбери другой вариант'); }
}

/* ============ Тип: truefalse и sort (общий «двухкнопочный» рендер) ============ */
function renderBinary(index,task,tag,rows,labels){
  _state={rows,labels,chosen:rows.map(()=>null)};
  const list=rows.map((r,ri)=>{
    const btns=labels.map((l,li)=>
      `<button type="button" class="bin-btn" id="bb-${ri}-${li}" onclick="pickBin(${ri},${li})">${esc(l)}</button>`
    ).join('');
    return `<div class="bin-row" id="bin-${ri}">
      <div class="bin-text">${r.text}</div>
      <div class="bin-btns">${btns}</div>
      ${r.explain?`<div class="bin-explain">${r.explain}</div>`:''}
    </div>`;
  }).join('');
  const lead=task.question?`<p class="quiz-q">${task.question}</p>`:'';
  return shell(index,task,tag,'',`${lead}<div class="bin-list">${list}</div>`,footer(index,'Проверить'));
}
function renderTrueFalse(index,task){
  const rows=task.statements.map(s=>({text:s.text,correct:s.answer?0:1,explain:s.explain}));
  return renderBinary(index,task,'Верно / неверно',rows,['Верно','Неверно']);
}
function renderSort(index,task){
  const rows=shuffle(task.items.map(it=>({text:it.text,correct:it.category,explain:it.explain})));
  return renderBinary(index,task,'Сортировка',rows,task.categories);
}
function pickBin(ri,li){
  _state.chosen[ri]=li;
  _state.labels.forEach((_,k)=>document.getElementById(`bb-${ri}-${k}`).classList.toggle('selected',k===li));
  document.getElementById('bin-'+ri).classList.remove('correct','wrong','checked');
}
function checkBinary(index){
  if(_state.chosen.some(c=>c===null)){ notify('Ответь на все пункты'); return; }
  let ok=true;
  _state.rows.forEach((r,ri)=>{
    const right=_state.chosen[ri]===r.correct;
    const row=document.getElementById('bin-'+ri);
    row.classList.remove('correct','wrong');
    row.classList.add(right?'correct':'wrong');
    if(!right) ok=false;
  });
  if(ok){
    _state.rows.forEach((_,ri)=>document.getElementById('bin-'+ri).classList.add('checked'));
    completeTask(index,'✓ Всё верно!');
  } else {
    registerMistake();
    showFeedback(false,'Есть ошибки — поправь красные пункты и проверь снова');
  }
}

/* ==================== Тип: match ==================== */
function renderMatch(index,task){
  const pairs=task.pairs;
  _state={sel:null,matched:0,total:pairs.length,done:{}};
  const right=shuffleDifferent(pairs.map((p,i)=>({i,t:p.right})));
  const L=pairs.map((p,i)=>
    `<button type="button" class="match-item" id="ml-${i}" onclick="pickMatchLeft(${i})">${esc(p.left)}</button>`).join('');
  const R=right.map(o=>
    `<button type="button" class="match-item" id="mr-${o.i}" onclick="pickMatchRight(${o.i})">${esc(o.t)}</button>`).join('');
  return shell(index,task,'Найди пары','',
    `<p class="match-hint">Нажми на слово слева, потом на подходящее описание справа.</p>
     <div class="match-grid"><div class="match-col">${L}</div><div class="match-col">${R}</div></div>`,
    footer(index,null));
}
function pickMatchLeft(i){
  if(_state.done[i]) return;
  _state.sel=i;
  document.querySelectorAll('.match-item').forEach(el=>{
    if(el.id.indexOf('ml-')===0) el.classList.remove('selected');
  });
  document.getElementById('ml-'+i).classList.add('selected');
}
function pickMatchRight(i){
  if(_state.done[i]) return;
  if(_state.sel===null){ notify('Сначала выбери слово слева'); return; }
  if(_state.sel===i){
    _state.done[i]=true;
    _state.matched++;
    ['ml-','mr-'].forEach(p=>{
      const el=document.getElementById(p+i);
      el.classList.remove('selected');
      el.classList.add('matched');
    });
    _state.sel=null;
    if(_state.matched===_state.total) completeTask(_currentStep,'✓ Отлично, все пары найдены!');
  } else {
    registerMistake();
    const el=document.getElementById('mr-'+i);
    el.classList.add('wrong');
    setTimeout(()=>el.classList.remove('wrong'),450);
  }
}

/* ==================== Тип: order ==================== */
function renderOrder(index,task){
  const items=task.items.map((t,i)=>({id:i,t}));
  _state={pool:shuffleDifferent(items),answer:[],checked:false};
  return shell(index,task,'Порядок','',
    `<p class="quiz-q">${task.question}</p>
     <div class="order-label">Твой порядок</div>
     <div class="order-slots" id="orderSlots"></div>
     <div class="order-label">Варианты — нажимай по очереди</div>
     <div class="order-pool" id="orderPool"></div>`,
    footer(index,'Проверить'));
}
function drawOrder(){
  const slots=document.getElementById('orderSlots'), pool=document.getElementById('orderPool');
  if(!slots||!pool) return;
  slots.innerHTML=_state.answer.length
    ? _state.answer.map((o,pos)=>{
        const cls=_state.checked?(o.id===pos?'correct':'wrong'):'';
        return `<button type="button" class="order-item ${cls}" onclick="orderRemove(${pos})"><span class="n">${pos+1}</span><span>${esc(o.t)}</span></button>`;
      }).join('')
    : '<div class="order-empty">Здесь появится твой порядок…</div>';
  pool.innerHTML=_state.pool.map((o,pi)=>
    `<button type="button" class="order-item" onclick="orderAdd(${pi})"><span>${esc(o.t)}</span></button>`).join('');
}
function orderAdd(pi){
  const o=_state.pool.splice(pi,1)[0];
  _state.answer.push(o);
  _state.checked=false;
  drawOrder();
}
function orderRemove(pos){
  const o=_state.answer.splice(pos,1)[0];
  _state.pool.push(o);
  _state.checked=false;
  drawOrder();
}
function checkOrder(index){
  if(_state.pool.length){ notify('Расставь все пункты'); return; }
  _state.checked=true;
  drawOrder();
  const ok=_state.answer.every((o,pos)=>o.id===pos);
  if(ok) completeTask(index,'✓ Порядок верный!');
  else { registerMistake(); showFeedback(false,'Красные пункты стоят не на своём месте — нажми на них, чтобы вернуть, и попробуй ещё'); }
}

/* ==================== Тип: practice (интерфейс чата с ИИ) ====================
   Реальный вызов ИИ через api/client.js → /api/api.js?action=openrouter (Agnes). */
function renderPractice(index,task){
  _state={sentCount:0};
  const body=`
    <div class="chat-shell">
      <div class="chat-header">
        <div class="chat-avatar">🤖</div>
        <div>
          <div class="chat-name">Freebies AI</div>
          <div class="chat-status"><span class="dot"></span>онлайн</div>
        </div>
      </div>
      <div class="chat-window" id="chatWindow">
        <div class="msg bot">${task.prompt}</div>
      </div>
      <div class="chat-input-row">
        <textarea id="chatInput" rows="1" placeholder="Напиши сообщение..." onkeydown="handleChatKey(event)"></textarea>
        <button class="chat-send" id="chatSend" onclick="sendChatMessage(${index})">➤</button>
      </div>
    </div>
    <div class="practice-hint">${task.hint||''}</div>`;
  return shell(index,task,'Практика','practice',body,footer(index,null));
}

function handleChatKey(e){
  if(e.key==='Enter' && !e.shiftKey){
    e.preventDefault();
    sendChatMessage(_currentStep);
  }
}

async function sendChatMessage(index){
  const input=document.getElementById('chatInput');
  const text=(input.value||'').trim();
  if(!text) return;
  const win=document.getElementById('chatWindow');
  const sendBtn=document.getElementById('chatSend');

  win.insertAdjacentHTML('beforeend', `<div class="msg user">${esc(text)}</div>`);
  input.value='';
  win.scrollTop=win.scrollHeight;
  if(sendBtn) sendBtn.disabled=true;

  win.insertAdjacentHTML('beforeend', `<div class="msg bot typing" id="typingIndicator"><span></span><span></span><span></span></div>`);
  win.scrollTop=win.scrollHeight;

  let replyText;
  try{
    if(typeof generateText !== 'function'){
      throw new Error('API-модуль не загружен (проверь, что файл api/client.js лежит рядом со script.js и подключён в urok.html до него)');
    }
    replyText = await generateText(text);
  }catch(err){
    replyText = 'Не получилось получить ответ (' + err.message + '). Попробуй ещё раз чуть позже.';
  }

  const typing=document.getElementById('typingIndicator');
  if(typing) typing.remove();
  win.insertAdjacentHTML('beforeend', `<div class="msg bot">${esc(replyText).replace(/\n/g,'<br>')}</div>`);
  win.scrollTop=win.scrollHeight;
  if(sendBtn) sendBtn.disabled=false;

  _state.sentCount++;
  if(_state.sentCount===1){
    completeTask(index,'✓ Практика засчитана! 🎉');
  }
}

/* ==================== Тип: path (дорожка событий, урок 1) ====================
   Визуально то же самое, что order, но с подписью "дорожка" — переиспользуем
   рендер order с иной обёрткой. */
function renderPath(index,task){
  const items=task.items.map((t,i)=>({id:i,t}));
  _state={pool:shuffleDifferent(items),answer:[],checked:false};
  return shell(index,task,'Дорожка','',
    `<p class="quiz-q">${task.question}</p>
     <div class="order-label">Твоя дорожка</div>
     <div class="order-slots path-slots" id="orderSlots"></div>
     <div class="order-label">Варианты — нажимай по очереди</div>
     <div class="order-pool" id="orderPool"></div>`,
    footer(index,'Проверить'));
}

/* ==================== Тип: imagegen3 (3 картинки, урок 2) ==================== */
function renderImageGen3(index,task){
  _state={done:task.prompts.map(()=>false)};
  const cards=task.prompts.map((p,i)=>`
    <div class="imggen-card" id="imggen-${i}">
      <div class="imggen-label">${esc(p.label)}</div>
      <div class="imggen-canvas" id="imggen-canvas-${i}">
        <button type="button" class="imggen-btn" onclick="runImageGen3(${i})">✨ Сгенерировать</button>
      </div>
    </div>`).join('');
  const body=`<p>${task.instruction}</p><div class="imggen-grid">${cards}</div>`;
  return shell(index,task,'Практика','practice',body,footer(index,null));
}
async function runImageGen3(i){
  const task=_lessonData.tasks[_currentStep];
  const canvas=document.getElementById('imggen-canvas-'+i);
  canvas.innerHTML='<div class="imggen-loading"><div class="spinner"></div>Генерирую…</div>';
  try{
    const url=await generateImage(task.prompts[i].prompt);
    canvas.innerHTML=`<img src="${url}" class="imggen-result no-download" oncontextmenu="return false" draggable="false" alt="${esc(task.prompts[i].label)}">`;
  }catch(err){
    canvas.innerHTML=`<div class="imggen-error">Не получилось: ${esc(err.message)}<br><button type="button" class="imggen-btn" onclick="runImageGen3(${i})">Попробовать снова</button></div>`;
    return;
  }
  _state.done[i]=true;
  if(_state.done.every(Boolean)){
    completeTask(_currentStep,'✓ Все картинки сгенерированы! 🎉');
  }
}

/* ==================== Тип: imagegen1 (1 картинка, уроки 3, 7, 8) ==================== */
function renderImageGen1(index,task){
  _state={done:false};
  const body=`
    <p>${task.instruction}</p>
    <div class="imggen-single">
      <textarea id="imggenPrompt" rows="2" class="imggen-prompt-input">${esc(task.defaultPrompt||'')}</textarea>
      <button type="button" class="check-btn" onclick="runImageGen1(${index})">✨ Сгенерировать</button>
      <div class="imggen-canvas single" id="imggenCanvasSingle"></div>
    </div>`;
  return shell(index,task,'Практика','practice',body,footer(index,null));
}
async function runImageGen1(index){
  const canvas=document.getElementById('imggenCanvasSingle');
  const promptText=(document.getElementById('imggenPrompt').value||'').trim();
  if(!promptText){ notify('Напиши, что генерировать'); return; }
  canvas.innerHTML='<div class="imggen-loading"><div class="spinner"></div>Генерирую…</div>';
  try{
    const url=await generateImage(promptText);
    canvas.innerHTML=`<img src="${url}" class="imggen-result no-download" oncontextmenu="return false" draggable="false" alt="результат генерации">`;
  }catch(err){
    canvas.innerHTML=`<div class="imggen-error">Не получилось: ${esc(err.message)}</div>`;
    return;
  }
  completeTask(index,'✓ Картинка готова! 🎉');
}

/* ==================== Тип: alicecheck (урок 6) ==================== */
function renderAliceCheck(index,task){
  const body=`
    <p>${task.instruction}</p>
    <a class="check-btn" href="${task.aliceUrl}" target="_blank" rel="noopener" style="display:inline-block;text-decoration:none;text-align:center">Открыть Алису АИ ↗</a>
    <div class="practice-box" style="margin-top:14px">
      <textarea id="aliceAnswer" placeholder="Вставь сюда ответ Алисы..."></textarea>
    </div>`;
  return shell(index,task,'Практика','practice',body,footer(index,'Готово'));
}
function checkAliceCheck(index){
  const t=document.getElementById('aliceAnswer');
  if(!t.value.trim()){ notify('Сначала вставь ответ Алисы'); return; }
  completeTask(index,'✓ Практика засчитана! 🎉');
}

/* ==================== Тип: voiceguess (урок 10, 3 раунда) ==================== */
function renderVoiceGuess(index,task){
  _state={round:0, rounds:task.rounds.map(r=>{
    // перемешиваем клипы в раунде местами каждый раз заново
    const clips=shuffle(r.clips);
    return {...r, clips, answered:false, pickedIndex:null};
  })};
  const body=`<p>${task.instruction}</p><div id="voiceRoundStage"></div>`;
  return shell(index,task,'Практика','practice',body,footer(index,null));
}
function drawVoiceRound(){
  const stage=document.getElementById('voiceRoundStage');
  if(!stage) return;
  const total=_state.rounds.length;
  if(_state.round>=total){
    stage.innerHTML='<div class="task-feedback show ok">✓ Все раунды пройдены! 🎉</div>';
    return;
  }
  const r=_state.rounds[_state.round];
  const askText=r.askReal ? 'Какая запись настоящая?' : 'Какая запись сгенерирована ИИ?';
  const clipsHtml=r.clips.map((c,ci)=>{
    const isPicked = r.answered && r.pickedIndex===ci;
    const showResult = r.answered && !r.note; // раунд-исключение (обе ИИ) результат не подсвечиваем
    let resultClass='', resultTag='';
    if(showResult){
      const wantedIsAI = !r.askReal;
      const thisIsTarget = c.isAI === wantedIsAI;
      if(thisIsTarget){ resultClass='voice-clip-correct'; resultTag='<span class="voice-tag ok">✓ Правильный ответ</span>'; }
      else if(isPicked){ resultClass='voice-clip-wrong'; resultTag='<span class="voice-tag no">✕ Твой выбор</span>'; }
    }
    return `
    <div class="voice-clip ${resultClass}" id="voiceClip-${ci}">
      ${resultTag}
      <div class="voice-player" data-audio="${c.file}">
        <button type="button" class="voice-play-btn" onclick="toggleVoicePlay(${ci})" id="voicePlayBtn-${ci}">▶</button>
        <div class="voice-progress-track" onclick="seekVoice(event,${ci})">
          <div class="voice-progress-fill" id="voiceProgress-${ci}"></div>
        </div>
        <span class="voice-time" id="voiceTime-${ci}">0:00</span>
        <audio id="voiceAudio-${ci}" src="${c.file}" class="no-download" preload="metadata"
               ontimeupdate="updateVoiceProgress(${ci})" onended="onVoiceEnded(${ci})"></audio>
      </div>
      <button type="button" class="check-btn ${isPicked?'secondary':''}" ${r.answered?'disabled':''} onclick="pickVoice(${ci})">
        ${isPicked?'Твой выбор':'Это она'}
      </button>
    </div>`;
  }).join('');
  stage.innerHTML=`
    <div class="voice-round">
      <div class="voice-person">
        <img src="${r.photo}" class="voice-photo no-download" oncontextmenu="return false" draggable="false" alt="${esc(r.person)}">
        <div class="voice-person-name">${esc(r.person)}</div>
      </div>
      <div class="quiz-q">Раунд ${_state.round+1} из ${total}: ${askText}</div>
      ${r.note?`<div class="practice-hint">${esc(r.note)}</div>`:''}
      <div class="voice-clips">${clipsHtml}</div>
      ${r.answered?`<button type="button" class="check-btn secondary" style="margin-top:14px" onclick="nextVoiceRound()">Дальше →</button>`:''}
    </div>`;
}
function toggleVoicePlay(ci){
  const audio=document.getElementById('voiceAudio-'+ci);
  const btn=document.getElementById('voicePlayBtn-'+ci);
  if(!audio) return;
  // ставим на паузу все остальные плееры в раунде
  document.querySelectorAll('.voice-clips audio').forEach(a=>{
    if(a!==audio && !a.paused) a.pause();
  });
  document.querySelectorAll('.voice-play-btn').forEach(b=>{ if(b!==btn) b.textContent='▶'; });
  if(audio.paused){ audio.play(); btn.textContent='⏸'; }
  else { audio.pause(); btn.textContent='▶'; }
}
function updateVoiceProgress(ci){
  const audio=document.getElementById('voiceAudio-'+ci);
  const fill=document.getElementById('voiceProgress-'+ci);
  const time=document.getElementById('voiceTime-'+ci);
  if(!audio||!fill||!time||!audio.duration) return;
  const pct=(audio.currentTime/audio.duration)*100;
  fill.style.width=pct+'%';
  const s=Math.floor(audio.currentTime);
  time.textContent=Math.floor(s/60)+':'+String(s%60).padStart(2,'0');
}
function onVoiceEnded(ci){
  const btn=document.getElementById('voicePlayBtn-'+ci);
  if(btn) btn.textContent='▶';
}
function seekVoice(e,ci){
  const audio=document.getElementById('voiceAudio-'+ci);
  const track=e.currentTarget;
  if(!audio||!audio.duration) return;
  const rect=track.getBoundingClientRect();
  const pct=(e.clientX-rect.left)/rect.width;
  audio.currentTime=pct*audio.duration;
}
function pickVoice(clipIndex){
  const r=_state.rounds[_state.round];
  if(r.answered) return;
  r.answered=true;
  r.pickedIndex=clipIndex;
  // ставим на паузу все плееры перед показом результата
  document.querySelectorAll('.voice-clips audio').forEach(a=>a.pause());
  const clip=r.clips[clipIndex];
  const wantedIsAI = !r.askReal;
  const correct = clip.isAI === wantedIsAI || r.note; // раунд с note — всегда верно (обе ИИ)
  if(!correct) registerMistake();
  drawVoiceRound(); // перерисовываем раунд, теперь с подсветкой правильного/неправильного
}
function nextVoiceRound(){
  _state.round++;
  drawVoiceRound();
  if(_state.round>=_state.rounds.length){
    completeTask(_currentStep,'✓ Практика завершена! 🎉');
  }
}

/* ==================== Тип: wordcheck (уроки 13, 17 — кликабельные слова) ====================
   mode: "checkbrowser" — ИИ сразу пишет ответ (автопромпт), ребёнок кликает неверные слова
         "checkAI"       — ребёнок сам пишет вопрос, затем кликает неверные слова в ответе */
function renderWordCheck(index,task){
  _state={marked:new Set(), gotReply:false};
  if(task.mode==='checkbrowser'){
    const body=`
      <p>${task.instruction}</p>
      <div id="wordcheckStage"><button type="button" class="check-btn" onclick="fetchWordCheckAuto(${index})">Спросить у ИИ</button></div>`;
    return shell(index,task,'Практика','practice',body,footer(index,null));
  } else {
    const body=`
      <p>${task.instruction}</p>
      <div class="practice-box">
        <textarea id="wordcheckQuestion" placeholder="${esc(task.placeholder||'Напиши свой вопрос...')}"></textarea>
      </div>
      <button type="button" class="check-btn" onclick="fetchWordCheckAsk(${index})">Отправить</button>
      <div id="wordcheckStage"></div>
      <div class="practice-hint">${task.hint||''}</div>`;
    return shell(index,task,'Практика','practice',body,footer(index,null));
  }
}
async function fetchWordCheckAuto(index){
  const task=_lessonData.tasks[index];
  const stage=document.getElementById('wordcheckStage');
  stage.innerHTML='<div class="imggen-loading"><div class="spinner"></div>ИИ печатает…</div>';
  let text;
  try{ text=await generateText(task.autoPrompt); }
  catch(err){ stage.innerHTML='<div class="imggen-error">Не получилось: '+esc(err.message)+'</div>'; return; }
  drawWordCheckReply(text, task);
}
async function fetchWordCheckAsk(index){
  const task=_lessonData.tasks[index];
  const q=(document.getElementById('wordcheckQuestion').value||'').trim();
  if(!q){ notify('Сначала напиши вопрос'); return; }
  const stage=document.getElementById('wordcheckStage');
  stage.innerHTML='<div class="imggen-loading"><div class="spinner"></div>ИИ печатает…</div>';
  let text;
  try{ text=await generateText(q); }
  catch(err){ stage.innerHTML='<div class="imggen-error">Не получилось: '+esc(err.message)+'</div>'; return; }
  drawWordCheckReply(text, task);
}
function drawWordCheckReply(text, task){
  const stage=document.getElementById('wordcheckStage');
  _state.gotReply=true;
  const words=text.split(/(\s+)/); // сохраняем пробелы как отдельные токены
  const html=words.map((w,i)=>{
    if(/^\s+$/.test(w) || !w) return w;
    return `<span class="wc-word" data-i="${i}" onclick="toggleWordMark(${i})">${esc(w)}</span>`;
  }).join('');
  stage.innerHTML=`
    <div class="wc-answer">${html}</div>
    <div class="practice-hint">${task.mode==='checkbrowser'?(task.hint||''):''}</div>
    <button type="button" class="check-btn secondary" style="margin-top:12px" onclick="finishWordCheck(${_currentStep})">Готово, я проверил</button>`;
}
function toggleWordMark(i){
  const el=document.querySelector(`.wc-word[data-i="${i}"]`);
  if(!el) return;
  if(_state.marked.has(i)){ _state.marked.delete(i); el.classList.remove('marked'); }
  else { _state.marked.add(i); el.classList.add('marked'); }
}
function finishWordCheck(index){
  if(!_state.gotReply){ notify('Сначала получи ответ от ИИ'); return; }
  completeTask(index,'✓ Практика засчитана! 🎉');
}

/* ==================== Тип: trueFalseAI (урок 14) ==================== */
function renderTrueFalseAI(index,task){
  const body=`
    <p>${task.instruction}</p>
    <div class="practice-box">
      <textarea id="tfaiInput" rows="3" placeholder="${esc(task.placeholder||'')}"></textarea>
    </div>
    <button type="button" class="check-btn" onclick="runTrueFalseAI(${index})">Отправить на проверку</button>
    <div id="tfaiStage"></div>`;
  return shell(index,task,'Практика','practice',body,footer(index,null));
}
async function runTrueFalseAI(index){
  const input=document.getElementById('tfaiInput');
  const text=(input.value||'').trim();
  if(!text){ notify('Сначала напиши 3 примера'); return; }
  const stage=document.getElementById('tfaiStage');
  stage.innerHTML='<div class="imggen-loading"><div class="spinner"></div>ИИ проверяет…</div>';
  const prompt='Пользователь назвал примеры суперприложений: "'+text+'". Для каждого примера коротко (1 фраза) напиши, действительно ли это похоже на суперприложение, или ты не уверен. Ответь дружелюбно и просто, для школьника.';
  let reply;
  try{ reply=await generateText(prompt); }
  catch(err){ reply='Не получилось проверить через ИИ, но это не страшно — задание всё равно засчитано.'; }
  stage.innerHTML=`<div class="msg bot" style="max-width:100%">${esc(reply).replace(/\n/g,'<br>')}</div>`;
  // задание засчитывается в любом случае, как и просили
  completeTask(index,'✓ Практика засчитана! 🎉');
}

/* ==================== Тип: retell (урок 15) ==================== */
function renderRetell(index,task){
  const body=`
    <p>${task.instruction}</p>
    <div class="practice-box">
      <textarea id="retellInput" rows="4" placeholder="${esc(task.placeholder||'')}"></textarea>
    </div>
    <button type="button" class="check-btn" onclick="runRetell(${index})">Отправить ИИ на пересказ</button>
    <div id="retellStage"></div>`;
  return shell(index,task,'Практика','practice',body,footer(index,null));
}
async function runRetell(index){
  const input=document.getElementById('retellInput');
  const text=(input.value||'').trim();
  if(!text){ notify('Сначала вставь текст про фотосинтез'); return; }
  const stage=document.getElementById('retellStage');
  stage.innerHTML='<div class="imggen-loading"><div class="spinner"></div>ИИ пересказывает…</div>';
  const prompt='Перескажи своими словами простым языком для школьника следующий текст, в 2-3 предложениях: "'+text+'"';
  let reply;
  try{ reply=await generateText(prompt); }
  catch(err){ stage.innerHTML='<div class="imggen-error">Не получилось: '+esc(err.message)+'</div>'; return; }
  stage.innerHTML=`<div class="msg bot" style="max-width:100%">${esc(reply).replace(/\n/g,'<br>')}</div>`;
  completeTask(index,'✓ Практика засчитана! 🎉');
}

/* ---------- Реестры типов (в конце файла: функции уже объявлены) ---------- */
const RENDERERS={
  read:renderRead, fillchoice:renderFillChoice, quiz:renderQuiz,
  truefalse:renderTrueFalse, match:renderMatch, order:renderOrder,
  sort:renderSort, practice:renderPractice,
  path:renderPath, imagegen3:renderImageGen3, imagegen1:renderImageGen1,
  alicecheck:renderAliceCheck, voiceguess:renderVoiceGuess,
  wordcheck:renderWordCheck, trueFalseAI:renderTrueFalseAI, retell:renderRetell
};
const CHECKERS={
  fillchoice:checkFillChoice, quiz:checkQuiz, truefalse:checkBinary,
  sort:checkBinary, order:checkOrder, path:checkOrder,
  alicecheck:checkAliceCheck
  /* practice, imagegen*, voiceguess, wordcheck, trueFalseAI, retell —
     завершаются изнутри своего рендера, не через общую кнопку "Проверить" */
};
const AFTER={ order:drawOrder, path:drawOrder, voiceguess:drawVoiceRound };
