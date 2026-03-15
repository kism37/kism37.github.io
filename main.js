// ── CURSOR
(function(){
  const c = document.getElementById('k-cur');
  if (!c) return;
  let x=0,y=0;
  document.addEventListener('mousemove', e => {
    x = e.clientX; y = e.clientY;
    c.style.left = x+'px'; c.style.top = y+'px';
  });
  document.querySelectorAll('a,button,input').forEach(el => {
    el.addEventListener('mouseenter', () => c.classList.add('big'));
    el.addEventListener('mouseleave', () => c.classList.remove('big'));
  });
})();

// ── SCROLL PROGRESS
(function(){
  const b = document.getElementById('kprog');
  if (!b) return;
  window.addEventListener('scroll', () => {
    const h = document.documentElement;
    b.style.width = (h.scrollTop / (h.scrollHeight - h.clientHeight) * 100) + '%';
  }, { passive: true });
})();

// ── SCROLL REVEAL
(function(){
  const o = new IntersectionObserver(entries => {
    entries.forEach((e,i) => {
      if (e.isIntersecting) {
        setTimeout(() => e.target.classList.add('in'), i * 50);
        o.unobserve(e.target);
      }
    });
  }, { threshold: .08 });
  document.querySelectorAll('.rev').forEach(el => o.observe(el));
})();

// ── SEARCH
(function(){
  const overlay = document.getElementById('k-search');
  const input   = document.getElementById('k-sinput');
  const results = document.getElementById('k-sresults');
  if (!overlay) return;

  // ── ADD YOUR POSTS HERE as you publish ──
  // { title, url, cat, date }
  const POSTS = [
    { title: 'Gift', url: '/posts/hacking/hackmyvm-gift.html', cat: 'hacking', date: '2023' },
    { title: 'PicoCTF 2023 — Selected Writeups', url: '/posts/ctf/picoctf-2023.html', cat: 'ctf', date: '2023' },
  ];

  const open  = () => { overlay.classList.add('open'); input && setTimeout(() => input.focus(), 50); };
  const close = () => { overlay.classList.remove('open'); if(input){input.value='';} if(results){results.innerHTML='';} };

  document.querySelectorAll('[data-search]').forEach(el => el.addEventListener('click', open));
  document.addEventListener('keydown', e => {
    if (e.key === '/' && document.activeElement.tagName !== 'INPUT') { e.preventDefault(); open(); }
    if (e.key === 'Escape') close();
  });
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

  if (input && results) {
    input.addEventListener('input', () => {
      const q = input.value.toLowerCase().trim();
      results.innerHTML = '';
      if (!q) return;
      const hits = POSTS.filter(p => p.title.toLowerCase().includes(q) || p.cat.includes(q));
      if (!hits.length) {
        results.innerHTML = '<div style="font-size:.75rem;color:var(--dim);padding:.4rem 0">Nothing yet — keep writing.</div>';
        return;
      }
      hits.forEach(p => {
        const a = document.createElement('a');
        a.className = 'sr-item'; a.href = p.url;
        a.innerHTML = `<span class="sr-title">${p.title}</span><span class="sr-cat">${p.cat} · ${p.date}</span>`;
        results.appendChild(a);
      });
    });
  }
})();
