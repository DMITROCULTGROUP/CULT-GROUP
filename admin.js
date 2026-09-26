(() => {
  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];
  const store = window.KB_ADMIN_STORE;
  if (!store) return;

  let selectedId = null;
  let adminFilter = 'all';
  let adminQuery = '';
  let dirty = false;

  const statusLabel = s => s==='safe' ? 'ACTIVE' : s==='caution' ? 'ATTENTION' : 'RISK';
  const sectionLabel = s => ({contacts:'Контакты',content:'Контент',money:'Подарки и риски',situations:'Навигация'}[s] || s);
  const esc = v => String(v ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const today = () => new Date().toISOString().slice(0,10);

  function items(){ return store.getAll(); }
  function selected(){ return items().find(x=>x.id===selectedId) || null; }

  function renderList(){
    const all=items();
    const list=all.filter(item=>{
      if (adminFilter!=='all' && item.section!==adminFilter) return false;
      if (!adminQuery) return true;
      const hay=[item.id,item.title,item.subtitle,item.type,item.useWhen,...(item.tags||[])].join(' ').toLowerCase();
      return adminQuery.toLowerCase().split(/\s+/).every(t=>hay.includes(t));
    });
    $('#adminCount').textContent=`${all.length} CARDS`;
    const state=store.getState();
    const remote=store.getMode?.()==='remote';
    const changes=Object.keys(state.overrides||{}).length+(state.custom||[]).length+(state.deleted||[]).length;
    $('#adminLocalBadge').textContent=remote?'CLOUD SYNC':(changes?`LOCAL EDITS · ${changes}`:'LOCAL MODE');
    $('#adminLocalBadge').classList.toggle('has-changes',remote||!!changes);
    const cloudField=$('#adminCloudField'); if(cloudField) cloudField.textContent=remote?'ONLINE · AUTO SAVE':'LOCAL · EXPORT REQUIRED';
    $('#adminCardList').innerHTML=list.length?list.map(item=>{
      const isCustom=!store.isBase(item.id);
      const modified=!!state.overrides?.[item.id] || isCustom;
      return `<button class="admin-list-item ${selectedId===item.id?'active':''}" data-admin-id="${esc(item.id)}">
        <span class="admin-list-code">${esc(item.id)}</span>
        <div><b>${esc(item.title)}</b><small>${esc(sectionLabel(item.section))} · ${esc(item.type||'Материал')} · ${esc((item.publishState||'published').toUpperCase())}</small></div>
        <i class="admin-dot ${item.status}" title="${statusLabel(item.status)}"></i>
        ${modified?'<em>EDIT</em>':''}
      </button>`;
    }).join(''):'<div class="admin-list-empty">Ничего не найдено.</div>';
    $$('[data-admin-id]').forEach(b=>b.addEventListener('click',()=>openItem(b.dataset.adminId)));
  }

  function openItem(id){
    if (dirty && selectedId && id!==selectedId && !confirm('Есть несохранённые изменения. Перейти без сохранения?')) return;
    selectedId=id;
    const item=selected();
    if (!item) return;
    $('#adminEditorEmpty').hidden=true;
    $('#adminForm').hidden=false;
    fillForm(item);
    renderList();
  }

  function newItem(){
    if (dirty && selectedId && !confirm('Есть несохранённые изменения. Создать новую карточку без сохранения текущей?')) return;
    selectedId=null;
    $('#adminEditorEmpty').hidden=true;
    $('#adminForm').hidden=false;
    fillForm({id:'',section:'content',status:'safe',publishState:'published',type:'Материал',title:'',subtitle:'',summary:'',useWhen:'',tags:[],sources:[],updated:today(),pinned:false,bullets:[]},true);
    renderList();
    setTimeout(()=>$('#adminId').focus(),20);
  }

  function fillForm(item,isNew=false){
    const f=$('#adminForm');
    f.elements.id.value=item.id||'';
    f.elements.section.value=item.section||'content';
    f.elements.type.value=item.type||'Материал';
    f.elements.status.value=item.status||'safe';
    if(f.elements.publishState) f.elements.publishState.value=item.publishState||'published';
    f.elements.title.value=item.title||'';
    f.elements.subtitle.value=item.subtitle||'';
    f.elements.summary.value=item.summary||'';
    f.elements.useWhen.value=item.useWhen||'';
    f.elements.tags.value=(item.tags||[]).join(', ');
    f.elements.sources.value=(item.sources||[]).join(', ');
    f.elements.updated.value=item.updated||today();
    f.elements.pinned.checked=!!item.pinned;
    const details=item.steps||item.checklist||item.bullets||[];
    f.elements.details.value=details.join('\n');
    f.dataset.originalId=item.id||'';
    $('#adminFormMode').textContent=isNew?'// NEW CARD':'// EDIT CARD';
    $('#adminFormTitle').textContent=isNew?'Новая карточка':item.title;
    $('#adminDelete').disabled=isNew;
    $('#adminDuplicate').disabled=isNew;
    $('#adminResetItem').disabled=isNew || !store.isBase(item.id);
    setDirty(false);
    renderPreview();
  }

  function formData(){
    const f=$('#adminForm');
    const tags=f.elements.tags.value.split(',').map(x=>x.trim()).filter(Boolean);
    const sources=f.elements.sources.value.split(',').map(x=>parseInt(x.trim(),10)).filter(Number.isFinite);
    const details=f.elements.details.value.split('\n').map(x=>x.trim()).filter(Boolean);
    const item={
      id:f.elements.id.value,
      section:f.elements.section.value,
      type:f.elements.type.value,
      status:f.elements.status.value,
      publishState:f.elements.publishState?.value||'published',
      title:f.elements.title.value,
      subtitle:f.elements.subtitle.value,
      summary:f.elements.summary.value,
      useWhen:f.elements.useWhen.value,
      tags,sources,
      updated:f.elements.updated.value||today(),
      pinned:f.elements.pinned.checked,
      bullets:details
    };
    return store.normalizeItem(item);
  }

  function renderPreview(){
    const item=formData();
    $('#adminPreview').innerHTML=`<article class="knowledge-card admin-preview-card">
      <div class="card-top"><span class="badge ${esc(item.status)}">${statusLabel(item.status)}</span><span class="star">☆</span></div>
      <h3>${esc(item.title||'Название карточки')}</h3>
      <p>${esc(item.subtitle||'Короткий подзаголовок')}</p>
      <div class="card-meta"><span>${esc(item.type||'Материал')}</span><span>${esc(item.updated||today())}</span></div>
      ${item.useWhen?`<div class="use-when"><b>Когда:</b> ${esc(item.useWhen)}</div>`:''}
      <div class="tag-row">${(item.tags||[]).slice(0,4).map(t=>`<span class="tag">${esc(t)}</span>`).join('')}</div>
    </article>`;
  }

  function setDirty(value){
    dirty=value;
    $('#adminDirtyState').textContent=value?'Есть несохранённые изменения':'Нет несохранённых изменений';
    $('#adminDirtyState').classList.toggle('dirty',value);
  }

  function save(e){
    e.preventDefault();
    const f=$('#adminForm');
    const previous=f.dataset.originalId||null;
    const item=formData();
    if (!item.id || !item.title){ alert('Заполни ID и название.'); return; }
    if (!/^[a-z0-9а-яё_-]+$/i.test(item.id)){ alert('ID может содержать буквы, цифры, дефис и подчёркивание.'); return; }
    if ((!previous || previous!==item.id) && store.exists(item.id)){ alert('Карточка с таким ID уже существует.'); return; }
    try {
      const saved=store.saveItem(item,previous);
      selectedId=saved.id;
      f.dataset.originalId=saved.id;
      $('#adminFormTitle').textContent=saved.title;
      $('#adminDelete').disabled=false;
      $('#adminDuplicate').disabled=false;
      $('#adminResetItem').disabled=!store.isBase(saved.id);
      setDirty(false); renderList(); renderPreview();
      flash('Карточка сохранена локально');
    } catch(err){ alert(err.message||'Не удалось сохранить карточку'); }
  }

  function duplicate(){
    const item=formData();
    item.id=`${item.id||'card'}-copy`;
    item.title=`${item.title||'Карточка'} — копия`;
    selectedId=null;
    fillForm(item,true);
    $('#adminId').focus();
    setDirty(true);
  }

  function remove(){
    const id=$('#adminForm').dataset.originalId;
    if (!id) return;
    const item=items().find(x=>x.id===id);
    if (!confirm(`Удалить карточку «${item?.title||id}» из локальной версии базы?`)) return;
    store.removeItem(id);
    selectedId=null; dirty=false;
    $('#adminForm').hidden=true; $('#adminEditorEmpty').hidden=false;
    renderList(); flash('Карточка удалена из локальной версии');
  }

  function resetItem(){
    const id=$('#adminForm').dataset.originalId;
    if (!id || !store.isBase(id)) return;
    if (!confirm('Вернуть эту карточку к исходной версии из knowledge.js?')) return;
    store.resetItem(id); selectedId=id; fillForm(items().find(x=>x.id===id)); renderList(); flash('Исходная версия восстановлена');
  }

  function resetAll(){
    if (!confirm('Сбросить ВСЕ локальные правки, новые карточки и удаления? Это действие нельзя отменить без экспортированного бэкапа.')) return;
    try{store.resetAll();}catch(e){flash(e.message||'Сброс недоступен');return;} selectedId=null; dirty=false;
    $('#adminForm').hidden=true; $('#adminEditorEmpty').hidden=false;
    renderList(); flash('Все локальные изменения сброшены');
  }

  function download(name,text,type='application/json'){
    const blob=new Blob([text],{type});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a'); a.href=url; a.download=name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),500);
  }

  function exportJson(){
    const payload={version:1,exportedAt:new Date().toISOString(),knowledge:store.exportKnowledge(),sourceImages:window.SOURCE_IMAGES,searchSynonyms:window.SEARCH_SYNONYMS};
    download(`cult-group-knowledge-${today()}.json`,JSON.stringify(payload,null,2));
    flash('JSON экспортирован');
  }

  function exportJs(){
    const data=store.exportKnowledge();
    const text=`window.KNOWLEDGE = ${JSON.stringify(data,null,2)};\n\nwindow.SOURCE_IMAGES = ${JSON.stringify(window.SOURCE_IMAGES,null,2)};\n\nwindow.CARD_META = {};\n\nwindow.SEARCH_SYNONYMS = ${JSON.stringify(window.SEARCH_SYNONYMS,null,2)};\n`;
    download('knowledge.js',text,'text/javascript');
    flash('knowledge.js готов для замены в репозитории');
  }

  async function importJson(file){
    if (!file) return;
    try {
      const raw=JSON.parse(await file.text());
      const knowledge=Array.isArray(raw)?raw:raw.knowledge;
      if (!Array.isArray(knowledge)) throw new Error('В файле нет массива knowledge');
      if (!confirm(`Импортировать ${knowledge.length} карточек? Текущие локальные изменения будут заменены.`)) return;
      store.importKnowledge(knowledge);
      selectedId=null; dirty=false; $('#adminForm').hidden=true; $('#adminEditorEmpty').hidden=false;
      renderList(); flash('База импортирована локально');
    } catch(err){ alert(`Ошибка импорта: ${err.message}`); }
    $('#adminImportInput').value='';
  }

  function flash(message){
    let el=$('#adminToast');
    if(!el){ el=document.createElement('div'); el.id='adminToast'; el.className='admin-toast'; document.body.appendChild(el); }
    el.textContent=message; el.classList.add('show');
    clearTimeout(el._t); el._t=setTimeout(()=>el.classList.remove('show'),2200);
  }

  async function openHistory(){
    const item=selected(); if(!item)return;
    const dialog=$('#historyDialog'),list=$('#historyList');
    if(!window.CULT_BACKEND?.configured||store.getMode?.()!=='remote'){list.innerHTML='<div class="history-empty">История доступна после подключения Supabase.</div>';dialog.showModal();return;}
    list.innerHTML='<div class="history-empty">Загрузка…</div>';dialog.showModal();
    try{
      const rows=await window.CULT_BACKEND.loadHistory(item.id);
      list.innerHTML=rows.length?rows.map((r,i)=>`<div class="history-item"><div><b>${esc((r.action||'UPDATE').toUpperCase())}</b><span>${esc(new Date(r.changed_at).toLocaleString('ru-RU'))}</span></div>${r.snapshot?`<button data-history-index="${i}">Восстановить</button>`:''}</div>`).join(''):'<div class="history-empty">Истории пока нет.</div>';
      list.querySelectorAll('[data-history-index]').forEach(btn=>btn.addEventListener('click',()=>{const row=rows[+btn.dataset.historyIndex];if(!row?.snapshot)return;const restored=window.CULT_BACKEND.snapshotToItem(row.snapshot);fillForm(store.normalizeItem(restored));dialog.close();flash('Версия загружена в редактор. Нажми «Сохранить», чтобы восстановить её.')}));
    }catch(e){list.innerHTML=`<div class="history-empty">${esc(e.message)}</div>`;}
  }

  function init(){
  $('#adminNew')?.addEventListener('click',newItem);
    $('#adminForm')?.addEventListener('submit',save);
    $('#adminForm')?.addEventListener('input',()=>{setDirty(true);renderPreview()});
    $('#adminHistory')?.addEventListener('click',openHistory);
    $('#adminDuplicate')?.addEventListener('click',duplicate);
    $('#adminDelete')?.addEventListener('click',remove);
    $('#adminResetItem')?.addEventListener('click',resetItem);
    $('#adminResetAll')?.addEventListener('click',resetAll);
    $('#historyClose')?.addEventListener('click',()=>$('#historyDialog').close());
    $('#historyDialog')?.addEventListener('click',e=>{if(e.target===$('#historyDialog'))$('#historyDialog').close()});
    $('#adminExportJson')?.addEventListener('click',exportJson);
    $('#adminExportJs')?.addEventListener('click',exportJs);
    $('#adminImportInput')?.addEventListener('change',e=>importJson(e.target.files?.[0]));
    $('#adminSearch')?.addEventListener('input',e=>{adminQuery=e.target.value.trim();renderList()});
    $$('[data-admin-filter]').forEach(b=>b.addEventListener('click',()=>{adminFilter=b.dataset.adminFilter;$$('[data-admin-filter]').forEach(x=>x.classList.toggle('active',x===b));renderList()}));
    document.querySelector('[data-view="admin"]')?.addEventListener('click',()=>setTimeout(renderList,0));
    window.addEventListener('knowledge-updated',()=>renderList());
    window.addEventListener('cult-store-mode',()=>renderList());
    window.addEventListener('cult-cloud-sync',()=>renderList());
    renderList();
  }

  init();
})();
