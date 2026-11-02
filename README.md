# Information Geometry of Bayesian Optimization

Interactive project website for the NeurIPS paper **Bayesian Optimization with Fisher Information Geometry: Gradient Bounds and Trust-Region Methods**.

- Shared introduction: `site/index.html`
- FITR experience: `site/fitr/index.html`
- Paper: https://arxiv.org/pdf/2609.31107
- Contact: https://www.linkedin.com/in/saksham4k/

The HTML, CSS, and JavaScript sources are in `site/`. The website uses local math-rendering assets and does not need a package installation or build service. Open `site/index.html` locally, or serve `site/` with a static web server.

Pushes to `main` deploy only `site/` to GitHub Pages through `.github/workflows/pages.yml`. The workflow checks that unpublished workspace and research directories are absent. This repository contains only the public website export, not the research repository or its history.

The Further ideas card is a non-clickable placeholder. KaTeX is distributed under the MIT license; its license is included in `site/katex/LICENSE`.
