/* 三层技术：静态路由 / ARP / DHCP / DNS / VRRP / IP 业务 */
(function (H) {
  'use strict';
  var U = H.U, S = H.State, R = H.R, C = H.Cmd, Sim = null;

  /* ==================== 静态路由 ==================== */
  R({
    views: ['system'], pat: 'ip route-static <ip> <mask> <ip>', seq: 'route',
    help: '配置静态路由（目的网段 掩码 下一跳）',
    run: function (c) {
      c.dev.cfg.staticRoutes.push({
        dest: c.args._0, mask: /^\d+$/.test(String(c.args._1)) ? U.lenMask(parseInt(c.args._1, 10)) : c.args._1,
        nexthop: c.args._2, oif: null, pref: 60, desc: '', state: 'active'
      });
      return { out: '' };
    },
    undo: function (c) {
      var mask = /^\d+$/.test(String(c.args._1)) ? U.lenMask(parseInt(c.args._1, 10)) : c.args._1;
      c.dev.cfg.staticRoutes = c.dev.cfg.staticRoutes.filter(function (r) {
        return !(r.dest === c.args._0 && r.mask === mask && r.nexthop === c.args._2);
      });
      if (c.args._0 === '0.0.0.0' && c.args._2 === c.dev.cfg.defaultRoute) c.dev.cfg.defaultRoute = null;
      return { out: '' };
    }
  });
  R({
    views: ['system'], pat: 'ip route-static <ip> <mask> <ip> preference <int>', seq: 'route',
    help: '配置静态路由并指定优先级',
    run: function (c) {
      c.dev.cfg.staticRoutes.push({
        dest: c.args._0, mask: /^\d+$/.test(String(c.args._1)) ? U.lenMask(parseInt(c.args._1, 10)) : c.args._1,
        nexthop: c.args._2, oif: null, pref: parseInt(c.args._3, 10), desc: '', state: 'active'
      });
      return { out: '' };
    }
  });
  R({
    views: ['system'], pat: 'ip route-static <ip> <mask> <ip> description <text>', seq: 'route',
    help: '配置静态路由并添加描述',
    run: function (c) {
      c.dev.cfg.staticRoutes.push({
        dest: c.args._0, mask: /^\d+$/.test(String(c.args._1)) ? U.lenMask(parseInt(c.args._1, 10)) : c.args._1,
        nexthop: c.args._2, oif: null, pref: 60, desc: c.args.text, state: 'active'
      });
      return { out: '' };
    }
  });
  R({
    views: ['system'], pat: 'ip route-static <ip> <mask> <ip> permanent', hidden: true, seq: 'route',
    help: '配置永久静态路由',
    run: function (c) {
      c.dev.cfg.staticRoutes.push({
        dest: c.args._0, mask: /^\d+$/.test(String(c.args._1)) ? U.lenMask(parseInt(c.args._1, 10)) : c.args._1,
        nexthop: c.args._2, oif: null, pref: 60, desc: '', permanent: true, state: 'active'
      });
      return { out: '' };
    }
  });
  R({
    views: ['system'], pat: 'ip route-static <ip> <mask> interface <ifname> <ip>', seq: 'route',
    help: '配置静态路由（出接口 + 下一跳）',
    run: function (c) {
      c.dev.cfg.staticRoutes.push({
        dest: c.args._0, mask: /^\d+$/.test(String(c.args._1)) ? U.lenMask(parseInt(c.args._1, 10)) : c.args._1,
        nexthop: c.args._3, oif: U.ifShort(c.args._2), pref: 60, desc: '', state: 'active'
      });
      return { out: '' };
    }
  });
  R({
    views: ['system'], pat: 'ip route-static <ip> <mask> interface <ifname>', seq: 'route',
    help: '配置静态路由（仅出接口）',
    run: function (c) {
      c.dev.cfg.staticRoutes.push({
        dest: c.args._0, mask: /^\d+$/.test(String(c.args._1)) ? U.lenMask(parseInt(c.args._1, 10)) : c.args._1,
        nexthop: null, oif: U.ifShort(c.args._2), pref: 60, desc: '', state: 'active'
      });
      return { out: '' };
    }
  });
  R({
    views: ['system'], pat: 'ip route-static 0.0.0.0 0 <ip>', hidden: true, seq: 'route',
    help: '配置默认路由',
    run: function (c) {
      c.dev.cfg.defaultRoute = c.args._0;
      c.dev.cfg.staticRoutes.push({ dest: '0.0.0.0', mask: '0.0.0.0', nexthop: c.args._0, oif: null, pref: 60, desc: '', state: 'active' });
      return { out: '' };
    }
  });
  R({
    views: ['system'], pat: 'ip route-static default-preference <int>', hidden: true, seq: 'route',
    help: '配置静态路由默认优先级', run: function () { return { out: '' }; }
  });
  /* PC / Server 的网关与静态路由（简化命令） */
  R({
    views: ['system'], pat: 'ip gateway <ip>', seq: 'route',
    help: '(主机)配置默认网关',
    run: function (c) { c.dev.cfg.defaultRoute = c.args.ip; return { out: '' }; }
  });
  R({
    views: ['system'], pat: 'ip default-gateway <ip>', hidden: true, seq: 'route',
    help: '(主机)配置默认网关', run: function (c) { c.dev.cfg.defaultRoute = c.args.ip; return { out: '' }; }
  });
  R({
    views: ['system'], pat: 'ip route <ip> <mask> <ip>', hidden: true, seq: 'route',
    help: '(主机)配置静态路由',
    run: function (c) {
      c.dev.cfg.staticRoutes.push({ dest: c.args._0, mask: c.args._1, nexthop: c.args._2, oif: null, pref: 60, state: 'active' });
      return { out: '' };
    }
  });

  /* ==================== ARP ==================== */
  R({
    views: ['system'], pat: 'arp static <ip> <word>', seq: 'l3',
    help: '配置静态 ARP 表项',
    run: function (c) {
      c.dev.cfg.arpStatic.push({ ip: c.args.ip, mac: c.args.word });
      c.dev.rt.arp[c.args.ip] = { mac: U.macNorm(c.args.word), iface: '-', vlan: 0, type: 'static', age: 0 };
      return { out: '' };
    }
  });
  R({
    views: ['system'], pat: 'arp timer aging <int>', hidden: true, seq: 'l3',
    help: '配置动态 ARP 老化时间', run: function (c) { c.dev.cfg.arpAging = parseInt(c.args.int, 10); return { out: '' }; }
  });
  R({
    views: ['system'], pat: 'arp max-learning-num <int>', hidden: true, seq: 'l3',
    help: '限制 ARP 表项数量', run: function (c) { c.dev.cfg.arpMax = parseInt(c.args.int, 10); return { out: '' }; }
  });
  R({
    views: ['interface'], pat: 'arp max-learning-num <int>', hidden: true, seq: 'l3',
    help: '限制端口 ARP 学习数', run: function () { return { out: '' }; }
  });
  R({
    views: ['vlan'], pat: 'arp detection enable', hidden: true, seq: 'l3',
    help: '开启 ARP 检测', run: function (c) { c.dev.cfg.security.arpDetection = true; return { out: '' }; }
  });
  R({
    views: ['system'], pat: 'arp detection enable', hidden: true, seq: 'l3',
    help: '开启全局 ARP 检测', run: function (c) { c.dev.cfg.security.arpDetection = true; return { out: '' }; }
  });
  R({
    views: ['system'], pat: 'reset arp all', seq: 'l3',
    help: '清除 ARP 表项', run: function (c) { c.dev.rt.arp = {}; return { out: '' }; }
  });

  /* ==================== DHCP ==================== */
  R({
    views: ['system'], pat: 'dhcp enable', seq: 'dhcp',
    help: '开启 DHCP 服务', run: function (c) { c.dev.cfg.dhcp.enable = true; c.dev.cfg.dhcp.serverDhcp = true; return { out: '' }; },
    undo: function (c) { c.dev.cfg.dhcp.enable = false; return { out: '' }; }
  });
  R({
    views: ['system'], pat: 'dhcp server ip-pool <word>', seq: 'dhcp',
    help: '创建 DHCP 地址池并进入地址池视图',
    run: function (c) {
      var p = c.dev.cfg.dhcp.pools.filter(function (x) { return x.name === c.args.word; })[0];
      if (!p) { p = { name: c.args.word, network: null, mask: null, gateway: null, dns: [], lease: 1, excluded: [], staticBind: [] }; c.dev.cfg.dhcp.pools.push(p); }
      c.dev.cfg.dhcp.enable = true;
      return { enter: { view: 'dhcp-pool', arg: c.args.word } };
    }
  });
  R({
    views: ['dhcp-pool'], pat: 'network <ip> mask <mask>', seq: 'dhcp',
    help: '配置地址池网段',
    run: function (c) {
      var p = pool(c); p.network = c.args._0; p.mask = /^\d+$/.test(String(c.args._1)) ? U.lenMask(parseInt(c.args._1, 10)) : c.args._1;
      return { out: '' };
    }
  });
  R({
    views: ['dhcp-pool'], pat: 'network <ip>', hidden: true, seq: 'dhcp',
    help: '配置地址池网段', run: function (c) { pool(c).network = c.args.ip; pool(c).mask = '255.255.255.0'; return { out: '' }; }
  });
  R({
    views: ['dhcp-pool'], pat: 'gateway-list <ip>', seq: 'dhcp',
    help: '配置网关地址', run: function (c) { pool(c).gateway = c.args.ip; return { out: '' }; }
  });
  R({
    views: ['dhcp-pool'], pat: 'dns-list <ip>', seq: 'dhcp',
    help: '配置 DNS 服务器地址', run: function (c) { pool(c).dns.push(c.args.ip); return { out: '' }; }
  });
  R({
    views: ['dhcp-pool'], pat: 'expired +day|hour|unlimited <int>', seq: 'dhcp',
    help: '配置租约时间', run: function (c) { pool(c).lease = c.args._1 + ' ' + c.args._2; return { out: '' }; }
  });
  R({
    views: ['dhcp-pool'], pat: 'forbidden-ip <ip>', hidden: true, seq: 'dhcp',
    help: '配置不参与分配的 IP', run: function (c) { pool(c).excluded.push(c.args.ip); return { out: '' }; }
  });
  R({
    views: ['dhcp-pool'], pat: 'static-bind ip-address <ip> mask <mask> hardware-address <word>', hidden: true, seq: 'dhcp',
    help: '配置静态绑定', run: function (c) { pool(c).staticBind.push({ ip: c.args._0, mac: c.args._2 }); return { out: '' }; }
  });
  R({
    views: ['interface'], pat: 'dhcp select server', seq: 'dhcp',
    help: '接口工作在 DHCP 服务器模式',
    run: function (c) { return C.applyIfaces(c, function (f) { f.dhcpMode = 'server'; }); }
  });
  R({
    views: ['interface'], pat: 'dhcp select relay', seq: 'dhcp',
    help: '接口工作在 DHCP 中继模式',
    run: function (c) { return C.applyIfaces(c, function (f) { f.dhcpMode = 'relay'; }); }
  });
  R({
    views: ['interface'], pat: 'dhcp relay server-address <ip>', seq: 'dhcp',
    help: '配置 DHCP 中继服务器地址',
    run: function (c) {
      c.dev.cfg.dhcp.relay = c.dev.cfg.dhcp.relay || [];
      c.dev.cfg.dhcp.relay.push(c.args.ip);
      return C.applyIfaces(c, function (f) { f.dhcpMode = 'relay'; });
    }
  });
  R({
    views: ['interface'], pat: 'dhcp server apply ip-pool <word>', hidden: true, seq: 'dhcp',
    help: '接口应用地址池', run: function (c) { return C.applyIfaces(c, function (f) { f.dhcpPool = c.args.word; }); }
  });
  R({
    views: ['system'], pat: 'dhcp snooping enable', seq: 'dhcp',
    help: '开启 DHCP Snooping', run: function (c) { c.dev.cfg.security.dhcpSnooping = true; return { out: '' }; }
  });
  R({
    views: ['interface'], pat: 'dhcp snooping trust', hidden: true, seq: 'dhcp',
    help: '配置 DHCP Snooping 信任端口', run: function (c) { return C.applyIfaces(c, function (f) { f.dhcpTrust = true; }); }
  });
  function pool(c) {
    return c.dev.cfg.dhcp.pools.filter(function (x) { return x.name === c.view.arg; })[0];
  }

  /* ==================== DNS ==================== */
  R({
    views: ['system'], pat: 'dns server <ip>', seq: 'dns',
    help: '配置 DNS 服务器', run: function (c) { c.dev.cfg.dns.servers.push(c.args.ip); return { out: '' }; },
    undo: function (c) { c.dev.cfg.dns.servers = []; return { out: '' }; }
  });
  R({
    views: ['system'], pat: 'dns proxy enable', seq: 'dns',
    help: '开启 DNS 代理', run: function (c) { c.dev.cfg.dns.proxy = true; return { out: '' }; }
  });
  R({
    views: ['system'], pat: 'dns domain <word>', hidden: true, seq: 'dns',
    help: '配置域名后缀', run: function (c) { c.dev.cfg.dns.domain = c.args.word; return { out: '' }; }
  });
  R({
    views: ['system'], pat: 'ip host <word> <ip>', seq: 'dns',
    help: '配置静态主机名解析',
    run: function (c) {
      c.dev.cfg.hosts = c.dev.cfg.hosts || {};
      c.dev.cfg.hosts[c.args.word] = c.args.ip;
      return { out: '' };
    }
  });

  /* ==================== VRRP ==================== */
  R({
    views: ['interface'], pat: 'vrrp vrid <int> virtual-ip <ip>', seq: 'vrrp',
    help: '配置 VRRP 备份组虚拟 IP',
    run: function (c) {
      return C.applyIfaces(c, function (f, n) {
        var v = f.vrrp.filter(function (x) { return x.vrid === Number(c.args._0); })[0];
        if (!v) { v = { vrid: Number(c.args._0), vip: c.args._1, priority: 100, preempt: true, delay: 0, track: [], state: 'Initialize' }; f.vrrp.push(v); }
        else v.vip = c.args._1;
        c.dev.cfg.vrrp[Number(c.args._0)] = { iface: n, vip: c.args._1 };
      });
    }
  });
  R({
    views: ['interface'], pat: 'vrrp vrid <int> priority <int>', seq: 'vrrp',
    help: '配置 VRRP 优先级（默认100，越大越优）',
    run: function (c) { return C.applyIfaces(c, function (f) { eachVrrp(f, c.args._0, function (v) { v.priority = parseInt(c.args._1, 10); }); }); }
  });
  R({
    views: ['interface'], pat: 'vrrp vrid <int> preempt-mode', seq: 'vrrp',
    help: '配置抢占模式', run: function (c) { return C.applyIfaces(c, function (f) { eachVrrp(f, c.args._0, function (v) { v.preempt = true; }); }); },
    undo: function (c) { return C.applyIfaces(c, function (f) { eachVrrp(f, c.args._0, function (v) { v.preempt = false; }); }); }
  });
  R({
    views: ['interface'], pat: 'vrrp vrid <int> preempt-mode delay <int>', hidden: true, seq: 'vrrp',
    help: '配置抢占延时', run: function (c) { return C.applyIfaces(c, function (f) { eachVrrp(f, c.args._0, function (v) { v.delay = parseInt(c.args._1, 10); }); }); }
  });
  R({
    views: ['interface'], pat: 'vrrp vrid <int> track <int> reduced <int>', seq: 'vrrp',
    help: '配置 VRRP 监视 Track 项',
    run: function (c) { return C.applyIfaces(c, function (f) { eachVrrp(f, c.args._0, function (v) { v.track.push({ id: c.args._1, reduced: c.args._2 }); }); }); }
  });
  R({
    views: ['interface'], pat: 'vrrp vrid <int> timer advertise <int>', hidden: true, seq: 'vrrp',
    help: '配置 VRRP 通告间隔', run: function (c) { return C.applyIfaces(c, function (f) { eachVrrp(f, c.args._1, function (v) { v.adv = parseInt(c.args._2, 10); }); }); }
  });
  R({
    views: ['system'], pat: 'track <int> interface <ifname>', seq: 'vrrp',
    help: '创建 Track 监视接口状态',
    run: function (c) {
      c.dev.cfg.track = c.dev.cfg.track || {};
      c.dev.cfg.track[c.args.int] = { type: 'interface', target: U.ifShort(c.args.ifname) };
      return { out: '' };
    }
  });
  function eachVrrp(f, vrid, fn) {
    f.vrrp.forEach(function (v) { if (String(v.vrid) === String(vrid)) fn(v); });
  }

  /* ==================== IP 业务 ==================== */
  R({
    views: ['system'], pat: 'ip ttl-expires enable', hidden: true, seq: 'l3',
    help: '开启 TTL 超时报文发送', run: function () { return { out: '' }; }
  });
  R({
    views: ['system'], pat: 'ip unreachables enable', hidden: true, seq: 'l3',
    help: '开启不可达报文发送', run: function () { return { out: '' }; }
  });
  R({
    views: ['system'], pat: 'ip forwarding-broadcast', hidden: true, seq: 'l3',
    help: '开启定向广播转发', run: function () { return { out: '' }; }
  });
  R({
    views: ['system'], pat: 'ip local pool <word> <ip> <ip>', hidden: true, seq: 'l3',
    help: '创建本地地址池', run: function () { return { out: '' }; }
  });

  /* ==================== IPv6 ==================== */
  R({
    views: ['system'], pat: 'ipv6', hidden: true, seq: 'ipv6',
    help: '全局开启 IPv6', run: function (c) { c.dev.cfg.ipv6 = true; return { out: '' }; }
  });
  R({
    views: ['interface'], pat: 'ipv6 address <word>', hidden: true, seq: 'ipv6',
    help: '配置 IPv6 地址 (格式 addr/prefix)',
    run: function (c) {
      var sp = U.ipv6Split(c.args.word);
      if (!sp) return { err: true, out: '错误的 IPv6 地址或前缀: ' + c.args.word };
      return C.applyIfaces(c, function (f) {
        if (f.mode !== 'route' && !/^(VLAN|Loop|RAGG|Tun)/.test(c.view.arg)) f.mode = 'route';
        f.ipv6 = f.ipv6 || [];
        if (!f.ipv6.some(function (x) { return x.addr === sp.addr && x.prefix === sp.prefix; })) f.ipv6.push(sp);
        c.dev.cfg.ipv6 = true;
      });
    },
    undo: function (c) {
      var sp = U.ipv6Split(c.args.word);
      if (!sp) return { out: '' };
      return C.applyIfaces(c, function (f) {
        f.ipv6 = (f.ipv6 || []).filter(function (x) { return !(x.addr === sp.addr && x.prefix === sp.prefix); });
      });
    }
  });
  R({
    views: ['system'], pat: 'ipv6 route-static <word> <word> <word>', hidden: true, seq: 'ipv6',
    help: '配置 IPv6 静态路由 (目的网段 前缀 下一跳)',
    run: function (c) {
      var sp = U.ipv6Split(c.args._0 + '/' + c.args._1);
      if (!sp) return { err: true, out: '错误的 IPv6 目的网段/前缀: ' + c.args._0 + '/' + c.args._1 };
      if (!U.isIpv6(c.args._2)) return { err: true, out: '错误的 IPv6 下一跳: ' + c.args._2 };
      var nh = U.ipv6NetOf(c.args._2, 128) || c.args._2;   // 归一化为全展开形式，与接口地址比对一致
      var ndest = U.ipv6NetOf(sp.addr, sp.prefix);         // 目的网段（主机位零化）：存储/去重/undo 三处必须一致
      c.dev.cfg.ipv6StaticRoutes = c.dev.cfg.ipv6StaticRoutes || [];
      var exists = c.dev.cfg.ipv6StaticRoutes.some(function (r) {
        return r.dest === ndest && r.prefix === sp.prefix && r.nexthop === nh;
      });
      if (!exists) c.dev.cfg.ipv6StaticRoutes.push({ dest: ndest, prefix: sp.prefix, nexthop: nh, oif: null, pref: 60, state: 'active' });
      return { out: '' };
    },
    undo: function (c) {
      var sp = U.ipv6Split(c.args._0 + '/' + c.args._1);
      if (!sp) return { out: '' };
      var nh = U.ipv6NetOf(c.args._2, 128) || c.args._2;
      var ndest = U.ipv6NetOf(sp.addr, sp.prefix);
      c.dev.cfg.ipv6StaticRoutes = (c.dev.cfg.ipv6StaticRoutes || []).filter(function (r) {
        return !(r.dest === ndest && r.prefix === sp.prefix && r.nexthop === nh);
      });
      return { out: '' };
    }
  });

})(window.H3C);
