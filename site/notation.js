/* Semantic paper notation and authentic LaTeX Computer Modern rendering via local KaTeX. */
(function (root) {
  'use strict';

  const localKatex = typeof root.katex !== 'undefined' ? root.katex : (typeof require === 'function' ? (() => {
    try { return require('./katex/katex.min.js'); } catch (_) { return null; }
  })() : null);

  const symbols = {
    input: { macro: 'inpvars', glyph: 'x', bold: true, tex: '\\mathbf{x}' },
    mean: { macro: 'distmean', glyph: 'μ', tex: '\\mu' },
    variance: { macro: 'distcov', glyph: 'Σ', tex: '\\Sigma' },
    acquisition: { macro: 'acqf', glyph: 'α', tex: '\\alpha' },
    parameters: { macro: 'manifoldparameters', glyph: 'θ', bold: true, tex: '\\boldsymbol{\\theta}' },
    posteriorMap: { macro: 'manifoldmap', glyph: 'φ', tex: '\\varphi' },
    iteration: { macro: 'boiteration', glyph: 't', tex: 't' },
    pullback: { macro: 'pullbackFIM', glyph: 'G', bold: true, tex: '\\mathbf{G}' },
    jacobian: { macro: 'jacobianmap', glyph: 'J', bold: true, tex: '\\mathbf{J}' },
    fisherJacobian: { macro: 'fisherjacobian', glyph: 'A', bold: true, tex: '\\mathbf{A}' },
    acquisitionGradient: { macro: 'fisheracqgradient', glyph: 'u', bold: true, tex: '\\mathbf{u}' }
  };

  const latexExpressions = {
    map: '\\varphi_t : \\mathcal{X} \\to \\mathcal{S}, \\qquad \\mathbf{x} \\mapsto \\boldsymbol{\\theta}_{t,\\mathbf{x}} = \\bigl(\\mu_{t,\\mathbf{x}},\\, \\Sigma_{t,\\mathbf{x}}\\bigr) \\in \\mathbb{R} \\times \\mathbb{R}_{+}',
    pullback_def: '\\mathbf{G}_t(\\mathbf{x}) = \\mathbf{J}_t(\\mathbf{x})^{\\top}\\,\\mathcal{I}_{\\mathcal{S}}\\!\\bigl(\\varphi_t(\\mathbf{x})\\bigr)\\,\\mathbf{J}_t(\\mathbf{x}) \\;\\in\\; \\mathbb{R}^{D_x \\times D_x}',
    trace: '\\mathrm{tr}\\!\\bigl(\\mathbf{G}_t(\\mathbf{x})\\bigr) = \\frac{\\|\\nabla_{\\mathbf{x}}\\mu_{t,\\mathbf{x}}\\|_2^2}{\\Sigma_{t,\\mathbf{x}}} + \\frac{\\|\\nabla_{\\mathbf{x}}\\Sigma_{t,\\mathbf{x}}\\|_2^2}{2\\,\\Sigma_{t,\\mathbf{x}}^2}',
    bound: '\\bigl\\|\\nabla_{\\mathbf{x}}\\,\\alpha(\\mathbf{x})\\bigr\\|_2 \\;\\le\\; \\sqrt{C_{\\alpha}\\!\\bigl(\\boldsymbol{\\theta}_{t,\\mathbf{x}}\\bigr) \\cdot \\mathrm{tr}\\!\\bigl(\\mathbf{G}_t(\\mathbf{x})\\bigr)}',
    sensitivity_def: 'C_{\\alpha}\\!\\bigl(\\boldsymbol{\\theta}_{t,\\mathbf{x}}\\bigr) = \\mathbb{E}_{\\boldsymbol{\\zeta}}\\!\\left[\\nabla_{\\boldsymbol{\\theta}_{t,\\mathbf{x}}}\\bar{\\alpha}\\!\\bigl(\\boldsymbol{\\theta}_{t,\\mathbf{x}},\\boldsymbol{\\zeta}\\bigr)^{\\top}\\,\\mathcal{I}_{\\mathcal{S}}\\!\\bigl(\\boldsymbol{\\theta}_{t,\\mathbf{x}}\\bigr)^{-1}\\,\\nabla_{\\boldsymbol{\\theta}_{t,\\mathbf{x}}}\\bar{\\alpha}\\!\\bigl(\\boldsymbol{\\theta}_{t,\\mathbf{x}},\\boldsymbol{\\zeta}\\bigr)\\right]',
    chain: '\\nabla_{\\mathbf{x}}\\,\\alpha(\\mathbf{x}) = \\mathbf{J}_t(\\mathbf{x})^{\\top}\\,\\mathbb{E}_{\\boldsymbol{\\zeta}}\\!\\left[\\nabla_{\\boldsymbol{\\theta}_{t,\\mathbf{x}}}\\bar{\\alpha}\\!\\bigl(\\varphi_t(\\mathbf{x}),\\,\\boldsymbol{\\zeta};\\,\\boldsymbol{\\xi}\\bigr)\\right]',
    factors: '\\nabla_{\\mathbf{x}}\\,\\alpha(\\mathbf{x}) = \\underbrace{\\bigl(\\mathcal{I}_{\\mathcal{S}}(\\boldsymbol{\\theta}_{t,\\mathbf{x}})^{1/2}\\,\\mathbf{J}_t(\\mathbf{x})\\bigr)^{\\top}}_{=:\\,\\mathbf{A}^{\\top}}\\,\\underbrace{\\mathcal{I}_{\\mathcal{S}}(\\boldsymbol{\\theta}_{t,\\mathbf{x}})^{-1/2}\\,\\mathbb{E}_{\\boldsymbol{\\zeta}}\\!\\bigl[\\nabla_{\\boldsymbol{\\theta}}\\bar{\\alpha}(\\cdot,\\boldsymbol{\\zeta})\\bigr]}_{=:\\,\\mathbf{u}} = \\mathbf{A}^{\\top}\\mathbf{u}',
    cauchy: '\\bigl\\|\\nabla_{\\mathbf{x}}\\,\\alpha(\\mathbf{x})\\bigr\\|_2 = \\bigl\\|\\mathbf{A}^{\\top}\\mathbf{u}\\bigr\\|_2 \\;\\le\\; \\|\\mathbf{A}\\|_F\\,\\|\\mathbf{u}\\|_2 = \\sqrt{\\mathrm{tr}\\!\\bigl(\\mathbf{G}_t(\\mathbf{x})\\bigr)}\\;\\|\\mathbf{u}\\|_2',
    jensen: '\\|\\mathbf{u}\\|_2^2 = \\mathbb{E}_{\\boldsymbol{\\zeta}}[\\nabla_{\\boldsymbol{\\theta}}\\bar{\\alpha}]^{\\top}\\mathcal{I}_{\\mathcal{S}}(\\boldsymbol{\\theta}_{t,\\mathbf{x}})^{-1}\\mathbb{E}_{\\boldsymbol{\\zeta}}[\\nabla_{\\boldsymbol{\\theta}}\\bar{\\alpha}] \\;\\le\\; \\mathbb{E}_{\\boldsymbol{\\zeta}}\\!\\left[\\nabla_{\\boldsymbol{\\theta}}\\bar{\\alpha}^{\\top}\\mathcal{I}_{\\mathcal{S}}(\\boldsymbol{\\theta}_{t,\\mathbf{x}})^{-1}\\nabla_{\\boldsymbol{\\theta}}\\bar{\\alpha}\\right] = C_{\\alpha}(\\boldsymbol{\\theta}_{t,\\mathbf{x}})',
    geometry2d: '\\mathbf{G}_t(\\mathbf{x}) = \\mathbf{J}_t(\\mathbf{x})^{\\top}\\mathcal{I}_{\\mathcal{S}}\\!\\bigl(\\varphi_t(\\mathbf{x})\\bigr)\\mathbf{J}_t(\\mathbf{x}) = \\frac{\\nabla_{\\mathbf{x}}\\mu_{t,\\mathbf{x}}\\,\\nabla_{\\mathbf{x}}\\mu_{t,\\mathbf{x}}^{\\top}}{\\Sigma_{t,\\mathbf{x}}} + \\frac{\\nabla_{\\mathbf{x}}\\Sigma_{t,\\mathbf{x}}\\,\\nabla_{\\mathbf{x}}\\Sigma_{t,\\mathbf{x}}^{\\top}}{2\\,\\Sigma_{t,\\mathbf{x}}^2}',
    kl_local: 'D_{\\mathrm{KL}}\\!\\bigl(p(y;\\boldsymbol{\\theta}_{t,c}) \\,\\|\\, p(y;\\varphi_t(\\mathbf{x}_{t,c}+\\boldsymbol{\\delta}))\\bigr) = \\tfrac{1}{2}\\,\\boldsymbol{\\delta}^{\\top}\\mathbf{G}_t(\\mathbf{x}_{t,c})\\,\\boldsymbol{\\delta} + o(\\|\\boldsymbol{\\delta}\\|_2^2)',
    rayleigh: '\\nabla_{\\mathbf{x}}\\alpha(\\mathbf{x})=\\mathbf{A}(\\mathbf{x})^{\\top}\\mathbf{u}(\\mathbf{x}), \\qquad \\mathbf{M}(\\mathbf{x})=\\mathbf{A}(\\mathbf{x})\\mathbf{A}(\\mathbf{x})^{\\top}, \\qquad \\|\\nabla_{\\mathbf{x}}\\alpha(\\mathbf{x})\\|_2^2=\\mathbf{u}(\\mathbf{x})^{\\top}\\mathbf{M}(\\mathbf{x})\\mathbf{u}(\\mathbf{x})',
    stationary_factors: '\\mathbf{A}(\\mathbf{x})=\\begin{bmatrix}\\nabla_{\\mathbf{x}}\\mu(\\mathbf{x})^{\\top}/\\sqrt{\\Sigma(\\mathbf{x})}\\\\[3pt]\\nabla_{\\mathbf{x}}\\Sigma(\\mathbf{x})^{\\top}/(\\sqrt{2}\\,\\Sigma(\\mathbf{x}))\\end{bmatrix}, \\qquad \\mathbf{u}(\\mathbf{x})=\\begin{bmatrix}\\sqrt{\\Sigma(\\mathbf{x})}\\,\\partial_{\\mu}\\alpha\\\\[3pt]\\sqrt{2}\\,\\Sigma(\\mathbf{x})\\,\\partial_{\\Sigma}\\alpha\\end{bmatrix}',
    stationary_spectral: '\\nu_{\\min}\\|\\mathbf{u}\\|_2^2\\leq\\|\\nabla_{\\mathbf{x}}\\alpha\\|_2^2=\\mathbf{u}^{\\top}\\mathbf{M}\\mathbf{u}\\leq\\nu_{\\max}\\|\\mathbf{u}\\|_2^2\\leq C_{\\alpha}\\,\\mathrm{tr}(\\mathbf{G})',
    stationary_condition: '\\nabla_{\\mathbf{x}}\\alpha=\\mathbf{0},\\ \\mathbf{u}\\neq\\mathbf{0}\\ \\Longrightarrow\\ \\mathbf{M}\\mathbf{u}=\\mathbf{0}\\ \\Longrightarrow\\ \\nu_{\\min}=0,\\ \\mathrm{rank}(\\mathbf{M})=1\\ \\Longrightarrow\\ \\nabla\\mu=c\\,\\nabla\\Sigma',
    stationary: '\\nabla_{\\mathbf{x}}\\,\\alpha(\\mathbf{x}) = \\mathbf{A}^{\\top}\\mathbf{u} = \\mathbf{0} \\;\\Longrightarrow\\; \\nabla_{\\mathbf{x}}\\mu_{t,\\mathbf{x}} = c\\,\\nabla_{\\mathbf{x}}\\Sigma_{t,\\mathbf{x}}, \\qquad c = -\\frac{\\partial\\bar{\\alpha}/\\partial\\Sigma_{t,\\mathbf{x}}}{\\partial\\bar{\\alpha}/\\partial\\mu_{t,\\mathbf{x}}} < 0',
    hdbo_lens: '\\underbrace{d_{\\mathrm{global}}=\\Theta(\\sqrt{D_x}),\\quad \\ell_D=\\Theta(\\sqrt{D_x})}_{\\text{dimensionally scaled prior}} \\;\\Longrightarrow\\; \\frac{d_{\\mathrm{global}}}{\\ell_D}=\\Theta(1), \\qquad \\underbrace{d_{\\mathrm{RAASP}}=\\mathcal{O}(r\\sqrt{m}),\\quad m\\ll D_x}_{\\text{local restart}}',
    highdim: 'd = \\|\\mathbf{x} - \\mathbf{x}^{\\prime}\\|_2 = \\Theta\\!\\bigl(\\sqrt{D_x}\\bigr), \\quad \\ell = c\\,D_x^p \\;\\Longrightarrow\\; p = \\tfrac{1}{2} \\text{ keeps } \\mathrm{tr}\\!\\bigl(\\mathbf{G}_t(\\mathbf{x})\\bigr) = \\Theta(D_x^{-1})',
    fitr: '\\bar{w}_{t,j} = \\bigl(\\widehat{G}_{t,j}(\\mathbf{x}_{t,c}) + \\varepsilon_t\\bigr)^{-1/2}, \\qquad \\mathcal{X}_t^{\\mathcal{TR}} = \\left\\{\\mathbf{x}\\in\\mathcal{X} : \\bigl\\|\\mathrm{diag}(\\bar{\\mathbf{w}}_t)^{-1}(\\mathbf{x}-\\mathbf{x}_{t,c})\\bigr\\|_{\\infty} \\le \\frac{\\kappa_t}{2}\\right\\}',
    sine_identity: '\\det(\\mathbf{M}) = \\nu_{\\min}\\,\\nu_{\\max} = \\frac{\\|\\nabla_{\\mathbf{x}}\\mu_{t,\\mathbf{x}}\\|_2^2\\,\\|\\nabla_{\\mathbf{x}}\\Sigma_{t,\\mathbf{x}}\\|_2^2}{2\\,\\Sigma_{t,\\mathbf{x}}^3}\\,\\sin^2\\theta_{\\mu,\\Sigma}',
    gaussian_corollary: '\\mathcal{I}_{\\mathcal{S}}(\\boldsymbol{\\theta}_{t,\\mathbf{x}}) = \\mathrm{diag}\\!\\left(\\Sigma_{t,\\mathbf{x}}^{-1},\\; \\tfrac{1}{2}\\Sigma_{t,\\mathbf{x}}^{-2}\\right), \\qquad C_{\\alpha}^{\\mathrm{EI}} = \\Sigma_{t,\\mathbf{x}}\\!\\left(\\Omega(z_t)^2 + \\tfrac{1}{2}\\omega(z_t)^2\\right), \\qquad C_{\\alpha}^{\\mathrm{UCB}} = \\Sigma_{t,\\mathbf{x}}\\!\\left(1 + \\tfrac{\\kappa_{\\mathrm{UCB}}}{2}\\right)'
  };

  // Existing paper macros, shared by inline notation and the complete proof.
  const macros = {
    '\\inpvars': 'x', '\\inpvarsset': '\\mathcal{X}', '\\obsouts': 'y',
    '\\numobservation': 'n',
    '\\observeddata': '\\mathcal{D}', '\\boiteration': 't',
    '\\processfunction': 'f', '\\distmean': '\\mu', '\\distcov': '\\Sigma',
    '\\acqf': '\\alpha', '\\acqfdistfunctional': '\\bar{\\alpha}',
    '\\acqfparams': '\\xi', '\\surrogatemodel': '\\mathcal{M}',
    '\\probability': 'p', '\\noise': '\\varepsilon', '\\noisevar': '\\sigma_{\\varepsilon}^2',
    '\\lengthscale': '\\ell', '\\signalvar': '\\sigma_f^2',
    '\\incumbentobs': '\\star', '\\probabilitypdf': '\\omega', '\\probabilitycdf': '\\Omega',
    '\\ucbexploration': '\\kappa_{\\mathrm{UCB}}', '\\pitemperature': '\\tau',
    '\\manifoldparameters': '\\theta', '\\manifoldmap': '\\varphi',
    '\\manifold': '\\mathcal{S}', '\\fishermetric': '\\mathcal{I}',
    '\\pullbackFIM': 'G', '\\jacobianmap': 'J', '\\acqfsensitivity': 'C_{\\alpha}',
    '\\fisherjacobian': 'A', '\\fisheracqgradient': 'u',
    '\\fishercompanion': 'M', '\\fishereigenvalue': '\\nu',
    '\\MCbasesamples': '\\zeta', '\\TRlength': '\\kappa',
    '\\TRregularization': '\\varepsilon', '\\TRlengthweight': '\\bar{w}',
    '\\cusvector': '\\boldsymbol{#1}', '\\cusmatrix': '\\mathbf{#1}',
    '\\expectation': '\\mathbb{E}', '\\dims': 'D_{#1}', '\\eye': '\\mathbf{I}'
  };

  function getKatex() {
    return (typeof root !== 'undefined' && root.katex) ? root.katex : localKatex;
  }

  /** Render arbitrary LaTeX using KaTeX Computer Modern (with accessible MathML). */
  function tex(latexString, displayMode = false, description = '') {
    const k = getKatex();
    if (k && typeof k.renderToString === 'function') {
      const rendered = k.renderToString(latexString, {
        displayMode: Boolean(displayMode),
        throwOnError: false,
        output: 'htmlAndMathml',
        strict: false
        ,macros
      });
      if (description) {
        return `<span class="katex-wrap" aria-label="${description}">${rendered}</span>`;
      }
      return rendered;
    }
    return `<math xmlns="http://www.w3.org/1998/Math/MathML" display="${displayMode ? 'block' : 'inline'}" aria-label="${description || latexString}"><mtext>${latexString}</mtext></math>`;
  }

  function inline(latexString) {
    return tex(latexString, false);
  }

  /** Render a predefined named equation in display mode. */
  function render(name, description = '') {
    const expr = latexExpressions[name] || latexExpressions.bound;
    return tex(expr, true, description || name);
  }

  root.PaperNotation = { render, tex, inline, symbols, latexExpressions };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.PaperNotation;
})(typeof globalThis !== 'undefined' ? globalThis : window);
