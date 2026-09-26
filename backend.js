(() => {
  const cfg = window.CULT_CONFIG || {};
  const configured = /^https:\/\/.+\.supabase\.co$/i.test(cfg.supabaseUrl || '') &&
    cfg.supabaseAnonKey && !String(cfg.supabaseAnonKey).includes('PASTE_') && !!window.supabase;
  const client = configured ? window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  }) : null;

  let session = null;
  let profile = null;
  let channel = null;

  const emit = (name, detail={}) => window.dispatchEvent(new CustomEvent(name,{detail}));
  const role = () => profile?.role || 'viewer';
  const canEdit = () => ['editor','admin'].includes(role());
  const isAdmin = () => role() === 'admin';

  function rowToItem(r){
    return {
      id:r.id, section:r.section, status:r.status, type:r.type || 'Материал',
      title:r.title || '', subtitle:r.subtitle || '', summary:r.summary || '',
      useWhen:r.use_when || '', tags:Array.isArray(r.tags)?r.tags:[],
      sources:Array.isArray(r.sources)?r.sources:[], updated:r.updated_date || new Date().toISOString().slice(0,10),
      pinned:!!r.pinned, publishState:r.publish_state || 'published',
      [r.detail_kind || 'bullets']:Array.isArray(r.details)?r.details:[]
    };
  }
  function itemToRow(i){
    const kind = Array.isArray(i.steps) ? 'steps' : Array.isArray(i.checklist) ? 'checklist' : 'bullets';
    const details = i[kind] || [];
    return {
      id:i.id, section:i.section, status:i.status, type:i.type || 'Материал', title:i.title || '',
      subtitle:i.subtitle || '', summary:i.summary || '', use_when:i.useWhen || '', tags:i.tags || [],
      sources:i.sources || [], updated_date:i.updated || new Date().toISOString().slice(0,10), pinned:!!i.pinned,
      details, detail_kind:kind, publish_state:i.publishState || 'published', updated_by:session?.user?.id || null
    };
  }

  async function loadProfile(){
    if (!client || !session?.user) { profile=null; return null; }
    const {data,error}=await client.from('profiles').select('id,email,display_name,role,created_at').eq('id',session.user.id).maybeSingle();
    if (error) throw error;
    profile=data || {id:session.user.id,email:session.user.email,display_name:'',role:'viewer'};
    emit('cult-profile-changed',{profile});
    return profile;
  }

  async function init(){
    if (!configured) { emit('cult-backend-ready',{configured:false}); return; }
    const {data:{session:s}} = await client.auth.getSession();
    session=s;
    if(session) await loadProfile();
    emit('cult-auth-changed',{session,profile,configured:true});
    emit('cult-backend-ready',{configured:true,session,profile});
    client.auth.onAuthStateChange(async (event,s2)=>{
      session=s2;
      profile=null;
      if(session) { try{await loadProfile();}catch(e){console.error(e);} }
      emit('cult-auth-changed',{session,profile,configured:true,event});
    });
  }

  async function signIn(email,password){
    if(!client) throw new Error('Supabase ещё не настроен.');
    const {data,error}=await client.auth.signInWithPassword({email,password});
    if(error) throw error;
    session=data.session;
    await loadProfile();
    return {session,profile};
  }
  async function signOut(){ if(client) await client.auth.signOut(); session=null; profile=null; }
  async function updatePassword(password){
    if(!client) throw new Error('Supabase ещё не настроен.');
    const {error}=await client.auth.updateUser({password});
    if(error) throw error;
  }
  async function resetPassword(email){
    if(!client) throw new Error('Supabase ещё не настроен.');
    const redirectTo = window.location.origin + window.location.pathname;
    const {error}=await client.auth.resetPasswordForEmail(email,{redirectTo});
    if(error) throw error;
  }

  async function loadCards(){
    if(!client || !session) return [];
    const {data,error}=await client.from('knowledge_cards').select('*').order('updated_at',{ascending:false});
    if(error) throw error;
    return (data||[]).map(rowToItem);
  }
  async function upsertCard(item){
    if(!client || !canEdit()) throw new Error('Недостаточно прав для редактирования.');
    const {data,error}=await client.from('knowledge_cards').upsert(itemToRow(item),{onConflict:'id'}).select().single();
    if(error) throw error;
    return rowToItem(data);
  }
  async function deleteCard(id){
    if(!client || !canEdit()) throw new Error('Недостаточно прав для удаления.');
    const {error}=await client.from('knowledge_cards').delete().eq('id',id);
    if(error) throw error;
  }
  async function bulkUpsert(items){
    if(!client || !canEdit()) throw new Error('Недостаточно прав.');
    const rows=items.map(itemToRow);
    const {error}=await client.from('knowledge_cards').upsert(rows,{onConflict:'id'});
    if(error) throw error;
  }
  async function loadHistory(cardId){
    if(!client || !canEdit()) return [];
    const {data,error}=await client.from('knowledge_history').select('id,card_id,action,snapshot,changed_at,changed_by').eq('card_id',cardId).order('changed_at',{ascending:false}).limit(30);
    if(error) throw error;
    return data||[];
  }
  async function listProfiles(){
    if(!client || !isAdmin()) return [];
    const {data,error}=await client.from('profiles').select('id,email,display_name,role,created_at').order('created_at',{ascending:true});
    if(error) throw error;
    return data||[];
  }
  async function updateRole(userId,newRole){
    if(!client || !isAdmin()) throw new Error('Только Admin может менять роли.');
    const {error}=await client.from('profiles').update({role:newRole}).eq('id',userId);
    if(error) throw error;
  }
  async function inviteUser(email,roleName='viewer'){
    if(!client || !isAdmin()) throw new Error('Только Admin может приглашать пользователей.');
    const {data,error}=await client.functions.invoke('invite-user',{body:{email,role:roleName}});
    if(error) throw error;
    return data;
  }
  function subscribeCards(cb){
    if(!client || !session) return ()=>{};
    if(channel) client.removeChannel(channel);
    channel=client.channel('cult-knowledge-live').on('postgres_changes',{event:'*',schema:'public',table:'knowledge_cards'},payload=>cb?.(payload)).subscribe();
    return ()=>{ if(channel){client.removeChannel(channel);channel=null;} };
  }

  window.CULT_BACKEND={configured,client,init,signIn,signOut,resetPassword,updatePassword,getSession:()=>session,getProfile:()=>profile,role,canEdit,isAdmin,loadCards,upsertCard,deleteCard,bulkUpsert,loadHistory,listProfiles,updateRole,inviteUser,subscribeCards,snapshotToItem:rowToItem};
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',init,{once:true}); else init();
})();
