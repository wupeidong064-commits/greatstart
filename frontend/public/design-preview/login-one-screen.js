(() => {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const updateVisibility = () => document.body.classList.toggle('page-hidden', document.hidden);
  document.addEventListener('visibilitychange', updateVisibility);
  updateVisibility();
  const faq = [
    ['登录后可以做什么？', '排课、点名、课时与学员跟进，按账号权限进入对应功能。'],
    ['老师和家长看到的一样吗？', '老师查看教学安排；家长查看关联学员的课表、出勤与缴费信息。'],
    ['忘记密码怎么办？', '通过“忘记密码”入口重置；未绑定手机号时，请联系机构管理员。'],
  ];
  const reviews = [
    { text: '“课表和点名放在一起，\n少翻几张表。”', initial: '教', role: '教务视角', detail: '日常课务协作 · 示例' },
    { text: '“每天先看待办，\n跟进更有方向。”', initial: '校', role: '校长视角', detail: '校区经营跟进 · 示例' },
    { text: '“班级、课时和出勤，\n终于在一个地方。”', initial: '师', role: '老师视角', detail: '教学安排与记录 · 示例' },
  ];
  const featureCopy = [
    '班级、老师和上课时段，清楚安排。',
    '出勤、请假与课时记录，随课掌握。',
    '从新报首课到续费，每一步及时关注。',
  ];
  let reviewIndex = 0;
  const animate = (element) => {
    if (reduced.matches) return;
    element.classList.remove('swap');
    void element.offsetWidth;
    element.classList.add('swap');
  };
  const selectSegment = (button, groupSelector) => {
    const group = button.closest(groupSelector);
    const buttons = [...group.querySelectorAll('button')];
    buttons.forEach((b) => b.setAttribute('aria-pressed', String(b === button)));
    group.style.setProperty('--selected', String(buttons.indexOf(button)));
  };
  const chooseCard = (id, animateEntry = true) => {
    document.querySelectorAll('[data-card]').forEach((button) => {
      button.setAttribute('aria-pressed', String(button.dataset.card === id));
    });
    document.querySelector('.mobile-tabs').style.setProperty('--selected', String(['faq', 'reviews', 'features'].indexOf(id)));
    document.querySelectorAll('.info-card').forEach((card) => card.classList.toggle('is-current', card.id === `card-${id}`));
    const selected = document.querySelector(`#card-${id}`);
    if (animateEntry && getComputedStyle(document.querySelector('.mobile-tabs')).display !== 'none') animate(selected);
  };
  document.querySelectorAll('[data-card]').forEach((button) => button.addEventListener('click', () => chooseCard(button.dataset.card)));
  document.querySelectorAll('[data-faq]').forEach((button) => button.addEventListener('click', () => {
    selectSegment(button, '.segmented');
    const index = Number(button.dataset.faq);
    const copy = document.querySelector('#faq-copy');
    copy.querySelector('h3').textContent = faq[index][0];
    copy.querySelector('p').textContent = faq[index][1];
    document.querySelector('#faq-count').textContent = `0${index + 1} / 03`;
    animate(copy);
  }));
  const showReview = (direction) => {
    reviewIndex = (reviewIndex + direction + reviews.length) % reviews.length;
    const review = reviews[reviewIndex];
    const copy = document.querySelector('#review-copy');
    copy.querySelector('blockquote').textContent = review.text;
    copy.querySelector('blockquote').style.whiteSpace = 'pre-line';
    copy.querySelector('.avatar').textContent = review.initial;
    copy.querySelector('b').textContent = review.role;
    copy.querySelector('small').textContent = review.detail;
    document.querySelector('#review-count').textContent = `0${reviewIndex + 1} / 03`;
    document.querySelectorAll('.review-dots i').forEach((dot, index) => dot.classList.toggle('is-active', index === reviewIndex));
    animate(copy);
  };
  document.querySelector('#review-prev').addEventListener('click', () => showReview(-1));
  document.querySelector('#review-next').addEventListener('click', () => showReview(1));
  document.querySelectorAll('[data-feature]').forEach((button) => button.addEventListener('click', () => {
    document.querySelectorAll('[data-feature]').forEach((b) => b.setAttribute('aria-pressed', String(b === button)));
    document.querySelector('#feature-count').textContent = `0${Number(button.dataset.feature) + 1} / 03`;
    const copy = document.querySelector('#feature-copy');
    copy.querySelector('p').textContent = featureCopy[Number(button.dataset.feature)];
    animate(copy);
  }));
  const status = document.querySelector('.form-status');
  const account = document.querySelector('#account');
  const secret = document.querySelector('#secret');
  let mode = 'account';
  const notice = (text) => { status.textContent = text; };
  document.querySelectorAll('[data-mode]').forEach((button) => button.addEventListener('click', () => {
    mode = button.dataset.mode;
    const otp = mode === 'otp';
    selectSegment(button, '.segmented');
    account.placeholder = otp ? '手机号' : '邮箱或手机号';
    account.inputMode = otp ? 'tel' : 'text';
    document.querySelector('#account-label').textContent = account.placeholder;
    secret.placeholder = otp ? '短信验证码' : '密码';
    document.querySelector('#secret-label').textContent = secret.placeholder;
    secret.value = '';
    secret.type = otp ? 'text' : 'password';
    secret.inputMode = otp ? 'numeric' : 'text';
    secret.autocomplete = otp ? 'one-time-code' : 'current-password';
    document.querySelector('#eye').hidden = otp;
    document.querySelector('#eye').setAttribute('aria-label', '显示密码');
    document.querySelector('#send').hidden = !otp;
    notice('');
  }));
  document.querySelector('#eye').addEventListener('click', (event) => {
    secret.type = secret.type === 'password' ? 'text' : 'password';
    event.currentTarget.setAttribute('aria-label', secret.type === 'password' ? '显示密码' : '隐藏密码');
  });
  document.querySelector('#send').addEventListener('click', () => notice('设计预览不发送短信。'));
  document.querySelector('#login-form').addEventListener('submit', (event) => {
    event.preventDefault();
    if (!account.value.trim()) { notice(mode === 'otp' ? '请输入手机号' : '请输入邮箱或手机号'); account.focus({ preventScroll: true }); return; }
    if (!secret.value.trim()) { notice(mode === 'otp' ? '请输入短信验证码' : '请输入密码'); secret.focus({ preventScroll: true }); return; }
    notice('当前为设计预览，请从左上角进入正式登录页。');
  });
  const dialog = document.querySelector('#help-dialog');
  document.querySelector('#forgot').addEventListener('click', () => dialog.showModal());
  document.querySelector('#dialog-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', (event) => {
    const rect = dialog.getBoundingClientRect();
    if (event.target === dialog && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)) dialog.close();
  });
  let helpTimer;
  document.querySelector('#help').addEventListener('click', () => {
    chooseCard('faq');
    const card = document.querySelector('#card-faq');
    card.classList.add('is-highlighted');
    card.querySelector('[data-faq="0"]').focus({ preventScroll: true });
    clearTimeout(helpTimer);
    helpTimer = setTimeout(() => card.classList.remove('is-highlighted'), 900);
  });
  document.querySelectorAll('.info-card').forEach((card) => {
    card.addEventListener('pointermove', (event) => {
      if (event.pointerType !== 'mouse' || reduced.matches) return;
      const rect = card.getBoundingClientRect();
      card.style.setProperty('--mx', `${((event.clientX - rect.left) / rect.width - .5) * 4}px`);
      card.style.setProperty('--my', `${((event.clientY - rect.top) / rect.height - .5) * 4}px`);
    });
    const reset = () => { card.style.setProperty('--mx', '0px'); card.style.setProperty('--my', '0px'); };
    card.addEventListener('pointerleave', reset);
    card.addEventListener('pointercancel', reset);
  });
  if (window.visualViewport) {
    const checkKeyboard = () => {
      const editing = document.activeElement?.tagName === 'INPUT';
      const keyboard = innerWidth <= 680 && editing && innerHeight - visualViewport.height > 120;
      document.body.classList.toggle('keyboard-open', Boolean(keyboard));
    };
    visualViewport.addEventListener('resize', checkKeyboard);
    document.addEventListener('focusin', checkKeyboard);
    document.addEventListener('focusout', () => requestAnimationFrame(checkKeyboard));
  }
})();
