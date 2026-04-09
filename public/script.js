const API_BASE = '';

async function fetchFormSubmissionsBlocked() {
    try {
        const res = await fetch(`${API_BASE}/api/form-status`);
        const j = await res.json().catch(() => ({}));
        return res.ok && j.submissionsBlocked === true;
    } catch {
        return false;
    }
}

function applyFormClosedState(form) {
    const banner = document.getElementById('formClosedBanner');
    if (banner) banner.classList.remove('hidden');
    form.dataset.formClosed = '1';
    form.classList.add('gx-form-root--closed');
    form.querySelectorAll('input, textarea, select, button').forEach((el) => {
        el.disabled = true;
    });
}

function toggleExperienceDetails() {
    const experienceYes = document.querySelector('input[name="experience"][value="oui"]');
    const experienceDetails = document.getElementById('experienceDetails');
    const experienceTextarea = document.querySelector('[name="experienceDetails"]');

    const isYes = experienceYes && experienceYes.checked;
    if (experienceDetails) experienceDetails.classList.toggle('hidden', !isYes);
    if (experienceTextarea) {
        experienceTextarea.required = Boolean(isYes);
        experienceTextarea.setAttribute('aria-required', String(isYes));
    }
}

function previewPostulantPhoto(input) {
    if (input.files && input.files[0]) {
        const reader = new FileReader();
        reader.onload = (e) => {
            const preview = document.getElementById('postulantPhotoPreview');
            if (preview) {
                preview.innerHTML = `<img src="${e.target.result}" alt="Photo du postulant">`;
            }
        };
        reader.readAsDataURL(input.files[0]);
    }
}

function previewCardRecto(input) {
    if (input.files && input.files[0]) {
        const reader = new FileReader();
        reader.onload = (e) => {
            const preview = document.getElementById('cardRectoPreview');
            if (preview) {
                preview.innerHTML = `<img src="${e.target.result}" alt="Carte recto">`;
            }
        };
        reader.readAsDataURL(input.files[0]);
    }
}

function previewCardVerso(input) {
    if (input.files && input.files[0]) {
        const reader = new FileReader();
        reader.onload = (e) => {
            const preview = document.getElementById('cardVersoPreview');
            if (preview) {
                preview.innerHTML = `<img src="${e.target.result}" alt="Carte verso">`;
            }
        };
        reader.readAsDataURL(input.files[0]);
    }
}

function toggleDeliverySection() {
    const deliveryCheckbox = document.querySelector('input[name="position"][value="livreur"]');
    const deliverySection = document.getElementById('deliverySection');
    const transportFileGroup = document.getElementById('transportFileGroup');
    const deliveryFields = [
        ...document.querySelectorAll('input[name="transport"]'),
        ...document.querySelectorAll('input[name="license"]'),
        ...document.querySelectorAll('input[name="weather"]'),
    ];
    const deliveryZone = document.querySelector('input[name="deliveryZone"]');
    const isDelivery = deliveryCheckbox && deliveryCheckbox.checked;

    if (deliverySection) deliverySection.classList.toggle('hidden', !isDelivery);
    if (transportFileGroup) transportFileGroup.classList.toggle('hidden', !isDelivery);

    deliveryFields.forEach((field) => {
        field.required = Boolean(isDelivery);
        field.setAttribute('aria-required', String(isDelivery));
    });

    if (deliveryZone) {
        deliveryZone.required = Boolean(isDelivery);
        deliveryZone.setAttribute('aria-required', String(isDelivery));
    }
}

function toggleAutrePoste() {
    const autreCheckbox = document.querySelector('input[name="position"][value="autre"]');
    const autrePoste = document.getElementById('autrePoste');
    const autrePosteInput = document.querySelector('[name="autrePosteText"]');
    const isOther = autreCheckbox && autreCheckbox.checked;

    if (autrePoste) autrePoste.classList.toggle('hidden', !isOther);

    if (autrePosteInput) {
        autrePosteInput.required = Boolean(isOther);
        autrePosteInput.setAttribute('aria-required', String(isOther));
        if (!isOther) {
            autrePosteInput.value = '';
        }
    }
}

function clearGroupError(target) {
    if (!target) return;
    target.textContent = '';
    target.classList.add('hidden');
    target.removeAttribute('role');
}

function showGroupError(target, message) {
    if (!target) return;
    target.textContent = message;
    target.classList.remove('hidden');
    target.setAttribute('role', 'alert');
}

function focusFirst(elements) {
    const el = elements.find(Boolean);
    if (el) el.focus({ preventScroll: false });
}

async function createApplication(form) {
    const fd = new FormData(form);
    fd.append('submittedAt', new Date().toISOString());

    try {
        const res = await fetch(`${API_BASE}/api/applications`, {
            method: 'POST',
            body: fd,
        });
        const errJson = await res.json().catch(() => ({}));

        if (!res.ok) {
            const msg =
                errJson.error ||
                (Array.isArray(errJson.fields)
                    ? `Champs manquants : ${errJson.fields.join(', ')}`
                    : 'Erreur lors de la soumission');
            const hint = typeof errJson.hint === 'string' && errJson.hint.trim() ? errJson.hint.trim() : '';
            throw new Error(hint ? `${msg}\n\n${hint}` : msg);
        }
        return errJson.data;
    } catch (err) {
        console.error('createApplication error:', err);
        alert(
            err.message && err.message !== '[object Object]'
                ? err.message
                : 'Impossible d’envoyer la candidature. Vérifiez le serveur et votre connexion.'
        );
        return null;
    }
}

function showSuccessMessage() {
    const successDiv = document.createElement('div');
    successDiv.innerHTML = `
        <div class="fixed top-0 left-0 right-0 bottom-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
            <div data-success-dialog tabindex="-1" role="alertdialog" aria-live="assertive" aria-modal="true" class="gx-modal-success rounded-2xl p-8 text-white text-center max-w-md mx-4">
                <div class="text-6xl mb-4" aria-hidden="true">🎉</div>
                <h2 class="text-2xl font-bold mb-2 gradient-text font-heading">Candidature envoyée</h2>
                <p class="mb-6 gx-text-muted text-base">Merci pour votre intérêt pour Green Express. Nous vous recontacterons si votre profil correspond à nos besoins.</p>
                <button type="button" data-reload-btn class="gx-modal-success-btn px-6 py-2 rounded-lg transition-all">
                    Fermer
                </button>
            </div>
        </div>
    `;
    document.body.appendChild(successDiv);
    const dialog = successDiv.querySelector('[data-success-dialog]');
    const reloadBtn = successDiv.querySelector('[data-reload-btn]');
    if (reloadBtn) {
        reloadBtn.addEventListener('click', () => location.reload());
    }
    if (dialog) {
        setTimeout(() => dialog.focus(), 0);
    }
}

function initFormStepNavHighlight() {
    const links = document.querySelectorAll('.form-step-nav__link');
    const steps = document.querySelectorAll('.form-step-anchor');
    if (!links.length || !steps.length) return;

    const observer = new IntersectionObserver(
        (entries) => {
            entries.forEach((entry) => {
                if (!entry.isIntersecting) return;
                const id = entry.target.id;
                links.forEach((a) => {
                    const href = a.getAttribute('href') || '';
                    a.classList.toggle('is-active', href === `#${id}`);
                });
            });
        },
        { rootMargin: '-35% 0px -55% 0px', threshold: 0 }
    );

    steps.forEach((s) => observer.observe(s));
}

document.addEventListener('DOMContentLoaded', async () => {
    const form = document.getElementById('recruitmentForm');
    if (!form) return;

    if (await fetchFormSubmissionsBlocked()) {
        applyFormClosedState(form);
    }

    const previewDefaults = {
        postulant: document.getElementById('postulantPhotoPreview')?.innerHTML || '',
        recto: document.getElementById('cardRectoPreview')?.innerHTML || '',
        verso: document.getElementById('cardVersoPreview')?.innerHTML || '',
    };

    document.querySelectorAll('input[name="position"]').forEach((checkbox) => {
        checkbox.addEventListener('change', () => {
            toggleDeliverySection();
            toggleAutrePoste();
            clearGroupError(document.getElementById('positionsError'));
        });
    });

    document.querySelectorAll('input[name="experience"]').forEach((radio) => {
        radio.addEventListener('change', () => toggleExperienceDetails());
    });

    document.querySelectorAll('input[name="days"]').forEach((checkbox) => {
        checkbox.addEventListener('change', () => {
            if (document.querySelectorAll('input[name="days"]:checked').length > 0) {
                clearGroupError(document.getElementById('daysError'));
            }
        });
    });

    const groupErrors = {
        days: document.getElementById('daysError'),
        positions: document.getElementById('positionsError'),
    };

    form.addEventListener('reset', () => {
        setTimeout(() => {
            toggleExperienceDetails();
            toggleDeliverySection();
            toggleAutrePoste();
            clearGroupError(groupErrors.days);
            clearGroupError(groupErrors.positions);

            form.querySelectorAll('input, textarea, select').forEach((el) => {
                el.classList.remove('ring-2', 'ring-red-500');
                el.removeAttribute('aria-invalid');
            });

            [
                ['postulantPhotoPreview', previewDefaults.postulant],
                ['cardRectoPreview', previewDefaults.recto],
                ['cardVersoPreview', previewDefaults.verso],
            ].forEach(([id, html]) => {
                const node = document.getElementById(id);
                if (node && html) node.innerHTML = html;
            });
        }, 0);
    });

    form.addEventListener('submit', async (e) => {
        if (form.dataset.formClosed === '1') {
            e.preventDefault();
            return;
        }

        clearGroupError(groupErrors.days);
        clearGroupError(groupErrors.positions);

        const checkedDays = document.querySelectorAll('input[name="days"]:checked');
        const checkedPositions = document.querySelectorAll('input[name="position"]:checked');
        let firstErrorEl = null;
        let hasGroupError = false;

        if (checkedDays.length === 0) {
            showGroupError(groupErrors.days, 'Indiquez au moins un jour où vous êtes disponible.');
            firstErrorEl = firstErrorEl || document.querySelector('input[name="days"]');
            hasGroupError = true;
        }

        if (checkedPositions.length === 0) {
            showGroupError(groupErrors.positions, 'Cochez au moins un poste.');
            firstErrorEl = firstErrorEl || document.querySelector('input[name="position"]');
            hasGroupError = true;
        }

        const nativeValid = form.reportValidity();

        if (hasGroupError || !nativeValid) {
            e.preventDefault();
            focusFirst([firstErrorEl]);
            return;
        }

        e.preventDefault();

        const submitBtn = document.getElementById('submitApplicationBtn');
        const prevLabel = submitBtn ? submitBtn.textContent : '';
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.textContent = 'Envoi en cours…';
        }

        const saved = await createApplication(form);

        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = prevLabel || 'Envoyer ma candidature';
        }

        if (!saved) return;
        showSuccessMessage();
    });

    toggleExperienceDetails();
    toggleDeliverySection();
    toggleAutrePoste();
    initFormStepNavHighlight();

    document
        .querySelectorAll(
            'input[type="text"], input[type="email"], input[type="tel"], input[type="number"], input[type="date"], textarea, select'
        )
        .forEach((input) => {
            input.addEventListener('blur', () => {
                const isEmpty = input.value.trim() === '' && input.hasAttribute('required');
                input.classList.toggle('ring-2', isEmpty);
                input.classList.toggle('ring-red-500', isEmpty);
                input.setAttribute('aria-invalid', String(isEmpty));
            });
            input.addEventListener('focus', () => {
                input.classList.remove('ring-2', 'ring-red-500');
                input.removeAttribute('aria-invalid');
            });
        });
});
