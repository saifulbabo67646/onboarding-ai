# Writing good goals

A presenter has no script and no click-path. It gets a **goal** in plain language, a starting
point, a persona and, optionally, **preparation notes**. It looks at the screen and works out the
clicks itself. This page covers what to put in each field. If you use
[Let AI prepare it](ai-research.md), the researcher writes the goal and notes for you; these tips
still help when you review its draft.

## What the presenter receives

The dashboard turns a presenter's settings into a brief for the director
(`apps/web/lib/agents.ts` → `onboard_director.DemoBrief`):

| Setting                                                   | What it does                                                                                   |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Type                                                      | **Demo a product** (a web app) or **Present slides** (a slide deck).                           |
| Goal                                                      | What to accomplish. Up to 8,000 characters. Required to publish.                               |
| Preparation notes                                         | Background the presenter studies before every call. Up to 30,000 characters. Never read aloud. |
| Start URL / deck link                                     | Where the browser starts.                                                                      |
| Presenter name, company, language, opening line, voice ID | Persona. The opening line is a suggestion, not a script.                                       |
| Allow the whiteboard                                      | Lets the presenter open Excalidraw and sketch while explaining.                                |
| Time limit                                                | 2-120 minutes. The presenter wraps up near the limit.                                          |
| Secrets                                                   | Demo-account logins, typed into the page with `type_secret`. The model only sees their names.  |

## Product demo

A good goal says **who** is watching, **what** they should see and understand, and **what to
avoid**. Name outcomes, not clicks.

```text
Demo our analytics dashboard to a prospect who manages a finance team.
Log in, explain the four KPI tiles on the home page, then build a report for last month's
expenses by department and share it with a teammate. Mention that reports refresh hourly.
Skip the admin and billing settings.
```

Tips:

- **One real task end-to-end** beats a tour of every menu. The presenter is told to prefer that.
- **Say what matters to the audience.** "Finance managers care about approvals" changes what it
  emphasises and how it talks.
- **Give the order** if it matters ("start with the mobile app, then the web dashboard").
- **Name things to avoid.** The presenter already avoids payment forms, deleting real data and
  account settings unless the goal asks for them. Add product-specific ones.
- **Start where the demo starts.** For an app with a login, the start URL is usually the login
  page.
- **Allow sample data explicitly** if creating records is part of the story ("creating a sample
  invoice is fine").

## Presentation

Set the type to **Present slides** and paste a deck link as the start URL:

- A public Google Slides link (share or edit link) opens in present view. For public decks the
  presenter also reads the slides' text up front to plan the talk.
- A `.pptx` (or other Office file) URL opens in the Office Online viewer.
- Anything else (a PDF, Canva, Pitch) is opened as is.

The presenter goes slide by slide, explains each in its own words, points at the chart or number
it is talking about, and pauses for questions after major sections. The goal can be short:

```text
Present this deck to new students on their first day. Keep it friendly, explain the
grading slide carefully, and take questions at the end.
```

## Whiteboard

Turn on **Allow the whiteboard** for topics that are easier to explain with a quick diagram. The
presenter opens <https://excalidraw.com> in a new tab, draws boxes, arrows and short labels while
it talks, then switches back. It works in both modes. The goal can hint when to use it:

```text
When you explain how data flows from the mobile app to the reports, sketch it on the whiteboard.
```

## Preparation notes

Notes are background, not instructions. The presenter uses them to plan, find its way around and
answer questions, and trusts the screen when the two disagree. Useful content:

- What the product is and who it's for, in two or three sentences.
- Where things live: "Reports are under Insights > Reports", "the export button is in the
  top-right menu of any table".
- Facts it can't see on screen: pricing tiers, integrations, limits, what's on the roadmap.
- Answers to the questions prospects usually ask.
- Terms specific to your product.

The researcher's notes follow this structure (sections, login steps, FAQ, glossary, things to
avoid), so they are a good template even if you write your own.

## Secrets

Add the demo account's login under **Secrets** (for example `username` and `password`). Values
are encrypted at rest, never sent to the browser or the model, and typed without typos. The goal
does not need to mention them; the presenter sees which secret names exist and uses them when it
meets a login form.

Use a **dedicated demo account** with demo data. Anything that account can see, a curious
visitor can ask to see.

## Checking a goal

- Run it in your terminal first with `onboard-director --goal "..." --url ...`
  ([getting-started](getting-started.md#try-pieces-without-the-full-stack)).
- Open your share link and join yourself. Interrupt with a question to see how it recovers.
- Read the session transcript in the dashboard and tighten the goal where it wandered.
