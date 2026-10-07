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

/* ===== Роль пользователя (заглушка авторизации) =====
   Настоящего бэкенда с аккаунтами пока нет — login.html просто
   сохраняет выбранную роль в localStorage. Эта функция применяет
   её на каждой странице: показывает пункт "Конструктор контрольных"
   только учителю, и меняет кнопку "Войти" на имя/роль, если человек
   уже "вошёл". Вызывается в конце каждой HTML-страницы. */
function applyUserRoleToHeader(){
  const loggedIn = localStorage.getItem('fat_logged_in')==='1';
  const role = localStorage.getItem('fat_user_role');
  const name = localStorage.getItem('fat_user_name');

  const constructorLink=document.getElementById('constructorMenuLink');
  if(constructorLink) constructorLink.style.display = (loggedIn && role==='teacher') ? '' : 'none';

  const loginBtn=document.getElementById('loginBtn');
  if(loginBtn && loggedIn){
    const roleLabel = role==='teacher' ? 'Учитель' : 'Ученик';
    loginBtn.textContent = name ? name : roleLabel;
    loginBtn.onclick=null;
    loginBtn.removeAttribute('onclick');
  }

  // Кнопка "Выйти" в гамбургер-меню — видна только залогиненным
  const logoutLink=document.getElementById('logoutMenuLink');
  if(logoutLink) logoutLink.style.display = loggedIn ? '' : 'none';
}

// Сбрасывает заглушку авторизации и возвращает на экран входа.
// Прогресс по урокам и дневной лимит НЕ трогаем — это данные обучения,
// а не данные аккаунта, выходить из них незачем.
function logout(){
  localStorage.removeItem('fat_logged_in');
  localStorage.removeItem('fat_user_role');
  localStorage.removeItem('fat_user_name');
  location.href='login.html';
}
const DAILY_LIMIT_KEY = 'fat_daily_limit_v1';
const DAILY_LIMIT_MAX = 35;

/* ===== Дневной лимит заданий =====
   Каждое выполненное задание (включая повторное прохождение) считается
   в дневной лимит. Счётчик хранится вместе с датой (YYYY-MM-DD по
   локальному времени устройства) и сбрасывается сам, как только
   наступает новый день — никакого отдельного таймера не нужно,
   достаточно сравнивать дату при каждом обращении. */
function todayKey(){
  const d=new Date();
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
}
function getDailyLimitState(){
  let raw;
  try{ raw=JSON.parse(localStorage.getItem(DAILY_LIMIT_KEY)||'null'); }catch(e){ raw=null; }
  const today=todayKey();
  if(!raw || raw.date!==today){
    raw={date:today, count:0};
    localStorage.setItem(DAILY_LIMIT_KEY, JSON.stringify(raw));
  }
  return raw;
}
function getDailyLimitRemaining(){
  return Math.max(0, DAILY_LIMIT_MAX - getDailyLimitState().count);
}
function isDailyLimitReached(){
  return getDailyLimitRemaining()<=0;
}
// увеличивает счётчик на 1 за выполненное задание; возвращает true, если
// лимит ещё не был исчерпан ДО этого вызова (т.е. задание разрешено засчитать)
function consumeDailyLimit(){
  const state=getDailyLimitState();
  if(state.count>=DAILY_LIMIT_MAX) return false;
  state.count++;
  localStorage.setItem(DAILY_LIMIT_KEY, JSON.stringify(state));
  return true;
}
function renderDailyLimitBox(){
  const box=document.getElementById('dailyLimitBox');
  if(!box) return;
  const remaining=getDailyLimitRemaining();
  const used=DAILY_LIMIT_MAX-remaining;
  const pct=Math.round((used/DAILY_LIMIT_MAX)*100);
  box.innerHTML=`
    <div class="daily-limit-row">
      <span class="daily-limit-label">📅 Сегодня выполнено: <b>${used} из ${DAILY_LIMIT_MAX}</b> заданий</span>
      <span class="daily-limit-remaining">${remaining>0 ? 'Осталось: '+remaining : 'Лимит на сегодня исчерпан'}</span>
    </div>
    <div class="daily-limit-bar"><i style="width:${pct}%"></i></div>`;
}

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

/* ---------- Модалка "начать где закончил / с начала" ----------
   Показывается при открытии урока, в котором уже есть прогресс
   (хотя бы одно выполненное задание — частичный или полный).
   Если прогресса нет — урок просто открывается как обычно. */
function initLessonPageWithResumeCheck(){
  const lessonId=getLessonIdFromUrl();
  const done=getDoneTasks(lessonId);
  if(done.length===0){
    // новый урок — модалка не нужна, открываем как обычно
    renderLessonPage(lessonId);
    return;
  }
  // уже есть прогресс — спрашиваем, что делать, не рендеря задания заранее
  _lessonId=lessonId;
  fetch('lessons.json').then(r=>r.json()).then(data=>{
    _lessonData=data[lessonId];
    if(!_lessonData){ renderLessonPage(lessonId); return; }
    document.getElementById('lessonTopic').textContent=_lessonData.topic;
    document.getElementById('lessonTitle').textContent=_lessonData.title;
    document.title='Урок '+lessonId+' — '+_lessonData.title;
    renderLessonSideNav(data);

    const total=_lessonData.tasks.length;
    const complete=isLessonComplete(lessonId,total);
    const text=document.getElementById('resumeModalText');
    if(text){
      text.textContent = complete
        ? 'Ты уже прошёл(а) этот урок полностью. Хочешь посмотреть результат ещё раз или пройти урок заново?'
        : `Ты уже выполнил(а) ${done.length} из ${total} заданий. Хочешь продолжить с того места, где остановился(ась), или начать заново?`;
    }
    const modal=document.getElementById('resumeModal');
    if(modal) modal.style.display='flex';
  });
}
function resumeFromWhereLeftOff(){
  const modal=document.getElementById('resumeModal');
  if(modal) modal.style.display='none';
  _currentStep=firstUndone();
  renderStepTrack();
  renderCurrentStep();
}
function resumeFromStart(){
  const modal=document.getElementById('resumeModal');
  if(modal) modal.style.display='none';
  // Сбрасываем прогресс именно этого урока (не трогая остальные уроки)
  const p=getProgress();
  p[_lessonId]=[];
  saveProgress(p);
  _currentStep=0;
  renderStepTrack();
  renderCurrentStep();
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

// Назад — можно всегда. Вперёд — только до первого невыполненного задания,
// и только если дневной лимит заданий ещё не исчерпан.
function goToStep(index){
  if(index<0) return;
  const done=getDoneTasks(_lessonId);
  const movingForwardToNew = index>_currentStep && !done.includes(index) && index<(_lessonData?_lessonData.tasks.length:0);
  if(movingForwardToNew && isDailyLimitReached()){
    const m=document.getElementById('limitModal');
    if(m) m.style.display='flex';
    return;
  }
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
// Кнопки оформлены картинками (img/provert.png, img/dalshe.png), а не текстом —
// подпись остаётся как alt/aria-label для доступности и как title на наведении.
function footer(index, checkLabel){
  const done=isDone(index);
  const last=index===_lessonData.tasks.length-1;
  const nextAlt=last?'Завершить урок':'Дальше';
  const checkBtn=checkLabel?`<button type="button" class="check-btn img-btn" id="checkBtn" onclick="checkCurrent()" title="${esc(checkLabel)}" aria-label="${esc(checkLabel)}"><img src="img/provert.png" class="no-download" oncontextmenu="return false" draggable="false" alt="${esc(checkLabel)}"></button>`:'';
  return `
  <div class="task-actions">
    ${checkBtn}
    <button type="button" class="check-btn secondary img-btn" id="nextBtn" style="${done?'':'display:none'}" onclick="goToStep(${index+1})" title="${nextAlt}" aria-label="${nextAlt}"><img src="img/dalshe.png" class="no-download" oncontextmenu="return false" draggable="false" alt="${nextAlt}"></button>
  </div>
  <div class="task-feedback" id="feedback-box"></div>`;
}

function showFeedback(ok,msg){
  const fb=document.getElementById('feedback-box');
  if(!fb) return;
  fb.className='task-feedback show '+(ok?'ok':'no');
  fb.innerHTML=msg;
}

// задание выполнено: сохраняем, показываем «Дальше», прячем «Проверить».
// Каждое выполнение (включая повтор уже пройденного) тратит дневной лимит.
function completeTask(index,msg){
  consumeDailyLimit();
  markTaskDone(_lessonId,index);
  showFeedback(true,msg);
  const cb=document.getElementById('checkBtn'); if(cb) cb.style.display='none';
  const nb=document.getElementById('nextBtn'); if(nb) nb.style.display='';
  renderStepTrack();
  showRobot(robotMoodForMistakes(_mistakeCount));
  if(isDailyLimitReached()) showLimitModalSoon();
}
// показываем модалку лимита с небольшой задержкой, чтобы ученик успел
// увидеть фидбек о последнем выполненном задании, прежде чем экран перекроет
function showLimitModalSoon(){
  setTimeout(()=>{
    const m=document.getElementById('limitModal');
    if(m) m.style.display='flex';
  }, 1400);
}

function checkCurrent(){
  const index=_currentStep, task=_lessonData.tasks[index];
  const check=CHECKERS[task.type];
  if(check) check(index,task);
}

/* ==================== Тип: read ==================== */
function renderRead(index,task){
  return shell(index,task,'Теория','',task.text,
    `<div class="task-actions"><button type="button" class="check-btn img-btn" onclick="finishRead(${index})" title="Дальше" aria-label="Дальше"><img src="img/dalshe.png" class="no-download" oncontextmenu="return false" draggable="false" alt="Дальше"></button></div>`);
}
function finishRead(index){
  consumeDailyLimit();
  markTaskDone(_lessonId,index);
  renderStepTrack();
  if(isDailyLimitReached()) showLimitModalSoon();
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
      ${r.answered?`<button type="button" class="check-btn secondary img-btn" style="margin-top:14px" onclick="nextVoiceRound()" title="Дальше" aria-label="Дальше"><img src="img/dalshe.png" class="no-download" oncontextmenu="return false" draggable="false" alt="Дальше"></button>`:''}
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

/* ==========================================================
   Конструктор контрольных работ (constructor.html) — для учителя.
   Учитель задаёт тему + список заданий (текст задания обязателен,
   описание — нет). По кнопке собирается один общий промпт со всеми
   заданиями сразу, уходит в NVIDIA (action=nvidia-text на сервере),
   результат показывается на странице и доступен как .txt для скачивания.
   ========================================================== */

let _crTasks=[]; // [{id, text, description}]
let _crIdSeq=1;
let _crLastResultText=''; // текст последней успешно сгенерированной к/р — нужен для кнопки "доп. вариант"
let _crTopicUsed='';

function initConstructorAccess(){
  const loggedIn = localStorage.getItem('fat_logged_in')==='1';
  const role = localStorage.getItem('fat_user_role');
  const isTeacher = loggedIn && role==='teacher';
  document.getElementById('accessDenied').style.display = isTeacher ? 'none' : '';
  document.getElementById('constructorContent').style.display = isTeacher ? '' : 'none';
  if(isTeacher && _crTasks.length===0){
    addCrTask(); // стартуем с одним пустым заданием, чтобы форма не выглядела пустой
  }
}

function addCrTask(){
  const id=_crIdSeq++;
  _crTasks.push({id, text:'', description:''});
  renderCrTasks();
}
function removeCrTask(id){
  _crTasks=_crTasks.filter(t=>t.id!==id);
  renderCrTasks();
}
function moveCrTask(id, dir){
  const i=_crTasks.findIndex(t=>t.id===id);
  const j=i+dir;
  if(i<0||j<0||j>=_crTasks.length) return;
  [_crTasks[i],_crTasks[j]]=[_crTasks[j],_crTasks[i]];
  renderCrTasks();
}
function updateCrTaskField(id, field, value){
  const t=_crTasks.find(t=>t.id===id);
  if(t) t[field]=value;
}

function renderCrTasks(){
  const list=document.getElementById('crTasksList');
  if(!list) return;
  list.innerHTML=_crTasks.map((t,i)=>`
    <div class="cr-task-card">
      <div class="cr-task-card-head">
        <span class="cr-task-num">${i+1}</span>
        <div class="cr-task-move">
          <button type="button" class="cr-mini-btn" ${i===0?'disabled':''} onclick="moveCrTask(${t.id},-1)" title="Переместить выше">↑</button>
          <button type="button" class="cr-mini-btn" ${i===_crTasks.length-1?'disabled':''} onclick="moveCrTask(${t.id},1)" title="Переместить ниже">↓</button>
        </div>
        <button type="button" class="cr-mini-btn cr-remove-btn" onclick="removeCrTask(${t.id})" title="Удалить задание">✕</button>
      </div>
      <label class="cr-field-label">Задание <span class="cr-required">*</span></label>
      <textarea class="cr-field-input" rows="2" placeholder="Например: реши квадратное уравнение"
        oninput="updateCrTaskField(${t.id},'text',this.value)">${esc(t.text)}</textarea>
      <label class="cr-field-label">Описание (необязательно)</label>
      <textarea class="cr-field-input" rows="2" placeholder="Любые уточнения для ИИ — сложность, формат ответа и т.д."
        oninput="updateCrTaskField(${t.id},'description',this.value)">${esc(t.description)}</textarea>
    </div>
  `).join('');
}

// Служебный разделитель, по которому мы потом режем ответ ИИ на две части:
// текст самой контрольной (для учеников) и правильные ответы (для учителя).
// ИИ видит эту метку в инструкции и обязан вставить её в ответ буквально.
const CR_ANSWER_SPLIT_MARKER = '===ОТВЕТЫ_ДЛЯ_УЧИТЕЛЯ===';

function buildCrPrompt(topic, tasks){
  let prompt = `Ты помогаешь учителю составить контрольную работу на тему: "${topic}".\n\n`;
  prompt += `Составь полноценную контрольную работу строго из ${tasks.length} заданий, по одному на каждый пункт ниже. `;
  prompt += `Не добавляй лишние задания и не убирай ни одного. Если для задания нужны условия (числа, текст для анализа и т.д.) — придумай их сам, подходящие под описание.\n\n`;
  prompt += `ВАЖНЫЕ ПРАВИЛА ОФОРМЛЕНИЯ — это будет сохранено в обычный текстовый .txt файл, Markdown-разметка там не отображается, поэтому:\n`;
  prompt += `— НЕ используй символы #, *, ** нигде в ответе;\n`;
  prompt += `— НЕ используй строки из дефисов (---) как разделители;\n`;
  prompt += `— если нужно выделить слово — пиши его ПРОПИСНЫМИ БУКВАМИ, а не звёздочками;\n`;
  prompt += `— название контрольной работы дай первой строкой, простым текстом, без решёток и других символов разметки;\n`;
  prompt += `— задания нумеруй обычными числами (1. 2. 3. ...), между заданиями оставляй просто пустую строку, без ---.\n\n`;
  prompt += `Вот задания, которые задал учитель (в скобках — его пояснения для тебя, в сам текст контрольной их включать не нужно):\n`;
  tasks.forEach((t,i)=>{
    prompt += `${i+1}. ${t.text}`;
    if(t.description && t.description.trim()) prompt += ` (пояснение учителя: ${t.description.trim()})`;
    prompt += `\n`;
  });
  prompt += `\nПосле того как напишешь полный текст контрольной работы (без единого намёка на правильные ответы внутри него), `;
  prompt += `поставь на отдельной строке ровно такую метку: ${CR_ANSWER_SPLIT_MARKER}\n`;
  prompt += `И сразу под ней, тоже простым текстом без Markdown, напиши правильные ответы по каждому заданию (например: "Задание 1 — б (2000 год)").`;
  return prompt;
}

/* ---------- Очистка ответа ИИ от Markdown-разметки ----------
   Модель иногда всё равно подставляет #, **, --- несмотря на просьбу
   не делать этого в промпте — поэтому чистим результат программно,
   а не полагаемся только на инструкцию. forHtml=true оставляет **текст**
   как настоящий <b>жирный</b> для показа на экране; forHtml=false
   (для .txt файла) переводит такие слова в ЗАГЛАВНЫЕ БУКВЫ, потому что
   обычный текстовый файл не умеет жирный шрифт. */
function cleanAiFormatting(text, forHtml){
  let out = text;
  // заголовки markdown (# Текст, ## Текст и т.д.) — убираем решётки
  out = out.replace(/^#{1,6}\s*/gm, '');
  // строки-разделители из дефисов/звёздочек/подчёркиваний (---, ***, ___)
  out = out.replace(/^[\s]*[-*_]{3,}[\s]*$/gm, '');
  // схлопываем образовавшиеся пустые строки (больше двух подряд)
  out = out.replace(/\n{3,}/g, '\n\n');
  if(forHtml){
    out = esc(out).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
  } else {
    out = out.replace(/\*\*(.+?)\*\*/g, (m, inner)=>inner.toUpperCase());
    out = out.replace(/\*(.+?)\*/g, '$1'); // одиночные * тоже убираем, просто снимаем разметку
  }
  return out.trim();
}

// Делит сырой ответ ИИ на { studentText, teacherAnswers } по служебной метке.
// Если модель метку не поставила (бывает) — весь текст уходит ученикам,
// а блок с ответами остаётся пустым, чтобы ничего не потерять молча.
function splitCrResponse(raw){
  const idx = raw.indexOf(CR_ANSWER_SPLIT_MARKER);
  if(idx === -1) return { studentText: raw.trim(), teacherAnswers: '' };
  return {
    studentText: raw.slice(0, idx).trim(),
    teacherAnswers: raw.slice(idx + CR_ANSWER_SPLIT_MARKER.length).trim()
  };
}

async function generateControlWork(){
  const topic=(document.getElementById('crTopic').value||'').trim();
  if(!topic){ notify('Укажи тему контрольной работы'); return; }
  const validTasks=_crTasks.filter(t=>t.text && t.text.trim());
  if(validTasks.length===0){ notify('Добавь хотя бы одно задание с текстом'); return; }

  const btn=document.getElementById('crGenerateBtn');
  const resultBox=document.getElementById('crResult');
  btn.disabled=true;
  resultBox.style.display='';
  resultBox.innerHTML=`<div class="imggen-loading"><div class="spinner"></div>ИИ составляет контрольную работу…</div>`;

  const prompt=buildCrPrompt(topic, validTasks);
  try{
    const raw=await generateControlWorkText(prompt);
    _crLastResultText=raw;
    _crTopicUsed=topic;
    renderCrResult([{title:'Вариант 1', raw}]);
    saveCrHistoryEntry(topic, validTasks, [{title:'Вариант 1', raw}]);
  }catch(err){
    resultBox.innerHTML=`<div class="imggen-error">Не получилось сгенерировать: ${esc(err.message)}</div>`;
  }
  btn.disabled=false;
}

async function generateExtraVariant(){
  const resultBox=document.getElementById('crResult');
  const existingVariants=resultBox.querySelectorAll('.cr-variant').length;
  const loadingDiv=document.createElement('div');
  loadingDiv.className='imggen-loading';
  loadingDiv.innerHTML=`<div class="spinner"></div>Генерирую ещё один вариант…`;
  resultBox.insertBefore(loadingDiv, resultBox.querySelector('.cr-result-actions'));

  const validTasks=_crTasks.filter(t=>t.text && t.text.trim());
  const prompt=buildCrPrompt(_crTopicUsed, validTasks) + `\n\nЭто дополнительный, альтернативный вариант той же контрольной — сделай задания на ту же тему, но с другими формулировками и другими условиями/числами, не повторяя первый вариант дословно.`;
  try{
    const raw=await generateControlWorkText(prompt);
    loadingDiv.remove();
    const title='Вариант '+(existingVariants+1);
    appendCrVariant(title, raw);
    appendCrHistoryVariant(title, raw);
  }catch(err){
    loadingDiv.innerHTML=`<div class="imggen-error">Не получилось: ${esc(err.message)}</div>`;
  }
}

function renderCrResult(variants){
  const resultBox=document.getElementById('crResult');
  resultBox.innerHTML=`<div class="cr-variants" id="crVariants"></div>
    <div class="cr-disclaimer">
      ⚠️ Перед тем как раздать контрольную работу ученикам, обязательно проверь задания и ответы на достоверность и корректность — ИИ может допускать ошибки, и ответственность за содержание контрольной остаётся на учителе.
    </div>
    <div class="cr-result-actions">
      <button type="button" class="check-btn secondary" onclick="generateExtraVariant()">+ Сгенерировать ещё один вариант к/р</button>
      <button type="button" class="check-btn cr-leave-btn" onclick="leaveConstructor()">Покинуть конструктор</button>
    </div>`;
  variants.forEach(v=>appendCrVariant(v.title, v.raw));
}

function appendCrVariant(title, raw){
  const container=document.getElementById('crVariants');
  const div=document.createElement('div');
  div.className='cr-variant';

  const { studentText, teacherAnswers } = splitCrResponse(raw);
  const studentClean = cleanAiFormatting(studentText, false);
  const studentHtml = cleanAiFormatting(studentText, true);
  const answersClean = teacherAnswers ? cleanAiFormatting(teacherAnswers, false) : '';

  const fileSafeTopic=(_crTopicUsed||'kontrolnaya').replace(/[^a-zA-Zа-яА-ЯёЁ0-9]+/g,'_').slice(0,40);
  const variantSlug=title.replace(/\s+/g,'_');
  const studentFileName=`${fileSafeTopic}_${variantSlug}.txt`;
  const answersFileName=`${fileSafeTopic}_${variantSlug}_Ответы.txt`;

  div.innerHTML=`
    <div class="cr-variant-head">
      <b>${esc(title)}</b>
      <div class="cr-variant-buttons">
        <button type="button" class="check-btn secondary cr-download-btn" onclick="downloadCrFile(this,'student')">⬇ Скачать к/р (.txt)</button>
        ${answersClean ? `<button type="button" class="check-btn secondary cr-download-btn" onclick="downloadCrFile(this,'answers')">⬇ Скачать ответы (.txt)</button>` : ''}
      </div>
    </div>
    <div class="cr-variant-text">${studentHtml.replace(/\n/g,'<br>')}</div>`;

  div.dataset.studentFile=studentFileName;
  div.dataset.studentText=studentClean;
  div.dataset.answersFile=answersFileName;
  div.dataset.answersText=answersClean;
  container.appendChild(div);
}

// type: 'student' — текст самой контрольной; 'answers' — отдельный файл с ответами
function downloadCrFile(btn, type){
  const variant=btn.closest('.cr-variant');
  const text = type==='answers' ? variant.dataset.answersText : variant.dataset.studentText;
  const fileName = type==='answers' ? variant.dataset.answersFile : variant.dataset.studentFile;
  const blob=new Blob([text], {type:'text/plain;charset=utf-8'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url; a.download=fileName;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

/* ---------- "Покинуть конструктор" — сброс формы и переход на главную ---------- */
function leaveConstructor(){
  _crTasks=[];
  _crIdSeq=1;
  _crLastResultText='';
  _crTopicUsed='';
  location.href='main.html';
}

/* ==========================================================
   История конструктора — каждая сгенерированная контрольная
   сохраняется в localStorage, чтобы учитель мог позже вернуться
   и посмотреть/переделать то, что уже делал. Хранится сырой текст
   (raw, с меткой-разделителем) — чтобы при возврате можно было
   заново применить cleanAiFormatting/splitCrResponse, если логика
   форматирования когда-нибудь изменится.
   ========================================================== */
const CR_HISTORY_KEY='fat_cr_history_v1';

function getCrHistory(){
  try{ return JSON.parse(localStorage.getItem(CR_HISTORY_KEY)||'[]'); }
  catch(e){ return []; }
}
function saveCrHistoryToStorage(history){
  // храним не более 30 последних контрольных, чтобы localStorage не раздувался
  localStorage.setItem(CR_HISTORY_KEY, JSON.stringify(history.slice(-30)));
}
function saveCrHistoryEntry(topic, tasks, variants){
  const history=getCrHistory();
  history.push({
    id: Date.now(),
    topic,
    tasks: tasks.map(t=>({text:t.text, description:t.description})),
    variants: variants.map(v=>({title:v.title, raw:v.raw})),
    createdAt: new Date().toISOString()
  });
  saveCrHistoryToStorage(history);
}
function appendCrHistoryVariant(title, raw){
  const history=getCrHistory();
  const last=history[history.length-1];
  if(last && last.topic===_crTopicUsed){
    last.variants.push({title, raw});
    saveCrHistoryToStorage(history);
  }
}

function renderCrHistoryPanel(){
  const panel=document.getElementById('crHistoryList');
  if(!panel) return;
  const history=getCrHistory().slice().reverse(); // новые сверху
  if(history.length===0){
    panel.innerHTML=`<p class="cr-history-empty">Пока нет сохранённых контрольных — они будут появляться здесь после генерации.</p>`;
    return;
  }
  panel.innerHTML=history.map(entry=>{
    const date=new Date(entry.createdAt);
    const dateLabel=date.toLocaleDateString('ru-RU',{day:'2-digit',month:'2-digit',year:'numeric'})+' '+date.toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'});
    return `
    <div class="cr-history-item">
      <div class="cr-history-item-head">
        <b>${esc(entry.topic)}</b>
        <span class="cr-history-date">${dateLabel}</span>
      </div>
      <div class="cr-history-meta">${entry.tasks.length} заданий · ${entry.variants.length} вариант(ов)</div>
      <button type="button" class="check-btn secondary" onclick="restoreCrHistoryEntry(${entry.id})">Открыть и продолжить</button>
    </div>`;
  }).join('');
}

function restoreCrHistoryEntry(id){
  const history=getCrHistory();
  const entry=history.find(e=>e.id===id);
  if(!entry){ notify('Эта запись истории не найдена'); return; }

  // восстанавливаем форму заданий
  _crTasks=entry.tasks.map(t=>({id:_crIdSeq++, text:t.text, description:t.description}));
  document.getElementById('crTopic').value=entry.topic;
  _crTopicUsed=entry.topic;
  renderCrTasks();

  // восстанавливаем уже сгенерированный результат, если он был
  if(entry.variants && entry.variants.length){
    document.getElementById('crResult').style.display='';
    renderCrResult(entry.variants);
  }

  closeCrHistoryPanel();
  window.scrollTo({top:0, behavior:'smooth'});
  notify('Контрольная восстановлена — можно продолжить редактирование');
}

function openCrHistoryPanel(){
  renderCrHistoryPanel();
  const panel=document.getElementById('crHistoryPanel');
  const overlay=document.getElementById('crHistoryOverlay');
  if(panel) panel.classList.add('open');
  if(overlay) overlay.style.display='block';
}
function closeCrHistoryPanel(){
  const panel=document.getElementById('crHistoryPanel');
  const overlay=document.getElementById('crHistoryOverlay');
  if(panel) panel.classList.remove('open');
  if(overlay) overlay.style.display='none';
}
