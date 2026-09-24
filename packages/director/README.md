# onboard-director

A Claude computer-use loop that **presents live** - a product demo or a slide deck - like a
person: it talks while it works, rests the cursor on what it explains, handles interruptions and
questions, and wraps up when the goal is met.

It is independent of any meeting platform. You give it:

- a `DemoBrief` - the goal in plain language, a start URL, persona and options;
- a `Computer` - anything shaped like `onboard_sandbox.SandboxClient`;
- a `Narrator` - anything with `say(text) -> Speech` (LiveKit TTS, a phone line, a print
  statement…).

```python
from onboard_director import DemoBrief, Director

brief = DemoBrief(
    goal="Show a new customer how to create a project and invite a teammate.",
    start_url="https://app.example.com",
    presenter_name="Maya",
    secrets={"password": "..."},           # typed via type_secret, never sent to the model
)
director = Director(brief, sandbox_client, narrator, on_event=print)
director.hear("Sorry, how do permissions work?")     # feed audience transcripts any time
summary = await director.run()
```

## How it behaves

- Uses the `computer_toolset_20260801` toolset plus presenter tools: `say`, `point_at`
  (move + hover/circle/underline/wiggle while speaking), `open_url` (types into the address bar),
  `type_secret`, `listen`, `sketch` (Excalidraw drawing) and `end_demo`.
- Tool calls execute **as the response streams**, so speech starts before the model finishes its
  turn and several steps can run back-to-back.
- After any turn that changed the screen, a fresh screenshot is attached automatically - fewer
  round trips, fewer awkward pauses.
- `hear()` interrupts the current actions unless the utterance is a backchannel ("mhm", "ok").
  `audience_speaking(True)` freezes the mouse while someone talks.
- Presentation mode opens Google Slides in present view (`.pptx` via Office Online) and, for
  public Google decks, reads the text export up front to plan the talk.
- Long sessions stay lean with server-side context editing; refusals are handled with the
  server-side fallback chain and a graceful exit.

Config (`DirectorConfig`): `model` (default `claude-opus-5`), `effort` (default `medium` for
live latency), `fallbacks`, screenshot quality, context-editing thresholds.

## Terminal dry run

```bash
onboard-director --goal "Find a sci-fi book and add it to a reading list" --url https://openlibrary.org
```

Speech is printed; type a line and press Enter to interrupt as the "customer".

```bash
pip install -e ".[test]" && pytest
```
