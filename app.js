(() => {
  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];

  const sections = {
    contacts: { eyebrow:'// MODULE 01', title:'Контакты и переходы', desc:'Номер телефона, WhatsApp, Telegram, email, звонки и безопасные правила перехода между каналами.' },
    content: { eyebrow:'// MODULE 02', title:'Контент и вовлечение', desc:'Письма, опросы, персональные подарки, фото-идеи и видео — без давления и подмены реальности.' },
    money: { eyebrow:'// MODULE 03', title:'Подарки, деньги и риски', desc:'Прозрачные подарки, финансовые просьбы и отдельный блок красных флагов для сомнительных практик.' }
  };

  const safeJson = (key, fallback) => {
    try { return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback)); }
    catch { return fallback; }
  };

  let currentSection = 'contacts';
  let currentFilter = 'all';
  let searchQuery = '';
  let favoritesOnly = false;
  let commandIndex = 0;
  let commandItems = [];

  const favorites = new Set(safeJson('cultgroup-favs', safeJson('teamhub-favs', [])));
  let recent = safeJson('cultgroup-recent', []);
  const openCounts = safeJson('cultgroup-open-counts', {});

  const statusLabel = s => s==='safe' ? 'ACTIVE' : s==='caution' ? 'ATTENTION' : 'RISK';
  const statusName = s => s==='safe' ? 'Обычное' : s==='caution' ? 'Осторожно' : 'Красный флаг';
  const formatDate = iso => {
    if (!iso) return '—';
    const [y,m,d] = iso.split('-');
    return `${d}.${m}.${y}`;
  };

  function showView(name){
    if(name==='admin' && window.CULT_BACKEND?.configured && !window.CULT_BACKEND.canEdit()){ alert('Редактор доступен только Editor и Admin.'); name='home'; }
    $$('.view').forEach(v=>v.classList.remove('active'));
    const view = $(`#${name}View`);
    if (view) view.classList.add('active');
    $$('.nav-item').forEach(n=>n.classList.toggle('active', n.dataset.view===name));
    $('#sidebar')?.classList.remove('open');
    window.scrollTo({top:0,behavior:'smooth'});
  }

  function openSection(section){
    currentSection=section; currentFilter='all'; searchQuery=''; favoritesOnly=false;
    $('#globalSearch').value='';
    $('#sectionEyebrow').textContent=sections[section].eyebrow;
    $('#sectionTitle').textContent=sections[section].title;
    $('#sectionDescription').textContent=sections[section].desc;
    $$('#filterPills button').forEach(b=>b.classList.toggle('active',b.dataset.filter==='all'));
    renderCards(); showView('library');
    $$('.nav-item').forEach(n=>n.classList.toggle('active',n.dataset.section===section));
    hideSuggestions();
  }

  function normalize(str=''){
    return str.toLowerCase().replace(/ё/g,'е').replace(/[“”«»'".,!?()\[\]{}:;\/\\|_+=*-]/g,' ').replace(/\s+/g,' ').trim();
  }

  function expandQuery(q){
    const normalized = normalize(q);
    if(!normalized) return [];
    const terms = new Set(normalized.split(' ').filter(Boolean));
    const syn = window.SEARCH_SYNONYMS || {};
    Object.entries(syn).forEach(([canonical, variants])=>{
      const family=[canonical,...variants].map(normalize);
      if(family.some(v=> normalized.includes(v) || terms.has(v))){
        family.forEach(v=>v.split(' ').forEach(t=>t&&terms.add(t)));
      }
    });
    return [...terms];
  }

  function searchableText(item){
    return normalize([
      item.title,item.subtitle,item.summary,item.type,item.useWhen,
      ...(item.tags||[]),...(item.bullets||[]),...(item.checklist||[]),...(item.steps||[])
    ].filter(Boolean).join(' '));
  }

  function searchScore(item,q){
    const nq=normalize(q);
    if(!nq) return 1;
    const text=searchableText(item);
    const terms=expandQuery(q);
    let score=0;
    if(normalize(item.title).includes(nq)) score+=24;
    if(normalize(item.subtitle).includes(nq)) score+=10;
    if(text.includes(nq)) score+=8;
    terms.forEach(term=>{
      if(normalize(item.title).includes(term)) score+=7;
      else if((item.tags||[]).some(t=>normalize(t).includes(term))) score+=5;
      else if(text.includes(term)) score+=2;
    });
    return score;
  }

  function searchItems(q, limit=Infinity){
    return window.KNOWLEDGE
      .filter(i=>i.section!=='situations')
      .map(item=>({item,score:searchScore(item,q)}))
      .filter(x=>x.score>0)
      .sort((a,b)=>b.score-a.score || (openCounts[b.item.id]||0)-(openCounts[a.item.id]||0))
      .slice(0,limit)
      .map(x=>x.item);
  }

  function saveFavs(){
    localStorage.setItem('cultgroup-favs',JSON.stringify([...favorites]));
    $('#favCount').textContent=favorites.size;
  }

  function saveRecent(){ localStorage.setItem('cultgroup-recent',JSON.stringify(recent)); }
  function saveOpenCounts(){ localStorage.setItem('cultgroup-open-counts',JSON.stringify(openCounts)); }

  function registerOpen(item){
    openCounts[item.id]=(openCounts[item.id]||0)+1;
    saveOpenCounts();
    recent=[item.id,...recent.filter(id=>id!==item.id)].slice(0,6);
    saveRecent();
    renderDashboardLists();
  }

  function cardMetaHtml(item){
    return `<div class="card-meta"><span>${item.type||'Материал'}</span><span>${formatDate(item.updated)}</span></div>`;
  }

  function renderCards(){
    let items;
    if(searchQuery) items=searchItems(searchQuery);
    else if(favoritesOnly) items=window.KNOWLEDGE.filter(i=>i.section!=='situations' && favorites.has(i.id));
    else items=window.KNOWLEDGE.filter(i=>i.section===currentSection);

    if(currentFilter!=='all') items=items.filter(i=>i.status===currentFilter);

    const grid=$('#cardsGrid'); grid.innerHTML='';
    items.forEach(item=>{
      const card=document.createElement('article');
      card.className='knowledge-card'; card.dataset.id=item.id;
      card.innerHTML=`
        <div class="card-top"><span class="badge ${item.status}">${statusLabel(item.status)}</span><button class="star ${favorites.has(item.id)?'active':''}" aria-label="В избранное">${favorites.has(item.id)?'★':'☆'}</button></div>
        <h3>${item.title}</h3>
        <p>${item.subtitle}</p>
        <div class="card-code">CG-${String(window.KNOWLEDGE.indexOf(item)+1).padStart(3,'0')}</div>
        ${cardMetaHtml(item)}
        ${item.useWhen?`<div class="use-when"><b>Когда:</b> ${item.useWhen}</div>`:''}
        <div class="tag-row">${(item.tags||[]).slice(0,4).map(t=>`<span class="tag">${t}</span>`).join('')}</div>`;
      card.addEventListener('click',e=>{if(e.target.closest('.star'))return;openDetail(item)});
      card.querySelector('.star').addEventListener('click',e=>{e.stopPropagation();toggleFav(item.id);renderCards()});
      grid.appendChild(card);
    });
    $('#resultCount').textContent=`${items.length} ${items.length===1?'CARD':'CARDS'}`;
    $('#emptyState').hidden=items.length>0;
  }

  function toggleFav(id){
    favorites.has(id)?favorites.delete(id):favorites.add(id);
    saveFavs(); renderDashboardLists();
  }

  function relatedItems(item, limit=4){
    const tags=new Set((item.tags||[]).map(normalize));
    return window.KNOWLEDGE.filter(x=>x.id!==item.id && x.section!=='situations').map(x=>{
      let score=x.section===item.section?2:0;
      (x.tags||[]).forEach(t=>{if(tags.has(normalize(t)))score+=3});
      return {x,score};
    }).filter(o=>o.score>0).sort((a,b)=>b.score-a.score).slice(0,limit).map(o=>o.x);
  }

  function sourceButtons(item, rich=false){
    if(!item.sources?.length) return '<div class="detail-empty">Связанных исходников пока нет.</div>';
    if(!rich) return `<div class="source-links">${item.sources.map(n=>`<button data-source="${n}">SOURCE ${String(n).padStart(2,'0')}</button>`).join('')}</div>`;
    return `<div class="detail-sources-grid">${item.sources.map(n=>{
      const s=window.SOURCE_IMAGES.find(x=>x.id===n);
      return s?`<button data-source="${n}" class="detail-source-card"><img src="${s.src}" alt="SOURCE ${String(n).padStart(2,'0')}"><span>SOURCE ${String(n).padStart(2,'0')}</span></button>`:'';
    }).join('')}</div>`;
  }

  function openDetail(item){
    registerOpen(item);
    const list=item.steps||item.checklist||item.bullets||[];
    const related=relatedItems(item);
    const content=$('#detailContent');
    content.innerHTML=`<div class="detail-inner">
      <div class="detail-header-line"><span class="badge ${item.status}">${statusName(item.status)}</span><span class="detail-code">CG / ${item.id.toUpperCase()}</span></div>
      <h2>${item.title}</h2><div class="subtitle">${item.subtitle}</div>
      <div class="detail-tabs" role="tablist">
        <button class="active" data-detail-tab="quick">Кратко</button>
        <button data-detail-tab="full">Подробно</button>
        <button data-detail-tab="sources">Исходники <span>${item.sources?.length||0}</span></button>
      </div>
      <section class="detail-tab active" data-detail-panel="quick">
        <div class="detail-summary">${item.summary}</div>
        <div class="detail-facts">
          <div><span>ТИП</span><b>${item.type||'Материал'}</b></div>
          <div><span>СТАТУС</span><b>${statusLabel(item.status)}</b></div>
          <div><span>ОБНОВЛЕНО</span><b>${formatDate(item.updated)}</b></div>
        </div>
        ${item.useWhen?`<div class="detail-use"><span>КОГДА ОТКРЫВАТЬ</span><p>${item.useWhen}</p></div>`:''}
      </section>
      <section class="detail-tab" data-detail-panel="full">
        ${list.length?`<ul class="detail-list">${list.map(x=>`<li>${x}</li>`).join('')}</ul>`:'<div class="detail-empty">Дополнительных шагов для этой карточки нет.</div>'}
        ${related.length?`<div class="related-block"><span>// RELATED</span><h3>Связанные материалы</h3><div class="related-grid">${related.map(r=>`<button data-related="${r.id}"><b>${r.title}</b><small>${r.type||'Материал'} · ${statusLabel(r.status)}</small></button>`).join('')}</div></div>`:''}
      </section>
      <section class="detail-tab" data-detail-panel="sources">${sourceButtons(item,true)}</section>
    </div>`;

    $$('[data-detail-tab]').forEach(btn=>btn.addEventListener('click',()=>{
      $$('[data-detail-tab]').forEach(x=>x.classList.toggle('active',x===btn));
      $$('[data-detail-panel]').forEach(p=>p.classList.toggle('active',p.dataset.detailPanel===btn.dataset.detailTab));
    }));
    $$('#detailContent [data-source]').forEach(b=>b.addEventListener('click',()=>openImage(+b.dataset.source)));
    $$('#detailContent [data-related]').forEach(b=>b.addEventListener('click',()=>{
      const next=window.KNOWLEDGE.find(x=>x.id===b.dataset.related); if(next) openDetail(next);
    }));
    if(!$('#detailDialog').open) $('#detailDialog').showModal();
  }

  function openCardById(id){ const item=window.KNOWLEDGE.find(x=>x.id===id); if(item) openDetail(item); }

  function renderSources(){
    const grid=$('#sourceGrid'); grid.innerHTML='';
    window.SOURCE_IMAGES.forEach(s=>{
      const el=document.createElement('div'); el.className='source-card';
      el.innerHTML=`<img loading="lazy" src="${s.src}" alt="${s.label}"><span>SOURCE ${String(s.id).padStart(2,'0')}</span>`;
      el.addEventListener('click',()=>openImage(s.id)); grid.appendChild(el);
    });
  }

  function openImage(id){
    const s=window.SOURCE_IMAGES.find(x=>x.id===id); if(!s)return;
    $('#imagePreview').src=s.src; $('#imageDialog').showModal();
  }

  function globalSearch(q){
    searchQuery=q.trim(); currentFilter='all'; favoritesOnly=false;
    if(!searchQuery){ showView('home'); hideSuggestions(); return; }
    $('#sectionEyebrow').textContent='// SMART SEARCH';
    $('#sectionTitle').textContent=`Результаты: “${searchQuery}”`;
    $('#sectionDescription').textContent='Поиск учитывает синонимы, разговорные варианты и близкие термины.';
    $$('#filterPills button').forEach(b=>b.classList.toggle('active',b.dataset.filter==='all'));
    renderCards(); showView('library');
  }

  function renderSuggestions(q){
    const box=$('#searchSuggestions');
    const nq=q.trim();
    if(!nq){hideSuggestions();return;}
    const items=searchItems(nq,5);
    if(!items.length){box.innerHTML='<div class="suggest-empty">Нет быстрого совпадения — Enter покажет полный поиск</div>';box.hidden=false;return;}
    box.innerHTML=items.map(item=>`<button data-suggest="${item.id}"><span>${item.type||'Материал'}</span><b>${item.title}</b><small>${item.subtitle}</small></button>`).join('');
    box.hidden=false;
    $$('[data-suggest]').forEach(b=>b.addEventListener('mousedown',e=>{e.preventDefault();hideSuggestions();openCardById(b.dataset.suggest)}));
  }
  function hideSuggestions(){ const b=$('#searchSuggestions'); if(b)b.hidden=true; }

  function compactItem(item, prefix=''){
    return `<button data-compact="${item.id}"><span>${prefix||item.type||'ITEM'}</span><div><b>${item.title}</b><small>${item.useWhen||item.subtitle}</small></div><i>→</i></button>`;
  }

  function renderDashboardLists(){
    const pinned=$('#pinnedList'); const recentEl=$('#recentList');
    const pinnedBase=window.KNOWLEDGE.filter(x=>x.pinned && x.section!=='situations');
    const extra=window.KNOWLEDGE.filter(x=>!x.pinned && x.section!=='situations' && (openCounts[x.id]||0)>0).sort((a,b)=>(openCounts[b.id]||0)-(openCounts[a.id]||0));
    const pinnedItems=[...pinnedBase,...extra].filter((x,i,arr)=>arr.findIndex(y=>y.id===x.id)===i).slice(0,5);
    pinned.innerHTML=pinnedItems.map((x,i)=>compactItem(x,`0${i+1}`)).join('');

    const recentItems=recent.map(id=>window.KNOWLEDGE.find(x=>x.id===id)).filter(Boolean).slice(0,5);
    recentEl.innerHTML=recentItems.length?recentItems.map((x,i)=>compactItem(x,`R${i+1}`)).join(''):'<div class="compact-empty">Здесь появятся последние открытые карточки.</div>';
    $$('[data-compact]').forEach(b=>b.addEventListener('click',()=>openCardById(b.dataset.compact)));
  }

  function openKeeper(){
    $('#keeperDrawer').classList.add('open'); $('#drawerBackdrop').classList.add('open'); $('#keeperDrawer').setAttribute('aria-hidden','false');
  }
  function closeKeeper(){
    $('#keeperDrawer').classList.remove('open'); $('#drawerBackdrop').classList.remove('open'); $('#keeperDrawer').setAttribute('aria-hidden','true');
  }

  function commandActions(q=''){
    const actions=[
      {kind:'action',label:'Открыть Контакты и переходы',sub:'Раздел',code:'01',run:()=>openSection('contacts')},
      {kind:'action',label:'Открыть Контент и вовлечение',sub:'Раздел',code:'02',run:()=>openSection('content')},
      {kind:'action',label:'Открыть Подарки, деньги и риски',sub:'Раздел',code:'03',run:()=>openSection('money')},
      {kind:'action',label:'Открыть исходники',sub:'Архив · 28 файлов',code:'04',run:()=>{renderSources();showView('sources')}},
      ...(window.CULT_BACKEND?.configured && !window.CULT_BACKEND.canEdit()?[]:[{kind:'action',label:'Редактор базы',sub:'Добавить или изменить карточки',code:'05',run:()=>showView('admin')}]),
      {kind:'action',label:'Показать избранное',sub:`${favorites.size} сохранено`,code:'★',run:()=>showFavorites()},
    ];
    const nq=normalize(q);
    const filteredActions=nq?actions.filter(a=>normalize(a.label+' '+a.sub).includes(nq)):actions;
    const cards=(q?searchItems(q,8):window.KNOWLEDGE.filter(i=>i.pinned && i.section!=='situations').slice(0,6)).map(item=>({kind:'card',label:item.title,sub:`${item.type||'Материал'} · ${item.useWhen||item.subtitle}`,code:statusLabel(item.status),run:()=>openDetail(item)}));
    return [...filteredActions,...cards].slice(0,12);
  }

  function renderCommand(q=''){
    commandItems=commandActions(q); commandIndex=Math.min(commandIndex,Math.max(0,commandItems.length-1));
    $('#commandResults').innerHTML=commandItems.length?commandItems.map((x,i)=>`<button class="${i===commandIndex?'active':''}" data-command-index="${i}"><span>${x.code}</span><div><b>${x.label}</b><small>${x.sub}</small></div><i>${x.kind==='card'?'OPEN':'RUN'}</i></button>`).join(''):'<div class="command-empty">Нет совпадений. Попробуй другой запрос.</div>';
    $$('[data-command-index]').forEach(b=>b.addEventListener('mousemove',()=>{commandIndex=+b.dataset.commandIndex;updateCommandActive()}));
    $$('[data-command-index]').forEach(b=>b.addEventListener('click',()=>runCommand(+b.dataset.commandIndex)));
  }
  function updateCommandActive(){ $$('[data-command-index]').forEach((b,i)=>b.classList.toggle('active',i===commandIndex)); }
  function runCommand(index=commandIndex){ const item=commandItems[index]; if(!item)return; $('#commandDialog').close(); item.run(); }
  function openCommand(initial=''){
    commandIndex=0; $('#commandInput').value=initial; renderCommand(initial); $('#commandDialog').showModal(); setTimeout(()=>$('#commandInput').focus(),20);
  }

  function showFavorites(){
    favoritesOnly=true; searchQuery=''; $('#globalSearch').value='';
    $('#sectionEyebrow').textContent='// FAVORITES'; $('#sectionTitle').textContent='Сохранённые карточки'; $('#sectionDescription').textContent='Карточки, которые отмечены звёздочкой.';
    renderCards(); showView('library');
  }

  function refreshKnowledgeUI(){
    const count=window.KNOWLEDGE.filter(i=>i.section!=='situations').length;
    const counter=$('#heroCardCount'); if(counter) counter.textContent=`DATABASE: ${count} CARDS`;
    renderDashboardLists();
    if($('#libraryView')?.classList.contains('active')) renderCards();
  }

  // Navigation
  $$('[data-section]').forEach(b=>b.addEventListener('click',()=>openSection(b.dataset.section)));
  $$('[data-view]').forEach(b=>b.addEventListener('click',()=>{const v=b.dataset.view;if(v==='sources'){renderSources();showView('sources')}else showView(v)}));
  $$('#scenarioChips button').forEach(b=>b.addEventListener('click',()=>{$('#globalSearch').value=b.dataset.query;globalSearch(b.dataset.query)}));
  $$('[data-goal]').forEach(b=>b.addEventListener('click',()=>{$('#globalSearch').value=b.dataset.goal;globalSearch(b.dataset.goal)}));
  $$('[data-view-goal]').forEach(b=>b.addEventListener('click',()=>{if(b.dataset.viewGoal==='sources'){renderSources();showView('sources')}}));

  // Search UX
  $('#globalSearch').addEventListener('input',e=>renderSuggestions(e.target.value));
  $('#globalSearch').addEventListener('keydown',e=>{
    if(e.key==='Enter'){hideSuggestions();globalSearch(e.target.value)}
    if(e.key==='Escape'){hideSuggestions();e.target.blur()}
  });
  $('#globalSearch').addEventListener('focus',e=>renderSuggestions(e.target.value));
  document.addEventListener('mousedown',e=>{if(!e.target.closest('.search-shell'))hideSuggestions()});

  // Filters and dialogs
  $('#favoritesBtn').addEventListener('click',showFavorites);
  $$('#filterPills button').forEach(b=>b.addEventListener('click',()=>{currentFilter=b.dataset.filter;$$('#filterPills button').forEach(x=>x.classList.toggle('active',x===b));renderCards()}));
  $('#dialogClose').addEventListener('click',()=>$('#detailDialog').close());
  $('#imageClose').addEventListener('click',()=>$('#imageDialog').close());
  $('#detailDialog').addEventListener('click',e=>{if(e.target===$('#detailDialog'))$('#detailDialog').close()});
  $('#imageDialog').addEventListener('click',e=>{if(e.target===$('#imageDialog'))$('#imageDialog').close()});
  $('#menuBtn').addEventListener('click',()=>$('#sidebar').classList.toggle('open'));

  // Keeper
  ['keeperOpen','heroKeeper','keeperHeroClick'].forEach(id=>{const el=$(`#${id}`);if(el)el.addEventListener('click',openKeeper)});
  $('#keeperClose').addEventListener('click',closeKeeper); $('#drawerBackdrop').addEventListener('click',closeKeeper);
  $$('[data-keeper-query]').forEach(b=>b.addEventListener('click',()=>{closeKeeper();const q=b.dataset.keeperQuery;$('#globalSearch').value=q;globalSearch(q)}));
  $$('[data-keeper-section]').forEach(b=>b.addEventListener('click',()=>{closeKeeper();if(b.dataset.keeperSection==='sources'){renderSources();showView('sources')}}));


  function refreshAccessUI(){
    const nav=$('.nav-item[data-view="admin"]');
    if(nav) nav.hidden=!!window.CULT_BACKEND?.configured && !window.CULT_BACKEND.canEdit();
  }

  // Dashboard
  $('#clearRecent')?.addEventListener('click',()=>{recent=[];saveRecent();renderDashboardLists()});

  // Command palette
  $('#commandBtn')?.addEventListener('click',()=>openCommand());
  $('#goalCommand')?.addEventListener('click',()=>openCommand());
  $('#commandInput')?.addEventListener('input',e=>{commandIndex=0;renderCommand(e.target.value)});
  $('#commandInput')?.addEventListener('keydown',e=>{
    if(e.key==='ArrowDown'){e.preventDefault();commandIndex=Math.min(commandIndex+1,commandItems.length-1);updateCommandActive()}
    if(e.key==='ArrowUp'){e.preventDefault();commandIndex=Math.max(commandIndex-1,0);updateCommandActive()}
    if(e.key==='Enter'){e.preventDefault();runCommand()}
  });
  $('#commandDialog')?.addEventListener('click',e=>{if(e.target===$('#commandDialog'))$('#commandDialog').close()});

  document.addEventListener('keydown',e=>{
    const typing=['INPUT','TEXTAREA'].includes(document.activeElement.tagName);
    if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();openCommand()}
    else if(e.key==='/'&&!typing){e.preventDefault();$('#globalSearch').focus()}
    else if(e.key==='Escape'){closeKeeper();$('#sidebar').classList.remove('open')}
  });

  window.addEventListener('knowledge-updated',refreshKnowledgeUI);
  window.addEventListener('cult-auth-changed',refreshAccessUI);
  window.addEventListener('cult-profile-changed',refreshAccessUI);
  refreshAccessUI();
  saveFavs(); renderSources(); renderDashboardLists(); refreshKnowledgeUI();
})();
