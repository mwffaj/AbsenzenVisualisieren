(async function () {
  // ── Mode: Prüfungsplan page → extract and store exams, then exit ──────────
  const EXAM_KEY = '__sn_exams__';
  const EXAM_MONTHS = { jan:0, feb:1, 'mär':2, mrz:2, apr:3, mai:4, jun:5, jul:6, aug:7, sep:8, okt:9, nov:10, dez:11 };
  const parseExamDate = str => {
    const m = str && str.match(/(\d{1,2})\.\s*(\w+)\s+(\d{4})/);
    if (!m) return null;
    const mo = EXAM_MONTHS[m[2].toLowerCase().substring(0, 3)];
    return mo !== undefined ? new Date(+m[3], mo, +m[1]) : null;
  };

  if (window.location.href.includes('pageid=21329')) {
    // Header row may be outside the data table — scan all tr elements on page
    let cVon = 0, cBis = 1, cAnlass = 8, cRaum = 4; // fallback from known structure
    document.querySelectorAll('tr').forEach(row => {
      const texts = Array.from(row.querySelectorAll('th, td'))
        .map(x => x.textContent.trim().replace(/\s*[▲▼↑↓]\s*/g, '').trim());
      if (texts.some(c => c === 'Von') && texts.some(c => c === 'Anlass')) {
        cVon = texts.findIndex(c => c === 'Von');
        cBis = texts.findIndex(c => c === 'Bis');
        cAnlass = texts.findIndex(c => c === 'Anlass');
        cRaum = texts.findIndex(c => c === 'Raum');
      }
    });
    // Find data table: first table whose first cell contains a date pattern
    let examTable = null;
    document.querySelectorAll('table').forEach(t => {
      if (examTable) return;
      const firstCell = t.querySelector('tr > td');
      if (firstCell && firstCell.textContent.match(/\d{1,2}\.\s+\w+\s+\d{4}/)) examTable = t;
    });
    if (!examTable) { alert('Prüfungsplan-Tabelle nicht gefunden.'); return; }
    const result = [];
    const etbody = examTable.querySelector('tbody');
    if (etbody) {
      Array.from(etbody.querySelectorAll(':scope > tr')).forEach(row => {
        const cells = row.querySelectorAll('td');
        const g = i => (i >= 0 && cells[i]) ? cells[i].textContent.trim() : '';
        const vonStr = g(cVon), bisStr = g(cBis);
        const start = parseExamDate(vonStr);
        if (!start) return;
        let end = parseExamDate(bisStr) || new Date(start);
        if (bisStr.match(/00:00$/) && end > start) end = new Date(end.getTime() - 86400000);
        const vonTime = vonStr.match(/(\d{2}:\d{2})$/);
        const bisTime = bisStr.match(/(\d{2}:\d{2})$/);
        const timeStr = (vonTime && vonTime[1] !== '00:00')
          ? `${vonTime[1]}${bisTime && bisTime[1] !== '00:00' ? '–' + bisTime[1] : ''}` : '';
        result.push({ start: start.getTime(), end: end.getTime(), anlass: g(cAnlass), raum: g(cRaum), timeStr });
      });
    }
    // Merge with existing stored exams (deduplicate by start+anlass)
    let existing = [];
    try { existing = JSON.parse(sessionStorage.getItem(EXAM_KEY) || '[]'); } catch(e) {}
    const merged = [...existing];
    result.forEach(r => {
      const dupe = merged.some(e => e.start === r.start && e.anlass === r.anlass);
      if (!dupe) merged.push(r);
    });
    sessionStorage.setItem(EXAM_KEY, JSON.stringify(merged));
    const newCount = merged.length - existing.length;
    const toast = document.createElement('div');
    toast.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#fff;border:2px solid #7d3c98;border-radius:12px;font-size:13px;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Arial,sans-serif;box-shadow:0 4px 24px rgba(0,0,0,.25);z-index:2147483647;max-width:420px;width:90vw;overflow:hidden;';
    toast.innerHTML = `<div style="background:#7d3c98;color:#fff;padding:10px 14px;font-weight:700;">✓ ${newCount} neue Prüfungstermin${newCount !== 1 ? 'e' : ''} gespeichert (total ${merged.length})</div><div style="padding:10px 14px;color:#333;display:flex;flex-direction:column;gap:8px;"><div style="display:flex;gap:8px;align-items:flex-start;"><span style="font-size:16px">📅</span><span>Weiteres Semester? Zur nächsten <strong>Prüfungsplan-Seite</strong> navigieren und Bookmarklet erneut klicken.</span></div><div style="display:flex;gap:8px;align-items:flex-start;"><span style="font-size:16px">👤</span><span>Fertig? Zur <strong>Absenzenseite eines Schülers</strong> wechseln und Bookmarklet klicken.</span></div></div>`;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 8000);
    return;
  }

  if (document.getElementById('__sn_abs__')) {
    document.getElementById('__sn_abs__').remove();
    return;
  }

  // ── 1. Parse absence table ────────────────────────────────────────────────
  let absTable = null;
  let headers = [];
  document.querySelectorAll('table').forEach(t => {
    if (absTable) return;
    const ths = Array.from(t.querySelectorAll(':scope > tbody > tr > th, :scope > thead > tr > th, :scope > tbody > tr:first-child > td'));
    const texts = ths.map(x => x.textContent.trim());
    if (texts.includes('Datum von') && texts.includes('Datum bis')) {
      absTable = t;
      texts.forEach((txt, i) => headers[i] = txt);
    }
  });
  if (!absTable) { alert('Absenzen-Tabelle nicht gefunden. Bitte auf der Absenzen-Schülerseite ausführen.'); return; }

  const col = name => headers.findIndex(h => h === name);
  const C = {
    datumVon:    col('Datum von'),
    datumBis:    col('Datum bis'),
    grund:       col('Grund'),
    zusatzinfo:  col('Zusatzinfo'),
    entschuldigt:col('Entschuldigt'),
    lektionen:   col('Lektionen'),
    kommentar:   col('Kommentar'),
    statusEAE:   col('Status EAE'),
  };

  const parseDate = str => {
    const m = str && str.match(/(\d{2})\.(\d{2})\.(\d{4})/);
    return m ? new Date(+m[3], +m[2] - 1, +m[1]) : null;
  };

  const absences = [];
  const tbody = absTable.querySelector('tbody');
  if (!tbody) { alert('Keine Tabellendaten gefunden.'); return; }

  const pad2 = v => String(v).padStart(2, '0');

  // Schulnetz haengt unter jede Absenz eine ausklappbare Zeile mit den einzelnen
  // Meldungen: Datum | Zeit | Kurskuerzel | Bemerkung. Genau dort stehen die
  // effektiven Lektionszeiten.
  function parseMeldungen(row, abs) {
    const scope = row.querySelector('table') || row;
    const rows = Array.from(scope.querySelectorAll('tr'));
    let cDat = -1, cZeit = -1, cKurs = -1, cBem = -1;
    rows.forEach(r => {
      const texts = Array.from(r.querySelectorAll('th, td')).map(x => x.textContent.trim());
      if (texts.some(x => x === 'Zeit') && texts.some(x => x.indexOf('Datum') === 0)) {
        cDat  = texts.findIndex(x => x.indexOf('Datum') === 0);
        cZeit = texts.findIndex(x => x === 'Zeit');
        cKurs = texts.findIndex(x => x.indexOf('Kurs') === 0);
        cBem  = texts.findIndex(x => x.indexOf('Bemerkung') === 0);
      }
    });
    if (cZeit < 0) return;
    rows.forEach(r => {
      const cells = r.querySelectorAll('td');
      if (!cells.length) return;
      const g = i => (i >= 0 && cells[i]) ? cells[i].textContent.trim() : '';
      const t = g(cZeit).match(/(\d{1,2}):(\d{2})\s*(?:bis|–|-)\s*(\d{1,2}):(\d{2})/);
      if (!t) return;
      abs.meldungen.push({
        date: parseDate(g(cDat)) || new Date(abs.start),
        s: +t[1] * 60 + +t[2],
        e: +t[3] * 60 + +t[4],
        timeStr: `${pad2(t[1])}:${t[2]}–${pad2(t[3])}:${t[4]}`,
        kurs: g(cKurs),
        bem: g(cBem),
      });
    });
  }

  let current = null;
  Array.from(tbody.querySelectorAll(':scope > tr')).forEach(row => {
    // Detailzeile mit den Meldungen: gehoert zur zuletzt gelesenen Absenz
    if ((row.id && /^meldung/i.test(row.id)) || row.querySelector('table')) {
      if (current) parseMeldungen(row, current);
      return;
    }
    if (row.style.display === 'none') { current = null; return; }
    const cells = row.querySelectorAll('td');
    const g = i => (i >= 0 && cells[i]) ? cells[i].textContent.trim() : '';
    const start = parseDate(g(C.datumVon));
    if (!start) { current = null; return; }
    const end = parseDate(g(C.datumBis)) || new Date(start);
    const lek = parseInt(g(C.lektionen)) || 0;
    const ent = g(C.entschuldigt).toLowerCase().trim();
    const excused = ent.includes('ja') ? true : ent.includes('nein') ? false : null;
    const zi = g(C.zusatzinfo);
    const timem = zi.match(/(\d{2}:\d{2}):\d{2}\s*-\s*(\d{2}:\d{2}):\d{2}/);
    const timeStr = timem ? `${timem[1]}–${timem[2]}` : '';
    current = { id: absences.length, start, end, grund: g(C.grund), timeStr, excused, lektionen: lek, kommentar: g(C.kommentar), meldungen: [] };
    absences.push(current);
  });

  if (!absences.length) { alert('Keine Absenzen gefunden.'); return; }

  // ── 2. Lektionsraster ─────────────────────────────────────────────────────
  // Stundenplan-Raster der Schule. Hier anpassen, wenn die Zeiten abweichen.
  const LESSON_GRID = [
    { nr: 1,  from: '07:45', to: '08:30' },
    { nr: 2,  from: '08:35', to: '09:20' },
    { nr: 3,  from: '09:25', to: '10:10' },
    { nr: 4,  from: '10:30', to: '11:15' },
    { nr: 5,  from: '11:20', to: '12:05' },
    { nr: 6,  from: '12:10', to: '12:55' },
    { nr: 7,  from: '13:00', to: '13:45' },
    { nr: 8,  from: '13:50', to: '14:35' },
    { nr: 9,  from: '14:45', to: '15:30' },
    { nr: 10, from: '15:35', to: '16:20' },
    { nr: 11, from: '16:25', to: '17:10' },
  ];
  const SLOT_TOL = 10; // Minuten Ueberschneidung, ab der eine Lektion als betroffen gilt
  const GAP_MIN  = 20; // ab dieser Pausenlaenge eine Luecke in der Rasterdarstellung
  const CELL_H   = 52; // Hoehe einer Kalenderzelle: der Schultag von oben nach unten
  const MERGE_GAP = 20; // Pausen bis zu dieser Laenge trennen den Tagesblock nicht
  const GAP_FILL  = 2;  // so viele freie Lektionen zwischen zwei Abschnitten gelten als Mittag

  const toMin = t => {
    const m = t && t.match(/(\d{1,2}):(\d{2})/);
    return m ? +m[1] * 60 + +m[2] : 0;
  };
  const fmtMin = v => pad2(Math.floor(v / 60)) + ':' + pad2(v % 60);

  // Die Meldungen liefern die echten Lektionszeiten. Sie haben Vorrang; das
  // konfigurierte Raster fuellt nur die Zeiten auf, zu denen nichts vorliegt.
  const observed = [];
  absences.forEach(a => a.meldungen.forEach(m => {
    if (!observed.some(o => o.s === m.s && o.e === m.e)) observed.push({ s: m.s, e: m.e });
  }));
  const slotList = observed.slice();
  LESSON_GRID.forEach(l => {
    const c = { s: toMin(l.from), e: toMin(l.to) };
    if (!slotList.some(o => Math.min(o.e, c.e) - Math.max(o.s, c.s) > 0)) slotList.push(c);
  });
  slotList.sort((a, b) => a.s - b.s || a.e - b.e);
  const GRID = slotList.map((l, i) => ({ nr: i + 1, s: l.s, e: l.e, from: fmtMin(l.s), to: fmtMin(l.e) }));
  const GRID_GAP = GRID.map((l, i) => i > 0 && l.s - GRID[i - 1].e >= GAP_MIN);

  const dayKey = d => d.getFullYear() * 10000 + d.getMonth() * 100 + d.getDate();

  // Welche Lektionen deckt eine Absenz an einem bestimmten Tag ab?
  // Ohne Zeitangabe gilt der ganze Tag.
  const hits = (slot, from, to) => Math.min(slot.e, to) - Math.max(slot.s, from) >= Math.min(SLOT_TOL, slot.e - slot.s);

  function slotsOn(abs, year, month, day) {
    const k = year * 10000 + month * 100 + day;
    // Meldungen sind die genaueste Quelle
    if (abs.meldungen.length) {
      const ms = abs.meldungen.filter(m => dayKey(m.date) === k);
      return GRID.map(l => ms.some(m => hits(l, m.s, m.e)));
    }
    if (!abs.timeStr) return GRID.map(() => true);
    const lo = k === dayKey(abs.start) ? toMin(abs.timeStr.substring(0, 5)) : 0;
    const hi = k === dayKey(abs.end)   ? toMin(abs.timeStr.substring(6))    : 1440;
    return GRID.map(l => hits(l, lo, hi));
  }

  // Betroffene Lektionen als lesbarer Text, z.B. "Lektionen 3-5, 7"
  const slotLabelOf = slots => {
    const nrs = GRID.filter((l, i) => slots[i]).map(l => l.nr);
    if (!nrs.length) return 'Keine Lektion betroffen';
    if (nrs.length === GRID.length) return 'Alle Lektionen';
    const parts = [];
    let from = nrs[0], prev = nrs[0];
    for (let i = 1; i <= nrs.length; i++) {
      const cur = nrs[i];
      if (cur !== prev + 1) {
        parts.push(from === prev ? String(from) : from + '\u2013' + prev);
        from = cur;
      }
      prev = cur;
    }
    return (nrs.length > 1 ? 'Lektionen ' : 'Lektion ') + parts.join(', ');
  };

  absences.forEach(a => {
    const days = [];
    const d = new Date(a.start.getFullYear(), a.start.getMonth(), a.start.getDate());
    while (dayKey(d) <= dayKey(a.end)) {
      const wd = d.getDay();
      if (wd >= 1 && wd <= 5) days.push(new Date(d));
      d.setDate(d.getDate() + 1);
    }
    a.dayList = days.length ? days : [new Date(a.start.getFullYear(), a.start.getMonth(), a.start.getDate())];
    // Ohne Zeitangabe ist die Lage der Lektionen nur dann bekannt, wenn ohnehin
    // der ganze Tag betroffen ist: mehrtaegig, ohne Lektionszahl oder volles Raster.
    a.slotsKnown = a.meldungen.length > 0 || !!a.timeStr || a.dayList.length > 1 || !a.lektionen || a.lektionen >= GRID.length;
    a.meldungen.sort((x, y) => (dayKey(x.date) - dayKey(y.date)) || (x.s - y.s));
    a.kurse = a.meldungen.map(m => m.kurs).filter((v, i, arr) => v && arr.indexOf(v) === i);
    const meldSpan = a.meldungen.length
      ? fmtMin(Math.min(...a.meldungen.map(m => m.s))) + '–' + fmtMin(Math.max(...a.meldungen.map(m => m.e)))
      : '';
    a.spanStr = meldSpan || a.timeStr;
    // Das Fenster aus der Zusatzinfo ist bei mehrtaegigen Absenzen nur die
    // Aussengrenze. Es wird nur noch nachgestellt, wenn es davon abweicht.
    a.windowStr = (meldSpan && a.timeStr && a.timeStr !== meldSpan) ? a.timeStr : '';
    // Tage, an denen wirklich etwas ausfaellt
    a.effDays = a.slotsKnown
      ? (a.dayList.filter(day => slotsOn(a, day.getFullYear(), day.getMonth(), day.getDate()).some(Boolean)).length || 1)
      : a.dayList.length;
    a.slots = GRID.map(() => false);
    if (a.slotsKnown) {
      a.dayList.forEach(day => {
        slotsOn(a, day.getFullYear(), day.getMonth(), day.getDate())
          .forEach((v, i) => { if (v) a.slots[i] = true; });
      });
    }
    a.slotCount = a.slots.filter(Boolean).length;
    a.allDay = a.slotsKnown && a.slotCount === GRID.length;
    a.slotLabel = !a.slotsKnown
      ? a.lektionen + (a.lektionen === 1 ? ' Lektion' : ' Lektionen') + ', Lage unbekannt'
      : a.allDay
        ? (a.dayList.length > 1 ? 'Ganze Tage' : 'Ganzer Tag')
        : slotLabelOf(a.slots);
  });

  // ── 3. Student name ────────────────────────────────────────────────────────
  const h2 = document.querySelector('h2');
  const studentName = h2 ? h2.textContent.replace('Absenzen -', '').trim() : '';

  // ── 4. Helpers ─────────────────────────────────────────────────────────────
  function el(tag, attrs = {}, ...kids) {
    const n = document.createElement(tag);
    Object.entries(attrs).forEach(([k, v]) => {
      if (k === 'style') n.style.cssText = v;
      else if (k === 'class') n.className = v;
      else n.setAttribute(k, v);
    });
    kids.forEach(c => n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c));
    return n;
  }

  function iconBtn(lbl, fn, title = '') {
    const b = el('button', { style: 'background:rgba(255,255,255,.18);border:none;color:#fff;height:32px;border-radius:7px;cursor:pointer;font-size:13px;padding:0 10px;white-space:nowrap;flex-shrink:0', title }, lbl);
    b.onclick = fn;
    return b;
  }

  const MONTH_LONG = ['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];
  const WD = ['Mo','Di','Mi','Do','Fr','Sa','So'];
  const fmtDate = d => d.toLocaleDateString('de-CH', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' });

  const COLOR_EXC  = '#2e86c1';
  const COLOR_UNEX = '#e74c3c';
  const COLOR_PEND = '#e67e22';
  const COLOR_EXAM = '#7d3c98';
  const abColor = a => a.excused === true ? COLOR_EXC : a.excused === false ? COLOR_UNEX : COLOR_PEND;

  const coversDate = (start, end, year, month, day) => {
    const d = new Date(year, month, day).getTime();
    const s = new Date(start.getFullYear(), start.getMonth(), start.getDate()).getTime();
    const e = new Date(end.getFullYear(),   end.getMonth(),   end.getDate()).getTime();
    return d >= s && d <= e;
  };

  // Lektionsraster als Grafik. colors[i] = Farbe der betroffenen Lektion oder null.
  function rasterNode(colors) {
    const wrap = el('div', { style: 'display:flex;align-items:center;gap:2px;flex-wrap:nowrap' });
    GRID.forEach((l, i) => {
      if (GRID_GAP[i]) wrap.appendChild(el('div', { style: 'width:5px;flex:0 0 auto' }));
      const c = colors[i];
      wrap.appendChild(el('div', {
        style: `flex:0 0 auto;width:16px;height:16px;border-radius:3px;font-size:9px;font-weight:700;`
          + `display:flex;align-items:center;justify-content:center;background:${c || '#eee'};color:${c ? '#fff' : '#aaa'}`,
        title: `${l.nr}. Lektion · ${l.from}\u2013${l.to}`,
      }, String(l.nr)));
    });
    return wrap;
  }

  // Vertikale Tagesfaerbung: die Zelle ist der Schultag von oben nach unten,
  // gefaerbt wird genau der Abschnitt der betroffenen Lektionen.
  const DAY_S = GRID[0].s;
  const DAY_E = GRID[GRID.length - 1].e;
  const dayPct = v => ((v - DAY_S) / (DAY_E - DAY_S) * 100).toFixed(2);

  function dayFill(slotColors, baseBg) {
    const bands = [];
    GRID.forEach((l, i) => {
      const c = slotColors[i];
      if (!c) return;
      const last = bands[bands.length - 1];
      // Lektionen ueber Pausen hinweg zu einem Block zusammenfassen
      if (last && last.c === c && l.s - last.e <= MERGE_GAP) last.e = l.e;
      else bands.push({ s: l.s, e: l.e, c });
    });
    if (!bands.length) return baseBg;
    // Kurze Pausen zwischen zwei Baendern schliessen, damit keine Haarlinie bleibt
    bands.forEach((b, i) => {
      const next = bands[i + 1];
      if (next && next.s - b.e <= MERGE_GAP) b.e = next.s;
    });
    const parts = [];
    let prev = '0.00';
    bands.forEach(b => {
      const a = dayPct(b.s), z = dayPct(b.e);
      parts.push(`${baseBg} ${prev}%`, `${baseBg} ${a}%`, `${b.c} ${a}%`, `${b.c} ${z}%`);
      prev = z;
    });
    parts.push(`${baseBg} ${prev}%`, `${baseBg} 100%`);
    return `linear-gradient(to bottom, ${parts.join(',')})`;
  }

  // Wer vormittags und nachmittags fehlt, war ueber Mittag auch nicht da:
  // kurze Luecken zwischen zwei gleichfarbigen Abschnitten werden mitgefaerbt,
  // aber blasser, weil sie nicht als Absenz erfasst sind.
  const ALPHA_ABS = 'a6';
  const ALPHA_GAP = '4d';

  function withLunch(slotColors) {
    const out = slotColors.map(c => c ? c + ALPHA_ABS : null);
    let i = 0;
    while (i < slotColors.length) {
      if (!slotColors[i]) { i++; continue; }
      let j = i + 1;
      while (j < slotColors.length && !slotColors[j]) j++;
      const len = j - i - 1;
      if (j < slotColors.length && slotColors[j] === slotColors[i] && len > 0 && len <= GAP_FILL) {
        for (let k = i + 1; k < j; k++) out[k] = slotColors[i] + ALPHA_GAP;
      }
      i = j;
    }
    return out;
  }

  const RASTER_W = GRID.length * 16 + (GRID.length - 1) * 2 + GRID_GAP.filter(Boolean).length * 5;

  // Lektionenzahl bekannt, Lage nicht: schraffierter Balken statt Raster
  function unknownBar(color) {
    return el('div', {
      style: `width:${RASTER_W}px;height:16px;border-radius:3px;`
        + `background:repeating-linear-gradient(135deg, ${color}bb 0 3px, ${color}33 3px 6px)`,
      title: 'Lektionen nicht bestimmbar (keine Zeitangabe)',
    });
  }
  const HATCH = color => `repeating-linear-gradient(135deg, ${color}88 0 4px, transparent 4px 8px)`;

  // Die einzelnen Meldungen als Textblock
  function meldungenFor(abs, day) {
    return day ? abs.meldungen.filter(m => dayKey(m.date) === dayKey(day)) : abs.meldungen;
  }

  // Ohne Tagesbezug wird bei mehrtaegigen Absenzen das Datum vorangestellt,
  // sonst waeren die Zeiten mehrerer Tage nicht auseinanderzuhalten.
  function meldungenNode(abs, max, day) {
    const list = meldungenFor(abs, day);
    const withDate = !day && abs.dayList.length > 1;
    const wrap = el('div', { style: 'display:flex;flex-direction:column;gap:2px' });
    list.slice(0, max).forEach(m => {
      const datePart = withDate ? pad2(m.date.getDate()) + '.' + pad2(m.date.getMonth() + 1) + '.' : '';
      const parts = [datePart, m.timeStr, m.kurs, m.bem].filter(Boolean);
      wrap.appendChild(el('div', { style: 'line-height:1.35' }, parts.join(' · ')));
    });
    const rest = list.length - max;
    if (rest > 0) wrap.appendChild(el('div', { style: 'line-height:1.35;color:#888' }, '+ ' + rest + ' weitere'));
    return wrap;
  }

  const rasterFor = (abs, slots) => abs.slotsKnown
    ? rasterNode((slots || abs.slots).map(v => v ? abColor(abs) : null))
    : unknownBar(abColor(abs));

  // ── 5. Stats ───────────────────────────────────────────────────────────────
  const totalLek = absences.reduce((s, a) => s + a.lektionen, 0);
  const excLek   = absences.filter(a => a.excused === true).reduce((s, a) => s + a.lektionen, 0);
  const unexLek  = absences.filter(a => a.excused === false).reduce((s, a) => s + a.lektionen, 0);
  const pendLek  = absences.filter(a => a.excused === null).reduce((s, a) => s + a.lektionen, 0);
  const fullDays = absences.filter(a => a.allDay).reduce((s, a) => s + a.effDays, 0);
  const partDays = absences.filter(a => a.slotsKnown && !a.allDay).reduce((s, a) => s + a.effDays, 0);
  const openAbs  = absences.filter(a => !a.slotsKnown).length;
  const scopeSummary = [
    fullDays ? fullDays + (fullDays === 1 ? ' ganzer Tag' : ' ganze Tage') : '',
    partDays ? partDays + (partDays === 1 ? ' Teiltag' : ' Teiltage') : '',
    openAbs ? openAbs + '\u00d7 ohne Zeitangabe' : '',
  ].filter(Boolean).join(' \u00b7 ');

  // ── 6. Date range (extends once exams are loaded) ─────────────────────────
  let rangeStart = new Date(Math.min(...absences.map(a => a.start)));
  let rangeEnd   = new Date(Math.max(...absences.map(a => a.end)));

  // ── 7. State ───────────────────────────────────────────────────────────────
  let activeView = 'calendar';
  let calMonthsPerRow = 3;
  let exams = [];

  function loadExams() {
    const raw = sessionStorage.getItem(EXAM_KEY);
    if (!raw) return [];
    try {
      return JSON.parse(raw).map((e, i) => ({
        id: i,
        start: new Date(e.start),
        end: new Date(e.end),
        anlass: e.anlass,
        raum: e.raum,
        timeStr: e.timeStr,
      }));
    } catch (err) { return []; }
  }

  // ── 8. Popovers ────────────────────────────────────────────────────────────
  let popover = null;
  function closeP() { if (popover) { popover.remove(); popover = null; } }

  function makePopover(color, title, rows) {
    closeP();
    popover = el('div', { style: 'position:fixed;z-index:2147483647;background:#fff;border-radius:10px;min-width:260px;max-width:340px;box-shadow:0 8px 32px rgba(0,0,0,.35);overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Arial,sans-serif' });
    const bar = el('div', { style: `background:${color};padding:10px 12px;display:flex;align-items:flex-start;gap:8px` });
    const bx = el('button', { style: 'background:rgba(0,0,0,.2);border:none;color:#fff;width:20px;height:20px;border-radius:50%;cursor:pointer;font-size:11px;line-height:1;flex-shrink:0;padding:0' }, '✕');
    bx.onclick = e => { e.stopPropagation(); closeP(); };
    bar.append(el('div', { style: 'flex:1;color:#fff;font-weight:700;font-size:13px;line-height:1.3' }, title), bx);
    popover.appendChild(bar);
    const body = el('div', { style: 'padding:10px 12px;font-size:12px;color:#333;display:flex;flex-direction:column;gap:5px' });
    rows.forEach(([icon, text]) => {
      if (!text) return;
      const r = el('div', { style: 'display:flex;gap:8px;align-items:flex-start' });
      const val = text.nodeType ? text : el('span', { style: 'line-height:1.4' }, text);
      r.append(el('span', { style: 'width:16px;text-align:center;flex-shrink:0;color:#888' }, icon), val);
      body.appendChild(r);
    });
    popover.appendChild(body);
    return popover;
  }

  function positionPopover(anchor) {
    const aR = anchor.getBoundingClientRect();
    let left = aR.right + 6, top = aR.top;
    if (left + 300 > window.innerWidth - 8) left = aR.left - 306;
    if (top + 160 > window.innerHeight - 8) top = window.innerHeight - 168;
    popover.style.left = Math.max(4, left) + 'px';
    popover.style.top  = Math.max(4, top)  + 'px';
    document.getElementById('__sn_abs__').appendChild(popover);
  }

  // day: der angeklickte Kalendertag. Dann zeigt das Popover nur diesen Tag.
  function showAbsP(abs, anchor, day) {
    const same = abs.start.toDateString() === abs.end.toDateString();
    const dateLine = same ? fmtDate(abs.start) : `${fmtDate(abs.start)} – ${fmtDate(abs.end)}`;
    const dayMeld = meldungenFor(abs, day);
    const slots = day ? slotsOn(abs, day.getFullYear(), day.getMonth(), day.getDate()) : abs.slots;

    const dateNode = el('div', { style: 'line-height:1.4' }, day ? fmtDate(day) : dateLine);
    if (day && !same) dateNode.appendChild(el('div', { style: 'font-size:11px;color:#888;margin-top:2px' }, 'Absenz: ' + dateLine));

    let timeLine;
    if (day && dayMeld.length) {
      timeLine = fmtMin(Math.min(...dayMeld.map(m => m.s))) + '\u2013' + fmtMin(Math.max(...dayMeld.map(m => m.e)));
    } else {
      timeLine = (abs.spanStr || 'Keine Zeitangabe') + (abs.windowStr ? ' \u00b7 erfasst als ' + abs.windowStr : '');
    }

    const lek = (day && abs.meldungen.length) ? dayMeld.length : abs.lektionen;
    const scopeLine = !abs.slotsKnown ? abs.slotLabel
      : (slots.every(Boolean) ? (day || same ? 'Ganzer Tag' : abs.slotLabel) : slotLabelOf(slots))
        + (lek ? ' \u00b7 ' + lek + (lek === 1 ? ' Lektion' : ' Lektionen') + ' erfasst' : '');

    makePopover(abColor(abs), abs.grund || 'Absenz', [
      ['📅', dateNode],
      ['🕐', timeLine],
      ['⏳', scopeLine],
      ['', rasterFor(abs, slots)],
      [String.fromCodePoint(0x1F4D6), dayMeld.length ? meldungenNode(abs, 6, day) : ''],
      ['✔', abs.excused === true ? 'Entschuldigt' : abs.excused === false ? 'Unentschuldigt' : 'Ausstehend'],
      ['💬', abs.kommentar],
    ]);
    positionPopover(anchor);
  }

  function showExamP(exam, anchor) {
    const same = exam.start.toDateString() === exam.end.toDateString();
    const dateLine = same ? fmtDate(exam.start) : `${fmtDate(exam.start)} – ${fmtDate(exam.end)}`;
    makePopover(COLOR_EXAM, exam.anlass || 'Prüfung', [
      ['📅', dateLine],
      ['🕐', exam.timeStr],
      ['📍', exam.raum],
    ]);
    positionPopover(anchor);
  }

  // ── 9. Render calendar ────────────────────────────────────────────────────
  function renderCalendar(container) {
    container.innerHTML = '';
    const months = [];
    let y = rangeStart.getFullYear(), m = rangeStart.getMonth();
    const y1 = rangeEnd.getFullYear(), m1 = rangeEnd.getMonth();
    while (y < y1 || (y === y1 && m <= m1)) {
      months.push({ year: y, month: m });
      if (++m > 11) { m = 0; y++; }
    }

    const grid = el('div', { style: `display:grid;grid-template-columns:repeat(${calMonthsPerRow},1fr);gap:16px;padding:16px` });

    months.forEach(({ year, month }) => {
      const mBox = el('div', { style: 'background:#fff;border-radius:10px;box-shadow:0 1px 6px rgba(0,0,0,.08);overflow:hidden' });

      const absInMonth = absences.filter(a => a.start <= new Date(year, month + 1, 0) && a.end >= new Date(year, month, 1));
      const exInMonth  = exams.filter(e => e.start <= new Date(year, month + 1, 0) && e.end >= new Date(year, month, 1));
      const lekInMonth = absInMonth.reduce((s, a) => s + a.lektionen, 0);

      const mHdr = el('div', { style: 'background:#1b4f72;color:#fff;padding:6px 10px;display:flex;justify-content:space-between;align-items:center' });
      let hdrRight = absInMonth.length ? `${absInMonth.length} Abs` : '';
      if (exInMonth.length) hdrRight += (hdrRight ? ' · ' : '') + `${exInMonth.length} Prüf`;
      mHdr.append(
        el('span', { style: 'font-size:13px;font-weight:700' }, `${MONTH_LONG[month]} ${year}`),
        el('span', { style: 'font-size:11px;opacity:.8' }, hdrRight)
      );
      mBox.appendChild(mHdr);

      const wdRow = el('div', { style: 'display:grid;grid-template-columns:repeat(7,1fr);background:#eef3f8' });
      WD.forEach((d, i) => wdRow.appendChild(el('div', { style: `text-align:center;font-size:9px;font-weight:700;padding:3px 0;color:${i >= 5 ? '#c0392b' : '#777'}` }, d)));
      mBox.appendChild(wdRow);

      const dim    = new Date(year, month + 1, 0).getDate();
      let offset   = new Date(year, month, 1).getDay() - 1;
      if (offset < 0) offset = 6;
      const today  = new Date();

      const dayGrid = el('div', { style: 'display:grid;grid-template-columns:repeat(7,1fr);gap:1px;background:#e8e8e8;border-top:1px solid #e8e8e8' });

      for (let i = 0; i < offset; i++) dayGrid.appendChild(el('div', { style: `background:#f8f8f8;min-height:${CELL_H}px` }));

      for (let d = 1; d <= dim; d++) {
        const isToday = today.getDate() === d && today.getMonth() === month && today.getFullYear() === year;
        const isWkend = ((offset + d - 1) % 7) >= 5;
        const absHere  = absences.filter(a => coversDate(a.start, a.end, year, month, d));
        const exHere   = exams.filter(e => coversDate(e.start, e.end, year, month, d));

        const baseBg = isToday ? '#d6eaf8' : isWkend ? '#fdf5f5' : '#fff';
        let cellBg = baseBg;
        // Pro Lektion die Farbe der ersten Absenz, die sie abdeckt
        const openHere  = absHere.filter(a => !a.slotsKnown);
        const coverHere = absHere.filter(a => a.slotsKnown && slotsOn(a, year, month, d).some(Boolean));
        const slotColors = GRID.map(() => null);
        coverHere.forEach(a => {
          slotsOn(a, year, month, d).forEach((v, i) => { if (v && !slotColors[i]) slotColors[i] = abColor(a); });
        });
        if (coverHere.length) cellBg = dayFill(withLunch(slotColors), baseBg);
        // Lage unbekannt: der ganze Tag wird schraffiert ueberlagert
        if (openHere.length) cellBg = HATCH(abColor(openHere[0])) + ', ' + cellBg;
        // Nur Tage markieren, an denen an diesem Tag wirklich etwas ausfaellt.
        // Eine mehrtaegige Absenz kann Tage umfassen, fuer die keine Lektion erfasst ist.
        const markHere = coverHere.concat(openHere);
        const firstAbs = markHere[0];


        const cell = el('div', {
          style: `min-height:${CELL_H}px;position:relative;background:${cellBg};${isToday ? 'outline:2px solid #1b4f72;outline-offset:-2px;z-index:1;' : ''}`,
          title: markHere.map(a => {
            const sl = a.slotsKnown ? slotsOn(a, year, month, d) : null;
            const lbl = !sl ? a.slotLabel : sl.every(Boolean) ? 'Ganzer Tag' : slotLabelOf(sl);
            const ks = meldungenFor(a, new Date(year, month, d)).map(m => m.kurs)
              .filter((v, i, arr) => v && arr.indexOf(v) === i);
            return lbl + (ks.length ? ' (' + ks.join(', ') + ')' : '');
          }).join(' · '),
        });

        // Exam chips at top
        exHere.forEach(exam => {
          const chip = el('div', {
            style: `background:${COLOR_EXAM};color:#fff;font-size:8px;font-weight:700;padding:1px 3px;border-radius:2px;margin:1px 2px 0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;cursor:pointer;line-height:1.4`,
            title: exam.anlass,
          }, exam.anlass.replace(/\/.*/, '').trim().substring(0, 14));
          chip.onclick = e => { e.stopPropagation(); showExamP(exam, chip); };
          cell.appendChild(chip);
        });

        // Day number
        const numColor = firstAbs ? '#1a1a1a' : isToday ? '#1b4f72' : isWkend ? '#c0392b' : '#999';
        cell.appendChild(el('div', {
          style: `font-size:9px;font-weight:${isToday || firstAbs ? '700' : '400'};color:${numColor};padding:2px 3px;line-height:1;`
            + `position:relative;${firstAbs ? 'text-shadow:0 0 3px #fff, 0 0 2px #fff;' : ''}`,
        }, String(d)));


        if (firstAbs) {
          const clicked = new Date(year, month, d);
          cell.onclick = e => { e.stopPropagation(); showAbsP(firstAbs, cell, clicked); };
        }

        dayGrid.appendChild(cell);
      }
      mBox.appendChild(dayGrid);
      grid.appendChild(mBox);
    });

    container.appendChild(grid);
  }

  // ── 10. Render list ────────────────────────────────────────────────────────
  function renderList(container) {
    container.innerHTML = '';
    const wrap = el('div', { style: 'padding:16px;max-width:900px;margin:0 auto' });
    [...absences].sort((a, b) => b.start - a.start).forEach(abs => {
      const color = abColor(abs);
      const same = abs.start.toDateString() === abs.end.toDateString();
      const dateLine = same ? fmtDate(abs.start) : `${fmtDate(abs.start)} – ${fmtDate(abs.end)}`;
      const row = el('div', { style: `display:flex;gap:12px;align-items:flex-start;background:#fff;border-radius:8px;box-shadow:0 1px 4px rgba(0,0,0,.08);padding:10px 14px;margin-bottom:8px;border-left:4px solid ${color}` });
      const left = el('div', { style: 'flex:1;min-width:0' });
      left.appendChild(el('div', { style: 'font-size:13px;font-weight:700;color:#222;margin-bottom:2px' }, abs.grund || 'Absenz'));
      const lekStr = abs.lektionen ? ' · ' + abs.lektionen + (abs.lektionen === 1 ? ' Lektion' : ' Lektionen') : '';
      left.appendChild(el('div', { style: 'font-size:12px;color:#555;margin-bottom:2px' }, dateLine + (abs.spanStr ? ' · ' + abs.spanStr : '') + lekStr));
      const rasterRow = el('div', { style: 'display:flex;gap:8px;align-items:center;margin:5px 0 3px;flex-wrap:wrap' });
      rasterRow.append(rasterFor(abs), el('span', { style: 'font-size:11px;color:#666' }, abs.slotLabel));
      left.appendChild(rasterRow);
      if (abs.meldungen.length) {
        const md = meldungenNode(abs, 4);
        md.style.cssText += ';font-size:11px;color:#666;margin-bottom:2px';
        left.appendChild(md);
      }
      if (abs.kommentar) left.appendChild(el('div', { style: 'font-size:11px;color:#888;font-style:italic' }, abs.kommentar));
      const badge = el('div', { style: `background:${color};color:#fff;border-radius:4px;padding:2px 8px;font-size:11px;font-weight:700` },
        abs.excused === true ? 'Entschuldigt' : abs.excused === false ? 'Unentschuldigt' : 'Ausstehend');
      row.append(left, badge);
      wrap.appendChild(row);
    });
    container.appendChild(wrap);
  }

  // ── 11. Overlay ────────────────────────────────────────────────────────────
  const overlay = el('div', { style: 'position:fixed;inset:0;background:rgba(0,0,0,.75);z-index:2147483646;display:flex;align-items:center;justify-content:center;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Arial,sans-serif' });
  overlay.id = '__sn_abs__';
  overlay.addEventListener('click', e => { if (e.target === overlay) { closeP(); overlay.remove(); } });
  document.body.appendChild(overlay);

  const modal = el('div', { style: 'background:#f0f4f8;border-radius:14px;width:96vw;max-width:1400px;height:90vh;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 24px 80px rgba(0,0,0,.6)' });
  overlay.appendChild(modal);

  const hdr = el('div', { style: 'background:#1b4f72;color:#fff;padding:10px 16px;display:flex;align-items:center;gap:10px;flex-shrink:0;flex-wrap:wrap' });
  const titleDiv = el('div', { style: 'flex:1' });
  titleDiv.innerHTML = `<div style="font-size:17px;font-weight:700">Absenzen ${studentName ? '– ' + studentName : ''}</div>
    <div style="font-size:10px;opacity:.7;margin-top:1px">${absences.length} Ereignisse · ${totalLek} Lektionen${scopeSummary ? ' · ' + scopeSummary : ''}</div>`;

  const statsRow = el('div', { style: 'display:flex;gap:6px;align-items:center' });
  const mkChip = (label, val, color) => {
    const c = el('div', { style: `background:${color};color:#fff;border-radius:5px;padding:3px 9px;font-size:11px;display:flex;gap:5px;align-items:center` });
    c.innerHTML = `<span style="font-weight:700">${val}</span><span style="opacity:.8">${label}</span>`;
    return c;
  };
  if (excLek)  statsRow.appendChild(mkChip('entsch.',  excLek,  COLOR_EXC));
  if (unexLek) statsRow.appendChild(mkChip('unentsch.', unexLek, COLOR_UNEX));
  if (pendLek) statsRow.appendChild(mkChip('pend.',    pendLek, COLOR_PEND));

  const viewBtns = el('div', { style: 'display:flex;gap:4px' });
  const mkViewBtn = (lbl, view) => {
    const b = el('button', { style: 'border:none;height:30px;border-radius:6px;cursor:pointer;font-size:12px;padding:0 10px' }, lbl);
    b.onclick = () => { activeView = view; document.querySelectorAll('.sn-vb').forEach(x => { x.style.background = x.dataset.v === view ? 'rgba(255,255,255,.35)' : 'rgba(255,255,255,.12)'; x.style.color='#fff'; }); refresh(); };
    b.dataset.v = view; b.className = 'sn-vb';
    b.style.background = view === activeView ? 'rgba(255,255,255,.35)' : 'rgba(255,255,255,.12)';
    b.style.color = '#fff';
    viewBtns.appendChild(b);
  };
  mkViewBtn('📅 Kalender', 'calendar');
  mkViewBtn('📋 Liste', 'list');

  const colBtns = el('div', { style: 'display:flex;gap:4px' });
  [2,3,4].forEach(n => {
    const b = el('button', { style: 'border:none;height:26px;border-radius:5px;cursor:pointer;font-size:11px;padding:0 8px' }, `${n} Sp.`);
    b.onclick = () => { calMonthsPerRow = n; document.querySelectorAll('.sn-cb').forEach(x => { x.style.background = parseInt(x.dataset.c) === n ? 'rgba(255,255,255,.35)' : 'rgba(255,255,255,.12)'; x.style.color='#fff'; }); refresh(); };
    b.dataset.c = n; b.className = 'sn-cb';
    b.style.background = n === calMonthsPerRow ? 'rgba(255,255,255,.35)' : 'rgba(255,255,255,.12)';
    b.style.color = '#fff';
    colBtns.appendChild(b);
  });

  hdr.append(titleDiv, statsRow, viewBtns, colBtns, iconBtn('✕', () => { closeP(); overlay.remove(); }, 'Schliessen'));
  modal.appendChild(hdr);

  const legend = el('div', { style: 'background:#fff;border-bottom:1px solid #ddd;padding:6px 16px;display:flex;gap:10px;align-items:center;flex-shrink:0;flex-wrap:wrap' });
  const legItem = (color, label) => {
    const w = el('div', { style: 'display:flex;gap:5px;align-items:center' });
    w.append(el('div', { style: `width:12px;height:12px;border-radius:3px;background:${color}` }), el('span', { style: 'font-size:11px;color:#555' }, label));
    return w;
  };
  const gridLegend = el('div', { style: 'display:flex;gap:6px;align-items:center' });
  gridLegend.append(
    el('span', { style: 'font-size:11px;color:#555' }, 'Lektionsraster:'),
    rasterNode(GRID.map(() => null), 'full'),
    el('span', { style: 'font-size:11px;color:#999' }, `${GRID[0].from}\u2013${GRID[GRID.length - 1].to}`));
  const vertLegend = el('div', { style: 'display:flex;gap:5px;align-items:center' });
  vertLegend.append(
    el('div', { style: `width:13px;height:22px;border-radius:2px;border:1px solid #ddd;background:${dayFill(withLunch(GRID.map((l, i) => i < 3 ? COLOR_EXC : null)), '#fff')}` }),
    el('span', { style: 'font-size:11px;color:#555' }, 'Tagesbox = Schultag von oben nach unten'));

  const openLegend = el('div', { style: 'display:flex;gap:5px;align-items:center' });
  openLegend.append(
    el('div', { style: 'width:22px;height:12px;border-radius:2px;background:repeating-linear-gradient(135deg, #888888bb 0 3px, #88888833 3px 6px)' }),
    el('span', { style: 'font-size:11px;color:#555' }, 'Lage unbekannt'));
  legend.append(legItem(COLOR_EXC, 'Entschuldigt'), legItem(COLOR_UNEX, 'Unentschuldigt'), legItem(COLOR_PEND, 'Ausstehend'),
    el('div', { style: 'width:1px;height:14px;background:#ddd;margin:0 2px' }), vertLegend, gridLegend, openLegend);
  modal.appendChild(legend);

  const content = el('div', { style: 'flex:1;overflow-y:auto' });
  modal.appendChild(content);

  function refresh() {
    closeP();
    colBtns.style.display = activeView === 'calendar' ? 'flex' : 'none';
    activeView === 'calendar' ? renderCalendar(content) : renderList(content);
  }

  refresh();

  // ── 12. Load stored exams (set by running bookmarklet on Prüfungsplan page) ─
  const storedExams = loadExams();
  if (storedExams.length) {
    exams = storedExams;
    const exMin = new Date(Math.min(...exams.map(e => e.start)));
    const exMax = new Date(Math.max(...exams.map(e => e.end)));
    if (exMin < rangeStart) rangeStart = exMin;
    if (exMax > rangeEnd)   rangeEnd   = exMax;
    let examsVisible = true;
    const examLegRow = el('div', { style: 'display:flex;gap:5px;align-items:center' });
    const examLegDot = el('div', { style: `width:12px;height:12px;border-radius:3px;background:${COLOR_EXAM}` });
    const examLegLbl = el('span', { style: 'font-size:11px;color:#555' }, `Prüfungen (${exams.length})`);
    const btnStyle = 'background:none;border:none;cursor:pointer;padding:0 3px;line-height:1;font-size:11px;color:#aaa;';
    const examToggleBtn = el('button', { style: btnStyle, title: 'Prüfungen ein-/ausblenden' }, '👁');
    const examDelBtn    = el('button', { style: btnStyle, title: 'Prüfungen aus Speicher löschen' }, '✕');
    examToggleBtn.onclick = () => {
      examsVisible = !examsVisible;
      exams = examsVisible ? storedExams : [];
      examLegDot.style.opacity = examsVisible ? '1' : '0.3';
      examLegLbl.style.color = examsVisible ? '#555' : '#bbb';
      examToggleBtn.style.opacity = examsVisible ? '1' : '0.5';
      refresh();
    };
    examDelBtn.onclick = () => {
      sessionStorage.removeItem(EXAM_KEY);
      exams = [];
      examLegRow.remove();
      rangeStart = new Date(Math.min(...absences.map(a => a.start)));
      rangeEnd   = new Date(Math.max(...absences.map(a => a.end)));
      refresh();
    };
    examLegRow.append(examLegDot, examLegLbl, examToggleBtn, examDelBtn);
    legend.appendChild(examLegRow);
    refresh();
  }
})();
