use near_sdk::json_types::U128;
use near_sdk::store::{IterableMap, IterableSet, LookupMap};
use near_sdk::{
    env, ext_contract, near, require, AccountId, Gas, NearToken, PromiseOrValue,
};
use serde::Serialize;

// ---------------------------------------------------------------------------
// Constants & Defaults
// ---------------------------------------------------------------------------

pub const DEFAULT_AUTO_CAP_IN: u128 = 100_000_000; // 100 USDC / EURe (6 decimals)
pub const DEFAULT_MAX_CHUNK_IN: u128 = 20_000_000; // 20 USDC (6 decimals)
pub const DEFAULT_MIN_INTERVAL_NS: u64 = 60_000_000_000; // 60 seconds
pub const DEFAULT_MAX_HORIZON_NS: u64 = 604_800_000_000_000; // 7 days
pub const MAX_OPEN_ORDERS_PER_REQUESTER: u32 = 16; // Bound storage griefing
pub const MAX_INVOICE_REF_LEN: usize = 64;
pub const MAX_IDEMPOTENCY_KEY_LEN: usize = 128;

/// Raw storage prefix for explicit per-order payout caps of LEGACY orders (target_out == 0).
/// Kept outside the borsh contract state on purpose: adding it needs NO state migration.
/// (SDK collections use prefixes r, O, c, k, l, e, f; "P" is unused.)
pub const PAYOUT_CAP_KEY_PREFIX: &[u8] = b"P";

pub const FT_TRANSFER_GAS: Gas = Gas::from_tgas(15);
pub const CALLBACK_GAS: Gas = Gas::from_tgas(25);
pub const REFUND_CALLBACK_GAS: Gas = Gas::from_tgas(15);

// ---------------------------------------------------------------------------
// External NEP-141 Interface
// ---------------------------------------------------------------------------

#[ext_contract(ext_ft)]
pub trait FungibleToken {
    fn ft_transfer(&mut self, receiver_id: AccountId, amount: U128, memo: Option<String>);
}

// ---------------------------------------------------------------------------
// Types & Enums
// ---------------------------------------------------------------------------

#[near(serializers = [json, borsh])]
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum OrderStatus {
    Pending,
    Active,
    Completed,
    Expired,
    Cancelled,
}

#[near(serializers = [json, borsh])]
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum ChunkStatus {
    InFlight,
    Settled,
    Failed,
}

#[near(serializers = [json, borsh])]
#[derive(Clone, Debug)]
pub struct Order {
    pub id: u64,
    pub requester: AccountId,
    pub recipient: AccountId,
    pub invoice_ref: String,
    pub pair_label: String,
    pub total_in: U128,
    pub executed_in: U128,
    pub pending_in: U128,
    pub target_out: U128,
    pub settled_out: U128,
    pub pending_out: U128,
    pub max_chunk_in: U128,
    pub deadline_ns: u64,
    pub max_dev_bps: u32,
    pub status: OrderStatus,
    pub last_chunk_ns: u64,
    pub chunks_count: u32,
}

#[near(serializers = [json, borsh])]
#[derive(Clone, Debug)]
pub struct ChunkRecord {
    pub key: String,
    pub order_id: u64,
    pub amount_in: U128,
    pub settlement_out: U128,
    pub simulated_out: U128,
    pub recipient: AccountId,
    pub quote_ref: String,
    pub deviation_bps: i32,
    pub status: ChunkStatus,
    pub attempts: u32,
    pub initiated_ns: u64,
    pub settled_ns: u64,
    pub failure_reason: Option<String>,
}

#[near(serializers = [json])]
#[derive(Clone, Debug)]
pub struct ChunkSettlementView {
    pub key: String,
    pub order_id: u64,
    pub status: ChunkStatus,
    pub idempotent_replay: bool,
    pub amount_in: U128,
    pub settlement_out: U128,
    pub settled_out_total: U128,
    pub remaining_due_out: U128,
    pub order_status: OrderStatus,
    pub failure_reason: Option<String>,
}

#[near(serializers = [json])]
#[derive(Clone, Debug)]
pub struct InvoiceSummaryView {
    pub id: u64,
    pub requester: AccountId,
    pub recipient: AccountId,
    pub invoice_ref: String,
    pub target_out: U128,
    pub settled_out: U128,
    pub pending_out: U128,
    pub remaining_due_out: U128,
    pub total_in: U128,
    pub executed_in: U128,
    pub pending_in: U128,
    pub chunks_count: u32,
    pub status: OrderStatus,
}

#[near(serializers = [json])]
#[derive(Clone, Debug)]
pub struct LimitsView {
    pub auto_cap_in: U128,
    pub max_chunk_in: U128,
    pub min_interval_ns: u64,
    pub max_horizon_ns: u64,
    pub paused: bool,
}

#[near(serializers = [json])]
#[derive(Clone, Debug)]
pub struct EscrowStatusView {
    pub order_id: u64,
    pub escrowed_in: U128,
    pub executed_in: U128,
    pub refunded_in: U128,
    pub remaining_escrow_in: U128,
}

#[near(serializers = [json])]
#[derive(Clone, Debug)]
pub struct EscrowedOrderMsg {
    pub action: Option<String>,
    pub pair_label: String,
    pub deadline_ns: u64,
    pub max_chunk_in: U128,
    pub max_dev_bps: u32,
    pub recipient: Option<AccountId>,
    pub target_out: Option<U128>,
    pub invoice_ref: Option<String>,
}

// Legacy V2 layout used for non-destructive state migration to V3 escrow storage.
#[near(serializers = [borsh])]
pub struct V2FxBudget {
    pub owner: AccountId,
    pub agent: Option<AccountId>,
    pub settlement_token: Option<AccountId>,
    pub requesters: IterableSet<AccountId>,
    pub auto_cap_in: u128,
    pub max_chunk_in: u128,
    pub min_interval_ns: u64,
    pub max_horizon_ns: u64,
    pub paused: bool,
    pub next_order_id: u64,
    pub orders: IterableMap<u64, Order>,
    pub open_orders_count: LookupMap<AccountId, u32>,
    pub chunk_records: LookupMap<String, ChunkRecord>,
    pub order_chunk_keys: LookupMap<u64, Vec<String>>,
}

// Legacy structs used strictly for state migration from pre-callback deployments.
#[near(serializers = [borsh])]
pub struct OldOrder {
    pub id: u64,
    pub requester: AccountId,
    pub pair_label: String,
    pub total_in: U128,
    pub executed_in: U128,
    pub max_chunk_in: U128,
    pub deadline_ns: u64,
    pub max_dev_bps: u32,
    pub status: OrderStatus,
    pub last_chunk_ns: u64,
    pub chunks_count: u32,
}

#[near(serializers = [borsh])]
pub struct OldFxBudget {
    pub owner: AccountId,
    pub agent: Option<AccountId>,
    pub requesters: IterableSet<AccountId>,
    pub auto_cap_in: u128,
    pub max_chunk_in: u128,
    pub min_interval_ns: u64,
    pub max_horizon_ns: u64,
    pub paused: bool,
    pub next_order_id: u64,
    pub orders: IterableMap<u64, OldOrder>,
    pub open_orders_count: LookupMap<AccountId, u32>,
}

// ---------------------------------------------------------------------------
// Explicit payout caps for legacy orders (raw storage, no state-layout change)
// ---------------------------------------------------------------------------

fn payout_cap_key(id: u64) -> Vec<u8> {
    let mut key = PAYOUT_CAP_KEY_PREFIX.to_vec();
    key.extend_from_slice(&id.to_le_bytes());
    key
}

fn read_payout_cap(id: u64) -> Option<u128> {
    env::storage_read(&payout_cap_key(id)).map(|bytes| {
        let arr: [u8; 16] = bytes.try_into().expect("Corrupt payout cap record");
        u128::from_le_bytes(arr)
    })
}

fn write_payout_cap(id: u64, cap: u128) {
    env::storage_write(&payout_cap_key(id), &cap.to_le_bytes());
}

// ---------------------------------------------------------------------------
// NEP-297 Event Helper
// ---------------------------------------------------------------------------

fn emit_event<T: Serialize>(event_name: &str, data: &T) {
    #[derive(Serialize)]
    struct Nep297Event<'a, T: Serialize> {
        standard: &'static str,
        version: &'static str,
        event: &'a str,
        data: &'a [T],
    }

    let event = Nep297Event {
        standard: "nep297",
        version: "1.0.0",
        event: event_name,
        data: std::slice::from_ref(data),
    };

    if let Ok(json) = serde_json::to_string(&event) {
        env::log_str(&format!("EVENT_JSON:{}", json));
    }
}

// ---------------------------------------------------------------------------
// FxBudget Contract State
// ---------------------------------------------------------------------------

#[near(contract_state)]
pub struct FxBudget {
    /// Owner account ID (Sputnik DAO contract on testnet)
    pub owner: AccountId,
    /// Automated execution agent account ID
    pub agent: Option<AccountId>,
    /// NEP-141 settlement token contract held by this vault (e.g. eure.*.testnet)
    pub settlement_token: Option<AccountId>,
    /// Authorized requester accounts
    pub requesters: IterableSet<AccountId>,
    /// Orders above this threshold require DAO approval
    pub auto_cap_in: u128,
    /// Maximum allowable chunk size across the contract
    pub max_chunk_in: u128,
    /// Minimum interval between confirmed chunk settlements (nanoseconds)
    pub min_interval_ns: u64,
    /// Maximum deadline horizon from creation time (nanoseconds)
    pub max_horizon_ns: u64,
    /// Emergency pause switch
    pub paused: bool,
    /// Auto-incrementing order ID counter
    pub next_order_id: u64,
    /// Orders registry (prefix b"O" cleanly separates migrated v2 records from legacy b"o")
    pub orders: IterableMap<u64, Order>,
    /// Open orders count per requester (storage bounding)
    pub open_orders_count: LookupMap<AccountId, u32>,
    /// Idempotent chunk settlement records keyed by idempotency_key
    pub chunk_records: LookupMap<String, ChunkRecord>,
    /// Ordered list of chunk idempotency keys per order for views/auditing
    pub order_chunk_keys: LookupMap<u64, Vec<String>>,
    /// Approved NEP-141 input token contract for escrowed orders (e.g. Circle native testnet USDC)
    pub input_token: Option<AccountId>,
    /// Actual escrowed input token balance locked per order via ft_transfer_call
    pub escrowed_in_balances: LookupMap<u64, U128>,
    /// Input token balance refunded (or reserved for refund) per order
    pub refunded_in_balances: LookupMap<u64, U128>,
}

impl Default for FxBudget {
    fn default() -> Self {
        env::panic_str("Contract should be initialized before usage")
    }
}

#[near]
impl FxBudget {
    // -----------------------------------------------------------------------
    // Initialization & Migration
    // -----------------------------------------------------------------------

    #[init]
    pub fn new(owner: AccountId, settlement_token: Option<AccountId>) -> Self {
        require!(!env::state_exists(), "Already initialized");
        Self {
            owner,
            agent: None,
            settlement_token,
            requesters: IterableSet::new(b"r"),
            auto_cap_in: DEFAULT_AUTO_CAP_IN,
            max_chunk_in: DEFAULT_MAX_CHUNK_IN,
            min_interval_ns: DEFAULT_MIN_INTERVAL_NS,
            max_horizon_ns: DEFAULT_MAX_HORIZON_NS,
            paused: false,
            next_order_id: 1,
            orders: IterableMap::new(b"O"),
            open_orders_count: LookupMap::new(b"c"),
            chunk_records: LookupMap::new(b"k"),
            order_chunk_keys: LookupMap::new(b"l"),
            input_token: None,
            escrowed_in_balances: LookupMap::new(b"e"),
            refunded_in_balances: LookupMap::new(b"f"),
        }
    }

    /// Upgrade existing on-chain state cleanly to invoice + callback-confirmed settlement storage.
    #[init(ignore_state)]
    #[private]
    pub fn migrate(settlement_token: AccountId) -> Self {
        let mut old: OldFxBudget = env::state_read().expect("No legacy state found to migrate");
        let mut new_orders: IterableMap<u64, Order> = IterableMap::new(b"O");

        for (id, legacy) in old.orders.iter() {
            new_orders.insert(
                *id,
                Order {
                    id: legacy.id,
                    requester: legacy.requester.clone(),
                    recipient: legacy.requester.clone(),
                    invoice_ref: format!("ORDER-{}", legacy.id),
                    pair_label: legacy.pair_label.clone(),
                    total_in: legacy.total_in,
                    executed_in: legacy.executed_in,
                    pending_in: U128(0),
                    target_out: U128(0),
                    settled_out: U128(0),
                    pending_out: U128(0),
                    max_chunk_in: legacy.max_chunk_in,
                    deadline_ns: legacy.deadline_ns,
                    max_dev_bps: legacy.max_dev_bps,
                    status: legacy.status,
                    last_chunk_ns: legacy.last_chunk_ns,
                    chunks_count: legacy.chunks_count,
                },
            );
        }
        old.orders.clear();

        Self {
            owner: old.owner,
            agent: old.agent,
            settlement_token: Some(settlement_token),
            requesters: old.requesters,
            auto_cap_in: old.auto_cap_in,
            max_chunk_in: old.max_chunk_in,
            min_interval_ns: old.min_interval_ns,
            max_horizon_ns: old.max_horizon_ns,
            paused: old.paused,
            next_order_id: old.next_order_id,
            orders: new_orders,
            open_orders_count: old.open_orders_count,
            chunk_records: LookupMap::new(b"k"),
            order_chunk_keys: LookupMap::new(b"l"),
            input_token: None,
            escrowed_in_balances: LookupMap::new(b"e"),
            refunded_in_balances: LookupMap::new(b"f"),
        }
    }

    /// Upgrade existing V2 deployment to V3 with whitelisted Circle USDC ft_transfer_call escrow.
    #[init(ignore_state)]
    #[private]
    pub fn migrate_v3(input_token: AccountId) -> Self {
        let old: V2FxBudget = env::state_read().expect("No V2 state found to migrate");
        Self {
            owner: old.owner,
            agent: old.agent,
            settlement_token: old.settlement_token,
            requesters: old.requesters,
            auto_cap_in: old.auto_cap_in,
            max_chunk_in: old.max_chunk_in,
            min_interval_ns: old.min_interval_ns,
            max_horizon_ns: old.max_horizon_ns,
            paused: old.paused,
            next_order_id: old.next_order_id,
            orders: old.orders,
            open_orders_count: old.open_orders_count,
            chunk_records: old.chunk_records,
            order_chunk_keys: old.order_chunk_keys,
            input_token: Some(input_token),
            escrowed_in_balances: LookupMap::new(b"e"),
            refunded_in_balances: LookupMap::new(b"f"),
        }
    }

    // -----------------------------------------------------------------------
    // Owner Admin Methods
    // -----------------------------------------------------------------------

    pub fn set_agent(&mut self, agent: AccountId) {
        self.assert_owner();
        self.agent = Some(agent.clone());

        #[derive(Serialize)]
        struct AgentSetEvent<'a> {
            agent: &'a AccountId,
        }
        emit_event("set_agent", &AgentSetEvent { agent: &agent });
    }

    pub fn set_settlement_token(&mut self, token: AccountId) {
        self.assert_owner();
        self.settlement_token = Some(token.clone());

        #[derive(Serialize)]
        struct SettlementTokenSetEvent<'a> {
            token: &'a AccountId,
        }
        emit_event("set_settlement_token", &SettlementTokenSetEvent { token: &token });
    }

    pub fn set_input_token(&mut self, token: AccountId) {
        self.assert_owner();
        self.input_token = Some(token.clone());

        #[derive(Serialize)]
        struct InputTokenSetEvent<'a> {
            token: &'a AccountId,
        }
        emit_event("set_input_token", &InputTokenSetEvent { token: &token });
    }

    pub fn add_requester(&mut self, account: AccountId) {
        self.assert_owner();
        self.requesters.insert(account.clone());

        #[derive(Serialize)]
        struct RequesterAddedEvent<'a> {
            account: &'a AccountId,
        }
        emit_event("add_requester", &RequesterAddedEvent { account: &account });
    }

    pub fn remove_requester(&mut self, account: AccountId) {
        self.assert_owner();
        self.requesters.remove(&account);

        #[derive(Serialize)]
        struct RequesterRemovedEvent<'a> {
            account: &'a AccountId,
        }
        emit_event("remove_requester", &RequesterRemovedEvent { account: &account });
    }

    pub fn set_limits(
        &mut self,
        auto_cap_in: U128,
        max_chunk_in: U128,
        min_interval_ns: u64,
        max_horizon_ns: u64,
    ) {
        self.assert_owner();
        require!(auto_cap_in.0 > 0, "auto_cap_in must be positive");
        require!(max_chunk_in.0 > 0, "max_chunk_in must be positive");
        require!(max_chunk_in.0 <= auto_cap_in.0, "max_chunk cannot exceed auto_cap");
        require!(min_interval_ns > 0, "min_interval must be positive");
        require!(max_horizon_ns > min_interval_ns, "max_horizon must exceed min_interval");

        self.auto_cap_in = auto_cap_in.0;
        self.max_chunk_in = max_chunk_in.0;
        self.min_interval_ns = min_interval_ns;
        self.max_horizon_ns = max_horizon_ns;

        #[derive(Serialize)]
        struct LimitsSetEvent {
            auto_cap_in: U128,
            max_chunk_in: U128,
            min_interval_ns: u64,
            max_horizon_ns: u64,
        }
        emit_event(
            "set_limits",
            &LimitsSetEvent {
                auto_cap_in,
                max_chunk_in,
                min_interval_ns,
                max_horizon_ns,
            },
        );
    }

    pub fn pause(&mut self) {
        self.assert_owner();
        self.paused = true;

        #[derive(Serialize)]
        struct PausedEvent {
            paused: bool,
        }
        emit_event("paused", &PausedEvent { paused: true });
    }

    pub fn unpause(&mut self) {
        self.assert_owner();
        self.paused = false;

        #[derive(Serialize)]
        struct UnpausedEvent {
            paused: bool,
        }
        emit_event("unpaused", &UnpausedEvent { paused: false });
    }

    /// Owner-only: give a LEGACY order (created before invoice targets were mandatory, target_out == 0)
    /// an explicit cumulative payout ceiling. Until a cap is set such an order cannot make any payout.
    pub fn set_order_payout_cap(&mut self, id: u64, cap_out: U128) {
        self.assert_owner();
        let order = self.orders.get(&id).expect("Order not found");
        require!(
            order.target_out.0 == 0,
            "Order has an invoice target; a payout cap applies only to legacy orders with target_out == 0"
        );
        require!(
            matches!(order.status, OrderStatus::Pending | OrderStatus::Active),
            "Only Pending or Active orders can receive a payout cap"
        );
        require!(cap_out.0 > 0, "cap_out must be positive");
        require!(
            cap_out.0 >= order.settled_out.0.saturating_add(order.pending_out.0),
            "cap_out is below the payout already committed"
        );
        write_payout_cap(id, cap_out.0);

        #[derive(Serialize)]
        struct PayoutCapSetEvent {
            id: u64,
            cap_out: U128,
        }
        emit_event("order_payout_cap_set", &PayoutCapSetEvent { id, cap_out });
    }

    // -----------------------------------------------------------------------
    // Order Lifecycle Methods
    // -----------------------------------------------------------------------

    #[allow(clippy::too_many_arguments)]
    fn create_order_internal(
        &mut self,
        requester: AccountId,
        pair_label: String,
        total_in: U128,
        deadline_ns: u64,
        max_chunk_in: U128,
        max_dev_bps: u32,
        recipient: Option<AccountId>,
        target_out: Option<U128>,
        invoice_ref: Option<String>,
    ) -> u64 {
        require!(!self.paused, "Contract is paused");
        require!(
            self.is_requester(requester.clone()) || requester == self.owner,
            "Caller is not an authorized requester"
        );

        let now = env::block_timestamp();
        let target_out_val = target_out.map_or(0, |v| v.0);
        let invoice_ref_val = invoice_ref.unwrap_or_default();
        let recipient_id = recipient.unwrap_or_else(|| requester.clone());

        require!(total_in.0 > 0, "total_in must be positive");
        // Every payout must be bounded on-chain. New orders are bounded by their invoice target.
        require!(
            target_out_val > 0,
            "target_out (invoice amount due) is required: payouts must be bounded on-chain"
        );
        require!(deadline_ns > now, "deadline must be in the future");
        require!(
            deadline_ns - now <= self.max_horizon_ns,
            "deadline exceeds maximum allowable horizon"
        );
        require!(
            max_chunk_in.0 > 0 && max_chunk_in.0 <= self.max_chunk_in,
            "max_chunk_in exceeds global contract limit"
        );
        require!(max_chunk_in.0 <= total_in.0, "max_chunk_in cannot exceed total_in");
        require!(max_dev_bps <= 5000, "max_dev_bps exceeds reasonable bound (50%)");
        require!(
            invoice_ref_val.len() <= MAX_INVOICE_REF_LEN,
            "invoice_ref exceeds maximum length"
        );

        let current_open = self.open_orders_count.get(&requester).copied().unwrap_or(0);
        require!(
            current_open < MAX_OPEN_ORDERS_PER_REQUESTER,
            "Requester has exceeded max allowable open orders"
        );

        let id = self.next_order_id;
        self.next_order_id = self.next_order_id.checked_add(1).expect("Order ID overflow");

        // Orders above auto_cap on either input budget or invoice target require DAO approval.
        let exceeds_auto_cap = total_in.0 > self.auto_cap_in || target_out_val > self.auto_cap_in;
        let initial_status = if exceeds_auto_cap {
            OrderStatus::Pending
        } else {
            OrderStatus::Active
        };

        let order = Order {
            id,
            requester: requester.clone(),
            recipient: recipient_id.clone(),
            invoice_ref: invoice_ref_val.clone(),
            pair_label: pair_label.clone(),
            total_in,
            executed_in: U128(0),
            pending_in: U128(0),
            target_out: U128(target_out_val),
            settled_out: U128(0),
            pending_out: U128(0),
            max_chunk_in,
            deadline_ns,
            max_dev_bps,
            status: initial_status,
            last_chunk_ns: 0,
            chunks_count: 0,
        };

        self.orders.insert(id, order);
        self.open_orders_count.insert(requester.clone(), current_open + 1);

        #[derive(Serialize)]
        struct OrderCreatedEvent<'a> {
            id: u64,
            requester: &'a AccountId,
            recipient: &'a AccountId,
            invoice_ref: &'a str,
            pair_label: &'a str,
            total_in: U128,
            target_out: U128,
            max_chunk_in: U128,
            deadline_ns: u64,
            max_dev_bps: u32,
            status: OrderStatus,
        }
        emit_event(
            "order_created",
            &OrderCreatedEvent {
                id,
                requester: &requester,
                recipient: &recipient_id,
                invoice_ref: &invoice_ref_val,
                pair_label: &pair_label,
                total_in,
                target_out: U128(target_out_val),
                max_chunk_in,
                deadline_ns,
                max_dev_bps,
                status: initial_status,
            },
        );

        id
    }

    #[allow(clippy::too_many_arguments)]
    pub fn create_order(
        &mut self,
        pair_label: String,
        total_in: U128,
        deadline_ns: u64,
        max_chunk_in: U128,
        max_dev_bps: u32,
        recipient: Option<AccountId>,
        target_out: Option<U128>,
        invoice_ref: Option<String>,
    ) -> u64 {
        let predecessor = env::predecessor_account_id();
        self.create_order_internal(
            predecessor,
            pair_label,
            total_in,
            deadline_ns,
            max_chunk_in,
            max_dev_bps,
            recipient,
            target_out,
            invoice_ref,
        )
    }

    /// NEP-141 receiver hook (`ft_transfer_call` from canonical Circle Native USDC contract).
    /// Locks transferred `USDC` in contract escrow for the newly created order and returns 0 refund.
    /// Any validation failure panics cleanly so NEP-141 `ft_resolve_transfer` returns tokens to sender.
    pub fn ft_on_transfer(
        &mut self,
        sender_id: AccountId,
        amount: U128,
        msg: String,
    ) -> PromiseOrValue<U128> {
        let token_contract = env::predecessor_account_id();
        let expected = self
            .input_token
            .as_ref()
            .expect("Input escrow token is not configured");
        require!(
            &token_contract == expected,
            "Only configured input USDC contract can fund escrowed orders"
        );

        let parsed: EscrowedOrderMsg =
            near_sdk::serde_json::from_str(&msg).expect("Invalid escrowed order JSON msg");
        if let Some(ref action) = parsed.action {
            require!(action == "create_escrowed_order", "Unsupported ft_on_transfer action");
        }

        let order_id = self.create_order_internal(
            sender_id.clone(),
            parsed.pair_label,
            amount,
            parsed.deadline_ns,
            parsed.max_chunk_in,
            parsed.max_dev_bps,
            parsed.recipient,
            parsed.target_out,
            parsed.invoice_ref,
        );
        self.escrowed_in_balances.insert(order_id, amount);

        #[derive(Serialize)]
        struct EscrowFundedEvent<'a> {
            order_id: u64,
            sender_id: &'a AccountId,
            input_token: &'a AccountId,
            escrowed_in: U128,
        }
        emit_event(
            "escrow_funded",
            &EscrowFundedEvent {
                order_id,
                sender_id: &sender_id,
                input_token: &token_contract,
                escrowed_in: amount,
            },
        );

        PromiseOrValue::Value(U128(0))
    }

    pub fn approve_order(&mut self, id: u64) {
        self.assert_owner();
        let order = self.orders.get_mut(&id).expect("Order not found");
        require!(
            order.status == OrderStatus::Pending,
            "Only Pending orders can be approved"
        );

        order.status = OrderStatus::Active;

        #[derive(Serialize)]
        struct OrderApprovedEvent {
            id: u64,
            status: OrderStatus,
        }
        emit_event(
            "order_approved",
            &OrderApprovedEvent {
                id,
                status: OrderStatus::Active,
            },
        );
    }

    pub fn cancel_order(&mut self, id: u64) -> PromiseOrValue<()> {
        let predecessor = env::predecessor_account_id();
        let (requester, executed_in) = {
            let order = self.orders.get_mut(&id).expect("Order not found");
            require!(
                predecessor == self.owner || predecessor == order.requester,
                "Only owner or order requester can cancel"
            );
            require!(
                order.status == OrderStatus::Pending || order.status == OrderStatus::Active,
                "Only Pending or Active orders can be cancelled"
            );
            require!(
                order.pending_in.0 == 0 && order.pending_out.0 == 0,
                "Cannot cancel while a chunk settlement is in flight"
            );

            order.status = OrderStatus::Cancelled;
            (order.requester.clone(), order.executed_in.0)
        };
        self.decrement_open_orders(&requester);

        #[derive(Serialize)]
        struct OrderCancelledEvent {
            id: u64,
            status: OrderStatus,
        }
        emit_event(
            "order_cancelled",
            &OrderCancelledEvent {
                id,
                status: OrderStatus::Cancelled,
            },
        );

        self.dispatch_escrow_refund(id, requester, executed_in, format!("GetNear escrow refund on cancel Order #{}", id))
    }

    /// Initiate an idempotent chunk settlement against an active order.
    ///
    /// Callable only by the designated agent (or owner).
    /// - `deviation_bps` is an agent-reported value checked against the order's `max_dev_bps` policy.
    /// - Replaying an already-settled `idempotency_key` short-circuits cleanly without paying twice.
    /// - Invoice `settled_out` and `executed_in` ONLY advance in `on_chunk_settled` if `ft_transfer` succeeds.
    #[allow(clippy::too_many_arguments)]
    pub fn execute_chunk(
        &mut self,
        id: u64,
        amount_in: U128,
        quote_ref: String,
        deviation_bps: i32,
        simulated_out: U128,
        settlement_out: Option<U128>,
        idempotency_key: Option<String>,
    ) -> PromiseOrValue<ChunkSettlementView> {
        require!(!self.paused, "Contract is paused");
        self.assert_agent_or_owner();

        let now = env::block_timestamp();
        let order_snapshot = self.orders.get(&id).expect("Order not found").clone();

        let key = idempotency_key
            .map(|k| k.trim().to_string())
            .filter(|k| !k.is_empty())
            .unwrap_or_else(|| format!("order-{}-seq-{}", id, order_snapshot.chunks_count + 1));
        require!(key.len() <= MAX_IDEMPOTENCY_KEY_LEN, "idempotency_key too long");

        // Idempotency check BEFORE policy checks so duplicate retries of completed chunks
        // cleanly no-op even after invoice completion or interval ticks.
        let mut attempt_num: u32 = 1;
        if let Some(existing) = self.chunk_records.get(&key) {
            require!(
                existing.order_id == id,
                "Idempotency key belongs to a different order"
            );
            match existing.status {
                ChunkStatus::Settled => {
                    let rem = order_snapshot
                        .target_out
                        .0
                        .saturating_sub(order_snapshot.settled_out.0);
                    #[derive(Serialize)]
                    struct IdempotentReplayEvent<'a> {
                        id: u64,
                        key: &'a str,
                        settlement_out: U128,
                    }
                    emit_event(
                        "chunk_idempotent_replay",
                        &IdempotentReplayEvent {
                            id,
                            key: &key,
                            settlement_out: existing.settlement_out,
                        },
                    );
                    return PromiseOrValue::Value(ChunkSettlementView {
                        key,
                        order_id: id,
                        status: ChunkStatus::Settled,
                        idempotent_replay: true,
                        amount_in: existing.amount_in,
                        settlement_out: existing.settlement_out,
                        settled_out_total: order_snapshot.settled_out,
                        remaining_due_out: U128(rem),
                        order_status: order_snapshot.status,
                        failure_reason: None,
                    });
                }
                ChunkStatus::InFlight => {
                    env::panic_str("Chunk settlement is already in flight");
                }
                ChunkStatus::Failed => {
                    attempt_num = existing.attempts.saturating_add(1);
                }
            }
        }

        let ft_contract = self
            .settlement_token
            .clone()
            .expect("Settlement token is not configured");

        require!(order_snapshot.status == OrderStatus::Active, "Order is not Active");
        require!(now < order_snapshot.deadline_ns, "Order deadline has passed");
        require!(
            order_snapshot.pending_in.0 == 0 && order_snapshot.pending_out.0 == 0,
            "Another chunk settlement is currently in flight for this order"
        );
        require!(amount_in.0 > 0, "amount_in must be positive");
        require!(
            amount_in.0 <= order_snapshot.max_chunk_in.0,
            "amount_in exceeds order max_chunk_in"
        );

        let committed_in = order_snapshot
            .executed_in
            .0
            .checked_add(amount_in.0)
            .expect("executed_in overflow");
        require!(
            committed_in <= order_snapshot.total_in.0,
            "executed_in exceeds order total_in"
        );

        if order_snapshot.chunks_count > 0 {
            require!(
                now.saturating_sub(order_snapshot.last_chunk_ns) >= self.min_interval_ns,
                "Minimum interval between chunks has not elapsed"
            );
        }

        // On-chain policy check on agent-reported deviation value.
        require!(
            deviation_bps >= -(order_snapshot.max_dev_bps as i32),
            "Adverse deviation exceeds order max_dev_bps tolerance"
        );

        let out_amount = settlement_out
            .expect("settlement_out must be specified explicitly for on-chain FT transfer")
            .0;
        require!(out_amount > 0, "settlement_out must be positive");

        // Every payout is bounded on-chain: by the invoice target, or - for legacy orders with
        // target_out == 0 - by an explicit owner-set payout cap. Without either, no payout is possible.
        let committed_out = order_snapshot
            .settled_out
            .0
            .checked_add(out_amount)
            .expect("settled_out overflow");
        if order_snapshot.target_out.0 > 0 {
            require!(
                committed_out <= order_snapshot.target_out.0,
                "settlement_out exceeds remaining invoice balance due"
            );
        } else {
            let cap = read_payout_cap(id).expect(
                "Order has no invoice target and no explicit payout cap; owner must call set_order_payout_cap",
            );
            require!(
                committed_out <= cap,
                "settlement_out exceeds the order payout cap"
            );
        }

        // Lock in-flight amounts without reducing balance due until ft_transfer confirms.
        let recipient = order_snapshot.recipient.clone();
        {
            let order = self.orders.get_mut(&id).expect("Order not found");
            order.pending_in = U128(amount_in.0);
            order.pending_out = U128(out_amount);
        }

        let is_new_key = !self.chunk_records.contains_key(&key);
        self.chunk_records.insert(
            key.clone(),
            ChunkRecord {
                key: key.clone(),
                order_id: id,
                amount_in,
                settlement_out: U128(out_amount),
                simulated_out,
                recipient: recipient.clone(),
                quote_ref: quote_ref.clone(),
                deviation_bps,
                status: ChunkStatus::InFlight,
                attempts: attempt_num,
                initiated_ns: now,
                settled_ns: 0,
                failure_reason: None,
            },
        );
        if is_new_key {
            let mut keys = self.order_chunk_keys.get(&id).cloned().unwrap_or_default();
            keys.push(key.clone());
            self.order_chunk_keys.insert(id, keys);
        }

        let memo = if order_snapshot.invoice_ref.is_empty() {
            format!("GetNear FX Order #{} [{}]", id, key)
        } else {
            format!("GetNear Invoice {} Order #{} [{}]", order_snapshot.invoice_ref, id, key)
        };

        PromiseOrValue::Promise(
            ext_ft::ext(ft_contract)
                .with_attached_deposit(NearToken::from_yoctonear(1))
                .with_static_gas(FT_TRANSFER_GAS)
                .ft_transfer(recipient, U128(out_amount), Some(memo))
                .then(
                    Self::ext(env::current_account_id())
                        .with_static_gas(CALLBACK_GAS)
                        .on_chunk_settled(id, key, amount_in, U128(out_amount)),
                ),
        )
    }

    /// Private cross-contract callback verifying whether NEP-141 ft_transfer succeeded.
    ///
    /// Invoice balance due and executed input ONLY advance when `PromiseResult` confirms success.
    #[private]
    pub fn on_chunk_settled(
        &mut self,
        id: u64,
        key: String,
        amount_in: U128,
        settlement_out: U128,
    ) -> ChunkSettlementView {
        let now = env::block_timestamp();
        let transfer_succeeded = env::promise_result_checked(0, 1024).is_ok();

        let (requester, target_out, final_settled_out, final_status, recipient, quote_ref, deviation_bps, simulated_out, chunks_count) = {
            let order = self.orders.get_mut(&id).expect("Order not found in callback");
            order.pending_in = U128(0);
            order.pending_out = U128(0);

            if transfer_succeeded {
                order.executed_in = U128(order.executed_in.0.saturating_add(amount_in.0));
                order.settled_out = U128(order.settled_out.0.saturating_add(settlement_out.0));
                order.last_chunk_ns = now;
                order.chunks_count = order.chunks_count.checked_add(1).expect("chunk count overflow");

                let invoice_paid = order.target_out.0 > 0 && order.settled_out.0 >= order.target_out.0;
                let budget_exhausted = order.executed_in.0 >= order.total_in.0;
                if (invoice_paid || budget_exhausted) && order.status == OrderStatus::Active {
                    order.status = OrderStatus::Completed;
                }
            }

            let record = self
                .chunk_records
                .get(&key)
                .expect("Chunk record missing in callback")
                .clone();

            (
                order.requester.clone(),
                order.target_out,
                order.settled_out,
                order.status,
                order.recipient.clone(),
                record.quote_ref,
                record.deviation_bps,
                record.simulated_out,
                order.chunks_count,
            )
        };

        if transfer_succeeded && final_status == OrderStatus::Completed {
            self.decrement_open_orders(&requester);
        }

        let failure_reason = if transfer_succeeded {
            None
        } else {
            Some("NEP-141 ft_transfer promise failed on-chain".to_string())
        };

        if let Some(mut chunk) = self.chunk_records.get(&key).cloned() {
            chunk.status = if transfer_succeeded {
                ChunkStatus::Settled
            } else {
                ChunkStatus::Failed
            };
            chunk.settled_ns = now;
            chunk.failure_reason = failure_reason.clone();
            self.chunk_records.insert(key.clone(), chunk);
        }

        let remaining_due = U128(target_out.0.saturating_sub(final_settled_out.0));

        if transfer_succeeded {
            #[derive(Serialize)]
            struct ChunkSettledEvent<'a> {
                id: u64,
                key: &'a str,
                recipient: &'a AccountId,
                amount_in: U128,
                settlement_out: U128,
                settled_out_total: U128,
                remaining_due_out: U128,
                quote_ref: &'a str,
                deviation_bps: i32,
                simulated_out: U128,
                chunks_count: u32,
                status: OrderStatus,
            }
            emit_event(
                "chunk_settled",
                &ChunkSettledEvent {
                    id,
                    key: &key,
                    recipient: &recipient,
                    amount_in,
                    settlement_out,
                    settled_out_total: final_settled_out,
                    remaining_due_out: remaining_due,
                    quote_ref: &quote_ref,
                    deviation_bps,
                    simulated_out,
                    chunks_count,
                    status: final_status,
                },
            );
        } else {
            #[derive(Serialize)]
            struct ChunkSettlementFailedEvent<'a> {
                id: u64,
                key: &'a str,
                recipient: &'a AccountId,
                amount_in: U128,
                attempted_out: U128,
                settled_out_total: U128,
                remaining_due_out: U128,
                status: OrderStatus,
                reason: &'a str,
            }
            emit_event(
                "chunk_settlement_failed",
                &ChunkSettlementFailedEvent {
                    id,
                    key: &key,
                    recipient: &recipient,
                    amount_in,
                    attempted_out: settlement_out,
                    settled_out_total: final_settled_out,
                    remaining_due_out: remaining_due,
                    status: final_status,
                    reason: "NEP-141 ft_transfer promise failed; invoice balance due unchanged",
                },
            );
        }

        ChunkSettlementView {
            key,
            order_id: id,
            status: if transfer_succeeded {
                ChunkStatus::Settled
            } else {
                ChunkStatus::Failed
            },
            idempotent_replay: false,
            amount_in,
            settlement_out,
            settled_out_total: final_settled_out,
            remaining_due_out: remaining_due,
            order_status: final_status,
            failure_reason,
        }
    }

    pub fn expire_order(&mut self, id: u64) -> PromiseOrValue<()> {
        let now = env::block_timestamp();
        let (requester, executed_in) = {
            let order = self.orders.get_mut(&id).expect("Order not found");
            require!(
                order.status == OrderStatus::Pending || order.status == OrderStatus::Active,
                "Order is already finalized"
            );
            require!(now >= order.deadline_ns, "Order deadline has not yet passed");
            require!(
                order.pending_in.0 == 0 && order.pending_out.0 == 0,
                "Cannot expire while a chunk settlement is in flight"
            );

            order.status = OrderStatus::Expired;
            (order.requester.clone(), order.executed_in.0)
        };
        self.decrement_open_orders(&requester);

        #[derive(Serialize)]
        struct OrderExpiredEvent {
            id: u64,
            status: OrderStatus,
        }
        emit_event(
            "order_expired",
            &OrderExpiredEvent {
                id,
                status: OrderStatus::Expired,
            },
        );

        self.dispatch_escrow_refund(id, requester, executed_in, format!("GetNear escrow refund on expiry Order #{}", id))
    }

    /// Claim any remaining unspent escrowed Circle USDC after an order is Completed, Cancelled, or Expired.
    pub fn refund_unused_escrow(&mut self, id: u64) -> PromiseOrValue<()> {
        let order = self.orders.get(&id).expect("Order not found").clone();
        require!(
            matches!(
                order.status,
                OrderStatus::Completed | OrderStatus::Cancelled | OrderStatus::Expired
            ),
            "Order must be finalized before claiming unspent escrow"
        );
        require!(
            order.pending_in.0 == 0 && order.pending_out.0 == 0,
            "Cannot refund escrow while a chunk settlement is in flight"
        );
        self.dispatch_escrow_refund(
            id,
            order.requester,
            order.executed_in.0,
            format!("GetNear unspent escrow return Order #{}", id),
        )
    }

    #[private]
    pub fn on_escrow_refunded(&mut self, id: u64, amount: U128) {
        let succeeded = env::promise_result_checked(0, 1024).is_ok();
        if succeeded {
            #[derive(Serialize)]
            struct EscrowRefundedEvent {
                order_id: u64,
                refunded_amount: U128,
            }
            emit_event(
                "escrow_refunded",
                &EscrowRefundedEvent {
                    order_id: id,
                    refunded_amount: amount,
                },
            );
        } else {
            let current = self.refunded_in_balances.get(&id).copied().unwrap_or(U128(0)).0;
            self.refunded_in_balances
                .insert(id, U128(current.saturating_sub(amount.0)));

            #[derive(Serialize)]
            struct EscrowRefundFailedEvent {
                order_id: u64,
                attempted_amount: U128,
            }
            emit_event(
                "escrow_refund_failed",
                &EscrowRefundFailedEvent {
                    order_id: id,
                    attempted_amount: amount,
                },
            );
        }
    }

    // -----------------------------------------------------------------------
    // View Methods
    // -----------------------------------------------------------------------

    pub fn get_order(&self, id: u64) -> Option<Order> {
        self.orders.get(&id).cloned()
    }

    pub fn list_orders(&self, from_index: Option<u64>, limit: Option<u64>) -> Vec<Order> {
        let from = from_index.unwrap_or(0);
        let lim = limit.unwrap_or(50).min(100);

        self.orders
            .iter()
            .skip(from as usize)
            .take(lim as usize)
            .map(|(_, o)| o.clone())
            .collect()
    }

    pub fn get_invoice_summary(&self, id: u64) -> Option<InvoiceSummaryView> {
        self.orders.get(&id).map(|o| InvoiceSummaryView {
            id: o.id,
            requester: o.requester.clone(),
            recipient: o.recipient.clone(),
            invoice_ref: o.invoice_ref.clone(),
            target_out: o.target_out,
            settled_out: o.settled_out,
            pending_out: o.pending_out,
            remaining_due_out: U128(o.target_out.0.saturating_sub(o.settled_out.0)),
            total_in: o.total_in,
            executed_in: o.executed_in,
            pending_in: o.pending_in,
            chunks_count: o.chunks_count,
            status: o.status,
        })
    }

    pub fn get_chunk_record(&self, key: String) -> Option<ChunkRecord> {
        self.chunk_records.get(&key).cloned()
    }

    pub fn list_order_chunks(&self, order_id: u64) -> Vec<ChunkRecord> {
        let Some(keys) = self.order_chunk_keys.get(&order_id) else {
            return Vec::new();
        };
        keys.iter()
            .filter_map(|k| self.chunk_records.get(k).cloned())
            .collect()
    }

    pub fn get_limits(&self) -> LimitsView {
        LimitsView {
            auto_cap_in: U128(self.auto_cap_in),
            max_chunk_in: U128(self.max_chunk_in),
            min_interval_ns: self.min_interval_ns,
            max_horizon_ns: self.max_horizon_ns,
            paused: self.paused,
        }
    }

    pub fn get_owner(&self) -> AccountId {
        self.owner.clone()
    }

    pub fn get_agent(&self) -> Option<AccountId> {
        self.agent.clone()
    }

    pub fn get_settlement_token(&self) -> Option<AccountId> {
        self.settlement_token.clone()
    }

    pub fn get_input_token(&self) -> Option<AccountId> {
        self.input_token.clone()
    }

    pub fn get_order_payout_cap(&self, id: u64) -> Option<U128> {
        read_payout_cap(id).map(U128)
    }

    pub fn get_order_escrow(&self, id: u64) -> Option<EscrowStatusView> {
        self.orders.get(&id).map(|o| {
            let escrowed = self.escrowed_in_balances.get(&id).copied().unwrap_or(U128(0)).0;
            let refunded = self.refunded_in_balances.get(&id).copied().unwrap_or(U128(0)).0;
            let remaining = escrowed.saturating_sub(o.executed_in.0).saturating_sub(refunded);
            EscrowStatusView {
                order_id: id,
                escrowed_in: U128(escrowed),
                executed_in: o.executed_in,
                refunded_in: U128(refunded),
                remaining_escrow_in: U128(remaining),
            }
        })
    }

    pub fn is_requester(&self, account: AccountId) -> bool {
        self.requesters.contains(&account)
    }

    pub fn is_paused(&self) -> bool {
        self.paused
    }

    pub fn get_open_orders_count(&self, account: AccountId) -> u32 {
        self.open_orders_count.get(&account).copied().unwrap_or(0)
    }

    // -----------------------------------------------------------------------
    // Internal Security Helpers
    // -----------------------------------------------------------------------

    fn assert_owner(&self) {
        require!(
            env::predecessor_account_id() == self.owner,
            "Predecessor is not the contract owner"
        );
    }

    fn assert_agent_or_owner(&self) {
        let predecessor = env::predecessor_account_id();
        let is_agent = self.agent.as_ref().map_or(false, |a| *a == predecessor);
        require!(
            is_agent || predecessor == self.owner,
            "Predecessor is neither the designated agent nor owner"
        );
    }

    fn decrement_open_orders(&mut self, requester: &AccountId) {
        let count = self.open_orders_count.get(requester).copied().unwrap_or(0);
        if count > 0 {
            self.open_orders_count.insert(requester.clone(), count - 1);
        }
    }

    fn dispatch_escrow_refund(
        &mut self,
        id: u64,
        requester: AccountId,
        executed_in: u128,
        memo: String,
    ) -> PromiseOrValue<()> {
        let escrowed = self.escrowed_in_balances.get(&id).copied().unwrap_or(U128(0)).0;
        let refunded = self.refunded_in_balances.get(&id).copied().unwrap_or(U128(0)).0;
        let unspent = escrowed.saturating_sub(executed_in).saturating_sub(refunded);
        let Some(token) = self.input_token.clone() else {
            return PromiseOrValue::Value(());
        };
        if unspent == 0 {
            return PromiseOrValue::Value(());
        }

        self.refunded_in_balances.insert(id, U128(refunded + unspent));
        PromiseOrValue::Promise(
            ext_ft::ext(token)
                .with_attached_deposit(NearToken::from_yoctonear(1))
                .with_static_gas(FT_TRANSFER_GAS)
                .ft_transfer(requester, U128(unspent), Some(memo))
                .then(
                    Self::ext(env::current_account_id())
                        .with_static_gas(REFUND_CALLBACK_GAS)
                        .on_escrow_refunded(id, U128(unspent)),
                ),
        )
    }
}

// ---------------------------------------------------------------------------
// Unit Tests (Callback-Verified Settlement, Failure Rollback & Idempotency)
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use near_sdk::test_utils::{get_created_receipts, VMContextBuilder};
    use near_sdk::{test_vm_config, testing_env, PromiseResult};

    fn acct(name: &str) -> AccountId {
        name.parse().unwrap()
    }

    fn init_invoice_contract() -> (FxBudget, AccountId, AccountId, AccountId, AccountId, AccountId) {
        let owner = acct("dao.testnet");
        let agent = acct("agent.testnet");
        let requester = acct("treasury.testnet");
        let supplier = acct("supplier.testnet");
        let token = acct("eure.testnet");

        let mut ctx = VMContextBuilder::new();
        ctx.predecessor_account_id(owner.clone())
            .current_account_id(acct("fx-budget.testnet"))
            .block_timestamp(1_000_000_000_000);
        testing_env!(ctx.build());

        let mut contract = FxBudget::new(owner.clone(), Some(token.clone()));
        contract.set_agent(agent.clone());
        contract.add_requester(requester.clone());
        contract.set_limits(
            U128(500_000_000),      // 500 auto-cap
            U128(500_000_000),      // 500 max chunk
            10_000_000_000,         // 10s interval
            604_800_000_000_000,    // 7 days
        );

        (contract, owner, agent, requester, supplier, token)
    }

    #[test]
    fn supplier_invoice_settlement_failure_and_idempotent_retry() {
        let (mut contract, owner, agent, requester, supplier, _token) = init_invoice_contract();

        // 1. Requester creates a €1,000 invoice payable to supplier (€1,000 = 1_000_000_000).
        let mut ctx = VMContextBuilder::new();
        ctx.predecessor_account_id(requester.clone())
            .current_account_id(acct("fx-budget.testnet"))
            .block_timestamp(1_000_000_000_000);
        testing_env!(ctx.build());

        let order_id = contract.create_order(
            "USDC/EURe".to_string(),
            U128(1_200_000_000), // $1,200 USDC budget > 500 auto_cap -> Pending
            2_000_000_000_000,
            U128(500_000_000),
            120,
            Some(supplier.clone()),
            Some(U128(1_000_000_000)), // €1,000.00 EURe invoice due
            Some("INV-2026-1000".to_string()),
        );
        assert_eq!(
            contract.get_invoice_summary(order_id).unwrap().status,
            OrderStatus::Pending
        );

        // 2. DAO approves the €1,000 invoice order.
        ctx.predecessor_account_id(owner.clone());
        testing_env!(ctx.build());
        contract.approve_order(order_id);

        // 3. Chunk #1 (€400 EURe) initiated by agent -> ft_transfer promise created.
        ctx.predecessor_account_id(agent.clone())
            .block_timestamp(1_100_000_000_000);
        testing_env!(ctx.build());
        let res1 = contract.execute_chunk(
            order_id,
            U128(450_000_000),
            "sha256:q1".to_string(),
            -20,
            U128(400_000_000),
            Some(U128(400_000_000)),
            Some("inv1-chunk-1".to_string()),
        );
        assert!(matches!(res1, PromiseOrValue::Promise(_)));
        // near-sdk 5 schedules a returned Promise when it is dropped (the host does this for a real call).
        drop(res1);
        assert_eq!(get_created_receipts().len(), 2); // ft_transfer + on_chunk_settled callback
        // Before callback completes, settled_out must still be 0 and pending_out == 400!
        let pre_cb = contract.get_invoice_summary(order_id).unwrap();
        assert_eq!(pre_cb.settled_out.0, 0);
        assert_eq!(pre_cb.pending_out.0, 400_000_000);
        assert_eq!(pre_cb.remaining_due_out.0, 1_000_000_000);

        // 4. Callback confirms Chunk #1 ft_transfer succeeded -> balance due drops to €600.
        ctx.predecessor_account_id(acct("fx-budget.testnet"))
            .block_timestamp(1_101_000_000_000);
        testing_env!(
            ctx.build(),
            test_vm_config(), near_sdk::RuntimeFeesConfig::test(), Default::default(),
            vec![PromiseResult::Successful(vec![])],
        );
        let settled_1 = contract.on_chunk_settled(
            order_id,
            "inv1-chunk-1".to_string(),
            U128(450_000_000),
            U128(400_000_000),
        );
        assert_eq!(settled_1.status, ChunkStatus::Settled);
        assert_eq!(settled_1.settled_out_total.0, 400_000_000);
        assert_eq!(settled_1.remaining_due_out.0, 600_000_000);

        // 5. Idempotent replay of Chunk #1 must NEVER transfer tokens or reduce due twice!
        ctx.predecessor_account_id(agent.clone())
            .block_timestamp(1_120_000_000_000);
        testing_env!(ctx.build());
        let replay = contract.execute_chunk(
            order_id,
            U128(450_000_000),
            "sha256:q1".to_string(),
            -20,
            U128(400_000_000),
            Some(U128(400_000_000)),
            Some("inv1-chunk-1".to_string()),
        );
        assert!(matches!(replay, PromiseOrValue::Value(_)));
        assert_eq!(get_created_receipts().len(), 0); // Zero cross-contract ft_transfer calls!
        assert_eq!(
            contract.get_invoice_summary(order_id).unwrap().remaining_due_out.0,
            600_000_000
        );

        // 6. Chunk #2 (€300 EURe) initiated -> simulated on-chain ft_transfer FAILS.
        let res2 = contract.execute_chunk(
            order_id,
            U128(340_000_000),
            "sha256:q2".to_string(),
            -15,
            U128(300_000_000),
            Some(U128(300_000_000)),
            Some("inv1-chunk-2".to_string()),
        );
        assert!(matches!(res2, PromiseOrValue::Promise(_)));

        ctx.predecessor_account_id(acct("fx-budget.testnet"))
            .block_timestamp(1_121_000_000_000);
        testing_env!(
            ctx.build(),
            test_vm_config(), near_sdk::RuntimeFeesConfig::test(), Default::default(),
            vec![PromiseResult::Failed],
        );
        let failed_2 = contract.on_chunk_settled(
            order_id,
            "inv1-chunk-2".to_string(),
            U128(340_000_000),
            U128(300_000_000),
        );
        assert_eq!(failed_2.status, ChunkStatus::Failed);
        assert_eq!(failed_2.remaining_due_out.0, 600_000_000); // UNCHANGED!

        let post_fail = contract.get_invoice_summary(order_id).unwrap();
        assert_eq!(post_fail.settled_out.0, 400_000_000);
        assert_eq!(post_fail.pending_out.0, 0);
        assert_eq!(post_fail.remaining_due_out.0, 600_000_000);
        assert_eq!(post_fail.chunks_count, 1);
        assert_eq!(post_fail.status, OrderStatus::Active);

        // 7. Retrying Chunk #2 after vault replenish succeeds cleanly and settles €300!
        ctx.predecessor_account_id(agent.clone())
            .block_timestamp(1_140_000_000_000);
        testing_env!(ctx.build());
        let retry_2 = contract.execute_chunk(
            order_id,
            U128(340_000_000),
            "sha256:q2-retry".to_string(),
            -10,
            U128(300_000_000),
            Some(U128(300_000_000)),
            Some("inv1-chunk-2".to_string()),
        );
        assert!(matches!(retry_2, PromiseOrValue::Promise(_)));

        ctx.predecessor_account_id(acct("fx-budget.testnet"))
            .block_timestamp(1_141_000_000_000);
        testing_env!(
            ctx.build(),
            test_vm_config(), near_sdk::RuntimeFeesConfig::test(), Default::default(),
            vec![PromiseResult::Successful(vec![])],
        );
        let settled_2 = contract.on_chunk_settled(
            order_id,
            "inv1-chunk-2".to_string(),
            U128(340_000_000),
            U128(300_000_000),
        );
        assert_eq!(settled_2.status, ChunkStatus::Settled);
        assert_eq!(settled_2.settled_out_total.0, 700_000_000);
        assert_eq!(settled_2.remaining_due_out.0, 300_000_000);

        // 8. Final Chunk #3 (€300 EURe) completes the €1,000 invoice -> balance due becomes €0.
        ctx.predecessor_account_id(agent.clone())
            .block_timestamp(1_160_000_000_000);
        testing_env!(ctx.build());
        contract.execute_chunk(
            order_id,
            U128(340_000_000),
            "sha256:q3".to_string(),
            -5,
            U128(300_000_000),
            Some(U128(300_000_000)),
            Some("inv1-chunk-3".to_string()),
        );
        ctx.predecessor_account_id(acct("fx-budget.testnet"))
            .block_timestamp(1_161_000_000_000);
        testing_env!(
            ctx.build(),
            test_vm_config(), near_sdk::RuntimeFeesConfig::test(), Default::default(),
            vec![PromiseResult::Successful(vec![])],
        );
        let settled_3 = contract.on_chunk_settled(
            order_id,
            "inv1-chunk-3".to_string(),
            U128(340_000_000),
            U128(300_000_000),
        );
        assert_eq!(settled_3.remaining_due_out.0, 0);
        assert_eq!(settled_3.order_status, OrderStatus::Completed);
        assert_eq!(contract.get_open_orders_count(requester), 0);
    }

    #[test]
    fn migrates_legacy_state_cleanly() {
        let owner = acct("dao.testnet");
        let requester = acct("operator.testnet");
        let agent = acct("agent.testnet");
        let token = acct("eure.testnet");

        let mut ctx = VMContextBuilder::new();
        ctx.predecessor_account_id(acct("fx-budget.testnet"))
            .current_account_id(acct("fx-budget.testnet"));
        testing_env!(ctx.build());

        let mut old_orders = IterableMap::new(b"o");
        old_orders.insert(
            7,
            OldOrder {
                id: 7,
                requester: requester.clone(),
                pair_label: "USDC/EURe".to_string(),
                total_in: U128(250_000_000),
                executed_in: U128(40_000_000),
                max_chunk_in: U128(20_000_000),
                deadline_ns: 2_000_000_000_000,
                max_dev_bps: 120,
                status: OrderStatus::Active,
                last_chunk_ns: 1_500_000_000_000,
                chunks_count: 2,
            },
        );
        old_orders.flush();

        let mut requesters = IterableSet::new(b"r");
        requesters.insert(requester.clone());
        requesters.flush();

        let mut open_counts = LookupMap::new(b"c");
        open_counts.insert(requester.clone(), 1);
        open_counts.flush();

        let legacy = OldFxBudget {
            owner: owner.clone(),
            agent: Some(agent.clone()),
            requesters,
            auto_cap_in: DEFAULT_AUTO_CAP_IN,
            max_chunk_in: DEFAULT_MAX_CHUNK_IN,
            min_interval_ns: DEFAULT_MIN_INTERVAL_NS,
            max_horizon_ns: DEFAULT_MAX_HORIZON_NS,
            paused: false,
            next_order_id: 8,
            orders: old_orders,
            open_orders_count: open_counts,
        };
        let bytes = near_sdk::borsh::to_vec(&legacy).unwrap();
        env::storage_write(b"STATE", &bytes);

        let migrated = FxBudget::migrate(token.clone());
        assert_eq!(migrated.get_owner(), owner);
        assert_eq!(migrated.get_agent(), Some(agent));
        assert_eq!(migrated.get_settlement_token(), Some(token));
        assert!(migrated.is_requester(requester.clone()));
        let ord = migrated.get_order(7).expect("Legacy Order #7 must survive migration");
        assert_eq!(ord.executed_in.0, 40_000_000);
        assert_eq!(ord.recipient, requester);
    }

    // -----------------------------------------------------------------------
    // Payout bounds, escrow accounting and migration (execute contract logic)
    // -----------------------------------------------------------------------

    fn ctx_for(predecessor: &AccountId, ts: u64) -> VMContextBuilder {
        let mut ctx = VMContextBuilder::new();
        ctx.predecessor_account_id(predecessor.clone())
            .current_account_id(acct("fx-budget.testnet"))
            .block_timestamp(ts);
        ctx
    }

    /// Context for a private callback (predecessor == the contract itself).
    fn callback_ctx() -> VMContextBuilder {
        ctx_for(&acct("fx-budget.testnet"), 1_101_000_000_000)
    }

    /// Insert an Active legacy order (target_out == 0) directly, as migrated Orders #1-#7 look on testnet.
    fn insert_legacy_order(contract: &mut FxBudget, id: u64, requester: &AccountId, recipient: &AccountId) {
        contract.orders.insert(
            id,
            Order {
                id,
                requester: requester.clone(),
                recipient: recipient.clone(),
                invoice_ref: format!("ORDER-{}", id),
                pair_label: "USDC/EURe".to_string(),
                total_in: U128(100_000_000),
                executed_in: U128(0),
                pending_in: U128(0),
                target_out: U128(0),
                settled_out: U128(0),
                pending_out: U128(0),
                max_chunk_in: U128(50_000_000),
                deadline_ns: 2_000_000_000_000,
                max_dev_bps: 120,
                status: OrderStatus::Active,
                last_chunk_ns: 0,
                chunks_count: 0,
            },
        );
    }

    fn escrow_msg(target_out: Option<&str>) -> String {
        let target = target_out
            .map(|t| format!(r#","target_out":"{}""#, t))
            .unwrap_or_default();
        format!(
            r#"{{"pair_label":"USDC/EURe","deadline_ns":2000000000000,"max_chunk_in":"10000000","max_dev_bps":120,"recipient":"supplier.testnet","invoice_ref":"INV-12"{}}}"#,
            target
        )
    }

    #[test]
    #[should_panic(expected = "target_out")]
    fn new_orders_require_an_invoice_target() {
        let (mut contract, _owner, _agent, requester, _supplier, _token) = init_invoice_contract();
        testing_env!(ctx_for(&requester, 1_000_000_000_000).build());
        contract.create_order(
            "USDC/EURe".to_string(),
            U128(50_000_000),
            2_000_000_000_000,
            U128(10_000_000),
            120,
            None,
            None, // no invoice target -> no on-chain payout bound
            None,
        );
    }

    #[test]
    #[should_panic(expected = "payout cap")]
    fn legacy_order_without_a_cap_cannot_pay_out() {
        let (mut contract, _owner, agent, requester, supplier, _token) = init_invoice_contract();
        insert_legacy_order(&mut contract, 7, &requester, &supplier);
        testing_env!(ctx_for(&agent, 1_100_000_000_000).build());
        contract.execute_chunk(
            7,
            U128(10_000_000),
            "sha256:q".to_string(),
            -10,
            U128(8_000_000),
            Some(U128(8_000_000)),
            Some("legacy-1".to_string()),
        );
    }

    #[test]
    fn owner_cap_bounds_cumulative_legacy_payouts_and_the_agent_stays_restricted() {
        let (mut contract, owner, agent, requester, supplier, _token) = init_invoice_contract();
        insert_legacy_order(&mut contract, 7, &requester, &supplier);

        // Only the owner (DAO) can set the cap.
        testing_env!(ctx_for(&owner, 1_050_000_000_000).build());
        contract.set_order_payout_cap(7, U128(10_000_000));
        assert_eq!(contract.get_order_payout_cap(7), Some(U128(10_000_000)));

        // Chunk 1: 8 EURe, within the cap -> settles.
        testing_env!(ctx_for(&agent, 1_100_000_000_000).build());
        let r1 = contract.execute_chunk(
            7, U128(9_000_000), "sha256:q1".to_string(), -10, U128(8_000_000), Some(U128(8_000_000)), Some("legacy-1".to_string()),
        );
        assert!(matches!(r1, PromiseOrValue::Promise(_)));
        testing_env!(callback_ctx().build(), test_vm_config(), near_sdk::RuntimeFeesConfig::test(), Default::default(), vec![PromiseResult::Successful(vec![])]);
        let s1 = contract.on_chunk_settled(7, "legacy-1".to_string(), U128(9_000_000), U128(8_000_000));
        assert_eq!(s1.settled_out_total.0, 8_000_000);

        // Chunk 2: exactly the remaining 2 EURe of the cap -> allowed.
        testing_env!(ctx_for(&agent, 1_120_000_000_000).build());
        let r2 = contract.execute_chunk(
            7, U128(2_000_000), "sha256:q2".to_string(), -10, U128(2_000_000), Some(U128(2_000_000)), Some("legacy-2".to_string()),
        );
        assert!(matches!(r2, PromiseOrValue::Promise(_)));
        assert_eq!(contract.get_invoice_summary(7).unwrap().pending_out.0, 2_000_000);
    }

    #[test]
    #[should_panic(expected = "payout cap")]
    fn legacy_payout_above_the_cap_is_rejected() {
        let (mut contract, owner, agent, requester, supplier, _token) = init_invoice_contract();
        insert_legacy_order(&mut contract, 7, &requester, &supplier);
        testing_env!(ctx_for(&owner, 1_050_000_000_000).build());
        contract.set_order_payout_cap(7, U128(10_000_000));

        testing_env!(ctx_for(&agent, 1_100_000_000_000).build());
        contract.execute_chunk(
            7, U128(9_000_000), "sha256:q1".to_string(), -10, U128(8_000_000), Some(U128(8_000_000)), Some("legacy-1".to_string()),
        );
        testing_env!(callback_ctx().build(), test_vm_config(), near_sdk::RuntimeFeesConfig::test(), Default::default(), vec![PromiseResult::Successful(vec![])]);
        contract.on_chunk_settled(7, "legacy-1".to_string(), U128(9_000_000), U128(8_000_000));

        // 8 + 3 = 11 EURe > cap of 10 EURe
        testing_env!(ctx_for(&agent, 1_120_000_000_000).build());
        contract.execute_chunk(
            7, U128(3_000_000), "sha256:q2".to_string(), -10, U128(3_000_000), Some(U128(3_000_000)), Some("legacy-2".to_string()),
        );
    }

    #[test]
    #[should_panic(expected = "owner")]
    fn only_the_owner_can_set_a_payout_cap() {
        let (mut contract, _owner, agent, requester, supplier, _token) = init_invoice_contract();
        insert_legacy_order(&mut contract, 7, &requester, &supplier);
        testing_env!(ctx_for(&agent, 1_050_000_000_000).build());
        contract.set_order_payout_cap(7, U128(1_000_000_000)); // the agent must not be able to lift its own bound
    }

    #[test]
    #[should_panic(expected = "invoice target")]
    fn payout_caps_do_not_apply_to_orders_with_an_invoice_target() {
        let (mut contract, owner, _agent, requester, supplier, _token) = init_invoice_contract();
        testing_env!(ctx_for(&requester, 1_000_000_000_000).build());
        let id = contract.create_order(
            "USDC/EURe".to_string(), U128(50_000_000), 2_000_000_000_000, U128(10_000_000), 120,
            Some(supplier), Some(U128(40_000_000)), Some("INV-1".to_string()),
        );
        testing_env!(ctx_for(&owner, 1_000_000_000_000).build());
        contract.set_order_payout_cap(id, U128(1));
    }

    #[test]
    #[should_panic(expected = "settlement_out exceeds remaining invoice balance due")]
    fn invoice_target_still_bounds_payouts() {
        let (mut contract, _owner, agent, requester, supplier, _token) = init_invoice_contract();
        testing_env!(ctx_for(&requester, 1_000_000_000_000).build());
        let id = contract.create_order(
            "USDC/EURe".to_string(), U128(50_000_000), 2_000_000_000_000, U128(10_000_000), 120,
            Some(supplier), Some(U128(8_000_000)), Some("INV-8".to_string()),
        );
        testing_env!(ctx_for(&agent, 1_100_000_000_000).build());
        contract.execute_chunk(
            id, U128(10_000_000), "sha256:q".to_string(), -10, U128(9_000_000), Some(U128(8_000_001)), Some("k1".to_string()),
        );
    }

    #[test]
    #[should_panic(expected = "target_out")]
    fn escrow_funding_without_a_target_is_rejected_so_the_token_refunds_the_sender() {
        let (mut contract, owner, _agent, requester, _supplier, _token) = init_invoice_contract();
        let circle = acct("usdc-circle.testnet");
        testing_env!(ctx_for(&owner, 1_000_000_000_000).build());
        contract.set_input_token(circle.clone());
        testing_env!(ctx_for(&circle, 1_000_000_000_000).build());
        contract.ft_on_transfer(requester, U128(15_000_000), escrow_msg(None));
    }

    #[test]
    #[should_panic(expected = "Only configured input USDC")]
    fn escrow_funding_from_another_token_is_rejected() {
        let (mut contract, owner, _agent, requester, _supplier, _token) = init_invoice_contract();
        testing_env!(ctx_for(&owner, 1_000_000_000_000).build());
        contract.set_input_token(acct("usdc-circle.testnet"));
        testing_env!(ctx_for(&acct("evil-token.testnet"), 1_000_000_000_000).build());
        contract.ft_on_transfer(requester, U128(15_000_000), escrow_msg(Some("8000000")));
    }

    /// Fund an escrowed order exactly like Order #12: $15 escrow, EUR 8.00 invoice, $10 max chunk.
    fn fund_order12_escrow(contract: &mut FxBudget, owner: &AccountId, requester: &AccountId) -> u64 {
        let circle = acct("usdc-circle.testnet");
        testing_env!(ctx_for(owner, 1_000_000_000_000).build());
        contract.set_input_token(circle.clone());
        testing_env!(ctx_for(&circle, 1_000_000_000_000).build());
        let res = contract.ft_on_transfer(requester.clone(), U128(15_000_000), escrow_msg(Some("8000000")));
        match res {
            PromiseOrValue::Value(unused) => assert_eq!(unused.0, 0, "all funds are accepted as escrow"),
            _ => panic!("ft_on_transfer must resolve immediately"),
        }
        let esc = contract.get_order_escrow(1).unwrap();
        assert_eq!(esc.escrowed_in.0, 15_000_000);
        assert_eq!(contract.get_invoice_summary(1).unwrap().status, OrderStatus::Active);
        1
    }

    #[test]
    fn final_chunk_consumes_only_the_adjusted_input_and_the_rest_is_refundable() {
        let (mut contract, owner, agent, requester, _supplier, _token) = init_invoice_contract();
        let id = fund_order12_escrow(&mut contract, &owner, &requester);

        // Final chunk sized by the agent: ceil(8e6 x 10e6 / 8.9645e6) = 8,924,090 USDC for the EUR 8.00 still due.
        testing_env!(ctx_for(&agent, 1_100_000_000_000).build());
        let r = contract.execute_chunk(
            id, U128(8_924_090), "sha256:order12".to_string(), -25, U128(8_000_000), Some(U128(8_000_000)), Some("order-1-seq-1".to_string()),
        );
        assert!(matches!(r, PromiseOrValue::Promise(_)));

        testing_env!(callback_ctx().build(), test_vm_config(), near_sdk::RuntimeFeesConfig::test(), Default::default(), vec![PromiseResult::Successful(vec![])]);
        let settled = contract.on_chunk_settled(id, "order-1-seq-1".to_string(), U128(8_924_090), U128(8_000_000));
        assert_eq!(settled.status, ChunkStatus::Settled);
        assert_eq!(settled.remaining_due_out.0, 0);
        assert_eq!(settled.order_status, OrderStatus::Completed);

        // Only the adjusted input is consumed; the remainder of the $15 escrow is refundable.
        let esc = contract.get_order_escrow(id).unwrap();
        assert_eq!(esc.executed_in.0, 8_924_090);
        assert_eq!(esc.remaining_escrow_in.0, 15_000_000 - 8_924_090); // 6,075,910

        testing_env!(ctx_for(&requester, 1_200_000_000_000).build());
        let refund = contract.refund_unused_escrow(id);
        assert!(matches!(refund, PromiseOrValue::Promise(_)));
        drop(refund); // schedule the promise (see note above)
        assert_eq!(get_created_receipts().len(), 2); // ft_transfer + on_escrow_refunded
        let esc = contract.get_order_escrow(id).unwrap();
        assert_eq!(esc.refunded_in.0, 6_075_910);
        assert_eq!(esc.remaining_escrow_in.0, 0);

        // A second claim cannot pay twice (fresh mocked environment so only NEW receipts are counted).
        testing_env!(ctx_for(&requester, 1_210_000_000_000).build());
        let again = contract.refund_unused_escrow(id);
        assert!(matches!(again, PromiseOrValue::Value(_)));
        assert_eq!(get_created_receipts().len(), 0);

        // If the refund transfer FAILS, the reservation rolls back so the refund can be retried.
        testing_env!(callback_ctx().build(), test_vm_config(), near_sdk::RuntimeFeesConfig::test(), Default::default(), vec![PromiseResult::Failed]);
        contract.on_escrow_refunded(id, U128(6_075_910));
        let esc = contract.get_order_escrow(id).unwrap();
        assert_eq!(esc.refunded_in.0, 0);
        assert_eq!(esc.remaining_escrow_in.0, 6_075_910);
    }

    #[test]
    fn failed_callback_leaves_invoice_due_and_consumed_escrow_unchanged() {
        let (mut contract, owner, agent, requester, _supplier, _token) = init_invoice_contract();
        let id = fund_order12_escrow(&mut contract, &owner, &requester);

        testing_env!(ctx_for(&agent, 1_100_000_000_000).build());
        contract.execute_chunk(
            id, U128(8_924_090), "sha256:order12".to_string(), -25, U128(8_000_000), Some(U128(8_000_000)), Some("order-1-seq-1".to_string()),
        );
        // While in flight nothing is consumed yet.
        let inflight = contract.get_invoice_summary(id).unwrap();
        assert_eq!(inflight.pending_in.0, 8_924_090);
        assert_eq!(inflight.executed_in.0, 0);
        assert_eq!(inflight.remaining_due_out.0, 8_000_000);

        testing_env!(callback_ctx().build(), test_vm_config(), near_sdk::RuntimeFeesConfig::test(), Default::default(), vec![PromiseResult::Failed]);
        let failed = contract.on_chunk_settled(id, "order-1-seq-1".to_string(), U128(8_924_090), U128(8_000_000));
        assert_eq!(failed.status, ChunkStatus::Failed);

        let after = contract.get_invoice_summary(id).unwrap();
        assert_eq!(after.settled_out.0, 0, "invoice due unchanged");
        assert_eq!(after.remaining_due_out.0, 8_000_000);
        assert_eq!(after.executed_in.0, 0, "no escrow consumed");
        assert_eq!(after.pending_in.0, 0);
        assert_eq!(after.pending_out.0, 0);
        assert_eq!(after.status, OrderStatus::Active);
        assert_eq!(contract.get_order_escrow(id).unwrap().remaining_escrow_in.0, 15_000_000);
        assert_eq!(contract.get_chunk_record("order-1-seq-1".to_string()).unwrap().status, ChunkStatus::Failed);
    }

    #[test]
    #[should_panic(expected = "finalized")]
    fn escrow_cannot_be_claimed_while_the_order_is_still_active() {
        let (mut contract, owner, _agent, requester, _supplier, _token) = init_invoice_contract();
        let id = fund_order12_escrow(&mut contract, &owner, &requester);
        testing_env!(ctx_for(&requester, 1_100_000_000_000).build());
        contract.refund_unused_escrow(id);
    }

    #[test]
    fn migrate_v3_preserves_orders_and_sets_the_input_token() {
        let owner = acct("dao.testnet");
        let requester = acct("operator.testnet");
        let agent = acct("agent.testnet");
        let token = acct("eure.testnet");
        let circle = acct("usdc-circle.testnet");

        testing_env!(ctx_for(&acct("fx-budget.testnet"), 1_000_000_000_000).build());

        let mut orders: IterableMap<u64, Order> = IterableMap::new(b"O");
        insert_legacy_order_into(&mut orders, 8, &requester);
        orders.flush();
        let mut requesters = IterableSet::new(b"r");
        requesters.insert(requester.clone());
        requesters.flush();
        let mut open_counts = LookupMap::new(b"c");
        open_counts.insert(requester.clone(), 1u32);
        open_counts.flush();
        let mut chunk_records: LookupMap<String, ChunkRecord> = LookupMap::new(b"k");
        chunk_records.flush();
        let mut chunk_keys: LookupMap<u64, Vec<String>> = LookupMap::new(b"l");
        chunk_keys.flush();

        let v2 = V2FxBudget {
            owner: owner.clone(),
            agent: Some(agent.clone()),
            settlement_token: Some(token.clone()),
            requesters,
            auto_cap_in: DEFAULT_AUTO_CAP_IN,
            max_chunk_in: DEFAULT_MAX_CHUNK_IN,
            min_interval_ns: DEFAULT_MIN_INTERVAL_NS,
            max_horizon_ns: DEFAULT_MAX_HORIZON_NS,
            paused: false,
            next_order_id: 9,
            orders,
            open_orders_count: open_counts,
            chunk_records,
            order_chunk_keys: chunk_keys,
        };
        env::storage_write(b"STATE", &near_sdk::borsh::to_vec(&v2).unwrap());

        let migrated = FxBudget::migrate_v3(circle.clone());
        assert_eq!(migrated.get_owner(), owner);
        assert_eq!(migrated.get_agent(), Some(agent));
        assert_eq!(migrated.get_settlement_token(), Some(token));
        assert_eq!(migrated.get_input_token(), Some(circle));
        assert_eq!(migrated.get_order(8).expect("Order #8 must survive migrate_v3").id, 8);
        assert!(migrated.is_requester(requester));
        // Raw-storage payout caps live outside the borsh state, so no cap exists until the DAO sets one.
        assert_eq!(migrated.get_order_payout_cap(8), None);
    }

    fn insert_legacy_order_into(orders: &mut IterableMap<u64, Order>, id: u64, requester: &AccountId) {
        orders.insert(
            id,
            Order {
                id,
                requester: requester.clone(),
                recipient: requester.clone(),
                invoice_ref: format!("ORDER-{}", id),
                pair_label: "USDC/EURe".to_string(),
                total_in: U128(100_000_000),
                executed_in: U128(0),
                pending_in: U128(0),
                target_out: U128(0),
                settled_out: U128(0),
                pending_out: U128(0),
                max_chunk_in: U128(50_000_000),
                deadline_ns: 2_000_000_000_000,
                max_dev_bps: 120,
                status: OrderStatus::Active,
                last_chunk_ns: 0,
                chunks_count: 0,
            },
        );
    }
}
