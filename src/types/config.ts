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
  master?: MasterConfig;
  replica?: ReplicaConfig;
  sentinels?: SentinelsConfig;
  cluster?: ClusterConfig;
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
  level?: number;
  content_types?: string[];
  min_length?: number;
}

export interface KeepAliveConfig {
  enabled?: boolean;
  timeout?: string;
  max_idle_connections?: number;
  max_idle_connections_per_host?: number;
}

// LDAP Configuration
export interface LDAPConfig {
  config: LDAPConfConfig;
  optional_ldap_pools?: Record<string, LDAPConfConfig>;
  search?: LDAPSearchProtocolConfig[];
}

export interface LDAPConfConfig {
  pool_only?: boolean;
  start_tls?: boolean;
  tls_skip_verify?: boolean;
  sasl_external?: boolean;
  number_of_workers?: number;
  lookup_pool_size: number;
  lookup_idle_pool_size?: number;
  auth_pool_size?: number;
  auth_idle_pool_size?: number;
  bind_dn?: string;
  bind_pw?: string;
  tls_ca_cert?: string;
  tls_client_cert?: string;
  tls_client_key?: string;
  connect_abort_timeout?: string;
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

export interface LuaConfig {
  features?: LuaFeatureConfig[];
  filters?: LuaFilterConfig[];
  actions?: LuaActionConfig[];
  custom_hooks?: LuaCustomHookConfig[];
  config?: LuaScriptConfig;
  search?: LuaSearchProtocolConfig[];
  optional_lua_backends?: Record<string, LuaScriptConfig>;
}

export interface LuaFeatureConfig {
  name: string;
  script_path: string;
}

export interface LuaFilterConfig {
  name: string;
  script_path: string;
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
  number_of_workers?: number;
  package_path?: string;
  backend_script_path?: string;
  init_script_path?: string;
  init_script_paths?: string[];
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
  neural_network?: NeuralNetworkConfig;
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

export interface NeuralNetworkConfig {
  dry_run?: boolean;
  max_training_records?: number;
  hidden_neurons?: number;
  activation_function?: string;
  static_weight?: number;
  ml_weight?: number;
  threshold?: number;
  learning_rate?: number;
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
  connection?: ConnectionConfig;
}
