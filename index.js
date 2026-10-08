/* =========================================================
   PODACI
   ========================================================= */
const FARMS = [
  {id:'mala',   name:'Mala Njiva',        emoji:'🌾', desc:'Pšenica i kukuruz',        req:1,  mult:1,   slots:2},
  {id:'vocnjak',name:'Voćnjak',           emoji:'🍎', desc:'Jabuke, kruške, šljive',   req:3,  mult:2.5, slots:2},
  {id:'vinograd',name:'Vinograd',         emoji:'🍇', desc:'Grožđe na sunčanim obroncima',req:6, mult:7, slots:3},
  {id:'plast',  name:'Plastenik',         emoji:'🥬', desc:'Povrće pod kontrolom klime',req:10, mult:20,  slots:3},
  {id:'indust', name:'Industrijska Farma',emoji:'🏭', desc:'Masovna proizvodnja hrane', req:15, mult:55,  slots:4},
  {id:'orbital',name:'Orbitalna Farma',   emoji:'🛰️', desc:'Budućnost poljoprivrede',   req:21, mult:150, slots:5},
];

const MACHINE_TYPES = [
  {id:'m0', name:'Robo-Ruka',       emoji:'🦾', cost:0,        upBase:50,      power:3,     cycle:1500},
  {id:'m1', name:'Traktor',         emoji:'🚜', cost:500,      upBase:250,     power:14,    cycle:1400},
  {id:'m2', name:'Kombajn',         emoji:'🌾', cost:4000,     upBase:2000,    power:55,    cycle:1300},
  {id:'m3', name:'Dron Prskalica',  emoji:'🛸', cost:30000,    upBase:15000,   power:220,   cycle:1200},
  {id:'m4', name:'Auto-Harvester',  emoji:'🚛', cost:220000,   upBase:110000,  power:900,   cycle:1100},
  {id:'m5', name:'Mega Kombajn',    emoji:'🏗️', cost:1600000,  upBase:800000,  power:4000,  cycle:1000},
  {id:'m6', name:'Orbitalna Mašina',emoji:'🛰️', cost:12000000, upBase:6000000, power:18000, cycle:900},
];
const MT = {}; MACHINE_TYPES.forEach(t=>MT[t.id]=t);

const TOOLS = [
  {id:'blade', name:'Kaljena Oštrica',  emoji:'⚙️', desc:'+12% brzina rada mašina',      base:400,    kind:'speed', val:0.12},
  {id:'seed',  name:'Genetsko Sjeme',   emoji:'🌱', desc:'+15% zarada od svake farme',   base:900,    kind:'earn',  val:0.15},
  {id:'gps',   name:'GPS Navođenje',    emoji:'📡', desc:'+18% zarada',                  base:6000,   kind:'earn',  val:0.18},
  {id:'ai',    name:'AI Optimizacija',  emoji:'🧠', desc:'+15% brzina rada',             base:16000,  kind:'speed', val:0.15},
  {id:'solar', name:'Solarni Pogon',    emoji:'☀️', desc:'+25% zarada',                  base:95000,  kind:'earn',  val:0.25},
  {id:'nano',  name:'Nano Oštrice',     emoji:'🔬', desc:'+20% brzina rada',             base:700000, kind:'speed', val:0.20},
  {id:'quant', name:'Kvantni Procesor', emoji:'⚛️', desc:'+35% zarada',                  base:5200000,kind:'earn',  val:0.35},
  {id:'fusion',name:'Fuzijski Reaktor', emoji:'🔆', desc:'+30% brzina rada',             base:4e7,    kind:'speed', val:0.30},
];
const TOOL_MAX = 25;

const LEVEL_STEP = 2.2;     // koliko puta veći XP treba za sljedeći nivo
const LEVEL_BASE = 60;      // XP za nivo 2

/* =========================================================
   STANJE
   ========================================================= */
let state = null;
let uidCounter = 1;
let lastFrame = performance.now();
let playTime = 0;

function newState(){
  return {
    screen:'editor',
    char:{ name:'R-01', body:'#5ddc7a', head:'#c9d6cf', accent:'#2f3a34', eye:'#00e5ff' },
    money:0,
    totalEarned:0,
    machines:[],           // {uid,typeId,level,farmId,progress}
    tools:{},              // id -> broj kupljenih
    seenFarms:['mala'],
    playTime:0,
    lastSave:Date.now(),
  };
}

/* =========================================================
   POMOĆNE
   ========================================================= */
function fmt(n){
  if(!isFinite(n)) return '∞';
  if(n < 0) return '-'+fmt(-n);
  if(n < 1000){
    if(n < 10 && n % 1 !== 0) return n.toFixed(1);
    return Math.floor(n).toString();
  }
  const units=['','K','M','B','T','Kv','Qi','Sx','Sp','Ok','No','Dc','Ud','Dd'];
  let i=0;
  while(n>=1000 && i<units.length-1){ n/=1000; i++; }
  return (n<10?n.toFixed(2):n<100?n.toFixed(1):n.toFixed(0))+units[i];
}
function fmtMoney(n){ return fmt(n)+' €'; }

function levelFromEarned(e){
  if(e < LEVEL_BASE) return 1;
  return 1 + Math.floor( Math.log(e/LEVEL_BASE*(LEVEL_STEP-1)+1) / Math.log(LEVEL_STEP) );
}
function xpNeededFor(level){ // ukupno zarađeno potrebno za zadati nivo
  if(level<=1) return 0;
  return Math.round( LEVEL_BASE * (Math.pow(LEVEL_STEP, level-1) - 1) / (LEVEL_STEP-1) );
}
function playerLevel(){ return levelFromEarned(state.totalEarned); }

function toolCount(id){ return state.tools[id]||0; }
function toolCost(t){ return Math.floor(t.base * Math.pow(1.55, toolCount(t.id))); }

function speedMult(){
  let m=1;
  for(const t of TOOLS) if(t.kind==='speed') m *= Math.pow(1+t.val, toolCount(t.id));
  return m;
}
function earnMult(){
  let m=1;
  for(const t of TOOLS) if(t.kind==='earn') m *= Math.pow(1+t.val, toolCount(t.id));
  return m;
}
function machineLevelPower(lv){ return 1 + 0.25*(lv-1); }
function machineLevelSpeed(lv){ return 1 + 0.05*(lv-1); }
function upgradeCost(type, level){ return Math.floor(type.upBase * Math.pow(level, 1.7)); }

function farmById(id){ return FARMS.find(f=>f.id===id); }
function usedSlots(farmId){ return state.machines.filter(m=>m.farmId===farmId).length; }
function isFarmUnlocked(f){ return playerLevel() >= f.req; }
function unlockedFarms(){ return FARMS.filter(isFarmUnlocked); }

function incomePerSec(m){
  if(!m.farmId) return 0;
  const t = MT[m.typeId], f = farmById(m.farmId);
  if(!t||!f) return 0;
  const perCycle = f.mult * t.power * machineLevelPower(m.level) * earnMult();
  const cycleSec = (t.cycle/1000) / (speedMult()*machineLevelSpeed(m.level));
  return perCycle / cycleSec;
}
function totalRate(){ return state.machines.reduce((a,m)=>a+incomePerSec(m),0); }

function toast(msg){
  const el=document.createElement('div');
  el.className='toast'; el.textContent=msg;
  document.getElementById('toasts').appendChild(el);
  setTimeout(()=>el.remove(), 2600);
}
function showModal(html){
  document.getElementById('modalBox').innerHTML = html;
  document.getElementById('overlay').classList.add('show');
}
function closeModal(){ document.getElementById('overlay').classList.remove('show'); }

/* =========================================================
   ROBOT SVG
   ========================================================= */
function robotSVG(c, size){
  const s = size||200;
  return `<svg viewBox="0 0 200 262" width="${s}" height="${s*1.31}">
    <defs>
      <linearGradient id="gg${c.body.replace('#','')}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${c.body}" stop-opacity="1"/>
        <stop offset="100%" stop-color="${c.body}" stop-opacity="0.65"/>
      </linearGradient>
      <filter id="glow"><feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    </defs>

    <!-- antena -->
    <line x1="100" y1="30" x2="100" y2="54" stroke="${c.accent}" stroke-width="5" stroke-linecap="round"/>
    <circle cx="100" cy="24" r="9" fill="${c.eye}" filter="url(#glow)"/>

    <!-- glava -->
    <rect x="54" y="54" width="92" height="72" rx="16" fill="${c.head}" stroke="${c.accent}" stroke-width="5"/>
    <rect x="64" y="64" width="72" height="30" rx="10" fill="#0b110e" opacity="0.75"/>
    <!-- oči -->
    <rect x="70" y="71" width="22" height="15" rx="6" fill="${c.eye}" filter="url(#glow)"/>
    <rect x="108" y="71" width="22" height="15" rx="6" fill="${c.eye}" filter="url(#glow)"/>
    <!-- usta / ventil -->
    <rect x="80" y="104" width="40" height="7" rx="3.5" fill="${c.accent}" opacity="0.75"/>
    <rect x="86" y="104" width="6" height="7" fill="${c.eye}" opacity="0.6"/>
    <rect x="97" y="104" width="6" height="7" fill="${c.eye}" opacity="0.6"/>
    <rect x="108" y="104" width="6" height="7" fill="${c.eye}" opacity="0.6"/>

    <!-- vrat -->
    <rect x="88" y="126" width="24" height="13" fill="${c.accent}"/>

    <!-- tijelo -->
    <rect x="48" y="138" width="104" height="82" rx="17" fill="url(#gg${c.body.replace('#','')})" stroke="${c.accent}" stroke-width="5"/>
    <circle cx="100" cy="172" r="14" fill="#0b110e" opacity="0.55"/>
    <circle cx="100" cy="172" r="8" fill="${c.eye}" filter="url(#glow)"/>
    <rect x="62" y="196" width="76" height="6" rx="3" fill="${c.accent}" opacity="0.5"/>

    <!-- ruke -->
    <rect x="24" y="146" width="19" height="62" rx="9" fill="${c.head}" stroke="${c.accent}" stroke-width="4"/>
    <rect x="157" y="146" width="19" height="62" rx="9" fill="${c.head}" stroke="${c.accent}" stroke-width="4"/>
    <circle cx="33.5" cy="214" r="12" fill="${c.accent}"/>
    <circle cx="166.5" cy="214" r="12" fill="${c.accent}"/>

    <!-- noge -->
    <rect x="65" y="219" width="26" height="36" rx="10" fill="${c.accent}"/>
    <rect x="109" y="219" width="26" height="36" rx="10" fill="${c.accent}"/>
    <rect x="60" y="248" width="36" height="10" rx="5" fill="${c.head}"/>
    <rect x="104" y="248" width="36" height="10" rx="5" fill="${c.head}"/>
  </svg>`;
}

/* =========================================================
   EDITOR
   ========================================================= */
const PALETTE = {
  body:   ['#5ddc7a','#4aa8ff','#ff6b6b','#ffcc44','#c77dff','#ff9f43','#2ee6d6','#e8f0e8','#ff7ab8','#8d6e63'],
  head:   ['#c9d6cf','#8fa39a','#e8f0e8','#ffd9a0','#a0c4ff','#d0b0ff','#f5f5f5','#3a4a42'],
  accent: ['#2f3a34','#1a2228','#3a2f2a','#2a2f3a','#3a2a3a','#4a3a1a','#123a2a'],
  eye:    ['#00e5ff','#5ddc7a','#ffcc44','#ff4d4d','#c77dff','#ffffff','#ff8c00','#00ff88'],
};

function buildSwatches(){
  ['body','head','accent','eye'].forEach(key=>{
    const box = document.getElementById('sw-'+key);
    box.innerHTML='';
    PALETTE[key].forEach(col=>{
      const d=document.createElement('div');
      d.className='sw'+(state.char[key]===col?' sel':'');
      d.style.background=col;
      d.onclick=()=>{ state.char[key]=col; buildSwatches(); updatePreview(); };
      box.appendChild(d);
    });
  });
}
function updatePreview(){
  document.getElementById('robotPreview').innerHTML = robotSVG(state.char, 190);
}

/* =========================================================
   RENDER — HEADER
   ========================================================= */
function renderHeader(){
  document.getElementById('moneyEl').innerHTML = fmt(state.money)+' <small>€</small>';
  document.getElementById('rateEl').textContent = '+'+fmt(totalRate())+'/s';
  document.getElementById('miniAvatar').innerHTML = robotSVG(state.char, 36);

  const lv = playerLevel();
  const cur = xpNeededFor(lv), nxt = xpNeededFor(lv+1);
  const pct = Math.min(100, Math.max(0, (state.totalEarned-cur)/(nxt-cur)*100));
  document.getElementById('xpBar').style.width = pct+'%';
  document.getElementById('lvEl').textContent = lv;
  document.getElementById('xpTxt').textContent = fmt(state.totalEarned)+' / '+fmt(nxt);
}

/* =========================================================
   RENDER — FARME
   ========================================================= */
function renderFarms(){
  const el = document.getElementById('farmsEl');
  el.innerHTML = '';
  const lv = playerLevel();
  FARMS.forEach(f=>{
    const unlocked = lv >= f.req;
    const d=document.createElement('div');
    d.className = 'farm ' + (unlocked?'unlocked':'locked');
    const used = usedSlots(f.id);
    d.innerHTML = `
      <div class="fe">${f.emoji}</div>
      <div class="fn">${f.name}</div>
      <div class="fd">${f.desc}</div>
      <div class="fm">x${f.mult} zarada</div>
      <div class="fs">${unlocked ? '🔧 '+used+'/'+f.slots+' mašina' : '🔒 Nivo '+f.req}</div>
      ${unlocked?'':'<div class="lk">Zaključano</div>'}
    `;
    el.appendChild(d);
  });
  document.getElementById('farmHint').textContent = 'Nivo '+lv;
}

/* =========================================================
   RENDER — MAŠINE
   ========================================================= */
function renderMachines(){
  const el = document.getElementById('machinesEl');
  el.innerHTML='';
  if(state.machines.length===0){
    el.innerHTML = '<div class="empty">Nemaš mašina.<br>Idi u 🏙️ GRAD i kupi svoju prvu mašinu!</div>';
    return;
  }
  const unlocked = unlockedFarms();

  state.machines.forEach(m=>{
    const t = MT[m.typeId];
    const card = document.createElement('div');
    card.className='mcard';
    const upc = upgradeCost(t, m.level);
    const canUp = state.money >= upc;
    const rate = incomePerSec(m);

    let opts = '<option value="">— neraspoređeno —</option>';
    unlocked.forEach(f=>{
      const isHere = m.farmId===f.id;
      const full = usedSlots(f.id) >= f.slots && !isHere;
      opts += `<option value="${f.id}" ${isHere?'selected':''} ${full?'disabled':''}>${f.emoji} ${f.name}${full?' (puno)':''}</option>`;
    });

    card.innerHTML = `
      <div class="mico">${t.emoji}</div>
      <div class="mbody">
        <div class="mtop">
          <div class="mname">${t.name}</div>
          <div class="mlv">NIVO ${m.level}</div>
        </div>
        <div class="mstats">${m.farmId?('💰 <b>'+fmt(rate)+' €/s</b>'):'⚠️ neraspoređeno'} · snaga ${fmt(t.power*machineLevelPower(m.level))}</div>
        <div class="pbar"><div class="pfill" id="pb-${m.uid}"></div></div>
        <select class="msel" data-uid="${m.uid}">${opts}</select>
        <div style="display:flex;gap:8px;margin-top:8px">
          <button class="btn ${canUp?'':' '}" data-up="${m.uid}" ${canUp?'':'disabled'} style="flex:1">
            ⬆ Nadogradi · ${fmt(upc)} €
          </button>
        </div>
      </div>
    `;
    el.appendChild(card);
  });

  el.querySelectorAll('.msel').forEach(sel=>{
    sel.onchange = ()=>{
      const uid = +sel.dataset.uid;
      const m = state.machines.find(x=>x.uid===uid);
      if(!m) return;
      const val = sel.value || null;
      if(val){
        const f = farmById(val);
        if(f && usedSlots(val) >= f.slots && m.farmId!==val){
          toast('Nema slobodnih mjesta na toj farmi!');
          renderMachines(); return;
        }
      }
      m.farmId = val;
      save(); renderAll();
    };
  });

  el.querySelectorAll('[data-up]').forEach(b=>{
    b.onclick = ()=>{
      const uid = +b.dataset.up;
      const m = state.machines.find(x=>x.uid===uid);
      if(!m) return;
      const t2 = MT[m.typeId];
      const c = upgradeCost(t2, m.level);
      if(state.money < c){ toast('Nemaš dovoljno novca!'); return; }
      state.money -= c;
      m.level++;
      toast(`${t2.name} → Nivo ${m.level}`);
      save(); renderAll();
    };
  });
}

/* =========================================================
   RENDER — GRAD
   ========================================================= */
function renderShop(){
  const el = document.getElementById('shopEl');
  el.innerHTML='';
  const ownedIds = new Set(state.machines.map(m=>m.typeId));

  MACHINE_TYPES.forEach(t=>{
    const owned = ownedIds.has(t.id);
    const canBuy = state.money >= t.cost;
    const card = document.createElement('div');
    card.className = 'shopcard'+(owned?' owned':'');
    card.innerHTML = `
      <div class="sico">${t.emoji}</div>
      <div class="sbody">
        <div class="sname">${t.name}</div>
        <div class="sdesc">Snaga ${fmt(t.power)} · ciklus ${(t.cycle/1000).toFixed(1)}s</div>
        <div class="srow">
          <div class="price ${canBuy||owned?'':'no'}">${owned?'✅ Posjeduješ':fmt(t.cost)+' €'}</div>
          ${owned?'':`<button class="btn buy small" data-buy="${t.id}" ${canBuy?'':'disabled'}>KUPI</button>`}
        </div>
      </div>
    `;
    el.appendChild(card);
  });

  el.querySelectorAll('[data-buy]').forEach(b=>{
    b.onclick = ()=>{
      const t = MT[b.dataset.buy];
      if(state.money < t.cost){ toast('Nemaš dovoljno novca!'); return; }
      state.money -= t.cost;
      const m = {uid:uidCounter++, typeId:t.id, level:1, farmId:null, progress:0};
      state.machines.push(m);
      assignBest(m);
      toast('Kupljeno: '+t.name+' '+t.emoji);
      save(); renderAll();
    };
  });
}

/* =========================================================
   RENDER — ALATI
   ========================================================= */
function renderTools(){
  const el = document.getElementById('toolsEl');
  el.innerHTML='';
  TOOLS.forEach(t=>{
    const cnt = toolCount(t.id);
    const maxed = cnt>=TOOL_MAX;
    const cost = toolCost(t);
    const canBuy = !maxed && state.money>=cost;
    const card = document.createElement('div');
    card.className='shopcard'+(cnt>0?' owned':'');
    card.innerHTML=`
      <div class="sico">${t.emoji}</div>
      <div class="sbody">
        <div class="sname">${t.name}</div>
        <div class="sdesc">${t.desc}</div>
        <div class="tagline" style="margin-top:6px">Razina ${cnt} / ${TOOL_MAX} · ukupno +${((Math.pow(1+t.val,cnt)-1)*100).toFixed(0)}%</div>
        <div class="srow">
          <div class="price ${canBuy?'':'no'}">${maxed?'MAX':fmt(cost)+' €'}</div>
          ${maxed?'':`<button class="btn buy small" data-tool="${t.id}" ${canBuy?'':'disabled'}>KUPI</button>`}
        </div>
      </div>
    `;
    el.appendChild(card);
  });

  el.querySelectorAll('[data-tool]').forEach(b=>{
    b.onclick=()=>{
      const t = TOOLS.find(x=>x.id===b.dataset.tool);
      const c = toolCost(t);
      if(state.money<c) return;
      state.money -= c;
      state.tools[t.id] = toolCount(t.id)+1;
      toast(t.emoji+' '+t.name+' → '+state.tools[t.id]);
      save(); renderAll();
    };
  });

  // statistika
  document.getElementById('stTotal').textContent = fmtMoney(state.totalEarned);
  document.getElementById('stRate').textContent = fmtMoney(totalRate());
  document.getElementById('stMachines').textContent = state.machines.length;
  document.getElementById('stSpeed').textContent = 'x'+speedMult().toFixed(2);
  document.getElementById('stEarn').textContent = 'x'+earnMult().toFixed(2);
  document.getElementById('stPlay').textContent = Math.floor(playTime/60)+' min';
}

/* =========================================================
   RENDER — GLAVNI
   ========================================================= */
function renderAll(){
  renderHeader();
  if(state.screen==='game'){
    if(currentTab==='farm'){ renderFarms(); renderMachines(); }
    if(currentTab==='city'){ renderShop(); }
    if(currentTab==='tools'){ renderTools(); }
  }
}

let currentTab='farm';

/* =========================================================
   DODJELA MAŠINA
   ========================================================= */
function assignBest(m){
  const unlocked = unlockedFarms().slice().sort((a,b)=>b.mult-a.mult);
  for(const f of unlocked){
    if(usedSlots(f.id) < f.slots){
      m.farmId = f.id;
      return true;
    }
  }
  m.farmId = null;
  return false;
}
function autoAssignAll(){
  // prvo očisti sve
  state.machines.forEach(m=>m.farmId=null);
  // sortiraj mašine od najjače prema najslabijoj
  const sorted = state.machines.slice().sort((a,b)=>{
    const pa = MT[a.typeId].power*machineLevelPower(a.level);
    const pb = MT[b.typeId].power*machineLevelPower(b.level);
    return pb-pa;
  });
  const unlocked = unlockedFarms().slice().sort((a,b)=>b.mult-a.mult);
  const counts = {}; unlocked.forEach(f=>counts[f.id]=0);
  let leftover=[];
  sorted.forEach(m=>{
    let placed=false;
    for(const f of unlocked){
      if(counts[f.id] < f.slots){ m.farmId=f.id; counts[f.id]++; placed=true; break; }
    }
    if(!placed) leftover.push(m);
  });
  toast('Mašine raspoređene!');
  save(); renderAll();
}

/* =========================================================
   GLAVNA PETLJA
   ========================================================= */
function tick(now){
  const dt = Math.min(0.5, (now-lastFrame)/1000);
  lastFrame = now;
  if(state && state.screen==='game'){
    playTime += dt;
    state.playTime += dt;

    const sm = speedMult(), em = earnMult();
    let earnedThisFrame = 0;

    for(const m of state.machines){
      if(!m.farmId) { m.progress=0; continue; }
      const t = MT[m.typeId];
      const f = farmById(m.farmId);
      if(!t||!f) continue;

      const cycleSec = (t.cycle/1000) / (sm*machineLevelSpeed(m.level));
      m.progress += dt/cycleSec;

      if(m.progress >= 1){
        const cycles = Math.floor(m.progress);
        m.progress -= cycles;
        const perCycle = f.mult*t.power*machineLevelPower(m.level)*em;
        const gain = perCycle*cycles;
        state.money += gain;
        state.totalEarned += gain;
        earnedThisFrame += gain;
      }
      const pb = document.getElementById('pb-'+m.uid);
      if(pb) pb.style.width = Math.min(100, m.progress*100)+'%';
    }

    // osvježi brojeve
    document.getElementById('moneyEl').innerHTML = fmt(state.money)+' <small>€</small>';
    document.getElementById('rateEl').textContent = '+'+fmt(totalRate())+'/s';
    const lv = playerLevel();
    const cur = xpNeededFor(lv), nxt = xpNeededFor(lv+1);
    document.getElementById('xpBar').style.width = Math.min(100,Math.max(0,(state.totalEarned-cur)/(nxt-cur)*100))+'%';
    document.getElementById('lvEl').textContent = lv;
    document.getElementById('xpTxt').textContent = fmt(state.totalEarned)+' / '+fmt(nxt);

    // provjera novih farmi
    FARMS.forEach(f=>{
      if(playerLevel()>=f.req && !state.seenFarms.includes(f.id)){
        state.seenFarms.push(f.id);
        toast('🎉 Otključana farma: '+f.name+'!');
        save(); renderAll();
      }
    });

    // povremeni refresh cijena/dugmadi
    if(!tick._acc) tick._acc=0;
    tick._acc += dt;
    if(tick._acc > 1.0){
      tick._acc = 0;
      if(currentTab==='farm') renderMachines();
      if(currentTab==='city') renderShop();
    }
  }
  requestAnimationFrame(tick);
}

/* =========================================================
   SNAJMANJE / UČITAVANJE
   ========================================================= */
const SAVE_KEY = 'robofarma_save_v1';

function save(){
  if(!state) return;
  state.lastSave = Date.now();
  try{ localStorage.setItem(SAVE_KEY, JSON.stringify(state)); }catch(e){}
}
function load(){
  try{
    const raw = localStorage.getItem(SAVE_KEY);
    if(!raw) return null;
    const s = JSON.parse(raw);
    if(!s || !s.char) return null;
    return s;
  }catch(e){ return null; }
}

/* =========================================================
   INICIJALIZACIJA
   ========================================================= */
function initGame(loaded){
  if(loaded){
    state = loaded;
    if(!state.tools) state.tools={};
    if(!state.seenFarms) state.seenFarms=['mala'];
    if(!state.playTime) state.playTime=0;
    if(!state.machines) state.machines=[];
    uidCounter = state.machines.reduce((a,m)=>Math.max(a,m.uid),0)+1;
    playTime = state.playTime||0;
  } else {
    state = newState();
    // starter mašina
    state.machines.push({uid:uidCounter++, typeId:'m0', level:1, farmId:'mala', progress:0});
  }

  document.getElementById('screen-editor').classList.remove('active');
  document.getElementById('screen-game').classList.add('active');
  state.screen='game';
  currentTab='farm';
  switchTab('farm');
  renderAll();
  save();

  // offline zarada
  if(loaded){
    const away = (Date.now() - (state.lastSave||Date.now()))/1000;
    if(away > 60){
      const capped = Math.min(away, 8*3600);
      const gain = totalRate() * capped * 0.5;
      if(gain > 1){
        state.money += gain;
        state.totalEarned += gain;
        showModal(`
          <h2>💤 Dobrodošao nazad!</h2>
          <p>Tvoje mašine su radile dok te nije bilo.</p>
          <p style="font-size:12px">Odsutan: ${Math.floor(capped/60)} min (50% efikasnost)</p>
          <div class="big">+${fmtMoney(gain)}</div>
          <button class="btn" onclick="closeModal();renderAll();">NASTAVI</button>
        `);
      }
    }
  }
}

/* =========================================================
   TABOVI
   ========================================================= */
function switchTab(tab){
  currentTab = tab;
  document.querySelectorAll('nav.tabs button').forEach(b=>{
    b.classList.toggle('on', b.dataset.tab===tab);
  });
  document.getElementById('tab-farm').style.display  = tab==='farm'?'block':'none';
  document.getElementById('tab-city').style.display  = tab==='city'?'block':'none';
  document.getElementById('tab-tools').style.display = tab==='tools'?'block':'none';
  renderAll();
}

/* =========================================================
   RESET
   ========================================================= */
function doReset(){
  showModal(`
    <h2>⚠️ Reset igre</h2>
    <p>Ovo će trajno izbrisati sav napredak.<br>Jesi li siguran?</p>
    <div style="display:flex;gap:10px;margin-top:18px">
      <button class="btn" style="flex:1;background:linear-gradient(180deg,#ff7b7b,#c23b3b);color:#2a0505" onclick="confirmReset()">DA, RESETUJ</button>
      <button class="btn" style="flex:1" onclick="closeModal()">ODUSTANI</button>
    </div>
  `);
}
function confirmReset(){
  localStorage.removeItem(SAVE_KEY);
  location.reload();
}

/* =========================================================
   START
   ========================================================= */
(function start(){
  const loaded = load();
  const edState = loaded || newState();
  state = edState;

  buildSwatches();
  updatePreview();

  const nameInput = document.getElementById('charName');
  nameInput.value = state.char.name || 'R-01';
  nameInput.oninput = ()=>{ state.char.name = nameInput.value.toUpperCase(); };

  document.getElementById('playBtn').onclick = ()=>{
    state.char.name = (nameInput.value||'R-01').toUpperCase().slice(0,12);
    if(loaded){
      initGame(loaded);
    } else {
      initGame(null);
    }
    requestAnimationFrame(t=>{ lastFrame=t; tick(t); });
  };

  // automatski save
  setInterval(()=>{ if(state && state.screen==='game') save(); }, 8000);
  window.addEventListener('beforeunload', ()=>{ if(state&&state.screen==='game') save(); });

  // dugmad (delegirani eventi)
  document.addEventListener('click', e=>{
    const nav = e.target.closest('nav.tabs button');
    if(nav){ switchTab(nav.dataset.tab); return; }
    if(e.target.id==='autoAssignBtn'){ autoAssignAll(); return; }
    if(e.target.id==='resetBtn'){ doReset(); return; }
    if(e.target.id==='overlay'){ closeModal(); return; }
  });
})();

// globalne funkcije za modal
window.closeModal = closeModal;
window.confirmReset = confirmReset;
window.renderAll = renderAll;