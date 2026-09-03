/* H3C 网络仿真实验室 - 非网络设备（PC / 服务器）主机终端
   提供与 Comware 不同的主机风格 CLI：ipconfig / ping / tracert / set ip / arp / route 等 */
(function (H) {
  'use strict';
  var U = H.U;

  function isHost(d) { return d && (d.type === 'pc' || d.type === 'server'); }
  function ifaceOf(d) { return d.ports[0] ? d.cfg.ifaces[d.ports[0].name] : null; }
  function ipOf(d) { var f = ifaceOf(d); return f && f.ip ? f.ip : null; }

  var HELP_TEXT = [
    '可用命令：',
    '  ipconfig [/all]     查看本机 IP 配置（含 MAC 与 IPv6）',
    '  ping <IP/主机>      测试网络连通性',
    '  tracert <IP/主机>   跟踪路由路径',
    '  ping6 <IPv6>        测试 IPv6 网络连通性',
    '  tracert6 <IPv6>     跟踪 IPv6 路由路径',
    '  set ip <IP> <掩码> [网关]     配置网卡 IPv4 与默认网关',
    '  set ipv6 <IPv6/前缀> [网关]    配置网卡 IPv6 与默认网关',
    '  arp -a              查看 ARP 表',
    '  route               查看路由表',
    '  hostname            查看主机名',
    '  cls / clear         清屏',
    '  help                显示本帮助'
  ].join('\n');

  /* 配置网卡 IP（同时置为三层路由口，使仿真转发可正常工作） */
  function applyIp(d, addr, mask, gw) {
    var p = d.ports[0]; if (!p) return false;
    var f = d.cfg.ifaces[p.name]; if (!f) return false;
    f.ip = { addr: addr, mask: mask };
    f.mode = 'route';
    f.adminUp = true;
    d.cfg.defaultRoute = (gw && U.isIp(gw)) ? gw : null;
    return true;
  }

  /* 配置网卡 IPv6 地址（同时置为三层路由口） */
  function applyIpv6(d, addrToken, gw) {
    var p = d.ports[0]; if (!p) return false;
    var f = d.cfg.ifaces[p.name]; if (!f) return false;
    var sp = U.ipv6Split(addrToken);
    if (!sp) return false;
    f.ipv6 = f.ipv6 || [];
    if (!f.ipv6.some(function (x) { return x.addr === sp.addr && x.prefix === sp.prefix; })) f.ipv6.push(sp);
    f.mode = 'route';
    f.adminUp = true;
    d.cfg.ipv6 = true;   // 与设备侧 `ipv6 address` 保持一致：全局 IPv6 已启用
    d.cfg.ipv6DefaultRoute = (gw && U.isIpv6(gw)) ? (U.ipv6NetOf(gw, 128) || gw) : null;
    return true;
  }

  function banner(dev) {
    return [
      'PC 主机终端模拟器 · ' + dev.model,
      '输入 help 查看可用命令；ipconfig 查看网卡配置；ping 测试连通性。',
      ''
    ];
  }

  function ipconfig(dev, all) {
    var p = dev.ports[0];
    var f = p ? dev.cfg.ifaces[p.name] : null;
    var ip = f && f.ip ? f.ip : null;
    var lines = [];
    lines.push('Windows IP 配置 - ' + dev.name);
    lines.push('');
    lines.push('以太网适配器 ' + (p ? p.name : 'Ethernet') + ':');
    lines.push('   连接特定的 DNS 后缀 . . . . . . . :');
    lines.push('   本地链接 IPv6 地址 . . . . . . . . : fe80::' + U.hex(4));
    if (ip) {
      lines.push('   IPv4 地址 . . . . . . . . . . . . : ' + ip.addr);
      lines.push('   子网掩码  . . . . . . . . . . . . : ' + U.lenMask(U.maskLen(ip.mask)));
      if (dev.cfg.defaultRoute) lines.push('   默认网关 . . . . . . . . . . . : ' + dev.cfg.defaultRoute);
    } else {
      lines.push('   自动配置 IPv4 地址  . . . . . . . : 169.254.' + U.rnd(255) + '.' + U.rnd(255));
      lines.push('   子网掩码  . . . . . . . . . . . . : 255.255.0.0');
    }
    var v6 = (f && f.ipv6) ? f.ipv6 : [];
    if (v6.length) {
      v6.forEach(function (a, i) {
        lines.push('   IPv6 地址 ' + (i === 0 ? ' . ' : ' ') + ' . . . . . . . . . . : ' + U.ipv6Compress(a.addr) + '/' + a.prefix);
      });
      if (dev.cfg.ipv6DefaultRoute) lines.push('   默认网关 IPv6 . . . . . . . . . : ' + U.ipv6Compress(dev.cfg.ipv6DefaultRoute));
    }
    if (all) lines.push('   物理地址 . . . . . . . . . . . : ' + U.genMac(dev.id));
    return lines.join('\n');
  }

  function arpTable(dev) {
    var keys = Object.keys(dev.rt.arp || {});
    if (!keys.length) return '未找到 ARP 条目（请先 ping 一次目标）。';
    var out = '接口: ' + (dev.ports[0] ? dev.ports[0].name : '') + '  ---  0x2  Internet 地址        物理地址              类型\n';
    keys.forEach(function (k) {
      var a = dev.rt.arp[k];
      out += '                  ' + U.padR(k, 16) + ' ' + U.macFmt(a.mac || '') + '   动态\n';
    });
    return out;
  }

  function routeTable(dev) {
    var routes = H.Sim.computeRoutes(dev);
    if (!routes.length) return '活动路由表为空。';
    var out = '活动路由表:\n  网络目标            网络掩码            网关                接口\n';
    routes.forEach(function (r) {
      out += '  ' + U.padR(r.dest, 20) + U.padR(U.lenMask(r.mask), 20) +
        U.padR(r.nexthop || '0.0.0.0', 20) + U.padR(r.oif || '', 14) + '\n';
    });
    return out;
  }

  function exec(dev, sess, line) {
    line = String(line || '').replace(/^\s+/, '').replace(/\s+$/, '');
    if (!line) return { out: '' };
    var tokens = line.split(/\s+/);
    var cmd = tokens[0].toLowerCase();

    if (cmd === '?' || cmd === 'help') return { out: HELP_TEXT };
    if (cmd === 'cls' || cmd === 'clear') { sess.buffer = []; return { out: '' }; }
    if (cmd === 'hostname') return { out: dev.name };

    if (cmd === 'ipconfig') return { out: ipconfig(dev, tokens[1] === '/all') };
    if (cmd === 'arp') return { out: arpTable(dev) };
    if (cmd === 'route') return { out: routeTable(dev) };

    if (cmd === 'ping' || cmd === 'tracert' || cmd === 'traceroute') {
      if (!tokens[1]) return { out: '用法: ' + cmd + ' <IP地址或主机名>', err: true };
      var fn = cmd === 'ping' ? H.Sim.ping : H.Sim.tracert;
      var r = fn(dev, tokens[1], {});
      return { out: (typeof r.out === 'string') ? r.out : r.out.join('\n') };
    }
    if (cmd === 'ping6' || cmd === 'tracert6' || cmd === 'traceroute6') {
      if (!tokens[1]) return { out: '用法: ' + cmd + ' <IPv6地址或主机名>', err: true };
      var fn6 = cmd === 'ping6' ? H.Sim.ping6 : H.Sim.tracert6;
      var r6 = fn6(dev, tokens[1], {});
      return { out: (typeof r6.out === 'string') ? r6.out : r6.out.join('\n') };
    }

    if (cmd === 'set') {
      if (tokens[1] === 'ipv6') {
        var a6 = tokens[2], gw6 = tokens[3] || '';
        if (!a6 || !U.ipv6Split(a6)) return { out: '用法: set ipv6 <IPv6地址/前缀> [默认网关]', err: true };
        if (gw6 && !U.isIpv6(gw6)) return { out: '错误的 IPv6 网关: ' + gw6, err: true };
        if (!applyIpv6(dev, a6, gw6)) return { out: '配置失败：' + a6, err: true };
        H.Sim.invalidate();
        H.State.emit('change');
        var sp6 = U.ipv6Split(a6);
        return { out: '已配置 ' + U.ipv6Compress(sp6.addr) + '/' + sp6.prefix + (gw6 ? ('，网关 ' + gw6) : '') };
      }
      if (tokens[1] !== 'ip') return { out: '用法: set ip <IP地址> <子网掩码> [默认网关]', err: true };
      var addr = tokens[2], mask = tokens[3], gw = tokens[4] || '';
      if (!U.isIp(addr) || U.maskLen(mask) == null)
        return { out: '用法: set ip <IP地址> <子网掩码> [默认网关]', err: true };
      applyIp(dev, addr, mask, gw);
      H.Sim.invalidate();
      H.State.emit('change');
      return { out: '已配置 ' + addr + '/' + U.maskLen(mask) + (gw ? ('，网关 ' + gw) : '') };
    }

    return { out: "'" + tokens[0] + "' 不是内部或外部命令，也不是可运行的程序。\n可用命令请输入 help 查看。", err: true };
  }

  function complete(dev, sess, line) {
    var toks = line.split(/\s+/);
    var last = toks[toks.length - 1] || '';
    var cmds = ['ipconfig', 'ping', 'tracert', 'arp', 'route', 'set', 'hostname', 'cls', 'clear', 'help'];
    var arr = cmds.filter(function (c) { return c.indexOf(last.toLowerCase()) === 0; });
    arr.sort();
    if (arr.length === 1) return { type: 'single', value: arr[0] };
    if (arr.length > 1) return { type: 'list', list: arr };
    return { type: 'none' };
  }

  function help(dev, sess, line) { return HELP_TEXT; }
  function promptFor(dev) { return dev.name + '>'; }

  H.Host = {
    isHost: isHost,
    exec: exec,
    complete: complete,
    help: help,
    promptFor: promptFor,
    banner: banner,
    applyIp: applyIp
  };
})(window.H3C);
