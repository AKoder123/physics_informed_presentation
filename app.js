const state = {
  deck: null,
  originalDeck: null,
  selected: 0,
  presentIndex: 0,
  storageKey: "flowpitch:draft",
  storageOk: true
};

const $ = (id) => document.getElementById(id);
const escapeHtml = (s = "") => String(s).replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[c]));
const deepClone = (obj) => JSON.parse(JSON.stringify(obj));
const debounce = (fn, wait = 250) => { let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), wait); }; };

init();

async function init() {
  setTopOffset();
  window.addEventListener("resize", setTopOffset);
  try {
    const res = await fetch("content.json", { cache: "no-store" });
    if (!res.ok) throw new Error("Could not load content.json");
    state.originalDeck = await res.json();
  } catch (err) {
    $("localWarning").hidden = false;
    $("localWarning").textContent = "Could not fetch content.json. Open this folder through a simple local server if your browser blocks local file fetches.";
    state.originalDeck = fallbackDeck();
  }
  state.storageKey = `flowpitch:${state.originalDeck.meta.deckId}:draft`;
  state.deck = loadDraft() || deepClone(state.originalDeck);
  wireControls();
  renderAll();
}

function setTopOffset() {
  const h = $("topbar")?.offsetHeight || 74;
  document.documentElement.style.setProperty("--topOffset", `${h}px`);
}

function loadDraft() {
  try {
    const raw = localStorage.getItem(state.storageKey);
    return raw ? JSON.parse(raw) : null;
  } catch {
    state.storageOk = false;
    return null;
  }
}

const saveDraft = debounce(() => {
  try { localStorage.setItem(state.storageKey, JSON.stringify(state.deck)); }
  catch { state.storageOk = false; showStorageWarning(); }
}, 180);

function showStorageWarning() {
  $("localWarning").hidden = false;
  $("localWarning").textContent = "LocalStorage is unavailable. Editing will still work in memory, but reloads may not preserve changes.";
}

function wireControls() {
  $("presentBtn").addEventListener("click", enterPresentMode);
  $("exitPresentBtn").addEventListener("click", exitPresentMode);
  $("nextBtn").addEventListener("click", () => navigatePresent(1));
  $("prevBtn").addEventListener("click", () => navigatePresent(-1));
  $("addSlideBtn").addEventListener("click", addSlide);
  $("duplicateSlideBtn").addEventListener("click", duplicateSlide);
  $("deleteSlideBtn").addEventListener("click", deleteSlide);
  $("moveUpBtn").addEventListener("click", () => moveSlide(-1));
  $("moveDownBtn").addEventListener("click", () => moveSlide(1));
  $("downloadJsonBtn").addEventListener("click", downloadJson);
  $("resetDeckBtn").addEventListener("click", resetDeck);
  $("exportPdfBtn").addEventListener("click", exportPdf);
  $("slideTypeSelect").addEventListener("change", e => changeSlideType(e.target.value));
  $("speakerNote").addEventListener("input", e => { state.deck.slides[state.selected].note = e.target.value; saveDraft(); });
  document.addEventListener("keydown", handleKeys);
}

function renderAll() {
  $("deckTitle").textContent = state.deck.meta.title;
  renderThumbs();
  renderEditorSlide();
  const slide = state.deck.slides[state.selected];
  $("slideTypeSelect").value = slide.type || "content";
  $("speakerNote").value = slide.note || "";
}

function renderThumbs() {
  const list = $("thumbList");
  list.innerHTML = "";
  state.deck.slides.forEach((slide, i) => {
    const btn = document.createElement("button");
    btn.className = `thumb ${i === state.selected ? "is-selected" : ""}`;
    btn.type = "button";
    btn.setAttribute("aria-label", `Select slide ${i + 1}`);
    btn.innerHTML = `<div class="thumb-frame">${renderSlide(slide, i, "thumbnail")}</div>`;
    btn.addEventListener("click", () => { state.selected = i; renderAll(); });
    list.appendChild(btn);
  });
}

function renderEditorSlide() {
  const host = $("editorSlide");
  host.innerHTML = renderSlide(state.deck.slides[state.selected], state.selected, "edit");
  bindEditable(host);
}

function editAttr(path) {
  return `contenteditable="true" spellcheck="true" data-edit-path="${path}"`;
}

function editableText(path, value, tag = "span", cls = "") {
  return `<${tag} ${editAttr(path)} class="${cls}">${escapeHtml(value)}</${tag}>`;
}

function renderSlide(slide, index, mode = "present") {
  const editable = mode === "edit";
  const path = (field) => `slides.${index}.${field}`;
  const e = (field, value, tag, cls) => editable ? editableText(path(field), value, tag, cls) : `<${tag} class="${cls}">${escapeHtml(value || "")}</${tag}>`;
  const cls = `deck-slide ${slide.type || "content"}-slide ${editable ? "edit-mode" : ""} ${mode === "pdf" ? "pdf-mode is-active" : ""}`;
  const header = `
    <div class="slide-header">
      ${slide.eyebrow !== undefined ? e("eyebrow", slide.eyebrow, "p", "kicker") : ""}
      ${e("headline", slide.headline || "Untitled slide", "h1", "headline grad")}
      ${slide.subheadline !== undefined ? e("subheadline", slide.subheadline, "p", "subheadline") : ""}
    </div>`;
  const body = renderSlideBody(slide, index, editable);
  const cta = slide.cta !== undefined ? `<div data-animate style="--d:8" class="cta-band">${editable ? editableText(path("cta"), slide.cta, "span", "") : escapeHtml(slide.cta)}</div>` : "";
  return `<article class="${cls}" data-slide-index="${index}"><div class="orb-grid"></div><div data-animate style="--d:0">${header}</div>${body}${cta}</article>`;
}

function renderSlideBody(slide, index, editable) {
  if (slide.type === "beforeAfter") return renderBeforeAfter(slide, index, editable);
  if (slide.type === "process") return renderProcess(slide, index, editable);
  if (slide.type === "proof") return renderProof(slide, index, editable);
  if (slide.cards?.length) return renderCards(slide, index, editable);
  if (slide.bullets?.length) return renderBullets(slide, index, editable);
  return "";
}

function editableOrText(path, value, tag, cls, editable) {
  return editable ? editableText(path, value, tag, cls) : `<${tag} class="${cls}">${escapeHtml(value || "")}</${tag}>`;
}

function renderCards(slide, index, editable) {
  const countClass = slide.cards.length === 3 ? "count-3" : slide.cards.length === 2 ? "count-2" : "";
  return `<div class="cards-grid ${countClass}">${slide.cards.map((card, i) => `
    <div class="card" data-animate style="--d:${i + 2}">
      ${editableOrText(`slides.${index}.cards.${i}.title`, card.title, "h3", "", editable)}
      ${editableOrText(`slides.${index}.cards.${i}.body`, card.body, "p", "", editable)}
    </div>`).join("")}</div>`;
}

function renderBeforeAfter(slide, index, editable) {
  const col = (side, delay) => `<div class="panel" data-animate style="--d:${delay}">
    ${editableOrText(`slides.${index}.${side}.title`, slide[side]?.title, "h3", "", editable)}
    <ul>${(slide[side]?.bullets || []).map((b, i) => `<li>${editableOrText(`slides.${index}.${side}.bullets.${i}`, b, "span", "", editable)}</li>`).join("")}</ul>
  </div>`;
  return `<div class="comparison">${col("left", 2)}<div class="divider-arrow" data-animate style="--d:4">→</div>${col("right", 5)}</div>`;
}

function renderProcess(slide, index, editable) {
  const steps = (slide.steps || []).map((step, i) => `<div class="step" data-animate style="--d:${i + 2}">
    <div class="step-number">${i + 1}</div>
    ${editableOrText(`slides.${index}.steps.${i}.title`, step.title, "h3", "", editable)}
    ${editableOrText(`slides.${index}.steps.${i}.body`, step.body, "p", "", editable)}
  </div>`).join("");
  const cards = slide.cards?.length ? renderCards(slide, index, editable) : "";
  return `<div class="process-flow">${steps}</div>${cards}`;
}

function renderProof(slide, index, editable) {
  const metrics = (slide.metrics || []).map((m, i) => `<div class="metric" data-animate style="--d:${i + 2}">
    ${editableOrText(`slides.${index}.metrics.${i}.value`, m.value, "div", "metric-value", editable)}
    ${editableOrText(`slides.${index}.metrics.${i}.label`, m.label, "div", "metric-label", editable)}
  </div>`).join("");
  return `<div class="metrics-grid">${metrics}</div>${renderBullets(slide, index, editable)}`;
}

function renderBullets(slide, index, editable) {
  return `<div class="proof-bottom" data-animate style="--d:8"><ul class="bullet-list">${(slide.bullets || []).map((b, i) => `<li>${editableOrText(`slides.${index}.bullets.${i}`, b, "span", "", editable)}</li>`).join("")}</ul></div>`;
}

function bindEditable(root) {
  root.querySelectorAll("[contenteditable][data-edit-path]").forEach(el => {
    el.addEventListener("paste", e => {
      e.preventDefault();
      document.execCommand("insertText", false, e.clipboardData.getData("text/plain"));
    });
    el.addEventListener("input", () => {
      setByPath(state.deck, el.dataset.editPath, el.innerText.trim());
      saveDraft();
    });
    el.addEventListener("blur", () => { renderThumbs(); });
  });
}

function setByPath(obj, path, value) {
  const parts = path.split(".");
  let ref = obj;
  for (let i = 0; i < parts.length - 1; i++) ref = ref[parts[i]];
  ref[parts.at(-1)] = value;
}

function enterPresentMode() {
  state.presentIndex = state.selected;
  $("appShell").hidden = true;
  $("presentShell").hidden = false;
  document.body.classList.add("presenting");
  renderPresent();
  $("presentShell").requestFullscreen?.().catch(() => {});
}

function exitPresentMode() {
  document.exitFullscreen?.().catch(() => {});
  $("presentShell").hidden = true;
  $("appShell").hidden = false;
  state.selected = state.presentIndex;
  document.body.classList.remove("presenting");
  renderAll();
}

function renderPresent() {
  const stage = $("presentStage");
  stage.innerHTML = state.deck.slides.map((s, i) => renderSlide(s, i, "present")).join("");
  requestAnimationFrame(() => {
    stage.querySelectorAll(".deck-slide").forEach((el, i) => el.classList.toggle("is-active", i === state.presentIndex));
  });
  $("slideCounter").textContent = `${state.presentIndex + 1} / ${state.deck.slides.length}`;
  $("presentProgressFill").style.width = `${((state.presentIndex + 1) / state.deck.slides.length) * 100}%`;
}

function navigatePresent(dir) {
  const next = Math.max(0, Math.min(state.deck.slides.length - 1, state.presentIndex + dir));
  if (next === state.presentIndex) return;
  state.presentIndex = next;
  renderPresent();
}

function handleKeys(e) {
  if ($("presentShell").hidden) return;
  if (["ArrowRight", " "].includes(e.key)) { e.preventDefault(); navigatePresent(1); }
  if (e.key === "ArrowLeft") { e.preventDefault(); navigatePresent(-1); }
  if (e.key === "Escape") exitPresentMode();
}

function addSlide() {
  const slide = { type: "content", eyebrow: "New slide", headline: "Editable headline", subheadline: "Add a clear supporting sentence.", bullets: ["Editable point one", "Editable point two"], note: "" };
  state.deck.slides.splice(state.selected + 1, 0, slide);
  state.selected++;
  saveDraft(); renderAll();
}
function duplicateSlide() { state.deck.slides.splice(state.selected + 1, 0, deepClone(state.deck.slides[state.selected])); state.selected++; saveDraft(); renderAll(); }
function deleteSlide() {
  if (state.deck.slides.length === 1) state.deck.slides[0] = { type: "content", eyebrow: "Empty slide", headline: "Editable headline", subheadline: "Start writing here.", bullets: ["Editable bullet"], note: "" };
  else state.deck.slides.splice(state.selected, 1);
  state.selected = Math.min(state.selected, state.deck.slides.length - 1);
  saveDraft(); renderAll();
}
function moveSlide(dir) {
  const target = state.selected + dir;
  if (target < 0 || target >= state.deck.slides.length) return;
  [state.deck.slides[state.selected], state.deck.slides[target]] = [state.deck.slides[target], state.deck.slides[state.selected]];
  state.selected = target; saveDraft(); renderAll();
}
function changeSlideType(type) { state.deck.slides[state.selected].type = type; normalizeSlide(state.deck.slides[state.selected]); saveDraft(); renderAll(); }
function normalizeSlide(slide) {
  slide.headline ||= "Editable headline";
  slide.subheadline ??= "Editable supporting sentence.";
  if (slide.type === "cards") slide.cards ||= [{ title: "Card title", body: "Card body" }, { title: "Card title", body: "Card body" }];
  if (slide.type === "process") slide.steps ||= [{ title: "Step one", body: "Step body" }, { title: "Step two", body: "Step body" }];
  if (slide.type === "beforeAfter") { slide.left ||= { title: "Before", bullets: ["Editable point"] }; slide.right ||= { title: "After", bullets: ["Editable point"] }; }
  if (slide.type === "proof") slide.metrics ||= [{ value: "0%", label: "Metric label" }];
}
function downloadJson() {
  const blob = new Blob([JSON.stringify(state.deck, null, 2)], { type: "application/json" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "content.json"; a.click(); URL.revokeObjectURL(a.href);
}
function resetDeck() {
  try { localStorage.removeItem(state.storageKey); } catch {}
  state.deck = deepClone(state.originalDeck); state.selected = 0; renderAll();
}
async function loadScript(src) {
  if ([...document.scripts].some(s => s.src === src)) return;
  await new Promise((resolve, reject) => { const s = document.createElement("script"); s.src = src; s.onload = resolve; s.onerror = reject; document.head.appendChild(s); });
}
async function exportPdf() {
  const btn = $("exportPdfBtn");
  const old = btn.textContent;
  btn.disabled = true; btn.textContent = "Exporting..."; document.body.classList.add("exportingPdf");
  try {
    await loadScript("https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js");
    await loadScript("https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js");
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ orientation: "landscape", unit: "px", format: [1920, 1080] });
    for (let i = 0; i < state.deck.slides.length; i++) {
      const stage = document.createElement("div");
      stage.id = "pdfStage";
      stage.innerHTML = renderSlide(state.deck.slides[i], i, "pdf");
      document.body.appendChild(stage);
      const canvas = await html2canvas(stage, { backgroundColor: "#050611", scale: Math.max(window.devicePixelRatio || 1, 2), useCORS: true });
      if (i > 0) pdf.addPage([1920, 1080], "landscape");
      pdf.addImage(canvas.toDataURL("image/png"), "PNG", 0, 0, 1920, 1080);
      stage.remove();
    }
    pdf.save("FlowPitch.pdf");
  } catch (err) {
    alert("PDF export failed. cdnjs.cloudflare.com must be allowed, or html2canvas and jsPDF must be self-hosted.");
  } finally {
    document.body.classList.remove("exportingPdf"); btn.disabled = false; btn.textContent = old;
  }
}
function fallbackDeck() { return { meta: { deckId: "fallback", title: "Fallback Deck" }, slides: [{ type: "title", eyebrow: "Fallback", headline: "Open through a local server", subheadline: "Your browser blocked content.json fetch.", cta: "Try: python -m http.server" }] }; }
