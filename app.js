/* ============================
   STATE
   ============================ */
let schema = null;
let catalog = null;
let decisionLogic = null;

let currentScenario = null;
let currentQuestions = [];
let answers = {};
let qIndex = 0;

/* ============================
   HELPER FUNCTIES
   ============================ */

function valToBool(v) {
  if (typeof v === "boolean") return v;
  if (v === "true" || v === "1") return true;
  if (v === "false" || v === "0") return false;
  return null;
}

async function loadSchema() {
  const url = new URL("./schema.json", window.location.href).toString();
  console.log("[schema-loader] fetch:", url);

  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`schema.json kon niet geladen worden (HTTP ${res.status})`);
  }
  const data = await res.json();
  console.log("[schema-loader] loaded keys:", Object.keys(data));

  if (
    !data.catalog ||
    !Array.isArray(data.catalog.domains) ||
    !Array.isArray(data.catalog.categories) ||
    !Array.isArray(data.catalog.scenarios)
  ) {
    throw new Error(
      'schema.json mist "catalog.domains/categories/scenarios" (nieuwe structuur vereist).'
    );
  }

  return data;
}

/* ============================
   UI: SCENARIO SELECTIE
   ============================ */

function renderScenarioList(domainId) {
  const listEl = document.getElementById("scenario-list");
  listEl.innerHTML = "";

  const scenarios = catalog.scenarios.filter((s) => s.domain_id === domainId);
  if (!scenarios.length) {
    listEl.innerHTML =
      "<p>Geen scenario's gevonden voor dit domein. Controleer schema.json.</p>";
    return;
  }

  const categoriesById = new Map(
    catalog.categories
      .filter((c) => c.domain_id === domainId)
      .map((c) => [c.category_id, c])
  );

  scenarios.forEach((s) => {
    const cat = categoriesById.get(s.category_id);
    const card = document.createElement("div");
    card.className = "scenario-card";

    const legal = (s.legal_basis || []).join("; ");

    card.innerHTML = `
      <div>
        <h3>${s.title}</h3>
        ${cat ? `<div class="legal-tag">${cat.label}</div>` : ""}
        <p>${s.description || ""}</p>
        ${
          legal
            ? `<p class="legal-tag"><strong>Juridische basis:</strong> ${legal}</p>`
            : ""
        }
      </div>
      <div>
        <button type="button" class="primary" data-scenario-id="${
          s.scenario_id
        }">Start toetsing</button>
      </div>
    `;

    const btn = card.querySelector("button");
    btn.addEventListener("click", () => startScenario(s.scenario_id));

    listEl.appendChild(card);
  });
}

/* ============================
   SCENARIO FLOW
   ============================ */

function startScenario(scenarioId) {
  const scenario = catalog.scenarios.find((s) => s.scenario_id === scenarioId);
  if (!scenario) {
    alert("Scenario niet gevonden in schema.");
    return;
  }
  currentScenario = scenario;
  currentQuestions = scenario.questions || [];
  answers = {};
  qIndex = 0;

  // toon scenario-sectie, verberg selectie
  document.getElementById("scenario-select-section").classList.add("hidden");
  document.getElementById("question-section").classList.remove("hidden");
  document.getElementById("result").classList.add("hidden");
  document.getElementById("result").innerHTML = "";

  document.getElementById("current-scenario-title").textContent =
    currentScenario.title;
  document.getElementById("current-scenario-desc").textContent =
    currentScenario.description || "";

  renderCurrentQuestion();
}

function renderCurrentQuestion() {
  const container = document.getElementById("question-container");
  container.innerHTML = "";

  if (!currentQuestions.length) {
    container.innerHTML =
      "<p>Er zijn geen vragen gedefinieerd voor dit scenario.</p>";
    return;
  }

  if (qIndex < 0) qIndex = 0;
  if (qIndex >= currentQuestions.length) {
    evaluateScenario();
    return;
  }

  const q = currentQuestions[qIndex];
  const wrapper = document.createElement("div");
  wrapper.className = "question";

  let inputHtml = "";
  if (q.answer_type === "boolean") {
    inputHtml = `
      <select id="${q.id}">
        <option value="">-- kies --</option>
        <option value="true">Ja</option>
        <option value="false">Nee</option>
      </select>
    `;
  } else if (q.answer_type === "enum") {
    const opts = (q.options || [])
      .map((o) => `<option value="${o.value}">${o.label}</option>`)
      .join("");
    inputHtml = `
      <select id="${q.id}">
        <option value="">-- kies --</option>
        ${opts}
      </select>
    `;
  } else if (q.answer_type === "number") {
    inputHtml = `<input id="${q.id}" type="number" step="any" />`;
  } else {
    inputHtml = `<input id="${q.id}" type="text" />`;
  }

  wrapper.innerHTML = `
    <label for="${q.id}">${q.text}</label>
    ${inputHtml}
    ${
      q.help
        ? `<div class="help">${q.help}</div>`
        : ""
    }
  `;

  container.appendChild(wrapper);

  // nav-knoppen
  document
    .getElementById("prev-btn")
    .classList.toggle("hidden", qIndex === 0);
  document.getElementById("next-btn").textContent =
    qIndex === currentQuestions.length - 1
      ? "Bekijk resultaat →"
      : "Volgende vraag →";
}

function collectCurrentAnswer() {
  const q = currentQuestions[qIndex];
  const el = document.getElementById(q.id);
  if (!el) return false;

  let v = el.value;
  if (v === "") return false;

  if (q.answer_type === "number") {
    v = Number(v);
    if (Number.isNaN(v)) return false;
  }

  answers[q.id] = v;
  return true;
}

/* ============================
   NAVIGATIE
   ============================ */

function onNext() {
  if (!collectCurrentAnswer()) {
    alert("Gelieve een antwoord te geven.");
    return;
  }
  qIndex += 1;
  renderCurrentQuestion();
  document.getElementById("result").classList.add("hidden");
}

function onPrev() {
  qIndex = Math.max(0, qIndex - 1);
  renderCurrentQuestion();
  document.getElementById("result").classList.add("hidden");
}

function backToScenarios() {
  currentScenario = null;
  currentQuestions = [];
  answers = {};
  qIndex = 0;

  document.getElementById("question-section").classList.add("hidden");
  document.getElementById("scenario-select-section").classList.remove("hidden");
  document.getElementById("result").classList.add("hidden");
  document.getElementById("result").innerHTML = "";
}

/* ============================
   EVALUATIE
   ============================ */

function evaluateScenario() {
  const res = document.getElementById("result");
  res.classList.remove("hidden");
  res.innerHTML = "";
  res.style.background = "";
  res.style.border = "";

  const domainId = currentScenario.domain_id;
  const rulesDomain = decisionLogic[domainId];
  if (!rulesDomain || !Array.isArray(rulesDomain.scenario_rules)) {
    res.style.background = "#fff7dd";
    res.style.border = "1px solid orange";
    res.innerHTML =
      "⚠ Er is nog geen beslislogica ingesteld voor dit scenario. Contacteer de beheerder.";
    return;
  }

  const rule = rulesDomain.scenario_rules.find(
    (r) => r.scenario_id === currentScenario.scenario_id
  );
  if (!rule) {
    res.style.background = "#fff7dd";
    res.style.border = "1px solid orange";
    res.innerHTML =
      "⚠ Geen beslisregels gevonden voor dit scenario. Contacteer de beheerder.";
    return;
  }

  const failures = [];
  const legalBasis =
    (currentScenario.legal_basis && currentScenario.legal_basis.join("; ")) ||
    "Vrijstellingsbesluit BVR 16 juli 2010";

  // required_true
  (rule.required_true || []).forEach((pid) => {
    const q = currentQuestions.find((qq) => qq.id === pid);
    const raw = answers[pid];
    const bool = valToBool(raw);
    if (bool !== true) {
      failures.push({
        id: pid,
        label: q ? q.text : pid,
        message: "Deze voorwaarde moet met 'ja' beantwoord zijn.",
        basis: legalBasis
      });
    }
  });

  // required_false (nu nog niet gebruikt, maar voorzien)
  (rule.required_false || []).forEach((pid) => {
    const q = currentQuestions.find((qq) => qq.id === pid);
    const raw = answers[pid];
    const bool = valToBool(raw);
    if (bool !== false) {
      failures.push({
        id: pid,
        label: q ? q.text : pid,
        message: "Deze voorwaarde moet met 'nee' beantwoord zijn.",
        basis: legalBasis
      });
    }
  });

  // numeric_rules
  (rule.numeric_rules || []).forEach((nr) => {
    const val = Number(answers[nr.parameter]);
    if (Number.isNaN(val)) {
      return;
    }
    let ok = true;
    if (nr.rule === "max" && !(val <= nr.value)) ok = false;
    if (nr.rule === "min" && !(val >= nr.value)) ok = false;
    if (nr.rule === "exclusiveMax" && !(val < nr.value)) ok = false;

    if (!ok) {
      const q = currentQuestions.find((qq) => qq.id === nr.parameter);
      failures.push({
        id: nr.parameter,
        label: q ? q.text : nr.parameter,
        message: `De waarde ${val} voldoet niet aan de grens (${nr.rule} ${nr.value}).`,
        basis: legalBasis
      });
    }
  });

  // VERDICT
  if (failures.length) {
    res.style.background = "#fee2e2";
    res.style.border = "1px solid #ef4444";

    const title =
      "Niet vrijgesteld – melding of vergunning kan nodig zijn (zie redenen hieronder).";

    const inner = [
      `<p><strong>❌ ${title}</strong></p>`,
      `<p>Juridische basis: ${legalBasis}</p>`,
      `<p>Redenen waarom de vrijstellingsvoorwaarden niet volledig gehaald zijn:</p>`,
      failures
        .map(
          (f, i) =>
            `<div class="failure-item"><strong>${i + 1}. ${
              f.label
            }</strong><br/><em>${f.message}</em><br/><span style="color:#555;">(${f.basis})</span></div>`
        )
        .join(""),
      `<p>Dit betekent dat de geplande handeling niet volledig binnen de vrijstelling valt. Mogelijk is een melding of omgevingsvergunning vereist. Neem contact op met de bevoegde dienst.</p>`,
      `<button type="button" class="secondary small" id="show-report-fail">Genereer verslagtekst</button>`
    ].join("");

    res.innerHTML = inner;

    const conclusionText = buildConclusionText({
      scenarioTitle: currentScenario.title,
      verdict: "NIET VRIJGESTELD",
      legalBasis,
      failures
    });

    const btn = document.getElementById("show-report-fail");
    if (btn) {
      btn.onclick = () => showReportText(conclusionText);
    }
    return;
  }

  // SUCCES – vrijgesteld
  res.style.background = "#dcfce7";
  res.style.border = "1px solid #4ade80";

  const title = "Vrijgesteld van omgevingsvergunning volgens het vrijstellingsbesluit.";

  const successHtml = [
    `<p><strong>✅ ${title}</strong></p>`,
    `<p>Juridische basis: ${legalBasis}</p>`,
    `<p>Op basis van de gegeven antwoorden voldoet de handeling aan alle voorwaarden die in het vrijstellingsbesluit zijn opgenomen voor dit type werken.</p>`,
    `<p>Let op: deze toetsing is indicatief en houdt geen formele beslissing van de overheid in. Lokale voorschriften (RUP, BPA, verordening, verkavelingsvoorwaarden, erfgoed, waterbeheer, ...) kunnen bijkomende regels opleggen.</p>`,
    `<button type="button" class="secondary small" id="show-report-ok">Genereer verslagtekst</button>`
  ].join("");

  res.innerHTML = successHtml;

  const conclusionText = buildConclusionText({
    scenarioTitle: currentScenario.title,
    verdict: "VRIJGESTELD",
    legalBasis,
    failures: []
  });

  const btn = document.getElementById("show-report-ok");
  if (btn) {
    btn.onclick = () => showReportText(conclusionText);
  }
}

function buildConclusionText({ scenarioTitle, verdict, legalBasis, failures }) {
  const header = `Scenario: ${scenarioTitle}\nConclusie: ${verdict}\nJuridische basis: ${legalBasis}`;

  if (!failures || failures.length === 0) {
    const body = [
      "Op basis van de ingevoerde gegevens lijkt de geplande handeling te voldoen aan de voorwaarden van het vrijstellingsbesluit.",
      "Deze conclusie is indicatief en onder voorbehoud van lokale voorschriften en de formele beoordeling door de bevoegde overheid."
    ].join(" ");
    return `${header}\n\n${body}`;
  }

  const reasons = failures
    .map(
      (f, i) =>
        `${i + 1}. ${f.label} — ${f.message} (${f.basis})`
    )
    .join("\n");

  const footer =
    "Op basis hiervan valt de handeling niet volledig onder de vrijstelling. Een melding of omgevingsvergunning kan nodig zijn. Neem contact op met de bevoegde dienst ruimtelijke ordening om het verdere traject te bepalen.";

  return `${header}\n\nRedenen:\n${reasons}\n\n${footer}`;
}

/* ============================
   MODAL / KOPIEER
   ============================ */

function showReportText(text) {
  const modal = document.getElementById("report-modal");
  const textarea = document.getElementById("report-text");
  textarea.value = text || "";
  modal.classList.remove("hidden");
}

/* ============================
   INIT
   ============================ */

document.addEventListener("DOMContentLoaded", async () => {
  try {
    schema = await loadSchema();
    catalog = schema.catalog;
    decisionLogic = schema.decision_logic || {};

    // voor nu: domain WONING is hard-coded
    const woningDomain = catalog.domains.find((d) => d.domain_id === "WONING");
    if (!woningDomain) {
      throw new Error("Domein 'WONING' niet gevonden in catalog.");
    }

    renderScenarioList("WONING");

    // binds
    document
      .getElementById("next-btn")
      .addEventListener("click", onNext);
    document
      .getElementById("prev-btn")
      .addEventListener("click", onPrev);
    document
      .getElementById("back-to-scenarios-btn")
      .addEventListener("click", backToScenarios);

    const closeBtn = document.getElementById("close-modal");
    const copyBtn = document.getElementById("copy-btn");
    const resetBtn = document.getElementById("reset-btn");

    if (closeBtn) {
      closeBtn.onclick = () =>
        document.getElementById("report-modal").classList.add("hidden");
    }

    if (copyBtn) {
      copyBtn.onclick = () => {
        const txt = document.getElementById("report-text").value;
        navigator.clipboard.writeText(txt);
        copyBtn.innerText = "Gekopieerd!";
        setTimeout(() => (copyBtn.innerText = "Kopieer tekst"), 1500);
      };
    }

    if (resetBtn) {
      resetBtn.onclick = () => {
        document.getElementById("report-modal").classList.add("hidden");
        backToScenarios();
        window.scrollTo({ top: 0, behavior: "smooth" });
      };
    }

    console.log("[boot] App klaar.");

  } catch (err) {
    console.error("[boot] fout:", err);
    const res = document.getElementById("result") || document.body.appendChild(document.createElement("section"));
    res.id = "result";
    res.classList.remove("hidden");
    res.style.background = "#fee2e2";
    res.style.border = "1px solid #ef4444";
    res.style.padding = "20px";
    res.style.borderRadius = "8px";
    res.style.marginTop = "20px";
    res.innerHTML = `
      ❌ <strong>Initatiefout</strong><br><br>
      <pre style="white-space:pre-wrap;word-break:break-word;margin:0">${err.message}</pre>
    `;
  }
});
