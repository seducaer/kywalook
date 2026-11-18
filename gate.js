// 살핌 — 실제로 살펴볼 때 묻는 비밀번호·키
// 소개·기준 등 페이지는 누구나 볼 수 있고, 「살펴보기 시작」을 누를 때 확인해요.
// 비밀번호·키는 이 코드에 없어요. 서버 함수(/api/review)가 환경변수와 비교해서 맞는지만 알려줘요.
(function () {
  const K = 'salpim.pass';
  const mem = {};
  const store = {
    get() { try { return sessionStorage.getItem(K) || localStorage.getItem(K) || ''; } catch (e) { return mem[K] || ''; } },
    set(v, keep) { mem[K] = v; try { (keep ? localStorage : sessionStorage).setItem(K, v); (keep ? sessionStorage : localStorage).removeItem(K); } catch (e) {} },
    clear() { delete mem[K]; try { sessionStorage.removeItem(K); localStorage.removeItem(K); } catch (e) {} }
  };

  const headers = () => { const v = store.get(); return v ? { 'x-salpim-pass': v } : {}; };

  async function check(v) {
    let r;
    try { r = await fetch('/api/review', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-salpim-pass': v }, body: JSON.stringify({ check: true }) }); }
    catch (e) { return 'net'; }
    if (r.ok) return 'ok';
    if (r.status === 404) return 'nofn';
    if (r.status === 401) return 'auth';
    const d = await r.json().catch(() => ({}));
    return d.error === 'no_key' ? 'no_key' : 'err';
  }

  const MSG = {
    pass: '비밀번호가 맞지 않아요. 다시 넣어 주세요.',
    code: '키가 맞지 않아요. KYWA로부터 전달받은 키를 그대로 넣어 주세요.',
    no_key: 'AI 연결이 아직 설정되지 않았어요. 관리자에게 알려 주세요.',
    nofn: '이 주소에는 맥락 확인 기능이 설치되어 있지 않아요.',
    net: '인터넷 연결을 확인한 뒤 다시 시도해 주세요.',
    err: '확인하는 중에 문제가 생겼어요. 잠시 뒤 다시 시도해 주세요.'
  };

  const $ = (s) => document.querySelector(s);
  let waiting = null, verified = ''; // require()가 기다리는 중이면 { ok, no }
  const TOP = '살핌으로 문서를 살펴보려면 비밀번호나 키가 필요해요. 한 번 넣으면 브라우저를 닫을 때까지 다시 묻지 않아요.';

  function open(note) {
    $('#gate .g-top').textContent = note || TOP;
    document.querySelectorAll('#gate .g-msg').forEach((m) => { m.textContent = ''; });
    document.body.classList.add('locked');
    $('#gate').hidden = false;
    setTimeout(() => $('#gPass').focus(), 50);
  }
  function close(done) {
    document.body.classList.remove('locked');
    $('#gate').hidden = true;
    syncFoot();
    if (waiting) { const w = waiting; waiting = null; done ? w.ok() : w.no(); }
  }
  function syncFoot() { const b = document.querySelector('[data-logout]'); if (b) b.hidden = !store.get(); }

  async function submit(form, kind) {
    const inp = form.querySelector('input[type=password]'), btn = form.querySelector('button[type=submit]'), msg = form.querySelector('.g-msg');
    const v = inp.value.trim();
    msg.textContent = '';
    if (!v) { msg.textContent = kind === 'pass' ? '비밀번호를 넣어 주세요.' : '전달받은 키를 넣어 주세요.'; inp.focus(); return; }
    btn.disabled = true; const t = btn.textContent; btn.textContent = '확인하는 중…';
    const res = await check(v);
    btn.disabled = false; btn.textContent = t;
    if (res !== 'ok') { msg.textContent = res === 'auth' ? MSG[kind] : (MSG[res] || MSG.err); inp.select(); return; }
    store.set(v, form.querySelector('input[type=checkbox]').checked); verified = v;
    inp.value = '';
    close(true);
  }

  window.SALPIM_AUTH = {
    headers,
    has: () => !!store.get(),
    // 맥락 확인 전에 부름: 이미 있으면 바로, 없으면 창을 띄우고 들어오면 이어서
    async require() {
      const v = store.get();
      if (v && verified === v) return true;
      if (v) {
        // 저장된 비밀번호·키는 이 페이지에서 처음 쓸 때 한 번 서버에 확인 (회수한 키를 막기 위해)
        const res = await check(v);
        if (res === 'ok') { verified = v; return true; }
        if (res === 'auth') { store.clear(); syncFoot(); return new Promise((ok) => { waiting = { ok: () => ok(true), no: () => ok(false) }; open('저장된 비밀번호나 키가 더 이상 맞지 않아요. 다시 넣어 주세요.'); }); }
        return new Promise((ok) => { waiting = { ok: () => ok(true), no: () => ok(false) }; open(MSG[res] || MSG.err); });
      }
      return new Promise((ok) => { waiting = { ok: () => ok(true), no: () => ok(false) }; open(); });
    },
    // 쓰는 도중 비밀번호가 바뀌었거나 키가 막혔을 때
    expire() { store.clear(); verified = ''; syncFoot(); open('비밀번호나 키가 바뀌었어요. 다시 넣은 뒤 이어서 해 주세요.'); },
    logout() { store.clear(); verified = ''; syncFoot(); }
  };

  document.addEventListener('DOMContentLoaded', () => {
    $('#gFormPass').addEventListener('submit', (e) => { e.preventDefault(); submit(e.target, 'pass'); });
    $('#gFormKey').addEventListener('submit', (e) => { e.preventDefault(); submit(e.target, 'code'); });
    document.addEventListener('click', (e) => {
      if (e.target.closest('[data-gclose]')) { e.preventDefault(); close(false); }
      const lo = e.target.closest('[data-logout]');
      if (lo) { e.preventDefault(); window.SALPIM_AUTH.logout(); lo.textContent = '지웠어요'; setTimeout(() => { lo.textContent = '저장된 비밀번호·키 지우기'; }, 1500); }
    });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('#gate').hidden) close(false); });
    $('#gate').addEventListener('click', (e) => { if (e.target.id === 'gate') close(false); });
    syncFoot();
  });
})();
