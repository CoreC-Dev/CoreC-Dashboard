import type React from 'react'
import { useAutoLoadConfig } from '@/hooks/useAutoLoadConfig'

/**
 * Admin-only config seeding.
 *
 * AppShell mounts this lazily on /admin routes: monitor and home pages do
 * not download js-yaml/configYaml or issue GET /configs/raw. The first
 * admin page seeds the working config before Create/Apply can run.
 */
export const AdminConfigSeed: React.FC = () => {
  useAutoLoadConfig()
  return null
}
