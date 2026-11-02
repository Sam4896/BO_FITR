(function () {
  'use strict';
  const byId = id => document.getElementById(id);
  const svgNamespace = 'http://www.w3.org/2000/svg';
  const colors = {
    mean: '#465b98', map: '#8565a7', gradient: '#c9603c', bound: '#147c74',
    ink: '#26333a', violet: '#8565a7', indigo: '#465b98', teal: '#147c74',
    natural: '#8565a7', test: '#2a9d8f', muted: '#9aa5a5',
    acqfGradient: '#b23a9b', trace: '#4d6fb3'
  };
  const bounds1d = { left: 74, right: 480, top: 22, bottom: 244 };
  const bounds2d = { left: 74, right: 480, top: 22, bottom: 244 };
  const query = new URLSearchParams(location.search);
  const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));
  const numberFromQuery = (key, fallback, minimum, maximum) => {
    const value = Number(query.get(key));
    return query.has(key) && Number.isFinite(value) ? clamp(value, minimum, maximum) : fallback;
  };

  const experience = document.body.dataset.experience || 'overview';
  const sceneOrder = experience === 'fitr' ? [3, 4, 5] : [0, 1, 2, 6];
  const firstScene = sceneOrder[0];
  const lastScene = sceneOrder[sceneOrder.length - 1];

  const state = {
    input: numberFromQuery('x', 0.38, 0, 1),
    lengthscale: numberFromQuery('lengthscale', 0.1, 0.06, 0.3),
    acquisition: ['EI', 'UCB', 'PI'].includes(query.get('acquisition')) ? query.get('acquisition') : 'EI',
    scene: sceneOrder.includes(Number(query.get('scene'))) ? Number(query.get('scene')) : firstScene,
    mathematics: false,
    playing: false,
    showUpperBound: true,
    showPullbackTrace: true,
    input2d: [numberFromQuery('x1', 0.45, 0, 1), numberFromQuery('x2', 0.55, 0, 1)],
    lambda1: numberFromQuery('l1', 0.18, 0.08, 0.45),
    lambda2: numberFromQuery('l2', 0.3, 0.08, 0.45),
    lensDimension: Math.round(numberFromQuery('ldx', 64, 2, 256)),
    lensActive: Math.round(numberFromQuery('lm', 20, 1, 40)),
    lensRadius: numberFromQuery('lr', 0.25, 0.05, 0.5),
    lensLengthscale: numberFromQuery('lell', 0.35, 0.2, 0.8),
    stationaryPointIndex: Math.round(numberFromQuery('sp', 0, 0, 8)),
    stationarySelectionMode: query.get('smode') === 'free' ? 'free' : 'stationary',
    stationaryInput: [numberFromQuery('sx1', 0.5, 0, 1), numberFromQuery('sx2', 0.5, 0, 1)],
    psiDegrees: numberFromQuery('psi', 0, 0, 360),
    stationaryPreset: query.get('preset') || 'cancellation',
    highDimDx: Math.round(numberFromQuery('dx', 32, 2, 256)),
    highDimP: query.has('p') ? Number(query.get('p')) : 0.5,
    fitrCenter: [numberFromQuery('fx1', 0.5, 0, 1), numberFromQuery('fx2', 0.5, 0, 1)],
    fitrKernel: ['IBNN', 'WARPED'].includes(query.get('kernel')) ? 'IBNN' : 'SE',
    fitrKappa: numberFromQuery('kappa', 0.28, 0.12, 0.55)
  };
  if (![0, 0.5, 1].includes(state.highDimP)) state.highDimP = 0.5;

  let predict, grid, chartScales, predict2D, stationaryExample, animationFrame, previousFrameTime, lastRenderedTime = 0;
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

  const pageCount = 6;
  const boPhases = ['Fit the model', 'Choose the next setting', 'Run the experiment', 'Update the data'];
  const boDescriptions = [
    'Use the measured responses to update the model and its uncertainty.',
    'Select the setting with the largest expected improvement on the displayed grid.',
    'Run the experiment at that setting and measure its response.',
    'Add the new setting and response to the data. Then fit the model again.'
  ];
  const boLoop = {
    observations: PaperModel.boLoopInitialObservations.map(point => ({ ...point })),
    fittedObservations: PaperModel.boLoopInitialObservations.map(point => ({ ...point })),
    completed: false,
    pendingObservation: null,
    iteration: 1,
    phase: 0,
    candidateInput: null,
    playing: false,
    timer: null
  };

  const pages = [
    { kicker: '01 / 06', title: 'Bayesian optimization loop', short: 'BO loop',
      source: 'Paper: Preliminaries · Bayesian optimization', focus: [] },
    { kicker: '02 / 06', title: 'Diving deeper into Bayesian Optimization', short: 'Deep dive',
      source: 'Paper: posterior map · pullback tensor', focus: ['prediction-card', 'acquisition-card', 'map-card'] },
    { kicker: '03 / 06', title: 'Gradient bound & complete proof', short: 'Proof',
      source: 'Paper: Proposition 4.2 · Appendix D.2–D.4', focus: ['prediction-card', 'acquisition-card', 'map-card', 'bound-card'] },
    { kicker: '04 / 06', title: 'RAASP and square-root lengthscale scaling',
      text: 'RAASP keeps candidate locations near observed data. Square-root lengthscale scaling changes the model. Both can be understood through the pullback trace.',
      detail: 'A larger trace preserves the possibility of an acquisition gradient; it does not guarantee one or establish better BO performance.',
      mathDetail: 'The plots show the computed mean pullback trace of a controlled GP. Local sampling changes the query locations; lengthscale scaling changes the posterior. The critical-rate interpretation is conditional on the assumptions in the paper.',
      citations: [
        {
          topic: 'Dimensionally scaled priors',
          references: [
            { label: 'Hvarfner et al. (2024)', title: 'Vanilla Bayesian Optimization Performs Great in High Dimensions', url: 'https://arxiv.org/abs/2402.02229' },
            { label: 'Xu et al. (2024)', title: 'Standard Gaussian Process Is All You Need for High-Dimensional Bayesian Optimization', url: 'https://arxiv.org/abs/2402.02746' },
            { label: 'Papenmeier et al. (2025)', title: 'Understanding High-Dimensional Bayesian Optimization', url: 'https://arxiv.org/abs/2502.09198' }
          ]
        },
        {
          topic: 'RAASP',
          references: [
            { label: 'Papenmeier et al. (2025)', title: 'Understanding High-Dimensional Bayesian Optimization', url: 'https://arxiv.org/abs/2502.09198' }
          ]
        }
      ],
      equation: 'bound', source: 'Paper: unified FIM-based HDBO analysis · high-dimensional scaling appendix', focus: ['advanced-card-a', 'advanced-card-b', 'advanced-card-c', 'advanced-card-d'] },
    { kicker: '05 / 06', title: 'Gradient Bound using Eigenvalues and Geometric Interpretation at Stationary Points',
      text: 'The acquisition gradient factors as Aᵀu, while the 2×2 companion matrix M = AAᵀ records how predictive-parameter directions map back to input space. A linked 2D GP example shows where interior stationary points occur and why nonzero predictive gradients must oppose there.',
      detail: 'The marked points show the nondegenerate cancellation branch. Points where both predictive gradients vanish are a separate stationary branch and are not marked.',
      mathDetail: 'At an interior stationary point with u ≠ 0, Aᵀu = 0 implies Mu = 0. For a scalar Gaussian predictive, the Fisher-scaled mean and variance rows of A are collinear; monotone acquisition derivatives force opposite input-space orientation.',
      equation: 'rayleigh', source: '', focus: [] },
    { kicker: '06 / 06', title: 'FITR: trust regions from predictive geometry',
      text: 'The gradient bound identifies the local predictive sensitivity. FITR uses this geometry to shape the region searched for the next candidate.',
      detail: 'Click plot A to move the center. The trust-region size follows the usual TuRBO rule; FITR changes its coordinate weights.',
      mathDetail: 'FITR uses the regularized diagonal of the pullback Fisher tensor, then normalizes the coordinate weights to preserve volume before clipping to the input domain.',
      equation: 'fitr', source: 'Paper: Section 5, Table 2, and implementation details', focus: ['advanced-card-a'] }

  ];
  pages.push({ title: 'Explore the results', short: 'Explore', source: '', focus: [] });

  const proofSteps = [
    { name: 'Chain rule', equation: 'chain',
      takeaway: 'An input change first changes what the model predicts. The acquisition responds to those changed predictions. Its gradient combines both responses.',
      takeawayDetail: 'The posterior map connects the input space to the predictive space. The acquisition is evaluated on the predictive distribution.',
      text: 'An input change first changes the predictive parameters. The acquisition then responds to those changes. The chain rule links these two effects.',
      detail: 'The Jacobian describes the posterior map. The parameter gradient describes the acquisition. This displayed form is for the analytic acquisitions in the example.' },
    { name: 'Fisher metric insertion', equation: 'factors',
      takeaway: 'The Fisher metric measures local changes in a predictive distribution while accounting for its uncertainty. We use it to express the two responses in compatible units.',
      takeawayDetail: 'This rewrites the same acquisition gradient. The upper bound has not yet been introduced.',
      text: 'Measure predictive changes using the Fisher metric. This separates the gradient into a surrogate-dependent matrix and an acquisition-dependent vector, while preserving the original gradient.',
      detail: 'A is the posterior-map Jacobian multiplied on the left by the Fisher matrix square root. u is the acquisition parameter gradient multiplied by the inverse square root. Their product recovers the chain rule.' },
    { name: 'Cauchy–Schwarz', equation: 'cauchy',
      takeaway: 'Combining the sizes of the two responses gives an upper bound. The bound can exceed the actual gradient because the mean and variance contributions can cancel.',
      takeawayDetail: 'The bound limits how large the gradient can be. It does not promise that the gradient will be large.',
      text: 'The matrix and vector norms give an upper bound on their product. This step discards their relative direction, so the upper bound can exceed the actual gradient.',
      detail: 'The squared Frobenius norm of A is the pullback trace. Equality holds if u is zero or every column of A is a scalar multiple of u.' },
    { name: 'Jensen’s inequality', equation: 'jensen',
      takeaway: 'The paper also covers acquisitions written as averages over random samples. Bounding an average can add slack. For the analytic acquisitions shown here, that additional slack is zero.',
      takeawayDetail: 'The remaining gap in these plots comes from the preceding step. The prototype does not estimate a sampling gap.',
      text: 'For a Monte Carlo representation, Jensen’s inequality bounds the squared norm of the mean parameter gradient by its mean squared norm.',
      detail: 'The analytic acquisitions shown here have no base-sample dependence, so this step is an equality. Their remaining slack comes from the preceding matrix–vector bound. This prototype does not estimate a Monte Carlo gap.' }
  ];

  function svgElement(tag, attributes = {}, text) {
    const element = document.createElementNS(svgNamespace, tag);
    Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, value));
    if (text !== undefined) element.textContent = text;
    return element;
  }

  function setLegend(id, items) {
    const legend = byId(id);
    legend.replaceChildren();
    items.forEach(item => {
      const key = document.createElement('span');
      key.className = `legend-key${item.kind === 'dashed' ? ' is-dashed' : ''}${item.kind === 'dot' ? ' is-dot' : ''}${item.kind === 'fill' ? ' is-fill' : ''}`;
      key.style.setProperty('--legend-color', item.color);
      key.textContent = item.label;
      legend.append(key);
    });
  }

  const format = value => value === 0 ? '0' : Math.abs(value) < 0.001 || Math.abs(value) >= 1000 ? value.toExponential(2) : Number(value.toPrecision(4)).toString();
  const tickFormat = value => Math.abs(value) < 1e-10 ? '0' : Number(value.toPrecision(2)).toString();
  const scale = (minimum, maximum, start, end) => value => start + (value - minimum) / (maximum - minimum) * (end - start);
  const isPage0 = () => state.scene === 0;
  const isDeepDivePage = () => state.scene === 1 || state.scene === 2;
  const isAdvancedPage = () => experience === 'fitr';

  function renderEquation(key, label) {
    try {
      const html = PaperNotation.render(key, label);
      if (html && !/undefined/.test(html)) return html;
    } catch (_) { /* notation key may be added asynchronously */ }
    return `<math xmlns="http://www.w3.org/1998/Math/MathML" display="block" aria-label="${label}"><mtext>${key}</mtext></math>`;
  }

  function setupChart(id, horizontalDomain, verticalDomain, horizontalLabel, verticalLabel, box = bounds1d) {
    const svg = byId(id);
    svg.replaceChildren();
    const horizontal = scale(...horizontalDomain, box.left, box.right);
    const vertical = scale(...verticalDomain, box.bottom, box.top);
    const definitions = svgElement('defs');
    const clip = svgElement('clipPath', { id: `${id}-clip` });
    clip.append(svgElement('rect', { x: box.left, y: box.top, width: box.right - box.left, height: box.bottom - box.top }));
    definitions.append(clip); svg.append(definitions);
    for (let index = 0; index <= 4; index++) {
      const horizontalValue = horizontalDomain[0] + index / 4 * (horizontalDomain[1] - horizontalDomain[0]);
      const verticalValue = verticalDomain[0] + index / 4 * (verticalDomain[1] - verticalDomain[0]);
      svg.append(svgElement('line', { x1: box.left, x2: box.right, y1: vertical(verticalValue), y2: vertical(verticalValue), class: 'grid-line' }));
      svg.append(svgElement('text', { x: box.left - 10, y: vertical(verticalValue) + 3, 'text-anchor': 'end' }, tickFormat(verticalValue)));
      svg.append(svgElement('text', { x: horizontal(horizontalValue), y: box.bottom + 22, 'text-anchor': 'middle' }, tickFormat(horizontalValue)));
    }
    svg.append(svgElement('line', { x1: box.left, x2: box.right, y1: box.bottom, y2: box.bottom, class: 'axis-line' }));
    svg.append(svgElement('text', { x: (box.left + box.right) / 2, y: 288, 'text-anchor': 'middle', class: 'axis-label' }, horizontalLabel));
    svg.append(svgElement('text', { x: 18, y: (box.top + box.bottom) / 2, transform: `rotate(-90 18 ${(box.top + box.bottom) / 2})`, 'text-anchor': 'middle', class: 'axis-label' }, verticalLabel));
    const data = svgElement('g', { 'clip-path': `url(#${id}-clip)` });
    const selection = svgElement('g', { 'clip-path': `url(#${id}-clip)` });
    svg.append(data, selection);
    return { svg, horizontal, vertical, data, selection, box, horizontalDomain, verticalDomain };
  }

  function curvePath(samples, chart, horizontalValue, verticalValue) {
    return samples.map((point, index) => `${index ? 'L' : 'M'}${chart.horizontal(horizontalValue(point)).toFixed(3)},${chart.vertical(verticalValue(point)).toFixed(3)}`).join(' ');
  }
  function addCurve(chart, horizontalValue, verticalValue, color, dashed = false) {
    const curve = svgElement('path', { d: curvePath(grid, chart, horizontalValue, verticalValue), class: 'data-line', stroke: color, ...(dashed ? { 'stroke-dasharray': '6 4' } : {}) });
    chart.data.append(curve);
    return curve;
  }

  function syncBoundPlotVisibility() {
    const update = (selector, visible) => {
      document.querySelectorAll(selector).forEach(element => { element.style.display = visible ? '' : 'none'; });
    };
    update('#bound-plot .bound-series', state.showUpperBound);
    update('#bound-plot .trace-series, #bound-plot .trace-axis-tick, #bound-plot .trace-axis-label', state.showPullbackTrace);
    byId('toggle-bound').setAttribute('aria-pressed', String(state.showUpperBound));
    byId('toggle-trace').setAttribute('aria-pressed', String(state.showPullbackTrace));
  }

  function rebuildPredict2D() {
    predict2D = PaperModel.createPosterior2D(state.lambda1, state.lambda2, 'SE');
  }

  function rebuildCharts() {
    predict = PaperModel.createPosterior(state.lengthscale);
    grid = Array.from({ length: 401 }, (_, index) => PaperModel.evaluateAcquisition(predict(index / 400), state.acquisition));
    rebuildPredict2D();
    const predictionMinimum = Math.min(...grid.map(point => point.mean - 2 * Math.sqrt(point.variance))) - 0.1;
    const predictionMaximum = Math.max(...grid.map(point => point.mean + 2 * Math.sqrt(point.variance))) + 0.1;
    const meanMinimum = Math.min(...grid.map(point => point.mean)) - 0.12;
    const meanMaximum = Math.max(...grid.map(point => point.mean)) + 0.12;
    const acquisitionMinimum = Math.min(0, ...grid.map(point => point.acquisitionValue));
    const acquisitionMaximum = Math.max(...grid.map(point => point.acquisitionValue)) * 1.12 + 0.01;
    chartScales = {
      prediction: setupChart('prediction-plot', [0, 1], [predictionMinimum, predictionMaximum], 'Input x', 'Predicted output'),
      map: setupChart('map-plot', [meanMinimum, meanMaximum], [0, 1.05], 'Predictive mean μₜ,ₓ', 'Predictive variance Σₜ,ₓ'),
      acquisition: setupChart('acquisition-plot', [0, 1], [acquisitionMinimum, acquisitionMaximum], 'Input x', 'Acquisition α(x)'),
      bound: setupChart('bound-plot', [0, 1], [0, Math.max(...grid.map(point => point.bound)) * 1.12 + 1e-8], 'Input x', 'Acqf gradient / upper bound')
    };
    const upperBand = curvePath(grid, chartScales.prediction, point => point.input, point => point.mean + 2 * Math.sqrt(point.variance));
    const lowerBand = curvePath([...grid].reverse(), chartScales.prediction, point => point.input, point => point.mean - 2 * Math.sqrt(point.variance));
    chartScales.prediction.data.append(svgElement('path', { d: upperBand + lowerBand.replace(/^M/, 'L') + 'Z', fill: '#e3e8f2' }));
    addCurve(chartScales.prediction, point => point.input, point => point.mean, colors.mean);
    PaperModel.observations.forEach(point => chartScales.prediction.data.append(svgElement('circle', {
      cx: chartScales.prediction.horizontal(point.input), cy: chartScales.prediction.vertical(point.output), r: 6.5, fill: colors.ink, stroke: 'white', 'stroke-width': 2, class: 'selection-dot'
    })));
    addCurve(chartScales.map, point => point.mean, point => point.variance, colors.map);
    grid.filter((_, index) => index % 20 === 0).forEach(point => chartScales.map.data.append(svgElement('circle', {
      cx: chartScales.map.horizontal(point.mean), cy: chartScales.map.vertical(point.variance), r: 2, fill: colors.map, opacity: 0.5
    })));
    addCurve(chartScales.acquisition, point => point.input, point => point.acquisitionValue, colors.gradient);
    addCurve(chartScales.bound, point => point.input, point => point.bound, colors.bound, true).classList.add('bound-series');
    addCurve(chartScales.bound, point => point.input, point => point.gradientNorm, colors.acqfGradient).classList.add('acqf-gradient-series');
    const traceMaximum = Math.max(...grid.map(point => point.trace)) * 1.12;
    chartScales.trace = { ...chartScales.bound, vertical: scale(0, traceMaximum, bounds1d.bottom, bounds1d.top) };
    addCurve(chartScales.trace, point => point.input, point => point.trace, colors.trace, true).classList.add('trace-series');
    for (let index = 0; index <= 4; index++) {
      const value = traceMaximum * index / 4;
      chartScales.bound.svg.append(svgElement('text', { x: 490, y: chartScales.trace.vertical(value) + 3, fill: colors.trace, class: 'trace-axis-tick' }, tickFormat(value)));
    }
    chartScales.bound.svg.append(svgElement('text', { x: 575, y: 133, transform: 'rotate(-90 575 133)', 'text-anchor': 'middle', class: 'axis-label trace-axis-label' }, 'Pullback trace'));

    const acqLabels = { EI: 'Expected improvement α(x)', UCB: 'Upper confidence bound α(x)', PI: 'Probability of improvement α(x)' };
    byId('acquisition-subtitle').textContent = acqLabels[state.acquisition] || 'Acquisition α(x)';
    renderAll();
    syncBoundPlotVisibility();
  }

  function buildPageDots() {
    const nav = byId('page-dots');
    nav.replaceChildren();
    for (const index of sceneOrder) {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.scene = String(index);
      button.title = pages[index].short || pages[index].title;
      button.setAttribute('aria-label', `Page ${sceneOrder.indexOf(index) + 1}: ${pages[index].title}`);
      button.addEventListener('click', () => setScene(index));
      nav.append(button);
    }
  }

  function populateStaticContent() {
    PaperContent.populate();
  }

  function boLoopStatusText() {
    return boLoop.completed ? 'Five experiments added. Reset to explore again.' : `Experiment ${boLoop.iteration} of 5 · ${boPhases[boLoop.phase]}`;
  }

  /** Restore the three initial measurements and the matching fitted posterior. */
  function resetBoLoop() {
    pauseBoLoop();
    boLoop.observations = PaperModel.boLoopInitialObservations.map(point => ({ ...point }));
    boLoop.fittedObservations = boLoop.observations.map(point => ({ ...point }));
    Object.assign(boLoop, { iteration: 1, phase: 0, candidateInput: null, pendingObservation: null, completed: false });
    renderBoLoop();
  }

  function pauseBoLoop() {
    boLoop.playing = false;
    if (boLoop.timer) { clearInterval(boLoop.timer); boLoop.timer = null; }
    byId('bo-play').textContent = boLoop.completed ? 'Replay loop' : 'Play BO loop';
    byId('bo-play').setAttribute('aria-pressed', 'false');
    byId('bo-cycle-card').classList.remove('bo-running');
  }

  /** Advance exactly one BO phase; only the model-fitting phase refits the GP. */
  function advanceBoPhase() {
    if (boLoop.completed) return;
    boLoop.phase = (boLoop.phase + 1) % 4;
    if (boLoop.phase === 1) {
      const posterior = PaperModel.createPosteriorFromObservations(boLoop.fittedObservations, 0.12);
      boLoop.candidateInput = PaperModel.argmaxAcquisition(posterior, 'EI', boLoop.fittedObservations).input;
    } else if (boLoop.phase === 2) {
      boLoop.pendingObservation = { input: boLoop.candidateInput, output: PaperModel.trueProcessResponse(boLoop.candidateInput) };
    } else if (boLoop.phase === 3) {
      boLoop.observations.push({ ...boLoop.pendingObservation });
    } else {
      boLoop.fittedObservations = boLoop.observations.map(point => ({ ...point }));
      boLoop.candidateInput = null;
      boLoop.pendingObservation = null;
      if (boLoop.iteration === 5) { boLoop.completed = true; pauseBoLoop(); }
      else boLoop.iteration += 1;
    }
    renderBoLoop();
  }

  /** Draw a bounded four-step cycle once, then animate only the active phase. */
  function renderBoCycleDiagram(activePhase) {
    const svg = byId('bo-cycle-svg');
    if (!svg.dataset.ready) {
      svg.dataset.ready = 'true';
      const definitions = svgElement('defs');
      const arrow = svgElement('marker', { id: 'bo-arrow', viewBox: '0 0 10 10', refX: 8, refY: 5, markerWidth: 5, markerHeight: 5, orient: 'auto-start-reverse' });
      arrow.append(svgElement('path', { d: 'M 0 0 L 10 5 L 0 10 z', fill: 'context-stroke' }));
      definitions.append(arrow); svg.append(definitions);
      svg.append(svgElement('circle', { cx: 250, cy: 150, r: 110, class: 'bo-guide-ring' }));
      const curves = [
        'M328 72 A110 110 0 0 1 355 118',
        'M355 182 A110 110 0 0 1 328 228',
        'M172 228 A110 110 0 0 1 145 182',
        'M145 118 A110 110 0 0 1 172 72'
      ];
      curves.forEach((curve, index) => svg.append(svgElement('path', { d: curve, class: 'bo-flow-edge', 'data-phase': index, 'marker-end': 'url(#bo-arrow)' })));
      const nodes = [
        { x: 175, y: 8, title: '1. Fit the model', equation: String.raw`\observeddata_{\boiteration}\;\longrightarrow\;\text{prediction}` },
        { x: 285, y: 118, title: '2. Choose a setting', equation: String.raw`\inpvars_{\boiteration+1}=\arg\max_{\inpvars}\acqf(\inpvars)` },
        { x: 175, y: 228, title: '3. Run the experiment', equation: String.raw`\inpvars_{\boiteration+1}\;\longrightarrow\;\obsouts_{\boiteration+1}` },
        { x: 65, y: 118, title: '4. Update the data', equation: String.raw`\observeddata_{\boiteration}\;\longrightarrow\;\observeddata_{\boiteration+1}` }
      ];
      nodes.forEach((node, index) => {
        const foreign = svgElement('foreignObject', { x: node.x, y: node.y, width: 150, height: 64, 'data-loop-node': index });
        const card = document.createElementNS('http://www.w3.org/1999/xhtml', 'div');
        card.className = 'loop-node-card';
        card.innerHTML = `<div class="loop-node-title">${node.title}</div><div class="loop-node-sub">${PaperNotation.inline(node.equation)}</div>`;
        foreign.append(card); svg.append(foreign);
      });
    }
    svg.querySelectorAll('[data-loop-node]').forEach(node => node.firstElementChild.classList.toggle('is-active', Number(node.dataset.loopNode) === activePhase));
    svg.querySelectorAll('[data-phase]').forEach(node => node.classList.toggle('is-active', Number(node.dataset.phase) === activePhase));
    byId('bo-phase-description').textContent = boDescriptions[activePhase];
  }

  /** Compute both BO plots from the loop's fitted data, never the deep-dive grid. */
  function renderBoLoop() {
    if (!isPage0()) return;
    byId('bo-loop-status').textContent = boLoopStatusText();
    byId('bo-step').disabled = boLoop.completed;
    renderBoCycleDiagram(boLoop.phase);
    const posterior = PaperModel.createPosteriorFromObservations(boLoop.fittedObservations, 0.12);
    const samples = Array.from({ length: 401 }, (_, index) => PaperModel.evaluateAcquisition(posterior(index / 400), 'EI', boLoop.fittedObservations));
    const processSamples = samples.map(point => ({ input: point.input, output: PaperModel.trueProcessResponse(point.input) }));
    const minimum = Math.min(...samples.map(point => point.mean - 2 * Math.sqrt(point.variance)), ...processSamples.map(point => point.output), ...boLoop.observations.map(point => point.output));
    const maximum = Math.max(...samples.map(point => point.mean + 2 * Math.sqrt(point.variance)), ...processSamples.map(point => point.output), ...boLoop.observations.map(point => point.output));
    const padding = 0.06 * (maximum - minimum);
    const chart = setupChart('bo-surrogate-plot', [0, 1], [minimum - padding, maximum + padding], 'Experiment setting', 'Response');
    const upper = curvePath(samples, chart, point => point.input, point => point.mean + 2 * Math.sqrt(point.variance));
    const lower = curvePath([...samples].reverse(), chart, point => point.input, point => point.mean - 2 * Math.sqrt(point.variance));
    chart.data.append(svgElement('path', { d: upper + lower.replace(/^M/, 'L') + 'Z', fill: '#e3e8f2', class: 'uncertainty-band' }));
    chart.data.append(svgElement('path', { d: curvePath(processSamples, chart, point => point.input, point => point.output), class: 'data-line true-process' }));
    chart.data.append(svgElement('path', { d: curvePath(samples, chart, point => point.input, point => point.mean), class: 'data-line bo-mean', stroke: colors.mean }));
    chart.svg.dataset.trainingCount = boLoop.fittedObservations.length;
    boLoop.observations.forEach(point => chart.data.append(svgElement('circle', {
      cx: chart.horizontal(point.input), cy: chart.vertical(point.output), r: 4.7, fill: colors.ink, stroke: '#fff', 'stroke-width': 2, class: 'bo-observation'
    })));
    if (boLoop.pendingObservation && boLoop.phase === 2) {
      const observation = boLoop.pendingObservation;
      chart.selection.append(svgElement('circle', { cx: chart.horizontal(observation.input), cy: chart.vertical(observation.output), r: 7, fill: colors.teal, class: 'selection-dot' }));
    }
    const acquisitionMaximum = Math.max(...samples.map(point => point.acquisitionValue)) * 1.15 + 0.002;
    const acquisitionChart = setupChart('bo-acquisition-plot', [0, 1], [0, acquisitionMaximum], 'Experiment setting', 'Expected improvement');
    acquisitionChart.data.append(svgElement('path', { d: curvePath(samples, acquisitionChart, point => point.input, point => point.acquisitionValue), class: 'data-line bo-acquisition', stroke: colors.gradient }));
    if (boLoop.candidateInput != null) {
      const selected = PaperModel.evaluateAcquisition(posterior(boLoop.candidateInput), 'EI', boLoop.fittedObservations);
      for (const target of [chart, acquisitionChart]) target.selection.prepend(svgElement('line', {
        x1: target.horizontal(boLoop.candidateInput), x2: target.horizontal(boLoop.candidateInput), y1: bounds1d.top, y2: bounds1d.bottom, class: 'cursor-line'
      }));
      acquisitionChart.selection.append(svgElement('circle', { cx: acquisitionChart.horizontal(selected.input), cy: acquisitionChart.vertical(selected.acquisitionValue), r: 6, fill: colors.teal, class: 'selection-dot' }));
    }
  }

  function renderSelection1d() {
    const selected = PaperModel.evaluateAcquisition(predict(state.input), state.acquisition);
    byId('input-position').value = state.input;
    byId('input-value').textContent = state.input.toFixed(3);
    for (const name of ['prediction', 'acquisition', 'bound']) {
      const chart = chartScales[name];
      chart.selection.replaceChildren(svgElement('line', { x1: chart.horizontal(state.input), x2: chart.horizontal(state.input), y1: bounds1d.top, y2: bounds1d.bottom, class: 'cursor-line' }));
    }
    chartScales.map.selection.replaceChildren();
    const point = (chart, horizontalValue, verticalValue, color, radius = 6.5) => {
      const marker = svgElement('circle', {
        cx: chart.horizontal(horizontalValue), cy: chart.vertical(verticalValue), r: radius, class: 'selection-dot', fill: color
      });
      chart.selection.append(marker);
      return marker;
    };
    point(chartScales.prediction, selected.input, selected.mean, colors.mean);
    point(chartScales.map, selected.mean, selected.variance, colors.map);
    point(chartScales.acquisition, selected.input, selected.acquisitionValue, colors.gradient);
    point(chartScales.bound, selected.input, selected.bound, colors.bound).classList.add('bound-series');
    point(chartScales.bound, selected.input, selected.gradientNorm, colors.acqfGradient).classList.add('acqf-gradient-series');
    point(chartScales.trace, selected.input, selected.trace, colors.trace).classList.add('trace-series');
    const tangentHalfWidth = 0.035;
    chartScales.acquisition.selection.prepend(svgElement('line', {
      x1: chartScales.acquisition.horizontal(selected.input - tangentHalfWidth), x2: chartScales.acquisition.horizontal(selected.input + tangentHalfWidth),
      y1: chartScales.acquisition.vertical(selected.acquisitionValue - tangentHalfWidth * selected.gradient),
      y2: chartScales.acquisition.vertical(selected.acquisitionValue + tangentHalfWidth * selected.gradient), class: 'tangent'
    }));
    byId('map-plot').setAttribute('aria-label', `Input ${selected.input.toFixed(3)} maps to predictive mean ${format(selected.mean)} and variance ${format(selected.variance)}.`);
    if (state.scene === 1) PaperBridge.render(selected, predict(0.44));
    byId('map-readout').textContent = `Selected state: mean ${format(selected.mean)} · variance ${format(selected.variance)}`;
    syncBoundPlotVisibility();
  }

  function heatmapLayer(chart, values, colorStops) {
    const rows = values.length, cols = values[0].length;
    let vmin = Infinity, vmax = -Infinity;
    values.forEach(row => row.forEach(v => { vmin = Math.min(vmin, v); vmax = Math.max(vmax, v); }));
    const span = vmax - vmin || 1;
    const cellW = (chart.box.right - chart.box.left) / cols;
    const cellH = (chart.box.bottom - chart.box.top) / rows;
    for (let i = 0; i < rows; i++) {
      for (let j = 0; j < cols; j++) {
        const t = (values[i][j] - vmin) / span;
        const r = Math.round(colorStops[0][0] + t * (colorStops[1][0] - colorStops[0][0]));
        const g = Math.round(colorStops[0][1] + t * (colorStops[1][1] - colorStops[0][1]));
        const b = Math.round(colorStops[0][2] + t * (colorStops[1][2] - colorStops[0][2]));
        chart.data.append(svgElement('rect', {
          class: 'heatmap-cell', x: chart.box.left + j * cellW, y: chart.box.top + i * cellH,
          width: cellW + 0.5, height: cellH + 0.5, fill: `rgb(${r},${g},${b})`, opacity: 0.92
        }));
      }
    }
  }

  function drawArrow(chart, x0, y0, dx, dy, color, label) {
    const magnitude = Math.hypot(dx, dy);
    const group = svgElement('g');
    if (magnitude < 1e-12) {
      group.append(svgElement('circle', { cx: x0, cy: y0, r: 4, fill: '#fff', stroke: color, 'stroke-width': 2 }));
      if (label) group.append(svgElement('text', { x: x0 + 7, y: y0 - 7, fill: color, 'font-size': 11 }, `${label} = 0`));
      chart.selection.append(group);
      return;
    }
    const displayLength = clamp(24 + 12 * Math.log10(1 + magnitude), 24, 52);
    const ex = x0 + dx / magnitude * displayLength;
    const ey = y0 - dy / magnitude * displayLength;
    group.append(svgElement('line', { x1: x0, y1: y0, x2: ex, y2: ey, stroke: color, 'stroke-width': 2.2, class: 'vector-arrow' }));
    const angle = Math.atan2(ey - y0, ex - x0);
    group.append(svgElement('polygon', {
      points: `${ex},${ey} ${ex - 8 * Math.cos(angle - 0.42)},${ey - 8 * Math.sin(angle - 0.42)} ${ex - 8 * Math.cos(angle + 0.42)},${ey - 8 * Math.sin(angle + 0.42)}`,
      fill: color
    }));
    if (label) group.append(svgElement('text', { x: ex + 6, y: ey - 6, fill: color, 'font-size': 11, 'font-weight': 650 }, label));
    chart.selection.append(group);
  }

  function drawUnitSquareAxes(chart) {
    chart.data.append(svgElement('rect', { x: chart.horizontal(0), y: chart.vertical(1), width: chart.horizontal(1) - chart.horizontal(0), height: chart.vertical(0) - chart.vertical(1), fill: '#fafaf8', stroke: '#ccd2d0' }));
  }

  function currentPoint2D() {
    if (state.scene === 5 && state.stationaryPreset !== 'free') {
      const presets = PaperModel.stationaryPresets(predict2D, state.acquisition);
      const key = state.stationaryPreset === 'flat' ? 'flat' : state.stationaryPreset === 'singular' ? 'singularNonStationary' : 'stationaryCancellation';
      return presets[key];
    }
    return PaperModel.evaluatePoint2D(predict2D(state.input2d[0], state.input2d[1]), state.acquisition);
  }

  function sampleTraceField(resolution = 22) {
    const field = [];
    for (let i = 0; i < resolution; i++) {
      const row = [];
      const x2 = 1 - (i + 0.5) / resolution;
      for (let j = 0; j < resolution; j++) {
        const x1 = (j + 0.5) / resolution;
        const pt = PaperModel.evaluatePoint2D(predict2D(x1, x2), state.acquisition);
        row.push(Math.sqrt(pt.trace));
      }
      field.push(row);
    }
    return field;
  }

  let traceComparison;

  /** Two matched plots, both showing the actual posterior pullback trace. */
  function renderHdboLens() {
    traceComparison ||= PaperModel.computeTraceComparison();
    byId('advanced-title-a').textContent = 'RAASP: keep candidates near the data';
    byId('advanced-subtitle-a').textContent = 'Same GP and fixed lengthscale; different candidate locations';
    byId('advanced-title-b').textContent = 'Scale the lengthscale with dimension';
    byId('advanced-subtitle-b').textContent = 'Same global candidates; four scaling regimes from the paper';
    const sets = [
      [{ key: 'global', label: 'Global candidates', color: colors.gradient }, { key: 'local', label: 'Local perturbations (RAASP-style)', color: colors.teal }],
      [
        { key: 'global', label: 'Fixed scaling p = 0', color: colors.gradient },
        { key: 'subcritical', label: 'p = 0.25 (< 0.5)', color: colors.acqfGradient },
        { key: 'critical', label: 'p = 0.5', color: colors.indigo },
        { key: 'supercritical', label: 'p = 0.75 (> 0.5)', color: colors.violet }
      ]
    ];
    ['a', 'b'].forEach((panel, panelIndex) => {
      const chart = setupChart(`advanced-plot-${panel}`, [1, 8], [-7, 2], 'Input dimension', 'Mean pullback trace', bounds2d);
      // Replace generic numeric ticks with actual dimensions and powers of ten.
      [...chart.svg.children].filter(node => node.tagName === 'text' && !node.classList.contains('axis-label')).forEach(node => node.remove());
      [2, 8, 32, 128, 256].forEach(dimension => chart.svg.append(svgElement('text', { x: chart.horizontal(Math.log2(dimension)), y: chart.box.bottom + 22, 'text-anchor': 'middle' }, dimension)));
      [-7, -4, -1, 2].forEach(exponent => {
        const label = svgElement('text', { x: chart.box.left - 8, y: chart.vertical(exponent) + 4, 'text-anchor': 'end' }, exponent === -7 ? '≤ 10' : '10');
        label.append(svgElement('tspan', { 'baseline-shift': 'super', 'font-size': 9 }, exponent));
        chart.svg.append(label);
      });
      sets[panelIndex].forEach(series => {
        chart.data.append(svgElement('path', { d: curvePath(traceComparison, chart, item => Math.log2(item.dimension), item => Math.max(-7, Math.log10(Math.max(item[series.key], 1e-300)))), class: 'data-line trace-comparison', stroke: series.color }));
        const selected = traceComparison.find(item => item.dimension === state.lensDimension) || traceComparison[5];
        chart.selection.append(svgElement('circle', { cx: chart.horizontal(Math.log2(selected.dimension)), cy: chart.vertical(Math.max(-7, Math.log10(Math.max(selected[series.key], 1e-300)))), r: 5, fill: series.color, stroke: '#fff', 'stroke-width': 2 }));
      });
      setLegend(`advanced-legend-${panel}`, sets[panelIndex]);
    });
    byId('advanced-foot-a').textContent = 'Local perturbations retain predictive sensitivity as global candidates move away from observed data.';
    byId('advanced-foot-b').innerHTML = '<a href="https://arxiv.org/abs/2402.02229" target="_blank" rel="noopener">Hvarfner et al. (2024)</a>, <a href="https://arxiv.org/abs/2402.02746" target="_blank" rel="noopener">Xu et al. (2024)</a>, and <a href="https://arxiv.org/abs/2502.09198" target="_blank" rel="noopener">Papenmeier et al. (2025)</a> explain why dimensionally scaled priors are important. The manifold view helps in understanding why √D scaling is the best option because it lets the pullback trace decay the slowest. This helps in avoiding the vanishing-gradient problem in higher input dimensions when the optimizer starts far from the observed space.';
  }

  function renderGeometry2D() {
    const pt = currentPoint2D();
    byId('advanced-title-a').textContent = 'Predictive mean & gradients';
    byId('advanced-subtitle-a').textContent = '∇μ (indigo) and ∇Σ (violet) at the query point';
    byId('advanced-title-b').textContent = 'Pullback trace field';
    byId('advanced-subtitle-b').textContent = '√tr(G_t) with local Fisher ellipse';
    byId('advanced-title-c').textContent = 'Acquisition vs natural gradient';
    byId('advanced-subtitle-c').textContent = 'Orange: ∇α · Purple: damped natural step';
    byId('advanced-title-d').textContent = 'Local KL: quadratic vs exact';
    byId('advanced-subtitle-d').textContent = 'Along ∇α direction as ||δ||₂ grows';

    const meanField = sampleTraceField(20).map((row, i) => row.map((_, j) => {
      const x1 = (j + 0.5) / 20, x2 = 1 - (i + 0.5) / 20;
      return predict2D(x1, x2).mean;
    }));
    const chartA = setupChart('advanced-plot-a', [0, 1], [0, 1], 'x₁', 'x₂', bounds2d);
    drawUnitSquareAxes(chartA);
    heatmapLayer(chartA, meanField, [[230, 235, 245], [70, 91, 152]]);
    PaperModel.observations2D.forEach(obs => chartA.selection.append(svgElement('circle', {
      cx: chartA.horizontal(obs.input[0]), cy: chartA.vertical(obs.input[1]), r: 4, fill: colors.ink, stroke: '#fff', 'stroke-width': 1.2
    })));
    const cx = chartA.horizontal(pt.input[0]), cy = chartA.vertical(pt.input[1]);
    chartA.selection.append(svgElement('circle', { cx, cy, r: 6, fill: colors.teal, stroke: '#fff', 'stroke-width': 2 }));
    drawArrow(chartA, cx, cy, pt.meanGradient[0], pt.meanGradient[1], colors.indigo, '∇μ');
    drawArrow(chartA, cx, cy, pt.varianceGradient[0], pt.varianceGradient[1], colors.violet, '∇Σ');

    const traceField = sampleTraceField(24);
    const chartB = setupChart('advanced-plot-b', [0, 1], [0, 1], 'x₁', 'x₂', bounds2d);
    drawUnitSquareAxes(chartB);
    heatmapLayer(chartB, traceField, [[240, 248, 246], [20, 124, 116]]);
    const kappa = state.fitrKappa;
    const [v1, v2] = pt.eigenvectorsG;
    const [l1, l2] = pt.eigenvalues.map(ev => kappa / Math.sqrt(Math.max(ev, 1e-9)));
    let ellipsePath = '';
    for (let t = 0; t <= 64; t++) {
      const ang = t / 64 * 2 * Math.PI;
      const dx = l1 * Math.cos(ang) * v1[0] + l2 * Math.sin(ang) * v2[0];
      const dy = l1 * Math.cos(ang) * v1[1] + l2 * Math.sin(ang) * v2[1];
      const px = chartB.horizontal(clamp(pt.input[0] + dx, 0, 1));
      const py = chartB.vertical(clamp(pt.input[1] + dy, 0, 1));
      ellipsePath += (t ? 'L' : 'M') + px.toFixed(2) + ',' + py.toFixed(2);
    }
    chartB.selection.append(svgElement('path', { d: ellipsePath + 'Z', class: 'ellipse-stroke' }));
    chartB.selection.append(svgElement('circle', { cx: chartB.horizontal(pt.input[0]), cy: chartB.vertical(pt.input[1]), r: 5, fill: colors.teal, stroke: '#fff', 'stroke-width': 2 }));

    const chartC = setupChart('advanced-plot-c', [0, 1], [0, 1], 'x₁', 'x₂', bounds2d);
    drawUnitSquareAxes(chartC);
    for (let i = 1; i < 6; i++) for (let j = 1; j < 6; j++) {
      const x1 = j / 6, x2 = i / 6;
      const local = PaperModel.evaluatePoint2D(predict2D(x1, x2), state.acquisition);
      const px = chartC.horizontal(x1), py = chartC.vertical(x2);
      drawArrow(chartC, px, py, local.gradient[0], local.gradient[1], colors.gradient, null);
      drawArrow(chartC, px, py, local.naturalGradient[0], local.naturalGradient[1], colors.natural, null);
    }
    drawArrow(chartC, chartC.horizontal(pt.input[0]), chartC.vertical(pt.input[1]), pt.gradient[0], pt.gradient[1], colors.gradient, '∇α');
    drawArrow(chartC, chartC.horizontal(pt.input[0]), chartC.vertical(pt.input[1]), pt.naturalGradient[0], pt.naturalGradient[1], colors.natural, 'nat');

    const dir = pt.gradientNorm > 1e-12 ? pt.gradient.map(g => g / pt.gradientNorm) : [1, 0];
    const klSamples = Array.from({ length: 40 }, (_, i) => {
      const mag = (i + 1) / 40 * 0.35;
      return PaperModel.evaluateLocalKL2D(predict2D, pt.input, [dir[0] * mag, dir[1] * mag]);
    });
    const maxKl = Math.max(...klSamples.map(s => s.exactKL), ...klSamples.map(s => s.quadraticKL), 1e-6);
    const chartD = setupChart('advanced-plot-d', [0, 0.35], [0, maxKl * 1.15], '||δ||₂', 'KL (nats)', bounds2d);
    chartD.data.append(svgElement('path', {
      d: curvePath(klSamples, chartD, s => s.displacementNorm, s => s.quadraticKL),
      class: 'data-line', stroke: colors.teal, 'stroke-dasharray': '5 4'
    }));
    chartD.data.append(svgElement('path', {
      d: curvePath(klSamples, chartD, s => s.displacementNorm, s => s.exactKL),
      class: 'data-line', stroke: colors.indigo
    }));

    updateReadoutAdvanced(pt);
    byId('advanced-foot-a').textContent = `cos θ_{μ,Σ} = ${format(pt.collinearityCosine)} at (${pt.input[0].toFixed(2)}, ${pt.input[1].toFixed(2)})`;
    byId('advanced-foot-b').textContent = `tr(G_t) = ${format(pt.trace)} · ellipse uses κ = ${kappa.toFixed(2)}`;
    byId('advanced-foot-c').textContent = `Damping ε_t = ${format(pt.damping)} on diag(G_t) + ε_t I`;
    byId('advanced-foot-d').textContent = 'Dashed: ½δᵀGδ · solid: exact Gaussian KL';
  }

  function getStationaryExample() {
    if (stationaryExample) return stationaryExample;
    const predict = PaperModel.createStationaryExample2D();
    const stationaryPoints = PaperModel.findStationaryPoints2D(predict, 'EI')
      .filter(point => point.branch === 'cancellation' && point.input.every(value => value > 0.02 && value < 0.98))
      .slice(0, 6);
    const resolution = 32;
    const fields = { truth: [], mean: [], variance: [], acquisition: [] };
    for (let row = 0; row < resolution; row++) {
      const truthRow = [], meanRow = [], varianceRow = [], acquisitionRow = [];
      const x2 = 1 - (row + 0.5) / resolution;
      for (let column = 0; column < resolution; column++) {
        const x1 = (column + 0.5) / resolution;
        const predictive = predict(x1, x2);
        truthRow.push(PaperModel.trueStationaryFunction2D(x1, x2));
        meanRow.push(predictive.mean);
        varianceRow.push(predictive.variance);
        acquisitionRow.push(PaperModel.evaluatePoint2D(predictive, 'EI').acquisitionValue);
      }
      fields.truth.push(truthRow);
      fields.mean.push(meanRow);
      fields.variance.push(varianceRow);
      fields.acquisition.push(acquisitionRow);
    }
    let generic = PaperModel.evaluatePoint2D(predict(0.58, 0.42), 'EI');
    let genericScore = Infinity;
    for (let row = 2; row < 9; row++) for (let column = 2; column < 9; column++) {
      const candidate = PaperModel.evaluatePoint2D(predict(column / 10, row / 10), 'EI');
      const ratio = candidate.eigenvalues[1] > 0 ? candidate.eigenvalues[0] / candidate.eigenvalues[1] : 0;
      const score = ratio > 0.03 ? Math.abs(ratio - 0.16) : Infinity;
      if (score < genericScore) { generic = candidate; genericScore = score; }
    }
    stationaryExample = { predict, stationaryPoints, fields, generic };
    return stationaryExample;
  }

  function renderStationaryGeometry() {
    const example = getStationaryExample();
    if (!example.stationaryPoints.length) return;
    byId('page5-factorization-equation').innerHTML = renderEquation('rayleigh', 'Acquisition-gradient factorization and companion matrix');
    byId('page5-factors-equation').innerHTML = renderEquation('stationary_factors', 'Fisher-scaled mean and variance rows of A and acquisition vector u');
    byId('page5-spectral-equation').innerHTML = renderEquation('stationary_spectral', 'Rayleigh quotient acquisition-gradient inequality');
    byId('page5-stationary-equation').innerHTML = renderEquation('stationary_condition', 'Stationary-point rank and collinearity consequences');
    state.stationaryPointIndex = clamp(state.stationaryPointIndex, 0, example.stationaryPoints.length - 1);
    const selectedStationary = example.stationaryPoints[state.stationaryPointIndex];
    const selected = state.stationarySelectionMode === 'free'
      ? PaperModel.evaluatePoint2D(example.predict(state.stationaryInput[0], state.stationaryInput[1]), 'EI')
      : selectedStationary;
    const mapDefinitions = [
      { id: 'stationary-true-plot', values: example.fields.truth, colors: [[230, 235, 245], [200, 90, 54]] },
      { id: 'stationary-mean-plot', values: example.fields.mean, colors: [[232, 237, 247], [63, 86, 148]] },
      { id: 'stationary-variance-plot', values: example.fields.variance, colors: [[250, 248, 252], [123, 90, 160]] },
      { id: 'stationary-acquisition-plot', values: example.fields.acquisition, colors: [[250, 244, 248], [178, 58, 155]], stationary: true }
    ];
    mapDefinitions.forEach(definition => {
      const chart = setupChart(definition.id, [0, 1], [0, 1], 'x₁', 'x₂', bounds2d);
      heatmapLayer(chart, definition.values, definition.colors);
      example.predict.observations.forEach(observation => chart.selection.append(svgElement('circle', {
        cx: chart.horizontal(observation.input[0]), cy: chart.vertical(observation.input[1]),
        r: 4, fill: colors.ink, stroke: '#fff', 'stroke-width': 1.5
      })));
      if (definition.stationary) {
        example.stationaryPoints.forEach((point, index) => {
          const cx = chart.horizontal(point.input[0]), cy = chart.vertical(point.input[1]);
          const stroke = point.stationaryType === 'maximum' ? colors.gradient :
            point.stationaryType === 'minimum' ? colors.indigo : colors.acqfGradient;
          let marker;
          if (point.stationaryType === 'minimum') {
            marker = svgElement('rect', { x: cx - 5, y: cy - 5, width: 10, height: 10, fill: '#fff', stroke, 'stroke-width': 2 });
          } else if (point.stationaryType === 'saddle') {
            marker = svgElement('polygon', { points: `${cx},${cy - 6} ${cx + 6},${cy} ${cx},${cy + 6} ${cx - 6},${cy}`, fill: '#fff', stroke, 'stroke-width': 2 });
          } else {
            marker = svgElement('circle', { cx, cy, r: 5, fill: '#fff', stroke, 'stroke-width': 2 });
          }
          marker.classList.add('stationary-map-point');
          marker.setAttribute('data-stationary-index', index);
          chart.selection.append(marker);
          chart.selection.append(svgElement('text', { x: cx + 7, y: cy - 7, fill: stroke, 'font-size': 10, 'font-weight': 700 }, `S${index + 1}`));
        });
      }
      chart.selection.append(svgElement('circle', {
        cx: chart.horizontal(selected.input[0]), cy: chart.vertical(selected.input[1]),
        r: 7, fill: 'none', stroke: colors.teal, 'stroke-width': 3
      }));
    });

    const selector = byId('stationary-selector');
    selector.replaceChildren();
    const selectorLabel = document.createElement('span');
    selectorLabel.className = 'stationary-selector-label';
    selectorLabel.textContent = 'Click a stationary point to inspect its gradients:';
    selector.append(selectorLabel);
    example.stationaryPoints.forEach((point, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = `S${index + 1} · ${point.stationaryType}`;
      button.title = `${point.stationaryType} at (${point.input[0].toFixed(2)}, ${point.input[1].toFixed(2)})`;
      button.setAttribute('aria-pressed', String(state.stationarySelectionMode === 'stationary' && index === state.stationaryPointIndex));
      button.addEventListener('click', () => {
        state.stationaryPointIndex = index;
        state.stationarySelectionMode = 'stationary';
        state.stationaryInput = point.input.slice();
        renderStationaryGeometry();
        saveLocation();
      });
      selector.append(button);
    });
    const selectorStatus = document.createElement('span');
    selectorStatus.className = 'stationary-selector-status';
    selectorStatus.textContent = state.stationarySelectionMode === 'free'
      ? `Clicked point (${selected.input[0].toFixed(2)}, ${selected.input[1].toFixed(2)})`
      : `Selected S${state.stationaryPointIndex + 1}: ${selectedStationary.stationaryType}`;
    selector.append(selectorStatus);

    const vectors = byId('stationary-vector-plot');
    vectors.replaceChildren();
    drawArrow({ selection: vectors }, 250, 150, selected.meanGradient[0], selected.meanGradient[1], colors.indigo, '∇μ');
    drawArrow({ selection: vectors }, 250, 150, selected.varianceGradient[0], selected.varianceGradient[1], colors.violet, '∇Σ');
    if (selected.gradientNorm < 2e-5) {
      vectors.append(svgElement('circle', { cx: 250, cy: 150, r: 8, fill: '#fff', stroke: colors.acqfGradient, 'stroke-width': 3 }));
      vectors.append(svgElement('text', { x: 262, y: 143, fill: colors.acqfGradient, 'font-size': 11, 'font-weight': 700 }, '∇α = 0'));
    } else {
      drawArrow({ selection: vectors }, 250, 150, selected.gradient[0], selected.gradient[1], colors.acqfGradient, '∇α');
    }
    vectors.append(svgElement('circle', { cx: 250, cy: 150, r: 5, fill: '#fff', stroke: colors.ink, 'stroke-width': 2 }));
    vectors.append(svgElement('text', { x: 250, y: 38, 'text-anchor': 'middle', 'font-weight': 700 },
      state.stationarySelectionMode === 'stationary' ? `S${state.stationaryPointIndex + 1}: ${selectedStationary.stationaryType}` : 'Clicked EI location'));
    vectors.append(svgElement('text', { x: 250, y: 270, 'text-anchor': 'middle', fill: colors.muted }, `cos θ = ${format(selected.collinearityCosine)} · ||∇α|| = ${format(selected.gradientNorm)}`));
    byId('stationary-vector-foot').textContent = state.stationarySelectionMode === 'stationary'
      ? `Selected S${state.stationaryPointIndex + 1} at (${selected.input[0].toFixed(3)}, ${selected.input[1].toFixed(3)}): the nonzero mean and variance gradients are collinear and point in opposite directions, and the acquisition gradient is zero.`
      : `Clicked point (${selected.input[0].toFixed(3)}, ${selected.input[1].toFixed(3)}): the three arrows show the mean gradient, variance gradient, and their acquisition-weighted sum ∇α.`;

    const companion = byId('stationary-companion-plot');
    companion.replaceChildren();
    const drawCompanion = (stateAtPoint, centerX, color, title) => {
      const [nuMin, nuMax] = stateAtPoint.eigenvalues;
      const [eMin, eMax] = stateAtPoint.eigenvectorsM;
      const maxRoot = Math.sqrt(Math.max(nuMax, 1e-12));
      const minRoot = Math.sqrt(Math.max(nuMin, 0));
      const scaleFactor = 70 / maxRoot;
      let path = '';
      for (let index = 0; index <= 72; index++) {
        const angle = index / 72 * 2 * Math.PI;
        const dx = scaleFactor * (maxRoot * Math.cos(angle) * eMax[0] + minRoot * Math.sin(angle) * eMin[0]);
        const dy = scaleFactor * (maxRoot * Math.cos(angle) * eMax[1] + minRoot * Math.sin(angle) * eMin[1]);
        path += `${index ? 'L' : 'M'}${(centerX + dx).toFixed(2)},${(145 - dy).toFixed(2)}`;
      }
      companion.append(svgElement('path', { d: path + 'Z', fill: `${color}18`, stroke: color, 'stroke-width': 3 }));
      companion.append(svgElement('line', {
        x1: centerX - 74 * eMin[0], y1: 145 + 74 * eMin[1],
        x2: centerX + 74 * eMin[0], y2: 145 - 74 * eMin[1],
        stroke: colors.muted, 'stroke-dasharray': '5 4', 'stroke-width': 1.5
      }));
      drawArrow({ selection: companion }, centerX, 145, stateAtPoint.u[0], stateAtPoint.u[1], colors.gradient, 'u');
      companion.append(svgElement('text', { x: centerX, y: 28, 'text-anchor': 'middle', 'font-weight': 700 }, title));
      companion.append(svgElement('text', { x: centerX, y: 270, 'text-anchor': 'middle', fill: colors.muted }, `νmin=${format(nuMin)} · νmax=${format(nuMax)}`));
    };
    const selectedRank = selected.eigenvalues[0] < 1e-7 ? 1 : 2;
    drawCompanion(
      selected,
      250,
      selectedRank === 1 ? colors.violet : colors.teal,
      state.stationarySelectionMode === 'stationary'
        ? `S${state.stationaryPointIndex + 1}: ${selectedStationary.stationaryType} · rank ${selectedRank}`
        : `Clicked point · rank ${selectedRank}`
    );
    byId('stationary-companion-foot').textContent = selectedRank === 1
      ? 'At a stationary point, u (the acquisition-function contribution) is in the nullspace of M. Therefore νmin = 0, and the image of a circle under M¹ᐟ² collapses to a line while u lies along the dashed null direction.'
      : 'At this clicked point, M is full rank and u is not in its nullspace. The image of a circle under M¹ᐟ² is therefore an ellipse rather than a line.';
  }

  function renderRayleigh() {
    const pt = currentPoint2D();
    const psi = state.psiDegrees * Math.PI / 180;
    const ray = PaperModel.evaluateRayleighDirection(pt, psi);
    const uAngle = pt.uNorm > 1e-12 ? Math.atan2(pt.u[1], pt.u[0]) : 0;

    byId('advanced-title-a').textContent = 'Companion ellipse M in u-space';
    byId('advanced-subtitle-a').textContent = 'Eigenaxes ν_min, ν_max · acquisition u · test ũ(ψ)';
    byId('advanced-title-b').textContent = 'Rayleigh quotient vs ψ';
    byId('advanced-subtitle-b').textContent = 'ũ(ψ)ᵀ M ũ(ψ) with spectral bands';
    byId('advanced-title-c').textContent = 'Input-space pulls Aᵀ ũ';
    byId('advanced-subtitle-c').textContent = 'Rows a_μ, a_Σ and mapped gradients';
    byId('advanced-title-d').textContent = 'Bracket comparison';
    byId('advanced-subtitle-d').textContent = 'From √(ν_min)||u|| to √(C_α tr(G_t))';
    setLegend('advanced-legend-a', [
      { label: 'Companion contour', color: colors.teal },
      { label: 'Acquisition vector u', color: colors.gradient },
      { label: 'Test vector ũ', color: colors.test }
    ]);
    setLegend('advanced-legend-b', [
      { label: 'Rayleigh quotient', color: colors.test },
      { label: 'Spectral bounds', color: colors.muted, kind: 'dashed' },
      { label: 'Acquisition direction', color: colors.gradient, kind: 'dot' }
    ]);
    setLegend('advanced-legend-c', [
      { label: 'Mean row a_μ', color: colors.indigo },
      { label: 'Variance row a_Σ', color: colors.violet },
      { label: 'Acquisition gradient', color: colors.gradient },
      { label: 'Mapped test vector', color: colors.test }
    ]);
    setLegend('advanced-legend-d', [
      { label: 'Lower spectral bound', color: colors.muted, kind: 'fill' },
      { label: 'Gradient norm', color: colors.gradient, kind: 'fill' },
      { label: 'Upper spectral bound', color: colors.teal, kind: 'fill' },
      { label: 'Trace bound', color: colors.violet, kind: 'fill' }
    ]);

    const [nuMin, nuMax] = pt.eigenvalues;
    const [eMin, eMax] = pt.eigenvectorsM;
    const companionExtent = Math.max(Math.sqrt(nuMax) * pt.uNorm, pt.uNorm, 1e-3);
    const chartALimit = companionExtent * 1.8;
    const chartA = setupChart('advanced-plot-a', [-chartALimit, chartALimit], [-chartALimit, chartALimit], 'u_μ', 'u_Σ', bounds2d);
    const drawEllipseM = (chart, scaleVal, stroke, dash) => {
      let d = '';
      for (let t = 0; t <= 64; t++) {
        const ang = t / 64 * 2 * Math.PI;
        const ux = scaleVal * Math.cos(ang) * eMax[0] + scaleVal * Math.sin(ang) * eMin[0];
        const uy = scaleVal * Math.cos(ang) * eMax[1] + scaleVal * Math.sin(ang) * eMin[1];
        d += (t ? 'L' : 'M') + chart.horizontal(ux).toFixed(2) + ',' + chart.vertical(uy).toFixed(2);
      }
      chart.data.append(svgElement('path', { d: d + 'Z', fill: 'none', stroke, 'stroke-width': 1.3, 'stroke-dasharray': dash || 'none' }));
    };
    drawEllipseM(chartA, Math.sqrt(nuMax) * pt.uNorm, colors.teal);
    drawEllipseM(chartA, Math.sqrt(Math.max(nuMin, 0)) * pt.uNorm, colors.muted, '4 3');
    drawArrow(chartA, chartA.horizontal(0), chartA.vertical(0), pt.u[0], pt.u[1], colors.gradient, 'u');
    drawArrow(chartA, chartA.horizontal(0), chartA.vertical(0), ray.vector[0], ray.vector[1], colors.test, 'ũ');

    const angles = Array.from({ length: 90 }, (_, i) => i / 90 * 2 * Math.PI);
    const curve = angles.map(a => PaperModel.evaluateRayleighDirection(pt, a));
    const yMax = Math.max(pt.bound ** 2, pt.spectralUpperSquared, ...curve.map(c => c.squaredNorm)) * 1.12;
    const chartB = setupChart('advanced-plot-b', [0, 360], [0, yMax], 'ψ (degrees)', 'ũᵀ M ũ', bounds2d);
    chartB.data.append(svgElement('path', { d: curvePath(curve, chartB, c => c.angleRadians * 180 / Math.PI, c => c.squaredNorm), class: 'data-line', stroke: colors.test }));
    const band = (y, label) => {
      chartB.data.append(svgElement('line', { x1: chartB.horizontal(0), x2: chartB.horizontal(360), y1: chartB.vertical(y), y2: chartB.vertical(y), stroke: colors.muted, 'stroke-dasharray': '6 4' }));
      chartB.data.append(svgElement('text', { x: chartB.horizontal(350), y: chartB.vertical(y) - 4, 'font-size': 9 }, label));
    };
    band(pt.spectralLowerSquared, 'ν_min||u||²');
    band(pt.spectralUpperSquared, 'ν_max||u||²');
    band(pt.bound ** 2, 'C_α tr(G)');
    chartB.selection.append(svgElement('circle', { cx: chartB.horizontal(state.psiDegrees), cy: chartB.vertical(ray.squaredNorm), r: 5, fill: colors.test }));
    chartB.selection.append(svgElement('circle', { cx: chartB.horizontal(uAngle * 180 / Math.PI), cy: chartB.vertical(pt.gradientNormSquared), r: 5, fill: colors.gradient }));

    const chartC = setupChart('advanced-plot-c', [-0.8, 0.8], [-0.8, 0.8], 'input dim 1', 'input dim 2', bounds2d);
    drawArrow(chartC, chartC.horizontal(0), chartC.vertical(0), pt.A[0][0], pt.A[0][1], colors.indigo, 'a_μ');
    drawArrow(chartC, chartC.horizontal(0), chartC.vertical(0), pt.A[1][0], pt.A[1][1], colors.violet, 'a_Σ');
    drawArrow(chartC, chartC.horizontal(0), chartC.vertical(0), pt.gradient[0], pt.gradient[1], colors.gradient, '∇α');
    drawArrow(chartC, chartC.horizontal(0), chartC.vertical(0), ray.inputGradient[0], ray.inputGradient[1], colors.test, 'Aᵀũ');

    const chartD = setupChart('advanced-plot-d', [0, 4], [0, Math.max(pt.bound, pt.gradientNorm, pt.spectralUpper, 1e-6) * 1.25], '', '‖·‖₂', bounds2d);
    const labels = ['√ν_min||u||', '||∇α||₂', '√ν_max||u||', '√(C_α tr)'];
    const values = [pt.spectralLower, pt.gradientNorm, pt.spectralUpper, pt.bound];
    const barW = (chartD.box.right - chartD.box.left) / 5;
    values.forEach((v, i) => {
      const x = chartD.box.left + (i + 0.6) * barW;
      const h = chartD.vertical(0) - chartD.vertical(v);
      chartD.data.append(svgElement('rect', { x, y: chartD.vertical(v), width: barW * 0.65, height: h, fill: [colors.muted, colors.gradient, colors.teal, colors.violet][i], class: 'bar-fill' }));
      chartD.data.append(svgElement('text', { x: x + barW * 0.2, y: chartD.box.bottom + 28, 'font-size': 8, transform: `rotate(-20 ${x} ${chartD.box.bottom + 28})` }, labels[i]));
    });
    chartD.data.append(svgElement('text', { x: chartD.box.left, y: chartD.box.top - 6, 'font-size': 9 }, `√(tr/ν_max) = ${format(pt.traceToSpectralRatio)}`));

    updateReadoutAdvanced(pt);
    byId('psi-value').textContent = `${Math.round(state.psiDegrees)}°`;
    byId('advanced-foot-a').textContent = `ν_min = ${format(nuMin)} · ν_max = ${format(nuMax)}. Vector arrows are display-normalized so their directions remain visible.`;
    byId('advanced-foot-b').textContent = `Test ψ = ${Math.round(state.psiDegrees)}° · u angle = ${(uAngle * 180 / Math.PI).toFixed(0)}°`;
    byId('advanced-foot-c').textContent = `True norms: ||∇α||₂ = ${format(pt.gradientNorm)} · ||Aᵀũ||₂ = ${format(ray.norm)}. Arrows are display-normalized.`;
    byId('advanced-foot-d').textContent = 'Bar heights use the true magnitudes; no display normalization is applied.';
  }

  function renderStationary() {
    const pt = currentPoint2D();
    byId('advanced-title-a').textContent = 'Mean vs variance gradients';
    byId('advanced-subtitle-a').textContent = 'Angle θ_{μ,Σ} and parallelogram area ∝ det(M)';
    byId('advanced-title-b').textContent = 'Weighted pulls';
    byId('advanced-subtitle-b').textContent = '(∂μ ᾱ)∇μ and (∂Σ ᾱ)∇Σ sum to ∇α';
    byId('advanced-title-c').textContent = 'Nullspace of M in u-space';
    byId('advanced-subtitle-c').textContent = 'Is u ∈ null(M)?';
    byId('advanced-title-d').textContent = 'Regime comparison';
    byId('advanced-subtitle-d').textContent = 'Three prepared cases + metrics';
    setLegend('advanced-legend-a', [
      { label: 'Mean gradient', color: colors.indigo },
      { label: 'Variance gradient', color: colors.violet }
    ]);
    setLegend('advanced-legend-b', [
      { label: 'Mean pull', color: colors.indigo },
      { label: 'Variance pull', color: colors.violet },
      { label: 'Sum: acquisition gradient', color: colors.gradient }
    ]);
    setLegend('advanced-legend-c', [
      { label: 'Null direction', color: colors.muted, kind: 'dashed' },
      { label: 'Active eigenvector', color: colors.teal },
      { label: 'Acquisition vector u', color: colors.gradient }
    ]);
    setLegend('advanced-legend-d', [
      { label: 'Pullback trace', color: colors.teal, kind: 'fill' },
      { label: 'Gradient norm', color: colors.gradient, kind: 'fill' },
      { label: 'Upper bound', color: colors.violet, kind: 'fill' }
    ]);

    const presets = PaperModel.stationaryPresets(predict2D, state.acquisition);
    const cases = [
      { name: 'Prior collapse', p: presets.flat },
      { name: 'Collinear, same direction (Case 2)', p: presets.singularNonStationary },
      { name: 'Collinear, opposite directions (Case 3)', p: presets.stationaryCancellation }
    ];
    const active = state.stationaryPreset === 'free' ? pt : cases.find(c =>
      (state.stationaryPreset === 'flat' && c.p === presets.flat) ||
      (state.stationaryPreset === 'singular' && c.p === presets.singularNonStationary) ||
      (state.stationaryPreset === 'cancellation' && c.p === presets.stationaryCancellation))?.p || pt;

    const chartA = setupChart('advanced-plot-a', [-1.3, 1.3], [-1.3, 1.3], '', '', bounds2d);
    drawArrow(chartA, chartA.horizontal(0), chartA.vertical(0), active.meanGradient[0], active.meanGradient[1], colors.indigo, '∇μ');
    drawArrow(chartA, chartA.horizontal(0), chartA.vertical(0), active.varianceGradient[0], active.varianceGradient[1], colors.violet, '∇Σ');
    chartA.data.append(svgElement('text', { x: chartA.box.left + 8, y: chartA.box.top + 14, 'font-size': 10 }, `cos θ = ${format(active.collinearityCosine)}`));

    const pullMu = active.meanGradient.map(g => g * active.meanSensitivity);
    const pullSig = active.varianceGradient.map(g => g * active.varianceSensitivity);
    const chartB = setupChart('advanced-plot-b', [-0.5, 0.5], [-0.5, 0.5], '', '', bounds2d);
    const ox = chartB.horizontal(0), oy = chartB.vertical(0);
    drawArrow(chartB, ox, oy, pullMu[0], pullMu[1], colors.indigo, 'μ pull');
    drawArrow(chartB, ox, oy, pullSig[0], pullSig[1], colors.violet, 'Σ pull');
    drawArrow(chartB, ox, oy, active.gradient[0], active.gradient[1], colors.gradient, 'sum');

    const chartC = setupChart('advanced-plot-c', [-1.1, 1.1], [-1.1, 1.1], 'u_μ', 'u_Σ', bounds2d);
    const [eMin, eMax] = active.eigenvectorsM;
    chartC.data.append(svgElement('line', {
      x1: chartC.horizontal(-eMin[0]), y1: chartC.vertical(-eMin[1]), x2: chartC.horizontal(eMin[0]), y2: chartC.vertical(eMin[1]),
      stroke: colors.muted, 'stroke-dasharray': '5 4', 'stroke-width': 1.5
    }));
    drawArrow(chartC, chartC.horizontal(0), chartC.vertical(0), eMax[0] * active.uNorm, eMax[1] * active.uNorm, colors.teal, 'active');
    drawArrow(chartC, chartC.horizontal(0), chartC.vertical(0), active.u[0], active.u[1], colors.gradient, 'u');

    const chartD = setupChart('advanced-plot-d', [0, 3], [0, Math.max(...cases.map(c => c.p.bound)) * 1.2], 'case', 'value', bounds2d);
    const metrics = ['trace', 'gradientNorm', 'bound'];
    cases.forEach((c, i) => {
      metrics.forEach((m, j) => {
        const x = chartD.box.left + (i * 3 + j + 0.5) * (chartD.box.right - chartD.box.left) / 10;
        const val = m === 'trace' ? c.p.trace : m === 'gradientNorm' ? c.p.gradientNorm : c.p.bound;
        chartD.data.append(svgElement('rect', { x, y: chartD.vertical(val), width: 18, height: chartD.vertical(0) - chartD.vertical(val), fill: [colors.teal, colors.gradient, colors.violet][j], opacity: i === (state.stationaryPreset === 'flat' ? 0 : state.stationaryPreset === 'singular' ? 1 : 2) ? 1 : 0.45 }));
      });
      chartD.data.append(svgElement('text', { x: chartD.box.left + (i * 3 + 1) * (chartD.box.right - chartD.box.left) / 10, y: chartD.box.bottom + 24, 'font-size': 8 }, c.name.split(' ')[0]));
    });

    updateReadoutAdvanced(active);
    document.querySelectorAll('[data-preset]').forEach(btn => btn.setAttribute('aria-pressed', btn.dataset.preset === state.stationaryPreset));
    byId('advanced-foot-a').textContent = state.stationaryPreset === 'cancellation'
      ? 'Case 3: exploitation & exploration pulls oppose (c < 0) and cancel.'
      : state.stationaryPreset === 'singular'
        ? 'Case 2: parallel gradients — singular M but ||∇α|| > 0.'
        : 'Prior collapse: gradients ≈ 0 — different mechanism.';
    byId('advanced-foot-b').textContent = `True pull sum ||∇α||₂ = ${format(active.gradientNorm)}. Nonzero arrows are display-normalized; a ring marks an exact zero vector.`;
    byId('advanced-foot-c').textContent = `ν_min = ${format(active.eigenvalues[0])} · ||u||₂ = ${format(active.uNorm)}. Vector directions are display-normalized.`;
    byId('advanced-foot-d').textContent = 'Within each case: pullback trace, gradient norm, then upper bound.';
  }

  function renderFitr() {
    PaperResults.render(state.fitrKernel);
    byId('advanced-equation-banner').hidden = true;
    const predictF = PaperModel.createPosterior2D(state.lambda1, state.lambda2, state.fitrKernel);
    const raw = predictF(state.fitrCenter[0], state.fitrCenter[1]);
    const pt = PaperModel.evaluatePoint2D(raw, state.acquisition);
    const region = PaperModel.computeFitrRegion2D(pt, state.lambda1, state.lambda2, state.fitrKappa);

    byId('advanced-title-a').textContent = 'Click to place the trust region on [0,1]²';
    byId('advanced-subtitle-a').textContent = state.fitrKernel === 'SE' ? 'TuRBO and FITR boxes, with a regularized Fisher ellipse' : 'Depth-3 ReLU IBNN GP: FITR box and regularized Fisher ellipse';
    byId('advanced-title-b').textContent = 'Coordinate weight pipeline';
    byId('advanced-subtitle-b').textContent = 'log₁₀ scale keeps G_j, Ĝ_j, and normalized w̄_j visible';
    byId('advanced-title-c').textContent = 'Table 2 benchmark lifts (GP-SE)';
    byId('advanced-subtitle-c').textContent = 'Nine problems · % improvement FITR vs TuRBO';
    byId('advanced-title-d').textContent = 'Design trade-offs';
    byId('advanced-subtitle-d').textContent = 'ℓ_j⁻⁴ near optimum · diagonal vs full ellipse';
    setLegend('advanced-legend-a', [
      ...(state.fitrKernel === 'SE' ? [{ label: 'TuRBO box', color: colors.gradient, kind: 'fill' }] : []),
      { label: 'Regularized Fisher ellipse', color: colors.teal, kind: 'fill' },
      { label: 'Diagonal FITR box', color: colors.violet, kind: 'fill' },
      { label: 'Trust-region center', color: colors.teal, kind: 'dot' }
    ]);
    setLegend('advanced-legend-b', [
      { label: 'Exact diagonal', color: colors.indigo, kind: 'fill' },
      { label: 'Monte Carlo estimate', color: colors.muted, kind: 'fill' },
      { label: 'Normalized FITR weight', color: colors.violet, kind: 'fill' }
    ]);
    setLegend('advanced-legend-c', [
      { label: 'Improvement', color: colors.teal, kind: 'fill' },
      { label: 'Degradation', color: colors.gradient, kind: 'fill' }
    ]);
    setLegend('advanced-legend-d', []);

    const chartA = setupChart('advanced-plot-a', [0, 1], [0, 1], 'x₁', 'x₂', bounds2d);
    drawUnitSquareAxes(chartA);
    const drawBox = (box, cls) => {
      const x0 = chartA.horizontal(box[0][0]), x1 = chartA.horizontal(box[0][1]);
      const y0 = chartA.vertical(box[1][0]), y1 = chartA.vertical(box[1][1]);
      chartA.data.append(svgElement('rect', { x: Math.min(x0, x1), y: Math.min(y0, y1), width: Math.abs(x1 - x0), height: Math.abs(y0 - y1), class: cls }));
    };
    if (state.fitrKernel === 'SE') drawBox(region.turboBox, 'region-turbo');
    drawBox(region.fitrBox, 'region-fitr');
    const [v1, v2] = region.ellipseAxesVectors;
    const [a1, a2] = region.ellipseSemiAxes;
    let ell = '';
    for (let t = 0; t <= 64; t++) {
      const ang = t / 64 * 2 * Math.PI;
      const dx = a1 * Math.cos(ang) * v1[0] + a2 * Math.sin(ang) * v2[0];
      const dy = a1 * Math.cos(ang) * v1[1] + a2 * Math.sin(ang) * v2[1];
      ell += (t ? 'L' : 'M') + chartA.horizontal((pt.input[0] + dx)).toFixed(2) + ',' + chartA.vertical((pt.input[1] + dy)).toFixed(2);
    }
    chartA.data.append(svgElement('path', { d: ell + 'Z', class: 'ellipse-stroke' }));
    chartA.selection.append(svgElement('circle', { cx: chartA.horizontal(pt.input[0]), cy: chartA.vertical(pt.input[1]), r: 5, fill: colors.teal, stroke: '#fff', 'stroke-width': 2 }));

    byId('advanced-foot-a').textContent = state.fitrKernel === 'SE'
      ? 'The two boxes are volume-normalized before clipping to the domain. The ellipse uses the full regularized tensor and is a local quadratic approximation.'
      : 'Depth-3 ReLU IBNN kernel, as used in the paper. This demo fixes weight and bias variances to log(2); it does not reproduce fitted experimental hyperparameters. The ellipse is a regularized local quadratic approximation.';
    byId('fitr-kappa-value').textContent = state.fitrKappa.toFixed(2);
    updateAnimationControls();
    byId('fitr-math').hidden = false;
    if (!byId('fitr-math').innerHTML) byId('fitr-math').innerHTML = PaperNotation.render('fitr', 'Regularized, volume-normalized FITR weights');
  }

  function updateReadoutAdvanced() { /* readout row removed from layout */ }

  function renderAdvancedScene() {
    if (state.scene === 3) renderHdboLens();
    else if (state.scene === 4) renderStationaryGeometry();
    else if (state.scene === 5) renderFitr();
  }

  function renderAll() {
    if (isPage0()) renderBoLoop();
    else if (isDeepDivePage()) renderSelection1d();
    else if (isAdvancedPage()) renderAdvancedScene();
  }

  function syncStageVisibility() {
    byId('advanced-card-c').hidden = state.scene === 3;
    byId('advanced-card-d').hidden = state.scene === 3;
    byId('trace-demo-details').hidden = state.scene !== 3;
    byId('page5-theory-block').hidden = state.scene !== 4;
    byId('page5-stationary-layout').hidden = state.scene !== 4;
    byId('advanced-plot-grid').hidden = state.scene === 4;
    ['b', 'c', 'd'].forEach(letter => { if (state.scene === 5) byId(`advanced-card-${letter}`).hidden = true; else if (letter === 'b') byId('advanced-card-b').hidden = false; });
    byId('fitr-explanation').hidden = state.scene !== 5;
    byId('fitr-results').hidden = state.scene !== 5;
    byId('stage-explore').hidden = state.scene !== 6;
    byId('stage-page0').hidden = !isPage0();
    byId('stage-deep-dive').hidden = !isDeepDivePage();
    byId('stage-advanced').hidden = !isAdvancedPage();
    byId('page3-proof-box').hidden = state.scene !== 2;
    byId('page3-optimizer-note').hidden = state.scene !== 2;
    document.querySelector('.reading-notes').hidden = true;
    byId('scene-controls-advanced').hidden = !isAdvancedPage() || state.scene === 3 || state.scene === 4;
    byId('controls-geometry').hidden = true;
    byId('controls-rayleigh').hidden = true;
    byId('controls-stationary').hidden = true;
    byId('controls-highdim').hidden = true;
    byId('controls-fitr').hidden = state.scene !== 5;
    const explorer = document.querySelector('.explorer.immersive-stage');
    explorer.classList.toggle('page-scene-0', state.scene === 0);
    explorer.classList.toggle('page-scene-1', state.scene === 1);
    explorer.classList.toggle('page-scene-2', state.scene === 2);
    explorer.classList.toggle('page-scene-3', state.scene === 3);
    const viewSwitch = document.querySelector('.view-switch-stage');
    if (viewSwitch) viewSwitch.hidden = !isDeepDivePage() && state.scene !== 5;
    byId('ig-prose-takeaways').hidden = false;
    byId('ig-prose-math').hidden = true;
    byId('posterior-bridge').hidden = state.scene !== 1;
    byId('continue-fitr').hidden = true;
    byId('back-overview').hidden = experience !== 'fitr';
    const hints = {
      3: 'Change the ambient dimension, RAASP coordinate budget, local radius, or reference lengthscale. The highlighted points track the selected dimension.',
      4: 'Select a marked acquisition stationary point to inspect its predictive gradients and companion ellipse.',
      5: 'Move trust-region center, toggle surrogate type, and scale κ_t.'
    };
    if (isAdvancedPage() && !pages[state.scene].detail) {
      byId('interaction-hint').textContent = hints[state.scene];
    }
  }

  function saveLocation() {
    const parameters = new URLSearchParams({
      scene: state.scene, view: state.mathematics ? 'math' : 'takeaways',
      x: state.input.toFixed(3), lengthscale: state.lengthscale.toFixed(2), acquisition: state.acquisition,
      x1: state.input2d[0].toFixed(2), x2: state.input2d[1].toFixed(2),
      l1: state.lambda1.toFixed(2), l2: state.lambda2.toFixed(2),
      ldx: state.lensDimension, lm: state.lensActive,
      lr: state.lensRadius.toFixed(2), lell: state.lensLengthscale.toFixed(2),
      sp: state.stationaryPointIndex, smode: state.stationarySelectionMode,
      sx1: state.stationaryInput[0].toFixed(3), sx2: state.stationaryInput[1].toFixed(3),
      psi: Math.round(state.psiDegrees), preset: state.stationaryPreset,
      dx: state.highDimDx, p: state.highDimP,
      fx1: state.fitrCenter[0].toFixed(2), fx2: state.fitrCenter[1].toFixed(2),
      kernel: state.fitrKernel, kappa: state.fitrKappa.toFixed(2)
    });
    try { history.replaceState(null, '', `${location.pathname}?${parameters}`); } catch (_) { /* file:// */ }
  }

  function renderPage() {
    const page = pages[state.scene];
    const pageNumber = `${String(sceneOrder.indexOf(state.scene) + 1).padStart(2, '0')} / ${String(sceneOrder.length).padStart(2, '0')}`;
    byId('stage-kicker').textContent = pageNumber;
    byId('stage-title').textContent = page.title;
    byId('source-reference').textContent = page.source;
    byId('step-count').textContent = pageNumber;
    const prevDisabled = state.scene === firstScene;
    const nextDisabled = state.scene === lastScene;
    byId('prev-page').disabled = prevDisabled;
    byId('next-page').disabled = nextDisabled;
    byId('previous').disabled = prevDisabled;
    byId('next').disabled = nextDisabled;
    document.querySelectorAll('#page-dots [data-scene]').forEach(button => {
      if (Number(button.dataset.scene) === state.scene) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    });
    document.querySelectorAll('.plot-card').forEach(card => card.classList.toggle('is-focus', page.focus.includes(card.id)));
    syncStageVisibility();
    if (isAdvancedPage() && page.text) {
      byId('advanced-lead').hidden = state.scene === 4;
      byId('advanced-lead').textContent = state.mathematics ? page.mathDetail : page.text;
      byId('advanced-equation-banner').hidden = state.scene === 4;
      byId('advanced-equation-banner').innerHTML = renderEquation(page.equation, page.title);
      const citations = byId('advanced-citations');
      citations.replaceChildren();
      citations.hidden = !page.citations?.length || (state.scene === 3 && !state.mathematics);
      if (page.citations?.length) {
        const label = document.createElement('strong');
        label.textContent = 'Prior work cited';
        citations.append(label);
        page.citations.forEach(citation => {
          const group = document.createElement('span');
          group.className = 'citation-group';
          const topic = document.createElement('b');
          topic.textContent = `${citation.topic}: `;
          group.append(topic);
          citation.references.forEach((reference, index) => {
            if (index) group.append(document.createTextNode('; '));
            const link = document.createElement('a');
            link.href = reference.url;
            link.target = '_blank';
            link.rel = 'noopener';
            link.title = reference.title;
            link.textContent = reference.label;
            group.append(link);
          });
          citations.append(group);
        });
      }
      byId('interaction-hint').textContent = state.mathematics ? page.mathDetail : page.detail;
    } else if (isDeepDivePage()) {
      byId('interaction-hint').textContent = 'Move the input slider or select a point on a plot. Changing acquisition preserves the GP; changing lengthscale refits it.';
    }
    renderAll();
    saveLocation();
  }

  /** Navigate without resetting shared controls; animate the existing manifold panel. */
  function setScene(scene) {
    const previous = state.scene;
    const next = sceneOrder.includes(scene) ? scene : sceneOrder[clamp(sceneOrder.indexOf(previous) + Math.sign(scene - previous), 0, sceneOrder.length - 1)];
    if (previous === next) return;
    pauseScan();
    if (previous === 0) pauseBoLoop();
    if (window.scrollY > 100) window.scrollTo({ top: 0, behavior: 'instant' });
    PageTransitions.run(previous, next, () => { state.scene = next; renderPage(); });
    if ([1, 2, 5].includes(next) && !reducedMotion.matches && !document.hidden) startScan();
  }

  let wander = null;

  /** Keep both animation buttons and FITR instructions in sync with playback. */
  function updateAnimationControls() {
    byId('play').textContent = state.playing ? 'Pause scan' : reducedMotion.matches ? 'Step' : 'Resume scan';
    byId('play').setAttribute('aria-pressed', String(state.playing));
    byId('bridge-motion').textContent = state.playing ? 'Pause animation' : reducedMotion.matches ? 'Step input' : 'Resume animation';
    byId('bridge-motion').setAttribute('aria-pressed', String(state.playing));
    byId('fitr-animation').textContent = state.playing ? 'Pause animation' : reducedMotion.matches ? 'Step center' : 'Resume animation';
    byId('fitr-animation').setAttribute('aria-pressed', String(state.playing));
    if (state.scene === 5) byId('fitr-current-center').textContent = state.playing
      ? 'The center moves through the input space. Pause to inspect a position.'
      : 'Animation paused. Click inside plot A to see the trust region at a specific position.';
  }

  /** Start one frame loop from the current selection without jumping on resume. */
  function startScan() {
    if (state.playing) return;
    state.playing = true;
    previousFrameTime = undefined;
    wander = null;
    updateAnimationControls();
    animationFrame = requestAnimationFrame(scanFrame);
  }

  function pauseScan() {
    state.playing = false;
    cancelAnimationFrame(animationFrame);
    updateAnimationControls();
    saveLocation();
  }

  function scanFrame(timestamp) {
    if (!state.playing) return;
    const dt = previousFrameTime !== undefined ? Math.min(timestamp - previousFrameTime, 80) : 0;
    previousFrameTime = timestamp;
    if (isDeepDivePage()) {
      state.scanDirection ||= 1;
      state.input += state.scanDirection * dt / 16000;
      if (state.input >= 1) { state.input = 2 - state.input; state.scanDirection = -1; }
      if (state.input <= 0) { state.input = -state.input; state.scanDirection = 1; }
    } else if (state.scene === 3) {
      if (!state._lastLensStep) state._lastLensStep = timestamp;
      if (timestamp - state._lastLensStep > 1800) {
        state._lastLensStep = timestamp;
        const order = [2, 8, 16, 32, 64, 128, 256];
        state.lensDimension = order[(order.indexOf(state.lensDimension) + 1) % order.length];
        byId('lens-dx').value = String(state.lensDimension);
      }
    } else if (state.scene === 4) {
      if (!state._lastStationaryStep) state._lastStationaryStep = timestamp;
      if (timestamp - state._lastStationaryStep > 1800) {
        state._lastStationaryStep = timestamp;
        const points = getStationaryExample().stationaryPoints;
        state.stationaryPointIndex = (state.stationaryPointIndex + 1) % points.length;
        state.stationarySelectionMode = 'stationary';
      }
    } else if (state.scene === 5) {
      // Smoothstep gives zero velocity at each random destination; the next leg
      // starts from that same position, keeping the path and velocity continuous.
      if (!wander) wander = { start: state.fitrCenter.slice(), target: [0.02 + 0.96 * Math.random(), 0.02 + 0.96 * Math.random()], elapsed: 0 };
      wander.elapsed += dt;
      // Divide the original duration by 1.2 for a 20% increase in travel speed.
      const fraction = Math.min(1, wander.elapsed / (7000 / 1.2));
      const blend = fraction * fraction * (3 - 2 * fraction);
      state.fitrCenter = wander.start.map((value, index) => value + blend * (wander.target[index] - value));
      byId('fitr-x1').value = state.fitrCenter[0];
      byId('fitr-x2').value = state.fitrCenter[1];
      if (fraction === 1) wander = null;
    }
    if (timestamp - lastRenderedTime > 32) { renderAll(); lastRenderedTime = timestamp; }
    animationFrame = requestAnimationFrame(scanFrame);
  }

  function pointerToUnitSquare(svg, event) {
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(svg.getScreenCTM().inverse());
    const x1 = clamp((point.x - bounds2d.left) / (bounds2d.right - bounds2d.left), 0, 1);
    const x2 = clamp(1 - (point.y - bounds2d.top) / (bounds2d.bottom - bounds2d.top), 0, 1);
    return [x1, x2];
  }

  function bind2dPointer(id) {
    const plot = byId(id);
    plot.addEventListener('pointerdown', event => {
      if (state.scene === 3 || state.scene === 4 || (state.scene === 5 && id !== 'advanced-plot-a')) return;
      pauseScan();
      const [x1, x2] = pointerToUnitSquare(plot, event);
      if (state.scene === 5) { state.fitrCenter = [x1, x2]; byId('fitr-x1').value = x1; byId('fitr-x2').value = x2; }
      else { state.input2d = [x1, x2]; state.stationaryPreset = 'free'; byId('x1').value = x1; byId('x2').value = x2; }
      byId('x1-value').textContent = x1.toFixed(2);
      byId('x2-value').textContent = x2.toFixed(2);
      renderAll(); saveLocation();
    });
  }

  const bindPageNav = (id, delta) => byId(id).addEventListener('click', () => setScene(state.scene + delta));
  bindPageNav('prev-page', -1);
  bindPageNav('next-page', 1);
  bindPageNav('previous', -1);
  bindPageNav('next', 1);
  byId('bo-play').addEventListener('click', () => {
    if (reducedMotion.matches) { advanceBoPhase(); return; }
    if (boLoop.playing) { pauseBoLoop(); return; }
    if (boLoop.completed) resetBoLoop();
    boLoop.playing = true;
    byId('bo-play').textContent = 'Pause loop';
    byId('bo-play').setAttribute('aria-pressed', 'true');
    byId('bo-cycle-card').classList.add('bo-running');
    boLoop.timer = setInterval(advanceBoPhase, 1800);
  });
  byId('bo-step').addEventListener('click', () => advanceBoPhase());
  byId('bo-reset').addEventListener('click', resetBoLoop);
  byId('input-position').addEventListener('input', event => { pauseScan(); state.input = Number(event.target.value); renderSelection1d(); saveLocation(); });
  byId('lengthscale').addEventListener('input', event => { pauseScan(); state.lengthscale = Number(event.target.value); byId('lengthscale-value').textContent = state.lengthscale.toFixed(2); rebuildCharts(); saveLocation(); });
  byId('acquisition').addEventListener('change', event => { pauseScan(); state.acquisition = event.target.value; rebuildCharts(); saveLocation(); });
  byId('toggle-bound').addEventListener('click', () => {
    state.showUpperBound = !state.showUpperBound;
    syncBoundPlotVisibility();
  });
  byId('toggle-trace').addEventListener('click', () => {
    state.showPullbackTrace = !state.showPullbackTrace;
    syncBoundPlotVisibility();
  });
  byId('lens-dx').addEventListener('change', event => {
    pauseScan(); state.lensDimension = Number(event.target.value); renderHdboLens(); saveLocation();
  });
  ['lens-active', 'lens-radius', 'lens-lengthscale'].forEach(id => byId(id).addEventListener('input', event => {
    pauseScan();
    if (id === 'lens-active') state.lensActive = Number(event.target.value);
    if (id === 'lens-radius') state.lensRadius = Number(event.target.value);
    if (id === 'lens-lengthscale') state.lensLengthscale = Number(event.target.value);
    renderHdboLens(); saveLocation();
  }));
  ['x1', 'x2', 'lambda1', 'lambda2'].forEach(id => byId(id).addEventListener('input', event => {
    pauseScan();
    if (id === 'x1') state.input2d[0] = Number(event.target.value);
    if (id === 'x2') state.input2d[1] = Number(event.target.value);
    if (id === 'lambda1') state.lambda1 = Number(event.target.value);
    if (id === 'lambda2') state.lambda2 = Number(event.target.value);
    byId(`${id}-value`).textContent = Number(event.target.value).toFixed(2);
    if (id.startsWith('lambda')) rebuildPredict2D();
    renderAll(); saveLocation();
  }));
  byId('psi').addEventListener('input', event => { state.psiDegrees = Number(event.target.value); renderRayleigh(); saveLocation(); });
  byId('snap-acquisition').addEventListener('click', () => {
    const pt = currentPoint2D();
    state.psiDegrees = ((Math.atan2(pt.u[1], pt.u[0]) * 180 / Math.PI) + 360) % 360;
    byId('psi').value = state.psiDegrees; renderRayleigh(); saveLocation();
  });
  byId('snap-eigen').addEventListener('click', () => {
    const pt = currentPoint2D();
    const ev = pt.eigenvectorsM[1];
    state.psiDegrees = ((Math.atan2(ev[1], ev[0]) * 180 / Math.PI) + 360) % 360;
    byId('psi').value = state.psiDegrees; renderRayleigh(); saveLocation();
  });
  document.querySelectorAll('[data-preset]').forEach(btn => btn.addEventListener('click', () => {
    state.stationaryPreset = btn.dataset.preset;
    if (state.stationaryPreset !== 'free') {
      const presets = PaperModel.stationaryPresets(predict2D, state.acquisition);
      const p = state.stationaryPreset === 'flat' ? presets.flat : state.stationaryPreset === 'singular' ? presets.singularNonStationary : presets.stationaryCancellation;
      state.input2d = p.input.slice();
    }
    renderStationary(); saveLocation();
  }));
  ['fitr-x1', 'fitr-x2', 'fitr-kappa'].forEach(id => byId(id).addEventListener('input', event => {
    pauseScan();
    if (id === 'fitr-x1') state.fitrCenter[0] = Number(event.target.value);
    if (id === 'fitr-x2') state.fitrCenter[1] = Number(event.target.value);
    if (id === 'fitr-kappa') state.fitrKappa = Number(event.target.value);
    byId(`${id}-value`).textContent = Number(event.target.value).toFixed(2);
    renderFitr(); saveLocation();
  }));
  byId('fitr-kernel').addEventListener('change', event => { state.fitrKernel = event.target.value; renderFitr(); saveLocation(); });

  byId('reset').addEventListener('click', () => {
    pauseScan();
    Object.assign(state, {
      input: 0.38, lengthscale: 0.1, acquisition: 'EI', input2d: [0.45, 0.55], lambda1: 0.18, lambda2: 0.3,
      showUpperBound: true, showPullbackTrace: true,
      lensDimension: 64, lensActive: 20, lensRadius: 0.25, lensLengthscale: 0.35,
      stationaryPointIndex: 0, stationarySelectionMode: 'stationary', stationaryInput: [0.5, 0.5],
      psiDegrees: 0, stationaryPreset: 'cancellation', highDimDx: 32, highDimP: 0.5,
      fitrCenter: [0.5, 0.5], fitrKernel: 'SE', fitrKappa: 0.28
    });
    byId('lengthscale').value = 0.1; byId('lengthscale-value').textContent = '0.10'; byId('acquisition').value = 'EI';
    byId('x1').value = 0.45; byId('x2').value = 0.55; byId('lambda1').value = 0.18; byId('lambda2').value = 0.3;
    byId('lens-dx').value = '64'; byId('lens-active').value = 20; byId('lens-radius').value = 0.25; byId('lens-lengthscale').value = 0.35;
    byId('psi').value = 0; byId('highdim-dx').value = '32'; byId('highdim-p').value = '0.5';
    byId('fitr-x1').value = 0.5; byId('fitr-x2').value = 0.5; byId('fitr-kappa').value = 0.28; byId('fitr-kernel').value = 'SE';
    rebuildCharts(); saveLocation();
  });
  byId('bridge-motion').addEventListener('click', () => byId('play').click());
  byId('play').addEventListener('click', () => {
    if (reducedMotion.matches) {
      if (isDeepDivePage()) { state.input = (state.input + 0.05) % 1; renderSelection1d(); }
      else if (state.scene === 3) {
        const order = [2, 8, 16, 32, 64, 128, 256];
        state.lensDimension = order[(order.indexOf(state.lensDimension) + 1) % order.length];
        byId('lens-dx').value = String(state.lensDimension); renderHdboLens();
      }
      else if (state.scene === 4) {
        const points = getStationaryExample().stationaryPoints;
        state.stationaryPointIndex = (state.stationaryPointIndex + 1) % points.length;
        state.stationarySelectionMode = 'stationary';
        renderStationaryGeometry();
      }
      else { state.input2d[0] = (state.input2d[0] + 0.04) % 1; renderAll(); }
      saveLocation(); return;
    }
    if (state.playing) { pauseScan(); return; }
    startScan();
  });
  byId('fitr-animation').addEventListener('click', () => {
    if (state.playing) { pauseScan(); return; }
    if (reducedMotion.matches) { state.fitrCenter = [Math.random(), Math.random()]; renderFitr(); saveLocation(); return; }
    startScan();
  });
  reducedMotion.addEventListener('change', () => { pauseScan(); byId('play').textContent = reducedMotion.matches ? 'Step' : 'Play scan'; });
  document.addEventListener('visibilitychange', () => { if (document.hidden) { pauseScan(); pauseBoLoop(); } });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') { pauseScan(); return; }
    if (/INPUT|SELECT|TEXTAREA|SUMMARY/.test(event.target.tagName) || event.target.isContentEditable) return;
    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
      event.preventDefault();
      const direction = event.key === 'ArrowRight' ? 1 : -1;
      setScene(state.scene + direction);
    }
  });
  ['prediction-plot', 'acquisition-plot', 'bound-plot'].forEach(id => {
    const plot = byId(id); plot.classList.add('selectable');
    plot.addEventListener('pointerdown', event => {
      pauseScan();
      const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(plot.getScreenCTM().inverse());
      state.input = clamp((point.x - bounds1d.left) / (bounds1d.right - bounds1d.left), 0, 1);
      renderSelection1d(); saveLocation();
    });
  });
  ['advanced-plot-a', 'advanced-plot-b', 'advanced-plot-c'].forEach(bind2dPointer);
  byId('stationary-acquisition-plot').addEventListener('pointerdown', event => {
    const [x1, x2] = pointerToUnitSquare(byId('stationary-acquisition-plot'), event);
    state.stationarySelectionMode = 'free';
    state.stationaryInput = [x1, x2];
    renderStationaryGeometry();
    saveLocation();
  });

  byId('lengthscale').value = state.lengthscale;
  byId('lengthscale-value').textContent = state.lengthscale.toFixed(2);
  byId('acquisition').value = state.acquisition;
  byId('x1').value = state.input2d[0]; byId('x2').value = state.input2d[1];
  byId('x1-value').textContent = state.input2d[0].toFixed(2); byId('x2-value').textContent = state.input2d[1].toFixed(2);
  byId('lambda1').value = state.lambda1; byId('lambda2').value = state.lambda2;
  byId('lambda1-value').textContent = state.lambda1.toFixed(2); byId('lambda2-value').textContent = state.lambda2.toFixed(2);
  byId('lens-dx').value = String(state.lensDimension);
  byId('lens-active').value = state.lensActive; byId('lens-radius').value = state.lensRadius; byId('lens-lengthscale').value = state.lensLengthscale;
  byId('lens-active-value').textContent = String(Math.min(state.lensDimension, state.lensActive));
  byId('lens-radius-value').textContent = state.lensRadius.toFixed(2);
  byId('lens-lengthscale-value').textContent = state.lensLengthscale.toFixed(2);
  byId('psi').value = state.psiDegrees;
  byId('highdim-dx').value = String(state.highDimDx);
  byId('highdim-p').value = String(state.highDimP);
  byId('fitr-x1').value = state.fitrCenter[0]; byId('fitr-x2').value = state.fitrCenter[1];
  byId('fitr-kappa').value = state.fitrKappa; byId('fitr-kernel').value = state.fitrKernel;
  if (typeof PaperNotation !== 'undefined' && byId('sine-identity-math')) {
    try { byId('sine-identity-math').innerHTML = renderEquation('sine_identity', 'Sine identity for det(M)'); } catch (_) { /* notation key pending */ }
  }
  buildPageDots();
  populateStaticContent();
  rebuildCharts();
  renderPage();
  if (reducedMotion.matches) byId('play').textContent = 'Step';
  if ([1, 2, 5].includes(state.scene) && !reducedMotion.matches && !document.hidden) startScan();
  document.documentElement.dataset.ready = 'true';
})();
