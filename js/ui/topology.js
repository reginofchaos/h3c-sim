/* H3C 网络仿真实验室 - 拓扑画布与交互 */
(function (H) {
  'use strict';
  var SVGNS = 'http://www.w3.org/2000/svg';
  var NW = 150, BH = 50;            // 节点宽度 / 设备主体高度
  var LED_MAX = 22;                 // 节点上最多显示的端口指示灯数量

  var TYPE_COLOR = { switch: '#2563eb', router: '#16a34a', firewall: '#dc2626', pc: '#64748b', server: '#a855f7' };
  var ABBR = { switch: 'SW', router: 'RT', firewall: 'FW', pc: 'PC', server: 'SV' };

  var svg, vp, gNodes, gLinks, gGrid, gLabels, stageTip, stage;
  var sel = null;            // 当前选中设备 id
  var selLink = null;        // 当前选中链路 id
  var view = { scale: 1, tx: 30, ty: 30 };
  var linkMode = false, pendingAuto = null;
  var pendingPort = null;        // 画布端口连线：{ dev, port }
  var drag = null, pan = null;
  var saveTimer = null, linkPop = null, linkLabels = [];

  function el(tag, attrs) {
    var e = document.createElementNS(SVGNS, tag);
    if (attrs) for (var k in attrs) if (attrs.hasOwnProperty(k)) e.setAttribute(k, attrs[k]);
    return e;
  }
  function hexToRgba(hex, a) {
    var h = hex.replace('#', '');
    var r = parseInt(h.substring(0, 2), 16), g = parseInt(h.substring(2, 4), 16), b = parseInt(h.substring(4, 6), 16);
    return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')';
  }
  function trunc(s, n) { s = String(s == null ? '' : s); return s.length > n ? s.substring(0, n - 1) + '…' : s; }
  function textWidth(str, font) {
    if (!textWidth.ctx) textWidth.ctx = document.createElement('canvas').getContext('2d');
    textWidth.ctx.font = font;
    return textWidth.ctx.measureText(str).width;
  }
  function nodeWidth(d) {
    if (d._w != null) return d._w;
    var name = trunc(d.cfg.hostname || d.name || '', 12);
    var model = trunc(d.model || '', 16);
    var w1 = textWidth(name, '700 12px "Segoe UI","Microsoft YaHei",system-ui,sans-serif');
    var w2 = textWidth(model, '9.5px "Segoe UI","Microsoft YaHei",system-ui,sans-serif');
    var w = Math.max(NW, 48 + Math.max(w1, w2) + 16);
    if (w > 280) w = 280;
    d._w = Math.round(w);
    return d._w;
  }
  function statusColor(s) {
    return s === 'up' ? '#22c55e' : s === 'block' ? '#f59e0b' : s === 'down' ? '#ef4444' : '#3a4250';
  }
  function portStatus(dev, name) {
    if (!H.State.portLinked(dev.id, name)) return 'none';
    if (!H.Sim.portPhysUp(dev, name)) return 'down';
    if (H.Sim.isSerialPort && H.Sim.isSerialPort(dev, name) && !H.Sim.linkProtocolUp(dev, name)) return 'down';
    if (!H.Sim.portUp(dev, name)) return 'block';
    return 'up';
  }
  function linkStatus(sa, sb) {
    if (sa === 'up' && sb === 'up') return 'up';
    if (sa === 'block' || sb === 'block') return 'block';
    return 'down';
  }
  function dirOf(side) {
    return side === 'L' ? { x: -1, y: 0 } : side === 'R' ? { x: 1, y: 0 } : side === 'T' ? { x: 0, y: -1 } : { x: 0, y: 1 };
  }
  function edgePoint(x, y, w, h, tx, ty) {
    var cx = x + w / 2, cy = y + h / 2, dx = tx - cx, dy = ty - cy;
    if (dx === 0 && dy === 0) return { x: cx, y: cy, side: 'R' };
    var hw = w / 2, hh = h / 2;
    var sc = 1 / Math.max(Math.abs(dx) / hw, Math.abs(dy) / hh);
    var ex = cx + dx * sc, ey = cy + dy * sc;
    var side = (Math.abs(dx) / hw >= Math.abs(dy) / hh) ? (dx > 0 ? 'R' : 'L') : (dy > 0 ? 'B' : 'T');
    return { x: ex, y: ey, side: side };
  }
  /* 正交（曼哈顿）折线路由：两侧各伸出一段 stub，再在中间以水平/竖直折线连接 */
  function orthoRoute(ea, eb) {
    var o = 16;
    var d1 = dirOf(ea.side), d2 = dirOf(eb.side);
    var e1 = { x: ea.x + d1.x * o, y: ea.y + d1.y * o };
    var e2 = { x: eb.x + d2.x * o, y: eb.y + d2.y * o };
    if (ea.side === 'L' || ea.side === 'R') {
      if (eb.side === 'L' || eb.side === 'R') {
        var mx = (e1.x + e2.x) / 2;
        return [ea, e1, { x: mx, y: e1.y }, { x: mx, y: e2.y }, e2, eb];
      }
      return [ea, e1, { x: e2.x, y: e1.y }, e2, eb];
    } else {
      if (eb.side === 'T' || eb.side === 'B') {
        var my = (e1.y + e2.y) / 2;
        return [ea, e1, { x: e1.x, y: my }, { x: e2.x, y: my }, e2, eb];
      }
      return [ea, e1, { x: e1.x, y: e2.y }, e2, eb];
    }
  }
  /* 带圆角的折线 path（正交路由视觉更柔和） */
  function roundedPath(pts, r) {
    if (pts.length < 2) return '';
    var d = 'M' + pts[0].x.toFixed(1) + ',' + pts[0].y.toFixed(1);
    for (var i = 1; i < pts.length - 1; i++) {
      var p0 = pts[i - 1], p1 = pts[i], p2 = pts[i + 1];
      var v1 = { x: p0.x - p1.x, y: p0.y - p1.y }, v2 = { x: p2.x - p1.x, y: p2.y - p1.y };
      var l1 = Math.sqrt(v1.x * v1.x + v1.y * v1.y), l2 = Math.sqrt(v2.x * v2.x + v2.y * v2.y);
      if (l1 < 0.01 || l2 < 0.01) { d += ' L' + p1.x.toFixed(1) + ',' + p1.y.toFixed(1); continue; }
      var rr = Math.min(r, l1 / 2, l2 / 2);
      var a1 = { x: p1.x + v1.x / l1 * rr, y: p1.y + v1.y / l1 * rr };
      var a2 = { x: p1.x + v2.x / l2 * rr, y: p1.y + v2.y / l2 * rr };
      d += ' L' + a1.x.toFixed(1) + ',' + a1.y.toFixed(1) + ' Q' + p1.x.toFixed(1) + ',' + p1.y.toFixed(1) + ' ' + a2.x.toFixed(1) + ',' + a2.y.toFixed(1);
    }
    var last = pts[pts.length - 1];
    d += ' L' + last.x.toFixed(1) + ',' + last.y.toFixed(1);
    return d;
  }
  function linkGeom(l) {
    var da = H.State.getDevice(l.a.dev), db = H.State.getDevice(l.b.dev);
    if (!da || !db) return null;
    var wa = da._w || NW, wb = db._w || NW;
    var ea = edgePoint(da.x, da.y, wa, BH, db.x + wb / 2, db.y + BH / 2);
    var eb = edgePoint(db.x, db.y, wb, BH, da.x + wa / 2, da.y + BH / 2);
    var route = orthoRoute(ea, eb);
    return { d: roundedPath(route, 10), mid: route[Math.floor(route.length / 2)] };
  }

  /* ---------- 坐标转换 ---------- */
  function toLocal(e) {
    var pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
    var m = vp.getScreenCTM().inverse();
    return pt.matrixTransform(m);
  }

  /* ---------- 视图 ---------- */
  function applyView() {
    vp.setAttribute('transform', 'translate(' + view.tx + ',' + view.ty + ') scale(' + view.scale + ')');
    var zl = document.getElementById('zoom-label');
    if (zl) zl.textContent = Math.round(view.scale * 100) + '%';
  }
  function saveView() {
    H.State.S.meta.scale = view.scale; H.State.S.meta.tx = view.tx; H.State.S.meta.ty = view.ty;
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(function () { H.State.saveLocal(); }, 400);
  }
  function zoomAt(cx, cy, ns) {
    ns = Math.max(0.2, Math.min(3, ns));
    var x = (cx - view.tx) / view.scale, y = (cy - view.ty) / view.scale;
    view.tx = cx - ns * x; view.ty = cy - ns * y; view.scale = ns;
    applyView(); saveView();
  }

  /* ---------- 渲染 ---------- */
  function render() {
    if (!gNodes) return;
    gNodes.innerHTML = ''; gLinks.innerHTML = ''; if (gLabels) gLabels.innerHTML = '';
    var devs = H.State.S.devices, links = H.State.S.links;
    devs.forEach(function (d) { d._w = null; nodeWidth(d); });
    linkLabels = [];
    links.forEach(drawLink);
    devs.forEach(drawNode);
    drawLinkLabels();
    if (stageTip) stageTip.style.display = devs.length ? 'none' : '';
    if (selLink) { /* 保持选中态由 drawLink 处理 */ }
  }

  function drawNode(d) {
    var w = nodeWidth(d);
    var g = el('g', { 'class': d.id === sel ? 'node selected' : 'node', 'data-id': d.id, transform: 'translate(' + d.x + ',' + d.y + ')' });
    var col = TYPE_COLOR[d.type] || '#475569';
    g.appendChild(el('rect', { 'class': 'body', x: 0, y: 0, width: w, height: BH, rx: 9, ry: 9, fill: hexToRgba(col, 0.16), stroke: col, 'stroke-width': 1.6 }));
    g.appendChild(el('rect', { x: 10, y: 9, width: 30, height: 18, rx: 4, fill: col, opacity: 0.92 }));
    var ico = el('text', { x: 25, y: 22, 'text-anchor': 'middle', fill: '#fff', 'font-size': 10, 'font-weight': 700 });
    ico.textContent = ABBR[d.type] || '?'; g.appendChild(ico);
    var t1 = el('text', { 'class': 'dev-label', x: 48, y: 20 }); t1.textContent = trunc(d.cfg.hostname || d.name, 12); g.appendChild(t1);
    var t2 = el('text', { 'class': 'dev-model', x: 48, y: 35 }); t2.textContent = trunc(d.model, 16); g.appendChild(t2);
    // 端口指示灯
    var startY = BH + 9, ports = d.ports, n = Math.min(ports.length, LED_MAX);
    for (var i = 0; i < n; i++) {
      var p = ports[i], s = portStatus(d, p.name);
      var isPending = pendingPort && pendingPort.dev === d.id && pendingPort.port === p.name;
      var dot = el('circle', { 'class': 'port-dot' + (isPending ? ' pending' : ''), cx: 9 + i * 6 + 3, cy: startY, r: 3, fill: statusColor(s), stroke: '#0a0e14', 'stroke-width': 1 });
      dot.setAttribute('data-port', p.name);
      g.appendChild(dot);
      var hitDot = el('circle', { 'class': 'port-dot-hit', cx: 9 + i * 6 + 3, cy: startY, r: 6, fill: 'transparent' });
      hitDot.setAttribute('data-port', p.name);
      g.appendChild(hitDot);
    }
    if (ports.length > LED_MAX) {
      var more = el('text', { 'class': 'badge', x: 9 + n * 6 + 3, y: startY + 4 }); more.textContent = '+' + (ports.length - LED_MAX); g.appendChild(more);
    }
    var lc = H.State.linksOf(d.id).length;
    var badge = el('text', { 'class': 'badge', x: w - 8, y: 14, 'text-anchor': 'end' }); badge.textContent = lc ? (lc + '↗') : ''; g.appendChild(badge);
    gNodes.appendChild(g);
  }

  function drawLink(l) {
    var da = H.State.getDevice(l.a.dev), db = H.State.getDevice(l.b.dev);
    if (!da || !db) return;
    var sa = portStatus(da, l.a.port), sb = portStatus(db, l.b.port);
    var st = linkStatus(sa, sb), col = statusColor(st);
    var g = linkGeom(l); if (!g) return;
    var seld = (l.id === selLink);
    var hit = el('path', { 'class': 'link-hit', d: g.d });
    hit.setAttribute('data-link', l.id);
    var line = el('path', { 'class': 'link-line' + (seld ? ' sel' : ''), d: g.d, stroke: col, 'data-link': l.id });
    gLinks.appendChild(hit); gLinks.appendChild(line);
    if (seld) {
      linkLabels.push({ x: g.mid.x, y: g.mid.y - 5, text: trunc(l.a.port, 11) + ' ⇔ ' + trunc(l.b.port, 11) });
    }
  }
  function drawLinkLabels() {
    if (!gLabels) return;
    linkLabels.forEach(function (lbl) {
      var lab = el('text', { 'class': 'link-label', x: lbl.x, y: lbl.y, 'text-anchor': 'middle' });
      lab.textContent = lbl.text;
      gLabels.appendChild(lab);
    });
  }
  /* ---------- 拖拽时同步重绘与该设备相关的连线 ---------- */
  function updateLinks(devId) {
    if (!gLinks) return;
    var links = H.State.S.links;
    for (var i = 0; i < links.length; i++) {
      var l = links[i];
      if (l.a.dev !== devId && l.b.dev !== devId) continue;
      var g = linkGeom(l); if (!g) continue;
      var hit = gLinks.querySelector('.link-hit[data-link="' + l.id + '"]');
      var line = gLinks.querySelector('.link-line[data-link="' + l.id + '"]');
      if (hit) hit.setAttribute('d', g.d);
      if (line) line.setAttribute('d', g.d);
    }
  }

  /* ---------- 选中 ---------- */
  function select(id) {
    sel = id; selLink = null; hideLinkPop();
    render(); updateNodeActions();
    if (H.UI.Topology.onSelect) H.UI.Topology.onSelect(id);
  }
  function setSelected(id) { sel = id; selLink = null; hideLinkPop(); render(); updateNodeActions(); }

  /* ---------- 删除选中设备 ---------- */
  function removeSelected() {
    if (!sel) return;
    var d = H.State.getDevice(sel); if (!d) return;
    if (!window.confirm('确认删除设备 ' + (d.cfg.hostname || d.name) + '？')) return;
    H.State.removeDevice(sel);
    if (H.UI.Terminal) H.UI.Terminal.refreshTabs();
    setSelected(null);
  }
  function updateNodeActions() {
    var na = document.getElementById('node-actions');
    if (na) na.style.display = sel ? 'block' : 'none';
  }
  function onKeyDown(e) {
    if (e.key === 'Delete' || e.key === 'Backspace') {
      var ae = document.activeElement;
      if (ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA')) return;
      if (sel) { e.preventDefault(); removeSelected(); }
    }
  }

  /* ---------- 连线模式（自动选端口） ---------- */
  function freePort(dev) {
    for (var i = 0; i < dev.ports.length; i++) {
      var p = dev.ports[i];
      if (p.type === 'Serial') continue;
      if (!H.State.portLinked(dev.id, p.name)) return p.name;
    }
    return null;
  }
  function autoLink(aId, bId) {
    var a = H.State.getDevice(aId), b = H.State.getDevice(bId);
    var pa = freePort(a), pb = freePort(b);
    if (!pa || !pb) { toast('没有可用空闲端口用于自动连线'); return; }
    var r = H.State.addLink(aId, pa, bId, pb);
    if (r.err) toast(r.err); else toast('已连线 ' + a.cfg.hostname + ' ' + pa + ' ⇔ ' + b.cfg.hostname + ' ' + pb);
  }
  function setLinkMode(on) {
    linkMode = on; pendingAuto = null;
    if (svg) svg.classList.toggle('linking', on);
    if (H.UI.Topology.onLinkMode) H.UI.Topology.onLinkMode(on);
    if (on) toast('连线模式：依次点击两个设备即可自动连线（再次点击按钮退出）');
    render();
  }

  /* ---------- 鼠标交互 ---------- */
  function onMouseDown(e) {
    var cls = e.target.getAttribute ? (e.target.getAttribute('class') || '') : '';
    if (cls.indexOf('port-dot') >= 0) { e.preventDefault(); return; } // 端口点由 onClick 处理连线
    var nodeEl = e.target.closest ? e.target.closest('.node') : null;
    if (nodeEl) {
      var id = nodeEl.getAttribute('data-id');
      if (linkMode) {
        if (!pendingAuto) pendingAuto = id;
        else if (pendingAuto !== id) { autoLink(pendingAuto, id); pendingAuto = null; setLinkMode(false); }
        else pendingAuto = null;
        e.preventDefault(); return;
      }
      var d = H.State.getDevice(id); if (!d) return;
      var loc = toLocal(e);
      drag = { id: id, offx: loc.x - d.x, offy: loc.y - d.y, moved: false, sx: e.clientX, sy: e.clientY };
    } else {
      // 背景：平移
      pan = { sx: e.clientX, sy: e.clientY, tx: view.tx, ty: view.ty };
      svg.classList.add('panning');
    }
  }
  function onMouseMove(e) {
    if (drag) {
      var loc = toLocal(e);
      var d = H.State.getDevice(drag.id); if (!d) return;
      d.x = Math.round(loc.x - drag.offx); d.y = Math.round(loc.y - drag.offy);
      var g = gNodes.querySelector('.node[data-id="' + drag.id + '"]');
      if (g) g.setAttribute('transform', 'translate(' + d.x + ',' + d.y + ')');
      updateLinks(drag.id);
      if (Math.abs(e.clientX - drag.sx) > 4 || Math.abs(e.clientY - drag.sy) > 4) drag.moved = true;
    } else if (pan) {
      view.tx = pan.tx + (e.clientX - pan.sx); view.ty = pan.ty + (e.clientY - pan.sy);
      applyView();
    }
  }
  function onMouseUp(e) {
    if (drag) {
      if (!drag.moved) select(drag.id);
      else saveView();
      drag = null;
    }
    if (pan) { pan = null; svg.classList.remove('panning'); saveView(); }
  }
  function onWheel(e) {
    e.preventDefault();
    var r = svg.getBoundingClientRect();
    var cx = e.clientX - r.left, cy = e.clientY - r.top;
    zoomAt(cx, cy, view.scale * (e.deltaY < 0 ? 1.1 : 0.9));
  }
  function onClick(e) {
    var linkEl = e.target.closest ? e.target.closest('.link-hit') : null;
    if (linkEl) { selLink = linkEl.getAttribute('data-link'); render(); showLinkPop(selLink, e); return; }
    var cls = e.target.getAttribute ? (e.target.getAttribute('class') || '') : '';
    if (cls.indexOf('port-dot') >= 0) { onPortDotClick(e); return; }
    if (e.target.closest && e.target.closest('.node')) return; // 由 mousedown/up 处理
    // 点击空白：取消选中
    if (sel || selLink) { sel = null; selLink = null; hideLinkPop(); render(); }
  }

  /* ---------- 画布端口 → 端口 连线 ---------- */
  function onPortDotClick(e) {
    var dot = e.target;
    var nodeG = dot.closest ? dot.closest('.node') : null;
    if (!nodeG) return;
    var devId = nodeG.getAttribute('data-id');
    var port = dot.getAttribute('data-port');
    var dev = H.State.getDevice(devId); if (!dev) return;
    if (!pendingPort) {
      pendingPort = { dev: devId, port: port };
      render(); showPortHint(dev.cfg.hostname + ' ' + port);
      toast('已选起点 ' + dev.cfg.hostname + ' ' + port + '，请点击另一设备的端口完成连线');
    } else if (pendingPort.dev === devId && pendingPort.port === port) {
      pendingPort = null; render(); hidePortHint();
    } else {
      var a = pendingPort, devA = H.State.getDevice(a.dev);
      pendingPort = null; render(); hidePortHint();
      var r = H.State.addLink(a.dev, a.port, devId, port);
      if (r.err) toast(r.err);
      else toast('已连接 ' + (devA ? devA.cfg.hostname : a.dev) + ' ' + a.port + ' ⇔ ' + dev.cfg.hostname + ' ' + port);
    }
  }
  function showPortHint(txt) {
    var b = document.getElementById('linking-banner');
    if (b) { b.style.display = 'block'; b.textContent = '端口连线中：已选 ' + txt + '，请点击另一端设备的端口完成（再次点击起点取消）。'; }
  }
  function hidePortHint() { var b = document.getElementById('linking-banner'); if (b) b.style.display = 'none'; }

  /* ---------- 链路信息浮窗 ---------- */
  function showLinkPop(linkId, e) {
    var l = H.State.getLink(linkId); if (!l) return;
    var da = H.State.getDevice(l.a.dev), db = H.State.getDevice(l.b.dev);
    hideLinkPop();
    var box = document.createElement('div');
    box.className = 'link-pop';
    box.style.cssText = 'position:absolute;z-index:30;background:#161c26;border:1px solid #2a3340;border-radius:8px;padding:10px 12px;font-size:12px;min-width:200px;box-shadow:0 8px 24px rgba(0,0,0,.5)';
    var sa = portStatus(da, l.a.port), sb = portStatus(db, l.b.port), st = linkStatus(sa, sb);
    var stTxt = st === 'up' ? 'UP' : st === 'block' ? 'STP 阻塞' : 'DOWN';
    box.innerHTML =
      '<div style="font-weight:700;margin-bottom:6px">' + esc(da.cfg.hostname) + ' ⇔ ' + esc(db.cfg.hostname) + '</div>' +
      '<div style="color:#cbd5e1;font-family:Consolas,monospace">' + esc(l.a.port) + '</div>' +
      '<div style="color:#64748b;margin:2px 0 6px">⇕</div>' +
      '<div style="color:#cbd5e1;font-family:Consolas,monospace">' + esc(l.b.port) + '</div>' +
      '<div style="margin-top:8px">状态：<b style="color:' + statusColor(st) + '">' + stTxt + '</b></div>' +
      '<div style="margin-top:8px;text-align:right"><span class="lc-del" style="color:#ef4444;cursor:pointer">删除链路</span></div>';
    box.querySelector('.lc-del').addEventListener('click', function () {
      H.State.removeLink(linkId); hideLinkPop();
    });
    stage.appendChild(box);
    var r = svg.getBoundingClientRect(), sr = stage.getBoundingClientRect();
    var px = (e ? e.clientX : r.left + r.width / 2) - sr.left + 12;
    var py = (e ? e.clientY : r.top + r.height / 2) - sr.top + 12;
    box.style.left = Math.min(px, sr.width - 230) + 'px';
    box.style.top = Math.min(py, sr.height - 140) + 'px';
    linkPop = box;
  }
  function hideLinkPop() { if (linkPop && linkPop.parentNode) linkPop.parentNode.removeChild(linkPop); linkPop = null; }

  /* ---------- 提示 ---------- */
  function toast(msg) {
    var t = document.createElement('div');
    t.textContent = msg;
    t.style.cssText = 'position:absolute;left:50%;bottom:16px;transform:translateX(-50%);background:rgba(37,99,235,.92);color:#fff;padding:7px 14px;border-radius:20px;font-size:12px;z-index:40;box-shadow:0 6px 18px rgba(0,0,0,.4)';
    stage.appendChild(t);
    setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 2200);
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  /* ---------- 缩放/适应 ---------- */
  function fit() {
    var devs = H.State.S.devices;
    if (!devs.length) { view = { scale: 1, tx: 30, ty: 30 }; applyView(); return; }
    var minx = 1e9, miny = 1e9, maxx = -1e9, maxy = -1e9;
    devs.forEach(function (d) {
      minx = Math.min(minx, d.x); miny = Math.min(miny, d.y);
      maxx = Math.max(maxx, d.x + (d._w || NW)); maxy = Math.max(maxy, d.y + BH + 16);
    });
    var w = maxx - minx, h = maxy - miny, sw = svg.clientWidth, sh = svg.clientHeight;
    var s = Math.min((sw - 60) / w, (sh - 60) / h, 1.4); if (s < 0.2) s = 0.2;
    view.scale = s; view.tx = (sw - w * s) / 2 - minx * s; view.ty = (sh - h * s) / 2 - miny * s;
    applyView(); saveView();
  }

  /* ---------- 初始化 ---------- */
  function init() {
    svg = document.getElementById('topo');
    vp = document.getElementById('viewport');
    gNodes = document.getElementById('layer-nodes');
    gLinks = document.getElementById('layer-links');
    gGrid = document.getElementById('layer-grid');
    gLabels = document.getElementById('layer-labels');
    stage = document.getElementById('stage');
    stageTip = document.getElementById('stage-tip');
    var m = H.State.S.meta;
    view = { scale: m.scale || 1, tx: (m.tx != null ? m.tx : 30), ty: (m.ty != null ? m.ty : 30) };
    drawGrid();
    applyView();
    svg.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    svg.addEventListener('click', onClick);
    svg.addEventListener('wheel', onWheel, { passive: false });
    var na = document.getElementById('node-actions');
    if (na) { var nd = document.getElementById('node-del'); if (nd) nd.addEventListener('click', removeSelected); }
    window.addEventListener('keydown', onKeyDown);
    updateNodeActions();
  }
  function drawGrid() {
    if (!gGrid) return;
    gGrid.innerHTML = '';
    for (var x = 0; x < 60; x++) for (var y = 0; y < 40; y++) {
      gGrid.appendChild(el('circle', { 'class': 'grid-dot', cx: x * 40, cy: y * 40, r: 1 }));
    }
  }

  H.UI = H.UI || {};
  H.UI.Topology = {
    init: init, render: render, select: select, setSelected: setSelected,
    fit: fit, zoomBy: function (f) { zoomAt(svg.clientWidth / 2, svg.clientHeight / 2, view.scale * f); },
    setLinkMode: setLinkMode, isLinkMode: function () { return linkMode; },
    getSelected: function () { return sel; }, onSelect: null, onLinkMode: null
  };
})(window.H3C);
