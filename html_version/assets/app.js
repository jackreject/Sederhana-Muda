  /* =========================================================
    FIREBASE ONLINE SYNC - SPG CONTROL PIUTANG
    Data yang disinkronkan:
    piutangData, imports, limits, pjs, pjTypes, limitRules, branchModels
    ========================================================= */
  const APP_VERSION = "4.0.3";
  const { ipcRenderer } = require('electron');
  const FIREBASE_ONLINE = true;
  const firebaseConfig = {
    apiKey: "AIzaSyBKtuewqLdBKod2m4GCr1oAp61EjWhWcuY",
    authDomain: "spg-control-piutang.firebaseapp.com",
    projectId: "spg-control-piutang",
    storageBucket: "spg-control-piutang.firebasestorage.app",
    messagingSenderId: "445325754979",
    appId: "1:445325754979:web:659d0e5491760b80136e56"
  };

  let firebaseDb = null;
  let firebaseReady = false;
  let mappingOnlyNoPj = false;


  function initFirebaseOnline(){
    try{
      if (!FIREBASE_ONLINE) return false;
      if (typeof firebase === 'undefined') {
        console.warn('Firebase SDK belum termuat. Aplikasi berjalan lokal dulu.');
        return false;
      }
      if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
      firebaseDb = firebase.firestore();
      firebaseReady = true;
      console.log('Firebase online aktif.');
      return true;
    }catch(err){
      firebaseReady = false;
      console.error('Firebase gagal aktif:', err);
      return false;
    }
  }

  async function cloudSave(k, v){
    if (!firebaseReady || !firebaseDb) return;
    try{
      await firebaseDb.collection('spgData').doc(k).set({
        value: v,
        updatedAt: new Date().toISOString()
      }, { merge:true });
    }catch(err){
      console.error('Gagal simpan cloud:', k, err);
    }
  }

  async function cloudLoad(k, fallback){
    if (!firebaseReady || !firebaseDb) return fallback;
    try{
      const snap = await firebaseDb.collection('spgData').doc(k).get();
      if (snap.exists) {
        const value = snap.data().value;
        localStorage.setItem(STORAGE_PREFIX + k, JSON.stringify(value));
        return value ?? fallback;
      }
    }catch(err){
      console.error('Gagal baca cloud:', k, err);
    }
    return fallback;
  }
  function safeDocId(s){
    return String(s || 'CABANG')
      .trim()
      .toUpperCase()
      .replace(/[^\w]+/g, '_')
      .replace(/^_+|_+$/g, '');
  }

  async function cloudSavePiutangPerCabang(rows){
    if (!firebaseReady || !firebaseDb) return;

    const groups = {};

    (rows || []).forEach(x => {
      const cabang = String(x.cabang || 'CABANG').trim().toUpperCase();

      if (!groups[cabang]) groups[cabang] = [];

      groups[cabang].push(x);
    });

    for (const [cabang, cabangRows] of Object.entries(groups)) {

      await firebaseDb
        .collection('piutangCabang')
        .doc(safeDocId(cabang))
        .set({
          cabang,
          rows: cabangRows,
          count: cabangRows.length,
          updatedAt: new Date().toISOString()
        });
    }
  }

  async function cloudLoadPiutangPerCabang(fallback){
    if (!firebaseReady || !firebaseDb) return fallback;

    try{
      const snap = await firebaseDb.collection('piutangCabang').get();

      let allRows = [];

      snap.forEach(doc => {
        const d = doc.data();

        if (Array.isArray(d.rows)) {
          allRows = allRows.concat(d.rows);
        }
      });

      return allRows;

    }catch(err){
      console.error('Gagal baca piutang per cabang:', err);
    }

    return fallback;
  }

  async function syncFromCloud(){
    initFirebaseOnline();
    if (!firebaseReady) return;

    data = await cloudLoadPiutangPerCabang(data || []);
    imports = await cloudLoad('imports', imports || []);
    importHistories = await cloudLoad('importHistories', importHistories || []);
    limits = await cloudLoad('limits', limits || {});
    pjs = await cloudLoad('pjs', pjs || []);
    pjTypes = await cloudLoad('pjTypes', pjTypes || []);
    notaMappings = await cloudLoad('notaMappings', notaMappings || {});
    kepalaCabang = await cloudLoad('kepalaCabang', kepalaCabang || []);
    kepalaCabangMappings = await cloudLoad('kepalaCabangMappings', kepalaCabangMappings || {});
    kepalaCabangHistory = await cloudLoad('kepalaCabangHistory', kepalaCabangHistory || []);
    limitRules = await cloudLoad('limitRules', typeof limitRules !== 'undefined' ? limitRules : {});
    branchModels = await cloudLoad('branchModels', typeof branchModels !== 'undefined' ? branchModels : {});
    branchPJTypes = await cloudLoad('branchPJTypes', branchPJTypes || {});
  }
  let realtimeTimer = null;

  function startRealtimeSync() {
    if (!firebaseReady || !firebaseDb) return;

    const reloadRealtime = () => {
      clearTimeout(realtimeTimer);

      realtimeTimer = setTimeout(() => {
        syncFromCloud().then(() => {
          refreshAgingData();
          render();
        });
      }, 500);
    };

    firebaseDb.collection('spgData').onSnapshot(reloadRealtime);
    firebaseDb.collection('piutangCabang').onSnapshot(reloadRealtime);
  }

  async function uploadLocalToCloud(){
    initFirebaseOnline();
    if (!firebaseReady) return alert('Firebase belum aktif. Cek internet / script Firebase.');

    await cloudSave('kepalaCabangMappings', kepalaCabangMappings || {});
    await cloudSave('kepalaCabangHistory', kepalaCabangHistory || []);
    await cloudSave('branchPJTypes', branchPJTypes || {});
    await cloudSavePiutangPerCabang(data || []);
    await cloudSave('imports', imports || []);
    await cloudSave('importHistories', importHistories || []);
    await cloudSave('limits', limits || {});
    await cloudSave('pjs', pjs || []);
    await cloudSave('pjTypes', pjTypes || []);
    await cloudSave('notaMappings', notaMappings || {});
    await cloudSave('kepalaCabang', kepalaCabang || []);
    await cloudSave('limitRules', typeof limitRules !== 'undefined' ? limitRules : {});
    await cloudSave('branchModels', typeof branchModels !== 'undefined' ? branchModels : {});

    alert('Data lokal berhasil dikirim ke Firebase.');
  }

  async function cloudClearPiutangCabang(){
    if (!firebaseReady || !firebaseDb) return;

    const snap = await firebaseDb.collection('piutangCabang').get();

    for (const doc of snap.docs){
      await doc.ref.delete();
    }
  }

  async function startApp(){
    await syncFromCloud();
    refreshAgingData();

    render();
    renderImportHistory();

    /* startRealtimeSync(); */

    setTimeout(() => {
      render();
      renderRisk();
      renderImportHistory();
    }, 300);

    console.log('Memanggil checkAppVersion dari startApp...');

    setTimeout(() => {
      checkAppVersion();
    }, 1500);
  }


  const $ = (id) => document.getElementById(id);

  const STORAGE_PREFIX = 'spg_control_piutang_v3_';
  const ADMIN_PIN = '888';

  function requireAdmin() {
    return new Promise((resolve) => {
      const modal = document.createElement('div');
      modal.id = 'adminPinModal';

      modal.innerHTML = `
        <div style="position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:999999;display:flex;align-items:center;justify-content:center;">
          <div style="width:340px;background:#fff;border-radius:18px;padding:24px;font-family:Arial,sans-serif;box-shadow:0 18px 50px rgba(0,0,0,.25);">
            <h3 style="margin:0 0 8px;font-size:22px;">PIN Admin</h3>
            <p style="margin:0 0 16px;color:#667085;font-size:14px;">Masukkan PIN untuk reset data.</p>

            <input id="adminPinInput" type="password" inputmode="numeric" autocomplete="off"
              placeholder="Masukkan PIN"
              style="width:100%;padding:14px;font-size:18px;box-sizing:border-box;border:1px solid #d0d5dd;border-radius:12px;outline:none;">

            <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:18px;">
              <button id="adminPinCancel" type="button"
  style="
  padding:10px 16px;
  border:0;
  border-radius:10px;
  background:linear-gradient(135deg,#00a8b5,#ff7a3d);
  color:#fff;
  font-weight:700;
  cursor:pointer;
  ">
  Batal
  </button>
              <button id="adminPinOk" type="button"
  style="
  padding:10px 18px;
  border:0;
  border-radius:10px;
  background:linear-gradient(135deg,#00a8b5,#ff7a3d);
  color:#fff;
  font-weight:700;
  cursor:pointer;
  ">
  OK
  </button>
            </div>
          </div>
        </div>
      `;

      document.body.appendChild(modal);

      const input = modal.querySelector('#adminPinInput');
      const ok = modal.querySelector('#adminPinOk');
      const cancel = modal.querySelector('#adminPinCancel');

      setTimeout(() => input.focus(), 100);

      ok.onclick = () => {
        if (input.value !== ADMIN_PIN) {
          alert('PIN salah!');
          input.value = '';
          input.focus();
          return;
        }

        modal.remove();
        resolve(true);
      };

      cancel.onclick = () => {
        modal.remove();
        resolve(false);
      };

      input.onkeydown = (e) => {
        if (e.key === 'Enter') ok.click();
        if (e.key === 'Escape') cancel.click();
      };
    });
  }
  window.requireAdmin = requireAdmin;

  let selectedCustomer = null;
  let selectedNotaKeys = new Set();
  let csvPreview = null;
  let selectedLimitCustomer = null;
  let data = load('piutangData', []);
  let imports = load('imports', []);
  let limits = load('limits', {});
  let pjs = load('pjs', []);
  let pjTypes = load('pjTypes', []);
  let notaMappings = load('notaMappings', {});
  let kepalaCabang = load('kepalaCabang', []);
  let kepalaCabangMappings = load('kepalaCabangMappings', {});
  let kepalaCabangHistory = load('kepalaCabangHistory', []);
  let importHistories = load('importHistories', []);
  let branchPJTypes = load('branchPJTypes', {});

  function save(k, v) {

    localStorage.setItem(STORAGE_PREFIX + k, JSON.stringify(v));

    if (k === 'piutangData') {
      cloudSavePiutangPerCabang(v);
    } else {
      cloudSave(k, v);
    }
  }
  function load(k, d) { try { const r = localStorage.getItem(STORAGE_PREFIX + k); return r ? JSON.parse(r) : d; } catch { return d; } }
  function esc(s) { return String(s ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }
  function money(n) { return 'Rp ' + Math.round(Number(n || 0)).toLocaleString('id-ID'); }
  function onlyNumber(v) { return Number(String(v || '').replace(/[^0-9-]/g, '') || 0); }
  function cleanCustomer(s) { return String(s || '').replace(/\s*\(IDR\)\s*/i, '').split('|')[0].trim().toUpperCase(); }
  function shortCustomerName(s) {
    const clean = cleanCustomer(s);
    const beforeDash = clean.split(' - ')[0].trim();
    return beforeDash || clean;
  }
  function keyNota(x) {
    return [
      String(x.cabang || '').trim().toUpperCase(),
      String(x.noFaktur || '').trim().toUpperCase()
    ].join('||');
  }
  function findDuplicateNota(rows) {
    const seen = {};
    const dup = [];

    rows.forEach(x => {
      const key = keyNota(x);

      if (seen[key]) {
        dup.push(x);
      } else {
        seen[key] = true;
      }
    });

    return dup;
  }
  function notaMappingKey(row) {
    return [
      row.cabang,
      row.noFaktur
    ].map(x => String(x || '').trim().toUpperCase()).join('||');
  }
  function applyNotaMapping(row) {
    const m =
      notaMappings[notaMappingKey(row)] ||
      notaMappings[keyNota(row)];

    return {
      ...row,
      pj: m?.pj || row.pj || '',
      kepala: m?.kepala || row.kepala || ''
    };
  }
  function norm(s) { return String(s ?? '').toLowerCase().replace(/\s+/g, ' ').trim(); }
  function agingLabel(v){ return ({BJT:'BJT <30', TW:'TW 30-60', R1:'R1 60-90', BD:'BD >90'}[String(v || '').toUpperCase()] || v || '-'); }

  function parseMoneyCell(s) {
    s = String(s || '').trim();
    if (!s) return 0;
    s = s.replace(/\s/g, '');
    if (/\.\d{2}$/.test(s)) s = s.slice(0, -3);
    s = s.replace(/[^0-9-]/g, '');
    return Number(s || 0);
  }

  function parseCSV(text) {
    const rows = [];
    let row = [], cell = '', quoted = false;

    for (let i = 0; i < text.length; i++) {
      const c = text[i], n = text[i + 1];

      if (c === '"') {
        if (quoted && n === '"') { cell += '"'; i++; }
        else quoted = !quoted;
      } else if (c === ',' && !quoted) {
        row.push(cell); cell = '';
      } else if ((c === '\n' || c === '\r') && !quoted) {
        if (c === '\r' && n === '\n') i++;
        row.push(cell);
        if (row.some(x => String(x).trim() !== '')) rows.push(row);
        row = []; cell = '';
      } else cell += c;
    }

    row.push(cell);
    if (row.some(x => String(x).trim() !== '')) rows.push(row);
    return rows;
  }

  function parseDateID(s) {
    s = String(s || '').trim();

    let m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
    if (m) return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));

    m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));

    return null;
  }

  function dateToISO(d) {
    if (!d) return '';
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  function yearOf(tanggal) {
    const d = parseDateID(tanggal);
    return d ? String(d.getFullYear()) : '';
  }

  function detectReportDate(rows) {
    const joined = rows.slice(0, 8).flat().join(' ');
    const m = joined.match(/(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s*,?\s*(\d{4})/i);
    if (!m) return new Date();

    const months = {january:0,february:1,march:2,april:3,may:4,june:5,july:6,august:7,september:8,october:9,november:10,december:11};
    return new Date(Number(m[3]), months[m[2].toLowerCase()], Number(m[1]));
  }

  function detectBranch(rows, fileName='') {
    for (const r of rows.slice(0, 30)) {
      const v = String(r[0] || '').trim();

      if (v && /SEDERHANA|PUTRA|MANDIRI|BANGUNAN|TB\.?|CV\.?|PT\.?/i.test(v) && !/Piutang|Tanggal|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|IDR|Grand/i.test(v)) {
        return v.toUpperCase();
      }
    }

    return String(fileName || 'CABANG TIDAK TERBACA').replace(/\.csv$/i, '').toUpperCase();
  }

  function agingFromDueDate(tanggalFaktur) {
    const tgl = parseDateID(tanggalFaktur);
    if (!tgl) return 'BJT';

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    tgl.setHours(0, 0, 0, 0);

    const days = Math.floor((today - tgl) / 86400000);

    if (days < 30) return 'BJT';
    if (days <= 60) return 'TW';
    if (days <= 90) return 'R1';
    return 'BD';
  }

  function agingFromColumn(index, tanggalFaktur, reportDate) {
    return agingFromDueDate(tanggalFaktur);
  }

  function refreshAgingData() {
    data = data.map(x => {
      const aging = agingFromDueDate(x.tanggal);
      const nominal = Number(x.nominal || 0);

      return {
        ...x,
        aging,
        bjt: aging === 'BJT' ? nominal : 0,
        tw: aging === 'TW' ? nominal : 0,
        r1: aging === 'R1' ? nominal : 0,
        bd: aging === 'BD' ? nominal : 0
      };
    });

    localStorage.setItem(
      STORAGE_PREFIX + 'piutangData',
      JSON.stringify(data)
    );
  }

  function parseZahir(text, fileName='') {
    const rows = parseCSV(text);
    const reportDate = detectReportDate(rows);
    const cabang = detectBranch(rows, fileName);
    const out = [];
    let customer = '';
    let kode = '';

    for (const r of rows) {
      const first = String(r[0] || '').trim();

      if (first.includes('|') && /CUST-/i.test(first)) {
        customer = cleanCustomer(first);
        kode = (first.match(/CUST-\d+/i) || [''])[0].toUpperCase();
        continue;
      }

      if (!/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(first)) continue;
      if (!customer) continue;

      const noFaktur = String(r[6] || '').trim();
      if (!noFaktur || !/^\d{4,}/.test(noFaktur)) continue;

      const tanggal = first;
      const jatuhTempo = String(r[3] || '').trim() || tanggal;

      let amountIndex = -1;
      let nominal = 0;

      for (let i = 0; i < r.length; i++) {
        if ([0, 3, 4, 6].includes(i)) continue;
        if (/IDR/i.test(String(r[i] || ''))) continue;

        const n = parseMoneyCell(r[i]);
        if (n > 0) {
          amountIndex = i;
          nominal = n;
        }
      }

      if (!nominal) continue;

      const aging = agingFromColumn(amountIndex, tanggal, reportDate);

      out.push({
        cabang, customer, kode, noFaktur, tanggal,
        tanggalISO: dateToISO(parseDateID(tanggal)),
        jatuhTempo,
        tahun: yearOf(tanggal),
        aging,
        nominal,
        bjt: aging === 'BJT' ? nominal : 0,
        tw: aging === 'TW' ? nominal : 0,
        r1: aging === 'R1' ? nominal : 0,
        bd: aging === 'BD' ? nominal : 0,
        pj: '',
        kepala: ''
      });
    }

    return { cabang, rows: out, reportDate: dateToISO(reportDate) };
  }

  function getLimit(customer) { return Number(limits[customer] || 0); }
  function getPJ(row) { return row.pj || '-'; }
  function getKepalaCabang(row) {
    const cabang = String(row?.cabang || '').trim().toUpperCase();
    const tanggal = String(row?.tanggalISO || '').trim();

    if (!cabang) return '-';

    const histori = (kepalaCabangHistory || []).find(h => {
      const hcabang = String(h.cabang || '').trim().toUpperCase();
      const dari = String(h.dari || h.mulai || '').trim();
      const sampai = String(h.sampai || '').trim();

      return (
        hcabang === cabang &&
        tanggal &&
        dari &&
        tanggal >= dari &&
        (!sampai || tanggal <= sampai)
      );
    });

    return String(
      histori?.kepala ||
      kepalaCabangMappings[cabang] ||
      row.kepala ||
      '-'
    ).trim().toUpperCase();
  }

  function filteredRows() {
    const cab = $('filterCabang')?.value || 'ALL';
    const kepala = $('filterKepala')?.value || 'ALL';
    const salesman = $('filterSalesman')?.value || 'ALL';
    const customer = $('filterCustomer')?.value || 'ALL';
    const aging = $('filterAging')?.value || 'ALL';
    const tahun = $('filterTahun')?.value || 'ALL';
    const dari = $('filterDari')?.value || '';
    const sampai = $('filterSampai')?.value || '';

    return data.filter(x => (
      (cab === 'ALL' || x.cabang === cab) &&
      (kepala === 'ALL' || getKepalaCabang(x) === kepala) &&
      (salesman === 'ALL' || getPJ(x) === salesman) &&
      (customer === 'ALL' || x.customer === customer) &&
      (aging === 'ALL' || x.aging === aging) &&
      (tahun === 'ALL' || x.tahun === tahun) &&
      (!dari || x.tanggalISO >= dari) &&
      (!sampai || x.tanggalISO <= sampai)
    ));
  }

  function priorityRowsNoAging() {
    const cab = $('filterCabang')?.value || 'ALL';
    const kepala = $('filterKepala')?.value || 'ALL';
    const salesman = $('filterSalesman')?.value || 'ALL';
    const customer = $('filterCustomer')?.value || 'ALL';
    const tahun = $('filterTahun')?.value || 'ALL';
    const dari = $('filterDari')?.value || '';
    const sampai = $('filterSampai')?.value || '';

    return data.filter(x => (
      (cab === 'ALL' || x.cabang === cab) &&
      (kepala === 'ALL' || getKepalaCabang(x) === kepala) &&
      (salesman === 'ALL' || getPJ(x) === salesman) &&
      (customer === 'ALL' || x.customer === customer) &&
      (tahun === 'ALL' || x.tahun === tahun) &&
      (!dari || x.tanggalISO >= dari) &&
      (!sampai || x.tanggalISO <= sampai)
    ));
  }

  function setOptions(id, values, allLabel='ALL') {
    const el = $(id);
    if (!el) return;

    const old = el.value;

    el.innerHTML = `<option value="ALL">${allLabel}</option>` + values.map(v => `<option value="${esc(v)}">${esc(v)}</option>`).join('');
    el.value = [...el.options].some(o => o.value === old) ? old : 'ALL';
  }

  function refreshFilters() {

    const selectedKepala = $('filterKepala')?.value || 'ALL';

    setOptions(
      'filterKepala',
      [
        ...new Set([
          ...Object.values(kepalaCabangMappings || {}),
          ...(kepalaCabangHistory || []).map(x => x.kepala)
        ])
      ]
        .map(x => String(x || '').trim().toUpperCase())
        .filter(Boolean)
        .sort(),
      'ALL'
    );

    if ($('filterKepala')) {
      $('filterKepala').value = selectedKepala;
    }

    let allCabang = [
      ...new Set(
        [...data.map(x => x.cabang), ...imports.map(x => x.cabang)]
          .map(x => String(x || '').trim().toUpperCase())
          .filter(Boolean)
      )
    ].sort();

    if (selectedKepala !== 'ALL') {
      allCabang = allCabang.filter(cabang => {
        const kepalaMapping = String(kepalaCabangMappings[cabang] || '')
          .trim()
          .toUpperCase();

        const adaDiData = data.some(x =>
          String(x.cabang || '').trim().toUpperCase() === cabang &&
          getKepalaCabang(x) === selectedKepala
        );

        return kepalaMapping === selectedKepala || adaDiData;
      });
    }

    setOptions('filterCabang', allCabang, 'ALL');

    const cabangAktif = $('filterCabang')?.value || 'ALL';
  const kepalaAktif = $('filterKepala')?.value || 'ALL';

  const salesmanBase = data.filter(x => (
    (cabangAktif === 'ALL' || x.cabang === cabangAktif) &&
    (kepalaAktif === 'ALL' || getKepalaCabang(x) === kepalaAktif)
  ));

  setOptions(
    'filterSalesman',
    [...new Set(
      salesmanBase
        .map(x => getPJ(x))
        .filter(x => x && x !== '-')
    )].sort(),
    'ALL'
  );

    setOptions(
      'filterTahun',
      [...new Set(data.map(x => x.tahun).filter(Boolean))]
        .sort((a,b)=>b.localeCompare(a)),
      'ALL'
    );

    const base = data.filter(x => {
      const cab = $('filterCabang')?.value || 'ALL';
      const kepala = $('filterKepala')?.value || 'ALL';
      const salesman = $('filterSalesman')?.value || 'ALL';
      const tahun = $('filterTahun')?.value || 'ALL';

      return (
        (cab === 'ALL' || x.cabang === cab) &&
        (kepala === 'ALL' || getKepalaCabang(x) === kepala) &&
        (salesman === 'ALL' || getPJ(x) === salesman) &&
        (tahun === 'ALL' || x.tahun === tahun)
      );
    });

    setOptions(
      'filterCustomer',
      [...new Set(base.map(x => x.customer))].sort(),
      'ALL CUSTOMER'
    );

    const mc = $('mappingCabang')?.value || 'ALL';

  const mappingCabangs = [
    ...new Set(data.map(x => x.cabang).filter(Boolean))
  ].sort();

  if ($('mappingCabang')) {
    $('mappingCabang').innerHTML =
      '<option value="ALL">ALL CABANG</option>' +
      mappingCabangs.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('');

    $('mappingCabang').value =
      mappingCabangs.includes(mc) ? mc : 'ALL';
  }

if ($('mappingPJType')) {
  const oldPJType = $('mappingPJType').value || 'ALL';
  const types = pjTypeListAll();

  $('mappingPJType').innerHTML =
    '<option value="ALL">ALL JENIS PJ</option>' +
    types.map(t =>
      `<option value="${esc(t)}">${esc(t)}</option>`
    ).join('');

  $('mappingPJType').value = types.includes(oldPJType) ? oldPJType : 'ALL';
}

    const my = $('mappingYear')?.value || 'ALL';

    const years = [
      ...new Set(
        data.map(x => x.tahun).filter(Boolean)
      )
    ].sort((a,b)=>b.localeCompare(a));

    if ($('mappingYear')) {
      $('mappingYear').innerHTML =
        '<option value="ALL">ALL TAHUN</option>' +
        years.map(y => `<option value="${y}">${y}</option>`).join('');

      $('mappingYear').value =
        years.includes(my) ? my : 'ALL';
    }
  }

  function sumByAging(rows) {
    return rows.reduce((a, x) => {
      a.total += x.nominal;
      a[x.aging.toLowerCase()] += x.nominal;
      return a;
    }, { total:0, bjt:0, tw:0, r1:0, bd:0 });
  }

  function renderSide(rows) {
    const s = sumByAging(rows);
    $('sideBjt').textContent = money(s.bjt);
    $('sideTw').textContent = money(s.tw);
    $('sideR1').textContent = money(s.r1);
    $('sideBd').textContent = money(s.bd);
  }

  function groupCustomerCabang(rows) {
    const map = {};

    rows.forEach(x => {
      const k = x.customer + '||' + x.cabang;

      if (!map[k]) {
        map[k] = { customer:x.customer, cabang:x.cabang, bjt:0, tw:0, r1:0, bd:0, total:0, limit:getLimit(x.customer), faktur:0, pjs:new Set() };
      }

      map[k][x.aging.toLowerCase()] += x.nominal;
      map[k].total += x.nominal;
      map[k].faktur++;
    });

    return map;
  }

  function renderKpi(rows) {
    const s = sumByAging(rows);
    const customerCount = new Set(
    rows.map(x => x.customer + '||' + x.cabang)
  ).size;
    const totalFaktur = rows.length;

    const map = groupCustomerCabang(rows);
    let over = 0;
    let overFaktur = 0;

    Object.values(map).forEach(x => {
      if (x.limit > 0 && x.total > x.limit) {
        over += (x.total - x.limit);
        overFaktur += x.faktur;
      }
    });

    $('kpiTotal').innerHTML = `<span class="kpi-money">${money(s.total)}</span><span class="kpi-sub">Total Faktur: ${totalFaktur.toLocaleString('id-ID')}</span>`;
    $('kpiBd').innerHTML = `<span class="kpi-money">${money(s.bd)}</span><span class="kpi-sub">Total Faktur: ${rows.filter(x => x.aging === 'BD').length.toLocaleString('id-ID')}</span>`;
    $('kpiOver').innerHTML = `<span class="kpi-money">${money(over)}</span><span class="kpi-sub">Total Faktur: ${overFaktur.toLocaleString('id-ID')}</span>`;
    $('kpiCustomer').innerHTML = `<span class="kpi-money">${customerCount.toLocaleString('id-ID')}</span>`;
    $('importStatus').textContent = imports.length ? `${new Set(data.map(x => x.cabang)).size} Cabang Terimport` : 'Belum Ada Import';
  }

  function renderPriority(rows) {
    const q = norm($('searchPriority')?.value || '');
    const selectedAging = $('filterAging')?.value || 'ALL';
    const dari = $('filterDari')?.value || '';
    const sampai = $('filterSampai')?.value || '';
    const hasDateFilter = !!dari || !!sampai;

    // Ambil data mengikuti filter dashboard: Cabang, Kepala Cabang, Salesman, Customer, Tahun, Tanggal.
    // Aging sengaja tidak dipotong dulu supaya kolom BJT/TW/R1/BD tetap lengkap per customer.
    const fullAgingRows = priorityRowsNoAging();

    let arr = Object.values(groupCustomerCabang(fullAgingRows))
      .filter(x => {
        const over = x.limit > 0 && x.total > x.limit;

        // Kalau user pilih aging tertentu, tampilkan customer yang punya aging itu saja.
        if (selectedAging !== 'ALL') {
          return x[selectedAging.toLowerCase()] > 0;
        }

        // Default tabel Prioritas hanya tampilkan yang bermasalah:
        // BD > 90 atau Over Limit.
        return x.bd > 0 || over;
      })
      .filter(x => {
        if (!q) return true;

        return norm(x.customer).includes(q) ||
          norm(x.cabang).includes(q) ||
          norm(money(x.total)).includes(q) ||
          norm(money(x.bjt)).includes(q) ||
          norm(money(x.tw)).includes(q) ||
          norm(money(x.r1)).includes(q) ||
          norm(money(x.bd)).includes(q);
      })
      .sort((a,b) => {
        const overA = a.limit > 0 && a.total > a.limit;
        const overB = b.limit > 0 && b.total > b.limit;

        const riskA = (a.bd > 0 && overA) ? 6 :
                      a.bd > 0 ? 5 :
                      overA ? 4 :
                      a.r1 > 0 ? 3 :
                      a.tw > 0 ? 2 :
                      a.bjt > 0 ? 1 : 0;

        const riskB = (b.bd > 0 && overB) ? 6 :
                      b.bd > 0 ? 5 :
                      overB ? 4 :
                      b.r1 > 0 ? 3 :
                      b.tw > 0 ? 2 :
                      b.bjt > 0 ? 1 : 0;

        if (selectedAging !== 'ALL') {
          const key = selectedAging.toLowerCase();
          return b[key] - a[key] || riskB - riskA || b.total - a.total;
        }

        return riskB - riskA || b.bd - a.bd || b.total - a.total;
      });

    $('priorityBody').innerHTML = arr.length ? arr.map(x => {
      const over = x.limit > 0 && x.total > x.limit;

      let status = 'AMAN';
      if (x.bd > 0 && over) status = 'BD + OVER';
      else if (x.bd > 0) status = 'BD';
      else if (over) status = 'OVER LIMIT';
      else if (x.r1 > 0) status = 'R1';
      else if (x.tw > 0) status = 'TW';
      else if (x.bjt > 0) status = 'BJT';
      else if (hasDateFilter) status = 'FILTER';

      const pillClass =
        status === 'BD' || status === 'BD + OVER' || status === 'OVER LIMIT'
          ? 'bad'
          : status === 'R1'
            ? 'mid'
            : 'ok';

      return `<tr>
        <td><span class="clickable" data-view-customer="${esc(x.customer)}" title="${esc(x.customer)}">${esc(shortCustomerName(x.customer))}</span></td>
        <td>${esc(x.cabang)}</td>
        <td>${money(x.bjt)}</td>
        <td>${money(x.tw)}</td>
        <td>${money(x.r1)}</td>
        <td>${money(x.bd)}</td>
        <td><b>${money(x.total)}</b></td>
        <td>${x.limit ? money(x.limit) : 'NON LIMIT'}</td>
        <td><span class="pill ${pillClass}">${status}</span></td>
      </tr>`;
    }).join('') : `<tr><td colspan="9" class="empty">Tidak ada data BD atau Over Limit sesuai filter</td></tr>`;
  }

  function renderDetail(rows) {
    const qRaw = $('searchDetail')?.value || '';
    const q = norm(qRaw);

    const detailCabang = norm($('detailCabangSearch')?.value || '');
    const detailCustomer = norm($('detailCustomerSearch')?.value || '');

    refreshDetailMiniFilters(rows);

    const view = rows.filter(x => {
      if (detailCabang && !norm(x.cabang).includes(detailCabang)) return false;
      if (detailCustomer && !norm(x.customer).includes(detailCustomer)) return false;

      if (!q) return true;

      const searchable = [
        x.customer, x.cabang, x.noFaktur, x.tanggal,
        x.tanggalISO, x.jatuhTempo, x.tahun, x.aging,
        x.kode, getPJ(x), String(x.nominal), money(x.nominal)
      ].map(norm).join(' | ');

      return searchable.includes(q);
    });

    $('detailBody').innerHTML = view.length ? view.map(x => `<tr>
      <td><span class="clickable" data-view-customer="${esc(x.customer)}">${esc(x.customer)}</span></td>
      <td>${esc(x.cabang)}</td>
      <td>${esc(x.noFaktur)}</td>
      <td>${esc(x.tanggal)}</td>
      <td>${esc(x.tahun)}</td>
      <td><span class="pill ${x.aging === 'BD' ? 'bad' : x.aging === 'R1' ? 'mid' : 'ok'}">${agingLabel(x.aging)}</span></td>
      <td><b>${money(x.nominal)}</b></td>
      <td>${esc(getPJ(x))}</td>
    </tr>`).join('') : `<tr><td colspan="8" class="empty">Data tidak ditemukan untuk: ${esc(qRaw)}</td></tr>`;
  }

  function refreshDetailMiniFilters(rows) {
    const cabangList = [...new Set(rows.map(x => x.cabang).filter(Boolean))].sort();
    const cabangValue = norm($('detailCabangSearch')?.value || '');

    const customerBase = rows.filter(x =>
      !cabangValue || norm(x.cabang).includes(cabangValue)
    );

    const customerList = [...new Set(customerBase.map(x => x.customer).filter(Boolean))].sort();

    if ($('detailCabangOptions')) {
      $('detailCabangOptions').innerHTML =
        cabangList.map(x => `<option value="${esc(x)}"></option>`).join('');
    }

    if ($('detailCustomerOptions')) {
      $('detailCustomerOptions').innerHTML =
        customerList.map(x => `<option value="${esc(x)}"></option>`).join('');
    }
  }

 function mappingFilteredRows() {
  const cabang = $('mappingCabang')?.value || 'ALL';
  const q = norm($('mappingSearch')?.value || '');
  const tahun = $('mappingYear')?.value || 'ALL';

  return data.filter(x => {
    const currentPJ = getPJ(x);

    const hay = [
      x.customer,
      x.cabang,
      x.noFaktur,
      x.tanggal,
      x.tanggalISO,
      x.aging,
      currentPJ,
      String(x.nominal),
      money(x.nominal)
    ].map(norm).join(' | ');

    return (cabang === 'ALL' || x.cabang === cabang) &&
      (tahun === 'ALL' || x.tahun === tahun) &&
      (!mappingOnlyNoPj || !currentPJ || currentPJ === '-') &&
      (!q || hay.includes(q));
  });
}

  function renderCustomerList() {
    const map = {};

    mappingFilteredRows().forEach(x => {
      const key = x.customer + '||' + x.cabang;

      if (!map[key]) {
        map[key] = {
          customer: x.customer,
          cabang: x.cabang,
          faktur: 0,
          total: 0,
          bd: 0,
          pjs: new Set()
        };
      }

      map[key].faktur++;
      map[key].total += Number(x.nominal || 0);
      if (x.aging === 'BD') map[key].bd += Number(x.nominal || 0);
      if (getPJ(x) && getPJ(x) !== '-') map[key].pjs.add(getPJ(x));
    });

    const arr = Object.values(map).sort((a,b) => b.total - a.total);

    if ($('mappingCustomerCount')) {
      $('mappingCustomerCount').textContent = `${arr.length.toLocaleString('id-ID')} Customer Cabang`;
    }

    $('customerList').innerHTML = arr.length ? `
      <table class="customer-map-table clean-customer-table">
        <thead>
          <tr>
            <th>Customer</th>
            <th>Cabang</th>
            <th>Faktur</th>
            <th>Total</th>
            <th>BD</th>
            <th>PJ</th>
          </tr>
        </thead>
        <tbody>
          ${arr.map(x => `
            <tr class="customer-row ${selectedCustomer === (x.customer + '||' + x.cabang) ? 'active' : ''}"
      data-map-customer="${esc(x.customer)}"
      data-map-cabang="${esc(x.cabang)}">
              <td>
                <b>${esc(shortCustomerName(x.customer))}</b>
                <small>${esc(x.customer)}</small>
              </td>
              <td>${esc(x.cabang)}</td>
              <td>${x.faktur.toLocaleString('id-ID')}</td>
              <td><b>${money(x.total)}</b></td>
              <td class="${x.bd > 0 ? 'neg' : ''}">${money(x.bd)}</td>
              <td>${esc(x.pjs.size ? [...x.pjs].join(', ') : '-')}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    ` : '<div class="empty-card">Tidak ada customer sesuai filter</div>';
  }

  function renderNotaCustomer() {
    if (!selectedCustomer) {
      $('selectedCustomerTitle').textContent = 'Detail Nota Customer';
      if ($('selectedCustomerMeta')) $('selectedCustomerMeta').textContent = 'Klik customer di kiri untuk melihat faktur.';
      $('notaBody').innerHTML = '<tr><td colspan="5" class="empty">Klik customer dulu</td></tr>';
      return;
    }

    const [selectedCust, selectedCabang] = String(selectedCustomer || '').split('||');

  const rows = mappingFilteredRows()
    .filter(x =>
      norm(x.customer) === norm(selectedCust) &&
      norm(x.cabang) === norm(selectedCabang)
    )
      .sort((a,b) => String(a.tanggalISO).localeCompare(String(b.tanggalISO)));

    const total = rows.reduce((s,x)=>s + Number(x.nominal || 0), 0);
    const aging = sumByAging(rows);

    $('selectedCustomerTitle').textContent =
    `${shortCustomerName(selectedCust)} - ${selectedCabang}`;
    if ($('selectedCustomerMeta')) $('selectedCustomerMeta').textContent = `${rows.length.toLocaleString('id-ID')} faktur • Total ${money(total)} • BJT <30 ${money(aging.bjt)} • TW 30-60 ${money(aging.tw)} • R1 60-90 ${money(aging.r1)} • BD >90 ${money(aging.bd)}`;

    $('notaBody').innerHTML = rows.length ? rows.map(x => {
      const k = keyNota(x);

      return `<tr>
        <td><input type="checkbox" class="notaCheck" value="${esc(k)}" ${selectedNotaKeys.has(k) ? 'checked' : ''}></td>
        <td><b>${esc(x.noFaktur)}</b><br><small>${esc(x.cabang)}</small></td>
        <td>${esc(x.tanggal)}</td>
        <td><span class="pill ${x.aging === 'BD' ? 'bad' : x.aging === 'R1' ? 'mid' : 'ok'}">${agingLabel(x.aging)}</span></td>
        <td><b>${money(x.nominal)}</b><br><small>PJ: ${esc(getPJ(x))}</small></td>
      </tr>`;
    }).join('') : '<tr><td colspan="5" class="empty">Tidak ada nota sesuai filter tanggal/pencarian</td></tr>';
  }

  function customerSummaryAll() {
    const map = {};

    data.forEach(x => {
      const key = x.customer + '||' + x.cabang;

      if (!map[key]) {
        map[key] = {
          customer: x.customer,
          cabang: x.cabang,
          faktur: 0,
          bjt: 0,
          tw: 0,
          r1: 0,
          bd: 0,
          total: 0,
          limit: getLimit(x.customer),
          pjs: new Set()
        };
      }

      map[key].faktur++;

      if (getPJ(x) && getPJ(x) !== '-') {
        map[key].pjs.add(getPJ(x));
      }

      map[key][x.aging.toLowerCase()] += Number(x.nominal || 0);
      map[key].total += Number(x.nominal || 0);
      map[key].limit = getLimit(x.customer);
    });

    Object.keys(limits).forEach(customer => {
      const alreadyExists = Object.values(map).some(x => x.customer === customer);

      if (!alreadyExists) {
        map[customer + '||-'] = {
          customer,
          cabang: '-',
          faktur: 0,
          bjt: 0,
          tw: 0,
          r1: 0,
          bd: 0,
          total: 0,
          limit: getLimit(customer),
          pjs: new Set()
        };
      }
    });

    return Object.values(map).map(x => ({
      ...x,
      pjText: x.pjs instanceof Set && x.pjs.size ? [...x.pjs].join(', ') : '-'
    }));
  }

  function limitStatus(x) {
    if (!x.limit) return 'NON LIMIT';
    if (x.total > x.limit) return 'OVER LIMIT';
    return 'AMAN';
  }

  function limitStatusKey(status) {
    return String(status || '').toUpperCase().replace(/\s+/g, '_');
  }

  function matchLimitFilter(x, filter) {
    if (!filter || filter === 'ALL') return true;
    if (filter === 'LIMIT_TERISI') return x.limit > 0;
    if (filter === 'NON_LIMIT') return !x.limit;
    return limitStatusKey(limitStatus(x)) === filter;
  }

  function setLimitFilter(value) {
    if ($('limitStatusFilter')) $('limitStatusFilter').value = value || 'ALL';
    if ($('limitSearch')) $('limitSearch').value = '';
    renderLimit();
    renderRisk();
  renderImportHistory();
  }


  function renderMasterSummary() {
    const rows = customerSummaryAll();
    const cabangMap = {};

    data.forEach(x => {
      if (!cabangMap[x.cabang]) cabangMap[x.cabang] = { cabang:x.cabang, customer:new Set(), faktur:0, total:0, bd:0 };
      cabangMap[x.cabang].customer.add(x.customer);
      cabangMap[x.cabang].faktur++;
      cabangMap[x.cabang].total += Number(x.nominal || 0);
      if (x.aging === 'BD') cabangMap[x.cabang].bd += Number(x.nominal || 0);
    });

    const cabangArr = Object.values(cabangMap).sort((a,b)=>b.total-a.total);
    const overRows = rows.filter(x => x.limit > 0 && x.total > x.limit);
    const overCount = overRows.length;
    const overNominal = overRows.reduce((s,x)=>s + (x.total - x.limit), 0);
    const limitCount = rows.filter(x => x.limit > 0).length;
    const nonLimitCount = rows.filter(x => !x.limit).length;

    if ($('masterCabangCards')) {
      $('masterCabangCards').innerHTML = cabangArr.length ? cabangArr.map(x => `<article class="master-stat">
        <span>${esc(x.cabang)}</span>
        <b>${money(x.total)}</b>
        <small>${x.customer.size} customer • ${x.faktur} faktur</small>
      </article>`).join('') : `<article class="master-stat empty-stat"><span>Belum ada cabang</span><b>Import CSV dulu</b><small>Setelah import, cabang akan muncul otomatis.</small></article>`;
    }

    if ($('masterLimitInfo')) {
      $('masterLimitInfo').innerHTML = `
        <article class="master-stat"><span>Total Customer</span><b>${rows.length.toLocaleString('id-ID')}</b><small>Dari data import + master limit</small></article>
        <article class="master-stat"><span>Customer Pakai Limit</span><b>${limitCount.toLocaleString('id-ID')}</b><small>Customer yang sudah punya batas limit</small></article>
        <article class="master-stat"><span>Non Limit</span><b>${nonLimitCount.toLocaleString('id-ID')}</b><small>Belum dibuat batas limit</small></article>
        <article class="master-stat danger"><span>Over Limit</span><b>${overCount.toLocaleString('id-ID')}</b><small>Nominal lewat limit: ${money(overNominal)}</small></article>`;
    }
  }

  function refreshLimitCustomerOptions() {
    const dl = $('customerOptions');
    if (!dl) return;

    const q = norm($('limitSearch')?.value || '');

    const baseRows = data.filter(x => {
      if (!q) return true;

      return norm([
        x.cabang,
        x.customer,
        getPJ(x),
        x.noFaktur
      ].join(' | ')).includes(q);
    });

    const customers = [...new Set(
      baseRows.map(x => x.customer).concat(Object.keys(limits))
    )]
    .filter(Boolean)
    .sort();

    dl.innerHTML = customers
      .map(c => `<option value="${esc(c)}"></option>`)
      .join('');
  }

  function renderLimit() {
    renderMasterSummary();
    refreshLimitCustomerOptions();

    const q = norm($('limitSearch')?.value || '');
    const statusFilter = $('limitStatusFilter')?.value || 'ALL';
    const rows = customerSummaryAll()
      .filter(x => matchLimitFilter(x, statusFilter))
      .filter(x => {
        if (!q) return true;
        return [x.customer, x.cabang, x.pjText, money(x.total), money(x.limit), limitStatus(x)].map(norm).join(' | ').includes(q);
      })
      .sort((a,b) => {
        const score = x => (x.limit > 0 && x.total > x.limit ? 3 : x.limit > 0 ? 2 : 1);
        return score(b) - score(a) || b.total - a.total;
      });

    if ($('limitBody')) {
      $('limitBody').innerHTML = rows.length ? rows.map(x => {
        const status = x.status || limitStatus(x);
  const isPJModel = x.model === 'PJ';

  const limitText = isPJModel
    ? `Limit PJ: ${money(x.limit || 0)}`
    : (x.limit ? money(x.limit) : 'NON LIMIT');

  const sisaText = isPJModel
    ? `Sisa PJ: ${money(x.sisa || 0)}`
    : (x.limit ? money(x.sisa ?? (x.limit - x.total)) : '-');

  const totalText = isPJModel
    ? `${money(x.total)}<br><small>Total PJ: ${money(x.pjTotal || x.total)}</small>`
    : money(x.total);

  const cls = status === 'OVER LIMIT' ? 'bad' : status === 'AMAN' ? 'ok' : 'mid';
        return `<tr data-customer="${esc(x.customer)}">
          <td>
    <span class="clickable" data-view-customer="${esc(x.customer)}" data-view-cabang="${esc(x.cabang)}">
      <b>${esc(shortCustomerName(x.customer))}</b><br>
      <small title="${esc(x.customer)}">${esc(x.customer)}</small>
    </span>
  </td>
          <td>${esc(x.cabang)}</td>
          <td>${esc(x.pjText || '-')}</td>
          <td>${x.faktur.toLocaleString('id-ID')}</td>
          <td class="num">${totalText}</td>
  <td class="num">${limitText}</td>
  <td class="num ${(x.sisa || 0) < 0 ? 'neg' : ''}">${sisaText}</td>
          <td><span class="pill ${cls}">${status}</span></td>
          <td class="action-cell">
            <button class="mini-btn" data-edit-limit="${esc(x.customer)}">Edit</button>
            ${x.limit ? `<button class="mini-btn danger" data-delete-limit="${esc(x.customer)}">Hapus</button>` : ''}
          </td>
        </tr>`;
      }).join('') : '<tr><td colspan="9" class="empty">Belum ada customer. Import CSV dulu atau isi limit manual.</td></tr>';
    }
  }


  function scrollToCustomerRow(customer) {
    const target = norm(customer || '');
    if (!target) return;

    // Render ulang dulu supaya kalau sedang ada pencarian, baris yang dipilih pasti muncul.
    renderLimit();

    setTimeout(() => {
      const rows = document.querySelectorAll('#limitBody tr');

      for (const row of rows) {
        const fullName = norm(row.dataset.customer || '');
        const visibleText = norm(row.textContent || '');

        if (fullName === target || fullName.includes(target) || visibleText.includes(target)) {
          row.scrollIntoView({ behavior: 'smooth', block: 'center' });
          row.classList.add('row-focus');

          setTimeout(() => row.classList.remove('row-focus'), 2600);
          break;
        }
      }
    }, 120);
  }


  function riskFilteredRowsNoAging() {
    const cab = $('riskCabang')?.value || 'ALL';
    const salesman = $('riskSalesman')?.value || 'ALL';
    const customer = $('riskCustomer')?.value || 'ALL';
    const tahun = $('riskTahun')?.value || 'ALL';
    const dari = $('riskDari')?.value || '';
    const sampai = $('riskSampai')?.value || '';

    return data.filter(x => (
      (cab === 'ALL' || x.cabang === cab) &&
      (salesman === 'ALL' || getPJ(x) === salesman) &&
      (customer === 'ALL' || x.customer === customer) &&
      (tahun === 'ALL' || x.tahun === tahun) &&
      (!dari || x.tanggalISO >= dari) &&
      (!sampai || x.tanggalISO <= sampai)
    ));
  }

  function refreshRiskFilters() {
    const selectedKepala = $('riskKepala')?.value || 'ALL';

    setOptions(
      'riskKepala',
      [
        ...new Set([
          ...Object.values(kepalaCabangMappings || {}),
          ...(kepalaCabangHistory || []).map(x => x.kepala)
        ])
      ]
        .map(x => String(x || '').trim().toUpperCase())
        .filter(Boolean)
        .sort(),
      'ALL'
    );

    if ($('riskKepala')) $('riskKepala').value = selectedKepala;

    let allCabang = [
      ...new Set(
        [...data.map(x => x.cabang), ...imports.map(x => x.cabang)]
          .map(x => String(x || '').trim().toUpperCase())
          .filter(Boolean)
      )
    ].sort();

    if (selectedKepala !== 'ALL') {
      allCabang = allCabang.filter(cabang =>
        data.some(x =>
          String(x.cabang || '').trim().toUpperCase() === cabang &&
          getKepalaCabang(x) === selectedKepala
        ) ||
        String(kepalaCabangMappings[cabang] || '').trim().toUpperCase() === selectedKepala
      );
    }

    setOptions('riskCabang', allCabang, 'ALL');

    const base = data.filter(x => {
      const cab = $('riskCabang')?.value || 'ALL';
      const kepala = $('riskKepala')?.value || 'ALL';
      const salesman = $('riskSalesman')?.value || 'ALL';
      const tahun = $('riskTahun')?.value || 'ALL';

      return (
        (cab === 'ALL' || x.cabang === cab) &&
        (kepala === 'ALL' || getKepalaCabang(x) === kepala) &&
        (salesman === 'ALL' || getPJ(x) === salesman) &&
        (tahun === 'ALL' || x.tahun === tahun)
      );
    });

    setOptions(
      'riskSalesman',
      [...new Set(base.map(x => getPJ(x)).filter(x => x && x !== '-'))].sort(),
      'ALL'
    );

    setOptions(
      'riskTahun',
      [...new Set(base.map(x => x.tahun).filter(Boolean))].sort((a,b)=>b.localeCompare(a)),
      'ALL'
    );

    setOptions(
      'riskCustomer',
      [...new Set(base.map(x => x.customer))].sort(),
      'ALL CUSTOMER'
    );
  }

  function riskStatus(x) {
    if (x.bd > 0) return 'BD';
    if (x.r1 > 0) return 'R1';
    if (x.tw > 0) return 'TW';
    if (x.bjt > 0) return 'BJT';
    return '-';
  }

  function renderRisk() {
    const cab = $('riskCabang')?.value || 'ALL';
    const kepala = $('riskKepala')?.value || 'ALL';
    const salesman = $('riskSalesman')?.value || 'ALL';
    const customer = $('riskCustomer')?.value || 'ALL';
    const agingRaw = String($('riskAging')?.value || 'ALL').toUpperCase();
    const aging = ['ALL', 'SEMUA', ''].includes(agingRaw) ? 'ALL' : agingRaw;
    const tahun = $('riskTahun')?.value || 'ALL';
    const dari = $('riskDari')?.value || '';
    const sampai = $('riskSampai')?.value || '';
    const search = ($('riskSearch')?.value || '').toLowerCase();

    const rows = data.filter(x => {
      const text = [
        x.customer,
        x.cabang,
        x.nominal,
        x.aging,
        getPJ(x),
        x.noFaktur
      ].join(' ').toLowerCase();

      return (
        (cab === 'ALL' || x.cabang === cab) &&
        (kepala === 'ALL' || getKepalaCabang(x) === kepala) &&
        (salesman === 'ALL' || getPJ(x) === salesman) &&
        (customer === 'ALL' || x.customer === customer) &&
        (aging === 'ALL' || String(x.aging || '').toUpperCase() === aging) &&
        (tahun === 'ALL' || String(x.tahun) === String(tahun)) &&
        (!dari || x.tanggalISO >= dari) &&
        (!sampai || x.tanggalISO <= sampai) &&
        (!search || text.includes(search))
      );
    });

    const total = rows.reduce((s,x)=>s + Number(x.nominal || 0), 0);
    const bjt = rows.filter(x=>x.aging === 'BJT').reduce((s,x)=>s + Number(x.nominal || 0), 0);
    const tw = rows.filter(x=>x.aging === 'TW').reduce((s,x)=>s + Number(x.nominal || 0), 0);
    const r1 = rows.filter(x=>x.aging === 'R1').reduce((s,x)=>s + Number(x.nominal || 0), 0);
    const bd = rows.filter(x=>x.aging === 'BD').reduce((s,x)=>s + Number(x.nominal || 0), 0);

    if ($('riskTotal')) $('riskTotal').innerHTML = money(total);
    if ($('riskBjt')) $('riskBjt').innerHTML = money(bjt);
    if ($('riskTw')) $('riskTw').innerHTML = money(tw);
    if ($('riskR1')) $('riskR1').innerHTML = money(r1);
    if ($('riskBd')) $('riskBd').innerHTML = money(bd);

    const map = {};

    rows.forEach(x => {
      const key = `${x.cabang}||${x.customer}`;

      if (!map[key]) {
        map[key] = {
          customer: x.customer,
          cabang: x.cabang,
          bjt: 0,
          tw: 0,
          r1: 0,
          bd: 0,
          total: 0
        };
      }

      const n = Number(x.nominal || 0);

      map[key].total += n;
      if (x.aging === 'BJT') map[key].bjt += n;
      if (x.aging === 'TW') map[key].tw += n;
      if (x.aging === 'R1') map[key].r1 += n;
      if (x.aging === 'BD') map[key].bd += n;
    });

    const arr = Object.values(map).sort((a,b)=>b.total - a.total);

    if (!$('riskBody')) return;

    $('riskBody').innerHTML = arr.length ? arr.map(x => {
      const status = x.bd > 0 ? 'BD' : x.r1 > 0 ? 'R1' : x.tw > 0 ? 'TW' : 'AMAN';

      return `
        <tr>
          <td>
    <span class="clickable"
          data-view-customer="${esc(x.customer)}"
          data-view-cabang="${esc(x.cabang)}">
      <b>${esc(shortCustomerName(x.customer))}</b>
    </span>
  </td>
          <td>${esc(x.cabang)}</td>
          <td class="num">${money(x.bjt)}</td>
          <td class="num">${money(x.tw)}</td>
          <td class="num">${money(x.r1)}</td>
          <td class="num neg">${money(x.bd)}</td>
          <td class="num"><b>${money(x.total)}</b></td>
          <td><span class="pill ${status === 'BD' ? 'bad' : status === 'AMAN' ? 'ok' : 'mid'}">${status}</span></td>
        </tr>
      `;
    }).join('') : '<tr><td colspan="8" class="empty">Belum ada data risiko</td></tr>';
  }

  function openCustomerInvoiceModal(customer, cabang = '') {
    const modal = $('invoiceModal');
    if (!modal) return;

    const rows = filteredRows()
      .filter(x =>
        norm(x.customer) === norm(customer) &&
        (!cabang || norm(x.cabang) === norm(cabang))
      )
      .sort((a,b) => {
        const order = {BD:4, R1:3, TW:2, BJT:1};
        return (order[b.aging] || 0) - (order[a.aging] || 0) ||
          String(a.tanggalISO).localeCompare(String(b.tanggalISO));
      });

    const total = rows.reduce((s,x)=>s + Number(x.nominal || 0), 0);

    $('invoiceCustomerTitle').textContent = shortCustomerName(customer);
    $('invoiceCustomerMeta').textContent =
      `${rows.length.toLocaleString('id-ID')} faktur • Total ${money(total)}`;

    $('invoiceBody').innerHTML = rows.length ? rows.map(x => `<tr>
      <td><b>${esc(x.noFaktur)}</b></td>
      <td>${esc(x.cabang)}</td>
      <td>${esc(x.tanggal)}</td>
      <td><span class="pill ${x.aging === 'BD' ? 'bad' : x.aging === 'R1' ? 'mid' : 'ok'}">${agingLabel(x.aging)}</span></td>
      <td><b>${money(x.nominal)}</b></td>
      <td>${esc(getPJ(x))}</td>
    </tr>`).join('') : `<tr><td colspan="6" class="empty">Tidak ada faktur sesuai filter aktif</td></tr>`;

    modal.classList.add('active');
    modal.setAttribute('aria-hidden', 'false');
  }

  function closeCustomerInvoiceModal() {
    const modal = $('invoiceModal');
    if (!modal) return;
    modal.classList.remove('active');
    modal.setAttribute('aria-hidden', 'true');
  }


  function normalizePJName(v){
    return String(v || '').trim().toUpperCase().replace(/\s+/g,' ');
  }

  function normalizePJType(v){
    return String(v || '').trim().toUpperCase().replace(/\s+/g,' ');
  }

  function pjTypeListAll(){
    return [...new Set(pjTypes.map(normalizePJType).filter(Boolean))].sort((a,b)=>a.localeCompare(b));
  }

  function renderPJTypeDropdown(){
    const el = $('pjTypeInput');
    const body = $('pjTypeBody');
    const count = $('pjTypeCount');
    const types = pjTypeListAll();
    if (el) {
      const old = el.value;
      el.innerHTML = types.length
        ? types.map(x => `<option value="${esc(x)}">${esc(x)}</option>`).join('')
        : `<option value="">Buat Jenis PJ dulu</option>`;
      el.value = types.includes(old) ? old : (types[0] || '');
    }
    if (count) count.textContent = `${types.length.toLocaleString('id-ID')} Jenis`;
    if (body) {
      body.innerHTML = types.length ? types.map(x => {
        const used = pjs.filter(p => normalizePJType(p.type) === x).length;
        return `<tr>
          <td><b>${esc(x)}</b></td>
          <td>${used.toLocaleString('id-ID')} PJ</td>
          <td><button type="button" class="mini-btn danger" data-delete-pj-type="${esc(x)}">Hapus</button></td>
        </tr>`;
      }).join('') : `<tr><td colspan="3" class="empty">Belum ada Jenis PJ. Buat contoh: SALES, MANDOR, ADMIN TAGIH.</td></tr>`;
    }
  }

  function renderBranchPJTypes(){
  const cabangInput = $('branchPJCabangInput');
  const typeInput = $('branchPJTypeInput');
  const body = $('branchPJTypeBody');
  const count = $('branchPJTypeCount');

  const cabangs = [
    ...new Set([
      ...data.map(x => x.cabang),
      ...imports.map(x => x.cabang),
      ...Object.keys(branchPJTypes || {})
    ].map(x => String(x || '').trim().toUpperCase()).filter(Boolean))
  ].sort();

  const types = pjTypeListAll();

  if (cabangInput) {
    const old = cabangInput.value;
    cabangInput.innerHTML =
      `<option value="">Pilih Cabang</option>` +
      cabangs.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('');
    cabangInput.value = cabangs.includes(old) ? old : '';
  }

  if (typeInput) {
    const old = typeInput.value;
    typeInput.innerHTML =
      `<option value="">Pilih Jenis PJ</option>` +
      types.map(t => `<option value="${esc(t)}">${esc(t)}</option>`).join('');
    typeInput.value = types.includes(old) ? old : '';
  }

  const rows = Object.entries(branchPJTypes || {})
    .map(([cabang, type]) => ({ cabang, type }))
    .sort((a,b) => a.cabang.localeCompare(b.cabang));

  if (count) {
    count.textContent = `${rows.length.toLocaleString('id-ID')} Cabang`;
  }

  if (body) {
    body.innerHTML = rows.length ? rows.map(x => `
      <tr>
        <td><b>${esc(x.cabang)}</b></td>
        <td>${esc(x.type)}</td>
        <td>
          <button type="button" class="mini-btn danger" data-delete-branch-pj-type="${esc(x.cabang)}">
            Hapus
          </button>
        </td>
      </tr>
    `).join('') : `<tr><td colspan="3" class="empty">Belum ada mapping cabang</td></tr>`;
  }
}

  function pjListAll(){
   const fromData = [...new Set(data.map(x => getPJ(x)).filter(x => x && x !== '-'))]
  .map(name => ({name, type:'DARI MAPPING'}));
    const map = {};
    pjs.forEach(x => { if (x && x.name) map[x.name] = {name:x.name, type:x.type || 'LAINNYA'}; });
    fromData.forEach(x => { if (!map[x.name]) map[x.name] = x; });
    return Object.values(map).sort((a,b)=>a.name.localeCompare(b.name));
  }

  function branchPJType(cabang) {
  const key = String(cabang || '').trim().toUpperCase();
  return String(branchPJTypes[key] || '').trim().toUpperCase();
}

function getPJType(pjName) {
  const name = normalizePJName(pjName);

  if (!name || name === '-') return '';

  const found = (pjs || []).find(x =>
    normalizePJName(x.name) === name
  );

  return normalizePJType(found?.type || '');
}

function renderPJDropdown(){
  const el = $('salesmanInput');
  if (!el) return;

  const mappingType = normalizePJType($('mappingPJType')?.value || 'ALL');
  const selectedCabang = String($('mappingCabang')?.value || '').trim().toUpperCase();

  let selectedType = mappingType;

  // Kalau Jenis PJ masih ALL, pakai cabang.
  // Contoh: cabang/jenis terpilih SP1 -> PJ yang muncul hanya tipe SP1.
  if (!selectedType || selectedType === 'ALL') {
    selectedType = normalizePJType(selectedCabang);
  }

  let list = pjListAll();

  if (selectedType && selectedType !== 'ALL') {
    list = list.filter(x =>
      normalizePJType(x.type) === selectedType
    );
  }

  el.innerHTML =
    `<option value="">Pilih Penanggung Jawab</option>` +
    list.map(x =>
      `<option value="${esc(x.name)}">${esc(x.name)} — ${esc(x.type)}</option>`
    ).join('');
}


  function kepalaCabangListAll() {
    return [...new Set(kepalaCabang.map(x => String(x || '').trim().toUpperCase()).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b));
  }

  function renderKepalaCabangMaster() {
    const list = kepalaCabangListAll();

    if ($('kepalaCount')) {
      $('kepalaCount').textContent = `${list.length.toLocaleString('id-ID')} Kepala Cabang`;
    }

    if ($('kepalaBody')) {
      $('kepalaBody').innerHTML = list.length ? list.map(nama => {
        const jumlahCabang = Object.values(kepalaCabangMappings || {}).filter(x => x === nama).length;

        return `<tr>
          <td><b>${esc(nama)}</b></td>
          <td>${jumlahCabang.toLocaleString('id-ID')} Cabang</td>
          <td><button type="button" class="mini-btn danger" data-delete-kepala="${esc(nama)}">Hapus</button></td>
        </tr>`;
      }).join('') : `<tr><td colspan="3" class="empty">Belum ada Kepala Cabang</td></tr>`;
    }

    const cabangs = [...new Set([
    ...data.map(x => x.cabang),
    ...imports.map(x => x.cabang),
    ...Object.keys(kepalaCabangMappings || {})
  ]
    .map(x => String(x || '').trim().toUpperCase())
    .filter(Boolean))]
    .sort((a, b) => a.localeCompare(b));

      if ($('kepalaMappingBody')) {
      $('kepalaMappingBody').innerHTML = cabangs.length ? cabangs.map(cabang => {
        const selected = kepalaCabangMappings[cabang] || '';

        return `<tr>
          <td><b>${esc(cabang)}</b></td>
          <td>
            <select class="kepala-map-select" data-map-kepala-cabang="${esc(cabang)}">
              <option value="">Belum Ada Kepala Cabang</option>
              ${list.map(nama => `<option value="${esc(nama)}" ${selected === nama ? 'selected' : ''}>${esc(nama)}</option>`).join('')}
            </select>
          </td>
        </tr>`;
      }).join('') : `<tr><td colspan="2" class="empty">Belum ada data cabang</td></tr>`;
    }

    if ($('histCabangInput')) {
      $('histCabangInput').innerHTML =
        `<option value="">Pilih Cabang</option>` +
        cabangs.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('');
    }

    if ($('histKepalaInput')) {
      $('histKepalaInput').innerHTML =
        `<option value="">Pilih Kepala Cabang</option>` +
        list.map(n => `<option value="${esc(n)}">${esc(n)}</option>`).join('');
    }

    if ($('kepalaHistoryCount')) {
      $('kepalaHistoryCount').textContent =
        `${(kepalaCabangHistory || []).length.toLocaleString('id-ID')} History`;
    }

    if ($('kepalaHistoryBody')) {
      $('kepalaHistoryBody').innerHTML =
        (kepalaCabangHistory || []).length
        ? kepalaCabangHistory.map((h, i) => `
          <tr>
            <td><b>${esc(h.cabang || '')}</b></td>
            <td>${esc(h.kepala || '')}</td>
            <td>${esc(h.dari || '')}</td>
            <td>${esc(h.sampai || 'Sekarang')}</td>
            <td>
              <button
                type="button"
                class="mini-btn danger"
                data-delete-kepala-history="${i}">
                Hapus
              </button>
            </td>
          </tr>
        `).join('')
        : `<tr><td colspan="5" class="empty">Belum ada history kepala cabang</td></tr>`;
    }
  }

  function renderPJMaster(){
  renderPJTypeDropdown();
  renderBranchPJTypes();
  renderPJDropdown();
    const body = $('pjBody');
    if (!body) return;
    const rows = pjListAll().map(pj => {
      const pjRows = data.filter(x => getPJ(x) === pj.name);
      const aging = sumByAging(pjRows);
      return {...pj, nota:pjRows.length, total:aging.total, bd:aging.bd};
    }).sort((a,b)=>b.total-a.total || a.name.localeCompare(b.name));

    body.innerHTML = rows.length ? rows.map(x => `<tr>
      <td><b>${esc(x.name)}</b></td>
      <td>${esc(x.type || 'LAINNYA')}</td>
      <td>${Number(x.nota || 0).toLocaleString('id-ID')}</td>
      <td class="num"><b>${money(x.total)}</b></td>
      <td class="num">${money(x.bd)}</td>
      <td><button type="button" class="mini-btn danger" data-delete-pj="${esc(x.name)}">Hapus</button></td>
    </tr>`).join('') : `<tr><td colspan="6" class="empty">Belum ada Penanggung Jawab. Tambahkan dulu agar mapping bebas typo.</td></tr>`;
  }
  function historyStatusText(status) {
    if (status === 'PIUTANG_BARU') return 'Piutang Baru';
    if (status === 'SUDAH_BAYAR') return 'Sudah Bayar / Hilang';
    if (status === 'NOMINAL_TURUN') return 'Nominal Turun';
    if (status === 'NOMINAL_NAIK') return 'Nominal Naik / Perlu Cek';
    return status || '-';
  }

  function formatDateTimeID(value) {
    if (!value) return '-';

    const d = new Date(value);

    if (isNaN(d.getTime())) return value;

    return d.toLocaleString('id-ID', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  function renderImportHistory() {
    if (!$('importHistoryBody')) return;

    const cabangFilter = $('historyCabangFilter')?.value || 'ALL';
    const statusFilter = $('historyStatusFilter')?.value || 'ALL';
    const search = norm($('historySearchInput')?.value || '');

    const cabangs = [
      ...new Set(
        (importHistories || [])
          .map(x => x.cabang)
          .filter(Boolean)
      )
    ].sort();

    if ($('historyCabangFilter')) {
      const old = $('historyCabangFilter').value || 'ALL';

      $('historyCabangFilter').innerHTML =
        `<option value="ALL">ALL</option>` +
        cabangs.map(x =>
          `<option value="${esc(x)}">${esc(x)}</option>`
        ).join('');

      $('historyCabangFilter').value =
        cabangs.includes(old) ? old : 'ALL';
    }

    const histories = (importHistories || []).filter(h =>
      cabangFilter === 'ALL' ||
      h.cabang === cabangFilter
    );

    let details = [];

    histories.forEach(h => {
      (h.detail || []).forEach(d => {
        details.push({
          ...d,
          tanggal: h.tanggal,
          cabang: d.cabang || h.cabang
        });
      });
    });

    details = details.filter(d => {
      if (
        statusFilter !== 'ALL' &&
        d.status !== statusFilter
      ) {
        return false;
      }

      if (search) {
        const text = norm([
          d.cabang,
          d.customer,
          d.noFaktur,
          d.keterangan,
          d.status
        ].join(' '));

        if (!text.includes(search)) {
          return false;
        }
      }

      return true;
    });

  const setText = (ids, value) => {
    ids.forEach(id => {
      if ($(id)) $(id).textContent = value;
    });
  };

  const sumHistory = field =>
    histories.reduce((s, h) => s + Number(h[field] || 0), 0);

  setText(['historyTotalImport', 'histTotalImport'], histories.length.toLocaleString('id-ID'));
  setText(['historyPiutangBaru', 'histPiutangBaru'], money(sumHistory('piutangBaruNominal')));
  setText(['historySudahBayar', 'histSudahBayar'], money(sumHistory('sudahBayarNominal')));
  setText(['historyNominalTurun', 'histNominalTurun'], money(sumHistory('nominalTurunNominal')));
  setText(['historyNominalNaik', 'histNominalNaik'], money(sumHistory('nominalNaikNominal')));
    if ($('histTotalImport')) {
      $('histTotalImport').textContent =
        histories.length.toLocaleString('id-ID');
    }

    if ($('historyListCount')) {
      $('historyListCount').textContent =
        `${histories.length.toLocaleString('id-ID')} Import`;
    }

    if ($('historyDetailCount')) {
      $('historyDetailCount').textContent =
        `${details.length.toLocaleString('id-ID')} Faktur`;
    }

    if ($('importHistoryList')) {
      $('importHistoryList').innerHTML =
        histories.length
          ? histories.map(h => `
            <div class="import-history-item">
              <div class="import-history-top">
                <div>
                  <div class="import-history-title">
                    ${esc(h.cabang || '-')}
                  </div>

                  <div class="import-history-date">
                    ${esc(formatDateTimeID(h.tanggal))}
                  </div>
                </div>
              </div>

              <div class="import-history-grid">

                <div class="import-history-box">
                  <span>Piutang Baru</span>
                  <b>${Number(h.piutangBaruCount || 0).toLocaleString('id-ID')} Faktur</b>
                  <b>${money(h.piutangBaruNominal || 0)}</b>
                </div>

                <div class="import-history-box">
                  <span>Sudah Bayar</span>
                  <b>${Number(h.sudahBayarCount || 0).toLocaleString('id-ID')} Faktur</b>
                  <b>${money(h.sudahBayarNominal || 0)}</b>
                </div>

                <div class="import-history-box">
                  <span>Nominal Turun</span>
                  <b>${Number(h.nominalTurunCount || 0).toLocaleString('id-ID')} Faktur</b>
                  <b>${money(h.nominalTurunNominal || 0)}</b>
                </div>

                <div class="import-history-box">
                  <span>Nominal Naik</span>
                  <b>${Number(h.nominalNaikCount || 0).toLocaleString('id-ID')} Faktur</b>
                  <b>${money(h.nominalNaikNominal || 0)}</b>
                </div>

              </div>
            </div>
          `).join('')
          : `<div class="empty">Belum ada riwayat import</div>`;
    }

    $('importHistoryBody').innerHTML =
      details.length
        ? details.map(d => `
          <tr>
            <td>${esc(formatDateTimeID(d.tanggal))}</td>
            <td><b>${esc(historyStatusText(d.status))}</b></td>
            <td>${esc(d.cabang || '-')}</td>
            <td>${esc(d.customer || '-')}</td>
            <td><b>${esc(d.noFaktur || '-')}</b></td>
            <td>${money(d.nominalLama || 0)}</td>
            <td>${money(d.nominalBaru || 0)}</td>
            <td><b>${money(Math.abs(Number(d.selisih || 0)))}</b></td>
            <td>${esc(d.keterangan || '-')}</td>
          </tr>
        `).join('')
        : `
          <tr>
            <td colspan="9" class="empty">
              Belum ada detail perubahan
            </td>
          </tr>
        `;
  }

function render() {
  refreshFilters();
  refreshRiskFilters();
  renderPJDropdown();
  renderImportInfo();

  const rows = filteredRows();

  renderKepalaCabangMaster();
  renderSide(rows);
  renderKpi(rows);
  renderPriority(rows);
  renderDetail(rows);
  renderCustomerList();
  renderNotaCustomer();
  renderLimit();
  renderPJMaster();

  renderRisk();
  renderImportHistory();
}

  function renderImportInfo() {
    const last = imports?.[0];

    if ($('lastImportDate')) {
      $('lastImportDate').textContent = last?.date || '-';
    }

    if ($('lastImportCabang')) {
      $('lastImportCabang').textContent =
        new Set(imports.map(x => x.cabang)).size.toLocaleString('id-ID');
    }
  }

  function showPage(page) {
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.page === page));
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));

    const target = $('page-' + page);
    if (target) target.classList.add('active');
  }

  document.querySelectorAll('.nav-btn').forEach(btn => btn.addEventListener('click', () => showPage(btn.dataset.page)));

  ['filterCabang','filterKepala','filterSalesman','filterCustomer','filterAging','filterTahun','filterDari','filterSampai'].forEach(id => $(id)?.addEventListener('change', render));
  $('applyFilterBtn')?.addEventListener('click', render);
  $('searchPriority')?.addEventListener('input', () => renderPriority(filteredRows()));
  $('searchDetail')?.addEventListener('input', () => renderDetail(filteredRows()));
  $('detailCabangSearch')?.addEventListener('input', () => renderDetail(filteredRows()));
  $('detailCustomerSearch')?.addEventListener('input', () => renderDetail(filteredRows()));
  $('mappingSearch')?.addEventListener('input', () => { selectedNotaKeys.clear(); render(); });
  ['mappingYear','mappingDari','mappingSampai'].forEach(id => $(id)?.addEventListener('change', () => { selectedNotaKeys.clear(); render(); }));
  $('resetMappingFilterBtn')?.addEventListener('click', () => {
    if ($('mappingSearch')) $('mappingSearch').value = '';
    if ($('mappingCabang')) $('mappingCabang').value = 'ALL';
    if ($('mappingYear')) $('mappingYear').value = 'ALL';
    if ($('mappingDari')) $('mappingDari').value = '';
    if ($('mappingSampai')) $('mappingSampai').value = '';

    mappingOnlyNoPj = false;

    if ($('mappingNoPjBtn')) {
      $('mappingNoPjBtn').textContent = 'Belum Ada PJ';
    }

    selectedCustomer = null;
    selectedNotaKeys.clear();

    render();
  });

  ['historyCabangFilter', 'historyStatusFilter'].forEach(id => {
    $(id)?.addEventListener('change', renderImportHistory);
  });

  $('historySearchInput')?.addEventListener('input', renderImportHistory);

  $('clearImportHistoryBtn')?.addEventListener('click', async () => {
    const ok = await requireAdmin();
    if (!ok) return;

    if (!confirm('Hapus semua riwayat import? Data piutang tidak ikut terhapus.')) return;

    importHistories = [];
    save('importHistories', importHistories);

    renderImportHistory();

    alert('Riwayat import berhasil dihapus.');
  });


  $('mappingNoPjBtn')?.addEventListener('click', () => {
    mappingOnlyNoPj = !mappingOnlyNoPj;

    $('mappingNoPjBtn').textContent =
      mappingOnlyNoPj
        ? 'Tampilkan Semua'
        : 'Belum Ada PJ';

    selectedCustomer = null;
    selectedNotaKeys.clear();

    render();
  });

  $('csvFile')?.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const text = await file.text();
    csvPreview = parseZahir(text, file.name);

    $('detectedCabang').textContent = csvPreview.cabang;
    $('detectedRows').textContent = csvPreview.rows.length;
    $('detectedTotal').textContent = money(csvPreview.rows.reduce((s,x)=>s+x.nominal,0));
  });

  $('processImportBtn')?.addEventListener('click', async () => {
    if (!csvPreview) {
      const file = $('csvFile')?.files[0];
      if (!file) return alert('Pilih CSV dulu');
      csvPreview = parseZahir(await file.text(), file.name);
    }

    if (!csvPreview.rows.length) return alert('Data faktur tidak terbaca dari CSV');

    const duplicateNota = findDuplicateNota(csvPreview.rows);

  if (duplicateNota.length) {
    alert(
      `⚠️ PERINGATAN FAKTUR DOBEL\n\n` +
      `${duplicateNota.length.toLocaleString('id-ID')} faktur terdeteksi ganda dalam cabang yang sama.\n\n` +
      `Contoh:\n` +
      duplicateNota.slice(0, 10).map(x =>
        `${x.cabang} | ${x.noFaktur} | ${x.customer} | ${money(x.nominal)}`
      ).join('\n') +
      `\n\nImport tetap dilanjutkan.\nHarap cek kemungkinan faktur dobel.`
    );
  }

    const oldCabangRows = data.filter(x => x.cabang === csvPreview.cabang);

    const oldKeys = new Set(oldCabangRows.map(x => keyNota(x)));
    const newKeys = new Set(csvPreview.rows.map(x => keyNota(x)));

    const fakturBaru = csvPreview.rows.filter(x => !oldKeys.has(keyNota(x)));
    const fakturHilang = oldCabangRows.filter(x => !newKeys.has(keyNota(x)));
    const fakturNominalBerubah = csvPreview.rows.filter(x => {
    const old = oldCabangRows.find(o => keyNota(o) === keyNota(x));
    return old && Number(old.nominal || 0) !== Number(x.nominal || 0);
  });

  const nominalNaik = fakturNominalBerubah
    .filter(x => {
      const old = oldCabangRows.find(o => keyNota(o) === keyNota(x));
      return Number(x.nominal || 0) > Number(old.nominal || 0);
    })
    .reduce((s,x) => {
      const old = oldCabangRows.find(o => keyNota(o) === keyNota(x));
      return s + (Number(x.nominal || 0) - Number(old.nominal || 0));
    }, 0);

  const nominalTurun = fakturNominalBerubah
    .filter(x => {
      const old = oldCabangRows.find(o => keyNota(o) === keyNota(x));
      return Number(x.nominal || 0) < Number(old.nominal || 0);
    })
    .reduce((s,x) => {
      const old = oldCabangRows.find(o => keyNota(o) === keyNota(x));
      return s + (Number(old.nominal || 0) - Number(x.nominal || 0));
    }, 0);
    const piutangBaru = fakturBaru.reduce((s,x) => s + Number(x.nominal || 0), 0);
    const sudahBayar = fakturHilang.reduce((s,x) => s + Number(x.nominal || 0), 0);

    const cabangImport = csvPreview.cabang;

  const nominalNaikList = fakturNominalBerubah.filter(x => {
    const old = oldCabangRows.find(o => keyNota(o) === keyNota(x));
    return old && Number(x.nominal || 0) > Number(old.nominal || 0);
  });

  const nominalTurunList = fakturNominalBerubah.filter(x => {
    const old = oldCabangRows.find(o => keyNota(o) === keyNota(x));
    return old && Number(x.nominal || 0) < Number(old.nominal || 0);
  });

  const detailHistory = [];

  fakturBaru.forEach(x => {
    detailHistory.push({
      status: 'PIUTANG_BARU',
      cabang: x.cabang || cabangImport,
      customer: x.customer || '-',
      noFaktur: x.noFaktur || '-',
      nominalLama: 0,
      nominalBaru: Number(x.nominal || 0),
      selisih: Number(x.nominal || 0),
      keterangan: 'Faktur baru muncul pada import terbaru'
    });
  });

  fakturHilang.forEach(x => {
    detailHistory.push({
      status: 'SUDAH_BAYAR',
      cabang: x.cabang || cabangImport,
      customer: x.customer || '-',
      noFaktur: x.noFaktur || '-',
      nominalLama: Number(x.nominal || 0),
      nominalBaru: 0,
      selisih: Number(x.nominal || 0),
      keterangan: 'Faktur tidak ada di import terbaru, dianggap sudah bayar / hilang'
    });
  });

  nominalTurunList.forEach(x => {
    const old = oldCabangRows.find(o => keyNota(o) === keyNota(x));
    if (!old) return;

    const lama = Number(old.nominal || 0);
    const baru = Number(x.nominal || 0);

    detailHistory.push({
      status: 'NOMINAL_TURUN',
      cabang: x.cabang || cabangImport,
      customer: x.customer || '-',
      noFaktur: x.noFaktur || '-',
      nominalLama: lama,
      nominalBaru: baru,
      selisih: lama - baru,
      keterangan: 'Nominal turun, kemungkinan bayar sebagian / koreksi'
    });
  });

  nominalNaikList.forEach(x => {
    const old = oldCabangRows.find(o => keyNota(o) === keyNota(x));
    if (!old) return;

    const lama = Number(old.nominal || 0);
    const baru = Number(x.nominal || 0);

    detailHistory.push({
      status: 'NOMINAL_NAIK',
      cabang: x.cabang || cabangImport,
      customer: x.customer || '-',
      noFaktur: x.noFaktur || '-',
      nominalLama: lama,
      nominalBaru: baru,
      selisih: baru - lama,
      keterangan: 'Nominal naik, perlu verifikasi ke Zahir / data cabang'
    });
  });

  const mappedImportRows = csvPreview.rows.map(applyNotaMapping);

  data = data
    .filter(x => x.cabang !== csvPreview.cabang)
    .concat(mappedImportRows);

  imports = [{
    cabang: csvPreview.cabang,
    count: csvPreview.rows.length,
    date: new Date().toLocaleString('id-ID')
  }, ...imports.filter(x => x.cabang !== csvPreview.cabang)];

  importHistories.unshift({
    id: Date.now(),
    tanggal: new Date().toISOString(),
    cabang: cabangImport,

    piutangBaruCount: fakturBaru.length,
    piutangBaruNominal: piutangBaru,

    sudahBayarCount: fakturHilang.length,
    sudahBayarNominal: sudahBayar,

    nominalTurunCount: nominalTurunList.length,
    nominalTurunNominal: nominalTurun,

    nominalNaikCount: nominalNaikList.length,
    nominalNaikNominal: nominalNaik,

    detail: detailHistory
  });

  importHistories = importHistories.slice(0, 100);

  save('piutangData', data);
  save('imports', imports);
  save('importHistories', importHistories);

  csvPreview = null;

  alert(
    `IMPORT ${cabangImport}\n\n` +

    `🟢 PIUTANG BARU\n` +
    `${fakturBaru.length.toLocaleString('id-ID')} Faktur\n` +
    `${money(piutangBaru)}\n\n` +

    `🔴 SUDAH BAYAR / HILANG\n` +
    `${fakturHilang.length.toLocaleString('id-ID')} Faktur\n` +
    `${money(sudahBayar)}\n\n` +

    `🟡 NOMINAL TURUN / BAYAR SEBAGIAN\n` +
    `${money(nominalTurun)}\n\n` +

    `🟠 NOMINAL NAIK / PERLU CEK\n` +
    `${money(nominalNaik)}`
  );
    showPage('dashboard');
    render();
  });
  document.addEventListener('click', async (e) => {
    const btn = e.target.closest('#resetDataBtn');
    if (!btn) return;

    console.log('Tombol Reset Data diklik');

    if (!(await requireAdmin())) return;

    if (!confirm('HAPUS SEMUA DATA? Piutang, import, limit, PJ, mapping nota, kepala cabang, history, rule limit, dan model cabang akan kosong semua.')) return;

    try {
      console.log('Mulai reset cloud...');
      await cloudClearPiutangCabang();
      await cloudSave('imports', []);
      await cloudSave('importHistories', []);
      await cloudSave('limits', {});
      await cloudSave('pjs', []);
      await cloudSave('pjTypes', []);
      await cloudSave('notaMappings', {});
      await cloudSave('kepalaCabang', []);
      await cloudSave('kepalaCabangMappings', {});
      await cloudSave('kepalaCabangHistory', []);
      await cloudSave('limitRules', {});
      await cloudSave('branchModels', {});

      console.log('Reset cloud selesai');
    } catch (err) {
      console.error('ERROR RESET CLOUD:', err);
      alert('Reset cloud gagal: ' + err.message);
      return;
    }

    data = [];
    imports = [];
    limits = {};
    pjs = [];
    pjTypes = [];
    notaMappings = {};
    kepalaCabang = [];
    kepalaCabangMappings = {};
    kepalaCabangHistory = [];
    limitRules = {};
    branchModels = {};

    selectedCustomer = null;
    selectedLimitCustomer = null;
    csvPreview = null;
    if (selectedNotaKeys) selectedNotaKeys.clear();

    save('piutangData', data);
    save('imports', imports);
    save('limits', limits);
    save('pjs', pjs);
    save('pjTypes', pjTypes);
    save('notaMappings', notaMappings);
    save('kepalaCabang', kepalaCabang);
    save('kepalaCabangMappings', kepalaCabangMappings);
    save('kepalaCabangHistory', kepalaCabangHistory);
    save('limitRules', limitRules);
    save('branchModels', branchModels);

    render();

    alert('Semua data berhasil direset total.');
  });
  document.addEventListener('click', (e) => {
    const mapItem = e.target.closest('[data-map-customer]');

    if (mapItem) {
      e.preventDefault();
      const cust = mapItem.getAttribute('data-map-customer') || '';
  const cab = mapItem.getAttribute('data-map-cabang') || '';
  selectedCustomer = cust + '||' + cab;
      selectedNotaKeys.clear();

      // Jangan render ulang daftar dulu sebelum detail muncul. Ini mencegah klik tabel customer gagal terbaca.
      document.querySelectorAll('[data-map-customer]').forEach(el => el.classList.remove('active'));
      mapItem.classList.add('active');

      renderNotaCustomer();
renderPJDropdown();
return;
    }

    const viewItem = e.target.closest('[data-view-customer]');

  if (viewItem) {
    openCustomerInvoiceModal(
      viewItem.dataset.viewCustomer,
      viewItem.dataset.viewCabang || ''
    );
    return;
  }

    if (e.target.closest('[data-close-invoice]')) {
      closeCustomerInvoiceModal();
      return;
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeCustomerInvoiceModal();
  });

  document.addEventListener('change', (e) => {
    if (e.target.classList.contains('notaCheck')) {
      if (e.target.checked) selectedNotaKeys.add(e.target.value);
      else selectedNotaKeys.delete(e.target.value);
    }
  });

  $('checkAllNota')?.addEventListener('change', (e) => {
    document.querySelectorAll('.notaCheck').forEach(cb => {
      cb.checked = e.target.checked;
      if (cb.checked) selectedNotaKeys.add(cb.value);
      else selectedNotaKeys.delete(cb.value);
    });
  });

  $('assignBtn')?.addEventListener('click', () => {
    const pj = ($('salesmanInput')?.value || '').trim().toUpperCase();

    if (!pj) return alert('Pilih Penanggung Jawab dulu. Kalau belum ada, tambahkan di Master PJ.');
    if (!selectedNotaKeys.size) return alert('Ceklis nota dulu');

    data = data.map(x => {
      if (selectedNotaKeys.has(keyNota(x))) {
        const fullKey = notaMappingKey(x);
        const simpleKey = keyNota(x);

        notaMappings[fullKey] = {
          ...(notaMappings[fullKey] || {}),
          pj
        };

        notaMappings[simpleKey] = {
          ...(notaMappings[simpleKey] || {}),
          pj
        };

        return { ...x, pj };
      }

      return x;
    });

    selectedNotaKeys.clear();

    save('notaMappings', notaMappings);
    save('piutangData', data);

    render();
  });
  document.addEventListener('change', (e) => {
    if (!e.target.classList.contains('kepala-map-select')) return;

    const cabang = String(e.target.dataset.mapKepalaCabang || '')
      .trim()
      .toUpperCase();

    const kepala = String(e.target.value || '')
      .trim()
      .toUpperCase();

    if (!cabang) return;

    if (kepala) {
      kepalaCabangMappings[cabang] = kepala;
    } else {
      delete kepalaCabangMappings[cabang];
    }

    save('kepalaCabangMappings', kepalaCabangMappings);

    render();
  });

  $('limitSearch')?.addEventListener('input', renderLimit);
  $('limitStatusFilter')?.addEventListener('change', renderLimit);
  ['riskCabang','riskSalesman','riskCustomer','riskAging','riskTahun','riskDari','riskSampai'].forEach(id => $(id)?.addEventListener('change', () => {
    renderRisk();
  }));

  $('riskKepala')?.addEventListener('change', () => {
    refreshRiskFilters();
    renderRisk();
  });
  $('riskSearch')?.addEventListener('input', renderRisk);
  $('resetRiskFilterBtn')?.addEventListener('click', () => {
    ['riskKepala','riskCabang','riskSalesman','riskCustomer','riskTahun'].forEach(id => {
      if ($(id)) $(id).value = 'ALL';
    });

    if ($('riskAging')) $('riskAging').value = 'SEMUA';
    if ($('riskDari')) $('riskDari').value = '';
    if ($('riskSampai')) $('riskSampai').value = '';
    if ($('riskSearch')) $('riskSearch').value = '';

    refreshRiskFilters();
    renderRisk();
  });

  document.querySelectorAll('[data-limit-filter]').forEach(btn => {
    btn.addEventListener('click', () => setLimitFilter(btn.dataset.limitFilter || 'ALL'));
  });

  $('limitCustomer')?.addEventListener('input', () => {
    selectedLimitCustomer = ($('limitCustomer')?.value || '').trim().toUpperCase();
  });

  $('limitCustomer')?.addEventListener('change', () => {
    const customer = ($('limitCustomer')?.value || '').trim().toUpperCase();
    if (!customer) return;

    selectedLimitCustomer = customer;

    // Saat pilih dari list pencarian, langsung arahkan ke baris tabelnya.
    if ($('limitSearch')) $('limitSearch').value = '';
    scrollToCustomerRow(customer);

    // Kalau customer sudah punya limit, isi otomatis nominalnya untuk edit/update.
    if ($('limitValue')) $('limitValue').value = limits[customer] || '';
  });

  $('saveLimitBtn')?.addEventListener('click', () => {
    const c = ($('limitCustomer')?.value || '').trim().toUpperCase();
    const v = onlyNumber($('limitValue')?.value || '0');

    if (!c) return alert('Isi atau pilih nama customer dulu');
    if (!v || v < 0) return alert('Isi nominal limit dengan benar');

    limits[c] = v;
    save('limits', limits);

    $('limitCustomer').value = '';
    $('limitValue').value = '';
    selectedLimitCustomer = null;

    render();
    alert('Limit berhasil disimpan');
  });

  document.addEventListener('click', (e) => {
    const editBtn = e.target.closest('[data-edit-limit]');
    if (editBtn) {
      const c = editBtn.dataset.editLimit;
      $('limitCustomer').value = c;
      $('limitValue').value = limits[c] || '';
      $('limitCustomer').focus();
      return;
    }

    const delBtn = e.target.closest('[data-delete-limit]');
    if (delBtn) {
      const c = delBtn.dataset.deleteLimit;
      if (!confirm('Hapus limit customer ini?')) return;
      delete limits[c];
      save('limits', limits);
      render();
      return;
    }
  });

  $('saveKepalaBtn')?.addEventListener('click', () => {
    const nama = String($('kepalaNameInput')?.value || '')
      .trim()
      .toUpperCase()
      .replace(/\s+/g, ' ');

    if (!nama) return alert('Isi nama Kepala Cabang dulu');
    if (kepalaCabangListAll().includes(nama)) return alert('Kepala Cabang sudah ada');

    kepalaCabang.push(nama);
    save('kepalaCabang', kepalaCabang);

    if ($('kepalaNameInput')) $('kepalaNameInput').value = '';

    renderKepalaCabangMaster();
    alert('Kepala Cabang berhasil disimpan');
  });

  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-delete-kepala]');
    if (!btn) return;

    const nama = btn.dataset.deleteKepala;

    if (Object.values(kepalaCabangMappings || {}).includes(nama)) {
      return alert('Kepala Cabang ini masih dipakai di mapping cabang. Kosongkan mapping dulu.');
    }

    if (!confirm('Hapus Kepala Cabang ini?')) return;

    kepalaCabang = kepalaCabang.filter(x => String(x).trim().toUpperCase() !== nama);
    save('kepalaCabang', kepalaCabang);

    renderKepalaCabangMaster();
  });

  document.addEventListener('change', (e) => {
    if (!e.target.classList.contains('kepala-map-select')) return;

    const cabang = String(e.target.dataset.mapKepalaCabang || '')
      .trim()
      .toUpperCase();

    const kepala = String(e.target.value || '')
      .trim()
      .toUpperCase();

    if (!cabang) return;

    if (kepala) {
      kepalaCabangMappings[cabang] = kepala;
    } else {
      delete kepalaCabangMappings[cabang];
    }

    save('kepalaCabangMappings', kepalaCabangMappings);

    refreshFilters();
    refreshRiskFilters();
    render();
  });
  $('saveKepalaHistoryBtn')?.addEventListener('click', () => {
    const cabang = String($('histCabangInput')?.value || '').trim().toUpperCase();
    const kepala = String($('histKepalaInput')?.value || '').trim().toUpperCase();
    const dari = String($('histDariInput')?.value || '').trim();
    const sampai = String($('histSampaiInput')?.value || '').trim();

    if (!cabang) return alert('Pilih cabang dulu');
    if (!kepala) return alert('Pilih kepala cabang dulu');
    if (!dari) return alert('Isi tanggal mulai dulu');

    kepalaCabangHistory.push({ cabang, kepala, dari, sampai });
    save('kepalaCabangHistory', kepalaCabangHistory);

    $('histCabangInput').value = '';
    $('histKepalaInput').value = '';
    $('histDariInput').value = '';
    $('histSampaiInput').value = '';

    renderKepalaCabangMaster();
    render();

    alert('History kepala cabang berhasil disimpan');
  });

  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-delete-kepala-history]');
    if (!btn) return;

    const index = Number(btn.dataset.deleteKepalaHistory);
    if (!confirm('Hapus history kepala cabang ini?')) return;

    kepalaCabangHistory.splice(index, 1);
    save('kepalaCabangHistory', kepalaCabangHistory);

    renderKepalaCabangMaster();
    render();
  });

  $('savePjTypeBtn')?.addEventListener('click', () => {
    const type = normalizePJType($('pjTypeNameInput')?.value || '');
    if (!type) return alert('Isi nama Jenis PJ dulu. Contoh: SALES, MANDOR, ADMIN TAGIH.');
    if (pjTypeListAll().includes(type)) return alert('Jenis PJ sudah ada.');
    pjTypes.push(type);
    save('pjTypes', pjTypes);
    if ($('pjTypeNameInput')) $('pjTypeNameInput').value = '';
    renderPJMaster();
  });

  $('pjTypeBody')?.addEventListener('click', e => {
    const btn = e.target.closest('[data-delete-pj-type]');
    if (!btn) return;
    const type = btn.dataset.deletePjType;
    const used = pjs.some(p => normalizePJType(p.type) === type);
    if (used) return alert('Jenis PJ ini masih dipakai di Master PJ. Ganti/hapus PJ-nya dulu.');
    pjTypes = pjTypes.filter(x => normalizePJType(x) !== type);
    save('pjTypes', pjTypes);
    renderPJMaster();
  });

  $('savePjBtn')?.addEventListener('click', () => {
    const name = normalizePJName($('pjNameInput')?.value || '');
    const type = normalizePJType($('pjTypeInput')?.value || '');
    if (!name) return alert('Isi nama Penanggung Jawab dulu');
    if (!type) return alert('Buat/Pilih Jenis PJ dulu.');
    if (pjs.some(x => x.name === name)) return alert('Nama PJ sudah ada');
    pjs.push({name, type});
    save('pjs', pjs);
    if ($('pjNameInput')) $('pjNameInput').value = '';
    render();
  });

  $('saveBranchPJTypeBtn')?.addEventListener('click', () => {
  const cabang = String(
    $('branchPJCabangInput')?.value || ''
  ).trim().toUpperCase();

  const type = String(
    $('branchPJTypeInput')?.value || ''
  ).trim().toUpperCase();

  if (!cabang) return alert('Pilih cabang dulu.');
  if (!type) return alert('Pilih jenis PJ dulu.');

  branchPJTypes[cabang] = type;

  save('branchPJTypes', branchPJTypes);

  renderPJMaster();
  renderPJDropdown();

  alert('Mapping cabang berhasil disimpan.');
});

document.addEventListener('click', e => {
  const btn = e.target.closest('[data-delete-branch-pj-type]');
  if (!btn) return;

  const cabang = btn.getAttribute(
    'data-delete-branch-pj-type'
  );

  if (!confirm(`Hapus mapping ${cabang}?`)) return;

  delete branchPJTypes[cabang];

  save('branchPJTypes', branchPJTypes);

  renderPJMaster();
  renderPJDropdown();
});

  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-delete-pj]');
    if (!btn) return;
    const name = btn.dataset.deletePj;
    const used = data.some(x => getPJ(x) === name);
    if (used && !confirm('PJ ini sudah dipakai di nota. Hapus dari Master PJ saja? Mapping nota tetap tersimpan.')) return;
    pjs = pjs.filter(x => x.name !== name);
    save('pjs', pjs);
    render();
  });


  /* =========================================================
    FINAL OVERRIDE: MASTER PJ & LIMIT TERPADU
    - Cabang bisa disetel model limitnya: CUSTOMER atau PJ
    - SPM cocok pakai CUSTOMER
    - SP II - VIII cocok pakai PJ gabungan
    - Pencarian PJ pakai input + datalist, bukan dropdown panjang
    ========================================================= */
  let limitRules = load('limitRules', {});
  let branchModels = load('branchModels', {});
  let currentLimitFilter = 'ALL';

  function limitKey(type, name){
    return `${String(type || '').toUpperCase()}||${String(name || '').trim().toUpperCase()}`;
  }

  function getBranchModel(cabang){
    const c = String(cabang || '').trim().toUpperCase();
    if (branchModels[c]) return branchModels[c];
    if (/MANDIRI/.test(c)) return 'CUSTOMER';
    if (/SEDERHANA|PUTRA|SP\s*II|SP\s*III|SP\s*IV|SP\s*V|SP\s*VI|SP\s*VII|SP\s*VIII/i.test(c)) return 'PJ';
    return 'CUSTOMER';
  }

  function getUnifiedLimit(type, name){
    const t = String(type || '').toUpperCase();
    const n = String(name || '').trim().toUpperCase();
    if (!n) return 0;
    if (t === 'CUSTOMER') return Number(limitRules[limitKey('CUSTOMER', n)] || limits[n] || 0);
    if (t === 'PJ') return Number(limitRules[limitKey('PJ', n)] || 0);
    return 0;
  }

  // Kompatibilitas fungsi lama.
  getLimit = function(customer){
    const c = String(customer || '').trim().toUpperCase();
    return getUnifiedLimit('CUSTOMER', c);
  };

  function getPJAggregateMap(rows = data){
    const map = {};
    rows.forEach(x => {
      const cabang = String(x.cabang || '').trim().toUpperCase();
      const pj = getPJ(x);
      if (!pj || pj === '-') return;
      const k = cabang + '||' + pj;
      if (!map[k]) map[k] = { cabang, pj, total:0, faktur:0, bjt:0, tw:0, r1:0, bd:0, customers:new Set() };
      map[k].total += Number(x.nominal || 0);
      map[k].faktur++;
      map[k].customers.add(x.customer);
      map[k][String(x.aging || '').toLowerCase()] += Number(x.nominal || 0);
    });
    Object.values(map).forEach(x => {
      x.limit = getUnifiedLimit('PJ', x.pj);
      x.sisa = x.limit ? x.limit - x.total : 0;
      x.status = !x.limit ? 'NON LIMIT' : x.total > x.limit ? 'OVER LIMIT' : 'AMAN';
    });
    return map;
  }

  groupCustomerCabang = function(rows){
    const pjAgg = getPJAggregateMap(rows);
    const map = {};
    rows.forEach(x => {
      const k = x.customer + '||' + x.cabang;
      if (!map[k]) {
        map[k] = {
          customer:x.customer,
          cabang:x.cabang,
          bjt:0, tw:0, r1:0, bd:0, total:0, faktur:0,
          pjs:new Set(), pjText:'-', pjKey:'-', model:getBranchModel(x.cabang),
          limit:0, pjTotal:0, pjLimit:0, pjStatus:'-'
        };
      }
      map[k][x.aging.toLowerCase()] += Number(x.nominal || 0);
      map[k].total += Number(x.nominal || 0);
      map[k].faktur++;
      const pj = getPJ(x);
      if (pj && pj !== '-') map[k].pjs.add(pj);
    });

    Object.values(map).forEach(g => {
      g.pjText = g.pjs.size ? [...g.pjs].join(', ') : '-';
      g.pjKey = g.pjs.size ? [...g.pjs][0] : '-';
      g.model = getBranchModel(g.cabang);
      if (g.model === 'CUSTOMER') {
        g.limit = getUnifiedLimit('CUSTOMER', g.customer);
        g.limitOwner = g.customer;
        g.sisa = g.limit ? g.limit - g.total : 0;
        g.status = !g.limit ? 'NON LIMIT' : g.total > g.limit ? 'OVER LIMIT' : 'AMAN';
      } else {
        const agg = pjAgg[String(g.cabang || '').trim().toUpperCase() + '||' + g.pjKey];
        g.pjTotal = agg ? agg.total : g.total;
        g.limit = g.pjKey !== '-' ? getUnifiedLimit('PJ', g.pjKey) : 0;
        g.limitOwner = g.pjKey;
        g.sisa = g.limit ? g.limit - g.pjTotal : 0;
        g.status = g.pjKey === '-' ? 'BELUM ADA PJ' : !g.limit ? 'NON LIMIT' : g.pjTotal > g.limit ? 'OVER LIMIT' : 'AMAN';
        g.pjStatus = g.status;
      }
    });
    return map;
  };

  customerSummaryAll = function(){
    const rows = Object.values(groupCustomerCabang(data));
    Object.keys(limits || {}).forEach(customer => {
      const exists = rows.some(x => x.customer === customer);
      if (!exists) rows.push({ customer, cabang:'-', faktur:0, bjt:0, tw:0, r1:0, bd:0, total:0, pjs:new Set(), pjText:'-', pjKey:'-', model:'CUSTOMER', limit:getUnifiedLimit('CUSTOMER', customer), sisa:getUnifiedLimit('CUSTOMER', customer), status:getUnifiedLimit('CUSTOMER', customer) ? 'AMAN' : 'NON LIMIT' });
    });
    Object.keys(limitRules || {}).forEach(k => {
      const [type, name] = k.split('||');
      if (type === 'CUSTOMER' && !rows.some(x => x.customer === name)) {
        rows.push({ customer:name, cabang:'-', faktur:0, bjt:0, tw:0, r1:0, bd:0, total:0, pjs:new Set(), pjText:'-', pjKey:'-', model:'CUSTOMER', limit:getUnifiedLimit('CUSTOMER', name), sisa:getUnifiedLimit('CUSTOMER', name), status:'AMAN' });
      }
    });
    return rows;
  };

  limitStatus = function(x){ return x.status || 'NON LIMIT'; };

  matchLimitFilter = function(x, filter){
    const f = filter || currentLimitFilter || 'ALL';
    if (f === 'ALL') return true;
    if (f === 'LIMIT_TERISI') return Number(x.limit || 0) > 0;
    if (f === 'NON_LIMIT') return !Number(x.limit || 0);
    if (f === 'OVER_LIMIT') return x.status === 'OVER LIMIT';
    if (f === 'MISSING_PJ') return x.status === 'BELUM ADA PJ' || !x.pjText || x.pjText === '-';
    return limitStatusKey(limitStatus(x)) === f;
  };

  setLimitFilter = function(value){
    currentLimitFilter = value || 'ALL';
    if ($('limitStatusFilter')) $('limitStatusFilter').value = ['ALL','LIMIT_TERISI','NON_LIMIT','OVER_LIMIT','AMAN'].includes(currentLimitFilter) ? currentLimitFilter : 'ALL';
    if ($('limitSearch')) $('limitSearch').value = '';
    renderLimit();
    renderRisk();
  };

  function renderBranchModelOptions(){
    const branches = [...new Set(data.map(x => x.cabang).filter(Boolean))].sort();
    if ($('branchOptions')) $('branchOptions').innerHTML = branches.map(x => `<option value="${esc(x)}"></option>`).join('');
    const body = $('branchModelBody');
    if (!body) return;
    body.innerHTML = branches.length ? branches.map(c => {
      const model = getBranchModel(c);
      const note = model === 'CUSTOMER'
        ? 'Limit dibaca per nama customer/toko. Cocok untuk Sederhana Putra Mandiri.'
        : 'Limit dibaca gabungan per Penanggung Jawab/Mandor. Cocok untuk Cabang.';
      return `<tr>
        <td><b>${esc(c)}</b></td>
        <td><span class="model-tag ${model === 'PJ' ? 'pj' : ''}">${model === 'CUSTOMER' ? 'PER CUSTOMER / TOKO' : 'GABUNGAN PJ / MANDOR'}</span></td>
        <td>${esc(note)}</td>
      </tr>`;
    }).join('') : `<tr><td colspan="3" class="empty">Import CSV dulu. Setelah cabang muncul, set model limitnya di sini.</td></tr>`;
  }

  refreshLimitCustomerOptions = function(){
    const dl = $('customerOptions');
    if (!dl) return;
    const customers = [...new Set(data.map(x => x.customer).concat(Object.keys(limits || {})).concat(Object.keys(limitRules || {}).map(k => k.split('||')[1] || '')))].filter(Boolean).sort();
    dl.innerHTML = customers.map(c => `<option value="${esc(c)}"></option>`).join('');
  };


  function renderPJOverLimitTable(){
    const q = norm($('limitSearch')?.value || '');
    const rows = Object.values(getPJAggregateMap(data))
      .filter(x => getBranchModel(x.cabang) === 'PJ')
      .filter(x => x.limit > 0 && x.total > x.limit)
      .filter(x => !q || [x.pj, x.cabang, money(x.total), money(x.limit), money(x.total - x.limit)].map(norm).join(' | ').includes(q))
      .sort((a,b)=> (b.total-b.limit) - (a.total-a.limit));

    const table = $('limitBody')?.closest('table');
    const theadRow = table?.querySelector('thead tr');
    if (theadRow) theadRow.innerHTML = `<th>PJ / Mandor</th><th>Cabang</th><th>Customer/Proyek</th><th>Faktur</th><th>Total Piutang PJ</th><th>Limit PJ</th><th>Over</th><th>Status</th><th>Aksi</th>`;
    $('limitBody').innerHTML = rows.length ? rows.map(x => `<tr class="over-row">
      <td><b>${esc(x.pj)}</b><span class="status-note">Limit gabungan PJ</span></td>
      <td>${esc(x.cabang)}</td>
      <td>${x.customers.size.toLocaleString('id-ID')} customer/proyek</td>
      <td>${x.faktur.toLocaleString('id-ID')}</td>
      <td class="num"><b>${money(x.total)}</b></td>
      <td class="num">${money(x.limit)}</td>
      <td class="num neg"><b>${money(x.total - x.limit)}</b></td>
      <td><span class="pill bad">OVER LIMIT</span></td>
      <td><button class="mini-btn" data-edit-limit-pj="${esc(x.pj)}">Edit</button></td>
    </tr>`).join('') : `<tr><td colspan="9" class="empty">Tidak ada PJ yang over limit.</td></tr>`;
  }

  renderLimit = function(){
    renderMasterSummary();
    refreshLimitCustomerOptions();
    renderBranchModelOptions();

    if (currentLimitFilter === 'PJ_OVER_LIMIT') return renderPJOverLimitTable();

    const table = $('limitBody')?.closest('table');
    const theadRow = table?.querySelector('thead tr');
    if (theadRow) theadRow.innerHTML = `<th>Customer/Proyek</th><th>Cabang</th><th>PJ</th><th>Faktur</th><th>Total Piutang</th><th>Limit</th><th>Sisa / Over</th><th>Status</th><th>Aksi</th>`;

    const q = norm($('limitSearch')?.value || '');
    const selectFilter = $('limitStatusFilter')?.value || 'ALL';
    const activeFilter = currentLimitFilter && currentLimitFilter !== 'ALL' ? currentLimitFilter : selectFilter;
    const rows = customerSummaryAll()
      .filter(x => matchLimitFilter(x, activeFilter))
      .filter(x => {
        if (!q) return true;
        return [x.customer, x.cabang, x.pjText, x.model, money(x.total), money(x.limit), limitStatus(x)].map(norm).join(' | ').includes(q);
      })
      .sort((a,b) => {
        const score = x => x.status === 'OVER LIMIT' ? 5 : x.status === 'BELUM ADA PJ' ? 4 : x.limit > 0 ? 2 : 1;
        return score(b) - score(a) || b.total - a.total;
      });

    if ($('limitBody')) {
      $('limitBody').innerHTML = rows.length ? rows.map(x => {
        const status = limitStatus(x);
        const cls = status === 'OVER LIMIT' || status === 'BELUM ADA PJ' ? 'bad' : 'ok';
        const modelLabel = x.model === 'PJ' ? 'GABUNGAN PJ' : 'PER CUSTOMER';
        const ownerNote = x.model === 'PJ'
    ? `Limit PJ: ${money(x.limit || 0)}. Sisa PJ: ${money(x.sisa || 0)}`
    : `Limit milik customer/toko ini`;

  const totalText = x.model === 'PJ'
    ? `${money(x.total)}<br><small>Total PJ: ${money(x.pjTotal || x.total)}</small>`
    : money(x.total);

  const limitText = x.model === 'PJ'
    ? `Limit PJ: ${money(x.limit || 0)}`
    : (x.limit ? money(x.limit) : 'NON LIMIT');

  const sisaText = x.model === 'PJ'
    ? `Sisa PJ: ${money(x.sisa || 0)}`
    : (x.limit ? money(x.sisa) : '-');
        return `<tr data-customer="${esc(x.customer)}" class="${status === 'OVER LIMIT' ? 'over-row' : ''}">
          <td><b>${esc(shortCustomerName(x.customer))}</b><br><small title="${esc(x.customer)}">${esc(x.customer)}</small><span class="status-note">${esc(ownerNote)}</span></td>
          <td>${esc(x.cabang)}</td>
          <td>${esc(x.pjText || '-')}</td>
          <td>${Number(x.faktur || 0).toLocaleString('id-ID')}</td>
          <td class="num">${totalText}</td>
  <td class="num">${limitText}<span class="status-note"><span class="model-tag ${x.model === 'PJ' ? 'pj' : ''}">${modelLabel}</span></span></td>
  <td class="num ${x.sisa < 0 ? 'neg' : ''}">${sisaText}</td>
          <td><span class="pill ${cls}">${status}</span></td>
          <td class="action-cell">
            <button class="mini-btn" data-edit-limit="${esc(x.customer)}" data-edit-model="${esc(x.model)}" data-edit-pj="${esc(x.pjKey || '')}">Edit</button>
            ${x.limit ? `<button class="mini-btn danger" data-delete-limit-rule="${esc(limitKey(x.model === 'PJ' ? 'PJ' : 'CUSTOMER', x.model === 'PJ' ? x.pjKey : x.customer))}">Hapus</button>` : ''}
          </td>
        </tr>`;
      }).join('') : '<tr><td colspan="9" class="empty">Belum ada data sesuai filter.</td></tr>';
    }
  };

  renderMasterSummary = function(){
    const rows = customerSummaryAll();
    const overRows = rows.filter(x => x.status === 'OVER LIMIT');
    const overNominal = overRows.reduce((s,x)=>s + Math.abs(Number(x.sisa || 0)),0);
    const limitCount = rows.filter(x => Number(x.limit || 0) > 0).length;
    const missingPJ = rows.filter(x => x.status === 'BELUM ADA PJ').length;
    const cabangMap = {};
    data.forEach(x => {
      if (!cabangMap[x.cabang]) cabangMap[x.cabang] = { cabang:x.cabang, customer:new Set(), faktur:0, total:0 };
      cabangMap[x.cabang].customer.add(x.customer);
      cabangMap[x.cabang].faktur++;
      cabangMap[x.cabang].total += Number(x.nominal || 0);
    });
    const cabangArr = Object.values(cabangMap).sort((a,b)=>b.total-a.total);
    if ($('masterCabangCards')) {
      $('masterCabangCards').innerHTML = cabangArr.length ? cabangArr.map(x => `<article class="master-stat">
        <span>${esc(x.cabang)}</span><b>${money(x.total)}</b><small>${x.customer.size} customer • ${x.faktur} faktur • Model: ${getBranchModel(x.cabang) === 'PJ' ? 'Gabungan PJ' : 'Per Customer'}</small>
      </article>`).join('') : `<article class="master-stat empty-stat"><span>Belum ada cabang</span><b>Import CSV dulu</b><small>Setelah import, cabang akan muncul otomatis.</small></article>`;
    }
    if ($('masterLimitInfo')) {
      $('masterLimitInfo').innerHTML = `
        <article class="master-stat"><span>Total Customer/Proyek</span><b>${rows.length.toLocaleString('id-ID')}</b><small>Dari data import + master limit</small></article>
        <article class="master-stat"><span>Sudah Ada Limit</span><b>${limitCount.toLocaleString('id-ID')}</b><small>Limit customer dan limit PJ digabung di sini</small></article>
        <article class="master-stat danger"><span>Over Limit</span><b>${overRows.length.toLocaleString('id-ID')}</b><small>Nominal lewat limit: ${money(overNominal)}</small></article>
        <article class="master-stat danger"><span>Belum Ada PJ</span><b>${missingPJ.toLocaleString('id-ID')}</b><small>Khusus cabang dengan model gabungan PJ</small></article>`;
    }
  };

  renderKpi = function(rows){
    const s = sumByAging(rows);
    const customerCount = new Set(rows.map(x => x.customer)).size;
    const totalFaktur = rows.length;
    const overRows = Object.values(groupCustomerCabang(rows)).filter(x => x.status === 'OVER LIMIT');
    const over = overRows.reduce((sum,x)=>sum + Math.abs(Number(x.sisa || 0)),0);
    const overFaktur = overRows.reduce((sum,x)=>sum + Number(x.faktur || 0),0);
    $('kpiTotal').innerHTML = `<span class="kpi-money">${money(s.total)}</span><span class="kpi-sub">Total Faktur: ${totalFaktur.toLocaleString('id-ID')}</span>`;
    $('kpiBd').innerHTML = `<span class="kpi-money">${money(s.bd)}</span><span class="kpi-sub">Total Faktur: ${rows.filter(x => x.aging === 'BD').length.toLocaleString('id-ID')}</span>`;
    $('kpiOver').innerHTML = `<span class="kpi-money">${money(over)}</span><span class="kpi-sub">Total Faktur: ${overFaktur.toLocaleString('id-ID')}</span>`;
    $('kpiCustomer').innerHTML = `<span class="kpi-money">${customerCount.toLocaleString('id-ID')}</span>`;
    $('importStatus').textContent = imports.length ? `${new Set(data.map(x => x.cabang)).size} Cabang Terimport` : 'Belum Ada Import';
  };

  render = function(){
    refreshFilters();
    const rows = filteredRows();
    renderSide(rows);
    renderKpi(rows);
    renderPriority(rows);
    renderDetail(rows);
    renderCustomerList();
    renderNotaCustomer();
    renderPJMaster();
    renderLimit();
  };

  // Save model cabang.
  $('saveBranchModelBtn')?.addEventListener('click', () => {
    const cab = String($('branchModelCabang')?.value || '').trim().toUpperCase();
    const model = $('branchModelType')?.value || 'CUSTOMER';
    if (!cab) return alert('Pilih / ketik cabang dulu.');
    branchModels[cab] = model;
    save('branchModels', branchModels);
    render();
    alert('Model limit cabang berhasil disimpan');
  });

  // Cegah listener lama menyimpan format limit lama. Kita pakai format limitRules.
  $('saveLimitBtn')?.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopImmediatePropagation();

    const scope = $('limitScope')?.value || 'AUTO';
    const entity = normalizePJName($('limitCustomer')?.value || '');
    const pjInput = normalizePJName($('limitPj')?.value || '');
    const v = onlyNumber($('limitValue')?.value || '0');
    if (!entity && !pjInput) return alert('Isi customer / proyek / nama PJ dulu.');
    if (!v || v < 0) return alert('Isi nominal limit dengan benar.');

    let finalType = scope;
    let finalName = entity;

    if (scope === 'AUTO') {
      const relatedRows = data.filter(x => normalizePJName(x.customer) === entity);
      const branch = relatedRows[0]?.cabang || '';
      finalType = getBranchModel(branch);
      if (finalType === 'PJ') finalName = pjInput || entity;
    }
    if (scope === 'PJ') finalName = pjInput || entity;
    if (scope === 'CUSTOMER') finalName = entity;

    if (!finalName) return alert('Nama yang akan diberi limit belum jelas.');
    limitRules[limitKey(finalType, finalName)] = v;
    if (finalType === 'CUSTOMER') limits[finalName] = v;
    save('limitRules', limitRules);
    save('limits', limits);

    $('limitCustomer').value = '';
    if ($('limitPj')) $('limitPj').value = '';
    $('limitValue').value = '';
    render();
    alert(`Limit ${finalType === 'PJ' ? 'gabungan PJ' : 'customer'} berhasil disimpan`);
  }, true);

  // Edit / delete limit unified.
  document.addEventListener('click', (e) => {
    const editPj = e.target.closest('[data-edit-limit-pj]');
    if (editPj) {
      const pj = editPj.dataset.editLimitPj || '';
      if ($('limitScope')) $('limitScope').value = 'PJ';
      if ($('limitCustomer')) $('limitCustomer').value = pj;
      if ($('limitPj')) $('limitPj').value = pj;
      if ($('limitValue')) $('limitValue').value = getUnifiedLimit('PJ', pj) || '';
      $('limitCustomer')?.focus();
      return;
    }

    const edit = e.target.closest('[data-edit-model]');
    if (edit) {
      const model = edit.dataset.editModel || 'CUSTOMER';
      const customer = edit.dataset.editLimit || '';
      const pj = edit.dataset.editPj || '';
      if ($('limitScope')) $('limitScope').value = model;
      if ($('limitCustomer')) $('limitCustomer').value = model === 'PJ' ? (pj || customer) : customer;
      if ($('limitPj')) $('limitPj').value = pj || '';
      if ($('limitValue')) $('limitValue').value = getUnifiedLimit(model, model === 'PJ' ? pj : customer) || '';
      $('limitCustomer')?.focus();
      return;
    }

    const del = e.target.closest('[data-delete-limit-rule]');
    if (del) {
      const key = del.dataset.deleteLimitRule;
      if (!confirm('Hapus limit ini?')) return;
      delete limitRules[key];
      const [type, name] = String(key || '').split('||');
      if (type === 'CUSTOMER') delete limits[name];
      save('limitRules', limitRules);
      save('limits', limits);
      render();
    }
  }, true);

  // Saat pilih customer, isi PJ terkait jika ada.
  $('limitCustomer')?.addEventListener('change', () => {
    const entity = normalizePJName($('limitCustomer')?.value || '');
    const row = data.find(x => normalizePJName(x.customer) === entity);
    if (row && $('limitPj') && getPJ(row) !== '-') $('limitPj').value = getPJ(row);
    if (row && $('limitScope')) $('limitScope').value = getBranchModel(row.cabang);
    const scope = $('limitScope')?.value || 'CUSTOMER';
    const name = scope === 'PJ' ? (($('limitPj')?.value || entity).trim().toUpperCase()) : entity;
    if ($('limitValue')) $('limitValue').value = getUnifiedLimit(scope, name) || '';
  });

  // Jika klik filter cepat yang tidak ada di select.
  document.querySelectorAll('[data-limit-filter]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopImmediatePropagation();
      setLimitFilter(btn.dataset.limitFilter || 'ALL');
    }, true);
  });

  async function checkAppVersion() {
    console.log('Cek versi aplikasi...');

    try {
      if (!firebaseReady || !firebaseDb) {
        console.log('Firebase belum siap untuk cek update.');
        return;
      }

      if (typeof ipcRenderer === 'undefined') {
        console.log('ipcRenderer belum aktif. Auto update tidak bisa jalan.');
        return;
      }

      const snap = await firebaseDb.collection('appConfig').doc('version').get();

      if (!snap.exists) {
        console.log('Config versi belum ada di Firebase.');
        return;
      }

      const cfg = snap.data() || {};
      const latestVersion = String(cfg.latestVersion || '').trim();
      const downloadUrl = String(cfg.downloadUrl || '').trim();

      if (!latestVersion || latestVersion === APP_VERSION) {
        console.log('Aplikasi sudah versi terbaru.');
        return;
      }

      const box = document.createElement('div');

      box.innerHTML = `
        <div style="
          position:fixed;
          inset:0;
          background:rgba(0,0,0,.45);
          z-index:999999;
          display:flex;
          align-items:center;
          justify-content:center;
        ">
          <div style="
            width:440px;
            background:#fff;
            border-radius:18px;
            padding:24px;
            box-shadow:0 20px 60px rgba(0,0,0,.25);
            font-family:Arial,sans-serif;
          ">
            <h2 style="margin:0 0 12px;">🚀 Update Tersedia</h2>

            <p>Versi sekarang: <b>${APP_VERSION}</b></p>
            <p>Versi terbaru: <b>${latestVersion}</b></p>

            <p>${cfg.message || 'Update ini akan mengganti aplikasi ke versi terbaru, termasuk menu dan fitur baru.'}</p>

            <div id="updateStatusText" style="
              margin-top:12px;
              color:#667085;
              font-size:14px;
            "></div>

            <div style="
              display:flex;
              justify-content:flex-end;
              gap:10px;
              margin-top:20px;
            ">
              <button id="closeUpdateBtn">
                Nanti
              </button>

              <button id="downloadUpdateBtn"
                style="
                  background:#0ea5e9;
                  color:white;
                  border:none;
                  padding:10px 18px;
                  border-radius:10px;
                  cursor:pointer;
                ">
                Update Sekarang
              </button>
            </div>
          </div>
        </div>
      `;

      document.body.appendChild(box);

      document.getElementById('closeUpdateBtn').onclick = () => {
        box.remove();
      };

      document.getElementById('downloadUpdateBtn').onclick = async () => {
        const btn = document.getElementById('downloadUpdateBtn');
        const statusText = document.getElementById('updateStatusText');

        if (!downloadUrl) {
          alert('Link installer belum diisi di Firebase.');
          return;
        }

        try {
          btn.disabled = true;
          btn.textContent = 'Downloading...';
          statusText.textContent = 'Sedang download installer. Jangan tutup aplikasi.';

          const installerPath = await ipcRenderer.invoke('download-update', downloadUrl);

          statusText.textContent = 'Download selesai. Installer akan dijalankan.';
          btn.textContent = 'Menjalankan installer...';

          await ipcRenderer.invoke('install-update', installerPath);

        } catch (err) {
          console.error('Gagal download/install update:', err);
          alert('Gagal update aplikasi. Cek internet atau link installer.');
          btn.disabled = false;
          btn.textContent = 'Update Sekarang';
          statusText.textContent = '';
        }
      };

    } catch (err) {
      console.error('Gagal cek update:', err);
    }
  }

  // FIX FINAL: input Master PJ bisa diketik
  document.addEventListener('pointerdown', (e) => {
    const el = e.target.closest('#pjNameInput, #pjTypeNameInput, #kepalaNameInput');
    if (!el) return;

    setTimeout(() => {
      el.disabled = false;
      el.readOnly = false;
      el.focus();
    }, 0);
  }, true);

  document.addEventListener('keydown', (e) => {
    const el = e.target.closest('#pjNameInput, #pjTypeNameInput, #kepalaNameInput');
    if (!el) return;

    e.stopPropagation();
  }, true);

  document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
      renderKepalaCabangMaster();
      render();
    }, 800);
  });

  $('syncNowBtn')?.addEventListener('click', async () => {
    const btn = $('syncNowBtn');

    btn.disabled = true;
    btn.textContent = '⏳ Sinkronisasi...';

    try {
      await syncFromCloud();
      refreshAgingData();
      render();

      alert('Data terbaru berhasil diambil dari Firebase');
    } catch (err) {
      console.error(err);
      alert('Gagal sinkronisasi');
    }

    btn.disabled = false;
    btn.textContent = '☁️ Sinkronkan Data';
  });

  $('uploadCloudBtn')?.addEventListener('click', async () => {
    const ok = await requireAdmin();
    if (!ok) return;

    await uploadLocalToCloud();

    alert('Semua data berhasil di-upload ke Firebase.');
  });

  $('uploadCloudBtn')?.addEventListener('click', async () => {
    const ok = await requireAdmin();
    if (!ok) return;

    await uploadLocalToCloud();
  });

  $('mappingCabang')?.addEventListener('change', () => {
  selectedCustomer = null;
  selectedNotaKeys.clear();

  if ($('salesmanInput')) $('salesmanInput').value = '';

  renderCustomerList();
  renderNotaCustomer();
  renderPJDropdown();
});



 $('mappingPJType')?.addEventListener('change', () => {
  if ($('salesmanInput')) $('salesmanInput').value = '';
  renderPJDropdown();
});

$('exitAppBtn')?.addEventListener('click', async () => {
  const ok = confirm('Keluar aplikasi?');

  if (!ok) return;

  await ipcRenderer.invoke('exit-app');
});

  startApp()