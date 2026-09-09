/* H3C 网络仿真实验室 - 多设备 CLI 终端 */
(function (H) {
  'use strict';
  var E = H.Engine, S = H.State, U = H.U;

  var tabsEl, screenEl, promptEl, inputEl;
  var activeDev = null;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]; });
  }

  function init() {
    tabsEl = document.getElementById('term-tabs');
    screenEl = document.getElementById('term-screen');
    promptEl = document.getElementById('term-prompt');
    inputEl = document.getElementById('term-input');
    inputEl.addEventListener('keydown', onKey);
    // 点击屏幕可立即跳过逐字输出
    screenEl.addEventListener('click', function () { finishReveal(); });
    S.on('change', refreshTabs);
  }

  function activeSession() { return activeDev ? S.getSession(activeDev) : null; }
  function activeDevice() { return activeDev ? S.getDevice(activeDev) : null; }

  /* ---------- 标签栏 ---------- */
  function refreshTabs() {
    if (!tabsEl) return;
    var devs = S.S.devices, html = '';
    devs.forEach(function (d) {
      var cls = (d.id === activeDev) ? 'term-tab active' : 'term-tab';
      var dot = portUpAny(d) ? 'up' : 'none';
      html += '<div class="' + cls + '" data-id="' + d.id + '">' +
        '<span class="tdot ' + dot + '"></span>' +
        '<span class="tname">' + esc(d.cfg.hostname || d.name) + '</span>' +
        '<span class="tclose" data-close="' + d.id + '" title="关闭终端(不删除设备)">×</span></div>';
    });
    tabsEl.innerHTML = html;
    // 绑定
    var nodes = tabsEl.querySelectorAll('.term-tab');
    Array.prototype.forEach.call(nodes, function (n) {
      n.addEventListener('click', function (e) {
        if (e.target.getAttribute('data-close')) { closeTab(e.target.getAttribute('data-close')); e.stopPropagation(); return; }
        openTab(n.getAttribute('data-id'));
      });
    });
  }
  function portUpAny(d) {
    for (var i = 0; i < d.ports.length; i++) { if (H.Sim.portUp(d, d.ports[i].name)) return true; }
    return false;
  }

  function closeTab(id) {
    var s = S.getSession(id); if (s) stopJob(s);     // 关闭终端时结束持续任务
    if (id === activeDev) {
      var devs = S.S.devices;
      var idx = devs.map(function (x) { return x.id; }).indexOf(id);
      var next = devs[idx + 1] || devs[idx - 1] || null;
      activeDev = null;
      if (next) openTab(next.id); else renderEmpty();
    }
    refreshTabs();
  }

  /* ---------- 打开/切换设备 ---------- */
  function openTab(id) {
    var d = S.getDevice(id); if (!d) return;
    activeDev = id;
    var sess = S.getSession(id);
    if (sess.buffer === undefined) sess.buffer = [];
    var fresh = false;
    if (!sess.started) { printBanner(d, sess); sess.started = true; fresh = true; }
    renderScreen();
    if (fresh) { renderScreen(0); startReveal(sess.buffer); }   // 首次打开：登录横幅逐行"刷"出来
    refreshTabs();
    promptEl.textContent = E.promptFor(d, sess);
    inputEl.disabled = false;
    syncJobInput();                     // 该设备若有持续任务（ping -t），输入框保持只读
    inputEl.focus();
    if (H.UI.Terminal.onActivate) H.UI.Terminal.onActivate(id);
  }

  function printBanner(d, sess) {
    var b = E.bannerFor(d);
    for (var i = 0; i < b.length; i++) sess.buffer.push({ type: 'sys', text: b[i] });
  }

  function renderEmpty() {
    activeDev = null;
    screenEl.innerHTML = '<div class="t-sys">尚未选择设备。请在拓扑中点击设备，或从左侧设备库添加设备后点击。</div>';
    promptEl.textContent = '<H3C>';
    inputEl.disabled = true; inputEl.value = '';
    refreshTabs();
  }

  /* ---------- 屏幕渲染 ----------
   * 每行一个 .t-line 节点；打字机是「逐行 append 新节点」而不是先把所有行建好再填字，
   * 这样屏幕空间是一行一行被占用的，不会出现"先留出整块空白再逐行显示"。
   */
  function kindOf(e) {
    return (e.type === 'in') ? 't-in'
      : (e.type === 'err') ? 't-err'
        : (e.type === 'help') ? 't-help'
          : (e.type === 'sys') ? 't-sys' : '';
  }
  function lineHtml(kind, text, prompt) {
    return '<div class="t-line' + (kind ? ' ' + kind : '') + '">' +
      (prompt ? ('<span class="tp">' + esc(prompt) + '</span> ') : '') + esc(text) + '</div>';
  }
  // 把 buffer 条目摊平成"行"：[{kind, text, prompt}]
  function entriesToLines(entries) {
    var out = [];
    for (var i = 0; i < entries.length; i++) {
      var e = entries[i], kind = kindOf(e);
      var ls = String(e.text == null ? '' : e.text).split('\n');
      for (var j = 0; j < ls.length; j++) {
        out.push({ kind: kind, text: ls[j], prompt: (e.type === 'in' && j === 0) ? e.prompt : null });
      }
    }
    return out;
  }

  // maxLines：只渲染前 N 行（打字机用它先画出"已有内容"，新内容再逐行追加）
  function renderScreen(maxLines) {
    var sess = activeSession(); if (!sess) { return; }
    finishReveal();               // 渲染会重建 DOM，先结束动画避免持有失效节点
    var buf = sess.buffer, html = '', n = 0, stop = false;
    for (var i = 0; i < buf.length && !stop; i++) {
      var e = buf[i], kind = kindOf(e);
      var ls = String(e.text == null ? '' : e.text).split('\n');
      for (var j = 0; j < ls.length; j++) {
        if (maxLines != null && n >= maxLines) { stop = true; break; }
        html += lineHtml(kind, ls[j], (e.type === 'in' && j === 0) ? e.prompt : null);
        n++;
      }
    }
    screenEl.innerHTML = html;
    screenEl.scrollTop = screenEl.scrollHeight;
  }

  // 统计 buffer 已经占用多少行（用于定位"本次新增内容"的起始行）
  function countLines(buf) {
    var n = 0;
    for (var i = 0; i < buf.length; i++) {
      var t = String(buf[i].text == null ? '' : buf[i].text);
      n += t.split('\n').length;
    }
    return n;
  }

  /* ---------- 打字机：逐字逐行揭示输出（贴近真实终端） ----------
   * 设计要点：命令结果仍"立即完整写入 sess.buffer"（保证数据/测试一致），
   * 显示层才是"一行一行新增节点并逐字填充"，屏幕空间随之逐行增长；
   * 任意键或点击可立即跳过。
   */
  var TYPE_CPS = 380;        // 每秒字符数（越小越慢，贴近真实设备逐字回显）
  var TYPE_LINE_GAP = 30;    // 行间额外停顿(ms)
  var TYPE_MAX_MS = 5000;    // 单次输出总时长上限，超出则自动提速
  var TYPE_MAX_LINES = 3000; // 超过这么多行才放弃动画（极端输出兜底）
  var TYPE_ON = true;        // 总开关（自动化测试会关闭，保证 DOM 立即可见）
  var typer = null;

  function nowMs() { return (window.performance && performance.now) ? performance.now() : Date.now(); }
  function rafFn(fn) {
    if (window.requestAnimationFrame) return window.requestAnimationFrame(fn);
    return setTimeout(function () { fn(nowMs()); }, 16);
  }
  function cafFn(id) {
    if (window.cancelAnimationFrame) { try { window.cancelAnimationFrame(id); } catch (x) {} }
    else clearTimeout(id);
  }
  // 动画期间不禁用输入框（以便"打字排队"和任意键跳过），只加一个光标样式
  function setBusy(b) {
    if (!screenEl) return;
    try { screenEl.classList[b ? 'add' : 'remove']('typing'); } catch (x) {}
    if (!b && activeDev) { try { inputEl.focus(); } catch (x) {} }
  }

  function canAnimate() {
    return !!(TYPE_ON && screenEl && typeof window.requestAnimationFrame === 'function');
  }

  // 逐行揭示一批"行"（先插入节点占住一行，再往里逐字填）
  function startRevealLines(lines) {
    finishReveal();
    if (!lines || !lines.length) return;
    if (!canAnimate() || lines.length > TYPE_MAX_LINES) { renderScreen(); return; }

    // 命令回显行（t-in）立即完整出现，之后的输出行才逐行揭示
    var k = 0, html = '';
    while (k < lines.length && lines[k].kind === 't-in') {
      html += lineHtml(lines[k].kind, lines[k].text, lines[k].prompt);
      k++;
    }
    if (html) screenEl.insertAdjacentHTML('beforeend', html);
    var items = lines.slice(k);
    if (!items.length) { screenEl.scrollTop = screenEl.scrollHeight; return; }

    var total = 0;
    for (var i = 0; i < items.length; i++) total += items[i].text.length;
    var cps = TYPE_CPS;
    var gap = items.length > 80 ? 0 : TYPE_LINE_GAP;      // 超长输出取消行间停顿
    var est = (total / cps) * 1000 + items.length * gap;
    // 超出总时长上限就整体提速：无论输出多长都在 TYPE_MAX_MS 内滚完（不会"秒出"，也不会久等）
    if (est > TYPE_MAX_MS) cps = Math.max(120, total / ((TYPE_MAX_MS - 120) / 1000));

    typer = {
      items: items, idx: 0, cps: cps,
      el: null, pos: 0,
      gap: 0, gap0: gap,          // gap0=行末停顿基准
      last: nowMs(), raf: 0, alive: true
    };
    setBusy(true);
    typer.raf = rafFn(step);
  }

  // 对外：揭示一批新增的 buffer 条目
  function startReveal(entries) { startRevealLines(entriesToLines(entries)); }

  // 动画进行中又来了新内容（如 ping -t）：排到当前队列尾部，不打断正在刷的那行
  function pushLines(lines) {
    if (typer && typer.alive) {
      for (var i = 0; i < lines.length; i++) typer.items.push(lines[i]);
      if (!typer.raf) { typer.last = nowMs(); typer.raf = rafFn(step); }
      return;
    }
    startRevealLines(lines);
  }

  function step(ts) {
    if (!typer || !typer.alive) return;
    var t = (ts == null) ? nowMs() : ts;
    var dt = t - typer.last;
    typer.last = t;
    if (dt < 0) dt = 0;
    if (typer.gap > 0) {
      typer.gap -= dt;
      if (typer.gap > 0) { typer.raf = rafFn(step); return; }
      dt = -typer.gap; typer.gap = 0;
    }
    var budget = Math.max(1, Math.floor(typer.cps * dt / 1000));
    while (typer.idx < typer.items.length) {
      if (!typer.el) {                                  // 新行：先建节点（空间从这一刻开始被占用）
        var head = typer.items[typer.idx];
        typer.el = document.createElement('div');
        typer.el.className = 't-line' + (head.kind ? ' ' + head.kind : '');
        typer.el.textContent = '';
        screenEl.appendChild(typer.el);
        typer.pos = 0;
        screenEl.scrollTop = screenEl.scrollHeight;
      }
      var it = typer.items[typer.idx];
      var remain = it.text.length - typer.pos;
      if (remain <= budget) {
        typer.el.textContent = it.text;                 // 本行补齐
        budget -= remain;
        typer.idx++; typer.el = null;
        if (typer.idx >= typer.items.length) break;
        typer.gap = typer.gap0;                         // 行末停顿
        if (typer.gap > 0 || budget <= 0) break;
        continue;
      }
      typer.pos += budget;
      typer.el.textContent = it.text.substring(0, typer.pos);
      budget = 0;
      break;
    }
    screenEl.scrollTop = screenEl.scrollHeight;
    if (typer.idx >= typer.items.length) { finishReveal(); return; }
    typer.raf = rafFn(step);
  }


  // 立即补全剩余内容并恢复输入
  function finishReveal() {
    if (!typer) return;
    var t = typer;
    typer = null;                       // 先置空，避免重入
    t.alive = false;
    if (t.raf) cafFn(t.raf);
    var i = t.idx;
    if (t.el && i < t.items.length) {   // 正在刷的这行先补齐
      t.el.textContent = t.items[i].text;
      i++;
    }
    var html = '';
    for (; i < t.items.length; i++) {   // 其余未出现的行一次性插入
      html += lineHtml(t.items[i].kind, t.items[i].text, t.items[i].prompt);
    }
    if (html && screenEl) screenEl.insertAdjacentHTML('beforeend', html);
    if (screenEl) screenEl.scrollTop = screenEl.scrollHeight;
    setBusy(false);
  }

  /* ---------- 后台任务（PC 的 ping -t 等持续输出命令） ----------
   * job = { label, interval, tick(), stopText(job) }
   * 每次 tick 都重新走 Sim 转发计算，所以链路断开 / 端口配置变化 / 恢复会实时反映。
   */
  function stopJob(sess) {
    if (!sess || !sess.job) return null;
    var j = sess.job;
    sess.job = null;
    if (j.timer) clearInterval(j.timer);
    syncJobInput();
    return j;
  }

  // 持续任务运行期间输入框只读（像真实终端一样不接受命令，只能 Ctrl+C）
  function syncJobInput() {
    if (!inputEl) return;
    var s = activeSession();
    inputEl.readOnly = !!(s && s.job);
    if (!inputEl.readOnly && activeDev) { try { inputEl.focus(); } catch (x) {} }
  }

  function startJob(sess, devId, job) {
    stopJob(sess);
    job.sent = 0; job.recv = 0; job.times = [];
    sess.job = job;
    var tickNow = function () {
      if (!sess.job || sess.job !== job) return;
      var cur = S.getSession(devId);
      if (!cur || cur !== sess) { stopJob(sess); return; }   // 会话已被重建（重载/切场景）
      var r;
      try { r = job.tick(); } catch (x) { r = null; }
      if (!r) return;
      job.sent++;
      if (r.ok) { job.recv++; if (r.time != null) job.times.push(r.time); }
      var entry = { type: 'out', text: r.line };
      sess.buffer.push(entry);
      if (devId === activeDev) {
        if (canAnimate()) pushLines(entriesToLines([entry]));   // 排队逐行显示，不打断正在刷的行
        else renderScreen();
      }
    };
    tickNow();                                   // 先立刻出一行，避免干等一秒
    job.timer = setInterval(tickNow, job.interval || 1000);
    syncJobInput();
  }

  /* ---------- 执行 ---------- */
  function submit(raw) {
    var d = activeDevice(), sess = activeSession();
    if (!d || !sess) return;
    var line = String(raw || '');
    var oldLines = countLines(sess.buffer);
    var bufRef = sess.buffer;                 // cls/clear 会整块替换 buffer
    var added = [];
    var inEntry = { type: 'in', prompt: E.promptFor(d, sess), text: line };
    sess.buffer.push(inEntry); added.push(inEntry);
    if (line.trim() !== '') {
      var r = E.exec(d, sess, line);
      var out = r.out;
      if (Array.isArray(out)) out = out.join('\n');
      var outEntry = { type: r.err ? 'err' : 'out', text: out };
      sess.buffer.push(outEntry);
      if (sess.buffer === bufRef) added.push(outEntry); else added = [];   // 已清屏则不追加
      if (r.job && !r.err) startJob(sess, d.id, r.job);      // 持续类命令（ping -t）
      if (sess.history.indexOf(line) < 0 || sess.history.length === 0) sess.history.push(line);
    }
    sess.histIdx = -1;
    inputEl.value = '';
    promptEl.textContent = E.promptFor(d, sess);
    if (sess.buffer === bufRef) {
      renderScreen(oldLines);                 // 只画到"本次之前"，新内容交给打字机逐行追加
      startReveal(added);
    } else {
      renderScreen();                         // 清屏类命令
    }
    S.emit('change');   // 刷新拓扑端口状态/检示器
  }

  /* ---------- 键盘 ---------- */
  function onKey(e) {
    if (inputEl.disabled) return;
    var d = activeDevice(), sess = activeSession();
    if (!d || !sess) return;

    // 输出正在逐字显示：任意键先"快进"到完整内容（Enter 只快进、不提交）
    if (typer) {
      finishReveal();
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); return; }
    }

    // 持续任务（ping -t）运行中：像真实终端一样只接受 Ctrl+C 中断
    if (sess.job) {
      var isBreak = e.ctrlKey && (e.key === 'c' || e.key === 'C');
      if (!isBreak) { e.preventDefault(); return; }
    }

    if (e.key === 'Enter') { e.preventDefault(); submit(inputEl.value); return; }

    if (e.key === 'Tab') {
      e.preventDefault();
      var c = E.complete(d, sess, inputEl.value);
      if (c.type === 'single') {
        var v = inputEl.value, sp = v.lastIndexOf(' ');
        var head = sp >= 0 ? v.substring(0, sp + 1) : '';
        inputEl.value = head + c.value;
      } else if (c.type === 'list') {
        var n1 = countLines(sess.buffer);
        var e1 = { type: 'out', text: c.list.join('   ') };
        sess.buffer.push(e1);
        renderScreen(n1); startReveal([e1]);
      }
      return;
    }

    if (e.key === '?') {
      e.preventDefault();
      inputEl.value += '?';
      var h = E.help(d, sess, inputEl.value);
      var n2 = countLines(sess.buffer);
      var e2 = { type: 'help', text: h };
      sess.buffer.push(e2);
      renderScreen(n2); startReveal([e2]);
      return;
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (!sess.history.length) return;
      if (sess.histIdx < 0) sess.histIdx = sess.history.length - 1;
      else if (sess.histIdx > 0) sess.histIdx--;
      inputEl.value = sess.history[sess.histIdx] || '';
      moveCaretEnd();
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (sess.histIdx < 0) return;
      sess.histIdx++;
      if (sess.histIdx >= sess.history.length) { sess.histIdx = -1; inputEl.value = ''; }
      else inputEl.value = sess.history[sess.histIdx];
      moveCaretEnd();
      return;
    }

    if (e.ctrlKey && (e.key === 'c' || e.key === 'C')) {
      e.preventDefault();
      var nC = countLines(sess.buffer);
      sess.buffer.push({ type: 'in', prompt: E.promptFor(d, sess), text: inputEl.value + '^C' });
      inputEl.value = '';
      var jb = stopJob(sess);                    // 结束持续任务（如 ping -t）
      var tail = [];
      if (jb && jb.stopText && jb.sent) {
        var st = '';
        try { st = jb.stopText(jb); } catch (x) { st = ''; }
        if (st) { var eS = { type: 'out', text: st }; sess.buffer.push(eS); tail.push(eS); }
      }
      renderScreen(nC); startReveal(tail); return;
    }
    if (e.ctrlKey && (e.key === 'l' || e.key === 'L')) {
      e.preventDefault(); stopJob(sess); sess.buffer = []; renderScreen(); return;
    }
  }
  function moveCaretEnd() {
    setTimeout(function () { var n = inputEl.value.length; try { inputEl.setSelectionRange(n, n); } catch (x) {} }, 0);
  }

  function printOut(id, text, type) {
    var s = S.getSession(id); if (!s) return;
    var n = countLines(s.buffer);
    var entry = { type: type || 'out', text: text };
    s.buffer.push(entry);
    if (id === activeDev) { renderScreen(n); startReveal([entry]); }
  }

  H.UI = H.UI || {};
  H.UI.Terminal = {
    init: init, openTab: openTab, refreshTabs: refreshTabs, printOut: printOut,
    renderEmpty: renderEmpty, onActivate: null,
    setTyping: function (on) { TYPE_ON = !!on; if (!on) finishReveal(); },
    isTyping: function () { return !!typer; },
    hasJob: function (id) { var s = S.getSession(id); return !!(s && s.job); },
    stopJob: function (id) { var s = S.getSession(id); return !!stopJob(s); }
  };
})(window.H3C);
