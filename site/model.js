/* Deterministic Gaussian-process models, pullback Fisher geometry, Rayleigh brackets,
 * stationary-point regimes, high-dimensional scaling, and FITR trust-region weights.
 */
(function (root) {
  'use strict';

  const observations = Object.freeze([
    { input: 0.08, output: 0.15 }, { input: 0.18, output: 0.68 },
    { input: 0.30, output: 0.35 }, { input: 0.44, output: 0.95 },
    { input: 0.58, output: 0.52 }
  ]);

  const observations2D = Object.freeze([
    { input: [0.18, 0.24], output: 0.32 },
    { input: [0.32, 0.68], output: 0.74 },
    { input: [0.46, 0.42], output: 0.96 },
    { input: [0.64, 0.28], output: 0.48 },
    { input: [0.74, 0.72], output: 0.62 },
    { input: [0.26, 0.48], output: 0.54 }
  ]);

  const benchmarkSummary = Object.freeze([
    { problem: 'Hopper (33D)', turbo: '-1312.41 ± 231.02', fitr: '-1536.81 ± 242.86', improvement: 17.10 },
    { problem: 'HPA102-1 (32D)', turbo: '219.01 ± 0.82', fitr: '218.99 ± 0.60', improvement: 0.01 },
    { problem: 'LassoDNA (180D)', turbo: '0.29195 ± 0.00093', fitr: '0.29263 ± 0.00066', improvement: -0.24 },
    { problem: 'Lunarlander (12D)', turbo: '-283.66 ± 9.69', fitr: '-293.36 ± 23.62', improvement: 3.42 },
    { problem: 'MOPTA08 (124D)', turbo: '216.40 ± 0.46', fitr: '215.70 ± 0.27', improvement: 0.32 },
    { problem: 'RobotPushing (14D)', turbo: '-5.43 ± 0.40', fitr: '-6.45 ± 0.54', improvement: 18.79 },
    { problem: 'Rover (60D)', turbo: '-2.63 ± 0.55', fitr: '-3.58 ± 0.19', improvement: 36.18 },
    { problem: 'SVM (388D)', turbo: '0.05336 ± 0.00306', fitr: '0.05780 ± 0.00613', improvement: -8.32 },
    { problem: 'Swimming (16D)', turbo: '-358.25 ± 1.80', fitr: '-340.55 ± 17.87', improvement: -4.94 }
  ]);

  /** Evaluate the standard normal PDF. */
  function normalPdf(value) {
    return Math.exp(-0.5 * value * value) / Math.sqrt(2 * Math.PI);
  }

  /** Evaluate the normal CDF (absolute approximation error below 8e-8). */
  function normalCdf(value) {
    const magnitude = Math.abs(value);
    const reciprocal = 1 / (1 + 0.2316419 * magnitude);
    const polynomial = reciprocal * (0.319381530 + reciprocal * (-0.356563782 +
      reciprocal * (1.781477937 + reciprocal * (-1.821255978 + reciprocal * 1.330274429))));
    const tail = normalPdf(magnitude) * polynomial;
    return value >= 0 ? 1 - tail : tail;
  }

  /** Factor a symmetric positive-definite covariance matrix without an inverse. */
  function cholesky(matrix) {
    const factor = matrix.map(row => row.map(() => 0));
    for (let row = 0; row < matrix.length; row++) {
      for (let column = 0; column <= row; column++) {
        let residual = matrix[row][column];
        for (let inner = 0; inner < column; inner++) residual -= factor[row][inner] * factor[column][inner];
        if (row === column && residual <= 0) throw new Error('Covariance matrix is not positive definite.');
        factor[row][column] = row === column ? Math.sqrt(residual) : residual / factor[column][column];
      }
    }
    return factor;
  }

  /** Solve a covariance system from its lower Cholesky factor and a right-hand side. */
  function solveCovariance(factor, rightHandSide) {
    const forward = [], solution = [];
    for (let row = 0; row < factor.length; row++) {
      let value = rightHandSide[row];
      for (let column = 0; column < row; column++) value -= factor[row][column] * forward[column];
      forward[row] = value / factor[row][row];
    }
    for (let row = factor.length - 1; row >= 0; row--) {
      let value = forward[row];
      for (let column = row + 1; column < factor.length; column++) value -= factor[column][row] * solution[column];
      solution[row] = value / factor[row][row];
    }
    return solution;
  }

  const dot = (left, right) => left.reduce((sum, value, index) => sum + value * right[index], 0);
  const norm2 = vector => Math.hypot(...vector);

  /** Deterministic hidden response curve for the Page 1 BO loop illustration. */
  function trueProcessResponse(input) {
    const x = input;
    return 0.22 + 0.62 * Math.sin(2.4 * Math.PI * x + 0.25) * Math.exp(-3.2 * (x - 0.52) ** 2) + 0.12 * x;
  }

  const boLoopInitialObservations = Object.freeze([
    { input: 0.10, output: trueProcessResponse(0.10) },
    { input: 0.28, output: trueProcessResponse(0.28) },
    { input: 0.52, output: trueProcessResponse(0.52) }
  ]);

  /** Fit a zero-mean SE GP to the displayed 1D observations; return a scalar predictor.
   * Signal variance is one, observation noise variance is 0.0025. Returned variance
   * is latent predictive variance, excluding observation noise at the query point.
   */
  function createPosterior(lengthscale) {
    return createPosteriorFromObservations(observations, lengthscale);
  }

  function createPosteriorFromObservations(data, lengthscale, options = {}) {
    if (!(lengthscale > 0) || !Number.isFinite(lengthscale)) throw new Error('A positive finite lengthscale is required.');
    const priorMean = Number.isFinite(options.priorMean) ? options.priorMean : 0;
    const signalVariance = Number.isFinite(options.signalVariance) && options.signalVariance > 0 ? options.signalVariance : 1;
    const noiseVariance = Number.isFinite(options.noiseVariance) && options.noiseVariance >= 0 ? options.noiseVariance : 0.0025;
    const kernel = (left, right) => signalVariance * Math.exp(-0.5 * ((left - right) / lengthscale) ** 2);
    const factor = cholesky(data.map((left, row) => data.map((right, column) =>
      kernel(left.input, right.input) + (row === column ? noiseVariance : 0))));
    const centeredOutputs = data.map(item => item.output - priorMean);
    const posteriorWeights = solveCovariance(factor, centeredOutputs);
    return function predict(input) {
      const covariances = data.map(item => kernel(input, item.input));
      const covarianceDerivatives = data.map((item, index) =>
        covariances[index] * (item.input - input) / lengthscale ** 2);
      const solvedCovariances = solveCovariance(factor, covariances);
      const variance = Math.max(1e-12, signalVariance - dot(covariances, solvedCovariances));
      return {
        input, mean: priorMean + dot(covariances, posteriorWeights), variance,
        meanDerivative: dot(covarianceDerivatives, posteriorWeights),
        varianceDerivative: -2 * dot(covarianceDerivatives, solvedCovariances)
      };
    };
  }

  /** Compute analytic acquisition value and parameter derivatives wrt (mean, variance). */
  function acquisitionParameterDerivatives(mean, variance, acquisition = 'EI', incumbent = 0.95) {
    const standardDeviation = Math.sqrt(variance);
    if (acquisition === 'UCB') {
      return {
        acquisitionValue: mean + Math.sqrt(2) * standardDeviation,
        meanSensitivity: 1,
        varianceSensitivity: Math.sqrt(2) / (2 * standardDeviation)
      };
    }
    if (acquisition === 'PI') {
      const z = (mean - incumbent) / standardDeviation;
      const density = normalPdf(z);
      return {
        acquisitionValue: normalCdf(z),
        meanSensitivity: density / standardDeviation,
        varianceSensitivity: -z * density / (2 * variance)
      };
    }
    if (acquisition === 'EI') {
      const improvement = mean - incumbent;
      const z = improvement / standardDeviation;
      const density = normalPdf(z);
      const probability = normalCdf(z);
      return {
        acquisitionValue: Math.max(0, improvement * probability + standardDeviation * density),
        meanSensitivity: probability,
        varianceSensitivity: density / (2 * standardDeviation)
      };
    }
    throw new Error('Unsupported acquisition.');
  }

  /** Grid search for the next BO batch location under the chosen acquisition. */
  function argmaxAcquisition(predict, acquisition = 'EI', data = observations, steps = 401) {
    let bestInput = 0;
    let bestValue = -Infinity;
    for (let index = 0; index < steps; index++) {
      const input = index / (steps - 1);
      const value = evaluateAcquisition(predict(input), acquisition, data).acquisitionValue;
      if (value > bestValue) {
        bestValue = value;
        bestInput = input;
      }
    }
    return { input: bestInput, acquisitionValue: bestValue };
  }

  /** Compute analytic acquisition derivatives and both factors of the paper's 1D bound. */
  function evaluateAcquisition(predictiveState, acquisition = 'EI', data = observations) {
    const { mean, variance, meanDerivative, varianceDerivative } = predictiveState;
    const standardDeviation = Math.sqrt(variance);
    const bestObserved = Math.max(...data.map(item => item.output));
    const { acquisitionValue, meanSensitivity, varianceSensitivity } =
      acquisitionParameterDerivatives(mean, variance, acquisition, bestObserved);
    const scaledMeanGradient = meanDerivative / standardDeviation;
    const scaledVarianceGradient = varianceDerivative / (Math.sqrt(2) * variance);
    const scaledMeanSensitivity = standardDeviation * meanSensitivity;
    const scaledVarianceSensitivity = Math.sqrt(2) * variance * varianceSensitivity;
    const trace = scaledMeanGradient ** 2 + scaledVarianceGradient ** 2;
    const sensitivity = scaledMeanSensitivity ** 2 + scaledVarianceSensitivity ** 2;
    const gradient = meanSensitivity * meanDerivative + varianceSensitivity * varianceDerivative;
    return {
      ...predictiveState, acquisitionValue, meanSensitivity, varianceSensitivity,
      gradient, gradientNorm: Math.abs(gradient), trace, sensitivity,
      bound: Math.sqrt(trace * sensitivity),
      scaledMeanGradient, scaledVarianceGradient, scaledMeanSensitivity, scaledVarianceSensitivity
    };
  }

  /** Smooth 2D feature warp used for the non-lengthscale surrogate illustration. */
  function warpFeature2D(point) {
    const x1 = point[0] - 0.5, x2 = point[1] - 0.5;
    const radiusSquared = x1 * x1 + x2 * x2;
    const angle = 0.55;
    const c = Math.cos(angle), s = Math.sin(angle);
    const u1 = c * x1 - s * x2 + 0.35 * (x1 * x1 - x2 * x2);
    const u2 = s * x1 + c * x2 + 0.45 * x1 * x2;
    const u3 = 0.65 * Math.tanh(1.8 * radiusSquared);
    const sechSquared = 1 / Math.cosh(1.8 * radiusSquared) ** 2;
    const J = [
      [c + 0.70 * x1, -s - 0.70 * x2],
      [s + 0.45 * x2, c + 0.45 * x1],
      [0.65 * 3.6 * x1 * sechSquared, 0.65 * 3.6 * x2 * sechSquared]
    ];
    return { features: [u1, u2, u3], jacobian: J };
  }

  /** Depth-3 ReLU infinite-width BNN kernel, with analytic input derivatives.
   * Matches BoTorch InfiniteWidthBNNKernel's recurrence and acos clipping.
   * Weight and bias variances are fixed to log(2), its initial positive values.
   * These illustrative hyperparameters are not fitted paper-experiment values.
   */
  function ibnnKernel(point, reference) {
    const weightVariance = Math.log(2), biasVariance = Math.log(2);
    let leftVariance = weightVariance * dot(point, point) / 2 + biasVariance;
    let rightVariance = weightVariance * dot(reference, reference) / 2 + biasVariance;
    let leftDerivative = point.map(value => weightVariance * value);
    let covariance = weightVariance * dot(point, reference) / 2 + biasVariance;
    let derivative = reference.map(value => weightVariance * value / 2);
    for (let layer = 0; layer < 3; layer++) {
      const rootVariance = Math.sqrt(leftVariance * rightVariance);
      const rawCorrelation = covariance / rootVariance;
      const correlation = clamp(rawCorrelation, -1 + 1e-7, 1 - 1e-7);
      const angle = Math.acos(correlation);
      const angularTerm = Math.sin(angle) + (Math.PI - angle) * correlation;
      derivative = derivative.map((value, coordinate) => {
        const rootDerivative = rightVariance * leftDerivative[coordinate] / (2 * rootVariance);
        const correlationDerivative = rawCorrelation === correlation
          ? value / rootVariance - covariance * rootDerivative / (rootVariance * rootVariance) : 0;
        return weightVariance / (2 * Math.PI) * (rootDerivative * angularTerm + rootVariance * (Math.PI - angle) * correlationDerivative);
      });
      covariance = biasVariance + weightVariance * rootVariance * angularTerm / (2 * Math.PI);
      leftVariance = weightVariance * leftVariance / 2 + biasVariance;
      rightVariance = weightVariance * rightVariance / 2 + biasVariance;
      leftDerivative = leftDerivative.map(value => weightVariance * value / 2);
    }
    return { k: covariance, grad: derivative, priorVariance: leftVariance, priorGradient: leftDerivative };
  }

  /** Fit a 2D GP posterior on [0, 1]^2 (either ARD SE or non-lengthscale warped kernel). */
  function createPosterior2D(lengthscale1 = 0.18, lengthscale2 = 0.30, kernelType = 'SE') {
    if (!(lengthscale1 > 0) || !(lengthscale2 > 0)) throw new Error('Positive 2D lengthscales required.');
    const data = observations2D;
    const scale = 0.24;

    function kernelAndGradient(point, reference) {
      if (kernelType === 'IBNN') return ibnnKernel(point, reference);
      if (kernelType === 'WARPED') {
        const left = warpFeature2D(point), right = warpFeature2D(reference);
        const diff = left.features.map((v, i) => v - right.features[i]);
        const sqDist = diff.reduce((sum, d) => sum + d * d, 0);
        const k = Math.exp(-0.5 * sqDist / (scale * scale));
        const grad = [0, 1].map(coord => {
          let sum = 0;
          for (let f = 0; f < 3; f++) sum += diff[f] * left.jacobian[f][coord];
          return -k * sum / (scale * scale);
        });
        return { k, grad };
      }
      const d1 = (point[0] - reference[0]) / lengthscale1;
      const d2 = (point[1] - reference[1]) / lengthscale2;
      const k = Math.exp(-0.5 * (d1 * d1 + d2 * d2));
      return {
        k,
        grad: [
          -k * (point[0] - reference[0]) / (lengthscale1 * lengthscale1),
          -k * (point[1] - reference[1]) / (lengthscale2 * lengthscale2)
        ]
      };
    }

    const gram = data.map((left, r) => data.map((right, c) =>
      kernelAndGradient(left.input, right.input).k + (r === c ? 0.0025 : 0)));
    const factor = cholesky(gram);
    const weights = solveCovariance(factor, data.map(d => d.output));
    const bestObserved = Math.max(...data.map(d => d.output));

    function predict(x1, x2) {
      const point = [x1, x2];
      const evaluations = data.map(item => kernelAndGradient(point, item.input));
      const covariances = evaluations.map(e => e.k);
      const solved = solveCovariance(factor, covariances);
      const prior = kernelType === 'IBNN' ? ibnnKernel(point, point) : { priorVariance: 1, priorGradient: [0, 0] };
      const variance = Math.max(1e-9, prior.priorVariance - dot(covariances, solved));
      const mean = dot(covariances, weights);
      const meanGradient = [0, 1].map(coord =>
        evaluations.reduce((sum, e, idx) => sum + e.grad[coord] * weights[idx], 0));
      const varianceGradient = [0, 1].map(coord =>
        prior.priorGradient[coord] - 2 * evaluations.reduce((sum, e, idx) => sum + e.grad[coord] * solved[idx], 0));
      return { input: point, mean, variance, meanGradient, varianceGradient, bestObserved, kernelType, lengthscales: [lengthscale1, lengthscale2] };
    }
    predict.observations = data;
    predict.bestObserved = bestObserved;
    predict.lengthscales = [lengthscale1, lengthscale2];
    predict.kernelType = kernelType;
    return predict;
  }

  /** Hidden 2D objective used only for the Page 5 stationary-point explanation. */
  function trueStationaryFunction2D(x1, x2) {
    const peakLeft = 1.10 * Math.exp(-((x1 - 0.24) ** 2 / 0.035 + (x2 - 0.73) ** 2 / 0.055));
    const peakRight = 0.88 * Math.exp(-((x1 - 0.78) ** 2 / 0.045 + (x2 - 0.29) ** 2 / 0.035));
    const basin = 0.52 * Math.exp(-((x1 - 0.51) ** 2 / 0.075 + (x2 - 0.52) ** 2 / 0.045));
    const wave = 0.10 * Math.sin(2 * Math.PI * x1) * Math.cos(2 * Math.PI * x2);
    return peakLeft + peakRight - basin + wave;
  }

  const stationaryExampleObservations2D = Object.freeze([
    [0.10, 0.16], [0.16, 0.78], [0.31, 0.48], [0.43, 0.88],
    [0.51, 0.20], [0.65, 0.66], [0.81, 0.25], [0.90, 0.82]
  ].map(input => Object.freeze({ input: Object.freeze(input), output: trueStationaryFunction2D(input[0], input[1]) })));

  /** SE-GP posterior dedicated to the linked true/mean/variance/acquisition maps on Page 5. */
  function createStationaryExample2D(lengthscale1 = 0.22, lengthscale2 = 0.24) {
    const data = stationaryExampleObservations2D;
    const kernelAndGradient = (point, reference) => {
      const delta1 = point[0] - reference[0], delta2 = point[1] - reference[1];
      const k = Math.exp(-0.5 * ((delta1 / lengthscale1) ** 2 + (delta2 / lengthscale2) ** 2));
      return {
        k,
        grad: [-k * delta1 / lengthscale1 ** 2, -k * delta2 / lengthscale2 ** 2]
      };
    };
    const gram = data.map((left, row) => data.map((right, column) =>
      kernelAndGradient(left.input, right.input).k + (row === column ? 0.0025 : 0)));
    const factor = cholesky(gram);
    const weights = solveCovariance(factor, data.map(item => item.output));
    const bestObserved = Math.max(...data.map(item => item.output));

    function predict(x1, x2) {
      const input = [x1, x2];
      const evaluations = data.map(item => kernelAndGradient(input, item.input));
      const covariances = evaluations.map(item => item.k);
      const solved = solveCovariance(factor, covariances);
      const mean = dot(covariances, weights);
      const variance = Math.max(1e-9, 1 - dot(covariances, solved));
      const meanGradient = [0, 1].map(coordinate =>
        evaluations.reduce((sum, item, index) => sum + item.grad[coordinate] * weights[index], 0));
      const varianceGradient = [0, 1].map(coordinate =>
        -2 * evaluations.reduce((sum, item, index) => sum + item.grad[coordinate] * solved[index], 0));
      return { input, mean, variance, meanGradient, varianceGradient, bestObserved, lengthscales: [lengthscale1, lengthscale2] };
    }
    predict.observations = data;
    predict.bestObserved = bestObserved;
    return predict;
  }

  /** Locate interior roots of the analytic acquisition gradient with damped Newton iterations. */
  function findStationaryPoints2D(predict2D, acquisition = 'EI') {
    const evaluate = point => evaluatePoint2D(predict2D(point[0], point[1]), acquisition);
    const roots = [];
    const starts = [];
    for (let row = 1; row <= 9; row++) for (let column = 1; column <= 9; column++) {
      starts.push([column / 10, row / 10]);
    }
    for (const start of starts) {
      let point = start.slice();
      for (let iteration = 0; iteration < 28; iteration++) {
        const state = evaluate(point);
        if (state.gradientNorm < 1e-8) break;
        const step = 2e-4;
        const columns = [0, 1].map(coordinate => {
          const plus = point.slice(), minus = point.slice();
          plus[coordinate] = clamp(plus[coordinate] + step, 0.001, 0.999);
          minus[coordinate] = clamp(minus[coordinate] - step, 0.001, 0.999);
          const denominator = plus[coordinate] - minus[coordinate];
          const plusGradient = evaluate(plus).gradient, minusGradient = evaluate(minus).gradient;
          return [
            (plusGradient[0] - minusGradient[0]) / denominator,
            (plusGradient[1] - minusGradient[1]) / denominator
          ];
        });
        const h00 = columns[0][0], h01 = 0.5 * (columns[1][0] + columns[0][1]), h11 = columns[1][1];
        const determinant = h00 * h11 - h01 * h01;
        if (Math.abs(determinant) < 1e-10) break;
        let delta = [
          (-h11 * state.gradient[0] + h01 * state.gradient[1]) / determinant,
          (h01 * state.gradient[0] - h00 * state.gradient[1]) / determinant
        ];
        const norm = Math.hypot(...delta);
        if (norm > 0.12) delta = delta.map(value => value * 0.12 / norm);
        point = [
          clamp(point[0] + delta[0], 0.015, 0.985),
          clamp(point[1] + delta[1], 0.015, 0.985)
        ];
      }
      const state = evaluate(point);
      if (state.gradientNorm > 2e-5 || point.some(value => value <= 0.02 || value >= 0.98)) continue;
      if (roots.some(root => Math.hypot(root.input[0] - point[0], root.input[1] - point[1]) < 0.035)) continue;
      const meanNorm = norm2(state.meanGradient), varianceNorm = norm2(state.varianceGradient);
      const branch = meanNorm < 1e-4 && varianceNorm < 1e-4 ? 'flat' :
        state.collinearityCosine < -0.98 ? 'cancellation' : 'other';
      if (branch === 'other' || state.uNorm < 1e-6) continue;
      const hessianStep = 2e-4;
      const hessianColumns = [0, 1].map(coordinate => {
        const plus = point.slice(), minus = point.slice();
        plus[coordinate] += hessianStep;
        minus[coordinate] -= hessianStep;
        const plusGradient = evaluate(plus).gradient, minusGradient = evaluate(minus).gradient;
        return [
          (plusGradient[0] - minusGradient[0]) / (2 * hessianStep),
          (plusGradient[1] - minusGradient[1]) / (2 * hessianStep)
        ];
      });
      const h00 = hessianColumns[0][0];
      const h01 = 0.5 * (hessianColumns[1][0] + hessianColumns[0][1]);
      const h11 = hessianColumns[1][1];
      const halfTrace = 0.5 * (h00 + h11);
      const discriminant = Math.sqrt(Math.max(0, 0.25 * (h00 - h11) ** 2 + h01 ** 2));
      const hessianEigenvalues = [halfTrace - discriminant, halfTrace + discriminant];
      const tolerance = 1e-5;
      const stationaryType = hessianEigenvalues[1] < -tolerance ? 'maximum' :
        hessianEigenvalues[0] > tolerance ? 'minimum' : 'saddle';
      roots.push({ ...state, branch, stationaryType, hessianEigenvalues });
    }
    return roots.sort((left, right) => {
      const priority = branch => branch === 'cancellation' ? 0 : branch === 'flat' ? 1 : 2;
      return priority(left.branch) - priority(right.branch) || right.acquisitionValue - left.acquisitionValue;
    });
  }

  /** Eigendecomposition of a symmetric 2x2 matrix [[a, b], [b, d]], ordered min <= max. */
  function eigenSymmetric2x2(a, b, d) {
    const trace = a + d;
    const det = a * d - b * b;
    const disc = Math.sqrt(Math.max(0, 0.25 * (a - d) * (a - d) + b * b));
    const nuMin = Math.max(0, 0.5 * trace - disc);
    const nuMax = Math.max(0, 0.5 * trace + disc);
    let vmax;
    if (Math.abs(b) > 1e-12) {
      vmax = [b, nuMax - a];
    } else if (a >= d) {
      vmax = [1, 0];
    } else {
      vmax = [0, 1];
    }
    const n = Math.hypot(vmax[0], vmax[1]) || 1;
    vmax = [vmax[0] / n, vmax[1] / n];
    const vmin = [-vmax[1], vmax[0]];
    return { eigenvalues: [nuMin, nuMax], eigenvectors: [vmin, vmax], trace, det: Math.max(0, det) };
  }

  /** Evaluate 2D pullback Fisher tensor, companion matrix M, spectral bracket, and gradients. */
  function evaluatePoint2D(predictiveState, acquisition = 'EI') {
    const { mean, variance, meanGradient, varianceGradient, bestObserved = 0.96 } = predictiveState;
    const std = Math.sqrt(variance);
    const { acquisitionValue, meanSensitivity, varianceSensitivity } =
      acquisitionParameterDerivatives(mean, variance, acquisition, bestObserved);

    const aMu = [meanGradient[0] / std, meanGradient[1] / std];
    const aSigma = [varianceGradient[0] / (Math.SQRT2 * variance), varianceGradient[1] / (Math.SQRT2 * variance)];
    const A = [aMu, aSigma];
    const u = [std * meanSensitivity, Math.SQRT2 * variance * varianceSensitivity];
    const uNormSquared = u[0] * u[0] + u[1] * u[1];
    const uNorm = Math.sqrt(uNormSquared);

    const G00 = aMu[0] * aMu[0] + aSigma[0] * aSigma[0];
    const G01 = aMu[0] * aMu[1] + aSigma[0] * aSigma[1];
    const G11 = aMu[1] * aMu[1] + aSigma[1] * aSigma[1];
    const G = [[G00, G01], [G01, G11]];

    const M00 = aMu[0] * aMu[0] + aMu[1] * aMu[1];
    const M01 = aMu[0] * aSigma[0] + aMu[1] * aSigma[1];
    const M11 = aSigma[0] * aSigma[0] + aSigma[1] * aSigma[1];
    const M = [[M00, M01], [M01, M11]];

    const eigG = eigenSymmetric2x2(G00, G01, G11);
    const eigM = eigenSymmetric2x2(M00, M01, M11);
    const [nuMin, nuMax] = eigM.eigenvalues;
    const trace = eigM.trace;

    const gradient = [
      aMu[0] * u[0] + aSigma[0] * u[1],
      aMu[1] * u[0] + aSigma[1] * u[1]
    ];
    const gradientNormSquared = gradient[0] * gradient[0] + gradient[1] * gradient[1];
    const gradientNorm = Math.sqrt(gradientNormSquared);
    const sensitivity = uNormSquared;

    const spectralLowerSquared = nuMin * uNormSquared;
    const spectralUpperSquared = nuMax * uNormSquared;
    const boundSquared = trace * sensitivity;
    const bound = Math.sqrt(boundSquared);

    const muGradNorm = norm2(meanGradient);
    const sigmaGradNorm = norm2(varianceGradient);
    const denom = muGradNorm * sigmaGradNorm;
    const collinearityCosine = denom > 1e-12 ? clamp((meanGradient[0] * varianceGradient[0] + meanGradient[1] * varianceGradient[1]) / denom, -1, 1) : 0;
    const collinearitySine = Math.sqrt(Math.max(0, 1 - collinearityCosine * collinearityCosine));

    const damping = 0.5 * trace + 1e-12;
    const regG00 = G00 + damping, regG11 = G11 + damping;
    const regDet = regG00 * regG11 - G01 * G01;
    const naturalGradient = [
      (regG11 * gradient[0] - G01 * gradient[1]) / regDet,
      (-G01 * gradient[0] + regG00 * gradient[1]) / regDet
    ];

    const stationaryRatioC = Math.abs(meanSensitivity) > 1e-12 ? -varianceSensitivity / meanSensitivity : 0;

    return {
      ...predictiveState,
      acquisitionValue, meanSensitivity, varianceSensitivity,
      A, u, uNorm, uNormSquared, sensitivity,
      G, M, trace, det: eigM.det,
      eigenvalues: [nuMin, nuMax],
      eigenvectorsG: eigG.eigenvectors,
      eigenvectorsM: eigM.eigenvectors,
      gradient, gradientNorm, gradientNormSquared,
      spectralLower: Math.sqrt(spectralLowerSquared),
      spectralUpper: Math.sqrt(spectralUpperSquared),
      spectralLowerSquared, spectralUpperSquared,
      bound, boundSquared,
      traceToSpectralRatio: nuMax > 1e-12 ? Math.sqrt(trace / nuMax) : 1,
      collinearityCosine, collinearitySine,
      damping, naturalGradient, stationaryRatioC
    };
  }

  function clamp(v, min, max) {
    return Math.min(max, Math.max(min, v));
  }

  /** Rotate a test vector u(angle) of norm ||u||_2 in the 2x2 companion-matrix plane. */
  function evaluateRayleighDirection(point2D, angleRadians) {
    const radius = point2D.uNorm;
    const testU = [radius * Math.cos(angleRadians), radius * Math.sin(angleRadians)];
    const inputGrad = [
      point2D.A[0][0] * testU[0] + point2D.A[1][0] * testU[1],
      point2D.A[0][1] * testU[0] + point2D.A[1][1] * testU[1]
    ];
    const squaredNorm = testU[0] * (point2D.M[0][0] * testU[0] + point2D.M[0][1] * testU[1]) +
      testU[1] * (point2D.M[1][0] * testU[0] + point2D.M[1][1] * testU[1]);
    return {
      angleRadians,
      vector: testU,
      inputGradient: inputGrad,
      squaredNorm: Math.max(0, squaredNorm),
      norm: Math.sqrt(Math.max(0, squaredNorm))
    };
  }

  /** Three prepared 2D states comparing prior collapse, singular non-stationary, and stationary cancellation. */
  function stationaryPresets(predict2D, acquisition = 'EI') {
    // 1. Prior collapse: corner far from observations where posterior gradients are near zero.
    const flatRaw = predict2D(0.98, 0.03);
    const flat = evaluatePoint2D(flatRaw, acquisition);

    // 2. Singular companion matrix (collinear gradients, nu_min = 0) with u outside null(M): nonzero gradient.
    const baseMid = predict2D(0.54, 0.48);
    const direction = [0.82, 0.57];
    const singularRaw = {
      ...baseMid,
      input: [0.54, 0.48],
      meanGradient: [1.15 * direction[0], 1.15 * direction[1]],
      varianceGradient: [0.90 * direction[0], 0.90 * direction[1]]
    };
    const singularNonStationary = evaluatePoint2D(singularRaw, acquisition);

    // 3. Interior stationary point (cancellation): nabla mu = c * nabla Sigma so A^T u = 0 with tr(G_t) > 0.
    const baseOpt = predict2D(0.41, 0.47);
    const bestObserved = baseOpt.bestObserved || 0.96;
    const derivs = acquisitionParameterDerivatives(baseOpt.mean, baseOpt.variance, acquisition, bestObserved);
    const cRatio = -derivs.varianceSensitivity / derivs.meanSensitivity;
    const sigmaGrad = [-1.25 * direction[0], -1.25 * direction[1]];
    const muGrad = [cRatio * sigmaGrad[0], cRatio * sigmaGrad[1]];
    const cancellationRaw = {
      ...baseOpt,
      input: [0.41, 0.47],
      meanGradient: muGrad,
      varianceGradient: sigmaGrad
    };
    const stationaryCancellation = evaluatePoint2D(cancellationRaw, acquisition);

    return { flat, singularNonStationary, stationaryCancellation };
  }

  /** Compare exact univariate Gaussian KL divergence with the second-order pullback Fisher quadratic form. */
  function evaluateLocalKL2D(predict2D, centerInput, deltaVector) {
    const center = evaluatePoint2D(predict2D(centerInput[0], centerInput[1]), 'EI');
    const targetInput = [
      clamp(centerInput[0] + deltaVector[0], 0, 1),
      clamp(centerInput[1] + deltaVector[1], 0, 1)
    ];
    const actualDelta = [targetInput[0] - centerInput[0], targetInput[1] - centerInput[1]];
    const target = predict2D(targetInput[0], targetInput[1]);
    const exactKL = 0.5 * (
      Math.log(target.variance / center.variance) +
      (center.variance + (center.mean - target.mean) ** 2) / target.variance - 1
    );
    const quadraticKL = 0.5 * (
      actualDelta[0] * (center.G[0][0] * actualDelta[0] + center.G[0][1] * actualDelta[1]) +
      actualDelta[1] * (center.G[1][0] * actualDelta[0] + center.G[1][1] * actualDelta[1])
    );
    return {
      center,
      target,
      delta: actualDelta,
      displacementNorm: norm2(actualDelta),
      exactKL: Math.max(0, exactKL),
      quadraticKL: Math.max(0, quadraticKL)
    };
  }

  /** Deterministic PRNG for reproducible MC score samples and high-dimensional synthetic GP states. */
  function createRng(seed = 20261029) {
    let state = seed >>> 0;
    return function nextUniform() {
      state = (1664525 * state + 1013904223) >>> 0;
      return (state + 0.5) / 4294967296;
    };
  }

  function sampleStandardNormal(rng) {
    const u1 = Math.max(1e-12, rng());
    const u2 = rng();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }

  /** Compute FITR diagonal weights, MC score estimate (Eq. 11), volume normalization, and TuRBO comparison. */
  function computeFitrRegion2D(point2D, lengthscale1 = 0.18, lengthscale2 = 0.30, trustRegionLength = 0.28, sampleCount = 128) {
    const exactDiag = [point2D.G[0][0], point2D.G[1][1]];
    const rng = createRng(Math.round((point2D.input[0] * 1000 + point2D.input[1] * 9973 + sampleCount) * 100));
    const std = Math.sqrt(point2D.variance);
    const mcDiag = [0, 0];

    for (let s = 0; s < sampleCount; s++) {
      const z = sampleStandardNormal(rng);
      const ySample = point2D.mean + std * z;
      const dLogP_dMu = (ySample - point2D.mean) / point2D.variance;
      const dLogP_dSigma = ((ySample - point2D.mean) ** 2) / (2 * point2D.variance ** 2) - 1 / (2 * point2D.variance);
      for (let j = 0; j < 2; j++) {
        const scoreCoord = dLogP_dMu * point2D.meanGradient[j] + dLogP_dSigma * point2D.varianceGradient[j];
        mcDiag[j] += (scoreCoord * scoreCoord) / sampleCount;
      }
    }

    const epsilonExact = 0.5 * (exactDiag[0] + exactDiag[1]) + 1e-12;
    const rawFitr = exactDiag.map(g => 1 / Math.sqrt(g + epsilonExact));
    const geomMeanFitr = Math.sqrt(rawFitr[0] * rawFitr[1]);
    const fitrWeights = rawFitr.map(w => w / geomMeanFitr);

    const epsilonMC = 0.5 * (mcDiag[0] + mcDiag[1]) + 1e-12;
    const rawFitrMC = mcDiag.map(g => 1 / Math.sqrt(g + epsilonMC));
    const geomMeanMC = Math.sqrt(rawFitrMC[0] * rawFitrMC[1]);
    const fitrWeightsMC = rawFitrMC.map(w => w / geomMeanMC);

    const geomMeanTurbo = Math.sqrt(lengthscale1 * lengthscale2);
    const turboWeights = [lengthscale1 / geomMeanTurbo, lengthscale2 / geomMeanTurbo];

    const makeBox = weights => [0, 1].map(j => [
      clamp(point2D.input[j] - 0.5 * weights[j] * trustRegionLength, 0, 1),
      clamp(point2D.input[j] + 0.5 * weights[j] * trustRegionLength, 0, 1)
    ]);

    const eigRegG = eigenSymmetric2x2(
      point2D.G[0][0] + epsilonExact,
      point2D.G[0][1],
      point2D.G[1][1] + epsilonExact
    );
    const rawRadii = eigRegG.eigenvalues.map(ev => 1 / Math.sqrt(ev));
    const geomMeanRadii = Math.sqrt(rawRadii[0] * rawRadii[1]);
    const ellipseSemiAxes = rawRadii.map(r => 0.5 * trustRegionLength * (r / geomMeanRadii));

    return {
      center: point2D.input,
      trustRegionLength,
      exactDiag,
      mcDiag,
      epsilonExact,
      fitrWeights,
      fitrWeightsMC,
      turboWeights,
      fitrBox: makeBox(fitrWeights),
      turboBox: makeBox(turboWeights),
      anisotropyRatio: Math.max(fitrWeights[0], fitrWeights[1]) / Math.min(fitrWeights[0], fitrWeights[1]),
      ellipseSemiAxes,
      ellipseAxesVectors: eigRegG.eigenvectors
    };
  }

  /**
   * Representative high-dimensional SE-kernel geometry for the paper's unifying lens.
   *
   * Global proposals use the root-mean-square distance between two independent
   * uniform points, sqrt(D/6). A RAASP proposal perturbs m coordinates by
   * Uniform[-r, r], giving RMS distance r sqrt(m/3), before boundary clipping.
   * The kernel-gradient energy is ||grad k||^2 = (k d / ell^2)^2. It is a
   * transparent proxy for the derivative terms entering the pullback trace,
   * not the trace of a fitted posterior.
   */
  function computeHdboLens(
    dimension = 64,
    activeCoordinates = 20,
    perturbRadius = 0.25,
    referenceLengthscale = 0.35,
    referenceDimension = 2
  ) {
    const D = Math.max(2, Math.round(dimension));
    const m = Math.max(1, Math.min(D, Math.round(activeCoordinates)));
    if (!(perturbRadius > 0) || !(referenceLengthscale > 0) || !(referenceDimension > 0)) {
      throw new Error('Positive RAASP radius, lengthscale, and reference dimension are required.');
    }

    const globalDistance = Math.sqrt(D / 6);
    const raaspDistance = perturbRadius * Math.sqrt(m / 3);
    const scaledLengthscale = referenceLengthscale * Math.sqrt(D / referenceDimension);

    const summarize = (distance, lengthscale) => {
      const logKernel = -(distance * distance) / (2 * lengthscale * lengthscale);
      const logGradientEnergy = 2 * (
        logKernel + Math.log(Math.max(distance, 1e-300)) - 2 * Math.log(lengthscale)
      );
      return {
        distance,
        lengthscale,
        normalizedDistance: distance / lengthscale,
        correlation: Math.exp(Math.max(-745, logKernel)),
        gradientEnergy: Math.exp(Math.max(-745, logGradientEnergy)),
        log10GradientEnergy: logGradientEnergy / Math.LN10
      };
    };

    return {
      dimension: D,
      activeCoordinates: m,
      perturbRadius,
      referenceLengthscale,
      globalDistance,
      raaspDistance,
      scaledLengthscale,
      globalFixed: summarize(globalDistance, referenceLengthscale),
      globalScaled: summarize(globalDistance, scaledLengthscale),
      raaspFixed: summarize(raaspDistance, referenceLengthscale)
    };
  }

  /** Simulate a deterministic D_x-dimensional GP to show distance concentration, lengthscale scaling, and RAASP. */
  function simulateHighDimScaling(dimension = 32, exponentP = 0.0, acquisition = 'EI', baseLengthscale = 0.25) {
    const Dx = Math.max(2, Math.round(dimension));
    const numTrain = 16;
    const numQueries = 24;
    const rng = createRng(1337 + Dx * 17);
    const lengthscale = baseLengthscale * (Dx ** exponentP);

    const trainInputs = Array.from({ length: numTrain }, () =>
      Array.from({ length: Dx }, () => rng()));
    const trainOutputs = trainInputs.map((x, idx) => {
      const projection = x.reduce((sum, v, j) => sum + Math.sin(3.1 * v + (j % 5) * 0.4), 0) / Math.sqrt(Dx);
      return 0.5 + 0.35 * Math.tanh(projection) + (idx === 3 ? 0.45 : 0);
    });
    let bestIndex = 0;
    for (let i = 1; i < numTrain; i++) if (trainOutputs[i] > trainOutputs[bestIndex]) bestIndex = i;
    const bestInput = trainInputs[bestIndex];
    const bestObserved = trainOutputs[bestIndex];

    const sqDist = (a, b) => {
      let s = 0;
      for (let j = 0; j < Dx; j++) {
        const d = a[j] - b[j];
        s += d * d;
      }
      return s;
    };

    const gram = trainInputs.map((a, r) => trainInputs.map((b, c) =>
      Math.exp(-0.5 * sqDist(a, b) / (lengthscale * lengthscale)) + (r === c ? 0.0025 : 0)));
    const factor = cholesky(gram);
    const weights = solveCovariance(factor, trainOutputs);

    function evaluateQuery(queryPoint) {
      const dists = trainInputs.map(t => Math.sqrt(sqDist(queryPoint, t)));
      const meanNormalizedDist = dists.reduce((s, d) => s + d / Math.sqrt(Dx), 0) / numTrain;
      const covs = dists.map(d => Math.exp(-0.5 * (d * d) / (lengthscale * lengthscale)));
      const solved = solveCovariance(factor, covs);
      const mean = dot(covs, weights);
      const variance = Math.max(1e-9, 1 - dot(covs, solved));
      const std = Math.sqrt(variance);

      const meanGrad = new Array(Dx).fill(0);
      const varGrad = new Array(Dx).fill(0);
      for (let n = 0; n < numTrain; n++) {
        const coeff = covs[n] / (lengthscale * lengthscale);
        const w = weights[n], s = solved[n];
        const trainPt = trainInputs[n];
        for (let j = 0; j < Dx; j++) {
          const diff = trainPt[j] - queryPoint[j];
          meanGrad[j] += coeff * diff * w;
          varGrad[j] += -2 * coeff * diff * s;
        }
      }
      const meanGradSq = meanGrad.reduce((s, g) => s + g * g, 0);
      const varGradSq = varGrad.reduce((s, g) => s + g * g, 0);
      const trace = meanGradSq / variance + varGradSq / (2 * variance * variance);

      const { meanSensitivity, varianceSensitivity } =
        acquisitionParameterDerivatives(mean, variance, acquisition, bestObserved);
      let gradSq = 0;
      for (let j = 0; j < Dx; j++) {
        const g = meanSensitivity * meanGrad[j] + varianceSensitivity * varGrad[j];
        gradSq += g * g;
      }
      const gradientNorm = Math.sqrt(gradSq);
      const sensitivity = variance * (meanSensitivity ** 2) + 2 * (variance ** 2) * (varianceSensitivity ** 2);
      const bound = Math.sqrt(trace * sensitivity);
      return {
        meanNormalizedDist,
        maxKernel: Math.max(...covs),
        trace,
        gradientNorm,
        bound,
        sensitivity
      };
    }

    const uniformSamples = Array.from({ length: numQueries }, () => {
      const pt = Array.from({ length: Dx }, () => rng());
      return evaluateQuery(pt);
    });

    // RAASP-style local axis-aligned perturbations around x_best (active subset of coordinates).
    const activeCoords = Math.max(1, Math.min(Dx, Math.round(Math.sqrt(Dx))));
    const raaspSamples = Array.from({ length: numQueries }, (_, qIdx) => {
      const pt = bestInput.slice();
      for (let a = 0; a < activeCoords; a++) {
        const coord = (qIdx * 7 + a * 13) % Dx;
        const delta = (rng() - 0.5) * 0.18;
        pt[coord] = clamp(pt[coord] + delta, 0, 1);
      }
      return evaluateQuery(pt);
    });

    const summarize = list => {
      const avg = key => list.reduce((s, item) => s + item[key], 0) / list.length;
      return {
        meanNormalizedDist: avg('meanNormalizedDist'),
        maxKernel: avg('maxKernel'),
        trace: avg('trace'),
        gradientNorm: avg('gradientNorm'),
        bound: avg('bound'),
        sensitivity: avg('sensitivity'),
        samples: list
      };
    };

    return {
      dimension: Dx,
      exponentP,
      lengthscale,
      asymptoticNormalizedDist: 1 / Math.sqrt(6),
      uniform: summarize(uniformSamples),
      raasp: summarize(raaspSamples)
    };
  }

  /** Exact trace of a one-observation SE GP, not a kernel-gradient proxy.
   * The observation is at the cube center with output 1. Signal variance is 1
   * and observation-noise variance is 0.1. Both posterior terms are included.
   */
  function singleObservationTrace(squaredDistance, lengthscale) {
    const covariance = Math.exp(-squaredDistance / (2 * lengthscale ** 2));
    const variance = 1 - covariance ** 2 / 1.1;
    const kernelGradientSquared = covariance ** 2 * squaredDistance / lengthscale ** 4;
    const meanGradientSquared = kernelGradientSquared / 1.1 ** 2;
    const varianceGradientSquared = 4 * covariance ** 2 * kernelGradientSquared / 1.1 ** 2;
    return meanGradientSquared / variance + varianceGradientSquared / (2 * variance ** 2);
  }

  /** Matched trace illustrations across dimensions with a known Gaussian posterior.
   * Global queries are uniform in the cube. Local queries change min(20,D)
   * distinct coordinates around the observation by Uniform[-0.25,0.25].
   * Their coordinate prefixes and random seed are fixed; queries are paired
   * across fixed (p=0), subcritical (p=0.25), critical (p=0.5), and
   * supercritical (p=0.75) lengthscale rules. Mean traces use 64 queries each.
   */
  function computeTraceComparison() {
    const random = createRng(1337);
    const globalOffsets = Array.from({ length: 64 }, () => Array.from({ length: 256 }, () => random() - 0.5));
    const localOffsets = Array.from({ length: 64 }, () => Array.from({ length: 20 }, () => 0.5 * random() - 0.25));
    return [2, 4, 8, 16, 32, 64, 128, 256].map(dimension => {
      const globalDistances = globalOffsets.map(row => row.slice(0, dimension).reduce((total, value) => total + value * value, 0));
      const localDistances = localOffsets.map(row => row.slice(0, Math.min(20, dimension)).reduce((total, value) => total + value * value, 0));
      const meanTrace = (distances, lengthscale) => distances.reduce((sum, distance) => sum + singleObservationTrace(distance, lengthscale), 0) / distances.length;
      return { dimension, global: meanTrace(globalDistances, 0.35), local: meanTrace(localDistances, 0.35),
        subcritical: meanTrace(globalDistances, 0.35 * dimension ** 0.25),
        critical: meanTrace(globalDistances, 0.35 * Math.sqrt(dimension)),
        supercritical: meanTrace(globalDistances, 0.35 * dimension ** 0.75) };
    });
  }

  const api = {
    ibnnKernel,
    computeTraceComparison, singleObservationTrace,
    observations,
    observations2D,
    benchmarkSummary,
    trueProcessResponse,
    boLoopInitialObservations,
    normalPdf,
    normalCdf,
    createPosterior,
    createPosteriorFromObservations,
    evaluateAcquisition,
    argmaxAcquisition,
    createPosterior2D,
    trueStationaryFunction2D,
    stationaryExampleObservations2D,
    createStationaryExample2D,
    findStationaryPoints2D,
    evaluatePoint2D,
    evaluateRayleighDirection,
    stationaryPresets,
    evaluateLocalKL2D,
    computeFitrRegion2D,
    computeHdboLens,
    simulateHighDimScaling
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.PaperModel = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
