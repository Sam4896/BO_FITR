/* Shared posterior-map illustration. Drawing positions are schematic, not distances. */
(function (root) {
  'use strict';
  const namespace = 'http://www.w3.org/2000/svg';
  function element(tag, attributes, text) {
    const node = document.createElementNS(namespace, tag);
    Object.entries(attributes || {}).forEach(([name, value]) => node.setAttribute(name, value));
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function mathLabel(svg, x, y, width, expression) {
    const foreign = element('foreignObject', { x, y, width, height: 32 });
    const label = document.createElementNS('http://www.w3.org/1999/xhtml', 'div');
    label.className = 'bridge-math'; label.innerHTML = PaperNotation.inline(expression);
    foreign.append(label); svg.append(foreign);
  }

  /** Update two actual Gaussian densities and their schematic links to input points. */
  function render(selected, reference) {
    const svg = document.getElementById('posterior-bridge-svg');
    const color = '#117870', referenceColor = '#465b98';
    if (!svg.dataset.ready) {
      svg.dataset.ready = 'true';
      svg.append(element('path', { d: 'M85 176 C112 112 202 150 271 138 C346 120 406 153 477 137 C558 120 609 150 601 190 C554 227 447 196 378 208 C304 224 251 188 191 213 C133 233 89 205 85 176Z', fill: '#f0f2fa', stroke: '#8794ad', 'stroke-width': 1.5 }));
      svg.append(element('path', { d: 'M30 321 L140 264 L612 264 L515 321Z', fill: '#f7f7f4', stroke: '#879491', 'stroke-width': 1.5 }));
      svg.append(element('text', { x: 500, y: 178, 'text-anchor': 'middle', class: 'bridge-caption' }, 'Statistical manifold'));
      svg.append(element('text', { x: 380, y: 311, class: 'bridge-caption' }, 'Input space'));
      const definitions = element('defs');
      const arrow = element('marker', { id: 'posterior-map-arrow', viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 6, markerHeight: 6, orient: 'auto' });
      arrow.append(element('path', { d: 'M0 0 L10 5 L0 10Z', fill: color }));
      definitions.append(arrow); svg.append(definitions);
      svg.append(element('path', { d: 'M120 282 C78 259 80 219 130 192', fill: 'none', stroke: color, 'stroke-width': 2, 'marker-end': 'url(#posterior-map-arrow)' }));
      mathLabel(svg, 8, 224, 65, String.raw`\manifoldmap_{\boiteration}`);
      mathLabel(svg, 100, 160, 40, String.raw`\manifold`);
      mathLabel(svg, 42, 286, 110, String.raw`\inpvarsset`);
      mathLabel(svg, 160, 0, 400, String.raw`\text{Predictive distributions }\probability(\obsouts;\cusvector{\manifoldparameters})`);
      const dynamic = element('g', { id: 'bridge-dynamic' }); svg.append(dynamic);
    }
    const dynamic = document.getElementById('bridge-dynamic'); dynamic.replaceChildren();
    const peak = Math.max(1 / Math.sqrt(2 * Math.PI * selected.variance), 1 / Math.sqrt(2 * Math.PI * reference.variance));
    [selected, reference].forEach((state, index) => {
      const shade = index ? referenceColor : color, left = index ? 395 : 150;
      dynamic.append(element('rect', { x: left - 10, y: 32, width: 194, height: 76, rx: 7, fill: '#fff', stroke: '#c4ccca' }));
      let path = '';
      for (let sample = 0; sample <= 150; sample++) {
        const output = -2.6 + sample / 150 * 5.2;
        const density = PaperModel.normalPdf((output - state.mean) / Math.sqrt(state.variance)) / Math.sqrt(state.variance);
        path += `${sample ? 'L' : 'M'}${left + sample / 150 * 170},${95 - density / peak * 50}`;
      }
      dynamic.append(element('path', { d: path, fill: 'none', stroke: shade, 'stroke-width': 2 }));
      dynamic.append(element('line', { x1: left, x2: left + 170, y1: 95, y2: 95, stroke: '#bac2bf' }));
      const inputX = 90 + state.input * 480;
      const predictiveX = Math.max(160, Math.min(555, 225 + state.mean * 210));
      const predictiveY = 186 - 30 * state.variance;
      dynamic.append(element('line', { x1: inputX, y1: 290, x2: predictiveX, y2: predictiveY, stroke: shade, 'stroke-width': 1.5, 'stroke-dasharray': '5 4' }));
      dynamic.append(element('line', { x1: predictiveX, y1: predictiveY, x2: left + 85, y2: 109, stroke: shade, opacity: 0.4 }));
      dynamic.append(element('circle', { cx: inputX, cy: 290, r: 5, fill: shade, stroke: '#fff', 'stroke-width': 2 }));
      dynamic.append(element('circle', { cx: predictiveX, cy: predictiveY, r: 5, fill: shade, stroke: '#fff', 'stroke-width': 2 }));
      dynamic.append(element('text', { x: index ? inputX + 10 : Math.max(110, inputX - 10), y: index ? 280 : 312,
        'text-anchor': index ? 'start' : 'end', style: `fill:${shade}`, class: 'bridge-caption' }, index ? 'reference input' : 'selected input'));
    });
  }
  root.PaperBridge = { render };
})(window);
