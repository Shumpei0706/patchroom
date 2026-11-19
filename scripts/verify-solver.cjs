const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync(require('node:path').join(__dirname,'../src/app.js'),'utf8').split('function routeGraph(')[1].split('function wireName')[0];
const ends=[4,5],seeds=[0,1];
const ctx={performance,sinks:['pa','live'],outputUnit:k=>({inputs:new Map([['in',{id:k==='pa'?4:5}]])})};
vm.runInNewContext('function routeGraph('+source+';this.run=diagnose;',ctx);
let seed=41;function rand(){seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/2**32}
function inspect(links,goals,avoid){
 const m=Array.from({length:6},()=>Array(6).fill(false));
 for(const [a,b] of links)m[a][b]=true;
 for(let k=0;k<6;k++)for(let i=0;i<6;i++)for(let j=0;j<6;j++)m[i][j]||=m[i][k]&&m[k][j];
 const enough=ends.every((b,i)=>seeds.every((a,j)=>!(goals[i]&(1<<j))||m[a][b]));
 return {valid:enough&&ends.every((b,i)=>seeds.every((a,j)=>!(avoid[i]&(1<<j))||!m[a][b]))&&m.every((r,i)=>!r[i]),enough,m};
}
let impossible=0,multi=0;
for(let t=0;t<600;t++){
 const links=[],pairs=new Set();while(links.length<9){const a=Math.floor(rand()*6),b=Math.floor(rand()*6);if(a===b||pairs.has(a+','+b))continue;pairs.add(a+','+b);links.push([a,b])}
 const cables=links.filter(()=>rand()<.68),goals=[Math.floor(rand()*4),Math.floor(rand()*4)],avoid=goals.map(m=>Math.floor(rand()*4)&~m),base=inspect(links,goals,avoid),sends=links.filter(e=>!cables.includes(e)),method=t%2?'wire':'send',allowed=method==='wire'?cables:sends;
 const scene={avoid:{pa:avoid[0],live:avoid[1]},method,sends:new Map(sends.map(e=>[e.join('>'),e])),ports:Array(6),units:seeds.map((id,i)=>({role:i?'beat':'lead',outputs:new Map([['out',{id}]])})),goals:{pa:goals[0],live:goals[1]},cables};
 const d=ctx.run(scene,links,roots=>new Set([...roots,...base.m[roots[0]].flatMap((v,i)=>v?[i]:[])]));
 let min=Infinity;
 for(let mask=0;mask<1<<allowed.length;mask++){
  const selected=allowed.filter((_,i)=>mask&(1<<i));if(selected.length>=min)continue;
  if(inspect(links.filter(e=>!selected.includes(e)),goals,avoid).valid)min=selected.length;
 }
 if(!base.enough)assert.equal(d.reason,'missing');
 else if(min===Infinity){assert.equal(d.reason,'impossible');impossible++}
 else{assert.equal(d.reason,min===0?'clean':'solved');assert.equal(d.cuts.length,min);if(min>1)multi++}
}
console.log('600 include/exclude and send/cable graphs matched exhaustive cut enumeration',{impossible,multi});
