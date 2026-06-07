// ==================== i18n ====================
var translations = {};
var currentLang = 'ru';

function t(key) {
    return (translations && translations[key]) || key;
}

function changeLang(lang) {
    var list = document.getElementById('langList');
    if (list) list.style.display = 'none';
    
    var names = { ru: 'RU', en: 'EN', ua: 'UA', zh: '中文', kg: 'KG', uz: 'UZ' };
    var btn = document.getElementById('langBtn');
    if (btn) btn.innerHTML = '🌐 ' + (names[lang] || lang) + ' ▼';
    
    fetch('/locales/' + lang + '.json')
        .then(function(r) { return r.json(); })
        .then(function(data) {
            translations = data;
            currentLang = lang;
            localStorage.setItem('dibp_lang', lang);
            updatePageTexts();
            updateBurger();
            updateTicker();
        })
        .catch(function(e) {
            console.error('Ошибка перевода:', e);
        });
}

function updatePageTexts() {
    document.querySelectorAll('[data-i18n]').forEach(function(el) {
        var key = el.getAttribute('data-i18n');
        if (translations[key]) el.textContent = translations[key];
    });
}

function toggleLangs() {
    var list = document.getElementById('langList');
    if (list) list.style.display = list.style.display === 'block' ? 'none' : 'block';
}

// Закрытие списка языков при клике вне
document.addEventListener('click', function(e) {
    var list = document.getElementById('langList');
    var btn = document.getElementById('langBtn');
    if (list && btn && !btn.contains(e.target) && !list.contains(e.target)) {
        list.style.display = 'none';
    }
});

// ==================== БЕГУЩАЯ СТРОКА ====================
function updateTicker() {
    var track = document.getElementById('tickerTrack');
    if (!track) return;
    
    var goldRate = window.currentGoldRate || 85.20;
    var altynRate = (goldRate / 1000).toFixed(4);
    var silverRate = window.currentSilverRate || 1.01;
    
    track.innerHTML = 
        '<div class="ticker-item"><i class="fas fa-coins"></i><span>' + t('ticker_gold') + ': <strong class="goldRate">' + goldRate.toFixed(2) + ' USD/гр</strong> | 1 ALTYN = <strong class="altynRate">' + altynRate + ' USD</strong></span></div>' +
        '<div class="ticker-item"><i class="fas fa-coins"></i><span>' + t('ticker_silver') + ': <strong class="silverRate">' + silverRate.toFixed(2) + ' USD/гр</strong></span></div>' +
        '<div class="ticker-item"><i class="fas fa-dollar-sign"></i><span>USD/ALTYN: <strong class="usdAltynRate">' + (1 / parseFloat(altynRate)).toFixed(2) + '</strong></span></div>' +
        '<div class="ticker-item"><i class="fas fa-euro-sign"></i><span>EUR/ALTYN: <strong class="eurAltynRate">' + (1 / (parseFloat(altynRate) * 0.92)).toFixed(2) + '</strong></span></div>' +
        '<div class="ticker-item"><i class="fas fa-gem"></i><span>' + t('ticker_1000_altyn') + '</span></div>' +
        // Дублируем для бесконечной анимации
        '<div class="ticker-item"><i class="fas fa-coins"></i><span>' + t('ticker_gold') + ': <strong class="goldRate">' + goldRate.toFixed(2) + ' USD/гр</strong> | 1 ALTYN = <strong class="altynRate">' + altynRate + ' USD</strong></span></div>' +
        '<div class="ticker-item"><i class="fas fa-coins"></i><span>' + t('ticker_silver') + ': <strong class="silverRate">' + silverRate.toFixed(2) + ' USD/гр</strong></span></div>' +
        '<div class="ticker-item"><i class="fas fa-dollar-sign"></i><span>USD/ALTYN: <strong class="usdAltynRate">' + (1 / parseFloat(altynRate)).toFixed(2) + '</strong></span></div>' +
        '<div class="ticker-item"><i class="fas fa-euro-sign"></i><span>EUR/ALTYN: <strong class="eurAltynRate">' + (1 / (parseFloat(altynRate) * 0.92)).toFixed(2) + '</strong></span></div>' +
        '<div class="ticker-item"><i class="fas fa-gem"></i><span>' + t('ticker_1000_altyn') + '</span></div>';
}

// ==================== ЧАТ ПОДДЕРЖКИ ====================
function showSupportChat() {
    if (!api.isAuthenticated()) {
        showNotif('Войдите в аккаунт', 'info');
        return;
    }
    
    document.getElementById('authForms').innerHTML = `
        <div class="auth-card" style="max-width:600px;">
            <h3 style="text-align:center;">💬 Поддержка</h3>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:15px;">
                <button class="btn btn-outline-gold" onclick="showNewTicket()">🎫 Новый тикет</button>
                <button class="btn btn-outline-gold" onclick="showMyTickets()">📋 Мои тикеты</button>
            </div>
            <div id="supportContent"></div>
            <button class="btn btn-outline-gold btn-block" style="margin-top:15px;" onclick="goBack()">← Назад</button>
        </div>`;
}

function showNewTicket() {
    var c = document.getElementById('supportContent');
    c.innerHTML = `
        <input type="text" id="ticketSubject" placeholder="Тема обращения" style="margin-bottom:10px;">
        <select id="ticketCategory" style="margin-bottom:10px;">
            <option value="general">Общий вопрос</option>
            <option value="finance">Финансы</option>
            <option value="technical">Техническая проблема</option>
            <option value="kyc">Верификация</option>
            <option value="projects">Проекты</option>
            <option value="partnership">Партнёрство</option>
        </select>
        <textarea id="ticketMessage" rows="4" placeholder="Опишите ваш вопрос..." style="resize:vertical;"></textarea>
        <button class="btn btn-gold btn-block" onclick="createTicket()">📤 Отправить</button>`;
}

async function createTicket() {
    var subject = document.getElementById('ticketSubject')?.value?.trim();
    var message = document.getElementById('ticketMessage')?.value?.trim();
    var category = document.getElementById('ticketCategory')?.value;
    
    if (!subject || !message) { showNotif('Заполните тему и сообщение', 'error'); return; }
    
    try {
        var res = await fetch('/api/support', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + api.token },
            body: JSON.stringify({ subject, message, category })
        });
        var r = await res.json();
        if (r.success) { showNotif('✅ ' + r.message, 'success'); showMyTickets(); }
    } catch (e) { showNotif('Ошибка', 'error'); }
}

async function showMyTickets() {
    var c = document.getElementById('supportContent');
    c.innerHTML = '<p style="color:#888;">Загрузка...</p>';
    
    try {
        var res = await fetch('/api/support/my', {
            headers: { 'Authorization': 'Bearer ' + api.token }
        });
        var r = await res.json();
        
        if (r.success && r.data?.length) {
            c.innerHTML = r.data.map(function(t) {
                var statusColor = t.status === 'open' ? '#ff9800' : t.status === 'resolved' ? '#4caf50' : '#888';
                return '<div style="background:#111;padding:12px;border-radius:8px;margin-bottom:8px;cursor:pointer;" onclick="openTicket(\'' + t._id + '\')">' +
                    '<p style="color:#fff;">#' + t._id.toString().slice(-6) + ' — ' + t.subject + '</p>' +
                    '<p style="color:' + statusColor + ';font-size:0.8rem;">' + t.status + ' | ' + new Date(t.updatedAt).toLocaleString('ru-RU') + '</p>' +
                    '</div>';
            }).join('');
        } else {
            c.innerHTML = '<p style="color:#888;text-align:center;">Нет тикетов</p>';
        }
    } catch (e) { c.innerHTML = '<p style="color:#f44;">Ошибка</p>'; }
}

async function openTicket(id) {
    var c = document.getElementById('supportContent');
    
    try {
        var res = await fetch('/api/support/' + id, {
            headers: { 'Authorization': 'Bearer ' + api.token }
        });
        var r = await res.json();
        
        if (r.success) {
            var t = r.data;
            c.innerHTML = '<h4 style="color:#d4af37;">' + t.subject + '</h4>' +
                '<div style="max-height:300px;overflow-y:auto;margin-bottom:10px;">' +
                t.messages.map(function(m) {
                    return '<div style="background:#0a0a0a;padding:8px;border-radius:6px;margin-bottom:5px;">' +
                        '<p style="color:#888;font-size:0.75rem;">' + (m.senderRole === 'admin' ? '👑 Поддержка' : '👤 Вы') + ' — ' + new Date(m.createdAt).toLocaleString('ru-RU') + '</p>' +
                        '<p style="color:#fff;">' + m.message + '</p></div>';
                }).join('') +
                '</div>' +
                '<textarea id="replyMessage" rows="3" placeholder="Ваше сообщение..."></textarea>' +
                '<button class="btn btn-gold btn-block" onclick="replyTicket(\'' + id + '\')">📤 Ответить</button>' +
                '<button class="btn btn-outline-gold btn-block" style="margin-top:5px;" onclick="showMyTickets()">← К списку</button>';
        }
    } catch (e) { c.innerHTML = '<p style="color:#f44;">Ошибка</p>'; }
}

async function replyTicket(id) {
    var message = document.getElementById('replyMessage')?.value?.trim();
    if (!message) { showNotif('Введите сообщение', 'error'); return; }
    
    try {
        var res = await fetch('/api/support/' + id + '/reply', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + api.token },
            body: JSON.stringify({ message })
        });
        var r = await res.json();
        if (r.success) { showNotif('✅ Отправлено', 'success'); openTicket(id); }
    } catch (e) { showNotif('Ошибка', 'error'); }
}

// ==================== ЭКСПОРТ ====================
async function exportTransactions(format) {
    try {
        window.open('/api/export/transactions?format=' + format + '&token=' + api.token, '_blank');
        showNotif('📥 Экспорт начат', 'success');
    } catch (e) { showNotif('Ошибка', 'error'); }
}

// ==================== ПОИСК ПРОЕКТОВ ====================
function addProjectSearch() {
    var searchHtml = '<input type="text" id="projectSearch" placeholder="🔍 Поиск проектов..." style="margin-bottom:15px;" oninput="searchProjects()">';
    var plist = document.getElementById('plist');
    if (plist) {
        plist.insertAdjacentHTML('beforebegin', searchHtml);
    }
}

async function searchProjects() {
    var query = document.getElementById('projectSearch')?.value?.toLowerCase() || '';
    var projects = window.allProjects || [];
    
    var filtered = projects.filter(function(p) {
        return !query || p.title.toLowerCase().includes(query) || 
               (p.shortDescription || '').toLowerCase().includes(query) ||
               (p.category || '').toLowerCase().includes(query);
    });
    
    var el = document.getElementById('plist');
    if (!el) return;
    
    if (filtered.length) {
        el.innerHTML = filtered.map(function(p) {
            return '<div style="background:#111;padding:15px;border-radius:8px;margin-bottom:10px;border:1px solid #2a2a2a;">' +
                '<h4 style="color:#fff;">' + p.title + '</h4>' +
                '<p style="color:#888;font-size:0.8rem;">' + (p.shortDescription||'') + '</p>' +
                '<div style="display:flex;justify-content:space-between;font-size:0.8rem;margin-bottom:10px;">' +
                '<span style="color:#d4af37;">ROI: ' + p.expectedROI + '%</span>' +
                '<span style="color:#888;">Собрано: ' + (p.fundingProgress||0) + '%</span></div>' +
                '<button class="btn btn-gold btn-block btn-sm" onclick="invest(\'' + p._id + '\',\'' + (p.title||'').replace(/'/g,'') + '\')">Инвестировать</button></div>';
        }).join('');
    } else {
        el.innerHTML = '<p style="text-align:center;color:#888;">Ничего не найдено</p>';
    }
}

// Обновлённая showProjects с поиском и кэшированием
async function showProjects() {
    if (!api.user?.isActivated) { showNotif('🔒 Активируйте аккаунт', 'error'); return; }
    
    document.getElementById('authForms').innerHTML = 
        '<div class="auth-card" style="max-width:550px;">' +
        '<h3 style="text-align:center;"><i class="fas fa-project-diagram" style="color:#d4af37;"></i> Доступные проекты</h3>' +
        '<input type="text" id="projectSearch" placeholder="🔍 Поиск по названию, описанию, категории..." style="margin-bottom:15px;" oninput="searchProjects()">' +
        '<div id="plist" style="max-height:400px;overflow-y:auto;"><p style="text-align:center;color:#888;">Загрузка...</p></div>' +
        '<button class="btn btn-outline-gold btn-block" style="margin-top:15px;" onclick="goBack()">← Назад</button></div>';
    
    try {
        var r = await api.getProjects();
        if (r.success && r.data?.length) {
            window.allProjects = r.data;
            searchProjects();
        } else {
            document.getElementById('plist').innerHTML = '<p style="text-align:center;color:#888;">Нет активных проектов</p>';
        }
    } catch (e) {
        document.getElementById('plist').innerHTML = '<p style="text-align:center;color:#f44;">Ошибка загрузки</p>';
    }
}

// ==================== УВЕДОМЛЕНИЕ ОБ ОШИБКАХ ====================
window.addEventListener('error', function(e) {
    console.error('Client error:', e.message);
});

// ==================== ИНИЦИАЛИЗАЦИЯ ====================
document.addEventListener('DOMContentLoaded', function() {
    setTimeout(function() {
        var p = document.getElementById('preloader');
        if (p) p.classList.add('hidden');
    }, 800);

    // Загружаем сохранённый язык
    var savedLang = localStorage.getItem('dibp_lang') || 'ru';
    changeLang(savedLang);

    initBurger();
    initTabs();
    initSlider();
    initHeaderBtns();
    updateRates();
    updateTicker();
    setInterval(updateRates, 60000);
    setInterval(updateTicker, 60000);
    checkAuth();
});