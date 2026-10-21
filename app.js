const config = window.APP_CONFIG || {};
const configured = Boolean(config.supabaseUrl && config.supabaseAnonKey && window.supabase);
const db = configured ? window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey, { auth: { persistSession: true, autoRefreshToken: true } }) : null;
const els = {
  list: document.querySelector('#assessmentList'), empty: document.querySelector('#emptyState'), filters: document.querySelector('#filters'),
  authButton: document.querySelector('#authButton'), authDialog: document.querySelector('#authDialog'), authForm: document.querySelector('#authForm'), authMessage: document.querySelector('#authMessage'),
  previewLogin: document.querySelector('#previewLogin'), previewButton: document.querySelector('#previewButton'), addButton: document.querySelector('#addButton'), editor: document.querySelector('#assessmentDialog'), form: document.querySelector('#assessmentForm'),
  toast: document.querySelector('#toast'), connection: document.querySelector('#connectionStatus'), result: document.querySelector('#resultLabel')
};
let items = [];
let subjectFilter = '전체';
let isAdmin = false;
let userId = null;

function escapeHTML(value = '') { return String(value).replace(/[&<>"']/g, ch => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[ch]); }
function formatDate(value) { if (!value) return '날짜 미정'; const d = new Date(`${value}T00:00:00`); return new Intl.DateTimeFormat('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' }).format(d); }
function daysUntil(value) { const a = new Date(); a.setHours(0,0,0,0); const b = new Date(`${value}T00:00:00`); return Math.round((b-a)/86400000); }
function dateBadge(value) { const days = daysUntil(value); if (days < 0) return '지난 일정'; if (days === 0) return '오늘'; if (days === 1) return '내일'; return `D-${days}`; }
function setStatus(mode, label) { els.connection.className = `connection-status ${mode}`; els.connection.querySelector('span').textContent = label; }
function toast(message) { els.toast.textContent = message; els.toast.classList.add('show'); window.setTimeout(() => els.toast.classList.remove('show'), 3000); }
function updateAdminUI() { els.authButton.textContent = isAdmin ? '관리자 로그아웃' : '관리자 로그인'; els.addButton.hidden = !isAdmin; document.body.classList.toggle('admin-mode', isAdmin); }

function render() {
  const filtered = items.filter(item => subjectFilter === '전체' || item.subject === subjectFilter).sort((a,b) => String(a.assessment_date).localeCompare(String(b.assessment_date)));
  els.result.textContent = `${filtered.length}개 일정`;
  els.empty.hidden = filtered.length > 0;
  els.list.innerHTML = filtered.map(item => {
    const adminActions = isAdmin ? `<div class="card-actions"><button class="icon-button edit-button" data-id="${escapeHTML(item.id)}" aria-label="${escapeHTML(item.title)} 수정" type="button">✎<span>수정</span></button><button class="icon-button delete-button" data-id="${escapeHTML(item.id)}" aria-label="${escapeHTML(item.title)} 삭제" type="button">⌫<span>삭제</span></button></div>` : '';
    const supplies = item.supplies?.trim() ? escapeHTML(item.supplies) : '준비물 안내 없음';
    return `<article class="assessment-card"><div class="card-date"><span class="date-month">${escapeHTML(new Intl.DateTimeFormat('ko-KR',{month:'short'}).format(new Date(`${item.assessment_date}T00:00:00`)))}</span><strong>${escapeHTML(new Intl.DateTimeFormat('ko-KR',{day:'2-digit'}).format(new Date(`${item.assessment_date}T00:00:00`)))}</strong><span>${escapeHTML(new Intl.DateTimeFormat('ko-KR',{weekday:'short'}).format(new Date(`${item.assessment_date}T00:00:00`)))}</span></div><div class="card-main"><div class="card-meta"><span class="subject-tag subject-${escapeHTML(item.subject)}">${escapeHTML(item.subject)}</span><span class="date-label">${escapeHTML(formatDate(item.assessment_date))}</span><span class="countdown">${escapeHTML(dateBadge(item.assessment_date))}</span></div><h3>${escapeHTML(item.title)}</h3><p class="assessment-description">${escapeHTML(item.description)}</p><div class="supplies"><span class="supplies-icon">✓</span><span><b>준비물</b>${supplies}</span></div>${item.class_name ? `<span class="class-name">${escapeHTML(item.class_name)}</span>` : ''}</div>${adminActions}</article>`;
  }).join('');
  const next = items.filter(item => daysUntil(item.assessment_date) >= 0).sort((a,b)=>String(a.assessment_date).localeCompare(String(b.assessment_date)))[0];
  document.querySelector('#updatedLabel').textContent = next ? `다음 일정 ${formatDate(next.assessment_date)}` : '등록된 일정이 없습니다.';
}

async function loadAssessments() {
  if (!db) { items = loadLocalItems(); setStatus('offline', '미리보기 모드'); render(); return; }
  setStatus('loading', '불러오는 중');
  const { data, error } = await db.from('assessments').select('*').order('assessment_date', { ascending: true });
  if (error) { setStatus('error', '연결 오류'); toast(`게시물을 불러오지 못했어요: ${error.message}`); return; }
  items = data || []; setStatus('online', '실시간 연결'); render();
}
function loadLocalItems() { try { return JSON.parse(localStorage.getItem('class-assessments') || '[]').filter(item => !String(item.id).startsWith('sample-')); } catch { return []; } }
function saveLocalItems() { localStorage.setItem('class-assessments', JSON.stringify(items)); }
async function checkAdmin(user) {
  if (!user || !db) { isAdmin = false; userId = null; updateAdminUI(); render(); return; }
  userId = user.id;
  const { data, error } = await db.from('class_admins').select('user_id').eq('user_id', user.id).maybeSingle();
  if (error) { isAdmin = false; els.authMessage.textContent = '관리자 권한을 확인하지 못했어요. 설정 안내를 확인해 주세요.'; }
  else isAdmin = Boolean(data);
  updateAdminUI(); render();
}
async function saveAssessment(record, id) {
  if (!isAdmin) throw new Error('관리자 권한이 필요해요.');
  if (!db) {
    const localId = id || `local-${Date.now()}`;
    items = id ? items.map(item => item.id === id ? { ...item, ...record, updated_at: new Date().toISOString() } : item) : [{ ...record, id: localId, created_at: new Date().toISOString() }, ...items];
    saveLocalItems(); return;
  }
  const payload = { ...record, created_by: userId };
  const { error } = id ? await db.from('assessments').update(payload).eq('id', id) : await db.from('assessments').insert(payload);
  if (error) throw error;
  await loadAssessments();
}
async function deleteAssessment(id) {
  if (!isAdmin) throw new Error('관리자 권한이 필요해요.');
  if (!db) { items = items.filter(item => item.id !== id); saveLocalItems(); return; }
  const { error } = await db.from('assessments').delete().eq('id', id);
  if (error) throw error;
  await loadAssessments();
}
function openEditor(item) {
  els.form.reset(); document.querySelector('#assessmentId').value = item?.id || '';
  document.querySelector('#editorTitle').textContent = item ? '수행평가 일정 수정' : '수행평가 일정 추가';
  document.querySelector('#subjectInput').value = item?.subject || '국어'; document.querySelector('#titleInput').value = item?.title || '';
  document.querySelector('#descriptionInput').value = item?.description || ''; document.querySelector('#dateInput').value = item?.assessment_date || '';
  document.querySelector('#suppliesInput').value = item?.supplies || ''; document.querySelector('#classInput').value = item?.class_name || (items.find(x => x.class_name)?.class_name || '');
  document.querySelector('#saveMessage').textContent = ''; els.editor.showModal();
}

els.authButton.addEventListener('click', async () => {
  if (isAdmin) {
    if (db) await db.auth.signOut();
    isAdmin = false; updateAdminUI(); render(); toast('로그아웃했어요.'); return;
  }
  els.authMessage.textContent = '';
  els.previewLogin.hidden = configured;
  els.authDialog.showModal();
});
els.authForm.addEventListener('submit', async event => {
  event.preventDefault(); els.authMessage.textContent = '';
  if (!db) { els.authMessage.textContent = '실제 관리자 로그인을 사용하려면 Supabase 설정을 먼저 완료해 주세요.'; return; }
  const { data, error } = await db.auth.signInWithPassword({ email: document.querySelector('#emailInput').value, password: document.querySelector('#passwordInput').value });
  if (error) { els.authMessage.textContent = '로그인할 수 없어요. 이메일과 비밀번호를 확인해 주세요.'; return; }
  await checkAdmin(data.user);
  if (!isAdmin) { await db.auth.signOut(); els.authMessage.textContent = '이 계정에는 관리자 권한이 없어요.'; return; }
  els.authDialog.close(); els.authForm.reset(); toast('관리자로 로그인했어요.');
});
els.previewButton.addEventListener('click', () => { isAdmin = true; updateAdminUI(); els.authDialog.close(); render(); toast('관리자 미리보기 모드예요. 변경 사항은 이 브라우저에만 저장돼요.'); });
els.addButton.addEventListener('click', () => openEditor());
els.form.addEventListener('submit', async event => {
  event.preventDefault(); const button = els.form.querySelector('[type="submit"]'); button.disabled = true; document.querySelector('#saveMessage').textContent = '';
  const id = document.querySelector('#assessmentId').value || null;
  const record = { subject: document.querySelector('#subjectInput').value, title: document.querySelector('#titleInput').value.trim(), description: document.querySelector('#descriptionInput').value.trim(), assessment_date: document.querySelector('#dateInput').value, supplies: document.querySelector('#suppliesInput').value.trim(), class_name: document.querySelector('#classInput').value.trim() };
  try { await saveAssessment(record, id); if (!db) render(); els.editor.close(); toast(id ? '수행평가 일정을 수정했어요.' : '수행평가 일정을 추가했어요.'); }
  catch (error) { document.querySelector('#saveMessage').textContent = error.message || '저장에 실패했어요.'; }
  finally { button.disabled = false; }
});
els.list.addEventListener('click', async event => {
  const edit = event.target.closest('.edit-button'); const remove = event.target.closest('.delete-button');
  if (edit) openEditor(items.find(item => String(item.id) === edit.dataset.id));
  if (remove) { const item = items.find(value => String(value.id) === remove.dataset.id); if (!item || !window.confirm(`“${item.title}” 일정을 삭제할까요?`)) return; try { await deleteAssessment(item.id); render(); toast('일정을 삭제했어요.'); } catch (error) { toast(`삭제에 실패했어요: ${error.message}`); } }
});
els.filters.addEventListener('click', event => { const button = event.target.closest('.filter'); if (!button) return; els.filters.querySelector('.active').classList.remove('active'); button.classList.add('active'); subjectFilter = button.dataset.subject; render(); });
document.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click', () => button.closest('dialog').close()));
[els.authDialog, els.editor].forEach(dialog => dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); }));

async function start() {
  await loadAssessments();
  if (!db) { setStatus('offline', '미리보기 모드'); return; }
  const { data: { session } } = await db.auth.getSession(); await checkAdmin(session?.user);
  db.auth.onAuthStateChange((_event, sessionData) => { window.setTimeout(() => checkAdmin(sessionData?.user), 0); });
  db.channel('class-assessment-updates').on('postgres_changes', { event: '*', schema: 'public', table: 'assessments' }, () => loadAssessments()).subscribe(status => { if (status === 'SUBSCRIBED') setStatus('online', '실시간 연결'); });
}
start();
