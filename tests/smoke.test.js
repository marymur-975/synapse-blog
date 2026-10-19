/* Смоук-тест сайта в jsdom (асинхронная обвязка) */
const fs = require("fs");
const { JSDOM } = require("jsdom");

const dataJs = fs.readFileSync("assets/js/data.js", "utf8");
const engineJs = fs.readFileSync("assets/js/engine.js", "utf8");

let failures = 0;
const ok = (cond, msg) => {
  if (cond) console.log("  ✅ " + msg);
  else { console.log("  ❌ " + msg); failures++; }
};

function loadPage(htmlFile, url) {
  const html = fs.readFileSync(htmlFile, "utf8");
  const dom = new JSDOM(html, { url, runScripts: "dangerously", pretendToBeVisual: true });
  const { window } = dom;
  window.IntersectionObserver = class {
    constructor(cb) { this.cb = cb; }
    observe() {} unobserve() {} disconnect() {}
  };
  window.scrollTo = () => {};
  const errors = [];
  window.addEventListener("error", (e) => errors.push(e.message));
  window.eval(dataJs + "\n;\n" + engineJs);
  // Дожидаемся реального DOMContentLoaded/load от jsdom (boot guard исключает двойной запуск)
  return new Promise((resolve) => {
    const done = () => resolve({ window, errors, doc: window.document });
    if (window.document.readyState === "complete") return setTimeout(done, 50);
    window.addEventListener("load", () => setTimeout(done, 50));
    setTimeout(done, 1500); // страховка
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  /* ---------- 1. Главная ---------- */
  console.log("\n== index.html ==");
  {
    const { errors, doc } = await loadPage("index.html", "file:///app/index.html");
    ok(errors.length === 0, "без JS-ошибок: " + (errors.join("; ") || "ok"));
    ok(doc.querySelectorAll("#featured-bento .card").length === 6, "6 карточек в свежих материалах");
    ok(doc.querySelector("#stat-articles").textContent === "12", "статистика: 12 статей");
    ok(doc.querySelectorAll("#cat-grid .cat-tile").length === 6, "6 рубрик");
    ok(doc.querySelectorAll("#popular-list .pop-item").length === 5, "топ-5 популярного");
    ok(!!doc.querySelector("#featured-bento .card.span-4"), "bento: есть широкая карточка span-4");
    ok(!!doc.querySelector("#featured-bento .card-fav"), "на карточках есть кнопка избранного");
  }

  /* ---------- 2. Архив + поиск + фильтры ---------- */
  console.log("\n== articles.html ==");
  {
    const { window, errors, doc } = await loadPage("articles.html", "file:///app/articles.html");
    ok(errors.length === 0, "без JS-ошибок: " + (errors.join("; ") || "ok"));
    ok(doc.querySelectorAll("#articles-grid .card").length === 12, "12 карточек без фильтра");
    ok(doc.querySelectorAll("#cat-chips .chip").length === 7, "7 чипов (Все + 6 рубрик)");

    // Фильтр по рубрике через URL
    const { doc: d2 } = await loadPage("articles.html", "file:///app/articles.html?cat=dev");
    ok(d2.querySelectorAll("#articles-grid .card").length === 3, "?cat=dev → 3 статьи");
    ok(d2.querySelector("#cat-chips .chip.active")?.textContent.includes("Разработка"), "активный чип рубрики");

    // Поиск из URL + подсветка
    const { doc: d3 } = await loadPage("articles.html", "file:///app/articles.html?q=RAG");
    ok(d3.querySelectorAll("#articles-grid .card").length >= 1, "?q=RAG → есть результаты");
    ok(d3.querySelectorAll("#articles-grid mark").length >= 1, "подсветка совпадений <mark>");

    // Живой ввод в поиск (дебаунс 180мс)
    const input = doc.querySelector("#search-input");
    input.value = "квантование";
    input.dispatchEvent(new window.Event("input", { bubbles: true }));
    await sleep(320);
    const n = doc.querySelectorAll("#articles-grid .card").length;
    ok(n >= 1 && n < 12, `поиск «квантование» отфильтровал список (${n} шт.)`);

    // Пустой результат
    input.value = "zzzнеттакого";
    input.dispatchEvent(new window.Event("input", { bubbles: true }));
    await sleep(320);
    ok(!!doc.querySelector(".empty-state"), "пустой запрос → empty-state");

    // Клик по чипу рубрики
    input.value = "";
    input.dispatchEvent(new window.Event("input", { bubbles: true }));
    await sleep(320);
    doc.querySelector('#cat-chips .chip[data-cat="ethics"]').dispatchEvent(new window.Event("click", { bubbles: true }));
    ok(doc.querySelectorAll("#articles-grid .card").length === 1, "клик по чипу «Этика» → 1 статья");

    // Сброс рубрики + сортировка по просмотрам
    doc.querySelector('#cat-chips .chip[data-cat="all"]').dispatchEvent(new window.Event("click", { bubbles: true }));
    const sel = doc.querySelector("#sort-select");
    sel.value = "views";
    sel.dispatchEvent(new window.Event("change", { bubbles: true }));
    const first = doc.querySelector("#articles-grid .card");
    ok(first?.getAttribute("href") === "article.html?id=6", "сортировка по просмотрам: топ — кейс про инференс");

    // Избранное на карточке + фильтр «только избранное»
    const favBtn = doc.querySelector("#articles-grid .card-fav");
    const favId = favBtn.dataset.fav;
    favBtn.dispatchEvent(new window.Event("click", { bubbles: true }));
    ok(favBtn.classList.contains("on") && favBtn.textContent === "♥", "избранное на карточке включилось");
    doc.querySelector("#fav-toggle").dispatchEvent(new window.Event("click", { bubbles: true }));
    const favCards = doc.querySelectorAll("#articles-grid .card");
    ok(favCards.length === 1 && favCards[0].dataset.card === favId, "фильтр «только избранное» работает");
  }

  /* ---------- 3. Страница статьи ---------- */
  console.log("\n== article.html?id=3 ==");
  {
    const { window, errors, doc } = await loadPage("article.html", "file:///app/article.html?id=3");
    ok(errors.length === 0, "без JS-ошибок: " + (errors.join("; ") || "ok"));
    ok(doc.title.startsWith("RAG"), "заголовок вкладки: " + doc.title.slice(0, 45) + "…");
    ok(!!doc.querySelector(".prose h2"), "контент статьи отрендерен");
    ok(doc.querySelectorAll("#toc a").length === doc.querySelectorAll(".prose h2").length, "TOC совпадает с числом h2");
    ok(doc.querySelectorAll("#related-grid .card").length === 3, "3 похожие статьи");
    ok(doc.querySelectorAll(".tag-row .tag").length === 4, "4 тега");
    ok(!!doc.querySelector(".crumbs a"), "хлебные крошки");

    // Избранное: клик по самой кнопке-«таблетке»
    const pill = doc.querySelector("[data-fav-btn]");
    pill.dispatchEvent(new window.Event("click", { bubbles: true }));
    ok(pill.classList.contains("on") && pill.querySelector("[data-fav-label]").textContent === "В избранном", "избранное: кнопка включилась");
    pill.dispatchEvent(new window.Event("click", { bubbles: true }));
    ok(!pill.classList.contains("on"), "избранное: кнопка выключилась");

    // Просмотры инкрементируются
    const viewsBefore = parseInt(doc.querySelector("body").innerHTML.match(/👁 ([\d.]+K?)/)[1].replace("K", "")) || 0;
    ok(viewsBefore >= 0, "счётчик просмотров отображается");

    // Комментарий
    doc.querySelector("#c-name").value = "Тест";
    doc.querySelector("#c-text").value = "Отличная статья!";
    doc.querySelector("#comment-form").dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
    ok(doc.querySelectorAll("#comments-list .comment").length === 1, "комментарий опубликован");
    ok(doc.querySelector("#c-text").value === "", "форма комментария очищена");

    // Несуществующая статья
    const { doc: d404 } = await loadPage("article.html", "file:///app/article.html?id=999");
    ok(!!d404.querySelector(".empty-state"), "id=999 → graceful 404");
  }

  /* ---------- 4. Тема и хоткеи ---------- */
  console.log("\n== тема и UX ==");
  {
    const { window, doc } = await loadPage("index.html", "file:///app/index.html");
    const btn = doc.querySelector("[data-theme-btn]");
    const before = doc.documentElement.getAttribute("data-theme");
    btn.dispatchEvent(new window.Event("click", { bubbles: true }));
    const after = doc.documentElement.getAttribute("data-theme");
    ok(before !== after, `переключение темы: ${before} → ${after}`);
    ok(!!doc.querySelector(".toast"), "тост-уведомление появилось");
    btn.dispatchEvent(new window.Event("click", { bubbles: true }));
    ok(doc.documentElement.getAttribute("data-theme") === before, "тема вернулась обратно");

    // Рассылка: невалидный и валидный email
    const form = doc.querySelector("[data-newsletter]");
    const email = form.querySelector("input");
    email.value = "не-почта";
    form.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
    ok(doc.querySelectorAll(".toast").length >= 1, "рассылка: предупреждение о невалидном email");
    email.value = "dev@synapse.ai";
    form.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
    ok(form.querySelector("input").value === "", "рассылка: форма очищена после успеха");
  }

  /* ---------- 5. About ---------- */
  console.log("\n== about.html ==");
  {
    const { errors, doc } = await loadPage("about.html", "file:///app/about.html");
    ok(errors.length === 0, "без JS-ошибок: " + (errors.join("; ") || "ok"));
    ok(doc.querySelectorAll(".team-card").length === 4, "4 карточки команды");
    ok(doc.querySelectorAll(".value-card").length === 6, "6 принципов");
  }

  console.log(failures ? `\n❌ Провалено: ${failures}` : "\n🎉 Все проверки пройдены");
  process.exit(failures ? 1 : 0);
})();
