import {readFileSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
const lifts=[['bench-press','Barbell_Bench_Press_-_Medium_Grip','chest'],['squat','Barbell_Squat','quads'],['deadlift','Barbell_Deadlift','posterior'],['shoulder-press','Barbell_Shoulder_Press','shoulders'],['bent-over-row','Bent_Over_Barbell_Row','back'],['barbell-curl','Barbell_Curl','arms']];
const output=[];
for(const [slug,exerciseId,part] of lifts){
  const url='https://strengthlevel.com/strength-standards/'+slug+'/kg';
  const r=await fetch(url);assert.ok(r.ok,url+' returned '+r.status);
  const d=new JSDOM(await r.text());
  const tables=[...d.window.document.querySelectorAll('table')];
  const extract=prefix=>tables.filter(t=>t.querySelector('tr')?.textContent.trim().startsWith(prefix)).map(t=>[...t.querySelectorAll('tr')].slice(1).map(tr=>[...tr.querySelectorAll('td,th')].map(c=>Number(c.textContent.trim()))).filter(row=>row.length===6&&row.every(Number.isFinite)));
  const body=extract('BW'),age=extract('Age');assert.equal(body.length,2,slug+' body tables');assert.equal(age.length,2,slug+' age tables');
  for(const table of [...body,...age]){assert.ok(table.length>=10);for(let i=0;i<table.length;i++){assert.ok(table[i].slice(2).every((v,j)=>v>table[i][j+1]));if(i)assert.ok(table[i][0]>table[i-1][0]);}}
  output.push({slug,exerciseId,part,source:url,male:{body:body[0],age:age[0]},female:{body:body[1],age:age[1]}});
  d.window.close();console.log(slug,body.map(t=>t.length),age.map(t=>t.length));
}
const file=new URL('../js/app.js',import.meta.url),html=readFileSync(file,'utf8');
const re=/\/\* STANDARDS START \*\/[\s\S]*?\/\* STANDARDS END \*\//;assert.ok(re.test(html));
writeFileSync(file,html.replace(re,'/* STANDARDS START */\nconst STRENGTH_STANDARDS='+JSON.stringify(output)+';\n/* STANDARDS END */'),'utf8');
console.log('Imported',output.length,'published standards. Bytes:',Buffer.byteLength(readFileSync(file)));
