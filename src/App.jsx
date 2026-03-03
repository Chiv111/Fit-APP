import { useCallback, useEffect, useMemo, useState } from "react";

const MAIN_STATE_KEY = "fit_app_state_v5";
const BACKUP_STATE_KEY = "fit_app_backups_v5";
const SESSION_UNLOCK_KEY = "fit_app_session_unlocked";
const AUTO_BACKUP_INTERVAL_MS = 1000 * 60 * 60 * 6;
const MAX_BACKUPS = 14;
const APP_ACCESS_KEY = (import.meta.env.VITE_APP_ACCESS_KEY || "fitapp-2026").trim();
const USING_FALLBACK_KEY = !import.meta.env.VITE_APP_ACCESS_KEY;

const COLORS = {
  accent: "#FF7A1A",
  accentSoft: "#FF7A1A33",
  good: "#00C897",
  warning: "#F3B23C",
  danger: "#FF5C5C",
};

const DEFAULT_SETTINGS = {
  name: "Sebastian",
  startWeight: 78,
  goalWeight: 68,
  fastingWindow: "16:8",
  trainingWindow: "4pm-6pm",
  calories: 1750,
  protein: 160,
  carbs: 130,
  fats: 55,
  weeklyCardioMin: 150,
  focusNote: "Consistency first. 85% compliance wins.",
};

const PLAN = [
  {
    shortDay: "LUN",
    fullDay: "Lunes",
    type: "Fuerza",
    title: "Pecho, Espalda y Triceps",
    color: "#FF7A1A",
    exercises: [
      { id: "chin", name: "Chin-ups", sets: "3-5", reps: "5-8", rest: "2-3m", note: "RIR 3-4" },
      { id: "bench", name: "Bench Press Smith", sets: "5", reps: "5", rest: "2-3m", note: "5x5 RIR 3-4" },
      { id: "fly", name: "Flys Machine", sets: "3", reps: "8-10", rest: "90s", note: "RIR 1" },
      { id: "latpull", name: "Lat Pulldown", sets: "3", reps: "8-10", rest: "90s", note: "RIR 1" },
    ],
  },
  {
    shortDay: "MAR",
    fullDay: "Martes",
    type: "Cardio",
    title: "Tempo Run",
    color: "#00C897",
    cardio: "10 rondas: 1min carrera + 1min caminata. RPE 5-6.",
  },
  {
    shortDay: "MIE",
    fullDay: "Miercoles",
    type: "Fuerza",
    title: "Lower A - Cuadriceps",
    color: "#FF7A1A",
    exercises: [
      { id: "legpress", name: "Leg Press / Back Squat", sets: "5", reps: "5", rest: "2-3m", note: "RIR 3-4" },
      { id: "hiper", name: "Hiperextension Zercher", sets: "3", reps: "6-8", rest: "2m", note: "RIR 1-2" },
      { id: "ext", name: "Extension de Pierna", sets: "3", reps: "6-8", rest: "2m", note: "RIR 1-2" },
      { id: "calf", name: "Elevacion Pantorrilla", sets: "3", reps: "8-10", rest: "2m", note: "RIR 1" },
    ],
  },
  {
    shortDay: "JUE",
    fullDay: "Jueves",
    type: "Cardio Intenso",
    title: "Hill Intervals",
    color: "#FF5C5C",
    cardio: "6 rondas: 30s sprint + recuperacion hasta 130LPM. RPE 7-8.",
  },
  {
    shortDay: "VIE",
    fullDay: "Viernes",
    type: "Fuerza",
    title: "Lower B - Gluteo y Posterior",
    color: "#FF7A1A",
    exercises: [
      { id: "dead", name: "Snatch Grip Deadlift", sets: "5", reps: "5", rest: "2-3m", note: "RIR 2-3" },
      { id: "split", name: "B-stance Split Squat", sets: "3", reps: "6-8", rest: "90s", note: "RIR 1-2" },
      { id: "bulgarian", name: "Sentadilla Bulgara", sets: "2-3", reps: "6-8", rest: "90s", note: "RIR 1-2" },
      { id: "curl", name: "Curl Pierna Unilateral", sets: "2-3", reps: "8-10", rest: "90s", note: "RIR 1" },
    ],
  },
  {
    shortDay: "SAB",
    fullDay: "Sabado",
    type: "Fuerza",
    title: "Biceps, Triceps y Antebrazo",
    color: "#FF7A1A",
    exercises: [
      { id: "skull", name: "Rompe Craneo Mancuerna", sets: "3", reps: "8-12", rest: "90s", note: "RIR 1-2" },
      { id: "closepress", name: "Press Cerrado Mancuerna", sets: "3", reps: "max", rest: "90s", note: "RIR 1-2" },
      { id: "spider", name: "Curl Spider Unilateral", sets: "3", reps: "8-12", rest: "90s", note: "RIR 1-2" },
      { id: "hang", name: "Dead Hang", sets: "3", reps: "max hold", rest: "90s", note: "RIR 0-1" },
    ],
  },
  {
    shortDay: "DOM",
    fullDay: "Domingo",
    type: "Opcional",
    title: "Zona 2 o Descanso",
    color: "#8A8F98",
    cardio: "30min bici o caminata inclinada, o descanso total.",
  },
];

const DEFAULT_APP_STATE = {
  week: 1,
  dayIndex: 0,
  settings: DEFAULT_SETTINGS,
  trainingLogs: {},
  weightLogs: [],
};

function safeParse(raw, fallback) {
  try {
    const parsed = JSON.parse(raw);
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

function mergeSettings(candidate) {
  return { ...DEFAULT_SETTINGS, ...(candidate || {}) };
}

function normalizeState(candidate) {
  return {
    week: Math.max(1, Number(candidate?.week) || 1),
    dayIndex: Math.min(Math.max(Number(candidate?.dayIndex) || 0, 0), PLAN.length - 1),
    settings: mergeSettings(candidate?.settings),
    trainingLogs: typeof candidate?.trainingLogs === "object" && candidate?.trainingLogs ? candidate.trainingLogs : {},
    weightLogs: Array.isArray(candidate?.weightLogs) ? candidate.weightLogs : [],
  };
}

function isStateShape(candidate) {
  return Boolean(candidate && typeof candidate === "object" && candidate.settings && candidate.trainingLogs && candidate.weightLogs);
}

function loadStoredState() {
  const fromMain = safeParse(window.localStorage.getItem(MAIN_STATE_KEY), null);
  if (isStateShape(fromMain)) return normalizeState(fromMain);

  const backups = safeParse(window.localStorage.getItem(BACKUP_STATE_KEY), []);
  if (Array.isArray(backups)) {
    for (let index = backups.length - 1; index >= 0; index -= 1) {
      const snapshot = backups[index]?.snapshot;
      if (isStateShape(snapshot)) return normalizeState(snapshot);
    }
  }

  return normalizeState(DEFAULT_APP_STATE);
}

function saveStoredState(state, options = {}) {
  const now = Date.now();
  const payload = {
    ...state,
    settings: mergeSettings(state.settings),
    updatedAt: new Date(now).toISOString(),
    version: 5,
  };

  try {
    window.localStorage.setItem(MAIN_STATE_KEY, JSON.stringify(payload));
  } catch {
    return {
      backupCount: 0,
      lastBackupAt: null,
      lastSavedAt: null,
      saveError: "No se pudo guardar en localStorage.",
    };
  }

  const backups = safeParse(window.localStorage.getItem(BACKUP_STATE_KEY), []);
  const lastBackup = backups[backups.length - 1];
  const shouldBackup =
    options.forceBackup ||
    !lastBackup ||
    now - Number(lastBackup.timestamp || 0) > AUTO_BACKUP_INTERVAL_MS;

  let nextBackups = backups;
  if (shouldBackup) {
    nextBackups = [...backups, { timestamp: now, snapshot: payload }];
    if (nextBackups.length > MAX_BACKUPS) nextBackups = nextBackups.slice(-MAX_BACKUPS);
    try {
      window.localStorage.setItem(BACKUP_STATE_KEY, JSON.stringify(nextBackups));
    } catch {
      // Keep main save even if backup write fails.
    }
  }

  return {
    backupCount: Array.isArray(nextBackups) ? nextBackups.length : 0,
    lastBackupAt: nextBackups[nextBackups.length - 1]?.timestamp || null,
    lastSavedAt: payload.updatedAt,
    saveError: null,
  };
}

function getStorageMeta() {
  const backups = safeParse(window.localStorage.getItem(BACKUP_STATE_KEY), []);
  const main = safeParse(window.localStorage.getItem(MAIN_STATE_KEY), null);
  return {
    backupCount: Array.isArray(backups) ? backups.length : 0,
    lastBackupAt: Array.isArray(backups) && backups.length ? backups[backups.length - 1].timestamp : null,
    lastSavedAt: main?.updatedAt || null,
    saveError: null,
  };
}

function workoutKey(week, dayIndex, exerciseId) {
  return `w${week}_d${dayIndex}_${exerciseId}`;
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function formatDateLabel(value) {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("es-MX", { year: "numeric", month: "short", day: "numeric" });
}

function averageWeight(sets) {
  if (!sets.length) return null;
  const sum = sets.reduce((acc, item) => acc + (Number(item.weight) || 0), 0);
  return sum / sets.length;
}

function AccessGate({ onUnlock }) {
  const [input, setInput] = useState("");
  const [error, setError] = useState("");

  const submit = (event) => {
    event.preventDefault();
    if (input.trim() === APP_ACCESS_KEY) {
      onUnlock();
      return;
    }
    setError("Clave invalida.");
  };

  return (
    <div className="gate-shell">
      <div className="gate-noise" />
      <form className="gate-card fade-in" onSubmit={submit}>
        <p className="gate-kicker">PRIVATE MODE</p>
        <h1 className="gate-title">Fit App Lock</h1>
        <p className="gate-text">
          Ingresa tu clave para abrir tu dashboard de progreso.
        </p>
        <input
          className="input input-lg"
          type="password"
          value={input}
          onChange={(event) => {
            setInput(event.target.value);
            if (error) setError("");
          }}
          placeholder="Clave de acceso"
          autoFocus
        />
        {error && <div className="error-text">{error}</div>}
        <button className="btn btn-primary btn-lg" type="submit">
          Entrar
        </button>
        <p className="tiny-note">
          Clave desde <code>VITE_APP_ACCESS_KEY</code>
          {USING_FALLBACK_KEY ? " (fallback activo)" : ""}.
        </p>
      </form>
    </div>
  );
}

function InputField({ label, value, onChange, type = "text", step, placeholder }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <input
        className="input"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        type={type}
        step={step}
        placeholder={placeholder}
      />
    </label>
  );
}

function StatCard({ label, value, detail, tone = "accent" }) {
  return (
    <article className={`stat-card tone-${tone}`}>
      <p className="stat-label">{label}</p>
      <p className="stat-value">{value}</p>
      <p className="stat-detail">{detail}</p>
    </article>
  );
}

function ExerciseCard({ exercise, sets, onAdd }) {
  const [weight, setWeight] = useState("");
  const [reps, setReps] = useState("");

  const addSet = () => {
    const parsedWeight = Number(weight);
    const parsedReps = Number(reps);
    if (Number.isNaN(parsedWeight) || Number.isNaN(parsedReps) || parsedWeight <= 0 || parsedReps <= 0) return;
    onAdd({ weight: parsedWeight, reps: parsedReps });
    setWeight("");
    setReps("");
  };

  return (
    <article className="exercise-card">
      <div className="exercise-header">
        <h4>{exercise.name}</h4>
        <span className="chip chip-accent">
          {exercise.sets} x {exercise.reps}
        </span>
      </div>
      <p className="exercise-meta">
        Descanso: {exercise.rest} · {exercise.note}
      </p>

      {sets.length > 0 && (
        <div className="set-list">
          {sets.map((entry, index) => (
            <span key={`${exercise.id}-${entry.timestamp}-${index}`} className="chip">
              S{index + 1}: {entry.weight}kg x {entry.reps}
            </span>
          ))}
        </div>
      )}

      <div className="exercise-actions">
        <input
          className="input input-small"
          type="number"
          value={weight}
          onChange={(event) => setWeight(event.target.value)}
          placeholder="kg"
          step="0.5"
          inputMode="decimal"
        />
        <input
          className="input input-small"
          type="number"
          value={reps}
          onChange={(event) => setReps(event.target.value)}
          placeholder="reps"
          step="1"
          inputMode="numeric"
        />
        <button className="btn btn-primary" type="button" onClick={addSet}>
          Guardar set
        </button>
      </div>
    </article>
  );
}

export default function App() {
  const [state, setState] = useState(() => loadStoredState());
  const [tab, setTab] = useState("rutina");
  const [saveMeta, setSaveMeta] = useState(() => getStorageMeta());
  const [weightForm, setWeightForm] = useState({ date: todayISO(), weight: "", waist: "" });
  const [isUnlocked, setIsUnlocked] = useState(() => window.sessionStorage.getItem(SESSION_UNLOCK_KEY) === "1");

  useEffect(() => {
    if (navigator.storage?.persist) {
      navigator.storage.persist().catch(() => {
        // Ignore unsupported persistence API failures.
      });
    }
  }, []);

  useEffect(() => {
    const nextMeta = saveStoredState(state);
    setSaveMeta(nextMeta);
  }, [state]);

  const unlock = () => {
    window.sessionStorage.setItem(SESSION_UNLOCK_KEY, "1");
    setIsUnlocked(true);
  };

  const lockSession = () => {
    window.sessionStorage.removeItem(SESSION_UNLOCK_KEY);
    setIsUnlocked(false);
  };

  const selectedDay = PLAN[state.dayIndex];
  const sortedWeightLogs = useMemo(
    () => [...state.weightLogs].sort((a, b) => b.date.localeCompare(a.date)),
    [state.weightLogs]
  );

  const latestWeight = sortedWeightLogs.length
    ? Number(sortedWeightLogs[0].weight)
    : Number(state.settings.startWeight) || 0;
  const deltaFromStart = latestWeight - Number(state.settings.startWeight || 0);
  const remainingToGoal = latestWeight - Number(state.settings.goalWeight || 0);

  const totalSetsLogged = useMemo(
    () => Object.values(state.trainingLogs).reduce((acc, sets) => acc + sets.length, 0),
    [state.trainingLogs]
  );

  const updateSettings = (field, value) => {
    setState((prev) => ({
      ...prev,
      settings: { ...prev.settings, [field]: value },
    }));
  };

  const updateNumericSetting = (field, value) => {
    const parsed = Number(value);
    if (Number.isNaN(parsed)) return;
    updateSettings(field, parsed);
  };

  const addWorkoutSet = useCallback((dayIndex, exerciseId, payload) => {
    setState((prev) => {
      const key = workoutKey(prev.week, dayIndex, exerciseId);
      const nextSets = [...(prev.trainingLogs[key] || []), { ...payload, timestamp: Date.now() }];
      return {
        ...prev,
        trainingLogs: { ...prev.trainingLogs, [key]: nextSets },
      };
    });
  }, []);

  const addWeightEntry = () => {
    const date = weightForm.date;
    const weight = Number(weightForm.weight);
    const waist = weightForm.waist === "" ? null : Number(weightForm.waist);
    if (!date || Number.isNaN(weight) || weight <= 0) return;

    setState((prev) => ({
      ...prev,
      weightLogs: [
        ...prev.weightLogs,
        {
          id: Date.now(),
          date,
          weight,
          waist: Number.isNaN(waist) ? null : waist,
          timestamp: Date.now(),
        },
      ],
    }));
    setWeightForm((prev) => ({ ...prev, weight: "", waist: "" }));
  };

  const exportBackup = () => {
    const payload = {
      exportedAt: new Date().toISOString(),
      app: "fit-app-v5",
      state,
      backups: safeParse(window.localStorage.getItem(BACKUP_STATE_KEY), []),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `fit-app-backup-${todayISO()}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const importBackup = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const raw = await file.text();
      const parsed = safeParse(raw, null);
      const nextState = normalizeState(parsed?.state || parsed);
      setState(nextState);
      saveStoredState(nextState, { forceBackup: true });
      setSaveMeta(getStorageMeta());
      window.alert("Backup importado correctamente.");
    } catch {
      window.alert("No se pudo importar el backup.");
    } finally {
      event.target.value = "";
    }
  };

  const forceCheckpoint = () => {
    const meta = saveStoredState(state, { forceBackup: true });
    setSaveMeta(meta);
  };

  const latestBackupDate = saveMeta.lastBackupAt ? formatDateLabel(new Date(saveMeta.lastBackupAt).toISOString()) : "--";

  if (!isUnlocked) {
    return <AccessGate onUnlock={unlock} />;
  }

  return (
    <div className="app-shell">
      <div className="bg-orb bg-orb-one" />
      <div className="bg-orb bg-orb-two" />

      <header className="hero fade-in">
        <div>
          <p className="kicker">PRIVATE TRAINING DASHBOARD</p>
          <h1>
            {state.settings.name}
            <span> Fit</span>
          </h1>
          <p className="hero-subtitle">
            {latestWeight.toFixed(1)}kg actual · meta {state.settings.goalWeight}kg · ayuno {state.settings.fastingWindow}
          </p>
        </div>
        <button className="btn btn-ghost" onClick={lockSession} type="button">
          Bloquear
        </button>
      </header>

      <section className="stats-grid fade-in delay-1">
        <StatCard label="Peso Actual" value={`${latestWeight.toFixed(1)}kg`} detail={`Inicio: ${state.settings.startWeight}kg`} tone="accent" />
        <StatCard label="Cambio Total" value={`${deltaFromStart > 0 ? "+" : ""}${deltaFromStart.toFixed(1)}kg`} detail="Desde inicio" tone={deltaFromStart <= 0 ? "good" : "danger"} />
        <StatCard label="A Meta" value={`${remainingToGoal > 0 ? "+" : ""}${remainingToGoal.toFixed(1)}kg`} detail={`Objetivo: ${state.settings.goalWeight}kg`} tone={remainingToGoal <= 0 ? "good" : "warning"} />
        <StatCard label="Sets Guardados" value={`${totalSetsLogged}`} detail={`Semana actual: ${state.week}`} tone="good" />
      </section>

      <nav className="tab-row fade-in delay-2">
        {[
          ["rutina", "Rutina"],
          ["progreso", "Progreso"],
          ["nutricion", "Nutricion"],
          ["config", "Config"],
        ].map(([id, label]) => (
          <button
            key={id}
            className={`tab-button ${tab === id ? "active" : ""}`}
            onClick={() => setTab(id)}
            type="button"
          >
            {label}
          </button>
        ))}
      </nav>

      {tab === "rutina" && (
        <section className="panel fade-in delay-2">
          <div className="panel-header">
            <h2>Plan Semanal</h2>
            <div className="week-controls">
              <button
                className="btn btn-ghost"
                type="button"
                onClick={() => setState((prev) => ({ ...prev, week: Math.max(1, prev.week - 1) }))}
              >
                Semana -
              </button>
              <span className="week-label">Semana {state.week}</span>
              <button
                className="btn btn-ghost"
                type="button"
                onClick={() => setState((prev) => ({ ...prev, week: prev.week + 1 }))}
              >
                Semana +
              </button>
            </div>
          </div>

          <div className="day-row">
            {PLAN.map((day, index) => {
              const hasLogs =
                day.exercises?.some((exercise) => {
                  const key = workoutKey(state.week, index, exercise.id);
                  return (state.trainingLogs[key] || []).length > 0;
                }) || false;

              return (
                <button
                  key={day.shortDay}
                  className={`day-chip ${state.dayIndex === index ? "active" : ""}`}
                  type="button"
                  onClick={() => setState((prev) => ({ ...prev, dayIndex: index }))}
                >
                  <span>{day.shortDay}</span>
                  {hasLogs && <i className="dot" />}
                </button>
              );
            })}
          </div>

          <article className="focus-card">
            <p className="focus-kicker">
              {selectedDay.fullDay} · {selectedDay.type}
            </p>
            <h3>{selectedDay.title}</h3>
            <p className="focus-detail">
              Ventana gym: {state.settings.trainingWindow} · Cardio objetivo semanal: {state.settings.weeklyCardioMin}min
            </p>
          </article>

          {selectedDay.cardio && (
            <article className="card">
              <h4>Bloque Cardio</h4>
              <p className="muted">{selectedDay.cardio}</p>
            </article>
          )}

          {selectedDay.exercises?.map((exercise) => {
            const key = workoutKey(state.week, state.dayIndex, exercise.id);
            const sets = state.trainingLogs[key] || [];
            const previous = state.week > 1 ? state.trainingLogs[workoutKey(state.week - 1, state.dayIndex, exercise.id)] || [] : [];
            const currentAvg = averageWeight(sets);
            const previousAvg = averageWeight(previous);
            const trend =
              currentAvg !== null && previousAvg !== null ? `${(currentAvg - previousAvg).toFixed(1)}kg vs sem anterior` : null;

            return (
              <div key={exercise.id} className="stagger-item">
                <ExerciseCard
                  exercise={exercise}
                  sets={sets}
                  onAdd={(payload) => addWorkoutSet(state.dayIndex, exercise.id, payload)}
                />
                {trend && (
                  <p className={`trend ${currentAvg - previousAvg >= 0 ? "trend-up" : "trend-down"}`}>
                    {currentAvg - previousAvg >= 0 ? "+" : ""}
                    {trend}
                  </p>
                )}
              </div>
            );
          })}
        </section>
      )}

      {tab === "progreso" && (
        <section className="panel fade-in delay-2">
          <div className="panel-header">
            <h2>Progreso Corporal</h2>
            <p className="muted">Tus registros quedan persistidos y respaldados.</p>
          </div>

          <div className="form-grid">
            <InputField
              label="Fecha"
              type="date"
              value={weightForm.date}
              onChange={(value) => setWeightForm((prev) => ({ ...prev, date: value }))}
            />
            <InputField
              label="Peso (kg)"
              type="number"
              step="0.1"
              value={weightForm.weight}
              onChange={(value) => setWeightForm((prev) => ({ ...prev, weight: value }))}
              placeholder="78.3"
            />
            <InputField
              label="Cintura (cm)"
              type="number"
              step="0.1"
              value={weightForm.waist}
              onChange={(value) => setWeightForm((prev) => ({ ...prev, waist: value }))}
              placeholder="Opcional"
            />
          </div>
          <button className="btn btn-primary" type="button" onClick={addWeightEntry}>
            Guardar registro
          </button>

          <article className="card chart-card">
            <h4>Ultimos registros</h4>
            {sortedWeightLogs.length === 0 && <p className="muted">Aun no hay registros.</p>}
            {sortedWeightLogs.length > 0 && (
              <>
                <div className="weight-chart">
                  {sortedWeightLogs.slice(0, 12).reverse().map((entry) => {
                    const base = Number(state.settings.goalWeight) || 1;
                    const barHeight = Math.max(12, Math.min(92, (Number(entry.weight) / base) * 65));
                    return (
                      <div className="weight-bar-wrap" key={entry.id}>
                        <div className="weight-bar" style={{ height: `${barHeight}%` }} />
                        <span>{String(entry.weight)}</span>
                      </div>
                    );
                  })}
                </div>

                <div className="log-list">
                  {sortedWeightLogs.slice(0, 18).map((entry) => (
                    <div className="log-row" key={entry.id}>
                      <strong>{entry.weight}kg</strong>
                      <span>
                        {formatDateLabel(entry.date)}
                        {entry.waist ? ` · cintura ${entry.waist}cm` : ""}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </article>
        </section>
      )}

      {tab === "nutricion" && (
        <section className="panel fade-in delay-2">
          <div className="panel-header">
            <h2>Nutricion y timing</h2>
            <p className="muted">Macros alineados a tus metas actuales.</p>
          </div>

          <div className="stats-grid compact">
            <StatCard label="Calorias" value={`${state.settings.calories}`} detail="kcal / dia" tone="accent" />
            <StatCard label="Proteina" value={`${state.settings.protein}g`} detail="Prioridad #1" tone="good" />
            <StatCard label="Carbos" value={`${state.settings.carbs}g`} detail="Rendimiento" tone="warning" />
            <StatCard label="Grasas" value={`${state.settings.fats}g`} detail="Hormonal" tone="warning" />
          </div>

          <article className="card">
            <h4>Bloques diarios</h4>
            <ul className="clean-list">
              <li>Desayuno fuerte: proteina alta + carbos limpios.</li>
              <li>Entreno en: {state.settings.trainingWindow}.</li>
              <li>Cena post-gym: proteina completa + verduras.</li>
              <li>Ayuno: {state.settings.fastingWindow} en dias normales.</li>
            </ul>
          </article>

          <article className="card">
            <h4>Nota personal</h4>
            <p className="muted">{state.settings.focusNote || "Sin nota configurada."}</p>
          </article>
        </section>
      )}

      {tab === "config" && (
        <section className="panel fade-in delay-2">
          <div className="panel-header">
            <h2>Configuracion</h2>
            <p className="muted">Control total de perfil, seguridad y respaldo.</p>
          </div>

          <article className="card">
            <h4>Perfil y metas</h4>
            <div className="form-grid">
              <InputField label="Nombre" value={state.settings.name} onChange={(value) => updateSettings("name", value)} />
              <InputField
                label="Peso inicial (kg)"
                type="number"
                step="0.1"
                value={state.settings.startWeight}
                onChange={(value) => updateNumericSetting("startWeight", value)}
              />
              <InputField
                label="Peso meta (kg)"
                type="number"
                step="0.1"
                value={state.settings.goalWeight}
                onChange={(value) => updateNumericSetting("goalWeight", value)}
              />
              <InputField label="Ayuno" value={state.settings.fastingWindow} onChange={(value) => updateSettings("fastingWindow", value)} />
              <InputField label="Horario gym" value={state.settings.trainingWindow} onChange={(value) => updateSettings("trainingWindow", value)} />
              <InputField
                label="Cardio semanal (min)"
                type="number"
                value={state.settings.weeklyCardioMin}
                onChange={(value) => updateNumericSetting("weeklyCardioMin", value)}
              />
            </div>
          </article>

          <article className="card">
            <h4>Macros</h4>
            <div className="form-grid">
              <InputField
                label="Calorias"
                type="number"
                value={state.settings.calories}
                onChange={(value) => updateNumericSetting("calories", value)}
              />
              <InputField
                label="Proteina (g)"
                type="number"
                value={state.settings.protein}
                onChange={(value) => updateNumericSetting("protein", value)}
              />
              <InputField
                label="Carbos (g)"
                type="number"
                value={state.settings.carbs}
                onChange={(value) => updateNumericSetting("carbs", value)}
              />
              <InputField
                label="Grasas (g)"
                type="number"
                value={state.settings.fats}
                onChange={(value) => updateNumericSetting("fats", value)}
              />
            </div>

            <label className="field">
              <span className="field-label">Nota enfoque</span>
              <textarea
                className="input textarea"
                value={state.settings.focusNote}
                onChange={(event) => updateSettings("focusNote", event.target.value)}
                rows={3}
              />
            </label>
          </article>

          <article className="card">
            <h4>Proteccion de progreso</h4>
            <ul className="clean-list">
              <li>Guardado automatico: {saveMeta.lastSavedAt ? formatDateLabel(saveMeta.lastSavedAt) : "--"}.</li>
              <li>Backups locales: {saveMeta.backupCount} snapshots.</li>
              <li>Ultimo checkpoint: {latestBackupDate}.</li>
              <li>Estado clave de acceso: {USING_FALLBACK_KEY ? "Fallback activo" : "Env configurada"}.</li>
            </ul>

            {saveMeta.saveError && <p className="error-text">{saveMeta.saveError}</p>}

            <div className="action-row">
              <button className="btn btn-primary" type="button" onClick={forceCheckpoint}>
                Crear checkpoint
              </button>
              <button className="btn btn-ghost" type="button" onClick={exportBackup}>
                Exportar backup
              </button>
              <label className="btn btn-ghost file-btn">
                Importar backup
                <input type="file" accept="application/json" onChange={importBackup} />
              </label>
            </div>
          </article>
        </section>
      )}
    </div>
  );
}
