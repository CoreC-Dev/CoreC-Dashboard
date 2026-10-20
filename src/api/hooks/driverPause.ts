import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as api from '@/api/endpoints'
import { useConnectionStore } from '@/stores/connectionStore'

/**
 * Driver collection pause/resume hooks (audit RES-4, backend 2d29981).
 *
 * Scheduler-level switch: config and connection untouched; tasks skip
 * ticks while paused and resume at the next tick. Split out of the
 * hooks barrel to respect the custom-lint God-file ceiling — import
 * from '@/api/hooks' as usual (re-exported below).
 */

/** Paused-driver membership: polled; the detail page's button reflects it. */
export function usePausedDrivers() {
  const isConnected = useConnectionStore((s) => s.isConnected)
  return useQuery({
    queryKey: ['pausedDrivers'],
    queryFn: () => api.getPausedDrivers(),
    enabled: isConnected,
    refetchInterval: 10_000,
  })
}

/** Pause mutations invalidate the paused list + the driver's queries. */
export function usePauseDriver(name: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => api.pauseDriver(name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pausedDrivers'] })
      queryClient.invalidateQueries({ queryKey: ['driver', name] })
    },
  })
}

/** Resume mutations mirror the pause invalidations. */
export function useResumeDriver(name: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => api.resumeDriver(name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pausedDrivers'] })
      queryClient.invalidateQueries({ queryKey: ['driver', name] })
    },
  })
}
