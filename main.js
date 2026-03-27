// main.js
import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut } from 'firebase/auth';
import { getFirestore, doc, getDoc, setDoc, updateDoc, increment } from 'firebase/firestore';

const firebaseConfig = {
    apiKey: "AIzaSyCsGNZ5JyzagqwEEYjkOu9Ch6U0QRf6stc",
    authDomain: "nagibrokerai-107b0.firebaseapp.com",
    projectId: "nagibrokerai-107b0",
    storageBucket: "nagibrokerai-107b0.firebasestorage.app",
    messagingSenderId: "45883710254",
    appId: "1:45883710254:web:1d6d8b330abf6cc07878bf",
    measurementId: "G-FRN86VXEPC"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();

let currentUser = null;

async function ensureUserDocument(user) {
    const userRef = doc(db, 'instantSalesUsers', user.uid);
    const snap = await getDoc(userRef);
    if (!snap.exists()) {
        await setDoc(userRef, {
            email: user.email,
            createdAt: new Date(),
            credits: 0
        });
    }
    return userRef;
}

async function getUserCredits(userId) {
    const userRef = doc(db, 'instantSalesUsers', userId);
    const snap = await getDoc(userRef);
    return snap.exists() ? snap.data().credits || 0 : 0;
}

// ========== PÁGINA INDEX ==========
if (window.location.pathname.endsWith('index.html') || window.location.pathname === '/' || window.location.pathname === '') {
    const loginBtn = document.getElementById('login-btn');
    const heroLoginBtn = document.getElementById('hero-login-btn');
    const logoutBtn = document.getElementById('logout-btn');
    const userInfoDiv = document.getElementById('user-info');
    const userNameSpan = document.getElementById('user-name');

    heroLoginBtn.addEventListener('click', () => loginBtn.click());

    loginBtn.addEventListener('click', async () => {
        try {
            await signInWithPopup(auth, provider);
            window.location.href = 'dashboard.html';
        } catch (error) {
            alert('Erro ao fazer login: ' + error.message);
        }
    });

    logoutBtn.addEventListener('click', async () => {
        await signOut(auth);
        updateAuthUI(null);
    });

    function updateAuthUI(user) {
        if (user) {
            loginBtn.style.display = 'none';
            userInfoDiv.style.display = 'flex';
            userNameSpan.textContent = user.displayName || user.email;
        } else {
            loginBtn.style.display = 'inline-block';
            userInfoDiv.style.display = 'none';
        }
    }

    function renderPayPalButtons() {
        if (!window.paypal) return;
        const plans = [
            { id: '19.90', amount: '19.90', credits: 20 },
            { id: '49.90', amount: '49.90', credits: 60 },
            { id: '199.00', amount: '199.00', credits: 300 }
        ];
        plans.forEach(plan => {
            const container = document.getElementById(`paypal-${plan.id}`);
            if (!container) return;
            container.innerHTML = '';
            paypal.Buttons({
                createOrder: (data, actions) => {
                    if (!currentUser) {
                        alert('Você precisa estar logado para comprar créditos.');
                        return Promise.reject();
                    }
                    return actions.order.create({
                        purchase_units: [{
                            amount: { value: plan.amount }
                        }]
                    });
                },
                onApprove: async (data, actions) => {
                    container.innerHTML = '<p>Processando...</p>';
                    try {
                        const response = await fetch('/api/verify-payment', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                orderID: data.orderID,
                                planID: plan.id,
                                userUID: currentUser.uid,
                                credits: plan.credits
                            })
                        });
                        const result = await response.json();
                        if (result.success) {
                            alert(`Pagamento confirmado! ${plan.credits} créditos adicionados.`);
                            // Atualizar créditos na interface se visível
                            const creditsElem = document.querySelector('#user-info .credits-badge');
                            if (creditsElem) {
                                const newCredits = await getUserCredits(currentUser.uid);
                                creditsElem.textContent = newCredits;
                            }
                        } else {
                            alert('Falha na verificação: ' + (result.error || 'Erro desconhecido'));
                        }
                    } catch (error) {
                        alert('Erro ao verificar pagamento: ' + error.message);
                    } finally {
                        renderPayPalButtons();
                    }
                },
                onError: (err) => {
                    alert('Erro no PayPal: ' + err.message);
                }
            }).render(container);
        });
    }

    onAuthStateChanged(auth, async (user) => {
        currentUser = user;
        updateAuthUI(user);
        if (user) {
            await ensureUserDocument(user);
            renderPayPalButtons();
        } else {
            const plans = ['19.90', '49.90', '199.00'];
            plans.forEach(pid => {
                const container = document.getElementById(`paypal-${pid}`);
                if (container) container.innerHTML = '<p style="color:gray;">Faça login para comprar</p>';
            });
        }
    });
}

// ========== PÁGINA DASHBOARD ==========
if (window.location.pathname.endsWith('dashboard.html')) {
    const logoutBtn = document.getElementById('logout-btn');
    const userNameSpan = document.getElementById('user-name');
    const creditsSpan = document.getElementById('credits-amount');
    const generateBtn = document.getElementById('generate-btn');
    const generatorForm = document.getElementById('generator-form');
    const outputBox = document.getElementById('generation-output');
    const generatedHtmlDiv = document.getElementById('generated-html');
    const copyBtn = document.getElementById('copy-html');
    const showBuyCreditsBtn = document.getElementById('show-buy-credits');
    const modal = document.getElementById('buy-credits-modal');
    const closeModal = document.querySelector('.close');
    const productInput = document.getElementById('product-name');
    const audienceInput = document.getElementById('target-audience');
    const offerInput = document.getElementById('offer');
    const costPreview = document.getElementById('cost-preview');

    // Calcular custo estimado
    function calculateCost() {
        const product = productInput.value;
        const audience = audienceInput.value;
        const offer = offerInput.value;
        const totalChars = (product + audience + offer).length;
        let cost = 1 + Math.floor(totalChars / 500);
        if (cost > 5) cost = 5;
        if (totalChars === 0) cost = 0;
        return cost;
    }

    function updateCostPreview() {
        const cost = calculateCost();
        if (cost > 0) {
            costPreview.textContent = `Custo estimado: ${cost} crédito${cost > 1 ? 's' : ''}`;
        } else {
            costPreview.textContent = '';
        }
    }

    productInput.addEventListener('input', updateCostPreview);
    audienceInput.addEventListener('input', updateCostPreview);
    offerInput.addEventListener('input', updateCostPreview);
    updateCostPreview();

    logoutBtn.addEventListener('click', async () => {
        await signOut(auth);
        window.location.href = 'index.html';
    });

    showBuyCreditsBtn.addEventListener('click', () => {
        modal.style.display = 'flex';
    });
    closeModal.addEventListener('click', () => {
        modal.style.display = 'none';
    });
    window.addEventListener('click', (e) => {
        if (e.target === modal) modal.style.display = 'none';
    });

    async function updateCreditsDisplay(userId) {
        const credits = await getUserCredits(userId);
        creditsSpan.textContent = credits;
        generateBtn.disabled = credits <= 0;
        if (credits <= 0) {
            generateBtn.title = 'Você não tem créditos suficientes. Compre mais.';
        } else {
            generateBtn.title = '';
        }
    }

    generatorForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!currentUser) return;

        const credits = await getUserCredits(currentUser.uid);
        const cost = calculateCost();
        if (credits < cost) {
            alert(`Você precisa de ${cost} créditos para gerar esta página. Seu saldo atual: ${credits}`);
            return;
        }

        const product = productInput.value;
        const audience = audienceInput.value;
        const offer = offerInput.value;
        const color = document.getElementById('color').value;

        generateBtn.disabled = true;
        generateBtn.textContent = 'Gerando...';

        try {
            const response = await fetch('/api/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    product,
                    audience,
                    offer,
                    color,
                    userUID: currentUser.uid,
                    cost // enviar custo calculado para subtração
                })
            });
            const data = await response.json();
            if (data.success) {
                generatedHtmlDiv.innerHTML = data.html;
                outputBox.style.display = 'block';
                await updateCreditsDisplay(currentUser.uid);
                // Limpar formulário? Opcional
            } else {
                alert('Erro: ' + (data.error || 'Falha na geração'));
            }
        } catch (error) {
            alert('Erro na requisição: ' + error.message);
        } finally {
            generateBtn.disabled = false;
            generateBtn.textContent = 'Gerar página (1-5 créditos)';
        }
    });

    copyBtn.addEventListener('click', () => {
        const html = generatedHtmlDiv.innerHTML;
        navigator.clipboard.writeText(html).then(() => {
            alert('HTML copiado para a área de transferência!');
        }).catch(() => {
            alert('Falha ao copiar.');
        });
    });

    onAuthStateChanged(auth, async (user) => {
        if (user) {
            currentUser = user;
            userNameSpan.textContent = user.displayName || user.email;
            await ensureUserDocument(user);
            await updateCreditsDisplay(user.uid);
            renderPayPalButtonsModal();
        } else {
            window.location.href = 'index.html';
        }
    });

    function renderPayPalButtonsModal() {
        if (!window.paypal) return;
        const plans = [
            { id: '19.90', amount: '19.90', credits: 20 },
            { id: '49.90', amount: '49.90', credits: 60 },
            { id: '199.00', amount: '199.00', credits: 300 }
        ];
        plans.forEach(plan => {
            const container = document.getElementById(`modal-paypal-${plan.id}`);
            if (!container) return;
            container.innerHTML = '';
            paypal.Buttons({
                createOrder: (data, actions) => {
                    if (!currentUser) {
                        alert('Você precisa estar logado para comprar créditos.');
                        return Promise.reject();
                    }
                    return actions.order.create({
                        purchase_units: [{
                            amount: { value: plan.amount }
                        }]
                    });
                },
                onApprove: async (data, actions) => {
                    container.innerHTML = '<p>Processando...</p>';
                    try {
                        const response = await fetch('/api/verify-payment', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                orderID: data.orderID,
                                planID: plan.id,
                                userUID: currentUser.uid,
                                credits: plan.credits
                            })
                        });
                        const result = await response.json();
                        if (result.success) {
                            alert(`Pagamento confirmado! ${plan.credits} créditos adicionados.`);
                            await updateCreditsDisplay(currentUser.uid);
                            modal.style.display = 'none';
                        } else {
                            alert('Falha na verificação: ' + (result.error || 'Erro desconhecido'));
                        }
                    } catch (error) {
                        alert('Erro ao verificar pagamento: ' + error.message);
                    } finally {
                        renderPayPalButtonsModal();
                    }
                },
                onError: (err) => {
                    alert('Erro no PayPal: ' + err.message);
                }
            }).render(container);
        });
    }
}