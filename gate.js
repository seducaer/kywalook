// 살핌 — 들어가기(기관 비밀번호 또는 Anthropic API 키)
// 비밀번호는 이 코드에 없어요. 서버 함수(/api/review)가 환경변수와 비교해서 맞는지만 알려줘요.
(function () {
  const K_PASS = 'salpim.pass', K_KEY = 'salpim.key';
  const APPLY_TO = 'sm@kywa.or.kr';
  const APPLY_SUBJECT = '[살핌] 활용 신청';
  const APPLY_BODY = [
    '살핌 활용을 신청합니다.', '',
    '기관명: ', '부서: ', '담당자(이름·직위): ', '연락처: ',
    '활용 목적(살펴볼 문서 종류): ',
    'Anthropic API 키: 있음 / 없음(발급 안내 필요)', '',
    '※ 살핌은 맥락 확인에 AI(API)를 써서, 기관마다 API 키를 넣어 쓰는 방식이에요.'
  ].join('\n');
  const applyHref = 'mailto:' + APPLY_TO + '?subject=' + encodeURIComponent(APPLY_SUBJECT) + '&body=' + encodeURIComponent(APPLY_BODY);

  const store = {
    get(k) { try { return sessionStorage.getItem(k) || localStorage.getItem(k) || ''; } catch (e) { return mem[k] || ''; } },
    set(k, v, keep) {
      mem[k] = v;
      try { (keep ? localStorage : sessionStorage).setItem(k, v); (keep ? sessionStorage : localStorage).removeItem(k); } catch (e) {}
    },
    clear() { for (const k of [K_PASS, K_KEY]) { delete mem[k]; try { sessionStorage.removeItem(k); localStorage.removeItem(k); } catch (e) {} } }
  };
  const mem = {};

  function headers() {
    const key = store.get(K_KEY), pass = store.get(K_PASS);
    if (key) return { 'x-salpim-key': key };
    if (pass) return { 'x-salpim-pass': pass };
    return {};
  }

  async function check(h) {
    let r;
    try {
      r = await fetch('/api/review', { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, h), body: JSON.stringify({ check: true }) });
    } catch (e) { return 'net'; }
    if (r.ok) return 'ok';
    if (r.status === 404) return 'nofn';
    const d = await r.json().catch(() => ({}));
    if (r.status === 401) return d.error === 'bad_key' ? 'bad_key' : 'auth';
    if (d.error === 'no_key') return 'no_key';
    return 'err';
  }

  const MSG = {
    auth: '비밀번호가 맞지 않아요. 다시 넣어 주세요.',
    bad_key: '이 API 키로는 들어갈 수 없어요. 키를 다시 확인해 주세요. (sk-ant-로 시작해요)',
    no_key: '기관 API 키가 아직 설정되지 않았어요. 관리자에게 알려 주세요.',
    nofn: '살핌 서버를 찾지 못했어요. 잠시 뒤 다시 시도해 주세요.',
    net: '인터넷 연결을 확인한 뒤 다시 시도해 주세요.',
    err: '들어가는 중에 문제가 생겼어요. 잠시 뒤 다시 시도해 주세요.'
  };

  const $ = (s) => document.querySelector(s);
  function open() { document.body.classList.add('locked'); $('#gate').hidden = false; setTimeout(() => $('#gPass') && $('#gPass').focus(), 50); }
  function close() { document.body.classList.remove('locked'); $('#gate').hidden = true; }

  async function submit(form, kind) {
    const inp = form.querySelector('input[type=password]'), btn = form.querySelector('button[type=submit]'), msg = form.querySelector('.g-msg');
    const v = inp.value.trim();
    msg.textContent = '';
    if (!v) { msg.textContent = kind === 'pass' ? '비밀번호를 넣어 주세요.' : 'API 키를 넣어 주세요.'; inp.focus(); return; }
    if (kind === 'key' && !/^sk-ant-/.test(v)) { msg.textContent = MSG.bad_key; inp.focus(); return; }
    btn.disabled = true; const t = btn.textContent; btn.textContent = '확인하는 중…';
    const res = await check(kind === 'pass' ? { 'x-salpim-pass': v } : { 'x-salpim-key': v });
    btn.disabled = false; btn.textContent = t;
    if (res !== 'ok') { msg.textContent = MSG[res] || MSG.err; inp.select(); return; }
    const keep = form.querySelector('input[type=checkbox]').checked;
    store.clear();
    store.set(kind === 'pass' ? K_PASS : K_KEY, v, keep);
    inp.value = '';
    close();
  }

  window.SALPIM_AUTH = {
    headers,
    applyHref,
    // 쓰는 도중 비밀번호가 바뀌었거나 키가 막혔을 때
    expire() { store.clear(); open(); const m = document.querySelector('#gate .g-top'); if (m) m.textContent = '다시 들어가 주세요. 비밀번호가 바뀌었거나 키를 더 쓸 수 없게 되었어요.'; },
    logout() { store.clear(); open(); }
  };

  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('[data-apply]').forEach((a) => { a.href = applyHref; });
    $('#gFormPass').addEventListener('submit', (e) => { e.preventDefault(); submit(e.target, 'pass'); });
    $('#gFormKey').addEventListener('submit', (e) => { e.preventDefault(); submit(e.target, 'key'); });
    document.addEventListener('click', (e) => { if (e.target.closest('[data-logout]')) { e.preventDefault(); window.SALPIM_AUTH.logout(); } });
    if (headers()['x-salpim-key'] || headers()['x-salpim-pass']) close(); else open();
  });
})();
