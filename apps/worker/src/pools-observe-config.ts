export type PoolObserveConfig = {
  databasePath: string
  rpcUrl?: string
}

export function readPoolObserveConfig(environment: NodeJS.ProcessEnv = process.env): PoolObserveConfig {
  return {
    databasePath: environment.LP_MINE_DATABASE_PATH ?? './data/robinhood-univ3.sqlite',
    ...(environment.ROBINHOOD_RPC_URL ? { rpcUrl: environment.ROBINHOOD_RPC_URL } : {}),
  }
}
