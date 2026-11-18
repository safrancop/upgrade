"use strict";
/* =========================================================================
   UPGRADE — a personal-development instrument.
   Plain JavaScript, no build step, no backend. All data lives in the
   browser (localStorage) as one document per day; Export/Import moves it.
   ========================================================================= */

/* ---------- tiny utils ---------- */
const $ = (s,r=document)=>r.querySelector(s);
const el = (t,c,h)=>{const n=document.createElement(t); if(c)n.className=c; if(h!=null)n.innerHTML=h; return n;};
const esc = s => String(s==null?"":s).replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));
const pad = n => String(n).padStart(2,"0");
const keyOf = d => d.getFullYear()+"-"+pad(d.getMonth()+1)+"-"+pad(d.getDate());
const parseKey = k => {const [y,m,d]=k.split("-").map(Number); return new Date(y,m-1,d);};
const todayKey = ()=>keyOf(new Date());
const addDays = (k,n)=>{const d=parseKey(k); d.setDate(d.getDate()+n); return keyOf(d);};
const nowISO = ()=>new Date().toISOString();
const uid = ()=>Math.random().toString(36).slice(2,9)+Date.now().toString(36).slice(-4);
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const MONTHS=["January","February","March","April","May","June","July","August","September","October","November","December"];
const DOW=["S","M","T","W","T","F","S"];
const DOWFULL=["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
function prettyDate(k){const d=parseKey(k);return DOWFULL[d.getDay()]+", "+MONTHS[d.getMonth()]+" "+d.getDate();}

/* ---------- palette for habits ---------- */
const HUES={brass:"#C9A227",sage:"#86A88B",dusk:"#7E8CB8",clay:"#C4705A",lilac:"#9C8AB8"};

/* ---------- seed ---------- */
const SEED_HABITS=[
  {id:"exercise",  name:"Exercise",   section:"move",     unit:"min",  target:30, hue:"clay",  order:1, days:[1,2,3,4,5,6]},
  {id:"reading",   name:"Reading",    section:"read",     unit:"pages",target:20, hue:"sage",  order:2, days:[0,1,2,3,4,5,6]},
  {id:"meditation",name:"Meditation", section:"meditate", unit:"min",  target:10, hue:"dusk",  order:3, days:[0,1,2,3,4,5,6]}
];
const PRESETS=[
  {name:"Journal",          unit:"entry", target:1,  hue:"lilac", section:"journal"},
  {name:"Sleep by 11pm",    unit:"times", target:1,  hue:"dusk"},
  {name:"No phone, first hour", unit:"times", target:1, hue:"brass"},
  {name:"Walk 8,000 steps", unit:"steps", target:8000, hue:"sage"},
  {name:"Cold shower",      unit:"times", target:1,  hue:"dusk"},
  {name:"Deep work block",  unit:"min",   target:90, hue:"brass"},
  {name:"Water — 2L",       unit:"L",     target:2,  hue:"sage"},
  {name:"Stretch",          unit:"min",   target:10, hue:"clay"}
];

/* =========================================================================
   STATE + STORE
   ========================================================================= */
const LS="upgrade.store.v1";
const state={
  profile:{name:"", createdAt:nowISO(), identity:[
    "I am the kind of person who keeps promises to himself.",
    "I do the hard thing early, while it is still quiet.",
    "I finish what I start."
  ], lessonIdx:0, lastLessonDay:null},
  habits:[], days:{}, books:[],
  view:"today", selDate:todayKey(), calMonth:null, rail:true,
  tab:{goals:"quarter",journal:"write",meditate:"breath",read:"now",move:"log",mind:"identity",progress:"overview"}
};
let lastSavedAt=null;

function loadLocal(){
  try{
    const raw=localStorage.getItem(LS); if(!raw) return false;
    const o=JSON.parse(raw);
    if(o.profile) state.profile=Object.assign(state.profile,o.profile);
    if(Array.isArray(o.habits)) state.habits=o.habits;
    if(o.days) state.days=o.days;
    if(Array.isArray(o.books)) state.books=o.books;
    return true;
  }catch(e){ return false; }
}
function saveLocal(){
  try{
    localStorage.setItem(LS,JSON.stringify({profile:state.profile,habits:state.habits,days:state.days,books:state.books,savedAt:nowISO()}));
    lastSavedAt=new Date();
    stampSaved();
    return true;
  }catch(e){ console.warn("[upgrade] local save failed",e); return false; }
}
function stampSaved(){
  const n=document.getElementById("savedStamp");
  if(n&&lastSavedAt) n.textContent="Saved "+pad(lastSavedAt.getHours())+":"+pad(lastSavedAt.getMinutes());
  document.querySelectorAll(".saved[data-live]").forEach(x=>{
    x.textContent = lastSavedAt ? "Saved "+pad(lastSavedAt.getHours())+":"+pad(lastSavedAt.getMinutes()) : "";
    x.classList.add("ok");
  });
}
function ensureSeed(){
  if(!state.habits.length){ state.habits=SEED_HABITS.map(h=>Object.assign({createdAt:nowISO(),archived:false},h)); }
}

/* day object helpers.
   Data restored from a backup (or parsed elsewhere) may be frozen, and this file
   runs in strict mode — writing to one throws. Everything that enters state is thawed first. */
const thaw = o => (o && typeof o==="object") ? JSON.parse(JSON.stringify(o)) : o;
function day(k){
  if(!state.days[k]) state.days[k]={date:k,entries:{},journal:null,meditation:[],reading:[],exercise:[],lesson:null};
  if(Object.isFrozen(state.days[k])) state.days[k]=thaw(state.days[k]);
  const d=state.days[k];
  d.entries=d.entries||{}; d.meditation=d.meditation||[]; d.reading=d.reading||[]; d.exercise=d.exercise||[];
  d.cardio=d.cardio||[];
  return d;
}
function dayRO(k){ return state.days[k]||null; }

const clone = o => JSON.parse(JSON.stringify(o));

/* Every write goes straight to localStorage: synchronous, so it cannot half-fail. */
function pushDay(k,undo=null){
  const d=day(k); d.updatedAt=nowISO();
  saveLocal();
  noticeProgress(k,undo);
}
function pushProfile(){ state.profile.updatedAt=nowISO(); saveLocal(); }
function pushHabit(h){ h.updatedAt=nowISO(); saveLocal(); }
function pushBook(b){ b.updatedAt=nowISO(); saveLocal(); }

/* =========================================================================
   HABIT MATH
   ========================================================================= */
function scheduled(h,k){ const dow=parseKey(k).getDay(); return !h.days || h.days.includes(dow); }
function isDone(h,k){ const d=dayRO(k); return !!(d && d.entries && d.entries[h.id] && d.entries[h.id].done); }
function valueOf(h,k){ const d=dayRO(k); const e=d&&d.entries&&d.entries[h.id]; return e&&e.value!=null?e.value:0; }
function activeHabits(){ return state.habits.filter(h=>!h.archived).sort((a,b)=>(a.order||99)-(b.order||99)); }

function setDone(h,k,on,value){
  const d=day(k);
  const before=d.entries[h.id]?clone(d.entries[h.id]):null;
  if(on) d.entries[h.id]={done:true, value: value!=null?value:(h.target||1), at:nowISO()};
  else delete d.entries[h.id];
  pushDay(k,{habitId:h.id,before,after:d.entries[h.id]?clone(d.entries[h.id]):null});
}
function bump(h,k,amount){
  const d=day(k);
  const cur=(d.entries[h.id]&&d.entries[h.id].value)||0;
  const next=Math.max(0,cur+amount);
  if(next<=0){ delete d.entries[h.id]; }
  else d.entries[h.id]={done:next>=(h.target||1), value:next, at:nowISO()};
  pushDay(k);
}
function streak(h){
  let k=todayKey(), n=0;
  if(scheduled(h,k) && !isDone(h,k)) k=addDays(k,-1); // today still open — don't punish
  let guard=0;
  while(guard++<3650){
    if(!scheduled(h,k)){ k=addDays(k,-1); continue; }
    if(isDone(h,k)){ n++; k=addDays(k,-1); } else break;
  }
  return n;
}
function bestStreak(h){
  const keys=Object.keys(state.days).sort();
  if(!keys.length) return 0;
  let best=0,cur=0,k=keys[0],end=todayKey(),guard=0;
  while(k<=end && guard++<4000){
    if(scheduled(h,k)){ if(isDone(h,k)){cur++; best=Math.max(best,cur);} else cur=0; }
    k=addDays(k,1);
  }
  return best;
}
function dayScore(k){
  const hs=activeHabits().filter(h=>scheduled(h,k));
  if(!hs.length) return {done:0,total:0,pct:0};
  const done=hs.filter(h=>isDone(h,k)).length;
  return {done,total:hs.length,pct:done/hs.length};
}
function perfectStreak(){
  let k=todayKey(),n=0;
  const t=dayScore(k); if(t.total===0||t.pct<1) k=addDays(k,-1);
  let guard=0;
  while(guard++<3650){
    const s=dayScore(k);
    if(s.total>0 && s.pct>=1){ n++; k=addDays(k,-1); }
    else if(s.total===0){ k=addDays(k,-1); }
    else break;
  }
  return n;
}
function weekKeys(offset){
  const d=new Date(); d.setDate(d.getDate()-d.getDay()+(offset||0)*7);
  return Array.from({length:7},(_,i)=>{const x=new Date(d); x.setDate(d.getDate()+i); return keyOf(x);});
}
function totalCheckoffs(){
  let n=0; for(const k in state.days){ const e=state.days[k].entries||{}; for(const id in e) if(e[id].done) n++; }
  return n;
}

/* =========================================================================
   CONTENT — micro-lessons, prompts, sessions
   ========================================================================= */
const LESSONS=[
 {t:"Start with a door, not a room",tag:"Habits",b:[
  "Every habit you have ever kept began with something too small to fail at. Two minutes of reading. One set. Sitting down on the cushion.",
  "The small version is not the goal — it is the door. Most days you walk through it and keep going. On the bad days, you walk through it and stop, and that is still a win, because the habit survived the day."],
  a:"Pick your hardest habit and write down its two-minute version. That version is what you owe yourself today."},
 {t:"Every check-off is a vote",tag:"Identity",b:[
  "You are not trying to run. You are trying to become a person who runs. The run is just the ballot.",
  "A missed day does not erase the sessions you have already done. Each return adds another piece of evidence that this matters to you."],
  a:"Finish this sentence out loud before your first habit today: “I am the kind of person who ___.”"},
 {t:"Begin again, as often as needed",tag:"Habits",b:[
  "A gap in your routine is information. Your time, energy or circumstances may have changed.",
  "You can return with a smaller version, change the schedule or take a deliberate rest. Your earlier effort still counts."],
  a:"Choose one manageable next step. If the old routine no longer fits, adjust it."},
 {t:"Change the room, not your willpower",tag:"Environment",b:[
  "Willpower is a battery. The room is a wire. People with impressive discipline usually have unimpressive temptations within reach.",
  "The book on the pillow. The shoes by the door. The phone charging in the other room. You are not weak — you are just close to the wrong things."],
  a:"Move one object tonight so tomorrow's habit is easier than not doing it."},
 {t:"The space between",tag:"Mind",b:[
  "Something happens. You react. It feels instant, but it is not — there is a gap, and everything you would call maturity lives inside it.",
  "Meditation is not about emptying your mind. It is reps at noticing the gap. Every time you catch yourself drifting and come back, you have widened it slightly."],
  a:"Next time you feel the flash of irritation, name it silently — “irritation” — and take one breath before you answer."},
 {t:"What you rehearse, you become",tag:"Subconscious",b:[
  "The nervous system does not draw a hard line between vivid rehearsal and experience. Athletes have used this for a century: you walk the course in your head before you walk it with your feet.",
  "This is not magic and it does not replace the work. It lowers the friction of the work — the first rep feels familiar instead of foreign."],
  a:"Before you start today's hardest habit, spend 60 seconds seeing yourself doing it — the room, the first movement, the way it ends."},
 {t:"Say it in the present tense",tag:"Subconscious",b:[
  "“I will be disciplined” keeps discipline permanently in the future. The mind takes the sentence literally and files it under someday.",
  "Write the statement as though it is already true and specific enough to be checkable: not “I am successful”, but “I train before 8am and I read before I sleep.” Vague statements do nothing. Concrete ones become instructions."],
  a:"Rewrite one of your identity statements so it names a behaviour and a time."},
 {t:"Name it to tame it",tag:"Mind",b:[
  "Putting a precise word on a feeling changes the feeling. Not “bad” — “disappointed”, “resentful”, “under-slept”, “anxious about Thursday”.",
  "Half of what we call a bad mood is an unlabelled one. The label gives you something you can actually respond to."],
  a:"In tonight's journal, name today's dominant feeling in one exact word before you write anything else."},
 {t:"Protect the first hour",tag:"Focus",b:[
  "The first hour sets the ceiling for the day's attention. Spend it reacting to other people's requests and you spend the rest of the day at their pace.",
  "Nobody defends the first hour by accident. It is a decision made the night before."],
  a:"Decide now what the first 30 minutes of tomorrow are for. Write it down. It is a commitment, not an intention."},
 {t:"Sleep is the training",tag:"Body",b:[
  "You do not get stronger in the gym. You get stronger in the recovery, and the largest single lever on recovery is sleep.",
  "Chronic short sleep quietly taxes appetite, mood, patience and judgment. A brilliant morning routine on five hours of sleep is a rounding error."],
  a:"Set a bedtime alarm, not a wake alarm. The wake time is downstream of it."},
 {t:"Slow is smooth, smooth is fast",tag:"Focus",b:[
  "Switching costs are invisible and enormous. Every jump between tasks leaves residue — a part of your attention stays behind on the last thing.",
  "One thing, finished, then the next. It feels slower. It is measurably faster."],
  a:"Work in one block today with the phone out of the room. Notice how long it takes for the urge to check to fade."},
 {t:"The audit, not the verdict",tag:"Reflection",b:[
  "An evening review is not a trial. Asking “what went wrong today” produces shame; shame produces avoidance; avoidance produces another bad day.",
  "Ask instead: what worked, what did not, what will I change tomorrow. Same information, opposite effect."],
  a:"Answer those three questions tonight in one sentence each. No adjectives about yourself."},
 {t:"Compounding is invisible until it isn't",tag:"Persistence",b:[
  "Progress is not linear, and the flat part is longer than anyone advertises. For weeks the graph looks like nothing is happening.",
  "The plateau is not the absence of progress — it is progress you cannot see yet. Most people quit inside a stretch that was about to end."],
  a:"Look at your calendar. Count the marks, not the feeling. The marks are the truth."},
 {t:"Reward the showing up",tag:"Habits",b:[
  "If the only thing you celebrate is the outcome, you will only feel good on rare days — and habits die on ordinary ones.",
  "Attach the small satisfaction to the act itself: the check-off, the closed ring, the line in the calendar. Make the evidence visible and enjoy the evidence."],
  a:"After your next habit, pause for three seconds and actually notice that you did it. That pause is the reinforcement."}
];
const MORNING_PROMPTS=[
 "What would make today count, even if nothing else went right?",
 "What are you avoiding, and what is the smallest first move on it?",
 "Who do you want to have been by tonight?",
 "What is in your control today, and what is not?",
 "Where will your attention leak today — and what will you do about it?",
 "What would the version of you from a year ago be impressed by today?"
];
const EVENING_PROMPTS=[
 "What worked today? What did not? What changes tomorrow?",
 "What did you do today that your future self will thank you for?",
 "Where did you act out of habit instead of choice?",
 "What is one thing you are letting go of before you sleep?",
 "What surprised you today?",
 "What did today teach you about how you actually work?"
];
const MOODS=[
 {v:1,w:"Rough"},{v:2,w:"Low"},{v:3,w:"Even"},{v:4,w:"Good"},{v:5,w:"Charged"}
];
const BREATH=[
 {id:"box",   name:"Box",       phases:[["Inhale",4],["Hold",4],["Exhale",4],["Hold",4]], note:"Steady the system. Good before hard work."},
 {id:"calm",  name:"4-7-8",     phases:[["Inhale",4],["Hold",7],["Exhale",8]],            note:"Long exhale. Good for sleep and nerves."},
 {id:"coh",   name:"Coherence", phases:[["Inhale",5.5],["Exhale",5.5]],                   note:"Even breathing at about 5.5 breaths a minute."},
 {id:"lift",  name:"Energize",  phases:[["Inhale",6],["Exhale",2]],                       note:"An inhale-led rhythm for a daytime pause. Keep it gentle."},
 {id:"easy",name:"Easy pace",phases:[["Inhale",3],["Exhale",3]],note:"A shorter, equal rhythm to get acquainted with paced breathing. No holds."},
 {id:"unwind",name:"Unwind",phases:[["Inhale",4],["Exhale",6]],note:"A gentle longer exhale for winding down. No holds."},
 {id:"steady",name:"Steady",phases:[["Inhale",5],["Exhale",5]],note:"An even rhythm to rest your attention on before a task."},
 {id:"soft",name:"Soft landing",phases:[["Inhale",3],["Exhale",4]],note:"A small shift toward a longer exhale, for a quiet pause."}
];
const SESSIONS=[
 {id:"settle",name:"Settle",min:5,desc:"Arrive, drop the day, find the breath.",lines:[
   [0,"Sit. Let the weight of your body land where it lands."],
   [25,"Nothing to fix for the next five minutes."],
   [60,"Find the breath where you feel it most clearly. The nose, the chest, the belly."],
   [110,"When the mind leaves — and it will — that noticing is the practice, not the failure."],
   [170,"Let the exhale be a little longer than the inhale."],
   [230,"Widen out. The sounds in the room. The temperature of the air."],
   [280,"Take one deliberate breath, and carry this pace into whatever is next."]]},
 {id:"scan",name:"Body scan",min:10,desc:"Move attention slowly from head to feet.",lines:[
   [0,"Close your eyes. Three slow breaths to arrive."],
   [40,"Bring attention to the top of the head. No agenda — just look."],
   [110,"The face. The jaw. Let it hang loose."],
   [180,"Shoulders. Drop them a centimetre further than you think they can go."],
   [260,"Arms, hands, fingertips."],
   [340,"Chest and belly, rising and falling on their own."],
   [420,"Hips, legs, the whole length of them."],
   [500,"Feet. The points of contact with the floor."],
   [560,"The whole body at once, breathing."]]},
 {id:"prime",name:"Identity priming",min:7,desc:"Rehearse who you are being today.",lines:[
   [0,"Sit tall. Three breaths, each exhale longer than the inhale."],
   [40,"Bring to mind the person you are becoming. Not a fantasy — the near version, six months out."],
   [100,"How does that person start their morning? See the first ten minutes of it."],
   [170,"Now your own statements. Say each one silently, slowly, as a fact."],
   [260,"Pick the one that felt least true. Stay with that one."],
   [340,"See yourself doing the one thing today that makes it truer."],
   [390,"Open your eyes. Go do that thing first."]]},
 {id:"rehearse",name:"Rehearse the day",min:6,desc:"Walk through the day before you live it.",lines:[
   [0,"Eyes closed. Let the breath settle for a moment."],
   [30,"Picture the first hard moment of today. See it in detail — the room, the time, who is there."],
   [100,"Watch yourself handle it well. Not perfectly. Well."],
   [170,"Now the second one. Same thing."],
   [240,"Find the moment today where you usually give in. See yourself walking past it."],
   [300,"One breath. Open your eyes."]]},
 {id:"release",name:"Letting go",min:10,desc:"Put the day down before you sleep.",lines:[
   [0,"Lie down or sit back. Let the exhale get long."],
   [50,"Name what you are still carrying. One thing at a time."],
   [130,"For each one ask: is there anything to do about it tonight?"],
   [220,"If yes, say when you will do it. If no, set it down."],
   [320,"Feel the weight of the body on the surface underneath it."],
   [430,"Nothing more is required of you today."],
   [520,"Let the breath do what it wants."]]}
];

// Original three-day courses. Each day introduces a different attention practice.
const MED_COURSES=[
 {id:'sleep',name:'Sleep',title:'Put the day down',desc:'Make a little room for rest.',hue:'dusk',days:[
 ['Arrive in bed','Feel the places where the bed or chair supports you. Let those points hold your weight.','Notice the forehead, then the jaw. Let either soften if it wants to.','Follow a few ordinary breaths. There is no pace to achieve.','If sleep does not come, resting here is enough for this moment.'],
 ['Leave it for tomorrow','Name one unfinished thing from today without working on it.','Imagine giving it a place on tomorrow’s page. You can return to it then.','When another task arrives, recognise it as planning and return to the support underneath you.','Let the space between thoughts be unfilled. Nothing needs to go in it.'],
 ['A softer ending','Recall the support of the bed and the practice of setting a thought aside.','Move attention slowly from your feet to your hands, noticing warmth or contact.','Now let the body be one whole shape, breathing without instruction.','You can let the practice fade. There is no need to check whether it worked.']
 ]},
 {id:'anxiety',name:'Anxiety',title:'Here, for a moment',desc:'Find an anchor in your surroundings.',hue:'sage',days:[
 ['Look around','Keep your eyes open if you prefer. Find one ordinary object in the room.','Notice its edges, colours and the way light falls on it.','Feel your feet or hands touching a surface. Stay with that contact for a few breaths.','Thoughts can be present while you notice the room around you.'],
 ['Name what is here','Find the contact point you used yesterday, or choose another one.','If a feeling is noticeable, give it a simple name: unease, tension, uncertainty.','You do not have to explain or change it. Look again at an object nearby.','Move gently between the feeling and the room, choosing what feels manageable.'],
 ['Make room','Begin with a sight, a sound and a point of contact.','Notice a thought as something happening now, rather than a task you must finish.','Try saying silently: this is a worried thought. Then return to contact.','Choose a small next action you can take after this pause.']
 ]},
 {id:'focus',name:'Focus',title:'One thing at a time',desc:'Practise returning to what you chose.',hue:'brass',days:[
 ['Choose an anchor','Choose the breath at your nose, or a steady sound in the room.','Let this one sensation be the place your attention returns to.','When you notice a distraction, quietly name it thinking and begin again.','Each return is part of the practice. The number of distractions does not matter.'],
 ['Count and return','Follow an ordinary breath. Count one at the end of the exhale.','Continue up to five, then begin again at one. Keep the breath unforced.','If you lose the count, the next exhale can simply be one.','Let counting become lighter. Notice the sensation underneath the number.'],
 ['Carry it into work','Rest attention on the anchor you found most helpful.','Let a distraction pass without taking the next step in its story.','Picture the first small action of your next task: opening a page or writing a line.','When this ends, give that one action your attention before choosing another.']
 ]},
 {id:'stress',name:'Stress',title:'Between demands',desc:'Pause, notice and choose your next step.',hue:'clay',days:[
 ['Unclench','Notice where your hands are resting. Let the fingers loosen if comfortable.','Check the jaw and shoulders without trying to arrange them perfectly.','Feel the breath moving in the body, or listen to a sound nearby.','Allow one moment without preparing your response to the next demand.'],
 ['Separate the threads','Bring one current demand to mind, just enough to name it.','Notice the difference between the task itself and what you are saying about yourself.','Let the commentary rest while you feel your hands again.','You can respond to a task one step at a time. Stay here for a few more breaths.'],
 ['Choose the next step','Return to the hands, the shoulders and an ordinary breath.','Ask which part of today needs action and which part can wait.','Choose one manageable step. You do not have to rehearse the whole day.','Stay with the feeling of support before you begin again.']
 ]},
 {id:'gratitude',name:'Gratitude',title:'Notice the ordinary',desc:'Pay attention to what is already here.',hue:'sage',days:[
 ['Something small','Bring to mind one ordinary thing you appreciated recently: a drink, a patch of light, a quiet minute.','Recall one concrete detail of that moment. What did you see or feel?','Stay with the detail without trying to manufacture a grateful feeling.','If nothing comes to mind, notice the surface supporting you right now.'],
 ['Someone','Think of someone whose small action made a day a little easier.','Remember the action itself, without needing to make the person perfect.','Notice any response in your body. No particular feeling is required.','You might thank them later. For now, simply let the moment be remembered.'],
 ['Something you did','Recall a small act of care you offered yourself or someone else.','Notice the effort it took, even if nobody commented on it.','Let that memory sit beside the difficult parts of the week. Both can be true.','Choose one ordinary thing you would like to notice more often.']
 ]},
 {id:'comfort',name:'Pain & comfort',title:'A gentler place to rest',desc:'Explore comfortable anchors at your pace.',hue:'lilac',days:[
 ['Find a neutral place','Adjust your position as needed. You never need to stay still through discomfort.','Find a neutral or comfortable sensation, perhaps a hand touching fabric.','Stay with that sensation or choose a sound in the room instead.','Let your attention rest where it feels manageable.'],
 ['Widen the frame','Begin with the comfortable anchor you chose last time.','Notice something beyond the body: light, space or a distant sound.','You can move your attention between these anchors at any time.','There is no need to focus on pain or to make it disappear.'],
 ['Respond with care','Choose a supported position and a familiar anchor.','Ask what would make the next few minutes a little more comfortable.','Allow a change of position, a pause or simply a wider view of the room.','Carry that permission to adjust with you when the practice ends.']
 ]},
 {id:'confidence',name:'Confidence',title:'Trust a small step',desc:'Remember effort and rehearse a beginning.',hue:'lilac',days:[
 ['Remember an effort','Recall a time you tried something even though you were uncertain.','Stay with the action you took, rather than whether the result was impressive.','Notice one concrete detail: what your hands did, or the words you began with.','Let the memory be evidence of an effort you already made.'],
 ['Meet the doubt','Bring to mind a small upcoming challenge. Keep it manageable.','Notice any doubtful words as thoughts you can hear without obeying immediately.','Return to the support beneath you. Uncertainty can be here too.','Imagine taking only the first step while allowing that uncertainty to remain.'],
 ['Rehearse a beginning','Choose one action you intend to take today.','Picture where you will be and the first movement you will make.','If it becomes awkward, picture pausing and trying the next small step.','You do not need a perfect performance. You have a place to begin.']
 ]},
 {id:'wake',name:'Wake up',title:'Begin with attention',desc:'Arrive in the day before it gathers speed.',hue:'brass',days:[
 ['Meet the morning','With eyes open, notice the light in the room.','Feel your feet and hands. Move them gently if that feels useful.','Listen for a nearby sound, then a more distant one.','Let yourself arrive before you reach for the next thing.'],
 ['Choose a quality','Notice the room and the contact of your feet with the floor.','Choose a quality to practise today, such as patience, curiosity or care.','Picture one ordinary moment where you could practise it.','Let the word be a reminder, not another standard you must meet.'],
 ['Begin simply','Return to the light, the sounds and an ordinary breath.','Recall the quality you chose, or choose a new one for today.','What is the smallest useful beginning you can make after this?','Give yourself a moment of stillness before that first action.']
 ]},
 {id:'performance',name:'Performance',title:'Before the moment',desc:'Rehearse attention for something that matters.',hue:'dusk',days:[
 ['Arrive before acting','Picture the setting of an upcoming task, conversation or performance.','Feel the contact beneath you now, and imagine finding that same anchor there.','Notice your breath without changing it. You can begin from here.','Return to the actual room and let the imagined scene go for a moment.'],
 ['Practise recovering','Recall the task, then imagine a small interruption or mistake.','Picture noticing it, pausing and finding your next useful action.','Rehearse returning your attention, without replaying the mistake.','Rest with an ordinary breath. Recovery can be part of preparation.'],
 ['Trust the next action','Find a steady point of contact and let your attention settle there.','Recall the beginning you rehearsed and the way you can return after an interruption.','Choose a short cue, such as next action, to carry into the moment.','Let the rehearsal end. Your next step will happen in its own time.']
 ]}
];
const COURSE_SESSIONS=MED_COURSES.flatMap(c=>c.days.map((d,i)=>({id:c.id+'-'+(i+1),course:c.id,day:i+1,name:d[0],min:5+i,desc:c.title+' · Day '+(i+1),lines:[[0,'Find a supported position. Keep your eyes open or softly lowered. Breathe comfortably.'],...d.slice(1).map((line,j)=>[30+j*(50+i*15),line]),[(5+i)*60-25,'Notice the room again. Take your time as you finish, or stay resting if you wish.']]})));

/* =========================================================================
   NAV
   ========================================================================= */
const ICONS={
today:'<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="10" cy="10" r="7.2"/><path d="M10 6v4.2l2.6 1.6" stroke-linecap="round"/></svg>',
journal:'<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M5 3.5h9a1.5 1.5 0 011.5 1.5v11L14 14.6l-1.5 1.4-1.5-1.4-1.5 1.4L8 14.6l-1.5 1.4V5A1.5 1.5 0 015 3.5z"/><path d="M8 7h5M8 10h5" stroke-linecap="round"/></svg>',
meditate:'<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="10" cy="10" r="2.4"/><path d="M4.6 6.2a6.4 6.4 0 000 7.6M15.4 6.2a6.4 6.4 0 010 7.6" stroke-linecap="round"/></svg>',
read:'<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M10 5.6C8.7 4.6 7 4.2 4.4 4.2v9.6c2.6 0 4.3.4 5.6 1.4 1.3-1 3-1.4 5.6-1.4V4.2c-2.6 0-4.3.4-5.6 1.4z"/><path d="M10 5.6v9.6" /></svg>',
move:'<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M3.2 8v4M5.6 6.4v7.2M14.4 6.4v7.2M16.8 8v4M5.6 10h8.8"/></svg>',
mind:'<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M10 3.2c3 0 5 2 5 4.6 0 1.6-.8 2.5-.8 3.9 0 .9.5 1.4.5 2.2 0 1.4-1.6 2.4-3.4 2.4-1.4 0-2.3-.6-2.3-1.7"/><path d="M10 3.2C7 3.2 5 5.2 5 7.8c0 1.6.8 2.5.8 3.9 0 .9-.5 1.4-.5 2.2" stroke-linecap="round"/></svg>',
coach:'<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M10 2.8v3.4M10 13.8v3.4M4.9 4.9l2.4 2.4M12.7 12.7l2.4 2.4M2.8 10h3.4M13.8 10h3.4M4.9 15.1l2.4-2.4M12.7 7.3l2.4-2.4"/></svg>',
progress:'<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M3.5 16.5h13"/><path d="M6 16.5V11M10 16.5V5.5M14 16.5V8.5"/></svg>'
};
ICONS.cardio='<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2 10h4l2-5 4 10 2-5h4"/></svg>';
ICONS.habits='<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="5.6" height="5.6" rx="1.3"/><rect x="11.4" y="3" width="5.6" height="5.6" rx="1.3"/><rect x="3" y="11.4" width="5.6" height="5.6" rx="1.3"/><rect x="11.4" y="11.4" width="5.6" height="5.6" rx="1.3" fill="currentColor"/></svg>';
ICONS.goals='<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="10" cy="10" r="7"/><circle cx="10" cy="10" r="3.2"/><path d="M10 1.8V4M10 16v2.2M1.8 10H4M16 10h2.2"/></svg>';
const EDIT_ICON='<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12.6 4.4l3 3L7.2 15.8l-3.7.7.7-3.7z"/></svg>';
/* The practices a person can choose to keep in their menu. The rest of the menu is fixed. */
const PRACTICES=[
 {id:"journal",label:"Journal",sub:"A few words, a clearer mind"},
 {id:"meditate",label:"Meditation",sub:"Timer, guided sessions, breathwork"},
 {id:"read",label:"Reading",sub:"Your bookshelf and what you kept"},
 {id:"move",label:"Exercise",sub:"Strength training and history"},
 {id:"cardio",label:"Cardio",sub:"Runs, rides, swims and goals"},
 {id:"mind",label:"Mind",sub:"Identity, rehearsal, letting the day go"}
];
function enabledPractices(){
  const sel=state.profile.practices;
  return Array.isArray(sel)?PRACTICES.filter(p=>sel.includes(p.id)):PRACTICES;
}
function navModel(){
  return [
   {g:"",items:[{id:"today",label:"Today"},{id:"goals",label:"Goals"},{id:"habits",label:"Habits"}]},
   {g:"Practices",key:"practices",edit:true,items:enabledPractices()},
   {g:"Guidance",key:"guidance",items:[{id:"coach",label:"Lessons"},{id:"progress",label:"Progress"}]}
  ];
}
function navLabel(id){
  return {today:"Today",goals:"Goals",habits:"Habits",coach:"Lessons",progress:"Progress"}[id]||PRACTICES.find(p=>p.id===id)?.label;
}
/* Which menu groups are folded is a per-device preference, not profile data. */
let navClosed={};
try{ navClosed=JSON.parse(localStorage.getItem("upgrade.nav.v1")||"{}")||{}; }catch(e){}
function saveNavClosed(){ try{ localStorage.setItem("upgrade.nav.v1",JSON.stringify(navClosed)); }catch(e){} }
function railHello(){
  const h=new Date().getHours();
  return (h<12?"Good morning":h<18?"Good afternoon":"Good evening")+", "+(state.profile.name||"friend").split(" ")[0];
}
function renderNav(){
  const n=$("#nav"); n.innerHTML="";
  const hello=$("#railHello"); if(hello) hello.textContent=railHello();
  const S=dayScore(todayKey());
  const badge={today:S.total?S.done+"/"+S.total:"",goals:activeGoals().length?String(activeGoals().length):"",habits:String(activeHabits().length)};
  navModel().forEach(g=>{
    let host=n;
    if(g.g){
      const closed=!!navClosed[g.key];
      const hd=el("div","navhead");
      const t=el("button","navgroup"+(closed?" folded":""),'<span class="gtxt">'+esc(g.g)+'</span><svg class="gchev" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 4.5L6 7.5 9 4.5"/></svg>');
      t.dataset.key=g.key;t.setAttribute("aria-expanded",String(!closed));
      t.setAttribute("aria-label",(closed?"Show ":"Hide ")+g.g);
      t.onclick=()=>{ navClosed[g.key]=!navClosed[g.key]; saveNavClosed(); renderNav(); $('.navgroup[data-key="'+g.key+'"]')?.focus(); };
      hd.append(t);
      if(g.edit){
        const e=el("button","navedit",EDIT_ICON);
        e.setAttribute("aria-label","Choose your practices");e.title="Choose your practices";e.onclick=sheetPractices;
        hd.append(e);
      }
      n.append(hd);
      host=el("div","navlist"+(closed?" closed":""));n.append(host);
    }
    g.items.forEach(it=>{
      const b=el("button","navitem"+(state.view===it.id?" on":""),ICONS[it.id]+'<span class="navtext">'+esc(it.label)+'</span>'+(badge[it.id]?'<span class="navbadge">'+esc(badge[it.id])+'</span>':''));
      b.onclick=()=>go(it.id);
      b.setAttribute("aria-label",it.label);b.title=it.label;
      if(state.view===it.id) b.setAttribute("aria-current","page");
      host.appendChild(b);
    });
  });
  renderTabbar();
}
function sheetPractices(){
  const on=new Set(enabledPractices().map(p=>p.id));
  openSheet(
   '<h3>Your practices</h3><p class="sh-sub">Choose what lives in your menu. Hiding one never deletes its data.</p>'+
   PRACTICES.map(p=>'<label class="reward-option po"><input type="checkbox" value="'+p.id+'"'+(on.has(p.id)?' checked':'')+'><span>'+esc(p.label)+'<small>'+esc(p.sub)+'</small></span></label>').join('')+
   '<div class="sheet-actions"><button class="btn ghost" id="cls">Cancel</button><button class="btn" id="ok">Save</button></div>',
   s=>{
     s.querySelector("#cls").onclick=closeSheet;
     s.querySelector("#ok").onclick=()=>{
       state.profile.practices=[...s.querySelectorAll("input:checked")].map(i=>i.value);
       pushProfile(); closeSheet(); renderAll(); toast("Menu updated.");
     };
   });
}
/* Phone: Today, Goals, Habits and one practice one tap away, the rest behind More. */
function tabbarItems(){
  return [{id:"today",label:"Today"},{id:"goals",label:"Goals"},{id:"habits",label:"Habits"},...enabledPractices().slice(0,1).map(p=>({id:p.id,label:p.label}))];
}
function renderTabbar(){
  let bar=$("#tabbar");
  if(!bar){bar=el("nav","tabbar");bar.id="tabbar";bar.setAttribute("aria-label","Sections");$("#app").append(bar);}
  bar.innerHTML="";
  const TABBAR=tabbarItems();
  TABBAR.forEach(it=>{
    const b=el("button",state.view===it.id?"on":"",ICONS[it.id]+"<span>"+esc(it.label)+"</span>");
    b.onclick=()=>go(it.id);if(state.view===it.id)b.setAttribute("aria-current","page");bar.append(b);
  });
  const more=el("button",TABBAR.some(t=>t.id===state.view)?"":"on",'<svg viewBox="0 0 20 20" fill="currentColor"><circle cx="4.5" cy="10" r="1.5"/><circle cx="10" cy="10" r="1.5"/><circle cx="15.5" cy="10" r="1.5"/></svg><span>More</span>');
  more.setAttribute("aria-label","More sections");more.onclick=()=>setMenu(true);bar.append(more);
}
const navigationHistory=[];
let focusMode=false,menuReturn=null;
function setMenu(open){
  const app=$("#app"),rail=app.querySelector(".rail");
  app.classList.toggle("menu-open",open);
  $("#sectionMenu").setAttribute("aria-expanded",String(open));
  $("#menuShade")?.remove();
  if(open){
    menuReturn=document.activeElement;
    const shade=el("button","menu-shade");shade.id="menuShade";shade.setAttribute("aria-label","Close menu");shade.onclick=()=>setMenu(false);app.prepend(shade);
    $(".stage").inert=true;rail.querySelector("button.navitem")?.focus();
  }else{$(".stage").inert=false;if(menuReturn?.isConnected)menuReturn.focus();menuReturn=null;}
}
function updateNavigation(){
  $("#app").classList.toggle("focused",focusMode);
  $("#sectionControls").hidden=!focusMode;
  $("#sectionName").textContent=navLabel(state.view)||"Upgrade";
}
function go(v,back=false){
  if(!document.getElementById("v-"+v))return;
  $('#winNotice')?.remove();clearTimeout(rewardTimer);
  if(!back)navigationHistory.push({view:state.view,focused:focusMode});
  setMenu(false);focusMode=true;
  state.view=v;
  document.querySelectorAll(".view").forEach(s=>s.classList.remove("on"));
  $("#v-"+v).classList.add("on");
  renderNav(); renderView(v);
  updateNavigation();
  window.scrollTo({top:0,behavior:"instant"});
}
$("#sectionMenu").onclick=()=>setMenu(!$("#app").classList.contains("menu-open"));
$("#sectionBack").onclick=()=>{
  const prev=navigationHistory.pop();
  if(prev){go(prev.view,true);focusMode=prev.focused;}else{focusMode=false;}
  updateNavigation();
  if(focusMode)$("#sectionBack").focus();else $("#nav .navitem.on")?.focus();
};
document.addEventListener("keydown",e=>{
  if(!$("#app").classList.contains("menu-open"))return;
  if(e.key==="Escape"){e.preventDefault();setMenu(false);}
  if(e.key==="Tab"){
    const buttons=[...$(".rail").querySelectorAll("button")].filter(b=>!b.disabled),first=buttons[0],last=buttons.at(-1);
    if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}
    else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
  }
});
/* The menu that sits at the top of every section: what do you want to do here. */
function tabsNode(section,items){
  const bar=el("div","tabs");
  const cur=state.tab[section];
  if(!items.some(i=>i.id===cur)) state.tab[section]=items[0].id;
  items.forEach(it=>{
    const b=el("button","tab"+(state.tab[section]===it.id?" on":""),
      esc(it.label)+(it.n!=null?'<span class="n">'+it.n+'</span>':''));
    b.onclick=()=>{ $('#winNotice')?.remove();clearTimeout(rewardTimer);state.tab[section]=it.id; renderView(section); };
    bar.appendChild(b);
  });
  return bar;
}
/* A view that fails says so. It never goes blank — a blank page hides the cause. */
function renderView(v){
  const fn={today:renderToday,goals:renderGoals,habits:renderHabits,journal:renderJournal,meditate:renderMeditate,read:renderRead,
    move:renderMove,cardio:renderCardio,mind:renderMind,coach:renderCoach,progress:renderProgress}[v]||renderToday;
  try{ fn(); }
  catch(e){
    console.error("[upgrade] view "+v+" failed",e);
    const n=document.getElementById("v-"+v);
    if(n) n.innerHTML='<h2 class="sec">This page hit an error</h2>'+
      '<p class="secsub">Your data is safe — it is saved before anything is drawn. Send this text to Claude:</p>'+
      '<pre style="background:var(--ink-700);border:1px solid var(--line);border-radius:14px;padding:18px;'+
      'overflow-x:auto;font-family:var(--f-mono);font-size:.78rem;color:var(--clay);line-height:1.6">'+
      esc(v+": "+(e&&e.message)+"\n\n"+((e&&e.stack)||""))+'</pre>';
  }
}
function renderAll(){ applyBg(); renderNav(); renderView(state.view); }

/* Backgrounds: the look of the room behind every screen. Stored in the profile so it follows the person. */
const BACKGROUNDS=[
 {id:"ink",label:"Ink",sub:"Flat black"},
 {id:"aurora",label:"Aurora",sub:"Soft glows"},
 {id:"dusk",label:"Dusk",sub:"Night blue"},
 {id:"dots",label:"Dots",sub:"A quiet grid"},
 {id:"horizon",label:"Horizon",sub:"Warm light"}
];
function applyBg(){
  const id=state.profile.background;
  document.body.dataset.bg=BACKGROUNDS.some(b=>b.id===id)?id:"ink";
}
function sheetBackground(){
  const cur=()=>document.body.dataset.bg||"ink";
  openSheet(
   '<h3>Background</h3><p class="sh-sub">Pick the room you want to be in. It changes on every screen.</p>'+
   '<div class="bg-grid">'+BACKGROUNDS.map(b=>'<button class="bg-opt'+(cur()===b.id?' on':'')+'" data-id="'+b.id+'" aria-pressed="'+(cur()===b.id)+'"><span class="bg-sw" data-bg="'+b.id+'"></span><b>'+esc(b.label)+'</b><small>'+esc(b.sub)+'</small></button>').join('')+'</div>'+
   '<div class="sheet-actions"><button class="btn" id="ok">Done</button></div>',
   s=>{
     s.querySelectorAll(".bg-opt").forEach(btn=>btn.onclick=()=>{
       state.profile.background=btn.dataset.id;pushProfile();applyBg();
       s.querySelectorAll(".bg-opt").forEach(x=>{x.classList.toggle("on",x===btn);x.setAttribute("aria-pressed",String(x===btn));});
     });
     s.querySelector("#ok").onclick=closeSheet;
     setTimeout(()=>s.querySelector(".bg-opt.on")?.focus(),0);
   });
}

/* =========================================================================
   HABITS — every habit as a card with its own day-by-day grid
   ========================================================================= */
function daysLabel(h){
  const d=(h.days||[0,1,2,3,4,5,6]).slice().sort();
  if(d.length===7) return "Every day";
  if(d.join()==="1,2,3,4,5") return "Weekdays";
  if(d.join()==="0,6") return "Weekends";
  return [1,2,3,4,5,6,0].filter(x=>d.includes(x)).map(x=>DOWFULL[x]).join(" ");
}
function goalLabel(h){
  if(h.noTarget) return "No target";
  const u=h.unit||"times",t=h.target||1;
  return u==="times"?(t===1?"Once a day":t+" times a day"):t+" "+u;
}
/* Habits can be seen several ways. The choice is a per-device preference. */
const HABIT_VIEWS=[
 {id:"grid",label:"Grid",icon:'<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="4" height="4" rx="1"/><rect x="8" y="3" width="4" height="4" rx="1"/><rect x="13" y="3" width="4" height="4" rx="1"/><rect x="3" y="8" width="4" height="4" rx="1"/><rect x="8" y="8" width="4" height="4" rx="1" fill="currentColor"/><rect x="13" y="8" width="4" height="4" rx="1"/><rect x="3" y="13" width="4" height="4" rx="1"/></svg>'},
 {id:"week",label:"Week",icon:'<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><rect x="3" y="4.5" width="14" height="12" rx="2"/><path d="M3 8.5h14M7 2.8v3M13 2.8v3"/></svg>'},
 {id:"streaks",label:"Streaks",icon:'<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"><path d="M10 2.5c.5 2.6-3.5 4.4-3.5 8.2a3.5 3.5 0 007 0c0-1.5-.7-2.6-1.4-3.4-.1 1.3-.7 2-1.4 2.2.5-2.3.1-5-.7-7z"/></svg>'}
];
let habitsView="grid",habitsWeek=0;
try{ const sv=localStorage.getItem("upgrade.habitsView"); if(HABIT_VIEWS.some(x=>x.id===sv)) habitsView=sv; }catch(e){}
const CHECK_ICON='<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 10.5l3.6 3.6 7.4-8"/></svg>';

/* One tap for today: the big button every habit carries on this page. */
function todayCheck(h){
  const k=todayKey(),done=isDone(h,k);
  const b=el("button","hc-check"+(done?" on":""),CHECK_ICON+"<span>"+(done?"Done today":"Check today")+"</span>");
  b.dataset.check=h.id;b.setAttribute("aria-pressed",String(done));
  b.onclick=()=>{setDone(h,k,!isDone(h,k));renderAll();$('.hc-check[data-check="'+h.id+'"]')?.focus({preventScroll:true});};
  return b;
}
function habitTop(h){
  const top=el("div","hc-top",'<span class="hc-icon">'+(ICONS[habitDestination(h)]||ICONS.today)+'</span><div class="hc-id"><div class="hc-name">'+esc(h.name)+'</div><div class="hc-sub">'+esc(goalLabel(h)+" · "+daysLabel(h))+'</div></div>');
  const ed=el("button","hc-edit",EDIT_ICON);ed.setAttribute("aria-label","Edit "+h.name);ed.title="Edit habit";ed.onclick=()=>sheetEditHabit(h);
  top.append(ed);return top;
}
function daySquare(h,k,today){
  const fut=k>today,sch=scheduled(h,k),done=isDone(h,k),val=valueOf(h,k);
  const b=el("button","hc-sq"+(fut?" fut":done?" done":val>0?" part":!sch?" rest":"")+(k===today?" today":""));
  b.type="button";b.dataset.h=h.id;b.dataset.k=k;
  const what=fut?"":done?"done":val>0?"partly done":!sch?"rest day":"not done";
  b.title=prettyDate(k)+(what?" · "+what:"");
  b.setAttribute("aria-label",h.name+", "+b.title);b.setAttribute("aria-pressed",String(done));
  if(fut) b.disabled=true;
  else b.onclick=()=>{setDone(h,k,!isDone(h,k));renderAll();$('.hc-sq[data-h="'+h.id+'"][data-k="'+k+'"]')?.focus({preventScroll:true});};
  return b;
}
function habitsGridNode(hs){
  const today=todayKey(),WEEKS=26;
  const start=addDays(today,-((parseKey(today).getDay()+6)%7)-(WEEKS-1)*7);
  const list=el("div","habit-list");
  hs.forEach(h=>{
    let sched=0,got=0;
    for(let i=0;i<30;i++){const k=addDays(today,-i);if(scheduled(h,k)){sched++;if(isDone(h,k))got++;}}
    const card=el("div","habit-card"),info=el("div","hc-info");
    info.append(habitTop(h),el("div","hc-stats",'<div><b>'+streak(h)+'</b><span>Streak</span></div><div><b>'+bestStreak(h)+'</b><span>Best</span></div><div><b>'+weekHits(h).done+' of '+weekHits(h).target+'</b><span>This week</span></div><div><b>'+(sched?Math.round(got/sched*100):0)+'%</b><span>30 days</span></div>'),todayCheck(h));
    const map=el("div","hc-map"),months=el("div","hc-months"),grid=el("div","hc-grid");
    for(let w=0;w<WEEKS;w++){
      const mon=addDays(start,w*7),mm=parseKey(mon).getMonth();
      const newMonth=w===0?parseKey(addDays(mon,7)).getMonth()===mm:parseKey(addDays(mon,-7)).getMonth()!==mm;
      months.append(el("span","",newMonth?MONTHS[mm].slice(0,3):""));
      for(let i=0;i<7;i++) grid.append(daySquare(h,addDays(mon,i),today));
    }
    map.append(months,grid);card.append(info,map);list.append(card);
  });
  return list;
}
function habitsStreakNode(hs){
  const today=todayKey(),STEPS=[3,7,14,30,60,100,180,365],grid=el("div","streak-grid");
  hs.forEach(h=>{
    const cur=streak(h),best=bestStreak(h),next=STEPS.find(n=>n>cur)||cur+30;
    const card=el("div","streak-card");
    card.append(habitTop(h),
      el("div","sc-num",'<b>'+cur+'</b><span>'+(cur===1?"day in a row":"days in a row")+'</span>'),
      el("div","sc-bar",'<i style="width:'+Math.round(cur/next*100)+'%"></i>'),
      el("div","sc-note",cur===0?(best?"Start again today · best "+best+" days":"Start today"):(next-cur)+" more for "+next+" · best "+best));
    const dots=el("div","sc-dots");
    for(let i=13;i>=0;i--) dots.append(daySquare(h,addDays(today,-i),today));
    card.append(dots,todayCheck(h));grid.append(card);
  });
  return grid;
}
function habitsWeekNode(hs){
  const today=todayKey(),mon=addDays(today,-((parseKey(today).getDay()+6)%7)+habitsWeek*7);
  const days=Array.from({length:7},(_,i)=>addDays(mon,i));
  const wrap=el("div","wk"),nav=el("div","wk-nav");
  const chev=d=>'<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="'+(d<0?"M10 3.5L5.5 8l4.5 4.5":"M6 3.5L10.5 8 6 12.5")+'"/></svg>';
  const prev=el("button","wk-arrow",chev(-1)),next=el("button","wk-arrow",chev(1));
  prev.setAttribute("aria-label","Previous week");next.setAttribute("aria-label","Next week");next.disabled=habitsWeek>=0;
  prev.onclick=()=>{habitsWeek--;renderHabits();};next.onclick=()=>{habitsWeek++;renderHabits();};
  nav.append(prev,el("span","wk-range",esc(prettyDate(days[0]))+" – "+esc(prettyDate(days[6]))),next);
  if(habitsWeek!==0){const now=el("button","chip","This week");now.onclick=()=>{habitsWeek=0;renderHabits();};nav.append(now);}
  wrap.append(nav);
  const head=el("div","wk-row wk-head");
  head.append(el("div","wk-id"));
  days.forEach(k=>head.append(el("div","wk-dh"+(k===today?" today":""),'<small>'+DOWFULL[parseKey(k).getDay()]+'</small><b>'+parseKey(k).getDate()+'</b>')));
  head.append(el("div"));wrap.append(head);
  hs.forEach(h=>{
    const row=el("div","wk-row");
    row.append(el("div","wk-id",'<span class="hc-icon">'+(ICONS[habitDestination(h)]||ICONS.today)+'</span><div class="hc-id"><div class="hc-name">'+esc(h.name)+'</div><div class="hc-sub">'+esc(goalLabel(h))+'</div></div>'));
    days.forEach(k=>{
      const fut=k>today,sch=scheduled(h,k),done=isDone(h,k);
      const b=el("button","wk-day"+(fut?" fut":done?" done":!sch?" rest":"")+(k===today?" today":""),done?CHECK_ICON:"");
      b.dataset.h=h.id;b.dataset.k=k;
      const what=fut?"":done?"done":!sch?"rest day":"not done";
      b.title=prettyDate(k)+(what?" · "+what:"");b.setAttribute("aria-label",h.name+", "+b.title);b.setAttribute("aria-pressed",String(done));
      if(fut) b.disabled=true;
      else b.onclick=()=>{setDone(h,k,!isDone(h,k));renderAll();$('.wk-day[data-h="'+h.id+'"][data-k="'+k+'"]')?.focus({preventScroll:true});};
      row.append(b);
    });
    row.append(todayCheck(h));wrap.append(row);
  });
  return wrap;
}
function renderHabits(){
  const v=$("#v-habits"),hs=activeHabits(),today=todayKey(),S=dayScore(today);
  sectionHeading(v,'habits','Habits','Every ritual, one place.');
  const bar=el("div","habits-bar");
  bar.append(el("span","hb-sum",(S.total?'<b>'+S.done+' of '+S.total+'</b> done today · ':'')+hs.length+(hs.length===1?" habit":" habits")));
  const tools=el("div","hb-tools"),sw=el("div","viewsw");
  sw.setAttribute("role","group");sw.setAttribute("aria-label","Views");
  sw.append(el("span","vs-label","Views"));
  HABIT_VIEWS.forEach(vw=>{
    const b=el("button","vs-btn"+(habitsView===vw.id?" on":""),vw.icon+"<span>"+vw.label+"</span>");
    b.setAttribute("aria-pressed",String(habitsView===vw.id));
    b.onclick=()=>{habitsView=vw.id;try{localStorage.setItem("upgrade.habitsView",vw.id);}catch(e){}renderHabits();};
    sw.append(b);
  });
  const add=el("button","btn","+ New habit");add.onclick=sheetNewHabit;
  tools.append(sw,add);bar.append(tools);v.append(bar);
  if(!hs.length) v.append(el("div","empty","No habits yet. Start with one small ritual you’d like to keep."));
  else v.append(habitsView==="week"?habitsWeekNode(hs):habitsView==="streaks"?habitsStreakNode(hs):habitsGridNode(hs));
  const arch=state.habits.filter(h=>h.archived);
  if(arch.length){
    const d=el("details","habit-archived");d.append(el("summary","","Archived · "+arch.length));
    arch.forEach(h=>{
      const r=el("div","hc-arch","<span>"+esc(h.name)+"</span>");
      const b=el("button","chip","Restore");b.onclick=()=>{h.archived=false;pushHabit(h);renderAll();toast("“"+h.name+"” is back.");};
      r.append(b);d.append(r);
    });
    v.append(d);
  }
}

/* =========================================================================
   GOALS — areas, this quarter's goals, the focus of the week, the recipe of a
   habit, the daily check-in. (Phase 1 "el porqué", 2026-10-27.)
   Everything here lives in profile/main under `plan`, in each habit, or in the
   day document. No new collections: the 5,000-document ceiling stays far away.
   ========================================================================= */
const AREAS=[
 {id:"body",label:"Body",sub:"Strength, sleep, movement, food"},
 {id:"mind",label:"Mind",sub:"Attention, calm, what you read"},
 {id:"money",label:"Money",sub:"What you keep and what you owe"},
 {id:"relationships",label:"Relationships",sub:"The people you show up for"},
 {id:"work",label:"Work & study",sub:"What you build and learn to earn"},
 {id:"learning",label:"Learning",sub:"Skills and curiosity for their own sake"}
];
const AREA_LABEL=id=>AREAS.find(a=>a.id===id)?.label||"";
const GOAL_IDEAS={
 body:["Train 3 times a week for 12 weeks","Run 5 km without stopping","Asleep before 11pm, 5 nights a week","Bench press 80 kg"],
 mind:["Meditate 5 of 7 days for a quarter","Read 6 books","A journal entry 4 nights a week","Phone out of the bedroom for 30 days"],
 money:["Save an emergency fund of US$1,000","Pay off the credit card","Track every expense for 60 days","Save 20% of income for 3 months"],
 relationships:["One real conversation a week with someone I love","Call my parents every Sunday","Host friends once a month"],
 work:["Ship one project before the quarter ends","Deep work 90 minutes, 4 mornings a week","Finish the semester with nothing late"],
 learning:["Finish an online course","Practise a language 15 minutes a day","Learn 10 songs on the guitar"]
};
const METRIC_SOURCES=[
 {id:"manual",label:"I update it myself"},
 {id:"habit",label:"Days a habit was done"},
 {id:"reading:pages",label:"Pages read"},
 {id:"reading:books",label:"Books finished"},
 {id:"exercise:sessions",label:"Workouts finished"},
 {id:"meditation:minutes",label:"Minutes meditated"},
 {id:"cardio:km",label:"Kilometres of cardio"}
];
const fmt=n=>{n=Number(n)||0;return Number.isInteger(n)?n.toLocaleString("en-US"):n.toFixed(1);};
function quarterEnd(k=todayKey()){const d=parseKey(k),m=Math.floor(d.getMonth()/3)*3+2;return keyOf(new Date(d.getFullYear(),m+1,0));}
function quarterKey(k=todayKey()){const d=parseKey(k);return d.getFullYear()+"-Q"+(Math.floor(d.getMonth()/3)+1);}
/* The plan lives inside the profile document, thawed like everything else. */
function plan(){
  if(!state.profile.plan||typeof state.profile.plan!=="object") state.profile.plan={areas:{},goals:[],focus:null,nextFocus:null,wheel:{}};
  if(Object.isFrozen(state.profile.plan)) state.profile.plan=thaw(state.profile.plan);
  const p=state.profile.plan;
  p.areas=p.areas||{}; p.goals=Array.isArray(p.goals)?p.goals:[]; p.wheel=p.wheel||{};
  if(!("focus" in p)) p.focus=null; if(!("nextFocus" in p)) p.nextFocus=null;
  return p;
}
function activeGoals(){ return plan().goals.filter(g=>g.status!=="done"&&g.status!=="dropped"); }
function goalHabits(g){ return state.habits.filter(h=>!h.archived&&h.goalId===g.id); }
function sumSince(start,fn){ let n=0; const t=todayKey(); for(const k in state.days){ if(k>=start&&k<=t) n+=fn(state.days[k]||{},k)||0; } return n; }
/* A goal's number moves by itself when its source is something you already log. */
function goalValue(g){
  const m=g.metric||{},src=m.source||"manual",start=g.start||(g.createdAt||"").slice(0,10)||todayKey(),from=Number(m.from)||0;
  if(src==="manual") return Number(g.value!=null?g.value:from)||0;
  if(src==="habit"){ const h=state.habits.find(x=>x.id===m.habitId); return h?from+sumSince(start,(d,k)=>isDone(h,k)?1:0):from; }
  if(src==="reading:pages") return from+sumSince(start,d=>(d.reading||[]).reduce((a,s)=>a+(Number(s.pages)||0),0));
  if(src==="reading:books") return from+state.books.filter(b=>b.done&&String(b.finishedAt||b.updatedAt||"")>=start).length;
  if(src==="exercise:sessions") return from+sumSince(start,d=>(d.exercise||[]).filter(x=>x.completed!==false).length);
  if(src==="meditation:minutes") return from+sumSince(start,d=>(d.meditation||[]).reduce((a,s)=>a+(Number(s.minutes)||0),0));
  if(src==="cardio:km") return from+sumSince(start,d=>(d.cardio||[]).reduce((a,s)=>a+(Number(s.distance)||0),0));
  return from;
}
function goalPct(g){ const m=g.metric||{},to=Number(m.to)||0,from=Number(m.from)||0,v=goalValue(g); if(to===from) return v>=to?1:0; return clamp((v-from)/(to-from),0,1); }
/* Weekly maths: "4 of 7" instead of a streak that punishes. */
function habitWeekTarget(h){ const n=Number(h.weeklyTarget); if(n>=1&&n<=7) return n; return (h.days||[0,1,2,3,4,5,6]).length||7; }
function weekHits(h,k=todayKey()){
  const keys=trainingWeek(k),t=todayKey();
  return {done:keys.filter(x=>x<=t&&isDone(h,x)).length,target:habitWeekTarget(h),keys};
}
function lastN(h,n){ let hit=0,sch=0; for(let i=0;i<n;i++){ const k=addDays(todayKey(),-i); if(scheduled(h,k)){sch++; if(isDone(h,k))hit++;} } return {hit,sch}; }
function daysSinceActive(){
  const t=todayKey(),keys=Object.keys(state.days).filter(k=>k<t&&Object.values(state.days[k].entries||{}).some(e=>e.done)).sort();
  if(!keys.length) return null;
  return Math.round((parseKey(t)-parseKey(keys[keys.length-1]))/86400000);
}
/* Focus of the week. A focus chosen on Sunday waits in `nextFocus` until Monday. */
function currentFocus(){
  const P=plan(),mon=trainingWeek()[0];
  if(P.nextFocus&&P.nextFocus.weekStart&&P.nextFocus.weekStart<=mon){ P.focus=P.nextFocus; P.nextFocus=null; pushProfile(); }
  return P.focus||null;
}
function focusHabit(f){ return f?state.habits.find(h=>h.id===f.habitId&&!h.archived)||null:null; }
function focusLabel(f){ const h=focusHabit(f); return h?h.name+" · "+(f.target||5)+" of 7"+(f.ifThen?" · "+f.ifThen:""):""; }
function focusCard(){
  const f=currentFocus(),card=el("div","panel focus-card");
  if(!f||!focusHabit(f)){
    card.innerHTML='<div class="eyebrow">Focus of the week</div><h2>Pick the one thing this week is about.</h2><p>One habit, a number of days, and what you’ll do when it gets hard. Everything else still counts; this is the one you protect.</p>';
    const b=el("button","btn","Set the focus"); b.onclick=()=>sheetFocus(); card.append(b); return card;
  }
  const h=focusHabit(f),W=weekHits(h),target=f.target||W.target,t=todayKey();
  const dots=trainingWeek().map(x=>'<i class="'+(isDone(h,x)?'on':x>t?'fut':'')+'" title="'+esc(prettyDate(x))+'"></i>').join('');
  card.innerHTML='<div class="eyebrow">Focus of the week</div><h2>'+esc(h.name)+' <small>'+target+' of 7 days</small></h2>'+
    '<div class="focus-progress"><div class="focus-dots">'+dots+'</div><span>'+W.done+' of '+target+' so far'+(W.done>=target?' · done for the week':'')+'</span></div>'+
    (f.ifThen?'<p class="focus-ifthen">'+esc(f.ifThen)+'</p>':'')+(h.minimum&&!isDone(h,t)?'<p class="focus-min">Smallest version that counts: '+esc(h.minimum)+'</p>':'');
  const b=el("button","chip","Change"); b.onclick=()=>sheetFocus(); card.append(b); return card;
}
function sheetFocus(o={}){
  const hs=activeHabits(),cur=o.initial||plan().focus||{};
  let habitId=hs.some(h=>h.id===cur.habitId)?cur.habitId:(hs[0]?hs[0].id:null),target=[3,4,5,6,7].includes(Number(cur.target))?Number(cur.target):5;
  openSheet('<h3>'+esc(o.title||"Focus of the week")+'</h3><p class="sh-sub">'+esc(o.sub||"One habit matters most this week. The rest still count, but this is the one you protect.")+'</p>'+
   '<div class="field"><span>The habit</span><div class="chiprow" id="fh"></div></div>'+
   '<div class="field"><span>Days this week</span><div class="chiprow" id="ft"></div></div>'+
   '<label class="field"><span>If it gets hard, then…</span><input type="text" id="fi" maxlength="300" value="'+esc(cur.ifThen||"")+'" placeholder="If it’s 7am and I reach for my phone, then I sit on the edge of the bed and breathe three times."></label>'+
   '<div class="sheet-actions"><button class="btn ghost" id="cls">Cancel</button><button class="btn" id="ok">Save focus</button></div>',
   s=>{
     const fh=s.querySelector("#fh"),ft=s.querySelector("#ft"),fi=s.querySelector("#fi"),chips=[];
     if(!hs.length) fh.append(el("span","empty","Create a habit first."));
     hs.forEach(h=>{ const b=el("button","chip"+(h.id===habitId?" on":""),esc(h.name)); b.onclick=()=>{ habitId=h.id; chips.forEach(([id,x])=>x.classList.toggle("on",id===habitId)); if(h.ifThen&&!fi.value) fi.value=h.ifThen; }; chips.push([h.id,b]); fh.append(b); });
     const tc=[];[3,4,5,6,7].forEach(n=>{ const b=el("button","chip"+(n===target?" on":""),n+" of 7"); b.onclick=()=>{ target=n; tc.forEach(([m,x])=>x.classList.toggle("on",m===target)); }; tc.push([n,b]); ft.append(b); });
     s.querySelector("#cls").onclick=closeSheet;
     s.querySelector("#ok").onclick=()=>{
       if(!habitId){ toast("Pick a habit first."); return; }
       const f={habitId,target,ifThen:fi.value.trim().slice(0,300),weekStart:o.weekStart||trainingWeek()[0],setAt:nowISO()};
       if(o.onSave) o.onSave(f); else { plan().focus=f; pushProfile(); }
       closeSheet(); renderAll(); toast(o.onSave?"Focus chosen.":"Focus set. Today will remind you.");
     };
   });
}
/* Coming back after days away gets a welcome, never a red X. */
function welcomeNode(k){
  if(k!==todayKey()) return null;
  const gap=daysSinceActive();
  if(gap==null||gap<2||dayScore(k).done>0) return null;
  return el("p","welcome-back","You’re back after "+gap+" days. That’s what counts. Start with the smallest version of one habit.");
}
/* Sunday evening (or Monday morning) nudges toward the week review. */
function reviewNudge(){
  const t=todayKey(),dow=parseKey(t).getDay(),thisMon=trainingWeek(t)[0],lastMon=addDays(thisMon,-7);
  const has=s=>!!(state.days[s]&&state.days[s].journal&&state.days[s].journal.weeklyReview);
  let target=null,label="";
  if(dow===0&&!has(thisMon)){ target=thisMon; label="It’s Sunday. Review the week · 10 minutes"; }
  else if((dow===1||dow===2)&&!has(lastMon)&&journeyStats().days>0){ target=lastMon; label="Last week’s review is waiting · 10 minutes"; }
  if(!target) return null;
  const b=el("button","nudge",'<span>'+label+'</span><b>Open ↗</b>');
  b.onclick=()=>{ journalWeek=target; state.tab.journal="weekly"; go("journal"); };
  return b;
}
/* Check-in: energy and sleep in the morning, mood and one prompt at night. */
const ENERGY=["Flat","Low","Okay","Good","Full"];
const EVENING_ONE=[
 {k:"gratitude",q:"Three things worth having noticed today."},
 {k:"best",q:"Picture a week from now going as well as it could. What did you do?"},
 {k:"free",q:"What happened today that mattered, even a little?"},
 {k:"gratitude",q:"Who or what made today easier?"},
 {k:"free",q:"What did you avoid today, and what did it cost?"},
 {k:"learn",q:"What did today teach you about how you work?"},
 {k:"free",q:"What would you keep from this week, and what would you drop?"}
];
function ensureJournal(dd){ dd.journal=dd.journal||{mood:null,morning:"",evening:"",gratitude:["","",""],reflections:[]}; return dd.journal; }
function checkinNode(k){
  const isToday=k===todayKey(),eve=new Date().getHours()>=17,card=el("div","panel checkin");
  const d=dayRO(k)||{},c=d.checkin||{},J=d.journal||{};
  if(!isToday){
    const bits=[]; if(c.energy) bits.push("energy "+ENERGY[c.energy-1].toLowerCase()); if(c.sleep!=null&&c.sleep!=="") bits.push(c.sleep+" h of sleep"); if(J.mood) bits.push("mood "+String((MOODS.find(m=>m.v===J.mood)||{}).w||"").toLowerCase());
    card.innerHTML='<div class="label">That day’s check-in</div><p class="secsub" style="margin:0">'+(bits.length?esc(bits.join(" · ")):"No check-in that day.")+'</p>'; return card;
  }
  if(!eve){
    card.append(el("div","label","Morning check-in · 10 seconds"));
    const row=el("div","chiprow energy");
    ENERGY.forEach((w,i)=>{ const v=i+1,b=el("button","chip"+(c.energy===v?" on":""),w); b.setAttribute("aria-pressed",String(c.energy===v));
      b.onclick=()=>{ const dd=day(k); dd.checkin=Object.assign({},dd.checkin,{energy:dd.checkin&&dd.checkin.energy===v?null:v,at:nowISO()}); pushDay(k); renderToday(); }; row.append(b); });
    card.append(el("div","sub-label","Energy"),row);
    const sl=el("div","sleep",'<span>Slept</span><input type="number" min="0" max="16" step="0.5" value="'+(c.sleep!=null?esc(c.sleep):"")+'" aria-label="Hours of sleep" placeholder="7"><span>hours</span>');
    const inp=sl.querySelector("input");
    inp.onchange=()=>{ const dd=day(k); dd.checkin=Object.assign({},dd.checkin,{sleep:inp.value===""?null:clamp(Number(inp.value)||0,0,16),at:nowISO()}); pushDay(k); };
    card.append(sl); return card;
  }
  card.append(el("div","label","Evening check-in · 2 minutes"));
  const row=el("div","chiprow");
  MOODS.forEach(m=>{ const b=el("button","chip"+(J.mood===m.v?" on":""),esc(m.w)); b.setAttribute("aria-pressed",String(J.mood===m.v));
    b.onclick=()=>{ const dd=day(k),j=ensureJournal(dd); j.mood=j.mood===m.v?null:m.v; pushDay(k); renderToday(); }; row.append(b); });
  card.append(el("div","sub-label","Mood"),row);
  const pr=EVENING_ONE[parseKey(k).getDay()];
  card.append(el("p","prompt",esc(J.prompt||pr.q)));
  const ta=el("textarea",""); ta.value=J.evening||""; ta.placeholder="One honest paragraph. Nobody is grading this."; ta.setAttribute("aria-label","Evening note");
  ta.oninput=()=>{ const dd=day(k),j=ensureJournal(dd); j.evening=ta.value; j.prompt=J.prompt||pr.q; saveLocal(); };
  ta.onblur=()=>{ if(ta.value.trim()) pushDay(k); };
  card.append(ta);
  const bar=el("div","savebar"),save=el("button","btn","Save the day");
  save.onclick=()=>{ const dd=day(k); if(!hasEntry(dd.journal)){ toast("Pick a mood or write a line first."); return; } pushDay(k);
    const h=state.habits.find(x=>!x.archived&&(x.section==="journal"||/journal|diar/i.test(x.name))); if(h&&!isDone(h,k)) setDone(h,k,true,1);
    toast("Saved. The day is in your journal."); renderToday(); };
  bar.append(save); card.append(bar); return card;
}
/* The recipe of a habit: area, goal, weekly target, smallest version, anchor, if-then. */
function recipeHTML(h){
  h=h||{};
  const goals=activeGoals(),open=!!(h.minimum||h.anchor||h.ifThen||h.goalId||h.areaId);
  return '<details class="recipe"'+(open?' open':'')+'><summary>Recipe · area, goal, smallest version, anchor</summary>'+
   '<div class="field"><span>Area</span><div class="chiprow" id="ar"></div></div>'+
   '<label class="field"><span>Serves the goal</span><select id="gl"><option value="">None</option>'+goals.map(g=>'<option value="'+esc(g.id)+'"'+(g.id===h.goalId?' selected':'')+'>'+esc(g.title)+'</option>').join('')+'</select></label>'+
   '<div class="field"><span>Days a week that count as a win</span><div class="chiprow" id="wt"></div></div>'+
   '<label class="field"><span>Smallest version that still counts</span><input type="text" id="mn" maxlength="200" value="'+esc(h.minimum||'')+'" placeholder="3 minutes sitting on the bed"></label>'+
   '<label class="field"><span>After I…</span><input type="text" id="an" maxlength="200" value="'+esc(h.anchor||'')+'" placeholder="turn off the alarm"></label>'+
   '<label class="field"><span>If it gets hard, then…</span><input type="text" id="it" maxlength="300" value="'+esc(h.ifThen||'')+'" placeholder="I do the smallest version and stop"></label>'+
   '</details>';
}
function recipeSetup(s,h,getDays){
  h=h||{}; let areaId=h.areaId||"",wt=[3,4,5,6,7].includes(Number(h.weeklyTarget))?Number(h.weeklyTarget):0;
  const ar=s.querySelector("#ar"),wtn=s.querySelector("#wt"),chips=[];
  AREAS.forEach(a=>{ const b=el("button","chip"+(a.id===areaId?" on":""),esc(a.label)); b.onclick=()=>{ areaId=areaId===a.id?"":a.id; chips.forEach(([id,x])=>x.classList.toggle("on",id===areaId)); }; chips.push([a.id,b]); ar.append(b); });
  const draw=()=>{ wtn.innerHTML=""; const def=Math.min(7,Math.max(1,(getDays?getDays():(h.days||[0,1,2,3,4,5,6])).length||7));
    [3,4,5,6,7].forEach(n=>{ const on=(wt||def)===n,b=el("button","chip"+(on?" on":""),n+" of 7"); b.onclick=()=>{ wt=n; draw(); }; wtn.append(b); }); };
  draw();
  return {refresh:draw,read:()=>({areaId:areaId||null,goalId:s.querySelector("#gl").value||null,weeklyTarget:wt||null,
    minimum:s.querySelector("#mn").value.trim().slice(0,200),anchor:s.querySelector("#an").value.trim().slice(0,200),ifThen:s.querySelector("#it").value.trim().slice(0,300)})};
}
/* ---------- the Goals section ---------- */
function renderGoals(){
  const v=$("#v-goals");
  sectionHeading(v,'goals','Goals','What this quarter is for.');
  v.appendChild(tabsNode("goals",[
    {id:"quarter",label:"This quarter",n:activeGoals().length},
    {id:"focus",label:"Week focus"},
    {id:"areas",label:"Areas"}
  ]));
  ({quarter:gQuarter,focus:gFocus,areas:gAreas}[state.tab.goals]||gQuarter)(v);
}
function gQuarter(v){
  const gs=activeGoals(),head=el("div","habits-bar");
  head.append(el("span","hb-sum",gs.length?'<b>'+gs.length+' of 3</b> goals this quarter · ends '+esc(prettyDate(quarterEnd())):'No goal yet · the quarter ends '+esc(prettyDate(quarterEnd()))));
  const add=el("button","btn","+ New goal"); add.onclick=()=>sheetGoal(); if(gs.length>=3){ add.disabled=true; add.title="Three is the limit. Finish or drop one first."; }
  head.append(add); v.append(head);
  if(!gs.length){
    const e=el("div","panel");
    e.innerHTML='<div class="label">Why a goal, and not just habits</div><p class="secsub" style="margin:0 0 16px">A habit is what you do. A goal is why. Upgrade uses it to pick the focus of the week, to move a number by itself when you log, and to keep what matters to you in front of you. One is enough. Three is the limit.</p>';
    const b=el("button","btn","Set your first goal"); b.onclick=()=>sheetGoal(); e.append(b); v.append(e);
  }else{ const list=el("div","goal-list"); gs.forEach(g=>list.append(goalCard(g))); v.append(list); }
  const past=plan().goals.filter(g=>g.status==="done"||g.status==="dropped");
  if(past.length){
    const d=el("details","habit-archived"); d.append(el("summary","","Finished or dropped · "+past.length));
    past.forEach(g=>{ const r=el("div","hc-arch","<span>"+esc(g.title)+" · "+(g.status==="done"?"done"+(g.score!=null?" · "+Math.round(g.score*100)+"%":""):"dropped")+"</span>");
      const b=el("button","chip","Reopen"); b.onclick=()=>{ g.status="active"; g.updatedAt=nowISO(); pushProfile(); renderAll(); }; r.append(b); d.append(r); });
    v.append(d);
  }
}
function goalCard(g){
  const pct=goalPct(g),val=goalValue(g),m=g.metric||{},hs=goalHabits(g),card=el("article","goal-card");
  const src=m.source==="habit"?"days of "+((state.habits.find(h=>h.id===m.habitId)||{}).name||"a habit"):(m.source&&m.source!=="manual")?((METRIC_SOURCES.find(s=>s.id===m.source)||{}).label||""):"";
  card.innerHTML='<div class="gc-top"><span class="chip">'+esc(AREA_LABEL(g.areaId)||"Goal")+'</span>'+(g.due?'<span class="gc-due">by '+esc(prettyDate(g.due))+'</span>':'')+'</div>'+
   '<h3>'+esc(g.title)+'</h3>'+(g.why?'<p class="gc-why">'+esc(g.why)+'</p>':'')+
   '<div class="gc-bar"><i style="width:'+Math.round(pct*100)+'%"></i></div>'+
   '<div class="gc-metric"><b>'+fmt(val)+'</b> of '+fmt(m.to)+' '+esc(m.unit||"")+' <span>· '+Math.round(pct*100)+'%'+(src?' · '+esc(src.toLowerCase()):' · updated by hand')+'</span></div>'+
   (g.ifThen?'<p class="gc-plan"><b>If</b> '+esc(g.obstacle||"it gets hard")+', <b>then</b> '+esc(g.ifThen)+'</p>':'')+
   (hs.length?'<div class="gc-habits">'+hs.map(h=>{const W=weekHits(h);return '<span class="chip">'+esc(h.name)+' · '+W.done+' of '+W.target+'</span>';}).join('')+'</div>':'<p class="gc-nohabit">No habit serves this goal yet. Edit the goal to link one.</p>');
  const ms=g.milestones||[];
  if(ms.length){
    const box=el("div","gc-miles");
    ms.forEach(x=>{ const l=el("label",x.done?"done":"",'<input type="checkbox"'+(x.done?' checked':'')+'><span>'+esc(x.title)+(x.due?' · '+esc(prettyDate(x.due)):'')+'</span>');
      l.querySelector("input").onchange=e=>{ x.done=e.target.checked; x.doneAt=x.done?nowISO():null; pushProfile(); renderGoals(); }; box.append(l); });
    card.append(box);
  }
  const act=el("div","gc-actions");
  if(!m.source||m.source==="manual"){ const u=el("button","chip","Update the number"); u.onclick=()=>sheetGoalNumber(g); act.append(u); }
  const mi=el("button","chip","+ Milestone"); mi.onclick=()=>sheetMilestone(g); act.append(mi);
  const ed=el("button","chip","Edit"); ed.onclick=()=>sheetGoal(g); act.append(ed);
  const dn=el("button","chip","Mark done"); dn.onclick=()=>sheetGoalDone(g); act.append(dn);
  card.append(act); return card;
}
function sheetGoal(g){
  const isNew=!g; g=g||{}; const m=g.metric||{}; let areaId=AREAS.some(a=>a.id===g.areaId)?g.areaId:AREAS[0].id;
  openSheet(
   '<h3>'+(isNew?'A goal for this quarter':'Edit goal')+'</h3><p class="sh-sub">Wish, outcome, obstacle, plan. Four honest answers beat a long list.</p>'+
   '<div class="field"><span>Area</span><div class="chiprow" id="ga"></div></div>'+
   '<label class="field"><span>What do you want?</span><input type="text" id="gt" maxlength="140" value="'+esc(g.title||'')+'" placeholder="Meditate 5 of 7 days for a quarter"></label>'+
   '<div class="field"><span>Or start from one of these</span><div class="chiprow" id="gideas"></div></div>'+
   '<label class="field"><span>Why does it matter to you?</span><input type="text" id="gw" maxlength="200" value="'+esc(g.why||'')+'" placeholder="Because the morning sets the tone of everything else"></label>'+
   '<div class="field"><span>How will you know you got there?</span><div class="metric-grid">'+
     '<label class="field"><span>From</span><input type="number" id="gf" step="any" value="'+esc(m.from!=null?m.from:0)+'"></label>'+
     '<label class="field"><span>To</span><input type="number" id="go" step="any" value="'+esc(m.to!=null?m.to:'')+'" placeholder="60"></label>'+
     '<label class="field"><span>Unit</span><input type="text" id="gu" maxlength="20" value="'+esc(m.unit||'')+'" placeholder="days"></label>'+
   '</div></div>'+
   '<label class="field"><span>The number moves by itself when the source is…</span><select id="gs">'+METRIC_SOURCES.map(x=>'<option value="'+x.id+'"'+(x.id===(m.source||'manual')?' selected':'')+'>'+esc(x.label)+'</option>').join('')+'</select></label>'+
   '<label class="field" id="ghab-wrap"><span>Which habit</span><select id="gh">'+activeHabits().map(h=>'<option value="'+esc(h.id)+'"'+(h.id===m.habitId?' selected':'')+'>'+esc(h.name)+'</option>').join('')+'</select></label>'+
   '<label class="field"><span>By when</span><input type="date" id="gd" value="'+esc(g.due||quarterEnd())+'"></label>'+
   '<label class="field"><span>What gets in the way? The inner obstacle.</span><input type="text" id="gob" maxlength="200" value="'+esc(g.obstacle||'')+'" placeholder="At 7am I reach for my phone"></label>'+
   '<label class="field"><span>If that happens, then…</span><input type="text" id="gif" maxlength="300" value="'+esc(g.ifThen||'')+'" placeholder="I leave the phone in the kitchen and sit for 3 minutes"></label>'+
   '<div class="field"><span>Habits that serve it</span><div id="ghs" class="gc-pick"></div></div>'+
   '<div class="sheet-actions">'+(isNew?'':'<button class="btn ghost" id="drop" style="margin-right:auto">Drop goal</button>')+'<button class="btn ghost" id="cls">Cancel</button><button class="btn" id="ok">'+(isNew?'Create goal':'Save')+'</button></div>',
   s=>{
     const ga=s.querySelector("#ga"),ideas=s.querySelector("#gideas"),chips=[];
     const drawIdeas=()=>{ ideas.innerHTML=""; (GOAL_IDEAS[areaId]||[]).forEach(t=>{ const b=el("button","chip",esc(t)); b.onclick=()=>{ s.querySelector("#gt").value=t; }; ideas.append(b); }); };
     AREAS.forEach(a=>{ const b=el("button","chip"+(a.id===areaId?" on":""),esc(a.label)); b.onclick=()=>{ areaId=a.id; chips.forEach(([id,x])=>x.classList.toggle("on",id===areaId)); drawIdeas(); }; chips.push([a.id,b]); ga.append(b); });
     drawIdeas();
     const gs=s.querySelector("#gs"),ghw=s.querySelector("#ghab-wrap"),gu=s.querySelector("#gu");
     const syncSrc=()=>{ ghw.style.display=gs.value==="habit"?"":"none"; const unit={"habit":"days","reading:pages":"pages","reading:books":"books","exercise:sessions":"workouts","meditation:minutes":"minutes","cardio:km":"km"}[gs.value]; if(unit&&!gu.value) gu.value=unit; };
     gs.onchange=syncSrc; syncSrc();
     const ghs=s.querySelector("#ghs");
     if(!activeHabits().length) ghs.append(el("span","gc-nohabit","No habits yet. You can link one later from the habit itself."));
     activeHabits().forEach(h=>{ const on=!!g.id&&h.goalId===g.id; ghs.append(el("label","reward-option po",'<input type="checkbox" value="'+esc(h.id)+'"'+(on?' checked':'')+'><span>'+esc(h.name)+'<small>'+esc(goalLabel(h)+' · '+daysLabel(h))+'</small></span>')); });
     s.querySelector("#cls").onclick=closeSheet;
     if(!isNew) s.querySelector("#drop").onclick=()=>{ g.status="dropped"; g.updatedAt=nowISO(); pushProfile(); closeSheet(); renderAll(); toast("Dropped. It stays in your history."); };
     s.querySelector("#ok").onclick=()=>{
       const title=s.querySelector("#gt").value.trim(); if(!title){ toast("Say what you want first."); return; }
       const to=Number(s.querySelector("#go").value); if(s.querySelector("#go").value===""||!Number.isFinite(to)){ toast("Give it a number to reach."); return; }
       if(isNew&&activeGoals().length>=3){ toast("Three goals is the limit. Finish or drop one first."); return; }
       const P=plan();
       if(isNew){ g={id:uid(),createdAt:nowISO(),start:todayKey(),status:"active",milestones:[]}; P.goals.push(g); }
       Object.assign(g,{areaId,title:title.slice(0,140),why:s.querySelector("#gw").value.trim().slice(0,200),
         metric:{from:Number(s.querySelector("#gf").value)||0,to,unit:gu.value.trim().slice(0,20),source:gs.value,habitId:gs.value==="habit"?(s.querySelector("#gh").value||null):null},
         due:s.querySelector("#gd").value||null,obstacle:s.querySelector("#gob").value.trim().slice(0,200),ifThen:s.querySelector("#gif").value.trim().slice(0,300),updatedAt:nowISO()});
       if(g.metric.source==="manual"&&g.value==null) g.value=g.metric.from;
       const picked=new Set([...ghs.querySelectorAll("input:checked")].map(i=>i.value));
       state.habits.forEach(h=>{ const want=picked.has(h.id); if(want&&h.goalId!==g.id){ h.goalId=g.id; pushHabit(h); } else if(!want&&h.goalId===g.id){ h.goalId=null; pushHabit(h); } });
       pushProfile(); closeSheet(); renderAll(); toast(isNew?"Goal set. Now give it a habit and a focus.":"Saved.");
     };
   });
}
function sheetGoalNumber(g){
  openSheet('<h3>'+esc(g.title)+'</h3><p class="sh-sub">Where is the number today?</p>'+
   '<label class="field"><span>'+esc((g.metric||{}).unit||"Value")+'</span><input type="number" id="gv" step="any" value="'+esc(goalValue(g))+'"></label>'+
   '<div class="sheet-actions"><button class="btn ghost" id="cls">Cancel</button><button class="btn" id="ok">Save</button></div>',
   s=>{ s.querySelector("#cls").onclick=closeSheet; s.querySelector("#ok").onclick=()=>{ const n=Number(s.querySelector("#gv").value); if(!Number.isFinite(n)){ toast("Enter a number."); return; } g.value=n; g.updatedAt=nowISO(); pushProfile(); closeSheet(); renderAll(); }; });
}
function sheetMilestone(g){
  openSheet('<h3>A milestone</h3><p class="sh-sub">A step on the way, with a date if it has one.</p>'+
   '<label class="field"><span>What</span><input type="text" id="mt" maxlength="120" placeholder="First 5 km, even slowly"></label>'+
   '<label class="field"><span>By when</span><input type="date" id="md"></label>'+
   '<div class="sheet-actions"><button class="btn ghost" id="cls">Cancel</button><button class="btn" id="ok">Add</button></div>',
   s=>{ s.querySelector("#cls").onclick=closeSheet; s.querySelector("#ok").onclick=()=>{ const t=s.querySelector("#mt").value.trim(); if(!t){ toast("Say what the step is."); return; } g.milestones=Array.isArray(g.milestones)?g.milestones:[]; g.milestones.push({id:uid(),title:t.slice(0,120),due:s.querySelector("#md").value||null,done:false}); g.updatedAt=nowISO(); pushProfile(); closeSheet(); renderGoals(); }; });
}
function sheetGoalDone(g){
  let score=1;
  openSheet('<h3>How did it go?</h3><p class="sh-sub">Score it honestly. A quarter that averages 0.6 to 0.7 means the goals were the right size.</p>'+
   '<div class="field"><span>Score</span><div class="chiprow" id="sc"></div></div>'+
   '<label class="field"><span>What you learned, in a line</span><input type="text" id="ln" maxlength="300" placeholder="The habit mattered more than the number"></label>'+
   '<div class="sheet-actions"><button class="btn ghost" id="cls">Cancel</button><button class="btn" id="ok">Close the goal</button></div>',
   s=>{ const sc=s.querySelector("#sc"),chips=[];
     [[0.25,"Barely"],[0.5,"Halfway"],[0.75,"Mostly"],[1,"Got there"]].forEach(([n,l])=>{ const b=el("button","chip"+(n===score?" on":""),l); b.onclick=()=>{ score=n; chips.forEach(([m,x])=>x.classList.toggle("on",m===score)); }; chips.push([n,b]); sc.append(b); });
     s.querySelector("#cls").onclick=closeSheet;
     s.querySelector("#ok").onclick=()=>{ g.status="done"; g.score=score; g.lesson=s.querySelector("#ln").value.trim().slice(0,300); g.doneAt=nowISO(); g.updatedAt=nowISO(); pushProfile(); closeSheet(); renderAll(); toast("Closed. It stays in your history."); }; });
}
function gFocus(v){
  v.append(el("p","secsub","The focus is one habit you protect this week, with a number of days and a plan for when it gets hard. Today shows it every morning. The Sunday review sets the next one."));
  v.append(focusCard());
  const nf=plan().nextFocus;
  if(nf){ const h=focusHabit(nf); v.append(el("p","secsub","Queued for the week of "+esc(prettyDate(nf.weekStart))+": "+esc(h?h.name:"a habit")+", "+(nf.target||5)+" of 7 days.")); }
}
function gAreas(v){
  v.append(el("p","secsub","Score each area from 1 to 10 as it feels today, and write what “good” looks like for you. Honest beats pretty. Progress will draw the wheel from these, quarter against quarter."));
  const grid=el("div","area-grid"),P=plan();
  AREAS.forEach(a=>{
    const cur=P.areas[a.id]||{};
    const t=el("div","area-tile",'<h3>'+esc(a.label)+'</h3><p class="sub">'+esc(a.sub)+'</p><div class="area-score"><input type="range" min="1" max="10" step="1" value="'+(cur.score||5)+'" aria-label="'+esc(a.label)+' score"><b>'+(cur.score||"–")+'</b></div><input type="text" maxlength="140" placeholder="What good looks like here" value="'+esc(cur.standard||"")+'" aria-label="'+esc(a.label)+' standard">');
    const r=t.querySelector("input[type=range]"),b=t.querySelector("b"),s=t.querySelector("input[type=text]");
    r.oninput=()=>{ b.textContent=r.value; };
    r.onchange=()=>{ const n=Number(r.value); P.areas[a.id]=Object.assign({},P.areas[a.id],{score:n,ratedAt:nowISO()}); const q=quarterKey(); P.wheel[q]=Object.assign({},P.wheel[q],{[a.id]:n}); pushProfile(); };
    s.onchange=()=>{ P.areas[a.id]=Object.assign({},P.areas[a.id],{standard:s.value.trim().slice(0,140)}); pushProfile(); };
    grid.append(t);
  });
  v.append(grid);
}

function sectionHeading(v,id,title,subtitle){
  const meta={goals:['What this quarter is for','brass'],habits:['Every ritual, one place','brass'],journal:['A little self-understanding','lilac'],meditate:['Space to simply be','dusk'],read:['A world between pages','sage'],move:['Strength, one session at a time','clay'],cardio:['Find your pace','dusk'],mind:['Become who you practise being','lilac'],coach:['One idea a day','brass'],progress:['The bigger picture','sage']}[id];
  v.style.setProperty('--section-accent','var(--'+meta[1]+')');
  const motif=id==='meditate'?'<circle cx="105" cy="70" r="44"/><circle cx="105" cy="70" r="32"/><circle cx="105" cy="70" r="20"/>':id==='read'?'<path d="M50 38q30-8 55 8v66q-25-16-55-8Zm55 8q25-16 55-8v66q-30-8-55 8M62 53l28 5m-28 11 28 5m-28 11 28 5m28-33 28-5m-28 21 28-5m-28 21 28-5"/>':id==='journal'?'<path d="M64 27h72v90H64Zm14 22h36M78 63h24m-24 14h32m-32 14h18m43-25 20-29 7 5-20 29-10 7Z"/>':id==='move'?'<path d="M44 61v28m12-40v51m12-27h71m0-24v51m12-39v28"/>':id==='cardio'?'<path d="M35 75h34l13-31 23 65 18-44 10 10h39"/>':id==='mind'?'<path d="M86 113v-16Q57 92 60 62a39 39 0 0 1 76-4l15 22h-16v19h-17v14"/><circle cx="97" cy="61" r="16"/>':'<path d="M48 107V79m27 28V65m27 42V48m27 59V35m27 72V23M39 113h129"/>';
  v.innerHTML='<header class="section-hero"><div><div class="eyebrow">'+meta[0]+'</div><h2 class="sec">'+esc(title)+'</h2><p class="secsub">'+esc(subtitle)+'</p></div><svg viewBox="0 0 200 140" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><circle cx="102" cy="70" r="62" stroke-opacity=".12"/>'+motif+'</svg></header>';
}

/* =========================================================================
   TODAY
   ========================================================================= */
function greeting(){
  const h=new Date().getHours(), n=esc(state.profile.name||"friend");
  const S=dayScore(todayKey());
  const isToday = state.selDate===todayKey();
  if(!isToday) return "A look back at <em>"+esc(prettyDate(state.selDate))+"</em>";
  if(S.total && S.pct>=1) return "That's the whole list, <em>"+n+"</em>.";
  const morn=["Morning, <em>"+n+"</em>.","The day is still quiet, <em>"+n+"</em>.","Early, and yours, <em>"+n+"</em>."];
  const mid =["Good afternoon, <em>"+n+"</em>.","Still plenty of day, <em>"+n+"</em>.","Halfway, <em>"+n+"</em>."];
  const eve =["Evening, <em>"+n+"</em>.","Let's close the day well, <em>"+n+"</em>.","Late, but not too late, <em>"+n+"</em>."];
  const pool = h<12?morn : h<18?mid : eve;
  const idx = (parseKey(todayKey()).getDate()+h) % pool.length;
  return pool[idx];
}
function homeArtwork(style,pct){
  const p=clamp(pct,0,1),sunY=132-p*50;
  const common='<svg viewBox="0 0 400 280" fill="none" aria-hidden="true"><defs><linearGradient id="horizonFade" x1="0" y1="0" x2="1" y2="1"><stop stop-color="var(--sage)" stop-opacity=".6"/><stop offset="1" stop-color="var(--ink-800)"/></linearGradient></defs>';
  if(style==='garden')return common+'<circle cx="225" cy="125" r="93" stroke="var(--sage)" stroke-opacity=".16"/><circle cx="225" cy="125" r="112" stroke="var(--sage)" stroke-opacity=".07"/><path d="M220 240Q240 154 210 54" stroke="var(--sage)" stroke-width="2"/>'+Array.from({length:6},(_,i)=>{const y=218-i*27,x=224+(i%2?0:5),side=i%2?-1:1;return '<path d="M'+x+' '+y+'q'+(side*66)+' -8 '+(side*63)+' -58q'+(-side*61)+' 3 '+(-side*63)+' 58" fill="var(--sage)" opacity="'+(.18+(i/6)*.3+p*.3)+'"/>';}).join('')+'<circle cx="211" cy="48" r="'+(8+p*12)+'" fill="var(--brass)"/><path d="M110 243h205" stroke="var(--sage)" stroke-opacity=".4"/></svg>';
  if(style==='orbit')return common+'<g transform="translate(220 135)"><circle r="104" stroke="var(--brass)" stroke-opacity=".1"/><circle r="82" stroke="var(--brass)" stroke-opacity=".2"/><circle r="58" stroke="var(--brass)" stroke-opacity=".3"/><circle r="82" stroke="var(--brass)" stroke-width="3" stroke-linecap="round" stroke-dasharray="'+(515*p)+' 515" transform="rotate(-90)"/><ellipse rx="132" ry="44" stroke="var(--dusk)" stroke-opacity=".5" transform="rotate(-35)"/><circle r="24" fill="var(--brass)" fill-opacity=".85"/><circle cx="'+(82*Math.sin(p*Math.PI*2))+'" cy="'+(-82*Math.cos(p*Math.PI*2))+'" r="7" fill="var(--ivory)"/><circle cx="-108" cy="75" r="4" fill="var(--dusk)"/></g></svg>';
  return common+'<circle cx="220" cy="'+sunY+'" r="68" stroke="var(--brass)" stroke-opacity=".08"/><circle cx="220" cy="'+sunY+'" r="53" stroke="var(--brass)" stroke-opacity=".14"/><circle cx="220" cy="'+sunY+'" r="37" class="sun"/><path d="M0 232Q115 98 255 182T430 160V290H0Z" fill="url(#horizonFade)"/><path d="M-20 260Q125 170 230 220T430 190V290H0Z" fill="var(--ink-600)"/><path d="M-20 284Q155 213 420 249V290H0Z" fill="var(--ink-800)"/><path d="M150 267Q190 243 240 230T278 204" stroke="var(--brass)" stroke-opacity=".5" stroke-width="1.3"/><path d="M287 58h10m-5-5v10M118 91h6m-3-3v6" stroke="var(--ivory)" stroke-opacity=".55"/></svg>';
}
function homePreferences(){
  openSheet('<h3>Make this space yours.</h3><p class="sh-sub">One warm world. Choose the view that feels like you.</p><div class="label">Today artwork</div><div class="home-art-options">'+['horizon','garden','orbit'].map(id=>'<button class="chip'+((state.profile.homeArt||'horizon')===id?' on':'')+'" data-home-art="'+id+'" aria-pressed="'+((state.profile.homeArt||'horizon')===id)+'">'+id[0].toUpperCase()+id.slice(1)+'</button>').join('')+'</div><div id="rewardPreferences"></div><div class="sheet-actions"><button class="btn" id="homePrefsDone">Done</button></div>',s=>{
    s.querySelectorAll('[data-home-art]').forEach(b=>b.onclick=()=>{state.profile.homeArt=b.dataset.homeArt;pushProfile();renderToday();homePreferences();});
    s.querySelector('#homePrefsDone').onclick=closeSheet;
    if(typeof rewardPreferences==='function')rewardPreferences(s.querySelector('#rewardPreferences'));
  });
}
function habitDestination(h){return h.section||(h.name.toLowerCase()==='journal'?'journal':null);}
function openRitual(h,k){
  const section=habitDestination(h);
  if(section&&k===todayKey()){go(section);return;}
  // Past-day edits must not unexpectedly open a form that writes to today.
  if(section){openSheet('<h3>'+esc(h.name)+'</h3><p class="sh-sub">'+esc(prettyDate(k))+'. Change this day’s check-off or edit the habit.</p><div class="sheet-actions"><button class="btn ghost" id="ritualEdit">Edit habit</button><button class="btn" id="ritualToggle">'+(isDone(h,k)?'Uncheck':'Mark complete')+'</button></div>',s=>{s.querySelector('#ritualEdit').onclick=()=>sheetEditHabit(h);s.querySelector('#ritualToggle').onclick=()=>{setDone(h,k,!isDone(h,k));closeSheet();renderToday();};});return;}
  openHabit(h,k);
}
function renderToday(){
  const v=$('#v-today'),k=state.selDate,today=todayKey(),isToday=k===today,S=dayScore(k),hs=activeHabits();
  v.innerHTML='';
  const mast=el('div','today-mast','<div><div class="eyebrow">'+esc(prettyDate(k))+'</div><h1>'+(isToday?'Today':'Looking back')+'</h1></div>');
  const tools=el('div','today-tools'),rc=131.95;
  tools.append(el('div','day-ring','<svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="21" fill="none" stroke="var(--line)" stroke-width="2.5"/><circle cx="24" cy="24" r="21" fill="none" stroke="var(--brass)" stroke-width="2.5" stroke-linecap="round" stroke-dasharray="'+(rc*S.pct)+' '+rc+'"/></svg><b>'+Math.round(S.pct*100)+'%</b>'));
  const prefs=el('button','today-settings','<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="10" cy="10" r="2.6"/><path d="M10 2.5v2M10 15.5v2M2.5 10h2M15.5 10h2M4.7 4.7l1.4 1.4M13.9 13.9l1.4 1.4M4.7 15.3l1.4-1.4M13.9 6.1l1.4-1.4" stroke-linecap="round"/></svg>');
  prefs.setAttribute('aria-label','Preferences');prefs.title='Preferences';prefs.onclick=homePreferences;tools.append(prefs);mast.append(tools);v.append(mast);
  const wb=welcomeNode(k);if(wb)v.append(wb);if(isToday){const nd=reviewNudge();if(nd)v.append(nd);v.append(focusCard());}
  const remaining=hs.filter(h=>scheduled(h,k)&&!isDone(h,k)),allDone=S.total>0&&S.done===S.total;
  const hero=el('div','day-hero');
  const name=esc((state.profile.name||'friend').split(' ')[0]);
  const hour=new Date().getHours(),salute=hour<12?'Good morning':hour<18?'Good afternoon':'Good evening';
  const title=!isToday?'A day worth<br><em>remembering.</em>':allDone?'Look at you.<br><em>You showed up.</em>':'Small rituals.<br><em>A fuller life.</em>';
  const subtitle=!isToday?'Your history is yours to revisit and correct.':allDone?'Every ritual you planned, complete. Take a moment to enjoy that.':!S.total?'A little space for yourself. Start a ritual, or simply take today slowly.':S.done?'You’ve made room for '+S.done+'. Keep going at your own pace.':'You don’t need a perfect day. Just a small beginning.';
  const copy=el('div','hero-copy','<div class="eyebrow">'+(isToday?salute+', '+name:esc(prettyDate(k)))+'</div><h2>'+title+'</h2><p>'+subtitle+'</p>');
  const cta=el('button','btn',!isToday?'Back to today':allDone?'Enjoy a quiet moment →':remaining.length?'Start '+esc(remaining[0].name.toLowerCase())+' →':'Create a ritual →');
  cta.onclick=()=>{if(!isToday){state.selDate=today;state.calMonth=null;renderToday();}else if(allDone){state.tab.meditate='breath';go('meditate');}else if(remaining.length)openRitual(remaining[0],k);else sheetNewHabit();};
  copy.append(cta);hero.append(copy,el('div','hero-art',homeArtwork(state.profile.homeArt||'horizon',S.pct)+'<span class="hero-caption">A little more you, every day</span>'));v.append(hero);
  const week=el('div','week-strip');week.setAttribute('aria-label','Choose a day');
  const start=addDays(k,-((parseKey(k).getDay()+6)%7));
  Array.from({length:7},(_,i)=>addDays(start,i)).forEach(wk=>{
    const sc=dayScore(wk),b=el('button','week-day'+(wk===k?' selected':''),'<small>'+DOWFULL[parseKey(wk).getDay()]+'</small><strong>'+parseKey(wk).getDate()+'</strong><i class="'+(sc.done?'logged':'')+'"></i>');
    b.disabled=wk>today;b.setAttribute('aria-pressed',String(wk===k));b.setAttribute('aria-label',prettyDate(wk)+', '+sc.done+' of '+sc.total+' rituals complete');if(wk===today)b.setAttribute('aria-current','date');
    b.onclick=()=>{state.selDate=wk;renderToday();};week.append(b);
  });v.append(week);
  const grid=el('div','today-grid'),main=el('div','today-main');
  const cal=el('div','panel calendar-panel');cal.append(calendarNode(),monthStatsNode());main.append(cal);
  main.append(el('div','block-head','<h2>'+ (isToday?'Your rituals':'Rituals that day')+'</h2><small>'+S.done+' / '+S.total+' complete</small>'));
  const list=el('div','ritual-list');
  hs.forEach(h=>{
    const done=isDone(h,k),sched=scheduled(h,k),val=valueOf(h,k),target=h.target||1,hue=HUES[h.hue]||HUES.brass,section=habitDestination(h),st=streak(h);
    const row=el('div','ritual-card'+(done?' done':''));row.style.setProperty('--hc',hue);row.dataset.habit=h.id;
    row.append(el('div','ritual-icon',ICONS[section]||ICONS.today));
    const unit=h.unit||'times',amt=(unit==='times'||unit==='entry')?'':' · '+val+' '+unit;
    const sub=h.noTarget?(done?'Done'+(val>1?amt:''):!sched?'Rest day · optional':'Not yet'):done?'Completed · '+val+' '+unit:!sched?'Rest day · optional':val+' / '+target+' '+unit;
    const W=weekHits(h,k),sub2=sub+' · '+W.done+' of '+W.target+' this week'+(!done&&sched&&h.minimum?' · min: '+h.minimum:'');
    const open=el('button','ritual-open','<div class="hname">'+esc(h.name)+'</div><div class="hsub">'+esc(sub2)+'</div><div class="ritual-meta"><span class="ritual-meter"><i style="width:'+Math.round(clamp(val/target,0,1)*100)+'%"></i></span><span>'+ (st?st+' scheduled-day streak':'Every beginning counts')+'</span></div>');
    open.setAttribute('aria-label','Open '+h.name);open.onclick=()=>openRitual(h,k);
    const check=el('button','check',ringSVG(done,sched?1:0,'#B8A179',clamp(val/target,0,1)));
    check.setAttribute('aria-pressed',String(done));check.setAttribute('aria-label',(done?'Uncheck ':'Check off ')+h.name);
    check.onclick=()=>{setDone(h,k,!done);renderToday();const next=[...v.querySelectorAll('.ritual-card')].find(r=>r.dataset.habit===h.id);next?.querySelector('.check').focus({preventScroll:true});};
    row.append(open,check);list.append(row);
  });
  if(!hs.length)list.append(el('div','empty','Your next chapter starts small. Create one ritual you’d like to make time for.'));
  main.append(list);const add=el('button','new-ritual','+ New habit');add.onclick=sheetNewHabit;main.append(add);
  const paths=el('div','practice-paths');
  [['meditate','A little stillness','Breathe & reset','dusk'],['journal','A clearer mind','Write a few words','lilac'],['read','A fresh perspective','Open your bookshelf','sage']].forEach(([id,title,sub,hue])=>{
    const b=el('button','path-card',ICONS[id]+'<span class="arrow">↗</span><b>'+title+'</b><small>'+sub+'</small>');b.style.setProperty('--path','var(--'+hue+')');b.onclick=()=>go(id);paths.append(b);
  });main.append(paths);
  const aside=el('div','today-aside');aside.append(checkinNode(k));
  const recent=Array.from({length:7},(_,i)=>addDays(today,-i)),activeDays=recent.filter(d=>Object.values(dayRO(d)?.entries||{}).some(e=>e.done)).length;
  const total=Object.entries(state.days).filter(([d])=>d<=today).reduce((n,[,d])=>n+Object.values(d.entries||{}).filter(e=>e.done).length,0);
  const c=251.33;
  aside.append(el('div','momentum-card','<h2 class="momentum-title">Your momentum</h2><div class="momentum-top"><div class="momentum-ring"><svg viewBox="0 0 92 92" aria-hidden="true"><circle cx="46" cy="46" r="40" fill="none" stroke="var(--line)" stroke-width="4"/><circle cx="46" cy="46" r="40" fill="none" stroke="var(--brass)" stroke-width="4" stroke-linecap="round" stroke-dasharray="'+(c*S.pct)+' '+c+'"/></svg><strong>'+Math.round(S.pct*100)+'%</strong></div><p><b>'+(allDone?'A day well kept.':S.done?'You’re making room.':'Room to begin.')+'</b>'+S.done+' of '+S.total+' scheduled rituals<br>'+(isToday?'today':'on this day')+'</p></div><div class="momentum-bottom"><div><strong>'+activeDays+' <small>/ 7</small></strong><span>Active days · last 7</span></div><div><strong>'+total+'</strong><span>Check-offs in history</span></div></div>'));
  const thoughts=['Small is a beautiful place to start.','You are allowed to begin again, as often as you need.','Make room for the person you’re becoming.','Some progress is quiet. It still counts.','A pause is part of a life, not the end of a practice.','Keep one small promise to yourself today.','Let this be something you do for yourself.'];
  aside.append(el('div','thought-card','<div class="eyebrow">A thought for today</div><p>'+thoughts[parseKey(today).getDay()]+'</p>'));
  if(typeof achievementPreview==='function')aside.append(achievementPreview());
  grid.append(main,aside);v.append(grid);
  const lower=el('div','today-lower'),lesson=el('details','');lesson.append(el('summary','','A small idea to take with you'),lessonNode());lower.append(lesson);
  v.append(lower);
}
function ringSVG(done,active,hue,pct){
  const r=15, c=2*Math.PI*r;
  const p=clamp(pct||0,0,1);
  return '<svg viewBox="0 0 34 34" width="34" height="34" fill="none">'+
   '<circle cx="17" cy="17" r="'+r+'" stroke="#3A3A3A" stroke-width="1.6"/>'+
   (done
     ? '<circle cx="17" cy="17" r="'+r+'" fill="'+hue+'" fill-opacity=".9"/><path d="M11.6 17.2l3.5 3.4 7-7.2" stroke="#14161F" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"/>'
     : (p>0 ? '<circle cx="17" cy="17" r="'+r+'" stroke="'+hue+'" stroke-width="2.2" stroke-linecap="round" stroke-dasharray="'+(c*p)+' '+c+'" transform="rotate(-90 17 17)"/>' : ''))+
   '</svg>';
}
/* Recognition is derived from saved history, never from a click counter. */
const MILESTONES=[
  {id:'begin',name:'A beginning',desc:'Complete your first ritual.',metric:'checks',target:1,hue:'brass',mark:'1'},
  {id:'return',name:'Back to yourself',desc:'Complete a ritual after at least one day without a check-off.',metric:'returns',target:1,hue:'sage',mark:'↗'},
  {id:'three',name:'Taking root',desc:'Log a completed ritual on 3 different days.',metric:'days',target:3,hue:'sage',mark:'3'},
  {id:'ten',name:'Little by little',desc:'Keep 10 completed rituals in your history.',metric:'checks',target:10,hue:'clay',mark:'10'},
  {id:'week',name:'A week of you',desc:'Log a completed ritual on 7 different days. They need not be consecutive.',metric:'days',target:7,hue:'dusk',mark:'7'},
  {id:'rhythm',name:'In your rhythm',desc:'Reach 7 consecutive days with a completed ritual.',metric:'best',target:7,hue:'lilac',mark:'✦'},
  {id:'fifty',name:'Quiet dedication',desc:'Keep 50 completed rituals in your history.',metric:'checks',target:50,hue:'brass',mark:'50'},
  {id:'month',name:'Deep roots',desc:'Log a completed ritual on 30 different days.',metric:'days',target:30,hue:'sage',mark:'30'},
  {id:'hundred',name:'A hundred promises',desc:'Keep 100 completed rituals in your history.',metric:'checks',target:100,hue:'lilac',mark:'100'}
];
let rewardSnapshot=new Map(),rewardKnown=new Set(),rewardTimer=null;
function journeyStats(){
  const rows=Object.entries(state.days).filter(([k,d])=>k<=todayKey()&&Object.values(d.entries||{}).some(e=>e.done)).sort(([a],[b])=>a.localeCompare(b));
  let best=0,run=0,previous=null,returns=0,checks=0;
  rows.forEach(([k,d])=>{checks+=Object.values(d.entries||{}).filter(e=>e.done).length;const consecutive=previous&&addDays(previous,1)===k;if(previous&&!consecutive)returns++;run=consecutive?run+1:1;best=Math.max(best,run);previous=k;});
  return {checks,days:rows.length,best,returns};
}
function earnedMilestones(stats=journeyStats()){return MILESTONES.filter(m=>stats[m.metric]>=m.target);}
function resetRewardBaseline(){
  rewardSnapshot=new Map(Object.entries(state.days).map(([k,d])=>[k,new Set(Object.keys(d.entries||{}).filter(id=>d.entries[id].done))]));
  rewardKnown=new Set([...earnedMilestones().map(m=>m.id),...(state.profile.rewardSeen||[])]);
}
function medalSVG(m,earned=true){
  return '<svg viewBox="0 0 100 110" fill="none" aria-hidden="true" style="color:var(--'+(earned?m.hue:'ivory-3')+')"><path d="M26 70l-6 35 23-12 8 10 4-34M58 69l7 34 11-12 15 9-9-34" fill="currentColor" opacity=".18"/><circle cx="50" cy="45" r="37" fill="currentColor" fill-opacity=".08" stroke="currentColor" stroke-opacity=".5"/><circle cx="50" cy="45" r="30" stroke="currentColor" stroke-opacity=".25" stroke-dasharray="2 5"/><path d="M19 46q0-15 11-24M81 46q0-15-11-24M20 52q4 14 16 20M80 52q-4 14-16 20" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><text x="50" y="54" text-anchor="middle" fill="currentColor" font-size="'+(m.mark.length>2?23:29)+'" font-family="Georgia,serif">'+m.mark+'</text></svg>';
}
function openMilestones(){state.tab.progress='milestones';go('progress');}
function achievementPreview(){
  const stats=journeyStats(),earned=earnedMilestones(stats),next=MILESTONES.find(m=>m.id!=='return'&&!earned.includes(m)),last=earned.at(-1),m=next||last;
  const p=el('div','milestone-preview');
  p.innerHTML='<div class="eyebrow">'+(next?'Your next milestone':'Your collection')+'</div><div class="milestone-mini">'+medalSVG(m,!next)+'<div><h3>'+esc(m.name)+'</h3><p>'+ (next?Math.min(stats[m.metric],m.target)+' / '+m.target+' '+({checks:'rituals',days:'active days',best:'days in a row',returns:'return'}[m.metric]):'A history worth recognizing.')+'</p></div></div>';
  const b=el('button','milestone-link','Explore milestones <span>'+earned.length+' / '+MILESTONES.length+' ↗</span>');b.onclick=openMilestones;p.append(b);return p;
}
function renderMilestones(v){
  const stats=journeyStats(),earned=earnedMilestones(stats);
  v.append(el('div','collection-intro','<div><div class="eyebrow">THE THINGS YOU KEEP SHOWING UP FOR</div><h3>Small promises. Real progress.</h3><p>Not a race. A collection of moments you made time for yourself.</p></div><strong>'+earned.length+' <small>/ '+MILESTONES.length+'</small></strong>'));
  const grid=el('div','medal-grid');MILESTONES.forEach(m=>{
    const hit=earned.includes(m),value=Math.min(stats[m.metric],m.target);
    const card=el('article','medal-card'+(hit?' earned':''),medalSVG(m,hit)+'<span class="medal-state">'+(hit?'Earned':'Growing')+'</span><h3>'+esc(m.name)+'</h3><p>'+esc(m.desc)+'</p><div class="medal-progress"><i style="width:'+Math.round(value/m.target*100)+'%"></i></div><small>'+value+' / '+m.target+'</small>');card.style.setProperty('--medal-color','var(--'+m.hue+')');grid.append(card);
  });v.append(grid,el('p','secsub milestone-note','Calculated from the history loaded on this device, including archived habits. Corrections can change a milestone. Rechecking the same habit does not add another ritual. Cloud history initially loads up to 400 days; older entries can be loaded in Journal → Search.'));
}
function rewardPreferences(node){
  node.innerHTML='<div class="label">Recognition, your way</div><label class="reward-option"><input id="celebrateWins" type="checkbox" '+(state.profile.celebrateWins!==false?'checked':'')+'><span>Celebrate my progress<small>A brief flourish when a ritual is complete. Saved confirmations and Undo stay available either way.</small></span></label><label class="reward-option"><input id="celebrationSound" type="checkbox" '+(state.profile.celebrationSound?'checked':'')+'><span>A little sound<small>A soft chime with celebrations. Off by default.</small></span></label>';
  node.querySelector('#celebrateWins').onchange=e=>{state.profile.celebrateWins=e.target.checked;pushProfile();};
  node.querySelector('#celebrationSound').onchange=e=>{state.profile.celebrationSound=e.target.checked;pushProfile();if(e.target.checked){audioReady();bell();}};
}
function noticeProgress(k,undo){
  const prev=rewardSnapshot.get(k)||new Set(),now=new Set(Object.keys(dayRO(k)?.entries||{}).filter(id=>isDone({id},k)));
  rewardSnapshot.set(k,now);
  const added=[...now].filter(id=>!prev.has(id));
  if(!added.length){if(undo)$('#winNotice')?.remove();return;}
  const fresh=earnedMilestones().filter(m=>!rewardKnown.has(m.id));
  fresh.forEach(m=>rewardKnown.add(m.id));
  if(fresh.length){state.profile.rewardSeen=[...new Set([...(state.profile.rewardSeen||[]),...fresh.map(m=>m.id)])].filter(id=>MILESTONES.some(m=>m.id===id));pushProfile();}
  if(k!==todayKey())return; // Historical edits change totals, not today's celebration.
  const name=state.habits.find(h=>h.id===added[0])?.name||'Ritual';
  if(state.profile.celebrateWins!==false&&state.profile.celebrationSound){audioReady();bell();}
  clearTimeout(rewardTimer);rewardTimer=setTimeout(()=>showWin(name,fresh.at(-1),k,undo),0);
}
function showWin(name,milestone,k,undo){
  $('#winNotice')?.remove();$('#toast').classList.remove('on');
  const celebrate=state.profile.celebrateWins!==false,S=dayScore(k),complete=S.total>0&&S.done===S.total;
  const title=celebrate?(milestone?'New milestone: '+milestone.name:complete?'Look at you. A day well kept.':'A little promise, kept.'):'Ritual saved';
  const box=el('aside','win-notice'+(celebrate?' celebrating':'')+(milestone&&celebrate?' milestone-win':''));box.id='winNotice';box.setAttribute('aria-label','Saved ritual');
  box.innerHTML='<div class="win-art">'+(milestone&&celebrate?medalSVG(milestone):'<span aria-hidden="true">✓</span>')+'</div><div class="win-copy"><div role="status" aria-live="polite"><strong>'+esc(title)+'</strong><p>'+esc(name)+' complete. '+S.done+' of '+S.total+' scheduled rituals today.</p></div><div class="win-actions"></div></div>';
  const actions=box.querySelector('.win-actions');
  if(undo){const b=el('button','','Undo');b.onclick=()=>{const d=day(k),current=d.entries[undo.habitId]||null;if(JSON.stringify(current)!==JSON.stringify(undo.after)){toast('This ritual changed since then. Review it in Today.');box.remove();return;}if(undo.before)d.entries[undo.habitId]=clone(undo.before);else delete d.entries[undo.habitId];pushDay(k);box.remove();renderAll();toast('Check-off undone. Your previous progress is restored.');};actions.append(b);}
  const view=el('button','','View milestones');view.onclick=()=>{box.remove();openMilestones();};actions.append(view);
  const close=el('button','win-close','×');close.setAttribute('aria-label','Dismiss celebration');close.onclick=()=>box.remove();box.append(close);
  const anchor=state.view==='today'?[...document.querySelectorAll('.ritual-card')].find(r=>r.dataset.habit===undo?.habitId)||$('.block-head'):$('.view.on .section-hero');
  if(anchor)anchor.after(box);else document.body.append(box);
  if(celebrate&&state.view==='today'){const row=[...document.querySelectorAll('.ritual-card')].find(r=>r.dataset.habit===undo?.habitId);row?.classList.add('just-logged');}
}

/* lesson of the day */
function lessonForToday(){
  const t=todayKey();
  if(state.profile.lastLessonDay!==t){
    if(state.profile.lastLessonDay){ state.profile.lessonIdx=(state.profile.lessonIdx+1)%LESSONS.length; }
    state.profile.lastLessonDay=t; pushProfile();
  }
  return LESSONS[state.profile.lessonIdx%LESSONS.length];
}
function lessonNode(){
  const L=lessonForToday();
  const n=el("div","lesson");
  n.innerHTML='<div class="eyebrow">'+esc(L.tag)+'</div><div class="lt">'+esc(L.t)+'</div>'+
    L.b.map(p=>'<p>'+esc(p)+'</p>').join("")+
    '<div class="act"><b>Do this</b><span>'+esc(L.a)+'</span></div>';
  const bar=el("div","chiprow"); bar.style.marginTop="16px";
  const done=(dayRO(todayKey())||{}).lesson;
  const b1=el("button","chip"+(done?" on":""),done?"Practised ✓":"Mark as practised");
  b1.onclick=()=>{ const d=day(todayKey()); d.lesson=d.lesson?null:{id:L.t,at:nowISO()}; pushDay(todayKey()); renderToday(); };
  const b2=el("button","chip","Next lesson");
  b2.onclick=()=>{ state.profile.lessonIdx=(state.profile.lessonIdx+1)%LESSONS.length; pushProfile(); renderToday(); };
  bar.append(b1,b2);
  n.appendChild(bar);
  return n;
}

/* calendar */
function monthStatsNode(){
  const base = state.calMonth ? parseKey(state.calMonth+"-01") : parseKey(state.selDate);
  const y=base.getFullYear(), m=base.getMonth(), tk=todayKey();
  const days=new Date(y,m+1,0).getDate();
  let perfect=0,active=0,done=0,total=0,run=0,best=0;
  for(let dd=1;dd<=days;dd++){
    const k=y+"-"+pad(m+1)+"-"+pad(dd);
    if(k>tk) break;
    const s=dayScore(k);
    done+=s.done; total+=s.total;
    if(s.done>0){ active++; run++; best=Math.max(best,run); } else run=0;
    if(s.total>0 && s.done===s.total) perfect++;
  }
  const pct=total?Math.round(done/total*100):0;
  const stat=(n,l)=>'<div><strong>'+n+'</strong><span>'+l+'</span></div>';
  return el("div","month-stats",stat(perfect,"Perfect days")+stat(active,"Active days")+stat(pct+"%","Habits completed")+stat(best,"Best streak"));
}
function calendarNode(){
  const wrap=el("div","cal-wrap");
  const base = state.calMonth ? parseKey(state.calMonth+"-01") : parseKey(state.selDate);
  const y=base.getFullYear(), m=base.getMonth();
  const head=el("div","calhead");
  head.innerHTML='<div class="m">'+MONTHS[m]+' <span class="mono" style="color:var(--ivory-3);font-size:.8rem">'+y+'</span></div>';
  const nav=el("div","calnav");
  const prev=el("button","",'<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M10 3.5L5.5 8l4.5 4.5"/></svg>');
  const next=el("button","",'<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M6 3.5L10.5 8 6 12.5"/></svg>');
  prev.setAttribute('aria-label','Previous month');next.setAttribute('aria-label','Next month');
  prev.onclick=()=>{ const d=new Date(y,m-1,1); state.calMonth=d.getFullYear()+"-"+pad(d.getMonth()+1); renderToday(); };
  next.onclick=()=>{ const d=new Date(y,m+1,1); state.calMonth=d.getFullYear()+"-"+pad(d.getMonth()+1); renderToday(); };
  nav.append(prev,next); head.appendChild(nav);
  wrap.appendChild(head);

  const grid=el("div","cal");
  DOW.forEach((d,i)=>grid.appendChild(el("div","dow",d)));
  const first=new Date(y,m,1).getDay();
  const days=new Date(y,m+1,0).getDate();
  for(let i=0;i<first;i++) grid.appendChild(el("div","cell empty"));
  const tk=todayKey();
  for(let dd=1;dd<=days;dd++){
    const k=y+"-"+pad(m+1)+"-"+pad(dd);
    const s=dayScore(k);
    const lv=s.pct>=1?3:s.pct>=.5?2:s.pct>0?1:0;
    const cls="cell"+(s.pct>0?" has lv"+lv:"")+(k===tk?" today":"")+(k===state.selDate?" sel":"")+(k>tk?" fut":"");
    const c=el("button",cls,'<span class="fill"></span><span class="num">'+dd+'</span>');
    c.disabled=k>tk;c.setAttribute('aria-label',prettyDate(k)+', '+s.done+' of '+s.total+' habits');c.setAttribute('aria-pressed',String(k===state.selDate));
    if(s.pct>0) c.querySelector(".fill").style.opacity=(0.2+0.8*s.pct).toFixed(2);
    c.title=s.total?(s.done+"/"+s.total+" habits"):"";
    if(k<=tk){ c.onclick=()=>{ state.selDate=k; renderToday(); }; }
    grid.appendChild(c);
  }
  wrap.appendChild(grid);

  const legend=el("div","cal-legend",'<span>Less</span><i class="z"></i><i style="--o:.47"></i><i style="--o:.73"></i><i style="--o:1"></i><span>More</span>');
  wrap.appendChild(legend);
  return wrap;
}

/* =========================================================================
   HABIT SHEETS
   ========================================================================= */
let sheetTimer=null,sheetReturn=null;
function openSheet(html,setup){
  const s=$("#sheet");if(!s.classList.contains('on'))sheetReturn=document.activeElement;s.innerHTML=html;
  $("#scrim").classList.add("on"); s.classList.add("on");
  $('#app').inert=true;
  const heading=s.querySelector('h3');if(heading){heading.id='sheetTitle';s.setAttribute('aria-labelledby','sheetTitle');}
  if(setup) setup(s);
  const f=s.querySelector("input,textarea,button,select");if(f)f.focus();
}
function closeSheet(){
  if(!$('#sheet').classList.contains('on'))return;
  if(sheetTimer){ clearInterval(sheetTimer); sheetTimer=null; }
  $("#sheet").classList.remove("on"); $("#scrim").classList.remove("on");
  $('#app').inert=false;
  if(sheetReturn?.isConnected)sheetReturn.focus({preventScroll:true});else $('.today-settings')?.focus({preventScroll:true});sheetReturn=null;
}
$("#scrim").onclick=closeSheet;
document.addEventListener("keydown",e=>{ if(e.key==="Escape") closeSheet(); });
document.addEventListener('keydown',e=>{
  if(e.key!=='Tab'||!$('#sheet').classList.contains('on'))return;
  const nodes=[...$('#sheet').querySelectorAll('button,input,textarea,select,a[href]')].filter(n=>!n.disabled&&n.getClientRects().length),first=nodes[0],last=nodes.at(-1);
  if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}
});

function openHabit(h,k){
  if(h.section){ state.selDate=todayKey(); go(h.section); return; }
  const val=valueOf(h,k), done=isDone(h,k);
  openSheet(
   '<h3>'+esc(h.name)+'</h3><p class="sh-sub">'+esc(prettyDate(k))+'</p>'+
   (h.unit && h.unit!=="times" && h.unit!=="entry"
     ? '<label class="field"><span>'+esc(h.unit)+' today'+(h.noTarget?'':' · target '+h.target)+'</span><input type="number" id="hv" value="'+(val||0)+'" min="0" step="1"></label>'
     : '')+
   '<div class="chiprow"><button class="chip'+(done?" on":"")+'" id="tg">'+(done?"Completed ✓":"Mark complete")+'</button>'+
   '<button class="chip" id="edit">Edit habit</button>'+
   '<button class="chip" id="arch">Archive</button></div>'+
   '<div class="sheet-actions"><button class="btn ghost" id="cls">Close</button><button class="btn" id="sv">Save</button></div>',
   s=>{
     s.querySelector("#tg").onclick=()=>{ setDone(h,k,!isDone(h,k)); closeSheet(); renderAll(); };
     s.querySelector("#edit").onclick=()=>sheetEditHabit(h);
     s.querySelector("#arch").onclick=()=>{ h.archived=true; pushHabit(h); closeSheet(); renderAll(); toast("Archived — your history is kept."); };
     s.querySelector("#cls").onclick=closeSheet;
     s.querySelector("#sv").onclick=()=>{
       const inp=s.querySelector("#hv");
       if(inp){ const v=Number(inp.value)||0; const d=day(k);
         if(v>0) d.entries[h.id]={done:v>=(h.target||1),value:v,at:nowISO()}; else delete d.entries[h.id];
         pushDay(k); }
       closeSheet(); renderAll();
     };
   });
}
function sheetNewHabit(){
  openSheet(
   '<h3>New habit</h3><p class="sh-sub">Small enough that a bad day cannot stop it.</p>'+
   '<label class="field"><span>Name</span><input type="text" id="nm" placeholder="Write 500 words"></label>'+
   '<label class="reward-option po"><input type="checkbox" id="nt"><span>No target<small>Just check it off. Any amount counts, 5 minutes or 50.</small></span></label>'+
   '<div id="tgrid" style="display:grid;grid-template-columns:1fr 1fr;gap:14px">'+
     '<label class="field"><span>Target</span><input type="number" id="tg" value="1" min="1"></label>'+
     '<label class="field"><span>Unit</span><select id="un"><option value="times">times</option><option value="min">minutes</option><option value="pages">pages</option><option value="reps">reps</option><option value="km">km</option><option value="steps">steps</option><option value="L">litres</option></select></label>'+
   '</div>'+
   '<div class="field"><span>Days</span><div class="chiprow" id="dow"></div></div>'+
   recipeHTML(null)+
   '<div class="field"><span>Colour</span><div class="chiprow" id="hue"></div></div>'+
   '<div class="field"><span>Or start from one of these</span><div class="chiprow" id="pre"></div></div>'+
   '<div class="sheet-actions"><button class="btn ghost" id="cls">Cancel</button><button class="btn" id="ok">Create habit</button></div>',
   s=>{
     const days=[0,1,2,3,4,5,6]; let sel=days.slice(); let hue="brass";
     const nt=s.querySelector("#nt"),tgrid=s.querySelector("#tgrid");
     nt.onchange=()=>{ tgrid.style.display=nt.checked?"none":"grid"; };
     const dw=s.querySelector("#dow");
     days.forEach(d=>{ const b=el("button","chip on",DOWFULL[d]); b.onclick=()=>{
       const i=sel.indexOf(d); if(i<0){sel.push(d);b.classList.add("on");} else {sel.splice(i,1);b.classList.remove("on");} R.refresh(); }; dw.appendChild(b); });
     const R=recipeSetup(s,null,()=>sel);
     const hu=s.querySelector("#hue");
     Object.keys(HUES).forEach(h=>{ const b=el("button","chip"+(h===hue?" on":""),
       '<span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:'+HUES[h]+';margin-right:7px"></span>'+h);
       b.onclick=()=>{ hue=h; hu.querySelectorAll(".chip").forEach(x=>x.classList.remove("on")); b.classList.add("on"); }; hu.appendChild(b); });
     const pre=s.querySelector("#pre");
     PRESETS.forEach(p=>{ const b=el("button","chip",esc(p.name)); b.onclick=()=>{
       s.querySelector("#nm").value=p.name; s.querySelector("#tg").value=p.target; s.querySelector("#un").value=p.unit;
       nt.checked=false; tgrid.style.display="grid";
       hue=p.hue; hu.querySelectorAll(".chip").forEach(x=>x.classList.remove("on"));
       Array.from(hu.children).find(x=>x.textContent.trim()===p.hue)?.classList.add("on");
     }; pre.appendChild(b); });
     s.querySelector("#cls").onclick=closeSheet;
     s.querySelector("#ok").onclick=()=>{
       const nm=s.querySelector("#nm").value.trim(); if(!nm){ toast("Give it a name first."); return; }
       const h={id:uid(),name:nm,target:nt.checked?1:(Number(s.querySelector("#tg").value)||1),noTarget:nt.checked,unit:s.querySelector("#un").value,
                hue:hue,days:sel.sort(),order:(state.habits.length+1)*10,archived:false,createdAt:nowISO()};
       Object.assign(h,R.read());
       state.habits.push(h); pushHabit(h); closeSheet(); renderAll(); toast("“"+nm+"” added. Day one.");
     };
   });
}
function sheetEditHabit(h){
  openSheet(
   '<h3>Edit habit</h3><p class="sh-sub">Let the target fit your life right now. Your history stays with you.</p>'+
   '<label class="field"><span>Name</span><input type="text" id="nm" value="'+esc(h.name)+'"></label>'+
   '<label class="reward-option po"><input type="checkbox" id="nt"'+(h.noTarget?' checked':'')+'><span>No target<small>Just check it off. Any amount counts, 5 minutes or 50.</small></span></label>'+
   '<div id="tgrid" style="display:'+(h.noTarget?'none':'grid')+';grid-template-columns:1fr 1fr;gap:14px">'+
     '<label class="field"><span>Target</span><input type="number" id="tg" value="'+(h.target||1)+'" min="1"></label>'+
     '<label class="field"><span>Unit</span><input type="text" id="un" value="'+esc(h.unit||"times")+'"></label>'+
   '</div>'+
   '<div class="field"><span>Days</span><div class="chiprow" id="dow"></div></div>'+
   recipeHTML(h)+
   '<div class="sheet-actions"><button class="btn ghost" id="arch" style="margin-right:auto">Archive</button><button class="btn ghost" id="cls">Cancel</button><button class="btn" id="ok">Save</button></div>',
   s=>{
     s.querySelector("#arch").onclick=()=>{ h.archived=true; pushHabit(h); closeSheet(); renderAll(); toast("Archived — your history is kept."); };
     let sel=(h.days||[0,1,2,3,4,5,6]).slice();
     const nt=s.querySelector("#nt"),tgrid=s.querySelector("#tgrid");
     nt.onchange=()=>{ tgrid.style.display=nt.checked?"none":"grid"; };
     const dw=s.querySelector("#dow");
     [0,1,2,3,4,5,6].forEach(d=>{ const on=sel.includes(d); const b=el("button","chip"+(on?" on":""),DOWFULL[d]);
       b.onclick=()=>{ const i=sel.indexOf(d); if(i<0){sel.push(d);b.classList.add("on");} else {sel.splice(i,1);b.classList.remove("on");} R.refresh(); };
       dw.appendChild(b); });
     const R=recipeSetup(s,h,()=>sel);
     s.querySelector("#cls").onclick=closeSheet;
     s.querySelector("#ok").onclick=()=>{
       h.name=s.querySelector("#nm").value.trim()||h.name;
       h.noTarget=nt.checked;
       h.target=nt.checked?1:(Number(s.querySelector("#tg").value)||1);
       h.unit=s.querySelector("#un").value.trim()||"times";
       h.days=sel.sort(); Object.assign(h,R.read()); pushHabit(h); closeSheet(); renderAll();
     };
   });
}

/* =========================================================================
   JOURNAL
   ========================================================================= */
function promptFor(list,k){ const d=parseKey(k); return list[(d.getDate()+d.getMonth())%list.length]; }
function hasEntry(j){
  return !!(j && (j.mood || (j.morning||"").trim() || (j.evening||"").trim() || (j.gratitude||[]).some(g=>(g||"").trim()) || [j.weeklyReview?.worked,j.weeklyReview?.learned,j.weeklyReview?.next].some(s=>(s||'').trim())));
}
function journalDays(){
  return Object.keys(state.days).filter(x=>hasEntry(state.days[x].journal)).sort().reverse();
}
function renderJournal(){
  const v=$("#v-journal"); const k=todayKey(); const d=day(k);
  d.journal=d.journal||{mood:null,morning:"",evening:"",gratitude:["","",""],reflections:[]};
  const J=d.journal;
  const all=journalDays();
  sectionHeading(v,'journal','Journal','A few words. A clearer mind. Start with how you feel — a mood on its own counts, too.');
  v.appendChild(tabsNode("journal",[
    {id:"write",label:"Write today"},
    {id:"entries",label:"All entries",n:all.length},
    {id:"insights",label:"Insights"},
    {id:"search",label:"Search"},
    {id:"memories",label:"On this day"},
    {id:"weekly",label:"Week review"}
  ]));
  ({write:jWrite,entries:jEntries,insights:jInsights,search:jSearch,memories:jMemories,weekly:jWeekly}[state.tab.journal])(v,k,J);
}
function jWrite(v,k,J){
  const isEve=new Date().getHours()>=17;
  const cols=el("div","cols"); cols.style.marginTop="0";
  const main=el("div","panel flat");

  main.appendChild(el("div","label","How is today, on the whole?"));
  const mr=el("div","chiprow mood-picker");
  MOODS.forEach(m=>{ const b=el("button","chip"+(J.mood===m.v?" on":""),'<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><circle cx="16" cy="16" r="13"/><path d="M11 12h.1m9.9 0h.1" stroke-width="3" stroke-linecap="round"/><path d="'+(m.v<3?'M10 23q6-7 12 0':m.v===3?'M10 21h12':'M10 19q6 8 12 0')+'" stroke-linecap="round"/></svg><span>'+esc(m.w)+'</span>');b.setAttribute('aria-pressed',String(J.mood===m.v));
    b.onclick=()=>{ J.mood=J.mood===m.v?null:m.v; pushDay(k); renderJournal(); }; mr.appendChild(b); });
  main.appendChild(mr);

  const mk=(title,field,list)=>{
    const box=el("div",""); box.style.marginTop="30px";
    box.appendChild(el("div","label",title));
    box.appendChild(el("p","",'<span style="font-family:var(--f-display);font-size:1.14rem;color:var(--ivory)">'+esc(promptFor(list,k))+'</span>'));
    const ta=el("textarea","long"); ta.value=J[field]||""; ta.placeholder="Write freely. Nobody is grading this.";ta.setAttribute('aria-label',title+' entry');
    ta.oninput=()=>{ J[field]=ta.value; saveLocal(); markUnsaved(); };
    ta.onblur=()=>{ pushDay(k); };
    box.appendChild(ta);
    return box;
  };
  main.appendChild(mk(isEve?"Evening":"Morning", isEve?"evening":"morning", isEve?EVENING_PROMPTS:MORNING_PROMPTS));
  const slot=el("div","");
  const other=el("button","chip",(isEve?"Also write the morning entry":"Also write the evening entry"));
  other.style.marginTop="14px";
  other.onclick=()=>{ slot.appendChild(mk(isEve?"Morning":"Evening", isEve?"morning":"evening", isEve?MORNING_PROMPTS:EVENING_PROMPTS)); other.remove(); };
  main.append(other,slot);

  const gbox=el("div",""); gbox.style.marginTop="34px";
  gbox.appendChild(el("div","label","Three things worth having noticed"));
  J.gratitude=Array.isArray(J.gratitude)?J.gratitude:["","",""];
  while(J.gratitude.length<3)J.gratitude.push('');
  J.gratitude.forEach((g,i)=>{
    const line=el("div","affline");
    const inp=el("input"); inp.type="text"; inp.value=g; inp.placeholder=["Something small.","Someone.","Something you did."][i]||'Something worth noticing.';inp.setAttribute('aria-label','Gratitude '+(i+1));
    inp.oninput=()=>{ J.gratitude[i]=inp.value; saveLocal(); markUnsaved(); };
    inp.onblur=()=>pushDay(k);
    line.appendChild(inp); gbox.appendChild(line);
  });
  main.appendChild(gbox);

  /* explicit save — the entry moves to All entries and the Journal habit closes */
  const bar=el("div","savebar");
  const save=el("button","btn","Save entry");
  const stamp=el("span","saved"); stamp.id="jStamp";
  stamp.textContent = hasEntry(J) ? "Saved" : "Nothing written yet";
  if(hasEntry(J)) stamp.classList.add("ok");
  save.onclick=()=>{
    if(!hasEntry(J)){ toast("Write something or pick a mood first."); return; }
    pushDay(k);
    const h=state.habits.find(x=>x.section==="journal"||/journal|diar/i.test(x.name));
    if(h){ const dd=day(k); dd.entries[h.id]={done:true,value:1,at:nowISO()}; pushDay(k); }
    toast("Entry saved. It's in All entries now.");
    state.tab.journal="entries"; renderJournal();
  };
  bar.append(save,stamp);

  main.appendChild(bar);

  cols.appendChild(main);

  const side=el("div","panel");
  side.appendChild(el("div","label","Recent"));
  const past=journalDays().filter(x=>x!==k).slice(0,10);
  if(!past.length) side.appendChild(el("div","empty","Nothing here yet. Today's entry will be the first."));
  past.forEach(pk=>side.appendChild(entryNode(pk)));
  cols.appendChild(side);
  v.appendChild(cols);
}
function markUnsaved(){
  const s=document.getElementById("jStamp");
  if(s){ s.classList.remove("ok"); s.textContent="Unsaved changes"; }
}
function entryNode(pk,full){
  const pj=state.days[pk].journal||{};
  const parts=[];
  if((pj.morning||"").trim()) parts.push("Morning — "+pj.morning.trim());
  if((pj.evening||"").trim()) parts.push("Evening — "+pj.evening.trim());
  const g=(pj.gratitude||[]).filter(x=>(x||"").trim());
  if(g.length) parts.push("Noticed: "+g.join(" · "));
  if(pj.weeklyReview){const r=pj.weeklyReview;parts.push('Week review · '+pk+' to '+addDays(pk,6));[['Looking back',r.worked],['Why',r.learned],['Next week',r.next],['Change',r.change?CHANGE_LABEL[r.change]:''],['Next focus',r.nextFocus?focusLabel(r.nextFocus):'']].forEach(([label,text])=>{if(text)parts.push(label+' — '+text);});}
  let body=parts.join("\n\n")||"—";
  if(!full && body.length>320) body=body.slice(0,320)+"…";
  const e=el("div","entry");
  const mood=pj.mood?'<span class="moodpill">'+esc((MOODS.find(m=>m.v===pj.mood)||{}).w||"")+'</span>':"";
  e.innerHTML='<div class="ed">'+esc(prettyDate(pk))+', '+pk.slice(0,4)+mood+'</div><div class="eb">'+esc(body)+'</div>';
  if(pj.reflections&&pj.reflections.length){
    const r=el("div","lesson"); r.style.marginTop="14px";
    r.innerHTML='<div class="eyebrow">Coach said</div><p>'+esc(pj.reflections[pj.reflections.length-1].text)+'</p>';
    e.appendChild(r);
  }
  return e;
}
function jEntries(v,k){
  const all=journalDays();
  const p=el("div","panel flat");
  if(!all.length){ p.appendChild(el("div","empty","No entries yet. Write one in Write today and press Save entry.")); v.appendChild(p); return; }
  all.forEach(pk=>{
    const n=entryNode(pk,true);
    if(pk===k) n.querySelector(".ed").insertAdjacentHTML("beforeend",'<span class="moodpill" style="background:var(--brass-lo);color:var(--brass)">TODAY</span>');
    p.appendChild(n);
  });
  v.appendChild(p);
}
let journalFilters={query:'',from:'',to:''},journalWeek=null;
function journalText(j){return [j.morning,j.evening,...(j.gratitude||[]),...(j.reflections||[]).map(r=>r.text),j.weeklyReview?.worked,j.weeklyReview?.learned,j.weeklyReview?.next].filter(Boolean).join('\n');}
function searchJournal({query='',from='',to=''}={}){const q=query.trim().toLocaleLowerCase();return journalDays().filter(k=>(!from||k>=from)&&(!to||k<=to)&&(!q||journalText(state.days[k].journal).toLocaleLowerCase().includes(q)));}
function journalMemories(k=todayKey()){return journalDays().filter(d=>d<k&&d.slice(5)===k.slice(5)&&d.slice(0,4)<k.slice(0,4));}
function jSearch(v){
  const form=el('form','journal-search');form.innerHTML='<label class="field"><span>Words to remember</span><input type="search" id="journalQuery" placeholder="A person, a place, a thought…" value="'+esc(journalFilters.query)+'"></label><label class="field"><span>From</span><input id="journalFrom" type="date" value="'+esc(journalFilters.from)+'"></label><label class="field"><span>Through</span><input id="journalTo" type="date" value="'+esc(journalFilters.to)+'"></label>';
  const controls=el('div','chiprow'),clear=el('button','chip','Clear filters'),count=el('p','med-help'),results=el('div');count.setAttribute('role','status');controls.append(clear);v.append(form,controls,count,results);let limit=30;
  const draw=()=>{journalFilters={query:form.querySelector('#journalQuery').value,from:form.querySelector('#journalFrom').value,to:form.querySelector('#journalTo').value};results.innerHTML='';if(journalFilters.from&&journalFilters.to&&journalFilters.from>journalFilters.to){count.textContent='Choose an end date on or after the start date.';return;}const keys=searchJournal(journalFilters);count.textContent=keys.length+' '+(keys.length===1?'entry':'entries')+' found';if(!keys.length)results.append(el('div','empty','No entries match. Try another word or a wider date range.'));keys.slice(0,limit).forEach(k=>results.append(entryNode(k,true)));if(keys.length>limit){const more=el('button','btn ghost','Show more entries');more.onclick=()=>{limit+=30;draw();};results.append(more);}};
  form.onsubmit=e=>{e.preventDefault();draw();};form.querySelectorAll('input').forEach(input=>input.oninput=()=>{limit=30;draw();});clear.onclick=()=>{form.querySelectorAll('input').forEach(input=>input.value='');limit=30;draw();};draw();
}
function jMemories(v,k){
  v.append(el('div','journal-memory','<div class="eyebrow">'+esc(MONTHS[parseKey(k).getMonth()])+' '+parseKey(k).getDate()+'</div><h3 class="sec">A moment from another year</h3><p class="secsub">The same date, seen through an earlier version of your life.</p>'));
  const memories=journalMemories(k);
  if(!memories.length)v.append(el('div','empty','No entry from this date in an earlier year is loaded yet. Your memories will appear here as the years gather.'));
  memories.forEach(pk=>{const age=Number(k.slice(0,4))-Number(pk.slice(0,4));v.append(el('div','label',age+' '+(age===1?'year':'years')+' ago'));v.append(entryNode(pk,true));});
}
const CHANGE_LABEL={lower:"Lower a target",raise:"Raise a target",anchor:"Change an anchor",graduate:"Graduate a habit",keep:"Keep it as it is"};
function saveWeekReview(k,review){
  const clean=Object.fromEntries(['worked','learned','next'].map(key=>[key,String(review[key]||'').trim().slice(0,5000)]));
  if(!Object.values(clean).some(Boolean))throw new Error('Write one thought before saving your review.');
  if(review.change&&CHANGE_LABEL[review.change]) clean.change=review.change;
  if(review.nextFocus&&review.nextFocus.habitId) clean.nextFocus={habitId:review.nextFocus.habitId,target:Number(review.nextFocus.target)||5,ifThen:String(review.nextFocus.ifThen||'').slice(0,300)};
  const d=day(k);d.journal=d.journal||{};d.journal.weeklyReview={...clean,savedAt:nowISO()};pushDay(k);
  if(clean.nextFocus){
    const ws=addDays(k,7),f=Object.assign({weekStart:ws,setAt:nowISO()},clean.nextFocus),P=plan();
    if(ws<=trainingWeek()[0]){P.focus=f;P.nextFocus=null;}else P.nextFocus=f;
    pushProfile();
  }
  const h=state.habits.find(h=>!h.archived&&(h.section==='journal'||/journal|diar/i.test(h.name)));
  if(h)setDone(h,todayKey(),true,1);
}
/* The Sunday review is an after-action review: numbers first, then what happened, why, one change, and the next focus. */
let reviewDraft={};
function jWeekly(v,k){
  const current=trainingWeek(k)[0];journalWeek=journalWeek||addDays(current,-7);const keys=trainingWeek(journalWeek),start=keys[0],end=keys[6],review=state.days[start]?.journal?.weeklyReview||{};
  if(reviewDraft.start!==start)reviewDraft={start,change:review.change||null,nextFocus:review.nextFocus||null};
  const nav=el('div','week-navigation'),prev=el('button','chip','Previous week'),next=el('button','chip','Next week');next.disabled=start>=current;prev.onclick=()=>{journalWeek=addDays(start,-7);renderJournal();};next.onclick=()=>{journalWeek=addDays(start,7);renderJournal();};nav.append(prev,el('span','',start+' — '+end),next);v.append(nav);
  v.append(el('p','secsub',start===current?'This week is still in progress. Sunday evening is the moment for this.':'Ten minutes, in order: the numbers first, then what happened, then one change. Weeks run Monday to Sunday.'));
  const today=todayKey(),hs=activeHabits(),rows=hs.map(h=>{const planned=habitWeekTarget(h),done=keys.filter(x=>x<=today&&isDone(h,x)).length;return {h,planned,done};});
  const moodOf=ks=>{const m=ks.map(d=>state.days[d]?.journal?.mood).filter(Boolean);return m.length?m.reduce((a,b)=>a+b,0)/m.length:null;};
  const mood=moodOf(keys),prevMood=moodOf(trainingWeek(addDays(start,-7)));
  const mins=keys.reduce((n,d)=>n+medMinutes(d),0),pages=keys.reduce((n,d)=>n+(state.days[d]?.reading||[]).reduce((a,s)=>a+(Number(s.pages)||0),0),0),workouts=keys.reduce((n,d)=>n+(state.days[d]?.exercise||[]).filter(x=>x.completed!==false).length,0),entries=keys.filter(d=>hasEntry(state.days[d]?.journal));
  const data=el('div','panel flat');data.append(el('div','label','1 · The week in numbers, before any opinion'));
  if(rows.length){const t=el('table','aar-table');rows.forEach(r=>{const tr=el('tr',r.done>=r.planned?'hit':'');tr.innerHTML='<td>'+esc(r.h.name)+'</td><td><b>'+r.done+'</b> of '+r.planned+'</td><td><div class="bar"><i style="width:'+Math.round(clamp(r.done/Math.max(1,r.planned),0,1)*100)+'%"></i></div></td>';t.append(tr);});data.append(t);}
  data.append(metricNode([[mood?mood.toFixed(1)+' / 5':'—','Mood'+(prevMood?' · last week '+prevMood.toFixed(1):'')],[entries.length,'Days written'],[mins+' min','Meditation'],[pages,'Pages'],[workouts,'Workouts']]));
  v.append(data);
  const form=el('form','journal-review');
  const prefill=rows.length?rows.map(r=>r.h.name+': planned '+r.planned+', did '+r.done).join('. ')+'.':'What you set out to do, and what the week did with it.';
  [['worked','2 · What did you plan, and what actually happened?',prefill],['learned','3 · Why? One honest sentence.','Not an excuse, not a flogging. The real reason.'],['next','4 · What changes next week?','One thing. Smaller is more likely to happen.']].forEach(([field,label,placeholder])=>{const row=el('label','field','<span>'+label+'</span><textarea id="review-'+field+'" maxlength="5000" placeholder="'+esc(placeholder)+'">'+esc(review[field]||'')+'</textarea>');form.append(row);});
  const ch=el('div','field','<span>The kind of change</span>'),chips=el('div','chiprow'),cl=[];
  Object.entries(CHANGE_LABEL).forEach(([id,label])=>{const b=el('button','chip'+(reviewDraft.change===id?' on':''),label);b.type='button';b.onclick=()=>{reviewDraft.change=reviewDraft.change===id?null:id;cl.forEach(([x,y])=>y.classList.toggle('on',x===reviewDraft.change));};cl.push([id,b]);chips.append(b);});
  ch.append(chips);form.append(ch);
  const nf=el('div','field','<span>5 · The focus for the week of '+esc(prettyDate(addDays(start,7)))+'</span>'),nfRow=el('div','chiprow'),nfTxt=el('span','focus-pick',reviewDraft.nextFocus?esc(focusLabel(reviewDraft.nextFocus)):'Not chosen yet'),nfBtn=el('button','chip',reviewDraft.nextFocus?'Change':'Choose the focus');nfBtn.type='button';
  nfBtn.onclick=()=>sheetFocus({weekStart:addDays(start,7),title:'Next week’s focus',sub:'The one habit you protect next week, and what you do when it gets hard.',initial:reviewDraft.nextFocus||plan().focus||{},onSave:f=>{reviewDraft.nextFocus=f;}});
  nfRow.append(nfTxt,nfBtn);nf.append(nfRow);form.append(nf);
  const status=el('span','saved',review.savedAt?'Saved review':'Save when you are ready'),bar=el('div','savebar'),save=el('button','btn','Save week review');save.type='submit';bar.append(save,status);
  form.append(bar);
  form.querySelectorAll('textarea').forEach(input=>input.oninput=()=>{status.textContent='Unsaved changes';status.classList.remove('ok');});
  form.onsubmit=e=>{e.preventDefault();try{saveWeekReview(start,{worked:form.querySelector('#review-worked').value,learned:form.querySelector('#review-learned').value,next:form.querySelector('#review-next').value,change:reviewDraft.change,nextFocus:reviewDraft.nextFocus});status.textContent='Week review saved';status.classList.add('ok');toast('Week review saved.'+(reviewDraft.nextFocus?' Next week’s focus is set.':''));}catch(error){toast(error.message);}};
  v.append(form);
  const details=el('details');details.innerHTML='<summary>Read this week’s entries ('+entries.length+')</summary>';entries.forEach(d=>details.append(entryNode(d,true)));v.append(details);
}
function jInsights(v){
  const all=journalDays();
  const p=el("div","panel flat");
  const stats=el("div","stats"); stats.style.marginBottom="34px";
  const moods=all.map(k=>state.days[k].journal.mood).filter(Boolean);
  const avg=moods.length?(moods.reduce((a,b)=>a+b,0)/moods.length):0;
  const words=all.reduce((a,k)=>{const j=state.days[k].journal; return a+((j.morning||"")+" "+(j.evening||"")).trim().split(/\s+/).filter(Boolean).length;},0);
  let run=0,kk=todayKey();
  while(run<3650){ if(hasEntry((state.days[kk]||{}).journal)){run++;kk=addDays(kk,-1);} else if(kk===todayKey()){kk=addDays(kk,-1);} else break; }
  [[all.length,"Entries"],[run,"Day writing streak"],[words,"Words written"],[avg?avg.toFixed(1):"—","Average mood of 5"]]
    .forEach(([n,l])=>stats.appendChild(el("div","stat",'<div class="n mono">'+n+'</div><div class="k">'+l+'</div>')));
  stats.style.gridTemplateColumns="repeat(4,1fr)";
  p.appendChild(stats);

  p.appendChild(el("div","label","Mood, last 30 days"));
  const row=el("div",""); row.style.cssText="display:flex;align-items:flex-end;gap:5px;height:90px";
  for(let i=29;i>=0;i--){
    const key=addDays(todayKey(),-i);
    const m=((state.days[key]||{}).journal||{}).mood;
    const bar=el("div","");
    bar.style.cssText="flex:1;border-radius:3px;background:"+(m?"var(--brass)":"rgba(237,231,218,.06)")+
      ";height:"+(m?(14+m*16):8)+"px;opacity:"+(m?(0.45+m*0.11):1);
    bar.title=prettyDate(key)+(m?" — "+(MOODS.find(x=>x.v===m)||{}).w:" — no entry");
    row.appendChild(bar);
  }
  p.appendChild(row);
  p.appendChild(el("p","secsub","Taller and brighter is a better day. Gaps are days you did not log."));
  v.appendChild(p);
}

/* =========================================================================
   MEDITATION
   ========================================================================= */
let medTimer=null, medState=null;
function medMinutes(k){ return ((state.days[k]||{}).meditation||[]).reduce((a,s)=>a+(s.minutes||0),0); }
function medStats(){
  let total=0,sessions=0;
  Object.keys(state.days).forEach(kk=>{ const m=state.days[kk].meditation||[]; sessions+=m.length; total+=m.reduce((a,s)=>a+(s.minutes||0),0); });
  return {total,sessions};
}
function renderMeditate(){
  const v=$("#v-meditate"); const k=todayKey(); const d=day(k);
  const st=medStats();
  sectionHeading(v,'meditate','Meditation & Breathwork','A little space in your day. Find a practice for how you feel, return to a series, or simply sit with sound.');
  v.appendChild(tabsNode("meditate",[
    {id:"breath",label:"Breathwork",n:BREATH.length},
    {id:"guided",label:"Guided"},
    {id:"sounds",label:"Sounds"},
    {id:"timer",label:"Timer"},
    {id:"log",label:"History",n:st.sessions}
  ]));

  const stats=el("div","stats"); stats.style.marginBottom="34px";
  [[medMinutes(k)+"m","Minutes today"],[st.total+"m","All time"],[st.sessions,"Sessions"]]
   .forEach(([n,l])=>stats.appendChild(el("div","stat",'<div class="n mono">'+n+'</div><div class="k">'+l+'</div>')));
  v.appendChild(stats);

  ({breath:mBreath,guided:mGuided,sounds:mSounds,timer:mTimer,log:mLog}[state.tab.meditate])(v,k,d);
}
function mBreath(v,k){
  const p=el("div","panel");
  p.appendChild(el("div","label","Pick a pattern"));
  let pattern=BREATH.find(b=>b.id===state.profile.breathPattern)||BREATH[0];
  const pr=el("div","chiprow");
  BREATH.forEach(b0=>{
    const b=el("button","chip"+(b0.id===pattern.id?" on":""),esc(b0.name)+'<span class="n mono" style="margin-left:8px;font-size:.7rem;color:var(--ivory-3)">'+b0.phases.map(x=>x[1]).join("-")+'</span>');
    b.onclick=()=>{ pattern=b0;state.profile.breathPattern=b0.id;pushProfile(); pr.querySelectorAll(".chip").forEach(x=>x.classList.remove("on")); b.classList.add("on"); note.textContent=b0.note; };
    pr.appendChild(b);
  });
  p.appendChild(pr);
  const note=el("p","secsub",esc(pattern.note)); note.style.margin="14px 0 0"; p.appendChild(note);
  const choices=el("div","practice-choices");
  [["rings","Rings"],["petals","Petals"],["orbits","Orbits"]].forEach(([id,name])=>{
    const label=el("label","practice-choice",'<input type="radio" name="breath-art" value="'+id+'" '+((state.profile.breathArt||"rings")===id?'checked':'')+'>'+breathArt(id)+'<span>'+name+'</span>');
    label.querySelector("input").onchange=()=>{state.profile.breathArt=id;pushProfile();};choices.append(label);
  });p.append(choices);

  const stage=el("div","breathstage");
  const orb=el("div","orb",'<div style="text-align:center"><div class="ph">Ready</div><div class="ct">press Begin</div></div>');
  stage.appendChild(orb); p.appendChild(stage);

  const live=el("div","chiprow"); live.style.justifyContent="center"; live.style.marginBottom="16px";
  const chip=el("div","livechip hidden",'<span class="pulse"></span><span id="liveTxt">0:00</span>');
  live.appendChild(chip); p.appendChild(live);

  const ctl=el("div","chiprow"); ctl.style.justifyContent="center";
  const bstart=el("button","btn","Begin");
  ctl.append(bstart); p.appendChild(ctl);

  bstart.onclick=()=>startBreathPractice(pattern,k);
  v.appendChild(p);
  v.append(el('p','med-help','Breathe gently, without forcing depth or holds. Use Easy pace or your natural breath if a rhythm feels uncomfortable. Stop if you feel dizzy or short of breath. <a href="https://www.nhs.uk/mental-health/self-help/guides-tools-and-activities/breathing-exercises-for-stress/" target="_blank" rel="noopener">Comfortable breathing</a>.'));
  v.append(el('p','med-help','Choose a mix in Sounds before you begin; it can play beneath any practice.'));

  const quick=el("div","panel flat"); quick.style.marginTop="34px";
  quick.appendChild(el("div","label","Or log minutes you did elsewhere"));
  const mr=el("div","chiprow");
  [3,5,10,15,20,30].forEach(m=>{ const b=el("button","chip",m+" min"); b.onclick=()=>logMeditation(m,"Logged by hand",k); mr.appendChild(b); });
  quick.appendChild(mr);
  v.appendChild(quick);
}
let selectedCourse=null;
function courseCompleted(id){return new Set(Object.values(state.days).flatMap(d=>d.meditation||[]).filter(s=>s.course===id&&s.completed).map(s=>s.sessionId));}
function mGuided(v,k){
  v.append(el('p','med-help','Text-led practices with timed prompts and optional bells. Read with eyes open or softly lowered. No narration. Each series has three days; return whenever you like.'));
  const course=MED_COURSES.find(c=>c.id===selectedCourse);
  if(course){
    const back=el('button','btn ghost','All categories');back.onclick=()=>{selectedCourse=null;renderMeditate();};v.append(back);
    const done=courseCompleted(course.id),sessions=COURSE_SESSIONS.filter(s=>s.course===course.id);
    v.append(el('div','course-heading','<div class="eyebrow">'+esc(course.name)+' · 3-day series</div><h3 class="sec">'+esc(course.title)+'</h3><p class="secsub">'+esc(course.desc)+' '+done.size+' of 3 completed.</p>'));
    if(course.id==='comfort')v.append(el('p','med-help','A practice in attention and comfort, not treatment for pain. Adjust your position or stop whenever you need.'));
    sessions.forEach(S=>{
      const row=el('div','book','<div><div class="eyebrow">Day '+S.day+(done.has(S.id)?' · Completed':'')+'</div><div class="bt">'+esc(S.name)+'</div><div class="ba">'+S.min+' minutes · '+esc(S.lines[1][1])+'</div></div>');
      const b=el('button','chip',done.has(S.id)?'Repeat':'Begin day '+S.day);b.onclick=()=>runSession(S,k);row.append(b);v.append(row);
    });return;
  }
  const started=MED_COURSES.find(c=>{const n=courseCompleted(c.id).size;return n>0&&n<3;});
  if(started){const next=COURSE_SESSIONS.find(s=>s.course===started.id&&!courseCompleted(started.id).has(s.id)),row=el('div','med-intro');row.innerHTML='<div><div class="eyebrow">Pick up where you left off</div><h3>'+esc(started.title)+'</h3><span class="secsub">Day '+next.day+' · '+esc(next.name)+'</span></div>';const b=el('button','btn','Continue series');b.onclick=()=>runSession(next,k);row.append(b);v.append(row);}
  v.append(el('div','label','What would help today?'));
  const grid=el('div','course-grid');
  MED_COURSES.forEach((c,i)=>{const done=courseCompleted(c.id),card=el('button','course-card','<span class="course-mark" aria-hidden="true">'+['☾','≈','◎','∿','✧','◌','◇','☼','↗'][i]+'</span><div class="eyebrow">'+esc(c.name)+'</div><h3>'+esc(c.title)+'</h3><p>'+esc(c.desc)+'</p><small>3 days · 5–7 min'+(done.size?' · '+done.size+'/3 complete':'')+'</small><div class="course-progress" aria-hidden="true">'+[1,2,3].map(n=>'<i class="'+(done.has(c.id+'-'+n)?'done':'')+'"></i>').join('')+'</div>');card.style.setProperty('--course-hue','var(--'+c.hue+')');card.onclick=()=>{selectedCourse=c.id;renderMeditate();};grid.append(card);});v.append(grid);
  v.append(el('div','label','Single sessions · familiar favourites'));
  SESSIONS.forEach(S=>{const row=el('div','book','<div><div class="bt">'+esc(S.name)+'</div><div class="ba">'+esc(S.desc)+'</div></div>');const b=el('button','chip',S.min+' min');b.onclick=()=>runSession(S,k);row.append(b);v.append(row);});
}
function mLog(v,k){
  const p=el("div","panel flat");
  const rows=[];
  Object.keys(state.days).sort().reverse().forEach(kk=>{ (state.days[kk].meditation||[]).forEach(s=>rows.push({k:kk,s:s})); });
  if(!rows.length){ p.appendChild(el("div","empty","No sessions yet. Breathwork counts — three minutes is a session.")); v.appendChild(p); return; }
  p.appendChild(el("div","label","Every session, newest first"));
  rows.slice(0,60).forEach(o=>{
    const e=el("div","entry");
    e.innerHTML='<div class="ed">'+esc(prettyDate(o.k))+' · '+new Date(o.s.at).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})+
      '<span class="moodpill">'+o.s.minutes+' min</span></div><div class="eb">'+esc(o.s.kind)+'</div>';
    p.appendChild(e);
  });
  v.appendChild(p);
}
// One shared audio context, with a compressor and bounded channel levels.
const SOUND_CHANNELS=[['rain','Rain','A soft, bright wash'],['ocean','Waves','A slow rise and fall'],['wind','Wind','Air moving in the distance'],['brown','Brown noise','A low, steady texture'],['drone','Drone','Warm, sustained tones'],['bowl','Singing bowl','Slowly shimmering harmonics'],['fire','Fire','A low rustle with small crackles']];
let audioCtx=null,audioBus=null,soundMix=null;
function audioReady(){
  const C=window.AudioContext||window.webkitAudioContext;if(!C)return null;
  if(!audioCtx||audioCtx.state==='closed'){
    audioCtx=new C();const limiter=audioCtx.createDynamicsCompressor();limiter.threshold.value=-16;limiter.knee.value=12;limiter.ratio.value=8;
    audioBus=audioCtx.createGain();audioBus.gain.value=.65;audioBus.connect(limiter);limiter.connect(audioCtx.destination);
  }
  if(audioCtx.state==='suspended')audioCtx.resume().catch(()=>toast('Tap Play mix to enable sound.'));
  return audioCtx;
}
function soundLevels(){const saved=state.profile.soundLevels||{};return Object.fromEntries(SOUND_CHANNELS.map(([id])=>[id,clamp(Number(saved[id])||0,0,100)]));}
function makeSound(id,ctx){
  const nodes=[],sources=[],gain=ctx.createGain();gain.gain.value=0;gain.connect(audioBus);nodes.push(gain);
  const start=n=>{sources.push(n);nodes.push(n);n.start();return n;};
  const filter=ctx.createBiquadFilter();nodes.push(filter);filter.type='lowpass';filter.frequency.value={rain:6500,ocean:650,wind:1100,brown:400,fire:2200}[id]||1000;filter.connect(gain);
  if(id==='drone'||id==='bowl'){
    for(const [freq,level] of (id==='drone'?[[110,.15],[165,.08],[220,.035]]:[[220,.14],[440.5,.07],[660,.035]])){
      const o=ctx.createOscillator(),g=ctx.createGain();o.frequency.value=freq;g.gain.value=level;o.connect(g);g.connect(gain);nodes.push(g);start(o);
    }
  }else{
    const buffer=ctx.createBuffer(1,ctx.sampleRate*4,ctx.sampleRate),data=buffer.getChannelData(0);let brown=0,crackle=0;
    for(let i=0;i<data.length;i++){
      const white=Math.random()*2-1;brown=(brown+.02*white)/1.02;
      crackle=crackle*.94+(Math.random()<.0008?white*.5:0);
      data[i]=id==='brown'?brown*2.5:id==='fire'?brown*.6+crackle: white*.25;
    }
    const source=ctx.createBufferSource();source.buffer=buffer;source.loop=true;source.connect(filter);start(source);
  }
  if(['ocean','wind','bowl'].includes(id)){
    const swell=ctx.createGain();swell.gain.value=.65;gain.disconnect();gain.connect(swell);swell.connect(audioBus);nodes.push(swell);
    const lfo=ctx.createOscillator(),depth=ctx.createGain();lfo.frequency.value={ocean:.09,wind:.055,bowl:.13}[id];depth.gain.value=.3;lfo.connect(depth);depth.connect(swell.gain);nodes.push(depth);start(lfo);
  }
  return {gain,nodes,sources};
}
function updateSoundClock(){
  if(!soundMix)return;
  const now=Date.now();if(!soundMix.muted&&!medState&&!breathing&&Object.values(soundLevels()).some(n=>n>0)&&audioCtx?.state==='running')soundMix.seconds+=(now-soundMix.last)/1000;
  soundMix.last=now;
}
function applySoundLevels(){if(!soundMix)return;const levels=soundLevels();Object.entries(soundMix.channels).forEach(([id,ch])=>ch.gain.gain.setTargetAtTime(soundMix.muted?0:levels[id]/100,audioCtx.currentTime,.12));}
function soundDock(){
  $('#soundDock')?.remove();if(!soundMix)return;
  const dock=el('div','sound-dock','<span>Sound mix playing</span>');dock.id='soundDock';
  const mute=el('button','chip',soundMix.muted?'Unmute':'Mute');mute.onclick=()=>{updateSoundClock();soundMix.muted=!soundMix.muted;applySoundLevels();soundDock();};
  const end=el('button','chip','Finish listening');end.onclick=()=>{stopSounds(true);if(state.view==='meditate')renderMeditate();};dock.append(mute,end);document.body.append(dock);
  dock.querySelector('span').textContent=soundMix.muted?'Sound mix muted':'Sound mix playing';
}
function playSounds(){
  const ctx=audioReady();if(!ctx){toast('Sound is unavailable in this browser.');return false;}
  if(!Object.values(soundLevels()).some(n=>n>0)){toast('Raise at least one sound level first.');return false;}
  if(!soundMix){soundMix={channels:{},seconds:0,last:Date.now(),k:todayKey(),muted:false};SOUND_CHANNELS.forEach(([id])=>soundMix.channels[id]=makeSound(id,ctx));}
  soundMix.muted=false;applySoundLevels();soundDock();return true;
}
function stopSounds(log=false){
  if(!soundMix)return;updateSoundClock();const mix=soundMix;soundMix=null;
  Object.values(mix.channels).forEach(ch=>{ch.sources.forEach(s=>{try{s.stop();}catch(e){}});ch.nodes.forEach(n=>n.disconnect());});$('#soundDock')?.remove();
  if(log&&mix.seconds>=30)logMeditation(Math.max(1,Math.round(mix.seconds/60)),'Sound meditation',mix.k,{seconds:Math.round(mix.seconds)});
  else if(log)toast('Listening ended. Under 30 standalone seconds — not logged.');
}
setInterval(updateSoundClock,1000);
function mSounds(v){
  v.append(el('div','med-intro','<div><div class="eyebrow">Your quiet corner</div><h3>Build a soundscape</h3><p class="secsub">Layer a little rain with a low tone, or let one sound fill the room.</p></div>'));
  const presets=el('div','chiprow');
  [['Rainy evening',{rain:40,brown:20}],['By the sea',{ocean:55,wind:20}],['Warm room',{fire:45,drone:25}]].forEach(([name,mix])=>{const b=el('button','chip',name);b.onclick=()=>{updateSoundClock();state.profile.soundLevels=mix;pushProfile();applySoundLevels();renderMeditate();};presets.append(b);});v.append(presets);
  const grid=el('div','sound-grid'),levels=soundLevels();
  SOUND_CHANNELS.forEach(([id,name,desc])=>{const row=el('div','sound-channel','<label for="sound-'+id+'">'+name+'<output>'+levels[id]+'%</output></label><input id="sound-'+id+'" type="range" min="0" max="100" value="'+levels[id]+'"><small>'+desc+'</small>');const input=row.querySelector('input');input.oninput=()=>{updateSoundClock();state.profile.soundLevels={...soundLevels(),[id]:Number(input.value)};saveLocal();row.querySelector('output').textContent=input.value+'%';applySoundLevels();};input.onchange=()=>pushProfile();grid.append(row);});v.append(grid);
  const bar=el('div','chiprow'),play=el('button','btn',soundMix?'Resume mix':'Play mix'),stop=el('button','btn ghost','Finish listening');play.onclick=()=>{if(playSounds())renderMeditate();};stop.disabled=!soundMix;stop.onclick=()=>{stopSounds(true);renderMeditate();};bar.append(play,stop);v.append(bar);
  v.append(el('p','med-help','Your mix keeps playing across tabs and beneath practices. Finish listening saves standalone listening time; time inside another practice is counted there only. Start with a low device volume.'));
}
function timerSettings(){return {mode:'countdown',minutes:10,prep:5,interval:0,startBell:true,endBell:true,stopSounds:true,...state.profile.meditationTimer};}
function mTimer(v,k){
  const p=timerSettings(),form=el('form','timer-settings');
  form.innerHTML='<div class="med-intro"><div><div class="eyebrow">Room to simply sit</div><h3>Your time, your pace</h3></div></div><div class="form-grid"><label class="field"><span>Timer</span><select id="timerMode"><option value="countdown">Countdown</option><option value="open">Open-ended</option></select></label><label class="field"><span>Minutes</span><input id="timerMinutes" type="number" min="1" max="180" required value="'+p.minutes+'"></label><label class="field"><span>Preparation (seconds)</span><input id="timerPrep" type="number" min="0" max="120" required value="'+p.prep+'"></label><label class="field"><span>Interval bells (minutes)</span><input id="timerInterval" type="number" min="0" max="60" required value="'+p.interval+'"></label></div><p class="med-help">Set interval bells to 0 for silence. Preparation and pauses do not count toward your minutes.</p><div class="timer-checks"><label><input id="timerStartBell" type="checkbox" '+(p.startBell?'checked':'')+'> Starting bell</label><label><input id="timerEndBell" type="checkbox" '+(p.endBell?'checked':'')+'> Closing bell</label><label><input id="timerStopSounds" type="checkbox" '+(p.stopSounds?'checked':'')+'> Stop sound mix when the practice ends</label></div><div class="chiprow"><button class="btn" type="submit">Begin timer</button><button class="btn ghost" type="button" id="saveTimer">Save settings</button><button class="chip" type="button" id="previewBell">Preview bell</button></div>';
  form.querySelector('#timerMode').value=p.mode;
  const mode=()=>form.querySelector('#timerMinutes').disabled=form.querySelector('#timerMode').value==='open';form.querySelector('#timerMode').onchange=mode;mode();
  const save=()=>{if(!form.reportValidity())return null;const next={mode:form.querySelector('#timerMode').value,minutes:Number(form.querySelector('#timerMinutes').value),prep:Number(form.querySelector('#timerPrep').value),interval:Number(form.querySelector('#timerInterval').value),startBell:form.querySelector('#timerStartBell').checked,endBell:form.querySelector('#timerEndBell').checked,stopSounds:form.querySelector('#timerStopSounds').checked};state.profile.meditationTimer=next;pushProfile();return next;};
  form.onsubmit=e=>{e.preventDefault();const next=save();if(next)runMeditation(null,k,next);};form.querySelector('#saveTimer').onclick=()=>{if(save())toast('Settings saved for timers and guided practices.');};form.querySelector('#previewBell').onclick=()=>{audioReady();bell();};v.append(form);
  v.append(el('p','med-help','Bells, preparation and the sound ending setting also apply to guided sessions. Keep this tab open: closing it ends an unfinished practice.'));
}
function stopMed(){ if(medTimer){ clearInterval(medTimer); medTimer=null; } medState=null; }
let breathing=null;
function breathArt(variant){
  let shape='';
  if(variant==='petals'){
    for(let i=0;i<12;i++)shape+='<ellipse cx="0" cy="-92" rx="45" ry="92" transform="rotate('+(i*30)+')" opacity=".4"/>';
  }else if(variant==='orbits'){
    for(let i=0;i<9;i++)shape+='<ellipse rx="170" ry="'+(50+i*9)+'" transform="rotate('+(i*20)+')" opacity=".45"/>';
    for(let i=0;i<24;i++){const a=i*Math.PI/12;shape+='<circle cx="'+(Math.cos(a)*182)+'" cy="'+(Math.sin(a)*182)+'" r="2" fill="currentColor"/>';}
  }else{
    for(let i=0;i<9;i++)shape+='<circle r="'+(80+i*14)+'" opacity="'+(.2+i*.065)+'" stroke-dasharray="'+(24+i*2)+' 8"/>';
  }
  return '<svg class="practice-art" viewBox="-230 -230 460 460" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1"><g class="breath-geometry">'+shape+'</g></svg>';
}
function breathPhase(pattern,elapsed){
  const length=pattern.phases.reduce((a,p)=>a+p[1],0);
  let t=elapsed%length,previous=.72;
  for(const [name,duration] of pattern.phases){
    if(t<duration){const p=t/duration;return {name,left:Math.ceil(duration-t),scale:name==='Inhale'?.72+.28*p:name==='Exhale'?1-.28*p:previous};}
    if(name==='Inhale')previous=1;else if(name==='Exhale')previous=.72;
    t-=duration;
  }
}
function startBreathPractice(pattern,k){
  if(breathing||medState)return;
  updateSoundClock();audioReady();
  stopMed();
  const layer=el('div','practice');layer.id='breathPractice';layer.setAttribute('role','dialog');layer.setAttribute('aria-modal','true');layer.setAttribute('aria-label',pattern.name+' breathing');
  layer.innerHTML=breathArt(state.profile.breathArt||'rings')+'<div class="practice-pattern">'+esc(pattern.name)+'</div><div class="practice-readout"><div class="practice-phase"></div><div class="practice-time"></div></div>';
  const back=el('button','iconbtn practice-back',$('#sectionBack').innerHTML);back.title='End practice';back.setAttribute('aria-label','End practice');
  const finish=el('button','btn ghost practice-stop','Finish and log');
  const done=()=>finishBreathPractice();back.onclick=done;finish.onclick=done;layer.append(back,finish);
  const returnTo=document.activeElement;
  $('#app').inert=true;document.body.append(layer);back.focus();
  const reduced=window.matchMedia('(prefers-reduced-motion: reduce)');
  breathing={start:Date.now(),pattern,k,layer,returnTo,frame:null};
  const draw=()=>{
    if(!breathing)return;
    const secs=(Date.now()-breathing.start)/1000,p=breathPhase(pattern,secs);
    layer.querySelector('.practice-phase').textContent=p.name;
    layer.querySelector('.practice-time').textContent=p.left+'s  /  '+Math.floor(secs/60)+':'+pad(Math.floor(secs%60));
    layer.querySelector('.breath-geometry').setAttribute('transform',reduced.matches?'scale(.85)':'rotate('+(secs*2)+') scale('+p.scale+')');
    breathing.frame=requestAnimationFrame(draw);
  };draw();
  layer.onkeydown=e=>{
    if(e.key==='Escape'){e.preventDefault();done();}
    if(e.key==='Tab'){e.preventDefault();(document.activeElement===back?finish:back).focus();}
  };
}
function finishBreathPractice(){
  if(!breathing)return;
  updateSoundClock();
  const s=breathing;breathing=null;cancelAnimationFrame(s.frame);s.layer.remove();$('#app').inert=false;
  const seconds=(Date.now()-s.start)/1000;
  if(seconds>=30)logMeditation(Math.max(1,Math.round(seconds/60)),'Breathwork - '+s.pattern.name,s.k);
  else toast('Under 30 seconds - not logged.');
  if(s.returnTo?.isConnected)s.returnTo.focus();else $('#sectionBack').focus();
}
function runBreath(p,orb,k,chip){
  stopMed();
  const cycle=p.phases; let pi=0, t=0, elapsed=0;
  const ph=orb.querySelector(".ph"), ct=orb.querySelector(".ct");
  if(chip) chip.classList.remove("hidden");
  const apply=()=>{
    const [name,dur]=cycle[pi];
    ph.textContent=name;
    orb.style.transitionDuration=dur+"s";
    orb.style.transform = name==="Inhale" ? "scale(1.28)" : name==="Exhale" ? "scale(0.86)" : orb.style.transform||"scale(1)";
    t=dur;
  };
  apply();
  medTimer=setInterval(()=>{
    t-=0.1; elapsed+=0.1;
    ct.textContent=Math.ceil(t)+"s";
    const mm=Math.floor(elapsed/60)+":"+pad(Math.floor(elapsed%60));
    const lt=document.getElementById("liveTxt"); if(lt) lt.textContent=mm+" — press Stop and log to keep it";
    if(t<=0){ pi=(pi+1)%cycle.length; apply(); }
  },100);
  medState={type:"breath",start:Date.now(),k:k,name:p.name};
  toast("Breathing — "+p.name+". Press “Stop and log” when you're done.");
}
function runSession(S,k){runMeditation(S,k,timerSettings());}
function practiceElapsed(s,now=Date.now()){return Math.max(0,((s.pausedAt??now)-s.start-s.pausedMs)/1000-s.options.prep);}
function runMeditation(session,k,options){
  if(medState||breathing)return;
  updateSoundClock();audioReady();
  const total=session?session.min*60:options.mode==='open'?Infinity:options.minutes*60;
  const layer=el('div','med-practice');layer.id='medPractice';layer.setAttribute('role','dialog');layer.setAttribute('aria-modal','true');layer.setAttribute('aria-label',session?.name||'Meditation timer');
  layer.innerHTML='<button class="iconbtn practice-back" aria-label="End practice">'+$('#sectionBack').innerHTML+'</button><div class="eyebrow" id="practiceStatus"></div><h2>'+esc(session?.name||'A moment to yourself')+'</h2><div class="timerbig" id="practiceTime"></div><div class="script" id="practiceScript" aria-live="polite"></div><div class="chiprow"><button class="btn ghost" id="practicePause">Pause</button><button class="btn" id="practiceFinish">Finish and log</button></div><div class="chiprow"><button class="chip" id="practiceSound">'+(soundMix?(soundMix.muted?'Unmute sounds':'Mute sounds'):'No sound mix playing')+'</button></div><p class="med-help">Preparation and pauses are excluded. Sessions of 30 seconds or more are saved.</p>';
  medState={session,k,options,total,layer,start:Date.now(),pausedMs:0,pausedAt:null,begun:false,intervalIndex:0,saved:false,returnTo:document.activeElement};
  $('#app').inert=true;document.body.append(layer);layer.querySelector('.practice-back').focus();
  layer.querySelector('.practice-back').onclick=()=>finishMeditation(false);
  layer.querySelector('#practiceFinish').onclick=()=>finishMeditation(false);
  layer.querySelector('#practicePause').onclick=()=>{
    const s=medState;if(!s||s.saved)return;
    if(s.pausedAt!==null){s.pausedMs+=Date.now()-s.pausedAt;s.pausedAt=null;audioReady();}else s.pausedAt=Date.now();
    layer.querySelector('#practicePause').textContent=s.pausedAt!==null?'Resume':'Pause';tickMeditation();
  };
  const sound=layer.querySelector('#practiceSound');sound.disabled=!soundMix;sound.onclick=()=>{if(!soundMix)return;updateSoundClock();soundMix.muted=!soundMix.muted;applySoundLevels();soundDock();sound.textContent=soundMix.muted?'Unmute sounds':'Mute sounds';};
  layer.onkeydown=e=>{if(e.key==='Escape'){e.preventDefault();finishMeditation(false);}if(e.key==='Tab'){const buttons=[...layer.querySelectorAll('button')].filter(b=>!b.disabled),first=buttons[0],last=buttons.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}};
  medTimer=setInterval(tickMeditation,200);tickMeditation();
}
function tickMeditation(){
  const s=medState;if(!s||s.saved)return;
  const wall=((s.pausedAt??Date.now())-s.start-s.pausedMs)/1000,secs=Math.min(s.total,practiceElapsed(s));
  const preparing=wall<s.options.prep;
  s.layer.querySelector('#practiceStatus').textContent=s.pausedAt!==null?'Paused':preparing?'Settle in':s.session?s.session.desc:'Simply sitting';
  const shown=preparing?Math.ceil(s.options.prep-wall):Number.isFinite(s.total)?Math.ceil(s.total-secs):Math.floor(secs);
  s.layer.querySelector('#practiceTime').textContent=Math.floor(shown/60)+':'+pad(shown%60);
  if(preparing){s.layer.querySelector('#practiceScript').textContent='Find a comfortable position. Your practice begins shortly.';return;}
  if(!s.begun){s.begun=true;if(s.options.startBell)bell();}
  const line=s.session?[...s.session.lines].reverse().find(l=>secs>=l[0])?.[1]:'Rest your attention on a breath, a sound, or a point of contact. Return whenever you notice you have wandered.';
  s.layer.querySelector('#practiceScript').textContent=line||'Let yourself arrive.';
  if(s.pausedAt!==null)return;
  if(secs>=s.total){finishMeditation(true);return;}
  if(s.options.interval>0){const n=Math.floor(secs/(s.options.interval*60));if(n>s.intervalIndex){s.intervalIndex=n;bell();}}
}
function finishMeditation(natural=false){
  const s=medState;if(!s)return;
  if(s.saved){closeMeditation();return;}
  updateSoundClock();clearInterval(medTimer);medTimer=null;
  const secs=Math.min(s.total,practiceElapsed(s));s.saved=true;
  if(s.options.endBell&&secs>0)bell();
  if(s.options.stopSounds)stopSounds(true);
  if(secs>=30)logMeditation(Math.max(1,Math.round(secs/60)),s.session?.name||(Number.isFinite(s.total)?'Meditation timer':'Open meditation'),s.k,{seconds:Math.round(secs),sessionId:s.session?.id||null,course:s.session?.course||null,completed:natural&&!!s.session});
  else toast('Under 30 seconds of practice — not logged.');
  if(!natural){closeMeditation();return;}
  s.layer.querySelector('#practiceStatus').textContent='Practice complete';s.layer.querySelector('#practiceTime').textContent='✓';s.layer.querySelector('#practiceScript').textContent='Your minutes are saved. Take this pace into whatever comes next.';s.layer.querySelector('#practicePause').disabled=true;s.layer.querySelector('#practiceFinish').textContent='Return to practice library';s.layer.querySelector('#practiceSound').disabled=!soundMix;
}
function closeMeditation(){const s=medState;if(!s)return;updateSoundClock();s.layer.remove();stopMed();$('#app').inert=false;if(s.returnTo?.isConnected)s.returnTo.focus();else $('#sectionBack').focus();}
function logMeditation(min,kind,k,details={}){
  if(!Number.isFinite(min)||min<=0||min>1440)throw new Error('Enter valid meditation minutes.');
  const d=day(k); d.meditation.push({...details,minutes:min,kind:kind,at:nowISO()});
  const tot=d.meditation.reduce((a,s)=>a+(s.minutes||0),0);
  const h=state.habits.find(x=>!x.archived&&(x.section==="meditate"||/medit/i.test(x.name)));
  if(h) d.entries[h.id]={done:tot>=(h.target||1),value:tot,at:nowISO()};
  pushDay(k);
  toast("+"+min+" min — "+tot+" minutes today"+(h&&tot>=(h.target||1)?", habit closed.":"."));
  if(state.view==="meditate") renderMeditate();
}
function bell(){
  try{
    const ctx=audioCtx;if(!ctx||ctx.state!=='running')return;
    const o=ctx.createOscillator(), g=ctx.createGain();
    o.type="sine"; o.frequency.value=528; o.connect(g); g.connect(audioBus);
    g.gain.setValueAtTime(0.0001,ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.22,ctx.currentTime+0.02);
    g.gain.exponentialRampToValueAtTime(0.0001,ctx.currentTime+3.2);
    o.start(); o.stop(ctx.currentTime+3.3);
    o.onended=()=>{o.disconnect();g.disconnect();};
  }catch(e){}
}

/* =========================================================================
   READING
   ========================================================================= */
function renderRead(){
  const v=$("#v-read"); const k=todayKey(); const d=day(k);
  const pagesToday=(d.reading||[]).reduce((a,r)=>a+(r.pages||0),0);
  const pagesAll=Object.keys(state.days).reduce((a,kk)=>a+((state.days[kk].reading||[]).reduce((b,r)=>b+(r.pages||0),0)),0);
  const notes=[];
  Object.keys(state.days).sort().reverse().forEach(kk=>{
    (state.days[kk].reading||[]).forEach(r=>{ if(r.note) notes.push({k:kk,r:r}); });
  });
  sectionHeading(v,'read','Reading','One more page. One idea to keep. Log your reading and let the small sessions add up.');
  v.appendChild(tabsNode("read",[
    {id:"now",label:"Reading now",n:state.books.filter(b=>!b.done).length},
    {id:"shelf",label:"Finished",n:state.books.filter(b=>b.done).length},
    {id:"notes",label:"What you kept",n:notes.length}
  ]));

  const stats=el("div","stats"); stats.style.marginBottom="34px";
  [[pagesToday,"Pages today"],[pagesAll,"Pages all time"],[state.books.filter(b=>b.done).length,"Books finished"]]
   .forEach(([n,l])=>stats.appendChild(el("div","stat",'<div class="n mono">'+n+'</div><div class="k">'+l+'</div>')));
  v.appendChild(stats);

  const p=el("div","panel flat");
  if(state.tab.read==="now"){
    const reading=state.books.filter(b=>!b.done);
    if(!reading.length) p.appendChild(el("div","empty","No book on the go. Add one and the sessions have somewhere to land."));
    reading.forEach(b=>p.appendChild(bookRow(b,k,true)));
    const addb=el("button","addrow",'<span class="plus">+</span><span>Add a book</span>');
    addb.onclick=()=>sheetBook();
    p.appendChild(addb);
  }else if(state.tab.read==="shelf"){
    const done=state.books.filter(b=>b.done);
    if(!done.length) p.appendChild(el("div","empty","Nothing finished yet. The shelf fills slower than you would like — that is normal."));
    done.forEach(b=>p.appendChild(bookRow(b,k,false)));
  }else{
    if(!notes.length) p.appendChild(el("div","empty","Ideas you write down here become searchable later. Nothing yet."));
    notes.forEach(n=>{
      const b=state.books.find(x=>x.id===n.r.bookId);
      const e=el("div","entry");
      e.innerHTML='<div class="ed">'+esc(prettyDate(n.k))+(b?' · '+esc(b.title):'')+'<span class="moodpill">'+(n.r.pages||0)+' pages</span></div><div class="eb">'+esc(n.r.note)+'</div>';
      p.appendChild(e);
    });
  }
  v.appendChild(p);
}
function bookRow(b,k,active){
  const pct=b.pages?clamp(b.page/b.pages,0,1):0;
  const row=el("div","book");
  row.innerHTML='<div><div class="bt">'+esc(b.title)+'</div><div class="ba">'+esc(b.author||"—")+' · page '+(b.page||0)+(b.pages?" of "+b.pages:"")+'</div>'+
    (b.pages?'<div class="bar"><i style="width:'+(pct*100).toFixed(1)+'%"></i></div>':'')+'</div>';
  const cover=el('div','book-cover','<span>'+esc(b.title.split(/\s+/).slice(0,3).map(word=>word[0]||'').join(''))+'</span><i>UPGRADE<br>READING ROOM</i>');cover.setAttribute('aria-hidden','true');row.prepend(cover);
  if(active){ const btn=el("button","chip","Log session"); btn.onclick=()=>sheetReading(b,k); row.appendChild(btn); }
  else { const btn=el("button","chip","Reopen"); btn.onclick=()=>{ b.done=false; pushBook(b); renderRead(); }; row.appendChild(btn); }
  return row;
}
function sheetBook(){
  openSheet('<h3>Add a book</h3><p class="sh-sub">Only what you are reading now. The shelf is not a wish list.</p>'+
   '<label class="field"><span>Title</span><input type="text" id="t"></label>'+
   '<label class="field"><span>Author</span><input type="text" id="a"></label>'+
   '<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">'+
   '<label class="field"><span>Total pages</span><input type="number" id="p" min="1" placeholder="320"></label>'+
   '<label class="field"><span>Currently on page</span><input type="number" id="c" min="0" value="0"></label></div>'+
   '<div class="sheet-actions"><button class="btn ghost" id="cls">Cancel</button><button class="btn" id="ok">Add</button></div>',
   s=>{
     s.querySelector("#cls").onclick=closeSheet;
     s.querySelector("#ok").onclick=()=>{
       const t=s.querySelector("#t").value.trim(); if(!t){toast("It needs a title.");return;}
       const b={id:uid(),title:t,author:s.querySelector("#a").value.trim(),pages:Number(s.querySelector("#p").value)||0,
                page:Number(s.querySelector("#c").value)||0,done:false,startedAt:nowISO()};
       state.books.push(b); pushBook(b); closeSheet(); renderRead();
     };
   });
}
function sheetReading(b,k){
  openSheet('<h3>'+esc(b.title)+'</h3><p class="sh-sub">Where did you stop, and what stayed with you?</p>'+
   '<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">'+
   '<label class="field"><span>Stopped on page</span><input type="number" id="p" value="'+(b.page||0)+'" min="0"></label>'+
   '<label class="field"><span>Minutes</span><input type="number" id="m" value="20" min="1"></label></div>'+
   '<label class="field"><span>One idea worth keeping</span><textarea id="n" placeholder="The sentence you would repeat to someone."></textarea></label>'+
   '<div class="chiprow"><button class="chip" id="fin">Mark book finished</button></div>'+
   '<div class="sheet-actions"><button class="btn ghost" id="cls">Cancel</button><button class="btn" id="ok">Log it</button></div>',
   s=>{
     s.querySelector("#cls").onclick=closeSheet;
     s.querySelector("#fin").onclick=()=>{ b.done=true; b.finishedAt=nowISO(); pushBook(b); closeSheet(); renderRead(); toast("Finished. That counts."); };
     s.querySelector("#ok").onclick=()=>{
       const np=Number(s.querySelector("#p").value)||0;
       const read=Math.max(0,np-(b.page||0));
       const d=day(k);
       d.reading.push({bookId:b.id,pages:read,minutes:Number(s.querySelector("#m").value)||0,note:s.querySelector("#n").value.trim(),at:nowISO()});
       b.page=np; pushBook(b);
       const h=state.habits.find(x=>x.section==="read"||/read/i.test(x.name));
       if(h){ const tot=d.reading.reduce((a,r)=>a+(r.pages||0),0);
         d.entries[h.id]={done:tot>=(h.target||1),value:tot,at:nowISO()}; }
       pushDay(k); closeSheet(); renderRead(); toast(read+" pages logged.");
     };
   });
}

/* =========================================================================
   EXERCISE
   ========================================================================= */
const WORKOUTS=["Strength","Run","Ride","Swim","Mobility","Sport","Walk","Other"];
/* CATALOG START */
const EXERCISES=[{"id":"3_4_Sit-Up","name":"3/4 Sit-Up","primary":"core","secondary":[],"equipment":"body only","category":"strength","pattern":"Core"},{"id":"Ab_Crunch_Machine","name":"Ab Crunch Machine","primary":"core","secondary":[],"equipment":"machine","category":"strength","pattern":"Core"},{"id":"Advanced_Kettlebell_Windmill","name":"Advanced Kettlebell Windmill","primary":"core","secondary":["glutes","hamstrings","frontDelts"],"equipment":"kettlebells","category":"strength","pattern":"Core"},{"id":"Air_Bike","name":"Air Bike","primary":"core","secondary":[],"equipment":"body only","category":"strength","pattern":"Core"},{"id":"Alternate_Hammer_Curl","name":"Alternate Hammer Curl","primary":"biceps","secondary":["forearms"],"equipment":"dumbbell","category":"strength","pattern":"Isolation"},{"id":"Alternate_Heel_Touchers","name":"Alternate Heel Touchers","primary":"core","secondary":[],"equipment":"body only","category":"strength","pattern":"Core"},{"id":"Alternate_Incline_Dumbbell_Curl","name":"Alternate Incline Dumbbell Curl","primary":"biceps","secondary":["forearms"],"equipment":"dumbbell","category":"strength","pattern":"Isolation"},{"id":"Alternating_Cable_Shoulder_Press","name":"Alternating Cable Shoulder Press","primary":"frontDelts","secondary":["triceps"],"equipment":"cable","category":"strength","pattern":"Vertical push"},{"id":"Alternating_Deltoid_Raise","name":"Alternating Deltoid Raise","primary":"frontDelts","secondary":[],"equipment":"dumbbell","category":"strength","pattern":"Isolation"},{"id":"Alternating_Floor_Press","name":"Alternating Floor Press","primary":"chest","secondary":["core","frontDelts","triceps"],"equipment":"kettlebells","category":"strength","pattern":"Horizontal push"},{"id":"Alternating_Hang_Clean","name":"Alternating Hang Clean","primary":"hamstrings","secondary":["biceps","calves","forearms","glutes","back","traps"],"equipment":"kettlebells","category":"strength","pattern":"Isolation"},{"id":"Alternating_Kettlebell_Press","name":"Alternating Kettlebell Press","primary":"frontDelts","secondary":["triceps"],"equipment":"kettlebells","category":"strength","pattern":"Vertical push"},{"id":"Alternating_Kettlebell_Row","name":"Alternating Kettlebell Row","primary":"back","secondary":["biceps"],"equipment":"kettlebells","category":"strength","pattern":"Horizontal pull"},{"id":"Alternating_Renegade_Row","name":"Alternating Renegade Row","primary":"back","secondary":["core","biceps","chest","triceps"],"equipment":"kettlebells","category":"strength","pattern":"Horizontal pull"},{"id":"Anti-Gravity_Press","name":"Anti-Gravity Press","primary":"frontDelts","secondary":["back","traps","triceps"],"equipment":"barbell","category":"strength","pattern":"Vertical push"},{"id":"Arnold_Dumbbell_Press","name":"Arnold Dumbbell Press","primary":"frontDelts","secondary":["triceps"],"equipment":"dumbbell","category":"strength","pattern":"Vertical push"},{"id":"Around_The_Worlds","name":"Around The Worlds","primary":"chest","secondary":["frontDelts"],"equipment":"dumbbell","category":"strength","pattern":"Isolation"},{"id":"Back_Flyes_-_With_Bands","name":"Back Flyes - With Bands","primary":"frontDelts","secondary":["back","triceps"],"equipment":"bands","category":"strength","pattern":"Isolation"},{"id":"Band_Good_Morning","name":"Band Good Morning","primary":"hamstrings","secondary":["glutes","back"],"equipment":"bands","category":"powerlifting","pattern":"Hinge"},{"id":"Band_Good_Morning_Pull_Through","name":"Band Good Morning (Pull Through)","primary":"hamstrings","secondary":["glutes","back"],"equipment":"bands","category":"powerlifting","pattern":"Hinge"},{"id":"Band_Hip_Adductions","name":"Band Hip Adductions","primary":"quads","secondary":[],"equipment":"bands","category":"strength","pattern":"Isolation"},{"id":"Band_Pull_Apart","name":"Band Pull Apart","primary":"frontDelts","secondary":["back","traps"],"equipment":"bands","category":"strength","pattern":"Isolation"},{"id":"Band_Skull_Crusher","name":"Band Skull Crusher","primary":"triceps","secondary":[],"equipment":"bands","category":"strength","pattern":"Isolation"},{"id":"Barbell_Ab_Rollout","name":"Barbell Ab Rollout","primary":"core","secondary":["back","frontDelts"],"equipment":"barbell","category":"strength","pattern":"Core"},{"id":"Barbell_Ab_Rollout_-_On_Knees","name":"Barbell Ab Rollout - On Knees","primary":"core","secondary":["back","frontDelts"],"equipment":"barbell","category":"strength","pattern":"Core"},{"id":"Barbell_Bench_Press_-_Medium_Grip","name":"Barbell Bench Press - Medium Grip","primary":"chest","secondary":["frontDelts","triceps"],"equipment":"barbell","category":"strength","pattern":"Horizontal push"},{"id":"Barbell_Curl","name":"Barbell Curl","primary":"biceps","secondary":["forearms"],"equipment":"barbell","category":"strength","pattern":"Isolation"},{"id":"Barbell_Curls_Lying_Against_An_Incline","name":"Barbell Curls Lying Against An Incline","primary":"biceps","secondary":[],"equipment":"barbell","category":"strength","pattern":"Isolation"},{"id":"Barbell_Deadlift","name":"Barbell Deadlift","primary":"back","secondary":["calves","forearms","glutes","hamstrings","quads","traps"],"equipment":"barbell","category":"strength","pattern":"Hinge"},{"id":"Barbell_Full_Squat","name":"Barbell Full Squat","primary":"quads","secondary":["calves","glutes","hamstrings","back"],"equipment":"barbell","category":"strength","pattern":"Squat / lunge"},{"id":"Barbell_Glute_Bridge","name":"Barbell Glute Bridge","primary":"glutes","secondary":["calves","hamstrings"],"equipment":"barbell","category":"powerlifting","pattern":"Isolation"},{"id":"Barbell_Guillotine_Bench_Press","name":"Barbell Guillotine Bench Press","primary":"chest","secondary":["frontDelts","triceps"],"equipment":"barbell","category":"strength","pattern":"Horizontal push"},{"id":"Barbell_Hack_Squat","name":"Barbell Hack Squat","primary":"quads","secondary":["calves","forearms","hamstrings"],"equipment":"barbell","category":"strength","pattern":"Squat / lunge"},{"id":"Barbell_Hip_Thrust","name":"Barbell Hip Thrust","primary":"glutes","secondary":["calves","hamstrings"],"equipment":"barbell","category":"powerlifting","pattern":"Isolation"},{"id":"Barbell_Incline_Bench_Press_-_Medium_Grip","name":"Barbell Incline Bench Press - Medium Grip","primary":"chest","secondary":["frontDelts","triceps"],"equipment":"barbell","category":"strength","pattern":"Horizontal push"},{"id":"Barbell_Incline_Shoulder_Raise","name":"Barbell Incline Shoulder Raise","primary":"frontDelts","secondary":["chest"],"equipment":"barbell","category":"strength","pattern":"Isolation"},{"id":"Barbell_Lunge","name":"Barbell Lunge","primary":"quads","secondary":["calves","glutes","hamstrings"],"equipment":"barbell","category":"strength","pattern":"Squat / lunge"},{"id":"Barbell_Rear_Delt_Row","name":"Barbell Rear Delt Row","primary":"rearDelts","secondary":["biceps","back"],"equipment":"barbell","category":"strength","pattern":"Horizontal pull"},{"id":"Barbell_Rollout_from_Bench","name":"Barbell Rollout from Bench","primary":"core","secondary":["glutes","hamstrings","back","frontDelts"],"equipment":"barbell","category":"strength","pattern":"Core"},{"id":"Barbell_Seated_Calf_Raise","name":"Barbell Seated Calf Raise","primary":"calves","secondary":[],"equipment":"barbell","category":"strength","pattern":"Isolation"},{"id":"Barbell_Shoulder_Press","name":"Barbell Shoulder Press","primary":"frontDelts","secondary":["chest","triceps"],"equipment":"barbell","category":"strength","pattern":"Vertical push"},{"id":"Barbell_Shrug","name":"Barbell Shrug","primary":"traps","secondary":[],"equipment":"barbell","category":"strength","pattern":"Isolation"},{"id":"Barbell_Shrug_Behind_The_Back","name":"Barbell Shrug Behind The Back","primary":"traps","secondary":["forearms","back"],"equipment":"barbell","category":"strength","pattern":"Isolation"},{"id":"Barbell_Side_Bend","name":"Barbell Side Bend","primary":"core","secondary":["back"],"equipment":"barbell","category":"strength","pattern":"Core"},{"id":"Barbell_Side_Split_Squat","name":"Barbell Side Split Squat","primary":"quads","secondary":["calves","hamstrings","back"],"equipment":"barbell","category":"strength","pattern":"Squat / lunge"},{"id":"Barbell_Squat","name":"Barbell Squat","primary":"quads","secondary":["calves","glutes","hamstrings","back"],"equipment":"barbell","category":"strength","pattern":"Squat / lunge"},{"id":"Barbell_Squat_To_A_Bench","name":"Barbell Squat To A Bench","primary":"quads","secondary":["calves","glutes","hamstrings","back"],"equipment":"barbell","category":"strength","pattern":"Squat / lunge"},{"id":"Barbell_Step_Ups","name":"Barbell Step Ups","primary":"quads","secondary":["calves","glutes","hamstrings"],"equipment":"barbell","category":"strength","pattern":"Squat / lunge"},{"id":"Barbell_Walking_Lunge","name":"Barbell Walking Lunge","primary":"quads","secondary":["calves","glutes","hamstrings"],"equipment":"barbell","category":"strength","pattern":"Squat / lunge"},{"id":"Bench_Dips","name":"Bench Dips","primary":"triceps","secondary":["chest","frontDelts"],"equipment":"body only","category":"strength","pattern":"Vertical push"},{"id":"Bench_Press_-_Powerlifting","name":"Bench Press - Powerlifting","primary":"triceps","secondary":["chest","forearms","back","frontDelts"],"equipment":"barbell","category":"powerlifting","pattern":"Vertical push"},{"id":"Bench_Press_-_With_Bands","name":"Bench Press - With Bands","primary":"chest","secondary":["frontDelts","triceps"],"equipment":"bands","category":"strength","pattern":"Horizontal push"},{"id":"Bench_Press_with_Chains","name":"Bench Press with Chains","primary":"triceps","secondary":["chest","back","frontDelts"],"equipment":"barbell","category":"powerlifting","pattern":"Vertical push"},{"id":"Bent_Over_Barbell_Row","name":"Bent Over Barbell Row","primary":"back","secondary":["biceps","frontDelts"],"equipment":"barbell","category":"strength","pattern":"Horizontal pull"},{"id":"Bent_Over_Dumbbell_Rear_Delt_Raise_With_Head_On_Bench","name":"Bent Over Dumbbell Rear Delt Raise With Head On Bench","primary":"rearDelts","secondary":[],"equipment":"dumbbell","category":"strength","pattern":"Isolation"},{"id":"Bent_Over_Low-Pulley_Side_Lateral","name":"Bent Over Low-Pulley Side Lateral","primary":"sideDelts","secondary":["back","traps"],"equipment":"cable","category":"strength","pattern":"Isolation"},{"id":"Bent_Over_One-Arm_Long_Bar_Row","name":"Bent Over One-Arm Long Bar Row","primary":"back","secondary":["biceps","traps"],"equipment":"barbell","category":"strength","pattern":"Horizontal pull"},{"id":"Bent_Over_Two-Arm_Long_Bar_Row","name":"Bent Over Two-Arm Long Bar Row","primary":"back","secondary":["biceps"],"equipment":"barbell","category":"strength","pattern":"Horizontal pull"},{"id":"Bent_Over_Two-Dumbbell_Row","name":"Bent Over Two-Dumbbell Row","primary":"back","secondary":["biceps","frontDelts"],"equipment":"dumbbell","category":"strength","pattern":"Horizontal pull"},{"id":"Bent_Over_Two-Dumbbell_Row_With_Palms_In","name":"Bent Over Two-Dumbbell Row With Palms In","primary":"back","secondary":["biceps"],"equipment":"dumbbell","category":"strength","pattern":"Horizontal pull"},{"id":"Bent_Press","name":"Bent Press","primary":"core","secondary":["glutes","hamstrings","back","quads","frontDelts","triceps"],"equipment":"kettlebells","category":"strength","pattern":"Vertical push"},{"id":"Bent-Arm_Barbell_Pullover","name":"Bent-Arm Barbell Pullover","primary":"back","secondary":["chest","frontDelts","triceps"],"equipment":"barbell","category":"strength","pattern":"Isolation"},{"id":"Bent-Arm_Dumbbell_Pullover","name":"Bent-Arm Dumbbell Pullover","primary":"chest","secondary":["back","frontDelts","triceps"],"equipment":"dumbbell","category":"strength","pattern":"Isolation"},{"id":"Bent-Knee_Hip_Raise","name":"Bent-Knee Hip Raise","primary":"core","secondary":[],"equipment":"body only","category":"strength","pattern":"Core"},{"id":"Board_Press","name":"Board Press","primary":"triceps","secondary":["chest","forearms","back","frontDelts"],"equipment":"barbell","category":"powerlifting","pattern":"Vertical push"},{"id":"Body_Tricep_Press","name":"Body Tricep Press","primary":"triceps","secondary":[],"equipment":"body only","category":"strength","pattern":"Vertical push"},{"id":"Body-Up","name":"Body-Up","primary":"triceps","secondary":["core","forearms"],"equipment":"body only","category":"strength","pattern":"Isolation"},{"id":"Bodyweight_Flyes","name":"Bodyweight Flyes","primary":"chest","secondary":["core","frontDelts","triceps"],"equipment":"e-z curl bar","category":"strength","pattern":"Isolation"},{"id":"Bodyweight_Squat","name":"Bodyweight Squat","primary":"quads","secondary":["glutes","hamstrings"],"equipment":"body only","category":"strength","pattern":"Squat / lunge"},{"id":"Bosu_Ball_Cable_Crunch_With_Side_Bends","name":"Bosu Ball Cable Crunch With Side Bends","primary":"core","secondary":[],"equipment":"cable","category":"strength","pattern":"Core"},{"id":"Bottoms_Up","name":"Bottoms Up","primary":"core","secondary":[],"equipment":"body only","category":"strength","pattern":"Core"},{"id":"Bottoms-Up_Clean_From_The_Hang_Position","name":"Bottoms-Up Clean From The Hang Position","primary":"forearms","secondary":["biceps","frontDelts"],"equipment":"kettlebells","category":"strength","pattern":"Isolation"},{"id":"Box_Squat","name":"Box Squat","primary":"quads","secondary":["calves","glutes","hamstrings","back"],"equipment":"barbell","category":"powerlifting","pattern":"Squat / lunge"},{"id":"Box_Squat_with_Bands","name":"Box Squat with Bands","primary":"quads","secondary":["glutes","calves","hamstrings","back"],"equipment":"barbell","category":"powerlifting","pattern":"Squat / lunge"},{"id":"Box_Squat_with_Chains","name":"Box Squat with Chains","primary":"quads","secondary":["glutes","calves","hamstrings","back"],"equipment":"barbell","category":"strength","pattern":"Squat / lunge"},{"id":"Bradford_Rocky_Presses","name":"Bradford/Rocky Presses","primary":"frontDelts","secondary":["triceps"],"equipment":"barbell","category":"strength","pattern":"Vertical push"},{"id":"Butt_Lift_Bridge","name":"Butt Lift (Bridge)","primary":"glutes","secondary":["hamstrings"],"equipment":"body only","category":"strength","pattern":"Isolation"},{"id":"Butt-Ups","name":"Butt-Ups","primary":"core","secondary":[],"equipment":"body only","category":"strength","pattern":"Core"},{"id":"Butterfly","name":"Butterfly","primary":"chest","secondary":[],"equipment":"machine","category":"strength","pattern":"Isolation"},{"id":"Cable_Chest_Press","name":"Cable Chest Press","primary":"chest","secondary":["frontDelts","triceps"],"equipment":"cable","category":"strength","pattern":"Horizontal push"},{"id":"Cable_Crossover","name":"Cable Crossover","primary":"chest","secondary":["frontDelts"],"equipment":"cable","category":"strength","pattern":"Isolation"},{"id":"Cable_Crunch","name":"Cable Crunch","primary":"core","secondary":[],"equipment":"cable","category":"strength","pattern":"Core"},{"id":"Cable_Deadlifts","name":"Cable Deadlifts","primary":"quads","secondary":["forearms","glutes","hamstrings","back"],"equipment":"cable","category":"strength","pattern":"Hinge"},{"id":"Cable_Hammer_Curls_-_Rope_Attachment","name":"Cable Hammer Curls - Rope Attachment","primary":"biceps","secondary":[],"equipment":"cable","category":"strength","pattern":"Isolation"},{"id":"Cable_Hip_Adduction","name":"Cable Hip Adduction","primary":"quads","secondary":[],"equipment":"cable","category":"strength","pattern":"Isolation"},{"id":"Cable_Incline_Pushdown","name":"Cable Incline Pushdown","primary":"back","secondary":[],"equipment":"cable","category":"strength","pattern":"Isolation"},{"id":"Cable_Incline_Triceps_Extension","name":"Cable Incline Triceps Extension","primary":"triceps","secondary":[],"equipment":"cable","category":"strength","pattern":"Isolation"},{"id":"Cable_Internal_Rotation","name":"Cable Internal Rotation","primary":"frontDelts","secondary":[],"equipment":"cable","category":"strength","pattern":"Isolation"},{"id":"Cable_Iron_Cross","name":"Cable Iron Cross","primary":"chest","secondary":[],"equipment":"cable","category":"strength","pattern":"Isolation"},{"id":"Cable_Judo_Flip","name":"Cable Judo Flip","primary":"core","secondary":[],"equipment":"cable","category":"strength","pattern":"Core"},{"id":"Cable_Lying_Triceps_Extension","name":"Cable Lying Triceps Extension","primary":"triceps","secondary":[],"equipment":"cable","category":"strength","pattern":"Isolation"},{"id":"Cable_One_Arm_Tricep_Extension","name":"Cable One Arm Tricep Extension","primary":"triceps","secondary":[],"equipment":"cable","category":"strength","pattern":"Isolation"},{"id":"Cable_Preacher_Curl","name":"Cable Preacher Curl","primary":"biceps","secondary":["forearms"],"equipment":"cable","category":"strength","pattern":"Isolation"},{"id":"Cable_Rear_Delt_Fly","name":"Cable Rear Delt Fly","primary":"rearDelts","secondary":[],"equipment":"cable","category":"strength","pattern":"Isolation"},{"id":"Cable_Reverse_Crunch","name":"Cable Reverse Crunch","primary":"core","secondary":[],"equipment":"cable","category":"strength","pattern":"Core"},{"id":"Cable_Rope_Overhead_Triceps_Extension","name":"Cable Rope Overhead Triceps Extension","primary":"triceps","secondary":[],"equipment":"cable","category":"strength","pattern":"Isolation"},{"id":"Cable_Rope_Rear-Delt_Rows","name":"Cable Rope Rear-Delt Rows","primary":"rearDelts","secondary":["biceps","back"],"equipment":"cable","category":"strength","pattern":"Horizontal pull"},{"id":"Cable_Russian_Twists","name":"Cable Russian Twists","primary":"core","secondary":[],"equipment":"cable","category":"strength","pattern":"Core"},{"id":"Cable_Seated_Crunch","name":"Cable Seated Crunch","primary":"core","secondary":[],"equipment":"cable","category":"strength","pattern":"Core"},{"id":"Cable_Seated_Lateral_Raise","name":"Cable Seated Lateral Raise","primary":"sideDelts","secondary":["back","traps"],"equipment":"cable","category":"strength","pattern":"Isolation"},{"id":"Cable_Shoulder_Press","name":"Cable Shoulder Press","primary":"frontDelts","secondary":["triceps"],"equipment":"cable","category":"strength","pattern":"Vertical push"},{"id":"Cable_Shrugs","name":"Cable Shrugs","primary":"traps","secondary":[],"equipment":"cable","category":"strength","pattern":"Isolation"},{"id":"Cable_Wrist_Curl","name":"Cable Wrist Curl","primary":"forearms","secondary":[],"equipment":"cable","category":"strength","pattern":"Isolation"},{"id":"Calf_Press","name":"Calf Press","primary":"calves","secondary":[],"equipment":"machine","category":"strength","pattern":"Vertical push"},{"id":"Calf_Press_On_The_Leg_Press_Machine","name":"Calf Press On The Leg Press Machine","primary":"calves","secondary":[],"equipment":"machine","category":"strength","pattern":"Squat / lunge"},{"id":"Calf_Raise_On_A_Dumbbell","name":"Calf Raise On A Dumbbell","primary":"calves","secondary":[],"equipment":"dumbbell","category":"strength","pattern":"Isolation"},{"id":"Calf_Raises_-_With_Bands","name":"Calf Raises - With Bands","primary":"calves","secondary":[],"equipment":"bands","category":"strength","pattern":"Isolation"},{"id":"Calf-Machine_Shoulder_Shrug","name":"Calf-Machine Shoulder Shrug","primary":"traps","secondary":[],"equipment":"machine","category":"strength","pattern":"Isolation"},{"id":"Car_Drivers","name":"Car Drivers","primary":"frontDelts","secondary":["forearms"],"equipment":"barbell","category":"strength","pattern":"Isolation"},{"id":"Chair_Squat","name":"Chair Squat","primary":"quads","secondary":["calves","glutes","hamstrings"],"equipment":"machine","category":"strength","pattern":"Squat / lunge"},{"id":"Chin-Up","name":"Chin-Up","primary":"back","secondary":["biceps","forearms"],"equipment":"body only","category":"strength","pattern":"Vertical pull"},{"id":"Clean_and_Press","name":"Clean and Press","primary":"frontDelts","secondary":["core","calves","glutes","hamstrings","back","quads","traps","triceps"],"equipment":"barbell","category":"strength","pattern":"Vertical push"},{"id":"Clock_Push-Up","name":"Clock Push-Up","primary":"chest","secondary":["frontDelts","triceps"],"equipment":"body only","category":"strength","pattern":"Horizontal push"},{"id":"Close-Grip_Barbell_Bench_Press","name":"Close-Grip Barbell Bench Press","primary":"triceps","secondary":["chest","frontDelts"],"equipment":"barbell","category":"strength","pattern":"Vertical push"},{"id":"Close-Grip_Dumbbell_Press","name":"Close-Grip Dumbbell Press","primary":"triceps","secondary":["chest","frontDelts"],"equipment":"dumbbell","category":"strength","pattern":"Vertical push"},{"id":"Close-Grip_EZ_Bar_Curl","name":"Close-Grip EZ Bar Curl","primary":"biceps","secondary":["forearms"],"equipment":"barbell","category":"strength","pattern":"Isolation"},{"id":"Close-Grip_EZ-Bar_Curl_with_Band","name":"Close-Grip EZ-Bar Curl with Band","primary":"biceps","secondary":["forearms"],"equipment":"e-z curl bar","category":"strength","pattern":"Isolation"},{"id":"Close-Grip_EZ-Bar_Press","name":"Close-Grip EZ-Bar Press","primary":"triceps","secondary":["chest","frontDelts"],"equipment":"e-z curl bar","category":"strength","pattern":"Vertical push"},{"id":"Close-Grip_Front_Lat_Pulldown","name":"Close-Grip Front Lat Pulldown","primary":"back","secondary":["biceps","frontDelts"],"equipment":"cable","category":"strength","pattern":"Vertical pull"},{"id":"Close-Grip_Push-Up_off_of_a_Dumbbell","name":"Close-Grip Push-Up off of a Dumbbell","primary":"triceps","secondary":["core","chest","frontDelts"],"equipment":"body only","category":"strength","pattern":"Vertical push"},{"id":"Close-Grip_Standing_Barbell_Curl","name":"Close-Grip Standing Barbell Curl","primary":"biceps","secondary":["forearms"],"equipment":"barbell","category":"strength","pattern":"Isolation"},{"id":"Cocoons","name":"Cocoons","primary":"core","secondary":[],"equipment":"body only","category":"strength","pattern":"Core"},{"id":"Concentration_Curls","name":"Concentration Curls","primary":"biceps","secondary":["forearms"],"equipment":"dumbbell","category":"strength","pattern":"Isolation"},{"id":"Cross_Body_Hammer_Curl","name":"Cross Body Hammer Curl","primary":"biceps","secondary":["forearms"],"equipment":"dumbbell","category":"strength","pattern":"Isolation"},{"id":"Cross_Over_-_With_Bands","name":"Cross Over - With Bands","primary":"chest","secondary":["biceps","frontDelts"],"equipment":"bands","category":"strength","pattern":"Isolation"},{"id":"Cross-Body_Crunch","name":"Cross-Body Crunch","primary":"core","secondary":[],"equipment":"body only","category":"strength","pattern":"Core"},{"id":"Crunch_-_Hands_Overhead","name":"Crunch - Hands Overhead","primary":"core","secondary":[],"equipment":"body only","category":"strength","pattern":"Core"},{"id":"Crunch_-_Legs_On_Exercise_Ball","name":"Crunch - Legs On Exercise Ball","primary":"core","secondary":[],"equipment":"body only","category":"strength","pattern":"Core"},{"id":"Crunches","name":"Crunches","primary":"core","secondary":[],"equipment":"body only","category":"strength","pattern":"Core"},{"id":"Cuban_Press","name":"Cuban Press","primary":"frontDelts","secondary":["traps"],"equipment":"dumbbell","category":"strength","pattern":"Vertical push"},{"id":"Dead_Bug","name":"Dead Bug","primary":"core","secondary":[],"equipment":"body only","category":"strength","pattern":"Core"},{"id":"Deadlift_with_Bands","name":"Deadlift with Bands","primary":"back","secondary":["forearms","glutes","hamstrings","quads","traps"],"equipment":"barbell","category":"powerlifting","pattern":"Hinge"},{"id":"Deadlift_with_Chains","name":"Deadlift with Chains","primary":"back","secondary":["forearms","glutes","hamstrings","quads","traps"],"equipment":"barbell","category":"powerlifting","pattern":"Hinge"},{"id":"Decline_Barbell_Bench_Press","name":"Decline Barbell Bench Press","primary":"chest","secondary":["frontDelts","triceps"],"equipment":"barbell","category":"strength","pattern":"Horizontal push"},{"id":"Decline_Close-Grip_Bench_To_Skull_Crusher","name":"Decline Close-Grip Bench To Skull Crusher","primary":"triceps","secondary":["chest","frontDelts"],"equipment":"barbell","category":"strength","pattern":"Isolation"},{"id":"Decline_Crunch","name":"Decline Crunch","primary":"core","secondary":[],"equipment":"body only","category":"strength","pattern":"Core"},{"id":"Decline_Dumbbell_Bench_Press","name":"Decline Dumbbell Bench Press","primary":"chest","secondary":["frontDelts","triceps"],"equipment":"dumbbell","category":"strength","pattern":"Horizontal push"},{"id":"Decline_Dumbbell_Flyes","name":"Decline Dumbbell Flyes","primary":"chest","secondary":[],"equipment":"dumbbell","category":"strength","pattern":"Isolation"},{"id":"Decline_Dumbbell_Triceps_Extension","name":"Decline Dumbbell Triceps Extension","primary":"triceps","secondary":[],"equipment":"dumbbell","category":"strength","pattern":"Isolation"},{"id":"Decline_EZ_Bar_Triceps_Extension","name":"Decline EZ Bar Triceps Extension","primary":"triceps","secondary":[],"equipment":"barbell","category":"strength","pattern":"Isolation"},{"id":"Decline_Oblique_Crunch","name":"Decline Oblique Crunch","primary":"core","secondary":[],"equipment":"body only","category":"strength","pattern":"Core"},{"id":"Decline_Reverse_Crunch","name":"Decline Reverse Crunch","primary":"core","secondary":[],"equipment":"body only","category":"strength","pattern":"Core"},{"id":"Decline_Smith_Press","name":"Decline Smith Press","primary":"chest","secondary":["frontDelts","triceps"],"equipment":"machine","category":"strength","pattern":"Horizontal push"},{"id":"Deficit_Deadlift","name":"Deficit Deadlift","primary":"back","secondary":["forearms","glutes","hamstrings","quads","traps"],"equipment":"barbell","category":"powerlifting","pattern":"Hinge"},{"id":"Dip_Machine","name":"Dip Machine","primary":"triceps","secondary":["chest","frontDelts"],"equipment":"machine","category":"strength","pattern":"Vertical push"},{"id":"Dips_-_Triceps_Version","name":"Dips - Triceps Version","primary":"triceps","secondary":["chest","frontDelts"],"equipment":"body only","category":"strength","pattern":"Vertical push"},{"id":"Double_Kettlebell_Alternating_Hang_Clean","name":"Double Kettlebell Alternating Hang Clean","primary":"hamstrings","secondary":["biceps","calves","forearms","glutes","back","quads","traps"],"equipment":"kettlebells","category":"strength","pattern":"Isolation"},{"id":"Double_Kettlebell_Jerk","name":"Double Kettlebell Jerk","primary":"frontDelts","secondary":["calves","quads","triceps"],"equipment":"kettlebells","category":"strength","pattern":"Isolation"},{"id":"Double_Kettlebell_Push_Press","name":"Double Kettlebell Push Press","primary":"frontDelts","secondary":["calves","quads","triceps"],"equipment":"kettlebells","category":"strength","pattern":"Vertical push"},{"id":"Double_Kettlebell_Snatch","name":"Double Kettlebell Snatch","primary":"frontDelts","secondary":["glutes","hamstrings","quads"],"equipment":"kettlebells","category":"strength","pattern":"Isolation"},{"id":"Double_Kettlebell_Windmill","name":"Double Kettlebell Windmill","primary":"core","secondary":["glutes","hamstrings","frontDelts","triceps"],"equipment":"kettlebells","category":"strength","pattern":"Core"},{"id":"Drag_Curl","name":"Drag Curl","primary":"biceps","secondary":["forearms"],"equipment":"barbell","category":"strength","pattern":"Isolation"},{"id":"Dumbbell_Alternate_Bicep_Curl","name":"Dumbbell Alternate Bicep Curl","primary":"biceps","secondary":["forearms"],"equipment":"dumbbell","category":"strength","pattern":"Isolation"},{"id":"Dumbbell_Bench_Press","name":"Dumbbell Bench Press","primary":"chest","secondary":["frontDelts","triceps"],"equipment":"dumbbell","category":"strength","pattern":"Horizontal push"},{"id":"Dumbbell_Bench_Press_with_Neutral_Grip","name":"Dumbbell Bench Press with Neutral Grip","primary":"chest","secondary":["frontDelts","triceps"],"equipment":"dumbbell","category":"strength","pattern":"Horizontal push"},{"id":"Dumbbell_Bicep_Curl","name":"Dumbbell Bicep Curl","primary":"biceps","secondary":["forearms"],"equipment":"dumbbell","category":"strength","pattern":"Isolation"},{"id":"Dumbbell_Clean","name":"Dumbbell Clean","primary":"hamstrings","secondary":["calves","forearms","glutes","back","quads","frontDelts","traps"],"equipment":"dumbbell","category":"strength","pattern":"Isolation"},{"id":"Dumbbell_Floor_Press","name":"Dumbbell Floor Press","primary":"triceps","secondary":["chest","frontDelts"],"equipment":"dumbbell","category":"powerlifting","pattern":"Vertical push"},{"id":"Dumbbell_Flyes","name":"Dumbbell Flyes","primary":"chest","secondary":[],"equipment":"dumbbell","category":"strength","pattern":"Isolation"},{"id":"Dumbbell_Incline_Row","name":"Dumbbell Incline Row","primary":"back","secondary":["biceps","forearms","frontDelts"],"equipment":"dumbbell","category":"strength","pattern":"Horizontal pull"},{"id":"Dumbbell_Incline_Shoulder_Raise","name":"Dumbbell Incline Shoulder Raise","primary":"frontDelts","secondary":["triceps"],"equipment":"dumbbell","category":"strength","pattern":"Isolation"},{"id":"Dumbbell_Lunges","name":"Dumbbell Lunges","primary":"quads","secondary":["calves","glutes","hamstrings"],"equipment":"dumbbell","category":"strength","pattern":"Squat / lunge"},{"id":"Dumbbell_Lying_One-Arm_Rear_Lateral_Raise","name":"Dumbbell Lying One-Arm Rear Lateral Raise","primary":"rearDelts","secondary":["back"],"equipment":"dumbbell","category":"strength","pattern":"Isolation"},{"id":"Dumbbell_Lying_Pronation","name":"Dumbbell Lying Pronation","primary":"forearms","secondary":[],"equipment":"dumbbell","category":"strength","pattern":"Isolation"},{"id":"Dumbbell_Lying_Rear_Lateral_Raise","name":"Dumbbell Lying Rear Lateral Raise","primary":"rearDelts","secondary":[],"equipment":"dumbbell","category":"strength","pattern":"Isolation"},{"id":"Dumbbell_Lying_Supination","name":"Dumbbell Lying Supination","primary":"forearms","secondary":[],"equipment":"dumbbell","category":"strength","pattern":"Isolation"},{"id":"Dumbbell_One-Arm_Shoulder_Press","name":"Dumbbell One-Arm Shoulder Press","primary":"frontDelts","secondary":["triceps"],"equipment":"dumbbell","category":"strength","pattern":"Vertical push"},{"id":"Dumbbell_One-Arm_Triceps_Extension","name":"Dumbbell One-Arm Triceps Extension","primary":"triceps","secondary":[],"equipment":"dumbbell","category":"strength","pattern":"Isolation"},{"id":"Dumbbell_One-Arm_Upright_Row","name":"Dumbbell One-Arm Upright Row","primary":"frontDelts","secondary":["biceps","traps"],"equipment":"dumbbell","category":"strength","pattern":"Horizontal pull"},{"id":"Dumbbell_Prone_Incline_Curl","name":"Dumbbell Prone Incline Curl","primary":"biceps","secondary":[],"equipment":"dumbbell","category":"strength","pattern":"Isolation"},{"id":"Dumbbell_Raise","name":"Dumbbell Raise","primary":"frontDelts","secondary":["biceps"],"equipment":"dumbbell","category":"strength","pattern":"Isolation"},{"id":"Dumbbell_Rear_Lunge","name":"Dumbbell Rear Lunge","primary":"quads","secondary":["calves","glutes","hamstrings"],"equipment":"dumbbell","category":"strength","pattern":"Squat / lunge"},{"id":"Dumbbell_Scaption","name":"Dumbbell Scaption","primary":"frontDelts","secondary":["traps"],"equipment":"dumbbell","category":"strength","pattern":"Isolation"},{"id":"Dumbbell_Seated_One-Leg_Calf_Raise","name":"Dumbbell Seated One-Leg Calf Raise","primary":"calves","secondary":[],"equipment":"dumbbell","category":"strength","pattern":"Isolation"},{"id":"Dumbbell_Shoulder_Press","name":"Dumbbell Shoulder Press","primary":"frontDelts","secondary":["triceps"],"equipment":"dumbbell","category":"strength","pattern":"Vertical push"},{"id":"Dumbbell_Shrug","name":"Dumbbell Shrug","primary":"traps","secondary":[],"equipment":"dumbbell","category":"strength","pattern":"Isolation"},{"id":"Dumbbell_Side_Bend","name":"Dumbbell Side Bend","primary":"core","secondary":[],"equipment":"dumbbell","category":"strength","pattern":"Core"},{"id":"Dumbbell_Squat","name":"Dumbbell Squat","primary":"quads","secondary":["calves","glutes","hamstrings","back"],"equipment":"dumbbell","category":"strength","pattern":"Squat / lunge"},{"id":"Dumbbell_Squat_To_A_Bench","name":"Dumbbell Squat To A Bench","primary":"quads","secondary":["calves","glutes","hamstrings","back"],"equipment":"dumbbell","category":"strength","pattern":"Squat / lunge"},{"id":"Dumbbell_Step_Ups","name":"Dumbbell Step Ups","primary":"quads","secondary":["calves","glutes","hamstrings"],"equipment":"dumbbell","category":"strength","pattern":"Squat / lunge"},{"id":"Dumbbell_Tricep_Extension_-Pronated_Grip","name":"Dumbbell Tricep Extension -Pronated Grip","primary":"triceps","secondary":[],"equipment":"dumbbell","category":"strength","pattern":"Isolation"},{"id":"Elbow_to_Knee","name":"Elbow to Knee","primary":"core","secondary":[],"equipment":"body only","category":"strength","pattern":"Core"},{"id":"Elevated_Back_Lunge","name":"Elevated Back Lunge","primary":"quads","secondary":["glutes","hamstrings"],"equipment":"barbell","category":"strength","pattern":"Squat / lunge"},{"id":"Elevated_Cable_Rows","name":"Elevated Cable Rows","primary":"back","secondary":["traps"],"equipment":"cable","category":"strength","pattern":"Horizontal pull"},{"id":"Extended_Range_One-Arm_Kettlebell_Floor_Press","name":"Extended Range One-Arm Kettlebell Floor Press","primary":"chest","secondary":["frontDelts","triceps"],"equipment":"kettlebells","category":"strength","pattern":"Horizontal push"},{"id":"External_Rotation","name":"External Rotation","primary":"frontDelts","secondary":[],"equipment":"dumbbell","category":"strength","pattern":"Isolation"},{"id":"External_Rotation_with_Band","name":"External Rotation with Band","primary":"frontDelts","secondary":[],"equipment":"bands","category":"strength","pattern":"Isolation"},{"id":"External_Rotation_with_Cable","name":"External Rotation with Cable","primary":"frontDelts","secondary":[],"equipment":"cable","category":"strength","pattern":"Isolation"},{"id":"EZ-Bar_Curl","name":"EZ-Bar Curl","primary":"biceps","secondary":[],"equipment":"e-z curl bar","category":"strength","pattern":"Isolation"},{"id":"EZ-Bar_Skullcrusher","name":"EZ-Bar Skullcrusher","primary":"triceps","secondary":["forearms"],"equipment":"e-z curl bar","category":"strength","pattern":"Isolation"},{"id":"Face_Pull","name":"Face Pull","primary":"rearDelts","secondary":["back"],"equipment":"cable","category":"strength","pattern":"Isolation"},{"id":"Finger_Curls","name":"Finger Curls","primary":"forearms","secondary":[],"equipment":"barbell","category":"strength","pattern":"Isolation"},{"id":"Flat_Bench_Cable_Flyes","name":"Flat Bench Cable Flyes","primary":"chest","secondary":[],"equipment":"cable","category":"strength","pattern":"Isolation"},{"id":"Flat_Bench_Leg_Pull-In","name":"Flat Bench Leg Pull-In","primary":"core","secondary":[],"equipment":"body only","category":"strength","pattern":"Core"},{"id":"Flat_Bench_Lying_Leg_Raise","name":"Flat Bench Lying Leg Raise","primary":"core","secondary":[],"equipment":"body only","category":"strength","pattern":"Core"},{"id":"Flexor_Incline_Dumbbell_Curls","name":"Flexor Incline Dumbbell Curls","primary":"biceps","secondary":[],"equipment":"dumbbell","category":"strength","pattern":"Isolation"},{"id":"Floor_Press","name":"Floor Press","primary":"triceps","secondary":["chest","frontDelts"],"equipment":"barbell","category":"powerlifting","pattern":"Vertical push"},{"id":"Floor_Press_with_Chains","name":"Floor Press with Chains","primary":"triceps","secondary":["chest","frontDelts"],"equipment":"barbell","category":"powerlifting","pattern":"Vertical push"},{"id":"Flutter_Kicks","name":"Flutter Kicks","primary":"glutes","secondary":["hamstrings"],"equipment":"body only","category":"strength","pattern":"Isolation"},{"id":"Freehand_Jump_Squat","name":"Freehand Jump Squat","primary":"quads","secondary":["calves","glutes","hamstrings"],"equipment":"body only","category":"strength","pattern":"Squat / lunge"},{"id":"Frog_Sit-Ups","name":"Frog Sit-Ups","primary":"core","secondary":[],"equipment":"body only","category":"strength","pattern":"Core"},{"id":"Front_Barbell_Squat","name":"Front Barbell Squat","primary":"quads","secondary":["calves","glutes","hamstrings"],"equipment":"barbell","category":"strength","pattern":"Squat / lunge"},{"id":"Front_Barbell_Squat_To_A_Bench","name":"Front Barbell Squat To A Bench","primary":"quads","secondary":["calves","glutes","hamstrings"],"equipment":"barbell","category":"strength","pattern":"Squat / lunge"},{"id":"Front_Cable_Raise","name":"Front Cable Raise","primary":"frontDelts","secondary":[],"equipment":"cable","category":"strength","pattern":"Isolation"},{"id":"Front_Dumbbell_Raise","name":"Front Dumbbell Raise","primary":"frontDelts","secondary":[],"equipment":"dumbbell","category":"strength","pattern":"Isolation"},{"id":"Front_Incline_Dumbbell_Raise","name":"Front Incline Dumbbell Raise","primary":"frontDelts","secondary":[],"equipment":"dumbbell","category":"strength","pattern":"Isolation"},{"id":"Front_Raise_And_Pullover","name":"Front Raise And Pullover","primary":"chest","secondary":["back","frontDelts","triceps"],"equipment":"barbell","category":"strength","pattern":"Isolation"},{"id":"Front_Squat_Clean_Grip","name":"Front Squat (Clean Grip)","primary":"quads","secondary":["core","glutes","hamstrings"],"equipment":"barbell","category":"strength","pattern":"Squat / lunge"},{"id":"Front_Squats_With_Two_Kettlebells","name":"Front Squats With Two Kettlebells","primary":"quads","secondary":["calves","glutes"],"equipment":"kettlebells","category":"strength","pattern":"Squat / lunge"},{"id":"Front_Two-Dumbbell_Raise","name":"Front Two-Dumbbell Raise","primary":"frontDelts","secondary":[],"equipment":"dumbbell","category":"strength","pattern":"Isolation"},{"id":"Full_Range-Of-Motion_Lat_Pulldown","name":"Full Range-Of-Motion Lat Pulldown","primary":"back","secondary":["biceps","frontDelts"],"equipment":"cable","category":"strength","pattern":"Vertical pull"},{"id":"Glute_Ham_Raise","name":"Glute Ham Raise","primary":"hamstrings","secondary":["calves","glutes"],"equipment":"machine","category":"powerlifting","pattern":"Isolation"},{"id":"Glute_Kickback","name":"Glute Kickback","primary":"glutes","secondary":["hamstrings"],"equipment":"body only","category":"strength","pattern":"Isolation"},{"id":"Goblet_Squat","name":"Goblet Squat","primary":"quads","secondary":["calves","glutes","hamstrings","frontDelts"],"equipment":"kettlebells","category":"strength","pattern":"Squat / lunge"},{"id":"Good_Morning","name":"Good Morning","primary":"hamstrings","secondary":["core","glutes","back"],"equipment":"barbell","category":"powerlifting","pattern":"Hinge"},{"id":"Good_Morning_off_Pins","name":"Good Morning off Pins","primary":"hamstrings","secondary":["core","glutes","back"],"equipment":"barbell","category":"powerlifting","pattern":"Hinge"},{"id":"Gorilla_Chin_Crunch","name":"Gorilla Chin/Crunch","primary":"core","secondary":["biceps","back"],"equipment":"body only","category":"strength","pattern":"Core"},{"id":"Hack_Squat","name":"Hack Squat","primary":"quads","secondary":["calves","glutes","hamstrings"],"equipment":"machine","category":"strength","pattern":"Squat / lunge"},{"id":"Hammer_Curls","name":"Hammer Curls","primary":"biceps","secondary":[],"equipment":"dumbbell","category":"strength","pattern":"Isolation"},{"id":"Hammer_Grip_Incline_DB_Bench_Press","name":"Hammer Grip Incline DB Bench Press","primary":"chest","secondary":["frontDelts","triceps"],"equipment":"dumbbell","category":"strength","pattern":"Horizontal push"},{"id":"Handstand_Push-Ups","name":"Handstand Push-Ups","primary":"frontDelts","secondary":["triceps"],"equipment":"body only","category":"strength","pattern":"Vertical push"},{"id":"Hanging_Bar_Good_Morning","name":"Hanging Bar Good Morning","primary":"hamstrings","secondary":["core","glutes","back"],"equipment":"barbell","category":"powerlifting","pattern":"Hinge"},{"id":"Hanging_Leg_Raise","name":"Hanging Leg Raise","primary":"core","secondary":[],"equipment":"body only","category":"strength","pattern":"Core"},{"id":"Hanging_Pike","name":"Hanging Pike","primary":"core","secondary":[],"equipment":"body only","category":"strength","pattern":"Core"},{"id":"High_Cable_Curls","name":"High Cable Curls","primary":"biceps","secondary":[],"equipment":"cable","category":"strength","pattern":"Isolation"},{"id":"Hip_Extension_with_Bands","name":"Hip Extension with Bands","primary":"glutes","secondary":["hamstrings"],"equipment":"bands","category":"strength","pattern":"Isolation"},{"id":"Hip_Flexion_with_Band","name":"Hip Flexion with Band","primary":"quads","secondary":[],"equipment":"bands","category":"strength","pattern":"Isolation"},{"id":"Hip_Lift_with_Band","name":"Hip Lift with Band","primary":"glutes","secondary":["calves","hamstrings"],"equipment":"bands","category":"powerlifting","pattern":"Isolation"},{"id":"Hyperextensions_With_No_Hyperextension_Bench","name":"Hyperextensions With No Hyperextension Bench","primary":"back","secondary":["glutes","hamstrings"],"equipment":"body only","category":"strength","pattern":"Isolation"},{"id":"Incline_Barbell_Triceps_Extension","name":"Incline Barbell Triceps Extension","primary":"triceps","secondary":["forearms"],"equipment":"barbell","category":"strength","pattern":"Isolation"},{"id":"Incline_Bench_Pull","name":"Incline Bench Pull","primary":"back","secondary":["frontDelts"],"equipment":"barbell","category":"strength","pattern":"Isolation"},{"id":"Incline_Cable_Chest_Press","name":"Incline Cable Chest Press","primary":"chest","secondary":["frontDelts","triceps"],"equipment":"cable","category":"strength","pattern":"Horizontal push"},{"id":"Incline_Cable_Flye","name":"Incline Cable Flye","primary":"chest","secondary":["frontDelts"],"equipment":"cable","category":"strength","pattern":"Isolation"},{"id":"Incline_Dumbbell_Bench_With_Palms_Facing_In","name":"Incline Dumbbell Bench With Palms Facing In","primary":"chest","secondary":["frontDelts","triceps"],"equipment":"dumbbell","category":"strength","pattern":"Isolation"},{"id":"Incline_Dumbbell_Curl","name":"Incline Dumbbell Curl","primary":"biceps","secondary":[],"equipment":"dumbbell","category":"strength","pattern":"Isolation"},{"id":"Incline_Dumbbell_Flyes","name":"Incline Dumbbell Flyes","primary":"chest","secondary":["frontDelts"],"equipment":"dumbbell","category":"strength","pattern":"Isolation"},{"id":"Incline_Dumbbell_Flyes_-_With_A_Twist","name":"Incline Dumbbell Flyes - With A Twist","primary":"chest","secondary":["frontDelts"],"equipment":"dumbbell","category":"strength","pattern":"Isolation"},{"id":"Incline_Dumbbell_Press","name":"Incline Dumbbell Press","primary":"chest","secondary":["frontDelts","triceps"],"equipment":"dumbbell","category":"strength","pattern":"Horizontal push"},{"id":"Incline_Hammer_Curls","name":"Incline Hammer Curls","primary":"biceps","secondary":[],"equipment":"dumbbell","category":"strength","pattern":"Isolation"},{"id":"Incline_Inner_Biceps_Curl","name":"Incline Inner Biceps Curl","primary":"biceps","secondary":[],"equipment":"dumbbell","category":"strength","pattern":"Isolation"},{"id":"Incline_Push-Up","name":"Incline Push-Up","primary":"chest","secondary":["frontDelts","triceps"],"equipment":"body only","category":"strength","pattern":"Horizontal push"},{"id":"Incline_Push-Up_Close-Grip","name":"Incline Push-Up Close-Grip","primary":"triceps","secondary":["chest","frontDelts"],"equipment":"body only","category":"strength","pattern":"Vertical push"},{"id":"Incline_Push-Up_Medium","name":"Incline Push-Up Medium","primary":"chest","secondary":["core","frontDelts","triceps"],"equipment":"body only","category":"strength","pattern":"Horizontal push"},{"id":"Incline_Push-Up_Reverse_Grip","name":"Incline Push-Up Reverse Grip","primary":"chest","secondary":["core","frontDelts","triceps"],"equipment":"body only","category":"strength","pattern":"Horizontal push"},{"id":"Incline_Push-Up_Wide","name":"Incline Push-Up Wide","primary":"chest","secondary":["core","frontDelts","triceps"],"equipment":"body only","category":"strength","pattern":"Horizontal push"},{"id":"Internal_Rotation_with_Band","name":"Internal Rotation with Band","primary":"frontDelts","secondary":[],"equipment":"bands","category":"strength","pattern":"Isolation"},{"id":"Iron_Cross","name":"Iron Cross","primary":"frontDelts","secondary":["chest","glutes","hamstrings","back","quads","traps"],"equipment":"dumbbell","category":"strength","pattern":"Isolation"},{"id":"Isometric_Wipers","name":"Isometric Wipers","primary":"chest","secondary":["core","frontDelts","triceps"],"equipment":"body only","category":"strength","pattern":"Isolation"},{"id":"Jackknife_Sit-Up","name":"Jackknife Sit-Up","primary":"core","secondary":[],"equipment":"body only","category":"strength","pattern":"Core"},{"id":"Janda_Sit-Up","name":"Janda Sit-Up","primary":"core","secondary":[],"equipment":"body only","category":"strength","pattern":"Core"},{"id":"Jefferson_Squats","name":"Jefferson Squats","primary":"quads","secondary":["calves","glutes","hamstrings","back","traps"],"equipment":"barbell","category":"strength","pattern":"Squat / lunge"},{"id":"JM_Press","name":"JM Press","primary":"triceps","secondary":["chest","frontDelts"],"equipment":"barbell","category":"strength","pattern":"Vertical push"},{"id":"Kettlebell_Arnold_Press","name":"Kettlebell Arnold Press","primary":"frontDelts","secondary":["triceps"],"equipment":"kettlebells","category":"strength","pattern":"Vertical push"},{"id":"Kettlebell_Dead_Clean","name":"Kettlebell Dead Clean","primary":"hamstrings","secondary":["calves","glutes","back","quads","traps"],"equipment":"kettlebells","category":"strength","pattern":"Isolation"},{"id":"Kettlebell_Figure_8","name":"Kettlebell Figure 8","primary":"core","secondary":["hamstrings","frontDelts"],"equipment":"kettlebells","category":"strength","pattern":"Core"},{"id":"Kettlebell_Halo","name":"Kettlebell Halo","primary":"frontDelts","secondary":["traps","back","core","triceps"],"equipment":"kettlebells","category":"strength","pattern":"Isolation"},{"id":"Kettlebell_Halo_With_Overhead_Extension","name":"Kettlebell Halo with Overhead Extension","primary":"frontDelts","secondary":["triceps","traps","back","core"],"equipment":"kettlebells","category":"strength","pattern":"Isolation"},{"id":"Kettlebell_Hang_Clean","name":"Kettlebell Hang Clean","primary":"hamstrings","secondary":["calves","glutes","back","frontDelts","traps"],"equipment":"kettlebells","category":"strength","pattern":"Isolation"},{"id":"Kettlebell_One-Legged_Deadlift","name":"Kettlebell One-Legged Deadlift","primary":"hamstrings","secondary":["glutes","back"],"equipment":"kettlebells","category":"strength","pattern":"Hinge"},{"id":"Kettlebell_Overhead_Triceps_Extension","name":"Kettlebell Overhead Triceps Extension","primary":"triceps","secondary":["frontDelts","core"],"equipment":"kettlebells","category":"strength","pattern":"Isolation"},{"id":"Kettlebell_Pass_Between_The_Legs","name":"Kettlebell Pass Between The Legs","primary":"core","secondary":["glutes","hamstrings","frontDelts"],"equipment":"kettlebells","category":"strength","pattern":"Core"},{"id":"Kettlebell_Pirate_Ships","name":"Kettlebell Pirate Ships","primary":"frontDelts","secondary":["core"],"equipment":"kettlebells","category":"strength","pattern":"Isolation"},{"id":"Kettlebell_Pistol_Squat","name":"Kettlebell Pistol Squat","primary":"quads","secondary":["calves","glutes","hamstrings","frontDelts"],"equipment":"kettlebells","category":"strength","pattern":"Squat / lunge"},{"id":"Kettlebell_Seated_Press","name":"Kettlebell Seated Press","primary":"frontDelts","secondary":["triceps"],"equipment":"kettlebells","category":"strength","pattern":"Vertical push"},{"id":"Kettlebell_Seesaw_Press","name":"Kettlebell Seesaw Press","primary":"frontDelts","secondary":["triceps"],"equipment":"kettlebells","category":"strength","pattern":"Vertical push"},{"id":"Kettlebell_Sumo_High_Pull","name":"Kettlebell Sumo High Pull","primary":"traps","secondary":["quads","glutes","hamstrings","frontDelts"],"equipment":"kettlebells","category":"strength","pattern":"Isolation"},{"id":"Kettlebell_Thruster","name":"Kettlebell Thruster","primary":"frontDelts","secondary":["quads","triceps"],"equipment":"kettlebells","category":"strength","pattern":"Isolation"},{"id":"Kettlebell_Windmill","name":"Kettlebell Windmill","primary":"core","secondary":["glutes","hamstrings","frontDelts","triceps"],"equipment":"kettlebells","category":"strength","pattern":"Core"},{"id":"Kneeling_Cable_Triceps_Extension","name":"Kneeling Cable Triceps Extension","primary":"triceps","secondary":[],"equipment":"cable","category":"strength","pattern":"Isolation"},{"id":"Kneeling_High_Pulley_Row","name":"Kneeling High Pulley Row","primary":"back","secondary":["biceps"],"equipment":"cable","category":"strength","pattern":"Horizontal pull"},{"id":"Kneeling_Single-Arm_High_Pulley_Row","name":"Kneeling Single-Arm High Pulley Row","primary":"back","secondary":["biceps"],"equipment":"cable","category":"strength","pattern":"Horizontal pull"},{"id":"Kneeling_Squat","name":"Kneeling Squat","primary":"glutes","secondary":["core","hamstrings","back"],"equipment":"barbell","category":"powerlifting","pattern":"Squat / lunge"},{"id":"Lateral_Raise_-_With_Bands","name":"Lateral Raise - With Bands","primary":"sideDelts","secondary":[],"equipment":"bands","category":"strength","pattern":"Isolation"},{"id":"Leg_Extensions","name":"Leg Extensions","primary":"quads","secondary":[],"equipment":"machine","category":"strength","pattern":"Isolation"},{"id":"Leg_Lift","name":"Leg Lift","primary":"glutes","secondary":["hamstrings"],"equipment":"body only","category":"strength","pattern":"Isolation"},{"id":"Leg_Press","name":"Leg Press","primary":"quads","secondary":["calves","glutes","hamstrings"],"equipment":"machine","category":"strength","pattern":"Squat / lunge"},{"id":"Leg-Over_Floor_Press","name":"Leg-Over Floor Press","primary":"chest","secondary":["frontDelts","triceps"],"equipment":"kettlebells","category":"strength","pattern":"Horizontal push"},{"id":"Leverage_Chest_Press","name":"Leverage Chest Press","primary":"chest","secondary":["frontDelts","triceps"],"equipment":"machine","category":"strength","pattern":"Horizontal push"},{"id":"Leverage_Deadlift","name":"Leverage Deadlift","primary":"quads","secondary":["glutes","hamstrings"],"equipment":"machine","category":"strength","pattern":"Hinge"},{"id":"Leverage_Decline_Chest_Press","name":"Leverage Decline Chest Press","primary":"chest","secondary":["frontDelts","triceps"],"equipment":"machine","category":"strength","pattern":"Horizontal push"},{"id":"Leverage_High_Row","name":"Leverage High Row","primary":"back","secondary":[],"equipment":"machine","category":"strength","pattern":"Horizontal pull"},{"id":"Leverage_Incline_Chest_Press","name":"Leverage Incline Chest Press","primary":"chest","secondary":["frontDelts","triceps"],"equipment":"machine","category":"strength","pattern":"Horizontal push"},{"id":"Leverage_Iso_Row","name":"Leverage Iso Row","primary":"back","secondary":["biceps"],"equipment":"machine","category":"strength","pattern":"Horizontal pull"},{"id":"Leverage_Shrug","name":"Leverage Shrug","primary":"traps","secondary":["forearms"],"equipment":"machine","category":"strength","pattern":"Isolation"},{"id":"Low_Cable_Crossover","name":"Low Cable Crossover","primary":"chest","secondary":["frontDelts"],"equipment":"cable","category":"strength","pattern":"Isolation"},{"id":"Low_Cable_Triceps_Extension","name":"Low Cable Triceps Extension","primary":"triceps","secondary":[],"equipment":"cable","category":"strength","pattern":"Isolation"},{"id":"Lunge_Pass_Through","name":"Lunge Pass Through","primary":"hamstrings","secondary":["calves","glutes","quads"],"equipment":"kettlebells","category":"strength","pattern":"Squat / lunge"},{"id":"Lunge_Sprint","name":"Lunge Sprint","primary":"quads","secondary":["calves","glutes","hamstrings"],"equipment":"machine","category":"strength","pattern":"Squat / lunge"},{"id":"Lying_Cable_Curl","name":"Lying Cable Curl","primary":"biceps","secondary":[],"equipment":"cable","category":"strength","pattern":"Isolation"},{"id":"Lying_Cambered_Barbell_Row","name":"Lying Cambered Barbell Row","primary":"back","secondary":["biceps","traps"],"equipment":"barbell","category":"strength","pattern":"Horizontal pull"},{"id":"Lying_Close-Grip_Bar_Curl_On_High_Pulley","name":"Lying Close-Grip Bar Curl On High Pulley","primary":"biceps","secondary":[],"equipment":"cable","category":"strength","pattern":"Isolation"},{"id":"Lying_Close-Grip_Barbell_Triceps_Extension_Behind_The_Head","name":"Lying Close-Grip Barbell Triceps Extension Behind The Head","primary":"triceps","secondary":[],"equipment":"barbell","category":"strength","pattern":"Isolation"},{"id":"Lying_Close-Grip_Barbell_Triceps_Press_To_Chin","name":"Lying Close-Grip Barbell Triceps Press To Chin","primary":"triceps","secondary":[],"equipment":"e-z curl bar","category":"strength","pattern":"Vertical push"},{"id":"Lying_Dumbbell_Tricep_Extension","name":"Lying Dumbbell Tricep Extension","primary":"triceps","secondary":["chest","frontDelts"],"equipment":"dumbbell","category":"strength","pattern":"Isolation"},{"id":"Lying_High_Bench_Barbell_Curl","name":"Lying High Bench Barbell Curl","primary":"biceps","secondary":[],"equipment":"barbell","category":"strength","pattern":"Isolation"},{"id":"Lying_Leg_Curls","name":"Lying Leg Curls","primary":"hamstrings","secondary":[],"equipment":"machine","category":"strength","pattern":"Isolation"},{"id":"Lying_Machine_Squat","name":"Lying Machine Squat","primary":"quads","secondary":["calves","glutes","hamstrings"],"equipment":"machine","category":"strength","pattern":"Squat / lunge"},{"id":"Lying_One-Arm_Lateral_Raise","name":"Lying One-Arm Lateral Raise","primary":"sideDelts","secondary":[],"equipment":"dumbbell","category":"strength","pattern":"Isolation"},{"id":"Lying_Rear_Delt_Raise","name":"Lying Rear Delt Raise","primary":"rearDelts","secondary":[],"equipment":"dumbbell","category":"strength","pattern":"Isolation"},{"id":"Lying_Supine_Dumbbell_Curl","name":"Lying Supine Dumbbell Curl","primary":"biceps","secondary":[],"equipment":"dumbbell","category":"strength","pattern":"Isolation"},{"id":"Lying_T-Bar_Row","name":"Lying T-Bar Row","primary":"back","secondary":["biceps"],"equipment":"machine","category":"strength","pattern":"Horizontal pull"},{"id":"Lying_Triceps_Press","name":"Lying Triceps Press","primary":"triceps","secondary":[],"equipment":"e-z curl bar","category":"strength","pattern":"Vertical push"},{"id":"Machine_Bicep_Curl","name":"Machine Bicep Curl","primary":"biceps","secondary":[],"equipment":"machine","category":"strength","pattern":"Isolation"},{"id":"Machine_Preacher_Curls","name":"Machine Preacher Curls","primary":"biceps","secondary":[],"equipment":"machine","category":"strength","pattern":"Isolation"},{"id":"Machine_Triceps_Extension","name":"Machine Triceps Extension","primary":"triceps","secondary":[],"equipment":"machine","category":"strength","pattern":"Isolation"},{"id":"Middle_Back_Shrug","name":"Middle Back Shrug","primary":"back","secondary":[],"equipment":"dumbbell","category":"strength","pattern":"Isolation"},{"id":"Monster_Walk","name":"Monster Walk","primary":"glutes","secondary":[],"equipment":"bands","category":"strength","pattern":"Isolation"},{"id":"Narrow_Stance_Hack_Squats","name":"Narrow Stance Hack Squats","primary":"quads","secondary":["calves","glutes","hamstrings"],"equipment":"machine","category":"strength","pattern":"Squat / lunge"},{"id":"Narrow_Stance_Leg_Press","name":"Narrow Stance Leg Press","primary":"quads","secondary":["calves","glutes","hamstrings"],"equipment":"machine","category":"strength","pattern":"Squat / lunge"},{"id":"Narrow_Stance_Squats","name":"Narrow Stance Squats","primary":"quads","secondary":["calves","glutes","hamstrings","back"],"equipment":"barbell","category":"strength","pattern":"Squat / lunge"},{"id":"Natural_Glute_Ham_Raise","name":"Natural Glute Ham Raise","primary":"hamstrings","secondary":["calves","glutes","back"],"equipment":"body only","category":"strength","pattern":"Isolation"},{"id":"One_Arm_Dumbbell_Preacher_Curl","name":"One Arm Dumbbell Preacher Curl","primary":"biceps","secondary":[],"equipment":"dumbbell","category":"strength","pattern":"Isolation"},{"id":"One_Arm_Floor_Press","name":"One Arm Floor Press","primary":"triceps","secondary":["chest","frontDelts"],"equipment":"barbell","category":"strength","pattern":"Vertical push"},{"id":"One_Arm_Lat_Pulldown","name":"One Arm Lat Pulldown","primary":"back","secondary":["biceps"],"equipment":"cable","category":"strength","pattern":"Vertical pull"},{"id":"One_Arm_Pronated_Dumbbell_Triceps_Extension","name":"One Arm Pronated Dumbbell Triceps Extension","primary":"triceps","secondary":[],"equipment":"dumbbell","category":"strength","pattern":"Isolation"},{"id":"One_Arm_Supinated_Dumbbell_Triceps_Extension","name":"One Arm Supinated Dumbbell Triceps Extension","primary":"triceps","secondary":[],"equipment":"dumbbell","category":"strength","pattern":"Isolation"},{"id":"One-Arm_Dumbbell_Row","name":"One-Arm Dumbbell Row","primary":"back","secondary":["biceps","frontDelts"],"equipment":"dumbbell","category":"strength","pattern":"Horizontal pull"},{"id":"One-Arm_Incline_Lateral_Raise","name":"One-Arm Incline Lateral Raise","primary":"sideDelts","secondary":[],"equipment":"dumbbell","category":"strength","pattern":"Isolation"},{"id":"One-Arm_Kettlebell_Clean","name":"One-Arm Kettlebell Clean","primary":"hamstrings","secondary":["glutes","back","frontDelts","traps"],"equipment":"kettlebells","category":"strength","pattern":"Isolation"},{"id":"One-Arm_Kettlebell_Row","name":"One-Arm Kettlebell Row","primary":"back","secondary":["biceps"],"equipment":"kettlebells","category":"strength","pattern":"Horizontal pull"},{"id":"One-Arm_Kettlebell_Swings","name":"One-Arm Kettlebell Swings","primary":"hamstrings","secondary":["calves","glutes","back","frontDelts"],"equipment":"kettlebells","category":"strength","pattern":"Hinge"},{"id":"One-Arm_Long_Bar_Row","name":"One-Arm Long Bar Row","primary":"back","secondary":["biceps"],"equipment":"barbell","category":"strength","pattern":"Horizontal pull"},{"id":"One-Arm_Open_Palm_Kettlebell_Clean","name":"One-Arm Open Palm Kettlebell Clean","primary":"hamstrings","secondary":["forearms","glutes","back","quads","frontDelts"],"equipment":"kettlebells","category":"strength","pattern":"Isolation"},{"id":"One-Arm_Overhead_Kettlebell_Squats","name":"One-Arm Overhead Kettlebell Squats","primary":"quads","secondary":["calves","glutes","hamstrings","frontDelts"],"equipment":"kettlebells","category":"strength","pattern":"Squat / lunge"},{"id":"One-Arm_Side_Laterals","name":"One-Arm Side Laterals","primary":"sideDelts","secondary":[],"equipment":"dumbbell","category":"strength","pattern":"Isolation"},{"id":"One-Legged_Cable_Kickback","name":"One-Legged Cable Kickback","primary":"glutes","secondary":["hamstrings"],"equipment":"cable","category":"strength","pattern":"Isolation"},{"id":"Open_Palm_Kettlebell_Clean","name":"Open Palm Kettlebell Clean","primary":"hamstrings","secondary":["glutes","back","quads","frontDelts"],"equipment":"kettlebells","category":"strength","pattern":"Isolation"},{"id":"Overhead_Cable_Curl","name":"Overhead Cable Curl","primary":"biceps","secondary":[],"equipment":"cable","category":"strength","pattern":"Isolation"},{"id":"Palms-Down_Dumbbell_Wrist_Curl_Over_A_Bench","name":"Palms-Down Dumbbell Wrist Curl Over A Bench","primary":"forearms","secondary":[],"equipment":"dumbbell","category":"strength","pattern":"Isolation"},{"id":"Palms-Down_Wrist_Curl_Over_A_Bench","name":"Palms-Down Wrist Curl Over A Bench","primary":"forearms","secondary":[],"equipment":"barbell","category":"strength","pattern":"Isolation"},{"id":"Palms-Up_Barbell_Wrist_Curl_Over_A_Bench","name":"Palms-Up Barbell Wrist Curl Over A Bench","primary":"forearms","secondary":[],"equipment":"barbell","category":"strength","pattern":"Isolation"},{"id":"Palms-Up_Dumbbell_Wrist_Curl_Over_A_Bench","name":"Palms-Up Dumbbell Wrist Curl Over A Bench","primary":"forearms","secondary":[],"equipment":"dumbbell","category":"strength","pattern":"Isolation"},{"id":"Pin_Presses","name":"Pin Presses","primary":"triceps","secondary":["chest","forearms","back","frontDelts"],"equipment":"barbell","category":"powerlifting","pattern":"Vertical push"},{"id":"Power_Clean","name":"Power Clean","primary":"hamstrings","secondary":["calves","forearms","glutes","back","quads","frontDelts","traps","triceps"],"equipment":"barbell","category":"strength","pattern":"Isolation"},{"id":"Preacher_Curl","name":"Preacher Curl","primary":"biceps","secondary":[],"equipment":"barbell","category":"strength","pattern":"Isolation"},{"id":"Preacher_Hammer_Dumbbell_Curl","name":"Preacher Hammer Dumbbell Curl","primary":"biceps","secondary":["forearms"],"equipment":"dumbbell","category":"strength","pattern":"Isolation"},{"id":"Pull_Through","name":"Pull Through","primary":"glutes","secondary":["hamstrings","back"],"equipment":"cable","category":"strength","pattern":"Hinge"},{"id":"Pullups","name":"Pullups","primary":"back","secondary":["biceps"],"equipment":"body only","category":"strength","pattern":"Isolation"},{"id":"Rack_Pull_with_Bands","name":"Rack Pull with Bands","primary":"back","secondary":["forearms","glutes","hamstrings","quads","traps"],"equipment":"barbell","category":"powerlifting","pattern":"Isolation"},{"id":"Rack_Pulls","name":"Rack Pulls","primary":"back","secondary":["forearms","glutes","hamstrings","traps"],"equipment":"barbell","category":"powerlifting","pattern":"Isolation"},{"id":"Reverse_Band_Deadlift","name":"Reverse Band Deadlift","primary":"back","secondary":["glutes","quads","calves","hamstrings"],"equipment":"barbell","category":"powerlifting","pattern":"Hinge"},{"id":"Reverse_Band_Sumo_Deadlift","name":"Reverse Band Sumo Deadlift","primary":"hamstrings","secondary":["glutes","quads","calves","forearms","back","traps"],"equipment":"barbell","category":"powerlifting","pattern":"Hinge"},{"id":"Reverse_Barbell_Curl","name":"Reverse Barbell Curl","primary":"biceps","secondary":["forearms"],"equipment":"barbell","category":"strength","pattern":"Isolation"},{"id":"Reverse_Barbell_Preacher_Curls","name":"Reverse Barbell Preacher Curls","primary":"biceps","secondary":["forearms"],"equipment":"e-z curl bar","category":"strength","pattern":"Isolation"},{"id":"Reverse_Cable_Curl","name":"Reverse Cable Curl","primary":"biceps","secondary":["forearms"],"equipment":"cable","category":"strength","pattern":"Isolation"},{"id":"Reverse_Flyes","name":"Reverse Flyes","primary":"rearDelts","secondary":[],"equipment":"dumbbell","category":"strength","pattern":"Isolation"},{"id":"Reverse_Flyes_With_External_Rotation","name":"Reverse Flyes With External Rotation","primary":"rearDelts","secondary":[],"equipment":"dumbbell","category":"strength","pattern":"Isolation"},{"id":"Reverse_Grip_Bent-Over_Rows","name":"Reverse Grip Bent-Over Rows","primary":"back","secondary":["biceps","frontDelts"],"equipment":"barbell","category":"strength","pattern":"Horizontal pull"},{"id":"Reverse_Hyperextension","name":"Reverse Hyperextension","primary":"hamstrings","secondary":["calves","glutes"],"equipment":"machine","category":"strength","pattern":"Isolation"},{"id":"Rocking_Standing_Calf_Raise","name":"Rocking Standing Calf Raise","primary":"calves","secondary":[],"equipment":"barbell","category":"strength","pattern":"Isolation"},{"id":"Romanian_Deadlift","name":"Romanian Deadlift","primary":"hamstrings","secondary":["calves","glutes","back"],"equipment":"barbell","category":"strength","pattern":"Hinge"},{"id":"Rope_Straight-Arm_Pulldown","name":"Rope Straight-Arm Pulldown","primary":"back","secondary":[],"equipment":"cable","category":"strength","pattern":"Vertical pull"},{"id":"Seated_Bent-Over_Rear_Delt_Raise","name":"Seated Bent-Over Rear Delt Raise","primary":"rearDelts","secondary":[],"equipment":"dumbbell","category":"strength","pattern":"Isolation"},{"id":"Seated_Cable_Rows","name":"Seated Cable Rows","primary":"back","secondary":["biceps","frontDelts"],"equipment":"cable","category":"strength","pattern":"Horizontal pull"},{"id":"Seated_Calf_Raise","name":"Seated Calf Raise","primary":"calves","secondary":[],"equipment":"machine","category":"strength","pattern":"Isolation"},{"id":"Seated_Close-Grip_Concentration_Barbell_Curl","name":"Seated Close-Grip Concentration Barbell Curl","primary":"biceps","secondary":[],"equipment":"barbell","category":"strength","pattern":"Isolation"},{"id":"Seated_Dumbbell_Curl","name":"Seated Dumbbell Curl","primary":"biceps","secondary":[],"equipment":"dumbbell","category":"strength","pattern":"Isolation"},{"id":"Seated_Dumbbell_Inner_Biceps_Curl","name":"Seated Dumbbell Inner Biceps Curl","primary":"biceps","secondary":[],"equipment":"dumbbell","category":"strength","pattern":"Isolation"},{"id":"Seated_Dumbbell_Palms-Down_Wrist_Curl","name":"Seated Dumbbell Palms-Down Wrist Curl","primary":"forearms","secondary":[],"equipment":"dumbbell","category":"strength","pattern":"Isolation"},{"id":"Seated_Dumbbell_Palms-Up_Wrist_Curl","name":"Seated Dumbbell Palms-Up Wrist Curl","primary":"forearms","secondary":[],"equipment":"dumbbell","category":"strength","pattern":"Isolation"},{"id":"Seated_Good_Mornings","name":"Seated Good Mornings","primary":"back","secondary":["glutes"],"equipment":"barbell","category":"powerlifting","pattern":"Hinge"},{"id":"Seated_Leg_Curl","name":"Seated Leg Curl","primary":"hamstrings","secondary":[],"equipment":"machine","category":"strength","pattern":"Isolation"},{"id":"Seated_One-arm_Cable_Pulley_Rows","name":"Seated One-arm Cable Pulley Rows","primary":"back","secondary":["biceps","traps"],"equipment":"cable","category":"strength","pattern":"Horizontal pull"},{"id":"Seated_One-Arm_Dumbbell_Palms-Down_Wrist_Curl","name":"Seated One-Arm Dumbbell Palms-Down Wrist Curl","primary":"forearms","secondary":[],"equipment":"dumbbell","category":"strength","pattern":"Isolation"},{"id":"Seated_One-Arm_Dumbbell_Palms-Up_Wrist_Curl","name":"Seated One-Arm Dumbbell Palms-Up Wrist Curl","primary":"forearms","secondary":[],"equipment":"dumbbell","category":"strength","pattern":"Isolation"},{"id":"Seated_Palm-Up_Barbell_Wrist_Curl","name":"Seated Palm-Up Barbell Wrist Curl","primary":"forearms","secondary":[],"equipment":"barbell","category":"strength","pattern":"Isolation"},{"id":"Seated_Palms-Down_Barbell_Wrist_Curl","name":"Seated Palms-Down Barbell Wrist Curl","primary":"forearms","secondary":[],"equipment":"barbell","category":"strength","pattern":"Isolation"},{"id":"Seated_Side_Lateral_Raise","name":"Seated Side Lateral Raise","primary":"sideDelts","secondary":[],"equipment":"dumbbell","category":"strength","pattern":"Isolation"},{"id":"Seated_Two-Arm_Palms-Up_Low-Pulley_Wrist_Curl","name":"Seated Two-Arm Palms-Up Low-Pulley Wrist Curl","primary":"forearms","secondary":[],"equipment":"cable","category":"strength","pattern":"Isolation"},{"id":"Shotgun_Row","name":"Shotgun Row","primary":"back","secondary":["biceps"],"equipment":"cable","category":"strength","pattern":"Horizontal pull"},{"id":"Side_Lateral_Raise","name":"Side Lateral Raise","primary":"sideDelts","secondary":[],"equipment":"dumbbell","category":"strength","pattern":"Isolation"},{"id":"Side_Laterals_to_Front_Raise","name":"Side Laterals to Front Raise","primary":"sideDelts","secondary":["traps"],"equipment":"dumbbell","category":"strength","pattern":"Isolation"},{"id":"Single_Leg_Glute_Bridge","name":"Single Leg Glute Bridge","primary":"glutes","secondary":["hamstrings"],"equipment":"body only","category":"strength","pattern":"Isolation"},{"id":"Smith_Machine_Behind_the_Back_Shrug","name":"Smith Machine Behind the Back Shrug","primary":"traps","secondary":["frontDelts"],"equipment":"machine","category":"strength","pattern":"Isolation"},{"id":"Smith_Machine_Calf_Raise","name":"Smith Machine Calf Raise","primary":"calves","secondary":[],"equipment":"machine","category":"strength","pattern":"Isolation"},{"id":"Smith_Machine_Hang_Power_Clean","name":"Smith Machine Hang Power Clean","primary":"hamstrings","secondary":["glutes","back","quads","frontDelts","traps"],"equipment":"machine","category":"strength","pattern":"Isolation"},{"id":"Smith_Machine_Reverse_Calf_Raises","name":"Smith Machine Reverse Calf Raises","primary":"calves","secondary":[],"equipment":"machine","category":"strength","pattern":"Isolation"},{"id":"Smith_Machine_Stiff-Legged_Deadlift","name":"Smith Machine Stiff-Legged Deadlift","primary":"hamstrings","secondary":["glutes","back"],"equipment":"machine","category":"strength","pattern":"Hinge"},{"id":"Smith_Machine_Upright_Row","name":"Smith Machine Upright Row","primary":"traps","secondary":["biceps","back","frontDelts"],"equipment":"machine","category":"strength","pattern":"Horizontal pull"},{"id":"Snatch_Pull","name":"Snatch Pull","primary":"hamstrings","secondary":["calves","glutes","back","quads","traps"],"equipment":"barbell","category":"strength","pattern":"Isolation"},{"id":"Spider_Curl","name":"Spider Curl","primary":"biceps","secondary":[],"equipment":"e-z curl bar","category":"strength","pattern":"Isolation"},{"id":"Standing_Barbell_Calf_Raise","name":"Standing Barbell Calf Raise","primary":"calves","secondary":[],"equipment":"barbell","category":"strength","pattern":"Isolation"},{"id":"Standing_Biceps_Cable_Curl","name":"Standing Biceps Cable Curl","primary":"biceps","secondary":[],"equipment":"cable","category":"strength","pattern":"Isolation"},{"id":"Standing_Calf_Raises","name":"Standing Calf Raises","primary":"calves","secondary":[],"equipment":"machine","category":"strength","pattern":"Isolation"},{"id":"Standing_Concentration_Curl","name":"Standing Concentration Curl","primary":"biceps","secondary":["forearms"],"equipment":"dumbbell","category":"strength","pattern":"Isolation"},{"id":"Standing_Dumbbell_Calf_Raise","name":"Standing Dumbbell Calf Raise","primary":"calves","secondary":[],"equipment":"dumbbell","category":"strength","pattern":"Isolation"},{"id":"Standing_Dumbbell_Reverse_Curl","name":"Standing Dumbbell Reverse Curl","primary":"biceps","secondary":["forearms"],"equipment":"dumbbell","category":"strength","pattern":"Isolation"},{"id":"Standing_Dumbbell_Upright_Row","name":"Standing Dumbbell Upright Row","primary":"traps","secondary":["biceps","frontDelts"],"equipment":"dumbbell","category":"strength","pattern":"Horizontal pull"},{"id":"Standing_Leg_Curl","name":"Standing Leg Curl","primary":"hamstrings","secondary":[],"equipment":"machine","category":"strength","pattern":"Isolation"},{"id":"Standing_Palms-Up_Barbell_Behind_The_Back_Wrist_Curl","name":"Standing Palms-Up Barbell Behind The Back Wrist Curl","primary":"forearms","secondary":[],"equipment":"barbell","category":"strength","pattern":"Isolation"},{"id":"Step-up_with_Knee_Raise","name":"Step-up with Knee Raise","primary":"glutes","secondary":["hamstrings","quads"],"equipment":"body only","category":"strength","pattern":"Squat / lunge"},{"id":"Stiff-Legged_Barbell_Deadlift","name":"Stiff-Legged Barbell Deadlift","primary":"hamstrings","secondary":["glutes","back"],"equipment":"barbell","category":"strength","pattern":"Hinge"},{"id":"Stiff-Legged_Dumbbell_Deadlift","name":"Stiff-Legged Dumbbell Deadlift","primary":"hamstrings","secondary":["glutes","back"],"equipment":"dumbbell","category":"strength","pattern":"Hinge"},{"id":"Sumo_Deadlift","name":"Sumo Deadlift","primary":"hamstrings","secondary":["quads","forearms","glutes","back","traps"],"equipment":"barbell","category":"powerlifting","pattern":"Hinge"},{"id":"Sumo_Deadlift_with_Bands","name":"Sumo Deadlift with Bands","primary":"hamstrings","secondary":["quads","forearms","glutes","back","traps"],"equipment":"barbell","category":"powerlifting","pattern":"Hinge"},{"id":"Sumo_Deadlift_with_Chains","name":"Sumo Deadlift with Chains","primary":"hamstrings","secondary":["glutes","quads","forearms","back","traps"],"equipment":"barbell","category":"powerlifting","pattern":"Hinge"},{"id":"Thigh_Abductor","name":"Thigh Abductor","primary":"glutes","secondary":[],"equipment":"machine","category":"strength","pattern":"Isolation"},{"id":"Upright_Cable_Row","name":"Upright Cable Row","primary":"traps","secondary":["frontDelts"],"equipment":"cable","category":"strength","pattern":"Horizontal pull"},{"id":"Upright_Row_-_With_Bands","name":"Upright Row - With Bands","primary":"traps","secondary":["frontDelts"],"equipment":"bands","category":"strength","pattern":"Horizontal pull"},{"id":"Wrist_Rotations_with_Straight_Bar","name":"Wrist Rotations with Straight Bar","primary":"forearms","secondary":[],"equipment":"barbell","category":"strength","pattern":"Isolation"}];
/* CATALOG END */
const MUSCLES={chest:'Chest',back:'Back',sideDelts:'Side delts',rearDelts:'Rear delts',frontDelts:'Front delts',biceps:'Biceps',triceps:'Triceps',quads:'Quads',hamstrings:'Hamstrings',glutes:'Glutes',calves:'Calves',core:'Core',traps:'Traps',forearms:'Forearms'};
let liftSelection=null,restUntil=0,liftQueue=[];
function trainingWeek(k=todayKey()){
  const start=addDays(k,-((parseKey(k).getDay()+6)%7));
  return Array.from({length:7},(_,i)=>addDays(start,i));
}
function exerciseRows(){return Object.keys(state.days).sort().reverse().flatMap(k=>(state.days[k].exercise||[]).slice().reverse().sort((a,b)=>String(b.finishedAt||b.at||'').localeCompare(String(a.finishedAt||a.at||''))).map(x=>({k,x})));}
function completedSets(id){return exerciseRows().flatMap(({k,x})=>(x.exercises||[]).filter(e=>!id||e.exerciseId===id).flatMap(e=>(e.sets||[]).map(s=>({k,x,e,s}))));}
function lastExerciseSets(id){const rows=exerciseRows().filter(({x})=>x.schemaVersion===2&&x.completed&&(x.exercises||[]).some(e=>e.exerciseId===id)).sort((a,b)=>b.k.localeCompare(a.k)||String(b.x.finishedAt||b.x.at).localeCompare(String(a.x.finishedAt||a.x.at)));return rows[0]?.x.exercises.find(e=>e.exerciseId===id)?.sets||[];}
function estimateMax(s){return s.kg>0&&s.reps>=1&&s.reps<=12?(s.reps===1?s.kg:s.kg*(1+s.reps/30)):0;}
function activeWorkout(k){return (day(k).exercise||[]).find(x=>x.schemaVersion===2&&!x.completed);}
function syncExerciseHabit(k){
  const d=day(k),h=state.habits.find(x=>!x.archived&&(x.section==='move'||/exerc|train|workout/i.test(x.name)));
  if(h){const total=d.exercise.reduce((a,x)=>a+(x.minutes||0),0);d.entries[h.id]={done:total>=(h.target||1),value:total,at:nowISO()};}
}
function addWorkoutSet(id,reps,kg,rir,warmup=false,k=todayKey()){
  const ex=EXERCISES.find(e=>e.id===id);
  if(!ex||!Number.isInteger(reps)||reps<1||reps>100||!Number.isFinite(kg)||kg<0||kg>1000||!Number.isInteger(rir)||rir<0||rir>10)throw new Error('Enter valid reps, kg and reps in reserve.');
  const previous=completedSets(id).filter(r=>!r.s.warmup).map(r=>estimateMax(r.s));
  let session=activeWorkout(k);
  if(!session){session={id:uid(),schemaVersion:2,kind:'Strength',minutes:0,note:'',at:nowISO(),completed:false,exercises:[]};day(k).exercise.push(session);}
  let e=session.exercises.find(x=>x.exerciseId===id);
  if(!e){e={exerciseId:id,name:ex.name,sets:[]};session.exercises.push(e);}
  const set={reps,kg,rir,warmup,at:nowISO()};
  set.pr=!warmup&&previous.length>0&&estimateMax(set)>Math.max(...previous);
  e.sets.push(set);pushDay(k);
  state.profile.recentExercises=[id,...(state.profile.recentExercises||[]).filter(x=>x!==id)].slice(0,16);pushProfile();
  return set;
}
function finishWorkout(minutes,note,k=todayKey()){
  if(!Number.isFinite(minutes)||minutes<=0||minutes>1440)throw new Error('Enter a duration from 1 to 1440 minutes.');
  const s=activeWorkout(k);if(!s)throw new Error('Log a set first.');
  s.minutes=minutes;s.note=String(note||'').slice(0,3000);s.completed=true;s.finishedAt=nowISO();syncExerciseHabit(k);pushDay(k);return s;
}
function metricNode(items){const n=el('div','metric-row');items.forEach(([value,label])=>n.append(el('div','', '<strong>'+esc(value)+'</strong><span>'+esc(label)+'</span>')));return n;}
// RP figures below are DIRECT weekly sets. Fractional secondary work is shown separately.
const VOLUME_REFERENCES={
  chest:{mv:4,mev:6,source:'32433153518359-Chest'},back:{mv:6,mev:10,source:'32433434201879-Back'},
  triceps:{mv:4,mev:6,source:'32433338498967-Triceps'},calves:{mv:6,mev:8,source:'32433232143895-Calves'},
  forearms:{mv:0,mev:8,beginner:2,source:'32433321287447-Forearms'},core:{mv:0,mev:6,beginner:2,source:'32433381453463-Abs'},
  traps:{mv:0,mev:4,source:'32433317493911-Traps'},frontDelts:{mv:0,mev:0,source:'32433236733591-Front-Delts'},
  glutes:{mv:0,mev:0,source:'32433132961431-Glutes'}
};
function weeklyVolume(k=todayKey()){
  const keys=trainingWeek(k),muscles=Object.fromEntries(Object.keys(MUSCLES).map(m=>[m,{direct:0,secondary:0,equivalent:0}]));
  let unique=0;
  completedSets().filter(r=>keys.includes(r.k)&&!r.s.warmup&&r.s.rir<=3&&r.s.reps>=5&&r.s.reps<=30).forEach(({e})=>{
    const ex=EXERCISES.find(x=>x.id===e.exerciseId);if(!ex)return;unique++;
    muscles[ex.primary].direct++;muscles[ex.primary].equivalent++;
    ex.secondary.forEach(m=>{muscles[m].secondary+=.5;muscles[m].equivalent+=.5;});
  });return {muscles,unique};
}
function volumeTarget(m){
  const custom=state.profile.volumeTargets?.[m];if(Number.isFinite(custom))return custom;
  const ref=VOLUME_REFERENCES[m];if(!ref)return null;
  if(state.profile.trainingGoal==='maintain')return ref.mv;
  return state.profile.trainingLevel==='beginner'?(ref.beginner??ref.mev):ref.mev;
}
function volumeStatus(m,volume){
  const target=volumeTarget(m);
  if(target===null)return 'Set a target';
  if(target===0)return volume.equivalent>0?'Indirect work logged':'No work logged';
  return volume.direct<target?'Below target':'Target reached';
}
function muscleFeedback(m){const v=weeklyVolume().muscles[m];return MUSCLES[m]+': '+v.direct+' direct + '+v.secondary+' secondary = '+v.equivalent+' equivalent sets this week / '+volumeStatus(m,v);}
function renderVolume(v){
  const report=weeklyVolume(),keys=trainingWeek();
  v.append(el('p','secsub',keys[0]+' to '+keys[6]+' / Week closes Sunday'));
  const form=el('form','form-grid');form.innerHTML='<label class="field"><span>Experience</span><select id="trainingLevel"><option value="beginner">Beginner</option><option value="intermediate">Intermediate</option><option value="advanced">Advanced</option></select></label><label class="field"><span>Training days / week</span><input id="trainingDays" type="number" min="1" max="7" required value="'+(state.profile.trainingDays||3)+'"></label><label class="field"><span>Goal</span><select id="trainingGoal"><option value="grow">Build muscle</option><option value="maintain">Maintain muscle</option></select></label><div class="savebar"><button type="submit" class="btn ghost">Save preferences</button></div>';
  form.querySelector('#trainingLevel').value=state.profile.trainingLevel||'intermediate';form.querySelector('#trainingGoal').value=state.profile.trainingGoal||'grow';
  form.onsubmit=e=>{e.preventDefault();state.profile.trainingLevel=form.querySelector('#trainingLevel').value;state.profile.trainingDays=Number(form.querySelector('#trainingDays').value);state.profile.trainingGoal=form.querySelector('#trainingGoal').value;pushProfile();renderMove();};v.append(form);
  const targets=Object.keys(MUSCLES).map(volumeTarget),total=targets.reduce((a,n)=>a+(n??0),0);
  v.append(metricNode([[report.unique,'Hard sets logged (counted once)'],[Object.values(report.muscles).reduce((a,m)=>a+m.equivalent,0),'Muscle-equivalent sets'],[total,'Sum of available direct targets'],[(total/(state.profile.trainingDays||3)).toFixed(1),'Direct targets / training day']]));
  v.append(el('p','secsub','Hard-set estimate: 5-30 reps, 0-3 reps in reserve, excluding warm-ups. Primary muscle = 1; each secondary = 0.5. RP references use direct sets, so targets compare direct work only.'));
  Object.entries(MUSCLES).forEach(([id,name])=>{
    const data=report.muscles[id],target=volumeTarget(id),ref=VOLUME_REFERENCES[id];
    const row=el('div','entry');
    row.innerHTML='<div class="form-grid"><div><h3 class="sec">'+name+'</h3><span class="mono">'+data.equivalent+' equivalent / '+data.direct+' direct</span><p style="color:var(--'+(target!==null&&data.direct>=target?'sage':'clay')+')">'+volumeStatus(id,data)+'</p></div><label class="field"><span>Direct sets / week target</span><input type="number" min="0" max="60" step="1" aria-label="'+name+' weekly target" '+(target===null?'placeholder="Your target"':'value="'+target+'"')+'></label></div>';
    row.querySelector('input').onchange=e=>{const input=e.target;if(!input.checkValidity()||input.value==='')return;state.profile.volumeTargets=state.profile.volumeTargets||{};state.profile.volumeTargets[id]=Number(input.value);pushProfile();renderMove();};
    if(ref)row.append(el('small','', '<a href="https://help.rpstrength.com/hc/en-us/articles/'+ref.source+'" target="_blank" rel="noopener">RP reference</a>: MV '+ref.mv+' / MEV '+ref.mev+' direct sets. '+(ref.mev===0?'Assumes other compound training.':'')));
    else row.append(el('small','','No verified reference loaded; choose your own target.'));
    v.append(row);
  });
  v.append(el('p','secsub','These are starting references, not personal limits. MAV (most adaptive volume) and MRV (recoverable ceiling) depend on frequency and recovery; this tracker cannot identify your optimum or diagnose overtraining. Totals omit muscles without a target and are not a complete program.'));
}
function exerciseMetrics(){
  const wk=trainingWeek(),rows=exerciseRows(),thisWeek=rows.filter(r=>wk.includes(r.k));
  const tonnage=completedSets().filter(r=>wk.includes(r.k)&&!r.s.warmup).reduce((a,r)=>a+r.s.reps*r.s.kg,0);
  return metricNode([[new Set(thisWeek.map(r=>r.k)).size,'Training days this week'],[new Set(rows.filter(r=>r.k.slice(0,7)===todayKey().slice(0,7)).map(r=>r.k)).size,'Training days this month'],[(thisWeek.reduce((a,r)=>a+(r.x.minutes||0),0)/60).toFixed(1)+' h','This week'],[Math.round(tonnage).toLocaleString()+' kg','External load x reps this week']]);
}
function renderMove(){
  const v=$('#v-move'),rows=exerciseRows();
  sectionHeading(v,'move','Exercise','Build your strength. Keep the details. Every session has a place here.');
  const options=[{id:'log',label:'Log'},{id:'workout',label:'Workout'},{id:'history',label:'History'}];
  if(typeof renderVolume==='function')options.splice(2,0,{id:'volume',label:'Volume'});
  if(typeof renderStrength==='function')options.splice(options.length-1,0,{id:'strength',label:'Strength'});
  v.append(tabsNode('move',options));
  v.append(exerciseMetrics());
  if(state.tab.move==='volume'){renderVolume(v);return;}
  if(state.tab.move==='strength'){renderStrength(v);return;}
  if(state.tab.move==='history'){renderWorkoutHistory(v,rows);return;}
  if(state.tab.move==='workout'){renderWorkout(v);return;}
  const grid=el('div','work-grid'),catalog=el('div'),detail=el('div');grid.append(catalog,detail);v.append(grid);
  catalog.innerHTML='<label class="field"><span>Find an exercise</span><input type="text" id="exerciseSearch" placeholder="Name or movement"></label><div class="form-grid"><label class="field"><span>Muscle</span><select id="muscleFilter"><option value="">All muscles</option>'+Object.entries(MUSCLES).map(([id,name])=>'<option value="'+id+'">'+name+'</option>').join('')+'</select></label><label class="field"><span>Equipment</span><select id="equipmentFilter"><option value="">All equipment</option>'+[...new Set(EXERCISES.map(e=>e.equipment))].sort().map(x=>'<option>'+esc(x)+'</option>').join('')+'</select></label></div>';
  const results=el('div','exercise-results');catalog.append(results);
  const list=()=>{
    const q=catalog.querySelector('#exerciseSearch').value.toLowerCase(),m=catalog.querySelector('#muscleFilter').value,eq=catalog.querySelector('#equipmentFilter').value;
    const fav=state.profile.favoriteExercises||[],recent=state.profile.recentExercises||[];
    const score=e=>(fav.includes(e.id)?100:0)+(recent.includes(e.id)?30-recent.indexOf(e.id):0);
    const found=EXERCISES.filter(e=>(e.name+' '+e.pattern).toLowerCase().includes(q)&&(!m||e.primary===m||e.secondary.includes(m))&&(!eq||e.equipment===eq)).sort((a,b)=>score(b)-score(a)||a.name.localeCompare(b.name));
    results.innerHTML='';
    found.slice(0,80).forEach(e=>{
      const row=el('div','exercise-result'+(liftSelection===e.id?' selected':''));
      const pick=el('button','exercise-pick',esc(e.name)+'<small>'+MUSCLES[e.primary]+' / '+esc(e.equipment)+'</small>');
      pick.onclick=()=>{liftSelection=e.id;liftQueue=[];list();renderSetEditor(detail,e);};
      const favorite=el('button','iconbtn',fav.includes(e.id)?'&#9733;':'&#9734;');favorite.setAttribute('aria-label',(fav.includes(e.id)?'Unfavorite ':'Favorite ')+e.name);favorite.title=favorite.getAttribute('aria-label');
      favorite.onclick=()=>{state.profile.favoriteExercises=fav.includes(e.id)?fav.filter(id=>id!==e.id):[...fav,e.id];pushProfile();list();};
      row.append(pick,favorite);results.append(row);
    });
    if(!found.length)results.append(el('div','empty','No matching exercises.'));
  };
  catalog.querySelectorAll('input,select').forEach(n=>n.oninput=list);list();
  const selected=EXERCISES.find(e=>e.id===liftSelection);
  if(selected)renderSetEditor(detail,selected);else detail.append(el('div','empty','Choose an exercise.'));
}
function renderSetEditor(v,e){
  const last=lastExerciseSets(e.id),current=(activeWorkout(todayKey())?.exercises||[]).find(x=>x.exerciseId===e.id)?.sets||[],next=liftQueue[0]||current.at(-1)||last.at(-1)||{reps:8,kg:0,rir:2};
  v.innerHTML='<h2 class="sec">'+esc(e.name)+'</h2><p class="secsub">'+MUSCLES[e.primary]+(e.secondary.length?' / '+e.secondary.map(m=>MUSCLES[m]).join(', '):'')+'<br>'+esc(e.pattern)+'</p>';
  const repeat=el('button','btn ghost','Repeat last exercise');repeat.disabled=!last.length;repeat.onclick=()=>{liftQueue=last.map(s=>({...s}));renderSetEditor(v,e);};v.append(repeat);
  const form=el('form');form.style.marginTop='20px';
  form.innerHTML='<div class="form-grid"><label class="field"><span>Reps</span><input id="setReps" type="number" min="1" max="100" step="1" required value="'+next.reps+'"></label><label class="field"><span>Kg (total external load)</span><input id="setKg" type="number" min="0" max="1000" step="0.25" required value="'+next.kg+'"></label><label class="field"><span>Reps in reserve</span><input id="setRir" type="number" min="0" max="10" step="1" required value="'+next.rir+'"></label><label class="field"><span>Rest seconds</span><input id="setRest" type="number" min="0" max="600" step="15" value="'+(state.profile.restSeconds??90)+'"></label></div><label><input id="setWarmup" type="checkbox" '+(next.warmup?'checked':'')+'> Warm-up set</label><div class="savebar"><button class="btn" type="submit">Save set</button></div>';
  form.onsubmit=event=>{
    event.preventDefault();try{
      const s=addWorkoutSet(e.id,Number(form.querySelector('#setReps').value),Number(form.querySelector('#setKg').value),Number(form.querySelector('#setRir').value),form.querySelector('#setWarmup').checked);
      const rest=clamp(Number(form.querySelector('#setRest').value)||0,0,600);audioReady();state.profile.restSeconds=rest;pushProfile();restUntil=rest?Date.now()+rest*1000:0;
      $('#v-move > .metric-row')?.replaceWith(exerciseMetrics());
      if(liftQueue.length)liftQueue.shift();renderSetEditor(v,e);toast(s.pr?'New estimated 1RM personal record.':'Set saved.');
    }catch(error){toast(error.message);}
  };v.append(form);
  if(liftQueue.length)v.append(el('p','secsub',liftQueue.length+' previous sets left to repeat.'));
  const rest=el('div','inline-status');rest.dataset.rest='1';rest.setAttribute('role','status');v.append(rest);updateRest();
  if(typeof muscleFeedback==='function')v.append(el('div','inline-status',esc(muscleFeedback(e.primary))));
  const sets=(activeWorkout(todayKey())?.exercises||[]).find(x=>x.exerciseId===e.id)?.sets||[];
  if(sets.length)v.append(setTable(sets));
}
function setTable(sets){return el('table','data-table','<thead><tr><th>Set</th><th>Reps</th><th>Kg</th><th>RIR</th><th>Type</th></tr></thead><tbody>'+sets.map((s,i)=>'<tr><td>'+(i+1)+'</td><td>'+s.reps+'</td><td>'+s.kg+'</td><td>'+s.rir+'</td><td>'+(s.warmup?'Warm-up':s.pr?'PR':'Work')+'</td></tr>').join('')+'</tbody>');}
function updateRest(){
  const left=Math.max(0,Math.ceil((restUntil-Date.now())/1000));
  document.querySelectorAll('[data-rest]').forEach(n=>n.textContent=left?'Rest '+Math.floor(left/60)+':'+pad(left%60):'Ready for your next set');
  if(restUntil&&left===0){restUntil=0;bell();}
}
setInterval(updateRest,1000);
function renderWorkout(v){
  const s=activeWorkout(todayKey());if(!s){v.append(el('div','empty','No open workout. Log your first set.'));return;}
  v.append(el('p','secsub',esc(prettyDate(todayKey()))));
  s.exercises.forEach(e=>{v.append(el('h3','sec',esc(e.name)));v.append(setTable(e.sets));});
  const form=el('form','');form.innerHTML='<label class="field"><span>Session minutes</span><input type="number" id="workoutMinutes" min="1" max="1440" required value="'+Math.max(1,Math.round((Date.now()-new Date(s.at).getTime())/60000))+'"></label><label class="field"><span>Session notes</span><textarea id="workoutNote" maxlength="3000">'+esc(s.note||'')+'</textarea></label><button class="btn" type="submit">Finish workout</button>';
  form.querySelector('textarea').oninput=()=>{s.note=form.querySelector('textarea').value;pushDay(todayKey());};
  form.onsubmit=event=>{event.preventDefault();try{finishWorkout(Number(form.querySelector('input').value),form.querySelector('textarea').value);renderMove();toast('Workout saved.');}catch(error){toast(error.message);}};v.append(form);
}
function renderWorkoutHistory(v,rows){
  const ids=[...new Set(completedSets().map(r=>r.e.exerciseId))];
  const select=el('select');select.setAttribute('aria-label','Exercise history');select.innerHTML='<option value="">All exercises</option>'+ids.map(id=>'<option value="'+esc(id)+'">'+esc(EXERCISES.find(e=>e.id===id)?.name||id)+'</option>').join('');
  const content=el('div');v.append(select,content);
  const draw=()=>{
    content.innerHTML='';const id=select.value;
    if(id){
      const points=rows.slice().reverse().flatMap(r=>(r.x.exercises||[]).filter(e=>e.exerciseId===id).map(e=>({k:r.k,max:Math.max(0,...e.sets.filter(s=>!s.warmup).map(estimateMax))}))).filter(p=>p.max>0).slice(-12);
      if(points.length){content.append(el('p','secsub','Estimated 1RM (kg), recent sessions'));const chart=el('div','chart-bars'),max=Math.max(...points.map(p=>p.max));points.forEach(p=>{const bar=el('div','', '<span>'+Math.round(p.max)+'</span>');bar.style.height=(p.max/max*110)+'px';bar.title=p.k+': '+p.max.toFixed(1)+' kg';chart.append(bar);});content.append(chart);}
    }
    const shown=rows.filter(r=>!id||(r.x.exercises||[]).some(e=>e.exerciseId===id));
    if(!shown.length)content.append(el('div','empty','No sessions recorded.'));
    shown.forEach(({k,x})=>{
      const entry=el('div','entry','<div class="ed">'+esc(prettyDate(k))+' / '+(x.minutes||0)+' min'+(x.schemaVersion===2&&!x.completed?' / In progress':'')+'</div><h3 class="sec">'+esc(x.kind||'Strength')+'</h3><p>'+esc(x.note||'')+'</p>');
      (x.exercises||[]).filter(e=>!id||e.exerciseId===id).forEach(e=>{entry.append(el('div','bt',esc(e.name)));entry.append(setTable(e.sets));});content.append(entry);
    });
  };select.onchange=draw;draw();
}
const CARDIO_MODES=['Treadmill','Running','Stair climber','Cycling','Walking','Rowing','Elliptical','Swimming','Other'];
function cardioRows(){return Object.keys(state.days).sort().reverse().flatMap(k=>(state.days[k].cardio||[]).map(s=>({k,s})));}
function cardioProgress(){
  const rows=cardioRows().filter(r=>trainingWeek().includes(r.k)),goal=state.profile.cardioGoal;
  const total=rows.reduce((a,{s})=>({minutes:a.minutes+s.minutes,km:a.km+(s.distance||0),sessions:a.sessions+1}),{minutes:0,km:0,sessions:0});
  return {rows,total,goal,value:goal?total[goal.unit]:0};
}
function logCardio(mode,minutes,distance,intensity,note,k=todayKey()){
  if(!CARDIO_MODES.includes(mode)||!Number.isFinite(minutes)||minutes<=0||minutes>1440||!Number.isFinite(distance)||distance<0||distance>1000||!['Easy','Moderate','Vigorous'].includes(intensity))throw new Error('Enter a valid cardio session.');
  const d=day(k);d.cardio.push({id:uid(),mode,minutes,distance,intensity,note:String(note||'').slice(0,3000),at:nowISO()});
  const h=state.habits.find(x=>!x.archived&&(x.section==='cardio'||/^cardio$/i.test(x.name)));
  if(h){const value=h.unit==='min'?d.cardio.reduce((a,s)=>a+s.minutes,0):h.unit==='km'?d.cardio.reduce((a,s)=>a+s.distance,0):d.cardio.length;d.entries[h.id]={done:value>=(h.target||1),value,at:nowISO()};}
  pushDay(k);
}
function renderCardio(){
  const v=$('#v-cardio'),p=cardioProgress();sectionHeading(v,'cardio','Cardio','Your movement, at your pace. Set a weekly intention and watch your sessions add up.');
  v.append(tabsNode('cardio',[{id:'log',label:'Log'},{id:'goal',label:'Goal'},{id:'history',label:'History'}]));
  v.append(metricNode([[p.total.minutes+' min','This week'],[p.total.sessions,'Sessions'],[p.total.km.toFixed(1)+' km','Distance'],[p.goal?Math.round(p.value/p.goal.value*100)+'%':'Not set','Weekly goal']]));
  if(p.goal){const bar=el('progress');bar.max=p.goal.value;bar.value=Math.min(p.value,p.goal.value);bar.style.width='100%';bar.setAttribute('aria-label','Weekly cardio goal');v.append(bar);v.append(el('p','secsub',p.value.toFixed(1)+' / '+p.goal.value+' '+p.goal.unit+' this week'));}
  if(state.tab.cardio==='history'){
    const rows=cardioRows();if(!rows.length)v.append(el('div','empty','No cardio sessions yet.'));
    rows.forEach(({k,s})=>v.append(el('div','entry','<div class="ed">'+esc(prettyDate(k))+' / '+esc(s.intensity)+'</div><div class="bt">'+esc(s.mode)+' / '+s.minutes+' min'+(s.distance?' / '+s.distance+' km':'')+'</div><p>'+esc(s.note)+'</p>')));return;
  }
  if(state.tab.cardio==='goal'){
    const form=el('form');form.innerHTML='<div class="form-grid"><label class="field"><span>Measure</span><select id="cardioUnit"><option value="minutes">Minutes / week</option><option value="sessions">Sessions / week</option><option value="km">Kilometres / week</option></select></label><label class="field"><span>Weekly target</span><input id="cardioTarget" type="number" min="0.5" max="10080" step="0.5" required '+(p.goal?'value="'+p.goal.value+'"':'placeholder="Your target"')+'></label></div><label><input id="cardioHabit" type="checkbox" '+(state.habits.some(h=>h.section==='cardio'&&!h.archived)?'checked':'')+'> Add Cardio to Today</label><div class="savebar"><button class="btn" type="submit">Save goal</button></div>';
    form.querySelector('select').value=p.goal?.unit||'minutes';
    form.onsubmit=e=>{
      e.preventDefault();const unit=form.querySelector('select').value,value=Number(form.querySelector('#cardioTarget').value);
      if(!(value>0)||unit==='sessions'&&!Number.isInteger(value)){toast('Sessions must be a whole number.');return;}
      state.profile.cardioGoal={unit,value};pushProfile();
      const existing=state.habits.find(h=>h.section==='cardio');
      if(existing){existing.archived=!form.querySelector('#cardioHabit').checked;pushHabit(existing);}
      if(form.querySelector('#cardioHabit').checked&&!state.habits.some(h=>h.section==='cardio'&&!h.archived)){
        const h={id:uid(),name:'Cardio',section:'cardio',target:1,unit:'sessions',hue:'sage',days:[0,1,2,3,4,5,6],order:state.habits.length+1,createdAt:nowISO(),archived:false};state.habits.push(h);pushHabit(h);
      }
      renderCardio();toast('Cardio goal saved.');
    };v.append(form);
    v.append(el('p','secsub','General adult reference: 150-300 moderate-intensity minutes or 75-150 vigorous-intensity minutes per week, or an equivalent mix. This is not your personal target. <a href="https://www.who.int/europe/news-room/fact-sheets/item/physical-activity" target="_blank" rel="noopener">WHO guidance</a>'));return;
  }
  const form=el('form');form.innerHTML='<div class="form-grid"><label class="field"><span>Activity</span><select id="cardioMode">'+CARDIO_MODES.map(m=>'<option>'+m+'</option>').join('')+'</select></label><label class="field"><span>Minutes</span><input id="cardioMinutes" type="number" min="1" max="1440" required placeholder="20"></label><label class="field"><span>Distance (km, optional)</span><input id="cardioDistance" type="number" min="0" max="1000" step="0.01"></label><label class="field"><span>Intensity</span><select id="cardioIntensity"><option>Easy</option><option selected>Moderate</option><option>Vigorous</option></select></label></div><label class="field"><span>Notes</span><textarea maxlength="3000" id="cardioNote"></textarea></label><button class="btn" type="submit">Save cardio</button>';
  form.onsubmit=e=>{e.preventDefault();try{logCardio(form.querySelector('#cardioMode').value,Number(form.querySelector('#cardioMinutes').value),Number(form.querySelector('#cardioDistance').value),form.querySelector('#cardioIntensity').value,form.querySelector('#cardioNote').value);renderCardio();toast('Cardio saved.');}catch(error){toast(error.message);}};v.append(form);
}
/* STANDARDS START */
const STRENGTH_STANDARDS=[{"slug":"bench-press","exerciseId":"Barbell_Bench_Press_-_Medium_Grip","part":"chest","source":"https://strengthlevel.com/strength-standards/bench-press/kg","male":{"body":[[50,27,41,58,78,101],[55,32,47,65,87,110],[60,37,53,72,95,119],[65,42,59,79,102,128],[70,47,64,85,110,136],[75,51,70,92,117,144],[80,56,75,98,124,151],[85,60,80,104,130,158],[90,65,85,109,137,165],[95,69,90,115,143,172],[100,73,95,120,149,179],[105,77,99,125,155,185],[110,81,104,131,160,191],[115,85,108,135,166,197],[120,89,113,140,171,203],[125,93,117,145,176,209],[130,97,121,150,181,214],[135,100,125,154,186,220],[140,104,129,158,191,225]],"age":[[15,41,60,82,108,137],[20,47,68,94,124,156],[25,49,70,96,127,160],[30,49,70,96,127,160],[35,49,70,96,127,160],[40,49,70,96,127,160],[45,46,66,91,120,152],[50,43,62,85,112,142],[55,40,57,79,104,131],[60,36,52,72,95,120],[65,33,47,65,86,108],[70,29,42,59,77,97],[75,26,38,52,69,87],[80,24,34,47,62,78],[85,21,31,42,56,70],[90,19,27,38,50,63]]},"female":{"body":[[40,10,19,33,49,68],[45,12,22,36,54,74],[50,14,25,40,58,79],[55,17,28,44,62,84],[60,19,31,47,66,88],[65,21,33,50,70,92],[70,22,36,53,74,96],[75,24,38,56,77,100],[80,26,40,59,80,104],[85,28,43,61,83,107],[90,30,45,64,86,111],[95,31,47,66,89,114],[100,33,49,69,92,117],[105,35,51,71,94,120],[110,36,53,73,97,123],[115,38,54,75,99,126],[120,39,56,77,102,128]],"age":[[15,17,28,43,62,82],[20,19,32,49,70,94],[25,19,33,51,72,97],[30,19,33,51,72,97],[35,19,33,51,72,97],[40,19,33,51,72,97],[45,18,31,48,68,91],[50,17,29,45,64,86],[55,16,27,41,59,79],[60,14,24,38,54,72],[65,13,22,34,49,65],[70,12,20,31,44,59],[75,11,18,28,39,53],[80,9,16,25,35,47],[85,8,14,22,32,42],[90,8,13,20,28,38]]}},{"slug":"squat","exerciseId":"Barbell_Squat","part":"quads","source":"https://strengthlevel.com/strength-standards/squat/kg","male":{"body":[[50,36,55,78,106,137],[55,43,63,88,118,150],[60,49,71,98,129,162],[65,56,79,107,139,174],[70,62,86,116,149,185],[75,69,94,124,159,196],[80,75,101,132,168,206],[85,81,108,140,177,216],[90,87,115,148,186,226],[95,93,121,156,194,235],[100,98,128,163,203,244],[105,104,134,170,211,253],[110,109,140,177,218,261],[115,115,147,184,226,270],[120,120,152,191,233,278],[125,125,158,197,240,285],[130,130,164,203,247,293],[135,135,169,209,254,300],[140,140,175,215,261,307]],"age":[[15,56,81,112,148,186],[20,64,93,128,169,213],[25,66,95,131,173,219],[30,66,95,131,173,219],[35,66,95,131,173,219],[40,66,95,131,173,219],[45,62,90,124,164,207],[50,58,84,116,153,194],[55,54,78,107,141,179],[60,49,71,98,129,163],[65,45,64,89,117,148],[70,40,58,80,105,133],[75,36,52,71,94,119],[80,32,46,64,84,107],[85,29,42,57,76,96],[90,26,37,51,68,86]]},"female":{"body":[[40,19,34,53,76,102],[45,23,38,58,82,110],[50,26,42,63,88,116],[55,29,46,68,94,123],[60,32,49,72,99,129],[65,35,53,76,104,134],[70,37,56,80,109,140],[75,40,59,84,113,145],[80,42,62,88,117,149],[85,45,65,91,121,154],[90,47,68,94,125,158],[95,49,71,98,129,162],[100,52,74,101,132,166],[105,54,76,104,136,170],[110,56,79,107,139,174],[115,58,81,109,142,177],[120,60,83,112,145,181]],"age":[[15,28,44,65,90,117],[20,32,50,74,102,134],[25,32,51,76,105,137],[30,32,51,76,105,137],[35,32,51,76,105,137],[40,32,51,76,105,137],[45,31,49,72,100,130],[50,29,45,67,93,122],[55,26,42,62,86,112],[60,24,38,57,78,103],[65,22,35,51,71,93],[70,20,31,46,64,84],[75,18,28,41,57,75],[80,16,25,37,51,67],[85,14,22,33,46,60],[90,13,20,30,41,54]]}},{"slug":"deadlift","exerciseId":"Barbell_Deadlift","part":"posterior","source":"https://strengthlevel.com/strength-standards/deadlift/kg","male":{"body":[[50,46,68,96,129,164],[55,54,77,107,141,178],[60,61,86,117,153,191],[65,68,95,127,164,204],[70,75,103,137,175,216],[75,82,111,146,186,228],[80,89,119,155,196,239],[85,96,127,164,205,250],[90,102,134,172,215,260],[95,108,141,180,224,270],[100,114,148,188,232,279],[105,120,155,195,241,289],[110,126,161,203,249,298],[115,132,168,210,257,306],[120,137,174,217,265,315],[125,143,180,224,272,323],[130,148,186,231,280,331],[135,153,192,237,287,339],[140,159,198,243,294,346]],"age":[[15,68,96,131,172,216],[20,78,110,150,196,246],[25,80,113,154,202,253],[30,80,113,154,202,253],[35,80,113,154,202,253],[40,80,113,154,202,253],[45,75,107,146,191,240],[50,71,100,136,179,224],[55,65,92,126,165,207],[60,59,84,115,150,189],[65,54,76,104,136,171],[70,48,69,94,123,154],[75,43,62,84,110,138],[80,39,55,75,98,123],[85,35,49,67,88,111],[90,31,44,60,79,99]]},"female":{"body":[[40,26,43,65,92,121],[45,30,48,71,99,129],[50,34,52,76,105,136],[55,37,56,81,111,143],[60,40,60,86,116,149],[65,43,64,90,121,155],[70,46,68,95,126,160],[75,49,71,99,131,166],[80,52,74,102,135,170],[85,54,77,106,139,175],[90,57,80,109,143,180],[95,59,83,113,147,184],[100,61,86,116,151,188],[105,64,89,119,154,192],[110,66,91,122,158,196],[115,68,94,125,161,200],[120,70,96,128,164,203]],"age":[[15,35,54,77,105,136],[20,40,61,89,120,155],[25,41,63,91,124,160],[30,41,63,91,124,160],[35,41,63,91,124,160],[40,41,63,91,124,160],[45,39,60,86,117,151],[50,37,56,80,109,141],[55,34,52,74,101,130],[60,31,47,68,92,119],[65,28,43,61,83,108],[70,25,38,55,75,97],[75,23,34,50,67,87],[80,20,31,44,60,78],[85,18,28,40,54,70],[90,16,25,36,48,63]]}},{"slug":"shoulder-press","exerciseId":"Barbell_Shoulder_Press","part":"shoulders","source":"https://strengthlevel.com/strength-standards/shoulder-press/kg","male":{"body":[[50,15,24,36,51,67],[55,18,28,41,56,73],[60,21,32,45,62,79],[65,24,35,50,67,85],[70,27,39,54,72,90],[75,30,43,58,76,96],[80,33,46,62,81,101],[85,36,49,66,85,106],[90,38,53,70,90,111],[95,41,56,74,94,115],[100,44,59,77,98,120],[105,47,62,81,102,124],[110,49,65,84,105,128],[115,52,68,87,109,132],[120,54,71,90,113,136],[125,56,73,94,116,140],[130,59,76,97,119,144],[135,61,79,100,123,147],[140,63,81,102,126,151]],"age":[[15,25,37,53,71,91],[20,29,43,61,82,104],[25,29,44,62,84,107],[30,29,44,62,84,107],[35,29,44,62,84,107],[40,29,44,62,84,107],[45,28,42,59,79,102],[50,26,39,55,74,95],[55,24,36,51,68,88],[60,22,33,46,62,80],[65,20,30,42,57,72],[70,18,27,38,51,65],[75,16,24,34,46,58],[80,14,21,30,41,52],[85,13,19,27,37,47],[90,12,17,24,33,42]]},"female":{"body":[[40,7,13,22,33,45],[45,9,15,24,36,48],[50,10,17,27,38,51],[55,11,19,29,41,54],[60,12,20,31,43,57],[65,14,22,32,45,59],[70,15,23,34,47,62],[75,16,25,36,49,64],[80,17,26,37,51,66],[85,18,27,39,53,68],[90,19,28,40,54,70],[95,20,30,42,56,72],[100,21,31,43,58,74],[105,22,32,45,59,75],[110,23,33,46,61,77],[115,24,34,47,62,79],[120,24,35,48,64,80]],"age":[[15,11,18,28,39,52],[20,13,21,32,45,60],[25,13,21,33,46,61],[30,13,21,33,46,61],[35,13,21,33,46,61],[40,13,21,33,46,61],[45,12,20,31,44,58],[50,11,19,29,41,54],[55,11,18,27,38,50],[60,10,16,24,34,46],[65,9,14,22,31,41],[70,8,13,20,28,37],[75,7,12,18,25,33],[80,6,10,16,23,30],[85,6,9,14,20,27],[90,5,8,13,18,24]]}},{"slug":"bent-over-row","exerciseId":"Bent_Over_Barbell_Row","part":"back","source":"https://strengthlevel.com/strength-standards/bent-over-row/kg","male":{"body":[[50,23,36,52,72,94],[55,27,41,59,80,103],[60,31,46,65,87,111],[65,36,51,71,94,119],[70,40,56,77,101,127],[75,44,61,83,107,134],[80,48,66,88,114,141],[85,52,71,93,120,147],[90,56,75,99,125,154],[95,59,79,104,131,160],[100,63,84,108,136,166],[105,67,88,113,142,172],[110,70,92,118,147,178],[115,74,96,122,152,183],[120,77,100,127,157,188],[125,80,103,131,161,194],[130,84,107,135,166,199],[135,87,111,139,170,203],[140,90,114,143,175,208]],"age":[[15,36,53,74,99,126],[20,41,61,85,113,143],[25,43,62,87,116,147],[30,43,62,87,116,147],[35,43,62,87,116,147],[40,43,62,87,116,147],[45,40,59,82,110,140],[50,38,55,77,103,130],[55,35,51,71,95,120],[60,32,46,65,86,110],[65,29,42,59,78,99],[70,26,38,53,70,90],[75,23,34,47,63,80],[80,21,30,42,57,72],[85,19,27,38,51,64],[90,17,24,34,45,58]]},"female":{"body":[[40,12,21,33,48,65],[45,14,23,36,51,69],[50,15,25,38,54,72],[55,17,27,41,57,75],[60,18,29,43,59,78],[65,19,30,44,62,80],[70,20,32,46,64,83],[75,22,33,48,66,85],[80,23,35,50,68,87],[85,24,36,51,69,89],[90,25,37,53,71,91],[95,26,38,54,73,93],[100,27,40,56,74,95],[105,28,41,57,76,97],[110,29,42,58,78,99],[115,29,43,60,79,100],[120,30,44,61,80,102]],"age":[[15,16,25,38,53,69],[20,18,29,43,60,79],[25,18,30,44,62,82],[30,18,30,44,62,82],[35,18,30,44,62,82],[40,18,30,44,62,82],[45,17,28,42,59,77],[50,16,26,39,55,72],[55,15,24,36,51,67],[60,14,22,33,46,61],[65,12,20,30,42,55],[70,11,18,27,38,50],[75,10,16,24,34,44],[80,9,15,22,30,40],[85,8,13,19,27,36],[90,7,12,17,24,32]]}},{"slug":"barbell-curl","exerciseId":"Barbell_Curl","part":"arms","source":"https://strengthlevel.com/strength-standards/barbell-curl/kg","male":{"body":[[50,11,19,30,43,58],[55,13,22,33,47,62],[60,15,24,36,50,66],[65,17,26,39,54,70],[70,18,28,41,57,74],[75,20,31,44,60,77],[80,22,33,46,63,80],[85,23,35,49,65,84],[90,25,36,51,68,87],[95,26,38,53,71,89],[100,28,40,55,73,92],[105,29,42,57,75,95],[110,31,44,60,78,97],[115,32,45,61,80,100],[120,34,47,63,82,102],[125,35,49,65,84,105],[130,36,50,67,86,107],[135,38,52,69,88,109],[140,39,53,71,90,111]],"age":[[15,16,26,38,53,70],[20,19,30,44,61,80],[25,19,30,45,62,82],[30,19,30,45,62,82],[35,19,30,45,62,82],[40,19,30,45,62,82],[45,18,29,43,59,77],[50,17,27,40,55,72],[55,16,25,37,51,67],[60,14,23,34,47,61],[65,13,20,30,42,55],[70,12,18,27,38,50],[75,10,17,24,34,45],[80,9,15,22,30,40],[85,8,13,20,27,36],[90,7,12,18,24,32]]},"female":{"body":[[40,4,10,17,27,38],[45,5,11,19,29,41],[50,6,12,20,31,43],[55,7,13,22,33,45],[60,8,14,23,34,47],[65,8,15,24,36,49],[70,9,16,26,37,51],[75,10,17,27,39,52],[80,11,18,28,40,54],[85,11,19,29,41,55],[90,12,20,30,43,57],[95,12,21,31,44,58],[100,13,21,32,45,59],[105,14,22,33,46,61],[110,14,23,34,47,62],[115,15,24,35,48,63],[120,15,24,36,49,64]],"age":[[15,7,13,21,31,42],[20,8,14,24,35,48],[25,8,15,24,36,50],[30,8,15,24,36,50],[35,8,15,24,36,50],[40,8,15,24,36,50],[45,8,14,23,34,47],[50,7,13,22,32,44],[55,6,12,20,30,41],[60,6,11,18,27,37],[65,5,10,16,24,34],[70,5,9,15,22,30],[75,4,8,13,20,27],[80,4,7,12,18,24],[85,3,6,11,16,22],[90,3,6,10,14,20]]}}];
/* STANDARDS END */
const BODY_PARTS={chest:'Chest',shoulders:'Shoulders',back:'Back',arms:'Arms',core:'Core',quads:'Quads',posterior:'Hamstrings / glutes',calves:'Calves'};
const RANKS=['Stone','Iron','Bronze','Brass','Sage','Dusk','Lilac','Amethyst','Magenta','Iridescent'];
function interpolateTable(table,value){
  if(value<table[0][0]||value>table.at(-1)[0])return null;
  const i=table.findIndex(row=>row[0]>=value),b=table[i],a=table[Math.max(0,i-1)];
  const t=a[0]===b[0]?0:(value-a[0])/(b[0]-a[0]);return a.slice(1).map((x,j)=>x+(b[j+1]-x)*t);
}
function strengthThresholds(standard,profile=state.profile){
  const table=standard[profile.sex];if(!table)return null;
  const weight=interpolateTable(table.body,profile.bodyweight),age=interpolateTable(table.age,profile.age),base=interpolateTable(table.age,25);
  if(!weight||!age||!Number.isFinite(profile.bodyweight)||!Number.isFinite(profile.age))return null;
  // Separate published tables do not specify a joint model: this age factor is an explicit approximation.
  return weight.map((kg,i)=>kg*age[i]/base[i]);
}
function estimatedPercentile(max,anchors){
  const percentiles=[5,20,50,80,95];
  if(max<anchors[0])return 5*max/anchors[0];
  for(let i=1;i<anchors.length;i++)if(max<anchors[i])return percentiles[i-1]+(max-anchors[i-1])/(anchors[i]-anchors[i-1])*(percentiles[i]-percentiles[i-1]);
  return 95;
}
function strengthResults(){
  return Object.entries(BODY_PARTS).map(([part,label])=>{
    const standard=STRENGTH_STANDARDS.find(s=>s.part===part);
    if(!standard)return {part,label,reason:'No comparable standard loaded.'};
    const candidates=completedSets(standard.exerciseId).filter(r=>!r.s.warmup&&r.s.reps<=10&&r.s.kg>0);
    if(!candidates.length)return {part,label,reason:'No '+standard.slug.replaceAll('-',' ')+' recorded yet.'};
    const best=candidates.reduce((a,b)=>estimateMax(a.s)>estimateMax(b.s)?a:b),max=estimateMax(best.s),anchors=strengthThresholds(standard);
    if(!anchors)return {part,label,reason:'Profile is missing or outside the published table range.'};
    const percentile=estimatedPercentile(max,anchors),rank=clamp(Math.floor(percentile/10),0,9);
    return {part,label,standard,max,percentile,rank,date:best.k,ratio:max/state.profile.bodyweight,anchors};
  });
}
function renderStrength(v){
  const form=el('form','form-grid');form.innerHTML='<label class="field"><span>Bodyweight (kg)</span><input id="bodyweight" type="number" min="20" max="350" step="0.1" required value="'+(state.profile.bodyweight||'')+'"></label><label class="field"><span>Sex (reference table)</span><select id="referenceSex" required><option value="">Choose</option><option value="male">Male</option><option value="female">Female</option></select></label><label class="field"><span>Age</span><input id="referenceAge" type="number" min="18" max="90" step="1" required value="'+(state.profile.age||'')+'"></label><div class="savebar"><button class="btn ghost" type="submit">Save profile</button></div>';
  form.querySelector('select').value=state.profile.sex||'';
  form.onsubmit=e=>{e.preventDefault();state.profile.bodyweight=Number(form.querySelector('#bodyweight').value);state.profile.sex=form.querySelector('#referenceSex').value;state.profile.age=Number(form.querySelector('#referenceAge').value);pushProfile();renderView(state.view);};v.append(form);
  v.append(el('p','secsub','All-time best recorded lifts, compared using your current bodyweight and age. Estimated community ranks, not population percentiles or a medical assessment.'));
  strengthResults().forEach(r=>{
    const row=el('div','entry');row.append(el('h3','sec',r.label));
    if(r.reason){row.append(el('p','secsub',r.reason));v.append(row);return;}
    row.append(el('p','mono','Level '+(r.rank+1)+' / '+RANKS[r.rank]+' / '+(r.percentile>=95?'95+':Math.round(r.percentile))+' estimated percentile'));
    const track=el('div','rank-track');RANKS.forEach((name,i)=>{const mark=el('i',(i<=r.rank?'reached ':'')+(i===9?'rank-iridescent':''));mark.style.setProperty('--rank-color','var(--rank-'+name.toLowerCase()+')');mark.title='Level '+(i+1)+': '+name;track.append(mark);});row.append(track);
    row.append(el('p','',r.max.toFixed(1)+' kg estimated 1RM / '+r.ratio.toFixed(2)+'x bodyweight / '+r.date));
    row.append(el('small','', '<a href="'+r.standard.source+'" target="_blank" rel="noopener">'+esc(r.standard.slug.replaceAll('-',' '))+' standards</a>'));
    v.append(row);
  });
  const method=el('details');method.innerHTML='<summary>Reference and calculation</summary><p>Source: Strength Level community lift tables, retrieved 2026-09-14. Published anchors: beginner 5th, novice 20th, intermediate 50th, advanced 80th, elite 95th percentile. Ten bands divide the estimated percentile scale into ten-point intervals.</p><p>Upgrade linearly interpolates bodyweight rows, multiplies each threshold by its age-table value divided by its age-25 value, then interpolates between the five anchors. This combined age/bodyweight model is an approximation by Upgrade, not the source calculator. Values above the elite anchor are capped at 95+, rather than extrapolated.</p><p>Estimated 1RM uses Epley for 2-10 reps and the actual load for 1 rep. Each region uses the named benchmark lift only. No height adjustment is applied. Technique, equipment, estimation error and self-reported source data affect comparability.</p>';
  v.append(method);
}
function renderLegacyMove(){
  const v=$("#v-move"); const k=todayKey(); const d=day(k);
  const minToday=(d.exercise||[]).reduce((a,x)=>a+(x.minutes||0),0);
  const wk=weekKeys(0).reduce((a,kk)=>a+((state.days[kk]?state.days[kk].exercise||[]:[]).reduce((b,x)=>b+(x.minutes||0),0)),0);
  const sess=Object.keys(state.days).reduce((a,kk)=>a+((state.days[kk].exercise||[]).length),0);
  v.innerHTML='<h2 class="sec">Exercise</h2><p class="secsub">Log what you actually did, not what you planned. Minutes and honest intensity beat a perfect programme you abandon in three weeks.</p>';
  v.appendChild(tabsNode("move",[
    {id:"log",label:"Log a session"},
    {id:"history",label:"History",n:sess},
    {id:"week",label:"This week"}
  ]));

  const stats=el("div","stats"); stats.style.marginBottom="34px";
  [[minToday+"m","Today"],[wk+"m","This week"],[sess,"Sessions logged"]]
   .forEach(([n,l])=>stats.appendChild(el("div","stat",'<div class="n mono">'+n+'</div><div class="k">'+l+'</div>')));
  v.appendChild(stats);

  if(state.tab.move==="history"){ v.appendChild(moveHistory(200)); return; }
  if(state.tab.move==="week"){ v.appendChild(moveWeek()); return; }

  const cols=el("div","cols"); cols.style.marginTop="0";
  const p1=el("div","panel");
  p1.appendChild(el("div","label","Log a session"));
  let kind=WORKOUTS[0], intensity=3;
  const kr=el("div","chiprow");
  WORKOUTS.forEach(w=>{ const b=el("button","chip"+(w===kind?" on":""),w);
    b.onclick=()=>{kind=w; kr.querySelectorAll(".chip").forEach(x=>x.classList.remove("on")); b.classList.add("on");}; kr.appendChild(b); });
  p1.appendChild(kr);
  const f=el("div",""); f.style.marginTop="20px";
  f.innerHTML='<label class="field"><span>Minutes</span><input type="number" id="mm" value="45" min="1"></label>'+
    '<div class="field"><span>How hard, honestly</span><div class="chiprow" id="ii"></div></div>'+
    '<label class="field"><span>Note</span><input type="text" id="nn" placeholder="Squats felt heavy. Slept badly."></label>';
  p1.appendChild(f);
  const ir=f.querySelector("#ii");
  ["Easy","Light","Solid","Hard","All out"].forEach((w,i)=>{ const b=el("button","chip"+(i+1===intensity?" on":""),w);
    b.onclick=()=>{intensity=i+1; ir.querySelectorAll(".chip").forEach(x=>x.classList.remove("on")); b.classList.add("on");}; ir.appendChild(b); });
  const go2=el("button","btn","Log session");
  go2.onclick=()=>{
    const m=Number(f.querySelector("#mm").value)||0; if(m<=0){toast("Minutes?");return;}
    d.exercise.push({kind:kind,minutes:m,intensity:intensity,note:f.querySelector("#nn").value.trim(),at:nowISO()});
    const h=state.habits.find(x=>x.section==="move"||/exerc|train|workout/i.test(x.name));
    if(h){ const tot=d.exercise.reduce((a,x)=>a+x.minutes,0); d.entries[h.id]={done:tot>=(h.target||1),value:tot,at:nowISO()}; }
    pushDay(k); renderMove(); toast(kind+", "+m+" minutes. On the board.");
  };
  p1.appendChild(go2);
  cols.appendChild(p1);
  cols.appendChild(moveHistory(14));
  v.appendChild(cols);
}
function moveHistory(n){
  const p=el("div","panel flat");
  p.appendChild(el("div","label","Recent sessions"));
  const all=[];
  Object.keys(state.days).sort().reverse().forEach(kk=>{ (state.days[kk].exercise||[]).forEach(x=>all.push({k:kk,x:x})); });
  if(!all.length) p.appendChild(el("div","empty","Nothing logged yet. The first one is the only hard one."));
  all.slice(0,n).forEach(o=>{
    const e=el("div","entry");
    e.innerHTML='<div class="ed">'+esc(prettyDate(o.k))+'<span class="moodpill">'+esc(["Easy","Light","Solid","Hard","All out"][(o.x.intensity||3)-1])+'</span></div>'+
      '<div class="eb">'+esc(o.x.kind)+' · '+o.x.minutes+' min'+(o.x.note?'\n'+esc(o.x.note):'')+'</div>';
    p.appendChild(e);
  });
  return p;
}
function moveWeek(){
  const p=el("div","panel");
  p.appendChild(el("div","label","Minutes per day, this week"));
  const row=el("div",""); row.style.cssText="display:flex;align-items:flex-end;gap:10px;height:150px;margin-bottom:14px";
  const keys=weekKeys(0);
  const vals=keys.map(kk=>((state.days[kk]||{}).exercise||[]).reduce((a,x)=>a+(x.minutes||0),0));
  const max=Math.max(60,...vals);
  keys.forEach((kk,i)=>{
    const col=el("div",""); col.style.cssText="flex:1;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;gap:8px;height:100%";
    const bar=el("div","");
    bar.style.cssText="width:100%;border-radius:5px 5px 2px 2px;background:"+(vals[i]?"var(--clay)":"rgba(237,231,218,.06)")+
      ";height:"+Math.max(4,(vals[i]/max)*110)+"px";
    bar.title=prettyDate(kk)+" — "+vals[i]+" min";
    const lab=el("div","mono"); lab.style.cssText="font-size:.66rem;color:"+(kk===todayKey()?"var(--brass)":"var(--ivory-3)");
    lab.textContent=DOW[parseKey(kk).getDay()];
    col.append(bar,lab); row.appendChild(col);
  });
  p.appendChild(row);
  const kinds={};
  Object.keys(state.days).forEach(kk=>((state.days[kk].exercise||[]).forEach(x=>{kinds[x.kind]=(kinds[x.kind]||0)+(x.minutes||0);})));
  const list=Object.entries(kinds).sort((a,b)=>b[1]-a[1]);
  if(list.length){
    p.appendChild(el("div","label","All-time minutes by type"));
    const dl=el("dl","kv");
    list.forEach(([kk,vv])=>{ dl.appendChild(el("dt","",esc(kk))); dl.appendChild(el("dd","mono",vv+" min")); });
    p.appendChild(dl);
  }
  return p;
}

/* =========================================================================
   MIND (named Subconscious until 2026-10-27: that name promised what the evidence does not support)
   ========================================================================= */
function renderMind(){
  const v=$("#v-mind");
  sectionHeading(v,'mind','Mind','Put your intentions into words. Rehearse a small action. Give the day a gentle ending.');
  v.appendChild(tabsNode("mind",[
    {id:"identity",label:"Identity statements",n:(state.profile.identity||[]).filter(s=>s.trim()).length},
    {id:"practices",label:"Practices",n:3}
  ]));

  const cols=el("div","cols"); cols.style.marginTop="0";

  const p1=el("div","panel");
  p1.appendChild(el("div","label","Identity statements"));
  p1.appendChild(el("p","secsub",'Present tense, specific enough to be checkable. Not “I am successful” — “I train before 8am.”'));
  const list=el("div","");
  (state.profile.identity||[]).forEach((s,i)=>{
    const line=el("div","affline");
    const inp=el("input"); inp.type="text"; inp.value=s;
    inp.oninput=()=>{ state.profile.identity[i]=inp.value; saveLocal(); };
    inp.onblur=()=>pushProfile();
    const x=el("button","x","×");
    x.onclick=()=>{ state.profile.identity.splice(i,1); pushProfile(); renderMind(); };
    line.append(inp,x); list.appendChild(line);
  });
  p1.appendChild(list);
  const addI=el("button","addrow",'<span class="plus">+</span><span>Add a statement</span>');
  addI.onclick=()=>{ state.profile.identity=state.profile.identity||[]; state.profile.identity.push("I am the kind of person who "); pushProfile(); renderMind(); };
  p1.appendChild(addI);
  const runA=el("button","btn","Say them slowly"); runA.style.marginTop="20px";
  runA.onclick=()=>runPriming();
  p1.appendChild(runA);
  if(state.tab.mind==="identity"){ p1.style.gridColumn="1 / -1"; cols.appendChild(p1); v.appendChild(cols); return; }

  const p2=el("div","panel flat");
  p2.appendChild(el("div","label","Practices"));
  [["Rehearse the day","Walk through today's hard moments and watch yourself handle them well. Six minutes, eyes closed.",()=>{go("meditate"); setTimeout(()=>runSession(SESSIONS.find(s=>s.id==="rehearse"),todayKey()),120);}],
   ["Say your statements","Your own statements, slowly, as facts. Then one image of making the least-true one truer.",()=>{go("meditate"); setTimeout(()=>runSession(SESSIONS.find(s=>s.id==="prime"),todayKey()),120);}],
   ["Put the day down","Name what you are carrying, decide what is actionable tonight, set the rest down.",()=>{go("meditate"); setTimeout(()=>runSession(SESSIONS.find(s=>s.id==="release"),todayKey()),120);}]
  ].forEach(([t,d,fn])=>{
    const row=el("div","book");
    row.innerHTML='<div><div class="bt">'+esc(t)+'</div><div class="ba">'+esc(d)+'</div></div>';
    const b=el("button","chip","Start"); b.onclick=fn; row.appendChild(b);
    p2.appendChild(row);
  });
  const caveat=el("div","lesson"); caveat.style.marginTop="30px";
  caveat.innerHTML='<div class="eyebrow">Straight talk</div><p>Repetition and vivid rehearsal reliably change how easy an action <em>feels</em> — that is well documented and it is the whole benefit. They do not move the world on their own. Treat this page as a way to make the work start sooner, not a substitute for it.</p>';
  p2.appendChild(caveat);
  p2.style.gridColumn="1 / -1";
  cols.appendChild(p2);
  v.appendChild(cols);
}
function runPriming(){
  const lines=(state.profile.identity||[]).filter(s=>s.trim());
  if(!lines.length){ toast("Write a statement first."); return; }
  openSheet('<h3>Slowly, as facts</h3><p class="sh-sub">Breathe in. On the exhale, say it silently.</p>'+
    '<div class="breathstage" style="min-height:210px"><div class="orb" id="orb"><div class="ph" style="opacity:.6">—</div></div></div>'+
    '<div class="script" id="sc">'+esc(lines[0])+'</div>'+
    '<div class="sheet-actions"><button class="btn ghost" id="cls">Close</button></div>',
    s=>{
      let i=0,t=0; const sc=s.querySelector("#sc"), orb=s.querySelector("#orb");
      s.querySelector("#cls").onclick=closeSheet;
      orb.style.transitionDuration="4s";
      sheetTimer=setInterval(()=>{
        t++;
        if(t%8===1){ orb.style.transform="scale(1.24)"; orb.querySelector(".ph").textContent="In"; }
        if(t%8===5){
          orb.style.transform="scale(.88)"; orb.querySelector(".ph").textContent="Out";
          sc.style.opacity="0"; setTimeout(()=>{ i=(i+1)%lines.length; sc.textContent=lines[i]; sc.style.opacity="1"; },400);
        }
      },1000);
    });
}

/* =========================================================================
   COACH
   ========================================================================= */
function renderCoach(){
  const v=$("#v-coach");
  sectionHeading(v,'coach','Lessons','One small, evidence-based idea a day, with one thing to do about it.');
  const p=el("div","panel flat");
  LESSONS.forEach((L,i)=>{
    const n=el("div","lesson"); n.style.marginBottom="34px";
    n.innerHTML='<div class="eyebrow">'+esc(L.tag)+(i===state.profile.lessonIdx%LESSONS.length?' · today':'')+'</div>'+
      '<div class="lt">'+esc(L.t)+'</div>'+L.b.map(x=>'<p>'+esc(x)+'</p>').join("")+
      '<div class="act"><b>Do this</b><span>'+esc(L.a)+'</span></div>';
    const b=el("button","chip","Make this today's lesson"); b.style.marginTop="14px";
    b.onclick=()=>{ state.profile.lessonIdx=i; state.profile.lastLessonDay=todayKey(); pushProfile(); toast("Set. It's on your home page."); renderCoach(); };
    n.appendChild(b);
    p.appendChild(n);
  });
  v.appendChild(p);
}

/* =========================================================================
   PROGRESS
   ========================================================================= */
function renderProgress(){
  const v=$("#v-progress");
  sectionHeading(v,'progress','Progress','A bigger picture of the small things. Your rhythms, your strength, and the moments worth recognizing.');
  v.appendChild(tabsNode("progress",[
    {id:"overview",label:"Habits",n:activeHabits().length},
    {id:"body",label:"Body"},
    {id:"milestones",label:"Milestones"},
    {id:"data",label:"Your data"}
  ]));
  if(state.tab.progress==="data"){ renderData(v); return; }
  if(state.tab.progress==="body"){renderStrength(v);return;}
  if(state.tab.progress==="milestones"){renderMilestones(v);return;}

  const stats=el("div","stats"); stats.style.marginBottom="40px";
  const wk=weekKeys(0).filter(x=>x<=todayKey());
  const wkPct=wk.length?Math.round(100*wk.reduce((a,x)=>a+dayScore(x).pct,0)/wk.length):0;
  const days=journeyStats().days;
  [[perfectStreak(),"Perfect days in a row"],[wkPct+"%","This week"],[days,"Days with activity"],
  ].forEach(([n,l])=>stats.appendChild(el("div","stat",'<div class="n mono">'+n+'</div><div class="k">'+l+'</div>')));
  const tot=el("div","stat",'<div class="n mono">'+totalCheckoffs()+'</div><div class="k">Total check-offs</div>');
  stats.style.gridTemplateColumns="repeat(4,1fr)"; stats.appendChild(tot);
  v.appendChild(stats);

  activeHabits().forEach(h=>{
    const hue=HUES[h.hue]||HUES.brass;
    const p=el("div","panel flat"); p.style.marginBottom="34px";
    const st=streak(h), bs=bestStreak(h);
    const last90=Array.from({length:90},(_,i)=>addDays(todayKey(),-89+i));
    const sch=last90.filter(k=>scheduled(h,k)), hit=sch.filter(k=>isDone(h,k)).length;
    p.appendChild(el("div","",'<div style="display:flex;align-items:baseline;justify-content:space-between;gap:20px;margin-bottom:14px">'+
      '<div class="hname" style="font-size:1.35rem">'+esc(h.name)+'</div>'+
      '<div class="mono" style="font-size:.8rem;color:var(--ivory-3)">now <b style="color:var(--ivory)">'+st+'</b>d · best <b style="color:var(--ivory)">'+bs+'</b>d · '+
      (sch.length?Math.round(100*hit/sch.length):0)+'% of scheduled days · '+lastN(h,30).hit+' of last 30</div></div>'));
    const heat=el("div","heat");
    // pad to a Sunday start
    const start=parseKey(last90[0]); const padN=start.getDay();
    for(let i=0;i<padN;i++) heat.appendChild(el("i","hc"));
    last90.forEach(k=>{
      const c=el("i","hc");
      if(isDone(h,k)) c.style.background=hue;
      else if(!scheduled(h,k)) c.style.background="rgba(237,231,218,.025)";
      else if(k<=todayKey()) c.style.background="rgba(237,231,218,.06)";
      c.title=prettyDate(k)+(isDone(h,k)?" — done":"");
      heat.appendChild(c);
    });
    p.appendChild(heat);
    v.appendChild(p);
  });

  const arch=state.habits.filter(h=>h.archived);
  if(arch.length){
    const a=el("div","panel");
    a.appendChild(el("div","label","Archived"));
    arch.forEach(h=>{
      const row=el("div","book");
      row.innerHTML='<div><div class="bt">'+esc(h.name)+'</div><div class="ba">history kept</div></div>';
      const b=el("button","chip","Restore"); b.onclick=()=>{ h.archived=false; pushHabit(h); renderAll(); };
      row.appendChild(b); a.appendChild(row);
    });
    v.appendChild(a);
  }
}

function renderData(v){
  const p=el("div","panel");
  p.appendChild(el("div","label","Where your data lives"));
  const daysWith=Object.keys(state.days).filter(k=>{
    const d=state.days[k];
    return Object.keys(d.entries||{}).length || hasEntry(d.journal) || (d.meditation||[]).length || (d.reading||[]).length || (d.exercise||[]).length || (d.cardio||[]).length;
  });
  let lsSize=0; try{ lsSize=(localStorage.getItem(LS)||"").length; }catch(e){}
  const dl=el("dl","kv");
  [["Storage", "This browser (localStorage)"],
   ["Days with something logged", String(daysWith.length)],
   ["Oldest day stored", daysWith.length?prettyDate(daysWith.sort()[0]):"—"],
   ["Habits", String(state.habits.length)],
   ["Local backup size", (lsSize/1024).toFixed(1)+" KB"],
   ["Last save", lastSavedAt?lastSavedAt.toLocaleString():"—"]
  ].forEach(([a,b])=>{ dl.appendChild(el("dt","",esc(a))); dl.appendChild(el("dd","",esc(b))); });
  p.appendChild(dl);

  const bar=el("div","savebar");
  const ex=el("button","btn","Export a backup");
  ex.onclick=()=>$("#exportBtn").click();
  const im=el("button","btn ghost","Import a backup file");
  im.onclick=()=>$("#importFile").click();
  bar.append(ex,im);
  p.appendChild(bar);
  v.appendChild(p);

  const imp=el("div","panel"); imp.style.marginTop="30px";
  imp.appendChild(el("div","label","Restore from a backup"));
  imp.appendChild(el("p","secsub","Or paste the contents of an exported file. Days you already have are kept unless the backup is newer."));
  const ta=el("textarea"); ta.placeholder='{"exportedAt": …}';
  imp.appendChild(ta);
  const go3=el("button","btn ghost","Restore"); go3.style.marginTop="14px";
  go3.onclick=()=>restoreBackup(ta.value);
  imp.appendChild(go3);
  v.appendChild(imp);
}

/* Merge a backup into what is already here. Newest copy of each day wins;
   habits and books are added by id; the profile (goals, focus, identity) is
   taken from the backup when it is newer or when nothing local was ever saved. */
function restoreBackup(text){
  let o; try{ o=thaw(JSON.parse(text)); }catch(e){ toast("That is not valid JSON."); return false; }
  if(!o||!o.days){ toast("No data found in that backup."); return false; }
  Object.keys(o.days).forEach(k=>{
    const inc=o.days[k], loc=state.days[k];
    if(!loc || !loc.updatedAt || (inc.updatedAt && inc.updatedAt>loc.updatedAt)) state.days[k]=inc;
  });
  (o.habits||[]).forEach(h=>{
    const i=state.habits.findIndex(x=>x.id===h.id);
    if(i<0) state.habits.push(h);
    else if(h.updatedAt && (!state.habits[i].updatedAt || h.updatedAt>state.habits[i].updatedAt)) state.habits[i]=h;
  });
  (o.books||[]).forEach(b=>{ if(!state.books.some(x=>x.id===b.id)) state.books.push(b); });
  if(o.profile && (!state.profile.updatedAt || (o.profile.updatedAt && o.profile.updatedAt>state.profile.updatedAt)))
    state.profile=Object.assign(state.profile,o.profile);
  saveLocal(); renderAll(); toast("Restored.");
  return true;
}

/* =========================================================================
   CHROME
   ========================================================================= */
let toastT=null;
function toast(msg){
  const t=$("#toast"); t.textContent=msg; t.classList.add("on");
  clearTimeout(toastT); toastT=setTimeout(()=>t.classList.remove("on"),2400);
}
$("#collapseBtn").onclick=()=>{
  state.rail=!state.rail;
  $("#app").classList.toggle("collapsed",!state.rail);
  $("#collapseBtn").querySelector(".ftext").textContent=state.rail?"Collapse menu":"Expand";
};
$("#bgBtn").onclick=sheetBackground;
$("#syncBtn").onclick=()=>toast("Saved in this browser only. Use Export to keep a backup.");
$("#exportBtn").onclick=()=>{
  const blob=new Blob([JSON.stringify({exportedAt:nowISO(),profile:state.profile,habits:state.habits,books:state.books,days:state.days},null,2)],{type:"application/json"});
  const a=el("a"); a.href=URL.createObjectURL(blob); a.download="upgrade-"+todayKey()+".json";
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(a.href),1000);
  toast("Backup downloaded.");
};
$("#importBtn").onclick=()=>$("#importFile").click();
$("#importFile").onchange=e=>{
  const f=e.target.files&&e.target.files[0]; if(!f) return;
  f.text().then(restoreBackup); e.target.value="";
};

/* =========================================================================
   BOOT
   ========================================================================= */
loadLocal();
ensureSeed();
resetRewardBaseline();
saveLocal();
renderAll();

/* Midnight rollover: if the tab is left open overnight, move to the new day. */
let lastDay=todayKey();
setInterval(()=>{
  const t=todayKey();
  if(t!==lastDay){
    if(state.selDate===lastDay) state.selDate=t;
    lastDay=t; state.calMonth=null; renderAll();
  }
},60000);
window.addEventListener("beforeunload",()=>{ saveLocal(); });
