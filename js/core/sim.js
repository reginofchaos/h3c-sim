/* H3C 网络仿真实验室 - 网络仿真内核（二层 / 三层 / 转发） */
(function (H) {
  'use strict';
  var U = H.U, S = H.State;
  var cache = { stp: null, ts: 0 };
  var Sim = {};

  /* ============ 基础端口状态 ============ */
  var STP_COST = { 'FE': 19, 'GE': 4, 'XGE': 2, 'FGE': 1, 'Serial': 100 };
  var BW_MBPS = { 'FE': 100, 'GE': 1000, 'XGE': 10000, 'FGE': 40000, 'Serial': 2 };

  function iface(dev, name) { return dev.cfg.ifaces ? dev.cfg.ifaces[name] : null; }
  function portByType(dev, name) {
    for (var i = 0; i < dev.ports.length; i++) if (dev.ports[i].name === name) return dev.ports[i];
    // 虚拟口
    return null;
  }
  function bridgeMac(dev) {
    if (!dev.rt.bmac) dev.rt.bmac = U.genMac(dev.id + dev.name);
    return dev.rt.bmac;
  }
  function bridgeId(dev) {
    var inst = (dev.cfg.stp.instances && dev.cfg.stp.instances[0]) || {};
    var prio = inst.priority != null ? inst.priority : dev.cfg.stp.priority;
    return { prio: prio, mac: bridgeMac(dev) };
  }
  function bidLess(a, b) {
    if (a.prio !== b.prio) return a.prio < b.prio;
    return U.macNorm(a.mac) < U.macNorm(b.mac);
  }
  Sim.bridgeId = bridgeId;

  /* 端口物理 up：配置 up + 有连线 + 对端 up */
  function portPhysUp(dev, name) {
    var f = iface(dev, name); if (!f) return false;
    if (!f.adminUp) return false;
    var peer = S.getPeer(dev.id, name);
    if (!peer) return false;
    var pd = S.getDevice(peer.dev); if (!pd) return false;
    var pf = iface(pd, peer.port); if (!pf || !pf.adminUp) return false;
    return true;
  }

  /* 是否参与 STP */
  function stpParticipate(dev, name) {
    if (!dev.cfg.stp.enable) return false;
    if (dev.type !== 'switch') return false;
    var f = iface(dev, name); if (!f) return false;
    if (f.mode === 'route') return false;
    if (!f.stpEnable) return false;
    if (f.aggregation != null) return false;   // 成员口由聚合口代表
    return true;
  }

  /* ============ STP 计算 ============ */
  function stpGraph() {
    var nodes = [], edges = [];
    S.S.devices.forEach(function (d) {
      if (d.type === 'switch' && d.cfg.stp.enable) nodes.push(d.id);
    });
    S.S.links.forEach(function (l) {
      var da = S.getDevice(l.a.dev), db = S.getDevice(l.b.dev);
      if (!da || !db) return;
      if (!stpParticipate(da, l.a.port) || !stpParticipate(db, l.b.port)) return;
      var fa = iface(da, l.a.port), fb = iface(db, l.b.port);
      if (!portPhysUp(da, l.a.port) || !portPhysUp(db, l.b.port)) return;
      var pa = portByType(da, l.a.port), pb = portByType(db, l.b.port);
      var cost = fa.stpCost === 'auto' || fa.stpCost == null ? (STP_COST[pa ? pa.type : 'GE'] || 4) : parseInt(fa.stpCost, 10);
      var costB = fb.stpCost === 'auto' || fb.stpCost == null ? (STP_COST[pb ? pb.type : 'GE'] || 4) : parseInt(fb.stpCost, 10);
      edges.push({ id: l.id, a: l.a.dev, b: l.b.dev, ap: l.a.port, bp: l.b.port, costA: cost, costB: costB });
    });
    return { nodes: nodes, edges: edges };
  }

  function computeStp() {
    var g = stpGraph();
    var res = {};   // devId -> { portName: {role, state} }
    S.S.devices.forEach(function (d) { res[d.id] = {}; });

    if (!g.nodes.length) { cache.stp = res; cache.ts = Date.now(); return res; }

    // 1. 选举根桥
    var root = null, rootBid = null;
    g.nodes.forEach(function (id) {
      var d = S.getDevice(id); if (!d) return;
      var b = bridgeId(d);
      if (!root || bidLess(b, rootBid)) { root = id; rootBid = b; }
    });

    // 2. 计算每台设备到根的最短 cost（Dijkstra）
    var dist = {}, prev = {}, prevPort = {};
    g.nodes.forEach(function (id) { dist[id] = Infinity; });
    dist[root] = 0;
    var unvisited = g.nodes.slice();
    while (unvisited.length) {
      var u = null, best = Infinity;
      unvisited.forEach(function (id) { if (dist[id] < best) { best = dist[id]; u = id; } });
      if (u === null) break;
      unvisited = unvisited.filter(function (x) { return x !== u; });
      g.edges.forEach(function (e) {
        var v = null, cost = 0, up = null, vp = null;
        if (e.a === u) { v = e.b; cost = e.costA; up = e.ap; vp = e.bp; }
        else if (e.b === u) { v = e.a; cost = e.costB; up = e.bp; vp = e.ap; }
        else return;
        if (dist[u] + cost < dist[v]) { dist[v] = dist[u] + cost; prev[v] = u; prevPort[v] = up; }
      });
    }

    // 3. 根端口
    g.nodes.forEach(function (id) {
      if (id === root) return;
      if (prev[id] != null && prevPort[id]) {
        res[id][prevPort[id]] = { role: 'ROOT', state: 'forwarding', rootCost: dist[id] };
      }
    });

    // 4. 指定端口：每条链路两端比较
    g.edges.forEach(function (e) {
      var da = S.getDevice(e.a), db = S.getDevice(e.b);
      var ca = dist[e.a], cb = dist[e.b];
      var designated = null, blockPort = null, blockDev = null;
      if (e.a === root) { designated = e.a; blockPort = e.bp; blockDev = e.b; }
      else if (e.b === root) { designated = e.b; blockPort = e.ap; blockDev = e.a; }
      else if (ca < cb) { designated = e.a; blockPort = e.bp; blockDev = e.b; }
      else if (cb < ca) { designated = e.b; blockPort = e.ap; blockDev = e.a; }
      else {
        var ba = bridgeId(da), bb = bridgeId(db);
        if (bidLess(ba, bb)) { designated = e.a; blockPort = e.bp; blockDev = e.b; }
        else { designated = e.b; blockPort = e.ap; blockDev = e.a; }
      }
      var dp = designated === e.a ? e.ap : e.bp;
      if (!res[designated][dp]) {
        res[designated][dp] = { role: 'DESI', state: 'forwarding', rootCost: dist[designated] };
      }
      // 另一端：若不是根端口则阻塞
      if (!res[blockDev][blockPort]) {
        res[blockDev][blockPort] = { role: 'ALTE', state: 'discarding', rootCost: dist[blockDev] };
      }
    });

    // 5. 边界端口（连接非交换机）自动 forwarding
    S.S.devices.forEach(function (d) {
      if (d.type !== 'switch') return;
      d.ports.forEach(function (p) {
        var f = iface(d, p.name); if (!f || f.mode === 'route' || !f.stpEnable) return;
        if (res[d.id][p.name]) return;
        res[d.id][p.name] = { role: 'DESI', state: 'forwarding', edge: true };
      });
    });

    cache.stp = res; cache.ts = Date.now(); cache.root = root; cache.rootBid = rootBid;
    return res;
  }
  function stpState() {
    if (!cache.stp) computeStp();
    return cache.stp;
  }
  Sim.computeStp = computeStp;
  Sim.stpState = stpState;
  Sim.stpRoot = function () { if (!cache.stp) computeStp(); return cache.root; };
  Sim.invalidate = function () { cache.stp = null; S.S.devices.forEach(function (d) { d.rt.routes = null; d.rt.routes6 = null; if (!d.rt.natSessions) d.rt.natSessions = []; else d.rt.natSessions.length = 0; }); electVrrp(); };

  /* 端口最终数据转发状态 */
  function portUp(dev, name) {
    if (!portPhysUp(dev, name)) return false;
    var f = iface(dev, name); if (!f) return false;
    if (isSerialPort(dev, name) && !linkProtocolUp(dev, name)) return false;  // 广域网：链路协议未协商/认证失败 → 端口 down
    if (f.aggregation != null) {
      var g = dev.cfg.lag[f.aggregation];
      if (g && g.adminUp === false) return false;
    }
    if (dev.type === 'switch' && dev.cfg.stp.enable && stpParticipate(dev, name)) {
      var st = stpState()[dev.id] || {};
      var r = st[name];
      if (r && r.state === 'discarding') return false;
    }
    return true;
  }
  Sim.portUp = portUp;
  Sim.portPhysUp = portPhysUp;

  /* ============ 广域网链路协议状态机（PPP/HDLC） ============ */
  Sim.isSerialPort = function (dev, name) {
    var p = portByType(dev, name); return !!p && p.type === 'Serial';
  };
  function isSerialPort(dev, name) { return Sim.isSerialPort(dev, name); }

  /* PPP 认证是否通过：任一侧配置了 authentication-mode 时，对端必须呈交匹配凭据
     （被认证方：ppp chap/pap user + password；认证方：local-user 用户名+密码一致） */
  function pppAuthOk(me, mf, peer, pf) {
    function requires(f) { return !!(f && f.pppAuth && f.pppAuth.mode && f.pppAuth.mode !== 'none'); }
    function creds(f) { var a = (f && f.pppAuth) || {}; return { user: a.user || '', pass: a.password || '' }; }
    function userPw(d, u) {
      var lu = ((d.cfg && d.cfg.users) || []).filter(function (x) { return x.name === u; })[0];
      return lu ? (lu.password || '') : null;
    }
    function check(authDev, authIface, presDev, presIface) {
      if (!requires(authIface)) return true;
      var c = creds(presIface);
      if (!c.user) return false;
      var pw = userPw(authDev, c.user);
      if (pw == null) return false;
      return String(c.pass) === String(pw);
    }
    return check(me, mf, peer, pf) && check(peer, pf, me, mf);
  }

  /* 串口链路协议是否 UP：封装一致 + （PPP 时）认证通过 */
  function linkProtocolUp(dev, name) {
    var f = iface(dev, name); if (!isSerialPort(dev, name)) return true;
    if (!portPhysUp(dev, name)) return false;
    var peer = S.getPeer(dev.id, name); if (!peer) return false;
    var pd = S.getDevice(peer.dev), pf = pd ? iface(pd, peer.port) : null;
    if (!pd || !pf || !isSerialPort(pd, peer.port)) return false;
    var lpA = (f.linkProtocol || 'ppp'), lpB = (pf.linkProtocol || 'ppp');
    if (lpA !== lpB) return false;                       // 封装不一致（如一端 PPP 一端 HDLC）
    if (lpA === 'ppp' && !pppAuthOk(dev, f, pd, pf)) return false;
    return true;
  }
  Sim.linkProtocolUp = linkProtocolUp;

  /* ============ VLAN 判定 ============ */
  function portVlans(dev, name) {
    var f = iface(dev, name); if (!f) return [];
    if (f.mode === 'route') {
      // 三层口（PC/服务器/路由器/防火墙）直连交换机 access 口时，沿用对端 access VLAN 参与二层域
      var peer = S.getPeer(dev.id, name);
      if (peer) {
        var pd = S.getDevice(peer.dev);
        var pf = pd ? iface(pd, peer.port) : null;
        if (pd && pd.type === 'switch' && pf && pf.mode === 'bridge' && pf.linkType === 'access') {
          return [pf.accessVlan || 1];
        }
      }
      return [];
    }
    if (f.linkType === 'access') return [f.accessVlan || 1];
    if (f.linkType === 'trunk') return f.permitVlans || [];
    if (f.linkType === 'hybrid') {
      var m = {};
      (f.permitVlans || []).forEach(function (v) { m[v] = 1; });
      (f.untaggedVlans || []).forEach(function (v) { m[v] = 1; });
      return Object.keys(m).map(Number);
    }
    return [1];
  }
  function portHasVlan(dev, name, vlan) {
    return portVlans(dev, name).indexOf(Number(vlan)) >= 0;
  }
  Sim.portVlans = portVlans;
  Sim.portHasVlan = portHasVlan;

  /* 设备在某 VLAN 内的二层端口（up 状态可选） */
  function portsInVlan(dev, vlan, upOnly) {
    var out = [];
    dev.ports.forEach(function (p) {
      var f = iface(dev, p.name); if (!f) return;
      if (f.aggregation != null) return;   // 由聚合口代表
      // 三层口（PC/服务器/路由器/防火墙）直连交换机 access 口时，按对端 VLAN 参与二层域
      // （portHasVlan 已对 route 模式口返回对端交换机 access VLAN，未连交换机则不计入）
      if (portHasVlan(dev, p.name, vlan)) {
        if (upOnly && !portUp(dev, p.name)) return;
        out.push(p.name);
      }
    });
    // 聚合口
    Object.keys(dev.cfg.lag || {}).forEach(function (gid) {
      var g = dev.cfg.lag[gid]; if (!g || g.type !== 'bridge') return;
      var nm = 'BAGG' + gid;
      var f = iface(dev, nm); if (!f) return;
      if (portHasVlan(dev, nm, vlan)) out.push(nm);
    });
    return out;
  }
  Sim.portsInVlan = portsInVlan;

  /* ============ 二层广播域 BFS ============ */
  /* 从 dev 的某个端口出发，在指定 VLAN 内可达的设备集合
     返回 { devId: { hops, viaLink } } */
  function l2Domain(dev, startPort, vlan) {
    var res = {};
    res[dev.id] = { hops: 0, dev: dev.id, from: null };
    var q = [{ dev: dev, port: startPort, hops: 0 }];
    var guard = 0;
    while (q.length && guard++ < 500) {
      var cur = q.shift();
      var d = cur.dev;
      // 该设备在此 VLAN 的所有端口
      var plist = portsInVlan(d, vlan, false);
      for (var i = 0; i < plist.length; i++) {
        var pn = plist[i];
        if (!portUp(d, pn)) continue;
        var lnk = null, peerPort = null;
        if (/^BAGG/.test(pn)) {
          // 聚合口：遍历成员
          var g = d.cfg.lag[pn.slice(4)];
          if (!g) continue;
          for (var mi = 0; mi < g.members.length; mi++) {
            var mp = g.members[mi];
            if (!portUp(d, mp)) continue;
            var pr = S.getPeer(d.id, mp);
            if (pr) { lnk = pr; peerPort = pr.port; break; }
          }
        } else {
          var p = S.getPeer(d.id, pn);
          if (p) { lnk = p; peerPort = p.port; }
        }
        if (!lnk) continue;
        // 对端端口也必须在同一 VLAN 且 up
        var pd = S.getDevice(lnk.dev); if (!pd) continue;
        if (!portUp(pd, lnk.port)) continue;
        if (!portHasVlan(pd, lnk.port, vlan)) continue;
        if (res[pd.id]) continue;
        res[pd.id] = { hops: cur.hops + 1, dev: pd.id, from: d.id, viaPort: pn, peerPort: lnk.port };
        q.push({ dev: pd, port: lnk.port, hops: cur.hops + 1 });
      }
    }
    return res;
  }
  Sim.l2Domain = l2Domain;

  /* 三层接口所在 VLAN（用于从 VLAN-interface 找二层端口） */
  function l3IfaceInfo(dev, name) {
    if (/^Vlan-interface/.test(name)) {
      return { kind: 'vlan', vlan: parseInt(name.replace('Vlan-interface', ''), 10) };
    }
    if (/^LoopBack/.test(name)) return { kind: 'loop' };
    if (/^Bridge-Aggregation/.test(name)) return { kind: 'agg', id: name.replace('Bridge-Aggregation', '') };
    if (/^Route-Aggregation/.test(name)) return { kind: 'ragg', id: name.replace('Route-Aggregation', '') };
    if (/^NULL/.test(name)) return { kind: 'null' };
    if (/^Tunnel/.test(name)) return { kind: 'tunnel' };
    return { kind: 'phy', port: name };
  }
  Sim.l3IfaceInfo = l3IfaceInfo;

  /* 三层接口是否 up */
  function l3Up(dev, name) {
    var f = iface(dev, name); if (!f) return false;
    var info = l3IfaceInfo(dev, name);
    if (info.kind === 'loop' || info.kind === 'null') return true;
    if (info.kind === 'vlan') {
      var pl = portsInVlan(dev, info.vlan, true);
      return pl.length > 0;
    }
    if (info.kind === 'agg' || info.kind === 'ragg') {
      var g = dev.cfg.lag[info.id];
      if (!g || !g.members || !g.members.length) return false;
      var any = false;
      g.members.forEach(function (m) { if (portUp(dev, m)) any = true; });
      return any;
    }
    if (info.kind === 'phy') return portUp(dev, name);
    return false;
  }
  Sim.l3Up = l3Up;

  /* ============ 路由表 ============ */
  function l3Ifaces(dev) {
    var out = [];
    var names = {};
    if (dev.cfg.ifaces) Object.keys(dev.cfg.ifaces).forEach(function (n) { names[n] = dev.cfg.ifaces[n]; });
    Object.keys(dev.cfg.vlanIfaces || {}).forEach(function (n) { names[n] = dev.cfg.vlanIfaces[n]; });
    Object.keys(dev.cfg.loopbacks || {}).forEach(function (n) { names[n] = dev.cfg.loopbacks[n]; });
    Object.keys(dev.cfg.lag || {}).forEach(function (gid) {
      var g = dev.cfg.lag[gid];
      var nm = (g.type === 'route' ? 'RAGG' : 'BAGG') + gid;
      if (!names[nm]) names[nm] = H.Model.defaultIface({ name: nm, type: g.type === 'route' ? 'GE' : 'GE' });
    });
    Object.keys(names).forEach(function (n) {
      var f = names[n];
      if (!f.ip && !f.ipSecondary) return;
      out.push({ name: n, f: f, up: l3Up(dev, n), info: l3IfaceInfo(dev, n) });
    });
    return out;
  }
  Sim.l3Ifaces = l3Ifaces;

  function directRoutes(dev) {
    var out = [];
    l3Ifaces(dev).forEach(function (o) {
      if (!o.up) return;
      var push = function (addr, mask, primary) {
        var len = U.maskLen(mask); if (len === null) return;
        if (len === 32 && o.info.kind !== 'loop') {
          out.push({ proto: 'Direct', dest: addr, mask: len, pref: 0, cost: 0, nexthop: addr, oif: o.name, flags: 'D' });
        } else {
          out.push({ proto: 'Direct', dest: U.netOf(addr, len), mask: len, pref: 0, cost: 0, nexthop: '0.0.0.0', oif: o.name, flags: 'D' });
          if (o.info.kind !== 'loop') {
            var host = U.int2ip((U.ip2int(addr) & 0xfffffffe) >>> 0);
            out.push({ proto: 'Direct', dest: addr, mask: len === 31 ? 31 : 32, pref: 0, cost: 0, nexthop: '127.0.0.1', oif: o.name, flags: 'L' });
          }
        }
      };
      if (o.f.ip) push(o.f.ip.addr, o.f.ip.mask, true);
      (o.f.ipSecondary || []).forEach(function (s) { push(s.addr, s.mask, false); });
    });
    return out;
  }

  /* 协议是否在该接口上使能 */
  function protoOnIface(dev, proto, ifName, addr) {
    if (proto === 'ospf') {
      if (!dev.cfg.ospf.enable) return null;
      var hit = null;
      (dev.cfg.ospf.networks || []).forEach(function (n) {
        var len = U.maskLen(n.mask); if (len === null) return;
        if (U.inNet(addr, n.addr, len)) hit = hit || n;
      });
      if (!hit) return null;
      if ((dev.cfg.ospf.silent || []).indexOf(ifName) >= 0) return null;
      return hit;
    }
    if (proto === 'rip') {
      if (!dev.cfg.rip.enable) return null;
      var h2 = null;
      (dev.cfg.rip.networks || []).forEach(function (n) {
        var len = U.maskLen(n.mask == null ? (U.int2ip(0xffffffff)) : n.mask);
        var v = U.ip2int(n.addr);
        if (n.addr.indexOf('/') > 0) { v = U.ip2int(n.addr.split('/')[0]); len = parseInt(n.addr.split('/')[1], 10); }
        if (len === null) return;
        if (U.inNet(addr, U.int2ip(v), len)) h2 = h2 || n;
      });
      if (!h2) return null;
      if ((dev.cfg.rip.passive || []).indexOf(ifName) >= 0) return null;
      return h2;
    }
    if (proto === 'isis') {
      if (!dev.cfg.isis.enable) return null;
      var f = iface(dev, ifName);
      if (!f || f.isisEnable == null) return null;
      return { level: f.isisLevel || 'level-1-2' };
    }
    return null;
  }

  function ospfCost(dev, ifName) {
    var ref = dev.cfg.ospf.bandwidthRef || 100;   // Mbps
    var p = portByType(dev, ifName);
    var bw = p ? (BW_MBPS[p.type] || 1000) : 1000;
    var f = iface(dev, ifName);
    if (f && f.ospfCost != null) return parseInt(f.ospfCost, 10);
    if (/^Vlan-interface/.test(ifName)) return 1;
    return Math.max(1, Math.round(ref * 100 / bw) / 100);
  }

  function isisCost(dev, ifName) {
    var f = iface(dev, ifName);
    if (f && f.isisCost != null) return parseInt(f.isisCost, 10);
    if (/^Vlan-interface/.test(ifName)) return 10;
    return 10;   // H3C IS-IS 默认开销
  }

  /* 找协议邻居：返回 [{peerDev, localIf, peerIf, peerIp, area/cost}] */
  function isisLevelMatch(a, b) {
    a = a || 'level-1-2'; b = b || 'level-1-2';
    if (a === 'level-1-2' || b === 'level-1-2') return true;
    return a === b;
  }
  function neighbors(dev, proto) {
    var out = [];
    l3Ifaces(dev).forEach(function (o) {
      if (!o.up || !o.f.ip) return;
      var cfg = protoOnIface(dev, proto, o.name, o.f.ip.addr);
      if (!cfg) return;
      var len = U.maskLen(o.f.ip.mask);
      // 二层域
      var domain = null;
      if (o.info.kind === 'vlan') {
        domain = {};
        portsInVlan(dev, o.info.vlan, true).forEach(function (pn) {
          var dom = l2Domain(dev, pn, o.info.vlan);
          Object.keys(dom).forEach(function (k) { domain[k] = dom[k]; });
        });
        domain[dev.id] = { hops: 0 };
      } else if (o.info.kind === 'phy') {
        var pr = S.getPeer(dev.id, o.name);
        if (!pr) return;
        var pd = S.getDevice(pr.dev); if (!pd) return;
        if (!portUp(pd, pr.port)) return;
        domain = {}; domain[dev.id] = { hops: 0 }; domain[pd.id] = { hops: 1 };
      } else { return; }
      Object.keys(domain).forEach(function (pid) {
        if (pid === dev.id) return;
        var pd = S.getDevice(pid); if (!pd) return;
        l3Ifaces(pd).forEach(function (po) {
          if (!po.up || !po.f.ip) return;
          if (!U.sameNet(po.f.ip.addr, o.f.ip.addr, len)) return;
          var pcfg = protoOnIface(pd, proto, po.name, po.f.ip.addr);
          if (!pcfg) return;
          if (proto === 'ospf' && String(pcfg.area) !== String(cfg.area)) return;
          if (proto === 'isis' && !isisLevelMatch(cfg.level, pcfg.level)) return;
          out.push({
            peerDev: pd, peerIf: po.name, peerIp: po.f.ip.addr,
            localIf: o.name, localIp: o.f.ip.addr, len: len,
            area: cfg.area,
            cost: proto === 'ospf' ? ospfCost(dev, o.name) : (proto === 'isis' ? isisCost(dev, o.name) : 1)
          });
        });
      });
    });
    return out;
  }
  Sim.neighbors = neighbors;

  /* 路由传播：从 dev 出发通过 proto 学到的路由 */
  /* Route-Policy 应用相关辅助 */
  function aseLabel(impProto) {
    return impProto === 'ospf' ? 'O_ASE' : impProto === 'rip' ? 'R_ASE' : impProto === 'isis' ? 'IS_ASE' : 'BGP';
  }
  function asePref(impProto) {
    return impProto === 'ospf' ? 150 : impProto === 'rip' ? 100 : impProto === 'isis' ? 15 : 255;
  }
  function ipPrefixMatch(dev, name, route) {
    var list = dev.cfg.ipPrefix || [];
    var ents = [];
    for (var i = 0; i < list.length; i++) if (list[i].name === name) ents.push(list[i]);
    if (!ents.length) return false;
    for (var j = 0; j < ents.length; j++) {
      var e = ents[j], len = e.len;
      if (!U.inNet(route.dest, e.addr, len)) continue;
      if (route.mask !== len) continue;            // 精确长度匹配
      if (e.action === 'permit') return true;
      return false;                                 // deny 条目：显式不匹配
    }
    return false;
  }
  function routeMatchNode(dev, node, route) {
    var m = node.match || {};
    if (m.acl != null) {
      if (!dev.cfg.acl[m.acl]) return false;
      var pkt = { srcIp: route.dest, dstIp: route.dest, proto: 'ip' };
      var r = aclCheck(dev, m.acl, pkt);
      if (!r.matched || r.action !== 'permit') return false;
    }
    if (m.ipPrefix != null) {
      if (!ipPrefixMatch(dev, m.ipPrefix, route)) return false;
    }
    return true;
  }
  function applyRoutePolicy(dev, policyName, route) {
    var pols = dev.cfg.routePolicies || [];
    var nodes = [];
    for (var i = 0; i < pols.length; i++) if (pols[i].name === policyName) nodes.push(pols[i]);
    nodes.sort(function (a, b) { return a.node - b.node; });
    if (!nodes.length) return { accept: true, route: route };   // 策略不存在：放行，不阻断
    for (var k = 0; k < nodes.length; k++) {
      var nd = nodes[k];
      if (!routeMatchNode(dev, nd, route)) continue;
      if (nd.action === 'deny') return { accept: false };
      var ap = nd.apply || {}, nr = {}, p;
      for (p in route) if (route.hasOwnProperty(p)) nr[p] = route[p];
      if (ap.cost != null) nr.cost = ap.cost;
      if (ap.preference != null) nr.pref = ap.preference;
      if (ap.tag != null) nr.tag = ap.tag;
      if (ap.nextHop != null) nr.nexthop = ap.nextHop;
      return { accept: true, route: nr, node: nd.node };
    }
    return { accept: false };   // 默认拒绝
  }
  /* 收集被引入协议的候选路由（static/direct 直接读配置；其它协议仅在已缓存时，避免重入递归） */
  function importedCandidates(d, proto) {
    if (proto === 'static') {
      return (d.cfg.staticRoutes || []).map(function (r) {
        return { dest: r.dest, mask: U.maskLen(r.mask), pref: r.pref || 60, cost: 0, tag: r.tag };
      });
    }
    if (proto === 'direct') {
      return directRoutes(d).filter(function (r) { return r.mask > 0 && r.dest !== '0.0.0.0'; })
        .map(function (r) { return { dest: r.dest, mask: r.mask, pref: 0, cost: 0 }; });
    }
    if (!d.rt.routes) return [];
    var label = proto === 'rip' ? 'RIP' : proto === 'ospf' ? 'OSPF' : proto === 'isis' ? 'ISIS' : 'BGP';
    return d.rt.routes.filter(function (r) { return r.proto === label; })
      .map(function (r) { return { dest: r.dest, mask: r.mask, pref: r.pref, cost: r.cost }; });
  }

  function learnedRoutes(dev, proto) {
    var out = [];
    var seenKey = {};
    var impProto = proto;   // 引入后的外部路由统一以此协议标记
    function walk(d, hops, visited, accCost) {
      if (hops > 8) return;
      if (visited.indexOf(d.id) >= 0) return;
      visited = visited.concat([d.id]);
      // d 自己通过 proto 宣告的直连网段
      l3Ifaces(d).forEach(function (o) {
        if (!o.up || !o.f.ip) return;
        var cfg = protoOnIface(d, proto, o.name, o.f.ip.addr);
        if (!cfg) return;
        var len = U.maskLen(o.f.ip.mask);
        var cost = proto === 'ospf' ? (accCost + ospfCost(d, o.name))
          : (proto === 'isis' ? (accCost + isisCost(d, o.name)) : (hops + 1));
        var key = U.netOf(o.f.ip.addr, len) + '/' + len;
        if (!seenKey[key]) {
          seenKey[key] = 1;
          out.push({
            proto: proto === 'ospf' ? 'OSPF' : (proto === 'isis' ? 'ISIS' : 'RIP'),
            dest: U.netOf(o.f.ip.addr, len), mask: len,
            pref: proto === 'ospf' ? 10 : (proto === 'isis' ? 15 : 100),
            cost: Math.round(cost * 100) / 100,
            nexthop: null, oif: null, via: d.id,
            area: cfg.area
          });
        }
      });
      // d 引入的外部路由（按 importRoutes 对象逐个处理并应用 Route-Policy）
      var imports = proto === 'ospf' ? (d.cfg.ospf.importRoutes || [])
        : proto === 'rip' ? (d.cfg.rip.importRoutes || [])
        : (d.cfg.isis.importRoutes || []);
      imports.forEach(function (im) {
        var proto2 = im.proto, policy = im.policy || null;
        importedCandidates(d, proto2).forEach(function (cand) {
          var r = cand;
          if (policy) { var res = applyRoutePolicy(d, policy, r); if (!res.accept) return; r = res.route; }
          var key = r.dest + '/' + r.mask;
          if (!seenKey[key]) {
            seenKey[key] = 1;
            out.push({
              proto: aseLabel(impProto), dest: r.dest, mask: r.mask,
              pref: asePref(impProto), cost: (r.cost != null ? r.cost : 1),
              nexthop: null, oif: null, via: d.id, tag: r.tag
            });
          }
        });
      });
      neighbors(d, proto).forEach(function (nb) {
        if (visited.indexOf(nb.peerDev.id) >= 0) return;
        walk(nb.peerDev, hops + 1, visited,
          accCost + (proto === 'ospf' ? nb.cost : (proto === 'isis' ? nb.cost : 0)));
      });
    }
    // 第一跳邻居
    neighbors(dev, proto).forEach(function (nb) {
      var before = out.length;
      walk(nb.peerDev, 0, [dev.id], nb.cost);
      // 给本轮新增的路由设置下一跳与出接口
      for (var i = before; i < out.length; i++) {
        if (!out[i].nexthop) {
          out[i].nexthop = nb.peerIp;
          out[i].oif = nb.localIf;
          out[i].firstHop = nb.peerIp;
        }
      }
    });
    return out;
  }

  function computeRoutes(dev) {
    if (dev.rt.routes) return dev.rt.routes;
    var list = directRoutes(dev);

    // 主机（PC/Server）：直连 + 默认网关
    if (dev.type === 'pc' || dev.type === 'server') {
      (dev.cfg.staticRoutes || []).forEach(function (r) {
        list.push({ proto: 'Static', dest: r.dest, mask: U.maskLen(r.mask), pref: 60, cost: 0, nexthop: r.nexthop, oif: r.oif || 'GE0/1', flags: 'S' });
      });
      if (dev.cfg.defaultRoute) {
        list.push({ proto: 'Static', dest: '0.0.0.0', mask: 0, pref: 60, cost: 0, nexthop: dev.cfg.defaultRoute, oif: 'GE0/1', flags: 'S' });
      }
      // 去除重复
      var seen = {}, out2 = [];
      list.forEach(function (r) {
        var k = r.dest + '/' + r.mask + ':' + r.proto;
        if (seen[k]) return; seen[k] = 1; out2.push(r);
      });
      dev.rt.routes = out2;
      return out2;
    }

    (dev.cfg.staticRoutes || []).forEach(function (r) {
      list.push({ proto: 'Static', dest: r.dest, mask: U.maskLen(r.mask), pref: r.pref || 60, cost: 0, nexthop: r.nexthop || '0.0.0.0', oif: r.oif, flags: 'S', desc: r.desc, state: r.state });
    });
    if (dev.cfg.defaultRoute) {
      list.push({ proto: 'Static', dest: '0.0.0.0', mask: 0, pref: 60, cost: 0, nexthop: dev.cfg.defaultRoute, oif: null, flags: 'S' });
    }
    if (dev.cfg.ospf.enable) list = list.concat(learnedRoutes(dev, 'ospf'));
    if (dev.cfg.rip.enable) list = list.concat(learnedRoutes(dev, 'rip'));
    if (dev.cfg.isis.enable) list = list.concat(learnedRoutes(dev, 'isis'));

    // BGP: 手工 network + peer + 引入路由（含 Route-Policy）
    if (dev.cfg.bgp.enable) {
      (dev.cfg.bgp.networks || []).forEach(function (n) {
        list.push({ proto: 'BGP', dest: n.addr, mask: U.maskLen(n.mask || '255.255.255.255'), pref: 255, cost: 0, nexthop: '0.0.0.0', oif: null, flags: 'B' });
      });
      (dev.cfg.bgp.peers || []).forEach(function (p) {
        (p.advertised || []).forEach(function (n) {
          list.push({ proto: 'BGP', dest: n.addr, mask: U.maskLen(n.mask || '255.255.255.255'), pref: 255, cost: 0, nexthop: p.addr, oif: null, flags: 'B' });
        });
      });
      (dev.cfg.bgp.importRoutes || []).forEach(function (im) {
        var proto2 = im.proto, policy = im.policy || null;
        importedCandidates(dev, proto2).forEach(function (cand) {
          var r = cand;
          if (policy) { var res = applyRoutePolicy(dev, policy, r); if (!res.accept) return; r = res.route; }
          list.push({ proto: 'BGP', dest: r.dest, mask: r.mask, pref: 255, cost: (r.cost != null ? r.cost : 0), nexthop: (r.nexthop || '0.0.0.0'), oif: null, flags: 'B', tag: r.tag });
        });
      });
    }

    // 去重：相同 dest/mask 保留 preference 最小的
    var best = {};
    list.forEach(function (r) {
      if (r.dest == null) return;
      var k = r.dest + '/' + r.mask;
      if (!best[k] || r.pref < best[k].pref || (r.pref === best[k].pref && r.cost < best[k].cost)) best[k] = r;
    });
    var out = Object.keys(best).map(function (k) { return best[k]; });
    out.sort(function (a, b) {
      if (a.mask !== b.mask) return b.mask - a.mask;
      return a.dest.localeCompare(b.dest);
    });
    dev.rt.routes = out;
    return out;
  }
  Sim.computeRoutes = computeRoutes;
  Sim.routesOf = function (dev) { dev.rt.routes = null; return computeRoutes(dev); };

  /* 最长匹配查找 */
  function lookupRoute(dev, ip) {
    var list = computeRoutes(dev);
    var best = null;
    list.forEach(function (r) {
      if (r.dest == null) return;
      if (!U.inNet(ip, r.dest, r.mask)) return;
      if (!best || r.mask > best.mask || (r.mask === best.mask && r.pref < best.pref)) best = r;
    });
    return best;
  }
  Sim.lookupRoute = lookupRoute;

  /* 查找拥有某 IP 的设备 */
  function findOwner(ip) {
    for (var i = 0; i < S.S.devices.length; i++) {
      var d = S.S.devices[i];
      var l3 = l3Ifaces(d);
      for (var j = 0; j < l3.length; j++) {
        var o = l3[j];
        if (o.f.ip && o.f.ip.addr === ip) return { dev: d, iface: o.name, up: o.up };
        var sec = o.f.ipSecondary || [];
        for (var k = 0; k < sec.length; k++) if (sec[k].addr === ip) return { dev: d, iface: o.name, up: o.up };
      }
    }
    var vo = vrrpOwner(ip);
    if (vo) return vo;
    return null;
  }
  Sim.findOwner = findOwner;

  /* ============ VRRP（虚拟路由器冗余协议） ============ */
  // 收集所有 VRRP 实例：{ dev, iface, vrid, vip, priority, ifIp, up }
  function vrrpInstances() {
    var all = [];
    S.S.devices.forEach(function (d) {
      l3Ifaces(d).forEach(function (o) {
        (o.f.vrrp || []).forEach(function (v) {
          all.push({
            dev: d, iface: o.name, vrid: v.vrid, vip: v.vip,
            priority: (v.priority == null ? 100 : v.priority),
            ifIp: o.f.ip ? o.f.ip.addr : null,
            up: o.up
          });
        });
      });
    });
    return all;
  }
  // 计算实例生效优先级（track 监视的接口 down 时按 reduced 扣减）
  function vrrpEffPriority(ins) {
    var f = iface(ins.dev, ins.iface);
    var v = f && (f.vrrp || []).filter(function (x) { return x.vrid === ins.vrid; })[0];
    var prio = ins.priority;
    if (v && v.track && v.track.length) {
      v.track.forEach(function (t) {
        var tr = ins.dev.cfg.track && ins.dev.cfg.track[t.id];
        if (tr && tr.type === 'interface') {
          var tf = iface(ins.dev, tr.target);
          if (!tf || tf.adminUp === false || !portPhysUp(ins.dev, tr.target)) prio -= (t.reduced || 0);
        }
      });
    }
    return prio;
  }
  // 按 vrid@vip 分组选举 Master：生效优先级最高者主（平局比接口 IP 大）
  function electVrrp() {
    var groups = {};
    vrrpInstances().forEach(function (ins) {
      var k = ins.vrid + '@' + ins.vip;
      (groups[k] = groups[k] || []).push(ins);
    });
    Object.keys(groups).forEach(function (k) {
      var arr = groups[k], master = null;
      arr.forEach(function (ins) {
        if (!ins.up) return;
        var p = vrrpEffPriority(ins);
        if (!master) { master = { ins: ins, prio: p }; return; }
        if (p > master.prio) master = { ins: ins, prio: p };
        else if (p === master.prio && ins.ifIp && (!master.ins.ifIp || U.ip2int(ins.ifIp) > U.ip2int(master.ins.ifIp))) master = { ins: ins, prio: p };
      });
      arr.forEach(function (ins) {
        var f = iface(ins.dev, ins.iface);
        var v = f && (f.vrrp || []).filter(function (x) { return x.vrid === ins.vrid; })[0];
        if (!v) return;
        var isMaster = master && master.ins.dev.id === ins.dev.id && master.ins.iface === ins.iface && master.ins.vrid === ins.vrid;
        v.state = isMaster ? 'Master' : 'Backup';
        v.masterIp = isMaster ? ins.ifIp : (master ? master.ins.ifIp : null);
      });
    });
  }
  Sim.electVrrp = electVrrp;
  // 返回虚拟 IP 对应的 Master：{ dev, iface, up } 或 null
  function vrrpOwner(ip) {
    var groups = {};
    vrrpInstances().forEach(function (ins) {
      if (ins.vip !== ip) return;
      var k = ins.vrid + '@' + ins.vip;
      (groups[k] = groups[k] || []).push(ins);
    });
    var best = null, bestP = null;
    Object.keys(groups).forEach(function (k) {
      groups[k].forEach(function (ins) {
        if (!ins.up) return;
        var p = vrrpEffPriority(ins);
        if (best == null) { best = ins; bestP = p; return; }
        if (p > bestP) { best = ins; bestP = p; }
        else if (p === bestP && ins.ifIp && U.ip2int(ins.ifIp) > U.ip2int(best.ifIp)) { best = ins; bestP = p; }
      });
    });
    if (!best) return null;
    return { dev: best.dev, iface: best.iface, up: true };
  }
  Sim.vrrpOwner = vrrpOwner;

  /* ============ ACL ============ */
  function aclCheck(dev, aclId, pkt) {
    var a = dev.cfg.acl[aclId];
    if (!a || !a.rules || !a.rules.length) return { action: 'permit', matched: false };
    var rules = a.rules.slice().sort(function (x, y) { return x.id - y.id; });
    for (var i = 0; i < rules.length; i++) {
      var r = rules[i];
      if (r.action === 'deny' && !r.src) { /* rule deny 全匹配 */ }
      var okSrc = true, okDst = true, okProto = true, okPort = true;
      if (r.src) {
        if (r.srcAddr != null) {
          okSrc = U.wildMatch(pkt.srcIp, r.srcAddr, r.srcWild == null ? '0.0.0.0' : r.srcWild);
        }
      }
      if (r.dstAddr != null) {
        okDst = U.wildMatch(pkt.dstIp, r.dstAddr, r.dstWild == null ? '0.0.0.0' : r.dstWild);
      }
      if (r.proto && r.proto !== 'ip') {
        if (r.proto === 'icmp') okProto = pkt.proto === 'icmp';
        else if (r.proto === 'tcp') okProto = pkt.proto === 'tcp';
        else if (r.proto === 'udp') okProto = pkt.proto === 'udp';
        else okProto = true;
      }
      if (okProto && r.proto === 'tcp' || r.proto === 'udp') {
        if (r.dstPort != null) {
          var dp = pkt.dstPort;
          if (dp != null) {
            if (r.dstOp === 'eq') okPort = dp === r.dstPort;
            else if (r.dstOp === 'gt') okPort = dp > r.dstPort;
            else if (r.dstOp === 'lt') okPort = dp < r.dstPort;
            else if (r.dstOp === 'range') okPort = dp >= r.dstPort && dp <= r.dstPort2;
            if (!okPort) continue;
          }
        }
      }
      if (r.timeRange && !timeRangeActive(dev, r.timeRange)) continue;
      if (okSrc && okDst && okProto && okPort) return { action: r.action, matched: true, rule: r };
    }
    return { action: 'permit', matched: false, def: true };
  }
  function timeRangeActive(dev, name) { return true; }
  Sim.aclCheck = aclCheck;

  /* 接口上的包过滤检查 */
  function filterCheck(dev, ifName, direction, pkt) {
    var f = iface(dev, ifName);
    if (!f) return { action: 'permit' };
    var aclId = direction === 'in' ? f.aclIn : f.aclOut;
    if (aclId == null) return { action: 'permit' };
    return aclCheck(dev, aclId, pkt);
  }

  /* 策略路由匹配 */
  function pbrLookup(dev, pkt) {
    var out = null;
    (dev.cfg.policyRoutes || []).forEach(function (p) {
      if (out) return;
      if (p.acl != null) {
        var r = aclCheck(dev, p.acl, pkt);
        if (r.action === 'deny') return;
        if (!r.matched) return;
      }
      out = p;
    });
    return out;
  }

  /* ============ NAT 地址转换（真实转发接入） ============ */
  /* 判断某 IP 是否为本设备的 NAT 全局/服务器地址（DNAT 入站目标） */
  function isNatGlobal(dev, ip) {
    if (!dev || !dev.cfg) return false;
    var ifs = dev.cfg.ifaces || {};
    for (var ng in ifs) {
      var ff = ifs[ng];
      if (ff && ff.natServer) {
        for (var i = 0; i < ff.natServer.length; i++) if (ff.natServer[i].gip === ip) return true;
      }
    }
    var ns = dev.cfg.natStatic || [];
    for (var k = 0; k < ns.length; k++) if (ns[k].global === ip) return true;
    return false;
  }
  Sim.isNatGlobal = isNatGlobal;

  function recordNatSession(dev, ts, orig, proto, sport) {
    if (!dev.rt.natSessions) dev.rt.natSessions = [];
    var hit = null;
    for (var i = 0; i < dev.rt.natSessions.length; i++) {
      if (dev.rt.natSessions[i].orig === orig && dev.rt.natSessions[i].proto === (proto || 'ip')) { hit = dev.rt.natSessions[i]; break; }
    }
    if (hit) { hit.ts = ts; hit.sport = sport || 0; }
    else dev.rt.natSessions.push({ ts: ts, orig: orig, proto: proto || 'ip', sport: sport || 0 });
  }
  Sim.natSessionsOf = function (dev) { return dev.rt.natSessions || []; };

  function tryStaticNat(dev, pkt) {
    var list = dev.cfg.natStatic || [];
    for (var i = 0; i < list.length; i++) if (list[i].local === pkt.srcIp) return list[i].global;
    return null;
  }

  /* 出接口 NAT：静态 NAT（源）优先，其次接口 NAT Outbound（easy-ip / 地址池）。
     命中则改写 pkt.srcIp 为转换后地址，并记录会话供回程反向转换。 */
  function doNatEgress(dev, oif, pkt) {
    var st = tryStaticNat(dev, pkt);
    if (st) { recordNatSession(dev, st, pkt.srcIp, pkt.proto, pkt.srcPort); pkt.srcIp = st; return st; }
    var f = iface(dev, oif);
    if (!f || !f.natOutbound) return null;
    var no = f.natOutbound;
    if (!dev.cfg.acl[no.acl]) return null;
    var r = aclCheck(dev, no.acl, pkt);
    if (!r.matched || r.action !== 'permit') return null;   // 仅 permit 流量做 NAT
    var translated;
    if (no.group == null) {
      if (!f.ip) return null;
      translated = f.ip.addr;                              // easy-ip：用出接口 IP
    } else {
      var g = (dev.cfg.natGroups || {})[no.group];
      if (!g) return null;
      translated = g.start;                                // 地址池 NAPT / no-pat：取池起始地址
    }
    recordNatSession(dev, translated, pkt.srcIp, pkt.proto, pkt.srcPort);
    pkt.srcIp = translated;
    return translated;
  }

  /* 入站 NAT：到达本设备时，若为转换后地址则反向 SNAT；若为 NAT 服务器/静态全局地址则 DNAT。
     返回 {type,newDst} 或 null。 */
  function natInbound(dev, dstIp, pkt) {
    var sess = dev.rt.natSessions || [];
    for (var i = 0; i < sess.length; i++) {
      if (sess[i].ts === dstIp) return { type: 'snat-rev', newDst: sess[i].orig };
    }
    var nsv = null, nsg = null;
    var ifs = dev.cfg.ifaces || {};
    for (var n in ifs) {
      var f = ifs[n];
      if (f && f.natServer) {
        for (var j = 0; j < f.natServer.length; j++) {
          var s = f.natServer[j];
          if (s.gip === dstIp && (!pkt.proto || s.proto === pkt.proto) && (pkt.dstPort == null || s.gport === pkt.dstPort)) nsv = s;
        }
      }
    }
    if (nsv) return { type: 'dnat', newDst: nsv.lip };
    var ns = dev.cfg.natStatic || [];
    for (var k = 0; k < ns.length; k++) if (ns[k].global === dstIp) nsg = ns[k].local;
    if (nsg) return { type: 'dnat', newDst: nsg };
    return null;
  }

  /* ============ 同网段二层直达路径 ============ */
  /* 当 srcIp 与 dstIp 在同一子网，且二者在同一二层域时，直接构造二层转发路径
     解决 PC 跨纯二层交换机同 VLAN / 同网段 ping 不通的问题 */
  function tryL2Path(srcDev, srcIp, dstIp, pkt) {
    // 找到源 IP 对应的本地接口
    var srcL3 = null;
    l3Ifaces(srcDev).forEach(function (o) {
      if (!srcL3 && o.up && o.f.ip && o.f.ip.addr === srcIp) srcL3 = o;
    });
    // 源 IP 也可能是本设备作为 Master 持有的 VRRP 虚拟 IP（回程报文以虚拟 IP 为源）
    if (!srcL3) {
      var vo = vrrpOwner(srcIp);
      if (vo && vo.dev && vo.dev.id === srcDev.id) {
        l3Ifaces(srcDev).forEach(function (o) {
          if (!srcL3 && o.up && o.name === vo.iface) srcL3 = o;
        });
      }
    }
    if (!srcL3) return null;
    var len = U.maskLen(srcL3.f.ip.mask);
    if (len == null) return null;
    if (!U.sameNet(srcIp, dstIp, len)) return null;

    var oif = srcL3.name;
    var info = l3IfaceInfo(srcDev, oif);
    if (info.kind !== 'phy' && info.kind !== 'agg' && info.kind !== 'ragg') return null;

    // 确定所在 VLAN
    var vlan = null;
    var f = iface(srcDev, oif);
    if (f && f.mode === 'route') {
      var peer = S.getPeer(srcDev.id, oif);
      if (peer) {
        var pd = S.getDevice(peer.dev);
        var pf = pd ? iface(pd, peer.port) : null;
        if (pd && pd.type === 'switch' && pf && pf.mode === 'bridge' && pf.linkType === 'access') {
          vlan = pf.accessVlan || 1;
        }
      }
    } else if (f && f.linkType === 'access') {
      vlan = f.accessVlan || 1;
    } else if (f && (f.linkType === 'trunk' || f.linkType === 'hybrid')) {
      vlan = (f.permitVlans || [])[0];
    }
    if (vlan == null) return null;

    var startPort = oif;
    if (info.kind === 'agg' || info.kind === 'ragg') {
      var g = srcDev.cfg.lag[info.id];
      if (!g || !g.members || !g.members.length) return null;
      startPort = g.members[0];
    }

    var dom = /^BAGG/.test(startPort) ? aggregateDomain(srcDev, startPort, vlan) : l2Domain(srcDev, startPort, vlan);
    var owner = null;
    Object.keys(dom).forEach(function (did) {
      if (owner) return;
      if (did === srcDev.id) return;
      var d2 = S.getDevice(did); if (!d2) return;
      if (isNatGlobal(d2, dstIp)) return;   // NAT 全局地址不视为二层可达目的，交由路由 + DNAT 处理
      l3Ifaces(d2).forEach(function (o2) {
        if (!o2.up) return;
        if (o2.f.ip && o2.f.ip.addr === dstIp) owner = { dev: d2, iface: o2.name };
        (o2.f.ipSecondary || []).forEach(function (s) { if (s.addr === dstIp) owner = { dev: d2, iface: o2.name }; });
      });
      var vo = vrrpOwner(dstIp);
      if (vo && vo.dev.id === d2.id) owner = { dev: d2, iface: vo.iface };
    });
    if (!owner) return null;

    // 构造路径：从 srcDev 沿 l2Domain 回溯 owner
    var hops = [];
    var curId = owner.dev.id;
    while (curId !== srcDev.id) {
      var rec = dom[curId];
      if (!rec) return null;
      var curDev = S.getDevice(curId);
      var fromDev = S.getDevice(rec.from);
      if (!fromDev || !curDev) return null;
      hops.unshift({ dev: fromDev, outIf: rec.viaPort, outPort: rec.viaPort, next: curDev, nextIp: dstIp, ip: (fromDev.id === srcDev.id ? srcIp : null) });
      curId = rec.from;
    }
    hops.push({ dev: owner.dev, inIf: owner.iface, ip: dstIp, final: true });

    // 入方向 ACL（目标接口）
    var fi = filterCheck(owner.dev, owner.iface, 'in', pkt);
    if (fi.action === 'deny') return { ok: false, hops: hops, reason: 'acl', dev: owner.dev, iface: owner.iface };

    return { ok: true, hops: hops, l2: true };
  }

  /* ============ 转发路径计算 ============ */
  /* 从 srcDev(以 srcIp 为源) 到 dstIp 的三层路径
     返回 { ok, hops:[{dev, inIf, outIf, ip}], reason } */
  function forwardPath(srcDev, srcIp, dstIp, opts) {
    opts = opts || {};
    var pkt = { srcIp: srcIp, dstIp: dstIp, proto: opts.proto || 'icmp', srcPort: opts.srcPort, dstPort: opts.dstPort };

    // 同网段优先走二层域直达（PC/路由器物理口直连同 VLAN 场景）
    var l2path = tryL2Path(srcDev, srcIp, dstIp, pkt);
    if (l2path) return l2path;

    var hops = [];
    var cur = srcDev;
    var curIp = srcIp;
    var guard = 0;
    var visited = {};
    var lastTranslated = null;
    while (guard++ < 16) {
      if (visited[cur.id] && visited[cur.id] > 2) return { ok: false, hops: hops, reason: 'loop' };
      visited[cur.id] = (visited[cur.id] || 0) + 1;

      // NAT 入站：DNAT（nat server / 静态全局）或 反向 SNAT（回程包目的＝转换后地址）
      var nIn = natInbound(cur, dstIp, pkt);
      if (nIn) {
        dstIp = nIn.newDst;
        pkt.dstIp = dstIp;
      }

      // 到达？
      var own = null;
      l3Ifaces(cur).forEach(function (o) {
        if (o.f.ip && o.f.ip.addr === dstIp) own = o;
        (o.f.ipSecondary || []).forEach(function (s) { if (s.addr === dstIp) own = o; });
      });
      if (!own) {
        var vo = vrrpOwner(dstIp);
        if (vo && vo.dev.id === cur.id) { var vf = iface(cur, vo.iface); if (vf) own = { name: vo.iface, f: vf, up: true }; }
      }
      if (own) {
        hops.push({ dev: cur, inIf: own.name, ip: dstIp, final: true });
        // 入方向 ACL
        var fi = filterCheck(cur, own.name, 'in', pkt);
        if (fi.action === 'deny') return { ok: false, hops: hops, reason: 'acl', dev: cur, iface: own.name };
        return { ok: true, hops: hops, translatedSrc: lastTranslated };
      }

      // 策略路由
      var pbr = pbrLookup(cur, pkt);
      var r = null;
      if (pbr && pbr.nextHop) {
        r = { oif: null, nexthop: pbr.nextHop, proto: 'PBR' };
        // 需再查直连确定出接口
        var rr = findRouteToNexthop(cur, pbr.nextHop);
        if (rr) r = rr;
      } else {
        r = lookupRoute(cur, dstIp);
      }
      if (!r) return { ok: false, hops: hops, reason: 'noroute', dev: cur };

      var target = (r.nexthop && r.nexthop !== '0.0.0.0' && r.nexthop !== '127.0.0.1') ? r.nexthop : dstIp;

      // 递归下一跳解析：静态/OSPF/BGP 路由只给了下一跳而未指出接口时，
      // 用下一跳地址再查一次直连路由确定出接口（等价于真实设备的路由迭代）
      var oif = r.oif;
      if (!oif || !l3Up(cur, oif)) {
        var rec = findRouteToNexthop(cur, target);
        if (rec && rec.oif) oif = rec.oif;
      }

      // 出接口 NAT：SNAT / 静态 NAT（改写源地址并记录会话，供回程反向转换）
      var natTr = doNatEgress(cur, oif, pkt);
      if (natTr) lastTranslated = natTr;

      // 出方向 ACL（出接口，使用转换后的源地址）
      var fo = filterCheck(cur, oif, 'out', pkt);
      if (fo.action === 'deny') {
        hops.push({ dev: cur, outIf: oif, ip: curIp, blocked: true });
        return { ok: false, hops: hops, reason: 'acl', dev: cur, iface: oif };
      }

      // 找承载出接口的实际物理端口，并沿二层到达 target
      var step = resolveNextHop(cur, oif, target);
      if (!step) {
        hops.push({ dev: cur, outIf: oif, ip: curIp, blocked: true });
        return { ok: false, hops: hops, reason: 'unreachable', dev: cur, iface: oif };
      }
      var peerDev = S.getDevice(step.peerDev);
      if (!peerDev) return { ok: false, hops: hops, reason: 'unreachable', dev: cur };
      // 入方向 ACL（对端入接口）
      var fin = filterCheck(peerDev, step.peerIf, 'in', pkt);
      if (fin.action === 'deny') {
        hops.push({ dev: peerDev, inIf: step.peerIf, ip: target, blocked: true });
        return { ok: false, hops: hops, reason: 'acl', dev: peerDev, iface: step.peerIf };
      }
      hops.push({ dev: cur, outIf: oif, outPort: step.localPort, ip: curIp, next: peerDev, nextIp: target });
      cur = peerDev;
      curIp = target;
    }
    return { ok: false, hops: hops, reason: 'ttl' };
  }
  Sim.forwardPath = forwardPath;

  function findRouteToNexthop(dev, nh) {
    var list = computeRoutes(dev), best = null;
    list.forEach(function (r) {
      if (r.dest == null) return;
      if (!U.inNet(nh, r.dest, r.mask)) return;
      if (r.oif && !l3Up(dev, r.oif)) return;
      if (!best || r.mask > best.mask) best = r;
    });
    return best;
  }

  /* 给定出接口与目标 IP，找出实际二层出口与对端设备 */
  function resolveNextHop(dev, oif, target) {
    var info = l3IfaceInfo(dev, oif);
    var vlan = null, candPorts = [];
    if (info.kind === 'vlan') {
      vlan = info.vlan;
      candPorts = portsInVlan(dev, vlan, true);
    } else if (info.kind === 'phy') {
      if (!portUp(dev, oif)) return null;
      var f = iface(dev, oif);
      candPorts = [oif];
      vlan = f && f.mode === 'route' ? null : (f.linkType === 'access' ? f.accessVlan : (f.permitVlans || [])[0]);
      if (f && f.mode === 'route') {
        var pr = S.getPeer(dev.id, oif);
        if (!pr) return null;
        var pd = S.getDevice(pr.dev); if (!pd) return null;
        return { localPort: oif, peerDev: pr.dev, peerIf: pr.port };
      }
    } else if (info.kind === 'agg' || info.kind === 'ragg') {
      var g = dev.cfg.lag[info.id];
      if (!g) return null;
      var gf = iface(dev, oif);
      if (gf.mode === 'route') {
        for (var mi = 0; mi < g.members.length; mi++) {
          var pr2 = S.getPeer(dev.id, g.members[mi]);
          if (pr2) return { localPort: g.members[mi], peerDev: pr2.dev, peerIf: pr2.port };
        }
        return null;
      }
      vlan = gf.linkType === 'access' ? gf.accessVlan : (gf.permitVlans || [])[0];
      candPorts = g.members.filter(function (m) { return portUp(dev, m); });
    } else return null;

    // 目标是否就是自己？已在 forwardPath 处理
    for (var i = 0; i < candPorts.length; i++) {
      var pn = candPorts[i];
      var v = vlan != null ? vlan : (function () {
        var f2 = iface(dev, pn);
        return f2.linkType === 'access' ? f2.accessVlan : (f2.permitVlans || [])[0];
      })();
      var dom = /^BAGG/.test(pn) ? aggregateDomain(dev, pn, v) : l2Domain(dev, pn, v);
      var owner = null;
      Object.keys(dom).forEach(function (did) {
        if (owner) return;
        if (did === dev.id) return;
        var d2 = S.getDevice(did); if (!d2) return;
        var hit = null;
        l3Ifaces(d2).forEach(function (o2) {
          if (o2.f.ip && o2.f.ip.addr === target) hit = o2.name;
          (o2.f.ipSecondary || []).forEach(function (s) { if (s.addr === target) hit = o2.name; });
        });
        var vo = vrrpOwner(target);
        if (vo && vo.dev.id === d2.id) hit = vo.iface;
        if (hit) owner = { dev: did, iface: hit };
      });
      // 若是路由器/三层设备做转发，对端端口也要在同一 VLAN
      if (!owner) {
        // 允许"对端也参与三层转发但 target 是更远设备"：由逐跳处理，这里要求 target 在本广播域
        continue;
      }
      // 找具体对端端口
      var peerInfo = null;
      var plist = /^BAGG/.test(pn) ? (dev.cfg.lag[pn.slice(4)] || {}).members || [] : [pn];
      for (var k = 0; k < plist.length && !peerInfo; k++) {
        var pp = S.getPeer(dev.id, plist[k]);
        if (!pp) continue;
        var pd2 = S.getDevice(pp.dev);
        if (!pd2 || pd2.id !== owner.dev) continue;
        peerInfo = { localPort: plist[k], peerDev: pp.dev, peerIf: pp.port };
      }
      if (peerInfo) return peerInfo;
    }
    return null;
  }
  function aggregateDomain(dev, aggName, vlan) {
    var dom = {}; dom[dev.id] = { hops: 0 };
    var g = dev.cfg.lag[aggName.slice(4)]; if (!g) return dom;
    g.members.forEach(function (m) {
      if (!portUp(dev, m)) return;
      var d = l2Domain(dev, m, vlan);
      Object.keys(d).forEach(function (k) { if (!dom[k]) dom[k] = d[k]; });
    });
    return dom;
  }
  Sim.resolveNextHop = resolveNextHop;

  /* ============ 学习 MAC / ARP ============ */
  function learnMac(dev, vlan, portName, mac) {
    if (!dev.rt.mac[vlan]) dev.rt.mac[vlan] = {};
    if (!dev.rt.mac[vlan][portName]) dev.rt.mac[vlan][portName] = {};
    dev.rt.mac[vlan][portName][mac] = { age: 0, type: 'dynamic' };
  }
  function learnArp(dev, ip, mac, ifaceName, vlan) {
    dev.rt.arp[ip] = { mac: mac, iface: ifaceName, vlan: vlan || 0, type: 'dynamic', age: 0 };
  }
  /* IPv6 邻居（ND 缓存），与 IPv4 ARP 表对称；ip 须为全展开形式 */
  function learnNd6(dev, ip, mac, ifaceName) {
    if (!dev.rt.nd6) dev.rt.nd6 = {};
    var k = U.ipv6NetOf(ip, 128) || ip;
    dev.rt.nd6[k] = { mac: mac, iface: ifaceName, state: 'REACH', type: 'dynamic', age: 0 };
  }
  Sim.learnNd6 = learnNd6;

  /* ping 后沿路径学习 */
  function learnFromPath(path, srcDev, srcIp, dstIp) {
    var srcMac = bridgeMac(srcDev);
    var dstOwner = findOwner(dstIp);
    var dstMac = dstOwner ? bridgeMac(dstOwner.dev) : U.genMac(dstIp);
    path.hops.forEach(function (h) {
      var d = h.dev;
      if (d.type === 'switch') {
        var vlan = null;
        if (h.outIf) {
          var info = l3IfaceInfo(d, h.outIf);
          if (info.kind === 'vlan') vlan = info.vlan;
        }
        if (vlan == null && h.outPort) {
          var f = iface(d, h.outPort);
          if (f) vlan = f.linkType === 'access' ? f.accessVlan : (f.permitVlans || [])[0];
        }
        if (vlan != null && h.outPort) learnMac(d, vlan, h.outPort, srcMac);
      }
      // ARP
      if (h.next) {
        var peer = S.getDevice(h.next.id);
        if (peer) learnArp(d, h.nextIp, bridgeMac(peer), h.outIf || h.outPort, null);
      }
    });
    if (dstOwner) {
      var last = path.hops[path.hops.length - 1];
      learnArp(dstOwner.dev, srcIp, srcMac, dstOwner.iface, null);
    }
  }

  /* ============ ping / tracert ============ */
  function srcIpOf(dev, spec) {
    if (spec && U.isIp(spec)) return spec;
    var l3 = l3Ifaces(dev);
    for (var i = 0; i < l3.length; i++) {
      if (l3[i].up && l3[i].f.ip) {
        if (!spec) return l3[i].f.ip.addr;
        var info = l3[i].info;
        if (l3[i].name === spec || l3[i].name.indexOf(spec) === 0) return l3[i].f.ip.addr;
      }
    }
    if (spec && /^Vlan-interface/.test(spec)) return null;
    return l3.length ? null : null;
  }
  Sim.srcIpOf = srcIpOf;

  function ping(dev, target, opts) {
    opts = opts || {};
    Sim.invalidate();
    var count = opts.count || 5;
    var src = opts.src || null;
    var out = [];
    var dstIp = target;
    // 域名解析
    if (!U.isIp(dstIp)) {
      var host = findByNameOrHost(dstIp);
      if (!host) return { out: 'Ping: Unknown host ' + dstIp + '.' };
      dstIp = host;
    }
    var srcIp = srcIpOf(dev, src);
    if (!srcIp) return { out: 'Ping: The source address does not exist.' };

    out.push('Ping ' + dstIp + ' (' + dstIp + '): ' + (opts.size || 56) + ' data bytes, press CTRL_C to break');

    // 计算路径
    var p1 = forwardPath(dev, srcIp, dstIp);
    var ok = p1.ok;
    var reason = p1.reason;
    var hops = p1.hops;

    // 回程检查：目标设备能否回到源（NAT 场景下回程源为转换后公网地址）
    var backOk = false, backReason = null;
    if (ok) {
      var owner = findOwner(dstIp);
      if (owner) {
        var backSrc = (p1.translatedSrc) || srcIp;
        var p2 = forwardPath(owner.dev, dstIp, backSrc);
        backOk = p2.ok; backReason = p2.reason;
      }
    }

    if (ok && backOk) learnFromPath(p1, dev, srcIp, dstIp);

    var times = [], recv = 0;
    for (var i = 0; i < count; i++) {
      if (ok && backOk) {
        var t = (1 + Math.random() * 2).toFixed(1);
        if (i === 0) t = (3 + Math.random() * 3).toFixed(1);
        times.push(parseFloat(t)); recv++;
        out.push('Reply from ' + dstIp + ': bytes=' + (opts.size || 56) + ' Sequence=' + (i + 1) + ' ttl=' + (255 - (hops.length - 1)) + ' time=' + t + ' ms');
      } else {
        out.push('Request time out');
      }
    }
    out.push('');
    out.push('--- Ping statistics for ' + dstIp + ' ---');
    out.push(count + ' packet(s) transmitted, ' + recv + ' packet(s) received, ' +
      (((count - recv) / count) * 100).toFixed(2) + '% packet loss');
    if (recv) {
      var mn = Math.min.apply(null, times), mx = Math.max.apply(null, times);
      var avg = times.reduce(function (a, b) { return a + b; }, 0) / times.length;
      out.push('round-trip min/avg/max = ' + mn.toFixed(1) + '/' + avg.toFixed(1) + '/' + mx.toFixed(1) + ' ms');
    } else {
      var msg = {
        noroute: 'Destination host unreachable (no route)',
        unreachable: 'Destination host unreachable (L2/L3 unreachable)',
        acl: 'Destination host unreachable (administratively prohibited by ACL)',
        ttl: 'Time to live exceeded',
        loop: 'Routing loop detected'
      };
      out.push(backOk === false && backReason ? ('Note: no return path (' + (msg[backReason] || 'unreachable') + ')') : (msg[reason] || 'Destination host unreachable'));
    }
    return { out: out.join('\n'), ok: ok && backOk, path: p1, backReason: backReason };
  }
  Sim.ping = ping;

  function tracert(dev, target, opts) {
    opts = opts || {};
    Sim.invalidate();
    var dstIp = target;
    if (!U.isIp(dstIp)) { var h = findByNameOrHost(dstIp); if (!h) return { out: 'Tracert: Unknown host ' + dstIp + '.' }; dstIp = h; }
    var srcIp = srcIpOf(dev, opts.src);
    if (!srcIp) return { out: 'Tracert: The source address does not exist.' };
    var out = [];
    out.push('traceroute to ' + dstIp + '(' + dstIp + '), ' + (opts.maxTtl || 30) + ' hops at most, ' + (opts.size || 40) + ' bytes each packet,press CTRL_C to break');
    var cur = dev, curIp = srcIp, ttl = 1, guard = 0;
    var done = false;
    function tline(ip) { return ttl + '  ' + ip + '   ' + (1 + Math.random() * 4).toFixed(0) + ' ms  ' + (1 + Math.random() * 3).toFixed(0) + ' ms  ' + (1 + Math.random() * 3).toFixed(0) + ' ms'; }
    while (ttl <= (opts.maxTtl || 30) && guard++ < 32) {
      var p = forwardPath(cur, curIp, dstIp);
      var hops = p.hops || [];
      if (!hops.length) { out.push(ttl + '  * * *'); break; }
      var first = hops[0];
      var hopIp = first.nextIp || first.ip || dstIp;
      out.push(tline(hopIp));
      if (hopIp === dstIp) { done = true; break; }   // 已到达目的主机
      var hopDev = first.next;
      if (hopDev && hopDev.id !== cur.id) { cur = hopDev; curIp = hopIp; ttl++; continue; }
      out.push(ttl + '  * * *'); break;
    }
    if (!done) out.push('');
    return { out: out.join('\n') };
  }
  Sim.tracert = tracert;

  function findByNameOrHost(name) {
    var d = S.getDeviceByName(name);
    if (!d) return null;
    var l3 = l3Ifaces(d);
    for (var i = 0; i < l3.length; i++) if (l3[i].f.ip) return l3[i].f.ip.addr;
    return null;
  }

  /* ============ IPv6 转发（双栈；复用 L2 域机制，无 NAT/VRRP） ============ */
  /* 接口 f.ipv6 = [{ addr: 网络形式, prefix: 0-128 }]；默认路由以 dest '::' prefix 0 表示。 */

  function l3Ifaces6(dev) {
    var out = [];
    var names = {};
    if (dev.cfg.ifaces) Object.keys(dev.cfg.ifaces).forEach(function (n) { names[n] = dev.cfg.ifaces[n]; });
    Object.keys(dev.cfg.vlanIfaces || {}).forEach(function (n) { names[n] = dev.cfg.vlanIfaces[n]; });
    Object.keys(dev.cfg.loopbacks || {}).forEach(function (n) { names[n] = dev.cfg.loopbacks[n]; });
    Object.keys(dev.cfg.lag || {}).forEach(function (gid) {
      var g = dev.cfg.lag[gid];
      var nm = (g.type === 'route' ? 'RAGG' : 'BAGG') + gid;
      if (!names[nm]) names[nm] = H.Model.defaultIface({ name: nm, type: 'GE' });
    });
    Object.keys(names).forEach(function (n) {
      var f = names[n];
      if (!f.ipv6 || !f.ipv6.length) return;
      out.push({ name: n, f: f, up: l3Up(dev, n), info: l3IfaceInfo(dev, n) });
    });
    return out;
  }
  Sim.l3Ifaces6 = l3Ifaces6;

  function directRoutes6(dev) {
    var out = [];
    l3Ifaces6(dev).forEach(function (o) {
      if (!o.up) return;
      (o.f.ipv6 || []).forEach(function (a) {
        var prefix = a.prefix, addr = a.addr;
        if (prefix === 128 && o.info.kind !== 'loop') {
          out.push({ proto: 'Direct', dest: addr, mask: 128, pref: 0, cost: 0, nexthop: addr, oif: o.name, flags: 'D' });
        } else {
          out.push({ proto: 'Direct', dest: U.ipv6NetOf(addr, prefix), mask: prefix, pref: 0, cost: 0, nexthop: '::', oif: o.name, flags: 'D' });
          if (o.info.kind !== 'loop') {
            out.push({ proto: 'Direct', dest: addr, mask: 128, pref: 0, cost: 0, nexthop: addr, oif: o.name, flags: 'L' });
          }
        }
      });
    });
    return out;
  }

  function computeRoutes6(dev) {
    if (dev.rt.routes6) return dev.rt.routes6;
    var list = directRoutes6(dev);

    // 主机（PC/Server）：直连 + 默认网关
    if (dev.type === 'pc' || dev.type === 'server') {
      (dev.cfg.ipv6StaticRoutes || []).forEach(function (r) {
        list.push({ proto: 'Static', dest: r.dest, mask: r.prefix, pref: 60, cost: 0, nexthop: U.ipv6NetOf(r.nexthop, 128) || r.nexthop, oif: r.oif || 'GE0/1', flags: 'S' });
      });
      if (dev.cfg.ipv6DefaultRoute) {
        // dest 必须走 ipv6NetOf('::',0) 归一化，与 ipv6 route-static :: 0 ... 写入的形式一致，
        // 否则同条默认路由会以两种字符串形式存在、去重失效而出现重复条目
        list.push({ proto: 'Static', dest: U.ipv6NetOf('::', 0), mask: 0, pref: 60, cost: 0, nexthop: U.ipv6NetOf(dev.cfg.ipv6DefaultRoute, 128) || dev.cfg.ipv6DefaultRoute, oif: 'GE0/1', flags: 'S' });
      }
      var seen = {}, out2 = [];
      list.forEach(function (r) {
        var k = r.dest + '/' + r.mask + ':' + r.proto;
        if (seen[k]) return; seen[k] = 1; out2.push(r);
      });
      dev.rt.routes6 = out2;
      return out2;
    }

    (dev.cfg.ipv6StaticRoutes || []).forEach(function (r) {
      list.push({ proto: 'Static', dest: r.dest, mask: r.prefix, pref: r.pref || 60, cost: 0, nexthop: U.ipv6NetOf(r.nexthop, 128) || r.nexthop || '::', oif: r.oif, flags: 'S', desc: r.desc, state: r.state });
    });
    if (dev.cfg.ipv6DefaultRoute) {
      list.push({ proto: 'Static', dest: U.ipv6NetOf('::', 0), mask: 0, pref: 60, cost: 0, nexthop: U.ipv6NetOf(dev.cfg.ipv6DefaultRoute, 128) || dev.cfg.ipv6DefaultRoute, oif: null, flags: 'S' });
    }

    // 去重：相同 dest/mask 保留 preference 最小的
    var best = {};
    list.forEach(function (r) {
      if (r.dest == null) return;
      var k = r.dest + '/' + r.mask;
      if (!best[k] || r.pref < best[k].pref || (r.pref === best[k].pref && r.cost < best[k].cost)) best[k] = r;
    });
    var out = Object.keys(best).map(function (k) { return best[k]; });
    out.sort(function (a, b) {
      if (a.mask !== b.mask) return b.mask - a.mask;
      return a.dest.localeCompare(b.dest);
    });
    dev.rt.routes6 = out;
    return out;
  }
  Sim.computeRoutes6 = computeRoutes6;
  Sim.routesOf6 = function (dev) { dev.rt.routes6 = null; return computeRoutes6(dev); };

  function lookupRoute6(dev, dstIp) {
    var list = computeRoutes6(dev), best = null;
    list.forEach(function (r) {
      if (r.dest == null) return;
      if (!U.ipv6InNet(dstIp, r.dest, r.mask)) return;
      if (!best || r.mask > best.mask || (r.mask === best.mask && r.pref < best.pref)) best = r;
    });
    return best;
  }
  Sim.lookupRoute6 = lookupRoute6;

  function findOwner6(ip) {
    for (var i = 0; i < S.S.devices.length; i++) {
      var d = S.S.devices[i];
      var l3 = l3Ifaces6(d);
      for (var j = 0; j < l3.length; j++) {
        var a = l3[j].f.ipv6 || [];
        for (var k = 0; k < a.length; k++) if (a[k].addr === ip) return { dev: d, iface: l3[j].name, up: l3[j].up };
      }
    }
    return null;
  }
  Sim.findOwner6 = findOwner6;

  function tryL2Path6(srcDev, srcIp, dstIp, pkt) {
    var srcL3 = null;
    l3Ifaces6(srcDev).forEach(function (o) {
      if (!srcL3 && o.up) {
        var addrs = o.f.ipv6 || [];
        for (var i = 0; i < addrs.length; i++) if (addrs[i].addr === srcIp) srcL3 = o;
      }
    });
    if (!srcL3) return null;
    var len = null;
    (srcL3.f.ipv6 || []).forEach(function (a) { if (a.addr === srcIp) len = a.prefix; });
    if (len == null) return null;
    if (!U.ipv6SameNet(srcIp, dstIp, len)) return null;

    var oif = srcL3.name;
    var info = l3IfaceInfo(srcDev, oif);
    if (info.kind !== 'phy' && info.kind !== 'agg' && info.kind !== 'ragg') return null;

    var vlan = null;
    var f = iface(srcDev, oif);
    if (f && f.mode === 'route') {
      var peer = S.getPeer(srcDev.id, oif);
      if (peer) {
        var pd = S.getDevice(peer.dev);
        var pf = pd ? iface(pd, peer.port) : null;
        if (pd && pd.type === 'switch' && pf && pf.mode === 'bridge' && pf.linkType === 'access') vlan = pf.accessVlan || 1;
      }
    } else if (f && f.linkType === 'access') {
      vlan = f.accessVlan || 1;
    } else if (f && (f.linkType === 'trunk' || f.linkType === 'hybrid')) {
      vlan = (f.permitVlans || [])[0];
    }
    if (vlan == null) return null;

    var startPort = oif;
    if (info.kind === 'agg' || info.kind === 'ragg') {
      var g = srcDev.cfg.lag[info.id];
      if (!g || !g.members || !g.members.length) return null;
      startPort = g.members[0];
    }

    var dom = /^BAGG/.test(startPort) ? aggregateDomain(srcDev, startPort, vlan) : l2Domain(srcDev, startPort, vlan);
    var owner = null;
    Object.keys(dom).forEach(function (did) {
      if (owner) return;
      if (did === srcDev.id) return;
      var d2 = S.getDevice(did); if (!d2) return;
      l3Ifaces6(d2).forEach(function (o2) {
        if (!o2.up) return;
        var a2 = o2.f.ipv6 || [];
        for (var i = 0; i < a2.length; i++) if (a2[i].addr === dstIp) owner = { dev: d2, iface: o2.name };
      });
    });
    if (!owner) return null;

    var hops = [];
    var curId = owner.dev.id;
    while (curId !== srcDev.id) {
      var rec = dom[curId];
      if (!rec) return null;
      var curDev = S.getDevice(curId);
      var fromDev = S.getDevice(rec.from);
      if (!fromDev || !curDev) return null;
      hops.unshift({ dev: fromDev, outIf: rec.viaPort, outPort: rec.viaPort, next: curDev, nextIp: dstIp, ip: (fromDev.id === srcDev.id ? srcIp : null) });
      curId = rec.from;
    }
    hops.push({ dev: owner.dev, inIf: owner.iface, ip: dstIp, final: true });

    var fi = filterCheck(owner.dev, owner.iface, 'in', pkt);
    if (fi.action === 'deny') return { ok: false, hops: hops, reason: 'acl', dev: owner.dev, iface: owner.iface };
    // 同网段直连：学到对端的 IPv6 邻居（ND 缓存），供 display ipv6 neighbors 展示
    learnNd6(srcDev, dstIp, bridgeMac(owner.dev), oif);
    return { ok: true, hops: hops, l2: true };
  }

  function forwardPath6(srcDev, srcIp, dstIp, opts) {
    opts = opts || {};
    // 归一化为全展开形式，确保与 ipv6Split 存储的 addr 字符串全等比较一致
    if (U.isIpv6(srcIp)) srcIp = U.ipv6NetOf(srcIp, 128) || srcIp;
    if (U.isIpv6(dstIp)) dstIp = U.ipv6NetOf(dstIp, 128) || dstIp;
    var pkt = { srcIp: srcIp, dstIp: dstIp, proto: opts.proto || 'icmpv6', srcPort: opts.srcPort, dstPort: opts.dstPort };

    var l2path = tryL2Path6(srcDev, srcIp, dstIp, pkt);
    if (l2path) return l2path;

    var hops = [];
    var cur = srcDev, curIp = srcIp, guard = 0, visited = {};
    while (guard++ < 16) {
      if (visited[cur.id] && visited[cur.id] > 2) return { ok: false, hops: hops, reason: 'loop' };
      visited[cur.id] = (visited[cur.id] || 0) + 1;

      // 到达？
      var own = null;
      l3Ifaces6(cur).forEach(function (o) {
        var a = o.f.ipv6 || [];
        for (var i = 0; i < a.length; i++) if (a[i].addr === dstIp) own = o;
      });
      if (own) {
        hops.push({ dev: cur, inIf: own.name, ip: dstIp, final: true });
        var fi = filterCheck(cur, own.name, 'in', pkt);
        if (fi.action === 'deny') return { ok: false, hops: hops, reason: 'acl', dev: cur, iface: own.name };
        return { ok: true, hops: hops };
      }

      var r = lookupRoute6(cur, dstIp);
      if (!r) return { ok: false, hops: hops, reason: 'noroute', dev: cur };

      var target = (r.nexthop && r.nexthop !== '::') ? r.nexthop : dstIp;

      var oif = r.oif;
      if (!oif || !l3Up(cur, oif)) {
        var rec = findRouteToNexthop6(cur, target);
        if (rec && rec.oif) oif = rec.oif;
      }

      var fo = filterCheck(cur, oif, 'out', pkt);
      if (fo.action === 'deny') {
        hops.push({ dev: cur, outIf: oif, ip: curIp, blocked: true });
        return { ok: false, hops: hops, reason: 'acl', dev: cur, iface: oif };
      }

      var step = resolveNextHop6(cur, oif, target);
      if (!step) {
        hops.push({ dev: cur, outIf: oif, ip: curIp, blocked: true });
        return { ok: false, hops: hops, reason: 'unreachable', dev: cur, iface: oif };
      }
      var peerDev = S.getDevice(step.peerDev);
      if (!peerDev) return { ok: false, hops: hops, reason: 'unreachable', dev: cur };
      var fin = filterCheck(peerDev, step.peerIf, 'in', pkt);
      if (fin.action === 'deny') {
        hops.push({ dev: peerDev, inIf: step.peerIf, ip: target, blocked: true });
        return { ok: false, hops: hops, reason: 'acl', dev: peerDev, iface: step.peerIf };
      }
      // 学到下一跳的 IPv6 邻居（ND 缓存），供 display ipv6 neighbors 展示
      learnNd6(cur, target, bridgeMac(peerDev), step.localPort || oif);
      hops.push({ dev: cur, outIf: oif, outPort: step.localPort, ip: curIp, next: peerDev, nextIp: target });
      cur = peerDev; curIp = target;
    }
    return { ok: false, hops: hops, reason: 'ttl' };
  }
  Sim.forwardPath6 = forwardPath6;

  function findRouteToNexthop6(dev, nh) {
    var list = computeRoutes6(dev), best = null;
    list.forEach(function (r) {
      if (r.dest == null) return;
      if (!U.ipv6InNet(nh, r.dest, r.mask)) return;
      if (r.oif && !l3Up(dev, r.oif)) return;
      if (!best || r.mask > best.mask) best = r;
    });
    return best;
  }

  function resolveNextHop6(dev, oif, target) {
    var info = l3IfaceInfo(dev, oif);
    var vlan = null, candPorts = [];
    if (info.kind === 'vlan') {
      vlan = info.vlan;
      candPorts = portsInVlan(dev, vlan, true);
    } else if (info.kind === 'phy') {
      if (!portUp(dev, oif)) return null;
      var f = iface(dev, oif);
      candPorts = [oif];
      vlan = f && f.mode === 'route' ? null : (f.linkType === 'access' ? f.accessVlan : (f.permitVlans || [])[0]);
      if (f && f.mode === 'route') {
        var pr = S.getPeer(dev.id, oif);
        if (!pr) return null;
        var pd = S.getDevice(pr.dev); if (!pd) return null;
        return { localPort: oif, peerDev: pr.dev, peerIf: pr.port };
      }
    } else if (info.kind === 'agg' || info.kind === 'ragg') {
      var g = dev.cfg.lag[info.id];
      if (!g) return null;
      var gf = iface(dev, oif);
      if (gf.mode === 'route') {
        for (var mi = 0; mi < g.members.length; mi++) {
          var pr2 = S.getPeer(dev.id, g.members[mi]);
          if (pr2) return { localPort: g.members[mi], peerDev: pr2.dev, peerIf: pr2.port };
        }
        return null;
      }
      vlan = gf.linkType === 'access' ? gf.accessVlan : (gf.permitVlans || [])[0];
      candPorts = g.members.filter(function (m) { return portUp(dev, m); });
    } else return null;

    for (var i = 0; i < candPorts.length; i++) {
      var pn = candPorts[i];
      var v = vlan != null ? vlan : (function () {
        var f2 = iface(dev, pn);
        return f2.linkType === 'access' ? f2.accessVlan : (f2.permitVlans || [])[0];
      })();
      var dom = /^BAGG/.test(pn) ? aggregateDomain(dev, pn, v) : l2Domain(dev, pn, v);
      var owner = null;
      Object.keys(dom).forEach(function (did) {
        if (owner) return;
        if (did === dev.id) return;
        var d2 = S.getDevice(did); if (!d2) return;
        var hit = null;
        l3Ifaces6(d2).forEach(function (o2) {
          var a2 = o2.f.ipv6 || [];
          for (var k = 0; k < a2.length; k++) if (a2[k].addr === target) hit = o2.name;
        });
        if (hit) owner = { dev: did, iface: hit };
      });
      if (!owner) continue;
      var peerInfo = null;
      var plist = /^BAGG/.test(pn) ? (dev.cfg.lag[pn.slice(4)] || {}).members || [] : [pn];
      for (var k = 0; k < plist.length && !peerInfo; k++) {
        var pp = S.getPeer(dev.id, plist[k]);
        if (!pp) continue;
        var pd2 = S.getDevice(pp.dev);
        if (!pd2 || pd2.id !== owner.dev) continue;
        peerInfo = { localPort: plist[k], peerDev: pp.dev, peerIf: pp.port };
      }
      if (peerInfo) return peerInfo;
    }
    return null;
  }

  function srcIpOf6(dev, spec) {
    if (spec && U.isIpv6(spec)) return spec;
    var l3 = l3Ifaces6(dev);
    for (var i = 0; i < l3.length; i++) {
      if (l3[i].up && l3[i].f.ipv6 && l3[i].f.ipv6.length) {
        if (!spec) return l3[i].f.ipv6[0].addr;
        if (l3[i].name === spec || l3[i].name.indexOf(spec) === 0) return l3[i].f.ipv6[0].addr;
      }
    }
    return l3.length ? null : null;
  }
  Sim.srcIpOf6 = srcIpOf6;

  function findByNameOrHost6(name) {
    var d = S.getDeviceByName(name);
    if (!d) return null;
    var l3 = l3Ifaces6(d);
    for (var i = 0; i < l3.length; i++) if (l3[i].f.ipv6 && l3[i].f.ipv6.length) return l3[i].f.ipv6[0].addr;
    return null;
  }

  function ping6(dev, target, opts) {
    opts = opts || {};
    Sim.invalidate();
    var count = opts.count || 5;
    var src = opts.src || null;
    var out = [];
    var dstIp = target;
    if (!U.isIpv6(dstIp)) {
      var host = findByNameOrHost6(dstIp);
      if (!host) return { out: 'Ping6: Unknown host ' + dstIp + '.' };
      dstIp = host;
    }
    dstIp = U.ipv6NetOf(dstIp, 128) || dstIp;   // 归一化为全展开形式
    var dstDisp = U.ipv6Compress(dstIp);
    var srcIp = srcIpOf6(dev, src);
    if (!srcIp) return { out: 'Ping6: The source address does not exist.' };

    out.push('Ping6 ' + dstDisp + ' (' + dstDisp + '): ' + (opts.size || 56) + ' data bytes, press CTRL_C to break');

    var p1 = forwardPath6(dev, srcIp, dstIp);
    var ok = p1.ok, reason = p1.reason, hops = p1.hops;

    var backOk = false, backReason = null;
    if (ok) {
      var owner = findOwner6(dstIp);
      if (owner) {
        var p2 = forwardPath6(owner.dev, dstIp, srcIp);
        backOk = p2.ok; backReason = p2.reason;
      }
    }

    var times = [], recv = 0;
    for (var i = 0; i < count; i++) {
      if (ok && backOk) {
        var t = (1 + Math.random() * 2).toFixed(1);
        if (i === 0) t = (3 + Math.random() * 3).toFixed(1);
        times.push(parseFloat(t)); recv++;
        out.push('Reply from ' + dstDisp + ': bytes=' + (opts.size || 56) + ' Sequence=' + (i + 1) + ' ttl=' + (255 - (hops.length - 1)) + ' time=' + t + ' ms');
      } else {
        out.push('Request time out');
      }
    }
    out.push('');
    out.push('--- Ping6 statistics for ' + dstDisp + ' ---');
    out.push(count + ' packet(s) transmitted, ' + recv + ' packet(s) received, ' +
      (((count - recv) / count) * 100).toFixed(2) + '% packet loss');
    if (recv) {
      var mn = Math.min.apply(null, times), mx = Math.max.apply(null, times);
      var avg = times.reduce(function (a, b) { return a + b; }, 0) / times.length;
      out.push('round-trip min/avg/max = ' + mn.toFixed(1) + '/' + avg.toFixed(1) + '/' + mx.toFixed(1) + ' ms');
    } else {
      var msg = {
        noroute: 'Destination host unreachable (no route)',
        unreachable: 'Destination host unreachable (L2/L3 unreachable)',
        acl: 'Destination host unreachable (administratively prohibited by ACL)',
        ttl: 'Time to live exceeded',
        loop: 'Routing loop detected'
      };
      out.push(backOk === false && backReason ? ('Note: no return path (' + (msg[backReason] || 'unreachable') + ')') : (msg[reason] || 'Destination host unreachable'));
    }
    return { out: out.join('\n'), ok: ok && backOk, path: p1, backReason: backReason };
  }
  Sim.ping6 = ping6;

  function tracert6(dev, target, opts) {
    opts = opts || {};
    Sim.invalidate();
    var dstIp = target;
    if (!U.isIpv6(dstIp)) { var h = findByNameOrHost6(dstIp); if (!h) return { out: 'Tracert6: Unknown host ' + dstIp + '.' }; dstIp = h; }
    dstIp = U.ipv6NetOf(dstIp, 128) || dstIp;   // 归一化为全展开形式
    var dstDisp = U.ipv6Compress(dstIp);
    var srcIp = srcIpOf6(dev, opts.src);
    if (!srcIp) return { out: 'Tracert6: The source address does not exist.' };
    var out = [];
    out.push('traceroute to ' + dstDisp + '(' + dstDisp + '), ' + (opts.maxTtl || 30) + ' hops at most, ' + (opts.size || 40) + ' bytes each packet,press CTRL_C to break');
    var cur = dev, curIp = srcIp, ttl = 1, guard = 0, done = false;
    function tline6(ip) { return ttl + '  ' + ip + '   ' + (1 + Math.random() * 4).toFixed(0) + ' ms  ' + (1 + Math.random() * 3).toFixed(0) + ' ms  ' + (1 + Math.random() * 3).toFixed(0) + ' ms'; }
    while (ttl <= (opts.maxTtl || 30) && guard++ < 32) {
      var p = forwardPath6(cur, curIp, dstIp);
      var hops = p.hops || [];
      if (!hops.length) { out.push(ttl + '  * * *'); break; }
      var first = hops[0];
      var hopIp = first.nextIp || first.ip || dstIp;
      out.push(tline6(U.ipv6Compress(hopIp)));
      if (hopIp === dstIp) { done = true; break; }   // 已到达目的主机
      var hopDev = first.next;
      if (hopDev && hopDev.id !== cur.id) { cur = hopDev; curIp = hopIp; ttl++; continue; }
      out.push(ttl + '  * * *'); break;
    }
    if (!done) out.push('');
    return { out: out.join('\n') };
  }
  Sim.tracert6 = tracert6;

  /* ============ 端口统计 / 显示辅助 ============ */
  Sim.ifaceLine = function (dev, name) {
    var f = iface(dev, name); if (!f) return null;
    var info = l3IfaceInfo(dev, name);
    var phys = portPhysUp(dev, name);
    var up = (info.kind === 'phy') ? portUp(dev, name) : l3Up(dev, name);
    var proto = 'down';
    if (info.kind === 'phy' || info.kind === 'agg' || info.kind === 'ragg') {
      proto = !f.adminUp ? '*down' : (phys ? 'up' : 'down');
      if (info.kind !== 'phy') proto = phys ? 'up' : 'down';
    } else {
      proto = l3Up(dev, name) ? 'up' : 'down';
    }
    if (isSerialPort(dev, name)) {
      proto = !f.adminUp ? 'down' : (linkProtocolUp(dev, name) ? 'up' : 'down');
    }
    if (dev.type === 'switch' && dev.cfg.stp.enable && stpParticipate(dev, name)) {
      var st = (stpState()[dev.id] || {})[name];
      if (st && st.state === 'discarding') proto = 'down(stp)';
    }
    return { name: name, f: f, up: up, phys: phys, proto: proto, info: info };
  };

  Sim.iface = iface;
  Sim.l3Up = l3Up;
  Sim.STP_COST = STP_COST;
  Sim.BW_MBPS = BW_MBPS;

  H.Sim = Sim;
})(window.H3C);
