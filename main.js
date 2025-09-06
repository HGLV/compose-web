/* =========================================================
   BeatLab SE — Final Version (Reviewed & Fixed)
   - Swing 0–100% (안정적)
   - 정확한 마디/박/서브 라인
   - 플레이헤드 = 셀의 "왼쪽 엣지" 정렬
   - 드럼(ride/bell 포함) 합성
   - 피아노/기타/베이스 사운드폰트 + 현실 음역대만 렌더
   - 무한 마디 증감, 저장/불러오기, 랜덤 채우기
========================================================= */

// ===== Time signature → steps per bar =====
const signatureSteps = { "4/4":16, "3/4":12, "5/4":20, "6/8":12 };

// ===== Global state (단일 선언) =====
const state = { playing:false, bpm:120, swing:0, stepIndex:0 };

// ===== Bars / signature =====
let stepsPerBar = signatureSteps["4/4"];
let bars = 2;
const totalSteps = () => stepsPerBar * bars;

// ===== Drum rows (labels) =====
const DRUMS = [
  { id:"hatc",  name:"Closed Hi-Hat" },
  { id:"hato",  name:"Open Hi-Hat"   },
  { id:"snare", name:"Snare"         },
  { id:"kick",  name:"Kick"          },
  { id:"crash", name:"Crash"         },
  { id:"ride",  name:"Ride"          },  // added
  { id:"bell",  name:"Bell"          },  // added
  { id:"tomh",  name:"High Tom"      },
  { id:"tomm",  name:"Mid Tom"       },
  { id:"toml",  name:"Low Tom"       }
];

// ===== Melody instruments & ranges (MIDI) =====
const MELODY = ["piano","guitar","bass"];
const MELODY_RANGES = {
  piano:  { min:21, max:108 }, // A0~C8
  guitar: { min:40, max:88  }, // E2~E6
  bass:   { min:28, max:67  }  // E1~G4
};

// ===== Note utils =====
const NOTE = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];
const midiToName = m => `${NOTE[m%12]}${Math.floor(m/12)-1}`;

// ===== Audio =====
const AudioContext = window.AudioContext || window.webkitAudioContext;
const ctx = new AudioContext();
const master = ctx.createGain(); master.gain.value = 0.9; master.connect(ctx.destination);

// Soundfont (melody)
const sf = { piano:null, guitar:null, bass:null }, sfLoaded = { piano:false, guitar:false, bass:false };
async function ensureSF(inst){
  if(sfLoaded[inst]) return;
  const map = { piano:"acoustic_grand_piano", guitar:"acoustic_guitar_nylon", bass:"acoustic_bass" };
  // soundfont-player 전역은 "Soundfont"로 노출됨
  sf[inst] = await Soundfont.instrument(ctx, map[inst], { gain: volumes[inst] ?? 0.8 });
  sfLoaded[inst] = true;
}

// Drum synth helpers
function noiseBuf(){
  const b=ctx.createBuffer(1,ctx.sampleRate,ctx.sampleRate), ch=b.getChannelData(0);
  for(let i=0;i<ch.length;i++) ch[i]=Math.random()*2-1;
  return b;
}
const NOISE = noiseBuf();
function noiseSrc(){ const s=ctx.createBufferSource(); s.buffer=NOISE; return s; }
function biq(type,freq,Q=1){ const f=ctx.createBiquadFilter(); f.type=type; f.frequency.value=freq; f.Q.value=Q; return f; }

function playDrum(id,time,vol=1){
  const g=ctx.createGain(); g.gain.value=(volumes.drums??0.9)*vol; g.connect(master);

  if(id==="kick"){
    const o=ctx.createOscillator(); o.type="sine"; const gn=ctx.createGain();
    o.frequency.setValueAtTime(120,time); o.frequency.exponentialRampToValueAtTime(40,time+0.15);
    gn.gain.setValueAtTime(1.2,time);     gn.gain.exponentialRampToValueAtTime(0.001,time+0.22);
    o.connect(gn); gn.connect(g); o.start(time); o.stop(time+0.25);

  }else if(id==="snare"){
    const n=noiseSrc(), hp=biq("highpass",1800), bp=biq("bandpass",3500,.8), gg=ctx.createGain();
    gg.gain.setValueAtTime(0.9,time); gg.gain.exponentialRampToValueAtTime(0.001,time+0.18);
    n.connect(hp); hp.connect(bp); bp.connect(gg); gg.connect(g); n.start(time); n.stop(time+0.2);

  }else if(id==="hatc"||id==="hato"){
    const n=noiseSrc(), hp=biq("highpass",8000), gg=ctx.createGain();
    const len = id==="hatc"?0.07:0.45;
    gg.gain.setValueAtTime(id==="hatc"?0.35:0.45,time); gg.gain.exponentialRampToValueAtTime(0.001,time+len);
    n.connect(hp); hp.connect(gg); gg.connect(g); n.start(time); n.stop(time+len);

  }else if(id==="crash"){
    const n=noiseSrc(), bp=biq("bandpass",6000,.5), gg=ctx.createGain();
    gg.gain.setValueAtTime(0.9,time); gg.gain.exponentialRampToValueAtTime(0.001,time+1.2);
    n.connect(bp); bp.connect(gg); gg.connect(g); n.start(time); n.stop(time+1.25);

  }else if(id==="ride"){
    const n=noiseSrc(), bp=biq("bandpass",7000,.9), gg=ctx.createGain();
    gg.gain.setValueAtTime(0.55,time); gg.gain.exponentialRampToValueAtTime(0.001,time+1.0);
    n.connect(bp); bp.connect(gg); gg.connect(g); n.start(time); n.stop(time+1.05);

  }else if(id==="bell"){
    const o=ctx.createOscillator(); o.type="sine"; const g2=ctx.createGain();
    o.frequency.setValueAtTime(1200,time);
    g2.gain.setValueAtTime(0.85,time); g2.gain.exponentialRampToValueAtTime(0.001,time+1.2);
    o.connect(g2); g2.connect(g); o.start(time); o.stop(time+1.25);

  }else{
    const map={tomh:[320,180],tomm:[220,140],toml:[150,90]}, [a,b]=map[id]||[200,120];
    const o=ctx.createOscillator(); o.type="sine"; const gn=ctx.createGain();
    o.frequency.setValueAtTime(a,time); o.frequency.exponentialRampToValueAtTime(b,time+0.16);
    gn.gain.setValueAtTime(0.95,time); gn.gain.exponentialRampToValueAtTime(0.001,time+0.20);
    o.connect(gn); gn.connect(g); o.start(time); o.stop(time+0.22);
  }
}

// ===== Pattern & Volumes =====
const pattern = { drums:[], piano:[], guitar:[], bass:[] };
const volumes = { drums:0.9, piano:0.8, guitar:0.78, bass:0.85 };

// ===== DOM =====
const bpmEl = document.getElementById("bpm"), bpmOut = document.getElementById("bpmOut");
const swingEl = document.getElementById("swing"), swingOut = document.getElementById("swingOut");
const sigEl = document.getElementById("signature");
const barsOut = document.getElementById("barsOut"), barsInc = document.getElementById("barsInc"), barsDec = document.getElementById("barsDec");

const grids = {
  drums:  {
    vlabels:  document.getElementById("keys-drums"),
    vscroll:  document.getElementById("vscroll-drums"),
    hscroll:  document.getElementById("hscroll-drums"),
    rows:     document.getElementById("rows-drums"),
    labels:   document.getElementById("labels-drums"),
    playhead: document.querySelector("#box-drums .playhead"),
    barlayer: document.querySelector("#box-drums .barlines")
  },
  piano:  {
    vlabels:  document.getElementById("keys-piano"),
    vscroll:  document.getElementById("vscroll-piano"),
    hscroll:  document.getElementById("hscroll-piano"),
    rows:     document.getElementById("rows-piano"),
    labels:   document.getElementById("labels-piano"),
    playhead: document.querySelector("#box-piano .playhead"),
    barlayer: document.querySelector("#box-piano .barlines")
  },
  guitar: {
    vlabels:  document.getElementById("keys-guitar"),
    vscroll:  document.getElementById("vscroll-guitar"),
    hscroll:  document.getElementById("hscroll-guitar"),
    rows:     document.getElementById("rows-guitar"),
    labels:   document.getElementById("labels-guitar"),
    playhead: document.querySelector("#box-guitar .playhead"),
    barlayer: document.querySelector("#box-guitar .barlines")
  },
  bass:   {
    vlabels:  document.getElementById("keys-bass"),
    vscroll:  document.getElementById("vscroll-bass"),
    hscroll:  document.getElementById("hscroll-bass"),
    rows:     document.getElementById("rows-bass"),
    labels:   document.getElementById("labels-bass"),
    playhead: document.querySelector("#box-bass .playhead"),
    barlayer: document.querySelector("#box-bass .barlines")
  },
};

// ===== Volumes UI =====
[
  ["drums","vol-drums","volOut-drums"],
  ["piano","vol-piano","volOut-piano"],
  ["guitar","vol-guitar","volOut-guitar"],
  ["bass","vol-bass","volOut-bass"]
].forEach(([id,rid,oid])=>{
  const r=document.getElementById(rid), o=document.getElementById(oid);
  r.addEventListener("input", ()=>{ volumes[id]=+r.value; o.textContent=(+r.value).toFixed(2); });
});

// ===== Build helpers =====
function setColsCSS(){
  Object.values(grids).forEach(ref=>{
    if(ref?.rows)   ref.rows.style.setProperty("--cols", totalSteps());
    if(ref?.labels) ref.labels.style.setProperty("--cols", totalSteps());
  });
}
function initPatternsToLength(){
  pattern.drums = Array(totalSteps()).fill(0).map(()=> new Set());
  ["piano","guitar","bass"].forEach(k=>{
    pattern[k] = Array(totalSteps()).fill(0).map(()=> new Set());
  });
}
function clampPatternToRanges(){
  MELODY.forEach(k=>{
    const {min,max} = MELODY_RANGES[k];
    for(let s=0;s<pattern[k].length;s++){
      pattern[k][s] = new Set([...pattern[k][s]].filter(m => m>=min && m<=max));
    }
  });
}

function build(){
  setColsCSS();

  // ===== Drums
  const dLabels = grids.drums.vlabels, dRows = grids.drums.rows, dNums = grids.drums.labels;
  dLabels.innerHTML = ""; dRows.innerHTML = ""; dNums.innerHTML = "";
  DRUMS.forEach(d=>{
    const key = document.createElement("div"); key.className="key"; key.textContent = d.name; dLabels.appendChild(key);
    const row = document.createElement("div"); row.className="note-row"; row.dataset.drum=d.id;
    for(let s=0;s<totalSteps();s++){
      const cell=document.createElement("button"); cell.className="cell";
      cell.dataset.step=s; cell.dataset.kind="drum"; cell.dataset.id=d.id;
      cell.addEventListener("pointerdown", toggleCell);
      if(pattern.drums[s]?.has(d.id)) cell.classList.add("on");
      row.appendChild(cell);
    }
    dRows.appendChild(row);
  });
  for(let s=0;s<totalSteps();s++){
    const lab=document.createElement("div"); lab.className="stepnum";
    lab.textContent=(s % stepsPerBar) + 1;
    if((s % Math.max(1, stepsPerBar/4))===0) lab.style.color="#9aa7d6";
    dNums.appendChild(lab);
  }
  const drumRowsCount = DRUMS.length;
  grids.drums.vlabels.style.setProperty('--rowsDef', `repeat(${drumRowsCount}, var(--rowH))`);
  grids.drums.rows.style.setProperty('--rowsDef', `repeat(${drumRowsCount}, var(--rowH))`);

  // ===== Melody tracks
  for(const k of MELODY){
    const { vlabels, rows, labels } = grids[k];
    vlabels.innerHTML=""; rows.innerHTML=""; labels.innerHTML="";
    const {min,max} = MELODY_RANGES[k];

    const notes=[]; for(let m=max; m>=min; m--) notes.push(m); // high→low
    notes.forEach(m=>{
      const key=document.createElement("div"); key.className="key"; key.textContent=midiToName(m); vlabels.appendChild(key);
      const row=document.createElement("div"); row.className="note-row"; row.dataset.midi=m;
      for(let s=0;s<totalSteps();s++){
        const cell=document.createElement("button"); cell.className="cell";
        cell.dataset.step=s; cell.dataset.kind="melody"; cell.dataset.track=k; cell.dataset.midi=m;
        cell.addEventListener("pointerdown", toggleCell);
        if(pattern[k][s]?.has(m)) cell.classList.add("on");
        row.appendChild(cell);
      }
      rows.appendChild(row);
    });

    for(let s=0;s<totalSteps();s++){
      const lab=document.createElement("div"); lab.className="stepnum";
      lab.textContent=(s % stepsPerBar) + 1;
      if((s % Math.max(1, stepsPerBar/4))===0) lab.style.color="#9aa7d6";
      labels.appendChild(lab);
    }

    const rowCount = notes.length;
    vlabels.style.setProperty('--rowsDef', `repeat(${rowCount}, var(--rowH))`);
    rows.style.setProperty('--rowsDef', `repeat(${rowCount}, var(--rowH))`);
  }

  drawBarLinesAll();
  updatePlayheads(0);
}

// ===== Toggle cell =====
function toggleCell(e){
  e.preventDefault();
  const cell = e.currentTarget;
  const step = +cell.dataset.step;
  const kind = cell.dataset.kind;

  if(kind==="drum"){
    const id = cell.dataset.id;
    const on = !cell.classList.contains("on");
    cell.classList.toggle("on", on);
    if(on) pattern.drums[step].add(id); else pattern.drums[step].delete(id);
  }else{
    const track = cell.dataset.track, midi = +cell.dataset.midi;
    const {min,max} = MELODY_RANGES[track];
    if(midi<min || midi>max) return; // safety
    const on = !cell.classList.contains("on");
    cell.classList.toggle("on", on);
    if(on) pattern[track][step].add(midi); else pattern[track][step].delete(midi);
  }
}

// ===== Transport / Playback =====
const playBtn=document.getElementById("play"), stopBtn=document.getElementById("stop");
const clearBtn=document.getElementById("clear"), randomBtn=document.getElementById("randomize");
const lookahead=25; let nextNoteTime=0, currentStep=0;

bpmEl.addEventListener("input", ()=>{ state.bpm=+bpmEl.value; bpmOut.textContent=state.bpm; });
swingEl.addEventListener("input", ()=>{ state.swing=+swingEl.value; swingOut.textContent=`${state.swing}%`; });

sigEl.addEventListener("change", ()=>{ stepsPerBar = signatureSteps[sigEl.value] || 16; rebuild(); });
barsInc.addEventListener("click", ()=>{ bars++; rebuild(); });
barsDec.addEventListener("click", ()=>{ if(bars>1){ bars--; rebuild(); } });

function rebuild(){
  barsOut.textContent = bars;
  ["drums","piano","guitar","bass"].forEach(k=>{
    const old = pattern[k] || [];
    const next = Array(totalSteps()).fill(0).map(()=> new Set());
    for(let i=0;i<Math.min(old.length,next.length);i++){ old[i]?.forEach(v=> next[i].add(v)); }
    pattern[k] = next;
  });
  clampPatternToRanges();
  build(); state.stepIndex=0; currentStep=0; updatePlayheads(0);
}

playBtn.addEventListener("click", async ()=>{
  if(ctx.state==="suspended") await ctx.resume();
  if(!state.playing) startPlayback(); else pausePlayback();
});
document.addEventListener("keydown", async (e)=>{
  if(e.code==="Space"){
    const tag = document.activeElement?.tagName?.toLowerCase();
    if(["input","select","textarea","button"].includes(tag)) return;
    e.preventDefault();
    if(ctx.state==="suspended") await ctx.resume();
    if(!state.playing) startPlayback(); else pausePlayback();
  }
});
stopBtn.addEventListener("click", ()=>{
  state.playing=false; state.stepIndex=0; currentStep=0;
  playBtn.textContent="▶ Play"; playBtn.setAttribute("aria-pressed","false");
  updatePlayheads(0);
});

clearBtn.addEventListener("click", ()=>{
  ["drums","piano","guitar","bass"].forEach(k=> pattern[k].forEach(set=> set.clear()));
  document.querySelectorAll(".cell.on").forEach(c=> c.classList.remove("on"));
  state.stepIndex=0; updatePlayheads(0); drawBarLinesAll();
});

randomBtn.addEventListener("click", ()=>{
  // 패턴 초기화
  ["drums","piano","guitar","bass"].forEach(k=> pattern[k].forEach(set=> set.clear()));

  // 드럼 확률
  const probs = {kick:0.28,snare:0.22,hatc:0.5,hato:0.18,crash:0.08,ride:0.12,bell:0.06,tomh:0.14,tomm:0.12,toml:0.1};

  for(let s=0;s<totalSteps();s++){
    // 드럼 랜덤
    DRUMS.forEach(d=>{
      if(Math.random() < (probs[d.id]||0.1)) pattern.drums[s].add(d.id);
    });

    // 멜로디 랜덤 (각 악기 음역대에서 샘플)
    MELODY.forEach(k=>{
      const {min,max} = MELODY_RANGES[k];
      if(Math.random() < 0.35){
        const step = 12; // 1옥타브 간격 샘플링
        const choices=[]; for(let m=min; m<=max; m+=step) choices.push(m);
        const pick=choices[Math.floor(Math.random()*choices.length)];
        pattern[k][s].add(pick);
      }
    });
  }

  // UI 반영
  document.querySelectorAll(".cell.on").forEach(c=> c.classList.remove("on"));
  for(let s=0;s<totalSteps();s++){
    pattern.drums[s].forEach(id=>{
      const cell=grids.drums.rows.querySelector(`.note-row[data-drum="${id}"] .cell[data-step="${s}"]`);
      if(cell) cell.classList.add("on");
    });
    MELODY.forEach(k=>{
      pattern[k][s].forEach(m=>{
        const cell=grids[k].rows.querySelector(`.note-row[data-midi="${m}"] .cell[data-step="${s}"]`);
        if(cell) cell.classList.add("on");
      });
    });
  }
  state.stepIndex=0; updatePlayheads(0); drawBarLinesAll();
});

function startPlayback(){
  nextNoteTime=ctx.currentTime+0.05; currentStep=state.stepIndex||0; state.playing=true;
  playBtn.textContent="⏸ Pause"; playBtn.setAttribute("aria-pressed","true");
}
function pausePlayback(){
  state.playing=false; playBtn.textContent="▶ Play"; playBtn.setAttribute("aria-pressed","false");
}

// Step length with swing
function stepDurationSec(stepIndex){
  const beatsPerBar = (stepsPerBar===16?4: stepsPerBar===12? (sigEl.value==="6/8"?6:3) : 5);
  const secPerBeat = 60 / (state.bpm || 120);
  const stepsPerBeat = stepsPerBar / beatsPerBar;
  const base = secPerBeat / stepsPerBeat;
  const swingRatio = Math.max(0, Math.min(1, (state.swing||0)/100)); // clamp 0..1
  const even = (stepIndex % 2 === 0);
  return base * (even ? (1 - swingRatio*0.5) : (1 + swingRatio*0.5));
}

// Scheduler
setInterval(()=>{
  if(!state.playing) return;
  while(nextNoteTime < ctx.currentTime + 0.1){
    scheduleStep(currentStep, nextNoteTime);
    nextNoteTime += stepDurationSec(currentStep);
    currentStep = (currentStep + 1) % totalSteps();
  }
}, 25);

function scheduleStep(step,time){
  // Drums
  pattern.drums[step].forEach(id=> playDrum(id,time,1));
  // Melody
  MELODY.forEach(async k=>{
    if(pattern[k][step].size===0) return;
    await ensureSF(k);
    const {min,max} = MELODY_RANGES[k];
    pattern[k][step].forEach(m=>{
      if(m>=min && m<=max) sf[k].play(midiToName(m), time, { gain: volumes[k] ?? 0.8, duration: 0.4 });
    });
  });
  enqueueUI(step,time);
}

// ===== UI sync (playhead & barlines alignment) =====
const css = getComputedStyle(document.documentElement);
const num = name => parseFloat(css.getPropertyValue(name)) || 0;
function stepLeftX(step, hscrollEl){
  return step * (num('--cellW') + num('--gap')) - (hscrollEl?.scrollLeft || 0);
}

let uiQueue=[];
function enqueueUI(step,t){ uiQueue.push({step,t}); }
function updateUI(){
  const now = ctx.currentTime;
  while(uiQueue.length && uiQueue[0].t < now){
    const {step} = uiQueue.shift();
    state.stepIndex = step;
    updatePlayheads(step);
  }
  requestAnimationFrame(updateUI);
}
function updatePlayheads(step){
  [grids.drums, grids.piano, grids.guitar, grids.bass].forEach(ref=>{
    if(ref?.playhead && ref?.hscroll){
      ref.playhead.style.transform = `translateX(${stepLeftX(step, ref.hscroll)}px)`;
    }
  });
}

// ===== Bar lines =====
function barlinePositions(sig, spb){
  const out = { strong:[0], beat:[], sub:[] };
  const [top, bottom] = sig.split('/').map(Number);

  // Compound: 6/8 (two dotted beats, each split into 3 eighths)
  if (bottom === 8 && top % 3 === 0 && top >= 6) {
    const unit = spb / 6; // six eighths per bar
    for (let i=1;i<6;i++){
      const pos = Math.round(i * unit);
      if (i === 3) out.beat.push(pos);  // mid-bar (between two dotted beats)
      else out.sub.push(pos);
    }
    return out;
  }

  // Simple meters: 3/4, 4/4, 5/4 ...
  const beats = top;
  const stepPerBeat = spb / beats;
  for (let b=1; b<beats; b++){
    out.beat.push(Math.round(b * stepPerBeat));
  }
  if (Number.isInteger(stepPerBeat/2)){ // clean half-beat subdivisions
    for (let b=0; b<beats; b++){
      const mid = Math.round(b * stepPerBeat + stepPerBeat/2);
      if (mid>0 && mid<spb) out.sub.push(mid);
    }
  }
  return out;
}

function drawBarLinesAll(){ [grids.drums, grids.piano, grids.guitar, grids.bass].forEach(drawBarLinesFor); }

function drawBarLinesFor(ref){
  const layer = ref.barlayer; if(!layer) return;
  const hscroll = ref.hscroll;
  layer.innerHTML = '';

  const spb = stepsPerBar;
  const groups = barlinePositions(sigEl.value, spb);

  for (let bar=0; bar<bars; bar++){
    addLine(bar*spb, "strong");
    groups.beat.forEach(p => addLine(bar*spb + p, "beat"));
    groups.sub.forEach(p => addLine(bar*spb + p, "sub"));
  }

  function addLine(step, klass){
    if(step<0 || step>= totalSteps()) return;
    const x = stepLeftX(step, hscroll);
    const div = document.createElement('div');
    div.className = 'barline' + (klass==="strong" ? ' strong' : klass==="beat" ? ' beat' : '');
    div.style.transform = `translateX(${x}px)`;
    layer.appendChild(div);
  }
}

// Keep barlines aligned on resize/scroll
let _barTimer=null;
function redrawBarlinesDebounced(){ clearTimeout(_barTimer); _barTimer=setTimeout(drawBarLinesAll, 16); }
window.addEventListener('resize', redrawBarlinesDebounced);
[grids.drums, grids.piano, grids.guitar, grids.bass].forEach(ref=>{
  ref.hscroll.addEventListener('scroll', ()=>{
    redrawBarlinesDebounced();
    if(ref?.playhead) ref.playhead.style.transform = `translateX(${stepLeftX(state.stepIndex, ref.hscroll)}px)`;
  });
});

// ===== Save/Load =====
document.getElementById("save").addEventListener("click", ()=>{
  const ser = { bpm:state.bpm, swing:state.swing, sig:sigEl.value, bars, volumes, pattern:serializePattern() };
  localStorage.setItem("beatlab-se-final", JSON.stringify(ser));
  flash("Saved");
});
document.getElementById("load").addEventListener("click", ()=>{
  const raw = localStorage.getItem("beatlab-se-final");
  if(!raw) return flash("No Save");
  const d = JSON.parse(raw);
  state.bpm=d.bpm??120; bpmEl.value=state.bpm; bpmOut.textContent=state.bpm;
  state.swing=d.swing??0; swingEl.value=state.swing; swingOut.textContent=`${state.swing}%`;
  sigEl.value=d.sig??"4/4"; stepsPerBar=signatureSteps[sigEl.value]||16;
  bars=d.bars??2; barsOut.textContent=bars;
  Object.assign(volumes, d.volumes||{});
  ["drums","piano","guitar","bass"].forEach(k=>{
    const r=document.getElementById(`vol-${k}`), o=document.getElementById(`volOut-${k}`);
    if(r&&o){ r.value=volumes[k]; o.textContent=(+volumes[k]).toFixed(2); }
  });
  initPatternsToLength(); deserializePattern(d.pattern);
  clampPatternToRanges();
  build(); flash("Loaded (out-of-range notes removed)");
});
function serializePattern(){
  const obj={drums:[],piano:[],guitar:[],bass:[]};
  for(let s=0;s<totalSteps();s++){ obj.drums.push([...pattern.drums[s]]); MELODY.forEach(k=> obj[k].push([...pattern[k][s]])); }
  return obj;
}
function deserializePattern(obj){
  pattern.drums = (obj.drums||[]).map(a=> new Set(a));
  MELODY.forEach(k=> pattern[k] = (obj[k]||[]).map(a=> new Set(a)));
}

// ===== Utils & Boot =====
function flash(text){
  const el=document.createElement("div");
  el.textContent=text;
  Object.assign(el.style,{position:"fixed",bottom:"18px",left:"50%",transform:"translateX(-50%)",
    background:"rgba(20,24,35,.9)",color:"#dbe4ff",padding:"10px 14px",border:"1px solid #2a3146",borderRadius:"10px",zIndex:9999});
  document.body.appendChild(el); setTimeout(()=> el.remove(), 1100);
}
/* =======================
   Drag the playhead to seek
   - 클릭/드래그로 현재 재생 스텝 변경
   - 재생 중에도 즉시 이동
======================= */

// 셀 너비/간격 읽기 (CSS 변수 → 숫자)
function _metric(name){
  const css = getComputedStyle(document.documentElement);
  return parseFloat(css.getPropertyValue(name)) || 0;
}
function stepWidth(){ return _metric('--cellW') + _metric('--gap'); }

// clientX(화면 좌표) → 스텝 번호
function clientXToStep(ref, clientX){
  const rect = ref.hscroll.getBoundingClientRect();
  // 컨테이너의 왼쪽 기준, 스크롤 보정까지 더해 실제 그리드 x 계산
  const x = (clientX - rect.left) + ref.hscroll.scrollLeft;
  const s = Math.round( x / stepWidth() );
  return Math.max(0, Math.min(totalSteps() - 1, s));
}

// 공통으로 위치 바꾸기
function setPlayPosition(step){
  state.stepIndex = step;
  // 스케줄러가 다음 틱부터 이 스텝에서 재생하도록
  // (지금 재생 중이면 약간의 리드타임 주고 이어감)
  if (state.playing){
    currentStep = step;
    nextNoteTime = ctx.currentTime + 0.05;
  }else{
    currentStep = step;
  }
  updatePlayheads(step);
}

// 드래그 상태
let _dragging = false;
let _dragRef = null;

// 포인터 다운: hscroll(트랙 어디든) 또는 playhead에서 시작
function bindDragSeek(ref){
  const start = (e)=>{
    e.preventDefault();
    _dragging = true; _dragRef = ref;
    // 첫 클릭 지점으로 즉시 점프
    const step = clientXToStep(ref, e.clientX ?? (e.touches && e.touches[0].clientX));
    setPlayPosition(step);
    // 전역 move/up 바인딩
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup',   end, { once:true });
    window.addEventListener('touchmove', move, { passive:false });
    window.addEventListener('touchend',  end, { once:true });
  };
  const move = (e)=>{
    if(!_dragging || !_dragRef) return;
    e.preventDefault();
    const x = e.clientX ?? (e.touches && e.touches[0]?.clientX);
    if(typeof x !== 'number') return;
    const step = clientXToStep(_dragRef, x);
    setPlayPosition(step);
  };
  const end = ()=>{
    _dragging = false; _dragRef = null;
    window.removeEventListener('mousemove', move);
    window.removeEventListener('touchmove', move);
    // 재생 중이면 다음 틱에 맞게 nextNoteTime은 setPlayPosition에서 이미 세팅됨
  };

  // 수평 스크롤 영역 아무 곳이나 + 플레이헤드에서 드래그 시작 가능
  ref.hscroll.addEventListener('mousedown', start);
  ref.hscroll.addEventListener('touchstart', start, { passive:false });
  ref.playhead.addEventListener('mousedown', start);
  ref.playhead.addEventListener('touchstart', start, { passive:false });
}

// 네 트랙 모두 바인딩 (build/boot 이후 1회면 충분)
[grids.drums, grids.piano, grids.guitar, grids.bass].forEach(bindDragSeek);

(function boot(){
  state.bpm=+bpmEl.value; bpmOut.textContent=state.bpm;
  swingOut.textContent=`${state.swing}%`; barsOut.textContent=bars;
  initPatternsToLength();
  clampPatternToRanges();
  build();
  updateUI();
})();
