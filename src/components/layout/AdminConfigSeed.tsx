import type React from 'react'
import { useAutoLoadConfig } from '@/hooks/useAutoLoadConfig'

/**
 * Admin-only config seeding.
 *
 * AppShell mounts this lazily on /admin routes: monitor and home pages no
 * longer download js-yaml/configYaml or issue GET /configs/raw for a form
 * they cannot use. The seed guard itself is unchanged — the first admin
 * page still seeds the working config before Create/Apply can run.
 */
export const AdminConfigSeed: React.FC = () => {
  useAutoLoadConfig()
  return null
}
