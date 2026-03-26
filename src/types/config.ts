// Configuration interfaces based on the Go structs in the config package

export interface FeatureConfig {
  name: string;
  when_authenticated?: boolean;
  when_unauthenticated?: boolean;
  when_no_auth?: boolean;
}

export interface ServerConfig {
  address?: string;
  max_concurrent_requests?: number;
  max_password_history_entries?: number;
  rate_limit_per_second?: number;
  rate_limit_burst?: number;
  http3?: boolean;
  haproxy_v2?: boolean;
  smtp_backend_address?: string;
  smtp_backend_port?: number;
  imap_backend_address?: string;
  imap_backend_port?: number;
  pop3_backend_address?: string;
  pop3_backend_port?: number;
  nginx_wait_delay?: number;
  max_login_attempts?: number;
  lua_script_timeout?: string;
  local_cache_auth_ttl?: string;
  disabled_endpoints?: EndpointConfig;
  tls?: TLSConfig;
  basic_auth?: BasicAuthConfig;
  oidc_auth?: OIDCAuthConfig;
  instance_name?: string;
  log?: LogConfig;
  backends?: BackendConfig[];
  features?: (string | FeatureConfig)[];
  brute_force_protocols?: string[];
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
  trusted_proxies?: string[];
  run_as_user?: string;
  run_as_group?: string;
  chroot?: string;
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

export interface OIDCAuthConfig {
  enabled?: boolean;
}

export interface LogConfig {
  json?: boolean;
  color?: boolean;
  level?: string;
  debug_modules?: string[];
  add_source?: boolean;
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
  encryption_secret?: string;
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
  rate?: boolean;
}

export interface MasterUserConfig {
  enabled?: boolean;
  delimiter?: string;
}

export interface FrontendConfig {
  enabled?: boolean;
  encryption_secret?: string;
  html_static_content_path?: string;
  language_resources?: string;
  languages?: string[];
  default_language?: string;
  totp_issuer?: string;
  totp_skew?: number;
  security_headers?: FrontendSecurityHeadersConfig;
}

export interface FrontendSecurityHeadersConfig {
  enabled?: boolean;
  content_security_policy?: string;
  content_security_policy_report_only?: boolean;
  strict_transport_security?: string;
  x_content_type_options?: string;
  x_frame_options?: string;
  referrer_policy?: string;
  permissions_policy?: string;
  cross_origin_opener_policy?: string;
  cross_origin_resource_policy?: string;
  cross_origin_embedder_policy?: string;
  x_permitted_cross_domain_policies?: string;
  x_dns_prefetch_control?: string;
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
  content_types?: string[];
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
  lua_script?: string;
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
  pool_only?: boolean; // Deprecated backend fallback, kept for import compatibility
  lookup_pool_only?: boolean;
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
  encryption_secret?: string;
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
}

export interface LDAPAttributeMappingConfig {
  account_field: string;
  totp_secret_field?: string;
  totp_recovery_field?: string;
  totp_object_class?: string;
  totp_recovery_object_class?: string;
  display_name_field?: string;
  webauthn_credential_field?: string;
  webauthn_object_class?: string;
  unique_user_id_field?: string;
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
  when_authenticated?: boolean;
  when_unauthenticated?: boolean;
  when_no_auth?: boolean;
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
  content_type?: string;
  script_path: string;
  scopes?: string[];
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
  learning?: (string | FeatureConfig)[];
  tolerate_ttl?: string;
  adaptive_toleration?: boolean;
  min_tolerate_percent?: number;
  max_tolerate_percent?: number;
  scale_factor?: number;
  pw_history_for_known_accounts?: boolean; // mapstructure: "pw_history_for_known_accounts"
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
  ban_time?: string;
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

// IdP Configuration
export interface IdPConfig {
  oidc?: IdPOIDCConfig;
  saml2?: IdPSAML2Config;
  webauthn?: IdPWebAuthnConfig;
  remember_me_ttl?: string;
  terms_of_service_url?: string;
  privacy_policy_url?: string;
}

export interface IdPWebAuthnConfig {
  rp_display_name?: string;
  rp_id?: string;
  rp_origins?: string[];
  authenticator_attachment?: string;
  resident_key?: string;
  user_verification?: string;
}

export interface IdPOIDCConfig {
  enabled?: boolean;
  issuer?: string;
  signing_keys?: IdPOIDCKeyConfig[];
  auto_key_rotation?: boolean;
  key_rotation_interval?: string;
  key_max_age?: string;
  clients?: IdPOIDCClientConfig[];
  custom_scopes?: IdPOIDCCustomScopeConfig[];
  scopes_supported?: string[];
  response_types_supported?: string[];
  grant_types_supported?: string[];
  subject_types_supported?: string[];
  id_token_signing_alg_values_supported?: string[];
  token_endpoint_auth_methods_supported?: string[];
  code_challenge_methods_supported?: string[];
  claims_supported?: string[];
  front_channel_logout_supported?: boolean;
  front_channel_logout_session_supported?: boolean;
  back_channel_logout_supported?: boolean;
  back_channel_logout_session_supported?: boolean;
  access_token_type?: string;
  default_access_token_lifetime?: string;
  default_refresh_token_lifetime?: string;
  consent_ttl?: string;
  consent_mode?: string;
  token_endpoint_allow_get?: boolean;
  device_code_expiry?: string;
  device_code_polling_interval?: number;
  device_code_user_code_length?: number;
}

export interface IdPOIDCKeyConfig {
  id?: string;
  key?: string;
  key_file?: string;
  algorithm?: string;
  active?: boolean;
}

export interface IdPOIDCCustomScopeConfig {
  name?: string;
  description?: string;
  claims?: IdPOIDCCustomClaimConfig[];
}

export interface IdPOIDCCustomClaimConfig {
  name?: string;
  type?: string;
}

export interface IdPOIDCClaimMappingConfig {
  claim?: string;
  attribute?: string;
  type?: string;
}

export interface IdPOIDCIdTokenClaimsConfig {
  mappings?: IdPOIDCClaimMappingConfig[];
}

export interface IdPOIDCAccessTokenClaimsConfig {
  mappings?: IdPOIDCClaimMappingConfig[];
}

export interface IdPOIDCClientConfig {
  name?: string;
  client_id?: string;
  client_secret?: string;
  redirect_uris?: string[];
  scopes?: string[];
  grant_types?: string[];
  require_mfa?: string[];
  supported_mfa?: string[];
  post_logout_redirect_uris?: string[];
  backchannel_logout_uri?: string;
  frontchannel_logout_uri?: string;
  logout_redirect_uri?: string;
  access_token_type?: string;
  token_endpoint_auth_method?: string;
  client_public_key?: string;
  client_public_key_file?: string;
  client_public_key_algorithm?: string;
  id_token_claims?: IdPOIDCIdTokenClaimsConfig;
  access_token_claims?: IdPOIDCAccessTokenClaimsConfig;
  access_token_lifetime?: string;
  refresh_token_lifetime?: string;
  consent_ttl?: string;
  consent_mode?: string;
  required_scopes?: string[];
  optional_scopes?: string[];
  skip_consent?: boolean;
  delayed_response?: boolean;
  frontchannel_logout_session_required?: boolean;
}

export interface IdPSAML2Config {
  enabled?: boolean;
  entity_id?: string;
  cert?: string;
  cert_file?: string;
  key?: string;
  key_file?: string;
  service_providers?: IdPSAML2ServiceProviderConfig[];
  signature_method?: string;
  default_expire_time?: string;
  name_id_format?: string;
  slo?: IdPSAML2SLOConfig;
}

export interface IdPSAML2SLOConfig {
  enabled?: boolean;
  front_channel_enabled?: boolean;
  back_channel_enabled?: boolean;
  request_timeout?: string;
  max_participants?: number;
  back_channel_max_retries?: number;
}

export interface IdPSAML2ServiceProviderConfig {
  name?: string;
  entity_id?: string;
  acs_url?: string;
  slo_url?: string;
  slo_back_channel_url?: string;
  cert?: string;
  cert_file?: string;
  authn_requests_signed?: boolean;
  logout_requests_signed?: boolean;
  logout_responses_signed?: boolean;
  allowed_attributes?: string[];
  require_mfa?: string[];
  supported_mfa?: string[];
  logout_redirect_uri?: string;
  delayed_response?: boolean;
}

// Connection Configuration
export interface ConnectionOIDCAuthConfig {
  enabled?: boolean;
  token_endpoint_auth_method?: 'client_secret_post' | 'client_secret_basic' | 'private_key_jwt';
  client_id?: string;
  client_secret?: string;
  private_key_pem?: string;
  private_key_algorithm?: 'RS256' | 'EDDSA';
  private_key_id?: string;
  client_assertion_ttl_seconds?: number;
  discovery_mode?: 'auto' | 'manual' | 'off';
  discovery_url?: string;
  token_endpoint?: string;
  introspection_mode?: 'auto' | 'always' | 'never';
  introspection_endpoint?: string;
  introspection_auth_method?: 'auto' | 'client_secret_post' | 'client_secret_basic' | 'private_key_jwt';
  scope?: string;
  token?: string;
  expires_at?: number;
}

export interface ConnectionConfig {
  backend_url?: string;
  basic_auth?: BasicAuthConfig;
  oidc_auth?: ConnectionOIDCAuthConfig;
  ssh_tunnel?: ConnectionSSHTunnelConfig;
}

export interface ConnectionSSHTunnelConfig {
  enabled?: boolean;
  remote_target?: string;
  remote_port?: number;
}

// Complete Configuration
export interface NauthilusConfig {
  server: ServerConfig;
  ldap?: LDAPConfig;
  lua?: LuaConfig;
  idp?: IdPConfig;
  brute_force?: BruteForceConfig;
  realtime_blackhole_lists?: RBLConfig;
  relay_domains?: RelayDomainsConfig;
  backend_server_monitoring?: BackendServerMonitoringConfig;
  cleartext_networks?: string[];
}
