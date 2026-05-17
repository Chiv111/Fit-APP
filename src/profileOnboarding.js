const DAY_BLUEPRINTS = [
  { shortDay: "LUN", fullDay: "Lunes" },
  { shortDay: "MAR", fullDay: "Martes" },
  { shortDay: "MIE", fullDay: "Miercoles" },
  { shortDay: "JUE", fullDay: "Jueves" },
  { shortDay: "VIE", fullDay: "Viernes" },
  { shortDay: "SAB", fullDay: "Sabado" },
  { shortDay: "DOM", fullDay: "Domingo" },
];

const DAY_ALIASES = {
  lun: DAY_BLUEPRINTS[0],
  lunes: DAY_BLUEPRINTS[0],
  mon: DAY_BLUEPRINTS[0],
  monday: DAY_BLUEPRINTS[0],
  mar: DAY_BLUEPRINTS[1],
  martes: DAY_BLUEPRINTS[1],
  tue: DAY_BLUEPRINTS[1],
  tuesday: DAY_BLUEPRINTS[1],
  mie: DAY_BLUEPRINTS[2],
  miercoles: DAY_BLUEPRINTS[2],
  miercoles_: DAY_BLUEPRINTS[2],
  wed: DAY_BLUEPRINTS[2],
  wednesday: DAY_BLUEPRINTS[2],
  jue: DAY_BLUEPRINTS[3],
  jueves: DAY_BLUEPRINTS[3],
  thu: DAY_BLUEPRINTS[3],
  thursday: DAY_BLUEPRINTS[3],
  vie: DAY_BLUEPRINTS[4],
  viernes: DAY_BLUEPRINTS[4],
  fri: DAY_BLUEPRINTS[4],
  friday: DAY_BLUEPRINTS[4],
  sab: DAY_BLUEPRINTS[5],
  sabado: DAY_BLUEPRINTS[5],
  saturday: DAY_BLUEPRINTS[5],
  sat: DAY_BLUEPRINTS[5],
  dom: DAY_BLUEPRINTS[6],
  domingo: DAY_BLUEPRINTS[6],
  sunday: DAY_BLUEPRINTS[6],
  sun: DAY_BLUEPRINTS[6],
};

function safeSlug(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function makeExercise(name, sets, reps, rest = "90s", note = "") {
  return {
    id: `ex_${safeSlug(name)}_${Math.random().toString(36).slice(2, 7)}`,
    name: String(name || "Nuevo ejercicio").trim(),
    sets: String(sets || "3").trim(),
    reps: String(reps || "8-10").trim(),
    rest: String(rest || "90s").trim(),
    note: String(note || "").trim(),
  };
}

function makeDay(index, definition) {
  const base = DAY_BLUEPRINTS[index] || DAY_BLUEPRINTS[index % DAY_BLUEPRINTS.length];
  return {
    id: `d_${base.shortDay.toLowerCase()}_${Math.random().toString(36).slice(2, 6)}`,
    shortDay: definition.shortDay || base.shortDay,
    fullDay: definition.fullDay || base.fullDay,
    type: definition.type || "Fuerza",
    title: definition.title || "Sesion",
    postCardio: definition.postCardio || "",
    cardioProtocol: definition.cardioProtocol || "",
    exercises: Array.isArray(definition.exercises) ? definition.exercises : [],
  };
}

function normalizeRoutineDays(days) {
  return (Array.isArray(days) ? days : [])
    .map((day, index) =>
      makeDay(index, {
        shortDay: day.shortDay,
        fullDay: day.fullDay,
        type: day.type,
        title: day.title,
        postCardio: day.postCardio,
        cardioProtocol: day.cardioProtocol,
        exercises: Array.isArray(day.exercises)
          ? day.exercises
              .filter((exercise) => String(exercise?.name || "").trim())
              .map((exercise) =>
                makeExercise(exercise.name, exercise.sets, exercise.reps, exercise.rest, exercise.note)
              )
          : [],
      })
    )
    .filter((day) => day.exercises.length > 0 || day.cardioProtocol || day.postCardio);
}

function pickTemplate(goal, daysPerWeek, equipment) {
  const safeDays = Math.min(Math.max(Number(daysPerWeek) || 4, 3), 6);
  const home = equipment === "home";
  const goalKey = goal === "fat_loss" ? "fat_loss" : goal === "muscle_gain" ? "muscle_gain" : "recomp";

  const templates = {
    fat_loss: [
      {
        title: "Full Body A",
        exercises: [
          makeExercise(home ? "Goblet squat" : "Back squat", 4, "6-8", "120s", "Base de fuerza"),
          makeExercise(home ? "Push-up" : "Bench press", 4, "8-10", "90s", "Controlado"),
          makeExercise(home ? "One-arm row" : "Chest supported row", 4, "8-10", "90s", "Espalda alta"),
          makeExercise("Romanian deadlift", 3, "8-10", "120s", "Posterior"),
          makeExercise("Plank", 3, "40-60s", "45s", "Core"),
        ],
      },
      {
        title: "Full Body B",
        exercises: [
          makeExercise(home ? "Bulgarian split squat" : "Leg press", 4, "10-12", "90s", "Pierna"),
          makeExercise(home ? "Floor press" : "Incline dumbbell press", 4, "8-10", "90s", "Pecho superior"),
          makeExercise(home ? "Band pulldown" : "Lat pulldown", 4, "10-12", "75s", "Dorsal"),
          makeExercise("Hip thrust", 3, "10-12", "90s", "Gluteo"),
          makeExercise("Farmer carry", 3, "30m", "60s", "Acondicionamiento"),
        ],
      },
      {
        title: "Condicionamiento",
        type: "Cardio",
        postCardio: "No agregar extra",
        cardioProtocol: "10 min calentamiento + 8 rondas de 40s fuerte / 80s suave + 5 min enfriamiento.",
        exercises: [],
      },
    ],
    muscle_gain: [
      {
        title: "Push",
        exercises: [
          makeExercise(home ? "Dumbbell press" : "Barbell bench press", 4, "6-8", "120s", "Top set + backoffs"),
          makeExercise(home ? "Shoulder press" : "Seated shoulder press", 4, "8-10", "90s", "Hombro"),
          makeExercise(home ? "Push-up deficit" : "Incline machine press", 3, "10-12", "75s", "Pecho"),
          makeExercise("Lateral raise", 4, "12-15", "45s", "Control"),
          makeExercise("Triceps extension", 3, "12-15", "45s", "Bombeo"),
        ],
      },
      {
        title: "Pull",
        exercises: [
          makeExercise(home ? "Pull-up / band row" : "Weighted pull-up", 4, "6-8", "120s", "Vertical"),
          makeExercise(home ? "Chest supported DB row" : "T-bar row", 4, "8-10", "90s", "Horizontal"),
          makeExercise("Pullover / straight-arm pulldown", 3, "10-12", "60s", "Dorsal"),
          makeExercise("Rear delt fly", 3, "12-15", "45s", "Posterior"),
          makeExercise("Biceps curl", 3, "10-12", "45s", "Biceps"),
        ],
      },
      {
        title: "Legs",
        exercises: [
          makeExercise(home ? "Goblet squat" : "Hack squat", 4, "6-8", "120s", "Cuadri"),
          makeExercise("Romanian deadlift", 4, "8-10", "120s", "Posterior"),
          makeExercise(home ? "Walking lunge" : "Leg extension", 3, "10-12", "75s", "Cuadri"),
          makeExercise(home ? "Hip thrust" : "Leg curl", 3, "10-12", "75s", "Femoral"),
          makeExercise("Calf raise", 4, "12-15", "45s", "Pantorrilla"),
        ],
      },
    ],
    recomp: [
      {
        title: "Upper",
        exercises: [
          makeExercise(home ? "Incline dumbbell press" : "Incline barbell press", 4, "6-8", "120s", "Empuje"),
          makeExercise(home ? "Pull-up" : "Lat pulldown", 4, "8-10", "90s", "Tiron"),
          makeExercise(home ? "Dumbbell shoulder press" : "Machine shoulder press", 3, "8-10", "90s", "Hombro"),
          makeExercise(home ? "One-arm row" : "Cable row", 3, "10-12", "75s", "Espalda"),
          makeExercise("Arms superset", 3, "12-15", "45s", "Biceps + triceps"),
        ],
      },
      {
        title: "Lower",
        exercises: [
          makeExercise(home ? "Split squat" : "Back squat", 4, "6-8", "120s", "Pierna"),
          makeExercise("Romanian deadlift", 4, "8-10", "120s", "Posterior"),
          makeExercise(home ? "Step-up" : "Leg press", 3, "10-12", "75s", "Cuadri"),
          makeExercise("Hip thrust", 3, "10-12", "75s", "Gluteo"),
          makeExercise("Abs circuit", 3, "12-15", "45s", "Core"),
        ],
      },
      {
        title: "Cardio Z2",
        type: "Cardio",
        postCardio: "Sesion principal",
        cardioProtocol: "35-45 min en zona 2. Debes poder mantener conversacion corta.",
        exercises: [],
      },
    ],
  };

  const base = templates[goalKey];
  const result = [];

  for (let index = 0; index < safeDays; index += 1) {
    const template = base[index % base.length];
    result.push(
      makeDay(index, {
        title: template.title,
        type: template.type || "Fuerza",
        postCardio: template.postCardio || "10-20 min Z2 opcional",
        cardioProtocol: template.cardioProtocol || "",
        exercises: template.exercises,
      })
    );
  }

  return result;
}

export function buildRecommendedRoutine(preferences) {
  return pickTemplate(preferences.goal, preferences.daysPerWeek, preferences.equipment);
}

function parseJsonRoutine(text) {
  const parsed = JSON.parse(text);
  if (Array.isArray(parsed)) return normalizeRoutineDays(parsed);
  if (Array.isArray(parsed?.routine)) return normalizeRoutineDays(parsed.routine);
  if (Array.isArray(parsed?.days)) return normalizeRoutineDays(parsed.days);
  throw new Error("JSON sin rutina valida.");
}

function parseCsvRoutine(text) {
  const rows = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (rows.length < 2) throw new Error("CSV sin filas.");
  const headers = rows[0].split(",").map((cell) => safeSlug(cell));
  const headerIndex = Object.fromEntries(headers.map((header, index) => [header, index]));
  if (headerIndex.day === undefined || headerIndex.exercise === undefined) {
    throw new Error("CSV debe incluir columnas day y exercise.");
  }

  const grouped = new Map();

  rows.slice(1).forEach((row) => {
    const cells = row.split(",").map((cell) => cell.trim());
    const rawDay = cells[headerIndex.day] || "Lunes";
    const alias = DAY_ALIASES[safeSlug(rawDay)] || DAY_BLUEPRINTS[grouped.size % DAY_BLUEPRINTS.length];
    const key = alias.fullDay;
    if (!grouped.has(key)) {
      grouped.set(key, {
        ...alias,
        title: cells[headerIndex.title] || `Sesion ${key}`,
        type: cells[headerIndex.type] || "Fuerza",
        postCardio: cells[headerIndex.postcardio] || "",
        cardioProtocol: cells[headerIndex.cardioprotocol] || "",
        exercises: [],
      });
    }

    const group = grouped.get(key);
    const exerciseName = cells[headerIndex.exercise];
    if (exerciseName) {
      group.exercises.push(
        makeExercise(
          exerciseName,
          cells[headerIndex.sets],
          cells[headerIndex.reps],
          cells[headerIndex.rest],
          cells[headerIndex.note]
        )
      );
    }
  });

  return normalizeRoutineDays([...grouped.values()]);
}

function resolveHeading(line) {
  const cleaned = line.replace(/^#+\s*/, "").replace(/^dia\s*[:\-]\s*/i, "").trim();
  const [rawDay, ...titleParts] = cleaned.split(/\s*-\s*/);
  const alias = DAY_ALIASES[safeSlug(rawDay)];
  if (!alias) return null;
  return {
    ...alias,
    title: titleParts.join(" - ").trim() || `Sesion ${alias.fullDay}`,
  };
}

function parseTextRoutine(text) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const days = [];
  let currentDay = null;

  lines.forEach((line) => {
    const heading = line.startsWith("#") || /^dia\s*[:\-]/i.test(line) ? resolveHeading(line) : resolveHeading(line);
    if (heading) {
      currentDay = {
        shortDay: heading.shortDay,
        fullDay: heading.fullDay,
        type: "Fuerza",
        title: heading.title,
        postCardio: "",
        cardioProtocol: "",
        exercises: [],
      };
      days.push(currentDay);
      return;
    }

    if (!currentDay) return;

    if (/^cardio\s*[:\-]/i.test(line)) {
      currentDay.type = "Cardio";
      currentDay.cardioProtocol = line.replace(/^cardio\s*[:\-]/i, "").trim();
      return;
    }

    const cleaned = line.replace(/^[-*]\s*/, "");
    const pipeParts = cleaned.split("|").map((part) => part.trim());
    if (pipeParts.length >= 3) {
      currentDay.exercises.push(
        makeExercise(pipeParts[0], pipeParts[1], pipeParts[2], pipeParts[3], pipeParts[4])
      );
      return;
    }

    const xMatch = cleaned.match(/^(.+?)\s+(\d+(?:-\d+)?)x(\d+(?:-\d+)?)(?:\s*-\s*(.+))?$/i);
    if (xMatch) {
      currentDay.exercises.push(makeExercise(xMatch[1], xMatch[2], xMatch[3], xMatch[4], ""));
      return;
    }

    currentDay.exercises.push(makeExercise(cleaned, "3", "8-10", "90s", ""));
  });

  return normalizeRoutineDays(days);
}

export function parseRoutineImport(text, fileName = "") {
  const raw = String(text || "").trim();
  if (!raw) throw new Error("La rutina esta vacia.");

  const extension = String(fileName || "").split(".").pop()?.toLowerCase() || "";

  if (extension === "json" || raw.startsWith("{") || raw.startsWith("[")) {
    return {
      routine: parseJsonRoutine(raw),
      source: "json",
    };
  }

  if (extension === "csv" || raw.includes(",") && raw.toLowerCase().includes("day")) {
    return {
      routine: parseCsvRoutine(raw),
      source: "csv",
    };
  }

  return {
    routine: parseTextRoutine(raw),
    source: extension || "text",
  };
}
