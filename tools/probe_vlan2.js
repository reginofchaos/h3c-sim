/* 复现用户第二次实验：SW1-1 trunk(permit vlan10) <-> SW2-1 access(vlan10)
 * SW1-2 access vlan10 -> PC1 192.168.1.1 ; SW2-2 access vlan10 -> PC2 192.168.1.2
 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const ROOT = 'C:/Users/Admin/WorkBuddy/岳科院教学工作/h3c-sim';
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const dom = new JSDOM(html, { url: 'https://localhost/h3c-sim/index.html', runScripts: 'outside-only', resources: 'usable', pretendToBeVisual: true });
const { window } = dom;
window.addEventListener('error', () => {});
window.addEventListener('jsdomError', () => {});
window.console.error = function () {};
function makeCtx() { var b = { font: '12px sans-serif' }; return new Proxy(b, { get: function (t, p) { if (p === 'canvas') return window.document.createElement('canvas'); if (p === 'measureText') return function (s) { return { width: String(s == null ? '' : s).length * 7 }; }; if (p in t) return t[p]; return function () { return makeCtx(); }; }, set: function (t, p, v) { t[p] = v; return true; } }); }
window.HTMLCanvasElement.prototype.getContext = function () { return makeCtx(); };
['js/core/utils.js','js/core/version.js','js/core/models.js','js/core/state.js','js/core/engine.js','js/core/host.js','js/core/sim.js','js/cmds/base.js','js/cmds/l2.js','js/cmds/l3.js','js/cmds/route.js','js/cmds/wan.js','js/cmds/nat.js','js/cmds/acl.js','js/cmds/qos.js','js/cmds/sec.js','js/cmds/nms.js','js/cmds/monitor.js','js/cmds/config.js','js/ui/topology.js','js/ui/terminal.js','js/ui/app.js'].forEach(rel => { try { window.eval(fs.readFileSync(path.join(ROOT, rel), 'utf8')); } catch (e) { console.log('[eval FAIL]', rel, e.message); } });

function build() {
  const H = window.H3C, S = H.State, Sim = H.Sim;
  S.clearAll();
  const sw1 = S.addDevice('S5130-28S-EI', 'SW1', 0, 0);
  const sw2 = S.addDevice('S5130-28S-EI', 'SW2', 0, 200);
  const pc1 = S.addDevice('PC', 'PC1', -200, 0);
  const pc2 = S.addDevice('PC', 'PC2', 200, 200);
  sw1.cfg.stp.enable = false; sw2.cfg.stp.enable = false;
  // 互联：SW1-1 trunk permit vlan10 (native vlan 默认 1)；SW2-1 access vlan10
  sw1.cfg.ifaces['GE1/0/1'].linkType = 'trunk'; sw1.cfg.ifaces['GE1/0/1'].accessVlan = 1; sw1.cfg.ifaces['GE1/0/1'].pvid = 1; sw1.cfg.ifaces['GE1/0/1'].permitVlans = [10]; sw1.cfg.ifaces['GE1/0/1'].untaggedVlans = [1];
  sw2.cfg.ifaces['GE1/0/1'].linkType = 'access'; sw2.cfg.ifaces['GE1/0/1'].accessVlan = 10; sw2.cfg.ifaces['GE1/0/1'].pvid = 10; sw2.cfg.ifaces['GE1/0/1'].permitVlans = [10];
  // 主机口
  sw1.cfg.ifaces['GE1/0/2'].linkType = 'access'; sw1.cfg.ifaces['GE1/0/2'].accessVlan = 10; sw1.cfg.ifaces['GE1/0/2'].pvid = 10; sw1.cfg.ifaces['GE1/0/2'].permitVlans = [10];
  sw2.cfg.ifaces['GE1/0/2'].linkType = 'access'; sw2.cfg.ifaces['GE1/0/2'].accessVlan = 10; sw2.cfg.ifaces['GE1/0/2'].pvid = 10; sw2.cfg.ifaces['GE1/0/2'].permitVlans = [10];
  S.addLink(sw1.id, 'GE1/0/1', sw2.id, 'GE1/0/1');
  S.addLink(sw1.id, 'GE1/0/2', pc1.id, 'GE0/1');
  S.addLink(sw2.id, 'GE1/0/2', pc2.id, 'GE0/1');
  function setPc(pc, a) { var f = pc.cfg.ifaces['GE0/1']; f.mode = 'route'; f.linkType = 'access'; f.accessVlan = 1; f.pvid = 1; f.permitVlans = [1]; f.ip = { addr: a, mask: '255.255.255.0' }; }
  setPc(pc1, '192.168.1.1'); setPc(pc2, '192.168.1.2');
  Sim.invalidate();
  return { H, S, Sim, pc1, pc2 };
}
function run() {
  const t = build();
  if (console._wt === undefined) { console._wt = function () { var a = Array.prototype.slice.call(arguments); process.stdout.write('  [WT] ' + a.join(' ') + '\n'); }; }
  console.log('=== 用户拓扑：SW1-1 trunk(permit10) <-> SW2-1 access(vlan10) ===');
  let r = t.Sim.ping(t.pc1, '192.168.1.2', { count: 2 });
  console.log('PC1 -> PC2:', r.ok ? '通' : '不通', '| reason=' + (r.path && r.path.reason), '| backReason=' + r.backReason);
  console.log('  fwd hops=' + (r.path && r.path.hops ? r.path.hops.length : '?') + ' hopDev=' + (r.path && r.path.hops ? r.path.hops.map(h=>h.dev).join('>') : ''));
  r = t.Sim.ping(t.pc2, '192.168.1.1', { count: 2 });
  console.log('PC2 -> PC1:', r.ok ? '通' : '不通', '| reason=' + (r.path && r.path.reason), '| backReason=' + r.backReason);
  console.log('  fwd hops=' + (r.path && r.path.hops ? r.path.hops.length : '?'));
  // 直接看 back 路径
  let owner = t.Sim.findOwner ? null : null;
  let bp = t.Sim.forwardPath(t.pc2, '192.168.1.2', '192.168.1.1');
  console.log('  直接 back forwardPath(PC2->PC1): ok=' + bp.ok + ' reason=' + bp.reason + ' hops=' + bp.hops.length);
  // 直接看 l2Domain 包含哪些设备
  let domF = t.Sim.l2Domain(t.pc1, 'GE0/1', 10);
  let domB = t.Sim.l2Domain(t.pc2, 'GE0/1', 10);
  console.log('  l2Domain(PC1,vlan10) 设备:', Object.keys(domF).map(k => (t.S.getDevice(k) || {}).name).join(','));
  console.log('  l2Domain(PC2,vlan10) 设备:', Object.keys(domB).map(k => (t.S.getDevice(k) || {}).name).join(','));
  // 看 SW1-1 / SW2-1 端口配置
  t.S.S.devices.forEach(d => {
    if (d.name === 'SW1' || d.name === 'SW2') {
      let f = d.cfg.ifaces['GE1/0/1'];
      console.log('  ' + d.name + ' GE1/0/1: linkType=' + f.linkType + ' pvid=' + f.pvid + ' permit=' + JSON.stringify(f.permitVlans) + ' mode=' + f.mode);
    }
  });

  // 对照：把 SW1-1 的 trunk native vlan 也设为 10（两端都在 vlan10 上对齐）
  const t2 = build();
  t2.S.S.devices.forEach(d => { if (d.name === 'SW1') { d.cfg.ifaces['GE1/0/1'].pvid = 10; d.cfg.ifaces['GE1/0/1'].untaggedVlans = [10]; } });
  t2.Sim.invalidate();
  console.log('\n=== 对照：SW1-1 trunk native vlan 改为 10（两端对齐）===');
  r = t2.Sim.ping(t2.pc1, '192.168.1.2', { count: 2 });
  console.log('PC1 -> PC2:', r.ok ? '通' : '不通', '| reason=' + (r.path && r.path.reason));
}
run();
