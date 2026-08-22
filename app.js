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
const HEART_SVG='<svg viewBox="0 -960 960 960" aria-hidden="true"><path d="m480-120-58-52q-101-91-167-157T150-447.5Q111-500 95.5-544T80-634q0-94 63-157t157-63q52 0 99 22t81 62q34-40 81-62t99-22q94 0 157 63t63 157q0 46-15.5 90T810-447.5Q771-395 705-329T538-172l-58 52Zm0-108q96-86 158-147.5t98-107q36-45.5 50-81t14-70.5q0-60-40-100t-100-40q-47 0-87 26.5T518-680h-76q-15-41-55-67.5T300-774q-60 0-100 40t-40 100q0 35 14 70.5t50 81q36 45.5 98 107T480-228Zm0-273Z"/></svg>';
const SEARCH_SVG='<svg viewBox="0 -960 960 960" aria-hidden="true"><path d="M784-120 532-372q-30 24-69 38t-83 14q-109 0-184.5-75.5T120-580q0-109 75.5-184.5T380-840q109 0 184.5 75.5T640-580q0 44-14 83t-38 69l252 252-56 56ZM380-400q75 0 127.5-52.5T560-580q0-75-52.5-127.5T380-760q-75 0-127.5 52.5T200-580q0 75 52.5 127.5T380-400Z"/></svg>';
const COPY_SVG='<svg viewBox="0 -960 960 960" aria-hidden="true"><path d="M360-240q-33 0-56.5-23.5T280-320v-480q0-33 23.5-56.5T360-880h360q33 0 56.5 23.5T800-800v480q0 33-23.5 56.5T720-240H360Zm0-80h360v-480H360v480ZM200-80q-33 0-56.5-23.5T120-160v-560h80v560h440v80H200Z"/></svg>';
const WHATS_SVG='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.9 9.9 0 004.79 1.21c5.46 0 9.91-4.45 9.91-9.91C21.95 6.45 17.5 2 12.04 2zm0 18.15c-1.52 0-3.01-.41-4.3-1.18l-.31-.18-3.12.82.83-3.04-.2-.31a8.2 8.2 0 01-1.26-4.36c0-4.54 3.7-8.24 8.24-8.24 4.54 0 8.23 3.7 8.23 8.24 0 4.54-3.69 8.24-8.24 8.24zm4.52-6.16c-.25-.12-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.12-.16.25-.64.81-.79.97-.15.16-.29.18-.54.06-.25-.12-1.05-.39-1.99-1.23-.74-.66-1.23-1.48-1.38-1.72-.14-.25-.02-.38.11-.5.11-.11.25-.29.37-.43.12-.14.16-.25.25-.41.08-.16.04-.31-.02-.43-.06-.12-.56-1.34-.76-1.84-.2-.48-.4-.42-.56-.43h-.48c-.16 0-.43.06-.66.31-.23.25-.86.85-.86 2.07 0 1.22.89 2.4 1.01 2.56.12.16 1.75 2.67 4.25 3.74.59.26 1.06.41 1.42.52.6.19 1.14.16 1.57.1.48-.07 1.47-.6 1.68-1.18.21-.58.21-1.07.14-1.18-.06-.11-.22-.17-.47-.29z"/></svg>';
function googleSearch(m){window.open(`https://www.google.com/search?q=${encodeURIComponent(`${titleOf(m)} ${m.releaseYear||''} filme`)}`,'_blank','noopener');}
function copyMovie(m){copyText(shareUrl(m)).then(()=>showToast('Filme copiado'));}
function shareWhatsapp(m){window.open(whatsappUrl(m),'_blank','noopener');}
function card(m){const primary=state.view==='lists'?`★ ${points(m)} pontos · ${rankingsHtml(m)}`:awardsHtml(m);const cross=state.view==='lists'?awardsHtml(m):rankingsHtml(m);const poster=m.posterPath?`<img class="poster" src="https://image.tmdb.org/t/p/w185${m.posterPath}" alt="Pôster de ${esc(titleOf(m))}" loading="lazy">`:'<div class="poster none">Sem pôster</div>';return `<article class="movie-card" data-id="${m.id}">${poster}<div class="card-actions"><button class="card-act fav ${favorites.has(m.id)?'active':''}" data-favorite="${m.id}" type="button" aria-label="Favoritar">${HEART_SVG}</button><button class="card-act" data-google="${m.id}" type="button" aria-label="Buscar no Google">${SEARCH_SVG}</button><button class="card-act" data-copy="${m.id}" type="button" aria-label="Copiar link do filme">${COPY_SVG}</button><button class="card-act whats" data-whats="${m.id}" type="button" aria-label="Compartilhar no WhatsApp">${WHATS_SVG}</button></div><div class="card-body"><h3>${esc(titleOf(m))}</h3>${m.title.original&&m.title.original!==titleOf(m)?`<p class="original-title">${esc(m.title.original)}</p>`:''}<div class="primary-meta">${primary}</div>${cross?`<div class="cross-meta">${cross}</div>`:''}${festivalYears(m)}<div class="genres">${m.genres.map(g=>`<span>${esc(g)}</span>`).join('')}</div><div class="facts"><span><b>${esc(m.director||'')}</b></span><span>${m.releaseYear||''}</span><span>${esc(m.countries.join(' / '))}</span><span>${m.duration?`${m.duration} min`:''}</span></div><div class="platforms">${m.streaming.subscription.length?m.streaming.subscription.map(p=>`<span class="platform-tag">${esc(p)}</span>`).join(''):'<span class="no-streaming">sem streaming BR</span>'}</div></div><div class="synopsis-wrap"><p class="synopsis">${esc(m.overview||'Sinopse indisponível.')}</p></div></article>`;}
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
function syncFav(){if(!shownMovie)return;$('favMovie').classList.toggle('active',favorites.has(shownMovie.id));}
function copyText(t){if(navigator.clipboard&&window.isSecureContext)return navigator.clipboard.writeText(t);return new Promise(res=>{const ta=document.createElement('textarea');ta.value=t;ta.style.cssText='position:fixed;opacity:0';$('shuffleDialog').appendChild(ta);ta.select();try{document.execCommand('copy');}catch(e){}ta.remove();res();});}
function showToast(msg){const t=$('toast');const p=$('shuffleDialog').open?$('shuffleDialog'):document.body;if(t.parentNode!==p)p.appendChild(t);t.textContent=msg;t.classList.add('show');clearTimeout(t._h);t._h=setTimeout(()=>t.classList.remove('show'),1800);}

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
$('copyMovie').addEventListener('click',e=>{if(shownMovie)copyMovie(shownMovie);e.currentTarget.blur();});
$('shareWhats').addEventListener('click',e=>{if(shownMovie)shareWhatsapp(shownMovie);e.currentTarget.blur();});
$('favMovie').addEventListener('click',e=>{if(!shownMovie)return;const id=shownMovie.id;favorites.has(id)?favorites.delete(id):favorites.add(id);localStorage.setItem('absolute-cinema:favorites',JSON.stringify([...favorites]));syncFav();render();e.currentTarget.blur();});
$('movieGrid').addEventListener('click',e=>{const act=e.target.closest('.card-act');if(act){const c=act.closest('.movie-card');const m=movies.find(x=>x.id===+c.dataset.id);if(m){if('google'in act.dataset)googleSearch(m);else if('copy'in act.dataset)copyMovie(m);else if('whats'in act.dataset)shareWhatsapp(m);}act.blur();return;}const c=e.target.closest('.movie-card');if(!c)return;const m=movies.find(x=>x.id===+c.dataset.id);if(m)openMovie(m);});
$('googleMovie').addEventListener('click',e=>{if(shownMovie)googleSearch(shownMovie);e.currentTarget.blur();});
$('shuffleDialog').addEventListener('close',()=>{shownMovie=null;history.replaceState(null,'',`?view=${state.view}`);});
if(new URLSearchParams(location.search).get('filme')){$('drawResult').innerHTML='<div class="empty">Carregando…</div>';$('shuffleDialog').showModal();}
boot().catch(err=>{$('movieGrid').innerHTML=`<div class="empty">Não foi possível carregar o catálogo: ${esc(err.message)}</div>`;});
