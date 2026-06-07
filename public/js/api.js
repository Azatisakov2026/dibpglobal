const API_BASE_URL = '/api';

class DIBP_API {
    constructor() {
        this.token = localStorage.getItem('dibp_token') || null;
        this.user = JSON.parse(localStorage.getItem('dibp_user') || 'null');
    }

    async request(endpoint, options = {}) {
        const url = `${API_BASE_URL}${endpoint}`;
        const config = {
            headers: { 'Content-Type': 'application/json', ...(this.token && { Authorization: `Bearer ${this.token}` }) },
            ...options,
        };
        try {
            const response = await fetch(url, config);
            const data = await response.json();
            if (!response.ok) throw new Error(data.message || 'Ошибка запроса');
            return data;
        } catch (error) {
            console.error('API Error:', error.message);
            throw error;
        }
    }

    async register(userData) {
        const data = await this.request('/auth/register', { method: 'POST', body: JSON.stringify(userData) });
        if (data.success && data.data?.token) this.setAuth(data.data.token, data.data);
        return data;
    }

    async login(credentials) {
        const data = await this.request('/auth/login', { method: 'POST', body: JSON.stringify(credentials) });
        if (data.success && data.data?.token) this.setAuth(data.data.token, data.data);
        return data;
    }

    async getProfile() { return await this.request('/auth/me'); }
    async updateProfile(updates) { return await this.request('/auth/profile', { method: 'PUT', body: JSON.stringify(updates) }); }
    async logout() { try { await this.request('/auth/logout', { method: 'POST' }); } catch (e) {} this.clearAuth(); }
    async getBalance() { return await this.request('/finance/balance'); }
    async getRates() { return await this.request('/finance/rates'); }
    async deposit(amount, currency = 'USD', paymentMethod = 'crypto') { return await this.request('/finance/deposit', { method: 'POST', body: JSON.stringify({ amount, currency, paymentMethod }) }); }
    async activateAccount() { return await this.request('/finance/activate', { method: 'POST' }); }
    async withdraw(amount, currency = 'ALTYN', walletAddress = '') { return await this.request('/finance/withdraw', { method: 'POST', body: JSON.stringify({ amount, currency, walletAddress }) }); }
    async getTransactions(page = 1, type = '', status = '') { const params = new URLSearchParams({ page, limit: 20 }); if (type) params.append('type', type); if (status) params.append('status', status); return await this.request(`/finance/transactions?${params.toString()}`); }
    async getProjects(page = 1, filters = {}) { const params = new URLSearchParams({ page, limit: 12, ...filters }); return await this.request(`/projects?${params.toString()}`); }
    async getProjectById(id) { return await this.request(`/projects/${id}`); }
    async investInProject(projectId, amount) { return await this.request(`/projects/${projectId}/invest`, { method: 'POST', body: JSON.stringify({ amount }) }); }
    async getMyInvestments() { return await this.request('/projects/my/investments'); }
    async getMyProjects() { return await this.request('/projects/my/projects'); }
    async createProject(projectData) { return await this.request('/projects', { method: 'POST', body: JSON.stringify(projectData) }); }
    async getPartnerStats() { return await this.request('/partner/stats'); }
    async getL1Partners(page = 1) { return await this.request(`/partner/l1?page=${page}&limit=20`); }
    async getL2Partners(page = 1) { return await this.request(`/partner/l2?page=${page}&limit=20`); }
    async getReferralLink() { return await this.request('/partner/referral-link'); }
    async getMarketingPlan() { return await this.request('/partner/marketing-plan'); }
    async getAdminDashboard() { return await this.request('/admin/dashboard'); }
    async getAdminWithdrawals(status = 'pending') { return await this.request(`/admin/withdrawals?status=${status}`); }
    async approveWithdrawal(id, note = '') { return await this.request(`/admin/withdrawals/${id}/approve`, { method: 'PUT', body: JSON.stringify({ note }) }); }
    async rejectWithdrawal(id, reason = '') { return await this.request(`/admin/withdrawals/${id}/reject`, { method: 'PUT', body: JSON.stringify({ reason }) }); }
    async getAdminUsers(page = 1, search = '') { const params = new URLSearchParams({ page, limit: 20 }); if (search) params.append('search', search); return await this.request(`/admin/users?${params.toString()}`); }
    async makeAdmin(secret, userId) { return await this.request('/admin/make-admin', { method: 'POST', body: JSON.stringify({ secret, userId }) }); }

    setAuth(token, userData) { this.token = token; this.user = userData; localStorage.setItem('dibp_token', token); localStorage.setItem('dibp_user', JSON.stringify(userData)); }
    clearAuth() { this.token = null; this.user = null; localStorage.removeItem('dibp_token'); localStorage.removeItem('dibp_user'); }
    isAuthenticated() { return !!this.token && !!this.user; }
    isActivated() { return this.user?.isActivated || false; }
    isAdmin() { return this.user?.role === 'admin'; }
}

const api = new DIBP_API();