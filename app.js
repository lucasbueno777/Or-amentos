/* MAR E LUA — Gerador de orçamentos, sem banco de dados */
const API_BASE_URL = "https://raspy-morning-d914.artigosmarelua.workers.dev";
const DEFAULT_LOGO_URL = new URL("logo-mar-e-lua.png", document.baseURI).href;
const LOGO_STORAGE_KEY = "mar_e_lua_logo_original_v1";
// Se você já adicionou a imagem no GitHub, ela aparece automaticamente.
// Se preferir, selecione uma vez a logo no próprio gerador e ela ficará neste navegador.
function savedLogo() {
  try {
    const value = localStorage.getItem(LOGO_STORAGE_KEY);
    return value?.startsWith("data:image/") ? value : "";
  } catch { return ""; }
}
let activeLogoURL = savedLogo() || DEFAULT_LOGO_URL;
const FRASE = "A força do mar e a sabedoria da lua em harmonia.";

let products = [];
let quote = [];
// A senha permanece apenas na sessão desta aba (resiste a atualizar a página).
// O orçamento fica salvo neste navegador, sem Firebase e sem servidor de dados.
const PASSWORD_SESSION_KEY = "mar_e_lua_senha_sessao_v1";
const DRAFT_STORAGE_KEY = "mar_e_lua_rascunho_v1";
const HISTORY_STORAGE_KEY = "mar_e_lua_historico_v1";
let accessPassword = getSessionPassword();

const searchInput = document.getElementById("productSearch");
const searchButton = document.getElementById("searchButton");
const productResults = document.getElementById("productResults");
const productToast = document.getElementById("productToast");
let productToastTimer;

function showProductToast(name, quantity = 1) {
  clearTimeout(productToastTimer);
  productToast.textContent = `✓ ${quantity > 1 ? `${quantity} unidades de “${name}” adicionadas` : `Produto “${name}” adicionado`} ao orçamento!`;
  productToast.classList.add("is-visible");
  productToastTimer = setTimeout(() => {
    productToast.classList.remove("is-visible");
  }, 3500);
}

const quoteItems = document.getElementById("quoteItems");
const customerInput = document.getElementById("customerName");
const generatePDFButton = document.getElementById("generatePDF");

// Armazenamento local: não envia o rascunho nem a senha para o GitHub.
function getSessionPassword() {
  try { return sessionStorage.getItem(PASSWORD_SESSION_KEY) || ""; }
  catch { return ""; }
}

function setSessionPassword(password) {
  accessPassword = password;
  try {
    if (password) sessionStorage.setItem(PASSWORD_SESSION_KEY, password);
    else sessionStorage.removeItem(PASSWORD_SESSION_KEY);
  } catch { /* O navegador pode bloquear o armazenamento. */ }
}

function saveDraft() {
  const draft = {
    version: 2,
    customerName: customerInput.value,
    items: quote,
    savedAt: new Date().toISOString()
  };
  try { localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft)); }
  catch {
    if (!document.getElementById("draftStorageWarning")) {
      const warning = document.createElement("p");
      warning.id = "draftStorageWarning";
      warning.className = "privacy-note";
      warning.textContent = "Este navegador está bloqueando o salvamento automático. Evite atualizar antes de gerar o PDF.";
      quoteItems.after(warning);
    }
  }
}

function restoreDraft() {
  try {
    const raw = localStorage.getItem(DRAFT_STORAGE_KEY);
    if (!raw) return;
    const draft = JSON.parse(raw);
    if (!draft || ![1, 2].includes(draft.version) || !Array.isArray(draft.items)) return;
    quote = draft.items.slice(0, 200).filter(item =>
      item && typeof item.key === "string" &&
      typeof item.name === "string" &&
      Number.isFinite(Number(item.price)) && Number(item.price) >= 0 &&
      Number.isInteger(Number(item.quantity)) && Number(item.quantity) > 0
    ).map(item => ({
      key: String(item.key).slice(0, 200),
      productId: item.productId ?? null,
      variantId: item.variantId ?? null,
      name: String(item.name).slice(0, 300),
      variantName: String(item.variantName || "").slice(0, 180),
      image: safeImage(item.image),
      price: Number(item.price),
      stock: getStock(item.stock),
      quantity: Number(item.quantity),
      discountType: ["percent", "amount"].includes(item.discountType) ? item.discountType : "none",
      discountValue: Math.max(0, Number(item.discountValue) || 0)
    }));
    customerInput.value = String(draft.customerName || "").slice(0, 120);

    if (quote.length) {
      const notice = document.createElement("p");
      notice.className = "privacy-note";
      notice.textContent = "Rascunho recuperado automaticamente. Antes de enviar, confira os preços e o estoque: eles podem ter mudado na Nuvemshop.";
      quoteItems.after(notice);
    }
  } catch {
    // Se houver dados antigos inválidos, o formulário continua utilizável.
  }
}

function money(value) {
  return Number(value || 0).toLocaleString("pt-BR", {
    style: "currency", currency: "BRL"
  });
}

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[c]);
}

function safeImage(value) {
  if (typeof value === "string" && /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(value)) return value;
  try {
    const u = new URL(value, document.baseURI);
    return (u.protocol === "https:" || u.protocol === "http:") ? u.href : "";
  } catch { return ""; }
}

function getStock(value) {
  if (value === null || value === undefined || value === "") return null;
  const stock = Number(value);
  return Number.isFinite(stock) ? Math.max(0, Math.floor(stock)) : null;
}

function stockLabel(value) {
  const stock = getStock(value);
  return stock === null ? "Estoque não informado" : `Estoque disponível: ${stock}`;
}

function showMessage(container, message) {
  const p = document.createElement("p");
  p.className = "empty-message";
  p.textContent = message;
  container.replaceChildren(p);
}

// Mostra a logo no cabeçalho e no rodapé. Usa arquivo do GitHub ou o logo escolhido.
function refreshLogo() {
  document.querySelectorAll(".brand-logo").forEach(img => {
    img.style.display = "";
    img.src = activeLogoURL;
  });
}
document.querySelectorAll(".brand-logo").forEach(img => {
  img.addEventListener("error", () => { img.style.display = "none"; });
});
const logoUpload = document.getElementById("logoUpload");
const logoStatus = document.getElementById("logoStatus");
logoUpload.addEventListener("change", async () => {
  const file = logoUpload.files?.[0];
  if (!file) return;
  if (!/^image\/(png|jpeg|webp)$/.test(file.type)) {
    logoStatus.textContent = "Escolha uma imagem PNG, JPG ou WebP.";
    return;
  }
  if (file.size > 6 * 1024 * 1024) {
    logoStatus.textContent = "Escolha uma imagem com até 6 MB.";
    return;
  }
  try {
    const temporaryUrl = URL.createObjectURL(file);
    const img = new Image();
    try {
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
        img.src = temporaryUrl;
      });
    } finally {
      URL.revokeObjectURL(temporaryUrl);
    }
    const scale = Math.min(1, 800 / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
    // PNG mantém transparência e desenhos delicados da marca.
    const data = canvas.toDataURL("image/png");
    try {
      localStorage.setItem(LOGO_STORAGE_KEY, data);
    } catch {
      logoStatus.textContent = "Não coube no armazenamento do navegador. Envie a imagem logo-mar-e-lua.png ao GitHub para usá-la permanentemente.";
      return;
    }
    activeLogoURL = data;
    refreshLogo();
    invalidatePreparedPDF();
    logoStatus.textContent = "Logo salva neste navegador! Ela também entrará no PDF.";
  } catch {
    logoStatus.textContent = "Não foi possível abrir a imagem escolhida.";
  }
});
refreshLogo();

async function searchProducts() {
  const term = searchInput.value.trim();
  if (!term) {
    showMessage(productResults, "Digite o nome de um produto.");
    return;
  }

  // A senha é lembrada apenas nesta aba/sessão, inclusive após atualizar.
  if (!accessPassword) {
    const password = prompt("Digite a senha do Orçamento Mar e Lua:");
    if (!password || !password.trim()) return;
    setSessionPassword(password);
  }

  searchButton.disabled = true;
  searchButton.textContent = "Buscando...";
  showMessage(productResults, "Consultando produtos da Mar e Lua...");

  try {
    const url = `${API_BASE_URL}/products?search=${encodeURIComponent(term)}`;
    const response = await fetch(url, {
      method: "GET",
      headers: { "X-Quote-Key": accessPassword },
      cache: "no-store"
    });

    if (response.status === 401) {
      setSessionPassword("");
      throw new Error("Senha incorreta. Clique em Buscar novamente para digitá-la.");
    }
    if (response.status === 503) {
      throw new Error("Há uma configuração pendente no Cloudflare.");
    }
    if (!response.ok) {
      throw new Error(`Não foi possível consultar a Nuvemshop (erro ${response.status}).`);
    }

    const data = await response.json();
    products = Array.isArray(data) ? data : (data.products || []);
    renderProducts();
  } catch (error) {
    showMessage(productResults, error.message || "Não foi possível pesquisar os produtos.");
  } finally {
    searchButton.disabled = false;
    searchButton.textContent = "Buscar";
  }
}

function renderProducts() {
  productResults.replaceChildren();
  if (!products.length) {
    showMessage(productResults, "Nenhum produto encontrado.");
    return;
  }

  products.forEach(product => {
    const card = document.createElement("div");
    card.className = "product-card";
    const name = product.name || product.title || "Produto";
    const image = safeImage(product.image);
    const variants = Array.isArray(product.variants) ? product.variants : [];
    const options = variants.map((v, i) => `
      <option value="${i}">
        ${escapeHTML(v.name || "Padrão")} — ${money(v.price)} — ${escapeHTML(stockLabel(v.stock))}
      </option>
    `).join("");

    card.innerHTML = `
      <div class="product-card-info">
        ${image ? `<img class="product-thumb" src="${escapeHTML(image)}" alt="${escapeHTML(name)}">` : ""}
        <div class="product-details">
          <strong>${escapeHTML(name)}</strong>
          <p>${money(product.price)}</p>
          ${variants.length ? "" : `<small>${escapeHTML(stockLabel(product.stock))}</small>`}
        </div>
      </div>
      ${variants.length ? `<select class="variant-select" aria-label="Escolher variação">${options}</select>` : ""}
      <button class="add-product" type="button">Adicionar ao orçamento</button>
    `;

    card.querySelector(".add-product").addEventListener("click", () => {
      const select = card.querySelector(".variant-select");
      addProduct(product, select ? variants[Number(select.value)] : null);
    });
    productResults.appendChild(card);
  });
}

function addProduct(product, variant) {
  const stock = getStock(variant ? variant.stock : product.stock);
  const price = Number(variant ? (variant.price ?? product.price) : product.price);
  if (!Number.isFinite(price) || price < 0) {
    alert("O preço deste produto está inválido.");
    return;
  }

  const variantId = variant ? variant.id : "default";
  const key = `${product.id}-${variantId}`;
  const current = quote.find(item => item.key === key);
  if (current) {
    current.stock = stock;
    current.price = price;
    current.quantity++;
  } else {
    quote.push({
      key,
      productId: product.id,
      variantId,
      name: product.name || product.title || "Produto",
      variantName: variant ? (variant.name || "") : "",
      image: safeImage(variant?.image || product.image),
      price, stock, quantity: 1,
      discountType: "none", discountValue: 0
    });
  }
  renderQuote();
  markQuoteChanged();
  invalidatePreparedPDF();
  // Após adicionar pela Nuvemshop, limpa a pesquisa e esconde os resultados.
  searchInput.value = "";
  products = [];
  showMessage(productResults, "Pesquise um produto para consultar preço e estoque.");
  const productName = product.name || product.title || "Produto";
  showProductToast(variant?.name ? `${productName} — ${variant.name}` : productName);
}

function changeQuantity(key, delta) {
  const item = quote.find(p => p.key === key);
  if (!item) return;
  const next = item.quantity + delta;
  if (next < 1) {
    removeProduct(key);
    return;
  }
  item.quantity = next;
  renderQuote();
  markQuoteChanged();
  invalidatePreparedPDF();
}

function removeProduct(key) {
  quote = quote.filter(p => p.key !== key);
  renderQuote();
  markQuoteChanged();
  invalidatePreparedPDF();
}

// DESCONTO É SEMPRE POR UNIDADE E POR PRODUTO.
// O valor em reais desconta cada unidade; a porcentagem também.
function calcItem(item) {
  const originalUnitCents = Math.max(0, Math.round(Number(item.price || 0) * 100));
  const qty = Math.max(1, Math.floor(Number(item.quantity) || 1));
  const mode = ["amount", "percent"].includes(item.discountType) ? item.discountType : "none";
  const input = Math.max(0, Number(item.discountValue) || 0);
  let discountUnitCents = 0;
  if (mode === "percent") {
    discountUnitCents = Math.round(originalUnitCents * Math.min(input, 100) / 100);
  } else if (mode === "amount") {
    discountUnitCents = Math.round(input * 100);
  }
  discountUnitCents = Math.min(originalUnitCents, Math.max(0, discountUnitCents));
  const effectiveUnitCents = originalUnitCents - discountUnitCents;
  const discountLabel = !discountUnitCents ? "" : (mode === "percent"
    ? `${Number(Math.min(input, 100).toFixed(2)).toLocaleString("pt-BR")}%`
    : money(discountUnitCents / 100));
  return {
    mode, qty,
    originalUnit: originalUnitCents / 100,
    discountUnit: discountUnitCents / 100,
    effectiveUnit: effectiveUnitCents / 100,
    originalLine: originalUnitCents * qty / 100,
    discountLine: discountUnitCents * qty / 100,
    total: effectiveUnitCents * qty / 100,
    discountLabel,
    hasDiscount: discountUnitCents > 0
  };
}

function getTotals() {
  const cents = quote.reduce((acc, item) => {
    const amounts = calcItem(item);
    acc.subtotal += Math.round(amounts.originalLine * 100);
    acc.discount += Math.round(amounts.discountLine * 100);
    acc.total += Math.round(amounts.total * 100);
    return acc;
  }, { subtotal: 0, discount: 0, total: 0 });
  return {
    subtotal: cents.subtotal / 100,
    discount: cents.discount / 100,
    total: cents.total / 100
  };
}

function updateItemDiscount(key, field, value) {
  const item = quote.find(p => p.key === key);
  if (!item) return;
  if (field === "discountType") {
    item.discountType = ["none", "amount", "percent"].includes(value) ? value : "none";
    if (item.discountType === "none") item.discountValue = 0;
  } else if (field === "discountValue") {
    const n = Number(value);
    item.discountValue = Number.isFinite(n) ? Math.max(0, n) : 0;
    if (item.discountType === "percent") item.discountValue = Math.min(item.discountValue, 100);
    if (item.discountType === "amount") item.discountValue = Math.min(item.discountValue, Math.max(0, Number(item.price) || 0));
  }
  // Não reconstruímos o cartão ao digitar: isso mantém o foco no campo.
  refreshDiscountFields();
  updateTotals();
  saveDraft();
  markQuoteChanged();
  invalidatePreparedPDF();
}

function renderQuote() {
  quoteItems.replaceChildren();
  if (!quote.length) {
    showMessage(quoteItems, "Nenhum produto adicionado.");
  } else {
    quote.forEach(item => {
      const line = document.createElement("article");
      line.className = "quote-item";
      line.dataset.key = item.key;
      const calc = calcItem(item);
      line.innerHTML = `
        <div class="quote-item-info">
          <strong>${escapeHTML(item.name)}</strong>
          ${item.variantName ? `<p>${escapeHTML(item.variantName)}</p>` : ""}
          <small>${escapeHTML(stockLabel(item.stock))}</small>
          <p class="product-note">Preço cheio: ${money(item.price)} por unidade</p>
        </div>
        <div class="quote-controls">
          <div class="quantity-controls">
            <button type="button" class="minus" aria-label="Diminuir quantidade">−</button>
            <strong>${item.quantity}</strong>
            <button type="button" class="plus" aria-label="Aumentar quantidade">+</button>
          </div>
          <button type="button" class="remove">Excluir</button>
        </div>
        <div class="item-discount">
          <label>Desconto deste produto (por unidade)</label>
          <div class="discount-controls">
            <select class="item-discount-type" aria-label="Tipo de desconto do produto">
              <option value="none" ${item.discountType === "none" ? "selected" : ""}>Sem desconto</option>
              <option value="percent" ${item.discountType === "percent" ? "selected" : ""}>Porcentagem (%)</option>
              <option value="amount" ${item.discountType === "amount" ? "selected" : ""}>Valor em reais (R$)</option>
            </select>
            <input class="item-discount-value" type="number" inputmode="decimal" min="0"
              max="${item.discountType === "percent" ? 100 : Number(item.price || 0)}"
              step="0.01" value="${item.discountValue || 0}"
              aria-label="Valor do desconto por unidade" ${item.discountType === "none" ? "disabled" : ""}>
          </div>
          <div class="discount-preview" aria-live="polite">
            <div class="price-details">
              ${calc.hasDiscount ? `
                <span>Preço original: ${money(item.price)}</span>
                <span class="saved">Desconto: ${escapeHTML(calc.discountLabel)} por unidade</span>
                <strong>Preço com desconto: ${money(calc.effectiveUnit)}</strong>
              ` : `<strong>Preço unitário: ${money(item.price)}</strong>`}
            </div>
            <div class="line-total"><small>Total deste produto</small>${money(calc.total)}</div>
          </div>
        </div>
      `;
      line.querySelector(".minus").onclick = () => changeQuantity(item.key, -1);
      line.querySelector(".plus").onclick = () => changeQuantity(item.key, 1);
      line.querySelector(".remove").onclick = () => removeProduct(item.key);
      line.querySelector(".item-discount-type").addEventListener("change", ev => {
        updateItemDiscount(item.key, "discountType", ev.target.value);
        renderQuote();
        invalidatePreparedPDF();
      });
      line.querySelector(".item-discount-value").addEventListener("input", ev =>
        updateItemDiscount(item.key, "discountValue", ev.target.value)
      );
      quoteItems.appendChild(line);
    });
  }
  updateTotals();
  saveDraft();
}

function refreshDiscountFields() {
  for (const item of quote) {
    const article = [...quoteItems.querySelectorAll(".quote-item")].find(el => el.dataset.key === item.key);
    if (!article) continue;
    const calc = calcItem(item);
    const preview = article.querySelector(".discount-preview");
    if (preview) preview.innerHTML = `
      <div class="price-details">
        ${calc.hasDiscount ? `
          <span>Preço original: ${money(item.price)}</span>
          <span class="saved">Desconto: ${escapeHTML(calc.discountLabel)} por unidade</span>
          <strong>Preço com desconto: ${money(calc.effectiveUnit)}</strong>
        ` : `<strong>Preço unitário: ${money(item.price)}</strong>`}
      </div>
      <div class="line-total"><small>Total deste produto</small>${money(calc.total)}</div>`;
    const input = article.querySelector(".item-discount-value");
    if (input && item.discountType === "percent") input.max = "100";
    else if (input) input.max = String(item.price);
  }
}

function updateTotals() {
  const totals = getTotals();
  document.getElementById("subtotal").textContent = money(totals.subtotal);
  document.getElementById("discountValue").textContent = money(totals.discount);
  document.getElementById("grandTotal").textContent = money(totals.total);
}

// ==========================================
// PDF REAL: gera arquivo .pdf sem abrir página de impressão
// Mantém imagens, identidade azul/dourado e não exibe estoque.
// Não depende de bibliotecas ou serviços externos para gerar o arquivo.
// ==========================================

const sharePDFButton = document.getElementById("sharePDF");
const pdfStatus = document.getElementById("pdfStatus");
let lastPdfFile = null;

function setPdfStatus(message) {
  pdfStatus.textContent = message;
}

function invalidatePreparedPDF() {
  lastPdfFile = null;
  sharePDFButton.hidden = true;
}

function latin1PdfHex(text) {
  // O PDF usa WinAnsiEncoding. Mantém acentos portugueses.
  const winAnsi = {
    0x20ac: 128, 0x201a: 130, 0x0192: 131, 0x201e: 132,
    0x2026: 133, 0x2020: 134, 0x2021: 135, 0x02c6: 136,
    0x2030: 137, 0x0160: 138, 0x2039: 139, 0x0152: 140,
    0x017d: 142, 0x2018: 145, 0x2019: 146, 0x201c: 147,
    0x201d: 148, 0x2022: 149, 0x2013: 150, 0x2014: 151,
    0x02dc: 152, 0x2122: 153, 0x0161: 154, 0x203a: 155,
    0x0153: 156, 0x017e: 158, 0x0178: 159
  };
  let hex = "";
  for (const letter of String(text ?? "")) {
    const cp = letter.codePointAt(0);
    let code = cp <= 255 ? cp : (winAnsi[cp] ?? null);
    if (code === null) {
      const basic = letter.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      code = basic.length === 1 && basic.charCodeAt(0) <= 255
        ? basic.charCodeAt(0) : 63;
    }
    hex += code.toString(16).padStart(2, "0");
  }
  return `<${hex}>`;
}

function pdfTextWidth(value, fontSize, bold = false) {
  const canvas = pdfTextWidth.canvas || (pdfTextWidth.canvas = document.createElement("canvas"));
  const ctx = canvas.getContext("2d");
  ctx.font = `${bold ? "bold " : ""}${fontSize}px Arial`;
  return ctx.measureText(String(value)).width;
}

function wrapPdfText(value, maxWidth, size, bold = false, maxLines = 3) {
  const words = String(value || "").trim().split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (pdfTextWidth(candidate, size, bold) <= maxWidth) {
      line = candidate;
    } else {
      if (line) lines.push(line);
      line = word;
      while (pdfTextWidth(line, size, bold) > maxWidth && line.length > 1) {
        const cut = Math.max(1, line.length - 1);
        const head = line.slice(0, cut);
        if (pdfTextWidth(head, size, bold) <= maxWidth) {
          lines.push(head);
          line = line.slice(cut);
        } else {
          line = head;
        }
      }
    }
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    const limited = lines.slice(0, maxLines);
    let last = limited[maxLines - 1];
    while (last.length && pdfTextWidth(`${last}…`, size, bold) > maxWidth) {
      last = last.slice(0, -1);
    }
    limited[maxLines - 1] = `${last}…`;
    return limited;
  }
  return lines;
}

function loadPdfImage(src, maxDimension = 360) {
  return new Promise(resolve => {
    if (!src) { resolve(null); return; }
    const image = new Image();
    let completed = false;
    const finish = value => {
      if (completed) return;
      completed = true;
      clearTimeout(timeout);
      resolve(value);
    };
    const timeout = setTimeout(() => finish(null), 7000);
    image.crossOrigin = "anonymous";
    image.onload = () => {
      try {
        const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight));
        const width = Math.max(1, Math.round(image.naturalWidth * scale));
        const height = Math.max(1, Math.round(image.naturalHeight * scale));
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d", { willReadFrequently: false });
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, width, height);
        context.drawImage(image, 0, 0, width, height);
        const base64 = canvas.toDataURL("image/jpeg", 0.84).split(",")[1];
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        finish({ bytes, width, height });
      } catch {
        // Algumas CDNs bloqueiam a leitura de imagens por CORS.
        finish(null);
      }
    };
    image.onerror = () => finish(null);
    image.src = src;
  });
}

function pdfColor(hex) {
  const value = hex.replace("#", "");
  return [0, 2, 4].map(i => (parseInt(value.slice(i, i + 2), 16) / 255).toFixed(3)).join(" ");
}

function makeQuotationPDF(items, customer, totals, imageMap) {
  const W = 595.28;
  const H = 841.89;
  const NAVY = "#153b61";
  const GOLD = "#bf9a55";
  const TEXT = "#203247";
  const MUTED = "#637789";
  const PALE = "#eaf3fa";
  const BORDER = "#dce6ed";
  const pages = [];
  let page = null;
  const today = new Date().toLocaleDateString("pt-BR");

  const command = cmd => page.lines.push(cmd);
  const rectangle = (x, y, w, h, fill) => {
    command(`${pdfColor(fill)} rg ${x.toFixed(2)} ${(H-y-h).toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re f`);
  };
  const line = (x1, y1, x2, y2, stroke, width = 1) => {
    command(`${pdfColor(stroke)} RG ${width.toFixed(2)} w ${x1.toFixed(2)} ${(H-y1).toFixed(2)} m ${x2.toFixed(2)} ${(H-y2).toFixed(2)} l S`);
  };
  const text = (value, x, y, size, color = TEXT, bold = false, align = "left") => {
    if (!value && value !== 0) return;
    const valueText = String(value);
    let startX = x;
    if (align !== "left") {
      const textWidth = pdfTextWidth(valueText, size, bold);
      startX -= align === "right" ? textWidth : textWidth / 2;
    }
    command(`BT ${pdfColor(color)} rg /${bold ? "F2" : "F1"} ${size} Tf 1 0 0 1 ${startX.toFixed(2)} ${(H-y).toFixed(2)} Tm ${latin1PdfHex(valueText)} Tj ET`);
  };
  const drawImage = (src, x, y, boxWidth, boxHeight) => {
    const image = imageMap.get(src);
    if (!image || !image.name) return false;
    const scale = Math.min(boxWidth / image.width, boxHeight / image.height);
    const w = image.width * scale;
    const h = image.height * scale;
    const ix = x + (boxWidth - w) / 2;
    const iy = y + (boxHeight - h) / 2;
    command(`q ${w.toFixed(2)} 0 0 ${h.toFixed(2)} ${ix.toFixed(2)} ${(H-iy-h).toFixed(2)} cm /${image.name} Do Q`);
    return true;
  };

  const startPage = () => {
    page = { lines: [], y: 190 };
    pages.push(page);
    rectangle(0, 0, W, 9, NAVY);
    if (!drawImage(activeLogoURL, 41, 27, 67, 67)) {
      rectangle(41, 31, 64, 57, PALE);
      text("MAR", 73, 54, 12, NAVY, true, "center");
      text("E LUA", 73, 70, 10, NAVY, true, "center");
    }
    text("MAR E LUA", 122, 60, 22, NAVY, true);
    text(FRASE, 122, 78, 9.4, GOLD);
    line(41, 106, 554, 106, GOLD, 2.4);
    text("ORÇAMENTO", 41, 135, 16, NAVY, true);
    text(`Data: ${today}`, 554, 134, 10, MUTED, false, "right");
    if (customer) {
      const nameLines = wrapPdfText(`Cliente: ${customer}`, 505, 10.5, false, 2);
      nameLines.forEach((name, index) => text(name, 42, 153 + index * 13, 10.5, TEXT));
    }
    rectangle(41, 179, 513, 24, PALE);
    text("FOTO", 49, 195, 8.5, NAVY, true);
    text("PRODUTO", 123, 195, 8.5, NAVY, true);
    text("QTD.", 359, 195, 8.5, NAVY, true, "right");
    text("UNITÁRIO", 461, 195, 8.5, NAVY, true, "right");
    text("SUBTOTAL", 547, 195, 8.5, NAVY, true, "right");
    page.y = 207;
  };

  startPage();
  let missingImages = 0;
  for (const item of items) {
    const nameLines = wrapPdfText(item.name, 210, 10.1, true, 3);
    const variantLines = item.variantName
      ? wrapPdfText(item.variantName, 210, 9.1, false, 2) : [];
    const calc = calcItem(item);
    const rowHeight = Math.max(calc.hasDiscount ? 100 : 78,
      25 + nameLines.length * 13 + variantLines.length * 12 + (calc.hasDiscount ? 23 : 0));
    if (page.y + rowHeight > 728) startPage();
    const y = page.y;
    if (!drawImage(item.image, 46, y + 7, 66, 65)) {
      rectangle(46, y + 7, 66, 65, PALE);
      text("Sem foto", 79, y + 41, 8, MUTED, false, "center");
      if (item.image) missingImages++;
    }
    nameLines.forEach((name, i) => text(name, 123, y + 20 + i * 13, 10.1, NAVY, true));
    const variantY = y + 20 + nameLines.length * 13 + 3;
    variantLines.forEach((variant, i) => text(variant, 123, variantY + i * 12, 9.1, MUTED));
    if (calc.hasDiscount) {
      const labelY = Math.max(y + 60, variantY + variantLines.length * 12 + 7);
      text(`Desconto: ${calc.discountLabel} por unidade`, 123, labelY, 9.3, GOLD, true);
    }
    text(item.quantity, 355, y + 34, 10.5, TEXT, false, "right");
    // Sempre mostra o preço cheio. Só acrescenta % e novo valor quando há desconto.
    text(money(calc.originalUnit), 465, y + 23, 10, TEXT, false, "right");
    if (calc.hasDiscount) {
      text(`-${calc.discountLabel}`, 465, y + 45, 9.2, GOLD, true, "right");
      text(money(calc.effectiveUnit), 465, y + 65, 10.4, NAVY, true, "right");
    }
    text(money(calc.total), 547, y + 39, 10.2, NAVY, true, "right");
    line(41, y + rowHeight, 554, y + rowHeight, BORDER, 0.7);
    page.y += rowHeight;
  }

  if (page.y + 114 > 733) startPage();
  const totalY = page.y + 14;
  rectangle(301, totalY, 253, 100, PALE);
  text("Subtotal", 315, totalY + 22, 10.7, TEXT);
  text(money(totals.subtotal), 541, totalY + 22, 10.7, TEXT, false, "right");
  text("Descontos dos produtos", 315, totalY + 41, 9.6, TEXT);
  text(money(totals.discount), 541, totalY + 41, 10.7, TEXT, false, "right");
  line(315, totalY + 53, 541, totalY + 53, GOLD, 1.3);
  text("TOTAL", 315, totalY + 78, 12.5, NAVY, true);
  text(money(totals.total), 541, totalY + 79, 15, NAVY, true, "right");

  pages.forEach((part, index) => {
    page = part;
    line(41, 758, 554, 758, GOLD, 1.3);
    drawImage(activeLogoURL, 41, 769, 37, 37);
    text("MAR E LUA", 85, 781, 10.5, NAVY, true);
    text(FRASE, 85, 796, 9, GOLD);
    text("artigosmarelua.com.br", 85, 809, 8.7, MUTED);
    text(`Página ${index + 1} de ${pages.length}`, 551, 802, 8.7, MUTED, false, "right");
  });

  // Montagem da estrutura PDF (objetos, imagens JPEG, referências e xref).
  const encoder = new TextEncoder();
  const ascii = value => encoder.encode(value);
  const objects = [null];
  const reserve = () => { objects.push(null); return objects.length - 1; };
  const put = (id, value) => { objects[id] = value; };
  const catId = reserve();
  const rootPagesId = reserve();
  const fontId = reserve();
  const boldFontId = reserve();
  put(fontId, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
  put(boldFontId, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");

  const xobjects = [];
  for (const [, image] of imageMap.entries()) {
    if (!image?.name) continue;
    const imageId = reserve();
    image.objectId = imageId;
    put(imageId, {
      dictionary: `<< /Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${image.bytes.length} >>`,
      stream: image.bytes
    });
    xobjects.push(`/${image.name} ${imageId} 0 R`);
  }

  const pageIds = [];
  for (const part of pages) {
    const contentId = reserve();
    const pageId = reserve();
    const contentBytes = ascii(part.lines.join("\n") + "\n");
    put(contentId, { dictionary: `<< /Length ${contentBytes.length} >>`, stream: contentBytes });
    put(pageId, `<< /Type /Page /Parent ${rootPagesId} 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << /F1 ${fontId} 0 R /F2 ${boldFontId} 0 R >> /XObject << ${xobjects.join(" ")} >> >> /Contents ${contentId} 0 R >>`);
    pageIds.push(pageId);
  }
  put(rootPagesId, `<< /Type /Pages /Kids [${pageIds.map(id => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`);
  put(catId, `<< /Type /Catalog /Pages ${rootPagesId} 0 R >>`);

  const parts = [];
  let offset = 0;
  const add = bytes => { parts.push(bytes); offset += bytes.length; };
  add(new Uint8Array([37, 80, 68, 70, 45, 49, 46, 52, 10, 37, 226, 227, 207, 211, 10]));
  const offsets = [0];
  for (let id = 1; id < objects.length; id++) {
    offsets[id] = offset;
    add(ascii(`${id} 0 obj\n`));
    const body = objects[id];
    if (typeof body === "string") {
      add(ascii(body + "\n"));
    } else {
      add(ascii(body.dictionary + "\nstream\n"));
      add(body.stream);
      add(ascii("\nendstream\n"));
    }
    add(ascii("endobj\n"));
  }
  const xrefStart = offset;
  add(ascii(`xref\n0 ${objects.length}\n0000000000 65535 f \n`));
  for (let id = 1; id < objects.length; id++) {
    add(ascii(`${String(offsets[id]).padStart(10, "0")} 00000 n \n`));
  }
  add(ascii(`trailer\n<< /Size ${objects.length} /Root ${catId} 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`));
  return { blob: new Blob(parts, { type: "application/pdf" }), missingImages, pageCount: pages.length };
}

async function generatePDF() {
  if (!quote.length) {
    alert("Adicione pelo menos um produto ao orçamento.");
    return;
  }
  generatePDFButton.disabled = true;
  generatePDFButton.textContent = "Preparando PDF...";
  invalidatePreparedPDF();
  setPdfStatus("Preparando as fotos dos produtos...");
  try {
    const imageUrls = [...new Set([activeLogoURL, ...quote.map(item => safeImage(item.image))].filter(Boolean))];
    const images = await Promise.all(imageUrls.map(url => loadPdfImage(url, url === activeLogoURL ? 300 : 420)));
    const imageMap = new Map();
    imageUrls.forEach((url, index) => {
      if (images[index]) imageMap.set(url, { ...images[index], name: `Im${index + 1}` });
    });

    const { blob, missingImages, pageCount } = makeQuotationPDF(
      quote, customerInput.value.trim(), getTotals(), imageMap
    );
    if (blob.size < 300) throw new Error("O arquivo PDF ficou incompleto.");

    const date = new Date();
    const stamp = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    const name = `Orcamento-Mar-e-Lua-${stamp}.pdf`;
    lastPdfFile = new File([blob], name, { type: "application/pdf" });

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);

    const canShareFile = !!navigator.share &&
      !!navigator.canShare && navigator.canShare({ files: [lastPdfFile] });
    sharePDFButton.hidden = !canShareFile;
    if (missingImages) {
      setPdfStatus(`PDF baixado (${pageCount} página(s)). Atenção: ${missingImages} foto(s) não puderam ser incluídas por bloqueio de acesso às imagens. Me avise se isso acontecer.`);
    } else {
      setPdfStatus(canShareFile
        ? "PDF baixado! Para enviar no WhatsApp, toque em Compartilhar PDF."
        : "PDF baixado! Abra o arquivo em Downloads e envie pelo WhatsApp.");
    }
  } catch (error) {
    setPdfStatus("Não foi possível gerar o PDF: " + (error.message || "erro desconhecido"));
  } finally {
    generatePDFButton.disabled = false;
    generatePDFButton.textContent = "Baixar orçamento em PDF";
  }
}

async function sharePDF() {
  if (!lastPdfFile || !navigator.share) return;
  try {
    await navigator.share({
      files: [lastPdfFile],
      title: "Orçamento Mar e Lua",
      text: "Segue o orçamento da Mar e Lua em PDF."
    });
  } catch (error) {
    if (error.name !== "AbortError") {
      setPdfStatus("Não foi possível compartilhar diretamente. O PDF já está em Downloads para você enviar pelo WhatsApp.");
    }
  }
}


// ==========================================
// PRODUTOS MANUAIS E HISTÓRICO LOCAL
// ==========================================
const manualForm = document.getElementById("manualProductForm");
const manualStatus = document.getElementById("manualStatus");
const saveStatus = document.getElementById("saveStatus");
const historyStatus = document.getElementById("historyStatus");
const quoteHistory = document.getElementById("quoteHistory");
let quoteHasChanges = false;
let openedHistoryId = null;

function markQuoteChanged() {
  quoteHasChanges = true;
  saveStatus.textContent = "";
}

function readHistory() {
  try {
    const stored = JSON.parse(localStorage.getItem(HISTORY_STORAGE_KEY) || "[]");
    return Array.isArray(stored) ? stored.filter(x => x && typeof x.id === "string" && Array.isArray(x.items)) : [];
  } catch { return []; }
}

function renderHistory() {
  const entries = readHistory();
  quoteHistory.replaceChildren();
  if (!entries.length) {
    showMessage(quoteHistory, "Nenhum orçamento salvo neste navegador.");
    return;
  }
  entries.forEach(entry => {
    const card = document.createElement("article");
    card.className = "history-card";
    const title = document.createElement("div");
    title.className = "history-description";
    const label = document.createElement("strong");
    label.textContent = entry.customerName || "Cliente não informado";
    const meta = document.createElement("small");
    const date = new Date(entry.savedAt);
    meta.textContent = `${Number.isFinite(date.getTime()) ? date.toLocaleString("pt-BR") : "Data indisponível"} • ${entry.items.length} produto(s) • ${money(Number(entry.total) || 0)}`;
    title.append(label, meta);
    const actions = document.createElement("div");
    actions.className = "history-actions";
    const open = document.createElement("button");
    open.type = "button";
    open.textContent = "Abrir / Editar";
    open.className = "history-open";
    open.addEventListener("click", () => openHistory(entry.id));
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "history-delete";
    remove.textContent = "Excluir";
    remove.addEventListener("click", () => deleteHistory(entry.id));
    actions.append(open, remove);
    card.append(title, actions);
    quoteHistory.appendChild(card);
  });
}

function saveQuoteToHistory() {
  if (!quote.length) {
    saveStatus.textContent = "Adicione pelo menos um produto antes de salvar.";
    return;
  }
  const entries = readHistory();
  // Abrir um orçamento e salvar atualiza esse registro, em vez de duplicá-lo.
  const id = openedHistoryId || (globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const entry = {
    id,
    savedAt: new Date().toISOString(),
    customerName: customerInput.value.trim(),
    items: structuredCloneSafe(quote),
    total: getTotals().total
  };
  const index = entries.findIndex(record => record.id === id);
  if (index === -1) entries.unshift(entry);
  else entries.splice(index, 1, entry);
  try {
    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(entries));
    openedHistoryId = id;
    quoteHasChanges = false;
    saveStatus.textContent = "Orçamento salvo! Use 'Novo orçamento / Limpar' para começar outro, sem remover itens um por um.";
    historyStatus.textContent = "";
    renderHistory();
  } catch {
    saveStatus.textContent = "Não foi possível salvar: o armazenamento do navegador está cheio ou bloqueado. Reduza o tamanho das fotos ou exclua orçamentos antigos.";
  }
}

function structuredCloneSafe(value) {
  return JSON.parse(JSON.stringify(value));
}

function beginNewQuote() {
  if (quote.length && quoteHasChanges && !confirm("Começar um novo orçamento? As alterações não salvas no histórico serão descartadas.")) return;
  quote = [];
  customerInput.value = "";
  openedHistoryId = null;
  quoteHasChanges = false;
  renderQuote();
  invalidatePreparedPDF();
  setPdfStatus("");
  saveStatus.textContent = "Novo orçamento iniciado.";
  searchInput.value = "";
  document.getElementById("budgetEditor").scrollIntoView({ behavior: "smooth", block: "start" });
}

function openHistory(id) {
  const entry = readHistory().find(record => record.id === id);
  if (!entry) { historyStatus.textContent = "Orçamento não encontrado."; return; }
  if (quote.length && quoteHasChanges && !confirm("Abrir este orçamento? As alterações atuais que não foram salvas no histórico serão descartadas.")) return;
  quote = structuredCloneSafe(entry.items).map(item => ({
    ...item,
    image: safeImage(item.image),
    stock: getStock(item.stock)
  }));
  customerInput.value = String(entry.customerName || "").slice(0, 120);
  openedHistoryId = id;
  quoteHasChanges = false;
  renderQuote();
  invalidatePreparedPDF();
  setPdfStatus("");
  saveStatus.textContent = "Orçamento do histórico aberto. Você pode editar, salvar novamente ou baixar o PDF.";
  historyStatus.textContent = "";
  document.getElementById("budgetEditor").scrollIntoView({ behavior: "smooth", block: "start" });
}

function deleteHistory(id) {
  const entries = readHistory();
  const entry = entries.find(x => x.id === id);
  if (!entry || !confirm(`Excluir do histórico o orçamento de ${entry.customerName || "cliente não informado"}? Essa ação não pode ser desfeita.`)) return;
  const remaining = entries.filter(x => x.id !== id);
  try {
    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(remaining));
    if (openedHistoryId === id) { openedHistoryId = null; quoteHasChanges = true; }
    renderHistory();
    historyStatus.textContent = "Orçamento excluído do histórico.";
  } catch {
    historyStatus.textContent = "Não foi possível excluir o orçamento.";
  }
}

async function resizeManualPhoto(file) {
  if (!file) return "";
  if (!/^image\/(png|jpeg|webp)$/.test(file.type)) throw new Error("Use uma foto PNG, JPG ou WebP.");
  if (file.size > 12 * 1024 * 1024) throw new Error("A foto deve ter no máximo 12 MB.");
  const url = URL.createObjectURL(file);
  const img = new Image();
  try {
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = () => reject(new Error("Não foi possível abrir a foto."));
      img.src = url;
    });
    const scale = Math.min(1, 480 / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.73);
  } finally {
    URL.revokeObjectURL(url);
  }
}

manualForm.addEventListener("submit", async event => {
  event.preventDefault();
  const name = document.getElementById("manualName").value.trim();
  const priceText = document.getElementById("manualPrice").value.replace(",", ".");
  const price = Number(priceText);
  const quantity = Number(document.getElementById("manualQuantity").value);
  if (!name || !Number.isFinite(price) || price < 0 || !Number.isInteger(quantity) || quantity < 1 || quantity > 9999) {
    manualStatus.textContent = "Preencha nome, preço válido e quantidade inteira de 1 a 9999.";
    return;
  }
  const submit = document.getElementById("addManualProduct");
  submit.disabled = true;
  manualStatus.textContent = "Preparando produto...";
  try {
    const image = await resizeManualPhoto(document.getElementById("manualPhoto").files?.[0]);
    const key = `manual-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    quote.push({
      key, productId: null, variantId: null, name, variantName: "",
      image, price: Math.round(price * 100) / 100, stock: null, quantity,
      discountType: "none", discountValue: 0
    });
    renderQuote();
    markQuoteChanged();
    invalidatePreparedPDF();
    manualForm.reset();
    manualStatus.textContent = "";
    showProductToast(name, quantity);
  } catch (error) {
    manualStatus.textContent = error.message || "Não foi possível adicionar o produto.";
  } finally {
    submit.disabled = false;
  }
});

document.getElementById("saveQuote").addEventListener("click", saveQuoteToHistory);
document.getElementById("newQuote").addEventListener("click", beginNewQuote);
renderHistory();

searchButton.addEventListener("click", searchProducts);
searchInput.addEventListener("keydown", event => {
  if (event.key === "Enter") searchProducts();
});
customerInput.addEventListener("input", () => {
  markQuoteChanged();
  saveDraft();
  invalidatePreparedPDF();
});
generatePDFButton.addEventListener("click", generatePDF);
sharePDFButton.addEventListener("click", sharePDF);
restoreDraft();
renderQuote();