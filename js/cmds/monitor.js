/* 网络监控与诊断：display 系列 / ping / tracert / debugging / reset */
(function (H) {
  'use strict';
  var U = H.U, S = H.State, R = H.R, C = H.Cmd;

  function Sim() { return H.Sim; }

  function hash(s) { var h = 2166136261; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = (h * 16777619) >>> 0; } return h >>> 0; }
  function stable(s, mod) { return hash(String(s)) % (mod || 100000); }

  /* 接口名称显示（全名） */
  function fullName(name) {
    var m = name.match(/^([A-Za-z\-]+)(.+)$/);
    if (!m) return name;
    var map = { GE: 'GigabitEthernet', FE: 'FastEthernet', XGE: 'Ten-GigabitEthernet', FGE: 'FortyGigE', BAGG: 'Bridge-Aggregation', RAGG: 'Route-Aggregation', VLAN: 'Vlan-interface', Loop: 'LoopBack', Tun: 'Tunnel', Ser: 'Serial' };
    return (map[m[1]] || m[1]) + m[2];
  }

  /* ==================== 设备基本信息 ==================== */
  R({
    views: ['*'], pat: 'display version', global: true, seq: 'monitor',
    help: '显示系统版本信息',
    run: function (c) {
      var d = c.dev;
      var up = U.uptime(d.rt.bootTs);
      return {
        out: [
          'H3C Comware Software, Version 7.1.070, Release 6326',
          'Copyright (c) 2004-2022 New H3C Technologies Co., Ltd. All rights reserved.',
          'H3C ' + d.model + ' uptime is ' + up,
          'Last reboot reason : User reboot',
          '',
          'Boot image: flash:/cmw710-boot-r6326.bin',
          'Boot image version: 7.1.070, Release 6326',
          '  Compiled Nov 15 2022 16:00:00',
          '',
          'Slot 1:',
          'Uptime is ' + up,
          d.model + ' with 1 Processor',
          'BOARD TYPE:         ' + d.model,
          'DRAM:               ' + (d.type === 'router' ? '1024M' : '512M') + ' bytes',
          'FLASH:              ' + (d.type === 'router' ? '512M' : '256M') + ' bytes',
          'PCB Version:        Ver.B',
          'BootRom Version:    1.20',
          'CPLD Version:       2.02',
          'Release Version:    H3C ' + d.model + '-6326',
          '',
          '  Basic BootRom Version: 1.20',
          '  Extend BootRom Version: 1.20',
          '[SubSlot 0] 24GE+4SFP Plus'
        ].join('\n')
      };
    }
  });
  R({
    views: ['*'], pat: 'display device', global: true, seq: 'monitor',
    help: '显示设备硬件信息',
    run: function (c) {
      var d = c.dev;
      return {
        out: U.table(['Slot No.', 'Brd Type', 'Brd Status', 'Subslot Num', 'Sft Ver', 'Patch Ver'], [
          ['1', d.model, 'Normal', '0', '7.1.070', 'None']
        ]) + '\nChassis 1:\n  Power  1: Normal\n  Fan    1: Normal'
      };
    }
  });
  R({
    views: ['*'], pat: 'display clock', global: true, seq: 'monitor',
    help: '显示系统时间',
    run: function (c) { return { out: (c.dev.cfg.clock || U.now()) + '\n' + (c.dev.cfg.timezone || 'UTC') + ' time' }; }
  });
  R({
    views: ['*'], pat: 'display cpu-usage', global: true, seq: 'monitor',
    help: '显示 CPU 占用率统计',
    run: function (c) {
      var u = 3 + stable(c.dev.id, 12);
      return {
        out: 'Slot 1 CPU 0 CPU usage:\n   ' + u + '% in last 5 seconds\n   ' + (u - 1) + '% in last 1 minute\n   ' + (u - 2) + '% in last 5 minutes'
      };
    }
  });
  R({
    views: ['*'], pat: 'display memory', global: true, seq: 'monitor',
    help: '显示内存占用信息',
    run: function (c) {
      var total = c.dev.type === 'router' ? 1048576 : 524288;
      var used = Math.round(total * (0.4 + stable(c.dev.id, 20) / 100));
      return {
        out: 'System Total Memory(bytes): ' + total * 1024 + '\nTotal Used Memory(bytes): ' + used * 1024 +
          '\nUsed Rate: ' + Math.round(used / total * 100) + '%'
      };
    }
  });
  R({
    views: ['*'], pat: 'display environment', global: true, seq: 'monitor',
    help: '显示温度环境信息',
    run: function () { return { out: ' System Temperature information (degree centigrade):\n ----------------------------------------------------\n SlotNo  Sensor    Status     Current  Lower  Upper  Critical\n 1       Inlet     Normal     38       5      55     60\n 1       Outlet    Normal     45       5      65     70' }; }
  });
  R({
    views: ['*'], pat: 'display fan', global: true, seq: 'monitor',
    help: '显示风扇状态', run: function () { return { out: ' Fan 1:\n  State    : Normal\n  Speed    : 4200 RPM' }; }
  });
  R({
    views: ['*'], pat: 'display power', global: true, seq: 'monitor',
    help: '显示电源状态', run: function () { return { out: ' Power 1:\n  State    : Normal\n  Type     : AC' }; }
  });
  R({
    views: ['*'], pat: 'display users', global: true, seq: 'monitor',
    help: '显示在线用户',
    run: function (c) {
      return { out: U.table(['Idx', 'Line', 'Idle Time', 'Pid', 'Type'], [['+ 0', 'VTY 0', '00:00:00', String(stable(c.dev.id, 9000) + 1000), 'SSH']]) };
    }
  });
  R({
    views: ['*'], pat: 'display user-interface', global: true, seq: 'monitor',
    help: '显示用户线信息',
    run: function (c) {
      var v = c.dev.cfg.vty, con = c.dev.cfg.console;
      return {
        out: ' Idx  Type     Tx/Rx      Modem Auth  Int          Location\n' +
          ' 0    CON ' + con.baud + '  -     ' + con.auth + '   -            --\n' +
          ' 129  VTY 0     -         -     ' + v.auth + '   -            --\n' +
          ' 130  VTY 1     -         -     ' + v.auth + '   -            --\n' +
          ' 131  VTY 2     -         -     ' + v.auth + '   -            --\n' +
          ' 132  VTY 3     -         -     ' + v.auth + '   -            --\n' +
          ' 133  VTY 4     -         -     ' + v.auth + '   -            --'
      };
    }
  });
  R({
    views: ['*'], pat: 'display ssh server status', global: true, seq: 'monitor',
    help: '显示 SSH 服务器状态',
    run: function (c) {
      var s = c.dev.cfg.ssh;
      return {
        out: ' SSH server: ' + (s.enable ? 'Enable' : 'Disable') +
          '\n SSH version: ' + s.version +
          '\n SSH server port: ' + s.port +
          '\n Authentication timeout: ' + s.timeout + ' seconds' +
          '\n Authentication retries: ' + s.authRetries +
          '\n SFTP server: ' + (c.dev.cfg.sftp ? 'Enable' : 'Disable')
      };
    }
  });
  R({
    views: ['*'], pat: 'display telnet server status', global: true, seq: 'monitor',
    help: '显示 Telnet 服务器状态',
    run: function (c) { return { out: ' TELNET server: ' + (c.dev.cfg.telnet.enable ? 'Enable' : 'Disable') + '\n TELNET server port: ' + c.dev.cfg.telnet.port }; }
  });
  R({
    views: ['*'], pat: 'display local-user', global: true, seq: 'monitor',
    help: '显示本地用户列表',
    run: function (c) {
      var us = c.dev.cfg.users;
      if (!us.length) return { out: 'The local user list is empty.' };
      return {
        out: U.table(['User Name', 'State', 'Service Type', 'User Group', 'User Role', 'Attribute'],
          us.map(function (u) {
            return [u.name, u.state || 'Active', (u.services || []).join(',') || '-', 'system', u.role || 'network-operator', '-'];
          }))
      };
    }
  });

  /* ==================== 接口 ==================== */
  function ifaceRows(dev, filterL3) {
    var out = [];
    var names = Object.keys(dev.cfg.ifaces || {});
    names.sort(function (a, b) {
      var oa = dev.ports.findIndex ? -1 : -1;
      return ifSort(a, b);
    });
    function ifSort(a, b) {
      var pa = /^[A-Za-z\-]+/.exec(a)[0], pb = /^[A-Za-z\-]+/.exec(b)[0];
      var ord = { VLAN: 0, Loop: 1, Tun: 2, RAGG: 3, BAGG: 4, GE: 5, XGE: 6, FGE: 7, FE: 8 };
      var oa = ord[pa] != null ? ord[pa] : 9, ob = ord[pb] != null ? ord[pb] : 9;
      if (oa !== ob) return oa - ob;
      var na = a.slice(pa.length), nb = b.slice(pb.length);
      return na.localeCompare(nb, undefined, { numeric: true });
    }
    names.forEach(function (n) {
      if (dev.cfg.ifaces[n].aggregation != null && !/^BAGG|^RAGG/.test(n) && dev.ports.every(function (p) { return p.name !== n; })) { /* keep */ }
      if (dev.ports.some(function (p) { return p.name === n; }) && dev.cfg.ifaces[n].aggregation != null) return;
      var isL3 = /^(VLAN|Loop|Tun|RAGG)/.test(n) || dev.cfg.ifaces[n].mode === 'route';
      if (filterL3 === true && !isL3) return;
      if (filterL3 === false && isL3) return;
      out.push(n);
    });
    return out;
  }

  R({
    views: ['*'], pat: 'display ip interface brief', global: true, seq: 'monitor',
    help: '显示三层接口的 IP 简要信息',
    run: function (c) {
      var dev = c.dev;
      var names = ifaceRows(dev, true);
      var rows = names.map(function (n) {
        var f = dev.cfg.ifaces[n];
        var up = Sim().l3Up(dev, n);
        var phys = /^(Loop|Tun)/.test(n) ? 'up' : (/^(VLAN|RAGG)/.test(n) ? (Sim().l3Up(dev, n) ? 'up' : 'down') : (Sim().portPhysUp(dev, n) ? 'up' : 'down'));
        if (!f.adminUp) phys = '*down';
        return [fullName(n), phys, up ? 'up' : 'down', f.ip ? f.ip.addr : 'unassigned', f.desc || '--'];
      });
      return {
        out: '*down: administratively down\n(s): spoofing  (l): loopback\n' +
          U.table(['Interface', 'Physical', 'Protocol', 'IP Address', 'Description'], rows)
      };
    }
  });
  R({
    views: ['*'], pat: 'display interface brief', global: true, seq: 'monitor',
    help: '显示所有接口的简要信息',
    run: function (c) {
      var dev = c.dev;
      var l3 = ifaceRows(dev, true).filter(function (n) { return !/^Loop|^Tun/.test(n); });
      var l2 = ifaceRows(dev, false);
      var s = '';
      if (l3.length) {
        s += 'Brief information on interfaces in route mode:\nLink: ADM - administratively down; Stby - standby\nProtocol: (s) - spoofing\n';
        s += U.table(['Interface', 'Link', 'Protocol', 'Primary IP', 'Description'], l3.map(function (n) {
          var f = dev.cfg.ifaces[n];
          var up = Sim().l3Up(dev, n);
          var link = Sim().portPhysUp(dev, n) || /^(VLAN|RAGG)/.test(n) ? (up ? 'UP' : 'DOWN') : 'ADM';
          if (!f.adminUp) link = 'ADM';
          return [fullName(n), link, up ? 'UP' : 'DOWN', f.ip ? f.ip.addr : '--', f.desc || '--'];
        }));
      }
      if (l2.length) {
        s += '\nBrief information on interfaces in bridge mode:\nLink: ADM - administratively down; Stby - standby\nSpeed or Duplex: (a)/A - auto; H - half; F - full\nType: A - access; T - trunk; H - hybrid\n';
        s += U.table(['Interface', 'Link', 'Speed', 'Duplex', 'Type', 'PVID', 'Description'], l2.map(function (n) {
          var f = dev.cfg.ifaces[n];
          var st = Sim().ifaceLine(dev, n);
          var link = !f.adminUp ? 'ADM' : (st.proto.indexOf('down') === 0 ? 'DOWN' : 'UP');
          if (st.proto === 'down(stp)') link = 'UP(stp-block)';
          var type = f.linkType === 'access' ? 'A' : f.linkType === 'trunk' ? 'T' : 'H';
          return [fullName(n), link, f.speed === 'auto' ? 'auto' : f.speed, f.duplex === 'auto' ? 'A' : (f.duplex === 'full' ? 'F' : 'H'), type, String(f.pvid || 1), f.desc || '--'];
        }));
      }
      return { out: s };
    }
  });
  R({
    views: ['*'], pat: 'display interface', global: true, seq: 'monitor',
    help: '显示所有接口的详细信息',
    run: function (c) {
      var names = ifaceRows(c.dev, null);
      return { out: names.map(function (n) { return ifaceDetail(c.dev, n); }).join(String.fromCharCode(10)) }
    }
  });
  R({
    views: ['*'], pat: 'display interface <ifname>', global: true, seq: 'monitor',
    help: '显示指定接口的详细信息',
    run: function (c) {
      var n = U.ifShort(c.args.ifname);
      if (!c.dev.cfg.ifaces[n]) return { out: '                                        ^\nError: Wrong parameter found at \'^\' position.', err: true };
      return { out: ifaceDetail(c.dev, n) };
    }
  });
  R({
    views: ['*'], pat: 'display interface <ifname> brief', global: true, hidden: true, seq: 'monitor',
    help: '显示指定接口简要信息',
    run: function (c) {
      var n = U.ifShort(c.args.ifname);
      var f = c.dev.cfg.ifaces[n]; if (!f) return { out: 'Error: The interface does not exist.', err: true };
      var st = Sim().ifaceLine(c.dev, n);
      return { out: U.table(['Interface', 'Link', 'Protocol', 'Primary IP', 'Description'], [[fullName(n), st.phys ? 'UP' : 'DOWN', st.up ? 'UP' : 'DOWN', f.ip ? f.ip.addr : '--', f.desc || '--']]) };
    }
  });

  function ifaceDetail(dev, n) {
    var f = dev.cfg.ifaces[n];
    var st = Sim().ifaceLine(dev, n);
    var isL3 = /^(VLAN|Loop|Tun|RAGG)/.test(n) || f.mode === 'route';
    var port = null;
    dev.ports.forEach(function (p) { if (p.name === n) port = p; });
    var bw = port ? (Sim().BW_MBPS[port.type] || 1000) : 1000;
    var L = [];
    L.push(fullName(n));
    L.push('Current state: ' + (st.up ? 'UP' : (f.adminUp ? 'DOWN' : 'Administratively DOWN')));
    L.push('Line protocol state: ' + (st.up ? 'UP' : 'DOWN'));
    L.push('Description: ' + (f.desc || fullName(n) + ' Interface'));
    L.push('Bandwidth: ' + bw + '000 kbps');
    if (!isL3) {
      L.push('Maximum transmission unit: ' + (f.mtu || 1500));
      L.push('Internet protocol processing: Disabled');
      L.push('Port link-type: ' + (f.linkType || 'access'));
      if (f.linkType === 'access') L.push('Port access vlan: ' + (f.accessVlan || 1));
      if (f.linkType === 'trunk') L.push('Trunk port permit vlan: ' + U.vlanListText(f.permitVlans || [1]) + '\nTrunk port pvid: ' + (f.pvid || 1));
      if (f.linkType === 'hybrid') L.push('Hybrid port tagged vlan: ' + U.vlanListText((f.permitVlans || []).filter(function (v) { return (f.untaggedVlans || []).indexOf(v) < 0; })) + '\nHybrid port untagged vlan: ' + U.vlanListText(f.untaggedVlans || [1]) + '\nHybrid port pvid: ' + (f.pvid || 1));
    } else {
      L.push('Internet address: ' + (f.ip ? f.ip.addr + '/' + U.maskLen(f.ip.mask) : 'No ip address'));
      (f.ipSecondary || []).forEach(function (s) { L.push('                  ' + s.addr + '/' + U.maskLen(s.mask) + '(Secondary)'); });
    }
    if (port) {
      if (port.type === 'Serial') {
        L.push('Link-protocol: ' + (f.linkProtocol || 'ppp'));
        L.push('Line protocol state: ' + (Sim().linkProtocolUp(dev, n) ? 'UP' : 'DOWN'));
      }
      L.push('Media type: ' + (port.type === 'XGE' || port.type === 'FGE' ? 'Optical fiber' : 'Twisted pair'));
      L.push('Port hardware type: ' + (port.type === 'XGE' ? '10GBASE-R' : port.type === 'FE' ? '100BASE-TX' : '1000BASE-T'));
      L.push('Flow-control: ' + (f.flowControl ? 'Enabled' : 'Disabled'));
      L.push('Maximum frame length: ' + (f.jumbo ? 9216 : 1522));
      L.push('Allow jumbo frames to pass: ' + (f.jumbo ? 'Enabled' : 'Disabled'));
      L.push('Speed: ' + (f.speed === 'auto' ? 'auto(' + bw + '000)' : f.speed) + ' Mbps');
      L.push('Duplex: ' + (f.duplex === 'auto' ? 'auto(full)' : f.duplex));
      L.push('Link-speed type: ' + (f.speed === 'auto' ? 'autonegotiation' : 'force link'));
      L.push('PVID: ' + (f.pvid || 1));
      if (f.aggregation != null) L.push('Aggregation group ID: ' + f.aggregation);
    }
    if (dev.type === 'switch' && dev.cfg.stp.enable && !isL3 && f.stpEnable) {
      var stpSt = (Sim().stpState()[dev.id] || {})[n] || {};
      L.push('STP: ' + (f.stpEnable ? 'Enabled' : 'Disabled') + ', Role: ' + (stpSt.role || 'DESI') + ', State: ' + (stpSt.state === 'discarding' ? 'DISCARDING' : 'FORWARDING') + (f.stpEdge ? ', Edged port' : ''));
    }
    if (f.aclIn) L.push('Packet filter ACL inbound: ' + f.aclIn);
    if (f.aclOut) L.push('Packet filter ACL outbound: ' + f.aclOut);
    if (f.portSecurity.enable) L.push('Port security: Enabled, max MAC: ' + f.portSecurity.max + ', mode: ' + f.portSecurity.mode);
    if (f.dot1x.enable) L.push('802.1X: Enabled, port-method: ' + (f.dot1x.method || 'macbased'));
    if (f.qos.carIn) L.push('QoS CAR inbound CIR: ' + f.qos.carIn + ' kbps');
    if (f.qos.lrOut) L.push('QoS LR outbound CIR: ' + f.qos.lrOut + ' kbps');
    if (f.mirror) L.push('Mirroring: ' + f.mirror);
    var rx = stable(n + 'r', 900000), tx = stable(n + 't', 900000);
    var enabled = st.phys || st.up;
    L.push('Last clearing of counters: Never');
    L.push('Last 300 seconds input rate: ' + (enabled ? stable(n + 'i', 2000) : 0) + ' bytes/sec, ' + (enabled ? stable(n + 'p', 20) : 0) + ' packets/sec');
    L.push('Last 300 seconds output rate: ' + (enabled ? stable(n + 'o', 2000) : 0) + ' bytes/sec, ' + (enabled ? stable(n + 'q', 20) : 0) + ' packets/sec');
    L.push('Input: ' + (enabled ? rx : 0) + ' packets, ' + (enabled ? rx * 96 : 0) + ' bytes, ' + (enabled ? stable(n, 20) : 0) + ' drops');
    L.push('Output: ' + (enabled ? tx : 0) + ' packets, ' + (enabled ? tx * 96 : 0) + ' bytes, ' + (enabled ? stable(n, 10) : 0) + ' drops');
    return L.join('\n');
  }
  H.ifaceDetail = ifaceDetail;

  /* ==================== VLAN ==================== */
  R({
    views: ['*'], pat: 'display vlan all', global: true, seq: 'monitor',
    help: '显示所有 VLAN 的详细信息',
    run: function (c) { return { out: vlanAll(c.dev) }; }
  });
  R({
    views: ['*'], pat: 'display vlan', global: true, seq: 'monitor',
    help: '显示 VLAN 摘要与详细信息',
    run: function (c) { return { out: vlanAll(c.dev) }; }
  });
  R({
    views: ['*'], pat: 'display vlan <vid>', global: true, seq: 'monitor',
    help: '显示指定 VLAN 的信息',
    run: function (c) {
      var v = c.dev.cfg.vlans[c.args.vid];
      if (!v) return { out: 'The VLAN does not exist.' };
      return { out: vlanBlock(c.dev, Number(c.args.vid)) };
    }
  });
  R({
    views: ['*'], pat: 'display vlan summary', global: true, seq: 'monitor',
    help: '显示 VLAN 摘要',
    run: function (c) {
      var ks = Object.keys(c.dev.cfg.vlans).map(Number).sort(function (a, b) { return a - b; });
      return { out: ' Total VLANs: ' + ks.length + '\n The VLANs include:\n ' + ks.join(',') };
    }
  });
  function vlanAll(dev) {
    var ks = Object.keys(dev.cfg.vlans).map(Number).sort(function (a, b) { return a - b; });
    var s = ' Total VLANs: ' + ks.length + '\n The VLANs include:\n';
    s += ' ' + ks.map(function (v) { return v === 1 ? '1(default)' : String(v); }).join(',') + '\n';
    ks.forEach(function (v) { s += '\n' + vlanBlock(dev, v); });
    return s;
  }
  function vlanBlock(dev, vid) {
    var v = dev.cfg.vlans[vid] || {};
    var tagged = [], untagged = [];
    Object.keys(dev.cfg.ifaces).forEach(function (n) {
      var f = dev.cfg.ifaces[n];
      if (f.mode === 'route' || f.aggregation != null) return;
      var isPhy = dev.ports.some(function (p) { return p.name === n; });
      if (!isPhy && !/^BAGG/.test(n)) return;
      if (f.linkType === 'access') { if (f.accessVlan === vid) untagged.push(fullName(n)); }
      else if (f.linkType === 'trunk') { if ((f.permitVlans || []).indexOf(vid) >= 0) tagged.push(fullName(n)); }
      else if (f.linkType === 'hybrid') {
        if ((f.untaggedVlans || []).indexOf(vid) >= 0) untagged.push(fullName(n));
        else if ((f.permitVlans || []).indexOf(vid) >= 0) tagged.push(fullName(n));
      }
    });
    var vi = dev.cfg.ifaces['VLAN' + vid];
    var s = '';
    s += ' VLAN ID: ' + vid + '\n';
    s += ' VLAN type: Static\n';
    s += ' Route interface: ' + (vi ? 'Configured' : 'Not configured') + '\n';
    s += ' Description: ' + (v.desc || 'VLAN ' + ('0000' + vid).slice(-4)) + '\n';
    s += ' Name: ' + (v.name || 'VLAN ' + ('0000' + vid).slice(-4)) + '\n';
    s += ' Tagged ports:   ' + (tagged.length ? '\n    ' + tagged.join('\n    ') : ' None') + '\n';
    s += ' Untagged ports: ' + (untagged.length ? '\n    ' + untagged.join('\n    ') : ' None') + '\n';
    return s;
  }
  R({
    views: ['*'], pat: 'display port trunk', global: true, seq: 'monitor',
    help: '显示 Trunk 端口信息',
    run: function (c) {
      var rows = [];
      Object.keys(c.dev.cfg.ifaces).forEach(function (n) {
        var f = c.dev.cfg.ifaces[n];
        if (f.linkType === 'trunk') rows.push([fullName(n), String(f.pvid || 1), U.vlanListText(f.permitVlans || [])]);
      });
      if (!rows.length) return { out: 'There are no trunk ports.' };
      return { out: U.table(['Interface', 'PVID', 'VLAN Passing'], rows) };
    }
  });
  R({
    views: ['*'], pat: 'display port hybrid', global: true, seq: 'monitor',
    help: '显示 Hybrid 端口信息',
    run: function (c) {
      var rows = [];
      Object.keys(c.dev.cfg.ifaces).forEach(function (n) {
        var f = c.dev.cfg.ifaces[n];
        if (f.linkType === 'hybrid') rows.push([fullName(n), String(f.pvid || 1), U.vlanListText(f.untaggedVlans || [])]);
      });
      if (!rows.length) return { out: 'There are no hybrid ports.' };
      return { out: U.table(['Interface', 'PVID', 'Untagged VLAN'], rows) };
    }
  });

  /* ==================== MAC / ARP ==================== */
  R({
    views: ['*'], pat: 'display mac-address', global: true, seq: 'monitor',
    help: '显示 MAC 地址转发表',
    run: function (c) { return { out: macTable(c.dev, null) }; }
  });
  R({
    views: ['*'], pat: 'display mac-address vlan <vid>', global: true, seq: 'monitor',
    help: '显示指定 VLAN 的 MAC 地址表',
    run: function (c) { return { out: macTable(c.dev, Number(c.args.vid)) }; }
  });
  R({
    views: ['*'], pat: 'display mac-address interface <ifname>', global: true, seq: 'monitor',
    help: '显示指定接口学习到的 MAC 地址',
    run: function (c) {
      var n = U.ifShort(c.args.ifname);
      return { out: macTable(c.dev, null, n) };
    }
  });
  R({
    views: ['*'], pat: 'display mac-address aging-time', global: true, seq: 'monitor',
    help: '显示 MAC 地址老化时间',
    run: function (c) { return { out: 'MAC address aging time: ' + (c.dev.cfg.macAging === 0 ? 'not aging' : c.dev.cfg.macAging + 's') }; }
  });
  R({
    views: ['*'], pat: 'display mac-address count', global: true, seq: 'monitor',
    help: '显示 MAC 地址表项数量',
    run: function (c) {
      var n = 0;
      Object.keys(c.dev.rt.mac || {}).forEach(function (v) {
        Object.keys(c.dev.rt.mac[v] || {}).forEach(function (p) { n += Object.keys(c.dev.rt.mac[v][p] || {}).length; });
      });
      return { out: 'Total MAC address count: ' + (n + c.dev.cfg.macStatic.length) + '\nDynamic: ' + n + '  Static: ' + c.dev.cfg.macStatic.length };
    }
  });
  function macTable(dev, vlan, iface) {
    var rows = [];
    Object.keys(dev.rt.mac || {}).forEach(function (v) {
      if (vlan != null && Number(v) !== vlan) return;
      Object.keys(dev.rt.mac[v] || {}).forEach(function (p) {
        if (iface && p !== iface) return;
        Object.keys(dev.rt.mac[v][p] || {}).forEach(function (m) {
          rows.push([U.macFmt(m), v, dev.rt.mac[v][p][m].type === 'static' ? 'Static' : 'Learned', fullName(p), dev.rt.mac[v][p][m].type === 'static' ? 'N' : 'Y']);
        });
      });
    });
    (dev.cfg.macStatic || []).forEach(function (s) {
      if (vlan != null && s.vlan !== vlan) return;
      if (iface && s.iface !== iface) return;
      rows.push([U.macFmt(s.mac), String(s.vlan), 'Static', fullName(s.iface), 'N']);
    });
    if (!rows.length) return 'No MAC address entry found.';
    return U.table(['MAC Address', 'VLAN ID', 'State', 'Port/Nickname', 'Aging'], rows);
  }

  R({
    views: ['*'], pat: 'display arp', global: true, seq: 'monitor',
    help: '显示 ARP 表项',
    run: function (c) { return { out: arpTable(c.dev) }; }
  });
  R({
    views: ['*'], pat: 'display arp all', global: true, hidden: true, seq: 'monitor',
    help: '显示所有 ARP 表项', run: function (c) { return { out: arpTable(c.dev) }; }
  });
  R({
    views: ['*'], pat: 'display arp vlan <vid>', global: true, hidden: true, seq: 'monitor',
    help: '显示指定 VLAN 的 ARP 表项', run: function (c) { return { out: arpTable(c.dev, Number(c.args.vid)) }; }
  });
  R({
    views: ['*'], pat: 'display arp interface <ifname>', global: true, hidden: true, seq: 'monitor',
    help: '显示指定接口的 ARP 表项', run: function (c) { return { out: arpTable(c.dev, null, U.ifShort(c.args.ifname)) }; }
  });
  function arpTable(dev, vlan, iface) {
    var rows = [];
    Object.keys(dev.rt.arp || {}).forEach(function (ip) {
      var e = dev.rt.arp[ip];
      if (vlan != null && e.vlan !== vlan) return;
      if (iface && e.iface !== iface) return;
      rows.push([ip, U.macFmt(e.mac), e.vlan || '-', fullName(e.iface || '-'), e.type === 'static' ? 'N' : String(100 + stable(ip, 1000)), e.type === 'static' ? 'S' : 'D']);
    });
    if (!rows.length) return '  Type: S-Static   D-Dynamic   O-Openflow   R-Rule   I-Invalid\nNo ARP entry found.';
    return '  Type: S-Static   D-Dynamic   O-Openflow   R-Rule   I-Invalid\n' +
      U.table(['IP address', 'MAC address', 'VLAN/VSI', 'Interface/Link ID', 'Aging', 'Type'], rows);
  }

  /* ==================== STP ==================== */
  R({
    views: ['*'], pat: 'display stp brief', global: true, seq: 'monitor',
    help: '显示生成树端口角色与状态摘要',
    run: function (c) {
      var dev = c.dev;
      if (!dev.cfg.stp.enable) return { out: 'Protocol Status    :disabled\nProtocol Std.      :IEEE 802.1s\nVersion            :3' };
      var st = Sim().stpState()[dev.id] || {};
      var rows = [];
      dev.ports.forEach(function (p) {
        var f = dev.cfg.ifaces[p.name];
        if (!f || f.mode === 'route' || !f.stpEnable) return;
        var r = st[p.name];
        if (!r) return;
        var role = r.role === 'ROOT' ? 'ROOT' : r.role === 'DESI' ? 'DESI' : 'ALTE';
        var state = r.state === 'discarding' ? 'DISCARDING' : 'FORWARDING';
        var prot = f.stpRootGuard ? 'ROOT' : f.stpBpduGuard ? 'BPDU' : 'NONE';
        rows.push(['0', fullName(p.name), role, state, prot]);
      });
      if (!rows.length) return { out: 'No STP port information.' };
      return { out: ' MST ID   Port                                Role  STP State   Protection\n' + rows.map(function (r) {
        return ' ' + U.padR(r[0], 8) + ' ' + U.padR(r[1], 34) + ' ' + U.padR(r[2], 5) + ' ' + U.padR(r[3], 11) + ' ' + r[4];
      }).join('\n') };
    }
  });
  R({
    views: ['*'], pat: 'display stp', global: true, seq: 'monitor',
    help: '显示生成树详细信息',
    run: function (c) {
      var dev = c.dev;
      if (!dev.cfg.stp.enable) return { out: 'Protocol Status    :disabled' };
      var root = Sim().stpRoot();
      var rootDev = S.getDevice(root);
      var isRoot = root === dev.id;
      return {
        out: [
          '-------[CIST Global Info][Mode MSTP]-------',
          'CIST Bridge         :' + Sim().bridgeId(dev).prio + '.' + U.macFmt(Sim().bridgeId(dev).mac).replace(/-/g, ''),
          'Bridge Times        :Hello 2s MaxAge 20s FwdDelay 15s MaxHops 20',
          'CIST Root/ERPC      :' + (isRoot ? Sim().bridgeId(dev).prio + '.' + U.macFmt(Sim().bridgeId(dev).mac).replace(/-/g, '') : (rootDev ? Sim().bridgeId(rootDev).prio + '.' + U.macFmt(Sim().bridgeId(rootDev).mac).replace(/-/g, '') : '-')) + ' / ' + (isRoot ? 0 : (dev.cfg.stp.priority >= 32768 ? 4 : 0)),
          'CIST RegRoot/IRPC   :' + Sim().bridgeId(dev).prio + '.' + U.macFmt(Sim().bridgeId(dev).mac).replace(/-/g, '') + ' / 0',
          'CIST RootPortId     :' + (isRoot ? '0.0' : rootPortId(dev)),
          'BPDU-Protection     :' + (dev.cfg.stp.bpduGuard ? 'Enabled' : 'Disabled'),
          'TC or TCN received  :' + stable(dev.id, 30),
          'Time since last TC  :0 days 0h:' + stable(dev.id, 50) + 'm:' + stable(dev.id, 60) + 's',
          '',
          '----[Port' + dev.ports.length + '(GigabitEthernet1/0/1)][FORWARDING]----',
          ' Port Protocol       :Enabled',
          ' Port Role           :Designated Port',
          ' Port Priority       :128',
          ' Port Cost(Legacy)   :Config=auto / Active=4',
          ' Desg. Bridge/Port   :' + Sim().bridgeId(dev).prio + '.' + U.macFmt(Sim().bridgeId(dev).mac).replace(/-/g, '') + ' / 128.1',
          ' Port Edged          :Config=disabled / Active=disabled',
          ' Point-to-point      :Config=auto / Active=true',
          ' Transmit Limit      :10 packets/hello-time',
          ' Protection Type     :None'
        ].join('\n')
      };
    }
  });
  function rootPortId(dev) {
    var st = Sim().stpState()[dev.id] || {};
    for (var k in st) if (st[k].role === 'ROOT') return '128.' + String(k.replace(/\D/g, '')).slice(-2);
    return '0.0';
  }
  R({
    views: ['*'], pat: 'display stp root', global: true, seq: 'monitor',
    help: '显示根桥信息',
    run: function (c) {
      var root = Sim().stpRoot(); var rd = S.getDevice(root);
      return { out: ' MST ID   Root Bridge ID        ExtPathCost IntPathCost Root Port\n 0        ' + (rd ? Sim().bridgeId(rd).prio + '.' + U.macFmt(Sim().bridgeId(rd).mac).replace(/-/g, '') : '-') + '  0           0           ' + (root === c.dev.id ? '---' : rootPortId(c.dev)) };
    }
  });

  /* ==================== 路由表 ==================== */
  R({
    views: ['*'], pat: 'display ip routing-table', global: true, seq: 'monitor',
    help: '显示公网 IPv4 路由表',
    run: function (c) { return { out: routeTable(c.dev) }; }
  });
  R({
    views: ['*'], pat: 'display ip routing-table verbose', global: true, seq: 'monitor',
    help: '显示路由表详细信息',
    run: function (c) { return { out: routeTable(c.dev, true) }; }
  });
  R({
    views: ['*'], pat: 'display ip routing-table <ip>', global: true, seq: 'monitor',
    help: '显示到指定目的地址的路由',
    run: function (c) {
      var r = Sim().lookupRoute(c.dev, c.args.ip);
      if (!r) return { out: 'No route found to ' + c.args.ip + '.' };
      return { out: 'Summary count : 1\n\nDestination/Mask   Proto   Pre Cost        NextHop         Interface\n' + routeRow(r) };
    }
  });
  R({
    views: ['*'], pat: 'display ip routing-table protocol +static|direct|ospf|rip|bgp', global: true, seq: 'monitor',
    help: '显示指定协议的路由',
    run: function (c) {
      var p = c.args._0.toLowerCase();
      var map = { static: 'Static', direct: 'Direct', ospf: 'OSPF', rip: 'RIP', bgp: 'BGP' };
      var list = Sim().routesOf(c.dev).filter(function (r) { return (r.proto || '').toLowerCase().indexOf(map[p]) === 0; });
      if (!list.length) return { out: 'No ' + p + ' route found.' };
      return { out: 'Summary count : ' + list.length + '\n\nDestination/Mask   Proto   Pre Cost        NextHop         Interface\n' + list.map(routeRow).join('\n') };
    }
  });
  R({
    views: ['*'], pat: 'display ip routing-table statistics', global: true, seq: 'monitor',
    help: '显示路由表统计信息',
    run: function (c) {
      var list = Sim().routesOf(c.dev);
      var g = {};
      list.forEach(function (r) { g[r.proto] = (g[r.proto] || 0) + 1; });
      return { out: U.table(['Proto', 'Route Count'], Object.keys(g).map(function (k) { return [k, String(g[k])]; })) + '\nTotal: ' + list.length };
    }
  });
  function routeRow(r) {
    return U.padR(r.dest + '/' + r.mask, 19) + U.padR(r.proto, 8) + U.padR(String(r.pref), 4) + U.padR(String(r.cost), 13) + U.padR(r.nexthop || '0.0.0.0', 16) + (r.oif ? fullName(r.oif) : '--');
  }
  function routeTable(dev, verbose) {
    var list = Sim().routesOf(dev);
    var s = 'Destinations : ' + list.length + '\tRoutes : ' + list.length + '\n\n';
    s += 'Destination/Mask   Proto   Pre Cost        NextHop         Interface\n';
    s += list.map(routeRow).join('\n') + '\n';
    if (verbose && list.length) {
      s += '\n' + list.slice(0, 3).map(function (r) {
        return 'Destination: ' + r.dest + '/' + r.mask + '\n   Protocol: ' + r.proto + '\t\tPreference: ' + r.pref + '\n   NextHop: ' + (r.nexthop || '0.0.0.0') + '\tInterface: ' + (r.oif ? fullName(r.oif) : '--') + '\n   State: Active Adv  Age: ' + stable(r.dest, 300) + 'sec';
      }).join('\n\n');
    }
    return s;
  }
  function routeRow6(r) {
    var dest = U.ipv6Compress(r.dest) + '/' + r.mask;
    var nh = U.ipv6Compress(r.nexthop || '::');
    return U.padR(dest, 36) + U.padR(r.proto, 8) + U.padR(String(r.pref), 4) + U.padR(String(r.cost), 13) + U.padR(nh, 32) + (r.oif ? fullName(r.oif) : '--');
  }
  function routeTable6(dev, verbose) {
    var list = Sim().routesOf6(dev);
    var s = 'Destination:                                           NextHop:                                           Flag\n';
    s += list.map(function (r) {
      return U.padR(U.ipv6Compress(r.dest) + '/' + r.mask, 52) + U.padR(U.ipv6Compress(r.nexthop || '::'), 50) + (r.flags || (r.proto || '')[0] || '');
    }).join('\n') + '\n';
    s += '\nSummary count : ' + list.length + '\n\n';
    s += U.padR('Destination', 36) + U.padR('Proto', 8) + U.padR('Pre', 4) + U.padR('Cost', 13) + U.padR('NextHop', 34) + 'Interface\n';
    s += list.map(routeRow6).join('\n') + '\n';
    if (verbose && list.length) {
      s += '\n' + list.slice(0, 3).map(function (r) {
        return 'Destination: ' + U.ipv6Compress(r.dest) + '/' + r.mask + '\n   Protocol: ' + r.proto + '\t\tPreference: ' + r.pref + '\n   NextHop: ' + U.ipv6Compress(r.nexthop || '::') + '\tInterface: ' + (r.oif ? fullName(r.oif) : '--') + '\n   State: Active Adv  Age: ' + stable(r.dest, 300) + 'sec';
      }).join('\n\n');
    }
    return s;
  }

  /* ==================== IPv6 显示 ==================== */
  R({
    views: ['*'], pat: 'display ipv6 routing-table', global: true, seq: 'monitor',
    help: '显示 IPv6 路由表',
    run: function (c) { return { out: routeTable6(c.dev) }; }
  });
  R({
    views: ['*'], pat: 'display ipv6 routing-table verbose', global: true, seq: 'monitor',
    help: '显示 IPv6 路由表详细信息',
    run: function (c) { return { out: routeTable6(c.dev, true) }; }
  });
  R({
    views: ['*'], pat: 'display ipv6 routing-table statistics', global: true, seq: 'monitor',
    help: '显示 IPv6 路由表统计信息',
    run: function (c) {
      var list = Sim().routesOf6(c.dev);
      var g = {};
      list.forEach(function (r) { g[r.proto] = (g[r.proto] || 0) + 1; });
      return { out: U.table(['Proto', 'Route Count'], Object.keys(g).map(function (k) { return [k, String(g[k])]; })) + '\nTotal: ' + list.length };
    }
  });
  R({
    views: ['*'], pat: 'display ipv6 interface', global: true, seq: 'monitor',
    help: '显示 IPv6 接口信息',
    run: function (c) {
      var dev = c.dev;
      var lines = [];
      Sim().l3Ifaces6(dev).forEach(function (o) {
        lines.push(fullName(o.name) + ' current state : ' + (o.up ? 'UP' : 'DOWN'));
        lines.push('  IPv6 is enabled, link-local address: FE80::' + U.hex(4));
        (o.f.ipv6 || []).forEach(function (a) {
          lines.push('  IPv6 address(es):');
          lines.push('    ' + U.ipv6Compress(a.addr) + '/' + a.prefix);
        });
        lines.push('');
      });
      if (!lines.length) lines.push('IPv6 is not configured on any interface.');
      return { out: lines.join('\n') };
    }
  });
  R({
    views: ['*'], pat: 'display ipv6 interface brief', global: true, seq: 'monitor',
    help: '显示 IPv6 接口摘要',
    run: function (c) {
      var rows = [['Interface', 'Physical', 'Protocol', 'IPv6 Address']];
      Sim().l3Ifaces6(c.dev).forEach(function (o) {
        var addrs = (o.f.ipv6 || []).map(function (a) { return U.ipv6Compress(a.addr) + '/' + a.prefix; }).join('; ');
        rows.push([fullName(o.name), o.up ? 'up' : 'down', o.up ? 'up' : 'down', addrs || '--']);
      });
      if (rows.length === 1) rows.push(['--', '--', '--', 'IPv6 not configured']);
      return { out: U.table(rows[0], rows.slice(1)) };
    }
  });
  R({
    views: ['*'], pat: 'display ipv6 neighbors', global: true, seq: 'monitor',
    help: '显示 IPv6 邻居表（ND 缓存）',
    run: function (c) {
      // ND 缓存由转发引擎在解析下一跳时学习（Sim.learnNd6），与 IPv4 ARP 表对称
      var rows = [];
      Object.keys(c.dev.rt.nd6 || {}).forEach(function (ip) {
        var e = c.dev.rt.nd6[ip];
        rows.push([U.ipv6Compress(ip), U.macFmt(e.mac), e.state || 'REACH', fullName(e.iface || '-')]);
      });
      if (!rows.length) {
        return { out: '  Type: S-Static   D-Dynamic\nNo IPv6 neighbor entry found.\n(提示：先执行 ping6 / tracert6 触发邻居发现)' };
      }
      rows.sort(function (a, b) { return a[0].localeCompare(b[0]); });
      return { out: '  Type: S-Static   D-Dynamic\n' +
        U.table(['IPv6 Address', 'Link-layer Address', 'State', 'Interface'], rows) };
    }
  });


  /* ==================== 路由协议 ==================== */
  R({
    views: ['*'], pat: 'display ospf peer', global: true, seq: 'monitor',
    help: '显示 OSPF 邻居信息',
    run: function (c) {
      var o = c.dev.cfg.ospf;
      if (!o.enable) return { out: '                  OSPF Process 1 with Router ID 0.0.0.0\n                        Neighbor Brief Information\n\n Area: 0.0.0.0        \n Router ID       Address         Pri Dead-Time  State             Interface\n' };
      var nbs = Sim().neighbors(c.dev, 'ospf');
      var seen = {};
      var rows = nbs.filter(function (n) {
        var k = n.peerDev.id + n.peerIp + n.localIf;
        if (seen[k]) return false; seen[k] = 1; return true;
      }).map(function (n) {
        var rid = n.peerDev.cfg.ospf.routerId || (n.peerDev.rt.rid || (n.peerDev.rt.rid = U.int2ip(stable(n.peerDev.id + 'rid', 4294967295))));
        return [String(rid), n.peerIp, String(n.peerDev.cfg.ospf.drPriority || 1), String(n.peerDev.cfg.ospf.deadTime || 40), 'Full/' + (n.peerDev.id > c.dev.id ? 'DR' : 'BDR'), fullName(n.localIf)];
      });
      return {
        out: '                  OSPF Process ' + o.process + ' with Router ID ' + (o.routerId || '0.0.0.0') +
          '\n                        Neighbor Brief Information\n\n Area: ' + (Object.keys(o.areas)[0] || '0.0.0.0') + '        \n' +
          ' Router ID       Address         Pri Dead-Time  State             Interface\n' +
          (rows.length ? rows.map(function (r) {
            return ' ' + U.padR(r[0], 16) + U.padR(r[1], 16) + U.padR(r[2], 4) + U.padR(r[3], 13) + U.padR(r[4], 18) + r[5];
          }).join('\n') : '')
      };
    }
  });
  R({
    views: ['*'], pat: 'display ospf interface', global: true, seq: 'monitor',
    help: '显示 OSPF 接口信息',
    run: function (c) {
      var o = c.dev.cfg.ospf;
      if (!o.enable) return { out: 'OSPF is not enabled.' };
      var rows = [];
      Sim().l3Ifaces(c.dev).forEach(function (i) {
        if (!i.f.ip) return;
        var cfg = null;
        (o.networks || []).forEach(function (n) {
          var len = U.maskLen(n.mask);
          if (len != null && U.inNet(i.f.ip.addr, n.addr, len)) cfg = n;
        });
        if (!cfg) return;
        rows.push([fullName(i.name), i.f.ip.addr, cfg.area || '0.0.0.0', 'Broadcast', String(i.up ? 1 : 0), String(o.helloTime || 10), String(i.up ? 4 : 0)]);
      });
      return { out: U.table(['Interface', 'IP Address', 'Area', 'Type', 'Nbrs', 'Hello', 'Cost'], rows) };
    }
  });
  R({
    views: ['*'], pat: 'display ospf routing', global: true, seq: 'monitor',
    help: '显示 OSPF 路由信息',
    run: function (c) {
      var list = Sim().routesOf(c.dev).filter(function (r) { return /^OSPF|^O_/.test(r.proto); });
      if (!list.length) return { out: 'No OSPF route.' };
      return { out: 'Destination/Mask   Proto   Pre Cost        NextHop         Interface\n' + list.map(routeRow).join('\n') };
    }
  });
  R({
    views: ['*'], pat: 'display ospf brief', global: true, seq: 'monitor',
    help: '显示 OSPF 摘要信息',
    run: function (c) {
      var o = c.dev.cfg.ospf;
      return {
        out: [
          '          OSPF Process ' + o.process + ' with Router ID ' + (o.routerId || '0.0.0.0'),
          '                  OSPF Protocol Information',
          '',
          ' RouterID: ' + (o.routerId || '0.0.0.0') + '   Border Router:',
          ' Multiple VPN-instance is not enabled',
          ' Spf-schedule-interval: 5s',
          ' Default ASE parameters: Metric: 1 Tag: 1 Type: 2',
          ' Route Preference: 10',
          ' ASE Route Preference: 150',
          ' SPF computation count: ' + stable(c.dev.id, 100),
          ' Area Count: ' + Object.keys(o.areas || {}).length + '   Nssa Area Count: 0',
          ' BFD is not enabled'
        ].join('\n')
      };
    }
  });
  R({
    views: ['*'], pat: 'display rip', global: true, seq: 'monitor',
    help: '显示 RIP 进程信息',
    run: function (c) {
      var r = c.dev.cfg.rip;
      if (!r.enable) return { out: 'RIP is not enabled.' };
      return {
        out: ' RIP process : ' + r.process +
          '\n       RIP version : ' + r.version +
          '\n       RIP router-id : ' + (c.dev.cfg.rip.routerId || '0.0.0.0') +
          '\n       Default cost : 0' +
          '\n       Maximum number of balanced paths : 8' +
          '\n       Update time   :   30 sec(s)  Timeout time         :  180 sec(s)' +
          '\n       Suppress time :  120 sec(s)  Garbage-Collect time :  120 sec(s)' +
          '\n       Update output delay :   20(ms)  Output count :   3' +
          '\n       BFD: Disabled' +
          '\n       Silent interfaces : ' + ((r.passive || []).join(', ') || 'None') +
          '\n       Default route : ' + (r.defaultOrig ? 'Enabled' : 'Disabled') +
          '\n       Verify-source : Enabled' +
          '\n       Networks : \n       ' + ((r.networks || []).map(function (n) { return n.addr; }).join('    ') || 'None')
      };
    }
  });
  R({
    views: ['*'], pat: 'display rip database', global: true, seq: 'monitor',
    help: '显示 RIP 数据库',
    run: function (c) {
      var list = Sim().routesOf(c.dev).filter(function (r) { return r.proto === 'RIP'; });
      if (!list.length) return { out: 'RIP database is empty.' };
      return { out: U.table(['Destination/Mask', 'Proto', 'Cost', 'NextHop', 'Interface'], list.map(function (r) { return [r.dest + '/' + r.mask, 'RIP', String(r.cost), r.nexthop || '-', r.oif ? fullName(r.oif) : '--']; })) };
    }
  });
  R({
    views: ['*'], pat: 'display bgp peer', global: true, seq: 'monitor',
    help: '显示 BGP 对等体信息',
    run: function (c) {
      var b = c.dev.cfg.bgp;
      if (!b.enable) return { out: 'BGP is not enabled.' };
      var rows = (b.peers || []).map(function (p) {
        var owner = Sim().findOwner(p.addr);
        var st = (owner && Sim().lookupRoute(c.dev, p.addr)) ? 'Established' : 'Idle';
        return [p.addr, String(p.as), st, p.connectIf ? fullName(p.connectIf) : '--'];
      });
      if (!rows.length) return { out: ' BGP local router ID: ' + (b.routerId || '0.0.0.0') + '\n Local AS number: ' + b.as + '\n Total number of peers: 0\t\tPeers in established state: 0' };
      return { out: ' BGP local router ID: ' + (b.routerId || '0.0.0.0') + '\n Local AS number: ' + b.as + '\n Total number of peers: ' + rows.length + '\n' + U.table(['Peer', 'AS', 'State', 'Connect Interface'], rows) };
    }
  });
  R({
    views: ['*'], pat: 'display bgp routing-table', global: true, seq: 'monitor',
    help: '显示 BGP 路由表',
    run: function (c) {
      var list = Sim().routesOf(c.dev).filter(function (r) { return r.proto === 'BGP'; });
      if (!list.length) return { out: 'BGP routing table is empty.' };
      return { out: U.table(['Network', 'NextHop', 'MED', 'LocPrf', 'Path/Ogn'], list.map(function (r) { return [r.dest + '/' + r.mask, r.nexthop || '0.0.0.0', '0', '100', 'i']; })) };
    }
  });

  /* ==================== IS-IS ==================== */
  R({
    views: ['*'], pat: 'display isis peer', global: true, seq: 'monitor',
    help: '显示 IS-IS 邻居信息',
    run: function (c) {
      var is = c.dev.cfg.isis;
      if (!is.enable) return { out: 'IS-IS Process ' + (is.process || 1) + ' is not enabled.' };
      var nbs = Sim().neighbors(c.dev, 'isis');
      if (!nbs.length) return { out: 'IS-IS Process ' + (is.process || 1) + ': No neighbor.' };
      var rows = nbs.map(function (n) {
        return [String(n.peerDev.cfg.hostname || n.peerDev.name || n.peerDev.id), n.peerIp, fullName(n.localIf), (n.peerDev.cfg.isis.level || 'level-1-2'), 'Up'];
      });
      return { out: 'IS-IS Process ' + (is.process || 1) + ' neighbor(s):\n' + U.table(['System ID', 'IP Address', 'Interface', 'Level', 'State'], rows) };
    }
  });
  R({
    views: ['*'], pat: 'display isis route', global: true, seq: 'monitor',
    help: '显示 IS-IS 路由信息',
    run: function (c) {
      var list = Sim().routesOf(c.dev).filter(function (r) { return r.proto === 'ISIS' || r.proto === 'IS_ASE'; });
      if (!list.length) return { out: 'No IS-IS route.' };
      return { out: 'Destination/Mask   Proto   Pre Cost        NextHop         Interface\n' + list.map(routeRow).join('\n') };
    }
  });
  R({
    views: ['*'], pat: 'display isis brief', global: true, seq: 'monitor',
    help: '显示 IS-IS 摘要信息',
    run: function (c) {
      var is = c.dev.cfg.isis;
      return {
        out: [
          '                        IS-IS Process ' + (is.process || 1) + ' with System ID ' + (is.net || '0000.0000.0000'),
          '                        IS-IS Protocol Information',
          ' SysID Length: 6   Maximum Area Address: 3',
          ' IS-Level: ' + (is.level || 'level-1-2'),
          ' Cost-Style: narrow         Preference: 15'
        ].join('\n')
      };
    }
  });

  /* ==================== 路由策略 / 地址前缀列表 ==================== */
  R({
    views: ['*'], pat: 'display route-policy', global: true, seq: 'monitor',
    help: '显示所有 Route-Policy',
    run: function (c) {
      var pols = c.dev.cfg.routePolicies || [];
      if (!pols.length) return { out: 'No route-policy is configured.' };
      var rows = pols.map(function (r) {
        var m = [], a = [];
        if (r.match && r.match.acl != null) m.push('acl ' + r.match.acl);
        if (r.match && r.match.ipPrefix) m.push('ip-prefix ' + r.match.ipPrefix);
        if (r.apply && r.apply.cost != null) a.push('cost ' + r.apply.cost);
        if (r.apply && r.apply.preference != null) a.push('preference ' + r.apply.preference);
        if (r.apply && r.apply.tag != null) a.push('tag ' + r.apply.tag);
        if (r.apply && r.apply.nextHop) a.push('next-hop ' + r.apply.nextHop);
        return [r.name, String(r.node), r.action, m.join('; ') || '-', a.join('; ') || '-'];
      });
      return { out: U.table(['Policy', 'Node', 'Action', 'Match', 'Apply'], rows) };
    }
  });
  R({
    views: ['*'], pat: 'display route-policy <word>', global: true, seq: 'monitor',
    help: '显示指定 Route-Policy',
    run: function (c) {
      var pols = (c.dev.cfg.routePolicies || []).filter(function (r) { return r.name === c.args.word; });
      if (!pols.length) return { out: 'Route-policy ' + c.args.word + ' does not exist.' };
      var rows = pols.map(function (r) {
        var m = [], a = [];
        if (r.match && r.match.acl != null) m.push('acl ' + r.match.acl);
        if (r.match && r.match.ipPrefix) m.push('ip-prefix ' + r.match.ipPrefix);
        if (r.apply && r.apply.cost != null) a.push('cost ' + r.apply.cost);
        if (r.apply && r.apply.preference != null) a.push('preference ' + r.apply.preference);
        if (r.apply && r.apply.tag != null) a.push('tag ' + r.apply.tag);
        if (r.apply && r.apply.nextHop) a.push('next-hop ' + r.apply.nextHop);
        return [String(r.node), r.action, m.join('; '), a.join('; ')];
      });
      return { out: 'Route-policy : ' + c.args.word + '\n' + U.table(['Node', 'Action', 'Match', 'Apply'], rows) };
    }
  });
  R({
    views: ['*'], pat: 'display ip ip-prefix', global: true, seq: 'monitor',
    help: '显示所有地址前缀列表',
    run: function (c) {
      var list = c.dev.cfg.ipPrefix || [];
      if (!list.length) return { out: 'No ip-prefix list is configured.' };
      return { out: U.table(['Prefix-name', 'Index', 'Action', 'Address/Mask'], list.map(function (p) { return [p.name, String(p.index), p.action, p.addr + '/' + p.len]; })) };
    }
  });
  R({
    views: ['*'], pat: 'display ip ip-prefix <word>', global: true, seq: 'monitor',
    help: '显示指定地址前缀列表',
    run: function (c) {
      var list = (c.dev.cfg.ipPrefix || []).filter(function (p) { return p.name === c.args.word; });
      if (!list.length) return { out: 'The ip-prefix list ' + c.args.word + ' does not exist.' };
      return { out: 'Prefix: ' + c.args.word + '\n' + U.table(['Index', 'Action', 'Address/Mask'], list.map(function (p) { return [String(p.index), p.action, p.addr + '/' + p.len]; })) };
    }
  });

  /* ==================== ACL / QoS ==================== */
  R({
    views: ['*'], pat: 'display acl all', global: true, seq: 'monitor',
    help: '显示所有 ACL 配置',
    run: function (c) { return { out: aclDump(c.dev) }; }
  });
  R({
    views: ['*'], pat: 'display acl <acl>', global: true, seq: 'monitor',
    help: '显示指定 ACL 配置',
    run: function (c) {
      var a = c.dev.cfg.acl[c.args.acl];
      if (!a) return { out: 'The ACL does not exist.' };
      return { out: aclOne(a) };
    }
  });
  function aclOne(a) {
    var t = a.type === 'basic' ? 'Basic IPv4 ACL' : a.type === 'advanced' ? 'Advanced IPv4 ACL' : 'MAC ACL';
    var s = t + ' ' + a.id + ', ' + a.rules.length + ' rules,\nACL\'s step is ' + (a.step || 5) + '\n';
    a.rules.forEach(function (r) {
      var ln = ' rule ' + r.id + ' ' + r.action;
      if (r.proto) ln += ' ' + r.proto;
      if (r.srcAddr != null) ln += ' source ' + r.srcAddr + ' ' + (r.srcWild || '0.0.0.0');
      if (r.dstAddr != null) ln += ' destination ' + r.dstAddr + ' ' + (r.dstWild || '0.0.0.0');
      if (r.dstPort != null) ln += ' destination-port ' + r.dstOp + ' ' + r.dstPort + (r.dstPort2 != null ? ' ' + r.dstPort2 : '');
      if (r.srcMac) ln += ' source-mac ' + r.srcMac;
      s += ln + '\n';
    });
    return s;
  }
  function aclDump(dev) {
    var ks = Object.keys(dev.cfg.acl).sort(function (a, b) { return a - b; });
    if (!ks.length) return 'No ACL is configured.';
    return ks.map(function (k) { return aclOne(dev.cfg.acl[k]); }).join('\n');
  }
  R({
    views: ['*'], pat: 'display packet-filter', global: true, seq: 'monitor',
    help: '显示接口上的报文过滤应用情况',
    run: function (c) {
      var rows = [];
      Object.keys(c.dev.cfg.ifaces).forEach(function (n) {
        var f = c.dev.cfg.ifaces[n];
        if (f.aclIn) rows.push([fullName(n), 'Inbound', String(f.aclIn), c.dev.cfg.acl[f.aclIn] ? (c.dev.cfg.acl[f.aclIn].type === 'basic' ? 'Basic' : 'Advanced') : '-']);
        if (f.aclOut) rows.push([fullName(n), 'Outbound', String(f.aclOut), c.dev.cfg.acl[f.aclOut] ? (c.dev.cfg.acl[f.aclOut].type === 'basic' ? 'Basic' : 'Advanced') : '-']);
      });
      if (!rows.length) return { out: 'No packet filter is applied.' };
      return { out: U.table(['Interface', 'Direction', 'Acl', 'Type'], rows) };
    }
  });
  R({
    views: ['*'], pat: 'display qos policy interface <ifname>', global: true, seq: 'monitor',
    help: '显示接口上的 QoS 策略应用',
    run: function (c) {
      var n = U.ifShort(c.args.ifname);
      var f = c.dev.cfg.ifaces[n]; if (!f) return { out: 'Error: The interface does not exist.', err: true };
      if (!f.qos.policy) return { out: 'Interface: ' + fullName(n) + '\n  Direction: Inbound\n  Policy: None' };
      var p = c.dev.cfg.qos.policy[f.qos.policy.name];
      return {
        out: 'Interface: ' + fullName(n) + '\n  Direction: ' + (f.qos.policy.dir === 'inbound' ? 'Inbound' : 'Outbound') +
          '\n  Policy: ' + f.qos.policy.name +
          '\n   Classifier: ' + (p ? p.binds.map(function (b) { return b.classifier; }).join(', ') : '-') +
          '\n     Behavior: ' + (p ? p.binds.map(function (b) { return b.behavior; }).join(', ') : '-')
      };
    }
  });
  R({
    views: ['*'], pat: 'display qos policy', global: true, seq: 'monitor',
    help: '显示 QoS 策略配置',
    run: function (c) {
      var ps = Object.keys(c.dev.cfg.qos.policy);
      if (!ps.length) return { out: 'No QoS policy is configured.' };
      return {
        out: ps.map(function (k) {
          var p = c.dev.cfg.qos.policy[k];
          return 'QoS Policy: ' + k + '\n' + p.binds.map(function (b) {
            return '  Classifier: ' + b.classifier + '\n    Behavior: ' + b.behavior;
          }).join('\n');
        }).join('\n')
      };
    }
  });

  /* ==================== NAT 地址转换 ==================== */
  R({
    views: ['*'], pat: 'display nat session', global: true, seq: 'monitor',
    help: '显示 NAT 转换会话表',
    run: function (c) {
      var sess = Sim().natSessionsOf(c.dev);
      if (!sess.length) return { out: 'No NAT session is active.' };
      var rows = sess.map(function (s) {
        return [U.padR(s.proto || 'ip', 5), U.padR(s.orig, 16), '---', U.padR(s.ts, 16), '---'];
      });
      return { out: 'NAT Sessions:\n' + U.table(['Proto', 'Original Src', '=>', 'Translated Src', 'State'], rows) };
    }
  });
  R({
    views: ['*'], pat: 'display nat outbound', global: true, seq: 'monitor',
    help: '显示接口 NAT Outbound 配置',
    run: function (c) {
      var rows = [];
      Object.keys(c.dev.cfg.ifaces).forEach(function (n) {
        var f = c.dev.cfg.ifaces[n];
        if (f.natOutbound) {
          var no = f.natOutbound;
          var desc = no.group == null ? ('Easy-IP (egress ' + (f.ip ? f.ip.addr : '-') + ')')
            : (no.noPat ? 'NO-PAT pool ' + no.group : 'NAPT pool ' + no.group);
          rows.push([fullName(n), String(no.acl), desc]);
        }
      });
      if (!rows.length) return { out: 'No NAT Outbound is configured.' };
      return { out: U.table(['Interface', 'ACL', 'Type'], rows) };
    }
  });
  R({
    views: ['*'], pat: 'display nat server', global: true, seq: 'monitor',
    help: '显示内部服务器映射（nat server）',
    run: function (c) {
      var rows = [];
      Object.keys(c.dev.cfg.ifaces).forEach(function (n) {
        var f = c.dev.cfg.ifaces[n];
        if (f.natServer) f.natServer.forEach(function (s) {
          rows.push([fullName(n), s.proto.toUpperCase(), s.gip + ':' + s.gport, s.lip + ':' + s.lport]);
        });
      });
      if (!rows.length) return { out: 'No NAT Server is configured.' };
      return { out: U.table(['Interface', 'Proto', 'Global', 'Inside'], rows) };
    }
  });
  R({
    views: ['*'], pat: 'display nat address-group', global: true, seq: 'monitor',
    help: '显示 NAT 地址池',
    run: function (c) {
      var g = c.dev.cfg.natGroups || {};
      var ks = Object.keys(g);
      if (!ks.length) return { out: 'No NAT address-group is configured.' };
      return { out: U.table(['Group', 'Start', 'End'], ks.map(function (k) { return [k, g[k].start, g[k].end]; })) };
    }
  });
  R({
    views: ['*'], pat: 'display nat static', global: true, seq: 'monitor',
    help: '显示静态 NAT 映射',
    run: function (c) {
      var ns = c.dev.cfg.natStatic || [];
      if (!ns.length) return { out: 'No static NAT is configured.' };
      return { out: U.table(['Local', 'Global'], ns.map(function (s) { return [s.local, s.global]; })) };
    }
  });
  R({
    views: ['*'], pat: 'display traffic classifier', global: true, hidden: true, seq: 'monitor',
    help: '显示流分类', run: function (c) {
      var ks = Object.keys(c.dev.cfg.qos.class);
      if (!ks.length) return { out: 'No traffic classifier is configured.' };
      return { out: ks.map(function (k) { var x = c.dev.cfg.qos.class[k]; return 'Classifier: ' + k + '\n  Operator: ' + x.operator + '\n' + x.matches.map(function (m) { return '  if-match ' + m.type + ' ' + (m.value != null ? m.value : ''); }).join('\n'); }).join('\n') };
    }
  });
  R({
    views: ['*'], pat: 'display traffic behavior', global: true, hidden: true, seq: 'monitor',
    help: '显示流行为', run: function (c) {
      var ks = Object.keys(c.dev.cfg.qos.behavior);
      if (!ks.length) return { out: 'No traffic behavior is configured.' };
      return { out: ks.map(function (k) { var x = c.dev.cfg.qos.behavior[k]; return 'Behavior: ' + k + '\n' + x.actions.map(function (a) { return '  ' + a.type + (a.value != null ? ' ' + a.value : a.cir != null ? ' ' + a.cir : a.bandwidth != null ? ' ' + a.bandwidth : ''); }).join('\n'); }).join('\n') };
    }
  });

  /* ==================== 链路聚合 / LLDP / 镜像 / VRRP ==================== */
  R({
    views: ['*'], pat: 'display link-aggregation summary', global: true, seq: 'monitor',
    help: '显示链路聚合摘要信息',
    run: function (c) {
      var gs = c.dev.cfg.lag;
      var ks = Object.keys(gs);
      if (!ks.length) return { out: 'No link aggregation group.' };
      var rows = ks.map(function (k) {
        var g = gs[k];
        var sel = g.members.filter(function (m) { return Sim().portUp(c.dev, m); });
        return [g.type === 'route' ? 'RAGG' + k : 'BAGG' + k, g.mode === 'dynamic' ? 'Dynamic' : 'Static', g.members.length ? U.vlanListText([]) || 'Shar' : 'None', String(sel.length), String(g.members.length - sel.length), g.members.length ? 'S--' : '---'];
      });
      return {
        out: 'Aggregation Interface Type: BAGG -- Bridge-Aggregation, RAGG -- Route-Aggregation\n' +
          'Loadsharing Type: Shar -- Loadsharing, NonS -- Non-Loadsharing\n' +
          'LAG Status: S -- Static, D -- Dynamic\n' +
          U.table(['AGG Interface', 'Mode', 'Loadsharing', 'Selected', 'Unselected', 'Status'], rows)
      };
    }
  });
  R({
    views: ['*'], pat: 'display link-aggregation verbose', global: true, seq: 'monitor',
    help: '显示链路聚合详细信息',
    run: function (c) {
      var gs = c.dev.cfg.lag;
      var ks = Object.keys(gs);
      if (!ks.length) return { out: 'No link aggregation group.' };
      return {
        out: ks.map(function (k) {
          var g = gs[k];
          var s = 'Loadsharing Type: Shar -- Loadsharing, NonS -- Non-Loadsharing\n';
          s += 'Port Status: S -- Selected, U -- Unselected\n';
          s += 'AGG Interface: ' + (g.type === 'route' ? 'Route-Aggregation' : 'Bridge-Aggregation') + k + '\n';
          s += 'Aggregation Mode: ' + (g.mode === 'dynamic' ? 'Dynamic' : 'Static') + '\n';
          s += 'Port             Status  Priority Oper-Key\n';
          g.members.forEach(function (m) {
            var up = Sim().portUp(c.dev, m);
            s += '  ' + U.padR(fullName(m), 19) + (up ? 'S       ' : 'U       ') + '32768    1\n';
          });
          return s;
        }).join('\n')
      };
    }
  });
  R({
    views: ['*'], pat: 'display lacp system-id', global: true, hidden: true, seq: 'monitor',
    help: '显示 LACP 系统 ID', run: function (c) { return { out: ' Actor System ID: 0x8000, ' + U.macFmt(Sim().bridgeId(c.dev).mac) }; }
  });
  R({
    views: ['*'], pat: 'display lldp neighbor-information', global: true, seq: 'monitor',
    help: '显示 LLDP 邻居信息',
    run: function (c) {
      if (!c.dev.cfg.lldpGlobal) return { out: 'LLDP is not enabled.' };
      var blocks = [];
      c.dev.ports.forEach(function (p) {
        var f = c.dev.cfg.ifaces[p.name];
        if (!f || !f.lldp || !Sim().portPhysUp(c.dev, p.name)) return;
        var peer = S.getPeer(c.dev.id, p.name);
        if (!peer) return;
        var pd = S.getDevice(peer.dev);
        blocks.push([
          'LLDP neighbor-information of port ' + fullName(p.name) + ':',
          '  Chassis ID   : ' + U.macFmt(Sim().bridgeId(pd)),
          '  Port ID      : ' + fullName(peer.port),
          '  System Name  : ' + (pd.cfg.hostname),
          '  System Description : H3C Comware Software, H3C ' + pd.model,
          '  Port Description  : ' + (ifDesc(pd, peer.port) || fullName(peer.port) + ' Interface'),
          '  Time To Live : 120 seconds'
        ].join('\n'));
      });
      return { out: blocks.length ? blocks.join('\n\n') : 'No LLDP neighbor information.' };
    }
  });
  function ifDesc(dev, n) { var f = dev.cfg.ifaces[n]; return f ? f.desc : ''; }
  R({
    views: ['*'], pat: 'display lldp neighbor-information list', global: true, seq: 'monitor',
    help: '显示 LLDP 邻居列表',
    run: function (c) {
      var rows = [];
      c.dev.ports.forEach(function (p) {
        var f = c.dev.cfg.ifaces[p.name];
        if (!f || !f.lldp || !Sim().portPhysUp(c.dev, p.name)) return;
        var peer = S.getPeer(c.dev.id, p.name); if (!peer) return;
        var pd = S.getDevice(peer.dev); if (!pd) return;
        rows.push([fullName(p.name), String(pd.cfg.hostname), fullName(peer.port), 'B', '120']);
      });
      if (!rows.length) return { out: 'No LLDP neighbor information.' };
      return { out: U.table(['Local Interface', 'System Name', 'Remote Interface', 'Type', 'TTL'], rows) };
    }
  });
  R({
    views: ['*'], pat: 'display mirroring-group all', global: true, seq: 'monitor',
    help: '显示镜像组配置',
    run: function (c) {
      var gs = c.dev.cfg.mirroring.groups;
      var ks = Object.keys(gs);
      if (!ks.length) return { out: 'No mirroring group is configured.' };
      return {
        out: ks.map(function (k) {
          var g = gs[k];
          return 'Mirroring group ' + k + ':\n    Type: ' + (g.type || 'Local') +
            '\n    Status: Active\n    Mirroring port:\n' +
            (g.sources.length ? g.sources.map(function (s) { return '        ' + fullName(s.port) + '  ' + s.dir; }).join('\n') : '        None') +
            '\n    Monitor port: ' + (g.monitor ? fullName(g.monitor) : 'None');
        }).join('\n')
      };
    }
  });
  R({
    views: ['*'], pat: 'display vrrp', global: true, seq: 'monitor',
    help: '显示 VRRP 备份组信息',
    run: function (c) {
      Sim().electVrrp();
      var rows = [];
      Object.keys(c.dev.cfg.ifaces).forEach(function (n) {
        (c.dev.cfg.ifaces[n].vrrp || []).forEach(function (v) {
          var mac = '0000-5e00-01' + ('0' + Number(v.vrid).toString(16)).slice(-2);
          rows.push([fullName(n), String(v.vrid), (v.state || 'Initialize'), String(v.priority || 100), String(v.adv || 100), 'None', v.vip, (v.masterIp || '-'), mac]);
        });
      });
      if (!rows.length) return { out: 'No virtual router is configured.' };
      return { out: 'IPv4 Virtual Router Information:\n Running Mode       : Standard\n Total number of virtual routers : ' + rows.length + '\n' + U.table(['Interface', 'VRID', 'State', 'Running Pri', 'Adver. Timer', 'Auth Type', 'Virtual IP', 'Master IP', 'Virtual MAC'], rows) };
    }
  });
  R({
    views: ['*'], pat: 'display vrrp brief', global: true, hidden: true, seq: 'monitor',
    help: '显示 VRRP 摘要', run: function (c) { return { out: 'Use "display vrrp" for details.' }; }
  });

  /* ==================== DHCP / DNS / SNMP / NTP / 日志 ==================== */
  R({
    views: ['*'], pat: 'display dhcp server pool', global: true, seq: 'monitor',
    help: '显示 DHCP 地址池信息',
    run: function (c) {
      var ps = c.dev.cfg.dhcp.pools;
      if (!ps.length) return { out: 'No DHCP address pool.' };
      return {
        out: ps.map(function (p) {
          return 'Pool name: ' + p.name + '\n  Network: ' + (p.network || '-') + ' mask: ' + (p.mask || '-') +
            '\n  Gateway: ' + (p.gateway || '-') + '\n  DNS: ' + ((p.dns || []).join(', ') || '-') +
            '\n  Lease: ' + (p.lease || '-');
        }).join('\n')
      };
    }
  });
  R({
    views: ['*'], pat: 'display dhcp server ip-in-use', global: true, seq: 'monitor',
    help: '显示已分配的 DHCP 地址',
    run: function (c) {
      var rows = [];
      S.devices.forEach(function (d) {
        Object.keys(d.cfg.ifaces || {}).forEach(function (n) {
          var f = d.cfg.ifaces[n];
          if (f.dhcpMode === 'relay' || !f.ip) return;
          if (f.dhcpAllocated) rows.push([f.ip.addr, U.macFmt(Sim().bridgeId(d)), String(100 + stable(f.ip.addr, 900)), d.cfg.hostname]);
        });
      });
      if (!rows.length) return { out: 'No IP address is in use.' };
      return { out: U.table(['IP address', 'Client identifier/Hardware address', 'Lease expiration', 'Client Name'], rows) };
    }
  });
  R({
    views: ['*'], pat: 'display dhcp client', global: true, seq: 'monitor',
    help: '显示 DHCP 客户端信息',
    run: function (c) {
      var rows = [];
      Object.keys(c.dev.cfg.ifaces || {}).forEach(function (n) {
        var f = c.dev.cfg.ifaces[n];
        if (f.ip) rows.push([fullName(n), f.ip.addr, f.ip.mask, String(U.maskLen(f.ip.mask)), c.dev.cfg.defaultRoute || '-']);
      });
      return { out: U.table(['Interface', 'IP address', 'Subnet mask', 'Mask length', 'Gateway'], rows) };
    }
  });
  R({
    views: ['*'], pat: 'display dns server', global: true, seq: 'monitor',
    help: '显示 DNS 服务器配置',
    run: function (c) {
      var d = c.dev.cfg.dns;
      return { out: 'Type: D-Dynamic   S-Static\n' + ((d.servers || []).length ? d.servers.map(function (s) { return s + '  S'; }).join('\n') : 'No DNS server is configured.') + '\nDomain name: ' + (d.domain || '-') + '\nDNS proxy: ' + (d.proxy ? 'Enabled' : 'Disabled') };
    }
  });
  R({
    views: ['*'], pat: 'display snmp-agent sys-info', global: true, seq: 'monitor',
    help: '显示 SNMP 系统信息',
    run: function (c) {
      var s = c.dev.cfg.snmp;
      return {
        out: '   The SNMP agent is ' + (s.enable ? 'enabled' : 'disabled') +
          '\n   SNMP version: ' + (s.version || 'v2c') +
          '\n   The contact person for this managed node: ' + (s.contact || 'Hangzhou H3C Tech. Co., Ltd.') +
          '\n   The physical location of this node: ' + (s.location || 'Hangzhou China') +
          '\n   SNMP read community: ' + (s.community.ro || '-') +
          '\n   SNMP write community: ' + (s.community.rw || '-') +
          '\n   Trap host count: ' + (s.trapHosts || []).length
      };
    }
  });
  R({
    views: ['*'], pat: 'display snmp-agent community', global: true, hidden: true, seq: 'monitor',
    help: '显示 SNMP 团体名', run: function (c) { return { out: 'Community name: ' + c.dev.cfg.snmp.community.ro + '\n    Group name: public\n    Storage-type: nonVolatile\nCommunity name: ' + c.dev.cfg.snmp.community.rw }; }
  });
  R({
    views: ['*'], pat: 'display ntp-service status', global: true, seq: 'monitor',
    help: '显示 NTP 服务状态',
    run: function (c) {
      var n = c.dev.cfg.ntp;
      return { out: ' Clock status: ' + (n.enable ? 'synchronized' : 'unsynchronized') + '\n Clock stratum: ' + (n.master ? n.stratum : (n.servers.length ? n.stratum + 1 : 16)) + '\n Reference clock ID: ' + (n.servers[0] || '0.0.0.0') + '\n NTP server mode: ' + (n.master ? 'master' : 'client') };
    }
  });
  R({
    views: ['*'], pat: 'display ntp-service sessions', global: true, hidden: true, seq: 'monitor',
    help: '显示 NTP 会话', run: function (c) { return { out: 'source        reference       stra reach poll  now offset  delay disper\n********************************************************************************\n[' + (c.dev.cfg.ntp.servers[0] || '-') + ']  ' + (c.dev.cfg.ntp.servers[0] || '0.0.0.0') + '    2    255   64    -   0.0    0.0   0.0' }; }
  });
  R({
    views: ['*'], pat: 'display logbuffer', global: true, seq: 'monitor',
    help: '显示日志缓冲区内容',
    run: function (c) {
      var logs = c.dev.rt.logs || [];
      if (!logs.length) {
        return { out: 'Log buffer: ' + (c.dev.cfg.syslog.enable ? 'Enabled' : 'Disabled') + '\nMaximal buffer size: ' + c.dev.cfg.syslog.logbuffer.size + '\nActual buffer size: 512\nBuffered messages: 0\n\nNo log messages.' };
      }
      return { out: 'Log buffer: Enabled\nBuffered messages: ' + logs.length + '\n\n' + logs.join('\n') };
    }
  });
  R({
    views: ['*'], pat: 'display info-center', global: true, seq: 'monitor',
    help: '显示信息中心配置',
    run: function (c) {
      var s = c.dev.cfg.syslog;
      return { out: 'Information Center: ' + (c.dev.cfg.infoCenter ? 'enabled' : 'disabled') + '\nLog host: ' + ((s.hosts || []).join(', ') || 'not configured') + '\nConsole: enabled\nLog buffer: enabled (size ' + s.logbuffer.size + ')' };
    }
  });
  R({
    views: ['*'], pat: 'display port-security', global: true, seq: 'monitor',
    help: '显示端口安全配置',
    run: function (c) {
      var rows = [];
      Object.keys(c.dev.cfg.ifaces).forEach(function (n) {
        var f = c.dev.cfg.ifaces[n];
        if (f.portSecurity.enable) rows.push([fullName(n), String(f.portSecurity.max), f.portSecurity.mode, f.portSecurity.intrusion || 'restrict', f.portSecurity.sticky ? 'Enabled' : 'Disabled']);
      });
      if (!rows.length) return { out: 'Port security is not enabled on any port.' };
      return { out: U.table(['Interface', 'MaxMAC', 'Mode', 'Intrusion', 'Sticky'], rows) };
    }
  });
  R({
    views: ['*'], pat: 'display dot1x', global: true, seq: 'monitor',
    help: '显示 802.1X 配置与状态',
    run: function (c) {
      var rows = [];
      Object.keys(c.dev.cfg.ifaces).forEach(function (n) {
        var f = c.dev.cfg.ifaces[n];
        if (f.dot1x.enable) rows.push([fullName(n), f.dot1x.method || 'macbased', '0', 'Disabled']);
      });
      var s = ' Global 802.1X protocol: ' + (c.dev.cfg.dot1xGlobal ? 'Enabled' : 'Disabled') + '\n';
      if (!rows.length) return { out: s + ' No port has 802.1X enabled.' };
      return { out: s + U.table(['Interface', 'Port-method', 'Online Users', 'Auth Success'], rows) };
    }
  });
  R({
    views: ['*'], pat: 'display irf', global: true, seq: 'monitor',
    help: '显示 IRF 配置信息',
    run: function (c) {
      var i = c.dev.cfg.irf;
      return { out: 'MemberID  Role    Priority  CPU-Mac         Description\n *+' + (i.member || 1) + '      ' + (i.priority >= 100 ? 'Master' : 'Slave') + '    ' + i.priority + '        ' + U.macFmt(Sim().bridgeId(c.dev)) + '   ---\n--------------------------------------------------\n * indicates the device is the master.\n + indicates the device through which the user logs in.\n\n IRF domain: ' + i.domain + '\n IRF mode: normal' };
    }
  });
  R({
    views: ['*'], pat: 'display diagnostic-information', global: true, seq: 'monitor',
    help: '显示诊断信息（配置 + 状态汇总）',
    run: function (c) {
      return { out: '================ Diagnostics ================\n' + H.Config.render(c.dev) + '\n================ End ================' };
    }
  });

  /* ==================== ping / tracert ==================== */
  R({
    views: ['*'], pat: 'ping <host>', global: true, seq: 'diag',
    help: '测试到目的主机（IPv4 地址/主机名）的连通性',
    run: function (c) {
      var r = Sim().ping(c.dev, c.args.host, {});
      return { out: r.out, refresh: false };
    }
  });
  R({
    views: ['*'], pat: 'ping -c <int> <host>', global: true, seq: 'diag',
    help: '指定发包数量测试连通性',
    run: function (c) {
      var r = Sim().ping(c.dev, c.args.host, { count: parseInt(c.args._1, 10) });
      return { out: r.out, refresh: false };
    }
  });
  R({
    views: ['*'], pat: 'ping -a <ip> <host>', global: true, seq: 'diag',
    help: '指定源地址测试连通性',
    run: function (c) {
      var r = Sim().ping(c.dev, c.args.host, { src: c.args._1 });
      return { out: r.out, refresh: false };
    }
  });
  R({
    views: ['*'], pat: 'ping -s <int> <host>', global: true, hidden: true, seq: 'diag',
    help: '指定报文长度', run: function (c) { return { out: Sim().ping(c.dev, c.args.host, { size: parseInt(c.args._1, 10) }).out, refresh: false }; }
  });
  R({
    views: ['*'], pat: 'ping ipv6 <word>', global: true, hidden: true, seq: 'diag',
    help: '测试 IPv6 连通性', run: function (c) {
      var r = Sim().ping6(c.dev, c.args.word, {});
      return { out: r.out, refresh: false };
    }
  });
  R({
    views: ['*'], pat: 'tracert <host>', global: true, seq: 'diag',
    help: '跟踪到目的主机（IPv4 地址/主机名）的路径',
    run: function (c) { return { out: Sim().tracert(c.dev, c.args.host, {}).out, refresh: false }; }
  });
  R({
    views: ['*'], pat: 'tracert -a <ip> <host>', global: true, hidden: true, seq: 'diag',
    help: '指定源地址跟踪路径',
    run: function (c) { return { out: Sim().tracert(c.dev, c.args.host, { src: c.args._1 }).out, refresh: false }; }
  });

  /* ==================== 调试与统计 ==================== */
  R({
    views: ['user'], pat: 'debugging <word>', seq: 'diag',
    help: '打开调试开关（示例）',
    run: function (c) {
      c.dev.cfg.debugFlags[c.args.word] = true;
      return { out: 'Debugging for ' + c.args.word + ' is enabled. (Simulated)' };
    }
  });
  R({
    views: ['user'], pat: 'undo debugging all', seq: 'diag',
    help: '关闭所有调试开关',
    run: function (c) { c.dev.cfg.debugFlags = {}; return { out: 'All debugging is disabled.' }; }
  });
  R({
    views: ['user'], pat: 'reset counters interface <ifname>', seq: 'diag',
    help: '清除接口统计信息',
    run: function (c) { return { out: 'Interface statistics are cleared.' }; }
  });
  R({
    views: ['user'], pat: 'reset counters interface', hidden: true, seq: 'diag',
    help: '清除所有接口统计', run: function () { return { out: 'All interface statistics are cleared.' }; }
  });
  R({
    views: ['user'], pat: 'reset mac-address dynamic', seq: 'diag',
    help: '清除动态 MAC 地址表项',
    run: function (c) { c.dev.rt.mac = {}; return { out: '' }; }
  });
  R({
    views: ['user'], pat: 'reset arp dynamic', seq: 'diag',
    help: '清除动态 ARP 表项',
    run: function (c) {
      Object.keys(c.dev.rt.arp).forEach(function (k) { if (c.dev.rt.arp[k].type !== 'static') delete c.dev.rt.arp[k]; });
      return { out: '' };
    }
  });
  R({
    views: ['user'], pat: 'reset ipv6 neighbors', seq: 'diag',
    help: '清除动态 IPv6 邻居表项（ND 缓存）',
    run: function (c) { c.dev.rt.nd6 = {}; return { out: '' }; }
  });
  R({
    views: ['user'], pat: 'reset ospf process', seq: 'diag',
    help: '重启 OSPF 进程',
    run: function (c) { Sim().invalidate(); return { out: 'Reset OSPF process? [Y/N]:y\nThe OSPF process has been reset.' }; }
  });
  R({
    views: ['user'], pat: 'reset rip process', seq: 'diag',
    help: '重启 RIP 进程', run: function (c) { Sim().invalidate(); return { out: 'Reset RIP process? [Y/N]:y' }; }
  });
  R({
    views: ['user'], pat: 'reset bgp all', seq: 'diag',
    help: '重启 BGP 连接', run: function (c) { return { out: 'Reset BGP process? [Y/N]:y' }; }
  });
  R({
    views: ['user'], pat: 'reset ip statistics', hidden: true, seq: 'diag',
    help: '清除 IP 统计信息', run: function () { return { out: 'IP statistics are cleared.' }; }
  });
  R({
    views: ['user'], pat: 'reset stp statistics', hidden: true, seq: 'diag',
    help: '清除 STP 统计信息', run: function () { return { out: 'STP statistics are cleared.' }; }
  });

})(window.H3C);
