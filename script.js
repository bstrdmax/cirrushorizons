/**
 * CIRRUS HORIZONS - FULL ENGINE
 * Every tab is now a working calculator synced to Supabase.
 */

const SUPABASE_URL = 'https://tdgudmnrqhlkwefthdat.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRkZ3VkbW5ycWhsa3dlZnRoZGF0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUyMTI5MjksImV4cCI6MjA5MDc4ODkyOX0.Rlr-BS4x_WyMTiRBTFGQdddV8b0dtKfNzKBz1YOsJLo'; 

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// --- STATE MANAGEMENT ---
let appState = {
    activeTab: 'dashboard',
    theme: 'dark', 
    user: null, 
    isSimulating: false,
    financialData: {
        current_liquid_assets: 0,
        horizon_goal: 0,
        monthly_income: 0,
        monthly_expenses: 0,
        total_debt: 0,
        monthly_debt_payment: 0
    }
};

// --- AUTH & SYNC ---
supabaseClient.auth.onAuthStateChange(async (event, session) => {
    if (session && session.user) {
        appState.user = session.user;
        await fetchUserFinancials(session.user.id);
    } else {
        appState.user = null;
        render(); 
    }
});

async function fetchUserFinancials(userId) {
    try {
        const { data, error } = await supabaseClient.from('profiles').select('*').eq('id', userId).single();
        if (error && error.code !== 'PGRST116') throw error; 
        if (data) {
            appState.financialData = { ...appState.financialData, ...data };
        }
        render();
    } catch (error) {
        console.error("Fetch Error:", error.message);
        render();
    }
}

async function syncToCloud(updates) {
    if (!appState.user) return;
    
    // Optimistic UI Update
    appState.financialData = { ...appState.financialData, ...updates };
    render();

    try {
        const { error } = await supabaseClient.from('profiles').upsert({ id: appState.user.id, ...updates });
        if (error) throw error;
    } catch (err) {
        console.error("Sync Error:", err.message);
    }
}

// --- ALGORITHMS ---

// Monte Carlo Math (Deterministic Mock for 10 years)
function runProjection(currentAssets) {
    const base = Number(currentAssets) || 0;
    // P10 = 4% growth, P50 = 7% growth, P90 = 10% growth over 10 years
    const p10 = base * Math.pow(1.04, 10);
    const p50 = base * Math.pow(1.07, 10);
    const p90 = base * Math.pow(1.10, 10);
    
    return {
        p10: Math.round(p10),
        p50: Math.round(p50),
        p90: Math.round(p90)
    };
}

// Formatting Helper
const formatCurrency = (num) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(num);
};

// --- RENDER LOGIC ---
function render() {
    const fd = appState.financialData;

    // 1. Auth Overlay
    if (!appState.user) {
        document.getElementById('auth-overlay').classList.add('active');
        document.getElementById('app-container').style.display = 'none';
        return; 
    } else {
        document.getElementById('auth-overlay').classList.remove('active');
        document.getElementById('app-container').style.display = 'flex';
        document.getElementById('user-avatar').textContent = appState.user.email.charAt(0).toUpperCase();
    }

    // 2. Theme
    const wrapper = document.getElementById('cirrus-horizons-wrapper');
    const themeIcon = document.getElementById('theme-icon');
    if (appState.theme === 'dark') {
        wrapper.classList.add('dark-theme');
        themeIcon.setAttribute('data-lucide', 'sun');
    } else {
        wrapper.classList.remove('dark-theme');
        themeIcon.setAttribute('data-lucide', 'moon');
    }

    // 3. Tab Routing
    document.querySelectorAll('.nav-item').forEach(nav => {
        nav.classList.toggle('active', nav.getAttribute('data-tab') === appState.activeTab);
    });
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
    document.getElementById(appState.activeTab).classList.add('active');

    // 4. Update Inputs (Only if they aren't currently focused to prevent cursor jumping)
    if (document.activeElement.id !== 'liquid-assets-input') document.getElementById('liquid-assets-input').value = fd.current_liquid_assets || '';
    if (document.activeElement.id !== 'horizon-goal-input') document.getElementById('horizon-goal-input').value = fd.horizon_goal || '';
    if (document.activeElement.id !== 'income-input') document.getElementById('income-input').value = fd.monthly_income || '';
    if (document.activeElement.id !== 'expenses-input') document.getElementById('expenses-input').value = fd.monthly_expenses || '';
    if (document.activeElement.id !== 'debt-total-input') document.getElementById('debt-total-input').value = fd.total_debt || '';
    if (document.activeElement.id !== 'debt-payment-input') document.getElementById('debt-payment-input').value = fd.monthly_debt_payment || '';

    // 5. Calculators Execution
    
    // -> Dashboard: Goal Progress
    let progress = fd.horizon_goal > 0 ? ((fd.current_liquid_assets / fd.horizon_goal) * 100) : 0;
    document.getElementById('goal-progress-fill').style.width = `${Math.min(progress, 100)}%`;
    document.getElementById('progress-percentage').textContent = `${Math.min(Math.round(progress), 100)}%`;

    // -> Budget: Cashflow
    let cashflow = (fd.monthly_income || 0) - (fd.monthly_expenses || 0);
    document.getElementById('cashflow-result').textContent = formatCurrency(cashflow);
    document.getElementById('cashflow-result').className = cashflow >= 0 ? "text-3xl font-extrabold text-emerald mt-1" : "text-3xl font-extrabold text-rose mt-1";

    // -> Debt: Time to Zero
    let debtTime = "0 Months";
    if (fd.total_debt > 0 && fd.monthly_debt_payment > 0) {
        let months = Math.ceil(fd.total_debt / fd.monthly_debt_payment);
        debtTime = `${months} Months (${(months/12).toFixed(1)} Years)`;
    } else if (fd.total_debt > 0 && fd.monthly_debt_payment === 0) {
        debtTime = "Infinite (No Payment)";
    }
    document.getElementById('debt-time-result').textContent = debtTime;

    // -> Simulations: Button State
    const simNormal = document.getElementById('sim-icon-normal');
    const simLoading = document.getElementById('sim-icon-loading');
    const resultsPanel = document.getElementById('sim-results');
    
    if (appState.isSimulating) {
        simNormal.style.display = 'none';
        simLoading.style.display = 'block';
        resultsPanel.style.opacity = '0.3';
    } else {
        simNormal.style.display = 'block';
        simLoading.style.display = 'none';
    }

    lucide.createIcons();
}

// --- EVENTS ---
function bindEvents() {
    // Auth
    document.getElementById('signup-btn').addEventListener('click', async () => {
        const email = document.getElementById('auth-email').value.trim();
        const password = document.getElementById('auth-password').value;
        const errorEl = document.getElementById('auth-error');
        errorEl.style.display = 'none';
        
        const { error } = await supabaseClient.auth.signUp({ email, password });
        if (error) { errorEl.textContent = error.message; errorEl.style.display = 'block'; }
    });

    document.getElementById('login-btn').addEventListener('click', async () => {
        const email = document.getElementById('auth-email').value.trim();
        const password = document.getElementById('auth-password').value;
        const errorEl = document.getElementById('auth-error');
        errorEl.style.display = 'none';
        
        const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
        if (error) { errorEl.textContent = error.message; errorEl.style.display = 'block'; }
    });

    document.getElementById('logout-btn').addEventListener('click', async () => {
        await supabaseClient.auth.signOut();
    });

    // Theme & Nav
    document.getElementById('theme-toggle').addEventListener('click', () => {
        appState.theme = appState.theme === 'light' ? 'dark' : 'light';
        render();
    });

    document.querySelector('.sidebar-nav').addEventListener('click', (e) => {
        const navItem = e.target.closest('.nav-item');
        if (navItem) {
            appState.activeTab = navItem.getAttribute('data-tab');
            render();
        }
    });

    // Data Syncing (Inputs sync to Supabase when user clicks away)
    const inputs = [
        { id: 'liquid-assets-input', key: 'current_liquid_assets' },
        { id: 'horizon-goal-input', key: 'horizon_goal' },
        { id: 'income-input', key: 'monthly_income' },
        { id: 'expenses-input', key: 'monthly_expenses' },
        { id: 'debt-total-input', key: 'total_debt' },
        { id: 'debt-payment-input', key: 'monthly_debt_payment' }
    ];

    inputs.forEach(inputObj => {
        document.getElementById(inputObj.id).addEventListener('blur', (e) => {
            let update = {};
            update[inputObj.key] = Number(e.target.value) || 0;
            syncToCloud(update);
        });
    });

    // Simulation Trigger
    document.getElementById('run-sim-btn').addEventListener('click', () => {
        if (appState.isSimulating) return; 
        
        appState.isSimulating = true;
        render();
        
        // Simulating 1.5 seconds of heavy "math"
        setTimeout(() => {
            const projections = runProjection(appState.financialData.current_liquid_assets);
            document.getElementById('sim-p10').textContent = formatCurrency(projections.p10);
            document.getElementById('sim-p50').textContent = formatCurrency(projections.p50);
            document.getElementById('sim-p90').textContent = formatCurrency(projections.p90);
            
            appState.isSimulating = false;
            render();
            
            // Fade results in
            document.getElementById('sim-results').style.opacity = '1';
        }, 1500);
    });
}

document.addEventListener('DOMContentLoaded', () => {
    bindEvents();
    lucide.createIcons();
});