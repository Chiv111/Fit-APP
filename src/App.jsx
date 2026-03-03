import { useCallback, useEffect, useMemo, useState } from "react";

const ORANGE = "#FF6B2B";
const GREEN = "#00C9A7";
const YELLOW = "#FFB800";
const RED = "#FF3B3B";
const GRAY = "#6B7280";

const STORAGE_KEYS = {
  trainingLogs: "sebfit-training-v2",
  settings: "sebfit-settings-v1",
  weightLogs: "sebfit-weight-v1",
};

const DEFAULT_SETTINGS = {
  profileName: "Sebastian",
  startWeight: 78,
  targetWeight: 68,
  fastingWindow: "16:8",
  trainingWindow: "4-6pm",
  dailyCalories: 1750,
  protein: 160,
  carbs: 130,
  fats: 55,
  cardioGoalMin: 150,
  notes: "Cumplir 85% del plan semanal.",
};

const PLAN = [
  {
    day: "LUN",
    full: "Lunes",
    type: "Fuerza",
    title: "Pecho, Espalda y Triceps",
    color: ORANGE,
    exercises: [
      { id: "chin", name: "Chin-ups", sets: "3-5", reps: "5-8", rest: "2-3min", note: "Prog. pullups RIR 3-4" },
      { id: "bench", name: "Bench Press Smith", sets: "5", reps: "5", rest: "2-3min", note: "5x5 RIR 3-4" },
      { sep: true, label: "Biserie A" },
      { id: "tprono", name: "Elevaciones T prono", sets: "3", reps: "6-8", rest: "0s", note: "RIR 2" },
      { id: "diamante", name: "Lagartija diamante", sets: "4", reps: "1min/30s", rest: "90s-2min", note: "Con lastre RIR 2" },
      { sep: true, label: "Biserie B" },
      { id: "flys", name: "Flys pecho maquina", sets: "3", reps: "8-10", rest: "0s", note: "RIR 1" },
      { id: "latpull", name: "Lat pulldown conv.", sets: "3", reps: "8-10", rest: "90s-2min", note: "RIR 1" },
      { sep: true, label: "Biserie C" },
      { id: "triangle", name: "Pulldown triangulo", sets: "3", reps: "10-12", rest: "0s", note: "RIR 1" },
      { id: "pressaround", name: "Press around inf.", sets: "3", reps: "10-12", rest: "90s-2min", note: "RIR 1" },
    ],
  },
  {
    day: "MAR",
    full: "Martes",
    type: "Cardio",
    title: "Carrera tempo moderada",
    color: GREEN,
    cardio: {
      rpe: "5-6/10",
      desc: "10 rondas: 1min carrera + 1min caminata",
      note: "En cinta: subir inclinacion durante caminata.",
    },
  },
  {
    day: "MIE",
    full: "Miercoles",
    type: "Fuerza",
    title: "Lower A - Cuadriceps",
    color: ORANGE,
    exercises: [
      { id: "legpress", name: "Leg press / Back squat", sets: "5", reps: "5", rest: "2-3min", note: "5x5 RIR 3-4" },
      { id: "hiperext", name: "Hiperextension 45 zercher", sets: "3", reps: "6-8", rest: "2-3min", note: "RIR 1-2" },
      { id: "extpierna", name: "Extensiones pierna iso", sets: "3", reps: "6-8", rest: "2-3min", note: "RIR 1-2" },
      { id: "pgluteo", name: "Puente gluteo medio", sets: "2", reps: "8-10", rest: "2-3min", note: "RIR 1" },
      { id: "landmine", name: "Peso muerto unilat. landmine", sets: "2", reps: "8-10", rest: "2-3min", note: "RIR 1" },
      { id: "pantorrilla", name: "Elevaciones pantorrilla", sets: "3", reps: "8-10", rest: "2-3min", note: "RIR 1" },
    ],
  },
  {
    day: "JUE",
    full: "Jueves",
    type: "Cardio Intenso",
    title: "Intervalos en colina",
    color: RED,
    cardio: {
      rpe: "7-8/10",
      desc: "6 rondas: 30s sprint 80% + recupera 130LPM",
      note: "Sin colina: cinta 10-15% inclinacion.",
    },
  },
  {
    day: "VIE",
    full: "Viernes",
    type: "Fuerza",
    title: "Lower B - Gluteo y posterior",
    color: ORANGE,
    exercises: [
      { id: "snatch", name: "Peso muerto snatch grip", sets: "5", reps: "5", rest: "2-3min", note: "5x5 RIR 2-3" },
      { id: "bstance", name: "Smith b-stance split squat", sets: "3", reps: "6-8", rest: "90s-2min", note: "RIR 1-2" },
      { id: "bulgara", name: "Sentadilla bulgara gluteo", sets: "2-3", reps: "6-8", rest: "90s-2min", note: "Unilateral RIR 1-2" },
      { id: "aductores", name: "Maquina de aductores", sets: "3", reps: "30s", rest: "90s-2min", note: "RIR 1" },
      { id: "curlpierna", name: "Curl piernas acostado unilat.", sets: "2-3", reps: "8-10", rest: "90s-2min", note: "RIR 1" },
      { id: "crunchbanca", name: "Crunch banca con disco", sets: "2", reps: "8-10", rest: "90s-2min", note: "RIR 1" },
    ],
  },
  {
    day: "SAB",
    full: "Sabado",
    type: "Fuerza",
    title: "Biceps, Triceps y Antebrazo",
    color: ORANGE,
    exercises: [
      { sep: true, label: "Triserie Triceps" },
      { id: "rompecraneos", name: "Rompe craneos mancuernas", sets: "3", reps: "8-12", rest: "0s", note: "RIR 1-2" },
      { id: "pressfrance", name: "Press frances rompe narices", sets: "3", reps: "8-12", rest: "0s", note: "RIR 1-2" },
      { id: "presscerrado", name: "Press cerrado mancuernas", sets: "3", reps: "max", rest: "90s-2min", note: "RIR 1-2" },
      { sep: true, label: "Biserie Biceps" },
      { id: "curlspider", name: "Curl spider unilateral", sets: "3", reps: "8-12", rest: "0s", note: "Contra banca" },
      { id: "curlespalda", name: "Curl apoyo en espalda", sets: "3", reps: "8-12", rest: "90s-2min", note: "" },
      { sep: true, label: "Antebrazo" },
      { id: "flexmuneca", name: "Flexion de muneca", sets: "3", reps: "10-15 + hold", rest: "", note: "RIR 1-2" },
      { id: "extmuneca", name: "Extension de muneca", sets: "3", reps: "10-15 + hold", rest: "", note: "RIR 1-2" },
      { id: "deadhang", name: "Dead hang", sets: "3", reps: "max hold", rest: "", note: "RIR 0-1" },
    ],
  },
  {
    day: "DOM",
    full: "Domingo",
    type: "Opcional",
    title: "Zona 2 o descanso",
    color: GRAY,
    cardio: {
      rpe: "3-5/10",
      desc: "30 min bici / caminata inclinada / remo",
      note: "Si el cuerpo pide descanso, descansa.",
    },
  },
];

function mergeSettings(saved) {
  return { ...DEFAULT_SETTINGS, ...(saved || {}) };
}

function getTodayDate() {
  return new Date().toISOString().slice(0, 10);
}

function parseStorage(key, fallback) {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

function saveStorage(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore storage errors (private mode/quota).
  }
}

function workoutKey(week, dayIndex, exerciseId) {
  return `w${week}_d${dayIndex}_${exerciseId}`;
}

function avgWeight(sets) {
  if (!sets.length) return null;
  const total = sets.reduce((acc, item) => acc + (Number(item.w) || 0), 0);
  return total / sets.length;
}

function getCurrentWeight(weightLogs, startWeight) {
  if (!weightLogs.length) return Number(startWeight) || 0;
  const sorted = [...weightLogs].sort((a, b) => b.date.localeCompare(a.date));
  return Number(sorted[0].weight) || Number(startWeight) || 0;
}

function downloadJson(fileName, data) {
  const text = JSON.stringify(data, null, 2);
  const blob = new Blob([text], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function Pill({ children, accent }) {
  return (
    <span
      style={{
        background: accent ? `${ORANGE}18` : "#1e1e1e",
        color: accent ? ORANGE : "#777",
        borderRadius: 4,
        padding: "2px 7px",
        fontSize: 10,
        fontFamily: "monospace",
      }}
    >
      {children}
    </span>
  );
}

function MetricCard({ label, value, helper, color }) {
  return (
    <div
      style={{
        background: "#111",
        border: `1px solid ${color}22`,
        borderRadius: 10,
        padding: 14,
      }}
    >
      <div style={{ fontSize: 10, color: "#666", fontFamily: "monospace", letterSpacing: 1 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 900, color, marginTop: 3 }}>{value}</div>
      <div style={{ fontSize: 10, color: "#555", fontFamily: "monospace", marginTop: 2 }}>{helper}</div>
    </div>
  );
}

function Field({ label, value, onChange, type = "text", placeholder, min, step }) {
  return (
    <label style={{ display: "block" }}>
      <div style={{ fontSize: 10, color: "#666", fontFamily: "monospace", letterSpacing: 1, marginBottom: 5 }}>{label}</div>
      <input
        type={type}
        placeholder={placeholder}
        min={min}
        step={step}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        style={{
          width: "100%",
          background: "#111",
          border: "1px solid #252525",
          borderRadius: 8,
          padding: "9px 10px",
          color: "#f5f0e8",
          fontSize: 14,
          outline: "none",
        }}
      />
    </label>
  );
}

function ExerciseRow({ exercise, dayIndex, week, logs, onAddSet, onRemoveSet }) {
  const [weight, setWeight] = useState("");
  const [reps, setReps] = useState("");

  const key = workoutKey(week, dayIndex, exercise.id);
  const currentSets = logs[key] || [];
  const previousSets = week > 1 ? logs[workoutKey(week - 1, dayIndex, exercise.id)] || [] : [];

  const trend = useMemo(() => {
    if (!currentSets.length || !previousSets.length) return null;
    const currentAvg = avgWeight(currentSets);
    const previousAvg = avgWeight(previousSets);
    if (currentAvg === null || previousAvg === null) return null;
    const delta = currentAvg - previousAvg;
    if (delta > 0) return { label: `+${delta.toFixed(1)} kg vs sem. anterior`, color: GREEN };
    if (delta < 0) return { label: `${delta.toFixed(1)} kg vs sem. anterior`, color: RED };
    return { label: "Mismo promedio vs semana anterior", color: YELLOW };
  }, [currentSets, previousSets]);

  const handleAdd = () => {
    if (!weight || !reps) return;
    onAddSet(key, { w: weight, r: reps, ts: Date.now() });
    setWeight("");
    setReps("");
  };

  return (
    <div style={{ padding: "12px 16px", borderBottom: "1px solid #181818" }}>
      <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>{exercise.name}</div>

      <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: exercise.note ? 5 : 9 }}>
        <Pill accent>{exercise.sets} series</Pill>
        <Pill>{exercise.reps} reps</Pill>
        {exercise.rest && <Pill>{exercise.rest}</Pill>}
      </div>

      {exercise.note && (
        <div style={{ fontSize: 10, color: "#666", fontFamily: "monospace", marginBottom: 8 }}>{exercise.note}</div>
      )}

      {!!currentSets.length && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 8 }}>
          {currentSets.map((item, idx) => (
            <div
              key={idx}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 4,
                background: "#1a1a1a",
                borderRadius: 5,
                padding: "3px 8px",
              }}
            >
              <span style={{ fontSize: 11, fontFamily: "monospace", color: "#bbb" }}>
                S{idx + 1}: {item.w}kg x {item.r}
              </span>
              <button
                onClick={() => onRemoveSet(key, idx)}
                style={{ background: "none", border: "none", color: "#666", cursor: "pointer", fontSize: 13, padding: 0 }}
              >
                x
              </button>
            </div>
          ))}
        </div>
      )}

      {trend && (
        <div
          style={{
            marginBottom: 8,
            padding: "7px 9px",
            background: "#0d0d0d",
            borderRadius: 6,
            border: "1px solid #181818",
            fontFamily: "monospace",
            fontSize: 10,
            color: trend.color,
          }}
        >
          {trend.label}
        </div>
      )}

      <div style={{ background: "#0e0e0e", borderRadius: 8, padding: 10, border: "1px solid #1e1e1e" }}>
        <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 9, color: "#666", fontFamily: "monospace", letterSpacing: 1, marginBottom: 4 }}>PESO (kg)</div>
            <input
              type="number"
              inputMode="decimal"
              placeholder="ej: 40"
              value={weight}
              onChange={(event) => setWeight(event.target.value)}
              style={{
                width: "100%",
                background: "#111",
                border: "1px solid #222",
                borderRadius: 6,
                padding: "8px 10px",
                color: "#f5f0e8",
                fontSize: 15,
                outline: "none",
              }}
            />
          </div>

          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 9, color: "#666", fontFamily: "monospace", letterSpacing: 1, marginBottom: 4 }}>REPS</div>
            <input
              type="number"
              inputMode="numeric"
              placeholder="ej: 8"
              value={reps}
              onChange={(event) => setReps(event.target.value)}
              style={{
                width: "100%",
                background: "#111",
                border: "1px solid #222",
                borderRadius: 6,
                padding: "8px 10px",
                color: "#f5f0e8",
                fontSize: 15,
                outline: "none",
              }}
            />
          </div>

          <button
            onClick={handleAdd}
            style={{
              background: ORANGE,
              color: "#fff",
              border: "none",
              borderRadius: 6,
              padding: "10px 14px",
              fontSize: 12,
              fontFamily: "monospace",
              fontWeight: 700,
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            + Set
          </button>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [tab, setTab] = useState("rutina");
  const [dayIndex, setDayIndex] = useState(0);
  const [week, setWeek] = useState(1);
  const [trainingLogs, setTrainingLogs] = useState({});
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [weightLogs, setWeightLogs] = useState([]);
  const [weightForm, setWeightForm] = useState({ date: getTodayDate(), weight: "", waist: "" });
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const savedLogs = parseStorage(STORAGE_KEYS.trainingLogs, {});
    const savedSettings = mergeSettings(parseStorage(STORAGE_KEYS.settings, {}));
    const savedWeightLogs = parseStorage(STORAGE_KEYS.weightLogs, []);

    setTrainingLogs(savedLogs);
    setSettings(savedSettings);
    setWeightLogs(Array.isArray(savedWeightLogs) ? savedWeightLogs : []);
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    saveStorage(STORAGE_KEYS.trainingLogs, trainingLogs);
  }, [trainingLogs, loaded]);

  useEffect(() => {
    if (!loaded) return;
    saveStorage(STORAGE_KEYS.settings, settings);
  }, [settings, loaded]);

  useEffect(() => {
    if (!loaded) return;
    saveStorage(STORAGE_KEYS.weightLogs, weightLogs);
  }, [weightLogs, loaded]);

  const onAddSet = useCallback((key, entry) => {
    setTrainingLogs((prev) => ({
      ...prev,
      [key]: [...(prev[key] || []), entry],
    }));
  }, []);

  const onRemoveSet = useCallback((key, idx) => {
    setTrainingLogs((prev) => {
      const next = [...(prev[key] || [])];
      next.splice(idx, 1);
      return { ...prev, [key]: next };
    });
  }, []);

  const hasDataInDay = useCallback(
    (selectedDay, selectedWeek) => {
      const day = PLAN[selectedDay];
      if (!day.exercises) return false;
      return day.exercises.some((exercise) => {
        if (exercise.sep) return false;
        return (trainingLogs[workoutKey(selectedWeek, selectedDay, exercise.id)] || []).length > 0;
      });
    },
    [trainingLogs]
  );

  const trainingEntriesCount = useMemo(
    () => Object.values(trainingLogs).reduce((acc, entries) => acc + entries.length, 0),
    [trainingLogs]
  );

  const orderedWeightLogs = useMemo(
    () => [...weightLogs].sort((a, b) => b.date.localeCompare(a.date)),
    [weightLogs]
  );

  const currentWeight = useMemo(
    () => getCurrentWeight(orderedWeightLogs, settings.startWeight),
    [orderedWeightLogs, settings.startWeight]
  );

  const deltaFromStart = currentWeight - (Number(settings.startWeight) || 0);
  const remainingToGoal = currentWeight - (Number(settings.targetWeight) || 0);

  const selectedDay = PLAN[dayIndex];

  const updateTextSetting = (field, value) => {
    setSettings((prev) => ({ ...prev, [field]: value }));
  };

  const updateNumberSetting = (field, value) => {
    const nextValue = value === "" ? 0 : Number(value);
    if (Number.isNaN(nextValue)) return;
    setSettings((prev) => ({ ...prev, [field]: nextValue }));
  };

  const handleAddWeightLog = () => {
    const weightValue = Number(weightForm.weight);
    if (!weightForm.date || Number.isNaN(weightValue) || weightValue <= 0) return;

    const waistValue = weightForm.waist === "" ? null : Number(weightForm.waist);
    const entry = {
      id: Date.now(),
      date: weightForm.date,
      weight: weightValue,
      waist: Number.isNaN(waistValue) ? null : waistValue,
      ts: Date.now(),
    };

    setWeightLogs((prev) => [...prev, entry]);
    setWeightForm((prev) => ({ ...prev, weight: "", waist: "" }));
  };

  const removeWeightLog = (id) => {
    setWeightLogs((prev) => prev.filter((entry) => entry.id !== id));
  };

  const clearAllTrainingLogs = () => {
    if (!window.confirm("Borrar todos los registros de series?")) return;
    setTrainingLogs({});
  };

  const handleExportBackup = () => {
    downloadJson("sebfit-backup.json", {
      version: 1,
      exportedAt: new Date().toISOString(),
      settings,
      trainingLogs,
      weightLogs,
      week,
      dayIndex,
    });
  };

  const handleImportBackup = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const content = await file.text();
      const payload = JSON.parse(content);

      if (payload.settings) setSettings(mergeSettings(payload.settings));
      if (payload.trainingLogs && typeof payload.trainingLogs === "object") setTrainingLogs(payload.trainingLogs);
      if (Array.isArray(payload.weightLogs)) setWeightLogs(payload.weightLogs);
      if (typeof payload.week === "number" && payload.week > 0) setWeek(Math.floor(payload.week));
      if (typeof payload.dayIndex === "number" && payload.dayIndex >= 0 && payload.dayIndex < PLAN.length) {
        setDayIndex(Math.floor(payload.dayIndex));
      }

      window.alert("Backup importado correctamente.");
    } catch {
      window.alert("No se pudo importar el backup. Revisa el archivo JSON.");
    } finally {
      event.target.value = "";
    }
  };

  const tabs = [
    ["rutina", "Rutina"],
    ["progreso", "Progreso"],
    ["historial", "Historial"],
    ["dieta", "Dieta"],
    ["config", "Config"],
  ];

  const S = {
    bg: "#0A0A0A",
    fg: "#F5F0E8",
    card: "#111",
    border: "#1a1a1a",
    sep: "#0e0e0e",
  };

  return (
    <div style={{ background: S.bg, minHeight: "100vh", color: S.fg, fontFamily: "-apple-system, Georgia, serif", maxWidth: 520, margin: "0 auto" }}>
      <div
        style={{
          background: "linear-gradient(180deg, #111 0%, #0A0A0A 100%)",
          padding: "18px 20px 14px",
          borderBottom: `1px solid ${S.border}`,
          position: "sticky",
          top: 0,
          zIndex: 220,
        }}
      >
        <div style={{ fontSize: 10, letterSpacing: 4, color: ORANGE, fontFamily: "monospace", textTransform: "uppercase" }}>
          PLAN ELITE · FASE 1
        </div>
        <div style={{ fontSize: 24, fontWeight: 900, letterSpacing: -0.4 }}>
          {settings.profileName} <span style={{ color: ORANGE }}>Fit</span>
        </div>
        <div style={{ fontSize: 11, color: "#555", fontFamily: "monospace", marginTop: 3 }}>
          {currentWeight.toFixed(1)}kg actual · Meta {settings.targetWeight}kg · Ayuno {settings.fastingWindow} · Gym {settings.trainingWindow}
        </div>
      </div>

      <div
        style={{
          display: "flex",
          gap: 6,
          overflowX: "auto",
          padding: "10px 14px",
          background: S.bg,
          position: "sticky",
          top: 82,
          zIndex: 210,
          borderBottom: "1px solid #111",
          scrollbarWidth: "none",
        }}
      >
        {tabs.map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            style={{
              flexShrink: 0,
              padding: "8px 12px",
              borderRadius: 7,
              border: `1px solid ${tab === id ? ORANGE : "#222"}`,
              background: tab === id ? ORANGE : "transparent",
              color: tab === id ? "#fff" : "#666",
              fontFamily: "monospace",
              fontSize: 10,
              letterSpacing: 1,
              textTransform: "uppercase",
              cursor: "pointer",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "rutina" && (
        <div style={{ padding: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14, padding: "10px 14px", background: S.card, borderRadius: 8, border: `1px solid ${S.border}` }}>
            <button
              onClick={() => setWeek((value) => Math.max(1, value - 1))}
              style={{ background: S.sep, border: "1px solid #222", color: "#888", borderRadius: 6, padding: "6px 12px", fontFamily: "monospace", fontSize: 12, cursor: "pointer" }}
            >
              ?
            </button>
            <div style={{ flex: 1, textAlign: "center", fontFamily: "monospace", fontSize: 13, color: ORANGE, fontWeight: 700 }}>
              Semana {week}
            </div>
            <button
              onClick={() => setWeek((value) => value + 1)}
              style={{ background: S.sep, border: "1px solid #222", color: "#888", borderRadius: 6, padding: "6px 12px", fontFamily: "monospace", fontSize: 12, cursor: "pointer" }}
            >
              ?
            </button>
          </div>

          <div style={{ display: "flex", gap: 7, overflowX: "auto", paddingBottom: 4, marginBottom: 14, scrollbarWidth: "none" }}>
            {PLAN.map((day, idx) => (
              <button
                key={day.day}
                onClick={() => setDayIndex(idx)}
                style={{
                  flexShrink: 0,
                  padding: "9px 13px",
                  borderRadius: 8,
                  border: `1px solid ${dayIndex === idx ? day.color : "#222"}`,
                  background: S.card,
                  color: dayIndex === idx ? day.color : "#666",
                  fontFamily: "monospace",
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: "pointer",
                  position: "relative",
                }}
              >
                {day.day}
                {hasDataInDay(idx, week) && (
                  <span style={{ position: "absolute", top: 4, right: 4, width: 5, height: 5, borderRadius: "50%", background: GREEN }} />
                )}
              </button>
            ))}
          </div>

          <div
            style={{
              background: S.card,
              borderRadius: 10,
              padding: "14px 16px",
              marginBottom: 12,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              border: `1px solid ${selectedDay.color}22`,
              borderLeft: `3px solid ${selectedDay.color}`,
            }}
          >
            <div>
              <div style={{ fontSize: 10, fontFamily: "monospace", letterSpacing: 2, color: selectedDay.color, marginBottom: 2 }}>
                {selectedDay.full} · {selectedDay.type}
              </div>
              <div style={{ fontSize: 19, fontWeight: 700 }}>{selectedDay.title}</div>
            </div>
            <div style={{ background: S.bg, border: `1px solid ${S.border}`, borderRadius: 8, padding: "7px 10px", textAlign: "center" }}>
              <div style={{ fontSize: 9, color: "#555", fontFamily: "monospace" }}>META CARDIO</div>
              <div style={{ fontSize: 11, color: GREEN, fontFamily: "monospace", marginTop: 1 }}>{settings.cardioGoalMin}min/sem</div>
            </div>
          </div>

          {selectedDay.cardio && (
            <div style={{ background: S.card, border: `1px solid ${S.border}`, borderRadius: 10, overflow: "hidden", marginBottom: 12 }}>
              <div style={{ padding: "14px 16px", borderBottom: `1px solid ${S.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ fontSize: 14, fontWeight: 700, flex: 1, marginRight: 8 }}>{selectedDay.cardio.desc}</div>
                <span
                  style={{
                    background: `${selectedDay.color}22`,
                    color: selectedDay.color,
                    fontSize: 10,
                    padding: "3px 8px",
                    borderRadius: 4,
                    fontFamily: "monospace",
                    flexShrink: 0,
                  }}
                >
                  RPE {selectedDay.cardio.rpe}
                </span>
              </div>
              <div style={{ padding: "10px 16px", fontSize: 11, color: "#666", fontStyle: "italic" }}>* {selectedDay.cardio.note}</div>
            </div>
          )}

          {selectedDay.exercises && (
            <div style={{ background: S.card, border: `1px solid ${S.border}`, borderRadius: 10, overflow: "hidden" }}>
              {selectedDay.exercises.map((exercise, idx) =>
                exercise.sep ? (
                  <div
                    key={`sep-${idx}`}
                    style={{
                      padding: "6px 16px",
                      background: S.sep,
                      fontSize: 10,
                      color: ORANGE,
                      fontFamily: "monospace",
                      letterSpacing: 3,
                      textTransform: "uppercase",
                    }}
                  >
                    {exercise.label}
                  </div>
                ) : (
                  <ExerciseRow
                    key={exercise.id}
                    exercise={exercise}
                    dayIndex={dayIndex}
                    week={week}
                    logs={trainingLogs}
                    onAddSet={onAddSet}
                    onRemoveSet={onRemoveSet}
                  />
                )
              )}

              <div style={{ padding: "10px 16px", background: S.sep, fontSize: 11, color: "#666", borderTop: `1px solid ${S.border}` }}>
                <span style={{ color: ORANGE }}>CALENTAMIENTO:</span> 5-8min cardio + series 50% a 75% a 90%
              </div>
            </div>
          )}
        </div>
      )}

      {tab === "progreso" && (
        <div style={{ padding: 14 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
            <MetricCard label="PESO ACTUAL" value={`${currentWeight.toFixed(1)}kg`} helper="ultimo registro" color={ORANGE} />
            <MetricCard
              label="CAMBIO TOTAL"
              value={`${deltaFromStart > 0 ? "+" : ""}${deltaFromStart.toFixed(1)}kg`}
              helper={`vs inicio (${settings.startWeight}kg)`}
              color={deltaFromStart <= 0 ? GREEN : RED}
            />
            <MetricCard
              label="A META"
              value={`${remainingToGoal > 0 ? "+" : ""}${remainingToGoal.toFixed(1)}kg`}
              helper={`meta ${settings.targetWeight}kg`}
              color={remainingToGoal <= 0 ? GREEN : YELLOW}
            />
            <MetricCard label="SETS LOGGEADOS" value={`${trainingEntriesCount}`} helper="acumulado total" color={GREEN} />
          </div>

          <div style={{ background: S.card, border: `1px solid ${S.border}`, borderRadius: 10, padding: 14, marginBottom: 12 }}>
            <div style={{ fontSize: 11, color: ORANGE, fontFamily: "monospace", letterSpacing: 2, marginBottom: 10 }}>REGISTRAR PESO</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 10 }}>
              <Field label="Fecha" type="date" value={weightForm.date} onChange={(value) => setWeightForm((prev) => ({ ...prev, date: value }))} />
              <Field label="Peso (kg)" type="number" step="0.1" value={weightForm.weight} onChange={(value) => setWeightForm((prev) => ({ ...prev, weight: value }))} placeholder="78.3" />
              <Field label="Cintura (cm)" type="number" step="0.1" value={weightForm.waist} onChange={(value) => setWeightForm((prev) => ({ ...prev, waist: value }))} placeholder="Opcional" />
            </div>
            <button
              onClick={handleAddWeightLog}
              style={{ background: ORANGE, color: "#fff", border: "none", borderRadius: 8, padding: "9px 12px", fontWeight: 700, cursor: "pointer" }}
            >
              Guardar registro
            </button>
          </div>

          <div style={{ background: S.card, border: `1px solid ${S.border}`, borderRadius: 10, overflow: "hidden" }}>
            <div style={{ padding: "11px 14px", borderBottom: `1px solid ${S.border}`, fontSize: 11, color: "#666", fontFamily: "monospace", letterSpacing: 2 }}>
              HISTORIAL DE PESO ({orderedWeightLogs.length})
            </div>

            {!orderedWeightLogs.length && (
              <div style={{ padding: 20, color: "#666", textAlign: "center", fontFamily: "monospace", fontSize: 12 }}>
                Aun no hay registros de peso.
              </div>
            )}

            {orderedWeightLogs.map((entry) => (
              <div
                key={entry.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 10,
                  padding: "10px 14px",
                  borderBottom: "1px solid #171717",
                }}
              >
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>{entry.weight} kg</div>
                  <div style={{ fontSize: 10, color: "#666", fontFamily: "monospace" }}>
                    {entry.date}
                    {entry.waist ? ` · cintura ${entry.waist}cm` : ""}
                  </div>
                </div>
                <button
                  onClick={() => removeWeightLog(entry.id)}
                  style={{ background: "transparent", border: "1px solid #2a1a1a", color: "#8c4a4a", borderRadius: 6, padding: "5px 8px", cursor: "pointer", fontSize: 11 }}
                >
                  Borrar
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === "historial" && (
        <div style={{ padding: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, gap: 8 }}>
            <div>
              <div style={{ fontSize: 10, color: ORANGE, fontFamily: "monospace", letterSpacing: 2, marginBottom: 2 }}>PROGRESO DE FUERZA</div>
              <div style={{ fontSize: 18, fontWeight: 700 }}>Historial por ejercicio</div>
            </div>
            <button
              onClick={clearAllTrainingLogs}
              style={{
                background: "transparent",
                border: "1px solid #2a1a1a",
                color: "#8c4a4a",
                borderRadius: 6,
                padding: "6px 10px",
                fontSize: 10,
                fontFamily: "monospace",
                cursor: "pointer",
                flexShrink: 0,
              }}
            >
              Borrar todo
            </button>
          </div>

          {PLAN.filter((day) => day.exercises).map((day, dayIdx) => {
            const exercises = day.exercises.filter((exercise) => {
              if (exercise.sep) return false;
              return Array.from({ length: week + 3 }, (_, index) => index + 1).some((wk) => {
                const key = workoutKey(wk, dayIdx, exercise.id);
                return (trainingLogs[key] || []).length > 0;
              });
            });

            if (!exercises.length) return null;

            return (
              <div key={day.day} style={{ background: S.card, border: `1px solid ${S.border}`, borderRadius: 10, marginBottom: 12, overflow: "hidden" }}>
                <div style={{ padding: "12px 16px", borderBottom: `1px solid ${S.border}` }}>
                  <div style={{ fontSize: 10, color: day.color, fontFamily: "monospace", letterSpacing: 2, marginBottom: 2 }}>{day.full}</div>
                  <div style={{ fontSize: 15, fontWeight: 700 }}>{day.title}</div>
                </div>

                {exercises.map((exercise) => {
                  const entries = Array.from({ length: week + 3 }, (_, index) => index + 1)
                    .map((wk) => ({ wk, sets: trainingLogs[workoutKey(wk, dayIdx, exercise.id)] || [] }))
                    .filter((item) => item.sets.length > 0);

                  if (!entries.length) return null;

                  return (
                    <div key={exercise.id} style={{ padding: "12px 16px", borderBottom: "1px solid #151515" }}>
                      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>{exercise.name}</div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        {entries.map(({ wk, sets }) => {
                          const maxWeight = Math.max(...sets.map((entry) => Number(entry.w) || 0));
                          return (
                            <div
                              key={wk}
                              style={{
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "center",
                                padding: "7px 10px",
                                background: S.sep,
                                borderRadius: 6,
                                gap: 8,
                              }}
                            >
                              <span style={{ fontSize: 10, color: "#666", fontFamily: "monospace", width: 55, flexShrink: 0 }}>Sem {wk}</span>
                              <div style={{ display: "flex", gap: 4, flexWrap: "wrap", flex: 1 }}>
                                {sets.map((entry, idx) => (
                                  <span
                                    key={idx}
                                    style={{
                                      fontSize: 10,
                                      fontFamily: "monospace",
                                      color: Number(entry.w) === maxWeight ? GREEN : "#888",
                                      background: "#1a1a1a",
                                      padding: "2px 6px",
                                      borderRadius: 4,
                                    }}
                                  >
                                    {entry.w}kg x {entry.r}
                                  </span>
                                ))}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}

          {!Object.keys(trainingLogs).length && (
            <div style={{ textAlign: "center", padding: 48, color: "#444", fontFamily: "monospace", fontSize: 13, lineHeight: 1.8 }}>
              Aun no hay registros de entrenamiento.
              <br />
              Ve a Rutina y empieza a loggear tus series.
            </div>
          )}
        </div>
      )}

      {tab === "dieta" && (
        <div style={{ padding: 14 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
            <MetricCard label="CALORIAS" value={`${settings.dailyCalories}`} helper="kcal/dia" color={ORANGE} />
            <MetricCard label="PROTEINA" value={`${settings.protein}g`} helper="prioridad #1" color={GREEN} />
            <MetricCard label="CARBOS" value={`${settings.carbs}g`} helper="energia para entrenar" color={YELLOW} />
            <MetricCard label="GRASAS" value={`${settings.fats}g`} helper="hormonas y saciedad" color="#90A4FF" />
          </div>

          <div style={{ background: S.card, border: `1px solid ${S.border}`, borderRadius: 10, padding: 14, marginBottom: 12 }}>
            <div style={{ fontSize: 11, color: ORANGE, fontFamily: "monospace", letterSpacing: 2, marginBottom: 8 }}>TIMING PERSONAL</div>
            <div style={{ fontSize: 13, color: "#ccc", lineHeight: 1.6 }}>
              Ventana de ayuno: <b>{settings.fastingWindow}</b>
              <br />
              Entreno: <b>{settings.trainingWindow}</b>
              <br />
              Cardio objetivo: <b>{settings.cardioGoalMin} min/sem</b>
            </div>
          </div>

          <div style={{ background: S.card, border: `1px solid ${S.border}`, borderRadius: 10, padding: 14 }}>
            <div style={{ fontSize: 11, color: GREEN, fontFamily: "monospace", letterSpacing: 2, marginBottom: 8 }}>NOTA DE ENFOQUE</div>
            <div style={{ fontSize: 13, color: "#bdbdbd", lineHeight: 1.7 }}>{settings.notes || "Sin nota personalizada."}</div>
          </div>
        </div>
      )}

      {tab === "config" && (
        <div style={{ padding: 14 }}>
          <div style={{ background: S.card, border: `1px solid ${S.border}`, borderRadius: 10, padding: 14, marginBottom: 12 }}>
            <div style={{ fontSize: 11, color: ORANGE, fontFamily: "monospace", letterSpacing: 2, marginBottom: 10 }}>PERFIL Y METAS</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 9 }}>
              <Field label="Nombre" value={settings.profileName} onChange={(value) => updateTextSetting("profileName", value)} />
              <Field label="Ayuno" value={settings.fastingWindow} onChange={(value) => updateTextSetting("fastingWindow", value)} placeholder="16:8" />
              <Field label="Inicio (kg)" type="number" step="0.1" value={settings.startWeight} onChange={(value) => updateNumberSetting("startWeight", value)} />
              <Field label="Meta (kg)" type="number" step="0.1" value={settings.targetWeight} onChange={(value) => updateNumberSetting("targetWeight", value)} />
              <Field label="Horario gym" value={settings.trainingWindow} onChange={(value) => updateTextSetting("trainingWindow", value)} placeholder="4-6pm" />
              <Field label="Cardio min/sem" type="number" value={settings.cardioGoalMin} onChange={(value) => updateNumberSetting("cardioGoalMin", value)} />
            </div>
          </div>

          <div style={{ background: S.card, border: `1px solid ${S.border}`, borderRadius: 10, padding: 14, marginBottom: 12 }}>
            <div style={{ fontSize: 11, color: ORANGE, fontFamily: "monospace", letterSpacing: 2, marginBottom: 10 }}>MACROS</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 9 }}>
              <Field label="Calorias" type="number" value={settings.dailyCalories} onChange={(value) => updateNumberSetting("dailyCalories", value)} />
              <Field label="Proteina (g)" type="number" value={settings.protein} onChange={(value) => updateNumberSetting("protein", value)} />
              <Field label="Carbos (g)" type="number" value={settings.carbs} onChange={(value) => updateNumberSetting("carbs", value)} />
              <Field label="Grasas (g)" type="number" value={settings.fats} onChange={(value) => updateNumberSetting("fats", value)} />
            </div>
          </div>

          <div style={{ background: S.card, border: `1px solid ${S.border}`, borderRadius: 10, padding: 14, marginBottom: 12 }}>
            <div style={{ fontSize: 11, color: ORANGE, fontFamily: "monospace", letterSpacing: 2, marginBottom: 10 }}>NOTAS PERSONALES</div>
            <textarea
              value={settings.notes}
              onChange={(event) => updateTextSetting("notes", event.target.value)}
              rows={4}
              placeholder="Ejemplo: Priorizar dormir 7h, cero refresco entre semana..."
              style={{
                width: "100%",
                background: "#111",
                border: "1px solid #252525",
                borderRadius: 8,
                padding: "10px 11px",
                color: "#f5f0e8",
                fontSize: 14,
                resize: "vertical",
                outline: "none",
                boxSizing: "border-box",
              }}
            />
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
            <button
              onClick={handleExportBackup}
              style={{
                background: ORANGE,
                color: "#fff",
                border: "none",
                borderRadius: 8,
                padding: "9px 12px",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Exportar backup
            </button>

            <label
              style={{
                border: "1px solid #2b2b2b",
                color: "#bbb",
                borderRadius: 8,
                padding: "9px 12px",
                cursor: "pointer",
                fontSize: 13,
              }}
            >
              Importar backup
              <input type="file" accept="application/json" onChange={handleImportBackup} style={{ display: "none" }} />
            </label>

            <button
              onClick={() => setSettings(DEFAULT_SETTINGS)}
              style={{
                background: "transparent",
                border: "1px solid #2a1a1a",
                color: "#8c4a4a",
                borderRadius: 8,
                padding: "9px 12px",
                cursor: "pointer",
              }}
            >
              Restaurar defaults
            </button>
          </div>

          <div style={{ fontSize: 11, color: "#555", fontFamily: "monospace" }}>
            La configuracion se guarda automaticamente en tu navegador.
          </div>
        </div>
      )}
    </div>
  );
}

