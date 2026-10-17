import {
  ArrowRight,
  Code2,
  Hand,
  MessagesSquare,
  MousePointer2,
  PenTool,
  Target,
} from 'lucide-react';
import { SiteNav } from '@/components/site/SiteNav';
import { Badge, Button } from '@/components/ui';
import styles from './home.module.css';

const FEATURES = [
  {
    icon: Target,
    title: 'Goal in, demo out',
    body: 'No scripts, click-paths or knowledge base. Describe what the audience should see; the presenter works it out on screen.',
  },
  {
    icon: MousePointer2,
    title: 'Feels like a person',
    body: 'Real mouse and keyboard in a private desktop: unhurried cursor moves, natural typing, new tabs and quick searches.',
  },
  {
    icon: Hand,
    title: 'Points while it talks',
    body: 'The cursor rests on what is being explained - circling a chart, underlining a number - in a natural voice.',
  },
  {
    icon: PenTool,
    title: 'Slides and whiteboard',
    body: 'Share a Google Slides or PowerPoint link to have it presented, with Excalidraw sketches to explain ideas.',
  },
  {
    icon: MessagesSquare,
    title: 'Interrupt any time',
    body: 'Visitors just talk. The presenter stops, answers, shows it on screen if useful, and carries on.',
  },
  {
    icon: Code2,
    title: 'On your website',
    body: 'One script tag adds a launcher to your site. Sessions open right on the page, Intercom-style.',
  },
];

const STEPS = [
  {
    title: 'Describe the goal',
    body: 'A product URL or slide deck, plus what the audience should take away.',
  },
  {
    title: 'Share or embed',
    body: 'Send the link, or add the widget to your website with one line.',
  },
  {
    title: 'Watch it present',
    body: 'Each visitor gets a live, private session. Transcripts land in your dashboard.',
  },
];

export default function Home() {
  return (
    <>
      <SiteNav />
      <main className={styles.main}>
        <section className={styles.hero}>
          <Badge tone="success" dot pulse>
            Live AI presenters
          </Badge>
          <h1 className={styles.title}>
            Your product demo,
            <br />
            <span>presented live by AI</span>
          </h1>
          <p className={styles.lead}>
            Give a presenter a goal. When someone opens your link, it joins the call, shares its
            screen and walks them through your product or deck - talking, pointing and answering
            questions like a real person.
          </p>
          <div className="row-center">
            <Button
              href="/dashboard/presenters/new"
              variant="primary"
              size="lg"
              iconRight={ArrowRight}
            >
              Create a presenter
            </Button>
            <Button href="/dashboard" size="lg">
              Open dashboard
            </Button>
          </div>
        </section>

        <section className={styles.steps}>
          {STEPS.map((s, i) => (
            <div key={s.title} className={styles.step}>
              <span className={styles.stepNumber}>{i + 1}</span>
              <h3>{s.title}</h3>
              <p>{s.body}</p>
            </div>
          ))}
        </section>

        <section className={styles.features}>
          {FEATURES.map((f) => (
            <div key={f.title} className={styles.feature}>
              <span className={styles.featureIcon}>
                <f.icon size={18} aria-hidden />
              </span>
              <h3>{f.title}</h3>
              <p>{f.body}</p>
            </div>
          ))}
        </section>
      </main>
      <footer className={styles.footer}>
        Onboarding AI · open source ·{' '}
        <a href="https://github.com/saifulbabo67646/onboarding-ai">GitHub</a>
      </footer>
    </>
  );
}
