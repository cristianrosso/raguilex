import React, { useEffect, useRef, useState } from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Navigate, NavLink, Route, Routes, useNavigate, useParams } from "react-router-dom";
import {
  BarChart3,
  Bell,
  Box,
  Camera,
  CheckCircle2,
  ClipboardList,
  FileSpreadsheet,
  Home,
  LogIn,
  LogOut,
  PackagePlus,
  Pencil,
  RotateCcw,
  ScanLine,
  Search,
  Settings,
  ShieldCheck,
  ShoppingCart,
  Eye,
  EyeOff,
  UserCircle,
  Users,
  Wallet
} from "lucide-react";
import "./styles.css";

const API_URL = import.meta.env.VITE_API_URL ?? `${window.location.protocol}//${window.location.hostname}:4001`;
const TOKEN_KEY = "raguilex-token";
const USER_KEY = "raguilex-user";

type RoleCode = "SUPER_ADMIN" | "ADMIN" | "SELLER";
type InventoryStatus = "AVAILABLE" | "RESERVED" | "SOLD" | "MAINTENANCE" | "REMOVED";

type UserSession = { id: string; name: string; username: string; role: RoleCode };
type ImageRow = { id: string; imageUrl: string; isPrimary: boolean };
type Catalogs = {
  roles: { id: string; code: RoleCode; name: string }[];
  categories: { id: string; name: string }[];
  brands: { id: string; name: string }[];
  conditions: { id: string; name: string }[];
  locations: { id: string; name: string }[];
};
type UserRow = {
  id: string;
  name: string;
  username: string;
  email?: string | null;
  active: boolean;
  lastLogin?: string | null;
  role: { code: RoleCode; name: string };
};
type Product = {
  id: string;
  internalCode: string;
  model?: string | null;
  size?: string | null;
  color?: string | null;
  barcode?: string | null;
  observations?: string | null;
  salePrice?: number | string | null;
  purchaseCost?: number | string | null;
  createdAt?: string;
  status: InventoryStatus;
  brand?: { name: string } | null;
  category?: { name: string } | null;
  condition?: { name: string } | null;
  location?: { name: string } | null;
  images?: ImageRow[];
  movements?: Movement[];
  createdBy?: { name: string; username: string } | null;
};
type Movement = {
  id: string;
  movementType: string;
  previousStatus?: InventoryStatus | null;
  newStatus?: InventoryStatus | null;
  observations?: string | null;
  createdAt: string;
  product?: { id: string; internalCode: string; model?: string | null; size?: string | null } | null;
  user?: { name: string; username: string } | null;
};
type DashboardData = {
  role: RoleCode;
  products: { available: number; reserved?: number; sold?: number };
  inventoryValue?: { purchaseCost: number | string; potentialSale: number | string; potentialMargin: number | string };
  sales?: { today: number | string; month: number | string; profitToday?: number | string; profitMonth?: number | string };
  seller?: { salesToday: number | string; soldToday: number };
  recentProducts?: Product[];
  latestSold?: Product[];
};
type ImportAnalysis = {
  batchId?: string;
  summary: {
    recordsFound: number;
    validRecords: number;
    rowsWithWarnings: number;
    rowsWithErrors: number;
    duplicateCodes: number;
    duplicateBarcodes: number;
    nextCode: string;
  };
  rows: { internalCode?: string; brand?: string; model?: string; validationStatus?: string; issues?: unknown[] }[];
};
type Sale = {
  id: string;
  saleNumber: string;
  total: number | string;
  subtotal: number | string;
  discount: number | string;
  paymentMethod?: string | null;
  status: string;
  createdAt: string;
  seller?: { name: string; username: string } | null;
  items: { id: string; salePrice: number | string; discount: number | string; purchaseCostSnapshot?: number | string | null; product: Product }[];
};
type ReportSummary = {
  inventory: Record<string, number | string>;
  sales: Record<string, number | string>;
  topBrands: { label: string; count: number }[];
  topSizes: { label: string; count: number }[];
  topModels?: { label: string; count: number }[];
  stagnantProducts?: Product[];
  returns?: number;
  activeReservations?: number;
  alerts?: { type: string; label: string; count: number }[];
  bySeller: { seller: string; sales: number; products: number; total: number; discounts: number; averageTicket: number }[];
  salesRows: Sale[];
  movements: Movement[];
};
type CashSession = {
  id: string;
  status: "OPEN" | "CLOSED";
  openingAmount: number | string;
  countedAmount?: number | string | null;
  expectedCash?: number | string | null;
  difference?: number | string | null;
  observations?: string | null;
  closeNotes?: string | null;
  openedAt: string;
  closedAt?: string | null;
  openedBy?: { name: string; username: string };
  summary?: { cashSales: number; digitalSales: number; otherSales: number; incomeCash: number; expenseCash: number; expectedCash: number };
  movements: { id: string; type: "INCOME" | "EXPENSE"; amount: number | string; method: string; concept: string; reason: string; createdAt: string; user?: { username: string } }[];
};
type Reservation = {
  id: string;
  status: "ACTIVE" | "RELEASED" | "CONVERTED" | "EXPIRED";
  customerName?: string | null;
  customerPhone?: string | null;
  expiresAt: string;
  createdAt: string;
  product: Product;
  user?: { name: string; username: string };
  sale?: { saleNumber: string } | null;
};
type ProductReturn = {
  id: string;
  reason: string;
  resultStatus: "AVAILABLE" | "MAINTENANCE" | "REMOVED";
  amount?: number | string | null;
  createdAt: string;
  product: Product;
  sale: { saleNumber: string; createdAt: string; total: number | string };
  user?: { name: string; username: string };
};
type AuditRow = {
  id: string;
  action: string;
  entity: string;
  entityId?: string | null;
  createdAt: string;
  user?: { name: string; username: string } | null;
};
type QrLabel = {
  scanUrl: string;
  qrToken: string;
  svg: string;
  label: { title: string; code: string; product: string; size?: string | null; condition?: string | null };
};
type NavItem = {
  to: string;
  label: string;
  icon: React.ComponentType<{ size?: number }>;
  roles?: readonly RoleCode[];
};

const statusLabels: Record<InventoryStatus, string> = {
  AVAILABLE: "Disponible",
  RESERVED: "Reservado",
  SOLD: "Vendido",
  MAINTENANCE: "Mantenimiento",
  REMOVED: "Retirado"
};
const roleLabels: Record<RoleCode, string> = { SUPER_ADMIN: "Super admin", ADMIN: "Admin", SELLER: "Vendedor" };
const adminRoles: RoleCode[] = ["SUPER_ADMIN", "ADMIN"];

const navItems: NavItem[] = [
  { to: "/dashboard", label: "Inicio", icon: Home },
  { to: "/products", label: "Productos", icon: Box, roles: adminRoles },
  { to: "/quick-entry", label: "Alta rapida", icon: PackagePlus, roles: adminRoles },
  { to: "/scanner", label: "Escanear", icon: ScanLine },
  { to: "/sales", label: "Ventas", icon: ShoppingCart },
  { to: "/inventory", label: "Inventario", icon: BarChart3, roles: adminRoles },
  { to: "/cash", label: "Caja", icon: Wallet, roles: adminRoles },
  { to: "/reservations", label: "Reservas", icon: ClipboardList },
  { to: "/returns", label: "Devoluciones", icon: RotateCcw, roles: adminRoles },
  { to: "/alerts", label: "Alertas", icon: Bell, roles: adminRoles },
  { to: "/reports", label: "Reportes", icon: BarChart3, roles: adminRoles },
  { to: "/inventory/import", label: "Importar", icon: FileSpreadsheet, roles: adminRoles },
  { to: "/users", label: "Usuarios", icon: Users, roles: adminRoles },
  { to: "/audit", label: "Auditoria", icon: ShieldCheck, roles: ["SUPER_ADMIN"] },
  { to: "/profile", label: "Perfil", icon: UserCircle },
  { to: "/settings", label: "Ajustes", icon: Settings, roles: ["SUPER_ADMIN"] }
];

function App() {
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY) ?? "");
  const [user, setUser] = useState<UserSession | null>(() => readStoredUser());

  const signIn = (nextToken: string, nextUser: UserSession) => {
    localStorage.setItem(TOKEN_KEY, nextToken);
    localStorage.setItem(USER_KEY, JSON.stringify(nextUser));
    setToken(nextToken);
    setUser(nextUser);
  };

  const signOut = () => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    setToken("");
    setUser(null);
  };

  return (
    <BrowserRouter>
      {user && token ? (
        <Shell user={user} onSignOut={signOut}>
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/login" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<Dashboard token={token} user={user} />} />
            <Route path="/products" element={<RequireRole user={user} roles={adminRoles}><Products token={token} user={user} /></RequireRole>} />
            <Route path="/quick-entry" element={<RequireRole user={user} roles={adminRoles}><QuickEntry token={token} /></RequireRole>} />
            <Route path="/products/new" element={<RequireRole user={user} roles={adminRoles}><ProductForm token={token} /></RequireRole>} />
            <Route path="/products/:id" element={<ProductDetail token={token} user={user} />} />
            <Route path="/products/:id/edit" element={<RequireRole user={user} roles={adminRoles}><ProductForm token={token} edit /></RequireRole>} />
            <Route path="/inventory" element={<RequireRole user={user} roles={adminRoles}><Inventory token={token} user={user} /></RequireRole>} />
            <Route path="/inventory/import" element={<RequireRole user={user} roles={adminRoles}><ImportPage token={token} /></RequireRole>} />
            <Route path="/users" element={<RequireRole user={user} roles={adminRoles}><UsersPage token={token} user={user} /></RequireRole>} />
            <Route path="/cash" element={<RequireRole user={user} roles={adminRoles}><CashPage token={token} /></RequireRole>} />
            <Route path="/reservations" element={<ReservationsPage token={token} user={user} />} />
            <Route path="/returns" element={<RequireRole user={user} roles={adminRoles}><ReturnsPage token={token} /></RequireRole>} />
            <Route path="/alerts" element={<RequireRole user={user} roles={adminRoles}><AlertsPage token={token} /></RequireRole>} />
            <Route path="/reports" element={<RequireRole user={user} roles={adminRoles}><ReportsPage token={token} /></RequireRole>} />
            <Route path="/audit" element={<RequireRole user={user} roles={["SUPER_ADMIN"]}><AuditPage token={token} /></RequireRole>} />
            <Route path="/settings" element={<RequireRole user={user} roles={["SUPER_ADMIN"]}><SettingsPage token={token} /></RequireRole>} />
            <Route path="/profile" element={<Profile token={token} user={user} onSignOut={signOut} />} />
            <Route path="/scanner" element={<ScannerPage token={token} user={user} />} />
            <Route path="/scan/:token" element={<ScannerPage token={token} user={user} />} />
            <Route path="/sales" element={<SalesPage token={token} user={user} />} />
            <Route path="/sales/new" element={<NewSale token={token} user={user} />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </Shell>
      ) : (
        <Routes>
          <Route path="/login" element={<Login onSignIn={signIn} />} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      )}
    </BrowserRouter>
  );
}

function Shell({ user, onSignOut, children }: { user: UserSession; onSignOut: () => void; children: React.ReactNode }) {
  const allowedNav = navItems.filter((item) => canAccess(user.role, item.roles));
  return (
    <div className="appShell">
      <aside className="sidebar">
        <div className="brandBlock">
          <div className="brandMark">RX</div>
          <div><strong><span className="brandWhite">RAGUIL</span><span className="brandAccent">EX</span></strong><span>Sistema de Inventario y Venta de Tenis</span></div>
        </div>
        <nav>{allowedNav.map((item) => <NavLink key={item.to} to={item.to}><item.icon size={18} /><span>{item.label}</span></NavLink>)}</nav>
        <div className="sessionCard">
          <ShieldCheck size={18} />
          <div><strong>{user.name}</strong><span>{roleLabels[user.role]}</span></div>
          <button className="iconButton" type="button" onClick={onSignOut} title="Cerrar sesion"><LogOut size={18} /></button>
        </div>
      </aside>
      <main>
        <header className="topBar">
          <div className="globalSearch"><Search size={18} /><input placeholder="Buscar producto, codigo, marca..." /></div>
          <NavLink className="topAction" to="/alerts"><Bell size={18} /><span>Alertas</span></NavLink>
          <NavLink className="topProfile" to="/profile"><UserCircle size={20} /><span>{user.username}</span></NavLink>
        </header>
        {children}
      </main>
      <nav className="bottomNav">
        {[
          { to: "/dashboard", label: "Inicio", icon: Home },
          { to: "/sales", label: "Ventas", icon: ShoppingCart },
          { to: "/scanner", label: "Escanear", icon: ScanLine, featured: true },
          { to: "/profile", label: "Mas", icon: UserCircle }
        ].map((item) => <NavLink key={item.to} className={item.featured ? "featuredNav" : ""} to={item.to}><item.icon size={21} /><span>{item.label}</span></NavLink>)}
      </nav>
    </div>
  );
}

function Login({ onSignIn }: { onSignIn: (token: string, user: UserSession) => void }) {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const data = await apiRequest<{ token: string; user: UserSession }>("/auth/login", { method: "POST", body: JSON.stringify({ username, password }) });
      onSignIn(data.token, data.user);
      if (!remember) sessionStorage.setItem(TOKEN_KEY, data.token);
      navigate("/dashboard");
    } catch (err) {
      const message = err instanceof Error ? err.message : "";
      setError(message.includes("SIN CONEXION") || message.includes("404") ? "La API no esta disponible. Revisa el despliegue de Render y VITE_API_URL." : "Usuario o contrasena incorrectos.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="loginScreen">
      <div className="loginBrandPane">
        <div className="brandBlock heroBrand"><div className="brandMark">RX</div><div><strong><span className="brandWhite">RAGUIL</span><span className="brandAccent">EX</span></strong><span>Sistema de Inventario y Venta de Tenis</span></div></div>
        <div className="shoeHero"><ScanLine size={96} /><span>Inventario vivo</span></div>
        <div>
          <p className="heroKicker">Simple.</p>
          <p className="heroKicker">Rapido.</p>
          <p className="heroKicker accent">Poderoso.</p>
          <p className="heroSub">Todo el control de tu inventario y ventas en una sola aplicacion.</p>
        </div>
        <div className="benefitGrid">
          <div><strong>Escanea</strong><span>Registra o vende en segundos.</span></div>
          <div><strong>Controla</strong><span>Inventario en tiempo real.</span></div>
          <div><strong>Haz crecer</strong><span>Conoce ventas y resultados.</span></div>
        </div>
      </div>
      <form className="loginPanel" onSubmit={submit}>
        <div className="brandBlock compact"><div className="brandMark">RX</div><div><strong><span>RAGUIL</span><span className="brandAccent">EX</span></strong><span>Inventario operativo</span></div></div>
        <h1>Iniciar sesion</h1>
        <p>Escanea, vende y controla cada par desde una app profesional.</p>
        <label><span>Usuario o correo electronico</span><input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" required /></label>
        <label>
          <span>Contrasena</span>
          <div className="passwordField">
            <input value={password} onChange={(event) => setPassword(event.target.value)} type={showPassword ? "text" : "password"} autoComplete="current-password" required />
            <button type="button" onClick={() => setShowPassword((current) => !current)} aria-label={showPassword ? "Ocultar contrasena" : "Mostrar contrasena"} title={showPassword ? "Ocultar" : "Ver"}>
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </label>
        <label className="checkLine"><input checked={remember} onChange={(event) => setRemember(event.target.checked)} type="checkbox" /> <span>Recordarme</span></label>
        {error && <p className="errorText">{error}</p>}
        <button type="submit" disabled={loading}><LogIn size={18} />{loading ? "Entrando..." : "Iniciar sesion"}</button>
        <div className="demoUsers">
          <span>Usuarios de prueba</span>
          <button type="button" onClick={() => fillLogin("superadmin")}>Super admin</button>
          <button type="button" onClick={() => fillLogin("admin")}>Admin</button>
          <button type="button" onClick={() => fillLogin("vendedor")}>Vendedor</button>
        </div>
      </form>
    </section>
  );

  function fillLogin(nextUsername: string) {
    setUsername(nextUsername);
    setPassword("");
    setError("");
  }
}

function Dashboard({ token, user }: { token: string; user: UserSession }) {
  const { data, error, loading, reload } = useApi<DashboardData>("/dashboard", token);
  const seller = user.role === "SELLER";
  return (
    <>
      <PageHeader title={seller ? `Hola, ${user.name}` : "Control del dia"} eyebrow={seller ? "Vendedor" : "Dashboard"} action={<button type="button" onClick={reload}><CheckCircle2 size={18} />Actualizar</button>} />
      <StateBox loading={loading} error={error}>
        {data && seller ? (
          <>
            <section className="metricGrid sellerGrid">
              <Metric label="Mis ventas hoy" value={money(data.seller?.salesToday)} />
              <Metric label="Vendidos hoy" value={String(data.seller?.soldToday ?? 0)} />
              <Metric label="Disponibles" value={String(data.products.available)} />
              <Metric label="Reservas activas" value={String(data.products.reserved ?? 0)} />
            </section>
            <section className="actionGrid">
              <NavLink className="buttonLike bigAction scanCta" to="/scanner"><ScanLine size={22} />Escanear tenis</NavLink>
              <NavLink className="buttonLike bigAction secondary" to="/sales/new"><Search size={22} />Buscar producto</NavLink>
              <NavLink className="buttonLike bigAction" to="/sales/new"><ShoppingCart size={22} />Nueva venta</NavLink>
            </section>
          </>
        ) : data ? (
          <>
            <section className="metricGrid">
              <Metric label="Disponibles" value={String(data.products.available)} />
              <Metric label="Vendidos" value={String(data.products.sold ?? 0)} />
              <Metric label="Ventas hoy" value={money(data.sales?.today)} />
              <Metric label="Ventas del mes" value={money(data.sales?.month)} />
              <Metric label="Utilidad hoy" value={money(data.sales?.profitToday)} />
              <Metric label="Utilidad mes" value={money(data.sales?.profitMonth)} />
            </section>
            <section className="metricGrid">
              <Metric label="Costo inventario" value={money(data.inventoryValue?.purchaseCost)} />
              <Metric label="Venta potencial" value={money(data.inventoryValue?.potentialSale)} />
              <Metric label="Margen potencial" value={money(data.inventoryValue?.potentialMargin)} />
              <Metric label="Reservados" value={String(data.products.reserved ?? 0)} />
            </section>
            <section className="twoColumns">
              <DataPanel title="Productos recientes" products={data.recentProducts ?? []} />
              <DataPanel title="Ultimos vendidos" products={data.latestSold ?? []} empty="Todavia no hay ventas registradas." />
            </section>
          </>
        ) : null}
      </StateBox>
    </>
  );
}

function Products({ token, user }: { token: string; user: UserSession }) {
  const { data: catalogs } = useApi<Catalogs>("/settings/catalogs", token);
  const [filters, setFilters] = useState({ q: "", status: "", brand: "", size: "", category: "", condition: "", location: "" });
  const debounced = useDebouncedValue(filters, 250);
  const query = `/products?take=80${toQuery(debounced)}`;
  const { data, error, loading, reload } = useApi<Product[]>(query, token);

  return (
    <>
      <PageHeader title="Productos" eyebrow={`${data?.length ?? 0} encontrados`} action={canAccess(user.role, adminRoles) ? <NavLink className="buttonLike" to="/products/new"><PackagePlus size={18} />Nuevo</NavLink> : undefined} />
      <div className="filterPanel">
        <div className="searchBox"><Search size={18} /><input placeholder="Buscar producto..." value={filters.q} onChange={(event) => setFilters({ ...filters, q: event.target.value })} /></div>
        <Select label="Estado" value={filters.status} options={Object.entries(statusLabels).map(([value, label]) => ({ value, label }))} onChange={(status) => setFilters({ ...filters, status })} />
        <Select label="Marca" value={filters.brand} options={uniqueOptions(data?.map((product) => product.brand?.name))} onChange={(brand) => setFilters({ ...filters, brand })} />
        <Select label="Talla" value={filters.size} options={uniqueOptions(data?.map((product) => product.size))} onChange={(size) => setFilters({ ...filters, size })} />
        <Select label="Categoria" value={filters.category} options={catalogs?.categories.map((item) => ({ value: item.name, label: item.name })) ?? []} onChange={(category) => setFilters({ ...filters, category })} />
        <Select label="Condicion" value={filters.condition} options={catalogs?.conditions.map((item) => ({ value: item.name, label: item.name })) ?? []} onChange={(condition) => setFilters({ ...filters, condition })} />
        <Select label="Ubicacion" value={filters.location} options={catalogs?.locations.map((item) => ({ value: item.name, label: item.name })) ?? []} onChange={(location) => setFilters({ ...filters, location })} />
        <button type="button" onClick={reload}>Actualizar</button>
      </div>
      <StateBox loading={loading} error={error}><ProductTable products={data ?? []} /></StateBox>
    </>
  );
}

function ProductDetail({ token, user }: { token: string; user: UserSession }) {
  const { id = "" } = useParams();
  const { data: product, error, loading, reload } = useApi<Product>(`/products/${id}`, token);
  const [photoMessage, setPhotoMessage] = useState("");
  const [qr, setQr] = useState<QrLabel | null>(null);
  const admin = canAccess(user.role, adminRoles);
  const primaryImage = product?.images?.find((image) => image.isPrimary) ?? product?.images?.[0];
  const margin = Number(product?.salePrice ?? 0) - Number(product?.purchaseCost ?? 0);

  const uploadPhoto = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !product) return;
    const form = new FormData();
    form.append("file", file);
    await apiRequest(`/products/${product.id}/images`, { token, method: "POST", body: form });
    setPhotoMessage("Fotografia agregada.");
    reload();
  };

  const generateQr = async () => {
    if (!product) return;
    setQr(await apiRequest<QrLabel>(`/qr/product/${product.id}`, { token }));
  };

  return (
    <>
      <PageHeader title={product?.internalCode ?? "Producto"} eyebrow="Ficha individual" action={product && admin ? <NavLink className="buttonLike" to={`/products/${product.id}/edit`}><Pencil size={18} />Editar</NavLink> : undefined} />
      <StateBox loading={loading} error={error}>
        {product && (
          <section className="detailLayout">
            <div className="photoPane">
              {primaryImage ? <img src={`${API_URL}${primaryImage.imageUrl}`} alt={`Foto ${product.internalCode}`} /> : <div className="photoPlaceholder"><Camera /><strong>Sin fotografia</strong></div>}
              <div className="galleryStrip">
                {(product.images ?? []).map((image) => <img key={image.id} src={`${API_URL}${image.imageUrl}`} alt="" />)}
              </div>
              {admin && <label className="uploadButton"><Camera size={18} />Agregar foto<input type="file" accept="image/*" capture="environment" onChange={uploadPhoto} /></label>}
              {photoMessage && <p className="successText">{photoMessage}</p>}
            </div>
            <div className="detailInfo">
              <StatusPill status={product.status} />
              <InfoGrid rows={[
                ["Marca", product.brand?.name],
                ["Modelo", product.model],
                ["Categoria", product.category?.name],
                ["Talla", product.size],
                ["Color", product.color],
                ["Condicion", product.condition?.name],
                ["Precio de venta", money(product.salePrice)],
                ["Ubicacion", product.location?.name],
                ["Observaciones", product.observations]
              ]} />
              {admin && <section className="adminBox"><h2>Informacion administrativa</h2><InfoGrid rows={[["Costo", money(product.purchaseCost)], ["Venta", money(product.salePrice)], ["Margen", money(margin)], ["Margen %", marginPercent(product.purchaseCost, product.salePrice)], ["Registrado por", product.createdBy?.username], ["Fecha ingreso", product.createdAt ? dateLabel(product.createdAt) : "-"]]} /></section>}
              <section className="actionGrid">
                {admin ? <NavLink className="buttonLike" to={`/products/${product.id}/edit`}><Pencil size={18} />Editar</NavLink> : <NavLink className="buttonLike" to="/sales/new"><ShoppingCart size={18} />Vender</NavLink>}
                {admin && <button type="button" onClick={generateQr}><ScanLine size={18} />Generar QR</button>}
                <NavLink className="buttonLike secondary" to="/scanner"><ScanLine size={18} />Escanear otro</NavLink>
              </section>
              {qr && <section className="qrLabel"><h2>{qr.label.title}</h2><strong>{qr.label.code}</strong><div dangerouslySetInnerHTML={{ __html: qr.svg }} /><p>{qr.label.product}</p><p>Talla {qr.label.size ?? "-"} · {qr.label.condition ?? "-"}</p><button type="button" onClick={() => window.print()}>Imprimir</button></section>}
            </div>
          </section>
        )}
      </StateBox>
    </>
  );
}

function ProductForm({ token, edit = false }: { token: string; edit?: boolean }) {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { data: existing } = useApi<Product>(edit ? `/products/${id}` : "/products/next-code", token);
  const { data: catalogs } = useApi<Catalogs>("/settings/catalogs", token);
  const [form, setForm] = useState({ brandName: "", model: "", size: "", color: "", categoryName: "Tenis/Calzado", conditionName: "Bueno", locationName: "Raguilex Principal", purchaseCost: "", salePrice: "", barcode: "", observations: "", status: "AVAILABLE" as InventoryStatus });
  const [photo, setPhoto] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!edit || !("internalCode" in (existing ?? {}))) return;
    const product = existing as Product;
    setForm({
      brandName: product.brand?.name ?? "",
      model: product.model ?? "",
      size: product.size ?? "",
      color: product.color ?? "",
      categoryName: product.category?.name ?? "Tenis/Calzado",
      conditionName: product.condition?.name ?? "Bueno",
      locationName: product.location?.name ?? "Raguilex Principal",
      purchaseCost: String(product.purchaseCost ?? ""),
      salePrice: String(product.salePrice ?? ""),
      barcode: product.barcode ?? "",
      observations: product.observations ?? "",
      status: product.status === "SOLD" ? "AVAILABLE" : product.status
    });
  }, [edit, existing]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const product = await apiRequest<Product>(edit ? `/products/${id}` : "/products", { token, method: edit ? "PUT" : "POST", body: JSON.stringify(payloadFromForm(form)) });
      if (!edit && photo) {
        const data = new FormData();
        data.append("file", photo);
        try {
          await apiRequest(`/products/${product.id}/images`, { token, method: "POST", body: data });
        } catch {
          setError(`Producto ${product.internalCode} creado, pero no se pudo subir la foto. Entra a la ficha del producto para intentarlo otra vez.`);
          return;
        }
      }
      navigate(edit ? `/products/${id}` : "/products");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar el producto.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <PageHeader title={edit ? "Editar producto" : "Nuevo producto"} eyebrow={edit ? "Ficha editable" : `Codigo automatico ${!edit && existing && "nextCodePreview" in existing ? existing.nextCodePreview : ""}`} />
      <form className="formSurface productForm" onSubmit={submit}>
        {!edit && (
          <label className="wideField photoFirstCard">
            <span>Primero toma la foto del producto</span>
            <input id="product-photo" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" onChange={(event) => setPhoto(event.target.files?.[0] ?? null)} />
            <small>{photo ? `Foto lista: ${photo.name}` : "En celular se abrira la camara o galeria. Luego completa los datos."}</small>
          </label>
        )}
        <Field label="Marca *" value={form.brandName} onChange={(brandName) => setForm({ ...form, brandName })} list="brands" required />
        <datalist id="brands">{(catalogs?.brands ?? []).map((item) => <option key={item.id} value={item.name} />)}</datalist>
        <Field label="Modelo" value={form.model} onChange={(model) => setForm({ ...form, model })} />
        <Field label="Talla *" value={form.size} onChange={(size) => setForm({ ...form, size })} required />
        <Field label="Color" value={form.color} onChange={(color) => setForm({ ...form, color })} />
        <SelectInput label="Categoria *" value={form.categoryName} options={catalogs?.categories.map((item) => item.name) ?? ["Tenis/Calzado"]} onChange={(categoryName) => setForm({ ...form, categoryName })} />
        <SelectInput label="Condicion *" value={form.conditionName} options={catalogs?.conditions.map((item) => item.name) ?? ["Bueno"]} onChange={(conditionName) => setForm({ ...form, conditionName })} />
        <SelectInput label="Ubicacion" value={form.locationName} options={catalogs?.locations.map((item) => item.name) ?? ["Raguilex Principal"]} onChange={(locationName) => setForm({ ...form, locationName })} />
        <SelectInput label="Estado" value={form.status} options={Object.keys(statusLabels).filter((status) => status !== "SOLD")} labels={statusLabels} onChange={(status) => setForm({ ...form, status: status as InventoryStatus })} />
        <Field label="Costo" value={form.purchaseCost} onChange={(purchaseCost) => setForm({ ...form, purchaseCost })} type="number" />
        <Field label="Precio de venta *" value={form.salePrice} onChange={(salePrice) => setForm({ ...form, salePrice })} type="number" required />
        <Field label="Codigo original/UPC" value={form.barcode} onChange={(barcode) => setForm({ ...form, barcode })} />
        <label className="wideField"><span>Observaciones</span><textarea value={form.observations} onChange={(event) => setForm({ ...form, observations: event.target.value })} /></label>
        {error && <p className="errorText wideField">{error}</p>}
        <button className="wideField" type="submit" disabled={saving}><PackagePlus size={18} />{saving ? "Guardando..." : "Guardar producto"}</button>
      </form>
    </>
  );
}

function QuickEntry({ token }: { token: string }) {
  const [form, setForm] = useState({ brandName: "", size: "", color: "", purchaseCost: "", salePrice: "" });
  const [photo, setPhoto] = useState<File | null>(null);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    try {
      const product = await apiRequest<Product>("/products/quick-entry", {
        token,
        method: "POST",
        body: JSON.stringify(payloadFromForm(form))
      });
      if (photo) {
        const data = new FormData();
        data.append("file", photo);
        await apiRequest(`/products/${product.id}/images`, { token, method: "POST", body: data });
      }
      setMessage(`${product.internalCode} guardado. Listo para escanear el siguiente.`);
      setForm({ brandName: "", size: "", color: "", purchaseCost: "", salePrice: "" });
      setPhoto(null);
      const input = document.getElementById("quick-photo") as HTMLInputElement | null;
      if (input) input.value = "";
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo guardar el tenis.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <PageHeader title="Alta rapida" eyebrow="Foto -> codigo/datos -> guardar" />
      <div className="stepper"><span className="active">1 Foto</span><span className="active">2 Datos</span><span>3 Guardar</span></div>
      <form className="formSurface productForm quickEntryForm" onSubmit={save}>
        <label className="wideField photoFirstCard">
          <span>Primero toma la foto del producto</span>
          <input id="quick-photo" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" onChange={(event) => setPhoto(event.target.files?.[0] ?? null)} />
          <small>{photo ? `Foto lista: ${photo.name}` : "En celular se abrira la camara o galeria. Luego completa los datos."}</small>
        </label>
        <Field label="Marca" value={form.brandName} onChange={(brandName) => setForm({ ...form, brandName })} required />
        <Field label="Talla" value={form.size} onChange={(size) => setForm({ ...form, size })} required />
        <Field label="Color" value={form.color} onChange={(color) => setForm({ ...form, color })} required />
        <Field label="Costo de compra" value={form.purchaseCost} onChange={(purchaseCost) => setForm({ ...form, purchaseCost })} type="number" required />
        <Field label="Precio de venta" value={form.salePrice} onChange={(salePrice) => setForm({ ...form, salePrice })} type="number" required />
        <button className="wideField" type="submit" disabled={saving}>{saving ? "Guardando..." : "Guardar y escanear siguiente"}</button>
        {message && <p className={message.includes("guardado") ? "successText wideField" : "errorText wideField"}>{message}</p>}
      </form>
      <section className="listSurface">
        <h2>Datos automaticos</h2>
        <p>El sistema genera codigo TN, QR, estado disponible, movimiento ENTRY, fecha, usuario y auditoria.</p>
      </section>
    </>
  );
}

function Inventory({ token, user }: { token: string; user: UserSession }) {
  const { data: dashboard } = useApi<DashboardData>("/dashboard", token);
  const { data: products, reload: reloadProducts } = useApi<Product[]>("/products?take=100", token);
  const { data: movements, error, loading, reload } = useApi<Movement[]>("/inventory/movements", token);
  const [productId, setProductId] = useState("");
  const [newStatus, setNewStatus] = useState<InventoryStatus>("AVAILABLE");
  const [observations, setObservations] = useState("");
  const [message, setMessage] = useState("");
  const admin = canAccess(user.role, adminRoles);

  const adjust = async (event: React.FormEvent) => {
    event.preventDefault();
    setMessage("");
    await apiRequest("/inventory/adjustments", { token, method: "POST", body: JSON.stringify({ productId, newStatus, observations }) });
    setObservations("");
    setMessage("Movimiento registrado.");
    reload();
    reloadProducts();
  };

  const other = (products ?? []).filter((product) => !["AVAILABLE", "RESERVED", "SOLD"].includes(product.status)).length;
  return (
    <>
      <PageHeader title="Inventario" eyebrow="Resumen y movimientos" />
      <section className="metricGrid">
        <Metric label="Total" value={String(products?.length ?? 0)} />
        <Metric label="Disponibles" value={String(dashboard?.products.available ?? 0)} />
        <Metric label="Vendidos" value={String(dashboard?.products.sold ?? 0)} />
        <Metric label="Otros" value={String(other)} />
      </section>
      {admin && (
        <form className="adjustPanel" onSubmit={adjust}>
          <label><span>Producto</span><select value={productId} onChange={(event) => setProductId(event.target.value)} required><option value="">Seleccionar producto</option>{(products ?? []).map((product) => <option key={product.id} value={product.id}>{product.internalCode} - {product.brand?.name ?? "Sin marca"} {product.model ?? ""}</option>)}</select></label>
          <SelectInput label="Nuevo estado" value={newStatus} options={Object.keys(statusLabels).filter((status) => status !== "SOLD")} labels={statusLabels} onChange={(status) => setNewStatus(status as InventoryStatus)} />
          <label><span>Observaciones</span><input value={observations} onChange={(event) => setObservations(event.target.value)} /></label>
          <button type="submit">Aplicar ajuste</button>
          {message && <p className="successText">{message}</p>}
        </form>
      )}
      <StateBox loading={loading} error={error}><MovementTable movements={movements ?? []} /></StateBox>
    </>
  );
}

function ImportPage({ token }: { token: string }) {
  const [file, setFile] = useState<File | null>(null);
  const [analysis, setAnalysis] = useState<ImportAnalysis | null>(null);
  const [filter, setFilter] = useState("ALL");
  const [loading, setLoading] = useState(false);
  const rows = (analysis?.rows ?? []).filter((row) => filter === "ALL" || row.validationStatus === filter);

  const analyze = async () => {
    if (!file) return;
    setLoading(true);
    const form = new FormData();
    form.append("file", file);
    const result = await apiRequest<ImportAnalysis>("/import/analyze", { token, method: "POST", body: form });
    setAnalysis(result);
    setLoading(false);
  };

  return (
    <>
      <PageHeader title="Importar inventario" eyebrow="Excel fase 1" />
      <section className="formSurface">
        <label><span>Seleccionar Excel</span><input type="file" accept=".xlsx,.xls" onChange={(event) => setFile(event.target.files?.[0] ?? null)} /></label>
        <button type="button" onClick={analyze} disabled={!file || loading}><FileSpreadsheet size={18} />{loading ? "Analizando..." : "Analizar"}</button>
      </section>
      {analysis && (
        <>
          <section className="metricGrid">
            <Metric label="Registros" value={String(analysis.summary.recordsFound)} />
            <Metric label="Correctos" value={String(analysis.summary.validRecords)} />
            <Metric label="Observaciones" value={String(analysis.summary.rowsWithWarnings)} />
            <Metric label="Errores" value={String(analysis.summary.rowsWithErrors)} />
          </section>
          <div className="tabs">{["ALL", "VALID", "WARNING", "ERROR"].map((value) => <button key={value} className={filter === value ? "activeTab" : ""} type="button" onClick={() => setFilter(value)}>{value}</button>)}</div>
          <section className="tableSurface"><table><thead><tr><th>Codigo</th><th>Producto</th><th>Estado validacion</th></tr></thead><tbody>{rows.map((row, index) => <tr key={`${row.internalCode}-${index}`}><td data-label="Codigo">{row.internalCode ?? "-"}</td><td data-label="Producto">{row.brand ?? ""} {row.model ?? ""}</td><td data-label="Estado">{row.validationStatus ?? "ERROR"}</td></tr>)}</tbody></table></section>
        </>
      )}
    </>
  );
}

function UsersPage({ token, user }: { token: string; user: UserSession }) {
  const { data, error, loading, reload } = useApi<UserRow[]>("/users", token);
  const [form, setForm] = useState({ name: "", username: "", email: "", password: "", role: "SELLER" as RoleCode, active: true });
  const [message, setMessage] = useState("");
  const roles = user.role === "SUPER_ADMIN" ? ["SELLER", "ADMIN"] as RoleCode[] : ["SELLER"] as RoleCode[];

  const createUser = async (event: React.FormEvent) => {
    event.preventDefault();
    setMessage("");
    await apiRequest("/users", { token, method: "POST", body: JSON.stringify({ ...form, email: form.email || undefined }) });
    setForm({ name: "", username: "", email: "", password: "", role: "SELLER", active: true });
    setMessage("Usuario creado. La contrasena temporal no se volvera a mostrar.");
    reload();
  };

  const toggle = async (target: UserRow) => {
    await apiRequest(`/users/${target.id}`, { token, method: "PATCH", body: JSON.stringify({ active: !target.active }) });
    reload();
  };

  return (
    <>
      <PageHeader title="Usuarios" eyebrow="Administracion" />
      <form className="formSurface productForm" onSubmit={createUser}>
        <Field label="Nombre *" value={form.name} onChange={(name) => setForm({ ...form, name })} required />
        <Field label="Usuario *" value={form.username} onChange={(username) => setForm({ ...form, username })} required />
        <Field label="Correo" value={form.email} onChange={(email) => setForm({ ...form, email })} type="email" />
        <Field label="Contrasena temporal *" value={form.password} onChange={(password) => setForm({ ...form, password })} type="password" required />
        <SelectInput label="Rol" value={form.role} options={roles} labels={roleLabels} onChange={(role) => setForm({ ...form, role: role as RoleCode })} />
        <label className="checkLine"><input checked={form.active} onChange={(event) => setForm({ ...form, active: event.target.checked })} type="checkbox" /> <span>Activo</span></label>
        <button className="wideField" type="submit">Crear usuario</button>
        {message && <p className="successText wideField">{message}</p>}
      </form>
      <StateBox loading={loading} error={error}><UserTable users={data ?? []} onToggle={toggle} /></StateBox>
    </>
  );
}

function CashPage({ token }: { token: string }) {
  const { data, error, loading, reload } = useApi<{ session: CashSession | null }>("/cash/current", token);
  const [openingAmount, setOpeningAmount] = useState("300");
  const [observations, setObservations] = useState("");
  const [movement, setMovement] = useState({ type: "EXPENSE", amount: "", method: "EFECTIVO", concept: "", reason: "" });
  const [countedAmount, setCountedAmount] = useState("");
  const [closeNotes, setCloseNotes] = useState("");
  const session = data?.session;

  const openCash = async (event: React.FormEvent) => {
    event.preventDefault();
    await apiRequest("/cash/open", { token, method: "POST", body: JSON.stringify({ openingAmount: Number(openingAmount), observations }) });
    reload();
  };
  const addMovement = async (event: React.FormEvent) => {
    event.preventDefault();
    await apiRequest("/cash/movements", { token, method: "POST", body: JSON.stringify({ ...movement, amount: Number(movement.amount) }) });
    setMovement({ type: "EXPENSE", amount: "", method: "EFECTIVO", concept: "", reason: "" });
    reload();
  };
  const closeCash = async (event: React.FormEvent) => {
    event.preventDefault();
    await apiRequest("/cash/close", { token, method: "POST", body: JSON.stringify({ countedAmount: Number(countedAmount), closeNotes }) });
    reload();
  };

  return (
    <>
      <PageHeader title="Caja" eyebrow="Apertura, movimientos y cierre" action={<button type="button" onClick={reload}>Actualizar</button>} />
      <StateBox loading={loading} error={error}>
        {!session ? (
          <form className="formSurface productForm" onSubmit={openCash}>
            <Field label="Monto inicial" value={openingAmount} onChange={setOpeningAmount} type="number" required />
            <Field label="Observaciones" value={observations} onChange={setObservations} />
            <button className="wideField" type="submit">Abrir caja</button>
          </form>
        ) : (
          <>
            <section className="metricGrid">
              <Metric label="Monto inicial" value={money(session.openingAmount)} />
              <Metric label="Ventas efectivo" value={money(session.summary?.cashSales)} />
              <Metric label="QR/Transferencia" value={money(session.summary?.digitalSales)} />
              <Metric label="Efectivo esperado" value={money(session.summary?.expectedCash)} />
            </section>
            <section className="twoColumns">
              <form className="formSurface" onSubmit={addMovement}>
                <h2>Ingreso / egreso</h2>
                <SelectInput label="Tipo" value={movement.type} options={["INCOME", "EXPENSE"]} labels={{ INCOME: "Ingreso", EXPENSE: "Egreso" }} onChange={(type) => setMovement({ ...movement, type })} />
                <Field label="Monto" value={movement.amount} onChange={(amount) => setMovement({ ...movement, amount })} type="number" required />
                <SelectInput label="Metodo" value={movement.method} options={["EFECTIVO", "QR_TRANSFERENCIA", "OTRO"]} labels={{ EFECTIVO: "Efectivo", QR_TRANSFERENCIA: "QR/Transferencia", OTRO: "Otro" }} onChange={(method) => setMovement({ ...movement, method })} />
                <Field label="Concepto" value={movement.concept} onChange={(concept) => setMovement({ ...movement, concept })} required />
                <Field label="Motivo" value={movement.reason} onChange={(reason) => setMovement({ ...movement, reason })} required />
                <button type="submit">Registrar movimiento</button>
              </form>
              <form className="formSurface" onSubmit={closeCash}>
                <h2>Cierre definitivo</h2>
                <Field label="Efectivo contado" value={countedAmount} onChange={setCountedAmount} type="number" required />
                <Field label="Observacion de cierre" value={closeNotes} onChange={setCloseNotes} />
                <button type="submit">Cerrar caja</button>
              </form>
            </section>
            <CashMovements movements={session.movements ?? []} />
          </>
        )}
      </StateBox>
    </>
  );
}

function ReservationsPage({ token, user }: { token: string; user: UserSession }) {
  const { data, error, loading, reload } = useApi<Reservation[]>("/reservations", token);
  const { data: products } = useApi<Product[]>("/products?status=AVAILABLE&take=100", token);
  const [form, setForm] = useState({ productId: "", customerName: "", customerPhone: "", expiresAt: "", observations: "" });
  const canRelease = canAccess(user.role, adminRoles);

  const createReservation = async (event: React.FormEvent) => {
    event.preventDefault();
    await apiRequest("/reservations", { token, method: "POST", body: JSON.stringify({ ...form, expiresAt: form.expiresAt ? new Date(form.expiresAt).toISOString() : undefined }) });
    setForm({ productId: "", customerName: "", customerPhone: "", expiresAt: "", observations: "" });
    reload();
  };
  const release = async (id: string) => {
    await apiRequest(`/reservations/${id}/release`, { token, method: "POST" });
    reload();
  };

  return (
    <>
      <PageHeader title="Reservas" eyebrow="Producto reservado y vencimientos" action={<button type="button" onClick={reload}>Actualizar</button>} />
      <form className="formSurface productForm" onSubmit={createReservation}>
        <label><span>Producto disponible</span><select value={form.productId} onChange={(event) => setForm({ ...form, productId: event.target.value })} required><option value="">Seleccionar</option>{(products ?? []).map((item) => <option key={item.id} value={item.id}>{item.internalCode} - {item.brand?.name ?? ""} {item.model ?? ""}</option>)}</select></label>
        <Field label="Cliente" value={form.customerName} onChange={(customerName) => setForm({ ...form, customerName })} />
        <Field label="Telefono" value={form.customerPhone} onChange={(customerPhone) => setForm({ ...form, customerPhone })} />
        <Field label="Vence" value={form.expiresAt} onChange={(expiresAt) => setForm({ ...form, expiresAt })} type="datetime-local" />
        <Field label="Observacion" value={form.observations} onChange={(observations) => setForm({ ...form, observations })} />
        <button className="wideField" type="submit">Reservar</button>
      </form>
      <StateBox loading={loading} error={error}>
        <section className="tableSurface">
          <table><thead><tr><th>Producto</th><th>Cliente</th><th>Vence</th><th>Estado</th><th>Usuario</th><th>Accion</th></tr></thead><tbody>{(data ?? []).map((row) => <tr key={row.id}><td data-label="Producto">{row.product.internalCode}</td><td data-label="Cliente">{row.customerName ?? "-"}</td><td data-label="Vence">{dateLabel(row.expiresAt)}</td><td data-label="Estado">{row.status}</td><td data-label="Usuario">{row.user?.username ?? "-"}</td><td data-label="Accion">{canRelease && row.status === "ACTIVE" ? <button className="smallButton" type="button" onClick={() => release(row.id)}>Liberar</button> : "-"}</td></tr>)}</tbody></table>
        </section>
      </StateBox>
    </>
  );
}

function ReturnsPage({ token }: { token: string }) {
  const { data, error, loading, reload } = useApi<ProductReturn[]>("/returns", token);
  const [query, setQuery] = useState("");
  const [sale, setSale] = useState<Sale | null>(null);
  const [form, setForm] = useState({ productId: "", reason: "", resultStatus: "AVAILABLE" });

  const lookup = async (event: React.FormEvent) => {
    event.preventDefault();
    const result = await apiRequest<Sale>(`/returns/lookup?${query.startsWith("V-") ? "saleNumber" : "productCode"}=${encodeURIComponent(query)}`, { token });
    setSale(result);
    setForm({ ...form, productId: result.items[0]?.product.id ?? "" });
  };
  const createReturn = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!sale) return;
    await apiRequest("/returns", { token, method: "POST", body: JSON.stringify({ saleId: sale.id, ...form }) });
    setSale(null);
    setQuery("");
    setForm({ productId: "", reason: "", resultStatus: "AVAILABLE" });
    reload();
  };

  return (
    <>
      <PageHeader title="Devoluciones" eyebrow="Siempre desde una venta existente" />
      <section className="twoColumns">
        <form className="formSurface" onSubmit={lookup}>
          <h2>Buscar venta</h2>
          <Field label="Venta o codigo" value={query} onChange={setQuery} required />
          <button type="submit">Buscar</button>
        </form>
        {sale && <form className="formSurface" onSubmit={createReturn}>
          <h2>{sale.saleNumber}</h2>
          <label><span>Producto devuelto</span><select value={form.productId} onChange={(event) => setForm({ ...form, productId: event.target.value })}>{sale.items.map((item) => <option key={item.product.id} value={item.product.id}>{item.product.internalCode} - {money(item.salePrice)}</option>)}</select></label>
          <Field label="Motivo" value={form.reason} onChange={(reason) => setForm({ ...form, reason })} required />
          <SelectInput label="Estado posterior" value={form.resultStatus} options={["AVAILABLE", "MAINTENANCE", "REMOVED"]} labels={{ AVAILABLE: "Disponible", MAINTENANCE: "Mantenimiento", REMOVED: "Retirado" }} onChange={(resultStatus) => setForm({ ...form, resultStatus })} />
          <button type="submit">Registrar devolucion</button>
        </form>}
      </section>
      <StateBox loading={loading} error={error}><ReturnTable rows={data ?? []} /></StateBox>
    </>
  );
}

function AlertsPage({ token }: { token: string }) {
  const today = new Date().toLocaleDateString("en-CA");
  const { data, error, loading } = useApi<ReportSummary>(`/reports/summary?from=${today.slice(0, 8)}01&to=${today}`, token);
  return <><PageHeader title="Alertas" eyebrow="Centro no intrusivo" /><StateBox loading={loading} error={error}><section className="metricGrid">{(data?.alerts ?? []).map((alert) => <Metric key={alert.type} label={alert.label} value={String(alert.count)} />)}</section></StateBox></>;
}

function SettingsPage({ token }: { token: string }) {
  const { data, error, loading, reload } = useApi<Record<string, unknown>>("/settings/system", token);
  const [draft, setDraft] = useState("");
  useEffect(() => { if (data) setDraft(JSON.stringify(data, null, 2)); }, [data]);
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    await apiRequest("/settings/system", { token, method: "PUT", body: JSON.stringify(JSON.parse(draft)) });
    reload();
  };
  return <><PageHeader title="Ajustes" eyebrow="Solo super admin" /><StateBox loading={loading} error={error}><form className="formSurface" onSubmit={save}><label><span>Configuracion global JSON</span><textarea value={draft} onChange={(event) => setDraft(event.target.value)} rows={18} /></label><button type="submit">Guardar configuracion</button></form></StateBox></>;
}

function Profile({ token, user, onSignOut }: { token: string; user: UserSession; onSignOut: () => void }) {
  const [form, setForm] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });
  const [message, setMessage] = useState("");
  const changePassword = async (event: React.FormEvent) => {
    event.preventDefault();
    await apiRequest("/auth/change-password", { token, method: "POST", body: JSON.stringify(form) });
    setForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
    setMessage("Contrasena actualizada.");
  };
  return <><PageHeader title="Perfil" eyebrow="Cuenta" action={<button type="button" onClick={onSignOut}><LogOut size={18} />Cerrar sesion</button>} /><section className="listSurface"><InfoGrid rows={[["Nombre", user.name], ["Usuario", user.username], ["Rol", roleLabels[user.role]]]} /></section><form className="formSurface productForm" onSubmit={changePassword}><Field label="Contrasena actual" value={form.currentPassword} onChange={(currentPassword) => setForm({ ...form, currentPassword })} type="password" required /><Field label="Nueva contrasena" value={form.newPassword} onChange={(newPassword) => setForm({ ...form, newPassword })} type="password" required /><Field label="Confirmar nueva contrasena" value={form.confirmPassword} onChange={(confirmPassword) => setForm({ ...form, confirmPassword })} type="password" required /><button className="wideField" type="submit">Cambiar contrasena</button>{message && <p className="successText wideField">{message}</p>}</form></>;
}

function ScannerPage({ token, user }: { token: string; user: UserSession }) {
  const params = useParams();
  const [manual, setManual] = useState("");
  const [product, setProduct] = useState<Product | null>(null);
  const [error, setError] = useState("");
  const [cameraMessage, setCameraMessage] = useState("Toca Activar camara para escanear QR con el celular.");
  const [cameraActive, setCameraActive] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanFrameRef = useRef<number | null>(null);
  const resolvedRef = useRef(false);

  useEffect(() => {
    if (params.token) resolve(params.token);
  }, [params.token]);

  useEffect(() => () => stopCamera(), []);

  const stopCamera = () => {
    if (scanFrameRef.current) cancelAnimationFrame(scanFrameRef.current);
    scanFrameRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setCameraActive(false);
    setTorchOn(false);
  };

  const startCamera = async () => {
    setError("");
    setCameraMessage("Solicitando permiso de camara...");
    resolvedRef.current = false;
    try {
      const barcodeDetector = createBarcodeDetector();
      if (!barcodeDetector) {
        setCameraMessage("Este navegador no soporta lectura automatica de QR. Usa Ingreso manual.");
        return;
      }
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraMessage("La camara no esta disponible. En red local puede requerir HTTPS o usar localhost.");
        return;
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraActive(true);
      setCameraMessage("Camara activa. Enfoca el QR del producto.");
      scanWithCamera(barcodeDetector);
    } catch (err) {
      setCameraActive(false);
      const blockedByHttp = window.location.protocol !== "https:" && window.location.hostname !== "localhost" && window.location.hostname !== "127.0.0.1";
      setCameraMessage(blockedByHttp ? "Chrome bloqueo la camara por usar HTTP en red local. Para escanear desde celular necesitamos HTTPS o usar ingreso manual." : "No se pudo abrir la camara. Revisa permisos del navegador o usa ingreso manual.");
    }
  };

  const scanWithCamera = (barcodeDetector: { detect: (source: HTMLVideoElement) => Promise<{ rawValue: string }[]> }) => {
    const tick = async () => {
      const video = videoRef.current;
      if (!video || resolvedRef.current) return;
      if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
        try {
          const codes = await barcodeDetector.detect(video);
          const value = codes[0]?.rawValue;
          if (value) {
            resolvedRef.current = true;
            setManual(extractScanValue(value));
            stopCamera();
            await resolve(extractScanValue(value));
            return;
          }
        } catch {
          setCameraMessage("No se pudo leer el QR automaticamente. Intenta acercar el codigo o usa ingreso manual.");
        }
      }
      scanFrameRef.current = requestAnimationFrame(tick);
    };
    scanFrameRef.current = requestAnimationFrame(tick);
  };

  const toggleTorch = async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) {
      setCameraMessage("Primero activa la camara.");
      return;
    }
    try {
      await track.applyConstraints({ advanced: [{ torch: !torchOn } as MediaTrackConstraintSet] });
      setTorchOn((current) => !current);
    } catch {
      setCameraMessage("La linterna no esta disponible en este celular o navegador.");
    }
  };

  const resolve = async (value: string) => {
    setError("");
    setProduct(null);
    try {
      const path = value.includes("/scan/") || /^[0-9a-f-]{36}$/i.test(value) ? `/qr/resolve/${encodeURIComponent(value)}` : `/qr/code/${encodeURIComponent(value)}`;
      setProduct(await apiRequest<Product>(path, { token }));
      if ("vibrate" in navigator) navigator.vibrate?.(60);
    } catch {
      setError("No encontramos este producto.");
    }
  };

  return (
    <>
      <PageHeader title="Escanear producto" eyebrow="QR o codigo manual" />
      <section className="scannerPanel">
        <div className="scanFrame">
          <video ref={videoRef} className={cameraActive ? "scanVideo active" : "scanVideo"} playsInline muted />
          <div className="scanCorners"><ScanLine size={56} /><i /></div>
          <strong>Enfoca el codigo QR del tenis.</strong>
          <span>{cameraMessage}</span>
          <div className="scanActions">
            <button type="button" onClick={cameraActive ? stopCamera : startCamera}>{cameraActive ? "Cerrar camara" : "Activar camara"}</button>
            <button type="button" onClick={toggleTorch}>{torchOn ? "Apagar linterna" : "Linterna"}</button>
            <button type="button" onClick={() => document.getElementById("manual-scan-input")?.focus()}>Ingreso manual</button>
          </div>
        </div>
        <form className="manualScan" onSubmit={(event) => { event.preventDefault(); resolve(manual); }}>
          <input id="manual-scan-input" placeholder="TN-00025 o token QR" value={manual} onChange={(event) => setManual(event.target.value)} />
          <button type="submit">Buscar</button>
        </form>
      </section>
      {error && <section className="emptySurface compactSurface"><p className="errorText">{error}</p><button type="button" onClick={() => setManual("")}>Ingresar codigo</button></section>}
      {product && <ScannedProduct product={product} user={user} />}
    </>
  );
}

function createBarcodeDetector(): { detect: (source: HTMLVideoElement) => Promise<{ rawValue: string }[]> } | null {
  const Detector = (window as unknown as { BarcodeDetector?: new (options: { formats: string[] }) => { detect: (source: HTMLVideoElement) => Promise<{ rawValue: string }[]> } }).BarcodeDetector;
  return Detector ? new Detector({ formats: ["qr_code", "code_128", "ean_13", "ean_8", "upc_a", "upc_e"] }) : null;
}

function extractScanValue(value: string) {
  const trimmed = value.trim();
  const scanMarker = "/scan/";
  if (trimmed.includes(scanMarker)) return trimmed.split(scanMarker).pop() ?? trimmed;
  return trimmed;
}

function ScannedProduct({ product, user }: { product: Product; user: UserSession }) {
  const sold = product.status === "SOLD";
  const reserved = product.status === "RESERVED";
  return (
    <section className="scanResult">
      <Thumb product={product} />
      <div>
        <h2>{product.brand?.name ?? "Sin marca"} {product.model ?? ""}</h2>
        <strong>{product.internalCode}</strong>
        <p>Talla: {product.size ?? "-"}</p>
        <p>Condicion: {product.condition?.name ?? "-"}</p>
        <p className="priceLine">{money(product.salePrice)}</p>
        <StatusPill status={product.status} />
      </div>
      {sold ? <p className="errorText">Producto vendido. No se puede volver a vender.</p> : reserved ? <p className="errorText">Producto reservado. Resuelve la reserva antes de vender.</p> : <NavLink className="buttonLike sellButton" to="/sales/new"><ShoppingCart size={18} />Vender</NavLink>}
    </section>
  );
}

function SalesPage({ token, user }: { token: string; user: UserSession }) {
  const { data, error, loading, reload } = useApi<Sale[]>("/sales?take=80", token);
  const today = new Date().toLocaleDateString("en-CA");
  const todaySales = (data ?? []).filter((sale) => sale.createdAt.slice(0, 10) === today);
  const totalToday = todaySales.reduce((total, sale) => total + Number(sale.total), 0);

  return (
    <>
      <PageHeader title={user.role === "SELLER" ? "Mis ventas" : "Ventas"} eyebrow={user.role === "SELLER" ? `Total hoy ${money(totalToday)}` : "Historial comercial"} action={<NavLink className="buttonLike" to="/sales/new"><ShoppingCart size={18} />Nueva venta</NavLink>} />
      <StateBox loading={loading} error={error}>
        <section className="tableSurface">
          {(data ?? []).length === 0 ? <p>Todavia no hay ventas registradas.</p> : <table><thead><tr><th>Venta</th><th>Fecha</th><th>Vendedor</th><th>Productos</th><th>Total</th><th>Metodo</th><th>Estado</th></tr></thead><tbody>{(data ?? []).map((sale) => <tr key={sale.id}><td data-label="Venta">{sale.saleNumber}</td><td data-label="Fecha">{dateLabel(sale.createdAt)}</td><td data-label="Vendedor">{sale.seller?.username ?? "-"}</td><td data-label="Productos">{sale.items.map((item) => item.product.internalCode).join(", ")}</td><td data-label="Total">{money(sale.total)}</td><td data-label="Metodo">{paymentLabel(sale.paymentMethod)}</td><td data-label="Estado">{sale.status}</td></tr>)}</tbody></table>}
        </section>
        <button type="button" onClick={reload}>Actualizar</button>
      </StateBox>
    </>
  );
}

function NewSale({ token, user }: { token: string; user: UserSession }) {
  const { data: products, reload } = useApi<Product[]>("/products?status=AVAILABLE&take=100", token);
  const [productId, setProductId] = useState("");
  const [cart, setCart] = useState<Product[]>([]);
  const [paymentMethod, setPaymentMethod] = useState("EFECTIVO");
  const [discount, setDiscount] = useState("0");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [sale, setSale] = useState<Sale | null>(null);
  const [saving, setSaving] = useState(false);
  const admin = canAccess(user.role, adminRoles);
  const availableProducts = (products ?? []).filter((product) => !cart.some((item) => item.id === product.id));
  const subtotal = cart.reduce((total, product) => total + Number(product.salePrice ?? 0), 0);
  const total = subtotal - Number(discount || 0);

  const addProduct = () => {
    const product = products?.find((item) => item.id === productId);
    if (!product) return;
    setCart([...cart, product]);
    setProductId("");
  };

  const confirm = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const result = await apiRequest<Sale>("/sales", {
        token,
        method: "POST",
        body: JSON.stringify({
          items: cart.map((product, index) => ({ productId: product.id, discount: admin && index === 0 ? Number(discount || 0) : 0 })),
          paymentMethod,
          idempotencyKey: crypto.randomUUID()
        })
      });
      setSale(result);
      setMessage("Venta registrada.");
      setCart([]);
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No pudimos registrar la venta. No cierres esta pantalla. Reintenta.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <PageHeader title="Nueva venta" eyebrow="Escanear, buscar y confirmar" />
      <section className="saleBuilder">
        <div className="salePicker">
          <NavLink className="buttonLike bigAction" to="/scanner"><ScanLine size={22} />Escanear QR</NavLink>
          <label><span>Buscar producto</span><select value={productId} onChange={(event) => setProductId(event.target.value)}><option value="">Seleccionar disponible</option>{availableProducts.map((item) => <option key={item.id} value={item.id}>{item.internalCode} - {item.brand?.name ?? ""} {item.model ?? ""} - {money(item.salePrice)}</option>)}</select></label>
          <button type="button" onClick={addProduct} disabled={!productId}>Agregar</button>
        </div>
        <form className="cartPanel" onSubmit={confirm}>
          <h2>Venta</h2>
          {cart.length === 0 ? <p>No hay productos en el carrito.</p> : cart.map((product) => <div className="row" key={product.id}><span>{product.internalCode} · {product.brand?.name ?? ""} {product.model ?? ""}</span><strong>{money(product.salePrice)}</strong><button className="smallButton" type="button" onClick={() => setCart(cart.filter((item) => item.id !== product.id))}>Quitar</button></div>)}
          {admin && <Field label="Descuento total" value={discount} onChange={setDiscount} type="number" />}
          {!admin && Number(discount) > 0 && <p className="errorText">Este descuento requiere autorizacion de un administrador.</p>}
          <SelectInput label="Metodo de pago" value={paymentMethod} options={["EFECTIVO", "QR_TRANSFERENCIA", "OTRO"]} labels={{ EFECTIVO: "Efectivo", QR_TRANSFERENCIA: "QR/Transferencia", OTRO: "Otro" }} onChange={setPaymentMethod} />
          <Metric label="Total" value={money(total)} />
          {error && <p className="errorText">{error}</p>}
          {message && <p className="successText">{message}</p>}
          <button type="submit" disabled={cart.length === 0 || saving}><ShoppingCart size={18} />{saving ? "Confirmando..." : "Confirmar venta"}</button>
        </form>
        {sale && <section className="receipt"><h2>Venta registrada</h2><p>RAGUILEX</p><strong>{sale.saleNumber}</strong><p>{dateLabel(sale.createdAt)}</p><p>Vendedor: {sale.seller?.username ?? user.username}</p><p>Total: {money(sale.total)}</p><p>Metodo: {paymentLabel(sale.paymentMethod)}</p></section>}
      </section>
    </>
  );
}

function ReportsPage({ token }: { token: string }) {
  const today = new Date().toLocaleDateString("en-CA");
  const [from, setFrom] = useState(today.slice(0, 8) + "01");
  const [to, setTo] = useState(today);
  const { data, error, loading, reload } = useApi<ReportSummary>(`/reports/summary?from=${from}&to=${to}`, token);

  return (
    <>
      <PageHeader title="Reportes" eyebrow="Ventas, inventario y utilidad" action={<button type="button" onClick={reload}>Actualizar</button>} />
      <section className="dateFilters">
        <Field label="Desde" value={from} onChange={setFrom} type="date" />
        <Field label="Hasta" value={to} onChange={setTo} type="date" />
      </section>
      <StateBox loading={loading} error={error}>
        {data && (
          <>
            <section className="metricGrid">
              <Metric label="Ventas" value={String(data.sales.count ?? 0)} />
              <Metric label="Productos vendidos" value={String(data.sales.products ?? 0)} />
              <Metric label="Ventas totales" value={money(data.sales.total)} />
              <Metric label="Utilidad bruta" value={money(data.sales.grossProfit)} />
              <Metric label="Reservas activas" value={String(data.activeReservations ?? 0)} />
              <Metric label="Devoluciones" value={String(data.returns ?? 0)} />
            </section>
            <section className="metricGrid">
              <Metric label="Disponibles" value={String(data.inventory.available ?? 0)} />
              <Metric label="Vendidos" value={String(data.inventory.sold ?? 0)} />
              <Metric label="Valor costo" value={money(data.inventory.cost)} />
              <Metric label="Margen potencial" value={money(data.inventory.potentialMargin)} />
            </section>
            <section className="twoColumns">
              <RankPanel title="Marcas mas vendidas" rows={data.topBrands} />
              <RankPanel title="Tallas mas vendidas" rows={data.topSizes} />
            </section>
            <section className="twoColumns">
              <RankPanel title="Modelos mas vendidos" rows={data.topModels ?? []} />
              <DataPanel title="Productos +90 dias" products={data.stagnantProducts ?? []} empty="No hay productos estancados." />
            </section>
            <section className="tableSurface">
              <h2>Ventas por vendedor</h2>
              <table><thead><tr><th>Vendedor</th><th>Ventas</th><th>Productos</th><th>Monto</th><th>Ticket promedio</th></tr></thead><tbody>{data.bySeller.map((row) => <tr key={row.seller}><td data-label="Vendedor">{row.seller}</td><td data-label="Ventas">{row.sales}</td><td data-label="Productos">{row.products}</td><td data-label="Monto">{money(row.total)}</td><td data-label="Ticket">{money(row.averageTicket)}</td></tr>)}</tbody></table>
            </section>
          </>
        )}
      </StateBox>
    </>
  );
}

function AuditPage({ token }: { token: string }) {
  const { data, error, loading } = useApi<AuditRow[]>("/audit", token);
  return (
    <>
      <PageHeader title="Auditoria" eyebrow="Acciones criticas" />
      <StateBox loading={loading} error={error}>
        <section className="tableSurface">
          <table><thead><tr><th>Fecha</th><th>Usuario</th><th>Accion</th><th>Entidad</th></tr></thead><tbody>{(data ?? []).map((row) => <tr key={row.id}><td data-label="Fecha">{dateLabel(row.createdAt)}</td><td data-label="Usuario">{row.user?.username ?? "sistema"}</td><td data-label="Accion">{row.action}</td><td data-label="Entidad">{row.entity}</td></tr>)}</tbody></table>
        </section>
      </StateBox>
    </>
  );
}

function RankPanel({ title, rows }: { title: string; rows: { label: string; count: number }[] }) {
  return <section className="listSurface"><h2>{title}</h2>{rows.length === 0 ? <p>Sin ventas en el periodo.</p> : rows.map((row) => <div className="row" key={row.label}><span>{row.label}</span><strong>{row.count}</strong></div>)}</section>;
}

function CashMovements({ movements }: { movements: CashSession["movements"] }) {
  return <section className="tableSurface"><h2>Movimientos de caja</h2>{movements.length === 0 ? <p>No hay ingresos ni egresos registrados.</p> : <table><thead><tr><th>Fecha</th><th>Tipo</th><th>Concepto</th><th>Monto</th><th>Metodo</th><th>Usuario</th></tr></thead><tbody>{movements.map((row) => <tr key={row.id}><td data-label="Fecha">{dateLabel(row.createdAt)}</td><td data-label="Tipo">{row.type === "INCOME" ? "Ingreso" : "Egreso"}</td><td data-label="Concepto">{row.concept}</td><td data-label="Monto">{money(row.amount)}</td><td data-label="Metodo">{paymentLabel(row.method)}</td><td data-label="Usuario">{row.user?.username ?? "-"}</td></tr>)}</tbody></table>}</section>;
}

function ReturnTable({ rows }: { rows: ProductReturn[] }) {
  return <section className="tableSurface">{rows.length === 0 ? <p>No hay devoluciones registradas.</p> : <table><thead><tr><th>Fecha</th><th>Venta</th><th>Producto</th><th>Motivo</th><th>Estado posterior</th><th>Usuario</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td data-label="Fecha">{dateLabel(row.createdAt)}</td><td data-label="Venta">{row.sale.saleNumber}</td><td data-label="Producto">{row.product.internalCode}</td><td data-label="Motivo">{row.reason}</td><td data-label="Estado">{statusLabels[row.resultStatus]}</td><td data-label="Usuario">{row.user?.username ?? "-"}</td></tr>)}</tbody></table>}</section>;
}

function RequireRole({ user, roles, children }: { user: UserSession; roles: RoleCode[]; children: React.ReactNode }) {
  if (!canAccess(user.role, roles)) return <EmptySurface title="Sin permiso" icon={<ShieldCheck />} text="Tu rol no tiene acceso a esta seccion." />;
  return <>{children}</>;
}

function ProductTable({ products }: { products: Product[] }) {
  return <section className="tableSurface">{products.length === 0 ? <p>No encontramos productos. Prueba modificando los filtros.</p> : <table><thead><tr><th>Foto</th><th>Codigo</th><th>Marca / Modelo</th><th>Talla</th><th>Condicion</th><th>Precio</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>{products.map((product) => <tr key={product.id}><td data-label="Foto"><Thumb product={product} /></td><td data-label="Codigo"><strong>{product.internalCode}</strong></td><td data-label="Producto">{product.brand?.name ?? "Sin marca"} {product.model ?? ""}</td><td data-label="Talla">{product.size ?? "-"}</td><td data-label="Condicion">{product.condition?.name ?? "-"}</td><td data-label="Precio">{money(product.salePrice)}</td><td data-label="Estado"><StatusPill status={product.status} /></td><td data-label="Acciones"><NavLink className="smallLink" to={`/products/${product.id}`}>Ver</NavLink></td></tr>)}</tbody></table>}</section>;
}

function MovementTable({ movements }: { movements: Movement[] }) {
  return <section className="tableSurface">{movements.length === 0 ? <p>No hay movimientos registrados todavia.</p> : <table><thead><tr><th>Fecha</th><th>Producto</th><th>Movimiento</th><th>Estado</th><th>Usuario</th></tr></thead><tbody>{movements.map((movement) => <tr key={movement.id}><td data-label="Fecha">{dateLabel(movement.createdAt)}</td><td data-label="Producto">{movement.product?.internalCode ?? "-"} {movement.product?.model ?? ""}</td><td data-label="Movimiento">{movement.movementType}</td><td data-label="Estado">{movement.newStatus ? statusLabels[movement.newStatus] : "-"}</td><td data-label="Usuario">{movement.user?.username ?? "sistema"}</td></tr>)}</tbody></table>}</section>;
}

function UserTable({ users, onToggle }: { users: UserRow[]; onToggle: (user: UserRow) => void }) {
  return <section className="tableSurface"><table><thead><tr><th>Nombre</th><th>Usuario</th><th>Rol</th><th>Estado</th><th>Ultimo acceso</th><th>Acciones</th></tr></thead><tbody>{users.map((user) => <tr key={user.id}><td data-label="Nombre">{user.name}</td><td data-label="Usuario">{user.username}</td><td data-label="Rol">{roleLabels[user.role.code]}</td><td data-label="Estado">{user.active ? "Activo" : "Inactivo"}</td><td data-label="Ultimo acceso">{user.lastLogin ? dateLabel(user.lastLogin) : "-"}</td><td data-label="Acciones"><button className="smallButton" type="button" onClick={() => onToggle(user)}>{user.active ? "Desactivar" : "Activar"}</button></td></tr>)}</tbody></table></section>;
}

function DataPanel({ title, products, empty = "No hay productos registrados." }: { title: string; products: Product[]; empty?: string }) {
  return <section className="listSurface"><h2>{title}</h2>{products.length === 0 ? <p>{empty}</p> : products.map((product) => <div className="row" key={product.id}><span>{product.internalCode} - {product.brand?.name ?? "Sin marca"} {product.model ?? ""}</span><strong>{statusLabels[product.status]}</strong></div>)}</section>;
}

function InfoGrid({ rows }: { rows: [string, React.ReactNode][] }) {
  return <dl className="infoGrid">{rows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value || "-"}</dd></div>)}</dl>;
}

function Thumb({ product }: { product: Product }) {
  const image = product.images?.find((item) => item.isPrimary) ?? product.images?.[0];
  if (image) return <img className="thumb" src={`${API_URL}${image.imageUrl}`} alt="" loading="lazy" />;
  return <div className="thumb placeholder"><Camera size={18} /><span>Sin foto</span></div>;
}

function Field({ label, value, onChange, type = "text", required = false, list }: { label: string; value: string; onChange: (value: string) => void; type?: string; required?: boolean; list?: string }) {
  return <label><span>{label}</span><input value={value} onChange={(event) => onChange(event.target.value)} type={type} required={required} list={list} /></label>;
}

function Select({ label, value, options, onChange }: { label: string; value: string; options: { value: string; label: string }[]; onChange: (value: string) => void }) {
  return <label className="compactSelect"><span>{label}</span><select value={value} onChange={(event) => onChange(event.target.value)}><option value="">Todos</option>{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>;
}

function SelectInput({ label, value, options, labels, onChange }: { label: string; value: string; options: string[]; labels?: Record<string, string>; onChange: (value: string) => void }) {
  return <label><span>{label}</span><select value={value} onChange={(event) => onChange(event.target.value)}>{options.map((option) => <option key={option} value={option}>{labels?.[option] ?? option}</option>)}</select></label>;
}

function PageHeader({ title, eyebrow, action }: { title: string; eyebrow: string; action?: React.ReactNode }) {
  return <header className="pageHeader"><div><span>{eyebrow}</span><h1>{title}</h1></div>{action}</header>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <article className="metric"><span>{label}</span><strong>{value}</strong></article>;
}

function StatusPill({ status }: { status: InventoryStatus }) {
  return <span className={`pill ${status.toLowerCase()}`}>{statusLabels[status]}</span>;
}

function StateBox({ loading, error, children }: { loading?: boolean; error?: string; children: React.ReactNode }) {
  if (loading) return <section className="emptySurface compactSurface"><ScanLine /><p>Cargando datos...</p></section>;
  if (error) return <section className="emptySurface compactSurface"><ShieldCheck /><p className="errorText">{error}</p></section>;
  return <>{children}</>;
}

function EmptySurface({ title, icon, text }: { title: string; icon: React.ReactNode; text: string }) {
  return <><PageHeader title={title} eyebrow="Modulo" /><section className="emptySurface">{icon}<p>{text}</p></section></>;
}

function readStoredUser() {
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as UserSession;
  } catch {
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem(TOKEN_KEY);
    return null;
  }
}

function useApi<T>(path: string, token: string) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setError("");
    apiRequest<T>(path, { token }).then((result) => mounted && setData(result)).catch((err) => mounted && setError(err instanceof Error ? err.message : "No se pudieron cargar los datos.")).finally(() => mounted && setLoading(false));
    return () => { mounted = false; };
  }, [path, token, version]);

  return { data, loading, error, reload: () => setVersion((current) => current + 1) };
}

function useDebouncedValue<T>(value: T, delay: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const handle = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(handle);
  }, [value, delay]);
  return debounced;
}

async function apiRequest<T>(path: string, options: RequestInit & { token?: string } = {}) {
  const headers = new Headers(options.headers);
  if (!(options.body instanceof FormData)) headers.set("Content-Type", "application/json");
  if (options.token) headers.set("Authorization", `Bearer ${options.token}`);
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, { ...options, headers });
  } catch {
    throw new Error("SIN CONEXION: necesitamos conexion para confirmar la operacion.");
  }
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    if (response.status === 401) {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
      if (window.location.pathname !== "/login") window.location.href = "/login";
    }
    throw new Error(payload?.message ?? `La solicitud no pudo completarse. Codigo ${response.status}.`);
  }
  return payload as T;
}

function canAccess(role: RoleCode, roles?: readonly RoleCode[]) {
  return !roles || roles.includes(role);
}

function money(value?: number | string | null) {
  const amount = Number(value ?? 0);
  return new Intl.NumberFormat("es-BO", { style: "currency", currency: "BOB" }).format(amount);
}

function dateLabel(value: string) {
  return new Intl.DateTimeFormat("es-BO", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

function paymentLabel(value?: string | null) {
  return ({ EFECTIVO: "Efectivo", QR_TRANSFERENCIA: "QR/Transferencia", OTRO: "Otro" } as Record<string, string>)[value ?? ""] ?? "-";
}

function marginPercent(cost?: number | string | null, sale?: number | string | null) {
  const costValue = Number(cost ?? 0);
  if (!costValue) return "-";
  return `${Math.round(((Number(sale ?? 0) - costValue) / costValue) * 100)}%`;
}

function payloadFromForm(form: Record<string, string>) {
  return {
    ...form,
    purchaseCost: form.purchaseCost ? Number(form.purchaseCost) : undefined,
    salePrice: form.salePrice ? Number(form.salePrice) : undefined
  };
}

function toQuery(filters: Record<string, string>) {
  return Object.entries(filters).filter(([, value]) => value).map(([key, value]) => `&${key}=${encodeURIComponent(value)}`).join("");
}

function uniqueOptions(values?: (string | null | undefined)[]) {
  return [...new Set((values ?? []).filter(Boolean) as string[])].sort().map((value) => ({ value, label: value }));
}

ReactDOM.createRoot(document.getElementById("root")!).render(<App />);
