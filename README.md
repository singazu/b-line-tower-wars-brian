# B-Line Tower Wars

Browser-playable prototype inspired by Line Tower Wars mods from Warcraft 3.

## Project Structure

- `index.html` - App shell and UI layout.
- `style.css` - Visual styling and responsive layout.
- `script.js` - Core game loop, combat logic, AI, effects, and UI interactions.
- `assets/` - Tower/creep/UI sprites.
- `tower-balance-sheet.csv` - Editable tower balance table.
- `creep-balance-sheet.csv` - Editable creep balance table.
- `.github/workflows/deploy-pages.yml` - Auto-deploy to GitHub Pages on push to `main`.

## Local Preview (Windows)

1. Open PowerShell in this folder:
   - `C:\Users\bmaga\OneDrive\Documents\Playground\simple-clicker-game`
2. Run:

```powershell
.\preview.ps1
```

3. Open in browser:
   - `http://127.0.0.1:5500`

If port 5500 is taken:

```powershell
.\preview.ps1 -Port 5510
```

## GitHub Collaboration Setup (GitHub Desktop)

Use this if you want your existing GitHub account and branch-based team collaboration.

1. Open GitHub Desktop.
2. Go to `File` -> `New repository...`.
3. Set:
   - Name: `b-line-tower-wars`
   - Local path: `C:\Users\bmaga\OneDrive\Documents\Playground`
4. Click `Create repository`.
5. Copy all files from this folder into the new repo folder (or move this folder to match that repo path).
6. In GitHub Desktop:
   - Write commit message (for example: `Initial game prototype`)
   - Commit to `main`
   - Click `Publish repository`
   - Keep it Public if you want anyone to play from web.

## Public Browser Deployment (GitHub Pages)

This repo already includes a Pages deployment workflow.

After publishing:

1. Open the repo on GitHub.
2. Go to `Settings` -> `Pages`.
3. Under `Build and deployment`, set `Source` to `GitHub Actions`.
4. Push/merge to `main`.
5. Wait for the `Deploy Static Site to GitHub Pages` workflow to pass.
6. Your live URL will be:
   - `https://<your-github-username>.github.io/<repo-name>/`

## Team Workflow Recommendation

- Protect `main` branch.
- Require pull requests for merges.
- Use short feature branches:
  - `feature/ai-balance`
  - `feature/pvp-netcode`
  - `art/new-creep-sprites`
- Keep gameplay tuning in the CSV sheets so balance reviews are easy.
