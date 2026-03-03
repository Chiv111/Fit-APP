import { useEffect, useMemo, useState } from "react";

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
  focusNote: "Consistencia diaria. Progresion semanal.",
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
      { id: "lun1", name: "Chin-ups", sets: "3-5", reps: "5-8", rest: "2-3 min", note: "Progresion 5x5, RIR 3-4" },
      { id: "lun2", name: "Bench Press Smith Machine", sets: "5", reps: "5", rest: "2-3 min", note: "Progresion 5x5, RIR 3-4" },
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
      { id: "mar2", name: "Pull-ups", sets: "5", reps: "5", rest: "2-3 min", note: "Progresion 5x5, RIR 3-4" },
      { id: "mar3", name: "Press militar", sets: "5", reps: "5", rest: "2-3 min", note: "Progresion 5x5, RIR 3-4" },
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
      { id: "mie1", name: "Leg press sissy / Back squat", sets: "5", reps: "5", rest: "2-3 min", note: "Progresion 5x5, RIR 3-4" },
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
      { id: "vie1", name: "Peso muerto Snatch Grip", sets: "5", reps: "5", rest: "2-3 min", note: "Progresion 5x5, RIR 2-3" },
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
    postCardio: "Dia de cardio",
    cardioProtocol: "Ritmo 5:00-5:30 min/km. FC 130-150 LPM. RPE 4-5. Si no puedes hablar, baja ritmo.",
    exercises: [],
  },
];

const DEFAULT_DIET_MEALS = [
  {
    id: "m_des",
    title: "Desayuno",
    time: "8:00-10:00am",
    note: "Proteina alta + carbos para energia.",
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
    note: "Comida fuerte: proteina + carbos + verduras + grasa saludable.",
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
  { id: "sup_whey", status: "Opcional", name: "Whey protein", dose: "1 scoop", timing: "Solo si faltan proteinas", note: "Completar objetivo diario." },
  { id: "sup_ash", status: "Opcional", name: "Ashwagandha KSM-66", dose: "300-600mg", timing: "Con cena", note: "Si hay estres alto." },
];

const DEFAULT_STATE = {
  week: 1,
  dayIndex: 0,
  sessionDate: new Date().toISOString().slice(0, 10),
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
    let date = new Date().toISOString().slice(0, 10);
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
    sessionDate: typeof candidate?.sessionDate === "string" ? candidate.sessionDate : new Date().toISOString().slice(0, 10),
    settings: { ...DEFAULT_SETTINGS, ...(candidate?.settings || {}) },
    routine: routine.map((day, dayIndex) => ({
      id: day.id || makeId(`day${dayIndex}`),
      shortDay: day.shortDay || `D${dayIndex + 1}`,
      fullDay: day.fullDay || `Dia ${dayIndex + 1}`,
      type: day.type || "Fuerza",
      title: day.title || "Sesion",
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
          date: entry.date || new Date().toISOString().slice(0, 10),
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

function formatDate(input) {
  if (!input) return "--";
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) return String(input);
  return date.toLocaleString("es-MX", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
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
        <p className="tiny-note">
          Clave desde <code>VITE_APP_ACCESS_KEY</code>
          {USING_FALLBACK_KEY ? " (fallback activo)" : ""}.
        </p>
      </div>
    </div>
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

function ExerciseLogCard({ exercise, previous, currentSets, onAddSet, onRemoveSet }) {
  const [weight, setWeight] = useState("");
  const [reps, setReps] = useState("");

  const addSet = () => {
    const parsedWeight = Number(weight);
    const parsedReps = Number(reps);
    if (Number.isNaN(parsedWeight) || parsedWeight <= 0) return;
    if (Number.isNaN(parsedReps) || parsedReps <= 0) return;
    onAddSet(exercise.id, { weight: parsedWeight, reps: parsedReps, ts: Date.now() });
    setWeight("");
    setReps("");
  };

  return (
    <article className="exercise-card">
      <div className="exercise-head">
        <h4>{exercise.name}</h4>
        <span className="pill">{exercise.sets} x {exercise.reps}</span>
      </div>
      <p className="exercise-meta">Descanso: {exercise.rest} · {exercise.note || "sin nota"}</p>

      {previous && (
        <p className="trend">
          Ultima vez ({previous.date}): {previous.last.weight}kg x {previous.last.reps} · max {previous.max}kg
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
        <button className="btn btn-primary" type="button" onClick={addSet}>Guardar</button>
      </div>
    </article>
  );
}

export default function App() {
  const [state, setState] = useState(() => loadState());
  const [draftLogs, setDraftLogs] = useState(() => loadDrafts());
  const [saveMeta, setSaveMeta] = useState({ ok: true, error: null, backupCount: 0, lastSavedAt: null, lastBackupAt: null });
  const [tab, setTab] = useState("rutina");
  const [routineEditMode, setRoutineEditMode] = useState(false);
  const [activeExerciseCard, setActiveExerciseCard] = useState(0);
  const [routineSavedMessage, setRoutineSavedMessage] = useState("");
  const [dietEditMode, setDietEditMode] = useState(false);
  const [supplementEditMode, setSupplementEditMode] = useState(false);
  const [weightForm, setWeightForm] = useState({ date: new Date().toISOString().slice(0, 10), weight: "", waist: "" });
  const [isUnlocked, setIsUnlocked] = useState(() => safeSessionGet(SESSION_UNLOCK_KEY) === "1");

  useEffect(() => {
    if (navigator.storage?.persist) {
      navigator.storage.persist().catch(() => {
        // ignore
      });
    }
  }, []);

  useEffect(() => {
    setSaveMeta(saveState(state));
  }, [state]);

  useEffect(() => {
    saveDrafts(draftLogs);
  }, [draftLogs]);

  const unlock = () => {
    safeSessionSet(SESSION_UNLOCK_KEY, "1");
    setIsUnlocked(true);
  };

  const lock = () => {
    safeSessionRemove(SESSION_UNLOCK_KEY);
    setIsUnlocked(false);
  };

  const selectedDay = state.routine[state.dayIndex] || state.routine[0];
  const sessionDraftKey = makeDraftSessionKey(selectedDay.id, state.sessionDate);
  const sessionSavedLogs = state.trainingLogs?.[selectedDay.id]?.[state.sessionDate] || {};
  const totalRoutineCards = selectedDay.exercises.length + 1;

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

  const deltaFromStart = latestWeight - Number(state.settings.startWeight || 0);
  const toGoal = latestWeight - Number(state.settings.goalWeight || 0);

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
  }, [selectedDay.id, selectedDay.exercises.length, state.sessionDate]);

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

  const addSetDraft = (exerciseId, payload) => {
    updateSessionDraft((currentDraft) => {
      const currentSets = Array.isArray(currentDraft?.[exerciseId]) ? currentDraft[exerciseId] : [];
      return { ...currentDraft, [exerciseId]: [...currentSets, payload] };
    });
    if (routineSavedMessage) setRoutineSavedMessage("");
  };

  const removeSetDraft = (exerciseId, index) => {
    updateSessionDraft((currentDraft) => {
      const sets = [...(Array.isArray(currentDraft?.[exerciseId]) ? currentDraft[exerciseId] : [])];
      sets.splice(index, 1);
      if (sets.length > 0) return { ...currentDraft, [exerciseId]: sets };
      const nextDraft = { ...currentDraft };
      delete nextDraft[exerciseId];
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

  const finalizeRoutine = () => {
    const hasSets = selectedDay.exercises.some((exercise) => Array.isArray(sessionDraft?.[exercise.id]) && sessionDraft[exercise.id].length > 0);
    if (!hasSets && !window.confirm("No hay sets capturados. Guardar esta rutina vacia para la fecha seleccionada?")) return;

    setState((prev) => {
      const dayLogs = { ...(prev.trainingLogs[selectedDay.id] || {}) };
      const dateLogs = { ...(dayLogs[state.sessionDate] || {}) };

      selectedDay.exercises.forEach((exercise) => {
        const sets = Array.isArray(sessionDraft?.[exercise.id]) ? sessionDraft[exercise.id].map(normalizeSet) : [];
        if (sets.length > 0) dateLogs[exercise.id] = sets;
        else delete dateLogs[exercise.id];
      });

      if (Object.keys(dateLogs).length > 0) dayLogs[state.sessionDate] = dateLogs;
      else delete dayLogs[state.sessionDate];

      const nextTrainingLogs = { ...prev.trainingLogs };
      if (Object.keys(dayLogs).length > 0) nextTrainingLogs[selectedDay.id] = dayLogs;
      else delete nextTrainingLogs[selectedDay.id];

      return {
        ...prev,
        trainingLogs: nextTrainingLogs,
      };
    });

    clearSessionDraft();
    setRoutineSavedMessage(`Rutina guardada: ${selectedDay.fullDay} ${state.sessionDate}`);
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
        { id: makeId("d"), shortDay: "NEW", fullDay: "Nuevo dia", type: "Fuerza", title: "Nueva sesion", postCardio: "", cardioProtocol: "", exercises: [] },
      ];
      return { ...prev, routine, dayIndex: routine.length - 1 };
    });
  };

  const removeSelectedDay = () => {
    if (!window.confirm("Borrar este dia completo?")) return;
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

  const exportBackup = () => {
    const payload = { exportedAt: new Date().toISOString(), app: "LOCK IN", state };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `lockin-backup-${new Date().toISOString().slice(0, 10)}.json`;
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

  if (!isUnlocked) return <AccessGate onUnlock={unlock} />;

  return (
    <div className="app-shell">
      <header className="hero">
        <div>
          <p className="hero-tag">LOCK IN · PRIVATE MODE</p>
          <h1>{state.settings.appName}</h1>
          <p className="hero-sub">
            {state.settings.profileName} · {latestWeight.toFixed(1)}kg actual · Meta {state.settings.goalWeight}kg
          </p>
        </div>
        <button className="btn btn-ghost" type="button" onClick={lock}>Bloquear</button>
      </header>

      <section className="stats-grid">
        <StatCard label="Peso actual" value={`${latestWeight.toFixed(1)}kg`} meta={`Inicio ${state.settings.startWeight}kg`} tone="accent" />
        <StatCard label="Cambio total" value={`${deltaFromStart > 0 ? "+" : ""}${deltaFromStart.toFixed(1)}kg`} meta="Desde inicio" tone={deltaFromStart <= 0 ? "good" : "danger"} />
        <StatCard label="A meta" value={`${toGoal > 0 ? "+" : ""}${toGoal.toFixed(1)}kg`} meta={`Objetivo ${state.settings.goalWeight}kg`} tone={toGoal <= 0 ? "good" : "warning"} />
        <StatCard label="Sets registrados" value={`${totalSetsLogged}`} meta={`Fecha activa ${state.sessionDate}`} tone="good" />
      </section>

      <nav className="tabs">
        {[ ["rutina", "Rutina"], ["progreso", "Progreso"], ["dieta", "Dieta"], ["suplementos", "Suplementos"], ["config", "Config"] ].map(([id, label]) => (
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
            <Field label="Fecha de entrenamiento" type="date" value={state.sessionDate} onChange={setSessionDate} />
            <button className="btn btn-ghost" type="button" onClick={() => setSessionDate(new Date().toISOString().slice(0, 10))}>Usar hoy</button>
          </div>

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
            <p className="focus-kicker">{selectedDay.fullDay} · {selectedDay.type}</p>
            <h3>{selectedDay.title}</h3>
            <p className="muted">{selectedDay.postCardio || ""}</p>
            {selectedDay.cardioProtocol && <p className="muted top-6">{selectedDay.cardioProtocol}</p>}
          </article>

          <div className="row space-between wrap">
            <p className="muted">Caminata diaria con el perro: ~30 min (no cuenta como Z2).</p>
            <button className="btn btn-ghost" type="button" onClick={() => setRoutineEditMode((prev) => !prev)}>
              {routineEditMode ? "Cerrar edicion" : "Editar rutina"}
            </button>
          </div>

          {!routineEditMode && selectedDay.exercises.length > 0 && (
            <div className="top-10">
              <p className="muted small">Desliza horizontalmente para capturar cada ejercicio. La ultima card finaliza y guarda todo.</p>
              {routineSavedMessage && <p className="trend top-6">{routineSavedMessage}</p>}

              <div className="swipe-progress top-8">
                {Array.from({ length: totalRoutineCards }).map((_, index) => (
                  <span key={`dot_${index}`} className={`swipe-dot ${index === activeExerciseCard ? "active" : ""}`} />
                ))}
              </div>

              <div key={`swipe_${selectedDay.id}_${state.sessionDate}`} className="swipe-track top-8" onScroll={onRoutineTrackScroll}>
                {selectedDay.exercises.map((exercise) => {
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
                      />
                    </div>
                  );
                })}

                <div className="swipe-slide">
                  <article className="exercise-card">
                    <h4>Finalizar rutina</h4>
                    <p className="muted top-6">{selectedDay.fullDay} · {selectedDay.title}</p>
                    <p className="muted top-6">Fecha: {state.sessionDate}</p>
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
              <p className="muted">Dia de cardio. Si quieres agregar ejercicios en este bloque, activa "Editar rutina".</p>
            </article>
          )}

          {routineEditMode && (
            <div className="stack gap-12 top-12">
              <article className="card">
                <h4>Editar dia</h4>
                <div className="grid-two top-8">
                  <Field label="Etiqueta corta" value={selectedDay.shortDay} onChange={(value) => updateSelectedDay("shortDay", value)} />
                  <Field label="Dia completo" value={selectedDay.fullDay} onChange={(value) => updateSelectedDay("fullDay", value)} />
                  <Field label="Tipo" value={selectedDay.type} onChange={(value) => updateSelectedDay("type", value)} />
                  <Field label="Titulo" value={selectedDay.title} onChange={(value) => updateSelectedDay("title", value)} />
                  <Field label="Post-cardio" value={selectedDay.postCardio} onChange={(value) => updateSelectedDay("postCardio", value)} />
                </div>
                <label className="field top-8">
                  <span>Protocolo cardio (si aplica)</span>
                  <textarea className="input" rows={3} value={selectedDay.cardioProtocol} onChange={(event) => updateSelectedDay("cardioProtocol", event.target.value)} />
                </label>
                <div className="row gap-8 wrap top-8">
                  <button className="btn btn-primary" type="button" onClick={addRoutineDay}>Agregar dia</button>
                  <button className="btn btn-danger" type="button" onClick={removeSelectedDay}>Borrar dia</button>
                </div>
              </article>

              <article className="card">
                <div className="row space-between wrap">
                  <h4>Editar ejercicios</h4>
                  <button className="btn btn-primary" type="button" onClick={addExercise}>Agregar ejercicio</button>
                </div>
                {selectedDay.exercises.length === 0 && <p className="muted top-8">Sin ejercicios en este dia.</p>}
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

      {tab === "progreso" && (
        <section className="panel">
          <h2>Progreso</h2>
          <div className="grid-three top-8">
            <Field label="Fecha" type="date" value={weightForm.date} onChange={(value) => setWeightForm((prev) => ({ ...prev, date: value }))} />
            <Field label="Peso (kg)" type="number" step="0.1" value={weightForm.weight} onChange={(value) => setWeightForm((prev) => ({ ...prev, weight: value }))} placeholder="78.3" />
            <Field label="Cintura (cm)" type="number" step="0.1" value={weightForm.waist} onChange={(value) => setWeightForm((prev) => ({ ...prev, waist: value }))} placeholder="Opcional" />
          </div>
          <button className="btn btn-primary top-8" type="button" onClick={addWeightLog}>Guardar peso</button>

          <article className="card top-12">
            <h4>Historial de peso corporal</h4>
            {sortedWeightLogs.length === 0 && <p className="muted top-8">Aun no hay registros.</p>}
            <div className="stack gap-8 top-8">
              {sortedWeightLogs.map((entry) => (
                <div key={entry.id} className="log-row">
                  <div>
                    <strong>{entry.weight}kg</strong>
                    <p className="muted small">{entry.date}{entry.waist !== null ? ` · cintura ${entry.waist}cm` : ""}</p>
                  </div>
                  <button className="btn btn-danger" type="button" onClick={() => removeWeightLog(entry.id)}>Borrar</button>
                </div>
              ))}
            </div>
          </article>

          <article className="card top-12">
            <h4>Progreso por bloque y ejercicio</h4>
            <div className="stack gap-10 top-8">
              {state.routine.map((day) => {
                const exercisesWithHistory = day.exercises
                  .map((exercise) => ({ exercise, history: getExerciseHistory(state.trainingLogs, day.id, exercise.id) }))
                  .filter((entry) => entry.history.length > 0);

                if (!exercisesWithHistory.length) return null;

                return (
                  <div key={day.id} className="exercise-editor">
                    <h5>{day.fullDay} · {day.title}</h5>
                    <div className="stack gap-8 top-8">
                      {exercisesWithHistory.map(({ exercise, history }) => (
                        <div key={exercise.id} className="dish-card">
                          <strong>{exercise.name}</strong>
                          <div className="stack gap-8 top-6">
                            {history.map((entry) => (
                              <p key={`${exercise.id}_${entry.date}`} className="muted small">
                                {entry.date}: max {entry.max}kg · promedio {entry.avg?.toFixed(1)}kg · sets {entry.sets.length}
                              </p>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </article>
        </section>
      )}

      {tab === "dieta" && (
        <section className="panel">
          <div className="row space-between wrap">
            <h2>Dieta</h2>
            <button className="btn btn-ghost" type="button" onClick={() => setDietEditMode((prev) => !prev)}>
              {dietEditMode ? "Cerrar edicion" : "Editar dieta"}
            </button>
          </div>

          <div className="stats-grid compact top-10">
            <StatCard label="Calorias" value={`${state.settings.calories}`} meta="kcal/dia" tone="accent" />
            <StatCard label="Proteina" value={`${state.settings.protein}g`} meta="Objetivo" tone="good" />
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
                      <Field label="Titulo" value={meal.title} onChange={(value) => updateMeal(meal.id, "title", value)} />
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
                            <span>Descripcion</span>
                            <textarea className="input" rows={2} value={option.description} onChange={(event) => updateDish(meal.id, option.id, "description", event.target.value)} />
                          </label>
                          <button className="btn btn-danger top-6" type="button" onClick={() => removeDish(meal.id, option.id)}>Borrar platillo</button>
                        </>
                      ) : (
                        <>
                          <h5>{option.name}</h5>
                          <p className="muted small">{option.kcal} kcal · P {option.protein}g · C {option.carbs}g · G {option.fats}g</p>
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
            <h2>Suplementacion</h2>
            <button className="btn btn-ghost" type="button" onClick={() => setSupplementEditMode((prev) => !prev)}>
              {supplementEditMode ? "Cerrar edicion" : "Editar suplementacion"}
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
                    <p className="muted top-6">{item.dose} · {item.timing}</p>
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
          <h2>Configuracion</h2>
          <article className="card top-10">
            <h4>Perfil y metas</h4>
            <div className="grid-two top-8">
              <Field label="Nombre app" value={state.settings.appName} onChange={(value) => updateSetting("appName", value)} />
              <Field label="Nombre perfil" value={state.settings.profileName} onChange={(value) => updateSetting("profileName", value)} />
              <Field label="Peso inicio" type="number" step="0.1" value={state.settings.startWeight} onChange={(value) => updateSettingNumber("startWeight", value)} />
              <Field label="Peso meta" type="number" step="0.1" value={state.settings.goalWeight} onChange={(value) => updateSettingNumber("goalWeight", value)} />
              <Field label="Ayuno" value={state.settings.fastingWindow} onChange={(value) => updateSetting("fastingWindow", value)} />
              <Field label="Horario gym" value={state.settings.trainingWindow} onChange={(value) => updateSetting("trainingWindow", value)} />
              <Field label="Calorias" type="number" value={state.settings.calories} onChange={(value) => updateSettingNumber("calories", value)} />
              <Field label="Proteina" type="number" value={state.settings.protein} onChange={(value) => updateSettingNumber("protein", value)} />
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
              <li>Guardado automatico: {saveMeta.lastSavedAt ? formatDate(saveMeta.lastSavedAt) : "--"}</li>
              <li>Backups locales: {saveMeta.backupCount}</li>
              <li>Ultimo checkpoint: {saveMeta.lastBackupAt ? formatDate(new Date(saveMeta.lastBackupAt).toISOString()) : "--"}</li>
              <li>Registros por fecha: activos por cada bloque/ejercicio</li>
              <li>Clave env: {USING_FALLBACK_KEY ? "fallback activa" : "configurada"}</li>
            </ul>
            {saveMeta.error && <p className="error-text">{saveMeta.error}</p>}
            <div className="row gap-8 wrap top-10">
              <button className="btn btn-primary" type="button" onClick={checkpoint}>Crear checkpoint</button>
              <button className="btn btn-ghost" type="button" onClick={exportBackup}>Exportar backup</button>
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
              <li>Abrela desde home como app.</li>
            </ol>
          </article>
        </section>
      )}
    </div>
  );
}
