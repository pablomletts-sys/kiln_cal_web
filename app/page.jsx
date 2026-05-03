'use client';

import { useState, useEffect, useRef } from 'react';

/* ─── Design Tokens ──────────────────────────────────────────────────────── */
const C = {
  primary:    '#C1440E',
  primaryDk:  '#8F2F07',
  primaryLt:  '#E0754A',
  primaryXlt: '#FCEEE8',
  bg:         '#FBF5F1',
  white:      '#FFFFFF',
  dark:       '#1C1008',
  text:       '#3B2315',
  muted:      '#9C7B6E',
  border:     '#F0D9CE',
  amberLt:    '#FFFBEB',
};

const CFG_KEY     = 'kiln_cfg_v1';
const HIST_KEY    = 'kiln_history_v1';
const DEFAULT_CFG = { PFT: '400', KC: '200', CF: '2', PR: '30', pin: '1234' };

/* ─── Utilities ──────────────────────────────────────────────────────────── */
const roundUp05 = (n) => Math.ceil(n * 2) / 2;

const clampNum = (str, min, max, fallback) => {
  const n = parseFloat(str);
  if (!isFinite(n) || isNaN(n) || n < min || n > max) return fallback;
  return n;
};

const isSafeUri = (uri) => {
  if (!uri || typeof uri !== 'string') return false;
  return uri.startsWith('blob:') || uri.startsWith('data:image/');
};

const genId = () => Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);

/* ═════════════════════════════════════════════════════════════════════════ */
export default function App() {

  const [cfg, setCfg]             = useState(DEFAULT_CFG);
  const [cfgLoaded, setCfgLoaded] = useState(false);
  const [screen, setScreen]       = useState('home');
  const [photo, setPhoto]         = useState(null);   // blob URL
  const [desc, setDesc]           = useState('');
  const [meas, setMeas]           = useState({ H: '', W: '', D: '' });
  const [result, setResult]       = useState(null);
  const [history, setHistory]     = useState([]);

  // PIN gate
  const [showPin, setShowPin]   = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState(false);

  // Custom alert
  const [alertData, setAlertData] = useState(null);

  // File input ref (image picker)
  const fileInputRef = useRef(null);

  /* ── Persist to localStorage ───────────────────────────────────────────── */
  useEffect(() => {
    try {
      const c = localStorage.getItem(CFG_KEY);
      if (c) setCfg({ ...DEFAULT_CFG, ...JSON.parse(c) });
      const h = localStorage.getItem(HIST_KEY);
      // Blob URLs don't survive page refresh, so strip photo from stored history
      if (h) setHistory(JSON.parse(h).map(item => ({ ...item, photo: null })));
    } catch (_) {}
    setCfgLoaded(true);
  }, []);

  useEffect(() => {
    if (!cfgLoaded) return;
    localStorage.setItem(CFG_KEY, JSON.stringify(cfg));
  }, [cfg, cfgLoaded]);

  useEffect(() => {
    if (!cfgLoaded || history.length === 0) return;
    localStorage.setItem(HIST_KEY, JSON.stringify(history.map(i => ({ ...i, photo: null }))));
  }, [history, cfgLoaded]);

  // Revoke blob URL on photo change to avoid memory leaks
  useEffect(() => {
    return () => { if (photo?.startsWith('blob:')) URL.revokeObjectURL(photo); };
  }, [photo]);

  /* ── Computed ─────────────────────────────────────────────────────────── */
  const getPFT = (c = cfg) => clampNum(c.PFT, 0, 99999, 0);
  const getCL  = (c = cfg) => getPFT(c) / (clampNum(c.KC, 1, 99999, 1));

  const liveVP = () => {
    const H = clampNum(meas.H, 0.1, 500, null);
    const W = clampNum(meas.W, 0.1, 500, null);
    const D = clampNum(meas.D, 0.1, 500, null);
    if (H === null || W === null || D === null) return null;
    return (roundUp05(H) * roundUp05(W) * roundUp05(D)) / 1000;
  };

  const livePrice = () => {
    const vp = liveVP();
    if (vp === null) return null;
    return vp * getCL() * clampNum(cfg.CF, 0.1, 100, 1) * (1 + clampNum(cfg.PR, 0, 1000, 0) / 100);
  };

  /* ── Alert helper ─────────────────────────────────────────────────────── */
  const showAlert = (title, message) => setAlertData({ title, message });

  /* ── Admin PIN gate ───────────────────────────────────────────────────── */
  const goToAdmin = () => { setPinInput(''); setPinError(false); setShowPin(true); };

  const submitPin = () => {
    if (pinInput === cfg.pin) {
      setShowPin(false); setPinInput(''); setPinError(false); setScreen('admin');
    } else {
      setPinError(true); setPinInput('');
    }
  };

  /* ── File picker ──────────────────────────────────────────────────────── */
  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      showAlert('Imagen no válida', 'Solo se permiten archivos de imagen (JPG, PNG, etc.).');
      return;
    }
    if (photo?.startsWith('blob:')) URL.revokeObjectURL(photo);
    setPhoto(URL.createObjectURL(file));
    e.target.value = ''; // allow re-selecting same file
  };

  /* ── Calculate ────────────────────────────────────────────────────────── */
  const calculate = () => {
    try {
      const rawH = clampNum(meas.H, 0.1, 500, null);
      const rawW = clampNum(meas.W, 0.1, 500, null);
      const rawD = clampNum(meas.D, 0.1, 500, null);
      if (rawH === null || rawW === null || rawD === null) {
        showAlert('Medidas inválidas', 'Ingresa valores positivos para Alto, Ancho y Fondo (máx. 500 cm).');
        return;
      }
      const H = roundUp05(rawH), W = roundUp05(rawW), D = roundUp05(rawD);
      const PFT = getPFT(), CL = getCL();
      const CF  = clampNum(cfg.CF, 0.1, 100, 1);
      const PR  = clampNum(cfg.PR, 0, 1000, 0);
      const VP  = (H * W * D) / 1000;
      const PR_mul = 1 + PR / 100;
      const price  = VP * CL * CF * PR_mul;
      if (!isFinite(price) || price < 0) {
        showAlert('Error de cálculo', 'El resultado no es válido. Revisa la configuración del horno.');
        return;
      }
      const res = {
        id: genId(),
        desc: (desc || 'Pieza de cerámica').slice(0, 100),
        photo: isSafeUri(photo) ? photo : null,
        H, W, D, VP, PFT, CL, CF, PR_mul, PR: cfg.PR, price,
        date: new Date().toLocaleDateString('es-PE'),
      };
      setResult(res);
      setHistory(prev => [res, ...prev.slice(0, 19)]);
      setScreen('result');
    } catch (_) {
      showAlert('Error inesperado', 'Ocurrió un problema al calcular. Por favor intenta de nuevo.');
    }
  };

  const resetCalc = () => {
    setMeas({ H: '', W: '', D: '' });
    if (photo?.startsWith('blob:')) URL.revokeObjectURL(photo);
    setPhoto(null); setDesc(''); setScreen('calculator');
  };

  /* ────────────────────────────────────────────────────────────────────────
     SHARED COMPONENTS
  ──────────────────────────────────────────────────────────────────────── */

  const AlertModal = () => alertData ? (
    <div style={s.overlay}>
      <div style={s.alertBox}>
        <p style={s.alertTitle}>{alertData.title}</p>
        <p style={s.alertMsg}>{alertData.message}</p>
        <button style={s.btnPrimary} onClick={() => setAlertData(null)}>OK</button>
      </div>
    </div>
  ) : null;

  const PinModal = () => showPin ? (
    <div style={s.overlay}>
      <div style={s.pinBox}>
        <p style={s.pinTitle}>🔒 Acceso de Administrador</p>
        <p style={s.pinSub}>Ingresa el PIN para acceder a la configuración</p>
        <input
          style={{ ...s.pinInput, ...(pinError ? { borderColor: '#CC0000' } : {}) }}
          type="password"
          inputMode="numeric"
          maxLength={4}
          value={pinInput}
          onChange={e => { setPinInput(e.target.value.replace(/\D/g, '')); setPinError(false); }}
          placeholder="••••"
          autoFocus
          onKeyDown={e => e.key === 'Enter' && submitPin()}
        />
        {pinError && <p style={s.pinErr}>PIN incorrecto. Inténtalo de nuevo.</p>}
        <button style={s.btnPrimary} onClick={submitPin}>Entrar</button>
        <button style={{ ...s.btnOutline, marginTop: 0 }}
          onClick={() => { setShowPin(false); setPinInput(''); setPinError(false); }}>
          Cancelar
        </button>
        <p style={s.pinHint}>PIN por defecto: 1234</p>
      </div>
    </div>
  ) : null;

  const Navbar = ({ title, onBack, actionLabel, onAction, light }) => (
    <div style={{ ...s.navbar, ...(light ? { backgroundColor: C.primaryDk, borderBottom: 'none' } : {}) }}>
      {onBack && (
        <button style={s.navBackBtn} onClick={onBack}>
          <span style={{ ...s.navBackText, ...(light ? { color: C.white } : {}) }}>←</span>
        </button>
      )}
      <span style={{ ...s.navTitle, ...(light ? { color: C.white } : {}) }}>{title}</span>
      {actionLabel && (
        <button style={{ ...s.navActionBtn, ...(light ? { backgroundColor: 'rgba(255,255,255,0.2)' } : {}) }}
          onClick={onAction}>
          <span style={{ ...s.navActionText, ...(light ? { color: C.white } : {}) }}>{actionLabel}</span>
        </button>
      )}
    </div>
  );

  /* ────────────────────────────────────────────────────────────────────────
     HOME
  ──────────────────────────────────────────────────────────────────────── */
  const HomeScreen = () => (
    <div style={s.screen}>
      <div style={s.homeHeader}>
        <h1 style={s.homeTitle}>Precio de Quema</h1>
        <p style={s.homeSub}>Calculadora de costos de horno</p>
      </div>
      <div style={s.scrollArea}>
        <div style={s.menuGrid}>
          {[
            { e: '📸', l: 'Calcular Precio',  d: 'Foto + medidas',               fn: () => setScreen('calculator'), accent: C.primary   },
            { e: '⚙️', l: 'Configuración',    d: 'Parámetros del horno',         fn: goToAdmin,                     accent: C.primaryDk },
            { e: '📋', l: 'Historial',        d: `${history.length} resultados`, fn: () => setScreen('history'),    accent: '#A0856B'   },
            { e: '🔥', l: 'Estado del Horno', d: 'Seguimiento de quemas',        fn: () => {},                      accent: '#E07534'   },
          ].map((item, i) => (
            <button key={i} style={{ ...s.menuCard, borderTop: `4px solid ${item.accent}` }} onClick={item.fn}>
              <span style={{ fontSize: 28, marginBottom: 8, display: 'block' }}>{item.e}</span>
              <span style={s.menuLabel}>{item.l}</span>
              <span style={s.menuDesc}>{item.d}</span>
            </button>
          ))}
        </div>

        <div style={{ ...s.card, margin: '0 16px 16px' }}>
          <div style={s.row}>
            <span style={s.cardTitle}>Configuración Actual</span>
            <button style={s.editBtn} onClick={goToAdmin}>
              <span style={s.editBtnText}>Editar</span>
            </button>
          </div>
          <div style={s.divider} />
          {[
            { label: 'Precio de Quema Total (PFT)', value: `S/ ${getPFT().toFixed(2)}`, tag: 'Admin' },
            { label: 'Capacidad del Horno (KC)',    value: `${cfg.KC} L` },
            { label: 'Costo por Litro (CL)',        value: `S/ ${getCL().toFixed(4)} / L` },
            { label: 'Factor de Conversión (FC)',   value: `× ${cfg.CF}` },
            { label: 'Margen de Ganancia (G)',      value: `${cfg.PR}%` },
          ].map((item, i) => (
            <div key={i} style={{ ...s.row, padding: '9px 0', borderBottom: i < 4 ? `1px solid ${C.border}` : 'none' }}>
              <span style={s.summaryLabel}>{item.label}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {item.tag && <span style={s.pill}><span style={s.pillText}>{item.tag}</span></span>}
                <span style={s.summaryValue}>{item.value}</span>
              </div>
            </div>
          ))}
        </div>

        <div style={{ ...s.card, margin: '0 16px 24px', backgroundColor: C.primaryXlt, border: `1px solid ${C.primaryLt}` }}>
          <span style={{ ...s.cardTitle, color: C.primaryDk, display: 'block', marginBottom: 8 }}>Fórmula de Precios</span>
          {['VP = H × W × D ÷ 1000  →  volumen en litros', 'CL = PFT ÷ KC  →  costo por litro', 'Precio = VP × CL × FC × (1 + G%)']
            .map((f, i) => (
              <p key={i} style={{ ...s.formulaLine, borderBottom: i < 2 ? `1px solid ${C.primaryLt}` : 'none', paddingBottom: i < 2 ? 5 : 0, marginBottom: i < 2 ? 5 : 0 }}>{f}</p>
            ))}
        </div>
      </div>
    </div>
  );

  /* ────────────────────────────────────────────────────────────────────────
     ADMIN  (PIN-protected)
  ──────────────────────────────────────────────────────────────────────── */
  const AdminScreen = () => {
    const [local, setLocal]     = useState({ ...cfg });
    const [newPin1, setNewPin1] = useState('');
    const [newPin2, setNewPin2] = useState('');
    const updL = (k, v) => setLocal(p => ({ ...p, [k]: v }));
    const localPFT = () => clampNum(local.PFT, 0, 99999, 0);
    const localCL  = () => localPFT() / (clampNum(local.KC, 1, 99999, 1));

    const save = () => {
      if (newPin1 || newPin2) {
        if (!/^\d{4}$/.test(newPin1)) { showAlert('PIN inválido', 'El nuevo PIN debe tener exactamente 4 dígitos.'); return; }
        if (newPin1 !== newPin2) { showAlert('PIN no coincide', 'Los dos campos de PIN no coinciden.'); return; }
        local.pin = newPin1;
      }
      const pft = clampNum(local.PFT, 0, 99999, null);
      const kc  = clampNum(local.KC,  1, 99999, null);
      const cf  = clampNum(local.CF,  0.1, 100, null);
      const pr  = clampNum(local.PR,  0, 1000,  null);
      if (pft === null || kc === null || cf === null || pr === null) {
        showAlert('Valores inválidos', 'Verifica que todos los campos tengan valores numéricos dentro del rango permitido.');
        return;
      }
      setCfg({ ...local, PFT: String(pft), KC: String(kc), CF: String(cf), PR: String(pr) });
      setScreen('home');
    };

    return (
      <div style={s.screen}>
        <Navbar title="Configuración del Horno" onBack={() => setScreen('home')} actionLabel="Guardar" onAction={save} />
        <div style={s.scrollArea}>
          <div style={{ padding: 16, paddingBottom: 40 }}>

            <div style={s.card}>
              <span style={s.cardTitle}>Precio de Quema Total (PFT)</span>
              <p style={s.cardSub}>Costo total de una quema completa. Lo define el administrador.</p>
              <label style={s.label}>PFT – Precio de Quema Total</label>
              <div style={s.inputWrap}>
                <input style={s.input} type="number" inputMode="decimal" value={local.PFT} maxLength={8}
                  onChange={e => updL('PFT', e.target.value)} placeholder="400" />
                <span style={s.unit}>S/</span>
              </div>
              <div style={{ ...s.row, ...s.previewRow }}>
                <span style={s.previewLabel}>CL = PFT ÷ KC</span>
                <span style={s.previewValue}>S/ {localCL().toFixed(4)} / L</span>
              </div>
            </div>

            <div style={s.card}>
              <span style={s.cardTitle}>Capacidad del Horno</span>
              <label style={{ ...s.label, marginTop: 4 }}>KC – Volumen Interior</label>
              <div style={s.inputWrap}>
                <input style={s.input} type="number" inputMode="decimal" value={local.KC} maxLength={8}
                  onChange={e => updL('KC', e.target.value)} placeholder="200" />
                <span style={s.unit}>L</span>
              </div>
              <div style={{ ...s.row, ...s.previewRow }}>
                <span style={s.previewLabel}>Costo por Litro (CL)</span>
                <span style={s.previewValue}>S/ {localCL().toFixed(4)}</span>
              </div>
            </div>

            <div style={s.card}>
              <span style={s.cardTitle}>Parámetros de Precio</span>
              <label style={{ ...s.label, marginTop: 4 }}>FC – Factor de Conversión</label>
              <div style={{ ...s.inputWrap, marginBottom: 4 }}>
                <input style={s.input} type="number" inputMode="decimal" value={local.CF} maxLength={6}
                  onChange={e => updL('CF', e.target.value)} placeholder="2" />
                <span style={s.unit}>×</span>
              </div>
              <p style={s.hint}>Ajusta la densidad de piezas en el horno (por defecto: 2)</p>
              <label style={{ ...s.label, marginTop: 16 }}>G – Margen de Ganancia</label>
              <div style={s.inputWrap}>
                <input style={s.input} type="number" inputMode="decimal" value={local.PR} maxLength={6}
                  onChange={e => updL('PR', e.target.value)} placeholder="30" />
                <span style={s.unit}>%</span>
              </div>
            </div>

            <div style={{ ...s.card, backgroundColor: C.primaryDk }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase', letterSpacing: '0.8px', display: 'block', marginBottom: 12 }}>VISTA PREVIA DE LA FÓRMULA</span>
              {[
                { step: 'Paso 1', expr: 'VP = H × W × D ÷ 1000', sub: 'Volumen de la pieza en litros' },
                { step: 'Paso 2', expr: `CL = S/${localPFT().toFixed(2)} ÷ ${local.KC}L = S/${localCL().toFixed(4)}/L`, sub: 'Costo por litro' },
                { step: 'Paso 3', expr: `Precio = VP × ${localCL().toFixed(4)} × ${local.CF} × ${(1 + clampNum(local.PR, 0, 1000, 0) / 100).toFixed(2)}`, sub: 'Precio final' },
              ].map((f, i) => (
                <div key={i} style={{ paddingBottom: i < 2 ? 12 : 0, marginBottom: i < 2 ? 12 : 0, borderBottom: i < 2 ? '1px solid rgba(255,255,255,0.15)' : 'none' }}>
                  <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', marginBottom: 2 }}>{f.step.toUpperCase()}</p>
                  <p style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 700, color: C.white }}>{f.expr}</p>
                  <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)', marginTop: 2 }}>{f.sub}</p>
                </div>
              ))}
            </div>

            <div style={s.card}>
              <span style={s.cardTitle}>🔒 Cambiar PIN de Acceso</span>
              <p style={s.cardSub}>Deja en blanco si no deseas cambiar el PIN actual.</p>
              <label style={s.label}>Nuevo PIN (4 dígitos)</label>
              <div style={{ ...s.inputWrap, marginBottom: 14 }}>
                <input style={s.input} type="password" inputMode="numeric" maxLength={4}
                  value={newPin1} onChange={e => setNewPin1(e.target.value.replace(/\D/g, ''))} placeholder="••••" />
              </div>
              <label style={s.label}>Confirmar Nuevo PIN</label>
              <div style={s.inputWrap}>
                <input style={s.input} type="password" inputMode="numeric" maxLength={4}
                  value={newPin2} onChange={e => setNewPin2(e.target.value.replace(/\D/g, ''))} placeholder="••••" />
              </div>
            </div>

            <button style={s.btnPrimary} onClick={save}>Guardar Configuración</button>
            <button style={s.btnOutline} onClick={() => setScreen('home')}>Cancelar</button>
          </div>
        </div>
      </div>
    );
  };

  /* ────────────────────────────────────────────────────────────────────────
     CALCULATOR
  ──────────────────────────────────────────────────────────────────────── */
  const CalculatorScreen = () => {
    const vp = liveVP(), price = livePrice();
    return (
      <div style={s.screen}>
        <Navbar title="Calcular Precio de Quema" onBack={() => setScreen('home')} />
        <div style={s.scrollArea}>
          <div style={{ padding: 16, paddingBottom: 40 }}>

            {/* Hidden file input — triggered by buttons below */}
            <input ref={fileInputRef} type="file" accept="image/*"
              style={{ display: 'none' }} onChange={handleFileSelect} />

            <div style={s.card}>
              <label style={s.label}>Foto de la Pieza (con regla en cm)</label>
              {photo ? (
                <>
                  <img src={photo} style={s.photoPreview} alt="Pieza de cerámica" />
                  <button style={{ ...s.btnOutline, marginTop: 8 }}
                    onClick={() => fileInputRef.current?.click()}>
                    Cambiar Foto
                  </button>
                </>
              ) : (
                <button style={s.photoPlaceholder} onClick={() => fileInputRef.current?.click()}>
                  <span style={{ fontSize: 44 }}>📷</span>
                  <span style={s.photoTitle}>Subir Foto</span>
                  <span style={s.photoSub}>Coloca una regla en cm junto a la pieza</span>
                </button>
              )}
            </div>

            <div style={s.tipBox}>
              <p style={s.tipText}>
                <strong>📐 Consejo: </strong>
                En una próxima versión las medidas se detectarán desde la regla. Por ahora ingrésalas manualmente. Se redondean al 0.5 cm más cercano.
              </p>
            </div>

            <div style={s.card}>
              <label style={s.label}>Medidas (cm)</label>
              <div style={{ display: 'flex', gap: 10 }}>
                {[{ key: 'H', label: 'Alto' }, { key: 'W', label: 'Ancho' }, { key: 'D', label: 'Fondo' }].map(({ key, label }) => (
                  <div key={key} style={{ flex: 1 }}>
                    <label style={{ ...s.label, textAlign: 'center', display: 'block' }}>{label}</label>
                    <div style={s.inputWrap}>
                      <input style={{ ...s.input, textAlign: 'center', paddingRight: 28 }}
                        type="number" inputMode="decimal" placeholder="0" maxLength={6}
                        value={meas[key]} onChange={e => setMeas(p => ({ ...p, [key]: e.target.value }))} />
                      <span style={{ ...s.unit, fontSize: 11 }}>cm</span>
                    </div>
                  </div>
                ))}
              </div>

              {(meas.H || meas.W || meas.D) && (
                <div style={{ marginTop: 10, padding: 8, backgroundColor: C.bg, borderRadius: 8 }}>
                  <p style={{ fontSize: 12, color: C.muted }}>
                    Redondeado ↑:{' '}
                    <strong style={{ color: C.text }}>
                      {meas.H ? roundUp05(parseFloat(meas.H)) : '—'} × {meas.W ? roundUp05(parseFloat(meas.W)) : '—'} × {meas.D ? roundUp05(parseFloat(meas.D)) : '—'} cm
                    </strong>
                  </p>
                </div>
              )}

              {vp !== null && (
                <div style={{ ...s.previewRow, marginTop: 10, border: `1px solid ${C.primaryLt}` }}>
                  <div style={{ ...s.row, marginBottom: 6 }}>
                    <span style={s.previewLabel}>Volumen (VP)</span>
                    <span style={s.previewValue}>{vp.toFixed(3)} L</span>
                  </div>
                  <div style={s.row}>
                    <span style={s.previewLabel}>Precio Estimado</span>
                    <span style={{ ...s.previewValue, fontSize: 18, color: C.primary }}>S/ {price.toFixed(2)}</span>
                  </div>
                </div>
              )}
            </div>

            <div style={s.card}>
              <label style={s.label}>Descripción breve (opcional)</label>
              <input style={s.input} placeholder="Ej. Tazón decorativo" maxLength={100}
                value={desc} onChange={e => setDesc(e.target.value)} />
            </div>

            <div style={{ ...s.card, paddingTop: 14, paddingBottom: 14 }}>
              <div style={{ ...s.row, marginBottom: 6 }}>
                <span style={s.previewLabel}>CL = PFT ÷ KC</span>
                <span style={{ ...s.previewValue, fontSize: 13 }}>S/ {getCL().toFixed(4)}</span>
              </div>
              <div style={s.row}>
                <span style={s.previewLabel}>FC × G</span>
                <span style={{ ...s.previewValue, fontSize: 13 }}>
                  {cfg.CF} × {(1 + clampNum(cfg.PR, 0, 1000, 0) / 100).toFixed(2)}
                </span>
              </div>
            </div>

            <button style={s.btnPrimary} onClick={calculate}>Calcular Precio de Quema →</button>
          </div>
        </div>
      </div>
    );
  };

  /* ────────────────────────────────────────────────────────────────────────
     RESULT
  ──────────────────────────────────────────────────────────────────────── */
  const ResultScreen = () => {
    if (!result) return null;
    const { desc: d, photo: p, H, W, D, VP, PFT, CL, CF, PR, PR_mul, price, date } = result;
    return (
      <div style={s.screen}>
        <Navbar title="Precio de Quema" onBack={() => setScreen('calculator')} actionLabel="Nueva" onAction={resetCalc} light />
        <div style={s.scrollArea}>
          <div style={s.resultHero}>
            <p style={s.resultDesc}>{d}</p>
            <p style={s.resultPrice}>S/ {price.toFixed(2)}</p>
            <p style={s.resultMeta}>{date} · incl. {PR}% de ganancia</p>
          </div>
          <div style={{ padding: 16 }}>
            {p && isSafeUri(p) && (
              <div style={s.card}>
                <img src={p} style={{ ...s.photoPreview, height: 200 }} alt={d} />
              </div>
            )}

            <div style={s.card}>
              <span style={s.cardTitle}>Dimensiones (redondeado ↑ a 0.5 cm)</span>
              <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
                {[['Alto', H], ['Ancho', W], ['Fondo', D]].map(([lbl, val]) => (
                  <div key={lbl} style={{ flex: 1, backgroundColor: C.bg, borderRadius: 10, padding: 10, textAlign: 'center' }}>
                    <p style={{ fontSize: 11, color: C.muted, fontWeight: 700, marginBottom: 4 }}>{lbl}</p>
                    <p style={{ fontSize: 22, fontWeight: 800, color: C.dark, marginBottom: 2 }}>{val}</p>
                    <p style={{ fontSize: 11, color: C.muted }}>cm</p>
                  </div>
                ))}
              </div>
            </div>

            <div style={s.card}>
              <span style={s.cardTitle}>Desglose del Cálculo</span>
              {[
                { label: 'Volumen (VP)',              formula: `(${H} × ${W} × ${D}) ÷ 1000`,              value: `${VP.toFixed(4)} L`      },
                { label: 'Costo por Litro (CL)',      formula: `PFT S/${PFT.toFixed(2)} ÷ KC ${cfg.KC} L`, value: `S/ ${CL.toFixed(4)} / L` },
                { label: 'Factor de Conversión (FC)', formula: 'Ajuste densidad / espacio',                value: `× ${CF}`                 },
                { label: 'Margen de Ganancia (G)',    formula: `${PR}% → multiplicador`,                  value: `× ${PR_mul.toFixed(2)}`  },
              ].map((row, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '10px 0', borderBottom: i < 3 ? `1px solid ${C.border}` : 'none' }}>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: 14, fontWeight: 600, color: C.dark, marginBottom: 2 }}>{row.label}</p>
                    <p style={{ fontSize: 11, color: C.muted }}>{row.formula}</p>
                  </div>
                  <span style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{row.value}</span>
                </div>
              ))}
            </div>

            <div style={{ ...s.card, backgroundColor: C.primary }}>
              <div style={s.row}>
                <div>
                  <p style={{ color: 'rgba(255,255,255,0.75)', fontSize: 13 }}>Precio Final de Quema</p>
                  <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: 11, marginTop: 2 }}>VP × CL × FC × (1 + {PR}%)</p>
                </div>
                <span style={{ color: C.white, fontSize: 30, fontWeight: 900 }}>S/ {price.toFixed(2)}</span>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 12, paddingBottom: 24 }}>
              <button style={{ ...s.btnOutline, flex: 1, marginBottom: 0 }} onClick={resetCalc}>Nueva Pieza</button>
              <button style={{ ...s.btnPrimary, flex: 1, marginBottom: 0 }} onClick={() => setScreen('history')}>Ver Historial</button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  /* ────────────────────────────────────────────────────────────────────────
     HISTORY
  ──────────────────────────────────────────────────────────────────────── */
  const HistoryScreen = () => (
    <div style={s.screen}>
      <Navbar title="Historial de Precios" onBack={() => setScreen('home')} />
      <div style={s.scrollArea}>
        <div style={{ padding: 16, paddingBottom: 32 }}>
          {history.length === 0 ? (
            <div style={{ textAlign: 'center', paddingTop: 60 }}>
              <p style={{ fontSize: 48, marginBottom: 12 }}>📭</p>
              <p style={{ fontWeight: 700, fontSize: 16, color: C.text, marginBottom: 6 }}>Sin cálculos aún</p>
              <p style={{ fontSize: 14, color: C.muted, marginBottom: 24 }}>
                Calcula el precio de tu primera pieza para verla aquí.
              </p>
              <button style={s.btnPrimary} onClick={() => setScreen('calculator')}>
                Calcular Primera Pieza
              </button>
            </div>
          ) : history.map(item => (
            <button key={item.id} style={{ ...s.card, width: '100%', textAlign: 'left', cursor: 'pointer' }}
              onClick={() => { setResult(item); setScreen('result'); }}>
              <div style={s.row}>
                <div style={{ flex: 1, marginRight: 12 }}>
                  <p style={{ fontWeight: 700, fontSize: 15, color: C.dark, marginBottom: 4 }}>{item.desc}</p>
                  <p style={{ fontSize: 12, color: C.muted }}>
                    {item.H} × {item.W} × {item.D} cm · {item.VP.toFixed(3)} L · {item.date}
                  </p>
                </div>
                <span style={{ fontSize: 20, fontWeight: 800, color: C.primary, whiteSpace: 'nowrap' }}>
                  S/ {item.price.toFixed(2)}
                </span>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  /* ────────────────────────────────────────────────────────────────────────
     ROOT RENDER
  ──────────────────────────────────────────────────────────────────────── */
  const showNav = ['home', 'calculator', 'history'].includes(screen);

  return (
    <div style={s.root}>
      <div style={s.appShell}>
        {screen === 'home'       && <HomeScreen />}
        {screen === 'admin'      && <AdminScreen />}
        {screen === 'calculator' && <CalculatorScreen />}
        {screen === 'result'     && <ResultScreen />}
        {screen === 'history'    && <HistoryScreen />}

        {showNav && (
          <nav style={s.bottomNav}>
            {[
              { e: '🏠', l: 'Inicio',    k: 'home',       fn: () => setScreen('home')       },
              { e: '📸', l: 'Calcular',  k: 'calculator', fn: () => setScreen('calculator') },
              { e: '📋', l: 'Historial', k: 'history',    fn: () => setScreen('history')    },
              { e: '⚙️', l: 'Config',    k: 'admin',      fn: goToAdmin                     },
            ].map(item => (
              <button key={item.k} style={s.navItem} onClick={item.fn}>
                <span style={{ fontSize: 22 }}>{item.e}</span>
                <span style={{ ...s.navLabel, ...(screen === item.k ? { color: C.primary } : {}) }}>
                  {item.l}
                </span>
              </button>
            ))}
          </nav>
        )}

        {/* Modals render at root level so they overlay all screens */}
        <PinModal />
        <AlertModal />
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   STYLES
═══════════════════════════════════════════════════════════════════════════ */
const s = {
  // Shell
  root:     { minHeight: '100vh', backgroundColor: '#E8DDD8', display: 'flex', justifyContent: 'center', alignItems: 'flex-start' },
  appShell: { width: '100%', maxWidth: 430, backgroundColor: C.bg, minHeight: '100vh', display: 'flex', flexDirection: 'column', position: 'relative', boxShadow: '0 0 60px rgba(0,0,0,0.15)' },
  screen:   { flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' },
  scrollArea: { flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch' },

  // Layout
  row:      { display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  divider:  { height: 1, backgroundColor: C.border, margin: '10px 0' },

  // Home
  homeHeader: { padding: '18px 24px 14px', backgroundColor: C.primaryDk },
  homeTitle:  { fontSize: 22, fontWeight: 800, color: C.white, marginBottom: 2 },
  homeSub:    { fontSize: 13, color: 'rgba(255,255,255,0.8)' },
  menuGrid:   { display: 'flex', flexWrap: 'wrap', padding: 12, gap: 12 },
  menuCard:   { width: 'calc(50% - 6px)', backgroundColor: C.white, borderRadius: 16, padding: 16, display: 'flex', flexDirection: 'column', alignItems: 'center', boxShadow: '0 2px 6px rgba(0,0,0,0.06)', cursor: 'pointer', textAlign: 'center', borderLeft: 'none', borderRight: 'none', borderBottom: 'none' },
  menuLabel:  { fontSize: 13, fontWeight: 700, color: C.dark, marginBottom: 3, display: 'block' },
  menuDesc:   { fontSize: 11, color: C.muted, display: 'block' },

  // Navbar
  navbar:       { display: 'flex', alignItems: 'center', padding: '12px', backgroundColor: C.white, borderBottom: `1px solid ${C.border}`, flexShrink: 0 },
  navBackBtn:   { background: 'none', border: 'none', padding: 6, marginRight: 4, cursor: 'pointer' },
  navBackText:  { fontSize: 24, color: C.primary, lineHeight: 1 },
  navTitle:     { flex: 1, fontSize: 17, fontWeight: 700, color: C.dark },
  navActionBtn: { backgroundColor: C.primaryXlt, border: 'none', borderRadius: 8, padding: '6px 12px', cursor: 'pointer' },
  navActionText:{ fontSize: 13, fontWeight: 700, color: C.primary },

  // Cards
  card:       { backgroundColor: C.white, borderRadius: 16, padding: 18, marginBottom: 14, boxShadow: '0 2px 6px rgba(0,0,0,0.05)' },
  cardTitle:  { fontSize: 15, fontWeight: 700, color: C.dark, marginBottom: 4, display: 'block' },
  cardSub:    { fontSize: 13, color: C.muted, marginTop: 4, marginBottom: 14 },
  editBtn:    { backgroundColor: C.primaryXlt, border: 'none', borderRadius: 6, padding: '4px 10px', cursor: 'pointer' },
  editBtnText:{ fontSize: 12, fontWeight: 700, color: C.primary },

  // Summary
  summaryLabel: { fontSize: 13, color: C.muted, flex: 1 },
  summaryValue: { fontSize: 13, fontWeight: 700, color: C.dark },
  pill:         { backgroundColor: C.primaryXlt, borderRadius: 999, padding: '2px 8px' },
  pillText:     { fontSize: 10, fontWeight: 700, color: C.primaryLt },
  formulaLine:  { fontFamily: 'monospace', fontSize: 12, color: C.primaryDk, padding: '4px 0', display: 'block' },

  // Form
  label:      { fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 6, display: 'block' },
  inputWrap:  { position: 'relative', display: 'flex', alignItems: 'center', marginBottom: 4 },
  input:      { width: '100%', border: `1.5px solid ${C.border}`, borderRadius: 10, padding: '12px 48px 12px 14px', fontSize: 16, color: C.dark, backgroundColor: C.white, outline: 'none', boxSizing: 'border-box' },
  unit:       { position: 'absolute', right: 14, fontSize: 13, fontWeight: 700, color: C.muted, pointerEvents: 'none' },
  hint:       { fontSize: 12, color: C.muted, margin: '2px 0 4px' },
  previewRow:   { backgroundColor: C.primaryXlt, borderRadius: 10, padding: 10, marginTop: 8 },
  previewLabel: { fontSize: 13, color: C.muted, flex: 1 },
  previewValue: { fontSize: 14, fontWeight: 700, color: C.primary },

  // Tips / photo
  tipBox:          { backgroundColor: C.amberLt, borderRadius: 12, padding: 12, marginBottom: 14, border: '1px solid #F59E0B33' },
  tipText:         { fontSize: 13, color: '#92400E' },
  photoPreview:    { width: '100%', borderRadius: 12, height: 240, objectFit: 'cover', marginBottom: 8 },
  photoPlaceholder:{ border: `2px dashed ${C.border}`, borderRadius: 14, padding: 32, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, backgroundColor: C.bg, cursor: 'pointer', width: '100%', boxSizing: 'border-box' },
  photoTitle:      { fontWeight: 700, color: C.dark, fontSize: 15 },
  photoSub:        { fontSize: 13, color: C.muted },

  // Buttons
  btnPrimary:  { backgroundColor: C.primary, border: 'none', borderRadius: 14, padding: '16px 24px', width: '100%', fontSize: 16, fontWeight: 700, color: C.white, marginBottom: 10, cursor: 'pointer', textAlign: 'center', boxSizing: 'border-box', display: 'block' },
  btnOutline:  { border: `2px solid ${C.primary}`, borderRadius: 14, padding: '14px 24px', width: '100%', fontSize: 15, fontWeight: 700, color: C.primary, marginBottom: 10, cursor: 'pointer', textAlign: 'center', backgroundColor: C.white, boxSizing: 'border-box', display: 'block' },

  // Result hero
  resultHero:  { padding: '28px 24px', textAlign: 'center', backgroundColor: C.primaryDk, flexShrink: 0 },
  resultDesc:  { fontSize: 13, color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 },
  resultPrice: { fontSize: 54, fontWeight: 900, color: C.white, letterSpacing: -1, marginBottom: 4 },
  resultMeta:  { fontSize: 13, color: 'rgba(255,255,255,0.65)' },

  // Bottom nav
  bottomNav:  { display: 'flex', backgroundColor: C.white, borderTop: `1px solid ${C.border}`, flexShrink: 0 },
  navItem:    { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '10px 0 8px', background: 'none', border: 'none', cursor: 'pointer' },
  navLabel:   { fontSize: 10, fontWeight: 700, color: C.muted, marginTop: 3, letterSpacing: '0.3px' },

  // Modals
  overlay:    { position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.65)', display: 'flex', justifyContent: 'center', alignItems: 'center', padding: 24, zIndex: 1000 },
  alertBox:   { backgroundColor: C.white, borderRadius: 20, padding: 28, width: '100%', maxWidth: 320, boxShadow: '0 8px 32px rgba(0,0,0,0.18)' },
  alertTitle: { fontSize: 17, fontWeight: 800, color: C.dark, textAlign: 'center', marginBottom: 8 },
  alertMsg:   { fontSize: 14, color: C.muted, textAlign: 'center', marginBottom: 20 },
  pinBox:     { backgroundColor: C.white, borderRadius: 20, padding: 28, width: '100%', maxWidth: 340, boxShadow: '0 8px 32px rgba(0,0,0,0.18)' },
  pinTitle:   { fontSize: 18, fontWeight: 800, color: C.dark, textAlign: 'center', marginBottom: 6 },
  pinSub:     { fontSize: 13, color: C.muted, textAlign: 'center', marginBottom: 22 },
  pinInput:   { width: '100%', border: `2px solid ${C.border}`, borderRadius: 12, padding: '14px 20px', fontSize: 28, color: C.dark, textAlign: 'center', letterSpacing: 12, marginBottom: 16, boxSizing: 'border-box', backgroundColor: C.bg, outline: 'none' },
  pinErr:     { fontSize: 13, color: '#CC0000', textAlign: 'center', marginBottom: 12, fontWeight: 600 },
  pinHint:    { fontSize: 11, color: C.muted, textAlign: 'center', marginTop: 10 },
};
