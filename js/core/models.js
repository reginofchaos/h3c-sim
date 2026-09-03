/* H3C 网络仿真实验室 - 设备型号库与设备工厂 */
(function (H) {
  'use strict';
  var U = H.U;

  /* 型号定义: ports 段定义 {t:类型, n:数量, start:起始编号, base:前缀} */
  var MODELS = [
    {
      id: 'S6850-56HF', type: 'switch', l3: true, level: 'core', label: '数据中心核心交换机',
      desc: '48×GE + 8×10G/40G 三层交换机（Comware V7）',
      segments: [{ t: 'GE', n: 48, base: '1/0/', start: 1 }, { t: 'XGE', n: 8, base: '1/0/', start: 49 }]
    },
    {
      id: 'S5560X-54C-EI', type: 'switch', l3: true, level: 'agg', label: '汇聚三层交换机',
      desc: '48×GE + 4×10G + 2×40G 三层交换机',
      segments: [{ t: 'GE', n: 48, base: '1/0/', start: 1 }, { t: 'XGE', n: 4, base: '1/0/', start: 49 }, { t: 'FGE', n: 2, base: '1/0/', start: 53 }]
    },
    {
      id: 'S5130-28S-EI', type: 'switch', l3: true, level: 'access', label: '接入三层交换机',
      desc: '24×GE + 4×10G 光口接入交换机',
      segments: [{ t: 'GE', n: 24, base: '1/0/', start: 1 }, { t: 'XGE', n: 4, base: '1/0/', start: 25 }]
    },
    {
      id: 'S5110-52P', type: 'switch', l3: false, level: 'access', label: '二层接入交换机',
      desc: '48×GE + 4×10G 二层交换机（POE）',
      segments: [{ t: 'GE', n: 48, base: '1/0/', start: 1 }, { t: 'XGE', n: 4, base: '1/0/', start: 49 }]
    },
    {
      id: 'S5820', type: 'switch', l3: true, level: 'agg', label: '10G 汇聚接入交换机',
      desc: '48×10GE(SFP+) + 4×40G(QSFP+) 三层交换机',
      segments: [{ t: 'XGE', n: 48, base: '1/0/', start: 1 }, { t: 'FGE', n: 4, base: '1/0/', start: 49 }]
    },
    {
      id: 'S3110-26TP', type: 'switch', l3: false, level: 'access', label: '二层百兆交换机',
      desc: '24×FE + 2×GE 二层交换机',
      segments: [{ t: 'FE', n: 24, base: '1/0/', start: 1 }, { t: 'GE', n: 2, base: '1/0/', start: 25 }]
    },
    {
      id: 'MSR36-20', type: 'router', l3: true, level: 'router', label: '多业务路由器',
      desc: '3×GE 三层口 + 2×Serial 广域网路由器',
      segments: [{ t: 'GE', n: 3, base: '0/', start: 0 }, { t: 'Serial', n: 2, base: '1/', start: 0 }]
    },
    {
      id: 'MSR26-10', type: 'router', l3: true, level: 'router', label: '中小企业路由器',
      desc: '2×GE + 1×Serial 路由器',
      segments: [{ t: 'GE', n: 2, base: '0/', start: 0 }, { t: 'Serial', n: 1, base: '1/', start: 0 }]
    },
    {
      id: 'SR6608', type: 'router', l3: true, level: 'router', label: '高端核心路由器',
      desc: '8×GE 高性能路由器',
      segments: [{ t: 'GE', n: 8, base: '0/', start: 0 }]
    },
    {
      id: 'SecPath F100-C-G5', type: 'firewall', l3: true, level: 'fw', label: '下一代防火墙',
      desc: '8×GE 安全网关',
      segments: [{ t: 'GE', n: 8, base: '1/0/', start: 1 }]
    },
    {
      id: 'PC', type: 'pc', l3: false, level: 'host', label: 'PC 终端',
      desc: '单网卡终端，支持 ip 配置与 ping 测试',
      segments: [{ t: 'GE', n: 1, base: '0/', start: 1 }]
    },
    {
      id: 'Server', type: 'server', l3: false, level: 'host', label: '服务器',
      desc: '单网卡服务器，支持 ip 配置与 ping 测试',
      segments: [{ t: 'GE', n: 1, base: '0/', start: 1 }]
    }
  ];

  var TYPE_NAME = { switch: '交换机', router: '路由器', firewall: '防火墙', pc: 'PC', server: '服务器' };
  var PORT_SPEED = { FE: '100M', GE: '1000M', XGE: '10G', FGE: '40G', Serial: '2M' };
  var PORT_FULL = {
    FE: 'FastEthernet', GE: 'GigabitEthernet', XGE: 'Ten-GigabitEthernet',
    FGE: 'FortyGigE', Serial: 'Serial'
  };

  function buildPorts(model) {
    var ports = [];
    (model.segments || []).forEach(function (seg) {
      for (var i = 0; i < seg.n; i++) {
        var idx = (seg.start || 0) + i;
        var name = seg.t + seg.base + idx;
        ports.push({
          name: name,
          full: PORT_FULL[seg.t] + seg.base + idx,
          type: seg.t,
          idx: idx,
          num: idx,
          speed: PORT_SPEED[seg.t] || 'auto',
          seg: seg.t
        });
      }
    });
    return ports;
  }

  function defaultIface(port) {
    return {
      name: port.name,
      desc: '',
      adminUp: true,
      mode: 'bridge',            // bridge | route
      linkType: 'access',        // access | trunk | hybrid
      accessVlan: 1,
      pvid: 1,
      permitVlans: [1],          // trunk/hybrid 允许列表
      untaggedVlans: [1],        // hybrid untagged
      ip: null,                  // { addr, mask }
      ipSecondary: [],
      ipv6: [],                  // [{ addr: 网络形式, prefix: 0-128 }]
      dhcp: false,
      speed: 'auto',
      duplex: 'auto',
      stpEnable: true,
      stpCost: 'auto',
      stpPriority: 128,
      stpEdge: false,
      stpBpduGuard: false,
      loopbackDetect: false,
      stormBroadcast: null,      // pps 或百分比
      portSecurity: { enable: false, max: 1, mode: 'restrict', sticky: false, macs: [] },
      dot1x: { enable: false, method: 'chap', ctrl: 'macbased', reauth: false },
      macAuth: false,
      maxMac: null,
      portIsolate: false,
      mirror: null,              // 'inbound'|'outbound'|'both' 在被镜像口上填写
      aclIn: null,
      aclOut: null,
      qos: { trust: null, carIn: null, carOut: null, bandwidth: null, queue: null, priority: null, wrr: null, dscp: null, vlanTagPriority: null },
      vrrp: [],
      aggregation: null,         // 所属聚合组 id
      lldp: true,
      poe: false,
      category: 'eth',
      linkProtocol: 'ppp',       // 串口链路封装：ppp/hdlc（仅 Serial 口生效，以太网口忽略）
      pppAuth: { mode: 'none', user: '', password: '' }  // PPP 认证：认证方设 authentication-mode，被认证方呈交 user/password
    };
  }

  function newDevice(modelId, name, x, y) {
    var model = MODELS.filter(function (m) { return m.id === modelId; })[0] || MODELS[2];
    var ports = buildPorts(model);
    var ifaces = {};
    ports.forEach(function (p) { ifaces[p.name] = defaultIface(p); });
    // Serial 口默认即三层路由口、链路协议 PPP（与 H3C Comware 一致）
    ports.forEach(function (p) {
      if (p.type === 'Serial') {
        var sf = ifaces[p.name];
        sf.category = 'serial';
        sf.mode = 'route';
        sf.linkType = 'access';
        sf.stpEnable = false;
        sf.linkProtocol = 'ppp';
        sf.pppAuth = { mode: 'none', user: '', password: '' };
      }
    });

    var dev = {
      id: 'dev_' + Math.random().toString(36).slice(2, 9),
      model: model.id,
      type: model.type,
      l3: model.l3,
      level: model.level,
      name: name || model.id,
      x: x || 0, y: y || 0,
      ports: ports,
      cfg: {
        hostname: name || model.id,
        sysname: name || model.id,
        banner: '',
        motd: '',
        clock: null,
        timezone: 'UTC',
        domain: '',
        users: [],                 // local-user
        aaa: { authLogin: 'none', authSchemeDefault: 'system', domainSystem: { auth: 'local', authz: 'none', acct: 'none' } },
        superPassword: null,
        console: { auth: 'none', password: null, scheme: null, timeout: 10, baud: 9600, history: 10 },
        vty: { count: 5, auth: 'scheme', scheme: 'local', aclIn: null, aclOut: null, timeout: 10, protocol: 'all' },
        ssh: { enable: false, port: 22, version: '2.0', timeout: 60, authRetries: 3, userauthType: 'password' },
        telnet: { enable: true, port: 23 },
        http: { enable: false, port: 80 },
        https: { enable: false, port: 443 },
        ftp: { enable: false },
        tftp: {},
        snmp: { enable: false, version: 'v2c', community: { ro: 'public', rw: 'private' }, v3Users: [], trapHosts: [], location: '', contact: '' },
        ntp: { enable: false, master: false, stratum: 8, servers: [], authKey: null },
        syslog: { enable: false, hosts: [], level: 'informational', console: true, logbuffer: { size: 512, level: 'informational' } },
        logbuffer: [],
        infoCenter: true,
        vlans: {},                 // { 10: { id, name, desc, ports:[], untagged:[], tagged:[] } }
        stp: { enable: true, mode: 'mstp', priority: 32768, forwardTime: 15, helloTime: 2, maxAge: 20, timerFactor: 3, bpduGuard: false, rootGuard: false, loopGuard: false, tcGuard: false, instances: { 0: { vlans: [1], priority: 32768 } } },
        lag: {},                   // { 1: { id, mode, members:[], type } }
        macAging: 300,
        macStatic: [],             // { vlan, mac, iface }
        macBlackhole: [],
        arpStatic: [],
        staticRoutes: [],          // { dest, mask, nexthop, oif, pref, desc, tag, permanent, bfd }
        defaultRoute: null,
        ipv6: false,               // 全局 IPv6 使能
        ipv6StaticRoutes: [],      // { dest(网络形式), prefix, nexthop, oif, pref, state }
        ipv6DefaultRoute: null,    // PC/服务器 默认网关（IPv6）
        rip: { enable: false, process: 1, version: 2, networks: [], summary: true, splitHorizon: true, poisonReverse: false, metricin: null, importRoutes: [], passive: [], neighbors: [] },
        ospf: { enable: false, process: 1, routerId: null, areas: {}, networks: [], silent: [], importRoutes: [], defaultRouteAdvertise: false, costRefBandwidth: 100, bandwidthRef: 100, abrType: 'standard', timers: { spf: 5, lsa: 5 }, authMode: null, passiveInterfaces: [] },
        bgp: { enable: false, as: null, routerId: null, peers: [], networks: [], importRoutes: [], gracefulRestart: false, ref: 100 },
        isis: { enable: false, process: 1, level: 'level-1-2', net: null, networks: [], importRoutes: [], summary: null },
        policyRoutes: [],          // { name, node, ifMatch: acl, applyNexthop, applyOif, prefer }
        dhcp: { enable: false, pools: [], serverDhcp: false, relay: [] },
        dns: { servers: [], domain: '', proxy: false },
        acl: {},                   // { 2000: { type:'basic'|'advanced'|'mac'|'user', rules:[] } }
        qos: { policy: {}, class: {}, behavior: {}, profiles: {} },
        mirroring: { groups: {} }, // { 1: { monitorPort, sourceVlan, remoteVlan } }
        portGroups: {},            // { name: { members: [] } }
        vrrp: {},
        linkAgg: {},
        irf: { enable: false, member: 1, priority: 1, domain: 0, ports: [] },
        stack: { enable: false, role: 'master', priority: 100, ports: [] },
        security: {
          attackProtection: { land: true, smurf: true, fraggle: true, winnuke: false, tcpInvalid: true, pingOfDeath: true, tearDrop: true, ipFragment: false, ipSweep: false, udpPortScan: false, syslog: false },
          arpDetection: false,
          dhcpSnooping: false,
          ipSourceGuard: false,
          stormControl: {},
          loopbackDetection: { enable: false, interval: 30, action: 'block' },
          bpduGuard: false
        },
        radius: { schemes: {} },
        hwtacacs: { schemes: {} },
        vlanIfaces: {},            // 额外 Vlan-interface 属性
        loopbacks: {},
        files: { startup: null, running: null },
        startupCfg: null,          // save 之后的配置快照
        debugFlags: {},
        terminal: { length: 24, monitor: false, debugging: false, trapping: false },
        ifaces: ifaces
      },
      rt: {
        mac: {},                   // { vlan: { iface: { mac: age } } }
        arp: {},                   // { ip: { mac, iface, vlan, type, age } }      IPv4 邻居
        nd6: {},                   // { ipv6: { mac, iface, state, age } }         IPv6 邻居（ND 缓存）
        routes: null,              // 缓存（IPv4）
        routes6: null,             // 缓存（IPv6）
        stpState: null,
        logs: [],
        bootTs: Date.now(),
        up: true,
        errors: {}
      }
    };
    dev.cfg.vlans[1] = { id: 1, name: 'VLAN 0001', desc: 'default', created: true };
    return dev;
  }

  /* 克隆设备（保留配置） */
  function cloneDevice(dev) {
    var d = U.clone(dev);
    d.id = 'dev_' + Math.random().toString(36).slice(2, 9);
    d.rt.mac = {}; d.rt.arp = {}; d.rt.nd6 = {}; d.rt.routes = null; d.rt.routes6 = null; d.rt.logs = [];
    return d;
  }

  H.MODELS = MODELS;
  H.TYPE_NAME = TYPE_NAME;
  H.PORT_SPEED = PORT_SPEED;
  H.PORT_FULL = PORT_FULL;
  H.Model = {
    buildPorts: buildPorts,
    defaultIface: defaultIface,
    newDevice: newDevice,
    cloneDevice: cloneDevice,
    get: function (id) { return MODELS.filter(function (m) { return m.id === id; })[0]; },
    typeName: function (t) { return TYPE_NAME[t] || t; }
  };
})(window.H3C);
