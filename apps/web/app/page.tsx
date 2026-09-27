import Link from 'next/link';
import { TopBar } from '@/components/TopBar';

const FEATURES = [
  {
    title: 'Goal in, demo out',
    body: 'No scripts, no click-paths, no knowledge base. Describe what the customer should see and the presenter works it out on screen.',
  },
  {
    title: 'Feels like a person',
    body: 'Real mouse and keyboard in a private desktop: curved, unhurried cursor moves, natural typing with the odd corrected typo, new tabs, quick searches.',
  },
  {
    title: 'Points while it talks',
    body: 'The cursor rests on what is being explained - circling a chart, underlining a number - while the presenter speaks in a natural voice.',
  },
  {
    title: 'Slides and whiteboard',
    body: 'Share a Google Slides or PowerPoint link and it presents slide by slide. It can open Excalidraw and sketch a diagram to explain an idea.',
  },
  {
    title: 'Interrupt any time',
    body: 'Customers ask questions out loud. The presenter stops, answers, shows it on screen if useful, and picks up where it left off.',
  },
  {
    title: 'Open source, modular',
    body: 'Humanized input, the sandbox desktop, the presenting loop and the meeting worker are independent packages you can reuse.',
  },
];

export default function Home() {
  return (
    <>
      <TopBar />
      <main className="container">
        <section className="hero">
          <span className="badge">
            <span className="dot" /> Live AI presenters
          </span>
          <h1 style={{ marginTop: 20 }}>
            Your product demo,
            <br />
            <span>presented live by AI</span>
          </h1>
          <p>
            Give a presenter a goal. When a customer opens your demo link, it joins the call, shares
            its screen and walks them through your product or deck - talking, pointing and answering
            questions like a real person.
          </p>
          <div className="row" style={{ justifyContent: 'center' }}>
            <Link href="/dashboard/agents/new" className="btn btn-primary btn-lg">
              Create a presenter
            </Link>
            <Link href="/dashboard" className="btn btn-lg">
              Dashboard
            </Link>
          </div>
        </section>
        <section className="features">
          {FEATURES.map((f) => (
            <div key={f.title} className="card">
              <h3>{f.title}</h3>
              <p>{f.body}</p>
            </div>
          ))}
        </section>
      </main>
    </>
  );
}
