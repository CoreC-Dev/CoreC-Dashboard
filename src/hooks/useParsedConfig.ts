import { useMemo } from 'react'
import { parseConfigYaml } from '@/lib/configYaml'
import type { CoreCConfig } from '@/types/config'

/** Parse raw YAML into config, returning null on missing/malformed input.
 *  Wraps `parseConfigYaml` in try/catch so malformed YAML degrades to null
 *  instead of crashing the page. Memoized on `rawYaml`. */
export function useParsedConfig(rawYaml: string | undefined | null): CoreCConfig | null {
  return useMemo(() => {
    if (!rawYaml) return null
    try {
      return parseConfigYaml(rawYaml)
    } catch {
      return null
    }
  }, [rawYaml])
}
