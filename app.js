'use strict';
const $ = id => document.getElementById(id);
const esc = value => String(value ?? '').replace(/[&<>\"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[c]));
const savedPlatforms = JSON.parse(localStorage.getItem('absolute-cinema:platforms') || '[]');
const savedFavorites = [
  ...JSON.parse(localStorage.getItem('filmcurator:favs') || '[]'),
  ...JSON.parse(localStorage.getItem('filmfestivals:favs') || '[]'),
  ...JSON.parse(localStorage.getItem('absolute-cinema:favorites') || '[]'),
];

let movies = [], sources = {}, limits = {};
const favorites = new Set(savedFavorites.map(Number));
const state = {
  view: new URLSearchParams(location.search).get('view') === 'awards' ? 'awards' : 'lists',
  query:'', sources:new Set(), awardFilter:'', onlyBoth:false, platforms:new Set(savedPlatforms),
  country:'', director:'', genre:'', yearMin:0, yearMax:9999, duration:9999, sort:'', favoritesOnly:false,
};
const drawState = {genre:'', platforms:new Set()};

const unique = values => [...new Set(values.filter(Boolean))].sort((a,b)=>a.localeCompare(b,'pt-BR'));
const titleOf = m => m.title.pt || m.title.original;
const festivalSet = m => new Set(m.awards.filter(a=>a.isGate).map(a=>a.festival));
const awardAnchor = m => {
  const years=m.awards.filter(a=>a.isGate).map(a=>a.awardYear);
  return years.length ? Math.min(...years) : 0;
};
const points = m => m.rankings.reduce((sum,r)=>sum+(limits.sourceSizes[r.source]||0)-r.position+1,0);
const PRESTIGE={cannes:{'Filme':1,'Grande Prêmio':2,'Prêmio do Júri':3,'Direção':4,'Roteiro':5,'Ator':90,'Atriz':90},oscar:{'Filme':1,'Direção':2,'Roteiro':3,'Filme Estrangeiro':4,'Ator':90,'Atriz':90}};
const AWARD_LABEL={'Filme':'Melhor Filme','Grande Prêmio':'Grande Prêmio','Prêmio do Júri':'Prêmio do Júri','Direção':'Melhor Direção','Roteiro':'Melhor Roteiro','Filme Estrangeiro':'Filme Estrangeiro','Ator':'Melhor Ator','Atriz':'Melhor Atriz'};
const prestigeVector=m=>m.awards.map(a=>PRESTIGE[a.festival]?.[a.category]??999).sort((a,b)=>a-b);
function comparePrestige(a,b){const av=prestigeVector(a),bv=prestigeVector(b),n=Math.max(av.length,bv.length);for(let i=0;i<n;i++){const diff=(av[i]??Infinity)-(bv[i]??Infinity);if(diff)return diff;}return titleOf(a).localeCompare(titleOf(b),'pt-BR');}

function options(id, values){ const el=$(id); values.forEach(v=>el.add(new Option(v,v))); }
function buildChecks(id, values, selected, onChange){
  $(id).innerHTML=values.map(v=>`<label class="check-option"><input type="checkbox" value="${esc(v)}" ${selected.has(v)?'checked':''}><span>${esc(v)}</span></label>`).join('');
  $(id).addEventListener('change', e=>{ if(e.target.type!=='checkbox')return; e.target.checked?selected.add(e.target.value):selected.delete(e.target.value); onChange(); });
}
function platformSummary(selected){ return !selected.size?'Todas':selected.size<=2?[...selected].join(', '):`${[...selected].slice(0,2).join(', ')} +${selected.size-2}`; }

function setView(view, reset=true){
  state.view=view; state.favoritesOnly=false;
  if(reset) resetTemporary();
  document.querySelectorAll('.view-button').forEach(b=>b.classList.toggle('active',b.dataset.view===view));
  document.querySelectorAll('.lists-only').forEach(e=>e.hidden=view!=='lists');
  document.querySelectorAll('.awards-only').forEach(e=>e.hidden=view!=='awards');
  $('sourceLegend').textContent=view==='lists'?'Listas':'Festivais';
  $('yearLabel').textContent=view==='lists'?'Ano do filme':'Ano da premiação';
  $('viewEyebrow').textContent=view==='lists'?'Consenso crítico':'Cannes & Oscar';
  $('viewTitle').textContent=view==='lists'?'A curadoria da crítica reunida':'Os filmes premiados ano a ano';
  $('viewDescription').innerHTML=view==='lists'?`Grandes listas — ${institutesInline()} — reunidas em uma só curadoria.`:`Filmes premiados em Cannes (desde ${festivalSince('cannes')}) e no Oscar (desde ${festivalSince('oscar')}).`;
  history.replaceState(null,'',`?view=${view}`);
  buildSourceChips(); buildSort(); syncInputs(); render();
}

function resetTemporary(){
  Object.assign(state,{query:'',awardFilter:'',onlyBoth:false,country:'',director:'',genre:'',yearMin:limits[state.view].min,yearMax:limits[state.view].max,duration:limits.duration,sort:state.view==='lists'?'score':'yearDesc'});
  state.sources=new Set(state.view==='lists'?Object.keys(sources):['cannes','oscar']);
}
function resetAll(){ state.platforms.clear(); localStorage.setItem('absolute-cinema:platforms','[]'); resetTemporary(); buildSourceChips(); syncPlatformChecks(); buildSort(); syncInputs(); render(); }

function buildSourceChips(){
  const entries=state.view==='lists'?Object.entries(sources).map(([k,v])=>[k,v.label]):[['cannes','Cannes'],['oscar','Oscar']];
  $('sourceChips').innerHTML=entries.map(([key,label])=>`<label class="source-check"><input type="checkbox" data-source="${key}" ${state.sources.has(key)?'checked':''}><span>${esc(label)}</span></label>`).join('');
}
function buildSort(){
  const list=state.view==='lists'?[['score','Pontos'],['yearDesc','Ano (mais recente)'],['yearAsc','Ano (mais antigo)'],['title','Título (A–Z)'],['durationAsc','Duração (menor)'],['durationDesc','Duração (maior)']]:[['yearDesc','Premiação (mais recente)'],['yearAsc','Premiação (mais antiga)'],['title','Título (A–Z)'],['durationAsc','Duração (menor)'],['durationDesc','Duração (maior)']];
  $('sort').innerHTML=list.map(([v,l])=>`<option value="${v}">${l}</option>`).join(''); $('sort').value=state.sort;
}
function syncPlatformChecks(){ document.querySelectorAll('#platformOptions input').forEach(i=>i.checked=state.platforms.has(i.value)); $('platformSummary').textContent=platformSummary(state.platforms); }
function syncInputs(){
  $('query').value=state.query; $('awardFilter').value=state.awardFilter; $('onlyBoth').checked=state.onlyBoth; $('country').value=state.country; $('director').value=state.director; $('genre').value=state.genre;
  $('yearMin').min=limits[state.view].min; $('yearMin').max=limits[state.view].max;
  $('yearMax').min=limits[state.view].min; $('yearMax').max=limits[state.view].max;
  $('yearMin').value=state.yearMin; $('yearMax').value=state.yearMax; $('duration').value=state.duration; $('durationValue').textContent=state.duration>=limits.duration?'qualquer':`até ${state.duration} min`;
  $('favoritesButton').setAttribute('aria-pressed',String(state.favoritesOnly)); $('favoritesButton').textContent=state.favoritesOnly?'♥':'♡';
}

function matches(m){
  if(state.view==='lists'&&!m.rankings.length)return false; if(state.view==='awards'&&!m.awards.length)return false;
  if(state.favoritesOnly)return favorites.has(m.id);
  const hay=`${titleOf(m)} ${m.title.original||''} ${m.director||''}`.toLowerCase(); if(state.query&&!hay.includes(state.query.toLowerCase()))return false;
  if(state.view==='lists'){
    if(!m.rankings.some(r=>state.sources.has(r.source)))return false;
    const f=festivalSet(m); if(state.awardFilter==='any'&&!f.size)return false; if(['cannes','oscar'].includes(state.awardFilter)&&!f.has(state.awardFilter))return false; if(state.awardFilter==='both'&&!(f.has('cannes')&&f.has('oscar')))return false;
    if(m.releaseYear<state.yearMin||m.releaseYear>state.yearMax)return false;
  }else{
    const activeAwards=m.awards.filter(a=>a.isGate&&state.sources.has(a.festival)); if(!activeAwards.length)return false;
    if(state.onlyBoth){const f=festivalSet(m);if(!(f.has('cannes')&&f.has('oscar')))return false;}
    const anchor=awardAnchor(m); if(anchor<state.yearMin||anchor>state.yearMax)return false;
  }
  if(state.platforms.size&&!m.streaming.subscription.some(p=>state.platforms.has(p)))return false;
  if(state.country&&!m.countries.includes(state.country))return false; if(state.director&&m.director!==state.director)return false; if(state.genre&&!m.genres.includes(state.genre))return false; if(m.duration&&m.duration>state.duration)return false;
  return true;
}
function sortMovies(list){return list.sort((a,b)=>{switch(state.sort){case'score':return points(b)-points(a);case'yearDesc':return state.view==='lists'?(b.releaseYear||0)-(a.releaseYear||0):(awardAnchor(b)-awardAnchor(a)||comparePrestige(a,b));case'yearAsc':return state.view==='lists'?(a.releaseYear||9999)-(b.releaseYear||9999):(awardAnchor(a)-awardAnchor(b)||comparePrestige(a,b));case'title':return titleOf(a).localeCompare(titleOf(b),'pt-BR');case'durationAsc':return(a.duration||9999)-(b.duration||9999);case'durationDesc':return(b.duration||0)-(a.duration||0);default:return 0;}});}
const awardsHtml=m=>['cannes','oscar'].map(f=>{const a=m.awards.filter(x=>x.festival===f);return a.length?`<span class="award-row"><img class="award-icon" src="assets/${f}-circle.svg" alt="${f==='cannes'?'Cannes':'Oscar'}"><span>${a.map(x=>esc(AWARD_LABEL[x.category]||x.category)+(x.recipient?` (${esc(x.recipient)})`:'')).join(', ')}</span></span>`:''}).filter(Boolean).join('');
const rankingsHtml=m=>m.rankings.map(r=>`${esc(sources[r.source]?.label||r.source)} #${r.position}`).join(' · ');
const festivalSince=f=>Math.min(...movies.flatMap(m=>m.awards.filter(a=>a.festival===f).map(a=>a.awardYear)));
function institutesInline(){const s=Object.values(sources).map(x=>x.url?`<a href="${x.url}" target="_blank" rel="noopener">${esc(x.label)}</a>`:esc(x.label));return s.length>1?`${s.slice(0,-1).join(', ')} e ${s[s.length-1]}`:s.join('');}
function festivalYears(m){const c=m.awards.filter(a=>a.festival==='cannes').map(a=>a.awardYear),o=m.awards.filter(a=>a.festival==='oscar').map(a=>a.awardYear);return c.length&&o.length&&Math.min(...c)!==Math.min(...o)?`<p class="year-note">Cannes ${Math.min(...c)} · Oscar ${Math.min(...o)}</p>`:'';}
function card(m){const primary=state.view==='lists'?`★ ${points(m)} pontos · ${rankingsHtml(m)}`:awardsHtml(m);const cross=state.view==='lists'?awardsHtml(m):rankingsHtml(m);const poster=m.posterPath?`<img class="poster" src="https://image.tmdb.org/t/p/w185${m.posterPath}" alt="Pôster de ${esc(titleOf(m))}" loading="lazy">`:'<div class="poster none">Sem pôster</div>';return `<article class="movie-card">${poster}<button class="favorite ${favorites.has(m.id)?'active':''}" data-favorite="${m.id}" type="button" aria-label="Favoritar">${favorites.has(m.id)?'♥':'♡'}</button><div class="card-body"><h3>${esc(titleOf(m))}</h3>${m.title.original&&m.title.original!==titleOf(m)?`<p class="original-title">${esc(m.title.original)}</p>`:''}<div class="primary-meta">${primary}</div>${cross?`<div class="cross-meta">${cross}</div>`:''}${festivalYears(m)}<div class="genres">${m.genres.map(g=>`<span>${esc(g)}</span>`).join('')}</div><div class="facts"><span><b>${esc(m.director||'')}</b></span><span>${m.releaseYear||''}</span><span>${esc(m.countries.join(' / '))}</span><span>${m.duration?`${m.duration} min`:''}</span></div><div class="platforms">${m.streaming.subscription.length?m.streaming.subscription.map(p=>`<span class="platform-tag">${esc(p)}</span>`).join(''):'<span class="no-streaming">sem streaming BR</span>'}</div></div><div class="synopsis-wrap"><p class="synopsis">${esc(m.overview||'Sinopse indisponível.')}</p></div></article>`;}
function render(){const list=sortMovies(movies.filter(matches));$('resultCount').textContent=list.length;if(!list.length){$('movieGrid').innerHTML=state.favoritesOnly?'<div class="empty">Você ainda não favoritou nenhum filme. Toque no ♥ de um filme para salvá-lo aqui.</div>':'<div class="empty">Nenhum filme encontrado com esses filtros.</div>';return;}if(state.view==='awards'&&['yearDesc','yearAsc'].includes(state.sort)){let last=null;$('movieGrid').innerHTML=list.map(m=>{const y=awardAnchor(m);const sep=y!==last?`<div class="year-separator">${y}</div>`:'';last=y;return sep+card(m);}).join('');}else $('movieGrid').innerHTML=list.map(card).join('');}

function drawPool(){return movies.filter(m=>(state.view==='lists'?m.rankings.length:m.awards.length)&&(!drawState.genre||m.genres.includes(drawState.genre))&&(!drawState.platforms.size||m.streaming.subscription.some(p=>drawState.platforms.has(p))));}
function draw(){const pool=drawPool();const m=pool.length?pool[Math.floor(Math.random()*pool.length)]:null;shownMovie=m;$('drawResult').innerHTML=m?card(m):'<div class="empty">Nenhum filme com esses critérios.</div>';if(m)syncMovieUrl(m);syncFav();}

let shownMovie=null;
const slugify=s=>(s||'').normalize('NFKD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');
const movieSlug=m=>slugify(m.title.original||m.title.pt);
function movieKey(m){const base=movieSlug(m);const dupe=movies.filter(x=>movieSlug(x)===base||slugify(x.title.pt)===base).length>1;return dupe?`${base}-${m.id}`:base;}
function shareUrl(m){return `${location.origin}${location.pathname}?filme=${movieKey(m)}`;}
function whatsappUrl(m){const ov=(m.overview||'').trim();const short=ov.length>180?ov.slice(0,180).trim()+'…':ov;const msg=`*${titleOf(m)}*${m.releaseYear?` (${m.releaseYear})`:''}${short?`\n${short}`:''}\n\n${shareUrl(m)}`;return `https://wa.me/?text=${encodeURIComponent(msg)}`;}
function syncMovieUrl(m){history.replaceState(null,'',`?filme=${movieKey(m)}`);}
function findMovie(param){param=(param||'').toLowerCase();if(/^\d+$/.test(param))return movies.find(m=>m.id===+param);const idm=param.match(/-(\d+)$/);if(idm){const byId=movies.find(m=>m.id===+idm[1]);if(byId)return byId;}return movies.find(m=>movieSlug(m)===param||slugify(m.title.pt)===param);}
function openMovie(m){shownMovie=m;$('drawResult').innerHTML=card(m);syncMovieUrl(m);syncFav();if(!$('shuffleDialog').open)$('shuffleDialog').showModal();}
function syncFav(){const b=$('favMovie');if(!shownMovie)return;const on=favorites.has(shownMovie.id);b.textContent=on?'♥':'♡';b.classList.toggle('active',on);}
function copyText(t){if(navigator.clipboard&&window.isSecureContext)return navigator.clipboard.writeText(t);return new Promise(res=>{const ta=document.createElement('textarea');ta.value=t;ta.style.cssText='position:fixed;opacity:0';$('shuffleDialog').appendChild(ta);ta.select();try{document.execCommand('copy');}catch(e){}ta.remove();res();});}
function showToast(msg){const t=$('toast');t.textContent=msg;t.classList.add('show');clearTimeout(t._h);t._h=setTimeout(()=>t.classList.remove('show'),1800);}

async function boot(){
  [movies,sources]=await Promise.all([fetch('data/movies.json').then(r=>r.json()),fetch('data/sources.json').then(r=>r.json())]);
  const listYears=movies.filter(m=>m.rankings.length).map(m=>m.releaseYear).filter(Boolean), awardYears=movies.flatMap(m=>m.awards.map(a=>a.awardYear)), durations=movies.map(m=>m.duration).filter(Boolean);
  limits={lists:{min:Math.min(...listYears),max:Math.max(...listYears)},awards:{min:Math.min(...awardYears),max:Math.max(...awardYears)},duration:Math.max(...durations),sourceSizes:{}};
  Object.keys(sources).forEach(s=>limits.sourceSizes[s]=Math.max(0,...movies.flatMap(m=>m.rankings.filter(r=>r.source===s).map(r=>r.position))));
  const platforms=unique(movies.flatMap(m=>m.streaming.subscription)); options('country',unique(movies.flatMap(m=>m.countries))); options('director',unique(movies.map(m=>m.director))); options('genre',unique(movies.flatMap(m=>m.genres))); options('drawGenre',unique(movies.flatMap(m=>m.genres)));
  buildChecks('platformOptions',platforms,state.platforms,()=>{localStorage.setItem('absolute-cinema:platforms',JSON.stringify([...state.platforms]));$('platformSummary').textContent=platformSummary(state.platforms);render();});
  buildChecks('drawPlatformOptions',platforms,drawState.platforms,()=>{$('drawPlatformSummary').textContent=drawState.platforms.size?platformSummary(drawState.platforms):'Qualquer';});
  const checked=movies.map(m=>m.streaming?.checkedAt).filter(Boolean).sort();
  if(checked.length){const[y,mo,d]=checked[checked.length-1].split('-');$('streamingUpdated').textContent=`atualizados em ${d}/${mo}/${y}`;}
  const shared=new URLSearchParams(location.search).get('filme');
  setView(state.view,true);
  if(shared){const m=findMovie(shared);if(m)openMovie(m);else if($('shuffleDialog').open)$('shuffleDialog').close();}
}

document.querySelector('.view-switch').addEventListener('click',e=>{const b=e.target.closest('[data-view]');if(b)setView(b.dataset.view,true);});
document.querySelector('.switch').addEventListener('click',()=>setView(state.view==='lists'?'awards':'lists',true));
$('sourceChips').addEventListener('change',e=>{const input=e.target.closest('input[data-source]');if(!input)return;input.checked?state.sources.add(input.dataset.source):state.sources.delete(input.dataset.source);render();});
[['query','input','query'],['awardFilter','change','awardFilter'],['country','change','country'],['director','change','director'],['genre','change','genre'],['sort','change','sort']].forEach(([id,event,key])=>$(id).addEventListener(event,e=>{state[key]=e.target.value;render();}));
$('onlyBoth').addEventListener('change',e=>{state.onlyBoth=e.target.checked;render();});
$('yearMin').addEventListener('change',e=>{const range=limits[state.view];state.yearMin=Math.max(range.min,Math.min(+e.target.value||range.min,state.yearMax));e.target.value=state.yearMin;render();});
$('yearMax').addEventListener('change',e=>{const range=limits[state.view];state.yearMax=Math.min(range.max,Math.max(+e.target.value||range.max,state.yearMin));e.target.value=state.yearMax;render();});
$('duration').addEventListener('input',e=>{state.duration=+e.target.value;$('durationValue').textContent=state.duration>=limits.duration?'qualquer':`até ${state.duration} min`;render();});
$('resetFilters').addEventListener('click',resetAll); $('favoritesButton').addEventListener('click',()=>{state.favoritesOnly=!state.favoritesOnly;syncInputs();render();});
document.addEventListener('click',e=>{const b=e.target.closest('[data-favorite]');if(!b)return;const id=+b.dataset.favorite;favorites.has(id)?favorites.delete(id):favorites.add(id);localStorage.setItem('absolute-cinema:favorites',JSON.stringify([...favorites]));render();if($('shuffleDialog').open)draw();});
document.querySelectorAll('[data-shuffle]').forEach(button=>button.addEventListener('click',()=>{drawState.genre='';drawState.platforms.clear();$('drawGenre').value='';document.querySelectorAll('#drawPlatformOptions input').forEach(i=>i.checked=false);$('drawPlatformSummary').textContent='Qualquer';draw();$('shuffleDialog').showModal();}));
$('filtersToggle').addEventListener('click',()=>{const filters=document.querySelector('.filters');const collapsed=filters.classList.toggle('collapsed');$('filtersToggle').setAttribute('aria-expanded',String(!collapsed));});
$('closeShuffle').addEventListener('click',()=>$('shuffleDialog').close()); $('drawAgain').addEventListener('click',draw); $('drawGenre').addEventListener('change',e=>drawState.genre=e.target.value);
$('copyMovie').addEventListener('click',e=>{if(!shownMovie)return;copyText(shareUrl(shownMovie)).then(()=>showToast('Filme copiado'));e.currentTarget.blur();});
$('shareWhats').addEventListener('click',e=>{if(!shownMovie)return;window.open(whatsappUrl(shownMovie),'_blank','noopener');e.currentTarget.blur();});
$('favMovie').addEventListener('click',e=>{if(!shownMovie)return;const id=shownMovie.id;favorites.has(id)?favorites.delete(id):favorites.add(id);localStorage.setItem('absolute-cinema:favorites',JSON.stringify([...favorites]));syncFav();render();e.currentTarget.blur();});
$('shuffleDialog').addEventListener('close',()=>{shownMovie=null;history.replaceState(null,'',`?view=${state.view}`);});
if(new URLSearchParams(location.search).get('filme')){$('drawResult').innerHTML='<div class="empty">Carregando…</div>';$('shuffleDialog').showModal();}
boot().catch(err=>{$('movieGrid').innerHTML=`<div class="empty">Não foi possível carregar o catálogo: ${esc(err.message)}</div>`;});
