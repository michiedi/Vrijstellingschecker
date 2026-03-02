/* ============================
   STATE
   ============================ */
let schema = null;
let answers = {};
let order = [];
let idx = 0;

/* ============================
   HELPERS
   ============================ */
function valToBool(v){
  if (typeof v === 'boolean') return v;
  if (v === 'true' || v === true) return true;
  if (v === 'false' || v === false) return false;
  return null;
}

function shouldAsk(q, ans){
  // route filter
  if (q.route && ans.CAT_01 && q.route !== ans.CAT_01) return false;

  // simple required_if {question, equals}
  if (q.required_if && q.required_if.question){
    const v = ans[q.required_if.question];
    return v === q.required_if.equals;
  }
  return true;
}

function renderQuestion(q){
  const c = document.getElementById('question-container');
  c.innerHTML = '';

  const div = document.createElement('div');
  div.className = 'question';

  let input = '';
  if (q.answer_type === 'boolean'){
    input = `
      <select id="${q.id}">
        <option value="">-- kies --</option>
        <option value="true">Ja</option>
        <option value="false">Nee</option>
      </select>`;
  } else if (q.answer_type === 'enum'){
    input = `
      <select id="${q.id}">
        <option value="">-- kies --</option>
        ${(q.options||[]).map(o=>`<option value="${o.value}">${o.label}</option>`).join('')}
      </select>`;
  } else if (q.answer_type === 'number'){
    input = `<input id="${q.id}" type="number" step="any" />`;
  } else {
    input = `<input id="${q.id}" type="text" />`;
  }

  div.innerHTML = `<label>${q.text}</label>${input}`;
  c.appendChild(div);

  document.getElementById('prev-btn').classList.toggle('hidden', idx===0);
  document.getElementById('next-btn').classList.remove('hidden');
}

function findNextIndex(start){
  for (let i=start;i<order.length;i++){
    if (shouldAsk(order[i], answers)) return i;
  }
  return -1;
}

function collectCurrent(){
  const q = order[idx];
  const el = document.getElementById(q.id);
  if (!el) return false;
  let v = el.value;
  if (v === '') return false;
  if (q.answer_type === 'number') v = Number(v);

  // Als categorie wijzigt, ruim route‑specifieke antwoorden op
  if (q.id === 'CAT_01' && answers.CAT_01 && answers.CAT_01 !== v){
    resetRouteAnswers();
  }

  answers[q.id] = v;
  return true;
}

function resetRouteAnswers(){
  const keep = new Set(['EXC_01','EXC_02','EXC_03','EXC_04','CAT_01']);
  Object.keys(answers).forEach(k=>{
    if (!keep.has(k)) delete answers[k];
  });
}

function onNext(){
  const ok = collectCurrent();
  if (!ok){ alert('Gelieve een antwoord te geven.'); return; }

  const ni = findNextIndex(idx+1);
  if (ni === -1){
    evaluate(); // einde → conclusie
    return;
  }
  idx = ni; renderQuestion(order[idx]);

  // Verberg resultaat zodra we verder klikken
  const res = document.getElementById('result');
  res.classList.add('hidden');
}
function onPrev(){
  // Ga terug naar vorige VRAAG in sequence (niet herberekenen)
  idx = Math.max(0, idx-1);
  renderQuestion(order[idx]);

  const res = document.getElementById('result');
  res.classList.add('hidden');
}
function resetTool(){
  try {
    // 1) Wis de antwoorden en zet index terug
    answers = {};
    idx = 0;

    // 2) Sluit modal en reset copy-knop
    const modal = document.getElementById("report-modal");
    const txt   = document.getElementById("report-text");
    const copy  = document.getElementById("copy-btn");
    if (modal) modal.classList.add("hidden");
    if (txt)   txt.value = "";
    if (copy)  copy.innerText = "Kopieer tekst";

    // 3) Verberg en leeg het resultaatkader
    const res = document.getElementById("result");
    if (res) {
      res.classList.add("hidden");
      res.style.background = "";
      res.style.border = "";
      res.innerHTML = "";
    }

    // 4) Render opnieuw vanaf de eerste relevante vraag
    if (!schema || !schema.questionnaire || !schema.questionnaire.questions) {
      // Als er iets fout loopt met het schema, hard reset
      console.warn("[resetTool] Schema niet aanwezig, herlaad pagina");
      window.location.reload();
      return;
    }

    order = schema.questionnaire.questions;

    // Zoek de eerste vraag die gesteld mag worden
    let start = findNextIndex(0);
    if (start === -1) {
      // Val terug op de categorie-vraag, en anders op index 0
      start = order.findIndex(q => q.id === "CAT_01");
      if (start < 0) start = 0;
    }
    idx = start;
    renderQuestion(order[idx]);

    // 5) Scroll naar boven (fijne UX)
    window.scrollTo({ top: 0, behavior: "smooth" });

    console.log("[resetTool] Herstart succesvol.");
  } catch (e) {
    console.error("[resetTool] fout:", e);
    alert("Kon de tool niet herstarten. Probeer de pagina te verversen (Ctrl/Cmd+R).");
  }
}

/* ============================
   EVALUATE + FAILURE UI
   ============================ */
function evaluate(){
  const res = document.getElementById('result');

  // Hou resultaat verborgen tot we echte uitkomst hebben
  res.classList.add('hidden');
  res.style.background = "";
  res.style.border = "";
  res.innerHTML = "";

  const failures = [];

  /* 1) Uitsluitingsgronden */
  const blocks = schema?.decision_logic?.exclusion_gate?.blocking_questions || [];
  blocks.forEach(id => {
    if (valToBool(answers[id]) === true) {
      const q = order.find(x => x.id === id) || { text: id };
      failures.push({
        id,
        label: q.text,
        basis: q.legal_basis || "Artikel 6 VCRO",
        message: q.fail_message || "Deze uitsluitingsgrond verhindert toepassing van het meldingsbesluit."
      });
    }
  });
  if (failures.length) {
    return showFailures(res, failures, "Geen melding mogelijk (uitsluitingsgronden)");
  }

  /* 2) Route‑regels */
  const route = answers.CAT_01;
  const rule = (schema?.decision_logic?.route_rules || []).find(r => r.route === route);

  if (!rule) {
    res.style.background = "#fff7dd";
    res.style.border = "1px solid orange";
    res.innerHTML = "⚠ Geen route-logica gevonden. Kies eerst een hoofdcategorie.";
    res.classList.remove('hidden');
    return;
  }

  // Verplichte booleans
  (rule.required_true || []).forEach(qid => {
    const v = valToBool(answers[qid]);
    if (v !== true) {
      const q = order.find(x => x.id === qid) || { text: qid };
      failures.push({
        id: qid,
        label: q.text,
        basis: q.legal_basis || "(geen basis in schema)",
        message: q.fail_message || "Deze voorwaarde moet 'ja' zijn."
      });
    }
  });

  // Numerieke validaties
  (rule.required_numeric || []).forEach(n => {
    if (answers[n.id] === undefined) return;
    const val = Number(answers[n.id]);
    let bad = false;

    if (n.rule === "max" && !(val <= n.value)) bad = true;
    if (n.rule === "min" && !(val >= n.value)) bad = true;
    if (n.rule === "exclusiveMax" && !(val < n.value)) bad = true;

    if (bad) {
      const q = order.find(x => x.id === n.id) || { text: n.id };
      failures.push({
        id: n.id,
        label: q.text,
        basis: q.legal_basis || "(geen basis in schema)",
        message: q.fail_message || `Waarde ${val} voldoet niet aan '${n.rule} ${n.value}'.`
      });
    }
  });

  // FAIL?
  if (failures.length) {
    return showFailures(res, failures, "Geen melding mogelijk (voorwaarden niet gehaald)");
  }

  // SUCCES → Gegrond
  res.style.background = "#dcfce7";
  res.style.border = "1px solid #4ade80";

  const verdict = "Gegrond — melding lijkt mogelijk.";
  const conclusionText = buildConclusionText({
    verdict,
    route,
    failures: []
  });

  res.innerHTML = `
    ✅ <strong>Melding lijkt mogelijk</strong> volgens route <strong>${route || "-"}</strong>.<br>
    Onder voorbehoud van lokale voorschriften en volledigheidscontrole.<br><br>
    <button onclick="showReportText('${encodeURIComponent(conclusionText)}')">Genereer verslagtekst</button>
  `;

  res.classList.remove('hidden');
}

function showFailures(res, failures, title){
  res.style.background = '#fee2e2';
  res.style.border = '1px solid #ef4444';

  const verdict = "Ongegrond — melding niet mogelijk.";
  const route = answers.CAT_01 || "-";
  const conclusionText = buildConclusionText({
    verdict,
    route,
    failures
  });

  let html = `
    ❌ <strong>${title}</strong><br><br>
    ${failures.map(f => `
      <div style="margin-bottom:10px">
        <strong>${f.id}</strong>: ${f.label}<br>
        ➤ <em>${f.message}</em><br>
        <span style="color:#555">(${f.basis})</span>
      </div>
    `).join('')}
    <br>
    <button onclick="showReportText('${encodeURIComponent(conclusionText)}')">Genereer verslagtekst</button>
  `;

  res.innerHTML = html;
  res.classList.remove('hidden');
}

/* ============================
   CONCLUSIETEKST OPBOUW
   ============================ */
function buildConclusionText({verdict, route, failures}){
  const header = `Conclusie: ${verdict}\nRoute: ${route || '-'}`;
  if (!failures || failures.length === 0){
    const body = [
      "Op basis van de ingevoerde gegevens voldoet de handeling aan de voorwaarden van het meldingsbesluit.",
      "De beoordeling is indicatief en onder voorbehoud van lokale voorschriften en verdere dossiercontrole."
    ].join(' ');
    return `${header}\n\n${body}`;
  }
  const reasons = failures.map((f,i)=>`${i+1}. ${f.label} — ${f.message} (${f.basis})`).join('\n');
  const footer = "Op basis hiervan kan de handeling niet onder de meldingsplicht worden uitgevoerd. Raadpleeg de bevoegde dienst voor een vergunningsaanvraag of aanpassing.";
  return `${header}\n\nRedenen:\n${reasons}\n\n${footer}`;
}

/* ============================
   MODAL / KOPIEER
   ============================ */
function showReportText(encoded){
  const modal = document.getElementById("report-modal");
  const textarea = document.getElementById("report-text");
  textarea.value = decodeURIComponent(encoded || '');

  modal.classList.remove("hidden");
}

document.addEventListener("DOMContentLoaded", () => {
  const closeBtn = document.getElementById("close-modal");
  const copyBtn  = document.getElementById("copy-btn");

  if (closeBtn) {
    closeBtn.onclick = () => {
      document.getElementById("report-modal").classList.add("hidden");
    };
  }

  if (copyBtn) {
    copyBtn.onclick = () => {
      const txt = document.getElementById("report-text").value;
      navigator.clipboard.writeText(txt);
      copyBtn.innerText = "Gekopieerd!";
      setTimeout(() => copyBtn.innerText = "Kopieer tekst", 1500);
    };
  }
});

/* ============================
   BOOTSTRAP
   ============================ */
/* ============================
   BOOTSTRAP / INITIALISATIE
   ============================ */
document.addEventListener('DOMContentLoaded', async () => {

  // 1) Schema laden
  schema = await loadSchema();
  if (!schema.questionnaire || !schema.questionnaire.questions.length) {
    console.warn('[boot] Geen vragen geladen – init afgebroken.');
    return;
  }

  // 2) Basisinstellingen
  order = schema.questionnaire.questions;
  idx = findNextIndex(0);

  if (idx === -1) {
    // toon eerst categorie-vraag als niets matcht
    idx = order.findIndex(q => q.id === 'CAT_01');
    if (idx < 0) idx = 0;
  }

  renderQuestion(order[idx]);
  console.log('[boot] klaar. Eerste vraag:', order[idx]?.id);

  // 3) Navigation knoppen
  document.getElementById('next-btn').onclick = onNext;
  document.getElementById('prev-btn').onclick = onPrev;

  // 4) Modal knoppen
  const closeBtn = document.getElementById("close-modal");
  const copyBtn  = document.getElementById("copy-btn");
  const resetBtn = document.getElementById("reset-btn");

  if (closeBtn) {
    closeBtn.onclick = () => document.getElementById("report-modal").classList.add("hidden");
  }

  if (copyBtn) {
    copyBtn.onclick = () => {
      const txt = document.getElementById("report-text").value;
      navigator.clipboard.writeText(txt);
      copyBtn.innerText = "Gekopieerd!";
      setTimeout(() => copyBtn.innerText = "Kopieer tekst", 1500);
    };
  }

  // 5) Reset knop
  if (resetBtn) {
    resetBtn.onclick = resetTool;
  }

});


/* ============================
   (OPTIONEEL) FOUT-OVERLAY
   ============================ */
(function attachGlobalErrorOverlay() {
  const showOverlay = (title, details) => {
    const res = document.getElementById('result') || document.body.appendChild(document.createElement('div'));
    res.id = 'result';
    res.classList.remove('hidden');
    res.style.background = '#fee2e2';
    res.style.border = '1px solid #ef4444';
    res.style.padding = '20px';
    res.style.borderRadius = '8px';
    res.style.marginTop = '20px';
    res.innerHTML = `
      ❌ <strong>${title}</strong><br><br>
      <pre style="white-space:pre-wrap;word-break:break-word;margin:0">${details}</pre>
    `;
  };

  window.addEventListener('error', (e) => {
    showOverlay('Onverwachte fout', `${e.message}\n@ ${e.filename}:${e.lineno}:${e.colno}`);
  });

  window.addEventListener('unhandledrejection', (e) => {
    showOverlay('Unhandled Promise Rejection', String(e.reason || 'Onbekende fout'));
  });
})();
