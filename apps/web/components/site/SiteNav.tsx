import { Button, Logo } from '@/components/ui';
import styles from './SiteNav.module.css';

export function SiteNav() {
  return (
    <header className={styles.nav}>
      <div className={styles.inner}>
        <Logo />
        <nav className="row">
          <Button href="/dashboard" variant="ghost">
            Sign in
          </Button>
          <Button href="/dashboard/presenters/new" variant="primary">
            Get started
          </Button>
        </nav>
      </div>
    </header>
  );
}
