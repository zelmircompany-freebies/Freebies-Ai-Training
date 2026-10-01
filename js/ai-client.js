/* ===== Freebies AI Training — клиентская обёртка API =====
   Ключи API НИКОГДА не хранятся здесь — весь риск на сервере
   в файле /api/api.js (Vercel Serverless Function). Отсюда мы
   просто дёргаем ?action=... и получаем готовый ответ.

   Текст идёт через action=agnes-text (модель agnes-2.5-pro),
   картинки — через action=agnes-image (agnes-image-2.5-flash).
   Оба route бьют напрямую в Agnes AI (apihub.agnes-ai.com),
   без OpenRouter.

   Если сайт открыт не с самого Vercel-домена (например, локально
   через file:// или на другом хостинге), запросы можно направить
   на боевой домен явно — см. API_BASE ниже.
*/

const API_BASE = (function(){
  // Если страница уже открыта на самом Vercel-проекте — используем
  // относительный путь. Иначе бьём напрямую в боевой домен, чтобы
  // сайт мог работать и с локального файла, и с любого другого хостинга.
  const isVercelHost = /vercel\.app$|freebies-ai-training/i.test(location.hostname);
  return isVercelHost ? '' : 'https://freebies-ai-training.vercel.app';
})();

async function apiCall(action, body, method){
  method = method || 'POST';
  let url = API_BASE + '/api/api.js?action=' + encodeURIComponent(action);
  const opts = { method, headers: {} };
  if(method === 'POST'){
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body || {});
  } else if(body){
    // GET: параметры уходят в query string
    const params = new URLSearchParams(body);
    url += '&' + params.toString();
  }
  const res = await fetch(url, opts);
  const data = await res.json().catch(()=>({}));
  if(!res.ok){
    throw new Error(data.error || ('Ошибка запроса: ' + res.status));
  }
  return data;
}

/* ---------- Генерация текста (чат) напрямую через Agnes 2.5 Pro ---------- */
async function generateText(userMessage, systemPrompt){
  const messages = [];
  if(systemPrompt) messages.push({ role:'system', content: systemPrompt });
  messages.push({ role:'user', content: userMessage });

  const data = await apiCall('agnes-text', {
    messages,
    max_tokens: 700
  });

  const text = data?.choices?.[0]?.message?.content;
  if(!text) throw new Error('Пустой ответ от ИИ');
  return text.trim();
}

/* ---------- Генерация картинки через Agnes Image 2.5 Flash ---------- */
async function generateImage(prompt, size){
  const data = await apiCall('agnes-image', {
    prompt,
    size: size || '1024x1024'
  });
  if(!data.url) throw new Error('Изображение не сгенерировано');
  return data.url;
}
