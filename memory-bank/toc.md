# Memory Bank — brew-browser

Project-scoped memory bank. **All agents working on this project read from and write to this directory.** Source of truth for design decisions, architectural choices, current state, and inter-agent insights.

## File map

| File | Owner | Read by | Write when |
|------|-------|---------|------------|
| `toc.md` | Lead | all | new files added |
| `projectbrief.md` | Lead | all | mission shifts |
| `techContext.md` | Lead | all | new tech adopted |
| `decisions.md` | all | all | architectural decision made |
| `activeContext.md` | Lead | all | every wave start/end |
| `progress.md` | Lead | all | phase completes |
| `systemPatterns.md` | Backend Architect + Frontend Developer | all | new pattern emerges |
| `designSystem.md` | UI Designer | Frontend Developer, Whimsy Injector | design decisions |
| `uxArchitecture.md` | UX Architect | Frontend Developer, UI Designer | flow/IA decisions |
| `backendApi.md` | Backend Architect | Frontend Developer, API Tester | API surface changes |
| `frontendComponents.md` | Frontend Developer | UX Architect, Code Reviewer | component built |
| `codeReview.md` | Code Reviewer | Lead, Backend Architect, Frontend Developer | review pass done |
| `realityCheck.md` | Reality Checker | Lead | production gate evaluated |
| `apiTests.md` | API Tester | Backend Architect | tests defined/run |
| `agentLog.md` | all | Lead | each agent run (append-only stamp) |
| `tasks/YYYY-MM/*.md` | Lead | all | per-task records |

## Agent collaboration protocol

1. **Read first.** Before writing, every agent reads at minimum: `projectbrief.md`, `techContext.md`, `activeContext.md`, `decisions.md`, and any files in their "Read by" column above.
2. **Write only your owned files.** Agents do not modify each other's spec files. To request a change, append a note to the file with `// REQUEST FROM <agent>:` and the owning agent integrates.
3. **Stamp every run.** Append a one-line entry to `agentLog.md` on completion: `2026-05-23T15:42Z | UI Designer | designSystem.md updated | summary`
4. **Decisions go in `decisions.md`.** Any architectural choice (library pick, pattern adopted, tradeoff resolved) gets an ADR entry. Same format as the parent local-inference memory bank.
5. **No code generation without spec.** Implementation agents (Backend Architect, Frontend Developer) only write code that traces back to a spec file. If the spec is missing, write the spec first.
