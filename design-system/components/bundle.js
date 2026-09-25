/* @ds-bundle: {"format":4,"namespace":"RendaERP","components":[{"name":"Barras3D"},{"name":"Pizza3D"},{"name":"Area3D"},{"name":"Rosca3D"},{"name":"Empilhadas3D"},{"name":"Linha"},{"name":"MenuLateral"}]} */
/* Renda+ ERP — gráficos 3D em SVG puro (sem React, sem rede). Cores lidas dos tokens CSS. */
(function () {
  var NS = 'http://www.w3.org/2000/svg';
  function cssVar(n, fb) {
    var v = getComputedStyle(document.documentElement).getPropertyValue('--' + n).trim();
    return v || fb;
  }
  function toRgb(c) {
    var d = document.createElement('span'); d.style.color = c; document.body.appendChild(d);
    var m = getComputedStyle(d).color.match(/\d+(\.\d+)?/g); d.remove();
    return m ? [+m[0], +m[1], +m[2]] : [200, 200, 200];
  }
  function shade(c, f) { // f < 1 escurece, f > 1 clareia
    var r = toRgb(c);
    var o = r.map(function (x) { return Math.round(f < 1 ? x * f : x + (255 - x) * (f - 1)); });
    return 'rgb(' + o.join(',') + ')';
  }
  function el(tag, attrs, parent, text) {
    var e = document.createElementNS(NS, tag);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (text != null) e.textContent = text;
    if (parent) parent.appendChild(e);
    return e;
  }
  function fmt(n, casas) {
    return Number(n).toLocaleString('pt-BR', { minimumFractionDigits: casas || 0, maximumFractionDigits: casas || 0 });
  }
  function palette(o) {
    return o.cores || ['chart-1', 'chart-2', 'chart-3', 'chart-4', 'chart-5'].map(function (t) { return cssVar(t, '#ccc'); });
  }
  function base(host, w, h) {
    host.innerHTML = '';
    var s = el('svg', { viewBox: '0 0 ' + w + ' ' + h, width: w, height: h, role: 'img', class: 'rp-chart-svg' }, host);
    s.style.fontFamily = cssVar('font-ui', 'sans-serif');
    s.style.fontSize = '12px';
    s.style.maxWidth = '100%';
    s.style.height = 'auto';
    return s;
  }
  function legenda(svg, x, y, series, cores) {
    var ink = cssVar('ink', '#1f2026');
    series.forEach(function (n, i) {
      el('rect', { x: x, y: y - 9, width: 10, height: 10, fill: cores[i % cores.length], stroke: shade(cores[i % cores.length], 0.7) }, svg);
      var t = el('text', { x: x + 15, y: y, fill: ink }, svg, n);
      x += 22 + n.length * 6.6;
    });
  }
  function nice(max) {
    var p = Math.pow(10, Math.floor(Math.log10(max || 1))), m = max / p;
    var s = m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10;
    return s * p;
  }

  /* Barras 3D agrupadas. opts: {categorias:[...], series:[{nome, valores:[...]}], largura, altura, profundidade, titulo, unidade} */
  function Barras3D(host, o) {
    var W = o.largura || 560, H = o.altura || 300, d = o.profundidade || 12;
    var dx = d, dy = -d * 0.7;
    var svg = base(host, W, H), cores = palette(o);
    var wall = cssVar('chart-wall', '#d3dfed'), floor = cssVar('chart-floor', '#adbbcf'), axis = cssVar('chart-axis', '#8495b0'), ink = cssVar('ink', '#1f2026');
    var L = 52, R = 16 + dx, T = 18 - dy, B = 54;
    var x0 = L, y0 = H - B, pw = W - L - R, ph = H - T - B;
    var max = 0; o.series.forEach(function (s) { s.valores.forEach(function (v) { max = Math.max(max, v); }); });
    var top = nice(max), steps = 5;
    // parede de fundo e lateral, piso
    el('polygon', { points: [x0 + dx, y0 + dy, x0 + dx, y0 - ph + dy, x0 + pw + dx, y0 - ph + dy, x0 + pw + dx, y0 + dy].join(' '), fill: wall }, svg);
    el('polygon', { points: [x0, y0, x0, y0 - ph, x0 + dx, y0 - ph + dy, x0 + dx, y0 + dy].join(' '), fill: shade(wall, 0.9) }, svg);
    el('polygon', { points: [x0, y0, x0 + dx, y0 + dy, x0 + pw + dx, y0 + dy, x0 + pw, y0].join(' '), fill: floor }, svg);
    for (var i = 0; i <= steps; i++) {
      var yy = y0 - ph * i / steps;
      el('polyline', { points: [x0, yy, x0 + dx, yy + dy, x0 + pw + dx, yy + dy].join(' '), fill: 'none', stroke: axis, 'stroke-width': 0.6 }, svg);
      el('text', { x: x0 - 6, y: yy + 4, 'text-anchor': 'end', fill: ink }, svg, fmt(top * i / steps));
    }
    var nc = o.categorias.length, ns = o.series.length, gw = pw / nc, bw = Math.min(28, (gw * 0.72) / ns);
    o.categorias.forEach(function (c, ci) {
      var gx = x0 + ci * gw + (gw - bw * ns) / 2;
      o.series.forEach(function (s, si) {
        var v = s.valores[ci], h = ph * v / top, x = gx + si * bw, y = y0 - h, col = cores[si % cores.length];
        var g = el('g', {}, svg);
        el('title', {}, g, s.nome + ' · ' + c + ': ' + fmt(v) + (o.unidade ? ' ' + o.unidade : ''));
        el('polygon', { points: [x + bw, y, x + bw + dx, y + dy, x + bw + dx, y0 + dy, x + bw, y0].join(' '), fill: shade(col, 0.72) }, g);
        el('polygon', { points: [x, y, x + dx, y + dy, x + bw + dx, y + dy, x + bw, y].join(' '), fill: shade(col, 1.35) }, g);
        el('rect', { x: x, y: y, width: bw, height: h, fill: col, stroke: shade(col, 0.8), 'stroke-width': 0.5 }, g);
      });
      el('text', { x: x0 + ci * gw + gw / 2, y: y0 + 18, 'text-anchor': 'middle', fill: ink }, svg, c);
    });
    legenda(svg, L, H - 12, o.series.map(function (s) { return s.nome; }), cores);
    return svg;
  }

  /* Pizza 3D. opts: {fatias:[{nome, valor}], largura, altura, profundidade} */
  function Pizza3D(host, o) {
    var W = o.largura || 420, H = o.altura || 280, depth = o.profundidade || 22;
    var svg = base(host, W, H), cores = palette(o), ink = cssVar('ink', '#1f2026');
    var cx = W * 0.36, cy = (H - 40) / 2 - 4, rx = Math.min(W * 0.3, 150), ry = rx * 0.55;
    var tot = o.fatias.reduce(function (a, f) { return a + f.valor; }, 0);
    function p(a, off) { return [cx + rx * Math.cos(a), cy + ry * Math.sin(a) + (off || 0)]; }
    var a = -Math.PI / 2, arcs = [];
    o.fatias.forEach(function (f, i) { var a2 = a + 2 * Math.PI * f.valor / tot; arcs.push({ a1: a, a2: a2, f: f, c: cores[i % cores.length] }); a = a2; });
    // laterais visíveis (sin > 0)
    arcs.forEach(function (s) {
      [[0, Math.PI], [2 * Math.PI, 3 * Math.PI]].forEach(function (vis) {
        var lo = Math.max(s.a1, vis[0]), hi = Math.min(s.a2, vis[1]);
        if (hi <= lo) return;
        var A = p(lo), Bp = p(hi), large = hi - lo > Math.PI ? 1 : 0;
        el('path', { d: 'M' + A + ' A' + rx + ' ' + ry + ' 0 ' + large + ' 1 ' + Bp + ' L' + p(hi, depth) + ' A' + rx + ' ' + ry + ' 0 ' + large + ' 0 ' + p(lo, depth) + ' Z', fill: shade(s.c, 0.72) }, svg);
      });
    });
    arcs.forEach(function (s) {
      var A = p(s.a1), Bp = p(s.a2), large = s.a2 - s.a1 > Math.PI ? 1 : 0;
      var g = el('g', {}, svg);
      el('title', {}, g, s.f.nome + ': ' + fmt(s.f.valor) + ' (' + fmt(100 * s.f.valor / tot, 1) + '%)');
      el('path', { d: 'M' + cx + ',' + cy + ' L' + A + ' A' + rx + ' ' + ry + ' 0 ' + large + ' 1 ' + Bp + ' Z', fill: s.c, stroke: shade(s.c, 0.75), 'stroke-width': 0.8 }, g);
      var m = (s.a1 + s.a2) / 2, lp = [cx + rx * 0.62 * Math.cos(m), cy + ry * 0.62 * Math.sin(m) + 4];
      if (s.a2 - s.a1 > 0.35) el('text', { x: lp[0], y: lp[1], 'text-anchor': 'middle', fill: ink, 'font-weight': 600 }, g, fmt(100 * s.f.valor / tot, 0) + '%');
    });
    // legenda vertical à direita
    var lx = cx + rx + 28, ly = 26;
    arcs.forEach(function (s, i) {
      el('rect', { x: lx, y: ly + i * 22 - 9, width: 10, height: 10, fill: s.c, stroke: shade(s.c, 0.7) }, svg);
      el('text', { x: lx + 16, y: ly + i * 22, fill: ink }, svg, s.f.nome);
    });
    return svg;
  }

  /* Área 3D em faixas (uma faixa por série, da mais distante para a mais próxima). opts: {categorias, series:[{nome, valores}], largura, altura} */
  function Area3D(host, o) {
    var W = o.largura || 560, H = o.altura || 300, ns = o.series.length, d = 16;
    var svg = base(host, W, H), cores = palette(o);
    var wall = cssVar('chart-wall', '#d3dfed'), floor = cssVar('chart-floor', '#adbbcf'), axis = cssVar('chart-axis', '#8495b0'), ink = cssVar('ink', '#1f2026');
    var tdx = d * ns, tdy = -d * 0.7 * ns;
    var L = 52, R = 16 + tdx, T = 16 - tdy, B = 54, x0 = L, y0 = H - B, pw = W - L - R, ph = H - T - B;
    var max = 0; o.series.forEach(function (s) { s.valores.forEach(function (v) { max = Math.max(max, v); }); });
    var top = nice(max), steps = 4, n = o.categorias.length;
    el('polygon', { points: [x0 + tdx, y0 + tdy, x0 + tdx, y0 - ph + tdy, x0 + pw + tdx, y0 - ph + tdy, x0 + pw + tdx, y0 + tdy].join(' '), fill: wall }, svg);
    el('polygon', { points: [x0, y0, x0 + tdx, y0 + tdy, x0 + pw + tdx, y0 + tdy, x0 + pw, y0].join(' '), fill: floor }, svg);
    for (var i = 0; i <= steps; i++) {
      var yy = y0 - ph * i / steps;
      el('line', { x1: x0 + tdx, y1: yy + tdy, x2: x0 + pw + tdx, y2: yy + tdy, stroke: axis, 'stroke-width': 0.6 }, svg);
      el('line', { x1: x0, y1: yy, x2: x0 + tdx, y2: yy + tdy, stroke: axis, 'stroke-width': 0.6 }, svg);
      el('text', { x: x0 - 6, y: yy + 4, 'text-anchor': 'end', fill: ink }, svg, fmt(top * i / steps));
    }
    for (var si = ns - 1; si >= 0; si--) {
      var s = o.series[si], col = cores[si % cores.length], ox = d * si, oy = -d * 0.7 * si;
      var pts = s.valores.map(function (v, k) { return [x0 + ox + pw * k / (n - 1), y0 + oy - ph * v / top]; });
      for (var k = 0; k < n - 1; k++) {
        var a = pts[k], b = pts[k + 1];
        el('polygon', { points: [a, [a[0] + d, a[1] - d * 0.7], [b[0] + d, b[1] - d * 0.7], b].join(' '), fill: shade(col, 1.3), stroke: shade(col, 0.8), 'stroke-width': 0.5 }, svg);
      }
      var g = el('g', {}, svg);
      el('title', {}, g, s.nome);
      el('polygon', { points: [[x0 + ox, y0 + oy]].concat(pts, [[x0 + ox + pw, y0 + oy]]).join(' '), fill: col, stroke: shade(col, 0.75), 'stroke-width': 0.8 }, g);
      el('polygon', { points: [pts[n - 1], [pts[n - 1][0] + d, pts[n - 1][1] - d * 0.7], [x0 + ox + pw + d, y0 + oy - d * 0.7], [x0 + ox + pw, y0 + oy]].join(' '), fill: shade(col, 0.72) }, svg);
    }
    o.categorias.forEach(function (c, k) { el('text', { x: x0 + pw * k / (n - 1), y: y0 + 18, 'text-anchor': 'middle', fill: ink }, svg, c); });
    legenda(svg, L, H - 12, o.series.map(function (s) { return s.nome; }), cores);
    return svg;
  }


  /* Menu lateral recolhível. Liga os eventos à marcação .rp-shell (ver guia do componente).
     - clicar numa aba do trilho abre a gaveta naquela vista; clicar de novo na aba ativa recolhe;
     - o botão ◂ recolhe; um grupo aberto por vez no acordeão; Esc recolhe. */
  function MenuLateral(shell) {
    var drawer = shell.querySelector('.rp-drawer');
    var tabs = [].slice.call(shell.querySelectorAll('.rp-rail-tab'));
    var views = [].slice.call(shell.querySelectorAll('.rp-drawer-view'));
    function show(id) {
      var open = drawer.getAttribute('data-open') === 'true';
      var cur = (tabs.filter(function (t) { return t.getAttribute('aria-selected') === 'true'; })[0] || {}).dataset;
      if (open && cur && cur.view === id) { fechar(); return; }
      tabs.forEach(function (t) { t.setAttribute('aria-selected', t.dataset.view === id ? 'true' : 'false'); });
      views.forEach(function (v) { v.setAttribute('data-active', v.dataset.view === id ? 'true' : 'false'); });
      drawer.setAttribute('data-open', 'true');
    }
    function fechar() {
      drawer.setAttribute('data-open', 'false');
      tabs.forEach(function (t) { t.setAttribute('aria-selected', 'false'); });
    }
    tabs.forEach(function (t) {
      t.setAttribute('role', 'tab'); t.tabIndex = 0;
      t.addEventListener('click', function () { show(t.dataset.view); });
      t.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); show(t.dataset.view); } });
    });
    var btn = shell.querySelector('.rp-drawer-close');
    if (btn) btn.addEventListener('click', fechar);
    shell.addEventListener('keydown', function (e) { if (e.key === 'Escape') fechar(); });
    [].slice.call(shell.querySelectorAll('.rp-nav-group > .rp-nav-item')).forEach(function (h) {
      h.tabIndex = 0;
      function tog() {
        var g = h.parentNode, was = g.getAttribute('data-open') === 'true';
        [].slice.call(g.parentNode.children).forEach(function (s) { s.setAttribute && s.setAttribute('data-open', 'false'); s.firstElementChild && s.firstElementChild.setAttribute('aria-expanded', 'false'); });
        g.setAttribute('data-open', was ? 'false' : 'true');
        h.setAttribute('aria-expanded', was ? 'false' : 'true');
        var ic = h.querySelector('.rp-ico-w-pasta, .rp-ico-w-pasta-aberta');
        if (ic) { [].slice.call(g.parentNode.querySelectorAll('.rp-ico-w-pasta-aberta')).forEach(function (x) { x.className = 'rp-ico rp-ico-w-pasta'; }); if (!was) ic.className = 'rp-ico rp-ico-w-pasta-aberta'; }
      }
      h.addEventListener('click', tog);
      h.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); tog(); } });
    });
    return { abrir: show, fechar: fechar };
  }

  /* Rosca 3D (donut). opts: {fatias:[{nome,valor}], largura, altura, profundidade, furo (0–0.8), centro:{titulo,valor}} */
  function Rosca3D(host, o) {
    var W = o.largura || 420, H = o.altura || 280, depth = o.profundidade || 20, hole = o.furo || 0.55;
    var svg = base(host, W, H), cores = palette(o), ink = cssVar('ink', '#1f2026'), mut = cssVar('ink-muted', '#62656c');
    var cx = W * 0.36, cy = (H - 40) / 2 - 4, rx = Math.min(W * 0.3, 150), ry = rx * 0.55, ix = rx * hole, iy = ry * hole;
    var tot = o.fatias.reduce(function (a, f) { return a + f.valor; }, 0);
    function p(r1, r2, a, off) { return [cx + r1 * Math.cos(a), cy + r2 * Math.sin(a) + (off || 0)]; }
    var a = -Math.PI / 2, arcs = [];
    o.fatias.forEach(function (f, i) { var a2 = a + 2 * Math.PI * f.valor / tot; arcs.push({ a1: a, a2: a2, f: f, c: cores[i % cores.length] }); a = a2; });
    arcs.forEach(function (s) {
      [[0, Math.PI], [2 * Math.PI, 3 * Math.PI]].forEach(function (vis) {
        var lo = Math.max(s.a1, vis[0]), hi = Math.min(s.a2, vis[1]);
        if (hi <= lo) return;
        var large = hi - lo > Math.PI ? 1 : 0;
        el('path', { d: 'M' + p(rx, ry, lo) + ' A' + rx + ' ' + ry + ' 0 ' + large + ' 1 ' + p(rx, ry, hi) + ' L' + p(rx, ry, hi, depth) + ' A' + rx + ' ' + ry + ' 0 ' + large + ' 0 ' + p(rx, ry, lo, depth) + ' Z', fill: shade(s.c, 0.72) }, svg);
      });
    });
    arcs.forEach(function (s) {
      var large = s.a2 - s.a1 > Math.PI ? 1 : 0, g = el('g', {}, svg);
      el('title', {}, g, s.f.nome + ': ' + fmt(s.f.valor) + ' (' + fmt(100 * s.f.valor / tot, 1) + '%)');
      el('path', { d: 'M' + p(rx, ry, s.a1) + ' A' + rx + ' ' + ry + ' 0 ' + large + ' 1 ' + p(rx, ry, s.a2) + ' L' + p(ix, iy, s.a2) + ' A' + ix + ' ' + iy + ' 0 ' + large + ' 0 ' + p(ix, iy, s.a1) + ' Z', fill: s.c, stroke: shade(s.c, 0.75), 'stroke-width': 0.8 }, g);
    });
    if (o.centro) {
      var C = typeof o.centro === 'string' ? { valor: o.centro, titulo: '' } : o.centro;
      el('text', { x: cx, y: cy + (C.titulo ? -2 : 5), 'text-anchor': 'middle', fill: ink, 'font-size': 18, 'font-weight': 600 }, svg, C.valor);
      if (C.titulo) el('text', { x: cx, y: cy + 14, 'text-anchor': 'middle', fill: mut }, svg, C.titulo);
    }
    var lx = cx + rx + 28;
    arcs.forEach(function (s, i) {
      el('rect', { x: lx, y: 26 + i * 22 - 9, width: 10, height: 10, fill: s.c, stroke: shade(s.c, 0.7) }, svg);
      el('text', { x: lx + 16, y: 26 + i * 22, fill: ink }, svg, s.f.nome);
    });
    return svg;
  }

  /* Colunas empilhadas 3D. opts: {categorias, series:[{nome,valores}], largura, altura, profundidade, unidade} */
  function Empilhadas3D(host, o) {
    var W = o.largura || 560, H = o.altura || 300, d = o.profundidade || 12, dx = d, dy = -d * 0.7;
    var svg = base(host, W, H), cores = palette(o);
    var wall = cssVar('chart-wall', '#d3dfed'), floor = cssVar('chart-floor', '#adbbcf'), axis = cssVar('chart-axis', '#8495b0'), ink = cssVar('ink', '#1f2026');
    var L = 52, R = 16 + dx, T = 18 - dy, B = 54, x0 = L, y0 = H - B, pw = W - L - R, ph = H - T - B;
    var totais = o.categorias.map(function (c, ci) { return o.series.reduce(function (a, s) { return a + s.valores[ci]; }, 0); });
    var top = nice(Math.max.apply(null, totais)), steps = 5, nc = o.categorias.length, bw = Math.min(46, pw / nc * 0.5);
    el('polygon', { points: [x0 + dx, y0 + dy, x0 + dx, y0 - ph + dy, x0 + pw + dx, y0 - ph + dy, x0 + pw + dx, y0 + dy].join(' '), fill: wall }, svg);
    el('polygon', { points: [x0, y0, x0 + dx, y0 + dy, x0 + pw + dx, y0 + dy, x0 + pw, y0].join(' '), fill: floor }, svg);
    for (var i = 0; i <= steps; i++) {
      var yy = y0 - ph * i / steps;
      el('polyline', { points: [x0, yy, x0 + dx, yy + dy, x0 + pw + dx, yy + dy].join(' '), fill: 'none', stroke: axis, 'stroke-width': 0.6 }, svg);
      el('text', { x: x0 - 6, y: yy + 4, 'text-anchor': 'end', fill: ink }, svg, fmt(top * i / steps));
    }
    o.categorias.forEach(function (c, ci) {
      var x = x0 + (ci + 0.5) * (pw / nc) - bw / 2, acc = 0;
      o.series.forEach(function (s, si) {
        var v = s.valores[ci], h = ph * v / top, yb = y0 - ph * acc / top, y = yb - h, col = cores[si % cores.length];
        var g = el('g', {}, svg);
        el('title', {}, g, s.nome + ' · ' + c + ': ' + fmt(v) + (o.unidade ? ' ' + o.unidade : ''));
        el('polygon', { points: [x + bw, y, x + bw + dx, y + dy, x + bw + dx, yb + dy, x + bw, yb].join(' '), fill: shade(col, 0.72) }, g);
        el('polygon', { points: [x, y, x + dx, y + dy, x + bw + dx, y + dy, x + bw, y].join(' '), fill: shade(col, 1.35) }, g);
        el('rect', { x: x, y: y, width: bw, height: h, fill: col, stroke: shade(col, 0.8), 'stroke-width': 0.5 }, g);
        acc += v;
      });
      el('text', { x: x + bw / 2, y: y0 + 18, 'text-anchor': 'middle', fill: ink }, svg, c);
    });
    legenda(svg, L, H - 12, o.series.map(function (s) { return s.nome; }), cores);
    return svg;
  }

  /* Linha simples (2D) com marcadores. opts: {categorias, series:[{nome,valores}], largura, altura, unidade} */
  function Linha(host, o) {
    var W = o.largura || 560, H = o.altura || 260;
    var svg = base(host, W, H), cores = palette(o);
    var axis = cssVar('chart-axis', '#8495b0'), ink = cssVar('ink', '#1f2026'), grid = cssVar('grid-rule', '#c1c8d3');
    var L = 52, R = 16, T = 16, B = 48, x0 = L, y0 = H - B, pw = W - L - R, ph = H - T - B;
    var max = 0; o.series.forEach(function (s) { s.valores.forEach(function (v) { max = Math.max(max, v); }); });
    var top = nice(max), steps = 4, n = o.categorias.length;
    el('rect', { x: x0, y: y0 - ph, width: pw, height: ph, fill: cssVar('field', '#fff') }, svg);
    for (var i = 0; i <= steps; i++) {
      var yy = y0 - ph * i / steps;
      el('line', { x1: x0, y1: yy, x2: x0 + pw, y2: yy, stroke: grid, 'stroke-width': 0.8 }, svg);
      el('text', { x: x0 - 6, y: yy + 4, 'text-anchor': 'end', fill: ink }, svg, fmt(top * i / steps));
    }
    el('line', { x1: x0, y1: y0, x2: x0 + pw, y2: y0, stroke: axis, 'stroke-width': 1 }, svg);
    o.series.forEach(function (s, si) {
      var col = cores[si % cores.length], dark = shade(col, 0.7);
      var pts = s.valores.map(function (v, k) { return [x0 + pw * k / (n - 1), y0 - ph * v / top]; });
      var g = el('g', {}, svg);
      el('title', {}, g, s.nome);
      el('polyline', { points: pts.join(' '), fill: 'none', stroke: dark, 'stroke-width': 2, 'stroke-linejoin': 'round' }, g);
      pts.forEach(function (P, k) {
        var pm = el('circle', { cx: P[0], cy: P[1], r: 3.2, fill: col, stroke: dark, 'stroke-width': 1 }, g);
        el('title', {}, pm, s.nome + ' · ' + o.categorias[k] + ': ' + fmt(s.valores[k]) + (o.unidade ? ' ' + o.unidade : ''));
      });
    });
    o.categorias.forEach(function (c, k) { el('text', { x: x0 + pw * k / (n - 1), y: y0 + 16, 'text-anchor': 'middle', fill: ink }, svg, c); });
    legenda(svg, L, H - 10, o.series.map(function (s) { return s.nome; }), cores);
    return svg;
  }


  /* Dica de valores: converte os <title> em data-tip e mostra uma caixa que segue o mouse */
  function ligarDica(host, svg) {
    if (!host || !svg || host.querySelector('.rp-chart-tip')) return svg;
    var tip = document.createElement('div');
    tip.className = 'rp-chart-tip';
    tip.setAttribute('aria-hidden', 'true');
    if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
    host.appendChild(tip);
    [].slice.call(svg.querySelectorAll('title')).forEach(function (t) {
      var g = t.parentNode;
      if (g && g.setAttribute) { g.setAttribute('data-tip', t.textContent); g.setAttribute('aria-label', t.textContent); }
      t.parentNode.removeChild(t);
    });
    function esconder() { tip.classList.remove('rp-chart-tip--on'); }
    svg.addEventListener('mousemove', function (e) {
      var el = e.target && e.target.closest ? e.target.closest('[data-tip]') : null;
      if (!el) { esconder(); return; }
      tip.textContent = el.getAttribute('data-tip');
      var b = host.getBoundingClientRect();
      var x = e.clientX - b.left + 12, y = e.clientY - b.top + 14;
      if (x + tip.offsetWidth > host.clientWidth - 4) x = Math.max(4, host.clientWidth - tip.offsetWidth - 4);
      if (y + tip.offsetHeight > host.clientHeight - 2) y = e.clientY - b.top - tip.offsetHeight - 10;
      tip.style.left = x + 'px'; tip.style.top = y + 'px';
      tip.classList.add('rp-chart-tip--on');
    });
    svg.addEventListener('mouseleave', esconder);
    return svg;
  }
  function comDica(fn) {
    return function (host, o) { return ligarDica(host, fn(host, o)); };
  }

  window.RendaERP = { versao: '2.1', Barras3D: comDica(Barras3D), Pizza3D: comDica(Pizza3D), Area3D: comDica(Area3D), Rosca3D: comDica(Rosca3D), Empilhadas3D: comDica(Empilhadas3D), Linha: comDica(Linha), MenuLateral: MenuLateral, formatar: fmt };
})();
