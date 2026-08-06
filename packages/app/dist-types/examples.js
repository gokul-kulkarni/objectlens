/**
 * Bundled examples.
 *
 * The empty state has to teach the input format, and a paste box with no hint teaches nothing.
 * Each example is real `repr()` / JSON output chosen to show one thing the viewer handles that a
 * plain text dump does not.
 */
export const EXAMPLES = [
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
        name: 'Malformed input',
        description: 'One bad token costs its own span, not the document',
        text: `{'good': 1, 'broken': @@@, 'also_good': [1, 2, 3], 'unterminated': 'oops}`,
    },
];
//# sourceMappingURL=examples.js.map