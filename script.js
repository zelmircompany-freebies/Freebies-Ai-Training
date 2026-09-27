/* ===== Freebies AI Training — общая логика =====
   Прогресс хранится в localStorage, чтобы при перезагрузке страницы
   не сбрасывался. Позже это же место можно заменить на запрос к api/api.js,
   когда появится сервер/аккаунты.
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

/* ---------- Работа с прогрессом ---------- */
function getProgress(){
  try{
    return JSON.parse(localStorage.getItem('fat_progress')||'{}');
  }catch(e){ return {}; }
}
function saveProgress(p){
  localStorage.setItem('fat_progress', JSON.stringify(p));
}
// отмечает задание taskIndex урока lessonId как выполненное
function markTaskDone(lessonId, taskIndex){
  const p = getProgress();
  if(!p[lessonId]) p[lessonId] = [];
  if(!p[lessonId].includes(taskIndex)) p[lessonId].push(taskIndex);
  saveProgress(p);
}
function getDoneTasks(lessonId){
  const p = getProgress();
  return p[lessonId] || [];
}
function isLessonComplete(lessonId, totalTasks){
  return getDoneTasks(lessonId).length >= totalTasks;
}
// урок открыт, если это урок 1, либо предыдущий урок пройден полностью
function isLessonUnlocked(lessonId, lessonsData){
  if(Number(lessonId) === 1) return true;
  const prevId = String(Number(lessonId)-1);
  const prevLesson = lessonsData[prevId];
  if(!prevLesson) return true;
  return isLessonComplete(prevId, prevLesson.tasks.length);
}

/* ---------- Главная страница: рендер карточек ---------- */
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
      const unlocked = isLessonUnlocked(lid, data);
      const complete = isLessonComplete(lid, total);
      if(complete) completedCount++;

      const statusLabel = complete ? 'Пройден' : (unlocked ? 'Доступен' : 'Закрыт');
      const statusClass = complete ? 'done' : '';
      const cardClass = unlocked ? '' : 'locked';
      const clickAttr = unlocked ? `onclick="location.href='urok${lid}.html'"` : `onclick="notify('Сначала пройди предыдущий урок')"`;

      html += `
      <article class="lesson-card ${cardClass}" ${clickAttr}>
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

    // общий прогресс-круг вверху страницы
    const overallPct = Math.round((completedCount/TOTAL_LESSONS)*100);
    const ring = document.getElementById('overallRing');
    const pctLabel = document.getElementById('overallPct');
    const textLabel = document.getElementById('overallText');
    if(ring){ ring.style.setProperty('--pct', overallPct+'%'); }
    if(pctLabel){ pctLabel.textContent = overallPct+'%'; }
    if(textLabel){ textLabel.textContent = completedCount+' из '+TOTAL_LESSONS; }
  });
}

/* ---------- Страница урока: рендер заданий ---------- */
function renderLessonPage(lessonId){
  fetch('lessons.json').then(r=>r.json()).then(data=>{
    const lesson = data[String(lessonId)];
    if(!lesson){ notify('Урок не найден'); return; }

    document.getElementById('lessonTopic').textContent = lesson.topic;
    document.getElementById('lessonTitle').textContent = lesson.title;
    document.title = 'Урок ' + lessonId + ' — ' + lesson.title;

    const container = document.getElementById('tasksContainer');
    let html = '';

    lesson.tasks.forEach((task, index)=>{
      const done = getDoneTasks(lessonId).includes(index);
      const numClass = done ? 'done' : '';
      const numContent = done ? '✓' : (index+1);

      if(task.type === 'read'){
        html += `
        <div class="task">
          <div class="task-head">
            <div class="task-num ${numClass}" id="num-${index}">${numContent}</div>
            <div class="task-title">${task.title}</div>
            <div class="task-tag">Теория</div>
          </div>
          <div class="task-body">${task.text}</div>
          ${done ? '' : `<button class="check-btn" onclick="completeRead(${lessonId},${index})">Понятно, дальше →</button>`}
        </div>`;
      }
      else if(task.type === 'fillblank'){
        // Разбиваем текст по {0}, {1}... на инпуты
        let textHtml = task.text;
        task.blanks.forEach((_, bi)=>{
          textHtml = textHtml.replace('{'+bi+'}', `<input type="text" class="fill-blank" id="blank-${index}-${bi}" ${done?'disabled':''}>`);
        });
        html += `
        <div class="task">
          <div class="task-head">
            <div class="task-num ${numClass}" id="num-${index}">${numContent}</div>
            <div class="task-title">${task.title}</div>
            <div class="task-tag">Задание</div>
          </div>
          <div class="task-body"><p>${textHtml}</p></div>
          ${done ? '' : `<button class="check-btn" onclick="checkBlanks(${lessonId},${index})">Проверить</button>
          <div class="task-feedback" id="feedback-${index}"></div>`}
        </div>`;
      }
      else if(task.type === 'practice'){
        html += `
        <div class="task">
          <div class="task-head">
            <div class="task-num ${numClass}" id="num-${index}">${numContent}</div>
            <div class="task-title">${task.title}</div>
            <div class="task-tag practice">Практика</div>
          </div>
          <div class="task-body">
            <p><b>Задание:</b> ${task.prompt}</p>
            <div class="practice-box">
              <textarea id="practice-${index}" placeholder="Вставь сюда ответ ИИ или напиши, что получилось..." ${done?'disabled':''}></textarea>
              <div class="practice-hint">${task.hint}</div>
            </div>
          </div>
          ${done ? '' : `<button class="check-btn" onclick="completePractice(${lessonId},${index})">Готово</button>`}
        </div>`;
      }
      // подставляем сохранённые ответы, если задание уже пройдено
    });

    container.innerHTML = html;
    updateLessonProgressBar(lessonId, lesson.tasks.length);
    setupLessonNav(lessonId, data);
  });
}

/* ---------- Проверка заданий ---------- */
function completeRead(lessonId, taskIndex){
  markTaskDone(lessonId, taskIndex);
  renderLessonPage(lessonId);
  notify('Отлично! Идём дальше');
}

function checkBlanks(lessonId, taskIndex){
  fetch('lessons.json').then(r=>r.json()).then(data=>{
    const task = data[String(lessonId)].tasks[taskIndex];
    let allCorrect = true;
    task.blanks.forEach((answer, bi)=>{
      const input = document.getElementById(`blank-${taskIndex}-${bi}`);
      const userVal = (input.value||'').trim().toLowerCase();
      const correctVal = answer.trim().toLowerCase();
      if(userVal === correctVal){
        input.classList.add('correct');
        input.classList.remove('wrong');
      } else {
        input.classList.add('wrong');
        input.classList.remove('correct');
        allCorrect = false;
      }
    });
    const feedback = document.getElementById(`feedback-${taskIndex}`);
    feedback.classList.add('show');
    if(allCorrect){
      feedback.textContent = '✓ Всё верно!';
      feedback.classList.add('ok'); feedback.classList.remove('no');
      markTaskDone(lessonId, taskIndex);
      setTimeout(()=>renderLessonPage(lessonId), 700);
    } else {
      feedback.textContent = 'Не совсем — попробуй ещё раз';
      feedback.classList.add('no'); feedback.classList.remove('ok');
    }
  });
}

function completePractice(lessonId, taskIndex){
  const textarea = document.getElementById(`practice-${taskIndex}`);
  if(!textarea.value.trim()){
    notify('Сначала впиши, что получилось');
    return;
  }
  markTaskDone(lessonId, taskIndex);
  renderLessonPage(lessonId);
  notify('Практика засчитана! 🎉');
}

/* ---------- Прогресс-бар и навигация урока ---------- */
function updateLessonProgressBar(lessonId, total){
  const done = getDoneTasks(lessonId).length;
  const pct = Math.round((done/total)*100);
  const bar = document.getElementById('lessonProgressFill');
  if(bar) bar.style.setProperty('--w', pct+'%');
}

function setupLessonNav(lessonId, data){
  const prevBtn = document.getElementById('prevLessonBtn');
  const nextBtn = document.getElementById('nextLessonBtn');
  const id = Number(lessonId);

  if(prevBtn){
    if(id > 1){
      prevBtn.disabled = false;
      prevBtn.onclick = ()=> location.href = 'urok'+(id-1)+'.html';
    } else {
      prevBtn.disabled = true;
    }
  }
  if(nextBtn){
    const lesson = data[String(id)];
    const complete = isLessonComplete(id, lesson.tasks.length);
    const nextExists = !!data[String(id+1)];
    if(complete && nextExists){
      nextBtn.disabled = false;
      nextBtn.textContent = 'Следующий урок →';
      nextBtn.onclick = ()=> location.href = 'urok'+(id+1)+'.html';
    } else if(!nextExists && complete){
      nextBtn.disabled = false;
      nextBtn.textContent = 'Все уроки пройдены 🎉';
      nextBtn.onclick = ()=> location.href = 'main.html';
    } else {
      nextBtn.disabled = true;
      nextBtn.textContent = 'Заверши все задания →';
    }
  }
}
