/* IBNN endpoints extracted from neurips_viz/fig_results/results_ibnn.txt.
 * Reproduces the figure script: shared shortest trajectory, negated logged scores,
 * sample standard errors. These are summaries of the figure runs, not Table 2.
 */
(function () {
  'use strict';
  const ibnnResults = [{"problem": "Hopper (33D)", "baseline": {"mean": -1016.6374233444673, "se": 12.610446178126718, "trials": 5}, "fitr": {"mean": -1029.5442355107036, "se": 5.9527207625340095, "trials": 5}, "evaluations": 300.0, "improvement": 1.2695590256530571}, {"problem": "HPA102-1 (32D)", "baseline": {"mean": 235.58955110816447, "se": 2.9965913459730946, "trials": 3}, "fitr": {"mean": 237.19757771929793, "se": 1.0405948924215105, "trials": 3}, "evaluations": 300.0, "improvement": -0.6825542998701044}, {"problem": "Lunarlander (12D)", "baseline": {"mean": -248.18900168329017, "se": 36.95486963430221, "trials": 3}, "fitr": {"mean": -281.01955697870164, "se": 22.214214598546505, "trials": 3}, "evaluations": 300.0, "improvement": 13.228045994280599}, {"problem": "Half Cheetah (102D)", "baseline": {"mean": 295.6082173286273, "se": 215.72298579223417, "trials": 5}, "fitr": {"mean": 370.24241180920575, "se": 274.2754156197491, "trials": 5}, "evaluations": 500.0, "improvement": -25.247672461556682}, {"problem": "HPA101-2 (108D)", "baseline": {"mean": 29.644394307847072, "se": 0.7459917457095632, "trials": 5}, "fitr": {"mean": 30.6935480483874, "se": 0.7693484493620433, "trials": 5}, "evaluations": 500.0, "improvement": -3.5391302977730543}, {"problem": "Robot Pushing (14D)", "baseline": {"mean": -5.123725232190047, "se": 0.6603475514311001, "trials": 5}, "fitr": {"mean": -5.1541454380123035, "se": 0.482335382600846, "trials": 5}, "evaluations": 257.0, "improvement": 0.5937126688827901}];
  let originalMarkup, currentKernel;
  /** Switch displayed benchmark data without rebuilding the table on animation frames. */
  function render(kernel) {
    const section = document.getElementById('fitr-results');
    if (originalMarkup === undefined) originalMarkup = section.innerHTML;
    if (currentKernel === kernel) return;
    currentKernel = kernel;
    if (kernel !== 'IBNN') { section.innerHTML = originalMarkup; return; }
    section.innerHTML = '<h3>Results from the paper: IBNN kernel</h3><p>Depth-3 IBNN GP. Final best observed value, mean &plusmn; standard error; lower is better. Positive improvement favors FITR over global BO without a trust region.</p><div class="fitr-table-scroll"><table><thead><tr><th>Problem</th><th>Without FITR (global BO)</th><th>FITR-REI</th><th>Improvement (%)</th></tr></thead><tbody></tbody></table></div><p class="result-summary"></p><p class="plot-footnote">Source: the runs underlying the paper’s IBNN figure. Final values use the common endpoint of each figure panel. Percentages are relative objective changes, not regret reduction or significance tests. HPA102-1 and Lunarlander have 3 trials per method; the other tasks have 5. Robot Pushing uses the common endpoint of 257 evaluations.</p><a href="https://arxiv.org/pdf/2609.31107" target="_blank" rel="noopener">Read the paper and experimental details</a>';
    const body = section.querySelector('tbody');
    for (const result of ibnnResults) {
      const row = document.createElement('tr');
      if (result.improvement > 0) row.className = 'fitr-better';
      const format = stats => stats.mean.toFixed(2) + ' \u00b1 ' + stats.se.toFixed(2);
      for (const value of [result.problem, format(result.baseline), format(result.fitr), (result.improvement > 0 ? '+' : '') + result.improvement.toFixed(2)]) {
        const cell = document.createElement('td'); cell.textContent = value; row.append(cell);
      }
      body.append(row);
    }
    section.querySelector('.result-summary').textContent = 'FITR has a lower mean on ' + ibnnResults.filter(row => row.improvement > 0).length + ' of ' + ibnnResults.length + ' tasks. This comparison tests transfer to a kernel without coordinate lengthscales; it is not a TuRBO comparison.';
  }
  window.PaperResults = { render };
})();
