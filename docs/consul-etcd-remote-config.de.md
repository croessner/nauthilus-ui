# Zentrale Konfiguration mit Consul/etcd für Nauthilus

Diese Notiz fasst unsere Diskussion und Design‑Entscheidungen zu einer zentralen Konfiguration mit HashiCorp Consul bzw. etcd zusammen. Sie dient als Referenz für Implementierung, Betrieb und spätere UI‑Integration (nauthilus‑ui), um Konfigurationsänderungen bequem zu verteilen.

Inhalt
- Ziele und Überblick
- Architektur und Begriffe
- Backends im Vergleich: Consul vs. etcd (und Kubernetes‑Alternative)
- Konfigurationsquellen und CLI/URL‑Schema
- Implementierung mit Viper Remote (Laden) und Hooks (Speichern/Reload)
- Watch/Reload‑Strategien
- UI‑Integration (nauthilus‑ui)
- Sicherheit (ACL/TLS/RBAC/Secrets)
- Betrieb (Backup/Restore, Observability, DR)
- Migrationspfad & Fallback‑Logik
- Troubleshooting & Test‑Checklisten
- Roadmap & Erweiterbarkeit
- Anhang: Beispiel‑Konfigurationen, CLI‑Snippets, Umgebungsvariablen

---

## 1) Ziele und Überblick

- Zentrale, versionierbare Konfiguration für Nauthilus.
- Wahlweise Backend: lokale Datei (YAML) oder Remote (Consul KV, etcd v3).
- Umschaltbar per CLI‑Flags, ohne Codeänderung.
- Explizite Hooks: Load‑Config (bestehend), neu: Save‑Config und Reload (manuell ausgelöst; kein Auto‑Reload ohne Hook).
- UI‑Ziel: nauthilus‑ui kann Konfigurationsänderungen erzeugen und an alle Instanzen verteilen (per Server‑API + Remote‑Speicher).
- Robustheit: Optimistic Locking/Compare‑And‑Swap, Konfliktlösung, Validierung.

## 2) Architektur und Begriffe

- Source of Truth: Ein klar gewähltes Backend je Deployment: file | consul | etcd.
- Viper: Liest Konfiguration aus Datei oder Remote (Paket `github.com/spf13/viper/remote`).
- Hooks im Server:
  - LoadConfig: lädt in viper + unmarshalt in Config‑Struct.
  - SaveConfig: serialisiert aktuelle/übergebene Config und schreibt sie ins Remote‑Backend (kein direktes "Write" durch Viper).
  - Reload: lädt erneut aus dem gewählten Backend und übernimmt die Werte im laufenden Prozess.
- Abstraktionsschicht „RemoteProvider“: Ermöglicht weitere Provider (z. B. SSM/Secrets Manager) später.

## 3) Backends im Vergleich

### Consul
- Pros: Einfacher KV, gute ACLs, Blocking Queries (WaitIndex), weit verbreitet.
- CAS über `KV.CAS` mit `ModifyIndex`.
- Token via ENV (`CONSUL_HTTP_TOKEN`) oder explizit im Client.

### etcd (separat!)
- Wichtig: Nicht den Kubernetes‑Control‑Plane‑etcd verwenden. Applikationen sollen nicht auf den internen etcd zugreifen (Stabilität, Security, Betrieb, Managed‑K8s verbietet es meist).
- Stattdessen: Eigenen etcd‑Cluster für App‑Konfiguration betreiben.
- Pros: Starker Konsistenz‑KV, Transaktionen, Watch‑API.
- CAS über ModRevision + `Txn(Compare(ModRevision==x)).Then(Put)`.

### Kubernetes‑Alternative
- Ohne externen KV: ConfigMap/Secret/CRD als Source of Truth über die Kubernetes‑API; RBAC‑gesichert. Gut für GitOps.
- Reload via Watch/Informer oder Sidecar (Reloader). Nicht Teil der ersten Iteration, aber kompatibel.

## 4) Konfigurationsquellen und CLI/URL‑Schema

Option A: Ein Flag `--config` mit Schema:
- `file:/etc/nauthilus/config.yaml`
- `consul://127.0.0.1:8500/nauthilus/config.yaml`
- `etcd://etcd-0:2379,etcd-1:2379/nauthilus/config.yaml`

Option B (einfacher, weniger Magie):
- `--config-backend=file|consul|etcd`
- `--config-file=/path/to/config.yaml`
- `--consul-addr=127.0.0.1:8500`, `--consul-path=nauthilus/config.yaml`, `--consul-token=...`
- `--etcd-endpoints=etcd-0:2379,etcd-1:2379`, `--etcd-key=/nauthilus/config.yaml`

Fallback: Wenn kein Backend gesetzt -> Datei.

## 5) Implementierung – Laden mit Viper Remote, Speichern via Hooks

Blank‑Import für Remote:
```go
import (
    "strings"
    "github.com/spf13/viper"
    _ "github.com/spf13/viper/remote"
)
```

Laden aus Datei:
```go
func loadConfigFromFile(file string) error {
    viper.SetConfigFile(file)
    return viper.ReadInConfig()
}
```

Laden aus Consul:
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

Laden aus etcd v3:
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

Abstraktions‑Loader:
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

Unmarshal und Validierung:
```go
type Config struct {
    Server struct { Port int `mapstructure:"port"` } `mapstructure:"server"`
    // ... weitere Felder
}

func currentConfig() (Config, error) {
    var c Config
    if err := viper.Unmarshal(&c); err != nil { return c, err }
    // optional: validate(c)
    return c, nil
}
```

### Hooks: Save‑Config und Reload

Viper schreibt nicht zurück → Speichern via Backend‑Client mit Optimistic Locking (CAS).

Consul‑Hook (CAS):
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

etcd‑Hook (CAS):
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

Reload‑Hook (explizit, kein Autowatch):
```go
// Beispiel: POST /admin/config/reload
// Implementierung: loadConfig(...) erneut aufrufen; anschließend viper.Unmarshal(&cfg)
```

## 6) Watch/Reload‑Strategien

- Viper Remote bietet `WatchRemoteConfig()`, Polling‑artig. Einfach, aber begrenzt.
- Robuster: Backend‑spezifisch
  - Consul: Blocking Queries mit `WaitIndex` (effizient, nahezu sofortige Reaktion).
  - etcd: `Watch`‑API auf dem Key/Prefix.
- Für dieses Projekt: Reload nur per Hook. Optional später: Hintergrund‑Watch, der nach erfolgreicher Übernahme ein internes Signal auslöst.

Consul Blocking Query (Beispiel):
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

## 7) UI‑Integration (nauthilus‑ui)

Ziel: UI kann Konfiguration lesen/bearbeiten/speichern und Reload anstoßen.

Empfohlene Server‑Endpunkte (Admin‑API):
- GET `/admin/config` → Liefert aktuelle Config als YAML oder JSON (+ ETag/Version).
- PUT `/admin/config` → Nimmt geänderte Config entgegen. Header `If-Match: <version>` (CAS) oder Body enthält `version`.
- POST `/admin/config/reload` → Triggert Reload aus dem gewählten Backend.

Konfliktlösung im UI:
- UI lädt Config + Version (z. B. Consul ModifyIndex oder etcd ModRevision). Beim Speichern sendet UI die zuletzt bekannte Version (If‑Match). Bei 409 Conflict: UI bietet Merge/Neu laden an.

Validierung:
- Server validiert Config vor dem Schreiben (Schema/Constraints). Fehler → 400 mit Details.

Sicherheit:
- Admin‑API hinter AuthZ (nur privilegierte Nutzer). Audit‑Log für Änderungen.

UX‑Hinweise:
- Editor mit Syntax‑Highlighting (YAML/JSON), „Test/Validate“‑Button, „Dry‑Run“ (nur Validierung ohne Write), Ansicht „Diff“ vor dem Speichern.

## 8) Sicherheit

- Consul: ACL Tokens, minimaler Scope. Token per ENV (`CONSUL_HTTP_TOKEN`) oder Flag. TLS/mTLS für Transport (Consul‑Client `TLSConfig`).
- etcd: mTLS (CA/Cert/Key), ggf. Basic Auth. Least Privilege via Auth‑Roles/NS (falls Enterprise).
- Kubernetes‑Variante: ServiceAccount + RBAC; Secrets statt ConfigMaps für sensible Daten.
- Geheimnisse: Sensible Werte eher in Vault/Secrets speichern und in Config nur Referenzen halten.
- Multi‑Tenancy: Prefix‑Trennung (`nauthilus/<env>/config.yaml`), getrennte Tokens/Policies.

## 9) Betrieb

- Backup/Restore: Regelmäßige Backups von Consul/etcd (Snapshots). Test der Wiederherstellung.
- Observability: Metriken (Read/Write‑Latenz, Konfliktrate), Logs (Audit), Traces (optional).
- DR/HA: Consul/etcd‑Cluster‑Größe, Quorum; Latenz zwischen Regionen; TTLs/Compaction.
- Quotas/Größen: Konfiggröße klein halten (KB–MB). Große Binärdaten nicht im KV.

## 10) Migrationspfad & Fallback‑Logik

- Feature‑Flag/CLI bestimmt Backend. Start‑Up: Fail‑fast, wenn gewähltes Backend nicht erreichbar (optional: kontrollierter Fallback auf Datei für Dev).
- Migration: Datei → Remote
  1. Bestehende YAML in `nauthilus/config.yaml` in KV schreiben.
  2. Server mit `--config-backend=consul|etcd` starten.
  3. Validierung/Smoke‑Test.
- Rollback: Backend zurück auf Datei schalten; letzte bekannte Datei bereithalten.

## 11) Troubleshooting & Tests

Checkliste Laden:
- Falscher Pfad/Key → erwartete Fehlermeldung?
- Unbekanntes Format → Formatwahl korrekt?
- Token/TLS‑Fehler → klare Logs?

Checkliste Speichern:
- CAS‑Konflikt erzeugen → 409/Fehler wird sauber gemeldet?
- Ungültige Config → Validierungsfehler 400?

E2E:
- UI lädt Config, ändert Feld, speichert; Server schreibt in KV; Reload‑Hook übernimmt.
- Netzwerkausfall während Save → Retries/Fehleranzeige im UI.

## 12) Roadmap & Erweiterbarkeit

- Abstrakter Provider‑Layer: `RemoteProvider`‑Interface mit Implementierungen für Consul/etcd. Später: etcd über `clientv3` nativ, SSM, Secrets Manager, GCS/S3.
- Hintergrund‑Watch optional, mit Backoff und Health‑Probe, aber Reload bleibt manuell per Hook.
- Schema‑Validierung (z. B. `go-playground/validator`, JSON‑Schema) + Migrations‑Hooks.

## 13) Anhang

Beispiel‑YAML im KV (Key: `nauthilus/config.yaml`):
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

Relevante Umgebungsvariablen:
- Consul: `CONSUL_HTTP_ADDR`, `CONSUL_HTTP_TOKEN`, `CONSUL_CACERT`, `CONSUL_CLIENT_CERT`, `CONSUL_CLIENT_KEY`.
- etcd: `ETCDCTL_API`, `ETCD_CACERT`, `ETCD_CERT`, `ETCD_KEY`.

Hinweis Datum/Zeit: Dokument erstellt am 2025‑11‑03.
