import React, { useEffect, useMemo, useState } from 'react';
import { Box, Button } from '@material-ui/core';
import { SwapVert } from '@material-ui/icons';
import { ETHER, WETH } from '@uniswap/sdk';
import { BigNumber, Contract } from 'ethers';
import { formatUnits, parseUnits } from 'ethers/lib/utils';
import { useActiveWeb3React, useConnectWallet } from 'hooks';
import { useWETHContract } from 'hooks/useContract';
import { NumericalInput } from 'components';
import { useTranslation } from 'react-i18next';
import { useBlockNumber } from 'state/application/hooks';
import { RPC_PROVIDERS } from 'constants/providers';
import ERC20_ABI from 'constants/abis/erc20.json';
import 'pages/styles/swap.scss';

/**
 * Dedicated native ↔ wrapped-native conversion page.
 *
 * Talks to the WETH9-style wrapped-native contract directly via ethers
 * (deposit() to wrap, withdraw(amount) to unwrap). Balances are read
 * straight from the chain on every new block to avoid stale-state issues.
 */
const WrapPage: React.FC = () => {
  const { chainId, account } = useActiveWeb3React();
  const { connectWallet } = useConnectWallet(false);
  const { t } = useTranslation();
  const blockNumber = useBlockNumber();

  // true = CYBER -> WCYBER (wrap), false = WCYBER -> CYBER (unwrap)
  const [isWrap, setIsWrap] = useState(true);
  const [typedValue, setTypedValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const native = chainId ? ETHER[chainId] : undefined;
  const wrapped = chainId ? WETH[chainId] : undefined;

  const inputSymbol = isWrap ? native?.symbol : wrapped?.symbol;
  const outputSymbol = isWrap ? wrapped?.symbol : native?.symbol;

  const wethContract = useWETHContract();

  // Always read balances from the chain's own RPC (works even when the
  // wallet is connected to a different network), every new block.
  const [nativeBalance, setNativeBalance] = useState<BigNumber>(BigNumber.from(0));
  const [wrappedBalance, setWrappedBalance] = useState<BigNumber>(BigNumber.from(0));

  useEffect(() => {
    let cancelled = false;
    if (!account || !chainId || !wrapped?.address) return;
    const rpc = RPC_PROVIDERS[chainId];
    if (!rpc) return;
    (async () => {
      try {
        const wrappedRead = new Contract(wrapped.address, ERC20_ABI, rpc);
        const [n, w] = await Promise.all([
          rpc.getBalance(account),
          wrappedRead.balanceOf(account),
        ]);
        if (!cancelled) {
          setNativeBalance(n);
          setWrappedBalance(w);
        }
      } catch (e) {
        // ignore — RPC hiccup, will retry next block
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [account, chainId, wrapped?.address, blockNumber]);

  const inputBalance = isWrap ? nativeBalance : wrappedBalance;

  const inputAmount = useMemo(() => {
    if (!typedValue) return null;
    try {
      return parseUnits(typedValue, 18);
    } catch {
      return null;
    }
  }, [typedValue]);

  const sufficient = !!inputAmount && inputBalance.gte(inputAmount);

  const buttonLabel = useMemo(() => {
    if (!account) return t('connectWallet');
    if (busy) return isWrap ? `Wrapping ${inputSymbol}…` : `Unwrapping ${inputSymbol}…`;
    if (!inputAmount || inputAmount.isZero()) return 'Enter amount';
    if (!sufficient) return `Insufficient ${inputSymbol}`;
    return isWrap ? `Wrap ${inputSymbol}` : `Unwrap ${inputSymbol}`;
  }, [account, busy, inputSymbol, inputAmount, sufficient, isWrap, t]);

  const handleMax = () => {
    // Leave a small dust reserve when wrapping native (gas).
    if (isWrap) {
      const reserve = parseUnits('0.005', 18);
      const max = inputBalance.gt(reserve) ? inputBalance.sub(reserve) : BigNumber.from(0);
      setTypedValue(formatUnits(max, 18));
    } else {
      setTypedValue(formatUnits(inputBalance, 18));
    }
  };

  const flip = () => {
    setIsWrap((v) => !v);
    setTypedValue('');
    setError(null);
  };

  const handleClick = async () => {
    setError(null);
    if (!account) {
      connectWallet();
      return;
    }
    if (!wethContract || !inputAmount || inputAmount.isZero() || !sufficient) return;
    setBusy(true);
    try {
      if (isWrap) {
        const tx = await wethContract.deposit({ value: inputAmount });
        await tx.wait();
      } else {
        const tx = await wethContract.withdraw(inputAmount);
        await tx.wait();
      }
      setTypedValue('');
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  };

  const disabled =
    !account ? false : !inputAmount || inputAmount.isZero() || !sufficient || busy;

  return (
    <Box width='100%' mb={3} id='wrap-page'>
      <Box
        sx={{
          maxWidth: 560,
          margin: '24px auto',
          padding: 3,
          borderRadius: 16,
          bgcolor: '#1b1e29',
          border: '1px solid #242938',
        }}
      >
        <Box
          mb={2}
          display='flex'
          alignItems='center'
          justifyContent='space-between'
        >
          <h5 style={{ margin: 0, color: '#fff' }}>{t('wrap')}</h5>
          <small className='text-secondary'>
            {isWrap
              ? `${native?.symbol} → ${wrapped?.symbol}`
              : `${wrapped?.symbol} → ${native?.symbol}`}
          </small>
        </Box>

        <Box
          className='swapBox'
          sx={{ padding: 2, borderRadius: 12, bgcolor: '#12131a' }}
        >
          <Box
            display='flex'
            justifyContent='space-between'
            alignItems='center'
            mb={1}
          >
            <small className='text-secondary'>{t('from')}</small>
            <Box display='flex' alignItems='center' gridGap={8}>
              <small className='text-secondary'>
                {t('balance')}: {Number(formatUnits(inputBalance, 18)).toFixed(6)}
              </small>
              <Button
                size='small'
                onClick={handleMax}
                style={{ minWidth: 0, padding: '2px 8px', fontSize: 12 }}
              >
                {t('max')}
              </Button>
            </Box>
          </Box>
          <Box
            display='flex'
            justifyContent='space-between'
            alignItems='center'
          >
            <NumericalInput
              value={typedValue}
              onUserInput={setTypedValue}
              fontSize={24}
              align='left'
              placeholder='0.0'
            />
            <Box
              sx={{
                minWidth: 80,
                textAlign: 'right',
                color: '#fff',
                fontWeight: 600,
              }}
            >
              {inputSymbol}
            </Box>
          </Box>
        </Box>

        <Box display='flex' justifyContent='center' my={1}>
          <Button
            onClick={flip}
            style={{
              minWidth: 0,
              padding: 8,
              borderRadius: '50%',
              background: '#242938',
            }}
          >
            <SwapVert style={{ color: '#fff' }} />
          </Button>
        </Box>

        <Box
          className='swapBox'
          sx={{ padding: 2, borderRadius: 12, bgcolor: '#12131a' }}
        >
          <Box mb={1}>
            <small className='text-secondary'>{t('to')}</small>
          </Box>
          <Box
            display='flex'
            justifyContent='space-between'
            alignItems='center'
          >
            <Box style={{ fontSize: 24, color: '#fff' }}>
              {typedValue || '0.0'}
            </Box>
            <Box
              sx={{
                minWidth: 80,
                textAlign: 'right',
                color: '#fff',
                fontWeight: 600,
              }}
            >
              {outputSymbol}
            </Box>
          </Box>
        </Box>

        {error && (
          <Box mt={2} p={2} sx={{ borderRadius: 8, bgcolor: '#2a1b1b' }}>
            <small style={{ color: '#ff8b8b' }}>{error}</small>
          </Box>
        )}

        <Box mt={3}>
          <Button
            fullWidth
            onClick={handleClick}
            disabled={disabled}
            style={{
              height: 56,
              fontSize: 16,
              fontWeight: 600,
              borderRadius: 12,
            }}
          >
            {buttonLabel}
          </Button>
        </Box>

        <Box mt={2} textAlign='center'>
          <small className='text-secondary'>
            {t('wrap')} 1:1 — {native?.symbol} ↔ {wrapped?.symbol}
          </small>
        </Box>
      </Box>
    </Box>
  );
};

export default WrapPage;
