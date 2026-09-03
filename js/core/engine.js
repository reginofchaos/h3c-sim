/* H3C 网络仿真实验室 - Comware 命令引擎 */
(function (H) {
  'use strict';
  var U = H.U;

  var cmds = [];
  var VIEW_TREE = {
    user: { parent: null },
    system: { parent: 'user' },
    interface: { parent: 'system' },
    vlan: { parent: 'system' },
    ospf: { parent: 'system' },
    'ospf-area': { parent: 'ospf' },
    rip: { parent: 'system' },
    bgp: { parent: 'system' },
    'bgp-ipv4': { parent: 'bgp' },
    acl: { parent: 'system' },
    'local-user': { parent: 'system' },
    line: { parent: 'system' },
    'port-group': { parent: 'system' },
    'mst-region': { parent: 'system' },
    'radius-scheme': { parent: 'system' },
    'hwtacacs-scheme': { parent: 'system' },
    'dhcp-pool': { parent: 'system' },
    'qos-policy': { parent: 'system' },
    'traffic-classifier': { parent: 'system' },
    'traffic-behavior': { parent: 'system' },
    'policy-based-route': { parent: 'system' },
    'pbr-node': { parent: 'policy-based-route' },
    'vsi': { parent: 'system' },
    'keychain': { parent: 'system' },
    'ntp': { parent: 'system' },
    'ssh-user': { parent: 'system' },
    'public-key': { parent: 'system' },
    'ip-pool': { parent: 'system' },
    'route-policy': { parent: 'system' },
    'ip-prefix': { parent: 'system' },
    'as-path': { parent: 'system' },
    'community-list': { parent: 'system' },
    'track': { parent: 'system' },
    'mirroring-group': { parent: 'system' }
  };

  /* ---------- 模式编译 ----------
     语法: 关键字 | <变量> | +a|b 必选字面量 | ?a|b 可选字面量
  */
  var VAR_KINDS = {
    vid: { re: /^\d+$/, test: function (v) { var n = parseInt(v, 10); return n >= 1 && n <= 4094; }, hint: '<1-4094>' },
    int: { re: /^\d+$/, hint: '<0-4294967295>' },
    num: { re: /^\d+(\.\d+)?$/, hint: '<number>' },
    ip: { re: null, test: function (v) { return U.isIp(v); }, hint: '<a.b.c.d>' },
    mask: { re: null, test: function (v) { return U.maskLen(v) !== null; }, hint: '<mask|len>' },
    // 掩码或反掩码均可（OSPF network 语句常用反掩码，如 0.0.0.255）
    wild: { re: null, test: function (v) { return U.isIp(v) || /^\d+$/.test(v); }, hint: '<mask|wildcard>' },
    word: { re: /^\S+$/, hint: '<string>' },
    text: { re: null, greedy: true, hint: '<text>' },
    ifname: { re: null, iface: true, hint: '<interface-name>' },
    vlanlist: { re: null, greedy: true, hint: '<vlan-list>' },
    acl: { re: /^\d+$/, hint: '<2000-3999>' },
    time: { re: /^(\d+|\d+:\d+(:\d+)?)$/, hint: '<time>' }
  };
  var VAR_ALIAS = { v: 'vid', id: 'int', addr: 'ip', name: 'word', str: 'text', iface: 'ifname', ifn: 'ifname', vlans: 'vlanlist' };

  function compile(pat) {
    var raw = pat.trim().split(/\s+/);
    var out = [];
    raw.forEach(function (t) {
      if (t.charAt(0) === '<') {
        var nm = t.slice(1, -1);
        var kd = VAR_KINDS[nm] ? nm : (VAR_ALIAS[nm] || 'word');
        out.push({ type: 'var', name: nm.replace(/[<>]/g, ''), kind: kd, hint: VAR_KINDS[kd] ? VAR_KINDS[kd].hint : '<value>' });
      } else if (t.charAt(0) === '+') {
        out.push({ type: 'alt', opts: t.slice(1).split('|') });
      } else if (t.charAt(0) === '?') {
        out.push({ type: 'opt', opts: t.slice(1).split('|') });
      } else {
        out.push({ type: 'kw', v: t });
      }
    });
    return out;
  }

  function abbrOk(kw, tok) {
    kw = kw.toLowerCase(); tok = String(tok).toLowerCase();
    if (!tok) return false;
    return kw.indexOf(tok) === 0;
  }

  function matchTokens(matcher, tokens, start, dev) {
    var pos = start, args = {}, score = 0, seq = 0;
    for (var i = 0; i < matcher.length; i++) {
      var m = matcher[i];
      var tok = tokens[pos];
      if (tok === undefined) {
        if (m.type === 'opt') continue;
        return null;
      }
      if (m.type === 'kw') {
        if (!abbrOk(m.v, tok)) return null;
        if (m.v === tok) score += 20; else score += 5;
        pos++;
      } else if (m.type === 'alt') {
        var hit = null, hs = -1;
        m.opts.forEach(function (o) {
          if (abbrOk(o, tok)) { var s = (o === tok ? 20 : 5); if (s > hs) { hs = s; hit = o; } }
        });
        if (!hit) return null;
        args['_' + i] = hit;        // 兼容：按匹配位置索引
        args['_' + seq] = hit;      // 顺序索引：第一个 alt/opt/var = _0
        seq++; score += hs; pos++;
      } else if (m.type === 'opt') {
        var hit2 = null;
        m.opts.forEach(function (o) { if (abbrOk(o, tok)) hit2 = o; });
        if (hit2) { args['_' + i] = hit2; args['_' + seq] = hit2; seq++; score += 6; pos++; }
        else continue;
      } else { // var
        var kd = VAR_KINDS[m.kind] || VAR_KINDS.word;
        var val;
        if (kd.greedy) { val = tokens.slice(pos).join(' '); pos = tokens.length; }
        else if (m.kind === 'ifname' || kd.iface) {
          var n1 = U.parseIf([tok], dev);
          if (n1) { val = n1; pos++; }
          else {
            var n2 = U.parseIf([tok, tokens[pos + 1]], dev);
            if (n2) { val = n2; pos += 2; } else return null;
          }
        } else {
          val = tok; pos++;
        }
        if (kd.re && !kd.re.test(String(val))) return null;
        if (kd.test && !kd.test(val)) return null;
        args[m.name] = val;         // 具名（如 ip/mask/vid）
        args['_' + i] = val;        // 兼容：按匹配位置索引
        args['_' + seq] = val;      // 顺序索引
        seq++; score += 2;
      }
    }
    if (pos !== tokens.length) return null;
    return { args: args, score: score };
  }

  /* ---------- 注册 ---------- */
  function register(spec) {
    var pats = spec.pat ? [spec.pat] : (spec.pats || []);
    pats.forEach(function (p) {
      cmds.push({
        matcher: compile(p),
        pat: p,
        views: spec.views || ['system'],
        help: spec.help || '',
        seq: spec.seq || '',      // 帮助分类
        undo: spec.undo === undefined ? false : spec.undo,
        undoFn: typeof spec.undo === 'function' ? spec.undo : null,
        run: spec.run,
        global: spec.global || false,
        hidden: spec.hidden || false
      });
    });
    return spec;
  }

  function viewAllows(cmd, view) {
    if (cmd.global) return true;
    return cmd.views.indexOf(view) >= 0 || cmd.views.indexOf('*') >= 0;
  }

  /* 当前视图对象: { view:'interface', arg:'GE1/0/1' } */
  function curView(sess) { return sess.stack[sess.stack.length - 1]; }

  function findCandidates(dev, sess, tokens, undo) {
    var v = curView(sess).view;
    var res = [];
    for (var i = 0; i < cmds.length; i++) {
      var c = cmds[i];
      if (undo && !c.undo && !c.undoFn) continue;
      if (!viewAllows(c, v)) continue;
      var r = matchTokens(c.matcher, tokens, 0, dev);
      if (r) res.push({ cmd: c, args: r.args, score: r.score, idx: i });
    }
    res.sort(function (a, b) { return b.score - a.score || a.idx - b.idx; });
    return res;
  }

  function errBad(tokens, at) {
    var line = tokens.join(' ');
    var p = 0;
    for (var i = 0; i < at && i < tokens.length; i++) p += tokens[i].length + 1;
    var caret = '';
    for (var j = 0; j < p; j++) caret += ' ';
    return { out: [line, caret + '^', 'Error: Unrecognized command found at \'^\' position.'], err: true };
  }

  function normOut(x) {
    if (x == null) return { out: '' };
    if (typeof x === 'string') return { out: x };
    if (Array.isArray(x)) return { out: x };
    return x;
  }

  /* ---------- 帮助 ---------- */
  function helpList(dev, sess, prefixTokens) {
    var v = curView(sess).view;
    var lines = [];
    var seen = {};
    /* 把一条命令编译成可读的简写模式：到第一个变量之前用关键字/候选，
       第一个变量用 <hint> 表示（与真实设备 ? 的展示一致）。
       例：display arp-table <num> -> "display arp-table <num>" */
    function patternShort(c) {
      var out = [];
      for (var i = 0; i < c.matcher.length; i++) {
        var m = c.matcher[i];
        if (m.type === 'kw') out.push(m.v);
        else if (m.type === 'alt') out.push(m.opts[0]);
        else if (m.type === 'opt') out.push('[' + (m.v || m.opts[0] || '') + ']');
        else {
          out.push('<' + (m.hint || m.name || '?') + '>');
          return out.join(' ');
        }
      }
      return out.join(' ');
    }
    cmds.forEach(function (c) {
      if (c.hidden) return;
      if (!viewAllows(c, v)) return;
      var ok = true;
      for (var i = 0; i < prefixTokens.length; i++) {
        var m = c.matcher[i];
        if (!m) { ok = false; break; }
        var tok = prefixTokens[i];
        if (m.type === 'kw') { if (!abbrOk(m.v, tok)) { ok = false; break; } }
        else if (m.type === 'alt') { var h = false; m.opts.forEach(function (o) { if (abbrOk(o, tok)) h = true; }); if (!h) { ok = false; break; } }
        else if (m.type === 'opt') { /* skip */ }
        else { /* var: 接受任意 */ }
      }
      if (!ok) return;
      var key = c.pat;
      if (seen[key]) return; seen[key] = 1;
      var disp;
      if (prefixTokens.length === 0) {
        // 无前缀时显示完整命令模式，避免所有 display xxx 都显示成 "display"
        disp = patternShort(c);
      } else {
        var next = c.matcher[prefixTokens.length];
        if (!next) disp = null;
        else if (next.type === 'kw') disp = next.v;
        else if (next.type === 'alt') disp = next.opts.join(' | ');
        else if (next.type === 'opt') disp = c.matcher[prefixTokens.length + 1] ? (c.matcher[prefixTokens.length + 1].type === 'kw' ? c.matcher[prefixTokens.length + 1].v : c.matcher[prefixTokens.length + 1].hint) : '';
        else disp = next.hint;
      }
      if (disp) lines.push('  ' + U.padR(disp, 30) + (c.help || ''));
    });
    lines.sort();
    return lines.join('\n');
  }

  function doHelp(dev, sess, line) {
    if (dev.type === 'pc' || dev.type === 'server') return H.Host.help(dev, sess, line);
    var trimmed = line.replace(/\?+$/, '');
    var toks = trimmed.trim() ? trimmed.trim().split(/\s+/) : [];
    var head = '  ' + trimmed + '\n';
    var body = helpList(dev, sess, toks);
    return head + (body || '  <cr>');
  }

  /* ---------- Tab 补全 ---------- */
  function complete(dev, sess, line) {
    if (dev.type === 'pc' || dev.type === 'server') return H.Host.complete(dev, sess, line);
    var toks = line.split(/\s+/);
    var last = toks[toks.length - 1];
    var idx = toks.length - 1;
    var v = curView(sess).view;
    var cands = {}, arr = [];
    function add(s) { if (s && !cands[s]) { cands[s] = 1; arr.push(s); } }
    cmds.forEach(function (c) {
      if (!viewAllows(c, v)) return;
      var m = c.matcher[idx];
      if (!m) return;
      // 需前缀匹配
      var ok = true;
      for (var i = 0; i < idx; i++) {
        var mm = c.matcher[i];
        if (!mm) { ok = false; break; }
        if (mm.type === 'kw' && !abbrOk(mm.v, toks[i])) { ok = false; break; }
        if (mm.type === 'alt') { var h = false; mm.opts.forEach(function (o) { if (abbrOk(o, toks[i])) h = true; }); if (!h) { ok = false; break; } }
      }
      if (!ok) return;
      var pf = last.toLowerCase();
      if (m.type === 'kw') { if (m.v.toLowerCase().indexOf(pf) === 0) add(m.v); }
      else if (m.type === 'alt') { m.opts.forEach(function (o) { if (o.toLowerCase().indexOf(pf) === 0) add(o); }); }
      else if (m.type === 'opt') { m.opts.forEach(function (o) { if (o.toLowerCase().indexOf(pf) === 0) add(o); }); }
      else {
        if (m.kind === 'ifname') { dev.ports.forEach(function (p) { if (p.name.toLowerCase().indexOf(pf) === 0) add(p.name); }); add('Vlan-interface'); add('LoopBack'); }
        else if (m.kind === 'vid') { Object.keys(dev.cfg.vlans).forEach(function (k) { if (k.indexOf(pf) === 0) add(k); }); }
        else if (m.kind === 'acl') { Object.keys(dev.cfg.acl).forEach(function (k) { if (k.indexOf(pf) === 0) add(k); }); }
      }
    });
    arr.sort();
    if (arr.length === 1) {
      return { type: 'single', value: arr[0], replace: last };
    }
    if (arr.length > 1) {
      // 公共前缀
      var common = arr[0];
      arr.forEach(function (s) {
        var i = 0; while (i < common.length && i < s.length && common[i].toLowerCase() === s[i].toLowerCase()) i++;
        common = common.slice(0, i);
      });
      if (common.length > last.length) return { type: 'single', value: common, replace: last };
      return { type: 'list', list: arr };
    }
    return { type: 'none' };
  }

  /* ---------- 执行 ---------- */
  function exec(dev, sess, line) {
    line = String(line || '').replace(/^\s+/, '');
    if (!line) return { out: '' };
    if (line === '?') return { out: doHelp(dev, sess, '') };
    if (/\?$/.test(line)) return { out: doHelp(dev, sess, line) };
    if (dev.type === 'pc' || dev.type === 'server') return H.Host.exec(dev, sess, line);

    var tokens = line.trim().split(/\s+/);
    var undo = false;
    if (tokens.length && abbrOk('undo', tokens[0])) { undo = true; tokens.shift(); }
    if (!tokens.length) {
      return { out: [line, '           ^', "Error: Incomplete command found at '^' position."], err: true };
    }

    var cands = findCandidates(dev, sess, tokens, undo);
    if (cands.length) {
      var best = cands[0];
      // 同分多候选时提示歧义
      if (cands.length > 1 && cands[1].score === best.score && cands[1].cmd.pat !== best.cmd.pat) {
        var ambiguous = cands.filter(function (x) { return x.score === best.score; })
          .map(function (x) { return x.cmd.pat; }).filter(function (v, i, a) { return a.indexOf(v) === i; });
        if (ambiguous.length > 1) {
          return { out: [line, "Error: Ambiguous command found at '^' position.", 'Candidates: ' + ambiguous.join(' | ')], err: true };
        }
      }
      var ctx = {
        dev: dev, sess: sess, args: best.args, raw: line, tokens: tokens,
        undo: undo, view: curView(sess), H: H, U: U, S: H.State
      };
      var r;
      try {
        if (undo && best.cmd.undoFn) r = best.cmd.undoFn(ctx);
        else r = best.cmd.run(ctx);
      } catch (e) {
        return { out: 'Error: ' + (e && e.message ? e.message : e), err: true };
      }
      r = normOut(r);
      if (r.enter) sess.stack.push(r.enter);
      if (r.exit) { if (sess.stack.length > 1) sess.stack.pop(); }
      if (r.toUser) sess.stack = [{ view: 'user', arg: null }];
      if (r.toSystem) sess.stack = [{ view: 'user', arg: null }, { view: 'system', arg: null }];
      if (r.refresh !== false) H.Sim && H.Sim.invalidate && H.Sim.invalidate();
      return r;
    }

    // 未匹配：判断 incomplete
    if (isIncomplete(dev, sess, tokens)) {
      return { out: [line, 'Error: Incomplete command found at \'^\' position.'], err: true };
    }
    return errBad(line.split(/\s+/), 0);
  }

  function isIncomplete(dev, sess, tokens) {
    var v = curView(sess).view;
    for (var i = 0; i < cmds.length; i++) {
      var c = cmds[i];
      if (!viewAllows(c, v)) continue;
      if (tokens.length >= c.matcher.length) continue;
      var ok = true;
      for (var j = 0; j < tokens.length; j++) {
        var m = c.matcher[j]; if (!m) { ok = false; break; }
        var t = tokens[j];
        if (m.type === 'kw' && !abbrOk(m.v, t)) { ok = false; break; }
        if (m.type === 'alt') { var h = false; m.opts.forEach(function (o) { if (abbrOk(o, t)) h = true; }); if (!h) { ok = false; break; } }
      }
      if (ok) return true;
    }
    return false;
  }

  /* ---------- 提示符 ---------- */
  function promptFor(dev, sess) {
    if (dev.type === 'pc' || dev.type === 'server') return H.Host.promptFor(dev, sess);
    var v = curView(sess);
    var nm = dev.cfg.hostname || dev.cfg.sysname || 'H3C';
    switch (v.view) {
      case 'user': return '<' + nm + '>';
      case 'system': return '[' + nm + ']';
      case 'interface': return '[' + nm + '-' + H.U.ifShort(v.arg) + ']';
      case 'vlan': return '[' + nm + '-vlan' + v.arg + ']';
      case 'ospf': return '[' + nm + '-ospf-' + v.arg + ']';
      case 'ospf-area': return '[' + nm + '-ospf-' + v.arg.p + '-area-' + v.arg.a + ']';
      case 'rip': return '[' + nm + '-rip-' + v.arg + ']';
      case 'bgp': return '[' + nm + '-bgp-' + v.arg + ']';
      case 'bgp-ipv4': return '[' + nm + '-bgp-' + v.arg + '-ipv4]';
      case 'acl': return '[' + nm + '-acl-' + v.arg.type + '-' + v.arg.id + ']';
      case 'local-user': return '[' + nm + '-luser-manage-' + v.arg + ']';
      case 'line': return '[' + nm + '-line-' + v.arg + ']';
      case 'port-group': return '[' + nm + '-port-group-' + v.arg + ']';
      case 'mst-region': return '[' + nm + '-mst-region]';
      case 'radius-scheme': return '[' + nm + '-radius-' + v.arg + ']';
      case 'dhcp-pool': return '[' + nm + '-dhcp-pool-' + v.arg + ']';
      case 'policy-based-route': return '[' + nm + '-pbr-' + v.arg.name + ']';
      case 'pbr-node': return '[' + nm + '-pbr-' + v.arg.name + '-' + v.arg.node + ']';
      case 'route-policy': return '[' + nm + '-route-policy-' + v.arg + ']';
      case 'keychain': return '[' + nm + '-keychain-' + v.arg + ']';
      case 'track': return '[' + nm + '-track-' + v.arg + ']';
      default: return '[' + nm + '-' + v.view + ']';
    }
  }

  function bannerFor(dev) {
    if (dev.type === 'pc' || dev.type === 'server') return H.Host.banner(dev);
    return ['H3C Comware 7 模拟终端 · ' + dev.model, '用户视图，输入 system-view 进入系统视图，输入 ? 查看帮助。', ''];
  }

  H.Engine = {
    cmds: cmds,
    register: register,
    exec: exec,
    complete: complete,
    help: doHelp,
    promptFor: promptFor,
    bannerFor: bannerFor,
    curView: curView,
    VIEW_TREE: VIEW_TREE,
    viewParent: function (v) { return (VIEW_TREE[v] || {}).parent || null; }
  };
})(window.H3C);
