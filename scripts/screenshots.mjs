// Captures the README screenshots with fictional sample data. Usage: npm run screenshots
import {chromium} from 'playwright';
import {readFile,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const out=new URL('../docs/screenshots/',import.meta.url);await mkdir(out,{recursive:true});
const clock=new Date(),stamp=clock.toISOString(),date=clock.getFullYear()+'-'+String(clock.getMonth()+1).padStart(2,'0')+'-'+String(clock.getDate()).padStart(2,'0');
const source=await readFile(new URL('../js/data/exercises.js',import.meta.url),'utf8')+await readFile(new URL('../js/data/strength-standards.js',import.meta.url),'utf8');
const catalog=JSON.parse(source.match(/const EXERCISES=(\[[^\n]+\]);/)[1]);
const bench=catalog.find(e=>e.id==='Barbell_Bench_Press_-_Medium_Grip');
const fixture={profile:{name:'Alex',bodyweight:80,sex:'male',age:30,identity:['I make room for what matters.'],cardioGoal:{unit:'minutes',value:150},lessonIdx:0,lastLessonDay:date},
habits:[{id:'meditation',name:'Meditation',section:'meditate',target:10,unit:'min',hue:'dusk'},{id:'exercise',name:'Exercise',section:'move',target:30,unit:'min',hue:'clay'},{id:'reading',name:'Reading',section:'read',target:20,unit:'pages',hue:'sage'},{id:'Journal',name:'Journal',section:'journal',target:1,unit:'entry',hue:'lilac'}],
books:[{id:'book1',title:'Four Thousand Weeks',author:'Oliver Burkeman',page:84,pages:288,done:false},{id:'book2',title:'The Art of Stillness',author:'Pico Iyer',page:96,pages:96,done:true}],days:{}};
for(let i=0;i<10;i++){
  const d=new Date(date+'T12:00:00');d.setDate(d.getDate()-i);const k=d.toISOString().slice(0,10);
  fixture.days[k]={date:k,entries:{meditation:{done:true,value:10}},journal:{mood:3+i%3,morning:i?'A quiet walk before work. I noticed how much easier it was to focus.':'Today I want to give one thing my full attention.',evening:'A conversation worth remembering.',gratitude:['The morning light','A friend checking in','Time to read'],reflections:[]},meditation:[{minutes:10,kind:'Settle',at:stamp}],reading:[{bookId:'book1',pages:12,minutes:20,note:'Choose what matters and let the rest wait.',at:stamp}],exercise:[{kind:'Strength',minutes:45,note:'Earlier session — kept from the original log.',at:stamp},{schemaVersion:2,completed:i>0,minutes:i?30:0,kind:'Strength',at:stamp,note:'A steady session.',exercises:[{exerciseId:bench.id,name:bench.name,sets:[{reps:8,kg:70,rir:2},{reps:8,kg:75,rir:2,pr:true},{reps:10,kg:30,rir:5,warmup:true}]}]}],cardio:[{mode:'Running',minutes:20,distance:3,intensity:'Moderate',note:'An easy loop by the park.',at:stamp}]};
}
const memory=(Number(date.slice(0,4))-1)+date.slice(4);
fixture.days[memory]={date:memory,entries:{},journal:{mood:4,morning:'A year ago: starting something new.',gratitude:['A fresh start']}};
const standards=JSON.parse(source.match(/const STRENGTH_STANDARDS=(\[[^\n]+\]);/)[1]);
const prior=new Date(date+'T12:00:00');prior.setDate(prior.getDate()-1);
fixture.days[prior.toISOString().slice(0,10)].exercise[1].exercises=standards.map((s,i)=>({exerciseId:s.exerciseId,name:catalog.find(e=>e.id===s.exerciseId).name,sets:[{reps:1,kg:Math.round(s.male.body.find(row=>row[0]===80)[Math.min(5,i+1)]*(i===5?1.1:1)),rir:1}]}));
fixture.profile.lastExportAt=stamp;
const browser=await chromium.launch();
async function capture(width,height,shots){
  const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:2,reducedMotion:'reduce'});
  await context.addInitScript(data=>{if(!localStorage.getItem('upgrade.store.v1'))localStorage.setItem('upgrade.store.v1',JSON.stringify(data));},fixture);
  const page=await context.newPage();await page.goto(new URL('../index.html',import.meta.url).href);
  for(const [name,view,tab] of shots){
    if(view)await page.evaluate(([v,t])=>{if(t)state.tab[v]=t;go(v);},[view,tab]);
    await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(250);
    await page.screenshot({path:fileURLToPath(new URL(name+'.png',out))});
  }
  await context.close();
}
await capture(1440,900,[['today',null],['habits','habits'],['journal','journal','insights'],['meditation','meditate','breath'],['strength','move','strength']]);
await capture(390,844,[['mobile-today',null]]);
await browser.close();
console.log('Screenshots written to docs/screenshots/');
