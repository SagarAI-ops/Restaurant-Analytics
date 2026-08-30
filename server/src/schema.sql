-- StockHouse Master Database Schema (~25 tables)

-- 1. Users & Auth
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT CHECK(role IN ('admin', 'manager', 'staff')) NOT NULL DEFAULT 'staff',
    pin_code TEXT,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 2. Units & Dimension Types
CREATE TABLE IF NOT EXISTS units (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    dimension TEXT CHECK(dimension IN ('weight', 'volume', 'count')) NOT NULL,
    is_base INTEGER NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 3. Unit Conversions (Conversion Graph)
CREATE TABLE IF NOT EXISTS unit_conversions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    from_unit_id INTEGER NOT NULL REFERENCES units(id) ON DELETE CASCADE,
    to_unit_id INTEGER NOT NULL REFERENCES units(id) ON DELETE CASCADE,
    factor REAL NOT NULL CHECK(factor > 0),
    ingredient_id INTEGER REFERENCES ingredients(id) ON DELETE CASCADE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_conversion UNIQUE (from_unit_id, to_unit_id, ingredient_id)
);

-- 4. Ingredient Categories
CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 5. Storage Locations
CREATE TABLE IF NOT EXISTS locations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 6. Ingredients Master
CREATE TABLE IF NOT EXISTS ingredients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    category_id INTEGER REFERENCES categories(id),
    base_unit_id INTEGER NOT NULL REFERENCES units(id),
    default_location_id INTEGER REFERENCES locations(id),
    current_cost_per_base REAL NOT NULL DEFAULT 0.0,
    yield_percent REAL NOT NULL DEFAULT 100.0 CHECK(yield_percent > 0 AND yield_percent <= 100.0),
    par_level_base REAL NOT NULL DEFAULT 0.0,
    reorder_point_base REAL NOT NULL DEFAULT 0.0,
    reorder_qty_base REAL NOT NULL DEFAULT 0.0,
    shelf_life_days INTEGER DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 7. Suppliers
CREATE TABLE IF NOT EXISTS suppliers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    code TEXT UNIQUE NOT NULL,
    contact_person TEXT,
    email TEXT,
    phone TEXT,
    lead_time_days INTEGER NOT NULL DEFAULT 1,
    min_order_value REAL NOT NULL DEFAULT 0.0,
    payment_terms TEXT,
    rating REAL DEFAULT 5.0,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 8. Supplier Price Catalog & Historical Log
CREATE TABLE IF NOT EXISTS supplier_prices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    supplier_id INTEGER NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
    ingredient_id INTEGER NOT NULL REFERENCES ingredients(id) ON DELETE CASCADE,
    purchase_unit_id INTEGER NOT NULL REFERENCES units(id),
    price_per_purchase_unit REAL NOT NULL CHECK(price_per_purchase_unit >= 0),
    effective_date DATE NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_supplier_ingredient UNIQUE (supplier_id, ingredient_id, purchase_unit_id, effective_date)
);

-- 9. Sales Channels
CREATE TABLE IF NOT EXISTS sales_channels (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    commission_percent REAL NOT NULL DEFAULT 0.0,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 10. Menu Categories
CREATE TABLE IF NOT EXISTS menu_categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    sort_order INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 11. Menu Items Master
CREATE TABLE IF NOT EXISTS menu_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    category_id INTEGER REFERENCES menu_categories(id),
    selling_price REAL NOT NULL CHECK(selling_price >= 0),
    target_food_cost_percent REAL DEFAULT 30.0,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 12. Recipe Versions
CREATE TABLE IF NOT EXISTS recipes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    menu_item_id INTEGER NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
    version INTEGER NOT NULL DEFAULT 1,
    is_active INTEGER NOT NULL DEFAULT 1,
    notes TEXT,
    created_by INTEGER REFERENCES users(id),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_menu_item_version UNIQUE (menu_item_id, version)
);

-- 13. Recipe Ingredients (BOM)
CREATE TABLE IF NOT EXISTS recipe_ingredients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    recipe_id INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
    ingredient_id INTEGER NOT NULL REFERENCES ingredients(id),
    qty REAL NOT NULL CHECK(qty > 0),
    unit_id INTEGER NOT NULL REFERENCES units(id),
    waste_percent REAL NOT NULL DEFAULT 0.0 CHECK(waste_percent >= 0 AND waste_percent < 100),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 14. Stock Movements (Central Immutable Ledger)
CREATE TABLE IF NOT EXISTS stock_movements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ingredient_id INTEGER NOT NULL REFERENCES ingredients(id),
    movement_type TEXT CHECK(movement_type IN ('purchase', 'sale', 'wastage', 'transfer_in', 'transfer_out', 'count_correction', 'opening')) NOT NULL,
    qty_base REAL NOT NULL,
    unit_cost REAL NOT NULL CHECK(unit_cost >= 0),
    total_cost REAL NOT NULL,
    movement_date DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    reference_type TEXT,
    reference_id INTEGER,
    batch_number TEXT,
    expiry_date DATE,
    location_id INTEGER REFERENCES locations(id),
    created_by INTEGER REFERENCES users(id),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 15. Purchases Header
CREATE TABLE IF NOT EXISTS purchases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    po_number TEXT UNIQUE NOT NULL,
    supplier_id INTEGER NOT NULL REFERENCES suppliers(id),
    status TEXT CHECK(status IN ('draft', 'confirmed', 'voided')) NOT NULL DEFAULT 'draft',
    invoice_number TEXT,
    purchase_date DATE NOT NULL,
    total_amount REAL NOT NULL DEFAULT 0.0,
    notes TEXT,
    created_by INTEGER REFERENCES users(id),
    confirmed_by INTEGER REFERENCES users(id),
    confirmed_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 16. Purchase Items
CREATE TABLE IF NOT EXISTS purchase_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    purchase_id INTEGER NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
    ingredient_id INTEGER NOT NULL REFERENCES ingredients(id),
    qty REAL NOT NULL CHECK(qty > 0),
    unit_id INTEGER NOT NULL REFERENCES units(id),
    qty_base REAL NOT NULL CHECK(qty_base > 0),
    unit_price REAL NOT NULL CHECK(unit_price >= 0),
    total_price REAL NOT NULL CHECK(total_price >= 0),
    batch_number TEXT,
    expiry_date DATE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 17. Sales Records
CREATE TABLE IF NOT EXISTS sales (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    receipt_number TEXT NOT NULL,
    sale_date DATETIME NOT NULL,
    channel_id INTEGER REFERENCES sales_channels(id),
    payment_method TEXT CHECK(payment_method IN ('cash', 'card', 'upi', 'aggregator')) DEFAULT 'upi',
    shift TEXT CHECK(shift IN ('morning', 'evening', 'night')) DEFAULT 'evening',
    total_amount REAL NOT NULL CHECK(total_amount >= 0),
    net_amount REAL NOT NULL CHECK(net_amount >= 0),
    commission_amount REAL NOT NULL DEFAULT 0.0,
    unpriced_items_count INTEGER DEFAULT 0,
    created_by INTEGER REFERENCES users(id),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 18. Sale Items
CREATE TABLE IF NOT EXISTS sale_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sale_id INTEGER NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
    menu_item_id INTEGER NOT NULL REFERENCES menu_items(id),
    qty INTEGER NOT NULL CHECK(qty > 0),
    unit_price REAL NOT NULL CHECK(unit_price >= 0),
    total_price REAL NOT NULL CHECK(total_price >= 0),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 19. Wastage Records
CREATE TABLE IF NOT EXISTS wastage (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    wastage_date DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ingredient_id INTEGER NOT NULL REFERENCES ingredients(id),
    qty REAL NOT NULL CHECK(qty > 0),
    unit_id INTEGER NOT NULL REFERENCES units(id),
    qty_base REAL NOT NULL CHECK(qty_base > 0),
    reason TEXT CHECK(reason IN ('spoilage', 'preparation', 'spill', 'expired', 'trimming', 'other')) NOT NULL,
    estimated_value REAL NOT NULL DEFAULT 0.0,
    notes TEXT,
    reported_by INTEGER REFERENCES users(id),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 20. Transfers Header
CREATE TABLE IF NOT EXISTS stock_transfers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    transfer_number TEXT UNIQUE NOT NULL,
    from_location_id INTEGER NOT NULL REFERENCES locations(id),
    to_location_id INTEGER NOT NULL REFERENCES locations(id),
    transfer_date DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    notes TEXT,
    created_by INTEGER REFERENCES users(id),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 21. Transfer Items
CREATE TABLE IF NOT EXISTS transfer_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    transfer_id INTEGER NOT NULL REFERENCES stock_transfers(id) ON DELETE CASCADE,
    ingredient_id INTEGER NOT NULL REFERENCES ingredients(id),
    qty REAL NOT NULL CHECK(qty > 0),
    unit_id INTEGER NOT NULL REFERENCES units(id),
    qty_base REAL NOT NULL CHECK(qty_base > 0),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 22. Physical Stock Counts Header
CREATE TABLE IF NOT EXISTS stock_counts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    count_number TEXT UNIQUE NOT NULL,
    count_date DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    status TEXT CHECK(status IN ('in_progress', 'completed', 'cancelled')) NOT NULL DEFAULT 'in_progress',
    scope TEXT CHECK(scope IN ('full', 'category', 'location')) NOT NULL DEFAULT 'full',
    scope_id INTEGER,
    total_variance_value REAL DEFAULT 0.0,
    notes TEXT,
    conducted_by INTEGER REFERENCES users(id),
    completed_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 23. Stock Count Line Items
CREATE TABLE IF NOT EXISTS stock_count_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    count_id INTEGER NOT NULL REFERENCES stock_counts(id) ON DELETE CASCADE,
    ingredient_id INTEGER NOT NULL REFERENCES ingredients(id),
    expected_qty_base REAL NOT NULL,
    actual_qty_base REAL,
    variance_qty_base REAL,
    unit_cost REAL NOT NULL DEFAULT 0.0,
    variance_value REAL DEFAULT 0.0,
    reason_text TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 24. System Alerts & Notifications
CREATE TABLE IF NOT EXISTS alerts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    alert_type TEXT CHECK(alert_type IN ('low_stock', 'expiring_soon', 'high_variance', 'price_spike', 'food_cost_target_exceeded', 'unpriced_sale', 'negative_stock', 'missing_recipe')) NOT NULL,
    severity TEXT CHECK(severity IN ('low', 'medium', 'high', 'critical')) NOT NULL DEFAULT 'medium',
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    reference_type TEXT,
    reference_id INTEGER,
    is_read INTEGER NOT NULL DEFAULT 0,
    dedup_key TEXT UNIQUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 25. Generated Purchase Orders (Reorder System)
CREATE TABLE IF NOT EXISTS purchase_orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    po_number TEXT UNIQUE NOT NULL,
    supplier_id INTEGER NOT NULL REFERENCES suppliers(id),
    status TEXT CHECK(status IN ('draft', 'approved', 'sent', 'received', 'cancelled')) NOT NULL DEFAULT 'draft',
    ai_suggested INTEGER NOT NULL DEFAULT 0,
    total_amount REAL NOT NULL DEFAULT 0.0,
    notes TEXT,
    created_by INTEGER REFERENCES users(id),
    approved_by INTEGER REFERENCES users(id),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS purchase_order_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    purchase_order_id INTEGER NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
    ingredient_id INTEGER NOT NULL REFERENCES ingredients(id),
    qty REAL NOT NULL CHECK(qty > 0),
    unit_id INTEGER NOT NULL REFERENCES units(id),
    qty_base REAL NOT NULL CHECK(qty_base > 0),
    unit_price REAL NOT NULL CHECK(unit_price >= 0),
    total_price REAL NOT NULL CHECK(total_price >= 0),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 26. System Settings
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    description TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 27. Audit Logs
CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER REFERENCES users(id),
    action TEXT NOT NULL,
    resource_type TEXT NOT NULL,
    resource_id INTEGER,
    details TEXT,
    ip_address TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 28. AI Chat History
CREATE TABLE IF NOT EXISTS ai_chat_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    role TEXT CHECK(role IN ('user', 'assistant', 'system')) NOT NULL,
    content TEXT NOT NULL,
    tool_calls TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

---------------------------------------------------------
-- INDEXES FOR MAXIMUM QUERY PERFORMANCE
---------------------------------------------------------

-- Mandatory FK Indexes (SQLite does not create these automatically)
CREATE INDEX IF NOT EXISTS idx_uc_from_unit ON unit_conversions(from_unit_id);
CREATE INDEX IF NOT EXISTS idx_uc_to_unit ON unit_conversions(to_unit_id);
CREATE INDEX IF NOT EXISTS idx_ing_category ON ingredients(category_id);
CREATE INDEX IF NOT EXISTS idx_ing_base_unit ON ingredients(base_unit_id);
CREATE INDEX IF NOT EXISTS idx_ing_location ON ingredients(default_location_id);
CREATE INDEX IF NOT EXISTS idx_sp_supplier ON supplier_prices(supplier_id);
CREATE INDEX IF NOT EXISTS idx_sp_ingredient ON supplier_prices(ingredient_id);
CREATE INDEX IF NOT EXISTS idx_mi_category ON menu_items(category_id);
CREATE INDEX IF NOT EXISTS idx_rec_menu_item ON recipes(menu_item_id);
CREATE INDEX IF NOT EXISTS idx_ri_recipe ON recipe_ingredients(recipe_id);
CREATE INDEX IF NOT EXISTS idx_ri_ingredient ON recipe_ingredients(ingredient_id);
CREATE INDEX IF NOT EXISTS idx_sm_ingredient ON stock_movements(ingredient_id);
CREATE INDEX IF NOT EXISTS idx_sm_location ON stock_movements(location_id);
CREATE INDEX IF NOT EXISTS idx_sm_ref ON stock_movements(reference_type, reference_id);
CREATE INDEX IF NOT EXISTS idx_pur_supplier ON purchases(supplier_id);
CREATE INDEX IF NOT EXISTS idx_pi_purchase ON purchase_items(purchase_id);
CREATE INDEX IF NOT EXISTS idx_pi_ingredient ON purchase_items(ingredient_id);
CREATE INDEX IF NOT EXISTS idx_sale_channel ON sales(channel_id);
CREATE INDEX IF NOT EXISTS idx_si_sale ON sale_items(sale_id);
CREATE INDEX IF NOT EXISTS idx_si_menu_item ON sale_items(menu_item_id);
CREATE INDEX IF NOT EXISTS idx_wast_ingredient ON wastage(ingredient_id);
CREATE INDEX IF NOT EXISTS idx_st_from_loc ON stock_transfers(from_location_id);
CREATE INDEX IF NOT EXISTS idx_st_to_loc ON stock_transfers(to_location_id);
CREATE INDEX IF NOT EXISTS idx_ti_transfer ON transfer_items(transfer_id);
CREATE INDEX IF NOT EXISTS idx_sci_count ON stock_count_items(count_id);
CREATE INDEX IF NOT EXISTS idx_sci_ingredient ON stock_count_items(ingredient_id);
CREATE INDEX IF NOT EXISTS idx_po_supplier ON purchase_orders(supplier_id);
CREATE INDEX IF NOT EXISTS idx_poi_po ON purchase_order_items(purchase_order_id);
CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_session ON ai_chat_history(session_id);

-- Performance & Covering Indexes
CREATE INDEX IF NOT EXISTS idx_sm_covering ON stock_movements(ingredient_id, movement_date, qty_base, unit_cost, movement_type);
CREATE INDEX IF NOT EXISTS idx_sales_date ON sales(sale_date);
CREATE INDEX IF NOT EXISTS idx_purchases_date ON purchases(purchase_date);
CREATE INDEX IF NOT EXISTS idx_wastage_date ON wastage(wastage_date);
