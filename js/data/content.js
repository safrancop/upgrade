/* Static data for Upgrade. Loaded before js/app.js; top-level constants are shared through the global scope. */
"use strict";
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
