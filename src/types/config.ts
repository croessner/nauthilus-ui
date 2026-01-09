// Configuration interfaces based on the Go structs in the config package

export interface ServerConfig {
  address?: string;
  max_concurrent_requests?: number;
  max_password_history_entries?: number;
  http3?: boolean;
  haproxy_v2?: boolean;
  disabled_endpoints?: EndpointConfig;
  tls?: TLSConfig;
  basic_auth?: BasicAuthConfig;
  jwt_auth?: JWTAuthConfig;
  instance_name?: string;
  log?: LogConfig;
  backends?: BackendConfig[];
  features?: string[];
  brute_force_protocols?: string[];
  ory_hydra_admin_url?: string;
  dns?: DNSConfig;
  insights?: InsightsConfig;
  redis: RedisConfig;
  master_user?: MasterUserConfig;
  frontend?: FrontendConfig;
  prometheus_timer?: PrometheusTimerConfig;
  default_http_request_header?: DefaultHTTPRequestHeaderConfig;
  http_client?: HTTPClientConfig;
  compression?: CompressionConfig;
  keep_alive?: KeepAliveConfig;
  // New: server.middlewares (feature switches for HTTP middlewares)
  middlewares?: MiddlewaresConfig;
  timeouts?: TimeoutsConfig;
  dedup?: DeDupConfig;
}

export interface EndpointConfig {
  auth_header?: boolean;
  auth_json?: boolean;
  auth_basic?: boolean;
  auth_nginx?: boolean;
  auth_saslauthd?: boolean;
  auth_jwt?: boolean;
  custom_hooks?: boolean;
  configuration: boolean;
}

export interface TLSConfig {
  enabled?: boolean;
  cert?: string;
  key?: string;
  skip_verify?: boolean;
  ca_file?: string;
  min_tls_version?: string;
  cipher_suites?: string[];
}

export interface BasicAuthConfig {
  enabled?: boolean;
  username?: string;
  password?: string;
}

export interface JWTAuthConfig {
  enabled?: boolean;
  secret_key?: string;
  token_expiry?: string;
  refresh_token?: boolean;
  refresh_token_expiry?: string;
  users?: JWTUserConfig[];
  store_in_redis?: boolean;
}

export interface JWTUserConfig {
  username: string;
  password: string;
  roles?: string[];
}

export interface LogConfig {
  json?: boolean;
  color?: boolean;
  level?: string;
  debug_modules?: string[];
}

export type BackendConfig = string;

export interface DNSConfig {
  resolver?: string;
  timeout?: string;
  resolve_client_ip?: boolean;
}

export interface InsightsConfig {
  enable_pprof?: boolean;
  enable_block_profile?: boolean;
  monitor_connections?: boolean;
  // New: tracing block
  tracing?: TracingConfig;
}

export interface TracingConfig {
  enabled?: boolean;
  exporter?: 'otlphttp' | 'none';
  endpoint?: string;
  sampler_ratio?: number; // 0..1
  service_name?: string;
  propagators?: Array<'tracecontext' | 'baggage' | 'b3' | 'b3multi' | 'jaeger'>;
  enable_redis?: boolean;
  tls?: TLSConfig;
  log_export_results?: boolean;
}

export interface RedisConfig {
  database_number?: number;
  prefix?: string;
  password_nonce?: string;
  pool_size?: number;
  idle_pool_size?: number;
  tls?: TLSConfig;
  positive_cache_ttl?: string;
  negative_cache_ttl?: string;
  // New connection/timeout tuning fields (mirrors backend server/config)
  // Note: durations are represented as strings like "80ms", "3s", "5m".
  pool_timeout?: string;
  dial_timeout?: string;
  read_timeout?: string;
  write_timeout?: string;
  pool_fifo?: boolean;
  conn_max_idle_time?: string;
  max_retries?: number;
  master?: MasterConfig;
  replica?: ReplicaConfig;
  sentinels?: SentinelsConfig;
  cluster?: ClusterConfig;
  // New: server.redis.account_local_cache
  account_local_cache?: AccountLocalCacheConfig;
  // New: server.redis.batching
  batching?: RedisBatchingConfig;
  // New: server.redis.client_tracking
  client_tracking?: RedisClientTrackingConfig;
  // New: feature flags
  identity_enabled?: boolean;
  maint_notifications_enabled?: boolean;
  protocol?: 0 | 2 | 3;
}

export interface MasterConfig {
  address?: string;
  username?: string;
  password?: string;
}

export interface ReplicaConfig {
  address?: string;
  addresses?: string[];
}

export interface SentinelsConfig {
  master: string;
  addresses: string[];
  username?: string;
  password?: string;
}

export interface ClusterConfig {
  addresses: string[];
  username?: string;
  password?: string;
  route_by_latency?: boolean;
  route_randomly?: boolean;
  read_only?: boolean; // Deprecated: Use route_reads_to_replicas instead
  route_reads_to_replicas?: boolean;
  max_redirects?: number;
  read_timeout?: string;
  write_timeout?: string;
}

// Matches backend: ServerSection.Middlewares
export interface MiddlewaresConfig {
  logging?: boolean;
  limit?: boolean;
  recovery?: boolean;
  trusted_proxies?: boolean;
  request_decompression?: boolean;
  response_compression?: boolean;
  metrics?: boolean;
}

export interface MasterUserConfig {
  enabled?: boolean;
  delimiter?: string;
}

export interface FrontendConfig {
  enabled?: boolean;
  csrf_secret?: string;
  cookie_store_auth_key?: string;
  cookie_store_encryption_key?: string;
}

export interface PrometheusTimerConfig {
  enabled?: boolean;
  labels?: string[];
}

export interface DefaultHTTPRequestHeaderConfig {
  username?: string;
  password?: string;
  password_encoded?: string;
  protocol?: string;
  login_attempt?: string;
  auth_method?: string;
  local_ip?: string;
  local_port?: string;
  client_ip?: string;
  client_port?: string;
  client_host?: string;
  client_id?: string;
  ssl?: string;
  ssl_session_id?: string;
  ssl_verify?: string;
  ssl_subject?: string;
  ssl_client_cn?: string;
  ssl_issuer?: string;
  ssl_client_not_before?: string;
  ssl_client_not_after?: string;
  ssl_subject_dn?: string;
  ssl_issuer_dn?: string;
  ssl_client_subject_dn?: string;
  ssl_client_issuer_dn?: string;
  ssl_cipher?: string;
  ssl_protocol?: string;
  ssl_serial?: string;
  ssl_fingerprint?: string;
  oidc_cid?: string;
}

export interface HTTPClientConfig {
  max_connections_per_host?: number;
  max_idle_connections?: number;
  max_idle_connections_per_host?: number;
  idle_connection_timeout?: string;
  proxy?: string;
  tls?: TLSConfig;
}

export interface CompressionConfig {
  enabled?: boolean;
  algorithms?: string[];
  level_gzip?: number;
  level_zstd?: number;
  level_brotli?: number;
  min_length?: number;
}

export interface KeepAliveConfig {
  enabled?: boolean;
  timeout?: string;
  max_idle_connections?: number;
  max_idle_connections_per_host?: number;
}

export interface TimeoutsConfig {
  redis_read?: string;
  redis_write?: string;
  ldap_search?: string;
  ldap_bind?: string;
  ldap_modify?: string;
  singleflight_work?: string;
  lua_backend?: string;
}

export interface DeDupConfig {
  in_process_enabled?: boolean;
}

// Matches backend: AccountLocalCache
export interface AccountLocalCacheConfig {
  enabled?: boolean;
  ttl?: string; // duration string, e.g., "5m"
  shards?: number;
  cleanup_interval?: string; // duration string
  max_items?: number;
}

// Matches backend: RedisBatching
export interface RedisBatchingConfig {
  enabled?: boolean;
  max_batch_size?: number;
  max_wait?: string; // duration string, e.g., "2ms"
  queue_capacity?: number;
  skip_commands?: string[];
  pipeline_timeout?: string; // duration string
}

// Matches backend: RedisClientTracking
export interface RedisClientTrackingConfig {
  enabled?: boolean;
  bcast?: boolean;
  noloop?: boolean;
  opt_in?: boolean;
  opt_out?: boolean;
  prefixes?: string[];
}

// LDAP Configuration
export interface LDAPConfig {
  config: LDAPConfConfig;
  optional_ldap_pools?: Record<string, LDAPConfConfig>;
  search?: LDAPSearchProtocolConfig[];
}

export interface LDAPConfConfig {
  // Core toggles
  pool_only?: boolean;
  start_tls?: boolean;
  tls_skip_verify?: boolean;
  sasl_external?: boolean;

  // Worker and pools (legacy worker retained for backward-compat only)
  number_of_workers?: number; // Deprecated in v1.10.0 (kept for import-compat)
  lookup_pool_size: number;
  lookup_idle_pool_size?: number;
  auth_pool_size?: number;
  auth_idle_pool_size?: number;

  // Queues / Backpressure (v1.10.0)
  lookup_queue_length?: number; // 0 = unlimited
  auth_queue_length?: number;   // 0 = unlimited

  // Per-operation timeouts (v1.10.0)
  search_timeout?: string; // e.g., "2s", "0" uses library default
  bind_timeout?: string;   // e.g., "1s", "0" uses library default
  modify_timeout?: string; // e.g., "2s", "0" uses library default

  // Server-side limits (v1.10.0)
  search_size_limit?: number; // 0 = server default/unlimited
  search_time_limit?: string; // e.g., "3s", 0 = server default

  // Retry/Backoff (v1.10.0)
  retry_max?: number;
  retry_base?: string;        // e.g., "200ms"
  retry_max_backoff?: string; // e.g., "2s"

  // Circuit breaker (v1.10.0)
  cb_failure_threshold?: number; // default 5
  cb_cooldown?: string;          // e.g., "30s"
  cb_half_open_max?: number;     // default 1

  // Health checks (v1.10.0)
  health_check_interval?: string; // default 10s
  health_check_timeout?: string;  // default 1.5s

  // Caching (v1.10.0)
  dn_cache_ttl?: string;          // 0 disables
  membership_cache_ttl?: string;  // 0 disables
  negative_cache_ttl?: string;    // 0 disables
  cache_max_entries?: number;     // applies to LRU impl
  cache_impl?: 'ttl' | 'lru';
  include_raw_result?: boolean;   // default false

  // Rate limiting (v1.10.0)
  auth_rate_limit_per_second?: number; // 0 disables
  auth_rate_limit_burst?: number;      // 0 disables

  // Bind & TLS
  bind_dn?: string;
  bind_pw?: string;
  tls_ca_cert?: string;
  tls_client_cert?: string;
  tls_client_key?: string;

  // Pool exhaustion fast-fail
  connect_abort_timeout?: string;

  // Targets
  server_uri: string[];
}

export interface LDAPSearchProtocolConfig {
  protocol: string[];
  cache_name: string;
  pool_name?: string;
  base_dn: string;
  scope?: string;
  filter: LDAPFilterConfig;
  mapping: LDAPAttributeMappingConfig;
  attribute: string[];
}

export interface LDAPFilterConfig {
  user?: string;
  list_accounts?: string;
  webauthn_credentials?: string;
}

export interface LDAPAttributeMappingConfig {
  account_field: string;
  totp_secret_field?: string;
  totp_recovery_field?: string;
  display_name_field?: string;
  credential_object?: string;
  credential_id_field?: string;
  public_key_field?: string;
  unique_user_id_field?: string;
  aaguid_field?: string;
  sign_count_field?: string;
}

// Lua Configuration
export interface LuaSearchProtocolConfig {
  protocol: string[];
  cache_name: string;
  backend_name?: string;
}

export interface LuaHookConfig {
  enabled: boolean;
  endpoint_path: string;
}

export interface LuaHooksConfig {
  distributed_brute_force_admin?: LuaHookConfig;
  distributed_brute_force_test?: LuaHookConfig;
  // UI-only persisted state for the Distributed Brute-Force tools page.
  // Note: This is not a backend Lua hook. It stores view preferences/state
  // such as selected tab and form values. Kept broad on purpose to allow
  // evolution without frequent type updates.
  distributed_brute_force_ui?: any;
}

export interface LuaConfig {
  features?: LuaFeatureConfig[];
  filters?: LuaFilterConfig[];
  actions?: LuaActionConfig[];
  custom_hooks?: LuaCustomHookConfig[];
  config?: LuaScriptConfig;
  search?: LuaSearchProtocolConfig[];
  optional_lua_backends?: Record<string, LuaScriptConfig>;
  hooks?: LuaHooksConfig;
}

export interface LuaFeatureConfig {
  name: string;
  script_path: string;
}

export interface LuaFilterConfig {
  name: string;
  script_path: string;
  when_authenticated?: boolean;
  when_unauthenticated?: boolean;
  when_no_auth?: boolean;
}

export interface LuaActionConfig {
  type: string;
  name: string;
  script_path: string;
}

export interface LuaCustomHookConfig {
  http_location: string;
  http_method: string;
  script_path: string;
  roles?: string[];
}

export interface LuaScriptConfig {
  // Legacy worker count (deprecated in v1.10.0, use backend_number_of_workers)
  number_of_workers?: number;

  // Core paths
  package_path?: string;
  backend_script_path?: string;
  init_script_path?: string;
  init_script_paths?: string[];

  // Tuning (v1.10.0)
  backend_number_of_workers?: number; // replaces number_of_workers
  action_number_of_workers?: number;  // default: 10; VM pool coupled 1:1
  queue_length?: number;              // 0 = unlimited

  // VM pool sizes (fallback to backend_number_of_workers when unset)
  feature_vm_pool_size?: number;
  filter_vm_pool_size?: number;
  hook_vm_pool_size?: number;

  // IP Scoping (0 disables)
  ip_scoping_v6_cidr?: number;
  ip_scoping_v4_cidr?: number;
}

// Brute Force Configuration
export interface BruteForceConfig {
  soft_whitelist?: Record<string, string[]>;
  ip_whitelist?: string[];
  buckets?: BruteForceRuleConfig[];
  tolerate_percent?: number;
  custom_tolerations?: TolerateConfig[];
  tolerate_ttl?: string;
  adaptive_toleration?: boolean;
  min_tolerate_percent?: number;
  max_tolerate_percent?: number;
  scale_factor?: number;
  pw_history_for_known_accounts?: boolean; // mapstructure: "pw_history_for_known_accounts"
  cold_start_grace_enabled?: boolean;
  cold_start_grace_ttl?: string;
  ip_scoping?: IPScoping; // mapstructure: "ip_scoping"
  rwp_allowed_unique_hashes?: number;
  rwp_window?: string;
}

export interface IPScoping {
  rwp_ipv6_cidr?: number; // mapstructure: "rwp_ipv6_cidr" validate: "omitempty,min=1,max=128" (0 disables)
  tolerations_ipv6_cidr?: number; // mapstructure: "tolerations_ipv6_cidr" validate: "omitempty,min=1,max=128" (0 disables)
}

export interface BruteForceRuleConfig {
  name: string;
  period: string;
  cidr: number;
  ipv4?: boolean;
  ipv6?: boolean;
  failed_requests: number;
  filter_by_protocol?: string[];
  filter_by_oidc_cid?: string[];
}

export interface TolerateConfig {
  ip_address: string;
  tolerate_percent: number;
  tolerate_ttl: string;
  adaptive_toleration?: boolean;
  min_tolerate_percent?: number;
  max_tolerate_percent?: number;
  scale_factor?: number;
}

// RBL Configuration
export interface RBLConfig {
  soft_whitelist?: Record<string, string[]>;
  lists?: RBLListConfig[];
  threshold?: number;
  ip_whitelist?: string[];
}

export interface RBLListConfig {
  name: string;
  rbl: string;
  return_codes: string[];
  allow_failure?: boolean;
  weight?: number;
  ipv4?: boolean;
  ipv6?: boolean;
}

// Relay Domains Configuration
export interface RelayDomainsConfig {
  soft_whitelist?: Record<string, string[]>;
  static?: string[];
}

// Backend Server Monitoring Configuration
export interface BackendServerMonitoringConfig {
  backend_servers?: BackendServerConfig[];
}

export interface BackendServerConfig {
  protocol: string;
  host: string;
  deep_check?: boolean;
  request_uri?: string;
  test_username?: string;
  test_password?: string;
  port?: number;
  tls?: boolean;
  tls_skip_verify?: boolean;
  haproxy_v2?: boolean;
}

// OAuth2 Configuration
export interface Oauth2Config {
  custom_scopes?: Oauth2CustomScopeConfig[];
  clients?: Oauth2ClientConfig[];
}

export interface Oauth2CustomScopeConfig {
  name: string;
  description: string;
  claims: OIDCCustomClaimConfig[];
}

export interface OIDCCustomClaimConfig {
  name: string;
  type: string;
}

export interface Oauth2ClientConfig {
  skip_consent?: boolean;
  skip_totp?: boolean;
  name: string;
  client_id: string;
  subject: string;
  claims: IdTokenClaimsConfig;
}

export interface IdTokenClaimsConfig {
  email?: string;
  email_verified?: boolean;
  name?: string;
  given_name?: string;
  family_name?: string;
  middle_name?: string;
  nickname?: string;
  preferred_username?: string;
  profile?: string;
  picture?: string;
  website?: string;
  gender?: string;
  birthdate?: string;
  zoneinfo?: string;
  locale?: string;
  phone_number?: string;
  phone_number_verified?: boolean;
  address?: string;
  updated_at?: string;
}

// Connection Configuration
export interface ConnectionJWTAuthConfig {
  enabled?: boolean;
  username?: string;
  password?: string;
  token?: string;
  refresh_token?: string;
  expires_at?: number;
}

export interface ConnectionConfig {
  backend_url?: string;
  basic_auth?: BasicAuthConfig;
  jwt_auth?: ConnectionJWTAuthConfig;
}

// Complete Configuration
export interface NauthilusConfig {
  server: ServerConfig;
  ldap?: LDAPConfig;
  lua?: LuaConfig;
  oauth2?: Oauth2Config;
  brute_force?: BruteForceConfig;
  realtime_blackhole_lists?: RBLConfig;
  relay_domains?: RelayDomainsConfig;
  backend_server_monitoring?: BackendServerMonitoringConfig;
  cleartext_networks?: string[];
}
