/* 二层技术：VLAN / Trunk / Hybrid / STP / 链路聚合 / MAC / LLDP / 镜像 */
(function (H) {
  'use strict';
  var U = H.U, S = H.State, R = H.R, C = H.Cmd;

  /* 接口视图下应用（支持 interface range 批量） */
  function applyIfaces(c, fn) {
    var list = (c.sess.batchIfaces && c.sess.batchIfaces.length) ? c.sess.batchIfaces : [c.view.arg];
    list.forEach(function (n) {
      var f = c.dev.cfg.ifaces[n];
      if (f) fn(f, n, c.dev);
    });
    return { out: '' };
  }
  H.Cmd.applyIfaces = applyIfaces;

  function bridgeCheck(f) {
    return f && f.mode !== 'route';
  }
  function errL3() { return { out: 'Error: The interface is a Layer 3 interface, please use "port link-mode bridge" first.', err: true }; }

  /* ==================== VLAN ==================== */
  R({
    views: ['system'], pat: 'vlan <vid>', seq: 'l2',
    help: '创建 VLAN 并进入 VLAN 视图',
    run: function (c) {
      C.vlanEnsure(c.dev, c.args.vid);
      return { enter: { view: 'vlan', arg: Number(c.args.vid) } };
    }
  });
  R({
    views: ['system'], pat: 'vlan <vid> to <vid>', seq: 'l2',
    help: '批量创建 VLAN',
    run: function (c) {
      var a = parseInt(c.args._0, 10), b = parseInt(c.args._1, 10);
      if (a > b) { var t = a; a = b; b = t; }
      for (var i = a; i <= b; i++) C.vlanEnsure(c.dev, i);
      return { out: '' };
    },
    undo: function (c) {
      var a = parseInt(c.args._0, 10), b = parseInt(c.args._1, 10);
      if (a > b) { var t = a; a = b; b = t; }
      for (var i = a; i <= b; i++) delete c.dev.cfg.vlans[i];
      return { out: '' };
    }
  });
  R({
    views: ['system'], pat: 'undo vlan <vid>', hidden: true, seq: 'l2',
    help: '删除 VLAN',
    run: function (c) {
      var v = c.args.vid;
      if (!c.dev.cfg.vlans[v]) return { out: 'Error: The VLAN does not exist.', err: true };
      if (v == 1) return { out: 'Error: VLAN 1 is the default VLAN and cannot be deleted.', err: true };
      delete c.dev.cfg.vlans[v];
      delete c.dev.cfg.ifaces['VLAN' + v];
      return { out: '' };
    }
  });
  R({
    views: ['vlan'], pat: 'name <word>', seq: 'l2',
    help: '配置 VLAN 名称', run: function (c) { c.dev.cfg.vlans[c.view.arg].name = c.args.word; return { out: '' }; },
    undo: function (c) { c.dev.cfg.vlans[c.view.arg].name = 'VLAN ' + ('0000' + c.view.arg).slice(-4); return { out: '' }; }
  });
  R({
    views: ['vlan'], pat: 'description <text>', seq: 'l2',
    help: '配置 VLAN 描述', run: function (c) { c.dev.cfg.vlans[c.view.arg].desc = c.args.text; return { out: '' }; },
    undo: function (c) { c.dev.cfg.vlans[c.view.arg].desc = ''; return { out: '' }; }
  });
  R({
    views: ['vlan'], pat: 'port <text>', seq: 'l2',
    help: '将端口以 Access 方式加入本 VLAN',
    run: function (c) {
      var dev = c.dev, vid = Number(c.view.arg);
      var list = U.expandIfRange(dev, 'GE', c.args.text) || U.expandIfRange(dev, '', c.args.text);
      if (!list) return { out: 'Error: Wrong parameter found at \'^\' position.', err: true };
      list.forEach(function (n) {
        var f = dev.cfg.ifaces[n]; if (!f) return;
        f.mode = 'bridge'; f.linkType = 'access'; f.accessVlan = vid; f.pvid = vid;
      });
      return { out: '' };
    },
    undo: function (c) {
      var dev = c.dev;
      var list = U.expandIfRange(dev, 'GE', c.args.text) || U.expandIfRange(dev, '', c.args.text);
      (list || []).forEach(function (n) {
        var f = dev.cfg.ifaces[n]; if (!f) return;
        f.accessVlan = 1; f.pvid = 1;
      });
      return { out: '' };
    }
  });
  R({
    views: ['system'], pat: 'vlan <vid> name <word>', hidden: true, seq: 'l2',
    help: '创建 VLAN 并命名',
    run: function (c) { C.vlanEnsure(c.dev, c.args.vid).name = c.args.word; return { out: '' }; }
  });

  /* 端口链路类型 */
  R({
    views: ['interface'], pat: 'port link-type +access|trunk|hybrid', seq: 'l2',
    help: '配置端口链路类型',
    run: function (c) {
      var res = applyIfaces(c, function (f) {
        if (f.mode === 'route') f.mode = 'bridge';
        var t = c.args._0;
        f.linkType = t;
        if (t === 'access') { f.permitVlans = [f.accessVlan || 1]; f.pvid = f.accessVlan || 1; }
        if (t === 'trunk') { f.permitVlans = [1]; }
        if (t === 'hybrid') { f.permitVlans = [1]; f.untaggedVlans = [1]; }
      });
      return res;
    }
  });
  R({
    views: ['interface'], pat: 'port access vlan <vid>', seq: 'l2',
    help: '将 Access 端口加入 VLAN',
    run: function (c) {
      return applyIfaces(c, function (f) {
        f.mode = 'bridge'; f.linkType = 'access';
        f.accessVlan = Number(c.args.vid); f.pvid = Number(c.args.vid); f.permitVlans = [Number(c.args.vid)];
        C.vlanEnsure(c.dev, c.args.vid);
      });
    },
    undo: function (c) {
      return applyIfaces(c, function (f) { f.accessVlan = 1; f.pvid = 1; f.permitVlans = [1]; });
    }
  });
  R({
    views: ['interface'], pat: 'port trunk permit vlan <vlanlist>', seq: 'l2',
    help: '配置 Trunk 允许通过的 VLAN',
    run: function (c) {
      var list = U.parseVlanList(c.args.vlanlist);
      if (!list) return { out: 'Error: Wrong parameter found at \'^\' position.', err: true };
      return applyIfaces(c, function (f) {
        f.mode = 'bridge'; f.linkType = 'trunk'; f.permitVlans = list;
        list.forEach(function (v) { C.vlanEnsure(c.dev, v); });
      });
    }
  });
  R({
    views: ['interface'], pat: 'port trunk permit vlan all', seq: 'l2',
    help: '配置 Trunk 允许所有 VLAN',
    run: function (c) {
      return applyIfaces(c, function (f) { f.mode = 'bridge'; f.linkType = 'trunk'; f.permitVlans = U.parseVlanList('all'); });
    }
  });
  R({
    views: ['interface'], pat: 'port trunk pvid vlan <vid>', seq: 'l2',
    help: '配置 Trunk 端口的 PVID',
    run: function (c) { return applyIfaces(c, function (f) { f.pvid = Number(c.args.vid); }); },
    undo: function (c) { return applyIfaces(c, function (f) { f.pvid = 1; }); }
  });
  R({
    views: ['interface'], pat: 'port hybrid vlan <vlanlist> +tagged|untagged', seq: 'l2',
    help: '配置 Hybrid 端口 VLAN（tagged/untagged）',
    run: function (c) {
      var list = U.parseVlanList(c.args.vlanlist);
      if (!list) return { out: 'Error: Wrong parameter found at \'^\' position.', err: true };
      return applyIfaces(c, function (f) {
        f.mode = 'bridge'; f.linkType = 'hybrid';
        if (c.args._1 === 'untagged') {
          f.untaggedVlans = f.untaggedVlans.concat(list).filter(function (v, i, a) { return a.indexOf(v) === i; });
        }
        f.permitVlans = f.permitVlans.concat(list).filter(function (v, i, a) { return a.indexOf(v) === i; });
        list.forEach(function (v) { C.vlanEnsure(c.dev, v); });
      });
    }
  });
  R({
    views: ['interface'], pat: 'port hybrid pvid vlan <vid>', seq: 'l2',
    help: '配置 Hybrid 端口的 PVID',
    run: function (c) { return applyIfaces(c, function (f) { f.pvid = Number(c.args.vid); }); }
  });
  R({
    views: ['interface'], pat: 'port hybrid vlan <vlanlist> tagged', hidden: true, seq: 'l2',
    help: 'Hybrid 端口 tagged VLAN', run: function (c) { return { out: '' }; }
  });
  R({
    views: ['interface'], pat: 'qinq enable', seq: 'l2',
    help: '开启 QinQ 功能', run: function (c) { return applyIfaces(c, function (f) { f.qinq = true; }); },
    undo: function (c) { return applyIfaces(c, function (f) { f.qinq = false; }); }
  });
  R({
    views: ['interface'], pat: 'port-isolate enable', seq: 'l2',
    help: '开启端口隔离', run: function (c) { return applyIfaces(c, function (f) { f.portIsolate = true; }); },
    undo: function (c) { return applyIfaces(c, function (f) { f.portIsolate = false; }); }
  });
  R({
    views: ['interface'], pat: 'jumboframe enable', hidden: true, seq: 'l2',
    help: '允许巨帧通过', run: function (c) { return applyIfaces(c, function (f) { f.jumbo = true; }); }
  });

  /* ==================== STP ==================== */
  R({
    views: ['system'], pat: 'stp enable', seq: 'stp',
    help: '全局开启生成树协议',
    run: function (c) { c.dev.cfg.stp.enable = true; return { out: '' }; },
    undo: function (c) { c.dev.cfg.stp.enable = false; return { out: '' }; }
  });
  R({
    views: ['system'], pat: 'stp disable', seq: 'stp', hidden: true,
    help: '全局关闭生成树协议', run: function (c) { c.dev.cfg.stp.enable = false; return { out: '' }; }
  });
  R({
    views: ['system'], pat: 'stp mode +stp|rstp|mstp|pvst', seq: 'stp',
    help: '配置生成树工作模式',
    run: function (c) { c.dev.cfg.stp.mode = c.args._0; return { out: '' }; }
  });
  R({
    views: ['system'], pat: 'stp priority <int>', seq: 'stp',
    help: '配置设备优先级（越小越优先）',
    run: function (c) {
      var p = parseInt(c.args.int, 10);
      if (p % 4096 !== 0) return { out: 'Error: The priority must be a multiple of 4096.', err: true };
      c.dev.cfg.stp.priority = p;
      c.dev.cfg.stp.instances[0] = c.dev.cfg.stp.instances[0] || { vlans: [1] };
      c.dev.cfg.stp.instances[0].priority = p;
      return { out: '' };
    },
    undo: function (c) { c.dev.cfg.stp.priority = 32768; return { out: '' }; }
  });
  R({
    views: ['system'], pat: 'stp instance <int> priority <int>', seq: 'stp',
    help: '配置指定实例的优先级',
    run: function (c) {
      var i = c.args._1;
      c.dev.cfg.stp.instances[i] = c.dev.cfg.stp.instances[i] || { vlans: [] };
      c.dev.cfg.stp.instances[i].priority = parseInt(c.args._2, 10);
      return { out: '' };
    }
  });
  R({
    views: ['system'], pat: 'stp root primary', seq: 'stp',
    help: '配置为根桥', run: function (c) { c.dev.cfg.stp.priority = 0; c.dev.cfg.stp.instances[0].priority = 0; return { out: '' }; }
  });
  R({
    views: ['system'], pat: 'stp root secondary', seq: 'stp',
    help: '配置为备份根桥', run: function (c) { c.dev.cfg.stp.priority = 4096; c.dev.cfg.stp.instances[0].priority = 4096; return { out: '' }; }
  });
  R({
    views: ['system'], pat: 'stp timer hello <int>', seq: 'stp', hidden: true,
    help: '配置 Hello Time', run: function (c) { c.dev.cfg.stp.helloTime = parseInt(c.args.int, 10); return { out: '' }; }
  });
  R({
    views: ['system'], pat: 'stp timer forward-delay <int>', seq: 'stp', hidden: true,
    help: '配置 Forward Delay', run: function (c) { c.dev.cfg.stp.forwardTime = parseInt(c.args.int, 10); return { out: '' }; }
  });
  R({
    views: ['system'], pat: 'stp timer max-age <int>', seq: 'stp', hidden: true,
    help: '配置 Max Age', run: function (c) { c.dev.cfg.stp.maxAge = parseInt(c.args.int, 10); return { out: '' }; }
  });
  R({
    views: ['system'], pat: 'stp bpdu-protection', seq: 'stp',
    help: '开启 BPDU 保护', run: function (c) { c.dev.cfg.stp.bpduGuard = true; return { out: '' }; },
    undo: function (c) { c.dev.cfg.stp.bpduGuard = false; return { out: '' }; }
  });
  R({
    views: ['system'], pat: 'stp tc-protection', seq: 'stp', hidden: true,
    help: '开启 TC 保护', run: function (c) { c.dev.cfg.stp.tcGuard = true; return { out: '' }; }
  });
  R({
    views: ['system'], pat: 'stp pathcost-standard +dot1d-1998|dot1t|legacy', seq: 'stp', hidden: true,
    help: '配置路径开销标准', run: function (c) { c.dev.cfg.stp.costStandard = c.args._0; return { out: '' }; }
  });
  R({
    views: ['system'], pat: 'stp region-configuration', seq: 'stp',
    help: '进入 MST 域配置视图',
    run: function (c) { return { enter: { view: 'mst-region', arg: null } }; }
  });
  R({
    views: ['mst-region'], pat: 'region-name <word>', seq: 'stp',
    help: '配置 MST 域名', run: function (c) { c.dev.cfg.stp.regionName = c.args.word; return { out: '' }; }
  });
  R({
    views: ['mst-region'], pat: 'revision-level <int>', seq: 'stp',
    help: '配置 MST 修订级别', run: function (c) { c.dev.cfg.stp.revision = parseInt(c.args.int, 10); return { out: '' }; }
  });
  R({
    views: ['mst-region'], pat: 'instance <int> vlan <vlanlist>', seq: 'stp',
    help: '配置 VLAN 与 MSTI 映射',
    run: function (c) {
      var list = U.parseVlanList(c.args.vlanlist);
      if (!list) return { out: 'Error: Wrong parameter found at \'^\' position.', err: true };
      c.dev.cfg.stp.instances[c.args._0] = { vlans: list };
      return { out: '' };
    }
  });
  R({
    views: ['mst-region'], pat: 'active region-configuration', seq: 'stp',
    help: '激活 MST 域配置', run: function (c) { c.dev.cfg.stp.regionActive = true; return { out: '' }; }
  });
  R({
    views: ['mst-region'], pat: 'check region-configuration', seq: 'stp', hidden: true,
    help: '查看 MST 域配置', run: function (c) {
      var s = c.dev.cfg.stp;
      return { out: ' Region name      :' + (s.regionName || '(null)') + '\n Revision level   :' + (s.revision || 0) + '\n Instance   VLANs Mapped\n    0       1 to 4094' };
    }
  });
  /* 接口下的 STP */
  R({
    views: ['interface'], pat: 'stp enable', seq: 'stp',
    help: '端口开启 STP', run: function (c) { return applyIfaces(c, function (f) { f.stpEnable = true; }); },
    undo: function (c) { return applyIfaces(c, function (f) { f.stpEnable = false; }); }
  });
  R({
    views: ['interface'], pat: 'stp disable', seq: 'stp', hidden: true,
    help: '端口关闭 STP', run: function (c) { return applyIfaces(c, function (f) { f.stpEnable = false; }); }
  });
  R({
    views: ['interface'], pat: 'stp cost <int>', seq: 'stp',
    help: '配置端口路径开销', run: function (c) { return applyIfaces(c, function (f) { f.stpCost = parseInt(c.args.int, 10); }); },
    undo: function (c) { return applyIfaces(c, function (f) { f.stpCost = 'auto'; }); }
  });
  R({
    views: ['interface'], pat: 'stp port priority <int>', seq: 'stp',
    help: '配置端口优先级', run: function (c) { return applyIfaces(c, function (f) { f.stpPriority = parseInt(c.args.int, 10); }); }
  });
  R({
    views: ['interface'], pat: 'stp edged-port', seq: 'stp',
    help: '配置为边缘端口', run: function (c) { return applyIfaces(c, function (f) { f.stpEdge = true; }); },
    undo: function (c) { return applyIfaces(c, function (f) { f.stpEdge = false; }); }
  });
  R({
    views: ['interface'], pat: 'stp edged-port enable', hidden: true, seq: 'stp',
    help: '配置为边缘端口', run: function (c) { return applyIfaces(c, function (f) { f.stpEdge = true; }); }
  });
  R({
    views: ['interface'], pat: 'stp root-protection', seq: 'stp',
    help: '开启根保护', run: function (c) { return applyIfaces(c, function (f) { f.stpRootGuard = true; }); },
    undo: function (c) { return applyIfaces(c, function (f) { f.stpRootGuard = false; }); }
  });
  R({
    views: ['interface'], pat: 'stp loop-protection', seq: 'stp',
    help: '开启环路保护', run: function (c) { return applyIfaces(c, function (f) { f.stpLoopGuard = true; }); }
  });
  R({
    views: ['interface'], pat: 'stp bpdu-protection', seq: 'stp', hidden: true,
    help: '端口开启 BPDU 保护', run: function (c) { return applyIfaces(c, function (f) { f.stpBpduGuard = true; }); }
  });
  R({
    views: ['interface'], pat: 'stp point-to-point +auto|force-false|force-true', seq: 'stp', hidden: true,
    help: '配置链路类型', run: function (c) { return applyIfaces(c, function (f) { f.stpP2p = c.args._0; }); }
  });
  R({
    views: ['interface'], pat: 'stp no-agreement-check', seq: 'stp', hidden: true,
    help: '关闭 Agreement 检查', run: function () { return { out: '' }; }
  });

  /* ==================== 链路聚合 ==================== */
  R({
    views: ['system'], pat: 'link-aggregation mode dynamic', hidden: true, seq: 'lag',
    help: '配置全局聚合模式为动态', run: function (c) { c.dev.cfg.lagMode = 'dynamic'; return { out: '' }; }
  });
  R({
    views: ['interface'], pat: 'link-aggregation mode dynamic', seq: 'lag',
    help: '配置聚合组工作模式为动态(LACP)',
    run: function (c) {
      var n = c.view.arg;
      var m = n.match(/^(BAGG|RAGG)(\d+)$/);
      if (!m) return { out: 'Error: This command is only available on aggregation interfaces.', err: true };
      c.dev.cfg.lag[m[2]].mode = 'dynamic';
      return { out: '' };
    }
  });
  R({
    views: ['interface'], pat: 'port link-aggregation group <int>', seq: 'lag',
    help: '将端口加入聚合组',
    run: function (c) {
      var gid = c.args.int;
      if (!c.dev.cfg.lag[gid]) c.dev.cfg.lag[gid] = { id: Number(gid), mode: 'static', type: 'bridge', members: [], adminUp: true };
      var g = c.dev.cfg.lag[gid];
      return applyIfaces(c, function (f, n) {
        if (g.members.indexOf(n) < 0) g.members.push(n);
        f.aggregation = Number(gid);
        C.ensureIface(c.dev, 'BAGG' + gid, g.type === 'route' ? 'route' : 'bridge');
      });
    },
    undo: function (c) {
      var gid = c.args.int;
      var g = c.dev.cfg.lag[gid];
      return applyIfaces(c, function (f, n) {
        if (g) g.members = g.members.filter(function (x) { return x !== n; });
        f.aggregation = null;
      });
    }
  });
  R({
    views: ['interface'], pat: 'lacp period short', seq: 'lag',
    help: '配置 LACP 超时时间为短超时', run: function (c) { return applyIfaces(c, function (f) { f.lacpPeriod = 'short'; }); }
  });
  R({
    views: ['interface'], pat: 'lacp system-priority <int>', seq: 'lag', hidden: true,
    help: '配置 LACP 系统优先级', run: function (c) { c.dev.cfg.lacpPriority = parseInt(c.args.int, 10); return { out: '' }; }
  });
  R({
    views: ['system'], pat: 'lacp system-priority <int>', seq: 'lag',
    help: '配置 LACP 系统优先级', run: function (c) { c.dev.cfg.lacpPriority = parseInt(c.args.int, 10); return { out: '' }; }
  });
  R({
    views: ['interface'], pat: 'port lacp system-priority <int>', hidden: true, seq: 'lag',
    help: '配置端口 LACP 优先级', run: function (c) { return applyIfaces(c, function (f) { f.lacpPortPriority = parseInt(c.args.int, 10); }); }
  });
  R({
    views: ['interface'], pat: 'link-aggregation port-priority <int>', hidden: true, seq: 'lag',
    help: '配置聚合端口优先级', run: function (c) { return applyIfaces(c, function (f) { f.lacpPortPriority = parseInt(c.args.int, 10); }); }
  });

  /* ==================== MAC 地址表 ==================== */
  R({
    views: ['system'], pat: 'mac-address static <word> interface <ifname> vlan <vid>', seq: 'mac',
    help: '配置静态 MAC 地址表项',
    run: function (c) {
      var n = U.ifShort(c.args.ifname);
      if (!c.dev.cfg.ifaces[n]) return { out: 'Error: The interface does not exist.', err: true };
      c.dev.cfg.macStatic.push({ mac: c.args.word, iface: n, vlan: Number(c.args.vid) });
      C.vlanEnsure(c.dev, c.args.vid);
      if (!c.dev.rt.mac[c.args.vid]) c.dev.rt.mac[c.args.vid] = {};
      if (!c.dev.rt.mac[c.args.vid][n]) c.dev.rt.mac[c.args.vid][n] = {};
      c.dev.rt.mac[c.args.vid][n][U.macNorm(c.args.word)] = { age: 0, type: 'static' };
      return { out: '' };
    }
  });
  R({
    views: ['system'], pat: 'mac-address blackhole <word> vlan <vid>', seq: 'mac',
    help: '配置黑洞 MAC 地址表项',
    run: function (c) { c.dev.cfg.macBlackhole.push({ mac: c.args.word, vlan: Number(c.args.vid) }); return { out: '' }; }
  });
  R({
    views: ['system'], pat: 'mac-address timer aging <int>', seq: 'mac',
    help: '配置动态 MAC 老化时间（秒，0=不老化）',
    run: function (c) { c.dev.cfg.macAging = parseInt(c.args.int, 10); return { out: '' }; },
    undo: function (c) { c.dev.cfg.macAging = 300; return { out: '' }; }
  });
  R({
    views: ['system'], pat: 'mac-address aging-time <int>', hidden: true, seq: 'mac',
    help: '配置 MAC 老化时间', run: function (c) { c.dev.cfg.macAging = parseInt(c.args.int, 10); return { out: '' }; }
  });
  R({
    views: ['interface'], pat: 'mac-address max-mac-count <int>', seq: 'mac',
    help: '限制端口最大 MAC 学习数', run: function (c) { return applyIfaces(c, function (f) { f.maxMac = parseInt(c.args.int, 10); }); }
  });
  R({
    views: ['interface'], pat: 'mac-address learning disable', seq: 'mac',
    help: '关闭端口 MAC 地址学习', run: function (c) { return applyIfaces(c, function (f) { f.macLearn = false; }); }
  });
  R({ views: ['system'], pat: 'mac-address learning disable', hidden: true, seq: 'mac', help: '关闭全局 MAC 学习', run: function () { return { out: '' }; } });
  R({
    views: ['interface'], pat: 'mac-address dynamic-learning disable', hidden: true, seq: 'mac',
    help: '关闭动态 MAC 学习', run: function (c) { return applyIfaces(c, function (f) { f.macLearn = false; }); }
  });
  R({
    views: ['vlan'], pat: 'mac-address learning disable', hidden: true, seq: 'mac',
    help: '关闭 VLAN 内 MAC 学习', run: function () { return { out: '' }; }
  });

  /* ==================== LLDP ==================== */
  R({
    views: ['system'], pat: 'lldp global enable', seq: 'lldp',
    help: '全局开启 LLDP', run: function (c) { c.dev.cfg.lldpGlobal = true; return { out: '' }; },
    undo: function (c) { c.dev.cfg.lldpGlobal = false; return { out: '' }; }
  });
  R({ views: ['system'], pat: 'lldp enable', hidden: true, seq: 'lldp', help: '开启 LLDP', run: function (c) { c.dev.cfg.lldpGlobal = true; return { out: '' }; } , undo: function (c) { c.dev.cfg.lldpGlobal = false; return { out: '' }; } });
  R({
    views: ['interface'], pat: 'lldp enable', seq: 'lldp',
    help: '端口开启 LLDP', run: function (c) { return applyIfaces(c, function (f) { f.lldp = true; c.dev.cfg.lldpGlobal = true; }); },
    undo: function (c) { return applyIfaces(c, function (f) { f.lldp = false; }); }
  });
  R({
    views: ['interface'], pat: 'lldp disable', hidden: true, seq: 'lldp',
    help: '端口关闭 LLDP', run: function (c) { return applyIfaces(c, function (f) { f.lldp = false; }); }
  });
  R({
    views: ['system'], pat: 'lldp timer tx-interval <int>', hidden: true, seq: 'lldp',
    help: '配置 LLDP 发送间隔', run: function (c) { c.dev.cfg.lldpTx = parseInt(c.args.int, 10); return { out: '' }; }
  });

  /* ==================== 端口镜像 ==================== */
  R({
    views: ['system'], pat: 'mirroring-group <int> local', seq: 'mirror',
    help: '创建本地镜像组',
    run: function (c) {
      c.dev.cfg.mirroring.groups[c.args.int] = { id: Number(c.args.int), type: 'local', sources: [], monitor: null };
      return { out: '' };
    }
  });
  R({
    views: ['system'], pat: 'mirroring-group <int> mirroring-port <text> +inbound|outbound|both', seq: 'mirror',
    help: '配置镜像源端口',
    run: function (c) {
      var g = c.dev.cfg.mirroring.groups[c.args.int];
      if (!g) return { out: 'Error: The mirroring group does not exist.', err: true };
      var list = U.expandIfRange(c.dev, 'GE', c.args.text) || U.expandIfRange(c.dev, '', c.args.text) || [];
      list.forEach(function (n) {
        g.sources.push({ port: n, dir: c.args._3 });
        if (c.dev.cfg.ifaces[n]) c.dev.cfg.ifaces[n].mirror = c.args._3;
      });
      return { out: '' };
    }
  });
  R({
    views: ['system'], pat: 'mirroring-group <int> monitor-port <ifname>', seq: 'mirror',
    help: '配置镜像目的端口',
    run: function (c) {
      var g = c.dev.cfg.mirroring.groups[c.args.int];
      if (!g) return { out: 'Error: The mirroring group does not exist.', err: true };
      g.monitor = U.ifShort(c.args.ifname);
      return { out: '' };
    }
  });
  R({
    views: ['system'], pat: 'mirroring-group <int> remote-source', hidden: true, seq: 'mirror',
    help: '创建远程源镜像组',
    run: function (c) { c.dev.cfg.mirroring.groups[c.args.int] = { id: Number(c.args.int), type: 'remote-source', sources: [], monitor: null }; return { out: '' }; }
  });

  /* ==================== 端口组 ==================== */
  R({
    views: ['system'], pat: 'port-group manual <word>', hidden: true, seq: 'l2',
    help: '创建手工端口组',
    run: function (c) { c.dev.cfg.portGroups[c.args.word] = { members: [] }; return { enter: { view: 'port-group', arg: c.args.word } }; }
  });
  R({
    views: ['port-group'], pat: 'group-member <text>', hidden: true, seq: 'l2',
    help: '添加端口组成员',
    run: function (c) {
      var list = U.expandIfRange(c.dev, 'GE', c.args.text) || U.expandIfRange(c.dev, '', c.args.text) || [];
      c.dev.cfg.portGroups[c.view.arg].members = list;
      return { out: '' };
    }
  });

  /* ==================== 其它二层 ==================== */
  R({
    views: ['system'], pat: 'storm-constrain broadcast <num>', hidden: true, seq: 'l2',
    help: '全局广播风暴抑制', run: function (c) { c.dev.cfg.security.stormControl.broadcast = parseFloat(c.args.num); return { out: '' }; }
  });
  R({
    views: ['system'], pat: 'loopback-detection global enable vlan <vlanlist>', seq: 'l2', hidden: true,
    help: '全局开启环路检测', run: function (c) { c.dev.cfg.security.loopbackDetection.enable = true; return { out: '' }; }
  });
  R({
    views: ['system'], pat: 'vlan-vpn enable', hidden: true, seq: 'l2',
    help: '开启 VLAN VPN', run: function () { return { out: '' }; }
  });

})(window.H3C);
