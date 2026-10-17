'use client';

import { Check, ChevronsUpDown, Plus, Settings } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Avatar, Menu, MenuDivider, MenuItem, MenuLabel } from '@/components/ui';
import { authClient } from '@/lib/auth-client';
import type { Viewer } from '@/lib/types';
import styles from './AppShell.module.css';

export function WorkspaceSwitcher({ viewer }: { viewer: Viewer }) {
  const router = useRouter();

  async function switchTo(id: string) {
    await authClient.organization.setActive({ organizationId: id });
    router.push('/dashboard');
    router.refresh();
  }

  return (
    <Menu
      label="Workspaces"
      trigger={({ open, toggle }) => (
        <button
          type="button"
          className={styles.workspaceButton}
          onClick={toggle}
          aria-expanded={open}
          aria-haspopup="menu"
        >
          <Avatar name={viewer.workspace.name} size="sm" />
          <span className={styles.workspaceName}>{viewer.workspace.name}</span>
          <ChevronsUpDown size={14} aria-hidden />
        </button>
      )}
    >
      {(close) => (
        <>
          <MenuLabel>Workspaces</MenuLabel>
          {viewer.workspaces.map((w) => (
            <MenuItem
              key={w.id}
              selected={w.id === viewer.workspace.id}
              icon={
                w.id === viewer.workspace.id ? <Check size={14} /> : <span style={{ width: 14 }} />
              }
              onSelect={() => {
                close();
                if (w.id !== viewer.workspace.id) void switchTo(w.id);
              }}
            >
              {w.name}
            </MenuItem>
          ))}
          <MenuDivider />
          <MenuItem
            icon={<Settings size={14} />}
            onSelect={() => {
              close();
              router.push('/dashboard/settings');
            }}
          >
            Workspace settings
          </MenuItem>
          <MenuItem
            icon={<Plus size={14} />}
            onSelect={() => {
              close();
              router.push('/dashboard/workspaces/new');
            }}
          >
            New workspace
          </MenuItem>
        </>
      )}
    </Menu>
  );
}
