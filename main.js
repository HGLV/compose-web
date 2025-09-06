/* =========================================================
   BeatLab SE — Fixed Playhead & Safe Instrument Ranges
========================================================= */

// ------- Global -------
const signatureSteps = { "4/4":16, "3/4":12, "5/4":20, "6/8":12 };
let stepsPerBar = signatureSteps["4/4"];
let bars = 2;
const totalSteps = () => stepsPerBar * bars;

// 드럼 라벨
const DRUMS = [
  { id:"hatc",  name:"Closed Hi-Hat" },
  { id:"hato",  name:"Open Hi-Hat"   },
  { id:"snare", name:"Snare"         },
  { id:"kick",  name:"Kick"          },
  { id:"crash", name:"Crash"         },
  { id:"tomh",  name:"High Tom"      },
  { id:"tomm",  name:"Mid Tom"       },
  { id:"toml",  name:"Low Tom"       }
];

// 멜로디 트랙 & 음역대(사운드폰트 현실치)
const MELODY = ["piano","guitar","bass"];
const MELODY_RANGES = {
  piano:  { min:21, max:108 }, // A0~C8
  guitar: { min:40, max:88  }, // E2~E6
  bass:   { min:28, max:67  }  // E1~G4
};

const NOTE = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];
const midiToName = m => `${NOTE[m%12]}${Math.floor(m/12)-1}`;

// ------- state (단일 선언) -------
const state = { playing:false, bpm:120, swing:0, stepIndex:0 };

// ------- Audio -------
const AudioContext = window.AudioContext || window.webkitAudioContext;
const ctx = new AudioContext();
const master = ctx.createGain(); master.gain.value = 0.9; master.connect(ctx.destination);

// 사운드폰트
const sf = { piano:null, guitar:null, bass:null }, sfLoaded = { piano:false, guitar:false, bass:false };
async function ensureSF(inst){
  if(sfLoaded[inst]) return;
  const map = { piano:"acoustic_grand_piano", guitar:"acoustic_guitar_nylon", bass:"acoustic_bass" };
  sf[inst] = await Soundfont.instrument(ctx, map[inst], { gain: volumes[inst] ?? 0.8 });
  sfLoaded[inst] = true;
}

// 드럼 합성기
function noiseBuf(){ const b=ctx.createBuffer(1,ctx.sampleRate,ctx.sampleRate), ch=b.getChannelData(0); for(let i=0;i<ch.length;i++) ch[i]=Math.random()*2-1; return b; }
const NOISE = noiseBuf();
function noiseSrc(){ const s=ctx.createBufferSource(); s.buffer=NOISE; return s; }
function biq(type,freq,Q=1){ const f=ctx.createBiquadFilter(); f.type=type; f.frequency.value=freq; f.Q.value=Q; return f; }

function playDrum(id,time,vol=1){
  const g=ctx.createGain(); g.gain.value=(volumes.drums??0.9)*vol; g.connect(master);
  if(id==="kick"){ const o=ctx.createOscillator(); o.type="sine"; const gn=ctx.createGain();
    o.frequency.setValueAtTime(120,time); o.frequency.exponentialRampToValueAtTime(40,time+0.15);
    gn.gain.setValueAtTime(1.2,time); gn.gain.exponentialRampToValueAtTime(0.001,time+0.22);
    o.connect(gn); gn.connect(g); o.start(time); o.stop(time+0.25);
  }else if(id==="snare"){ const n=noiseSrc(), hp=biq("highpass",1800), bp=biq("bandpass",3500,.8), gg=ctx.createGain();
    gg.gain.setValueAtTime(0.9,time); gg.gain.exponentialRampToValueAtTime(0.001,time+0.18);
    n.connect(hp); hp.connect(bp); bp.connect(gg); gg.connect(g); n.start(time); n.stop(time+0.2);
  }else if(id==="hatc"||id==="hato"){ const n=noiseSrc(), hp=biq("highpass",8000), gg=ctx.createGain();
    gg.gain.setValueAtTime(id==="hatc"?0.35:0.45,time); gg.gain.exponentialRampToValueAtTime(0.001,time+(id==="hatc"?0.07:0.45));
    n.connect(hp); hp.connect(gg); gg.connect(g); n.start(time); n.stop(time+(id==="hatc"?0.07:0.45));
  }else if(id==="crash"){ const n=noiseSrc(), bp=biq("bandpass",6000,.5), gg=ctx.createGain();
    gg.gain.setValueAtTime(0.9,time); gg.gain.exponentialRampToValueAtTime(0.001,time+1.2);
    n.connect(bp); bp.connect(gg); gg.connect(g); n.start(time); n.stop(time+1.25);
  }else{ const map={tomh:[320,180],tomm:[220,140],toml:[150,90]},[a,b]=map[id]||[200,120];
    const o=ctx.createOscillator(); o.type="sine"; const gn=ctx.createGain();
    o.frequency.setValueAtTime(a,time); o.frequency.exponentialRampToValueAtTime(b,time+0.16);
    gn.gain.setValueAtTime(0.95,time); gn.gain.exponentialRampToValueAtTime(0.001,time+0.20);
    o.connect(gn); gn.connect(g); o.start(time); o.stop(time+0.22);
  }
}

// ------- Pattern & Volumes -------
const pattern = { drums:[], piano:[], guitar:[], bass:[] };
const volumes = { drums:0.9, piano:0.8, guitar:0.78, bass:0.85 };

// ------- DOM -------
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

// 볼륨
[
  ["drums","vol-drums","volOut-drums"],
  ["piano","vol-piano","volOut-piano"],
  ["guitar","vol-guitar","volOut-guitar"],
  ["bass","vol-bass","volOut-bass"]
].forEach(([id,rid,oid])=>{
  const r=document.getElementById(rid), o=document.getElementById(oid);
  r.addEventListener("input", ()=>{ volumes[id]=+r.value; o.textContent=(+r.value).toFixed(2); });
});

// ------- Build -------
function setColsCSS(){
  Object.values(grids).forEach(ref=>{
    ref.rows.style.setProperty("--cols", totalSteps());
    ref.labels.style.setProperty("--cols", totalSteps());
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

  // DRUMS
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

  // MELODY (악기 음역대에 맞춰 행 생성)
  for(const k of MELODY){
    const { vlabels, rows, labels } = grids[k];
    vlabels.innerHTML=""; rows.innerHTML=""; labels.innerHTML="";
    const {min,max} = MELODY_RANGES[k];

    const notes=[]; for(let m=max; m>=min; m--) notes.push(m);
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
  }

  drawBarLinesAll();           // 현재 CSS로 숨김 상태
  updatePlayheads(0);
}

// 토글
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
    if(midi<min || midi>max) return; // 음역 밖은 입력 불가(행 자체가 없지만 안전망)
    const on = !cell.classList.contains("on");
    cell.classList.toggle("on", on);
    if(on) pattern[track][step].add(midi); else pattern[track][step].delete(midi);
  }
}

// ------- Transport -------
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
  for(let s=0;s<totalSteps();s++){
    // 드럼 랜덤
    const probs = {kick:0.28,snare:0.22,hatc:0.5,hato:0.18,crash:0.08,tomh:0.14,tomm:0.12,toml:0.1};
    DRUMS.forEach(d=>{ if(Math.random() < (probs[d.id]||0.1)) pattern.drums[s].add(d.id); });

    // 멜로디 랜덤 (각 악기 음역대 안에서만)
    MELODY.forEach(k=>{
      const {min,max} = MELODY_RANGES[k];
      if(Math.random()<0.35){
        const step = 12; // 한 옥타브 간격 샘플링
        const choices=[]; for(let m=min; m<=max; m+=step) choices.push(m);
        const pick=choices[Math.floor(Math.random()*choices.length)];
        pattern[k][s].add(pick);
      }
    });
  }
  document.querySelectorAll(".cell").forEach(c=> c.classList.remove("on"));
  for(let s=0;s<totalSteps();s++){
    pattern.drums[s].forEach(id=>{
      const cell=grids.drums.rows.querySelector(`.note-row[data-drum="${id}"] .cell[data-step="${s}"]`); cell?.classList.add("on");
    });
    MELODY.forEach(k=>{
      pattern[k][s].forEach(m=>{
        const cell=grids[k].rows.querySelector(`.note-row[data-midi="${m}"] .cell[data-step="${s}"]`); cell?.classList.add("on");
      });
    });
  }
  state.stepIndex=0; updatePlayheads(0); drawBarLinesAll();
});

function startPlayback(){ nextNoteTime=ctx.currentTime+0.05; currentStep=state.stepIndex||0; state.playing=true;
  playBtn.textContent="⏸ Pause"; playBtn.setAttribute("aria-pressed","true"); }
function pausePlayback(){ state.playing=false; playBtn.textContent="▶ Play"; playBtn.setAttribute("aria-pressed","false"); }

function stepDurationSec(stepIndex){
  const beatsPerBar = (stepsPerBar===16?4: stepsPerBar===12? (sigEl.value==="6/8"?6:3) : 5);
  const secPerBeat = 60 / (state.bpm || 120);
  const stepsPerBeat = stepsPerBar / beatsPerBar;
  const base = secPerBeat / stepsPerBeat;
  const swingRatio = (state.swing||0)/100;
  const even = (stepIndex % 2 === 0);
  return base * (even ? (1 - swingRatio*0.5) : (1 + swingRatio*0.5));
}
setInterval(()=>{
  if(!state.playing) return;
  while(nextNoteTime < ctx.currentTime + 0.1){
    scheduleStep(currentStep, nextNoteTime);
    nextNoteTime += stepDurationSec(currentStep);
    currentStep = (currentStep + 1) % totalSteps();
  }
}, 25);

function scheduleStep(step,time){
  // 드럼
  pattern.drums[step].forEach(id=> playDrum(id,time,1));
  // 멜로디(음역 체크)
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

// ------- UI sync (플레이헤드 = 칸의 가장 왼쪽) -------
const css = getComputedStyle(document.documentElement);
const num = name => parseFloat(css.getPropertyValue(name));
function stepLeftX(step, hscrollEl){
  // padding을 더하지 않는다: playhead는 셀의 왼쪽 엣지에 정렬
  return step * (num('--cellW') + num('--gap')) - hscrollEl.scrollLeft;
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
    ref.playhead.style.transform = `translateX(${stepLeftX(step, ref.hscroll)}px)`;
  });
}

// ===== (구분선 함수는 남겨두되 CSS로 비표시) =====
function drawBarLinesAll(){ [grids.drums, grids.piano, grids.guitar, grids.bass].forEach(drawBarLinesFor); }
function drawBarLinesFor(ref){
  const layer = ref.barlayer; if(!layer) return; layer.innerHTML='';
  // 남겨두지만 화면에는 style.css에서 숨김 처리
}

// ------- Save/Load -------
document.getElementById("save").addEventListener("click", ()=>{
  const ser = { bpm:state.bpm, swing:state.swing, sig:sigEl.value, bars, volumes, pattern:serializePattern() };
  localStorage.setItem("beatlab-se-fixed", JSON.stringify(ser));
  flash("Saved");
});
document.getElementById("load").addEventListener("click", ()=>{
  const raw = localStorage.getItem("beatlab-se-fixed");
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
  clampPatternToRanges(); // 불러올 때도 음역 밖 노트 제거
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

// ------- Utils & Boot -------
function flash(text){
  const el=document.createElement("div");
  el.textContent=text;
  Object.assign(el.style,{position:"fixed",bottom:"18px",left:"50%",transform:"translateX(-50%)",
    background:"rgba(20,24,35,.9)",color:"#dbe4ff",padding:"10px 14px",border:"1px solid #2a3146",borderRadius:"10px",zIndex:9999});
  document.body.appendChild(el); setTimeout(()=> el.remove(), 1100);
}

(function boot(){
  state.bpm=+bpmEl.value; bpmOut.textContent=state.bpm;
  swingOut.textContent=`${state.swing}%`; barsOut.textContent=bars;
  initPatternsToLength();
  clampPatternToRanges();
  build();
  updateUI();
})();
