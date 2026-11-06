export interface PrivacyTransaction {
  id: number;
  tx_id: string;
  type: "deposit" | "execute" | "withdraw" | "faucet";
  token: string;
  amount: string;
  status: "pending" | "confirmed" | "failed";
  evm_tx_hash: string | null;
  error: string | null;
  created_at: number;
  updated_at: number;
}

export interface DemoRun {
  id: number;
  started_at: number;
  step:
    | "init"
    | "depositing"
    | "executing"
    | "withdrawing"
    | "complete"
    | "failed";
  deposit_tx_id: string | null;
  execute_tx_id: string | null;
  withdraw_tx_id: string | null;
  input_token: string | null;
  output_token: string | null;
  input_amount: string | null;
  output_amount: string | null;
  error: string | null;
  completed_at: number | null;
}
