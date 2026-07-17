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
        title: "Cuerpo completo A",
        exercises: [
          makeExercise(home ? "Sentadilla con mancuerna" : "Sentadilla con barra", 4, "6-8", "120s", "Base de fuerza"),
          makeExercise(home ? "Lagartija" : "Press banca", 4, "8-10", "90s", "Controlado"),
          makeExercise(home ? "Remo a una mano" : "Remo con soporte", 4, "8-10", "90s", "Espalda alta"),
          makeExercise("Peso muerto rumano", 3, "8-10", "120s", "Posterior"),
          makeExercise("Plancha", 3, "40-60s", "45s", "Core"),
        ],
      },
      {
        title: "Cuerpo completo B",
        exercises: [
          makeExercise(home ? "Sentadilla búlgara" : "Prensa", 4, "10-12", "90s", "Pierna"),
          makeExercise(home ? "Press en piso" : "Press inclinado con mancuernas", 4, "8-10", "90s", "Pecho superior"),
          makeExercise(home ? "Jalón con banda" : "Jalón al pecho", 4, "10-12", "75s", "Dorsal"),
          makeExercise("Hip thrust", 3, "10-12", "90s", "Gluteo"),
          makeExercise("Caminata con peso", 3, "30m", "60s", "Acondicionamiento"),
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
        title: "Empuje",
        exercises: [
          makeExercise(home ? "Press con mancuernas" : "Press banca con barra", 4, "6-8", "120s", "Serie principal y series de apoyo"),
          makeExercise(home ? "Press hombro" : "Press hombro sentado", 4, "8-10", "90s", "Hombro"),
          makeExercise(home ? "Lagartija con elevación" : "Press inclinado en máquina", 3, "10-12", "75s", "Pecho"),
          makeExercise("Elevación lateral", 4, "12-15", "45s", "Control"),
          makeExercise("Extensión de tríceps", 3, "12-15", "45s", "Bombeo"),
        ],
      },
      {
        title: "Jalón",
        exercises: [
          makeExercise(home ? "Dominada / remo con banda" : "Dominada con peso", 4, "6-8", "120s", "Vertical"),
          makeExercise(home ? "Remo con mancuernas" : "Remo en barra T", 4, "8-10", "90s", "Horizontal"),
          makeExercise("Pullover / jalón con brazos rectos", 3, "10-12", "60s", "Dorsal"),
          makeExercise("Pájaros", 3, "12-15", "45s", "Posterior"),
          makeExercise("Curl bíceps", 3, "10-12", "45s", "Biceps"),
        ],
      },
      {
        title: "Pierna",
        exercises: [
          makeExercise(home ? "Sentadilla con mancuerna" : "Sentadilla hack", 4, "6-8", "120s", "Cuadri"),
          makeExercise("Peso muerto rumano", 4, "8-10", "120s", "Posterior"),
          makeExercise(home ? "Desplante caminando" : "Extensión de pierna", 3, "10-12", "75s", "Cuadri"),
          makeExercise(home ? "Hip thrust" : "Curl femoral", 3, "10-12", "75s", "Femoral"),
          makeExercise("Elevación de pantorrilla", 4, "12-15", "45s", "Pantorrilla"),
        ],
      },
    ],
    recomp: [
      {
        title: "Torso",
        exercises: [
          makeExercise(home ? "Press inclinado con mancuernas" : "Press inclinado con barra", 4, "6-8", "120s", "Empuje"),
          makeExercise(home ? "Dominada" : "Jalón al pecho", 4, "8-10", "90s", "Tirón"),
          makeExercise(home ? "Press hombro con mancuernas" : "Press hombro en máquina", 3, "8-10", "90s", "Hombro"),
          makeExercise(home ? "Remo a una mano" : "Remo en polea", 3, "10-12", "75s", "Espalda"),
          makeExercise("Brazos combinados", 3, "12-15", "45s", "Biceps + triceps"),
        ],
      },
      {
        title: "Pierna",
        exercises: [
          makeExercise(home ? "Sentadilla dividida" : "Sentadilla con barra", 4, "6-8", "120s", "Pierna"),
          makeExercise("Peso muerto rumano", 4, "8-10", "120s", "Posterior"),
          makeExercise(home ? "Subida a banco" : "Prensa", 3, "10-12", "75s", "Cuadri"),
          makeExercise("Hip thrust", 3, "10-12", "75s", "Gluteo"),
          makeExercise("Circuito de abdomen", 3, "12-15", "45s", "Core"),
        ],
      },
      {
        title: "Cardio suave",
        type: "Cardio",
        postCardio: "Sesión principal",
        cardioProtocol: "35-45 min a ritmo suave. Debes poder mantener una conversación corta.",
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
        postCardio: template.postCardio || "10-20 min suave opcional",
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

export function buildManualRoutine(daysPerWeek = 4) {
  const safeDays = Math.min(Math.max(Number(daysPerWeek) || 4, 1), 7);
  return Array.from({ length: safeDays }, (_, index) =>
    makeDay(index, {
      type: "Fuerza",
      title: "Mi sesión",
      postCardio: "",
      cardioProtocol: "",
      exercises: [makeExercise("Nuevo ejercicio", "3", "8-10", "90s", "")],
    })
  );
}

function parseJsonRoutine(text) {
  const parsed = JSON.parse(text);
  if (Array.isArray(parsed)) return normalizeRoutineDays(parsed);
  if (Array.isArray(parsed?.routine)) return normalizeRoutineDays(parsed.routine);
  if (Array.isArray(parsed?.days)) return normalizeRoutineDays(parsed.days);
  throw new Error("No encontramos una rutina válida en el archivo.");
}

function parseCsvRoutine(text) {
  const rows = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (rows.length < 2) throw new Error("El archivo no tiene suficientes filas.");
  const headers = rows[0].split(",").map((cell) => safeSlug(cell));
  const headerIndex = Object.fromEntries(headers.map((header, index) => [header, index]));
  if (headerIndex.day === undefined || headerIndex.exercise === undefined) {
    throw new Error("No pudimos reconocer el día y el ejercicio en el archivo.");
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
  const [rawDay, ...titleParts] = cleaned.split(/\s*(?:-|:|—)\s*/);
  const numericDay = safeSlug(rawDay).match(/^(?:dia|day)?_?(\d{1,2})$/);
  const numericIndex = numericDay ? Math.max(0, Number(numericDay[1]) - 1) : -1;
  const alias = DAY_ALIASES[safeSlug(rawDay)]
    || (numericIndex >= 0 ? DAY_BLUEPRINTS[numericIndex % DAY_BLUEPRINTS.length] : null);
  if (!alias) return null;
  return {
    ...alias,
    dayIndex: numericIndex,
    title: titleParts.join(" - ").trim() || `Sesion ${alias.fullDay}`,
  };
}

function parseTimedPrescription(value) {
  const match = String(value || "").trim().match(
    /^(\d+(?:\s*-\s*\d+)?\s*(?:reps?|min(?:utos?)?|seg(?:undos?)?|s)\b)(?:\s*[,;—-]\s*|\s+)?(.*)$/i
  );
  if (!match) return null;
  return {
    reps: match[1].replace(/\s*-\s*/g, "-").trim(),
    note: match[2].trim(),
  };
}

function parseStructuredExercise(line, pendingSets = "") {
  const parts = line
    .replace(/^\d+\.\s*/, "")
    .split("|")
    .map((part) => part.trim())
    .filter(Boolean);
  const name = parts.shift() || "Nuevo ejercicio";
  let sets = pendingSets || "3";
  let reps = "8-10";
  let noteParts = [];
  let hasPrescription = false;

  const xIndex = parts.findIndex((part) => /^\d+\s*[x×]\s*\S+/i.test(part));
  if (xIndex >= 0) {
    const match = parts[xIndex].match(/^(\d+)\s*[x×]\s*(.+)$/i);
    sets = match[1];
    reps = match[2].replace(/\s*-\s*/g, "-").trim();
    noteParts = parts.filter((_, index) => index !== xIndex);
    hasPrescription = true;
  } else if (parts.length >= 2 && /^\d+$/.test(parts[parts.length - 1])) {
    sets = parts.pop();
    const timed = parseTimedPrescription(parts.shift());
    if (timed) {
      reps = timed.reps;
      noteParts = [timed.note, ...parts].filter(Boolean);
      hasPrescription = true;
    } else {
      noteParts = parts;
    }
  } else if (parts.length >= 2 && /^(?:gtg|libre)$/i.test(parts[parts.length - 1])) {
    sets = parts.pop();
    const rawReps = parts.shift();
    const timed = parseTimedPrescription(rawReps);
    reps = timed?.reps || rawReps || "a gusto";
    noteParts = [timed?.note, ...parts].filter(Boolean);
    hasPrescription = true;
  } else {
    const timedIndex = parts.findIndex((part) => {
      const timed = parseTimedPrescription(part);
      return timed && !timed.note;
    });
    if (timedIndex >= 0) {
      const timed = parseTimedPrescription(parts[timedIndex]);
      sets = pendingSets || "1";
      reps = timed.reps;
      noteParts = parts.filter((_, index) => index !== timedIndex);
      hasPrescription = true;
    } else {
      noteParts = parts;
    }
  }

  return {
    exercise: makeExercise(name, sets, reps, "90s", noteParts.join(" · ")),
    needsSupplementalReps: Boolean(pendingSets) && !hasPrescription,
  };
}

function parseStructuredTextRoutine(lines) {
  const days = [];
  const seenDayIndexes = new Set();
  let currentDay = null;
  let pendingSets = "";
  let needsSupplementalReps = false;

  for (const line of lines) {
    const heading = resolveHeading(line);
    const isNumericHeading = heading
      && heading.dayIndex >= 0
      && /^d[ií]a\s*\d+/i.test(line);

    if (isNumericHeading) {
      if (seenDayIndexes.has(heading.dayIndex)) break;
      seenDayIndexes.add(heading.dayIndex);
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
      pendingSets = "";
      needsSupplementalReps = false;
      continue;
    }

    if (!currentDay) continue;

    if (/^\+?\s*cardio\s*:/i.test(line)) {
      currentDay.postCardio = line.replace(/^\+?\s*cardio\s*:/i, "").trim();
      continue;
    }

    if (!currentDay.exercises.length && /^abs$/i.test(line)) {
      currentDay.title = `${currentDay.title} ABS`.replace(/\+\s*ABS$/i, "+ ABS");
      continue;
    }

    const seriesMatch = line.match(/^(\d+)\s+series$/i);
    if (seriesMatch) {
      pendingSets = seriesMatch[1];
      continue;
    }

    if (/^\d+\.\s*/.test(line)) {
      const parsed = parseStructuredExercise(line, pendingSets);
      currentDay.exercises.push(parsed.exercise);
      needsSupplementalReps = parsed.needsSupplementalReps;
      pendingSets = "";
      continue;
    }

    if (needsSupplementalReps && /^subm[aá]x/i.test(line)) {
      currentDay.exercises[currentDay.exercises.length - 1].reps = line.trim();
      needsSupplementalReps = false;
    }
  }

  return normalizeRoutineDays(days);
}

function parseTextRoutine(text) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const routineMarkerIndex = lines.findIndex((line) => safeSlug(line) === "la_rutina");
  const structuredHeadingIndexes = lines
    .map((line, index) => ({ index, heading: resolveHeading(line) }))
    .filter(({ heading, index }) => (
      heading?.dayIndex >= 0
      && /^d[ií]a\s*\d+/i.test(lines[index])
    ));

  if (routineMarkerIndex >= 0 || structuredHeadingIndexes.length >= 2) {
    const startIndex = routineMarkerIndex >= 0
      ? routineMarkerIndex + 1
      : structuredHeadingIndexes[0].index;
    return parseStructuredTextRoutine(lines.slice(startIndex));
  }

  const days = [];
  let currentDay = null;

  lines.forEach((line) => {
    const heading = resolveHeading(line);
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

    const xMatch = cleaned.match(/^(.+?)\s+(\d+)\s*[x×]\s*(\d+(?:\s*-\s*\d+)?(?:\s*(?:reps?|min|seg|s))?)(?:\s*(?:-|–|—|·)\s*(.+))?$/i);
    if (xMatch) {
      currentDay.exercises.push(makeExercise(xMatch[1], xMatch[2], xMatch[3], xMatch[4] || "90s", ""));
      return;
    }

    currentDay.exercises.push(makeExercise(cleaned, "3", "8-10", "90s", ""));
  });

  return normalizeRoutineDays(days);
}

export function parseRoutineImport(text, fileName = "") {
  const raw = String(text || "").trim();
  if (!raw) throw new Error("La rutina está vacía.");

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
