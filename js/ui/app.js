/* H3C 网络仿真实验室 - 应用主控：调色板 / 工具栏 / 检视器 / 实验场景 */
(function (H) {
  'use strict';
  var S = H.State, E = H.Engine, Sim = H.Sim, U = H.U;
  var TOPO, TERM, INSPECT;
  var currentInspectorId = null;
  var linking = null; // {dev, port}

  /* ============ 工具 ============ */
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function $(id) { return document.getElementById(id); }
  function clientToContent(cx, cy) {
    var svg = $('topo'), vp = $('viewport');
    var pt = svg.createSVGPoint(); pt.x = cx; pt.y = cy;
    return pt.matrixTransform(vp.getScreenCTM().inverse());
  }
  function statusClass(s) { return s === 'up' ? 'up' : s === 'block' ? 'block' : s === 'down' ? 'down' : 'none'; }
  function statusText(s) { return s === 'up' ? 'UP' : s === 'block' ? 'STP阻塞' : s === 'down' ? 'DOWN' : '未连接'; }
  function portStatus(dev, name) {
    if (!S.portLinked(dev.id, name)) return 'none';
    if (!Sim.portPhysUp(dev, name)) return 'down';
    if (!Sim.portUp(dev, name)) return 'block';
    return 'up';
  }
  function portInfo(dev, name) {
    var f = dev.cfg.ifaces[name]; if (!f) return '';
    if (f.mode === 'route') return f.ip ? ('IP ' + f.ip.addr + '/' + U.maskLen(f.ip.mask)) : 'L3路由口';
    if (f.linkType === 'access') return 'Access V' + (f.accessVlan || 1);
    if (f.linkType === 'trunk') return 'Trunk ' + (f.permitVlans ? U.vlanListText(f.permitVlans) : '');
    if (f.linkType === 'hybrid') return 'Hybrid';
    return '';
  }
  function applyCmds(dev, cmds) {
    var sess = S.getSession(dev.id);
    cmds.forEach(function (c) { E.exec(dev, sess, c); });
  }
  function toast(msg) { /* 拓扑已自带 toast，这里简单用 stage 内的提示 */
    var t = document.createElement('div');
    t.textContent = msg;
    t.style.cssText = 'position:absolute;left:50%;bottom:16px;transform:translateX(-50%);background:rgba(37,99,235,.92);color:#fff;padding:7px 14px;border-radius:20px;font-size:12px;z-index:40;box-shadow:0 6px 18px rgba(0,0,0,.4)';
    $('stage').appendChild(t);
    setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 2200);
  }

  /* ============ 调色板 ============ */
  function buildPalette() {
    var groups = { switch: '交换机', router: '路由器', firewall: '防火墙', pc: '终端', server: '服务器' };
    var order = ['switch', 'router', 'firewall', 'pc', 'server'];
    var html = '';
    order.forEach(function (t) {
      var items = H.MODELS.filter(function (m) { return m.type === t; });
      if (!items.length) return;
      html += '<div class="pal-group-title">' + groups[t] + '</div>';
      items.forEach(function (m) {
        var col = { switch: '#2563eb', router: '#16a34a', firewall: '#dc2626', pc: '#64748b', server: '#a855f7' }[t] || '#475569';
        html += '<div class="pal-item" draggable="true" data-model="' + m.id + '">' +
          '<div class="pal-ico" style="background:' + col + '">' + ({ switch: 'SW', router: 'RT', firewall: 'FW', pc: 'PC', server: 'SV' }[t]) + '</div>' +
          '<div class="pal-meta"><div class="pal-name">' + esc(m.label) + '</div>' +
          '<div class="pal-model">' + esc(m.id) + '</div>' +
          '<div class="pal-desc">' + esc(m.desc) + '</div></div></div>';
      });
    });
    $('palette-list').innerHTML = html;
    Array.prototype.forEach.call(document.querySelectorAll('.pal-item'), function (it) {
      it.addEventListener('dragstart', function (e) { e.dataTransfer.setData('text/model', it.getAttribute('data-model')); e.dataTransfer.effectAllowed = 'copy'; });
      it.addEventListener('click', function () { addCenter(it.getAttribute('data-model')); });
    });
  }
  function addDeviceAt(modelId, x, y) {
    var m = H.Model.get(modelId);
    var name = S.uniqueName(m ? m.label : modelId);
    var dev = S.addDevice(modelId, name, Math.round(x), Math.round(y));
    TOPO.select(dev.id);
    return dev;
  }
  function addCenter(modelId) {
    var r = $('stage').getBoundingClientRect();
    var p = clientToContent(r.left + r.width / 2, r.top + r.height / 2);
    addDeviceAt(modelId, p.x - 75, p.y - 25);
  }

  /* ============ 检视器 ============ */
  function Inspector() { }
  Inspector.show = function (id) {
    var d = S.getDevice(id); if (!d) return;
    currentInspectorId = id;
    $('inspector-empty').style.display = 'none';
    var body = $('inspector-body'); body.style.display = 'block';
    var col = { switch: '#2563eb', router: '#16a34a', firewall: '#dc2626', pc: '#64748b', server: '#a855f7' }[d.type] || '#475569';
    var abbr = { switch: 'SW', router: 'RT', firewall: 'FW', pc: 'PC', server: 'SV' }[d.type] || '?';
    var h = '<div class="insp-head"><div class="insp-ico" style="background:' + col + '">' + abbr + '</div>' +
      '<div><div class="insp-title">' + esc(d.cfg.hostname || d.name) + '</div>' +
      '<div class="insp-sub">' + esc(d.model) + ' · ' + H.Model.typeName(d.type) + '</div></div></div>';
    h += '<div class="insp-actions">' +
      '<button class="btn" data-act="cli">打开CLI</button>' +
      '<button class="btn" data-act="rename">重命名</button>' +
      '<button class="btn" data-act="export-cfg">导出.cfg</button>' +
      '<button class="btn" data-act="del">删除</button></div>';

    h += renderDeviceInfo(d);
    if (d.type === 'pc' || d.type === 'server') h += renderHost(d);
    else h += renderPorts(d);

    h += renderLinks(d);
    body.innerHTML = h;
  };
  Inspector.clear = function () {
    currentInspectorId = null;
    $('inspector-empty').style.display = 'flex';
    $('inspector-body').style.display = 'none';
  };

  function renderPorts(d) {
    var h = '<div class="sec-title">端口与状态（' + d.ports.length + '）</div>';
    d.ports.forEach(function (p) {
      var st = portStatus(d, p.name);
      var ip = portInfo(d, p.name);
      var peer = S.getPeer(d.id, p.name);
      var peerTxt = peer ? (' → ' + esc(S.getDevice(peer.dev).cfg.hostname) + ' ' + esc(peer.port)) : '';
      h += '<div class="port-row">' +
        '<span class="led ' + statusClass(st) + '"></span>' +
        '<span class="pname">' + esc(p.name) + '</span>' +
        '<span class="pstate">' + statusText(st) + '</span>' +
        '<span class="pvlan">' + esc(ip) + esc(peerTxt) + '</span>' +
        '<span class="plink' + (linking && linking.dev === d.id && linking.port === p.name ? ' disabled' : '') + '" data-link-dev="' + d.id + '" data-link-port="' + esc(p.name) + '">连线</span>' +
        '</div>';
    });
    return h;
  }
  function renderHost(d) {
    var p = d.ports[0];
    var f = d.cfg.ifaces[p.name];
    var ip = f && f.ip ? (f.ip.addr + ' / ' + U.maskLen(f.ip.mask)) : '未配置';
    var h = '<div class="sec-title">终端配置</div>';
    h += '<div class="kv"><span>接口</span><span>' + esc(p.name) + '</span></div>';
    h += '<div class="kv"><span>IP 地址</span><span><b>' + esc(ip) + '</b></span></div>';
    h += '<div class="host-row"><label>IP</label><input id="pc-ip" value="' + (f && f.ip ? f.ip.addr : '') + '"></div>';
    h += '<div class="host-row"><label>掩码</label><input id="pc-mask" value="' + (f && f.ip ? U.lenMask(U.maskLen(f.ip.mask)) : '255.255.255.0') + '"></div>';
    h += '<div class="host-row"><label>网关</label><input id="pc-gw" value="' + (d.cfg.defaultRoute || '') + '" placeholder="默认网关"></div>';
    h += '<div class="host-row"><label>目标</label><input id="pc-target" placeholder="如 192.168.10.20"><button class="btn btn-ping" data-act="pc-ping">Ping</button></div>';
    h += '<div class="host-row host-actions"><span class="btn btn-apply" data-act="pc-apply">应用 IP 配置</span></div>';
    return h;
  }
  function renderLinks(d) {
    var ls = S.linksOf(d.id);
    var h = '<div class="sec-title">链路（' + ls.length + '）</div>';
    if (!ls.length) h += '<div class="ip-line" style="color:var(--muted)">暂无链路</div>';
    ls.forEach(function (l) {
      var peerId = (l.a.dev === d.id) ? l.b.dev : l.a.dev;
      var myPort = (l.a.dev === d.id) ? l.a.port : l.b.port;
      var peerPort = (l.a.dev === d.id) ? l.b.port : l.a.port;
      var pd = S.getDevice(peerId);
      var sa = portStatus(d, myPort), sb = portStatus(pd, peerPort);
      var st = (sa === 'up' && sb === 'up') ? 'up' : (sa === 'block' || sb === 'block') ? 'block' : 'down';
      h += '<div class="link-card"><div class="lc-top"><span class="lc-ports">' + esc(myPort) + ' ⇔ ' + esc(peerPort) + '</span>' +
        '<span class="lc-del" data-del-link="' + l.id + '">删除</span></div>' +
        '<div class="lc-state">对端：' + esc(pd ? pd.cfg.hostname : '?') + ' · <b style="color:' +
        ({ up: '#22c55e', block: '#f59e0b', down: '#ef4444', none: '#7d8997' }[st]) + '">' + statusText(st) + '</b></div></div>';
    });
    return h;
  }

  /* 设备介绍 + 关键参数摘要（点击设备时显示在右侧检视器顶部） */
  function renderDeviceInfo(d) {
    function kv(k, v) { return '<div class="kv"><span>' + k + '</span><span>' + v + '</span></div>'; }
    var m = H.Model.get(d.model);
    var desc = (m && m.desc) ? m.desc : '';
    var typeName = H.Model.typeName(d.type);
    var typeCount = {};
    d.ports.forEach(function (p) { var t = p.type || '?'; typeCount[t] = (typeCount[t] || 0) + 1; });
    var typeStr = Object.keys(typeCount).map(function (k) { return k + '×' + typeCount[k]; }).join('，') || '无';
    var cfg = d.cfg || {};
    var vlanN = cfg.vlans ? Object.keys(cfg.vlans).length : 0;
    var staticN = (cfg.staticRoutes && cfg.staticRoutes.length) ? cfg.staticRoutes.length : 0;
    var stpMode = (cfg.stp && cfg.stp.mode) ? cfg.stp.mode : '未配置';
    var summaries = [];
    if (cfg.telnet && cfg.telnet.enable) summaries.push('Telnet 已开启');
    if (cfg.ssh && cfg.ssh.enable) summaries.push('SSH 已开启');
    if (cfg.snmp && cfg.snmp.enable) summaries.push('SNMP 已开启');
    if (cfg.ospf && cfg.ospf.enable) summaries.push('OSPF');
    if (cfg.rip && cfg.rip.enable) summaries.push('RIP');
    if (cfg.bgp && cfg.bgp.enable) summaries.push('BGP');
    if (cfg.acl) { var an = Object.keys(cfg.acl).length; if (an) summaries.push('ACL×' + an); }
    var h = '<div class="sec-title">设备介绍</div>';
    h += '<div class="dev-desc">' + esc(desc || (typeName + ' 设备')) + '</div>';
    h += '<div class="sec-title">设备参数</div>';
    h += kv('名称', esc(d.cfg.hostname || d.name));
    h += kv('型号', esc(d.model));
    h += kv('类型', esc(typeName) + (d.l3 ? ' · 三层' : ' · 二层'));
    h += kv('设备 ID', esc(d.id));
    h += kv('坐标', '(' + d.x + ', ' + d.y + ')' );
    h += kv('端口', d.ports.length + ' 个 · ' + esc(typeStr));
    h += kv('VLAN', vlanN ? (vlanN + ' 个') : '未配置');
    h += kv('STP', esc(stpMode));
    h += kv('静态路由', staticN + ' 条');
    if (summaries.length) h += '<div class="dev-summary">' + summaries.map(function (s2) { return '<span class="tag">' + s2 + '</span>'; }).join('') + '</div>';
    return h;
  }

  /* 检视器点击委托 */
  function onInspectorClick(e) {
    var el = e.target;
    var act = el.getAttribute && el.getAttribute('data-act');
    if (el.getAttribute && el.getAttribute('data-link-dev')) { startOrFinishLink(el.getAttribute('data-link-dev'), el.getAttribute('data-link-port')); return; }
    var delLink = el.getAttribute && el.getAttribute('data-del-link');
    if (delLink) { S.removeLink(delLink); return; }
    if (!currentInspectorId) return;
    var d = S.getDevice(currentInspectorId); if (!d) return;
    if (act === 'cli') { TERM.openTab(d.id); }
    else if (act === 'rename') { renameDevice(d); }
    else if (act === 'export-cfg') { exportDeviceCfg(currentInspectorId); }
    else if (act === 'del') {
      if (window.confirm('确认删除设备 ' + (d.cfg.hostname || d.name) + '？')) {
        var id = d.id; S.removeDevice(id);
        if (currentInspectorId === id) Inspector.clear();
        TERM.refreshTabs();
      }
    } else if (act === 'pc-apply') {
      var ip = $('pc-ip').value.trim(), mask = $('pc-mask').value.trim(), gw = $('pc-gw') ? $('pc-gw').value.trim() : '';
      if (U.isIp(ip) && U.maskLen(mask) != null) {
        H.Host.applyIp(d, ip, mask, gw);
        Sim.invalidate(); S.emit('change'); toast('已配置 ' + ip + '/' + U.maskLen(mask) + (gw ? ('，网关 ' + gw) : ''));
      } else toast('IP 或掩码格式不正确');
    } else if (act === 'pc-ping') {
      var t = $('pc-target').value.trim();
      if (!t) { toast('请输入 Ping 目标'); return; }
      var r = Sim.ping(d, t, {});
      TERM.printOut(d.id, (typeof r.out === 'string') ? r.out : r.out.join('\n'), 'out');
    }
  }
  function renameDevice(d) {
    var n = window.prompt('设备名称（同时作为 sysname）：', d.cfg.hostname || d.name);
    if (!n) return;
    d.cfg.hostname = n; d.cfg.sysname = n; d.name = n;
    S.emit('change'); S.saveLocal(); TERM.refreshTabs();
  }

  /* 端口连线 */
  function startOrFinishLink(devId, port) {
    if (!linking) { linking = { dev: devId, port: port }; showLinkBanner(); toast('已选 ' + S.getDevice(devId).cfg.hostname + ' ' + port + '，请点击对端端口的「连线」完成'); }
    else if (linking.dev === devId && linking.port === port) { linking = null; hideLinkBanner(); }
    else {
      var r = S.addLink(linking.dev, linking.port, devId, port);
      linking = null; hideLinkBanner();
      if (r.err) toast(r.err); else toast('连线成功');
    }
  }
  function showLinkBanner() {
    var b = $('linking-banner'); b.style.display = 'block';
    b.textContent = '连线中：已选起点，请点击拓扑另一侧设备的端口「连线」按钮完成（再次点击起点取消）。';
  }
  function hideLinkBanner() { $('linking-banner').style.display = 'none'; }

  /* ============ 实验场景 ============ */
  var SCENARIOS = [
    {
      name: 'VLAN 划分与 trunk 实验',
      devices: [
        { model: 'S5130-28S-EI', name: 'SW1', x: 80, y: 70 },
        { model: 'S5130-28S-EI', name: 'SW2', x: 460, y: 70 },
        { model: 'PC', name: 'PC1', x: 80, y: 300 },
        { model: 'PC', name: 'PC2', x: 460, y: 300 }
      ],
      links: [
        ['SW1', 'GE1/0/1', 'SW2', 'GE1/0/1'],
        ['PC1', 'GE0/1', 'SW1', 'GE1/0/2'],
        ['PC2', 'GE0/1', 'SW2', 'GE1/0/2']
      ],
      config: [
        { dev: 'PC1', cmds: ['set ip 192.168.10.10 255.255.255.0'] },
        { dev: 'PC2', cmds: ['set ip 192.168.10.20 255.255.255.0'] },
        { dev: 'SW1', cmds: ['sysname SW1', 'system-view', 'vlan 10', 'port GigabitEthernet1/0/2', 'quit', 'interface GigabitEthernet1/0/2', 'port link-type access', 'port access vlan 10', 'quit', 'interface GigabitEthernet1/0/1', 'port link-type trunk', 'port trunk permit vlan all', 'return'] },
        { dev: 'SW2', cmds: ['sysname SW2', 'system-view', 'vlan 10', 'port GigabitEthernet1/0/2', 'quit', 'interface GigabitEthernet1/0/2', 'port link-type access', 'port access vlan 10', 'quit', 'interface GigabitEthernet1/0/1', 'port link-type trunk', 'port trunk permit vlan all', 'return'] }
      ],
      goal: [
        '理解 VLAN 的作用：隔离广播域、按业务划分二层网络',
        '掌握 access 端口与 trunk 端口的区别与配置方法',
        '验证同一 VLAN 跨两台交换机能够互通'
      ],
      steps: [
        '观察拓扑：SW1 与 SW2 通过 GE1/0/1 互联，PC1、PC2 分别接入各自的 GE1/0/2',
        '在 SW1、SW2 上创建 VLAN 10',
        '把连接 PC 的 GE1/0/2 配置为 access 并加入 VLAN 10',
        '把交换机互联口 GE1/0/1 配置为 trunk，允许所有 VLAN 通过',
        '在 PC1 上执行 ping 192.168.10.20 验证连通性',
        '用 display vlan、display interface 查看配置与端口状态'
      ],
      expected: [
        'PC1 ping PC2 成功（同一 VLAN 跨交换机互通）',
        'display vlan 10 中 GE1/0/2 为 access 成员、GE1/0/1 为 trunk 成员',
        '相关端口指示灯为绿色 UP',
        '若把互联 trunk 改回 access，PC1 与 PC2 将无法互通'
      ]
    },
    {
      name: '静态路由互连实验',
      devices: [
        { model: 'MSR36-20', name: 'R1', x: 90, y: 90 },
        { model: 'MSR36-20', name: 'R2', x: 470, y: 90 },
        { model: 'PC', name: 'PC1', x: 90, y: 320 },
        { model: 'PC', name: 'PC2', x: 470, y: 320 }
      ],
      links: [
        ['R1', 'GE0/0', 'PC1', 'GE0/1'],
        ['R2', 'GE0/0', 'PC2', 'GE0/1'],
        ['R1', 'GE0/1', 'R2', 'GE0/1']
      ],
      config: [
        { dev: 'PC1', cmds: ['set ip 10.1.1.10 255.255.255.0 10.1.1.1'] },
        { dev: 'PC2', cmds: ['set ip 10.2.2.10 255.255.255.0 10.2.2.1'] },
        { dev: 'R1', cmds: ['sysname R1', 'system-view', 'interface GE0/0', 'ip address 10.1.1.1 255.255.255.0', 'quit', 'interface GE0/1', 'ip address 12.1.1.1 255.255.255.0', 'quit', 'ip route-static 10.2.2.0 24 12.1.1.2', 'return'] },
        { dev: 'R2', cmds: ['sysname R2', 'system-view', 'interface GE0/0', 'ip address 10.2.2.1 255.255.255.0', 'quit', 'interface GE0/1', 'ip address 12.1.1.2 255.255.255.0', 'quit', 'ip route-static 10.1.1.0 24 12.1.1.1', 'return'] }
      ],
      goal: [
        '掌握路由器接口 IP 地址的配置方法',
        '理解直连路由与非直连网段的区别',
        '通过静态路由实现不同网段之间的互通'
      ],
      steps: [
        '为 R1 的 GE0/0（10.1.1.1）与 GE0/1（12.1.1.1）配置 IP 地址',
        '为 R2 的 GE0/0（10.2.2.1）与 GE0/1（12.1.1.2）配置 IP 地址',
        '在 R1 上配置到 10.2.2.0/24 的静态路由，下一跳 12.1.1.2',
        '在 R2 上配置到 10.1.1.0/24 的静态路由，下一跳 12.1.1.1',
        '用 display ip routing-table 查看路由表是否出现 Static 条目',
        '在 PC1 上执行 ping 10.2.2.10 验证跨网段连通'
      ],
      expected: [
        'PC1 ping PC2 成功（跨网段互通）',
        'display ip routing-table 中能看到 Proto 为 Static 的路由条目',
        '若只配置单向静态路由，ping 不通——可用来演示路由的双向性',
        'PC1、PC2 的网关分别指向 R1、R2 的 GE0/0 接口地址'
      ]
    },
    {
      name: 'OSPF 动态路由实验',
      devices: [
        { model: 'MSR36-20', name: 'R1', x: 90, y: 120 },
        { model: 'MSR36-20', name: 'R2', x: 380, y: 60 },
        { model: 'MSR36-20', name: 'R3', x: 380, y: 280 },
        { model: 'PC', name: 'PC1', x: 90, y: 320 }
      ],
      links: [
        ['R1', 'GE0/1', 'R2', 'GE0/1'],
        ['R2', 'GE0/2', 'R3', 'GE0/2'],
        ['R1', 'GE0/2', 'R3', 'GE0/1'],
        ['R1', 'GE0/0', 'PC1', 'GE0/1']
      ],
      config: [
        { dev: 'PC1', cmds: ['set ip 192.168.1.10 255.255.255.0 192.168.1.1'] },
        { dev: 'R1', cmds: ['sysname R1', 'system-view', 'interface GE0/0', 'ip address 192.168.1.1 255.255.255.0', 'quit', 'interface GE0/1', 'ip address 10.0.12.1 255.255.255.0', 'quit', 'interface GE0/2', 'ip address 10.0.13.1 255.255.255.0', 'quit', 'ospf 1', 'router-id 1.1.1.1', 'area 0', 'network 192.168.1.0 0.0.0.255', 'network 10.0.12.0 0.0.0.255', 'network 10.0.13.0 0.0.0.255', 'return'] },
        { dev: 'R2', cmds: ['sysname R2', 'system-view', 'interface GE0/1', 'ip address 10.0.12.2 255.255.255.0', 'quit', 'interface GE0/2', 'ip address 10.0.23.2 255.255.255.0', 'quit', 'ospf 1', 'router-id 2.2.2.2', 'area 0', 'network 10.0.12.0 0.0.0.255', 'network 10.0.23.0 0.0.0.255', 'return'] },
        { dev: 'R3', cmds: ['sysname R3', 'system-view', 'interface GE0/1', 'ip address 10.0.13.3 255.255.255.0', 'quit', 'interface GE0/2', 'ip address 10.0.23.3 255.255.255.0', 'quit', 'ospf 1', 'router-id 3.3.3.3', 'area 0', 'network 10.0.13.0 0.0.0.255', 'network 10.0.23.0 0.0.0.255', 'return'] }
      ],
      goal: [
        '掌握 OSPF 单区域（area 0）的基本配置',
        '理解 router-id、邻居建立与链路状态通告的过程',
        '体会动态路由自动学习与链路冗余切换的优势'
      ],
      steps: [
        '为 R1、R2、R3 的各接口配置 IP 地址',
        '在每台路由器上启用 OSPF 进程 1 并配置唯一的 router-id',
        '进入 area 0，把各自的直连网段 network 宣告进 OSPF',
        '用 display ospf peer 查看邻居状态',
        '用 display ip routing-table 查看学习到的 OSPF 路由',
        '在 PC1 上 ping 各路由器的非直连接口地址'
      ],
      expected: [
        'display ospf peer 中邻居状态为 Full',
        '路由表出现 Proto 为 OSPF 的路由，能自动学习非直连网段',
        'PC1 能 ping 通 R2、R3 上的网段地址',
        '断开 R1 与 R2 之间的链路后，OSPF 自动收敛，流量改经 R3 转发'
      ]
    },
    {
      name: 'RSTP 冗余与阻塞实验',
      devices: [
        { model: 'S5560X-54C-EI', name: 'CORE', x: 250, y: 70 },
        { model: 'S5130-28S-EI', name: 'ACC', x: 250, y: 280 },
        { model: 'PC', name: 'PC1', x: 80, y: 300 },
        { model: 'PC', name: 'PC2', x: 430, y: 300 }
      ],
      links: [
        ['CORE', 'GE1/0/1', 'ACC', 'GE1/0/1'],
        ['CORE', 'GE1/0/2', 'ACC', 'GE1/0/2'],
        ['PC1', 'GE0/1', 'ACC', 'GE1/0/3'],
        ['PC2', 'GE0/1', 'ACC', 'GE1/0/4']
      ],
      config: [
        { dev: 'CORE', cmds: ['sysname CORE', 'system-view', 'stp mode rstp', 'stp root primary', 'return'] },
        { dev: 'ACC', cmds: ['sysname ACC', 'system-view', 'stp mode rstp', 'return'] },
        { dev: 'PC1', cmds: ['set ip 172.16.0.10 255.255.255.0'] },
        { dev: 'PC2', cmds: ['set ip 172.16.0.20 255.255.255.0'] }
      ],
      goal: [
        '理解二层环路带来的广播风暴风险',
        '掌握 RSTP 的基本配置与根桥选举',
        '观察阻塞端口的产生与链路故障时的自动切换'
      ],
      steps: [
        '观察拓扑：CORE 与 ACC 之间有两条链路，形成物理环路',
        '在 CORE 与 ACC 上启用 RSTP（stp mode rstp）',
        '将 CORE 配置为根桥（stp root primary）',
        '用 display stp brief 查看各端口的角色与状态',
        '在拓扑上找到被阻塞的端口（指示灯为橙色）',
        '手动 shutdown 一条主用链路，观察备份链路自动切换为转发'
      ],
      expected: [
        '出现一个阻塞端口（DISCARDING），其指示灯为橙色',
        'display stp brief 能分辨根端口、指定端口与备份端口',
        '断开主用链路后，原阻塞端口自动转为转发状态，网络恢复连通',
        'PC1 与 PC2 在环路存在的情况下仍能正常互通且不产生风暴'
      ]
    },
    {
      name: '广域网 PPP/HDLC 接入实验',
      devices: [
        { model: 'MSR36-20', name: 'R1', x: 110, y: 110 },
        { model: 'MSR36-20', name: 'R2', x: 470, y: 110 },
        { model: 'PC', name: 'PC1', x: 110, y: 340 },
        { model: 'PC', name: 'PC2', x: 470, y: 340 }
      ],
      links: [
        ['R1', 'Serial1/0', 'R2', 'Serial1/0'],
        ['R1', 'GE0/0', 'PC1', 'GE0/1'],
        ['R2', 'GE0/0', 'PC2', 'GE0/1']
      ],
      config: [
        { dev: 'PC1', cmds: ['set ip 10.1.1.10 255.255.255.0 10.1.1.1'] },
        { dev: 'PC2', cmds: ['set ip 10.2.2.10 255.255.255.0 10.2.2.1'] },
        { dev: 'R1', cmds: ['sysname R1', 'system-view',
          'local-user R2 class manage', 'password simple h3c', 'quit',
          'interface Serial1/0', 'link-protocol ppp', 'ppp authentication-mode chap', 'ppp chap user R1', 'ppp chap password h3c', 'ip address 12.1.1.1 255.255.255.252', 'quit',
          'interface GE0/0', 'ip address 10.1.1.1 255.255.255.0', 'quit',
          'ip route-static 10.2.2.0 24 12.1.1.2', 'return'] },
        { dev: 'R2', cmds: ['sysname R2', 'system-view',
          'local-user R1 class manage', 'password simple h3c', 'quit',
          'interface Serial1/0', 'link-protocol ppp', 'ppp authentication-mode chap', 'ppp chap user R2', 'ppp chap password h3c', 'ip address 12.1.1.2 255.255.255.252', 'quit',
          'interface GE0/0', 'ip address 10.2.2.1 255.255.255.0', 'quit',
          'ip route-static 10.1.1.0 24 12.1.1.1', 'return'] }
      ],
      goal: [
        '理解广域网串行链路与以太网链路的差异（点对点、需封装协议）',
        '掌握 Serial 口 PPP 封装与 IP 地址配置方法',
        '掌握 PPP CHAP 双向认证的配置与排查',
        '通过静态路由实现跨广域网的两个局域网互通'
      ],
      steps: [
        '为 R1、R2 的 Serial1/0 配置链路封装 PPP 与互联 IP（12.1.1.0/30）',
        '配置双方 Loop 互证：R1 上 local-user R2 + 密码 h3c，R2 上 local-user R1 + 密码 h3c',
        '双方 Serial 口均配置 ppp authentication-mode chap，并各自用 ppp chap user/password 向对端发送凭据',
        '为两侧局域网 GE0/0 配置 IP，并互指静态路由经 12.1.1.x',
        '用 display interface Serial1/0 查看 Line protocol state 是否为 UP',
        '在 PC1 上 ping 10.2.2.10 验证跨广域网互通'
      ],
      expected: [
        'display interface Serial1/0 中 Line protocol state 为 UP',
        '拓扑上 Serial1/0 链路指示灯为绿色 UP',
        'PC1 能 ping 通 PC2（跨广域网互通）',
        '把任一端封装改成 hdlc（两端不一致）或删除对方的 local-user，链路协议即 DOWN，ping 不通——用于演示封装/认证一致性'
      ]
    },
    {
      name: 'NAT 地址转换（Easy-IP）实验',
      devices: [
        { model: 'MSR36-20', name: 'R1', x: 110, y: 110 },
        { model: 'MSR36-20', name: 'R2', x: 470, y: 110 },
        { model: 'PC', name: 'PC1', x: 110, y: 340 },
        { model: 'PC', name: 'PC2', x: 470, y: 340 }
      ],
      links: [
        ['R1', 'GE0/0', 'PC1', 'GE0/1'],
        ['R1', 'GE0/1', 'R2', 'GE0/1'],
        ['R2', 'GE0/0', 'PC2', 'GE0/1']
      ],
      config: [
        { dev: 'PC1', cmds: ['set ip 192.168.1.10 255.255.255.0 192.168.1.1'] },
        { dev: 'PC2', cmds: ['set ip 200.2.2.10 255.255.255.0 200.2.2.1'] },
        { dev: 'R1', cmds: ['sysname R1', 'system-view',
          'acl basic 2000', 'rule permit source 192.168.1.0 0.0.0.255', 'quit',
          'interface GE0/0', 'ip address 192.168.1.1 255.255.255.0', 'quit',
          'interface GE0/1', 'ip address 200.1.1.1 255.255.255.252', 'nat outbound 2000', 'quit',
          'ip route-static 200.2.2.0 24 200.1.1.2', 'return'] },
        { dev: 'R2', cmds: ['sysname R2', 'system-view',
          'interface GE0/1', 'ip address 200.1.1.2 255.255.255.252', 'quit',
          'interface GE0/0', 'ip address 200.2.2.1 255.255.255.0', 'quit', 'return'] }
      ],
      goal: [
        '理解私网地址无法直接在外网路由，必须由边界路由器做地址转换（NAT）',
        '掌握 Easy-IP 方式：nat outbound <acl> 以出接口 IP 作为转换后地址',
        '掌握 ACL 在 NAT 中的作用：只有匹配 permit 的私网流量才被转换',
        '通过 display nat session 观察转换前后的源地址映射'
      ],
      steps: [
        '为 R1 内网口 GE0/0（192.168.1.1/24）和外网口 GE0/1（200.1.1.1/30）配置 IP',
        '创建基本 ACL 2000，允许源 192.168.1.0/24',
        '在 R1 外网口 GE0/1 下配置 nat outbound 2000（Easy-IP）',
        '为 R1 配置到外网 200.2.2.0/24 的静态路由经 200.1.1.2',
        '注意 R2 不配置任何到私网 192.168.1.0/24 的路由（外网不可知私网）',
        '在 PC1 上执行 ping 200.2.2.10，再用 display nat session 查看转换表'
      ],
      expected: [
        'PC1 能 ping 通 PC2（200.2.2.10），尽管 PC2 无法路由回私网地址',
        'display nat session 中出现 192.168.1.10 => 200.1.1.1 的映射',
        '若删除 R1 GE0/1 的 nat outbound，PC1 ping PC2 立即不通（外网无回程路由）',
        'display nat outbound 显示 GE0/1 绑定 ACL 2000 且类型为 Easy-IP'
      ]
    },
    {
      name: 'IS-IS 路由 + Route-Policy 实验',
      devices: [
        { model: 'MSR36-20', name: 'R1', x: 110, y: 110 },
        { model: 'MSR36-20', name: 'R2', x: 470, y: 110 },
        { model: 'PC', name: 'PC1', x: 110, y: 340 },
        { model: 'PC', name: 'PC2', x: 470, y: 340 }
      ],
      links: [
        ['R1', 'GE0/0', 'PC1', 'GE0/1'],
        ['R1', 'GE0/1', 'R2', 'GE0/1'],
        ['R2', 'GE0/0', 'PC2', 'GE0/1']
      ],
      config: [
        { dev: 'PC1', cmds: ['set ip 192.168.1.10 255.255.255.0 192.168.1.1'] },
        { dev: 'PC2', cmds: ['set ip 192.168.2.10 255.255.255.0 192.168.2.1'] },
        { dev: 'R1', cmds: ['sysname R1', 'system-view',
          'interface GE0/0', 'ip address 192.168.1.1 255.255.255.0', 'isis enable 1', 'quit',
          'interface GE0/1', 'ip address 12.1.1.1 255.255.255.252', 'isis enable 1', 'quit',
          'isis 1', 'is-level level-1-2', 'network-entity 49.0001.0000.0000.0001.00',
          'import-route static route-policy RP1', 'quit',
          'ip ip-prefix LOOP index 10 permit 172.16.1.0 24',
          'route-policy RP1 deny node 10', 'if-match ip-prefix LOOP', 'quit',
          'route-policy RP1 permit node 20', 'apply cost 20', 'quit',
          'ip route-static 172.16.1.0 24 12.1.1.2',
          'ip route-static 172.16.2.0 24 12.1.1.2', 'return'] },
        { dev: 'R2', cmds: ['sysname R2', 'system-view',
          'interface GE0/0', 'ip address 192.168.2.1 255.255.255.0', 'isis enable 1', 'quit',
          'interface GE0/1', 'ip address 12.1.1.2 255.255.255.252', 'isis enable 1', 'quit',
          'isis 1', 'is-level level-1-2', 'network-entity 49.0001.0000.0000.0002.00', 'quit', 'return'] }
      ],
      goal: [
        '理解 IS-IS 链路状态协议的基本配置（进程、网络实体、接口使能）',
        '掌握 Route-Policy 的节点匹配与动作：deny 节点过滤路由、permit 节点修改属性',
        '体会引入外部路由（import-route）配合路由策略对路由表的真实影响'
      ],
      steps: [
        '为 R1、R2 互联口 GE0/1 配置 IP（12.1.1.0/30），并在相关接口执行 isis enable 1',
        '在 R1、R2 上创建 IS-IS 进程 1，配置 is-level 与 network-entity',
        '在 R1 上创建两条静态路由 172.16.1.0/24 与 172.16.2.0/24 模拟外部网络',
        '创建地址前缀列表 LOOP 匹配 172.16.1.0/24，并创建 Route-Policy RP1：node 10 deny 匹配 LOOP，node 20 permit 并 apply cost 20',
        '在 R1 的 IS-IS 下用 import-route static route-policy RP1 引入静态路由',
        '用 display isis peer 查看邻接、display ip routing-table / display route-policy 观察结果'
      ],
      expected: [
        'display isis peer 中 R1 与 R2 建立邻接',
        'R2 路由表中出现 172.16.2.0/24（IS_ASE，cost 被策略改为 20），但 172.16.1.0/24 因被 RP1 deny 节点过滤而缺失',
        'display route-policy RP1 显示两个节点及其 match/apply 配置',
        'PC2 能 ping 通 PC1（192.168.1.10），验证 IS-IS 已学习到对端网段'
      ]
    },
    {
      name: 'VRRP 网关冗余实验',
      devices: [
        { model: 'S5130-28S-EI', name: 'SW', x: 290, y: 60 },
        { model: 'MSR36-20', name: 'R1', x: 110, y: 320 },
        { model: 'MSR36-20', name: 'R2', x: 470, y: 320 },
        { model: 'PC', name: 'PC1', x: 290, y: 560 }
      ],
      links: [
        ['PC1', 'GE0/1', 'SW', 'GE1/0/1'],
        ['R1', 'GE0/0', 'SW', 'GE1/0/2'],
        ['R2', 'GE0/0', 'SW', 'GE1/0/3'],
        ['R1', 'GE0/1', 'R2', 'GE0/1']
      ],
      config: [
        { dev: 'PC1', cmds: ['set ip 192.168.1.10 255.255.255.0 192.168.1.254'] },
        { dev: 'R1', cmds: ['sysname R1', 'system-view',
          'interface GE0/0', 'ip address 192.168.1.1 255.255.255.0',
          'vrrp vrid 1 virtual-ip 192.168.1.254', 'vrrp vrid 1 priority 120', 'quit',
          'interface GE0/1', 'ip address 12.1.1.1 255.255.255.252', 'quit', 'return'] },
        { dev: 'R2', cmds: ['sysname R2', 'system-view',
          'interface GE0/0', 'ip address 192.168.1.2 255.255.255.0',
          'vrrp vrid 1 virtual-ip 192.168.1.254', 'vrrp vrid 1 priority 100', 'quit',
          'interface GE0/1', 'ip address 12.1.1.2 255.255.255.252', 'quit', 'return'] }
      ],
      goal: [
        '理解 VRRP 的作用：把多台路由器组成一个虚拟网关，PC 只需把网关指向虚拟 IP',
        '掌握 VRRP 主备选举：优先级高者成为 Master 转发流量，其余为 Backup 待命',
        '体会故障切换：Master 接口 down 后 Backup 自动接管虚拟 IP，业务不中断'
      ],
      steps: [
        '在 R1、R2 连接交换机的 GE0/0 上配置同网段 IP（192.168.1.0/24）',
        '在两台路由器 GE0/0 上配置 vrrp vrid 1 virtual-ip 192.168.1.254，并将 R1 优先级调为 120（高于 R2 的 100）',
        '把 PC1 的默认网关设为虚拟 IP 192.168.1.254',
        '用 display vrrp 查看主备状态，并用 PC1 ping 192.168.1.254 验证虚拟网关可达',
        '在 R1 的 GE0/0 执行 shutdown 模拟主用故障，再次 display vrrp 与 ping，观察 Backup（R2）接管'
      ],
      expected: [
        'display vrrp 中 R1 为 Master、R2 为 Backup，虚拟 IP 均为 192.168.1.254',
        'PC1 能 ping 通虚拟网关 192.168.1.254（流量经 Master R1）',
        'R1 的 GE0/0 shutdown 后重新选举，R2 变为 Master，PC1 仍能 ping 通 192.168.1.254（故障切换生效）'
      ]
    },
    {
      id: 8,
      name: 'IPv6 双栈端到端转发实验',
      devices: [
        { model: 'PC', name: 'PC1', x: 110, y: 360 },
        { model: 'MSR36-20', name: 'R1', x: 360, y: 130 },
        { model: 'MSR36-20', name: 'R2', x: 360, y: 560 },
        { model: 'PC', name: 'PC2', x: 600, y: 360 }
      ],
      links: [
        ['PC1', 'GE0/1', 'R1', 'GE0/0'],
        ['R1', 'GE0/1', 'R2', 'GE0/1'],
        ['R2', 'GE0/0', 'PC2', 'GE0/1']
      ],
      config: [
        { dev: 'PC1', cmds: ['set ip 192.168.1.10 255.255.255.0 192.168.1.1', 'set ipv6 2001:db8:1::10/64 2001:db8:1::1'] },
        { dev: 'PC2', cmds: ['set ip 192.168.2.20 255.255.255.0 192.168.2.1', 'set ipv6 2001:db8:2::20/64 2001:db8:2::1'] },
        { dev: 'R1', cmds: ['sysname R1', 'system-view', 'ipv6',
          'interface GE0/0', 'ip address 192.168.1.1 255.255.255.0', 'ipv6 address 2001:db8:1::1/64', 'quit',
          'interface GE0/1', 'ip address 10.0.12.1 255.255.255.0', 'ipv6 address 2001:db8:12::1/64', 'quit',
          'ip route-static 192.168.2.0 24 10.0.12.2',
          'ipv6 route-static 2001:db8:2:: 64 2001:db8:12::2', 'return'] },
        { dev: 'R2', cmds: ['sysname R2', 'system-view', 'ipv6',
          'interface GE0/1', 'ip address 10.0.12.2 255.255.255.0', 'ipv6 address 2001:db8:12::2/64', 'quit',
          'interface GE0/0', 'ip address 192.168.2.1 255.255.255.0', 'ipv6 address 2001:db8:2::1/64', 'quit',
          'ip route-static 192.168.1.0 24 10.0.12.1',
          'ipv6 route-static 2001:db8:1:: 64 2001:db8:12::1', 'return'] }
      ],
      goal: [
        '理解 IPv6 双栈：同一链路同时承载 IPv4 与 IPv6，两个地址族互不干扰',
        '掌握接口 IPv6 地址配置（ipv6 address addr/prefix）与 IPv6 静态路由（ipv6 route-static）',
        '通过 ping 与 ping6 验证两个地址族都能跨网段互通'
      ],
      steps: [
        '为 R1、R2 互联口 GE0/1 配置 IPv4（10.0.12.0/24）与 IPv6（2001:db8:12::/64）地址',
        '为 R1 GE0/0、R2 GE0/0 配置各自局域网 IPv4/IPv6 地址，并将 PC 网关指向路由器对应地址',
        '在两台路由器上互指 IPv4 静态路由与 IPv6 静态路由（下一跳指向对端互联口地址）',
        '用 display ipv6 routing-table 查看 IPv6 路由，确认出现 Static 条目',
        '在 PC1 上分别执行 ping 192.168.2.20 与 ping6 2001:db8:2::20，验证双栈互通'
      ],
      expected: [
        'display ipv6 routing-table 中出现目的网段 2001:db8:2::/64 的 Static 路由',
        'PC1 能 ping 通 PC2 的 IPv4 地址 192.168.2.20',
        'PC1 能 ping6 通 PC2 的 IPv6 地址 2001:db8:2::20（双栈均互通）'
      ]
    }
  ];

  /* 实验说明：在左侧面板渲染当前场景的目标 / 步骤 / 预期结果 */
  function renderScenarioInfo(idx) {
    var box = $('scn-info'); if (!box) return;
    var spec = SCENARIOS[idx];
    if (!spec) {
      box.innerHTML = '<div class="scn-empty">加载「实验场景」后，这里会显示实验目标、步骤与预期结果。</div>';
      return;
    }
    function list(arr) {
      var h = '<ul>';
      (arr || []).forEach(function (t) { h += '<li>' + esc(t) + '</li>'; });
      return h + '</ul>';
    }
    var h = '<div class="scn-title">' + esc(spec.name) + '</div>';
    h += '<div class="scn-block"><div class="scn-t">实验目标</div>' + list(spec.goal) + '</div>';
    h += '<div class="scn-block"><div class="scn-t">实验步骤</div>' + list(spec.steps) + '</div>';
    h += '<div class="scn-block"><div class="scn-t">预期结果</div>' + list(spec.expected) + '</div>';
    box.innerHTML = h;
  }

  function loadScenario(idx) {
    var spec = SCENARIOS[idx]; if (!spec) return;
    renderScenarioInfo(idx);
    S.clearAll();
    var map = {};
    spec.devices.forEach(function (dd) {
      var dev = S.addDevice(dd.model, dd.name, dd.x, dd.y);
      map[dd.name] = dev;
    });
    (spec.links || []).forEach(function (l) {
      var a = map[l[0]], b = map[l[2]];
      if (a && b) S.addLink(a.id, l[1], b.id, l[3]);
    });
    (spec.config || []).forEach(function (c) {
      var dev = map[c.dev]; if (dev) applyCmds(dev, c.cmds);
    });
    Sim.invalidate();
    S.S.meta.title = spec.name; $('topo-title').value = spec.name;
    S.emit('reload');
    TOPO.fit();
    var first = S.S.devices[0];
    if (first) TERM.openTab(first.id);
    TOPO.setSelected(first ? first.id : null);
    toast('已加载实验：' + spec.name);
  }

  /* ============ 工具栏 ============ */
  function bindToolbar() {
    document.querySelectorAll('#toolbar .btn').forEach(function (b) {
      b.addEventListener('click', function () { onToolbar(b.getAttribute('data-act')); });
    });
    $('topo-title').addEventListener('change', function () { S.S.meta.title = this.value; S.saveLocal(); });
    // 场景下拉
    var btn = document.querySelector('[data-act="scenario"]');
    btn.addEventListener('click', function (e) { e.stopPropagation(); toggleScenarioMenu(); });
    document.addEventListener('click', function () { var m = $('scn-menu'); if (m) m.style.display = 'none'; });
    // 帮助
    $('modal-close').addEventListener('click', function () { $('modal').style.display = 'none'; });
    // 面板折叠 / 终端切换
    Array.prototype.forEach.call(document.querySelectorAll('.panel-toggle'), function (b) {
      b.addEventListener('click', function () { togglePanel(b.getAttribute('data-panel')); });
    });
    Array.prototype.forEach.call(document.querySelectorAll('.show-panel'), function (b) {
      b.addEventListener('click', function () { showPanel(b.getAttribute('data-panel')); });
    });
    var tt = document.getElementById('term-toggle');
    if (tt) tt.addEventListener('click', function () { togglePanel('terminal'); });
  }
  function togglePanel(name) {
    document.body.classList.toggle(name + '-hidden');
    setTimeout(function () { if (TOPO && TOPO.fit) TOPO.fit(); }, 0);
  }
  function showPanel(name) {
    document.body.classList.remove(name + '-hidden');
    setTimeout(function () { if (TOPO && TOPO.fit) TOPO.fit(); }, 0);
  }
  /* 侧栏宽度拖拽调整 */
  function bindPanelResizers() {
    var drag = null;
    Array.prototype.forEach.call(document.querySelectorAll('.v-resizer'), function (b) {
      b.addEventListener('mousedown', function (e) {
        e.preventDefault();
        var panel = b.getAttribute('data-resize');
        var cssVar = '--' + (panel === 'palette' ? 'pal' : panel === 'scenario' ? 'scn' : 'insp') + '-w';
        var startW = parseInt(getComputedStyle(document.documentElement).getPropertyValue(cssVar), 10) || 200;
        drag = { panel: panel, cssVar: cssVar, startX: e.clientX, startW: startW };
        document.body.style.cursor = 'col-resize';
      });
    });
    window.addEventListener('mousemove', function (e) {
      if (!drag) return;
      var dx = e.clientX - drag.startX;
      if (drag.panel === 'inspector') dx = -dx;
      var nw = drag.startW + dx;
      nw = Math.max(140, Math.min(600, nw));
      document.documentElement.style.setProperty(drag.cssVar, nw + 'px');
    });
    window.addEventListener('mouseup', function () {
      if (!drag) return;
      drag = null; document.body.style.cursor = '';
      setTimeout(function () { if (TOPO && TOPO.fit) TOPO.fit(); }, 0);
    });
  }
  /* 终端高度拖拽调整 */
  function bindTermResizer() {
    var bar = document.getElementById('term-resizer'); if (!bar) return;
    var drag = null;
    bar.addEventListener('mousedown', function (e) {
      e.preventDefault();
      var cur = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--term-h'), 10) || 268;
      drag = { startY: e.clientY, startH: cur };
      document.body.style.cursor = 'row-resize';
    });
    window.addEventListener('mousemove', function (e) {
      if (!drag) return;
      var nh = drag.startH + (drag.startY - e.clientY);
      nh = Math.max(120, Math.min(window.innerHeight - 120, nh));
      document.documentElement.style.setProperty('--term-h', nh + 'px');
    });
    window.addEventListener('mouseup', function () {
      if (!drag) return;
      drag = null; document.body.style.cursor = '';
      if (TOPO && TOPO.fit) TOPO.fit();
    });
  }
  function bindSaveModal() {
    $('save-modal-close').addEventListener('click', closeSaveModal);
    $('save-copy').addEventListener('click', function () {
      var ta = $('save-text');
      ta.select();
      document.execCommand('copy');
      toast('已复制到剪贴板，请粘贴到记事本后保存');
    });
    $('save-modal').addEventListener('click', function (e) { if (e.target === $('save-modal')) closeSaveModal(); });
  }
  function onToolbar(act) {
    if (act === 'save') { if (S.saveLocal()) toast('已保存到本地浏览器'); }
    else if (act === 'load') {
      if (S.loadLocal()) { S.emit('reload'); TOPO.fit(); toast('已从本地读取'); }
      else toast('没有可读取的本地数据');
    }
    else if (act === 'save-file') { exportProject(); }
    else if (act === 'open-file') { openProject(); }
    else if (act === 'import-cfg') { importCfg(); }
    else if (act === 'export') { exportConfig(); }
    else if (act === 'clear') {
      if (window.confirm('确认清空当前拓扑？此操作不可撤销。')) {
        S.clearAll(); TERM.renderEmpty(); Inspector.clear(); linking = null; hideLinkBanner();
        renderScenarioInfo(null);
      }
    }
    else if (act === 'linkmode') { TOPO.setLinkMode(!TOPO.isLinkMode()); }
    else if (act === 'fit') { TOPO.fit(); }
    else if (act === 'zoom-in') { TOPO.zoomBy(1.2); }
    else if (act === 'zoom-out') { TOPO.zoomBy(0.8); }
    else if (act === 'help') { showHelp(); }
    else if (act === 'about') { showAbout(); }
    else if (act === 'reset') {
      if (window.confirm('确认重置整个仿真实验室？将清空所有设备/连线并清除本地保存。')) {
        S.clearAll();
        try { localStorage.removeItem('h3c-sim-lab-v1'); } catch (e) {}
        TERM.renderEmpty(); Inspector.clear(); linking = null; hideLinkBanner();
        TOPO.setSelected(null);
        renderScenarioInfo(null);
        toast('已重置仿真实验室');
      }
    }
    else if (act === 'scenario') { /* 由独立监听处理 */ }
  }
  function toggleScenarioMenu() {
    var old = $('scn-menu'); if (old) { old.parentNode.removeChild(old); return; }
    var m = document.createElement('div');
    m.id = 'scn-menu';
    m.style.cssText = 'position:absolute;top:44px;left:50%;transform:translateX(-50%);background:#161c26;border:1px solid #2a3340;border-radius:8px;z-index:60;min-width:240px;box-shadow:0 10px 30px rgba(0,0,0,.5)';
    var h = '<div style="padding:8px 12px;color:#7d8997;font-size:11px;border-bottom:1px solid #2a3340">选择实验场景（将覆盖当前拓扑）</div>';
    SCENARIOS.forEach(function (s, i) {
      h += '<div class="scn-item" data-i="' + i + '" style="padding:9px 12px;cursor:pointer;border-bottom:1px solid #1c2430">' + esc(s.name) + '</div>';
    });
    m.innerHTML = h;
    document.body.appendChild(m);
    Array.prototype.forEach.call(m.querySelectorAll('.scn-item'), function (it) {
      it.addEventListener('click', function (e) {
        e.stopPropagation();
        // 彻底移除菜单，避免残留导致下次点击"实验场景"变成关闭而非打开
        if (m.parentNode) m.parentNode.removeChild(m);
        loadScenario(parseInt(it.getAttribute('data-i'), 10));
      });
    });
  }
  function exportConfig() {
    var devs = S.S.devices; if (!devs.length) { toast('没有可导出的设备'); return; }
    var all = '';
    devs.forEach(function (d) {
      all += '! ===== ' + (d.cfg.hostname || d.name) + ' (' + d.model + ') =====\n';
      all += H.Config.render(d) + '\n\n';
    });
    downloadText(all, (S.S.meta.title || 'h3c-config') + '.cfg', 'text/plain');
    toast('已导出 ' + devs.length + ' 台设备配置 (.cfg)，请在保存对话框选择本地位置');
  }

  /* ---------- 本地文件下载 / 选择 ---------- */
  function downloadText(text, filename, mime) {
    var m = mime || 'text/plain';
    var blob = new Blob([text], { type: m + ';charset=utf-8' });

    // 1) File System Access API：原生保存对话框（绕过 blob/data URL 被拦截的问题）
    if (window.showSaveFilePicker) {
      var ext = (filename.match(/\.[^.]+$/) || [''])[0];
      var types = [];
      if (ext === '.json') types = [{ description: 'JSON files', accept: { 'application/json': ['.json'] } }];
      else if (ext === '.cfg') types = [{ description: 'Config files', accept: { 'text/plain': ['.cfg'] } }];
      else types = [{ description: 'Text files', accept: { 'text/plain': ['.txt', '.log'] } }];
      showSaveFilePicker({ suggestedName: filename, types: types }).then(function (handle) {
        return handle.createWritable();
      }).then(function (writable) {
        return writable.write(blob).then(function () { writable.close(); });
      }).catch(function (e) {
        // 用户取消或 API 失败：静默，不弹错误
      });
      return;
    }

    // 2) 旧版 Edge / IE：原生保存
    if (window.navigator && window.navigator.msSaveOrOpenBlob) {
      window.navigator.msSaveOrOpenBlob(blob, filename);
      return;
    }

    // 3) 兜底：当前环境连 data:/blob: 下载都不支持，弹出手动复制保存框
    showManualSave(text, filename);
  }

  function showManualSave(text, filename) {
    var modal = $('save-modal');
    $('save-text').value = text;
    $('save-filename').textContent = filename;
    modal.style.display = 'flex';
    $('save-text').select();
  }
  function closeSaveModal() { $('save-modal').style.display = 'none'; }
  function pickFile(accept, cb) {
    var inp = document.createElement('input');
    inp.type = 'file'; inp.accept = accept; inp.style.display = 'none';
    document.body.appendChild(inp);
    inp.addEventListener('change', function () {
      if (inp.files && inp.files[0]) cb(inp.files[0]);
      if (inp.parentNode) inp.parentNode.removeChild(inp);
    });
    inp.click();
  }

  /* 需求3：保存工程到本地文件 */
  function exportProject() {
    var data = S.serialize();
    data.meta = S.S.meta;
    downloadText(JSON.stringify(data, null, 2), (S.S.meta.title || 'h3c-topo') + '.json', 'application/json');
    toast('已生成工程文件，请在保存对话框中选择本地位置');
  }
  /* 需求3：从本地文件读取工程 */
  function openProject() {
    pickFile('.json,application/json', function (file) {
      var reader = new FileReader();
      reader.onload = function () {
        try {
          var data = JSON.parse(reader.result);
          if (!data || !data.devices) throw new Error('bad');
          S.clearAll();
          S.loadData(data);
          S.S.meta = data.meta || S.S.meta;
          if (data.title) S.S.meta.title = data.title;
          $('topo-title').value = S.S.meta.title || '未命名拓扑';
          S.emit('reload'); TOPO.fit();
          var first = S.S.devices[0];
          TOPO.setSelected(first ? first.id : null);
          toast('已打开工程：' + (S.S.meta.title || ''));
        } catch (e) { toast('文件解析失败：不是有效的工程文件'); }
      };
      reader.readAsText(file);
    });
  }
  /* 需求4：导出单台设备 .cfg */
  function exportDeviceCfg(id) {
    var d = S.getDevice(id); if (!d) return;
    downloadText(H.Config.render(d), (d.cfg.hostname || d.name) + '.cfg', 'text/plain');
    toast('已导出 ' + (d.cfg.hostname || d.name) + '.cfg');
  }
  /* 需求5：导入 .cfg 配置文件并回放到设备 */
  function importCfg() {
    pickFile('.cfg,.txt,text/plain', function (file) {
      var reader = new FileReader();
      reader.onload = function () {
        try { applyCfgText(reader.result); }
        catch (e) { toast('导入失败：' + (e && e.message ? e.message : e)); }
      };
      reader.readAsText(file);
    });
  }
  function applyCfgText(text) {
    var lines = String(text).replace(/\r\n/g, '\n').split('\n');
    // 提取 sysname 以确定目标设备
    var sysname = null;
    for (var i = 0; i < lines.length; i++) {
      var m = lines[i].match(/^\s*sysname\s+(\S+)\s*$/i);
      if (m) { sysname = m[1]; break; }
    }
    var dev = null;
    if (sysname) dev = S.getDeviceByName(sysname);
    if (!dev) {
      if (sysname) {
        var pick = window.prompt('未找到名为「' + sysname + '」的设备。\n请输入要导入配置的目标设备名（留空取消）：', '');
        if (pick == null) return;
        if (pick.trim()) dev = S.getDeviceByName(pick.trim());
      } else {
        var selId = currentInspectorId || TOPO.getSelected();
        if (selId) dev = S.getDevice(selId);
      }
    }
    if (!dev) { toast('无法确定目标设备，请先选中设备或在工程中创建匹配的设备'); return; }

    // 过滤注释/空行/提示符，并记录是否以缩进开头（缩进 = 子视图内的从命令）
    var filtered = [];
    lines.forEach(function (raw) {
      var indent = /^[ \t]/.test(raw);
      var ln = raw.replace(/^\s+/, '').replace(/\s+$/, '');
      if (!ln) return;
      if (ln.charAt(0) === '!' || ln.charAt(0) === '#') return;
      if (/^\[[\w\-]+\]$/.test(ln)) return;
      filtered.push({ indent: indent, cmd: ln });
    });
    if (!filtered.length) { toast('配置文件中没有可导入的命令'); return; }

    // 视图感知预处理：维护子视图栈，确保回放时命令处于正确视图
    var ENTER = /^(interface|vlan|ospf|rip|bgp|acl|qos policy|traffic classifier|traffic behavior|stp region-configuration|mirroring-group|policy-based-route|line)\b/i;
    var subView = false, seq = [];
    filtered.forEach(function (it) {
      var c = it.cmd;
      if (/^system-view\s*$/i.test(c)) { seq.push(c); subView = false; }
      else if (/^(quit|return)\s*$/i.test(c)) { seq.push(c); subView = false; }
      else if (ENTER.test(c)) { if (subView) seq.push('quit'); seq.push(c); subView = true; }
      else if (it.indent) { seq.push(c); }               // 子视图内的从命令，直接发送
      else { if (subView) { seq.push('quit'); subView = false; } seq.push(c); } // 顶层命令：先退出子视图
    });
    if (!/^system-view\s*$/i.test(filtered[0].cmd)) seq.unshift('system-view');
    if (seq[seq.length - 1] !== 'return') seq.push('return');

    var sess = S.getSession(dev.id);
    var applied = 0, errs = 0;
    seq.forEach(function (c) {
      try { var r = E.exec(dev, sess, c); if (!r || r.err) errs++; else applied++; }
      catch (e) { errs++; }
    });
    Sim.invalidate(); S.emit('change');
    if (currentInspectorId === dev.id || TOPO.getSelected() === dev.id) Inspector.show(dev.id);
    toast('已导入到 ' + (dev.cfg.hostname || dev.name) + '：应用 ' + applied + ' 条，失败/未识别 ' + errs + ' 条');
  }
  /* 测试/调试钩子：暴露 .cfg 文本导入入口（只读引用，不影响生产逻辑） */
  H.applyCfgText = applyCfgText;

  function showHelp() {
    $('modal-title').innerHTML = '使用帮助';
    $('modal-c').innerHTML =
      '<h3>欢迎使用 H3C 网络仿真实验室</h3>' +
      '<p>这是一个纯前端的 H3C（Comware）交换机 / 路由器模拟终端，可用于《计算机网络设备配置》课程实验。</p>' +
      '<h3>基本操作</h3><ul>' +
      '<li><b>添加设备</b>：从左侧设备库拖拽到画布，或单击设备项在视图中心添加。</li>' +
      '<li><b>移动/选中</b>：在画布中按住设备拖动；单击设备选中并在右侧查看端口状态。</li>' +
      '<li><b>连线</b>：① 点击工具栏「连线模式」后依次点两个设备自动连线；② 在右侧检视器逐端口点「连线」精确连接；③ <b>直接在画布上点击设备的端口指示灯（底部小圆点）发起端口到端口连线</b>。连线以自适应水平/竖直折线显示，端口与端口固定绑定，无箭头。</li>' +
      '<li><b>端口指示灯</b>：<span style="color:#22c55e">绿=UP</span> / <span style="color:#f59e0b">橙=STP阻塞</span> / <span style="color:#ef4444">红=DOWN</span> / <span style="color:#7d8997">灰=未连接</span>。</li>' +
      '<li><b>CLI</b>：底部为每个设备独立的命令行，支持 <code>?</code> 帮助、<code>Tab</code> 补全、<kbd>↑</kbd>/<kbd>↓</kbd> 历史、<kbd>Ctrl+C</kbd> 取消、<kbd>Ctrl+L</kbd> 清屏。</li>' +
      '</ul>' +
      '<h3>配置范围</h3><p>覆盖基础管理、二层（VLAN/STP/聚合/镜像）、三层、静态/RIP/OSPF/BGP 路由、ACL、QoS、安全（AAA/SSH/Telnet/802.1X）、网络管理（SNMP/NTP/日志）与监控（display 系列）命令，并执行全网仿真（STP、转发、ping/tracert）。</p>' +
      '<h3>文件操作</h3><p>「保存 / 读取」是浏览器 localStorage 临时存档；「<b>保存文件</b>」将整个工程导出为 <code>.json</code>、「<b>打开文件</b>」从本地读回；「<b>导出配置</b>」把全部设备配置导出为 <code>.cfg</code>，也可在右侧检视器对单台设备点「导出.cfg」；「<b>导入配置</b>」读取 <code>.cfg</code> 并按设备名匹配还原到对应设备。</p>';
    $('modal').style.display = 'flex';
  }

  function showAbout() {
    var A = (window.H3C && window.H3C.ABOUT) || {};
    var ver = A.version || '1.0.0';
    var updated = A.updated || '';
    var html = '';
    html += '<div class="about-head">';
    html += '  <div class="about-logo">H3C<span class="about-logo-sub">SIM</span></div>';
    html += '  <div class="about-meta">';
    html += '    <div class="about-name">' + (A.appName || 'H3C 网络仿真实验室') + '</div>';
    html += '    <div class="about-sub">' + (A.subtitle || '') + '</div>';
    html += '  </div>';
    html += '</div>';
    html += '<div class="about-info">';
    html += '  <div class="about-row"><span class="about-k">当前版本</span><span class="about-v">v' + ver + (updated ? ' <span class="about-date">（' + updated + ' 更新）</span>' : '') + '</span></div>';
    html += '  <div class="about-row"><span class="about-k">作者</span><span class="about-v">' + (A.author || '') + '</span></div>';
    html += '  <div class="about-row"><span class="about-k">联系方式</span><span class="about-v"><a href="mailto:' + (A.contact || '') + '">' + (A.contact || '') + '</a></span></div>';
    html += '  <div class="about-row"><span class="about-k">GitHub</span><span class="about-v"><a href="' + (A.github || '#') + '" target="_blank" rel="noopener">' + (A.github || '') + '</a></span></div>';
    html += '  <div class="about-row"><span class="about-k">许可</span><span class="about-v">' + (A.license || '') + '</span></div>';
    html += '</div>';
    html += '<div class="about-changelog-h">更新日志</div>';
    html += '<div class="about-changelog">';
    var log = A.changelog || [];
    for (var i = 0; i < log.length; i++) {
      var e = log[i];
      html += '<div class="cl-item">';
      html += '  <div class="cl-head"><span class="cl-ver">v' + e.version + '</span><span class="cl-date">' + (e.date || '') + '</span><span class="cl-title">' + (e.title || '') + '</span></div>';
      html += '  <ul class="cl-changes">';
      var ch = e.changes || [];
      for (var j = 0; j < ch.length; j++) { html += '<li>' + ch[j] + '</li>'; }
      html += '  </ul>';
      if (e.note) { html += '  <div class="cl-note">' + e.note + '</div>'; }
      html += '</div>';
    }
    html += '</div>';
    $('modal-title').innerHTML = '关于';
    $('modal-c').innerHTML = html;
    $('modal').style.display = 'flex';
  }

  /* ============ 初始化 ============ */
  function init() {
    TOPO = H.UI.Topology; TERM = H.UI.Terminal; INSPECT = Inspector;
    TOPO.init(); TERM.init();
    buildPalette();
    bindToolbar();
    bindTermResizer();
    bindPanelResizers();
    bindSaveModal();

    // 事件联动
    TOPO.onSelect = function (id) {
      TERM.openTab(id);
      showPanel('inspector');      // 若右侧详情被隐藏，点击设备时自动展开
      Inspector.show(id);
    };
    TOPO.onLinkMode = function (on) { var b = document.querySelector('[data-act="linkmode"]'); if (b) b.classList.toggle('active', on); };
    TERM.onActivate = function (id) { TOPO.setSelected(id); Inspector.show(id); };
    $('inspector-body').addEventListener('click', onInspectorClick);

    S.on('change', function () {
      TOPO.render();
      if (currentInspectorId && S.getDevice(currentInspectorId)) Inspector.show(currentInspectorId);
      else if (currentInspectorId) { currentInspectorId = null; Inspector.clear(); }
    });
    S.on('reload', function () {
      TOPO.render(); TERM.refreshTabs();
      if (currentInspectorId && S.getDevice(currentInspectorId)) Inspector.show(currentInspectorId);
      else if (currentInspectorId) { currentInspectorId = null; Inspector.clear(); }
    });

    // 拖放添加
    var stage = $('stage');
    stage.addEventListener('dragover', function (e) { e.preventDefault(); });
    stage.addEventListener('drop', function (e) {
      e.preventDefault();
      var mid = e.dataTransfer.getData('text/model'); if (!mid) return;
      var p = clientToContent(e.clientX, e.clientY);
      addDeviceAt(mid, p.x - 75, p.y - 25);
    });

    // 启动：优先读取本地，否则加载首个示例
    if (S.loadLocal()) { S.emit('reload'); TOPO.fit(); TERM.renderEmpty(); }
    else { loadScenario(0); }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})(window.H3C);
