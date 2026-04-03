const SUPABASE_URL = 'https://tdgudmnrqhlkwefthdat.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRkZ3VkbW5ycWhsa3dlZnRoZGF0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUyMTI5MjksImV4cCI6MjA5MDc4ODkyOX0.Rlr-BS4x_WyMTiRBTFGQdddV8b0dtKfNzKBz1YOsJLo'; 

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let appState = {
    activeTab: 'dashboard', user: null,
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
        render(); 
        await fetchUserFinancials(session.user.id);
    } else {
        appState.user = null;
        render();
    }
});

async function fetchUserFinancials(userId) {
    const { data, error } = await supabaseClient.from('profiles').select('*').eq('id', userId).single();
    if (error && error.code === 'PGRST116') {
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

// --- CRUD LOGIC WITH VALIDATION ---
function addTransaction() {
    const type = document.getElementById('trans-type').value;
    const label = document.getElementById('trans-label').value.trim();
    const amount = Number(document.getElementById('trans-amount').value);
    
    // VALIDATION: Prevents silent failing
    if (!label || amount <= 0) {
        alert("Please enter a valid label and an amount greater than 0.");
        return;
    }
    
    appState.financialData.transactions.push({ id: Date.now(), type, label, amount });
    
    // Clear inputs after success
    document.getElementById('trans-label').value = '';
    document.getElementById('trans-amount').value = '';
    
    syncToCloud({ transactions: appState.financialData.transactions });
}

function addDebt() {
    const name = document.getElementById('debt-name').value.trim();
    const balance = Number(document.getElementById('debt-bal').value);
    const payment = Number(document.getElementById('debt-pmt').value);
    
    // VALIDATION: Prevents silent failing
    if (!name || balance <= 0) {
        alert("Please enter a valid Debt Name and Balance greater than 0.");
        return;
    }
    
    appState.financialData.bills.push({ id: Date.now(), name, balance, payment });
    
    // Clear inputs after success
    document.getElementById('debt-name').value = '';
    document.getElementById('debt-bal').value = '';
    document.getElementById('debt-pmt').value = '';
    
    syncToCloud({ bills: appState.financialData.bills });
}

window.deleteItem = (key, id) => {
    appState.financialData[key] = appState.financialData[key].filter(i => i.id !== id);
    syncToCloud({ [key]: appState.financialData[key] });
};

// --- RENDER LOGIC ---
function render() {
    const fd = appState.financialData;
    
    // Layout Fix: Display flex-column instead of default row
    document.getElementById('auth-overlay').style.display = appState.user ? 'none' : 'flex';
    document.getElementById('app-container').style.display = appState.user ? 'flex' : 'none';
    
    if (!appState.user) return;

    // Tabs
    document.querySelectorAll('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.tab === appState.activeTab));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.toggle('active', c.id === appState.activeTab));

    // Dashboard Math
    const dec = baselineData[fd.starting_decade || 30];
    document.getElementById('baseline-strategy').textContent = dec.strategy;
    
    document.querySelectorAll('.decade-btn').forEach(btn => {
        btn.classList.toggle('active', parseInt(btn.dataset.decade) === (fd.starting_decade || 30));
    });

    const ring = document.getElementById('efficiency-ring');
    const scoreText = document.getElementById('efficiency-score');
    const offset = 226 - (226 * dec.score) / 100;
    ring.style.strokeDashoffset = offset;
    scoreText.textContent = `${dec.score}%`;
    
    const progress = fd.horizon_goal > 0 ? (fd.current_liquid_assets / fd.horizon_goal) * 100 : 0;
    document.getElementById('goal-bar').style.width = `${Math.min(progress, 100)}%`;
    document.getElementById('goal-text').textContent = `${Math.round(progress)}%`;

    if (document.activeElement.id !== 'main-assets-input') document.getElementById('main-assets-input').value = fd.current_liquid_assets || '';
    if (document.activeElement.id !== 'main-goal-input') document.getElementById('main-goal-input').value = fd.horizon_goal || '';

    // Cashflow Render
    const ledger = document.getElementById('ledger-wrapper');
    ledger.innerHTML = '';
    let totalIn = 0, totalOut = 0;
    fd.transactions.forEach(t => {
        if (t.type === 'deposit') totalIn += t.amount; else totalOut += t.amount;
        ledger.innerHTML += `
            <div class="crud-item">
                <span class="badge ${t.type === 'deposit' ? 'badge-in' : 'badge-out'}">${t.type}</span>
                <span style="font-weight: 600;">${t.label}</span>
                <span>$${t.amount.toLocaleString()}</span>
                <button class="icon-btn" style="color: var(--brand-rose); justify-self: end;" onclick="deleteItem('transactions', ${t.id})">
                    <i data-lucide="trash-2" style="width:16px;"></i>
                </button>
            </div>`;
    });
    document.getElementById('net-surplus').textContent = `$${(totalIn - totalOut).toLocaleString()} Surplus`;

    // Debt Render
    const debtList = document.getElementById('debt-wrapper');
    debtList.innerHTML = '';
    let totalDebt = 0, totalPmt = 0;
    fd.bills.forEach(b => {
        totalDebt += b.balance; totalPmt += b.payment;
        debtList.innerHTML += `
            <div class="crud-item">
                <span></span>
                <span style="font-weight: 600;">${b.name}</span>
                <span>$${b.balance.toLocaleString()}</span>
                <button class="icon-btn" style="color: var(--brand-rose); justify-self: end;" onclick="deleteItem('bills', ${b.id})">
                    <i data-lucide="trash-2" style="width:16px;"></i>
                </button>
            </div>`;
    });
    document.getElementById('total-debt').textContent = `$${totalDebt.toLocaleString()} Total Liability`;
    document.getElementById('debt-months').textContent = totalPmt > 0 ? `${Math.ceil(totalDebt / totalPmt)} Months to Zero` : '0 Months to Zero';

    lucide.createIcons();
}

// --- EVENTS ---
document.getElementById('login-btn').addEventListener('click', async () => {
    const { error } = await supabaseClient.auth.signInWithPassword({ email: document.getElementById('auth-email').value.trim(), password: document.getElementById('auth-password').value });
    if (error) { document.getElementById('auth-error').textContent = error.message; document.getElementById('auth-error').style.display = 'block'; }
});
document.getElementById('signup-btn').addEventListener('click', async () => {
    const { error } = await supabaseClient.auth.signUp({ email: document.getElementById('auth-email').value.trim(), password: document.getElementById('auth-password').value });
    if (error) { document.getElementById('auth-error').textContent = error.message; document.getElementById('auth-error').style.display = 'block'; }
});
document.getElementById('logout-btn').addEventListener('click', () => supabaseClient.auth.signOut());

document.querySelector('.sidebar-nav').addEventListener('click', (e) => { 
    const btn = e.target.closest('.nav-item'); 
    if (btn) { appState.activeTab = btn.dataset.tab; render(); } 
});

document.getElementById('main-assets-input').addEventListener('blur', (e) => syncToCloud({ current_liquid_assets: Number(e.target.value) }));
document.getElementById('main-goal-input').addEventListener('blur', (e) => syncToCloud({ horizon_goal: Number(e.target.value) }));

// CRUD Event Listeners
document.getElementById('add-trans-btn').addEventListener('click', addTransaction);
document.getElementById('add-debt-btn').addEventListener('click', addDebt);

document.querySelectorAll('.decade-btn').forEach(b => b.addEventListener('click', () => syncToCloud({ starting_decade: Number(b.dataset.decade) })));

document.getElementById('run-sim-btn').addEventListener('click', () => {
    document.getElementById('sim-results').style.opacity = '0.3';
    setTimeout(() => {
        const base = appState.financialData.current_liquid_assets || 0;
        document.getElementById('sim-p10').textContent = `$${Math.round(base * 1.4).toLocaleString()}`;
        document.getElementById('sim-p50').textContent = `$${Math.round(base * 1.9).toLocaleString()}`;
        document.getElementById('sim-p90').textContent = `$${Math.round(base * 2.6).toLocaleString()}`;
        document.getElementById('sim-results').style.opacity = '1';
    }, 1000);
});

document.addEventListener('DOMContentLoaded', () => { render(); });
