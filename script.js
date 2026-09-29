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
      const pct=Math.round((done/total)*100);
      const complete=isLessonComplete(lid,total);
      if(complete) completedCount++;
      const statusLabel=complete?'✓':(done>0?done+'/'+total:'');
      html+=`
      <article class="lesson-card ${lesson.cover} ${complete?'done':''}" onclick="location.href='urok.html?id=${lid}'">
        ${statusLabel?`<span class="status ${complete?'done':''}">${statusLabel}</span>`:'<span></span>'}
        <div class="card-icon-row"><div class="illustration">${lesson.icon}</div></div>
        <div class="card-text">
          <h2>${lesson.title}</h2>
          <span class="lesson-number">Урок ${lid}</span>
          <div class="card-progress-row">
            <div class="mini-ring" style="--progress:${pct*3.6}deg"><b>${pct}%</b></div>
            <div class="card-meta">${done} из ${total}<br>заданий</div>
          </div>
        </div>
      </article>`;
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
  if(_currentStep>=_lessonData.tasks.length){
    container.innerHTML=renderCompleteScreen();
    return;
  }
  const index=_currentStep, task=_lessonData.tasks[index];
  _state={};
  const render=RENDERERS[task.type];
  if(!render){
    container.innerHTML='<div class="task">Неизвестный тип задания: '+esc(task.type)+'</div>';
    return;
  }
  container.innerHTML=render(index,task);
  if(AFTER[task.type]) AFTER[task.type]();
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
  else showFeedback(false,'Не совсем — поменяй красные слова и проверь ещё раз');
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
  else showFeedback(false,'Не совсем — подумай ещё и выбери другой вариант');
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
  else showFeedback(false,'Красные пункты стоят не на своём месте — нажми на них, чтобы вернуть, и попробуй ещё');
}

/* ==================== Тип: practice (интерфейс чата с ИИ) ====================
   Пока без реального API: первое сообщение бота — задание практики,
   ученик печатает промпт как в настоящем чате. Задание засчитывается,
   когда он отправил хотя бы одно сообщение. Когда подключится
   api/api.js, здесь достаточно заменить botReply() на реальный запрос. */
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
    <div class="practice-hint">${task.hint}</div>`;
  return shell(index,task,'Практика','practice',body,footer(index,null));
}

function handleChatKey(e){
  if(e.key==='Enter' && !e.shiftKey){
    e.preventDefault();
    sendChatMessage(_currentStep);
  }
}

function sendChatMessage(index){
  const input=document.getElementById('chatInput');
  const text=(input.value||'').trim();
  if(!text) return;
  const win=document.getElementById('chatWindow');

  win.insertAdjacentHTML('beforeend', `<div class="msg user">${esc(text)}</div>`);
  input.value='';
  win.scrollTop=win.scrollHeight;

  // индикатор "печатает..." — заглушка до подключения реального API
  win.insertAdjacentHTML('beforeend', `<div class="msg bot typing" id="typingIndicator"><span></span><span></span><span></span></div>`);
  win.scrollTop=win.scrollHeight;

  setTimeout(()=>{
    const typing=document.getElementById('typingIndicator');
    if(typing) typing.remove();
    win.insertAdjacentHTML('beforeend', `<div class="msg bot">Пока это демо-чат без настоящего ИИ — но когда он подключится, здесь появится настоящий ответ 🙂</div>`);
    win.scrollTop=win.scrollHeight;
  }, 700);

  _state.sentCount++;
  if(_state.sentCount===1){
    completeTask(index,'✓ Практика засчитана! 🎉');
  }
}

/* ---------- Реестры типов (в конце файла: функции уже объявлены) ---------- */
const RENDERERS={
  read:renderRead, fillchoice:renderFillChoice, quiz:renderQuiz,
  truefalse:renderTrueFalse, match:renderMatch, order:renderOrder,
  sort:renderSort, practice:renderPractice
};
const CHECKERS={
  fillchoice:checkFillChoice, quiz:checkQuiz, truefalse:checkBinary,
  sort:checkBinary, order:checkOrder
  /* practice не проверяется кнопкой — завершается отправкой сообщения в чат */
};
const AFTER={ order:drawOrder };
