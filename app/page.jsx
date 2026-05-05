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
  green:      '#16A34A',
  blue:       '#2563EB',
  orange:     '#E07534',
};

/* ─── Constants ──────────────────────────────────────────────────────────── */
const CFG_KEY  = 'kiln_cfg_v2';
const HIST_KEY = 'kiln_history_v2';

const STATUS_OPTIONS = [
  { id: 'pendiente', label: 'Pendiente',   emoji: '⏳', color: C.muted   },
  { id: 'en_horno',  label: 'En el Horno', emoji: '🔥', color: C.orange  },
  { id: 'quemado',   label: 'Quemado',     emoji: '✅', color: C.blue    },
  { id: 'entregado', label: 'Entregado',   emoji: '📦', color: C.green   },
];

const DEFAULT_FIRING_TYPES = [
  { id: 'bizcocho', name: 'Bizcocho', pft: '300' },
  { id: 'esmalte',  name: 'Esmalte',  pft: '400' },
  { id: 'raku',     name: 'Raku',     pft: '350' },
];

const DEFAULT_CFG = {
  KC: '200', CF: '2', PR: '30', pin: '1234',
  firingTypes: DEFAULT_FIRING_TYPES,
};

/* ─── Utilities ──────────────────────────────────────────────────────────── */
const roundUp05 = (n) => Math.ceil(n * 2) / 2;
const clampNum  = (str, min, max, fallback) => {
  const n = parseFloat(str);
  return (!isFinite(n) || isNaN(n) || n < min || n > max) ? fallback : n;
};
const isSafeUri     = (u) => typeof u === 'string' && (u.startsWith('blob:') || u.startsWith('data:image/'));
const genId         = () => Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
const getStatusOpt  = (id) => STATUS_OPTIONS.find(o => o.id === id) || STATUS_OPTIONS[0];
const todayISO      = () => new Date().toISOString().slice(0, 10);
const todayLocal    = () => new Date().toLocaleDateString('es-PE');
const getFiringTypes = (cfg) => cfg.firingTypes?.length ? cfg.firingTypes : DEFAULT_FIRING_TYPES;

/* ─── WhatsApp share helper ──────────────────────────────────────────────── */
function openWhatsApp(text) {
  const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
  if (navigator.share) {
    navigator.share({ title: 'Precio de Quema', text }).catch(() => window.open(url, '_blank'));
  } else {
    window.open(url, '_blank');
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
   SHARED COMPONENTS
═══════════════════════════════════════════════════════════════════════════ */
function Navbar({ title, onBack, actionLabel, onAction, light }) {
  return (
    <div style={{ ...s.navbar, ...(light ? { backgroundColor: C.primaryDk, borderBottom: 'none' } : {}) }}>
      {onBack && (
        <button style={s.navBackBtn} onClick={onBack}>
          <span style={{ ...s.navBackText, ...(light ? { color: C.white } : {}) }}>←</span>
        </button>
      )}
      <span style={{ ...s.navTitle, ...(light ? { color: C.white } : {}) }}>{title}</span>
      {actionLabel && (
        <button style={{ ...s.navActionBtn, ...(light ? { backgroundColor: 'rgba(255,255,255,0.2)' } : {}) }} onClick={onAction}>
          <span style={{ ...s.navActionText, ...(light ? { color: C.white } : {}) }}>{actionLabel}</span>
        </button>
      )}
    </div>
  );
}

function AlertModal({ alertData, setAlertData }) {
  if (!alertData) return null;
  return (
    <div style={s.overlay}>
      <div style={s.alertBox}>
        <p style={s.alertTitle}>{alertData.title}</p>
        <p style={s.alertMsg}>{alertData.message}</p>
        <button style={s.btnPrimary} onClick={() => setAlertData(null)}>OK</button>
      </div>
    </div>
  );
}

function PinModal({ showPin, pinInput, setPinInput, pinError, setPinError, onSubmit, onCancel }) {
  if (!showPin) return null;
  return (
    <div style={s.overlay}>
      <div style={s.pinBox}>
        <p style={s.pinTitle}>🔒 Acceso de Administrador</p>
        <p style={s.pinSub}>Ingresa el PIN para acceder a la configuración</p>
        <input
          style={{ ...s.pinInput, ...(pinError ? { borderColor: '#CC0000' } : {}) }}
          type="password" inputMode="numeric" maxLength={4} value={pinInput} autoFocus
          onChange={e => { setPinInput(e.target.value.replace(/\D/g, '')); setPinError(false); }}
          placeholder="••••" onKeyDown={e => e.key === 'Enter' && onSubmit()}
        />
        {pinError && <p style={s.pinErr}>PIN incorrecto. Inténtalo de nuevo.</p>}
        <button style={s.btnPrimary} onClick={onSubmit}>Entrar</button>
        <button style={{ ...s.btnOutline, marginTop: 0 }} onClick={onCancel}>Cancelar</button>
        <p style={s.pinHint}>PIN por defecto: 1234</p>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   HOME
═══════════════════════════════════════════════════════════════════════════ */
function HomeScreen({ cfg, history, goToAdmin, setScreen }) {
  const fts = getFiringTypes(cfg);
  const kc  = clampNum(cfg.KC, 1, 99999, 1);
  return (
    <div style={s.screen}>
      <div style={s.homeHeader}>
        <h1 style={s.homeTitle}>Precio de Quema</h1>
        <p style={s.homeSub}>Calculadora de costos de horno</p>
      </div>
      <div style={s.scrollArea}>
        <div style={s.menuGrid}>
          {[
            { e: '📸', l: 'Calcular Precio',  d: 'Foto + medidas',             fn: () => setScreen('calculator'), accent: C.primary   },
            { e: '⚙️', l: 'Configuración',    d: 'Parámetros del horno',       fn: goToAdmin,                     accent: C.primaryDk },
            { e: '📋', l: 'Historial',        d: `${history.length} trabajos`, fn: () => setScreen('history'),    accent: '#A0856B'   },
            { e: '🔥', l: 'Estado del Horno', d: 'Seguimiento de quemas',      fn: () => {},                      accent: C.orange    },
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
            <span style={s.cardTitle}>Tipos de Quema</span>
            <button style={s.editBtn} onClick={goToAdmin}><span style={s.editBtnText}>Editar</span></button>
          </div>
          <div style={s.divider} />
          {fts.map((ft, i) => {
            const pft = clampNum(ft.pft, 0, 99999, 0);
            return (
              <div key={ft.id} style={{ ...s.row, padding: '9px 0', borderBottom: i < fts.length - 1 ? `1px solid ${C.border}` : 'none' }}>
                <span style={s.summaryLabel}>🔥 {ft.name}</span>
                <div style={{ textAlign: 'right' }}>
                  <span style={s.summaryValue}>S/ {pft.toFixed(0)} PFT</span>
                  <span style={{ fontSize: 11, color: C.muted, display: 'block' }}>CL: S/ {(pft / kc).toFixed(4)}/L</span>
                </div>
              </div>
            );
          })}
          <div style={s.divider} />
          {[
            { label: 'Capacidad del Horno (KC)',  value: `${cfg.KC} L`  },
            { label: 'Factor de Conversión (FC)', value: `× ${cfg.CF}`  },
            { label: 'Margen de Ganancia (G)',    value: `${cfg.PR}%`   },
          ].map((item, i) => (
            <div key={i} style={{ ...s.row, padding: '7px 0', borderBottom: i < 2 ? `1px solid ${C.border}` : 'none' }}>
              <span style={s.summaryLabel}>{item.label}</span>
              <span style={s.summaryValue}>{item.value}</span>
            </div>
          ))}
        </div>
        <div style={{ ...s.card, margin: '0 16px 24px', backgroundColor: C.primaryXlt, border: `1px solid ${C.primaryLt}` }}>
          <span style={{ ...s.cardTitle, color: C.primaryDk, display: 'block', marginBottom: 8 }}>Fórmula</span>
          {['VP = H × W × D ÷ 1000', 'CL = PFT ÷ KC', 'Precio = VP × CL × FC × (1 + G%)'].map((f, i) => (
            <p key={i} style={{ ...s.formulaLine, borderBottom: i < 2 ? `1px solid ${C.primaryLt}` : 'none', paddingBottom: i < 2 ? 4 : 0, marginBottom: i < 2 ? 4 : 0 }}>{f}</p>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   ADMIN
═══════════════════════════════════════════════════════════════════════════ */
function AdminScreen({ cfg, setCfg, setScreen, showAlert }) {
  const [local, setLocal]     = useState(() => ({ ...cfg, firingTypes: getFiringTypes(cfg) }));
  const [newPin1, setNewPin1] = useState('');
  const [newPin2, setNewPin2] = useState('');
  const updL = (k, v) => setLocal(p => ({ ...p, [k]: v }));
  const updFT = (idx, field, value) =>
    setLocal(prev => { const t = [...prev.firingTypes]; t[idx] = { ...t[idx], [field]: value }; return { ...prev, firingTypes: t }; });
  const save = () => {
    if (newPin1 || newPin2) {
      if (!/^\d{4}$/.test(newPin1)) { showAlert('PIN inválido', 'El PIN debe tener exactamente 4 dígitos.'); return; }
      if (newPin1 !== newPin2) { showAlert('PIN no coincide', 'Los dos campos no coinciden.'); return; }
      local.pin = newPin1;
    }
    const kc = clampNum(local.KC, 1, 99999, null);
    const cf = clampNum(local.CF, 0.1, 100,  null);
    const pr = clampNum(local.PR, 0, 1000,   null);
    if (!kc || !cf || pr === null) { showAlert('Valores inválidos', 'Revisa los campos numéricos.'); return; }
    for (const ft of local.firingTypes)
      if (clampNum(ft.pft, 0, 99999, null) === null) { showAlert('PFT inválido', `Revisa el PFT de "${ft.name}".`); return; }
    setCfg({ ...local, KC: String(kc), CF: String(cf), PR: String(pr) });
    setScreen('home');
  };
  const kc = clampNum(local.KC, 1, 99999, 1);
  return (
    <div style={s.screen}>
      <Navbar title="Configuración" onBack={() => setScreen('home')} actionLabel="Guardar" onAction={save} />
      <div style={s.scrollArea}>
        <div style={{ padding: 16, paddingBottom: 40 }}>
          <div style={s.card}>
            <span style={s.cardTitle}>🔥 Tipos de Quema y PFT</span>
            <p style={s.cardSub}>PFT = Precio de Quema Total. El CL se calcula automáticamente.</p>
            {local.firingTypes.map((ft, idx) => (
              <div key={ft.id} style={{ marginBottom: idx < local.firingTypes.length - 1 ? 14 : 0, paddingBottom: idx < local.firingTypes.length - 1 ? 14 : 0, borderBottom: idx < local.firingTypes.length - 1 ? `1px solid ${C.border}` : 'none' }}>
                <div style={{ display: 'flex', gap: 10 }}>
                  <div style={{ flex: 1 }}>
                    <label style={s.label}>Nombre</label>
                    <input style={s.input} value={ft.name} maxLength={30} onChange={e => updFT(idx, 'name', e.target.value)} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={s.label}>PFT (S/)</label>
                    <div style={s.inputWrap}>
                      <input style={s.input} type="number" inputMode="decimal" value={ft.pft} maxLength={8}
                        onChange={e => updFT(idx, 'pft', e.target.value)} placeholder="400" />
                      <span style={s.unit}>S/</span>
                    </div>
                  </div>
                </div>
                <p style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>CL = S/ {(clampNum(ft.pft, 0, 99999, 0) / kc).toFixed(4)} / L</p>
              </div>
            ))}
          </div>
          <div style={s.card}>
            <span style={s.cardTitle}>Parámetros del Horno</span>
            <label style={s.label}>KC – Capacidad</label>
            <div style={s.inputWrap}><input style={s.input} type="number" inputMode="decimal" value={local.KC} maxLength={8} onChange={e => updL('KC', e.target.value)} placeholder="200" /><span style={s.unit}>L</span></div>
            <label style={{ ...s.label, marginTop: 14 }}>FC – Factor de Conversión</label>
            <div style={{ ...s.inputWrap, marginBottom: 4 }}><input style={s.input} type="number" inputMode="decimal" value={local.CF} maxLength={6} onChange={e => updL('CF', e.target.value)} placeholder="2" /><span style={s.unit}>×</span></div>
            <p style={s.hint}>Ajusta la densidad de piezas en el horno</p>
            <label style={{ ...s.label, marginTop: 14 }}>G – Margen de Ganancia</label>
            <div style={s.inputWrap}><input style={s.input} type="number" inputMode="decimal" value={local.PR} maxLength={6} onChange={e => updL('PR', e.target.value)} placeholder="30" /><span style={s.unit}>%</span></div>
          </div>
          <div style={s.card}>
            <span style={s.cardTitle}>🔒 Cambiar PIN</span>
            <p style={s.cardSub}>Deja en blanco para no cambiar el PIN actual.</p>
            <label style={s.label}>Nuevo PIN (4 dígitos)</label>
            <div style={{ ...s.inputWrap, marginBottom: 14 }}><input style={s.input} type="password" inputMode="numeric" maxLength={4} value={newPin1} onChange={e => setNewPin1(e.target.value.replace(/\D/g, ''))} placeholder="••••" /></div>
            <label style={s.label}>Confirmar PIN</label>
            <div style={s.inputWrap}><input style={s.input} type="password" inputMode="numeric" maxLength={4} value={newPin2} onChange={e => setNewPin2(e.target.value.replace(/\D/g, ''))} placeholder="••••" /></div>
          </div>
          <button style={s.btnPrimary} onClick={save}>Guardar Configuración</button>
          <button style={s.btnOutline} onClick={() => setScreen('home')}>Cancelar</button>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   CALCULATOR
═══════════════════════════════════════════════════════════════════════════ */
function CalculatorScreen({ cfg, meas, setMeas, photo, setPhoto, desc, setDesc, clientName, setClientName, firingTypeId, setFiringTypeId, status, setStatus, calculate, setScreen, liveVP, livePrice, getCL, fileInputRef, handleFileSelect }) {
  const vp    = liveVP();
  const price = livePrice();
  const fts   = getFiringTypes(cfg);
  return (
    <div style={s.screen}>
      <Navbar title="Calcular Precio" onBack={() => setScreen('home')} />
      <div style={s.scrollArea}>
        <div style={{ padding: 16, paddingBottom: 40 }}>
          <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFileSelect} />

          <div style={s.card}>
            <label style={s.label}>👤 Nombre del Cliente</label>
            <input style={s.input} placeholder="Ej. María García" value={clientName} onChange={e => setClientName(e.target.value)} maxLength={80} />
          </div>

          <div style={s.card}>
            <label style={s.label}>🔥 Tipo de Quema</label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
              {fts.map(ft => {
                const active = firingTypeId === ft.id;
                return (
                  <button key={ft.id}
                    style={{ padding: '8px 14px', borderRadius: 20, border: `2px solid ${active ? C.primary : C.border}`, backgroundColor: active ? C.primary : C.white, color: active ? C.white : C.text, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
                    onClick={() => setFiringTypeId(ft.id)}>
                    {ft.name} <span style={{ opacity: 0.75, fontSize: 11 }}>S/{clampNum(ft.pft, 0, 99999, 0).toFixed(0)}</span>
                  </button>
                );
              })}
            </div>
            {firingTypeId && (
              <div style={{ ...s.previewRow, marginTop: 10 }}>
                <div style={s.row}>
                  <span style={s.previewLabel}>Costo por Litro (CL)</span>
                  <span style={s.previewValue}>S/ {getCL(firingTypeId).toFixed(4)} / L</span>
                </div>
              </div>
            )}
          </div>

          <div style={s.card}>
            <label style={s.label}>📷 Foto de la Pieza (con regla en cm)</label>
            {photo ? (
              <><img src={photo} style={s.photoPreview} alt="Pieza" />
                <button style={{ ...s.btnOutline, marginTop: 8 }} onClick={() => fileInputRef.current?.click()}>Cambiar Foto</button></>
            ) : (
              <button style={s.photoPlaceholder} onClick={() => fileInputRef.current?.click()}>
                <span style={{ fontSize: 44 }}>📷</span>
                <span style={s.photoTitle}>Subir Foto</span>
                <span style={s.photoSub}>Coloca una regla en cm junto a la pieza</span>
              </button>
            )}
          </div>

          <div style={s.tipBox}>
            <p style={s.tipText}><strong>📐 Consejo: </strong>Ingresa las medidas con la regla. Se redondean al 0.5 cm más cercano.</p>
          </div>

          <div style={s.card}>
            <label style={s.label}>📐 Medidas (cm)</label>
            <div style={{ display: 'flex', gap: 10 }}>
              {[{ key: 'H', label: 'Alto' }, { key: 'W', label: 'Ancho' }, { key: 'D', label: 'Fondo' }].map(({ key, label }) => (
                <div key={key} style={{ flex: 1 }}>
                  <label style={{ ...s.label, textAlign: 'center', display: 'block' }}>{label}</label>
                  <div style={s.inputWrap}>
                    <input style={{ ...s.input, textAlign: 'center', paddingRight: 28 }}
                      type="number" inputMode="decimal" placeholder="0" maxLength={6}
                      value={meas[key]} onChange={e => setMeas(prev => ({ ...prev, [key]: e.target.value }))} />
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
            <label style={s.label}>🏺 Descripción (opcional)</label>
            <input style={s.input} placeholder="Ej. Tazón decorativo grande" value={desc} onChange={e => setDesc(e.target.value)} maxLength={100} />
          </div>

          <div style={s.card}>
            <label style={s.label}>📋 Estado de la Pieza</label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
              {STATUS_OPTIONS.map(opt => {
                const active = status === opt.id;
                return (
                  <button key={opt.id}
                    style={{ padding: '8px 14px', borderRadius: 20, border: `2px solid ${opt.color}`, backgroundColor: active ? opt.color : `${opt.color}18`, color: active ? C.white : opt.color, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                    onClick={() => setStatus(opt.id)}>
                    {opt.emoji} {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          <button style={s.btnPrimary} onClick={calculate}>Calcular Precio de Quema →</button>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   RESULT
═══════════════════════════════════════════════════════════════════════════ */
function ResultScreen({ result, cfg, setScreen, resetCalc, updateStatus }) {
  if (!result) return null;
  const { clientName, desc: d, photo: p, H, W, D, VP, PFT, CL, CF, PR, PR_mul, price, date, firingTypeId, status } = result;
  const fts       = getFiringTypes(cfg);
  const ft        = fts.find(t => t.id === firingTypeId) || fts[0];
  const statusOpt = getStatusOpt(status);

  const share = () => {
    const lines = [
      '🔥 *Precio de Quema*',
      clientName ? `👤 *Cliente:* ${clientName}` : null,
      `🏺 *Pieza:* ${d}`,
      `🔥 *Tipo:* ${ft?.name || firingTypeId}`,
      `📋 *Estado:* ${statusOpt.emoji} ${statusOpt.label}`,
      '',
      `📐 *Medidas:* ${H} × ${W} × ${D} cm`,
      `📦 *Volumen:* ${VP.toFixed(3)} L`,
      '',
      `💰 *PRECIO: S/ ${price.toFixed(2)}*`,
      `📅 ${date}`,
    ].filter(l => l !== null).join('\n');
    openWhatsApp(lines);
  };

  return (
    <div style={s.screen}>
      <Navbar title="Precio de Quema" onBack={() => setScreen('calculator')} actionLabel="Nueva" onAction={resetCalc} light />
      <div style={s.scrollArea}>
        <div style={s.resultHero}>
          {clientName && <p style={{ ...s.resultDesc, marginBottom: 4 }}>👤 {clientName}</p>}
          <p style={s.resultDesc}>{d}</p>
          <p style={s.resultPrice}>S/ {price.toFixed(2)}</p>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 8, flexWrap: 'wrap' }}>
            <span style={s.heroBadge}>🔥 {ft?.name}</span>
            <span style={s.heroBadge}>{statusOpt.emoji} {statusOpt.label}</span>
          </div>
          <p style={s.resultMeta}>{date} · incl. {PR}% de ganancia</p>
        </div>
        <div style={{ padding: 16 }}>
          <div style={s.card}>
            <label style={s.label}>📋 Actualizar Estado</label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
              {STATUS_OPTIONS.map(opt => {
                const active = status === opt.id;
                return (
                  <button key={opt.id}
                    style={{ padding: '8px 14px', borderRadius: 20, border: `2px solid ${opt.color}`, backgroundColor: active ? opt.color : `${opt.color}18`, color: active ? C.white : opt.color, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                    onClick={() => updateStatus(opt.id)}>{opt.emoji} {opt.label}</button>
                );
              })}
            </div>
          </div>
          {p && isSafeUri(p) && <div style={s.card}><img src={p} style={{ ...s.photoPreview, height: 200 }} alt={d} /></div>}
          <div style={s.card}>
            <span style={s.cardTitle}>Dimensiones</span>
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
              { label: 'Tipo de Quema',            formula: `PFT S/${PFT.toFixed(2)}`,                    value: ft?.name          },
              { label: 'Volumen (VP)',              formula: `(${H}×${W}×${D})÷1000`,                      value: `${VP.toFixed(4)} L` },
              { label: 'Costo por Litro (CL)',      formula: `S/${PFT.toFixed(2)}÷${cfg.KC}L`,             value: `S/${CL.toFixed(4)}/L` },
              { label: 'Factor de Conversión (FC)', formula: 'Ajuste densidad',                            value: `× ${CF}`         },
              { label: 'Margen de Ganancia (G)',    formula: `${PR}%`,                                     value: `× ${PR_mul.toFixed(2)}` },
            ].map((row, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '10px 0', borderBottom: i < 4 ? `1px solid ${C.border}` : 'none' }}>
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
                <p style={{ color: 'rgba(255,255,255,0.75)', fontSize: 13 }}>Precio Final</p>
                <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: 11, marginTop: 2 }}>VP × CL × FC × (1+{PR}%)</p>
              </div>
              <span style={{ color: C.white, fontSize: 30, fontWeight: 900 }}>S/ {price.toFixed(2)}</span>
            </div>
          </div>
          <button style={{ ...s.btnPrimary, backgroundColor: '#25D366' }} onClick={share}>📲 Enviar por WhatsApp</button>
          <div style={{ display: 'flex', gap: 12, paddingBottom: 24 }}>
            <button style={{ ...s.btnOutline, flex: 1, marginBottom: 0 }} onClick={resetCalc}>Nueva Pieza</button>
            <button style={{ ...s.btnPrimary, flex: 1, marginBottom: 0 }} onClick={() => setScreen('history')}>Historial</button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   HISTORY  — filters + multi-select
═══════════════════════════════════════════════════════════════════════════ */
function HistoryScreen({ history, setResult, setScreen, cfg, selectedIds, setSelectedIds, selectMode, setSelectMode }) {
  const [filterName,  setFilterName]  = useState('');
  const [filterMonth, setFilterMonth] = useState('');
  const fts = getFiringTypes(cfg);

  const filtered = history.filter(item => {
    const nameOk  = !filterName  || [item.clientName, item.desc].some(f => (f || '').toLowerCase().includes(filterName.toLowerCase()));
    const monthOk = !filterMonth || (item.rawDate || '').startsWith(filterMonth);
    return nameOk && monthOk;
  });

  const toggleItem = (id) =>
    setSelectedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const toggleAll = () => {
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map(i => i.id)));
    }
  };

  const cancelSelect = () => { setSelectMode(false); setSelectedIds(new Set()); };

  const selectedItems  = history.filter(i => selectedIds.has(i.id));
  const totalSelected  = selectedItems.reduce((s, i) => s + i.price, 0);
  const allSelected    = filtered.length > 0 && selectedIds.size === filtered.length;

  return (
    <div style={s.screen}>
      <Navbar
        title={selectMode ? `${selectedIds.size} seleccionadas` : 'Historial'}
        onBack={selectMode ? cancelSelect : () => setScreen('home')}
        actionLabel={selectMode ? 'Cancelar' : 'Seleccionar'}
        onAction={selectMode ? cancelSelect : () => setSelectMode(true)}
      />

      {/* ── Filter bar ── */}
      <div style={{ padding: '10px 12px', backgroundColor: C.white, borderBottom: `1px solid ${C.border}`, display: 'flex', gap: 8, flexShrink: 0 }}>
        <div style={{ flex: 2, position: 'relative' }}>
          <input
            style={{ ...s.input, padding: '9px 32px 9px 12px', fontSize: 14 }}
            placeholder="🔍 Buscar cliente o pieza…"
            value={filterName} onChange={e => setFilterName(e.target.value)}
          />
          {filterName && (
            <button style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: C.muted, fontSize: 18, lineHeight: 1 }}
              onClick={() => setFilterName('')}>×</button>
          )}
        </div>
        <input
          style={{ ...s.input, flex: 1, padding: '9px 10px', fontSize: 13, color: filterMonth ? C.dark : C.muted, minWidth: 0 }}
          type="month" value={filterMonth} onChange={e => setFilterMonth(e.target.value)}
          title="Filtrar por mes"
        />
        {filterMonth && (
          <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.muted, fontSize: 18, padding: '0 4px' }}
            onClick={() => setFilterMonth('')}>×</button>
        )}
      </div>

      {/* ── Select-all bar ── */}
      {selectMode && filtered.length > 0 && (
        <div style={{ padding: '8px 16px', backgroundColor: C.primaryXlt, borderBottom: `1px solid ${C.primaryLt}`, display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <button
            style={{ width: 22, height: 22, borderRadius: 6, border: `2px solid ${allSelected ? C.primary : C.muted}`, backgroundColor: allSelected ? C.primary : 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
            onClick={toggleAll}>
            {allSelected && <span style={{ color: C.white, fontSize: 13, fontWeight: 800 }}>✓</span>}
          </button>
          <span style={{ fontSize: 13, color: C.primaryDk, fontWeight: 600 }}>
            {allSelected ? 'Deseleccionar todo' : `Seleccionar todo (${filtered.length})`}
          </span>
        </div>
      )}

      <div style={s.scrollArea}>
        <div style={{ padding: 16, paddingBottom: selectMode && selectedIds.size > 0 ? 24 : 32 }}>
          {filtered.length === 0 ? (
            <div style={{ textAlign: 'center', paddingTop: 60 }}>
              <p style={{ fontSize: 48, marginBottom: 12 }}>{history.length === 0 ? '📭' : '🔍'}</p>
              <p style={{ fontWeight: 700, fontSize: 16, color: C.text, marginBottom: 6 }}>
                {history.length === 0 ? 'Sin trabajos aún' : 'Sin resultados'}
              </p>
              <p style={{ fontSize: 14, color: C.muted, marginBottom: 24 }}>
                {history.length === 0 ? 'Calcula el precio de tu primera pieza.' : 'Prueba con otro nombre o mes.'}
              </p>
              {history.length === 0 && <button style={s.btnPrimary} onClick={() => setScreen('calculator')}>Calcular Primera Pieza</button>}
            </div>
          ) : filtered.map(item => {
            const ft        = fts.find(t => t.id === item.firingTypeId);
            const statusOpt = getStatusOpt(item.status);
            const isSelected = selectedIds.has(item.id);
            return (
              <button key={item.id}
                style={{ ...s.card, width: '100%', textAlign: 'left', borderLeft: isSelected ? `4px solid ${C.primary}` : `4px solid transparent` }}
                onClick={() => selectMode ? toggleItem(item.id) : (setResult(item), setScreen('result'))}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  {selectMode && (
                    <div style={{ width: 22, height: 22, borderRadius: 6, border: `2px solid ${isSelected ? C.primary : C.border}`, backgroundColor: isSelected ? C.primary : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      {isSelected && <span style={{ color: C.white, fontSize: 13, fontWeight: 800 }}>✓</span>}
                    </div>
                  )}
                  <div style={{ flex: 1 }}>
                    {item.clientName && <p style={{ fontSize: 12, color: C.primary, fontWeight: 700, marginBottom: 2 }}>👤 {item.clientName}</p>}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div style={{ flex: 1, marginRight: 8 }}>
                        <p style={{ fontWeight: 700, fontSize: 15, color: C.dark, marginBottom: 4 }}>{item.desc}</p>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          {ft && <span style={{ fontSize: 11, color: C.muted }}>🔥 {ft.name}</span>}
                          <span style={{ fontSize: 11, color: statusOpt.color, fontWeight: 600 }}>{statusOpt.emoji} {statusOpt.label}</span>
                          <span style={{ fontSize: 11, color: C.muted }}>{item.date}</span>
                        </div>
                      </div>
                      <span style={{ fontSize: 20, fontWeight: 800, color: C.primary, whiteSpace: 'nowrap' }}>S/ {item.price.toFixed(2)}</span>
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Sticky selection bar ── */}
      {selectMode && selectedIds.size > 0 && (
        <div style={{ backgroundColor: C.primaryDk, padding: '14px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div>
            <p style={{ color: 'rgba(255,255,255,0.75)', fontSize: 12, margin: 0 }}>{selectedIds.size} pieza{selectedIds.size > 1 ? 's' : ''} seleccionada{selectedIds.size > 1 ? 's' : ''}</p>
            <p style={{ color: C.white, fontSize: 20, fontWeight: 800, margin: 0 }}>S/ {totalSelected.toFixed(2)}</p>
          </div>
          <button
            style={{ backgroundColor: C.white, color: C.primaryDk, border: 'none', borderRadius: 12, padding: '10px 18px', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}
            onClick={() => setScreen('summary')}>
            Ver Resumen →
          </button>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   SUMMARY  — totals + WhatsApp
═══════════════════════════════════════════════════════════════════════════ */
function SummaryScreen({ history, selectedIds, cfg, setScreen, setSelectedIds, setSelectMode }) {
  const items    = history.filter(i => selectedIds.has(i.id));
  const total    = items.reduce((s, i) => s + i.price, 0);
  const fts      = getFiringTypes(cfg);
  const clients  = [...new Set(items.map(i => i.clientName).filter(Boolean))];
  const clientLabel = clients.length === 1 ? clients[0] : clients.length > 1 ? `${clients.length} clientes` : 'Sin nombre';

  const back = () => { setSelectedIds(new Set()); setSelectMode(false); setScreen('history'); };

  const share = () => {
    const lines = [
      '🔥 *Resumen de Quema*',
      clients.length === 1 ? `👤 *Cliente:* ${clients[0]}` : clients.length > 1 ? `👥 *Clientes:* ${clients.join(', ')}` : null,
      '',
      ...items.map(item => {
        const ft = fts.find(t => t.id === item.firingTypeId);
        return `🏺 ${item.desc}${ft ? ` (${ft.name})` : ''} — *S/ ${item.price.toFixed(2)}*`;
      }),
      '',
      `💰 *TOTAL: S/ ${total.toFixed(2)}*`,
      `📋 ${items.length} pieza${items.length > 1 ? 's' : ''}`,
      `📅 ${todayLocal()}`,
    ].filter(l => l !== null).join('\n');
    openWhatsApp(lines);
  };

  if (items.length === 0) { setScreen('history'); return null; }

  return (
    <div style={s.screen}>
      <Navbar title="Resumen de Piezas" onBack={back} />
      <div style={s.scrollArea}>
        <div style={{ ...s.resultHero }}>
          <p style={s.resultDesc}>{clientLabel}</p>
          <p style={s.resultPrice}>S/ {total.toFixed(2)}</p>
          <p style={s.resultMeta}>{items.length} pieza{items.length > 1 ? 's' : ''} seleccionada{items.length > 1 ? 's' : ''}</p>
        </div>
        <div style={{ padding: 16 }}>
          <div style={s.card}>
            <span style={s.cardTitle}>Piezas Incluidas</span>
            <div style={{ marginTop: 8 }}>
              {items.map((item, i) => {
                const ft        = fts.find(t => t.id === item.firingTypeId);
                const statusOpt = getStatusOpt(item.status);
                return (
                  <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '10px 0', borderBottom: i < items.length - 1 ? `1px solid ${C.border}` : 'none' }}>
                    <div style={{ flex: 1, marginRight: 10 }}>
                      {item.clientName && <p style={{ fontSize: 11, color: C.primary, fontWeight: 700, marginBottom: 2 }}>👤 {item.clientName}</p>}
                      <p style={{ fontSize: 14, fontWeight: 600, color: C.dark, marginBottom: 3 }}>{item.desc}</p>
                      <div style={{ display: 'flex', gap: 8 }}>
                        {ft && <span style={{ fontSize: 11, color: C.muted }}>🔥 {ft.name}</span>}
                        <span style={{ fontSize: 11, color: statusOpt.color }}>{statusOpt.emoji} {statusOpt.label}</span>
                        <span style={{ fontSize: 11, color: C.muted }}>{item.date}</span>
                      </div>
                    </div>
                    <span style={{ fontSize: 16, fontWeight: 800, color: C.primary, whiteSpace: 'nowrap' }}>S/ {item.price.toFixed(2)}</span>
                  </div>
                );
              })}
            </div>
          </div>

          <div style={{ ...s.card, backgroundColor: C.primary }}>
            <div style={s.row}>
              <div>
                <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: 14 }}>Total ({items.length} piezas)</p>
                {clients.length === 1 && <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12, marginTop: 2 }}>👤 {clients[0]}</p>}
              </div>
              <span style={{ color: C.white, fontSize: 28, fontWeight: 900 }}>S/ {total.toFixed(2)}</span>
            </div>
          </div>

          <button style={{ ...s.btnPrimary, backgroundColor: '#25D366' }} onClick={share}>📲 Enviar Total por WhatsApp</button>
          <button style={s.btnOutline} onClick={back}>← Volver al Historial</button>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   APP
═══════════════════════════════════════════════════════════════════════════ */
export default function App() {
  const [cfg, setCfg]             = useState(DEFAULT_CFG);
  const [cfgLoaded, setCfgLoaded] = useState(false);
  const [screen, setScreen]       = useState('home');

  // Calculator fields
  const [photo, setPhoto]               = useState(null);
  const [desc, setDesc]                 = useState('');
  const [meas, setMeas]                 = useState({ H: '', W: '', D: '' });
  const [clientName, setClientName]     = useState('');
  const [firingTypeId, setFiringTypeId] = useState('esmalte');
  const [status, setStatus]             = useState('pendiente');

  // Results
  const [result, setResult]   = useState(null);
  const [history, setHistory] = useState([]);

  // Multi-select (history)
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [selectMode, setSelectMode]   = useState(false);

  // PIN + Alert
  const [showPin, setShowPin]     = useState(false);
  const [pinInput, setPinInput]   = useState('');
  const [pinError, setPinError]   = useState(false);
  const [alertData, setAlertData] = useState(null);

  const fileInputRef = useRef(null);

  /* ── localStorage ─────────────────────────────────────────────────────── */
  useEffect(() => {
    try {
      const c = localStorage.getItem(CFG_KEY);
      if (c) { const p = JSON.parse(c); setCfg({ ...DEFAULT_CFG, ...p, firingTypes: p.firingTypes?.length ? p.firingTypes : DEFAULT_FIRING_TYPES }); }
      const h = localStorage.getItem(HIST_KEY);
      if (h) setHistory(JSON.parse(h).map(i => ({ ...i, photo: null })));
    } catch (_) {}
    setCfgLoaded(true);
  }, []);

  useEffect(() => { if (cfgLoaded) localStorage.setItem(CFG_KEY,  JSON.stringify(cfg)); }, [cfg, cfgLoaded]);
  useEffect(() => { if (cfgLoaded) localStorage.setItem(HIST_KEY, JSON.stringify(history.map(i => ({ ...i, photo: null })))); }, [history, cfgLoaded]);
  useEffect(() => { return () => { if (photo?.startsWith('blob:')) URL.revokeObjectURL(photo); }; }, [photo]);

  /* ── Computed ─────────────────────────────────────────────────────────── */
  const getFT    = (typeId = firingTypeId) => getFiringTypes(cfg).find(t => t.id === typeId) || getFiringTypes(cfg)[0];
  const getPFT   = (typeId = firingTypeId) => clampNum(getFT(typeId)?.pft, 0, 99999, 400);
  const getCL    = (typeId = firingTypeId) => getPFT(typeId) / clampNum(cfg.KC, 1, 99999, 1);
  const liveVP   = () => {
    const H = clampNum(meas.H, 0.1, 500, null), W = clampNum(meas.W, 0.1, 500, null), D = clampNum(meas.D, 0.1, 500, null);
    if (H === null || W === null || D === null) return null;
    return (roundUp05(H) * roundUp05(W) * roundUp05(D)) / 1000;
  };
  const livePrice = () => {
    const vp = liveVP(); if (vp === null) return null;
    return vp * getCL() * clampNum(cfg.CF, 0.1, 100, 1) * (1 + clampNum(cfg.PR, 0, 1000, 0) / 100);
  };

  /* ── Handlers ─────────────────────────────────────────────────────────── */
  const showAlert = (title, message) => setAlertData({ title, message });
  const goToAdmin = () => { setPinInput(''); setPinError(false); setShowPin(true); };
  const submitPin = () => {
    if (pinInput === cfg.pin) { setShowPin(false); setPinInput(''); setPinError(false); setScreen('admin'); }
    else { setPinError(true); setPinInput(''); }
  };
  const handleFileSelect = (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    if (!file.type.startsWith('image/')) { showAlert('Imagen no válida', 'Solo se permiten archivos de imagen.'); return; }
    if (photo?.startsWith('blob:')) URL.revokeObjectURL(photo);
    setPhoto(URL.createObjectURL(file)); e.target.value = '';
  };

  const calculate = () => {
    try {
      const rawH = clampNum(meas.H, 0.1, 500, null), rawW = clampNum(meas.W, 0.1, 500, null), rawD = clampNum(meas.D, 0.1, 500, null);
      if (rawH === null || rawW === null || rawD === null) { showAlert('Medidas inválidas', 'Ingresa valores positivos para Alto, Ancho y Fondo (máx. 500 cm).'); return; }
      const H = roundUp05(rawH), W = roundUp05(rawW), D = roundUp05(rawD);
      const PFT = getPFT(), CL = getCL(), CF = clampNum(cfg.CF, 0.1, 100, 1), PR = clampNum(cfg.PR, 0, 1000, 0);
      const VP = (H * W * D) / 1000, PR_mul = 1 + PR / 100, price = VP * CL * CF * PR_mul;
      if (!isFinite(price) || price < 0) { showAlert('Error de cálculo', 'El resultado no es válido. Revisa la configuración.'); return; }
      const res = {
        id: genId(), rawDate: todayISO(), date: todayLocal(),
        clientName: (clientName || '').slice(0, 80),
        desc: (desc || 'Pieza de cerámica').slice(0, 100),
        photo: isSafeUri(photo) ? photo : null,
        firingTypeId, status, H, W, D, VP, PFT, CL, CF, PR_mul, PR: cfg.PR, price,
      };
      setResult(res);
      setHistory(prev => [res, ...prev.slice(0, 49)]);
      setScreen('result');
    } catch (_) { showAlert('Error inesperado', 'Ocurrió un problema al calcular. Por favor intenta de nuevo.'); }
  };

  const resetCalc = () => {
    setMeas({ H: '', W: '', D: '' });
    if (photo?.startsWith('blob:')) URL.revokeObjectURL(photo);
    setPhoto(null); setDesc(''); setClientName(''); setFiringTypeId('esmalte'); setStatus('pendiente');
    setScreen('calculator');
  };

  const updateStatus = (newStatus) => {
    const updated = { ...result, status: newStatus };
    setResult(updated);
    setHistory(prev => prev.map(i => i.id === result.id ? { ...i, status: newStatus } : i));
  };

  /* ── Render ───────────────────────────────────────────────────────────── */
  const showNav = ['home', 'calculator', 'history'].includes(screen);

  return (
    <div style={s.root}>
      <div style={s.appShell}>
        {screen === 'home'       && <HomeScreen cfg={cfg} history={history} goToAdmin={goToAdmin} setScreen={setScreen} />}
        {screen === 'admin'      && <AdminScreen cfg={cfg} setCfg={setCfg} setScreen={setScreen} showAlert={showAlert} />}
        {screen === 'calculator' && (
          <CalculatorScreen cfg={cfg} meas={meas} setMeas={setMeas} photo={photo} setPhoto={setPhoto}
            desc={desc} setDesc={setDesc} clientName={clientName} setClientName={setClientName}
            firingTypeId={firingTypeId} setFiringTypeId={setFiringTypeId} status={status} setStatus={setStatus}
            calculate={calculate} setScreen={setScreen} liveVP={liveVP} livePrice={livePrice} getCL={getCL}
            fileInputRef={fileInputRef} handleFileSelect={handleFileSelect} />
        )}
        {screen === 'result'  && <ResultScreen result={result} cfg={cfg} setScreen={setScreen} resetCalc={resetCalc} updateStatus={updateStatus} />}
        {screen === 'history' && (
          <HistoryScreen history={history} setResult={setResult} setScreen={setScreen} cfg={cfg}
            selectedIds={selectedIds} setSelectedIds={setSelectedIds} selectMode={selectMode} setSelectMode={setSelectMode} />
        )}
        {screen === 'summary' && (
          <SummaryScreen history={history} selectedIds={selectedIds} cfg={cfg}
            setScreen={setScreen} setSelectedIds={setSelectedIds} setSelectMode={setSelectMode} />
        )}

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
                <span style={{ ...s.navLabel, ...(screen === item.k ? { color: C.primary } : {}) }}>{item.l}</span>
              </button>
            ))}
          </nav>
        )}

        <PinModal showPin={showPin} pinInput={pinInput} setPinInput={setPinInput} pinError={pinError} setPinError={setPinError}
          onSubmit={submitPin} onCancel={() => { setShowPin(false); setPinInput(''); setPinError(false); }} />
        <AlertModal alertData={alertData} setAlertData={setAlertData} />
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   STYLES
═══════════════════════════════════════════════════════════════════════════ */
const s = {
  root:     { minHeight: '100vh', backgroundColor: '#E8DDD8', display: 'flex', justifyContent: 'center' },
  appShell: { width: '100%', maxWidth: 430, backgroundColor: C.bg, minHeight: '100vh', display: 'flex', flexDirection: 'column', position: 'relative', boxShadow: '0 0 60px rgba(0,0,0,0.15)' },
  screen:   { flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' },
  scrollArea: { flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch' },
  row:      { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  divider:  { height: 1, backgroundColor: C.border, margin: '10px 0' },

  homeHeader: { padding: '18px 24px 14px', backgroundColor: C.primaryDk, flexShrink: 0 },
  homeTitle:  { fontSize: 22, fontWeight: 800, color: C.white, marginBottom: 2 },
  homeSub:    { fontSize: 13, color: 'rgba(255,255,255,0.8)' },
  menuGrid:   { display: 'flex', flexWrap: 'wrap', padding: 12, gap: 12 },
  menuCard:   { width: 'calc(50% - 6px)', backgroundColor: C.white, borderRadius: 16, padding: 16, display: 'flex', flexDirection: 'column', alignItems: 'center', boxShadow: '0 2px 6px rgba(0,0,0,0.06)', cursor: 'pointer', textAlign: 'center', borderLeft: 'none', borderRight: 'none', borderBottom: 'none' },
  menuLabel:  { fontSize: 13, fontWeight: 700, color: C.dark, marginBottom: 3, display: 'block' },
  menuDesc:   { fontSize: 11, color: C.muted, display: 'block' },

  navbar:       { display: 'flex', alignItems: 'center', padding: 12, backgroundColor: C.white, borderBottom: `1px solid ${C.border}`, flexShrink: 0 },
  navBackBtn:   { background: 'none', border: 'none', padding: 6, marginRight: 4, cursor: 'pointer' },
  navBackText:  { fontSize: 24, color: C.primary, lineHeight: 1 },
  navTitle:     { flex: 1, fontSize: 17, fontWeight: 700, color: C.dark },
  navActionBtn: { backgroundColor: C.primaryXlt, border: 'none', borderRadius: 8, padding: '6px 12px', cursor: 'pointer' },
  navActionText:{ fontSize: 13, fontWeight: 700, color: C.primary },

  card:       { backgroundColor: C.white, borderRadius: 16, padding: 18, marginBottom: 14, boxShadow: '0 2px 6px rgba(0,0,0,0.05)' },
  cardTitle:  { fontSize: 15, fontWeight: 700, color: C.dark, marginBottom: 4, display: 'block' },
  cardSub:    { fontSize: 13, color: C.muted, marginTop: 4, marginBottom: 14 },
  editBtn:    { backgroundColor: C.primaryXlt, border: 'none', borderRadius: 6, padding: '4px 10px', cursor: 'pointer' },
  editBtnText:{ fontSize: 12, fontWeight: 700, color: C.primary },

  summaryLabel: { fontSize: 13, color: C.muted, flex: 1 },
  summaryValue: { fontSize: 13, fontWeight: 700, color: C.dark },
  formulaLine:  { fontFamily: 'monospace', fontSize: 12, color: C.primaryDk, padding: '4px 0', display: 'block' },

  label:      { fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 6, display: 'block' },
  inputWrap:  { position: 'relative', display: 'flex', alignItems: 'center', marginBottom: 4 },
  input:      { width: '100%', border: `1.5px solid ${C.border}`, borderRadius: 10, padding: '12px 48px 12px 14px', fontSize: 16, color: C.dark, backgroundColor: C.white, outline: 'none', boxSizing: 'border-box' },
  unit:       { position: 'absolute', right: 14, fontSize: 13, fontWeight: 700, color: C.muted, pointerEvents: 'none' },
  hint:       { fontSize: 12, color: C.muted, margin: '2px 0 4px' },
  previewRow:   { backgroundColor: C.primaryXlt, borderRadius: 10, padding: 10, marginTop: 8 },
  previewLabel: { fontSize: 13, color: C.muted, flex: 1 },
  previewValue: { fontSize: 14, fontWeight: 700, color: C.primary },

  tipBox:          { backgroundColor: C.amberLt, borderRadius: 12, padding: 12, marginBottom: 14, border: '1px solid #F59E0B33' },
  tipText:         { fontSize: 13, color: '#92400E' },
  photoPreview:    { width: '100%', borderRadius: 12, height: 240, objectFit: 'cover', marginBottom: 8 },
  photoPlaceholder:{ border: `2px dashed ${C.border}`, borderRadius: 14, padding: 32, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, backgroundColor: C.bg, cursor: 'pointer', width: '100%', boxSizing: 'border-box' },
  photoTitle:      { fontWeight: 700, color: C.dark, fontSize: 15 },
  photoSub:        { fontSize: 13, color: C.muted },

  btnPrimary:  { backgroundColor: C.primary, border: 'none', borderRadius: 14, padding: '16px 24px', width: '100%', fontSize: 16, fontWeight: 700, color: C.white, marginBottom: 10, cursor: 'pointer', textAlign: 'center', boxSizing: 'border-box', display: 'block' },
  btnOutline:  { border: `2px solid ${C.primary}`, borderRadius: 14, padding: '14px 24px', width: '100%', fontSize: 15, fontWeight: 700, color: C.primary, marginBottom: 10, cursor: 'pointer', textAlign: 'center', backgroundColor: C.white, boxSizing: 'border-box', display: 'block' },

  resultHero:  { padding: '28px 24px', textAlign: 'center', backgroundColor: C.primaryDk, flexShrink: 0 },
  resultDesc:  { fontSize: 13, color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 },
  resultPrice: { fontSize: 54, fontWeight: 900, color: C.white, letterSpacing: -1, marginBottom: 4 },
  resultMeta:  { fontSize: 13, color: 'rgba(255,255,255,0.65)', marginTop: 8 },
  heroBadge:   { backgroundColor: 'rgba(255,255,255,0.2)', color: C.white, borderRadius: 20, padding: '4px 12px', fontSize: 12, fontWeight: 600 },

  bottomNav:  { display: 'flex', backgroundColor: C.white, borderTop: `1px solid ${C.border}`, flexShrink: 0 },
  navItem:    { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '10px 0 8px', background: 'none', border: 'none', cursor: 'pointer' },
  navLabel:   { fontSize: 10, fontWeight: 700, color: C.muted, marginTop: 3, letterSpacing: '0.3px' },

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
