import { createWalletClient, createPublicClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";

/**
 * Unlink SDK client wrapper.
 *
 * SDK v0.0.2-canary.0 exposes the following on the UnlinkClient returned by
 * createUnlink():
 *
 *   getAddress()           -> Promise<string>          (bech32m "unlink1...")
 *   getPublicKey()         -> Promise<[bigint, bigint]>
 *   ensureRegistered()     -> Promise<void>
 *   deposit(params)        -> Promise<TransactionResult>  {token, amount, deadline?, nonce?, evm?}
 *   transfer(params)       -> Promise<TransactionResult>  {token, amount, recipientAddress} | multi
 *   withdraw(params)       -> Promise<TransactionResult>  {recipientEvmAddress, token, amount}
 *   getBalances(params?)   -> Promise<BalancesData>        {token?}
 *   getTransactions(p?)    -> Promise<TransactionListData>
 *   pollTransactionStatus(txId, opts?) -> Promise<TransactionResult>
 *   getApprovalState(p)    -> Promise<ApprovalState>
 *   buildApprovalTx(p)     -> Promise<UnlinkEvmTransactionRequest>
 *   ensureErc20Approval(p) -> Promise<EnsureErc20ApprovalResult>
 *
 * NOT present in canary build (documented but unreleased):
 *   - faucet.*              (requestTestTokens / requestPrivateTokens)
 *   - execute()             (adapter / DeFi call)
 *   - buildCall / toExecuteCall helpers
 */

let client: any = null;
let initPromise: Promise<any> | null = null;

export async function getUnlinkClient() {
  if (client) return client;
  if (initPromise) return initPromise;

  const apiKey = process.env.UNLINK_API_KEY;
  const mnemonic = process.env.UNLINK_MNEMONIC;
  const privateKey = process.env.DEPLOYER_PRIVATE_KEY;
  const rpc = process.env.BASE_SEPOLIA_RPC || "https://sepolia.base.org";

  if (!apiKey || !mnemonic || !privateKey) {
    return null; // Not configured -- routes will run in degraded mode
  }

  const account = privateKeyToAccount(privateKey as `0x${string}`);

  const publicClient = createPublicClient({
    chain: baseSepolia,
    transport: http(rpc),
  });

  const walletClient = createWalletClient({
    account,
    chain: baseSepolia,
    transport: http(rpc),
  });


  // Dynamic import to avoid hard failure when @unlink-xyz/sdk is missing
  // The SDK is expected at runtime; we construct eagerly here.
  initPromise = (async () => {
    try {
      const { createUnlink, unlinkAccount, unlinkEvm } = await import(
        "@unlink-xyz/sdk"
      );

      // Pass both walletClient AND publicClient so the EVM provider
      // supports getErc20Allowance (needed for ensureErc20Approval)
      client = createUnlink({
        engineUrl: "https://staging-api.unlink.xyz",
        apiKey,
        account: unlinkAccount.fromMnemonic({ mnemonic }),
        evm: unlinkEvm.fromViem({ walletClient, publicClient }),
      });
      return client;
    } catch (err) {
      console.warn(
        "[privacy] @unlink-xyz/sdk not available -- running in stub mode",
        err
      );
      initPromise = null;
      return null;
    }
  })();

  return initPromise;
}

export function getPublicClient() {
  const rpc = process.env.BASE_SEPOLIA_RPC || "https://sepolia.base.org";
  return createPublicClient({
    chain: baseSepolia,
    transport: http(rpc),
  });
}

export function getWalletClient() {
  const privateKey = process.env.DEPLOYER_PRIVATE_KEY;
  if (!privateKey) return null;

  const rpc = process.env.BASE_SEPOLIA_RPC || "https://sepolia.base.org";
  return createWalletClient({
    account: privateKeyToAccount(privateKey as `0x${string}`),
    chain: baseSepolia,
    transport: http(rpc),
  });
}

export function getUnlinkStatus() {
  const hasApiKey = !!process.env.UNLINK_API_KEY;
  const hasMnemonic = !!process.env.UNLINK_MNEMONIC;
  const hasPrivateKey = !!process.env.DEPLOYER_PRIVATE_KEY;
  const hasRpc = !!process.env.BASE_SEPOLIA_RPC;
  return {
    configured: hasApiKey && hasMnemonic && hasPrivateKey,
    hasApiKey,
    hasMnemonic,
    hasPrivateKey,
    hasRpc,
  };
}

/**
 * Default test token on Base Sepolia used by Unlink.
 * This address comes from the official Unlink docs / quickstart.
 */
export const UNLINK_TEST_TOKEN =
  "0x7501de8ea37a21e20e6e65947d2ecab0e9f061a7";
