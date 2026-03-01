(() => {
  const enBtn = document.getElementById("langEn");
  const zhBtn = document.getElementById("langZh");
  const subtitle = document.getElementById("subtitle");

  const subtitles = {
    en: "Detailed and practical reference for human-like scripted typing.",
    zh: "详细且实用的拟人输入语法参考。"
  };

  function setLanguage(lang) {
    const isZh = lang === "zh";
    document.documentElement.lang = isZh ? "zh" : "en";
    document.querySelectorAll(".lang-en").forEach((node) => {
      node.classList.toggle("hidden", isZh);
    });
    document.querySelectorAll(".lang-zh").forEach((node) => {
      node.classList.toggle("hidden", !isZh);
    });
    enBtn.classList.toggle("active", !isZh);
    zhBtn.classList.toggle("active", isZh);
    subtitle.textContent = isZh ? subtitles.zh : subtitles.en;
  }

  enBtn.addEventListener("click", () => setLanguage("en"));
  zhBtn.addEventListener("click", () => setLanguage("zh"));

  chrome.storage.local.get(["language"], (result) => {
    setLanguage(result && result.language === "zh" ? "zh" : "en");
  });
})();
