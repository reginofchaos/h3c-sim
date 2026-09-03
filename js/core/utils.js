/* H3C 网络仿真实验室 - 基础工具库 */
window.H3C = window.H3C || {};
(function (H) {
  'use strict';

  var U = {};

  /* ---------- 通用 ---------- */
  U.clone = function (o) {
    if (o === null || typeof o !== 'object') return o;
    if (Array.isArray(o)) { var a = []; for (var i = 0; i < o.length; i++) a.push(U.clone(o[i])); return a; }
    var r = {}; for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) r[k] = U.clone(o[k]); return r;
  };
  U.pad = function (s, n, right) {
    s = String(s == null ? '' : s);
    var sp = ''; while (sp.length < n - U.width(s)) sp += ' ';
    return right ? s + sp : sp + s;
  };
  U.padR = function (s, n) { return U.pad(s, n, true); };
  U.width = function (s) {
    s = String(s == null ? '' : s); var w = 0;
    for (var i = 0; i < s.length; i++) { var c = s.charCodeAt(i); w += (c > 0x2E80) ? 2 : 1; }
    return w;
  };
  U.esc = function (s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  };
  U.rnd = function (n) { return Math.floor(Math.random() * n); };
  U.hex = function (n) { var s = ''; for (var i = 0; i < n; i++) s += '0123456789abcdef'[U.rnd(16)]; return s; };

  /* ---------- MAC ---------- */
  U.genMac = function (seed) {
    if (seed != null) {
      var h = 0; for (var i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) & 0xffffff;
      var b = ('000000' + h.toString(16)).slice(-6);
      return ('0' + (h % 2 ? 0x02 : 0x0a).toString(16)).slice(-2) + ':' + b.substr(0, 2) + ':' + b.substr(2, 2) + ':' + b.substr(4, 2) + ':00:01';
    }
    return U.hex(2) + ':' + U.hex(2) + ':' + U.hex(2) + ':' + U.hex(2) + ':' + U.hex(2) + ':' + U.hex(2);
  };
  U.macNorm = function (m) {
    return String(m || '').toLowerCase().replace(/[^0-9a-f]/g, '');
  };
  U.macFmt = function (m) {
    var s = U.macNorm(m); if (s.length !== 12) return m;
    return s.substr(0, 4) + '-' + s.substr(4, 4) + '-' + s.substr(8, 4);
  };

  /* ---------- IPv4 ---------- */
  U.ip2int = function (ip) {
    var p = String(ip || '').split('.'); if (p.length !== 4) return null;
    var v = 0; for (var i = 0; i < 4; i++) { var n = parseInt(p[i], 10); if (isNaN(n) || n < 0 || n > 255) return null; v = v * 256 + n; }
    return v;
  };
  U.int2ip = function (v) {
    v = v >>> 0; return [(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255].join('.');
  };
  U.isIp = function (s) { return U.ip2int(s) !== null && /^\d+\.\d+\.\d+\.\d+$/.test(String(s).trim()); };
  U.maskLen = function (m) {
    if (m == null) return null;
    if (/^\d+$/.test(String(m))) { var n = parseInt(m, 10); return (n >= 0 && n <= 32) ? n : null; }
    var v = U.ip2int(m); if (v === null) return null;
    var len = 0, seen = false;
    for (var i = 31; i >= 0; i--) {
      var bit = (v >>> i) & 1;
      if (bit) { if (seen) return null; len++; } else seen = true;
    }
    return len;
  };
  U.lenMask = function (n) {
    n = parseInt(n, 10); if (isNaN(n) || n < 0 || n > 32) return null;
    if (n === 0) return '0.0.0.0';
    return U.int2ip((0xffffffff << (32 - n)) >>> 0);
  };
  U.wildcard = function (n) { return U.int2ip((~(0xffffffff << (32 - n))) >>> 0); };
  U.netOf = function (ip, len) {
    if (len <= 0) return '0.0.0.0';
    var v = U.ip2int(ip); if (v === null) return null;
    return U.int2ip((v & ((0xffffffff << (32 - len)) >>> 0)) >>> 0);
  };
  U.bcastOf = function (ip, len) {
    if (len <= 0) return '255.255.255.255';
    var v = U.ip2int(ip); if (v === null) return null;
    return U.int2ip((v | (~(0xffffffff << (32 - len))) >>> 0) >>> 0);
  };
  U.sameNet = function (a, b, len) { return U.netOf(a, len) === U.netOf(b, len); };
  U.inNet = function (ip, net, len) { return U.netOf(ip, len) === U.netOf(net, len); };
  U.hostCount = function (len) {
    if (len >= 31) return len === 32 ? 1 : 2;
    return Math.pow(2, 32 - len) - 2;
  };
  /* 反掩码 / wildcard bits */
  U.wildMatch = function (ip, base, wild) {
    var a = U.ip2int(ip), b = U.ip2int(base), w = U.ip2int(wild);
    if (a === null || b === null || w === null) return false;
    return ((a ^ b) & (~w >>> 0)) === 0;
  };
  U.rangeMatch = function (ip, s, e) {
    var a = U.ip2int(ip), x = U.ip2int(s), y = U.ip2int(e);
    if (a === null || x === null || y === null) return false;
    return a >= Math.min(x, y) && a <= Math.max(x, y);
  };

  /* ---------- IPv6 ---------- */
  /* 展开为 8 个 16-bit 整数数组；非法返回 null。忽略 %zone 标识。 */
  U.ipv6Expand = function (addr) {
    if (addr == null) return null;
    addr = String(addr).trim().toLowerCase().split('%')[0];
    if (addr === '') return null;
    var groups;
    var di = addr.indexOf('::');
    if (di >= 0) {
      if (addr.indexOf('::', di + 1) >= 0) return null;       // 不允许多个 ::
      var left = addr.slice(0, di), right = addr.slice(di + 2);
      var lg = left.length ? left.split(':') : [];
      var rg = right.length ? right.split(':') : [];
      if (lg.length + rg.length > 7) return null;
      var missing = 8 - (lg.length + rg.length);
      var all = lg;
      for (var z = 0; z < missing; z++) all.push('0');
      for (var z2 = 0; z2 < rg.length; z2++) all.push(rg[z2]);
      groups = all;
    } else {
      groups = addr.split(':');
      if (groups.length !== 8) return null;
    }
    if (groups.length !== 8) return null;
    var out = [];
    for (var i = 0; i < 8; i++) {
      var g = groups[i];
      if (g === '' || /[^0-9a-f]/.test(g)) return null;
      var n = parseInt(g, 16);
      if (isNaN(n) || n < 0 || n > 0xffff) return null;
      out.push(n);
    }
    return out;
  };
  /* 整数数组 → 全展开字符串 */
  U.ipv6Full = function (addr) {
    var a = Array.isArray(addr) ? addr : U.ipv6Expand(addr);
    if (!a) return String(addr);
    var parts = [];
    for (var i = 0; i < 8; i++) parts.push(a[i].toString(16));
    return parts.join(':');
  };
  /* RFC 5952 风格压缩：最长连续 0 段用 :: 表示（正确拼接，避免产生 :::） */
  U.ipv6Compress = function (addr) {
    var a = Array.isArray(addr) ? addr : U.ipv6Expand(addr);
    if (!a) return String(addr);
    var bestStart = -1, bestLen = 0, curStart = -1, curLen = 0;
    for (var i = 0; i < 8; i++) {
      if (a[i] === 0) { if (curStart < 0) curStart = i; curLen++; }
      else { if (curLen > bestLen) { bestLen = curLen; bestStart = curStart; } curStart = -1; curLen = 0; }
    }
    if (curLen > bestLen) { bestLen = curLen; bestStart = curStart; }
    if (bestLen < 2) return U.ipv6Full(a);
    var head = [], tail = [];
    for (var j = 0; j < bestStart; j++) head.push(a[j].toString(16));
    for (var k = bestStart + bestLen; k < 8; k++) tail.push(a[k].toString(16));
    return head.join(':') + '::' + tail.join(':');
  };
  U.isIpv6 = function (s) { return U.ipv6Expand(s) !== null; };
  /* 前缀长度：接受 "64" 或 "/64" */
  U.ipv6PrefixLen = function (s) {
    s = String(s == null ? '' : s).trim();
    if (s.indexOf('/') >= 0) s = s.split('/')[1];
    var n = parseInt(s, 10);
    if (isNaN(n) || n < 0 || n > 128) return null;
    return n;
  };
  /* 网络地址（主机位置 0）：返回 8 整数数组；非法返回 null */
  U.ipv6NetInts = function (addr, prefix) {
    var a = U.ipv6Expand(addr); if (!a) return null;
    prefix = parseInt(prefix, 10);
    if (isNaN(prefix) || prefix < 0 || prefix > 128) return null;
    for (var i = 0; i < 8; i++) {
      var bits = prefix - i * 16;
      if (bits >= 16) continue;
      if (bits <= 0) { a[i] = 0; continue; }
      a[i] = a[i] & ((0xffff << (16 - bits)) & 0xffff);
    }
    return a;
  };
  U.ipv6NetOf = function (addr, prefix) {
    var a = U.ipv6NetInts(addr, prefix);
    return a ? U.ipv6Full(a) : null;
  };
  U.ipv6SameNet = function (a, b, prefix) {
    var na = U.ipv6NetInts(a, prefix), nb = U.ipv6NetInts(b, prefix);
    if (!na || !nb) return false;
    for (var i = 0; i < 8; i++) if (na[i] !== nb[i]) return false;
    return true;
  };
  U.ipv6InNet = function (ip, net, prefix) { return U.ipv6SameNet(ip, net, prefix); };
  /* 解析 "addr/prefix" 或 "addr" → { addr: 全展开形式（保留主机位）, prefix } 或 null
   * 说明：接口地址必须保留主机位（如 2001:db8:1::1 不能零化成 2001:db8:1::）。
   * 路由目的网段需在调用处自行 U.ipv6NetOf(addr,prefix) 零化主机位。 */
  U.ipv6Split = function (token) {
    token = String(token).trim();
    var m = token.split('/');
    var a = m[0], p = m.length > 1 ? m[1] : '128';
    var prefix = U.ipv6PrefixLen(p);
    if (prefix === null) return null;
    var full = U.ipv6Expand(a);
    if (!full) return null;
    return { addr: U.ipv6Full(full), prefix: prefix };
  };

  /* ---------- 端口 / 接口 ---------- */
  var IF_ALIAS = {
    'g': 'GigabitEthernet', 'ge': 'GigabitEthernet', 'gi': 'GigabitEthernet', 'gigabitethernet': 'GigabitEthernet',
    'e': 'Ethernet', 'eth': 'Ethernet', 'ethernet': 'Ethernet',
    'f': 'FastEthernet', 'fe': 'FastEthernet', 'fastethernet': 'FastEthernet',
    't': 'Ten-GigabitEthernet', 'te': 'Ten-GigabitEthernet', 'xge': 'Ten-GigabitEthernet', 'xg': 'Ten-GigabitEthernet',
    'ten-gigabitethernet': 'Ten-GigabitEthernet', 'x': 'Ten-GigabitEthernet',
    'fge': 'FortyGigE', 'fg': 'FortyGigE', 'fortygige': 'FortyGigE',
    'bagg': 'Bridge-Aggregation', 'br': 'Bridge-Aggregation', 'bridge-aggregation': 'Bridge-Aggregation',
    'ragg': 'Route-Aggregation', 'route-aggregation': 'Route-Aggregation',
    'vlan': 'Vlan-interface', 'vlanif': 'Vlan-interface', 'vsi': 'Vlan-interface', 'vlan-interface': 'Vlan-interface',
    'lo': 'LoopBack', 'loopback': 'LoopBack', 'loop': 'LoopBack',
    'nu': 'NULL', 'null': 'NULL',
    's': 'Serial', 'se': 'Serial', 'ser': 'Serial', 'serial': 'Serial',
    'tun': 'Tunnel', 'tunnel': 'Tunnel'
  };
  var IF_ABBR = {
    'GigabitEthernet': 'GE', 'FastEthernet': 'FE', 'Ethernet': 'ETH', 'Ten-GigabitEthernet': 'XGE',
    'FortyGigE': 'FGE', 'Bridge-Aggregation': 'BAGG', 'Route-Aggregation': 'RAGG',
    'Vlan-interface': 'VLAN', 'LoopBack': 'Loop', 'NULL': 'NULL', 'Tunnel': 'Tun'
  };
  U.ifAbbr = function (full) {
    for (var k in IF_ABBR) { if (full.indexOf(k) === 0) return IF_ABBR[k] + full.slice(k.length); }
    return full;
  };
  /* 把用户输入解析为规范接口名，返回 null 表示非法 */
  U.parseIf = function (tokens, dev) {
    if (!tokens || !tokens.length) return null;
    var t0 = String(tokens[0]).trim();
    var low = t0.toLowerCase().replace(/\s+/g, '');
    var m = low.match(/^([a-z\-]+?)(\d+.*)$/);
    var type = null, rest = null;
    if (m && IF_ALIAS[m[1]]) { type = IF_ALIAS[m[1]]; rest = m[2]; }
    else if (IF_ALIAS[low]) {
      // 类型与编号分离，如 "GigabitEthernet 1/0/1" 或 "vlan 10"
      type = IF_ALIAS[low];
      var t1 = String(tokens[1] || '').trim();
      if (!t1) return null;
      rest = /^[a-z]/i.test(t1) && IF_ALIAS[t1.toLowerCase()] ? null : t1;
      if (rest === null) return null;
      return type + rest;
    }
    if (!type) return null;
    return type + rest;
  };
  U.ifShort = function (name) {
    if (!name) return name;
    for (var k in IF_ABBR) { if (name.indexOf(k) === 0) return IF_ABBR[k] + name.slice(k.length); }
    return name;
  };
  U.isL3If = function (name) {
    return /^(Vlan-interface|LoopBack|NULL|Tunnel|Route-Aggregation)/.test(String(name));
  };
  U.isAggIf = function (name) {
    return /^(Bridge-Aggregation|Route-Aggregation)/.test(String(name));
  };

  /* ---------- 接口范围解析 : port-group / interface range ---------- */
  /* 输入: "1/0/1 to 1/0/5"、"1/0/1,1/0/3-1/0/6"、"gigabitethernet1/0/3"、"GE1/0/3" -> [接口全名]
     接受三种写法：① 短名+编号 "1/0/3"（自动补 prefix）② 短名 "GE1/0/3" ③ 全名 "GigabitEthernet1/0/3"（大小写不敏感）。
     同时识别 range 写法 "A-B" / "A to B"。 */
  U.expandIfRange = function (dev, prefix, spec) {
    function normOne(s) {
      // ① 先按完整接口名解析（GE1/0/3 / GigabitEthernet1/0/3 / gi1/0/3 等都返回规范全名）
      var canon = U.parseIf([s], dev);
      if (canon) {
        var f = dev.ports.filter(function (x) { return x.full === canon || x.name === canon; });
        return f.length ? f[0].name : null;
      }
      // ② 解析失败就当作"裸编号"补 prefix
      var cand = (prefix || '') + s;
      var f2 = dev.ports.filter(function (x) { return x.name === cand || x.full === cand; });
      return f2.length ? f2[0].name : null;
    }
    var out = [];
    var parts = spec.split(',');
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i].trim(); if (!p) continue;
      var mm = p.match(/^(\S+)\s*(?:to|-)\s*(\S+)$/i);
      if (mm) {
        var a = normOne(mm[1]); var b = normOne(mm[2]);
        if (!a || !b) return null;
        var ai = dev.ports.findIndex(function (x) { return x.name === a; });
        var bi = dev.ports.findIndex(function (x) { return x.name === b; });
        if (ai < 0 || bi < 0 || bi < ai) return null;
        for (var j = ai; j <= bi; j++) out.push(dev.ports[j].name);
      } else {
        var n = normOne(p);
        if (!n) return null;
        out.push(n);
      }
    }
    return out;
  };

  /* ---------- VLAN 列表解析: "10,20,30" / "10 to 20" / "all" ---------- */
  U.parseVlanList = function (s, max) {
    max = max || 4094;
    var out = [];
    if (String(s).toLowerCase() === 'all') { for (var i = 1; i <= max; i++) out.push(i); return out; }
    var parts = String(s).split(',');
    for (var k = 0; k < parts.length; k++) {
      var p = parts[k].trim(); if (!p) continue;
      var m = p.match(/^(\d+)\s*(?:to|-)\s*(\d+)$/);
      if (m) {
        var a = parseInt(m[1], 10), b = parseInt(m[2], 10);
        if (a > b || a < 1 || b > max) return null;
        for (var i2 = a; i2 <= b; i2++) out.push(i2);
      } else if (/^\d+$/.test(p)) {
        var v = parseInt(p, 10); if (v < 1 || v > max) return null; out.push(v);
      } else return null;
    }
    return out;
  };
  U.vlanListText = function (list) {
    if (!list || !list.length) return '1';
    var s = U.clone(list).sort(function (a, b) { return a - b; });
    var out = [], i = 0;
    while (i < s.length) {
      var j = i; while (j + 1 < s.length && s[j + 1] === s[j] + 1) j++;
      if (j - i >= 2) out.push(s[i] + ' to ' + s[j]); else for (var k = i; k <= j; k++) out.push(String(s[k]));
      i = j + 1;
    }
    return out.join(', ');
  };

  /* ---------- 文本 ---------- */
  U.rpad = function (s, n) { return U.padR(s, n); };
  U.line = function (ch, n) { var s = ''; for (var i = 0; i < n; i++) s += ch; return s; };
  U.table = function (headers, rows, aligns) {
    var n = headers.length, w = [];
    for (var c = 0; c < n; c++) {
      var mx = U.width(headers[c]);
      for (var r = 0; r < rows.length; r++) mx = Math.max(mx, U.width(rows[r][c]));
      w[c] = mx + 2;
    }
    var out = '';
    for (var c2 = 0; c2 < n; c2++) {
      var isR = aligns && aligns[c2] === 'r';
      out += isR ? U.pad(headers[c2], w[c2]) : U.padR(headers[c2], w[c2]);
    }
    out = out.replace(/\s+$/, '') + '\n';
    for (var r2 = 0; r2 < rows.length; r2++) {
      var ln = '';
      for (var c3 = 0; c3 < n; c3++) {
        var isR2 = aligns && aligns[c3] === 'r';
        ln += isR2 ? U.pad(rows[r2][c3], w[c3]) : U.padR(rows[r2][c3], w[c3]);
      }
      out += ln.replace(/\s+$/, '') + '\n';
    }
    return out;
  };
  U.now = function () {
    var d = new Date(), p = function (x) { return ('0' + x).slice(-2); };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' +
      p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
  };
  U.uptime = function (bootTs) {
    var s = Math.floor((Date.now() - (bootTs || Date.now())) / 1000);
    var d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60);
    var r = []; if (d) r.push(d + ' days'); if (h) r.push(h + ' hours'); r.push(m + ' minutes');
    return r.join(', ');
  };

  H.U = U;
})(window.H3C);
