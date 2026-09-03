/* 生成 H3C 风格的配置文件 */
(function (H) {
  'use strict';
  var U = H.U, S = H.State;

  var Config = {};

  function L(a) { a.push(''); return a; }
  function sep(a) { a.push('#'); return a; }

  function vlanListText(v) { return U.vlanListText(v || []); }

  function ifaceCfg(dev, name, f, out) {
    var isL3 = /^(VLAN|Loop|Tun|RAGG)/.test(name) || f.mode === 'route';
    if (/^Loop/.test(name)) out.push('interface LoopBack' + name.slice(4));
    else if (/^VLAN/.test(name)) out.push('interface Vlan-interface' + name.slice(4));
    else if (/^BAGG/.test(name)) out.push('interface Bridge-Aggregation' + name.slice(4));
    else if (/^RAGG/.test(name)) out.push('interface Route-Aggregation' + name.slice(5));
    else if (/^Tun/.test(name)) out.push('interface Tunnel' + name.slice(3));
    else {
      var m = name.match(/^([A-Z]+)(.*)$/);
      var map = { GE: 'GigabitEthernet', FE: 'FastEthernet', XGE: 'Ten-GigabitEthernet', FGE: 'FortyGigE', Ser: 'Serial' };
      out.push('interface ' + (map[m[1]] || m[1]) + m[2]);
    }

    if (f.desc) out.push(' description ' + f.desc);
    if (isL3) {
      if (H.Sim && H.Sim.isSerialPort && H.Sim.isSerialPort(dev, name)) {
        out.push(' link-protocol ' + (f.linkProtocol || 'ppp'));
        if (f.pppAuth && f.pppAuth.mode && f.pppAuth.mode !== 'none') {
          out.push(' ppp authentication-mode ' + f.pppAuth.mode);
          if (f.pppAuth.user) out.push(' ppp chap user ' + f.pppAuth.user);
          if (f.pppAuth.password) out.push(' ppp chap password ' + f.pppAuth.password);
        }
      }
      if (f.ip) out.push(' ip address ' + f.ip.addr + ' ' + f.ip.mask);
      (f.ipSecondary || []).forEach(function (s) { out.push(' ip address ' + s.addr + ' ' + s.mask + ' sub'); });
      (f.ipv6 || []).forEach(function (a) { out.push(' ipv6 address ' + U.ipv6Compress(a.addr) + '/' + a.prefix); });
    } else {
      out.push(' port link-mode bridge');
      out.push(' port link-type ' + (f.linkType || 'access'));
      if (f.linkType === 'access') out.push(' port access vlan ' + (f.accessVlan || 1));
      if (f.linkType === 'trunk') {
        out.push(' port trunk permit vlan ' + vlanListText(f.permitVlans));
        if (f.pvid != 1) out.push(' port trunk pvid vlan ' + f.pvid);
      }
      if (f.linkType === 'hybrid') {
        out.push(' port hybrid vlan ' + vlanListText(f.untaggedVlans) + ' untagged');
        var tagged = (f.permitVlans || []).filter(function (v) { return (f.untaggedVlans || []).indexOf(v) < 0; });
        if (tagged.length) out.push(' port hybrid vlan ' + vlanListText(tagged) + ' tagged');
        if (f.pvid != 1) out.push(' port hybrid pvid vlan ' + f.pvid);
      }
      if (f.portIsolate) out.push(' port-isolate enable');
      if (f.stpEdge) out.push(' stp edged-port');
      if (f.stpCost !== 'auto' && f.stpCost != null) out.push(' stp cost ' + f.stpCost);
      if (f.stpRootGuard) out.push(' stp root-protection');
      if (!f.stpEnable) out.push(' stp disable');
      if (f.stormBroadcast != null) out.push(' broadcast-suppression ' + f.stormBroadcast);
      if (f.loopbackDetect) out.push(' loopback-detection enable');
      if (f.portSecurity.enable) {
        out.push(' port-security enable');
        out.push(' port-security max-mac-count ' + f.portSecurity.max);
        out.push(' port-security port-mode ' + f.portSecurity.mode);
        if (f.portSecurity.intrusion) out.push(' port-security intrusion-mode ' + f.portSecurity.intrusion);
        if (f.portSecurity.sticky) out.push(' port-security mac-address sticky');
      }
      if (f.dot1x.enable) { out.push(' dot1x'); out.push(' dot1x port-method ' + (f.dot1x.method || 'macbased')); }
      if (f.macAuth) out.push(' mac-authentication');
      if (f.maxMac != null) out.push(' mac-address max-mac-count ' + f.maxMac);
      if (f.maxMac === 0 || (f.macLearn === false)) out.push(' mac-address learning disable');
      if (f.mirror) { /* 镜像在全局组中配置 */ }
      if (f.qinq) out.push(' qinq enable');
      if (f.aggregation != null) {
        var g = dev.cfg.lag[f.aggregation];
        out.push(' port link-aggregation group ' + f.aggregation + (g && g.mode === 'dynamic' ? '' : ''));
      }
      if (f.sflow) out.push(' sflow enable');
    }
    if (f.aclIn) out.push(' packet-filter ' + f.aclIn + ' inbound');
    if (f.aclOut) out.push(' packet-filter ' + f.aclOut + ' outbound');
    if (f.pbr) out.push(' ip policy-based-route ' + f.pbr);
    if (f.vrrp && f.vrrp.length) {
      f.vrrp.forEach(function (v) {
        out.push(' vrrp vrid ' + v.vrid + ' virtual-ip ' + v.vip);
        if (v.priority != 100) out.push(' vrrp vrid ' + v.vrid + ' priority ' + v.priority);
        if (v.preempt === false) out.push(' undo vrrp vrid ' + v.vrid + ' preempt-mode');
        if (v.delay) out.push(' vrrp vrid ' + v.vrid + ' preempt-mode delay ' + v.delay);
        (v.track || []).forEach(function (t) { out.push(' vrrp vrid ' + v.vrid + ' track ' + t.id + ' reduced ' + t.reduced); });
      });
    }
    if (f.qos.trust) out.push(' qos trust ' + f.qos.trust);
    if (f.qos.carIn != null) out.push(' qos car inbound cir ' + f.qos.carIn);
    if (f.qos.carOut != null) out.push(' qos car outbound cir ' + f.qos.carOut);
    if (f.qos.lrOut != null) out.push(' qos lr outbound cir ' + f.qos.lrOut);
    if (f.qos.gts != null) out.push(' qos gts cir ' + f.qos.gts);
    if (f.qos.policy) out.push(' qos apply policy ' + f.qos.policy.name + ' ' + f.qos.policy.dir);
    if (f.ospfCost != null) out.push(' ospf cost ' + f.ospfCost);
    if (f.ospfNetworkType) out.push(' ospf network-type ' + f.ospfNetworkType);
    if (f.ospfDrPriority != null) out.push(' ospf dr-priority ' + f.ospfDrPriority);
    if (f.isisEnable != null) out.push(' isis enable ' + f.isisEnable + (f.isisLevel && f.isisLevel !== 'level-1-2' ? '\n isis circuit-level ' + f.isisLevel : ''));
    if (f.isisCost != null) out.push(' isis cost ' + f.isisCost);
    if (f.natOutbound) {
      var no = f.natOutbound;
      if (no.group == null) out.push(' nat outbound ' + no.acl);
      else if (no.noPat) out.push(' nat outbound ' + no.acl + ' address-group ' + no.group + ' no-pat');
      else out.push(' nat outbound ' + no.acl + ' address-group ' + no.group);
    }
    if (f.natServer && f.natServer.length) {
      f.natServer.forEach(function (s) {
        out.push(' nat server protocol ' + s.proto + ' global ' + s.gip + ' ' + s.gport + ' inside ' + s.lip + ' ' + s.lport);
      });
    }
    if (f.dhcpMode) out.push(' dhcp select ' + f.dhcpMode);
    if (f.dhcpMode === 'relay') (dev.cfg.dhcp.relay || []).forEach(function (x) { out.push(' dhcp relay server-address ' + x); });
    if (f.dhcpPool) out.push(' dhcp server apply ip-pool ' + f.dhcpPool);
    if (f.speed !== 'auto') out.push(' speed ' + f.speed);
    if (f.duplex !== 'auto') out.push(' duplex ' + f.duplex);
    if (!f.adminUp) out.push(' shutdown');
    sep(out);
    return out;
  }

  function ifaceIsConfigured(f, dev, name) {
    if (!f) return false;
    if (/^Loop|^VLAN|^Tun/.test(name) && f.ip) return true;
    if (f.desc) return true;
    if (!f.adminUp) return true;
    if (f.mode === 'route') return true;
    if (f.ip) return true;
    if (f.linkType !== 'access') return true;
    if (f.accessVlan !== 1) return true;
    if (f.pvid !== 1) return true;
    if (f.permitVlans && (f.permitVlans.length !== 1 || f.permitVlans[0] !== 1)) return true;
    if (f.untaggedVlans && f.untaggedVlans.length > 1) return true;
    if (f.aggregation != null) return true;
    if (f.aclIn || f.aclOut) return true;
    if (f.natOutbound) return true;
    if (f.natServer && f.natServer.length) return true;
    if (f.portSecurity.enable || f.dot1x.enable || f.macAuth) return true;
    if (f.stpEdge || f.stpRootGuard || !f.stpEnable) return true;
    if (f.stpCost !== 'auto' && f.stpCost != null) return true;
    if (f.vrrp && f.vrrp.length) return true;
    if (f.qos.trust || f.qos.carIn != null || f.qos.carOut != null || f.qos.lrOut != null || f.qos.gts != null || f.qos.policy) return true;
    if (f.ospfCost != null || f.ospfNetworkType || f.ospfDrPriority != null) return true;
    if (f.isisEnable != null || f.isisCost != null || (f.isisLevel && f.isisLevel !== 'level-1-2')) return true;
    if (f.dhcpMode || f.dhcpPool) return true;
    if (f.speed !== 'auto' || f.duplex !== 'auto') return true;
    if (f.stormBroadcast != null || f.loopbackDetect || f.portIsolate || f.qinq) return true;
    if (f.maxMac != null || f.macLearn === false) return true;
    if (f.pbr) return true;
    return false;
  }

  Config.render = function (dev) {
    var o = [];
    var cfg = dev.cfg;
    sep(o);
    o.push(' sysname ' + cfg.hostname);
    if (cfg.clock) { o.push(' clock datetime ' + cfg.clock); }
    if (cfg.timezone && cfg.timezone !== 'UTC') o.push(' clock timezone ' + cfg.timezone);
    if (cfg.domain) o.push(' domain ' + cfg.domain);
    if (cfg.superPassword) o.push(' super password level 3 simple ' + cfg.superPassword);
    if (cfg.passwordControl) o.push(' password-control enable');
    sep(o);

    /* VLAN */
    Object.keys(cfg.vlans).map(Number).sort(function (a, b) { return a - b; }).forEach(function (v) {
      var vv = cfg.vlans[v];
      if (v === 1 && !vv.desc && (vv.name || '') === 'VLAN 0001') return;
      o.push('vlan ' + v);
      if (vv.name && vv.name !== 'VLAN ' + ('0000' + v).slice(-4)) o.push(' name ' + vv.name);
      if (vv.desc) o.push(' description ' + vv.desc);
      sep(o);
    });

    /* STP */
    if (!cfg.stp.enable) o.push(' undo stp enable');
    if (cfg.stp.enable) {
      if (cfg.stp.mode !== 'mstp') o.push(' stp mode ' + cfg.stp.mode);
      if (cfg.stp.priority !== 32768) o.push(' stp priority ' + cfg.stp.priority);
      if (cfg.stp.bpduGuard) o.push(' stp bpdu-protection');
      Object.keys(cfg.stp.instances || {}).forEach(function (i) {
        if (i !== '0') o.push(' stp instance ' + i + ' priority ' + cfg.stp.instances[i].priority);
      });
      if (cfg.stp.regionName || cfg.stp.revision) {
        o.push(' stp region-configuration');
        if (cfg.stp.regionName) o.push('  region-name ' + cfg.stp.regionName);
        if (cfg.stp.revision) o.push('  revision-level ' + cfg.stp.revision);
        Object.keys(cfg.stp.instances || {}).forEach(function (i) {
          if (i !== '0' && cfg.stp.instances[i].vlans && cfg.stp.instances[i].vlans.length) o.push('  instance ' + i + ' vlan ' + vlanListText(cfg.stp.instances[i].vlans));
        });
        o.push('  active region-configuration');
      }
      sep(o);
    }

    /* 聚合 */
    Object.keys(cfg.lag || {}).forEach(function (k) {
      var g = cfg.lag[k];
      var gf = cfg.ifaces['BAGG' + k] || cfg.ifaces['RAGG' + k];
      var nm = g.type === 'route' ? 'Route-Aggregation' : 'Bridge-Aggregation';
      o.push('interface ' + nm + k);
      if (g.mode === 'dynamic') o.push(' link-aggregation mode dynamic');
      if (gf && ifaceIsConfigured(gf, dev, 'BAGG' + k)) {
        var sub = [];
        renderIfaceBody(dev, (g.type === 'route' ? 'RAGG' : 'BAGG') + k, gf, sub);
        sub.forEach(function (x) { o.push(x); });
      }
      sep(o);
    });

    /* 三层接口 */
    var vlanIfs = Object.keys(cfg.ifaces).filter(function (n) { return /^VLAN|^Loop|^Tun/.test(n); });
    vlanIfs.sort();
    vlanIfs.forEach(function (n) {
      var f = cfg.ifaces[n];
      if (!ifaceIsConfigured(f, dev, n)) return;
      ifaceCfg(dev, n, f, o);
    });

    /* 二层物理口：
       - 有非默认配置的端口完整输出；
       - 默认配置但已建立物理链路的端口，输出一个空 interface 块 + 一行注释，
         让用户在 dis cu 里看到"这个端口在用"，与真实设备行为更接近（H3C 默认也不显示）。 */
    var linkedNames = {};
    (S.linksOf(dev.id) || []).forEach(function (l) {
      var pn = (l.a && l.a.dev === dev.id) ? l.a.port : (l.b && l.b.dev === dev.id) ? l.b.port : null;
      if (pn) linkedNames[pn] = 1;
    });
    dev.ports.forEach(function (p) {
      var f = cfg.ifaces[p.name];
      if (!f) return;
      if (ifaceIsConfigured(f, dev, p.name)) { ifaceCfg(dev, p.name, f, o); return; }
      if (linkedNames[p.name]) {
        // 仅占位，让用户能看见该端口当前已被链路占用
        o.push('interface ' + p.full);
        o.push('# (default config; linked)');
        o.push('');
      }
    });

    /* 静态路由 */
    (cfg.staticRoutes || []).forEach(function (r) {
      var s = ' ip route-static ' + r.dest + ' ' + r.mask + ' ' + (r.oif ? 'interface ' + fullIf(r.oif) + ' ' : '') + (r.nexthop || '');
      if (r.pref !== 60) s += ' preference ' + r.pref;
      if (r.desc) s += ' description ' + r.desc;
      o.push(s);
    });
    if (cfg.defaultRoute && !(cfg.staticRoutes || []).some(function (r) { return r.dest === '0.0.0.0'; })) {
      o.push(' ip route-static 0.0.0.0 0 ' + cfg.defaultRoute);
    }
    if ((cfg.staticRoutes || []).length || cfg.defaultRoute) sep(o);

    /* IPv6 静态路由 */
    (cfg.ipv6StaticRoutes || []).forEach(function (r) {
      o.push(' ipv6 route-static ' + U.ipv6Compress(r.dest) + ' ' + r.prefix + ' ' + U.ipv6Compress(r.nexthop));
    });
    if (cfg.ipv6DefaultRoute) o.push(' ipv6 route-static :: 0 ' + U.ipv6Compress(cfg.ipv6DefaultRoute));
    if ((cfg.ipv6StaticRoutes || []).length || cfg.ipv6DefaultRoute) sep(o);

    /* RIP */
    if (cfg.rip && cfg.rip.enable) {
      o.push('rip ' + cfg.rip.process);
      if (cfg.rip.version !== 2) o.push(' version ' + cfg.rip.version);
      if (!cfg.rip.summary) o.push(' undo summary');
      (cfg.rip.networks || []).forEach(function (n) { o.push(' network ' + n.addr + (n.mask ? ' ' + n.mask : '')); });
      (cfg.rip.passive || []).forEach(function (n) { o.push(' silent-interface ' + fullIf(n)); });
      (cfg.rip.importRoutes || []).forEach(function (x) { o.push(' import-route ' + (typeof x === 'string' ? x : x.proto + (x.policy ? ' route-policy ' + x.policy : ''))); });
      if (cfg.rip.defaultOrig) o.push(' default-route originate');
      sep(o);
    }

    /* OSPF */
    if (cfg.ospf && cfg.ospf.enable) {
      o.push('ospf ' + cfg.ospf.process + (cfg.ospf.routerId ? ' router-id ' + cfg.ospf.routerId : ''));
      if (cfg.ospf.bandwidthRef !== 100) o.push(' bandwidth-reference ' + cfg.ospf.bandwidthRef);
      (cfg.ospf.silent || []).forEach(function (n) { o.push(' silent-interface ' + fullIf(n)); });
      (cfg.ospf.importRoutes || []).forEach(function (x) { o.push(' import-route ' + (typeof x === 'string' ? x : x.proto + (x.policy ? ' route-policy ' + x.policy : ''))); });
      if (cfg.ospf.defaultRouteAdvertise) o.push(' default-route-advertise' + (cfg.ospf.defaultRouteAdvertise === 'always' ? ' always' : ''));
      var byArea = {};
      (cfg.ospf.networks || []).forEach(function (n) {
        var a = n.area || '0.0.0.0';
        (byArea[a] = byArea[a] || []).push(n);
      });
      Object.keys(byArea).forEach(function (a) {
        o.push(' area ' + a);
        var ar = cfg.ospf.areas[a] || {};
        if (ar.type && ar.type !== 'normal') o.push('  ' + ar.type);
        byArea[a].forEach(function (n) { o.push('  network ' + n.addr + ' ' + U.wildcard(U.maskLen(n.mask))); });
      });
      sep(o);
    }

    /* BGP */
    if (cfg.bgp && cfg.bgp.enable) {
      o.push('bgp ' + cfg.bgp.as);
      if (cfg.bgp.routerId) o.push(' router-id ' + cfg.bgp.routerId);
      (cfg.bgp.peers || []).forEach(function (p) {
        o.push(' peer ' + p.addr + ' as-number ' + p.as);
        if (p.connectIf) o.push(' peer ' + p.addr + ' connect-interface ' + fullIf(p.connectIf));
        if (p.nextHopLocal) o.push(' peer ' + p.addr + ' next-hop-local');
      });
      o.push(' address-family ipv4 unicast');
      (cfg.bgp.networks || []).forEach(function (n) { o.push('  network ' + n.addr + ' ' + n.mask); });
      (cfg.bgp.importRoutes || []).forEach(function (x) { o.push('  import-route ' + (typeof x === 'string' ? x : x.proto + (x.policy ? ' route-policy ' + x.policy : ''))); });
      sep(o);
    }

    /* IS-IS */
    if (cfg.isis && cfg.isis.enable) {
      o.push('isis ' + cfg.isis.process + (cfg.isis.level && cfg.isis.level !== 'level-1-2' ? ' is-level ' + cfg.isis.level : ''));
      if (cfg.isis.net) o.push(' network-entity ' + cfg.isis.net);
      (cfg.isis.networks || []).forEach(function (n) { o.push(' network ' + n.addr + (n.mask ? ' ' + n.mask : '')); });
      (cfg.isis.importRoutes || []).forEach(function (x) { o.push(' import-route ' + (typeof x === 'string' ? x : x.proto + (x.policy ? ' route-policy ' + x.policy : ''))); });
      if (cfg.isis.summary) o.push(' summary ' + cfg.isis.summary.addr + ' ' + cfg.isis.summary.mask);
      sep(o);
    }

    /* 策略路由 */
    (cfg.policyRoutes || []).forEach(function (p) {
      o.push('policy-based-route ' + p.name + ' ' + p.action + ' node ' + p.node);
      if (p.acl != null) o.push(' if-match acl ' + p.acl);
      if (p.nextHop) o.push(' apply next-hop ' + p.nextHop);
      if (p.oif) o.push(' apply output-interface ' + fullIf(p.oif));
      sep(o);
    });

    /* 路由策略 / 地址前缀列表 */
    (function () {
      var rps = cfg.routePolicies || [];
      if (rps.length) {
        var names = {};
        rps.forEach(function (r) { names[r.name] = true; });
        Object.keys(names).forEach(function (nm) {
          rps.filter(function (r) { return r.name === nm; }).sort(function (a, b) { return a.node - b.node; }).forEach(function (r) {
            o.push('route-policy ' + nm + ' ' + r.action + ' node ' + r.node);
            if (r.match && r.match.acl != null) o.push(' if-match acl ' + r.match.acl);
            if (r.match && r.match.ipPrefix) o.push(' if-match ip-prefix ' + r.match.ipPrefix);
            if (r.apply && r.apply.cost != null) o.push(' apply cost ' + r.apply.cost);
            if (r.apply && r.apply.preference != null) o.push(' apply preference ' + r.apply.preference);
            if (r.apply && r.apply.tag != null) o.push(' apply tag ' + r.apply.tag);
            if (r.apply && r.apply.nextHop) o.push(' apply ip-address next-hop ' + r.apply.nextHop);
          });
          sep(o);
        });
      }
      (cfg.ipPrefix || []).forEach(function (p) {
        o.push('ip ip-prefix ' + p.name + ' index ' + p.index + ' ' + p.action + ' ' + p.addr + ' ' + p.len);
      });
      if ((cfg.ipPrefix || []).length) sep(o);
    })();

    /* ACL */
    Object.keys(cfg.acl || {}).map(Number).sort(function (a, b) { return a - b; }).forEach(function (id) {
      var a = cfg.acl[id];
      o.push('acl ' + (a.type === 'advanced' ? 'advanced ' : a.type === 'mac' ? 'mac ' : 'basic ') + id);
      (a.rules || []).forEach(function (r) {
        var ln = ' rule ' + r.id + ' ' + r.action;
        if (r.proto) ln += ' ' + r.proto;
        if (r.srcAddr != null) ln += ' source ' + r.srcAddr + ' ' + (r.srcWild || '0.0.0.0');
        if (r.dstAddr != null) ln += ' destination ' + r.dstAddr + ' ' + (r.dstWild || '0.0.0.0');
        if (r.dstPort != null) ln += ' destination-port ' + r.dstOp + ' ' + r.dstPort + (r.dstPort2 != null ? ' ' + r.dstPort2 : '');
        if (r.srcMac) ln += ' source-mac ' + r.srcMac;
        o.push(ln);
      });
      sep(o);
    });

    /* NAT 地址转换 */
    if (cfg.natGroups && Object.keys(cfg.natGroups).length) {
      Object.keys(cfg.natGroups).forEach(function (id) {
        var g = cfg.natGroups[id];
        o.push('nat address-group ' + id + ' ' + g.start + ' ' + g.end);
      });
      sep(o);
    }
    if (cfg.natStatic && cfg.natStatic.length) {
      cfg.natStatic.forEach(function (s) { o.push('nat static ' + s.local + ' ' + s.global); });
      sep(o);
    }

    /* QoS */
    if (cfg.qos) {
      Object.keys(cfg.qos.class || {}).forEach(function (k) {
        var x = cfg.qos.class[k];
        o.push('traffic classifier ' + k + ' operator ' + x.operator);
        x.matches.forEach(function (m) { o.push(' if-match ' + m.type + (m.value != null ? ' ' + m.value : '')); });
        sep(o);
      });
      Object.keys(cfg.qos.behavior || {}).forEach(function (k) {
        var x = cfg.qos.behavior[k];
        o.push('traffic behavior ' + k);
        x.actions.forEach(function (a) {
          o.push(' ' + a.type.replace('remark-dscp', 'remark dscp').replace('remark-dot1p', 'remark dot1p').replace('filter-deny', 'filter deny').replace('filter-permit', 'filter permit') +
            (a.value != null ? ' ' + a.value : a.cir != null ? ' ' + a.cir : a.bandwidth != null ? ' ' + a.bandwidth : a.iface ? ' ' + fullIf(a.iface) : ''));
        });
        sep(o);
      });
      Object.keys(cfg.qos.policy || {}).forEach(function (k) {
        var x = cfg.qos.policy[k];
        o.push('qos policy ' + k);
        x.binds.forEach(function (b) { o.push(' classifier ' + b.classifier + ' behavior ' + b.behavior); });
        sep(o);
      });
    }

    /* 镜像 */
    Object.keys(cfg.mirroring.groups || {}).forEach(function (k) {
      var g = cfg.mirroring.groups[k];
      o.push('mirroring-group ' + k + ' local');
      if (g.monitor) o.push('mirroring-group ' + k + ' monitor-port ' + fullIf(g.monitor));
      g.sources.forEach(function (s) { o.push('mirroring-group ' + k + ' mirroring-port ' + fullIf(s.port) + ' ' + s.dir); });
      sep(o);
    });

    /* DHCP */
    if (cfg.dhcp && cfg.dhcp.enable) {
      o.push(' dhcp enable');
      (cfg.dhcp.pools || []).forEach(function (p) {
        o.push('dhcp server ip-pool ' + p.name);
        if (p.network) o.push(' network ' + p.network + ' mask ' + (p.mask || '255.255.255.0'));
        if (p.gateway) o.push(' gateway-list ' + p.gateway);
        (p.dns || []).forEach(function (d) { o.push(' dns-list ' + d); });
        if (p.lease) o.push(' expired ' + p.lease);
        sep(o);
      });
      sep(o);
    }
    if (cfg.dns && (cfg.dns.servers || []).length) {
      cfg.dns.servers.forEach(function (d) { o.push(' dns server ' + d); });
      sep(o);
    }
    if (cfg.hosts) Object.keys(cfg.hosts).forEach(function (h) { o.push(' ip host ' + h + ' ' + cfg.hosts[h]); });

    /* 用户与管理 */
    (cfg.users || []).forEach(function (u) {
      o.push('local-user ' + u.name + ' class manage');
      if (u.password) o.push(' password simple ' + u.password);
      o.push(' service-type ' + ((u.services || []).join(' ') || 'ssh'));
      o.push(' authorization-attribute user-role ' + (u.role || 'network-operator'));
      sep(o);
    });
    if (cfg.ssh.enable) { o.push(' ssh server enable'); }
    if (cfg.ssh.rsaKey) o.push(' public-key local create rsa');
    if (cfg.telnet.enable) o.push(' telnet server enable');
    if (cfg.http.enable) o.push(' ip http enable');
    if (cfg.https.enable) o.push(' ip https enable');
    if (cfg.ftp.enable) o.push(' ftp server enable');

    o.push('line vty 0 ' + Math.max(0, (cfg.vty.count || 5) - 1));
    o.push(' authentication-mode ' + cfg.vty.auth);
    if (cfg.vty.password) o.push(' set authentication password simple ' + cfg.vty.password);
    o.push(' user-role ' + (cfg.vty.role || 'network-operator'));
    o.push(' protocol inbound ' + cfg.vty.protocol);
    o.push(' idle-timeout ' + cfg.vty.timeout + ' 0');
    if (cfg.vty.aclIn) o.push(' acl ' + cfg.vty.aclIn + ' inbound');
    sep(o);
    if (cfg.console.auth !== 'none' || cfg.console.password) {
      o.push('line con 0');
      o.push(' authentication-mode ' + cfg.console.auth);
      sep(o);
    }

    /* SNMP / NTP / 日志 */
    if (cfg.snmp && cfg.snmp.enable) {
      o.push(' snmp-agent');
      o.push(' snmp-agent community read ' + cfg.snmp.community.ro);
      if (cfg.snmp.community.rw) o.push(' snmp-agent community write ' + cfg.snmp.community.rw);
      o.push(' snmp-agent sys-info version ' + cfg.snmp.version);
      if (cfg.snmp.location) o.push(' snmp-agent sys-info location ' + cfg.snmp.location);
      if (cfg.snmp.contact) o.push(' snmp-agent sys-info contact ' + cfg.snmp.contact);
      if (cfg.snmp.trapEnable) o.push(' snmp-agent trap enable');
      (cfg.snmp.trapHosts || []).forEach(function (t) { o.push(' snmp-agent target-host trap address udp-domain ' + t.ip + ' params securityname ' + t.sec + ' v2c'); });
      sep(o);
    }
    if (cfg.ntp && cfg.ntp.enable) {
      o.push(' ntp-service enable');
      (cfg.ntp.servers || []).forEach(function (x) { o.push(' ntp-service unicast-server ' + x); });
      if (cfg.ntp.master) o.push(' ntp-service refclock-master ' + cfg.ntp.stratum);
      sep(o);
    }
    if (cfg.infoCenter) {
      o.push(' info-center enable');
      (cfg.syslog.hosts || []).forEach(function (x) { o.push(' info-center loghost ' + x); });
      sep(o);
    }
    if (cfg.security && cfg.security.dhcpSnooping) { o.push(' dhcp snooping enable'); sep(o); }
    if (cfg.macAging !== 300) { o.push(' mac-address timer aging ' + cfg.macAging); }
    (cfg.macStatic || []).forEach(function (m) { o.push(' mac-address static ' + m.mac + ' interface ' + fullIf(m.iface) + ' vlan ' + m.vlan); });
    (cfg.macBlackhole || []).forEach(function (m) { o.push(' mac-address blackhole ' + m.mac + ' vlan ' + m.vlan); });
    (cfg.arpStatic || []).forEach(function (m) { o.push(' arp static ' + m.ip + ' ' + m.mac); });

    o.push(' return');
    return o.join('\n');
  };

  function renderIfaceBody(dev, name, f, out) {
    var isL3 = /^(VLAN|Loop|Tun|RAGG)/.test(name) || f.mode === 'route';
    if (f.desc) out.push(' description ' + f.desc);
    if (isL3) {
      if (f.ip) out.push(' ip address ' + f.ip.addr + ' ' + f.ip.mask);
      (f.ipSecondary || []).forEach(function (s) { out.push(' ip address ' + s.addr + ' ' + s.mask + ' sub'); });
      (f.ipv6 || []).forEach(function (a) { out.push(' ipv6 address ' + U.ipv6Compress(a.addr) + '/' + a.prefix); });
    } else {
      out.push(' port link-type ' + (f.linkType || 'access'));
      if (f.linkType === 'access') out.push(' port access vlan ' + (f.accessVlan || 1));
      if (f.linkType === 'trunk') {
        out.push(' port trunk permit vlan ' + vlanListText(f.permitVlans));
        if (f.pvid != 1) out.push(' port trunk pvid vlan ' + f.pvid);
      }
      if (f.linkType === 'hybrid') out.push(' port hybrid vlan ' + vlanListText(f.untaggedVlans) + ' untagged');
    }
    if (f.aclIn) out.push(' packet-filter ' + f.aclIn + ' inbound');
    if (f.aclOut) out.push(' packet-filter ' + f.aclOut + ' outbound');
    if (!f.adminUp) out.push(' shutdown');
    return out;
  }

  function fullIf(n) {
    var m = String(n).match(/^([A-Za-z]+)(.*)$/);
    if (!m) return n;
    var map = { GE: 'GigabitEthernet', FE: 'FastEthernet', XGE: 'Ten-GigabitEthernet', FGE: 'FortyGigE', BAGG: 'Bridge-Aggregation', RAGG: 'Route-Aggregation', VLAN: 'Vlan-interface', Loop: 'LoopBack', Tun: 'Tunnel', Ser: 'Serial' };
    return (map[m[1]] || m[1]) + m[2];
  }
  Config.fullIf = fullIf;
  Config.ifaceCfg = ifaceCfg;       // 暴露给 display current-configuration interface 使用

  /* 按视图渲染 */
  Config.renderView = function (dev, view) {
    var o = [];
    var cfg = dev.cfg;
    switch (view.view) {
      case 'interface': {
        var f = cfg.ifaces[view.arg];
        if (!f) return '#';
        var m = view.arg.match(/^([A-Z]+)(.*)$/);
        var map = { GE: 'GigabitEthernet', FE: 'FastEthernet', XGE: 'Ten-GigabitEthernet', FGE: 'FortyGigE', BAGG: 'Bridge-Aggregation', RAGG: 'Route-Aggregation', VLAN: 'Vlan-interface', Loop: 'LoopBack', Tun: 'Tunnel', Ser: 'Serial' };
        o.push('#');
        o.push('interface ' + (map[m[1]] || m[1]) + m[2]);
        renderIfaceBody(dev, view.arg, f, o);
        o.push('#');
        return o.join('\n');
      }
      case 'vlan': {
        var v = cfg.vlans[view.arg];
        o.push('#');
        o.push('vlan ' + view.arg);
        if (v && v.name) o.push(' name ' + v.name);
        if (v && v.desc) o.push(' description ' + v.desc);
        o.push('#');
        return o.join('\n');
      }
      case 'ospf': {
        o.push('#');
        o.push('ospf ' + cfg.ospf.process);
        o.push('#');
        return o.join('\n');
      }
      case 'rip': {
        o.push('#');
        o.push('rip ' + cfg.rip.process);
        o.push('#');
        return o.join('\n');
      }
      case 'acl': {
        o.push('#');
        o.push('acl basic ' + view.arg.id);
        (cfg.acl[view.arg.id].rules || []).forEach(function (r) { o.push(' rule ' + r.id + ' ' + r.action); });
        o.push('#');
        return o.join('\n');
      }
      default:
        return '#\n# (当前视图无独立配置段，请使用 display current-configuration 查看全部)\n#';
    }
  };

  H.Config = Config;
})(window.H3C);
