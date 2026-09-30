/* ===== Freebies AI Training — клиентская обёртка API =====
   Ключи API НИКОГДА не хранятся здесь — весь риск на сервере
   в файле /api/api.js (Vercel Serverless Function). Отсюда мы
   просто дёргаем ?action=... и получаем готовый ответ.

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

const AGNES_TEXT_MODEL = 'agnes'; // модель Agnes для генерации текста

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

/* ---------- Генерация текста (чат) через OpenRouter → Agnes ---------- */
async function generateText(userMessage, systemPrompt){
  const messages = [];
  if(systemPrompt) messages.push({ role:'system', content: systemPrompt });
  messages.push({ role:'user', content: userMessage });

  const data = await apiCall('openrouter', {
    model: AGNES_TEXT_MODEL,
    messages,
    max_tokens: 700
  });

  const text = data?.choices?.[0]?.message?.content;
  if(!text) throw new Error('Пустой ответ от ИИ');
  return text.trim();
}

/* ---------- Генерация картинки через Agnes ---------- */
async function generateImage(prompt, size){
  const data = await apiCall('agnes-image', {
    prompt,
    size: size || '1024x1024'
  });
  if(!data.url) throw new Error('Изображение не сгенерировано');
  return data.url;
}
