import { useMemo, useState } from "react";
import { buildManualRoutine, buildRecommendedRoutine, parseRoutineImport } from "./profileOnboarding.js";
import { extractRoutineTextFromPdf } from "./pdfRoutine.js";
import { BrandLogo } from "./BrandLogo.jsx";

const GOALS = [
  { id: "muscle_gain", label: "Ganar músculo", note: "Más volumen y progresión de fuerza." },
  { id: "fat_loss", label: "Bajar grasa", note: "Fuerza, cuerpo completo y acondicionamiento." },
  { id: "recomp", label: "Recomposición", note: "Equilibrio entre fuerza, músculo y cardio." },
];

function routineExerciseCount(routine) {
  return (routine || []).reduce(
    (total, day) => total + (day.exercises || day.customExercises || []).length,
    0
  );
}

function RoutinePreview({ routine }) {
  if (!routine?.length) return null;
  return (
    <div className="onboarding-preview">
      <div className="row space-between wrap">
        <strong>Vista previa</strong>
        <span className="pill">{routine.length} días · {routineExerciseCount(routine)} ejercicios</span>
      </div>
      <div className="stack gap-8 top-8">
        {routine.map((day) => {
          const exercises = day.exercises || day.customExercises || [];
          return (
            <div className="onboarding-preview-day" key={day.id || `${day.fullDay}_${day.title}`}>
              <div>
                <strong>{day.fullDay}</strong>
                <p className="muted small">{day.title}</p>
              </div>
              <span className="pill pill-muted">{exercises.length}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function Onboarding({ email, initialName = "", localSummary, onRecoverLocal, onComplete }) {
  const [step, setStep] = useState(1);
  const [profileName, setProfileName] = useState(initialName);
  const [goal, setGoal] = useState("recomp");
  const [daysPerWeek, setDaysPerWeek] = useState(4);
  const [equipment, setEquipment] = useState("gym");
  const [source, setSource] = useState("");
  const [pdfText, setPdfText] = useState("");
  const [pdfName, setPdfName] = useState("");
  const [pdfRoutine, setPdfRoutine] = useState(null);
  const [pdfProgress, setPdfProgress] = useState(null);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfError, setPdfError] = useState("");

  const preferences = { goal, daysPerWeek, equipment };
  const recommendedRoutine = useMemo(
    () => buildRecommendedRoutine(preferences),
    [goal, daysPerWeek, equipment]
  );

  const finish = (routine, routineSource, openEditor = false) => {
    onComplete({
      profileName: profileName.trim() || email?.split("@")[0] || "Atleta",
      preferences,
      routine,
      source: routineSource,
      openEditor,
    });
  };

  const analyzeText = (text = pdfText, name = pdfName || "rutina.txt") => {
    try {
      const parsed = parseRoutineImport(text, name);
      if (!parsed.routine.length) throw new Error("No encontramos días válidos en la rutina.");
      setPdfRoutine(parsed.routine);
      setPdfError("");
    } catch (caught) {
      setPdfRoutine(null);
      setPdfError(caught?.message || "No pudimos interpretar la rutina.");
    }
  };

  const handlePdf = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setPdfBusy(true);
    setPdfError("");
    setPdfRoutine(null);
    setPdfName(file.name || "rutina.pdf");
    try {
      const text = await extractRoutineTextFromPdf(file, setPdfProgress);
      setPdfText(text);
      analyzeText(text, "rutina.txt");
    } catch (caught) {
      setPdfText("");
      setPdfError(caught?.message || "No pudimos leer el PDF.");
    } finally {
      setPdfBusy(false);
      setPdfProgress(null);
    }
  };

  return (
    <main className="onboarding-shell">
      <section className="onboarding-card">
        <header className="onboarding-head">
          <div className="onboarding-brand">
            <BrandLogo size={58} />
            <div>
              <p className="gate-tag">ANVIL · PASO {step} DE 2</p>
              <h1>{step === 1 ? "Vamos a preparar tu cuenta" : "¿Cómo quieres empezar?"}</h1>
              <p className="muted top-6">{email}</p>
            </div>
          </div>
          <span className="onboarding-step">{step}/2</span>
        </header>

        {step === 1 && (
          <div className="stack gap-12 top-16">
            <label className="field">
              <span>¿Cómo te llamamos?</span>
              <input
                className="input"
                value={profileName}
                onChange={(event) => setProfileName(event.target.value)}
                placeholder="Tu nombre"
                autoComplete="name"
              />
            </label>

            <fieldset className="onboarding-fieldset">
              <legend>Objetivo principal</legend>
              <div className="onboarding-choice-grid">
                {GOALS.map((item) => (
                  <button
                    key={item.id}
                    className={`onboarding-choice ${goal === item.id ? "is-selected" : ""}`}
                    type="button"
                    onClick={() => setGoal(item.id)}
                  >
                    <strong>{item.label}</strong>
                    <span>{item.note}</span>
                  </button>
                ))}
              </div>
            </fieldset>

            <div className="grid-two">
              <label className="field">
                <span>Días por semana</span>
                <select className="input" value={daysPerWeek} onChange={(event) => setDaysPerWeek(Number(event.target.value))}>
                  {[3, 4, 5, 6].map((days) => <option key={days} value={days}>{days} días</option>)}
                </select>
              </label>
              <label className="field">
                <span>Equipo</span>
                <select className="input" value={equipment} onChange={(event) => setEquipment(event.target.value)}>
                  <option value="gym">Gimnasio completo</option>
                  <option value="home">Casa / mancuernas</option>
                </select>
              </label>
            </div>

            <button className="btn btn-primary btn-large" type="button" onClick={() => setStep(2)}>
              Continuar
            </button>
          </div>
        )}

        {step === 2 && (
          <div className="stack gap-12 top-16">
            {localSummary?.hasRecoverableData && (
              <article className="onboarding-recovery">
                <div>
                  <p className="gate-tag">DATOS ENCONTRADOS</p>
                  <h3>Conservar lo que ya tenías</h3>
                  <p className="muted top-6">
                    {localSummary.trainingDays} días entrenados · {localSummary.setsCount} series · {localSummary.routineDays} días de rutina
                  </p>
                </div>
                <button
                  className="btn btn-primary"
                  type="button"
                  onClick={() => onRecoverLocal({ profileName: profileName.trim() })}
                >
                  Pasar estos datos a mi cuenta
                </button>
              </article>
            )}

            <div className="onboarding-source-grid">
              <button className={`onboarding-source ${source === "recommended" ? "is-selected" : ""}`} type="button" onClick={() => setSource("recommended")}>
                <span className="onboarding-source-icon">✦</span>
                <strong>Rutina recomendada</strong>
                <span>La armamos con tu objetivo, días y equipo.</span>
              </button>
              <button className={`onboarding-source ${source === "pdf" ? "is-selected" : ""}`} type="button" onClick={() => setSource("pdf")}>
                <span className="onboarding-source-icon">PDF</span>
                <strong>Subir mi rutina</strong>
                <span>Lee el PDF y te deja revisar antes de guardar.</span>
              </button>
              <button className={`onboarding-source ${source === "manual" ? "is-selected" : ""}`} type="button" onClick={() => setSource("manual")}>
                <span className="onboarding-source-icon">＋</span>
                <strong>Crear manualmente</strong>
                <span>Empieza con los días vacíos y agrega ejercicios.</span>
              </button>
            </div>

            {source === "recommended" && (
              <div className="onboarding-source-detail">
                <RoutinePreview routine={recommendedRoutine} />
                <button className="btn btn-primary btn-large top-12" type="button" onClick={() => finish(recommendedRoutine, "recommended")}>
                  Usar esta rutina
                </button>
              </div>
            )}

            {source === "manual" && (
              <div className="onboarding-source-detail">
                <p className="muted">Crearemos {daysPerWeek} días y abriremos el editor para que escribas ejercicios, series, repeticiones y descansos.</p>
                <button className="btn btn-primary btn-large top-12" type="button" onClick={() => finish(buildManualRoutine(daysPerWeek), "manual", true)}>
                  Abrir editor manual
                </button>
              </div>
            )}

            {source === "pdf" && (
              <div className="onboarding-source-detail stack gap-10">
                <label className={`btn btn-soft file-label ${pdfBusy ? "is-disabled" : ""}`}>
                  {pdfBusy
                    ? `Leyendo página ${pdfProgress?.page || "…"} de ${pdfProgress?.total || "…"}`
                    : "Seleccionar PDF (máx. 12 MB)"}
                  <input type="file" accept="application/pdf,.pdf" onChange={handlePdf} disabled={pdfBusy} />
                </label>
                {pdfName && <p className="tiny-note">Archivo: {pdfName}</p>}
                <label className="field">
                  <span>Texto detectado o rutina pegada</span>
                  <textarea
                    className="input"
                    rows={8}
                    value={pdfText}
                    onChange={(event) => setPdfText(event.target.value)}
                    placeholder={"Lunes - Pecho\n- Press banca | 4 | 8-10 | 90s"}
                  />
                </label>
                <button className="btn btn-soft" type="button" onClick={() => analyzeText()} disabled={!pdfText.trim() || pdfBusy}>
                  Volver a analizar
                </button>
                {pdfError && <p className="error-text">{pdfError}</p>}
                <RoutinePreview routine={pdfRoutine} />
                {pdfRoutine?.length > 0 && (
                  <button className="btn btn-primary btn-large" type="button" onClick={() => finish(pdfRoutine, "pdf", true)}>
                    Usar y revisar en el editor
                  </button>
                )}
              </div>
            )}

            <button className="btn btn-ghost" type="button" onClick={() => { setStep(1); setSource(""); }}>
              Volver
            </button>
          </div>
        )}
      </section>
    </main>
  );
}
