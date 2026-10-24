# Agentic Command Center for Software Teams

Oct 21, 2026

**Elevator pitch:** Software teams now run fleets of AI coding agents, but they're doing it on top of tools built for humans typing everything in by hand — Jira tickets, Confluence pages, Slack threads. We're building the control room for that instead: one agent-native workspace where a team dispatches and supervises agents from chat, voice or the command line, backed by a living knowledge graph that both people and agents read from and write to, so every agent's work compounds the team's context rather than scrolling away in a log. Sold team by team into funded startups first, priced on projects and usage rather than seats, with enterprise following once the product is proven.

| At a glance |  |
| --- | --- |
| **What it is** | An agent-native workspace where a software team dispatches, supervises and reviews AI coding agents, with a shared knowledge graph underneath. |
| **Who it's for** | Funded startup software teams (pre-seed to Series C) first, then enterprise teams, one team at a time. |
| **The problem** | Jira, Confluence, Slack and the rest were built for people doing every task by hand. Agents are being bolted on afterwards. |
| **How it makes money** | Per-project base fee plus metered agent usage, not per-seat. Licence plus service contract for enterprise. |
| **The moat** | The knowledge graph, agent factory log, goals and milestones, and the org and project data model. Not the 3D office on top. |
| **Where we are** | MVP scoped. Core problem validated in conversations with engineering leads. |

## Vision

An agent-native operating layer for software teams: one workspace where chat, voice, and the command line all dispatch and supervise AI coding agents, backed by a living knowledge graph that both humans and agents read from and write to. Not a bigger Jira, not a bigger Slack — the control room for a team whose daily work increasingly means directing agents rather than doing every task by hand.

Sold team by team, not company-wide: one engineering team inside a larger organisation adopts it as their working environment, independent of what the rest of the business runs.

## Problem

Software teams run on a stack that was built for humans doing all the work by hand, and it shows in several places at once.

| Area | Tools today | Where they fall short |
| --- | --- | --- |
| Project tracking | Jira, Linear | Tickets model people tracking their own tasks, not agents being dispatched, supervised and reviewed. Atlassian is adding agents to Jira, but on a data model built for humans. |
| Docs and knowledge | Confluence, Notion, Obsidian | Confluence demands structure before the thought is captured, so capture is high-friction and search is poor. Notion gets slow and complex as workspaces grow. Obsidian nails jot-first for individuals but has no real answer for team hosting, permissions or sharing. |
| Files and storage | OneDrive, SharePoint | Unreliable sync and a UI that fights the user, especially for developer workflows across VMs and environments. |
| Chat | Slack, Teams, Discord | Slack is overkill and expensive for a small team. Teams is widely disliked. Discord works well but reads as unprofessional to many enterprises. |
| All-in-ones | JetBrains Space | Right instinct, bringing chat, docs, calendar and repos together, but it was sold as an IDE add-on and built before agent orchestration was a need. |

The common thread: every tool above assumes a human is the one doing the work and typing it in. None of them were designed around a team whose main job is increasingly dispatching, supervising, and reviewing AI agents.

## Target user and go-to-market

The beachhead is funded startup teams, not enterprise. Enterprise follows later, one team at a time.

| Segment | Beachhead: funded startups | Later: enterprise teams |
| --- | --- | --- |
| **Who** | Pre-seed to Series B, Series C at a push. Teams out of YC, Entrepreneurs First, Antler and similar, fresh off a funding round. | One engineering team inside a larger organisation, with its own budget line. |
| **Why them** | No incumbent tooling to displace, no procurement, fast decisions, and funding-round credits that lower price sensitivity. | Large sums are going into making agentic development work, especially in forward-deployed teams. A team budget is easier to reach than a company-wide platform decision. |
| **Today's stack** | Scattered across a free Notion plan, Google Workspace and maybe Linear (not Jira). Willing to rip out tools and simplify, even after Series B. | Established Microsoft or Atlassian contracts. IT does not have to rip any of it out for a team to start. |
| **Route in** | Sign up and pay by card. | A team pays by card before procurement gets involved, with startup case studies used to open doors later. Procurement alone can take six months and kill a deal. |

- **Land:** one team adopts it as its working environment, with chat, docs, files and project tracking in one place and agents dispatched from any of them.
- **Expand:** adjacent teams join because the shared context layer is useful to them too.
- **Not consumer-led:** no personal-storage or personal-notes product. Everything is built for work done by software teams.

## Core pillars

Four pillars share one context layer. Agent orchestration is the core primitive; the other three feed it and are fed by it.

| Pillar | What it does | Role in the product |
| --- | --- | --- |
| **1. Agent orchestration** | Dispatch, supervise and review agents from chat, voice, the command line or MCP, with a plain list or board view to track them. | The core primitive. |
| **2. Living knowledge layer** | Jot-first capture that humans and agents both read from and write to. Meeting transcripts feed it. | The context every agent draws on. |
| **3. Team chat, calls and calendar** | The surfaces people already live in, with team-member management built in. | Dispatch surfaces, and how people and agents are scheduled together. |
| **4. File sharing and light project tracking** | Repos via connectors, light project tracking, agentic import and search across everything. File storage follows after the MVP. | Feeds the same context layer. |

### Pillar 1: Agent orchestration

- **Four surfaces.** Chat, voice, a command line inside the app, and an MCP server. A thought in a call or a message becomes a task an agent can pick up, with results landing back where the team works. Voice runs on Whisper on Workers AI (cheaper than Amazon Transcribe, which is expensive at volume), kept swappable behind one interface.
- **MCP server.** Agents running in a CLI such as Claude Code or Codex, or in a cloud sandbox, can use the product directly: read the knowledge layer, pick up and update tasks, and log activity to the agent factory. Every call goes through the same org and project permissions and shows up in the agent factory log.
- **Drag and drop.** Moving work is mostly dragging: cards between stages on the board, and a task onto an agent to assign it. The same gestures carry into the agent office later.
- **No CLI required.** Each agent runs as a full session against the team's own codebase and context, startable, viewable and steerable from inside the app. The command line is a power-user option, not the default way in.
- **Review is the point.** Finished work lands in a review panel as a diff to approve and merge, and every pull request and request for input waits in one approvals inbox. The whole thing is worthless if merge review is an afterthought.
- **Agent environment and secrets.** Each project defines the dependencies, environment variables and test databases its agents need. Secrets are managed centrally rather than pasted into prompts or repos.
- **Agents supported.** Claude (via Claude Code) is the first-class agent, with Codex and Gemini as the natural second and third. Customers bring their own model keys, so there is no pull toward any one vendor. A thin adapter layer and a common agent factory log format make a new agent a quick integration.

### Platform, views and design rule

- **Responsive web app first, not desktop.** Zero install friction fits the card-pay startup buyer. A desktop wrapper for local file access can follow once the core product is proven. The later agent office is browser-based too, rather than a native or Unity-style build.
- **List or board view first.** The MVP tracks tasks and agents in a plain list or board view, chosen per person or per device. The agent office comes later as a second view over the same data (see Post-MVP verticals). Mobile and small screens default to the board view, since dragging a task onto an animated agent does not work well at that size.
- **Simple beats clever.** The product should never need an explanation before first use, and every status should be readable at a glance without hovering or clicking in. A feature that only makes sense after a tutorial gets cut or moved to the list view. Complexity is allowed in the orchestration and data underneath, never on screen.

### Pillar 2: Living knowledge layer

The AI-native thinking tool and wiki, merged in. Write first; structure and linking emerge afterwards.

- **Low-friction capture.** Jot first. Links and structure emerge from automatic bidirectional linking and clustering. Nobody decides where something belongs before they have had the thought.
- **Humans and agents both read and write.** An agent's output becomes team knowledge, not a chat log that scrolls away.
- **Digest, changelog and decisions.** A daily digest and standup, and changelog and release notes, are written from the agent factory log and task changes. A decision log and runbooks live in the same layer.
- **Transcripts feed it.** Call and meeting transcription lands in the same layer, so a meeting becomes retrievable project context without anyone writing it up. The MVP uses a Granola-style connector for this.
- **Why not Confluence or Notion.** Confluence demands a page tree and a decision about where something belongs before the thought is captured. Notion asks for too much upfront commitment to look right and be organised. Both turn capture into a chore rather than a reflex.

### Pillar 3: Team chat, calls and calendar

**MVP chat is deliberately minimal and built natively on Durable Objects.** No end-to-end encryption: like Slack and Teams, it is encrypted in transit and at rest, because agents and search need to read the content. No reactions, huddles or custom emoji at launch.

- **Simple by design.** The surfaces people already live in, kept simple enough for a small team.
- **Dispatch surfaces.** Chat and calls double as ways to hand work to agents.
- **People and agents together.** Team-member management is built in, so people and agents can be organised and scheduled together.
- **Video calling comes later.** See Post-MVP verticals.

### Pillar 4: File sharing and light project tracking

- **Files come after the MVP.** Uploads (Word, PowerPoint, Excel, PDF, images) and connected Google Docs, Slides and Sheets move into a later vertical together with document intelligence (see Post-MVP verticals). Google files would be connected and read by agents, with editing staying in Google.
- **Repos via connectors.** GitHub and GitLab connectors rather than native hosting, at least for the MVP.
- **Light project tracking.** Takes lessons from Linear without copying its scope.
- **Agentic import.** An agent maps tasks from tools we aim to replace into this product's shape, starting with Jira, GitHub Issues and Projects, and Linear. It handles custom issue types that do not map directly, shows a preview for approval, and logs every run in the agent factory log. One-way import, not a live sync.
- **Search across everything.** One search over tasks, chat, the knowledge layer and the agent factory log.

## Agent factory and goal-driven work

The central differentiator, not a bolt-on feature.

- **Activity graph.** Every agent action is logged to its own graph, separate from the project board. Each agent writes its own account of what it did and why, similar to a GitHub issue but authored by the agent. Humans can see what it attempted, what context it loaded and how it reasoned.
- **Goals and milestones.** Work is organised around goals at org or project level (for example, release MVP) with milestones underneath. Agents work toward them directly, not just tickets assigned one at a time.
- **Compounding context.** As the knowledge layer grows, agents draw on more of it automatically, so their effectiveness grows alongside the team's accumulated context.
- **Visible and auditable.** The list or board view is how humans see and direct this activity, with the agent office to follow, and the same log doubles as the audit trail (see Enterprise baseline and compliance).

## MVP scope

The MVP proves one bet: that agent-native orchestration on top of a compounding context layer beats a human-first tool with agents bolted on. Everything in it either serves that bet or is the minimum a team needs to live in the product day to day.

| Capability | In the MVP | Notes |
| --- | --- | --- |
| Agent orchestration from chat, voice, command line and MCP server | Built natively | Pillar 1. Agents run first through a runner on the customer's machines, with cloud sandboxes following; see Where agents run. |
| Knowledge layer, agent factory log, goals and milestones | Built natively | The core of the bet |
| Light project tracking | Built natively | Lessons from Linear without copying its scope. Drag and drop moves cards through stages and onto agents. |
| Agentic import from other tools | Built natively | An agent maps tasks from tools we aim to replace into this product's shape, including custom issue types that do not map directly. First wave: Jira, GitHub Issues and Projects, Linear. Preview and approve before anything is written. |
| Search across everything | Built natively | One search box over tasks, chat, knowledge layer and agent factory log, respecting permissions |
| Approvals and review inbox | Built natively | Every agent pull request and request for input in one place |
| Notifications and digests | Built natively | In-app inbox, email and browser push, with per-person rules. The daily digest and standup is written from the agent factory log and task changes. |
| Agent permissions and spend limits | Built natively | Per-agent and per-project limits on actions and cost, with a kill switch |
| Audit log and data export | Built natively | Complete, tamper-evident audit trail and a full export of a team's data in open formats. Treated as a core feature, not an add-on. |
| Changelog and release notes | Built natively | Generated from merged work |
| Decision log and runbooks | Built natively | Live inside the knowledge layer |
| Usage and cost dashboard | Built natively | Needed for usage pricing |
| Agent environment and secrets | Built natively | The dependencies, environment variables and secrets that agents need. On the runner most of this already lives on the customer's machine; full environment setup arrives with cloud sandboxes. |
| Basic team chat and team-member management | Built natively | Chat holds much of a team's tacit knowledge, so it stays. Built minimal and natively: channels, threads, mentions and links to tasks and agents, with humans and agents side by side. |
| Enterprise baseline | Built natively | Access control, permissions and configurable data residency, alongside the audit log. Cheap now, painful to retrofit. |
| Git (GitHub, GitLab and similar) | Connector only | Agents read repos and open pull requests. No native git hosting. |
| CI and deploys (GitHub Actions and similar) | Connector only | Check and deploy status shown in the review panel |
| Error and incident monitoring (Sentry, Datadog, PagerDuty) | Connector only | Alerts become tasks that agents can pick up. Native monitoring is a later vertical. |
| Meeting transcription | Connector only | Granola-style. Sunset on a 90-day countdown once a native version ships. |
| Calendar, file storage with Google file connection, document intelligence, Slack and Teams history import, support desk, video calling, CI and pipeline understanding, visual workflow builder, agent office, native monitoring and incidents | After the MVP | See Post-MVP verticals |

**Connectors before native builds.** Where a strong standalone tool already exists, the MVP ships a connector into the knowledge graph rather than building the feature first. When the native version launches, the connector is sunset on a countdown (for example 90 days) so customers have time to move over. This makes the context-capture story real from day one without blocking the MVP, and the same pattern can apply beyond transcription.

**Not doing, now or later:** CRM, HR, payroll, expenses and finance. These are different businesses, and chasing them is how a software-team product turns into a general business suite. Also no Slack or Teams integration: the product replaces them rather than encouraging teams to stay in them.

## Pricing model

Priced on projects and usage, not seats. An organisation pays a base fee that includes a set number of projects (for example, up to five), with additional projects priced incrementally. One human owner per project is typically enough, with any number of agents operating inside it, so per-seat pricing would undercharge the teams generating the most agent activity.

On top of the project fee, usage is metered on actual agent consumption: compute, tasks run, outcomes delivered. Customers pay for the work agents actually do, not for how many people have a login. That makes the product a SaaS-plus-usage hybrid rather than a pure agent-as-a-service reseller. Customers see their usage and cost in a built-in dashboard.

**Three deployment tiers, aimed at different customers:**

| Tier | Who it's for | Model usage | What they pay |
| --- | --- | --- | --- |
| **Self-hosted, bring your own keys** | Security-conscious or regulated enterprise buyers. Running the whole platform in their own environment is not offered at launch; revisit if enterprise demand appears | The customer's own model subscriptions | A flat licence for the software, not a free tier. Modelled on Jira Data Center, which starts at $51,000 a year for 500 users. |
| **Runner, bring your own keys (launch tier)** | The startup beachhead. We host the platform; agents run on the team's own machines | The customer's own model subscriptions, so no token-cost risk for us | Project fee plus usage metering on orchestration and agent work, not model calls. |
| **Cloud-hosted with resale (after cloud sandboxes ship)** | Teams who want zero setup | A bundled pool, for example $30 of included agent and model activity | A monthly price, metered beyond the included usage. |

**Enterprise is a service contract on top of the licence, not a feature flag.**

- **Modelled on Atlassian.** Jira's cloud Enterprise tier starts at $155,000 a year for 801 users and bundles a 99.95% SLA, bring-your-own-key encryption, analytics, a data lake and centralised administration.
- **What the customer buys.** An SLA, dedicated support and admin tooling at scale, none of which a self-hosted or open-source fork can trivially replicate.
- **Forward-deployed engineers.** Early on, a founder goes on-site to set the product up and build bespoke modules for that customer. As revenue grows, this becomes a small forward-deployed team. The account has a named contact throughout, not a ticket queue.
- **No free money.** Self-hosted and open-source deployments are a licence fee plus the option of a support and services contract, which is what funds the enterprise motion.

## Data and technical architecture

### Data model

Data, not the chat or docs surface, is the real first-class citizen.

- **Org is the parent, projects are children.** The org is typically owned by a manager or admin, with projects underneath it.
- **Org-wide by default.** Data is shared and queryable across the whole org, so an admin or anyone with org-wide access can draw on context from every project. Scoping down to a single project is possible when isolation is needed.
- **A compounding asset.** Each org's accumulated data, and the telemetry and context derived from it, works like a data lake the org keeps drawing on as it grows.
- **One database per project.** Every project gets its own Durable Object and its own D1 database. Isolation is architectural rather than procedural: queries are physically unable to reach another project's data. Each project can also carry its own residency lock, matching the per-project pricing.
- **Org-level data lives separately.** Membership, billing and the project registry sit in their own lightweight D1 database, not a Durable Object, since a Durable Object is a compute-plus-storage primitive and not a relational store. Org-wide views fan out to each project's database and merge the results.
- **Still open:** whether permissioning needs to go finer than project level.

### Stack: Cloudflare-first

The platform is built on Cloudflare end to end, with two deliberate outside services (Amazon Bedrock and WorkOS). Durable Objects are the core primitive.

| Component | Role | Why it fits |
| --- | --- | --- |
| **Workers** (deployed with Wrangler) | Application compute and API | One deployment and orchestration tool across the whole stack |
| **Durable Objects** | One per project. Live state: knowledge graph, agent factory log, task and goal data, and real-time session state | Built for coordination among multiple clients, and can act as WebSocket servers connecting thousands of clients per instance. A close match for a live stream of agent\_spawn, agent\_update and agent\_complete events. |
| **D1** | Structured relational data: one database per project, plus one org-level database | Sits alongside the Durable Object. See Data model above. |
| **Agents SDK** | Agent execution, built on Durable Objects | Persistent, stateful environments where each agent has its own state, storage and lifecycle, with built-in real-time communication and scheduling |
| **Vectorize** | Vector database for semantic search over tacit-knowledge notes | Powers the knowledge layer |
| **Queues and Cron Triggers** | Background and scheduled work: digesting the agent factory log, nightly rollups, reminders, goal-deadline checks | Run through Workers, with no separate job system |
| **R2** | Uploaded files and attachments | Zero egress cost |
| **Workers for Platforms** | Isolated compute per tenant, and custom domains | Subdomain by default. Enterprise customers can connect their own hostname later (V2, not MVP) without a bespoke build. |
| **Cloudflare Email Sending** (public beta) | Transactional email sent from a Worker binding | No separate provider or API keys to manage |
| **Amazon Bedrock** (outside Cloudflare) | Model inference | Geographic cross-region inference gives model-call data residency. See Data residency below. |
| **AI Gateway** | Routing and observability in front of Bedrock | Not relied on to enforce residency |
| **WorkOS** (outside Cloudflare) | Authentication, SSO and directory sync | The one deliberate exception to building on Cloudflare: auth is enterprise-critical but not worth owning. Free tier covers email, social login, magic auth, MFA and passkeys, with enterprise SSO as its core strength. |

**Staying on Cloudflare: decided, with watch items.** The developer experience and speed outweigh portability, and whole-platform self-hosting is not offered at launch. To keep lock-in cheap: put storage, queue and model calls behind thin interfaces, keep Cloudflare APIs out of the domain logic, and keep the data export in plain formats. Watch D1's per-database size limits as projects grow, and plan an early migration job, since schema changes must run across every project database.

### Data residency

Residency is split between application data and model calls.

| Layer | How it is locked | Detail |
| --- | --- | --- |
| **Application data** | Durable Object jurisdictions | A project's Durable Object and D1 data can be constrained to run and store only within a chosen region, to meet rules such as GDPR. The catalogue goes beyond the EU to country-level regions such as the UK, Germany, India, Japan, Singapore and Brazil, with EU, US and FedRAMP jurisdictions available for Durable Objects. |
| **Model calls** | Amazon Bedrock geographic cross-region inference profiles | A request is routed to a region within a defined geography such as US, EU or APAC, and data stays within it. No customer data is stored in any destination region during routing. An EU customer is served from Bedrock's EU geography, and one requiring Australian residency from its Australian geography. |

AI Gateway stays in the stack purely as a routing and observability layer in front of Bedrock, rather than being relied on to enforce residency itself.

### Where agents run

Agents run in two different ways, depending on the deployment tier.

| Deployment | Where agents run | How it works |
| --- | --- | --- |
| **Cloud-hosted** (later; the cloud-sandbox tiers) | In isolated cloud sandboxes that we run on Cloudflare, one per task | A Worker starts a sandbox for each task. The sandbox clones the repo through a GitHub App, runs the agent (Claude Code first), and streams events to the project's Durable Object and the agent factory log. Model keys are added outside the sandbox, so it never holds them. The result is pushed as a branch or pull request for review, and the sandbox is torn down. |
| **Self-hosted** | On the customer's own machines, through a small runner (the launch path) | The runner connects out to the platform, so no inbound firewall changes are needed. It uses the customer's own tools, model keys and repo checkouts, runs each task on a fresh git branch, streams events back, and pushes the branch for review. Keys and code never leave the customer. |

- **Same product either way.** Tasks, the agent factory log, review and goals look the same to the customer. Only where the agent executes differs.
- **Runner first.** The runner is far less to build: no per-repo environment setup, no customer secrets held by us, and no sandbox compute to pay for. It proves the dispatch, review and knowledge loop sooner. Cloud sandboxes follow for zero-install onboarding and parallel fleets. Build the product as if it were an internal tool first, with no sandboxes, resale or usage billing, and add the cloud tiers once the features are done. Keep org and project boundaries, permissions, audit, export and per-task usage counting from day one, since they are painful to retrofit.
- **Sandbox compute is a cost we carry.** It is metered into the usage price rather than absorbed. Pricing, limits and sandbox lifetimes still need checking with a prototype before we commit.
- **Security is baseline.** Once the cloud tiers exist, customer code and secrets will sit in our infrastructure. Egress allowlists and credential injection outside the sandbox are required, not extras. [Cloudflare's coding agents documentation](https://developers.cloudflare.com/sandbox/coding-agents/) describes the model key being added by the Worker rather than held in the sandbox.

## Enterprise baseline and compliance

### Built in from day one

- **Core, not a tier.** Auditing, permissions, access control and configurable data residency are part of the core product. A shared audit layer that every feature writes to is cheap to add early and painful to retrofit.
- **First objection removed.** Having them as standard answers the first question an engineering manager or security reviewer will raise.
- **Certifications are a business milestone, not a product feature.** SOC 2, GDPR readiness and the UK and EU security frameworks are pursued once paying teams need them.

### EU AI Act

The product is unlikely to be a high-risk system in itself, and the high-risk obligations have been pushed back to December 2027 by the Digital Omnibus. The nearer-term angle is turning the Act's requirements into features customers can lean on.

| Requirement | What it means | How the product answers it |
| --- | --- | --- |
| **Transparency** | Article 50 transparency duties applied from August 2026. | Mark AI-generated output, and clearly tell end users when they are talking to an agent (relevant to the support desk widget), by default. |
| **Traceability and human oversight** | A record of what an agent did, why, and what context it used. | The agent factory activity graph already is that record. Exporting it as an audit trail turns an existing feature into compliance evidence. |
| **AI literacy and governance** | Customers deploying agents need to show they know what those agents are doing. | Per-agent permissions, approval gates and usage reporting. |
| **The agent office (post-MVP)** | It must never be a side door around the audit trail. | Every desk's session is scoped by the same org and project permissions as everywhere else. Who can spin one up, which repos and data it can touch, and what it did are all visible in the agent factory log. |

This is a product positioning note, not legal advice. Scope and timing should be checked with a specialist before any compliance claims go on the website.

## Positioning

The product takes one lesson from each reference point and deliberately avoids its trap.

| Reference | What we take | What we avoid |
| --- | --- | --- |
| Linear | Taste, speed and focused execution | Being a project tracker with AI features added. Linear ($134M raised) and DevRev ($151M) already compete there. |
| OneDrive | Frictionless file sharing | Becoming storage for a whole business, or a consumer product |
| JetBrains Space | One place for chat, docs, calendar and repos | Being sold only alongside an IDE licence, and having no agent layer |
| Confluence / Notion | Shared docs and a source of truth | Making people choose structure before they have captured the thought |
| Obsidian | Linking and graph-style thinking | Single-player design and costly hosting |
| Macro | Breadth in one tab — email, chat, docs, sheets, CRM, calls and coding agents in channels, open source, $30M+ raised, already at SOC 2 and ISO 27001 | Treating the human as the first-class citizen on seat-based pricing, with agents as a feature a human dispatches rather than the unit the product is built and priced around |

The distinct claim: the others track work that people do. This product is where a team directs work that agents do, with the shared knowledge those agents need built in.

## Values and design direction

Beyond the direct competitors above, a few companies outside this category set the bar for how the product should feel and how the company should operate, independent of what they build.

| Reference | What they do | The lesson for us |
| --- | --- | --- |
| **Stripe** | Craft as a system, not a layer of polish. Quality shows up in the architecture, not just the pixels. Design is everyone's job, and decisions are documented in long-form writing so quality holds as the company grows. | Get the data architecture and agent factory right first. Interface polish cannot hide a shaky foundation. |
| **Superhuman** | Speed and obsessive refinement as the whole product, treating speed itself as a feature worth designing for. | An agentic command centre lives or dies on how fast it feels to dispatch an agent and see results, not just on how many features it has. |

**What we actively avoid becoming:**

- **Notion's weight.** A product that demands structure and setup before it rewards anyone for using it.
- **OneDrive's sprawl.** A general-purpose business storage system that loses its edge for any one kind of team.
- **JetBrains Space's bundling.** A good idea sold only as an add-on to something else, so it never has to stand on its own value.
- **Enterprise software's slowness.** Long release cycles and features shaped by production standards for thousands of users rather than love from the team actually using it, which is the opening a smaller, faster-moving company can exploit.

## Competitor analysis

Who the product is actually up against, split by what they threaten rather than by category.

| Threat | Who | Why they matter | Our answer |
| --- | --- | --- | --- |
| **Direct rival** | Macro | Closest match in surface area. Funded, open source, and already at enterprise-grade certifications. | Built human-first on seat pricing, with agents as a feature. This product is designed and priced around agents. See Open questions and risks. |
| **Incumbents adding agents** | Atlassian (Jira), Slite | Large, well-distributed products with trust this product has to earn from zero. | They are bolting agent features onto a human-task data model built years before agents existed, which is slow to rearchitect. |
| **Point solutions** | Linear, OneDrive, Obsidian, Confluence, Notion | None is trying to be an agent-native command centre, but each is good enough at one job that a team will keep using it. | The combined product must be clearly better, not just more convenient. |

**The customer's real choice.** A funded startup software team today is choosing between three paths:

- Stay scattered across several free or cheap point tools.
- Wait for an incumbent like Atlassian to bolt on agent features.
- Adopt a single agent-native product early.

The pitch only works against the first two if the core pillars (the agent factory, goal-driven work and tacit-knowledge capture) are good enough to be worth the switch on their own, not just convenient to bundle.

## Differentiators

- **Agent-native from the core.** Dispatch from chat, voice or command line is a first-class feature, and agent output writes back into the shared knowledge graph. Later, the agent office makes supervising a fleet of agents feel like managing a team. Incumbents are adding agents to products built around human task-tracking.
- **Configurable data residency.** The customer chooses where data lives, including in the EU. Sovereignty language now appears in European procurement documents, and Denmark's public sector has announced plans to phase out Microsoft Teams. Forrester expects no major player to fully exit US cloud by 2026, so this is a tailwind and not a standalone reason to buy.
- **Priced on its own merits.** Sold as a product in its own right, not as an add-on to a larger licence bundle.
- **Team-sized.** Built for one team to adopt without a company-wide rollout, with an enterprise licence available per team.

## Post-MVP verticals

Verticals to explore once the MVP has proven the core bet. None block the MVP, and several build directly on the context it creates.

| Vertical | What it is | Why it comes after the MVP | Builds on |
| --- | --- | --- | --- |
| **Agent office** | A top-down 3D office where each agent is a small robot at a desk, seen from a fixed diagonal camera with pan and zoom. Robot colour is the only customisation. A visual alternative to the list or board view. | A lot of work to bake into the MVP, which can prove the orchestration and context bet without it. It could still take off as a feature if it proves practical. See Agent office: the plan below. | Agent factory log, review panel, list or board view |
| **Cloud sandboxes** | Isolated cloud sandboxes on Cloudflare, one per task, so agents run with nothing installed on customer machines. Each clones the repo through a GitHub App and pushes a branch or pull request for review. | The runner proves the orchestration loop with far less to build. Sandboxes add zero-install onboarding and parallel fleets once the loop works, and need sandbox cost and limits proved first. See Where agents run. | Agent orchestration, agent factory log, git connectors |
| **Native monitoring and incident management** | Error tracking, alerting and on-call built into the product, so an alert, the agent that investigates it and the fix sit in one place. | The MVP connects to Sentry, Datadog and PagerDuty instead of rebuilding them. Build it once the alert-to-task loop has proven valuable. | Monitoring connectors, agent factory log, approvals inbox |
| **Agentic support desk** | A customer-facing support desk sold as an add-on. A team links it to a project and embeds a contact-support widget in their own product. | Needs the context layer and orchestration to exist first. The differentiator against generic AI support players is real engineering context. | Knowledge layer, agent factory, git connectors |
| **Agent-optimised version control** | A graph-based alternative to git, designed around how agents work rather than humans. | Large and architecturally unresolved. Deliberately not an MVP dependency, and needs real design thought first. | Agent factory activity graph |
| **Agent-native code hosting** | A GitHub-style home for code, with repos, pull request review and issues built around agents as first-class contributors and reviewers. The platform that holds the code is the same one that dispatches and reviews the agents. | The MVP reaches GitHub and GitLab through connectors on purpose. A native host only makes sense on top of agent-optimised version control, otherwise it is a half-measure git host. | Agent-optimised version control, the review panel |
| **Video calling** | Native calls, completing the chat, calls and calendar pillar. Calendar sits here too: cut from the MVP, brought back with calls. | Complex (codecs, infrastructure). Launch first as its own semi-mature vertical, then fold into the core product once proven. | Calendar and calls pillar |
| **Files, Google connection and document intelligence** | File storage for Word, PowerPoint, Excel, PDF and image uploads, plus connected Google Docs, Slides and Sheets (read by agents, edited in Google). On top of that, ask questions directly against the documents. Folds in the regulated document and records management idea (an AI-native challenger to M-Files) instead of keeping it as a separate business. | Files are not needed to prove the core bet, and the analysis is what makes them worth building. Do them together. | File sharing, knowledge layer, R2 |
| **Native meeting transcription** | Replaces the Granola-style connector. | The connector gets the context-capture story real from day one. Sunset on a 90-day countdown once native ships. | Knowledge layer |
| **Deeper CI and pipeline understanding** | Agents that understand build and deployment pipelines as well as code. | Not needed to prove the core bet. | Git connectors, agent orchestration |
| **Visual workflow builder** | A visual way to compose agent workflows. | Not needed to prove the core bet. | Agent orchestration |
| **SSH-hosted file sharing** | File sharing across Linux VMs and virtualised environments. | A separate and harder problem that could dilute focus early. | File sharing |
| Slack and Teams history import | A one-off import of past channel history into the knowledge layer, from export files or the platform APIs. Context only, not a live bridge, and not a reason to stay in Slack or Teams. | Useful for the tacit knowledge story but messy and API-limited, so unproven value. Build it if early customers ask. | Knowledge layer, agentic import |

**How the support desk works.** A user's ticket opens an agent-backed chat. The agent trawls the linked project context to answer, and where the issue is a real bug it can attempt a fix and open a pull request directly. Anything it cannot resolve escalates to a human, with a ticket view across the org. Open question: whether it ships bolted into the core product or as a separate, independently sold product. Not yet decided.

**Why version control and hosting go together.** Agent-optimised version control is the engine and agent-native code hosting is the product around it. Together they are the most ambitious later bet, taking on both how agents change code and where it lives. Both stay out of the MVP so the time goes into proving the orchestration and context bet first.

### Agent office: the plan

The agent office is a later, visual front end to orchestration: one fixed 3D office, seen from a diagonal top-down angle like the camera in League of Legends, with each agent as a small robot at a desk. It is the agent factory activity graph made spatial and clickable, so supervising a fleet of agents feels like managing a team rather than reading a log.

- **Drag a task onto an agent** to queue it.
- **A status bubble** shows what each agent is doing right now.
- **Finished work** lands in a review panel as a diff to approve and merge.
- **Everything that touches agents** (orchestration, the agent factory log, goals and milestones, permissions) renders through this surface as a first-class view.

**Look and camera.**

- **Diagonal top-down camera.** A League of Legends-style view: a fixed angle with pan and zoom, and no free-flying or first-person movement.
- **One fixed office.** The room is built once and is not customisable. No office builder, no layout editing, no extra rooms.
- **Basic robots.** Each agent is a simple robot model. An existing robot model with a permissive licence is enough to start. Robots are the only characters, and nobody walks an avatar around.
- **Colour is the one customisation.** A team can set the colour of each robot, which also helps tell agents apart at a glance.
- **Spawn and remove.** A robot spawns in when an agent starts and is removed when the agent is retired.
- **Clean and functional.** Time goes into clean lighting, materials and robot design so it looks professional, but every visual choice has to make status easier to read. Simple and usable beats elaborate.
- **3D first, with fallbacks.** Start in 3D rather than 2D. The list or board view, which the MVP ships with, stays the default for small screens and low-power machines. A 2D mode is possible later, but it is not the plan.

**Reference projects: take inspiration, build our own layer.** Two open-source projects show much closer to what we want. We are not forking either: we build a small scene of our own, and for licensing reasons we need our own robot model.

| Reference | What we take | Watch out for |
| --- | --- | --- |
| [W17ant/Claude-Office](https://github.com/W17ant/Claude-Office) | An isometric, diagonal view that reads at a glance. Agents appear when they start and leave when they finish, driven by Claude Code hooks that report spawns, tool calls and completions to a local server over WebSocket. Typing bubbles, and a simulation mode with fake agents for demos. | 2D pixel art rather than 3D, with human-style characters rather than robots. MIT licence. |
| [arturitu/the-delegation](https://github.com/arturitu/the-delegation) | A 3D scene in Three.js (WebGPU) with rigged models, agents that walk to desks, 3D speech bubbles and status indicators, and an inspector that shows a selected agent's thoughts, mission and history. | The code is MIT, but the 3D models and assets are CC BY-NC 4.0, so they cannot be used commercially without the author's permission. |

**What we build, and what we leave out.**

| Piece | What we build |
| --- | --- |
| Scene | One fixed office in Three.js with React Three Fiber and Drei, viewed from a diagonal top-down camera with pan and zoom |
| Agents | A basic robot model at a desk, with a customisable colour per agent. The model is our own or has a licence that allows commercial use. |
| Lifecycle | A robot spawns in when an agent starts and is removed when it is retired |
| Status | A status bubble and the review panel, driven by the agent factory activity graph |
| Inspector | Clicking a robot opens that agent's activity, mission and history from the agent factory log |
| Demo mode | A simulation mode with fake agents, so the office can be shown without live agents |
| Data | The org and project data model, the knowledge layer, and goals and milestones |

**Deliberately left out:** an office builder or layout editing, extra rooms and decor, walkable avatars, meeting rooms and a 2D mode. None of it is needed to supervise agents, and each would pull time away from the product underneath. The office is a thin, clean layer over the product's own data, not a project in itself.

## Open questions and risks

What could go wrong, and where each risk stands. Resolved items are kept so the reasoning stays visible.

| Risk | Where it stands | Response |
| --- | --- | --- |
| **Where the agents run** | Decided, with details to prove. Agents run first through a runner on the customer's own machines, with cloud sandboxes that we host following (see Where agents run). Running Claude Code or Codex against a team's repo needs sandboxed compute, repo checkouts, secrets handling and cost control. It is probably the hardest engineering problem in the plan. | Prototype one agent end to end through the runner first. Then prototype a cloud sandbox to measure cost per task, start-up time and sandbox limits. Hosting sandboxes adds compute cost and a larger security surface, which the usage pricing and the security baseline have to cover. |
| **All-in-ones are hard** | Competing with best-of-breed tools on every feature at once is why they usually stall. | Not every pillar needs to be best. The agent factory with goal-driven work, and the tacit-knowledge docs philosophy, are where this product proposes something that does not exist elsewhere, and those two must be genuinely excellent. Chat, calendar and team management only need to be good enough that nobody is repelled. |
| **Incumbents are moving** | Atlassian shipped agents inside Jira in July 2026, free for paying cloud customers, and positions its Teamwork Graph as the context layer. Slite launched a self-maintaining wiki agent in June 2026. Macro is the closest direct rival: a16z-backed, open source, over $30 million raised, 170,000-plus users, already at SOC 2 and ISO 27001, covering nearly the same surface (chat, docs, files, calls, coding agents). | The wedge is that Macro is built human-first on seat-based pricing, with agents as a feature humans dispatch rather than the unit the product is designed and priced around. That needs testing against the real product, not just its landing page. Open: how long is the window? |
| **The office itself is easy to copy** | A simple office scene is easy for any competitor, including Macro, to build, and open-source offices such as Claude-Office and The Delegation already exist. | The moat stays underneath: the knowledge graph, the agent factory log, goals and milestones, and the org and project data model, none of which a scene provides. |
| **Is thinking tool, not filing cabinet, a buying reason?** | So far a personal preference, not a tested buying reason. Obsidian's hundreds of thousands of users is a real signal that jot-first capture is already a wanted behaviour. | The further bet is that agents go beyond Obsidian's manual linking, turning a quick note, bullet list or voice memo into fuller written context automatically, so people write less and still produce more. Keep testing it in customer conversations. |
| **Agent orchestration surface** | Largely resolved by bring-your-own-keys pricing: customers bring their own model subscriptions, so there is no commercial pull toward one vendor. | Claude (via Claude Code) is the first-class agent, reflecting it being best in class for coding today, with Codex and Gemini as the natural second and third. The remaining work is technical: a thin adapter layer and a common agent factory log format. Launch with two or three agents, not the whole market. |
| **Enterprise trust** | Permissions, audit trails and agent governance are what an engineering manager will ask about first. | Resolved by making the enterprise baseline a core default, not a tier. See Enterprise baseline and compliance. |
| **Evidence base** | Resolved. This has already been validated directly, not just from vendor blogs and press coverage. | Conversations with a large number of engineering leads have independently confirmed the core problem: agents bolted onto human-first tools do not fit how teams actually work now. |
