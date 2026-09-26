(() => {
  const KEY = 'cultgroup-kb-admin-v2';
  const SCHEMA_VERSION = 2;
  const clone = v => JSON.parse(JSON.stringify(v));
  const cleanText = v => String(v ?? '').replace(/[<>]/g,'').trim();
  const base = (window.KNOWLEDGE || []).map(x=>normalizeItem({...x,publishState:x.publishState||'published'}));
  window.BASE_KNOWLEDGE = clone(base);

  let mode = 'local';
  let current = [];
  let remoteReady = false;
  let unsub = null;

  const emptyLocal = () => ({ version: SCHEMA_VERSION, overrides: {}, custom: [], deleted: [], updatedAt: null });
  function loadLocal(){
    try {
      const raw = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (!raw || typeof raw !== 'object') return emptyLocal();
      return { ...emptyLocal(), ...raw, overrides:raw.overrides||{}, custom:Array.isArray(raw.custom)?raw.custom:[], deleted:Array.isArray(raw.deleted)?raw.deleted:[] };
    } catch { return emptyLocal(); }
  }
  let state=loadLocal();

  function normalizeItem(item){
    const now=new Date().toISOString().slice(0,10);
    const copy=clone(item||{});
    copy.id=String(copy.id||'').trim().toLowerCase().replace(/[^a-z0-9а-яё_-]+/gi,'-').replace(/^-+|-+$/g,'');
    copy.section=['contacts','content','money','situations'].includes(copy.section)?copy.section:'content';
    copy.status=['safe','caution','blocked'].includes(copy.status)?copy.status:'safe';
    copy.publishState=['published','draft','archived'].includes(copy.publishState)?copy.publishState:'published';
    copy.title=cleanText(copy.title); copy.subtitle=cleanText(copy.subtitle); copy.summary=cleanText(copy.summary);
    copy.type=cleanText(copy.type||'Материал'); copy.useWhen=cleanText(copy.useWhen);
    copy.updated=/^\d{4}-\d{2}-\d{2}$/.test(copy.updated||'')?copy.updated:now;
    copy.tags=Array.isArray(copy.tags)?copy.tags.map(cleanText).filter(Boolean):[];
    copy.sources=Array.isArray(copy.sources)?copy.sources.map(Number).filter(n=>Number.isInteger(n)&&n>0&&n<=99):[];
    copy.pinned=!!copy.pinned;
    ['bullets','checklist','steps'].forEach(k=>{if(copy[k]&&!Array.isArray(copy[k]))delete copy[k];else if(Array.isArray(copy[k]))copy[k]=copy[k].map(cleanText).filter(Boolean)});
    return copy;
  }

  function publishToWindow(notify=true){
    window.KNOWLEDGE=current.filter(x=>x.publishState==='published');
    if(notify) window.dispatchEvent(new CustomEvent('knowledge-updated',{detail:{mode,count:window.KNOWLEDGE.length,total:current.length}}));
  }
  function rebuildLocal(notify=true){
    const deleted=new Set(state.deleted);
    const merged=base.filter(x=>!deleted.has(x.id)).map(x=>state.overrides[x.id]?normalizeItem({...x,...state.overrides[x.id]}):clone(x));
    for(const item of state.custom){
      const n=normalizeItem(item); if(!n.id||deleted.has(n.id))continue;
      const idx=merged.findIndex(x=>x.id===n.id); if(idx>=0)merged[idx]=n;else merged.push(n);
    }
    current=merged; publishToWindow(notify); return merged;
  }
  function persistLocal(){state.updatedAt=new Date().toISOString();localStorage.setItem(KEY,JSON.stringify(state));rebuildLocal();}
  function isBase(id){return base.some(x=>x.id===id)}
  function exists(id){return current.some(x=>x.id===id)}
  const emitSync=(status,message='')=>window.dispatchEvent(new CustomEvent('cult-cloud-sync',{detail:{status,message,mode}}));

  async function refreshRemote(){
    if(!window.CULT_BACKEND?.configured||!window.CULT_BACKEND.getSession()) return;
    try{
      emitSync('loading');
      const rows=await window.CULT_BACKEND.loadCards();
      current=(rows.length?rows:base).map(normalizeItem);
      remoteReady=true; mode='remote'; publishToWindow();
      emitSync('ready',rows.length?'Синхронизировано':'База пуста — показан стартовый набор');
    }catch(e){console.error(e);emitSync('error',e.message);}
  }

  async function activateRemote(){
    if(!window.CULT_BACKEND?.configured||!window.CULT_BACKEND.getSession()) return;
    mode='remote';
    await refreshRemote();
    if(unsub)unsub();
    unsub=window.CULT_BACKEND.subscribeCards(()=>refreshRemote());
    window.dispatchEvent(new CustomEvent('cult-store-mode',{detail:{mode,role:window.CULT_BACKEND.role()}}));
  }
  function deactivateRemote(){
    if(unsub){unsub();unsub=null;}
    mode='local';remoteReady=false;rebuildLocal();
    window.dispatchEvent(new CustomEvent('cult-store-mode',{detail:{mode}}));
  }

  function optimisticUpsert(n,previousId){
    if(previousId&&previousId!==n.id) current=current.filter(x=>x.id!==previousId);
    const idx=current.findIndex(x=>x.id===n.id); if(idx>=0)current[idx]=n;else current.push(n); publishToWindow();
  }
  function saveItem(item,previousId){
    const n=normalizeItem(item); if(!n.id)throw new Error('ID обязателен'); if(!n.title)throw new Error('Название обязательно');
    if(mode==='remote'){
      if(!window.CULT_BACKEND.canEdit()) throw new Error('Недостаточно прав для редактирования.');
      const before=clone(current); optimisticUpsert(n,previousId); emitSync('saving');
      (async()=>{try{if(previousId&&previousId!==n.id)await window.CULT_BACKEND.deleteCard(previousId);await window.CULT_BACKEND.upsertCard(n);emitSync('saved','Изменения сохранены в облаке');}catch(e){current=before;publishToWindow();emitSync('error',e.message);alert('Ошибка сохранения: '+e.message);}})();
      return n;
    }
    if(previousId&&previousId!==n.id)removeItem(previousId,false);
    state.deleted=state.deleted.filter(id=>id!==n.id);
    if(isBase(n.id))state.overrides[n.id]=n;else{const idx=state.custom.findIndex(x=>x.id===n.id);if(idx>=0)state.custom[idx]=n;else state.custom.push(n)}
    persistLocal();return n;
  }
  function removeItem(id,shouldPersist=true){
    if(mode==='remote'){
      if(!window.CULT_BACKEND.canEdit()) throw new Error('Недостаточно прав для удаления.');
      const before=clone(current); current=current.filter(x=>x.id!==id);publishToWindow();emitSync('saving');
      window.CULT_BACKEND.deleteCard(id).then(()=>emitSync('saved','Удалено')).catch(e=>{current=before;publishToWindow();emitSync('error',e.message);alert('Ошибка удаления: '+e.message)});return;
    }
    if(isBase(id)){if(!state.deleted.includes(id))state.deleted.push(id);delete state.overrides[id]}else state.custom=state.custom.filter(x=>x.id!==id);
    if(shouldPersist)persistLocal();
  }
  function resetItem(id){
    if(mode==='remote'){
      const original=base.find(x=>x.id===id); if(!original)throw new Error('Для этой карточки нет исходной версии.');
      return saveItem(original,id);
    }
    delete state.overrides[id];state.deleted=state.deleted.filter(x=>x!==id);state.custom=state.custom.filter(x=>x.id!==id);persistLocal();
  }
  function resetAll(){
    if(mode==='remote') throw new Error('В облачном режиме общий сброс отключён. Используй историю или редактирование отдельных карточек.');
    state=emptyLocal();localStorage.removeItem(KEY);rebuildLocal();
  }
  function exportState(){return clone(state)}
  function exportKnowledge(){return clone(current)}
  function importKnowledge(items){
    if(!Array.isArray(items))throw new Error('Ожидался массив карточек');
    const ids=new Set();const clean=items.map(normalizeItem).filter(item=>{if(!item.id||!item.title||ids.has(item.id))return false;ids.add(item.id);return true});
    if(mode==='remote'){
      if(!window.CULT_BACKEND.canEdit())throw new Error('Недостаточно прав.');
      window.CULT_BACKEND.bulkUpsert(clean).then(refreshRemote).catch(e=>alert('Ошибка импорта: '+e.message));return;
    }
    state=emptyLocal();const baseIds=new Set(base.map(x=>x.id)),incomingIds=new Set(clean.map(x=>x.id));state.deleted=base.filter(x=>!incomingIds.has(x.id)).map(x=>x.id);
    clean.forEach(item=>{if(baseIds.has(item.id))state.overrides[item.id]=item;else state.custom.push(item)});persistLocal();
  }

  rebuildLocal(false);
  window.addEventListener('cult-auth-changed',e=>{if(e.detail?.session)activateRemote();else deactivateRemote()});
  if(window.CULT_BACKEND?.configured&&window.CULT_BACKEND.getSession()) activateRemote();

  window.KB_ADMIN_STORE={key:KEY,getMode:()=>mode,isRemoteReady:()=>remoteReady,getState:()=>clone(state),getAll:()=>clone(current),saveItem,removeItem,resetItem,resetAll,exportState,exportKnowledge,importKnowledge,exists,isBase,normalizeItem,refreshRemote,activateRemote,deactivateRemote};
})();
