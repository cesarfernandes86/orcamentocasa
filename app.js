const LOCAL_KEY = "orcamento-casa:data";
const SETTINGS_KEY = "orcamento-casa:firebase";
const DEFAULT_FIREBASE_SETTINGS = {
  householdId: "minha-casa",
  config: {
    apiKey: "AIzaSyAv4bqLtHdW7IhbKEjMo1Kx_I8uTniBax0",
    authDomain: "orcamento-casa-9ce51.firebaseapp.com",
    projectId: "orcamento-casa-9ce51",
    storageBucket: "orcamento-casa-9ce51.firebasestorage.app",
    messagingSenderId: "124461434912",
    appId: "1:124461434912:web:fa75b67fd1cf9abea35445",
    measurementId: "G-5KKTKS8PXX",
  },
};

const currency = new Intl.NumberFormat("pt-PT", {
  style: "currency",
  currency: "EUR",
});

const elements = {
  syncStatus: document.querySelector("#syncStatus"),
  monthPicker: document.querySelector("#monthPicker"),
  prevMonth: document.querySelector("#prevMonth"),
  nextMonth: document.querySelector("#nextMonth"),
  incomeInput: document.querySelector("#incomeInput"),
  incomeValue: document.querySelector("#incomeValue"),
  expenseValue: document.querySelector("#expenseValue"),
  availableValue: document.querySelector("#availableValue"),
  allocatedValue: document.querySelector("#allocatedValue"),
  summaryMessage: document.querySelector("#summaryMessage"),
  fixedTotal: document.querySelector("#fixedTotal"),
  variableTotal: document.querySelector("#variableTotal"),
  percentTotal: document.querySelector("#percentTotal"),
  percentMeter: document.querySelector("#percentMeter"),
  allocationWarning: document.querySelector("#allocationWarning"),
  fixedForm: document.querySelector("#fixedForm"),
  variableForm: document.querySelector("#variableForm"),
  allocationForm: document.querySelector("#allocationForm"),
  fixedList: document.querySelector("#fixedList"),
  variableList: document.querySelector("#variableList"),
  allocationList: document.querySelector("#allocationList"),
};

const state = {
  currentMonth: getCurrentMonth(),
  budgets: {},
  settings: readSettings(),
  firebase: null,
  unsubscribe: null,
  suppressRemoteSave: false,
};

function getCurrentMonth() {
  return formatMonth(new Date());
}

function formatMonth(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function createBudget(fixedItems = [], allocationItems = []) {
  return {
    income: 0,
    fixed: fixedItems.map((item) => ({
      id: createId(),
      name: item.name,
      amount: 0,
    })),
    variable: [],
    allocations: allocationItems.map((item) => ({
      id: createId(),
      name: item.name,
      percent: toNumber(item.percent),
      usage: [],
    })),
    updatedAt: new Date().toISOString(),
  };
}

function getBudget() {
  if (!state.budgets[state.currentMonth]) {
    state.budgets[state.currentMonth] = createBudget(
      getFixedSeedForMonth(state.currentMonth),
      getAllocationSeedForMonth(state.currentMonth),
    );
    writeLocalData();
  }
  return state.budgets[state.currentMonth];
}

function getFixedSeedForMonth(month) {
  const previousMonths = Object.keys(state.budgets)
    .filter((budgetMonth) => budgetMonth < month)
    .sort()
    .reverse();

  for (const previousMonth of previousMonths) {
    const fixedItems = state.budgets[previousMonth]?.fixed || [];
    const names = uniqueNames(fixedItems.map((item) => item.name));
    if (names.length) {
      return names.map((name) => ({ name }));
    }
  }

  return [];
}

function getAllocationSeedForMonth(month) {
  const previousMonths = Object.keys(state.budgets)
    .filter((budgetMonth) => budgetMonth < month)
    .sort()
    .reverse();

  for (const previousMonth of previousMonths) {
    const allocationItems = state.budgets[previousMonth]?.allocations || [];
    const uniqueItems = uniqueItemsByName(allocationItems)
      .map((item) => ({
        name: item.name,
        percent: toNumber(item.percent),
      }));
    if (uniqueItems.length) return uniqueItems;
  }

  return [];
}

function uniqueNames(names) {
  const seen = new Set();
  return names
    .map((name) => String(name || "").trim())
    .filter((name) => {
      const key = name.toLocaleLowerCase("pt-PT");
      if (!name || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function uniqueItemsByName(items) {
  const seen = new Set();
  return items.filter((item) => {
    const name = String(item.name || "").trim();
    const key = name.toLocaleLowerCase("pt-PT");
    if (!name || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function readLocalData() {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_KEY)) || {};
  } catch {
    return {};
  }
}

function writeLocalData() {
  localStorage.setItem(LOCAL_KEY, JSON.stringify(state.budgets));
}

function readSettings() {
  try {
    const stored = localStorage.getItem(SETTINGS_KEY);
    if (!stored) return DEFAULT_FIREBASE_SETTINGS;
    const settings = JSON.parse(stored);
    return settings?.disabled ? DEFAULT_FIREBASE_SETTINGS : settings;
  } catch {
    return DEFAULT_FIREBASE_SETTINGS;
  }
}

function toNumber(value) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function createId() {
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
}

function sumItems(items, field = "amount") {
  return items.reduce((total, item) => total + toNumber(item[field]), 0);
}

function calculateBudget(budget) {
  const fixed = sumItems(budget.fixed);
  const variable = sumItems(budget.variable);
  const expenses = fixed + variable;
  const leftover = toNumber(budget.income) - expenses;
  const positiveLeftover = Math.max(leftover, 0);
  const percent = sumItems(budget.allocations, "percent");
  const spent = budget.allocations.reduce((total, item) => total + getAllocationSpent(item), 0);
  const allocated = budget.allocations.reduce((total, item) => {
    return total + positiveLeftover * (toNumber(item.percent) / 100);
  }, 0);

  return {
    fixed,
    variable,
    expenses,
    leftover,
    positiveLeftover,
    percent,
    spent,
    allocated,
    unallocated: leftover - allocated,
  };
}

function updateStatus(text, mode = "local") {
  elements.syncStatus.textContent = text;
  elements.syncStatus.className = `sync-pill ${mode}`;
}

function persist() {
  const budget = getBudget();
  budget.updatedAt = new Date().toISOString();
  writeLocalData();
  if (state.firebase && !state.suppressRemoteSave) {
    saveRemoteBudget(budget);
  }
}

function render() {
  const budget = getBudget();
  const totals = calculateBudget(budget);

  elements.monthPicker.value = state.currentMonth;
  elements.incomeInput.value = budget.income || "";
  elements.incomeValue.textContent = currency.format(toNumber(budget.income));
  elements.fixedTotal.textContent = currency.format(totals.fixed);
  elements.variableTotal.textContent = currency.format(totals.variable);
  elements.expenseValue.textContent = currency.format(totals.expenses);
  elements.availableValue.textContent = currency.format(totals.leftover);
  elements.allocatedValue.textContent = currency.format(totals.allocated);
  elements.percentTotal.textContent = `${trimNumber(totals.percent)}%`;
  elements.percentMeter.style.width = `${Math.min(totals.percent, 100)}%`;

  if (totals.leftover < 0) {
    elements.summaryMessage.textContent = `Faltam ${currency.format(Math.abs(totals.leftover))} para fechar este mes.`;
  } else if (totals.percent > 100) {
    elements.summaryMessage.textContent = "As porcentagens dos itens passam de 100% do saldo.";
  } else {
    elements.summaryMessage.textContent = `${currency.format(Math.max(totals.unallocated, 0))} ainda sem destino.`;
  }

  if (totals.percent > 100) {
    elements.allocationWarning.hidden = false;
    elements.allocationWarning.textContent = `Os itens somam ${trimNumber(totals.percent)}%. Reduza ${trimNumber(totals.percent - 100)} ponto(s) para caber no saldo.`;
  } else {
    elements.allocationWarning.hidden = true;
  }

  renderMoneyList(elements.fixedList, budget.fixed, "fixed");
  renderMoneyList(elements.variableList, budget.variable, "variable");
  renderAllocationList(elements.allocationList, budget.allocations, totals.positiveLeftover);
}

function renderMoneyList(container, items, type) {
  const template = document.querySelector("#moneyItemTemplate");
  container.replaceChildren();

  if (!items.length) {
    container.append(emptyState(type === "fixed" ? "Nenhum custo fixo ainda." : "Nenhum custo variavel ainda."));
    return;
  }

  items.forEach((item) => {
    const row = template.content.firstElementChild.cloneNode(true);
    const name = row.querySelector(".row-name");
    const amount = row.querySelector(".row-number");
    const remove = row.querySelector(".delete-button");

    name.value = item.name;
    amount.value = item.amount || "";

    name.addEventListener("change", () => {
      const previousName = item.name;
      item.name = name.value.trimStart();
      if (type === "fixed") {
        renameFixedInFutureMonths(previousName, item.name);
      }
      persist();
    });
    amount.addEventListener("change", () => {
      item.amount = toNumber(amount.value);
      persist();
      render();
    });
    remove.addEventListener("click", () => {
      const budget = getBudget();
      budget[type] = budget[type].filter((entry) => entry.id !== item.id);
      persist();
      render();
    });

    container.append(row);
  });
}

function renderAllocationList(container, items, available) {
  const template = document.querySelector("#allocationItemTemplate");
  container.replaceChildren();

  if (!items.length) {
    container.append(emptyState("Crie itens para dividir automaticamente o saldo."));
    return;
  }

  items.forEach((item) => {
    const row = template.content.firstElementChild.cloneNode(true);
    const name = row.querySelector(".row-name");
    const percent = row.querySelector(".row-number");
    const target = row.querySelector(".allocation-target");
    const remaining = row.querySelector(".allocation-remaining");
    const usageForm = row.querySelector(".usage-form");
    const usageList = row.querySelector(".usage-list");
    const remove = row.querySelector(".delete-button");
    const targetValue = available * (toNumber(item.percent) / 100);
    const spentValue = getAllocationSpent(item);
    const remainingValue = targetValue - spentValue;

    name.value = item.name;
    percent.value = item.percent || "";
    target.value = currency.format(targetValue);
    target.textContent = target.value;
    remaining.value = currency.format(remainingValue);
    remaining.textContent = remaining.value;
    remaining.classList.toggle("is-negative", remainingValue < 0);

    name.addEventListener("change", () => {
      const previousName = item.name;
      item.name = name.value.trimStart();
      renameAllocationInFutureMonths(previousName, item.name);
      persist();
    });
    percent.addEventListener("change", () => {
      const previousPercent = item.percent;
      item.percent = toNumber(percent.value);
      updateAllocationPercentInFutureMonths(item.name, previousPercent, item.percent);
      persist();
      render();
    });
    usageForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const data = new FormData(usageForm);
      const amount = toNumber(data.get("amount"));
      if (!amount) return;

      item.usage = Array.isArray(item.usage) ? item.usage : [];
      item.usage.push({
        id: createId(),
        description: String(data.get("description") || "").trim(),
        amount,
        createdAt: new Date().toISOString(),
      });
      usageForm.reset();
      persist();
      render();
    });
    remove.addEventListener("click", () => {
      const budget = getBudget();
      budget.allocations = budget.allocations.filter((entry) => entry.id !== item.id);
      persist();
      render();
    });

    renderUsageList(usageList, item);
    container.append(row);
  });
}

function renderUsageList(container, item) {
  container.replaceChildren();
  const usage = Array.isArray(item.usage) ? item.usage : [];

  if (!usage.length) {
    container.append(emptyState("Nenhum uso registrado neste item."));
    return;
  }

  usage.forEach((entry) => {
    const row = document.createElement("div");
    const label = document.createElement("span");
    const amount = document.createElement("strong");
    const remove = document.createElement("button");

    row.className = "usage-row";
    label.textContent = entry.description || "Uso registrado";
    amount.textContent = currency.format(toNumber(entry.amount));
    remove.className = "usage-delete";
    remove.type = "button";
    remove.setAttribute("aria-label", "Excluir uso");
    remove.textContent = "×";
    remove.addEventListener("click", () => {
      item.usage = usage.filter((usageEntry) => usageEntry.id !== entry.id);
      persist();
      render();
    });

    row.append(label, amount, remove);
    container.append(row);
  });
}

function emptyState(text) {
  const paragraph = document.createElement("p");
  paragraph.className = "muted";
  paragraph.textContent = text;
  return paragraph;
}

function trimNumber(number) {
  return Number(number.toFixed(1)).toString().replace(".", ",");
}

function addMoneyItem(type, form) {
  const data = new FormData(form);
  const budget = getBudget();
  const item = {
    id: createId(),
    name: String(data.get("name")).trim(),
    amount: toNumber(data.get("amount")),
  };
  budget[type].push(item);
  if (type === "fixed") {
    addFixedToFutureMonths(item.name);
  }
  form.reset();
  persist();
  render();
}

function addFixedToFutureMonths(name) {
  const cleanName = String(name || "").trim();
  if (!cleanName) return;

  Object.entries(state.budgets).forEach(([month, budget]) => {
    if (month <= state.currentMonth) return;
    if (hasFixedName(budget.fixed, cleanName)) return;

    budget.fixed.push({
      id: createId(),
      name: cleanName,
      amount: 0,
    });
  });
}

function renameFixedInFutureMonths(previousName, nextName) {
  const oldName = String(previousName || "").trim();
  const newName = String(nextName || "").trim();
  if (!oldName || !newName) return;

  Object.entries(state.budgets).forEach(([month, budget]) => {
    if (month <= state.currentMonth) return;
    budget.fixed.forEach((item) => {
      if (sameName(item.name, oldName) && toNumber(item.amount) === 0) {
        item.name = newName;
      }
    });
  });
}

function hasFixedName(items, name) {
  return hasNamedItem(items, name);
}

function hasNamedItem(items, name) {
  return items.some((item) => sameName(item.name, name));
}

function sameName(left, right) {
  return String(left || "").trim().toLocaleLowerCase("pt-PT")
    === String(right || "").trim().toLocaleLowerCase("pt-PT");
}

function addAllocation(form) {
  const data = new FormData(form);
  const budget = getBudget();
  const item = {
    id: createId(),
    name: String(data.get("name")).trim(),
    percent: toNumber(data.get("percent")),
    usage: [],
  };
  budget.allocations.push(item);
  addAllocationToFutureMonths(item.name, item.percent);
  form.reset();
  persist();
  render();
}

function addAllocationToFutureMonths(name, percent) {
  const cleanName = String(name || "").trim();
  if (!cleanName) return;

  Object.entries(state.budgets).forEach(([month, budget]) => {
    if (month <= state.currentMonth) return;
    if (hasNamedItem(budget.allocations, cleanName)) return;

    budget.allocations.push({
      id: createId(),
      name: cleanName,
      percent: toNumber(percent),
      usage: [],
    });
  });
}

function renameAllocationInFutureMonths(previousName, nextName) {
  const oldName = String(previousName || "").trim();
  const newName = String(nextName || "").trim();
  if (!oldName || !newName) return;

  Object.entries(state.budgets).forEach(([month, budget]) => {
    if (month <= state.currentMonth) return;
    budget.allocations.forEach((item) => {
      if (sameName(item.name, oldName) && getAllocationSpent(item) === 0) {
        item.name = newName;
      }
    });
  });
}

function updateAllocationPercentInFutureMonths(name, previousPercent, nextPercent) {
  const cleanName = String(name || "").trim();
  if (!cleanName) return;

  Object.entries(state.budgets).forEach(([month, budget]) => {
    if (month <= state.currentMonth) return;
    budget.allocations.forEach((item) => {
      const hasPreviousPercent = toNumber(item.percent) === toNumber(previousPercent);
      if (sameName(item.name, cleanName) && hasPreviousPercent && getAllocationSpent(item) === 0) {
        item.percent = toNumber(nextPercent);
      }
    });
  });
}

function getAllocationSpent(item) {
  if (Array.isArray(item.usage)) {
    return item.usage.reduce((total, entry) => total + toNumber(entry.amount), 0);
  }
  return toNumber(item.spent);
}

function shiftMonth(delta) {
  const [year, month] = state.currentMonth.split("-").map(Number);
  const next = new Date(year, month - 1 + delta, 1);
  state.currentMonth = formatMonth(next);
  listenRemoteMonth();
  render();
}

async function initializeFirebase() {
  if (!state.settings) {
    updateStatus("Local", "local");
    return;
  }

  try {
    updateStatus("Conectando", "local");
    const appModule = await import("https://www.gstatic.com/firebasejs/12.13.0/firebase-app.js");
    const authModule = await import("https://www.gstatic.com/firebasejs/12.13.0/firebase-auth.js");
    const firestoreModule = await import("https://www.gstatic.com/firebasejs/12.13.0/firebase-firestore.js");

    const app = appModule.getApps().length
      ? appModule.getApps()[0]
      : appModule.initializeApp(state.settings.config);
    const auth = authModule.getAuth(app);
    await authModule.signInAnonymously(auth);

    state.firebase = {
      db: firestoreModule.getFirestore(app),
      doc: firestoreModule.doc,
      setDoc: firestoreModule.setDoc,
      onSnapshot: firestoreModule.onSnapshot,
      serverTimestamp: firestoreModule.serverTimestamp,
    };

    updateStatus("Firebase", "online");
    listenRemoteMonth();
  } catch (error) {
    console.error(error);
    updateStatus("Erro Firebase", "error");
  }
}

function listenRemoteMonth() {
  if (!state.firebase || !state.settings) return;
  if (state.unsubscribe) state.unsubscribe();

  const ref = getRemoteRef();
  state.unsubscribe = state.firebase.onSnapshot(ref, (snapshot) => {
    if (!snapshot.exists()) {
      saveRemoteBudget(getBudget());
      return;
    }

    const remoteBudget = snapshot.data().budget;
    if (!remoteBudget) return;

    state.suppressRemoteSave = true;
    state.budgets[state.currentMonth] = normalizeBudget(remoteBudget);
    writeLocalData();
    render();
    state.suppressRemoteSave = false;
  }, (error) => {
    console.error(error);
    updateStatus("Erro Firebase", "error");
  });
}

function normalizeBudget(budget) {
  return {
    ...createBudget(),
    ...budget,
    fixed: Array.isArray(budget.fixed) ? budget.fixed.map(normalizeMoneyItem) : [],
    variable: Array.isArray(budget.variable) ? budget.variable : [],
    allocations: Array.isArray(budget.allocations) ? budget.allocations.map(normalizeAllocationItem) : [],
  };
}

function normalizeBudgets(budgets) {
  return Object.fromEntries(
    Object.entries(budgets || {}).map(([month, budget]) => [month, normalizeBudget(budget)]),
  );
}

function normalizeMoneyItem(item) {
  return {
    id: item.id || createId(),
    name: item.name || "",
    amount: toNumber(item.amount),
  };
}

function normalizeAllocationItem(item) {
  const usage = Array.isArray(item.usage)
    ? item.usage.map(normalizeUsageEntry)
    : legacySpentToUsage(item.spent);

  return {
    id: item.id || createId(),
    name: item.name || "",
    percent: toNumber(item.percent),
    usage,
  };
}

function normalizeUsageEntry(entry) {
  return {
    id: entry.id || createId(),
    description: entry.description || "",
    amount: toNumber(entry.amount),
    createdAt: entry.createdAt || new Date().toISOString(),
  };
}

function legacySpentToUsage(spent) {
  const amount = toNumber(spent);
  if (!amount) return [];

  return [{
    id: createId(),
    description: "Uso registrado",
    amount,
    createdAt: new Date().toISOString(),
  }];
}

function getRemoteRef() {
  return state.firebase.doc(
    state.firebase.db,
    "households",
    state.settings.householdId,
    "months",
    state.currentMonth,
  );
}

async function saveRemoteBudget(budget) {
  try {
    await state.firebase.setDoc(getRemoteRef(), {
      budget,
      updatedAt: state.firebase.serverTimestamp(),
    }, { merge: true });
    updateStatus("Firebase", "online");
  } catch (error) {
    console.error(error);
    updateStatus("Erro ao salvar", "error");
  }
}

function bindEvents() {
  elements.incomeInput.addEventListener("input", () => {
    getBudget().income = toNumber(elements.incomeInput.value);
    persist();
    render();
  });

  elements.fixedForm.addEventListener("submit", (event) => {
    event.preventDefault();
    addMoneyItem("fixed", elements.fixedForm);
  });

  elements.variableForm.addEventListener("submit", (event) => {
    event.preventDefault();
    addMoneyItem("variable", elements.variableForm);
  });

  elements.allocationForm.addEventListener("submit", (event) => {
    event.preventDefault();
    addAllocation(elements.allocationForm);
  });

  elements.monthPicker.addEventListener("change", () => {
    state.currentMonth = elements.monthPicker.value || getCurrentMonth();
    listenRemoteMonth();
    render();
  });

  elements.prevMonth.addEventListener("click", () => shiftMonth(-1));
  elements.nextMonth.addEventListener("click", () => shiftMonth(1));
}

state.budgets = normalizeBudgets(readLocalData());
writeLocalData();
bindEvents();
render();
initializeFirebase();
