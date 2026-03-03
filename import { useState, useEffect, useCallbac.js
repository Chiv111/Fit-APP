import { useState, useEffect, useCallback } from "react";
const ORANGE="#FF6B2B",GREEN="#00C9A7",YELLOW="#FFB800",RED="#FF3B3B",GRAY="#6B7280";
const PLAN=[{day:"LUN",full:"Lunes",type:"Fuerza",title:"Pecho, Espalda y Tric.",color:ORANGE,exercises:[{id:"chin",name:"Chin-ups",sets:"3-5",reps:"5-8",rest:"2-3min",note:"Prog. pullups RIR 3-4"},{id:"bench",name:"Bench Press Smith",sets:"5",reps:"5",rest:"2-3min",note:"5x5 RIR 3-4"},{sep:true,label:"Bi serie A"},{id:"tprono",name:"Elevaciones T prono",sets:"3",reps:"6-8",rest:"0s",note:"RIR 2"},{id:"diamante",name:"Lagartija diamante",sets:"4",reps:"1min/30s",rest:"90s-2min",note:"Con lastre RIR 2"},{sep:true,label:"Bi serie B"},{id:"flys",name:"Flys pecho maquina",sets:"3",reps:"8-10",rest:"0s",note:"RIR 1"},{id:"latpull",name:"Lat pulldown conv.",sets:"3",reps:"8-10",rest:"90s-2min",note:"RIR 1"},{sep:true,label:"Bi serie C"},{id:"triangle",name:"Pulldown triangulo",sets:"3",reps:"10-12",rest:"0s",note:"RIR 1"},{id:"pressaround",name:"Press around inf.",sets:"3",reps:"10-12",rest:"90s-2min",note:"RIR 1"}]},{day:"MAR",full:"Martes",type:"Cardio",title:"Carrera Tempo Moderada",color:GREEN,cardio:{rpe:"5-6/10",desc:"10 rondas: 1min carrera + 1min caminata",note:"En cinta: sube inclinacion en caminata"}},{day:"MIE",full:"Miercoles",type:"Fuerza",title:"Lower A - Cuadriceps",color:ORANGE,exercises:[{id:"legpress",name:"Leg press / Back Squat",sets:"5",reps:"5",rest:"2-3min",note:"5x5 RIR 3-4"},{id:"hiperext",name:"Hiperextension 45 Zercher",sets:"3",reps:"6-8",rest:"2-3min",note:"RIR 1-2"},{id:"extpierna",name:"Extensiones pierna iso.",sets:"3",reps:"6-8",rest:"2-3min",note:"RIR 1-2"},{id:"pgluteo",name:"Puente gluteo medio",sets:"2",reps:"8-10",rest:"2-3min",note:"RIR 1"},{id:"landmine",name:"Peso muerto unilat. landmine",sets:"2",reps:"8-10",rest:"2-3min",note:"RIR 1"},{id:"pantorrilla",name:"Elevaciones pantorrilla",sets:"3",reps:"8-10",rest:"2-3min",note:"RIR 1"}]},{day:"JUE",full:"Jueves",type:"Cardio Intenso",title:"Intervalos en Colina",color:RED,cardio:{rpe:"7-8/10",desc:"6 rondas: 30s sprint 80% + recupera 130LPM",note:"Sin colina: cinta 10-15% inclinacion"}},{day:"VIE",full:"Viernes",type:"Fuerza",title:"Lower B - Gluteo y Post.",color:ORANGE,exercises:[{id:"snatch",name:"Peso muerto Snatch Grip",sets:"5",reps:"5",rest:"2-3min",note:"5x5 RIR 2-3"},{id:"bstance",name:"Smith B-stance split squat",sets:"3",reps:"6-8",rest:"90s-2min",note:"RIR 1-2"},{id:"bulgara",name:"Sentadilla bulgara gluteo",sets:"2-3",reps:"6-8",rest:"90s-2min",note:"Unilateral RIR 1-2"},{id:"aductores",name:"Maquina de aductores",sets:"3",reps:"30s",rest:"90s-2min",note:"RIR 1"},{id:"curlpierna",name:"Curl piernas acostado unilat.",sets:"2-3",reps:"8-10",rest:"90s-2min",note:"RIR 1"},{id:"crunchbanca",name:"Crunch banca con disco",sets:"2",reps:"8-10",rest:"90s-2min",note:"RIR 1"}]},{day:"SAB",full:"Sabado",type:"Fuerza",title:"Biceps, Triceps y Antebrazo",color:ORANGE,exercises:[{sep:true,label:"Triserie Triceps"},{id:"rompecraneos",name:"Rompe craneos mancuernas",sets:"3",reps:"8-12",rest:"0s",note:"RIR 1-2"},{id:"pressfrance",name:"Press frances rompe narices",sets:"3",reps:"8-12",rest:"0s",note:"RIR 1-2"},{id:"presscerrado",name:"Press cerrado mancuernas",sets:"3",reps:"max",rest:"90s-2min",note:"RIR 1-2"},{sep:true,label:"Bi serie Biceps"},{id:"curlspider",name:"Curl spider unilateral",sets:"3",reps:"8-12",rest:"0s",note:"Contra banca"},{id:"curlespalda",name:"Curl apoyo en espalda",sets:"3",reps:"8-12",rest:"90s-2min",note:""},{sep:true,label:"Antebrazo"},{id:"flexmuneca",name:"Flexion de muneca",sets:"3",reps:"10-15+hold",rest:"",note:"RIR 1-2"},{id:"extmuneca",name:"Extension de muneca",sets:"3",reps:"10-15+hold",rest:"",note:"RIR 1-2"},{id:"deadhang",name:"Dead hang",sets:"3",reps:"max hold",rest:"",note:"RIR 0-1"}]},{day:"DOM",full:"Domingo",type:"Opcional",title:"Zona 2 o Descanso",color:GRAY,cardio:{rpe:"3-5/10",desc:"30 min bici / caminata inclinada / remo",note:"Si el cuerpo pide descanso, descansa"}}];
const SK="sebfit-v1";
async function loadLogs(){try{const r=await window.storage.get(SK);return r?JSON.parse(r.value):{}}catch{return {}}}
async function saveLogs(d){try{await window.storage.set(SK,JSON.stringify(d))}catch{}}
function lk(w,di,id){return "w"+w+"_d"+di+"_"+id}
function Pill({children,accent}){return(<span style={{background:accent?ORANGE+"18":"#1e1e1e",color:accent?ORANGE:"#777",borderRadius:4,padding:"2px 7px",fontSize:10,fontFamily:"monospace"}}>{children}</span>)}
function ExRow({ex,di,week,logs,onLog,onRemove}){
  const[w,sw]=useState("");const[r,sr]=useState("");
  const k=lk(week,di,ex.id);const sets=logs[k]||[];
  const pk=lk(week-1,di,ex.id);const prev=week>1?(logs[pk]||[]):[];
  let trend=null;
  if(sets.length>0&&prev.length>0){const an=sets.reduce((a,s)=>a+parseFloat(s.w||0),0)/sets.length;const ap=prev.reduce((a,s)=>a+parseFloat(s.w||0),0)/prev.length;const d=an-ap;if(d>0)trend={l:"↑ +"+d.toFixed(1)+"kg",c:GREEN};else if(d<0)trend={l:"↓ "+d.toFixed(1)+"kg",c:RED};else trend={l:"= igual",c:YELLOW};}
  const handle=()=>{if(!w||!r)return;onLog(k,{w,r,ts:Date.now()});sw("");sr("");};
  return(<div style={{padding:"12px 16px",borderBottom:"1px solid #161616"}}>
    <div style={{fontSize:14,fontWeight:600,marginBottom:6}}>{ex.name}</div>
    <div style={{display:"flex",gap:5,flexWrap:"wrap",marginBottom:ex.note?5:8}}><Pill accent>{ex.sets} series</Pill><Pill>{ex.reps} reps</Pill>{ex.rest&&<Pill>{ex.rest}</Pill>}</div>
    {ex.note&&<div style={{fontSize:10,color:"#555",fontFamily:"monospace",marginBottom:8}}>{ex.note}</div>}
    {(sets.length>0||prev.length>0)&&<div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8,padding:"6px 8px",background:"#0e0e0e",borderRadius:6}}>
      {sets.length>0?(<><span style={{fontSize:10,color:"#555",fontFamily:"monospace"}}>Ultima:</span><span style={{fontSize:11,fontFamily:"monospace",color:ORANGE,fontWeight:700}}>{sets[sets.length-1].w}kg x {sets[sets.length-1].r}reps</span>{trend&&<span style={{fontSize:10,fontFamily:"monospace",color:trend.c}}>{trend.l}</span>}</>):(<><span style={{fontSize:10,color:"#555",fontFamily:"monospace"}}>Sem ant.:</span><span style={{fontSize:11,fontFamily:"monospace",color:"#666"}}>{prev[prev.length-1].w}kg x {prev[prev.length-1].r}reps</span></>)}
    </div>}
    {sets.length>0&&<div style={{display:"flex",flexWrap:"wrap",gap:5,marginBottom:8}}>{sets.map((s,i)=>(<div key={i} style={{display:"flex",alignItems:"center",gap:4,background:"#1a1a1a",borderRadius:4,padding:"3px 8px"}}><span style={{fontSize:11,fontFamily:"monospace",color:"#aaa"}}>S{i+1}: {s.w}kg x {s.r}</span><button onClick={()=>onRemove(k,i)} style={{background:"none",border:"none",color:"#555",cursor:"pointer",fontSize:13,padding:0}}>x</button></div>))}</div>}
    <div style={{background:"#0e0e0e",borderRadius:8,padding:10,border:"1px solid #1e1e1e"}}>
      <div style={{display:"flex",gap:8,alignItems:"flex-end"}}>
        <div style={{flex:1}}><div style={{fontSize:9,color:"#555",fontFamily:"monospace",letterSpacing:1,marginBottom:4}}>PESO (kg)</div><input type="number" inputMode="decimal" placeholder="ej: 40" value={w} onChange={e=>sw(e.target.value)} style={{width:"100%",background:"#111",border:"1px solid #222",borderRadius:6,padding:"8px 10px",color:"#f5f0e8",fontSize:15,fontFamily:"inherit",outline:"none"}}/></div>
        <div style={{flex:1}}><div style={{fontSize:9,color:"#555",fontFamily:"monospace",letterSpacing:1,marginBottom:4}}>REPS</div><input type="number" inputMode="numeric" placeholder="ej: 8" value={r} onChange={e=>sr(e.target.value)} style={{width:"100%",background:"#111",border:"1px solid #222",borderRadius:6,padding:"8px 10px",color:"#f5f0e8",fontSize:15,fontFamily:"inherit",outline:"none"}}/></div>
        <button onClick={handle} style={{background:ORANGE,color:"#fff",border:"none",borderRadius:6,padding:"10px 14px",fontSize:12,fontFamily:"monospace",fontWeight:700,cursor:"pointer",whiteSpace:"nowrap"}}>+ Set</button>
      </div>
    </div>
  </div>);
}
export default function App(){
  const[tab,setTab]=useState("rutina");
  const[di,setDi]=useState(0);
  const[week,setWeek]=useState(1);
  const[logs,setLogs]=useState({});
  const[loaded,setLoaded]=useState(false);
  useEffect(()=>{loadLogs().then(d=>{setLogs(d);setLoaded(true);})},[]);
  useEffect(()=>{if(loaded)saveLogs(logs)},[logs,loaded]);
  const onLog=useCallback((k,e)=>setLogs(p=>({...p,[k]:[...(p[k]||[]),e]})),[]);
  const onRemove=useCallback((k,idx)=>setLogs(p=>{const a=[...(p[k]||[])];a.splice(idx,1);return{...p,[k]:a}}),[]);
  const hasData=(dii,wk)=>{const d=PLAN[dii];if(!d.exercises)return false;return d.exercises.some(e=>!e.sep&&(logs[lk(wk,dii,e.id)]||[]).length>0)};
  const day=PLAN[di];
  const S={bg:"#0A0A0A",fg:"#F5F0E8",card:"#111",border:"#1a1a1a",sep:"#0e0e0e"};
  const tabs=[["rutina","Rutina"],["historial","Historial"],["dieta","Dieta"],["reglas","Reglas"]];
  return(<div style={{background:S.bg,minHeight:"100vh",color:S.fg,fontFamily:"-apple-system,Georgia,serif",maxWidth:480,margin:"0 auto"}}>
    <div style={{background:"linear-gradient(180deg,#111 0%,#0A0A0A 100%)",padding:"18px 20px 14px",borderBottom:"1px solid "+S.border,position:"sticky",top:0,zIndex:200}}>
      <div style={{fontSize:10,letterSpacing:4,color:ORANGE,fontFamily:"monospace",textTransform:"uppercase"}}>PLAN ELITE · FASE 1</div>
      <div style={{fontSize:24,fontWeight:900,letterSpacing:-.5}}>Sebastian <span style={{color:ORANGE}}>Fit</span></div>
      <div style={{fontSize:11,color:"#444",fontFamily:"monospace",marginTop:3}}>78kg to 68kg · 16:8 Ayuno · 4-6pm Gym</div>
    </div>
    <div style={{display:"flex",gap:5,padding:"10px 14px",background:S.bg,position:"sticky",top:82,zIndex:190,borderBottom:"1px solid #111"}}>
      {tabs.map(([id,l])=>(<button key={id} onClick={()=>setTab(id)} style={{flex:1,padding:"8px 3px",borderRadius:6,border:"1px solid "+(tab===id?ORANGE:"#222"),background:tab===id?ORANGE:"transparent",color:tab===id?"#fff":"#555",fontFamily:"monospace",fontSize:10,letterSpacing:1,textTransform:"uppercase",cursor:"pointer"}}>{l}</button>))}
    </div>
    {tab==="rutina"&&<div style={{padding:14}}>
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:14,padding:"10px 14px",background:S.card,borderRadius:8,border:"1px solid "+S.border}}>
        <button onClick={()=>setWeek(w=>Math.max(1,w-1))} style={{background:S.sep,border:"1px solid #222",color:"#888",borderRadius:6,padding:"6px 12px",fontFamily:"monospace",fontSize:12,cursor:"pointer"}}>←</button>
        <div style={{flex:1,textAlign:"center",fontFamily:"monospace",fontSize:13,color:ORANGE,fontWeight:700}}>Semana {week}</div>
        <button onClick={()=>setWeek(w=>w+1)} style={{background:S.sep,border:"1px solid #222",color:"#888",borderRadius:6,padding:"6px 12px",fontFamily:"monospace",fontSize:12,cursor:"pointer"}}>→</button>
      </div>
      <div style={{display:"flex",gap:7,overflowX:"auto",paddingBottom:4,marginBottom:14,scrollbarWidth:"none"}}>
        {PLAN.map((d,i)=>(<button key={i} onClick={()=>setDi(i)} style={{flexShrink:0,padding:"9px 13px",borderRadius:8,border:"1px solid "+(di===i?d.color:"#222"),background:S.card,color:di===i?d.color:"#555",fontFamily:"monospace",fontSize:11,fontWeight:700,cursor:"pointer",position:"relative"}}>
          {d.day}{hasData(i,week)&&<div style={{position:"absolute",top:4,right:4,width:5,height:5,borderRadius:"50%",background:GREEN}}/>}
        </button>))}
      </div>
      <div style={{background:S.card,borderRadius:10,padding:"14px 16px",marginBottom:12,display:"flex",justifyContent:"space-between",alignItems:"flex-start",border:"1px solid "+day.color+"22",borderLeft:"3px solid "+day.color}}>
        <div><div style={{fontSize:10,fontFamily:"monospace",letterSpacing:2,color:day.color,marginBottom:2}}>{day.full} · {day.type}</div><div style={{fontSize:19,fontWeight:700}}>{day.title}</div></div>
        <div style={{background:S.bg,border:"1px solid "+S.border,borderRadius:8,padding:"7px 10px",textAlign:"center"}}><div style={{fontSize:9,color:"#444",fontFamily:"monospace"}}>PASEO</div><div style={{fontSize:11,color:GREEN,fontFamily:"monospace",marginTop:1}}>30min Z2</div></div>
      </div>
      {day.cardio&&<div style={{background:S.card,border:"1px solid "+S.border,borderRadius:10,overflow:"hidden"}}>
        <div style={{padding:"14px 16px",borderBottom:"1px solid "+S.border,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div style={{fontSize:14,fontWeight:700,flex:1,marginRight:8}}>{day.cardio.desc}</div>
          <span style={{background:day.color+"22",color:day.color,fontSize:10,padding:"3px 8px",borderRadius:4,fontFamily:"monospace",flexShrink:0}}>RPE {day.cardio.rpe}</span>
        </div>
        <div style={{padding:"10px 16px",fontSize:11,color:"#555",fontStyle:"italic"}}>* {day.cardio.note}</div>
      </div>}
      {day.exercises&&<div style={{background:S.card,border:"1px solid "+S.border,borderRadius:10,overflow:"hidden"}}>
        {day.exercises.map((ex,i)=>ex.sep?<div key={i} style={{padding:"6px 16px",background:S.sep,fontSize:10,color:ORANGE,fontFamily:"monospace",letterSpacing:3,textTransform:"uppercase"}}>{ex.label}</div>:<ExRow key={ex.id} ex={ex} di={di} week={week} logs={logs} onLog={onLog} onRemove={onRemove}/>)}
        <div style={{padding:"10px 16px",background:S.sep,fontSize:11,color:"#555",borderTop:"1px solid "+S.border}}><span style={{color:ORANGE}}>CALENTAMIENTO:</span> 5-8min cardio + series 50% → 75% → 90%</div>
      </div>}
    </div>}
    {tab==="historial"&&<div style={{padding:14}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
        <div><div style={{fontSize:10,color:ORANGE,fontFamily:"monospace",letterSpacing:2,marginBottom:2}}>PROGRESO REGISTRADO</div><div style={{fontSize:18,fontWeight:700}}>Historial de pesos</div></div>
        <button onClick={()=>{if(window.confirm("Borrar TODOS los registros?"))setLogs({})}} style={{background:"transparent",border:"1px solid #2a1a1a",color:"#663333",borderRadius:6,padding:"6px 10px",fontSize:10,fontFamily:"monospace",cursor:"pointer"}}>Borrar todo</button>
      </div>
      {PLAN.filter(d=>d.exercises).map((d,di2)=>{
        const exs=d.exercises.filter(ex=>!ex.sep&&Array.from({length:week+3},(_,w)=>w+1).some(wk=>(logs[lk(wk,di2,ex.id)]||[]).length>0));
        if(!exs.length)return null;
        return(<div key={di2} style={{background:S.card,border:"1px solid "+S.border,borderRadius:10,marginBottom:12,overflow:"hidden"}}>
          <div style={{padding:"12px 16px",borderBottom:"1px solid "+S.border}}><div style={{fontSize:10,color:d.color,fontFamily:"monospace",letterSpacing:2,marginBottom:2}}>{d.full}</div><div style={{fontSize:15,fontWeight:700}}>{d.title}</div></div>
          {exs.map(ex=>{
            const entries=Array.from({length:week+3},(_,i)=>i+1).map(wk=>({wk,sets:logs[lk(wk,di2,ex.id)]||[]})).filter(e=>e.sets.length>0);
            if(!entries.length)return null;
            return(<div key={ex.id} style={{padding:"12px 16px",borderBottom:"1px solid #141414"}}>
              <div style={{fontSize:13,fontWeight:600,marginBottom:8}}>{ex.name}</div>
              <div style={{display:"flex",flexDirection:"column",gap:6}}>
                {entries.map(({wk,sets})=>{const mx=Math.max(...sets.map(s=>parseFloat(s.w)||0));return(<div key={wk} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"7px 10px",background:S.sep,borderRadius:6}}>
                  <span style={{fontSize:10,color:"#555",fontFamily:"monospace",width:55,flexShrink:0}}>Sem {wk}</span>
                  <div style={{display:"flex",gap:4,flexWrap:"wrap",flex:1}}>{sets.map((s,si)=>(<span key={si} style={{fontSize:10,fontFamily:"monospace",color:parseFloat(s.w)===mx?GREEN:"#888",background:"#1a1a1a",padding:"2px 6px",borderRadius:4}}>{s.w}kg x {s.r}</span>))}</div>
                </div>);})}
              </div>
            </div>);
          })}
        </div>);
      })}
      {!Object.keys(logs).length&&<div style={{textAlign:"center",padding:48,color:"#444",fontFamily:"monospace",fontSize:13,lineHeight:1.8}}>Aun no hay registros.
Ve a Rutina y empieza
a loggear tus series.</div>}
    </div>}
    {tab==="dieta"&&<div style={{padding:14}}>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:14}}>
        {[{l:"CALORIAS",v:"1,750",u:"kcal/dia",c:ORANGE},{l:"PROTEINA",v:"160g",u:"prioridad #1",c:GREEN},{l:"CARBOS",v:"130g",u:"timing importa",c:YELLOW},{l:"GRASAS",v:"55g",u:"ya en comida",c:"#A78BFA"}].map(m=>(<div key={m.l} style={{background:S.card,border:"1px solid "+m.c+"22",borderRadius:10,padding:14}}><div style={{fontSize:10,color:"#555",fontFamily:"monospace",letterSpacing:2,marginBottom:3}}>{m.l}</div><div style={{fontSize:26,fontWeight:900,color:m.c,lineHeight:1}}>{m.v}</div><div style={{fontSize:10,color:"#444",fontFamily:"monospace",marginTop:2}}>{m.u}</div></div>))}
      </div>
      {[{time:"8-10 AM",title:"Desayuno - Rompe Ayuno",kcal:"~600 kcal",prot:"~50g",opts:[{l:"Opcion A",d:"3 huevos + 2 claras con espinaca/champinones + 2 tortillas maiz + cafe negro"},{l:"Opcion B",d:"Leche descremada + 2 huevos cocidos + fruta + avena"},{l:"Opcion C (finde)",d:"Chilaquiles con pollo deshebrado, tortillas al horno, salsa verde"}]},{time:"7-8 PM POST-GYM",title:"Cena - Comida Fuerte",kcal:"~950 kcal",prot:"~80g",opts:[{l:"Proteina",d:"250g pechuga pollo / 200g arrachera / 250g lomo cerdo"},{l:"Carbos",d:"3-4 tortillas maiz / 1 taza arroz / 1 papa al horno"},{l:"Verduras sin limite",d:"Congeladas salteadas con ajo y aceite de oliva"}]}].map((meal,mi)=>(<div key={mi} style={{background:S.card,border:"1px solid "+S.border,borderRadius:10,marginBottom:12,overflow:"hidden"}}>
        <div style={{padding:"14px 16px",borderBottom:"1px solid "+S.border,display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}><div><div style={{fontSize:10,color:YELLOW,fontFamily:"monospace",letterSpacing:2,marginBottom:2}}>{meal.time}</div><div style={{fontSize:17,fontWeight:700}}>{meal.title}</div></div><div style={{textAlign:"right"}}><div style={{fontSize:11,color:ORANGE,fontFamily:"monospace"}}>{meal.kcal}</div><div style={{fontSize:10,color:GREEN,fontFamily:"monospace"}}>{meal.prot} prot.</div></div></div>
        {meal.opts.map((o,oi)=>(<div key={oi} style={{padding:"12px 16px",borderBottom:oi<meal.opts.length-1?"1px solid #141414":"none"}}><div style={{fontSize:10,color:ORANGE,fontFamily:"monospace",letterSpacing:1,marginBottom:3}}>{o.l}</div><div style={{fontSize:13,color:"#CCC",lineHeight:1.5}}>{o.d}</div></div>))}
      </div>))}
      <div style={{background:S.card,border:"1px solid "+S.border,borderRadius:10,overflow:"hidden"}}><div style={{padding:"14px 16px",borderBottom:"1px solid "+S.border}}><div style={{fontSize:10,color:"#444",fontFamily:"monospace",letterSpacing:2}}>LISTA DE COMPRAS</div><div style={{fontSize:15,fontWeight:700,marginTop:2}}>~00 MXN / semana</div></div><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:9,padding:"14px 16px"}}>{["Huevos 30 pzas","Pechuga pollo 1kg","Carne magra 500g","Tortillas de maiz","Verduras cong x2","Avena","Leche descremada","Requeson/panela","Cafe","Aceite de oliva","Ajo","Salsa verde"].map(item=>(<div key={item} style={{display:"flex",alignItems:"center",gap:7,fontSize:12,color:"#aaa"}}><div style={{width:6,height:6,borderRadius:"50%",background:ORANGE,flexShrink:0}}/>{item}</div>))}</div></div>
    </div>}
    {tab==="reglas"&&<div style={{padding:14}}>
      {[{i:"⏰",t:"Ayuno 16:8",d:"Solo comer 8-10am y 7-8pm. Agua, cafe negro y te sin azucar libres todo el dia."},{i:"🐕",t:"Paseo del perro = Zona 2 gratis",d:"30 min diarios en ayuno matutino. Grasa quemada directamente."},{i:"💧",t:"Hidratacion",d:"Minimo 2.5L de agua al dia. Electrolitos sin calorias si entrenas fuerte."},{i:"🚫",t:"Fuera del plan",d:"Pan Bimbo eliminado. Frituras eliminadas. Calorias vacias sin proteina."},{i:"🧠",t:"Snack anti-estres",d:"Requeson o jocoque + pepino/zanahoria siempre listo en el refri."},{i:"😴",t:"Sueno 7-8 hrs",d:"El cortisol alto acumula grasa abdominal directamente."}].map((r,i)=>(<div key={i} style={{background:S.card,border:"1px solid "+S.border,borderRadius:10,padding:16,marginBottom:10,display:"flex",gap:12,alignItems:"flex-start"}}><span style={{fontSize:24,flexShrink:0}}>{r.i}</span><div><div style={{fontSize:14,fontWeight:700,marginBottom:4}}>{r.t}</div><div style={{fontSize:12,color:"#888",lineHeight:1.6}}>{r.d}</div></div></div>))}
      <div style={{background:S.card,border:"1px solid "+ORANGE+"22",borderLeft:"3px solid "+ORANGE,borderRadius:10,padding:16,marginBottom:12}}><div style={{fontSize:10,color:ORANGE,fontFamily:"monospace",letterSpacing:3,marginBottom:12}}>EXPECTATIVAS</div>{[{w:"Sem 1-2",r:"Adaptacion al ayuno. Baja 1-2kg (agua y glucogeno)."},{w:"Sem 3-4",r:"Energia estable. Grasa se mueve. -1kg real."},{w:"Mes 2",r:"Definicion visible. Ropa suelta. -3-4kg."},{w:"Mes 2.5",r:"Abs visibles si la dieta es consistente."}].map((p,i,a)=>(<div key={i} style={{display:"flex",gap:12,padding:"10px 0",borderBottom:i<a.length-1?"1px solid #161616":"none"}}><div style={{width:70,flexShrink:0,fontSize:10,color:ORANGE,fontFamily:"monospace",paddingTop:2}}>{p.w}</div><div style={{fontSize:12,color:"#aaa",lineHeight:1.5}}>{p.r}</div></div>))}</div>
      <div style={{background:S.card,border:"1px solid "+GREEN+"22",borderLeft:"3px solid "+GREEN,borderRadius:10,padding:16}}><div style={{fontSize:10,color:GREEN,fontFamily:"monospace",letterSpacing:3,marginBottom:8}}>ANTI-REBOTE</div><div style={{fontSize:12,color:"#888",lineHeight:1.8}}>El 75 Hard funciono pero rebotaste porque era restriccion extrema. Este plan usa comida mexicana de todos los dias — pollo, huevo, tortilla, verdura. Puedes comer esto toda la vida sin sentirlo como dieta. Esa es la diferencia entre bajar peso y transformar tu cuerpo permanentemente.</div></div>
    </div>}
  </div>);
}