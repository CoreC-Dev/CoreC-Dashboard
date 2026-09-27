import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useConnectionStore } from '@/stores/connectionStore'
import type { WriteCommand } from '@/types/models'
import * as api from '../endpoints'

export function useServerInfo() {
  const isConnected = useConnectionStore((s) => s.isConnected)
  return useQuery({
    queryKey: ['serverInfo'],
    queryFn: api.getServerInfo,
    enabled: isConnected,
    refetchInterval: 30000,
  })
}

export function useHealthReady() {
  const isConnected = useConnectionStore((s) => s.isConnected)
  return useQuery({
    queryKey: ['healthReady'],
    queryFn: api.getHealthReady,
    enabled: isConnected,
    refetchInterval: 5000,
  })
}

export function useDrivers() {
  const isConnected = useConnectionStore((s) => s.isConnected)
  return useQuery({
    queryKey: ['drivers'],
    queryFn: api.getDrivers,
    enabled: isConnected,
    refetchInterval: 2000,
  })
}

export function useDriver(name: string) {
  const isConnected = useConnectionStore((s) => s.isConnected)
  return useQuery({
    queryKey: ['driver', name],
    queryFn: () => api.getDriver(name),
    enabled: isConnected && !!name,
    refetchInterval: 2000,
  })
}

export function useDriverTags(name: string) {
  const isConnected = useConnectionStore((s) => s.isConnected)
  return useQuery({
    queryKey: ['driverTags', name],
    queryFn: () => api.getDriverTags(name),
    enabled: isConnected && !!name,
    refetchInterval: 1000,
  })
}

export function useTransports() {
  const isConnected = useConnectionStore((s) => s.isConnected)
  return useQuery({
    queryKey: ['transports'],
    queryFn: api.getTransports,
    enabled: isConnected,
    refetchInterval: 2000,
  })
}

export function useTags() {
  const isConnected = useConnectionStore((s) => s.isConnected)
  return useQuery({
    queryKey: ['tags'],
    queryFn: api.getTags,
    enabled: isConnected,
    refetchInterval: 2000,
  })
}

export function useRules() {
  const isConnected = useConnectionStore((s) => s.isConnected)
  return useQuery({
    queryKey: ['rules'],
    queryFn: api.getRules,
    enabled: isConnected,
    refetchInterval: 5000,
  })
}

export function useStats() {
  const isConnected = useConnectionStore((s) => s.isConnected)
  return useQuery({
    queryKey: ['stats'],
    queryFn: api.getStats,
    enabled: isConnected,
    refetchInterval: 2000,
  })
}

export function useConfigs() {
  const isConnected = useConnectionStore((s) => s.isConnected)
  return useQuery({
    queryKey: ['configs'],
    queryFn: api.getConfigs,
    enabled: isConnected,
  })
}

export function useDeadLetters() {
  const isConnected = useConnectionStore((s) => s.isConnected)
  return useQuery({
    queryKey: ['deadLetters'],
    queryFn: api.getDeadLetters,
    enabled: isConnected,
    refetchInterval: 4000,
  })
}

// Mutations
export function useWriteTag() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (cmd: WriteCommand) => api.writeTag(cmd),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tags'] })
      queryClient.invalidateQueries({ queryKey: ['deadLetters'] })
    },
  })
}

export function useToggleRule() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ index, disabled }: { index: number; disabled: boolean }) =>
      api.toggleRule(index, disabled),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rules'] })
    },
  })
}

export function usePatchConfig() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: { 'log-level'?: string }) => api.patchConfigs(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['configs'] })
    },
  })
}

export function useUpdateConfig() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: { path?: string; payload?: string }) => api.updateConfigs(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['configs'] })
    },
  })
}
