import { Play } from 'lucide-react';
import Link from 'next/link';
import styles from './Logo.module.css';

export function Logo({ href = '/' }: { href?: string }) {
  return (
    <Link href={href} className={styles.logo}>
      <span className={styles.mark} aria-hidden>
        <Play size={12} fill="currentColor" />
      </span>
      Onboarding AI
    </Link>
  );
}
