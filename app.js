(() => {
  const state = { deck: null, original: null, selected: 0, presenting: false, direction: 'next', storage: true };
  const $ = (id) => document.getElementById(id);
  const els = {
    topbar: $('topbar'), deckTitle: $('deckTitle'), editorSlide: $('editorSlide'), thumbs: $('thumbs'), presenter: $('presenter'),
    presentStage: $('presentStage'), slideCounter: $('slideCounter'), progressFill: $('progressFill'), presentDots: $('presentDots'),
    slideTypeSelect: $('slideTypeSelect'), accentSelect: $('accentSelect'), speakerNote: $('speakerNote'), storageWarning: $('storageWarning'),
    presentBtn: $('presentBtn'), exportPdfBtn: $('exportPdfBtn'), downloadJsonBtn: $('downloadJsonBtn'), resetDeckBtn: $('resetDeckBtn'),
    addSlideBtn: $('addSlideBtn'), duplicateSlideBtn: $('duplicateSlideBtn'), deleteSlideBtn: $('deleteSlideBtn'), moveUpBtn: $('moveUpBtn'), moveDownBtn: $('moveDownBtn'),
    prevBtn: $('prevBtn'), nextBtn: $('nextBtn'), exitPresentBtn: $('exitPresentBtn')
  };

  const clone = (obj) => JSON.parse(JSON.stringify(obj));
  const escapeHtml = (str = '') => String(str).replace(/[&<>"]/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[s]));
  const storageKey = () => `flowpitch:${state.original?.meta?.deckId || state.deck?.meta?.deckId || 'deck'}:draft`;

  function setTopOffset() {
    const h = els.topbar?.getBoundingClientRect().height || 76;
    document.documentElement.style.setProperty('--topOffset', `${Math.ceil(h)}px`);
  }

  function saveDraft() {
    if (!state.deck) return;
    try { localStorage.setItem(storageKey(), JSON.stringify(state.deck)); state.storage = true; }
    catch { state.storage = false; els.storageWarning.hidden = false; }
  }

  async function init() {
    setTopOffset(); window.addEventListener('resize', setTopOffset);
    try {
      const res = await fetch('content.json', { cache: 'no-store' });
      if (!res.ok) throw new Error(`Could not load content.json (${res.status})`);
      state.original = await res.json();
      const key = `flowpitch:${state.original.meta.deckId}:draft`;
      const saved = safeGet(key);
      state.deck = saved ? JSON.parse(saved) : clone(state.original);
      applyTheme(); bindEvents(); renderAll(); setupPdfExport();
    } catch (err) {
      document.body.innerHTML = `<main style="max-width:760px;margin:10vh auto;font-family:system-ui;padding:28px;line-height:1.5"><h1>Unable to load the deck</h1><p>This browser blocked loading <code>content.json</code> directly from the file system. Open this folder through a simple local server, for example <code>python -m http.server</code>, then visit the local address shown in the terminal.</p><p>${escapeHtml(err.message)}</p></main>`;
    }
  }

  function safeGet(key) { try { return localStorage.getItem(key); } catch { state.storage = false; return null; } }
  function applyTheme() {
    const accent = state.deck?.meta?.accent || '#1f6feb';
    document.documentElement.style.setProperty('--accent', accent);
    els.accentSelect.value = accent;
    els.storageWarning.hidden = state.storage;
  }

  function bindEvents() {
    els.presentBtn.addEventListener('click', enterPresentMode);
    els.prevBtn.addEventListener('click', prevSlide);
    els.nextBtn.addEventListener('click', nextSlide);
    els.exitPresentBtn.addEventListener('click', exitPresentMode);
    els.downloadJsonBtn.addEventListener('click', downloadJson);
    els.resetDeckBtn.addEventListener('click', resetDeck);
    els.addSlideBtn.addEventListener('click', addSlide);
    els.duplicateSlideBtn.addEventListener('click', duplicateSlide);
    els.deleteSlideBtn.addEventListener('click', deleteSlide);
    els.moveUpBtn.addEventListener('click', () => moveSlide(-1));
    els.moveDownBtn.addEventListener('click', () => moveSlide(1));
    els.slideTypeSelect.addEventListener('change', () => { current().type = els.slideTypeSelect.value; ensureTypeFields(current()); changed(); });
    els.accentSelect.addEventListener('change', () => { state.deck.meta.accent = els.accentSelect.value; applyTheme(); changed(false); });
    els.speakerNote.addEventListener('input', () => { current().note = els.speakerNote.value; changed(false); });
    document.addEventListener('keydown', handleKeys);
    document.addEventListener('pointermove', pointerGlow);
  }

  function current() { return state.deck.slides[state.selected]; }
  function changed(rerender = true) { saveDraft(); if (rerender) renderAll(); else renderThumbs(); }
  function renderAll() { applyTheme(); els.deckTitle.textContent = state.deck.meta.title || 'Untitled deck'; renderThumbs(); renderEditor(); renderInspector(); }

  function renderThumbs() {
    els.thumbs.innerHTML = state.deck.slides.map((s, i) => `<button class="thumb ${i === state.selected ? 'active' : ''}" type="button" data-idx="${i}"><div class="thumb-num">${String(i+1).padStart(2,'0')}</div><div class="thumb-title">${escapeHtml(s.headline || 'Untitled slide')}</div><div class="thumb-type">${escapeHtml(s.type || 'content')}</div></button>`).join('');
    els.thumbs.querySelectorAll('.thumb').forEach(btn => btn.addEventListener('click', () => { state.selected = Number(btn.dataset.idx); renderAll(); }));
  }

  function renderEditor() { els.editorSlide.innerHTML = renderSlide(current(), state.selected, { editable: true, active: true }); attachEditableHandlers(els.editorSlide); }
  function renderInspector() { const s = current(); els.slideTypeSelect.value = s.type || 'content'; els.speakerNote.value = s.note || ''; }

  function editable(text, path, tag = 'div', cls = '') {
    return `<${tag} class="editable ${cls}" contenteditable="true" spellcheck="true" data-path="${path}">${escapeHtml(text || '')}</${tag}>`;
  }
  function textEl(text, tag = 'div', cls = '') { return `<${tag} class="${cls}">${escapeHtml(text || '')}</${tag}>`; }

  function renderSlide(slide, idx, opts = {}) {
    const active = opts.active ? ' is-active' : '';
    const top = `
      <div class="bg-grid" aria-hidden="true"></div>
      ${opts.editable ? editable(slide.eyebrow, 'eyebrow', 'div', 'eyebrow') : textEl(slide.eyebrow, 'div', 'eyebrow')} 
      ${opts.editable ? editable(slide.headline, 'headline', 'h2', 'headline') : textEl(slide.headline, 'h2', 'headline')} 
      ${slide.subheadline !== undefined ? (opts.editable ? editable(slide.subheadline, 'subheadline', 'p', 'subheadline') : textEl(slide.subheadline, 'p', 'subheadline')) : ''}`;
    let body = '';
    const type = slide.type || 'content';
    if (type === 'title') body = renderTitle(slide, opts);
    else if (type === 'cards') body = renderCards(slide, opts);
    else if (type === 'beforeAfter') body = renderBeforeAfter(slide, opts);
    else if (type === 'process') body = renderProcess(slide, opts);
    else if (type === 'proof') body = renderProof(slide, opts);
    else if (type === 'visual') body = renderVisual(slide, opts);
    else if (type === 'section') body = renderSection(slide, opts);
    else if (type === 'closing') body = renderClosing(slide, opts);
    else body = renderContent(slide, opts);
    return `<article class="slide-shell slide-${type}${active}" data-slide-index="${idx}">${top}${body}<div class="slide-number">${idx + 1}</div></article>`;
  }

  function renderTitle(s, opts) {
    const metrics = (s.metrics || []).map((m, i) => `<div class="metric" data-animate style="--d:${250+i*130}ms">${opts.editable ? editable(m.value, `metrics.${i}.value`, 'div', 'metric-value') : textEl(m.value, 'div', 'metric-value')} ${opts.editable ? editable(m.label, `metrics.${i}.label`, 'div', 'metric-label') : textEl(m.label, 'div', 'metric-label')}</div>`).join('');
    return `<div class="grid-2">${metrics}</div>`;
  }
  function renderCards(s, opts) { return `<div class="grid-${Math.min(s.cards?.length || 3, 4)}">${(s.cards || []).map((c,i)=>`<div class="card" data-animate style="--d:${180+i*120}ms">${opts.editable ? editable(c.title, `cards.${i}.title`, 'h3') : textEl(c.title,'h3')} ${opts.editable ? editable(c.body, `cards.${i}.body`, 'p') : textEl(c.body,'p')}</div>`).join('')}</div>`; }
  function renderBeforeAfter(s, opts) {
    const panel = (side, name, delay) => `<div class="panel" data-animate style="--d:${delay}ms">${opts.editable ? editable(side?.title, `${name}.title`, 'h3') : textEl(side?.title,'h3')}<ul class="clean">${(side?.bullets || []).map((b,i)=>`<li>${opts.editable ? editable(b, `${name}.bullets.${i}`, 'span') : escapeHtml(b)}</li>`).join('')}</ul></div>`;
    return `<div class="grid-2">${panel(s.left || {}, 'left', 200)}${panel(s.right || {}, 'right', 420)}</div>`;
  }
  function renderProcess(s, opts) { return `<div class="process">${(s.steps || []).map((st,i)=>`<div class="step" data-animate style="--d:${180+i*110}ms"><div class="step-index">${i+1}</div>${opts.editable ? editable(st.title, `steps.${i}.title`, 'h3') : textEl(st.title,'h3')}${opts.editable ? editable(st.body, `steps.${i}.body`, 'p') : textEl(st.body,'p')}</div>`).join('')}</div>`; }
  function renderProof(s, opts) {
    const metrics = `<div class="grid-3">${(s.metrics || []).map((m,i)=>`<div class="metric" data-animate style="--d:${170+i*130}ms">${opts.editable ? editable(m.value, `metrics.${i}.value`, 'div', 'metric-value') : textEl(m.value,'div','metric-value')} ${opts.editable ? editable(m.label, `metrics.${i}.label`, 'div', 'metric-label') : textEl(m.label,'div','metric-label')}</div>`).join('')}</div>`;
    return `${metrics}${renderBullets(s, opts)}${s.cta !== undefined ? (opts.editable ? editable(s.cta, 'cta', 'div', 'cta') : `<div class="cta" data-animate style="--d:650ms">${escapeHtml(s.cta)}</div>`) : ''}`;
  }
  function renderVisual(s, opts) { return `${renderBullets(s, opts)}<div class="visual-diagram" data-animate style="--d:480ms">${diagram()}</div>`; }
  function renderSection(s, opts) { return `<div data-animate style="--d:250ms">${renderBullets(s, opts)}</div>`; }
  function renderClosing(s, opts) { return `${renderBullets(s, opts)}${opts.editable ? editable(s.cta, 'cta', 'div', 'cta') : `<div class="cta" data-animate style="--d:450ms">${escapeHtml(s.cta || '')}</div>`}`; }
  function renderContent(s, opts) { return renderBullets(s, opts); }
  function renderBullets(s, opts) { return `<ul class="clean">${(s.bullets || []).map((b,i)=>`<li data-animate style="--d:${180+i*90}ms">${opts.editable ? editable(b, `bullets.${i}`, 'span') : escapeHtml(b)}</li>`).join('')}</ul>`; }
  function diagram() {
    const nodes = [[12,22],[32,36],[54,27],[75,42],[38,62],[63,68],[83,72],[21,78]];
    const edges = [[12,22,26,20,32],[32,36,26,-15,25],[32,36,9,28,30],[54,27,24,18,37],[38,62,25,8,16],[63,68,22,3,8],[21,78,18,-30,29]];
    return edges.map(e=>`<span class="edge" style="left:${e[0]}%;top:${e[1]}%;width:${e[2]}%;transform:rotate(${e[3]}deg)"></span>`).join('') + nodes.map(n=>`<span class="node" style="left:${n[0]}%;top:${n[1]}%"></span>`).join('');
  }

  function attachEditableHandlers(root) {
    root.querySelectorAll('[contenteditable][data-path]').forEach(el => {
      el.addEventListener('input', () => { setPath(current(), el.dataset.path, el.innerText.trim()); saveDraft(); renderThumbs(); });
      el.addEventListener('blur', () => renderInspector());
      el.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); el.blur(); } });
    });
  }
  function setPath(obj, path, value) {
    const parts = path.split('.'); let ref = obj;
    for (let i=0; i<parts.length-1; i++) ref = ref[parts[i]];
    ref[parts.at(-1)] = value;
  }
  function ensureTypeFields(s) { s.bullets ||= ['Key point one', 'Key point two']; s.cards ||= [{title:'Card title', body:'Card body'}]; s.steps ||= [{title:'Step title', body:'Step body'}]; s.metrics ||= [{value:'Metric', label:'Label'}]; s.left ||= {title:'Before', bullets:['Point']}; s.right ||= {title:'After', bullets:['Point']}; }

  function addSlide() { const s = { type:'content', eyebrow:'New slide', headline:'Editable slide headline', subheadline:'Add your supporting message here.', bullets:['First key point','Second key point'], note:'' }; state.deck.slides.splice(state.selected+1,0,s); state.selected++; changed(); }
  function duplicateSlide() { state.deck.slides.splice(state.selected+1,0,clone(current())); state.selected++; changed(); }
  function deleteSlide() { if (state.deck.slides.length === 1) state.deck.slides[0] = { type:'content', eyebrow:'Placeholder', headline:'New slide', subheadline:'Start editing.', bullets:['Add a key point'], note:'' }; else { state.deck.slides.splice(state.selected,1); state.selected = Math.max(0, state.selected-1); } changed(); }
  function moveSlide(dir) { const ni = state.selected + dir; if (ni < 0 || ni >= state.deck.slides.length) return; [state.deck.slides[state.selected], state.deck.slides[ni]] = [state.deck.slides[ni], state.deck.slides[state.selected]]; state.selected = ni; changed(); }

  function enterPresentMode() { state.presenting = true; document.body.classList.add('presenting'); els.presenter.classList.add('active'); els.presenter.setAttribute('aria-hidden','false'); renderPresenter(true); document.documentElement.requestFullscreen?.().catch(()=>{}); }
  function exitPresentMode() { state.presenting = false; document.body.classList.remove('presenting'); els.presenter.classList.remove('active'); els.presenter.setAttribute('aria-hidden','true'); document.exitFullscreen?.().catch(()=>{}); renderAll(); }
  function renderPresenter(first=false) {
    els.presenter.classList.toggle('prev-dir', state.direction === 'prev');
    els.presentStage.innerHTML = renderSlide(current(), state.selected, { editable:false, active:false });
    requestAnimationFrame(()=>{ const slide = els.presentStage.querySelector('.slide-shell'); slide?.classList.add('is-active'); animateCounters(slide); });
    els.slideCounter.textContent = `${state.selected + 1} / ${state.deck.slides.length}`;
    els.progressFill.style.width = `${((state.selected+1)/state.deck.slides.length)*100}%`;
    els.presentDots.innerHTML = state.deck.slides.map((_,i)=>`<button type="button" aria-label="Go to slide ${i+1}" class="${i===state.selected?'active':''}" data-idx="${i}"></button>`).join('');
    els.presentDots.querySelectorAll('button').forEach(b=>b.addEventListener('click',()=>{ state.direction = Number(b.dataset.idx) < state.selected ? 'prev':'next'; state.selected=Number(b.dataset.idx); renderPresenter(); }));
  }
  function animateCounters(root) {
    root?.querySelectorAll('.metric-value').forEach(el => {
      const raw = el.textContent.trim(); const match = raw.match(/^~?([0-9]+(?:\.[0-9]+)?)(%?)$/); if (!match) return;
      const target = Number(match[1]); const suffix = match[2] || ''; const prefix = raw.startsWith('~') ? '~' : ''; const start = performance.now();
      const tick = (t) => { const p = Math.min(1,(t-start)/850); const v = target*p; el.textContent = `${prefix}${target < 2 ? v.toFixed(2) : Math.round(v)}${suffix}`; if (p<1) requestAnimationFrame(tick); else el.textContent = raw; };
      requestAnimationFrame(tick);
    });
  }
  function nextSlide() { if (!state.presenting) return; if (state.selected < state.deck.slides.length-1) { state.direction='next'; state.selected++; renderPresenter(); } }
  function prevSlide() { if (!state.presenting) return; if (state.selected > 0) { state.direction='prev'; state.selected--; renderPresenter(); } }
  function handleKeys(e) { if (!state.presenting) return; if (e.key === 'Escape') exitPresentMode(); if (e.key === ' ' || e.key === 'ArrowRight') { e.preventDefault(); nextSlide(); } if (e.key === 'ArrowLeft') { e.preventDefault(); prevSlide(); } }
  function pointerGlow(e) { if (!state.presenting) return; document.documentElement.style.setProperty('--mx', `${e.clientX}px`); document.documentElement.style.setProperty('--my', `${e.clientY}px`); }
  function downloadJson() { const blob = new Blob([JSON.stringify(state.deck,null,2)], {type:'application/json'}); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'content.json'; a.click(); URL.revokeObjectURL(a.href); }
  function resetDeck() { try { localStorage.removeItem(storageKey()); } catch {} state.deck = clone(state.original); state.selected = 0; changed(); }

  function loadScript(src) { return new Promise((resolve,reject)=>{ if ([...document.scripts].some(s=>s.src===src)) return resolve(); const s=document.createElement('script'); s.src=src; s.onload=resolve; s.onerror=reject; document.head.appendChild(s); }); }
  function setupPdfExport() { els.exportPdfBtn.addEventListener('click', exportPdf); }
  async function exportPdf() {
    const btn = els.exportPdfBtn; const label = btn.textContent;
    try {
      btn.disabled = true; btn.textContent = 'Exporting…'; document.body.classList.add('exportingPdf');
      await loadScript('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js');
      await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
      const { jsPDF } = window.jspdf;
      const pdf = new jsPDF({ orientation:'landscape', unit:'px', format:[1920,1080], compress:true });
      for (let i=0; i<state.deck.slides.length; i++) {
        const stage = document.createElement('div'); stage.id = 'pdfStage';
        stage.innerHTML = `<div class="present-bg"><span></span><span></span><span></span></div>${renderSlide(state.deck.slides[i], i, { editable:false, active:true })}`;
        document.body.appendChild(stage);
        await new Promise(r => requestAnimationFrame(()=>requestAnimationFrame(r)));
        const canvas = await window.html2canvas(stage, { backgroundColor:'#050611', scale: Math.max(window.devicePixelRatio || 1, 2), useCORS: true });
        const img = canvas.toDataURL('image/png');
        if (i > 0) pdf.addPage([1920,1080], 'landscape');
        pdf.addImage(img, 'PNG', 0, 0, 1920, 1080);
        stage.remove();
      }
      pdf.save('FlowPitch.pdf');
    } catch (err) {
      alert('PDF export could not load its capture libraries. Please allow cdnjs.cloudflare.com, or self-host html2canvas and jsPDF.\n\n' + err.message);
    } finally {
      document.querySelectorAll('#pdfStage').forEach(el=>el.remove());
      document.body.classList.remove('exportingPdf'); btn.disabled = false; btn.textContent = label;
    }
  }

  init();
})();
