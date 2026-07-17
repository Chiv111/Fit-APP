import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { parseRoutineImport } from "./profileOnboarding.js";
import { Onboarding } from "./Onboarding.jsx";
import { extractRoutineTextFromPdf } from "./pdfRoutine.js";
import { BrandLogo } from "./BrandLogo.jsx";

// ============================================================================
// 1. CONSTANTS + SUPABASE
// ============================================================================
const SUPABASE_PROJECT_URL = (import.meta.env.VITE_SUPABASE_URL || "").trim();
const SUPABASE_PUBLIC_KEY = (
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
  || import.meta.env.VITE_SUPABASE_ANON_KEY
  || ""
).trim();
const SUPABASE_AUTH_REDIRECT_URL = (import.meta.env.VITE_SUPABASE_AUTH_REDIRECT_URL || "").trim();
const SUPABASE_CONFIGURED = Boolean(SUPABASE_PROJECT_URL && SUPABASE_PUBLIC_KEY);
const SUPABASE_URL = SUPABASE_CONFIGURED && typeof window !== "undefined"
  ? `${window.location.origin}/supabase`
  : SUPABASE_PROJECT_URL;

const supabase = SUPABASE_CONFIGURED
  ? createClient(SUPABASE_URL, SUPABASE_PUBLIC_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })
  : null;

const CLOUD_TABLE = "lockin_state_user";
const STATE_KEY_PREFIX = "fitapp_state_v4";
const BACKUP_KEY_PREFIX = "fitapp_backups_v4";
const DRAFT_KEY_PREFIX = "fitapp_drafts_v4";
const SYNC_QUEUE_KEY_PREFIX = "fitapp_sync_queue_v4";
const AUTH_LOCAL_MODE_KEY = "fitapp_auth_local_mode_v1";
const DEVICE_IMPORT_FLAG_PREFIX = "fitapp_device_imported_v1";
const LEGACY_STATE_KEYS = ["lockin_state_v3", "lockin_state_v2", "lockin_state_v1", "fit_app_state_v6", "fit_app_state_v5"];
const LEGACY_BACKUP_KEYS = ["lockin_backups_v3", "lockin_backups_v2", "lockin_backups_v1"];
const LOCAL_SCOPE = "local";

const CLOUD_SYNC_DEBOUNCE_MS = 1500;
const SYNC_MAX_RETRIES = 8;
const AUTO_BACKUP_MS = 1000 * 60 * 60 * 6;
const MAX_BACKUPS = 30;

const TABS = [
  ["hoy", "Hoy"],
  ["historial", "Calendario"],
  ["progreso", "Progreso"],
  ["ajustes", "Ajustes"],
];

const COMMON_TIMEZONES = [
  "America/Mexico_City",
  "America/Tijuana",
  "America/Bogota",
  "America/Lima",
  "America/Caracas",
  "America/Santiago",
  "America/Buenos_Aires",
  "America/Sao_Paulo",
  "America/Guatemala",
  "America/El_Salvador",
  "America/Tegucigalpa",
  "America/Managua",
  "America/Costa_Rica",
  "America/Panama",
  "America/Asuncion",
  "America/La_Paz",
  "America/Montevideo",
  "America/Quito",
  "America/Havana",
  "America/Santo_Domingo",
  "America/Puerto_Rico",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Phoenix",
  "America/Anchorage",
  "America/Toronto",
  "America/Vancouver",
  "Europe/Madrid",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Rome",
  "Atlantic/Canary",
  "UTC",
];

// ============================================================================
// 2. TIMEZONE + DATE UTILITIES
// ============================================================================
function detectBrowserTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

function safeTimezone(tz) {
  if (!tz) return detectBrowserTimezone();
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date());
    return tz;
  } catch {
    return detectBrowserTimezone();
  }
}

function todayInZone(tz, date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: safeTimezone(tz),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function formatLongDateInZone(input, tz) {
  if (!input || typeof input !== "string") return "--";
  const [year, month, day] = input.split("-").map(Number);
  if (!year || !month || !day) return input;
  const date = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  const formatted = new Intl.DateTimeFormat("es", {
    timeZone: safeTimezone(tz),
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(date);
  return formatted.charAt(0).toUpperCase() + formatted.slice(1);
}

function formatShortDateInZone(input, tz) {
  if (!input || typeof input !== "string") return "--";
  const [year, month, day] = input.split("-").map(Number);
  if (!year || !month || !day) return input;
  const date = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  return new Intl.DateTimeFormat("es", {
    timeZone: safeTimezone(tz),
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function formatDateTimeInZone(input, tz) {
  if (!input) return "--";
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) return String(input);
  return date.toLocaleString("es", {
    timeZone: safeTimezone(tz),
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function msUntilNextMidnightInZone(tz, now = new Date()) {
  const todayStr = todayInZone(tz, now);
  for (let offset = 1; offset <= 26; offset += 1) {
    const candidate = new Date(now.getTime() + offset * 60 * 60 * 1000);
    if (todayInZone(tz, candidate) !== todayStr) {
      let lo = now.getTime();
      let hi = candidate.getTime();
      while (hi - lo > 1000) {
        const mid = Math.floor((lo + hi) / 2);
        if (todayInZone(tz, new Date(mid)) === todayStr) lo = mid;
        else hi = mid;
      }
      return Math.max(1000, hi - now.getTime());
    }
  }
  return 60 * 60 * 1000;
}

function weekdayIndexInZone(tz, date = new Date()) {
  const weekday = new Intl.DateTimeFormat("en-US", { timeZone: safeTimezone(tz), weekday: "short" }).format(date);
  const map = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };
  return map[weekday] ?? 0;
}

function monthKeyFromDate(dateString) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(dateString || ""))
    ? String(dateString).slice(0, 7)
    : "";
}

function shiftMonthKey(monthKey, offset) {
  const [year, month] = String(monthKey || "").split("-").map(Number);
  if (!year || !month) return monthKey;
  const date = new Date(Date.UTC(year, month - 1 + offset, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function formatMonthLabel(monthKey) {
  const [year, month] = String(monthKey || "").split("-").map(Number);
  if (!year || !month) return "Calendario";
  const date = new Date(Date.UTC(year, month - 1, 1, 12));
  const label = new Intl.DateTimeFormat("es", {
    timeZone: "UTC",
    month: "long",
    year: "numeric",
  }).format(date);
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function getMonthCells(monthKey) {
  const [year, month] = String(monthKey || "").split("-").map(Number);
  if (!year || !month) return [];
  const firstDay = new Date(Date.UTC(year, month - 1, 1));
  const leadingEmptyDays = (firstDay.getUTCDay() + 6) % 7;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const cells = Array.from({ length: leadingEmptyDays }, () => null);
  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push(`${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`);
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function weekdayIndexFromIso(dateString) {
  const [year, month, day] = String(dateString || "").split("-").map(Number);
  if (!year || !month || !day) return 0;
  return (new Date(Date.UTC(year, month - 1, day)).getUTCDay() + 6) % 7;
}

function getIsoWeekKey(dateString) {
  const [year, month, day] = String(dateString).split("-").map(Number);
  if (!year || !month || !day) return "0000-W00";
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

// ============================================================================
// 3. DEFAULTS
// ============================================================================
const DEFAULT_SETTINGS = {
  profileName: "",
  startWeight: 0,
  goalWeight: 0,
  timezone: detectBrowserTimezone(),
  focusNote: "",
};

const DEFAULT_PACKAGES = [
  {
    id: "pkg_pecho",
    name: "Pecho",
    color: "#d83b2d",
    exercises: [
      { id: "px_pecho_1", name: "Press banca", sets: "4", reps: "6-10", rest: "120s", note: "" },
      { id: "px_pecho_2", name: "Press inclinado mancuernas", sets: "3", reps: "8-12", rest: "90s", note: "" },
      { id: "px_pecho_3", name: "Aperturas", sets: "3", reps: "10-12", rest: "60s", note: "" },
    ],
  },
  {
    id: "pkg_espalda",
    name: "Espalda",
    color: "#35c26c",
    exercises: [
      { id: "px_espalda_1", name: "Dominadas / Jalón al pecho", sets: "4", reps: "6-10", rest: "120s", note: "" },
      { id: "px_espalda_2", name: "Remo con barra", sets: "4", reps: "6-10", rest: "90s", note: "" },
      { id: "px_espalda_3", name: "Remo polea baja", sets: "3", reps: "8-12", rest: "75s", note: "" },
      { id: "px_espalda_4", name: "Pullover polea", sets: "3", reps: "10-12", rest: "60s", note: "" },
    ],
  },
  {
    id: "pkg_hombro",
    name: "Hombro",
    color: "#d9a441",
    exercises: [
      { id: "px_hombro_1", name: "Press militar", sets: "3", reps: "6-10", rest: "90s", note: "" },
      { id: "px_hombro_2", name: "Elevaciones laterales", sets: "3", reps: "10-15", rest: "60s", note: "" },
      { id: "px_hombro_3", name: "Pájaros / Deltoide posterior", sets: "3", reps: "10-15", rest: "60s", note: "" },
    ],
  },
  {
    id: "pkg_biceps",
    name: "Bíceps",
    color: "#5b9bd5",
    exercises: [
      { id: "px_biceps_1", name: "Curl barra", sets: "3", reps: "8-12", rest: "60s", note: "" },
      { id: "px_biceps_2", name: "Curl martillo", sets: "3", reps: "10-12", rest: "60s", note: "" },
    ],
  },
  {
    id: "pkg_triceps",
    name: "Tríceps",
    color: "#a06cd5",
    exercises: [
      { id: "px_triceps_1", name: "Press francés", sets: "3", reps: "10-12", rest: "60s", note: "" },
      { id: "px_triceps_2", name: "Extensiones polea", sets: "3", reps: "10-15", rest: "60s", note: "" },
      { id: "px_triceps_3", name: "Fondos", sets: "3", reps: "max", rest: "90s", note: "" },
    ],
  },
  {
    id: "pkg_cuadriceps",
    name: "Cuádriceps",
    color: "#ff7e5f",
    exercises: [
      { id: "px_cuadri_1", name: "Sentadilla", sets: "4", reps: "6-10", rest: "120s", note: "" },
      { id: "px_cuadri_2", name: "Prensa 45°", sets: "3", reps: "8-12", rest: "90s", note: "" },
      { id: "px_cuadri_3", name: "Extensiones cuádriceps", sets: "3", reps: "10-15", rest: "60s", note: "" },
    ],
  },
  {
    id: "pkg_femoral",
    name: "Femoral / Posterior",
    color: "#2dc7d8",
    exercises: [
      { id: "px_femoral_1", name: "Peso muerto rumano", sets: "4", reps: "6-10", rest: "120s", note: "" },
      { id: "px_femoral_2", name: "Curl femoral", sets: "3", reps: "10-12", rest: "75s", note: "" },
      { id: "px_femoral_3", name: "Hip thrust", sets: "3", reps: "8-12", rest: "90s", note: "" },
    ],
  },
  {
    id: "pkg_pantorrilla",
    name: "Pantorrilla",
    color: "#6cd2a0",
    exercises: [
      { id: "px_pant_1", name: "Elevación gemelos de pie", sets: "4", reps: "12-15", rest: "45s", note: "" },
    ],
  },
  {
    id: "pkg_core",
    name: "Core",
    color: "#c0c5d0",
    exercises: [
      { id: "px_core_1", name: "Plancha", sets: "3", reps: "30-60s", rest: "45s", note: "" },
      { id: "px_core_2", name: "Crunch", sets: "3", reps: "12-15", rest: "45s", note: "" },
    ],
  },
];

const DEFAULT_ROUTINE = [
  {
    id: "d_lun",
    shortDay: "LUN",
    fullDay: "Lunes",
    type: "Empuje",
    title: "PUSH + ABS",
    postCardio: "Cardio: Zona 2 — 20-30 min suave, DESPUÉS de pesas",
    cardioProtocol: "",
    packageIds: [],
    customExercises: [
      { id: "ex_press_inc_manc_e2", name: "Press inclinado mancuerna", sets: "4", reps: "6-8", rest: "120-180s", note: "PESADO" },
      { id: "ex_press_hombro_manc_e2", name: "Press hombro sentado mancuerna", sets: "3", reps: "8-10", rest: "90-120s", note: "" },
      { id: "ex_lateral_polea_baja_e2", name: "Lateral en polea baja (G2)", sets: "4", reps: "12-20", rest: "60-90s", note: "BOMBEO 0-1 RIR" },
      { id: "ex_aperturas_inc_manc_e2", name: "Aperturas inclinadas mancuerna", sets: "3", reps: "12-15", rest: "60-90s", note: "estira a fondo" },
      { id: "ex_katana_uni_polea_e2", name: "Katana unilateral en polea", sets: "3", reps: "10-12", rest: "60-90s", note: "long head, estirado, c/b" },
      { id: "ex_triceps_cuerda_e2", name: "Tríceps cuerda", sets: "3", reps: "12-15", rest: "60-90s", note: "BOMBEO" },
      { id: "ex_abs_crunch_polea_e2", name: "ABS A: Crunch en polea de rodillas", sets: "3", reps: "10-15", rest: "60-90s", note: "con carga — progresa peso como un básico" },
      { id: "ex_abs_press_pallof_e2", name: "ABS B: Press Pallof", sets: "2", reps: "10-12", rest: "60s", note: "antirrotación, cintura, c/l" },
    ],
  },
  {
    id: "d_mar",
    shortDay: "MAR",
    fullDay: "Martes",
    type: "Jalón",
    title: "PULL",
    postCardio: "Cardio: Zona 2 — 20-30 min",
    cardioProtocol: "",
    packageIds: [],
    customExercises: [
      { id: "ex_dominadas_e2", name: "Dominadas", sets: "5", reps: "submáx", rest: "120-180s", note: "PESADO — primero, prioridad" },
      { id: "ex_jalon_pecho_e2", name: "Jalón al pecho (G2)", sets: "3", reps: "8-10", rest: "90-120s", note: "" },
      { id: "ex_remo_sentado_e2", name: "Remo sentado (G2)", sets: "4", reps: "6-8", rest: "120-180s", note: "PESADO" },
      { id: "ex_curl_manc_e2", name: "Curl con mancuerna", sets: "4", reps: "6-8", rest: "120-180s", note: "PESADO — bíceps" },
      { id: "ex_curl_martillo_e2", name: "Curl martillo", sets: "3", reps: "10-12", rest: "60-90s", note: "braquial, grosor" },
      { id: "ex_face_pull_e2", name: "Face pull (G2)", sets: "3", reps: "15-20", rest: "60-90s", note: "salud de hombro" },
    ],
  },
  {
    id: "d_mie",
    shortDay: "MIE",
    fullDay: "Miércoles",
    type: "Pierna",
    title: "LOWER (cuádriceps) + ABS",
    postCardio: "Cardio: Bici o caminata inclinada — 15-20 min (cero impacto)",
    cardioProtocol: "",
    packageIds: [],
    customExercises: [
      { id: "ex_sentadilla_goblet_e2", name: "Sentadilla goblet mancuerna", sets: "4", reps: "10-15", rest: "90-120s", note: "" },
      { id: "ex_bulgaras_manc_e2", name: "Búlgaras mancuerna", sets: "3", reps: "8-12", rest: "90s", note: "torso vertical, c/p" },
      { id: "ex_extension_pierna_e2", name: "Extensión de pierna (G2)", sets: "3", reps: "10-15", rest: "60-90s", note: "0-1 RIR" },
      { id: "ex_peso_muerto_rum_e2", name: "Peso muerto rumano mancuerna", sets: "3", reps: "8-10", rest: "90-120s", note: "femoral" },
      { id: "ex_pantorrilla_pie_e2", name: "Pantorrilla de pie", sets: "4", reps: "12-20", rest: "60-90s", note: "pausa abajo" },
      { id: "ex_abs_leg_raise_e2", name: "ABS A: Elevación de piernas colgado", sets: "3", reps: "8-12", rest: "60-90s", note: "alimenta L-sit y muscle-up" },
      { id: "ex_abs_plancha_lat_e2", name: "ABS B: Plancha lateral", sets: "2", reps: "30-45s", rest: "45s", note: "c/l" },
    ],
  },
  {
    id: "d_jue",
    shortDay: "JUE",
    fullDay: "Jueves",
    type: "Torso",
    title: "UPPER",
    postCardio: "Cardio: Zona 2 — 20-30 min",
    cardioProtocol: "",
    packageIds: [],
    customExercises: [
      { id: "ex_chin_ups_e2", name: "Chin-ups (palmas hacia ti)", sets: "4", reps: "submáx", rest: "120-180s", note: "jala + bíceps" },
      { id: "ex_bench_dips_e2", name: "Bench dips + mancuerna en regazo", sets: "4", reps: "8-12", rest: "90-120s", note: "sustituto de fondos — clave muscle-up" },
      { id: "ex_press_inc_manc_up_e2", name: "Press inclinado mancuerna", sets: "3", reps: "10-12", rest: "90-120s", note: "2ª dosis pecho" },
      { id: "ex_remo_banco_e2", name: "Remo apoyado en banco o jalón (G2)", sets: "3", reps: "10-12", rest: "90-120s", note: "" },
      { id: "ex_lateral_polea_e2", name: "Lateral en polea", sets: "3", reps: "12-20", rest: "60-90s", note: "2ª dosis hombro" },
      { id: "ex_curl_scott_e2", name: "Curl scott o concentrado", sets: "3", reps: "12-15", rest: "60-90s", note: "BOMBEO — pico" },
    ],
  },
  {
    id: "d_vie",
    shortDay: "VIE",
    fullDay: "Viernes",
    type: "Pierna",
    title: "LOWER (femoral/glúteo) + ABS",
    postCardio: "Cardio: Bici o caminata inclinada — 15-20 min",
    cardioProtocol: "",
    packageIds: [],
    customExercises: [
      { id: "ex_pm_rumano_femoral_e2", name: "Peso muerto rumano mancuerna", sets: "4", reps: "8-10", rest: "120-180s", note: "PESADO — rey del femoral" },
      { id: "ex_hip_thrust_manc_e2", name: "Hip thrust mancuerna en banco", sets: "4", reps: "10-15", rest: "90-120s", note: "aprieta arriba" },
      { id: "ex_bulgaras_gluteo_e2", name: "Búlgaras torso adelante", sets: "3", reps: "10-12", rest: "90s", note: "glúteo, c/p" },
      { id: "ex_curl_femoral_e2", name: "Curl femoral (G2)", sets: "3", reps: "10-15", rest: "60-90s", note: "" },
      { id: "ex_hiperextensiones_e2", name: "Hiperextensiones banco romano", sets: "3", reps: "12-20", rest: "60-90s", note: "" },
      { id: "ex_pantorrilla_pie_2_e2", name: "Pantorrilla de pie", sets: "4", reps: "12-20", rest: "60-90s", note: "" },
      { id: "ex_abs_crunch_polea_2_e2", name: "ABS A: Crunch en polea de rodillas", sets: "3", reps: "10-15", rest: "60-90s", note: "2ª dosis con carga" },
      { id: "ex_abs_leg_raise_2_e2", name: "ABS B: Elevación de piernas colgado", sets: "2", reps: "8-12", rest: "60s", note: "" },
    ],
  },
  {
    id: "d_sab",
    shortDay: "SAB",
    fullDay: "Sábado",
    type: "Cardio",
    title: "LONG RUN + DOMINADAS",
    postCardio: "",
    cardioProtocol: "Carrera Zona 2: 45-75 min (TOPE en déficit). Dominadas frescas repartidas: 1-2 reps, lejos del fallo (GtG). Flexiones variadas + core suave a gusto.",
    packageIds: [],
    customExercises: [
      { id: "ex_carrera_z2_e2", name: "Carrera Zona 2", sets: "1", reps: "45-75 min", rest: "—", note: "TOPE en déficit" },
      { id: "ex_dominadas_frescas_e2", name: "Dominadas frescas repartidas", sets: "var", reps: "1-2", rest: "—", note: "lejos del fallo, varias series (GtG)" },
      { id: "ex_flexiones_core_e2", name: "Flexiones variadas + core suave", sets: "var", reps: "a gusto", rest: "—", note: "Acumulas reps sin fatiga" },
    ],
  },
  {
    id: "d_dom",
    shortDay: "DOM",
    fullDay: "Domingo",
    type: "Movilidad",
    title: "YOGA + MOVILIDAD",
    postCardio: "",
    cardioProtocol: "Yoga / movilidad / estiramiento: tu rutina de 30 min ya diseñada (30-60 min). Caminata con Apollo (opcional): flujo de sangre sin costo (30-45 min). Recuperar es la otra mitad del trabajo.",
    packageIds: [],
    customExercises: [
      { id: "ex_yoga_mov_e2", name: "Yoga / movilidad / estiramiento", sets: "1", reps: "30-60 min", rest: "—", note: "tu rutina de 30 min ya diseñada" },
      { id: "ex_caminata_apollo_e2", name: "Caminata con Apollo (opcional)", sets: "1", reps: "30-45 min", rest: "—", note: "flujo de sangre sin costo" },
    ],
  },
];

const DEFAULT_STATE = {
  dayIndex: 0,
  sessionDate: todayInZone(DEFAULT_SETTINGS.timezone),
  settings: DEFAULT_SETTINGS,
  routine: DEFAULT_ROUTINE,
  exercisePackages: DEFAULT_PACKAGES,
  trainingLogs: {},
  trainingLogMeta: {},
  exerciseNotes: {},
  weightLogs: [],
  onboarding: {
    completed: false,
    source: null,
    completedAt: null,
  },
};

// ============================================================================
// 4. STATE MODEL + NORMALIZATION
// ============================================================================
const USER_TEXT_REPLACEMENTS = {
  "Aperturas / Flys": "Aperturas",
  "Pájaros / Rear delts": "Pájaros / Deltoide posterior",
  "Cardio Z2": "Cardio suave",
  "Full Body A": "Cuerpo completo A",
  "Full Body B": "Cuerpo completo B",
  Push: "Empuje",
  Pull: "Jalón",
  Legs: "Pierna",
  Upper: "Torso",
  Lower: "Pierna",
  "Top set + backoffs": "Serie principal y series de apoyo",
  "10-20 min Z2 opcional": "10-20 min suave opcional",
  "Sesion principal": "Sesión principal",
  "35-45 min en zona 2. Debes poder mantener conversacion corta.": "35-45 min a ritmo suave. Debes poder mantener una conversación corta.",
  "Goblet squat": "Sentadilla con mancuerna",
  "Back squat": "Sentadilla con barra",
  "Push-up": "Lagartija",
  "Bench press": "Press banca",
  "One-arm row": "Remo a una mano",
  "Chest supported row": "Remo con soporte",
  "Romanian deadlift": "Peso muerto rumano",
  Plank: "Plancha",
  "Bulgarian split squat": "Sentadilla búlgara",
  "Leg press": "Prensa",
  "Floor press": "Press en piso",
  "Incline dumbbell press": "Press inclinado con mancuernas",
  "Band pulldown": "Jalón con banda",
  "Lat pulldown": "Jalón al pecho",
  "Farmer carry": "Caminata con peso",
  "Dumbbell press": "Press con mancuernas",
  "Barbell bench press": "Press banca con barra",
  "Shoulder press": "Press hombro",
  "Seated shoulder press": "Press hombro sentado",
  "Push-up deficit": "Lagartija con elevación",
  "Incline machine press": "Press inclinado en máquina",
  "Lateral raise": "Elevación lateral",
  "Triceps extension": "Extensión de tríceps",
  "Pull-up / band row": "Dominada / remo con banda",
  "Weighted pull-up": "Dominada con peso",
  "Chest supported DB row": "Remo con mancuernas",
  "T-bar row": "Remo en barra T",
  "Pullover / straight-arm pulldown": "Pullover / jalón con brazos rectos",
  "Rear delt fly": "Pájaros",
  "Biceps curl": "Curl bíceps",
  "Hack squat": "Sentadilla hack",
  "Walking lunge": "Desplante caminando",
  "Leg extension": "Extensión de pierna",
  "Leg curl": "Curl femoral",
  "Calf raise": "Elevación de pantorrilla",
  "Incline barbell press": "Press inclinado con barra",
  "Pull-up": "Dominada",
  "Dumbbell shoulder press": "Press hombro con mancuernas",
  "Machine shoulder press": "Press hombro en máquina",
  "Cable row": "Remo en polea",
  "Arms superset": "Brazos combinados",
  "Split squat": "Sentadilla dividida",
  "Step-up": "Subida a banco",
  "Abs circuit": "Circuito de abdomen",
  Tiron: "Tirón",
};

function cleanUserText(value) {
  if (typeof value !== "string") return value;
  const replacement = USER_TEXT_REPLACEMENTS[value.trim()];
  return replacement || value;
}

function parseJson(raw, fallback) {
  try {
    const parsed = JSON.parse(raw);
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

function makeId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function numericSetValue(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value !== "string") return 0;
  const normalized = value.trim().replace(",", ".");
  const match = normalized.match(/^(-?\d+(?:\.\d+)?)/);
  return match ? Number(match[1]) || 0 : 0;
}

function normalizeSetField(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : "";
  if (typeof value === "string") return value.trim();
  return "";
}

function hasSetField(value) {
  return String(value ?? "").trim().length > 0;
}

function formatSetWeight(value) {
  const text = String(value ?? "").trim();
  if (!text) return "—";
  return /^-?\d+(?:[.,]\d+)?$/.test(text) ? `${text} kg` : text;
}

function averageWeight(sets) {
  const numericWeights = sets.map((item) => numericSetValue(item.weight)).filter((value) => value > 0);
  if (!numericWeights.length) return null;
  const sum = numericWeights.reduce((acc, value) => acc + value, 0);
  return sum / numericWeights.length;
}

function normalizeSet(candidate) {
  const weight = normalizeSetField(candidate?.weight ?? candidate?.w ?? "");
  const reps = normalizeSetField(candidate?.reps ?? candidate?.r ?? "");
  return {
    weight,
    reps,
    ts: candidate?.ts || Date.now(),
  };
}

function migrateFlatLogs(flatLogs, tz) {
  const nested = {};
  Object.entries(flatLogs || {}).forEach(([key, value]) => {
    if (!Array.isArray(value)) return;
    let dayId = "legacy_day";
    let date = todayInZone(tz);
    let exerciseId = `legacy_${Math.random().toString(36).slice(2, 6)}`;

    const newFlatFormat = key.match(/^(d_[a-z]+)__(\d{4}-\d{2}-\d{2})__(.+)$/i);
    if (newFlatFormat) {
      dayId = newFlatFormat[1];
      date = newFlatFormat[2];
      exerciseId = newFlatFormat[3];
    }

    if (!nested[dayId]) nested[dayId] = {};
    if (!nested[dayId][date]) nested[dayId][date] = {};
    nested[dayId][date][exerciseId] = value.map(normalizeSet);
  });
  return nested;
}

function normalizeExerciseNotes(candidate) {
  if (!candidate || typeof candidate !== "object") return {};
  const out = {};
  Object.entries(candidate).forEach(([dayId, byDate]) => {
    if (!byDate || typeof byDate !== "object") return;
    out[dayId] = {};
    Object.entries(byDate).forEach(([date, byExercise]) => {
      if (!byExercise || typeof byExercise !== "object") return;
      out[dayId][date] = {};
      Object.entries(byExercise).forEach(([exerciseId, note]) => {
        if (typeof note === "string" && note.trim()) {
          out[dayId][date][exerciseId] = note;
        }
      });
      if (Object.keys(out[dayId][date]).length === 0) delete out[dayId][date];
    });
    if (Object.keys(out[dayId]).length === 0) delete out[dayId];
  });
  return out;
}

function normalizeTrainingLogs(candidate, tz) {
  if (!candidate || typeof candidate !== "object") return {};
  const values = Object.values(candidate);
  if (!values.length) return {};
  const likelyNested = values.every((value) => value && typeof value === "object" && !Array.isArray(value));
  if (!likelyNested) return migrateFlatLogs(candidate, tz);

  const nested = {};
  Object.entries(candidate).forEach(([dayId, byDate]) => {
    nested[dayId] = {};
    Object.entries(byDate || {}).forEach(([date, byExercise]) => {
      nested[dayId][date] = {};
      Object.entries(byExercise || {}).forEach(([exerciseId, sets]) => {
        nested[dayId][date][exerciseId] = Array.isArray(sets) ? sets.map(normalizeSet) : [];
      });
    });
  });
  return nested;
}

function normalizeTrainingLogMeta(candidate) {
  if (!candidate || typeof candidate !== "object") return {};
  const normalized = {};
  Object.entries(candidate).forEach(([dayId, byDate]) => {
    if (!byDate || typeof byDate !== "object" || Array.isArray(byDate)) return;
    Object.entries(byDate).forEach(([date, meta]) => {
      if (!meta || typeof meta !== "object" || Array.isArray(meta)) return;
      if (!normalized[dayId]) normalized[dayId] = {};
      normalized[dayId][date] = {
        dayName: String(meta.dayName || "").trim(),
        title: String(meta.title || "").trim(),
        exerciseNames: meta.exerciseNames && typeof meta.exerciseNames === "object"
          ? Object.fromEntries(
              Object.entries(meta.exerciseNames)
                .filter(([exerciseId, name]) => exerciseId && typeof name === "string" && name.trim())
                .map(([exerciseId, name]) => [exerciseId, name.trim()])
            )
          : {},
      };
    });
  });
  return normalized;
}

function summarizeTrainingLogs(trainingLogs) {
  const dates = new Set();
  let setsCount = 0;
  Object.values(trainingLogs || {}).forEach((byDate) => {
    Object.entries(byDate || {}).forEach(([date, byExercise]) => {
      let dateSets = 0;
      Object.values(byExercise || {}).forEach((sets) => {
        dateSets += Array.isArray(sets) ? sets.length : 0;
      });
      if (dateSets > 0) dates.add(date);
      setsCount += dateSets;
    });
  });
  return { trainingDays: dates.size, setsCount };
}

function normalizeOnboarding(candidate, { settings, trainingLogs, weightLogs }) {
  const raw = candidate?.onboarding && typeof candidate.onboarding === "object"
    ? candidate.onboarding
    : null;
  const activity = summarizeTrainingLogs(trainingLogs);
  const inferredCompleted = activity.setsCount > 0
    || weightLogs.length > 0
    || Boolean(settings.profileName);
  return {
    completed: typeof raw?.completed === "boolean" ? raw.completed : inferredCompleted,
    source: typeof raw?.source === "string" ? raw.source : null,
    completedAt: typeof raw?.completedAt === "string" ? raw.completedAt : null,
  };
}

function normalizeSettings(candidate) {
  const merged = { ...DEFAULT_SETTINGS, ...(candidate || {}) };
  merged.timezone = safeTimezone(merged.timezone);
  merged.startWeight = Number(merged.startWeight) || 0;
  merged.goalWeight = Number(merged.goalWeight) || 0;
  merged.profileName = String(merged.profileName || "").trim();
  merged.focusNote = String(merged.focusNote || "");
  return merged;
}

function normalizeExercise(exercise, exIndex) {
  return {
    id: exercise.id || makeId(`ex${exIndex}`),
    name: cleanUserText(exercise.name || "Nuevo ejercicio"),
    sets: exercise.sets || "3",
    reps: exercise.reps || "8-10",
    rest: exercise.rest || "90s",
    note: cleanUserText(exercise.note || ""),
  };
}

function normalizeRoutine(candidate) {
  const routine = Array.isArray(candidate) && candidate.length ? candidate : DEFAULT_ROUTINE;
  return routine.map((day, dayIndex) => {
    const legacy = Array.isArray(day.exercises) ? day.exercises.map(normalizeExercise) : [];
    const customExercises = Array.isArray(day.customExercises)
      ? day.customExercises.map(normalizeExercise)
      : legacy;
    const packageIds = Array.isArray(day.packageIds)
      ? day.packageIds.filter((id) => typeof id === "string")
      : [];
    return {
      id: day.id || makeId(`day${dayIndex}`),
      shortDay: day.shortDay || `D${dayIndex + 1}`,
      fullDay: cleanUserText(day.fullDay || `Día ${dayIndex + 1}`),
      type: cleanUserText(day.type || "Fuerza"),
      title: cleanUserText(day.title || "Sesión"),
      postCardio: cleanUserText(day.postCardio || ""),
      cardioProtocol: cleanUserText(day.cardioProtocol || ""),
      packageIds,
      customExercises,
    };
  });
}

function normalizePackages(candidate) {
  if (!Array.isArray(candidate)) return [];
  const seenPackageIds = new Set();
  return candidate
    .filter((pkg) => pkg && typeof pkg === "object")
    .map((pkg, pkgIndex) => ({
      id: pkg.id || makeId(`pkg${pkgIndex}`),
      name: cleanUserText(String(pkg.name || `Paquete ${pkgIndex + 1}`).trim()),
      color: typeof pkg.color === "string" && pkg.color.trim() ? pkg.color.trim() : "#9aa3b2",
      exercises: Array.isArray(pkg.exercises) ? pkg.exercises.map(normalizeExercise) : [],
    }))
    .filter((pkg) => {
      if (seenPackageIds.has(pkg.id)) return false;
      seenPackageIds.add(pkg.id);
      return true;
    });
}

function getDayExercises(day, packages) {
  if (!day) return [];
  const fromPackages = (day.packageIds || []).flatMap((pkgId) => {
    const pkg = (packages || []).find((p) => p.id === pkgId);
    if (!pkg) return [];
    return pkg.exercises.map((ex) => ({ ...ex, __packageId: pkg.id, __packageName: pkg.name, __packageColor: pkg.color }));
  });
  const custom = (day.customExercises || []).map((ex) => ({ ...ex, __packageId: null }));
  return [...fromPackages, ...custom];
}

function normalizeState(candidate) {
  const settings = normalizeSettings(candidate?.settings);
  const routine = normalizeRoutine(candidate?.routine);
  const hasPackagesField = candidate && Object.prototype.hasOwnProperty.call(candidate, "exercisePackages");
  const exercisePackages = hasPackagesField
    ? normalizePackages(candidate.exercisePackages)
    : DEFAULT_PACKAGES;
  const todayStr = todayInZone(settings.timezone);
  const trainingLogs = normalizeTrainingLogs(candidate?.trainingLogs, settings.timezone);
  const weightLogs = Array.isArray(candidate?.weightLogs)
    ? candidate.weightLogs.map((entry) => ({
        id: entry.id || makeId("w"),
        date: entry.date || todayStr,
        weight: Number(entry.weight) || 0,
        waist: entry.waist === null || entry.waist === undefined ? null : Number(entry.waist),
        ts: entry.ts || Date.now(),
      }))
    : [];
  return {
    dayIndex: clamp(Number(candidate?.dayIndex) || 0, 0, routine.length - 1),
    sessionDate: typeof candidate?.sessionDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(candidate.sessionDate)
      ? candidate.sessionDate
      : todayStr,
    settings,
    routine,
    exercisePackages,
    trainingLogs,
    trainingLogMeta: normalizeTrainingLogMeta(candidate?.trainingLogMeta),
    exerciseNotes: normalizeExerciseNotes(candidate?.exerciseNotes),
    weightLogs,
    onboarding: normalizeOnboarding(candidate, { settings, trainingLogs, weightLogs }),
  };
}

function alignStateSessionToToday(candidate) {
  const today = todayInZone(candidate.settings.timezone);
  return {
    ...candidate,
    sessionDate: today,
    dayIndex: clamp(weekdayIndexInZone(candidate.settings.timezone), 0, candidate.routine.length - 1),
  };
}

function normalizeDraftLogs(candidate) {
  if (!candidate || typeof candidate !== "object") return {};
  const normalized = {};
  Object.entries(candidate).forEach(([sessionKey, byExercise]) => {
    if (!byExercise || typeof byExercise !== "object" || Array.isArray(byExercise)) return;
    normalized[sessionKey] = {};
    Object.entries(byExercise).forEach(([exerciseId, sets]) => {
      normalized[sessionKey][exerciseId] = Array.isArray(sets) ? sets.map(normalizeSet) : [];
    });
  });
  return normalized;
}

function cloneSnapshot(snapshot) {
  return normalizeState(parseJson(JSON.stringify(snapshot), DEFAULT_STATE));
}

function makeDraftSessionKey(dayId, date) {
  return `${dayId}__${date}`;
}

// ============================================================================
// 5. STORAGE (localStorage)
// ============================================================================
function safeLocalGet(key) {
  try { return window.localStorage.getItem(key); } catch { return null; }
}

function safeLocalSet(key, value) {
  try { window.localStorage.setItem(key, value); return true; } catch { return false; }
}

function safeLocalRemove(key) {
  try { window.localStorage.removeItem(key); return true; } catch { return false; }
}

function scopedKey(prefix, scope) {
  return `${prefix}_${scope || LOCAL_SCOPE}`;
}

function loadLocalState(scope) {
  let loaded = null;
  const raw = safeLocalGet(scopedKey(STATE_KEY_PREFIX, scope));
  if (raw) {
    const parsed = parseJson(raw, null);
    if (parsed && typeof parsed === "object") {
      loaded = normalizeState(parsed);
    }
  }

  if (!loaded && scope === LOCAL_SCOPE) {
    for (const legacyKey of LEGACY_STATE_KEYS) {
      const legacyRaw = safeLocalGet(legacyKey);
      if (!legacyRaw) continue;
      const parsed = parseJson(legacyRaw, null);
      if (parsed && typeof parsed === "object") {
        loaded = normalizeState(parsed);
        break;
      }
    }
    if (!loaded) {
      for (const legacyBackupKey of LEGACY_BACKUP_KEYS) {
        const backups = parseJson(safeLocalGet(legacyBackupKey), []);
        if (!Array.isArray(backups)) continue;
        for (let idx = backups.length - 1; idx >= 0; idx -= 1) {
          const snapshot = backups[idx]?.snapshot;
          if (snapshot && typeof snapshot === "object") {
            loaded = normalizeState(snapshot);
            break;
          }
        }
        if (loaded) break;
      }
    }
  }

  if (!loaded) {
    loaded = normalizeState(DEFAULT_STATE);
  }

  // Apply Elite 2.0 migration (V2 flag to force upgrade)
  const migrationFlag = `fitapp_migrated_to_elite_2_0_v2_${scope || LOCAL_SCOPE}`;
  if (safeLocalGet(migrationFlag) !== "true") {
    loaded.routine = DEFAULT_ROUTINE;
    loaded.updatedAt = new Date().toISOString();
    safeLocalSet(scopedKey(STATE_KEY_PREFIX, scope || LOCAL_SCOPE), JSON.stringify(loaded));
    safeLocalSet(migrationFlag, "true");
  }

  return loaded;
}

function readDeviceStateCandidate(userId) {
  if (!userId || safeLocalGet(`${DEVICE_IMPORT_FLAG_PREFIX}_${userId}`) === "true") return null;

  const candidates = [safeLocalGet(scopedKey(STATE_KEY_PREFIX, LOCAL_SCOPE))];
  LEGACY_STATE_KEYS.forEach((key) => candidates.push(safeLocalGet(key)));

  for (const raw of candidates) {
    if (!raw) continue;
    const parsed = parseJson(raw, null);
    if (parsed && typeof parsed === "object") return normalizeState(parsed);
  }

  for (const key of LEGACY_BACKUP_KEYS) {
    const backups = parseJson(safeLocalGet(key), []);
    if (!Array.isArray(backups)) continue;
    for (let index = backups.length - 1; index >= 0; index -= 1) {
      const snapshot = backups[index]?.snapshot;
      if (snapshot && typeof snapshot === "object") return normalizeState(snapshot);
    }
  }
  return null;
}

function summarizeDeviceState(candidate) {
  if (!candidate) {
    return { hasRecoverableData: false, trainingDays: 0, setsCount: 0, routineDays: 0, weightLogs: 0 };
  }
  const activity = summarizeTrainingLogs(candidate.trainingLogs);
  return {
    hasRecoverableData: true,
    ...activity,
    routineDays: candidate.routine?.length || 0,
    weightLogs: candidate.weightLogs?.length || 0,
  };
}

function mergeTrainingLogs(accountLogs, deviceLogs) {
  const merged = parseJson(JSON.stringify(accountLogs || {}), {});
  Object.entries(deviceLogs || {}).forEach(([dayId, byDate]) => {
    if (!merged[dayId]) merged[dayId] = {};
    Object.entries(byDate || {}).forEach(([date, byExercise]) => {
      if (!merged[dayId][date]) merged[dayId][date] = {};
      Object.entries(byExercise || {}).forEach(([exerciseId, sets]) => {
        if (Array.isArray(sets) && sets.length > 0) merged[dayId][date][exerciseId] = sets;
      });
    });
  });
  return merged;
}

function mergeTrainingMeta(accountMeta, deviceMeta) {
  const merged = parseJson(JSON.stringify(accountMeta || {}), {});
  Object.entries(deviceMeta || {}).forEach(([dayId, byDate]) => {
    if (!merged[dayId]) merged[dayId] = {};
    Object.entries(byDate || {}).forEach(([date, meta]) => {
      merged[dayId][date] = {
        ...(merged[dayId][date] || {}),
        ...(meta || {}),
        exerciseNames: {
          ...(merged[dayId][date]?.exerciseNames || {}),
          ...(meta?.exerciseNames || {}),
        },
      };
    });
  });
  return merged;
}

function mergeExerciseNotes(accountNotes, deviceNotes) {
  const merged = parseJson(JSON.stringify(accountNotes || {}), {});
  Object.entries(deviceNotes || {}).forEach(([dayId, byDate]) => {
    if (!merged[dayId]) merged[dayId] = {};
    Object.entries(byDate || {}).forEach(([date, byExercise]) => {
      merged[dayId][date] = { ...(merged[dayId][date] || {}), ...(byExercise || {}) };
    });
  });
  return merged;
}

function mergeDeviceStateIntoAccount(accountState, deviceState, profileName) {
  const normalizedAccount = normalizeState(accountState);
  const normalizedDevice = normalizeState(deviceState);
  const weightEntries = [...normalizedAccount.weightLogs, ...normalizedDevice.weightLogs];
  const weightLogs = [...new Map(weightEntries.map((entry) => [entry.id, entry])).values()];
  return alignStateSessionToToday(normalizeState({
    ...normalizedAccount,
    settings: {
      ...normalizedAccount.settings,
      ...normalizedDevice.settings,
      profileName: profileName || normalizedDevice.settings.profileName || normalizedAccount.settings.profileName,
    },
    routine: normalizedDevice.routine,
    exercisePackages: normalizedDevice.exercisePackages,
    trainingLogs: mergeTrainingLogs(normalizedAccount.trainingLogs, normalizedDevice.trainingLogs),
    trainingLogMeta: mergeTrainingMeta(normalizedAccount.trainingLogMeta, normalizedDevice.trainingLogMeta),
    exerciseNotes: mergeExerciseNotes(normalizedAccount.exerciseNotes, normalizedDevice.exerciseNotes),
    weightLogs,
    onboarding: {
      completed: true,
      source: "device-recovery",
      completedAt: new Date().toISOString(),
    },
  }));
}

function saveLocalState(state, scope, forceBackup = false) {
  const now = Date.now();
  const payload = { ...state, version: 4, updatedAt: new Date(now).toISOString() };

  if (!safeLocalSet(scopedKey(STATE_KEY_PREFIX, scope), JSON.stringify(payload))) {
    return { ok: false, error: "No se pudo guardar en este dispositivo.", backupCount: 0, lastSavedAt: null, lastBackupAt: null };
  }

  const backupKey = scopedKey(BACKUP_KEY_PREFIX, scope);
  const backups = parseJson(safeLocalGet(backupKey), []);
  const lastBackupAt = Number(backups[backups.length - 1]?.ts || 0);
  const shouldBackup = forceBackup || !lastBackupAt || now - lastBackupAt > AUTO_BACKUP_MS;
  let nextBackups = backups;

  if (shouldBackup) {
    nextBackups = [...backups, { ts: now, snapshot: payload }];
    if (nextBackups.length > MAX_BACKUPS) nextBackups = nextBackups.slice(-MAX_BACKUPS);
    safeLocalSet(backupKey, JSON.stringify(nextBackups));
  }

  return {
    ok: true,
    error: null,
    backupCount: Array.isArray(nextBackups) ? nextBackups.length : 0,
    lastSavedAt: payload.updatedAt,
    lastBackupAt: nextBackups[nextBackups.length - 1]?.ts || null,
  };
}

function loadDrafts(scope) {
  return normalizeDraftLogs(parseJson(safeLocalGet(scopedKey(DRAFT_KEY_PREFIX, scope)), {}));
}

function saveDrafts(drafts, scope) {
  return safeLocalSet(scopedKey(DRAFT_KEY_PREFIX, scope), JSON.stringify(drafts));
}

function loadSyncQueue(scope) {
  const parsed = parseJson(safeLocalGet(scopedKey(SYNC_QUEUE_KEY_PREFIX, scope)), null);
  if (!parsed || typeof parsed !== "object") {
    return { pending: null, retries: 0, lastError: null, updatedAt: null };
  }
  return {
    pending: parsed.pending && typeof parsed.pending === "object" ? normalizeState(parsed.pending) : null,
    retries: Number(parsed.retries) || 0,
    lastError: parsed.lastError || null,
    updatedAt: parsed.updatedAt || null,
  };
}

function saveSyncQueue(queue, scope) {
  return safeLocalSet(scopedKey(SYNC_QUEUE_KEY_PREFIX, scope), JSON.stringify(queue));
}

// ============================================================================
// 6. CLOUD SYNC
// ============================================================================
async function fetchCloudState(userId) {
  if (!supabase || !userId) return { ok: false, reason: "disabled", payload: null, cloudUpdatedAt: null };
  const { data, error } = await supabase
    .from(CLOUD_TABLE)
    .select("payload,updated_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) return { ok: false, reason: error.message, payload: null, cloudUpdatedAt: null };
  if (!data?.payload || typeof data.payload !== "object") {
    return { ok: true, reason: null, payload: null, cloudUpdatedAt: data?.updated_at || null };
  }
  return {
    ok: true,
    reason: null,
    payload: normalizeState(data.payload),
    cloudUpdatedAt: data?.updated_at || null,
  };
}

async function pushCloudState(payload, userId) {
  if (!supabase || !userId) return { ok: false, reason: "disabled", cloudUpdatedAt: null };
  const row = { payload, updated_at: new Date().toISOString(), user_id: userId };
  const { data, error } = await supabase
    .from(CLOUD_TABLE)
    .upsert(row, { onConflict: "user_id" })
    .select("updated_at")
    .single();

  if (error) return { ok: false, reason: error.message, cloudUpdatedAt: null };
  return { ok: true, reason: null, cloudUpdatedAt: data?.updated_at || null };
}

// ============================================================================
// 7. EXERCISE HISTORY + REST PARSING
// ============================================================================
function normalizeAuthUiError(caught) {
  const raw = String(caught?.message || caught?.error_description || caught?.msg || "").trim();
  const code = String(caught?.code || caught?.error_code || caught?.status || "").trim().toLowerCase();
  const lower = raw.toLowerCase();

  if (!raw) {
    return "No se pudo completar la conexión.";
  }

  if (code === "invalid_credentials" || lower.includes("invalid login credentials")) {
    return "Correo o contraseña incorrectos. Si acabas de crear tu cuenta, confirma tu correo antes de entrar.";
  }

  if (code === "email_not_confirmed" || lower.includes("email not confirmed") || lower.includes("not confirmed")) {
    return "Falta confirmar tu correo. Revisa tu bandeja o reenvía la confirmación.";
  }

  if (code === "signup_disabled" || lower.includes("signups not allowed") || lower.includes("signup is disabled")) {
    return "No se pueden crear cuentas nuevas en este momento.";
  }

  if (lower.includes("user already registered") || lower.includes("already registered")) {
    return "Esta cuenta ya existe. Inicia sesión o recupera tu contraseña.";
  }

  if (lower.includes("rate limit") || lower.includes("too many requests")) {
    return "Demasiados intentos. Espera un momento y vuelve a intentar.";
  }

  if (lower.includes("load failed") || lower.includes("fetch failed") || lower.includes("network request failed")) {
    return "No se pudo conectar. Revisa tu internet y vuelve a intentar.";
  }

  if (lower.includes("failed to fetch")) {
    return "La conexión falló antes de iniciar sesión. Recarga la app y vuelve a intentar.";
  }

  return raw;
}

function parseRestSeconds(raw) {
  if (!raw || typeof raw !== "string") return 90;
  const text = raw.toLowerCase();
  const secMatch = text.match(/(\d+(?:\.\d+)?)\s*s/);
  if (secMatch) return Math.max(15, Math.round(Number(secMatch[1])));
  const minMatch = text.match(/(\d+(?:\.\d+)?)\s*min/);
  if (minMatch) return Math.max(15, Math.round(Number(minMatch[1]) * 60));
  const plainNumber = text.match(/(\d+(?:\.\d+)?)/);
  if (plainNumber) {
    const value = Number(plainNumber[1]);
    if (!Number.isNaN(value)) return value <= 10 ? Math.round(value * 60) : Math.round(value);
  }
  return 90;
}

function getExerciseHistory(trainingLogs, dayId, exerciseId) {
  const dayLogs = trainingLogs?.[dayId] || {};
  const history = Object.entries(dayLogs)
    .map(([date, byExercise]) => {
      const sets = Array.isArray(byExercise?.[exerciseId]) ? byExercise[exerciseId] : [];
      return { date, sets };
    })
    .filter((entry) => entry.sets.length > 0)
    .sort((a, b) => b.date.localeCompare(a.date));
  return history.map((entry) => {
    const max = Math.max(...entry.sets.map((item) => numericSetValue(item.weight)));
    const avg = averageWeight(entry.sets);
    const last = entry.sets[entry.sets.length - 1];
    return { ...entry, max, avg, last };
  });
}

// ============================================================================
// 8. UI COMPONENTS
// ============================================================================
function Field({ label, value, onChange, type = "text", step, placeholder, autoComplete, inputMode }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input
        className="input"
        type={type}
        step={step}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        inputMode={inputMode}
      />
    </label>
  );
}

function StatCard({ label, value, meta, tone = "accent" }) {
  return (
    <article className={`stat-card tone-${tone}`}>
      <p className="stat-label">{label}</p>
      <p className="stat-value">{value}</p>
      <p className="stat-meta">{meta}</p>
    </article>
  );
}

function MiniLineChart({ points, color = "#d83b2d", height = 120 }) {
  const width = 320;
  if (!Array.isArray(points) || points.length < 2) {
    return (
      <div className="chart-empty">
        <p className="muted">Sin datos suficientes para gráfica.</p>
      </div>
    );
  }
  const xs = points.map((item) => Number(item.x) || 0);
  const ys = points.map((item) => Number(item.y) || 0);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const spanX = Math.max(1, maxX - minX);
  const spanY = Math.max(1, maxY - minY);

  const mapped = points.map((point) => {
    const x = ((point.x - minX) / spanX) * (width - 20) + 10;
    const y = height - (((point.y - minY) / spanY) * (height - 20) + 10);
    return { x, y };
  });

  const linePath = mapped.map((item, index) => `${index === 0 ? "M" : "L"}${item.x.toFixed(2)} ${item.y.toFixed(2)}`).join(" ");
  const areaPath = `${linePath} L ${mapped[mapped.length - 1].x.toFixed(2)} ${height - 8} L ${mapped[0].x.toFixed(2)} ${height - 8} Z`;

  return (
    <svg className="mini-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Gráfica">
      <path d={areaPath} fill={`${color}26`} />
      <path d={linePath} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      {mapped.map((item, index) => (
        <circle key={`pt_${index}`} cx={item.x} cy={item.y} r="2.5" fill={color} />
      ))}
    </svg>
  );
}

function AuthScreen({ supabaseConfigured, authMessage = "", onContinueLocal }) {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [resendingConfirmation, setResendingConfirmation] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const isLogin = mode === "login";

  const onSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setNotice("");
    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail || !trimmedEmail.includes("@")) {
      setError("Ingresa un correo válido.");
      return;
    }
    if (!password || password.length < 6) {
      setError("La contraseña debe tener al menos 6 caracteres.");
      return;
    }

    setSubmitting(true);
    try {
      if (isLogin) {
        const { error: authError } = await supabase.auth.signInWithPassword({
          email: trimmedEmail,
          password,
        });
        if (authError) {
          setError(normalizeAuthUiError(authError));
        }
      } else {
        const { data, error: authError } = await supabase.auth.signUp({
          email: trimmedEmail,
          password,
          options: {
            emailRedirectTo: SUPABASE_AUTH_REDIRECT_URL || window.location.origin,
            data: { display_name: displayName.trim() || trimmedEmail.split("@")[0] },
          },
        });
        if (authError) {
          setError(normalizeAuthUiError(authError));
        } else if (!data.session) {
          setNotice("Cuenta creada. Revisa tu correo para confirmar y luego inicia sesión.");
          setMode("login");
        }
      }
    } catch (caught) {
      setError(normalizeAuthUiError(caught));
    } finally {
      setSubmitting(false);
    }
  };

  const onResetPassword = async () => {
    setError("");
    setNotice("");
    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail || !trimmedEmail.includes("@")) {
      setError("Escribe tu correo arriba para enviar el link de recuperación.");
      return;
    }
    try {
      const { error: authError } = await supabase.auth.resetPasswordForEmail(trimmedEmail, {
        redirectTo: SUPABASE_AUTH_REDIRECT_URL || window.location.origin,
      });
      if (authError) {
        setError(normalizeAuthUiError(authError));
        return;
      }
      setNotice("Te enviamos un correo para restablecer la contraseña.");
    } catch (caught) {
      setError(normalizeAuthUiError(caught));
    }
  };

  const onResendConfirmation = async () => {
    setError("");
    setNotice("");
    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail || !trimmedEmail.includes("@")) {
      setError("Escribe tu correo arriba para reenviar la confirmación.");
      return;
    }

    setResendingConfirmation(true);
    try {
      const { error: authError } = await supabase.auth.resend({
        type: "signup",
        email: trimmedEmail,
        options: {
          emailRedirectTo: SUPABASE_AUTH_REDIRECT_URL || window.location.origin,
        },
      });
      if (authError) {
        setError(normalizeAuthUiError(authError));
        return;
      }
      setNotice("Te reenviamos el correo de confirmación.");
    } catch (caught) {
      setError(normalizeAuthUiError(caught));
    } finally {
      setResendingConfirmation(false);
    }
  };

  if (!supabaseConfigured) {
    return (
      <div className="gate-shell gate-overlay">
        <div className="gate-card gate-card-wide">
          <div className="auth-brand">
            <BrandLogo size={56} />
            <div>
              <p className="gate-tag">ANVIL</p>
              <h1>Cuenta no disponible</h1>
            </div>
          </div>
          <p className="gate-sub">
            En este momento no se puede iniciar sesión. Puedes seguir usando tus datos en este dispositivo.
          </p>
          {authMessage && <p className="error-text">{authMessage}</p>}
          {onContinueLocal && (
            <button className="btn btn-primary btn-large top-10" type="button" onClick={onContinueLocal}>
              Usar este dispositivo
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="gate-shell gate-overlay">
      <div className="gate-card gate-card-wide">
        <div className="auth-brand">
          <BrandLogo size={56} />
          <div>
            <p className="gate-tag">ANVIL</p>
            <h1>{isLogin ? "Bienvenido de vuelta" : "Crea tu cuenta"}</h1>
          </div>
        </div>
        <p className="gate-sub">
          {isLogin
            ? "Entra con tu correo y contraseña. Tu progreso se guarda automáticamente."
            : "Registra tu correo y contraseña. Cada cuenta tiene su propia rutina y progreso."}
        </p>
        {authMessage && <p className="error-text">{authMessage}</p>}
        <p className="tiny-note">Las cuentas nuevas deben confirmarse desde el correo antes de entrar.</p>
        <div className="row gap-8 top-6 auth-mode-row">
          <button
            type="button"
            className={`btn btn-mini ${isLogin ? "btn-primary" : "btn-ghost"}`}
            onClick={() => { setMode("login"); setError(""); setNotice(""); }}
          >
            Iniciar sesión
          </button>
          <button
            type="button"
            className={`btn btn-mini ${!isLogin ? "btn-primary" : "btn-ghost"}`}
            onClick={() => { setMode("signup"); setError(""); setNotice(""); }}
          >
            Crear cuenta
          </button>
        </div>

        <form onSubmit={onSubmit} className="stack gap-10 top-10">
          {!isLogin && (
            <Field
              label="Tu nombre (opcional)"
              value={displayName}
              onChange={setDisplayName}
              placeholder="Ej. Sebastián"
              autoComplete="name"
            />
          )}
          <Field
            label="Correo"
            type="email"
            value={email}
            onChange={setEmail}
            placeholder="correo@ejemplo.com"
            autoComplete="email"
            inputMode="email"
          />
          <Field
            label="Contraseña"
            type="password"
            value={password}
            onChange={setPassword}
            placeholder="Mínimo 6 caracteres"
            autoComplete={isLogin ? "current-password" : "new-password"}
          />
          {error && <p className="error-text">{error}</p>}
          {notice && <p className="trend">{notice}</p>}
          <button className="btn btn-primary btn-large" type="submit" disabled={submitting}>
            {submitting ? "Enviando..." : isLogin ? "Entrar" : "Crear cuenta"}
          </button>
        </form>

        {isLogin && (
          <div className="row gap-8 wrap top-8">
            <button type="button" className="btn btn-ghost btn-mini" onClick={onResetPassword}>
              Crear o cambiar contraseña
            </button>
            <button type="button" className="btn btn-soft btn-mini" onClick={onResendConfirmation} disabled={resendingConfirmation}>
              {resendingConfirmation ? "Enviando..." : "Reenviar confirmación"}
            </button>
          </div>
        )}
        {onContinueLocal && (
          <button type="button" className="btn btn-ghost btn-large top-10" onClick={onContinueLocal}>
            Entrar sin cuenta
          </button>
        )}
      </div>
    </div>
  );
}

function TimezoneSelect({ value, onChange }) {
  const detected = useMemo(() => detectBrowserTimezone(), []);
  const options = useMemo(() => {
    const set = new Set([detected, ...COMMON_TIMEZONES]);
    if (value) set.add(value);
    return [...set];
  }, [detected, value]);

  return (
    <label className="field">
      <span>Zona horaria</span>
      <div className="row gap-8">
        <select className="input" value={value} onChange={(event) => onChange(event.target.value)}>
          {options.map((tz) => (
            <option key={tz} value={tz}>
              {tz === detected ? `${tz} (detectada)` : tz}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="btn btn-soft btn-mini"
          onClick={() => onChange(detected)}
          title="Usar la zona del navegador"
        >
          Auto
        </button>
      </div>
    </label>
  );
}

const COLOR_OPTIONS = [
  { name: "Rojo", value: "#d83b2d" },
  { name: "Naranja", value: "#ff7e5f" },
  { name: "Amarillo", value: "#d9a441" },
  { name: "Verde", value: "#35c26c" },
  { name: "Cian", value: "#2dc7d8" },
  { name: "Azul", value: "#5b9bd5" },
  { name: "Morado", value: "#a06cd5" },
  { name: "Rosa", value: "#ff5f7e" },
  { name: "Gris", value: "#9aa3b2" },
];

function ColorPicker({ value, onChange }) {
  return (
    <label className="field">
      <span>Color</span>
      <div className="color-picker-row">
        <span className="color-swatch" style={{ background: value }} aria-hidden="true" />
        <select className="input" value={value} onChange={(event) => onChange(event.target.value)}>
          {COLOR_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.name}</option>
          ))}
          {!COLOR_OPTIONS.some((opt) => opt.value === value) && (
            <option value={value}>Personalizado</option>
          )}
        </select>
      </div>
    </label>
  );
}

function beepSound(freq = 880, ms = 150) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = "sine";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + ms / 1000);
    osc.start();
    osc.stop(ctx.currentTime + ms / 1000);
    setTimeout(() => ctx.close().catch(() => {}), ms + 100);
  } catch {
    // ignore audio errors
  }
}

function vibrateDevice(pattern = [120]) {
  try { navigator.vibrate?.(pattern); } catch { /* ignore */ }
}

// Olympic plate sizes (kg) common in most gyms
const PLATE_SIZES = [25, 20, 15, 10, 5, 2.5, 1.25];
const BAR_WEIGHT = 20;

function calculatePlates(target, bar = BAR_WEIGHT) {
  const totalPerSide = (Number(target) - bar) / 2;
  if (Number.isNaN(totalPerSide) || totalPerSide <= 0) return { plates: [], remaining: 0, validBar: bar };
  const plates = [];
  let remaining = totalPerSide;
  PLATE_SIZES.forEach((size) => {
    while (remaining >= size - 0.001) {
      plates.push(size);
      remaining = Math.round((remaining - size) * 1000) / 1000;
    }
  });
  return { plates, remaining, validBar: bar };
}

// Epley formula: 1RM = weight * (1 + reps/30)
function estimateOneRm(weight, reps) {
  const w = numericSetValue(weight);
  const r = numericSetValue(reps);
  if (w <= 0 || r <= 0) return 0;
  if (r === 1) return w;
  return Math.round(w * (1 + r / 30) * 10) / 10;
}

function bestOneRmFromSets(sets) {
  if (!Array.isArray(sets) || sets.length === 0) return 0;
  return sets.reduce((best, set) => Math.max(best, estimateOneRm(set.weight, set.reps)), 0);
}

function formatTimerTime(totalSec) {
  const s = Math.max(0, Math.floor(totalSec));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

function PasswordRecoveryScreen({ email, onComplete, onCancel }) {
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setError("");
    if (password.length < 8) {
      setError("Usa una contraseña de al menos 8 caracteres.");
      return;
    }
    if (password !== confirmation) {
      setError("Las contraseñas no coinciden.");
      return;
    }
    setSubmitting(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) {
        setError(normalizeAuthUiError(updateError));
        return;
      }
      setSaved(true);
      setPassword("");
      setConfirmation("");
    } catch (caught) {
      setError(normalizeAuthUiError(caught));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="gate-shell gate-overlay">
      <form className="gate-card gate-card-wide" onSubmit={submit}>
        <div className="auth-brand">
          <BrandLogo size={56} />
          <div>
            <p className="gate-tag">CUENTA SEGURA</p>
            <h1>Nueva contraseña</h1>
          </div>
        </div>
        <p className="gate-sub">{email || "Tu cuenta"}</p>
        {saved ? (
          <div className="stack gap-10 top-12">
            <p className="trend">✓ Contraseña actualizada correctamente.</p>
            <button className="btn btn-primary btn-large" type="button" onClick={onComplete}>Entrar a Anvil</button>
          </div>
        ) : (
          <div className="stack gap-10 top-12">
            <Field label="Nueva contraseña" type="password" value={password} onChange={setPassword} autoComplete="new-password" />
            <Field label="Confirmar contraseña" type="password" value={confirmation} onChange={setConfirmation} autoComplete="new-password" />
            {error && <p className="error-text">{error}</p>}
            <button className="btn btn-primary btn-large" type="submit" disabled={submitting}>
              {submitting ? "Guardando..." : "Guardar contraseña"}
            </button>
            <button className="btn btn-ghost" type="button" onClick={onCancel}>Cancelar</button>
          </div>
        )}
      </form>
    </div>
  );
}

function TimerModal({ open, onClose, timer, setTimer, now }) {
  if (!open) return null;

  const { mode, restSeconds, intervalWork, intervalRest, intervalRounds, running, phase, round, endAt } = timer;
  const remainingSec = endAt ? Math.max(0, Math.ceil((endAt - now) / 1000)) : 0;
  const totalSeconds = (intervalWork + intervalRest) * intervalRounds;

  const setField = (field, value) => setTimer((prev) => ({ ...prev, [field]: value }));

  const start = () => {
    if (mode === "rest") {
      setTimer((prev) => ({
        ...prev,
        running: true,
        phase: "rest",
        round: 0,
        endAt: Date.now() + Math.max(1, prev.restSeconds) * 1000,
      }));
    } else {
      setTimer((prev) => ({
        ...prev,
        running: true,
        phase: "work",
        round: 1,
        endAt: Date.now() + Math.max(1, prev.intervalWork) * 1000,
      }));
    }
    beepSound(880, 120);
    vibrateDevice([60]);
  };

  const stop = () => {
    setTimer((prev) => ({ ...prev, running: false, phase: "idle", endAt: null, round: 0 }));
  };

  return (
    <div className="timer-modal-backdrop" onClick={onClose}>
      <div className="timer-modal" onClick={(event) => event.stopPropagation()}>
        <div className="timer-modal-head">
          <h3>Cronómetro</h3>
          <button className="btn btn-ghost btn-mini" type="button" onClick={onClose}>Cerrar</button>
        </div>

        <div className="timer-tabs">
          <button
            type="button"
            className={`btn btn-mini ${mode === "rest" ? "btn-primary" : "btn-ghost"}`}
            onClick={() => { stop(); setField("mode", "rest"); }}
          >
            Descanso
          </button>
          <button
            type="button"
            className={`btn btn-mini ${mode === "interval" ? "btn-primary" : "btn-ghost"}`}
            onClick={() => { stop(); setField("mode", "interval"); }}
          >
            Intervalos
          </button>
        </div>

        <div className={`timer-display ${phase === "rest" ? "is-rest" : phase === "done" ? "is-done" : ""}`}>
          <p className="timer-phase">
            {phase === "idle" && "Listo"}
            {phase === "work" && "Trabajo"}
            {phase === "rest" && "Descanso"}
            {phase === "done" && "Terminado"}
          </p>
          <p className="timer-time">
            {running
              ? formatTimerTime(remainingSec)
              : phase === "done"
                ? "✓"
                : mode === "rest"
                  ? formatTimerTime(restSeconds)
                  : formatTimerTime(intervalWork)}
          </p>
          {mode === "interval" && (running || phase === "done") && (
            <p className="timer-round">Ronda {Math.min(round || 1, intervalRounds)} / {intervalRounds}</p>
          )}
        </div>

        <div className="timer-controls">
          {!running && phase !== "done" && (
            <button className="btn btn-primary" type="button" onClick={start}>Iniciar</button>
          )}
          {running && (
            <button className="btn btn-danger" type="button" onClick={stop}>Detener</button>
          )}
          {!running && phase === "done" && (
            <>
              <button className="btn btn-primary" type="button" onClick={start}>De nuevo</button>
              <button className="btn btn-ghost" type="button" onClick={stop}>Cerrar</button>
            </>
          )}
        </div>

        {!running && phase !== "done" && (
          <div className="timer-form top-12">
            {mode === "rest" ? (
              <>
                <Field
                  label="Segundos de descanso"
                  type="number"
                  value={restSeconds}
                  onChange={(value) => setField("restSeconds", Math.max(1, Number(value) || 0))}
                />
                <div className="timer-presets">
                  {[15, 30, 45, 60, 90, 120, 180, 240].map((s) => (
                    <button key={s} type="button" className="btn btn-ghost" onClick={() => setField("restSeconds", s)}>
                      {s < 60 ? `${s}s` : `${s / 60}m`}
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <>
                <div className="grid-three">
                  <Field
                    label="Trabajo (s)"
                    type="number"
                    value={intervalWork}
                    onChange={(value) => setField("intervalWork", Math.max(1, Number(value) || 0))}
                  />
                  <Field
                    label="Descanso (s)"
                    type="number"
                    value={intervalRest}
                    onChange={(value) => setField("intervalRest", Math.max(0, Number(value) || 0))}
                  />
                  <Field
                    label="Rondas"
                    type="number"
                    value={intervalRounds}
                    onChange={(value) => setField("intervalRounds", Math.max(1, Number(value) || 0))}
                  />
                </div>
                <p className="muted small top-6">
                  Total estimado: {formatTimerTime(totalSeconds)}
                </p>
                <div className="timer-presets">
                  <button type="button" className="btn btn-ghost" onClick={() => setTimer((p) => ({ ...p, intervalWork: 30, intervalRest: 10, intervalRounds: 8 }))}>
                    Rápido 30/10×8
                  </button>
                  <button type="button" className="btn btn-ghost" onClick={() => setTimer((p) => ({ ...p, intervalWork: 60, intervalRest: 30, intervalRounds: 10 }))}>
                    Fuerte 60/30×10
                  </button>
                  <button type="button" className="btn btn-ghost" onClick={() => setTimer((p) => ({ ...p, intervalWork: 60, intervalRest: 0, intervalRounds: 10 }))}>
                    Cada minuto 60×10
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function PlateBreakdown({ plates }) {
  if (!plates || plates.length === 0) return null;
  const grouped = plates.reduce((acc, plate) => {
    acc[plate] = (acc[plate] || 0) + 1;
    return acc;
  }, {});
  return (
    <div className="plate-row">
      {Object.entries(grouped)
        .sort(([a], [b]) => Number(b) - Number(a))
        .map(([size, count]) => (
          <span key={size} className="plate-chip" data-size={size}>
            {count} × {size}kg
          </span>
        ))}
    </div>
  );
}

function ExerciseLogItem({
  exercise,
  previous,
  currentSets,
  sessionNote,
  onAddSet,
  onRemoveSet,
  onStartRest,
  onSetNote,
  expanded,
  onToggle,
}) {
  const [weight, setWeight] = useState("");
  const [reps, setReps] = useState("");
  const [justSaved, setJustSaved] = useState(false);
  const [noteDraft, setNoteDraft] = useState(sessionNote || "");
  const [noteSaved, setNoteSaved] = useState(false);
  const [showTools, setShowTools] = useState(false);
  const [plateTarget, setPlateTarget] = useState("");
  const repsInputRef = useRef(null);
  const savedTimerRef = useRef(null);
  const noteSavedTimerRef = useRef(null);

  useEffect(() => {
    setNoteDraft(sessionNote || "");
  }, [sessionNote, exercise.id]);

  const latestCurrentSet = currentSets[currentSets.length - 1] || null;
  const suggestedSet = latestCurrentSet || previous?.last || null;
  const hasPreviousSet = Boolean(previous?.last && hasSetField(previous.last.weight) && hasSetField(previous.last.reps));
  const hasLatestCurrentSet = Boolean(latestCurrentSet && hasSetField(latestCurrentSet.weight) && hasSetField(latestCurrentSet.reps));

  useEffect(() => {
    const initialSet = currentSets[currentSets.length - 1] || previous?.last || null;
    setWeight(initialSet ? String(initialSet.weight) : "");
    setReps(initialSet ? String(initialSet.reps) : "");
  }, [exercise.id]);

  const commitSetValues = (nextWeight, nextReps) => {
    const normalizedWeight = normalizeSetField(nextWeight);
    const normalizedReps = normalizeSetField(nextReps);
    if (!hasSetField(normalizedWeight) || !hasSetField(normalizedReps)) return;
    onAddSet(exercise.id, { weight: normalizedWeight, reps: normalizedReps, ts: Date.now() });
    onStartRest?.(exercise);
    setWeight(String(normalizedWeight));
    setReps(String(normalizedReps));
    setJustSaved(true);
    if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    savedTimerRef.current = setTimeout(() => setJustSaved(false), 1800);
    window.requestAnimationFrame(() => repsInputRef.current?.focus());
  };

  const commitSet = () => commitSetValues(weight, reps);

  useEffect(() => () => {
    if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    if (noteSavedTimerRef.current) clearTimeout(noteSavedTimerRef.current);
  }, []);

  const commitNote = () => {
    if ((noteDraft || "") === (sessionNote || "")) return;
    onSetNote?.(exercise.id, noteDraft);
    setNoteSaved(true);
    if (noteSavedTimerRef.current) clearTimeout(noteSavedTimerRef.current);
    noteSavedTimerRef.current = setTimeout(() => setNoteSaved(false), 1600);
  };

  const setsCount = currentSets.length;
  const targetSets = Number.parseInt(String(exercise.sets), 10);
  const targetLabel = Number.isFinite(targetSets) && targetSets > 0 ? `${setsCount}/${targetSets}` : `${setsCount}`;
  const hasNote = Boolean((sessionNote || "").trim());

  const oneRmCurrent = bestOneRmFromSets(currentSets);
  const oneRmPrevious = previous ? bestOneRmFromSets(previous.sets) : 0;
  const oneRmBest = Math.max(oneRmCurrent, oneRmPrevious);

  const plateInfo = plateTarget ? calculatePlates(numericSetValue(plateTarget)) : null;

  return (
    <article className={`exercise-card ${expanded ? "is-expanded" : ""}`}>
      <button type="button" className="exercise-head-row" onClick={onToggle}>
        <div className="exercise-head-info">
          <div className="row gap-8 wrap">
            <h4>{exercise.name}</h4>
            {exercise.__packageName && (
              <span className="package-tag" style={{ borderColor: exercise.__packageColor || "#9aa3b2", color: exercise.__packageColor || "#cfd6e3" }}>
                {exercise.__packageName}
              </span>
            )}
          </div>
          <p className="exercise-meta">
            {exercise.sets} x {exercise.reps} · descanso {exercise.rest}
            {exercise.note ? ` · ${exercise.note}` : ""}
          </p>
        </div>
        <div className="exercise-head-status">
          {hasNote && <span className="note-dot" title="Tiene nota">📝</span>}
          <span className={`pill ${setsCount > 0 ? "pill-good" : ""}`}>{targetLabel} series</span>
          <span className="chevron" aria-hidden="true">{expanded ? "▴" : "▾"}</span>
        </div>
      </button>

      {expanded && (
        <div className="exercise-body">
          {previous && (
            <p className="trend">
              Última vez ({previous.date}): {formatSetWeight(previous.last.weight)} × {previous.last.reps}
              {previous.max > 0 ? ` · máx ${previous.max} kg` : ""}
            </p>
          )}

          {currentSets.length > 0 && (
            <div className="set-list">
              {currentSets.map((entry, index) => (
                <div
                  key={`${exercise.id}_${index}_${entry.ts}`}
                  className="set-chip"
                >
                  <span>S{index + 1}: {formatSetWeight(entry.weight)} × {entry.reps}</span>
                  <button
                    type="button"
                    className="set-remove"
                    onClick={() => onRemoveSet(exercise.id, index)}
                    aria-label={`Eliminar serie ${index + 1}`}
                    title="Eliminar serie"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="set-entry-row top-8">
            <label className="set-entry-field">
              <span>Carga</span>
              <input
                className="input"
                type="text"
                placeholder="20 kg / BW"
                value={weight}
                onChange={(event) => setWeight(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") repsInputRef.current?.focus();
                }}
                autoComplete="off"
              />
            </label>
            <label className="set-entry-field">
              <span>Reps</span>
              <input
                ref={repsInputRef}
                className="input"
                type="text"
                inputMode="numeric"
                placeholder="8"
                value={reps}
                onChange={(event) => setReps(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") commitSet();
                }}
                autoComplete="off"
              />
            </label>
            <button className="btn btn-primary" type="button" onClick={commitSet}>
              Guardar S{setsCount + 1}
            </button>
          </div>

          {suggestedSet && (hasPreviousSet || hasLatestCurrentSet) && (
            <button
              className="btn btn-soft btn-quick-set top-8"
              type="button"
              onClick={() => commitSetValues(suggestedSet.weight, suggestedSet.reps)}
            >
              + {hasLatestCurrentSet ? `Repetir como S${setsCount + 1}` : "Registrar igual que la última vez"}
            </button>
          )}

          {justSaved && <p className="trend top-8">✓ Serie guardada</p>}

          <div className="tools-block top-10">
            <button
              type="button"
              className="tools-toggle"
              onClick={() => setShowTools((v) => !v)}
            >
              <span>🧮 Herramientas</span>
              {oneRmBest > 0 && !showTools && (
                <span className="tools-summary">Máx. aprox. {oneRmBest}kg</span>
              )}
              <span className="chevron">{showTools ? "▴" : "▾"}</span>
            </button>
            {showTools && (
              <div className="tools-body">
                <div className="tool-card">
                  <p className="tool-label">Peso máximo estimado</p>
                  <p className="tool-value">
                    {oneRmBest > 0 ? `${oneRmBest}kg` : "—"}
                  </p>
                  <p className="tool-meta">
                    {oneRmCurrent > 0 && `Sesión actual: ${oneRmCurrent}kg`}
                    {oneRmCurrent > 0 && oneRmPrevious > 0 && " · "}
                    {oneRmPrevious > 0 && `Anterior: ${oneRmPrevious}kg`}
                    {oneRmBest === 0 && "Captura una serie para estimar"}
                  </p>
                </div>

                <div className="tool-card">
                  <p className="tool-label">Calculadora de discos</p>
                  <div className="row gap-8 top-6">
                    <input
                      className="input"
                      type="number"
                      inputMode="decimal"
                      placeholder="kg total"
                      step="0.5"
                      value={plateTarget}
                      onChange={(event) => setPlateTarget(event.target.value)}
                    />
                    <button
                      type="button"
                      className="btn btn-ghost btn-mini"
                      onClick={() => {
                        const load = currentSets[currentSets.length - 1]?.weight || previous?.last?.weight || "";
                        const numericLoad = numericSetValue(load);
                        setPlateTarget(numericLoad > 0 ? String(numericLoad) : "");
                      }}
                    >
                      Último
                    </button>
                  </div>
                  {plateInfo && numericSetValue(plateTarget) > 0 && (
                    <div className="top-8">
                      {plateInfo.plates.length === 0 ? (
                        <p className="muted small">
                          {Number(plateTarget) < BAR_WEIGHT
                            ? `Menos que la barra (${BAR_WEIGHT}kg)`
                            : "Sólo la barra"}
                        </p>
                      ) : (
                        <>
                          <p className="muted small">Por lado (barra {BAR_WEIGHT}kg):</p>
                          <PlateBreakdown plates={plateInfo.plates} />
                          {plateInfo.remaining > 0.001 && (
                            <p className="muted small top-6">Sobran {plateInfo.remaining}kg (no es exacto con discos comunes)</p>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="note-block top-12">
            <label className="field">
              <span>📝 Nota de hoy (cómo te sentiste, dolor, peso usado...)</span>
              <textarea
                className="input note-textarea"
                rows={2}
                value={noteDraft}
                onChange={(event) => setNoteDraft(event.target.value)}
                onBlur={commitNote}
                placeholder="Ej. hombro derecho molestaba, baje a 80kg"
              />
            </label>
            {noteSaved && <p className="trend top-6">✓ Nota guardada</p>}
          </div>
        </div>
      )}
    </article>
  );
}

// ============================================================================
// 9. MAIN APP
// ============================================================================
export default function App() {
  // Auth state
  const [authReady, setAuthReady] = useState(!SUPABASE_CONFIGURED);
  const [authSession, setAuthSession] = useState(null);
  const [authError, setAuthError] = useState("");
  const [passwordRecoveryMode, setPasswordRecoveryMode] = useState(false);
  const [localMode, setLocalMode] = useState(() => SUPABASE_CONFIGURED && safeLocalGet(AUTH_LOCAL_MODE_KEY) === "true");
  const userId = authSession?.user?.id || null;
  const hasCloudAccount = SUPABASE_CONFIGURED && Boolean(userId);
  const usingLocalMode = SUPABASE_CONFIGURED && !userId && localMode;
  const scope = hasCloudAccount ? userId : (!SUPABASE_CONFIGURED || usingLocalMode ? LOCAL_SCOPE : null);

  // App state
  const [state, setState] = useState(() =>
    SUPABASE_CONFIGURED && !localMode
      ? alignStateSessionToToday(normalizeState(DEFAULT_STATE))
      : alignStateSessionToToday(loadLocalState(LOCAL_SCOPE))
  );
  const [draftLogs, setDraftLogs] = useState(() =>
    SUPABASE_CONFIGURED && !localMode ? {} : loadDrafts(LOCAL_SCOPE)
  );
  const [saveMeta, setSaveMeta] = useState({ ok: true, error: null, backupCount: 0, lastSavedAt: null, lastBackupAt: null });
  const [cloudMeta, setCloudMeta] = useState({
    enabled: SUPABASE_CONFIGURED,
    syncedAt: null,
    syncing: false,
    error: null,
    queueCount: 0,
    retries: 0,
    conflict: null,
  });
  const [cloudReady, setCloudReady] = useState(!SUPABASE_CONFIGURED);
  const [isOnline, setIsOnline] = useState(() => (typeof navigator === "undefined" ? true : navigator.onLine));

  const cloudSyncTimerRef = useRef(null);
  const cloudRetryTimerRef = useRef(null);
  const pendingCloudPayloadRef = useRef({ pending: null, retries: 0, lastError: null, updatedAt: null });
  const knownCloudUpdatedAtRef = useRef(null);
  const forceCloudOverwriteRef = useRef(false);

  // UI state
  const [tab, setTab] = useState("hoy");
  const [routineEditMode, setRoutineEditMode] = useState(false);
  const [expandedExerciseId, setExpandedExerciseId] = useState(null);
  const [restTimer, setRestTimer] = useState({ endAt: null, seconds: 0, exercise: "" });
  const [timerNow, setTimerNow] = useState(Date.now());
  const [chronoOpen, setChronoOpen] = useState(false);
  const [chrono, setChrono] = useState({
    mode: "rest",
    restSeconds: 60,
    intervalWork: 60,
    intervalRest: 30,
    intervalRounds: 10,
    running: false,
    phase: "idle",
    round: 0,
    endAt: null,
  });
  const [weightForm, setWeightForm] = useState({ date: "", weight: "", waist: "" });
  const [historyQuery, setHistoryQuery] = useState("");
  const [selectedHistorySessionId, setSelectedHistorySessionId] = useState("");
  const [calendarDate, setCalendarDate] = useState(() => todayInZone(state.settings.timezone));
  const [calendarMonth, setCalendarMonth] = useState(() => monthKeyFromDate(todayInZone(state.settings.timezone)));
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const [importError, setImportError] = useState("");
  const [importFileName, setImportFileName] = useState("");
  const [deviceStateCandidate, setDeviceStateCandidate] = useState(null);

  const deviceStateSummary = useMemo(
    () => summarizeDeviceState(deviceStateCandidate),
    [deviceStateCandidate]
  );

  const tz = state.settings.timezone;
  const [todayStr, setTodayStr] = useState(() => todayInZone(tz));
  const previousTodayRef = useRef(todayStr);

  useEffect(() => {
    window.requestAnimationFrame(() => window.scrollTo({ top: 0, left: 0, behavior: "auto" }));
  }, [tab]);

  useEffect(() => {
    const previousToday = previousTodayRef.current;
    setCalendarDate((current) => (current === previousToday ? todayStr : current));
    setCalendarMonth((current) => (
      current === monthKeyFromDate(previousToday) ? monthKeyFromDate(todayStr) : current
    ));
    previousTodayRef.current = todayStr;
  }, [todayStr]);

  // ==========================================================================
  // Auth effects
  // ==========================================================================
  useEffect(() => {
    if (!SUPABASE_CONFIGURED || !supabase) return undefined;
    let mounted = true;
    supabase.auth.getSession()
      .then(({ data, error }) => {
        if (!mounted) return;
        if (error) setAuthError(normalizeAuthUiError(error));
        else setAuthError("");
        setAuthSession(data?.session || null);
      })
      .catch((caught) => {
        if (!mounted) return;
        setAuthError(normalizeAuthUiError(caught));
        setAuthSession(null);
      })
      .finally(() => {
        if (mounted) setAuthReady(true);
      });
    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      setAuthSession(session || null);
      if (event === "PASSWORD_RECOVERY") setPasswordRecoveryMode(true);
      if (event === "SIGNED_OUT") setPasswordRecoveryMode(false);
      if (session) {
        setAuthError("");
        setLocalMode(false);
        safeLocalRemove(AUTH_LOCAL_MODE_KEY);
      }
    });
    return () => {
      mounted = false;
      authListener?.subscription?.unsubscribe();
    };
  }, []);

  useEffect(() => {
    setDeviceStateCandidate(readDeviceStateCandidate(userId));
  }, [userId]);

  // ==========================================================================
  // Load local cache when user changes (or on first load with Supabase)
  // ==========================================================================
  useEffect(() => {
    if (!scope) return;
    const localState = alignStateSessionToToday(loadLocalState(scope));
    const localDrafts = loadDrafts(scope);
    pendingCloudPayloadRef.current = loadSyncQueue(scope);
    setState(localState);
    setDraftLogs(localDrafts);
    const localToday = todayInZone(localState.settings.timezone);
    setTodayStr(localToday);
    setCalendarDate(localToday);
    setCalendarMonth(monthKeyFromDate(localToday));
    setSelectedHistorySessionId("");
  }, [scope]);

  // ==========================================================================
  // Cloud sync: pull on login
  // ==========================================================================
  useEffect(() => {
    if (!SUPABASE_CONFIGURED || !userId) {
      if (!SUPABASE_CONFIGURED) setCloudReady(true);
      return undefined;
    }
    let cancelled = false;
    setCloudReady(false);
    (async () => {
      const cloud = await fetchCloudState(userId);
      if (cancelled) return;
      if (!cloud.ok) {
        setCloudMeta((prev) => ({ ...prev, enabled: true, syncing: false, error: cloud.reason || "No se pudieron actualizar tus datos." }));
        setCloudReady(true);
        return;
      }
      const localKey = scopedKey(STATE_KEY_PREFIX, userId);
      const localRaw = parseJson(safeLocalGet(localKey), {});
      const localUpdatedAt = Date.parse(localRaw?.updatedAt || "") || 0;
      const cloudUpdatedAt = Date.parse(cloud.cloudUpdatedAt || "") || 0;

      knownCloudUpdatedAtRef.current = cloud.cloudUpdatedAt || null;
      let finalState = (cloud.payload && cloudUpdatedAt > localUpdatedAt) ? cloud.payload : localRaw;
      finalState = alignStateSessionToToday(normalizeState(finalState));

      const migrationFlag = `fitapp_migrated_to_elite_2_0_v2_${userId}`;
      if (safeLocalGet(migrationFlag) !== "true") {
        finalState.routine = DEFAULT_ROUTINE;
        finalState.updatedAt = new Date().toISOString();
        safeLocalSet(migrationFlag, "true");
      }

      setState(finalState);
      setSaveMeta(saveLocalState(finalState, userId));
      setCloudMeta((prev) => ({
        ...prev,
        enabled: true,
        syncedAt: cloud.cloudUpdatedAt || prev.syncedAt,
        syncing: false,
        error: null,
        queueCount: pendingCloudPayloadRef.current?.pending ? 1 : 0,
        retries: pendingCloudPayloadRef.current?.retries || 0,
      }));
      setCloudReady(true);
    })();
    return () => { cancelled = true; };
  }, [userId]);

  // ==========================================================================
  // Local persistence on state change
  // ==========================================================================
  useEffect(() => {
    if (!scope) return;
    setSaveMeta(saveLocalState(state, scope));
  }, [state, scope]);

  useEffect(() => {
    if (!scope) return;
    saveDrafts(draftLogs, scope);
  }, [draftLogs, scope]);

  // ==========================================================================
  // Cloud sync: push on state change
  // ==========================================================================
  useEffect(() => {
    if (!SUPABASE_CONFIGURED || !userId || !cloudReady) return undefined;
    const queue = {
      pending: normalizeState(state),
      retries: 0,
      lastError: null,
      updatedAt: new Date().toISOString(),
    };
    pendingCloudPayloadRef.current = queue;
    saveSyncQueue(queue, userId);
    setCloudMeta((prev) => ({ ...prev, queueCount: 1, retries: 0, conflict: null }));
    return undefined;
  }, [state, userId, cloudReady]);

  useEffect(() => {
    if (!SUPABASE_CONFIGURED || !userId || !cloudReady) return undefined;

    const scheduleAttempt = (delayMs) => {
      if (cloudSyncTimerRef.current) clearTimeout(cloudSyncTimerRef.current);
      cloudSyncTimerRef.current = setTimeout(async () => {
        const queue = pendingCloudPayloadRef.current;
        if (!queue?.pending) {
          setCloudMeta((prev) => ({ ...prev, syncing: false, queueCount: 0 }));
          return;
        }
        if (!isOnline) {
          setCloudMeta((prev) => ({ ...prev, syncing: false, error: "Sin internet. Se guardará al reconectar.", queueCount: 1 }));
          if (cloudRetryTimerRef.current) clearTimeout(cloudRetryTimerRef.current);
          cloudRetryTimerRef.current = setTimeout(() => scheduleAttempt(1500), 3000);
          return;
        }

        setCloudMeta((prev) => ({ ...prev, syncing: true, error: null }));
        const remote = await fetchCloudState(userId);
        if (!remote.ok) {
          const retries = Math.min((queue.retries || 0) + 1, SYNC_MAX_RETRIES);
          const nextQueue = { ...queue, retries, lastError: remote.reason || "Error de lectura" };
          pendingCloudPayloadRef.current = nextQueue;
          saveSyncQueue(nextQueue, userId);
          const retryDelay = Math.min(30000, 1200 * (2 ** retries));
          setCloudMeta((prev) => ({
            ...prev,
            syncing: false,
            queueCount: 1,
            retries,
            error: `No se pudieron actualizar tus datos. Reintentando en ${Math.round(retryDelay / 1000)}s.`,
          }));
          if (cloudRetryTimerRef.current) clearTimeout(cloudRetryTimerRef.current);
          cloudRetryTimerRef.current = setTimeout(() => scheduleAttempt(1000), retryDelay);
          return;
        }

        const remoteUpdatedAt = Date.parse(remote.cloudUpdatedAt || "") || 0;
        const knownUpdatedAt = Date.parse(knownCloudUpdatedAtRef.current || "") || 0;
        const localUpdatedAt = Date.parse(queue.pending?.updatedAt || "") || 0;
        const hasRemoteConflict = remoteUpdatedAt > knownUpdatedAt + 500 && remoteUpdatedAt > localUpdatedAt + 500;
        if (hasRemoteConflict && !forceCloudOverwriteRef.current) {
          setCloudMeta((prev) => ({
            ...prev,
            syncing: false,
            conflict: { remoteUpdatedAt: remote.cloudUpdatedAt, localUpdatedAt: queue.pending?.updatedAt || null },
            error: "Hay cambios más recientes en tu cuenta.",
          }));
          return;
        }

        const response = await pushCloudState(queue.pending, userId);
        if (!response.ok) {
          const retries = Math.min((queue.retries || 0) + 1, SYNC_MAX_RETRIES);
          const nextQueue = { ...queue, retries, lastError: response.reason || "Error de sync" };
          pendingCloudPayloadRef.current = nextQueue;
          saveSyncQueue(nextQueue, userId);
          const retryDelay = Math.min(30000, 1200 * (2 ** retries));
          setCloudMeta((prev) => ({
            ...prev,
            syncing: false,
            queueCount: 1,
            retries,
            error: `No se pudieron guardar tus cambios. Reintentando en ${Math.round(retryDelay / 1000)}s.`,
          }));
          if (cloudRetryTimerRef.current) clearTimeout(cloudRetryTimerRef.current);
          cloudRetryTimerRef.current = setTimeout(() => scheduleAttempt(1000), retryDelay);
          return;
        }

        forceCloudOverwriteRef.current = false;
        knownCloudUpdatedAtRef.current = response.cloudUpdatedAt || new Date().toISOString();
        pendingCloudPayloadRef.current = { pending: null, retries: 0, lastError: null, updatedAt: null };
        saveSyncQueue(pendingCloudPayloadRef.current, userId);
        setCloudMeta((prev) => ({
          ...prev,
          syncing: false,
          syncedAt: response.cloudUpdatedAt || new Date().toISOString(),
          error: null,
          queueCount: 0,
          retries: 0,
          conflict: null,
        }));
      }, delayMs);
    };

    scheduleAttempt(CLOUD_SYNC_DEBOUNCE_MS);
    return () => {
      if (cloudSyncTimerRef.current) clearTimeout(cloudSyncTimerRef.current);
      if (cloudRetryTimerRef.current) clearTimeout(cloudRetryTimerRef.current);
    };
  }, [state, userId, cloudReady, isOnline]);

  // ==========================================================================
  // Online/offline
  // ==========================================================================
  useEffect(() => {
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  // ==========================================================================
  // Auto-day rollover at midnight (timezone-aware)
  // ==========================================================================
  useEffect(() => {
    let timeoutId = null;
    const schedule = () => {
      const delay = msUntilNextMidnightInZone(tz);
      timeoutId = setTimeout(() => {
        const next = todayInZone(tz);
        setTodayStr((prev) => {
          if (prev !== next) {
            setState((prevState) =>
              prevState.sessionDate === prev
                ? { ...prevState, sessionDate: next, dayIndex: weekdayIndexInZone(tz) }
                : prevState
            );
          }
          return next;
        });
        schedule();
      }, delay + 500);
    };
    schedule();
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      const next = todayInZone(tz);
      setTodayStr((prev) => {
        if (prev !== next) {
          setState((prevState) =>
            prevState.sessionDate === prev
              ? { ...prevState, sessionDate: next, dayIndex: weekdayIndexInZone(tz) }
              : prevState
          );
        }
        return next;
      });
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      if (timeoutId) clearTimeout(timeoutId);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [tz]);

  // On first mount: align dayIndex with today's weekday if state is fresh and date is today
  useEffect(() => {
    if (state.sessionDate === todayStr) {
      const desired = weekdayIndexInZone(tz);
      if (desired < state.routine.length && desired !== state.dayIndex) {
        setState((prev) => ({ ...prev, dayIndex: desired }));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope]);

  // ==========================================================================
  // Rest timer
  // ==========================================================================
  useEffect(() => {
    if (!restTimer.endAt && !chrono.running) return undefined;
    const id = setInterval(() => setTimerNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [restTimer.endAt, chrono.running]);

  const restRemainingSec = restTimer.endAt ? Math.max(0, Math.ceil((restTimer.endAt - timerNow) / 1000)) : 0;
  const chronoRemainingSec = chrono.endAt ? Math.max(0, Math.ceil((chrono.endAt - timerNow) / 1000)) : 0;

  useEffect(() => {
    if (!restTimer.endAt) return;
    if (restRemainingSec <= 0) {
      setRestTimer({ endAt: null, seconds: 0, exercise: "" });
      beepSound(660, 200);
      vibrateDevice([200]);
    }
  }, [restRemainingSec, restTimer.endAt]);

  // Chronometer phase transitions
  useEffect(() => {
    if (!chrono.running || !chrono.endAt) return;
    if (timerNow < chrono.endAt) return;

    if (chrono.mode === "rest") {
      beepSound(660, 250);
      vibrateDevice([250]);
      setChrono((prev) => ({ ...prev, running: false, phase: "done", endAt: null }));
      return;
    }

    // interval mode
    if (chrono.phase === "work") {
      if (chrono.round >= chrono.intervalRounds) {
        // last work just ended
        beepSound(523, 400);
        vibrateDevice([200, 80, 200, 80, 400]);
        setChrono((prev) => ({ ...prev, running: false, phase: "done", endAt: null }));
      } else {
        // transition to rest
        beepSound(660, 180);
        vibrateDevice([120]);
        setChrono((prev) => ({
          ...prev,
          phase: "rest",
          endAt: Date.now() + Math.max(0, prev.intervalRest) * 1000,
        }));
      }
    } else if (chrono.phase === "rest") {
      // transition to next work round
      beepSound(880, 180);
      vibrateDevice([120, 60, 120]);
      setChrono((prev) => ({
        ...prev,
        phase: "work",
        round: (prev.round || 0) + 1,
        endAt: Date.now() + Math.max(1, prev.intervalWork) * 1000,
      }));
    }
  }, [timerNow, chrono]);

  // If interval rest is 0, skip rest phase immediately (handled by 0-second endAt above)

  // ==========================================================================
  // Persisted storage permission
  // ==========================================================================
  useEffect(() => {
    if (navigator.storage?.persist) {
      navigator.storage.persist().catch(() => {});
    }
  }, []);

  // ==========================================================================
  // Derived data
  // ==========================================================================
  const selectedDay = state.routine[state.dayIndex] || state.routine[0];
  const sessionDraftKey = makeDraftSessionKey(selectedDay.id, state.sessionDate);
  const sessionSavedLogs = state.trainingLogs?.[selectedDay.id]?.[state.sessionDate] || {};

  const selectedDayExercises = useMemo(
    () => getDayExercises(selectedDay, state.exercisePackages),
    [selectedDay, state.exercisePackages]
  );

  const sessionDraft = useMemo(() => {
    const fromSaved = {};
    selectedDayExercises.forEach((exercise) => {
      const sets = Array.isArray(sessionSavedLogs?.[exercise.id]) ? sessionSavedLogs[exercise.id].map(normalizeSet) : [];
      if (sets.length > 0) fromSaved[exercise.id] = sets;
    });
    if (Object.keys(fromSaved).length > 0) return fromSaved;
    const existing = draftLogs?.[sessionDraftKey];
    return existing && typeof existing === "object" ? existing : fromSaved;
  }, [draftLogs, selectedDayExercises, sessionDraftKey, sessionSavedLogs]);

  const sessionSetCount = useMemo(
    () => selectedDayExercises.reduce((acc, ex) => acc + (Array.isArray(sessionDraft?.[ex.id]) ? sessionDraft[ex.id].length : 0), 0),
    [selectedDayExercises, sessionDraft]
  );

  const sortedWeightLogs = useMemo(
    () => [...state.weightLogs].sort((a, b) => b.date.localeCompare(a.date)),
    [state.weightLogs]
  );

  const latestWeight = sortedWeightLogs.length > 0 ? Number(sortedWeightLogs[0].weight) : Number(state.settings.startWeight) || 0;

  const totalSetsLogged = useMemo(() => {
    return Object.values(state.trainingLogs).reduce((accDays, byDate) => {
      return accDays + Object.values(byDate || {}).reduce((accDates, byExercise) => {
        return accDates + Object.values(byExercise || {}).reduce((accEx, sets) => accEx + (Array.isArray(sets) ? sets.length : 0), 0);
      }, 0);
    }, 0);
  }, [state.trainingLogs]);

  const routineSessions = useMemo(() => {
    const sessions = [];
    Object.entries(state.trainingLogs || {}).forEach(([dayId, logsByDate]) => {
      const day = state.routine.find((candidate) => candidate.id === dayId) || null;
      const dayExercises = day ? getDayExercises(day, state.exercisePackages) : [];
      Object.entries(logsByDate).forEach(([date, byExercise]) => {
        const meta = state.trainingLogMeta?.[dayId]?.[date] || {};
        const exerciseLookup = new Map(dayExercises.map((ex) => [ex.id, ex]));
        const exerciseRows = Object.entries(byExercise || {})
          .map(([exerciseId, sets]) => {
            if (!Array.isArray(sets) || !sets.length) return null;
            const exercise = exerciseLookup.get(exerciseId) || {
              id: exerciseId,
              name: meta.exerciseNames?.[exerciseId] || "Ejercicio guardado",
            };
            const max = Math.max(...sets.map((item) => numericSetValue(item.weight)));
            const avg = averageWeight(sets);
            const volume = sets.reduce(
              (acc, item) => acc + numericSetValue(item.weight) * numericSetValue(item.reps),
              0
            );
            return {
              id: exercise.id,
              name: exercise.name,
              setsCount: sets.length,
              max,
              avg: avg ? Number(avg.toFixed(1)) : 0,
              volume: Math.round(volume),
              last: sets[sets.length - 1],
            };
          })
          .filter(Boolean);

        if (!exerciseRows.length) return;
        const setsCount = exerciseRows.reduce((acc, item) => acc + item.setsCount, 0);
        const sessionVolume = exerciseRows.reduce((acc, item) => acc + item.volume, 0);
        const bestExercise = exerciseRows
          .filter((item) => item.max > 0)
          .reduce((best, item) => (!best || item.max > best.max ? item : best), null);
        sessions.push({
          id: `${dayId}_${date}`,
          dayId,
          date,
          dateLabel: formatShortDateInZone(date, tz),
          dayName: meta.dayName || day?.fullDay || "Rutina anterior",
          title: meta.title || day?.title || "Sesión guardada",
          hasCurrentDay: Boolean(day),
          setsCount,
          sessionVolume,
          bestExercise,
          exerciseRows,
        });
      });
    });
    return sessions.sort((a, b) => b.date.localeCompare(a.date));
  }, [state.trainingLogs, state.trainingLogMeta, state.routine, state.exercisePackages, tz]);

  const filteredRoutineSessions = useMemo(() => {
    const query = historyQuery.trim().toLowerCase();
    if (!query) return routineSessions;
    return routineSessions.filter((session) => {
      const exerciseText = session.exerciseRows.map((item) => item.name).join(" ").toLowerCase();
      const baseText = `${session.dayName} ${session.title} ${session.date} ${session.dateLabel}`.toLowerCase();
      return baseText.includes(query) || exerciseText.includes(query);
    });
  }, [historyQuery, routineSessions]);

  const sessionsByDate = useMemo(() => {
    const map = new Map();
    routineSessions.forEach((session) => {
      if (!map.has(session.date)) map.set(session.date, []);
      map.get(session.date).push(session);
    });
    return map;
  }, [routineSessions]);

  const calendarCells = useMemo(() => getMonthCells(calendarMonth), [calendarMonth]);
  const calendarSelectedSessions = useMemo(
    () => sessionsByDate.get(calendarDate) || [],
    [sessionsByDate, calendarDate]
  );

  const selectedHistorySession = useMemo(() => {
    if (!calendarSelectedSessions.length) return null;
    return calendarSelectedSessions.find((session) => session.id === selectedHistorySessionId)
      || calendarSelectedSessions[0];
  }, [calendarSelectedSessions, selectedHistorySessionId]);

  useEffect(() => {
    if (!calendarSelectedSessions.length) {
      if (selectedHistorySessionId) setSelectedHistorySessionId("");
      return;
    }
    const exists = calendarSelectedSessions.some((session) => session.id === selectedHistorySessionId);
    if (!exists) setSelectedHistorySessionId(calendarSelectedSessions[0].id);
  }, [calendarSelectedSessions, selectedHistorySessionId]);

  const weightTrendPoints = useMemo(() => {
    const rows = [...state.weightLogs].sort((a, b) => a.date.localeCompare(b.date));
    return rows.map((entry, index) => ({ x: index + 1, y: Number(entry.weight) || 0 }));
  }, [state.weightLogs]);

  const weeklyVolumeRows = useMemo(() => {
    const map = {};
    routineSessions.forEach((session) => {
      const weekKey = getIsoWeekKey(session.date);
      if (!map[weekKey]) map[weekKey] = { weekKey, volume: 0, sets: 0 };
      map[weekKey].volume += session.sessionVolume;
      map[weekKey].sets += session.setsCount;
    });
    return Object.values(map).sort((a, b) => a.weekKey.localeCompare(b.weekKey)).slice(-12);
  }, [routineSessions]);

  const weeklyVolumePoints = useMemo(
    () => weeklyVolumeRows.map((row, index) => ({ x: index + 1, y: row.volume })),
    [weeklyVolumeRows]
  );

  const exercisePbs = useMemo(() => {
    const map = {};
    routineSessions.forEach((session) => {
      session.exerciseRows.forEach((row) => {
        if (!map[row.id] || row.max > map[row.id].max) {
          map[row.id] = { id: row.id, name: row.name, max: row.max, date: session.date };
        }
      });
    });
    return Object.values(map).sort((a, b) => b.max - a.max).slice(0, 8);
  }, [routineSessions]);

  // Streak: días consecutivos entrenando contando desde hoy hacia atrás
  const trainingDateSet = useMemo(() => {
    const set = new Set();
    routineSessions.forEach((session) => set.add(session.date));
    return set;
  }, [routineSessions]);

  const streakInfo = useMemo(() => {
    const dates = [...trainingDateSet].sort((a, b) => b.localeCompare(a));
    if (dates.length === 0) return { current: 0, best: 0, lastDate: null };

    const dateToLocal = (dateStr) => {
      const [y, m, d] = dateStr.split("-").map(Number);
      return new Date(Date.UTC(y, m - 1, d));
    };
    const dayDiff = (a, b) => Math.round((dateToLocal(a) - dateToLocal(b)) / 86400000);

    const todayDate = todayStr;
    let current = 0;
    const firstDate = dates[0];
    const gapFromToday = dayDiff(todayDate, firstDate);
    if (gapFromToday <= 1) {
      current = 1;
      for (let i = 1; i < dates.length; i += 1) {
        if (dayDiff(dates[i - 1], dates[i]) === 1) current += 1;
        else break;
      }
    }

    let best = 1;
    let run = 1;
    for (let i = 1; i < dates.length; i += 1) {
      if (dayDiff(dates[i - 1], dates[i]) === 1) {
        run += 1;
        if (run > best) best = run;
      } else {
        run = 1;
      }
    }
    return { current, best, lastDate: firstDate };
  }, [trainingDateSet, todayStr]);

  // Heatmap: últimas 26 semanas
  const heatmapData = useMemo(() => {
    const weeks = 26;
    const totalDays = weeks * 7;
    const [ty, tm, td] = todayStr.split("-").map(Number);
    const endDate = new Date(Date.UTC(ty, tm - 1, td));
    const days = [];
    for (let i = totalDays - 1; i >= 0; i -= 1) {
      const d = new Date(endDate.getTime() - i * 86400000);
      const dateStr = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
      days.push({ date: dateStr, trained: trainingDateSet.has(dateStr) });
    }
    const cols = [];
    for (let i = 0; i < weeks; i += 1) {
      cols.push(days.slice(i * 7, (i + 1) * 7));
    }
    return cols;
  }, [todayStr, trainingDateSet]);

  // Volumen por rutina (paquete) en últimos 7 días
  const volumeByPackage = useMemo(() => {
    const since = (() => {
      const [ty, tm, td] = todayStr.split("-").map(Number);
      const d = new Date(Date.UTC(ty, tm - 1, td - 6));
      return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
    })();

    // Mapear exerciseId -> packageId
    const exerciseToPackage = new Map();
    (state.exercisePackages || []).forEach((pkg) => {
      pkg.exercises.forEach((ex) => exerciseToPackage.set(ex.id, pkg.id));
    });

    const byPkg = new Map();
    (state.exercisePackages || []).forEach((pkg) => {
      byPkg.set(pkg.id, { id: pkg.id, name: pkg.name, color: pkg.color, volume: 0, sets: 0 });
    });
    byPkg.set("__custom", { id: "__custom", name: "Ejercicios extra", color: "#9aa3b2", volume: 0, sets: 0 });

    routineSessions.forEach((session) => {
      if (session.date < since) return;
      session.exerciseRows.forEach((row) => {
        const pkgId = exerciseToPackage.get(row.id) || "__custom";
        const entry = byPkg.get(pkgId);
        if (!entry) return;
        entry.volume += row.volume;
        entry.sets += row.setsCount;
      });
    });
    return [...byPkg.values()].filter((entry) => entry.volume > 0).sort((a, b) => b.volume - a.volume);
  }, [routineSessions, state.exercisePackages, todayStr]);

  // Reset weight form date when timezone changes
  useEffect(() => {
    setWeightForm((prev) => ({ ...prev, date: prev.date || todayInZone(tz) }));
  }, [tz]);

  // Reset expanded card on day/date change
  useEffect(() => {
    setExpandedExerciseId(selectedDayExercises[0]?.id || null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDay.id, state.sessionDate]);

  // ==========================================================================
  // State mutators
  // ==========================================================================
  const updateSetting = (field, value) => {
    setState((prev) => ({ ...prev, settings: { ...prev.settings, [field]: value } }));
  };

  const updateSettingNumber = (field, value) => {
    const parsed = Number(value);
    if (Number.isNaN(parsed)) return;
    updateSetting(field, parsed);
  };

  const selectDay = (index) => {
    setState((prev) => ({ ...prev, dayIndex: clamp(index, 0, prev.routine.length - 1) }));
  };

  const setSessionDate = (date) => {
    setState((prev) => ({
      ...prev,
      sessionDate: date,
      dayIndex: clamp(weekdayIndexFromIso(date), 0, prev.routine.length - 1),
    }));
  };

  const selectCalendarDay = (date) => {
    setCalendarDate(date);
    const sessions = sessionsByDate.get(date) || [];
    setSelectedHistorySessionId(sessions[0]?.id || "");
  };

  const showCalendarToday = () => {
    setCalendarDate(todayStr);
    setCalendarMonth(monthKeyFromDate(todayStr));
    const sessions = sessionsByDate.get(todayStr) || [];
    setSelectedHistorySessionId(sessions[0]?.id || "");
  };

  const openWorkoutDate = (date, dayId = null) => {
    setState((prev) => {
      const savedDayIndex = dayId ? prev.routine.findIndex((day) => day.id === dayId) : -1;
      const fallbackDayIndex = clamp(weekdayIndexFromIso(date), 0, prev.routine.length - 1);
      return {
        ...prev,
        sessionDate: date,
        dayIndex: savedDayIndex >= 0 ? savedDayIndex : fallbackDayIndex,
      };
    });
    setTab("hoy");
  };

  const buildBaseDraft = () => {
    const base = {};
    selectedDayExercises.forEach((exercise) => {
      const sets = Array.isArray(sessionSavedLogs?.[exercise.id]) ? sessionSavedLogs[exercise.id].map(normalizeSet) : [];
      if (sets.length > 0) base[exercise.id] = sets;
    });
    return base;
  };

  const updateSessionDraft = (updater) => {
    setDraftLogs((prev) => {
      const current = prev?.[sessionDraftKey];
      const currentDraft =
        current && typeof current === "object"
          ? Object.fromEntries(Object.entries(current).map(([exerciseId, sets]) => [exerciseId, Array.isArray(sets) ? sets.map(normalizeSet) : []]))
          : buildBaseDraft();
      const nextDraft = updater(currentDraft);
      return { ...prev, [sessionDraftKey]: nextDraft };
    });
  };

  const syncDraftToTrainingLogs = (nextDraft) => {
    setState((prev) => {
      const prevDateLogs = prev.trainingLogs?.[selectedDay.id]?.[state.sessionDate] || {};
      const dayLogs = { ...(prev.trainingLogs[selectedDay.id] || {}) };
      const dateLogs = { ...(dayLogs[state.sessionDate] || {}) };

      selectedDayExercises.forEach((exercise) => {
        const sets = Array.isArray(nextDraft?.[exercise.id]) ? nextDraft[exercise.id].map(normalizeSet) : [];
        if (sets.length > 0) dateLogs[exercise.id] = sets;
        else delete dateLogs[exercise.id];
      });

      const previousSnapshot = JSON.stringify(prevDateLogs);
      const nextSnapshot = JSON.stringify(dateLogs);
      if (previousSnapshot === nextSnapshot) return prev;

      if (Object.keys(dateLogs).length > 0) dayLogs[state.sessionDate] = dateLogs;
      else delete dayLogs[state.sessionDate];

      const nextTrainingLogs = { ...prev.trainingLogs };
      if (Object.keys(dayLogs).length > 0) nextTrainingLogs[selectedDay.id] = dayLogs;
      else delete nextTrainingLogs[selectedDay.id];

      const nextTrainingLogMeta = { ...(prev.trainingLogMeta || {}) };
      const metaByDay = { ...(nextTrainingLogMeta[selectedDay.id] || {}) };
      if (Object.keys(dateLogs).length > 0) {
        const previousMeta = metaByDay[state.sessionDate] || {};
        metaByDay[state.sessionDate] = {
          dayName: selectedDay.fullDay,
          title: selectedDay.title,
          exerciseNames: {
            ...(previousMeta.exerciseNames || {}),
            ...Object.fromEntries(selectedDayExercises.map((exercise) => [exercise.id, exercise.name])),
          },
        };
      } else {
        delete metaByDay[state.sessionDate];
      }
      if (Object.keys(metaByDay).length > 0) nextTrainingLogMeta[selectedDay.id] = metaByDay;
      else delete nextTrainingLogMeta[selectedDay.id];

      return { ...prev, trainingLogs: nextTrainingLogs, trainingLogMeta: nextTrainingLogMeta };
    });
  };

  const addSetDraft = (exerciseId, payload) => {
    updateSessionDraft((currentDraft) => {
      const currentSets = Array.isArray(currentDraft?.[exerciseId]) ? currentDraft[exerciseId] : [];
      const nextDraft = { ...currentDraft, [exerciseId]: [...currentSets, payload] };
      syncDraftToTrainingLogs(nextDraft);
      return nextDraft;
    });
  };

  const removeSetDraft = (exerciseId, index) => {
    updateSessionDraft((currentDraft) => {
      const sets = [...(Array.isArray(currentDraft?.[exerciseId]) ? currentDraft[exerciseId] : [])];
      sets.splice(index, 1);
      let nextDraft = { ...currentDraft };
      if (sets.length > 0) nextDraft = { ...currentDraft, [exerciseId]: sets };
      else delete nextDraft[exerciseId];
      syncDraftToTrainingLogs(nextDraft);
      return nextDraft;
    });
  };

  const startRestTimerFromExercise = (exercise) => {
    const seconds = parseRestSeconds(exercise?.rest || "");
    setRestTimer({ endAt: Date.now() + seconds * 1000, seconds, exercise: exercise?.name || "Ejercicio" });
  };

  const setExerciseNote = (exerciseId, note) => {
    setState((prev) => {
      const allNotes = { ...(prev.exerciseNotes || {}) };
      const byDay = { ...(allNotes[selectedDay.id] || {}) };
      const byDate = { ...(byDay[state.sessionDate] || {}) };
      const trimmed = String(note || "").trim();
      if (trimmed) {
        byDate[exerciseId] = trimmed;
      } else {
        delete byDate[exerciseId];
      }
      if (Object.keys(byDate).length > 0) byDay[state.sessionDate] = byDate;
      else delete byDay[state.sessionDate];
      if (Object.keys(byDay).length > 0) allNotes[selectedDay.id] = byDay;
      else delete allNotes[selectedDay.id];
      return { ...prev, exerciseNotes: allNotes };
    });
  };

  const clearRestTimer = () => setRestTimer({ endAt: null, seconds: 0, exercise: "" });

  const addWeightLog = () => {
    const weight = Number(weightForm.weight);
    const waist = weightForm.waist === "" ? null : Number(weightForm.waist);
    if (!weightForm.date || Number.isNaN(weight) || weight <= 0) return;
    setState((prev) => ({
      ...prev,
      weightLogs: [
        ...prev.weightLogs,
        { id: makeId("w"), date: weightForm.date, weight, waist: Number.isNaN(waist) ? null : waist, ts: Date.now() },
      ],
    }));
    setWeightForm((prev) => ({ ...prev, weight: "", waist: "" }));
  };

  const removeWeightLog = (id) => {
    setState((prev) => ({ ...prev, weightLogs: prev.weightLogs.filter((entry) => entry.id !== id) }));
  };

  // Routine editor mutators
  const updateSelectedDay = (field, value) => {
    setState((prev) => {
      const routine = [...prev.routine];
      routine[prev.dayIndex] = { ...routine[prev.dayIndex], [field]: value };
      return { ...prev, routine };
    });
  };

  const addRoutineDay = () => {
    setState((prev) => {
      const routine = [
        ...prev.routine,
        { id: makeId("d"), shortDay: "NEW", fullDay: "Nuevo día", type: "Fuerza", title: "Nueva sesión", postCardio: "", cardioProtocol: "", packageIds: [], customExercises: [] },
      ];
      return { ...prev, routine, dayIndex: routine.length - 1 };
    });
  };

  const removeSelectedDay = () => {
    if (!window.confirm("¿Borrar este día completo?")) return;
    setState((prev) => {
      if (prev.routine.length <= 1) return prev;
      const routine = prev.routine.filter((_, index) => index !== prev.dayIndex);
      return { ...prev, routine, dayIndex: clamp(prev.dayIndex, 0, routine.length - 1) };
    });
  };

  const toggleDayPackage = (packageId) => {
    setState((prev) => {
      const routine = [...prev.routine];
      const day = { ...routine[prev.dayIndex] };
      const current = Array.isArray(day.packageIds) ? day.packageIds : [];
      day.packageIds = current.includes(packageId)
        ? current.filter((id) => id !== packageId)
        : [...current, packageId];
      routine[prev.dayIndex] = day;
      return { ...prev, routine };
    });
  };

  const addExercise = () => {
    setState((prev) => {
      const routine = [...prev.routine];
      const day = { ...routine[prev.dayIndex] };
      day.customExercises = [...(day.customExercises || []), { id: makeId("e"), name: "Nuevo ejercicio", sets: "3", reps: "8-10", rest: "90s", note: "" }];
      routine[prev.dayIndex] = day;
      return { ...prev, routine };
    });
  };

  const updateExercise = (exerciseId, field, value) => {
    setState((prev) => {
      const routine = [...prev.routine];
      const day = { ...routine[prev.dayIndex] };
      day.customExercises = (day.customExercises || []).map((ex) => (ex.id === exerciseId ? { ...ex, [field]: value } : ex));
      routine[prev.dayIndex] = day;
      return { ...prev, routine };
    });
  };

  const removeExercise = (exerciseId) => {
    setState((prev) => {
      const routine = [...prev.routine];
      const day = { ...routine[prev.dayIndex] };
      day.customExercises = (day.customExercises || []).filter((ex) => ex.id !== exerciseId);
      routine[prev.dayIndex] = day;
      return { ...prev, routine };
    });
  };

  const moveExercise = (exerciseId, delta) => {
    setState((prev) => {
      const routine = [...prev.routine];
      const day = { ...routine[prev.dayIndex] };
      const exercises = [...(day.customExercises || [])];
      const idx = exercises.findIndex((ex) => ex.id === exerciseId);
      const target = idx + delta;
      if (idx < 0 || target < 0 || target >= exercises.length) return prev;
      const [item] = exercises.splice(idx, 1);
      exercises.splice(target, 0, item);
      day.customExercises = exercises;
      routine[prev.dayIndex] = day;
      return { ...prev, routine };
    });
  };

  const duplicateExercise = (exerciseId) => {
    setState((prev) => {
      const routine = [...prev.routine];
      const day = { ...routine[prev.dayIndex] };
      const exercises = [...(day.customExercises || [])];
      const idx = exercises.findIndex((ex) => ex.id === exerciseId);
      if (idx < 0) return prev;
      const original = exercises[idx];
      const copy = { ...original, id: makeId("e"), name: `${original.name} (copia)` };
      exercises.splice(idx + 1, 0, copy);
      day.customExercises = exercises;
      routine[prev.dayIndex] = day;
      return { ...prev, routine };
    });
  };

  // Package management
  const createPackage = (name = "Nuevo paquete") => {
    setState((prev) => ({
      ...prev,
      exercisePackages: [
        ...(prev.exercisePackages || []),
        { id: makeId("pkg"), name, color: "#9aa3b2", exercises: [] },
      ],
    }));
  };

  const updatePackage = (packageId, field, value) => {
    setState((prev) => ({
      ...prev,
      exercisePackages: (prev.exercisePackages || []).map((pkg) =>
        pkg.id === packageId ? { ...pkg, [field]: value } : pkg
      ),
    }));
  };

  const removePackage = (packageId) => {
    if (!window.confirm("¿Borrar esta rutina? Los días que la usen perderán esos ejercicios.")) return;
    setState((prev) => ({
      ...prev,
      exercisePackages: (prev.exercisePackages || []).filter((pkg) => pkg.id !== packageId),
      routine: (prev.routine || []).map((day) => ({
        ...day,
        packageIds: (day.packageIds || []).filter((id) => id !== packageId),
      })),
    }));
  };

  const addPackageExercise = (packageId) => {
    setState((prev) => ({
      ...prev,
      exercisePackages: (prev.exercisePackages || []).map((pkg) =>
        pkg.id === packageId
          ? {
              ...pkg,
              exercises: [
                ...pkg.exercises,
                { id: makeId("pex"), name: "Nuevo ejercicio", sets: "3", reps: "8-10", rest: "90s", note: "" },
              ],
            }
          : pkg
      ),
    }));
  };

  const updatePackageExercise = (packageId, exerciseId, field, value) => {
    setState((prev) => ({
      ...prev,
      exercisePackages: (prev.exercisePackages || []).map((pkg) =>
        pkg.id === packageId
          ? {
              ...pkg,
              exercises: pkg.exercises.map((ex) => (ex.id === exerciseId ? { ...ex, [field]: value } : ex)),
            }
          : pkg
      ),
    }));
  };

  const removePackageExercise = (packageId, exerciseId) => {
    setState((prev) => ({
      ...prev,
      exercisePackages: (prev.exercisePackages || []).map((pkg) =>
        pkg.id === packageId
          ? { ...pkg, exercises: pkg.exercises.filter((ex) => ex.id !== exerciseId) }
          : pkg
      ),
    }));
  };

  const movePackageExercise = (packageId, exerciseId, delta) => {
    setState((prev) => ({
      ...prev,
      exercisePackages: (prev.exercisePackages || []).map((pkg) => {
        if (pkg.id !== packageId) return pkg;
        const exercises = [...pkg.exercises];
        const idx = exercises.findIndex((ex) => ex.id === exerciseId);
        const target = idx + delta;
        if (idx < 0 || target < 0 || target >= exercises.length) return pkg;
        const [item] = exercises.splice(idx, 1);
        exercises.splice(target, 0, item);
        return { ...pkg, exercises };
      }),
    }));
  };

  const onImportFile = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
      const text = isPdf ? await extractRoutineTextFromPdf(file) : await file.text();
      setImportText(text);
      setImportFileName(isPdf ? file.name.replace(/\.pdf$/i, ".txt") : (file.name || ""));
      setImportError("");
    } catch (caught) {
      setImportError(caught?.message || "No se pudo leer el archivo.");
    } finally {
      event.target.value = "";
    }
  };

  const applyImport = () => {
    try {
      const parsed = parseRoutineImport(importText, importFileName);
      if (!parsed.routine.length) {
        setImportError("La importación no produjo días válidos.");
        return;
      }
      setState((prev) => ({ ...prev, routine: parsed.routine, dayIndex: 0 }));
      setImportOpen(false);
      setImportText("");
      setImportFileName("");
      setImportError("");
    } catch (caught) {
      setImportError(caught?.message || "No se pudo importar la rutina.");
    }
  };

  // Cloud conflict actions
  const useCloudVersion = async () => {
    if (!userId) return;
    const remote = await fetchCloudState(userId);
    if (!remote.ok || !remote.payload) return;
    setState(remote.payload);
    setSaveMeta(saveLocalState(remote.payload, userId, true));
    knownCloudUpdatedAtRef.current = remote.cloudUpdatedAt || knownCloudUpdatedAtRef.current;
    setCloudMeta((prev) => ({ ...prev, conflict: null, error: null, syncedAt: remote.cloudUpdatedAt || prev.syncedAt }));
  };

  const overwriteCloudVersion = () => {
    forceCloudOverwriteRef.current = true;
    setCloudMeta((prev) => ({ ...prev, conflict: null, error: null }));
    setState((prev) => ({ ...prev }));
  };

  // Export
  const exportProgressCsv = () => {
    const header = [["tipo", "fecha", "bloque", "ejercicio", "series", "maximo_kg", "promedio_kg", "ultimo_kg", "ultimas_repeticiones", "carga_total"]];
    const weightRows = state.weightLogs.map((entry) => ["peso", entry.date, "", "", "", "", "", Number(entry.weight) || 0, entry.waist ?? "", ""]);
    const routineRows = routineSessions.flatMap((session) =>
      session.exerciseRows.map((item) => [
        "rutina", session.date, `${session.dayName} - ${session.title}`, item.name,
        item.setsCount, item.max, item.avg, item.last.weight, item.last.reps, item.volume,
      ])
    );
    const rows = [...header, ...weightRows, ...routineRows];
    const csv = rows.map((row) => row.map((value) => `"${String(value ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `progreso-${todayInZone(tz)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const exportBackup = () => {
    const payload = { exportedAt: new Date().toISOString(), app: "Fit App", state };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `anvil-copia-${todayInZone(tz)}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const importBackup = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = parseJson(text, null);
      const nextState = normalizeState(parsed?.state || parsed);
      setState(nextState);
      setSaveMeta(saveLocalState(nextState, scope, true));
      window.alert("Copia restaurada correctamente.");
    } catch {
      window.alert("No se pudo restaurar la copia.");
    } finally {
      event.target.value = "";
    }
  };

  const resetDefaults = () => {
    if (!window.confirm("¿Restaurar plan y rutinas por defecto? Esto reemplaza los días y rutinas pero conserva tu historial.")) return;
    setState((prev) => ({
      ...prev,
      routine: DEFAULT_ROUTINE,
      exercisePackages: DEFAULT_PACKAGES,
      dayIndex: weekdayIndexInZone(tz),
    }));
  };

  const enterLocalMode = () => {
    setAuthError("");
    setLocalMode(true);
    safeLocalSet(AUTH_LOCAL_MODE_KEY, "true");
  };

  const showLogin = () => {
    setLocalMode(false);
    safeLocalRemove(AUTH_LOCAL_MODE_KEY);
  };

  const signOut = async () => {
    showLogin();
    if (!supabase) return;
    await supabase.auth.signOut();
  };

  const sendPasswordSetupLink = async () => {
    const email = authSession?.user?.email;
    if (!supabase || !email) return;
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: SUPABASE_AUTH_REDIRECT_URL || window.location.origin,
    });
    if (error) {
      window.alert(normalizeAuthUiError(error));
      return;
    }
    window.alert("Te enviamos un enlace seguro para crear o cambiar tu contraseña.");
  };

  const completeOnboarding = ({ profileName, preferences, routine, source, openEditor }) => {
    forceCloudOverwriteRef.current = true;
    setState((prev) => alignStateSessionToToday(normalizeState({
      ...prev,
      settings: {
        ...prev.settings,
        profileName,
        trainingGoal: preferences.goal,
        trainingDaysPerWeek: preferences.daysPerWeek,
        trainingEquipment: preferences.equipment,
      },
      routine,
      onboarding: {
        completed: true,
        source,
        completedAt: new Date().toISOString(),
      },
    })));
    setTab("hoy");
    setRoutineEditMode(Boolean(openEditor));
  };

  const recoverDeviceState = ({ profileName = "" } = {}) => {
    if (!userId || !deviceStateCandidate) return;
    const summary = summarizeDeviceState(deviceStateCandidate);
    const confirmed = window.confirm(
      `Se combinarán ${summary.setsCount} series y ${summary.trainingDays} días entrenados con tu cuenta. No borraremos la copia de este dispositivo. ¿Continuar?`
    );
    if (!confirmed) return;

    const recovered = mergeDeviceStateIntoAccount(state, deviceStateCandidate, profileName);
    forceCloudOverwriteRef.current = true;
    setState(recovered);
    setDraftLogs(loadDrafts(LOCAL_SCOPE));
    saveLocalState(recovered, userId, true);
    safeLocalSet(`${DEVICE_IMPORT_FLAG_PREFIX}_${userId}`, "true");
    setDeviceStateCandidate(null);
    setTab("hoy");
    setRoutineEditMode(false);
  };

  // ==========================================================================
  // Render gates
  // ==========================================================================
  if (SUPABASE_CONFIGURED && !authReady && !usingLocalMode) {
    return (
      <div className="gate-shell gate-overlay">
        <div className="gate-card">
          <p className="gate-tag">CARGANDO</p>
          <h1>Un momento...</h1>
          <p className="gate-sub">Verificando sesión.</p>
        </div>
      </div>
    );
  }

  if (SUPABASE_CONFIGURED && passwordRecoveryMode && userId) {
    return (
      <PasswordRecoveryScreen
        email={authSession?.user?.email}
        onComplete={() => setPasswordRecoveryMode(false)}
        onCancel={async () => {
          setPasswordRecoveryMode(false);
          await signOut();
        }}
      />
    );
  }

  if (SUPABASE_CONFIGURED && !userId && !usingLocalMode) {
    return <AuthScreen supabaseConfigured authMessage={authError} onContinueLocal={enterLocalMode} />;
  }

  if (hasCloudAccount && !cloudReady) {
    return (
      <div className="gate-shell gate-overlay">
        <div className="gate-card">
          <p className="gate-tag">SINCRONIZANDO</p>
          <h1>Preparando tu cuenta...</h1>
          <p className="gate-sub">Estamos recuperando tu rutina y progreso.</p>
        </div>
      </div>
    );
  }

  if (hasCloudAccount && !state.onboarding?.completed) {
    return (
      <Onboarding
        email={authSession?.user?.email || ""}
        initialName={state.settings.profileName || authSession?.user?.user_metadata?.display_name || ""}
        localSummary={deviceStateSummary}
        onRecoverLocal={recoverDeviceState}
        onComplete={completeOnboarding}
      />
    );
  }

  // ==========================================================================
  // Render main app
  // ==========================================================================
  const saveStatusText = !hasCloudAccount
    ? "Guardado en este dispositivo"
    : cloudMeta.conflict
      ? "Revisa tus cambios"
      : cloudMeta.syncing
        ? "Guardando..."
        : cloudMeta.queueCount > 0
          ? isOnline ? "Guardando..." : "Sin internet · se guardará luego"
          : cloudMeta.error
            ? "Guardado en este dispositivo"
            : cloudMeta.syncedAt
              ? "Guardado en tu cuenta"
              : "Guardado en este dispositivo";

  const displayName = state.settings.profileName || authSession?.user?.user_metadata?.display_name || authSession?.user?.email?.split("@")[0] || "Atleta";

  return (
    <div className="app-shell">
      <header className="hero">
        <div className="hero-brand">
          <BrandLogo size={42} />
          <div className="hero-text">
            <h1>Anvil</h1>
            <p className="hero-sub">{displayName}{latestWeight ? ` · ${latestWeight.toFixed(1)}kg` : ""}{state.settings.goalWeight ? ` · meta ${state.settings.goalWeight}kg` : ""}</p>
            <p className="hero-sync">{saveStatusText}</p>
          </div>
        </div>
        <div className="stack gap-8 hero-actions">
          {hasCloudAccount && (
            <button className="btn btn-ghost btn-mini" type="button" onClick={signOut}>Salir</button>
          )}
        </div>
      </header>

      <nav className="tabs" style={{ gridTemplateColumns: `repeat(${TABS.length}, minmax(0, 1fr))` }}>
        {TABS.map(([id, label]) => (
          <button key={id} type="button" className={`tab ${tab === id ? "active" : ""}`} onClick={() => setTab(id)}>{label}</button>
        ))}
      </nav>

      {tab === "hoy" && !routineEditMode && (
        <section className="panel home-panel">
          <article className={`today-banner ${state.sessionDate === todayStr ? "is-today" : "is-other"}`}>
            <div className="today-banner-main">
              <p className="today-banner-kicker">{state.sessionDate === todayStr ? "Hoy" : "Viendo"}</p>
              <h2 className="today-banner-title">{formatLongDateInZone(state.sessionDate, tz)}</h2>
              <p className="today-banner-sub">{selectedDay.type} · {selectedDayExercises.length} ejercicios</p>
            </div>
            <div className="today-banner-actions">
              {state.sessionDate !== todayStr && (
                <button className="btn btn-primary btn-mini" type="button" onClick={() => setSessionDate(todayStr)}>
                  Ir a hoy
                </button>
              )}
            </div>
          </article>

          <details className="date-picker-collapse top-10">
            <summary>Cambiar fecha de la sesión</summary>
            <div className="date-control-row top-8">
              <input
                className="input date-input-main"
                type="date"
                value={state.sessionDate}
                onChange={(event) => setSessionDate(event.target.value)}
              />
              <button
                className="btn btn-ghost btn-date-icon"
                type="button"
                onClick={() => setSessionDate(todayStr)}
                aria-label="Usar hoy"
                title="Hoy"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <rect x="3.5" y="5.5" width="17" height="15" rx="3" fill="none" stroke="currentColor" strokeWidth="1.8" />
                  <path d="M7 3.5v4M17 3.5v4M3.5 9.5h17" fill="none" stroke="currentColor" strokeWidth="1.8" />
                  <circle cx="12" cy="14.5" r="2.2" fill="currentColor" />
                </svg>
              </button>
            </div>
            <p className="muted small top-6">Hoy se actualiza solo a medianoche.</p>
          </details>

          <div className="day-chip-row day-chip-row-tall top-10">
            {state.routine.map((day, index) => {
              const dayExs = getDayExercises(day, state.exercisePackages);
              const dateLogs = state.trainingLogs?.[day.id]?.[state.sessionDate] || {};
              const dayDraft = draftLogs?.[makeDraftSessionKey(day.id, state.sessionDate)] || {};
              const hasLogs = dayExs.some((exercise) => {
                const hasSaved = Array.isArray(dateLogs?.[exercise.id]) && dateLogs[exercise.id].length > 0;
                const hasDraft = Array.isArray(dayDraft?.[exercise.id]) && dayDraft[exercise.id].length > 0;
                return hasSaved || hasDraft;
              });
              return (
                <button
                  key={day.id}
                  type="button"
                  className={`day-chip day-chip-tall ${index === state.dayIndex ? "active" : ""}`}
                  onClick={() => selectDay(index)}
                >
                  <span className="day-chip-short">{day.shortDay}</span>
                  <span className="day-chip-count">{dayExs.length || (day.cardioProtocol ? "C" : "0")}</span>
                  {hasLogs && <span className="dot" />}
                </button>
              );
            })}
          </div>

          <article className="focus-card focus-card-xl top-10">
            <div className="row space-between wrap">
              <div>
                <p className="focus-kicker">{selectedDay.fullDay} · {selectedDay.type}</p>
                <h3>{selectedDay.title}</h3>
              </div>
              <div className="focus-stats">
                <span className="focus-stat">
                  <strong>{sessionSetCount}</strong>
                  <small>series hoy</small>
                </span>
              </div>
            </div>
            {selectedDay.postCardio && <p className="muted top-8">{selectedDay.postCardio}</p>}
            {selectedDay.cardioProtocol && <p className="muted top-6">{selectedDay.cardioProtocol}</p>}
          </article>

          {restRemainingSec > 0 && (
            <article className="card top-10 rest-timer-card">
              <div className="row space-between wrap">
                <div>
                  <h4>Descanso · {restTimer.exercise}</h4>
                  <p className="muted small top-6">Empezó al guardar la serie.</p>
                </div>
                <span className="pill">{restRemainingSec}s</span>
              </div>
              <div className="row gap-8 wrap top-8">
                <button
                  className="btn btn-soft btn-mini"
                  type="button"
                  onClick={() => setRestTimer((prev) => ({ ...prev, endAt: (prev.endAt || Date.now()) + 60000 }))}
                >
                  +60s
                </button>
                <button className="btn btn-danger btn-mini" type="button" onClick={clearRestTimer}>
                  Detener
                </button>
              </div>
            </article>
          )}

          <div className="home-actions top-10">
            <button className="btn btn-ghost" type="button" onClick={() => setRoutineEditMode(true)}>
              Editar plan
            </button>
            <button className="btn btn-soft btn-timer-open" type="button" onClick={() => setChronoOpen(true)}>
              ⏱ Cronómetro
              {chrono.running && (
                <span className="pill" style={{ marginLeft: 6 }}>
                  {formatTimerTime(chronoRemainingSec)}
                </span>
              )}
            </button>
          </div>

          {selectedDayExercises.length > 0 ? (
            <div className="top-10 stack gap-10">
              <p className="muted small">Abre un ejercicio, registra una serie y repite con un toque. Todo se guarda al instante.</p>
              {selectedDayExercises.map((exercise) => {
                const history = getExerciseHistory(state.trainingLogs, selectedDay.id, exercise.id);
                const previous = history.find((entry) => entry.date < state.sessionDate) || history.find((entry) => entry.date !== state.sessionDate) || null;
                const currentSets = Array.isArray(sessionDraft?.[exercise.id]) ? sessionDraft[exercise.id] : [];
                const sessionNote = state.exerciseNotes?.[selectedDay.id]?.[state.sessionDate]?.[exercise.id] || "";
                return (
                  <ExerciseLogItem
                    key={`${selectedDay.id}_${state.sessionDate}_${exercise.id}`}
                    exercise={exercise}
                    previous={previous}
                    currentSets={currentSets}
                    sessionNote={sessionNote}
                    onAddSet={addSetDraft}
                    onRemoveSet={removeSetDraft}
                    onStartRest={startRestTimerFromExercise}
                    onSetNote={setExerciseNote}
                    expanded={expandedExerciseId === exercise.id}
                    onToggle={() => setExpandedExerciseId((prev) => (prev === exercise.id ? null : exercise.id))}
                  />
                );
              })}
            </div>
          ) : (
            <article className="card top-10">
              <p className="muted">Sin ejercicios en este día. Toca "Editar plan" para agregar una rutina.</p>
            </article>
          )}
        </section>
      )}

      {tab === "hoy" && routineEditMode && (
        <section className="panel editor-panel">
          <header className="editor-header">
            <div>
              <p className="editor-kicker">Editor del plan</p>
              <h2>{selectedDay.fullDay}</h2>
              <p className="muted small top-6">{selectedDayExercises.length} ejercicios totales</p>
            </div>
            <button className="btn btn-primary" type="button" onClick={() => setRoutineEditMode(false)}>Listo</button>
          </header>

          <div className="day-chip-row day-chip-row-tall top-10">
            {state.routine.map((day, index) => {
              const dayExs = getDayExercises(day, state.exercisePackages);
              return (
                <button
                  key={day.id}
                  type="button"
                  className={`day-chip day-chip-tall ${index === state.dayIndex ? "active" : ""}`}
                  onClick={() => selectDay(index)}
                >
                  <span className="day-chip-short">{day.shortDay}</span>
                  <span className="day-chip-count">{dayExs.length}</span>
                </button>
              );
            })}
            <button className="day-chip day-chip-tall day-chip-add" type="button" onClick={addRoutineDay} aria-label="Agregar día">
              <span className="day-chip-short">+</span>
              <span className="day-chip-count">nuevo</span>
            </button>
          </div>

          <article className="card top-12 editor-section">
            <div className="row space-between wrap">
              <h4>Información del día</h4>
              <button className="btn btn-danger btn-mini" type="button" onClick={removeSelectedDay}>Borrar día</button>
            </div>
            <div className="grid-two top-8">
              <Field label="Nombre corto" value={selectedDay.shortDay} onChange={(value) => updateSelectedDay("shortDay", value)} />
              <Field label="Día completo" value={selectedDay.fullDay} onChange={(value) => updateSelectedDay("fullDay", value)} />
              <Field label="Tipo" value={selectedDay.type} onChange={(value) => updateSelectedDay("type", value)} />
              <Field label="Título de la sesión" value={selectedDay.title} onChange={(value) => updateSelectedDay("title", value)} />
            </div>
            <label className="field top-8">
              <span>Cardio después</span>
              <input className="input" type="text" value={selectedDay.postCardio} onChange={(event) => updateSelectedDay("postCardio", event.target.value)} placeholder="Ej. 20 min caminadora suave" />
            </label>
            <label className="field top-8">
              <span>Detalle del cardio</span>
              <textarea className="input" rows={3} value={selectedDay.cardioProtocol} onChange={(event) => updateSelectedDay("cardioProtocol", event.target.value)} placeholder="Duración, ritmo o indicaciones..." />
            </label>
          </article>

          <article className="card top-12 editor-section">
            <div className="row space-between wrap">
              <h4>Rutinas asignadas a este día</h4>
              <span className="pill">{(selectedDay.packageIds || []).length}</span>
            </div>
            <p className="muted small top-6">Toca una rutina para agregarla o quitarla del día. Si editas una rutina, todos los días que la usan se actualizan.</p>
            <div className="package-pick-grid top-10">
              {(state.exercisePackages || []).length === 0 && (
                <p className="muted small">Aún no tienes rutinas. Créalas abajo en "Mis rutinas".</p>
              )}
              {(state.exercisePackages || []).map((pkg) => {
                const active = (selectedDay.packageIds || []).includes(pkg.id);
                return (
                  <button
                    key={pkg.id}
                    type="button"
                    className={`package-pick ${active ? "is-active" : ""}`}
                    style={active ? { borderColor: pkg.color, boxShadow: `inset 0 0 0 1px ${pkg.color}55` } : undefined}
                    onClick={() => toggleDayPackage(pkg.id)}
                  >
                    <span className="package-pick-dot" style={{ background: pkg.color }} />
                    <span className="package-pick-name">{pkg.name}</span>
                    <span className="package-pick-count">{pkg.exercises.length}</span>
                  </button>
                );
              })}
            </div>
          </article>

          <article className="card top-12 editor-section">
            <div className="row space-between wrap">
              <h4>Ejercicios extra (solo este día)</h4>
              <span className="pill">{(selectedDay.customExercises || []).length}</span>
            </div>
            <p className="muted small top-6">Sirve para algo puntual que no quieres meter en una rutina reutilizable.</p>

            {(selectedDay.customExercises || []).length === 0 && (
              <p className="muted top-8">Sin ejercicios extra. Usa el botón de abajo si necesitas uno.</p>
            )}

            <div className="stack gap-10 top-10">
              {(selectedDay.customExercises || []).map((exercise, index) => (
                <div key={exercise.id} className="exercise-edit-card">
                  <div className="exercise-edit-head">
                    <span className="exercise-edit-index">{index + 1}</span>
                    <input
                      className="input exercise-edit-name"
                      type="text"
                      value={exercise.name}
                      onChange={(event) => updateExercise(exercise.id, "name", event.target.value)}
                      placeholder="Nombre del ejercicio"
                    />
                  </div>

                  <div className="exercise-edit-grid top-8">
                    <Field label="Series" value={exercise.sets} onChange={(value) => updateExercise(exercise.id, "sets", value)} />
                    <Field label="Repeticiones" value={exercise.reps} onChange={(value) => updateExercise(exercise.id, "reps", value)} />
                    <Field label="Descanso" value={exercise.rest} onChange={(value) => updateExercise(exercise.id, "rest", value)} />
                  </div>
                  <label className="field top-8">
                    <span>Nota</span>
                    <input className="input" type="text" value={exercise.note} onChange={(event) => updateExercise(exercise.id, "note", event.target.value)} placeholder="Algo para recordar" />
                  </label>

                  <div className="exercise-edit-actions top-8">
                    <button className="btn btn-soft btn-mini" type="button" onClick={() => moveExercise(exercise.id, -1)} disabled={index === 0} aria-label="Subir">↑</button>
                    <button className="btn btn-soft btn-mini" type="button" onClick={() => moveExercise(exercise.id, 1)} disabled={index === (selectedDay.customExercises || []).length - 1} aria-label="Bajar">↓</button>
                    <button className="btn btn-ghost btn-mini" type="button" onClick={() => duplicateExercise(exercise.id)}>Duplicar</button>
                    <button className="btn btn-danger btn-mini" type="button" onClick={() => removeExercise(exercise.id)}>Borrar</button>
                  </div>
                </div>
              ))}
            </div>

            <button className="btn btn-primary btn-add-exercise top-12" type="button" onClick={addExercise}>
              + Agregar ejercicio extra
            </button>
          </article>

          <article className="card top-12 editor-section">
            <div className="row space-between wrap">
              <h4>Mis rutinas</h4>
              <button
                className="btn btn-primary btn-mini"
                type="button"
                onClick={() => {
                  const name = window.prompt("Nombre de la rutina (ej. Pecho, Espalda, Cardio)") || "";
                  if (name.trim()) createPackage(name.trim());
                }}
              >
                + Nueva rutina
              </button>
            </div>
            <p className="muted small top-6">Rutinas reutilizables. Asígnalas a los días desde la sección de arriba.</p>

            {(state.exercisePackages || []).length === 0 && (
              <p className="muted top-8">Sin rutinas. Crea una con el botón "+".</p>
            )}

            <div className="stack gap-12 top-10">
              {(state.exercisePackages || []).map((pkg) => (
                <details key={pkg.id} className="package-card">
                  <summary>
                    <span className="package-pick-dot" style={{ background: pkg.color }} />
                    <strong>{pkg.name}</strong>
                    <span className="pill">{pkg.exercises.length}</span>
                  </summary>
                  <div className="stack gap-8 top-10">
                    <div className="grid-two">
                      <Field label="Nombre" value={pkg.name} onChange={(value) => updatePackage(pkg.id, "name", value)} />
                      <ColorPicker value={pkg.color} onChange={(value) => updatePackage(pkg.id, "color", value)} />
                    </div>
                    {pkg.exercises.map((exercise, index) => (
                      <div key={exercise.id} className="exercise-edit-card">
                        <div className="exercise-edit-head">
                          <span className="exercise-edit-index">{index + 1}</span>
                          <input
                            className="input exercise-edit-name"
                            type="text"
                            value={exercise.name}
                            onChange={(event) => updatePackageExercise(pkg.id, exercise.id, "name", event.target.value)}
                          />
                        </div>
                        <div className="exercise-edit-grid top-8">
                          <Field label="Series" value={exercise.sets} onChange={(value) => updatePackageExercise(pkg.id, exercise.id, "sets", value)} />
                          <Field label="Repeticiones" value={exercise.reps} onChange={(value) => updatePackageExercise(pkg.id, exercise.id, "reps", value)} />
                          <Field label="Descanso" value={exercise.rest} onChange={(value) => updatePackageExercise(pkg.id, exercise.id, "rest", value)} />
                        </div>
                        <label className="field top-8">
                          <span>Nota</span>
                          <input className="input" type="text" value={exercise.note} onChange={(event) => updatePackageExercise(pkg.id, exercise.id, "note", event.target.value)} />
                        </label>
                        <div className="exercise-edit-actions top-8">
                          <button className="btn btn-soft btn-mini" type="button" onClick={() => movePackageExercise(pkg.id, exercise.id, -1)} disabled={index === 0}>↑</button>
                          <button className="btn btn-soft btn-mini" type="button" onClick={() => movePackageExercise(pkg.id, exercise.id, 1)} disabled={index === pkg.exercises.length - 1}>↓</button>
                          <button className="btn btn-danger btn-mini" type="button" onClick={() => removePackageExercise(pkg.id, exercise.id)}>Borrar</button>
                        </div>
                      </div>
                    ))}
                    <button className="btn btn-primary btn-add-exercise" type="button" onClick={() => addPackageExercise(pkg.id)}>
                      + Agregar ejercicio a la rutina
                    </button>
                    <button className="btn btn-danger btn-mini" type="button" onClick={() => removePackage(pkg.id)}>
                      Borrar rutina
                    </button>
                  </div>
                </details>
              ))}
            </div>
          </article>

          <article className="card top-12 editor-section">
            <div className="row space-between wrap">
              <h4>Importar rutina</h4>
              <button className="btn btn-ghost btn-mini" type="button" onClick={() => setImportOpen((v) => !v)}>
                {importOpen ? "Cerrar" : "Abrir"}
              </button>
            </div>
            {importOpen && (
              <div className="stack gap-8 top-8">
                <p className="muted small">Sube un archivo o pega la rutina. Reemplaza la rutina actual.</p>
                <label className="btn btn-soft file-label">
                  Subir archivo
                  <input type="file" accept=".pdf,.json,.csv,.txt,.md,application/pdf,text/plain,text/csv,application/json" onChange={onImportFile} />
                </label>
                {importFileName && <p className="tiny-note">Archivo: {importFileName}</p>}
                <label className="field">
                  <span>O pega el texto</span>
                  <textarea
                    className="input"
                    rows={6}
                    value={importText}
                    onChange={(event) => setImportText(event.target.value)}
                    placeholder={"Lunes - Pecho\n- Press banca | 4 | 8-10 | 90s\n- Press inclinado | 3 | 10-12 | 75s"}
                  />
                </label>
                {importError && <p className="error-text">{importError}</p>}
                <button className="btn btn-primary" type="button" onClick={applyImport} disabled={!importText.trim()}>
                  Aplicar y reemplazar rutina
                </button>
              </div>
            )}
          </article>

          <div className="editor-footer top-12">
            <button className="btn btn-primary btn-large" type="button" onClick={() => setRoutineEditMode(false)}>
              Guardar y volver
            </button>
            <p className="muted small top-6">Cambios guardados automáticamente.</p>
          </div>
        </section>
      )}

      {tab === "historial" && (
        <section className="panel calendar-panel">
          <div className="row space-between wrap">
            <h2>Calendario</h2>
            <span className="pill">
              {trainingDateSet.size} {trainingDateSet.size === 1 ? "día" : "días"} · {totalSetsLogged} {totalSetsLogged === 1 ? "serie" : "series"}
            </span>
          </div>
          <p className="muted top-8">Toca cualquier fecha para ver exactamente qué entrenaste.</p>

          <article className="calendar-card top-10">
            <header className="calendar-head">
              <button
                type="button"
                className="calendar-nav"
                aria-label="Mes anterior"
                onClick={() => {
                  const previousMonth = shiftMonthKey(calendarMonth, -1);
                  setCalendarMonth(previousMonth);
                  selectCalendarDay(`${previousMonth}-01`);
                }}
              >
                ‹
              </button>
              <h3>{formatMonthLabel(calendarMonth)}</h3>
              <button
                type="button"
                className="calendar-nav"
                aria-label="Mes siguiente"
                onClick={() => {
                  const nextMonth = shiftMonthKey(calendarMonth, 1);
                  setCalendarMonth(nextMonth);
                  selectCalendarDay(`${nextMonth}-01`);
                }}
              >
                ›
              </button>
            </header>

            <div className="calendar-weekdays" aria-hidden="true">
              {['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map((day) => <span key={day}>{day}</span>)}
            </div>
            <div className="calendar-grid">
              {calendarCells.map((date, index) => {
                if (!date) return <span key={`empty_${index}`} className="calendar-day is-empty" />;
                const dateSessions = sessionsByDate.get(date) || [];
                const setCount = dateSessions.reduce((total, session) => total + session.setsCount, 0);
                return (
                  <button
                    key={date}
                    type="button"
                    className={`calendar-day ${date === calendarDate ? "is-selected" : ""} ${date === todayStr ? "is-today" : ""} ${dateSessions.length ? "is-trained" : ""}`}
                    onClick={() => selectCalendarDay(date)}
                    aria-pressed={date === calendarDate}
                    aria-label={`${formatLongDateInZone(date, tz)}. ${dateSessions.length ? `${setCount} ${setCount === 1 ? "serie registrada" : "series registradas"}` : "Sin entrenamiento"}`}
                  >
                    <span className="calendar-day-number">{Number(date.slice(-2))}</span>
                    {dateSessions.length > 0 && <span className="calendar-day-dot" />}
                    {setCount > 0 && <small>{setCount}</small>}
                  </button>
                );
              })}
            </div>

            <footer className="calendar-footer">
              <button className="btn btn-soft btn-mini" type="button" onClick={showCalendarToday}>Ir a hoy</button>
              <span>{formatLongDateInZone(calendarDate, tz)} · {calendarDate.slice(0, 4)}</span>
            </footer>
          </article>

          {calendarSelectedSessions.length > 1 && (
            <div className="calendar-session-switcher top-10">
              {calendarSelectedSessions.map((session) => (
                <button
                  key={`switch_${session.id}`}
                  type="button"
                  className={`btn btn-mini ${selectedHistorySession?.id === session.id ? "btn-primary" : "btn-soft"}`}
                  onClick={() => setSelectedHistorySessionId(session.id)}
                >
                  {session.dayName}
                </button>
              ))}
            </div>
          )}

          {selectedHistorySession && (
            <article className="card top-12 history-summary">
              <div className="row space-between wrap">
                <h4>{selectedHistorySession.dayName}</h4>
                <span className="pill">
                  {selectedHistorySession.setsCount} {selectedHistorySession.setsCount === 1 ? "serie" : "series"}
                </span>
              </div>
              <p className="muted top-6">{selectedHistorySession.title}</p>

              {!selectedHistorySession.hasCurrentDay && <span className="pill pill-muted top-8">Plan anterior</span>}

              <div className="stack gap-8 top-10">
                {selectedHistorySession.exerciseRows.map((item) => {
                  const itemNote = state.exerciseNotes?.[selectedHistorySession.dayId]?.[selectedHistorySession.date]?.[item.id] || "";
                  return (
                  <div key={`resume_${selectedHistorySession.id}_${item.id}`} className="dish-card">
                    <div className="row space-between wrap">
                      <strong>{item.name}</strong>
                      <span className="pill">{item.setsCount} serie{item.setsCount === 1 ? "" : "s"}</span>
                    </div>
                    <p className="muted small top-6">
                      Último {formatSetWeight(item.last.weight)} × {item.last.reps}
                      {item.max > 0 ? ` · Máx ${item.max} kg` : ""}
                      {item.avg > 0 ? ` · Promedio ${item.avg} kg` : ""}
                    </p>
                    {itemNote && <p className="history-note top-6">📝 {itemNote}</p>}
                  </div>
                  );
                })}
              </div>

              {selectedHistorySession.hasCurrentDay && (
                <div className="row gap-8 wrap top-10">
                  <button
                    className="btn btn-primary"
                    type="button"
                    onClick={() => openWorkoutDate(selectedHistorySession.date, selectedHistorySession.dayId)}
                  >
                    Abrir este entrenamiento
                  </button>
                </div>
              )}
            </article>
          )}

          {!selectedHistorySession && (
            <article className="card top-12 calendar-empty-state">
              <span className="calendar-empty-icon">○</span>
              <div>
                <h4>Sin entrenamiento registrado</h4>
                <p className="muted top-6">Puedes consultar esta fecha o empezar una rutina para ese día.</p>
              </div>
              <button className="btn btn-primary" type="button" onClick={() => openWorkoutDate(calendarDate)}>
                Registrar entrenamiento
              </button>
            </article>
          )}

          <details className="history-all top-12">
            <summary>Todo el historial ({routineSessions.length})</summary>
            <div className="top-10">
              <Field
                label="Buscar"
                value={historyQuery}
                onChange={setHistoryQuery}
                placeholder="Fecha, día o ejercicio"
              />
            </div>
            <div className="stack gap-10 top-10">
              {filteredRoutineSessions.length === 0 && <p className="muted">No hay resultados para esta búsqueda.</p>}
              {filteredRoutineSessions.map((session) => (
                <article key={session.id} className={`card history-card ${selectedHistorySession?.id === session.id ? "selected" : ""}`}>
                  <div className="row space-between wrap">
                    <h4>{session.dayName}</h4>
                    <span className="pill">{session.date}</span>
                  </div>
                  <p className="muted small top-6">{session.title} · {session.setsCount} series</p>
                  <button
                    className="btn btn-soft btn-mini top-8"
                    type="button"
                    onClick={() => {
                      setCalendarDate(session.date);
                      setCalendarMonth(monthKeyFromDate(session.date));
                      setSelectedHistorySessionId(session.id);
                      window.requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "smooth" }));
                    }}
                  >
                    Ver día
                  </button>
                </article>
              ))}
            </div>
          </details>
        </section>
      )}

      {tab === "progreso" && (
        <section className="panel">
          <h2>Progreso</h2>
          <div className="grid-three top-8">
            <Field label="Fecha" type="date" value={weightForm.date} onChange={(value) => setWeightForm((prev) => ({ ...prev, date: value }))} />
            <Field label="Peso (kg)" type="number" step="0.1" value={weightForm.weight} onChange={(value) => setWeightForm((prev) => ({ ...prev, weight: value }))} placeholder="78.3" />
            <Field label="Cintura (cm)" type="number" step="0.1" value={weightForm.waist} onChange={(value) => setWeightForm((prev) => ({ ...prev, waist: value }))} placeholder="Opcional" />
          </div>
          <div className="row gap-8 wrap top-8">
            <button className="btn btn-primary" type="button" onClick={addWeightLog}>Guardar peso</button>
            <button className="btn btn-soft" type="button" onClick={exportProgressCsv}>Descargar progreso</button>
          </div>

          <section className="stats-grid compact top-10 stats-mini">
            <StatCard label="Racha actual" value={`${streakInfo.current}`} meta={streakInfo.current === 1 ? "día seguido" : "días seguidos"} tone="accent" />
            <StatCard label="Mejor racha" value={`${streakInfo.best}`} meta="histórica" tone="good" />
            <StatCard label="Peso actual" value={latestWeight ? `${latestWeight.toFixed(1)}kg` : "--"} meta="Más reciente" tone="warning" />
            <StatCard label="Récords" value={`${exercisePbs.length}`} meta="Ejercicios" tone="danger" />
          </section>

          <article className="card top-12">
            <h4>Calendario de entrenamiento</h4>
            <p className="muted small top-6">Cada cuadro rojo marca un día entrenado.</p>
            <div className="heatmap top-8" role="img" aria-label="Calendario de entrenamiento">
              {heatmapData.map((week, wi) => (
                <div key={`week_${wi}`} className="heatmap-col">
                  {week.map((day) => (
                    <div
                      key={day.date}
                      className={`heatmap-cell ${day.trained ? "is-trained" : ""} ${day.date === todayStr ? "is-today" : ""}`}
                      title={`${day.date}${day.trained ? " · entrenaste" : ""}`}
                    />
                  ))}
                </div>
              ))}
            </div>
          </article>

          <article className="card top-12">
            <h4>Carga por rutina (últimos 7 días)</h4>
            {volumeByPackage.length === 0 ? (
              <p className="muted top-8">Sin entrenamientos esta semana.</p>
            ) : (
              <div className="stack gap-8 top-8">
                {volumeByPackage.map((row) => {
                  const max = Math.max(...volumeByPackage.map((r) => r.volume));
                  const widthPct = max > 0 ? Math.max(8, (row.volume / max) * 100) : 0;
                  return (
                    <div key={row.id} className="volume-row">
                      <div className="volume-head">
                        <span className="volume-dot" style={{ background: row.color }} />
                        <strong>{row.name}</strong>
                        <span className="volume-meta">{row.volume}kg · {row.sets} serie{row.sets === 1 ? "" : "s"}</span>
                      </div>
                      <div className="volume-bar">
                        <div className="volume-bar-fill" style={{ width: `${widthPct}%`, background: row.color }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </article>

          <article className="card top-12">
            <h4>Tendencia de peso</h4>
            <p className="muted small top-6">Cada punto es un registro de peso corporal.</p>
            <MiniLineChart points={weightTrendPoints} color="#d83b2d" />
          </article>

          <article className="card top-12">
            <h4>Carga semanal</h4>
            <p className="muted small top-6">Peso movido en tus series por semana.</p>
            <MiniLineChart points={weeklyVolumePoints} color="#35c26c" />
            <div className="stack gap-8 top-8">
              {weeklyVolumeRows.slice(-4).reverse().map((row) => (
                <div key={row.weekKey} className="log-row">
                  <div>
                    <strong>{row.weekKey}</strong>
                    <p className="muted small">Carga {row.volume}kg · Series {row.sets}</p>
                  </div>
                </div>
              ))}
            </div>
          </article>

          <article className="card top-12">
            <h4>Récords por ejercicio</h4>
            {exercisePbs.length === 0 && <p className="muted top-8">Aún no hay récords.</p>}
            <div className="stack gap-8 top-8">
              {exercisePbs.map((item) => (
                <div key={item.id} className="log-row">
                  <div>
                    <strong>{item.name}</strong>
                    <p className="muted small">Récord {item.max}kg · {formatShortDateInZone(item.date, tz)}</p>
                  </div>
                </div>
              ))}
            </div>
          </article>

          <article className="card top-12">
            <h4>Historial de peso</h4>
            {sortedWeightLogs.length === 0 && <p className="muted top-8">Aún no hay registros.</p>}
            <div className="stack gap-8 top-8">
              {sortedWeightLogs.map((entry) => (
                <div key={entry.id} className="log-row">
                  <div>
                    <strong>{entry.weight}kg</strong>
                    <p className="muted small">{entry.date}{entry.waist !== null ? ` · cintura ${entry.waist}cm` : ""}</p>
                  </div>
                  <button className="btn btn-danger btn-mini" type="button" onClick={() => removeWeightLog(entry.id)}>Borrar</button>
                </div>
              ))}
            </div>
          </article>
        </section>
      )}

      {tab === "ajustes" && (
        <section className="panel">
          <h2>Ajustes</h2>

          <article className="card top-10">
            <h4>Perfil</h4>
            <div className="grid-two top-8">
              <Field label="Nombre" value={state.settings.profileName} onChange={(value) => updateSetting("profileName", value)} placeholder="Tu nombre" />
              <Field label="Peso inicial (kg)" type="number" step="0.1" value={state.settings.startWeight} onChange={(value) => updateSettingNumber("startWeight", value)} />
              <Field label="Peso meta (kg)" type="number" step="0.1" value={state.settings.goalWeight} onChange={(value) => updateSettingNumber("goalWeight", value)} />
            </div>
            <label className="field top-8">
              <span>Nota personal</span>
              <textarea className="input" rows={3} value={state.settings.focusNote} onChange={(event) => updateSetting("focusNote", event.target.value)} placeholder="Recordatorio, frase, enfoque..." />
            </label>
          </article>

          <article className="card top-12">
            <h4>Zona horaria</h4>
            <p className="muted small top-6">Se detectó automáticamente desde tu navegador. Puedes cambiarla si viajas o quieres otra.</p>
            <div className="top-8">
              <TimezoneSelect value={state.settings.timezone} onChange={(value) => updateSetting("timezone", safeTimezone(value))} />
            </div>
          </article>

          {hasCloudAccount && (
            <article className="card top-12">
              <h4>Cuenta</h4>
              <p className="muted top-6"><strong>{authSession?.user?.email}</strong></p>
              <div className="row gap-8 wrap top-10">
                <button className="btn btn-soft" type="button" onClick={sendPasswordSetupLink}>Cambiar contraseña</button>
                <button className="btn btn-danger" type="button" onClick={signOut}>Cerrar sesión</button>
              </div>
            </article>
          )}

          {SUPABASE_CONFIGURED && usingLocalMode && (
            <article className="card top-12">
              <h4>Cuenta</h4>
              <p className="muted top-6">Estás usando la app en este dispositivo.</p>
              <div className="row gap-8 wrap top-10">
                <button className="btn btn-primary" type="button" onClick={showLogin}>Iniciar sesión</button>
              </div>
            </article>
          )}

          {hasCloudAccount && deviceStateSummary.hasRecoverableData && (
            <article className="card top-12">
              <h4>Datos anteriores en este dispositivo</h4>
              <p className="muted top-6">
                Encontramos {deviceStateSummary.trainingDays} días entrenados y {deviceStateSummary.setsCount} series fuera de tu cuenta.
              </p>
              <button className="btn btn-primary top-10" type="button" onClick={() => recoverDeviceState({ profileName: state.settings.profileName })}>
                Combinar con mi cuenta
              </button>
            </article>
          )}

          <article className="card top-12">
            <h4>Tus datos</h4>
            <ul className="clean-list">
              <li>Último guardado: {saveMeta.lastSavedAt ? formatDateTimeInZone(saveMeta.lastSavedAt, tz) : "--"}</li>
              <li>Guardado en: {hasCloudAccount ? "Tu cuenta" : "Este dispositivo"}</li>
              {hasCloudAccount && cloudMeta.syncedAt && <li>Última actualización: {formatDateTimeInZone(cloudMeta.syncedAt, tz)}</li>}
            </ul>
            {saveMeta.error && <p className="error-text">{saveMeta.error}</p>}
            {hasCloudAccount && cloudMeta.error && <p className="error-text">{cloudMeta.error}</p>}
            {hasCloudAccount && cloudMeta.conflict && (
              <div className="stack gap-8 top-8">
                <p className="error-text">Hay cambios más recientes en tu cuenta.</p>
                <div className="row gap-8 wrap">
                  <button className="btn btn-soft" type="button" onClick={useCloudVersion}>Usar versión guardada</button>
                  <button className="btn btn-danger" type="button" onClick={overwriteCloudVersion}>Mantener esta versión</button>
                </div>
              </div>
            )}
            <div className="row gap-8 wrap top-10">
              <button className="btn btn-ghost" type="button" onClick={exportBackup}>Descargar copia</button>
              <label className="btn btn-soft file-label">
                Restaurar copia
                <input type="file" accept="application/json" onChange={importBackup} />
              </label>
              <button className="btn btn-danger" type="button" onClick={resetDefaults}>Restaurar rutina por defecto</button>
            </div>
          </article>

          <article className="card top-12">
            <h4>Agregar a iPhone</h4>
            <ol className="clean-list">
              <li>Abre la URL en Safari.</li>
              <li>Toca Compartir.</li>
              <li>Selecciona "Agregar a pantalla de inicio".</li>
              <li>Ábrela desde el home como app.</li>
            </ol>
          </article>
        </section>
      )}

      <TimerModal
        open={chronoOpen}
        onClose={() => setChronoOpen(false)}
        timer={chrono}
        setTimer={setChrono}
        now={timerNow}
      />
    </div>
  );
}
