/* Визуальный QA: скриншоты всех страниц (запускать при работающем http-сервере на :8099) */
const puppeteer = require("puppeteer");
const path = require("path");
const OUT = path.join(__dirname, "..", ".screens");

(async () => {
  const browser = await puppeteer.launch({ args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  const shots = [
    ["http://127.0.0.1:8099/index.html", "01-home-dark.png", 1440, 900, false, false],
    ["http://127.0.0.1:8099/index.html", "02-home-full.png", 1440, 900, false, true],
    ["http://127.0.0.1:8099/articles.html", "03-articles.png", 1440, 900, false, true],
    ["http://127.0.0.1:8099/article.html?id=1", "04-article.png", 1440, 900, false, true],
    ["http://127.0.0.1:8099/about.html", "05-about.png", 1440, 900, false, true],
    ["http://127.0.0.1:8099/index.html", "06-home-light.png", 1440, 900, "light", false],
    ["http://127.0.0.1:8099/articles.html?cat=dev", "07-mobile.png", 390, 844, false, false],
  ];
  for (const [url, file, w, h, theme, full] of shots) {
    // Изолированный контекст: localStorage не «протекает» между снимками
    const ctx = await browser.createBrowserContext();
    const page = await ctx.newPage();
    await page.setViewport({ width: w, height: h, deviceScaleFactor: 1 });
    const errs = [];
    page.on("pageerror", (e) => errs.push(e.message));
    page.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });
    if (theme === "light") {
      await page.goto(url, { waitUntil: "networkidle0" });
      await page.evaluate(() => localStorage.setItem("synapse_theme", JSON.stringify("light")));
      await page.reload({ waitUntil: "networkidle0" });
    } else {
      await page.goto(url, { waitUntil: "networkidle0" });
    }
    // Прокрутка для reveal-анимаций (instant, чтобы перебить smooth-scroll из CSS)
    await page.evaluate(async () => {
      for (let y = 0; y < document.body.scrollHeight; y += 350) {
        window.scrollTo({ top: y, behavior: "instant" });
        await new Promise((r) => setTimeout(r, 40));
      }
      window.scrollTo({ top: 0, behavior: "instant" });
    });
    await new Promise((r) => setTimeout(r, 500));
    await page.screenshot({ path: path.join(OUT, file), fullPage: !!full });
    console.log(file, errs.length ? "ERRORS: " + errs.join("; ") : "ok");
    await page.close();
    await ctx.close();
  }
  await browser.close();
})();
