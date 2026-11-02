/* Text and mathematics for the first three pages. Symbols use the paper macros and KaTeX Computer Modern. */
(function (root) {
  'use strict';
  const input = String.raw`\cusvector{\inpvars}`;
  const parameters = String.raw`\cusvector{\manifoldparameters}_{\boiteration,${input}}`;
  const fisher = String.raw`\fishermetric_{\manifold}(${parameters})`;
  const jacobian = String.raw`\cusmatrix{\jacobianmap}_{\boiteration}(${input})`;
  const tensor = String.raw`\cusmatrix{\pullbackFIM}_{\boiteration}(${input})`;
  const base = String.raw`\cusvector{\MCbasesamples}`;
  const integrand = String.raw`\acqfdistfunctional(${parameters},${base})`;
  const parameterGradient = String.raw`\nabla_{${parameters}}${integrand}`;
  const expectation = String.raw`\expectation_{${base}}`;
  const acquisitionVector = String.raw`\cusvector{\fisheracqgradient}`;
  const factor = String.raw`\cusmatrix{\fisherjacobian}`;
  const inputGradient = String.raw`\nabla_{${input}}\acqf(${input})`;
  const mean = String.raw`\distmean_{\boiteration,${input}}`;
  const variance = String.raw`\distcov_{\boiteration,${input}}`;
  const inline = expression => PaperNotation.inline(expression);
  const display = expression => PaperNotation.tex(expression, true);
  const write = (id, html) => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = html;
  };

  /** Render all static [data-tex] spans in the document using KaTeX Computer Modern. */
  function renderStaticTex() {
    document.querySelectorAll('.tex-inline[data-tex]').forEach(span => {
      span.innerHTML = inline(span.dataset.tex);
    });
  }

  /** Populate the BO introduction, the (2,1) Information Geometric View block, and the Page 3 proof. */
  function populate() {
    renderStaticTex();
    write(
      'page0-lead',
      `Consider optimizing an expensive black-box process whose true response ${inline(String.raw`\processfunction_{\mathrm{true}}(\inpvars)`)} has no closed-form expression and each experimental trial takes hours. Bayesian optimization (BO) fits a probabilistic surrogate model ${inline(String.raw`\surrogatemodel_{\boiteration}`)} to the observed trials ${inline(String.raw`\observeddata_{\boiteration}`)} and maximizes an acquisition function ${inline(String.raw`\acqf(\inpvars;\observeddata_{\boiteration})`)} to select the most informative next experiment ${inline(String.raw`\inpvars_{\boiteration+1}`)}.`
    );

    const badges = [
      [
        String.raw`\inpvars \in \inpvarsset \subset \mathbb{R}^{\dims{\inpvars}}`,
        'Design input',
        'Controllable setting for the experiment.'
      ],
      [
        String.raw`\obsouts_{\numobservation} = \processfunction_{\mathrm{true}}(\inpvars_{\numobservation}) + \noise_{\numobservation}`,
        'Black-box observation',
        `Noisy measured response collected in dataset ${inline(String.raw`\observeddata_{\boiteration}`)}.`
      ],
      [
        String.raw`\probability(\obsouts \mid \inpvars, \observeddata_{\boiteration}) = \mathcal{N}\!\left(\distmean_{\boiteration,\inpvars},\, \distcov_{\boiteration,\inpvars}\right)`,
        'Surrogate posterior',
        `Model ${inline(String.raw`\surrogatemodel_{\boiteration}`)} predicts mean ${inline(String.raw`\distmean_{\boiteration,\inpvars}`)} and variance ${inline(String.raw`\distcov_{\boiteration,\inpvars}`)}.`
      ],
      [
        String.raw`\inpvars_{\boiteration+1} = \arg\max_{\inpvars\in\inpvarsset}\acqf(\inpvars;\observeddata_{\boiteration})`,
        'Acquisition rule',
        'Scores candidate settings by balancing exploitation and exploration.'
      ]
    ];
    write(
      'page0-badges',
      badges
        .map(
          ([symbol, title, description]) =>
            `<li><div class="badge-math">${inline(symbol)}</div><div class="badge-title">${title}</div><div class="badge-desc">${description}</div></li>`
        )
        .join('')
    );

    const igSharedHtml = `
      <p>At iteration ${inline(String.raw`\boiteration`)}, the surrogate model ${inline(String.raw`\surrogatemodel_{\boiteration}`)} acts as a smooth <b>posterior map</b> from the input domain ${inline(String.raw`\inpvarsset \subset \mathbb{R}^{\dims{\inpvars}}`)} to the statistical manifold ${inline(String.raw`\manifold`)} of predictive distributions:</p>
      <div class="equation">${display(String.raw`\manifoldmap_{\boiteration} : \inpvarsset \to \manifold, \qquad ${input} \mapsto ${parameters} = \bigl(${mean},\, ${variance}\bigr) \in \mathbb{R}\times\mathbb{R}_{+}`)}</div>
      <p>Because the predictive density ${inline(String.raw`\probability(\obsouts\mid ${input},\observeddata_{\boiteration})=\probability(\obsouts;${parameters})`)} is determined by ${inline(parameters)}, the acquisition function depends on ${inline(input)} strictly through this manifold map:</p>
      <div class="equation">${display(String.raw`\acqf(${input}) = ${expectation}\!\left[\acqfdistfunctional\!\left(\manifoldmap_{\boiteration}(${input}),\, ${base};\, \cusvector{\acqfparams}\right)\right]`)}</div>
      <p class="chart-caveat">Distant inputs where the surrogate reverts toward the prior map to nearby points on ${inline(String.raw`\manifold`)}. Pulling back the Fisher–Rao metric ${inline(String.raw`\fishermetric_{\manifold}`)} through ${inline(String.raw`\manifoldmap_{\boiteration}`)} defines the pullback Fisher tensor ${inline(String.raw`${tensor} = ${jacobian}^{\top}\fishermetric_{\manifold}\!\bigl(\manifoldmap_{\boiteration}(${input})\bigr)${jacobian}`)}.</div>
    `;
    write('ig-prose-takeaways', igSharedHtml);
    write('ig-prose-math', igSharedHtml);

    populateProof();
  }

  /** Render the complete notation, Proposition 4.2, four-step proof, Gaussian corollary, and paper interpretation. */
  function populateProof() {
    const notation = [
      [
        String.raw`${input}\in\inpvarsset\subset\mathbb{R}^{\dims{\inpvars}}`,
        `Candidate input vector in the feasible domain at BO iteration ${inline(String.raw`\boiteration`)}.`
      ],
      [
        String.raw`\manifoldmap_{\boiteration} : \inpvarsset \to \manifold, \quad ${input} \mapsto ${parameters}`,
        `Smooth posterior map sending each input to its predictive distribution parameters ${inline(parameters)} on the statistical manifold ${inline(String.raw`\manifold`)}.`
      ],
      [
        String.raw`${jacobian} = \frac{\partial ${parameters}}{\partial ${input}} \in \mathbb{R}^{\dims{\manifoldparameters}\times\dims{\inpvars}}`,
        'Jacobian of the posterior map with respect to the input coordinates.'
      ],
      [
        String.raw`\bigl[\fishermetric_{\manifold}(\cusvector{\manifoldparameters})\bigr]_{ij} = \expectation_{\probability(\obsouts;\cusvector{\manifoldparameters})}\!\left[\frac{\partial\log\probability(\obsouts;\cusvector{\manifoldparameters})}{\partial\manifoldparameters_i}\frac{\partial\log\probability(\obsouts;\cusvector{\manifoldparameters})}{\partial\manifoldparameters_j}\right]`,
        `Fisher–Rao Riemannian metric on the statistical manifold ${inline(String.raw`\manifold`)}.`
      ],
      [
        String.raw`${tensor} = ${jacobian}^{\top}\,\fishermetric_{\manifold}\!\bigl(\manifoldmap_{\boiteration}(${input})\bigr)\,${jacobian} \in \mathbb{R}^{\dims{\inpvars}\times\dims{\inpvars}}`,
        'Pullback Fisher tensor (Definition 4.1) measuring local input-space distributional sensitivity.'
      ],
      [
        String.raw`\acqf(${input}) = ${expectation}\!\left[\acqfdistfunctional\!\left(${parameters},\, ${base};\, \cusvector{\acqfparams}\right)\right]`,
        `Reparameterized acquisition with input-independent base sample ${inline(String.raw`${base}\sim\mathcal{N}(\mathbf{0},\eye)`)}; closed-form AFs drop ${inline(base)}.`
      ]
    ];
    write(
      'proof-notation-grid',
      notation
        .map(
          ([equation, explanation]) =>
            `<div class="notation-card"><div class="notation-formula">${display(equation)}</div><p>${explanation}</p></div>`
        )
        .join('')
    );

    write(
      'proof-assumption-text',
      `<b>Assumption 4.1 (Surrogate Differentiability &amp; Positive Fisher Metric):</b> The posterior map ${inline(String.raw`\manifoldmap_{\boiteration}`)} is ${inline(String.raw`C^1`)} on ${inline(String.raw`\inpvarsset`)} and ${inline(String.raw`${fisher}\succ 0`)} for all ${inline(String.raw`${input}\in\inpvarsset`)} (ensured for GP regression by observation noise ${inline(String.raw`\noisevar > 0`)}).<br><br><b>Proposition 4.2 (Acquisition Gradient Bound):</b> Under Assumption 4.1, suppose ${inline(String.raw`\acqf(${input}) = ${expectation}[\acqfdistfunctional(${parameters},${base})]`)} admits valid interchange of differentiation and expectation (Lemma D.1) with ${inline(String.raw`${expectation}[\|${parameterGradient}\|_2^2] < \infty`)}. Then the Euclidean norm of the acquisition gradient is upper-bounded at every ${inline(String.raw`${input}\in\inpvarsset`)} by:`
    );
    write('proof-representation', display(String.raw`\acqf(${input}) = ${expectation}\!\left[\acqfdistfunctional\!\left(${parameters},\, ${base};\, \cusvector{\acqfparams}\right)\right]`));
    write('proof-prop', display(String.raw`\left\|${inputGradient}\right\|_2 \;\leq\; \sqrt{\acqfsensitivity\!\left(${parameters}\right)\cdot \mathrm{tr}\!\left(${tensor}\right)}`));
    write(
      'proof-sens-eq',
      display(
        String.raw`\acqfsensitivity\!\left(${parameters}\right) = ${expectation}\!\left[\nabla_{${parameters}}\acqfdistfunctional\!\left(${parameters},${base}\right)^{\top}\,${fisher}^{-1}\,\nabla_{${parameters}}\acqfdistfunctional\!\left(${parameters},${base}\right)\right]`
      )
    );

    write(
      'proof-step1-eq',
      display(
        String.raw`${inputGradient} = ${jacobian}^{\top}\,${expectation}\!\left[\nabla_{${parameters}}\acqfdistfunctional\!\left(\manifoldmap_{\boiteration}(${input}),\, ${base};\, \cusvector{\acqfparams}\right)\right]`
      )
    );
    write(
      'proof-step1-text',
      `By the chain rule through ${inline(String.raw`${parameters}=\manifoldmap_{\boiteration}(${input})`)} and the interchange of gradient and expectation (justified for scalar Gaussian reparameterizations by Lemma D.1), input perturbations act first through the posterior-map Jacobian ${inline(jacobian)} and then through the expected parameter gradient.`
    );

    write(
      'proof-step2-eq',
      display(
        String.raw`${inputGradient} = \underbrace{\left(${fisher}^{1/2}${jacobian}\right)^{\top}}_{=:\,${factor}^{\top}}\,\underbrace{${fisher}^{-1/2}\,${expectation}\!\left[\nabla_{${parameters}}\acqfdistfunctional\!\left(\cdot,\,${base}\right)\right]}_{=:\,${acquisitionVector}} = ${factor}^{\top}${acquisitionVector}`
      )
    );
    write(
      'proof-step2-text',
      `Since ${inline(String.raw`${fisher}\succ 0`)} by Assumption 4.1, inserting the identity ${inline(String.raw`\eye = ${fisher}^{1/2}${fisher}^{-1/2}`)} decomposes the gradient exactly into a geometry-dependent factor ${inline(factor)} and an acquisition-dependent vector ${inline(acquisitionVector)} in Fisher-whitened coordinates.`
    );

    write(
      'proof-step3-eq',
      display(
        String.raw`\begin{aligned}\left\|${inputGradient}\right\|_2 &= \left\|${factor}^{\top}${acquisitionVector}\right\|_2 \;\leq\; \left\|${factor}\right\|_F\,\left\|${acquisitionVector}\right\|_2 \\ &= \sqrt{\mathrm{tr}\!\left(${jacobian}^{\top}${fisher}${jacobian}\right)}\,\left\|${acquisitionVector}\right\|_2 = \sqrt{\mathrm{tr}\!\left(${tensor}\right)}\,\left\|${acquisitionVector}\right\|_2\end{aligned}`
      )
    );
    write(
      'proof-step3-text',
      `For any matrix ${inline(factor)} and vector ${inline(acquisitionVector)}, submultiplicativity yields ${inline(String.raw`\|${factor}^{\top}${acquisitionVector}\|_2^2 \leq \|${factor}\|_F^2\,\|${acquisitionVector}\|_2^2`)}, and ${inline(String.raw`\|${factor}\|_F^2 = \mathrm{tr}(${factor}^{\top}${factor}) = \mathrm{tr}(${tensor})`)}. This inequality discards relative alignment; equality holds if and only if ${inline(String.raw`${acquisitionVector}=\mathbf{0}`)} or every column of ${inline(factor)} is a scalar multiple of ${inline(acquisitionVector)}.`
    );

    write(
      'proof-step4-eq',
      display(
        String.raw`\begin{aligned}\left\|${acquisitionVector}\right\|_2^2 &= ${expectation}\!\left[\nabla_{${parameters}}\acqfdistfunctional\right]^{\top}${fisher}^{-1}\,${expectation}\!\left[\nabla_{${parameters}}\acqfdistfunctional\right] \\ &\leq ${expectation}\!\left[\nabla_{${parameters}}\acqfdistfunctional^{\top}\,${fisher}^{-1}\,\nabla_{${parameters}}\acqfdistfunctional\right] = \acqfsensitivity\!\left(${parameters}\right)\end{aligned}`
      )
    );
    write(
      'proof-step4-text',
      `Because ${inline(String.raw`${fisher}\succ 0`)}, the quadratic form ${inline(String.raw`\cusvector{v}\mapsto \cusvector{v}^{\top}${fisher}^{-1}\cusvector{v}`)} is convex. Applying Jensen’s inequality bounds ${inline(String.raw`\|${acquisitionVector}\|_2^2`)} by ${inline(String.raw`\acqfsensitivity(${parameters})`)}, completing Proposition 4.2. For closed-form analytic acquisitions (EI, UCB, PI), the integrand does not depend on ${inline(base)}, so Step 4 holds with exact equality and all slack between the orange and teal curves in Panel D arises from Step 3.`
    );

    write(
      'proof-corollary',
      display(
        String.raw`\fishermetric_{\manifold}\!\left(${parameters}\right) = \mathrm{diag}\!\left(${variance}^{-1},\; \frac{1}{2\,${variance}^{2}}\right), \qquad ${tensor} = \frac{\nabla_{${input}}${mean}\,\nabla_{${input}}${mean}^{\top}}{${variance}} + \frac{\nabla_{${input}}${variance}\,\nabla_{${input}}${variance}^{\top}}{2\,${variance}^{2}}`
      )
    );
    write(
      'proof-gaussian-sens',
      display(
        String.raw`\begin{aligned}\mathrm{tr}\!\left(${tensor}\right) &= \frac{\left\|\nabla_{${input}}${mean}\right\|_2^2}{${variance}} + \frac{\left\|\nabla_{${input}}${variance}\right\|_2^2}{2\,${variance}^{2}}, \qquad \acqfsensitivity\!\left(${parameters}\right) = \expectation_{${base}}\!\left[${variance}\!\left(\frac{\partial\acqfdistfunctional}{\partial ${mean}}\right)^{\!2} + 2\,${variance}^{2}\!\left(\frac{\partial\acqfdistfunctional}{\partial ${variance}}\right)^{\!2}\right], \\[4pt] \acqfsensitivity^{\mathrm{EI}} &= ${variance}\!\left(\probabilitycdf(z_{\boiteration})^2 + \tfrac{1}{2}\probabilitypdf(z_{\boiteration})^2\right) \leq ${variance}\!\left(1+\tfrac{1}{4\pi}\right), \qquad \acqfsensitivity^{\mathrm{UCB}} = ${variance}\!\left(1+\tfrac{\ucbexploration}{2}\right), \qquad \acqfsensitivity^{\mathrm{PI}} = \probabilitypdf(z_{\boiteration})^2\!\left(1+\tfrac{z_{\boiteration}^2}{2}\right) \leq \tfrac{1}{2\pi}\end{aligned}`
      )
    );
    write(
      'proof-corollary-text',
      `Here ${inline(String.raw`z_{\boiteration}=(${mean}-\obsouts^{\incumbentobs})/\sqrt{${variance}}`)}, and ${inline(String.raw`\probabilitycdf, \probabilitypdf`)} denote the standard normal CDF and PDF. The first pullback term ${inline(String.raw`\|\nabla_{${input}}${mean}\|_2^2/${variance}`)} captures local exploitation sensitivity; the second term ${inline(String.raw`\|\nabla_{${input}}${variance}\|_2^2/(2${variance}^2)`)} captures local exploration sensitivity.`
    );

    write(
      'proof-interpretation',
      `<p><b>Surrogate vs. acquisition decoupling:</b> Proposition 4.2 cleanly separates the two roles in inner acquisition optimization. The trace ${inline(String.raw`\mathrm{tr}(${tensor})`)} depends solely on the surrogate posterior map ${inline(String.raw`\manifoldmap_{\boiteration}`)} and measures how strongly the predictive distribution changes under local input perturbations at ${inline(input)}. The acquisition sensitivity ${inline(String.raw`\acqfsensitivity(${parameters})`)} depends only on the functional form of the acquisition and the current manifold location ${inline(parameters)}—not on which surrogate model produced that Gaussian prediction.</p><p><b>Why gradients vanish—and when they cancel:</b> Because ${inline(String.raw`\acqfsensitivity(${parameters}) = \Theta(1)`)} remains bounded for EI, UCB, and PI when variance is bounded, any region where the posterior map becomes nearly constant (for example, far from observations where a GP reverts to its prior) forces ${inline(String.raw`\mathrm{tr}(${tensor})\to 0`)} and consequently drives ${inline(String.raw`\|${inputGradient}\|_2 \to 0`)}. Conversely, a large upper bound is necessary for a large gradient but does not prevent ${inline(String.raw`${inputGradient}=\mathbf{0}`)} at interior stationary points where the mean and variance gradient pulls oppose and cancel.</p>`
    );
  }

  root.PaperContent = { populate, renderStaticTex };
})(window);
