/**
 * CIRRUS HORIZONS - FULL INTERACTIVE ENGINE
 */

const SUPABASE_URL = 'https://tdgudmnrqhlkwefthdat.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRkZ3VkbW5ycWhsa3dlZnRoZGF0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUyMTI5MjksImV4cCI6MjA5MDc4ODkyOX0.Rlr-BS4x_WyMTiRBTFGQdddV8b0dtKfNzKBz1YOsJLo'; 

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// --- GLOBAL STATE ---
let appState = {
    activeTab: 'dashboard',
    theme: 'dark',
    user: null,
    isSimulating: false,
    financialData: {
        current_liquid_assets: 0,
        horizon_goal: 0,
        starting_decade: 30,
        bills: [],        // Debt CRUD array
        transactions: []  // Cashflow CRUD array
    }
};

const baselineData = {
    20: { label: "20s", strategy: "Aggressive Growth Automation", score: 92 },
    30: { label: "30s", strategy: "Debt Snowball & Tax Maximization", score: 78 },
    40: { label: "40s", strategy: "Asset Rebalancing & Catch-up", score: 64 },
    50: { label: "50s", strategy: "Preservation & Distribution", score: 85 }
};

// --- DATA SYNC ---
supabaseClient.auth.onAuthStateChange(async (event, session) => {
    if (session) {
        appState.user = session.user;
        await fetchUserFinancials(session.user.id);
    } else {
        appState.user = null;
        render();
    }
});

async function fetchUserFinancials(userId) {
    const { data } = await supabaseClient.from('profiles').select('*').eq('id', userId).single();
    if (data) {
        appState.financialData = { 
            ...appState.financialData, 
            ...data,
            bills: data.bills || [],
            transactions: data.transactions || []
        };
    }
    render();
}

async function syncToCloud(updates) {
    if (!appState.user) return;
    appState.financialData = { ...appState.financialData, ...updates };
    render(); // Optimistic UI
    await supabaseClient.from('profiles').upsert({ id: appState.user.id, ...updates });
}

// --- CRUD LOGIC ---

function addTransaction() {
    const type = document.getElementById('trans-type').value;
    const label = document.getElementById('trans-label').value.trim();
    const amount = Number(document.getElementById('trans-amount').value);
    if (!label || amount <= 0) return;
    appState.financialData.transactions.push({ id: Date.now(), type, label, amount });
    document.getElementById('trans-label').value = '';
    document.getElementById('trans-amount').value = '';
    syncToCloud({ transactions: appState.financialData.transactions });
}

function addDebt() {
    const name = document.getElementById('debt-name').value.trim();
    const balance = Number(document.getElementById('debt-bal').value);
    const payment = Number(document.getElementById('debt-pmt').value);
    if (!name || balance <= 0) return;
    appState.financialData.bills.push({ id: Date.now(), name, balance, payment });
    document.getElementById('debt-name').value = '';
    document.getElementById('debt-bal').value = '';
    document.getElementById('debt-pmt').value = '';
    syncToCloud({ bills: appState.financialData.bills });
}

// --- RENDER ENGINE ---

function render() {
    const fd = appState.financialData;
    
    // Auth View
    document.getElementById('auth-overlay').classList.toggle('active', !appState.user);
    document.getElementById('app-container').style.display = appState.user ? 'flex' : 'none';
    if (!appState.user) return;

    // Theme & Active Tab
    const wrapper = document.getElementById('cirrus-horizons-wrapper');
    wrapper.className = appState.theme === 'dark' ? 'dark-theme' : '';
    document.getElementById('theme-icon').setAttribute('data-lucide', appState.theme === 'dark' ? 'sun' : 'moon');
    
    document.querySelectorAll('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.tab === appState.activeTab));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.toggle('active', c.id === appState.activeTab));

    // Dashboard Render
    const dec = baselineData[fd.starting_decade];
    document.getElementById('baseline-strategy').textContent = dec.strategy;
    document.getElementById('efficiency-score').textContent = `${dec.score}%`;
    document.getElementById('efficiency-ring').style.strokeDashoffset = 125 - (125 * dec.score) / 100;
    
    const progress = fd.horizon_goal > 0 ? (fd.current_liquid_assets / fd.horizon_goal) * 100 : 0;
    document.getElementById('goal-bar').style.width = `${Math.min(progress, 100)}%`;
    document.getElementById('goal-text').textContent = `${Math.round(progress)}%`;
    
    if (document.activeElement.id !== 'main-assets-input') document.getElementById('main-assets-input').value = fd.current_liquid_assets || '';
    if (document.activeElement.id !== 'main-goal-input') document.getElementById('main-goal-input').value = fd.horizon_goal || '';

    // Cashflow CRUD Render
    const ledger = document.getElementById('ledger-wrapper');
    ledger.innerHTML = '';
    let totalIn = 0, totalOut = 0;
    fd.transactions.forEach(t => {
        if (t.type === 'deposit') totalIn += t.amount; else totalOut += t.amount;
        const div = document.createElement('div');
        div.className = 'crud-item';
        div.innerHTML = `<span class="${t.type === 'deposit' ? 'badge-in' : 'badge-out'}">${t.type}</span><span class="font-bold">${t.label}</span><span>$${t.amount}</span><button class="btn-danger" style="color:var(--rose); cursor:pointer;" onclick="deleteItem('transactions', ${t.id})">Delete</button>`;
        ledger.appendChild(div);
    });
    document.getElementById('net-surplus').textContent = `$${(totalIn - totalOut).toLocaleString()}`;

    // Debt CRUD Render
    const debtList = document.getElementById('debt-wrapper');
    debtList.innerHTML = '';
    let totalDebt = 0, totalPmt = 0;
    fd.bills.forEach(b => {
        totalDebt += b.balance; totalPmt += b.payment;
        const div = document.createElement('div');
        div.className = 'crud-item';
        div.innerHTML = `<span></span><span class="font-bold">${b.name}</span><span>$${b.balance}</span><button class="btn-danger" style="color:var(--rose); cursor:pointer;" onclick="deleteItem('bills', ${b.id})">Delete</button>`;
        debtList.appendChild(div);
    });
    document.getElementById('total-debt').textContent = `$${totalDebt.toLocaleString()}`;
    document.getElementById('debt-months').textContent = totalPmt > 0 ? `${Math.ceil(totalDebt / totalPmt)} Months` : '0 Months';

    lucide.createIcons();
}

// Global scope helpers for onclick
window.deleteItem = (key, id) => {
    appState.financialData[key] = appState.financialData[key].filter(i => i.id !== id);
    syncToCloud({ [key]: appState.financialData[key] });
};

// --- EVENTS ---
function bindEvents() {
    document.getElementById('login-btn').addEventListener('click', async () => {
        const { error } = await supabaseClient.auth.signInWithPassword({ email: document.getElementById('auth-email').value, password: document.getElementById('auth-password').value });
        if (error) alert(error.message);
    });
    document.getElementById('signup-btn').addEventListener('click', async () => {
        const { error } = await supabaseClient.auth.signUp({ email: document.getElementById('auth-email').value, password: document.getElementById('auth-password').value });
        if (error) alert(error.message);
    });
    document.getElementById('logout-btn').addEventListener('click', () => supabaseClient.auth.signOut());
    document.getElementById('theme-toggle').addEventListener('click', () => { appState.theme = appState.theme === 'light' ? 'dark' : 'light'; render(); });
    
    document.querySelector('.sidebar-nav').addEventListener('click', (e) => {
        const btn = e.target.closest('.nav-item');
        if (btn) { appState.activeTab = btn.dataset.tab; render(); }
    });

    document.getElementById('main-assets-input').addEventListener('blur', (e) => syncToCloud({ current_liquid_assets: Number(e.target.value) }));
    document.getElementById('main-goal-input').addEventListener('blur', (e) => syncToCloud({ horizon_goal: Number(e.target.value) }));
    
    document.querySelectorAll('.decade-btn').forEach(b => b.addEventListener('click', () => syncToCloud({ starting_decade: Number(b.dataset.decade) })));
    document.getElementById('add-trans-btn').addEventListener('click', addTransaction);
    document.getElementById('add-debt-btn').addEventListener('click', addDebt);

    document.getElementById('run-sim-btn').addEventListener('click', () => {
        appState.isSimulating = true; render();
        setTimeout(() => {
            const base = appState.financialData.current_liquid_assets;
            document.getElementById('sim-p10').textContent = `$${Math.round(base * 1.4).toLocaleString()}`;
            document.getElementById('sim-p50').textContent = `$${Math.round(base * 1.9).toLocaleString()}`;
            document.getElementById('sim-p90').textContent = `$${Math.round(base * 2.6).toLocaleString()}`;
            appState.isSimulating = false; document.getElementById('sim-results').style.opacity = '1'; render();
        }, 1500);
    });
}

document.addEventListener('DOMContentLoaded', () => { bindEvents(); render(); });
