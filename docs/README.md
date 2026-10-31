# Documentation

| Guide                                           | What it covers                                                                  |
| ----------------------------------------------- | ------------------------------------------------------------------------------- |
| [Getting started](getting-started.md)           | Running the stack with Docker compose or from source, and your first presenter. |
| [Architecture](architecture.md)                 | Components, data model, a session's lifecycle, the research pipeline.           |
| [Configuration](configuration.md)               | Every environment variable, grouped by service.                                 |
| [Writing good goals](writing-good-goals.md)     | Product demos, presentations, whiteboard, preparation notes and secrets.        |
| [AI research](ai-research.md)                   | How "Let AI prepare it" works: phases, review, CLI, service API, safety.        |
| [Embedding](embedding.md)                       | The website widget snippet, options and the embed page.                         |
| [Models and providers](models-and-providers.md) | Claude by default, other Anthropic-compatible providers, probing, cost.         |
| [Deployment](deployment.md)                     | Compose in production, scaling, networking, backups, the encryption key.        |
| [Troubleshooting and FAQ](troubleshooting.md)   | Things that go wrong and how to fix them.                                       |

Package-level details live in each package's README: [humanize](../packages/humanize),
[sandbox](../packages/sandbox), [director](../packages/director),
[researcher](../packages/researcher), [agent](../apps/agent), [web](../apps/web).
