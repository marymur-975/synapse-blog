/* ============================================================
   СИНАПС — Engine
   Движок сайта: тема, рендер, поиск, фильтры, избранное,
   комментарии, TOC, прогресс чтения, анимации, тосты.
   Работает без бэкенда и без сети. Хранилище — localStorage
   с безопасным фолбэком в память (для sandbox-окружений).
   ============================================================ */

(() => {
  "use strict";

  /* ---------- Утилиты ---------- */
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const esc = (s) =>
    String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  /* Безопасное хранилище: в sandbox iframe localStorage может бросать исключение */
  const memStore = new Map();
  const store = {
    get(k, def = null) {
      try {
        const v = localStorage.getItem(k);
        return v === null ? def : JSON.parse(v);
      } catch { return memStore.has(k) ? memStore.get(k) : def; }
    },
    set(k, v) {
      try { localStorage.setItem(k, JSON.stringify(v)); }
      catch { memStore.set(k, v); }
    },
  };

  /* ---------- Тема ---------- */
  const THEME_KEY = "synapse_theme";
  function initTheme() {
    const saved = store.get(THEME_KEY);
    // Фирменный стиль СИНАПСа — тёмный; светлый включается переключателем
    const theme = saved || "dark";
    document.documentElement.setAttribute("data-theme", theme);
    syncThemeBtn();
  }
  function toggleTheme() {
    const cur = document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";
    const next = cur === "light" ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", next);
    store.set(THEME_KEY, next);
    syncThemeBtn();
    toast(next === "dark" ? "🌙 Тёмная тема включена" : "☀️ Светлая тема включена");
  }
  function syncThemeBtn() {
    const light = document.documentElement.getAttribute("data-theme") === "light";
    $$("[data-theme-btn]").forEach((b) => (b.textContent = light ? "🌙" : "☀️"));
  }

  /* ---------- Тосты ---------- */
  function toast(msg) {
    let wrap = $(".toast-wrap");
    if (!wrap) {
      wrap = document.createElement("div");
      wrap.className = "toast-wrap";
      document.body.appendChild(wrap);
    }
    const el = document.createElement("div");
    el.className = "toast";
    el.textContent = msg;
    wrap.appendChild(el);
    setTimeout(() => { el.classList.add("out"); setTimeout(() => el.remove(), 320); }, 2600);
  }

  /* ---------- Избранное ---------- */
  const FAV_KEY = "synapse_favs";
  const getFavs = () => store.get(FAV_KEY, []);
  const isFav = (id) => getFavs().includes(id);
  function toggleFav(id, ev) {
    if (ev) { ev.preventDefault(); ev.stopPropagation(); }
    const favs = getFavs();
    const i = favs.indexOf(id);
    if (i >= 0) { favs.splice(i, 1); toast("Убрано из избранного"); }
    else { favs.push(id); toast("💜 Добавлено в избранное"); }
    store.set(FAV_KEY, favs);
    const on = favs.includes(id);
    $$(`[data-fav="${id}"]`).forEach((b) => {
      b.classList.toggle("on", on);
      b.textContent = on ? "♥" : "♡";
      // Страница статьи: кнопка-«таблетка» вокруг иконки
      const pill = b.closest("[data-fav-btn]");
      if (pill) {
        pill.classList.toggle("on", on);
        const label = pill.querySelector("[data-fav-label]");
        if (label) label.textContent = on ? "В избранном" : "В избранное";
      }
    });
  }

  /* ---------- Просмотры ---------- */
  const VIEWS_KEY = "synapse_views";
  function addView(id) {
    const map = store.get(VIEWS_KEY, {});
    if (!map[id]) { map[id] = 0; }
    map[id] += 1;
    store.set(VIEWS_KEY, map);
  }
  function totalViews(a) {
    const map = store.get(VIEWS_KEY, {});
    return a.views + (map[a.id] || 0);
  }
  const fmtViews = (n) => (n >= 1000 ? (n / 1000).toFixed(1).replace(".0", "") + "K" : String(n));

  /* ---------- Форматирование ---------- */
  const MONTHS = ["янв", "фев", "мар", "апр", "мая", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];
  function fmtDate(iso) {
    const d = new Date(iso + "T00:00:00");
    return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
  }
  function readingTime(html) {
    const words = html.replace(/<[^>]+>/g, " ").split(/\s+/).filter(Boolean).length;
    return Math.max(1, Math.round(words / 150));
  }

  /* Раскладка bento: суммы спанов в каждом ряду = 6 (без «сирот» и дыр) */
  function bentoSpans(n) {
    const out = [];
    let row = 0, rem = n;
    while (rem > 0) {
      if (rem === 1) { out.push(6); rem -= 1; }
      else if (rem === 2) { out.push(row % 2 ? 2 : 4, row % 2 ? 4 : 2); rem -= 2; }
      else if (rem === 3) { out.push(2, 2, 2); rem -= 3; }
      else if (rem === 4) { out.push(2, 4); rem -= 2; }
      else if (rem === 5) { out.push(2, 2, 2); rem -= 3; }
      else if (row % 2 === 0) { out.push(4, 2); rem -= 2; }
      else { out.push(2, 2, 2); rem -= 3; }
      row++;
    }
    return out;
  }

  /* ---------- Карточка статьи ---------- */
  function cardHTML(a, opts = {}) {
    const cat = catById(a.category);
    const span = opts.span ? ` span-${opts.span}` : "";
    const title = opts.highlight && opts.q ? highlight(a.title, opts.q) : esc(a.title);
    const excerpt = opts.highlight && opts.q ? highlight(a.excerpt, opts.q) : esc(a.excerpt);
    return `
    <a class="card${span} reveal" href="article.html?id=${a.id}" data-card="${a.id}">
      <div class="card-cover" style="background:${a.gradient}">
        <span class="card-badge" style="background:rgba(0,0,0,0.35)">${cat.emoji} ${cat.name}</span>
        <button class="card-fav ${isFav(a.id) ? "on" : ""}" data-fav="${a.id}" title="В избранное">${isFav(a.id) ? "♥" : "♡"}</button>
        <span class="card-emoji">${a.emoji}</span>
      </div>
      <div class="card-body">
        <div class="card-title">${title}</div>
        <div class="card-excerpt">${excerpt}</div>
        <div class="card-meta">
          <span class="meta-author">
            <span class="avatar" style="background:${a.author.gradient}">${a.author.initials}</span>
            ${esc(a.author.name.split(" ")[0])}
          </span>
          <span class="meta-dot">·</span><span>${fmtDate(a.date)}</span>
          <span class="meta-dot">·</span><span>${readingTime(a.content)} мин</span>
          <span class="meta-dot">·</span><span>👁 ${fmtViews(totalViews(a))}</span>
        </div>
      </div>
    </a>`;
  }

  function highlight(text, q) {
    const safe = esc(text);
    if (!q) return safe;
    const re = new RegExp("(" + q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + ")", "gi");
    return safe.replace(re, "<mark>$1</mark>");
  }

  /* Эффект «прожектора» на карточках */
  function bindSpotlight() {
    $$(".card").forEach((card) => {
      card.addEventListener("pointermove", (e) => {
        const r = card.getBoundingClientRect();
        card.style.setProperty("--mx", `${e.clientX - r.left}px`);
        card.style.setProperty("--my", `${e.clientY - r.top}px`);
      });
    });
  }

  /* ---------- Анимации появления ---------- */
  function initReveal() {
    if (!("IntersectionObserver" in window)) {
      $$(".reveal").forEach((el) => el.classList.add("visible"));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => entries.forEach((en) => { if (en.isIntersecting) { en.target.classList.add("visible"); io.unobserve(en.target); } }),
      { threshold: 0.08 }
    );
    $$(".reveal:not(.visible)").forEach((el) => io.observe(el));
  }

  /* ============================================================
     ГЛАВНАЯ
     ============================================================ */
  function renderHome() {
    const featured = sortedArticles().filter((a) => a.featured).slice(0, 2);
    const latest = sortedArticles().filter((a) => !featured.includes(a)).slice(0, 4);

    // Bento из featured + свежих, ряды заполнены целиком
    const heroGrid = $("#featured-bento");
    if (heroGrid) {
      const items = [...featured, ...latest];
      const spans = bentoSpans(items.length);
      heroGrid.innerHTML = items.map((a, i) => cardHTML(a, { span: spans[i] })).join("");
    }

    // Статы
    const setTxt = (id, v) => { const el = $(id); if (el) el.textContent = v; };
    setTxt("#stat-articles", ARTICLES.length);
    setTxt("#stat-views", fmtViews(ARTICLES.reduce((s, a) => s + totalViews(a), 0)));
    setTxt("#stat-cats", CATEGORIES.length);

    // Категории
    const catGrid = $("#cat-grid");
    if (catGrid) {
      catGrid.innerHTML = CATEGORIES.map((c) => {
        const n = ARTICLES.filter((a) => a.category === c.id).length;
        return `<a class="cat-tile reveal" href="articles.html?cat=${c.id}">
          <span class="cat-emoji">${c.emoji}</span>
          <div class="cat-name">${c.name}</div>
          <div class="cat-count">${n} ${plural(n, "статья", "статьи", "статей")}</div>
        </a>`;
      }).join("");
    }

    // Популярные (по просмотрам) — мини-список
    const pop = $("#popular-list");
    if (pop) {
      pop.innerHTML = [...ARTICLES].sort((a, b) => totalViews(b) - totalViews(a)).slice(0, 5)
        .map((a, i) => `
        <a class="pop-item reveal" href="article.html?id=${a.id}">
          <span class="pop-num">${String(i + 1).padStart(2, "0")}</span>
          <span class="pop-body">
            <span class="pop-title">${esc(a.title)}</span>
            <span class="pop-meta">${catById(a.category).emoji} ${catById(a.category).name} · ${readingTime(a.content)} мин · 👁 ${fmtViews(totalViews(a))}</span>
          </span>
        </a>`).join("");
    }

    initReveal();
    bindSpotlight();
  }

  function plural(n, one, few, many) {
    const m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return one;
    if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
    return many;
  }

  /* ============================================================
     СПИСОК СТАТЕЙ (поиск + фильтры)
     ============================================================ */
  function renderArticlesPage() {
    const grid = $("#articles-grid");
    const info = $("#results-info");
    if (!grid) return;

    const params = new URLSearchParams(location.search);
    const state = {
      q: params.get("q") || "",
      cat: params.get("cat") || "all",
      tag: params.get("tag") || "",
      sort: "date",
      favOnly: false,
    };

    const searchInput = $("#search-input");
    if (searchInput) searchInput.value = state.q;

    function apply() {
      let list = sortedArticles();

      if (state.favOnly) list = list.filter((a) => isFav(a.id));
      if (state.cat !== "all") list = list.filter((a) => a.category === state.cat);
      if (state.tag) list = list.filter((a) => a.tags.some((t) => t.toLowerCase() === state.tag.toLowerCase()));
      if (state.q.trim()) {
        const q = state.q.trim().toLowerCase();
        list = list.filter((a) =>
          (a.title + " " + a.excerpt + " " + a.tags.join(" ") + " " + a.content.replace(/<[^>]+>/g, " ")).toLowerCase().includes(q)
        );
      }
      if (state.sort === "views") list.sort((a, b) => totalViews(b) - totalViews(a));
      if (state.sort === "quick") list.sort((a, b) => readingTime(a.content) - readingTime(b.content));

      if (!list.length) {
        grid.innerHTML = `<div class="empty-state">
          <span class="big">🔭</span>
          <h4>Ничего не найдено</h4>
          <p>Попробуйте изменить запрос или сбросить фильтры.</p>
        </div>`;
      } else {
        // Раскладка bento без «сирот»
        const spans = bentoSpans(list.length);
        grid.innerHTML = list.map((a, i) => cardHTML(a, {
          span: spans[i],
          highlight: true,
          q: state.q.trim(),
        })).join("");
      }
      if (info) {
        info.innerHTML = `Найдено: <b>${list.length}</b> ${plural(list.length, "статья", "статьи", "статей")}` +
          (state.q.trim() ? ` по запросу <b>«${esc(state.q.trim())}»</b>` : "") +
          (state.tag ? ` · тег <b>#${esc(state.tag)}</b>` : "") +
          (state.favOnly ? " · <b>только избранное</b>" : "");
      }

      // Чипы категорий
      $$("#cat-chips .chip").forEach((c) => c.classList.toggle("active", c.dataset.cat === state.cat));
      $("#fav-toggle")?.classList.toggle("active", state.favOnly);

      initReveal();
      bindSpotlight();
    }

    // Чипы
    const chips = $("#cat-chips");
    if (chips) {
      chips.innerHTML = `<button class="chip" data-cat="all">Все</button>` +
        CATEGORIES.map((c) => `<button class="chip" data-cat="${c.id}">${c.emoji} ${c.name}</button>`).join("");
      chips.addEventListener("click", (e) => {
        const b = e.target.closest(".chip");
        if (!b) return;
        state.cat = b.dataset.cat;
        apply();
      });
    }

    // Избранное-фильтр
    $("#fav-toggle")?.addEventListener("click", () => { state.favOnly = !state.favOnly; apply(); });

    // Сортировка
    $("#sort-select")?.addEventListener("change", (e) => { state.sort = e.target.value; apply(); });

    // Поиск с дебаунсом
    let t;
    searchInput?.addEventListener("input", (e) => {
      clearTimeout(t);
      t = setTimeout(() => { state.q = e.target.value; apply(); }, 180);
    });

    // Сброс тега по клику на крестик в info
    grid.parentElement?.addEventListener("click", (e) => {
      if (e.target.matches("[data-reset-tag]")) { state.tag = ""; apply(); }
    });

    apply();
    if (state.tag) apply();
  }

  /* ============================================================
     СТРАНИЦА СТАТЬИ
     ============================================================ */
  function renderArticlePage() {
    const root = $("#article-root");
    if (!root) return;
    const id = new URLSearchParams(location.search).get("id");
    const a = byId(id);

    if (!a) {
      root.innerHTML = `<div class="empty-state" style="padding:120px 20px">
        <span class="big">🌌</span><h4>Статья не найдена</h4>
        <p><a href="articles.html" style="color:var(--accent-2)">← Вернуться ко всем статьям</a></p>
      </div>`;
      return;
    }

    addView(a.id);
    const cat = catById(a.category);
    document.title = `${a.title} — ${SITE.name}`;

    const rt = readingTime(a.content);
    root.innerHTML = `
    <div class="article-hero container">
      <div class="crumbs">
        <a href="index.html">Главная</a> <span>/</span>
        <a href="articles.html">Статьи</a> <span>/</span>
        <a href="articles.html?cat=${cat.id}">${cat.emoji} ${cat.name}</a>
      </div>
      <h1 class="article-title">${esc(a.title)}</h1>
      <p class="article-lead">${esc(a.excerpt)}</p>
      <div class="article-meta-bar">
        <span class="meta-author">
          <span class="avatar" style="background:${a.author.gradient};width:34px;height:34px;font-size:12px">${a.author.initials}</span>
          <span><b style="color:var(--text)">${esc(a.author.name)}</b><br><small style="color:var(--muted)">${esc(a.author.role)}</small></span>
        </span>
        <span class="meta-dot">·</span><span>${fmtDate(a.date)}</span>
        <span class="meta-dot">·</span><span>${rt} мин чтения</span>
        <span class="meta-dot">·</span><span>👁 ${fmtViews(totalViews(a))}</span>
        <div class="article-actions">
          <button class="pill-btn ${isFav(a.id) ? "on" : ""}" data-fav-btn="${a.id}">
            <span data-fav="${a.id}" class="fav-ico">${isFav(a.id) ? "♥" : "♡"}</span> <span data-fav-label>${isFav(a.id) ? "В избранном" : "В избранное"}</span>
          </button>
          <button class="pill-btn" data-share="${a.id}">↗ Поделиться</button>
        </div>
      </div>
      <div class="article-banner" style="background:${a.gradient}">
        <span class="card-emoji">${a.emoji}</span>
      </div>
    </div>

    <div class="container article-layout">
      <article class="prose" id="prose">${a.content}</article>
      <aside>
        <nav class="toc" id="toc"><h6>Содержание</h6></nav>
      </aside>
    </div>

    <div class="container" style="max-width:760px;margin:0 auto;">
      <div class="tag-row">${a.tags.map((t) => `<a class="tag" href="articles.html?tag=${encodeURIComponent(t)}">#${esc(t)}</a>`).join("")}</div>
      <div class="author-box" style="margin-bottom:44px">
        <span class="avatar" style="background:${a.author.gradient}">${a.author.initials}</span>
        <div>
          <h5>${esc(a.author.name)}</h5>
          <p>${esc(a.author.role)} · ${SITE.name}</p>
        </div>
      </div>
    </div>

    <div class="container comments" id="comments">
      <h3>Обсуждение <span id="comments-count" style="color:var(--muted);font-weight:600"></span></h3>
      <form class="comment-form" id="comment-form">
        <input type="text" id="c-name" placeholder="Ваше имя" maxlength="40" required>
        <textarea id="c-text" rows="3" placeholder="Поделитесь мнением…" maxlength="800" required></textarea>
        <div><button class="btn btn-primary" type="submit">Отправить</button></div>
      </form>
      <div id="comments-list"></div>
    </div>

    <div class="container section" style="padding-top:10px">
      <div class="section-head">
        <div><h2 class="section-title">Читайте также</h2><div class="section-sub">Похожие материалы редакции</div></div>
        <a class="section-link" href="articles.html">Все статьи →</a>
      </div>
      <div class="bento" id="related-grid"></div>
    </div>`;

    /* --- Кнопки действий (избранное обрабатывается глобальным делегатом) --- */
    $$("[data-share]").forEach((btn) =>
      btn.addEventListener("click", async () => {
        const url = location.href;
        try {
          if (navigator.share) await navigator.share({ title: a.title, url });
          else { await navigator.clipboard.writeText(url); toast("🔗 Ссылка скопирована"); }
        } catch { toast("🔗 " + url); }
      })
    );

    /* --- TOC --- */
    const heads = $$("#prose h2");
    const toc = $("#toc");
    if (heads.length && toc) {
      heads.forEach((h, i) => { h.id = "h-" + i; });
      toc.innerHTML = "<h6>Содержание</h6>" + heads.map((h, i) => `<a href="#h-${i}" data-toc="${i}">${esc(h.textContent)}</a>`).join("");
      const io = new IntersectionObserver((entries) => {
        entries.forEach((en) => {
          if (en.isIntersecting) {
            $$("#toc a").forEach((l) => l.classList.remove("active"));
            const idx = heads.indexOf(en.target);
            $(`#toc a[data-toc="${idx}"]`)?.classList.add("active");
          }
        });
      }, { rootMargin: "-90px 0px -65% 0px" });
      heads.forEach((h) => io.observe(h));
    } else if (toc) { toc.style.display = "none"; }

    /* --- Комментарии (локальные) --- */
    const CKEY = "synapse_comments_" + a.id;
    const renderComments = () => {
      const list = store.get(CKEY, []);
      const box = $("#comments-list");
      const cnt = $("#comments-count");
      if (cnt) cnt.textContent = list.length ? `(${list.length})` : "";
      if (!box) return;
      if (!list.length) {
        box.innerHTML = `<p style="color:var(--muted);font-size:14px;padding:8px 0">Пока нет комментариев — будьте первым. Комментарии хранятся локально в вашем браузере.</p>`;
        return;
      }
      box.innerHTML = list.slice().reverse().map((c) => `
        <div class="comment">
          <span class="avatar" style="background:linear-gradient(135deg,#8b5cf6,#22d3ee)">${esc(c.name.slice(0, 2).toUpperCase())}</span>
          <div>
            <div class="comment-head"><b>${esc(c.name)}</b><time>${esc(c.time)}</time></div>
            <div class="comment-text">${esc(c.text)}</div>
          </div>
        </div>`).join("");
    };
    $("#comment-form")?.addEventListener("submit", (e) => {
      e.preventDefault();
      const name = $("#c-name").value.trim() || "Аноним";
      const text = $("#c-text").value.trim();
      if (!text) return;
      const list = store.get(CKEY, []);
      list.push({ name, text, time: new Date().toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" }) });
      store.set(CKEY, list);
      e.target.reset();
      renderComments();
      toast("💬 Комментарий опубликован");
    });
    renderComments();

    /* --- Похожие --- */
    const related = [...ARTICLES]
      .filter((x) => x.id !== a.id)
      .map((x) => ({
        x,
        score:
          (x.category === a.category ? 3 : 0) +
          x.tags.filter((t) => a.tags.includes(t)).length +
          (x.author.name === a.author.name ? 1 : 0),
      }))
      .sort((p, q) => q.score - p.score || q.x.date.localeCompare(p.x.date))
      .slice(0, 3)
      .map((p) => p.x);
    const relGrid = $("#related-grid");
    if (relGrid) relGrid.innerHTML = related.map((x) => cardHTML(x, { span: 2 })).join("");

    initReveal();
    bindSpotlight();
    initProgressBar();
  }

  /* Прогресс чтения */
  function initProgressBar() {
    const bar = $("#progress");
    if (!bar) return;
    const onScroll = () => {
      const h = document.documentElement;
      const max = h.scrollHeight - h.clientHeight;
      bar.style.width = (max > 0 ? (h.scrollTop / max) * 100 : 0) + "%";
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
  }

  /* ============================================================
     ОБЩИЕ БЛОКИ (хедер, футер, рассылка, хоткеи)
     ============================================================ */
  function initCommon() {
    // Глобальный делегат: избранное (иконка в карточке или кнопка-«таблетка» в статье)
    document.addEventListener("click", (e) => {
      const el = e.target.closest("[data-fav], [data-fav-btn]");
      if (!el) return;
      const id = Number(el.dataset.fav !== undefined ? el.dataset.fav : el.dataset.favBtn);
      toggleFav(id, e);
    });

    // Мобильное меню
    const burger = $("#burger");
    const nav = $("#main-nav");
    burger?.addEventListener("click", () => nav.classList.toggle("open"));
    nav?.addEventListener("click", (e) => { if (e.target.tagName === "A") nav.classList.remove("open"); });

    // Тема
    $$("[data-theme-btn]").forEach((b) => b.addEventListener("click", toggleTheme));

    // Активный пункт меню
    const page = location.pathname.split("/").pop() || "index.html";
    $$("#main-nav a").forEach((a) => {
      if (a.getAttribute("href") === page) a.classList.add("active");
    });

    // Форма рассылки
    $$("[data-newsletter]").forEach((form) =>
      form.addEventListener("submit", (e) => {
        e.preventDefault();
        const email = form.querySelector("input").value.trim();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { toast("⚠️ Проверьте адрес почты"); return; }
        form.reset();
        toast("✅ Вы подписаны! Добро пожаловать в СИНАПС.");
      })
    );

    // Хоткей «/» — фокус на поиск
    document.addEventListener("keydown", (e) => {
      if (e.key === "/" && !["INPUT", "TEXTAREA"].includes(document.activeElement.tagName)) {
        const s = $("#search-input");
        if (s) { e.preventDefault(); s.focus(); }
      }
    });

    // Год в футере
    $$("[data-year]").forEach((el) => (el.textContent = new Date().getFullYear()));
  }

  /* ---------- Старт ---------- */
  let booted = false;
  function boot() {
    if (booted) return; // защита от двойной инициализации
    booted = true;
    initTheme();
    initCommon();
    if ($("#featured-bento")) renderHome();
    if ($("#articles-grid")) renderArticlesPage();
    if ($("#article-root")) renderArticlePage();
    initReveal();
  }

  document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", boot) : boot();
})();
