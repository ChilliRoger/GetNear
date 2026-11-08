use near_sdk::json_types::U128;
use near_sdk::store::{IterableMap, IterableSet, LookupMap};
use near_sdk::{env, near, require, AccountId};
use serde::Serialize;

// ---------------------------------------------------------------------------
// Constants & Defaults
// ---------------------------------------------------------------------------

pub const DEFAULT_AUTO_CAP_IN: u128 = 100_000_000; // 100 USDC (6 decimals)
pub const DEFAULT_MAX_CHUNK_IN: u128 = 20_000_000; // 20 USDC (6 decimals)
pub const DEFAULT_MIN_INTERVAL_NS: u64 = 60_000_000_000; // 60 seconds
pub const DEFAULT_MAX_HORIZON_NS: u64 = 604_800_000_000_000; // 7 days
pub const MAX_OPEN_ORDERS_PER_REQUESTER: u32 = 16; // Bound storage griefing

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
#[derive(Clone, Debug)]
pub struct Order {
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

#[near(serializers = [json])]
#[derive(Clone, Debug)]
pub struct LimitsView {
    pub auto_cap_in: U128,
    pub max_chunk_in: U128,
    pub min_interval_ns: u64,
    pub max_horizon_ns: u64,
    pub paused: bool,
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
    /// Owner account ID (Sputnik DAO contract in P8)
    pub owner: AccountId,
    /// Automated execution agent account ID
    pub agent: Option<AccountId>,
    /// Authorized requester accounts
    pub requesters: IterableSet<AccountId>,
    /// Orders <= auto_cap_in are auto-activated; larger orders require DAO approval
    pub auto_cap_in: u128,
    /// Maximum allowable chunk size across the contract
    pub max_chunk_in: u128,
    /// Minimum interval between successive chunk executions (nanoseconds)
    pub min_interval_ns: u64,
    /// Maximum deadline horizon from creation time (nanoseconds)
    pub max_horizon_ns: u64,
    /// Emergency pause switch
    pub paused: bool,
    /// Auto-incrementing order ID counter
    pub next_order_id: u64,
    /// Orders registry
    pub orders: IterableMap<u64, Order>,
    /// Open orders count per requester (storage bounding)
    pub open_orders_count: LookupMap<AccountId, u32>,
}

impl Default for FxBudget {
    fn default() -> Self {
        env::panic_str("Contract should be initialized before usage")
    }
}

#[near]
impl FxBudget {
    // -----------------------------------------------------------------------
    // Initialization
    // -----------------------------------------------------------------------

    #[init]
    pub fn new(owner: AccountId) -> Self {
        require!(!env::state_exists(), "Already initialized");
        Self {
            owner,
            agent: None,
            requesters: IterableSet::new(b"r"),
            auto_cap_in: DEFAULT_AUTO_CAP_IN,
            max_chunk_in: DEFAULT_MAX_CHUNK_IN,
            min_interval_ns: DEFAULT_MIN_INTERVAL_NS,
            max_horizon_ns: DEFAULT_MAX_HORIZON_NS,
            paused: false,
            next_order_id: 1,
            orders: IterableMap::new(b"o"),
            open_orders_count: LookupMap::new(b"c"),
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

    // -----------------------------------------------------------------------
    // Order Lifecycle Methods
    // -----------------------------------------------------------------------

    pub fn create_order(
        &mut self,
        pair_label: String,
        total_in: U128,
        deadline_ns: u64,
        max_chunk_in: U128,
        max_dev_bps: u32,
    ) -> u64 {
        require!(!self.paused, "Contract is paused");
        let predecessor = env::predecessor_account_id();
        require!(
            self.is_requester(predecessor.clone()) || predecessor == self.owner,
            "Caller is not an authorized requester"
        );

        let now = env::block_timestamp();
        require!(total_in.0 > 0, "total_in must be positive");
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

        // Storage bounding guard
        let current_open = self.open_orders_count.get(&predecessor).copied().unwrap_or(0);
        require!(
            current_open < MAX_OPEN_ORDERS_PER_REQUESTER,
            "Requester has exceeded max allowable open orders"
        );

        let id = self.next_order_id;
        self.next_order_id = self.next_order_id.checked_add(1).expect("Order ID overflow");

        // Auto-cap evaluation: small orders become Active immediately; large orders stay Pending
        let initial_status = if total_in.0 <= self.auto_cap_in {
            OrderStatus::Active
        } else {
            OrderStatus::Pending
        };

        let order = Order {
            id,
            requester: predecessor.clone(),
            pair_label: pair_label.clone(),
            total_in,
            executed_in: U128(0),
            max_chunk_in,
            deadline_ns,
            max_dev_bps,
            status: initial_status,
            last_chunk_ns: 0,
            chunks_count: 0,
        };

        self.orders.insert(id, order.clone());
        self.open_orders_count.insert(predecessor.clone(), current_open + 1);

        #[derive(Serialize)]
        struct OrderCreatedEvent<'a> {
            id: u64,
            requester: &'a AccountId,
            pair_label: &'a str,
            total_in: U128,
            max_chunk_in: U128,
            deadline_ns: u64,
            max_dev_bps: u32,
            status: OrderStatus,
        }
        emit_event(
            "order_created",
            &OrderCreatedEvent {
                id,
                requester: &predecessor,
                pair_label: &pair_label,
                total_in,
                max_chunk_in,
                deadline_ns,
                max_dev_bps,
                status: initial_status,
            },
        );

        id
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

    pub fn cancel_order(&mut self, id: u64) {
        let predecessor = env::predecessor_account_id();
        let requester = {
            let order = self.orders.get_mut(&id).expect("Order not found");
            require!(
                predecessor == self.owner || predecessor == order.requester,
                "Only owner or order requester can cancel"
            );
            require!(
                order.status == OrderStatus::Pending || order.status == OrderStatus::Active,
                "Only Pending or Active orders can be cancelled"
            );

            order.status = OrderStatus::Cancelled;
            order.requester.clone()
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
    }

    /// Execute a chunk against an active order.
    ///
    /// Callable only by the designated agent (or owner).
    /// Pure testnet accounting: no deposit required and no tokens move on-chain.
    /// `deviation_bps` and `simulated_out` are agent-reported and verified against policy.
    pub fn execute_chunk(
        &mut self,
        id: u64,
        amount_in: U128,
        quote_ref: String,
        deviation_bps: i32,
        simulated_out: U128,
    ) {
        require!(!self.paused, "Contract is paused");
        self.assert_agent_or_owner();

        let now = env::block_timestamp();
        let order = self.orders.get_mut(&id).expect("Order not found");

        require!(order.status == OrderStatus::Active, "Order is not Active");
        require!(now < order.deadline_ns, "Order deadline has passed");
        require!(amount_in.0 > 0, "amount_in must be positive");
        require!(
            amount_in.0 <= order.max_chunk_in.0,
            "amount_in exceeds order max_chunk_in"
        );

        let new_executed_in = order
            .executed_in
            .0
            .checked_add(amount_in.0)
            .expect("executed_in overflow");
        require!(
            new_executed_in <= order.total_in.0,
            "executed_in exceeds order total_in"
        );

        if order.chunks_count > 0 {
            require!(
                now.saturating_sub(order.last_chunk_ns) >= self.min_interval_ns,
                "Minimum interval between chunks has not elapsed"
            );
        }

        // Deviation guard: reject if adverse deviation exceeds order limit
        require!(
            deviation_bps >= -(order.max_dev_bps as i32),
            "Adverse deviation exceeds order max_dev_bps tolerance"
        );

        order.executed_in = U128(new_executed_in);
        order.last_chunk_ns = now;
        order.chunks_count = order.chunks_count.checked_add(1).expect("chunk count overflow");

        let completed = new_executed_in == order.total_in.0;
        let mut completed_requester = None;
        if completed {
            order.status = OrderStatus::Completed;
            completed_requester = Some(order.requester.clone());
        }

        let chunks_count = order.chunks_count;
        let final_status = order.status;

        if let Some(r) = completed_requester {
            self.decrement_open_orders(&r);
        }

        #[derive(Serialize)]
        struct ChunkExecutedEvent<'a> {
            id: u64,
            amount_in: U128,
            executed_in: U128,
            quote_ref: &'a str,
            deviation_bps: i32,
            simulated_out: U128,
            chunks_count: u32,
            status: OrderStatus,
        }
        emit_event(
            "chunk_executed",
            &ChunkExecutedEvent {
                id,
                amount_in,
                executed_in: U128(new_executed_in),
                quote_ref: &quote_ref,
                deviation_bps,
                simulated_out,
                chunks_count,
                status: final_status,
            },
        );
    }

    pub fn expire_order(&mut self, id: u64) {
        let now = env::block_timestamp();
        let requester = {
            let order = self.orders.get_mut(&id).expect("Order not found");
            require!(
                order.status == OrderStatus::Pending || order.status == OrderStatus::Active,
                "Order is already finalized"
            );
            require!(now >= order.deadline_ns, "Order deadline has not yet passed");

            order.status = OrderStatus::Expired;
            order.requester.clone()
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
}
