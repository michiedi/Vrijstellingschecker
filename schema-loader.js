async function loadSchema() {
  try {
    const url = new URL('./schema.json', window.location.href).toString();
    console.log('[schema-loader] fetch:', url);

    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) {
      throw new Error(`schema.json kon niet geladen worden (HTTP ${res.status})`);
    }

    const data = await res.json();
    console.log('[schema-loader] raw schema keys:', Object.keys(data));

    // --- NIEUW SCHEMA (v2): catalog + decision_logic ---
    const hasCatalog =
      data &&
      data.catalog &&
      Array.isArray(data.catalog.domains) &&
      Array.isArray(data.catalog.categories) &&
      Array.isArray(data.catalog.scenarios);

    if (hasCatalog) {
      console.log(
        '[schema-loader] OK. Nieuw schemaformaat gedetecteerd:',
        'domains =', data.catalog.domains.length,
        'categories =', data.catalog.categories.length,
        'scenarios =', data.catalog.scenarios.length
      );

      // Zorg dat de rest van de app een consistente shape krijgt
      return {
        schema_version: data.schema_version || '2.0.0',
        title: data.title || 'Meldingchecker',
        catalog: data.catalog,
        decision_logic: data.decision_logic || {},
        exclusions: data.exclusions || {}
      };
    }

    // --- OUD SCHEMA (v1): questionnaire.questions ---
    if (data && data.questionnaire && Array.isArray(data.questionnaire.questions)) {
      console.warn(
        '[schema-loader] Oud schemaformaat gedetecteerd (questionnaire.questions).',
        'Overweeg te migreren naar catalog.domains/categories/scenarios.'
      );

      return {
        schema_version: data.schema_version || '1.x',
        title: data.title || 'Meldingchecker (legacy)',
        questionnaire: data.questionnaire,
        decision_logic: data.decision_logic || {},
        catalog: null,
        exclusions: data.exclusions || {}
      };
    }

    // Geen van beide formaten herkend
    throw new Error(
      'schema.json heeft geen geldig schema: verwacht ofwel "catalog.domains/categories/scenarios" (nieuw), ' +
      'of "questionnaire.questions" (oud).'
    );

  } catch (err) {
    console.error('[schema-loader] fout:', err);

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
      • Hard reload (Ctrl/Cmd + Shift + R) om caching te omzeilen.<br>
      • Controleer of <code>catalog.domains/categories/scenarios</code> correct zijn gevuld.
    `;
    c.appendChild(box);

    // Fallback zodat app niet crasht
    return {
      schema_version: 'error',
      title: 'Meldingchecker (schema fout)',
      catalog: { domains: [], categories: [], scenarios: [] },
      decision_logic: {},
      exclusions: {}
    };
  }
}
