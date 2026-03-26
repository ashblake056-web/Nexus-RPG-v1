// ═══════════════════════════════════════════════
// NEXUS — engine.js  v3.5
// Core systems: overworld, battle, save/load
// NEW: Type effectiveness · Status effects ·
//      SPD turn order · Per-city tile tinting ·
//      Def bonus applied · Burn halves ATK ·
//      Dynamic gym leader names
// ═══════════════════════════════════════════════

// ── STATE ──
let currentDialogue=[],dialogueIndex=0,dialogueCallback=null;
let selectedStarter=null;
let battleState={};
let npcDialogue=[],npcIndex=0,npcCallback=null;
let canvas,ctx,TILE_SIZE;
let bagContext='overworld';
let prevScreen='overworld';

// ── SCREEN ──
function showScreen(id){
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
  const el=document.getElementById('screen-'+id);
  if(el) el.classList.add('active');
}

function notify(msg,color){
  const n=document.createElement('div');
  n.className='notif';
  if(color) n.style.borderColor=color,n.style.color=color;
  n.textContent=msg;
  document.getElementById('game-container').appendChild(n);
  setTimeout(()=>n.remove(),3000);
}

// ── SAVE/LOAD ──
function startGame(){
  Object.assign(G,{playerName:'ALEX',starter:null,party:[],badges:[],location:'BOOTVILLE',
    steps:0,x:7,y:8,map:'bootville',bag:{nexball:5,superball:0,healpack:3,revive:1},
    money:500,flags:{metAda:false,beatGym1:false,visitedGridlock:false}});
  runIntro();
}
function saveGame(){localStorage.setItem('nexus_v3',JSON.stringify(G));notify('GAME SAVED ◈');}
function loadGame(){
  const s=localStorage.getItem('nexus_v3')||localStorage.getItem('nexus_v2');
  if(!s){notify('NO SAVE DATA FOUND');return;}
  const data=JSON.parse(s);
  Object.assign(G,data);
  initOverworld();showScreen('overworld');
}

// ══════════════════════════════════════════════
// TYPE EFFECTIVENESS TABLE
// ══════════════════════════════════════════════
const TYPE_EFFECTIVENESS={
  Electric:{ Water:2, Flying:2, Grass:0.5, Electric:0.5, Dragon:0.5, Ground:0 },
  Fire:    { Grass:2, Steel:2, Bug:2, Ice:2, Fire:0.5, Water:0.5, Rock:0.5, Dragon:0.5 },
  Water:   { Fire:2, Ground:2, Rock:2, Water:0.5, Grass:0.5, Dragon:0.5 },
  Grass:   { Water:2, Ground:2, Rock:2, Fire:0.5, Grass:0.5, Poison:0.5, Flying:0.5, Bug:0.5, Steel:0.5, Dragon:0.5 },
  Steel:   { Ice:2, Rock:2, Fairy:2, Steel:0.5, Fire:0.5, Water:0.5, Electric:0.5, Poison:0 },
  Psychic: { Fighting:2, Poison:2, Psychic:0.5, Steel:0.5, Dark:0 },
  Dark:    { Psychic:2, Ghost:2, Fighting:0.5, Dark:0.5, Fairy:0.5 },
  Ghost:   { Psychic:2, Ghost:2, Dark:0.5, Normal:0 },
  Bug:     { Grass:2, Psychic:2, Dark:2, Fire:0.5, Fighting:0.5, Flying:0.5, Ghost:0.5, Steel:0.5, Fairy:0.5 },
  Rock:    { Fire:2, Ice:2, Flying:2, Bug:2, Fighting:0.5, Ground:0.5, Steel:0.5 },
  Ground:  { Fire:2, Electric:2, Poison:2, Rock:2, Steel:2, Grass:0.5, Bug:0.5, Flying:0 },
  Flying:  { Grass:2, Fighting:2, Bug:2, Electric:0.5, Rock:0.5, Steel:0.5 },
  Poison:  { Grass:2, Fairy:2, Poison:0.5, Ground:0.5, Rock:0.5, Ghost:0.5, Steel:0 },
  Ice:     { Grass:2, Ground:2, Flying:2, Dragon:2, Steel:0.5, Water:0.5, Ice:0.5 },
  Dragon:  { Dragon:2, Steel:0.5, Fairy:0 },
  Fairy:   { Fighting:2, Dragon:2, Dark:2, Fire:0.5, Poison:0.5, Steel:0.5 },
  Normal:  { Ghost:0 },
  SYNTH:   { Grass:2, Fairy:2, Normal:2, Ice:2, Electric:0.5, Steel:0.5, Dark:0.5, Ghost:0 },
  DATA:    { SYNTH:2, Psychic:2, Ghost:2, Dark:0.5, Steel:0.5, Normal:0 },
};

function getTypeMultiplier(moveType,defenderType){
  if(!moveType)return 1;
  const chart=TYPE_EFFECTIVENESS[moveType]||{};
  const types=(defenderType||'Normal').split('/');
  let mult=1;
  for(const t of types) mult*=(chart[t]!==undefined?chart[t]:1);
  return mult;
}

function typeEffMessage(mult){
  if(mult>=2) return '\n💥 SUPER EFFECTIVE!';
  if(mult<=0) return "\n✗ Has no effect!";
  if(mult<1)  return '\n▼ Not very effective.';
  return '';
}

// ══════════════════════════════════════════════
// STATUS EFFECT SYSTEM
// ══════════════════════════════════════════════
// battleState.playerStatus / enemyStatus = {type:'burn'|'para'|'toxic'|'conf', turns:0}

const STATUS_ICONS={burn:'🔥',para:'⚡',toxic:'☠️',conf:'💫'};
const STATUS_LABELS={burn:'burned',para:'paralyzed',toxic:'badly poisoned',conf:'confused'};

function getStatusTag(who){
  const s=battleState[who+'Status'];
  if(!s) return '';
  return ' ['+STATUS_ICONS[s.type]+']';
}

/** Apply a move's secondary effect. Returns extra log line or ''. */
function applyMoveEffect(effect,attackerIs,defenderIs,dmgDealt){
  const bs=battleState;
  const attacker=bs[attackerIs];
  const defender=bs[defenderIs];
  const defStatusKey=defenderIs+'Status';
  const atkStatusKey=attackerIs+'Status';
  if(!effect)return '';

  // ── Recoil ──
  if(effect==='recoil25'){
    const rcl=Math.max(1,Math.floor(dmgDealt*.25));
    attacker.hp=Math.max(0,attacker.hp-rcl);
    updateBattleHPBars();
    return attacker.name+' was hurt by recoil! (-'+rcl+' HP)';
  }
  if(effect==='recoil50'){
    const rcl=Math.max(1,Math.floor(dmgDealt*.50));
    attacker.hp=Math.max(0,attacker.hp-rcl);
    updateBattleHPBars();
    return attacker.name+' was hurt by recoil! (-'+rcl+' HP)';
  }

  // ── Stats ──
  if(effect==='def+1'){bs.playerStatusDef=(bs.playerStatusDef||0)+1;return attacker.name+"'s defense rose!";}
  if(effect==='def+2'){bs.playerStatusDef=(bs.playerStatusDef||0)+2;return attacker.name+"'s defense sharply rose!";}

  // ── Status conditions (don't stack) ──
  let chance=0,statusType=null;
  if(effect==='burn10')  {chance=0.10;statusType='burn';}
  if(effect==='burn20')  {chance=0.20;statusType='burn';}
  if(effect==='para10')  {chance=0.10;statusType='para';}
  if(effect==='para20')  {chance=0.20;statusType='para';}
  if(effect==='para30')  {chance=0.30;statusType='para';}
  if(effect==='para')    {chance=1.00;statusType='para';}
  if(effect==='conf10')  {chance=0.10;statusType='conf';}
  if(effect==='toxic')   {chance=0.90;statusType='toxic';}
  if(effect==='priority'){return '';} // handled via SPD check in executePlayerMove
  if(effect==='flinch30'){chance=0.30;statusType='flinch';} // next turn skip for enemy

  if(statusType==='flinch'){
    if(Math.random()<chance){bs[defStatusKey+Flinch]=true;return defender.name+' flinched!';}
    return '';
  }
  if(statusType&&!bs[defStatusKey]&&Math.random()<chance){
    bs[defStatusKey]={type:statusType,turns:0};
    return defender.name+' is '+STATUS_LABELS[statusType]+'! '+STATUS_ICONS[statusType];
  }
  return '';
}

/** Apply end-of-turn status damage. Returns log line or ''. */
function applyEndOfTurnStatus(who){
  const bs=battleState;
  const mon=bs[who];
  const status=bs[who+'Status'];
  if(!status)return '';
  let msg='';
  if(status.type==='burn'){
    const dmg=Math.max(1,Math.floor(mon.maxHp/8));
    mon.hp=Math.max(0,mon.hp-dmg);
    msg=mon.name+' is hurt by its burn! (-'+dmg+' HP)';
  } else if(status.type==='toxic'){
    status.turns=(status.turns||0)+1;
    const dmg=Math.max(1,Math.floor(mon.maxHp*status.turns/16));
    mon.hp=Math.max(0,mon.hp-dmg);
    msg=mon.name+' is hurt by poison! (-'+dmg+' HP)';
  }
  if(msg) updateBattleHPBars();
  return msg;
}

/** Returns true if paralysis prevents action. */
function checkParaSkip(who){
  const s=battleState[who+'Status'];
  return (s&&s.type==='para'&&Math.random()<.25);
}

// ── OVERWORLD ──
function initOverworld(){
  canvas=document.getElementById('map-canvas');
  const cont=document.getElementById('screen-overworld');
  const hH=cont.querySelector('.ow-header').offsetHeight||40;
  const cH=cont.querySelector('.ow-controls').offsetHeight||120;
  const W=cont.offsetWidth||480,H=(cont.offsetHeight||720)-hH-cH;
  canvas.width=W;canvas.height=H;
  TILE_SIZE=Math.floor(Math.min(W/11,H/10));
  ctx=canvas.getContext('2d');
  updateOWHeader();drawMap();
  document.addEventListener('keydown',e=>{
    const m={ArrowUp:'up',ArrowDown:'down',ArrowLeft:'left',ArrowRight:'right',' ':'a'};
    if(m[e.key]){e.preventDefault();if(m[e.key]==='a')interact();else move(m[e.key]);}
  });
}
function updateOWHeader(){
  document.getElementById('ow-location').textContent=G.location;
  const p=G.party[0];
  if(p) document.getElementById('ow-party-info').textContent=
    p.emoji+' '+p.name+' Lv.'+p.level+' HP:'+p.hp+'/'+p.maxHp+' 💰'+G.money;
}
function getCurrentMap(){return MAPS[G.map]||MAPS.bootville;}
function getCurrentNPCs(){return NPCS_BY_MAP[G.map]||[];}

const BUILDINGS_BY_MAP={
  // h=1: no collision (decorative props)
  // h=2: blocks top row only (small buildings, enter from front)
  // h=3: blocks top 2 rows (large buildings, enter from front row)
  bootville:[
    {x:7, y:2, key:'lab',         w:3, h:3},
    {x:2, y:2, key:'house_a',     w:2, h:2},
    {x:14,y:2, key:'house_a',     w:2, h:2},
    {x:2, y:5, key:'house_b',     w:2, h:2},
    {x:14,y:5, key:'house_b',     w:2, h:2},
    {x:12,y:9, key:'fountain',    w:2, h:1},
    {x:5, y:10,key:'fence',       w:4, h:1},
    {x:13,y:10,key:'fence',       w:4, h:1},
    // Individual trees — top-left corner
    {x:1, y:1, key:'tree_sprite', w:1, h:2, blockBase:true},
    {x:2, y:1, key:'tree_sprite', w:1, h:2, blockBase:true},
    // Individual trees — top-right corner
    {x:21,y:1, key:'tree_sprite', w:1, h:2, blockBase:true},
    {x:22,y:1, key:'tree_sprite', w:1, h:2, blockBase:true},
    // Mid-left cluster
    {x:2, y:9, key:'tree_sprite', w:1, h:2, blockBase:true},
    {x:2, y:11,key:'tree_sprite', w:1, h:2, blockBase:true},
    {x:3, y:10,key:'tree_sprite', w:1, h:2, blockBase:true},
    // Mid-right cluster
    {x:17,y:10,key:'tree_sprite', w:1, h:2, blockBase:true},
    {x:18,y:10,key:'tree_sprite', w:1, h:2, blockBase:true},
    {x:19,y:10,key:'tree_sprite', w:1, h:2, blockBase:true},
    {x:20,y:10,key:'tree_sprite', w:1, h:2, blockBase:true},
    {x:19,y:11,key:'tree_sprite', w:1, h:2, blockBase:true},
    // Signs
    {x:8, y:9, key:'sign_post',   w:1, h:1},
    {x:16,y:9, key:'sign_post',   w:1, h:1},
  ],
  gridlock:[
    {x:3, y:2, key:'gym',              w:3, h:2},  // gym — entrance y=3, NPC at (4,3)
    {x:13,y:2, key:'center',           w:3, h:3},  // center — entrance y=4, NPC at (14,4)
    {x:19,y:2, key:'shop',             w:2, h:2},  // shop — entrance y=3, NPC at (20,3)
    {x:2, y:8, key:'neon_building',    w:2, h:4},  // left neon block
    {x:19,y:8, key:'neon_building',    w:2, h:4},  // right neon block
    {x:7, y:8, key:'neon_building',    w:2, h:3},  // mid-left neon
    {x:13,y:8, key:'neon_building',    w:2, h:3},  // mid-right neon
    {x:2, y:14,key:'neon_building',    w:3, h:2},  // lower-left neon
    {x:14,y:14,key:'neon_building',    w:3, h:2},  // lower-right neon
    {x:6, y:8, key:'street_lamp',      w:1, h:2, blockBase:true},
    {x:16,y:8, key:'street_lamp',      w:1, h:2, blockBase:true},
    {x:6, y:14,key:'street_lamp',      w:1, h:2, blockBase:true},
    {x:16,y:14,key:'street_lamp',      w:1, h:2, blockBase:true},
    {x:8, y:9, key:'syntek_billboard', w:2, h:2, solid:true},
  ],
  route2:[
    {x:4, y:3, key:'boulder',      w:2, h:2},
    {x:18,y:3, key:'boulder',      w:2, h:2},
    {x:4, y:16,key:'boulder',      w:2, h:2},
    {x:18,y:16,key:'boulder',      w:2, h:2},
    {x:5, y:5, key:'dead_tree',    w:1, h:2, blockBase:true},
    {x:17,y:5, key:'dead_tree',    w:1, h:2, blockBase:true},
    {x:8, y:12,key:'dead_tree',    w:1, h:2, blockBase:true},
    {x:14,y:12,key:'dead_tree',    w:1, h:2, blockBase:true},
    // Toxic puddles — w:2,h:2 (bigger), h:1 so walkable
    {x:5, y:8, key:'toxic_puddle', w:2, h:1},
    {x:16,y:8, key:'toxic_puddle', w:2, h:1},
    {x:7, y:13,key:'toxic_puddle', w:2, h:1},
    {x:13,y:13,key:'toxic_puddle', w:2, h:1},
    {x:9, y:17,key:'toxic_puddle', w:2, h:1},
    {x:8, y:4, key:'sign_post',    w:1, h:1},
  ],
  ironhaven:[
    {x:7, y:2, key:'gym',          w:3, h:2},
    {x:13,y:2, key:'center',       w:3, h:3},
    {x:19,y:2, key:'shop',         w:2, h:2},
    {x:1, y:8, key:'factory_iron', w:4, h:4},
    {x:18,y:8, key:'syntek_plant', w:4, h:4},
    // Crates — w:2,h:2,solid (fully collidable)
    {x:7, y:13,key:'metal_crate',  w:2, h:2, solid:true},
    {x:11,y:14,key:'metal_crate',  w:2, h:2, solid:true},
    {x:14,y:13,key:'metal_crate',  w:2, h:2, solid:true},
    {x:5, y:7, key:'street_lamp',  w:1, h:2, blockBase:true},
    {x:17,y:7, key:'street_lamp',  w:1, h:2, blockBase:true},
  ],
};
function getBuildingsForMap(mapId){return BUILDINGS_BY_MAP[mapId]||[];}

// ══════════════════════════════════════════════
// PER-CITY TILE COLOUR TINTING
// Each map overlays a subtle rgba tint on its tiles
// so Bootville feels grassy-warm, Gridlock neon-dark, etc.
// ══════════════════════════════════════════════
const MAP_TINT={
  bootville: {grass:'rgba(60,180,30,0.08)',  path:'rgba(200,180,120,0.10)',wall:'rgba(100,80,40,0.15)'},
  gridlock:  {wall:'rgba(10,10,60,0.25)'},
  route2:    {grass:'rgba(60,40,10,0.25)',   path:'rgba(80,60,30,0.20)',  wall:'rgba(60,40,20,0.25)'},
  ironhaven: {wall:'rgba(30,20,10,0.30)'},
};
// Accent overlay for neon glow on Gridlock path tiles
const MAP_ACCENT={
  gridlock: {path:'rgba(0,255,255,0.04)'},
  ironhaven:{path:'rgba(255,120,0,0.06)'},
};

function drawTile(ctx,t,tx,ty,ts){
  const imgMap={
    [TILE.GRASS]:'grass',[TILE.PATH]:'path',[TILE.WALL]:'wall',
    [TILE.TALL]:'tall',  [TILE.WATER]:'water',[TILE.TREE]:'tree',
    [TILE.CENTER]:'center_floor',[TILE.GYM]:'gym_floor',[TILE.SIGN]:'sign',
  };
  // Per-city overrides: check for mapId_tilekey first
  const cityOverrides={
    bootville:{ grass:'grass_boot', path:'path_boot' },
    route2:   { grass:'ground_r2', path:'ground_r2', tall:'tall_r2' },
    gridlock: { grass:'gridlock_ground', path:'gridlock_path' },
    ironhaven:{ grass:'ironhaven_ground', path:'ironhaven_path' },
  };
  const cityMap=cityOverrides[G.map]||{};
  const baseKey=imgMap[t];
  // For tall grass, check 'tall' override directly
  const cityKey=(t===TILE.TALL&&cityMap['tall'])?cityMap['tall']:cityMap[baseKey];
  const key=cityKey||baseKey;
  const img=key&&TILE_IMAGES&&TILE_IMAGES[key];
  if(img&&img.complete&&img.naturalWidth>0){
    ctx.drawImage(img,tx,ty,ts,ts);
  } else {
    ctx.fillStyle=TILE_COLOR[t]||'#111';
    ctx.fillRect(tx,ty,ts,ts);
  }

  // Per-city tint overlay
  const tintSet=MAP_TINT[G.map];
  if(tintSet){
    const tileKey=(t===TILE.GRASS||t===TILE.TALL)?'grass':(t===TILE.PATH?'path':(t===TILE.WALL||t===TILE.TREE)?'wall':null);
    if(tileKey&&tintSet[tileKey]){
      ctx.fillStyle=tintSet[tileKey];
      ctx.fillRect(tx,ty,ts,ts);
    }
  }
  const accentSet=MAP_ACCENT[G.map];
  if(accentSet){
    const tileKey=t===TILE.PATH?'path':null;
    if(tileKey&&accentSet[tileKey]){
      ctx.fillStyle=accentSet[tileKey];
      ctx.fillRect(tx,ty,ts,ts);
    }
  }

  // Exits
  if(t===TILE.EXIT_N||t===TILE.EXIT_S){
    ctx.fillStyle='#00ffff18';ctx.fillRect(tx,ty,ts,ts);
    ctx.strokeStyle='#00ffff55';ctx.lineWidth=1;ctx.strokeRect(tx+1,ty+1,ts-2,ts-2);
    ctx.fillStyle='#00ffff99';
    ctx.font=Math.floor(ts*.5)+'px monospace';
    ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.fillText(t===TILE.EXIT_N?'↑':'↓',tx+ts/2,ty+ts/2);
  }
}

function drawMap(){
  if(!ctx)return;
  ctx.clearRect(0,0,canvas.width,canvas.height);
  ctx.fillStyle='#050a14';
  ctx.fillRect(0,0,canvas.width,canvas.height);

  const map=getCurrentMap();
  const offX=Math.floor(canvas.width/2-G.x*TILE_SIZE-TILE_SIZE/2);
  const offY=Math.floor(canvas.height/2-G.y*TILE_SIZE-TILE_SIZE/2);

  for(let r=0;r<map.length;r++){
    for(let c=0;c<map[r].length;c++){
      const tx=c*TILE_SIZE+offX,ty=r*TILE_SIZE+offY;
      if(tx>canvas.width||ty>canvas.height||tx<-TILE_SIZE||ty<-TILE_SIZE)continue;
      drawTile(ctx,map[r][c],tx,ty,TILE_SIZE);
    }
  }

  // Buildings
  for(const b of getBuildingsForMap(G.map)){
    const bx=b.x*TILE_SIZE+offX,by=b.y*TILE_SIZE+offY;
    const bw=b.w*TILE_SIZE,bh=b.h*TILE_SIZE;
    if(bx+bw<0||by+bh<0||bx>canvas.width||by>canvas.height)continue;
    const bimg=typeof BUILDING_IMAGES!=='undefined'&&BUILDING_IMAGES[b.key];
    if(bimg&&bimg.complete&&bimg.naturalWidth>0) ctx.drawImage(bimg,bx,by,bw,bh);
  }

  // NPCs
  ctx.textAlign='center';ctx.textBaseline='middle';
  const NPC_SPRITE_MAP={
    '👩‍🔬':'ada',    // Prof Ada
    '👩‍⚕️':'nurse',  // Nurse Joy
    '🛒':'shop',     // Shop keeper
    '🧑':'kael',     // Kael rival
    '⚡':'npc',      // Gym guide (electric)
    '⚙️':'npc',      // Gym guide (steel)
    '🧑‍💼':'npc',    // SYNTEK exec
    '👧':'npc',      // Young trainer
    '🧓':'npc',      // Old trainer
    '👴':'npc',      // Old miner
    '👦':'npc',      // Boy
    '👩':'npc',      // Female trainer
    '🧑‍🦯':'npc',    // Hiker
    '📋':'npc',      // Sign — uses npc sprite as placeholder
  };
  for(const npc of getCurrentNPCs()){
    const tx=npc.x*TILE_SIZE+offX,ty=npc.y*TILE_SIZE+offY;
    if(tx>canvas.width||ty>canvas.height||tx<-TILE_SIZE||ty<-TILE_SIZE)continue;
    // Signs use sign_post building image
    if(npc.emoji==='📋'){
      const signImg=typeof BUILDING_IMAGES!=='undefined'&&BUILDING_IMAGES['sign_post'];
      ctx.shadowColor='#ffff00';ctx.shadowBlur=4;
      if(signImg&&signImg.complete&&signImg.naturalWidth>0){
        ctx.drawImage(signImg,tx,ty,TILE_SIZE,TILE_SIZE);
      } else {
        ctx.font=Math.floor(TILE_SIZE*.7)+'px serif';
        ctx.textAlign='center';ctx.textBaseline='middle';
        ctx.fillText('📋',tx+TILE_SIZE/2,ty+TILE_SIZE/2);
      }
      ctx.shadowBlur=0;
      continue;
    }
    const sprKey=NPC_SPRITE_MAP[npc.emoji];
    const sprImg=typeof CHAR_SPRITES!=='undefined'&&sprKey&&CHAR_SPRITES[sprKey];
    ctx.shadowColor='#00ffff';ctx.shadowBlur=5;
    if(sprImg&&sprImg.complete&&sprImg.naturalWidth>0){
      ctx.drawImage(sprImg,tx,ty,TILE_SIZE,TILE_SIZE);
    } else {
      ctx.font=Math.floor(TILE_SIZE*.7)+'px serif';
      ctx.textAlign='center';ctx.textBaseline='middle';
      ctx.fillText(npc.emoji,tx+TILE_SIZE/2,ty+TILE_SIZE/2);
    }
    ctx.shadowBlur=0;
  }

  // Player
  const px=G.x*TILE_SIZE+offX,py=G.y*TILE_SIZE+offY;
  ctx.shadowColor='#00ffff';ctx.shadowBlur=12;
  if(typeof CHAR_SPRITES!=='undefined'&&CHAR_SPRITES.player&&CHAR_SPRITES.player.complete&&CHAR_SPRITES.player.naturalWidth>0){
    ctx.drawImage(CHAR_SPRITES.player,px,py,TILE_SIZE,TILE_SIZE);
  } else {
    ctx.font=Math.floor(TILE_SIZE*.65)+'px serif';
    ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.fillText('🧑',px+TILE_SIZE/2,py+TILE_SIZE/2);
  }
  ctx.shadowBlur=0;
}

function canWalk(x,y){
  const map=getCurrentMap();
  if(y<0||y>=map.length||x<0||x>=map[0].length)return false;
  const t=map[y][x];
  if(t===TILE.WALL||t===TILE.TREE||t===TILE.WATER)return false;
  for(const b of getBuildingsForMap(G.map)){
    if(x<b.x||x>=b.x+b.w)continue;
    if(b.h===1)continue;            // h=1 = fully walkable decoration
    if(b.solid){
      // Block ALL rows — solid obstacle (billboards, boulders with solid)
      if(y>=b.y&&y<b.y+b.h)return false;
    } else if(b.blockBase){
      // Block only bottom row — lamp pole base
      if(y===b.y+b.h-1)return false;
    } else {
      // Standard building: block all rows except last (entrance at front)
      if(y>=b.y&&y<b.y+b.h-1)return false;
    }
  }
  return true;
}
function move(dir){
  if(!document.getElementById('screen-overworld').classList.contains('active'))return;
  let nx=G.x,ny=G.y;
  if(dir==='up')ny--;if(dir==='down')ny++;if(dir==='left')nx--;if(dir==='right')nx++;
  for(const npc of getCurrentNPCs()){if(npc.x===nx&&npc.y===ny){handleNPCTouch(npc);return;}}
  if(!canWalk(nx,ny))return;
  G.x=nx;G.y=ny;G.steps++;
  const map=getCurrentMap();
  const tile=map[ny]?map[ny][nx]:null;
  if(G.map==='bootville'&&tile===TILE.EXIT_S){travelToGridlock();return;}
  if(G.map==='gridlock'&&tile===TILE.EXIT_N){travelToBootville();return;}
  if(G.map==='gridlock'&&tile===TILE.EXIT_S){travelToRoute2();return;}
  if(G.map==='route2'&&tile===TILE.EXIT_N){setMap('gridlock',11,19);return;}
  if(G.map==='route2'&&tile===TILE.EXIT_S){travelToIronhaven();return;}
  if(G.map==='ironhaven'&&tile===TILE.EXIT_N){setMap('route2',11,19);return;}
  if(tile===TILE.CENTER){openPokemonCenter();return;}
  if(tile===TILE.GYM){openGym();return;}
  drawMap();updateOWHeader();
  if(map[ny]&&map[ny][nx]===TILE.TALL&&Math.random()<0.2)setTimeout(triggerWildBattle,300);
  if(G.steps%25===0)saveGame();
}
function travelToGridlock(){
  if(!G.flags.visitedGridlock){
    G.flags.visitedGridlock=true;
    currentDialogue=[{emoji:'🌆',speaker:'NARRATOR',text:'You arrive at GRIDLOCK CITY — a neon-soaked metropolis of hover-cars and electric billboards. The Gym is here. So is the Pokémon Center.'}];
    dialogueIndex=0;dialogueCallback=()=>{setMap('gridlock',11,2);};
    showScreen('intro');renderDialogue();
  } else setMap('gridlock',11,2);
}
function travelToBootville(){setMap('bootville',11,19);}
function travelToRoute2(){
  currentDialogue=[{emoji:'🌿',speaker:'NARRATOR',text:'You step onto ROUTE 2 — IRON PASS. The air smells of rust and exhaust. Steel-type Pokémon prowl the tall grass. Ironhaven City lies ahead.'}];
  dialogueIndex=0;dialogueCallback=()=>{setMap('route2',11,2);};
  showScreen('intro');renderDialogue();
}
function travelToIronhaven(){
  if(!G.flags.visitedIronhaven){
    G.flags.visitedIronhaven=true;
    currentDialogue=[{emoji:'🏭',speaker:'NARRATOR',text:'IRONHAVEN CITY. Factories and smokestacks stretch into the smog. SYNTEK\'s smelting plant looms at the edge of town. The Gym Leader REX is said to be unbeatable.'}];
    dialogueIndex=0;dialogueCallback=()=>{setMap('ironhaven',11,2);};
    showScreen('intro');renderDialogue();
  } else setMap('ironhaven',11,2);
}
function setMap(mapId,x,y){
  G.map=mapId;G.x=x;G.y=y;
  const names={bootville:'BOOTVILLE',gridlock:'GRIDLOCK CITY',route2:'ROUTE 2 — IRON PASS',ironhaven:'IRONHAVEN CITY'};
  G.location=names[mapId]||mapId.toUpperCase();
  showScreen('overworld');initOverworld();
}
function interact(){
  const dirs=[{x:0,y:-1},{x:0,y:1},{x:-1,y:0},{x:1,y:0}];
  for(const d of dirs){
    for(const npc of getCurrentNPCs()){
      if(npc.x===G.x+d.x&&npc.y===G.y+d.y){handleNPCTouch(npc);return;}
    }
  }
  const map=getCurrentMap();
  const tile=map[G.y]?map[G.y][G.x]:null;
  if(tile===TILE.CENTER){openPokemonCenter();return;}
  if(tile===TILE.GYM){openGym();return;}
  notify('NOTHING NEARBY');
}
function handleNPCTouch(npc){
  if(npc.isCenter){openPokemonCenter();return;}
  if(npc.isGym){openGym();return;}
  if(npc.isKael){triggerKaelBattle();return;}
  if(npc.isShop){openShop();return;}
  talkToNPC(npc);
}

// ── NPC DIALOGUE ──
function talkToNPC(npc){
  npcDialogue=npc.dialogue;npcIndex=0;
  document.getElementById('npc-emoji').textContent=npc.emoji;
  document.getElementById('npc-speaker').textContent=npc.name;
  document.getElementById('npc-choices').innerHTML='';
  document.getElementById('npc-continue').style.display='block';
  showScreen('npc');renderNPC();
}
function renderNPC(){typeText('npc-text',npcDialogue[npcIndex]);}
function advanceNPC(){
  npcIndex++;
  if(npcIndex>=npcDialogue.length){showScreen('overworld');drawMap();}
  else renderNPC();
}

// ── POKÉMON CENTER ──
function openPokemonCenter(){showScreen('center');}
function healParty(){
  G.party.forEach(p=>{p.hp=p.maxHp;});
  updateOWHeader();
  notify('All Pokémon restored to full HP! 💊','#ff99cc');
  setTimeout(()=>{showScreen('overworld');drawMap();},BATTLE_SLOW);
}

// ── GYM ──
function openGym(){
  if(G.map==='ironhaven'){openGym2();return;}
  if(G.flags.beatGym1){notify('You already have the VOLT BADGE! ⚡','#ffdd00');return;}
  document.getElementById('gym-title').textContent='GRIDLOCK GYM';
  document.getElementById('gym-subtitle').textContent='LEADER: ZARA — ELECTRIC TYPE';
  document.getElementById('gym-leader-emoji').textContent='👩';
  document.getElementById('gym-leader-name').textContent='ZARA';
  document.getElementById('gym-badge-emoji').textContent='⚡';
  document.getElementById('gym-dialogue-text').textContent=
    '"Welcome to Gridlock Gym. I\'m Zara. My Electric Pokémon rule the circuits of this city. Think you can keep up? I\'ve been the Gym Leader here for six years — no one has ever made it easy."';
  document.getElementById('gym-btn-battle').onclick=startGymBattle;
  showScreen('gym');
}
function openGym2(){
  if(G.flags.beatGym2){notify('You already have the FORGE BADGE! ⚙️','#aabbcc');return;}
  document.getElementById('gym-title').textContent='IRONHAVEN GYM';
  document.getElementById('gym-subtitle').textContent='LEADER: REX — STEEL TYPE';
  document.getElementById('gym-leader-emoji').textContent='👨‍🏭';
  document.getElementById('gym-leader-name').textContent='REX';
  document.getElementById('gym-badge-emoji').textContent='⚙️';
  document.getElementById('gym-dialogue-text').textContent=
    '"You made it to Ironhaven. Most trainers turn back on Route 2. My Steel Pokémon are forged from the same iron as this city — unbreakable. Prove me wrong."';
  document.getElementById('gym-btn-battle').onclick=startGym2Battle;
  showScreen('gym');
}
function startGymBattle(){
  const alive=G.party.filter(p=>p.hp>0);
  if(alive.length===0){notify('Your Pokémon are all fainted! Heal first!','#ff3355');return;}
  const zaraPoke=[
    JSON.parse(JSON.stringify(POKEMON_BASE.zara_jolteon)),
    JSON.parse(JSON.stringify(POKEMON_BASE.zara_ampere))
  ];
  battleState._gymQueue=zaraPoke;
  battleState._gymIndex=0;
  battleState._gymLeader={name:'ZARA',emoji:'👩'};
  startBattle(zaraPoke[0],true,true);
}
function startGym2Battle(){
  const alive=G.party.filter(p=>p.hp>0);
  if(alive.length===0){notify('Your Pokémon are all fainted! Heal first!','#ff3355');return;}
  const rexPoke=[
    JSON.parse(JSON.stringify(POKEMON_BASE.rex_forgeant)),
    JSON.parse(JSON.stringify(POKEMON_BASE.rex_drillord))
  ];
  battleState._gymQueue=rexPoke;
  battleState._gymIndex=0;
  battleState._gymLeader={name:'REX',emoji:'👨‍🏭'};
  battleState._gym2=true;
  startBattle(rexPoke[0],true,true);
}

// ── BAG / PARTY / MENU ──
function openBag(){prevScreen='overworld';bagContext='overworld';renderBag();showScreen('bag');}
function closeBag(){showScreen(prevScreen);if(prevScreen==='overworld')drawMap();}
function openParty(){renderParty();showScreen('party');}
function closeParty(){showScreen('overworld');drawMap();}
function openMenu(){
  const opts=[
    {label:'💾 SAVE GAME',action:saveGame},
    {label:'🏅 BADGE CASE',action:renderBadges},
    {label:'💊 BAG',action:openBag},
    {label:'👥 PARTY',action:openParty},
  ];
  npcDialogue=['What would you like to do?'];
  npcIndex=0;
  document.getElementById('npc-emoji').textContent='📱';
  document.getElementById('npc-speaker').textContent='MENU';
  document.getElementById('npc-continue').style.display='none';
  showScreen('npc');
  typeText('npc-text','What would you like to do?');
  const ch=document.getElementById('npc-choices');ch.innerHTML='';
  opts.forEach(o=>{
    const btn=document.createElement('button');btn.className='choice-btn';btn.textContent=o.label;
    btn.onclick=()=>{showScreen('overworld');drawMap();o.action();};ch.appendChild(btn);
  });
  const back=document.createElement('button');back.className='choice-btn';back.textContent='← BACK';
  back.onclick=()=>{showScreen('overworld');drawMap();};ch.appendChild(back);
}
function renderBag(){
  const items={
    nexball:  {emoji:'🔵',name:'NEX BALL',  desc:'A basic ball for catching wild Pokémon.'},
    superball:{emoji:'🟣',name:'SUPER BALL',desc:'Better catch rate than a Nex Ball.'},
    healpack: {emoji:'💊',name:'HEAL PACK', desc:'Restores 40 HP to one Pokémon.'},
    revive:   {emoji:'💫',name:'REVIVE',    desc:'Revives a fainted Pokémon to 50% HP.'},
    fullheal: {emoji:'✨',name:'FULL HEAL', desc:'Fully restores one Pokémon.'},
  };
  const list=document.getElementById('bag-list');list.innerHTML='';
  let hasItems=false;
  for(const[key,count] of Object.entries(G.bag)){
    if(count<=0)continue;hasItems=true;
    const item=items[key]||{emoji:'?',name:key,desc:''};
    const div=document.createElement('div');div.className='bag-item';
    div.innerHTML=`<div><div class="bag-item-name">${item.emoji} ${item.name}</div><div class="bag-item-desc">${item.desc}</div></div><div class="bag-item-count">×${count}</div>`;
    if(bagContext==='overworld'){
      div.onclick=()=>{
        if(key==='healpack'){
          const w=G.party.find(p=>p.hp<p.maxHp&&p.hp>0);
          if(!w){notify('All Pokémon are at full HP!');return;}
          w.hp=Math.min(w.maxHp,w.hp+40);G.bag.healpack--;updateOWHeader();notify(w.name+' restored 40 HP! 💊','#00ff88');renderBag();
        } else if(key==='fullheal'){
          const w=G.party.find(p=>p.hp<p.maxHp&&p.hp>0)||G.party.find(p=>p.hp>0);
          if(!w){notify('All Pokémon are at full HP!');return;}
          w.hp=w.maxHp;G.bag.fullheal--;updateOWHeader();notify(w.name+' fully restored! ✨','#00ff88');renderBag();
        } else if(key==='revive'){
          const f=G.party.find(p=>p.hp<=0);
          if(!f){notify('No fainted Pokémon!');return;}
          f.hp=Math.floor(f.maxHp*.5);G.bag.revive--;notify(f.name+' was revived! 💫','#ffdd00');renderBag();
        } else {notify('Use balls in battle!');}
      };
    }
    list.appendChild(div);
  }
  if(!hasItems){
    const empty=document.createElement('div');empty.style.cssText='text-align:center;color:var(--textdim);padding:40px;font-size:12px;';
    empty.textContent='Your bag is empty.';list.appendChild(empty);
  }
}
function renderParty(){
  const list=document.getElementById('party-list');list.innerHTML='';
  G.party.forEach((p,i)=>{
    const hpPct=Math.max(0,p.hp/p.maxHp*100);
    const hpCol=hpPct>50?'var(--hp-green)':hpPct>25?'var(--hp-yellow)':'var(--hp-red)';
    const div=document.createElement('div');div.className='party-card'+(i===0?' lead':'');
    div.innerHTML=`<div class="party-emoji">${p.emoji}</div><div class="party-info">
      <div class="party-name">${p.name} ${i===0?'<span style="color:var(--accent);font-size:9px;">◈ LEAD</span>':''}</div>
      <div class="party-stats">Lv.${p.level} | ${p.type} | HP:${p.hp}/${p.maxHp}</div>
      <div class="party-hp-bar"><div class="party-hp-fill" style="width:${hpPct}%;background:${hpCol};"></div></div>
      <div class="party-xp-wrap"><span class="party-xp-label">XP</span><div class="party-xp-bar"><div class="party-xp-fill" style="width:${Math.min(100,Math.floor(((p.xp||0)/(p.xpNext||100))*100))}%;"></div></div><span class="party-xp-num">${p.xp||0}/${p.xpNext||100}</span></div>
    </div>`;
    list.appendChild(div);
  });
  if(G.party.length===0){
    const e=document.createElement('div');e.style.cssText='text-align:center;color:var(--textdim);padding:40px;font-size:12px;';
    e.textContent='No Pokémon in party!';list.appendChild(e);
  }
}
function renderBadges(){
  const ALL_BADGES=[
    {name:'VOLT BADGE',emoji:'⚡',id:'volt'},
    {name:'FORGE BADGE',emoji:'⚙️',id:'forge'},
    {name:'DEPTH BADGE',emoji:'💧',id:'depth'},
    {name:'EMBER BADGE',emoji:'🔥',id:'ember'},
    {name:'MIND BADGE',emoji:'🔮',id:'mind'},
    {name:'VOID BADGE',emoji:'🌑',id:'void'},
    {name:'CHROME BADGE',emoji:'🤖',id:'chrome'},
    {name:'APEX BADGE',emoji:'🌐',id:'apex'},
  ];
  const grid=document.getElementById('badge-grid');grid.innerHTML='';
  ALL_BADGES.forEach(b=>{
    const earned=G.badges.includes(b.id);
    const div=document.createElement('div');div.className='badge-slot'+(earned?' earned':'');
    div.innerHTML=`<div class="badge-emoji">${b.emoji}</div><div class="badge-name">${b.name}</div>`;
    grid.appendChild(div);
  });
  showScreen('badges');
}

// ── WILD BATTLE ──
function triggerWildBattle(){
  const table=WILD_BY_MAP[G.map]||WILD_BY_MAP.bootville;
  const roll=Math.random()*table.reduce((a,b)=>a+b.weight,0);
  let cum=0,wildId='glitchling';
  for(const e of table){cum+=e.weight;if(roll<cum){wildId=e.id;break;}}
  const base=POKEMON_BASE[wildId];
  const leadLv=G.party[0]?G.party[0].level:5;
  const lvl=Math.max(2,Math.floor(leadLv*.8+Math.random()*4));
  const wild=JSON.parse(JSON.stringify(base));
  wild.level=lvl;
  const sc=1+(lvl-base.level)*0.08;
  wild.maxHp=Math.max(8,Math.floor(wild.maxHp*sc));wild.hp=wild.maxHp;
  wild.atk=Math.floor(wild.atk*Math.max(1,sc));
  startBattle(wild,false,false);
}

// ── BATTLE TIMING CONSTANTS ──
const BATTLE_DELAY=1100;   // standard pause between actions
const BATTLE_FAST=600;     // fast transitions
const BATTLE_SLOW=1800;    // slow dramatic pauses

// ══════════════════════════════════════════════
// BATTLE ENGINE v3.5
// NEW: Type effectiveness · Status effects ·
//      DEF bonus fix · SPD turn order ·
//      Burn halves ATK · Crit hits
// ══════════════════════════════════════════════
function startBattle(enemy,isTrainer,isGym){
  const player=G.party.find(p=>p.hp>0)||G.party[0];
  battleState={
    player:JSON.parse(JSON.stringify(player)),
    enemy:JSON.parse(JSON.stringify(enemy)),
    isTrainer,isGym,turn:'player',over:false,protecting:false,
    playerStatusDef:0,
    playerStatus:null,   // {type, turns}
    enemyStatus:null,
    xpGain:Math.floor(enemy.level*10+15)+(isGym?50:0),
    catchRate:enemy.catchRate||100,
  };
  document.getElementById('btn-catch').style.display=isTrainer?'none':'';
  document.getElementById('btn-run').style.display=isGym?'none':'';
  document.getElementById('enemy-name').textContent=enemy.name;
  document.getElementById('enemy-level').textContent='Lv.'+enemy.level;
  setSprite('enemy-sprite',enemy.name);
  document.getElementById('player-battle-name').textContent=player.name;
  document.getElementById('player-battle-level').textContent='Lv.'+player.level;
  setSprite('player-sprite',player.name);
  const bg=document.getElementById('battle-bg');
  bg.style.backgroundImage='none';
  bg.style.backgroundSize='cover';
  bg.style.backgroundPosition='center';
  if(typeof BATTLE_BGS!=='undefined'){
    const bgKey=isGym?'gym':isTrainer?'trainer':(G.map==='route2'?'route2':G.map==='ironhaven'?'ironhaven':'wild');
    const bgImg=BATTLE_BGS[bgKey];
    if(bgImg&&bgImg.complete&&bgImg.naturalWidth>0){bg.style.backgroundImage='url('+bgImg.src+')';}
    else if(bgImg){bgImg.onload=()=>{bg.style.backgroundImage='url('+bgImg.src+')';};}
  }
  updateBattleHPBars();
  const leader=battleState._gymLeader;
  const openMsg=isGym&&leader?'⚔ '+leader.name+' sent out '+enemy.name+'!':'⚡ A wild '+enemy.name+' appeared!';
  clearLogQueue();
  setBattleLog(openMsg,true);
  showMainMenu();showScreen('battle');
}

// ── DAMAGE CALCULATION (v3.4) ──
function calcDamage(atk,moveName,def){
  const bs=battleState;
  const md=MOVE_DATA[moveName]||{pwr:50,type:'Normal'};
  if(!md.pwr)return{dmg:0,mult:1,crit:false};

  // DEF bonus: each +1 stage adds 50% more defence
  const isPlayer=(def===bs.player);
  const defStages=isPlayer?(bs.playerStatusDef||0):0;
  const defStat=Math.floor(def.def*(1+defStages*0.5));

  // Burn: halve attacker's ATK
  const attackerIs=(atk===bs.player)?'player':'enemy';
  const burnPenalty=(bs[attackerIs+'Status']&&bs[attackerIs+'Status'].type==='burn')?0.5:1;
  const atkStat=Math.floor(atk.atk*burnPenalty);

  // Base formula
  const base=Math.floor((atk.level*.4+2)*md.pwr*atkStat/(defStat*50)+2);

  // Type effectiveness
  const mult=getTypeMultiplier(md.type||'Normal',def.type||'Normal');

  // Critical hit (6.25% → ×1.5)
  const crit=Math.random()<0.0625;
  const critMult=crit?1.5:1;

  // Random variance 85-100%
  const variance=0.85+Math.random()*.15;

  const dmg=Math.max(mult===0?0:1,Math.floor(base*mult*critMult*variance));
  return{dmg,mult,crit};
}

function updateBattleHPBars(){
  const bs=battleState;
  const ep=Math.max(0,bs.enemy.hp/bs.enemy.maxHp*100);
  const pp=Math.max(0,bs.player.hp/bs.player.maxHp*100);
  document.getElementById('enemy-hp-bar').style.width=ep+'%';
  document.getElementById('enemy-hp-bar').style.background=ep>50?'var(--hp-green)':ep>25?'var(--hp-yellow)':'var(--hp-red)';
  document.getElementById('enemy-hp-text').textContent=Math.max(0,bs.enemy.hp)+'/'+bs.enemy.maxHp;
  document.getElementById('player-hp-bar').style.width=pp+'%';
  document.getElementById('player-hp-bar').style.background=pp>50?'var(--hp-green)':pp>25?'var(--hp-yellow)':'var(--hp-red)';
  document.getElementById('player-hp-text').textContent=Math.max(0,bs.player.hp)+'/'+bs.player.maxHp;
  // Update names with status icons
  document.getElementById('player-battle-name').textContent=bs.player.name+getStatusTag('player');
  document.getElementById('enemy-name').textContent=bs.enemy.name+getStatusTag('enemy');
  // XP bar
  const lead=G.party[0];
  if(lead){
    const xpPct=Math.min(100,((lead.xp||0)/(lead.xpNext||100))*100);
    const xpBar=document.getElementById('player-xp-bar');
    const xpText=document.getElementById('player-xp-text');
    if(xpBar) xpBar.style.width=xpPct+'%';
    if(xpText) xpText.textContent='XP '+(lead.xp||0)+'/'+(lead.xpNext||100);
  }
}

// ── FLOATING DAMAGE NUMBERS ──
function showDamageNumber(spriteId, amount, color){
  const el=document.getElementById(spriteId);
  if(!el) return;
  const rect=el.getBoundingClientRect();
  const scene=document.getElementById('battle-scene');
  const sr=scene.getBoundingClientRect();
  const div=document.createElement('div');
  div.className='dmg-float';
  div.textContent=(amount>0?'-':'')+amount;
  div.style.cssText=`left:${rect.left-sr.left+rect.width/2}px;top:${rect.top-sr.top}px;color:${color||'#ff4466'};`;
  scene.appendChild(div);
  setTimeout(()=>div.remove(), 900);
}
function showHealNumber(spriteId, amount){
  showDamageNumber(spriteId, -amount, '#00ff88');
}

// ── BATTLE LOG QUEUE SYSTEM ──
let _logQueue=[], _logBusy=false;
function setBattleLog(msg, instant=false){
  if(instant){ _logQueue=[]; _logBusy=false; _typeLog(msg); return; }
  _logQueue.push(msg);
  if(!_logBusy) _flushLog();
}
function _flushLog(){
  if(!_logQueue.length){ _logBusy=false; return; }
  _logBusy=true;
  _typeLog(_logQueue.shift(), _flushLog);
}
function _typeLog(msg, cb){
  const el=document.getElementById('battle-log');
  if(!el) return;
  el.textContent='';
  let i=0;
  const chars=msg.split('');
  const t=setInterval(()=>{
    if(i>=chars.length){ clearInterval(t); if(cb) setTimeout(cb, 420); return; }
    el.textContent+=chars[i++];
  }, 22);
}
function clearLogQueue(){ _logQueue=[]; _logBusy=false; }
function showMainMenu(){
  document.getElementById('battle-actions').style.display='flex';
  document.getElementById('battle-moves').style.display='none';
  document.getElementById('battle-catch-menu').style.display='none';
  document.getElementById('battle-bag-menu').style.display='none';
  document.getElementById('battle-switch-menu').style.display='none';
}
function showMoveMenu(){
  document.getElementById('battle-actions').style.display='none';
  document.getElementById('battle-moves').style.display='flex';
  const grid=document.getElementById('move-grid');grid.innerHTML='';
  for(const mv of battleState.player.moves){
    const md=MOVE_DATA[mv]||{pwr:50,type:'Normal',pp:20};
    const btn=document.createElement('button');btn.className='move-btn';
    const typeClass='type-'+md.type.toLowerCase().split('/')[0];
    const mult=getTypeMultiplier(md.type||'Normal',battleState.enemy.type||'Normal');
    const effTag=mult>=2?'<span style="color:#ff4">▲SE</span>':mult===0?'<span style="color:#888">✕</span>':mult<1?'<span style="color:#f80">▼NVE</span>':'';
    btn.innerHTML=`${mv} ${effTag}<span class="move-type ${typeClass}">${md.type} | PWR:${md.pwr||'—'}</span>`;
    btn.onclick=()=>executePlayerMove(mv);grid.appendChild(btn);
  }
}
function hideMoveMenu(){showMainMenu();}

// ── EXECUTE PLAYER MOVE (v3.4) ──
function executePlayerMove(moveName){
  if(battleState.over)return;
  const bs=battleState;
  const md=MOVE_DATA[moveName]||{};
  document.getElementById('battle-actions').style.display='none';
  document.getElementById('battle-moves').style.display='none';

  // Paralysis check
  if(checkParaSkip('player')){
    setBattleLog(bs.player.name+' is paralyzed and can\'t move! ⚡');
    setTimeout(()=>{
      const eotMsg=applyEndOfTurnStatus('player');
      if(eotMsg)setBattleLog(eotMsg);
      setTimeout(enemyTurn,eotMsg?1200:0);
    },1400);
    return;
  }

  // Confusion check (33% self-hit)
  if(bs.playerStatus&&bs.playerStatus.type==='conf'&&Math.random()<.33){
    const selfDmg=Math.max(1,Math.floor(bs.player.maxHp/8));
    bs.player.hp=Math.max(0,bs.player.hp-selfDmg);
    setBattleLog(bs.player.name+' is confused and hurt itself! (-'+selfDmg+' HP) 💫');
    updateBattleHPBars();
    if(bs.player.hp<=0){setTimeout(()=>handlePlayerFaint(),BATTLE_FAST);return;}
    setTimeout(enemyTurn,BATTLE_DELAY);
    return;
  }

  // SPD-based turn order (enemy goes first if faster)
  const pSpd=(bs.player.spd||10)*(bs.playerStatus?.type==='para'?.5:1);
  const eSpd=(bs.enemy.spd||10)*(bs.enemyStatus?.type==='para'?.5:1);
  const hasPriority=(md.priority&&md.priority>0)||(moveName==='Quick Attack');
  const playerFirst=hasPriority||(pSpd>=eSpd);

  if(!playerFirst){
    // Enemy faster — it goes first, then player
    _doEnemyAttack(()=>_doPlayerAttack(moveName,md));
    return;
  }
  _doPlayerAttack(moveName,md);
}

function _doPlayerAttack(moveName,md){
  const bs=battleState;
  if(bs.over)return;
  if(md.effect==='protect'){
    bs.protecting=true;
    setBattleLog(bs.player.name+' used '+moveName+'!\n'+bs.player.name+' braced itself!');
    setTimeout(()=>{
      const eotMsg=applyEndOfTurnStatus('player');
      if(eotMsg)setBattleLog(eotMsg);
      setTimeout(enemyTurn,eotMsg?1200:0);
    },1400);
    return;
  }

  const{dmg,mult,crit}=calcDamage(bs.player,moveName,bs.enemy);
  let msg=bs.player.name+' used '+moveName+'!';
  if(md.msg) msg+='\n'+md.msg;
  if(crit) msg+='\n✨ Critical hit!';
  if(dmg>0){
    bs.enemy.hp=Math.max(0,bs.enemy.hp-dmg);
    msg+='\nDealt '+dmg+' damage!';
    msg+=typeEffMessage(mult);
    hitSprite('enemy-sprite');
    showDamageNumber('enemy-sprite',dmg, mult>=2?'#ffdd00':mult===0?'#888':mult<1?'#ff8800':'#ff4466');
  }
  // Secondary effect
  if(md.effect&&md.effect!=='def+1'&&md.effect!=='def+2'){
    const effMsg=applyMoveEffect(md.effect,'player','enemy',dmg);
    if(effMsg) msg+='\n'+effMsg;
  } else if(md.effect==='def+1'||md.effect==='def+2'){
    const effMsg=applyMoveEffect(md.effect,'player','enemy',dmg);
    if(effMsg) msg+='\n'+effMsg;
  }
  setBattleLog(msg);updateBattleHPBars();

  // End of turn status (player)
  const eotMsg=applyEndOfTurnStatus('player');

  if(bs.enemy.hp<=0){
    if(bs.isGym&&bs._gymQueue){
      bs._gymIndex++;
      if(bs._gymIndex<bs._gymQueue.length){
        const next=bs._gymQueue[bs._gymIndex];
        const leader=bs._gymLeader||{name:'LEADER'};
        setBattleLog(leader.name+': "Don\'t think it\'s over!\nGo, '+next.name+'!"');
        setTimeout(()=>{
          bs.enemy=JSON.parse(JSON.stringify(next));
          bs.enemyStatus=null;
          document.getElementById('enemy-name').textContent=next.name;
          document.getElementById('enemy-level').textContent='Lv.'+next.level;
          setSprite('enemy-sprite',next.name);
          updateBattleHPBars();showMainMenu();
        },2200);
        return;
      }
    }
    if(eotMsg)setBattleLog(eotMsg);
    setTimeout(()=>endBattle(true,false),eotMsg?2000:1200);
    return;
  }
  if(eotMsg){setBattleLog(eotMsg);setTimeout(enemyTurn,BATTLE_DELAY);}
  else setTimeout(enemyTurn,BATTLE_DELAY);
}

// ── ENEMY TURN (v3.4) ──
function enemyTurn(){_doEnemyAttack(showMainMenu);}

function _doEnemyAttack(afterCb){
  const bs=battleState;
  if(bs.over){if(afterCb)afterCb();return;}

  // Flinch check
  if(bs.enemyStatusFlinch){bs.enemyStatusFlinch=false;setBattleLog(bs.enemy.name+' flinched!');setTimeout(()=>{const eot=applyEndOfTurnStatus('enemy');if(eot)setBattleLog(eot);setTimeout(()=>{if(afterCb)afterCb();},eot?1200:0);},1400);return;}

  // Paralysis
  if(checkParaSkip('enemy')){
    setBattleLog(bs.enemy.name+' is paralyzed and can\'t move! ⚡');
    setTimeout(()=>{const eot=applyEndOfTurnStatus('enemy');if(eot)setBattleLog(eot);setTimeout(()=>{if(afterCb)afterCb();},eot?1200:0);},1400);
    return;
  }

  // Confusion
  if(bs.enemyStatus&&bs.enemyStatus.type==='conf'&&Math.random()<.33){
    const selfDmg=Math.max(1,Math.floor(bs.enemy.maxHp/8));
    bs.enemy.hp=Math.max(0,bs.enemy.hp-selfDmg);
    setBattleLog(bs.enemy.name+' is confused and hurt itself! (-'+selfDmg+' HP) 💫');
    updateBattleHPBars();
    if(bs.enemy.hp<=0){setTimeout(()=>endBattle(true,false),1200);return;}
    const eot=applyEndOfTurnStatus('enemy');
    if(eot)setTimeout(()=>{setBattleLog(eot);setTimeout(()=>{if(afterCb)afterCb();},BATTLE_FAST);},1400);
    else setTimeout(()=>{if(afterCb)afterCb();},BATTLE_DELAY);
    return;
  }

  // Protect check
  if(bs.protecting){
    setBattleLog(bs.enemy.name+' used a move...\n'+bs.player.name+' was protected!');
    bs.protecting=false;
    const eot=applyEndOfTurnStatus('enemy');
    if(eot)setTimeout(()=>{setBattleLog(eot);setTimeout(()=>{if(afterCb)afterCb();},BATTLE_FAST);},1400);
    else setTimeout(()=>{if(afterCb)afterCb();},BATTLE_DELAY);
    return;
  }

  const mv=bs.enemy.moves[Math.floor(Math.random()*bs.enemy.moves.length)];
  const md=MOVE_DATA[mv]||{};
  const{dmg,mult,crit}=calcDamage(bs.enemy,mv,bs.player);
  let msg=bs.enemy.name+' used '+mv+'!';
  if(crit) msg+='\n✨ Critical hit!';
  if(dmg>0){
    bs.player.hp=Math.max(0,bs.player.hp-dmg);
    msg+='\nDealt '+dmg+' damage!';
    msg+=typeEffMessage(mult);
    hitSprite('player-sprite');
    showDamageNumber('player-sprite',dmg,'#ff4466');
  }
  // Status chance on player
  if(md.effect){
    const effMsg=applyMoveEffect(md.effect,'enemy','player',dmg);
    if(effMsg) msg+='\n'+effMsg;
  }
  setBattleLog(msg);updateBattleHPBars();bs.protecting=false;

  const eot=applyEndOfTurnStatus('enemy');

  if(bs.player.hp<=0){
    G.party[0].hp=0;
    const nextAlive=G.party.findIndex(p=>p.hp>0);
    if(nextAlive===-1){
      setTimeout(()=>endBattle(false,false),1200);
    } else {
      setBattleLog(bs.player.name+' fainted!\nChoose your next Pokémon!');
      setTimeout(()=>openSwitchMenu(),BATTLE_DELAY);
    }
    return;
  }
  if(eot){
    setBattleLog(eot);
    setTimeout(()=>{if(afterCb)afterCb();},BATTLE_DELAY);
  } else {
    setTimeout(()=>{if(afterCb)afterCb();},BATTLE_DELAY);
  }
}

function handlePlayerFaint(){
  const bs=battleState;
  G.party[0].hp=0;
  const nextAlive=G.party.findIndex(p=>p.hp>0);
  if(nextAlive===-1){endBattle(false,false);}
  else{setBattleLog(bs.player.name+' fainted!\nChoose your next Pokémon!');setTimeout(openSwitchMenu,BATTLE_FAST);}
}

function tryRun(){
  if(battleState.isTrainer){setBattleLog("You can't run from a trainer battle!");return;}
  if(Math.random()>.35){setBattleLog('Got away safely!');setTimeout(()=>{showScreen('overworld');drawMap();},BATTLE_FAST);}
  else{setBattleLog("Couldn't escape!\n"+battleState.enemy.name+' blocks the way!');setTimeout(enemyTurn,BATTLE_DELAY);}
}

// ── END BATTLE ──
function endBattle(won,caught){
  battleState.over=true;
  const bs=battleState;
  if(G.party[0])G.party[0].hp=bs.player.hp;
  if(won&&!caught){
    const lead=G.party[0];if(!lead)return;
    const moneyGain=bs.isGym?500:bs.isTrainer?120:Math.floor(bs.xpGain*.8);
    G.money=(G.money||0)+moneyGain;
    // XP split: lead gets full, bench gets half
    lead.xp=(lead.xp||0)+bs.xpGain;
    G.party.slice(1).forEach(p=>{
      if(p.hp>0) p.xp=(p.xp||0)+Math.floor(bs.xpGain*0.5);
    });
    let extra='';
    // Check level ups for all party members
    G.party.forEach(p=>{
      while(p.xp>=(p.xpNext||100)){
        p.level++;p.xp=0;p.xpNext=Math.floor((p.xpNext||100)*1.3);
        p.maxHp=Math.floor(p.maxHp*1.1);p.hp=p.maxHp;
        p.atk=Math.floor(p.atk*1.08);p.def=Math.floor(p.def*1.08);
        extra+='\n★ '+p.name+' is now Lv.'+p.level+'!';
        const evo=EVOLUTIONS[p.name.toLowerCase()];
        if(evo&&p.level>=evo.level&&!pendingEvolution) pendingEvolution={pokemon:p,evo};
      }
    });
    // Show XP gain in log before result
    const xpMsg='+'+(bs.xpGain)+' XP earned!';
    setBattleLog(xpMsg);
    if(bs._isKael){
      G.flags.beatKael=true;
      document.getElementById('result-title').textContent='RIVAL DEFEATED!';
      document.getElementById('result-title').className='result-title result-win';
      document.getElementById('result-detail').textContent='You beat KAEL!\n+'+bs.xpGain+' XP  +'+moneyGain+' NC'+extra;
      document.getElementById('result-btn').onclick=()=>{
        currentDialogue=[
          {emoji:'🧑',speaker:'KAEL',text:'"...Fine. You\'re better than me right now. That\'s all I\'ll admit."'},
          {emoji:'🧑',speaker:'KAEL',text:'"Rex is ahead. He\'s the real test. Don\'t lose to him before I get a rematch."'},
          {emoji:'🧑',speaker:'KAEL',text:'"...Take this."'},
          {emoji:'💊',speaker:'NARRATOR',text:'KAEL handed you 3 Heal Packs and walked away without another word.'},
        ];
        dialogueIndex=0;dialogueCallback=()=>{G.bag.healpack=(G.bag.healpack||0)+3;updateOWHeader();saveGame();showScreen('overworld');drawMap();};
        showScreen('intro');renderDialogue();
      };
      showScreen('result');return;
    }
    if(bs._gym2){
      G.flags.beatGym2=true;G.badges.push('forge');
      document.getElementById('result-title').textContent='GYM CLEARED!';
      document.getElementById('result-title').className='result-title result-win';
      document.getElementById('result-detail').textContent='You defeated Leader REX!\n⚙️ You received the FORGE BADGE!\n+'+bs.xpGain+' XP  +'+moneyGain+' NC'+extra;
      document.getElementById('result-btn').onclick=()=>showGym2VictoryScene();
      showScreen('result');return;
    }
    if(bs.isGym){
      G.flags.beatGym1=true;G.badges.push('volt');
      document.getElementById('result-title').textContent='GYM CLEARED!';
      document.getElementById('result-title').className='result-title result-win';
      document.getElementById('result-detail').textContent='You defeated Leader ZARA!\n⚡ You received the VOLT BADGE!\n+'+bs.xpGain+' XP  +'+moneyGain+' NC'+extra;
      document.getElementById('result-btn').onclick=()=>showGymVictoryScene();
    } else {
      document.getElementById('result-title').textContent='✓ VICTORY!';
      document.getElementById('result-title').className='result-title result-win';
      const xpPct=Math.min(100,Math.floor(((lead.xp||0)/(lead.xpNext||100))*100));
      document.getElementById('result-detail').textContent=bs.enemy.name+' was defeated!\n+'+bs.xpGain+' XP  +'+moneyGain+' NC'+extra+'\nXP: '+xpPct+'% to next level';
      document.getElementById('result-btn').onclick=afterBattle;
    }
  } else if(caught){
    document.getElementById('result-title').textContent='◈ CAUGHT!';
    document.getElementById('result-title').className='result-title result-win';
    document.getElementById('result-detail').textContent=bs.enemy.name+' joined your team!\nParty: '+G.party.length+'/6';
    document.getElementById('result-btn').onclick=afterBattle;
  } else {
    pendingEvolution=null;
  document.getElementById('result-title').textContent='✕ BLACKED OUT';
    document.getElementById('result-title').className='result-title result-lose';
    if(G.party[0])G.party[0].hp=Math.floor(G.party[0].maxHp*.5);
    document.getElementById('result-detail').textContent=G.party[0]?G.party[0].name+' was defeated...\nRestored to 50% HP. Lost 100 NC.':'Your team is down...';
    G.money=Math.max(0,(G.money||0)-100);
    document.getElementById('result-btn').onclick=afterBattle;
  }
  showScreen('result');
}
function showGym2VictoryScene(){
  currentDialogue=[
    {emoji:'👨‍🏭',speaker:'REX',text:'"...I haven\'t lost in four years. You broke my streak. I\'m not angry — I\'m impressed."'},
    {emoji:'⚙️',speaker:'NARRATOR',text:'You received the FORGE BADGE! It\'s cold and heavy in your palm — forged from pure steel.'},
    {emoji:'👨‍🏭',speaker:'REX',text:'"Listen. SYNTEK came to me last month — wanted to \'partner\' with the Gym. I said no. They didn\'t like that."'},
    {emoji:'👨‍🏭',speaker:'REX',text:'"Whatever they\'re building in that smelting plant — it\'s not Pokémon equipment. Be careful heading north."'},
    {emoji:'🚪',speaker:'NARRATOR',text:'You leave Ironhaven Gym with 2 badges. The road ahead grows darker. SYNTEK\'s shadow is everywhere.'},
  ];
  dialogueIndex=0;dialogueCallback=()=>{updateOWHeader();saveGame();setMap(G.map,G.x,G.y);};
  showScreen('intro');renderDialogue();
}

// ── CATCH SYSTEM ──
function openCatchMenu(){
  document.getElementById('battle-actions').style.display='none';
  document.getElementById('battle-catch-menu').style.display='flex';
  const opts=document.getElementById('ball-options');opts.innerHTML='';
  const balls={nexball:{name:'NEX BALL',emoji:'🔵',mult:1},superball:{name:'SUPER BALL',emoji:'🟣',mult:1.5}};
  for(const[key,ball] of Object.entries(balls)){
    if((G.bag[key]||0)<=0)continue;
    const btn=document.createElement('button');btn.className='move-btn';
    btn.innerHTML=`${ball.emoji} ${ball.name} <span class="move-type">×${G.bag[key]}</span>`;
    btn.onclick=()=>throwBall(key,ball.mult);opts.appendChild(btn);
  }
  if(opts.children.length===0) opts.innerHTML='<div style="color:var(--textdim);font-size:12px;padding:10px;">No balls left! Buy more at a shop.</div>';
}
function hideCatchMenu(){showMainMenu();}
function throwBall(ballKey,mult){
  if(battleState.isTrainer){setBattleLog("Can't catch a trainer's Pokémon!");showMainMenu();return;}
  G.bag[ballKey]--;
  const bs=battleState;
  const hpRatio=bs.enemy.hp/bs.enemy.maxHp;
  const catchChance=((bs.catchRate/255)*mult*(1-hpRatio*.7));
  const ballEl=document.getElementById('catch-ball');
  ballEl.textContent=ballKey==='nexball'?'🔵':'🟣';
  ballEl.style.display='block';ballEl.style.animation='none';
  setTimeout(()=>{ballEl.style.animation='ballBounce .8s ease';},50);
  document.getElementById('battle-catch-menu').style.display='none';
  setTimeout(()=>{
    ballEl.style.display='none';
    if(Math.random()<catchChance){
      setBattleLog('Gotcha! '+bs.enemy.name+' was caught! 🎉');
      setTimeout(()=>{
        if(G.party.length<6){
          const c=JSON.parse(JSON.stringify(bs.enemy));
          c.wild=false;c.xp=0;c.xpNext=Math.floor(c.maxHp*3.5);
          G.party.push(c);setBattleLog(bs.enemy.name+' was added to your party!');
        } else {setBattleLog(bs.enemy.name+' was caught but party is full!');}
        setTimeout(()=>endBattle(true,true),1500);
      },1200);
    } else {
      const shakes=Math.floor(Math.random()*3)+1;
      setBattleLog(bs.enemy.name+' broke free after '+shakes+(shakes===1?' shake':' shakes')+'!');
      setTimeout(enemyTurn,BATTLE_DELAY);
    }
  },900);
}

// ── BAG IN BATTLE ──
function openBagInBattle(){
  document.getElementById('battle-actions').style.display='none';
  document.getElementById('battle-bag-menu').style.display='flex';
  const opts=document.getElementById('battle-bag-options');opts.innerHTML='';
  if((G.bag.healpack||0)>0){
    const btn=document.createElement('button');btn.className='move-btn';
    btn.innerHTML=`💊 HEAL PACK ×${G.bag.healpack} <span class="move-type">Restores 40 HP</span>`;
    btn.onclick=()=>{
      const bs=battleState;
      bs.player.hp=Math.min(bs.player.maxHp,bs.player.hp+40);
      G.bag.healpack--;G.party[0].hp=bs.player.hp;
      updateBattleHPBars();setBattleLog(bs.player.name+' restored 40 HP!');
      hideBagInBattle();setTimeout(enemyTurn,BATTLE_FAST);
    };opts.appendChild(btn);
  }
  if((G.bag.fullheal||0)>0){
    const btn=document.createElement('button');btn.className='move-btn';
    btn.innerHTML=`✨ FULL HEAL ×${G.bag.fullheal} <span class="move-type">Fully restore HP</span>`;
    btn.onclick=()=>{
      const bs=battleState;
      bs.player.hp=bs.player.maxHp;G.bag.fullheal--;G.party[0].hp=bs.player.hp;
      updateBattleHPBars();setBattleLog(bs.player.name+' was fully healed!');
      hideBagInBattle();setTimeout(enemyTurn,BATTLE_FAST);
    };opts.appendChild(btn);
  }
  if(opts.children.length===0) opts.innerHTML='<div style="color:var(--textdim);font-size:12px;padding:10px;">No usable items!</div>';
}
function hideBagInBattle(){
  document.getElementById('battle-bag-menu').style.display='none';
  document.getElementById('battle-actions').style.display='flex';
}

// ── SWITCH POKÉMON ──
function openSwitchMenu(){
  document.getElementById('battle-actions').style.display='none';
  document.getElementById('battle-switch-menu').style.display='flex';
  const opts=document.getElementById('switch-options');opts.innerHTML='';
  if(G.party.length<=1){
    opts.innerHTML='<div style="color:var(--textdim);font-size:12px;padding:12px;text-align:center;">No other Pokémon in your party!</div>';
    return;
  }
  G.party.forEach((p,i)=>{
    const isLead=(p.name===battleState.player.name&&i===0);
    const isFainted=p.hp<=0;
    const hpPct=Math.max(0,p.hp/p.maxHp*100);
    const hpCol=hpPct>50?'var(--hp-green)':hpPct>25?'var(--hp-yellow)':'var(--hp-red)';
    const card=document.createElement('div');
    card.className='switch-card'+(isLead?' active-lead':isFainted?' fainted':'');
    card.innerHTML=`
      <div class="switch-card-emoji">${p.emoji}</div>
      <div class="switch-card-info">
        <div class="switch-card-name">${p.name} ${isLead?'◈ ACTIVE':isFainted?'✕ FAINTED':''}</div>
        <div class="switch-card-stats">Lv.${p.level} | ${p.type} | HP: ${p.hp}/${p.maxHp}</div>
        <div class="switch-hp-bar"><div class="switch-hp-fill" style="width:${hpPct}%;background:${hpCol};"></div></div>
      </div>`;
    if(!isLead&&!isFainted) card.onclick=()=>doSwitch(i);
    opts.appendChild(card);
  });
}
function hideSwitchMenu(){
  document.getElementById('battle-switch-menu').style.display='none';
  document.getElementById('battle-actions').style.display='flex';
}
function doSwitch(partyIndex){
  const bs=battleState;
  G.party[0].hp=bs.player.hp;
  const chosen=G.party.splice(partyIndex,1)[0];
  G.party.unshift(chosen);
  bs.player=JSON.parse(JSON.stringify(chosen));
  bs.playerStatus=null; // status clears on switch
  bs.playerStatusDef=0;
  bs.protecting=false;
  document.getElementById('player-battle-name').textContent=chosen.name;
  document.getElementById('player-battle-level').textContent='Lv.'+chosen.level;
  setSprite('player-sprite',chosen.name);
  updateBattleHPBars();
  clearLogQueue();
  setBattleLog('Go, '+chosen.name+'!\n'+bs.enemy.name+' is watching...', true);
  document.getElementById('battle-switch-menu').style.display='none';
  setTimeout(enemyTurn,BATTLE_DELAY);
  updateOWHeader();
}

// ── SPRITE HELPER ──
function setSprite(elId,pokemonName){
  const el=document.getElementById(elId);
  if(!el)return;
  const key=pokemonName.toLowerCase().replace(/[^a-z0-9]/g,'');
  if(typeof SPRITE_IMAGES!=='undefined'&&SPRITE_IMAGES[key]){
    const img=SPRITE_IMAGES[key];
    if(img.complete&&img.naturalWidth>0){el.style.backgroundImage='url('+img.src+')';el.textContent='';}
    else{img.onload=()=>{el.style.backgroundImage='url('+img.src+')';el.textContent='';};}
  } else {
    el.style.backgroundImage='none';
    const EMOJI_MAP={
      sproutex:'🌿',embrit:'🔥',aquibit:'💧',glitchling:'👾',coglet:'⚙️',sparkit:'⚡',
      voltfang:'⚡',rustmoth:'🦋',fumewing:'🦅',nullbot:'🤖',rivalmon:'🔥',
      sparkvolt:'⚡',ampcore:'🌩️',slagmole:'🦔',forgeant:'🐜',drillord:'🔩',
      thornex:'🌿',flamcore:'🔥',hydrobit:'💧',vegithorn:'🌿',infernox:'🔥',tidalcore:'💧',
      glitchwraith:'👻',gearoth:'⚙️',drillcore:'⛏️',
    };
    el.textContent=EMOJI_MAP[key]||'?';
  }
}

function hitSprite(elId){
  const el=document.getElementById(elId);
  if(!el)return;
  el.style.filter='brightness(3) saturate(0)';
  setTimeout(()=>{el.style.filter='';},200);
  // Shake the HP bar too
  const isEnemy=elId==='enemy-sprite';
  const barWrap=document.querySelector(isEnemy?'#enemy-hp-bar':'#player-hp-bar');
  if(barWrap){
    barWrap.classList.remove('hp-shake');
    void barWrap.offsetWidth;
    barWrap.classList.add('hp-shake');
    setTimeout(()=>barWrap.classList.remove('hp-shake'),350);
  }
}
