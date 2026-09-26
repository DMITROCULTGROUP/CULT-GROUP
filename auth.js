(() => {
  const $=s=>document.querySelector(s);
  const esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const backend=window.CULT_BACKEND;
  if(!backend) return;

  const gate=$('#authGate'), form=$('#authForm'), err=$('#authError');
  const accountBtn=$('#accountBtn'), accountDialog=$('#accountDialog');
  let profile=null;

  function initials(email='',name=''){
    const src=(name||email.split('@')[0]||'CG').trim();
    const parts=src.split(/[\s._-]+/).filter(Boolean);
    return ((parts[0]?.[0]||'C')+(parts[1]?.[0]||parts[0]?.[1]||'G')).toUpperCase();
  }
  function setCloud(text,state='ready'){
    const el=$('#cloudStatus'); if(!el)return; el.querySelector('b').textContent=text; el.dataset.state=state;
  }
  function applyProfile(p){
    profile=p||backend.getProfile();
    const configured=backend.configured;
    const session=backend.getSession();
    if(!configured){gate.hidden=true;accountBtn.hidden=true;setCloud('LOCAL','local');return;}
    if(!session){gate.hidden=false;accountBtn.hidden=true;document.body.classList.add('auth-locked');setCloud('LOCKED','error');return;}
    gate.hidden=true;document.body.classList.remove('auth-locked');accountBtn.hidden=false;
    const email=session.user.email||''; const name=profile?.display_name||''; const role=(profile?.role||'viewer').toUpperCase();
    $('#accountInitials').textContent=initials(email,name); $('#accountRole').textContent=role;
    $('#accountName').textContent=name||'CULT USER'; $('#accountEmail').textContent=email; $('#accountRoleLong').textContent=role;
    setCloud('CLOUD','ready');
    document.body.dataset.role=(profile?.role||'viewer');
    const adminNav=document.querySelector('.nav-item[data-view="admin"]'); if(adminNav) adminNav.hidden=!backend.canEdit();
    const team=$('#teamAdminPanel'); if(team){team.hidden=!backend.isAdmin();if(backend.isAdmin())loadTeam();}
    const reset=$('#adminResetAll'); if(reset && configured) reset.hidden=true;
    const note=$('#adminCloudNote'); if(note)note.textContent='Изменения сохраняются в Supabase и становятся доступны всей команде. Экспорт остаётся резервной копией.';
  }

  async function login(e){
    e.preventDefault(); err.textContent='';
    const email=$('#authEmail').value.trim(),password=$('#authPassword').value;
    const btn=form.querySelector('button[type="submit"]');btn.disabled=true;btn.textContent='CONNECTING…';
    try{const r=await backend.signIn(email,password);applyProfile(r.profile);}
    catch(e2){err.textContent=e2.message||'Не удалось войти.';}
    finally{btn.disabled=false;btn.textContent='ENTER SYSTEM';}
  }
  async function forgot(){
    const email=$('#authEmail').value.trim();if(!email){err.textContent='Сначала введи email.';return;}
    try{await backend.resetPassword(email);err.textContent='Ссылка для восстановления отправлена на email.';err.classList.add('ok');}
    catch(e){err.textContent=e.message;err.classList.remove('ok');}
  }
  async function logout(){await backend.signOut();accountDialog?.close();}

  async function saveRecoveredPassword(e){
    e.preventDefault();const out=$('#recoveryError');out.textContent='';const password=$('#recoveryPassword').value;
    try{await backend.updatePassword(password);out.textContent='Пароль обновлён.';out.classList.add('ok');setTimeout(()=>$('#recoveryDialog')?.close(),800)}catch(er){out.textContent=er.message;out.classList.remove('ok')}
  }

  async function loadTeam(){
    if(!backend.isAdmin())return;
    const wrap=$('#teamUsers');if(!wrap)return;wrap.innerHTML='<div class="team-loading">Загрузка пользователей…</div>';
    try{
      const users=await backend.listProfiles();
      wrap.innerHTML=users.length?users.map(u=>`<div class="team-user" data-user-id="${esc(u.id)}"><div class="team-avatar">${esc(initials(u.email,u.display_name))}</div><div class="team-person"><b>${esc(u.display_name||u.email)}</b><small>${esc(u.email||'')}</small></div><select data-role-select><option value="viewer" ${u.role==='viewer'?'selected':''}>Viewer</option><option value="editor" ${u.role==='editor'?'selected':''}>Editor</option><option value="admin" ${u.role==='admin'?'selected':''}>Admin</option></select></div>`).join(''):'<div class="team-loading">Пользователей пока нет.</div>';
      wrap.querySelectorAll('[data-role-select]').forEach(sel=>sel.addEventListener('change',async()=>{const row=sel.closest('[data-user-id]');sel.disabled=true;try{await backend.updateRole(row.dataset.userId,sel.value);await loadTeam()}catch(e){alert(e.message);await loadTeam()}}));
    }catch(e){wrap.innerHTML=`<div class="team-loading error">${esc(e.message)}</div>`;}
  }
  async function invite(){
    const email=$('#inviteEmail').value.trim(),role=$('#inviteRole').value;if(!email)return;
    const btn=$('#inviteUser');btn.disabled=true;
    try{await backend.inviteUser(email,role);$('#inviteEmail').value='';alert('Приглашение отправлено.');setTimeout(loadTeam,700)}catch(e){alert('Не удалось пригласить: '+e.message+'\n\nПроверь, что Edge Function invite-user настроена.')}
    finally{btn.disabled=false;}
  }
  async function seed(){
    if(!backend.isAdmin())return;
    if(!confirm('Загрузить текущую стартовую базу в Supabase? Существующие карточки с теми же ID будут обновлены.'))return;
    const btn=$('#seedCloud');btn.disabled=true;btn.textContent='UPLOADING…';
    try{await backend.bulkUpsert(window.BASE_KNOWLEDGE||window.KNOWLEDGE||[]);await window.KB_ADMIN_STORE?.refreshRemote();alert('Стартовая база загружена в облако.');}
    catch(e){alert('Ошибка загрузки: '+e.message)}finally{btn.disabled=false;btn.textContent='⇧ Загрузить стартовую базу'}
  }

  form?.addEventListener('submit',login);$('#forgotPassword')?.addEventListener('click',forgot);
  accountBtn?.addEventListener('click',()=>accountDialog?.showModal());$('#accountClose')?.addEventListener('click',()=>accountDialog?.close());$('#logoutBtn')?.addEventListener('click',logout);
  $('#recoveryForm')?.addEventListener('submit',saveRecoveredPassword);$('#recoveryClose')?.addEventListener('click',()=>$('#recoveryDialog')?.close());
  accountDialog?.addEventListener('click',e=>{if(e.target===accountDialog)accountDialog.close()});
  $('#refreshTeam')?.addEventListener('click',loadTeam);$('#inviteUser')?.addEventListener('click',invite);$('#seedCloud')?.addEventListener('click',seed);

  window.addEventListener('cult-auth-changed',e=>{applyProfile(e.detail?.profile);if(e.detail?.event==='PASSWORD_RECOVERY')$('#recoveryDialog')?.showModal();});
  window.addEventListener('cult-profile-changed',e=>applyProfile(e.detail?.profile));
  window.addEventListener('cult-cloud-sync',e=>{const d=e.detail||{};if(d.mode!=='remote')return;if(d.status==='saving'||d.status==='loading')setCloud('SYNCING','syncing');else if(d.status==='error')setCloud('ERROR','error');else setCloud('CLOUD','ready')});
  window.addEventListener('cult-backend-ready',()=>applyProfile());
  if(!backend.configured)applyProfile();
})();
