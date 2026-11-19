const $=id=>document.getElementById(id);
const devices={
 mic:{get name(){return L("マイク","Microphone")},en:'MIC INPUT',x:79,y:196,icon:'mic',out:true},
 mix:{get name(){return L("ミキサー","Mixer")},en:'MIX DESK',x:272,y:198,icon:'mix',out:true,input:true},
 fx:{get name(){return L("エフェクト","FX unit")},en:'FX UNIT',x:311,y:70,icon:'fx',out:true,input:true},
 bus:{get name(){return L("客席バス","Main bus")},en:'MAIN BUS',x:506,y:122,icon:'bus',out:true,input:true},
 usb:{get name(){return L("USB戻り","USB return")},en:'USB RETURN',x:483,y:314,icon:'usb',out:true,input:true},
 pa:{get name(){return L("客席","House PA")},en:'HOUSE PA',x:714,y:107,icon:'pa',input:true},
 live:{get name(){return L("配信","Stream")},en:'STREAM',x:714,y:266,icon:'live',input:true}
};
const mids=['mix','fx','bus','usb'],sinks=['pa','live'];
const presets={clean:['mic>mix','mix>bus','bus>pa','mix>live'],single:['mic>mix','mix>bus','bus>pa','mix>live','bus>usb','usb>mix'],double:['mic>mix','mix>bus','bus>pa','mix>live','bus>usb','usb>bus','mix>fx','fx>mix'],blank:[]};
const cycleQuery='MATCH p=(n:Port)-[:SIGNAL*1..4]->(n) RETURN [x IN nodes(p) | x.id] AS route';
const pathQuery="MATCH p=(:Port {id:'mic'})-[:SIGNAL*1..6]->(n:Port) RETURN [x IN nodes(p) | x.id] AS route";
const colors={loop:'#fc8964',on:'#9ae4c2',off:'#81929b',wire:'#17272e',pa:'#b4ecd4',live:'#9ad9f9'};
const names=r=>r.map(id=>devices[id].name).join(' → '),parts=k=>k.split('>'),edgekeys=r=>r.slice(1).map((id,i)=>r[i]+'>'+id);
const rotations=r=>r.map((_,i)=>r.slice(i).concat(r.slice(0,i)).join('>'));
function permutations(items){return items.length?items.flatMap((id,i)=>permutations(items.filter((_,j)=>j!==i)).map(rest=>[id,...rest])):[[]]}
const allOrders=permutations(mids);
let db,model,edges=new Set(presets.single),history=[],index=0,preview=false,source=null,selected=null,focusRoute=null,feedback='',scene='single';
function execute(q){const v=JSON.parse(db.execute(q));if(v.error)throw Error(v.error.message||JSON.stringify(v.error));return v.rows}
function compute(){
 db.reset();
 execute('CREATE '+Object.keys(devices).map(id=>'('+id+':Port {id:"'+id+'"})').concat([...edges].map(k=>{const [a,b]=parts(k);return '('+a+')-[:SIGNAL]->('+b+')'})).join(', '));
 const unique=new Map();
 for(const {route} of execute(cycleQuery)){
  const core=route.slice(0,-1);if(new Set(core).size!==core.length)continue;
  const key=rotations(core).sort()[0];if(!unique.has(key))unique.set(key,core.concat(core[0]));
 }
 const cycles=[...unique.values()].sort((a,b)=>a.length-b.length);
 const routes=execute(pathQuery).map(row=>row.route).filter(r=>new Set(r).size===r.length).sort((a,b)=>a.length-b.length||a.join().localeCompare(b.join()));
 const targets=sinks.map(id=>routes.filter(r=>r.at(-1)===id));
 const solutions=new Map();let min=Infinity;
 if(cycles.length&&targets.every(group=>group.length)){
  for(const order of allOrders){
   const cuts=[...edges].filter(k=>{const [a,b]=parts(k);return mids.includes(a)&&mids.includes(b)&&order.indexOf(a)>=order.indexOf(b)}).sort();
   if(cuts.length>min)continue;
   const removed=new Set(cuts),kept=routes.filter(r=>edgekeys(r).every(k=>!removed.has(k)));
   const proof=sinks.map(id=>kept.find(r=>r.at(-1)===id));if(proof.some(r=>!r))continue;
   if(cuts.length<min){min=cuts.length;solutions.clear()}
   solutions.set(cuts.join('|'),{cuts,proof,coverage:new Set(kept.map(r=>r.at(-1))).size});
  }
 }
 const options=[...solutions.values()].sort((a,b)=>b.coverage-a.coverage||a.cuts.join().localeCompare(b.cuts.join()));
 return {cycles,routes,targets,options};
}
function change(next,label,nextScene='custom'){history.push({edges:[...edges],scene});edges=new Set(next);scene=nextScene;afterChange(label)}
function afterChange(label){model=compute();preview=false;index=0;source=selected=focusRoute=null;feedback=label;render()}
function toggle(k){const next=new Set(edges);const exists=next.delete(k);if(!exists)next.add(k);change(next,names(parts(k))+(exists?L(" の線を外しました。"," disconnected."):L(" を接続しました。"," connected.")))}
function jack(id,dir){
 preview=false;focusRoute=selected=null;
 if(dir==='out'){source=source===id?null:id;feedback=source?devices[id].name+L(" の送り先の IN を選択。もう一度 OUT を押すとキャンセル。"," — select a destination IN, or press OUT again to cancel."):''}
 else if(source){const k=source+'>'+id;if(edges.has(k)){feedback=L("すでに接続されています。線を選ぶと外せます。","Already connected. Select the cable to remove it.");source=null}else{toggle(k);return}}
 else feedback=L("先に、音を送る機器の OUT を選んでください。","Select the source device’s OUT first.");
 render();
}
const spriteImages={"mic": "ASSET_URI(gear-2.png)", "mix": "ASSET_URI(gear-3.png)", "fx": "ASSET_URI(gear-4.png)", "bus": "ASSET_URI(gear-5.png)", "usb": "ASSET_URI(gear-6.png)", "pa": "ASSET_URI(gear-7.png)", "live": "ASSET_URI(gear-8.png)"};
const custom={
 'mic>mix':'M142 208 C173 208 185 210 209 210','mix>bus':'M335 210 C388 210 381 134 443 134','bus>pa':'M569 134 C600 134 614 119 651 119',
 'mix>live':'M335 210 C445 210 515 278 651 278','bus>usb':'M569 134 C630 134 613 226 577 232 S393 252 393 292 Q390 326 420 326',
 'usb>mix':'M546 326 C595 326 589 382 539 382 H225 C155 382 153 210 209 210',
 'usb>bus':'M546 326 C632 326 622 192 548 187 S411 198 411 162 Q411 134 443 134',
 'mix>fx':'M335 210 C405 210 415 146 356 133 S196 142 205 102 Q208 82 248 82',
 'fx>mix':'M374 82 C427 82 399 39 367 32 C303 12 176 24 166 83 S148 210 209 210'
};
function curve(k){if(custom[k])return custom[k];const [a,b]=parts(k),start=devices[a],end=devices[b],x=start.x+63,y=start.y+12,u=end.x-63,v=end.y+12;
 if(a===b)return 'M'+x+' '+y+' C'+(x+43)+' '+y+' '+(x+44)+' '+(y+65)+' '+start.x+' '+(y+65)+' S'+(u-47)+' '+y+' '+u+' '+v;
 if(u>=x+15){const bend=Math.max(30,(u-x)*.43);return 'M'+x+' '+y+' C'+(x+bend)+' '+y+' '+(u-bend)+' '+v+' '+u+' '+v}
 const lane=(y+v)/2+(Math.abs(y-v)<75?70:0);return 'M'+x+' '+y+' C'+(x+72)+' '+y+' '+(x+45)+' '+lane+' '+((x+u)/2)+' '+lane+' S'+(u-70)+' '+v+' '+u+' '+v
}
function svgText(x,y,value,size,color,more=''){return '<text x="'+x+'" y="'+y+'" font-size="'+size+'" fill="'+color+'" '+more+'>'+value+'</text>'}
function stamp(id,on){
 const n=devices[id],dim=on?1:.66,chosen=source===id;
 const labelWidth=Math.max(63,n.name.length*(language==='en'?8:14)+16);
 let s='<g transform="translate('+n.x+' '+n.y+')">';
 s+='<path d="M-58 12h116 M-52 18h104" stroke="#131120" stroke-width="4"/>';
 s+='<path d="M-56 12h112" stroke="'+(on?'#71828f':'#4e4f68')+'" stroke-width="2"/>';
 s+='<image class="gear" href="'+spriteImages[id]+'" x="-59" y="-59" width="118" height="88" opacity="'+dim+'"/>';
 s+='<rect x="'+(-labelWidth/2)+'" y="29" width="'+labelWidth+'" height="18" fill="#171525" stroke="'+(chosen?'#ffdc87':'#504a65')+'"/>';
 s+=svgText(0,42,n.name,12,'#fff3dc','text-anchor="middle" font-weight="720"');
 for(const [dir,exists,px] of [['in',n.input,-63],['out',n.out,63]]){
  if(!exists)continue;
  const lit=(chosen&&dir==='out')||(source&&dir==='in'),color=lit?'#ffe58e':(dir==='out'?'#99e9d2':'#c8c3dc');
  s+='<g class="jack" data-jack="'+id+':'+dir+'" role="button" tabindex="0" aria-label="'+n.name+' '+dir.toUpperCase()+'"><title>'+n.name+' '+dir.toUpperCase()+'</title>';
  s+='<rect x="'+(px-13)+'" y="-2" width="26" height="30" fill="transparent"/><rect class="hitport" x="'+(px-6)+'" y="6" width="12" height="12" fill="#161322" stroke="'+color+'" stroke-width="'+(lit?3:2)+'"/><rect x="'+(px-2)+'" y="10" width="4" height="4" fill="'+color+'"/>';
  s+=svgText(px,1,dir.toUpperCase(),8,color,'text-anchor="middle" stroke="#1b192d" stroke-width="2.5" paint-order="stroke"')+'</g>';
 }
 return s+'</g>'
}
function draw(){
 const opt=model.options[index],cuts=new Set(preview&&opt?opt.cuts:[]),survive=r=>edgekeys(r).every(k=>!cuts.has(k)),liveRoutes=model.routes.filter(survive);
 const reachable=new Set(['mic',...liveRoutes.map(r=>r.at(-1))]);
 const cycleKeys=new Set(model.cycles.filter(survive).flatMap(edgekeys)),focusKeys=new Set(focusRoute?edgekeys(focusRoute.path):[]);
 const template='<defs><pattern id="floor" width="64" height="32" patternUnits="userSpaceOnUse"><rect width="64" height="32" fill="#202035"/><path d="M0 16 32 0l32 16-32 16z" stroke="#303045" fill="none"/><path d="M0 18 32 2" stroke="#27283d" fill="none"/><path d="M15 25h2m32-17h2" stroke="#3a384e"/></pattern></defs><rect width="800" height="410" fill="url(#floor)"/>';
 const curves=[...edges].map(k=>{const [a]=parts(k),gone=cuts.has(k),highlight=focusKeys.has(k);
 const col=highlight?focusRoute.col:gone?colors.loop:cycleKeys.has(k)?colors.loop:reachable.has(a)?colors.on:colors.off;
 const dim=focusRoute&&!highlight?.20:1;
 return '<g class="wire" data-key="'+k+'" opacity="'+dim+'"><title>'+names(parts(k))+'</title><path d="'+curve(k)+'" stroke="transparent" stroke-width="17" fill="none"/><path class="wirebase" d="'+curve(k)+'" stroke="'+col+'" stroke-width="'+(selected===k||highlight?6:3.6)+'" fill="none" '+(gone||!reachable.has(a)?'stroke-dasharray="4 7"':'')+'/>'+(!gone&&reachable.has(a)?'<path class="flow" d="'+curve(k)+'" fill="none" stroke="#172a32" stroke-width="1.75"/>':'')+'</g>'
 });
 $('patch').innerHTML=template+curves.join('')+Object.keys(devices).map(id=>stamp(id,reachable.has(id))).join('');
 for(const g of $('patch').querySelectorAll('.wire')){
 const k=g.dataset.key,p=g.querySelector('.wirebase'),length=p.getTotalLength(),pt=p.getPointAtLength(length*.54),next=p.getPointAtLength(length*.54+1);
 const mark=document.createElementNS('http://www.w3.org/2000/svg','g');mark.setAttribute('transform','translate('+pt.x+' '+pt.y+')');mark.setAttribute('pointer-events','none');
 if(cuts.has(k)){mark.innerHTML='<circle r="9" fill="#14252c" stroke="#fc8964"/><path d="m-3 -3 6 6 m0 -6 -6 6" stroke="#fc8964" stroke-width="2"/>'}
 else if(opt?.cuts.includes(k)){mark.innerHTML='<circle r="12" fill="#ffcf82" stroke="#253239" stroke-width="2"/><g stroke="#27323a" stroke-width="1.5" fill="none"><circle cx="-4" cy="-3" r="2"/><circle cx="-4" cy="3" r="2"/><path d="M-2 -2l8 6M-2 2l8 -6"/></g>'}
 else{const deg=Math.atan2(next.y-pt.y,next.x-pt.x)*180/Math.PI;mark.innerHTML='<path d="M-5 -4 L3 0 L-5 4" fill="none" stroke="'+p.getAttribute('stroke')+'" stroke-width="2.7" transform="rotate('+deg+')"/>'}g.append(mark)
 }
 return reachable;
}
function action(parent,label,fn,cls='',pressed=null){const b=document.createElement('button');b.textContent=label;b.className=cls;b.onclick=fn;if(pressed!==null)b.setAttribute('aria-pressed',String(pressed));parent.append(b);return b}
function trail(parent,label,route,col){const b=action(parent,'',()=>{focusRoute=focusRoute&&focusRoute.label===label?null:{label,path:route,col};render()},'trail',focusRoute?.label===label);b.style.setProperty('--trail',col);b.innerHTML='<small>'+label+'</small><span>'+route.map(id=>devices[id].name).join('<i>→</i>')+'</span>';b.title=L("クリックで図の経路を強調","Highlight this route")}
function panel(reach){
 document.querySelector("header").classList.toggle("powerlost",!reach.has("pa"));
 $('targets').innerHTML=sinks.map(id=>'<span class="target '+(reach.has(id)?'':'off')+'">'+(reach.has(id)?'✓ ':'× ')+devices[id].name+(reach.has(id)?L(" に到達"," connected"):L(" が未接続"," disconnected"))+'</span>').join('');
 const box=$('analysis'),opt=model.options[index];box.replaceChildren();
 const section=document.createElement('div');section.className='panel';box.append(section);
 if(!opt){const missing=sinks.filter(id=>!reach.has(id));section.innerHTML='<div class="finding">'+(missing.length?L("出力への線が必要","Output disconnected"): L("配線は正常","Patch is clear"))+'</div><p class="lead">'+(missing.length?names(missing).replace(' → ',L("・"," / "))+L("への経路が途切れています。"," has no signal path.")+(model.cycles.length?L("卓内にはループが残っています。"," A loop remains."):L("卓内のループはありません。"," No loop detected.")):L("循環はありません。切る必要のある線は0本です。","No loop detected. Keep all cables connected."))+'</p>';
 if(model.cycles.length)trail(section,L("残っているループの例","Example loop"),model.cycles[0],colors.loop);for(const [i,target] of model.targets.entries())if(target.length)trail(section,L("現在の","Current ")+devices[sinks[i]].name+L("経路"," path"),target[0],colors[sinks[i]]);return}
 section.innerHTML='<div class="nav"><span class="alt">'+(preview?L("切断後のプレビュー","Previewing cuts"):L("候補 ","Option ")+(index+1)+' / '+model.options.length)+L("</span><div id=\"arrows\"></div></div><div class=\"finding\">最少 <strong>","</span><div id=\"arrows\"></div></div><div class=\"finding\">Disconnect <strong>")+opt.cuts.length+L("本</strong> を外す</div><p class=\"cutname\">"," cable(s)</strong></div><p class=\"cutname\">")+opt.cuts.map(k=>'✂ '+names(parts(k))).join('<br>')+'</p>';
 if(model.options.length>1){for(const [label,diff] of [['‹',-1],['›',1]]){const b=action($('arrows'),label,()=>{index=(index+diff+model.options.length)%model.options.length;focusRoute=null;render()});b.setAttribute('aria-label',diff<0?L("前の候補","Previous option"):L("次の候補","Next option"))}}
 const why=document.createElement('div');why.className='why';section.append(why);
 for(const [i,k] of opt.cuts.entries()){const cycle=model.cycles.find(r=>{const ks=edgekeys(r);return ks.includes(k)&&opt.cuts.every(other=>other===k||!ks.includes(other))});if(cycle)trail(why,opt.cuts.length===1?L("この線で断てるループ","Loop interrupted by this cable"):L("切断 ","Cut ")+(i+1)+L(" が必要な理由"," · why this cut works"),cycle,colors.loop)}
 opt.proof.forEach((r,i)=>trail(why,L("切断後も残る","Retained ")+devices[sinks[i]].name+L("経路"," path"),r,colors[sinks[i]]));
 action(section,preview?L("✓ この切断を適用する","✓ Apply these cuts"):L("切断後の図を見る","Preview these cuts"),()=>{focusRoute=null;if(preview){const next=new Set(edges);opt.cuts.forEach(k=>next.delete(k));change(next,opt.cuts.length+L("本を外しました。"," cable(s) removed."))}else{preview=true;source=selected=null;feedback=L("点線と × が外す線です。まだ配線には適用していません。","Dashed lines and crosses show proposed cuts.");render()}},'primary');
 if(preview)action(section,L("現在の配線に戻る","Back to current patch"),()=>{preview=false;focusRoute=null;feedback='';render()},'preview')
}
function syncList(){const exists=edges.has($('from').value+'>'+$('to').value);$('edit').textContent=exists?L("この線を外す","Disconnect cable"):L("この線をつなぐ","Connect cable")}
function render(){const reach=draw();panel(reach);updateSound();$('preset').value=scene;$('undo').disabled=!history.length;$('mode').textContent=preview?L("切断後のプレビュー","Previewing cuts"):L("現在の配線 · ","Current patch · ")+edges.size+L(" 本"," cable(s)");syncList();const note=$('notice');note.replaceChildren();
 if(selected){note.append(L("選択中　","Selected ")+names(parts(selected))+'　');action(note,L("この線を外す","Disconnect cable"),()=>toggle(selected));action(note,L("選択解除","Deselect"),()=>{selected=null;feedback='';render()})}
 else note.textContent=feedback||L("配線するには、機器の OUT → 別の機器の IN の順にクリック。線を選ぶと外せます。","Select OUT on one device, then IN on another. Select a cable to disconnect it.")}
function clickPatch(e){const j=e.target.closest('[data-jack]');if(j){const [id,dir]=j.dataset.jack.split(':');jack(id,dir);return}const w=e.target.closest('[data-key]');if(w){selected=w.dataset.key;preview=false;focusRoute=source=null;render()}}
$('patch').onclick=clickPatch;$('patch').onkeydown=e=>{if((e.key==='Enter'||e.key===' ')&&e.target.closest('[data-jack]')){e.preventDefault();const key=e.target.closest('[data-jack]').dataset.jack;clickPatch(e);$('patch').querySelector('[data-jack="'+key+'"]')?.focus()}};
document.addEventListener('keydown',e=>{if(!csvActive&&e.key==='Escape'){source=selected=focusRoute=null;preview=false;feedback='';render()}});
$('preset').onchange=e=>{const key=e.target.value;if(presets[key])change(presets[key],L("配線例を開きました。OUT → IN で編集できます。","Scene loaded. Select OUT, then IN to edit."),key)};
$('undo').onclick=()=>{const prev=history.pop();if(!prev)return;scene=prev.scene;edges=new Set(prev.edges);afterChange(L("直前の操作を戻しました。","Last change undone."))};
function populatePatchPorts(){const a=$('from').value,b=$('to').value;$('from').replaceChildren();$('to').replaceChildren();for(const [id,n] of Object.entries(devices)){if(n.out)$('from').add(new Option(n.name+' OUT',id));if(n.input)$('to').add(new Option(n.name+' IN',id))}if(a)$('from').value=a;if(b)$('to').value=b}populatePatchPorts();
$('from').onchange=$('to').onchange=syncList;$('edit').onclick=()=>toggle($('from').value+'>'+$('to').value);
// One original four-bar loop feeds the entire patch. Changing the monitor never restarts it.
const sound={ctx:null,source:null,volume:null,meter:null,branch:null,playing:false,changing:false,output:'pa',key:'',raf:0};
function makeBand(ctx,stem="all"){
 const rate=22050, step=.14, length=Math.round(rate*step*64);
 const buffer=ctx.createBuffer(1,length,rate),song=buffer.getChannelData(0);
 const lead=[76,0,79,0,83,0,0,0,81,79,0,76,0,0,0,0,74,0,78,0,81,0,0,0,79,78,0,74,0,0,0,0];
 const roots=[40,38,36,38],tau=2*Math.PI;
 let seed=419;
 for(let i=0;i<length;i++){
  const t=i/rate, slot=Math.floor(t/step),u=t-slot*step,beat=slot%16,bar=Math.floor(slot/16);
  const midi=lead[slot%32],hz=440*2**((midi-69)/12),bass=440*2**((roots[bar%4]-69)/12);
  seed=(Math.imul(seed,1664525)+1013904223)>>>0;
  const noise=2*seed/4294967296-1,pluck=Math.min(1,u/.008)*Math.exp(-u*24);
  let v=midi?.25*pluck*(Math.sin(tau*hz*u)+.32*Math.sin(tau*2*hz*u)+.10*Math.sin(tau*3*hz*u)):0;
  if(stem==="beat")v=0;
  if(stem!=="lead"&&(beat%4===0||beat===10))v+=.22*pluck*Math.sin(tau*bass*u)+.13*Math.exp(-u*29)*Math.sin(tau*(47*u+2*(1-Math.exp(-32*u))));
  if(stem!=="lead"&&(beat===4||beat===12))v+=noise*.11*Math.exp(-u*36);
  if(stem!=="lead"&&beat%2===0)v+=noise*.025*Math.exp(-u*95);
  song[i]=v*Math.min(1,u/.002,(step-u)/.004);
 }
 return buffer;
}
// Propagate a finite impulse through all active sends, including repeat visits.
// A 5 ms grid and attenuated returns make wiring changes audible without runaway feedback.
function response(ctx,wires,sink){
 const ticks=340,ids=Object.keys(devices),empty=()=>Object.fromEntries(ids.map(id=>[id,new Float64Array(ticks)]));
 const hops=wires.map(parts),arrivals=empty(),target=arrivals[sink];
 const inCount={};for(const [,b] of hops)inCount[b]=(inCount[b]||0)+1;
 const filters={mic:[[0,1]],mix:[[3,.96]],bus:[[4,.93]],usb:[[36,.83]],fx:[[3,.35],[48,.70],[81,.30]]};
 let front=empty();front.mic[0]=1;
 for(let n=0;n<18;n++){
  const next=empty();
  for(const [a,b] of hops){
   const split=1/Math.sqrt(inCount[b]),dest=sinks.includes(b)?arrivals[b]:next[b];
   for(const [offset,level] of filters[a]){
    const weight=level*split,from=front[a];for(let j=0;j<ticks-offset;j++)dest[j+offset]+=from[j]*weight;
   }
  }
  front=next;
 }
 const stride=Math.round(ctx.sampleRate*.005);
 const room=sink==='pa'?[[[0,.85],[7,.30],[15,.19],[29,.11]],[[0,.83],[10,.29],[19,.18],[35,.10]]]:[[[0,1]],[[0,1]]];
 const channels=room.map(taps=>{const out=new Float64Array(ticks+36);for(const [delay,g] of taps)for(let j=0;j<ticks;j++)out[j+delay]+=target[j]*g;return out});
 let last=0,total=0;
 for(const channel of channels){let sum=0;channel.forEach((v,i)=>{if(Math.abs(v)>1e-5)last=Math.max(last,i);sum+=Math.abs(v)});total=Math.max(total,sum)}
 const ir=ctx.createBuffer(2,Math.max(128,last*stride+1),ctx.sampleRate);
 const trim=Math.min(1,1.85/Math.max(total,.001));channels.forEach((channel,c)=>{const data=ir.getChannelData(c);for(let i=0;i<=last;i++)data[i*stride]=channel[i]*trim});
 return ir;
}
const voiceClips=VOICE_CLIPS;
function makeVoice(ctx,key){
 const packed=atob(voiceClips[key]),samples=new DataView(Uint8Array.from(packed,c=>c.charCodeAt(0)).buffer);
 const track=ctx.createBuffer(1,16000*7,16000),channel=track.getChannelData(0),start=key==='guest'?16000*3:0;
 for(let i=0;i<samples.byteLength/2&&start+i<channel.length;i++)channel[start+i]=samples.getInt16(i*2,true)/32768*.65;
 return track;
}
function activeWires(){const cuts=new Set(preview?model.options[index]?.cuts:[]);return [...edges].filter(k=>!cuts.has(k))}
function updateSound(){
 if(csvActive){syncVenueMonitor();return}
 const wires=activeWires(),out=sound.output,blocked=!model.routes.some(r=>r.at(-1)===out&&edgekeys(r).every(k=>wires.includes(k)));
 for(const id of sinks)$('listen-'+id).setAttribute('aria-pressed',String(out===id));
 $('transport').textContent=sound.playing?L("■ 停止","■ Stop"):L("▶ 試聴を開始","▶ Listen");
 $('listen-status').textContent=(preview?L("切断後の試聴 · ","Preview · "):'')+(blocked?L("経路なし · 無音","No path · silent"):out==='pa'?L("客席 · ホールの反射音","House PA · room reflections"):L("配信 · ライン音声","Stream · direct feed"));
 const end=wires.filter(k=>parts(k)[1]===out);$('pull-end').disabled=preview||!end.length;
 $('pull-end').textContent=devices[out].name+L("への線を外す"," · disconnect feed")+(end.length>1?'（'+end.length+L("本）"," cables)"):'');
 if(!sound.playing)return;
 const key=out+'|'+wires.slice().sort().join('|');if(key===sound.key)return;
 setAudibleBranch(key,blocked?[]:[sound.source],()=>response(sound.ctx,wires,out));
}
function setAudibleBranch(key,inputs,makeResponse){
 const ctx=sound.ctx,now=ctx.currentTime;
 const old=sound.branch;
 if(old){
  old.gate.gain.cancelAndHoldAtTime(now);old.gate.gain.linearRampToValueAtTime(0,now+.035);
  setTimeout(()=>{for(const {input,fx} of old.groups){input.stop();input.disconnect();fx.disconnect()}old.gate.disconnect()},90);
 }
 sound.key=key;sound.branch=null;
 if(!inputs.length)return;
 const gate=ctx.createGain();
 gate.gain.setValueAtTime(0,now);gate.gain.linearRampToValueAtTime(1,now+.035);
 // Reconstruct phase from the shared transport clock whenever an inaudible stem returns.
 // A disconnected AudioBufferSource may stop advancing in some browser audio engines.
 const groups=inputs.map(buffer=>{
  const fx=ctx.createConvolver();fx.normalize=false;fx.buffer=makeResponse(buffer);
  const input=ctx.createBufferSource();input.buffer=buffer;input.loop=true;
  input.connect(fx);fx.connect(gate);return {input,fx};
 });
 gate.connect(sound.volume);
 const when=Math.max(sound.epoch,ctx.currentTime+.012);
 for(const {input} of groups)input.start(when,(when-sound.epoch)%input.buffer.duration);
 sound.branch={gate,groups};
}
function sampleMeter(){
 if(!sound.playing)return;
 const samples=new Float32Array(sound.meter.fftSize);sound.meter.getFloatTimeDomainData(samples);
 const rms=Math.sqrt(samples.reduce((s,v)=>s+v*v,0)/samples.length);
 $('listen-vu').value=Math.min(1,rms*10);
 sound.raf=requestAnimationFrame(sampleMeter);
}
$('transport').onclick=async()=>{
 if(sound.changing)return;sound.changing=true;
 try{
  if(!sound.ctx){const ctx=sound.ctx=new AudioContext();sound.volume=ctx.createGain();sound.meter=ctx.createAnalyser();sound.meter.fftSize=1024;
   sound.source=makeBand(ctx,'all');
   sound.stems={lead:makeBand(ctx,'lead'),beat:makeBand(ctx,'beat')};
   sound.voices={lead:makeVoice(ctx,'onsite'),beat:makeVoice(ctx,'guest')};
   sound.epoch=ctx.currentTime+.02;
   sound.volume.gain.value=Number($('listen-vol').value)/100;sound.volume.connect(sound.meter);sound.meter.connect(ctx.destination)}
  if(sound.playing){await sound.ctx.suspend();sound.playing=false;cancelAnimationFrame(sound.raf);$('listen-vu').value=0}
  else{await sound.ctx.resume();sound.playing=true}
  updateSound();if(sound.playing)sampleMeter()
 }catch(e){$('listen-status').textContent=L("再生できませんでした。再生ボタンでもう一度お試しください。","Playback could not start. Select Listen to retry.");console.error(e)}finally{sound.changing=false}
};
for(const id of sinks)$('listen-'+id).onclick=()=>{sound.output=id;updateSound()};
$('listen-vol').oninput=()=>{if(sound.ctx)sound.volume.gain.setTargetAtTime(Number($('listen-vol').value)/100,sound.ctx.currentTime,.015)};
$('pull-end').onclick=()=>{const out=sound.output;change([...edges].filter(k=>parts(k)[1]!==out),devices[out].name+L("へ入る線を外しました。「元に戻す」で復元できます。"," feed disconnected. Select Undo to restore it."))};

const sampleCsv="送信機器,送信端子,受信機器,受信端子,送信機器の役割,受信機器の役割\nリードシンセ,OUT,FOH卓,CH 1,メロディ,ミキサー\nリズムマシン,OUT,FOH卓,CH 2,リズム,ミキサー\nFOH卓,MAIN,客席PA,LINE IN,ミキサー,客席\nFOH卓,AUX 1,配信PC,INPUT 1,ミキサー,配信\n";
const loopCsv="送信機器,送信端子,受信機器,受信端子,送信機器の役割,受信機器の役割,接続種別\nリードシンセ,OUT,FOH卓,CH 1,メロディ,ミキサー,ケーブル\nリズムマシン,OUT,FOH卓,CH 2,リズム,ミキサー,ケーブル\nFOH卓,MAIN,客席PA,LINE IN,ミキサー,客席,ケーブル\nFOH卓,AUX 1,配信PC,INPUT 1,ミキサー,配信,ケーブル\nFOH卓,FX SEND,FOH卓,FX RETURN,ミキサー,ミキサー,ケーブル\nFOH卓,CH 1,FOH卓,MAIN,ミキサー,ミキサー,卓内送り\nFOH卓,CH 2,FOH卓,MAIN,ミキサー,ミキサー,卓内送り\nFOH卓,CH 1,FOH卓,AUX 1,ミキサー,ミキサー,卓内送り\nFOH卓,CH 1,FOH卓,FX SEND,ミキサー,ミキサー,卓内送り\nFOH卓,FX RETURN,FOH卓,FX SEND,ミキサー,ミキサー,卓内送り\nFOH卓,FX RETURN,FOH卓,MAIN,ミキサー,ミキサー,卓内送り\nFOH卓,FX RETURN,FOH卓,AUX 1,ミキサー,ミキサー,卓内送り\n";
const meetingCsv="送信機器,送信端子,受信機器,受信端子,送信機器の役割,受信機器の役割,接続種別\n会場マイク,OUT,音響卓,CH 1,会場マイク,ミキサー,ケーブル\n通話相手,USB OUT,音響卓,CH 2,通話相手,ミキサー,ケーブル\n音響卓,MAIN,客席スピーカー,IN,ミキサー,客席,ケーブル\n音響卓,AUX 1,通話の送信入力,USB IN,ミキサー,通話返し,ケーブル\n音響卓,CH 1,音響卓,MAIN,ミキサー,ミキサー,卓内送り\n音響卓,CH 2,音響卓,MAIN,ミキサー,ミキサー,卓内送り\n音響卓,CH 1,音響卓,AUX 1,ミキサー,ミキサー,卓内送り\n音響卓,CH 2,音響卓,AUX 1,ミキサー,ミキサー,卓内送り\n";
const roleNames={get lead(){return L("メロディ","Melody")},get beat(){return L("リズム","Rhythm")},get desk(){return L("ミキサー／中継","Mixer / relay")},get pa(){return L("客席","House PA")},get live(){return L("配信","Stream")},get other(){return L("未指定","Unassigned")}};
const roleAlias=new Map(Object.entries({
 room_mic:'lead',guest:'beat',call_return:'live','会場マイク':'lead','通話相手':'beat','通話返し':'live','メロディ':'lead','リード':'lead','マイク':'lead',melody:'lead',lead:'lead',mic:'lead',
 'リズム':'beat','ドラム':'beat',rhythm:'beat',drums:'beat',beat:'beat',
 'ミキサー':'desk','ミキサー／中継':'desk','中継':'desk',mixer:'desk',desk:'desk',thru:'desk',
 '客席':'pa',pa:'pa',house:'pa','配信':'live',stream:'live',live:'live','未指定':'other',other:'other'
}));
const headings=[
 ['送信機器','送信機器名','送信元機器','接続元機器','source_device','from_device','source device','src device'],
 ['送信端子','送信元端子','接続元端子','source_port','from_port','source socket','src socket'],
 ['受信機器','受信機器名','受信先機器','接続先機器','destination_device','to_device','destination device','dst device'],
 ['受信端子','受信先端子','接続先端子','destination_port','to_port','destination socket','dst socket'],
 ['送信機器の役割','source_role','from_role'],['受信機器の役割','destination_role','to_role'],['接続種別','種別','connection_type']
];
const csvSprites={lead:'data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2048%2052%22%20shape-rendering%3D%22crispEdges%22%3E%3Crect%20x%3D%223%22%20y%3D%2221%22%20width%3D%2241%22%20height%3D%2225%22%20fill%3D%22%230e1021%22%2F%3E%3Crect%20x%3D%225%22%20y%3D%2216%22%20width%3D%2239%22%20height%3D%2227%22%20fill%3D%22%23494968%22%2F%3E%3Crect%20x%3D%227%22%20y%3D%2213%22%20width%3D%2235%22%20height%3D%2227%22%20fill%3D%22%236e7490%22%2F%3E%3Crect%20x%3D%228%22%20y%3D%2215%22%20width%3D%2232%22%20height%3D%2223%22%20fill%3D%22%232c3548%22%2F%3E%3Crect%20x%3D%228%22%20y%3D%2238%22%20width%3D%2232%22%20height%3D%222%22%20fill%3D%22%23aaa3a2%22%2F%3E%3Crect%20x%3D%2210%22%20y%3D%2217%22%20width%3D%2212%22%20height%3D%224%22%20fill%3D%22%2361d5a7%22%2F%3E%3Crect%20x%3D%2210%22%20y%3D%2222%22%20width%3D%2228%22%20height%3D%2213%22%20fill%3D%22%23161a26%22%2F%3E%3Crect%20x%3D%2211%22%20y%3D%2223%22%20width%3D%222%22%20height%3D%2211%22%20fill%3D%22%23f9e6bc%22%2F%3E%3Crect%20x%3D%2214%22%20y%3D%2223%22%20width%3D%222%22%20height%3D%2211%22%20fill%3D%22%23f9e6bc%22%2F%3E%3Crect%20x%3D%2217%22%20y%3D%2223%22%20width%3D%222%22%20height%3D%2211%22%20fill%3D%22%23f9e6bc%22%2F%3E%3Crect%20x%3D%2220%22%20y%3D%2223%22%20width%3D%222%22%20height%3D%2211%22%20fill%3D%22%23f9e6bc%22%2F%3E%3Crect%20x%3D%2223%22%20y%3D%2223%22%20width%3D%222%22%20height%3D%2211%22%20fill%3D%22%23f9e6bc%22%2F%3E%3Crect%20x%3D%2226%22%20y%3D%2223%22%20width%3D%222%22%20height%3D%2211%22%20fill%3D%22%23f9e6bc%22%2F%3E%3Crect%20x%3D%2229%22%20y%3D%2223%22%20width%3D%222%22%20height%3D%2211%22%20fill%3D%22%23f9e6bc%22%2F%3E%3Crect%20x%3D%2232%22%20y%3D%2223%22%20width%3D%222%22%20height%3D%2211%22%20fill%3D%22%23f9e6bc%22%2F%3E%3Crect%20x%3D%2235%22%20y%3D%2223%22%20width%3D%222%22%20height%3D%2211%22%20fill%3D%22%23f9e6bc%22%2F%3E%3Crect%20x%3D%2213%22%20y%3D%2223%22%20width%3D%222%22%20height%3D%226%22%20fill%3D%22%23373145%22%2F%3E%3Crect%20x%3D%2216%22%20y%3D%2223%22%20width%3D%222%22%20height%3D%226%22%20fill%3D%22%23373145%22%2F%3E%3Crect%20x%3D%2222%22%20y%3D%2223%22%20width%3D%222%22%20height%3D%226%22%20fill%3D%22%23373145%22%2F%3E%3Crect%20x%3D%2225%22%20y%3D%2223%22%20width%3D%222%22%20height%3D%226%22%20fill%3D%22%23373145%22%2F%3E%3Crect%20x%3D%2228%22%20y%3D%2223%22%20width%3D%222%22%20height%3D%226%22%20fill%3D%22%23373145%22%2F%3E%3Crect%20x%3D%2234%22%20y%3D%2223%22%20width%3D%222%22%20height%3D%226%22%20fill%3D%22%23373145%22%2F%3E%3Crect%20x%3D%2226%22%20y%3D%2218%22%20width%3D%222%22%20height%3D%222%22%20fill%3D%22%23e69d74%22%2F%3E%3Crect%20x%3D%2230%22%20y%3D%2218%22%20width%3D%222%22%20height%3D%222%22%20fill%3D%22%23e69d74%22%2F%3E%3Crect%20x%3D%2234%22%20y%3D%2218%22%20width%3D%222%22%20height%3D%222%22%20fill%3D%22%23e69d74%22%2F%3E%3C%2Fsvg%3E',beat:'data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2048%2052%22%20shape-rendering%3D%22crispEdges%22%3E%3Crect%20x%3D%223%22%20y%3D%2221%22%20width%3D%2241%22%20height%3D%2225%22%20fill%3D%22%230e1021%22%2F%3E%3Crect%20x%3D%225%22%20y%3D%2216%22%20width%3D%2239%22%20height%3D%2227%22%20fill%3D%22%23494968%22%2F%3E%3Crect%20x%3D%227%22%20y%3D%2213%22%20width%3D%2235%22%20height%3D%2227%22%20fill%3D%22%236e7490%22%2F%3E%3Crect%20x%3D%228%22%20y%3D%2215%22%20width%3D%2232%22%20height%3D%2223%22%20fill%3D%22%232c3548%22%2F%3E%3Crect%20x%3D%228%22%20y%3D%2238%22%20width%3D%2232%22%20height%3D%222%22%20fill%3D%22%23aaa3a2%22%2F%3E%3Crect%20x%3D%2210%22%20y%3D%2217%22%20width%3D%2211%22%20height%3D%224%22%20fill%3D%22%23f1bc6a%22%2F%3E%3Crect%20x%3D%2228%22%20y%3D%2217%22%20width%3D%228%22%20height%3D%223%22%20fill%3D%22%235fc5b0%22%2F%3E%3Crect%20x%3D%2210%22%20y%3D%2224%22%20width%3D%226%22%20height%3D%225%22%20fill%3D%22%23131725%22%2F%3E%3Crect%20x%3D%2211%22%20y%3D%2224%22%20width%3D%224%22%20height%3D%223%22%20fill%3D%22%23e1a87a%22%2F%3E%3Crect%20x%3D%2217%22%20y%3D%2224%22%20width%3D%226%22%20height%3D%225%22%20fill%3D%22%23131725%22%2F%3E%3Crect%20x%3D%2218%22%20y%3D%2224%22%20width%3D%224%22%20height%3D%223%22%20fill%3D%22%23d48169%22%2F%3E%3Crect%20x%3D%2224%22%20y%3D%2224%22%20width%3D%226%22%20height%3D%225%22%20fill%3D%22%23131725%22%2F%3E%3Crect%20x%3D%2225%22%20y%3D%2224%22%20width%3D%224%22%20height%3D%223%22%20fill%3D%22%2382c7ad%22%2F%3E%3Crect%20x%3D%2231%22%20y%3D%2224%22%20width%3D%226%22%20height%3D%225%22%20fill%3D%22%23131725%22%2F%3E%3Crect%20x%3D%2232%22%20y%3D%2224%22%20width%3D%224%22%20height%3D%223%22%20fill%3D%22%2383a9d2%22%2F%3E%3Crect%20x%3D%2210%22%20y%3D%2230%22%20width%3D%226%22%20height%3D%225%22%20fill%3D%22%23131725%22%2F%3E%3Crect%20x%3D%2211%22%20y%3D%2230%22%20width%3D%224%22%20height%3D%223%22%20fill%3D%22%23e1a87a%22%2F%3E%3Crect%20x%3D%2217%22%20y%3D%2230%22%20width%3D%226%22%20height%3D%225%22%20fill%3D%22%23131725%22%2F%3E%3Crect%20x%3D%2218%22%20y%3D%2230%22%20width%3D%224%22%20height%3D%223%22%20fill%3D%22%23d48169%22%2F%3E%3Crect%20x%3D%2224%22%20y%3D%2230%22%20width%3D%226%22%20height%3D%225%22%20fill%3D%22%23131725%22%2F%3E%3Crect%20x%3D%2225%22%20y%3D%2230%22%20width%3D%224%22%20height%3D%223%22%20fill%3D%22%2382c7ad%22%2F%3E%3Crect%20x%3D%2231%22%20y%3D%2230%22%20width%3D%226%22%20height%3D%225%22%20fill%3D%22%23131725%22%2F%3E%3Crect%20x%3D%2232%22%20y%3D%2230%22%20width%3D%224%22%20height%3D%223%22%20fill%3D%22%2383a9d2%22%2F%3E%3C%2Fsvg%3E'};
const csvLegacy=document.querySelector('main>.layout'),monitorHome=$('listen').parentNode,monitorAfter=$('listen').nextElementSibling;
let csvScene=null,csvActive=false,csvDb=null,loadTicket=0,csvRevision=0;
const tag=(name,txt)=>{const e=document.createElement(name);if(txt!==undefined)e.textContent=txt;return e};
function svgNode(type,attrs,txt){
 const e=document.createElementNS('http://www.w3.org/2000/svg',type);
 for(const [k,v] of Object.entries(attrs))e.setAttribute(k,v);
 if(txt!==undefined)e.textContent=txt;return e;
}
function readRows(input){
 const text=input.replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n'),first=text.split('\n')[0];
 const sep=first.includes('\t')?'\t':first.includes(',')?',':';';
 const rows=[];let cell='',row=[],quoted=false,closed=false,start=1,line=1;
 const pushCell=()=>{row.push(cell.trim());cell='';closed=false};
 const pushRow=()=>{pushCell();if(row.some(Boolean))rows.push({data:row,line:start});row=[];start=line+1};
 for(let i=0;i<text.length;i++){
  const c=text[i];
  if(quoted){if(c==='"'){if(text[i+1]==='"'){cell+='"';i++}else{quoted=false;closed=true}}else{cell+=c;if(c==='\n')line++}continue}
  if(c===sep){pushCell();continue}
  if(c==='\n'){pushRow();line++;continue}
  if(closed&&/\s/.test(c))continue;
  if(c==='"'&&!cell&&!closed){quoted=true;continue}
  if(c==='"'||closed)throw Error(start+L("行目の引用符を確認してください。",": check quotation marks."));
  cell+=c;
 }
 if(quoted)throw Error(start+L("行目の引用符が閉じていません。",": unclosed quotation mark."));
 pushRow();return rows;
}
function parseVenue(text,name){
 const [header,...rows]=readRows(text);if(!header||!rows.length)throw Error(L("見出しと1本以上の結線が必要です。","Include a header and at least one connection."));
 if(rows.length>256)throw Error(L("このデモは1ファイル256本まで対応しています。","Limit each CSV to 256 connections."));
 const normalize=v=>v.toLowerCase().replace(/[ _-]/g,'');
 const columns=headings.map(names=>header.data.findIndex(h=>names.some(n=>normalize(n)===normalize(h))));
 if(columns.slice(0,4).includes(-1))throw Error(L("必要な列は「送信機器・送信端子・受信機器・受信端子」です。サンプルの見出しを使えます。","Required columns: source_device, source_port, destination_device, destination_port. See the sample CSV."));
 const units=new Map(),ports=[],cables=[],sends=new Map(), seen=new Set();
 function unitPort(dev,label,dir,role,line){
  let u=units.get(dev);if(!u){u={name:dev,id:units.size,inputs:new Map(),outputs:new Map(),role:null};units.set(dev,u)}
  if(role){const value=roleAlias.get(role.toLowerCase());if(!value)throw Error(line+L("行目の役割「",": role “")+role+L("」は未対応です。空欄にして画面から指定できます。","” is unknown. Leave it blank to assign a role in the app."));
   if(u.role&&u.role!==value)throw Error(line+L("行目で「",": device “")+dev+L("」の役割が他の行と異なります。","” has conflicting roles."));u.role=value}
  const bank=dir==='in'?u.inputs:u.outputs;
  if(!bank.has(label)){const p={id:ports.length,label,unit:u,dir};bank.set(label,p);ports.push(p)}
  return bank.get(label);
 }
 let hasGuest=false,hasReturn=false;
 for(const {data,line} of rows){
  if(data.length!==header.data.length)throw Error(line+L("行目の列数が見出しと異なります。カンマを含む名前は引用符で囲んでください。",": column count differs from the header. Quote names containing commas."));
  const [a,ap,b,bp,ar,br,type]=columns.map(i=>i<0?'':data[i]);
  if(!a||!ap||!b||!bp)throw Error(line+L("行目に空の機器名または端子名があります。",": missing device or port name."));
  hasGuest||=['guest','通話相手'].includes(ar.toLowerCase())||['guest','通話相手'].includes(br.toLowerCase());hasReturn||=['call_return','通話返し'].includes(ar.toLowerCase())||['call_return','通話返し'].includes(br.toLowerCase());
  const kind=type.toLowerCase(),internal=['卓内送り','send'].includes(kind);
  if(!internal&&!['','ケーブル','cable'].includes(kind))throw Error(line+L("行目の接続種別は「ケーブル」または「卓内送り」を指定してください。",": connection_type must be cable or send."));
  if(internal&&a!==b)throw Error(line+L("行目の卓内送りには同じ卓の入力と出力を指定してください。",": an internal send must connect two ports on the same device."));
  const f=unitPort(a,ap,internal?'in':'out',ar,line),t=unitPort(b,bp,internal?'out':'in',br,line),key=f.id+'>'+t.id;
  if(internal){sends.set(key,[f.id,t.id]);continue}
  if(!seen.has(key)){cables.push([f.id,t.id]);seen.add(key)}
 }
 for(const u of units.values())if(!u.role){
  u.role=u.inputs.size&&u.outputs.size?'desk':/配信|stream/i.test(u.name)?'live':/客席|speaker|^pa$/i.test(u.name)?'pa':/リズム|ドラム|drum/i.test(u.name)?'beat':!u.inputs.size?'lead':'other'
 }
 for(const [id] of sends.values())if(ports[id].unit.role!=='desk')throw Error(L("卓内送りを持つ機器にはミキサーの役割を指定してください。","Assign the mixer role to devices with internal sends."));
 const meeting=hasGuest&&hasReturn;return {name,meeting,method:meeting?'send':'wire',avoid:{pa:0,live:meeting?2:0},goals:{pa:3,live:1},after:false,units:[...units.values()],ports,cables,sends,reached:{},monitor:{pa:null,live:null}};
}
function csvTrace(){
 const scene=csvScene;
 csvDb??=new RelateDb();csvDb.reset();
 const links=[...scene.cables,...scene.sends.values()];
 const statements=scene.ports.map(p=>'('+('p'+p.id)+':Jack {id:'+p.id+'})');
 links.forEach(([a,b])=>statements.push('(p'+a+')-[:SIGNAL]->(p'+b+')'));
 function query(q,params={}){const r=JSON.parse(csvDb.execute(q,JSON.stringify(params)));if(r.error)throw Error(r.error.message||JSON.stringify(r.error));return r.rows}
 query('CREATE '+statements.join(', '));
 for(const sink of sinks){const eligible=scene.units.filter(u=>u.role===sink&&u.inputs.size);if(!eligible.some(u=>u.id===scene.monitor[sink]))scene.monitor[sink]=eligible[0]?.id??null}
 const rows=query('MATCH (a:Jack)-[:SIGNAL]->(b:Jack) RETURN a.id AS a, b.id AS b');
 function traceFrom(roots){
  let frontier=roots;const seen=new Set(roots);
  while(frontier.length){
   const next=query('MATCH (a:Jack)-[:SIGNAL]->(b:Jack) WHERE a.id IN $ids RETURN DISTINCT b.id AS id',{ids:frontier});
   frontier=next.map(r=>r.id).filter(id=>!seen.has(id));for(const id of frontier)seen.add(id);
  }
  return seen;
 }
 if(scene.initGoals){
  const stems=['lead','beat'].map(role=>traceFrom(scene.units.filter(u=>u.role===role).flatMap(u=>Array.from(u.outputs.values(),p=>p.id))));
  const available=stems.reduce((m,r,i)=>r.size?m|(1<<i):m,0);
  for(const key of sinks){
   const inputs=Array.from(outputUnit(key)?.inputs.values()||[]);
   const heard=stems.reduce((m,r,i)=>inputs.some(p=>r.has(p.id))?m|(1<<i):m,0);
   scene.goals[key]=inputs.length?(heard||(scene.goals[key]&available)):0;
  }
  scene.initGoals=false;
 }
 scene.diagnosis=diagnose(scene,rows.map(r=>[r.a,r.b]),traceFrom);
}
function routeGraph(n, links, cuts) {
 const graph=Array.from({length:n},()=>[]);
 for(const [a,b] of links) if(!cuts.has(a+'>'+b)) graph[a].push(b);
 return graph;
}
function downstream(graph,starts) {
 const visited=new Set(starts),queue=[...visited];
 for(let i=0;i<queue.length;i++) for(const next of graph[queue[i]]) if(!visited.has(next)){visited.add(next);queue.push(next)}
 return visited;
}
function traceCycle(graph) {
 const done=new Set(),path=[],position=new Map();
 function walk(id) {
  if(position.has(id))return [...path.slice(position.get(id)),id];
  if(done.has(id))return null;
  path.push(id);position.set(id,path.length-1);
  for(const next of graph[id]){const found=walk(next);if(found)return found}
  path.pop();position.delete(id);done.add(id);return null;
 }
 for(let i=0;i<graph.length;i++){const found=walk(i);if(found)return found}
 return null;
}
// Find one concrete path carrying an excluded source into a selected output.
function unwantedPath(graph,starts,ends,avoid,mix){
 for(let i=0;i<ends.length;i++)for(let j=0;j<starts.length;j++){
  if(!(avoid[i]&mix[i]&(1<<j)))continue;
  const queue=[...starts[j]],prev=new Map(queue.map(id=>[id,null])),targets=new Set(ends[i]);
  for(let k=0;k<queue.length;k++){const id=queue[k];
   if(targets.has(id)){const path=[];for(let p=id;p!==null;p=prev.get(p))path.push(p);return path.reverse()}
   for(const next of graph[id])if(!prev.has(next)){prev.set(next,id);queue.push(next)}
  }
 }
 return null;
}
function diagnose(scene,links,traceFrom) {
 const n=scene.ports.length,allowed=new Set(scene.method==='send'?scene.sends.keys():scene.cables.map(([a,b])=>a+'>'+b));
 const starts=['lead','beat'].map(stem=>scene.units.filter(u=>u.role===stem).flatMap(u=>Array.from(u.outputs.values(),p=>p.id)));
 const ends=sinks.map(k=>Array.from(outputUnit(k)?.inputs.values()||[],p=>p.id));
 function inspect(cuts,base=false) {
  const graph=routeGraph(n,links,cuts),reached=starts.map(roots=>base?traceFrom(roots):downstream(graph,roots));
  const mix=ends.map(ids=>reached.reduce((mask,group,i)=>ids.some(id=>group.has(id))?mask|(1<<i):mask,0));
  return {graph,reached,mix};
 }
 const initial=inspect(new Set(),true),cycle=traceCycle(initial.graph);
 // A back path from an edge's destination to its source proves that the edge is cyclic.
 const cyclic=new Set(),reachCache=new Map();
 for(const [a,b] of links){
  if(!reachCache.has(b))reachCache.set(b,downstream(initial.graph,[b]));
  if(reachCache.get(b).has(a))cyclic.add(a+'>'+b);
 }
 const echo=ends.map(ids=>{
  let mask=0;
  for(const key of cyclic){
   const [a,b]=key.split('>').map(Number);
   if(ids.some(id=>reachCache.get(b).has(id)))initial.reached.forEach((r,i)=>{if(r.has(a))mask|=1<<i});
  }
  return mask;
 });
 const goals=sinks.map(k=>scene.goals[k]);
 const enough=state=>goals.every((mask,i)=>(state.mix[i]&mask)===mask);
 const avoid=sinks.map(k=>scene.avoid?.[k]||0),forbidden=state=>unwantedPath(state.graph,starts,ends,avoid,state.mix);
 const unwanted=forbidden(initial);
 const reason=!enough(initial)?'missing':!cycle&&!unwanted?'clean':'search';
 const result={initial,cycle,unwanted,cyclic,echo,reason,cuts:[],after:null};
 if(!starts.some(v=>v.length)||!ends.some(v=>v.length))return {...result,reason:'setup'};
 if(reason!=='search')return result;
 // Any solution must remove at least one physical edge in each witnessed cycle.
 // Widen the depth only after exhausting all smaller cut sets.
 const limit=performance.now()+180;let count=0,aborted=false;
 for(let depth=1;depth<=allowed.size;depth++){
  const memo=new Set();let frontier=false;
  function find(cuts,state,loop){
   if(!loop)return {cuts:[...cuts],after:state};
   if(cuts.size===depth){frontier=true;return null}
   if(++count>5000||performance.now()>limit){aborted=true;return null}
   const key=[...cuts].sort().join(',');if(memo.has(key))return null;memo.add(key);
   for(let i=1;i<loop.length;i++){
    const edge=loop[i-1]+'>'+loop[i];if(!allowed.has(edge))continue;
    cuts.add(edge);const next=inspect(cuts);
    const match=enough(next)&&find(cuts,next,forbidden(next)||traceCycle(next.graph));cuts.delete(edge);
    if(match)return match;if(aborted)return null;
   }
   return null;
  }
  const found=find(new Set(),initial,unwanted||cycle);
  if(found)return {...result,...found,reason:'solved'};
  if(aborted)return {...result,reason:'limit'};if(!frontier)break;
 }
 return {...result,reason:'impossible'};
}
function wireName(scene,key){
 const [a,b]=key.split('>').map(id=>scene.ports[Number(id)]);
 return a.unit.name+' '+a.label+' → '+(a.unit===b.unit?'':b.unit.name+' ')+b.label;
}
function outputLabel(s,key){return s.meeting?(key==='pa'?L("客席","House PA"):L("通話相手への返し","Call return")):roleNames[key]}
function stemNames(s){return s.meeting?[L("会場マイク","Room mic"),L("通話相手の声","Guest voice")]:[L("メロディ","Melody"),L("リズム","Rhythm")]}
function mixLabel(s,mask){return stemNames(s).filter((_,i)=>mask&(1<<i)).join(L('＋',' + '))||L("無音","Silent")}
function renderDiagnosis(){
 const s=csvScene,d=s.diagnosis,send=s.method==='send',action=send?L("送りをOFF","Disable send"):L("ケーブルを外す","Physical cables");
 $('cut-method').value=s.method;
 $('csv-before').setAttribute('aria-pressed',String(!s.after));$('csv-after').setAttribute('aria-pressed',String(s.after));$('csv-after').disabled=d.reason!=='solved';
 $('commit-trial').hidden=!s.after;$('undo-scene').hidden=!s.undo;
 const missing=sinks.flatMap((k,i)=>{const m=s.goals[k]&~d.initial.mix[i];return m?[outputLabel(s,k)+L("に"," is missing ")+mixLabel(s,m)+L("が届いていません","")]:[]});
 const leak=sinks.flatMap((k,i)=>{const m=s.avoid[k]&d.initial.mix[i];return m?[outputLabel(s,k)+L('に',' carries ')+mixLabel(s,m)+L('が入っています','')]:[]});
 const verdict={setup:L("音源と出力の役割を確認してください","Assign a source and an output first"),solved:s.after?L("変更案で出力条件を満たしました","Proposed patch meets the routing goals"):send?L("卓内の送りを","Switch off ")+d.cuts.length+L("か所OFFにする",d.cuts.length===1?" mixer send":" mixer sends"):L("ケーブルを","Disconnect ")+d.cuts.length+L("本外す"," cable(s)"),clean:L("現在の配線は出力条件を満たしています","The current patch meets the routing goals"),missing:L("必要な音が届いていません","A required source is missing"),impossible:L("この操作ではすべての条件を満たせません","This change cannot preserve every required feed"),limit:L("探索上限に達しました。変更案は未確定です。","Search limit reached. A repair has not been verified.")};
 $('csv-verdict').textContent=verdict[d.reason];
 $('case-cause').textContent=missing.length?missing.join(L('。','. '))+L('。','. '):s.after?L("入力した結線上で、必要な音がすべて届きます。","All required sources reach their outputs in this patch."):[
  ...leak.map(v=>v+L('。','. ')),...(d.cycle?[L("信号が同じ端子に戻る経路があります。","A signal returns to the same port.")]:[])].join('')||(d.reason==='clean'?L("指定した出力への到達と、循環経路の有無を確認しました。","Output reachability and loops checked."):'');
 const list=$('csv-cut-list');list.replaceChildren();d.cuts.forEach(key=>list.append(tag('li',wireName(s,key)+' · '+(send?'OFF':L("切断","Cut")))));
 if(s.meeting&&d.unwanted&&(s.avoid.live&d.initial.mix[1]&2)&&!s.after)$('case-cause').textContent=L("相手から受けた声が、通話の送信入力にも届いています。","The guest’s voice is being sent back into their call.")+(missing.length?missing.join(L('。','. '))+L('。','. '):'');
 const help=$('recovery');help.replaceChildren();const add=(title,fn)=>{const b=tag('button',title);b.onclick=fn;help.append(b)};
 if(d.reason==='impossible'&&s.method==='wire')help.append(L("必要な音まで途切れるため、ケーブルだけで解決する案はありません。","Cable cuts would also remove a required feed."));
 if(d.reason==='setup')add(L("機器の役割を指定","Assign device roles"),()=>{const el=$('role-settings');el.open=true;el.querySelector('summary').focus()});
 if(d.reason==='missing')add(L("送りの設定を開く","Open mixer sends"),()=>{const el=$('send-settings');el.open=true;el.querySelector('summary').focus();el.scrollIntoView({block:'center'})});
 if(d.reason==='impossible'||d.reason==='limit')add(send?L("ケーブルで調べる","Try cable cuts"):L("卓内の送りで調べる","Try mixer sends"),()=>{s.method=send?'wire':'send';refreshVenue()});
 const kept=$('kept-route');kept.textContent='';
 if(send&&d.cuts.length){
  const touched=new Set(d.cuts.map(key=>Number(key.split('>')[0])));
  const remaining=[...s.sends].filter(([key,[a]])=>touched.has(a)&&!d.cuts.includes(key)).map(([key])=>wireName(s,key));
  if(remaining.length)kept.textContent=L("そのまま残る送り：","Keep on: ")+remaining.slice(0,2).join('、')+(remaining.length>2?L(" ほか"," and others"):'');
 }
 const path=d.unwanted||d.cycle;$('witness-detail').hidden=!path;
 $('csv-witness').textContent=path?path.map((id,i)=>{const p=s.ports[id];return (i===0||p.unit!==s.ports[path[i-1]].unit?p.unit.name+' ':'')+p.label}).join(' → '):'';
 for(const sel of $('csv-goals').querySelectorAll('select')){const bit=Number(sel.dataset.bit),k=sel.dataset.out;sel.value=s.goals[k]&bit?'keep':s.avoid[k]&bit?'avoid':'any'}
 $('delivery-title').textContent=s.after?L("変更案で届く音","Outputs with the fix"):L("現在、出力に届く音","Current outputs");
 $('sound-note').textContent=s.meeting?L("英語で会場、通話相手の順に発声します。Bの通話返しで相手の声だけが消えるか聴いてください。","The host speaks first, then the remote guest. On the call return, listen for the guest to drop out in B."):L("内蔵の演奏で試聴します。循環する音には短い反復を加えています。","Built-in music illustrates each route. Short repeats mark a loop.");
}
function setupGoals(s){
 const host=$('csv-goals');host.replaceChildren();
 for(const out of sinks){
  const group=tag('fieldset');group.append(tag('legend',outputLabel(s,out)));
  stemNames(s).forEach((name,i)=>{const bit=1<<i,label=tag('label',name),sel=tag('select');sel.dataset.out=out;sel.dataset.bit=bit;sel.setAttribute('aria-label',outputLabel(s,out)+L("への"," · ")+name);
   for(const [v,t] of [['keep',L("届ける","Include")],['avoid',L("送らない","Exclude")],['any',L("指定なし","Either")]])sel.add(new Option(t,v));
   sel.onchange=()=>{s.goals[out]&=~bit;s.avoid[out]&=~bit;if(sel.value==='keep')s.goals[out]|=bit;if(sel.value==='avoid')s.avoid[out]|=bit;refreshVenue()};
   label.append(sel);group.append(label);
  });host.append(group);
 }
}
$('cut-method').onchange=e=>{csvScene.method=e.target.value;refreshVenue()};
function rememberEdit(s){s.undo={cables:s.cables.slice(),sends:new Map(s.sends),roles:s.units.map(u=>u.role)}}
$('commit-trial').onclick=()=>{
 const s=csvScene;if(!s?.after)return;rememberEdit(s);
 const cuts=new Set(s.diagnosis.cuts);
 if(s.method==='send'){for(const key of cuts)s.sends.delete(key)}
 else s.cables=s.cables.filter(([a,b])=>!cuts.has(a+'>'+b));
 renderDetails();refreshVenue();$('undo-scene').focus();
};
$('undo-scene').onclick=()=>{
 const s=csvScene;if(!s?.undo)return;
 const prev=s.undo;s.undo=null;s.cables=prev.cables;s.sends=prev.sends;s.units.forEach((u,i)=>u.role=prev.roles[i]);renderSends();renderDetails();refreshVenue();$('csv-before').focus();
};
$('zoom-map').onclick=()=>{const btn=$('zoom-map'),viewport=btn.closest('section').querySelector('.csv-viewport'),large=viewport.classList.toggle('enlarged');btn.textContent=large?L("全体表示","Fit to view"):L("拡大","Zoom in");btn.setAttribute('aria-pressed',String(large));btn.setAttribute('aria-label',large?L("結線図を全体表示","Fit the diagram"):L("結線図を拡大","Zoom in on the diagram"))};
function compareCsv(after){
 if(!csvScene||after&&!csvScene.diagnosis.after)return;
 csvScene.after=after;paintVenue();
}
$('csv-before').onclick=()=>compareCsv(false);
$('csv-after').onclick=()=>compareCsv(true);
function auditionIR(ctx,out,echo){
 const dry=response(ctx,['mic>'+out],out);if(!echo)return dry;
 const spacing=Math.round(ctx.sampleRate*.21),taps=[.79,.52,.32,.19,.11],ir=ctx.createBuffer(2,dry.length+spacing*(taps.length-1),ctx.sampleRate);
 for(let c=0;c<2;c++){const input=dry.getChannelData(c),dest=ir.getChannelData(c);taps.forEach((gain,t)=>{for(let i=0;i<input.length;i++)dest[spacing*t+i]+=gain*input[i]})}
 return ir;
}
function mask(id){return (csvScene.reached.lead.has(id)?1:0)|(csvScene.reached.beat.has(id)?2:0)}
function atOutput(unit){return unit?[...unit.inputs.values()].reduce((m,p)=>m|mask(p.id),0):0}
const tint=['#9291a6','#98e7cb','#ffd586','#c4a8f4'],sounds=[L("無音","Silent"),L("メロディ","Melody"),L("リズム","Rhythm"),L("メロディ＋リズム","Melody + rhythm")];
function drawVenue(){
 const s=csvScene,svg=$('csv-diagram');svg.replaceChildren();
 const columns=[[],[],[]],locations=new Map(),sockets=new Map();
 for(const u of s.units)columns[u.inputs.size&&u.outputs.size?1:u.outputs.size?0:2].push(u);
 let height=280;columns.forEach((items,col)=>{let y=22;
  for(const u of items){const h=72+Math.max(u.inputs.size,u.outputs.size)*23;locations.set(u.id,{x:22+col*265,y,h});y+=h+34}height=Math.max(height,y)});
 svg.setAttribute('viewBox','0 0 772 '+height);
 const defs=svgNode('defs',{}),pattern=svgNode('pattern',{id:'csv-floor',width:48,height:24,patternUnits:'userSpaceOnUse'});
 pattern.append(svgNode('path',{d:'M0 12 24 0l24 12-24 12Z',stroke:'#303046',fill:'#202035'}));defs.append(pattern);svg.append(defs,svgNode('rect',{width:772,height,fill:'url(#csv-floor)'}));
 const wires=svgNode('g',{}),nodes=svgNode('g',{}),inside=svgNode('g',{});svg.append(wires,nodes,inside);
 const shorten=(v,n)=>Array.from(v).length>n?Array.from(v).slice(0,n-1).join('')+'…':v;
 for(const u of s.units){const {x,y,h}=locations.get(u.id),w=196;
  nodes.append(svgNode('rect',{x,y,width:w,height:h,rx:4,fill:'#252638',stroke:'#655872'}));
  const roleSprite={lead:'mic',beat:'fx',desk:'mix',pa:'pa',live:'live',other:'usb'}[u.role];
  nodes.append(svgNode('image',{x:x+6,y:y+3,width:55,height:46,href:s.meeting&&u.role==='lead'?spriteImages.mic:s.meeting&&u.role==='beat'?spriteImages.live:csvSprites[u.role]||spriteImages[roleSprite],class:'gear'}));
  const label=svgNode('text',{x:x+65,y:y+24,fill:'#fff1ce','font-size':14,'font-weight':700},shorten(u.name,/^[\x20-\x7E]+$/.test(u.name)?16:10));label.append(svgNode('title',{},u.name));nodes.append(label);
  nodes.append(svgNode('text',{x:x+65,y:y+41,fill:'#c6bdd2','font-size':11},s.meeting?({lead:L("会場の音声","Room audio"),beat:L("通話の受信音","Incoming call"),live:L("通話への送信","Outgoing call")}[u.role]||roleNames[u.role]):roleNames[u.role]));
  for(const [dir,bank] of [['in',u.inputs],['out',u.outputs]]){
   const isIn=dir==='in';let i=0;
   for(const p of bank.values()){const px=x+(isIn?0:w),py=y+62+(i++)*23;sockets.set(p.id,[px,py]);
    nodes.append(svgNode('rect',{x:px-4,y:py-4,width:8,height:8,fill:tint[mask(p.id)],stroke:'#151223'}));
    const lab=svgNode('text',{x:px+(isIn?9:-9),y:py+4,'text-anchor':isIn?'start':'end',class:'csv-port'},shorten(p.label,11));lab.append(svgNode('title',{},p.label));nodes.append(lab);
   }
  }
 }
 function wire([a,b],internal){const [x,y]=sockets.get(a),[ex,ey]=sockets.get(b),m=mask(a);
  const edge=a+'>'+b,cut=s.diagnosis.cuts.includes(edge),loop=s.diagnosis.cyclic.has(edge)||s.diagnosis.unwanted?.some((v,i,path)=>i>0&&v===b&&path[i-1]===a);let d;if(internal){d='M'+(x+65)+' '+y+' C'+(x+95)+' '+(y+13)+' '+(ex-95)+' '+(ey+13)+' '+(ex-65)+' '+ey}
  else if(ex>x){const mid=(x+ex)/2;d='M'+x+' '+y+' C'+mid+' '+y+' '+mid+' '+ey+' '+ex+' '+ey}
  else {const bottom=id=>{const v=locations.get(s.ports[id].unit.id);return v.y+v.h};const dip=Math.max(bottom(a),bottom(b))+17;d='M'+x+' '+y+' C'+(x+49)+' '+y+' '+(x+49)+' '+dip+' '+x+' '+dip+' H'+ex+' Q'+(ex-45)+' '+dip+' '+(ex-18)+' '+ey+' L'+ex+' '+ey}
  const layer=internal?inside:wires;
  if(internal)layer.append(svgNode('path',{d:'M'+(ex-69)+' '+(ey-4)+'l5 4-5 4',fill:'none',stroke:tint[m],'stroke-width':2}));
  const p=svgNode('path',{d,fill:'none',stroke:cut&&s.after?'#9991a5':loop&&!s.after?'#ff9373':tint[m],'stroke-width':internal?2.5:4,'stroke-dasharray':cut&&s.after?'3 8':internal?'4 3':m?'none':'5 6',class:'csv-cable'});
  p.append(svgNode('title',{},s.ports[a].unit.name+' '+s.ports[a].label+' → '+s.ports[b].unit.name+' '+s.ports[b].label));layer.append(p);
  if(cut){
   const mid=p.getPointAtLength(p.getTotalLength()/2);
   const mark=svgNode('g',{'aria-label':wireName(s,edge)});mark.append(svgNode('rect',{x:mid.x-18,y:mid.y-8,width:36,height:16,fill:s.after?'#433b4f':'#722f29',stroke:'#ffbc9c'}),svgNode('text',{x:mid.x,y:mid.y+4,'text-anchor':'middle',fill:'#fff2ce','font-size':10,'font-weight':700},s.after?'OFF':s.method==='send'?L("OFF案","MUTE"):L("切断案","CUT")));inside.append(mark);
  }
  if(m&&!internal&&!(s.after&&cut))layer.append(svgNode('path',{d,fill:'none',class:'csv-flow'}));
 }
 s.cables.forEach(k=>wire(k,false));s.sends.forEach(k=>wire(k,true));
 $('csv-info').textContent=s.name+' · '+s.units.length+L("台 / "," devices / ")+s.cables.length+L('本',s.cables.length===1?' cable':' cables');
}
function renderSends(){
 const s=csvScene,host=$('csv-matrices');host.replaceChildren();
 for(const u of s.units.filter(u=>u.role==='desk'&&u.inputs.size&&u.outputs.size)){
  const wrapper=tag('div');wrapper.className='csv-matrix';const table=tag('table');table.append(tag('caption',u.name));
  const head=table.createTHead().insertRow();head.append(tag('th','IN ↓ / OUT →'));for(const label of u.outputs.keys())head.append(tag('th',label));
  const body=table.createTBody();
  for(const p of u.inputs.values()){const row=body.insertRow();row.append(tag('th',p.label));
   for(const q of u.outputs.values()){const key=p.id+'>'+q.id,b=tag('button');b.className='send';b.dataset.send=key;b.setAttribute('aria-label',u.name+' '+p.label+' → '+q.label);
    b.onclick=()=>{rememberEdit(s);if(!s.sends.delete(key))s.sends.set(key,[p.id,q.id]);refreshVenue()};row.insertCell().append(b)}
  }
  wrapper.append(table);host.append(wrapper);
 }
 if(!host.childElementCount)host.append(tag('p',L("入出力のある機器に「ミキサー／中継」を指定すると、送りを設定できます。","Assign Mixer / relay to a device with inputs and outputs to configure its sends.")));
}
function renderDetails(){
 const s=csvScene,roles=$('csv-roles');roles.replaceChildren();
 for(const u of s.units){
  const label=tag('label');label.className='csv-role';label.append(tag('span',u.name));const select=tag('select');select.setAttribute('aria-label',u.name+L("の役割"," role"));
  for(const [key,title] of Object.entries(roleNames))select.add(new Option(s.meeting?({lead:L("会場マイク","Room mic"),beat:L("通話相手","Remote guest"),live:L("通話返し","Call return")}[key]||title):title,key));
  select.value=u.role;select.onchange=()=>{rememberEdit(s);u.role=select.value;
   if(u.role!=='desk')for(const [key,[a]] of s.sends)if(s.ports[a].unit===u)s.sends.delete(key);
   renderSends();refreshVenue()};label.append(select);roles.append(label)
 }
 const host=$('csv-table'),table=tag('table');host.replaceChildren(table);const h=table.createTHead().insertRow();
 for(const v of [L("送信機器","Source device"),'OUT',L("受信機器","Destination device"),'IN'])h.append(tag('th',v));const body=table.createTBody();
 for(const [a,b] of s.cables){const f=s.ports[a],t=s.ports[b],r=body.insertRow();for(const v of [f.unit.name,f.label,t.unit.name,t.label])r.insertCell().textContent=v}
}
function outputUnit(id){return csvScene.units.find(u=>u.id===csvScene.monitor[id])}
function refreshVenue(){
 csvScene.after=false;csvTrace();paintVenue();
}
function paintVenue(){
 const s=csvScene,d=s.diagnosis,state=s.after?d.after:d.initial;
 s.reached={lead:state.reached[0],beat:state.reached[1]};renderDiagnosis();drawVenue();
 for(const b of $('csv-matrices').querySelectorAll('button[data-send]')){const on=csvScene.sends.has(b.dataset.send);b.setAttribute('aria-pressed',String(on));const proposed=s.after&&s.method==='send'&&d.cuts.includes(b.dataset.send);b.disabled=s.after;b.title=s.after?L("現在の配線に戻ると編集できます","Switch to the current patch to edit"):'';b.textContent=proposed?L("案 OFF","Off in B"):on?'● ON':'OFF';b.setAttribute('aria-pressed',String(on&&!proposed))}
 const results=$('csv-results');results.replaceChildren();
 for(const id of sinks){
  const eligible=csvScene.units.filter(u=>u.role===id&&u.inputs.size),r=tag('div');r.className='csv-result';r.append(tag('strong',outputLabel(s,id)));
  if(eligible.length>1){const sel=tag('select');sel.setAttribute('aria-label',roleNames[id]+L("の試聴機器"," monitor device"));for(const u of eligible)sel.add(new Option(u.name,u.id));sel.value=csvScene.monitor[id];sel.onchange=()=>{csvScene.monitor[id]=Number(sel.value);refreshVenue()};r.append(sel)}
  const mix=atOutput(outputUnit(id)),missing=s.goals[id]&~mix,leak=s.avoid[id]&mix;
  const echo=s.after?0:d.echo[sinks.indexOf(id)];
  r.append(tag('span',eligible.length?mixLabel(s,mix):L("機器が未指定","No device selected")));
  const status=[...(missing?[L("未到達：","Missing: ")+mixLabel(s,missing)]:[]),...(leak?[(s.meeting&&id==='live'&&leak===2?L("本人の声まで返っています","Guest hears their own return"):L("送らない指定の音：","Unwanted source: ")+mixLabel(s,leak))]:[]),...(echo?[L("循環由来の反復あり","Loop repeats")]:[])];
  r.dataset.ok=String(Boolean(eligible.length&&!status.length));r.append(tag('small',status.join(' / ')||(eligible.length?L("✓ 出力条件を満たす","✓ Routing goal met"):L("役割を確認してください","Check device roles"))));results.append(r)
 }
 document.querySelector('header').classList.toggle('powerlost',!atOutput(outputUnit('pa')));
 updateSound();
}
function showCsv(s){
 csvScene=s;csvRevision++;csvActive=true;
 csvLegacy.hidden=true;$('preset').hidden=$('undo').hidden=true;$('csv-mode').hidden=false;
 $('csv-monitor').append($('listen'));$('pull-end').hidden=true;
 localizeScene(s);
 $('send-settings').open=!s.sends.size;$('role-settings').open=false;$('goal-settings').open=Boolean(s.fromFile&&!s.meeting);
 sound.output=s.meeting?'live':'pa';refreshVenue();
}
function localizeScene(s){
 setupGoals(s);
 $('case-title').textContent=s.meeting?L("会場と通話の音声チェック","Hybrid meeting soundcheck"):s.name;
 $('case-brief').textContent=s.meeting?L("客席には二人の声を届け、通話相手には会場の声だけを返します。","Let the room hear both speakers. Send only the room mic back to the guest."):L("客席と配信に必要な音を指定し、配線を変える前に結果を試聴できます。","Choose what each output needs, then audition a change before touching the desk.");
 $('listen-pa').textContent=outputLabel(s,'pa');$('listen-live').textContent=outputLabel(s,'live');
 renderSends();renderDetails()
}
function showPatch(){loadTicket++;csvActive=false;$('csv-mode').hidden=true;csvLegacy.hidden=false;
 $('preset').hidden=$('undo').hidden=$('pull-end').hidden=false;$('listen-pa').textContent=L("客席","House PA");$('listen-live').textContent=L("配信","Stream");$('import-error').hidden=true;
 monitorHome.insertBefore($('listen'),monitorAfter);render()
};
function loadText(text,name,fromFile=false){const candidate=parseVenue(text,name);candidate.initGoals=fromFile&&!candidate.meeting;candidate.fromFile=fromFile;if(!fromFile){
  for(const unit of candidate.units){const original=unit.name;Object.defineProperty(unit,'name',{get:()=>sampleLabel(original)})}
  Object.defineProperty(candidate,'name',{get:()=>sampleLabel(name)});
 }showCsv(candidate);$('import-error').hidden=true}
function importError(e){$('import-error').textContent=L("CSVを読み込めませんでした。","Could not import CSV. ")+e.message;$('import-error').hidden=false}
const sceneCache=new Map();
function chooseScene(value){
 loadTicket++;$('case-picker').value=value;
 try{if(value==='patch'){showPatch();return}if(sceneCache.has(value)){showCsv(sceneCache.get(value));$('import-error').hidden=true;return}
 const [csv,name]=({meeting:[meetingCsv,'ハイブリッド会議'],loop:[loopCsv,'ライブ配信の戻り線'],basic:[sampleCsv,'卓内送りを組む練習']})[value];
 loadText(csv,name);sceneCache.set(value,csvScene)}catch(e){importError(e)}
}
$('case-picker').onchange=e=>chooseScene(e.target.value);
$('open-file').onclick=()=>$('csv-file').click();
async function loadVenueFile(f){if(!f)return;const ticket=++loadTicket;
 try{if(f.size>1024*1024)throw Error(L("1 MB以下のCSVを選んでください。","Choose a CSV no larger than 1 MB."));
  const raw=await f.arrayBuffer();let text;try{text=new TextDecoder('utf-8',{fatal:true}).decode(raw)}catch{text=new TextDecoder('shift_jis',{fatal:true}).decode(raw)}
  if(ticket===loadTicket){loadText(text,f.name,true);sceneCache.set('file',csvScene);const fileOption=$('case-picker').querySelector('[value=file]');fileOption.hidden=false;fileOption.textContent=f.name;$('case-picker').value='file'}
 }catch(err){if(ticket===loadTicket)importError(err)}
};
$('csv-file').onchange=e=>{const f=e.target.files[0];e.target.value='';loadVenueFile(f)};
const dropZone=document.querySelector('main');
dropZone.addEventListener('dragover',e=>{if(e.dataTransfer.types.includes('Files')){e.preventDefault();e.dataTransfer.dropEffect='copy'}});
dropZone.addEventListener('drop',e=>{if(!e.dataTransfer.files.length)return;e.preventDefault();if(e.dataTransfer.files.length===1)loadVenueFile(e.dataTransfer.files[0]);else importError(Error(L("一度に1ファイルを指定してください。","Select one file at a time.")))});
function syncVenueMonitor(){
 const out=sound.output,m=atOutput(outputUnit(out));
 for(const id of sinks)$('listen-'+id).setAttribute('aria-pressed',String(out===id));
 $('transport').textContent=sound.playing?L("■ 停止","■ Stop"):L("▶ 試聴を開始","▶ Listen");
 const echo=csvScene.after?0:csvScene.diagnosis.echo[sinks.indexOf(out)];
 $('listen-status').textContent=(csvScene.after?L("変更案","Preview"): L("現在","Current"))+' · '+outputLabel(csvScene,out)+' · '+mixLabel(csvScene,m)+(echo?' · '+mixLabel(csvScene,echo)+L("が反復"," repeating"):'');
 if(!sound.playing)return;
 const key=['csv',csvRevision,out,m,echo].join('|');if(key===sound.key)return;
 const bank=csvScene.meeting?sound.voices:sound.stems;const inputs=[];if(m&1)inputs.push(bank.lead);if(m&2)inputs.push(bank.beat);
 setAudibleBranch(key,inputs,input=>auditionIR(sound.ctx,out,echo&(input===bank.lead?1:2)))
}

const englishExamples={"hybrid": "source_device,source_port,destination_device,destination_port,source_role,destination_role,connection_type\nRoom mic,OUT,Mixer,CH 1,room_mic,mixer,cable\nRemote guest,USB OUT,Mixer,CH 2,guest,mixer,cable\nMixer,MAIN,House speakers,IN,mixer,house,cable\nMixer,AUX 1,Call input,USB IN,mixer,call_return,cable\nMixer,CH 1,Mixer,MAIN,mixer,mixer,send\nMixer,CH 2,Mixer,MAIN,mixer,mixer,send\nMixer,CH 1,Mixer,AUX 1,mixer,mixer,send\nMixer,CH 2,Mixer,AUX 1,mixer,mixer,send\n", "loop": "source_device,source_port,destination_device,destination_port,source_role,destination_role,connection_type\nLead synth,OUT,FOH desk,CH 1,lead,mixer,cable\nDrum machine,OUT,FOH desk,CH 2,beat,mixer,cable\nFOH desk,MAIN,House PA,LINE IN,mixer,house,cable\nFOH desk,AUX 1,Stream PC,INPUT 1,mixer,stream,cable\nFOH desk,FX SEND,FOH desk,FX RETURN,mixer,mixer,cable\nFOH desk,CH 1,FOH desk,MAIN,mixer,mixer,send\nFOH desk,CH 2,FOH desk,MAIN,mixer,mixer,send\nFOH desk,CH 1,FOH desk,AUX 1,mixer,mixer,send\nFOH desk,CH 1,FOH desk,FX SEND,mixer,mixer,send\nFOH desk,FX RETURN,FOH desk,FX SEND,mixer,mixer,send\nFOH desk,FX RETURN,FOH desk,MAIN,mixer,mixer,send\nFOH desk,FX RETURN,FOH desk,AUX 1,mixer,mixer,send\n", "patch": "source_device,source_port,destination_device,destination_port,source_role,destination_role\nLead synth,OUT,FOH desk,CH 1,lead,mixer\nDrum machine,OUT,FOH desk,CH 2,beat,mixer\nFOH desk,MAIN,House PA,LINE IN,mixer,house\nFOH desk,AUX 1,Stream PC,INPUT 1,mixer,stream\n"};
$('language').onchange=e=>{
 language=e.target.value;try{localStorage.setItem('patchroom-language',language)}catch{}
 localizeStatic();populatePatchPorts();feedback='';$('import-error').hidden=true;
 if(csvActive){localizeScene(csvScene);paintVenue()}else render();
 refreshDownloads();
};
function refreshDownloads(){
 for(const [id,key,ja] of [['meeting-download','hybrid',meetingCsv],['loop-download','loop',loopCsv],['csv-download','patch',sampleCsv]]){
  const link=$(id);if(link.href.startsWith('blob:'))URL.revokeObjectURL(link.href);
  link.href=URL.createObjectURL(new Blob(['\uFEFF'+L(ja,englishExamples[key])],{type:'text/csv;charset=utf-8'}));
 }
}
refreshDownloads();

$('queries').textContent=cycleQuery+'\n\n'+pathQuery;
try{const compressed=Uint8Array.from(atob('WASM_BYTES'),c=>c.charCodeAt(0));const bytes=await new Response(new Blob([compressed]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();await init({module_or_path:bytes});db=new RelateDb();model=compute();render();chooseScene('meeting')}catch(e){$('notice').textContent=L("起動できませんでした。Chromeでこのファイルを開いてください。 ","Could not start. Open this file in Chrome. ")+e.message;throw e}
