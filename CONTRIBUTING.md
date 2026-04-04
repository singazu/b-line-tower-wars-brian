# Contributing

## Branching

- Do not commit directly to `main`.
- Create a feature branch per task:
  - `feature/<short-topic>`
  - `fix/<short-topic>`
  - `balance/<short-topic>`

## Pull Requests

- Keep PRs focused (single feature/fix).
- Include a short test note:
  - what was changed
  - how to verify locally
- For gameplay tuning, update:
  - `tower-balance-sheet.csv`
  - `creep-balance-sheet.csv`

## Local Run

```powershell
.\preview.ps1
```

Open:

`http://127.0.0.1:5500`

