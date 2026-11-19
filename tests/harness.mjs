import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {JSDOM, VirtualConsole} from 'jsdom';

import {html,appSource} from './source.mjs';
const freeze=o=>{if(o&&typeof o==='object'){Object.values(o).forEach(freeze);Object.freeze(o);}return o;};
const copy=o=>JSON.parse(JSON.stringify(o));
const tick=()=>new Promise(r=>setTimeout(r,10));

async function run(control=false){
  const errors=[];
  const vc=new VirtualConsole();
  vc.on('jsdomError',e=>errors.push(e.message));
  vc.on('error',(...args)=>errors.push(args.map(String).join(' ')));
  const dom=new JSDOM(html.replace(/<script[^>]*><\/script>/g,''),{
    url:'https://upgrade.test/',runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:vc
  });
  const w=dom.window;
  w.scrollTo=()=>{};
  w.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});
  const date=new Date(),k=date.getFullYear()+'-'+String(date.getMonth()+1).padStart(2,'0')+'-'+String(date.getDate()).padStart(2,'0');
  const old='2026-09-05',stamp='2030-01-01T00:00:00.000Z';
  const legacy={kind:'Strength',minutes:45,intensity:3,note:'Legacy session preserved',at:stamp};
  const records=freeze({
    'profile/main':{name:'Test person',identity:['I keep practising.'],lessonIdx:0,lastLessonDay:k,updatedAt:stamp},
    'habits/exercise':{id:'exercise',name:'Exercise',section:'move',target:30,unit:'min',days:[0,1,2,3,4,5,6],updatedAt:stamp},
    'habits/reading':{id:'reading',name:'Reading',section:'read',target:20,unit:'pages',updatedAt:stamp},
    'habits/meditation':{id:'meditation',name:'Meditation',section:'meditate',target:10,unit:'min',updatedAt:stamp},
    'habits/Journal':{id:'Journal',name:'Journal',target:1,unit:'entry',updatedAt:stamp},
    ['days/'+k]:{date:k,entries:{},journal:{mood:3,morning:'Original entry',evening:'',gratitude:['a','b','c'],reflections:[]},exercise:[legacy],meditation:[],reading:[],updatedAt:stamp},
    ['days/'+old]:{date:old,entries:{exercise:{done:true,value:45}},journal:{mood:4,morning:'Old journal',gratitude:['kept']},exercise:[legacy],updatedAt:stamp},
    'books/book1':{id:'book1',title:'Test book',author:'Author',page:10,pages:100,done:false,updatedAt:stamp}
  });
  // Seed the browser store the way a returning user would have it.
  const pick=prefix=>Object.entries(records).filter(([p])=>p.startsWith(prefix)).map(([,v])=>v);
  w.localStorage.setItem('upgrade.store.v1',JSON.stringify({
    profile:records['profile/main'],habits:pick('habits/'),books:pick('books/'),
    days:Object.fromEntries(pick('days/').map(d=>[d.date,d]))
  }));
  let source=appSource;
  if(control){const original=source;source=source.replace('function saveLocal(){\n','function saveLocal(){ return true;\n');assert.notEqual(source,original,'Control must disable saving');}
  try{
    const expose='\nwindow.testAPI={state,day,dayRO,go,setDone,pushDay,pushProfile,pushHabit,pushBook,logMeditation,renderView,weekKeys,restoreBackup,...(typeof addWorkoutSet==="function"?{addWorkoutSet,finishWorkout,trainingWeek,completedSets,EXERCISES}: {}),...(typeof weeklyVolume==="function"?{weeklyVolume,volumeTarget}: {}),...(typeof logCardio==="function"?{logCardio,cardioProgress}: {}),...(typeof strengthResults==="function"?{strengthThresholds,estimatedPercentile,strengthResults,STRENGTH_STANDARDS}: {})};';
    w.eval(source+expose+(source.includes('function journeyStats')?'\nwindow.uxAPI={journeyStats,earnedMilestones,resetRewardBaseline};':'')+(source.includes('function runMeditation')?'\nwindow.meditationAPI={runMeditation,runSession,finishMeditation,tickMeditation,practiceElapsed,courseCompleted,COURSE_SESSIONS,timerSettings};':'')+(source.includes('function searchJournal')?'\nwindow.journalAPI={searchJournal,journalMemories,saveWeekReview};':''));
    await tick();await tick();
    const a=w.testAPI;
    assert.ok(a,'App booted');
    if(source.includes('function runMeditation')){
      const m=w.meditationAPI;
      assert.equal(m.COURSE_SESSIONS.length,27);
      const originalNow=w.Date.now;let testNow=originalNow();w.Date.now=()=>testNow;
      const before=a.day(k).meditation.length;
      const options={...m.timerSettings(),prep:10,interval:1};
      m.runMeditation(m.COURSE_SESSIONS[0],k,options);
      testNow+=5000;m.tickMeditation();w.document.querySelector('#practicePause').click();
      testNow+=60000;m.tickMeditation();
      assert.equal(w.document.querySelector('#practiceTime').textContent,'0:05','Preparation pauses');
      w.document.querySelector('#practicePause').click();testNow+=65000;m.tickMeditation();
      w.document.querySelector('#practicePause').click();testNow+=60000;m.tickMeditation();
      assert.equal(w.document.querySelector('#practiceTime').textContent,'4:00','Practice pauses exclude time');
      w.document.querySelector('#practicePause').click();testNow+=240000;m.tickMeditation();
      assert.equal(a.day(k).meditation.length,before+1);
      assert.equal(a.day(k).meditation.at(-1).seconds,300);
      assert.equal(m.courseCompleted('sleep').size,1);
      m.finishMeditation(false);assert.equal(a.day(k).meditation.length,before+1,'Completion not logged twice');
      m.runMeditation(m.COURSE_SESSIONS[1],k,{...options,prep:0});testNow+=65000;m.finishMeditation(false);
      assert.equal(a.day(k).meditation.at(-1).completed,false,'Partial session does not advance course');
      assert.equal(m.courseCompleted('sleep').size,1);
      m.runMeditation(null,k,{...options,prep:0,mode:'open'});testNow+=90000;m.finishMeditation(false);
      assert.equal(a.day(k).meditation.at(-1).seconds,90);
      assert.throws(()=>a.logMeditation(-1,'Invalid',k));
      w.Date.now=originalNow;
    }
    a.day(k);
    if(w.document.querySelector('#sectionBack')){
      a.go('journal');a.state.tab.journal='insights';a.renderView('journal');a.go('read');
      w.document.querySelector('#sectionBack').click();assert.equal(a.state.view,'journal');assert.equal(a.state.tab.journal,'insights');
      w.document.querySelector('#sectionMenu').click();assert.equal(w.document.querySelector('#sectionMenu').getAttribute('aria-expanded'),'true');
      w.document.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape'}));assert.equal(w.document.querySelector('#sectionMenu').getAttribute('aria-expanded'),'false');
      a.go('meditate');a.state.tab.meditate='breath';a.renderView('meditate');
      assert.equal(w.document.querySelectorAll('[name="breath-art"]').length,3);
      for(const variant of ['rings','petals','orbits']){
        a.state.profile.breathArt=variant;
        [...w.document.querySelectorAll('#v-meditate button')].find(b=>b.textContent==='Begin').click();
        assert.ok(w.document.querySelector('#breathPractice svg g').children.length>=9);
        w.document.querySelector('#breathPractice .practice-back').click();assert.equal(w.document.querySelector('#breathPractice'),null);
      }
    }
    const nav=[...w.document.querySelectorAll('#nav .navitem')];
    let views=0,tabs=0;
    for(let i=0;i<nav.length;i++){
      w.document.querySelectorAll('#nav .navitem')[i].click();views++;
      const id=a.state.view,count=w.document.querySelectorAll('#v-'+id+' .tab').length;
      for(let j=0;j<count;j++){w.document.querySelectorAll('#v-'+id+' .tab')[j].click();tabs++;}
    }
    a.setDone(a.state.habits.find(h=>h.id==='exercise'),k,true);
    if(a.addWorkoutSet){
      assert.equal(a.EXERCISES.length,400);
      const ex=a.EXERCISES.find(e=>e.primary==='chest'&&e.equipment==='barbell');assert.ok(ex);
      const first=a.addWorkoutSet(ex.id,8,40,2);assert.equal(first.pr,false);
      const second=a.addWorkoutSet(ex.id,8,45,2);assert.equal(second.pr,true);
      const warmup=a.addWorkoutSet(ex.id,8,60,2,true);assert.equal(warmup.pr,false);
      assert.throws(()=>a.addWorkoutSet(ex.id,0,40,2));
      a.finishWorkout(20,'Finished test workout');
      assert.equal(a.state.days[k].exercise.reduce((n,x)=>n+(x.minutes||0),0),65);
      assert.equal(a.state.days[k].exercise[0].schemaVersion,undefined,'Legacy object not rewritten');
      assert.equal(a.state.days[k].entries.exercise.done,true);
      assert.equal(a.trainingWeek('2026-09-13')[0],'2026-09-07');
      assert.equal(a.trainingWeek('2026-09-14')[0],'2026-09-14');
      if(a.weeklyVolume){const volume=a.weeklyVolume();assert.equal(volume.unique,2);assert.equal(volume.muscles.chest.direct,2);for(const m of ex.secondary)assert.equal(volume.muscles[m].secondary,1);assert.equal(a.volumeTarget('chest'),6);}
      if(a.strengthThresholds){
        const standard=a.STRENGTH_STANDARDS[0],anchors=a.strengthThresholds(standard,{sex:'male',bodyweight:80,age:25});
        assert.deepEqual(copy(anchors),[56,75,98,124,151]);
        [5,20,50,80,95].forEach((p,i)=>assert.equal(a.estimatedPercentile(anchors[i],anchors),p));
        assert.equal(a.strengthThresholds(standard,{sex:'male',bodyweight:400,age:25}),null);
        assert.ok(a.strengthThresholds(standard,{sex:'male',bodyweight:80,age:60})[2]<anchors[2]);
      }
      a.go('move');a.state.tab.move='history';a.renderView('move');
      assert.match(w.document.querySelector('#v-move').textContent,/Legacy session preserved/);
    }
    a.logMeditation(10,'Harness meditation',k);
    if(a.logCardio){
      a.logCardio('Running',20,3,'Moderate','Test cardio');a.logCardio('Swimming',15,0.5,'Vigorous','Pool');
      assert.equal(a.cardioProgress().total.minutes,35);assert.equal(a.cardioProgress().total.sessions,2);assert.equal(a.cardioProgress().total.km,3.5);
      assert.throws(()=>a.logCardio('Running',-1,3,'Moderate','Invalid'));
    }
    a.go('journal');a.state.tab.journal='write';a.renderView('journal');
    const ta=w.document.querySelector('#v-journal textarea');ta.value='Saved through the journal UI';ta.dispatchEvent(new w.Event('input'));
    [...w.document.querySelectorAll('#v-journal button')].find(b=>b.textContent==='Save entry').click();
    assert.equal(a.state.days[k].entries.Journal.done,true);
    if(w.journalAPI){
      const j=w.journalAPI;
      assert.ok(j.searchJournal({query:'OLD JOURNAL'}).includes(old),'Case-insensitive full archive search');
      assert.equal(j.searchJournal({query:'not in any entry'}).length,0);
      assert.equal(j.searchJournal({from:'2026-09-06',to:'2026-09-06'}).length,0);
      assert.deepEqual(copy(j.journalMemories('2027-09-05')),[old]);
      j.saveWeekReview(old,{worked:'Old gratitude kept',learned:'A realistic schedule',next:'Ten minutes outside'});
      assert.equal(a.state.days[old].journal.morning,'Old journal');
      assert.equal(a.state.days[old].journal.gratitude[0],'kept');
      assert.ok(j.searchJournal({query:'realistic schedule'}).includes(old));
      assert.throws(()=>j.saveWeekReview(old,{}));
    }
    a.go('read');a.state.tab.read='now';a.renderView('read');
    [...w.document.querySelectorAll('#v-read button')].find(b=>b.textContent==='Log session').click();
    w.document.querySelector('#sheet #p').value='35';w.document.querySelector('#sheet #ok').click();
    a.state.profile.identity[0]='Changed safely';a.pushProfile();
    const h=a.state.habits.find(h=>h.id==='Journal');h.name='Journal';a.pushHabit(h);
    const b=a.state.books[0];b.done=true;a.pushBook(b);
    assert.deepEqual(copy(a.state.days[old].exercise[0]),copy(legacy));
    assert.equal(a.state.days[old].journal.morning,'Old journal');
    assert.equal(a.state.days[k].exercise[0].note,legacy.note);
    assert.equal(a.state.days[k].entries.meditation.done,true);
    // Everything above must already be on disk: read the store back and look.
    const stored=JSON.parse(w.localStorage.getItem('upgrade.store.v1'));
    assert.equal(stored.days[k].entries.meditation.done,true,'Check-offs persist to localStorage');
    const jText=j=>[j.morning,j.evening].join(' ');
    assert.match(jText(stored.days[k].journal),/Saved through the journal UI/,'Journal persists to localStorage');
    assert.equal(stored.profile.identity[0],'Changed safely','Profile persists to localStorage');
    // Restoring a backup: newer days win, new habits are added, the profile (goals) comes across.
    const backup={exportedAt:stamp,profile:{...stored.profile,plan:{goals:[{id:'g1',title:'Restored goal'}]},updatedAt:'2099-01-01T00:00:00.000Z'},
      habits:[{id:'water',name:'Water',target:2,unit:'L',updatedAt:stamp}],books:[],
      days:{'2026-01-02':{date:'2026-01-02',entries:{water:{done:true,value:2}},updatedAt:stamp}}};
    assert.equal(a.restoreBackup('not json'),false);
    assert.equal(a.restoreBackup(JSON.stringify(backup)),true);
    const after=JSON.parse(w.localStorage.getItem('upgrade.store.v1'));
    assert.equal(after.days['2026-01-02'].entries.water.done,true,'Restored day saved');
    assert.ok(after.habits.some(h=>h.id==='water'),'Restored habit saved');
    assert.equal(after.profile.plan.goals[0].title,'Restored goal','Restored goals saved');
    assert.match(jText(after.days[k].journal),/Saved through the journal UI/,'Restore keeps newer local days');
    if(w.uxAPI){
      a.go('today');
      const reading=a.state.habits.find(h=>h.id==='reading');
      a.day(k).entries.reading={done:false,value:5,at:'partial-progress'};a.pushDay(k);a.renderView('today');
      w.document.querySelector('[aria-label="Check off Reading"]').click();await tick();
      assert.equal(a.day(k).entries.reading.done,true);
      const undo=[...w.document.querySelectorAll('#winNotice button')].find(b=>b.textContent==='Undo');assert.ok(undo,'Quick check has an undo action');undo.click();
      assert.equal(a.day(k).entries.reading.value,5,'Undo restores partial progress');assert.equal(a.day(k).entries.reading.done,false);
      a.setDone(reading,k,true);await tick();
      ([...w.document.querySelectorAll('#v-today button')].find(b=>b.textContent==='Make it yours')||w.document.querySelector('#v-today .today-settings')).click();
      w.document.querySelector('[data-home-art="garden"]').click();
      assert.equal(a.state.profile.homeArt,'garden','Artwork saved into thawed profile');
      const quiet=w.document.querySelector('#celebrateWins');quiet.checked=false;quiet.dispatchEvent(new w.Event('change'));
      assert.equal(a.state.profile.celebrateWins,false);w.document.querySelector('#homePrefsDone').click();
      const originalDays=a.state.days;
      const sample={};for(let i=0;i<7;i++){const d=new Date(date);d.setDate(d.getDate()-i);const key=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');sample[key]={entries:{ritual:{done:true,value:1},partial:{done:false,value:5}}};}
      sample['2000-01-01']={entries:{archivedHabit:{done:true,value:1}}};sample['2999-01-01']={entries:{future:{done:true}}};
      a.state.days=sample;assert.deepEqual(copy(w.uxAPI.journeyStats()),{checks:8,days:8,best:7,returns:1},'History-derived totals exclude partial and future entries, include archived IDs and count real date gaps');
      assert.equal(w.uxAPI.earnedMilestones().length,5);a.state.days=originalDays;w.uxAPI.resetRewardBaseline();
    }
    await tick();
    assert.deepEqual(errors,[],'No view or event errors');
    return {views,tabs};
  }finally{dom.window.close();}
}

console.log('PASS full walkthrough:',await run());
if(process.argv.includes('--control')){
  let failure;
  try{await run(true);}catch(e){failure=e;}
  assert.ok(failure,'NEGATIVE CONTROL FAILED: saving disabled but tests still pass');
  console.log('PASS negative control: disabling saveLocal is caught:',String(failure).slice(0,180));
}
