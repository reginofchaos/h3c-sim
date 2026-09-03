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
    if (!sess.started) { printBanner(d, sess); sess.started = true; }
    renderScreen();
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
  function renderScreen() {
    var sess = activeSession(); if (!sess) { return; }
    var html = '';
    sess.buffer.forEach(function (e) {
      if (e.type === 'in') {
        html += '<div class="t-in"><span class="tp">' + esc(e.prompt) + '</span> ' + esc(e.text) + '</div>';
      } else if (e.type === 'err') {
        html += '<div class="t-err">' + esc(e.text) + '</div>';
      } else if (e.type === 'help') {
        html += '<div class="t-help">' + esc(e.text) + '</div>';
      } else if (e.type === 'sys') {
        html += '<div class="t-sys">' + esc(e.text) + '</div>';
      } else {
        html += '<div>' + esc(e.text) + '</div>';
      }
    });
    screenEl.innerHTML = html;
    screenEl.scrollTop = screenEl.scrollHeight;
  }

  /* ---------- 执行 ---------- */
  function submit(raw) {
    var d = activeDevice(), sess = activeSession();
    if (!d || !sess) return;
    var line = String(raw || '');
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
    S.emit('change');   // 刷新拓扑端口状态/检示器
  }

  /* ---------- 键盘 ---------- */
  function onKey(e) {
    if (inputEl.disabled) return;
    var d = activeDevice(), sess = activeSession();
    if (!d || !sess) return;

    if (e.key === 'Enter') { e.preventDefault(); submit(inputEl.value); return; }

    if (e.key === 'Tab') {
      e.preventDefault();
      var c = E.complete(d, sess, inputEl.value);
      if (c.type === 'single') {
        var v = inputEl.value, sp = v.lastIndexOf(' ');
        var head = sp >= 0 ? v.substring(0, sp + 1) : '';
        inputEl.value = head + c.value;
      } else if (c.type === 'list') {
        sess.buffer.push({ type: 'out', text: c.list.join('   ') });
        renderScreen();
      }
      return;
    }

    if (e.key === '?') {
      e.preventDefault();
      inputEl.value += '?';
      var h = E.help(d, sess, inputEl.value);
      sess.buffer.push({ type: 'help', text: h });
      renderScreen();
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
    s.buffer.push({ type: type || 'out', text: text });
    if (id === activeDev) renderScreen();
  }

  H.UI = H.UI || {};
  H.UI.Terminal = {
    init: init, openTab: openTab, refreshTabs: refreshTabs, printOut: printOut,
    renderEmpty: renderEmpty, onActivate: null
  };
})(window.H3C);
