/* ===== Freebies AI Training — общая логика =====
   Прогресс хранится в localStorage. Позже это же место можно
   заменить на запрос к api/api.js, когда появится сервер/аккаунты.
*/

const TOTAL_LESSONS = 5;

/* ---------- Тост-уведомления ---------- */
function notify(msg){
  const t=document.getElementById('toast');
  if(!t) return;
  t.textContent=msg;
  t.classList.add('show');
  clearTimeout(window.tt);
  window.tt=setTimeout(()=>t.classList.remove('show'),2200);
}

/* ---------- Работа с прогрессом (localStorage) ---------- */
function getProgress(){
  try{ return JSON.parse(localStorage.getItem('fat_progress')||'{}'); }
  catch(e){ return {}; }
}
function saveProgress(p){
  localStorage.setItem('fat_progress', JSON.stringify(p));
}
function markTaskDone(lessonId, taskIndex){
  const p = getProgress();
  if(!p[lessonId]) p[lessonId] = [];
  if(!p[lessonId].includes(taskIndex)) p[lessonId].push(taskIndex);
  saveProgress(p);
}
function getDoneTasks(lessonId){
  return getProgress()[lessonId] || [];
}
function isLessonComplete(lessonId, totalTasks){
  return getDoneTasks(lessonId).length >= totalTasks;
}

/* ---------- Главная страница: рендер карточек ----------
   Все уроки кликабельны — блокировки по порядку больше нет,
   ученик сам выбирает, с чего начать. */
function renderLessonGrid(){
  const grid = document.getElementById('lessonGrid');
  if(!grid) return;
  fetch('lessons.json').then(r=>r.json()).then(data=>{
    let completedCount = 0;
    let html = '';

    for(let id=1; id<=TOTAL_LESSONS; id++){
      const lid = String(id);
      const lesson = data[lid];
      if(!lesson) continue;
      const total = lesson.tasks.length;
      const done = getDoneTasks(lid).length;
      const pct = Math.round((done/total)*100);
      const complete = isLessonComplete(lid, total);
      if(complete) completedCount++;

      const statusLabel = complete ? '✓ Пройден' : (done>0 ? 'В процессе' : 'Начать');
      const statusClass = complete ? 'done' : '';
      const cardClass = complete ? 'done' : '';

      html += `
      <article class="lesson-card ${cardClass}" onclick="location.href='urok${lid}.html'">
        <div class="card-cover ${lesson.cover}">
          <span class="lesson-number">УРОК ${lid}</span>
          <span class="status ${statusClass}">${statusLabel}</span>
          <div class="illustration">${lesson.icon}</div>
        </div>
        <div class="card-body">
          <h2>${lesson.title}</h2>
          <div class="topic">${lesson.topic}</div>
          <div class="card-bottom">
            <div class="ring" style="--progress:${pct*3.6}deg"><b>${pct}%</b></div>
            <div class="card-meta">${done} из ${total}<br><strong>заданий пройдено</strong></div>
            <div class="open-arrow">→</div>
          </div>
        </div>
      </article>`;
    }
    grid.innerHTML = html;

    const overallPct = Math.round((completedCount/TOTAL_LESSONS)*100);
    const ring = document.getElementById('overallRing');
    const pctLabel = document.getElementById('overallPct');
    const textLabel = document.getElementById('overallText');
    if(ring){ ring.style.setProperty('--pct', overallPct+'%'); }
    if(pctLabel){ pctLabel.textContent = overallPct+'%'; }
    if(textLabel){ textLabel.textContent = completedCount+' из '+TOTAL_LESSONS; }
  });
}

/* ==========================================================
   Страница урока: задания показываются ПО ОДНОМУ.
   currentStep — какое задание сейчас видно (можно листать
   назад к уже пройденным, вперёд — только после выполнения
   текущего).
   ========================================================== */
let _lessonData = null;
let _lessonId = null;
let _currentStep = 0;

function renderLessonPage(lessonId){
  _lessonId = lessonId;
  fetch('lessons.json').then(r=>r.json()).then(data=>{
    _lessonData = data[String(lessonId)];
    if(!_lessonData){ notify('Урок не найден'); return; }

    document.getElementById('lessonTopic').textContent = _lessonData.topic;
    document.getElementById('lessonTitle').textContent = _lessonData.title;
    document.title = 'Урок ' + lessonId + ' — ' + _lessonData.title;

    // начинаем с первого ещё не пройденного задания
    const done = getDoneTasks(lessonId);
    let startStep = _lessonData.tasks.findIndex((_, i)=>!done.includes(i));
    if(startStep === -1) startStep = _lessonData.tasks.length; // всё пройдено → экран завершения
    _currentStep = startStep;

    renderStepTrack();
    renderCurrentStep();
  });
}

function renderStepTrack(){
  const track = document.getElementById('stepTrack');
  const label = document.getElementById('stepLabel');
  if(!track) return;
  const done = getDoneTasks(_lessonId);
  let html = '';
  _lessonData.tasks.forEach((_, i)=>{
    const cls = done.includes(i) ? 'done' : (i===_currentStep ? 'current' : '');
    html += `<div class="step-dot ${cls}" onclick="goToStep(${i})"><i></i></div>`;
  });
  track.innerHTML = html;

  if(_currentStep >= _lessonData.tasks.length){
    label.textContent = 'Урок завершён 🎉';
  } else {
    label.textContent = `Шаг ${_currentStep+1} из ${_lessonData.tasks.length}`;
  }
}

// переход по шагам: назад — всегда можно; вперёд — только на уже пройденные
function goToStep(index){
  const done = getDoneTasks(_lessonId);
  if(index <= _currentStep || done.includes(index)){
    _currentStep = index;
    renderStepTrack();
    renderCurrentStep();
  } else {
    notify('Сначала выполни текущее задание');
  }
}

function renderCurrentStep(){
  const container = document.getElementById('tasksContainer');
  if(!container) return;

  // все задания пройдены → экран завершения урока
  if(_currentStep >= _lessonData.tasks.length){
    container.innerHTML = renderCompleteScreen();
    return;
  }

  const task = _lessonData.tasks[_currentStep];
  const index = _currentStep;
  const done = getDoneTasks(_lessonId).includes(index);
  const numClass = done ? 'done' : '';
  const numContent = done ? '✓' : (index+1);
  let html = '';

  if(task.type === 'read'){
    html = `
    <div class="task">
      <div class="task-head">
        <div class="task-num ${numClass}">${numContent}</div>
        <div class="task-title">${task.title}</div>
        <div class="task-tag">Теория</div>
      </div>
      <div class="task-body">${task.text}</div>
      <button class="check-btn" onclick="completeRead(${index})">Понятно, дальше →</button>
    </div>`;
  }
  else if(task.type === 'fillblank'){
    let textHtml = task.text;
    task.blanks.forEach((_, bi)=>{
      textHtml = textHtml.replace('{'+bi+'}', `<input type="text" class="fill-blank" id="blank-${bi}" ${done?'disabled':''}>`);
    });
    html = `
    <div class="task">
      <div class="task-head">
        <div class="task-num ${numClass}">${numContent}</div>
        <div class="task-title">${task.title}</div>
        <div class="task-tag">Задание</div>
      </div>
      <div class="task-body"><p>${textHtml}</p></div>
      ${done
        ? `<button class="check-btn" onclick="goToStep(${index+1})">Дальше →</button>`
        : `<button class="check-btn" onclick="checkBlanks(${index})">Проверить</button>
           <div class="task-feedback" id="feedback-box"></div>`}
    </div>`;
  }
  else if(task.type === 'practice'){
    html = `
    <div class="task">
      <div class="task-head">
        <div class="task-num ${numClass}">${numContent}</div>
        <div class="task-title">${task.title}</div>
        <div class="task-tag practice">Практика</div>
      </div>
      <div class="task-body">
        <p><b>Задание:</b> ${task.prompt}</p>
        <div class="practice-box">
          <textarea id="practice-input" placeholder="Вставь сюда ответ ИИ или напиши, что получилось..." ${done?'disabled':''}></textarea>
          <div class="practice-hint">${task.hint}</div>
        </div>
      </div>
      ${done
        ? `<button class="check-btn" onclick="goToStep(${index+1})">Дальше →</button>`
        : `<button class="check-btn" onclick="completePractice(${index})">Готово</button>`}
    </div>`;
  }

  container.innerHTML = html;
}

function renderCompleteScreen(){
  const nextId = Number(_lessonId) + 1;
  const hasNext = nextId <= TOTAL_LESSONS;
  return `
  <div class="lesson-complete">
    <div class="big-emoji">🎉</div>
    <h2>Урок пройден!</h2>
    <p>Отличная работа — ты закрыл все задания этого урока.</p>
    <div class="complete-actions">
      <button class="check-btn" onclick="location.href='main.html'">К списку уроков</button>
      ${hasNext ? `<button class="check-btn" onclick="location.href='urok${nextId}.html'">Следующий урок →</button>` : ''}
    </div>
  </div>`;
}

/* ---------- Обработка ответов ---------- */
function completeRead(index){
  markTaskDone(_lessonId, index);
  goToStep(index+1);
  renderStepTrack();
}

function checkBlanks(index){
  const task = _lessonData.tasks[index];
  let allCorrect = true;
  task.blanks.forEach((answer, bi)=>{
    const input = document.getElementById(`blank-${bi}`);
    const userVal = (input.value||'').trim().toLowerCase();
    const correctVal = answer.trim().toLowerCase();
    if(userVal === correctVal){
      input.classList.add('correct'); input.classList.remove('wrong');
    } else {
      input.classList.add('wrong'); input.classList.remove('correct');
      allCorrect = false;
    }
  });
  const feedback = document.getElementById('feedback-box');
  feedback.classList.add('show');
  if(allCorrect){
    feedback.textContent = '✓ Всё верно!';
    feedback.classList.add('ok'); feedback.classList.remove('no');
    markTaskDone(_lessonId, index);
    setTimeout(()=>{ goToStep(index+1); renderStepTrack(); }, 700);
  } else {
    feedback.textContent = 'Не совсем — попробуй ещё раз';
    feedback.classList.add('no'); feedback.classList.remove('ok');
  }
}

function completePractice(index){
  const textarea = document.getElementById('practice-input');
  if(!textarea.value.trim()){
    notify('Сначала впиши, что получилось');
    return;
  }
  markTaskDone(_lessonId, index);
  goToStep(index+1);
  renderStepTrack();
  notify('Практика засчитана! 🎉');
}
