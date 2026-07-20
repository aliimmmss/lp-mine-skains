import type { SourceStamped } from '@lp-mine/core'

export type WorkerHealth = SourceStamped<{
  service: 'lp-mine-worker'
  mode: 'read-only'
}>

export function describeWorker(): Pick<WorkerHealth['value'], 'service' | 'mode'> {
  return {
    service: 'lp-mine-worker',
    mode: 'read-only',
  }
}
