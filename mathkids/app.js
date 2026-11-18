/* ============================================================
   Math Kids Mini App — player + quiz logic
   Telegram integration: expand, theme (auto CSS vars from
   telegram-web-app.js), BackButton, HapticFeedback,
   CloudStorage (with localStorage mirror).
   ============================================================ */
'use strict';

/* ---------- Telegram bridge ---------- */
const tg = (window.Telegram && window.Telegram.WebApp) ? window.Telegram.WebApp : null;

function haptic(kind) {
  if (!tg || !tg.HapticFeedback) return;
  try {
    if (kind === 'success') tg.HapticFeedback.notificationOccurred('success');
    else if (kind === 'error') tg.HapticFeedback.notificationOccurred('error');
    else tg.HapticFeedback.selectionChanged();
  } catch (e) { /* haptics are best-effort */ }
}

/* ---------- DOM ---------- */
const $ = (id) => document.getElementById(id);
const video = $('video');
const els = {
  screenTopics: $('screen-topics'),
  screenPlayer: $('screen-player'),
  topicList: $('topic-list'),
  totalStars: $('total-stars'),
  playerTitle: $('player-title'),
  playerStars: $('player-stars'),
  progressBar: $('progress-bar'),
  btnBack: $('btn-back'),
  tapPlay: $('tap-play'),
  btnTapPlay: $('btn-tap-play'),
  loading: $('loading'),
  quiz: $('quiz'),
  quizHalo: $('quiz-halo'),
  quizProgress: $('quiz-progress'),
  quizQuestion: $('quiz-question'),
  quizOptions: $('quiz-options'),
  quizHint: $('quiz-hint'),
  btnContinue: $('btn-continue'),
  done: $('done'),
  doneStars: $('done-stars'),
  doneBest: $('done-best'),
  btnReplay: $('btn-replay'),
  btnToTopics: $('btn-totopics'),
  errorBanner: $('error-banner'),
};

/* ---------- progress store ---------- */
const LS_KEY = 'tma_mathquiz_progress_v1';
const CS_KEY = 'tma_mathquiz_progress_v1';

let progress = loadProgressLocal();

function emptyProgress() { return { topics: {}, totalStars: 0 }; }

function loadProgressLocal() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    const p = raw ? JSON.parse(raw) : null;
    if (p && p.topics && typeof p.topics === 'object') return p;
  } catch (e) { /* corrupted -> reset */ }
  return emptyProgress();
}

function topicRec(id) {
  if (!progress.topics[id]) progress.topics[id] = { bestStars: 0, completed: false };
  return progress.topics[id];
}

function recalcTotal() {
  let s = 0;
  Object.values(progress.topics).forEach((r) => { s += r.bestStars || 0; });
  progress.totalStars = s;
}

function saveProgress() {
  recalcTotal();
  try { localStorage.setItem(LS_KEY, JSON.stringify(progress)); } catch (e) { /* private mode */ }
  cloudSave();
}

function cloudSave() {
  if (!tg || !tg.CloudStorage || !tg.CloudStorage.setItem) return;
  try {
    const r = tg.CloudStorage.setItem(CS_KEY, JSON.stringify(progress));
    if (r && typeof r.catch === 'function') r.catch(() => {});
  } catch (e) { /* ignore */ }
}

function cloudLoad() {
  return new Promise((resolve) => {
    if (!tg || !tg.CloudStorage || !tg.CloudStorage.getItem) return resolve(null);
    let settled = false;
    const done = (v) => { if (!settled) { settled = true; resolve(v); } };
    try {
      const r = tg.CloudStorage.getItem(CS_KEY, (err, value) => done(err ? null : value));
      if (r && typeof r.then === 'function') r.then((v) => done(v)).catch(() => done(null));
      setTimeout(() => done(null), 3000); // don't block UI on a slow cloud
    } catch (e) { done(null); }
  });
}

function mergeProgress(remote) {
  if (!remote || !remote.topics) return;
  Object.keys(remote.topics).forEach((id) => {
    const r = remote.topics[id];
    if (!r) return;
    const local = topicRec(id);
    local.bestStars = Math.max(local.bestStars || 0, r.bestStars || 0);
    local.completed = !!(local.completed || r.completed);
  });
}

function starBar(n, total) {
  return '★'.repeat(n) + '☆'.repeat(Math.max(0, total - n));
}

/* ---------- content validation ---------- */
function validateContent(list) {
  const errs = [];
  if (!Array.isArray(list) || list.length === 0) return ['манифест пуст или не массив'];
  const ids = new Set();
  list.forEach((topic, i) => {
    const id = topic.topicId || ('#' + i);
    if (!topic.topicId) errs.push(`${id}: нет topicId`);
    else if (ids.has(topic.topicId)) errs.push(`${id}: дублирующийся topicId`);
    else ids.add(topic.topicId);
    if (!topic.title) errs.push(`${id}: нет title`);
    if (!topic.videoUrl) errs.push(`${id}: нет videoUrl`);
    if (!Array.isArray(topic.checkpoints) || topic.checkpoints.length === 0) {
      errs.push(`${id}: checkpoints отсутствуют`);
      return;
    }
    topic.checkpoints.forEach((cp, j) => {
      if (typeof cp.t !== 'number' || cp.t < 0 || !isFinite(cp.t)) errs.push(`${id} cp[${j}]: t не число`);
      if (typeof cp.question !== 'string' || !cp.question.trim()) errs.push(`${id} cp[${j}]: нет question`);
      if (!Array.isArray(cp.options) || cp.options.length < 2 || cp.options.length > 4)
        errs.push(`${id} cp[${j}]: options должно быть 2–4 (сейчас ${Array.isArray(cp.options) ? cp.options.length : 'нет'})`);
      if (!Number.isInteger(cp.correctIndex) || !Array.isArray(cp.options) ||
          cp.correctIndex < 0 || cp.correctIndex >= cp.options.length)
        errs.push(`${id} cp[${j}]: correctIndex вне диапазона options`);
      if (typeof cp.hint !== 'string' || !cp.hint.trim()) errs.push(`${id} cp[${j}]: нет hint`);
    });
    for (let a = 1; a < topic.checkpoints.length; a++) {
      if (topic.checkpoints[a].t < topic.checkpoints[a - 1].t)
        errs.push(`${id}: контрольные точки не отсортированы по t`);
    }
  });
  return errs;
}

/* ---------- viewport / safe-area ---------- */
function syncViewport() {
  let h;
  if (tg && typeof tg.viewportStableHeight === 'number' && tg.viewportStableHeight > 10) {
    h = tg.viewportStableHeight;
  } else {
    h = (window.visualViewport ? window.visualViewport.height : window.innerHeight);
  }
  document.documentElement.style.setProperty('--app-h', h + 'px');
}

function syncSafeArea() {
  let top = 0, bottom = 0;
  try {
    if (tg && tg.contentSafeAreaInset) {
      top = tg.contentSafeAreaInset.top || 0;
      bottom = tg.contentSafeAreaInset.bottom || 0;
    }
  } catch (e) { /* older Bot API */ }
  const s = document.documentElement.style;
  s.setProperty('--csa-top', top + 'px');
  s.setProperty('--csa-bottom', bottom + 'px');
}

/* ---------- screens ---------- */
function showScreen(name) {
  els.screenTopics.classList.toggle('hidden', name !== 'topics');
  els.screenPlayer.classList.toggle('hidden', name !== 'player');
  window.scrollTo(0, 0);
}

/* ---------- topics list ---------- */
function renderTopics() {
  els.topicList.innerHTML = '';
  CONTENT.forEach((topic, i) => {
    const rec = progress.topics[topic.topicId] || { bestStars: 0, completed: false };
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'topic-card';
    const img = document.createElement('img');
    img.className = 'topic-thumb';
    img.src = topic.poster || '';
    img.alt = '';
    const info = document.createElement('div');
    info.className = 'topic-info';
    const title = document.createElement('p');
    title.className = 'topic-title';
    title.textContent = topic.title;
    const meta = document.createElement('div');
    meta.className = 'topic-meta';
    const stars = document.createElement('span');
    stars.className = 'topic-stars';
    stars.textContent = starBar(rec.bestStars, topic.checkpoints.length);
    const cnt = document.createElement('span');
    cnt.textContent = `вопросов: ${topic.checkpoints.length}`;
    meta.append(stars, cnt);
    if (rec.completed) {
      const chip = document.createElement('span');
      chip.className = 'topic-done-chip';
      chip.textContent = '✓ пройдено';
      meta.append(chip);
    }
    info.append(title, meta);
    btn.append(img, info);
    btn.addEventListener('click', () => openTopic(i));
    li.append(btn);
    els.topicList.append(li);
  });
  els.totalStars.textContent = progress.totalStars;
}

/* ---------- player ---------- */
const state = {
  topicIndex: -1,
  topic: null,
  fired: new Set(),
  runStars: 0,
  quizOpen: false,
  answered: false,
  finished: false,
  raf: 0,
};

function updatePlayerStars() {
  els.playerStars.textContent = `⭐ ${state.runStars}/${state.topic.checkpoints.length}`;
}

function openTopic(i) {
  const topic = CONTENT[i];
  state.topicIndex = i;
  state.topic = topic;
  state.fired = new Set();
  state.runStars = 0;
  state.quizOpen = false;
  state.answered = false;
  state.finished = false;

  els.playerTitle.textContent = topic.title;
  updatePlayerStars();
  els.progressBar.style.width = '0%';
  els.quiz.classList.add('hidden');
  els.done.classList.add('hidden');
  els.tapPlay.classList.add('hidden');
  els.loading.classList.remove('hidden');

  showScreen('player');
  video.src = topic.videoUrl;
  video.load();
  try { tg && tg.BackButton && tg.BackButton.show(); } catch (e) {}

  const p = video.play();
  if (p && p.catch) p.catch(() => {
    // autoplay blocked -> require an explicit tap
    els.loading.classList.add('hidden');
    els.tapPlay.classList.remove('hidden');
  });
}

function closePlayer() {
  cancelAnimationFrame(state.raf);
  video.pause();
  video.removeAttribute('src');
  video.load();
  try { tg && tg.BackButton && tg.BackButton.hide(); } catch (e) {}
  showScreen('topics');
  renderTopics();
}

function tick() {
  if (state.topic && !els.screenPlayer.classList.contains('hidden')) {
    if (!video.paused && !state.quizOpen && !state.finished && video.duration > 0) {
      const cps = state.topic.checkpoints;
      for (let k = 0; k < cps.length; k++) {
        if (state.fired.has(k)) continue;
        if (video.currentTime >= cps[k].t - 0.05) { fireQuiz(k); break; }
      }
      els.progressBar.style.width =
        Math.min(100, (100 * video.currentTime) / video.duration) + '%';
    }
    state.raf = requestAnimationFrame(tick);
  }
}

function fireQuiz(k) {
  state.fired.add(k);
  state.quizOpen = true;
  state.answered = false;
  video.pause();
  haptic('tap');

  const cp = state.topic.checkpoints[k];
  els.quizHalo.className = 'quiz-halo';
  els.quizProgress.textContent = `Вопрос ${k + 1} из ${state.topic.checkpoints.length}`;
  els.quizQuestion.textContent = cp.question;
  els.quizHint.className = 'quiz-hint hidden';
  els.quizHint.textContent = '';
  els.btnContinue.classList.add('hidden');

  els.quizOptions.classList.remove('locked');
  els.quizOptions.innerHTML = '';
  cp.options.forEach((opt, idx) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'quiz-option';
    b.textContent = opt;
    b.addEventListener('click', () => answer(cp, idx, b));
    els.quizOptions.append(b);
  });

  els.quiz.classList.remove('hidden');
}

function answer(cp, idx, btn) {
  if (state.answered) return;
  state.answered = true;
  const ok = idx === cp.correctIndex;
  const buttons = Array.from(els.quizOptions.children);

  buttons.forEach((b, i) => {
    if (i === idx) b.classList.add(ok ? 'correct' : 'wrong');
    else if (i === cp.correctIndex && !ok) b.classList.add('correct');
    else b.classList.add('dim');
  });
  els.quizOptions.classList.add('locked');

  els.quizHint.textContent = cp.hint;
  els.quizHint.className = 'quiz-hint ' + (ok ? 'ok' : 'bad');

  const halo = els.quizHalo;
  halo.className = 'quiz-halo';           // restart animation
  void halo.offsetWidth;
  halo.className = 'quiz-halo ' + (ok ? 'ok' : 'bad');

  if (ok) {
    state.runStars += 1;
    updatePlayerStars();
    haptic('success');
  } else {
    haptic('error');
  }

  els.btnContinue.classList.remove('hidden');
}

function resumeAfterQuiz() {
  els.quiz.classList.add('hidden');
  state.quizOpen = false;
  state.answered = false;
  video.play().catch(() => {
    els.tapPlay.classList.remove('hidden');
  });
}

function onVideoEnded() {
  if (state.finished) return;
  state.finished = true;
  cancelAnimationFrame(state.raf);
  const rec = topicRec(state.topic.topicId);
  rec.bestStars = Math.max(rec.bestStars || 0, state.runStars);
  rec.completed = true;
  saveProgress();
  haptic('success');

  els.doneStars.textContent = starBar(state.runStars, state.topic.checkpoints.length);
  els.doneBest.textContent = rec.bestStars > state.runStars
    ? `Лучший результат: ${rec.bestStars} из ${state.topic.checkpoints.length}`
    : 'Отличный результат!';
  els.done.classList.remove('hidden');
}

/* ---------- init ---------- */
function initTelegram() {
  if (!tg) return;
  try {
    tg.ready();
    tg.expand();
    if (typeof tg.disableVerticalSwipes === 'function') tg.disableVerticalSwipes();
    if (typeof tg.requestFullscreen === 'function') tg.requestFullscreen();
    if (typeof tg.setHeaderColor === 'function') {
      try { tg.setHeaderColor('secondary_bg_color'); } catch (e) {}
    }
    tg.onEvent('viewportChanged', () => { syncViewport(); syncSafeArea(); });
    tg.onEvent('backButtonClicked', () => {
      if (!els.screenPlayer.classList.contains('hidden')) closePlayer();
    });
    tg.onEvent('themeChanged', () => { syncSafeArea(); });
  } catch (e) { /* plain browser */ }
}

function showError(msg) {
  els.errorBanner.textContent = msg;
  els.errorBanner.classList.remove('hidden');
  setTimeout(() => els.errorBanner.classList.add('hidden'), 12000);
}

function start() {
  const errs = validateContent(window.CONTENT);
  if (errs.length) {
    showError('Ошибка манифеста контента: ' + errs.slice(0, 4).join('; '));
    window.CONTENT = [];
  }
  initTelegram();
  syncViewport();
  syncSafeArea();
  renderTopics();
  showScreen('topics');
  state.raf = requestAnimationFrame(tick);

  // video events
  video.addEventListener('playing', () => {
    els.loading.classList.add('hidden');
    els.tapPlay.classList.add('hidden');
  });
  video.addEventListener('waiting', () => els.loading.classList.remove('hidden'));
  video.addEventListener('timeupdate', () => {
    // fallback in case rAF is throttled
    if (!video.paused && !state.quizOpen && !state.finished && state.topic) {
      const cps = state.topic.checkpoints;
      for (let k = 0; k < cps.length; k++) {
        if (state.fired.has(k)) continue;
        if (video.currentTime >= cps[k].t - 0.05) { fireQuiz(k); break; }
      }
    }
  });
  video.addEventListener('ended', onVideoEnded);
  video.addEventListener('error', () => {
    els.loading.classList.add('hidden');
    showError('Не удалось загрузить видео. Проверь videoUrl и доступность файла.');
  });

  // UI events
  els.btnBack.addEventListener('click', closePlayer);
  els.btnTapPlay.addEventListener('click', () => {
    els.tapPlay.classList.add('hidden');
    video.play().catch(() => els.tapPlay.classList.remove('hidden'));
  });
  els.btnContinue.addEventListener('click', resumeAfterQuiz);
  els.btnReplay.addEventListener('click', () => openTopic(state.topicIndex));
  els.btnToTopics.addEventListener('click', closePlayer);
  window.addEventListener('resize', syncViewport);
  if (window.visualViewport) visualViewport.addEventListener('resize', syncViewport);

  // cloud progress (merge over local, then persist the merge)
  cloudLoad().then((remote) => {
    if (remote) {
      try {
        mergeProgress(JSON.parse(remote));
        saveProgress();
        renderTopics();
      } catch (e) { /* bad remote payload -> keep local */ }
    }
  });

  // tiny debug/test handle (read-only surface for E2E checks)
  window.APP = { state, progress: () => progress, tg: !!tg };
}

document.addEventListener('DOMContentLoaded', start);
