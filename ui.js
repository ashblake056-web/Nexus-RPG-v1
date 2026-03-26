// ═══════════════════════════════════════════════
// NEXUS — ui.js
// Game flow: intro, starter, Kael, gym scenes,
// evolution, shop, startup
// ═══════════════════════════════════════════════

// ── INTRO ──
const INTRO_SCENES=[
  {emoji:'🌆',speaker:'NARRATOR',text:'The Nexus Region. Towering cities on floating platforms above a dark, polluted ocean. Neon lights everywhere.'},
  {emoji:'🤖',speaker:'NARRATOR',text:'SYNTEK Corporation built this world. Progress came — but so did something darker. Wild Pokémon are disappearing. Others act... wrong.'},
  {emoji:'👩‍🔬',speaker:'PROF. ADA',text:'Oh! You startled me. I was reviewing some very alarming data. But first — I need your name, trainer.'},
];
function runIntro(){currentDialogue=INTRO_SCENES;dialogueIndex=0;dialogueCallback=goToNameEntry;showScreen('intro');renderDialogue();}
function renderDialogue(){
  const s=currentDialogue[dialogueIndex];
  document.getElementById('intro-emoji').textContent=s.emoji;
  document.getElementById('intro-speaker').textContent=s.speaker;
  typeText('dialogue-text',s.text);
}
function advanceDialogue(){
  dialogueIndex++;
  if(dialogueIndex>=currentDialogue.length){if(dialogueCallback)dialogueCallback();}
  else renderDialogue();
}
function typeText(elId,text,speed=18){
  const el=document.getElementById(elId);el.textContent='';let i=0;
  const t=setInterval(()=>{if(i>=text.length){clearInterval(t);return;}el.textContent+=text[i++];},speed);
}
function goToNameEntry(){showScreen('name');}
function confirmName(){G.playerName=(document.getElementById('name-input').value.trim()||'ALEX');showScreen('starter');}

// ── STARTER ──
function selectStarter(i){
  selectedStarter=i;
  document.querySelectorAll('.starter-card').forEach((c,idx)=>c.classList.toggle('selected',idx===i));
  const msgs=["\"Sproutex only trusts those who are patient. Its steel leaves can cut through anything.\" — Prof. Ada",
    "\"Embrit bonds fast with brave trainers. Lead from the front — it hates hesitation.\" — Prof. Ada",
    "\"Aquibit chose you. It can read intentions. You must have good ones.\" — Prof. Ada"];
  document.getElementById('starter-confirm').style.display='flex';
  document.getElementById('starter-confirm-text').textContent=msgs[i];
}
function cancelStarter(){selectedStarter=null;document.querySelectorAll('.starter-card').forEach(c=>c.classList.remove('selected'));document.getElementById('starter-confirm').style.display='none';}
function confirmStarter(){
  const keys=['sproutex','embrit','aquibit'];
  G.starter=keys[selectedStarter];
  G.party=[JSON.parse(JSON.stringify(POKEMON_BASE[G.starter]))];
  const scenes=[
    [{emoji:'🌿',speaker:'SPROUTEX',text:'The capsule opens. Sproutex blinks up at you — metal leaf ears perking up with curiosity. It chose you.'},{emoji:'👩‍🔬',speaker:'PROF. ADA',text:'Perfect. Sproutex trusts you already. I\'ve also given you 5 NexBalls and 3 Heal Packs. Catch Pokémon in the tall grass to build your team!'}],
    [{emoji:'🔥',speaker:'EMBRIT',text:'The capsule bursts open. Embrit leaps onto your arm immediately, plasma vents flickering with excitement.'},{emoji:'👩‍🔬',speaker:'PROF. ADA',text:'Bold choice! Embrit is powerful but reckless — keep it healthy. Here are 5 NexBalls and 3 Heal Packs. Build your team!'}],
    [{emoji:'💧',speaker:'AQUIBIT',text:'The capsule opens slowly. Aquibit stares at you, closes its eyes... then nudges your hand. It decided.'},{emoji:'👩‍🔬',speaker:'PROF. ADA',text:'Aquibit chose you — that\'s extraordinary. It can sense your heart. I\'ve given you 5 NexBalls and 3 Heal Packs to start your journey!'}],
  ];
  currentDialogue=[...scenes[selectedStarter],
    {emoji:'🚪',speaker:'NARRATOR',text:'You step into Bootville. SYNTEK billboards loom over every corner. Route 1 and the tall grass lie ahead — and Gridlock City beyond that.'}];
  dialogueIndex=0;dialogueCallback=()=>{initOverworld();showScreen('overworld');};
  showScreen('intro');renderDialogue();
}

// ── OVERWORLD ──
// ── KAEL RIVAL BATTLE ──
function triggerKaelBattle(){
  if(G.flags.beatKael){
    talkToNPC({emoji:'🧑',name:'KAEL',dialogue:["..You beat me fair and square on Route 2.","I won't forget that. I'll be stronger next time.","Rex is ahead. Don't embarrass yourself."]});
    return;
  }
  const alive=G.party.filter(p=>p.hp>0);
  if(alive.length===0){notify('Heal your Pokémon first!','#ff3355');return;}
  currentDialogue=[
    {emoji:'🧑',speaker:'KAEL',text:'...I knew you\'d make it this far. Route 2. Feels like the right place.'},
    {emoji:'🧑',speaker:'KAEL',text:'I\'ve been training since Bootville. Don\'t think I\'m the same trainer you saw back there.'},
    {emoji:'🧑',speaker:'KAEL',text:'I got my own partner too. Let\'s see who\'s really better. Come on — RIVAL BATTLE!'},
  ];
  dialogueIndex=0;
  dialogueCallback=()=>{
    const kael=JSON.parse(JSON.stringify(POKEMON_BASE.kael_starter));
    // Scale Kael's team to roughly match player's lead
    const lead=G.party[0];
    kael.level=Math.max(14,lead.level-2);
    const sc=1+(kael.level-16)*0.1;
    kael.maxHp=Math.max(50,Math.floor(64*Math.max(1,sc)));kael.hp=kael.maxHp;
    kael.atk=Math.floor(22*Math.max(1,sc));
    battleState._isKael=true;
    startBattle(kael,true,false);
  };
  showScreen('intro');renderDialogue();
}
// ── EVOLUTION SYSTEM ──
function checkAndTriggerEvolution(){
  if(!pendingEvolution)return;
  const {pokemon,evo}=pendingEvolution;
  pendingEvolution=null;
  // Find this pokemon in party and evolve it
  const idx=G.party.findIndex(p=>p.name===pokemon.name);
  if(idx===-1)return;
  const p=G.party[idx];
  const oldName=p.name;
  const oldEmoji=p.emoji;
  // Show evolve screen
  setSprite('evolve-from-emoji', oldName);
  document.getElementById('evolve-from-name').textContent=oldName;
  setSprite('evolve-to-emoji', evo.name);
  document.getElementById('evolve-to-name').textContent=evo.name;
  document.getElementById('evolve-type-text').textContent=evo.type;
  document.getElementById('evolve-continue-btn').style.display='none';
  showScreen('evolve');
  // Apply evolution after 2.5s flash
  setTimeout(()=>{
    p.name=evo.name;p.emoji=evo.emoji;p.type=evo.type;
    p.maxHp+=evo.hpBonus;p.hp=p.maxHp;
    p.atk+=evo.atkBonus;p.def+=evo.defBonus;
    document.getElementById('evolve-stat-text').textContent=
      'HP +'+evo.hpBonus+' | ATK +'+evo.atkBonus+' | DEF +'+evo.defBonus+'\nStats fully restored!';
    document.getElementById('evolve-continue-btn').style.display='block';
    document.getElementById('evolve-from-emoji').classList.add('evolve-flash');
  },2500);
}
function finishEvolve(){
  document.getElementById('evolve-from-emoji').classList.remove('evolve-flash');
  updateOWHeader();saveGame();
  showScreen('overworld');drawMap();
}

// ── SHOP ──
const SHOP_ITEMS=[
  {key:'nexball',  emoji:'🔵',name:'NEX BALL',  desc:'Basic Pokéball.',           price:100},
  {key:'superball',emoji:'🟣',name:'SUPER BALL',desc:'Better catch rate.',         price:300},
  {key:'healpack', emoji:'💊',name:'HEAL PACK', desc:'Restores 40 HP.',            price:150},
  {key:'revive',   emoji:'💫',name:'REVIVE',    desc:'Revives fainted Pokémon.',   price:500},
  {key:'fullheal', emoji:'✨',name:'FULL HEAL', desc:'Restores one Pokémon fully.',price:800},
];
function openShop(){
  document.getElementById('shop-money').textContent='💰 '+(G.money||0)+' NC';
  const list=document.getElementById('shop-list');list.innerHTML='';
  SHOP_ITEMS.forEach(item=>{
    const div=document.createElement('div');div.className='shop-item';
    div.innerHTML=`<div class="shop-item-info">
      <div class="shop-item-name">${item.emoji} ${item.name} <span style="font-size:10px;color:var(--textdim);">×${G.bag[item.key]||0}</span></div>
      <div class="shop-item-desc">${item.desc}</div>
    </div><div class="shop-item-price">${item.price} NC</div>`;
    div.onclick=()=>buyItem(item);
    list.appendChild(div);
  });
  showScreen('shop');
}
function buyItem(item){
  if((G.money||0)<item.price){notify('Not enough NC! (Need '+item.price+')','#ff3355');return;}
  G.money-=item.price;
  if(item.key==='fullheal'){
    // fullheal is usable item not in bag by key, store as fullheal
    G.bag.fullheal=(G.bag.fullheal||0)+1;
  } else {
    G.bag[item.key]=(G.bag[item.key]||0)+1;
  }
  document.getElementById('shop-money').textContent='💰 '+G.money+' NC';
  notify('Bought '+item.name+'! 💰','#ffdd00');
  openShop(); // refresh
}
function closeShop(){showScreen('overworld');drawMap();}

function afterBattle(){
  updateOWHeader();saveGame();
  if(pendingEvolution){
    setTimeout(checkAndTriggerEvolution,600);
  } else {
    showScreen('overworld');drawMap();
  }
}
function showGymVictoryScene(){
  currentDialogue=[
    {emoji:'👩',speaker:'ZARA',text:'"...You\'re good. Really good. I didn\'t hold back — and you still won. Take the Volt Badge. You\'ve earned it."'},
    {emoji:'⚡',speaker:'NARRATOR',text:'You received the VOLT BADGE! It glows with pure electric energy in your hand.'},
    {emoji:'👩',speaker:'ZARA',text:'"One more thing. I\'ve been hearing things about SYNTEK\'s facility on Route 3. Strange power surges. Pokémon screaming at night. Be careful out there."'},
    {emoji:'🚪',speaker:'NARRATOR',text:'You leave Gridlock Gym. The Volt Badge shines in your case. The next Gym is far ahead — in Ironhaven. The journey continues.'},
  ];
  dialogueIndex=0;dialogueCallback=()=>{updateOWHeader();showScreen('overworld');drawMap();saveGame();};
  showScreen('intro');renderDialogue();
}

// ── STARTUP ──
window.addEventListener('load',()=>{
  showScreen('title');
  // Set title background once image loads
  if(typeof TITLE_BG!=='undefined'){
    const titleEl=document.getElementById('screen-title');
    const img=new Image();
    img.onload=()=>{ titleEl.style.backgroundImage='url('+TITLE_BG+')'; };
    img.src=TITLE_BG;
  }
});