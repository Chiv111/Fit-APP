import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { parseRoutineImport } from "./profileOnboarding.js";

// ============================================================================
// 1. CONSTANTS + SUPABASE
// ============================================================================
const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL || "").trim();
const SUPABASE_ANON_KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY || "").trim();
const SUPABASE_AUTH_REDIRECT_URL = (import.meta.env.VITE_SUPABASE_AUTH_REDIRECT_URL || "").trim();
const SUPABASE_CONFIGURED = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

const supabase = SUPABASE_CONFIGURED
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })
  : null;

const CLOUD_TABLE = "lockin_state_user";
const STATE_KEY_PREFIX = "fitapp_state_v4";
const BACKUP_KEY_PREFIX = "fitapp_backups_v4";
const DRAFT_KEY_PREFIX = "fitapp_drafts_v4";
const SYNC_QUEUE_KEY_PREFIX = "fitapp_sync_queue_v4";
const AUTH_LOCAL_MODE_KEY = "fitapp_auth_local_mode_v1";
const LEGACY_STATE_KEYS = ["lockin_state_v3", "lockin_state_v2", "lockin_state_v1", "fit_app_state_v6", "fit_app_state_v5"];
const LEGACY_BACKUP_KEYS = ["lockin_backups_v3", "lockin_backups_v2", "lockin_backups_v1"];
const LOCAL_SCOPE = "local";

const CLOUD_SYNC_DEBOUNCE_MS = 1500;
const SYNC_MAX_RETRIES = 8;
const AUTO_BACKUP_MS = 1000 * 60 * 60 * 6;
const MAX_BACKUPS = 30;

const TABS = [
  ["hoy", "Hoy"],
  ["historial", "Historial"],
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
    title: "Pecho · Hombro · Tríceps",
    postCardio: "",
    cardioProtocol: "",
    packageIds: ["pkg_pecho", "pkg_hombro", "pkg_triceps"],
    customExercises: [],
  },
  {
    id: "d_mar",
    shortDay: "MAR",
    fullDay: "Martes",
    type: "Descanso",
    title: "Descanso activo",
    postCardio: "",
    cardioProtocol: "",
    packageIds: [],
    customExercises: [],
  },
  {
    id: "d_mie",
    shortDay: "MIE",
    fullDay: "Miércoles",
    type: "Jalón",
    title: "Espalda · Bíceps",
    postCardio: "",
    cardioProtocol: "",
    packageIds: ["pkg_espalda", "pkg_biceps"],
    customExercises: [],
  },
  {
    id: "d_jue",
    shortDay: "JUE",
    fullDay: "Jueves",
    type: "Descanso",
    title: "Descanso",
    postCardio: "",
    cardioProtocol: "",
    packageIds: [],
    customExercises: [],
  },
  {
    id: "d_vie",
    shortDay: "VIE",
    fullDay: "Viernes",
    type: "Pierna",
    title: "Cuádriceps · Femoral · Glúteo",
    postCardio: "",
    cardioProtocol: "",
    packageIds: ["pkg_cuadriceps", "pkg_femoral", "pkg_pantorrilla"],
    customExercises: [],
  },
  {
    id: "d_sab",
    shortDay: "SAB",
    fullDay: "Sábado",
    type: "Libre",
    title: "Día libre",
    postCardio: "",
    cardioProtocol: "",
    packageIds: [],
    customExercises: [],
  },
  {
    id: "d_dom",
    shortDay: "DOM",
    fullDay: "Domingo",
    type: "Cardio",
    title: "Cardio suave",
    postCardio: "",
    cardioProtocol: "30-40 min ritmo conversacional",
    packageIds: [],
    customExercises: [],
  },
];

const DEFAULT_STATE = {
  dayIndex: 0,
  sessionDate: todayInZone(DEFAULT_SETTINGS.timezone),
  settings: DEFAULT_SETTINGS,
  routine: DEFAULT_ROUTINE,
  exercisePackages: DEFAULT_PACKAGES,
  trainingLogs: {},
  exerciseNotes: {},
  weightLogs: [],
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

function averageWeight(sets) {
  if (!sets.length) return null;
  const sum = sets.reduce((acc, item) => acc + (Number(item.weight) || 0), 0);
  return sum / sets.length;
}

function normalizeSet(candidate) {
  const weight = Number(candidate?.weight ?? candidate?.w ?? 0);
  const reps = Number(candidate?.reps ?? candidate?.r ?? 0);
  return {
    weight: Number.isNaN(weight) ? 0 : weight,
    reps: Number.isNaN(reps) ? 0 : reps,
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
  return candidate
    .filter((pkg) => pkg && typeof pkg === "object")
    .map((pkg, pkgIndex) => ({
      id: pkg.id || makeId(`pkg${pkgIndex}`),
      name: cleanUserText(String(pkg.name || `Paquete ${pkgIndex + 1}`).trim()),
      color: typeof pkg.color === "string" && pkg.color.trim() ? pkg.color.trim() : "#9aa3b2",
      exercises: Array.isArray(pkg.exercises) ? pkg.exercises.map(normalizeExercise) : [],
    }));
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
  return {
    dayIndex: clamp(Number(candidate?.dayIndex) || 0, 0, routine.length - 1),
    sessionDate: typeof candidate?.sessionDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(candidate.sessionDate)
      ? candidate.sessionDate
      : todayStr,
    settings,
    routine,
    exercisePackages,
    trainingLogs: normalizeTrainingLogs(candidate?.trainingLogs, settings.timezone),
    exerciseNotes: normalizeExerciseNotes(candidate?.exerciseNotes),
    weightLogs: Array.isArray(candidate?.weightLogs)
      ? candidate.weightLogs.map((entry) => ({
          id: entry.id || makeId("w"),
          date: entry.date || todayStr,
          weight: Number(entry.weight) || 0,
          waist: entry.waist === null || entry.waist === undefined ? null : Number(entry.waist),
          ts: entry.ts || Date.now(),
        }))
      : [],
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
  const raw = safeLocalGet(scopedKey(STATE_KEY_PREFIX, scope));
  if (raw) {
    const parsed = parseJson(raw, null);
    if (parsed && typeof parsed === "object") return normalizeState(parsed);
  }

  if (scope === LOCAL_SCOPE) {
    for (const legacyKey of LEGACY_STATE_KEYS) {
      const legacyRaw = safeLocalGet(legacyKey);
      if (!legacyRaw) continue;
      const parsed = parseJson(legacyRaw, null);
      if (parsed && typeof parsed === "object") return normalizeState(parsed);
    }
    for (const legacyBackupKey of LEGACY_BACKUP_KEYS) {
      const backups = parseJson(safeLocalGet(legacyBackupKey), []);
      if (!Array.isArray(backups)) continue;
      for (let idx = backups.length - 1; idx >= 0; idx -= 1) {
        const snapshot = backups[idx]?.snapshot;
        if (snapshot && typeof snapshot === "object") return normalizeState(snapshot);
      }
    }
  }

  return normalizeState(DEFAULT_STATE);
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
    const max = Math.max(...entry.sets.map((item) => Number(item.weight) || 0));
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
            <AnvilLogo size={56} />
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
          <AnvilLogo size={56} />
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
              Olvidé mi contraseña
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

function AnvilLogo({ size = 36 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="Anvil"
      role="img"
    >
      <defs>
        <linearGradient id="anvilBg" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#1f2530" />
          <stop offset="100%" stopColor="#0e1218" />
        </linearGradient>
      </defs>
      <circle cx="32" cy="32" r="30" fill="url(#anvilBg)" stroke="#ef4035" strokeWidth="2.4" />
      <g stroke="#fff" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" fill="none">
        <path d="M 19 50 L 32 14 L 45 50" />
        <path d="M 25 38 L 39 38" />
      </g>
    </svg>
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
  const w = Number(weight) || 0;
  const r = Number(reps) || 0;
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
  const savedTimerRef = useRef(null);
  const noteSavedTimerRef = useRef(null);

  useEffect(() => {
    setNoteDraft(sessionNote || "");
  }, [sessionNote, exercise.id]);

  const latestCurrentSet = currentSets[currentSets.length - 1] || null;
  const hasPreviousSet = Boolean(previous?.last && Number(previous.last.weight) > 0 && Number(previous.last.reps) > 0);
  const hasLatestCurrentSet = Boolean(latestCurrentSet && Number(latestCurrentSet.weight) > 0 && Number(latestCurrentSet.reps) > 0);

  const commitSet = () => {
    const parsedWeight = Number(weight);
    const parsedReps = Number(reps);
    if (Number.isNaN(parsedWeight) || parsedWeight <= 0) return;
    if (Number.isNaN(parsedReps) || parsedReps <= 0) return;
    onAddSet(exercise.id, { weight: parsedWeight, reps: parsedReps, ts: Date.now() });
    onStartRest?.(exercise);
    setWeight("");
    setReps("");
    setJustSaved(true);
    if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    savedTimerRef.current = setTimeout(() => setJustSaved(false), 1800);
  };

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
  const hasNote = Boolean((sessionNote || "").trim());

  const oneRmCurrent = bestOneRmFromSets(currentSets);
  const oneRmPrevious = previous ? bestOneRmFromSets(previous.sets) : 0;
  const oneRmBest = Math.max(oneRmCurrent, oneRmPrevious);

  const plateInfo = plateTarget ? calculatePlates(Number(plateTarget)) : null;

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
          <span className={`pill ${setsCount > 0 ? "pill-good" : ""}`}>{setsCount} serie{setsCount === 1 ? "" : "s"}</span>
          <span className="chevron" aria-hidden="true">{expanded ? "▴" : "▾"}</span>
        </div>
      </button>

      {expanded && (
        <div className="exercise-body">
          {previous && (
            <p className="trend">
              Última vez ({previous.date}): {previous.last.weight}kg × {previous.last.reps} · máx {previous.max}kg
            </p>
          )}

          {currentSets.length > 0 && (
            <div className="set-list">
              {currentSets.map((entry, index) => (
                <button
                  key={`${exercise.id}_${index}_${entry.ts}`}
                  type="button"
                  className="set-chip"
                  onClick={() => onRemoveSet(exercise.id, index)}
                  title="Toca para eliminar"
                >
                  S{index + 1}: {entry.weight}kg × {entry.reps}
                </button>
              ))}
            </div>
          )}

          <div className="set-entry-row top-8">
            <input
              className="input"
              type="number"
              inputMode="decimal"
              placeholder="kg"
              step="0.5"
              value={weight}
              onChange={(event) => setWeight(event.target.value)}
            />
            <input
              className="input"
              type="number"
              inputMode="numeric"
              placeholder="rep."
              step="1"
              value={reps}
              onChange={(event) => setReps(event.target.value)}
            />
            <button className="btn btn-primary" type="button" onClick={commitSet}>
              Guardar serie
            </button>
          </div>

          <div className="row gap-8 wrap top-8">
            {hasPreviousSet && (
              <button
                className="btn btn-soft btn-mini"
                type="button"
                onClick={() => {
                  setWeight(String(previous.last.weight));
                  setReps(String(previous.last.reps));
                }}
              >
                Usar última carga
              </button>
            )}
            {hasLatestCurrentSet && (
              <button
                className="btn btn-soft btn-mini"
                type="button"
                onClick={() => {
                  setWeight(String(latestCurrentSet.weight));
                  setReps(String(latestCurrentSet.reps));
                }}
              >
                Repetir serie
              </button>
            )}
          </div>

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
                      onClick={() => setPlateTarget(String(currentSets[currentSets.length - 1]?.weight || previous?.last?.weight || ""))}
                    >
                      Último
                    </button>
                  </div>
                  {plateInfo && Number(plateTarget) > 0 && (
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
  const [localMode, setLocalMode] = useState(() => SUPABASE_CONFIGURED && safeLocalGet(AUTH_LOCAL_MODE_KEY) === "true");
  const userId = authSession?.user?.id || null;
  const hasCloudAccount = SUPABASE_CONFIGURED && Boolean(userId);
  const usingLocalMode = SUPABASE_CONFIGURED && !userId && localMode;
  const scope = hasCloudAccount ? userId : (!SUPABASE_CONFIGURED || usingLocalMode ? LOCAL_SCOPE : null);

  // App state
  const [state, setState] = useState(() =>
    SUPABASE_CONFIGURED && !localMode ? normalizeState(DEFAULT_STATE) : loadLocalState(LOCAL_SCOPE)
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
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const [importError, setImportError] = useState("");
  const [importFileName, setImportFileName] = useState("");

  const tz = state.settings.timezone;
  const [todayStr, setTodayStr] = useState(() => todayInZone(tz));

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
    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuthSession(session || null);
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

  // ==========================================================================
  // Load local cache when user changes (or on first load with Supabase)
  // ==========================================================================
  useEffect(() => {
    if (!scope) return;
    const localState = loadLocalState(scope);
    const localDrafts = loadDrafts(scope);
    pendingCloudPayloadRef.current = loadSyncQueue(scope);
    setState(localState);
    setDraftLogs(localDrafts);
    setTodayStr(todayInZone(localState.settings.timezone));
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
      if (cloud.payload && cloudUpdatedAt > localUpdatedAt) {
        setState(cloud.payload);
        setSaveMeta(saveLocalState(cloud.payload, userId));
      }
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
    const existing = draftLogs?.[sessionDraftKey];
    if (existing && typeof existing === "object") return existing;
    const fromSaved = {};
    selectedDayExercises.forEach((exercise) => {
      const sets = Array.isArray(sessionSavedLogs?.[exercise.id]) ? sessionSavedLogs[exercise.id].map(normalizeSet) : [];
      if (sets.length > 0) fromSaved[exercise.id] = sets;
    });
    return fromSaved;
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
    state.routine.forEach((day) => {
      const logsByDate = state.trainingLogs?.[day.id] || {};
      const dayExercises = getDayExercises(day, state.exercisePackages);
      const exerciseLookup = new Map(dayExercises.map((ex) => [ex.id, ex]));
      Object.entries(logsByDate).forEach(([date, byExercise]) => {
        const exerciseRows = Object.entries(byExercise || {})
          .map(([exerciseId, sets]) => {
            if (!Array.isArray(sets) || !sets.length) return null;
            const exercise = exerciseLookup.get(exerciseId) || { id: exerciseId, name: `Ejercicio ${exerciseId}` };
            const max = Math.max(...sets.map((item) => Number(item.weight) || 0));
            const avg = averageWeight(sets);
            const volume = sets.reduce((acc, item) => acc + (Number(item.weight) || 0) * (Number(item.reps) || 0), 0);
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
        const bestExercise = exerciseRows.reduce((best, item) => (!best || item.max > best.max ? item : best), null);
        sessions.push({
          id: `${day.id}_${date}`,
          dayId: day.id,
          date,
          dateLabel: formatShortDateInZone(date, tz),
          dayName: day.fullDay,
          title: day.title,
          setsCount,
          sessionVolume,
          bestExercise,
          exerciseRows,
        });
      });
    });
    return sessions.sort((a, b) => b.date.localeCompare(a.date));
  }, [state.trainingLogs, state.routine, state.exercisePackages, tz]);

  const filteredRoutineSessions = useMemo(() => {
    const query = historyQuery.trim().toLowerCase();
    if (!query) return routineSessions;
    return routineSessions.filter((session) => {
      const exerciseText = session.exerciseRows.map((item) => item.name).join(" ").toLowerCase();
      const baseText = `${session.dayName} ${session.title} ${session.date} ${session.dateLabel}`.toLowerCase();
      return baseText.includes(query) || exerciseText.includes(query);
    });
  }, [historyQuery, routineSessions]);

  const selectedHistorySession = useMemo(() => {
    if (!filteredRoutineSessions.length) return null;
    return filteredRoutineSessions.find((session) => session.id === selectedHistorySessionId) || filteredRoutineSessions[0];
  }, [filteredRoutineSessions, selectedHistorySessionId]);

  useEffect(() => {
    if (!filteredRoutineSessions.length) {
      if (selectedHistorySessionId) setSelectedHistorySessionId("");
      return;
    }
    const exists = filteredRoutineSessions.some((session) => session.id === selectedHistorySessionId);
    if (!exists) setSelectedHistorySessionId(filteredRoutineSessions[0].id);
  }, [filteredRoutineSessions, selectedHistorySessionId]);

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

  const deltaFromStart = latestWeight - Number(state.settings.startWeight || 0);

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
    setState((prev) => ({ ...prev, sessionDate: date }));
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

      return { ...prev, trainingLogs: nextTrainingLogs };
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

  const copyLastSession = () => {
    const logsByDate = state.trainingLogs?.[selectedDay.id] || {};
    const dates = Object.keys(logsByDate)
      .filter((date) => date !== state.sessionDate && Object.keys(logsByDate[date] || {}).length > 0)
      .sort((a, b) => b.localeCompare(a));
    if (dates.length === 0) {
      window.alert("No hay sesión previa de este día para copiar.");
      return;
    }
    const sourceDate = dates[0];
    const sourceLogs = logsByDate[sourceDate] || {};
    let copied = 0;
    updateSessionDraft((currentDraft) => {
      const nextDraft = { ...currentDraft };
      selectedDayExercises.forEach((exercise) => {
        if (Array.isArray(nextDraft[exercise.id]) && nextDraft[exercise.id].length > 0) return;
        const sourceSets = Array.isArray(sourceLogs[exercise.id]) ? sourceLogs[exercise.id] : [];
        if (sourceSets.length === 0) return;
        nextDraft[exercise.id] = sourceSets.map((set) => ({
          weight: Number(set.weight) || 0,
          reps: Number(set.reps) || 0,
          ts: Date.now(),
        }));
        copied += 1;
      });
      syncDraftToTrainingLogs(nextDraft);
      return nextDraft;
    });
    if (copied > 0) {
      window.alert(`Copiado: ${copied} ejercicio${copied === 1 ? "" : "s"} desde ${sourceDate}`);
    } else {
      window.alert("Los ejercicios ya tenían series guardadas, no se copió nada.");
    }
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
      const text = await file.text();
      setImportText(text);
      setImportFileName(file.name || "");
      setImportError("");
    } catch {
      setImportError("No se pudo leer el archivo.");
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

  if (SUPABASE_CONFIGURED && !userId && !usingLocalMode) {
    return <AuthScreen supabaseConfigured authMessage={authError} onContinueLocal={enterLocalMode} />;
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
          <AnvilLogo size={42} />
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

      <section className="kpi-strip">
        <article className="kpi-pill">
          <p className="kpi-label">Peso</p>
          <p className="kpi-value">{latestWeight ? `${latestWeight.toFixed(1)}kg` : "--"}</p>
        </article>
        <article className="kpi-pill">
          <p className="kpi-label">Cambio</p>
          <p className="kpi-value">{`${deltaFromStart >= 0 ? "+" : ""}${deltaFromStart.toFixed(1)}kg`}</p>
        </article>
        <article className="kpi-pill">
          <p className="kpi-label">Series totales</p>
          <p className="kpi-value">{totalSetsLogged}</p>
        </article>
        <article className="kpi-pill">
          <p className="kpi-label">Hoy</p>
          <p className="kpi-value">{sessionSetCount}</p>
        </article>
      </section>

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
            {selectedDayExercises.length > 0 && sessionSetCount === 0 && (
              <button className="btn btn-soft" type="button" onClick={copyLastSession}>
                ↺ Copiar sesión anterior
              </button>
            )}
          </div>

          {selectedDayExercises.length > 0 ? (
            <div className="top-10 stack gap-10">
              <p className="muted small">Cada serie se guarda al instante. Toca un ejercicio para abrirlo.</p>
              {selectedDayExercises.map((exercise) => {
                const history = getExerciseHistory(state.trainingLogs, selectedDay.id, exercise.id);
                const previous = history.find((entry) => entry.date < state.sessionDate) || history.find((entry) => entry.date !== state.sessionDate) || null;
                const currentSets = Array.isArray(sessionDraft?.[exercise.id]) ? sessionDraft[exercise.id] : [];
                const sessionNote = state.exerciseNotes?.[selectedDay.id]?.[state.sessionDate]?.[exercise.id] || "";
                return (
                  <ExerciseLogItem
                    key={exercise.id}
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
                  <input type="file" accept=".json,.csv,.txt,.md,text/plain,text/csv,application/json" onChange={onImportFile} />
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
        <section className="panel">
          <div className="row space-between wrap">
            <h2>Historial</h2>
            <span className="pill">{filteredRoutineSessions.length}/{routineSessions.length}</span>
          </div>
          <p className="muted top-8">Sesiones guardadas por fecha.</p>
          <div className="top-10">
            <Field
              label="Buscar"
              value={historyQuery}
              onChange={setHistoryQuery}
              placeholder="Fecha, día o ejercicio"
            />
          </div>

          <section className="stats-grid compact top-10 stats-mini">
            <StatCard label="Sesiones" value={`${filteredRoutineSessions.length}`} meta="Filtradas" tone="accent" />
            <StatCard label="Series totales" value={`${totalSetsLogged}`} meta="Acumulado" tone="good" />
            <StatCard label="Última" value={formatShortDateInZone(filteredRoutineSessions[0]?.date || "", tz)} meta={filteredRoutineSessions[0]?.dayName || "Sin datos"} tone="warning" />
            <StatCard label="Abierta" value={formatShortDateInZone(state.sessionDate, tz)} meta={selectedDay.fullDay} tone="good" />
          </section>

          {selectedHistorySession && (
            <article className="card top-12 history-summary">
              <div className="row space-between wrap">
                <h4>Resumen del día</h4>
                <span className="pill">{formatShortDateInZone(selectedHistorySession.date, tz)}</span>
              </div>
              <p className="muted top-6">{selectedHistorySession.dayName} · {selectedHistorySession.title}</p>

              <section className="stats-grid compact top-10 stats-mini">
                <StatCard label="Series" value={`${selectedHistorySession.setsCount}`} meta="Guardadas" tone="accent" />
                <StatCard label="Carga total" value={`${selectedHistorySession.sessionVolume}kg`} meta="Peso movido" tone="good" />
                <StatCard label="Ejercicios" value={`${selectedHistorySession.exerciseRows.length}`} meta="Con registro" tone="warning" />
                <StatCard
                  label="Mayor"
                  value={selectedHistorySession.bestExercise ? `${selectedHistorySession.bestExercise.max}kg` : "--"}
                  meta={selectedHistorySession.bestExercise?.name || "Sin referencia"}
                  tone="danger"
                />
              </section>

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
                      Máx {item.max}kg · Promedio {item.avg}kg · Último {item.last.weight}kg × {item.last.reps}
                    </p>
                    {itemNote && <p className="history-note top-6">📝 {itemNote}</p>}
                  </div>
                  );
                })}
              </div>

              <div className="row gap-8 wrap top-10">
                <button
                  className="btn btn-primary"
                  type="button"
                  onClick={() => {
                    setState((prev) => {
                      const dayIndex = prev.routine.findIndex((day) => day.id === selectedHistorySession.dayId);
                      if (dayIndex < 0) return prev;
                      return { ...prev, dayIndex, sessionDate: selectedHistorySession.date };
                    });
                    setTab("hoy");
                  }}
                >
                  Abrir en Hoy
                </button>
              </div>
            </article>
          )}

          <div className="stack gap-10 top-12">
            {filteredRoutineSessions.length === 0 && (
              <article className="card">
                <p className="muted">Aún no hay sesiones guardadas para este filtro.</p>
              </article>
            )}

            {filteredRoutineSessions.map((session) => (
              <article key={session.id} className={`card history-card ${selectedHistorySession?.id === session.id ? "selected" : ""}`}>
                <div className="row space-between wrap">
                  <h4>{session.dayName}</h4>
                  <span className="pill">{formatShortDateInZone(session.date, tz)}</span>
                </div>
                <p className="muted top-6">{session.title}</p>
                <p className="muted small top-6">Series: {session.setsCount} · Carga total: {session.sessionVolume}kg · Mayor: {session.bestExercise ? `${session.bestExercise.max}kg` : "--"}</p>

                <div className="row gap-8 wrap top-8">
                  <button className="btn btn-soft btn-mini" type="button" onClick={() => setSelectedHistorySessionId(session.id)}>
                    Ver resumen
                  </button>
                </div>
              </article>
            ))}
          </div>
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
