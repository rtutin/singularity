import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Box, Button, CircularProgress } from '@material-ui/core';
import { BigNumber, Contract } from 'ethers';
import { formatUnits, parseUnits } from 'ethers/lib/utils';
import ERC20_ABI from 'constants/abis/erc20.json';
import RITUAL_MASTERCHEF_ABI from 'constants/abis/ritual-masterchef.json';
import {
  RITUAL_MASTERCHEF_ADDRESS,
  RITUAL_FARM_POOLS,
  RITUAL_TOTAL_DAILY_ASH,
  RITUAL_BLOCK_TIME_SECONDS,
  RitualFarmPool,
} from 'constants/ritualFarms';
import { useActiveWeb3React, useConnectWallet } from 'hooks';
import { useContract } from 'hooks/useContract';
import { useBlockNumber } from 'state/application/hooks';
import { RPC_PROVIDERS } from 'constants/providers';
import './RitualFarmPage.scss';

/**
 * Ritual emission farms page.
 *
 * Reads pool/user state from the v1 MasterChef on Cyberia.
 * Lets users approve, deposit, withdraw, and harvest (via deposit(_, 0)).
 */

const ZERO = BigNumber.from(0);
const ACC_PRECISION = BigNumber.from('1000000000000'); // 1e12 — MasterChef internal scale

interface PoolState {
  allocPoint: BigNumber;
  totalStaked: BigNumber; // chef LP balance
  userStaked: BigNumber;
  pending: BigNumber; // pending value as of lastSyncBlock (used as a fallback)
  userBalance: BigNumber;
  allowance: BigNumber;
  decimals: number;
  // Fields needed to project pending forward between RPC reads.
  lastRewardBlock: BigNumber;
  accRewardPerShare: BigNumber;
  rewardDebt: BigNumber;
}

interface Globals {
  totalAllocPoint: BigNumber;
  rewardPerBlock: BigNumber;
  // Anchor for the virtual-block clock.
  lastBlockNumber: BigNumber;
  lastBlockTimestampMs: number;
  blockTimeMs: number; // estimated block interval
}

const RitualFarmPage: React.FC = () => {
  const { chainId, account } = useActiveWeb3React();
  const { connectWallet } = useConnectWallet(false);
  const blockNumber = useBlockNumber();

  const chefAddress = chainId ? RITUAL_MASTERCHEF_ADDRESS[chainId] : undefined;
  const pools = useMemo<RitualFarmPool[]>(
    () => (chainId ? RITUAL_FARM_POOLS[chainId] ?? [] : []),
    [chainId],
  );

  const chef = useContract(chefAddress, RITUAL_MASTERCHEF_ABI);

  const [globals, setGlobals] = useState<Globals | null>(null);
  const [poolStates, setPoolStates] = useState<Record<number, PoolState>>({});
  const [refreshKey, setRefreshKey] = useState(0);
  const [busyPid, setBusyPid] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Frame counter — bumped 5×/sec to drive smooth pending-reward animation.
  // Reading `tick` keeps it in the dependency graph so the projector below
  // recomputes on every interval tick.
  const [tick, setTick] = useState(0);
  void tick;

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  // Refresh from chain on every new block.
  useEffect(() => {
    if (!blockNumber) return;
    setRefreshKey((k) => k + 1);
  }, [blockNumber]);

  // Smooth tick for live pending-reward projection.
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 200);
    return () => clearInterval(id);
  }, []);

  // Load globals + per-pool state from the chain's RPC (works irrespective of
  // which network the wallet is currently on).
  useEffect(() => {
    let cancelled = false;
    if (!chainId || !chefAddress) return;

    const rpc = RPC_PROVIDERS[chainId];
    if (!rpc) return;
    const chefRead = new Contract(chefAddress, RITUAL_MASTERCHEF_ABI, rpc);

    (async () => {
      try {
        const [totalAlloc, rpb, latestBlock] = await Promise.all([
          chefRead.totalAllocPoint(),
          chefRead.rewardPerBlock(),
          rpc.getBlock('latest'),
        ]);
        if (cancelled) return;
        setGlobals((prev) => {
          // Estimate block time from successive observations; default 1 s.
          let blockTimeMs = prev?.blockTimeMs ?? 1000;
          if (prev && latestBlock.number > prev.lastBlockNumber.toNumber()) {
            const dn = latestBlock.number - prev.lastBlockNumber.toNumber();
            const dt = Date.now() - prev.lastBlockTimestampMs;
            if (dn > 0 && dt > 0) {
              const sample = dt / dn;
              // Light EMA so a single laggy refresh doesn't ruin the estimate.
              blockTimeMs = Math.max(
                100,
                Math.min(10_000, prev.blockTimeMs * 0.7 + sample * 0.3),
              );
            }
          }
          return {
            totalAllocPoint: totalAlloc,
            rewardPerBlock: rpb,
            lastBlockNumber: BigNumber.from(latestBlock.number),
            lastBlockTimestampMs: Date.now(),
            blockTimeMs,
          };
        });
      } catch {
        // chef may not be deployed yet on this network
      }

      const next: Record<number, PoolState> = {};
      for (const pool of pools) {
        try {
          const lp = new Contract(pool.lpToken, ERC20_ABI, rpc);
          const [info, user, totalStaked, decimals] = await Promise.all([
            chefRead.poolInfo(pool.pid),
            account
              ? chefRead.userInfo(pool.pid, account)
              : Promise.resolve([ZERO, ZERO]),
            lp.balanceOf(chefAddress),
            lp.decimals().catch(() => 18),
          ]);
          const pending = account
            ? await chefRead
                .pendingReward(pool.pid, account)
                .catch(() => ZERO)
            : ZERO;
          const userBalance = account
            ? await lp.balanceOf(account).catch(() => ZERO)
            : ZERO;
          const allowance = account
            ? await lp.allowance(account, chefAddress).catch(() => ZERO)
            : ZERO;
          next[pool.pid] = {
            allocPoint: info.allocPoint ?? info[1],
            totalStaked,
            userStaked: user.amount ?? user[0],
            pending,
            userBalance,
            allowance,
            decimals,
            lastRewardBlock: info.lastRewardBlock ?? info[2],
            accRewardPerShare: info.accRewardPerShare ?? info[3],
            rewardDebt: user.rewardDebt ?? user[1],
          };
        } catch {
          // pool not on-chain yet; skip
        }
      }
      if (!cancelled) setPoolStates(next);
    })();

    return () => {
      cancelled = true;
    };
  }, [chainId, chefAddress, pools, account, refreshKey]);

  const handleApprove = async (pool: RitualFarmPool): Promise<boolean> => {
    if (!chef || !chefAddress || !account) return false;
    setBusyPid(pool.pid);
    setError(null);
    try {
      const ethers = await import('ethers');
      const lp = new ethers.Contract(
        pool.lpToken,
        ERC20_ABI,
        chef.signer ?? chef.provider,
      );
      const tx = await lp.approve(chefAddress, ethers.constants.MaxUint256);
      await tx.wait();
      refresh();
      return true;
    } catch (e: any) {
      setError(e?.message ?? String(e));
      return false;
    } finally {
      setBusyPid(null);
    }
  };

  const handleDeposit = async (
    pool: RitualFarmPool,
    amount: string,
  ): Promise<boolean> => {
    if (!chef || !account || !amount) return false;
    setBusyPid(pool.pid);
    setError(null);
    try {
      const decimals = poolStates[pool.pid]?.decimals ?? 18;
      const value = parseUnits(amount, decimals);
      const tx = await chef.deposit(pool.pid, value);
      await tx.wait();
      refresh();
      return true;
    } catch (e: any) {
      setError(e?.message ?? String(e));
      return false;
    } finally {
      setBusyPid(null);
    }
  };

  const handleWithdraw = async (
    pool: RitualFarmPool,
    amount: string,
  ): Promise<boolean> => {
    if (!chef || !account || !amount) return false;
    setBusyPid(pool.pid);
    setError(null);
    try {
      const decimals = poolStates[pool.pid]?.decimals ?? 18;
      const value = parseUnits(amount, decimals);
      const tx = await chef.withdraw(pool.pid, value);
      await tx.wait();
      refresh();
      return true;
    } catch (e: any) {
      setError(e?.message ?? String(e));
      return false;
    } finally {
      setBusyPid(null);
    }
  };

  const handleHarvest = async (pool: RitualFarmPool): Promise<boolean> => {
    if (!chef || !account) return false;
    setBusyPid(pool.pid);
    setError(null);
    try {
      const tx = await chef.deposit(pool.pid, 0);
      await tx.wait();
      refresh();
      return true;
    } catch (e: any) {
      setError(e?.message ?? String(e));
      return false;
    } finally {
      setBusyPid(null);
    }
  };

  if (!chefAddress) {
    return (
      <Box className='ritualFarmPage'>
        <Box className='ritualFarmContainer'>
          <Box className='ritualFarmHeader'>
            <h3>Ritual Farms</h3>
            <div className='subtitle'>
              Switch to Cyberia (chainId 49406) to see emission pools.
            </div>
          </Box>
        </Box>
      </Box>
    );
  }

  return (
    <Box className='ritualFarmPage'>
      <Box className='ritualFarmContainer'>
        <Box className='ritualFarmHeader'>
          <h3>Ritual Farms</h3>
          <div className='subtitle'>
            {RITUAL_TOTAL_DAILY_ASH} ASH minted per day, split between pools by
            allocPoint. Block ≈ {RITUAL_BLOCK_TIME_SECONDS}s.
          </div>
        </Box>

        {error && <Box className='ritualFarmError'>{error}</Box>}

        {pools.map((pool) => {
          const st = poolStates[pool.pid];
          const allocShare =
            globals && st && globals.totalAllocPoint.gt(0)
              ? st.allocPoint.mul(10000).div(globals.totalAllocPoint).toNumber() /
                100
              : 0;
          const dailyAshForPool =
            allocShare > 0 ? (RITUAL_TOTAL_DAILY_ASH * allocShare) / 100 : 0;
          const livePending = computeLivePending(st, globals);
          return (
            <PoolCard
              key={pool.pid}
              pool={pool}
              state={st}
              livePending={livePending}
              allocSharePct={allocShare}
              dailyAsh={dailyAshForPool}
              account={account ?? null}
              busy={busyPid === pool.pid}
              onConnect={() => connectWallet()}
              onApprove={() => handleApprove(pool)}
              onDeposit={(v) => handleDeposit(pool, v)}
              onWithdraw={(v) => handleWithdraw(pool, v)}
              onHarvest={() => handleHarvest(pool)}
            />
          );
        })}

        <div className='ritualFarmFooter'>MasterChef: {chefAddress}</div>
      </Box>
    </Box>
  );
};

interface PoolCardProps {
  pool: RitualFarmPool;
  state?: PoolState;
  livePending: BigNumber | undefined;
  allocSharePct: number;
  dailyAsh: number;
  account: string | null;
  busy: boolean;
  onConnect: () => void;
  onApprove: () => Promise<boolean>;
  onDeposit: (amount: string) => Promise<boolean>;
  onWithdraw: (amount: string) => Promise<boolean>;
  onHarvest: () => Promise<boolean>;
}

const PoolCard: React.FC<PoolCardProps> = ({
  pool,
  state,
  livePending,
  allocSharePct,
  dailyAsh,
  account,
  busy,
  onConnect,
  onApprove,
  onDeposit,
  onWithdraw,
  onHarvest,
}) => {
  const [depositValue, setDepositValue] = useState('');
  const [withdrawValue, setWithdrawValue] = useState('');

  const decimals = state?.decimals ?? 18;
  const fmt = (b?: BigNumber) =>
    b ? Number(formatUnits(b, decimals)).toFixed(6) : '—';
  const fmtAsh = (b?: BigNumber) =>
    b ? Number(formatUnits(b, 18)).toFixed(6) : '—';

  const depositBn = parseAmount(depositValue, decimals);
  const needsApprove = !!state && depositBn.gt(0) && state.allowance.lt(depositBn);

  return (
    <Box className='poolCard'>
      <Box className='poolCardHeader'>
        <Box>
          <div className='poolTitle'>
            {pool.label}
            <span className='pidTag'>pid={pool.pid}</span>
          </div>
          <div className='poolDescription'>{pool.description}</div>
        </Box>
        <Box className='poolEmission'>
          <div className='alloc'>{allocSharePct.toFixed(0)}% emission</div>
          <div className='rate'>≈ {dailyAsh.toFixed(2)} ASH/day</div>
        </Box>
      </Box>

      <Box className='poolStats'>
        <Stat label='Total staked' value={fmt(state?.totalStaked)} />
        <Stat label='Your stake' value={fmt(state?.userStaked)} />
        <Stat label='Wallet balance' value={fmt(state?.userBalance)} />
        <Stat
          label='Pending ASH'
          value={fmtAsh(livePending ?? state?.pending)}
        />
      </Box>

      {!account ? (
        <Box className='poolActionsConnect'>
          <Button onClick={onConnect} className='actionBtn' style={{ minWidth: 180 }}>
            Connect wallet
          </Button>
        </Box>
      ) : (
        <Box className='poolActions'>
          <Box className='actionRow'>
            <Box className='amountField'>
              <input
                type='text'
                value={depositValue}
                onChange={(e) => setDepositValue(sanitize(e.target.value))}
                placeholder={`Deposit ${pool.label}`}
                inputMode='decimal'
              />
            </Box>
            <Button
              className='secondaryBtn'
              onClick={() =>
                state && setDepositValue(formatUnits(state.userBalance, decimals))
              }
            >
              Max
            </Button>
            {needsApprove ? (
              <Button
                className='actionBtn'
                disabled={busy}
                onClick={() => onApprove()}
              >
                {busy ? <CircularProgress size={18} /> : 'Approve'}
              </Button>
            ) : (
              <Button
                className='actionBtn'
                disabled={busy || depositBn.isZero()}
                onClick={async () => {
                  const ok = await onDeposit(depositValue);
                  if (ok) setDepositValue('');
                }}
              >
                {busy ? <CircularProgress size={18} /> : 'Deposit'}
              </Button>
            )}
          </Box>

          <Box className='actionRow'>
            <Box className='amountField'>
              <input
                type='text'
                value={withdrawValue}
                onChange={(e) => setWithdrawValue(sanitize(e.target.value))}
                placeholder='Withdraw'
                inputMode='decimal'
              />
            </Box>
            <Button
              className='secondaryBtn'
              onClick={() =>
                state && setWithdrawValue(formatUnits(state.userStaked, decimals))
              }
            >
              Max
            </Button>
            <Button
              className='secondaryBtn'
              disabled={busy || parseAmount(withdrawValue, decimals).isZero()}
              onClick={async () => {
                const ok = await onWithdraw(withdrawValue);
                if (ok) setWithdrawValue('');
              }}
            >
              {busy ? <CircularProgress size={18} /> : 'Withdraw'}
            </Button>
            <Button
              className='actionBtn'
              disabled={
                busy ||
                !(livePending ?? state?.pending) ||
                (livePending ?? state?.pending ?? ZERO).isZero()
              }
              onClick={() => onHarvest()}
            >
              {busy ? <CircularProgress size={18} /> : 'Harvest'}
            </Button>
          </Box>
        </Box>
      )}
    </Box>
  );
};

const Stat: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <Box className='statCell'>
    <div className='statLabel'>{label}</div>
    <div className='statValue'>{value}</div>
  </Box>
);

/**
 * Mirror MasterChef.pendingReward but with a virtual current block,
 * interpolated from the wall clock since the last RPC sync. Lets us animate
 * the pending counter smoothly between blocks without spamming the RPC.
 */
function computeLivePending(
  st: PoolState | undefined,
  globals: Globals | null,
): BigNumber | undefined {
  if (!st || !globals) return undefined;
  if (globals.totalAllocPoint.isZero()) return st.pending;
  if (st.userStaked.isZero()) return st.pending;

  // Virtual current block = lastBlockNumber + elapsed / blockTime.
  const elapsedMs = Math.max(0, Date.now() - globals.lastBlockTimestampMs);
  const elapsedBlocks = Math.floor(elapsedMs / globals.blockTimeMs);
  const virtualBlock = globals.lastBlockNumber.add(elapsedBlocks);

  if (virtualBlock.lte(st.lastRewardBlock)) {
    // No new blocks since last on-chain pool update.
    return st.userStaked
      .mul(st.accRewardPerShare)
      .div(ACC_PRECISION)
      .sub(st.rewardDebt);
  }

  if (st.totalStaked.isZero()) {
    return st.pending;
  }

  const blocks = virtualBlock.sub(st.lastRewardBlock);
  const reward = blocks
    .mul(globals.rewardPerBlock)
    .mul(st.allocPoint)
    .div(globals.totalAllocPoint);
  const accPerShare = st.accRewardPerShare.add(
    reward.mul(ACC_PRECISION).div(st.totalStaked),
  );
  const pending = st.userStaked
    .mul(accPerShare)
    .div(ACC_PRECISION)
    .sub(st.rewardDebt);
  return pending.lt(0) ? ZERO : pending;
}

function parseAmount(v: string, decimals: number): BigNumber {
  if (!v) return BigNumber.from(0);
  try {
    return parseUnits(v, decimals);
  } catch {
    return BigNumber.from(0);
  }
}

function sanitize(v: string): string {
  // accept digits and a single dot
  return v.replace(/[^\d.]/g, '').replace(/(\..*)\./g, '$1');
}

export default RitualFarmPage;
