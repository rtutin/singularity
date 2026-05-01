/**
 * Cyberia ritual emission contracts.
 *
 * MasterChef on Cyberia (chainId 49406) mints ASH at 437 ASH/day total,
 * split between pools by allocPoint.
 *
 * Source: crypto/hardhat/deployments/cyberia-ash-emission.json
 */

import { ChainId } from '@uniswap/sdk';

export const RITUAL_MASTERCHEF_ADDRESS: { [chainId: number]: string } = {
  [ChainId.CYBERIA]: '0xd540DEa828567160FFDe5e792ca359aDD1f6B03D',
};

/** Approx daily emission. 437 ASH/day across all pools combined. */
export const RITUAL_TOTAL_DAILY_ASH = 437;

/** Block time on Cyberia (~1 s) — used to convert rewardPerBlock to per-day. */
export const RITUAL_BLOCK_TIME_SECONDS = 1;

export interface RitualFarmPool {
  pid: number;
  /** LP token address (or ASH itself for the solo pool). */
  lpToken: string;
  /** Display label. */
  label: string;
  /** Short hint shown next to the label. */
  description: string;
  /** Whether the staked token is itself the reward token. */
  isSolo: boolean;
}

export const RITUAL_FARM_POOLS: { [chainId: number]: RitualFarmPool[] } = {
  [ChainId.CYBERIA]: [
    {
      pid: 0,
      lpToken: '0x992Fca0a89DD95afb17751f6CC233Adb9B089df5', // ASH
      label: 'ASH',
      description: 'Stake ASH directly',
      isSolo: true,
    },
    {
      pid: 1,
      lpToken: '0xB3b6d8f38beC836e5629848223f1848A324188f0', // ASH/WCYBER LP
      label: 'ASH / WCYBER LP',
      description: 'Stake LP from the ASH/WCYBER pair',
      isSolo: false,
    },
  ],
};
