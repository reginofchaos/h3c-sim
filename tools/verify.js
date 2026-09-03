/* h3c-sim 统一回归验证（jsdom）
 * 覆盖：4 个实验场景的端到端连通性 + UI 结构（面板/拖拽条/显示按钮/PC 配置表单）
 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = 'C:/Users/Admin/WorkBuddy/岳科院教学工作/h3c-sim';
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

const dom = new JSDOM(html, {
  url: 'https://localhost/h3c-sim/index.html',
  runScripts: 'outside-only',
  resources: 'usable',
  pretendToBeVisual: true
});
const { window } = dom;
const jsdomErrors = [];
window.addEventListener('error', (e) => jsdomErrors.push('window.error: ' + (e.message || e.error)));
window.addEventListener('jsdomError', (e) => {
  const m = e.message || String(e);
  // canvas / 字体在 jsdom 无实现，属无害噪声
  if (/getContext|Cannot set properties of null|font/i.test(m)) return;
  jsdomErrors.push('jsdomError: ' + m);
});
window.console.error = function () { /* 静音 */ };

/* jsdom 无 canvas 实现，用一个 Proxy 桩顶替 2D 上下文：
   - 属性读写直接透传
   - measureText 返回估算宽度
   - 其余方法一律返回另一个桩（可继续链式调用，如 createLinearGradient().addColorStop()） */
function makeCtx() {
  var base = { font: '12px sans-serif', fillStyle: '#000', strokeStyle: '#000', lineWidth: 1, textBaseline: 'alphabetic', textAlign: 'left', globalAlpha: 1, lineCap: 'butt', lineJoin: 'miter' };
  return new Proxy(base, {
    get: function (t, p) {
      if (p === 'canvas') return document.createElement('canvas');
      if (p === 'measureText') return function (s) { return { width: String(s == null ? '' : s).length * 7 }; };
      if (p in t) return t[p];
      return function () { return makeCtx(); };
    },
    set: function (t, p, v) { t[p] = v; return true; }
  });
}
window.HTMLCanvasElement.prototype.getContext = function () { return makeCtx(); };

const scripts = [
  'js/core/utils.js', 'js/core/version.js', 'js/core/models.js', 'js/core/state.js', 'js/core/engine.js',
  'js/core/host.js', 'js/core/sim.js',
  'js/cmds/base.js', 'js/cmds/l2.js', 'js/cmds/l3.js', 'js/cmds/route.js',
  'js/cmds/wan.js',
  'js/cmds/nat.js',
  'js/cmds/acl.js', 'js/cmds/qos.js', 'js/cmds/sec.js', 'js/cmds/nms.js',
  'js/cmds/monitor.js', 'js/cmds/config.js',
  'js/ui/topology.js', 'js/ui/terminal.js', 'js/ui/app.js'
];
scripts.forEach(rel => {
  const code = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  try { window.eval(code); }
  catch (e) { console.log('[eval FAIL]', rel, e.message); jsdomErrors.push(rel + ': ' + e.message); }
});

// 注意：不要手动派发 DOMContentLoaded —— jsdom 自己会派发，
// 手动再派一次会导致 app.js 的 init() 执行两遍、按钮被绑定两次（点一下切换两次）。

let pass = 0, fail = 0;
function ok(cond, name, extra) {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (extra ? '  → ' + extra : '')); }
}

function run() {
  const H = window.H3C;
  if (!H || !H.Sim || !H.State) { console.log('H3C 未加载'); process.exit(1); }
  const S = H.State, Sim = H.Sim, E = H.Engine;
  const doc = window.document;

  /* ---------------- 一、UI 结构 ---------------- */
  console.log('\n=== 一、UI 结构与面板 ===');

  ok(!!doc.querySelector('#main'), '存在 #main 容器');
  ok(!!doc.querySelector('#palette'), '存在 #palette 设备库');
  ok(!!doc.querySelector('#scenario'), '存在 #scenario 实验说明（独立区域）');
  ok(!!doc.querySelector('#inspector'), '存在 #inspector 端口详情');
  ok(!!doc.querySelector('#stage'), '存在 #stage 拓扑区');

  // 实验说明应在设备库右侧（DOM 顺序：palette -> scenario -> stage -> inspector）
  const kids = Array.prototype.map.call(doc.querySelector('#main').children, el => el.id);
  ok(kids.join(',') === 'palette,scenario,stage,inspector',
    '#main 子顺序 = palette,scenario,stage,inspector', kids.join(','));

  // 拖拽条
  const rz = Array.prototype.map.call(doc.querySelectorAll('.v-resizer'), el => el.getAttribute('data-resize'));
  ok(rz.length === 3 && rz.indexOf('palette') >= 0 && rz.indexOf('scenario') >= 0 && rz.indexOf('inspector') >= 0,
    '三个面板各有一条 .v-resizer 拖拽条', rz.join(','));

  // 隐藏按钮：设备库 « 在标题左侧（侧向隐藏按钮）
  const palTog = doc.querySelector('#palette .panel-toggle');
  ok(palTog && /«/.test(palTog.textContent), '设备库隐藏按钮为 « 侧向样式',
    palTog ? palTog.textContent : 'null');
  const palH = doc.querySelector('#palette .panel-h');
  ok(palH && palH.firstElementChild === palTog, '设备库隐藏按钮位于标题左侧');

  // 显示按钮放顶端
  ok(!!doc.querySelector('#show-palette'), '存在 #show-palette 显示按钮');
  ok(!!doc.querySelector('#show-scenario'), '存在 #show-scenario 显示按钮');
  ok(!!doc.querySelector('#show-inspector'), '存在 #show-inspector 显示按钮');

  /* ---------------- 二、面板隐藏/显示（BUG 6） ---------------- */
  console.log('\n=== 二、面板隐藏/显示（BUG 6：隐藏设备库不应隐藏端口详情）===');

  function bodyCls() { return doc.body.className; }
  function clickToggle(panel) {
    const b = doc.querySelector('[data-panel="' + panel + '"].panel-toggle');
    if (b) b.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  }
  function clickShow(panel) {
    const b = doc.querySelector('#show-' + panel);
    if (b) b.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  }

  // 归一：先把三个面板都显示出来
  ['palette', 'scenario', 'inspector'].forEach(p => {
    if (doc.body.classList.contains(p + '-hidden')) clickShow(p);
  });

  clickToggle('palette');
  ok(/\bpalette-hidden\b/.test(bodyCls()), '点击设备库 « → body.palette-hidden');
  ok(!/\binspector-hidden\b/.test(bodyCls()), '隐藏设备库时 inspector 未被同时隐藏（BUG 6 已修）', bodyCls());
  ok(!/\bscenario-hidden\b/.test(bodyCls()), '隐藏设备库时 scenario 未被同时隐藏');

  clickShow('palette');
  ok(!/\bpalette-hidden\b/.test(bodyCls()), '点击顶部显示按钮 → 设备库恢复显示');
  ok(!/\binspector-hidden\b/.test(bodyCls()), '恢复设备库后 inspector 仍正常显示');

  clickToggle('scenario');
  ok(/\bscenario-hidden\b/.test(bodyCls()), '隐藏实验说明 → body.scenario-hidden');
  ok(!/\binspector-hidden\b/.test(bodyCls()), '隐藏实验说明时 inspector 未被隐藏');
  clickShow('scenario');
  ok(!/\bscenario-hidden\b/.test(bodyCls()), '实验说明可恢复显示');

  clickToggle('inspector');
  ok(/\binspector-hidden\b/.test(bodyCls()), '隐藏端口详情 → body.inspector-hidden');
  ok(!/\bpalette-hidden\b/.test(bodyCls()), '隐藏端口详情时设备库未被隐藏');
  clickShow('inspector');
  ok(!/\binspector-hidden\b/.test(bodyCls()), '端口详情可恢复显示');

  /* ---------------- 三、四个实验场景端到端 ---------------- */
  console.log('\n=== 三、实验场景端到端连通性 ===');

  function loadScenarioByUI(idx) {
    // 打开"实验场景"菜单并点击第 idx 项，走真实 loadScenario 路径
    const stale = doc.querySelector('#scn-menu');
    if (stale && stale.parentNode) stale.parentNode.removeChild(stale);
    const btn = doc.querySelector('[data-act="scenario"]');
    if (btn) btn.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    const item = doc.querySelector('.scn-item[data-i="' + idx + '"]');
    if (!item) return false;
    item.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    Sim.invalidate();
    return true;
  }

  function devByName(n) {
    const list = S.S.devices;
    for (let i = 0; i < list.length; i++) {
      if ((list[i].cfg.hostname || list[i].name) === n) return list[i];
    }
    return null;
  }

  const cases = [
    { idx: 0, name: 'VLAN 划分与 trunk 实验', src: 'PC1', dst: '192.168.10.20' },
    { idx: 1, name: '静态路由互连实验', src: 'PC1', dst: '10.2.2.10' },
    { idx: 2, name: 'OSPF 动态路由实验', src: 'PC1', dst: '10.0.23.3' },
    { idx: 3, name: 'RSTP 冗余与阻塞实验', src: 'PC1', dst: '172.16.0.20' }
  ];

  cases.forEach(function (c, i) {
    console.log('\n--- 场景 ' + (i + 1) + '：' + c.name + ' ---');
    let loaded = loadScenarioByUI(c.idx);
    if (!loaded) { ok(false, '场景 ' + (i + 1) + ' 菜单可加载'); return; }

    ok(S.S.devices.length > 0, '场景 ' + (i + 1) + ' 设备已创建（' + S.S.devices.length + ' 台）');
    ok(S.S.links.length > 0, '场景 ' + (i + 1) + ' 链路已创建（' + S.S.links.length + ' 条）');

    // 实验说明面板渲染
    const scnInfo = doc.querySelector('#scn-info');
    ok(scnInfo && scnInfo.innerHTML.length > 50, '场景 ' + (i + 1) + ' 实验说明已渲染到 #scn-info');
    const txt = scnInfo ? scnInfo.textContent : '';
    ok(/实验目标/.test(txt) && /实验步骤/.test(txt) && /预期结果/.test(txt),
      '场景 ' + (i + 1) + ' 说明含 目标/步骤/预期结果 三段');

    const src = devByName(c.src);
    if (!src) { ok(false, '场景 ' + (i + 1) + ' 找到 ' + c.src); return; }
    const r = Sim.ping(src, c.dst, {});
    ok(!!r.ok, '场景 ' + (i + 1) + ' ' + c.src + ' ping ' + c.dst + ' 通',
      r.ok ? '' : ('reason=' + (r.reason || (r.out || '').split('\n')[1])));
    console.log('        ' + ((r.out || '').split('\n')[1] || '').trim());

    // 反向也要通（路由/二层双向性）
    const dstDev = (function () {
      for (let k = 0; k < S.S.devices.length; k++) {
        const d = S.S.devices[k];
        if (d.type === 'pc' && d.id !== src.id) return d;
      }
      return null;
    })();
    if (dstDev) {
      const srcIpObj = src.ports.map(p => src.cfg.ifaces[p.name] && src.cfg.ifaces[p.name].ip).filter(Boolean)[0];
      if (srcIpObj) {
        const r2 = Sim.ping(dstDev, srcIpObj.addr, {});
        ok(!!r2.ok, '场景 ' + (i + 1) + ' 反向 ping 通（' + (dstDev.cfg.hostname || dstDev.name) + ' → ' + srcIpObj.addr + '）',
          r2.ok ? '' : ('reason=' + r2.reason));
      }
    }

    // tracert 不应报错
    const t = Sim.tracert(src, c.dst, {});
    ok(t && !!t.out && !/Error|error/.test(t.out), '场景 ' + (i + 1) + ' tracert 正常输出');
  });

  /* ---------------- 四、PC 配置 UI（需求 1） ---------------- */
  console.log('\n=== 四、PC 配置 UI ===');
  loadScenarioByUI(0);
  const pc1 = devByName('PC1');
  if (pc1) {
    // 通过拓扑选中回调（app.js 里 TOPO.onSelect）渲染右侧面板
    if (H.UI && H.UI.Topology && H.UI.Topology.onSelect) H.UI.Topology.onSelect(pc1.id);
    const body = doc.querySelector('#inspector-body');
    const h = body ? body.innerHTML : '';
    ok(!!doc.querySelector('#pc-ip'), '存在 #pc-ip 输入框');
    ok(!!doc.querySelector('#pc-mask'), '存在 #pc-mask 输入框');
    ok(!!doc.querySelector('#pc-gw'), '存在 #pc-gw 输入框');
    ok(!!doc.querySelector('#pc-target'), '存在 #pc-target 输入框');
    ok((h.match(/class="host-row"/g) || []).length >= 4, 'IP/掩码/网关/目标 各占一行 host-row',
      'found ' + (h.match(/class="host-row"/g) || []).length);
    ok(/class="btn btn-ping"/.test(h), 'Ping 使用按钮样式 .btn.btn-ping');
    ok(/class="btn btn-apply"/.test(h), '应用 IP 配置 使用按钮样式 .btn.btn-apply');
  }

  /* ---------------- 四·B、PC 表单按钮实际可用 ---------------- */
  console.log('\n=== 四·B、PC 表单按钮功能 ===');
  {
    // 注意：每次「应用」后面板会整体重渲染，元素引用必须重新查询
    const setPc = function (sel, v) { const e = doc.querySelector(sel); if (e) e.value = v; return !!e; };
    const clickAct = function (a) {
      const b = doc.querySelector('[data-act="' + a + '"]');
      if (b) b.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
      return !!b;
    };

    ok(setPc('#pc-ip', '192.168.10.77') && setPc('#pc-gw', '192.168.10.1'), 'IP/网关输入框可写入');
    ok(clickAct('pc-apply'), '可点击「应用 IP 配置」');
    const f = pc1.cfg.ifaces['GE0/1'];
    ok(!!f.ip && f.ip.addr === '192.168.10.77', '应用后 PC1 IP 生效', f.ip ? f.ip.addr : 'null');
    ok(pc1.cfg.defaultRoute === '192.168.10.1', '网关同时写入默认路由', String(pc1.cfg.defaultRoute));

    // 改回原地址，再验证 Ping 按钮
    setPc('#pc-ip', '192.168.10.10'); setPc('#pc-gw', '');
    clickAct('pc-apply');
    Sim.invalidate();

    setPc('#pc-target', '192.168.10.20');
    // 输出写入会话 buffer（只有当前活动页签才会渲染到屏幕）
    const sess = S.getSession(pc1.id);
    const n0 = sess.buffer.length;
    ok(clickAct('pc-ping'), '可点击「Ping」');
    const n1 = sess.buffer.length;
    const last = n1 > n0 ? sess.buffer[n1 - 1].text : '';
    ok(n1 > n0 && /Reply from 192\.168\.10\.20/.test(last),
      'Ping 输出含 Reply 回显', 'buffer ' + n0 + '→' + n1 + ' / ' + String(last).slice(0, 40));
  }

  /* ---------------- 四·C、面板宽度拖拽 ---------------- */
  console.log('\n=== 四·C、面板宽度拖拽调整 ===');
  function dragResizer(panel, dx) {
    const bar = doc.querySelector('.v-resizer[data-resize="' + panel + '"]');
    if (!bar) return null;
    bar.dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true, clientX: 300 }));
    window.dispatchEvent(new window.MouseEvent('mousemove', { bubbles: true, clientX: 300 + dx }));
    window.dispatchEvent(new window.MouseEvent('mouseup', { bubbles: true }));
    return doc.documentElement.style.getPropertyValue(
      '--' + (panel === 'palette' ? 'pal' : panel === 'scenario' ? 'scn' : 'insp') + '-w');
  }
  dragResizer('palette', 0);           // 先建立基线
  const palW1 = doc.documentElement.style.getPropertyValue('--pal-w');
  const palW2 = dragResizer('palette', 120);
  ok(palW1 && palW2 && parseInt(palW2, 10) > parseInt(palW1, 10),
    '拖拽设备库右边界可变宽（' + palW1 + ' → ' + palW2 + '）');
  const scnW1 = dragResizer('scenario', 0);
  const scnW2 = dragResizer('scenario', 80);
  ok(scnW1 && scnW2 && parseInt(scnW2, 10) > parseInt(scnW1, 10),
    '拖拽实验说明右边界可变宽（' + scnW1 + ' → ' + scnW2 + '）');
  const inspW1 = dragResizer('inspector', 0);
  const inspW2 = dragResizer('inspector', -90);   // 详情在右侧，向左拖=变宽
  ok(inspW1 && inspW2 && parseInt(inspW2, 10) > parseInt(inspW1, 10),
    '拖拽端口详情左边界可变宽（' + inspW1 + ' → ' + inspW2 + '）');
  const palW3 = dragResizer('palette', -100000);  // 极端缩小应被夹到下限
  ok(parseInt(palW3, 10) >= 140, '宽度有下限保护（不小于 140px）→ ' + palW3);
  const palW4 = dragResizer('palette', 100000);
  ok(parseInt(palW4, 10) <= 600, '宽度有上限保护（不大于 600px）→ ' + palW4);

  /* ---------------- 四·D、CLI 引擎：help / 接口解析 / dis cu ---------------- */
  console.log('\n=== 四·D、CLI 引擎修复（help、端口解析、dis cu）===');
  // 准备一个新拓扑：交换机 + 1 台已链接的 PC + 1 台未链接的 PC
  S.clearAll();
  const sw = S.addDevice('S5130-28S-EI', 'SW1', 80, 70);
  const swSess = S.getSession(sw.id);
  const pcLinked = S.addDevice('PC', 'PC1', 260, 300);
  const pcOther = S.addDevice('PC', 'PC2', 460, 300);
  S.addLink(sw.id, 'GE1/0/3', pcLinked.id, 'GE0/1');
  H.Host.applyIp(pcLinked, '192.168.10.10', '255.255.255.0', null);

  // -- 修复 1：help 无前缀时显示完整命令模式 --
  const helpText = E.help(sw, swSess, '');
  ok(/display arp\s+/.test(helpText), 'help 含完整子句 "display arp"（不再只显示 "display"）');
  ok(/display bgp peer/.test(helpText), 'help 含完整子句 "display bgp peer"');
  ok(/display bgp routing-table/.test(helpText), 'help 含完整子句 "display bgp routing-table"');
  ok(/display current-configuration interface <<interface-name>>/.test(helpText),
    'help 含 "display current-configuration interface <<interface-name>>"');

  // -- 修复 3：vlan 视图下接受多种端口写法 --
  E.exec(sw, swSess, 'system-view');
  E.exec(sw, swSess, 'vlan 10');
  const vlanForms = [
    { spec: 'GigabitEthernet1/0/3', ok: true },
    { spec: 'gigabitethernet1/0/3', ok: true },
    { spec: 'GE1/0/3', ok: true },
    { spec: '1/0/3', ok: true }
  ];
  vlanForms.forEach(function (f) {
    const r = E.exec(sw, swSess, 'port ' + f.spec);
    ok(!r.err, 'vlan 视图 "port ' + f.spec + '" 不报错', r.err ? r.out : '');
  });
  ok(sw.cfg.ifaces['GE1/0/3'].accessVlan === 10, 'GE1/0/3 accessVlan 被设为 10',
    'actual=' + sw.cfg.ifaces['GE1/0/3'].accessVlan);

  // -- 修复 2：dis cu 显示已链路的端口 --
  E.exec(sw, swSess, 'return');
  const cu = H.Config.render(sw);
  ok(/interface\s+GigabitEthernet1\/0\/3/.test(cu), 'dis cu 中出现已链接端口 GigabitEthernet1/0/3');
  ok(!/interface\s+GigabitEthernet1\/0\/4/.test(cu), '未链接端口 GigabitEthernet1/0/4 不出现在 dis cu');

  // -- 新增命令：display current-configuration interface <ifname> --
  E.exec(sw, swSess, 'system-view');
  const dci = E.exec(sw, swSess, 'display current-configuration interface GigabitEthernet1/0/3');
  ok(!dci.err && /interface\s+GigabitEthernet1\/0\/3/.test(dci.out || ''),
    'display current-configuration interface GigabitEthernet1/0/3 工作');
  ok(/port access vlan 10/.test(dci.out || ''),
    '指定接口配置输出包含 "port access vlan 10"');
  const dciBad = E.exec(sw, swSess, 'display current-configuration interface foobar');
  ok(!!dciBad.err, 'display current-configuration interface foobar 应报错');

  /* ---------------- 四·E、广域网 PPP/HDLC 接入（PPP/HDLC/CHAP 状态机） ---------------- */
  console.log('\n=== 四·E、广域网 PPP/HDLC 接入（PPP/HDLC/CHAP 状态机）===');
  // 加载「广域网 PPP/HDLC 接入实验」场景（索引 4）
  loadScenarioByUI(4);
  const wanR1 = devByName('R1'), wanR2 = devByName('R2'),
        wanPC1 = devByName('PC1'), wanPC2 = devByName('PC2');
  ok(!!wanR1 && !!wanR2 && !!wanPC1 && !!wanPC2, 'WAN 场景含 R1/R2/PC1/PC2 四台设备');
  ok(S.S.links.length === 3, 'WAN 场景含 3 条链路（Serial×1 + 以太网×2）', 'links=' + S.S.links.length);

  if (wanR1 && wanR2 && wanPC1) {
    const r1Sess = S.getSession(wanR1.id);
    // 1) 链路协议状态机：两端均 PPP + CHAP 凭据匹配 → UP
    ok(Sim.linkProtocolUp(wanR1, 'Serial1/0') === true, 'R1 Serial1/0 链路协议 UP（PPP+CHAP 一致）');
    ok(Sim.linkProtocolUp(wanR2, 'Serial1/0') === true, 'R2 Serial1/0 链路协议 UP（PPP+CHAP 一致）');

    // 2) display interface 应解析 Serial 口名并输出 Line protocol state: UP
    const di = E.exec(wanR1, r1Sess, 'display interface Serial1/0');
    ok(!di.err && /Line protocol state: UP/.test(di.out || ''),
      'R1 display interface Serial1/0 显示 "Line protocol state: UP"',
      di.err ? ('err=' + di.err)
             : (di.out || '').split('\n').filter(function (l) { return /Line protocol/.test(l); }).join('|'));
    ok(/Link-protocol: ppp/.test(di.out || ''), 'display interface 显示 Link-protocol: ppp');

    // 3) 端到端：PC1 → PC2 跨广域网互通
    Sim.invalidate();
    const pr = Sim.ping(wanPC1, '10.2.2.10', {});
    ok(!!pr.ok, 'PC1 ping PC2（10.2.2.10）跨广域网互通', pr.ok ? '' : ('reason=' + (pr.reason || '')));

    // 4) 负向：任一端封装改为 hdlc（链路协议不一致）→ 端口 DOWN → ping 失败
    wanR2.cfg.ifaces['Serial1/0'].linkProtocol = 'hdlc';
    Sim.invalidate();
    ok(Sim.linkProtocolUp(wanR1, 'Serial1/0') === false, '任一端改 hdlc（封装不一致）→ 链路协议 DOWN');
    const diDown = E.exec(wanR1, r1Sess, 'display interface Serial1/0');
    ok(/Line protocol state: DOWN/.test(diDown.out || ''), 'display interface Serial1/0 显示 DOWN（封装不一致）');
    const prFail = Sim.ping(wanPC1, '10.2.2.10', {});
    ok(!prFail.ok, '封装不一致 → PC1 ping PC2 不通（演示失败状态）', prFail.reason || '');

    // 5) 恢复：改回 ppp → 链路恢复 UP → ping 重新通
    wanR2.cfg.ifaces['Serial1/0'].linkProtocol = 'ppp';
    Sim.invalidate();
    ok(Sim.linkProtocolUp(wanR1, 'Serial1/0') === true, '恢复 ppp → 链路协议重新 UP');
    const prRec = Sim.ping(wanPC1, '10.2.2.10', {});
    ok(!!prRec.ok, '恢复后 PC1 ping PC2 重新互通');

    // 6) CLI 命令层：link-protocol / ppp authentication-mode / ppp chap 可下发并回写
    E.exec(wanR1, r1Sess, 'system-view');
    E.exec(wanR1, r1Sess, 'interface Serial1/0');
    var rLp = E.exec(wanR1, r1Sess, 'link-protocol hdlc');
    ok(!rLp.err && wanR1.cfg.ifaces['Serial1/0'].linkProtocol === 'hdlc', 'CLI: link-protocol hdlc 下发生效');
    var rUn = E.exec(wanR1, r1Sess, 'undo link-protocol hdlc');
    ok(!rUn.err && wanR1.cfg.ifaces['Serial1/0'].linkProtocol === 'ppp', 'CLI: undo link-protocol hdlc 恢复为 ppp');
    var rAuth = E.exec(wanR1, r1Sess, 'ppp authentication-mode chap');
    ok(!rAuth.err && wanR1.cfg.ifaces['Serial1/0'].pppAuth.mode === 'chap', 'CLI: ppp authentication-mode chap 生效');
    var rChap = E.exec(wanR1, r1Sess, 'ppp chap user R9');
    ok(!rChap.err && wanR1.cfg.ifaces['Serial1/0'].pppAuth.user === 'R9', 'CLI: ppp chap user 生效');
    // help 列表应出现新增广域网命令
    const wanHelp = E.help(wanR1, r1Sess, 'link-protocol');
    ok(/link-protocol/.test(wanHelp) && /hdlc/.test(wanHelp) && /ppp/.test(wanHelp), 'help 含 link-protocol 子命令 ppp/hdlc');
    E.exec(wanR1, r1Sess, 'return');
  }

  /* ---------------- 四·F、NAT 地址转换（Easy-IP 真实转发） ---------------- */
  console.log('\n=== 四·F、NAT 地址转换（Easy-IP 真实转发）===');
  loadScenarioByUI(5);
  const natR1 = devByName('R1'), natR2 = devByName('R2'),
        natPC1 = devByName('PC1'), natPC2 = devByName('PC2');
  ok(!!natR1 && !!natR2 && !!natPC1 && !!natPC2, 'NAT 场景含 R1/R2/PC1/PC2 四台设备');
  ok(S.S.links.length === 3, 'NAT 场景含 3 条链路（内网×1 + 外网×2）', 'links=' + S.S.links.length);

  if (natR1 && natPC1 && natPC2) {
    const r1Sess = S.getSession(natR1.id);
    // 1) 内网 PC 经 NAT 访问外网 PC：ping 通
    Sim.invalidate();
    const np = Sim.ping(natPC1, '200.2.2.10', {});
    ok(!!np.ok, 'PC1 ping PC2（200.2.2.10）经 NAT 互通', np.ok ? '' : ('reason=' + (np.reason || (np.out || '').split('\n')[1])));
    ok(!!np.path && np.path.translatedSrc === '200.1.1.1', '转发路径记录转换后源地址 200.1.1.1（Easy-IP）',
      np.path ? String(np.path.translatedSrc) : 'null');

    // 2) display nat session 显示转换表
    const ns = E.exec(natR1, r1Sess, 'display nat session');
    ok(!ns.err && /192\.168\.1\.10/.test(ns.out || '') && /200\.1\.1\.1/.test(ns.out || ''),
      'display nat session 含 192.168.1.10 => 200.1.1.1 映射');

    // 3) display nat outbound 显示 Easy-IP 绑定
    const nob = E.exec(natR1, r1Sess, 'display nat outbound');
    ok(!nob.err && /GE0\/1|GigabitEthernet0\/1/.test(nob.out || '') && /Easy-IP/.test(nob.out || ''),
      'display nat outbound 显示 GE0/1 绑定 ACL 2000（Easy-IP）');

    // 4) 其它 NAT 显示命令不报错（无对应配置时给出空提示）
    ['display nat server', 'display nat address-group', 'display nat static'].forEach(function (cmd) {
      const r = E.exec(natR1, r1Sess, cmd);
      ok(!r.err, 'NAT 显示命令可执行且不报错：' + cmd);
    });

    // 5) 负向：移除 nat outbound → 外网无回程路由 → ping 不通
    E.exec(natR1, r1Sess, 'system-view');
    E.exec(natR1, r1Sess, 'interface GE0/1');
    E.exec(natR1, r1Sess, 'undo nat outbound 2000');
    Sim.invalidate();
    const npFail = Sim.ping(natPC1, '200.2.2.10', {});
    ok(!npFail.ok, '移除 nat outbound 后 PC1 ping PC2 不通（外网不可达私网）', npFail.reason || '');
    E.exec(natR1, r1Sess, 'nat outbound 2000');   // 恢复
    E.exec(natR1, r1Sess, 'return');

    // 6) 恢复后重新通
    Sim.invalidate();
    const npRec = Sim.ping(natPC1, '200.2.2.10', {});
    ok(!!npRec.ok, '恢复 nat outbound 后 PC1 ping PC2 重新互通');

    // 7) CLI 命令层：nat outbound 可下发并回写
    E.exec(natR1, r1Sess, 'system-view');
    E.exec(natR1, r1Sess, 'interface GE0/1');
    var rNo = E.exec(natR1, r1Sess, 'nat outbound 2000');
    ok(!rNo.err && natR1.cfg.ifaces['GE0/1'].natOutbound && String(natR1.cfg.ifaces['GE0/1'].natOutbound.acl) === '2000',
      'CLI: nat outbound 2000 下发生效');
    E.exec(natR1, r1Sess, 'return');

    // 8) NAT 服务器 / 地址池 / 静态 NAT：命令层与显示 + dis cu 渲染
    E.exec(natR1, r1Sess, 'system-view');
    E.exec(natR1, r1Sess, 'nat address-group 1 200.1.1.5 200.1.1.10');
    E.exec(natR1, r1Sess, 'interface GE0/1');
    E.exec(natR1, r1Sess, 'nat server protocol tcp global 200.1.1.1 8080 inside 192.168.1.10 80');
    E.exec(natR1, r1Sess, 'quit');
    E.exec(natR1, r1Sess, 'nat static 192.168.1.20 200.1.1.20');
    E.exec(natR1, r1Sess, 'return');
    const nserv = E.exec(natR1, r1Sess, 'display nat server');
    ok(!nserv.err && /192\.168\.1\.10/.test(nserv.out || '') && /8080/.test(nserv.out || ''),
      'display nat server 含内部服务器映射（192.168.1.10:80）');
    const nag = E.exec(natR1, r1Sess, 'display nat address-group');
    ok(!nag.err && /200\.1\.1\.5/.test(nag.out || '') && /200\.1\.1\.10/.test(nag.out || ''),
      'display nat address-group 含地址池范围');
    const nst = E.exec(natR1, r1Sess, 'display nat static');
    ok(!nst.err && /192\.168\.1\.20/.test(nst.out || '') && /200\.1\.1\.20/.test(nst.out || ''),
      'display nat static 含静态映射');
    const cu2 = H.Config.render(natR1);
    ok(/nat address-group 1 200\.1\.1\.5 200\.1\.1\.10/.test(cu2), 'dis cu 渲染 nat address-group');
    ok(/nat server protocol tcp global 200\.1\.1\.1 8080 inside 192\.168\.1\.10 80/.test(cu2), 'dis cu 渲染 nat server');
    ok(/nat static 192\.168\.1\.20 200\.1\.1\.20/.test(cu2), 'dis cu 渲染 nat static');
    ok(/nat outbound 2000/.test(cu2), 'dis cu 渲染 nat outbound（Easy-IP）');
  }

  /* ---------------- 四·G、IS-IS 路由 + Route-Policy 真实生效 ---------------- */
  console.log('\n=== 四·G、IS-IS 路由 + Route-Policy 真实生效 ===');
  loadScenarioByUI(6);
  const isR1 = devByName('R1'), isR2 = devByName('R2'),
        isPC1 = devByName('PC1'), isPC2 = devByName('PC2');
  ok(!!isR1 && !!isR2 && !!isPC1 && !!isPC2, 'IS-IS 场景含 R1/R2/PC1/PC2 四台设备');
  ok(S.S.links.length === 3, 'IS-IS 场景含 3 条链路', 'links=' + S.S.links.length);

  if (isR1 && isR2) {
    const r1Sess = S.getSession(isR1.id), r2Sess = S.getSession(isR2.id);
    Sim.invalidate();

    // 1) IS-IS 邻接建立
    const peer = E.exec(isR1, r1Sess, 'display isis peer');
    ok(!peer.err && /R2/.test(peer.out || ''), 'display isis peer 显示 R1 与 R2 建立邻接');

    // 2) Route-Policy 真实过滤与改属性：
    //    172.16.1.0/24 被 RP1 deny 节点过滤而缺失；172.16.2.0/24 保留且 cost 被改为 20
    const r2Routes = Sim.routesOf(isR2);
    const r161 = r2Routes.filter(function (r) { return r.dest === '172.16.1.0' && r.mask === 24; });
    const r162 = r2Routes.filter(function (r) { return r.dest === '172.16.2.0' && r.mask === 24; });
    ok(r161.length === 0, 'R2 路由表中 172.16.1.0/24 被 RP1 deny 节点过滤而缺失');
    ok(r162.length === 1 && r162[0].proto === 'IS_ASE', 'R2 路由表中 172.16.2.0/24 以 IS_ASE 形式存在', r162.length ? r162[0].proto : 'none');
    ok(r162.length === 1 && r162[0].cost === 20, '172.16.2.0/24 开销被 RP1 permit 节点 apply cost 改为 20', r162.length ? String(r162[0].cost) : 'none');

    // 3) 对端网段经 IS-IS 学习到
    const r192 = r2Routes.filter(function (r) { return r.dest === '192.168.1.0' && r.mask === 24; });
    ok(r192.length === 1 && (r192[0].proto === 'ISIS' || r192[0].proto === 'IS_ASE'), 'R2 经 IS-IS 学习到 R1 侧网段 192.168.1.0/24');

    // 4) display route-policy / ip ip-prefix 正确呈现
    const rp = E.exec(isR1, r1Sess, 'display route-policy RP1');
    ok(!rp.err && /deny/.test(rp.out || '') && /permit/.test(rp.out || '') && /cost/.test(rp.out || ''),
      'display route-policy RP1 显示 deny/permit 节点及 apply cost');
    const pre = E.exec(isR1, r1Sess, 'display ip ip-prefix LOOP');
    ok(!pre.err && /172\.16\.1\.0/.test(pre.out || ''), 'display ip ip-prefix LOOP 显示 172.16.1.0/24');

    // 5) PC2 ping PC1 经 IS-IS 互通
    Sim.invalidate();
    const pp = Sim.ping(isPC2, '192.168.1.10', {});
    ok(!!pp.ok, 'PC2 ping PC1（192.168.1.10）经 IS-IS 互通', pp.reason || '');

    // 6) dis cu 渲染 isis / route-policy / ip ip-prefix
    const cu = H.Config.render(isR1);
    ok(/isis 1/.test(cu), 'dis cu 渲染 isis 进程');
    ok(/import-route static route-policy RP1/.test(cu), 'dis cu 渲染 import-route ... route-policy RP1');
    ok(/route-policy RP1 deny node 10/.test(cu), 'dis cu 渲染 route-policy RP1 deny 节点');
    ok(/route-policy RP1 permit node 20/.test(cu), 'dis cu 渲染 route-policy RP1 permit 节点');
    ok(/ip ip-prefix LOOP index 10 permit 172\.16\.1\.0 24/.test(cu), 'dis cu 渲染 ip ip-prefix LOOP');

    // 7) Route-Policy 命令层：节点可被 CLI 创建与读取
    E.exec(isR1, r1Sess, 'system-view');
    E.exec(isR1, r1Sess, 'route-policy TEST deny node 5');
    E.exec(isR1, r1Sess, 'if-match ip-prefix LOOP');
    E.exec(isR1, r1Sess, 'quit');
    E.exec(isR1, r1Sess, 'route-policy TEST permit node 10');
    E.exec(isR1, r1Sess, 'apply cost 88');
    E.exec(isR1, r1Sess, 'return');
    const tnode = (isR1.cfg.routePolicies || []).filter(function (r) { return r.name === 'TEST'; });
    ok(tnode.length === 2, 'CLI 创建 Route-Policy TEST 两个节点（按 name+node 区分）', 'nodes=' + tnode.length);
    ok(tnode.some(function (n) { return n.node === 5 && n.action === 'deny' && n.match.ipPrefix === 'LOOP'; }),
      'TEST node 5 为 deny 且 if-match ip-prefix LOOP 生效');
    ok(tnode.some(function (n) { return n.node === 10 && n.action === 'permit' && n.apply.cost === 88; }),
      'TEST node 10 为 permit 且 apply cost 88 生效');
    // 清理测试策略
    E.exec(isR1, r1Sess, 'system-view');
    E.exec(isR1, r1Sess, 'undo route-policy TEST');
    E.exec(isR1, r1Sess, 'return');
    ok((isR1.cfg.routePolicies || []).filter(function (r) { return r.name === 'TEST'; }).length === 0,
      'undo route-policy TEST 清理测试节点');
  }

  /* ---------------- 四·H、VRRP 网关冗余（主备选举 + 虚拟网关 + 故障切换） ---------------- */
  console.log('\n=== 四·H、VRRP 网关冗余（主备选举 + 虚拟网关 + 故障切换）===');
  loadScenarioByUI(7);
  const vrR1 = devByName('R1'), vrR2 = devByName('R2'),
        vrSW = devByName('SW'), vrPC1 = devByName('PC1');
  ok(!!vrR1 && !!vrR2 && !!vrSW && !!vrPC1, 'VRRP 场景含 R1/R2/SW/PC1 四台设备');
  ok(S.S.links.length === 4, 'VRRP 场景含 4 条链路（PC-SW + R1-SW + R2-SW + R1-R2）', 'links=' + S.S.links.length);

  if (vrR1 && vrR2 && vrPC1) {
    const r1Sess = S.getSession(vrR1.id), r2Sess = S.getSession(vrR2.id), pcSess = S.getSession(vrPC1.id);
    Sim.invalidate();

    // 1) 选举：R1 优先级 120 > R2 100 → R1 为 Master
    const dv1 = E.exec(vrR1, r1Sess, 'display vrrp');
    const dv2 = E.exec(vrR2, r2Sess, 'display vrrp');
    ok(!dv1.err && /GigabitEthernet0\/0\s+1\s+Master/.test(dv1.out) && /192\.168\.1\.254/.test(dv1.out),
      'R1 display vrrp 显示 Master 且虚拟 IP 192.168.1.254');
    ok(!dv2.err && /Backup/.test(dv2.out), 'R2 display vrrp 显示 Backup');
    ok(vrR1.cfg.ifaces['GE0/0'].vrrp[0].state === 'Master' && vrR1.cfg.ifaces['GE0/0'].vrrp[0].vip === '192.168.1.254',
      'R1 GE0/0 VRRP 实例状态=Master');

    // 2) 虚拟网关可达：PC1 ping 虚拟 IP 经 Master R1
    const pg = E.exec(vrPC1, pcSess, 'ping 192.168.1.254');
    ok(!pg.err && /Reply from 192\.168\.1\.254/.test(pg.out), 'PC1 能 ping 通虚拟网关 192.168.1.254（经 Master R1）');

    // 3) PC1 ARP 表学习到虚拟网关 192.168.1.254（虚拟 MAC 见 display vrrp 的 Virtual MAC 列）
    const arp = E.exec(vrPC1, pcSess, 'arp -a');
    ok(!arp.err && /192\.168\.1\.254/.test(arp.out), 'PC1 ARP 表含虚拟网关 192.168.1.254');

    // 4) 配置层：CLI 可读写 VRRP
    const cu = H.Config.render(vrR1);
    ok(/vrrp vrid 1 virtual-ip 192\.168\.1\.254/.test(cu), 'dis cu 渲染 vrrp vrid 1 virtual-ip 192.168.1.254');
    ok(/vrrp vrid 1 priority 120/.test(cu), 'dis cu 渲染 vrrp vrid 1 priority 120');

    // 5) 故障切换：shutdown R1 GE0/0 → 重新选举，R2 接管
    E.exec(vrR1, r1Sess, 'system-view');
    E.exec(vrR1, r1Sess, 'interface GE0/0');
    E.exec(vrR1, r1Sess, 'shutdown');
    E.exec(vrR1, r1Sess, 'return');
    Sim.invalidate();
    const dv2b = E.exec(vrR2, r2Sess, 'display vrrp');
    ok(!dv2b.err && /GigabitEthernet0\/0\s+1\s+Master/.test(dv2b.out), 'R1 GE0/0 shutdown 后 R2 变为 Master');
    ok(vrR2.cfg.ifaces['GE0/0'].vrrp[0].state === 'Master', 'R2 GE0/0 VRRP 实例状态=Master（接管）');

    // 6) 切换后虚拟网关仍可达（现经 R2）
    const pg2 = E.exec(vrPC1, pcSess, 'ping 192.168.1.254');
    ok(!pg2.err && /Reply from 192\.168\.1\.254/.test(pg2.out), '故障切换后 PC1 仍能 ping 通虚拟网关（经 Backup R2 接管）');

    // 7) 恢复：undo shutdown R1 GE0/0 → 优先级高，抢占回 Master
    E.exec(vrR1, r1Sess, 'system-view');
    E.exec(vrR1, r1Sess, 'interface GE0/0');
    E.exec(vrR1, r1Sess, 'undo shutdown');
    E.exec(vrR1, r1Sess, 'return');
    Sim.invalidate();
    ok(vrR1.cfg.ifaces['GE0/0'].vrrp[0].state === 'Master', '恢复后 R1（优先级高）抢占回 Master');
  }

  /* ---------------- 四·J、IPv6 双栈端到端转发 + ping6 ---------------- */
  console.log('\n=== 四·J、IPv6 双栈端到端转发 + ping6 ===');
  loadScenarioByUI(8);
  const v6R1 = devByName('R1'), v6R2 = devByName('R2'),
        v6PC1 = devByName('PC1'), v6PC2 = devByName('PC2');
  ok(!!v6R1 && !!v6R2 && !!v6PC1 && !!v6PC2, 'IPv6 场景含 R1/R2/PC1/PC2 四台设备');
  ok(S.S.links.length === 3, 'IPv6 场景含 3 条链路', 'links=' + S.S.links.length);

  if (v6R1 && v6R2 && v6PC1 && v6PC2) {
    const r1Sess = S.getSession(v6R1.id), pc1Sess = S.getSession(v6PC1.id), pc2Sess = S.getSession(v6PC2.id);
    Sim.invalidate();

    // 1) display ipv6 routing-table 出现静态路由 2001:db8:2::/64
    const rt6 = E.exec(v6R1, r1Sess, 'display ipv6 routing-table');
    ok(!rt6.err && /2001:db8:2::\/64/.test(rt6.out || ''), 'R1 display ipv6 routing-table 含 2001:db8:2::/64', rt6.err ? rt6.out : '');
    ok(!rt6.err && /Static/.test(rt6.out || ''), 'R1 IPv6 路由表含 Proto=Static 条目');

    // 2) display ipv6 interface 显示已配置地址
    const di6 = E.exec(v6R1, r1Sess, 'display ipv6 interface');
    ok(!di6.err && /2001:db8:1::1/.test(di6.out || ''), 'R1 display ipv6 interface 显示 2001:db8:1::1', di6.err ? di6.out : '');

    // 3) IPv4 与 IPv6 双栈同时互通（PC 直接 ping / ping6）
    const p4 = E.exec(v6PC1, pc1Sess, 'ping 192.168.2.20');
    ok(!p4.err && /Reply from 192\.168\.2\.20/.test(p4.out || ''), 'PC1 ping PC2（IPv4 192.168.2.20）互通', p4.err ? p4.out : '');

    const p6 = E.exec(v6PC1, pc1Sess, 'ping6 2001:db8:2::20');
    ok(!p6.err && /Reply from 2001:db8:2::20/.test(p6.out || ''), 'PC1 ping6 PC2（IPv6 2001:db8:2::20）互通', p6.err ? p6.out : '');

    // 4) 反向 ping6 也应通
    const p6r = E.exec(v6PC2, pc2Sess, 'ping6 2001:db8:1::10');
    ok(!p6r.err && /Reply from 2001:db8:1::10/.test(p6r.out || ''), 'PC2 ping6 PC1（2001:db8:1::10）互通（反向）', p6r.err ? p6r.out : '');

    // 5) 网关可达：PC1 ping6 自己的网关 2001:db8:1::1
    const p6g = E.exec(v6PC1, pc1Sess, 'ping6 2001:db8:1::1');
    ok(!p6g.err && /Reply from 2001:db8:1::1/.test(p6g.out || ''), 'PC1 ping6 网关 2001:db8:1::1 可达');

    // 6) 路由器经 monitor 命令 ping ipv6 互通
    const p6m = E.exec(v6R1, r1Sess, 'ping ipv6 2001:db8:2::20');
    ok(!p6m.err && /Reply from 2001:db8:2::20/.test(p6m.out || ''), 'R1 ping ipv6 PC2 经 monitor 命令互通', p6m.err ? p6m.out : '');

    // 7) tracert6 逐跳显示（应出现 R1 / R2 / 目的 共 3 跳，而非只显示目的地）
    const t6 = E.exec(v6PC1, pc1Sess, 'tracert6 2001:db8:2::20');
    const t6lines = (t6 && t6.out || '').split('\n').filter(function (l) { return /^\s*\d+\s/.test(l); }).length;
    ok(t6 && !t6.err && !!t6.out && !/Error|error/.test(t6.out) && t6lines >= 3, 'PC1 tracert6 2001:db8:2::20 逐跳显示（≥3 跳）', 'hops=' + t6lines);

    // 7b) IPv4 tracert 同样应逐跳显示（双栈场景 PC1→R1→R2→PC2 共 3 跳）
    const t4 = E.exec(v6PC1, pc1Sess, 'tracert 192.168.2.20');
    const t4lines = (t4 && t4.out || '').split('\n').filter(function (l) { return /^\s*\d+\s/.test(l); }).length;
    ok(t4 && !t4.err && t4lines >= 3, 'PC1 tracert(IPv4) 192.168.2.20 逐跳显示（≥3 跳）', 'hops=' + t4lines);

    // 8) 负向：删除 R1 的 IPv6 静态路由 → PC1 ping6 PC2 不通
    E.exec(v6R1, r1Sess, 'system-view');
    E.exec(v6R1, r1Sess, 'undo ipv6 route-static 2001:db8:2:: 64 2001:db8:12::2');
    Sim.invalidate();
    const p6fail = E.exec(v6PC1, pc1Sess, 'ping6 2001:db8:2::20');
    ok(!p6fail.err && !/Reply from 2001:db8:2::20/.test(p6fail.out || ''), '删除 R1 IPv6 静态路由后 PC1 ping6 PC2 不通（演示路由必要性）');
    // 恢复
    E.exec(v6R1, r1Sess, 'ipv6 route-static 2001:db8:2:: 64 2001:db8:12::2');
    E.exec(v6R1, r1Sess, 'return');
    Sim.invalidate();
    const p6rec = E.exec(v6PC1, pc1Sess, 'ping6 2001:db8:2::20');
    ok(!p6rec.err && /Reply from 2001:db8:2::20/.test(p6rec.out || ''), '恢复后 PC1 ping6 PC2 重新互通');

    // 9) dis cu 渲染 ipv6 配置
    const cu6 = H.Config.render(v6R1);
    ok(/ipv6 address 2001:db8:1::1\/64/.test(cu6), 'dis cu 渲染 ipv6 address 2001:db8:1::1/64');
    ok(/ipv6 route-static 2001:db8:2:: 64 2001:db8:12::2/.test(cu6), 'dis cu 渲染 ipv6 route-static');

    // 10) PC 表单：set ipv6 经 CLI 落到配置
    const pc6 = E.exec(v6PC1, pc1Sess, 'set ipv6 2001:db8:1::99/64 2001:db8:1::1');
    ok(!pc6.err && /2001:db8:1::99\/64/.test(pc6.out || ''), 'PC1 set ipv6 2001:db8:1::99/64 生效', pc6.err ? pc6.out : '');
    const cfg6 = v6PC1.cfg.ifaces['GE0/1'].ipv6 || [];
    ok(cfg6.some(function (a) { return a.addr === H.U.ipv6NetOf('2001:db8:1::99', 128); }), 'set ipv6 写入 PC1 接口 ipv6 数组');

    // 11) ipv6 route-static 去重（回归：exists 曾比较 sp.addr 而非网段形式，导致重复条目）
    E.exec(v6R1, r1Sess, 'system-view');
    const nB = (v6R1.cfg.ipv6StaticRoutes || []).length;
    E.exec(v6R1, r1Sess, 'ipv6 route-static 2001:db8:2:: 64 2001:db8:12::2');
    E.exec(v6R1, r1Sess, 'ipv6 route-static 2001:db8:2:: 64 2001:db8:12::2');
    const nA = (v6R1.cfg.ipv6StaticRoutes || []).length;
    ok(nA === nB, '重复下发相同 ipv6 route-static 不新增条目（去重生效）', 'before=' + nB + ' after=' + nA);

    // 带主机位的目的地址：存储为网段形式，去重也必须按网段比较。
    // 用新网段 2001:db8:9::/64 —— 若误用 2001:db8:2::20，其网段即 2001:db8:2::/64，
    // 与上面已存在的那条完全重合，会被正确去重而测不出问题。
    const nB2 = (v6R1.cfg.ipv6StaticRoutes || []).length;
    E.exec(v6R1, r1Sess, 'ipv6 route-static 2001:db8:9::20 64 2001:db8:12::2');
    E.exec(v6R1, r1Sess, 'ipv6 route-static 2001:db8:9::20 64 2001:db8:12::2');
    const nA2 = (v6R1.cfg.ipv6StaticRoutes || []).length;
    ok(nA2 === nB2 + 1, '带主机位的目的地址重复下发只新增 1 条（按网段去重）', 'before=' + nB2 + ' after=' + nA2);
    ok((v6R1.cfg.ipv6StaticRoutes || []).some(function (r) {
      return r.dest === H.U.ipv6NetOf('2001:db8:9::20', 64) && r.prefix === 64;
    }), '带主机位的目的地址被归一化为网段存储');
    E.exec(v6R1, r1Sess, 'undo ipv6 route-static 2001:db8:9::20 64 2001:db8:12::2');
    ok((v6R1.cfg.ipv6StaticRoutes || []).length === nB2, 'undo 能删除带主机位目的地址的静态路由');
    E.exec(v6R1, r1Sess, 'return');

    // 12) ND 邻居缓存（与 IPv4 ARP 对称）：ping6 触发学习，reset 可清空
    const nd1 = E.exec(v6R1, r1Sess, 'display ipv6 neighbors');
    ok(!nd1.err && /2001:db8:12::2/.test(nd1.out || ''),
      'R1 ND 表学到下一跳 2001:db8:12::2', nd1.err ? nd1.out : (nd1.out || '').split('\n').slice(0, 4).join(' | '));
    const ndRst = E.exec(v6R1, r1Sess, 'reset ipv6 neighbors');
    ok(!ndRst.err, 'reset ipv6 neighbors 可执行');
    const nd2 = E.exec(v6R1, r1Sess, 'display ipv6 neighbors');
    ok(/No IPv6 neighbor entry found/.test(nd2.out || ''), 'reset 后 R1 ND 表为空');
  }

  /* ---------------- 四·K、ping/tracert 命令模式去歧义（BUG：IPv4 地址同时匹配 <ip> 与 <word>） ---------------- */
  console.log('\n=== 四·K、ping / tracert 命令去歧义 ===');
  // 在 system 视图对任意设备执行 ping 命令，不应报歧义错误
  var firstSw = null;
  S.S.devices.forEach(function (d) {
    if (!firstSw && (d.model === 'S5130-28S-EI' || d.model === 'MSR36-20' || d.model === 'S6850-20')) firstSw = d;
  });
  ok(!!firstSw, '找到一个用于 ping 去歧义测试的设备');
  if (firstSw) {
    var swSessPing = S.getSession(firstSw.id);
    function runOne(line) {
      E.exec(firstSw, swSessPing, 'system-view');
      var r = E.exec(firstSw, swSessPing, line);
      E.exec(firstSw, swSessPing, 'quit'); E.exec(firstSw, swSessPing, 'quit');
      return r || {};
    }
    var r1 = runOne('ping 192.168.10.10');
    ok(!/Ambiguous command/i.test((r1.err || '') + (r1.out || '')),
      '系统视图 ping 192.168.10.10 不报歧义', 'err=' + r1.err);
    var r2 = runOne('tracert 192.168.10.10');
    ok(!/Ambiguous command/i.test((r2.err || '') + (r2.out || '')),
      '系统视图 tracert 192.168.10.10 不报歧义', 'err=' + r2.err);
    var r3 = runOne('ping -c 3 192.168.10.10');
    ok(!/Ambiguous command/i.test((r3.err || '') + (r3.out || '')),
      '系统视图 ping -c 3 192.168.10.10 不报歧义', 'err=' + r3.err);
    var r4 = runOne('tracert -a 1.1.1.1 192.168.10.10');
    ok(!/Ambiguous command/i.test((r4.err || '') + (r4.out || '')),
      '系统视图 tracert -a 1.1.1.1 192.168.10.10 不报歧义', 'err=' + r4.err);
    ok(/Ping\s+192\.168\.10\.10/i.test(r1.out || ''),
      'ping 192.168.10.10 正常输出 Ping 头', 'len=' + (r1.out || '').length);
  }
  // 源码层面：确保冗余的 <word> 模式已移除，并启用了新的 <host>
  var monSrc = fs.readFileSync(path.join(ROOT, 'js/cmds/monitor.js'), 'utf8');
  ok(!/pat:\s*'ping <word>'/.test(monSrc), 'ping 命令已移除冗余的 <word> 模式');
  ok(!/pat:\s*'tracert <word>'/.test(monSrc), 'tracert 命令已移除冗余的 <word> 模式');
  ok(/pat:\s*'ping <host>'/.test(monSrc), 'ping 顶层命令模式改为 <host>');
  ok(/pat:\s*'tracert <host>'/.test(monSrc), 'tracert 顶层命令模式改为 <host>');
  var engSrc = fs.readFileSync(path.join(ROOT, 'js/core/engine.js'), 'utf8');
  ok(/host:\s*\{[^}]*U\.isIp\(v\)/.test(engSrc), 'engine 新增 <host> token（接受 IPv4 或主机名）');

  /* ---------------- 五、CSS 变量与布局 ---------------- */
  console.log('\n=== 五、可调宽度的 CSS 变量 ===');
  const css = fs.readFileSync(path.join(ROOT, 'css/style.css'), 'utf8');
  ok(/--pal-w\s*:/.test(css), 'CSS 定义 --pal-w（设备库宽度）');
  ok(/--scn-w\s*:/.test(css), 'CSS 定义 --scn-w（实验说明宽度）');
  ok(/--insp-w\s*:/.test(css), 'CSS 定义 --insp-w（端口详情宽度）');
  ok(/#main\s*\{[^}]*display\s*:\s*flex/.test(css), '#main 使用 flex 布局（内容自适应）');
  ok(/\.v-resizer/.test(css), 'CSS 定义 .v-resizer 拖拽条样式');

  /* ---------------- 六、关于面板 + 版本管理 ---------------- */
  console.log('\n=== 六、关于面板与版本管理 ===');
  const AB = (window.H3C && window.H3C.ABOUT) || {};
  ok(AB && typeof AB === 'object', 'H.ABOUT 已挂载到 window.H3C');
  ok(AB.version === '1.4.0', '当前版本号为 1.4.0', 'got ' + AB.version);
  ok(AB.contact === 'zyztonorrow@qq.com', '联系方式为 zyztonorrow@qq.com');
  ok(/github\.com/.test(AB.github || ''), '包含 GitHub 仓库地址');
  ok(Array.isArray(AB.changelog) && AB.changelog.length >= 5, '更新日志含 >=5 个版本（1.0.0 起）');
  ok(AB.changelog[0].version === '1.4.0', '更新日志最新条目为当前版本 1.4.0');
  // 点击「关于」按钮应渲染关于面板且无异常
  try {
    const aboutBtn = doc.querySelector('[data-act="about"]');
    ok(!!aboutBtn, '工具栏存在「关于」按钮');
    const errs = [];
    window.addEventListener('error', function (e) { errs.push(e.message || String(e.error)); });
    if (aboutBtn) {
      aboutBtn.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
      var mc = doc.getElementById('modal-c').innerHTML;
      ok(/zyztonorrow@qq\.com/.test(mc) && /github\.com/.test(mc) && /更新日志/.test(mc), '关于面板渲染作者/联系方式/GitHub/更新日志', 'len=' + mc.length + ' errs=' + errs.join('|'));
      ok(doc.getElementById('modal').style.display === 'flex', '关于面板已弹出（display:flex）', errs.join('|'));
    }
  } catch (e) { ok(false, '点击关于按钮渲染无异常', e.message); }

  /* 关于面板二次排版：移除副标题/当前版本行、标签加冒号、增加分割线、版本号与日期隔开 */
  try {
    var mcH = doc.getElementById('modal-c').innerHTML;
    var mcT = doc.getElementById('modal-c').textContent.replace(/\s+/g, ' ');
    ok(!/计算机网络设备配置/.test(mcT), '关于面板已移除课程副标题');
    ok(!/about-k">当前版本/.test(mcH), '关于面板已移除「当前版本」信息行');
    ok(!/about-sub/.test(mcH), '关于面板已移除 .about-sub 节点');
    ok(/联系方式：/.test(mcT) && /GitHub：/.test(mcT), '联系方式 / GitHub 标签后带冒号');
    ok(/about-divider/.test(mcH), '信息区与更新日志之间有分割线');
    var clItems = doc.querySelectorAll('#modal-c .cl-item');
    var clVer = doc.querySelectorAll('#modal-c .cl-ver');
    var clDate = doc.querySelectorAll('#modal-c .cl-date');
    ok(clItems.length >= 5 && clVer.length === clItems.length && clDate.length === clItems.length,
      '每个版本条目各有独立版本号与日期标签',
      'items=' + clItems.length + ' ver=' + clVer.length + ' date=' + clDate.length);
  } catch (e2) { ok(false, '关于面板二次排版断言', e2.message); }

  var cssFlat = css.replace(/\n/g, ' ');
  ok(/\.about-logo\s*\{[^}]*font-weight:\s*900[^}]*font-size:\s*28px/.test(cssFlat),
    'H3CSIM logo 加粗(900)并增大到 28px');
  ok(/\.about-changelog-h\s*\{[^}]*font-weight:\s*800[^}]*font-size:\s*17px/.test(cssFlat),
    '更新日志标题加粗(800)并增大到 17px');
  ok(/\.cl-top\s*\{[^}]*flex-direction:\s*column/.test(cssFlat),
    '版本号与日期上下排列（.cl-top 为 column，不再连在一起）');
  ok(/\.cl-item\s*\{[^}]*border-top:[^;]*;\s*border-bottom:/.test(cssFlat),
    '不同版本记录之间有分割线（.cl-item 上下边框）');

  /* ---------------- 汇总 ---------------- */
  console.log('\n================ 汇总 ================');
  console.log('PASS: ' + pass + '   FAIL: ' + fail);
  const realErr = jsdomErrors.filter(e => !/getContext|font/i.test(e));
  if (realErr.length) { console.log('运行时错误：'); realErr.slice(0, 15).forEach(e => console.log('  ' + e)); }
  else console.log('运行时错误：无');
  process.exitCode = (fail || realErr.length) ? 1 : 0;
}

setTimeout(run, 300);
