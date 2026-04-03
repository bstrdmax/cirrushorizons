const SUPABASE_URL = 'https://tdgudmnrqhlkwefthdat.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRkZ3VkbW5ycWhsa3dlZnRoZGF0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUyMTI5MjksImV4cCI6MjA5MDc4ODkyOX0.Rlr-BS4x_WyMTiRBTFGQdddV8b0dtKfNzKBz1YOsJLo'; 

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let appState = {
    activeTab: 'dashboard', theme: 'dark', user: null,
    financialData: { current_liquid_assets: 0, horizon_goal: 0, starting_decade: 30, bills: [], transactions: [] }
};

const baselineData = {
    20: { strategy: "Growth Automation", score: 92 },
    30: { strategy: "Debt Snowball & Tax Max", score: 78 },
    40: { strategy: "Asset Rebalancing", score: 64 },
    50: { strategy: "Preservation Mode", score: 85 }
};

// --- AUTH LOGIC ---
supabaseClient.auth.onAuthStateChange(async (event, session) => {
    if (session) {
        appState.user = session.user;
        render(); // Show dashboard shell immediately
        await fetchUserFinancials(session.user.id);
    } else {
        appState.user = null;
        render();
    }
});

async function fetchUserFinancials(userId) {
    const { data, error } = await supabaseClient.from('profiles').select('*').eq('id', userId).single();
    if (error && error.code === 'PGRST116') {
        // Create profile if missing
        await supabaseClient.from('profiles').insert({ id: userId, bills: [], transactions: [], horizon_goal: 1000000 });
    } else if (data) {
        appState.financialData = { ...appState.financialData, ...data, bills: data.bills || [], transactions: data.transactions || [] };
        render();
    }
}

async function syncToCloud(updates) {
    if (!appState.user) return;
    appState.financialData = { ...appState.financialData, ...updates };
    render();
    await supabaseClient.from('profiles').upsert({ id: appState.user.id, ...updates });
}

// --- CRUD ---
function addTransaction() {
    const type = document.getElementById('trans-type').value;
    const label = document.getElementById('trans-label').value;
    const amount = Number(document.getElementById('trans-amount').value);
    if (!label || amount <= 0) return;
    appState.financialData.transactions.push({ id: Date.now(), type, label, amount });
    syncToCloud({ transactions: appState.financialData.transactions });
}

function addDebt() {
    const name = document.getElementById('debt-name').value;
    const balance = Number(document.getElementById('debt-bal').value);
    const payment = Number(document.getElementById('debt-pmt').value);
    if (!name || balance <= 0) return;
    appState.financialData.bills.push({ id: Date.now(), name, balance, payment });
    syncToCloud({ bills: appState.financialData.bills });
}

window.deleteItem = (key, id) => {
    appState.financialData[key] = appState.financialData[key].filter(i => i.id !== id);
    syncToCloud({ [key]: appState.financialData[key] });
};

// --- RENDER ---
function render() {
    const fd = appState.financialData;
    document.getElementById('auth-overlay').style.display = appState.user ? 'none' : 'flex';
    document.getElementById('app-container').style.display = appState.user ? 'flex' : 'none';
    if (!appState.user) return;

    const wrapper = document.getElementById('cirrus-horizons-wrapper');
    wrapper.className = appState.theme === 'dark' ? 'dark-theme' : '';
    
    document.querySelectorAll('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.tab === appState.activeTab));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.toggle('active', c.id === appState.activeTab));

    const dec = baselineData[fd.starting_decade || 30];
    document.getElementById('baseline-strategy').textContent = dec.strategy;
    document.getElementById('efficiency-score').textContent = `${dec.score}%`;
    document.getElementById('efficiency-ring').style.strokeDashoffset = 125 - (125 * dec.score) / 100;
    
    const progress = fd.horizon_goal > 0 ? (fd.current_liquid_assets / fd.horizon_goal) * 100 : 0;
    document.getElementById('goal-bar').style.width = `${Math.min(progress, 100)}%`;
    document.getElementById('goal-text').textContent = `${Math.round(progress)}%`;

    const ledger = document.getElementById('ledger-wrapper');
    ledger.innerHTML = '';
    let totalIn = 0, totalOut = 0;
    fd.transactions.forEach(t => {
        if (t.type === 'deposit') totalIn += t.amount; else totalOut += t.amount;
        ledger.innerHTML += `<div class="crud-item"><span>${t.type}</span><span class="font-bold">${t.label}</span><span>$${t.amount}</span><button onclick="deleteItem('transactions', ${t.id})">Delete</button></div>`;
    });
    document.getElementById('net-surplus').textContent = `Surplus: $${totalIn - totalOut}`;

    const debtList = document.getElementById('debt-wrapper');
    debtList.innerHTML = '';
    let totalDebt = 0;
    fd.bills.forEach(b => {
        totalDebt += b.balance;
        debtList.innerHTML += `<div class="crud-item"><span></span><span class="font-bold">${b.name}</span><span>$${b.balance}</span><button onclick="deleteItem('bills', ${b.id})">Delete</button></div>`;
    });
    document.getElementById('total-debt').textContent = `Debt: $${totalDebt}`;

    lucide.createIcons();
}

// --- EVENTS ---
document.getElementById('login-btn').addEventListener('click', async () => {
    const { error } = await supabaseClient.auth.signInWithPassword({ email: document.getElementById('auth-email').value.trim(), password: document.getElementById('auth-password').value });
    if (error) alert(error.message);
});
document.getElementById('signup-btn').addEventListener('click', async () => {
    const { error } = await supabaseClient.auth.signUp({ email: document.getElementById('auth-email').value.trim(), password: document.getElementById('auth-password').value });
    if (error) alert(error.message);
});
document.getElementById('logout-btn').addEventListener('click', () => supabaseClient.auth.signOut());
document.getElementById('theme-toggle').addEventListener('click', () => { appState.theme = appState.theme === 'light' ? 'dark' : 'light'; render(); });
document.querySelector('.sidebar-nav').addEventListener('click', (e) => { const btn = e.target.closest('.nav-item'); if (btn) { appState.activeTab = btn.dataset.tab; render(); } });
document.getElementById('main-assets-input').addEventListener('blur', (e) => syncToCloud({ current_liquid_assets: Number(e.target.value) }));
document.getElementById('main-goal-input').addEventListener('blur', (e) => syncToCloud({ horizon_goal: Number(e.target.value) }));
document.getElementById('add-trans-btn').addEventListener('click', addTransaction);
document.getElementById('add-debt-btn').addEventListener('click', addDebt);
document.querySelectorAll('.decade-btn').forEach(b => b.addEventListener('click', () => syncToCloud({ starting_decade: Number(b.dataset.decade) })));

document.addEventListener('DOMContentLoaded', () => { render(); });
