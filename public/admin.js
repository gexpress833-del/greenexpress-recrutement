const API_BASE = '';
const ADMIN_JWT_KEY = 'gx_admin_jwt';

let adminApplications = [];
let adminPdfDetailId = null;
let adminFormGateSyncing = false;

function getAdminToken() {
    return sessionStorage.getItem(ADMIN_JWT_KEY);
}

function adminAuthHeaders() {
    const t = getAdminToken();
    return t ? { Authorization: `Bearer ${t}` } : {};
}

function showLoginScreen() {
    document.body.classList.remove('admin-body--dashboard');
    document.getElementById('adminLoginScreen')?.classList.remove('hidden');
    document.getElementById('adminDashboard')?.classList.add('hidden');
}

function showDashboard() {
    document.body.classList.add('admin-body--dashboard');
    document.getElementById('adminLoginScreen')?.classList.add('hidden');
    document.getElementById('adminDashboard')?.classList.remove('hidden');
}

function logoutAdmin() {
    sessionStorage.removeItem(ADMIN_JWT_KEY);
    document.getElementById('adminDetail')?.classList.add('hidden');
    showLoginScreen();
}

async function handleAdminLogin(event) {
    event.preventDefault();
    const email = document.getElementById('adminEmail')?.value?.trim() || '';
    const password = document.getElementById('adminPassword')?.value || '';
    const errorEl = document.getElementById('adminLoginError');

    try {
        const res = await fetch(`${API_BASE}/api/admin/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password }),
        });
        const json = await res.json().catch(() => ({}));

        if (!res.ok) {
            if (errorEl) {
                errorEl.textContent = json.error || 'Identifiants invalides.';
                errorEl.classList.remove('hidden');
            }
            return;
        }

        if (json.token) {
            sessionStorage.setItem(ADMIN_JWT_KEY, json.token);
        }

        if (errorEl) errorEl.classList.add('hidden');

        showDashboard();
        await Promise.all([loadApplications(), refreshFormGateUi()]);
    } catch {
        if (errorEl) {
            errorEl.textContent = 'Impossible de joindre le serveur.';
            errorEl.classList.remove('hidden');
        }
    }
}

async function loadApplications() {
    const tbody = document.getElementById('adminTableBody');
    if (tbody) {
        tbody.innerHTML =
            '<tr><td colspan="5" class="admin-table-msg">Chargement…</td></tr>';
    }

    const data = await fetchApplications();
    if (data === undefined) {
        showLoginScreen();
        return;
    }
    if (data) {
        adminApplications = data;
        renderSubmissions();
    } else if (tbody) {
        tbody.innerHTML =
            '<tr><td colspan="5" class="admin-table-msg admin-table-msg--error">Impossible de charger les candidatures (connexion ou session).</td></tr>';
    }
}

function renderList(arr) {
    if (Array.isArray(arr)) return arr.join(', ');
    return arr || '—';
}

function renderSubmissions() {
    const tbody = document.getElementById('adminTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (!adminApplications || adminApplications.length === 0) {
        tbody.innerHTML =
            '<tr><td colspan="5" class="admin-table-msg">Aucune candidature pour l’instant.</td></tr>';
        return;
    }

    adminApplications.forEach((item) => {
        const tr = document.createElement('tr');
        const positions = Array.isArray(item.position) ? item.position : [];
        const days = Array.isArray(item.days) ? item.days : [];

        const mkTd = (text, extraClass) => {
            const td = document.createElement('td');
            td.className = `admin-table-cell ${extraClass || ''}`.trim();
            td.textContent = text;
            return td;
        };

        tr.appendChild(mkTd(item.submitted_at || item.submittedAt || '—', ''));
        tr.appendChild(mkTd(item.full_name || item.fullName || '—', 'admin-table-cell--strong'));
        tr.appendChild(mkTd(positions.join(', ') || '—', ''));
        tr.appendChild(mkTd(days.join(', ') || '—', ''));

        const tdAct = document.createElement('td');
        tdAct.className = 'admin-table-cell';
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'gx-btn-table';
        btn.dataset.detailId = String(item.id);
        btn.textContent = 'Détails';
        tdAct.appendChild(btn);
        tr.appendChild(tdAct);

        tbody.appendChild(tr);
    });
}

function appendTextBlock(container, label, value) {
    const p = document.createElement('p');
    p.className = 'gx-detail-row';
    const labelEl = document.createElement('span');
    labelEl.className = 'gx-detail-label';
    labelEl.textContent = `${label} : `;
    const valueEl = document.createElement('span');
    valueEl.className = 'gx-detail-value';
    valueEl.textContent = value == null || value === '' ? '—' : String(value);
    p.appendChild(labelEl);
    p.appendChild(valueEl);
    container.appendChild(p);
}

function appendImageBlock(container, label, url, alt) {
    const heading = document.createElement('p');
    heading.className = 'gx-detail-row gx-detail-row--media';
    const labelEl = document.createElement('span');
    labelEl.className = 'gx-detail-label';
    labelEl.textContent = label;
    heading.appendChild(labelEl);
    container.appendChild(heading);
    if (!url) return;
    const img = document.createElement('img');
    img.src = url;
    img.alt = alt;
    img.className = 'gx-detail-img';
    img.loading = 'lazy';
    container.appendChild(img);
}

function appendLinkBlock(container, label, url, linkText) {
    const p = document.createElement('p');
    p.className = 'gx-detail-row';
    const labelEl = document.createElement('span');
    labelEl.className = 'gx-detail-label';
    labelEl.textContent = `${label} : `;
    p.appendChild(labelEl);
    if (url) {
        const a = document.createElement('a');
        a.href = url;
        a.textContent = linkText;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        a.className = 'gx-detail-link';
        p.appendChild(a);
    } else {
        const valueEl = document.createElement('span');
        valueEl.className = 'gx-detail-value';
        valueEl.textContent = '—';
        p.appendChild(valueEl);
    }
    container.appendChild(p);
}

function showAdminDetail(id) {
    const detail = document.getElementById('adminDetail');
    const content = document.getElementById('adminDetailContent');
    if (!detail || !content) return;
    const item = adminApplications.find((s) => `${s.id}` === `${id}`);
    if (!item) return;

    content.innerHTML = '';

    appendTextBlock(content, 'Nom', item.full_name || item.fullName);
    appendTextBlock(content, 'Âge', item.age);
    appendTextBlock(content, 'Sexe', item.gender);
    appendTextBlock(content, 'Adresse', item.address);
    appendTextBlock(content, 'WhatsApp', item.whatsapp);
    appendTextBlock(content, 'Email', item.email);
    appendTextBlock(content, 'Postes', renderList(item.position));
    appendTextBlock(content, 'Autre poste', item.autre_poste_text || item.autrePosteText);
    appendTextBlock(content, 'Disponibilité horaires', item.availability);
    appendTextBlock(content, 'Jours', renderList(item.days));
    appendTextBlock(content, 'Autre emploi', item.other_job || item.otherJob);
    appendTextBlock(content, 'Expérience', item.experience);
    appendTextBlock(content, 'Détails expérience', item.experience_details || item.experienceDetails);
    appendTextBlock(content, 'Compétences', item.skills);
    appendTextBlock(content, 'Smartphone / ordinateur', item.smartphone);
    appendTextBlock(content, 'Langues', renderList(item.languages));
    appendTextBlock(content, 'Moyen de transport', item.transport);
    appendTextBlock(content, 'Permis', item.license);
    appendTextBlock(content, 'Conditions météo', item.weather);
    appendTextBlock(content, 'Zone de livraison', item.delivery_zone || item.deliveryZone);
    appendTextBlock(content, 'Motivation', item.motivation);
    appendTextBlock(content, 'Connu via', item.discovery);
    appendTextBlock(content, 'Valeur marque', item.motto);
    appendTextBlock(content, 'Client mécontent', item.client_service || item.clientService);

    appendImageBlock(content, 'Photo du postulant', item.postulant_photo_url, 'Photo postulant');
    appendImageBlock(content, 'Carte recto', item.card_recto_url, 'Recto');
    appendImageBlock(content, 'Carte verso', item.card_verso_url, 'Verso');
    appendImageBlock(content, 'Photo transport', item.transport_photo_url, 'Transport');

    appendLinkBlock(content, 'CV', item.cv_url, 'Ouvrir le CV');

    appendTextBlock(content, 'Signature', item.signature_name || item.signatureName);
    appendTextBlock(content, 'Date', item.date_signed || item.date);
    appendTextBlock(content, 'Déclaration', (item.declaration ?? false) ? 'Oui' : 'Non');
    appendTextBlock(content, 'Soumis le', item.submitted_at || item.submittedAt);

    adminPdfDetailId = String(item.id);
    detail.classList.remove('hidden');
}

function hideAdminDetail() {
    adminPdfDetailId = null;
    document.getElementById('adminDetail')?.classList.add('hidden');
}

async function exportAdminPdf() {
    const id = adminPdfDetailId;
    if (!id) return;
    const token = getAdminToken();
    if (!token) {
        showLoginScreen();
        return;
    }
    try {
        const res = await fetch(
            `${API_BASE}/api/application-pdf?id=${encodeURIComponent(id)}`,
            { headers: { ...adminAuthHeaders() } }
        );
        if (res.status === 401) {
            sessionStorage.removeItem(ADMIN_JWT_KEY);
            showLoginScreen();
            return;
        }
        if (!res.ok) {
            const j = await res.json().catch(() => ({}));
            alert(j.error || 'Impossible de générer le PDF.');
            return;
        }
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `GreenExpress-candidat-${id}.pdf`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
    } catch (e) {
        console.error('exportAdminPdf', e);
        alert('Erreur réseau lors du téléchargement du PDF.');
    }
}

async function refreshFormGateUi() {
    const toggle = document.getElementById('adminFormGateToggle');
    const statusEl = document.getElementById('adminFormGateStatus');
    const errEl = document.getElementById('adminFormGateError');
    if (!toggle || !statusEl) return;
    if (errEl) errEl.classList.add('hidden');
    try {
        const res = await fetch(`${API_BASE}/api/form-status`);
        const j = await res.json().catch(() => ({}));
        const blocked = res.ok && j.submissionsBlocked === true;
        adminFormGateSyncing = true;
        toggle.checked = blocked;
        adminFormGateSyncing = false;
        statusEl.textContent = blocked
            ? 'Statut : formulaire fermé au public.'
            : 'Statut : formulaire ouvert — les candidatures sont acceptées.';
    } catch {
        statusEl.textContent = 'Impossible de lire le statut du formulaire.';
    }
}

async function commitFormGate(blocked) {
    const errEl = document.getElementById('adminFormGateError');
    const toggle = document.getElementById('adminFormGateToggle');
    const statusEl = document.getElementById('adminFormGateStatus');
    if (errEl) errEl.classList.add('hidden');
    try {
        const res = await fetch(`${API_BASE}/api/admin/form-status`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', ...adminAuthHeaders() },
            body: JSON.stringify({ blocked }),
        });
        const j = await res.json().catch(() => ({}));
        if (res.status === 401) {
            sessionStorage.removeItem(ADMIN_JWT_KEY);
            showLoginScreen();
            return;
        }
        if (!res.ok) {
            if (errEl) {
                errEl.textContent = j.error || 'Mise à jour impossible.';
                errEl.classList.remove('hidden');
            }
            await refreshFormGateUi();
            return;
        }
        const b = j.submissionsBlocked === true;
        adminFormGateSyncing = true;
        if (toggle) toggle.checked = b;
        adminFormGateSyncing = false;
        if (statusEl) {
            statusEl.textContent = b
                ? 'Statut : formulaire fermé au public.'
                : 'Statut : formulaire ouvert — les candidatures sont acceptées.';
        }
    } catch {
        if (errEl) {
            errEl.textContent = 'Erreur réseau.';
            errEl.classList.remove('hidden');
        }
        await refreshFormGateUi();
    }
}

async function fetchApplications() {
    try {
        const res = await fetch(`${API_BASE}/api/applications`, {
            headers: { ...adminAuthHeaders() },
        });
        if (res.status === 401) {
            sessionStorage.removeItem(ADMIN_JWT_KEY);
            return undefined;
        }
        if (!res.ok) throw new Error('Erreur chargement');
        const json = await res.json();
        return json.data || [];
    } catch (err) {
        console.error('fetchApplications error:', err);
        return null;
    }
}

window.logoutAdmin = logoutAdmin;
window.hideAdminDetail = hideAdminDetail;
window.exportAdminPdf = exportAdminPdf;

document.addEventListener('DOMContentLoaded', () => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('logout') === '1') {
        sessionStorage.removeItem(ADMIN_JWT_KEY);
        window.history.replaceState({}, '', window.location.pathname);
    }

    const form = document.getElementById('adminLoginForm');
    if (form) {
        form.addEventListener('submit', handleAdminLogin);
    }

    const tbody = document.getElementById('adminTableBody');
    if (tbody) {
        tbody.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-detail-id]');
            if (btn) showAdminDetail(btn.getAttribute('data-detail-id'));
        });
    }

    const gateToggle = document.getElementById('adminFormGateToggle');
    if (gateToggle) {
        gateToggle.addEventListener('change', (e) => {
            if (adminFormGateSyncing) return;
            commitFormGate(Boolean(e.target.checked));
        });
    }

    if (getAdminToken()) {
        showDashboard();
        Promise.all([loadApplications(), refreshFormGateUi()]);
    } else {
        showLoginScreen();
    }
});
