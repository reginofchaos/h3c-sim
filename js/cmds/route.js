/* 路由协议：RIP / OSPF / BGP / 策略路由 / 路由策略 */
(function (H) {
  'use strict';
  var U = H.U, S = H.State, R = H.R, C = H.Cmd;

  /* 掩码/反掩码自适应 */
  function toMaskLen(m) {
    if (m == null) return 32;
    if (/^\d+$/.test(String(m))) return parseInt(m, 10);
    var len = U.maskLen(m);
    if (len !== null && String(m) !== '0.0.0.0') return len;   // 正常掩码
    // 反掩码
    var v = U.ip2int(m); if (v === null) return null;
    var wild = (~v) >>> 0;
    return U.maskLen(U.int2ip(wild));
  }

  /* ==================== OSPF ==================== */
  R({
    views: ['system'], pat: 'ospf <int>', seq: 'ospf',
    help: '创建 OSPF 进程并进入 OSPF 视图',
    run: function (c) {
      c.dev.cfg.ospf.enable = true;
      c.dev.cfg.ospf.process = parseInt(c.args.int, 10);
      return { enter: { view: 'ospf', arg: parseInt(c.args.int, 10) } };
    },
    undo: function (c) {
      c.dev.cfg.ospf.enable = false; c.dev.cfg.ospf.networks = []; c.dev.cfg.ospf.areas = {};
      return { out: '' };
    }
  });
  R({
    views: ['system'], pat: 'ospf <int> router-id <ip>', seq: 'ospf',
    help: '创建 OSPF 进程并指定 Router ID',
    run: function (c) {
      c.dev.cfg.ospf.enable = true;
      c.dev.cfg.ospf.process = parseInt(c.args.int, 10);
      c.dev.cfg.ospf.routerId = c.args.ip;
      return { enter: { view: 'ospf', arg: parseInt(c.args.int, 10) } };
    }
  });
  R({
    views: ['ospf'], pat: 'router-id <ip>', seq: 'ospf',
    help: '配置 OSPF Router ID',
    run: function (c) { c.dev.cfg.ospf.routerId = c.args.ip; return { out: '' }; }
  });
  R({
    views: ['ospf'], pat: 'area <ip>', seq: 'ospf',
    help: '进入 OSPF 区域视图',
    run: function (c) {
      c.dev.cfg.ospf.areas[c.args.ip] = c.dev.cfg.ospf.areas[c.args.ip] || { id: c.args.ip, type: 'normal', networks: [] };
      c.sess.curArea = c.args.ip;
      return { enter: { view: 'ospf-area', arg: { p: c.view.arg, a: c.args.ip } } };
    }
  });
  R({
    views: ['ospf'], pat: 'area <int>', hidden: true, seq: 'ospf',
    help: '进入 OSPF 区域视图',
    run: function (c) {
      var a = U.int2ip(parseInt(c.args.int, 10) * 0x1000000);
      c.dev.cfg.ospf.areas[a] = c.dev.cfg.ospf.areas[a] || { id: a, type: 'normal', networks: [] };
      c.sess.curArea = a;
      return { enter: { view: 'ospf-area', arg: { p: c.view.arg, a: a } } };
    }
  });
  R({
    views: ['ospf'], pat: 'area <ip> stub', hidden: true, seq: 'ospf',
    help: '配置 Stub 区域',
    run: function (c) {
      c.dev.cfg.ospf.areas[c.args.ip] = { id: c.args.ip, type: 'stub', networks: [] };
      return { out: '' };
    }
  });
  R({
    views: ['ospf'], pat: 'area <ip> nssa', hidden: true, seq: 'ospf',
    help: '配置 NSSA 区域',
    run: function (c) { c.dev.cfg.ospf.areas[c.args.ip] = { id: c.args.ip, type: 'nssa', networks: [] }; return { out: '' }; }
  });
  R({
    views: ['ospf-area'], pat: 'network <ip> <mask>', seq: 'ospf',
    help: '在区域内宣告网段（掩码或反掩码均可）',
    run: function (c) {
      var len = toMaskLen(c.args._1);
      if (len === null) return { out: 'Error: Wrong parameter found at \'^\' position.', err: true };
      c.dev.cfg.ospf.networks.push({ addr: U.netOf(c.args._0, len), mask: U.lenMask(len), area: c.view.arg.a });
      if (!c.dev.cfg.ospf.areas[c.view.arg.a]) c.dev.cfg.ospf.areas[c.view.arg.a] = { id: c.view.arg.a, type: 'normal', networks: [] };
      return { out: '' };
    }
  });
  /* 反掩码写法（真实设备 network 语句常用 0.0.0.255 形式） */
  R({
    views: ['ospf-area'], pat: 'network <ip> <wild>', hidden: true, seq: 'ospf',
    help: '在区域内宣告网段（反掩码）',
    run: function (c) {
      var len = toMaskLen(c.args._1);
      if (len === null) return { out: 'Error: Wrong parameter found at \'^\' position.', err: true };
      c.dev.cfg.ospf.networks.push({ addr: U.netOf(c.args._0, len), mask: U.lenMask(len), area: c.view.arg.a });
      if (!c.dev.cfg.ospf.areas[c.view.arg.a]) c.dev.cfg.ospf.areas[c.view.arg.a] = { id: c.view.arg.a, type: 'normal', networks: [] };
      return { out: '' };
    },
    undo: function (c) {
      var len = toMaskLen(c.args._1); if (len === null) return { out: '', err: true };
      var n = U.netOf(c.args._0, len);
      c.dev.cfg.ospf.networks = c.dev.cfg.ospf.networks.filter(function (x) { return !(x.addr === n && x.area === c.view.arg.a); });
      return { out: '' };
    }
  });
  R({
    views: ['ospf'], pat: 'network <ip> <wild>', hidden: true, seq: 'ospf',
    help: '宣告网段（区域 0，反掩码）',
    run: function (c) {
      var len = toMaskLen(c.args._1);
      if (len === null) return { out: 'Error: Wrong parameter found at \'^\' position.', err: true };
      var a = c.sess.curArea || '0.0.0.0';
      c.dev.cfg.ospf.networks.push({ addr: U.netOf(c.args._0, len), mask: U.lenMask(len), area: a });
      c.dev.cfg.ospf.areas[a] = c.dev.cfg.ospf.areas[a] || { id: a, type: 'normal', networks: [] };
      return { out: '' };
    }
  });
  R({
    views: ['ospf'], pat: 'network <ip> <mask>', hidden: true, seq: 'ospf',
    help: '宣告网段（区域 0）',
    run: function (c) {
      var len = toMaskLen(c.args._1);
      if (len === null) return { out: 'Error: Wrong parameter found at \'^\' position.', err: true };
      var a = c.sess.curArea || '0.0.0.0';
      c.dev.cfg.ospf.networks.push({ addr: U.netOf(c.args._0, len), mask: U.lenMask(len), area: a });
      c.dev.cfg.ospf.areas[a] = c.dev.cfg.ospf.areas[a] || { id: a, type: 'normal', networks: [] };
      return { out: '' };
    }
  });
  R({
    views: ['ospf-area'], pat: 'abr-summary <ip> <mask>', hidden: true, seq: 'ospf',
    help: '配置区域间路由聚合', run: function () { return { out: '' }; }
  });
  R({
    views: ['ospf-area'], pat: 'authentication-mode +simple|md5', hidden: true, seq: 'ospf',
    help: '配置区域认证', run: function (c) { c.dev.cfg.ospf.areas[c.view.arg.a].auth = c.args._0; return { out: '' }; }
  });
  R({
    views: ['ospf-area'], pat: 'vlink-peer <ip>', hidden: true, seq: 'ospf',
    help: '配置虚连接', run: function () { return { out: '' }; }
  });
  R({
    views: ['ospf-area'], pat: 'stub', seq: 'ospf',
    help: '配置该区域为 Stub 区域',
    run: function (c) { c.dev.cfg.ospf.areas[c.view.arg.a].type = 'stub'; return { out: '' }; }
  });
  R({
    views: ['ospf-area'], pat: 'nssa', seq: 'ospf',
    help: '配置该区域为 NSSA 区域',
    run: function (c) { c.dev.cfg.ospf.areas[c.view.arg.a].type = 'nssa'; return { out: '' }; }
  });
  R({
    views: ['ospf'], pat: 'silent-interface <ifname>', seq: 'ospf',
    help: '配置被动接口（不发送协议报文）',
    run: function (c) { c.dev.cfg.ospf.silent.push(U.ifShort(c.args.ifname)); return { out: '' }; },
    undo: function (c) { c.dev.cfg.ospf.silent = c.dev.cfg.ospf.silent.filter(function (x) { return x !== U.ifShort(c.args.ifname); }); return { out: '' }; }
  });
  R({
    views: ['ospf'], pat: 'default-route-advertise', seq: 'ospf',
    help: '向 OSPF 域内通告默认路由',
    run: function (c) { c.dev.cfg.ospf.defaultRouteAdvertise = true; return { out: '' }; },
    undo: function (c) { c.dev.cfg.ospf.defaultRouteAdvertise = false; return { out: '' }; }
  });
  R({
    views: ['ospf'], pat: 'default-route-advertise always', hidden: true, seq: 'ospf',
    help: '始终通告默认路由', run: function (c) { c.dev.cfg.ospf.defaultRouteAdvertise = 'always'; return { out: '' }; }
  });
  R({
    views: ['ospf'], pat: 'import-route +static|direct|rip|bgp|connected|isis', seq: 'ospf',
    help: '引入外部路由',
    run: function (c) { c.dev.cfg.ospf.importRoutes.push({ proto: c.args._0, policy: null }); return { out: '' }; }
  });
  R({
    views: ['ospf'], pat: 'import-route +static|direct|rip|bgp|connected|isis route-policy <word>', seq: 'ospf',
    help: '引入外部路由并应用路由策略',
    run: function (c) { c.dev.cfg.ospf.importRoutes.push({ proto: c.args._0, policy: c.args.word }); return { out: '' }; }
  });
  R({
    views: ['ospf'], pat: 'bandwidth-reference <int>', seq: 'ospf',
    help: '配置带宽参考值（Mbps）',
    run: function (c) { c.dev.cfg.ospf.bandwidthRef = parseInt(c.args.int, 10); return { out: '' }; }
  });
  R({
    views: ['ospf'], pat: 'preference <int>', hidden: true, seq: 'ospf',
    help: '配置 OSPF 路由优先级', run: function (c) { c.dev.cfg.ospf.preference = parseInt(c.args.int, 10); return { out: '' }; }
  });
  R({
    views: ['ospf'], pat: 'timers spf <int> <int>', hidden: true, seq: 'ospf',
    help: '配置 SPF 计算间隔', run: function () { return { out: '' }; }
  });
  R({
    views: ['interface'], pat: 'ospf cost <int>', seq: 'ospf',
    help: '配置接口 OSPF 开销值',
    run: function (c) { return C.applyIfaces(c, function (f) { f.ospfCost = parseInt(c.args.int, 10); }); },
    undo: function (c) { return C.applyIfaces(c, function (f) { f.ospfCost = null; }); }
  });
  R({
    views: ['interface'], pat: 'ospf network-type +broadcast|nbma|p2p|p2mp', seq: 'ospf',
    help: '配置接口 OSPF 网络类型',
    run: function (c) { return C.applyIfaces(c, function (f) { f.ospfNetworkType = c.args._0; }); }
  });
  R({
    views: ['interface'], pat: 'ospf timer hello <int>', hidden: true, seq: 'ospf',
    help: '配置 Hello 定时器', run: function (c) { return C.applyIfaces(c, function (f) { f.ospfHello = parseInt(c.args.int, 10); }); }
  });
  R({
    views: ['interface'], pat: 'ospf timer dead <int>', hidden: true, seq: 'ospf',
    help: '配置 Dead 定时器', run: function (c) { return C.applyIfaces(c, function (f) { f.ospfDead = parseInt(c.args.int, 10); }); }
  });
  R({
    views: ['interface'], pat: 'ospf dr-priority <int>', seq: 'ospf',
    help: '配置接口 DR 优先级', run: function (c) { return C.applyIfaces(c, function (f) { f.ospfDrPriority = parseInt(c.args.int, 10); }); }
  });
  R({
    views: ['interface'], pat: 'ospf authentication-mode +simple|md5 <int> <word>', hidden: true, seq: 'ospf',
    help: '配置接口 OSPF 认证', run: function () { return { out: '' }; }
  });
  R({
    views: ['interface'], pat: 'ospf timer ldp-sync', hidden: true, seq: 'ospf',
    help: 'OSPF 与 LDP 同步', run: function () { return { out: '' }; }
  });

  /* ==================== RIP ==================== */
  R({
    views: ['system'], pat: 'rip <int>', seq: 'rip',
    help: '创建 RIP 进程并进入 RIP 视图',
    run: function (c) {
      c.dev.cfg.rip.enable = true; c.dev.cfg.rip.process = parseInt(c.args.int, 10);
      return { enter: { view: 'rip', arg: parseInt(c.args.int, 10) } };
    },
    undo: function (c) { c.dev.cfg.rip.enable = false; c.dev.cfg.rip.networks = []; return { out: '' }; }
  });
  R({
    views: ['system'], pat: 'rip', hidden: true, seq: 'rip',
    help: '创建 RIP 进程 1',
    run: function (c) { c.dev.cfg.rip.enable = true; return { enter: { view: 'rip', arg: 1 } }; }
  });
  R({
    views: ['rip'], pat: 'version +1|2', seq: 'rip',
    help: '配置 RIP 版本', run: function (c) { c.dev.cfg.rip.version = parseInt(c.args._0, 10); return { out: '' }; }
  });
  R({
    views: ['rip'], pat: 'network <ip>', seq: 'rip',
    help: '宣告主类网段',
    run: function (c) { c.dev.cfg.rip.networks.push({ addr: c.args.ip, mask: null, area: null }); return { out: '' }; },
    undo: function (c) { c.dev.cfg.rip.networks = c.dev.cfg.rip.networks.filter(function (n) { return n.addr !== c.args.ip; }); return { out: '' }; }
  });
  R({
    views: ['rip'], pat: 'network <ip> <mask>', hidden: true, seq: 'rip',
    help: '宣告网段', run: function (c) { c.dev.cfg.rip.networks.push({ addr: c.args._0, mask: c.args._1 }); return { out: '' }; }
  });
  R({
    views: ['rip'], pat: 'undo summary', seq: 'rip',
    help: '关闭自动汇总', run: function (c) { c.dev.cfg.rip.summary = false; return { out: '' }; }
  });
  R({
    views: ['rip'], pat: 'summary', hidden: true, seq: 'rip',
    help: '开启自动汇总', run: function (c) { c.dev.cfg.rip.summary = true; return { out: '' }; }
  });
  R({
    views: ['rip'], pat: 'import-route +static|direct|ospf|bgp|connected', seq: 'rip',
    help: '引入外部路由', run: function (c) { c.dev.cfg.rip.importRoutes.push({ proto: c.args._0, policy: null }); return { out: '' }; }
  });
  R({
    views: ['rip'], pat: 'import-route +static|direct|ospf|bgp|connected route-policy <word>', seq: 'rip',
    help: '引入外部路由并应用路由策略', run: function (c) { c.dev.cfg.rip.importRoutes.push({ proto: c.args._0, policy: c.args.word }); return { out: '' }; }
  });
  R({
    views: ['rip'], pat: 'silent-interface <ifname>', seq: 'rip',
    help: '配置被动接口', run: function (c) { c.dev.cfg.rip.passive.push(U.ifShort(c.args.ifname)); return { out: '' }; }
  });
  R({
    views: ['rip'], pat: 'default-route originate', seq: 'rip',
    help: '向 RIP 域通告默认路由', run: function (c) { c.dev.cfg.rip.defaultOrig = true; return { out: '' }; }
  });
  R({
    views: ['rip'], pat: 'peer <ip>', hidden: true, seq: 'rip',
    help: '配置 RIP 单播邻居', run: function (c) { c.dev.cfg.rip.neighbors.push(c.args.ip); return { out: '' }; }
  });
  R({
    views: ['rip'], pat: 'preference <int>', hidden: true, seq: 'rip',
    help: '配置 RIP 优先级', run: function (c) { c.dev.cfg.rip.preference = parseInt(c.args.int, 10); return { out: '' }; }
  });
  R({
    views: ['rip'], pat: 'timers update <int> timeout <int> garbage-collect <int>', hidden: true, seq: 'rip',
    help: '配置 RIP 定时器', run: function () { return { out: '' }; }
  });
  R({
    views: ['interface'], pat: 'rip split-horizon', seq: 'rip',
    help: '开启水平分割', run: function (c) { return C.applyIfaces(c, function (f) { f.ripSplit = true; }); },
    undo: function (c) { return C.applyIfaces(c, function (f) { f.ripSplit = false; }); }
  });
  R({
    views: ['interface'], pat: 'rip poison-reverse', seq: 'rip',
    help: '开启毒性逆转', run: function (c) { return C.applyIfaces(c, function (f) { f.ripPoison = true; }); }
  });
  R({
    views: ['interface'], pat: 'rip metricin <int>', hidden: true, seq: 'rip',
    help: '配置接收路由度量增值', run: function (c) { return C.applyIfaces(c, function (f) { f.ripMetricin = parseInt(c.args.int, 10); }); }
  });
  R({
    views: ['interface'], pat: 'rip version +1|2', hidden: true, seq: 'rip',
    help: '配置接口 RIP 版本', run: function (c) { return C.applyIfaces(c, function (f) { f.ripVer = c.args._0; }); }
  });

  /* ==================== BGP ==================== */
  R({
    views: ['system'], pat: 'bgp <int>', seq: 'bgp',
    help: '创建 BGP 进程并进入 BGP 视图',
    run: function (c) {
      c.dev.cfg.bgp.enable = true; c.dev.cfg.bgp.as = parseInt(c.args.int, 10);
      return { enter: { view: 'bgp', arg: parseInt(c.args.int, 10) } };
    },
    undo: function (c) { c.dev.cfg.bgp.enable = false; c.dev.cfg.bgp.peers = []; return { out: '' }; }
  });
  R({
    views: ['bgp'], pat: 'router-id <ip>', seq: 'bgp',
    help: '配置 BGP Router ID', run: function (c) { c.dev.cfg.bgp.routerId = c.args.ip; return { out: '' }; }
  });
  R({
    views: ['bgp'], pat: 'peer <ip> as-number <int>', seq: 'bgp',
    help: '配置 BGP 对等体',
    run: function (c) {
      var p = c.dev.cfg.bgp.peers.filter(function (x) { return x.addr === c.args._0; })[0];
      if (!p) { p = { addr: c.args._0, as: parseInt(c.args._1, 10), advertised: [], desc: null }; c.dev.cfg.bgp.peers.push(p); }
      else p.as = parseInt(c.args._1, 10);
      return { out: '' };
    },
    undo: function (c) { c.dev.cfg.bgp.peers = c.dev.cfg.bgp.peers.filter(function (x) { return x.addr !== c.args._0; }); return { out: '' }; }
  });
  R({
    views: ['bgp'], pat: 'peer <ip> connect-interface <ifname>', seq: 'bgp',
    help: '指定建立 TCP 连接的接口',
    run: function (c) {
      var p = c.dev.cfg.bgp.peers.filter(function (x) { return x.addr === c.args._0; })[0];
      if (!p) return { out: 'Error: The peer does not exist.', err: true };
      p.connectIf = U.ifShort(c.args.ifname);
      return { out: '' };
    }
  });
  R({
    views: ['bgp'], pat: 'peer <ip> next-hop-local', seq: 'bgp',
    help: '向对等体发布路由时修改下一跳为自身',
    run: function (c) {
      var p = c.dev.cfg.bgp.peers.filter(function (x) { return x.addr === c.args._0; })[0];
      if (p) p.nextHopLocal = true;
      return { out: '' };
    }
  });
  R({
    views: ['bgp'], pat: 'peer <ip> description <text>', hidden: true, seq: 'bgp',
    help: '配置对等体描述', run: function () { return { out: '' }; }
  });
  R({
    views: ['bgp'], pat: 'peer <ip> ebgp-max-hop <int>', hidden: true, seq: 'bgp',
    help: '配置 EBGP 最大跳数', run: function () { return { out: '' }; }
  });
  R({
    views: ['bgp'], pat: 'address-family ipv4 unicast', seq: 'bgp',
    help: '进入 BGP IPv4 单播地址族视图',
    run: function (c) { return { enter: { view: 'bgp-ipv4', arg: c.view.arg } }; }
  });
  R({
    views: ['bgp', 'bgp-ipv4'], pat: 'network <ip> <mask>', seq: 'bgp',
    help: '宣告网段到 BGP',
    run: function (c) {
      var len = toMaskLen(c.args._1);
      c.dev.cfg.bgp.networks.push({ addr: U.netOf(c.args._0, len == null ? 24 : len), mask: U.lenMask(len == null ? 24 : len) });
      return { out: '' };
    }
  });
  R({
    views: ['bgp'], pat: 'network <ip>', hidden: true, seq: 'bgp',
    help: '宣告网段到 BGP', run: function (c) { c.dev.cfg.bgp.networks.push({ addr: c.args.ip, mask: '255.255.255.255' }); return { out: '' }; }
  });
  R({
    views: ['bgp'], pat: 'import-route +static|direct|ospf|rip|connected', seq: 'bgp',
    help: '引入路由到 BGP', run: function (c) { c.dev.cfg.bgp.importRoutes.push({ proto: c.args._0, policy: null }); return { out: '' }; }
  });
  R({
    views: ['bgp'], pat: 'import-route +static|direct|ospf|rip|connected route-policy <word>', seq: 'bgp',
    help: '引入路由到 BGP 并应用路由策略', run: function (c) { c.dev.cfg.bgp.importRoutes.push({ proto: c.args._0, policy: c.args.word }); return { out: '' }; }
  });
  R({
    views: ['bgp'], pat: 'graceful-restart', hidden: true, seq: 'bgp',
    help: '开启平滑重启', run: function (c) { c.dev.cfg.bgp.gracefulRestart = true; return { out: '' }; }
  });
  R({
    views: ['bgp'], pat: 'default med <int>', hidden: true, seq: 'bgp',
    help: '配置默认 MED', run: function () { return { out: '' }; }
  });
  R({
    views: ['bgp'], pat: 'compare-different-as-med', hidden: true, seq: 'bgp',
    help: '允许比较不同 AS 的 MED', run: function () { return { out: '' }; }
  });

  /* ==================== IS-IS ==================== */
  R({
    views: ['system'], pat: 'isis <int>', seq: 'isis',
    help: '创建 IS-IS 进程并进入 IS-IS 视图',
    run: function (c) {
      c.dev.cfg.isis.enable = true;
      c.dev.cfg.isis.process = parseInt(c.args.int, 10);
      return { enter: { view: 'isis', arg: parseInt(c.args.int, 10) } };
    },
    undo: function (c) { c.dev.cfg.isis.enable = false; c.dev.cfg.isis.networks = []; c.dev.cfg.isis.importRoutes = []; return { out: '' }; }
  });
  R({
    views: ['isis'], pat: 'is-level +level-1|level-1-2|level-2', seq: 'isis',
    help: '配置 IS-IS 路由等级',
    run: function (c) { c.dev.cfg.isis.level = c.args._0; return { out: '' }; }
  });
  R({
    views: ['isis'], pat: 'network-entity <text>', seq: 'isis',
    help: '配置网络实体名称（NET）',
    run: function (c) { c.dev.cfg.isis.net = c.args.text; return { out: '' }; }
  });
  R({
    views: ['isis'], pat: 'import-route +static|direct|rip|ospf|bgp|connected', seq: 'isis',
    help: '引入外部路由',
    run: function (c) { c.dev.cfg.isis.importRoutes.push({ proto: c.args._0, policy: null }); return { out: '' }; }
  });
  R({
    views: ['isis'], pat: 'import-route +static|direct|rip|ospf|bgp|connected route-policy <word>', seq: 'isis',
    help: '引入外部路由并应用路由策略',
    run: function (c) { c.dev.cfg.isis.importRoutes.push({ proto: c.args._0, policy: c.args.word }); return { out: '' }; }
  });
  R({
    views: ['isis'], pat: 'summary <ip> <mask>', hidden: true, seq: 'isis',
    help: '配置路由聚合', run: function (c) { c.dev.cfg.isis.summary = { addr: c.args._0, mask: c.args._1 }; return { out: '' }; }
  });
  R({
    views: ['interface'], pat: 'isis enable <int>', seq: 'isis',
    help: '在接口上使能 IS-IS',
    run: function (c) { return C.applyIfaces(c, function (f) { f.isisEnable = parseInt(c.args.int, 10); if (!f.isisLevel) f.isisLevel = 'level-1-2'; }); },
    undo: function (c) { return C.applyIfaces(c, function (f) { f.isisEnable = null; }); }
  });
  R({
    views: ['interface'], pat: 'isis cost <int>', seq: 'isis',
    help: '配置接口 IS-IS 开销',
    run: function (c) { return C.applyIfaces(c, function (f) { f.isisCost = parseInt(c.args.int, 10); }); },
    undo: function (c) { return C.applyIfaces(c, function (f) { f.isisCost = null; }); }
  });
  R({
    views: ['interface'], pat: 'isis circuit-level +level-1|level-1-2|level-2', seq: 'isis',
    help: '配置接口线路等级',
    run: function (c) { return C.applyIfaces(c, function (f) { f.isisLevel = c.args._0; }); }
  });
  R({
    views: ['interface'], pat: 'isis circuit-type +p2p|broadcast', hidden: true, seq: 'isis',
    help: '配置接口网络类型', run: function (c) { return C.applyIfaces(c, function (f) { f.isisCircuitType = c.args._0; }); }
  });

  /* ==================== 策略路由 PBR ==================== */
  R({
    views: ['system'], pat: 'policy-based-route <word> permit node <int>', seq: 'pbr',
    help: '创建策略路由节点',
    run: function (c) {
      var p = { name: c.args._0, node: parseInt(c.args._1, 10), action: 'permit', acl: null, nextHop: null, oif: null };
      c.dev.cfg.policyRoutes.push(p);
      return { enter: { view: 'pbr-node', arg: { name: c.args._0, node: parseInt(c.args._1, 10) } } };
    }
  });
  R({
    views: ['system'], pat: 'policy-based-route <word> deny node <int>', hidden: true, seq: 'pbr',
    help: '创建拒绝型策略路由节点',
    run: function (c) {
      c.dev.cfg.policyRoutes.push({ name: c.args._0, node: parseInt(c.args._1, 10), action: 'deny', acl: null, nextHop: null, oif: null });
      return { enter: { view: 'pbr-node', arg: { name: c.args._0, node: parseInt(c.args._1, 10) } } };
    }
  });
  R({
    views: ['pbr-node'], pat: 'if-match acl <acl>', seq: 'pbr',
    help: '匹配 ACL',
    run: function (c) {
      var p = pbr(c); if (!p) return { out: '' };
      p.acl = parseInt(c.args.acl, 10);
      return { out: '' };
    }
  });
  R({
    views: ['pbr-node'], pat: 'apply next-hop <ip>', seq: 'pbr',
    help: '设置下一跳',
    run: function (c) { var p = pbr(c); if (p) p.nextHop = c.args.ip; return { out: '' }; }
  });
  R({
    views: ['pbr-node'], pat: 'apply output-interface <ifname>', hidden: true, seq: 'pbr',
    help: '设置出接口', run: function (c) { var p = pbr(c); if (p) p.oif = U.ifShort(c.args.ifname); return { out: '' }; }
  });
  R({
    views: ['pbr-node'], pat: 'apply ip-precedence <int>', hidden: true, seq: 'pbr',
    help: '设置 IP 优先级', run: function () { return { out: '' }; }
  });
  R({
    views: ['interface'], pat: 'ip policy-based-route <word>', seq: 'pbr',
    help: '接口应用策略路由',
    run: function (c) { return C.applyIfaces(c, function (f) { f.pbr = c.args.word; }); },
    undo: function (c) { return C.applyIfaces(c, function (f) { f.pbr = null; }); }
  });
  function pbr(c) {
    return c.dev.cfg.policyRoutes.filter(function (p) { return p.name === c.view.arg.name && p.node === c.view.arg.node; })[0];
  }

  /* ==================== 路由策略 / IP-Prefix ==================== */
  function getOrCreateRP(c, action) {
    c.dev.cfg.routePolicies = c.dev.cfg.routePolicies || [];
    var name = c.args._0, node = parseInt(c.args._1, 10);
    var ex = null;
    for (var i = 0; i < c.dev.cfg.routePolicies.length; i++) {
      if (c.dev.cfg.routePolicies[i].name === name && c.dev.cfg.routePolicies[i].node === node) { ex = c.dev.cfg.routePolicies[i]; break; }
    }
    if (!ex) {
      ex = { name: name, node: node, action: action, match: { acl: null, ipPrefix: null }, apply: { cost: null, preference: null, tag: null, nextHop: null } };
      c.dev.cfg.routePolicies.push(ex);
    } else { ex.action = action; }
    return { enter: { view: 'route-policy', arg: { name: name, node: node } } };
  }
  R({
    views: ['system'], pat: 'route-policy <word> permit node <int>', seq: 'policy',
    help: '创建 Route-Policy（允许节点）',
    run: function (c) { return getOrCreateRP(c, 'permit'); }
  });
  R({
    views: ['system'], pat: 'route-policy <word> deny node <int>', seq: 'policy',
    help: '创建 Route-Policy（拒绝节点）',
    run: function (c) { return getOrCreateRP(c, 'deny'); }
  });
  // 引擎在执行前会剥离 undo 前缀，因此 undo 必须挂在「正向命令」的 undoFn 上，
  // 单独的 `undo route-policy <word>` 正向命令无法被匹配到。
  R({
    views: ['system'], pat: 'route-policy <word>', seq: 'policy', hidden: true,
    help: '引用 Route-Policy（删除时由 undo 触发）',
    run: function (c) { return { out: '' }; },
    undo: function (c) {
      c.dev.cfg.routePolicies = (c.dev.cfg.routePolicies || []).filter(function (r) { return r.name !== c.args.word; });
      return { out: '' };
    }
  });
  R({
    views: ['system'], pat: 'route-policy <word> node <int>', seq: 'policy', hidden: true,
    help: '引用 Route-Policy 指定节点（删除时由 undo 触发）',
    run: function (c) { return { out: '' }; },
    undo: function (c) {
      var n = parseInt(c.args.int, 10);
      c.dev.cfg.routePolicies = (c.dev.cfg.routePolicies || []).filter(function (r) { return !(r.name === c.args.word && r.node === n); });
      return { out: '' };
    }
  });
  R({
    views: ['route-policy'], pat: 'if-match acl <acl>', seq: 'policy',
    help: '匹配 ACL（按路由目的地址）', run: function (c) { var r = rp(c); if (r) r.match.acl = c.args.acl; return { out: '' }; }
  });
  R({
    views: ['route-policy'], pat: 'if-match ip-prefix <word>', seq: 'policy',
    help: '匹配地址前缀列表', run: function (c) { var r = rp(c); if (r) r.match.ipPrefix = c.args.word; return { out: '' }; }
  });
  R({
    views: ['route-policy'], pat: 'if-match ip address prefix-list <word>', hidden: true, seq: 'policy',
    help: '匹配地址前缀列表（别名）', run: function (c) { var r = rp(c); if (r) r.match.ipPrefix = c.args.word; return { out: '' }; }
  });
  R({
    views: ['route-policy'], pat: 'apply cost <int>', seq: 'policy',
    help: '设置路由开销', run: function (c) { var r = rp(c); if (r) r.apply.cost = parseInt(c.args.int, 10); return { out: '' }; }
  });
  R({
    views: ['route-policy'], pat: 'apply preference <int>', seq: 'policy',
    help: '设置路由协议优先级', run: function (c) { var r = rp(c); if (r) r.apply.preference = parseInt(c.args.int, 10); return { out: '' }; }
  });
  R({
    views: ['route-policy'], pat: 'apply tag <int>', seq: 'policy',
    help: '设置路由标记（Tag）', run: function (c) { var r = rp(c); if (r) r.apply.tag = parseInt(c.args.int, 10); return { out: '' }; }
  });
  R({
    views: ['route-policy'], pat: 'apply ip-address next-hop <ip>', seq: 'policy',
    help: '设置下一跳', run: function (c) { var r = rp(c); if (r) r.apply.nextHop = c.args.ip; return { out: '' }; }
  });
  function rp(c) {
    c.dev.cfg.routePolicies = c.dev.cfg.routePolicies || [];
    var a = c.view.arg;
    if (a && typeof a === 'object') return c.dev.cfg.routePolicies.filter(function (r) { return r.name === a.name && r.node === a.node; })[0];
    return c.dev.cfg.routePolicies.filter(function (r) { return r.name === a; })[0];
  }
  R({
    views: ['system'], pat: 'ip ip-prefix <word> index <int> permit <ip> <int>', seq: 'policy',
    help: '创建地址前缀列表（允许）',
    run: function (c) {
      c.dev.cfg.ipPrefix = c.dev.cfg.ipPrefix || [];
      c.dev.cfg.ipPrefix.push({ name: c.args._0, index: parseInt(c.args._1, 10), action: 'permit', addr: c.args._2, len: parseInt(c.args._3, 10) });
      return { out: '' };
    }
  });
  R({
    views: ['system'], pat: 'ip ip-prefix <word> index <int> deny <ip> <int>', seq: 'policy',
    help: '创建地址前缀列表（拒绝）',
    run: function (c) {
      c.dev.cfg.ipPrefix = c.dev.cfg.ipPrefix || [];
      c.dev.cfg.ipPrefix.push({ name: c.args._0, index: parseInt(c.args._1, 10), action: 'deny', addr: c.args._2, len: parseInt(c.args._3, 10) });
      return { out: '' };
    }
  });
  R({
    views: ['system'], pat: 'ip as-path-acl <int> permit <text>', hidden: true, seq: 'policy',
    help: '创建 AS 路径过滤列表', run: function (c) { c.dev.cfg.asPath = c.dev.cfg.asPath || []; c.dev.cfg.asPath.push({ id: c.args.int, rule: c.args.text }); return { out: '' }; }
  });
  R({
    views: ['system'], pat: 'ip community-list <int> permit <text>', hidden: true, seq: 'policy',
    help: '创建团体属性列表', run: function () { return { out: '' }; }
  });
  R({
    views: ['system'], pat: 'ip local policy-based-route <word>', hidden: true, seq: 'pbr',
    help: '应用本地策略路由', run: function () { return { out: '' }; }
  });

})(window.H3C);
