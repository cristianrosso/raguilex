# Diagrama ER RAGUILEX - Fase 1

```mermaid
erDiagram
  roles ||--o{ users : assigns
  users ||--o{ products : creates
  users ||--o{ sales : sells
  users ||--o{ inventory_movements : performs
  users ||--o{ audit_logs : performs
  users ||--o{ import_batches : uploads

  categories ||--o{ products : groups
  brands ||--o{ products : labels
  conditions ||--o{ products : classifies
  locations ||--o{ products : stores
  locations ||--o{ sales : occurs_at

  products ||--o{ product_images : has
  products ||--o{ inventory_movements : tracks
  products ||--o{ sale_items : sold_as
  sales ||--o{ sale_items : contains
  import_batches ||--o{ import_rows : contains

  internal_code_counters ||--o{ products : generates
```

## Notas de diseno

- `products` representa una unidad fisica, no un SKU agregado.
- `products.internal_code` conserva codigos existentes como `TN-00001`.
- `products.qr_token` es unico y opaco; el QR no debe contener costo, precio ni datos sensibles.
- `sale_items.purchase_cost_snapshot` preserva la utilidad historica.
- `inventory_movements` y `audit_logs` mantienen trazabilidad.
- `import_batches` e `import_rows` conservan datos originales y normalizados para auditoria del Excel.

