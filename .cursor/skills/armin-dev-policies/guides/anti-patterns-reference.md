# Anti-pattern reference

Use only when the main skill needs a deeper catalog. Prefer evidence over labels.

## Structure

| Pattern | Signals |
|---------|---------|
| Big Ball of Mud | No package/project boundaries; everything references everything |
| God Object | One type owns unrelated state/behavior; huge file; many dependencies |
| Circular dependency | Project/package cycles; mutual imports |
| Shotgun surgery | One change touches many unrelated files every time |
| Divergent change | One module changes for many unrelated reasons |

## Layering (typical clean/onion/n-tier)

| Pattern | Signals |
|---------|---------|
| Dependency inversion violated | Inner/domain references outer/infra UI packages |
| Smart UI | Validation and business rules only in controllers/views |
| Fat controller | Controllers orchestrate persistence, rules, mapping, and I/O |
| Leaky abstraction | ORM entities/DTOs leak across all layers unchanged |

## Coupling & cohesion

| Pattern | Signals |
|---------|---------|
| Feature envy | Method uses another type’s data more than its own |
| Inappropriate intimacy | Types reach into each other’s private collaborators |
| Service locator | Resolve from ambient container inside domain logic |
| Hard-coded dependency | `new ConcreteService()` where DI is established |

## Data & concurrency

| Pattern | Signals |
|---------|---------|
| N+1 | Loop with per-item query/HTTP call |
| Unbounded read | Queries with no Take/pagination on list endpoints |
| Shared mutable static | Static mutable caches without sync/lifetime policy |

## Distribution

| Pattern | Signals |
|---------|---------|
| Distributed monolith | Many services, shared DB, chatty sync calls, joint deploy required |
| Premature microservice | Tiny services with no independent deploy/scale need |

## False positives (usually skip)

- Single-project small apps without layers (not automatically Big Ball of Mud)
- Anemic models in CRUD-only apps when invariants are trivial
- Thin controllers that only map HTTP ↔ application services
