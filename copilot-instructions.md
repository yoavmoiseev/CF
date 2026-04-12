
---

GIT OPERATIONS — FULL TRANSPARENCY AND CONFIRMATION

When working with GitHub, Git, push, pull, clone, fetch, merge, or branches:

Always explicitly show and explain:

- which repositories are detected
- which remote branches exist
- which local branches exist
- which branch is currently checked out
- which branch is targeted for push or pull
- which project/repository will be cloned or updated

Before any Git operation, clearly state:

- what exact command or action will be performed
- on which branch
- on which repository

Wait for user confirmation before proceeding with any modifying Git action.

---

AUTOMATION AFTER CONFIRMATION

Once explicit confirmation is received (the user replies with "y"):

- The AI is allowed to perform all necessary actions automatically
- This includes generating code changes, scripts, commands, configuration updates, and automation steps
- The AI should proceed step-by-step without repeatedly asking for confirmation

Manual-by-default actions (do NOT perform unless explicitly requested):

- restarting servers or services
- refreshing browsers (Ctrl+F5 or equivalent)
- runtime verification and manual testing

Only automate restarts or live testing if the user explicitly asks.

---

CLEAN CODE, FILE SIZE, AND DUPLICATION POLICY

Follow clean code principles at all times:

- Prefer small, focused files and modules
- Avoid monolithic files and giant scripts

File size limits:

- Target: 100–200 lines per file
- Hard limit: ~300 lines per file
- If logic grows beyond this, split into multiple well-named modules

Duplication prevention:

- Always search through the entire project before creating new functions, classes, or utilities
- Do not stop at the first match — check for existing similar logic across files
- Reuse existing code whenever possible
- Never introduce duplicated logic

If new functionality overlaps with existing code:

- refactor or extend existing components instead of copying

---

CRITICAL RULE — NO CODE MODIFICATIONS WITHOUT EXPLICIT CONFIRMATION

The AI must never modify, refactor, rewrite, or automatically generate changed versions of code.

Required workflow:

1. Carefully read and analyze the user request and any provided code.
2. First respond with a short summary of what was understood.
3. You may inspect, review, and reason about the code freely.
4. Before making any code changes, explicitly describe:
   - what will be changed
   - why it is necessary
   - which parts/files will be affected
5. Wait for explicit approval from the user.

Code changes are permitted ONLY after the user replies with:
y

If the user:

- pastes specific fragments
- asks conceptual or theoretical questions
- assigns a different task

Then no code must be changed unless explicit approval is given.

Default behavior: analysis and explanation only — no modifications.
