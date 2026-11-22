/**
 * Bundled examples.
 *
 * The empty state has to teach the input format, and a paste box with no hint teaches nothing.
 * Each example is real `repr()`, JSON or YAML chosen to show one thing the viewer handles that a
 * plain text dump does not.
 */

export interface Example {
  readonly name: string;
  readonly description: string;
  readonly text: string;
}

export const EXAMPLES: readonly Example[] = [
  {
    name: 'Nested Python objects',
    description: 'Dataclasses, datetimes and Decimals inside a dict',
    text: `{'order_id': 40921,
 'placed_at': datetime.datetime(2026, 8, 6, 14, 32, 9),
 'customer': User(id=7, name='Ada Lovelace', email='ada@example.com'),
 'items': [{'sku': 'BK-001', 'qty': 2, 'price': Decimal('24.99')},
           {'sku': 'BK-114', 'qty': 1, 'price': Decimal('8.50')}],
 'total': Decimal('58.48'),
 'paid': True,
 'coupon': None,
 'tags': {'priority', 'gift'},
 'meta': {'ip': '10.0.0.4', 'agent': <Request object at 0x7f9a2c1d4e80>}}`,
  },
  {
    name: 'Cycles and shared references',
    description: 'What repr() collapses to `...` and the graph view makes visible',
    text: `{'name': 'root',
 'children': [{'name': 'a', 'parent': {...}}, {'name': 'b', 'parent': {...}}],
 'self': {...}}`,
  },
  {
    name: 'Tricky literals',
    description: 'Bignums, inf/nan, bytes, complex numbers and tuple keys',
    text: `{'big': 9007199254740993,
 'huge': 1208925819614629174706176,
 'floats': [inf, -inf, nan, 1e300, -0.0],
 'complex': (1+2j),
 'raw_bytes': b'ab\\x00c',
 'radix': [0x1f, 0o17, 0b1011],
 (1, 2): 'a tuple key',
 'frozen': frozenset({1, 2}),
 'counter': Counter({'a': 2, 'b': 1})}`,
  },
  {
    name: 'JSON',
    description: 'The same viewer, a different adapter',
    text: `{
  "service": "checkout",
  "replicas": 3,
  "healthy": true,
  "limits": { "cpu": "500m", "memory": "512Mi" },
  "routes": [
    { "path": "/cart", "methods": ["GET", "POST"] },
    { "path": "/pay", "methods": ["POST"] }
  ],
  "owner": null
}`,
  },
  {
    name: 'YAML with anchors',
    description: 'Anchors are real sharing — the same thing a live object graph has',
    text: `x-defaults: &defaults
  restart: unless-stopped
  logging:
    driver: json-file

services:
  web:
    <<: *defaults
    image: nginx:1.27
    ports: ["80:80", "443:443"]
  api:
    <<: *defaults
    image: acme/api:2.3.1
    environment:
      TIMEOUT: 30
      DEBUG: false

cluster: &node
  name: root
  next: *node`,
  },
  {
    name: 'Malformed input',
    description: 'One bad token costs its own span, not the document',
    text: `{'good': 1, 'broken': @@@, 'also_good': [1, 2, 3], 'unterminated': 'oops}`,
  },
];

export interface CompareExample {
  readonly name: string;
  readonly description: string;
  readonly left: string;
  readonly right: string;
  /** Identity field to match array records by, when the example is about reordering. */
  readonly arrayKey?: string;
}

/**
 * Comparison examples. Each pair shows one thing a line-based text diff gets wrong: key order,
 * reordered records, and two formats that say the same thing.
 */
export const COMPARE_EXAMPLES: readonly CompareExample[] = [
  {
    name: 'Config change',
    description: 'Changed, added and removed settings — and a key order change that is not a change',
    left: `{
  "service": "checkout",
  "replicas": 3,
  "image": "acme/checkout:1.8.2",
  "env": { "LOG_LEVEL": "info", "TIMEOUT_MS": 3000, "FEATURE_X": false },
  "ports": [8080, 9090]
}`,
    right: `{
  "image": "acme/checkout:1.9.0",
  "service": "checkout",
  "replicas": "3",
  "env": { "LOG_LEVEL": "debug", "TIMEOUT_MS": 3000, "RETRIES": 2 },
  "ports": [8080, 9090]
}`,
  },
  {
    name: 'Reordered records',
    description: 'Matched by "id", so a reorder is a move rather than a wall of changes',
    arrayKey: 'id',
    left: `[
  {"id": 1, "name": "Ada", "role": "admin"},
  {"id": 2, "name": "Grace", "role": "editor"},
  {"id": 3, "name": "Linus", "role": "viewer"}
]`,
    right: `[
  {"id": 3, "name": "Linus", "role": "viewer"},
  {"id": 1, "name": "Ada", "role": "owner"},
  {"id": 4, "name": "Barbara", "role": "editor"}
]`,
  },
  {
    name: 'JSON vs YAML',
    description: 'Different formats, same data — compared on meaning, not on text',
    left: `{"name": "api", "port": 8080, "tls": true, "hosts": ["a.example", "b.example"], "ratio": 1.50}`,
    right: `name: api
port: 8080
tls: true
hosts:
  - a.example
  - b.example
ratio: 1.5`,
  },
];

export interface MarkdownExample {
  readonly name: string;
  readonly description: string;
  readonly text: string;
}

const FENCE = '```';

/** A README exercising what the Markdown viewer renders beyond plain prose. */
export const MARKDOWN_EXAMPLES: readonly MarkdownExample[] = [
  {
    name: 'README with diagrams',
    description: 'Tables, task lists, highlighted code, and two Mermaid diagrams',
    text: `# Checkout service

Handles carts, payment and order placement. See [Architecture](#architecture) for how the pieces fit.

> **Status:** beta — the API may change before 1.0.

## Getting started

${FENCE}bash
git clone https://github.com/acme/checkout.git
cd checkout && make dev
${FENCE}

${FENCE}python
def total(items: list[Item]) -> Decimal:
    return sum((item.price * item.qty for item in items), Decimal("0"))
${FENCE}

## Architecture

${FENCE}mermaid
flowchart LR
  client([Browser]) --> api[Checkout API]
  api --> cart[(Cart store)]
  api --> pay{{Payment gateway}}
  api --> orders[(Orders DB)]
${FENCE}

### Placing an order

${FENCE}mermaid
sequenceDiagram
  participant C as Client
  participant A as API
  participant P as Payments
  C->>A: POST /orders
  A->>P: authorise(amount)
  P-->>A: ok
  A-->>C: 201 Created
${FENCE}

## Configuration

| Variable      | Default | Meaning                          |
| ------------- | ------- | -------------------------------- |
| \`PORT\`        | \`8080\`  | HTTP port                        |
| \`TIMEOUT_MS\`  | \`3000\`  | Upstream timeout in milliseconds |
| \`RETRIES\`     | \`2\`     | Payment retries before failing   |

## Roadmap

- [x] Cart persistence
- [x] Payment retries
- [ ] Partial refunds
- [ ] Multi-currency
`,
  },
];
