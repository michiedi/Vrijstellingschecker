async function loadSchema() {
  try {
    const url = new URL('./schema.json', window.location.href).toString();
    console.log('[schema-loader] fetch:', url);

    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) {
      throw new Error(`schema.json kon niet geladen worden (HTTP ${res.status})`);
    }

    const data = await res.json();

    if (!data || !data.questionnaire || !Array.isArray(data.questionnaire.questions)) {
      throw new Error('schema.json mist "questionnaire.questions" (ongeldige structuur).');
    }
    console.log('[schema-loader] OK. Questions:', data.questionnaire.questions.length);
    return data;

  } catch (err) {
    console.error('[schema-loader] fout:', err);

    // Toon zichtbaar in de UI, zodat testers meteen snappen wat fout gaat
    const c = document.getElementById('question-container') || document.body;
    const box = document.createElement('div');
    box.style.background = '#fee2e2';
    box.style.border = '1px solid #ef4444';
    box.style.padding = '20px';
    box.style.borderRadius = '8px';
    box.style.marginTop = '20px';
    box.innerHTML = `
      <strong>⚠ Schema fout</strong><br>
      ${err.message}<br><br>
      <em>Checklist:</em><br>
      • Staat <code>schema.json</code> in dezelfde map als <code>index.html</code>?<br>
      • Is de bestandsnaam exact <code>schema.json</code> (kleine letters)?<br>
      • Is de JSON syntactisch geldig (controleer via jsonlint.com)?<br>
      • Hard reload (Ctrl/Cmd + Shift + R) om caching te omzeilen.
    `;
    c.appendChild(box);

    // Fallback zodat app niet crasht
    return { questionnaire: { questions: [] }, decision_logic: {} };
  }
}
