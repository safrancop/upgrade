import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';

const url='https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json';
const response=await fetch(url);assert.ok(response.ok,'Exercise catalogue download failed');
const raw=await response.text(),source=JSON.parse(raw);
const map={abdominals:'core',abductors:'glutes',adductors:'quads',biceps:'biceps',calves:'calves',chest:'chest',forearms:'forearms',glutes:'glutes',hamstrings:'hamstrings',lats:'back','lower back':'back','middle back':'back',quadriceps:'quads',shoulders:'frontDelts',traps:'traps',triceps:'triceps'};
function muscles(list,name){return [...new Set(list.map(m=>m==='shoulders'?(/rear|reverse fly|face pull/i.test(name)?'rearDelts':/lateral|side raise/i.test(name)?'sideDelts':'frontDelts'):map[m]).filter(Boolean))];}
function pattern(name,m){
  if(/deadlift|good morning|swing|pull through/i.test(name))return 'Hinge';
  if(/squat|lunge|step.up|leg press/i.test(name))return 'Squat / lunge';
  if(/row/i.test(name))return 'Horizontal pull';
  if(/pull.up|chin.up|pulldown/i.test(name))return 'Vertical pull';
  if(/press|push.up|dip/i.test(name))return m==='chest'?'Horizontal push':'Vertical push';
  if(m==='core')return 'Core';return 'Isolation';
}
const eligible=source.filter(e=>['strength','powerlifting'].includes(e.category)&&e.primaryMuscles?.length&&['barbell','dumbbell','cable','machine','body only','kettlebells','bands','e-z curl bar'].includes(e.equipment));
const groups=new Map();
for(const e of eligible){const primary=muscles(e.primaryMuscles,e.name)[0];if(!primary)continue;const group=groups.get(primary)||[];group.push(e);groups.set(primary,group);}
const chosen=[];
for(let i=0;chosen.length<400;i++){let added=0;for(const group of groups.values()){if(group[i]&&chosen.length<400){chosen.push(group[i]);added++;}}if(!added)break;}
const catalog=chosen.map(e=>{const primary=muscles(e.primaryMuscles,e.name)[0];return {id:e.id,name:e.name,primary,secondary:muscles([...e.primaryMuscles.slice(1),...e.secondaryMuscles],e.name).filter(m=>m!==primary),equipment:e.equipment,category:e.category,pattern:pattern(e.name,primary)};}).sort((a,b)=>a.name.localeCompare(b.name));
assert.ok(catalog.length>=300&&catalog.length<=500);assert.equal(new Set(catalog.map(x=>x.id)).size,catalog.length);
const file=new URL('../js/data/exercises.js',import.meta.url),html=readFileSync(file,'utf8');
const re=/\/\* CATALOG START \*\/[\s\S]*?\/\* CATALOG END \*\//;
assert.ok(re.test(html));
writeFileSync(file,html.replace(re,'/* CATALOG START */\nconst EXERCISES='+JSON.stringify(catalog)+';\n/* CATALOG END */'),'utf8');
console.log(JSON.stringify({source:url,sha256:createHash('sha256').update(raw).digest('hex'),sourceCount:source.length,count:catalog.length,bytes:Buffer.byteLength(readFileSync(file)),muscles:[...groups.keys()]},null,2));
