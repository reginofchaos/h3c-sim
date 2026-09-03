/* QoS 服务质量 */
(function (H) {
  'use strict';
  var U = H.U, S = H.State, R = H.R, C = H.Cmd;

  R({
    views: ['system'], pat: 'qos', seq: 'qos',
    help: '全局开启 QoS', run: function (c) { c.dev.cfg.qos.enable = true; return { out: '' }; },
    undo: function (c) { c.dev.cfg.qos.enable = false; return { out: '' }; }
  });
  R({
    views: ['system'], pat: 'qos enable', hidden: true, seq: 'qos',
    help: '全局开启 QoS', run: function (c) { c.dev.cfg.qos.enable = true; return { out: '' }; }
  });

  /* ---- 接口信任模式与限速 ---- */
  R({
    views: ['interface'], pat: 'qos trust +dot1p|dscp|auto|none', seq: 'qos',
    help: '配置接口信任的报文优先级',
    run: function (c) { return C.applyIfaces(c, function (f) { f.qos.trust = c.args._0; }); },
    undo: function (c) { return C.applyIfaces(c, function (f) { f.qos.trust = null; }); }
  });
  R({
    views: ['interface'], pat: 'qos car inbound cir <int>', seq: 'qos',
    help: '配置入方向限速（承诺信息速率 kbps）',
    run: function (c) { return C.applyIfaces(c, function (f) { f.qos.carIn = parseInt(c.args.int, 10); }); },
    undo: function (c) { return C.applyIfaces(c, function (f) { f.qos.carIn = null; }); }
  });
  R({
    views: ['interface'], pat: 'qos car outbound cir <int>', seq: 'qos',
    help: '配置出方向限速（kbps）',
    run: function (c) { return C.applyIfaces(c, function (f) { f.qos.carOut = parseInt(c.args.int, 10); }); },
    undo: function (c) { return C.applyIfaces(c, function (f) { f.qos.carOut = null; }); }
  });
  R({
    views: ['interface'], pat: 'qos car inbound acl <acl> cir <int>', hidden: true, seq: 'qos',
    help: '基于 ACL 的入方向限速',
    run: function (c) { return C.applyIfaces(c, function (f) { f.qos.carInAcl = { acl: c.args.acl, cir: parseInt(c.args.int, 10) }; }); }
  });
  R({
    views: ['interface'], pat: 'qos lr outbound cir <int>', seq: 'qos',
    help: '配置接口出方向限速（kbps）',
    run: function (c) { return C.applyIfaces(c, function (f) { f.qos.lrOut = parseInt(c.args.int, 10); }); },
    undo: function (c) { return C.applyIfaces(c, function (f) { f.qos.lrOut = null; }); }
  });
  R({
    views: ['interface'], pat: 'qos gts cir <int>', seq: 'qos',
    help: '配置流量整形（kbps）',
    run: function (c) { return C.applyIfaces(c, function (f) { f.qos.gts = parseInt(c.args.int, 10); }); }
  });
  R({
    views: ['interface'], pat: 'qos priority', seq: 'qos', hidden: true,
    help: '配置接口信任报文优先级', run: function (c) { return C.applyIfaces(c, function (f) { f.qos.trust = 'auto'; }); }
  });
  R({
    views: ['interface'], pat: 'qos bandwidth <int>', hidden: true, seq: 'qos',
    help: '配置接口带宽', run: function (c) { return C.applyIfaces(c, function (f) { f.qos.bandwidth = parseInt(c.args.int, 10); }); }
  });
  R({
    views: ['interface'], pat: 'qos wrr <word>', hidden: true, seq: 'qos',
    help: '配置 WRR 队列', run: function (c) { return C.applyIfaces(c, function (f) { f.qos.wrr = c.args.word; }); }
  });
  R({
    views: ['interface'], pat: 'qos sp', seq: 'qos',
    help: '配置严格优先级队列调度', run: function (c) { return C.applyIfaces(c, function (f) { f.qos.queue = 'sp'; }); }
  });
  R({
    views: ['interface'], pat: 'qos wrr byte-count', hidden: true, seq: 'qos',
    help: '配置 WRR 按字节调度', run: function (c) { return C.applyIfaces(c, function (f) { f.qos.queue = 'wrr'; }); }
  });
  R({
    views: ['interface'], pat: 'qos queue <int> wrr weight <int>', hidden: true, seq: 'qos',
    help: '配置队列权重', run: function (c) { return { out: '' }; }
  });
  R({
    views: ['interface'], pat: 'qos apply policy <word> +inbound|outbound', seq: 'qos',
    help: '在接口上应用 QoS 策略',
    run: function (c) {
      if (!c.dev.cfg.qos.policy[c.args._0]) return { out: 'Error: The QoS policy does not exist.', err: true };
      return C.applyIfaces(c, function (f) { f.qos.policy = { name: c.args._0, dir: c.args._1 }; });
    },
    undo: function (c) { return C.applyIfaces(c, function (f) { f.qos.policy = null; }); }
  });

  /* ---- QoS 策略 ---- */
  R({
    views: ['system'], pat: 'qos policy <word>', seq: 'qos',
    help: '创建 QoS 策略并进入策略视图',
    run: function (c) {
      c.dev.cfg.qos.enable = true;
      c.dev.cfg.qos.policy[c.args.word] = { name: c.args.word, binds: [] };
      return { enter: { view: 'qos-policy', arg: c.args.word } };
    }
  });
  R({
    views: ['qos-policy'], pat: 'classifier <word> behavior <word>', seq: 'qos',
    help: '绑定类与行为',
    run: function (c) {
      var p = c.dev.cfg.qos.policy[c.view.arg];
      p.binds.push({ classifier: c.args._0, behavior: c.args._1 });
      return { out: '' };
    }
  });

  /* ---- 流分类 ---- */
  R({
    views: ['system'], pat: 'traffic classifier <word>', seq: 'qos',
    help: '创建流分类并进入流分类视图',
    run: function (c) {
      c.dev.cfg.qos.class[c.args.word] = { name: c.args.word, operator: 'and', matches: [] };
      return { enter: { view: 'traffic-classifier', arg: c.args.word } };
    }
  });
  R({
    views: ['system'], pat: 'traffic classifier <word> operator +and|or', seq: 'qos',
    help: '创建流分类并指定运算符',
    run: function (c) {
      c.dev.cfg.qos.class[c.args._0] = { name: c.args._0, operator: c.args._1, matches: [] };
      return { enter: { view: 'traffic-classifier', arg: c.args._0 } };
    }
  });
  R({
    views: ['traffic-classifier'], pat: 'if-match acl <acl>', seq: 'qos',
    help: '匹配 ACL',
    run: function (c) { cls(c).matches.push({ type: 'acl', value: parseInt(c.args.acl, 10) }); return { out: '' }; }
  });
  R({
    views: ['traffic-classifier'], pat: 'if-match any', seq: 'qos',
    help: '匹配所有报文', run: function (c) { cls(c).matches.push({ type: 'any' }); return { out: '' }; }
  });
  R({
    views: ['traffic-classifier'], pat: 'if-match dscp <int>', seq: 'qos',
    help: '匹配 DSCP 值', run: function (c) { cls(c).matches.push({ type: 'dscp', value: parseInt(c.args.int, 10) }); return { out: '' }; }
  });
  R({
    views: ['traffic-classifier'], pat: 'if-match ip-precedence <int>', hidden: true, seq: 'qos',
    help: '匹配 IP 优先级', run: function (c) { cls(c).matches.push({ type: 'precedence', value: parseInt(c.args.int, 10) }); return { out: '' }; }
  });
  R({
    views: ['traffic-classifier'], pat: 'if-match vlan <vid>', hidden: true, seq: 'qos',
    help: '匹配 VLAN', run: function (c) { cls(c).matches.push({ type: 'vlan', value: Number(c.args.vid) }); return { out: '' }; }
  });
  R({
    views: ['traffic-classifier'], pat: 'if-match source-mac <word>', hidden: true, seq: 'qos',
    help: '匹配源 MAC', run: function (c) { cls(c).matches.push({ type: 'srcmac', value: c.args.word }); return { out: '' }; }
  });
  function cls(c) { return c.dev.cfg.qos.class[c.view.arg]; }

  /* ---- 流行为 ---- */
  R({
    views: ['system'], pat: 'traffic behavior <word>', seq: 'qos',
    help: '创建流行为并进入流行为视图',
    run: function (c) {
      c.dev.cfg.qos.behavior[c.args.word] = { name: c.args.word, actions: [] };
      return { enter: { view: 'traffic-behavior', arg: c.args.word } };
    }
  });
  R({
    views: ['traffic-behavior'], pat: 'car cir <int>', seq: 'qos',
    help: '配置流量监管（kbps）',
    run: function (c) { beh(c).actions.push({ type: 'car', cir: parseInt(c.args.int, 10) }); return { out: '' }; }
  });
  R({
    views: ['traffic-behavior'], pat: 'queue af bandwidth <num>', seq: 'qos',
    help: '配置 AF 队列带宽保证（百分比）',
    run: function (c) { beh(c).actions.push({ type: 'af', bandwidth: parseFloat(c.args.num) }); return { out: '' }; }
  });
  R({
    views: ['traffic-behavior'], pat: 'queue ef bandwidth <num>', seq: 'qos',
    help: '配置 EF 队列带宽', run: function (c) { beh(c).actions.push({ type: 'ef', bandwidth: parseFloat(c.args.num) }); return { out: '' }; }
  });
  R({
    views: ['traffic-behavior'], pat: 'queue llq bandwidth <num>', hidden: true, seq: 'qos',
    help: '配置 LLQ 队列', run: function (c) { beh(c).actions.push({ type: 'llq', bandwidth: parseFloat(c.args.num) }); return { out: '' }; }
  });
  R({
    views: ['traffic-behavior'], pat: 'remark dscp <int>', seq: 'qos',
    help: '重标记 DSCP 值', run: function (c) { beh(c).actions.push({ type: 'remark-dscp', value: parseInt(c.args.int, 10) }); return { out: '' }; }
  });
  R({
    views: ['traffic-behavior'], pat: 'remark dot1p <int>', seq: 'qos',
    help: '重标记 802.1p 优先级', run: function (c) { beh(c).actions.push({ type: 'remark-dot1p', value: parseInt(c.args.int, 10) }); return { out: '' }; }
  });
  R({
    views: ['traffic-behavior'], pat: 'filter deny', seq: 'qos',
    help: '丢弃匹配的报文', run: function (c) { beh(c).actions.push({ type: 'filter-deny' }); return { out: '' }; }
  });
  R({
    views: ['traffic-behavior'], pat: 'filter permit', hidden: true, seq: 'qos',
    help: '允许匹配的报文', run: function (c) { beh(c).actions.push({ type: 'filter-permit' }); return { out: '' }; }
  });
  R({
    views: ['traffic-behavior'], pat: 'redirect interface <ifname>', seq: 'qos',
    help: '重定向到指定接口',
    run: function (c) { beh(c).actions.push({ type: 'redirect', iface: U.ifShort(c.args.ifname) }); return { out: '' }; }
  });
  R({
    views: ['traffic-behavior'], pat: 'accounting packet', hidden: true, seq: 'qos',
    help: '报文统计', run: function (c) { beh(c).actions.push({ type: 'accounting' }); return { out: '' }; }
  });
  R({
    views: ['traffic-behavior'], pat: 'mirror-to interface <ifname>', hidden: true, seq: 'qos',
    help: '流镜像', run: function (c) { beh(c).actions.push({ type: 'mirror', iface: U.ifShort(c.args.ifname) }); return { out: '' }; }
  });
  function beh(c) { return c.dev.cfg.qos.behavior[c.view.arg]; }

  /* ---- 优先级映射 ---- */
  R({
    views: ['system'], pat: 'qos map-table dot1p-lp', hidden: true, seq: 'qos',
    help: '进入 dot1p-lp 映射表视图', run: function () { return { out: '' }; }
  });
  R({
    views: ['system'], pat: 'qos map-table dot1p-dp', hidden: true, seq: 'qos',
    help: '进入 dot1p-dp 映射表视图', run: function () { return { out: '' }; }
  });
  R({
    views: ['system'], pat: 'qos map-table dscp-dscp', hidden: true, seq: 'qos',
    help: '进入 dscp-dscp 映射表视图', run: function () { return { out: '' }; }
  });

})(window.H3C);
