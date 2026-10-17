'use client';

import { BookOpen, LogOut } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Avatar, Menu, MenuDivider, MenuItem } from '@/components/ui';
import { authClient } from '@/lib/auth-client';
import type { Viewer } from '@/lib/types';
import styles from './AppShell.module.css';

export function UserMenu({ user }: { user: Viewer['user'] }) {
  const router = useRouter();
  return (
    <Menu
      label="Account"
      placement="top"
      trigger={({ open, toggle }) => (
        <button
          type="button"
          className={styles.userButton}
          onClick={toggle}
          aria-expanded={open}
          aria-haspopup="menu"
        >
          <Avatar name={user.name || user.email} size="sm" brand />
          <span className={styles.userText}>
            <span className={styles.userName}>{user.name}</span>
            <span className={styles.userEmail}>{user.email}</span>
          </span>
        </button>
      )}
    >
      {(close) => (
        <>
          <MenuItem
            icon={<BookOpen size={14} />}
            onSelect={() => {
              close();
              window.open('https://github.com/saifulbabo67646/onboarding-ai', '_blank');
            }}
          >
            Documentation
          </MenuItem>
          <MenuDivider />
          <MenuItem
            icon={<LogOut size={14} />}
            onSelect={async () => {
              close();
              await authClient.signOut();
              router.push('/login');
              router.refresh();
            }}
          >
            Sign out
          </MenuItem>
        </>
      )}
    </Menu>
  );
}
