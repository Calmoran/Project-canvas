# Canvas

Canvas: a code-and-data visualization tool for WoW private servers, AzerothCore 3.3.5 first. Read `AGENTS.md` (the rulebook for every agent, you included), then `docs/PROJECT-BRIEF.md` (idea, requirements, decisions log), then your role's `docs/handoffs/<role>.md`. Currently in planning: no application code yet.

- Keep all project files inside this folder. Don't read or write elsewhere in the user's home directory unless asked.
- The user is not a developer or designer. Own the technical and design best practices, explain decisions in plain language. When there are real alternatives with different trade-offs, or when a question has no concrete answer in the brief, the architecture, or the clean source, lay out the options with their pros and cons and discuss them with the user before choosing; do not pick a path unilaterally. Only routine details with no meaningful trade-off are decided alone, and then explained.
- The user knows what common languages are (C++, HTML, PHP) and basic terms like headers and calls, but can't write code. They want to learn along the way: when you write code, add a short plain-language explanation of what it does and why. Define new concepts the first time they come up.
- Quality over teachability. Build this as a properly engineered application. Never choose a language, library, or design because it is easier for the user to follow; choose what is right for the product, then explain it. Explanations adapt to the code, not the other way around.
- Clean room: the only reference is the clean AzerothCore checkout named in `CLAUDE.local.md`. Do not read, name, or reason from any other project on this PC. Every workflow element, tool, or rule proposed for Canvas must be justified on Canvas's own needs.
