/* H3C 网络仿真实验室 - 拓扑画布与交互 */
(function (H) {
  'use strict';
  var SVGNS = 'http://www.w3.org/2000/svg';
  var NW = 150, BH = 50;            // 节点宽度 / 设备主体高度
  var LED_MAX = 22;                 // 节点上最多显示的端口指示灯数量

  var TYPE_COLOR = { switch: '#2563eb', router: '#16a34a', firewall: '#dc2626', pc: '#64748b', server: '#a855f7' };
  var ABBR = { switch: 'SW', router: 'RT', firewall: 'FW', pc: 'PC', server: 'SV' };

  var PAR_GAP = 14, PAR_MAX = 18;  // 同一对设备之间多条连线的平行间距 / 最大偏移
  var svg, vp, gNodes, gLinks, gGrid, gLabels, gGhost, stageTip, stage, tip;
  var sel = null;            // 当前选中设备 id
  var selLink = null;        // 当前选中链路 id
  var view = { scale: 1, tx: 30, ty: 30 };
  var linkMode = false, pendingAuto = null;
  var pendingPort = null;        // 画布端口连线：{ dev, port }
  var drag = null, pan = null;
  var saveTimer = null, linkPop = null, linkLabels = [];
  var parMap = {};               // linkId -> 平行偏移量（同一设备对多条连线错开）
  var ghostPath = null, ghostDot = null, mouseLocal = null;  // 端口连线跟随鼠标的虚线

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
    var w = Math.max(NW, 48 + Math.max(w1, w2) + 32);   // 右侧预留连线数量徽标位置
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
  /* ---------- 同一对设备之间的多条连线：平行错开，避免完全重叠 ---------- */
  function buildParMap() {
    parMap = {};
    var groups = {}, order = [];
    H.State.S.links.forEach(function (l) {
      var k = (l.a.dev < l.b.dev) ? (l.a.dev + '|' + l.b.dev) : (l.b.dev + '|' + l.a.dev);
      if (!groups[k]) { groups[k] = []; order.push(k); }
      groups[k].push(l.id);
    });
    order.forEach(function (k) {
      var ids = groups[k], n = ids.length;
      if (n < 2) return;
      var step = Math.min(PAR_GAP, (2 * PAR_MAX) / (n - 1));
      for (var i = 0; i < n; i++) parMap[ids[i]] = (i - (n - 1) / 2) * step;
    });
  }
  function clampAbs(v, m) { return v > m ? m : (v < -m ? -m : v); }
  /* 将折线整体沿 A→B 的法向平移 t；两端锚点只沿所在边框滑动，保证不脱离设备 */
  function parallelShift(pts, t, ea, eb, wa, wb) {
    var n = pts.length;
    var a = pts[0], b = pts[n - 1];
    var vx = b.x - a.x, vy = b.y - a.y, vl = Math.sqrt(vx * vx + vy * vy) || 1;
    var nx = -vy / vl, ny = vx / vl;
    var out = [];
    for (var i = 0; i < n; i++) {
      var dx = nx * t, dy = ny * t;
      if (i === 0) {
        if (ea.side === 'L' || ea.side === 'R') { dx = 0; dy = clampAbs(dy, BH / 2 - 6); }
        else { dy = 0; dx = clampAbs(dx, wa / 2 - 6); }
      } else if (i === n - 1) {
        if (eb.side === 'L' || eb.side === 'R') { dx = 0; dy = clampAbs(dy, BH / 2 - 6); }
        else { dy = 0; dx = clampAbs(dx, wb / 2 - 6); }
      }
      out.push({ x: pts[i].x + dx, y: pts[i].y + dy });
    }
    return out;
  }
  function linkGeom(l) {
    var da = H.State.getDevice(l.a.dev), db = H.State.getDevice(l.b.dev);
    if (!da || !db) return null;
    var wa = da._w || NW, wb = db._w || NW;
    var ea = edgePoint(da.x, da.y, wa, BH, db.x + wb / 2, db.y + BH / 2);
    var eb = edgePoint(db.x, db.y, wb, BH, da.x + wa / 2, da.y + BH / 2);
    var route = orthoRoute(ea, eb);
    var t = parMap[l.id] || 0;
    if (t) route = parallelShift(route, t, ea, eb, wa, wb);
    return { d: roundedPath(route, 10), mid: route[Math.floor(route.length / 2)] };
  }

  /* ---------- 坐标转换 ---------- */
  function toLocal(e) {
    if (svg.createSVGPoint && vp.getScreenCTM) {
      var m = vp.getScreenCTM();
      if (m) {
        var pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
        return pt.matrixTransform(m.inverse());
      }
    }
    // 兜底：拿不到 CTM（如 SVG 未渲染/被隐藏）时用画布矩形 + 视图变换手动换算
    var r = svg.getBoundingClientRect();
    return { x: (e.clientX - r.left - view.tx) / view.scale, y: (e.clientY - r.top - view.ty) / view.scale };
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
    buildParMap();
    hideTip();
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
    if (lc) drawLinkBadge(g, w, lc);
    gNodes.appendChild(g);
  }
  /* 已连线数量徽标：胶囊形（未读消息角标风格），沿用品牌蓝而非红色 */
  function drawLinkBadge(g, w, n) {
    var txt = n > 99 ? '99+' : String(n);
    var hgt = 15, padX = 6, cw = 6.2;
    var wd = Math.max(hgt, txt.length * cw + padX * 2);
    var x = w - 7 - wd, y = 6;
    var bg = el('g', { 'class': 'link-badge' });
    bg.appendChild(el('rect', { x: x, y: y, width: wd.toFixed(1), height: hgt, rx: hgt / 2, ry: hgt / 2 }));
    var t = el('text', { x: (x + wd / 2).toFixed(1), y: y + hgt / 2 + 3.5, 'text-anchor': 'middle', 'font-size': 9.5, 'font-weight': 700 });
    t.textContent = txt;
    bg.appendChild(t);
    g.appendChild(bg);
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
    if (e.key === 'Escape') {
      if (pendingPort) { pendingPort = null; clearGhost(); hidePortHint(); render(); return; }
      if (linkMode) { setLinkMode(false); return; }
    }
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
    if (svg && vp) { try { mouseLocal = toLocal(e); } catch (err) { mouseLocal = null; } }
    if (pendingPort) updateGhost();
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
      else { saveView(); resetColumn(); }   // 手动移动设备后，列游标作废重算
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

  /* ---------- 画布端口 → 端口 连线（含跟随鼠标的虚线） ---------- */
  function portPos(dev, portName) {
    var idx = -1;
    for (var i = 0; i < dev.ports.length; i++) if (dev.ports[i].name === portName) { idx = i; break; }
    if (idx < 0) return { x: dev.x, y: dev.y + BH };
    if (idx >= LED_MAX) idx = LED_MAX - 1;
    return { x: dev.x + 12 + idx * 6, y: dev.y + BH + 9 };
  }
  function clearGhost() {
    if (gGhost) gGhost.innerHTML = '';
    ghostPath = null; ghostDot = null;
  }
  function updateGhost() {
    if (!gGhost) return;
    if (!pendingPort) { clearGhost(); return; }
    var dev = H.State.getDevice(pendingPort.dev);
    if (!dev) { clearGhost(); return; }
    var p0 = portPos(dev, pendingPort.port);
    var p1 = mouseLocal || { x: p0.x + 46, y: p0.y + 34 };
    if (!ghostPath) {
      ghostPath = el('path', { 'class': 'link-ghost' });
      gGhost.appendChild(ghostPath);
    }
    ghostPath.setAttribute('d', 'M' + p0.x.toFixed(1) + ',' + p0.y.toFixed(1) + ' L' + p1.x.toFixed(1) + ',' + p1.y.toFixed(1));
    if (!ghostDot) { ghostDot = el('circle', { 'class': 'ghost-dot', r: 3.5 }); gGhost.appendChild(ghostDot); }
    ghostDot.setAttribute('cx', p1.x.toFixed(1));
    ghostDot.setAttribute('cy', p1.y.toFixed(1));
  }
  function onPortDotClick(e) {
    var dot = e.target;
    var nodeG = dot.closest ? dot.closest('.node') : null;
    if (!nodeG) return;
    var devId = nodeG.getAttribute('data-id');
    var port = dot.getAttribute('data-port');
    var dev = H.State.getDevice(devId); if (!dev) return;
    if (!pendingPort) {
      pendingPort = { dev: devId, port: port };
      render(); updateGhost(); showPortHint(dev.cfg.hostname + ' ' + port);
      toast('已选起点 ' + dev.cfg.hostname + ' ' + port + '，请点击另一设备的端口完成连线（Esc 取消）');
    } else if (pendingPort.dev === devId && pendingPort.port === port) {
      pendingPort = null; clearGhost(); render(); hidePortHint();
    } else {
      var a = pendingPort, devA = H.State.getDevice(a.dev);
      pendingPort = null; clearGhost(); render(); hidePortHint();
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

  /* ---------- 悬浮信息小窗（设备 / 端口 / 链路） ---------- */
  function portBrief(dev, name) {
    var f = dev.cfg.ifaces && dev.cfg.ifaces[name]; if (!f) return '';
    var U = H.U;
    if (f.mode === 'route') return f.ip ? ('三层 ' + f.ip.addr + '/' + U.maskLen(f.ip.mask)) : '三层路由口';
    if (f.linkType === 'access') return 'Access VLAN ' + (f.accessVlan || 1);
    if (f.linkType === 'trunk') return 'Trunk ' + (f.permitVlans ? U.vlanListText(f.permitVlans) : '全部');
    if (f.linkType === 'hybrid') return 'Hybrid';
    return '';
  }
  function stTxt(s) { return s === 'up' ? 'UP' : s === 'block' ? 'STP 阻塞' : s === 'down' ? 'DOWN' : '空闲'; }
  function devTipHtml(id) {
    var d = H.State.getDevice(id); if (!d) return '';
    var col = TYPE_COLOR[d.type] || '#475569';
    var ls = H.State.linksOf(id);
    var ips = [], upN = 0, U = H.U;
    for (var i = 0; i < d.ports.length; i++) {
      var pn = d.ports[i].name;
      var f = d.cfg.ifaces && d.cfg.ifaces[pn];
      if (f && f.ip && f.ip.addr && ips.length < 3) ips.push(pn + ' ' + f.ip.addr + '/' + U.maskLen(f.ip.mask));
      if (portStatus(d, pn) === 'up') upN++;
    }
    var vlanN = d.cfg.vlans ? Object.keys(d.cfg.vlans).length : 0;
    var h = '<div class="tt-h"><i style="background:' + col + '">' + esc(ABBR[d.type] || '?') + '</i>' + esc(d.cfg.hostname || d.name) + '</div>';
    h += '<div class="tt-sub">' + esc(d.model) + ' · ' + esc(H.Model.typeName(d.type)) + (d.l3 ? ' · 三层' : ' · 二层') + '</div>';
    h += '<div class="tt-kv"><span>端口</span><b>' + d.ports.length + ' 个（UP ' + upN + '）</b></div>';
    h += '<div class="tt-kv"><span>链路</span><b>' + ls.length + ' 条</b></div>';
    h += '<div class="tt-kv"><span>VLAN</span><b>' + (vlanN ? vlanN + ' 个' : '未配置') + '</b></div>';
    if (ips.length) h += '<div class="tt-ips">' + ips.map(function (s) { return '<div>' + esc(s) + '</div>'; }).join('') + '</div>';
    else h += '<div class="tt-mut">尚未配置 IP 地址</div>';
    h += '<div class="tt-mut">点击选中 · 拖拽移动 · 点端口圆点连线</div>';
    return h;
  }
  function portTipHtml(devId, portName) {
    var d = H.State.getDevice(devId); if (!d) return '';
    var st = portStatus(d, portName);
    var info = portBrief(d, portName);
    var peer = H.State.getPeer(devId, portName);
    var h = '<div class="tt-h"><i style="background:' + (TYPE_COLOR[d.type] || '#475569') + '">' + esc(ABBR[d.type] || '?') + '</i>' +
      esc(d.cfg.hostname || d.name) + ' · <span style="font-family:Consolas,monospace;font-weight:600">' + esc(portName) + '</span></div>';
    h += '<div class="tt-kv"><span>状态</span><b style="color:' + statusColor(st) + '">' + stTxt(st) + '</b></div>';
    if (info) h += '<div class="tt-kv"><span>配置</span><b>' + esc(info) + '</b></div>';
    if (peer) {
      var pd = H.State.getDevice(peer.dev);
      h += '<div class="tt-kv"><span>对端</span><b>' + esc(pd ? (pd.cfg.hostname || pd.name) : '?') + ' ' + esc(peer.port) + '</b></div>';
    } else {
      h += '<div class="tt-mut">未连接 · 点击此圆点，再点另一设备的端口即可连线</div>';
    }
    return h;
  }
  function linkTipHtml(id) {
    var l = H.State.getLink(id); if (!l) return '';
    var da = H.State.getDevice(l.a.dev), db = H.State.getDevice(l.b.dev);
    if (!da || !db) return '';
    var sa = portStatus(da, l.a.port), sb = portStatus(db, l.b.port), st = linkStatus(sa, sb);
    var h = '<div class="tt-h">链路 · <span style="color:' + statusColor(st) + '">' + stTxt(st) + '</span></div>';
    h += '<div class="tt-ports">' +
      '<div><span>' + esc(da.cfg.hostname || da.name) + '</span><code>' + esc(l.a.port) + '</code></div>' +
      '<div class="tt-arrow">⇕</div>' +
      '<div><span>' + esc(db.cfg.hostname || db.name) + '</span><code>' + esc(l.b.port) + '</code></div></div>';
    h += '<div class="tt-kv"><span>两端</span><b><span style="color:' + statusColor(sa) + '">' + stTxt(sa) + '</span> / <span style="color:' + statusColor(sb) + '">' + stTxt(sb) + '</span></b></div>';
    h += '<div class="tt-mut">单击链路可查看详情或删除</div>';
    return h;
  }
  function showTip(html, e) {
    if (!tip || !html) { hideTip(); return; }
    tip.innerHTML = html;
    tip.style.display = 'block';
    var sr = stage.getBoundingClientRect();
    var x = e.clientX - sr.left + 14, y = e.clientY - sr.top + 14;
    var w = tip.offsetWidth, hgt = tip.offsetHeight;
    if (x + w > sr.width - 8) x = e.clientX - sr.left - w - 14;
    if (x < 4) x = 4;
    if (y + hgt > sr.height - 8) y = sr.height - hgt - 8;
    if (y < 4) y = 4;
    tip.style.left = x + 'px';
    tip.style.top = y + 'px';
  }
  function hideTip() { if (tip) tip.style.display = 'none'; }
  function onHover(e) {
    if (drag || pan) { hideTip(); return; }
    var t = e.target;
    if (!t || !t.closest) { hideTip(); return; }
    var linkEl = t.closest('.link-hit') || t.closest('.link-line');
    var nodeEl = t.closest('.node');
    var portEl = t.closest('.port-dot-hit') || t.closest('.port-dot');
    if (linkEl) { showTip(linkTipHtml(linkEl.getAttribute('data-link')), e); return; }
    if (portEl && nodeEl) { showTip(portTipHtml(nodeEl.getAttribute('data-id'), portEl.getAttribute('data-port')), e); return; }
    if (nodeEl) { showTip(devTipHtml(nodeEl.getAttribute('data-id')), e); return; }
    hideTip();
  }

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

  /* ---------- 空白区域查找：新设备自动避让，避免叠在一起 ---------- */
  var GAP_X = 30, GAP_Y = 36;            // 设备之间的最小留白
  function nodeH() { return BH + 26; }   // 设备主体 + 下方端口指示灯行
  function devRect(d) { return { x: d.x, y: d.y, w: nodeWidth(d), h: nodeH() }; }
  function rectsHit(a, b) {
    return !(a.x + a.w + GAP_X <= b.x || b.x + b.w + GAP_X <= a.x ||
      a.y + a.h + GAP_Y <= b.y || b.y + b.h + GAP_Y <= a.y);
  }
  /* 新设备放置策略：从「当前拓扑整体」左上角空白起，左对齐、自上而下、等间距排成一列
   * - 列锚点：现有设备包围盒的左上角(minX,minY)；首选放在整体左侧一列（x = minX - 设备宽 - 间距），左侧贴边则放整体正下方一列
   * - 连续添加时由 colSlot 游标把每台依次下移一行高（ROW = 设备高 + 间距），保证左对齐且行间距完全一致；拓扑结构变动（拖拽/删除/加载/清空）时清零重算 */
  var colSlot = null;   // 新设备列下一个落点，连续添加时复用
  function resetColumn() { colSlot = null; }
  function findFreeSpot(x0, y0, w, h, exceptId) {
    w = w || NW; h = h || nodeH();
    var devs = H.State.S.devices, i;
    var minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9, has = false;
    for (i = 0; i < devs.length; i++) {
      if (devs[i].id === exceptId) continue;
      has = true;
      var d = devs[i], ww = d._w || nodeWidth(d);
      minX = Math.min(minX, d.x); minY = Math.min(minY, d.y);
      maxX = Math.max(maxX, d.x + ww); maxY = Math.max(maxY, d.y + nodeH());
    }
    var ax, ay;
    if (!has) { ax = 40; ay = 40; }
    else { ax = minX - (w + GAP_X); if (ax < 0) ax = maxX + GAP_X; ay = minY; }
    return { x: Math.round(ax), y: Math.round(ay) };
  }
  /* 连续添加入口：首台用整体左上角锚点，之后沿列游标等间距下移 */
  function placeNewDevice(dev, w, h) {
    w = w || NW; h = h || nodeH();
    var ROW = h + GAP_Y;
    var spot;
    if (colSlot) {
      spot = { x: colSlot.x, y: colSlot.y };
      colSlot.y += ROW;
    } else {
      spot = findFreeSpot(dev.x, dev.y, w, h, dev.id);
      colSlot = { x: spot.x, y: spot.y + ROW };
    }
    dev.x = spot.x; dev.y = spot.y;
    return spot;
  }
  /* 新设备若落在可视区之外，平移视图让它可见（不改变缩放） */
  function ensureVisible(d) {
    if (!svg || !d) return;
    var sw = svg.clientWidth, sh = svg.clientHeight;
    if (!sw || !sh) return;
    var w = nodeWidth(d) * view.scale, h = nodeH() * view.scale;
    var sx = d.x * view.scale + view.tx, sy = d.y * view.scale + view.ty;
    if (sx >= 6 && sy >= 6 && sx + w <= sw - 6 && sy + h <= sh - 6) return;
    view.tx = (sw - w) / 2 - d.x * view.scale;
    view.ty = (sh - h) / 2 - d.y * view.scale;
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
    // 端口连线虚线图层（置于最上层）
    if (vp) {
      gGhost = document.createElementNS(SVGNS, 'g');
      gGhost.setAttribute('id', 'layer-ghost');
      vp.appendChild(gGhost);
    }
    // 悬浮信息小窗
    if (stage) {
      tip = document.createElement('div');
      tip.className = 'topo-tip';
      tip.id = 'topo-tip';
      tip.style.display = 'none';
      stage.appendChild(tip);
    }
    var m = H.State.S.meta;
    view = { scale: m.scale || 1, tx: (m.tx != null ? m.tx : 30), ty: (m.ty != null ? m.ty : 30) };
    drawGrid();
    applyView();
    svg.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    svg.addEventListener('click', onClick);
    svg.addEventListener('mousemove', onHover);
    svg.addEventListener('mouseleave', hideTip);
    svg.addEventListener('wheel', onWheel, { passive: false });
    var na = document.getElementById('node-actions');
    if (na) { var nd = document.getElementById('node-del'); if (nd) nd.addEventListener('click', removeSelected); }
    window.addEventListener('keydown', onKeyDown);
    H.State.on('reload', resetColumn);   // 清空 / 加载场景后列游标归零
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
    getSelected: function () { return sel; }, onSelect: null, onLinkMode: null,
    findFreeSpot: findFreeSpot, placeNewDevice: placeNewDevice, resetColumn: resetColumn,
    ensureVisible: ensureVisible,
    nodeWidth: nodeWidth, nodeHeight: nodeH, getView: function () { return view; }
  };
})(window.H3C);
