"use client";

import { useState, useRef, useCallback, useEffect } from "react";

// ─── Web Speech API types ─────────────────────────────────────────────────────
interface ISpeechRecognition extends EventTarget {
  lang: string; continuous: boolean; interimResults: boolean;
  onresult: (e: ISpeechRecognitionEvent) => void;
  onerror: (e: ISpeechRecognitionErrorEvent) => void;
  onend: () => void; start: () => void; stop: () => void; abort: () => void;
}
interface ISpeechRecognitionEvent {
  results: { length: number; [i: number]: { isFinal: boolean; [i: number]: { transcript: string } } };
}
interface ISpeechRecognitionErrorEvent { error: string }
declare global {
  interface Window {
    SpeechRecognition?: new () => ISpeechRecognition;
    webkitSpeechRecognition?: new () => ISpeechRecognition;
  }
}

// ─── Domain types ─────────────────────────────────────────────────────────────
export interface Patient {
  id: number; firstName: string; fullName: string; lastName: string;
  birthDate: string; sex: string; avatar: null;
  hospitalization: { room: string; bed: { name: string } };
}

type FieldValidation = "number" | "bloodpressure" | "percent" | "integer" | "text";

interface FichaField {
  key: string; label: string; hint: string;
  multiline?: boolean;
  unit?: string;
  numeric?: boolean;
  validation?: FieldValidation;
  validationRange?: [number, number];
}

// ─── Field validation ─────────────────────────────────────────────────────────
function validateField(field: FichaField, raw: string): string | null {
  const v = raw.trim();
  if (!v) return null;

  if (field.validation === "bloodpressure") {
    const m = v.match(/^(\d{1,3})\s*[\/\-sobre]\s*(\d{1,3})$/i);
    if (!m) return `Formato inválido. Usá sistólica/diastólica (ej: 120/80)`;
    const [s, d] = [+m[1], +m[2]];
    if (s < 60 || s > 300) return `Sistólica fuera de rango (60–300)`;
    if (d < 30 || d > 200) return `Diastólica fuera de rango (30–200)`;
    if (d >= s) return `Diastólica debe ser menor que sistólica`;
    return null;
  }

  if (field.validation === "number" || field.validation === "integer") {
    const n = Number(v.replace(",", "."));
    if (isNaN(n) || v === "") return `Debe ser un número. Recibido: "${v}"`;
    if (field.validation === "integer" && !Number.isInteger(n)) return `Debe ser un número entero`;
    if (n < 0) return `El valor no puede ser negativo`;
    if (field.validationRange) {
      const [min, max] = field.validationRange;
      if (n < min || n > max) return `Valor fuera de rango (${min}–${max} ${field.unit ?? ""})`;
    }
    return null;
  }

  if (field.validation === "percent") {
    const n = Number(v.replace(",", ".").replace("%", ""));
    if (isNaN(n)) return `Debe ser un número entre 0 y 100`;
    if (n < 0 || n > 100) return `Porcentaje fuera de rango (0–100)`;
    return null;
  }

  return null;
}


interface FichaDefinition {
  id: string; title: string; icon: string; color: string;
  fields: FichaField[];
}

type FieldValues = Record<string, string>;

interface SavedFicha {
  id: string; fichaId: string; fichaTitle: string; fichaIcon: string; fichaColor: string;
  patientId: number; values: FieldValues; fields: FichaField[]; date: string;
}

// ─── Fichas definitions ───────────────────────────────────────────────────────
const FICHAS: FichaDefinition[] = [
  {
    id: "evolucion", title: "Evolución General", icon: "📋", color: "#3b82f6",
    fields: [
      { key: "subjetivo",  label: "Subjetivo",  hint: "ej: el paciente refiere dolor leve" },
      { key: "objetivo",   label: "Objetivo",   hint: "ej: paciente lúcido, orientado en tiempo y espacio" },
      { key: "evaluacion", label: "Evaluación", hint: "ej: evolución favorable, sin signos de infección" },
      { key: "plan",       label: "Plan",       hint: "ej: continuar con el tratamiento actual", multiline: true },
    ],
  },
  {
    id: "signos_vitales", title: "Signos Vitales", icon: "❤️", color: "#ef4444",
    fields: [
      { key: "presion",       label: "Presión arterial",   hint: "dictá solo los números: 120 sobre 80", unit: "mmHg", numeric: true, validation: "bloodpressure" },
      { key: "fc",            label: "Frec. cardíaca",     hint: "dictá solo el número: 92",             unit: "lpm",  numeric: true, validation: "integer", validationRange: [20, 300] as [number,number] },
      { key: "fr",            label: "Frec. respiratoria", hint: "dictá solo el número: 18",             unit: "rpm",  numeric: true, validation: "integer", validationRange: [4, 60]  as [number,number] },
      { key: "temperatura",   label: "Temperatura",        hint: "dictá solo el número: 37.5",          unit: "°C",   numeric: true, validation: "number",  validationRange: [30, 43] as [number,number] },
      { key: "saturacion",    label: "Saturación O₂",      hint: "dictá solo el número: 98",            unit: "%",    numeric: true, validation: "percent" },
      { key: "peso",          label: "Peso",               hint: "dictá solo el número: 72",            unit: "kg",   numeric: true, validation: "number",  validationRange: [1, 350] as [number,number] },
      { key: "observaciones", label: "Observaciones",      hint: "ej: paciente estable sin alteraciones", multiline: true },
    ],
  },
  {
    id: "indicaciones", title: "Indicaciones Médicas", icon: "💊", color: "#8b5cf6",
    fields: [
      { key: "dieta",          label: "Dieta",          hint: "ej: dieta blanda hiposódica" },
      { key: "via",            label: "Vía / Accesos",  hint: "ej: vía periférica en miembro superior derecho permeable" },
      { key: "medicacion",     label: "Medicación",     hint: "ej: amoxicilina 500mg cada 8 horas vía oral", multiline: true },
      { key: "estudios",       label: "Estudios",       hint: "ej: hemograma completo y radiografía de tórax", multiline: true },
      { key: "interconsultas", label: "Interconsultas", hint: "ej: cardiología para evaluación" },
      { key: "observaciones",  label: "Observaciones",  hint: "ej: reevaluar en 12 horas", multiline: true },
    ],
  },
  {
    id: "enfermeria", title: "Valoración de Enfermería", icon: "🩺", color: "#10b981",
    fields: [
      { key: "estado_general", label: "Estado general",       hint: "ej: paciente tranquilo, colaborador" },
      { key: "piel_mucosas",   label: "Piel y mucosas",       hint: "ej: piel hidratada, sin lesiones visibles" },
      { key: "dolor",          label: "Dolor (EVA 0-10)",     hint: "dictá solo el número: 3", unit: "/ 10", numeric: true, validation: "integer", validationRange: [0, 10] as [number,number] },
      { key: "heridas",        label: "Heridas / Curaciones", hint: "ej: herida quirúrgica limpia sin signos de infección" },
      { key: "eliminacion",    label: "Eliminación",          hint: "ej: diuresis conservada, deposiciones presentes" },
      { key: "movilidad",      label: "Movilidad",            hint: "ej: deambula con asistencia" },
      { key: "observaciones",  label: "Observaciones",        hint: "ej: familiar presente, buen acompañamiento", multiline: true },
    ],
  },
];

// ─── localStorage helpers ─────────────────────────────────────────────────────
const LS_KEY = "internment_fichas_v1";
function loadFichas(): SavedFicha[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(LS_KEY) ?? "[]"); } catch { return []; }
}
function saveFichaToLS(ficha: SavedFicha): void {
  const all = loadFichas();
  all.unshift(ficha);
  localStorage.setItem(LS_KEY, JSON.stringify(all));
}
function getFichasForPatient(patientId: number): SavedFicha[] {
  return loadFichas().filter(f => f.patientId === patientId);
}
function uuid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function getSpeechRecognitionCtor(): (new () => ISpeechRecognition) | null {
  if (typeof window === "undefined") return null;
  return window.SpeechRecognition ?? window.webkitSpeechRecognition ?? null;
}
function getAge(birthDate: string) {
  if (!birthDate) return "";
  const birth = new Date(birthDate);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return `${age} años`;
}
function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("es-AR", {
    weekday: "short", day: "numeric", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

// ─── useSpeechRecognition ─────────────────────────────────────────────────────
function useSpeechRecognition(onFinalResult: (text: string, stop: () => void) => void) {
  const [isRecording, setIsRecording] = useState(false);
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<ISpeechRecognition | null>(null);
  const shouldRestartRef = useRef(false);
  const lastResultIndexRef = useRef(0);
  const onFinalRef = useRef(onFinalResult);
  useEffect(() => { onFinalRef.current = onFinalResult; }, [onFinalResult]);

  const stop = useCallback(() => {
    shouldRestartRef.current = false; recognitionRef.current?.stop();
    setIsRecording(false); setInterim("");
  }, []);

  const buildRecognition = useCallback((): ISpeechRecognition | null => {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) return null;
    const r = new Ctor();
    r.lang = "es-AR"; r.continuous = false; r.interimResults = true;
    r.onresult = (e: ISpeechRecognitionEvent) => {
      let finalText = ""; let interimText = "";
      for (let i = lastResultIndexRef.current; i < e.results.length; i++) {
        if (e.results[i].isFinal) { finalText += e.results[i][0].transcript + " "; lastResultIndexRef.current = i + 1; }
        else interimText += e.results[i][0].transcript;
      }
      if (finalText) onFinalRef.current(finalText.trim(), stop);
      setInterim(interimText);
    };
    r.onerror = (e: ISpeechRecognitionErrorEvent) => {
      if (e.error !== "aborted") { setError(e.error); shouldRestartRef.current = false; setIsRecording(false); }
    };
    r.onend = () => {
      setInterim("");
      if (shouldRestartRef.current) {
        try {
          lastResultIndexRef.current = 0;
          const next = buildRecognition();
          if (next) { next.start(); recognitionRef.current = next; }
        } catch { setIsRecording(false); shouldRestartRef.current = false; }
      } else setIsRecording(false);
    };
    return r;
  }, [stop]);

  const start = useCallback(() => {
    if (!getSpeechRecognitionCtor()) { setError("not-supported"); return; }
    setError(null); shouldRestartRef.current = true; lastResultIndexRef.current = 0;
    const r = buildRecognition(); if (!r) return;
    recognitionRef.current = r;
    try { r.start(); setIsRecording(true); } catch { setError("start-failed"); }
  }, [buildRecognition]);

  return { isRecording, interim, error, supported: !!getSpeechRecognitionCtor(), start, stop };
}

// ─── Icons ────────────────────────────────────────────────────────────────────
const BedIcon   = () => <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><path d="M2 3v18h2v-3h16v3h2V3h-2v10H4V3H2zm4 4h12v4H6V7z"/></svg>;
const RoomIcon  = () => <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><path d="M19 19V4a1 1 0 0 0-1-1H6a1 1 0 0 0-1 1v15H3v2h18v-2h-2zm-8-7a1 1 0 1 1 2 0 1 1 0 0 1-2 0zM7 5h10v14H7V5z"/></svg>;
const BackIcon  = () => <svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg>;
const CheckIcon = () => <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>;
const SearchIcon= () => <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>;
const MicIcon   = ({ size = 24 }: { size?: number }) => <svg viewBox="0 0 24 24" fill="currentColor" width={size} height={size}><path d="M12 2a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V5a3 3 0 0 1 3-3zm-1 14.93V19H9v2h6v-2h-2v-2.07A7 7 0 0 0 19 11h-2a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.93z"/></svg>;
const EditIcon  = () => <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>;
const SkipIcon  = () => <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><path d="M6 18l8.5-6L6 6v12zm2-8.14L11.03 12 8 14.14V9.86zM16 6h2v12h-2z"/></svg>;
const PlusIcon  = () => <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>;


// ─── FichaDetailModal ─────────────────────────────────────────────────────────
function FichaDetailModal({ saved, onClose }: { saved: SavedFicha; onClose: () => void }) {
  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.55)", zIndex:1000, display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}>
      <div style={{ background:"white", borderRadius:18, maxWidth:520, width:"100%", boxShadow:"0 20px 60px rgba(0,0,0,0.25)", overflow:"hidden", maxHeight:"90vh", display:"flex", flexDirection:"column" }}>
        <div style={{ background:`${saved.fichaColor}12`, padding:"18px 20px", borderBottom:"1px solid #f0f0f0", display:"flex", alignItems:"center", gap:12 }}>
          <span style={{ fontSize:22 }}>{saved.fichaIcon}</span>
          <div style={{ flex:1 }}>
            <div style={{ fontWeight:800, fontSize:17, color:"#1f2937" }}>{saved.fichaTitle}</div>
            <div style={{ fontSize:12, color:"#9ca3af", marginTop:2 }}>{formatDate(saved.date)}</div>
          </div>
          <button type="button" onClick={onClose} style={{ background:"none", border:"none", cursor:"pointer", color:"#9ca3af", fontSize:24, lineHeight:1, padding:4 }}>×</button>
        </div>
        <div style={{ overflowY:"auto", padding:"16px 20px", flex:1 }}>
          <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
            {saved.fields.filter(f => saved.values[f.key]?.trim()).map(field => (
              <div key={field.key} style={{ borderRadius:10, background:"#f8fafc", padding:"10px 14px", border:"1px solid #e5e7eb" }}>
                <div style={{ fontSize:11, fontWeight:700, color:"#9ca3af", textTransform:"uppercase", letterSpacing:"0.05em", marginBottom:3 }}>{field.label}</div>
                <div style={{ fontSize:15, color:"#1f2937", fontWeight:500, lineHeight:1.5, display:"flex", alignItems:"baseline", gap:6 }}>
                  <span>{saved.values[field.key]}</span>
                  {field.unit && <span style={{ fontSize:13, color:"#6b7280", fontWeight:400 }}>{field.unit}</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
        <div style={{ padding:"16px 20px", borderTop:"1px solid #f0f0f0" }}>
          <button type="button" onClick={onClose} style={{ width:"100%", background:"linear-gradient(135deg,#3b82f6,#2563eb)", border:"none", borderRadius:12, padding:13, fontSize:14, fontWeight:700, color:"white", cursor:"pointer" }}>
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── PatientCard ──────────────────────────────────────────────────────────────
function PatientCard({ patient, onClick, historyCount }: { patient: Patient; onClick: () => void; historyCount: number }) {
  const roomText = patient.hospitalization?.room || "Sin cuarto";
  const bedText  = patient.hospitalization?.bed?.name || "Sin cama";
  return (
    <div onClick={onClick} style={{ background:"white", borderRadius:14, boxShadow:"0 2px 10px rgba(0,0,0,0.08)", border:"1px solid #f0f0f0", padding:"16px 16px 12px", cursor:"pointer", display:"flex", flexDirection:"column", transition:"box-shadow 0.2s, transform 0.15s", userSelect:"none", position:"relative" }}
      onMouseEnter={e=>{e.currentTarget.style.boxShadow="0 6px 20px rgba(0,90,200,0.13)";e.currentTarget.style.transform="translateY(-2px)"}}
      onMouseLeave={e=>{e.currentTarget.style.boxShadow="0 2px 10px rgba(0,0,0,0.08)";e.currentTarget.style.transform="translateY(0)"}}>
      {historyCount > 0 && (
        <div style={{ position:"absolute", top:12, right:12, background:"#eff6ff", color:"#3b82f6", borderRadius:20, padding:"2px 8px", fontSize:11, fontWeight:700 }}>
          {historyCount} reg.
        </div>
      )}
      <div style={{ display:"flex", alignItems:"center", gap:14 }}>
        <div style={{ width:56, height:56, borderRadius:"50%", background:"linear-gradient(135deg,#dbeafe,#bfdbfe)", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, fontSize:20, fontWeight:700, color:"#2563eb" }}>
          {patient.lastName?.charAt(0)}{patient.firstName?.charAt(0)}
        </div>
        <div>
          <div style={{ fontWeight:700, fontSize:17, color:"#1f2937", lineHeight:1.2 }}>{patient.lastName}, {patient.firstName}</div>
          <div style={{ fontSize:13, color:"#6b7280", marginTop:2 }}>{getAge(patient.birthDate)}</div>
        </div>
      </div>
      <div style={{ height:1, background:"#f3f4f6", margin:"12px 16px" }} />
      <div style={{ display:"flex", gap:8 }}>
        <div style={{ flex:1, display:"flex", alignItems:"center", gap:8, justifyContent:"center" }}>
          <span style={{ color:"#3b82f6" }}><RoomIcon /></span>
          <div style={{ display:"flex", flexDirection:"column" }}>
            <span style={{ fontSize:11, color:"#9ca3af", lineHeight:1 }}>Cuarto</span>
            <span style={{ fontWeight:700, fontSize:roomText.length>7?13:15, color:"#4b5563", lineHeight:1.2 }}>{roomText}</span>
          </div>
        </div>
        <div style={{ flex:1, display:"flex", alignItems:"center", gap:8, justifyContent:"center" }}>
          <span style={{ color:"#3b82f6" }}><BedIcon /></span>
          <div style={{ display:"flex", flexDirection:"column" }}>
            <span style={{ fontSize:11, color:"#9ca3af", lineHeight:1 }}>Cama</span>
            <span style={{ fontWeight:700, fontSize:bedText.length>7?13:15, color:"#4b5563", lineHeight:1.2 }}>{bedText}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── PatientHome ──────────────────────────────────────────────────────────────
function PatientHome({ patient, onNewFicha, onBack }: { patient: Patient; onNewFicha: () => void; onBack: () => void }) {
  const [history, setHistory] = useState<SavedFicha[]>([]);
  const [viewing, setViewing] = useState<SavedFicha | null>(null);
  useEffect(() => { setHistory(getFichasForPatient(patient.id)); }, [patient.id]);

  return (
    <div style={{ display:"flex", flexDirection:"column", minHeight:"100vh", background:"#f8fafc" }}>
      <div style={{ background:"white", borderBottom:"1px solid #e5e7eb", padding:"14px 20px", display:"flex", alignItems:"center", gap:14, boxShadow:"0 1px 4px rgba(0,0,0,0.06)" }}>
        <button type="button" onClick={onBack} style={{ background:"none", border:"none", cursor:"pointer", color:"#3b82f6", display:"flex", alignItems:"center", padding:8, margin:-4, WebkitTapHighlightColor:"transparent" }}>
          <BackIcon />
        </button>
        <div style={{ flex:1 }}>
          <div style={{ fontWeight:700, fontSize:16, color:"#1f2937" }}>{patient.lastName}, {patient.firstName}</div>
          <div style={{ fontSize:12, color:"#6b7280" }}>{patient.hospitalization.room} · {patient.hospitalization.bed.name} · {getAge(patient.birthDate)}</div>
        </div>
      </div>

      <div style={{ padding:"20px", maxWidth:600, margin:"0 auto", width:"100%" }}>
        <button type="button" onClick={onNewFicha}
          style={{ width:"100%", background:"linear-gradient(135deg,#3b82f6,#2563eb)", border:"none", borderRadius:12, padding:"12px 16px", cursor:"pointer", display:"flex", alignItems:"center", gap:10, boxShadow:"0 4px 12px rgba(37,99,235,0.25)", WebkitTapHighlightColor:"transparent", touchAction:"manipulation", marginBottom:20 }}>
          <div style={{ width:32, height:32, borderRadius:8, background:"rgba(255,255,255,0.2)", display:"flex", alignItems:"center", justifyContent:"center", color:"white", flexShrink:0 }}>
            <PlusIcon />
          </div>
          <span style={{ fontWeight:700, fontSize:14, color:"white" }}>Nueva ficha</span>
        </button>

        <div style={{ marginBottom:12, display:"flex", alignItems:"center", justifyContent:"space-between" }}>
          <h3 style={{ margin:0, fontSize:16, fontWeight:800, color:"#1f2937" }}>Historial</h3>
          <span style={{ fontSize:12, color:"#9ca3af" }}>{history.length} registro{history.length !== 1 ? "s" : ""}</span>
        </div>

        {history.length === 0 ? (
          <div style={{ background:"white", borderRadius:12, border:"1px dashed #e5e7eb", padding:"32px 20px", textAlign:"center" }}>
            <div style={{ fontSize:32, marginBottom:8 }}>📂</div>
            <div style={{ fontSize:14, color:"#9ca3af" }}>No hay registros aún para este paciente.</div>
          </div>
        ) : (
          <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
            {history.map(h => (
              <button key={h.id} type="button" onClick={() => setViewing(h)}
                style={{ background:"white", border:"1px solid #e5e7eb", borderRadius:12, padding:"14px 16px", cursor:"pointer", display:"flex", alignItems:"center", gap:12, textAlign:"left", WebkitTapHighlightColor:"transparent", boxShadow:"0 1px 4px rgba(0,0,0,0.04)", transition:"box-shadow 0.15s", width:"100%" }}
                onMouseEnter={e=>e.currentTarget.style.boxShadow="0 4px 12px rgba(0,0,0,0.1)"}
                onMouseLeave={e=>e.currentTarget.style.boxShadow="0 1px 4px rgba(0,0,0,0.04)"}>
                <div style={{ width:40, height:40, borderRadius:10, background:`${h.fichaColor}15`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:20, flexShrink:0 }}>
                  {h.fichaIcon}
                </div>
                <div style={{ flex:1 }}>
                  <div style={{ fontWeight:700, fontSize:14, color:"#1f2937" }}>{h.fichaTitle}</div>
                  <div style={{ fontSize:12, color:"#9ca3af", marginTop:2 }}>{formatDate(h.date)}</div>
                </div>
                <div style={{ fontSize:12, color:"#9ca3af" }}>
                  {h.fields.filter(f => h.values[f.key]?.trim()).length}/{h.fields.length}
                </div>
                <span style={{ color:"#d1d5db", fontSize:18 }}>›</span>
              </button>
            ))}
          </div>
        )}
      </div>
      {viewing && <FichaDetailModal saved={viewing} onClose={() => setViewing(null)} />}
    </div>
  );
}

// ─── FichaSelector ────────────────────────────────────────────────────────────
function FichaSelector({ patient, onSelect, onBack }: { patient: Patient; onSelect: (f: FichaDefinition) => void; onBack: () => void }) {
  return (
    <div style={{ display:"flex", flexDirection:"column", minHeight:"100vh", background:"#f8fafc" }}>
      <div style={{ background:"white", borderBottom:"1px solid #e5e7eb", padding:"14px 20px", display:"flex", alignItems:"center", gap:14, boxShadow:"0 1px 4px rgba(0,0,0,0.06)" }}>
        <button type="button" onClick={onBack} style={{ background:"none", border:"none", cursor:"pointer", color:"#3b82f6", display:"flex", alignItems:"center", padding:8, margin:-4, WebkitTapHighlightColor:"transparent" }}>
          <BackIcon />
        </button>
        <div style={{ flex:1 }}>
          <div style={{ fontWeight:700, fontSize:16, color:"#1f2937" }}>{patient.lastName}, {patient.firstName}</div>
          <div style={{ fontSize:12, color:"#6b7280" }}>{patient.hospitalization.room} · {patient.hospitalization.bed.name}</div>
        </div>
      </div>
      <div style={{ padding:"24px 20px", maxWidth:600, margin:"0 auto", width:"100%" }}>
        <h2 style={{ margin:"0 0 6px", fontSize:20, fontWeight:800, color:"#1f2937" }}>¿Qué ficha cargás?</h2>
        <p style={{ margin:"0 0 20px", fontSize:13, color:"#6b7280" }}>Seleccioná el tipo de registro</p>
        <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
          {FICHAS.map(ficha => (
            <button key={ficha.id} type="button" onClick={() => onSelect(ficha)}
              style={{ background:"white", border:"2px solid #e5e7eb", borderRadius:14, padding:"16px 20px", cursor:"pointer", display:"flex", alignItems:"center", gap:16, boxShadow:"0 2px 8px rgba(0,0,0,0.06)", transition:"all 0.15s", WebkitTapHighlightColor:"transparent", touchAction:"manipulation", textAlign:"left" }}
              onMouseEnter={e=>{e.currentTarget.style.borderColor=ficha.color;e.currentTarget.style.boxShadow=`0 4px 16px ${ficha.color}22`}}
              onMouseLeave={e=>{e.currentTarget.style.borderColor="#e5e7eb";e.currentTarget.style.boxShadow="0 2px 8px rgba(0,0,0,0.06)"}}>
              <div style={{ width:48, height:48, borderRadius:12, background:`${ficha.color}15`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:24, flexShrink:0 }}>
                {ficha.icon}
              </div>
              <div style={{ flex:1 }}>
                <div style={{ fontWeight:700, fontSize:16, color:"#1f2937" }}>{ficha.title}</div>
                <div style={{ fontSize:12, color:"#9ca3af", marginTop:2 }}>{ficha.fields.length} campos · dictado secuencial</div>
              </div>
              <div style={{ color:"#d1d5db", fontSize:20 }}>›</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── ConfirmModal ─────────────────────────────────────────────────────────────
function ConfirmModal({ ficha, values, patient, onConfirm, onCancel }: {
  ficha: FichaDefinition;
  values: FieldValues;
  patient: Patient;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const DELAY = 5;
  const [countdown, setCountdown] = useState(DELAY);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (countdown <= 0) { setReady(true); return; }
    const t = setTimeout(() => setCountdown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  const filledFields = ficha.fields.filter(f => values[f.key]?.trim());
  const hasErrors = filledFields.some(f => !!validateField(f, values[f.key]));

  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.6)", zIndex:200, display:"flex", alignItems:"flex-end", justifyContent:"center", padding:"0 0 0 0" }}
      onClick={onCancel}>
      <div onClick={e => e.stopPropagation()}
        style={{ background:"white", borderRadius:"20px 20px 0 0", width:"100%", maxWidth:600, maxHeight:"90vh", display:"flex", flexDirection:"column" }}>

        {/* Modal header */}
        <div style={{ padding:"20px 20px 16px", borderBottom:"1px solid #f3f4f6", flexShrink:0 }}>
          <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:6 }}>
            <div style={{ width:40, height:40, borderRadius:10, background:`${ficha.color}15`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:22 }}>
              {ficha.icon}
            </div>
            <div style={{ flex:1 }}>
              <div style={{ fontWeight:800, fontSize:16, color:"#1f2937" }}>Revisá antes de guardar</div>
              <div style={{ fontSize:12, color:"#6b7280" }}>{patient.lastName}, {patient.firstName} · {ficha.title}</div>
            </div>
          </div>
          {hasErrors ? (
            <div style={{ background:"#fef2f2", border:"1px solid #fecaca", borderRadius:8, padding:"8px 12px", fontSize:12, color:"#b91c1c", display:"flex", alignItems:"center", gap:6 }}>
              <span style={{ fontSize:16 }}>⚠️</span>
              <span>Hay campos con errores de validación. Corregalos antes de guardar.</span>
            </div>
          ) : (
            <div style={{ background:"#f0fdf4", border:"1px solid #bbf7d0", borderRadius:8, padding:"8px 12px", fontSize:12, color:"#166534", display:"flex", alignItems:"center", gap:6 }}>
              <span style={{ fontSize:16 }}>✅</span>
              <span>Verificá que todos los datos sean correctos antes de confirmar.</span>
            </div>
          )}
        </div>

        {/* Fields review — scrollable */}
        <div style={{ flex:1, overflow:"auto", padding:"16px 20px" }}>
          {filledFields.length === 0 ? (
            <div style={{ textAlign:"center", color:"#9ca3af", padding:"20px 0", fontSize:14 }}>
              No hay campos completados.
            </div>
          ) : (
            <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
              {filledFields.map(field => {
                const err = validateField(field, values[field.key]);
                return (
                  <div key={field.key}
                    style={{ borderRadius:10, border: err ? "1.5px solid #fca5a5" : "1.5px solid #e5e7eb", background: err ? "#fff7f7" : "#f8fafc", padding:"12px 14px" }}>
                    <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:4 }}>
                      <span style={{ fontSize:11, fontWeight:700, color: err ? "#ef4444" : "#9ca3af", textTransform:"uppercase", letterSpacing:"0.05em" }}>
                        {field.label}
                        {field.unit && <span style={{ fontWeight:400, marginLeft:4 }}>({field.unit})</span>}
                      </span>
                      {err && <span style={{ fontSize:18 }}>❌</span>}
                      {!err && <span style={{ fontSize:16 }}>✓</span>}
                    </div>
                    <div style={{ fontSize: field.numeric ? 22 : 15, fontWeight: field.numeric ? 800 : 400, color: err ? "#dc2626" : "#1f2937", lineHeight:1.4, whiteSpace:"pre-wrap", wordBreak:"break-word" }}>
                      {values[field.key]}
                      {field.unit && !err && <span style={{ fontSize:14, fontWeight:500, color:"#6b7280", marginLeft:5 }}>{field.unit}</span>}
                    </div>
                    {err && (
                      <div style={{ fontSize:12, color:"#ef4444", marginTop:6, fontStyle:"italic" }}>
                        ⚠ {err}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div style={{ padding:"16px 20px", paddingBottom:"max(16px,env(safe-area-inset-bottom))", borderTop:"1px solid #f3f4f6", flexShrink:0, display:"flex", gap:10 }}>
          <button type="button" onClick={onCancel}
            style={{ flex:1, background:"#f3f4f6", border:"none", borderRadius:12, padding:"14px", fontWeight:600, fontSize:15, cursor:"pointer", WebkitTapHighlightColor:"transparent" }}>
            Corregir
          </button>
          <button type="button" onClick={ready && !hasErrors ? onConfirm : undefined}
            disabled={!ready || hasErrors}
            style={{
              flex:2, border:"none", borderRadius:12, padding:"14px", fontWeight:700, fontSize:15,
              cursor: ready && !hasErrors ? "pointer" : "default",
              WebkitTapHighlightColor:"transparent", touchAction:"manipulation",
              background: hasErrors ? "#e5e7eb"
                : ready ? "linear-gradient(135deg,#10b981,#059669)"
                : `linear-gradient(135deg,#9ca3af,#6b7280)`,
              color: !ready || hasErrors ? "#9ca3af" : "white",
              transition:"all 0.3s",
              boxShadow: ready && !hasErrors ? "0 4px 12px rgba(16,185,129,0.35)" : "none",
              display:"flex", alignItems:"center", justifyContent:"center", gap:8,
            }}>
            {hasErrors
              ? "Errores pendientes"
              : ready
                ? "✓ Confirmar y guardar"
                : (
                  <>
                    <svg viewBox="0 0 36 36" width="22" height="22" style={{ transform:"rotate(-90deg)" }}>
                      <circle cx="18" cy="18" r="15" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="3" />
                      <circle cx="18" cy="18" r="15" fill="none" stroke="white" strokeWidth="3"
                        strokeDasharray={`${((DELAY - countdown) / DELAY) * 94} 94`}
                        style={{ transition:"stroke-dasharray 0.9s linear" }} />
                    </svg>
                    Esperá {countdown}s…
                  </>
                )
            }
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── FichaScreen ──────────────────────────────────────────────────────────────
function FichaScreen({ patient, ficha, onBack, onSaved }: {
  patient: Patient; ficha: FichaDefinition; onBack: () => void; onSaved: () => void;
}) {
  const [values, setValues]           = useState<FieldValues>({});
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [activeIndex, setActiveIndex] = useState(0);
  const [editingKey, setEditingKey]   = useState<string | null>(null);
  const [editValue, setEditValue]     = useState("");
  const [showConfirm, setShowConfirm] = useState(false);
  const fieldRefs = useRef<(HTMLDivElement | null)[]>([]);
  const activeField = ficha.fields[activeIndex] ?? null;

  const handleFinalResult = useCallback((text: string, stopFn: () => void) => {
    if (!activeField) return;
    const newVal = text.trim();
    const err = validateField(activeField, newVal);

    if (err) {
      // Valor inválido: mostrar error en rojo, NO guardar nada, quedarse en el campo
      setFieldErrors(prev => ({ ...prev, [activeField.key]: err }));
      // Limpiar el valor inválido que pudiera haber quedado
      setValues(prev => ({ ...prev, [activeField.key]: "" }));
      stopFn(); // detener el mic para que el usuario vea el error antes de re-dictar
      return;
    }

    // Válido: limpiar error, guardar valor
    setFieldErrors(prev => ({ ...prev, [activeField.key]: "" }));
    setValues(prev => ({ ...prev, [activeField.key]: newVal }));

    const nextIndex = activeField ? ficha.fields.indexOf(activeField) + 1 : -1;
    const isLast = nextIndex >= ficha.fields.length;

    if (isLast) {
      // Último campo completado: detener mic automáticamente
      stopFn();
    } else {
      setActiveIndex(nextIndex);
    }
  }, [activeField, ficha.fields]);

  const { isRecording, interim, error, supported, start, stop } = useSpeechRecognition(handleFinalResult);

  useEffect(() => {
    fieldRefs.current[activeIndex]?.scrollIntoView({ behavior:"smooth", block:"center" });
  }, [activeIndex]);

  const handleMicClick = () => { if (isRecording) stop(); else start(); };
  const filledCount = ficha.fields.filter(f => values[f.key]?.trim()).length;

  const handleConfirmedSave = () => {
    const record: SavedFicha = {
      id: uuid(), fichaId: ficha.id, fichaTitle: ficha.title,
      fichaIcon: ficha.icon, fichaColor: ficha.color,
      patientId: patient.id, values, fields: ficha.fields,
      date: new Date().toISOString(),
    };
    saveFichaToLS(record);
    setShowConfirm(false);
    onSaved();
  };

  const startEdit = (key: string, current: string) => { stop(); setEditingKey(key); setEditValue(current); };
  const confirmEdit = () => {
    if (!editingKey) return;
    const field = ficha.fields.find(f => f.key === editingKey);
    const err = field ? validateField(field, editValue) : null;
    setFieldErrors(prev => ({ ...prev, [editingKey]: err ?? "" }));
    setValues(prev => ({ ...prev, [editingKey]: editValue }));
    setEditingKey(null);
  };

  const errorMessages: Record<string, string> = {
    "not-supported": "Tu navegador no soporta reconocimiento de voz.",
    "not-allowed":   "Permiso de micrófono denegado.",
    "network":       "Error de red.",
    "start-failed":  "No se pudo iniciar el micrófono.",
  };

  return (
    <div style={{ display:"flex", flexDirection:"column", minHeight:"100vh", background:"#f8fafc" }}>
      {/* Header */}
      <div style={{ background:"white", borderBottom:"1px solid #e5e7eb", padding:"14px 20px", display:"flex", alignItems:"center", gap:14, boxShadow:"0 1px 4px rgba(0,0,0,0.06)" }}>
        <button type="button" onClick={onBack} style={{ background:"none", border:"none", cursor:"pointer", color:"#3b82f6", display:"flex", alignItems:"center", padding:8, margin:-4, WebkitTapHighlightColor:"transparent" }}>
          <BackIcon />
        </button>
        <div style={{ flex:1 }}>
          <div style={{ fontWeight:700, fontSize:15, color:"#1f2937" }}>{patient.lastName}, {patient.firstName}</div>
          <div style={{ fontSize:11, color:"#6b7280" }}>{patient.hospitalization.room} · {patient.hospitalization.bed.name}</div>
        </div>
        <div style={{ background:`${ficha.color}15`, color:ficha.color, borderRadius:8, padding:"4px 10px", fontSize:12, fontWeight:700, display:"flex", alignItems:"center", gap:5 }}>
          {ficha.icon} {ficha.title}
        </div>
      </div>

      {/* Progress bar */}
      <div style={{ height:3, background:"#f3f4f6" }}>
        <div style={{ height:3, background:ficha.color, width:`${(filledCount/ficha.fields.length)*100}%`, transition:"width 0.4s ease" }} />
      </div>

      {/* Fields */}
      <div style={{ flex:1, padding:"16px 20px 180px", display:"flex", flexDirection:"column", gap:10, maxWidth:640, margin:"0 auto", width:"100%" }}>
        <div style={{ fontSize:12, color:"#9ca3af", fontWeight:500, marginBottom:4 }}>
          {new Date().toLocaleDateString("es-AR", { weekday:"long", day:"numeric", month:"long", year:"numeric" })}
        </div>

        {error && (
          <div style={{ background:"#fef2f2", border:"1px solid #fecaca", borderRadius:10, padding:"10px 14px", fontSize:13, color:"#b91c1c" }}>
            {errorMessages[error] ?? `Error: ${error}`}
          </div>
        )}

        {ficha.fields.map((field, idx) => {
          const isActive  = idx === activeIndex;
          const isFilled  = !!values[field.key]?.trim();
          const isDone    = isFilled && idx < activeIndex;
          const isEditing = editingKey === field.key;
          const fieldErr  = fieldErrors[field.key];
          const hasErr    = !!fieldErr;

          return (
            <div key={field.key} ref={el => { fieldRefs.current[idx] = el; }}
              style={{ background:"white", borderRadius:12,
                border: hasErr ? "2px solid #fca5a5"
                  : isActive ? `2px solid ${ficha.color}`
                  : isDone ? "2px solid #d1fae5"
                  : "2px solid #e5e7eb",
                padding:"14px 16px", transition:"border-color 0.2s, box-shadow 0.2s",
                boxShadow: hasErr ? "0 0 0 4px rgba(239,68,68,0.08)"
                  : isActive ? `0 0 0 4px ${ficha.color}18`
                  : "none" }}>

              {/* Field header */}
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:(isActive || isFilled) ? 8 : 0 }}>
                <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                  {hasErr  && <span style={{ fontSize:14 }}>⚠️</span>}
                  {!hasErr && isDone && <span style={{ color:"#10b981", display:"flex" }}><CheckIcon /></span>}
                  {!hasErr && isActive && <span style={{ width:8, height:8, borderRadius:"50%", background:ficha.color, display:"inline-block", animation:"blink 1s infinite" }} />}
                  <span style={{ fontWeight:700, fontSize:14, color: hasErr ? "#ef4444" : isActive ? ficha.color : isDone ? "#6b7280" : "#9ca3af" }}>
                    {field.label}
                  </span>
                  {field.unit && (
                    <span style={{ fontSize:12, fontWeight:600, color: isActive ? `${ficha.color}99` : "#c0c0c0", background: isActive ? `${ficha.color}12` : "#f3f4f6", borderRadius:6, padding:"1px 7px" }}>
                      {field.unit}
                    </span>
                  )}
                </div>
                <div style={{ display:"flex", gap:6 }}>
                  {isFilled && !hasErr && (
                    <button type="button" onClick={() => startEdit(field.key, values[field.key])}
                      style={{ background:"none", border:"none", cursor:"pointer", color:"#9ca3af", display:"flex", alignItems:"center", padding:4, WebkitTapHighlightColor:"transparent" }}>
                      <EditIcon />
                    </button>
                  )}
                  {hasErr && (
                    <button type="button" onClick={() => {
                        setValues(prev => ({ ...prev, [field.key]: "" }));
                        setFieldErrors(prev => ({ ...prev, [field.key]: "" }));
                        setActiveIndex(idx);
                      }}
                      style={{ background:"#fef2f2", border:"none", borderRadius:6, cursor:"pointer", color:"#ef4444", fontSize:11, fontWeight:600, padding:"3px 8px", display:"flex", alignItems:"center", gap:3, WebkitTapHighlightColor:"transparent" }}>
                      ✕ Borrar
                    </button>
                  )}
                  {isActive && !isRecording && !hasErr && (
                    <button type="button" onClick={() => setActiveIndex(idx + 1 < ficha.fields.length ? idx + 1 : idx)}
                      style={{ background:"none", border:"none", cursor:"pointer", color:"#9ca3af", display:"flex", alignItems:"center", gap:3, fontSize:11, padding:4, WebkitTapHighlightColor:"transparent" }}>
                      <SkipIcon /> Saltar
                    </button>
                  )}
                </div>
              </div>

              {/* Valor / hint / edit */}
              {isEditing ? (
                <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                  <textarea autoFocus value={editValue} onChange={e => setEditValue(e.target.value)}
                    rows={field.multiline ? 3 : 1}
                    style={{ width:"100%", border:"1px solid #d1d5db", borderRadius:8, padding:"8px 10px", fontSize:15, resize:"vertical", outline:"none", fontFamily:"inherit", boxSizing:"border-box" }} />
                  <div style={{ display:"flex", gap:8, justifyContent:"flex-end" }}>
                    <button type="button" onClick={() => setEditingKey(null)}
                      style={{ background:"none", border:"1px solid #e5e7eb", borderRadius:8, padding:"6px 14px", fontSize:13, cursor:"pointer" }}>Cancelar</button>
                    <button type="button" onClick={confirmEdit}
                      style={{ background:ficha.color, border:"none", borderRadius:8, padding:"6px 14px", fontSize:13, fontWeight:700, color:"white", cursor:"pointer" }}>Confirmar</button>
                  </div>
                </div>
              ) : values[field.key] ? (
                <>
                  <div style={{ display:"flex", alignItems:"baseline", gap:6 }}>
                    <span style={{ fontSize:15, color: hasErr ? "#dc2626" : "#1f2937", lineHeight:1.6, whiteSpace:"pre-wrap", wordBreak:"break-word", textDecoration: hasErr ? "line-through" : "none" }}>
                      {values[field.key]}
                    </span>
                    {isActive && interim && !hasErr && <span style={{ color:`${ficha.color}99` }}>{interim}</span>}
                  </div>
                  {hasErr && (
                    <div style={{ fontSize:12, color:"#ef4444", marginTop:5, display:"flex", alignItems:"center", gap:5 }}>
                      <span style={{ fontSize:14 }}>⚠</span>
                      <span>{fieldErr} — tocá <strong>Borrar</strong> y volvé a dictar</span>
                    </div>
                  )}
                </>
              ) : isActive ? (
                interim
                  ? <div style={{ fontSize:15, color:`${ficha.color}99`, lineHeight:1.6, fontStyle:"italic" }}>{interim}</div>
                  : <div style={{ fontSize:13, color:"#d1d5db", lineHeight:1.5 }}>{field.hint}</div>
              ) : (
                <button type="button" onClick={() => setActiveIndex(idx)}
                  style={{ background:"none", border:"none", cursor:"pointer", fontSize:12, color:"#c0c7d0", padding:0, WebkitTapHighlightColor:"transparent" }}>
                  Tocar para ir a este campo →
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Bottom bar */}
      <div style={{ position:"fixed", bottom:0, left:0, right:0, background:"white", borderTop:"1px solid #e5e7eb", padding:"16px 20px", paddingBottom:"max(16px, env(safe-area-inset-bottom))", boxShadow:"0 -4px 16px rgba(0,0,0,0.08)" }}>
        <div style={{ textAlign:"center", marginBottom:10 }}>
          {activeField ? (
            <span style={{ fontSize:12, color:"#6b7280" }}>
              Campo activo: <strong style={{ color:ficha.color }}>{activeField.label}</strong>
              {activeField.unit && <span style={{ color:"#9ca3af" }}> · {activeField.unit}</span>}
              <span style={{ color:"#9ca3af" }}> ({activeIndex+1}/{ficha.fields.length})</span>
            </span>
          ) : (
            <span style={{ fontSize:12, color:"#10b981", fontWeight:600 }}>✓ Todos los campos completados</span>
          )}
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:16 }}>
          <button type="button" onClick={handleMicClick} disabled={!activeField || !supported}
            style={{
              width:68, height:68, borderRadius:"50%", border:"none",
              background: !activeField || !supported ? "#e5e7eb" : isRecording ? "linear-gradient(135deg,#ef4444,#dc2626)" : `linear-gradient(135deg,${ficha.color},${ficha.color}dd)`,
              color: !activeField ? "#9ca3af" : "white",
              display:"flex", alignItems:"center", justifyContent:"center",
              cursor: !activeField ? "default" : "pointer", flexShrink:0,
              WebkitTapHighlightColor:"transparent", touchAction:"manipulation",
              boxShadow: isRecording ? "0 0 0 8px rgba(239,68,68,0.15), 0 4px 16px rgba(220,38,38,0.4)" : !activeField ? "none" : `0 4px 16px ${ficha.color}44`,
              transition:"all 0.2s", animation: isRecording ? "pulse 1.5s infinite" : "none",
            }}>
            <MicIcon size={28} />
          </button>
          <div style={{ flex:1, display:"flex", flexDirection:"column", gap:3 }}>
            <span style={{ fontSize:13, color:"#374151", fontWeight:600 }}>
              {isRecording ? "Dictando..." : !activeField ? "Ficha completa" : "Dictá el valor"}
            </span>
            <span style={{ fontSize:11, color:"#9ca3af" }}>
              {isRecording ? "Se avanza al siguiente campo automáticamente"
                : `${filledCount}/${ficha.fields.length} campos completados`}
            </span>
          </div>
          <button type="button" onClick={() => filledCount > 0 && setShowConfirm(true)} disabled={filledCount === 0}
            style={{
              background: filledCount === 0 ? "#e5e7eb" : "linear-gradient(135deg,#10b981,#059669)",
              color: filledCount > 0 ? "white" : "#9ca3af",
              border:"none", borderRadius:12, padding:"14px 18px", fontWeight:700, fontSize:14,
              cursor: filledCount > 0 ? "pointer" : "default",
              display:"flex", alignItems:"center", gap:6, transition:"all 0.2s",
              WebkitTapHighlightColor:"transparent", touchAction:"manipulation",
              boxShadow: filledCount > 0 ? "0 4px 12px rgba(16,185,129,0.3)" : "none", flexShrink:0,
            }}>
            Guardar
          </button>
        </div>
      </div>

      {showConfirm && (
        <ConfirmModal ficha={ficha} values={values} patient={patient} onConfirm={handleConfirmedSave} onCancel={() => setShowConfirm(false)} />
      )}

      <style>{`
        @keyframes pulse {
          0%   { box-shadow: 0 0 0 0    rgba(239,68,68,0.4), 0 4px 16px rgba(220,38,38,0.4); }
          70%  { box-shadow: 0 0 0 14px rgba(239,68,68,0),   0 4px 16px rgba(220,38,38,0.4); }
          100% { box-shadow: 0 0 0 0    rgba(239,68,68,0),   0 4px 16px rgba(220,38,38,0.4); }
        }
        @keyframes blink { 0%, 100% { opacity:1; } 50% { opacity:0; } }
      `}</style>
    </div>
  );
}

// ─── Mock data ────────────────────────────────────────────────────────────────
const MOCK_PATIENTS: Patient[] = [
  { id:1, firstName:"Santiago",  fullName:"Santiago",  lastName:"Ciaponi", birthDate:"1958-03-12", sex:"M", avatar:null, hospitalization:{ room:"101-A",  bed:{ name:"Cama 1" } } },
  { id:2, firstName:"Spock",     fullName:"Spock",     lastName:"Comandante",  birthDate:"1972-07-25", sex:"F", avatar:null, hospitalization:{ room:"203",    bed:{ name:"Cama 2" } } },
  { id:3, firstName:"Luke",   fullName:"Luke",   lastName:"Skywalker", birthDate:"1945-11-08", sex:"M", avatar:null, hospitalization:{ room:"Guardia", bed:{ name:"G-3"    } } },
  { id:4, firstName:"Max",   fullName:"Max",   lastName:"Verstappen",     birthDate:"1989-05-30", sex:"F", avatar:null, hospitalization:{ room:"UTI",     bed:{ name:"UTI-1"  } } },
  { id:5, firstName:"Roberto", fullName:"Roberto", lastName:"Díaz",      birthDate:"1963-09-14", sex:"M", avatar:null, hospitalization:{ room:"302",     bed:{ name:"Cama 1" } } },
  { id:6, firstName:"María",   fullName:"María",   lastName:"López",     birthDate:"1950-02-18", sex:"F", avatar:null, hospitalization:{ room:"101-B",   bed:{ name:"Cama 3" } } },
];

// ─── App ──────────────────────────────────────────────────────────────────────
type Screen = "list" | "patient" | "selector" | "ficha";

export default function InternmentApp() {
  const [screen, setScreen]   = useState<Screen>("list");
  const [search, setSearch]   = useState("");
  const [patient, setPatient] = useState<Patient | null>(null);
  const [ficha, setFicha]     = useState<FichaDefinition | null>(null);
  const [historyCounts, setHistoryCounts] = useState<Record<number, number>>({});

  // Cargar contadores de historial al montar
  useEffect(() => {
    const counts: Record<number, number> = {};
    MOCK_PATIENTS.forEach(p => { counts[p.id] = getFichasForPatient(p.id).length; });
    setHistoryCounts(counts);
  }, []);

  const refreshCounts = () => {
    const counts: Record<number, number> = {};
    MOCK_PATIENTS.forEach(p => { counts[p.id] = getFichasForPatient(p.id).length; });
    setHistoryCounts(counts);
  };

  const filtered = MOCK_PATIENTS.filter(p => {
    const t = search.toLowerCase();
    return p.fullName.toLowerCase().includes(t) || p.lastName.toLowerCase().includes(t)
      || p.firstName.toLowerCase().includes(t) || p.hospitalization.room.toLowerCase().includes(t)
      || p.hospitalization.bed.name.toLowerCase().includes(t);
  });

  if (screen === "ficha" && patient && ficha)
    return <FichaScreen patient={patient} ficha={ficha} onBack={() => setScreen("selector")}
      onSaved={() => { refreshCounts(); setScreen("patient"); }} />;

  if (screen === "selector" && patient)
    return <FichaSelector patient={patient} onSelect={f => { setFicha(f); setScreen("ficha"); }} onBack={() => setScreen("patient")} />;

  if (screen === "patient" && patient)
    return <PatientHome patient={patient} onNewFicha={() => setScreen("selector")} onBack={() => { setScreen("list"); refreshCounts(); }} />;

  return (
    <div style={{ minHeight:"100vh", background:"#f8fafc", fontFamily:"'Segoe UI', system-ui, sans-serif" }}>
      <div style={{ background:"white", borderBottom:"1px solid #e5e7eb", padding:"16px 20px 12px", boxShadow:"0 1px 4px rgba(0,0,0,0.06)" }}>
        <div style={{ maxWidth:900, margin:"0 auto" }}>
          <h1 style={{ margin:0, fontSize:24, fontWeight:800, color:"#1f2937" }}>Lista de Pacientes</h1>
          <p style={{ margin:"4px 0 0", fontSize:13, color:"#6b7280" }}>Monitoreo de pacientes hospitalizados</p>
        </div>
      </div>
      <div style={{ maxWidth:900, margin:"0 auto", padding:"16px 20px 0" }}>
        <div style={{ display:"flex", alignItems:"center", gap:10, background:"white", border:"1.5px solid #e5e7eb", borderRadius:12, padding:"10px 14px", boxShadow:"0 1px 4px rgba(0,0,0,0.05)" }}>
          <span style={{ color:"#9ca3af" }}><SearchIcon /></span>
          <input type="text" placeholder="Buscar paciente por nombre, cuarto o cama" value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ border:"none", outline:"none", fontSize:14, color:"#374151", flex:1, background:"transparent" }} />
          {search && <button type="button" onClick={() => setSearch("")} style={{ background:"none", border:"none", cursor:"pointer", color:"#9ca3af", fontSize:18, lineHeight:1 }}>×</button>}
        </div>
        <div style={{ fontSize:12, color:"#9ca3af", marginTop:8, paddingLeft:2 }}>
          {filtered.length} paciente{filtered.length !== 1 ? "s" : ""}
        </div>
      </div>
      <div style={{ maxWidth:900, margin:"0 auto", padding:"12px 20px 40px", display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(280px, 1fr))", gap:14 }}>
        {filtered.length > 0 ? filtered.map(p => (
          <PatientCard key={p.id} patient={p} historyCount={historyCounts[p.id] ?? 0}
            onClick={() => { setPatient(p); setScreen("patient"); }} />
        )) : (
          <div style={{ gridColumn:"1/-1", background:"#fef2f2", color:"#b91c1c", borderRadius:10, padding:"16px 20px", textAlign:"center", fontSize:14 }}>
            No se encontraron resultados.
          </div>
        )}
      </div>
    </div>
  );
}