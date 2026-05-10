const state = {
  originalDeck: null,
  deck: null,
  selectedIndex: 0,
  presenting: false,
  storageKey: null,
  localStorageAvailable: true
};

const els = {};
const supportedTypes = ["title", "section", "content", "beforeAfter", "closing", "proof", "process", "cards"];

window.addEventListener("DOMContentLoaded", init);

async function init() {
  cacheElements();
  updateTopOffset();
  window.addEventListener("resize", updateTopOffset);
  await loadDeck();
  bindEvents();
  renderAll();
}

function cacheElements() {
  Object.assign(els, {
    deckTitle: document.getElementById("deckTitle"),
    presentBtn: document.getElementById("presentBtn"),
    exportPdfBtn: document.getElementById("exportPdfBtn"),
    downloadJsonBtn: document.getElementById("downloadJsonBtn"),
    resetDeckBtn: document.getElementById("resetDeckBtn"),
    addSlideBtn: document.getElementById("addSlideBtn"),
    duplicateSlideBtn: document.getElementById("duplicateSlideBtn"),
    deleteSlideBtn: document.getElementById("deleteSlideBtn"),
    moveUpBtn: document.getElementById("moveUpBtn"),
    moveDownBtn: document.getElementById("moveDownBtn"),
    thumbList: document.getElementById("thumbList"),
    slideCanvas: document.getElementById("slideCanvas"),
    slideTypeSelect: document.getElementById("slideTypeSelect"),
    speakerNote: document.getElementById("speakerNote"),
    presenter: document.getElementById("presenter"),
    presentStage: document.getElementById("presentStage"),
    prevPresentBtn: document.getElementById("prevPresentBtn"),
    nextPresentBtn: document.getElementById("nextPresentBtn"),
    slideCounter: document.getElementById("slideCounter"),
    progressDots: document.getElementById("progressDots"),
    loadWarning: document.getElementById("loadWarning")
  });
}

function updateTopOffset() {
  const topbar = document.getElementById("topbar");
  const height = topbar ? Math.ceil(topbar.getBoundingClientRect().height) : 72;
  document.documentElement.style.setProperty("--topOffset", `${height}px`);
}

async function loadDeck() {
  try {
    const response = await fetch("content.json", { cache: "no-store" });
    if (!response.ok) throw new Error(`content.json returned ${response.status}`);
    state.originalDeck = await response.json();
  } catch (err) {
    state.originalDeck = fallbackDeck();
    showWarning("Could not fetch content.json. Some browsers block local file loading. Open this folder through a simple local server if the deck does not load as expected.");
  }

  state.storageKey = `flowpitch:${state.originalDeck.meta?.deckId || "deck"}:draft`;
  state.localStorageAvailable = checkLocalStorage();
  state.deck = deepClone(state.originalDeck);

  if (state.localStorageAvailable) {
    const saved = localStorage.getItem(state.storageKey);
    if (saved) {
      try { state.deck = JSON.parse(saved); }
      catch { localStorage.removeItem(state.storageKey); }
    }
  } else {
    showWarning("localStorage is unavailable. Edits will work during this session but will not autosave after reload.");
  }
}

function bindEvents() {
  els.presentBtn.addEventListener("click", enterPresentMode);
  els.prevPresentBtn.addEventListener("click", prevSlide);
  els.nextPresentBtn.addEventListener("click", nextSlide);
  els.exportPdfBtn.addEventListener("click", exportPdf);
  els.downloadJsonBtn.addEventListener("click", downloadJson);
  els.resetDeckBtn.addEventListener("click", resetDeck);
  els.addSlideBtn.addEventListener("click", addSlide);
  els.duplicateSlideBtn.addEventListener("click", duplicateSlide);
  els.deleteSlideBtn.addEventListener("click", deleteSlide);
  els.moveUpBtn.addEventListener("click", moveSlideUp);
  els.moveDownBtn.addEventListener("click", moveSlideDown);
  els.slideTypeSelect.addEventListener("change", changeSlideType);
  els.speakerNote.addEventListener("input", () => {
    currentSlide().note = els.speakerNote.value;
    persist();
    renderThumbs();
  });
  document.addEventListener("keydown", handleKeys);
}

function renderAll() {
  els.deckTitle.textContent = state.deck.meta?.title || "Untitled Deck";
  renderThumbs();
  renderEditorSlide();
  updateInspector();
}

function renderThumbs() {
  els.thumbList.innerHTML = "";
  state.deck.slides.forEach((slide, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `thumb ${index === state.selectedIndex ? "is-selected" : ""}`;
    button.setAttribute("aria-label", `Select slide ${index + 1}`);
    button.innerHTML = `
      <div class="thumb-number">${String(index + 1).padStart(2, "0")}</div>
      <div class="thumb-title">${escapeHtml(slide.headline || "Untitled slide")}</div>
      <div class="thumb-type">${escapeHtml(slide.type || "content")}</div>`;
    button.addEventListener("click", () => {
      state.selectedIndex = index;
      renderAll();
    });
    els.thumbList.appendChild(button);
  });
}

function renderEditorSlide() {
  els.slideCanvas.innerHTML = "";
  els.slideCanvas.appendChild(createSlideElement(currentSlide(), true));
}

function updateInspector() {
  const slide = currentSlide();
  els.slideTypeSelect.value = supportedTypes.includes(slide.type) ? slide.type : "content";
  els.speakerNote.value = slide.note || "";
}

function createSlideElement(slide, editable = false) {
  const root = document.createElement("article");
  root.className = `deck-slide ${slide.type || "content"}`;
  root.dataset.slideType = slide.type || "content";

  const inner = document.createElement("div");
  inner.className = "slide-inner";

  const eyebrow = document.createElement("div");
  eyebrow.className = "eyebrow";
  eyebrow.dataset.animate = "";
  eyebrow.textContent = typeLabel(slide.type);
  inner.appendChild(eyebrow);

  inner.appendChild(editableText("h1", "headline", slide.headline || "Untitled slide", editable, (value) => slide.headline = value));
  if (slide.subheadline !== undefined || ["title", "section", "closing", "proof", "cards", "process", "beforeAfter"].includes(slide.type)) {
    inner.appendChild(editableText("p", "subheadline", slide.subheadline || "", editable, (value) => slide.subheadline = value, "Add subheadline"));
  }

  if (slide.type === "beforeAfter") {
    inner.appendChild(createCompare(slide, editable));
  } else if (["cards", "proof", "process"].includes(slide.type)) {
    inner.appendChild(createCards(slide, editable));
  } else {
    inner.appendChild(createBullets(slide, editable));
  }

  if (slide.cta !== undefined || ["title", "closing", "proof"].includes(slide.type)) {
    inner.appendChild(editableText("div", "cta", slide.cta || "", editable, (value) => slide.cta = value, "Add CTA"));
  }

  root.appendChild(inner);
  return root;
}

function editableText(tag, className, value, editable, onChange, placeholder = "Click to edit") {
  const el = document.createElement(tag);
  el.className = className;
  el.dataset.animate = "";
  el.textContent = value || placeholder;
  if (editable) {
    el.contentEditable = "true";
    el.spellcheck = true;
    el.dataset.placeholder = placeholder;
    el.addEventListener("focus", () => { if (el.textContent === placeholder) el.textContent = ""; });
    el.addEventListener("blur", () => {
      const clean = el.textContent.trim();
      onChange(clean);
      if (!clean) el.textContent = placeholder;
      persist();
      renderThumbs();
      updateInspector();
    });
    el.addEventListener("keydown", preventEnterExceptShift);
  }
  return el;
}

function preventEnterExceptShift(event) {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    event.currentTarget.blur();
  }
}

function createBullets(slide, editable) {
  const ul = document.createElement("ul");
  ul.className = "bullet-list";
  ul.dataset.animate = "";
  if (!Array.isArray(slide.bullets)) slide.bullets = ["Add bullet"];
  slide.bullets.forEach((bullet, index) => {
    const li = document.createElement("li");
    const span = editableText("span", "bullet-text", bullet, editable, (value) => slide.bullets[index] = value, "Add bullet");
    li.appendChild(span);
    ul.appendChild(li);
  });
  if (editable) {
    const li = document.createElement("li");
    const add = document.createElement("button");
    add.type = "button";
    add.textContent = "Add bullet";
    add.addEventListener("click", () => {
      slide.bullets.push("New bullet");
      persist();
      renderEditorSlide();
    });
    li.appendChild(add);
    ul.appendChild(li);
  }
  return ul;
}

function createCards(slide, editable) {
  if (!Array.isArray(slide.cards)) slide.cards = [{ title: "New card", body: "Add supporting detail." }];
  const grid = document.createElement("div");
  grid.className = `${slide.type === "process" ? "process-grid" : "card-grid"} ${slide.cards.length >= 4 ? "four" : ""}`;
  grid.dataset.animate = "";
  grid.setAttribute("role", "list");
  slide.cards.forEach((card, index) => {
    const item = document.createElement("div");
    item.className = "card";
    item.setAttribute("role", "listitem");
    item.appendChild(editableText("h3", "card-title", card.title || "Card title", editable, (value) => card.title = value));
    item.appendChild(editableText("p", "card-body", card.body || "Card body", editable, (value) => card.body = value));
    if (editable) {
      const remove = document.createElement("button");
      remove.type = "button";
      remove.textContent = "Remove";
      remove.className = "secondary";
      remove.addEventListener("click", () => {
        slide.cards.splice(index, 1);
        if (!slide.cards.length) slide.cards.push({ title: "New card", body: "Add supporting detail." });
        persist();
        renderEditorSlide();
      });
      item.appendChild(remove);
    }
    grid.appendChild(item);
  });
  if (editable) {
    const add = document.createElement("button");
    add.type = "button";
    add.textContent = "Add card";
    add.addEventListener("click", () => {
      slide.cards.push({ title: "New card", body: "Add supporting detail." });
      persist();
      renderEditorSlide();
    });
    grid.appendChild(add);
  }
  return grid;
}

function createCompare(slide, editable) {
  slide.left ||= { title: "Before", bullets: ["Add point"] };
  slide.right ||= { title: "After", bullets: ["Add point"] };
  const grid = document.createElement("div");
  grid.className = "compare-grid";
  grid.dataset.animate = "";
  grid.appendChild(createComparePanel(slide.left, editable, false));
  grid.appendChild(createComparePanel(slide.right, editable, true));
  return grid;
}

function createComparePanel(side, editable, highlight) {
  const panel = document.createElement("div");
  panel.className = `compare-panel ${highlight ? "highlight" : ""}`;
  panel.appendChild(editableText("h3", "compare-title", side.title || "Title", editable, (value) => side.title = value));
  const ul = document.createElement("ul");
  ul.className = "bullet-list";
  side.bullets ||= ["Add point"];
  side.bullets.forEach((bullet, index) => {
    const li = document.createElement("li");
    li.appendChild(editableText("span", "bullet-text", bullet, editable, (value) => side.bullets[index] = value, "Add point"));
    ul.appendChild(li);
  });
  panel.appendChild(ul);
  return panel;
}

function currentSlide() { return state.deck.slides[state.selectedIndex]; }

function addSlide() {
  const slide = { type: "content", headline: "New slide", subheadline: "Add a clear supporting line.", bullets: ["First point", "Second point"], note: "" };
  state.deck.slides.splice(state.selectedIndex + 1, 0, slide);
  state.selectedIndex += 1;
  persist(); renderAll();
}

function duplicateSlide() {
  state.deck.slides.splice(state.selectedIndex + 1, 0, deepClone(currentSlide()));
  state.selectedIndex += 1;
  persist(); renderAll();
}

function deleteSlide() {
  if (state.deck.slides.length === 1) {
    state.deck.slides[0] = { type: "content", headline: "New slide", subheadline: "Add a clear supporting line.", bullets: ["First point"] };
  } else {
    state.deck.slides.splice(state.selectedIndex, 1);
    state.selectedIndex = Math.max(0, state.selectedIndex - 1);
  }
  persist(); renderAll();
}

function moveSlideUp() {
  if (state.selectedIndex === 0) return;
  const i = state.selectedIndex;
  [state.deck.slides[i - 1], state.deck.slides[i]] = [state.deck.slides[i], state.deck.slides[i - 1]];
  state.selectedIndex -= 1;
  persist(); renderAll();
}

function moveSlideDown() {
  if (state.selectedIndex >= state.deck.slides.length - 1) return;
  const i = state.selectedIndex;
  [state.deck.slides[i + 1], state.deck.slides[i]] = [state.deck.slides[i], state.deck.slides[i + 1]];
  state.selectedIndex += 1;
  persist(); renderAll();
}

function changeSlideType() {
  const slide = currentSlide();
  slide.type = els.slideTypeSelect.value;
  if (["cards", "proof", "process"].includes(slide.type) && !Array.isArray(slide.cards)) {
    slide.cards = [{ title: "Card title", body: "Add supporting detail." }, { title: "Card title", body: "Add supporting detail." }, { title: "Card title", body: "Add supporting detail." }];
  }
  if (slide.type === "beforeAfter") {
    slide.left ||= { title: "Before", bullets: slide.bullets?.slice(0, 3) || ["Add point"] };
    slide.right ||= { title: "After", bullets: ["Add point"] };
  }
  if (!["cards", "proof", "process"].includes(slide.type) && !Array.isArray(slide.bullets)) {
    slide.bullets = ["Add point"];
  }
  persist(); renderAll();
}

function enterPresentMode() {
  state.presenting = true;
  document.body.classList.add("is-presenting");
  els.presenter.hidden = false;
  renderPresentSlide();
  if (els.presenter.requestFullscreen) els.presenter.requestFullscreen().catch(() => {});
}

function exitPresentMode() {
  state.presenting = false;
  document.body.classList.remove("is-presenting");
  els.presenter.hidden = true;
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  renderAll();
}

function renderPresentSlide() {
  els.presentStage.innerHTML = "";
  const slideEl = createSlideElement(currentSlide(), false);
  slideEl.classList.add("is-active");
  els.presentStage.appendChild(slideEl);
  els.slideCounter.textContent = `${state.selectedIndex + 1} / ${state.deck.slides.length}`;
  els.progressDots.innerHTML = "";
  state.deck.slides.forEach((_, index) => {
    const dot = document.createElement("span");
    dot.className = index === state.selectedIndex ? "is-active" : "";
    els.progressDots.appendChild(dot);
  });
}

function nextSlide() {
  if (state.selectedIndex < state.deck.slides.length - 1) {
    state.selectedIndex += 1;
    state.presenting ? renderPresentSlide() : renderAll();
  }
}

function prevSlide() {
  if (state.selectedIndex > 0) {
    state.selectedIndex -= 1;
    state.presenting ? renderPresentSlide() : renderAll();
  }
}

function handleKeys(event) {
  if (!state.presenting) return;
  if ([" ", "ArrowRight"].includes(event.key)) { event.preventDefault(); nextSlide(); }
  if (event.key === "ArrowLeft") { event.preventDefault(); prevSlide(); }
  if (event.key === "Escape") { event.preventDefault(); exitPresentMode(); }
}

async function exportPdf() {
  const button = els.exportPdfBtn;
  const oldLabel = button.textContent;
  button.disabled = true;
  button.textContent = "Exporting…";
  document.body.classList.add("exportingPdf");

  try {
    await ensurePdfLibraries();
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ orientation: "landscape", unit: "px", format: [1920, 1080], compress: true });

    for (let i = 0; i < state.deck.slides.length; i += 1) {
      const stage = document.createElement("div");
      stage.id = "pdfStage";
      const slide = createSlideElement(state.deck.slides[i], false);
      slide.classList.add("is-active");
      stage.appendChild(slide);
      document.body.appendChild(stage);
      await nextFrame();
      const canvas = await window.html2canvas(stage, {
        backgroundColor: "#050611",
        scale: Math.max(window.devicePixelRatio || 1, 2),
        useCORS: true
      });
      const img = canvas.toDataURL("image/png");
      if (i > 0) pdf.addPage([1920, 1080], "landscape");
      pdf.addImage(img, "PNG", 0, 0, 1920, 1080);
      stage.remove();
    }
    pdf.save("FlowPitch.pdf");
  } catch (err) {
    alert("PDF export failed. Make sure cdnjs.cloudflare.com is allowed, or self-host html2canvas and jsPDF. Details: " + err.message);
  } finally {
    document.querySelectorAll("#pdfStage").forEach(el => el.remove());
    document.body.classList.remove("exportingPdf");
    button.disabled = false;
    button.textContent = oldLabel;
  }
}

function ensurePdfLibraries() {
  return Promise.all([
    loadScript("https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js", () => window.html2canvas),
    loadScript("https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js", () => window.jspdf?.jsPDF)
  ]);
}

function loadScript(src, test) {
  if (test()) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.onload = () => test() ? resolve() : reject(new Error(`Loaded ${src} but library was unavailable`));
    script.onerror = () => reject(new Error(`Could not load ${src}`));
    document.head.appendChild(script);
  });
}

function downloadJson() {
  const blob = new Blob([JSON.stringify(state.deck, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "content.json";
  a.click();
  URL.revokeObjectURL(url);
}

function resetDeck() {
  if (state.localStorageAvailable) localStorage.removeItem(state.storageKey);
  state.deck = deepClone(state.originalDeck);
  state.selectedIndex = 0;
  renderAll();
}

function persist() {
  if (!state.localStorageAvailable) return;
  try { localStorage.setItem(state.storageKey, JSON.stringify(state.deck)); }
  catch { state.localStorageAvailable = false; showWarning("Autosave failed because localStorage is unavailable or full."); }
}

function checkLocalStorage() {
  try {
    const key = "flowpitch:test";
    localStorage.setItem(key, "1");
    localStorage.removeItem(key);
    return true;
  } catch { return false; }
}

function showWarning(message) {
  els.loadWarning.textContent = message;
  els.loadWarning.hidden = false;
}

function nextFrame() { return new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); }
function deepClone(value) { return JSON.parse(JSON.stringify(value)); }
function escapeHtml(value) { return String(value).replace(/[&<>'"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[c])); }
function typeLabel(type) {
  return ({ title: "Opening", section: "Signpost", content: "Readiness", beforeAfter: "Shift", closing: "Close", proof: "Proof", process: "Operating model", cards: "Focus areas" })[type] || "Slide";
}

function fallbackDeck() {
  return {
    meta: { deckId: "fallback", title: "FlowPitch Deck", theme: "flowpitch-dark" },
    slides: [{ type: "title", headline: "FlowPitch Deck", subheadline: "Add your content in content.json.", bullets: ["Editable slides", "Presenter mode", "PDF export"], cta: "Ready to present" }]
  };
}
