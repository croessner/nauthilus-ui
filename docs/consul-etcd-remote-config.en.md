# Centralized configuration with Consul/etcd for Nauthilus

This note summarizes our discussion and design decisions for centralized configuration using HashiCorp Consul and etcd. It serves as a reference for implementation, operations, and later UI integration (nauthilus-ui), so configuration changes can be distributed conveniently.

Contents
- Goals and overview
- Architecture and terminology
- Backend comparison: Consul vs. etcd (and a Kubernetes alternative)
- Configuration sources and CLI/URL schema
- Implementation with Viper Remote (load) and hooks (save/reload)
- Watch/Reload strategies
- UI integration (nauthilus-ui)
- Security (ACL/TLS/RBAC/Secrets)
- Operations (Backup/Restore, Observability, DR)
- Migration path & fallback logic
- Troubleshooting & test checklists
- Roadmap & extensibility
- Appendix: Example configurations, CLI snippets, environment variables

---

## 1) Goals and overview

- Central, versionable configuration for Nauthilus.
- Selectable backends: local file (YAML) or remote (Consul KV, etcd v3).
- Switchable via CLI flags, no code changes required.
- Explicit hooks: existing Load-Config; new: Save-Config and Reload (manually triggered; no auto-reload without a hook).
- UI goal: nauthilus-ui can create configuration changes and distribute them to all instances (via server API + remote store).
- Robustness: optimistic locking/compare-and-swap (CAS), conflict handling, validation.

## 2) Architecture and terminology

- Source of Truth: a clearly chosen backend per deployment: file | consul | etcd.
- Viper: reads configuration from file or remote (package `github.com/spf13/viper/remote`).
- Hooks in the server:
  - LoadConfig: loads into viper + unmarshals into a Config struct.
  - SaveConfig: serializes the current/posted config and writes it to the remote backend (Viper does not write back).
  - Reload: loads again from the selected backend and applies values at runtime.
- Abstraction layer “RemoteProvider”: enables additional providers later (e.g., SSM/Secrets Manager).

## 3) Backend comparison

### Consul
- Pros: simple KV, solid ACLs, blocking queries (WaitIndex), widely adopted.
- CAS via `KV.CAS` with `ModifyIndex`.
- Token via env (`CONSUL_HTTP_TOKEN`) or set explicitly on the client.

### etcd (separate cluster!)
- Important: Do not use Kubernetes control-plane etcd for application data. Applications should not access the internal etcd (stability, security, ops; most managed K8s block it).
- Instead: run your own etcd cluster for app configuration.
- Pros: strongly consistent KV, transactions, watch API.
- CAS via ModRevision + `Txn(Compare(ModRevision==x)).Then(Put)`.

### Kubernetes alternative
- Without an external KV: use ConfigMap/Secret/CRD as the source of truth through the Kubernetes API; protected by RBAC. Great for GitOps.
- Reload via watch/informer or sidecar (reloader). Not part of the first iteration, but compatible.

## 4) Configuration sources and CLI/URL schema

Option A: single `--config` flag with schemes:
- `file:/etc/nauthilus/config.yaml`
- `consul://127.0.0.1:8500/nauthilus/config.yaml`
- `etcd://etcd-0:2379,etcd-1:2379/nauthilus/config.yaml`

Option B (simpler, less magic):
- `--config-backend=file|consul|etcd`
- `--config-file=/path/to/config.yaml`
- `--consul-addr=127.0.0.1:8500`, `--consul-path=nauthilus/config.yaml`, `--consul-token=...`
- `--etcd-endpoints=etcd-0:2379,etcd-1:2379`, `--etcd-key=/nauthilus/config.yaml`

Fallback: when no backend is set -> file.

## 5) Implementation – Load with Viper Remote, save via hooks

Blank-import to enable remote providers:
```go
import (
    "strings"
    "github.com/spf13/viper"
    _ "github.com/spf13/viper/remote"
)
```

Load from file:
```go
func loadConfigFromFile(file string) error {
    viper.SetConfigFile(file)
    return viper.ReadInConfig()
}
```

Load from Consul:
```go
import (
    "os"
)

func loadConfigFromConsul(addr, path, token string) error {
    if token != "" { _ = os.Setenv("CONSUL_HTTP_TOKEN", token) }
    if err := viper.AddRemoteProvider("consul", addr, path); err != nil { return err }
    switch {
    case strings.HasSuffix(path, ".yaml"), strings.HasSuffix(path, ".yml"): viper.SetConfigType("yaml")
    case strings.HasSuffix(path, ".json"): viper.SetConfigType("json")
    case strings.HasSuffix(path, ".toml"): viper.SetConfigType("toml")
    default: viper.SetConfigType("yaml")
    }
    return viper.ReadRemoteConfig()
}
```

Load from etcd v3:
```go
func loadConfigFromEtcd(endpointsCSV, key string) error {
    if err := viper.AddRemoteProvider("etcdv3", endpointsCSV, key); err != nil { return err }
    switch {
    case strings.HasSuffix(key, ".yaml"), strings.HasSuffix(key, ".yml"): viper.SetConfigType("yaml")
    case strings.HasSuffix(key, ".json"): viper.SetConfigType("json")
    default: viper.SetConfigType("yaml")
    }
    return viper.ReadRemoteConfig()
}
```

Abstract loader:
```go
func loadConfig(backend, file, consulAddr, consulPath, consulToken, etcdEndpoints, etcdKey string) error {
    switch backend {
    case "file":
        return loadConfigFromFile(file)
    case "consul":
        return loadConfigFromConsul(consulAddr, consulPath, consulToken)
    case "etcd":
        return loadConfigFromEtcd(etcdEndpoints, etcdKey)
    default:
        return fmt.Errorf("unknown config-backend: %s", backend)
    }
}
```

Unmarshal and validation:
```go
type Config struct {
    Server struct { Port int `mapstructure:"port"` } `mapstructure:"server"`
    // ... more fields
}

func currentConfig() (Config, error) {
    var c Config
    if err := viper.Unmarshal(&c); err != nil { return c, err }
    // optional: validate(c)
    return c, nil
}
```

### Hooks: Save-Config and Reload

Viper does not write back → save via backend client with optimistic locking (CAS).

Consul hook (CAS):
```go
import (
    "bytes"
    "context"
    "fmt"
    consulapi "github.com/hashicorp/consul/api"
    "gopkg.in/yaml.v3"
)

type KVHandle struct {
    Client *consulapi.Client
    Path   string
}

func newKVHandle(addr, token, namespace, path string) (*KVHandle, error) {
    cfg := consulapi.DefaultConfig()
    if addr != "" { cfg.Address = addr }
    if token != "" { cfg.Token = token }
    // cfg.Namespace = namespace // (Enterprise)
    c, err := consulapi.NewClient(cfg)
    if err != nil { return nil, err }
    return &KVHandle{Client: c, Path: path}, nil
}

func (h *KVHandle) SaveConfigCAS(ctx context.Context, cfg any) error {
    pair, _, err := h.Client.KV().Get(h.Path, nil)
    if err != nil { return err }
    var buf bytes.Buffer
    if err := yaml.NewEncoder(&buf).Encode(cfg); err != nil { return err }
    p := &consulapi.KVPair{Key: h.Path, Value: buf.Bytes()}
    if pair != nil { p.ModifyIndex = pair.ModifyIndex } else { p.ModifyIndex = 0 }
    ok, _, err := h.Client.KV().CAS(p, nil)
    if err != nil { return err }
    if !ok { return fmt.Errorf("config changed concurrently (CAS failed)") }
    return nil
}
```

etcd hook (CAS):
```go
import (
    "bytes"
    "context"
    "time"
    "fmt"
    clientv3 "go.etcd.io/etcd/client/v3"
    "gopkg.in/yaml.v3"
)

type EtcdHandle struct { Cli *clientv3.Client; Key string }

func (h *EtcdHandle) SaveConfigCAS(ctx context.Context, cfg any) error {
    var buf bytes.Buffer
    if err := yaml.NewEncoder(&buf).Encode(cfg); err != nil { return err }
    getResp, err := h.Cli.Get(ctx, h.Key)
    if err != nil { return err }
    var modRev int64
    if len(getResp.Kvs) > 0 { modRev = getResp.Kvs[0].ModRevision }
    cmp := clientv3.Compare(clientv3.ModRevision(h.Key), "=", modRev)
    put := clientv3.OpPut(h.Key, buf.String())
    cctx, cancel := context.WithTimeout(ctx, 5*time.Second)
    defer cancel()
    resp, err := h.Cli.Txn(cctx).If(cmp).Then(put).Commit()
    if err != nil { return err }
    if !resp.Succeeded { return fmt.Errorf("config changed concurrently (CAS failed)") }
    return nil
}
```

Reload hook (explicit, no auto-watch):
```go
// Example: POST /admin/config/reload
// Implementation: call loadConfig(...) again; then viper.Unmarshal(&cfg)
```

## 6) Watch/Reload strategies

- Viper Remote offers `WatchRemoteConfig()`, which is polling-based. Simple but limited.
- More robust: backend-specific
  - Consul: blocking queries with `WaitIndex` (efficient, near-instant reaction).
  - etcd: `Watch` API on the key/prefix.
- For this project: reload only via explicit hook. Optionally later: background watch that raises an internal signal after successful apply.

Consul blocking query (example):
```go
func (h *KVHandle) Watch(ctx context.Context, apply func([]byte) error) error {
    var lastIndex uint64
    for ctx.Err() == nil {
        q := &consulapi.QueryOptions{WaitIndex: lastIndex, WaitTime: 10 * time.Minute}
        pair, meta, err := h.Client.KV().Get(h.Path, q)
        if err != nil { time.Sleep(time.Second); continue }
        if meta.LastIndex == lastIndex { continue }
        lastIndex = meta.LastIndex
        if pair != nil { _ = apply(pair.Value) }
    }
    return ctx.Err()
}
```

## 7) UI integration (nauthilus-ui)

Goal: UI can read/edit/save configuration and trigger a reload.

Recommended server endpoints (admin API):
- GET `/admin/config` → returns current config as YAML or JSON (+ ETag/version).
- PUT `/admin/config` → accepts changed config. Header `If-Match: <version>` (CAS) or include `version` in body.
- POST `/admin/config/reload` → triggers reload from the selected backend.

Conflict resolution in the UI:
- UI fetches config + version (e.g., Consul ModifyIndex or etcd ModRevision). On save, UI sends the last-known version (If-Match). On 409 Conflict: UI offers merge/reload.

Validation:
- Server validates config before writing (schema/constraints). Errors → 400 with details.

Security:
- Admin API behind authZ (privileged users only). Audit log for changes.

UX notes:
- Editor with syntax highlighting (YAML/JSON), “Test/Validate” button, “Dry Run” (validate only), and “Diff” view before saving.

## 8) Security

- Consul: ACL tokens, minimal scope. Token via env (`CONSUL_HTTP_TOKEN`) or flag. TLS/mTLS for transport (Consul client `TLSConfig`).
- etcd: mTLS (CA/Cert/Key), optionally Basic Auth. Least privilege via auth roles/namespaces (enterprise).
- Kubernetes variant: ServiceAccount + RBAC; use Secrets instead of ConfigMaps for sensitive data.
- Secrets: store sensitive values in Vault/Secrets and keep references in config.
- Multi-tenancy: prefix separation (`nauthilus/<env>/config.yaml`), separated tokens/policies.

## 9) Operations

- Backup/Restore: regular Consul/etcd snapshots. Test restores.
- Observability: metrics (read/write latency, conflict rate), logs (audit), traces (optional).
- DR/HA: Consul/etcd cluster size, quorum; inter-region latency; TTLs/compaction.
- Quotas/size: keep config small (KB–MB). Do not store large binaries in KV.

## 10) Migration path & fallback logic

- Feature flag/CLI selects backend. Start-up: fail fast if the selected backend is unreachable (optionally allow controlled fallback to file for dev).
- Migration: file → remote
  1. Put existing YAML into KV under `nauthilus/config.yaml`.
  2. Start server with `--config-backend=consul|etcd`.
  3. Validate/smoke test.
- Rollback: switch backend back to file; keep the last known file handy.

## 11) Troubleshooting & tests

Loading checklist:
- Wrong path/key → expected error message?
- Unknown format → is format selection correct?
- Token/TLS issues → clear logs?

Saving checklist:
- Generate a CAS conflict → do we return 409/clear error?
- Invalid config → validation error 400?

E2E:
- UI loads config, changes a field, saves; server writes to KV; reload hook applies it.
- Network outage during save → retries/error surfaced in UI.

## 12) Roadmap & extensibility

- Abstract provider layer: `RemoteProvider` interface with implementations for Consul/etcd. Later: native etcd via `clientv3`, SSM, Secrets Manager, GCS/S3.
- Optional background watch with backoff and health probe, but reload remains manual via hook.
- Schema validation (e.g., `go-playground/validator`, JSON Schema) + migration hooks.

## 13) Appendix

Example YAML in KV (key: `nauthilus/config.yaml`):
```yaml
server:
  port: 3001
features:
  enableFoo: true
  betaMode: false
```

Consul CLI:
```bash
consul kv put nauthilus/config.yaml @config.yaml
consul kv get nauthilus/config.yaml
```

etcd CLI:
```bash
ETCDCTL_API=3 etcdctl --endpoints=etcd-0:2379,etcd-1:2379 put /nauthilus/config.yaml "$(cat config.yaml)"
ETCDCTL_API=3 etcdctl --endpoints=etcd-0:2379,etcd-1:2379 get /nauthilus/config.yaml
```

Relevant environment variables:
- Consul: `CONSUL_HTTP_ADDR`, `CONSUL_HTTP_TOKEN`, `CONSUL_CACERT`, `CONSUL_CLIENT_CERT`, `CONSUL_CLIENT_KEY`.
- etcd: `ETCDCTL_API`, `ETCD_CACERT`, `ETCD_CERT`, `ETCD_KEY`.

Note date/time: document created on 2025-11-03.
