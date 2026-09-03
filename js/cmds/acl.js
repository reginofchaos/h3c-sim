/* ACL 访问控制列表 */
(function (H) {
  'use strict';
  var U = H.U, S = H.State, R = H.R, C = H.Cmd;

  function aclTypeOf(id) {
    id = parseInt(id, 10);
    if (id >= 2000 && id <= 2999) return 'basic';
    if (id >= 3000 && id <= 3999) return 'advanced';
    if (id >= 4000 && id <= 4999) return 'mac';
    if (id >= 5000 && id <= 5999) return 'user';
    return null;
  }
  function aclTypeName(t) {
    return { basic: 'ipv4-basic', advanced: 'ipv4-adv', mac: 'mac', user: 'user' }[t] || 'ipv4-basic';
  }
  function ensureAcl(dev, id, type) {
    var k = String(id);
    if (!dev.cfg.acl[k]) dev.cfg.acl[k] = { id: Number(id), type: type || aclTypeOf(id) || 'basic', rules: [], step: 5, desc: '' };
    return dev.cfg.acl[k];
  }

  /* 解析 rule 剩余文本 */
  function parseRule(type, text) {
    var tk = String(text || '').trim().split(/\s+/);
    var r = { action: 'permit', proto: null, srcAddr: null, srcWild: null, dstAddr: null, dstWild: null, srcPort: null, srcOp: null, dstPort: null, dstOp: null, dstPort2: null, srcMac: null, log: false, counting: false, timeRange: null };
    if (!tk.length) return null;
    if (/^\d+$/.test(tk[0])) { r.id = parseInt(tk.shift(), 10); }
    if (!tk.length) return null;
    r.action = tk.shift().toLowerCase();
    if (r.action !== 'permit' && r.action !== 'deny') return null;
    if (type === 'mac') { r.action = r.action; }
    while (tk.length) {
      var t = tk.shift().toLowerCase();
      switch (t) {
        case 'source':
          if (tk[0] === 'any') { tk.shift(); r.srcAddr = '0.0.0.0'; r.srcWild = '255.255.255.255'; }
          else { r.srcAddr = tk.shift(); if (tk[0] && U.isIp(tk[0])) r.srcWild = tk.shift(); else r.srcWild = '0.0.0.0'; }
          if (r.srcWild && /^\d+$/.test(r.srcWild)) r.srcWild = U.wildcard(parseInt(r.srcWild, 10));
          break;
        case 'destination':
          if (tk[0] === 'any') { tk.shift(); r.dstAddr = '0.0.0.0'; r.dstWild = '255.255.255.255'; }
          else { r.dstAddr = tk.shift(); if (tk[0] && U.isIp(tk[0])) r.dstWild = tk.shift(); else r.dstWild = '0.0.0.0'; }
          if (r.dstWild && /^\d+$/.test(r.dstWild)) r.dstWild = U.wildcard(parseInt(r.dstWild, 10));
          break;
        case 'source-port':
          var so = tk.shift(); var sp = tk.shift();
          if (so === 'eq') { r.srcOp = 'eq'; r.srcPort = parseInt(sp, 10); }
          else if (so === 'range') { r.srcOp = 'range'; r.srcPort = parseInt(sp, 10); r.srcPort2 = parseInt(tk.shift(), 10); }
          break;
        case 'destination-port':
        case 'dst-port':
          var dpo = tk.shift(); var dp = tk.shift();
          if (dpo === 'eq') { r.dstOp = 'eq'; r.dstPort = parseInt(dp, 10); }
          else if (dpo === 'gt') { r.dstOp = 'gt'; r.dstPort = parseInt(dp, 10); }
          else if (dpo === 'lt') { r.dstOp = 'lt'; r.dstPort = parseInt(dp, 10); }
          else if (dpo === 'range') { r.dstOp = 'range'; r.dstPort = parseInt(dp, 10); r.dstPort2 = parseInt(tk.shift(), 10); }
          break;
        case 'source-mac':
          r.srcMac = tk.shift(); if (tk[0] && /^[0-9a-f\-\.:]+$/i.test(tk[0])) r.srcMacMask = tk.shift();
          break;
        case 'time-range': r.timeRange = tk.shift(); break;
        case 'logging': r.log = true; break;
        case 'counting': r.counting = true; break;
        case 'ip': r.proto = 'ip'; break;
        case 'icmp': r.proto = 'icmp'; break;
        case 'tcp': r.proto = 'tcp'; break;
        case 'udp': r.proto = 'udp'; break;
        case 'gre': case 'ospf': case 'esp': case 'ah': r.proto = t; break;
        case 'protocol': if (tk[0]) r.proto = tk.shift().toLowerCase(); break;
        case 'precedence': tk.shift(); break;
        case 'dscp': tk.shift(); break;
        case 'fragment': r.fragment = true; break;
        case 'established': r.established = true; break;
        default:
          if (/^\d+$/.test(t)) r.protoNum = parseInt(t, 10);
          break;
      }
    }
    return r;
  }
  H.parseAclRule = parseRule;

  /* ============ 创建 ACL ============ */
  R({
    views: ['system'], pat: 'acl basic <int>', seq: 'acl',
    help: '创建基本 ACL (2000-2999) 并进入 ACL 视图',
    run: function (c) {
      var id = parseInt(c.args.int, 10);
      if (id < 2000 || id > 2999) return { out: 'Error: A basic ACL number must be in the range 2000 to 2999.', err: true };
      ensureAcl(c.dev, id, 'basic');
      return { enter: { view: 'acl', arg: { id: id, type: 'basic' } } };
    }
  });
  R({
    views: ['system'], pat: 'acl advanced <int>', seq: 'acl',
    help: '创建高级 ACL (3000-3999) 并进入 ACL 视图',
    run: function (c) {
      var id = parseInt(c.args.int, 10);
      if (id < 3000 || id > 3999) return { out: 'Error: An advanced ACL number must be in the range 3000 to 3999.', err: true };
      ensureAcl(c.dev, id, 'advanced');
      return { enter: { view: 'acl', arg: { id: id, type: 'advanced' } } };
    }
  });
  R({
    views: ['system'], pat: 'acl mac <int>', seq: 'acl',
    help: '创建二层 ACL (4000-4999)',
    run: function (c) {
      var id = parseInt(c.args.int, 10);
      if (id < 4000 || id > 4999) return { out: 'Error: A MAC ACL number must be in the range 4000 to 4999.', err: true };
      ensureAcl(c.dev, id, 'mac');
      return { enter: { view: 'acl', arg: { id: id, type: 'mac' } } };
    }
  });
  R({
    views: ['system'], pat: 'acl number <int>', seq: 'acl',
    help: '按编号创建 ACL 并进入 ACL 视图',
    run: function (c) {
      var id = parseInt(c.args.int, 10), t = aclTypeOf(id);
      if (!t) return { out: 'Error: Unsupported ACL number.', err: true };
      ensureAcl(c.dev, id, t);
      return { enter: { view: 'acl', arg: { id: id, type: t } } };
    }
  });
  R({
    views: ['system'], pat: 'acl name <word> +basic|advanced|mac', hidden: true, seq: 'acl',
    help: '按名称创建 ACL',
    run: function (c) {
      var id = Object.keys(c.dev.cfg.acl).length ? Math.max.apply(null, Object.keys(c.dev.cfg.acl).map(Number)) + 1 : 2000;
      var a = ensureAcl(c.dev, id, c.args._2 === 'advanced' ? 'advanced' : c.args._2 === 'mac' ? 'mac' : 'basic');
      a.name = c.args._1;
      return { enter: { view: 'acl', arg: { id: id, type: a.type } } };
    }
  });

  /* ============ ACL 视图 ============ */
  function curAcl(c) { return c.dev.cfg.acl[c.view.arg.id]; }
  function nextRuleId(a) {
    if (!a.rules.length) return a.step || 5;
    return Math.max.apply(null, a.rules.map(function (r) { return r.id; })) + (a.step || 5);
  }
  R({
    views: ['acl'], pat: 'rule <text>', seq: 'acl',
    help: '配置 ACL 规则（如 rule 5 deny ip source 10.0.0.0 0.0.0.255）',
    run: function (c) {
      var a = curAcl(c);
      var r = parseRule(a.type, c.args.text);
      if (!r) return { out: 'Error: Wrong parameter found at \'^\' position.', err: true };
      if (r.id == null) r.id = nextRuleId(a);
      a.rules = a.rules.filter(function (x) { return x.id !== r.id; });
      a.rules.push(r);
      a.rules.sort(function (x, y) { return x.id - y.id; });
      return { out: '' };
    },
    undo: function (c) {
      var a = curAcl(c);
      var r = parseRule(a.type, c.args.text);
      if (r && r.id != null) a.rules = a.rules.filter(function (x) { return x.id !== r.id; });
      else if (r) {
        // 按内容删除
        a.rules = a.rules.filter(function (x) {
          return !(x.action === r.action && x.srcAddr === r.srcAddr && x.dstAddr === r.dstAddr);
        });
      }
      return { out: '' };
    }
  });
  R({
    views: ['acl'], pat: 'step <int>', seq: 'acl',
    help: '配置规则编号步长', run: function (c) { curAcl(c).step = parseInt(c.args.int, 10); return { out: '' }; }
  });
  R({
    views: ['acl'], pat: 'description <text>', seq: 'acl',
    help: '配置 ACL 描述', run: function (c) { curAcl(c).desc = c.args.text; return { out: '' }; }
  });
  R({
    views: ['acl'], pat: 'rule <int> permit', hidden: true, seq: 'acl',
    help: '配置允许所有报文的规则',
    run: function (c) {
      var a = curAcl(c);
      a.rules = a.rules.filter(function (x) { return x.id !== parseInt(c.args.int, 10); });
      a.rules.push({ id: parseInt(c.args.int, 10), action: 'permit' });
      a.rules.sort(function (x, y) { return x.id - y.id; });
      return { out: '' };
    }
  });
  R({
    views: ['acl'], pat: 'rule <int> deny', hidden: true, seq: 'acl',
    help: '配置拒绝所有报文的规则',
    run: function (c) {
      var a = curAcl(c);
      a.rules = a.rules.filter(function (x) { return x.id !== parseInt(c.args.int, 10); });
      a.rules.push({ id: parseInt(c.args.int, 10), action: 'deny' });
      a.rules.sort(function (x, y) { return x.id - y.id; });
      return { out: '' };
    }
  });
  R({
    views: ['acl'], pat: 'rule permit', hidden: true, seq: 'acl',
    help: '配置允许所有报文的规则',
    run: function (c) {
      var a = curAcl(c);
      a.rules.push({ id: nextRuleId(a), action: 'permit' });
      return { out: '' };
    }
  });
  R({
    views: ['acl'], pat: 'rule deny', hidden: true, seq: 'acl',
    help: '配置拒绝所有报文的规则',
    run: function (c) {
      var a = curAcl(c);
      a.rules.push({ id: nextRuleId(a), action: 'deny' });
      return { out: '' };
    }
  });

  /* ============ 应用 ACL ============ */
  R({
    views: ['interface'], pat: 'packet-filter <acl> +inbound|outbound', seq: 'acl',
    help: '在接口上应用 ACL 进行报文过滤',
    run: function (c) {
      var id = parseInt(c.args.acl, 10);
      if (!c.dev.cfg.acl[id]) return { out: 'Error: The ACL does not exist.', err: true };
      return C.applyIfaces(c, function (f) {
        if (c.args._1 === 'inbound') f.aclIn = id; else f.aclOut = id;
      });
    },
    undo: function (c) {
      return C.applyIfaces(c, function (f) {
        if (c.args._1 === 'inbound') f.aclIn = null; else f.aclOut = null;
      });
    }
  });
  R({
    views: ['interface'], pat: 'traffic-filter <acl> +inbound|outbound', hidden: true, seq: 'acl',
    help: '接口应用 ACL（等价 packet-filter）',
    run: function (c) {
      var id = parseInt(c.args.acl, 10);
      if (!c.dev.cfg.acl[id]) return { out: 'Error: The ACL does not exist.', err: true };
      return C.applyIfaces(c, function (f) { if (c.args._1 === 'inbound') f.aclIn = id; else f.aclOut = id; });
    }
  });
  R({
    views: ['interface'], pat: 'packet-filter name <word> +inbound|outbound', hidden: true, seq: 'acl',
    help: '按 ACL 名称应用过滤',
    run: function (c) {
      var a = Object.keys(c.dev.cfg.acl).filter(function (k) { return c.dev.cfg.acl[k].name === c.args._1; })[0];
      if (!a) return { out: 'Error: The ACL does not exist.', err: true };
      return C.applyIfaces(c, function (f) { if (c.args._2 === 'inbound') f.aclIn = Number(a); else f.aclOut = Number(a); });
    }
  });
  R({
    views: ['system'], pat: 'packet-filter default deny', hidden: true, seq: 'acl',
    help: '配置报文过滤缺省动作为拒绝', run: function (c) { c.dev.cfg.pfDefault = 'deny'; return { out: '' }; }
  });
  /* VTY / Web 登录限制 */
  R({
    views: ['line'], pat: 'acl <acl> +inbound|outbound', seq: 'acl',
    help: '限制 VTY 登录来源',
    run: function (c) {
      var id = parseInt(c.args.acl, 10);
      if (/^vty/.test(c.view.arg)) { if (c.args._1 === 'inbound') c.dev.cfg.vty.aclIn = id; else c.dev.cfg.vty.aclOut = id; }
      return { out: '' };
    }
  });
  R({
    views: ['system'], pat: 'undo acl <int>', hidden: true, seq: 'acl',
    help: '删除 ACL',
    run: function (c) { delete c.dev.cfg.acl[c.args.int]; return { out: '' }; }
  });

})(window.H3C);
