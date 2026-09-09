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
    if (fresh) revealFrom(0);           // 首次打开：登录横幅也逐行"刷"出来
    refreshTabs();
    promptEl.textContent = E.promptFor(d, sess);
    inputEl.disabled = false;
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

  /* ---------- 屏幕渲染 ---------- */
  // 每行一个 .t-line 节点（多行文本按 \n 拆开），便于打字机逐行揭示
  function renderScreen() {
    var sess = activeSession(); if (!sess) { return; }
    finishReveal();               // 渲染会重建 DOM，先结束动画避免持有失效节点
    var html = '';
    sess.buffer.forEach(function (e) {
      var kind = (e.type === 'in') ? 't-in'
        : (e.type === 'err') ? 't-err'
          : (e.type === 'help') ? 't-help'
            : (e.type === 'sys') ? 't-sys' : '';
      var txt = String(e.text == null ? '' : e.text);
      var lines = txt.split('\n');
      for (var i = 0; i < lines.length; i++) {
        var cls = 't-line' + (kind ? ' ' + kind : '');
        if (e.type === 'in' && i === 0) {
          html += '<div class="' + cls + '"><span class="tp">' + esc(e.prompt) + '</span> ' + esc(lines[i]) + '</div>';
        } else {
          html += '<div class="' + cls + '">' + esc(lines[i]) + '</div>';
        }
      }
    });
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
   * 只在 DOM 层把新增行先清空再逐字填回；任意键或点击可立即跳过。
   */
  var TYPE_CPS = 900;       // 每秒字符数
  var TYPE_LINE_GAP = 12;   // 行间额外停顿(ms)
  var TYPE_MAX_MS = 2600;   // 单次输出总时长上限，超出则自动提速
  var TYPE_ON = true;       // 总开关（自动化测试会关闭，保证 DOM 立即可见）
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

  // 从 startIdx 开始的（非回显）行逐字揭示
  function revealFrom(startIdx) {
    finishReveal();
    if (!TYPE_ON || !screenEl) return;
    if (typeof window.requestAnimationFrame !== 'function') return;   // 无 rAF 环境直接跳过
    var nodes = screenEl.children, items = [], i, el, full;
    if (nodes.length - startIdx > 240) return;                        // 超长输出不动画，避免卡顿
    for (i = startIdx; i < nodes.length; i++) {
      el = nodes[i];
      if (!el || String(el.className || '').indexOf('t-in') >= 0) continue;
      full = el.textContent;
      if (!full) continue;              // 空行无需动画
      items.push({ el: el, full: full, pos: 0 });
      el.textContent = '';
    }
    if (!items.length) return;
    var total = 0;
    for (i = 0; i < items.length; i++) total += items[i].full.length;
    var cps = TYPE_CPS;
    var gap = items.length > 40 ? 0 : TYPE_LINE_GAP;   // 超长输出取消行间停顿
    var est = (total / cps) * 1000 + items.length * gap;
    if (est > TYPE_MAX_MS) cps = total / (Math.max(200, TYPE_MAX_MS - items.length * 2) / 1000);
    typer = {
      items: items, idx: 0, cps: Math.max(200, cps),
      gap: 0, gap0: gap,          // gap0=行末停顿基准；首行不停顿
      last: nowMs(), raf: 0, alive: true
    };
    setBusy(true);
    typer.raf = rafFn(step);
  }

  function step(ts) {
    if (!typer || !typer.alive) return;
    var t = (ts == null) ? nowMs() : ts;
    var dt = t - typer.last;
    typer.last = t;
    if (dt < 0) dt = 0;
    if (typer.gap > 0 && typer.idx > 0) {
      typer.gap -= dt;
      if (typer.gap > 0) { typer.raf = rafFn(step); return; }
      dt = -typer.gap; typer.gap = 0;
    }
    var budget = Math.max(1, Math.floor(typer.cps * dt / 1000));
    while (budget > 0 && typer.idx < typer.items.length) {
      var it = typer.items[typer.idx];
      var remain = it.full.length - it.pos;
      if (remain <= budget) {
        it.pos = it.full.length;
        it.el.textContent = it.full;
        budget -= remain;
        typer.idx++;
        typer.gap = typer.gap0;
        break;                          // 行末停顿，等下一帧
      }
      it.pos += budget;
      it.el.textContent = it.full.substring(0, it.pos);
      budget = 0;
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
    for (var i = 0; i < t.items.length; i++) {
      var it = t.items[i];
      if (it.pos < it.full.length) { it.pos = it.full.length; it.el.textContent = it.full; }
    }
    if (screenEl) screenEl.scrollTop = screenEl.scrollHeight;
    setBusy(false);
  }

  /* ---------- 执行 ---------- */
  function submit(raw) {
    var d = activeDevice(), sess = activeSession();
    if (!d || !sess) return;
    var line = String(raw || '');
    var startIdx = countLines(sess.buffer);
    sess.buffer.push({ type: 'in', prompt: E.promptFor(d, sess), text: line });
    if (line.trim() !== '') {
      var r = E.exec(d, sess, line);
      var out = r.out;
      if (Array.isArray(out)) out = out.join('\n');
      sess.buffer.push({ type: r.err ? 'err' : 'out', text: out });
      if (sess.history.indexOf(line) < 0 || sess.history.length === 0) sess.history.push(line);
    }
    sess.histIdx = -1;
    inputEl.value = '';
    promptEl.textContent = E.promptFor(d, sess);
    renderScreen();
    revealFrom(startIdx);               // 逐字逐行揭示本次命令的输出
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

    if (e.key === 'Enter') { e.preventDefault(); submit(inputEl.value); return; }

    if (e.key === 'Tab') {
      e.preventDefault();
      var c = E.complete(d, sess, inputEl.value);
      if (c.type === 'single') {
        var v = inputEl.value, sp = v.lastIndexOf(' ');
        var head = sp >= 0 ? v.substring(0, sp + 1) : '';
        inputEl.value = head + c.value;
      } else if (c.type === 'list') {
        var si1 = countLines(sess.buffer);
        sess.buffer.push({ type: 'out', text: c.list.join('   ') });
        renderScreen();
        revealFrom(si1);
      }
      return;
    }

    if (e.key === '?') {
      e.preventDefault();
      inputEl.value += '?';
      var h = E.help(d, sess, inputEl.value);
      var si2 = countLines(sess.buffer);
      sess.buffer.push({ type: 'help', text: h });
      renderScreen();
      revealFrom(si2);
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
      sess.buffer.push({ type: 'in', prompt: E.promptFor(d, sess), text: inputEl.value + '^C' });
      inputEl.value = ''; renderScreen(); return;
    }
    if (e.ctrlKey && (e.key === 'l' || e.key === 'L')) {
      e.preventDefault(); sess.buffer = []; renderScreen(); return;
    }
  }
  function moveCaretEnd() {
    setTimeout(function () { var n = inputEl.value.length; try { inputEl.setSelectionRange(n, n); } catch (x) {} }, 0);
  }

  function printOut(id, text, type) {
    var s = S.getSession(id); if (!s) return;
    var si = countLines(s.buffer);
    s.buffer.push({ type: type || 'out', text: text });
    if (id === activeDev) { renderScreen(); revealFrom(si); }
  }

  H.UI = H.UI || {};
  H.UI.Terminal = {
    init: init, openTab: openTab, refreshTabs: refreshTabs, printOut: printOut,
    renderEmpty: renderEmpty, onActivate: null,
    setTyping: function (on) { TYPE_ON = !!on; if (!on) finishReveal(); }
  };
})(window.H3C);
