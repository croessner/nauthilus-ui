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
  features?: FeatureConfig[];
  brute_force_protocols?: ProtocolConfig[];
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
}

export interface TLSConfig {
  enabled?: boolean;
  cert?: string;
  key?: string;
  http_client_skip_verify?: boolean;
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
  debug_modules?: DebugModuleConfig[];
}

export interface DebugModuleConfig {
  name: string;
}

export interface BackendConfig {
  name: string;
  backend: string;
}

export interface FeatureConfig {
  name: string;
}

export interface ProtocolConfig {
  name: string;
}


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
export interface LuaConfig {
  features?: LuaFeatureConfig[];
  filters?: LuaFilterConfig[];
  actions?: LuaActionConfig[];
  custom_hooks?: LuaCustomHookConfig[];
  config?: LuaScriptConfig;
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
  init_script_path?: string;
  init_script_paths?: string[];
}

// Brute Force Configuration
export interface BruteForceConfig {
  neural_network?: NeuralNetworkConfig;
}

export interface NeuralNetworkConfig {
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
  servers?: string[];
  timeout?: string;
  cache_ttl?: string;
}

// Complete Configuration
export interface NauthilusConfig {
  server: ServerConfig;
  ldap?: LDAPConfig;
  lua?: LuaConfig;
  brute_force?: BruteForceConfig;
  rbl?: RBLConfig;
}
