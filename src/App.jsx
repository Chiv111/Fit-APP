import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const SAVE_KEY = "lockin_state_v3";
const BACKUP_KEY = "lockin_backups_v3";
const DRAFT_KEY = "lockin_routine_drafts_v1";
const LEGACY_KEYS = ["lockin_state_v2", "lockin_state_v1", "fit_app_state_v6", "fit_app_state_v5"];
const LEGACY_BACKUPS = ["lockin_backups_v2", "lockin_backups_v1", "fit_app_backups_v6", "fit_app_backups_v5"];
const SESSION_UNLOCK_KEY = "lockin_unlocked";
const ACCESS_KEY = (import.meta.env.VITE_APP_ACCESS_KEY || "fitapp-2026").trim();
const USING_FALLBACK_KEY = !import.meta.env.VITE_APP_ACCESS_KEY;
const AUTO_BACKUP_MS = 1000 * 60 * 60 * 6;
const MAX_BACKUPS = 40;
const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL || "").trim();
const SUPABASE_ANON_KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY || "").trim();
const SUPABASE_PROFILE_KEY = (import.meta.env.VITE_SUPABASE_PROFILE_KEY || "sebastian-main").trim();
const REQUIRE_SUPABASE_AUTH = String(import.meta.env.VITE_REQUIRE_SUPABASE_AUTH || "").trim().toLowerCase() === "true";
const SUPABASE_AUTH_REDIRECT_URL = (import.meta.env.VITE_SUPABASE_AUTH_REDIRECT_URL || "").trim();
const CLOUD_TABLE = "lockin_state";
const CLOUD_AUTH_TABLE = "lockin_state_user";
const CLOUD_SYNC_DEBOUNCE_MS = 1500;
const SYNC_QUEUE_KEY = "lockin_sync_queue_v1";
const SYNC_MAX_RETRIES = 8;
const APP_TIMEZONE = "America/Mexico_City";

const SUPABASE_CONFIGURED = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
const CLOUD_ENABLED = REQUIRE_SUPABASE_AUTH ? SUPABASE_CONFIGURED : Boolean(SUPABASE_URL && SUPABASE_ANON_KEY && SUPABASE_PROFILE_KEY);
const supabase = CLOUD_ENABLED
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })
  : null;

const DEFAULT_SETTINGS = {
  appName: "LOCK IN",
  profileName: "Sebastian",
  startWeight: 78,
  goalWeight: 68,
  fastingWindow: "16:8",
  trainingWindow: "4:00-6:00pm",
  calories: 2400,
  protein: 180,
  carbs: 250,
  fats: 75,
  weeklyCardioMin: 180,
  focusNote: "Consistencia diaria. Progresión semanal.",
};

const DEFAULT_ROUTINE = [
  {
    id: "d_lun",
    shortDay: "LUN",
    fullDay: "Lunes",
    type: "Fuerza",
    title: "Pecho, Espalda y Triceps",
    postCardio: "20 min cinta Z2 post-gym",
    cardioProtocol: "",
    exercises: [
      { id: "lun1", name: "Chin-ups", sets: "3-5", reps: "5-8", rest: "2-3 min", note: "Progresión 5x5, RIR 3-4" },
      { id: "lun2", name: "Bench Press Smith Machine", sets: "5", reps: "5", rest: "2-3 min", note: "Progresión 5x5, RIR 3-4" },
      { id: "lun3", name: "Elevaciones T prono", sets: "3", reps: "6-8", rest: "0s", note: "Biserie A, RIR 2" },
      { id: "lun4", name: "Lagartija diamante", sets: "4", reps: "1 min ON / 30s OFF", rest: "90s-2 min", note: "Biserie A, RIR 2" },
      { id: "lun5", name: "Flys de pecho maquina", sets: "3", reps: "8-10", rest: "0s", note: "Biserie B, RIR 1" },
      { id: "lun6", name: "Lat pulldown convencional", sets: "3", reps: "8-10", rest: "90s-2 min", note: "Biserie B, RIR 1" },
      { id: "lun7", name: "Pulldown con triangulo", sets: "3", reps: "10-12", rest: "0s", note: "Biserie C, RIR 1" },
      { id: "lun8", name: "Press around fibras inferiores", sets: "3", reps: "10-12", rest: "90s-2 min", note: "Biserie C, RIR 1" },
    ],
  },
  {
    id: "d_mar",
    shortDay: "MAR",
    fullDay: "Martes",
    type: "Fuerza",
    title: "Hombro, Espalda y Biceps",
    postCardio: "20 min cinta Z2 post-gym",
    cardioProtocol: "",
    exercises: [
      { id: "mar1", name: "Curl biceps spider", sets: "3", reps: "8-10", rest: "0s", note: "Biserie A, RIR 2" },
      { id: "mar2", name: "Pull-ups", sets: "5", reps: "5", rest: "2-3 min", note: "Progresión 5x5, RIR 3-4" },
      { id: "mar3", name: "Press militar", sets: "5", reps: "5", rest: "2-3 min", note: "Progresión 5x5, RIR 3-4" },
      { id: "mar4", name: "Remo espalda alta cable", sets: "3", reps: "6-8", rest: "0s", note: "Biserie B, RIR 1-2" },
      { id: "mar5", name: "Elevaciones laterales", sets: "3", reps: "6-8", rest: "90s-2 min", note: "Biserie B, RIR 2" },
    ],
  },
  {
    id: "d_mie",
    shortDay: "MIE",
    fullDay: "Miercoles",
    type: "Fuerza",
    title: "Lower A - Cuadriceps",
    postCardio: "20 min cinta Z2 post-gym",
    cardioProtocol: "",
    exercises: [
      { id: "mie1", name: "Leg press sissy / Back squat", sets: "5", reps: "5", rest: "2-3 min", note: "Progresión 5x5, RIR 3-4" },
      { id: "mie2", name: "Hiperextension 45 Zercher", sets: "3", reps: "6-8", rest: "2-3 min", note: "RIR 1-2" },
      { id: "mie3", name: "Extensiones pierna isometrica", sets: "3", reps: "6-8", rest: "2-3 min", note: "RIR 1-2" },
      { id: "mie4", name: "Puente gluteo medio", sets: "2", reps: "8-10", rest: "2-3 min", note: "RIR 1" },
      { id: "mie5", name: "Peso muerto unilateral landmine", sets: "2", reps: "8-10", rest: "2-3 min", note: "RIR 1" },
      { id: "mie6", name: "Elevaciones pantorrilla", sets: "3", reps: "8-10", rest: "2-3 min", note: "RIR 1" },
    ],
  },
  {
    id: "d_jue",
    shortDay: "JUE",
    fullDay: "Jueves",
    type: "Cardio Intenso",
    title: "Intervalos en Colina",
    postCardio: "No agregar cardio extra",
    cardioProtocol:
      "Calentamiento 8 min. 6 rondas: 30s sprint 80% + recuperar hasta 130 LPM. Sin colina: cinta 10-15%. Enfriamiento 5 min.",
    exercises: [],
  },
  {
    id: "d_vie",
    shortDay: "VIE",
    fullDay: "Viernes",
    type: "Fuerza",
    title: "Lower B - Gluteo y Posterior",
    postCardio: "20 min cinta Z2 post-gym",
    cardioProtocol: "",
    exercises: [
      { id: "vie1", name: "Peso muerto Snatch Grip", sets: "5", reps: "5", rest: "2-3 min", note: "Progresión 5x5, RIR 2-3" },
      { id: "vie2", name: "Smith B-stance split squat", sets: "3", reps: "6-8", rest: "90s-2 min", note: "RIR 1-2" },
      { id: "vie3", name: "Sentadilla bulgara", sets: "2-3", reps: "6-8", rest: "90s-2 min", note: "RIR 1-2" },
      { id: "vie4", name: "Maquina de aductores", sets: "3", reps: "30 segundos", rest: "90s-2 min", note: "RIR 1" },
      { id: "vie5", name: "Curl piernas acostado unilateral", sets: "2-3", reps: "8-10", rest: "90s-2 min", note: "RIR 1" },
      { id: "vie6", name: "Crunch banca con disco", sets: "2", reps: "8-10", rest: "90s-2 min", note: "RIR 1" },
    ],
  },
  {
    id: "d_sab",
    shortDay: "SAB",
    fullDay: "Sabado",
    type: "Fuerza",
    title: "Biceps, Triceps y Antebrazo",
    postCardio: "20 min cinta Z2 post-gym",
    cardioProtocol: "",
    exercises: [
      { id: "sab1", name: "Rompe craneos mancuernas", sets: "3", reps: "8-12", rest: "0s", note: "Triserie triceps" },
      { id: "sab2", name: "Press frances rompe narices", sets: "3", reps: "8-12", rest: "0s", note: "Triserie triceps" },
      { id: "sab3", name: "Press cerrado mancuernas", sets: "3", reps: "max", rest: "90s-2 min", note: "Triserie triceps" },
      { id: "sab4", name: "Curl spider unilateral", sets: "3", reps: "8-12", rest: "0s", note: "Biserie biceps" },
      { id: "sab5", name: "Curl apoyo en espalda", sets: "3", reps: "8-12", rest: "90s-2 min", note: "Biserie biceps" },
      { id: "sab6", name: "Flexion de muneca", sets: "3", reps: "10-15 + hold 10s", rest: "-", note: "Antebrazo" },
      { id: "sab7", name: "Extension de muneca", sets: "3", reps: "10-15 + hold 10s", rest: "-", note: "Antebrazo" },
      { id: "sab8", name: "Dead hang", sets: "3", reps: "max hold", rest: "-", note: "RIR 0-1" },
    ],
  },
  {
    id: "d_dom",
    shortDay: "DOM",
    fullDay: "Domingo",
    type: "Cardio Z2",
    title: "Carrera libre 30-35 min",
    postCardio: "Día de cardio",
    cardioProtocol: "Ritmo 5:00-5:30 min/km. FC 130-150 LPM. RPE 4-5. Si no puedes hablar, baja ritmo.",
    exercises: [],
  },
];

const DEFAULT_DIET_MEALS = [
  {
    id: "m_des",
    title: "Desayuno",
    time: "8:00-10:00am",
    note: "Proteína alta + carbos para energía.",
    options: [
      { id: "des_a", name: "Opcion A - Clasica", kcal: 844, protein: 49, carbs: 79, fats: 39, description: "Huevos + claras + aceite + avena + tortillas + verduras + cafe con leche." },
      { id: "des_b", name: "Opcion B - Licuado + huevos", kcal: 790, protein: 42, carbs: 80, fats: 35, description: "Leche + avena + platano + crema cacahuate + huevos cocidos." },
      { id: "des_c", name: "Opcion C - Chilaquiles proteicos", kcal: 733, protein: 68, carbs: 59, fats: 25, description: "Pollo + tortillas al horno + 2 huevos + salsa + queso." },
    ],
  },
  {
    id: "m_pre",
    title: "Pre-entreno",
    time: "3:30-4:00pm",
    note: "Energia para entrenar.",
    options: [{ id: "pre_a", name: "Platano + requeson", kcal: 263, protein: 23, carbs: 32, fats: 5, description: "1 platano + 150g requeson." }],
  },
  {
    id: "m_cena",
    title: "Cena post-gym",
    time: "7:00-8:00pm",
    note: "Comida fuerte: proteína + carbos + verduras + grasa saludable.",
    options: [
      { id: "cen_a", name: "Pechuga + arroz", kcal: 1219, protein: 107, carbs: 108, fats: 38, description: "400g pollo + 300g arroz + verduras + aceite + medio aguacate." },
      { id: "cen_b", name: "Arrachera + tortillas", kcal: 1340, protein: 95, carbs: 85, fats: 72, description: "300g arrachera + 2 huevos + 5 tortillas + verduras + aceite." },
      { id: "cen_c", name: "Lomo cerdo + tortillas", kcal: 1177, protein: 102, carbs: 73, fats: 55, description: "350g lomo + 2 huevos + 4 tortillas + verduras + aceite." },
    ],
  },
  {
    id: "m_snack",
    title: "Snack anti-estres",
    time: "Despues de 8:00pm si hace falta",
    note: "Solo si sigue el hambre despues de agua + 10 min.",
    options: [{ id: "snk_a", name: "Requeson + vegetales", kcal: 130, protein: 16, carbs: 9, fats: 3, description: "100g requeson/jocoque + pepino o zanahoria." }],
  },
];

const DEFAULT_SUPPLEMENTS = [
  { id: "sup_creatina", status: "Actual", name: "Creatina monohidratada", dose: "5g", timing: "Diario", note: "Mantener sin ciclar." },
  { id: "sup_magnesio", status: "Actual", name: "Magnesio", dose: "dosis actual", timing: "Noche", note: "Recuperacion y descanso." },
  { id: "sup_zinc", status: "Actual", name: "Zinc", dose: "dosis actual", timing: "Noche", note: "Soporte hormonal." },
  { id: "sup_b", status: "Actual", name: "Complejo B", dose: "dosis actual", timing: "Manana", note: "Metabolismo energetico." },
  { id: "sup_d3k2", status: "Agregar", name: "Vitamina D3 + K2", dose: "2000-4000 IU + 100mcg", timing: "Con comida con grasa", note: "Prioridad #1." },
  { id: "sup_omega", status: "Agregar", name: "Omega-3 (EPA+DHA)", dose: "2-3g EPA+DHA", timing: "Con cena", note: "Reduce inflamacion." },
  { id: "sup_whey", status: "Opcional", name: "Whey protein", dose: "1 scoop", timing: "Solo si faltan proteínas", note: "Completar objetivo diario." },
  { id: "sup_ash", status: "Opcional", name: "Ashwagandha KSM-66", dose: "300-600mg", timing: "Con cena", note: "Si hay estres alto." },
];

const DEFAULT_STATE = {
  week: 1,
  dayIndex: 0,
  sessionDate: mexicoDate(),
  settings: DEFAULT_SETTINGS,
  routine: DEFAULT_ROUTINE,
  dietMeals: DEFAULT_DIET_MEALS,
  supplements: DEFAULT_SUPPLEMENTS,
  trainingLogs: {},
  weightLogs: [],
};

function parseJson(raw, fallback) {
  try {
    const parsed = JSON.parse(raw);
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

function safeLocalGet(key) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeLocalSet(key, value) {
  try {
    window.localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

function safeSessionGet(key) {
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSessionSet(key, value) {
  try {
    window.sessionStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

function safeSessionRemove(key) {
  try {
    window.sessionStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

function loadSyncQueue() {
  const parsed = parseJson(safeLocalGet(SYNC_QUEUE_KEY), null);
  if (!parsed || typeof parsed !== "object") return { pending: null, retries: 0, lastError: null, updatedAt: null };
  return {
    pending: parsed.pending && typeof parsed.pending === "object" ? normalizeState(parsed.pending) : null,
    retries: Number(parsed.retries) || 0,
    lastError: parsed.lastError || null,
    updatedAt: parsed.updatedAt || null,
  };
}

function saveSyncQueue(queue) {
  return safeLocalSet(SYNC_QUEUE_KEY, JSON.stringify(queue));
}

function makeId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function mexicoDate(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function averageWeight(sets) {
  if (!sets.length) return null;
  const sum = sets.reduce((acc, item) => acc + (Number(item.weight) || 0), 0);
  return sum / sets.length;
}

function mondayOfIsoWeek(weekNumber) {
  const year = new Date().getFullYear();
  const simple = new Date(Date.UTC(year, 0, 1 + (weekNumber - 1) * 7));
  const day = simple.getUTCDay();
  const isoWeekStart = new Date(simple);
  if (day <= 4) {
    isoWeekStart.setUTCDate(simple.getUTCDate() - simple.getUTCDay() + 1);
  } else {
    isoWeekStart.setUTCDate(simple.getUTCDate() + 8 - simple.getUTCDay());
  }
  return isoWeekStart.toISOString().slice(0, 10);
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

function migrateFlatLogs(flatLogs) {
  const nested = {};

  Object.entries(flatLogs || {}).forEach(([key, value]) => {
    if (!Array.isArray(value)) return;

    let dayId = "legacy_day";
    let date = mexicoDate();
    let exerciseId = `legacy_${Math.random().toString(36).slice(2, 6)}`;

    const oldFormat = key.match(/^w(\d+)_(d_[a-z]+)_(.+)$/i);
    if (oldFormat) {
      const week = Number(oldFormat[1]);
      dayId = oldFormat[2];
      exerciseId = oldFormat[3];
      date = mondayOfIsoWeek(week || 1);
    }

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

function normalizeTrainingLogs(candidate) {
  if (!candidate || typeof candidate !== "object") return {};

  const values = Object.values(candidate);
  if (!values.length) return {};

  const likelyNested = values.every((value) => value && typeof value === "object" && !Array.isArray(value));
  if (!likelyNested) return migrateFlatLogs(candidate);

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

function makeDraftSessionKey(dayId, date) {
  return `${dayId}__${date}`;
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

function normalizeState(candidate) {
  const routine = Array.isArray(candidate?.routine) && candidate.routine.length ? candidate.routine : DEFAULT_ROUTINE;
  const dietMeals = Array.isArray(candidate?.dietMeals) && candidate.dietMeals.length ? candidate.dietMeals : DEFAULT_DIET_MEALS;
  const supplements = Array.isArray(candidate?.supplements) && candidate.supplements.length ? candidate.supplements : DEFAULT_SUPPLEMENTS;

  return {
    week: Math.max(1, Number(candidate?.week) || 1),
    dayIndex: clamp(Number(candidate?.dayIndex) || 0, 0, routine.length - 1),
    sessionDate: typeof candidate?.sessionDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(candidate.sessionDate) ? candidate.sessionDate : mexicoDate(),
    settings: { ...DEFAULT_SETTINGS, ...(candidate?.settings || {}) },
    routine: routine.map((day, dayIndex) => ({
      id: day.id || makeId(`day${dayIndex}`),
      shortDay: day.shortDay || `D${dayIndex + 1}`,
      fullDay: day.fullDay || `Día ${dayIndex + 1}`,
      type: day.type || "Fuerza",
      title: day.title || "Sesión",
      postCardio: day.postCardio || "",
      cardioProtocol: day.cardioProtocol || "",
      exercises: Array.isArray(day.exercises)
        ? day.exercises.map((exercise, exIndex) => ({
            id: exercise.id || makeId(`ex${exIndex}`),
            name: exercise.name || "Nuevo ejercicio",
            sets: exercise.sets || "3",
            reps: exercise.reps || "8-10",
            rest: exercise.rest || "90s",
            note: exercise.note || "",
          }))
        : [],
    })),
    dietMeals: dietMeals.map((meal, mealIndex) => ({
      id: meal.id || makeId(`meal${mealIndex}`),
      title: meal.title || `Comida ${mealIndex + 1}`,
      time: meal.time || "",
      note: meal.note || "",
      options: Array.isArray(meal.options)
        ? meal.options.map((option, optIndex) => ({
            id: option.id || makeId(`opt${optIndex}`),
            name: option.name || "Nuevo platillo",
            kcal: Number(option.kcal) || 0,
            protein: Number(option.protein) || 0,
            carbs: Number(option.carbs) || 0,
            fats: Number(option.fats) || 0,
            description: option.description || "",
          }))
        : [],
    })),
    supplements: supplements.map((item, idx) => ({
      id: item.id || makeId(`sup${idx}`),
      status: item.status || "Actual",
      name: item.name || "Suplemento",
      dose: item.dose || "",
      timing: item.timing || "",
      note: item.note || "",
    })),
    trainingLogs: normalizeTrainingLogs(candidate?.trainingLogs),
    weightLogs: Array.isArray(candidate?.weightLogs)
      ? candidate.weightLogs.map((entry) => ({
          id: entry.id || makeId("w"),
          date: entry.date || mexicoDate(),
          weight: Number(entry.weight) || 0,
          waist: entry.waist === null || entry.waist === undefined ? null : Number(entry.waist),
          ts: entry.ts || Date.now(),
        }))
      : [],
  };
}

function loadState() {
  const readKeys = [SAVE_KEY, ...LEGACY_KEYS];
  for (const key of readKeys) {
    const raw = safeLocalGet(key);
    if (!raw) continue;
    const parsed = parseJson(raw, null);
    if (parsed && typeof parsed === "object") return normalizeState(parsed);
  }

  const backupKeys = [BACKUP_KEY, ...LEGACY_BACKUPS];
  for (const key of backupKeys) {
    const backups = parseJson(safeLocalGet(key), []);
    if (!Array.isArray(backups)) continue;
    for (let idx = backups.length - 1; idx >= 0; idx -= 1) {
      const snapshot = backups[idx]?.snapshot;
      if (snapshot && typeof snapshot === "object") return normalizeState(snapshot);
    }
  }

  return normalizeState(DEFAULT_STATE);
}

function loadDrafts() {
  const parsed = parseJson(safeLocalGet(DRAFT_KEY), {});
  return normalizeDraftLogs(parsed);
}

function saveDrafts(drafts) {
  return safeLocalSet(DRAFT_KEY, JSON.stringify(drafts));
}

function saveState(state, forceBackup = false) {
  const now = Date.now();
  const payload = { ...state, version: 3, updatedAt: new Date(now).toISOString() };

  if (!safeLocalSet(SAVE_KEY, JSON.stringify(payload))) {
    return { ok: false, error: "No se pudo guardar en localStorage.", backupCount: 0, lastSavedAt: null, lastBackupAt: null };
  }

  const backups = parseJson(safeLocalGet(BACKUP_KEY), []);
  const lastBackupAt = Number(backups[backups.length - 1]?.ts || 0);
  const shouldBackup = forceBackup || !lastBackupAt || now - lastBackupAt > AUTO_BACKUP_MS;
  let nextBackups = backups;

  if (shouldBackup) {
    nextBackups = [...backups, { ts: now, snapshot: payload }];
    if (nextBackups.length > MAX_BACKUPS) nextBackups = nextBackups.slice(-MAX_BACKUPS);
    if (!safeLocalSet(BACKUP_KEY, JSON.stringify(nextBackups))) {
      // keep main save
    }
  }

  return {
    ok: true,
    error: null,
    backupCount: Array.isArray(nextBackups) ? nextBackups.length : 0,
    lastSavedAt: payload.updatedAt,
    lastBackupAt: nextBackups[nextBackups.length - 1]?.ts || null,
  };
}

function resolveCloudTarget(identity) {
  if (identity?.userId) {
    return { table: CLOUD_AUTH_TABLE, key: "user_id", value: identity.userId };
  }
  return { table: CLOUD_TABLE, key: "profile_key", value: identity?.profileKey || SUPABASE_PROFILE_KEY };
}

async function fetchCloudState(identity) {
  if (!CLOUD_ENABLED || !supabase) return { ok: false, reason: "disabled", payload: null, cloudUpdatedAt: null };
  const target = resolveCloudTarget(identity);
  if (!target.value) return { ok: false, reason: "missing_identity", payload: null, cloudUpdatedAt: null };

  const { data, error } = await supabase
    .from(target.table)
    .select("payload,updated_at")
    .eq(target.key, target.value)
    .maybeSingle();

  if (error) return { ok: false, reason: error.message, payload: null, cloudUpdatedAt: null };
  if (!data?.payload || typeof data.payload !== "object") return { ok: true, reason: null, payload: null, cloudUpdatedAt: data?.updated_at || null };

  return {
    ok: true,
    reason: null,
    payload: normalizeState(data.payload),
    cloudUpdatedAt: data?.updated_at || null,
  };
}

async function pushCloudState(payload, identity) {
  if (!CLOUD_ENABLED || !supabase) return { ok: false, reason: "disabled", cloudUpdatedAt: null };
  const target = resolveCloudTarget(identity);
  if (!target.value) return { ok: false, reason: "missing_identity", cloudUpdatedAt: null };

  const row = {
    payload,
    updated_at: new Date().toISOString(),
    [target.key]: target.value,
  };

  const { data, error } = await supabase
    .from(target.table)
    .upsert(row, { onConflict: target.key })
    .select("updated_at")
    .single();

  if (error) return { ok: false, reason: error.message, cloudUpdatedAt: null };
  return { ok: true, reason: null, cloudUpdatedAt: data?.updated_at || null };
}

function formatDate(input) {
  if (!input) return "--";
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) return String(input);
  return date.toLocaleString("es-MX", {
    timeZone: APP_TIMEZONE,
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatSessionDate(input) {
  if (!input || typeof input !== "string") return "--";
  const [year, month, day] = input.split("-").map(Number);
  if (!year || !month || !day) return input;
  const date = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  return new Intl.DateTimeFormat("es-MX", {
    timeZone: APP_TIMEZONE,
    month: "2-digit",
    day: "2-digit",
  }).format(date);
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

function getIsoWeekKey(dateString) {
  const [year, month, day] = String(dateString).split("-").map(Number);
  if (!year || !month || !day) return "0000-W00";
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
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
    return {
      ...entry,
      max,
      avg,
      last,
    };
  });
}

function AccessGate({ onUnlock }) {
  const [value, setValue] = useState("");
  const [error, setError] = useState("");

  const onSubmit = (event) => {
    event.preventDefault();
    if (value.trim() === ACCESS_KEY) {
      onUnlock();
      return;
    }
    setError("Clave invalida.");
  };

  return (
    <div className="gate-shell">
      <div className="gate-card">
        <p className="gate-tag">LOCK IN</p>
          <h1>Acceso privado</h1>
        <p className="gate-sub">Ingresa la clave para abrir tu panel.</p>
        <form onSubmit={onSubmit} className="stack gap-8">
          <input
            className="input"
            type="password"
            value={value}
            onChange={(event) => {
              setValue(event.target.value);
              if (error) setError("");
            }}
            placeholder="Clave"
            autoFocus
          />
          {error && <p className="error-text">{error}</p>}
          <button className="btn btn-primary" type="submit">Entrar</button>
        </form>
        <p className="tiny-note">Clave desde <code>VITE_APP_ACCESS_KEY</code>{USING_FALLBACK_KEY ? " (fallback activo)" : ""}.</p>
      </div>
    </div>
  );
}

function SupabaseAuthGate({
  configured,
  email,
  onEmailChange,
  onSendOtp,
  sendingOtp,
  notice,
  error,
  fallbackEnabled,
  onUnlockWithKey,
}) {
  const [keyValue, setKeyValue] = useState("");
  const [keyError, setKeyError] = useState("");

  const onKeySubmit = (event) => {
    event.preventDefault();
    if (keyValue.trim() === ACCESS_KEY) {
      onUnlockWithKey();
      return;
    }
    setKeyError("Clave invalida.");
  };

  return (
    <div className="gate-shell">
      <div className="gate-card">
        <p className="gate-tag">LOCK IN AUTH</p>
        <h1>Acceso con Supabase</h1>
        {!configured && <p className="error-text">Configura VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY.</p>}
        {configured && (
          <>
            <p className="gate-sub">Ingresa tu correo para recibir un link de acceso.</p>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                onSendOtp();
              }}
              className="stack gap-8"
            >
              <input
                className="input"
                type="email"
                value={email}
                onChange={(event) => onEmailChange(event.target.value)}
                placeholder="correo@ejemplo.com"
                autoComplete="email"
                autoFocus
              />
              <button className="btn btn-primary" type="submit" disabled={sendingOtp}>
                {sendingOtp ? "Enviando..." : "Enviar acceso por correo"}
              </button>
            </form>
          </>
        )}
        {notice && <p className="tiny-note">{notice}</p>}
        {error && <p className="error-text">{error}</p>}

        {fallbackEnabled && (
          <div className="top-12">
            <p className="tiny-note">Fallback local habilitado con VITE_APP_ACCESS_KEY.</p>
            <form onSubmit={onKeySubmit} className="stack gap-8">
              <input
                className="input"
                type="password"
                value={keyValue}
                onChange={(event) => {
                  setKeyValue(event.target.value);
                  if (keyError) setKeyError("");
                }}
                placeholder="Clave fallback"
              />
              <button className="btn btn-ghost" type="submit">Entrar con clave local</button>
              {keyError && <p className="error-text">{keyError}</p>}
            </form>
          </div>
        )}
      </div>
    </div>
  );
}

function MiniLineChart({ points, color = "#d83b2d", height = 120 }) {
  const width = 320;
  if (!Array.isArray(points) || points.length < 2) {
    return (
      <div className="chart-empty">
        <p className="muted">Sin datos suficientes para grafica.</p>
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
    <svg className="mini-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Grafica de progreso">
      <path d={areaPath} fill={`${color}26`} />
      <path d={linePath} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      {mapped.map((item, index) => (
        <circle key={`pt_${index}`} cx={item.x} cy={item.y} r="2.5" fill={color} />
      ))}
    </svg>
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

function Field({ label, value, onChange, type = "text", step, placeholder }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input className="input" type={type} step={step} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} />
    </label>
  );
}

function ExerciseLogCard({
  exercise,
  previous,
  currentSets,
  onAddSet,
  onRemoveSet,
  onStartRest,
  onGoNext,
  canGoNext,
  quickMode,
}) {
  const [weight, setWeight] = useState("");
  const [reps, setReps] = useState("");
  const latestCurrentSet = currentSets[currentSets.length - 1] || null;
  const hasPreviousSet = Boolean(previous?.last && Number(previous.last.weight) > 0 && Number(previous.last.reps) > 0);
  const hasLatestCurrentSet = Boolean(latestCurrentSet && Number(latestCurrentSet.weight) > 0 && Number(latestCurrentSet.reps) > 0);

  const commitSet = ({ startRest = false, moveNext = false } = {}) => {
    const parsedWeight = Number(weight);
    const parsedReps = Number(reps);
    if (Number.isNaN(parsedWeight) || parsedWeight <= 0) return;
    if (Number.isNaN(parsedReps) || parsedReps <= 0) return;
    onAddSet(exercise.id, { weight: parsedWeight, reps: parsedReps, ts: Date.now() });
    if (startRest && onStartRest) onStartRest(exercise);
    if (moveNext && canGoNext && onGoNext) onGoNext();
    setWeight("");
    setReps("");
  };

  const usePreviousSet = () => {
    if (!hasPreviousSet) return;
    setWeight(String(previous.last.weight));
    setReps(String(previous.last.reps));
  };

  const useLastCapturedSet = () => {
    if (!hasLatestCurrentSet) return;
    setWeight(String(latestCurrentSet.weight));
    setReps(String(latestCurrentSet.reps));
  };

  return (
    <article className="exercise-card">
      <div className="exercise-head">
        <h4>{exercise.name}</h4>
        <span className="pill">{exercise.sets} x {exercise.reps}</span>
      </div>
      <p className="exercise-meta">Descanso: {exercise.rest} - {exercise.note || "sin nota"}</p>

      {previous && (
        <p className="trend">
          Última vez ({previous.date}): {previous.last.weight}kg x {previous.last.reps} - max {previous.max}kg
        </p>
      )}

      <div className="row gap-8 wrap top-8">
        {hasPreviousSet && (
          <button className="btn btn-soft btn-mini" type="button" onClick={usePreviousSet}>
            Usar última carga
          </button>
        )}
        {hasLatestCurrentSet && (
          <button className="btn btn-soft btn-mini" type="button" onClick={useLastCapturedSet}>
            Repetir set anterior
          </button>
        )}
      </div>

      {currentSets.length > 0 && (
        <div className="set-list">
          {currentSets.map((entry, index) => (
            <button
              key={`${exercise.id}_${index}_${entry.ts}`}
              type="button"
              className="set-chip"
              onClick={() => onRemoveSet(exercise.id, index)}
              title="Tap para borrar"
            >
              S{index + 1}: {entry.weight}kg x {entry.reps}
            </button>
          ))}
        </div>
      )}

      <div className="set-entry-row">
        <input className="input" type="number" inputMode="decimal" placeholder="kg" step="0.5" value={weight} onChange={(event) => setWeight(event.target.value)} />
        <input className="input" type="number" inputMode="numeric" placeholder="reps" step="1" value={reps} onChange={(event) => setReps(event.target.value)} />
        <button className="btn btn-primary" type="button" onClick={() => commitSet({ startRest: quickMode })}>Guardar</button>
        {quickMode && (
          <button className="btn btn-soft" type="button" onClick={() => commitSet({ startRest: true, moveNext: true })} disabled={!canGoNext}>
            Guardar + siguiente
          </button>
        )}
      </div>
    </article>
  );
}

export default function App() {
  const [state, setState] = useState(() => loadState());
  const [draftLogs, setDraftLogs] = useState(() => loadDrafts());
  const [authSession, setAuthSession] = useState(null);
  const [authReady, setAuthReady] = useState(!REQUIRE_SUPABASE_AUTH);
  const [authEmail, setAuthEmail] = useState("");
  const [authNotice, setAuthNotice] = useState("");
  const [authError, setAuthError] = useState("");
  const [sendingOtp, setSendingOtp] = useState(false);
  const [saveMeta, setSaveMeta] = useState({ ok: true, error: null, backupCount: 0, lastSavedAt: null, lastBackupAt: null });
  const [cloudMeta, setCloudMeta] = useState({
    enabled: CLOUD_ENABLED,
    syncedAt: null,
    syncing: false,
    error: null,
    queueCount: 0,
    retries: 0,
    conflict: null,
  });
  const [cloudReady, setCloudReady] = useState(!CLOUD_ENABLED);
  const [isOnline, setIsOnline] = useState(() => (typeof navigator === "undefined" ? true : navigator.onLine));
  const cloudSyncTimerRef = useRef(null);
  const cloudRetryTimerRef = useRef(null);
  const pendingCloudPayloadRef = useRef(loadSyncQueue());
  const knownCloudUpdatedAtRef = useRef(null);
  const forceCloudOverwriteRef = useRef(false);
  const routineTrackRef = useRef(null);
  const [tab, setTab] = useState("rutina");
  const [quickModeEnabled, setQuickModeEnabled] = useState(true);
  const [routineEditMode, setRoutineEditMode] = useState(false);
  const [activeExerciseCard, setActiveExerciseCard] = useState(0);
  const [routineSavedMessage, setRoutineSavedMessage] = useState("");
  const [restTimer, setRestTimer] = useState({ endAt: null, seconds: 0, exercise: "" });
  const [timerNow, setTimerNow] = useState(Date.now());
  const [dietEditMode, setDietEditMode] = useState(false);
  const [supplementEditMode, setSupplementEditMode] = useState(false);
  const [weightForm, setWeightForm] = useState({ date: mexicoDate(), weight: "", waist: "" });
  const [historyQuery, setHistoryQuery] = useState("");
  const [selectedHistorySessionId, setSelectedHistorySessionId] = useState("");
  const [isUnlocked, setIsUnlocked] = useState(() => safeSessionGet(SESSION_UNLOCK_KEY) === "1");
  const cloudIdentity = useMemo(
    () => ({
      profileKey: SUPABASE_PROFILE_KEY,
      userId: REQUIRE_SUPABASE_AUTH ? authSession?.user?.id || null : null,
    }),
    [authSession]
  );
  const cloudCanSync = CLOUD_ENABLED && (!REQUIRE_SUPABASE_AUTH || Boolean(cloudIdentity.userId));

  useEffect(() => {
    if (navigator.storage?.persist) {
      navigator.storage.persist().catch(() => {
        // ignore
      });
    }
  }, []);

  useEffect(() => {
    if (!REQUIRE_SUPABASE_AUTH || !supabase) {
      setAuthReady(true);
      return () => {};
    }

    let mounted = true;
    setAuthReady(false);
    supabase.auth.getSession().then(({ data, error }) => {
      if (!mounted) return;
      if (error) {
        setAuthError(error.message || "No se pudo cargar la sesion.");
      }
      setAuthSession(data?.session || null);
      setAuthReady(true);
    });

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuthSession(session || null);
      if (session) {
        setAuthError("");
        setAuthNotice("Sesion activa.");
      }
    });

    return () => {
      mounted = false;
      authListener?.subscription?.unsubscribe();
    };
  }, []);

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

  useEffect(() => {
    if (!restTimer.endAt) return () => {};
    const id = setInterval(() => setTimerNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [restTimer.endAt]);

  useEffect(() => {
    setSaveMeta(saveState(state));
  }, [state]);

  useEffect(() => {
    let cancelled = false;
    if (!cloudCanSync) {
      if (!CLOUD_ENABLED) setCloudReady(true);
      setCloudMeta((prev) => ({ ...prev, enabled: cloudCanSync, syncing: false, error: null }));
      return () => {};
    }

    (async () => {
      const cloud = await fetchCloudState(cloudIdentity);
      if (cancelled) return;

      if (!cloud.ok) {
        setCloudMeta((prev) => ({
          ...prev,
          enabled: true,
          syncing: false,
          error: cloud.reason || "Error de nube",
        }));
        setCloudReady(true);
        return;
      }

      const localRaw = parseJson(safeLocalGet(SAVE_KEY), {});
      const localUpdatedAt = Date.parse(localRaw?.updatedAt || "") || 0;
      const cloudUpdatedAt = Date.parse(cloud.cloudUpdatedAt || "") || 0;

      knownCloudUpdatedAtRef.current = cloud.cloudUpdatedAt || null;
      if (cloud.payload && cloudUpdatedAt > localUpdatedAt) {
        setState(cloud.payload);
        setSaveMeta(saveState(cloud.payload));
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

    return () => {
      cancelled = true;
    };
  }, [cloudCanSync, cloudIdentity.profileKey, cloudIdentity.userId]);

  useEffect(() => {
    if (!cloudCanSync || !cloudReady) return () => {};
    const queue = {
      pending: normalizeState(state),
      retries: 0,
      lastError: null,
      updatedAt: new Date().toISOString(),
    };
    pendingCloudPayloadRef.current = queue;
    saveSyncQueue(queue);
    setCloudMeta((prev) => ({ ...prev, queueCount: 1, retries: 0, conflict: null }));
    return () => {};
  }, [state, cloudCanSync, cloudReady]);

  useEffect(() => {
    if (!cloudCanSync || !cloudReady) return () => {};

    const scheduleAttempt = (delayMs) => {
      if (cloudSyncTimerRef.current) clearTimeout(cloudSyncTimerRef.current);
      cloudSyncTimerRef.current = setTimeout(async () => {
        const queue = pendingCloudPayloadRef.current;
        if (!queue?.pending) {
          setCloudMeta((prev) => ({ ...prev, syncing: false, queueCount: 0 }));
          return;
        }
        if (!isOnline) {
          setCloudMeta((prev) => ({
            ...prev,
            syncing: false,
            error: "Sin internet. Pendiente en cola.",
            queueCount: 1,
          }));
          if (cloudRetryTimerRef.current) clearTimeout(cloudRetryTimerRef.current);
          cloudRetryTimerRef.current = setTimeout(() => scheduleAttempt(1500), 3000);
          return;
        }

        setCloudMeta((prev) => ({ ...prev, syncing: true, error: null }));
        const remote = await fetchCloudState(cloudIdentity);
        if (!remote.ok && remote.reason !== "missing_identity") {
          const retries = Math.min((queue.retries || 0) + 1, SYNC_MAX_RETRIES);
          const nextQueue = { ...queue, retries, lastError: remote.reason || "Error de lectura" };
          pendingCloudPayloadRef.current = nextQueue;
          saveSyncQueue(nextQueue);
          const retryDelay = Math.min(30000, 1200 * (2 ** retries));
          setCloudMeta((prev) => ({
            ...prev,
            syncing: false,
            queueCount: 1,
            retries,
            error: `No se pudo leer nube. Reintento en ${Math.round(retryDelay / 1000)}s.`,
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
            conflict: {
              remoteUpdatedAt: remote.cloudUpdatedAt,
              localUpdatedAt: queue.pending?.updatedAt || null,
            },
            error: "Conflicto detectado: hay cambios mas nuevos en nube.",
          }));
          return;
        }

        const response = await pushCloudState(queue.pending, cloudIdentity);
        if (!response.ok) {
          const retries = Math.min((queue.retries || 0) + 1, SYNC_MAX_RETRIES);
          const nextQueue = { ...queue, retries, lastError: response.reason || "Error de sincronizacion" };
          pendingCloudPayloadRef.current = nextQueue;
          saveSyncQueue(nextQueue);
          const retryDelay = Math.min(30000, 1200 * (2 ** retries));
          setCloudMeta((prev) => ({
            ...prev,
            syncing: false,
            queueCount: 1,
            retries,
            error: `Sincronizacion fallida. Reintento en ${Math.round(retryDelay / 1000)}s.`,
          }));
          if (cloudRetryTimerRef.current) clearTimeout(cloudRetryTimerRef.current);
          cloudRetryTimerRef.current = setTimeout(() => scheduleAttempt(1000), retryDelay);
          return;
        }

        forceCloudOverwriteRef.current = false;
        knownCloudUpdatedAtRef.current = response.cloudUpdatedAt || new Date().toISOString();
        pendingCloudPayloadRef.current = { pending: null, retries: 0, lastError: null, updatedAt: null };
        saveSyncQueue(pendingCloudPayloadRef.current);
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
  }, [cloudCanSync, cloudReady, cloudIdentity.profileKey, cloudIdentity.userId, isOnline, state]);

  useEffect(() => {
    saveDrafts(draftLogs);
  }, [draftLogs]);

  const sendOtpLink = async () => {
    if (!supabase) return;
    const email = authEmail.trim().toLowerCase();
    if (!email || !email.includes("@")) {
      setAuthError("Ingresa un correo valido.");
      return;
    }

    setSendingOtp(true);
    setAuthError("");
    setAuthNotice("");
    const redirectTo = SUPABASE_AUTH_REDIRECT_URL || window.location.origin;
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: redirectTo },
    });
    setSendingOtp(false);
    if (error) {
      setAuthError(error.message || "No se pudo enviar el correo.");
      return;
    }
    setAuthNotice("Correo enviado. Abre el link en este iPhone para entrar.");
  };

  const signOutAuth = async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
    setAuthNotice("Sesion cerrada.");
  };

  const unlock = () => {
    safeSessionSet(SESSION_UNLOCK_KEY, "1");
    setIsUnlocked(true);
  };

  const lock = () => {
    if (REQUIRE_SUPABASE_AUTH && authSession?.user?.id) {
      signOutAuth();
    }
    safeSessionRemove(SESSION_UNLOCK_KEY);
    setIsUnlocked(false);
  };

  const selectedDay = state.routine[state.dayIndex] || state.routine[0];
  const sessionDraftKey = makeDraftSessionKey(selectedDay.id, state.sessionDate);
  const sessionSavedLogs = state.trainingLogs?.[selectedDay.id]?.[state.sessionDate] || {};
  const totalRoutineCards = selectedDay.exercises.length + 1;
  const atLastRoutineCard = activeExerciseCard >= totalRoutineCards - 1;

  const sessionDraft = useMemo(() => {
    const existing = draftLogs?.[sessionDraftKey];
    if (existing && typeof existing === "object") return existing;
    const fromSaved = {};
    selectedDay.exercises.forEach((exercise) => {
      const sets = Array.isArray(sessionSavedLogs?.[exercise.id]) ? sessionSavedLogs[exercise.id].map(normalizeSet) : [];
      if (sets.length > 0) fromSaved[exercise.id] = sets;
    });
    return fromSaved;
  }, [draftLogs, selectedDay.exercises, sessionDraftKey, sessionSavedLogs]);

  const sessionSetCount = useMemo(
    () => selectedDay.exercises.reduce((acc, exercise) => acc + (Array.isArray(sessionDraft?.[exercise.id]) ? sessionDraft[exercise.id].length : 0), 0),
    [selectedDay.exercises, sessionDraft]
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
      Object.entries(logsByDate).forEach(([date, byExercise]) => {
        const exerciseRows = day.exercises
          .map((exercise) => {
            const sets = Array.isArray(byExercise?.[exercise.id]) ? byExercise[exercise.id] : [];
            if (!sets.length) return null;
            const max = Math.max(...sets.map((item) => Number(item.weight) || 0));
            const avg = averageWeight(sets);
            const volume = sets.reduce((acc, item) => {
              const weight = Number(item.weight) || 0;
              const reps = Number(item.reps) || 0;
              return acc + weight * reps;
            }, 0);
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
        const bestExercise = exerciseRows.reduce((best, item) => {
          if (!best) return item;
          return item.max > best.max ? item : best;
        }, null);
        sessions.push({
          id: `${day.id}_${date}`,
          dayId: day.id,
          date,
          dateLabel: formatSessionDate(date),
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
  }, [state.trainingLogs, state.routine]);

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

  const previousComparableSession = useMemo(() => {
    if (!selectedHistorySession) return null;
    return routineSessions
      .filter((session) => session.dayId === selectedHistorySession.dayId && session.date < selectedHistorySession.date)
      .sort((a, b) => b.date.localeCompare(a.date))[0] || null;
  }, [routineSessions, selectedHistorySession]);

  const comparisonRows = useMemo(() => {
    if (!selectedHistorySession || !previousComparableSession) return [];
    const previousMap = Object.fromEntries(previousComparableSession.exerciseRows.map((row) => [row.id, row]));
    return selectedHistorySession.exerciseRows.map((row) => {
      const prev = previousMap[row.id];
      if (!prev) {
        return { id: row.id, name: row.name, maxDelta: row.max, volumeDelta: row.volume, trend: "nuevo" };
      }
      const maxDelta = Number((row.max - prev.max).toFixed(1));
      const volumeDelta = Math.round(row.volume - prev.volume);
      return {
        id: row.id,
        name: row.name,
        maxDelta,
        volumeDelta,
        trend: maxDelta > 0 || volumeDelta > 0 ? "sube" : maxDelta < 0 || volumeDelta < 0 ? "baja" : "igual",
      };
    });
  }, [selectedHistorySession, previousComparableSession]);

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
    return Object.values(map)
      .sort((a, b) => a.weekKey.localeCompare(b.weekKey))
      .slice(-12);
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

  const deltaFromStart = latestWeight - Number(state.settings.startWeight || 0);
  const restRemainingSec = restTimer.endAt ? Math.max(0, Math.ceil((restTimer.endAt - timerNow) / 1000)) : 0;
  const saveStatusText = !cloudMeta.enabled
    ? "Guardado local"
    : cloudMeta.conflict
      ? "Conflicto de nube"
      : cloudMeta.syncing
        ? "Sincronizando..."
        : cloudMeta.queueCount > 0
          ? isOnline
            ? `En cola (${cloudMeta.retries || 0})`
            : "En cola sin internet"
          : cloudMeta.error
            ? "Guardado local"
            : "Guardado local + nube";

  const updateSetting = (field, value) => {
    setState((prev) => ({ ...prev, settings: { ...prev.settings, [field]: value } }));
  };

  const updateSettingNumber = (field, value) => {
    const parsed = Number(value);
    if (Number.isNaN(parsed)) return;
    updateSetting(field, parsed);
  };

  const changeWeek = (delta) => {
    setState((prev) => ({ ...prev, week: Math.max(1, prev.week + delta) }));
  };

  const selectDay = (index) => {
    setState((prev) => ({ ...prev, dayIndex: clamp(index, 0, prev.routine.length - 1) }));
  };

  const setSessionDate = (date) => {
    setState((prev) => ({ ...prev, sessionDate: date }));
  };

  useEffect(() => {
    setActiveExerciseCard(0);
    setRoutineSavedMessage("");
    if (routineTrackRef.current) routineTrackRef.current.scrollLeft = 0;
  }, [selectedDay.id, selectedDay.exercises.length, state.sessionDate]);

  useEffect(() => {
    if (!restTimer.endAt) return;
    if (restRemainingSec <= 0) {
      setRestTimer({ endAt: null, seconds: 0, exercise: "" });
    }
  }, [restRemainingSec, restTimer.endAt]);

  const buildBaseDraft = () => {
    const base = {};
    selectedDay.exercises.forEach((exercise) => {
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
          ? Object.fromEntries(
              Object.entries(current).map(([exerciseId, sets]) => [
                exerciseId,
                Array.isArray(sets) ? sets.map(normalizeSet) : [],
              ])
            )
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

      selectedDay.exercises.forEach((exercise) => {
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
    if (routineSavedMessage) setRoutineSavedMessage("");
  };

  const startRestTimerFromExercise = (exercise) => {
    const seconds = parseRestSeconds(exercise?.rest || "");
    setRestTimer({
      endAt: Date.now() + (seconds * 1000),
      seconds,
      exercise: exercise?.name || "Ejercicio",
    });
  };

  const clearRestTimer = () => {
    setRestTimer({ endAt: null, seconds: 0, exercise: "" });
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

  const clearSessionDraft = () => {
    setDraftLogs((prev) => {
      if (!prev?.[sessionDraftKey]) return prev;
      const next = { ...prev };
      delete next[sessionDraftKey];
      return next;
    });
  };

  const goToRoutineCard = (targetIndex) => {
    const nextIndex = clamp(targetIndex, 0, totalRoutineCards - 1);
    const track = routineTrackRef.current;
    if (!track) {
      setActiveExerciseCard(nextIndex);
      return;
    }

    const left = track.clientWidth * nextIndex;
    track.scrollTo({ left, behavior: "smooth" });
    setActiveExerciseCard(nextIndex);
  };

  const autofillSessionFromPrevious = () => {
    let appliedCount = 0;
    updateSessionDraft((currentDraft) => {
      const nextDraft = { ...currentDraft };

      selectedDay.exercises.forEach((exercise) => {
        const alreadyHasSets = Array.isArray(nextDraft[exercise.id]) && nextDraft[exercise.id].length > 0;
        if (alreadyHasSets) return;

        const history = getExerciseHistory(state.trainingLogs, selectedDay.id, exercise.id);
        const previous = history.find((entry) => entry.date < state.sessionDate) || history.find((entry) => entry.date !== state.sessionDate) || null;
        if (!previous?.last) return;

        nextDraft[exercise.id] = [{
          weight: Number(previous.last.weight) || 0,
          reps: Number(previous.last.reps) || 0,
          ts: Date.now(),
        }];
        appliedCount += 1;
      });

      syncDraftToTrainingLogs(nextDraft);
      return nextDraft;
    });
    if (appliedCount > 0) {
      setRoutineSavedMessage(`Modo rapido: ${appliedCount} ejercicios autocompletados.`);
    } else {
      setRoutineSavedMessage("Modo rapido: no habia datos previos para autocompletar.");
    }
  };

  const openHistorySession = (session) => {
    if (!session) return;
    setSelectedHistorySessionId(session.id);
  };

  const loadHistorySessionInRoutine = (session) => {
    if (!session) return;

    setState((prev) => {
      const dayIndex = prev.routine.findIndex((day) => day.id === session.dayId);
      if (dayIndex < 0) return prev;
      return { ...prev, dayIndex, sessionDate: session.date };
    });

    setTab("rutina");
    setRoutineSavedMessage(`Resumen cargado: ${session.dayName} ${formatSessionDate(session.date)}`);
  };

  const useCloudVersion = async () => {
    const remote = await fetchCloudState(cloudIdentity);
    if (!remote.ok || !remote.payload) return;
    setState(remote.payload);
    setSaveMeta(saveState(remote.payload, true));
    knownCloudUpdatedAtRef.current = remote.cloudUpdatedAt || knownCloudUpdatedAtRef.current;
    setCloudMeta((prev) => ({ ...prev, conflict: null, error: null, syncedAt: remote.cloudUpdatedAt || prev.syncedAt }));
  };

  const overwriteCloudVersion = () => {
    forceCloudOverwriteRef.current = true;
    setCloudMeta((prev) => ({ ...prev, conflict: null, error: null }));
    setState((prev) => ({ ...prev }));
  };

  const finalizeRoutine = () => {
    const hasSets = selectedDay.exercises.some((exercise) => Array.isArray(sessionDraft?.[exercise.id]) && sessionDraft[exercise.id].length > 0);
    if (!hasSets && !window.confirm("No hay sets capturados. ¿Guardar esta rutina vacía para la fecha seleccionada?")) return;

    syncDraftToTrainingLogs(sessionDraft);

    clearSessionDraft();
    setRoutineSavedMessage(`Rutina guardada - ${selectedDay.fullDay} ${formatSessionDate(state.sessionDate)}`);
    setActiveExerciseCard(selectedDay.exercises.length);
  };

  const onRoutineTrackScroll = (event) => {
    const { scrollLeft, clientWidth } = event.currentTarget;
    if (!clientWidth) return;
    const index = clamp(Math.round(scrollLeft / clientWidth), 0, totalRoutineCards - 1);
    if (index !== activeExerciseCard) setActiveExerciseCard(index);
  };

  const addWeightLog = () => {
    const weight = Number(weightForm.weight);
    const waist = weightForm.waist === "" ? null : Number(weightForm.waist);
    if (!weightForm.date || Number.isNaN(weight) || weight <= 0) return;

    setState((prev) => ({
      ...prev,
      weightLogs: [
        ...prev.weightLogs,
        {
          id: makeId("w"),
          date: weightForm.date,
          weight,
          waist: Number.isNaN(waist) ? null : waist,
          ts: Date.now(),
        },
      ],
    }));

    setWeightForm((prev) => ({ ...prev, weight: "", waist: "" }));
  };

  const removeWeightLog = (id) => {
    setState((prev) => ({
      ...prev,
      weightLogs: prev.weightLogs.filter((entry) => entry.id !== id),
    }));
  };

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
        { id: makeId("d"), shortDay: "NEW", fullDay: "Nuevo día", type: "Fuerza", title: "Nueva sesión", postCardio: "", cardioProtocol: "", exercises: [] },
      ];
      return { ...prev, routine, dayIndex: routine.length - 1 };
    });
  };

  const removeSelectedDay = () => {
    if (!window.confirm("Borrar este día completo?")) return;
    setState((prev) => {
      if (prev.routine.length <= 1) return prev;
      const routine = prev.routine.filter((_, index) => index !== prev.dayIndex);
      return { ...prev, routine, dayIndex: clamp(prev.dayIndex, 0, routine.length - 1) };
    });
  };

  const addExercise = () => {
    setState((prev) => {
      const routine = [...prev.routine];
      const day = { ...routine[prev.dayIndex] };
      day.exercises = [...day.exercises, { id: makeId("e"), name: "Nuevo ejercicio", sets: "3", reps: "8-10", rest: "90s", note: "" }];
      routine[prev.dayIndex] = day;
      return { ...prev, routine };
    });
  };

  const updateExercise = (exerciseId, field, value) => {
    setState((prev) => {
      const routine = [...prev.routine];
      const day = { ...routine[prev.dayIndex] };
      day.exercises = day.exercises.map((exercise) =>
        exercise.id === exerciseId ? { ...exercise, [field]: value } : exercise
      );
      routine[prev.dayIndex] = day;
      return { ...prev, routine };
    });
  };

  const removeExercise = (exerciseId) => {
    setState((prev) => {
      const routine = [...prev.routine];
      const day = { ...routine[prev.dayIndex] };
      day.exercises = day.exercises.filter((exercise) => exercise.id !== exerciseId);
      routine[prev.dayIndex] = day;
      return { ...prev, routine };
    });
  };

  const addMeal = () => {
    setState((prev) => ({
      ...prev,
      dietMeals: [...prev.dietMeals, { id: makeId("m"), title: "Nueva comida", time: "", note: "", options: [] }],
    }));
  };

  const removeMeal = (mealId) => {
    if (!window.confirm("Borrar esta comida y sus platillos?")) return;
    setState((prev) => ({ ...prev, dietMeals: prev.dietMeals.filter((meal) => meal.id !== mealId) }));
  };

  const updateMeal = (mealId, field, value) => {
    setState((prev) => ({
      ...prev,
      dietMeals: prev.dietMeals.map((meal) => (meal.id === mealId ? { ...meal, [field]: value } : meal)),
    }));
  };

  const addDish = (mealId) => {
    setState((prev) => ({
      ...prev,
      dietMeals: prev.dietMeals.map((meal) =>
        meal.id === mealId
          ? { ...meal, options: [...meal.options, { id: makeId("o"), name: "Nuevo platillo", kcal: 0, protein: 0, carbs: 0, fats: 0, description: "" }] }
          : meal
      ),
    }));
  };

  const removeDish = (mealId, optionId) => {
    setState((prev) => ({
      ...prev,
      dietMeals: prev.dietMeals.map((meal) =>
        meal.id === mealId ? { ...meal, options: meal.options.filter((option) => option.id !== optionId) } : meal
      ),
    }));
  };

  const updateDish = (mealId, optionId, field, value) => {
    setState((prev) => ({
      ...prev,
      dietMeals: prev.dietMeals.map((meal) => {
        if (meal.id !== mealId) return meal;
        return {
          ...meal,
          options: meal.options.map((option) => {
            if (option.id !== optionId) return option;
            if (["kcal", "protein", "carbs", "fats"].includes(field)) {
              const parsed = Number(value);
              return { ...option, [field]: Number.isNaN(parsed) ? 0 : parsed };
            }
            return { ...option, [field]: value };
          }),
        };
      }),
    }));
  };

  const addSupplement = () => {
    setState((prev) => ({
      ...prev,
      supplements: [...prev.supplements, { id: makeId("sup"), status: "Actual", name: "Nuevo suplemento", dose: "", timing: "", note: "" }],
    }));
  };

  const removeSupplement = (id) => {
    setState((prev) => ({ ...prev, supplements: prev.supplements.filter((item) => item.id !== id) }));
  };

  const updateSupplement = (id, field, value) => {
    setState((prev) => ({
      ...prev,
      supplements: prev.supplements.map((item) => (item.id === id ? { ...item, [field]: value } : item)),
    }));
  };

  const exportProgressCsv = () => {
    const header = [
      ["tipo", "fecha", "bloque", "ejercicio", "sets", "max_kg", "prom_kg", "ultimo_kg", "ultimo_reps", "volumen"],
    ];
    const weightRows = state.weightLogs
      .map((entry) => [
        "peso",
        entry.date,
        "",
        "",
        "",
        "",
        "",
        Number(entry.weight) || 0,
        entry.waist ?? "",
        "",
      ]);
    const routineRows = routineSessions.flatMap((session) =>
      session.exerciseRows.map((item) => [
        "rutina",
        session.date,
        `${session.dayName} - ${session.title}`,
        item.name,
        item.setsCount,
        item.max,
        item.avg,
        item.last.weight,
        item.last.reps,
        item.volume,
      ])
    );
    const rows = [...header, ...weightRows, ...routineRows];
    const csv = rows
      .map((row) => row.map((value) => `"${String(value ?? "").replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `lockin-progreso-${mexicoDate()}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const exportPrintableReport = () => {
    const reportWindow = window.open("", "_blank", "noopener,noreferrer,width=960,height=720");
    if (!reportWindow) {
      window.alert("No se pudo abrir la ventana de impresion.");
      return;
    }

    const rows = routineSessions
      .slice(0, 25)
      .map(
        (session) => `
          <tr>
            <td>${session.date}</td>
            <td>${session.dayName}</td>
            <td>${session.title}</td>
            <td>${session.setsCount}</td>
            <td>${session.sessionVolume}</td>
          </tr>
        `
      )
      .join("");
    const pbs = exercisePbs
      .map((item) => `<li>${item.name}: <strong>${item.max}kg</strong> (${item.date})</li>`)
      .join("");

    reportWindow.document.open();
    reportWindow.document.write(`
      <!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>LOCK IN - Reporte</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 24px; color: #111; }
            h1, h2 { margin: 0 0 10px; }
            .muted { color: #555; margin-bottom: 14px; }
            table { width: 100%; border-collapse: collapse; margin-top: 12px; }
            th, td { border: 1px solid #ddd; padding: 8px; text-align: left; font-size: 12px; }
            th { background: #f2f2f2; }
            ul { margin: 8px 0 0 18px; }
          </style>
        </head>
        <body>
          <h1>LOCK IN - Reporte de progreso</h1>
          <p class="muted">Generado ${formatDate(new Date().toISOString())}</p>
          <h2>Peso actual: ${latestWeight.toFixed(1)}kg</h2>
          <p class="muted">Meta: ${state.settings.goalWeight}kg | Cambio: ${deltaFromStart > 0 ? "+" : ""}${deltaFromStart.toFixed(1)}kg</p>
          <h2>PRs por ejercicio</h2>
          <ul>${pbs || "<li>Sin registros.</li>"}</ul>
          <h2>Ultimas sesiones</h2>
          <table>
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Dia</th>
                <th>Bloque</th>
                <th>Sets</th>
                <th>Volumen</th>
              </tr>
            </thead>
            <tbody>${rows || "<tr><td colspan='5'>Sin sesiones guardadas.</td></tr>"}</tbody>
          </table>
        </body>
      </html>
    `);
    reportWindow.document.close();
    reportWindow.focus();
    reportWindow.print();
  };

  const exportBackup = () => {
    const payload = { exportedAt: new Date().toISOString(), app: "LOCK IN", state };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `lockin-backup-${mexicoDate()}.json`;
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
      setSaveMeta(saveState(nextState, true));
      window.alert("Backup importado correctamente.");
    } catch {
      window.alert("No se pudo importar el backup.");
    } finally {
      event.target.value = "";
    }
  };

  const checkpoint = () => {
    setSaveMeta(saveState(state, true));
  };

  const resetDefaults = () => {
    if (!window.confirm("Restaurar rutina/dieta/suplementos por defecto?")) return;
    setState(normalizeState(DEFAULT_STATE));
  };

  const hasSupabaseSession = Boolean(authSession?.user?.id);
  const appUnlocked = REQUIRE_SUPABASE_AUTH ? hasSupabaseSession || isUnlocked : isUnlocked;

  if (REQUIRE_SUPABASE_AUTH && !authReady) {
    return (
      <div className="gate-shell">
        <div className="gate-card">
          <p className="gate-tag">LOCK IN AUTH</p>
          <h1>Cargando sesion...</h1>
          <p className="gate-sub">Espera un momento.</p>
        </div>
      </div>
    );
  }

  if (!appUnlocked) {
    if (REQUIRE_SUPABASE_AUTH) {
      return (
        <SupabaseAuthGate
          configured={SUPABASE_CONFIGURED}
          email={authEmail}
          onEmailChange={setAuthEmail}
          onSendOtp={sendOtpLink}
          sendingOtp={sendingOtp}
          notice={authNotice}
          error={authError}
          fallbackEnabled={Boolean(ACCESS_KEY)}
          onUnlockWithKey={unlock}
        />
      );
    }
    return <AccessGate onUnlock={unlock} />;
  }

  return (
    <div className="app-shell">
      <header className="hero">
        <div>
          <p className="hero-tag">
            {REQUIRE_SUPABASE_AUTH ? "LOCK IN - SUPABASE AUTH" : "LOCK IN - PRIVATE MODE"}
          </p>
          <h1>{state.settings.appName}</h1>
          <p className="hero-sub">
            {state.settings.profileName} - {latestWeight.toFixed(1)}kg actual - Meta {state.settings.goalWeight}kg
          </p>
          <p className="hero-sync">{saveStatusText}</p>
        </div>
        <button className="btn btn-ghost" type="button" onClick={lock}>
          {REQUIRE_SUPABASE_AUTH ? "Salir" : "Bloquear"}
        </button>
      </header>

      <section className="kpi-strip">
        <article className="kpi-pill">
          <p className="kpi-label">Peso</p>
          <p className="kpi-value">{latestWeight.toFixed(1)}kg</p>
        </article>
        <article className="kpi-pill">
          <p className="kpi-label">Meta</p>
          <p className="kpi-value">{state.settings.goalWeight}kg</p>
        </article>
        <article className="kpi-pill">
          <p className="kpi-label">Cambio</p>
          <p className="kpi-value">{`${deltaFromStart > 0 ? "+" : ""}${deltaFromStart.toFixed(1)}kg`}</p>
        </article>
        <article className="kpi-pill">
          <p className="kpi-label">Sets</p>
          <p className="kpi-value">{totalSetsLogged}</p>
        </article>
      </section>

      <nav className="tabs">
        {[ ["rutina", "Hoy"], ["historial", "Rutinas"], ["progreso", "Progreso"], ["dieta", "Dieta"], ["suplementos", "Suples"], ["config", "Ajustes"] ].map(([id, label]) => (
          <button key={id} type="button" className={`tab ${tab === id ? "active" : ""}`} onClick={() => setTab(id)}>{label}</button>
        ))}
      </nav>

      {tab === "rutina" && (
        <section className="panel">
          <div className="row space-between wrap">
            <h2>Rutina</h2>
            <div className="row gap-8 wrap">
              <button className="btn btn-ghost" type="button" onClick={() => changeWeek(-1)}>Semana -</button>
              <span className="week-badge">Semana {state.week}</span>
              <button className="btn btn-ghost" type="button" onClick={() => changeWeek(1)}>Semana +</button>
            </div>
          </div>

          <div className="grid-two top-8">
            <Field label="Fecha" type="date" value={state.sessionDate} onChange={setSessionDate} />
            <button className="btn btn-ghost" type="button" onClick={() => setSessionDate(mexicoDate())}>Usar hoy</button>
          </div>
          <p className="muted small top-6">Zona horaria activa: UTC-6 (Ciudad de México).</p>

          <div className="day-chip-row">
            {state.routine.map((day, index) => {
              const dateLogs = state.trainingLogs?.[day.id]?.[state.sessionDate] || {};
              const dayDraft = draftLogs?.[makeDraftSessionKey(day.id, state.sessionDate)] || {};
              const hasLogs = day.exercises.some((exercise) => {
                const hasSaved = Array.isArray(dateLogs?.[exercise.id]) && dateLogs[exercise.id].length > 0;
                const hasDraft = Array.isArray(dayDraft?.[exercise.id]) && dayDraft[exercise.id].length > 0;
                return hasSaved || hasDraft;
              });
              return (
                <button key={day.id} type="button" className={`day-chip ${index === state.dayIndex ? "active" : ""}`} onClick={() => selectDay(index)}>
                  {day.shortDay}
                  {hasLogs && <span className="dot" />}
                </button>
              );
            })}
          </div>

          <article className="focus-card">
            <p className="focus-kicker">{selectedDay.fullDay} - {selectedDay.type}</p>
            <h3>{selectedDay.title}</h3>
            <p className="muted">{selectedDay.postCardio || ""}</p>
            {selectedDay.cardioProtocol && <p className="muted top-6">{selectedDay.cardioProtocol}</p>}
          </article>

          <div className="row space-between wrap">
            <p className="muted">Caminata diaria con el perro: ~30 min (no cuenta como Z2).</p>
            <div className="row gap-8 wrap">
              <button className={`btn ${quickModeEnabled ? "btn-primary" : "btn-ghost"}`} type="button" onClick={() => setQuickModeEnabled((prev) => !prev)}>
                {quickModeEnabled ? "Modo rapido ON" : "Modo rapido OFF"}
              </button>
              <button className="btn btn-soft" type="button" onClick={autofillSessionFromPrevious}>Autocompletar</button>
              <button className="btn btn-ghost" type="button" onClick={() => setRoutineEditMode((prev) => !prev)}>
                {routineEditMode ? "Cerrar edicion" : "Editar rutina"}
              </button>
            </div>
          </div>

          {!routineEditMode && selectedDay.exercises.length > 0 && (
            <div className="top-10">
              <p className="muted small">Desliza horizontalmente para capturar cada ejercicio. La ultima tarjeta finaliza y guarda todo.</p>
              {routineSavedMessage && <p className="trend top-6">{routineSavedMessage}</p>}

              {quickModeEnabled && (
                <article className="card top-8 rest-timer-card">
                  <div className="row space-between wrap">
                    <h4>Timer de descanso</h4>
                    <span className="pill">{restRemainingSec > 0 ? `${restRemainingSec}s` : "--"}</span>
                  </div>
                  <p className="muted top-6">
                    {restRemainingSec > 0 ? `${restTimer.exercise || "Ejercicio"} - descanso activo` : "Inactivo. Se inicia al guardar un set."}
                  </p>
                  <div className="row gap-8 wrap top-8">
                    <button className="btn btn-soft btn-mini" type="button" onClick={() => setRestTimer({ endAt: Date.now() + 60000, seconds: 60, exercise: "Manual 60s" })}>+60s</button>
                    <button className="btn btn-danger btn-mini" type="button" onClick={clearRestTimer} disabled={restRemainingSec <= 0}>Detener</button>
                  </div>
                </article>
              )}

              <div className="swipe-progress top-8">
                {Array.from({ length: totalRoutineCards }).map((_, index) => (
                  <button
                    key={`dot_${index}`}
                    type="button"
                    className={`swipe-dot ${index === activeExerciseCard ? "active" : ""}`}
                    onClick={() => goToRoutineCard(index)}
                    aria-label={`Ir a tarjeta ${index + 1}`}
                  />
                ))}
              </div>

              <div className="swipe-toolbar top-8">
                <button
                  className="btn btn-soft btn-mini"
                  type="button"
                  onClick={() => goToRoutineCard(activeExerciseCard - 1)}
                  disabled={activeExerciseCard === 0}
                >
                  Anterior
                </button>
                <p className="swipe-index">
                  Tarjeta {Math.min(activeExerciseCard + 1, totalRoutineCards)} de {totalRoutineCards}
                </p>
                <button
                  className={`btn btn-mini ${atLastRoutineCard ? "btn-primary" : "btn-soft"}`}
                  type="button"
                  onClick={() => {
                    if (atLastRoutineCard) finalizeRoutine();
                    else goToRoutineCard(activeExerciseCard + 1);
                  }}
                >
                  {atLastRoutineCard ? "Guardar" : "Siguiente"}
                </button>
              </div>

              <div
                ref={routineTrackRef}
                key={`swipe_${selectedDay.id}_${state.sessionDate}`}
                className="swipe-track top-8"
                onScroll={onRoutineTrackScroll}
              >
                {selectedDay.exercises.map((exercise, exerciseIndex) => {
                  const history = getExerciseHistory(state.trainingLogs, selectedDay.id, exercise.id);
                  const previous = history.find((entry) => entry.date < state.sessionDate) || history.find((entry) => entry.date !== state.sessionDate) || null;
                  const currentSets = Array.isArray(sessionDraft?.[exercise.id]) ? sessionDraft[exercise.id] : [];

                  return (
                    <div key={exercise.id} className="swipe-slide">
                      <ExerciseLogCard
                        exercise={exercise}
                        previous={previous}
                        currentSets={currentSets}
                        onAddSet={addSetDraft}
                        onRemoveSet={removeSetDraft}
                        onStartRest={startRestTimerFromExercise}
                        onGoNext={() => goToRoutineCard(exerciseIndex + 1)}
                        canGoNext={exerciseIndex < selectedDay.exercises.length - 1}
                        quickMode={quickModeEnabled}
                      />
                    </div>
                  );
                })}

                <div className="swipe-slide">
                  <article className="exercise-card">
                    <h4>Finalizar rutina</h4>
                    <p className="muted top-6">{selectedDay.fullDay} - {selectedDay.title}</p>
                    <p className="muted top-6">Fecha: {formatSessionDate(state.sessionDate)}</p>
                    <p className="muted top-6">Sets listos para guardar: {sessionSetCount}</p>
                    <button className="btn btn-primary top-10" type="button" onClick={finalizeRoutine}>Finalizar y guardar</button>
                    <p className="tiny-note">Borrador autosalvado en este iPhone mientras capturas. No se pierde si cierras Safari.</p>
                  </article>
                </div>
              </div>
            </div>
          )}

          {!routineEditMode && selectedDay.exercises.length === 0 && (
            <article className="card top-10">
              <p className="muted">Día de cardio. Si quieres agregar ejercicios en este bloque, activa "Editar rutina".</p>
            </article>
          )}

          {routineEditMode && (
            <div className="stack gap-12 top-12">
              <article className="card">
                <h4>Editar día</h4>
                <div className="grid-two top-8">
                  <Field label="Etiqueta corta" value={selectedDay.shortDay} onChange={(value) => updateSelectedDay("shortDay", value)} />
                  <Field label="Día completo" value={selectedDay.fullDay} onChange={(value) => updateSelectedDay("fullDay", value)} />
                  <Field label="Tipo" value={selectedDay.type} onChange={(value) => updateSelectedDay("type", value)} />
                  <Field label="Título" value={selectedDay.title} onChange={(value) => updateSelectedDay("title", value)} />
                  <Field label="Post-cardio" value={selectedDay.postCardio} onChange={(value) => updateSelectedDay("postCardio", value)} />
                </div>
                <label className="field top-8">
                  <span>Protocolo cardio (si aplica)</span>
                  <textarea className="input" rows={3} value={selectedDay.cardioProtocol} onChange={(event) => updateSelectedDay("cardioProtocol", event.target.value)} />
                </label>
                <div className="row gap-8 wrap top-8">
                  <button className="btn btn-primary" type="button" onClick={addRoutineDay}>Agregar día</button>
                  <button className="btn btn-danger" type="button" onClick={removeSelectedDay}>Borrar día</button>
                </div>
              </article>

              <article className="card">
                <div className="row space-between wrap">
                  <h4>Editar ejercicios</h4>
                  <button className="btn btn-primary" type="button" onClick={addExercise}>Agregar ejercicio</button>
                </div>
                {selectedDay.exercises.length === 0 && <p className="muted top-8">Sin ejercicios en este día.</p>}
                <div className="stack gap-8 top-8">
                  {selectedDay.exercises.map((exercise) => (
                    <div key={exercise.id} className="exercise-editor">
                      <Field label="Ejercicio" value={exercise.name} onChange={(value) => updateExercise(exercise.id, "name", value)} />
                      <div className="grid-two top-6">
                        <Field label="Series" value={exercise.sets} onChange={(value) => updateExercise(exercise.id, "sets", value)} />
                        <Field label="Reps" value={exercise.reps} onChange={(value) => updateExercise(exercise.id, "reps", value)} />
                        <Field label="Descanso" value={exercise.rest} onChange={(value) => updateExercise(exercise.id, "rest", value)} />
                        <Field label="Nota" value={exercise.note} onChange={(value) => updateExercise(exercise.id, "note", value)} />
                      </div>
                      <button className="btn btn-danger top-6" type="button" onClick={() => removeExercise(exercise.id)}>Borrar ejercicio</button>
                    </div>
                  ))}
                </div>
              </article>
            </div>
          )}
        </section>
      )}

      {tab === "historial" && (
        <section className="panel">
          <div className="row space-between wrap">
            <h2>Historial de rutinas</h2>
            <span className="pill">{filteredRoutineSessions.length}/{routineSessions.length}</span>
          </div>
          <p className="muted top-8">Rutinas guardadas por fecha. Zona horaria: UTC-6 (Ciudad de México).</p>
          <div className="top-10">
            <Field
              label="Buscar sesión"
              value={historyQuery}
              onChange={setHistoryQuery}
              placeholder="Fecha, bloque o ejercicio"
            />
          </div>

          <section className="stats-grid compact top-10 stats-mini">
            <StatCard label="Sesiones visibles" value={`${filteredRoutineSessions.length}`} meta="Filtradas" tone="accent" />
            <StatCard label="Sets totales" value={`${totalSetsLogged}`} meta="Acumulado" tone="good" />
            <StatCard label="Última fecha" value={formatSessionDate(filteredRoutineSessions[0]?.date || "")} meta={filteredRoutineSessions[0]?.dayName || "Sin registros"} tone="warning" />
            <StatCard label="Fecha activa" value={formatSessionDate(state.sessionDate)} meta={selectedDay.fullDay} tone="good" />
          </section>

          {selectedHistorySession && (
            <article className="card top-12 history-summary">
              <div className="row space-between wrap">
                <h4>Resumen del día</h4>
                <span className="pill">{formatSessionDate(selectedHistorySession.date)}</span>
              </div>
              <p className="muted small top-6">{selectedHistorySession.dateLabel}</p>
              <p className="muted top-6">{selectedHistorySession.dayName} - {selectedHistorySession.title}</p>

              <section className="stats-grid compact top-10 stats-mini">
                <StatCard label="Sets" value={`${selectedHistorySession.setsCount}`} meta="Capturados" tone="accent" />
                <StatCard label="Volumen" value={`${selectedHistorySession.sessionVolume}kg`} meta="Carga x reps" tone="good" />
                <StatCard label="Ejercicios" value={`${selectedHistorySession.exerciseRows.length}`} meta="Con registro" tone="warning" />
                <StatCard
                  label="Top"
                  value={selectedHistorySession.bestExercise ? `${selectedHistorySession.bestExercise.max}kg` : "--"}
                  meta={selectedHistorySession.bestExercise?.name || "Sin referencia"}
                  tone="danger"
                />
              </section>

              {previousComparableSession && (
                <article className="card top-10 compare-card">
                  <div className="row space-between wrap">
                    <h5>Comparativa vs sesion anterior</h5>
                    <span className="pill">{formatSessionDate(previousComparableSession.date)}</span>
                  </div>
                  <p className="muted small top-6">
                    Delta sets: {selectedHistorySession.setsCount - previousComparableSession.setsCount >= 0 ? "+" : ""}
                    {selectedHistorySession.setsCount - previousComparableSession.setsCount}
                    {" | "}
                    Delta volumen: {selectedHistorySession.sessionVolume - previousComparableSession.sessionVolume >= 0 ? "+" : ""}
                    {selectedHistorySession.sessionVolume - previousComparableSession.sessionVolume}kg
                  </p>
                  <div className="stack gap-8 top-8">
                    {comparisonRows.map((item) => (
                      <div key={`cmp_${item.id}`} className="dish-card">
                        <strong>{item.name}</strong>
                        <p className="muted small top-6">
                          Max {item.maxDelta >= 0 ? "+" : ""}{item.maxDelta}kg | Volumen {item.volumeDelta >= 0 ? "+" : ""}{item.volumeDelta}kg
                        </p>
                      </div>
                    ))}
                  </div>
                </article>
              )}

              <div className="stack gap-8 top-10">
                {selectedHistorySession.exerciseRows.map((item) => (
                  <div key={`resume_${selectedHistorySession.id}_${item.id}`} className="dish-card">
                    <div className="row space-between wrap">
                      <strong>{item.name}</strong>
                      <span className="pill">{item.setsCount} sets</span>
                    </div>
                    <p className="muted small top-6">
                      Máx {item.max}kg - Promedio {item.avg}kg - Último {item.last.weight}kg x {item.last.reps}
                    </p>
                  </div>
                ))}
              </div>

              <div className="row gap-8 wrap top-10">
                <button className="btn btn-primary" type="button" onClick={() => loadHistorySessionInRoutine(selectedHistorySession)}>
                  Abrir en Rutina
                </button>
              </div>
            </article>
          )}

          <div className="stack gap-10 top-12">
            {filteredRoutineSessions.length === 0 && (
              <article className="card">
                <p className="muted">No hay resultados con ese filtro. Si lo limpias, verás todas tus rutinas guardadas.</p>
              </article>
            )}

            {filteredRoutineSessions.map((session) => (
              <article key={session.id} className={`card history-card ${selectedHistorySession?.id === session.id ? "selected" : ""}`}>
                <div className="row space-between wrap">
                  <h4>{session.dayName}</h4>
                  <span className="pill">{formatSessionDate(session.date)}</span>
                </div>
                <p className="muted top-6">{session.title}</p>
                <p className="muted small top-6">Sets guardados: {session.setsCount}</p>
                <p className="muted small top-6">Volumen: {session.sessionVolume}kg - Top: {session.bestExercise ? `${session.bestExercise.max}kg` : "--"}</p>

                <div className="row gap-8 wrap top-8">
                  <button className="btn btn-soft btn-mini" type="button" onClick={() => openHistorySession(session)}>
                    Cargar resumen
                  </button>
                  <button className="btn btn-ghost btn-mini" type="button" onClick={() => loadHistorySessionInRoutine(session)}>
                    Ir a Rutina
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

            {tab === "progreso" && (
        <section className="panel">
          <h2>Progreso Pro</h2>
          <div className="grid-three top-8">
            <Field label="Fecha" type="date" value={weightForm.date} onChange={(value) => setWeightForm((prev) => ({ ...prev, date: value }))} />
            <Field label="Peso (kg)" type="number" step="0.1" value={weightForm.weight} onChange={(value) => setWeightForm((prev) => ({ ...prev, weight: value }))} placeholder="78.3" />
            <Field label="Cintura (cm)" type="number" step="0.1" value={weightForm.waist} onChange={(value) => setWeightForm((prev) => ({ ...prev, waist: value }))} placeholder="Opcional" />
          </div>
          <p className="muted small top-6">Las fechas se calculan en horario de Ciudad de Mexico (UTC-6).</p>
          <div className="row gap-8 wrap top-8">
            <button className="btn btn-primary" type="button" onClick={addWeightLog}>Guardar peso</button>
            <button className="btn btn-soft" type="button" onClick={exportProgressCsv}>Exportar CSV</button>
            <button className="btn btn-ghost" type="button" onClick={exportPrintableReport}>Imprimir / PDF</button>
          </div>

          <section className="stats-grid compact top-10 stats-mini">
            <StatCard label="Peso actual" value={`${latestWeight.toFixed(1)}kg`} meta="Registro mas reciente" tone="accent" />
            <StatCard label="Cambio total" value={`${deltaFromStart >= 0 ? "+" : ""}${deltaFromStart.toFixed(1)}kg`} meta="Desde inicio" tone={deltaFromStart <= 0 ? "good" : "warning"} />
            <StatCard label="Semanas con volumen" value={`${weeklyVolumeRows.length}`} meta="Ultimas 12 semanas" tone="warning" />
            <StatCard label="PRs detectados" value={`${exercisePbs.length}`} meta="Ejercicios" tone="good" />
          </section>

          <article className="card top-12">
            <h4>Tendencia de peso</h4>
            <p className="muted small top-6">Cada punto es un registro de peso corporal.</p>
            <MiniLineChart points={weightTrendPoints} color="#d83b2d" />
          </article>

          <article className="card top-12">
            <h4>Volumen semanal</h4>
            <p className="muted small top-6">Carga total (peso x reps) por semana.</p>
            <MiniLineChart points={weeklyVolumePoints} color="#35c26c" />
            <div className="stack gap-8 top-8">
              {weeklyVolumeRows.slice(-4).reverse().map((row) => (
                <div key={row.weekKey} className="log-row">
                  <div>
                    <strong>{row.weekKey}</strong>
                    <p className="muted small">Volumen {row.volume}kg - Sets {row.sets}</p>
                  </div>
                </div>
              ))}
            </div>
          </article>

          <article className="card top-12">
            <h4>PRs por ejercicio</h4>
            {exercisePbs.length === 0 && <p className="muted top-8">Aun no hay PRs detectados.</p>}
            <div className="stack gap-8 top-8">
              {exercisePbs.map((item) => (
                <div key={item.id} className="log-row">
                  <div>
                    <strong>{item.name}</strong>
                    <p className="muted small">PR {item.max}kg - {formatSessionDate(item.date)}</p>
                  </div>
                </div>
              ))}
            </div>
          </article>

          <article className="card top-12">
            <h4>Historial de peso corporal</h4>
            {sortedWeightLogs.length === 0 && <p className="muted top-8">Aun no hay registros.</p>}
            <div className="stack gap-8 top-8">
              {sortedWeightLogs.map((entry) => (
                <div key={entry.id} className="log-row">
                  <div>
                    <strong>{entry.weight}kg</strong>
                    <p className="muted small">{entry.date}{entry.waist !== null ? ` - cintura ${entry.waist}cm` : ""}</p>
                  </div>
                  <button className="btn btn-danger" type="button" onClick={() => removeWeightLog(entry.id)}>Borrar</button>
                </div>
              ))}
            </div>
          </article>
        </section>
      )}

      {tab === "dieta" && (
        <section className="panel">
          <div className="row space-between wrap">
            <h2>Dieta</h2>
            <button className="btn btn-ghost" type="button" onClick={() => setDietEditMode((prev) => !prev)}>
              {dietEditMode ? "Cerrar edición" : "Editar dieta"}
            </button>
          </div>

          <div className="stats-grid compact top-10">
            <StatCard label="Calorías" value={`${state.settings.calories}`} meta="kcal/día" tone="accent" />
            <StatCard label="Proteína" value={`${state.settings.protein}g`} meta="Objetivo" tone="good" />
            <StatCard label="Carbos" value={`${state.settings.carbs}g`} meta="Objetivo" tone="warning" />
            <StatCard label="Grasas" value={`${state.settings.fats}g`} meta="Objetivo" tone="warning" />
          </div>

          {dietEditMode && <button className="btn btn-primary top-10" type="button" onClick={addMeal}>Agregar bloque de comida</button>}

          <div className="stack gap-12 top-12">
            {state.dietMeals.map((meal) => (
              <article key={meal.id} className="card">
                {dietEditMode ? (
                  <>
                    <div className="grid-two">
                      <Field label="Título" value={meal.title} onChange={(value) => updateMeal(meal.id, "title", value)} />
                      <Field label="Horario" value={meal.time} onChange={(value) => updateMeal(meal.id, "time", value)} />
                    </div>
                    <label className="field top-8">
                      <span>Nota</span>
                      <textarea className="input" rows={2} value={meal.note} onChange={(event) => updateMeal(meal.id, "note", event.target.value)} />
                    </label>
                  </>
                ) : (
                  <>
                    <h4>{meal.title}</h4>
                    <p className="muted">{meal.time}</p>
                    <p className="muted top-6">{meal.note}</p>
                  </>
                )}

                <div className="stack gap-8 top-10">
                  {meal.options.map((option) => (
                    <div key={option.id} className="dish-card">
                      {dietEditMode ? (
                        <>
                          <Field label="Platillo" value={option.name} onChange={(value) => updateDish(meal.id, option.id, "name", value)} />
                          <div className="grid-four top-6">
                            <Field label="kcal" type="number" value={option.kcal} onChange={(value) => updateDish(meal.id, option.id, "kcal", value)} />
                            <Field label="Prot" type="number" value={option.protein} onChange={(value) => updateDish(meal.id, option.id, "protein", value)} />
                            <Field label="Carbs" type="number" value={option.carbs} onChange={(value) => updateDish(meal.id, option.id, "carbs", value)} />
                            <Field label="Fats" type="number" value={option.fats} onChange={(value) => updateDish(meal.id, option.id, "fats", value)} />
                          </div>
                          <label className="field top-6">
                            <span>Descripción</span>
                            <textarea className="input" rows={2} value={option.description} onChange={(event) => updateDish(meal.id, option.id, "description", event.target.value)} />
                          </label>
                          <button className="btn btn-danger top-6" type="button" onClick={() => removeDish(meal.id, option.id)}>Borrar platillo</button>
                        </>
                      ) : (
                        <>
                          <h5>{option.name}</h5>
                          <p className="muted small">{option.kcal} kcal - P {option.protein}g - C {option.carbs}g - G {option.fats}g</p>
                          <p className="muted top-6">{option.description}</p>
                        </>
                      )}
                    </div>
                  ))}
                </div>

                {dietEditMode && (
                  <div className="row gap-8 wrap top-10">
                    <button className="btn btn-primary" type="button" onClick={() => addDish(meal.id)}>Agregar platillo</button>
                    <button className="btn btn-danger" type="button" onClick={() => removeMeal(meal.id)}>Borrar comida</button>
                  </div>
                )}
              </article>
            ))}
          </div>
        </section>
      )}

      {tab === "suplementos" && (
        <section className="panel">
          <div className="row space-between wrap">
            <h2>Suplementación</h2>
            <button className="btn btn-ghost" type="button" onClick={() => setSupplementEditMode((prev) => !prev)}>
              {supplementEditMode ? "Cerrar edición" : "Editar suplementación"}
            </button>
          </div>

          <p className="muted top-8">Base precargada de tu plan original. Puedes agregar, editar o borrar libremente.</p>

          {supplementEditMode && <button className="btn btn-primary top-10" type="button" onClick={addSupplement}>Agregar suplemento</button>}

          <div className="stack gap-10 top-10">
            {state.supplements.map((item) => (
              <article key={item.id} className="card">
                {supplementEditMode ? (
                  <>
                    <div className="grid-two">
                      <Field label="Estado" value={item.status} onChange={(value) => updateSupplement(item.id, "status", value)} />
                      <Field label="Suplemento" value={item.name} onChange={(value) => updateSupplement(item.id, "name", value)} />
                      <Field label="Dosis" value={item.dose} onChange={(value) => updateSupplement(item.id, "dose", value)} />
                      <Field label="Cuando" value={item.timing} onChange={(value) => updateSupplement(item.id, "timing", value)} />
                    </div>
                    <label className="field top-8">
                      <span>Nota</span>
                      <textarea className="input" rows={2} value={item.note} onChange={(event) => updateSupplement(item.id, "note", event.target.value)} />
                    </label>
                    <button className="btn btn-danger top-8" type="button" onClick={() => removeSupplement(item.id)}>Borrar suplemento</button>
                  </>
                ) : (
                  <>
                    <div className="row space-between wrap">
                      <h4>{item.name}</h4>
                      <span className="pill">{item.status}</span>
                    </div>
                    <p className="muted top-6">{item.dose} - {item.timing}</p>
                    <p className="muted top-6">{item.note}</p>
                  </>
                )}
              </article>
            ))}
          </div>
        </section>
      )}

      {tab === "config" && (
        <section className="panel">
          <h2>Configuración</h2>
          <article className="card top-10">
            <h4>Perfil y metas</h4>
            <div className="grid-two top-8">
              <Field label="Nombre app" value={state.settings.appName} onChange={(value) => updateSetting("appName", value)} />
              <Field label="Nombre perfil" value={state.settings.profileName} onChange={(value) => updateSetting("profileName", value)} />
              <Field label="Peso inicio" type="number" step="0.1" value={state.settings.startWeight} onChange={(value) => updateSettingNumber("startWeight", value)} />
              <Field label="Peso meta" type="number" step="0.1" value={state.settings.goalWeight} onChange={(value) => updateSettingNumber("goalWeight", value)} />
              <Field label="Ayuno" value={state.settings.fastingWindow} onChange={(value) => updateSetting("fastingWindow", value)} />
              <Field label="Horario gym" value={state.settings.trainingWindow} onChange={(value) => updateSetting("trainingWindow", value)} />
              <Field label="Calorías" type="number" value={state.settings.calories} onChange={(value) => updateSettingNumber("calories", value)} />
              <Field label="Proteína" type="number" value={state.settings.protein} onChange={(value) => updateSettingNumber("protein", value)} />
              <Field label="Carbos" type="number" value={state.settings.carbs} onChange={(value) => updateSettingNumber("carbs", value)} />
              <Field label="Grasas" type="number" value={state.settings.fats} onChange={(value) => updateSettingNumber("fats", value)} />
              <Field label="Cardio semanal (min)" type="number" value={state.settings.weeklyCardioMin} onChange={(value) => updateSettingNumber("weeklyCardioMin", value)} />
            </div>
            <label className="field top-8">
              <span>Nota de enfoque</span>
              <textarea className="input" rows={3} value={state.settings.focusNote} onChange={(event) => updateSetting("focusNote", event.target.value)} />
            </label>
          </article>

          <article className="card top-12">
            <h4>Proteccion de progreso</h4>
            <ul className="clean-list">
              <li>Zona horaria: UTC-6 (Ciudad de Mexico)</li>
              <li>Guardado automatico: {saveMeta.lastSavedAt ? formatDate(saveMeta.lastSavedAt) : "--"}</li>
              <li>Backups locales: {saveMeta.backupCount}</li>
              <li>Ultimo checkpoint: {saveMeta.lastBackupAt ? formatDate(new Date(saveMeta.lastBackupAt).toISOString()) : "--"}</li>
              <li>Registros por fecha: activos por cada bloque/ejercicio</li>
              <li>Modo auth: {REQUIRE_SUPABASE_AUTH ? "Supabase OTP" : "Clave local"}</li>
              <li>Clave env: {USING_FALLBACK_KEY ? "fallback activa" : "configurada"}</li>
              <li>Nube Supabase: {!CLOUD_ENABLED ? "No configurada" : cloudMeta.syncing ? "Sincronizando..." : cloudMeta.error ? "Con incidencias" : "Activa"}</li>
              {CLOUD_ENABLED && <li>Ultima sincronizacion: {cloudMeta.syncedAt ? formatDate(cloudMeta.syncedAt) : "--"}</li>}
              {CLOUD_ENABLED && <li>Cola pendiente: {cloudMeta.queueCount || 0}</li>}
              {CLOUD_ENABLED && <li>Reintentos: {cloudMeta.retries || 0}</li>}
              {REQUIRE_SUPABASE_AUTH && hasSupabaseSession && <li>Usuario: {authSession?.user?.email || authSession?.user?.id}</li>}
            </ul>
            {saveMeta.error && <p className="error-text">{saveMeta.error}</p>}
            {cloudMeta.error && <p className="error-text">{cloudMeta.error}</p>}
            {cloudMeta.conflict && (
              <div className="stack gap-8 top-8">
                <p className="error-text">Conflicto: la nube tiene cambios mas recientes.</p>
                <div className="row gap-8 wrap">
                  <button className="btn btn-soft" type="button" onClick={useCloudVersion}>Usar version nube</button>
                  <button className="btn btn-danger" type="button" onClick={overwriteCloudVersion}>Sobrescribir nube con local</button>
                </div>
              </div>
            )}
            <div className="row gap-8 wrap top-10">
              <button className="btn btn-primary" type="button" onClick={checkpoint}>Crear checkpoint</button>
              <button className="btn btn-ghost" type="button" onClick={exportBackup}>Exportar backup</button>
              <button className="btn btn-soft" type="button" onClick={exportProgressCsv}>Exportar progreso CSV</button>
              <button className="btn btn-soft" type="button" onClick={exportPrintableReport}>Imprimir / PDF</button>
              <label className="btn btn-ghost file-label">
                Importar backup
                <input type="file" accept="application/json" onChange={importBackup} />
              </label>
              <button className="btn btn-danger" type="button" onClick={resetDefaults}>Restaurar defaults</button>
            </div>
          </article>

          <article className="card top-12">
            <h4>iPhone (Safari)</h4>
            <ol className="clean-list">
              <li>Abre tu URL en Safari.</li>
              <li>Toca Compartir.</li>
              <li>Selecciona "Agregar a pantalla de inicio".</li>
              <li>Ábrela desde home como app.</li>
            </ol>
          </article>
        </section>
      )}
    </div>
  );
}

